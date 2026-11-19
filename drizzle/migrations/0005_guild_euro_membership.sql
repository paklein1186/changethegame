-- Applied from supabase/migrations/20261119150000_guild_euro_membership.sql
ALTER TABLE public.user_guild_memberships
  ADD COLUMN IF NOT EXISTS plan_code text,
  ADD COLUMN IF NOT EXISTS payer_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS amount_paid_cents integer,
  ADD COLUMN IF NOT EXISTS currency text;
CREATE INDEX IF NOT EXISTS idx_ugm_stripe_subscription ON public.user_guild_memberships(stripe_subscription_id);
DROP POLICY IF EXISTS "Users can insert own membership" ON public.user_guild_memberships;
CREATE POLICY "Users can join as guest" ON public.user_guild_memberships FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND role = 'guest' AND membership_expires_at IS NULL AND current_period_end IS NULL AND last_payment_at IS NULL AND chosen_fee_credits IS NULL AND plan_code IS NULL AND payer_user_id IS NULL AND stripe_customer_id IS NULL AND stripe_subscription_id IS NULL AND amount_paid_cents IS NULL);
CREATE OR REPLACE FUNCTION public.guard_membership_self_update()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
  IF auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'admin') THEN RETURN NEW; END IF;
  IF (to_jsonb(NEW) - 'cancel_at_period_end') IS DISTINCT FROM (to_jsonb(OLD) - 'cancel_at_period_end') THEN
    RAISE EXCEPTION 'Seul le renouvellement peut être modifié par le membre lui-même.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS guard_membership_self_update ON public.user_guild_memberships;
CREATE TRIGGER guard_membership_self_update BEFORE UPDATE ON public.user_guild_memberships FOR EACH ROW EXECUTE FUNCTION public.guard_membership_self_update();
ALTER TABLE public.guilds
  ADD COLUMN IF NOT EXISTS euro_membership_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_account_ref text CHECK (stripe_account_ref IS NULL OR stripe_account_ref ~ '^[A-Z0-9_]{1,40}$');
CREATE TABLE IF NOT EXISTS public.guild_membership_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id uuid NOT NULL REFERENCES public.guilds(id) ON DELETE CASCADE,
  code text NOT NULL CHECK (code ~ '^[a-z0-9_]{1,60}$'),
  label text NOT NULL,
  currency text NOT NULL DEFAULT 'eur',
  billing_interval text NOT NULL DEFAULT 'year' CHECK (billing_interval IN ('month', 'year')),
  base_amount_cents integer NOT NULL DEFAULT 0 CHECK (base_amount_cents >= 0),
  per_extra_person_cents integer NOT NULL DEFAULT 0 CHECK (per_extra_person_cents >= 0),
  per_small_place_cents integer NOT NULL DEFAULT 0 CHECK (per_small_place_cents >= 0),
  per_large_place_cents integer NOT NULL DEFAULT 0 CHECK (per_large_place_cents >= 0),
  badge_codes text[] NOT NULL DEFAULT ARRAY['adherent'],
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (guild_id, code)
);
GRANT SELECT ON public.guild_membership_plans TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.guild_membership_plans TO authenticated;
GRANT ALL ON public.guild_membership_plans TO service_role;
ALTER TABLE public.guild_membership_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read active membership plans" ON public.guild_membership_plans FOR SELECT TO anon, authenticated USING (active);
CREATE POLICY "Guild admins manage membership plans" ON public.guild_membership_plans FOR ALL TO authenticated
  USING (public.is_guild_admin(guild_id, auth.uid())) WITH CHECK (public.is_guild_admin(guild_id, auth.uid()));
CREATE TABLE IF NOT EXISTS public.stripe_guild_events (
  event_id text PRIMARY KEY, account_ref text NOT NULL, type text NOT NULL, received_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.stripe_guild_events TO service_role;
ALTER TABLE public.stripe_guild_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entity_roles ADD COLUMN IF NOT EXISTS code text CHECK (code IS NULL OR code ~ '^[a-z0-9_]{1,60}$');
CREATE UNIQUE INDEX IF NOT EXISTS idx_entity_roles_code ON public.entity_roles(entity_type, entity_id, code) WHERE code IS NOT NULL;
ALTER TABLE public.entity_member_roles
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS scope_type text CHECK (scope_type IS NULL OR scope_type IN ('quest', 'territory')),
  ADD COLUMN IF NOT EXISTS scope_id uuid;