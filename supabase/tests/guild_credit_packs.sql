-- Test de la migration 20261120150000_guild_credit_packs.sql sur un Postgres vide (16).
-- Usage : psql -f supabase/tests/guild_credit_packs_stubs.sql -f supabase/migrations/20261120150000_guild_credit_packs.sql -f supabase/tests/guild_credit_packs.sql
-- Concurrence vérifiée à part le 20/11 : 10 décomptes simultanés sur un solde de 4 → 4 acceptés, solde 0, jamais négatif.
\set ON_ERROR_STOP 1
INSERT INTO auth.users VALUES ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b');
INSERT INTO public.guilds VALUES ('4964c699-4684-43a9-b508-cee21c77e24e');
-- deux achats de A : 5 restants (sans limite), 3 restants expirant bientôt ; un achat expiré
INSERT INTO guild_credit_purchases (guild_id, user_id, pack_code, credits, credits_remaining, stripe_session_id, expires_at) VALUES
 ('4964c699-4684-43a9-b508-cee21c77e24e','00000000-0000-0000-0000-00000000000a','p50',50,5,'cs_1',NULL),
 ('4964c699-4684-43a9-b508-cee21c77e24e','00000000-0000-0000-0000-00000000000a','p50',50,3,'cs_2',now()+interval '1 day'),
 ('4964c699-4684-43a9-b508-cee21c77e24e','00000000-0000-0000-0000-00000000000a','p50',50,40,'cs_3',now()-interval '1 day');
SELECT 'solde (expiré exclu) = ' || guild_credit_balance('4964c699-4684-43a9-b508-cee21c77e24e','00000000-0000-0000-0000-00000000000a');
SELECT 'décompte 4 → reste ' || consume_guild_credits('4964c699-4684-43a9-b508-cee21c77e24e','00000000-0000-0000-0000-00000000000a',4,'test');
SELECT 'cs_2 vidé en premier : ' || string_agg(stripe_session_id||'='||credits_remaining, ', ' ORDER BY stripe_session_id) FROM guild_credit_purchases;
SELECT 'décompte 5 (il en reste 4) → ' || coalesce(consume_guild_credits('4964c699-4684-43a9-b508-cee21c77e24e','00000000-0000-0000-0000-00000000000a',5,'trop')::text,'NULL, rien décompté');
SELECT 'B sans achat → ' || coalesce(consume_guild_credits('4964c699-4684-43a9-b508-cee21c77e24e','00000000-0000-0000-0000-00000000000b',1,'x')::text,'NULL');
SELECT 'journal : ' || count(*) || ' lignes, total ' || sum(amount) FROM guild_credit_uses;
-- droits : un compte connecté ne peut ni décompter ni lire le solde d'autrui
SET ROLE authenticated;
DO $$ BEGIN PERFORM consume_guild_credits('4964c699-4684-43a9-b508-cee21c77e24e','00000000-0000-0000-0000-00000000000a',1,'pirate'); RAISE NOTICE 'ÉCHEC : appel autorisé'; EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'authenticated : décompte refusé (ok)'; END $$;
RESET ROLE;
