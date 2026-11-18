DROP POLICY IF EXISTS "Authenticated users can insert translations" ON public.content_translations;
DROP POLICY IF EXISTS "Authenticated users can update translations" ON public.content_translations;
DROP POLICY IF EXISTS "Authenticated users can delete translations" ON public.content_translations;
CREATE POLICY "Admins can insert translations" ON public.content_translations FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superadmin'));
CREATE POLICY "Admins can update translations" ON public.content_translations FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superadmin'));
CREATE POLICY "Owners can clear stale translations" ON public.content_translations FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superadmin')
    OR (upper(entity_type) = 'GUILD' AND EXISTS (SELECT 1 FROM public.guilds g WHERE g.id::text = content_translations.entity_id::text AND public.is_guild_admin(g.id, auth.uid())))
    OR (upper(entity_type) = 'FEED_POST' AND EXISTS (SELECT 1 FROM public.feed_posts p WHERE p.id::text = content_translations.entity_id::text AND p.author_user_id = auth.uid()))
  );

DROP POLICY IF EXISTS "Authenticated users can view upvotes" ON public.starred_excerpt_upvotes;
CREATE POLICY "Users can view own starred excerpt upvotes" ON public.starred_excerpt_upvotes FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Authenticated users can read mentions" ON public.comment_mentions;
CREATE POLICY "Mentioned user or author can read mentions" ON public.comment_mentions FOR SELECT TO authenticated
  USING (
    mentioned_user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.comments c WHERE c.id = comment_mentions.comment_id AND c.author_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
  );

DROP POLICY IF EXISTS "Anon users can view busy events for public booking" ON public.calendar_busy_events;
DROP POLICY IF EXISTS "Authenticated users can view provider busy events for booking" ON public.calendar_busy_events;
DROP POLICY IF EXISTS "Anon users can read subcalendar preferences" ON public.calendar_subcalendar_preferences;
DROP POLICY IF EXISTS "Authenticated users can read subcalendar preferences" ON public.calendar_subcalendar_preferences;
CREATE POLICY "Users can read own subcalendar preferences" ON public.calendar_subcalendar_preferences FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.get_provider_busy_slots(_provider_id uuid)
RETURNS TABLE (start_at timestamptz, end_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT e.start_at, e.end_at
  FROM public.calendar_busy_events e
  WHERE e.user_id = _provider_id
    AND e.end_at >= now() - interval '1 day'
    AND NOT EXISTS (
      SELECT 1 FROM public.calendar_subcalendar_preferences p
      WHERE p.user_id = e.user_id AND p.connection_id = e.connection_id
        AND p.source_calendar_id = e.source_calendar_id AND p.is_enabled = false
    )
$$;
REVOKE ALL ON FUNCTION public.get_provider_busy_slots(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_provider_busy_slots(uuid) TO anon, authenticated;