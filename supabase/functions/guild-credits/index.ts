// @ts-nocheck — même convention que les autres fonctions de guilde.
// Packs de questions de la bibliothèque, au nom de la personne connectée (jeton CTG) :
//   { action: "balance", guild_id }            → solde, achats, packs proposés
//   { action: "consume", guild_id, amount, reason } → décompte (après une réponse obtenue)
// Le décompte se fait dans la base (consume_guild_credits) : jamais au-delà du solde.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const log = (step: string, details?: unknown) =>
  console.log(`[GUILD-CREDITS] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`);

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
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const guildId = typeof body?.guild_id === "string" ? body.guild_id : null;
    if (!guildId || !/^[0-9a-f-]{36}$/i.test(guildId)) return fail("Invalid guild_id");

    if (body?.action === "consume") {
      const amount = Number(body?.amount);
      if (!Number.isInteger(amount) || amount < 1 || amount > 10) return fail("Invalid amount");
      const reason = typeof body?.reason === "string" ? body.reason.slice(0, 200) : null;
      const { data, error } = await admin.rpc("consume_guild_credits", {
        p_guild_id: guildId, p_user_id: userId, p_amount: amount, p_reason: reason,
      });
      if (error) throw new Error(error.message);
      if (data === null) return json({ ok: false, reason: "insufficient" }, 409);
      return json({ ok: true, balance: data });
    }

    if (body?.action !== "balance") return fail("Unknown action");
    const [{ data: balance, error: e1 }, { data: purchases }, { data: packs }, { data: guild }] = await Promise.all([
      admin.rpc("guild_credit_balance", { p_guild_id: guildId, p_user_id: userId }),
      admin
        .from("guild_credit_purchases")
        .select("pack_code, credits, credits_remaining, amount_cents, currency, purchased_at, expires_at")
        .eq("guild_id", guildId)
        .eq("user_id", userId)
        .order("purchased_at", { ascending: false }),
      admin
        .from("guild_credit_packs")
        .select("code, label, description, credits, amount_cents, currency, valid_months, sort_order")
        .eq("guild_id", guildId)
        .eq("active", true)
        .order("sort_order", { ascending: true }),
      admin.from("guilds").select("euro_membership_enabled, stripe_account_ref").eq("id", guildId).maybeSingle(),
    ]);
    if (e1) throw new Error(e1.message);
    return json({
      balance: balance ?? 0,
      purchases: purchases ?? [],
      packs: packs ?? [],
      // Les packs ne s'achètent que si le paiement en euros de la guilde est ouvert.
      purchasable: Boolean(guild?.euro_membership_enabled && guild?.stripe_account_ref),
    });
  } catch (error) {
    log("ERROR", { msg: error instanceof Error ? error.message : String(error) });
    return fail("Request failed. Please try again.", 500);
  }
});
