-- Salle d'attente des missions d'un site partenaire (Trois-Tiers, décision de PA du 28/11).
-- Une nouvelle mission semi-sensible du site arrive comme quête BROUILLON de la guilde (visible des seuls admins),
-- marquée « en attente de validation » ; les admins de la guilde sont notifiés et décident ici (onglet Travail) ou sur
-- le site : valider (la quête est publiée, réservée aux membres selon son niveau) ou garder privé (elle reste brouillon).
-- Le site relit la décision. Rien n'est publié sans décision humaine.

ALTER TABLE public.quest_external_links
  ADD COLUMN IF NOT EXISTS pending_validation boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS decision text CHECK (decision IN ('validated', 'private')),
  ADD COLUMN IF NOT EXISTS decided_by uuid,
  ADD COLUMN IF NOT EXISTS decided_at timestamptz;

-- Missions en attente de la guilde (admins de la guilde seulement).
CREATE OR REPLACE FUNCTION public.guild_pending_site_quests(_guild_id uuid)
RETURNS TABLE (quest_id uuid, title text, description text, access_min_level text, website_url text, source text, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_guild_admin(_guild_id, auth.uid()) THEN RETURN; END IF;
  RETURN QUERY
  SELECT q.id, q.title, q.description, q.access_min_level::text, q.website_url, l.source, l.created_at
  FROM quest_external_links l JOIN quests q ON q.id = l.quest_id
  WHERE q.guild_id = _guild_id AND l.pending_validation AND l.decision IS NULL AND NOT q.is_deleted
  ORDER BY l.created_at;
END;
$$;
REVOKE ALL ON FUNCTION public.guild_pending_site_quests(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guild_pending_site_quests(uuid) TO authenticated, service_role;

-- Décider : 'validated' publie la quête (elle garde son niveau d'accès), 'private' la laisse en brouillon.
CREATE OR REPLACE FUNCTION public.decide_site_quest(_quest_id uuid, _decision text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  q record;
BEGIN
  IF _decision NOT IN ('validated', 'private') THEN RAISE EXCEPTION 'Invalid decision' USING ERRCODE = '22023'; END IF;
  SELECT qq.id, qq.guild_id INTO q FROM quests qq WHERE qq.id = _quest_id AND NOT qq.is_deleted;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quest not found' USING ERRCODE = 'P0002'; END IF;
  IF v_uid IS NULL OR NOT public.is_guild_admin(q.guild_id, v_uid) THEN
    RAISE EXCEPTION 'Only guild admins can decide' USING ERRCODE = '42501';
  END IF;
  UPDATE quest_external_links SET pending_validation = false, decision = _decision, decided_by = v_uid, decided_at = now(),
         updated_at = now()
  WHERE quest_id = _quest_id AND pending_validation AND decision IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Nothing pending for this quest' USING ERRCODE = 'P0001'; END IF;
  IF _decision = 'validated' THEN
    UPDATE quests SET is_draft = false, updated_at = now() WHERE id = _quest_id;
  END IF;
  RETURN _decision;
END;
$$;
REVOKE ALL ON FUNCTION public.decide_site_quest(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_site_quest(uuid, text) TO authenticated, service_role;
