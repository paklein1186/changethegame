
CREATE OR REPLACE FUNCTION public.sync_plan_categories()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_code text; v_role uuid; v_end timestamptz; v_active boolean;
BEGIN
  FOR v_code IN SELECT unnest(p.badge_codes) FROM guild_membership_plans p WHERE p.guild_id = NEW.guild_id AND p.code = NEW.plan_code LOOP
    SELECT id INTO v_role FROM entity_roles WHERE entity_type = 'guild' AND entity_id = NEW.guild_id AND code = v_code;
    CONTINUE WHEN v_role IS NULL;
    SELECT bool_or(true), max(coalesce(up.current_period_end, up.membership_expires_at, 'infinity'))
      INTO v_active, v_end
    FROM user_guild_plans up JOIN guild_membership_plans p ON p.guild_id = up.guild_id AND p.code = up.plan_code
    WHERE up.guild_id = NEW.guild_id AND up.user_id = NEW.user_id AND v_code = ANY(p.badge_codes)
      AND public.guild_plan_is_active(up.status, coalesce(up.current_period_end, up.membership_expires_at));
    IF coalesce(v_active, false) THEN
      INSERT INTO entity_member_roles (entity_role_id, user_id, expires_at)
      VALUES (v_role, NEW.user_id, CASE WHEN v_end = 'infinity' THEN NULL ELSE v_end END)
      ON CONFLICT (entity_role_id, user_id) DO UPDATE SET expires_at = EXCLUDED.expires_at;
    ELSE
      UPDATE entity_member_roles SET expires_at = least(coalesce(expires_at, now()), now())
      WHERE entity_role_id = v_role AND user_id = NEW.user_id AND scope_type IS NULL;
    END IF;
  END LOOP;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_sync_plan_categories ON public.user_guild_plans;
CREATE TRIGGER trg_sync_plan_categories AFTER INSERT OR UPDATE ON public.user_guild_plans
  FOR EACH ROW EXECUTE FUNCTION public.sync_plan_categories();
