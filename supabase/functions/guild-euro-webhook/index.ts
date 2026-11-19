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
// Le paiement initial est aussi confirmé par guild-euro-confirm au retour de Stripe :
// les deux chemins sont idempotents.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { activateFromSubscription } from "../_shared/guild-euro-membership.ts";

const log = (step: string, details?: unknown) =>
  console.log(`[GUILD-EURO-WEBHOOK] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`);

const respond = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

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

  const setStatus = (subscriptionId: string, patch: Record<string, unknown>) =>
    admin.from("user_guild_memberships").update(patch).eq("stripe_subscription_id", subscriptionId);

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        if (session.mode !== "subscription" || !session.subscription) break;
        const sub = await stripe.subscriptions.retrieve(
          typeof session.subscription === "string" ? session.subscription : session.subscription.id,
        );
        await activateFromSubscription(admin, ref, sub, session.amount_total ?? null, session.currency ?? null);
        break;
      }
      case "invoice.paid": {
        const invoice = event.data.object;
        const subId = subscriptionIdOf(invoice);
        if (!subId) break;
        const sub = await stripe.subscriptions.retrieve(subId);
        await activateFromSubscription(admin, ref, sub, invoice.amount_paid ?? null, invoice.currency ?? null);
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
    log("ERROR", { type: event.type, msg: err instanceof Error ? err.message : String(err) });
    // Le journal d'idempotence est retiré pour que Stripe puisse réessayer.
    await admin.from("stripe_guild_events").delete().eq("event_id", event.id);
    return respond({ error: "Processing failed" }, 500);
  }
});
