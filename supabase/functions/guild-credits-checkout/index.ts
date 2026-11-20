// @ts-nocheck — comme stripe-webhook : le SDK Stripe chargé depuis esm.sh n'est pas typé dans la vérification de prévisualisation.
// Achat d'un pack de questions (bibliothèque) : session Stripe Checkout en paiement unique,
// sur le compte Stripe propre à la guilde (secret STRIPE_SECRET_KEY_<ref>), comme les cotisations.
// Le prix et le nombre de questions viennent toujours du pack enregistré : le navigateur ne fixe rien.
// Le crédit est posé par guild-euro-webhook (checkout.session.completed) ou guild-euro-confirm
// au retour de Stripe.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { creditMetadata } from "../_shared/guild-credits.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const log = (step: string, details?: unknown) =>
  console.log(`[GUILD-CREDITS-CHECKOUT] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`);

const MAX_AMOUNT_CENTS = 100_000; // 1 000 € : garde-fou contre un pack mal saisi

/** N'accepte une adresse de retour que si son origine est autorisée (même règle que guild-euro-checkout). */
function returnUrl(requested: unknown, fallback: string): string {
  const allowed = (Deno.env.get("GUILD_CHECKOUT_RETURN_ORIGINS") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const suffixes = (Deno.env.get("GUILD_CHECKOUT_RETURN_SUFFIXES") ?? ".lovableproject.com,.lovable.app")
    .split(",").map((s) => s.trim()).filter(Boolean);
  if (typeof requested === "string") {
    try {
      const u = new URL(requested);
      const suffixOk = u.protocol === "https:" && suffixes.some((s) => s.startsWith(".") && u.hostname.endsWith(s));
      if (allowed.includes(u.origin) || suffixOk) return u.toString();
    } catch {
      /* adresse invalide : adresse par défaut */
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
    const packCode = typeof body?.pack_code === "string" ? body.pack_code : null;
    if (!guildId || !/^[0-9a-f-]{36}$/i.test(guildId)) return fail("Invalid guild_id");
    if (!packCode || !/^[a-z0-9_]{1,60}$/.test(packCode)) return fail("Invalid pack_code");

    const { data: guild } = await admin
      .from("guilds")
      .select("id, name, euro_membership_enabled, stripe_account_ref")
      .eq("id", guildId)
      .maybeSingle();
    if (!guild) return fail("Guild not found", 404);
    // Même interrupteur que les cotisations : paiement en euros fermé = packs fermés aussi.
    if (!guild.euro_membership_enabled || !guild.stripe_account_ref) {
      return fail("This guild does not accept payments in euros.");
    }
    const secretKey = Deno.env.get(`STRIPE_SECRET_KEY_${guild.stripe_account_ref}`);
    if (!secretKey) return fail("Payments are not configured for this guild yet.", 503);

    // Réservé aux membres de la guilde.
    const { data: member } = await admin
      .from("guild_members")
      .select("user_id")
      .eq("guild_id", guildId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!member) return fail("Only guild members can buy question packs.", 403);

    const { data: pack } = await admin
      .from("guild_credit_packs")
      .select("*")
      .eq("guild_id", guildId)
      .eq("code", packCode)
      .eq("active", true)
      .maybeSingle();
    if (!pack) return fail("Pack not found", 404);
    if (pack.amount_cents <= 0 || pack.amount_cents > MAX_AMOUNT_CENTS) return fail("Pack amount is not valid; contact the guild.");

    const { data: membership } = await admin
      .from("user_guild_memberships")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .eq("guild_id", guildId)
      .maybeSingle();

    const siteUrl = (Deno.env.get("SITE_URL") ?? "https://changethegame.xyz").replace(/\/$/, "");
    const back = returnUrl(body?.return_url, `${siteUrl}/guilds/${guildId}`);
    const withParam = (u: string, v: string) => {
      const x = new URL(u);
      x.searchParams.set("pack", v);
      return x.toString();
    };
    const metadata = creditMetadata(guildId, user.id, guild.stripe_account_ref, pack);

    const stripe = new Stripe(secretKey, { apiVersion: "2025-08-27.basil" });
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      ...(membership?.stripe_customer_id ? { customer: membership.stripe_customer_id } : { customer_email: user.email }),
      client_reference_id: user.id,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: pack.currency,
            unit_amount: pack.amount_cents,
            product_data: {
              name: `${pack.label} – ${guild.name}`,
              ...(pack.description ? { description: String(pack.description).slice(0, 300) } : {}),
            },
          },
        },
      ],
      metadata,
      payment_intent_data: { metadata },
      success_url: `${withParam(back, "ok")}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: withParam(back, "annule"),
      locale: "fr",
    });

    log("Session created", { guildId, packCode, amount: pack.amount_cents, userId: user.id });
    return json({ url: session.url, amount_cents: pack.amount_cents, currency: pack.currency });
  } catch (error) {
    log("ERROR", { msg: error instanceof Error ? error.message : String(error) });
    return fail("Payment could not be started. Please try again.", 500);
  }
});
