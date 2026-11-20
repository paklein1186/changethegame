-- Socle minimal (rôles, auth, guilds) pour tester les migrations de packs hors Supabase.
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
CREATE TABLE public.guilds (id uuid PRIMARY KEY);
CREATE FUNCTION public.is_guild_admin(g uuid, u uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
