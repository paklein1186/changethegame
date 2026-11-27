CREATE OR REPLACE FUNCTION public.demo_feve_snapshot()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_demo_feve_viewer() THEN
    RAISE EXCEPTION 'Demo access required' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'registry_count', (SELECT count(*) FROM public.demo_seed_registry WHERE seed_key = 'feve-2026-12'),
    'profiles', (SELECT coalesce(jsonb_agg(jsonb_build_object('user_id',p.user_id,'name',p.name,'email',p.email,'avatar_url',p.avatar_url,'headline',p.headline,'bio',p.bio,'location',p.location,'preferred_language',p.preferred_language) ORDER BY p.name),'[]'::jsonb) FROM public.profiles p JOIN public.demo_seed_registry r ON r.row_id=p.user_id AND r.table_name='profiles' AND r.seed_key='feve-2026-12'),
    'territories', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'level',t.level,'parent_id',t.parent_id,'summary',t.summary,'latitude',t.latitude,'longitude',t.longitude) ORDER BY t.name),'[]'::jsonb) FROM public.territories t JOIN public.demo_seed_registry r ON r.row_id=t.id AND r.table_name='territories' AND r.seed_key='feve-2026-12'),
    'companies', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'description',c.description,'org_type',c.org_type,'contact_user_id',c.contact_user_id,'logo_url',c.logo_url) ORDER BY c.name),'[]'::jsonb) FROM public.companies c JOIN public.demo_seed_registry r ON r.row_id=c.id AND r.table_name='companies' AND r.seed_key='feve-2026-12'),
    'guilds', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'description',g.description,'type',g.type,'created_by_user_id',g.created_by_user_id,'logo_url',g.logo_url) ORDER BY g.name),'[]'::jsonb) FROM public.guilds g JOIN public.demo_seed_registry r ON r.row_id=g.id AND r.table_name='guilds' AND r.seed_key='feve-2026-12'),
    'quests', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',q.id,'title',q.title,'description',q.description,'created_by_user_id',q.created_by_user_id,'quest_nature',q.quest_nature,'status',q.status) ORDER BY q.created_at),'[]'::jsonb) FROM public.quests q JOIN public.demo_seed_registry r ON r.row_id=q.id AND r.table_name='quests' AND r.seed_key='feve-2026-12'),
    'quest_needs', (SELECT coalesce(jsonb_agg(to_jsonb(n) - 'updated_at' ORDER BY n.created_at),'[]'::jsonb) FROM public.quest_needs n JOIN public.demo_seed_registry r ON r.row_id=n.id AND r.table_name='quest_needs' AND r.seed_key='feve-2026-12'),
    'opportunity_needs', (SELECT coalesce(jsonb_agg(to_jsonb(n) - 'embedding' ORDER BY n.matched_at),'[]'::jsonb) FROM public.opportunity_needs n JOIN public.demo_seed_registry r ON r.row_id=n.id AND r.table_name='opportunity_needs' AND r.seed_key='feve-2026-12'),
    'opportunity_matches', (SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.score DESC),'[]'::jsonb) FROM public.opportunity_matches m JOIN public.demo_seed_registry r ON r.row_id=m.id AND r.table_name='opportunity_matches' AND r.seed_key='feve-2026-12'),
    'capabilities', (SELECT coalesce(jsonb_agg(to_jsonb(c) - 'embedding' - 'embedded_hash' ORDER BY c.label),'[]'::jsonb) FROM public.capabilities c JOIN public.demo_seed_registry r ON r.row_id=c.id AND r.table_name='capabilities' AND r.seed_key='feve-2026-12'),
    'services', (SELECT coalesce(jsonb_agg(to_jsonb(s) - 'updated_at' ORDER BY s.title),'[]'::jsonb) FROM public.services s JOIN public.demo_seed_registry r ON r.row_id=s.id AND r.table_name='services' AND r.seed_key='feve-2026-12'),
    'feed_posts', (SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.created_at DESC),'[]'::jsonb) FROM public.feed_posts p JOIN public.demo_seed_registry r ON r.row_id=p.id AND r.table_name='feed_posts' AND r.seed_key='feve-2026-12'),
    'natural_systems', (SELECT coalesce(jsonb_agg(to_jsonb(n) ORDER BY n.name),'[]'::jsonb) FROM public.natural_systems n JOIN public.demo_seed_registry r ON r.row_id=n.id AND r.table_name='natural_systems' AND r.seed_key='feve-2026-12'),
    'natural_system_indicators', (SELECT coalesce(jsonb_agg(to_jsonb(n) ORDER BY n.computed_at DESC),'[]'::jsonb) FROM public.natural_system_indicators n JOIN public.demo_seed_registry r ON r.row_id=n.id AND r.table_name='natural_system_indicators' AND r.seed_key='feve-2026-12'),
    'quest_territories', (SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) FROM public.quest_territories x JOIN public.demo_seed_registry r ON r.row_id=x.id AND r.table_name='quest_territories' AND r.seed_key='feve-2026-12'),
    'company_territories', (SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) FROM public.company_territories x JOIN public.demo_seed_registry r ON r.row_id=x.id AND r.table_name='company_territories' AND r.seed_key='feve-2026-12'),
    'guild_territories', (SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) FROM public.guild_territories x JOIN public.demo_seed_registry r ON r.row_id=x.id AND r.table_name='guild_territories' AND r.seed_key='feve-2026-12'),
    'service_territories', (SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) FROM public.service_territories x JOIN public.demo_seed_registry r ON r.row_id=x.id AND r.table_name='service_territories' AND r.seed_key='feve-2026-12'),
    'guild_events', (SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.start_at),'[]'::jsonb) FROM public.guild_events e JOIN public.demo_seed_registry r ON r.row_id=e.id AND r.table_name='guild_events' AND r.seed_key='feve-2026-12')
  );
