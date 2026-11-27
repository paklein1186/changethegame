CREATE OR REPLACE FUNCTION public.demo_feve_upsert_owned_row(
  p_table text, p_values jsonb, p_actor_user_id uuid
) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid := (p_values->>'id')::uuid;
BEGIN
  IF p_table NOT IN ('services', 'guild_events') THEN
    RAISE EXCEPTION 'Unsupported demo owned table';
  END IF;
  PERFORM set_config('request.jwt.claim.sub', p_actor_user_id::text, true);
  p_values := p_values || jsonb_build_object(
    'created_at', coalesce(p_values->>'created_at', now()::text),
    'updated_at', coalesce(p_values->>'updated_at', now()::text)
  );
  EXECUTE format(
    'INSERT INTO public.%I SELECT x.* FROM jsonb_populate_record(NULL::public.%I, $1) x ON CONFLICT (id) DO NOTHING',
    p_table, p_table
  ) USING p_values;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.demo_feve_upsert_owned_row(text, jsonb, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.demo_feve_upsert_owned_row(text, jsonb, uuid) TO service_role;