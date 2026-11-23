-- Tables des décisions telles qu'avant 20261123110000 (à charger après discussion_rooms_access_stubs.sql
-- et la migration 20261123100000).
ALTER TABLE public.guilds ADD COLUMN governance_model text DEFAULT '1h1v', ADD COLUMN features_config jsonb DEFAULT '{}';
CREATE TABLE public.quest_participants (quest_id uuid, user_id uuid);
CREATE TABLE public.pod_members (pod_id uuid, user_id uuid);
CREATE TABLE public.company_members (company_id uuid, user_id uuid);
CREATE TABLE public.contribution_logs (user_id uuid, quest_id uuid, fmv_value numeric, status text);
CREATE TABLE public.decision_polls (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), entity_type text, entity_id uuid, question text,
  created_by uuid, status text DEFAULT 'OPEN', opens_at timestamptz, closes_at timestamptz, allow_vote_change boolean DEFAULT true,
  visibility_audience_type text DEFAULT 'MEMBERS', allowed_visibility_role_ids uuid[] DEFAULT '{}',
  can_vote_audience_type text DEFAULT 'MEMBERS', allowed_vote_role_ids uuid[] DEFAULT '{}');
ALTER TABLE public.decision_polls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view decision polls" ON public.decision_polls FOR SELECT USING (
  CASE entity_type WHEN 'GUILD' THEN EXISTS (SELECT 1 FROM public.guild_members WHERE guild_id = entity_id AND user_id = auth.uid()) ELSE true END);
CREATE POLICY "Authenticated users can create polls" ON public.decision_polls FOR INSERT WITH CHECK (auth.uid() = created_by);
CREATE TABLE public.decision_poll_votes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), poll_id uuid, user_id uuid, option_index int,
  raw_weight numeric(10,4) NOT NULL DEFAULT 1.0, applied_weight numeric(10,4) NOT NULL DEFAULT 1.0, UNIQUE (poll_id, user_id));
ALTER TABLE public.decision_poll_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view poll votes" ON public.decision_poll_votes FOR SELECT USING (true);
CREATE POLICY "Users can vote on polls" ON public.decision_poll_votes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can change their vote" ON public.decision_poll_votes FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their vote" ON public.decision_poll_votes FOR DELETE USING (auth.uid() = user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated;
