// Discussion d'une quête de la guilde pour un site partenaire (Trois-Tiers : un seul fil, celui de la quête).
//
//   POST /functions/v1/quest-comments
//   Authorization: Bearer <jeton de la personne>   (facultatif pour lire, obligatoire pour écrire)
//   { "action": "list" | "post", "guild_id": "<uuid>", "quest_id": "<uuid>", "contenu"?: "…", "parent_id"?: "<uuid>" }
//
// Lecture et écriture passent par les règles d'accès de la base avec l'identité de la personne (ou d'un visiteur) :
// commentaires d'une quête réservée visibles et ouverts aux seules personnes qui ont accès à la quête.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { CommentError, listComments, postComment, questOfGuild } from "../_shared/quest-comments.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "private, no-store" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const anon = createClient(url, anonKey, { auth: { persistSession: false } });
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });
  try {
    const body = await req.json().catch(() => ({}));
    await questOfGuild(admin, String(body?.guild_id ?? ""), String(body?.quest_id ?? ""));
    let userId: string | null = null;
    let viewer: any = anon; // visiteur : règles d'accès d'une personne non connectée
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (token) {
      const { data } = await anon.auth.getUser(token);
      if (data?.user) {
        userId = data.user.id;
        viewer = createClient(url, anonKey, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
      }
    }
    if (body?.action === "list") return json(await listComments(viewer, admin, body.quest_id, userId));
    if (body?.action === "post") {
      if (!userId) return json({ error: "unauthenticated", detail: "connexion nécessaire pour écrire" }, 401);
      return json(await postComment(viewer, body.quest_id, userId, body?.contenu, body?.parent_id));
    }
    return json({ error: "invalid_action" }, 400);
  } catch (e) {
    if (e instanceof CommentError) return json({ error: e.code, detail: e.message }, e.status);
    console.log(`[QUEST-COMMENTS] ERROR - ${e instanceof Error ? e.message : String(e)}`);
    return json({ error: "Comments unavailable" }, 500);
  }
});
