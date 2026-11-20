// @ts-nocheck — partagé par guild-euro-webhook, guild-euro-confirm et guild-credits-checkout.
// Packs de questions (bibliothèque) payés en euros, en une fois, sur le compte Stripe de la guilde.
// Crédit idempotent : une session Stripe ne crédite qu'un achat (stripe_session_id unique).

export const CREDITS_KIND = "guild_credits";

/** Date d'expiration d'un achat : `months` mois après `from`, ou null (sans limite). */
export function expiryAfter(from: Date, months: number | null | undefined): string | null {
  if (!months || months <= 0) return null;
  const d = new Date(from.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  // 31 janvier + 1 mois → 28/29 février, pas 3 mars.
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString();
}

/** Métadonnées posées sur la session Checkout d'un pack (relues au crédit, jamais recalculées). */
export function creditMetadata(guildId: string, userId: string, ref: string, pack: any) {
  return {
    kind: CREDITS_KIND,
    guild_id: guildId,
    user_id: userId,
    account_ref: ref,
    pack_code: pack.code,
    credits: String(pack.credits),
    valid_months: pack.valid_months ? String(pack.valid_months) : "",
  };
}

/**
 * Crédite l'achat décrit par une session Checkout payée (mode « payment »).
 * Retourne l'achat, ou null si la session ne concerne pas un pack de cette guilde / de ce compte,
 * ou n'est pas encore payée.
 */
export async function grantCreditsFromSession(admin: any, ref: string, session: any) {
  const meta = session?.metadata ?? {};
  if (meta.kind !== CREDITS_KIND || session.mode !== "payment") return null;
  if (!meta.guild_id || !meta.user_id || !meta.pack_code) return null;
  if (session.payment_status !== "paid") return null;
  const credits = Number(meta.credits);
  if (!Number.isInteger(credits) || credits <= 0 || credits > 100000) return null;

  const { data: guild } = await admin
    .from("guilds")
    .select("id, stripe_account_ref")
    .eq("id", meta.guild_id)
    .maybeSingle();
  if (!guild || guild.stripe_account_ref !== ref) return null;

  const now = new Date();
  const row = {
    guild_id: guild.id,
    user_id: meta.user_id,
    pack_code: meta.pack_code,
    credits,
    credits_remaining: credits,
    amount_cents: session.amount_total ?? null,
    currency: session.currency ?? null,
    stripe_session_id: session.id,
    stripe_payment_intent_id:
      typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null,
    purchased_at: now.toISOString(),
    expires_at: expiryAfter(now, Number(meta.valid_months) || null),
  };
  // Webhook et page de retour peuvent arriver tous les deux : le second ne change rien.
  const { error } = await admin
    .from("guild_credit_purchases")
    .upsert(row, { onConflict: "stripe_session_id", ignoreDuplicates: true });
  if (error) throw new Error(`credit purchase: ${error.message ?? error.code}`);
  const { data: saved } = await admin
    .from("guild_credit_purchases")
    .select("*")
    .eq("stripe_session_id", session.id)
    .maybeSingle();
  return saved ?? row;
}
