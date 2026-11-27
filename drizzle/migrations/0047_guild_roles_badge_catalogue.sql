
ALTER TABLE public.entity_roles ADD COLUMN IF NOT EXISTS requires_dues boolean NOT NULL DEFAULT false;
ALTER TABLE public.guild_membership_plans ALTER COLUMN badge_codes SET DEFAULT '{}'::text[];

-- Archives
CREATE TABLE IF NOT EXISTS public.entity_roles_archive (
  archive_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id uuid NOT NULL, entity_type text, entity_id uuid, name text, color text, is_default boolean,
  sort_order integer, created_at timestamptz, code text, level smallint, requires_dues boolean,
  archived_at timestamptz NOT NULL DEFAULT now(), archive_reason text
);
CREATE TABLE IF NOT EXISTS public.entity_member_roles_archive (
  archive_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id uuid NOT NULL, entity_role_id uuid, user_id uuid, created_at timestamptz, expires_at timestamptz,
  scope_type text, scope_id uuid, archived_at timestamptz NOT NULL DEFAULT now(), archive_reason text
);
GRANT SELECT ON public.entity_roles_archive, public.entity_member_roles_archive TO authenticated;
GRANT ALL ON public.entity_roles_archive, public.entity_member_roles_archive TO service_role;
ALTER TABLE public.entity_roles_archive ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entity_member_roles_archive ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Superadmins read role archive" ON public.entity_roles_archive FOR SELECT TO authenticated
  USING (public.is_platform_superadmin((select auth.uid())));
CREATE POLICY "Superadmins read role assignment archive" ON public.entity_member_roles_archive FOR SELECT TO authenticated
  USING (public.is_platform_superadmin((select auth.uid())));

-- Cotisation en ordre
CREATE OR REPLACE FUNCTION public.guild_dues_in_order(_guild_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM user_guild_plans up WHERE up.guild_id = _guild_id AND up.user_id = _user_id
      AND public.guild_plan_is_active(up.status, coalesce(up.current_period_end, up.membership_expires_at)))
  OR EXISTS (SELECT 1 FROM user_guild_memberships m WHERE m.guild_id = _guild_id AND m.user_id = _user_id
      AND m.role = 'member' AND (m.plan_code IS NOT NULL OR m.last_payment_at IS NOT NULL)
      AND public.guild_plan_is_active(m.status, coalesce(m.current_period_end, m.membership_expires_at)))
$$;
GRANT EXECUTE ON FUNCTION public.guild_dues_in_order(uuid, uuid) TO authenticated, service_role;

-- Catalogue
CREATE OR REPLACE FUNCTION public.ensure_guild_default_roles(_guild_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_creator uuid; v_source uuid;
BEGIN
  SELECT created_by_user_id INTO v_creator FROM guilds WHERE id = _guild_id;
  IF NOT FOUND THEN RETURN; END IF;
  INSERT INTO entity_roles (entity_type, entity_id, code, name, color, level, requires_dues, sort_order)
  SELECT 'guild', _guild_id, d.code, d.name, d.color, d.level, d.dues, d.sort
  FROM (VALUES
    ('observateur', 'Observateur', '#94a3b8', 1::smallint, false, 10),
    ('citoyen_soutenant', 'Citoyen soutenant', '#22c55e', 2::smallint, true, 11),
    ('membre_sympathisant', 'Membre sympathisant', '#10b981', 2::smallint, true, 12),
    ('membre_lieu', 'Membre lieu', '#14b8a6', 3::smallint, true, 13),
    ('accompagnant', 'Accompagnant', '#0ea5e9', 3::smallint, true, 14),
    ('allie', 'Allié', '#ec4899', 3::smallint, true, 15),
    ('partenaire_territorial', 'Partenaire territorial', '#f97316', 3::smallint, true, 16),
    ('actif', 'Actif', '#3b82f6', 3::smallint, true, 17),
    ('effectif', 'Effectif', '#8b5cf6', 3::smallint, true, 18)
  ) AS d(code, name, color, level, dues, sort)
  WHERE NOT EXISTS (SELECT 1 FROM entity_roles er WHERE er.entity_type = 'guild' AND er.entity_id = _guild_id AND er.code = d.code);

  SELECT id INTO v_source FROM entity_roles WHERE entity_type = 'guild' AND entity_id = _guild_id
    AND (code = 'source' OR (is_default AND name = 'Source')) ORDER BY (code = 'source') DESC NULLS LAST LIMIT 1;
  IF v_source IS NULL THEN
    INSERT INTO entity_roles (entity_type, entity_id, code, name, color, is_default, sort_order)
    VALUES ('guild', _guild_id, 'source', 'Source', '#6366f1', true, 0)
    ON CONFLICT DO NOTHING RETURNING id INTO v_source;
  ELSE
    UPDATE entity_roles SET code = 'source' WHERE id = v_source AND code IS NULL
      AND NOT EXISTS (SELECT 1 FROM entity_roles o WHERE o.entity_type = 'guild' AND o.entity_id = _guild_id AND o.code = 'source');
  END IF;
  IF v_creator IS NOT NULL AND v_source IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM entity_member_roles WHERE entity_role_id = v_source) THEN
    INSERT INTO entity_member_roles (entity_role_id, user_id) VALUES (v_source, v_creator) ON CONFLICT DO NOTHING;
  END IF;
