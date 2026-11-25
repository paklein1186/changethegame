-- Opportunités : capacités suggérées visibles, demandes d'aide par message, relances de confirmation.
--
-- 1. Une capacité déduite par la plateforme (pas encore confirmée) est visible et utilisée dans les
--    rapprochements dès qu'elle s'appuie sur une activité publique (tâche, service, quête, attestation…).
--    Une capacité qui ne repose que sur le CV collé (privé) reste réservée à son titulaire.
-- 2. Les preuves « CV » ne gardent plus d'extrait du texte du CV (il était lisible une fois la capacité
--    confirmée) : seulement la mention « CV / LinkedIn ».
-- 3. « Demander » : la personne qui porte une quête écrit, via la messagerie, à celle qui pourrait l'aider
--    (ou aux admins de la guilde / de l'organisation). Une seule demande par opportunité et par destinataire.
-- 4. get_opportunities renvoie aussi si la capacité est confirmée et si une demande a déjà été envoyée.

-- ── 1. Preuve publique ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.capability_has_public_evidence(_evidence jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(_evidence, '[]'::jsonb)) e WHERE coalesce(e->>'kind', '') <> 'cv')
$$;

DROP POLICY IF EXISTS "Capabilities: owner or confirmed" ON public.capabilities;
CREATE POLICY "Capabilities: owner or confirmed" ON public.capabilities FOR SELECT TO authenticated
  USING (
    status = 'confirmed'
    OR (status = 'inferred' AND public.capability_has_public_evidence(evidence))
    OR public.can_manage_capability_owner(owner_type, owner_id, auth.uid())
  );

-- ── 2. Plus d'extrait de CV dans les preuves ─────────────────────────────────────────────────────
UPDATE public.capabilities c
SET evidence = (
  SELECT coalesce(jsonb_agg(CASE WHEN e->>'kind' = 'cv'
                                 THEN jsonb_build_object('kind', 'cv', 'title', 'CV / LinkedIn', 'url', NULL)
                                 ELSE e END), '[]'::jsonb)
  FROM jsonb_array_elements(c.evidence) e
)
WHERE c.evidence @> '[{"kind": "cv"}]'::jsonb;

-- ── 3. Demandes d'aide ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.opportunity_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.opportunity_matches(id) ON DELETE CASCADE,
  requester_id uuid NOT NULL,
  recipient_id uuid NOT NULL,
  conversation_id uuid,
  message_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (match_id, requester_id, recipient_id)
);
ALTER TABLE public.opportunity_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.opportunity_requests FROM anon;
GRANT SELECT ON public.opportunity_requests TO authenticated;
GRANT ALL ON public.opportunity_requests TO service_role;
DROP POLICY IF EXISTS "Opportunity requests: sender or recipient" ON public.opportunity_requests;
CREATE POLICY "Opportunity requests: sender or recipient" ON public.opportunity_requests FOR SELECT TO authenticated
  USING (requester_id = auth.uid() OR recipient_id = auth.uid());

-- ── 4. Lecture ───────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_quest_holder(_quest_id uuid, _uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _uid IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.quests q WHERE q.id = _quest_id AND q.created_by_user_id = _uid)
    OR EXISTS (SELECT 1 FROM public.quest_participants p
               WHERE p.quest_id = _quest_id AND p.user_id = _uid AND upper(coalesce(p.role::text, '')) IN ('ADMIN', 'OWNER', 'HOST', 'CO_HOST'))
    OR EXISTS (SELECT 1 FROM public.quests q WHERE q.id = _quest_id AND q.guild_id IS NOT NULL AND public.is_guild_admin(q.guild_id, _uid))
  )
$$;
REVOKE ALL ON FUNCTION public.is_quest_holder(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_quest_holder(uuid, uuid) TO authenticated, service_role;

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
  request_sent boolean
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
         EXISTS (SELECT 1 FROM public.opportunity_requests rq, me WHERE rq.match_id = v.match_id AND rq.requester_id = me.uid)
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

-- ── 3 bis. Envoyer une demande d'aide (message direct) ───────────────────────────────────────────
-- Réservé à qui porte la quête. Le message (rédigé et modifiable dans l'interface) part dans une
-- conversation directe avec la personne, ou avec chaque admin de la guilde / de l'organisation.
-- Renvoie une ligne par destinataire : la notification et l'e-mail sont envoyés ensuite par
-- l'interface via la fonction send-dm-notification, comme pour tout message.
CREATE OR REPLACE FUNCTION public.request_opportunity_help(p_match_id uuid, p_message text)
RETURNS TABLE (recipient_id uuid, conversation_id uuid, message_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE
  uid uuid := auth.uid();
  o record;
  rcpt uuid;
  conv uuid;
  msg uuid;
  body text := left(trim(coalesce(p_message, '')), 2000);
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF length(body) < 10 THEN RAISE EXCEPTION 'Message too short'; END IF;
  SELECT * INTO o FROM public.get_opportunities('all', NULL, 200) g WHERE g.match_id = p_match_id;
  IF NOT FOUND OR o.direction <> 'help_for_you' THEN RAISE EXCEPTION 'Not allowed'; END IF;

  FOR rcpt IN
    SELECT CASE WHEN o.helper_type = 'profile' THEN o.helper_id END
    WHERE o.helper_type = 'profile'
    UNION
    SELECT gm.user_id FROM public.guild_members gm
    WHERE o.helper_type = 'guild' AND gm.guild_id = o.helper_id AND upper(gm.role::text) = 'ADMIN'
    UNION
    SELECT cm.user_id FROM public.company_members cm
    WHERE o.helper_type = 'company' AND cm.company_id = o.helper_id AND upper(cm.role::text) IN ('ADMIN', 'OWNER')
  LOOP
    CONTINUE WHEN rcpt IS NULL OR rcpt = uid;
    CONTINUE WHEN EXISTS (SELECT 1 FROM public.opportunity_requests r
                          WHERE r.match_id = p_match_id AND r.requester_id = uid AND r.recipient_id = rcpt);

    SELECT c.id INTO conv
    FROM public.conversations c
    JOIN public.conversation_participants a ON a.conversation_id = c.id AND a.user_id = uid
    JOIN public.conversation_participants b ON b.conversation_id = c.id AND b.user_id = rcpt
    WHERE c.is_group = false
    LIMIT 1;
    IF conv IS NULL THEN
      INSERT INTO public.conversations (created_by, is_group) VALUES (uid, false) RETURNING id INTO conv;
      INSERT INTO public.conversation_participants (conversation_id, user_id) VALUES (conv, uid), (conv, rcpt);
    END IF;

    INSERT INTO public.direct_messages (conversation_id, sender_id, content)
    VALUES (conv, uid, body) RETURNING id INTO msg;
    UPDATE public.conversations SET updated_at = now() WHERE id = conv;

    INSERT INTO public.opportunity_requests (match_id, requester_id, recipient_id, conversation_id, message_id)
    VALUES (p_match_id, uid, rcpt, conv, msg);

    recipient_id := rcpt; conversation_id := conv; message_id := msg;
    RETURN NEXT;
    conv := NULL;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.request_opportunity_help(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_opportunity_help(uuid, text) TO authenticated;
