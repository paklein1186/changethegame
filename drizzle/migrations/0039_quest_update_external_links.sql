-- Nouvelles de quête publiées par un site partenaire (Trois-Tiers, palier 2 B3) : lien explicite nouvelle ↔ objet du
-- site, pour qu'une même nouvelle ne soit jamais publiée deux fois. Écrit seulement par guild-quest-sync.
CREATE TABLE IF NOT EXISTS public.quest_update_external_links (
  update_id uuid NOT NULL REFERENCES public.quest_updates(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source ~ '^[a-z0-9_-]{2,40}$'),
  external_id text NOT NULL CHECK (length(external_id) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (update_id),
  UNIQUE (source, external_id)
);
ALTER TABLE public.quest_update_external_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.quest_update_external_links FROM anon, authenticated;
