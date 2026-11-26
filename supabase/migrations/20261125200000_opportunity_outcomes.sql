-- Opportunités réalisées : « C'est réalisé » + confiance.
--
-- Une personne concernée par la quête (qui la porte, ou y participe) peut indiquer qu'une opportunité s'est
-- concrétisée : la personne / guilde / organisation a bien aidé. Cela :
--   - garde une trace durable (opportunity_outcomes), qui ne disparaît pas quand le besoin est satisfait ;
--   - marque le besoin comme satisfait (MET) — il sort des rapprochements au passage suivant du moteur ;
--   - prévient celle ou celui qui a aidé ;
--   - sert de preuve forte au moteur pour ses compétences (« a aidé le projet X pour Y, confirmé par l'équipe ») ;
--   - propose ensuite de lui accorder sa confiance (« Give trust »), dans le contexte de la quête.

-- Qui peut dire « c'est réalisé » : qui porte la quête, ou y participe.
CREATE OR REPLACE FUNCTION public.can_mark_opportunity_done(_quest_id uuid, _uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _uid IS NOT NULL AND (
    public.is_quest_holder(_quest_id, _uid)
    OR EXISTS (SELECT 1 FROM public.quest_participants p WHERE p.quest_id = _quest_id AND p.user_id = _uid)
  )
$$;
REVOKE ALL ON FUNCTION public.can_mark_opportunity_done(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_mark_opportunity_done(uuid, uuid) TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.opportunity_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid REFERENCES public.opportunity_matches(id) ON DELETE SET NULL,
  quest_id uuid NOT NULL REFERENCES public.quests(id) ON DELETE CASCADE,
  need_label text NOT NULL,
  need_category text,
  capability_id uuid REFERENCES public.capabilities(id) ON DELETE SET NULL,
  capability_label text,
  helper_type text NOT NULL CHECK (helper_type IN ('profile', 'guild', 'company')),
  helper_id uuid NOT NULL,
  marked_by uuid NOT NULL,
  note text,
  trust_given boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS opportunity_outcomes_uniq
  ON public.opportunity_outcomes (quest_id, lower(need_label), helper_type, helper_id);
CREATE INDEX IF NOT EXISTS opportunity_outcomes_helper_idx ON public.opportunity_outcomes (helper_type, helper_id);
ALTER TABLE public.opportunity_outcomes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.opportunity_outcomes FROM anon;
GRANT SELECT ON public.opportunity_outcomes TO authenticated;
GRANT ALL ON public.opportunity_outcomes TO service_role;
DROP POLICY IF EXISTS "Opportunity outcomes: people concerned" ON public.opportunity_outcomes;
CREATE POLICY "Opportunity outcomes: people concerned" ON public.opportunity_outcomes FOR SELECT TO authenticated
  USING (
    marked_by = auth.uid()
    OR (helper_type = 'profile' AND helper_id = auth.uid())
    OR public.can_mark_opportunity_done(quest_id, auth.uid())
  );

-- « C'est réalisé ».
CREATE OR REPLACE FUNCTION public.mark_opportunity_done(p_match_id uuid, p_note text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE
  uid uuid := auth.uid();
  o record;
  n record;
  oid uuid;
  nid uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO o FROM public.get_opportunities('all', NULL, 200) g WHERE g.match_id = p_match_id;
  IF NOT FOUND OR NOT o.can_mark_done THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF o.outcome_id IS NOT NULL THEN RETURN o.outcome_id; END IF;

  INSERT INTO public.opportunity_outcomes
    (match_id, quest_id, need_label, need_category, capability_id, capability_label, helper_type, helper_id, marked_by, note)
  VALUES (p_match_id, o.quest_id, o.need_label, o.need_category, o.capability_id, o.capability_label,
          o.helper_type, o.helper_id, uid, nullif(left(trim(coalesce(p_note, '')), 1000), ''))
  RETURNING id INTO oid;

  -- Le besoin est satisfait.
  SELECT nd.source, nd.source_id INTO n
  FROM public.opportunity_matches m JOIN public.opportunity_needs nd ON nd.id = m.need_id
  WHERE m.id = p_match_id;
  IF n.source = 'quest_need' THEN
    UPDATE public.quest_needs SET status = 'MET', updated_at = now() WHERE id = n.source_id;
  ELSIF n.source = 'suggestion' THEN
    INSERT INTO public.quest_needs (quest_id, title, category, status, created_by_user_id)
    SELECT s.quest_id, s.label, s.category, 'MET', uid FROM public.need_suggestions s
    WHERE s.id = n.source_id AND s.quest_need_id IS NULL
    RETURNING id INTO nid;
    UPDATE public.need_suggestions SET status = 'accepted', quest_need_id = coalesce(nid, quest_need_id), updated_at = now()
    WHERE id = n.source_id;
  END IF;

  -- Prévenir celle ou celui qui a aidé (ou les admins de sa guilde / organisation).
  INSERT INTO public.notifications (user_id, type, title, body, deep_link_url, related_entity_type, related_entity_id, data)
  SELECT r.user_id, 'OPPORTUNITY_DONE', '🎉 ' || o.quest_title || ' — ' || o.need_label, nullif(trim(coalesce(p_note, '')), ''),
         '/quests/' || o.quest_id, 'QUEST', o.quest_id::text,
         jsonb_build_object('outcome_id', oid, 'marked_by', uid)
  FROM (
    SELECT o.helper_id AS user_id WHERE o.helper_type = 'profile'
    UNION SELECT gm.user_id FROM public.guild_members gm WHERE o.helper_type = 'guild' AND gm.guild_id = o.helper_id AND upper(gm.role::text) = 'ADMIN'
    UNION SELECT cm.user_id FROM public.company_members cm WHERE o.helper_type = 'company' AND cm.company_id = o.helper_id AND upper(cm.role::text) IN ('ADMIN', 'OWNER')
  ) r
  WHERE r.user_id IS NOT NULL AND r.user_id <> uid;

  RETURN oid;
END $$;
REVOKE ALL ON FUNCTION public.mark_opportunity_done(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_opportunity_done(uuid, text) TO authenticated;

-- La confiance a été accordée depuis l'opportunité (pour ne plus la proposer).
CREATE OR REPLACE FUNCTION public.set_opportunity_trust_given(p_outcome_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.opportunity_outcomes o SET trust_given = true
  WHERE o.id = p_outcome_id AND public.can_mark_opportunity_done(o.quest_id, auth.uid());
$$;
REVOKE ALL ON FUNCTION public.set_opportunity_trust_given(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_opportunity_trust_given(uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.get_opportunities(text, uuid, integer);
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
      AND (r.public_visibility = 'public' OR r.i_manage_quest
           OR EXISTS (SELECT 1 FROM public.quest_participants p WHERE p.quest_id = r.quest_id AND p.user_id = me.uid)
           OR (r.quest_guild_id IS NOT NULL AND r.quest_guild_id IN (SELECT guild_id FROM my_guilds)))
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
