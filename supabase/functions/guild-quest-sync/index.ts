// Publication automatique des projets Trois-Tiers en quêtes de la guilde (palier 2, étape B1).
//
//   POST /functions/v1/guild-quest-sync
//   X-Site-Key: <clé du site>                                (toujours)
//   Authorization: Bearer <jeton CTG de la personne>         (création seulement : admin de la guilde)
//   { "action": "create" | "update" | "withdraw", "projet_id": "<uuid>", "quest_id"?: "<uuid>", "face": { … } }
//
// Création : au nom de la personne de la coordination qui clique « Publier ». Mises à jour : par la clé du site seule,
// et seulement sur une quête que cette fonction a reliée au projet (quest_external_links), dans la guilde.
// Fermée tant que SITE_SYNC_KEY, SITE_SYNC_GUILD_ID et SITE_SYNC_ORIGINS ne sont pas posés.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { createQuest, questFields, sameKey, SyncError, updateQuest, withdrawQuest } from "../_shared/guild-quest-sync.ts";
import { isGuildAdmin } from "../_shared/guild-quests.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const key = Deno.env.get("SITE_SYNC_KEY") ?? "";
  const guildId = Deno.env.get("SITE_SYNC_GUILD_ID") ?? "";
  const origins = (Deno.env.get("SITE_SYNC_ORIGINS") ?? "").split(",").map((o) => o.trim()).filter(Boolean);
  if (key.length < 32 || !UUID.test(guildId) || !origins.length) return json({ error: "disabled" }, 503);
  if (!sameKey(req.headers.get("x-site-key") ?? "", key)) return json({ error: "Not authenticated" }, 401);

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });
  try {
    const body = await req.json().catch(() => null);
    const projetId = String(body?.projet_id ?? "");
    if (!UUID.test(projetId)) return json({ error: "invalid projet_id" }, 400);
    if (body?.action === "withdraw") {
      const questId = String(body?.quest_id ?? "");
      if (!UUID.test(questId)) return json({ error: "invalid quest_id" }, 400);
      return json(await withdrawQuest(admin, guildId, projetId, questId));
    }
    const fields = questFields(body?.face ?? {}, origins);

    if (body?.action === "create") {
      const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
      const anon = createClient(url, Deno.env.get("SUPABASE_ANON_KEY") ?? "", { auth: { persistSession: false } });
      const { data } = token ? await anon.auth.getUser(token) : { data: null };
      const user = data?.user;
      if (!user) return json({ error: "Not authenticated" }, 401);
      if (!(await isGuildAdmin(admin, guildId, user.id))) return json({ error: "guild admin only" }, 403);
      if (fields.public_visibility !== "public") return json({ error: "only a public face can be published" }, 422);
      return json(await createQuest(admin, guildId, user.id, projetId, fields));
    }
    if (body?.action === "update") {
      const questId = String(body?.quest_id ?? "");
      if (!UUID.test(questId)) return json({ error: "invalid quest_id" }, 400);
      return json(await updateQuest(admin, guildId, projetId, questId, fields));
    }
    return json({ error: "unknown action" }, 400);
  } catch (e) {
    if (e instanceof SyncError) return json({ error: e.code, detail: e.message }, e.status);
    console.log(`[GUILD-QUEST-SYNC] ERROR - ${e instanceof Error ? e.message : String(e)}`);
    return json({ error: "sync failed" }, 500);
  }
});
