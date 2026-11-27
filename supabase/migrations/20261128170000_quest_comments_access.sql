-- Commentaires des quêtes : mêmes règles d'accès que le reste de la quête (20261127200000_quest_access.sql).
-- Constat (28/11) : les politiques restrictives couvraient besoins, actualités, sous-tâches, contributions, etc., mais
-- pas la table comments : la discussion d'une quête réservée aux membres (et celle de ses actualités et propositions)
-- restait lisible par tout le monde, et chacun pouvait y écrire.
-- Ici : lire ou écrire un commentaire dont la cible est une quête, une actualité ou une proposition de quête demande
-- l'accès complet à cette quête ('full'). La personne garde toujours la lecture de ses propres commentaires.

CREATE OR REPLACE FUNCTION public.comment_target_quest(_target_type text, _target_id text)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _target_id IS NULL OR _target_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RETURN NULL; END IF;
  RETURN CASE upper(_target_type)
    WHEN 'QUEST' THEN _target_id::uuid
    WHEN 'QUEST_UPDATE' THEN (SELECT quest_id FROM quest_updates WHERE id = _target_id::uuid)
    WHEN 'QUEST_PROPOSAL' THEN (SELECT quest_id FROM quest_proposals WHERE id = _target_id::uuid)
  END;
END;
$$;
REVOKE ALL ON FUNCTION public.comment_target_quest(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.comment_target_quest(text, text) TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "Quest access: comments" ON public.comments;
CREATE POLICY "Quest access: comments" ON public.comments AS RESTRICTIVE FOR SELECT
  USING (author_id = auth.uid()
         OR upper(target_type) NOT IN ('QUEST', 'QUEST_UPDATE', 'QUEST_PROPOSAL')
         OR public.can_access_quest(public.comment_target_quest(target_type, target_id)));

DROP POLICY IF EXISTS "Quest access: write comments" ON public.comments;
CREATE POLICY "Quest access: write comments" ON public.comments AS RESTRICTIVE FOR INSERT
  WITH CHECK (upper(target_type) NOT IN ('QUEST', 'QUEST_UPDATE', 'QUEST_PROPOSAL')
              OR public.can_access_quest(public.comment_target_quest(target_type, target_id)));
