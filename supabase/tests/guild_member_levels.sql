-- Test des niveaux cumulables (catégories : rôles, formules ; le plus haut l'emporte).
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/guild_member_levels.sql
-- Transaction annulée à la fin : rien n'est écrit. S'arrête sur « ÉCHEC … ».
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub":"b0000000-0000-4000-8000-000000000001"}', true);
INSERT INTO auth.users (id, email, aud, role) VALUES
  ('b0000000-0000-4000-8000-000000000001', 'lvl-admin@levels.test', 'authenticated', 'authenticated'),
  ('b0000000-0000-4000-8000-000000000002', 'lvl-cumul@levels.test', 'authenticated', 'authenticated'),
  ('b0000000-0000-4000-8000-000000000003', 'lvl-actif@levels.test', 'authenticated', 'authenticated'),
  ('b0000000-0000-4000-8000-000000000004', 'lvl-effectif@levels.test', 'authenticated', 'authenticated');
INSERT INTO public.profiles (user_id, name)
SELECT u.id, split_part(u.email, '@', 1) FROM auth.users u WHERE u.email LIKE '%@levels.test' ON CONFLICT DO NOTHING;
INSERT INTO public.guilds (id, name, created_by_user_id, enable_membership)
VALUES ('b0000000-0000-4000-8000-0000000000a1', 'Guilde de test (niveaux)', 'b0000000-0000-4000-8000-000000000001', true);
INSERT INTO public.guild_membership_plans (guild_id, code, label, level, badge_codes) VALUES
  ('b0000000-0000-4000-8000-0000000000a1', 'citoyen', 'Citoyen', 2, ARRAY['citoyen_soutenant']),
  ('b0000000-0000-4000-8000-0000000000a1', 'accompagnant_freelance', 'Accompagnant', 3, ARRAY['accompagnant']);
INSERT INTO public.quests (id, title, created_by_user_id, guild_id, owner_type, owner_id, is_draft, access_mode, access_min_level)
VALUES ('b0000000-0000-4000-8000-0000000000b1', 'Quête N3', 'b0000000-0000-4000-8000-000000000001',
        'b0000000-0000-4000-8000-0000000000a1', 'GUILD', 'b0000000-0000-4000-8000-0000000000a1', false, 'members', 'N3');
INSERT INTO public.user_guild_plans (user_id, guild_id, plan_code, status, current_period_end) VALUES
  ('b0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-0000000000a1', 'citoyen', 'active', now() + interval '200 days'),
  ('b0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-0000000000a1', 'accompagnant_freelance', 'active', now() + interval '20 days');
INSERT INTO public.entity_member_roles (entity_role_id, user_id, expires_at)
SELECT id, 'b0000000-0000-4000-8000-000000000003', now() - interval '1 day' FROM public.entity_roles
WHERE entity_type = 'guild' AND entity_id = 'b0000000-0000-4000-8000-0000000000a1' AND code = 'actif';

DO $$
DECLARE g uuid := 'b0000000-0000-4000-8000-0000000000a1'; q uuid := 'b0000000-0000-4000-8000-0000000000b1';
  u uuid := 'b0000000-0000-4000-8000-000000000002';
BEGIN
  IF public.guild_member_level(g, u) <> 3 OR public.quest_access_level(q, u) <> 'teaser' THEN
    RAISE EXCEPTION 'ÉCHEC : citoyen + accompagnant devrait voir la fiche N3';
  END IF;
  IF (SELECT plan_code FROM user_guild_memberships WHERE guild_id = g AND user_id = u) <> 'accompagnant_freelance' THEN
    RAISE EXCEPTION 'ÉCHEC : l''adhésion globale devrait porter la formule la plus haute';
  END IF;
  UPDATE user_guild_plans SET current_period_end = now() - interval '1 day' WHERE user_id = u AND plan_code = 'accompagnant_freelance';
  IF public.guild_member_level(g, u) <> 2 OR public.quest_access_level(q, u) <> 'none' THEN
    RAISE EXCEPTION 'ÉCHEC : formule accompagnant expirée, la personne devrait redescendre en N2';
  END IF;
  IF (SELECT role || '/' || plan_code FROM user_guild_memberships WHERE guild_id = g AND user_id = u) <> 'member/citoyen' THEN
    RAISE EXCEPTION 'ÉCHEC : l''adhésion globale devrait rester membre avec la formule citoyen';
  END IF;
  IF public.guild_member_level(g, 'b0000000-0000-4000-8000-000000000003') <> 0 THEN
    RAISE EXCEPTION 'ÉCHEC : un rôle actif expiré ne doit plus compter';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM entity_member_roles m JOIN entity_roles er ON er.id = m.entity_role_id
      WHERE er.entity_id = g AND m.user_id = 'b0000000-0000-4000-8000-000000000001' AND er.code = 'source')
     OR public.guild_member_level(g, 'b0000000-0000-4000-8000-000000000001') <> 5 THEN
    RAISE EXCEPTION 'ÉCHEC : le créateur devrait détenir Source et être au niveau 5';
  END IF;
  IF (SELECT count(*) FROM entity_roles WHERE entity_id = g AND code IN ('observateur','citoyen_soutenant','membre_sympathisant',
      'membre_lieu','accompagnant','allie','partenaire_territorial','actif','effectif')) <> 9
     OR EXISTS (SELECT 1 FROM entity_roles WHERE entity_id = g AND code IN ('adherent','partenaire','fondateur')) THEN
    RAISE EXCEPTION 'ÉCHEC : la guilde devrait avoir exactement le catalogue';
  END IF;
  RAISE NOTICE 'OK : niveaux cumulables conformes.';
