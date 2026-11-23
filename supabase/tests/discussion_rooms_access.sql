-- Test de 20261123100000_discussion_rooms_access.sql sur un Postgres 16 vide.
-- Usage : psql -v ON_ERROR_STOP=1 -f supabase/tests/discussion_rooms_access_stubs.sql \
--   -f supabase/migrations/20261123100000_discussion_rooms_access.sql -f supabase/tests/discussion_rooms_access.sql
-- Chaque ligne affichée commence par OK ou KO.
\set QUIET 1
\pset format unaligned
\pset tuples_only on
-- Personnes : 0a admin de guilde, 0b membre « Équipe », 0c membre simple, 0d abonné, 0e inconnu,
-- 0f membre dont le rôle « Équipe » a expiré, 01 admin de la plateforme.
INSERT INTO guilds VALUES ('11111111-1111-1111-1111-111111111111');
INSERT INTO guild_members VALUES
 ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-00000000000a','ADMIN'),
 ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-00000000000b','MEMBER'),
 ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-00000000000c','MEMBER'),
 ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-00000000000f','MEMBER');
INSERT INTO follows VALUES ('00000000-0000-0000-0000-00000000000d','GUILD','11111111-1111-1111-1111-111111111111');
INSERT INTO user_roles VALUES ('00000000-0000-0000-0000-000000000001','admin');
INSERT INTO entity_roles (id, entity_type, entity_id, name) VALUES ('22222222-2222-2222-2222-222222222222','guild','11111111-1111-1111-1111-111111111111','Équipe');
INSERT INTO entity_member_roles VALUES
 ('22222222-2222-2222-2222-222222222222','00000000-0000-0000-0000-00000000000b',NULL),
 ('22222222-2222-2222-2222-222222222222','00000000-0000-0000-0000-00000000000f',now() - interval '1 day');
INSERT INTO discussion_rooms (id, scope_type, scope_id, name, audience_type, allowed_role_ids, can_post_audience_type, can_reply_audience_type, is_default) VALUES
 ('33333333-3333-3333-3333-000000000001','GUILD','11111111-1111-1111-1111-111111111111','Général','MEMBERS','{}','MEMBERS','MEMBERS',true),
 ('33333333-3333-3333-3333-000000000002','GUILD','11111111-1111-1111-1111-111111111111','Équipe','SELECTED_ROLES','{22222222-2222-2222-2222-222222222222}','SELECTED_ROLES','SELECTED_ROLES',false),
 ('33333333-3333-3333-3333-000000000003','GUILD','11111111-1111-1111-1111-111111111111','Annonces','PUBLIC','{}','ADMINS_ONLY','MEMBERS',false),
 ('33333333-3333-3333-3333-000000000004','GUILD','11111111-1111-1111-1111-111111111111','Abonnés','FOLLOWERS','{}','FOLLOWERS','FOLLOWERS',false);
INSERT INTO feed_posts (id, author_user_id, context_type, context_id, content, room_id, visibility) VALUES
 ('44444444-4444-4444-4444-000000000001','00000000-0000-0000-0000-00000000000a','GUILD_DISCUSSION','11111111-1111-1111-1111-111111111111','general','33333333-3333-3333-3333-000000000001','public'),
 ('44444444-4444-4444-4444-000000000002','00000000-0000-0000-0000-00000000000b','GUILD_DISCUSSION','11111111-1111-1111-1111-111111111111','equipe','33333333-3333-3333-3333-000000000002','public'),
 ('44444444-4444-4444-4444-000000000003','00000000-0000-0000-0000-00000000000a','GUILD_DISCUSSION','11111111-1111-1111-1111-111111111111','annonce','33333333-3333-3333-3333-000000000003','public'),
 ('44444444-4444-4444-4444-000000000004','00000000-0000-0000-0000-00000000000a','GUILD_DISCUSSION','11111111-1111-1111-1111-111111111111','annonce_admins','33333333-3333-3333-3333-000000000003','admins'),
 ('44444444-4444-4444-4444-000000000005','00000000-0000-0000-0000-00000000000c','GUILD_DISCUSSION','11111111-1111-1111-1111-111111111111','ancien',NULL,'public'),
 ('44444444-4444-4444-4444-000000000006','00000000-0000-0000-0000-00000000000e','GLOBAL',NULL,'global',NULL,'public'),
 ('44444444-4444-4444-4444-000000000007','00000000-0000-0000-0000-00000000000d','GUILD_DISCUSSION','11111111-1111-1111-1111-111111111111','abonnes','33333333-3333-3333-3333-000000000004','public');
