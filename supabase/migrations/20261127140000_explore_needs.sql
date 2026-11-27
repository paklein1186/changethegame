-- Onglet « Besoins » d'Explorer : les besoins ouverts des quêtes (et de leurs guildes), filtrables par territoire,
-- catégorie et texte, avec une correspondance calculée avec les compétences de la personne connectée.
--
-- Correspondance : meilleure similarité entre l'empreinte du besoin (opportunity_needs, calculée par
-- opportunity-engine) et les compétences non écartées de la personne ; avec p_scope = 'me_and_guilds', aussi
-- celles des guildes dont elle est membre. Un besoin pas encore analysé n'a pas de score : il n'apparaît que
-- dans « Tous les besoins », jusqu'au prochain passage du moteur.
--
-- p_scope : 'me' (ce qui correspond à mes compétences), 'me_and_guilds' (élargi à mes guildes), 'all'.
-- p_territory_id : le territoire et tout ce qu'il contient (territory_closure), via la quête ou sa guilde.

CREATE OR REPLACE FUNCTION public.explore_needs(
  p_scope text DEFAULT 'all',
  p_territory_id uuid DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_query text DEFAULT NULL,
  p_limit integer DEFAULT 30,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  need_id uuid, title text, description text, category text, status text, created_at timestamptz,
  quest_id uuid, quest_title text, quest_cover text, owner_id uuid, owner_name text, guild_id uuid, guild_name text, guild_logo text,
  territory_names text[], match_score numeric, match_label text, match_owner_type text, match_owner_name text,
  is_mine boolean, total_count bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH me AS (SELECT auth.uid() AS uid),
  my_guilds AS (SELECT gm.guild_id FROM public.guild_members gm, me WHERE gm.user_id = me.uid),
  my_caps AS (
    SELECT c.id, c.label, c.owner_type, c.embedding,
           CASE c.owner_type WHEN 'guild' THEN (SELECT g.name FROM public.guilds g WHERE g.id = c.owner_id) END AS owner_name
    FROM public.capabilities c, me
    WHERE c.embedding IS NOT NULL AND c.status <> 'dismissed'
      AND ((c.owner_type = 'profile' AND c.owner_id = me.uid)
        OR (p_scope IN ('me_and_guilds', 'all') AND c.owner_type = 'guild' AND c.owner_id IN (SELECT guild_id FROM my_guilds)))
  ),
  area AS (
    SELECT tc.descendant_id AS territory_id FROM public.territory_closure tc WHERE tc.ancestor_id = p_territory_id
    UNION SELECT p_territory_id WHERE p_territory_id IS NOT NULL
  ),
  needs AS (
    SELECT qn.id, qn.title, qn.description, coalesce(qn.category, 'GENERAL') AS category, coalesce(qn.status, 'OPEN') AS status,
           qn.created_at, q.id AS quest_id, q.title AS quest_title, q.cover_image_url, q.created_by_user_id,
           coalesce(q.guild_id, (SELECT h.entity_id FROM public.quest_hosts h
                                  WHERE h.quest_id = q.id AND upper(h.entity_type::text) = 'GUILD' LIMIT 1)) AS guild_id,
           onn.embedding
    FROM public.quest_needs qn
    JOIN public.quests q ON q.id = qn.quest_id
    LEFT JOIN public.opportunity_needs onn ON onn.source = 'quest_need' AND onn.source_id = qn.id
    WHERE upper(coalesce(qn.status, 'OPEN')) IN ('OPEN', 'ACTIVE', 'IN_PROGRESS')
      AND q.is_deleted = false AND coalesce(q.is_draft, false) = false
      AND q.public_visibility = 'public'
      AND q.status::text NOT IN ('COMPLETED', 'CANCELLED', 'DRAFT')
      AND (p_category IS NULL OR coalesce(qn.category, 'GENERAL') = p_category)
      AND (p_query IS NULL OR btrim(p_query) = ''
           OR qn.title ILIKE '%' || btrim(p_query) || '%' OR qn.description ILIKE '%' || btrim(p_query) || '%'
           OR q.title ILIKE '%' || btrim(p_query) || '%')
  ),
  placed AS (
    SELECT n.* FROM needs n
    WHERE p_territory_id IS NULL
       OR EXISTS (SELECT 1 FROM public.quest_territories qt WHERE qt.quest_id = n.quest_id AND coalesce(qt.is_hidden, false) = false
                    AND qt.territory_id IN (SELECT territory_id FROM area))
       OR EXISTS (SELECT 1 FROM public.guild_territories gt WHERE gt.guild_id = n.guild_id
                    AND gt.territory_id IN (SELECT territory_id FROM area))
  ),
  scored AS (
    SELECT p.*, best.sim, best.label AS match_label, best.owner_type AS match_owner_type, best.owner_name AS match_owner_name,
           p.created_by_user_id = (SELECT uid FROM me) AS is_mine
    FROM placed p
    LEFT JOIN LATERAL (
      SELECT (1 - (c.embedding <=> p.embedding))::numeric AS sim, c.label, c.owner_type, c.owner_name
      FROM my_caps c
      WHERE p.embedding IS NOT NULL
      ORDER BY c.embedding <=> p.embedding
      LIMIT 1
    ) best ON true
  ),
  kept AS (
    SELECT s.* FROM scored s
    WHERE p_scope = 'all' OR (coalesce(s.sim, 0) >= 0.36 AND NOT s.is_mine)
  )
  SELECT k.id, k.title, k.description, k.category, k.status, k.created_at,
         k.quest_id, k.quest_title, k.cover_image_url, k.created_by_user_id,
         (SELECT pr.name FROM public.profiles pr WHERE pr.user_id = k.created_by_user_id),
         k.guild_id,
         (SELECT g.name FROM public.guilds g WHERE g.id = k.guild_id),
         (SELECT g.logo_url FROM public.guilds g WHERE g.id = k.guild_id),
         -- Territoires de la quête, sinon ceux de sa guilde.
         coalesce(
           nullif(ARRAY(SELECT t.name FROM public.quest_territories qt JOIN public.territories t ON t.id = qt.territory_id
                        WHERE qt.quest_id = k.quest_id AND coalesce(qt.is_hidden, false) = false AND t.is_deleted = false
                        ORDER BY qt.is_primary DESC NULLS LAST, t.name LIMIT 3), '{}'),
           ARRAY(SELECT t.name FROM public.guild_territories gt JOIN public.territories t ON t.id = gt.territory_id
                 WHERE gt.guild_id = k.guild_id AND t.is_deleted = false
                 ORDER BY gt.is_primary DESC NULLS LAST, t.name LIMIT 3)),
         round(k.sim, 3), k.match_label, k.match_owner_type, k.match_owner_name, coalesce(k.is_mine, false),
         count(*) OVER ()
  FROM kept k
  -- Ceux qui correspondent d'abord (du plus proche au moins proche), puis les plus récents.
  ORDER BY coalesce(k.sim, 0) >= 0.36 DESC,
           CASE WHEN coalesce(k.sim, 0) >= 0.36 THEN k.sim END DESC NULLS LAST,
           k.created_at DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 100) OFFSET GREATEST(p_offset, 0);
