-- Test de 20261123110000_decision_polls_access.sql. Usage (Postgres 16 vide) :
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/discussion_rooms_access_stubs.sql \
--     -f supabase/migrations/20261123100000_discussion_rooms_access.sql -f supabase/tests/decision_polls_access_stubs.sql \
--     -f supabase/migrations/20261123110000_decision_polls_access.sql -f supabase/tests/decision_polls_access.sql
-- Personnes : 0a admin de guilde, 0b membre « Équipe », 0c membre simple, 0e inconnu.
\set QUIET 1
\pset format unaligned
\pset tuples_only on
INSERT INTO guilds (id, governance_model) VALUES ('11111111-1111-1111-1111-111111111111', 'pure_pct');
INSERT INTO guild_members VALUES
 ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-00000000000a','ADMIN'),
 ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-00000000000b','MEMBER'),
 ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-00000000000c','MEMBER');
INSERT INTO entity_roles (id, entity_type, entity_id, name) VALUES ('22222222-2222-2222-2222-222222222222','guild','11111111-1111-1111-1111-111111111111','Équipe');
INSERT INTO entity_member_roles VALUES ('22222222-2222-2222-2222-222222222222','00000000-0000-0000-0000-00000000000b',NULL);
INSERT INTO quests (id, guild_id) VALUES ('55555555-5555-5555-5555-000000000001','11111111-1111-1111-1111-111111111111');
-- 0b a fait 25 % des contributions vérifiées de la guilde.
INSERT INTO contribution_logs VALUES ('00000000-0000-0000-0000-00000000000b','55555555-5555-5555-5555-000000000001',25,'verified'),
 ('00000000-0000-0000-0000-00000000000a','55555555-5555-5555-5555-000000000001',75,'verified'),
 ('00000000-0000-0000-0000-00000000000c','55555555-5555-5555-5555-000000000001',999,'pending');
INSERT INTO decision_polls (id, entity_type, entity_id, question, created_by, status, closes_at, allow_vote_change,
  visibility_audience_type, allowed_visibility_role_ids, can_vote_audience_type, allowed_vote_role_ids) VALUES
 ('66666666-6666-6666-6666-000000000001','GUILD','11111111-1111-1111-1111-111111111111','ouverte','00000000-0000-0000-0000-00000000000a','OPEN',NULL,true,'MEMBERS','{}','MEMBERS','{}'),
 ('66666666-6666-6666-6666-000000000002','GUILD','11111111-1111-1111-1111-111111111111','equipe','00000000-0000-0000-0000-00000000000a','OPEN',NULL,true,'SELECTED_ROLES','{22222222-2222-2222-2222-222222222222}','SELECTED_ROLES','{22222222-2222-2222-2222-222222222222}'),
 ('66666666-6666-6666-6666-000000000003','GUILD','11111111-1111-1111-1111-111111111111','brouillon','00000000-0000-0000-0000-00000000000a','DRAFT',NULL,true,'MEMBERS','{}','MEMBERS','{}'),
 ('66666666-6666-6666-6666-000000000004','GUILD','11111111-1111-1111-1111-111111111111','close','00000000-0000-0000-0000-00000000000a','OPEN',now() - interval '1 hour',true,'MEMBERS','{}','MEMBERS','{}'),
 ('66666666-6666-6666-6666-000000000005','GUILD','11111111-1111-1111-1111-111111111111','definitif','00000000-0000-0000-0000-00000000000a','OPEN',NULL,false,'MEMBERS','{}','MEMBERS','{}'),
 ('66666666-6666-6666-6666-000000000006','GUILD','11111111-1111-1111-1111-111111111111','publique','00000000-0000-0000-0000-00000000000a','OPEN',NULL,true,'PUBLIC','{}','MEMBERS','{}');

