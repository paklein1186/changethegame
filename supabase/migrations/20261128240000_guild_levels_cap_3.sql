UPDATE public.entity_roles SET level = 3 WHERE level > 3;
UPDATE public.guild_membership_plans SET level = 3 WHERE level > 3;
ALTER TABLE public.entity_roles DROP CONSTRAINT entity_roles_level_check;
ALTER TABLE public.entity_roles ADD CONSTRAINT entity_roles_level_check CHECK (level IS NULL OR level BETWEEN 1 AND 3);
ALTER TABLE public.guild_membership_plans DROP CONSTRAINT guild_membership_plans_level_check;
ALTER TABLE public.guild_membership_plans ADD CONSTRAINT guild_membership_plans_level_check CHECK (level IS NULL OR level BETWEEN 1 AND 3);

CREATE OR REPLACE FUNCTION public.guild_member_level(_guild_id uuid, _user_id uuid)
 RETURNS smallint LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_level int := 0;
  v_membership boolean;
BEGIN
  IF _guild_id IS NULL OR _user_id IS NULL THEN RETURN 0; END IF;
  SELECT coalesce(g.enable_membership, false) INTO v_membership FROM guilds g WHERE g.id = _guild_id;
  IF NOT FOUND THEN RETURN 0; END IF;
  -- Seuls admin et créateur donnent 5 ; N4/N5 sont réservés à l'équipe de la quête et aux admins.
  IF public.is_guild_admin(_guild_id, _user_id)
     OR EXISTS (SELECT 1 FROM guilds g WHERE g.id = _guild_id AND g.created_by_user_id = _user_id) THEN
    RETURN 5;
  END IF;
  SELECT greatest(v_level, coalesce(max(least(er.level, 3)), 0)) INTO v_level
  FROM entity_member_roles emr JOIN entity_roles er ON er.id = emr.entity_role_id
  WHERE emr.user_id = _user_id AND er.entity_type = 'guild' AND er.entity_id = _guild_id
    AND emr.scope_type IS NULL AND (emr.expires_at IS NULL OR emr.expires_at > now());
  SELECT greatest(v_level, coalesce(max(least(coalesce(p.level, 2), 3)), 0)) INTO v_level
  FROM user_guild_plans up
  LEFT JOIN guild_membership_plans p ON p.guild_id = up.guild_id AND p.code = up.plan_code
  WHERE up.guild_id = _guild_id AND up.user_id = _user_id
    AND public.guild_plan_is_active(up.status, coalesce(up.current_period_end, up.membership_expires_at));
  IF v_level >= 2 THEN RETURN v_level; END IF;
  IF EXISTS (SELECT 1 FROM user_guild_memberships m
             WHERE m.guild_id = _guild_id AND m.user_id = _user_id AND m.role = 'member'
               AND public.guild_plan_is_active(m.status, coalesce(m.current_period_end, m.membership_expires_at))) THEN
    RETURN 2;
  END IF;
  IF NOT v_membership AND EXISTS (SELECT 1 FROM guild_members gm WHERE gm.guild_id = _guild_id AND gm.user_id = _user_id) THEN
    RETURN 2;
  END IF;
  IF v_level >= 1
     OR EXISTS (SELECT 1 FROM guild_members gm WHERE gm.guild_id = _guild_id AND gm.user_id = _user_id)
     OR EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = _user_id AND upper(f.target_type) = 'GUILD' AND f.target_id = _guild_id::text)
     OR EXISTS (SELECT 1 FROM user_guild_memberships m WHERE m.guild_id = _guild_id AND m.user_id = _user_id) THEN
    RETURN 1;
  END IF;
  RETURN 0;
END;
$function$;

NOTIFY pgrst, 'reload schema';