INSERT INTO comments (content, author_id, target_type, target_id) VALUES
 ('rep_equipe','00000000-0000-0000-0000-00000000000b','FEED_POST','44444444-4444-4444-4444-000000000002'),
 ('rep_annonce','00000000-0000-0000-0000-00000000000c','FEED_POST','44444444-4444-4444-4444-000000000003'),
 ('rep_quete','00000000-0000-0000-0000-00000000000c','QUEST','pas-un-uuid');
INSERT INTO post_attachments (post_id, url) VALUES ('44444444-4444-4444-4444-000000000002','budget.pdf'),('44444444-4444-4444-4444-000000000003','affiche.png');
INSERT INTO quests VALUES ('55555555-5555-5555-5555-000000000001','11111111-1111-1111-1111-111111111111',false,false,'00000000-0000-0000-0000-00000000000a'),
                          ('55555555-5555-5555-5555-000000000002','11111111-1111-1111-1111-111111111111',true,false,'00000000-0000-0000-0000-00000000000a');
INSERT INTO quest_subtasks (quest_id, title, assignee_user_id) VALUES
 ('55555555-5555-5555-5555-000000000001','publique',NULL),
 ('55555555-5555-5555-5555-000000000002','brouillon',NULL),
 ('55555555-5555-5555-5555-000000000002','brouillon_assignee','00000000-0000-0000-0000-00000000000c');

