-- Sécurité : les règles d'accès des salons de discussion et des messages appliquées par la base.
--
-- Avant cette migration :
--   - feed_posts, comments et post_attachments étaient lisibles par tout le monde, même sans compte :
--     les messages d'un salon réservé (« Équipe », rôles choisis, admins) se lisaient en interrogeant
--     la base directement ; la règle n'était appliquée que par l'écran (src/lib/permissions.ts) ;
--   - la visibilité par message (« membres », « admins ») n'était, elle aussi, filtrée que par l'écran ;
--   - quest_subtasks était lisible par tous, y compris pour une quête en brouillon.
--
-- Après : mêmes règles que l'écran (evaluateAudience), appliquées par la base.
--   - Salon de guilde : PUBLIC, FOLLOWERS, MEMBERS, ACTIVE_ROLES, SELECTED_ROLES, OPERATIONS_TEAM,
--     ADMINS_ONLY ; un admin de la guilde ou le rôle « Source » voit tout. Un rôle expiré
--     (entity_member_roles.expires_at passé) ne compte plus.
--   - Les anciens messages de discussion de guilde sans salon suivent le salon par défaut de la guilde.
--   - Visibilité d'un message (public / members / admins), pour les discussions de guilde et de quête.
--   - Réponses (comments sur un FEED_POST) et pièces jointes : visibles si le message l'est.
--   - Écrire dans un salon ou y répondre : mêmes règles que l'écran (can_post / can_reply).
--   - Sous-tâches : visibles si la quête l'est (brouillon = son auteur et les admins), ou par la personne assignée.
--   - L'auteur voit toujours ses propres messages.
-- Non modifié : les salons de quête (scope QUEST) gardent leur comportement actuel (l'écran ne les filtre pas).

-- ---------------------------------------------------------------------------
-- 1. Évaluation d'une audience de guilde (même logique que src/lib/permissions.ts)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guild_audience_allows(
  p_guild_id uuid, p_user_id uuid, p_audience text, p_role_ids uuid[]
) RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member_role text;
  v_role_ids uuid[];
  v_role_names text[];
  v_source boolean;
BEGIN
  IF p_audience = 'PUBLIC' THEN
    RETURN true;
  END IF;
  IF p_user_id IS NULL OR p_guild_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT gm.role INTO v_member_role
  FROM public.guild_members gm
  WHERE gm.guild_id = p_guild_id AND gm.user_id = p_user_id
  LIMIT 1;

  SELECT COALESCE(array_agg(er.id), '{}'), COALESCE(array_agg(er.name), '{}'),
         COALESCE(bool_or(er.is_default AND er.name = 'Source'), false)
    INTO v_role_ids, v_role_names, v_source
  FROM public.entity_member_roles emr
  JOIN public.entity_roles er ON er.id = emr.entity_role_id
  WHERE emr.user_id = p_user_id
    AND er.entity_type = 'guild' AND er.entity_id = p_guild_id
    AND (emr.expires_at IS NULL OR emr.expires_at > now());

  IF v_member_role = 'ADMIN' OR v_source THEN
    RETURN true;
  END IF;

  RETURN CASE p_audience
    WHEN 'FOLLOWERS' THEN v_member_role IS NOT NULL OR EXISTS (
      SELECT 1 FROM public.follows f
      WHERE f.follower_id = p_user_id AND f.target_type = 'GUILD' AND f.target_id = p_guild_id::text)
    WHEN 'MEMBERS' THEN v_member_role IS NOT NULL
    WHEN 'ACTIVE_ROLES' THEN v_member_role IS NOT NULL AND cardinality(v_role_ids) > 0
    WHEN 'SELECTED_ROLES' THEN v_member_role IS NOT NULL AND COALESCE(v_role_ids && p_role_ids, false)
    WHEN 'OPERATIONS_TEAM' THEN v_member_role IS NOT NULL
      AND EXISTS (SELECT 1 FROM unnest(v_role_names) n WHERE lower(n) = 'operations')
    ELSE false   -- ADMINS_ONLY (admin déjà traité plus haut) et toute valeur inconnue
  END;
