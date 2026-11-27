// @ts-nocheck — comme guild-euro-checkout : le SDK Stripe chargé depuis esm.sh n'est pas typé dans la vérification de prévisualisation.
// « Gérer ma cotisation » : ouvre le portail client Stripe sur le compte de la guilde,
// pour changer de carte, voir ses factures ou arrêter le renouvellement.
// Les changements reviennent par guild-euro-webhook (customer.subscription.updated / deleted).
// Prérequis côté Stripe : le portail client doit avoir été enregistré une fois dans le compte
// de la guilde (Paramètres → Facturation → Portail client), en mode test et en mode réel.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const log = (step: string, details?: unknown) =>
  console.log(`[GUILD-EURO-PORTAL] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`);

/** Même règle que guild-euro-checkout : n'accepte une adresse de retour que si son origine est autorisée. */
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
    const { data: userData } = await anon.auth.getUser((req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, ""));
    const user = userData?.user;
    if (!user) return fail("Not authenticated", 401);

    const body = await req.json().catch(() => ({}));
    const guildId = typeof body?.guild_id === "string" ? body.guild_id : null;
    if (!guildId || !/^[0-9a-f-]{36}$/i.test(guildId)) return fail("Invalid guild_id");

    const [{ data: guild }, { data: membership }] = await Promise.all([
      admin.from("guilds").select("id, stripe_account_ref").eq("id", guildId).maybeSingle(),
      admin.from("user_guild_memberships").select("stripe_customer_id").eq("guild_id", guildId).eq("user_id", user.id).maybeSingle(),
    ]);
    if (!guild?.stripe_account_ref) return fail("This guild does not accept membership payments in euros.");
    // Seul le payeur a un client Stripe : un bénéficiaire de code n'a rien à gérer ici.
    if (!membership?.stripe_customer_id) return fail("No membership payment to manage.", 404);

    const secret = Deno.env.get(`STRIPE_SECRET_KEY_${guild.stripe_account_ref}`);
    if (!secret) return fail("Payments are not configured for this guild yet.", 503);

    const siteUrl = (Deno.env.get("SITE_URL") ?? "https://changethegame.xyz").replace(/\/$/, "");
    const stripe = new Stripe(secret, { apiVersion: "2025-08-27.basil" });
    try {
      const portal = await stripe.billingPortal.sessions.create({
        customer: membership.stripe_customer_id,
        return_url: returnUrl(body?.return_url, `${siteUrl}/guilds/${guildId}`),
        locale: "fr",
      });
      return json({ url: portal.url });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log("Portal error", { guildId, msg });
      if (/configuration/i.test(msg)) {
        return fail("The guild has not activated the Stripe customer portal yet.", 503);
      }
      throw e;
    }
  } catch (error) {
    log("ERROR", { msg: error instanceof Error ? error.message : String(error) });
    return fail("Could not open the payment settings. Please try again.", 500);
  }
});
