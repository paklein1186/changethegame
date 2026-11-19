-- Example data for drafts: guild Trois-Tiers with paid membership + 3 confirmed test accounts.
DO $$
DECLARE
  u record;
BEGIN
  FOR u IN SELECT * FROM (VALUES
    ('00000000-0000-4000-a000-000000000001'::uuid, 'admin-troistiers@example.com',   'Admin Trois-Tiers',   now() - interval '3 minutes'),
    ('00000000-0000-4000-a000-000000000002'::uuid, 'membre-troistiers@example.com',  'Membre Trois-Tiers',  now() - interval '2 minutes'),
    ('00000000-0000-4000-a000-000000000003'::uuid, 'visiteur-troistiers@example.com','Visiteur Trois-Tiers',now() - interval '1 minute')
  ) AS t(id, email, name, created) LOOP
    INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token, email_change, email_change_token_new)
    VALUES ('00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
      extensions.crypt('TestTroisTiers2026!', extensions.gen_salt('bf')), now(), u.created, now(),
      '{"provider":"email","providers":["email"]}', jsonb_build_object('name', u.name, 'full_name', u.name),
      '', '', '', '');
    INSERT INTO auth.identities (id, user_id, provider, provider_id, identity_data, created_at, updated_at)
    VALUES (gen_random_uuid(), u.id, 'email', u.id::text,
      jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), now(), now());
  END LOOP;
END $$;

INSERT INTO public.guilds (id, name, description, type, is_approved, created_by_user_id, join_policy,
  public_visibility, enable_membership, membership_style, billing_model, entry_fee_credits,
  membership_benefits_text)
VALUES ('4964c699-4684-43a9-b508-cee21c77e24e', 'Trois-Tiers',
  'Guilde de test : accompagnement des tiers-lieux (exemple).', 'NETWORK', true,
  '00000000-0000-4000-a000-000000000001', 'APPROVAL_REQUIRED', 'public', true, 'core_members',
  'one_time', 100, 'Accès aux quêtes et événements réservés aux membres.');

-- XP triggers need an authenticated actor: act as each joining user.
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);
INSERT INTO public.guild_members (guild_id, user_id, role) VALUES
  ('4964c699-4684-43a9-b508-cee21c77e24e', '00000000-0000-4000-a000-000000000001', 'ADMIN');
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000002","role":"authenticated"}', true);
INSERT INTO public.guild_members (guild_id, user_id, role) VALUES
  ('4964c699-4684-43a9-b508-cee21c77e24e', '00000000-0000-4000-a000-000000000002', 'MEMBER');
SELECT set_config('request.jwt.claims', '', true);

-- The guild creator (admin) already gets an active membership from a trigger.
INSERT INTO public.user_guild_memberships (user_id, guild_id, role, status, last_payment_at, chosen_fee_credits)
VALUES ('00000000-0000-4000-a000-000000000002', '4964c699-4684-43a9-b508-cee21c77e24e', 'member', 'active', now(), 100)
ON CONFLICT (user_id, guild_id) DO NOTHING;
