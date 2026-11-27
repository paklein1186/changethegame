CREATE POLICY demo_feve_isolation ON public.quest_hosts AS RESTRICTIVE FOR SELECT TO public
  USING (public.demo_feve_row_visible('quest_hosts', id));