END $$;

-- Cotisation requise : attribution manuelle par un compte connecté.
SELECT set_config('request.jwt.claims', '{"sub":"b0000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
DO $$
DECLARE g uuid := 'b0000000-0000-4000-8000-0000000000a1'; u uuid := 'b0000000-0000-4000-8000-000000000004';
  eff uuid; refused boolean := false;
BEGIN
  SELECT id INTO eff FROM entity_roles WHERE entity_id = g AND code = 'effectif';
  BEGIN
    INSERT INTO entity_member_roles (entity_role_id, user_id) VALUES (eff, u);
  EXCEPTION WHEN check_violation THEN refused := true;
  END;
  IF NOT refused THEN RAISE EXCEPTION 'ÉCHEC : effectif sans cotisation devrait être refusé'; END IF;
  INSERT INTO user_guild_plans (user_id, guild_id, plan_code, status, current_period_end)
  VALUES (u, g, 'citoyen', 'active', now() + interval '30 days');
  INSERT INTO entity_member_roles (entity_role_id, user_id) VALUES (eff, u);
  IF public.guild_member_level(g, u) <> 3 THEN RAISE EXCEPTION 'ÉCHEC : effectif en règle devrait donner 3'; END IF;
  UPDATE user_guild_plans SET current_period_end = now() - interval '1 day' WHERE user_id = u AND guild_id = g;
  IF public.guild_member_level(g, u) >= 3 THEN RAISE EXCEPTION 'ÉCHEC : effectif sans cotisation ne doit plus compter'; END IF;
  refused := false;
  BEGIN
    INSERT INTO entity_member_roles (entity_role_id, user_id)
    SELECT id, u FROM entity_roles WHERE entity_id = g AND code = 'observateur';
    UPDATE user_guild_plans SET current_period_end = now() + interval '30 days' WHERE user_id = u AND guild_id = g;
    INSERT INTO entity_member_roles (entity_role_id, user_id)
    SELECT id, u FROM entity_roles WHERE entity_id = g AND code = 'actif';
  EXCEPTION WHEN check_violation THEN refused := true;
  END;
  IF NOT refused THEN RAISE EXCEPTION 'ÉCHEC : actif sans date de fin devrait être refusé'; END IF;
  RAISE NOTICE 'OK : niveaux cumulables conformes.';
END $$;
ROLLBACK;
