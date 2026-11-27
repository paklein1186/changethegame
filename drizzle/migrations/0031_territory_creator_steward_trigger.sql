-- Nouveaux territoires : la personne qui les crée en devient automatiquement steward.
-- (Le rattrapage de l'existant est dans 20261127180000_territory_creators_stewards.sql.)
--
-- 1. Avant l'insertion : si le créateur n'est pas renseigné (assistant d'administration, création depuis
--    le fil), c'est la personne connectée. Les fonctions serveur (sans session) ne changent pas.
-- 2. Après l'insertion : lien « stewardship » actif profil → territoire, sauf pour les comptes agents
--    (imports automatiques). Un échec ici n'empêche jamais la création du territoire.

CREATE OR REPLACE FUNCTION public.territory_fill_creator()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.created_by_user_id IS NULL THEN
    NEW.created_by_user_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.territory_creator_becomes_steward()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.created_by_user_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = NEW.created_by_user_id AND coalesce(p.is_agent, false) = false)
     OR EXISTS (SELECT 1 FROM trust_edges te
                WHERE te.from_node_type = 'profile' AND te.from_node_id::text = NEW.created_by_user_id::text
                  AND te.to_node_type = 'territory' AND te.to_node_id::text = NEW.id::text
                  AND te.edge_type = 'stewardship' AND te.status = 'active') THEN
    RETURN NEW;
  END IF;

  BEGIN
    INSERT INTO trust_edges (
      from_node_type, from_node_id, to_node_type, to_node_id, edge_type,
      score, status, visibility, created_by, context_territory_id, tags, note, last_confirmed_at
    ) VALUES (
      'profile', NEW.created_by_user_id, 'territory', NEW.id, 'stewardship',
      3, 'active', 'public', NEW.created_by_user_id, NEW.id, ARRAY['founder'], 'Créateur du territoire', now()
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'territory % : steward du créateur non ajouté (%)', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_territory_fill_creator ON public.territories;
CREATE TRIGGER trg_territory_fill_creator
  BEFORE INSERT ON public.territories
  FOR EACH ROW EXECUTE FUNCTION public.territory_fill_creator();

DROP TRIGGER IF EXISTS trg_territory_creator_steward ON public.territories;
CREATE TRIGGER trg_territory_creator_steward
  AFTER INSERT ON public.territories
  FOR EACH ROW EXECUTE FUNCTION public.territory_creator_becomes_steward();

REVOKE ALL ON FUNCTION public.territory_creator_becomes_steward() FROM PUBLIC, anon, authenticated;