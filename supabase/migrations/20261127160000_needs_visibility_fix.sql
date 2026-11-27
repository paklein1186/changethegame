-- Besoins : correctifs et « Proposer mon aide ».
--
-- 1. Les besoins et les opportunités filtraient sur quests.public_visibility = 'public'. Ce champ règle la
--    visibilité sur les sites web publics (« private », valeur par défaut, = absent des sites externes), pas dans
--    la plateforme, où toute quête publiée se consulte. 18 des 21 besoins ouverts n'apparaissaient donc pas dans
--    l'onglet Besoins, et les opportunités de ces quêtes restaient invisibles même pour qui pouvait aider.
-- 2. propose_need_contribution : proposer son aide passe par les contributions de la quête, plus par une
--    conversation privée avec le porteur (qui pouvait être un compte d'agent).

DROP FUNCTION IF EXISTS public.explore_needs(text, uuid, text, text, integer, integer);
CREATE FUNCTION public.explore_needs(
  p_scope text DEFAULT 'all',
  p_territory_id uuid DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_query text DEFAULT NULL,
  p_limit integer DEFAULT 30,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  need_id uuid, title text, description text, category text, status text, created_at timestamptz,
  quest_id uuid, quest_title text, quest_cover text, owner_id uuid, owner_name text, guild_id uuid, guild_name text, guild_logo text,
  territory_names text[], match_score numeric, match_label text, match_owner_type text, match_owner_name text,
  is_mine boolean, my_proposal_pending boolean, total_count bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH me AS (SELECT auth.uid() AS uid),
  my_guilds AS (SELECT gm.guild_id FROM public.guild_members gm, me WHERE gm.user_id = me.uid),
  my_caps AS (
    SELECT c.id, c.label, c.owner_type, c.embedding,
           CASE c.owner_type WHEN 'guild' THEN (SELECT g.name FROM public.guilds g WHERE g.id = c.owner_id) END AS owner_name
    FROM public.capabilities c, me
    WHERE c.embedding IS NOT NULL AND c.status <> 'dismissed'
      AND ((c.owner_type = 'profile' AND c.owner_id = me.uid)
        OR (p_scope IN ('me_and_guilds', 'all') AND c.owner_type = 'guild' AND c.owner_id IN (SELECT guild_id FROM my_guilds)))
  ),
  area AS (
    SELECT tc.descendant_id AS territory_id FROM public.territory_closure tc WHERE tc.ancestor_id = p_territory_id
    UNION SELECT p_territory_id WHERE p_territory_id IS NOT NULL
  ),
  needs AS (
    SELECT qn.id, qn.title, qn.description, coalesce(qn.category, 'GENERAL') AS category, coalesce(qn.status, 'OPEN') AS status,
           qn.created_at, q.id AS quest_id, q.title AS quest_title, q.cover_image_url, q.created_by_user_id,
           coalesce(q.guild_id, (SELECT h.entity_id FROM public.quest_hosts h
                                  WHERE h.quest_id = q.id AND upper(h.entity_type::text) = 'GUILD' LIMIT 1)) AS guild_id,
           onn.embedding
    FROM public.quest_needs qn
    JOIN public.quests q ON q.id = qn.quest_id
    LEFT JOIN public.opportunity_needs onn ON onn.source = 'quest_need' AND onn.source_id = qn.id
    WHERE upper(coalesce(qn.status, 'OPEN')) IN ('OPEN', 'ACTIVE', 'IN_PROGRESS')
      AND q.is_deleted = false AND coalesce(q.is_draft, false) = false
      AND q.status::text NOT IN ('COMPLETED', 'CANCELLED', 'DRAFT')
      AND (p_category IS NULL OR coalesce(qn.category, 'GENERAL') = p_category)
      AND (p_query IS NULL OR btrim(p_query) = ''
           OR qn.title ILIKE '%' || btrim(p_query) || '%' OR qn.description ILIKE '%' || btrim(p_query) || '%'
           OR q.title ILIKE '%' || btrim(p_query) || '%')
  ),
  placed AS (
    SELECT n.* FROM needs n
    WHERE p_territory_id IS NULL
       OR EXISTS (SELECT 1 FROM public.quest_territories qt WHERE qt.quest_id = n.quest_id AND coalesce(qt.is_hidden, false) = false
                    AND qt.territory_id IN (SELECT territory_id FROM area))
       OR EXISTS (SELECT 1 FROM public.guild_territories gt WHERE gt.guild_id = n.guild_id
                    AND gt.territory_id IN (SELECT territory_id FROM area))
  ),
  scored AS (
    SELECT p.*, best.sim, best.label AS match_label, best.owner_type AS match_owner_type, best.owner_name AS match_owner_name,
           p.created_by_user_id = (SELECT uid FROM me) AS is_mine
    FROM placed p
    LEFT JOIN LATERAL (
      SELECT (1 - (c.embedding <=> p.embedding))::numeric AS sim, c.label, c.owner_type, c.owner_name
      FROM my_caps c
      WHERE p.embedding IS NOT NULL
      ORDER BY c.embedding <=> p.embedding
      LIMIT 1
    ) best ON true
  ),
  kept AS (
    SELECT s.* FROM scored s
    WHERE p_scope = 'all' OR (coalesce(s.sim, 0) >= 0.36 AND NOT s.is_mine)
  )
  SELECT k.id, k.title, k.description, k.category, k.status, k.created_at,
         k.quest_id, k.quest_title, k.cover_image_url, k.created_by_user_id,
         (SELECT pr.name FROM public.profiles pr WHERE pr.user_id = k.created_by_user_id),
         k.guild_id,
         (SELECT g.name FROM public.guilds g WHERE g.id = k.guild_id),
         (SELECT g.logo_url FROM public.guilds g WHERE g.id = k.guild_id),
         -- Territoires de la quête, sinon ceux de sa guilde.
         coalesce(
           nullif(ARRAY(SELECT t.name FROM public.quest_territories qt JOIN public.territories t ON t.id = qt.territory_id
                        WHERE qt.quest_id = k.quest_id AND coalesce(qt.is_hidden, false) = false AND t.is_deleted = false
                        ORDER BY qt.is_primary DESC NULLS LAST, t.name LIMIT 3), '{}'),
           ARRAY(SELECT t.name FROM public.guild_territories gt JOIN public.territories t ON t.id = gt.territory_id
                 WHERE gt.guild_id = k.guild_id AND t.is_deleted = false
                 ORDER BY gt.is_primary DESC NULLS LAST, t.name LIMIT 3)),
         round(k.sim, 3), k.match_label, k.match_owner_type, k.match_owner_name, coalesce(k.is_mine, false),
         EXISTS (SELECT 1 FROM public.quest_proposals qp, me WHERE qp.need_id = k.id AND qp.proposer_id = me.uid::text
                   AND qp.proposer_type = 'USER' AND qp.status = 'PENDING'),
         count(*) OVER ()
  FROM kept k
  -- Ceux qui correspondent d'abord (du plus proche au moins proche), puis les plus récents.
  ORDER BY coalesce(k.sim, 0) >= 0.36 DESC,
           CASE WHEN coalesce(k.sim, 0) >= 0.36 THEN k.sim END DESC NULLS LAST,
           k.created_at DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 100) OFFSET GREATEST(p_offset, 0);
$$;


CREATE OR REPLACE FUNCTION public.explore_needs_territories()
RETURNS TABLE (territory_id uuid, name text, level text, need_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH open_needs AS (
    SELECT qn.id, q.id AS quest_id, q.guild_id
    FROM public.quest_needs qn JOIN public.quests q ON q.id = qn.quest_id
    WHERE upper(coalesce(qn.status, 'OPEN')) IN ('OPEN', 'ACTIVE', 'IN_PROGRESS')
      AND q.is_deleted = false AND coalesce(q.is_draft, false) = false
      AND q.status::text NOT IN ('COMPLETED', 'CANCELLED', 'DRAFT')
  ),
  placed AS (
    SELECT n.id, qt.territory_id FROM open_needs n
    JOIN public.quest_territories qt ON qt.quest_id = n.quest_id AND coalesce(qt.is_hidden, false) = false
    UNION
    SELECT n.id, gt.territory_id FROM open_needs n JOIN public.guild_territories gt ON gt.guild_id = n.guild_id
  ),
  rolled AS (
    SELECT p.id, p.territory_id FROM placed p
    UNION
    SELECT p.id, tc.ancestor_id FROM placed p JOIN public.territory_closure tc ON tc.descendant_id = p.territory_id
  )
  SELECT t.id, t.name, t.level::text, count(DISTINCT r.id)
  FROM rolled r JOIN public.territories t ON t.id = r.territory_id
  WHERE t.is_deleted = false AND t.level::text NOT IN ('GLOBAL', 'CONTINENT')
  GROUP BY t.id, t.name, t.level
  ORDER BY count(DISTINCT r.id) DESC, t.name
  LIMIT 300;
$$;


REVOKE ALL ON FUNCTION public.explore_needs(text, uuid, text, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.explore_needs(text, uuid, text, text, integer, integer) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_opportunities(
  p_scope text DEFAULT 'me',
  p_guild_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 60
)
RETURNS TABLE (
  match_id uuid, direction text, quest_id uuid, quest_title text, need_label text, need_kind text, need_category text,
  helper_type text, helper_id uuid, helper_name text, helper_avatar text, capability_id uuid, capability_label text,
  capability_status text, reason_fr text, reason_en text, score numeric, territory_ids uuid[], territory_names text[],
  topic_ids uuid[], my_verdict text, updated_at timestamptz, capability_service_url text, capability_service_title text,
  request_sent boolean, can_mark_done boolean, done boolean, outcome_id uuid, trust_given boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH me AS (SELECT auth.uid() AS uid),
  my_guilds AS (SELECT gm.guild_id FROM public.guild_members gm, me WHERE gm.user_id = me.uid),
  my_companies AS (SELECT cm.company_id FROM public.company_members cm, me WHERE cm.user_id = me.uid),
  rows AS (
    SELECT m.id AS match_id, m.quest_id, q.title AS quest_title, q.public_visibility, q.guild_id AS quest_guild_id,
           q.created_by_user_id AS quest_owner,
           n.label AS need_label, n.kind AS need_kind, n.category AS need_category,
           c.id AS capability_id, c.owner_type AS helper_type, c.owner_id AS helper_id, c.label AS capability_label,
           c.status AS capability_status, public.capability_has_public_evidence(c.evidence) AS public_evidence,
           svc.url AS service_url, svc.title AS service_title,
           m.reason_fr, m.reason_en, m.score, m.updated_at,
           public.is_quest_holder(m.quest_id, (SELECT uid FROM me)) AS i_manage_quest,
           public.can_mark_opportunity_done(m.quest_id, (SELECT uid FROM me)) AS i_can_mark,
           oc.id AS outcome_id, coalesce(oc.trust_given, false) AS trust_given,
           (c.owner_type = 'profile' AND c.owner_id = (SELECT uid FROM me))
             OR (c.owner_type = 'guild' AND c.owner_id IN (SELECT guild_id FROM my_guilds))
             OR (c.owner_type = 'company' AND c.owner_id IN (SELECT company_id FROM my_companies)) AS i_am_helper
    FROM public.opportunity_matches m
    JOIN public.opportunity_needs n ON n.id = m.need_id
    JOIN public.capabilities c ON c.id = m.capability_id
    JOIN public.quests q ON q.id = m.quest_id
    LEFT JOIN LATERAL (
      SELECT '/services/' || s.id::text AS url, s.title
      FROM jsonb_array_elements(c.evidence) e
      JOIN public.services s ON s.id::text = substring(e->>'url' from '^/services/([0-9a-fA-F-]{36})$')
      WHERE e->>'kind' = 'service' AND s.is_deleted = false AND s.is_draft = false
        AND ((c.owner_type = 'profile' AND s.provider_user_id = c.owner_id)
          OR (c.owner_type = 'guild' AND (s.provider_guild_id = c.owner_id OR (upper(coalesce(s.owner_type::text, '')) = 'GUILD' AND s.owner_id::text = c.owner_id::text)))
          OR (c.owner_type = 'company' AND upper(coalesce(s.owner_type::text, '')) = 'COMPANY' AND s.owner_id::text = c.owner_id::text))
      LIMIT 1
    ) svc ON true
    LEFT JOIN LATERAL (
      SELECT o.id, o.trust_given FROM public.opportunity_outcomes o
      WHERE o.quest_id = m.quest_id AND lower(o.need_label) = lower(n.label)
        AND o.helper_type = c.owner_type AND o.helper_id = c.owner_id
      LIMIT 1
    ) oc ON true
    WHERE q.is_deleted = false AND coalesce(q.is_draft, false) = false AND c.status <> 'dismissed'
  ),
  visible AS (
    SELECT r.* FROM rows r, me
    WHERE me.uid IS NOT NULL
      -- Toute quête publiée est visible dans la plateforme : public_visibility ne concerne que les sites web.
      -- capacité : confirmée, ou suggérée à partir d'une activité publique, ou la sienne
      AND (r.capability_status = 'confirmed' OR r.public_evidence OR r.i_am_helper)
      AND (r.need_kind = 'explicit' OR r.i_manage_quest OR r.i_am_helper)
      AND NOT (r.helper_type = 'profile' AND r.helper_id = r.quest_owner)
  )
  SELECT v.match_id,
         CASE WHEN v.i_am_helper THEN 'you_can_help' WHEN v.i_manage_quest THEN 'help_for_you' ELSE 'platform' END,
         v.quest_id, v.quest_title, v.need_label, v.need_kind, v.need_category,
         v.helper_type, v.helper_id,
         CASE v.helper_type
           WHEN 'profile' THEN (SELECT p.name FROM public.profiles p WHERE p.user_id = v.helper_id)
           WHEN 'guild' THEN (SELECT g.name FROM public.guilds g WHERE g.id = v.helper_id)
           ELSE (SELECT co.name FROM public.companies co WHERE co.id = v.helper_id) END,
         CASE v.helper_type
           WHEN 'profile' THEN (SELECT p.avatar_url FROM public.profiles p WHERE p.user_id = v.helper_id)
           WHEN 'guild' THEN (SELECT g.logo_url FROM public.guilds g WHERE g.id = v.helper_id)
           ELSE (SELECT co.logo_url FROM public.companies co WHERE co.id = v.helper_id) END,
         v.capability_id, v.capability_label, v.capability_status, v.reason_fr, v.reason_en, v.score,
         ARRAY(SELECT qt.territory_id FROM public.quest_territories qt WHERE qt.quest_id = v.quest_id),
         ARRAY(SELECT t.name FROM public.quest_territories qt JOIN public.territories t ON t.id = qt.territory_id
               WHERE qt.quest_id = v.quest_id AND t.is_deleted = false ORDER BY qt.is_primary DESC NULLS LAST),
         ARRAY(SELECT tp.topic_id FROM public.quest_topics tp WHERE tp.quest_id = v.quest_id),
         (SELECT f.verdict FROM public.opportunity_feedback f, me WHERE f.match_id = v.match_id AND f.user_id = me.uid),
         v.updated_at,
         v.service_url,
         v.service_title,
         EXISTS (SELECT 1 FROM public.opportunity_requests rq, me WHERE rq.match_id = v.match_id AND rq.requester_id = me.uid),
         v.i_can_mark AND NOT (v.helper_type = 'profile' AND v.helper_id = (SELECT uid FROM me)),
         v.outcome_id IS NOT NULL,
         v.outcome_id,
         v.trust_given
  FROM visible v
  WHERE NOT EXISTS (SELECT 1 FROM public.opportunity_feedback f, me
                    WHERE f.match_id = v.match_id AND f.user_id = me.uid AND f.verdict = 'not_relevant')
    AND CASE
      WHEN p_guild_id IS NOT NULL THEN
        v.quest_guild_id = p_guild_id
        OR EXISTS (SELECT 1 FROM public.quest_hosts h WHERE h.quest_id = v.quest_id AND upper(h.entity_type::text) = 'GUILD' AND h.entity_id = p_guild_id)
        OR (v.helper_type = 'guild' AND v.helper_id = p_guild_id)
        OR (v.helper_type = 'profile' AND EXISTS (SELECT 1 FROM public.guild_members gm WHERE gm.guild_id = p_guild_id AND gm.user_id = v.helper_id))
      WHEN p_scope = 'me' THEN v.i_am_helper OR v.i_manage_quest
      WHEN p_scope = 'guilds' THEN
        v.quest_guild_id IN (SELECT guild_id FROM my_guilds)
        OR (v.helper_type = 'guild' AND v.helper_id IN (SELECT guild_id FROM my_guilds))
      ELSE true
    END
  ORDER BY (v.i_am_helper OR v.i_manage_quest) DESC, (v.capability_status = 'confirmed') DESC, v.score DESC, v.updated_at DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 200);
$$;
REVOKE ALL ON FUNCTION public.get_opportunities(text, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_opportunities(text, uuid, integer) TO authenticated;

-- ── Proposer son aide sur un besoin ─────────────────────────────────────────────────────────────────
-- Passe par les contributions de la quête (quest_proposals, liées au besoin), comme « Submit Contribution »
-- sur la page de la quête, et prévient : la personne qui a créé le besoin, le porteur de la quête et les admins
-- de la guilde de la quête. Les comptes d'agent (quêtes importées de Space2…) ne sont jamais destinataires ;
-- si personne d'humain n'est joignable, les admins de la plateforme sont prévenus pour relayer au lieu.
-- Une seule proposition en attente par personne et par besoin : la renvoyer met à jour la précédente.
-- Retour : { proposal_id, notified, relayed_to_platform }.
CREATE OR REPLACE FUNCTION public.propose_need_contribution(
  p_need_id uuid,
  p_title text,
  p_description text DEFAULT NULL,
  p_currency text DEFAULT 'CREDITS',
  p_requested_credits numeric DEFAULT 0,
  p_requested_fiat numeric DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_need record;
  v_quest record;
  v_guild_id uuid;
  v_name text;
  v_id uuid;
  v_recipients uuid[];
  v_relay boolean := false;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;
  IF coalesce(btrim(p_title), '') = '' OR length(p_title) > 160 THEN RAISE EXCEPTION 'Invalid title'; END IF;
  IF length(coalesce(p_description, '')) > 2000 THEN RAISE EXCEPTION 'Description too long'; END IF;
  IF p_currency NOT IN ('CREDITS', 'FIAT', 'BOTH') THEN RAISE EXCEPTION 'Invalid currency'; END IF;
  IF coalesce(p_requested_credits, 0) < 0 OR coalesce(p_requested_fiat, 0) < 0 THEN RAISE EXCEPTION 'Invalid amount'; END IF;

  SELECT * INTO v_need FROM quest_needs WHERE id = p_need_id;
  IF NOT FOUND OR upper(coalesce(v_need.status, 'OPEN')) NOT IN ('OPEN', 'ACTIVE', 'IN_PROGRESS') THEN
    RAISE EXCEPTION 'This need is no longer open';
  END IF;
  SELECT id, title, created_by_user_id, guild_id INTO v_quest FROM quests
   WHERE id = v_need.quest_id AND is_deleted = false AND coalesce(is_draft, false) = false;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quest not found'; END IF;
  v_guild_id := coalesce(v_quest.guild_id, (SELECT h.entity_id FROM quest_hosts h
                 WHERE h.quest_id = v_quest.id AND upper(h.entity_type::text) = 'GUILD' LIMIT 1));

  SELECT id INTO v_id FROM quest_proposals
   WHERE need_id = p_need_id AND proposer_id = v_uid::text AND proposer_type = 'USER' AND status = 'PENDING' LIMIT 1;
  IF v_id IS NOT NULL THEN
    UPDATE quest_proposals
       SET title = btrim(p_title), description = nullif(btrim(coalesce(p_description, '')), ''),
           requested_currency = p_currency,
           requested_credits = CASE WHEN p_currency <> 'FIAT' THEN coalesce(p_requested_credits, 0) ELSE 0 END,
           requested_fiat = CASE WHEN p_currency <> 'CREDITS' THEN coalesce(p_requested_fiat, 0) ELSE 0 END,
           updated_at = now()
     WHERE id = v_id;
    RETURN jsonb_build_object('proposal_id', v_id, 'notified', 0, 'relayed_to_platform', false, 'updated', true);
  END IF;

  INSERT INTO quest_proposals (quest_id, proposer_type, proposer_id, title, description, requested_currency,
                               requested_credits, requested_fiat, need_id, status)
  VALUES (v_quest.id, 'USER', v_uid::text, btrim(p_title), nullif(btrim(coalesce(p_description, '')), ''), p_currency,
          CASE WHEN p_currency <> 'FIAT' THEN coalesce(p_requested_credits, 0) ELSE 0 END,
          CASE WHEN p_currency <> 'CREDITS' THEN coalesce(p_requested_fiat, 0) ELSE 0 END,
          p_need_id, 'PENDING')
  RETURNING id INTO v_id;

  SELECT array_agg(DISTINCT r.uid) INTO v_recipients
  FROM (
    SELECT v_need.created_by_user_id AS uid
    UNION SELECT v_quest.created_by_user_id
    UNION SELECT gm.user_id FROM guild_members gm WHERE gm.guild_id = v_guild_id AND upper(gm.role::text) = 'ADMIN'
  ) r
  JOIN profiles p ON p.user_id = r.uid
  WHERE r.uid IS NOT NULL AND r.uid <> v_uid AND coalesce(p.is_agent, false) = false;

  IF coalesce(array_length(v_recipients, 1), 0) = 0 THEN
    v_relay := true;
    SELECT array_agg(DISTINCT ur.user_id) INTO v_recipients FROM user_roles ur
     WHERE ur.role::text = 'admin' AND ur.user_id <> v_uid;
  END IF;

  SELECT name INTO v_name FROM profiles WHERE user_id = v_uid;
  INSERT INTO notifications (user_id, type, title, body, related_entity_type, related_entity_id, deep_link_url)
  SELECT u, 'QUEST_PROPOSAL_SUBMITTED',
         CASE WHEN v_relay THEN 'Aide proposée sur une quête sans membre' ELSE 'Aide proposée pour un besoin' END,
         coalesce(v_name, 'Quelqu''un') || ' propose son aide pour « ' || v_need.title || ' » (' || v_quest.title || ')'
           || CASE WHEN v_relay THEN ' : personne n''est joignable sur cette quête, à relayer au lieu.' ELSE '.' END,
         'QUEST', v_quest.id, '/quests/' || v_quest.id::text
  FROM unnest(coalesce(v_recipients, ARRAY[]::uuid[])) u;

  RETURN jsonb_build_object('proposal_id', v_id, 'notified', coalesce(array_length(v_recipients, 1), 0),
                            'relayed_to_platform', v_relay, 'updated', false);
END;
$$;
REVOKE ALL ON FUNCTION public.propose_need_contribution(uuid, text, text, text, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.propose_need_contribution(uuid, text, text, text, numeric, numeric) TO authenticated;
