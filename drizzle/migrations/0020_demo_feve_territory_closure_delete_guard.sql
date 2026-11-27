CREATE OR REPLACE FUNCTION public.rebuild_territory_closure()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  DELETE FROM public.territory_closure WHERE true;
  INSERT INTO public.territory_closure (ancestor_id, descendant_id, depth)
  SELECT id, id, 0 FROM public.territories WHERE is_deleted = false;
  LOOP
    INSERT INTO public.territory_closure (ancestor_id, descendant_id, depth)
    SELECT tc.ancestor_id, t.id, tc.depth + 1
    FROM public.territory_closure tc
    JOIN public.territories t ON t.parent_id = tc.descendant_id AND t.is_deleted = false
    WHERE NOT EXISTS (
      SELECT 1 FROM public.territory_closure existing
      WHERE existing.ancestor_id = tc.ancestor_id AND existing.descendant_id = t.id
    );
    EXIT WHEN NOT FOUND;
  END LOOP;
END;
$function$;