$$;

-- Territoires où se trouvent des besoins ouverts (avec leurs régions et pays), pour le filtre de l'onglet.
CREATE OR REPLACE FUNCTION public.explore_needs_territories()
RETURNS TABLE (territory_id uuid, name text, level text, need_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH open_needs AS (
    SELECT qn.id, q.id AS quest_id, q.guild_id
    FROM public.quest_needs qn JOIN public.quests q ON q.id = qn.quest_id
    WHERE upper(coalesce(qn.status, 'OPEN')) IN ('OPEN', 'ACTIVE', 'IN_PROGRESS')
      AND q.is_deleted = false AND coalesce(q.is_draft, false) = false AND q.public_visibility = 'public'
      AND q.status::text NOT IN ('COMPLETED', 'CANCELLED', 'DRAFT')
  ),
  placed AS (
    SELECT n.id, qt.territory_id FROM open_needs n
    JOIN public.quest_territories qt ON qt.quest_id = n.quest_id AND coalesce(qt.is_hidden, false) = false
    UNION
    SELECT n.id, gt.territory_id FROM open_needs n JOIN public.guild_territories gt ON gt.guild_id = n.guild_id
  ),
  rolled AS (
    SELECT p.id, p.territory_id FROM placed p
    UNION
    SELECT p.id, tc.ancestor_id FROM placed p JOIN public.territory_closure tc ON tc.descendant_id = p.territory_id
  )
  SELECT t.id, t.name, t.level::text, count(DISTINCT r.id)
  FROM rolled r JOIN public.territories t ON t.id = r.territory_id
  WHERE t.is_deleted = false AND t.level::text NOT IN ('GLOBAL', 'CONTINENT')
  GROUP BY t.id, t.name, t.level
  ORDER BY count(DISTINCT r.id) DESC, t.name
  LIMIT 300;
$$;

REVOKE ALL ON FUNCTION public.explore_needs(text, uuid, text, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.explore_needs(text, uuid, text, text, integer, integer) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.explore_needs_territories() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.explore_needs_territories() TO anon, authenticated;
