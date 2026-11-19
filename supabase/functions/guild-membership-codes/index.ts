// Codes d'adhésion achetés par la personne connectée pour une guilde (places payées pour d'autres).
//
//   GET /functions/v1/guild-membership-codes?guild_id=<uuid>
//   Authorization: Bearer <jeton de la personne>
//
// Ne renvoie que les codes dont la personne est le payeur. Pour un code utilisé, on indique
// seulement la date d'utilisation, pas qui l'a utilisé.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const anon = createClient(url, Deno.env.get("SUPABASE_ANON_KEY") ?? "", { auth: { persistSession: false } });
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });

  try {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Not authenticated" }, 401);
    const { data: userData, error: authError } = await anon.auth.getUser(token);
    if (authError || !userData.user) return json({ error: "Not authenticated" }, 401);

    const guildId = new URL(req.url).searchParams.get("guild_id") ?? "";
    if (!/^[0-9a-f-]{36}$/i.test(guildId)) return json({ error: "Invalid guild_id" }, 400);

    const { data, error } = await admin
      .from("guild_membership_codes")
      .select("code, slot, position, plan_code, valid_until, redeemed_at, revoked_at, created_at")
      .eq("guild_id", guildId)
      .eq("payer_user_id", userData.user.id)
      .is("revoked_at", null)
      .order("created_at", { ascending: true })
      .order("slot", { ascending: true })
      .order("position", { ascending: true });
    if (error) throw error;

    return json({
      codes: (data ?? []).map((c) => ({
        code: c.code,
        slot: c.slot,
        plan_code: c.plan_code,
        valid_until: c.valid_until,
        used: Boolean(c.redeemed_at),
        used_at: c.redeemed_at,
      })),
    });
  } catch (error) {
    console.log(`[GUILD-MEMBERSHIP-CODES] ERROR - ${error instanceof Error ? error.message : String(error)}`);
    return json({ error: "Codes unavailable" }, 500);
  }
});
