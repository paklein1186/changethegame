// Utiliser un code d'adhésion : une organisation ou un GAL a payé une place,
// la personne connectée active ici sa propre adhésion à la guilde.
//
//   POST /functions/v1/guild-membership-redeem   { "code": "ABCD-EFGH-JKMN" }
//   Authorization: Bearer <jeton de la personne>   (jeton OAuth ou de session)
//
// Réponses : 200 { ok: true, guild_id, plan_code, current_period_end }
//            400/409 { ok: false, reason: invalid | used | expired | already_member | own_code }
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { redeemCode } from "../_shared/guild-euro-membership.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const anon = createClient(url, Deno.env.get("SUPABASE_ANON_KEY") ?? "", { auth: { persistSession: false } });
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });

  try {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Not authenticated" }, 401);
    const { data: userData, error: authError } = await anon.auth.getUser(token);
    if (authError || !userData.user) return json({ error: "Not authenticated" }, 401);

    const body = await req.json().catch(() => ({}));
    const result = await redeemCode(admin, userData.user.id, body?.code);
    if (result.ok) {
      console.log(`[GUILD-MEMBERSHIP-REDEEM] redeemed - ${JSON.stringify({ guild: result.guild_id, plan: result.plan_code })}`);
      return json(result);
    }
    return json(result, result.reason === "invalid" ? 400 : 409);
  } catch (error) {
    console.log(`[GUILD-MEMBERSHIP-REDEEM] ERROR - ${error instanceof Error ? error.message : String(error)}`);
    return json({ error: "Code could not be used. Please try again." }, 500);
  }
});
