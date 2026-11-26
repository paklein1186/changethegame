// Quêtes d'une guilde pour un site partenaire (ex. troistiers.space, étape A5 du palier 1).
//
//   GET /functions/v1/guild-quests?guild_id=<uuid>
//   Authorization: Bearer <jeton de la personne>   (facultatif)
//
// Sans jeton : quêtes publiques de la guilde, champs de présentation seulement.
// Avec le jeton d'un·e admin de la guilde : toutes les quêtes non supprimées (brouillons compris) et leurs
// réglages de visibilité. Règles et champs : _shared/guild-quests.ts.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { guildQuests, isGuildAdmin } from "../_shared/guild-quests.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};
const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json", ...extra } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const anon = createClient(url, Deno.env.get("SUPABASE_ANON_KEY") ?? "", { auth: { persistSession: false } });
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });

  try {
    const guildId = new URL(req.url).searchParams.get("guild_id") ?? "";
    if (!/^[0-9a-f-]{36}$/i.test(guildId)) return json({ error: "Invalid guild_id" }, 400);
    const { data: guild } = await admin.from("guilds").select("id").eq("id", guildId).eq("is_deleted", false).maybeSingle();
    if (!guild) return json({ error: "Guild not found" }, 404);

    // Un jeton invalide ne donne pas d'erreur : on répond en mode public.
    let asAdmin = false;
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (token) {
      const { data } = await anon.auth.getUser(token);
      if (data?.user) asAdmin = await isGuildAdmin(admin, guildId, data.user.id);
    }

    const quests = await guildQuests(admin, guildId, asAdmin);
    return json(
      { guild_id: guildId, mode: asAdmin ? "admin" : "public", quests, generated_at: new Date().toISOString() },
      200,
      { "Cache-Control": asAdmin ? "private, no-store" : "public, max-age=300" },
    );
  } catch (error) {
    console.log(`[GUILD-QUESTS] ERROR - ${error instanceof Error ? error.message : String(error)}`);
    return json({ error: "Quests unavailable" }, 500);
  }
});
