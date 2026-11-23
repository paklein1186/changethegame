-- Sécurité : les règles des décisions (votes) appliquées par la base.
-- Requiert 20261123100000_discussion_rooms_access.sql (fonction guild_audience_allows).

CREATE OR REPLACE FUNCTION public.decision_poll_allows(p_poll_id uuid, p_user_id uuid, p_action text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p record;
  v_member_role text;
  v_ok boolean;
BEGIN
  SELECT * INTO p FROM public.decision_polls WHERE id = p_poll_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF p.entity_type = 'GUILD' THEN
    SELECT gm.role INTO v_member_role FROM public.guild_members gm
    WHERE gm.guild_id = p.entity_id AND gm.user_id = p_user_id LIMIT 1;
    -- Voir
    IF p.status = 'DRAFT' THEN
      -- IS TRUE : sans compte, les comparaisons valent NULL, qui doit compter comme « non ».
      IF NOT ((p.created_by = p_user_id) IS TRUE OR (v_member_role = 'ADMIN') IS TRUE) THEN
        RETURN false;
      END IF;
    ELSIF NOT ((p.created_by = p_user_id) IS TRUE
               OR public.guild_audience_allows(p.entity_id, p_user_id, p.visibility_audience_type, p.allowed_visibility_role_ids)) THEN
      RETURN false;
    END IF;
    IF p_action = 'view' THEN
      RETURN true;
    END IF;
    -- Voter
    IF NOT public.guild_audience_allows(p.entity_id, p_user_id, p.can_vote_audience_type, p.allowed_vote_role_ids) THEN
      RETURN false;
    END IF;
  ELSE
    -- Autres entités : règle de lecture d'origine (membres de l'entité).
    v_ok := CASE p.entity_type
      WHEN 'QUEST' THEN EXISTS (SELECT 1 FROM public.quest_participants WHERE quest_id = p.entity_id AND user_id = p_user_id)
                     OR EXISTS (SELECT 1 FROM public.quests WHERE id = p.entity_id AND created_by_user_id = p_user_id)
      WHEN 'POD' THEN EXISTS (SELECT 1 FROM public.pod_members WHERE pod_id = p.entity_id AND user_id = p_user_id)
      WHEN 'COMPANY' THEN EXISTS (SELECT 1 FROM public.company_members WHERE company_id = p.entity_id AND user_id = p_user_id)
      ELSE true
    END;
    IF v_ok IS NOT TRUE THEN
      RETURN false;
    END IF;
    IF p_action = 'view' THEN
      RETURN true;
    END IF;
  END IF;

  -- Voter ou changer son vote : décision ouverte.
  IF p.status <> 'OPEN' OR (p.opens_at IS NOT NULL AND p.opens_at > now())
     OR (p.closes_at IS NOT NULL AND p.closes_at <= now()) THEN
    RETURN false;
  END IF;
  IF p_action = 'change_vote' AND NOT p.allow_vote_change THEN
    RETURN false;
  END IF;
  RETURN p_action IN ('vote', 'change_vote');
END;
$$;

REVOKE ALL ON FUNCTION public.decision_poll_allows(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decision_poll_allows(uuid, uuid, text) TO anon, authenticated, service_role;

-- Poids d'un vote, recalculé par la base (même formule que src/lib/governanceWeights.ts).
CREATE OR REPLACE FUNCTION public.set_decision_vote_weight()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_guild uuid;
  v_model text;
  v_total numeric;
  v_user numeric;
  v_pct numeric := 0;
BEGIN
  SELECT CASE p.entity_type WHEN 'GUILD' THEN p.entity_id
           WHEN 'QUEST' THEN (SELECT q.guild_id FROM public.quests q WHERE q.id = p.entity_id) END
    INTO v_guild
  FROM public.decision_polls p WHERE p.id = NEW.poll_id;

  IF v_guild IS NULL THEN
    NEW.raw_weight := 0;
    NEW.applied_weight := 1.0;
    RETURN NEW;
  END IF;

  SELECT COALESCE(g.governance_model, '1h1v') INTO v_model FROM public.guilds g WHERE g.id = v_guild;
  SELECT COALESCE(SUM(COALESCE(cl.fmv_value, 0)), 0),
         COALESCE(SUM(COALESCE(cl.fmv_value, 0)) FILTER (WHERE cl.user_id = NEW.user_id), 0)
    INTO v_total, v_user
  FROM public.contribution_logs cl
  JOIN public.quests q ON q.id = cl.quest_id
  WHERE q.guild_id = v_guild AND cl.status = 'verified';
  IF v_total > 0 THEN
    v_pct := v_user / v_total * 100;
  END IF;

  NEW.raw_weight := round(v_pct, 4);
  NEW.applied_weight := round(CASE COALESCE(v_model, '1h1v')
    WHEN 'soft_log' THEN log(2, v_pct + 1) * 100
    WHEN 'strong_log' THEN log(10, v_pct + 1) * 100
    WHEN 'pure_pct' THEN v_pct
    ELSE 1.0
  END, 4);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_decision_vote_weight ON public.decision_poll_votes;
CREATE TRIGGER trg_decision_vote_weight
  BEFORE INSERT OR UPDATE ON public.decision_poll_votes
  FOR EACH ROW EXECUTE FUNCTION public.set_decision_vote_weight();

-- Décisions
DROP POLICY IF EXISTS "Members can view decision polls" ON public.decision_polls;
CREATE POLICY "View decision polls allowed by audience"
  ON public.decision_polls FOR SELECT
  USING (public.decision_poll_allows(id, auth.uid(), 'view'));

DROP POLICY IF EXISTS "Authenticated users can create polls" ON public.decision_polls;
CREATE POLICY "Members can create polls"
  ON public.decision_polls FOR INSERT
  WITH CHECK (
    auth.uid() = created_by
    AND (
      entity_type <> 'GUILD'
      OR EXISTS (
        SELECT 1 FROM public.guild_members gm JOIN public.guilds g ON g.id = gm.guild_id
        WHERE gm.guild_id = decision_polls.entity_id AND gm.user_id = auth.uid()
          AND (gm.role = 'ADMIN' OR COALESCE(g.features_config ->> 'decisionProposerRole', 'ADMIN') = 'MEMBER')
      )
    )
  );

-- Votes
DROP POLICY IF EXISTS "Members can view poll votes" ON public.decision_poll_votes;
CREATE POLICY "View votes of visible polls"
  ON public.decision_poll_votes FOR SELECT
  USING (public.decision_poll_allows(poll_id, auth.uid(), 'view'));

DROP POLICY IF EXISTS "Users can vote on polls" ON public.decision_poll_votes;
CREATE POLICY "Users can vote on open polls they may vote on"
  ON public.decision_poll_votes FOR INSERT
  WITH CHECK (auth.uid() = user_id AND public.decision_poll_allows(poll_id, auth.uid(), 'vote'));

DROP POLICY IF EXISTS "Users can change their vote" ON public.decision_poll_votes;
CREATE POLICY "Users can change their vote while allowed"
  ON public.decision_poll_votes FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND public.decision_poll_allows(poll_id, auth.uid(), 'change_vote'));

DROP POLICY IF EXISTS "Users can delete their vote" ON public.decision_poll_votes;
CREATE POLICY "Users can withdraw their vote while allowed"
  ON public.decision_poll_votes FOR DELETE
  USING (auth.uid() = user_id AND public.decision_poll_allows(poll_id, auth.uid(), 'change_vote'));