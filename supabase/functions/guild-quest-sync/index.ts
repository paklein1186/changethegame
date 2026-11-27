// Publication automatique des projets Trois-Tiers en quêtes de la guilde (palier 2, étape B1).
//
//   POST /functions/v1/guild-quest-sync
//   X-Site-Key: <clé du site>                                (toujours)
//   Authorization: Bearer <jeton CTG de la personne>         (création seulement : admin de la guilde)
//   { "action": "create" | "update" | "withdraw" | "status" | "news" | "needs" | "needs_push" | "proposals" | "proposal_decide", "projet_id": "<uuid>", "quest_id"?: "<uuid>", "face": { … },
//     "visibilite"?: { "mode": "public" } | { "mode": "membres", "niveau_minimum": "N2" | "N3" } }
//
// Chaque réponse porte "visibilite_appliquee_par_la_base" : vrai seulement si la base empêche vraiment la lecture
// des quêtes réservées (mesuré à chaque appel). Tant qu'il est faux, une visibilité « membres » est refusée (422).
//
// Création : au nom de la personne de la coordination qui clique « Publier ». Mises à jour : par la clé du site seule,
// et seulement sur une quête que cette fonction a reliée au projet (quest_external_links), dans la guilde.
// Fermée tant que SITE_SYNC_KEY, SITE_SYNC_GUILD_ID et SITE_SYNC_ORIGINS ne sont pas posés.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { accessEnforced, createQuest, publishNews, questFields, sameKey, SyncError, updateQuest, visibilityFields, withdrawQuest } from "../_shared/guild-quest-sync.ts";
import { isGuildAdmin } from "../_shared/guild-quests.ts";
import { decideProposal, listNeeds, listProposals, pushNeeds } from "../_shared/guild-quest-needs.ts";

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
  const enforced = await accessEnforced(admin);
  const reply = (body: Record<string, unknown>, status = 200) => json({ ...body, visibilite_appliquee_par_la_base: enforced }, status);
  try {
    const body = await req.json().catch(() => null);
    // Lire seulement l'état de la protection, sans rien publier.
    if (body?.action === "status") return reply({ ok: true });
    const projetId = String(body?.projet_id ?? "");
    if (!UUID.test(projetId)) return reply({ error: "invalid projet_id" }, 400);
    if (body?.action === "withdraw") {
      const questId = String(body?.quest_id ?? "");
      if (!UUID.test(questId)) return reply({ error: "invalid quest_id" }, 400);
      return reply(await withdrawQuest(admin, guildId, projetId, questId));
    }
    // Nouvelle de quête (B3) : clé du site seule, sur une quête reliée au projet.
    if (body?.action === "news") {
      const questId = String(body?.quest_id ?? "");
      if (!UUID.test(questId)) return reply({ error: "invalid quest_id" }, 400);
      return reply(await publishNews(admin, guildId, projetId, questId, body?.nouvelle ?? {}, body?.auteur));
    }
    // Besoins et propositions d'aide (B4) : clé du site seule, sur une quête reliée au projet.
    if (["needs", "needs_push", "proposals", "proposal_decide"].includes(body?.action)) {
      const questId = String(body?.quest_id ?? "");
      if (!UUID.test(questId)) return reply({ error: "invalid quest_id" }, 400);
      if (body.action === "needs") return reply(await listNeeds(admin, guildId, projetId, questId));
      if (body.action === "needs_push") return reply(await pushNeeds(admin, guildId, projetId, questId, body?.besoins, body?.auteur));
      if (body.action === "proposals") return reply(await listProposals(admin, guildId, projetId, questId));
      const proposalId = String(body?.proposal_id ?? "");
      if (!UUID.test(proposalId)) return reply({ error: "invalid proposal_id" }, 400);
      return reply(await decideProposal(admin, guildId, projetId, questId, proposalId, body?.decision, body?.auteur));
    }
    const visibility = visibilityFields(body?.visibilite);
    // Une quête réservée aux membres n'est publiée que si la base en empêche vraiment la lecture.
    if (visibility?.access_mode === "members" && !enforced) {
      return reply({ error: "visibility_not_enforced", detail: "la base ne protège pas encore les quêtes réservées" }, 422);
    }
    const fields = { ...questFields(body?.face ?? {}, origins), ...(visibility ?? {}) };

    if (body?.action === "create") {
      const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
      const anon = createClient(url, Deno.env.get("SUPABASE_ANON_KEY") ?? "", { auth: { persistSession: false } });
      const { data } = token ? await anon.auth.getUser(token) : { data: null };
      const user = data?.user;
      if (!user) return reply({ error: "Not authenticated" }, 401);
      if (!(await isGuildAdmin(admin, guildId, user.id))) return reply({ error: "guild admin only" }, 403);
      if (fields.public_visibility !== "public" && fields.access_mode !== "members") {
        return reply({ error: "only a public or members-only face can be published" }, 422);
      }
      return reply(await createQuest(admin, guildId, user.id, projetId, fields));
    }
    if (body?.action === "update") {
      const questId = String(body?.quest_id ?? "");
      if (!UUID.test(questId)) return reply({ error: "invalid quest_id" }, 400);
      return reply(await updateQuest(admin, guildId, projetId, questId, fields));
    }
    return reply({ error: "unknown action" }, 400);
  } catch (e) {
    if (e instanceof SyncError) return reply({ error: e.code, detail: e.message }, e.status);
    console.log(`[GUILD-QUEST-SYNC] ERROR - ${e instanceof Error ? e.message : String(e)}`);
    return reply({ error: "sync failed" }, 500);
  }
});
