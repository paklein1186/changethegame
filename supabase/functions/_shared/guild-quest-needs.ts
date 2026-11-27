// Besoins et propositions d'aide d'une quête reliée à un projet du site Trois-Tiers (palier 2, B4).
// Décisions de Trois-Tiers (28/11) : un besoin peut naître des deux côtés (la dernière modification l'emporte, la
// fusion est faite par le site) ; le site ne recopie des propositions qu'un compteur, il lit la liste en direct pour
// le référent ; accepter depuis le site = accepter ici, sauf si la proposition demande des crédits ou des euros
// (à accepter sur ChangeTheGame, où le versement se fait).
import { linkedQuest, SOURCE, SyncError } from "./guild-quest-sync.ts";

type Row = Record<string, any>;
export const CATEGORIES = new Set(["GENERAL", "SKILLS", "TOOLS", "PLACE", "FUNDING", "MENTORSHIP", "VISIBILITY", "PARTNERSHIPS", "VOLUNTEER"]);
export const STATUTS = new Set(["OPEN", "MET", "CLOSED"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const txt = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** La quête est bien celle reliée à ce projet, dans la guilde, non supprimée. */
async function questOf(admin: any, guildId: string, projetId: string, questId: string) {
  if ((await linkedQuest(admin, projetId)) !== questId) throw new SyncError("not_linked", "quête non reliée à ce projet", 409);
  const { data: q } = await admin.from("quests").select("id, guild_id, is_deleted, created_by_user_id").eq("id", questId).maybeSingle();
  if (!q || q.is_deleted) throw new SyncError("gone", "quête supprimée", 410);
  if (q.guild_id !== guildId) throw new SyncError("forbidden", "quête hors de la guilde", 403);
  return q;
}

async function membre(admin: any, guildId: string, user: unknown): Promise<string | null> {
  if (typeof user !== "string" || !UUID.test(user)) return null;
  const { data } = await admin.from("guild_members").select("user_id").eq("guild_id", guildId).eq("user_id", user).maybeSingle();
  return data ? user : null;
}

/** Besoins de la quête, avec l'identifiant du site quand il y en a un, et le nombre de propositions en attente. */
export async function listNeeds(admin: any, guildId: string, projetId: string, questId: string) {
  await questOf(admin, guildId, projetId, questId);
  const { data: needs } = await admin.from("quest_needs").select("id, title, description, category, status, updated_at").eq("quest_id", questId);
  const ids = (needs ?? []).map((n: Row) => n.id);
  const { data: links } = ids.length
    ? await admin.from("quest_need_external_links").select("need_id, external_id").eq("source", SOURCE).in("need_id", ids)
    : { data: [] };
  const { data: props } = await admin.from("quest_proposals").select("need_id").eq("quest_id", questId).eq("status", "PENDING");
  const ext = new Map((links ?? []).map((l: Row) => [l.need_id, l.external_id]));
  const attente = new Map<string, number>();
  for (const p of props ?? []) if (p.need_id) attente.set(p.need_id, (attente.get(p.need_id) ?? 0) + 1);
  return {
    quest_id: questId,
    besoins: (needs ?? []).map((n: Row) => ({
      need_id: n.id, external_id: ext.get(n.id) ?? null, titre: n.title, description: n.description ?? null,
      categorie: CATEGORIES.has(String(n.category ?? "").toUpperCase()) ? String(n.category).toUpperCase() : "GENERAL",
      statut: STATUTS.has(String(n.status ?? "").toUpperCase()) ? String(n.status).toUpperCase() : "OPEN",
      maj_le: n.updated_at, propositions_en_attente: attente.get(n.id) ?? 0,
    })),
    propositions_sans_besoin: (props ?? []).filter((p: Row) => !p.need_id).length,
  };
}

export interface BesoinSite { id?: unknown; need_id?: unknown; titre?: unknown; description?: unknown; categorie?: unknown; statut?: unknown; supprime?: unknown }

/**
 * Écrit les besoins envoyés par le site (déjà fusionnés par lui : ce qui arrive ici est la version retenue).
 * Un besoin retiré côté site (supprime) est fermé, jamais effacé. Renvoie, pour chacun, l'identifiant CTG et la date.
 */
export async function pushNeeds(admin: any, guildId: string, projetId: string, questId: string, liste: BesoinSite[], auteur?: unknown) {
  const q = await questOf(admin, guildId, projetId, questId);
  if (!Array.isArray(liste) || liste.length > 100) throw new SyncError("invalid_needs", "liste de besoins attendue (100 au plus)");
  const author = (await membre(admin, guildId, auteur)) ?? q.created_by_user_id;
  const out: Row[] = [];
  for (const b of liste) {
    const id = txt(b?.id, 120);
    if (!/^[0-9a-zA-Z_-]{1,120}$/.test(id)) throw new SyncError("invalid_needs", "identifiant de besoin du site attendu");
    const supprime = b?.supprime === true;
    const titre = txt(b?.titre, 200);
    if (!supprime && !titre) throw new SyncError("invalid_needs", "titre du besoin attendu");
    const categorie = String(b?.categorie ?? "GENERAL").toUpperCase();
    const statut = supprime ? "CLOSED" : String(b?.statut ?? "OPEN").toUpperCase();
    if (!CATEGORIES.has(categorie) || !STATUTS.has(statut)) throw new SyncError("invalid_needs", "catégorie ou statut inconnu");
    const maj = new Date().toISOString();
    const { data: lien } = await admin.from("quest_need_external_links").select("need_id").eq("source", SOURCE).eq("external_id", id).maybeSingle();
    // Un besoin né sur CTG que le site reprend : le site envoie son need_id, on pose le lien.
    let needId: string | null = lien?.need_id ?? null;
    if (!needId && typeof b?.need_id === "string" && UUID.test(b.need_id)) {
      const { data: n } = await admin.from("quest_needs").select("id, quest_id").eq("id", b.need_id).maybeSingle();
      const { data: pris } = await admin.from("quest_need_external_links").select("need_id").eq("need_id", b.need_id).maybeSingle();
      if (n?.quest_id === questId && !pris) {
        needId = n.id;
        await admin.from("quest_need_external_links").insert({ need_id: needId, source: SOURCE, external_id: id });
      }
    }
    if (needId) {
      const { data: n } = await admin.from("quest_needs").select("id, quest_id").eq("id", needId).maybeSingle();
      if (!n || n.quest_id !== questId) throw new SyncError("forbidden", "besoin d'une autre quête", 403);
      const patch: Row = supprime ? { status: "CLOSED", updated_at: maj }
        : { title: titre, description: txt(b?.description, 2000) || null, category: categorie, status: statut, updated_at: maj };
      await admin.from("quest_needs").update(patch).eq("id", needId);
      out.push({ id, need_id: needId, maj_le: maj });
      continue;
    }
    if (supprime) { out.push({ id, need_id: null, maj_le: null }); continue; }
    const { data: cree, error } = await admin.from("quest_needs").insert({
      quest_id: questId, title: titre, description: txt(b?.description, 2000) || null, category: categorie, status: statut,
      created_by_user_id: author, updated_at: maj,
    }).select("id").single();
    if (error || !cree) throw new SyncError("db", error?.message ?? "insert failed", 500);
    const { error: e2 } = await admin.from("quest_need_external_links").insert({ need_id: cree.id, source: SOURCE, external_id: id });
    if (e2) {
      // Créé en même temps par un autre appel : on ferme le nôtre et on renvoie le gagnant.
      await admin.from("quest_needs").update({ status: "CLOSED" }).eq("id", cree.id);
      const { data: g } = await admin.from("quest_need_external_links").select("need_id").eq("source", SOURCE).eq("external_id", id).maybeSingle();
      out.push({ id, need_id: g?.need_id ?? null, maj_le: maj });
      continue;
    }
    out.push({ id, need_id: cree.id, maj_le: maj });
  }
  return { quest_id: questId, besoins: out };
}

/** Propositions d'aide en attente, lues en direct pour le référent (le site ne les enregistre pas). Jamais d'e-mail. */
export async function listProposals(admin: any, guildId: string, projetId: string, questId: string) {
  await questOf(admin, guildId, projetId, questId);
  const { data: props } = await admin.from("quest_proposals")
    .select("id, need_id, proposer_type, proposer_id, title, description, requested_credits, requested_fiat, created_at")
    .eq("quest_id", questId).eq("status", "PENDING").order("created_at", { ascending: true });
  const users = [...new Set((props ?? []).filter((p: Row) => p.proposer_type === "USER").map((p: Row) => p.proposer_id))];
  const { data: profils } = users.length ? await admin.from("profiles").select("user_id, name").in("user_id", users) : { data: [] };
  const noms = new Map((profils ?? []).map((p: Row) => [p.user_id, p.name]));
  return {
    quest_id: questId,
    propositions: (props ?? []).map((p: Row) => ({
      id: p.id, need_id: p.need_id ?? null, titre: p.title, description: p.description ?? null,
      nom: p.proposer_type === "USER" ? (noms.get(p.proposer_id) ?? null) : null,
      profil_id: p.proposer_type === "USER" ? p.proposer_id : null,
      demande_credits: Number(p.requested_credits ?? 0), demande_euros: Number(p.requested_fiat ?? 0), cree_le: p.created_at,
      acceptable_depuis_le_site: !(Number(p.requested_credits ?? 0) > 0 || Number(p.requested_fiat ?? 0) > 0),
    })),
  };
}

/** Accepter ou refuser une proposition en attente ; la personne est prévenue. */
export async function decideProposal(admin: any, guildId: string, projetId: string, questId: string,
  proposalId: string, decision: unknown, auteur?: unknown) {
  const q = await questOf(admin, guildId, projetId, questId);
  if (decision !== "accept" && decision !== "reject") throw new SyncError("invalid_decision", "accept ou reject attendu");
  const { data: p } = await admin.from("quest_proposals").select("id, quest_id, status, proposer_type, proposer_id, title, requested_credits, requested_fiat")
    .eq("id", proposalId).maybeSingle();
  if (!p || p.quest_id !== questId) throw new SyncError("not_found", "proposition inconnue sur cette quête", 404);
  if (p.status !== "PENDING") throw new SyncError("already_decided", "proposition déjà traitée", 409);
  if (decision === "accept" && (Number(p.requested_credits ?? 0) > 0 || Number(p.requested_fiat ?? 0) > 0)) {
    throw new SyncError("needs_ctg", "proposition avec crédits ou euros : à accepter sur ChangeTheGame", 409);
  }
  const statut = decision === "accept" ? "ACCEPTED" : "REJECTED";
  await admin.from("quest_proposals").update({ status: statut, updated_at: new Date().toISOString() }).eq("id", p.id).eq("status", "PENDING");
  if (p.proposer_type === "USER" && UUID.test(String(p.proposer_id))) {
    await admin.from("notifications").insert({
      user_id: p.proposer_id, type: decision === "accept" ? "QUEST_PROPOSAL_ACCEPTED" : "QUEST_PROPOSAL_REJECTED",
      title: decision === "accept" ? "Proposition acceptée" : "Proposition non retenue",
      body: `« ${p.title} » ${decision === "accept" ? "a été acceptée par l'équipe du projet (Trois-Tiers)" : "n'a pas été retenue cette fois-ci"}.`,
      related_entity_type: "QUEST", related_entity_id: questId, deep_link_url: `/quests/${questId}`,
    });
  }
  const par = await membre(admin, guildId, auteur);
  return { quest_id: q.id, proposal_id: p.id, statut, par };
}
