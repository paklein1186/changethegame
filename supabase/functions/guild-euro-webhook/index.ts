// @ts-nocheck — comme stripe-webhook : le SDK Stripe chargé depuis esm.sh n'est pas typé dans la vérification de prévisualisation.
// Webhook Stripe des cotisations de guilde en euros.
// Adresse à déclarer dans le compte Stripe de la guilde :
//   https://<projet>.supabase.co/functions/v1/guild-euro-webhook?account=<ref>
// Secrets : STRIPE_SECRET_KEY_<ref> et STRIPE_WEBHOOK_SECRET_<ref> (ex. ref = GUILD).
//
// Effets :
//   - paiement initial ou renouvellement payé → adhésion active jusqu'à la fin de période,
//     badges de la formule (ex. « adherent ») attribués avec la même date d'expiration ;
//   - échec de paiement → statut past_due ; abonnement supprimé → statut canceled ;
//   - arrêt du renouvellement demandé dans Stripe → cancel_at_period_end.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const log = (step: string, details?: unknown) =>
  console.log(`[GUILD-EURO-WEBHOOK] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`);

const BADGE_LABELS: Record<string, string> = {
  adherent: "Adhérent",
  actif: "Actif",
  effectif: "Effectif",
  equipe: "Équipe",
  administrateur: "Administrateur",
};

const respond = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** Fin de période d'un abonnement (champ déplacé sur les lignes dans les versions récentes de l'API). */
function periodEnd(sub: any): string | null {
  const ts = sub?.current_period_end ?? sub?.items?.data?.[0]?.current_period_end;
  return typeof ts === "number" ? new Date(ts * 1000).toISOString() : null;
}

function subscriptionIdOf(invoice: any): string | null {
  const s = invoice?.parent?.subscription_details?.subscription ?? invoice?.subscription;
  return typeof s === "string" ? s : s?.id ?? null;
}

serve(async (req) => {
  if (req.method !== "POST") return respond({ error: "Method not allowed" }, 405);

  const ref = new URL(req.url).searchParams.get("account") ?? "";
  if (!/^[A-Z0-9_]{1,40}$/.test(ref)) return respond({ error: "Unknown account" }, 400);
  const secretKey = Deno.env.get(`STRIPE_SECRET_KEY_${ref}`);
  const webhookSecret = Deno.env.get(`STRIPE_WEBHOOK_SECRET_${ref}`);
  if (!secretKey || !webhookSecret) {
    log("Missing secrets", { ref });
    return respond({ error: "Account not configured" }, 500);
  }

  const stripe = new Stripe(secretKey, { apiVersion: "2025-08-27.basil" });
  const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
    auth: { persistSession: false },
  });

  const sig = req.headers.get("stripe-signature");
  if (!sig) return respond({ error: "No signature" }, 401);
  const raw = await req.text();

  let event: any;
  try {
    // Dans Deno, la vérification de signature doit passer par la version asynchrone.
    event = await stripe.webhooks.constructEventAsync(raw, sig, webhookSecret, undefined, Stripe.createSubtleCryptoProvider());
  } catch (err) {
    log("Invalid signature", { ref, err: err instanceof Error ? err.message : String(err) });
    return respond({ error: "Invalid signature" }, 401);
  }

  // Stripe peut renvoyer un même événement : on ne le traite qu'une fois.
  const { error: dupError } = await admin
    .from("stripe_guild_events")
    .insert({ event_id: event.id, account_ref: ref, type: event.type });
  if (dupError) {
    if (dupError.code === "23505") return respond({ received: true, duplicate: true });
    log("Event log failed", { msg: dupError.message });
    return respond({ error: "Storage error" }, 500);
  }

  /** Vérifie que la guilde citée dans les métadonnées utilise bien ce compte Stripe. */
  async function guildFor(meta: any) {
    if (meta?.kind !== "guild_membership" || !meta.guild_id || !meta.user_id) return null;
    const { data: guild } = await admin
      .from("guilds")
      .select("id, name, stripe_account_ref, created_by_user_id")
      .eq("id", meta.guild_id)
      .maybeSingle();
    if (!guild || guild.stripe_account_ref !== ref) {
      log("Guild/account mismatch", { guild: meta.guild_id, ref });
      return null;
    }
    return guild;
  }

  async function grantBadges(guildId: string, userId: string, planCode: string, expiresAt: string | null) {
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

  async function activate(sub: any, amountCents: number | null, currency: string | null) {
    const meta = sub?.metadata ?? {};
    const guild = await guildFor(meta);
    if (!guild) return;
    const end = periodEnd(sub);
    const now = new Date().toISOString();

    const { data: existing } = await admin
      .from("user_guild_memberships")
      .select("joined_at")
      .eq("user_id", meta.user_id)
      .eq("guild_id", guild.id)
      .maybeSingle();

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
        last_payment_at: now,
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

    if (meta.plan_code) await grantBadges(guild.id, meta.user_id, meta.plan_code, end);

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
    log("Membership active", { guild: guild.id, user: meta.user_id, until: end });
  }

  async function setStatus(subscriptionId: string, patch: Record<string, unknown>) {
    await admin.from("user_guild_memberships").update(patch).eq("stripe_subscription_id", subscriptionId);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        if (session.mode !== "subscription" || !session.subscription) break;
        const sub = await stripe.subscriptions.retrieve(
          typeof session.subscription === "string" ? session.subscription : session.subscription.id,
        );
        await activate(sub, session.amount_total ?? null, session.currency ?? null);
        break;
      }
      case "invoice.paid": {
        const invoice = event.data.object;
        const subId = subscriptionIdOf(invoice);
        if (!subId) break;
        const sub = await stripe.subscriptions.retrieve(subId);
        await activate(sub, invoice.amount_paid ?? null, invoice.currency ?? null);
        break;
      }
      case "invoice.payment_failed": {
        const subId = subscriptionIdOf(event.data.object);
        if (subId) await setStatus(subId, { status: "past_due" });
        break;
      }
      case "customer.subscription.updated": {
        const sub = event.data.object;
        await setStatus(sub.id, { cancel_at_period_end: Boolean(sub.cancel_at_period_end) });
        break;
      }
      case "customer.subscription.deleted": {
        await setStatus(event.data.object.id, { status: "canceled" });
        break;
      }
      default:
        break;
    }
    return respond({ received: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log("ERROR", { type: event.type, msg });
    // Le journal d'idempotence est retiré pour que Stripe puisse réessayer.
    await admin.from("stripe_guild_events").delete().eq("event_id", event.id);
    return respond({ error: "Processing failed" }, 500);
  }
});
