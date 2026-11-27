-- Catégories cumulables : un niveau (1 à 5) par rôle et par formule, le plus haut l'emporte.
-- Achats multiples (user_guild_plans), rôles par défaut dans toutes les guildes, modèle de configuration.

-- 1. Colonnes
ALTER TABLE public.entity_roles ADD COLUMN IF NOT EXISTS level smallint CHECK (level IS NULL OR level BETWEEN 1 AND 5);
ALTER TABLE public.guild_membership_plans ADD COLUMN IF NOT EXISTS level smallint CHECK (level IS NULL OR level BETWEEN 1 AND 5);
ALTER TABLE public.guilds ADD COLUMN IF NOT EXISTS config_model text
  CHECK (config_model IS NULL OR config_model IN ('open', 'membranes', 'cooperative', 'custom'));
COMMENT ON COLUMN public.guilds.quest_access_levels IS 'DEPRECATED: replaced by entity_roles.level and guild_membership_plans.level';

-- 2. Une ligne par formule souscrite
CREATE TABLE IF NOT EXISTS public.user_guild_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  guild_id uuid NOT NULL REFERENCES public.guilds(id) ON DELETE CASCADE,
  plan_code text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  current_period_end timestamptz,
  membership_expires_at timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  stripe_customer_id text,
  stripe_subscription_id text,
  payer_user_id uuid,
  chosen_fee_credits integer,
  renewal_reminder_sent_for timestamptz,
  amount_paid_cents integer,
  currency text,
  last_payment_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, guild_id, plan_code)
);
CREATE INDEX IF NOT EXISTS user_guild_plans_guild_user_idx ON public.user_guild_plans (guild_id, user_id);
CREATE INDEX IF NOT EXISTS user_guild_plans_subscription_idx ON public.user_guild_plans (stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;

GRANT SELECT ON public.user_guild_plans TO authenticated;
GRANT ALL ON public.user_guild_plans TO service_role;
ALTER TABLE public.user_guild_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members and guild admins read plans" ON public.user_guild_plans
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()) OR public.is_guild_admin(guild_id, (select auth.uid())));

-- Reprise : chaque adhésion avec formule devient sa ligne de formule.
INSERT INTO public.user_guild_plans (user_id, guild_id, plan_code, status, current_period_end, membership_expires_at,
  cancel_at_period_end, stripe_customer_id, stripe_subscription_id, payer_user_id, chosen_fee_credits,
  renewal_reminder_sent_for, amount_paid_cents, currency, last_payment_at, created_at)
SELECT m.user_id, m.guild_id, m.plan_code,
  CASE WHEN m.role = 'member' THEN coalesce(m.status, 'active') WHEN m.status IN ('active', 'grace') THEN 'lapsed' ELSE coalesce(m.status, 'lapsed') END,
  m.current_period_end, m.membership_expires_at, coalesce(m.cancel_at_period_end, false), m.stripe_customer_id,
  m.stripe_subscription_id, m.payer_user_id, m.chosen_fee_credits, m.renewal_reminder_sent_for, m.amount_paid_cents,
  m.currency, m.last_payment_at, m.joined_at
FROM public.user_guild_memberships m
WHERE m.plan_code IS NOT NULL
ON CONFLICT (user_id, guild_id, plan_code) DO NOTHING;

-- 3. Formule active (délai de grâce de 7 jours compris)
CREATE OR REPLACE FUNCTION public.guild_plan_is_active(_status text, _end timestamptz)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT coalesce(_status, 'active') IN ('active', 'grace')
    AND (_end IS NULL OR _end + CASE WHEN _status = 'grace' THEN interval '7 days' ELSE interval '0' END > now())
$$;

-- 4. Niveau d'une personne dans une guilde : le plus haut de ses catégories.
CREATE OR REPLACE FUNCTION public.guild_member_level(_guild_id uuid, _user_id uuid)
RETURNS smallint LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_level int := 0;
  v_membership boolean;
