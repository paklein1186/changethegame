CREATE TABLE public.demo_seed_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  row_id uuid NOT NULL,
  seed_key text NOT NULL DEFAULT 'feve-2026-12',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (seed_key, table_name, row_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.demo_seed_registry TO authenticated;
GRANT ALL ON public.demo_seed_registry TO service_role;
ALTER TABLE public.demo_seed_registry ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage demo seed registry"
ON public.demo_seed_registry FOR ALL TO authenticated
USING ((select public.has_role((select auth.uid()), 'admin')) OR (select public.has_role((select auth.uid()), 'superadmin')))
WITH CHECK ((select public.has_role((select auth.uid()), 'admin')) OR (select public.has_role((select auth.uid()), 'superadmin')));
CREATE INDEX demo_seed_registry_lookup_idx ON public.demo_seed_registry (seed_key, table_name, row_id);

INSERT INTO public.feature_flags (key, label, description, enabled, category)
VALUES ('demo_feve', 'Démo FEVE', 'Active la démo fictive pour les comptes démo et les utilisateurs marqués demo-feve.', false, 'MISC')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.is_demo_feve_viewer()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (select auth.uid()) IS NOT NULL AND (
    lower(coalesce((select auth.jwt()) ->> 'email', '')) LIKE 'demo+%@changethegame.xyz'
    OR (select public.has_role((select auth.uid()), 'admin'))
    OR (select public.has_role((select auth.uid()), 'superadmin'))
    OR EXISTS (
      SELECT 1 FROM public.feature_flags f
      JOIN public.profiles p ON p.user_id = (select auth.uid())
      WHERE f.key = 'demo_feve' AND f.enabled = true
        AND p.web_tags @> ARRAY['demo-feve']::text[]
    )
  );
$$;
REVOKE ALL ON FUNCTION public.is_demo_feve_viewer() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_demo_feve_viewer() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.demo_feve_row_visible(p_table_name text, p_row_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.demo_seed_registry r
    WHERE r.seed_key = 'feve-2026-12' AND r.table_name = p_table_name AND r.row_id = p_row_id
  ) OR public.is_demo_feve_viewer();
$$;
REVOKE ALL ON FUNCTION public.demo_feve_row_visible(text, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.demo_feve_row_visible(text, uuid) TO anon, authenticated, service_role;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['companies','guilds','quests','quest_needs','services','capabilities','opportunity_needs','opportunity_matches','territories','natural_systems','natural_system_links','natural_system_indicators','feed_posts','company_members','guild_members','quest_participants','quest_territories','company_territories','guild_territories','service_territories','user_territories','guild_events']
  LOOP
    EXECUTE format(
      'CREATE POLICY demo_feve_isolation ON public.%I AS RESTRICTIVE FOR SELECT TO public USING (public.demo_feve_row_visible(%L, id))',
      t, t
    );
  END LOOP;
  CREATE POLICY demo_feve_isolation ON public.profiles AS RESTRICTIVE FOR SELECT TO public
    USING (public.demo_feve_row_visible('profiles', user_id));
END $$;

-- Préserve les fonctions existantes sous un nom interne, puis ajoute uniquement le filtre démo.
DO $$
DECLARE
  cfg record;
  fn record;
  call_args text;
  original_name text;
BEGIN
  FOR cfg IN
    SELECT * FROM (VALUES
      ('get_opportunities', 'match_id', 'opportunity_matches'),
      ('match_capabilities', 'id', 'capabilities'),
      ('explore_needs', 'need_id', 'opportunity_needs')
    ) AS x(function_name, id_column, registry_table)
  LOOP
    SELECT p.*, n.nspname INTO fn FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = cfg.function_name LIMIT 1;
    original_name := cfg.function_name || '_before_demo_feve';
    EXECUTE format('ALTER FUNCTION public.%I(%s) RENAME TO %I', cfg.function_name, pg_get_function_identity_arguments(fn.oid), original_name);
    SELECT string_agg(fn.proargnames[u.ord], ', ' ORDER BY u.ord) INTO call_args
    FROM unnest(fn.proargtypes) WITH ORDINALITY AS u(type_oid, ord);
    EXECUTE format(
      'CREATE FUNCTION public.%I(%s) RETURNS %s LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $wrapper$ SELECT * FROM public.%I(%s) AS source WHERE public.demo_feve_row_visible(%L, source.%I) $wrapper$',
      cfg.function_name, pg_get_function_arguments(fn.oid), pg_get_function_result(fn.oid), original_name, call_args, cfg.registry_table, cfg.id_column
    );
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.get_opportunities(text, uuid, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_opportunities(text, uuid, integer) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.match_capabilities(vector, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.match_capabilities(vector, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.explore_needs(text, uuid, text, text, integer, integer) TO anon, authenticated, service_role;

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
