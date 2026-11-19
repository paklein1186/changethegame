-- Codes d'adhésion : un payeur (organisation, GAL) paie pour d'autres personnes ou lieux,
-- et reçoit un code par place payée. Chaque bénéficiaire saisit son code pour activer
-- sa propre adhésion, avec son propre compte. Décision Trois-Tiers du 19/11/2026.
--
-- Une place = un code. Les codes suivent l'abonnement Stripe du payeur :
--   - renouvellement payé  → codes et adhésions des bénéficiaires prolongés ;
--   - impayé / résiliation → même statut pour les bénéficiaires (ils partagent
--     stripe_subscription_id avec le payeur dans user_guild_memberships).

-- Formule attribuée au bénéficiaire de chaque type de place. Vide pour une personne
-- supplémentaire = la formule du payeur.
ALTER TABLE public.guild_membership_plans
  ADD COLUMN IF NOT EXISTS extra_person_plan_code text,
  ADD COLUMN IF NOT EXISTS small_place_plan_code text,
  ADD COLUMN IF NOT EXISTS large_place_plan_code text;

CREATE TABLE IF NOT EXISTS public.guild_membership_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id uuid NOT NULL REFERENCES public.guilds(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9-]{8,40}$'),
  -- extra_person | small_place | large_place, et rang dans l'abonnement (1, 2, 3…)
  slot text NOT NULL CHECK (slot IN ('extra_person', 'small_place', 'large_place')),
  position integer NOT NULL CHECK (position > 0),
  plan_code text NOT NULL,
  payer_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_subscription_id text NOT NULL,
  valid_until timestamptz,
  redeemed_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  redeemed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (stripe_subscription_id, slot, position)
);

CREATE INDEX IF NOT EXISTS idx_gmc_payer ON public.guild_membership_codes(payer_user_id, guild_id);

ALTER TABLE public.guild_membership_codes ENABLE ROW LEVEL SECURITY;

-- Lecture : le payeur voit ses codes, les admins de la guilde voient ceux de la guilde.
-- Aucune écriture depuis le navigateur : création et utilisation passent par les fonctions serveur.
CREATE POLICY "Payer reads own membership codes"
  ON public.guild_membership_codes FOR SELECT
  TO authenticated
  USING (payer_user_id = auth.uid());

CREATE POLICY "Guild admins read membership codes"
  ON public.guild_membership_codes FOR SELECT
  TO authenticated
  USING (public.is_guild_admin(guild_id, auth.uid()));

-- Trois-Tiers : un partenaire bénéficiaire (GAL…) paie pour des lieux de son territoire.
-- Sans effet sur une base où cette guilde n'existe pas (brouillon, autre projet).
UPDATE public.guild_membership_plans
SET small_place_plan_code = 'lieu_moins_20',
    large_place_plan_code = 'lieu_20_et_plus'
WHERE guild_id = '4964c699-4684-43a9-b508-cee21c77e24e'
  AND code = 'partenaire_beneficiaire';
