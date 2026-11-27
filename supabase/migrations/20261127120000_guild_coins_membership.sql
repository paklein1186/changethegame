-- Cotisations de guilde en Coins : rythme mensuel ou annuel, prélèvement atomique, renouvellement sans double débit.
--
-- guilds.billing_model vaut désormais 'one_time', 'monthly' ou 'yearly'. Pour les deux formules récurrentes,
-- le montant reste dans monthly_fee_credits / monthly_fee_max_credits (nom historique : « montant par période »).
--
-- Avant : guild-membership-pay et guild-membership-renew lisaient le solde, puis écrivaient solde - montant.
-- Deux appels simultanés (double clic, cron rejoué) débitaient donc une seule fois mais créditaient la guilde
-- deux fois, et le renouvellement pouvait être facturé deux fois pour la même période.
-- Désormais le débit est conditionnel (solde suffisant) et fait dans la même transaction que le crédit de la
-- guilde et les deux écritures de journal ; le renouvellement verrouille la ligne d'adhésion.

-- 1. Prélèvement d'une cotisation : null si le solde ne suffit pas, sinon le nouveau solde.
CREATE OR REPLACE FUNCTION public.charge_guild_membership_coins(
  p_user_id uuid,
  p_guild_id uuid,
  p_amount numeric,
  p_tx_type text,
  p_user_source text,
  p_guild_source text
) RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance numeric;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid amount';
  END IF;

  UPDATE profiles
     SET coins_balance = coins_balance - p_amount
   WHERE user_id = p_user_id AND coins_balance >= p_amount
  RETURNING coins_balance INTO v_balance;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  INSERT INTO guild_wallets (guild_id, coins_balance)
  VALUES (p_guild_id, p_amount)
  ON CONFLICT (guild_id) DO UPDATE
    SET coins_balance = guild_wallets.coins_balance + EXCLUDED.coins_balance,
        updated_at = now();

  INSERT INTO coin_transactions (user_id, type, amount, source, related_entity_type, related_entity_id)
  VALUES (p_user_id, 'GUILD_MEMBERSHIP', -p_amount, p_user_source, 'guild', p_guild_id);

  INSERT INTO guild_credit_transactions (guild_id, user_id, amount, currency, type, source)
  VALUES (p_guild_id, p_user_id, p_amount, 'coins', p_tx_type, p_guild_source);

  RETURN v_balance;
END;
$$;

-- 2. Renouvellement d'une période : verrouille l'adhésion, vérifie qu'elle n'a pas déjà été renouvelée
--    (fin de période inchangée), prélève, puis prolonge d'un mois ou d'un an.
--    Retour : { ok, reason?, current_period_end?, new_balance? }.
CREATE OR REPLACE FUNCTION public.renew_guild_membership_coins(
  p_membership_id uuid,
  p_expected_period_end timestamptz,
  p_amount numeric,
  p_interval text,
  p_user_source text,
  p_guild_source text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m record;
  v_balance numeric;
  v_end timestamptz;
BEGIN
  IF p_interval NOT IN ('month', 'year') THEN
    RAISE EXCEPTION 'Invalid interval';
  END IF;

  SELECT * INTO m FROM user_guild_memberships WHERE id = p_membership_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  IF m.current_period_end IS DISTINCT FROM p_expected_period_end
     OR m.role <> 'member' OR m.status NOT IN ('active', 'grace') OR m.cancel_at_period_end THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_handled');
  END IF;

  v_balance := charge_guild_membership_coins(m.user_id, m.guild_id, p_amount, 'MEMBERSHIP_RENEWAL', p_user_source, p_guild_source);
  IF v_balance IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'insufficient');
  END IF;

  v_end := m.current_period_end + CASE p_interval WHEN 'year' THEN interval '1 year' ELSE interval '1 month' END;
  UPDATE user_guild_memberships
     SET status = 'active',
         role = 'member',
         current_period_end = v_end,
         membership_expires_at = v_end,
         last_payment_at = now()
   WHERE id = p_membership_id;

  RETURN jsonb_build_object('ok', true, 'current_period_end', v_end, 'new_balance', v_balance);
END;
$$;

-- Réservées aux fonctions serveur.
REVOKE ALL ON FUNCTION public.charge_guild_membership_coins(uuid, uuid, numeric, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.renew_guild_membership_coins(uuid, timestamptz, numeric, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.charge_guild_membership_coins(uuid, uuid, numeric, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.renew_guild_membership_coins(uuid, timestamptz, numeric, text, text, text) TO service_role;
