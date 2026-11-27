-- Résumé d'activité d'une guilde : sections supplémentaires (équipe, travail, argent, offre, confiance, territoire).
-- La fonction existante devient guild_activity_base (inchangée : contrôle d'accès et sections d'origine) ;
-- guild_activity l'appelle d'abord (donc refuse les non-membres) puis ajoute les nouvelles sections.
ALTER FUNCTION public.guild_activity(uuid, timestamptz, timestamptz, integer) RENAME TO guild_activity_base;
REVOKE ALL ON FUNCTION public.guild_activity_base(uuid, timestamptz, timestamptz, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guild_activity_base(uuid, timestamptz, timestamptz, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.guild_activity(
  p_guild_id uuid,
  p_since timestamptz,
  p_until timestamptz DEFAULT now(),
  p_cap integer DEFAULT 100
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_base_out jsonb;
  v_cap integer := LEAST(GREATEST(coalesce(p_cap, 100), 1), 200);
  v_url text := 'https://changethegame.xyz';
  v_quests uuid[];
  v_terr uuid[];
  v_topics uuid[];
  v_ns uuid[];
  v_extra jsonb;
BEGIN
  -- Contrôle d'accès et sections d'origine (lève une erreur pour qui n'est pas membre).
  v_base_out := public.guild_activity_base(p_guild_id, p_since, p_until, p_cap);

  SELECT coalesce(array_agg(DISTINCT x.id), '{}') INTO v_quests FROM (
    SELECT q.id FROM quests q WHERE q.guild_id = p_guild_id AND q.is_deleted = false
    UNION SELECT h.quest_id FROM quest_hosts h JOIN quests q ON q.id = h.quest_id
      WHERE h.entity_id = p_guild_id AND upper(h.entity_type) = 'GUILD' AND q.is_deleted = false) x;
  SELECT coalesce(array_agg(territory_id), '{}') INTO v_terr FROM guild_territories WHERE guild_id = p_guild_id;
  SELECT coalesce(array_agg(topic_id), '{}') INTO v_topics FROM guild_topics WHERE guild_id = p_guild_id;
  SELECT coalesce(array_agg(DISTINCT natural_system_id), '{}') INTO v_ns FROM natural_system_links
    WHERE (linked_type::text = 'entity' AND linked_id = p_guild_id) OR (linked_type::text = 'quest' AND linked_id = ANY (v_quests));

  SELECT jsonb_build_object(
    -- Équipe
    'applications', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'who', coalesce((SELECT pf.name FROM profiles pf WHERE pf.user_id = a.applicant_user_id), '?'),
        'status', a.status, 'at', a.updated_at, 'to_review', a.status::text = 'PENDING',
        'url', v_url || '/guilds/' || p_guild_id || '/settings') ORDER BY a.updated_at)
      FROM (SELECT * FROM guild_applications WHERE guild_id = p_guild_id
              AND (status::text = 'PENDING' OR (updated_at >= p_since AND updated_at < p_until))
            ORDER BY updated_at DESC LIMIT v_cap) a), '[]'::jsonb),
    'membership_codes', jsonb_build_object(
      'redeemed', coalesce((SELECT jsonb_agg(jsonb_build_object('plan', c.plan_code,
          'who', coalesce((SELECT pf.name FROM profiles pf WHERE pf.user_id = c.redeemed_by_user_id), '?'), 'at', c.redeemed_at))
        FROM (SELECT * FROM guild_membership_codes WHERE guild_id = p_guild_id AND redeemed_at >= p_since AND redeemed_at < p_until
              ORDER BY redeemed_at LIMIT v_cap) c), '[]'::jsonb),
      'expiring_14d', coalesce((SELECT jsonb_agg(jsonb_build_object('plan', c.plan_code, 'valid_until', c.valid_until,
          'who', coalesce((SELECT pf.name FROM profiles pf WHERE pf.user_id = c.redeemed_by_user_id), '?')))
        FROM (SELECT * FROM guild_membership_codes WHERE guild_id = p_guild_id AND revoked_at IS NULL
              AND valid_until >= now() AND valid_until < now() + interval '14 days' ORDER BY valid_until LIMIT v_cap) c), '[]'::jsonb),
      'expired_in_window', (SELECT count(*) FROM guild_membership_codes WHERE guild_id = p_guild_id AND revoked_at IS NULL
              AND valid_until >= p_since AND valid_until < p_until)),
    'role_changes', coalesce((SELECT jsonb_agg(jsonb_build_object('role', r.name,
        'who', coalesce((SELECT pf.name FROM profiles pf WHERE pf.user_id = r.user_id), '?'), 'at', r.created_at))
      FROM (SELECT er.name, emr.user_id, emr.created_at FROM entity_member_roles emr JOIN entity_roles er ON er.id = emr.entity_role_id
            WHERE er.entity_type = 'guild' AND er.entity_id = p_guild_id AND emr.created_at >= p_since AND emr.created_at < p_until
            ORDER BY emr.created_at LIMIT v_cap) r), '[]'::jsonb),
    'rituals', coalesce((SELECT jsonb_agg(jsonb_build_object('title', o.title, 'scheduled_at', o.scheduled_at, 'status', o.status,
        'attendees', o.n, 'upcoming', o.scheduled_at >= now(),
        'url', v_url || '/guilds/' || p_guild_id || '?tab=rituals') ORDER BY o.scheduled_at)
      FROM (SELECT r.title, ro.scheduled_at, ro.status,
                   (SELECT count(*) FROM ritual_attendees ra WHERE ra.occurrence_id = ro.id) AS n
            FROM ritual_occurrences ro JOIN rituals r ON r.id = ro.ritual_id
            WHERE r.guild_id = p_guild_id
              AND ((ro.scheduled_at >= p_since AND ro.scheduled_at < p_until) OR (ro.scheduled_at >= now() AND ro.scheduled_at < now() + interval '14 days'))
            ORDER BY ro.scheduled_at LIMIT v_cap) o), '[]'::jsonb),
    -- Travail concret
    'subtasks', jsonb_build_object(
      'changed', coalesce((SELECT jsonb_agg(jsonb_build_object('title', s.title, 'quest', s.qtitle, 'status', s.status,
          'assignee', coalesce((SELECT pf.name FROM profiles pf WHERE pf.user_id = s.assignee_user_id), NULL),
          'at', s.updated_at, 'url', v_url || '/quests/' || s.quest_id) ORDER BY s.updated_at)
        FROM (SELECT st.*, q.title AS qtitle FROM quest_subtasks st JOIN quests q ON q.id = st.quest_id
              WHERE st.quest_id = ANY (v_quests) AND st.updated_at >= p_since AND st.updated_at < p_until
              ORDER BY st.updated_at DESC LIMIT v_cap) s), '[]'::jsonb),
      'overdue', coalesce((SELECT jsonb_agg(jsonb_build_object('title', s.title, 'quest', s.qtitle, 'status', s.status, 'due', s.due_date,
          'assignee', coalesce((SELECT pf.name FROM profiles pf WHERE pf.user_id = s.assignee_user_id), NULL),
          'url', v_url || '/quests/' || s.quest_id) ORDER BY s.due_date)
        FROM (SELECT st.*, q.title AS qtitle FROM quest_subtasks st JOIN quests q ON q.id = st.quest_id
              WHERE st.quest_id = ANY (v_quests) AND st.due_date < now() AND st.status <> 'DONE'
              ORDER BY st.due_date LIMIT v_cap) s), '[]'::jsonb)),
    'contributions_logged', coalesce((SELECT jsonb_agg(jsonb_build_object('title', c.title, 'type', c.contribution_type,
        'who', coalesce((SELECT pf.name FROM profiles pf WHERE pf.user_id = c.user_id), '?'),
        'status', c.status, 'to_validate', c.verified_at IS NULL AND upper(coalesce(c.status, '')) NOT IN ('VERIFIED', 'APPROVED', 'REJECTED'),
        'fmv_value', c.fmv_value, 'hours', c.hours_logged, 'ctg_emitted', c.ctg_emitted, 'at', c.created_at) ORDER BY c.created_at)
      FROM (SELECT * FROM contribution_logs WHERE (guild_id = p_guild_id OR quest_id = ANY (v_quests))
              AND ((created_at >= p_since AND created_at < p_until)
                   OR (verified_at IS NULL AND upper(coalesce(status, '')) NOT IN ('VERIFIED', 'APPROVED', 'REJECTED')))
            ORDER BY created_at DESC LIMIT v_cap) c), '[]'::jsonb),
    'docs', coalesce((SELECT jsonb_agg(jsonb_build_object('title', d.title,
        'change', CASE WHEN d.created_at >= p_since THEN 'created' ELSE 'updated' END,
        'by', coalesce((SELECT pf.name FROM profiles pf WHERE pf.user_id = coalesce(d.updated_by_user_id, d.created_by_user_id)), '?'),
        'at', d.updated_at, 'url', v_url || '/guilds/' || p_guild_id || '?tab=docs') ORDER BY d.updated_at)
      FROM (SELECT * FROM guild_docs WHERE guild_id = p_guild_id AND updated_at >= p_since AND updated_at < p_until
            ORDER BY updated_at DESC LIMIT v_cap) d), '[]'::jsonb),
    'files', coalesce((SELECT jsonb_agg(jsonb_build_object('name', coalesce(f.title, f.file_name), 'on', f.target_type,
        'by', coalesce((SELECT pf.name FROM profiles pf WHERE pf.user_id = f.uploaded_by_user_id), '?'), 'at', f.created_at) ORDER BY f.created_at)
      FROM (SELECT * FROM attachments WHERE created_at >= p_since AND created_at < p_until
              AND ((upper(target_type) = 'GUILD' AND target_id = p_guild_id::text)
                OR (upper(target_type) = 'QUEST' AND target_id = ANY (SELECT unnest(v_quests)::text)))
            ORDER BY created_at DESC LIMIT v_cap) f), '[]'::jsonb),
    -- Argent et valeur
    'wallet', jsonb_build_object(
      'coins_balance', (SELECT coins_balance FROM guild_wallets WHERE guild_id = p_guild_id),
      'credits_balance', (SELECT credits_balance FROM guild_wallets WHERE guild_id = p_guild_id),
      'movements', coalesce((SELECT jsonb_agg(jsonb_build_object('amount', t.amount, 'currency', t.currency, 'type', t.type,
          'source', t.source, 'at', t.created_at) ORDER BY t.created_at)
        FROM (SELECT * FROM guild_credit_transactions WHERE guild_id = p_guild_id AND created_at >= p_since AND created_at < p_until
              ORDER BY created_at DESC LIMIT v_cap) t), '[]'::jsonb),
      'ctg_emitted', coalesce((SELECT sum(ctg_emitted) FROM contribution_logs WHERE (guild_id = p_guild_id OR quest_id = ANY (v_quests))
          AND created_at >= p_since AND created_at < p_until), 0)),
    'funding', jsonb_build_object(
      'received', coalesce((SELECT jsonb_agg(jsonb_build_object('quest', f.qtitle, 'amount', f.amount, 'currency', f.currency,
          'refunded', f.refunded_at IS NOT NULL, 'at', f.created_at) ORDER BY f.created_at)
        FROM (SELECT fc.*, q.title AS qtitle FROM quest_funding_contributions fc JOIN quests q ON q.id = fc.quest_id
              WHERE fc.quest_id = ANY (v_quests) AND fc.created_at >= p_since AND fc.created_at < p_until
              ORDER BY fc.created_at DESC LIMIT v_cap) f), '[]'::jsonb),
      'spendings', coalesce((SELECT jsonb_agg(jsonb_build_object('quest', s.qtitle, 'description', s.description, 'amount', s.amount,
          'at', s.created_at) ORDER BY s.created_at)
        FROM (SELECT es.*, q.title AS qtitle FROM quest_external_spendings es JOIN quests q ON q.id = es.quest_id
              WHERE es.quest_id = ANY (v_quests) AND es.created_at >= p_since AND es.created_at < p_until
              ORDER BY es.created_at DESC LIMIT v_cap) s), '[]'::jsonb)),
    'agreements', jsonb_build_object(
      'contracts_changed', coalesce((SELECT jsonb_agg(jsonb_build_object('quest', c.qtitle, 'title', c.title, 'status', c.status,
          'at', c.updated_at, 'url', v_url || '/quests/' || c.quest_id) ORDER BY c.updated_at)
        FROM (SELECT qc.*, q.title AS qtitle FROM quest_contracts qc JOIN quests q ON q.id = qc.quest_id
              WHERE qc.quest_id = ANY (v_quests) AND qc.updated_at >= p_since AND qc.updated_at < p_until
              ORDER BY qc.updated_at DESC LIMIT v_cap) c), '[]'::jsonb),
      'signatures_pending', coalesce((SELECT jsonb_agg(jsonb_build_object('quest', s.qtitle, 'contract', s.title,
          'who', coalesce((SELECT pf.name FROM profiles pf WHERE pf.user_id = s.user_id), '?'), 'url', v_url || '/quests/' || s.quest_id))
        FROM (SELECT cs.user_id, qc.title, qc.quest_id, q.title AS qtitle FROM contract_signatories cs
              JOIN quest_contracts qc ON qc.id = cs.contract_id JOIN quests q ON q.id = qc.quest_id
              WHERE qc.quest_id = ANY (v_quests) AND cs.signed_at IS NULL AND cs.rejected_at IS NULL LIMIT v_cap) s), '[]'::jsonb),
      'amendments_pending', coalesce((SELECT jsonb_agg(jsonb_build_object('quest', a.qtitle, 'contract', a.title, 'number', a.amendment_number,
          'proposed_at', a.proposed_at, 'url', v_url || '/quests/' || a.quest_id))
        FROM (SELECT ca.amendment_number, ca.proposed_at, qc.title, qc.quest_id, q.title AS qtitle FROM contract_amendments ca
              JOIN quest_contracts qc ON qc.id = ca.contract_id JOIN quests q ON q.id = qc.quest_id
              WHERE qc.quest_id = ANY (v_quests) AND ca.resolved_at IS NULL LIMIT v_cap) a), '[]'::jsonb),
      'exits', coalesce((SELECT jsonb_agg(jsonb_build_object('quest', e.qtitle,
          'who', coalesce((SELECT pf.name FROM profiles pf WHERE pf.user_id = e.user_id), '?'), 'type', e.exit_type,
          'settlement_status', e.settlement_status, 'votes', (SELECT count(*) FROM exit_votes v WHERE v.exit_id = e.id), 'at', e.exited_at))
        FROM (SELECT ce.*, q.title AS qtitle FROM contributor_exits ce JOIN quests q ON q.id = ce.quest_id
              WHERE ce.quest_id = ANY (v_quests)
                AND ((ce.exited_at >= p_since AND ce.exited_at < p_until) OR upper(coalesce(ce.settlement_status, '')) IN ('PENDING', 'VOTING'))
              LIMIT v_cap) e), '[]'::jsonb)),
    -- Offre et rayonnement
    'services', jsonb_build_object(
      'changed', coalesce((SELECT jsonb_agg(jsonb_build_object('title', s.title, 'active', s.is_active, 'at', s.updated_at,
          'url', v_url || '/services/' || s.id))
        FROM (SELECT * FROM services WHERE is_deleted = false
              AND (provider_guild_id = p_guild_id OR (upper(owner_type) = 'GUILD' AND owner_id = p_guild_id::text))
              AND updated_at >= p_since AND updated_at < p_until LIMIT v_cap) s), '[]'::jsonb),
      'bookings', coalesce((SELECT jsonb_agg(jsonb_build_object('service', b.stitle, 'status', b.status,
          'start', b.start_date_time, 'who', coalesce((SELECT pf.name FROM profiles pf WHERE pf.user_id = b.requester_id), '?'),
          'upcoming', b.start_date_time >= now()) ORDER BY b.start_date_time)
        FROM (SELECT bk.*, sv.title AS stitle FROM bookings bk LEFT JOIN services sv ON sv.id = bk.service_id
              WHERE bk.is_deleted = false AND bk.provider_guild_id = p_guild_id
                AND ((bk.created_at >= p_since AND bk.created_at < p_until) OR (bk.start_date_time >= now() AND bk.start_date_time < now() + interval '14 days'))
              ORDER BY bk.start_date_time LIMIT v_cap) b), '[]'::jsonb)),
    'courses', coalesce((SELECT jsonb_agg(jsonb_build_object('title', c.title,
        'enrollments', (SELECT count(*) FROM course_enrollments e WHERE e.course_id = c.id AND e.enrolled_at >= p_since AND e.enrolled_at < p_until),
        'completions', (SELECT count(*) FROM course_enrollments e WHERE e.course_id = c.id AND e.completed_at >= p_since AND e.completed_at < p_until),
        'purchases', (SELECT count(*) FROM course_purchases cp WHERE cp.course_id = c.id AND cp.created_at >= p_since AND cp.created_at < p_until),
        'url', v_url || '/courses/' || c.id))
      FROM (SELECT * FROM courses WHERE owner_guild_id = p_guild_id AND is_deleted = false LIMIT v_cap) c
      WHERE c.updated_at >= p_since
         OR EXISTS (SELECT 1 FROM course_enrollments e WHERE e.course_id = c.id AND (e.enrolled_at >= p_since OR e.completed_at >= p_since))
         OR EXISTS (SELECT 1 FROM course_purchases cp WHERE cp.course_id = c.id AND cp.created_at >= p_since)), '[]'::jsonb),
    'partnerships', coalesce((SELECT jsonb_agg(jsonb_build_object('with_type', CASE WHEN p.from_entity_id = p_guild_id THEN p.to_entity_type ELSE p.from_entity_type END,
        'with', coalesce((SELECT g.name FROM guilds g WHERE g.id = CASE WHEN p.from_entity_id = p_guild_id THEN p.to_entity_id ELSE p.from_entity_id END),
                         (SELECT co.name FROM companies co WHERE co.id = CASE WHEN p.from_entity_id = p_guild_id THEN p.to_entity_id ELSE p.from_entity_id END), '?'),
        'type', p.partnership_type, 'status', p.status, 'at', p.updated_at) ORDER BY p.updated_at)
      FROM (SELECT * FROM partnerships WHERE (from_entity_id = p_guild_id OR to_entity_id = p_guild_id)
              AND updated_at >= p_since AND updated_at < p_until LIMIT v_cap) p), '[]'::jsonb),
    -- Confiance et territoire
    'trust', jsonb_build_object(
      'received', coalesce((SELECT jsonb_agg(jsonb_build_object('type', t.edge_type, 'score', t.score, 'status', t.status,
          'from', coalesce((SELECT pf.name FROM profiles pf WHERE pf.user_id = t.created_by), '?'), 'at', t.updated_at) ORDER BY t.updated_at)
        FROM (SELECT * FROM trust_edges WHERE ((to_node_type::text = 'guild' AND to_node_id = p_guild_id) OR context_guild_id = p_guild_id)
                AND updated_at >= p_since AND updated_at < p_until LIMIT v_cap) t), '[]'::jsonb),
      'to_renew', (SELECT count(*) FROM trust_edges WHERE ((to_node_type::text = 'guild' AND to_node_id = p_guild_id) OR context_guild_id = p_guild_id)
                AND status::text = 'active' AND coalesce(last_confirmed_at, created_at) < now() - interval '330 days')),
    'natural_systems', coalesce((SELECT jsonb_agg(jsonb_build_object('name', ns.name, 'health_index', s.health_index,
        'previous', s.prev, 'at', s.recorded_at, 'url', v_url || '/natural-systems/' || ns.id) ORDER BY s.recorded_at)
      FROM (SELECT DISTINCT ON (h.natural_system_id) h.*,
                   (SELECT h2.health_index FROM natural_system_health_snapshots h2 WHERE h2.natural_system_id = h.natural_system_id
                      AND h2.recorded_at < p_since ORDER BY h2.recorded_at DESC LIMIT 1) AS prev
            FROM natural_system_health_snapshots h WHERE h.natural_system_id = ANY (v_ns)
              AND h.recorded_at >= p_since AND h.recorded_at < p_until ORDER BY h.natural_system_id, h.recorded_at DESC) s
      JOIN natural_systems ns ON ns.id = s.natural_system_id), '[]'::jsonb),
    'nearby', jsonb_build_object(
      'quests', coalesce((SELECT jsonb_agg(jsonb_build_object('title', q.title, 'status', q.status, 'at', q.created_at,
          'url', v_url || '/quests/' || q.id) ORDER BY q.created_at)
        FROM (SELECT q.* FROM quests q WHERE q.is_deleted = false AND q.created_at >= p_since AND q.created_at < p_until
                AND NOT (q.id = ANY (v_quests))
                AND NOT EXISTS (SELECT 1 FROM demo_seed_registry r WHERE r.row_id::text = q.id::text)
                AND (EXISTS (SELECT 1 FROM quest_territories qt WHERE qt.quest_id = q.id AND qt.territory_id = ANY (v_terr))
                  OR EXISTS (SELECT 1 FROM quest_topics qtp WHERE qtp.quest_id = q.id AND qtp.topic_id = ANY (v_topics)))
              ORDER BY q.created_at DESC LIMIT v_cap) q), '[]'::jsonb),
      'guilds', coalesce((SELECT jsonb_agg(jsonb_build_object('name', g.name, 'at', g.created_at, 'url', v_url || '/guilds/' || g.id) ORDER BY g.created_at)
        FROM (SELECT g.* FROM guilds g WHERE g.id <> p_guild_id AND coalesce(g.is_deleted, false) = false
                AND g.created_at >= p_since AND g.created_at < p_until
                AND NOT EXISTS (SELECT 1 FROM demo_seed_registry r WHERE r.row_id::text = g.id::text)
                AND (EXISTS (SELECT 1 FROM guild_territories gt WHERE gt.guild_id = g.id AND gt.territory_id = ANY (v_terr))
                  OR EXISTS (SELECT 1 FROM guild_topics gtp WHERE gtp.guild_id = g.id AND gtp.topic_id = ANY (v_topics)))
              ORDER BY g.created_at DESC LIMIT v_cap) g), '[]'::jsonb))
  ) INTO v_extra;

  RETURN v_base_out || v_extra;
END;
$$;
REVOKE ALL ON FUNCTION public.guild_activity(uuid, timestamptz, timestamptz, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guild_activity(uuid, timestamptz, timestamptz, integer) TO authenticated, service_role;