END; $$;

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
    UPDATE entity_roles er SET level = d.level, requires_dues = d.dues
    FROM (VALUES ('observateur', 1::smallint, false), ('citoyen_soutenant', 2::smallint, true), ('membre_sympathisant', 2::smallint, true),
      ('membre_lieu', 3::smallint, true), ('accompagnant', 3::smallint, true), ('allie', 3::smallint, true),
      ('partenaire_territorial', 3::smallint, true), ('actif', 3::smallint, true), ('effectif', 3::smallint, true)) AS d(code, level, dues)
    WHERE er.entity_type = 'guild' AND er.entity_id = _guild_id AND er.code = d.code;
  END IF;
  IF _model = 'cooperative' THEN UPDATE guilds SET enable_membership = true WHERE id = _guild_id; END IF;
  UPDATE guilds SET config_model = _model WHERE id = _guild_id;
END; $$;

DO $$ DECLARE g record; BEGIN
  FOR g IN SELECT id FROM guilds LOOP PERFORM public.ensure_guild_default_roles(g.id); END LOOP;
END $$;

-- Formules Trois-Tiers -> catégories
UPDATE guild_membership_plans p SET badge_codes = d.badges, level = d.level
FROM (VALUES ('citoyen', ARRAY['citoyen_soutenant'], 2::smallint),
  ('lieu_moins_20', ARRAY['membre_lieu'], 3::smallint), ('lieu_20_et_plus', ARRAY['membre_lieu'], 3::smallint),
  ('accompagnant_freelance', ARRAY['accompagnant'], 3::smallint), ('accompagnant_organisation', ARRAY['accompagnant'], 3::smallint),
  ('partenaire_allie', ARRAY['allie'], 3::smallint), ('partenaire_beneficiaire', ARRAY['partenaire_territorial'], 3::smallint)) AS d(code, badges, level)
WHERE p.guild_id = '4964c699-4684-43a9-b508-cee21c77e24e' AND p.code = d.code;
UPDATE guild_membership_plans SET badge_codes = array_remove(badge_codes, 'adherent') WHERE 'adherent' = ANY(badge_codes);

-- Rôles à supprimer
CREATE TEMP TABLE _doomed ON COMMIT DROP AS
SELECT er.id FROM entity_roles er WHERE er.entity_type = 'guild' AND (
  (er.entity_id = '4964c699-4684-43a9-b508-cee21c77e24e'
    AND coalesce(er.code, '') NOT IN ('observateur','citoyen_soutenant','membre_sympathisant','membre_lieu','accompagnant','allie','partenaire_territorial','actif','effectif','source')
    AND NOT (er.is_default AND er.name = 'Source'))
  OR er.code IN ('adherent', 'partenaire', 'fondateur'));

INSERT INTO entity_roles_archive (id, entity_type, entity_id, name, color, is_default, sort_order, created_at, code, level, requires_dues, archive_reason)
SELECT id, entity_type, entity_id, name, color, is_default, sort_order, created_at, code, level, requires_dues, 'chantier catalogue badges'
FROM entity_roles WHERE id IN (SELECT id FROM _doomed);
INSERT INTO entity_member_roles_archive (id, entity_role_id, user_id, created_at, expires_at, scope_type, scope_id, archive_reason)
SELECT id, entity_role_id, user_id, created_at, expires_at, scope_type, scope_id, 'chantier catalogue badges'
FROM entity_member_roles WHERE entity_role_id IN (SELECT id FROM _doomed);

-- Catégories des formules actives (remplace « adherent » / « partenaire »)
INSERT INTO entity_member_roles (entity_role_id, user_id, expires_at)
SELECT DISTINCT ON (er.id, up.user_id) er.id, up.user_id, coalesce(up.current_period_end, up.membership_expires_at)
FROM user_guild_plans up
JOIN guild_membership_plans p ON p.guild_id = up.guild_id AND p.code = up.plan_code
JOIN entity_roles er ON er.entity_type = 'guild' AND er.entity_id = up.guild_id AND er.code = ANY(p.badge_codes)
WHERE public.guild_plan_is_active(up.status, coalesce(up.current_period_end, up.membership_expires_at))
ORDER BY er.id, up.user_id, coalesce(up.current_period_end, up.membership_expires_at) DESC NULLS FIRST
ON CONFLICT (entity_role_id, user_id) DO UPDATE SET expires_at = EXCLUDED.expires_at;