CREATE FUNCTION pg_temp.vu(p_role text, p_uid text, p_sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE r text;
BEGIN
  EXECUTE format('SET LOCAL ROLE %I', p_role);
  PERFORM set_config('test.uid', COALESCE(p_uid, ''), true);
  EXECUTE p_sql INTO r;
  RESET ROLE;
  RETURN COALESCE(r, '');
END $$;
CREATE FUNCTION pg_temp.essai(p_uid text, p_sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE n int;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('test.uid', p_uid, true);
  EXECUTE p_sql;
  GET DIAGNOSTICS n = ROW_COUNT;
  RESET ROLE;
  RETURN CASE WHEN n > 0 THEN 'accepté' ELSE 'sans effet' END;
EXCEPTION WHEN insufficient_privilege OR check_violation THEN
  RESET ROLE;
  RETURN 'refusé';
END $$;

SELECT CASE WHEN got = attendu THEN 'OK ' ELSE 'KO ' END || qui || ' voit : ' || got || CASE WHEN got = attendu THEN '' ELSE '  (attendu ' || attendu || ')' END
FROM (VALUES
 ('sans compte', 'anon', NULL, 'publique'),
 ('inconnu connecté', 'authenticated', '00000000-0000-0000-0000-00000000000e', 'publique'),
 ('membre simple', 'authenticated', '00000000-0000-0000-0000-00000000000c', 'close,definitif,ouverte,publique'),
 ('membre Équipe', 'authenticated', '00000000-0000-0000-0000-00000000000b', 'close,definitif,equipe,ouverte,publique'),
 ('admin', 'authenticated', '00000000-0000-0000-0000-00000000000a', 'brouillon,close,definitif,equipe,ouverte,publique')
) v(qui, role, uid, attendu), LATERAL (SELECT pg_temp.vu(role, uid, 'SELECT string_agg(question, '','' ORDER BY question) FROM decision_polls') got) g;

SELECT CASE WHEN r = attendu THEN 'OK ' ELSE 'KO ' END || quoi || ' : ' || r || CASE WHEN r = attendu THEN '' ELSE '  (attendu ' || attendu || ')' END FROM (VALUES
 ('inconnu vote sur « ouverte »', pg_temp.essai('00000000-0000-0000-0000-00000000000e',
   $q$INSERT INTO decision_poll_votes (poll_id, user_id, option_index) VALUES ('66666666-6666-6666-6666-000000000001','00000000-0000-0000-0000-00000000000e',0)$q$), 'refusé'),
 ('inconnu vote sur « publique » (vote : membres)', pg_temp.essai('00000000-0000-0000-0000-00000000000e',
   $q$INSERT INTO decision_poll_votes (poll_id, user_id, option_index) VALUES ('66666666-6666-6666-6666-000000000006','00000000-0000-0000-0000-00000000000e',0)$q$), 'refusé'),
 ('membre simple vote sur « ouverte »', pg_temp.essai('00000000-0000-0000-0000-00000000000c',
   $q$INSERT INTO decision_poll_votes (poll_id, user_id, option_index) VALUES ('66666666-6666-6666-6666-000000000001','00000000-0000-0000-0000-00000000000c',0)$q$), 'accepté'),
 ('membre simple vote sur « equipe »', pg_temp.essai('00000000-0000-0000-0000-00000000000c',
   $q$INSERT INTO decision_poll_votes (poll_id, user_id, option_index) VALUES ('66666666-6666-6666-6666-000000000002','00000000-0000-0000-0000-00000000000c',0)$q$), 'refusé'),
 ('membre Équipe vote sur « equipe »', pg_temp.essai('00000000-0000-0000-0000-00000000000b',
   $q$INSERT INTO decision_poll_votes (poll_id, user_id, option_index) VALUES ('66666666-6666-6666-6666-000000000002','00000000-0000-0000-0000-00000000000b',1)$q$), 'accepté'),
 ('membre simple vote sur « close »', pg_temp.essai('00000000-0000-0000-0000-00000000000c',
   $q$INSERT INTO decision_poll_votes (poll_id, user_id, option_index) VALUES ('66666666-6666-6666-6666-000000000004','00000000-0000-0000-0000-00000000000c',0)$q$), 'refusé'),
 ('admin vote sur son brouillon', pg_temp.essai('00000000-0000-0000-0000-00000000000a',
   $q$INSERT INTO decision_poll_votes (poll_id, user_id, option_index) VALUES ('66666666-6666-6666-6666-000000000003','00000000-0000-0000-0000-00000000000a',0)$q$), 'refusé'),
 ('membre simple vote sur « definitif »', pg_temp.essai('00000000-0000-0000-0000-00000000000c',
   $q$INSERT INTO decision_poll_votes (poll_id, user_id, option_index) VALUES ('66666666-6666-6666-6666-000000000005','00000000-0000-0000-0000-00000000000c',0)$q$), 'accepté'),
 ('… puis change son vote sur « definitif »', pg_temp.essai('00000000-0000-0000-0000-00000000000c',
   $q$UPDATE decision_poll_votes SET option_index = 1 WHERE poll_id = '66666666-6666-6666-6666-000000000005' AND user_id = '00000000-0000-0000-0000-00000000000c'$q$), 'refusé'),
 ('… ou le retire', pg_temp.essai('00000000-0000-0000-0000-00000000000c',
   $q$DELETE FROM decision_poll_votes WHERE poll_id = '66666666-6666-6666-6666-000000000005' AND user_id = '00000000-0000-0000-0000-00000000000c'$q$), 'sans effet'),
 ('membre simple change son vote sur « ouverte »', pg_temp.essai('00000000-0000-0000-0000-00000000000c',
   $q$UPDATE decision_poll_votes SET option_index = 1 WHERE poll_id = '66666666-6666-6666-6666-000000000001' AND user_id = '00000000-0000-0000-0000-00000000000c'$q$), 'accepté'),
 ('membre simple crée une décision (propositions : admins)', pg_temp.essai('00000000-0000-0000-0000-00000000000c',
   $q$INSERT INTO decision_polls (entity_type, entity_id, question, created_by) VALUES ('GUILD','11111111-1111-1111-1111-111111111111','x','00000000-0000-0000-0000-00000000000c')$q$), 'refusé'),
 ('inconnu crée une décision dans la guilde', pg_temp.essai('00000000-0000-0000-0000-00000000000e',
   $q$INSERT INTO decision_polls (entity_type, entity_id, question, created_by) VALUES ('GUILD','11111111-1111-1111-1111-111111111111','x','00000000-0000-0000-0000-00000000000e')$q$), 'refusé'),
 ('admin crée une décision', pg_temp.essai('00000000-0000-0000-0000-00000000000a',
   $q$INSERT INTO decision_polls (entity_type, entity_id, question, created_by, status) VALUES ('GUILD','11111111-1111-1111-1111-111111111111','x','00000000-0000-0000-0000-00000000000a','DRAFT')$q$), 'accepté')
) v(quoi, r, attendu);

-- Poids : un votant qui annonce un poids de 1000 obtient le sien (25 % → pure_pct = 25).
SELECT pg_temp.essai('00000000-0000-0000-0000-00000000000b',
  $q$INSERT INTO decision_poll_votes (poll_id, user_id, option_index, raw_weight, applied_weight) VALUES ('66666666-6666-6666-6666-000000000001','00000000-0000-0000-0000-00000000000b',0,1000,1000)$q$) IS NOT NULL AS _ \gset
SELECT CASE WHEN applied_weight = 25 AND raw_weight = 25 THEN 'OK ' ELSE 'KO ' END || 'poids annoncé 1000, poids enregistré ' || applied_weight
FROM decision_poll_votes WHERE poll_id = '66666666-6666-6666-6666-000000000001' AND user_id = '00000000-0000-0000-0000-00000000000b';
SELECT CASE WHEN applied_weight = 0 THEN 'OK ' ELSE 'KO ' END || 'contribution non vérifiée ignorée : poids ' || applied_weight
FROM decision_poll_votes WHERE poll_id = '66666666-6666-6666-6666-000000000001' AND user_id = '00000000-0000-0000-0000-00000000000c';
UPDATE guilds SET governance_model = '1h1v';
UPDATE decision_poll_votes SET option_index = option_index WHERE user_id = '00000000-0000-0000-0000-00000000000b' AND poll_id = '66666666-6666-6666-6666-000000000001';
SELECT CASE WHEN applied_weight = 1 THEN 'OK ' ELSE 'KO ' END || 'gouvernance « 1 personne, 1 voix » : poids ' || applied_weight
FROM decision_poll_votes WHERE poll_id = '66666666-6666-6666-6666-000000000001' AND user_id = '00000000-0000-0000-0000-00000000000b';
