-- Formules de cotisation de la guilde Trois-Tiers (montants en centimes d'euro).
-- À exécuter une fois, dans l'éditeur SQL de Supabase, APRÈS la migration
-- 20261119150000_guild_euro_membership.sql.
-- Remplacer <GUILD_ID> par l'identifiant de la guilde Trois-Tiers.
-- Source des montants : communaute.yaml du site Trois-Tiers (décisions du 19/11/2026).

UPDATE public.guilds
SET euro_membership_enabled = true,
    stripe_account_ref = 'GUILD'          -- secrets STRIPE_SECRET_KEY_GUILD / STRIPE_WEBHOOK_SECRET_GUILD
WHERE id = '<GUILD_ID>';

INSERT INTO public.guild_membership_plans
  (guild_id, code, label, billing_interval, base_amount_cents, per_extra_person_cents, per_small_place_cents, per_large_place_cents, sort_order)
VALUES
  ('<GUILD_ID>', 'citoyen',                   'Citoyen soutenant',             'year', 6000,  0,    0,    0,     10),
  ('<GUILD_ID>', 'citoyen_mensuel',           'Citoyen soutenant (mensuel)',   'month', 500,  0,    0,    0,     11),
  ('<GUILD_ID>', 'accompagnant_freelance',    'Accompagnant freelance',        'year', 10000, 0,    0,    0,     20),
  ('<GUILD_ID>', 'accompagnant_organisation', 'Organisation d''accompagnement','year', 10000, 5000, 0,    0,     30),
  ('<GUILD_ID>', 'partenaire_allie',          'Partenaire allié',              'year', 35000, 0,    0,    0,     40),
  ('<GUILD_ID>', 'partenaire_beneficiaire',   'Partenaire bénéficiaire',       'year', 35000, 0,    6000, 10000, 50),
  ('<GUILD_ID>', 'lieu_moins_20',             'Lieu (moins de 20 usagers)',    'year', 6000,  0,    0,    0,     60),
  ('<GUILD_ID>', 'lieu_20_et_plus',           'Lieu (20 usagers ou plus)',     'year', 10000, 0,    0,    0,     61)
ON CONFLICT (guild_id, code) DO UPDATE
SET label = EXCLUDED.label,
    billing_interval = EXCLUDED.billing_interval,
    base_amount_cents = EXCLUDED.base_amount_cents,
    per_extra_person_cents = EXCLUDED.per_extra_person_cents,
    per_small_place_cents = EXCLUDED.per_small_place_cents,
    per_large_place_cents = EXCLUDED.per_large_place_cents,
    sort_order = EXCLUDED.sort_order;