BEGIN
  IF _guild_id IS NULL OR _user_id IS NULL THEN RETURN 0; END IF;
  SELECT coalesce(g.enable_membership, false) INTO v_membership FROM guilds g WHERE g.id = _guild_id;
  IF NOT FOUND THEN RETURN 0; END IF;
  IF public.is_guild_admin(_guild_id, _user_id)
     OR EXISTS (SELECT 1 FROM guilds g WHERE g.id = _guild_id AND g.created_by_user_id = _user_id) THEN
    RETURN 5;
  END IF;
  -- Rôles non expirés (attribués à toute la guilde)
  SELECT greatest(v_level, coalesce(max(er.level), 0)) INTO v_level
  FROM entity_member_roles emr JOIN entity_roles er ON er.id = emr.entity_role_id
  WHERE emr.user_id = _user_id AND er.entity_type = 'guild' AND er.entity_id = _guild_id
    AND emr.scope_type IS NULL AND (emr.expires_at IS NULL OR emr.expires_at > now());
  -- Formules actives (une formule sans niveau vaut membre en règle : 2)
  SELECT greatest(v_level, coalesce(max(coalesce(p.level, 2)), 0)) INTO v_level
  FROM user_guild_plans up
  LEFT JOIN guild_membership_plans p ON p.guild_id = up.guild_id AND p.code = up.plan_code
  WHERE up.guild_id = _guild_id AND up.user_id = _user_id
    AND public.guild_plan_is_active(up.status, coalesce(up.current_period_end, up.membership_expires_at));
  IF v_level >= 2 THEN RETURN v_level; END IF;
  -- Adhésion globale active (cotisation sans formule)
  IF EXISTS (SELECT 1 FROM user_guild_memberships m
             WHERE m.guild_id = _guild_id AND m.user_id = _user_id AND m.role = 'member'
               AND public.guild_plan_is_active(m.status, coalesce(m.current_period_end, m.membership_expires_at))) THEN
    RETURN 2;
  END IF;
  -- Membre d'une guilde sans adhésion
  IF NOT v_membership AND EXISTS (SELECT 1 FROM guild_members gm WHERE gm.guild_id = _guild_id AND gm.user_id = _user_id) THEN
    RETURN 2;
  END IF;
  -- Galaxie : suit, a rejoint sans cotiser, ou invité
  IF v_level >= 1
     OR EXISTS (SELECT 1 FROM guild_members gm WHERE gm.guild_id = _guild_id AND gm.user_id = _user_id)
     OR EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = _user_id AND upper(f.target_type) = 'GUILD' AND f.target_id = _guild_id::text)
     OR EXISTS (SELECT 1 FROM user_guild_memberships m WHERE m.guild_id = _guild_id AND m.user_id = _user_id) THEN
    RETURN 1;
  END IF;
  RETURN 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_guild_member_in_good_standing(_guild_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.guild_member_level(_guild_id, _user_id) >= 2
$$;

CREATE OR REPLACE FUNCTION public.is_guild_level_n3(_guild_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.guild_member_level(_guild_id, _user_id) >= 3
$$;

CREATE OR REPLACE FUNCTION public.quest_access_level(_quest_id uuid, _user_id uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_eff jsonb := public.quest_effective_access(_quest_id);
  v_mode text;
  v_guild uuid;
  v_need int;
BEGIN
  IF v_eff IS NULL THEN RETURN 'none'; END IF;
  v_mode := v_eff->>'mode';
  IF v_mode = 'public' THEN RETURN 'full'; END IF;
  IF _user_id IS NULL THEN RETURN 'none'; END IF;
  IF public.is_platform_superadmin(_user_id)
     OR public.is_quest_admin(_quest_id, _user_id)
     OR EXISTS (SELECT 1 FROM quest_participants p WHERE p.quest_id = _quest_id AND p.user_id = _user_id
                  AND upper(coalesce(p.status, 'ACTIVE')) IN ('ACTIVE', 'ACCEPTED', 'APPROVED', 'COMPLETED', 'INVITED'))
     OR EXISTS (SELECT 1 FROM quest_access_grants ag WHERE ag.quest_id = _quest_id AND ag.user_id = _user_id
                  AND ag.revoked_at IS NULL AND (ag.expires_at IS NULL OR ag.expires_at > now())) THEN
    RETURN 'full';
  END IF;
  IF v_mode = 'hidden' THEN RETURN 'none'; END IF;
  v_guild := nullif(v_eff->>'guild_id', '')::uuid;
  IF v_guild IS NULL THEN
    RETURN CASE WHEN public.is_quest_circle_member(_quest_id, NULL, _user_id) THEN 'teaser' ELSE 'none' END;
  END IF;
  v_need := coalesce(substring(coalesce(v_eff->>'min_level', 'N2') from 'N([1-5])')::int, 2);
  RETURN CASE WHEN public.guild_member_level(v_guild, _user_id) >= v_need THEN 'teaser' ELSE 'none' END;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.guild_member_level(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.guild_member_level(uuid, uuid) TO authenticated, service_role;

-- Reprise des codes N3 : level = 3 sur les rôles et formules cités.
UPDATE public.entity_roles er SET level = greatest(coalesce(er.level, 0), 3)
FROM public.guilds g
WHERE er.entity_type = 'guild' AND er.entity_id = g.id AND er.code IS NOT NULL
  AND er.code IN (SELECT jsonb_array_elements_text(coalesce(g.quest_access_levels->'N3'->'role_codes', '[]'::jsonb)));
UPDATE public.guild_membership_plans p SET level = greatest(coalesce(p.level, 0), 3)
FROM public.guilds g
WHERE p.guild_id = g.id
  AND p.code IN (SELECT jsonb_array_elements_text(coalesce(g.quest_access_levels->'N3'->'plan_codes', '[]'::jsonb)));

-- 5. Adhésion globale = résumé des formules (membre tant qu'au moins une formule est active)
CREATE OR REPLACE FUNCTION public.refresh_guild_membership_from_plans(_guild_id uuid, _user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  b record;
  l record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM user_guild_plans WHERE guild_id = _guild_id AND user_id = _user_id) THEN RETURN; END IF;
  SELECT up.* INTO b
  FROM user_guild_plans up LEFT JOIN guild_membership_plans p ON p.guild_id = up.guild_id AND p.code = up.plan_code
  WHERE up.guild_id = _guild_id AND up.user_id = _user_id
    AND public.guild_plan_is_active(up.status, coalesce(up.current_period_end, up.membership_expires_at))
  ORDER BY coalesce(p.level, 2) DESC, coalesce(up.current_period_end, up.membership_expires_at) DESC NULLS FIRST
  LIMIT 1;
  IF FOUND THEN
    INSERT INTO user_guild_memberships (user_id, guild_id, role, status, membership_expires_at, current_period_end,
      cancel_at_period_end, plan_code, payer_user_id, stripe_customer_id, stripe_subscription_id, chosen_fee_credits,
      renewal_reminder_sent_for, amount_paid_cents, currency, last_payment_at)
    VALUES (_user_id, _guild_id, 'member', b.status, b.membership_expires_at, b.current_period_end,
      b.cancel_at_period_end, b.plan_code, b.payer_user_id, b.stripe_customer_id, b.stripe_subscription_id, b.chosen_fee_credits,
      b.renewal_reminder_sent_for, b.amount_paid_cents, b.currency, b.last_payment_at)
    ON CONFLICT (user_id, guild_id) DO UPDATE SET
      role = 'member', status = EXCLUDED.status, membership_expires_at = EXCLUDED.membership_expires_at,
      current_period_end = EXCLUDED.current_period_end, cancel_at_period_end = EXCLUDED.cancel_at_period_end,
      plan_code = EXCLUDED.plan_code, payer_user_id = EXCLUDED.payer_user_id,
      stripe_customer_id = coalesce(EXCLUDED.stripe_customer_id, user_guild_memberships.stripe_customer_id),
      stripe_subscription_id = EXCLUDED.stripe_subscription_id, chosen_fee_credits = EXCLUDED.chosen_fee_credits,
      renewal_reminder_sent_for = EXCLUDED.renewal_reminder_sent_for, amount_paid_cents = EXCLUDED.amount_paid_cents,
      currency = EXCLUDED.currency, last_payment_at = coalesce(EXCLUDED.last_payment_at, user_guild_memberships.last_payment_at);
  ELSE
    SELECT up.* INTO l FROM user_guild_plans up
    WHERE up.guild_id = _guild_id AND up.user_id = _user_id ORDER BY up.updated_at DESC LIMIT 1;
    UPDATE user_guild_memberships m
      SET role = 'guest',
          status = CASE WHEN l.status IN ('active', 'grace') THEN 'lapsed' ELSE l.status END,
          plan_code = l.plan_code
    WHERE m.guild_id = _guild_id AND m.user_id = _user_id AND m.role = 'member' AND m.plan_code IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM guilds g WHERE g.id = _guild_id AND g.created_by_user_id = _user_id);
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.refresh_guild_membership_from_plans(uuid, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_guild_membership_from_plans(uuid, uuid) TO service_role;

-- Écriture d'une formule (par les fonctions serveur) : l'adhésion globale suit.
CREATE OR REPLACE FUNCTION public.trg_user_guild_plans_refresh()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NULL; END IF;
  IF TG_OP = 'DELETE' THEN
    PERFORM public.refresh_guild_membership_from_plans(OLD.guild_id, OLD.user_id);
  ELSE
    PERFORM public.refresh_guild_membership_from_plans(NEW.guild_id, NEW.user_id);
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS user_guild_plans_refresh ON public.user_guild_plans;
CREATE TRIGGER user_guild_plans_refresh AFTER INSERT OR UPDATE OR DELETE ON public.user_guild_plans
  FOR EACH ROW EXECUTE FUNCTION public.trg_user_guild_plans_refresh();

CREATE OR REPLACE FUNCTION public.trg_user_guild_plans_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS user_guild_plans_touch ON public.user_guild_plans;
CREATE TRIGGER user_guild_plans_touch BEFORE UPDATE ON public.user_guild_plans
  FOR EACH ROW EXECUTE FUNCTION public.trg_user_guild_plans_touch();

-- Écriture de l'adhésion avec une formule (anciens chemins serveur) : la ligne de cette formule suit.
-- Ignoré pour les écritures faites par un compte connecté (jamais de formule créée côté navigateur).
CREATE OR REPLACE FUNCTION public.trg_user_guild_membership_to_plan()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_role text := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role', '');
BEGIN
  IF pg_trigger_depth() > 1 OR NEW.plan_code IS NULL OR v_role IN ('authenticated', 'anon') THEN RETURN NULL; END IF;
  INSERT INTO user_guild_plans (user_id, guild_id, plan_code, status, current_period_end, membership_expires_at,
    cancel_at_period_end, stripe_customer_id, stripe_subscription_id, payer_user_id, chosen_fee_credits,
    renewal_reminder_sent_for, amount_paid_cents, currency, last_payment_at)
  VALUES (NEW.user_id, NEW.guild_id, NEW.plan_code,
    CASE WHEN NEW.role = 'member' THEN coalesce(NEW.status, 'active') WHEN NEW.status IN ('active', 'grace') THEN 'lapsed' ELSE coalesce(NEW.status, 'lapsed') END,
    NEW.current_period_end, NEW.membership_expires_at, coalesce(NEW.cancel_at_period_end, false), NEW.stripe_customer_id,
    NEW.stripe_subscription_id, NEW.payer_user_id, NEW.chosen_fee_credits, NEW.renewal_reminder_sent_for,
    NEW.amount_paid_cents, NEW.currency, NEW.last_payment_at)
  ON CONFLICT (user_id, guild_id, plan_code) DO UPDATE SET
    status = EXCLUDED.status, current_period_end = EXCLUDED.current_period_end,
    membership_expires_at = EXCLUDED.membership_expires_at, cancel_at_period_end = EXCLUDED.cancel_at_period_end,
    stripe_customer_id = coalesce(EXCLUDED.stripe_customer_id, user_guild_plans.stripe_customer_id),
    stripe_subscription_id = EXCLUDED.stripe_subscription_id, payer_user_id = EXCLUDED.payer_user_id,
    chosen_fee_credits = EXCLUDED.chosen_fee_credits, renewal_reminder_sent_for = EXCLUDED.renewal_reminder_sent_for,
    amount_paid_cents = EXCLUDED.amount_paid_cents, currency = EXCLUDED.currency,
    last_payment_at = coalesce(EXCLUDED.last_payment_at, user_guild_plans.last_payment_at);
  PERFORM public.refresh_guild_membership_from_plans(NEW.guild_id, NEW.user_id);
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS user_guild_membership_to_plan ON public.user_guild_memberships;
CREATE TRIGGER user_guild_membership_to_plan AFTER INSERT OR UPDATE ON public.user_guild_memberships
  FOR EACH ROW EXECUTE FUNCTION public.trg_user_guild_membership_to_plan();

-- 6. Rôles par défaut (modèle Trois-Tiers) : créés s'ils manquent, jamais dupliqués ni supprimés.
CREATE OR REPLACE FUNCTION public.ensure_guild_default_roles(_guild_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_creator uuid;
  v_source uuid;
  v_fondateur uuid;
BEGIN
  SELECT created_by_user_id INTO v_creator FROM guilds WHERE id = _guild_id;
  IF NOT FOUND THEN RETURN; END IF;

  INSERT INTO entity_roles (entity_type, entity_id, code, name, color, level, sort_order)
  SELECT 'guild', _guild_id, d.code, d.name, d.color, d.level, d.sort
  FROM (VALUES
    ('fondateur', 'Fondateur', '#f59e0b', NULL::smallint, 1),
    ('observateur', 'Observateur', '#94a3b8', 1::smallint, 10),
    ('adherent', 'Adhérent', '#22c55e', 2::smallint, 11),
    ('actif', 'Actif', '#3b82f6', 3::smallint, 12),
    ('effectif', 'Effectif', '#8b5cf6', 3::smallint, 13),
    ('partenaire', 'Partenaire', '#ec4899', 3::smallint, 14)
  ) AS d(code, name, color, level, sort)
  WHERE NOT EXISTS (SELECT 1 FROM entity_roles er WHERE er.entity_type = 'guild' AND er.entity_id = _guild_id AND er.code = d.code);

  -- Rôle déjà présent sans niveau : niveau par défaut.
  UPDATE entity_roles er SET level = d.level
  FROM (VALUES ('observateur', 1::smallint), ('adherent', 2::smallint), ('actif', 3::smallint), ('effectif', 3::smallint), ('partenaire', 3::smallint)) AS d(code, level)
  WHERE er.entity_type = 'guild' AND er.entity_id = _guild_id AND er.code = d.code AND er.level IS NULL;

  SELECT id INTO v_source FROM entity_roles WHERE entity_type = 'guild' AND entity_id = _guild_id AND is_default AND name = 'Source' LIMIT 1;
  IF v_source IS NULL THEN
    INSERT INTO entity_roles (entity_type, entity_id, name, color, is_default, sort_order)
    VALUES ('guild', _guild_id, 'Source', '#6366f1', true, 0)
    ON CONFLICT DO NOTHING RETURNING id INTO v_source;
  END IF;

  IF v_creator IS NOT NULL THEN
    SELECT id INTO v_fondateur FROM entity_roles WHERE entity_type = 'guild' AND entity_id = _guild_id AND code = 'fondateur';
    IF v_fondateur IS NOT NULL THEN
      INSERT INTO entity_member_roles (entity_role_id, user_id) VALUES (v_fondateur, v_creator) ON CONFLICT DO NOTHING;
    END IF;
    -- Source sans détenteur : elle revient au créateur.
    IF v_source IS NOT NULL AND NOT EXISTS (SELECT 1 FROM entity_member_roles WHERE entity_role_id = v_source) THEN
      INSERT INTO entity_member_roles (entity_role_id, user_id) VALUES (v_source, v_creator) ON CONFLICT DO NOTHING;
    END IF;
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.ensure_guild_default_roles(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_guild_default_roles(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.trg_guild_default_roles()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN
    PERFORM public.ensure_guild_default_roles(NEW.id);
  EXCEPTION WHEN others THEN
    RAISE WARNING 'ensure_guild_default_roles failed for %: %', NEW.id, SQLERRM;
  END;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_guild_default_roles ON public.guilds;
CREATE TRIGGER trg_guild_default_roles AFTER INSERT ON public.guilds
  FOR EACH ROW EXECUTE FUNCTION public.trg_guild_default_roles();

SELECT public.ensure_guild_default_roles(id) FROM public.guilds;

-- 7. Modèle de configuration choisi par un admin : crée ce qui manque et règle les niveaux, ne supprime rien.
CREATE OR REPLACE FUNCTION public.apply_guild_config_model(_guild_id uuid, _model text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT (public.is_guild_admin(_guild_id, v_uid) OR public.is_platform_superadmin(v_uid)) THEN
    RAISE EXCEPTION 'Only guild admins can change the guild model' USING ERRCODE = '42501';
  END IF;
  IF _model NOT IN ('open', 'membranes', 'cooperative', 'custom') THEN
    RAISE EXCEPTION 'Unknown guild model: %', _model USING ERRCODE = '22023';
  END IF;
  PERFORM public.ensure_guild_default_roles(_guild_id);
  IF _model IN ('membranes', 'cooperative') THEN
    UPDATE entity_roles er SET level = d.level
    FROM (VALUES ('observateur', 1::smallint), ('adherent', 2::smallint), ('actif', 3::smallint), ('effectif', 3::smallint), ('partenaire', 3::smallint)) AS d(code, level)
    WHERE er.entity_type = 'guild' AND er.entity_id = _guild_id AND er.code = d.code;
  END IF;
  IF _model = 'cooperative' THEN
    UPDATE guilds SET enable_membership = true WHERE id = _guild_id;
  END IF;
  UPDATE guilds SET config_model = _model WHERE id = _guild_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.apply_guild_config_model(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.apply_guild_config_model(uuid, text) TO authenticated, service_role;

-- 8. Trois-Tiers : niveaux des formules et des rôles.
UPDATE public.guild_membership_plans SET level = 2
WHERE guild_id = '4964c699-4684-43a9-b508-cee21c77e24e' AND code IN ('citoyen', 'lieu_moins_20', 'lieu_20_et_plus');
UPDATE public.guild_membership_plans SET level = 3
WHERE guild_id = '4964c699-4684-43a9-b508-cee21c77e24e'
  AND code IN ('accompagnant_freelance', 'accompagnant_organisation', 'partenaire_allie', 'partenaire_beneficiaire');
UPDATE public.guilds SET config_model = 'membranes' WHERE id = '4964c699-4684-43a9-b508-cee21c77e24e' AND config_model IS NULL;
