-- Besoins de quête partagés avec un site partenaire (Trois-Tiers, palier 2 B4) : lien explicite besoin ↔ besoin du
-- site, pour qu'un besoin ne soit jamais créé deux fois. Écrit seulement par guild-quest-sync (clé du site).
CREATE TABLE IF NOT EXISTS public.quest_need_external_links (
  need_id uuid NOT NULL REFERENCES public.quest_needs(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source ~ '^[a-z0-9_-]{2,40}$'),
  external_id text NOT NULL CHECK (length(external_id) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (need_id),
  UNIQUE (source, external_id)
);
ALTER TABLE public.quest_need_external_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.quest_need_external_links FROM anon, authenticated;
