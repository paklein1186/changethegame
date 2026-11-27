CREATE OR REPLACE FUNCTION public.demo_feve_upsert_post(
  p_id uuid, p_author_user_id uuid, p_context_type text, p_context_id uuid,
  p_content text, p_visibility text, p_posted_as_label text
) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_author_user_id::text, true);
  INSERT INTO public.feed_posts (
    id, author_user_id, context_type, context_id, content, visibility, is_deleted, posted_as_label
  ) VALUES (
    p_id, p_author_user_id, p_context_type, p_context_id, p_content, p_visibility, false, p_posted_as_label
  )
  ON CONFLICT (id) DO UPDATE SET
    author_user_id = EXCLUDED.author_user_id,
    context_type = EXCLUDED.context_type,
    context_id = EXCLUDED.context_id,
    content = EXCLUDED.content,
    visibility = EXCLUDED.visibility,
    is_deleted = false,
    posted_as_label = EXCLUDED.posted_as_label;
  RETURN p_id;
END;
$$;
REVOKE ALL ON FUNCTION public.demo_feve_upsert_post(uuid, uuid, text, uuid, text, text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.demo_feve_upsert_post(uuid, uuid, text, uuid, text, text, text) TO service_role;