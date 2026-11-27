// @ts-nocheck — partagé par guild-euro-webhook et guild-euro-confirm.
// Active (ou prolonge) une adhésion de guilde payée en euros à partir d'un abonnement Stripe.
// Idempotent : rejouer la même activation ne change rien de plus.

const BADGE_LABELS: Record<string, string> = {
  observateur: "Observateur",
  citoyen_soutenant: "Citoyen soutenant",
  membre_sympathisant: "Membre sympathisant",
  membre_lieu: "Membre lieu",
  accompagnant: "Accompagnant",
  allie: "Allié",
  partenaire_territorial: "Partenaire territorial",
  actif: "Actif",
  effectif: "Effectif",
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

export async function grantBadges(admin: any, guildId: string, userId: string, planCode: string, expiresAt: string | null) {
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
    .select("joined_at, last_payment_at")
    .eq("user_id", meta.user_id)
    .eq("guild_id", guild.id)
    .maybeSingle();
  // Une ligne par formule : un achat ne touche jamais les autres formules en cours.
  const { data: existingPlan } = meta.plan_code
    ? await admin
        .from("user_guild_plans")
        .select("last_payment_at, stripe_subscription_id, current_period_end")
        .eq("user_id", meta.user_id)
        .eq("guild_id", guild.id)
        .eq("plan_code", meta.plan_code)
        .maybeSingle()
    : { data: null };

  // Déjà activé pour cette période (webhook et confirmation peuvent arriver tous les deux).
  const alreadyDone = existingPlan?.stripe_subscription_id === sub.id && existingPlan?.current_period_end === end;

  // L'adhésion globale reçoit cette formule ; la base crée ou met à jour la ligne de la formule
  // et remet l'adhésion globale sur la formule active la plus haute.
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
      last_payment_at: alreadyDone ? existingPlan.last_payment_at : now,
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

  // Places payées pour d'autres : un code par place, puis prolongation des bénéficiaires.
  await syncCodes(admin, guild.id, meta, sub.id, end);
  await extendBeneficiaries(admin, guild.id, meta.user_id, sub.id, end);

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

// ---------------------------------------------------------------------------
// Codes d'adhésion : un payeur paie des places, chaque bénéficiaire active la sienne.
// ---------------------------------------------------------------------------

export type Slot = "extra_person" | "small_place" | "large_place";

/** Nombre de places payées pour d'autres, lu dans les métadonnées de l'abonnement. */
export function slotsFromMetadata(meta: any): Record<Slot, number> {
  const n = (v: unknown) => {
    const x = Number(v ?? 0);
    return Number.isInteger(x) && x > 0 && x <= 500 ? x : 0;
  };
  return { extra_person: n(meta?.extra_persons), small_place: n(meta?.small_places), large_place: n(meta?.large_places) };
}

// Sans 0/O, 1/I/L : un code se dicte et se recopie sans erreur.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** Code de la forme XXXX-XXXX-XXXX (environ 59 bits de hasard). */
export function newCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const chars = [...bytes].map((b) => ALPHABET[b % ALPHABET.length]);
  return [0, 4, 8].map((i) => chars.slice(i, i + 4).join("")).join("-");
}

/** Remet un code saisi à la main dans sa forme canonique (majuscules, tirets), ou null s'il est invalide. */
export function normalizeCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (clean.length !== 12 || [...clean].some((c) => !ALPHABET.includes(c))) return null;
  return [0, 4, 8].map((i) => clean.slice(i, i + 4)).join("-");
}

/** Formule donnée au bénéficiaire d'une place, d'après la formule du payeur. */
export function beneficiaryPlan(plan: any, slot: Slot): string | null {
  if (slot === "extra_person") return plan?.extra_person_plan_code ?? plan?.code ?? null;
  if (slot === "small_place") return plan?.small_place_plan_code ?? null;
  return plan?.large_place_plan_code ?? null;
}

/**
 * Crée les codes manquants pour un abonnement (idempotent : un code par place et par rang),
 * puis aligne leur date de validité sur la fin de période payée.
 */
export async function syncCodes(admin: any, guildId: string, meta: any, subscriptionId: string, end: string | null) {
  const slots = slotsFromMetadata(meta);
  if (!slots.extra_person && !slots.small_place && !slots.large_place) return;
  const { data: plan } = await admin
    .from("guild_membership_plans")
    .select("code, extra_person_plan_code, small_place_plan_code, large_place_plan_code")
    .eq("guild_id", guildId)
    .eq("code", meta.plan_code)
    .maybeSingle();

  const rows: any[] = [];
  for (const slot of Object.keys(slots) as Slot[]) {
    const planCode = beneficiaryPlan(plan, slot);
    if (!planCode) continue; // formule non prévue pour ce type de place : pas de code
    for (let position = 1; position <= slots[slot]; position++) {
      rows.push({
        guild_id: guildId,
        code: newCode(),
        slot,
        position,
        plan_code: planCode,
        payer_user_id: meta.user_id,
        stripe_subscription_id: subscriptionId,
        valid_until: end,
      });
    }
  }
  if (rows.length) {
    await admin
      .from("guild_membership_codes")
      .upsert(rows, { onConflict: "stripe_subscription_id,slot,position", ignoreDuplicates: true });
  }
  await admin.from("guild_membership_codes").update({ valid_until: end }).eq("stripe_subscription_id", subscriptionId);
}

