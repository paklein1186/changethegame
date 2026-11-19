// @ts-nocheck — comme stripe-webhook : le SDK Stripe chargé depuis esm.sh n'est pas typé dans la vérification de prévisualisation.
// Cotisation de guilde en euros : crée une session Stripe Checkout (abonnement)
// sur le compte Stripe propre à la guilde (secret STRIPE_SECRET_KEY_<ref>).
// Le montant est toujours recalculé ici, à partir de la formule enregistrée :
// le navigateur ne fixe jamais le prix.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const log = (step: string, details?: unknown) =>
  console.log(`[GUILD-EURO-CHECKOUT] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`);

const MAX_QUANTITY = 500;
const MAX_AMOUNT_CENTS = 1_000_000; // 10 000 € : garde-fou contre une formule mal saisie

function quantity(value: unknown): number {
  const n = Number(value ?? 0);
  if (!Number.isInteger(n) || n < 0 || n > MAX_QUANTITY) throw new Error("Invalid quantity");
  return n;
}

/** N'accepte une adresse de retour que si son origine est autorisée. */
function returnUrl(requested: unknown, fallback: string): string {
  const allowed = (Deno.env.get("GUILD_CHECKOUT_RETURN_ORIGINS") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (typeof requested === "string") {
    try {
      const u = new URL(requested);
      if (allowed.includes(u.origin)) return u.toString();
    } catch {
      /* adresse invalide : on garde l'adresse par défaut */
    }
  }
  return fallback;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  const fail = (message: string, status = 400) => json({ error: message }, status);

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const anon = createClient(url, Deno.env.get("SUPABASE_ANON_KEY") ?? "", { auth: { persistSession: false } });
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return fail("Not authenticated", 401);
    const { data: userData, error: authError } = await anon.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !userData.user?.email) return fail("Not authenticated", 401);
    const user = userData.user;

    const body = await req.json().catch(() => ({}));
    const guildId = typeof body?.guild_id === "string" ? body.guild_id : null;
    const planCode = typeof body?.plan_code === "string" ? body.plan_code : null;
    if (!guildId || !/^[0-9a-f-]{36}$/i.test(guildId)) return fail("Invalid guild_id");
    if (!planCode || !/^[a-z0-9_]{1,60}$/.test(planCode)) return fail("Invalid plan_code");

    let extraPersons = 0, smallPlaces = 0, largePlaces = 0;
    try {
      extraPersons = quantity(body?.extra_persons);
      smallPlaces = quantity(body?.small_places);
      largePlaces = quantity(body?.large_places);
    } catch {
      return fail(`Quantities must be whole numbers between 0 and ${MAX_QUANTITY}.`);
    }

    const { data: guild } = await admin
      .from("guilds")
      .select("id, name, euro_membership_enabled, stripe_account_ref, requires_application_before_payment, join_policy")
      .eq("id", guildId)
      .maybeSingle();
    if (!guild) return fail("Guild not found", 404);
    if (!guild.euro_membership_enabled || !guild.stripe_account_ref) {
      return fail("This guild does not accept membership payments in euros.");
    }

    const secretKey = Deno.env.get(`STRIPE_SECRET_KEY_${guild.stripe_account_ref}`);
    if (!secretKey) {
      log("Missing Stripe secret", { ref: guild.stripe_account_ref });
      return fail("Payments are not configured for this guild yet.", 503);
    }

    // Même règle que le paiement en Coins : si la guilde filtre les entrées, il faut une candidature acceptée.
    if (guild.requires_application_before_payment || guild.join_policy === "APPROVAL_REQUIRED") {
      const { data: app } = await admin
        .from("guild_applications")
        .select("status")
        .eq("guild_id", guildId)
        .eq("applicant_user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!app) return fail("You need to apply to this guild first.", 403);
      if (app.status !== "APPROVED") return fail("Your application has not been approved yet.", 403);
    }

    const { data: plan } = await admin
      .from("guild_membership_plans")
      .select("*")
      .eq("guild_id", guildId)
      .eq("code", planCode)
      .eq("active", true)
      .maybeSingle();
    if (!plan) return fail("Membership plan not found", 404);

    const amount =
      plan.base_amount_cents +
      plan.per_extra_person_cents * extraPersons +
      plan.per_small_place_cents * smallPlaces +
      plan.per_large_place_cents * largePlaces;
    if (amount <= 0) return fail("This plan has no amount to pay.");
    if (amount > MAX_AMOUNT_CENTS) return fail("Amount exceeds the allowed maximum; contact the guild.");

    const { data: membership } = await admin
      .from("user_guild_memberships")
      .select("stripe_customer_id, status, current_period_end")
      .eq("user_id", user.id)
      .eq("guild_id", guildId)
      .maybeSingle();

    const siteUrl = (Deno.env.get("SITE_URL") ?? "https://changethegame.xyz").replace(/\/$/, "");
    const back = returnUrl(body?.return_url, `${siteUrl}/guilds/${guildId}`);
    const withParam = (u: string, v: string) => {
      const x = new URL(u);
      x.searchParams.set("adhesion", v);
      return x.toString();
    };

    const metadata = {
      kind: "guild_membership",
      guild_id: guildId,
      user_id: user.id,
      plan_code: planCode,
      account_ref: guild.stripe_account_ref,
      extra_persons: String(extraPersons),
      small_places: String(smallPlaces),
      large_places: String(largePlaces),
    };

    const stripe = new Stripe(secretKey, { apiVersion: "2025-08-27.basil" });
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      ...(membership?.stripe_customer_id
        ? { customer: membership.stripe_customer_id }
        : { customer_email: user.email }),
      client_reference_id: user.id,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: plan.currency,
            unit_amount: amount,
            recurring: { interval: plan.billing_interval },
            product_data: { name: `${plan.label} – ${guild.name}` },
          },
        },
      ],
      metadata,
      subscription_data: { metadata },
      success_url: withParam(back, "ok"),
      cancel_url: withParam(back, "annulee"),
      locale: "fr",
    });

    log("Session created", { guildId, planCode, amount, userId: user.id });
    return json({ url: session.url, amount_cents: amount, currency: plan.currency });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log("ERROR", { msg });
    return fail("Payment could not be started. Please try again.", 500);
  }
});
