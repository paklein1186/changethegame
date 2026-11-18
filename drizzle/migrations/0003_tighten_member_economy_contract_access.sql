
-- Helper: is the user part of a quest?
CREATE OR REPLACE FUNCTION public.is_quest_member(_quest_id uuid, _uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _uid IS NOT NULL AND (
    public.has_role(_uid,'admin') OR public.has_role(_uid,'superadmin')
    OR EXISTS (SELECT 1 FROM quests q WHERE q.id = _quest_id AND q.created_by_user_id = _uid)
    OR EXISTS (SELECT 1 FROM quest_participants p WHERE p.quest_id = _quest_id AND p.user_id = _uid)
    OR EXISTS (SELECT 1 FROM contribution_logs c WHERE c.quest_id = _quest_id AND c.user_id = _uid)
  )
$$;

-- Signed-in only reads
DROP POLICY IF EXISTS "Achievements viewable by everyone" ON public.achievements;
CREATE POLICY "Signed-in users can view achievements" ON public.achievements FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Activity log is publicly readable" ON public.activity_log;
CREATE POLICY "Signed-in users can read activity log" ON public.activity_log FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Attachments viewable by everyone" ON public.attachments;
CREATE POLICY "Signed-in users can view attachments" ON public.attachments FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Availability exceptions are viewable by everyone" ON public.availability_exceptions;
CREATE POLICY "Signed-in users can view availability exceptions" ON public.availability_exceptions FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Availability rules are viewable by everyone" ON public.availability_rules;
CREATE POLICY "Signed-in users can view availability rules" ON public.availability_rules FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Company members are viewable by everyone" ON public.company_members;
CREATE POLICY "Signed-in users can view company members" ON public.company_members FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Guild members are viewable by everyone" ON public.guild_members;
CREATE POLICY "Signed-in users can view guild members" ON public.guild_members FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Pod members are viewable by everyone" ON public.pod_members;
CREATE POLICY "Signed-in users can view pod members" ON public.pod_members FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Anyone can view attendees" ON public.ritual_attendees;
CREATE POLICY "Signed-in users can view attendees" ON public.ritual_attendees FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Chat logs are viewable by everyone" ON public.territory_chat_logs;
CREATE POLICY "Signed-in users can view chat logs" ON public.territory_chat_logs FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Anyone can read masked items for filtering" ON public.profile_masked_items;
CREATE POLICY "Signed-in users can read masked items" ON public.profile_masked_items FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "ctg_wallets_select_public" ON public.ctg_wallets;
CREATE POLICY "ctg_wallets_select_signed_in" ON public.ctg_wallets FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "ctg_commons_wallet_select_public" ON public.ctg_commons_wallet;
CREATE POLICY "ctg_commons_wallet_select_signed_in" ON public.ctg_commons_wallet FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Anyone can view treasury allocations" ON public.ecosystem_treasury_allocations;
CREATE POLICY "Signed-in users can view treasury allocations" ON public.ecosystem_treasury_allocations FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Anyone can read member roles" ON public.entity_member_roles;
CREATE POLICY "Signed-in users can read member roles" ON public.entity_member_roles FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Anyone can read guild memberships" ON public.user_guild_memberships;
CREATE POLICY "Signed-in users can read guild memberships" ON public.user_guild_memberships FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Users can read own territories" ON public.user_territories;
CREATE POLICY "Signed-in users can read user territories" ON public.user_territories FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Users can read own topics" ON public.user_topics;
CREATE POLICY "Signed-in users can read user topics" ON public.user_topics FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "ctg_wallets_update_service" ON public.ctg_wallets;
DROP POLICY IF EXISTS "ctg_commons_wallet_update_service" ON public.ctg_commons_wallet;

-- Quest participants only
DROP POLICY IF EXISTS "Read contracts" ON public.quest_contracts;
CREATE POLICY "Quest members read contracts" ON public.quest_contracts FOR SELECT TO authenticated
  USING (public.is_quest_member(quest_id, auth.uid()) OR created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM contract_signatories s WHERE s.contract_id = quest_contracts.id AND s.user_id = auth.uid()));
DROP POLICY IF EXISTS "Read signatories" ON public.contract_signatories;
CREATE POLICY "Quest members read signatories" ON public.contract_signatories FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM quest_contracts c WHERE c.id = contract_id AND public.is_quest_member(c.quest_id, auth.uid())));
DROP POLICY IF EXISTS "Read amendments" ON public.contract_amendments;
CREATE POLICY "Quest members read amendments" ON public.contract_amendments FOR SELECT TO authenticated
  USING (proposed_by = auth.uid() OR EXISTS (SELECT 1 FROM quest_contracts c WHERE c.id = contract_id AND public.is_quest_member(c.quest_id, auth.uid()))
    OR EXISTS (SELECT 1 FROM contract_signatories s WHERE s.contract_id = contract_amendments.contract_id AND s.user_id = auth.uid()));
