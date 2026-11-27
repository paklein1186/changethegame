-- Accès aux quêtes : alignement sur le contrat commun avec le site Trois-Tiers
-- (troistiers-site, docs/quetes/visibilite.md). Complète 20261127200000_quest_access.sql.
-- Version appliquée : les anciennes colonnes sont marquées DEPRECATED au lieu d'être supprimées.

ALTER TABLE public.quests ADD COLUMN IF NOT EXISTS access_min_level text NOT NULL DEFAULT 'N2';
ALTER TABLE public.quests DROP CONSTRAINT IF EXISTS quests_access_min_level_check;
ALTER TABLE public.quests ADD CONSTRAINT quests_access_min_level_check CHECK (access_min_level IN ('N2', 'N3'));
ALTER TABLE public.guilds ADD COLUMN IF NOT EXISTS quest_access_min_level text NOT NULL DEFAULT 'N2';
ALTER TABLE public.guilds DROP CONSTRAINT IF EXISTS guilds_quest_access_min_level_check;
ALTER TABLE public.guilds ADD CONSTRAINT guilds_quest_access_min_level_check CHECK (quest_access_min_level IN ('N2', 'N3'));
ALTER TABLE public.guilds ADD COLUMN IF NOT EXISTS quest_access_levels jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.quests SET access_mode = 'members', access_min_level = 'N3' WHERE access_mode = 'selected';
UPDATE public.guilds SET quest_access_default = 'members', quest_access_min_level = 'N3' WHERE quest_access_default = 'selected';
ALTER TABLE public.quests DROP CONSTRAINT IF EXISTS quests_access_mode_check;
ALTER TABLE public.quests ADD CONSTRAINT quests_access_mode_check CHECK (access_mode IN ('inherit', 'public', 'members', 'hidden'));
ALTER TABLE public.guilds DROP CONSTRAINT IF EXISTS guilds_quest_access_default_check;
ALTER TABLE public.guilds ADD CONSTRAINT guilds_quest_access_default_check CHECK (quest_access_default IN ('public', 'members', 'hidden'));

ALTER TABLE public.quest_access_grants ADD COLUMN IF NOT EXISTS expires_at timestamptz;

DROP FUNCTION IF EXISTS public.set_quest_access(uuid, text, text[], uuid[]);
DROP FUNCTION IF EXISTS public.set_guild_quest_access_default(uuid, text, text[], uuid[]);