END;
$$;

-- Action sur un salon : 'view', 'post', 'reply'. Salon de quête : inchangé (autorisé).
CREATE OR REPLACE FUNCTION public.room_allows(p_room_id uuid, p_user_id uuid, p_action text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
BEGIN
  SELECT * INTO r FROM public.discussion_rooms WHERE id = p_room_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  IF r.scope_type <> 'GUILD' THEN
    RETURN true;
  END IF;
  -- Comme l'écran : pour écrire ou répondre, il faut aussi pouvoir voir le salon.
  IF NOT public.guild_audience_allows(r.scope_id, p_user_id, r.audience_type, r.allowed_role_ids) THEN
    RETURN false;
  END IF;
  RETURN CASE p_action
    WHEN 'view' THEN true
    WHEN 'post' THEN public.guild_audience_allows(r.scope_id, p_user_id, r.can_post_audience_type, r.allowed_role_ids)
    WHEN 'reply' THEN public.guild_audience_allows(r.scope_id, p_user_id, r.can_reply_audience_type, r.allowed_role_ids)
    ELSE false
  END;
END;
$$;

-- Lecture d'un message : salon, ancien message de discussion sans salon, visibilité du message.
CREATE OR REPLACE FUNCTION public.feed_post_readable(
  p_room_id uuid, p_context_type text, p_context_id uuid, p_visibility text, p_user_id uuid
) RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ctx text := upper(COALESCE(p_context_type, ''));
  v_guild uuid;
  v_default record;
  v_member_role text;
BEGIN
  IF p_room_id IS NOT NULL THEN
    IF NOT public.room_allows(p_room_id, p_user_id, 'view') THEN
      RETURN false;
    END IF;
  ELSIF v_ctx = 'GUILD_DISCUSSION' AND p_context_id IS NOT NULL THEN
    -- Ancien message sans salon : affiché dans le salon par défaut, il en suit la règle.
    SELECT * INTO v_default FROM public.discussion_rooms
    WHERE scope_type = 'GUILD' AND scope_id = p_context_id AND is_default
    ORDER BY created_at LIMIT 1;
    IF FOUND AND NOT public.guild_audience_allows(p_context_id, p_user_id, v_default.audience_type, v_default.allowed_role_ids) THEN
      RETURN false;
    END IF;
  END IF;

  IF COALESCE(p_visibility, 'public') = 'public' THEN
    RETURN true;
  END IF;

  -- Visibilité « members » / « admins » : choisie dans les discussions de guilde et de quête.
  IF v_ctx IN ('GUILD', 'GUILD_DISCUSSION') THEN
    v_guild := p_context_id;
  ELSIF v_ctx IN ('QUEST', 'QUEST_DISCUSSION') THEN
    SELECT q.guild_id INTO v_guild FROM public.quests q WHERE q.id = p_context_id;
  END IF;
  IF v_guild IS NULL THEN
    -- Pas de guilde de référence : « membres » = personne connectée, « admins » = admin de la plateforme.
    RETURN CASE p_visibility
      WHEN 'members' THEN p_user_id IS NOT NULL
      ELSE COALESCE(public.has_role(p_user_id, 'admin'::app_role), false)
    END;
  END IF;
  SELECT gm.role INTO v_member_role FROM public.guild_members gm
  WHERE gm.guild_id = v_guild AND gm.user_id = p_user_id LIMIT 1;
  RETURN CASE p_visibility
    WHEN 'members' THEN v_member_role IS NOT NULL
    WHEN 'admins' THEN v_member_role = 'ADMIN'
    ELSE false
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.guild_audience_allows(uuid, uuid, text, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.room_allows(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.feed_post_readable(uuid, text, uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.guild_audience_allows(uuid, uuid, text, uuid[]) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.room_allows(uuid, uuid, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.feed_post_readable(uuid, text, uuid, text, uuid) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Salons : la liste ne montre que les salons visibles (ou créés par soi ; admin de la plateforme)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can read rooms" ON public.discussion_rooms;
CREATE POLICY "Users read rooms they can view"
  ON public.discussion_rooms FOR SELECT TO authenticated
  USING (
    created_by_user_id = auth.uid()
    OR public.room_allows(id, auth.uid(), 'view')
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

-- ---------------------------------------------------------------------------
-- 3. Messages
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Anyone can read feed posts" ON public.feed_posts;
CREATE POLICY "Read feed posts allowed by room and visibility"
  ON public.feed_posts FOR SELECT
  USING (
    (NOT is_deleted AND public.feed_post_readable(room_id, context_type, context_id, visibility, auth.uid()))
    OR author_user_id = auth.uid()
  );

DROP POLICY IF EXISTS "Authenticated users can create posts" ON public.feed_posts;
CREATE POLICY "Authenticated users can create posts"
  ON public.feed_posts FOR INSERT
  WITH CHECK (
    auth.uid() = author_user_id
    AND (room_id IS NULL OR public.room_allows(room_id, auth.uid(), 'post'))
  );

-- ---------------------------------------------------------------------------
-- 4. Réponses et pièces jointes : suivent le message
-- ---------------------------------------------------------------------------
-- Message lisible (ou, avec p_action = 'reply', ouvert aux réponses) pour cette personne.
-- comments.target_id est un texte : on vérifie qu'il ressemble à un identifiant avant de le convertir.
CREATE OR REPLACE FUNCTION public.feed_post_allows(p_post_id text, p_user_id uuid, p_action text DEFAULT 'view')
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  fp record;
BEGIN
  IF p_post_id IS NULL OR p_post_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN false;
  END IF;
  SELECT id, room_id, context_type, context_id, visibility, is_deleted, author_user_id
    INTO fp FROM public.feed_posts WHERE id = p_post_id::uuid;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  IF NOT ((NOT fp.is_deleted AND public.feed_post_readable(fp.room_id, fp.context_type, fp.context_id, fp.visibility, p_user_id))
          OR (p_user_id IS NOT NULL AND fp.author_user_id = p_user_id)) THEN
    RETURN false;
  END IF;
  IF p_action = 'reply' AND fp.room_id IS NOT NULL THEN
    RETURN public.room_allows(fp.room_id, p_user_id, 'reply');
  END IF;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.feed_post_allows(text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.feed_post_allows(text, uuid, text) TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "Comments are viewable by everyone" ON public.comments;
CREATE POLICY "Comments are viewable when their target is"
  ON public.comments FOR SELECT
  USING (
    is_deleted = false
    AND (target_type <> 'FEED_POST' OR public.feed_post_allows(target_id, auth.uid(), 'view'))
  );

DROP POLICY IF EXISTS "Authenticated users can create comments" ON public.comments;
CREATE POLICY "Authenticated users can create comments"
  ON public.comments FOR INSERT
  WITH CHECK (
    auth.uid() = author_id
    AND (target_type <> 'FEED_POST' OR public.feed_post_allows(target_id, auth.uid(), 'reply'))
  );

DROP POLICY IF EXISTS "Anyone can read post attachments" ON public.post_attachments;
CREATE POLICY "Post attachments are viewable when their post is"
  ON public.post_attachments FOR SELECT
  USING (public.feed_post_allows(post_id::text, auth.uid(), 'view'));

-- ---------------------------------------------------------------------------
-- 5. Sous-tâches : visibles si la quête l'est (règles de quests), ou par la personne assignée
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Subtasks viewable by everyone" ON public.quest_subtasks;
CREATE POLICY "Subtasks viewable with their quest"
  ON public.quest_subtasks FOR SELECT
  USING (
    assignee_user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.quests q WHERE q.id = quest_subtasks.quest_id)
  );
