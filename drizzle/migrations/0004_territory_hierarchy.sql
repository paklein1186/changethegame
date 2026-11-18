CREATE OR REPLACE FUNCTION public.territories_rebuild_closure_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.rebuild_territory_closure();
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_territories_rebuild_closure ON public.territories;
CREATE TRIGGER trg_territories_rebuild_closure
  AFTER INSERT OR DELETE OR UPDATE OF parent_id, is_deleted ON public.territories
  FOR EACH STATEMENT EXECUTE FUNCTION public.territories_rebuild_closure_trigger();

REVOKE ALL ON FUNCTION public.rebuild_territory_closure() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.territories_rebuild_closure_trigger() FROM PUBLIC, anon, authenticated;

INSERT INTO public.territories (name, level, slug, parent_id)
SELECT 'Provence-Alpes-Côte d''Azur', 'REGION', 'provence-alpes-cote-d-azur', f.id
FROM public.territories f
WHERE f.name = 'France' AND f.level = 'NATIONAL' AND f.is_deleted = false
  AND NOT EXISTS (SELECT 1 FROM public.territories WHERE name = 'Provence-Alpes-Côte d''Azur' AND level = 'REGION' AND is_deleted = false)
LIMIT 1;

WITH moves(town_id, region_name) AS (VALUES
  ('1fcb1e1f-76ad-4c17-a730-4369aacf549e', 'Provence-Alpes-Côte d''Azur'),
  ('862edde4-fa35-4e3a-b57e-eb96da3588dd', 'Wallonia'),
  ('29632102-6923-4abb-a01a-f2b736e49fdd', 'Hauts-de-France'),
  ('3a23b56a-a996-42d6-9dcd-cd7b8c3b0215', 'Nouvelle-Aquitaine'),
  ('4ebbdee5-8081-4102-9dea-50ee364bb756', 'Wallonia'),
  ('4e5a977a-744e-4660-bd81-243024cce6a0', 'Wallonia'),
  ('be2a2c81-099d-41db-90e1-6731298c516a', 'Burgundy'),
  ('964ffc29-39c2-4a5a-b046-62fd77c445a7', 'Wallonia'),
  ('ca910d3e-a29e-40d8-9589-83804d68ad61', 'Île-de-France'),
  ('9b84125a-7796-4407-8540-d75cb95ecd91', 'Brussels'),
  ('9005ddd3-496f-40ce-9dac-4ec98e1513a0', 'Wallonia'),
  ('518a414f-ef79-4517-89b3-c0c1e291f866', 'Wallonia'),
  ('e87fead4-bcf3-4f48-840e-5e48ba5f1367', 'Bretagne'),
  ('131877a7-178c-4a21-92ee-c737f5a91c91', 'Wallonia'),
  ('ff05d9a4-c42d-4944-bdeb-8b0fd4825452', 'Wallonia'),
  ('3ddd6d2c-33fc-4196-a3e8-89a78516fb0d', 'Wallonia'),
  ('ff6f909f-6dc1-4873-87a1-47da9408ce5b', 'Auvergne-Rhône-Alpes'),
  ('ce9d516e-0070-44f4-bccc-bb843bfcc27a', 'Wallonia'),
  ('6d6f37cd-e491-4ee4-8b20-1311180c06a0', 'Bretagne'),
  ('3f51886a-4b78-42e9-95a1-99801eb1b479', 'Guadeloupe'),
  ('347eb4fa-caa4-4294-8095-881f7caeb864', 'Wallonia'),
  ('6241d794-d0d9-48ae-8b13-ce300188c4c2', 'Wallonia'),
  ('46b108b7-bbcb-47b4-bf7b-94d8d06eb973', 'Wallonia'),
  ('d9878305-aff3-44af-849b-28709a21a33d', 'Bretagne'),
  ('47ce4259-8634-424b-b0b4-f37662e66f71', 'Wallonia'),
  ('de60f3fd-567d-4e13-b9fa-5dfbf9c021b7', 'Nouvelle-Aquitaine'),
  ('8fc30d23-5e7a-41f1-b729-4635702de225', 'Wallonia'),
  ('b60aee6f-8f7d-4866-a5b6-5d41254565a6', 'Wallonia'),
  ('65ad0c2d-4804-4933-a608-664fd796cb71', 'Wallonia'),
  ('287c2c69-aea0-43cc-a238-6dcdc5b2af1a', 'Wallonia'),
  ('f9eac7db-401b-44a2-9f76-dc253c059979', 'Wallonia'),
  ('c70daefd-46e2-4d48-a799-16afb7be303d', 'Wallonia'),
  ('2a44b797-223a-4acc-aafb-1d5361b53c70', 'Wallonia'),
  ('7b41df58-7820-422b-86ce-980ec69034f9', 'Wallonia'),
  ('1e522711-4cc3-4439-99a6-34b36206e620', 'Wallonia'),
  ('1e2b172f-22c3-4f91-a897-3fb3befaee2b', 'Wallonia'),
  ('76110e24-1303-463f-b47f-8201d27983f9', 'Wallonia'),
  ('48c3895d-9f22-4050-918f-3db14ecb6150', 'Wallonia'),
  ('b9819681-c15a-4bc9-a273-f4dacdddec63', 'Wallonia'),
  ('55fe5eef-8c61-4455-9d7c-1dd906d891ba', 'Wallonia'),
  ('34f0f8c2-439f-41cd-93db-aecbfa95d0b7', 'Wallonia'),
  ('74641916-95ff-4d78-b02a-64e79b15567b', 'Wallonia'),
  ('909b0507-b50e-4d50-a810-06541a9a77a8', 'Occitanie'),
  ('c2026ff6-6a3f-4d24-aeb6-62cf308f2f65', 'Wallonia'),
  ('3d47e6ca-2c22-45f7-bfcf-8ef1629ad3a4', 'Wallonia'),
  ('07e071fa-0179-4d60-a818-5026ad764ff0', 'Wallonia'),
  ('1e75b430-b18b-48f4-8e47-22d5f42a830b', 'Wallonia'),
  ('ad18ae1d-2e55-4ea5-83eb-1c9d3b9d05ab', 'Wallonia')
)
UPDATE public.territories t
SET parent_id = r.id
FROM moves m
JOIN public.territories r ON r.name = m.region_name AND r.level = 'REGION' AND r.is_deleted = false
WHERE t.id = m.town_id::uuid
  AND t.parent_id IN (SELECT id FROM public.territories WHERE level = 'NATIONAL');

SELECT public.rebuild_territory_closure();