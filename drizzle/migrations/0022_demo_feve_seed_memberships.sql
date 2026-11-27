CREATE OR REPLACE FUNCTION public.demo_feve_upsert_membership(
  p_table text, p_id uuid, p_owner_id uuid, p_user_id uuid, p_role text
) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_user_id::text, true);
  IF p_table = 'company_members' THEN
    INSERT INTO public.company_members (id, company_id, user_id, role)
    VALUES (p_id, p_owner_id, p_user_id, p_role)
    ON CONFLICT (id) DO UPDATE SET company_id=EXCLUDED.company_id,user_id=EXCLUDED.user_id,role=EXCLUDED.role;
  ELSIF p_table = 'guild_members' THEN
    INSERT INTO public.guild_members (id, guild_id, user_id, role)
    VALUES (p_id, p_owner_id, p_user_id, p_role::public.guild_member_role)
    ON CONFLICT (id) DO UPDATE SET guild_id=EXCLUDED.guild_id,user_id=EXCLUDED.user_id,role=EXCLUDED.role;
  ELSE
    RAISE EXCEPTION 'Unsupported demo membership table';
  END IF;
  RETURN p_id;
END;
$$;
REVOKE ALL ON FUNCTION public.demo_feve_upsert_membership(text, uuid, uuid, uuid, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.demo_feve_upsert_membership(text, uuid, uuid, uuid, text) TO service_role;