DELETE FROM entity_member_roles WHERE entity_role_id IN (SELECT id FROM _doomed);
DELETE FROM entity_roles WHERE id IN (SELECT id FROM _doomed);

-- Attribution manuelle : cotisation requise
CREATE OR REPLACE FUNCTION public.enforce_role_dues()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  IF coalesce(auth.role(), '') <> 'authenticated' THEN RETURN NEW; END IF;
  SELECT entity_type, entity_id, code, requires_dues INTO r FROM entity_roles WHERE id = NEW.entity_role_id;
  IF r.entity_type <> 'guild' THEN RETURN NEW; END IF;
  IF r.code = 'actif' AND NEW.expires_at IS NULL THEN
    RAISE EXCEPTION 'Le rôle Actif exige une date de fin' USING ERRCODE = '23514';
  END IF;
  IF r.requires_dues AND NOT public.guild_dues_in_order(r.entity_id, NEW.user_id) THEN
    RAISE EXCEPTION 'Cotisation requise : cette personne n''a pas de cotisation en ordre' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_enforce_role_dues ON public.entity_member_roles;
CREATE TRIGGER trg_enforce_role_dues BEFORE INSERT OR UPDATE ON public.entity_member_roles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_role_dues();

-- Niveau : une catégorie à cotisation requise ne compte que si la cotisation est en ordre
CREATE OR REPLACE FUNCTION public.guild_member_level(_guild_id uuid, _user_id uuid)
RETURNS smallint LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_level int := 0; v_membership boolean; v_dues boolean;
BEGIN
  IF _guild_id IS NULL OR _user_id IS NULL THEN RETURN 0; END IF;
  SELECT coalesce(g.enable_membership, false) INTO v_membership FROM guilds g WHERE g.id = _guild_id;
  IF NOT FOUND THEN RETURN 0; END IF;
  IF public.is_guild_admin(_guild_id, _user_id)
     OR EXISTS (SELECT 1 FROM guilds g WHERE g.id = _guild_id AND g.created_by_user_id = _user_id) THEN
    RETURN 5;
  END IF;
  v_dues := public.guild_dues_in_order(_guild_id, _user_id);
  SELECT greatest(v_level, coalesce(max(least(er.level, 3)), 0)) INTO v_level
  FROM entity_member_roles emr JOIN entity_roles er ON er.id = emr.entity_role_id
  WHERE emr.user_id = _user_id AND er.entity_type = 'guild' AND er.entity_id = _guild_id
    AND emr.scope_type IS NULL AND (emr.expires_at IS NULL OR emr.expires_at > now())
    AND (NOT er.requires_dues OR v_dues);
  SELECT greatest(v_level, coalesce(max(least(coalesce(p.level, 2), 3)), 0)) INTO v_level
  FROM user_guild_plans up
  LEFT JOIN guild_membership_plans p ON p.guild_id = up.guild_id AND p.code = up.plan_code
  WHERE up.guild_id = _guild_id AND up.user_id = _user_id
    AND public.guild_plan_is_active(up.status, coalesce(up.current_period_end, up.membership_expires_at));
  IF v_level >= 2 THEN RETURN v_level; END IF;
  IF EXISTS (SELECT 1 FROM user_guild_memberships m
             WHERE m.guild_id = _guild_id AND m.user_id = _user_id AND m.role = 'member'
               AND public.guild_plan_is_active(m.status, coalesce(m.current_period_end, m.membership_expires_at))) THEN
    RETURN 2;
  END IF;
  IF NOT v_membership AND EXISTS (SELECT 1 FROM guild_members gm WHERE gm.guild_id = _guild_id AND gm.user_id = _user_id) THEN
    RETURN 2;
  END IF;
  IF v_level >= 1
     OR EXISTS (SELECT 1 FROM guild_members gm WHERE gm.guild_id = _guild_id AND gm.user_id = _user_id)
     OR EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = _user_id AND upper(f.target_type) = 'GUILD' AND f.target_id = _guild_id::text)
     OR EXISTS (SELECT 1 FROM user_guild_memberships m WHERE m.guild_id = _guild_id AND m.user_id = _user_id) THEN
    RETURN 1;
  END IF;
  RETURN 0;
END; $$;

NOTIFY pgrst, 'reload schema';
