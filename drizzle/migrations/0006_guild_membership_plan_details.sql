-- Description et avantages de chaque formule de cotisation, affichés aux futurs adhérents
-- pour comparer les formules (ce que chacune ouvre comme accès).
ALTER TABLE public.guild_membership_plans
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS benefits text[] NOT NULL DEFAULT '{}';