-- Socle minimal (rôles, auth, tables et règles d'avant la migration) pour tester
-- 20261123100000_discussion_rooms_access.sql hors Supabase.
DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated;
CREATE TYPE public.app_role AS ENUM ('admin', 'user');
CREATE TABLE public.user_roles (user_id uuid, role public.app_role);
CREATE FUNCTION public.has_role(_user_id uuid, _role app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;
CREATE TABLE public.guilds (id uuid PRIMARY KEY);
CREATE TABLE public.guild_members (guild_id uuid, user_id uuid, role text);
CREATE TABLE public.entity_roles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), entity_type text, entity_id uuid, name text, is_default boolean DEFAULT false, created_at timestamptz DEFAULT now());
CREATE TABLE public.entity_member_roles (entity_role_id uuid, user_id uuid, expires_at timestamptz);
CREATE TABLE public.follows (follower_id uuid, target_type text, target_id text);
CREATE TABLE public.quests (id uuid PRIMARY KEY, guild_id uuid, is_draft boolean DEFAULT false, is_deleted boolean DEFAULT false, created_by_user_id uuid);
ALTER TABLE public.quests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Published quests are viewable by everyone" ON public.quests FOR SELECT
  USING ((is_deleted = false AND (is_draft = false OR created_by_user_id = auth.uid())) OR created_by_user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));
CREATE TABLE public.quest_subtasks (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), quest_id uuid, title text, assignee_user_id uuid);
ALTER TABLE public.quest_subtasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Subtasks viewable by everyone" ON public.quest_subtasks FOR SELECT USING (true);
CREATE TABLE public.discussion_rooms (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), scope_type text, scope_id uuid, name text,
  audience_type text DEFAULT 'MEMBERS', allowed_role_ids uuid[] DEFAULT '{}', can_post_audience_type text DEFAULT 'MEMBERS',
  can_reply_audience_type text DEFAULT 'MEMBERS', can_manage_audience_type text DEFAULT 'ADMINS_ONLY', can_manage_role_ids uuid[] DEFAULT '{}',
  created_by_user_id uuid, is_default boolean DEFAULT false, created_at timestamptz DEFAULT now());
ALTER TABLE public.discussion_rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read rooms" ON public.discussion_rooms FOR SELECT TO authenticated USING (true);
CREATE TABLE public.feed_posts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), author_user_id uuid, context_type text, context_id uuid, content text,
  is_deleted boolean DEFAULT false, room_id uuid, visibility text NOT NULL DEFAULT 'public', created_at timestamptz DEFAULT now());
ALTER TABLE public.feed_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read feed posts" ON public.feed_posts FOR SELECT USING (NOT is_deleted);
CREATE POLICY "Authenticated users can create posts" ON public.feed_posts FOR INSERT WITH CHECK (auth.uid() = author_user_id);
CREATE TABLE public.comments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), content text, author_id uuid, target_type text, target_id text, is_deleted boolean DEFAULT false);
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Comments are viewable by everyone" ON public.comments FOR SELECT USING (is_deleted = false);
CREATE POLICY "Authenticated users can create comments" ON public.comments FOR INSERT WITH CHECK (auth.uid() = author_id);
CREATE TABLE public.post_attachments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), post_id uuid, url text);
ALTER TABLE public.post_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read post attachments" ON public.post_attachments FOR SELECT USING (true);
GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA public TO anon, authenticated;
