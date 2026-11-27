CREATE OR REPLACE FUNCTION public.decide_quest_proposal(p_proposal_id uuid, p_decision text, p_actor uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_server boolean := auth.uid() IS NULL AND coalesce(auth.role(), '') = 'service_role';
  v_actor uuid;
  p record;
  q record;
  v_guild uuid;
  v_credits integer := 0;
  v_euros numeric := 0;
  v_claims text;
BEGIN
  IF p_decision NOT IN ('accept', 'reject') THEN RAISE EXCEPTION 'Invalid decision' USING ERRCODE = '22023'; END IF;
  IF v_uid IS NULL AND NOT v_server THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;

  SELECT * INTO p FROM quest_proposals WHERE id = p_proposal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Proposal not found' USING ERRCODE = 'P0002'; END IF;
  SELECT id, title, created_by_user_id, guild_id INTO q FROM quests WHERE id = p.quest_id;
  v_guild := coalesce(q.guild_id, (SELECT h.entity_id FROM quest_hosts h
                                   WHERE h.quest_id = q.id AND upper(h.entity_type::text) = 'GUILD' LIMIT 1));

  IF v_server THEN
    v_actor := p_actor;
  ELSE
    v_actor := v_uid;
    IF NOT (q.created_by_user_id = v_uid OR public.has_role(v_uid, 'admin')
            OR EXISTS (SELECT 1 FROM guild_members gm WHERE gm.guild_id = v_guild AND gm.user_id = v_uid
                       AND upper(gm.role::text) = 'ADMIN')) THEN
      RAISE EXCEPTION 'Only the quest owner or a guild admin can decide' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF p.status <> 'PENDING' THEN RAISE EXCEPTION 'Proposal already decided' USING ERRCODE = 'P0001'; END IF;

  UPDATE quest_proposals SET status = CASE WHEN p_decision = 'accept' THEN 'ACCEPTED' ELSE 'REJECTED' END, updated_at = now()
  WHERE id = p.id;

  IF p.proposer_type = 'USER' AND p.proposer_id ~* '^[0-9a-f-]{36}$' THEN
    IF p_decision = 'accept' THEN
      v_credits := greatest(coalesce(p.requested_credits, 0), 0);
      v_euros := greatest(coalesce(p.requested_fiat, 0), 0);
      IF v_credits > 0 THEN
        INSERT INTO credit_transactions (user_id, type, amount, source, related_entity_type, related_entity_id)
        VALUES (p.proposer_id::uuid, 'QUEST_REWARD', v_credits, 'QUEST_PROPOSAL_ACCEPTED', 'quest', q.id::text);
        UPDATE profiles SET credits_balance = coalesce(credits_balance, 0) + v_credits WHERE user_id = p.proposer_id::uuid;
      END IF;
      IF v_actor IS NOT NULL THEN
        IF v_server THEN
          v_claims := current_setting('request.jwt.claims', true);
          PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_actor, 'role', 'authenticated')::text, true);
        END IF;
        BEGIN
          PERFORM public.grant_user_xp(p.proposer_id::uuid, 'PROPOSAL_ACCEPTED', 20, NULL, NULL, 'Quest', q.id::text);
        EXCEPTION WHEN OTHERS THEN
          RAISE WARNING 'decide_quest_proposal: XP non attribuée (%)', SQLERRM;
        END;
        IF v_server THEN PERFORM set_config('request.jwt.claims', coalesce(v_claims, ''), true); END IF;
      END IF;
    END IF;
    INSERT INTO notifications (user_id, type, title, body, related_entity_type, related_entity_id, deep_link_url)
    VALUES (p.proposer_id::uuid,
            CASE WHEN p_decision = 'accept' THEN 'QUEST_PROPOSAL_ACCEPTED' ELSE 'QUEST_PROPOSAL_REJECTED' END,
            CASE WHEN p_decision = 'accept' THEN 'Proposition acceptée' ELSE 'Proposition non retenue' END,
            '« ' || p.title || ' » (' || q.title || ') '
              || CASE WHEN p_decision = 'accept' THEN 'a été acceptée.' ELSE 'n''a pas été retenue cette fois-ci.' END
              || CASE WHEN v_credits > 0 THEN ' ' || v_credits || ' crédits vous ont été versés.' ELSE '' END
              || CASE WHEN v_euros > 0 THEN ' Les ' || v_euros || ' € demandés se règlent directement avec l''équipe.' ELSE '' END,
            'QUEST', q.id, '/quests/' || q.id::text);
  END IF;

  RETURN jsonb_build_object('proposal_id', p.id, 'status', CASE WHEN p_decision = 'accept' THEN 'ACCEPTED' ELSE 'REJECTED' END,
                            'credits_granted', v_credits, 'fiat_to_follow', v_euros);
END;
$$;
REVOKE ALL ON FUNCTION public.decide_quest_proposal(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_quest_proposal(uuid, text, uuid) TO authenticated, service_role;