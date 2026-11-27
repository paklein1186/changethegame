-- Correctif de guild_activity (20261127230000) : comments.target_id est en texte, feed_posts.id en uuid.
-- La jointure des réponses sur leur message échouait à l'exécution (« operator does not exist: uuid = text »),
-- ce qu'une fonction PL/pgSQL ne révèle qu'à l'appel. Seule cette jointure change.

CREATE OR REPLACE FUNCTION public.guild_activity(
  p_guild_id uuid,
  p_since timestamptz,
  p_until timestamptz DEFAULT now(),
  p_cap integer DEFAULT 100
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_cap integer := LEAST(GREATEST(coalesce(p_cap, 100), 1), 200);
  v_base text := 'https://changethegame.xyz';
  v_quests uuid[];
  v_rooms uuid[];
  v_out jsonb;
BEGIN
  IF p_since IS NULL OR p_until IS NULL OR p_until <= p_since THEN RAISE EXCEPTION 'Invalid window'; END IF;
  IF p_until - p_since > interval '31 days' THEN RAISE EXCEPTION 'Window too long: 31 days at most per call'; END IF;
  -- Une personne connectée : membre ou admin de la guilde. Sans personne : seulement le rôle de service.
  IF v_uid IS NULL THEN
    IF current_user NOT IN ('service_role', 'postgres', 'supabase_admin') THEN
      RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
    END IF;
  ELSIF NOT (public.is_guild_admin(p_guild_id, v_uid) OR public.is_platform_superadmin(v_uid)
             OR EXISTS (SELECT 1 FROM guild_members gm WHERE gm.guild_id = p_guild_id AND gm.user_id = v_uid)
             OR public.is_guild_member_in_good_standing(p_guild_id, v_uid)) THEN
    RAISE EXCEPTION 'Only members of this guild can follow its activity' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(array_agg(DISTINCT x.id), '{}') INTO v_quests FROM (
    SELECT q.id FROM quests q WHERE q.guild_id = p_guild_id AND q.is_deleted = false
    UNION SELECT h.quest_id FROM quest_hosts h JOIN quests q ON q.id = h.quest_id
      WHERE h.entity_id = p_guild_id AND upper(h.entity_type) = 'GUILD' AND q.is_deleted = false) x;
  SELECT coalesce(array_agg(r.id), '{}') INTO v_rooms FROM discussion_rooms r WHERE r.scope_type = 'GUILD' AND r.scope_id = p_guild_id;

  WITH
  qt AS (SELECT q.id, q.title FROM quests q WHERE q.id = ANY (v_quests)),
  link AS (SELECT l.quest_id, jsonb_build_object('source', l.source, 'projet_id', l.external_id) AS lp
           FROM quest_external_links l WHERE l.quest_id = ANY (v_quests)),
  posts AS (
    SELECT p.*, row_number() OVER (ORDER BY p.created_at) AS rn FROM feed_posts p
    WHERE p.is_deleted = false AND p.created_at >= p_since AND p.created_at < p_until
      AND ((p.context_type IN ('GUILD', 'GUILD_DISCUSSION', 'guild') AND p.context_id = p_guild_id)
        OR p.room_id = ANY (v_rooms)
        OR (p.context_type IN ('QUEST', 'QUEST_DISCUSSION') AND p.context_id = ANY (v_quests)))
  ),
  replies AS (
    SELECT c.*, p.context_type AS p_ctx, p.context_id AS p_ctx_id, p.room_id AS p_room,
           row_number() OVER (ORDER BY c.created_at) AS rn
    FROM comments c JOIN feed_posts p ON p.id::text = c.target_id
    WHERE upper(c.target_type) = 'FEED_POST' AND c.is_deleted = false AND c.created_at >= p_since AND c.created_at < p_until
      AND ((p.context_type IN ('GUILD', 'GUILD_DISCUSSION', 'guild') AND p.context_id = p_guild_id)
        OR p.room_id = ANY (v_rooms)
        OR (p.context_type IN ('QUEST', 'QUEST_DISCUSSION') AND p.context_id = ANY (v_quests)))
  ),
  polls AS (
    SELECT d.*, row_number() OVER (ORDER BY d.updated_at) AS rn FROM decision_polls d
    WHERE d.updated_at >= p_since AND d.updated_at < p_until
      AND ((d.entity_type = 'guild' AND d.entity_id = p_guild_id) OR (d.entity_type = 'quest' AND d.entity_id = ANY (v_quests)))
  ),
  quest_rows AS (
    SELECT q.*, row_number() OVER (ORDER BY q.updated_at) AS rn FROM quests q
    WHERE q.id = ANY (v_quests) AND q.updated_at >= p_since AND q.updated_at < p_until
  ),
  news AS (
    SELECT u.*, row_number() OVER (ORDER BY u.created_at) AS rn FROM quest_updates u
    WHERE u.quest_id = ANY (v_quests) AND u.is_deleted = false AND coalesce(u.is_draft, false) = false
      AND u.created_at >= p_since AND u.created_at < p_until
  ),
  needs AS (
    SELECT n.*, row_number() OVER (ORDER BY n.created_at) AS rn FROM quest_needs n
    WHERE n.quest_id = ANY (v_quests) AND n.created_at >= p_since AND n.created_at < p_until
  ),
  props AS (
    SELECT pr.*, row_number() OVER (ORDER BY pr.updated_at) AS rn FROM quest_proposals pr
    WHERE pr.quest_id = ANY (v_quests) AND pr.updated_at >= p_since AND pr.updated_at < p_until
  ),
  evts AS (
    SELECT e.*, row_number() OVER (ORDER BY e.updated_at) AS rn FROM guild_events e
    WHERE e.guild_id = p_guild_id AND e.updated_at >= p_since AND e.updated_at < p_until
  ),
  joins AS (
    SELECT m.*, row_number() OVER (ORDER BY m.joined_at) AS rn FROM guild_members m
    WHERE m.guild_id = p_guild_id AND m.joined_at >= p_since AND m.joined_at < p_until
  )
  SELECT jsonb_build_object(
    'guild', (SELECT jsonb_build_object('id', g.id, 'name', g.name, 'url', v_base || '/guilds/' || g.id) FROM guilds g WHERE g.id = p_guild_id),
    'since', p_since, 'until', p_until, 'next_since', p_until,
    'discussions', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', p.id, 'at', p.created_at,
        'where', CASE WHEN p.room_id = ANY (v_rooms) THEN 'salon « ' || (SELECT r.name FROM discussion_rooms r WHERE r.id = p.room_id) || ' »'
                      WHEN p.context_type IN ('QUEST', 'QUEST_DISCUSSION') THEN 'quête « ' || coalesce((SELECT qt.title FROM qt WHERE qt.id = p.context_id), '?') || ' »'
                      ELSE 'discussion de la guilde' END,
        'author', coalesce((SELECT pf.name FROM profiles pf WHERE pf.user_id = p.author_user_id), '?'),
        'visibility', coalesce(p.visibility, 'public'),
        'text', CASE WHEN length(coalesce(p.content, '')) > 1200 THEN left(p.content, 1200) || '…' ELSE coalesce(p.content, '') END,
        'url', CASE WHEN p.context_type IN ('QUEST', 'QUEST_DISCUSSION') THEN v_base || '/quests/' || p.context_id ELSE v_base || '/guilds/' || p_guild_id END,
        'linked_project', (SELECT link.lp FROM link WHERE p.context_type IN ('QUEST', 'QUEST_DISCUSSION') AND link.quest_id = p.context_id)
      ) ORDER BY p.created_at) FROM posts p WHERE p.rn <= v_cap), '[]'::jsonb),
    'replies', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', c.id, 'at', c.created_at, 'on_message', c.target_id,
        'where', CASE WHEN c.p_room = ANY (v_rooms) THEN 'salon « ' || (SELECT r.name FROM discussion_rooms r WHERE r.id = c.p_room) || ' »'
                      WHEN c.p_ctx IN ('QUEST', 'QUEST_DISCUSSION') THEN 'quête « ' || coalesce((SELECT qt.title FROM qt WHERE qt.id = c.p_ctx_id), '?') || ' »'
                      ELSE 'discussion de la guilde' END,
        'author', coalesce((SELECT pf.name FROM profiles pf WHERE pf.user_id = c.author_id), '?'),
        'text', CASE WHEN length(coalesce(c.content, '')) > 800 THEN left(c.content, 800) || '…' ELSE coalesce(c.content, '') END
      ) ORDER BY c.created_at) FROM replies c WHERE c.rn <= v_cap), '[]'::jsonb),
    'decisions', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', d.id, 'question', d.question,
        'description', CASE WHEN length(coalesce(d.description, '')) > 600 THEN left(d.description, 600) || '…' ELSE d.description END,
        'status', d.status, 'type', d.decision_type,
        'about', CASE WHEN d.entity_type = 'quest' THEN 'quête « ' || coalesce((SELECT qt.title FROM qt WHERE qt.id = d.entity_id), '?') || ' »' ELSE 'guilde' END,
        'opened_at', coalesce(d.opens_at, d.created_at), 'closes_at', d.closes_at, 'changed_at', d.updated_at,
        'new', d.created_at >= p_since,
        'votes', coalesce((SELECT jsonb_object_agg(k, w) FROM (
            SELECT coalesce(v.value,
                            CASE WHEN jsonb_typeof(d.options) = 'array' THEN
                              coalesce(d.options->v.option_index->>'label', d.options->v.option_index->>'text', d.options->>v.option_index) END,
                            'option ' || v.option_index) AS k,
                   round(sum(coalesce(v.applied_weight, 1))::numeric, 2) AS w
            FROM decision_poll_votes v WHERE v.poll_id = d.id GROUP BY 1) t), '{}'::jsonb),
        'outcome', d.outcome_summary,
        'url', v_base || '/guilds/' || p_guild_id || '?tab=decisions',
        'linked_project', (SELECT link.lp FROM link WHERE d.entity_type = 'quest' AND link.quest_id = d.entity_id)
      ) ORDER BY d.updated_at) FROM polls d WHERE d.rn <= v_cap), '[]'::jsonb),
    'quests', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', q.id, 'title', q.title, 'status', q.status,
        'change', CASE WHEN q.created_at >= p_since THEN 'created' ELSE 'updated' END, 'at', q.updated_at,
        'url', v_base || '/quests/' || q.id, 'linked_project', (SELECT link.lp FROM link WHERE link.quest_id = q.id)
      ) ORDER BY q.updated_at) FROM quest_rows q WHERE q.rn <= v_cap), '[]'::jsonb),
    'quest_news', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'at', u.created_at, 'quest', coalesce((SELECT qt.title FROM qt WHERE qt.id = u.quest_id), '?'), 'title', u.title, 'type', u.type,
        'author', coalesce((SELECT pf.name FROM profiles pf WHERE pf.user_id = u.author_id), '?'),
        'text', CASE WHEN length(coalesce(u.content, '')) > 1200 THEN left(u.content, 1200) || '…' ELSE coalesce(u.content, '') END,
        'url', v_base || '/quests/' || u.quest_id, 'linked_project', (SELECT link.lp FROM link WHERE link.quest_id = u.quest_id)
      ) ORDER BY u.created_at) FROM news u WHERE u.rn <= v_cap), '[]'::jsonb),
    'needs', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'at', n.created_at, 'quest', coalesce((SELECT qt.title FROM qt WHERE qt.id = n.quest_id), '?'), 'title', n.title,
        'category', n.category, 'status', n.status,
        'url', v_base || '/quests/' || n.quest_id, 'linked_project', (SELECT link.lp FROM link WHERE link.quest_id = n.quest_id)
      ) ORDER BY n.created_at) FROM needs n WHERE n.rn <= v_cap), '[]'::jsonb),
    'contributions', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'at', pr.updated_at, 'quest', coalesce((SELECT qt.title FROM qt WHERE qt.id = pr.quest_id), '?'), 'title', pr.title,
        'text', CASE WHEN length(coalesce(pr.description, '')) > 600 THEN left(pr.description, 600) || '…' ELSE pr.description END,
        'status', pr.status,
        'by', CASE WHEN upper(pr.proposer_type) = 'USER'
                   THEN coalesce((SELECT pf.name FROM profiles pf WHERE pf.user_id::text = pr.proposer_id), '?') ELSE pr.proposer_type END,
        'new', pr.created_at >= p_since,
        'url', v_base || '/quests/' || pr.quest_id, 'linked_project', (SELECT link.lp FROM link WHERE link.quest_id = pr.quest_id)
      ) ORDER BY pr.updated_at) FROM props pr WHERE pr.rn <= v_cap), '[]'::jsonb),
    'events', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'title', e.title, 'start_at', e.start_at, 'end_at', e.end_at,
        'status', CASE WHEN e.is_cancelled THEN 'cancelled' ELSE e.status END,
        'change', CASE WHEN e.created_at >= p_since THEN 'created' ELSE 'updated' END,
        'url', v_base || '/guilds/' || p_guild_id || '?tab=events'
      ) ORDER BY e.updated_at) FROM evts e WHERE e.rn <= v_cap), '[]'::jsonb),
    'new_members', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'name', coalesce((SELECT pf.name FROM profiles pf WHERE pf.user_id = m.user_id), '?'), 'role', m.role, 'joined_at', m.joined_at
      ) ORDER BY m.joined_at) FROM joins m WHERE m.rn <= v_cap), '[]'::jsonb),
    'truncated', (SELECT count(*) FROM posts) > v_cap OR (SELECT count(*) FROM replies) > v_cap OR (SELECT count(*) FROM polls) > v_cap
              OR (SELECT count(*) FROM quest_rows) > v_cap OR (SELECT count(*) FROM news) > v_cap OR (SELECT count(*) FROM needs) > v_cap
              OR (SELECT count(*) FROM props) > v_cap OR (SELECT count(*) FROM evts) > v_cap OR (SELECT count(*) FROM joins) > v_cap
  ) INTO v_out;

  RETURN v_out || jsonb_build_object('note', CASE WHEN (v_out->>'truncated')::boolean
    THEN 'Some sections were capped: call again with a later `since` (the last `at` you processed) to get the rest.'
    ELSE 'Complete for this window. Use `next_since` as `since` next time.' END);
END;
$$;

REVOKE ALL ON FUNCTION public.guild_activity(uuid, timestamptz, timestamptz, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guild_activity(uuid, timestamptz, timestamptz, integer) TO authenticated, service_role;
