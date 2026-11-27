-- Lien explicite entre une quête et un objet d'un site partenaire (ex. un projet de la base Trois-Tiers).
-- Règle anti-doublon : un objet externe n'a qu'une quête, une quête n'a qu'un objet par source.
-- Écrit seulement par les fonctions serveur (guild-quest-sync) ; lisible par personne d'autre.
CREATE TABLE IF NOT EXISTS public.quest_external_links (
  quest_id uuid NOT NULL REFERENCES public.quests(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source ~ '^[a-z0-9_-]{2,40}$'),
  external_id text NOT NULL CHECK (length(external_id) BETWEEN 1 AND 200),
  created_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (quest_id, source),
  UNIQUE (source, external_id)
);
ALTER TABLE public.quest_external_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.quest_external_links FROM anon, authenticated;