DROP POLICY IF EXISTS "Read amendment votes" ON public.amendment_votes;
CREATE POLICY "Quest members read amendment votes" ON public.amendment_votes FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM contract_amendments a JOIN quest_contracts c ON c.id = a.contract_id
    WHERE a.id = amendment_id AND (public.is_quest_member(c.quest_id, auth.uid())
      OR EXISTS (SELECT 1 FROM contract_signatories s WHERE s.contract_id = c.id AND s.user_id = auth.uid()))));
DROP POLICY IF EXISTS "Authenticated users can read compensations" ON public.contribution_compensations;
CREATE POLICY "Quest members read compensations" ON public.contribution_compensations FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_quest_member(quest_id, auth.uid()));
DROP POLICY IF EXISTS "Authenticated users can view distributions" ON public.quest_distributions;
CREATE POLICY "Quest members view distributions" ON public.quest_distributions FOR SELECT TO authenticated
  USING (public.is_quest_member(quest_id, auth.uid()));
DROP POLICY IF EXISTS "Authenticated users can read value pie logs" ON public.quest_value_pie_log;
CREATE POLICY "Quest members read value pie logs" ON public.quest_value_pie_log FOR SELECT TO authenticated
  USING (contributor_id = auth.uid() OR public.is_quest_member(quest_id, auth.uid()));
DROP POLICY IF EXISTS "Authenticated users can read review votes" ON public.contribution_review_votes;
CREATE POLICY "Quest members read review votes" ON public.contribution_review_votes FOR SELECT TO authenticated
  USING (reviewer_user_id = auth.uid() OR EXISTS (SELECT 1 FROM contribution_logs l WHERE l.id = contribution_id
    AND (l.user_id = auth.uid() OR public.is_quest_member(l.quest_id, auth.uid()))));
DROP POLICY IF EXISTS "Authenticated users can read exits" ON public.contributor_exits;
CREATE POLICY "Quest members read exits" ON public.contributor_exits FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_quest_member(quest_id, auth.uid()));
DROP POLICY IF EXISTS "Authenticated users can read exit_votes" ON public.exit_votes;
CREATE POLICY "Quest members read exit votes" ON public.exit_votes FOR SELECT TO authenticated
  USING (voter_user_id = auth.uid() OR EXISTS (SELECT 1 FROM contributor_exits e WHERE e.id = exit_id
    AND (e.user_id = auth.uid() OR public.is_quest_member(e.quest_id, auth.uid()))));
DROP POLICY IF EXISTS "Users can view funding contributions for quests they participat" ON public.quest_funding_contributions;
CREATE POLICY "Quest members view funding contributions" ON public.quest_funding_contributions FOR SELECT TO authenticated
  USING (funder_user_id = auth.uid() OR public.is_quest_member(quest_id, auth.uid()));

-- Profile emails: hidden column, exposed only to self/admins via function
REVOKE SELECT ON public.profiles FROM anon, authenticated;
DO $$
DECLARE cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ') INTO cols
  FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name <> 'email';
  EXECUTE format('GRANT SELECT (%s) ON public.profiles TO anon, authenticated', cols);
END $$;
DROP POLICY IF EXISTS "Anon can read profiles via public view" ON public.profiles;
DROP POLICY IF EXISTS "Authenticated users can read all profiles via public view" ON public.profiles;
CREATE POLICY "Public profile fields are readable" ON public.profiles FOR SELECT TO anon, authenticated USING (user_id IS NOT NULL);

CREATE OR REPLACE FUNCTION public.get_profile_emails(_user_ids uuid[])
RETURNS TABLE(user_id uuid, email text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.user_id, p.email FROM profiles p
  WHERE p.user_id = ANY(_user_ids)
    AND (p.user_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'superadmin'))
$$;
REVOKE EXECUTE ON FUNCTION public.get_profile_emails(uuid[]) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_profile_emails(uuid[]) TO authenticated;

-- Notifications: record sender + rate limit
CREATE OR REPLACE FUNCTION public.stamp_notification_sender()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); n int;
BEGIN
  IF uid IS NULL THEN RETURN NEW; END IF;
  NEW.data := coalesce(NEW.data::jsonb, '{}'::jsonb) || jsonb_build_object('sent_by', uid);
  IF NEW.user_id <> uid THEN
    SELECT count(*) INTO n FROM notifications
      WHERE data->>'sent_by' = uid::text AND created_at > now() - interval '1 hour';
    IF n >= 1000 THEN RAISE EXCEPTION 'Notification rate limit exceeded'; END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_stamp_notification_sender ON public.notifications;
CREATE TRIGGER trg_stamp_notification_sender BEFORE INSERT ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.stamp_notification_sender();
CREATE INDEX IF NOT EXISTS idx_notifications_sent_by ON public.notifications ((data->>'sent_by'), created_at);
DROP POLICY IF EXISTS "Authenticated users can create notifications" ON public.notifications;
CREATE POLICY "Signed-in users can create notifications" ON public.notifications FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL AND user_id IS NOT NULL);