END $$;
REVOKE ALL ON FUNCTION public.demo_feve_snapshot() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.demo_feve_snapshot() TO authenticated, service_role;

CREATE FUNCTION public.get_opportunity_map(p_scope text DEFAULT 'me')
RETURNS TABLE (
  match_id uuid,
  direction text,
  quest_id uuid,
  quest_title text,
  quest_territory_name text,
  quest_latitude double precision,
  quest_longitude double precision,
  helper_type text,
  helper_id uuid,
  helper_name text,
  helper_territory_name text,
  helper_latitude double precision,
  helper_longitude double precision,
  need_label text,
  reason_fr text,
  reason_en text,
  score numeric
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH matched AS (
    SELECT * FROM public.get_opportunities(
      CASE WHEN p_scope IN ('me', 'guilds', 'all') THEN p_scope ELSE 'me' END,
      NULL,
      200
    )
  )
  SELECT
    o.match_id,
    o.direction,
    o.quest_id,
    o.quest_title,
    quest_place.name,
    quest_place.latitude,
    quest_place.longitude,
    o.helper_type,
    o.helper_id,
    o.helper_name,
    helper_place.name,
    helper_place.latitude,
    helper_place.longitude,
    o.need_label,
    o.reason_fr,
    o.reason_en,
    o.score
  FROM matched o
  LEFT JOIN LATERAL (
    SELECT t.name, t.latitude, t.longitude
    FROM public.quest_territories qt
    JOIN public.territories t ON t.id = qt.territory_id
    WHERE qt.quest_id = o.quest_id
      AND coalesce(qt.is_hidden, false) = false
      AND t.is_deleted = false
      AND t.latitude IS NOT NULL
      AND t.longitude IS NOT NULL
    ORDER BY qt.is_primary DESC NULLS LAST, t.name
    LIMIT 1
  ) quest_place ON true
  LEFT JOIN LATERAL (
    SELECT t.name, t.latitude, t.longitude
    FROM public.territories t
    LEFT JOIN public.service_territories st
      ON st.territory_id = t.id
      AND o.capability_service_url = '/services/' || st.service_id::text
    WHERE t.is_deleted = false
      AND t.latitude IS NOT NULL
      AND t.longitude IS NOT NULL
      AND (
        st.id IS NOT NULL
        OR (o.helper_type = 'profile' AND EXISTS (
          SELECT 1 FROM public.user_territories ut
          WHERE ut.territory_id = t.id AND ut.user_id = o.helper_id
        ))
        OR (o.helper_type = 'guild' AND EXISTS (
          SELECT 1 FROM public.guild_territories gt
          WHERE gt.territory_id = t.id AND gt.guild_id = o.helper_id
        ))
        OR (o.helper_type = 'company' AND EXISTS (
          SELECT 1 FROM public.company_territories ct
          WHERE ct.territory_id = t.id AND ct.company_id = o.helper_id
        ))
      )
    ORDER BY CASE WHEN st.id IS NOT NULL THEN 0 ELSE 1 END, t.name
    LIMIT 1
  ) helper_place ON true
  ORDER BY o.score DESC NULLS LAST;
$$;
REVOKE ALL ON FUNCTION public.get_opportunity_map(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_opportunity_map(text) TO authenticated, service_role;