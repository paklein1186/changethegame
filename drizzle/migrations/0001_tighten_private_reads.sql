DROP POLICY IF EXISTS "auth_read_billing" ON public.agent_billing_profiles;
CREATE POLICY "read_billing_scoped" ON public.agent_billing_profiles FOR SELECT TO authenticated
USING (payer_id::text = auth.uid()::text OR public.has_role(auth.uid(),'admin') OR public.can_manage_agent(agent_id, auth.uid()));

DROP POLICY IF EXISTS "auth_read_usage" ON public.agent_usage_records;
CREATE POLICY "read_usage_scoped" ON public.agent_usage_records FOR SELECT TO authenticated
USING (payer_id::text = auth.uid()::text OR creator_id::text = auth.uid()::text OR public.has_role(auth.uid(),'admin') OR public.can_manage_agent(agent_id, auth.uid()));

DROP POLICY IF EXISTS "auth_read_revenue" ON public.revenue_share_records;
CREATE POLICY "read_revenue_scoped" ON public.revenue_share_records FOR SELECT TO authenticated
USING (beneficiary_id::text = auth.uid()::text OR public.has_role(auth.uid(),'admin') OR (agent_id IS NOT NULL AND public.can_manage_agent(agent_id, auth.uid())));

DROP POLICY IF EXISTS "Anyone can read user_roles" ON public.user_roles;

DROP POLICY IF EXISTS "Authenticated users can view dm attachments" ON storage.objects;
CREATE POLICY "Conversation members can view dm attachments" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'dm-attachments' AND (
  (auth.uid())::text = (storage.foldername(name))[1]
  OR EXISTS (
    SELECT 1 FROM public.direct_messages dm
    JOIN public.conversation_participants cp ON cp.conversation_id = dm.conversation_id
    WHERE cp.user_id = auth.uid() AND dm.attachment_url LIKE '%' || storage.objects.name
  )
));

DROP POLICY IF EXISTS "Authenticated users can read evidence" ON storage.objects;
CREATE POLICY "Quest members can read evidence" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'contribution-evidence' AND (
  (auth.uid())::text = (storage.foldername(name))[1]
  OR public.has_role(auth.uid(),'admin')
  OR EXISTS (SELECT 1 FROM public.quest_participants qp WHERE qp.quest_id::text = (storage.foldername(name))[2] AND qp.user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.quests q WHERE q.id::text = (storage.foldername(name))[2] AND q.created_by_user_id = auth.uid())
));