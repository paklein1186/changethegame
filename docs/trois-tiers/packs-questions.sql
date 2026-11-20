-- Packs de questions de la bibliothèque Trois-Tiers (décision de PA du 20/11/2026) :
-- 50 questions pour 5 €, 200 questions pour 15 €, sans limite de durée.
-- À exécuter une fois dans l'éditeur SQL (production), après la migration 20261120150000_guild_credit_packs.sql.
-- Rejouable : met à jour les packs existants.
INSERT INTO public.guild_credit_packs (guild_id, code, label, description, credits, amount_cents, currency, valid_months, active, sort_order)
VALUES
  ('4964c699-4684-43a9-b508-cee21c77e24e', 'questions_50', '50 questions', 'Pour la bibliothèque du réseau, en plus des questions comprises dans l''adhésion. Sans limite de durée.', 50, 500, 'eur', NULL, true, 1),
  ('4964c699-4684-43a9-b508-cee21c77e24e', 'questions_200', '200 questions', 'Pour la bibliothèque du réseau, en plus des questions comprises dans l''adhésion. Sans limite de durée.', 200, 1500, 'eur', NULL, true, 2)
ON CONFLICT (guild_id, code) DO UPDATE
SET label = EXCLUDED.label, description = EXCLUDED.description, credits = EXCLUDED.credits,
    amount_cents = EXCLUDED.amount_cents, currency = EXCLUDED.currency, valid_months = EXCLUDED.valid_months,
    active = EXCLUDED.active, sort_order = EXCLUDED.sort_order;