CREATE OR REPLACE FUNCTION public.quest_effective_access(_quest_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  q record;
  g record;
  v_guild uuid := public.quest_primary_guild(_quest_id);
BEGIN
  SELECT access_mode, access_min_level INTO q FROM quests WHERE id = _quest_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF q.access_mode <> 'inherit' THEN
    RETURN jsonb_build_object('mode', q.access_mode, 'min_level', q.access_min_level, 'inherited', false, 'guild_id', v_guild);
  END IF;
  IF v_guild IS NOT NULL THEN
    SELECT quest_access_default, quest_access_min_level INTO g FROM guilds WHERE id = v_guild;
    IF FOUND THEN
      RETURN jsonb_build_object('mode', g.quest_access_default, 'min_level', g.quest_access_min_level, 'inherited', true, 'guild_id', v_guild);
    END IF;
  END IF;
  RETURN jsonb_build_object('mode', 'public', 'min_level', 'N2', 'inherited', true, 'guild_id', v_guild);
END;
$$;

COMMENT ON COLUMN public.quests.access_plans IS 'DEPRECATED: replaced by access_min_level + guilds.quest_access_levels';
COMMENT ON COLUMN public.quests.access_role_ids IS 'DEPRECATED: replaced by access_min_level + guilds.quest_access_levels';
COMMENT ON COLUMN public.guilds.quest_access_plans IS 'DEPRECATED: replaced by quest_access_min_level + quest_access_levels';
COMMENT ON COLUMN public.guilds.quest_access_role_ids IS 'DEPRECATED: replaced by quest_access_min_level + quest_access_levels';

CREATE OR REPLACE FUNCTION public.is_guild_level_n3(_guild_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH t AS (SELECT coalesce(quest_access_levels->'N3', '{}'::jsonb) AS n3 FROM public.guilds WHERE id = _guild_id)
  SELECT _user_id IS NOT NULL AND (
    public.is_guild_admin(_guild_id, _user_id)
    OR EXISTS (
      SELECT 1 FROM t, public.entity_member_roles emr JOIN public.entity_roles er ON er.id = emr.entity_role_id
      WHERE emr.user_id = _user_id AND er.entity_type = 'guild' AND er.entity_id = _guild_id
        AND (emr.expires_at IS NULL OR emr.expires_at > now())
        AND er.code IS NOT NULL AND er.code IN (SELECT jsonb_array_elements_text(coalesce(t.n3->'role_codes', '[]'::jsonb))))
    OR EXISTS (
      SELECT 1 FROM t, public.user_guild_memberships m
      WHERE m.guild_id = _guild_id AND m.user_id = _user_id AND m.role = 'member'
        AND coalesce(m.status, 'active') IN ('active', 'grace')
        AND (coalesce(m.current_period_end, m.membership_expires_at) IS NULL
             OR coalesce(m.current_period_end, m.membership_expires_at)
                + CASE WHEN m.status = 'grace' THEN interval '7 days' ELSE interval '0' END > now())
        AND m.plan_code IN (SELECT jsonb_array_elements_text(coalesce(t.n3->'plan_codes', '[]'::jsonb))))
  )
$$;

CREATE OR REPLACE FUNCTION public.quest_access_level(_quest_id uuid, _user_id uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_eff jsonb := public.quest_effective_access(_quest_id);
  v_mode text;
  v_guild uuid;
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
  IF (v_eff->>'min_level') = 'N3' THEN
    RETURN CASE WHEN public.is_guild_level_n3(v_guild, _user_id) THEN 'teaser' ELSE 'none' END;
  END IF;
  RETURN CASE WHEN public.is_guild_member_in_good_standing(v_guild, _user_id) THEN 'teaser' ELSE 'none' END;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_quest_access(p_quest_id uuid, p_mode text, p_min_level text DEFAULT 'N2')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.is_quest_admin(p_quest_id, auth.uid()) OR public.is_platform_superadmin(auth.uid())) THEN
    RAISE EXCEPTION 'Only the quest admins can change who sees it' USING ERRCODE = '42501';
  END IF;
  IF p_mode NOT IN ('inherit', 'public', 'members', 'hidden') THEN RAISE EXCEPTION 'Invalid access mode'; END IF;
  IF coalesce(p_min_level, 'N2') NOT IN ('N2', 'N3') THEN RAISE EXCEPTION 'Invalid level'; END IF;
  UPDATE quests SET access_mode = p_mode, access_min_level = coalesce(p_min_level, 'N2'), updated_at = now() WHERE id = p_quest_id;
  RETURN public.quest_effective_access(p_quest_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_guild_quest_access_default(p_guild_id uuid, p_mode text, p_min_level text DEFAULT 'N2')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.is_guild_admin(p_guild_id, auth.uid()) OR public.is_platform_superadmin(auth.uid())) THEN
    RAISE EXCEPTION 'Only guild admins can change this' USING ERRCODE = '42501';
  END IF;
  IF p_mode NOT IN ('public', 'members', 'hidden') THEN RAISE EXCEPTION 'Invalid access mode'; END IF;
  IF coalesce(p_min_level, 'N2') NOT IN ('N2', 'N3') THEN RAISE EXCEPTION 'Invalid level'; END IF;
  UPDATE guilds SET quest_access_default = p_mode, quest_access_min_level = coalesce(p_min_level, 'N2') WHERE id = p_guild_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_guild_quest_access_levels(p_guild_id uuid, p_role_codes text[], p_plan_codes text[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  IF NOT (public.is_guild_admin(p_guild_id, auth.uid()) OR public.is_platform_superadmin(auth.uid())) THEN
    RAISE EXCEPTION 'Only guild admins can change this' USING ERRCODE = '42501';
  END IF;
  v := jsonb_build_object('N3', jsonb_build_object(
    'role_codes', to_jsonb(ARRAY(SELECT DISTINCT c FROM unnest(coalesce(p_role_codes, '{}')) c WHERE c ~ '^[a-z0-9_-]{1,60}$' ORDER BY c)),
    'plan_codes', to_jsonb(ARRAY(SELECT DISTINCT c FROM unnest(coalesce(p_plan_codes, '{}')) c WHERE c ~ '^[a-z0-9_]{1,60}$' ORDER BY c))));
  UPDATE guilds SET quest_access_levels = v WHERE id = p_guild_id;
  RETURN v;
END;
$$;

DROP FUNCTION IF EXISTS public.grant_quest_access(uuid, uuid, text);
CREATE OR REPLACE FUNCTION public.grant_quest_access(p_quest_id uuid, p_user_id uuid, p_note text DEFAULT NULL, p_expires_at timestamptz DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_title text;
BEGIN
  IF NOT (public.is_quest_admin(p_quest_id, auth.uid()) OR public.is_platform_superadmin(auth.uid())) THEN
    RAISE EXCEPTION 'Only the quest admins can grant access' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE user_id = p_user_id) THEN RAISE EXCEPTION 'Person not found'; END IF;
  IF p_expires_at IS NOT NULL AND p_expires_at <= now() THEN RAISE EXCEPTION 'The end date is in the past'; END IF;
  UPDATE quest_access_grants SET revoked_at = now(), revoked_by = auth.uid()
   WHERE quest_id = p_quest_id AND user_id = p_user_id AND revoked_at IS NULL AND expires_at IS NOT NULL AND expires_at <= now();
  SELECT id INTO v_id FROM quest_access_grants WHERE quest_id = p_quest_id AND user_id = p_user_id AND revoked_at IS NULL;
  IF v_id IS NULL THEN
    INSERT INTO quest_access_grants (quest_id, user_id, granted_by, note, expires_at)
    VALUES (p_quest_id, p_user_id, auth.uid(), nullif(btrim(coalesce(p_note, '')), ''), p_expires_at)
    RETURNING id INTO v_id;
  ELSE
    UPDATE quest_access_grants SET expires_at = p_expires_at WHERE id = v_id;
  END IF;
  UPDATE quest_access_requests SET status = 'approved', decided_at = now(), decided_by = auth.uid()
   WHERE quest_id = p_quest_id AND user_id = p_user_id AND status = 'pending';
  SELECT title INTO v_title FROM quests WHERE id = p_quest_id;
  PERFORM public.notify_quest_access(ARRAY[p_user_id], 'QUEST_ACCESS_GRANTED', 'Accès accordé',
    'Vous avez maintenant accès à « ' || coalesce(v_title, 'la quête') || ' »'
      || CASE WHEN p_expires_at IS NOT NULL THEN ' jusqu''au ' || to_char(p_expires_at, 'DD/MM/YYYY') ELSE '' END || '.',
    p_quest_id, '/quests/' || p_quest_id);
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.quest_access_admin_view(p_quest_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.is_quest_admin(p_quest_id, auth.uid()) OR public.is_platform_superadmin(auth.uid())) THEN
    RAISE EXCEPTION 'Only the quest admins can see this' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'requests', coalesce((SELECT jsonb_agg(jsonb_build_object('id', r.id, 'user_id', r.user_id, 'name', p.name,
                  'avatar_url', p.avatar_url, 'message', r.message, 'created_at', r.created_at) ORDER BY r.created_at)
                FROM quest_access_requests r LEFT JOIN profiles p ON p.user_id = r.user_id
                WHERE r.quest_id = p_quest_id AND r.status = 'pending'), '[]'::jsonb),
    'grants', coalesce((SELECT jsonb_agg(jsonb_build_object('id', g.id, 'user_id', g.user_id, 'name', p.name,
                  'avatar_url', p.avatar_url, 'note', g.note, 'created_at', g.created_at, 'expires_at', g.expires_at)
                  ORDER BY g.created_at DESC)
                FROM quest_access_grants g LEFT JOIN profiles p ON p.user_id = g.user_id
                WHERE g.quest_id = p_quest_id AND g.revoked_at IS NULL
                  AND (g.expires_at IS NULL OR g.expires_at > now())), '[]'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION public.quest_access_enforced()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog AS $$
  SELECT EXISTS (
    SELECT 1 FROM pg_policy pol JOIN pg_class c ON c.oid = pol.polrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'quests' AND c.relrowsecurity
      AND NOT pol.polpermissive AND pol.polcmd IN ('r', '*')
      AND pg_get_expr(pol.polqual, pol.polrelid) ILIKE '%can_view_quest%')
$$;

CREATE OR REPLACE FUNCTION public.external_quest_access(p_user_id uuid, p_guild_id uuid, p_source text)
RETURNS TABLE (quest_id uuid, niveau text, accorde_par uuid, accorde_le timestamptz, expire_le timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH linked AS (
    SELECT l.quest_id FROM quest_external_links l JOIN quests q ON q.id = l.quest_id
    WHERE l.source = p_source AND q.guild_id = p_guild_id AND q.is_deleted = false
  ),
  rows AS (
    SELECT p.quest_id,
           CASE WHEN upper(coalesce(p.role::text, '')) IN ('ADMIN', 'OWNER', 'HOST', 'CO_HOST') THEN 'admin' ELSE 'equipe' END AS niveau,
           NULL::uuid AS accorde_par, p.created_at AS accorde_le, NULL::timestamptz AS expire_le
    FROM quest_participants p
    WHERE p.user_id = p_user_id AND p.quest_id IN (SELECT quest_id FROM linked)
      AND upper(coalesce(p.status, 'ACTIVE')) IN ('ACTIVE', 'ACCEPTED', 'APPROVED', 'COMPLETED')
    UNION ALL
    SELECT g.quest_id, 'lecture', g.granted_by, g.created_at, g.expires_at
    FROM quest_access_grants g
    WHERE g.user_id = p_user_id AND g.quest_id IN (SELECT quest_id FROM linked)
      AND g.revoked_at IS NULL AND (g.expires_at IS NULL OR g.expires_at > now())
  )
  SELECT DISTINCT ON (r.quest_id) r.quest_id, r.niveau, r.accorde_par, r.accorde_le, r.expire_le
  FROM rows r
  ORDER BY r.quest_id, CASE r.niveau WHEN 'admin' THEN 0 WHEN 'equipe' THEN 1 ELSE 2 END
$$;

REVOKE ALL ON FUNCTION public.set_quest_access(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_guild_quest_access_default(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_guild_quest_access_levels(uuid, text[], text[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.grant_quest_access(uuid, uuid, text, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.external_quest_access(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_quest_access(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_guild_quest_access_default(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_guild_quest_access_levels(uuid, text[], text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.grant_quest_access(uuid, uuid, text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.external_quest_access(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.quest_access_enforced() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_guild_level_n3(uuid, uuid) TO authenticated, service_role;
