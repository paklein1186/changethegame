// @ts-nocheck — comme stripe-webhook : le SDK Stripe chargé depuis esm.sh n'est pas typé dans la vérification de prévisualisation.
// Confirmation d'une cotisation en euros au retour de Stripe, sans attendre le webhook.
// La page de retour reçoit ?session_id=… ; elle appelle cette fonction avec ce numéro.
// La fonction relit la session directement chez Stripe (la seule source fiable) et active
// l'adhésion si le paiement est confirmé. Utile quand le webhook ne peut pas joindre le
// serveur (environnement de test protégé) et comme filet de sécurité en production.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { activateFromSubscription } from "../_shared/guild-euro-membership.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const log = (step: string, details?: unknown) =>
  console.log(`[GUILD-EURO-CONFIRM] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`);

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
    if (authError || !userData.user) return fail("Not authenticated", 401);

    const body = await req.json().catch(() => ({}));
    const guildId = typeof body?.guild_id === "string" ? body.guild_id : null;
    const sessionId = typeof body?.session_id === "string" ? body.session_id : null;
    if (!guildId || !/^[0-9a-f-]{36}$/i.test(guildId)) return fail("Invalid guild_id");
    if (!sessionId || !/^cs_[A-Za-z0-9_]{10,200}$/.test(sessionId)) return fail("Invalid session_id");

    const { data: guild } = await admin
      .from("guilds")
      .select("id, stripe_account_ref, euro_membership_enabled")
      .eq("id", guildId)
      .maybeSingle();
    if (!guild?.euro_membership_enabled || !guild.stripe_account_ref) return fail("Guild not configured", 404);
    const secretKey = Deno.env.get(`STRIPE_SECRET_KEY_${guild.stripe_account_ref}`);
    if (!secretKey) return fail("Payments are not configured for this guild yet.", 503);

    const stripe = new Stripe(secretKey, { apiVersion: "2025-08-27.basil" });
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    // La session doit appartenir à cette personne et à cette guilde.
    if (session.metadata?.user_id !== userData.user.id || session.metadata?.guild_id !== guildId) {
      return fail("This payment does not belong to you.", 403);
    }
    if (session.status !== "complete" || !["paid", "no_payment_required"].includes(session.payment_status)) {
      return json({ ok: false, pending: true, status: session.status, payment_status: session.payment_status });
    }
    if (!session.subscription) return fail("No subscription on this payment.");

    const sub = await stripe.subscriptions.retrieve(
      typeof session.subscription === "string" ? session.subscription : session.subscription.id,
    );
    const result = await activateFromSubscription(
      admin, guild.stripe_account_ref, sub, session.amount_total ?? null, session.currency ?? null,
    );
    if (!result) return fail("This payment could not be matched to the guild.", 409);

    log("Confirmed", { guildId, userId: userData.user.id, until: result.current_period_end });
    return json({ ok: true, current_period_end: result.current_period_end });
  } catch (error) {
    log("ERROR", { msg: error instanceof Error ? error.message : String(error) });
    return fail("Payment could not be confirmed. Please try again.", 500);
  }
});
