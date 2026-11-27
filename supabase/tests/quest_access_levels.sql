-- Test du contrat de visibilité des quêtes (troistiers-site, docs/quetes/visibilite.md, point 5.3).
--
-- Quatre personnes lisent la MÊME quête « réservée aux membres à partir de N2 » directement dans la base,
-- sous leur propre identité (rôle authenticated + jeton simulé), pas par l'écran :
--   hors guilde → rien ; suiveur (galaxie, sans cotisation) → rien ;
--   cotisant (adhésion active) → la fiche, sans le contenu ; membre de l'équipe → la fiche et le contenu.
-- Plus : un visiteur anonyme ne voit rien, et la base annonce bien qu'elle applique la règle.
--
-- Tout se passe dans une transaction annulée à la fin : rien n'est écrit. À lancer sur une base locale ou de
-- préproduction à jour des migrations :
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/quest_access_levels.sql
-- Le script s'arrête sur une erreur « ÉCHEC … » si une personne voit plus (ou moins) que son niveau.

BEGIN;

-- Jeu d'essai (identifiants fixes, propres au test).
INSERT INTO auth.users (id, email, aud, role) VALUES
  ('a0000000-0000-4000-8000-000000000001', 'test-admin@quest-access.test', 'authenticated', 'authenticated'),
  ('a0000000-0000-4000-8000-000000000002', 'test-hors@quest-access.test', 'authenticated', 'authenticated'),
  ('a0000000-0000-4000-8000-000000000003', 'test-suiveur@quest-access.test', 'authenticated', 'authenticated'),
  ('a0000000-0000-4000-8000-000000000004', 'test-cotisant@quest-access.test', 'authenticated', 'authenticated'),
  ('a0000000-0000-4000-8000-000000000005', 'test-equipe@quest-access.test', 'authenticated', 'authenticated');
INSERT INTO public.profiles (user_id, name)
SELECT u.id, split_part(u.email, '@', 1) FROM auth.users u WHERE u.email LIKE '%@quest-access.test'
ON CONFLICT DO NOTHING;

INSERT INTO public.guilds (id, name, created_by_user_id, enable_membership)
VALUES ('a0000000-0000-4000-8000-0000000000a1', 'Guilde de test (accès aux quêtes)', 'a0000000-0000-4000-8000-000000000001', true);

-- Suiveur : suit la guilde et l'a rejointe sans cotiser (galaxie, N1).
INSERT INTO public.follows (follower_id, target_type, target_id)
VALUES ('a0000000-0000-4000-8000-000000000003', 'GUILD', 'a0000000-0000-4000-8000-0000000000a1');
INSERT INTO public.guild_members (guild_id, user_id, role)
VALUES ('a0000000-0000-4000-8000-0000000000a1', 'a0000000-0000-4000-8000-000000000003', 'MEMBER');
-- Cotisant : adhésion active (N2).
INSERT INTO public.user_guild_memberships (guild_id, user_id, role, status, plan_code, current_period_end)
VALUES ('a0000000-0000-4000-8000-0000000000a1', 'a0000000-0000-4000-8000-000000000004', 'member', 'active', 'citoyen', now() + interval '30 days');

INSERT INTO public.quests (id, title, created_by_user_id, guild_id, owner_type, owner_id, is_draft, access_mode, access_min_level)
VALUES ('a0000000-0000-4000-8000-0000000000b1', 'Quête de test réservée N2', 'a0000000-0000-4000-8000-000000000001',
        'a0000000-0000-4000-8000-0000000000a1', 'GUILD', 'a0000000-0000-4000-8000-0000000000a1', false, 'members', 'N2');
INSERT INTO public.quest_needs (quest_id, title, created_by_user_id)
VALUES ('a0000000-0000-4000-8000-0000000000b1', 'Besoin de test', 'a0000000-0000-4000-8000-000000000001');
-- Membre de l'équipe : participant de la quête (N4).
INSERT INTO public.quest_participants (quest_id, user_id, role, status)
VALUES ('a0000000-0000-4000-8000-0000000000b1', 'a0000000-0000-4000-8000-000000000005', 'MEMBER', 'ACCEPTED');

CREATE TEMP TABLE quest_access_result (person text, sees_card int, sees_content int);
GRANT INSERT, SELECT ON quest_access_result TO anon, authenticated;

-- Lecture sous l'identité de chacun.
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true), set_config('request.jwt.claim.sub', '', true);
INSERT INTO quest_access_result SELECT 'anonyme',
  (SELECT count(*) FROM public.quests WHERE id = 'a0000000-0000-4000-8000-0000000000b1'),
  (SELECT count(*) FROM public.quest_needs WHERE quest_id = 'a0000000-0000-4000-8000-0000000000b1');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated"}', true),
       set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000002', true);
INSERT INTO quest_access_result SELECT 'hors guilde',
  (SELECT count(*) FROM public.quests WHERE id = 'a0000000-0000-4000-8000-0000000000b1'),
  (SELECT count(*) FROM public.quest_needs WHERE quest_id = 'a0000000-0000-4000-8000-0000000000b1');

SELECT set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000003","role":"authenticated"}', true),
       set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000003', true);
INSERT INTO quest_access_result SELECT 'suiveur',
  (SELECT count(*) FROM public.quests WHERE id = 'a0000000-0000-4000-8000-0000000000b1'),
  (SELECT count(*) FROM public.quest_needs WHERE quest_id = 'a0000000-0000-4000-8000-0000000000b1');

SELECT set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000004","role":"authenticated"}', true),
       set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000004', true);
INSERT INTO quest_access_result SELECT 'cotisant',
  (SELECT count(*) FROM public.quests WHERE id = 'a0000000-0000-4000-8000-0000000000b1'),
  (SELECT count(*) FROM public.quest_needs WHERE quest_id = 'a0000000-0000-4000-8000-0000000000b1');

SELECT set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000005","role":"authenticated"}', true),
       set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000005', true);
INSERT INTO quest_access_result SELECT 'équipe',
  (SELECT count(*) FROM public.quests WHERE id = 'a0000000-0000-4000-8000-0000000000b1'),
  (SELECT count(*) FROM public.quest_needs WHERE quest_id = 'a0000000-0000-4000-8000-0000000000b1');
RESET ROLE;

-- Vérification.
DO $$
DECLARE r record; expected jsonb := '{"anonyme":[0,0],"hors guilde":[0,0],"suiveur":[0,0],"cotisant":[1,0],"équipe":[1,1]}';
BEGIN
  IF NOT public.quest_access_enforced() THEN
    RAISE EXCEPTION 'ÉCHEC : la base n''annonce pas appliquer l''accès aux quêtes (quest_access_enforced)';
  END IF;
  FOR r IN SELECT * FROM quest_access_result LOOP
    RAISE NOTICE '% : fiche %, contenu %', r.person, r.sees_card, r.sees_content;
    IF jsonb_build_array(r.sees_card, r.sees_content) <> expected->r.person THEN
      RAISE EXCEPTION 'ÉCHEC : % voit fiche=% contenu=% (attendu %)', r.person, r.sees_card, r.sees_content, expected->r.person;
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM quest_access_result) <> 5 THEN RAISE EXCEPTION 'ÉCHEC : lectures manquantes'; END IF;
  RAISE NOTICE 'OK : chacun ne voit que son niveau.';
END $$;

ROLLBACK;
