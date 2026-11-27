CREATE TABLE public.user_guild_favorites (
  user_id uuid NOT NULL,
  guild_id uuid NOT NULL REFERENCES public.guilds(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, guild_id)
);
CREATE INDEX user_guild_favorites_guild_id_idx ON public.user_guild_favorites (guild_id);
GRANT SELECT, INSERT, DELETE ON public.user_guild_favorites TO authenticated;
GRANT ALL ON public.user_guild_favorites TO service_role;
ALTER TABLE public.user_guild_favorites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own guild favorites" ON public.user_guild_favorites FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);
CREATE POLICY "Users add own guild favorites" ON public.user_guild_favorites FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Users remove own guild favorites" ON public.user_guild_favorites FOR DELETE TO authenticated USING ((select auth.uid()) = user_id);

CREATE OR REPLACE FUNCTION public.limit_user_guild_favorites()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF (SELECT count(*) FROM public.user_guild_favorites WHERE user_id = NEW.user_id) >= 3 THEN
    RAISE EXCEPTION 'favorite_limit_reached' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER user_guild_favorites_limit BEFORE INSERT ON public.user_guild_favorites
FOR EACH ROW EXECUTE FUNCTION public.limit_user_guild_favorites();