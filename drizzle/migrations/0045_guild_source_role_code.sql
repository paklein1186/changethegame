UPDATE public.entity_roles er SET code = 'source'
WHERE er.entity_type = 'guild' AND er.is_default AND er.name = 'Source' AND er.code IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.entity_roles o WHERE o.entity_type = 'guild' AND o.entity_id = er.entity_id AND o.code = 'source');

CREATE OR REPLACE FUNCTION public.ensure_guild_default_roles(_guild_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_creator uuid; v_source uuid; v_fondateur uuid;
BEGIN
  SELECT created_by_user_id INTO v_creator FROM guilds WHERE id = _guild_id;
  IF NOT FOUND THEN RETURN; END IF;

  INSERT INTO entity_roles (entity_type, entity_id, code, name, color, level, sort_order)
  SELECT 'guild', _guild_id, d.code, d.name, d.color, d.level, d.sort
  FROM (VALUES
    ('fondateur', 'Fondateur', '#f59e0b', NULL::smallint, 1),
    ('observateur', 'Observateur', '#94a3b8', 1::smallint, 10),
    ('adherent', 'Adhérent', '#22c55e', 2::smallint, 11),
    ('actif', 'Actif', '#3b82f6', 3::smallint, 12),
    ('effectif', 'Effectif', '#8b5cf6', 3::smallint, 13),
    ('partenaire', 'Partenaire', '#ec4899', 3::smallint, 14)
  ) AS d(code, name, color, level, sort)
  WHERE NOT EXISTS (SELECT 1 FROM entity_roles er WHERE er.entity_type = 'guild' AND er.entity_id = _guild_id AND er.code = d.code);

  UPDATE entity_roles er SET level = d.level
  FROM (VALUES ('observateur', 1::smallint), ('adherent', 2::smallint), ('actif', 3::smallint), ('effectif', 3::smallint), ('partenaire', 3::smallint)) AS d(code, level)
  WHERE er.entity_type = 'guild' AND er.entity_id = _guild_id AND er.code = d.code AND er.level IS NULL;

  SELECT id INTO v_source FROM entity_roles WHERE entity_type = 'guild' AND entity_id = _guild_id AND is_default AND name = 'Source' LIMIT 1;
  IF v_source IS NULL THEN
    INSERT INTO entity_roles (entity_type, entity_id, code, name, color, is_default, sort_order)
    VALUES ('guild', _guild_id, 'source', 'Source', '#6366f1', true, 0)
    ON CONFLICT DO NOTHING RETURNING id INTO v_source;
  ELSE
    UPDATE entity_roles SET code = 'source' WHERE id = v_source AND code IS NULL
      AND NOT EXISTS (SELECT 1 FROM entity_roles o WHERE o.entity_type = 'guild' AND o.entity_id = _guild_id AND o.code = 'source');
  END IF;

  IF v_creator IS NOT NULL THEN
    SELECT id INTO v_fondateur FROM entity_roles WHERE entity_type = 'guild' AND entity_id = _guild_id AND code = 'fondateur';
    IF v_fondateur IS NOT NULL THEN
      INSERT INTO entity_member_roles (entity_role_id, user_id) VALUES (v_fondateur, v_creator) ON CONFLICT DO NOTHING;
    END IF;
    IF v_source IS NOT NULL AND NOT EXISTS (SELECT 1 FROM entity_member_roles WHERE entity_role_id = v_source) THEN
      INSERT INTO entity_member_roles (entity_role_id, user_id) VALUES (v_source, v_creator) ON CONFLICT DO NOTHING;
    END IF;
  END IF;
END;
$function$;