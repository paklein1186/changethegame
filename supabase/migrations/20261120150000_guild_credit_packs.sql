-- Packs de questions payés en euros (décision Trois-Tiers du 20/11/2026) : au-delà du quota mensuel
-- inclus dans l'adhésion, un membre achète un pack de questions pour la bibliothèque (Space2),
-- payé une fois sur le compte Stripe de la guilde (même compte que les cotisations).
--
-- - guild_credit_packs     : packs proposés par la guilde (contenu et prix fixés par la guilde).
-- - guild_credit_purchases : achats ; chaque achat garde son solde restant et sa date d'expiration.
-- - guild_credit_uses      : questions décomptées (journal).
-- Le décompte passe par consume_guild_credits (fonction serveur) : les packs qui expirent le plus tôt
-- sont utilisés d'abord, et deux décomptes simultanés ne peuvent pas dépasser le solde.

CREATE TABLE IF NOT EXISTS public.guild_credit_packs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id uuid NOT NULL REFERENCES public.guilds(id) ON DELETE CASCADE,
  code text NOT NULL CHECK (code ~ '^[a-z0-9_]{1,60}$'),
  label text NOT NULL,
  description text,
  credits integer NOT NULL CHECK (credits > 0 AND credits <= 100000),
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  currency text NOT NULL DEFAULT 'eur',
  -- Durée de validité des questions achetées, en mois ; vide = sans limite.
  valid_months integer CHECK (valid_months IS NULL OR valid_months BETWEEN 1 AND 120),
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (guild_id, code)
);

ALTER TABLE public.guild_credit_packs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active credit packs"
  ON public.guild_credit_packs FOR SELECT
  TO anon, authenticated
  USING (active);

CREATE POLICY "Guild admins manage credit packs"
  ON public.guild_credit_packs FOR ALL
  TO authenticated
  USING (public.is_guild_admin(guild_id, auth.uid()))
  WITH CHECK (public.is_guild_admin(guild_id, auth.uid()));

CREATE TABLE IF NOT EXISTS public.guild_credit_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id uuid NOT NULL REFERENCES public.guilds(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pack_code text NOT NULL,
  credits integer NOT NULL CHECK (credits > 0),
  credits_remaining integer NOT NULL CHECK (credits_remaining >= 0),
  amount_cents integer,
  currency text,
  stripe_session_id text NOT NULL UNIQUE,   -- une session Stripe ne crédite qu'une fois
  stripe_payment_intent_id text,
  purchased_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  CHECK (credits_remaining <= credits)
);

CREATE INDEX IF NOT EXISTS idx_gcp_user ON public.guild_credit_purchases(user_id, guild_id);

ALTER TABLE public.guild_credit_purchases ENABLE ROW LEVEL SECURITY;

-- Lecture : chacun voit ses achats, les admins de la guilde ceux de la guilde.
-- Aucune écriture depuis le navigateur : crédit et décompte passent par les fonctions serveur.
CREATE POLICY "Users read own credit purchases"
  ON public.guild_credit_purchases FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Guild admins read credit purchases"
  ON public.guild_credit_purchases FOR SELECT
  TO authenticated
  USING (public.is_guild_admin(guild_id, auth.uid()));

CREATE TABLE IF NOT EXISTS public.guild_credit_uses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id uuid NOT NULL REFERENCES public.guild_credit_purchases(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount integer NOT NULL CHECK (amount > 0),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.guild_credit_uses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own credit uses"
  ON public.guild_credit_uses FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Solde utilisable (achats non expirés).
CREATE OR REPLACE FUNCTION public.guild_credit_balance(p_guild_id uuid, p_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(credits_remaining), 0)::integer
  FROM public.guild_credit_purchases
  WHERE guild_id = p_guild_id AND user_id = p_user_id
    AND credits_remaining > 0
    AND (expires_at IS NULL OR expires_at > now());
$$;

-- Décompte de p_amount questions. Renvoie le solde restant, ou NULL (rien décompté) si le solde
-- ne suffit pas. Les packs qui expirent le plus tôt partent en premier.
CREATE OR REPLACE FUNCTION public.consume_guild_credits(p_guild_id uuid, p_user_id uuid, p_amount integer, p_reason text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  achat record;
  reste integer := p_amount;
  pris integer;
  disponible integer;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 100 THEN
    RAISE EXCEPTION 'invalid amount';
  END IF;
  -- Verrouille les achats de la personne pour toute la transaction.
  SELECT COALESCE(SUM(credits_remaining), 0) INTO disponible
  FROM (
    SELECT credits_remaining FROM public.guild_credit_purchases
    WHERE guild_id = p_guild_id AND user_id = p_user_id AND credits_remaining > 0
      AND (expires_at IS NULL OR expires_at > now())
    FOR UPDATE
  ) s;
  IF disponible < p_amount THEN
    RETURN NULL;
  END IF;
  FOR achat IN
    SELECT id, credits_remaining FROM public.guild_credit_purchases
    WHERE guild_id = p_guild_id AND user_id = p_user_id AND credits_remaining > 0
      AND (expires_at IS NULL OR expires_at > now())
    ORDER BY expires_at ASC NULLS LAST, purchased_at ASC
  LOOP
    EXIT WHEN reste = 0;
    pris := LEAST(reste, achat.credits_remaining);
    UPDATE public.guild_credit_purchases SET credits_remaining = credits_remaining - pris WHERE id = achat.id;
    INSERT INTO public.guild_credit_uses (purchase_id, user_id, amount, reason)
      VALUES (achat.id, p_user_id, pris, left(p_reason, 200));
    reste := reste - pris;
  END LOOP;
  RETURN disponible - p_amount;
END;
$$;

-- Réservées aux fonctions serveur (clé service_role) : personne ne décompte ni ne lit le solde
-- d'un autre depuis le navigateur.
REVOKE ALL ON FUNCTION public.guild_credit_balance(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.consume_guild_credits(uuid, uuid, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guild_credit_balance(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_guild_credits(uuid, uuid, integer, text) TO service_role;
