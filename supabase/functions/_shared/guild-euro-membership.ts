// @ts-nocheck — partagé par guild-euro-webhook et guild-euro-confirm.
// Active (ou prolonge) une adhésion de guilde payée en euros à partir d'un abonnement Stripe.
// Idempotent : rejouer la même activation ne change rien de plus.

const BADGE_LABELS: Record<string, string> = {
  adherent: "Adhérent",
  actif: "Actif",
  effectif: "Effectif",
  equipe: "Équipe",
  administrateur: "Administrateur",
};

/** Fin de période d'un abonnement (champ déplacé sur les lignes dans les versions récentes de l'API). */
export function periodEnd(sub: any): string | null {
  const ts = sub?.current_period_end ?? sub?.items?.data?.[0]?.current_period_end;
  return typeof ts === "number" ? new Date(ts * 1000).toISOString() : null;
}

/** Vérifie que la guilde citée dans les métadonnées utilise bien ce compte Stripe. */
export async function guildForMetadata(admin: any, ref: string, meta: any) {
  if (meta?.kind !== "guild_membership" || !meta.guild_id || !meta.user_id) return null;
  const { data: guild } = await admin
    .from("guilds")
    .select("id, name, stripe_account_ref, created_by_user_id")
    .eq("id", meta.guild_id)
    .maybeSingle();
  if (!guild || guild.stripe_account_ref !== ref) return null;
  return guild;
}

async function grantBadges(admin: any, guildId: string, userId: string, planCode: string, expiresAt: string | null) {
  const { data: plan } = await admin
    .from("guild_membership_plans")
    .select("badge_codes")
    .eq("guild_id", guildId)
    .eq("code", planCode)
    .maybeSingle();
  for (const code of plan?.badge_codes ?? []) {
    let { data: role } = await admin
      .from("entity_roles")
      .select("id")
      .eq("entity_type", "guild")
      .eq("entity_id", guildId)
      .eq("code", code)
      .maybeSingle();
    if (!role) {
      const created = await admin
        .from("entity_roles")
        .insert({ entity_type: "guild", entity_id: guildId, code, name: BADGE_LABELS[code] ?? code })
        .select("id")
        .single();
      role = created.data;
    }
    if (!role) continue;
    await admin
      .from("entity_member_roles")
      .upsert({ entity_role_id: role.id, user_id: userId, expires_at: expiresAt }, { onConflict: "entity_role_id,user_id" });
  }
}

/**
 * Active l'adhésion décrite par un abonnement Stripe.
 * Retourne la date de fin de période, ou null si l'abonnement ne concerne pas une guilde de ce compte.
 */
export async function activateFromSubscription(
  admin: any,
  ref: string,
  sub: any,
  amountCents: number | null,
  currency: string | null,
  notify = true,
): Promise<{ guild_id: string; user_id: string; current_period_end: string | null } | null> {
  const meta = sub?.metadata ?? {};
  const guild = await guildForMetadata(admin, ref, meta);
  if (!guild) return null;
  const end = periodEnd(sub);
  const now = new Date().toISOString();

  const { data: existing } = await admin
    .from("user_guild_memberships")
    .select("joined_at, last_payment_at, stripe_subscription_id, current_period_end")
    .eq("user_id", meta.user_id)
    .eq("guild_id", guild.id)
    .maybeSingle();

  // Déjà activé pour cette période (webhook et confirmation peuvent arriver tous les deux).
  const alreadyDone =
    existing?.stripe_subscription_id === sub.id && existing?.current_period_end === end;

  await admin.from("user_guild_memberships").upsert(
    {
      user_id: meta.user_id,
      guild_id: guild.id,
      role: "member",
      status: "active",
      joined_at: existing?.joined_at ?? now,
      membership_expires_at: end,
      current_period_end: end,
      cancel_at_period_end: Boolean(sub.cancel_at_period_end),
      last_payment_at: alreadyDone ? existing.last_payment_at : now,
      plan_code: meta.plan_code ?? null,
      payer_user_id: meta.user_id,
      stripe_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null,
      stripe_subscription_id: sub.id,
      amount_paid_cents: amountCents,
      currency,
    },
    { onConflict: "user_id,guild_id" },
  );

  await admin
    .from("guild_members")
    .insert({ guild_id: guild.id, user_id: meta.user_id, role: "MEMBER" })
    .then(() => undefined, () => undefined);

  if (meta.plan_code) await grantBadges(admin, guild.id, meta.user_id, meta.plan_code, end);

  if (notify && !alreadyDone) {
    const { data: admins } = await admin
      .from("guild_members")
      .select("user_id")
      .eq("guild_id", guild.id)
      .eq("role", "ADMIN");
    const ids = new Set<string>((admins ?? []).map((a: { user_id: string }) => a.user_id));
    if (guild.created_by_user_id) ids.add(guild.created_by_user_id);
    if (ids.size) {
      await admin.from("notifications").insert(
        [...ids].map((uid) => ({
          user_id: uid,
          type: "GUILD_MEMBERSHIP_PAYMENT",
          title: "Cotisation reçue",
          body: `Une cotisation (${meta.plan_code ?? "formule"}) a été payée pour ${guild.name}.`,
          related_entity_type: "guild",
          related_entity_id: guild.id,
          deep_link_url: `/guilds/${guild.id}`,
        })),
      );
    }
  }
  return { guild_id: guild.id, user_id: meta.user_id, current_period_end: end };
}
