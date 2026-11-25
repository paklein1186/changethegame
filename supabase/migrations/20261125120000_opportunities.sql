-- Opportunités : relier les besoins des projets à ce que les personnes, guildes et organisations peuvent offrir.
--
--   capabilities          ce qu'une personne / guilde / organisation peut offrir, inféré de son activité
--                         (tâches faites, quêtes menées, services, cours, attestations, CV fourni…) ou ajouté
--                         à la main. Une capacité inférée n'est visible que par son titulaire tant qu'il ne
--                         l'a pas confirmée.
--   capability_inputs     texte de CV / profil LinkedIn collé par la personne (privé).
--   need_suggestions      besoins détectés dans une quête : explicites (écrits) ou implicites (déduits du type
--                         de projet et de projets comparables). Validés ou écartés par qui gère la quête.
--   opportunity_needs     table de travail du moteur : chaque besoin actif avec son vecteur (service seul).
--   opportunity_matches   besoin ↔ capacité, avec score et explication (service seul, lue via get_opportunities).
--   opportunity_feedback  « je peux aider » / « pas pertinent » / « plus tard », par personne.
--
-- Le moteur (fonction opportunity-engine) remplit ces tables ; l'interface lit via les fonctions ci-dessous,
-- qui appliquent la confidentialité (quêtes privées, capacités non confirmées, besoins implicites).
CREATE EXTENSION IF NOT EXISTS vector;

-- ── Capacités ────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.capabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type text NOT NULL CHECK (owner_type IN ('profile', 'guild', 'company')),
  owner_id uuid NOT NULL,
  label text NOT NULL,
  category text NOT NULL DEFAULT 'SKILLS'
    CHECK (category IN ('SKILLS', 'TOOLS', 'PLACE', 'FUNDING', 'MENTORSHIP', 'VISIBILITY', 'PARTNERSHIPS', 'VOLUNTEER')),
  description text,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence numeric NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  status text NOT NULL DEFAULT 'inferred' CHECK (status IN ('inferred', 'confirmed', 'dismissed')),
  source text NOT NULL DEFAULT 'inferred' CHECK (source IN ('inferred', 'manual')),
  embedding vector(1536),
  embedded_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS capabilities_owner_label_uniq ON public.capabilities (owner_type, owner_id, lower(label));
CREATE INDEX IF NOT EXISTS capabilities_owner_idx ON public.capabilities (owner_type, owner_id);
CREATE INDEX IF NOT EXISTS capabilities_embedding_idx ON public.capabilities USING hnsw (embedding vector_cosine_ops);

