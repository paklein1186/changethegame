-- Accès aux quêtes, sur le modèle des membranes de guilde, appliqué par la base.
--
-- Réglage d'une quête (quests.access_mode) :
--   inherit  : suit le réglage par défaut de sa guilde (guilds.quest_access_default) ; sans guilde : public.
--   public   : transparence complète, tout le monde voit tout (même sans compte).
--   members  : les membres en règle de la guilde (cotisation à jour si la guilde a une adhésion) voient tout ;
--              les autres ne voient rien.
--   selected : les membres en règle qui ont une formule (access_plans, ex. accompagnant_freelance) ou un rôle
--              de guilde (access_role_ids) choisis voient tout ; les autres membres en règle voient la fiche
--              (titre, résumé, enjeux) et peuvent demander l'accès ; hors guilde ou simple abonné : rien.
--   hidden   : cachée à tous sauf ses admins et les superadmins.
-- Sans guilde, « membres » = membres de l'organisation porteuse ou co-hôte de la quête.
--
-- Voient toujours tout : les admins de la quête (créateur, participants ADMIN/OWNER/HOST/CO_HOST, admins de sa
-- guilde, admins des entités co-hôtes), les superadmins, ses participants, et les personnes à qui un admin a
-- accordé une permission personnelle (révocable), y compris hors membranes.
--
-- Niveaux renvoyés par quest_access_level : 'full' (tout), 'teaser' (la fiche de la quête seulement), 'none'.
-- La fiche (ligne de quests) se lit au niveau teaser ; besoins, actualités, sous-tâches, contributions,
-- participants, discussions et fichiers demandent 'full' (politiques restrictives ajoutées à l'existant).
--
-- Une guilde peut aussi être administrée par des entités (autres guildes, organisations) : leurs admins
-- deviennent admins de la guilde (is_guild_admin), sans cascade (seuls les admins directs de l'entité).

-- ---------------------------------------------------------------------------
-- 1. Réglages
-- ---------------------------------------------------------------------------
ALTER TABLE public.quests
  ADD COLUMN IF NOT EXISTS access_mode text NOT NULL DEFAULT 'inherit',
  ADD COLUMN IF NOT EXISTS access_plans text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS access_role_ids uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE public.quests DROP CONSTRAINT IF EXISTS quests_access_mode_check;
ALTER TABLE public.quests ADD CONSTRAINT quests_access_mode_check
  CHECK (access_mode IN ('inherit', 'public', 'members', 'selected', 'hidden'));

ALTER TABLE public.guilds
  ADD COLUMN IF NOT EXISTS quest_access_default text NOT NULL DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS quest_access_plans text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS quest_access_role_ids uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE public.guilds DROP CONSTRAINT IF EXISTS guilds_quest_access_default_check;
ALTER TABLE public.guilds ADD CONSTRAINT guilds_quest_access_default_check
  CHECK (quest_access_default IN ('public', 'members', 'selected', 'hidden'));

-- ---------------------------------------------------------------------------
-- 2. Entités administratrices d'une guilde
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.guild_admin_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id uuid NOT NULL REFERENCES public.guilds(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN ('GUILD', 'COMPANY')),
  entity_id uuid NOT NULL,
  added_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (guild_id, entity_type, entity_id),
  CHECK (NOT (entity_type = 'GUILD' AND entity_id = guild_id))
);
CREATE INDEX IF NOT EXISTS idx_guild_admin_entities_entity ON public.guild_admin_entities (entity_type, entity_id);
ALTER TABLE public.guild_admin_entities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Guild admin entities are readable" ON public.guild_admin_entities;
CREATE POLICY "Guild admin entities are readable" ON public.guild_admin_entities FOR SELECT USING (true);
-- Écriture : uniquement par set_guild_admin_entity (ci-dessous).

-- Admin direct d'une guilde (créateur ou membre ADMIN), sans passer par les entités.
CREATE OR REPLACE FUNCTION public.is_direct_guild_admin(_guild_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.guilds g WHERE g.id = _guild_id AND g.created_by_user_id = _user_id)
    OR EXISTS (SELECT 1 FROM public.guild_members gm
               WHERE gm.guild_id = _guild_id AND gm.user_id = _user_id AND gm.role = 'ADMIN'::guild_member_role)
  )
$$;

CREATE OR REPLACE FUNCTION public.is_company_admin(_company_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.company_id = _company_id AND cm.user_id = _user_id AND upper(cm.role) IN ('ADMIN', 'OWNER')
  )
$$;

