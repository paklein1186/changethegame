CREATE TABLE public.digest_read_items (
  user_id uuid NOT NULL,
  item_key text NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, item_key)
);
GRANT SELECT, INSERT, DELETE ON public.digest_read_items TO authenticated;
GRANT ALL ON public.digest_read_items TO service_role;
ALTER TABLE public.digest_read_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own read items select" ON public.digest_read_items FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);
CREATE POLICY "Own read items insert" ON public.digest_read_items FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Own read items delete" ON public.digest_read_items FOR DELETE TO authenticated USING ((select auth.uid()) = user_id);