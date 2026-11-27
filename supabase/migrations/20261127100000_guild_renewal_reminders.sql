-- Rappel par e-mail une semaine avant le renouvellement d'une cotisation de guilde en euros.
-- La fonction guild-membership-reminders (appelée chaque jour) note ici la fin de période
-- pour laquelle le rappel est parti : un seul rappel par période, même si l'appel est rejoué.
ALTER TABLE public.user_guild_memberships
  ADD COLUMN IF NOT EXISTS renewal_reminder_sent_for timestamptz;

CREATE INDEX IF NOT EXISTS idx_ugm_period_end_active
  ON public.user_guild_memberships(current_period_end)
  WHERE stripe_subscription_id IS NOT NULL AND status = 'active';