/** Renouvellement payé : les bénéficiaires restent adhérents jusqu'à la nouvelle fin de période. */
export async function extendBeneficiaries(admin: any, guildId: string, payerId: string, subscriptionId: string, end: string | null) {
  // Formules des bénéficiaires liées à cet abonnement (la base met leur adhésion globale à jour).
  const { data: rows } = await admin
    .from("user_guild_plans")
    .select("user_id, plan_code")
    .eq("guild_id", guildId)
    .eq("stripe_subscription_id", subscriptionId)
    .neq("user_id", payerId);
  for (const r of rows ?? []) {
    await admin
      .from("user_guild_plans")
      .update({ status: "active", current_period_end: end, membership_expires_at: end })
      .eq("guild_id", guildId)
      .eq("user_id", r.user_id)
      .eq("plan_code", r.plan_code)
      .eq("stripe_subscription_id", subscriptionId);
    if (r.plan_code) await grantBadges(admin, guildId, r.user_id, r.plan_code, end);
  }
}

export type RedeemResult =
  | { ok: true; guild_id: string; plan_code: string; current_period_end: string | null }
  | { ok: false; reason: "invalid" | "used" | "expired" | "already_member" | "own_code" };

/**
 * Utilise un code pour la personne connectée : réserve le code (une seule fois), puis active
 * son adhésion, liée à l'abonnement du payeur.
 */
export async function redeemCode(admin: any, userId: string, raw: unknown): Promise<RedeemResult> {
  const code = normalizeCode(raw);
  if (!code) return { ok: false, reason: "invalid" };
  const { data: c } = await admin.from("guild_membership_codes").select("*").eq("code", code).maybeSingle();
  if (!c || c.revoked_at) return { ok: false, reason: "invalid" };

  const done = (): RedeemResult => ({ ok: true, guild_id: c.guild_id, plan_code: c.plan_code, current_period_end: c.valid_until });
  if (c.redeemed_by_user_id === userId) return done(); // déjà utilisé par cette personne : rien à refaire
  if (c.redeemed_by_user_id) return { ok: false, reason: "used" };
  if (c.payer_user_id === userId) return { ok: false, reason: "own_code" };
  if (c.valid_until && new Date(c.valid_until).getTime() <= Date.now()) return { ok: false, reason: "expired" };

  const { data: existing } = await admin
    .from("user_guild_memberships")
    .select("joined_at")
    .eq("guild_id", c.guild_id)
    .eq("user_id", userId)
    .maybeSingle();
  // Refus seulement si cette même formule est déjà payée : les autres formules se cumulent.
  const { data: samePlan } = await admin
    .from("user_guild_plans")
    .select("status, current_period_end, stripe_subscription_id")
    .eq("guild_id", c.guild_id)
    .eq("user_id", userId)
    .eq("plan_code", c.plan_code)
    .maybeSingle();
  const stillPaid =
    samePlan?.stripe_subscription_id &&
    ["active", "grace"].includes(samePlan?.status ?? "") &&
    (!samePlan?.current_period_end || new Date(samePlan.current_period_end).getTime() > Date.now());
  if (stillPaid) return { ok: false, reason: "already_member" };

  // Réservation atomique : seule la première personne qui arrive obtient le code.
  const { data: claimed } = await admin
    .from("guild_membership_codes")
    .update({ redeemed_by_user_id: userId, redeemed_at: new Date().toISOString() })
    .eq("id", c.id)
    .is("redeemed_by_user_id", null)
    .select("id");
  if (!claimed?.length) return { ok: false, reason: "used" };

  await admin.from("user_guild_memberships").upsert(
    {
      user_id: userId,
      guild_id: c.guild_id,
      role: "member",
      status: "active",
      joined_at: existing?.joined_at ?? new Date().toISOString(),
      membership_expires_at: c.valid_until,
      current_period_end: c.valid_until,
      cancel_at_period_end: false,
      last_payment_at: new Date().toISOString(),
      plan_code: c.plan_code,
      payer_user_id: c.payer_user_id,
      stripe_customer_id: null,
      stripe_subscription_id: c.stripe_subscription_id,
      amount_paid_cents: null,
      currency: null,
    },
    { onConflict: "user_id,guild_id" },
  );
  await admin
    .from("guild_members")
    .insert({ guild_id: c.guild_id, user_id: userId, role: "MEMBER" })
    .then(() => undefined, () => undefined);
  await grantBadges(admin, c.guild_id, userId, c.plan_code, c.valid_until);

  await admin.from("notifications").insert({
    user_id: c.payer_user_id,
    type: "GUILD_MEMBERSHIP_CODE_REDEEMED",
    title: "Code d'adhésion utilisé",
    body: `Un de vos codes d'adhésion (${c.plan_code}) vient d'être activé.`,
    related_entity_type: "guild",
    related_entity_id: c.guild_id,
    deep_link_url: `/guilds/${c.guild_id}`,
  }).then(() => undefined, () => undefined);

  return done();
}