-- Peut gérer les capacités de ce titulaire : soi-même, admin de la guilde, admin de l'organisation.
CREATE OR REPLACE FUNCTION public.can_manage_capability_owner(_owner_type text, _owner_id uuid, _uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _uid IS NOT NULL AND (
    (_owner_type = 'profile' AND _owner_id = _uid)
    OR (_owner_type = 'guild' AND public.is_guild_admin(_owner_id, _uid))
    OR (_owner_type = 'company' AND EXISTS (
          SELECT 1 FROM public.company_members m
          WHERE m.company_id = _owner_id AND m.user_id = _uid AND upper(m.role::text) IN ('ADMIN', 'OWNER')))
    OR public.has_role(_uid, 'admin')
  )
$$;
REVOKE ALL ON FUNCTION public.can_manage_capability_owner(text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_capability_owner(text, uuid, uuid) TO authenticated, service_role;

ALTER TABLE public.capabilities ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.capabilities FROM anon, authenticated;
-- Le navigateur ne lit jamais les vecteurs : lecture colonne par colonne, sans embedding ni embedded_hash.
GRANT SELECT (id, owner_type, owner_id, label, category, description, evidence, confidence, status, source, created_at, updated_at)
  ON public.capabilities TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.capabilities TO authenticated;
GRANT ALL ON public.capabilities TO service_role;

DROP POLICY IF EXISTS "Capabilities: owner or confirmed" ON public.capabilities;
CREATE POLICY "Capabilities: owner or confirmed" ON public.capabilities FOR SELECT TO authenticated
  USING (status = 'confirmed' OR public.can_manage_capability_owner(owner_type, owner_id, auth.uid()));
DROP POLICY IF EXISTS "Capabilities: owner adds" ON public.capabilities;
CREATE POLICY "Capabilities: owner adds" ON public.capabilities FOR INSERT TO authenticated
  WITH CHECK (source = 'manual' AND status = 'confirmed' AND public.can_manage_capability_owner(owner_type, owner_id, auth.uid()));
DROP POLICY IF EXISTS "Capabilities: owner edits" ON public.capabilities;
CREATE POLICY "Capabilities: owner edits" ON public.capabilities FOR UPDATE TO authenticated
  USING (public.can_manage_capability_owner(owner_type, owner_id, auth.uid()))
  WITH CHECK (public.can_manage_capability_owner(owner_type, owner_id, auth.uid()));
DROP POLICY IF EXISTS "Capabilities: owner deletes" ON public.capabilities;
CREATE POLICY "Capabilities: owner deletes" ON public.capabilities FOR DELETE TO authenticated
  USING (public.can_manage_capability_owner(owner_type, owner_id, auth.uid()));

-- Une modification par le titulaire (texte, statut) oblige le moteur à recalculer le vecteur.
CREATE OR REPLACE FUNCTION public.capabilities_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  IF TG_OP = 'UPDATE' AND (NEW.label IS DISTINCT FROM OLD.label OR NEW.description IS DISTINCT FROM OLD.description) THEN
    NEW.embedded_hash := NULL;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_capabilities_touch ON public.capabilities;
CREATE TRIGGER trg_capabilities_touch BEFORE UPDATE ON public.capabilities
  FOR EACH ROW EXECUTE FUNCTION public.capabilities_touch();

-- Empreinte des sources utilisées pour la dernière inférence, par titulaire (service seul).
CREATE TABLE IF NOT EXISTS public.capability_runs (
  owner_type text NOT NULL,
  owner_id uuid NOT NULL,
  evidence_hash text NOT NULL,
  inferred_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_type, owner_id)
);
ALTER TABLE public.capability_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.capability_runs FROM anon, authenticated;
GRANT ALL ON public.capability_runs TO service_role;

-- CV / profil LinkedIn collé par la personne : lisible et modifiable par elle seule.
CREATE TABLE IF NOT EXISTS public.capability_inputs (
  user_id uuid PRIMARY KEY,
  cv_text text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.capability_inputs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.capability_inputs FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.capability_inputs TO authenticated;
GRANT ALL ON public.capability_inputs TO service_role;
DROP POLICY IF EXISTS "Capability inputs: own" ON public.capability_inputs;
CREATE POLICY "Capability inputs: own" ON public.capability_inputs FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ── Besoins détectés dans les quêtes ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_quest_manager(_quest_id uuid, _uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _uid IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.quests q WHERE q.id = _quest_id AND q.created_by_user_id = _uid)
    OR EXISTS (SELECT 1 FROM public.quest_participants p
               WHERE p.quest_id = _quest_id AND p.user_id = _uid AND upper(coalesce(p.role::text, '')) IN ('ADMIN', 'OWNER', 'HOST', 'CO_HOST'))
    OR EXISTS (SELECT 1 FROM public.quests q WHERE q.id = _quest_id AND q.guild_id IS NOT NULL AND public.is_guild_admin(q.guild_id, _uid))
    OR public.has_role(_uid, 'admin')
  )
$$;
REVOKE ALL ON FUNCTION public.is_quest_manager(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_quest_manager(uuid, uuid) TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.need_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quest_id uuid NOT NULL REFERENCES public.quests(id) ON DELETE CASCADE,
  label text NOT NULL,
  category text NOT NULL DEFAULT 'GENERAL'
    CHECK (category IN ('GENERAL', 'SKILLS', 'TOOLS', 'PLACE', 'FUNDING', 'MENTORSHIP', 'VISIBILITY', 'PARTNERSHIPS', 'VOLUNTEER')),
  kind text NOT NULL DEFAULT 'implied' CHECK (kind IN ('explicit', 'implied')),
  reason text,
  priority smallint NOT NULL DEFAULT 2 CHECK (priority BETWEEN 1 AND 3),
  status text NOT NULL DEFAULT 'suggested' CHECK (status IN ('suggested', 'accepted', 'dismissed')),
  quest_need_id uuid REFERENCES public.quest_needs(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS need_suggestions_quest_label_uniq ON public.need_suggestions (quest_id, lower(label));

ALTER TABLE public.need_suggestions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.need_suggestions FROM anon;
GRANT SELECT, UPDATE ON public.need_suggestions TO authenticated;
GRANT ALL ON public.need_suggestions TO service_role;
DROP POLICY IF EXISTS "Need suggestions: quest managers read" ON public.need_suggestions;
CREATE POLICY "Need suggestions: quest managers read" ON public.need_suggestions FOR SELECT TO authenticated
  USING (public.is_quest_manager(quest_id, auth.uid()));
DROP POLICY IF EXISTS "Need suggestions: quest managers update" ON public.need_suggestions;
CREATE POLICY "Need suggestions: quest managers update" ON public.need_suggestions FOR UPDATE TO authenticated
  USING (public.is_quest_manager(quest_id, auth.uid())) WITH CHECK (public.is_quest_manager(quest_id, auth.uid()));

-- Valider une suggestion : elle devient un vrai besoin de la quête.
CREATE OR REPLACE FUNCTION public.accept_need_suggestion(_suggestion_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s record; nid uuid;
BEGIN
  SELECT * INTO s FROM public.need_suggestions WHERE id = _suggestion_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Suggestion not found'; END IF;
  IF NOT public.is_quest_manager(s.quest_id, auth.uid()) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF s.quest_need_id IS NOT NULL THEN RETURN s.quest_need_id; END IF;
  INSERT INTO public.quest_needs (quest_id, title, description, category, status, created_by_user_id)
  VALUES (s.quest_id, s.label, s.reason, s.category, 'OPEN', auth.uid())
  RETURNING id INTO nid;
  UPDATE public.need_suggestions SET status = 'accepted', quest_need_id = nid, updated_at = now() WHERE id = s.id;
  RETURN nid;
END $$;
REVOKE ALL ON FUNCTION public.accept_need_suggestion(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_need_suggestion(uuid) TO authenticated;

-- ── Tables de travail du moteur (service seul) ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.opportunity_needs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL CHECK (source IN ('quest_need', 'suggestion')),
  source_id uuid NOT NULL,
  quest_id uuid NOT NULL REFERENCES public.quests(id) ON DELETE CASCADE,
  label text NOT NULL,
  category text NOT NULL DEFAULT 'GENERAL',
  kind text NOT NULL DEFAULT 'explicit',
  content_hash text NOT NULL,
  embedding vector(1536),
  matched_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, source_id)
);
ALTER TABLE public.opportunity_needs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.opportunity_needs FROM anon, authenticated;
GRANT ALL ON public.opportunity_needs TO service_role;

CREATE TABLE IF NOT EXISTS public.opportunity_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  need_id uuid NOT NULL REFERENCES public.opportunity_needs(id) ON DELETE CASCADE,
  capability_id uuid NOT NULL REFERENCES public.capabilities(id) ON DELETE CASCADE,
  quest_id uuid NOT NULL REFERENCES public.quests(id) ON DELETE CASCADE,
  score numeric NOT NULL,
  similarity numeric NOT NULL,
  reason_fr text,
  reason_en text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (need_id, capability_id)
);
CREATE INDEX IF NOT EXISTS opportunity_matches_quest_idx ON public.opportunity_matches (quest_id);
CREATE INDEX IF NOT EXISTS opportunity_matches_capability_idx ON public.opportunity_matches (capability_id);
ALTER TABLE public.opportunity_matches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.opportunity_matches FROM anon, authenticated;
GRANT ALL ON public.opportunity_matches TO service_role;

CREATE TABLE IF NOT EXISTS public.opportunity_feedback (
  match_id uuid NOT NULL REFERENCES public.opportunity_matches(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  verdict text NOT NULL CHECK (verdict IN ('help', 'not_relevant', 'later')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (match_id, user_id)
);
ALTER TABLE public.opportunity_feedback ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.opportunity_feedback FROM anon;
GRANT SELECT ON public.opportunity_feedback TO authenticated;
GRANT ALL ON public.opportunity_feedback TO service_role;
DROP POLICY IF EXISTS "Opportunity feedback: own" ON public.opportunity_feedback;
CREATE POLICY "Opportunity feedback: own" ON public.opportunity_feedback FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Recherche vectorielle des capacités (moteur seulement).
CREATE OR REPLACE FUNCTION public.match_capabilities(p_embedding vector(1536), p_count integer DEFAULT 15)
RETURNS TABLE (id uuid, owner_type text, owner_id uuid, label text, description text, category text,
               evidence jsonb, confidence numeric, status text, similarity float)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.owner_type, c.owner_id, c.label, c.description, c.category, c.evidence, c.confidence, c.status,
         1 - (c.embedding <=> p_embedding) AS similarity
  FROM public.capabilities c
  WHERE c.embedding IS NOT NULL AND c.status <> 'dismissed'
  ORDER BY c.embedding <=> p_embedding
  LIMIT LEAST(GREATEST(p_count, 1), 50);
$$;
REVOKE ALL ON FUNCTION public.match_capabilities(vector, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.match_capabilities(vector, integer) TO service_role;

-- ── Lecture : les opportunités qu'une personne a le droit de voir ────────────────────────────────
-- p_scope : 'me' (ce qui me concerne : je peux aider, ou on peut aider mes quêtes), 'guilds' (mes guildes),
--           'all' (toute la plateforme). p_guild_id : restreint à une guilde (ses quêtes, elle-même, ses membres).
CREATE OR REPLACE FUNCTION public.get_opportunities(
  p_scope text DEFAULT 'me',
  p_guild_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 60
)
RETURNS TABLE (
  match_id uuid, direction text, quest_id uuid, quest_title text, need_label text, need_kind text, need_category text,
  helper_type text, helper_id uuid, helper_name text, helper_avatar text, capability_label text, capability_status text,
  reason_fr text, reason_en text, score numeric, territory_ids uuid[], territory_names text[], topic_ids uuid[],
  my_verdict text, updated_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH me AS (SELECT auth.uid() AS uid),
  my_guilds AS (SELECT gm.guild_id FROM public.guild_members gm, me WHERE gm.user_id = me.uid),
  my_companies AS (SELECT cm.company_id FROM public.company_members cm, me WHERE cm.user_id = me.uid),
  rows AS (
    SELECT m.id AS match_id, m.quest_id, q.title AS quest_title, q.public_visibility, q.guild_id AS quest_guild_id,
           q.created_by_user_id AS quest_owner,
           n.label AS need_label, n.kind AS need_kind, n.category AS need_category,
           c.owner_type AS helper_type, c.owner_id AS helper_id, c.label AS capability_label, c.status AS capability_status,
           m.reason_fr, m.reason_en, m.score, m.updated_at,
           public.is_quest_manager(m.quest_id, (SELECT uid FROM me)) AS i_manage_quest,
           (c.owner_type = 'profile' AND c.owner_id = (SELECT uid FROM me))
             OR (c.owner_type = 'guild' AND c.owner_id IN (SELECT guild_id FROM my_guilds))
             OR (c.owner_type = 'company' AND c.owner_id IN (SELECT company_id FROM my_companies)) AS i_am_helper
    FROM public.opportunity_matches m
    JOIN public.opportunity_needs n ON n.id = m.need_id
    JOIN public.capabilities c ON c.id = m.capability_id
    JOIN public.quests q ON q.id = m.quest_id
    WHERE q.is_deleted = false AND coalesce(q.is_draft, false) = false
  ),
  visible AS (
    SELECT r.* FROM rows r, me
    WHERE me.uid IS NOT NULL
      -- quête privée : réservée à celles et ceux qui y participent (ou à sa guilde)
      AND (r.public_visibility = 'public' OR r.i_manage_quest
           OR EXISTS (SELECT 1 FROM public.quest_participants p WHERE p.quest_id = r.quest_id AND p.user_id = me.uid)
           OR (r.quest_guild_id IS NOT NULL AND r.quest_guild_id IN (SELECT guild_id FROM my_guilds)))
      -- capacité non confirmée : seulement son titulaire la voit
      AND (r.capability_status = 'confirmed' OR r.i_am_helper)
      -- besoin implicite (pas encore validé) : seulement qui gère la quête, ou le titulaire de la capacité
      AND (r.need_kind = 'explicit' OR r.i_manage_quest OR r.i_am_helper)
      -- jamais se suggérer soi-même à sa propre quête
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
         v.capability_label, v.capability_status, v.reason_fr, v.reason_en, v.score,
         ARRAY(SELECT qt.territory_id FROM public.quest_territories qt WHERE qt.quest_id = v.quest_id),
         ARRAY(SELECT t.name FROM public.quest_territories qt JOIN public.territories t ON t.id = qt.territory_id
               WHERE qt.quest_id = v.quest_id AND t.is_deleted = false ORDER BY qt.is_primary DESC NULLS LAST),
         ARRAY(SELECT tp.topic_id FROM public.quest_topics tp WHERE tp.quest_id = v.quest_id),
         (SELECT f.verdict FROM public.opportunity_feedback f, me WHERE f.match_id = v.match_id AND f.user_id = me.uid),
         v.updated_at
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
  ORDER BY (v.i_am_helper OR v.i_manage_quest) DESC, v.score DESC, v.updated_at DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 200);
$$;
REVOKE ALL ON FUNCTION public.get_opportunities(text, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_opportunities(text, uuid, integer) TO authenticated;

-- Retour sur une opportunité. « Je peux aider » prévient qui gère la quête (notification sur la plateforme).
CREATE OR REPLACE FUNCTION public.set_opportunity_feedback(p_match_id uuid, p_verdict text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); r record; helper_name text; already text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_verdict NOT IN ('help', 'not_relevant', 'later') THEN RAISE EXCEPTION 'Invalid verdict'; END IF;
  -- Ne réagir qu'à une opportunité que l'on voit réellement.
  SELECT * INTO r FROM public.get_opportunities('all', NULL, 200) o WHERE o.match_id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Opportunity not found'; END IF;
  SELECT verdict INTO already FROM public.opportunity_feedback WHERE match_id = p_match_id AND user_id = uid;

  INSERT INTO public.opportunity_feedback (match_id, user_id, verdict) VALUES (p_match_id, uid, p_verdict)
  ON CONFLICT (match_id, user_id) DO UPDATE SET verdict = EXCLUDED.verdict, created_at = now();

  IF p_verdict = 'help' AND r.direction = 'you_can_help' AND already IS DISTINCT FROM 'help' THEN
    SELECT name INTO helper_name FROM public.profiles WHERE user_id = uid;
    INSERT INTO public.notifications (user_id, type, title, body, deep_link_url, related_entity_type, related_entity_id, data)
    SELECT q.created_by_user_id, 'OPPORTUNITY_HELP',
           '🤝 ' || coalesce(helper_name, '?') || ' — ' || r.need_label,
           r.quest_title, '/quests/' || r.quest_id, 'QUEST', r.quest_id::text,
           jsonb_build_object('match_id', p_match_id, 'helper_id', uid, 'need', r.need_label, 'capability', r.capability_label)
    FROM public.quests q WHERE q.id = r.quest_id AND q.created_by_user_id <> uid;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.set_opportunity_feedback(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_opportunity_feedback(uuid, text) TO authenticated;
