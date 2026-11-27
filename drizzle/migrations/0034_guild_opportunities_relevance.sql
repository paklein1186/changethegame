CREATE OR REPLACE FUNCTION public.get_opportunities_before_demo_feve(p_scope text DEFAULT 'me'::text, p_guild_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 60)
 RETURNS TABLE(match_id uuid, direction text, quest_id uuid, quest_title text, need_label text, need_kind text, need_category text, helper_type text, helper_id uuid, helper_name text, helper_avatar text, capability_id uuid, capability_label text, capability_status text, reason_fr text, reason_en text, score numeric, territory_ids uuid[], territory_names text[], topic_ids uuid[], my_verdict text, updated_at timestamp with time zone, capability_service_url text, capability_service_title text, request_sent boolean, can_mark_done boolean, done boolean, outcome_id uuid, trust_given boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      AND public.can_access_quest(m.quest_id)
  ),
  visible AS (
    SELECT r.* FROM rows r, me
    WHERE me.uid IS NOT NULL
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
        OR (v.helper_type = 'profile'
            AND EXISTS (SELECT 1 FROM public.guild_members gm WHERE gm.guild_id = p_guild_id AND gm.user_id = v.helper_id)
            AND (
              EXISTS (SELECT 1 FROM public.quest_topics qt JOIN public.guild_topics gt ON gt.topic_id = qt.topic_id
                      WHERE qt.quest_id = v.quest_id AND gt.guild_id = p_guild_id)
              OR EXISTS (SELECT 1 FROM public.quest_territories qtr JOIN public.guild_territories gtr ON gtr.guild_id = p_guild_id
                         WHERE qtr.quest_id = v.quest_id
                           AND (qtr.territory_id = gtr.territory_id
                                OR EXISTS (SELECT 1 FROM public.get_territory_ancestors(qtr.territory_id) a WHERE a.id = gtr.territory_id)))
            ))
      WHEN p_scope = 'me' THEN v.i_am_helper OR v.i_manage_quest
      WHEN p_scope = 'guilds' THEN
        v.quest_guild_id IN (SELECT guild_id FROM my_guilds)
        OR (v.helper_type = 'guild' AND v.helper_id IN (SELECT guild_id FROM my_guilds))
      ELSE true
    END
  ORDER BY (v.i_am_helper OR v.i_manage_quest) DESC, (v.capability_status = 'confirmed') DESC, v.score DESC, v.updated_at DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 200);
$function$;