-- Admin d'une guilde : direct, ou admin direct d'une entité qui l'administre.
CREATE OR REPLACE FUNCTION public.is_guild_admin(_guild_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_direct_guild_admin(_guild_id, _user_id)
    OR EXISTS (
      SELECT 1 FROM public.guild_admin_entities e
      WHERE e.guild_id = _guild_id
        AND ((e.entity_type = 'GUILD' AND public.is_direct_guild_admin(e.entity_id, _user_id))
          OR (e.entity_type = 'COMPANY' AND public.is_company_admin(e.entity_id, _user_id)))
    )
$$;

-- Ajouter ou retirer une entité administratrice (admin de la guilde seulement).
CREATE OR REPLACE FUNCTION public.set_guild_admin_entity(p_guild_id uuid, p_entity_type text, p_entity_id uuid, p_add boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_guild_admin(p_guild_id, auth.uid()) THEN
    RAISE EXCEPTION 'Only guild admins can change who administers the guild' USING ERRCODE = '42501';
  END IF;
  IF p_entity_type NOT IN ('GUILD', 'COMPANY') THEN RAISE EXCEPTION 'Invalid entity type'; END IF;
  IF p_add THEN
    IF p_entity_type = 'GUILD' AND NOT EXISTS (SELECT 1 FROM guilds WHERE id = p_entity_id AND coalesce(is_deleted, false) = false) THEN
      RAISE EXCEPTION 'Guild not found';
    END IF;
    IF p_entity_type = 'COMPANY' AND NOT EXISTS (SELECT 1 FROM companies WHERE id = p_entity_id AND coalesce(is_deleted, false) = false) THEN
      RAISE EXCEPTION 'Organisation not found';
    END IF;
    INSERT INTO guild_admin_entities (guild_id, entity_type, entity_id, added_by)
    VALUES (p_guild_id, p_entity_type, p_entity_id, auth.uid())
    ON CONFLICT (guild_id, entity_type, entity_id) DO NOTHING;
  ELSE
    DELETE FROM guild_admin_entities WHERE guild_id = p_guild_id AND entity_type = p_entity_type AND entity_id = p_entity_id;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Qui administre une quête
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_platform_superadmin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_roles ur WHERE ur.user_id = _user_id AND ur.role::text IN ('admin', 'superadmin'))
$$;

CREATE OR REPLACE FUNCTION public.quest_primary_guild(_quest_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(
    (SELECT q.guild_id FROM public.quests q WHERE q.id = _quest_id),
    (SELECT h.entity_id FROM public.quest_hosts h
      WHERE h.quest_id = _quest_id AND upper(h.entity_type) = 'GUILD' ORDER BY h.created_at LIMIT 1),
    (SELECT q.owner_id::uuid FROM public.quests q WHERE q.id = _quest_id AND upper(coalesce(q.owner_type, '')) = 'GUILD'))
$$;

CREATE OR REPLACE FUNCTION public.is_quest_admin(_quest_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.quests q WHERE q.id = _quest_id AND q.created_by_user_id = _user_id)
    OR EXISTS (SELECT 1 FROM public.quest_participants p
               WHERE p.quest_id = _quest_id AND p.user_id = _user_id
                 AND upper(coalesce(p.role::text, '')) IN ('ADMIN', 'OWNER', 'HOST', 'CO_HOST'))
    OR EXISTS (SELECT 1 FROM public.quests q WHERE q.id = _quest_id AND (
         (q.guild_id IS NOT NULL AND public.is_guild_admin(q.guild_id, _user_id))
         OR (upper(coalesce(q.owner_type, '')) = 'GUILD' AND q.owner_id IS NOT NULL AND public.is_guild_admin(q.owner_id::uuid, _user_id))
         OR (upper(coalesce(q.owner_type, '')) = 'COMPANY' AND q.owner_id IS NOT NULL AND public.is_company_admin(q.owner_id::uuid, _user_id))))
    OR EXISTS (SELECT 1 FROM public.quest_hosts h WHERE h.quest_id = _quest_id AND (
         (upper(h.entity_type) = 'GUILD' AND public.is_guild_admin(h.entity_id, _user_id))
         OR (upper(h.entity_type) = 'COMPANY' AND public.is_company_admin(h.entity_id, _user_id))
         OR (upper(h.entity_type) IN ('USER', 'PROFILE') AND h.entity_id = _user_id)))
  )
$$;

-- is_quest_holder (opportunités, contributions) suit désormais la même définition.
CREATE OR REPLACE FUNCTION public.is_quest_holder(_quest_id uuid, _uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_quest_admin(_quest_id, _uid)
$$;

-- Personnes (humaines) qui administrent une quête : destinataires des demandes d'accès.
CREATE OR REPLACE FUNCTION public.quest_admin_user_ids(_quest_id uuid)
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH q AS (SELECT * FROM public.quests WHERE id = _quest_id),
  guild_ids AS (
    SELECT q.guild_id AS gid FROM q WHERE q.guild_id IS NOT NULL
    UNION SELECT q.owner_id::uuid FROM q WHERE upper(coalesce(q.owner_type, '')) = 'GUILD' AND q.owner_id IS NOT NULL
    UNION SELECT h.entity_id FROM public.quest_hosts h WHERE h.quest_id = _quest_id AND upper(h.entity_type) = 'GUILD'
  ),
  company_ids AS (
    SELECT q.owner_id::uuid AS cid FROM q WHERE upper(coalesce(q.owner_type, '')) = 'COMPANY' AND q.owner_id IS NOT NULL
    UNION SELECT h.entity_id FROM public.quest_hosts h WHERE h.quest_id = _quest_id AND upper(h.entity_type) = 'COMPANY'
  ),
  admin_guilds AS (  -- les guildes et leurs entités administratrices de type guilde
    SELECT gid FROM guild_ids
    UNION SELECT e.entity_id FROM public.guild_admin_entities e WHERE e.guild_id IN (SELECT gid FROM guild_ids) AND e.entity_type = 'GUILD'
  ),
  admin_companies AS (
    SELECT cid FROM company_ids
    UNION SELECT e.entity_id FROM public.guild_admin_entities e WHERE e.guild_id IN (SELECT gid FROM guild_ids) AND e.entity_type = 'COMPANY'
  ),
  people AS (
    SELECT q.created_by_user_id AS uid FROM q
    UNION SELECT p.user_id FROM public.quest_participants p
      WHERE p.quest_id = _quest_id AND upper(coalesce(p.role::text, '')) IN ('ADMIN', 'OWNER', 'HOST', 'CO_HOST')
    UNION SELECT h.entity_id FROM public.quest_hosts h WHERE h.quest_id = _quest_id AND upper(h.entity_type) IN ('USER', 'PROFILE')
    UNION SELECT g.created_by_user_id FROM public.guilds g WHERE g.id IN (SELECT gid FROM admin_guilds)
    UNION SELECT gm.user_id FROM public.guild_members gm WHERE gm.guild_id IN (SELECT gid FROM admin_guilds) AND gm.role = 'ADMIN'::guild_member_role
    UNION SELECT cm.user_id FROM public.company_members cm WHERE cm.company_id IN (SELECT cid FROM admin_companies) AND upper(cm.role) IN ('ADMIN', 'OWNER')
  )
  SELECT coalesce(array_agg(DISTINCT pe.uid), '{}')
  FROM people pe JOIN public.profiles pr ON pr.user_id = pe.uid
  WHERE pe.uid IS NOT NULL AND coalesce(pr.is_agent, false) = false
$$;

-- ---------------------------------------------------------------------------
-- 4. Permissions personnelles et demandes d'accès
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.quest_access_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quest_id uuid NOT NULL REFERENCES public.quests(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  granted_by uuid,
  note text CHECK (length(note) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_by uuid
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_quest_access_grants_active ON public.quest_access_grants (quest_id, user_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_quest_access_grants_user ON public.quest_access_grants (user_id) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS public.quest_access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quest_id uuid NOT NULL REFERENCES public.quests(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  message text CHECK (length(message) <= 1000),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  decided_by uuid
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_quest_access_requests_pending ON public.quest_access_requests (quest_id, user_id) WHERE status = 'pending';

ALTER TABLE public.quest_access_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quest_access_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Quest access grants: the person or quest admins" ON public.quest_access_grants;
CREATE POLICY "Quest access grants: the person or quest admins" ON public.quest_access_grants FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_quest_admin(quest_id, auth.uid()) OR public.is_platform_superadmin(auth.uid()));
DROP POLICY IF EXISTS "Quest access requests: the person or quest admins" ON public.quest_access_requests;
CREATE POLICY "Quest access requests: the person or quest admins" ON public.quest_access_requests FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_quest_admin(quest_id, auth.uid()) OR public.is_platform_superadmin(auth.uid()));
-- Écriture : uniquement par les fonctions ci-dessous.

-- ---------------------------------------------------------------------------
-- 5. Membre en règle d'une guilde
-- ---------------------------------------------------------------------------
-- Guilde avec adhésion : adhésion « member » active (ou en grâce 7 jours). Sinon : présent dans guild_members.
-- Un simple abonné (suivre) ou un invité n'est pas membre.
CREATE OR REPLACE FUNCTION public.is_guild_member_in_good_standing(_guild_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id IS NOT NULL AND _guild_id IS NOT NULL AND (
    public.is_guild_admin(_guild_id, _user_id)
    OR CASE WHEN coalesce((SELECT g.enable_membership FROM public.guilds g WHERE g.id = _guild_id), false) THEN
      EXISTS (SELECT 1 FROM public.user_guild_memberships m
              WHERE m.guild_id = _guild_id AND m.user_id = _user_id AND m.role = 'member'
                AND coalesce(m.status, 'active') IN ('active', 'grace')
                AND (coalesce(m.current_period_end, m.membership_expires_at) IS NULL
                     OR coalesce(m.current_period_end, m.membership_expires_at)
                        + CASE WHEN m.status = 'grace' THEN interval '7 days' ELSE interval '0' END > now()))
    ELSE
      EXISTS (SELECT 1 FROM public.guild_members gm WHERE gm.guild_id = _guild_id AND gm.user_id = _user_id)
    END
  )
$$;

-- ---------------------------------------------------------------------------
-- 6. Réglage effectif et niveau d'accès
-- ---------------------------------------------------------------------------
-- Réglage effectif d'une quête : { mode, inherited, guild_id, plans, role_ids }.
CREATE OR REPLACE FUNCTION public.quest_effective_access(_quest_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  q record;
  g record;
  v_guild uuid := public.quest_primary_guild(_quest_id);
BEGIN
  SELECT access_mode, access_plans, access_role_ids INTO q FROM quests WHERE id = _quest_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF q.access_mode <> 'inherit' THEN
    RETURN jsonb_build_object('mode', q.access_mode, 'inherited', false, 'guild_id', v_guild,
                              'plans', to_jsonb(q.access_plans), 'role_ids', to_jsonb(q.access_role_ids));
  END IF;
  IF v_guild IS NOT NULL THEN
    SELECT quest_access_default, quest_access_plans, quest_access_role_ids INTO g FROM guilds WHERE id = v_guild;
    IF FOUND THEN
      RETURN jsonb_build_object('mode', g.quest_access_default, 'inherited', true, 'guild_id', v_guild,
                                'plans', to_jsonb(g.quest_access_plans), 'role_ids', to_jsonb(g.quest_access_role_ids));
    END IF;
  END IF;
  RETURN jsonb_build_object('mode', 'public', 'inherited', true, 'guild_id', v_guild, 'plans', '[]'::jsonb, 'role_ids', '[]'::jsonb);
END;
$$;

-- Membre « de la membrane » d'une quête : de sa guilde ; sans guilde, de l'organisation porteuse ou co-hôte.
CREATE OR REPLACE FUNCTION public.is_quest_circle_member(_quest_id uuid, _guild_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN _guild_id IS NOT NULL THEN public.is_guild_member_in_good_standing(_guild_id, _user_id)
  ELSE EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.user_id = _user_id AND cm.company_id IN (
      SELECT q.owner_id::uuid FROM public.quests q WHERE q.id = _quest_id AND upper(coalesce(q.owner_type, '')) = 'COMPANY'
      UNION SELECT h.entity_id FROM public.quest_hosts h WHERE h.quest_id = _quest_id AND upper(h.entity_type) = 'COMPANY'))
  END
$$;

CREATE OR REPLACE FUNCTION public.quest_access_level(_quest_id uuid, _user_id uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_eff jsonb := public.quest_effective_access(_quest_id);
  v_mode text;
  v_guild uuid;
  v_plans text[];
  v_roles uuid[];
BEGIN
  IF v_eff IS NULL THEN RETURN 'none'; END IF;
  v_mode := v_eff->>'mode';
  IF v_mode = 'public' THEN RETURN 'full'; END IF;
  IF _user_id IS NULL THEN RETURN 'none'; END IF;

  IF public.is_platform_superadmin(_user_id)
     OR public.is_quest_admin(_quest_id, _user_id)
     OR EXISTS (SELECT 1 FROM quest_participants p WHERE p.quest_id = _quest_id AND p.user_id = _user_id
                  AND upper(coalesce(p.status, 'ACTIVE')) IN ('ACTIVE', 'ACCEPTED', 'APPROVED', 'COMPLETED', 'INVITED'))
     OR EXISTS (SELECT 1 FROM quest_access_grants ag WHERE ag.quest_id = _quest_id AND ag.user_id = _user_id AND ag.revoked_at IS NULL) THEN
    RETURN 'full';
  END IF;

  IF v_mode = 'hidden' THEN RETURN 'none'; END IF;

  v_guild := nullif(v_eff->>'guild_id', '')::uuid;
  IF NOT public.is_quest_circle_member(_quest_id, v_guild, _user_id) THEN RETURN 'none'; END IF;
  IF v_mode = 'members' THEN RETURN 'full'; END IF;

  -- selected : formule ou rôle choisis → tout ; autre membre en règle → la fiche.
  IF v_guild IS NOT NULL THEN
    v_plans := ARRAY(SELECT jsonb_array_elements_text(v_eff->'plans'));
    v_roles := ARRAY(SELECT (jsonb_array_elements_text(v_eff->'role_ids'))::uuid);
    IF (cardinality(v_plans) > 0 AND EXISTS (
          SELECT 1 FROM user_guild_memberships m
          WHERE m.guild_id = v_guild AND m.user_id = _user_id AND m.role = 'member'
            AND coalesce(m.status, 'active') IN ('active', 'grace') AND m.plan_code = ANY (v_plans)))
       OR (cardinality(v_roles) > 0 AND EXISTS (
          SELECT 1 FROM entity_member_roles emr JOIN entity_roles er ON er.id = emr.entity_role_id
          WHERE emr.user_id = _user_id AND er.entity_type = 'guild' AND er.entity_id = v_guild
            AND er.id = ANY (v_roles) AND (emr.expires_at IS NULL OR emr.expires_at > now()))) THEN
      RETURN 'full';
    END IF;
  END IF;
  RETURN 'teaser';
END;
$$;

CREATE OR REPLACE FUNCTION public.can_view_quest(_quest_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.quest_access_level(_quest_id, auth.uid()) <> 'none'
$$;

CREATE OR REPLACE FUNCTION public.can_access_quest(_quest_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _quest_id IS NULL OR public.quest_access_level(_quest_id, auth.uid()) = 'full'
$$;

-- Même chose pour une référence texte (colonnes target_id / context_id non typées uuid) : une valeur qui
-- n'est pas un identifiant ne désigne pas une quête.
CREATE OR REPLACE FUNCTION public.can_access_quest_ref(_ref text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _ref IS NULL OR _ref !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RETURN true; END IF;
  RETURN public.can_access_quest(_ref::uuid);
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. Application par la base (politiques restrictives : s'ajoutent aux règles existantes)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Quest access: visible to its audience" ON public.quests;
CREATE POLICY "Quest access: visible to its audience" ON public.quests AS RESTRICTIVE FOR SELECT
  USING (public.can_view_quest(id));

DROP POLICY IF EXISTS "Quest access: needs" ON public.quest_needs;
CREATE POLICY "Quest access: needs" ON public.quest_needs AS RESTRICTIVE FOR SELECT
  USING (public.can_access_quest(quest_id));

DROP POLICY IF EXISTS "Quest access: updates" ON public.quest_updates;
CREATE POLICY "Quest access: updates" ON public.quest_updates AS RESTRICTIVE FOR SELECT
  USING (author_id = auth.uid() OR public.can_access_quest(quest_id));

DROP POLICY IF EXISTS "Quest access: subtasks" ON public.quest_subtasks;
CREATE POLICY "Quest access: subtasks" ON public.quest_subtasks AS RESTRICTIVE FOR SELECT
  USING (assignee_user_id = auth.uid() OR auth.uid()::text = ANY (coalesce(assignee_user_ids::text[], '{}')) OR public.can_access_quest(quest_id));

DROP POLICY IF EXISTS "Quest access: proposals" ON public.quest_proposals;
CREATE POLICY "Quest access: proposals" ON public.quest_proposals AS RESTRICTIVE FOR SELECT
  USING (proposer_id = auth.uid()::text OR public.can_access_quest(quest_id));

DROP POLICY IF EXISTS "Quest access: participants" ON public.quest_participants;
CREATE POLICY "Quest access: participants" ON public.quest_participants AS RESTRICTIVE FOR SELECT
  USING (user_id = auth.uid() OR public.can_access_quest(quest_id));
-- Rejoindre une quête réservée passe par une demande d'accès (un admin peut toujours ajouter quelqu'un).
DROP POLICY IF EXISTS "Quest access: join" ON public.quest_participants;
CREATE POLICY "Quest access: join" ON public.quest_participants AS RESTRICTIVE FOR INSERT
  WITH CHECK (public.can_access_quest(quest_id));

DROP POLICY IF EXISTS "Quest access: discussions" ON public.feed_posts;
CREATE POLICY "Quest access: discussions" ON public.feed_posts AS RESTRICTIVE FOR SELECT
  USING (context_type NOT IN ('QUEST', 'QUEST_DISCUSSION') OR context_id IS NULL
         OR author_user_id = auth.uid() OR public.can_access_quest_ref(context_id::text));

DROP POLICY IF EXISTS "Quest access: files" ON public.attachments;
CREATE POLICY "Quest access: files" ON public.attachments AS RESTRICTIVE FOR SELECT
  USING (upper(target_type) <> 'QUEST' OR uploaded_by_user_id = auth.uid() OR public.can_access_quest_ref(target_id::text));

-- Administration partagée : les admins d'une quête (y compris via ses entités co-hôtes) peuvent la modifier ;
-- les admins d'une guilde (y compris via ses entités administratrices) peuvent la modifier et gérer ses membres.
-- (Politiques permissives : elles s'ajoutent aux règles existantes, qui restent valables.)
DROP POLICY IF EXISTS "Quest admins can update quests" ON public.quests;
CREATE POLICY "Quest admins can update quests" ON public.quests FOR UPDATE TO authenticated
  USING (public.is_quest_admin(id, auth.uid())) WITH CHECK (public.is_quest_admin(id, auth.uid()));
DROP POLICY IF EXISTS "Guild admins can update guilds" ON public.guilds;
CREATE POLICY "Guild admins can update guilds" ON public.guilds FOR UPDATE TO authenticated
  USING (public.is_guild_admin(id, auth.uid())) WITH CHECK (public.is_guild_admin(id, auth.uid()));
DROP POLICY IF EXISTS "Guild admins manage members" ON public.guild_members;
CREATE POLICY "Guild admins manage members" ON public.guild_members FOR ALL TO authenticated
  USING (public.is_guild_admin(guild_id, auth.uid())) WITH CHECK (public.is_guild_admin(guild_id, auth.uid()));

-- ---------------------------------------------------------------------------
-- 8. Actions
-- ---------------------------------------------------------------------------
-- Ce que la personne connectée peut faire sur une quête (pour l'écran).
CREATE OR REPLACE FUNCTION public.my_quest_access(p_quest_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'level', public.quest_access_level(p_quest_id, auth.uid()),
    'is_admin', public.is_quest_admin(p_quest_id, auth.uid()) OR public.is_platform_superadmin(auth.uid()),
    'effective', public.quest_effective_access(p_quest_id),
    'access_mode', (SELECT q.access_mode FROM public.quests q WHERE q.id = p_quest_id),
    'pending_request', EXISTS (SELECT 1 FROM public.quest_access_requests r
                               WHERE r.quest_id = p_quest_id AND r.user_id = auth.uid() AND r.status = 'pending'),
    'has_grant', EXISTS (SELECT 1 FROM public.quest_access_grants g
                         WHERE g.quest_id = p_quest_id AND g.user_id = auth.uid() AND g.revoked_at IS NULL))
$$;

-- Niveau d'accès de la personne connectée pour plusieurs quêtes (services qui lisent en service : Pi, API).
CREATE OR REPLACE FUNCTION public.my_quest_access_levels(p_quest_ids uuid[])
RETURNS TABLE (quest_id uuid, level text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT x.id, public.quest_access_level(x.id, auth.uid()) FROM (SELECT DISTINCT unnest(p_quest_ids[1:200]) AS id) x
$$;

-- Régler l'accès d'une quête (admins de la quête).
CREATE OR REPLACE FUNCTION public.set_quest_access(p_quest_id uuid, p_mode text, p_plans text[] DEFAULT '{}', p_role_ids uuid[] DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.is_quest_admin(p_quest_id, auth.uid()) OR public.is_platform_superadmin(auth.uid())) THEN
    RAISE EXCEPTION 'Only the quest admins can change who sees it' USING ERRCODE = '42501';
  END IF;
  IF p_mode NOT IN ('inherit', 'public', 'members', 'selected', 'hidden') THEN RAISE EXCEPTION 'Invalid access mode'; END IF;
  IF p_mode = 'selected' AND coalesce(cardinality(p_plans), 0) + coalesce(cardinality(p_role_ids), 0) = 0 THEN
    RAISE EXCEPTION 'Choose at least one membership plan or role';
  END IF;
  UPDATE quests SET access_mode = p_mode,
                    access_plans = CASE WHEN p_mode = 'selected' THEN coalesce(p_plans, '{}') ELSE '{}' END,
                    access_role_ids = CASE WHEN p_mode = 'selected' THEN coalesce(p_role_ids, '{}') ELSE '{}' END,
                    updated_at = now()
   WHERE id = p_quest_id;
  RETURN public.quest_effective_access(p_quest_id);
END;
$$;

-- Réglage par défaut des quêtes d'une guilde (admins de la guilde).
CREATE OR REPLACE FUNCTION public.set_guild_quest_access_default(p_guild_id uuid, p_mode text, p_plans text[] DEFAULT '{}', p_role_ids uuid[] DEFAULT '{}')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.is_guild_admin(p_guild_id, auth.uid()) OR public.is_platform_superadmin(auth.uid())) THEN
    RAISE EXCEPTION 'Only guild admins can change this' USING ERRCODE = '42501';
  END IF;
  IF p_mode NOT IN ('public', 'members', 'selected', 'hidden') THEN RAISE EXCEPTION 'Invalid access mode'; END IF;
  IF p_mode = 'selected' AND coalesce(cardinality(p_plans), 0) + coalesce(cardinality(p_role_ids), 0) = 0 THEN
    RAISE EXCEPTION 'Choose at least one membership plan or role';
  END IF;
  UPDATE guilds SET quest_access_default = p_mode,
                    quest_access_plans = CASE WHEN p_mode = 'selected' THEN coalesce(p_plans, '{}') ELSE '{}' END,
                    quest_access_role_ids = CASE WHEN p_mode = 'selected' THEN coalesce(p_role_ids, '{}') ELSE '{}' END
   WHERE id = p_guild_id;
END;
$$;

-- Notifier des personnes (sans doublon) ; l'auteur de l'action n'est pas notifié.
CREATE OR REPLACE FUNCTION public.notify_quest_access(p_users uuid[], p_type text, p_title text, p_body text, p_quest_id uuid, p_link text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n integer;
BEGIN
  INSERT INTO notifications (user_id, type, title, body, related_entity_type, related_entity_id, deep_link_url)
  SELECT DISTINCT u, p_type, p_title, p_body, 'quest', p_quest_id::text, p_link
  FROM unnest(coalesce(p_users, '{}')) u WHERE u IS NOT NULL AND u IS DISTINCT FROM auth.uid();
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

-- Demander l'accès à une quête (personne connectée qui n'a pas déjà tout). Prévient les admins de la quête ;
-- si aucun humain n'en est admin (quête importée par un agent), les admins de la plateforme relaient.
CREATE OR REPLACE FUNCTION public.request_quest_access(p_quest_id uuid, p_message text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_level text;
  v_mode text;
  v_title text;
  v_name text;
  v_id uuid;
  v_admins uuid[];
  v_relay boolean := false;
  v_n integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;
  IF length(coalesce(p_message, '')) > 1000 THEN RAISE EXCEPTION 'Message too long'; END IF;
  SELECT title INTO v_title FROM quests WHERE id = p_quest_id AND is_deleted = false AND coalesce(is_draft, false) = false;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quest not found'; END IF;
  v_level := public.quest_access_level(p_quest_id, v_uid);
  IF v_level = 'full' THEN RETURN jsonb_build_object('already', true); END IF;
  v_mode := public.quest_effective_access(p_quest_id)->>'mode';
  IF v_mode = 'hidden' OR v_level = 'none' THEN RAISE EXCEPTION 'Quest not found'; END IF;

  SELECT id INTO v_id FROM quest_access_requests WHERE quest_id = p_quest_id AND user_id = v_uid AND status = 'pending';
  IF v_id IS NOT NULL THEN
    UPDATE quest_access_requests SET message = nullif(btrim(coalesce(p_message, '')), '') WHERE id = v_id;
    RETURN jsonb_build_object('request_id', v_id, 'updated', true, 'notified', 0);
  END IF;
  INSERT INTO quest_access_requests (quest_id, user_id, message)
  VALUES (p_quest_id, v_uid, nullif(btrim(coalesce(p_message, '')), ''))
  RETURNING id INTO v_id;

  v_admins := public.quest_admin_user_ids(p_quest_id);
  IF coalesce(cardinality(array_remove(v_admins, v_uid)), 0) = 0 THEN
    v_relay := true;
    SELECT coalesce(array_agg(DISTINCT ur.user_id), '{}') INTO v_admins FROM user_roles ur WHERE ur.role::text IN ('admin', 'superadmin');
  END IF;
  SELECT name INTO v_name FROM profiles WHERE user_id = v_uid;
  v_n := public.notify_quest_access(v_admins, 'QUEST_ACCESS_REQUEST',
    CASE WHEN v_relay THEN 'Demande d''accès à une quête sans admin' ELSE 'Demande d''accès à votre quête' END,
    coalesce(v_name, 'Quelqu''un') || ' demande l''accès à « ' || v_title || ' »'
      || CASE WHEN nullif(btrim(coalesce(p_message, '')), '') IS NOT NULL THEN ' : ' || left(btrim(p_message), 200) ELSE '' END,
    p_quest_id, '/quests/' || p_quest_id || '/settings?tab=access');
  RETURN jsonb_build_object('request_id', v_id, 'updated', false, 'notified', v_n, 'relayed_to_platform', v_relay);
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_quest_access_request(p_quest_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.quest_access_requests SET status = 'cancelled', decided_at = now()
   WHERE quest_id = p_quest_id AND user_id = auth.uid() AND status = 'pending'
$$;

-- Accorder une permission personnelle (directement, ou en acceptant une demande). Révocable.
CREATE OR REPLACE FUNCTION public.grant_quest_access(p_quest_id uuid, p_user_id uuid, p_note text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_title text;
BEGIN
  IF NOT (public.is_quest_admin(p_quest_id, auth.uid()) OR public.is_platform_superadmin(auth.uid())) THEN
    RAISE EXCEPTION 'Only the quest admins can grant access' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE user_id = p_user_id) THEN RAISE EXCEPTION 'Person not found'; END IF;
  SELECT id INTO v_id FROM quest_access_grants WHERE quest_id = p_quest_id AND user_id = p_user_id AND revoked_at IS NULL;
  IF v_id IS NULL THEN
    INSERT INTO quest_access_grants (quest_id, user_id, granted_by, note)
    VALUES (p_quest_id, p_user_id, auth.uid(), nullif(btrim(coalesce(p_note, '')), ''))
    RETURNING id INTO v_id;
  END IF;
  UPDATE quest_access_requests SET status = 'approved', decided_at = now(), decided_by = auth.uid()
   WHERE quest_id = p_quest_id AND user_id = p_user_id AND status = 'pending';
  SELECT title INTO v_title FROM quests WHERE id = p_quest_id;
  PERFORM public.notify_quest_access(ARRAY[p_user_id], 'QUEST_ACCESS_GRANTED', 'Accès accordé',
    'Vous avez maintenant accès à « ' || coalesce(v_title, 'la quête') || ' ».', p_quest_id, '/quests/' || p_quest_id);
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.decline_quest_access_request(p_request_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_title text;
BEGIN
  SELECT * INTO r FROM quest_access_requests WHERE id = p_request_id AND status = 'pending';
  IF NOT FOUND THEN RETURN; END IF;
  IF NOT (public.is_quest_admin(r.quest_id, auth.uid()) OR public.is_platform_superadmin(auth.uid())) THEN
    RAISE EXCEPTION 'Only the quest admins can answer' USING ERRCODE = '42501';
  END IF;
  UPDATE quest_access_requests SET status = 'declined', decided_at = now(), decided_by = auth.uid() WHERE id = p_request_id;
  SELECT title INTO v_title FROM quests WHERE id = r.quest_id;
  PERFORM public.notify_quest_access(ARRAY[r.user_id], 'QUEST_ACCESS_DECLINED', 'Demande d''accès non retenue',
    'Votre demande d''accès à « ' || coalesce(v_title, 'la quête') || ' » n''a pas été retenue pour l''instant.', r.quest_id, '/quests/' || r.quest_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_quest_access(p_grant_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE gr record; v_title text;
BEGIN
  SELECT * INTO gr FROM quest_access_grants WHERE id = p_grant_id AND revoked_at IS NULL;
  IF NOT FOUND THEN RETURN; END IF;
  IF NOT (public.is_quest_admin(gr.quest_id, auth.uid()) OR public.is_platform_superadmin(auth.uid())) THEN
    RAISE EXCEPTION 'Only the quest admins can revoke access' USING ERRCODE = '42501';
  END IF;
  UPDATE quest_access_grants SET revoked_at = now(), revoked_by = auth.uid() WHERE id = p_grant_id;
  SELECT title INTO v_title FROM quests WHERE id = gr.quest_id;
  PERFORM public.notify_quest_access(ARRAY[gr.user_id], 'QUEST_ACCESS_REVOKED', 'Accès retiré',
    'Votre accès personnel à « ' || coalesce(v_title, 'la quête') || ' » a été retiré.', gr.quest_id, '/quests/' || gr.quest_id);
END;
$$;

-- Demandes en attente et permissions actives d'une quête, avec les noms (admins de la quête).
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
                  'avatar_url', p.avatar_url, 'note', g.note, 'created_at', g.created_at) ORDER BY g.created_at DESC)
                FROM quest_access_grants g LEFT JOIN profiles p ON p.user_id = g.user_id
                WHERE g.quest_id = p_quest_id AND g.revoked_at IS NULL), '[]'::jsonb));
END;
$$;

-- ---------------------------------------------------------------------------
-- 9. Droits d'exécution
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.set_guild_admin_entity(uuid, text, uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_quest_access(uuid, text, text[], uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_guild_quest_access_default(uuid, text, text[], uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.notify_quest_access(uuid[], text, text, text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.request_quest_access(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_quest_access_request(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.grant_quest_access(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.decline_quest_access_request(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revoke_quest_access(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.quest_access_admin_view(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.quest_admin_user_ids(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_guild_admin_entity(uuid, text, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_quest_access(uuid, text, text[], uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_guild_quest_access_default(uuid, text, text[], uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_quest_access(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_quest_access_request(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.grant_quest_access(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decline_quest_access_request(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_quest_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.quest_access_admin_view(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.quest_admin_user_ids(uuid) TO service_role;
-- Lectures utilisées par les politiques et par l'écran.
GRANT EXECUTE ON FUNCTION public.my_quest_access(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.my_quest_access_levels(uuid[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_quest(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_access_quest(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_access_quest_ref(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.quest_access_level(uuid, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.quest_effective_access(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_guild_admin(uuid, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_quest_admin(uuid, uuid) TO authenticated, service_role;