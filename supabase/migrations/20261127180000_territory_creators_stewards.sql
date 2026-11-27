-- Les personnes qui ont créé un territoire en deviennent steward (rattrapage de l'existant).
--
-- Un steward de territoire est un lien de confiance « stewardship » actif profil → territoire (trust_edges),
-- ce que lisent la page du territoire, son panneau d'administration et get_territory_stewards.
-- La création de biorégion tentait déjà d'ajouter ce lien, mais avec des colonnes qui n'existent pas
-- (weight, evidence_count) et un type de nœud invalide (« user ») : l'insertion échouait sans bruit.
--
-- Seules les personnes : les comptes agents (imports automatiques, ex. Space2) ne deviennent pas stewards,
-- sinon ils bloqueraient les demandes de stewardship qu'ils ne peuvent pas valider.
-- Rejouable : un lien déjà actif n'est pas dupliqué. Pas d'XP : le déclencheur d'XP ne vise que les liens vers un profil.

INSERT INTO public.trust_edges (
  from_node_type, from_node_id, to_node_type, to_node_id, edge_type,
  score, status, visibility, created_by, context_territory_id, tags, note, last_confirmed_at
)
SELECT 'profile', t.created_by_user_id, 'territory', t.id, 'stewardship',
       3, 'active', 'public', t.created_by_user_id, t.id, ARRAY['founder'], 'Créateur du territoire', now()
FROM public.territories t
JOIN public.profiles p ON p.user_id = t.created_by_user_id
WHERE t.created_by_user_id IS NOT NULL
  AND coalesce(t.is_deleted, false) = false
  AND coalesce(p.is_agent, false) = false
  AND NOT EXISTS (
    SELECT 1 FROM public.trust_edges te
    WHERE te.from_node_type = 'profile' AND te.from_node_id::text = t.created_by_user_id::text
      AND te.to_node_type = 'territory' AND te.to_node_id::text = t.id::text
      AND te.edge_type = 'stewardship' AND te.status = 'active'
  );