CREATE FUNCTION pg_temp.vu(p_role text, p_uid text, p_sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE r text;
BEGIN
  EXECUTE format('SET LOCAL ROLE %I', p_role);
  PERFORM set_config('test.uid', COALESCE(p_uid, ''), true);
  EXECUTE p_sql INTO r;
  RESET ROLE;
  RETURN COALESCE(r, '');
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.vu(text, text, text) TO PUBLIC;

CREATE TEMP TABLE attendus (qui text, role text, uid text, posts text, rooms text, comments text, pieces text, taches text);
GRANT SELECT ON attendus TO PUBLIC;
INSERT INTO attendus VALUES
 ('sans compte',          'anon',          NULL,                                   'annonce,global',                                        '',                                     'rep_annonce,rep_quete',              'affiche.png',             'publique'),
 ('inconnu connecté',     'authenticated', '00000000-0000-0000-0000-00000000000e', 'annonce,global',                                        'Annonces',                             'rep_annonce,rep_quete',              'affiche.png',             'publique'),
 ('abonné',               'authenticated', '00000000-0000-0000-0000-00000000000d', 'abonnes,annonce,global',                                'Abonnés,Annonces',                     'rep_annonce,rep_quete',              'affiche.png',             'publique'),
 ('membre simple',        'authenticated', '00000000-0000-0000-0000-00000000000c', 'abonnes,ancien,annonce,general,global',                 'Abonnés,Annonces,Général',             'rep_annonce,rep_quete',              'affiche.png',             'brouillon_assignee,publique'),
 ('membre Équipe',        'authenticated', '00000000-0000-0000-0000-00000000000b', 'abonnes,ancien,annonce,equipe,general,global',          'Abonnés,Annonces,Général,Équipe',      'rep_annonce,rep_equipe,rep_quete',   'affiche.png,budget.pdf',  'publique'),
 ('rôle Équipe expiré',   'authenticated', '00000000-0000-0000-0000-00000000000f', 'abonnes,ancien,annonce,general,global',                 'Abonnés,Annonces,Général',             'rep_annonce,rep_quete',              'affiche.png',             'publique'),
 ('admin de la guilde',   'authenticated', '00000000-0000-0000-0000-00000000000a', 'abonnes,ancien,annonce,annonce_admins,equipe,general,global', 'Abonnés,Annonces,Général,Équipe', 'rep_annonce,rep_equipe,rep_quete', 'affiche.png,budget.pdf', 'brouillon,brouillon_assignee,publique');

SELECT CASE WHEN got = posts THEN 'OK ' ELSE 'KO ' END || qui || ' — messages : ' || got || CASE WHEN got = posts THEN '' ELSE '  (attendu ' || posts || ')' END
FROM (SELECT *, pg_temp.vu(role, uid, 'SELECT string_agg(content, '','' ORDER BY content) FROM feed_posts') got FROM attendus) t;
SELECT CASE WHEN got = rooms THEN 'OK ' ELSE 'KO ' END || qui || ' — salons : ' || got || CASE WHEN got = rooms THEN '' ELSE '  (attendu ' || rooms || ')' END
FROM (SELECT *, CASE WHEN role = 'anon' THEN '' ELSE pg_temp.vu(role, uid, 'SELECT string_agg(name, '','' ORDER BY name) FROM discussion_rooms') END got FROM attendus) t;
SELECT CASE WHEN got = comments THEN 'OK ' ELSE 'KO ' END || qui || ' — réponses : ' || got || CASE WHEN got = comments THEN '' ELSE '  (attendu ' || comments || ')' END
FROM (SELECT *, pg_temp.vu(role, uid, 'SELECT string_agg(content, '','' ORDER BY content) FROM comments') got FROM attendus) t;
SELECT CASE WHEN got = pieces THEN 'OK ' ELSE 'KO ' END || qui || ' — pièces jointes : ' || got || CASE WHEN got = pieces THEN '' ELSE '  (attendu ' || pieces || ')' END
FROM (SELECT *, pg_temp.vu(role, uid, 'SELECT string_agg(url, '','' ORDER BY url) FROM post_attachments') got FROM attendus) t;
SELECT CASE WHEN got = taches THEN 'OK ' ELSE 'KO ' END || qui || ' — sous-tâches : ' || got || CASE WHEN got = taches THEN '' ELSE '  (attendu ' || taches || ')' END
FROM (SELECT *, pg_temp.vu(role, uid, 'SELECT string_agg(title, '','' ORDER BY title) FROM quest_subtasks') got FROM attendus) t;

-- Écriture : poster et répondre selon le salon.
CREATE FUNCTION pg_temp.essai(p_uid text, p_sql text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('test.uid', p_uid, true);
  EXECUTE p_sql;
  RESET ROLE;
  RETURN 'accepté';
EXCEPTION WHEN insufficient_privilege OR check_violation THEN
  RESET ROLE;
  RETURN 'refusé';
END $$;
SELECT CASE WHEN r = attendu THEN 'OK ' ELSE 'KO ' END || quoi || ' : ' || r FROM (VALUES
 ('membre simple écrit dans « Équipe »', pg_temp.essai('00000000-0000-0000-0000-00000000000c',
   $q$INSERT INTO feed_posts (author_user_id, context_type, context_id, content, room_id) VALUES ('00000000-0000-0000-0000-00000000000c','GUILD_DISCUSSION','11111111-1111-1111-1111-111111111111','x','33333333-3333-3333-3333-000000000002')$q$), 'refusé'),
 ('membre Équipe écrit dans « Équipe »', pg_temp.essai('00000000-0000-0000-0000-00000000000b',
   $q$INSERT INTO feed_posts (author_user_id, context_type, context_id, content, room_id) VALUES ('00000000-0000-0000-0000-00000000000b','GUILD_DISCUSSION','11111111-1111-1111-1111-111111111111','x','33333333-3333-3333-3333-000000000002')$q$), 'accepté'),
 ('membre simple écrit dans « Annonces » (admins)', pg_temp.essai('00000000-0000-0000-0000-00000000000c',
   $q$INSERT INTO feed_posts (author_user_id, context_type, context_id, content, room_id) VALUES ('00000000-0000-0000-0000-00000000000c','GUILD_DISCUSSION','11111111-1111-1111-1111-111111111111','x','33333333-3333-3333-3333-000000000003')$q$), 'refusé'),
 ('membre simple répond dans « Annonces »', pg_temp.essai('00000000-0000-0000-0000-00000000000c',
   $q$INSERT INTO comments (content, author_id, target_type, target_id) VALUES ('r','00000000-0000-0000-0000-00000000000c','FEED_POST','44444444-4444-4444-4444-000000000003')$q$), 'accepté'),
 ('inconnu répond dans « Annonces » (réponses : membres)', pg_temp.essai('00000000-0000-0000-0000-00000000000e',
   $q$INSERT INTO comments (content, author_id, target_type, target_id) VALUES ('r','00000000-0000-0000-0000-00000000000e','FEED_POST','44444444-4444-4444-4444-000000000003')$q$), 'refusé'),
 ('membre simple répond à un message de « Équipe »', pg_temp.essai('00000000-0000-0000-0000-00000000000c',
   $q$INSERT INTO comments (content, author_id, target_type, target_id) VALUES ('r','00000000-0000-0000-0000-00000000000c','FEED_POST','44444444-4444-4444-4444-000000000002')$q$), 'refusé'),
 ('message hors salon (mur personnel)', pg_temp.essai('00000000-0000-0000-0000-00000000000e',
   $q$INSERT INTO feed_posts (author_user_id, context_type, content) VALUES ('00000000-0000-0000-0000-00000000000e','USER','x')$q$), 'accepté')
) v(quoi, r, attendu);
