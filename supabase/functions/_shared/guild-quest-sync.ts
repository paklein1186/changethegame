// Publication des projets d'un site partenaire (Trois-Tiers) en quêtes de sa guilde, puis mises à jour.
// Utilisé par guild-quest-sync. Le site reste maître du contenu ; CTG n'en reçoit que la face publique, et la
// fonction n'écrit que des champs de présentation sur des quêtes de la guilde qu'elle a reliées elle-même.

import { guildQuests } from "./guild-quests.ts";

type Row = Record<string, any>;
export const SOURCE = "trois-tiers";
const NATURES = new Set(["IDEA", "PROJECT", "MISSION"]);
const STATUTS = new Set(["OPEN", "IN_PROGRESS", "COMPLETED", "OPEN_FOR_PROPOSALS", "ACTIVE", "IDEA"]);

export class SyncError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}

export interface Face {
  titre?: unknown; resume?: unknown; besoins?: unknown; nature?: unknown; statut?: unknown;
  etiquettes?: unknown; lien_retour?: unknown; audience?: unknown;
}

/**
 * Visibilité envoyée par le site (contrat commun, docs/quetes/visibilite.md du site) :
 *   { "mode": "public" }                              → quête ouverte à tous, exposée sur le web ;
 *   { "mode": "membres", "niveau_minimum": "N2"|"N3" } → fiche visible des membres à partir de ce niveau, contenu à
 *                                                        l'équipe ; jamais exposée sur les pages publiques.
 * Le site n'envoie jamais « caché » : une mission devenue sensible est retirée (withdraw).
 * Sans `visibilite` (ancien format), l'accès n'est pas touché et seule `face.audience` compte.
 */
export function visibilityFields(v: unknown): Row | null {
  if (v === undefined || v === null) return null;
  const mode = (v as Row)?.mode;
  if (mode === "public") return { access_mode: "public", public_visibility: "public" };
  if (mode === "membres") {
    const niveau = (v as Row)?.niveau_minimum;
    if (niveau !== "N2" && niveau !== "N3") throw new SyncError("invalid_visibility", "niveau_minimum : N2 ou N3");
    return { access_mode: "members", access_min_level: niveau, public_visibility: "private" };
  }
  throw new SyncError("invalid_visibility", "mode : public ou membres");
}

/** La base applique-t-elle vraiment l'accès aux quêtes ? Mesuré par la base elle-même ; faux si on ne sait pas. */
export async function accessEnforced(admin: any): Promise<boolean> {
  try {
    const { data, error } = await admin.rpc("quest_access_enforced");
    return !error && data === true;
  } catch {
    return false;
  }
}

/** Traduit la face envoyée par le site en champs de quête, en refusant tout ce qui sort du cadre. */
export function questFields(face: Face, origins: string[]): Row {
  const titre = typeof face.titre === "string" ? face.titre.trim() : "";
  if (!titre) throw new SyncError("invalid_face", "titre manquant");
  const nature = String(face.nature ?? "");
  if (!NATURES.has(nature)) throw new SyncError("invalid_face", "nature inconnue");
  const statut = String(face.statut ?? "OPEN");
  if (!STATUTS.has(statut)) throw new SyncError("invalid_face", "statut refusé");
  const lien = typeof face.lien_retour === "string" ? face.lien_retour : "";
  let origine = "";
  try { origine = new URL(lien).origin; } catch { /* refusé plus bas */ }
  if (!origins.includes(origine)) throw new SyncError("invalid_face", "adresse de retour hors du site");
  const etiquettes = Array.isArray(face.etiquettes)
    ? face.etiquettes.filter((e) => typeof e === "string" && e.trim()).map((e) => (e as string).trim().slice(0, 60)).slice(0, 20)
    : [];
  const resume = typeof face.resume === "string" ? face.resume.trim() : "";
  const besoins = typeof face.besoins === "string" ? face.besoins.trim() : "";
  const description = [resume, besoins && `Besoins : ${besoins}`].filter(Boolean).join("\n\n").slice(0, 4000) || null;
  return {
    title: titre.slice(0, 200),
    description,
    quest_nature: nature,
    status: statut,
    website_url: lien,
    web_tags: etiquettes,
    // Seule une face publique est visible sur les sites ; toute autre audience retire la quête des pages publiques.
    public_visibility: face.audience === "public" ? "public" : "private",
  };
}

export async function linkedQuest(admin: any, projetId: string): Promise<string | null> {
  const { data } = await admin.from("quest_external_links").select("quest_id")
    .eq("source", SOURCE).eq("external_id", projetId).maybeSingle();
  return data?.quest_id ?? null;
}

/** Crée la quête (ou renvoie celle déjà reliée à ce projet : jamais de doublon). */
export async function createQuest(admin: any, guildId: string, userId: string, projetId: string, fields: Row, pending = false) {
  const existing = await linkedQuest(admin, projetId);
  if (existing) return { quest_id: existing, created: false };
  const { data: quest, error } = await admin.from("quests").insert({
    ...fields, guild_id: guildId, owner_type: "GUILD", owner_id: guildId, created_by_user_id: userId, is_draft: pending,
  }).select("id").single();
  if (error || !quest) throw new SyncError("db", error?.message ?? "insert failed", 500);
  const { error: e2 } = await admin.from("quest_external_links").insert({
    quest_id: quest.id, source: SOURCE, external_id: projetId, created_by_user_id: userId, pending_validation: pending,
  });
  if (e2) {
    // Une autre publication du même projet a gagné la course : on retire la nôtre.
    await admin.from("quests").update({ is_deleted: true, deleted_at: new Date().toISOString() }).eq("id", quest.id);
    const winner = await linkedQuest(admin, projetId);
    if (winner) return { quest_id: winner, created: false };
    throw new SyncError("db", e2.message ?? "link failed", 500);
  }
  if (pending) await notifyAdmins(admin, guildId, quest.id, String(fields.title ?? ""));
  return { quest_id: quest.id, created: true, pending };
}

/** Prévient les admins de la guilde qu'une mission du site attend leur validation (salle d'attente). */
export async function notifyAdmins(admin: any, guildId: string, questId: string, title: string) {
  const { data: admins } = await admin.from("guild_members").select("user_id, role").eq("guild_id", guildId);
  const ids = [...new Set(((admins ?? []) as Row[]).filter((m) => String(m.role).toUpperCase() === "ADMIN").map((m) => m.user_id))];
  if (!ids.length) return;
  await admin.from("notifications").insert(ids.map((id) => ({
    user_id: id, type: "GUILD_SITE_QUEST_PENDING", title: "Mission à valider",
    body: `« ${title} » arrive de Trois-Tiers en brouillon : validez-la (publiée pour les membres) ou gardez-la privée, dans l'onglet Travail de la guilde.`,
    related_entity_type: "GUILD", related_entity_id: guildId, deep_link_url: `/guilds/${guildId}?tab=work`,
  })));
}

/** Met à jour une quête que cette fonction a reliée à ce projet, dans la guilde, champs de présentation seulement. */
export async function updateQuest(admin: any, guildId: string, projetId: string, questId: string, fields: Row, validee = false) {
  const linked = await linkedQuest(admin, projetId);
  if (linked !== questId) throw new SyncError("not_linked", "quête non reliée à ce projet", 409);
  const { data: quest } = await admin.from("quests").select("id, guild_id, is_deleted").eq("id", questId).maybeSingle();
  if (!quest || quest.is_deleted) throw new SyncError("gone", "quête supprimée", 410);
  if (quest.guild_id !== guildId) throw new SyncError("forbidden", "quête hors de la guilde", 403);
  // Une face publique, ou réservée aux membres, remet la quête en ligne si elle avait été retirée.
  const { data: lien } = await admin.from("quest_external_links").select("pending_validation").eq("quest_id", questId).eq("source", SOURCE).maybeSingle();
  // Validée sur le site (salle d'attente) : la quête sort de l'attente côté CTG aussi.
  if (lien?.pending_validation && validee) {
    await admin.from("quest_external_links").update({ pending_validation: false, decision: "validated", decided_at: new Date().toISOString() })
      .eq("quest_id", questId).eq("source", SOURCE);
  }
  const enAttente = Boolean(lien?.pending_validation) && !validee;
  const republish = !enAttente && (fields.public_visibility === "public" || fields.access_mode === "members")
    ? { is_draft: false } : {};
  const { error } = await admin.from("quests").update({ ...fields, ...republish, updated_at: new Date().toISOString() }).eq("id", questId);
  if (error) throw new SyncError("db", error.message ?? "update failed", 500);
  await admin.from("quest_external_links").update({ updated_at: new Date().toISOString() })
    .eq("quest_id", questId).eq("source", SOURCE);
  return { quest_id: questId, updated: true };
}

/** Retire la quête des vues publiques (brouillon, privée) sans rien y écrire d'autre : utilisé quand la face du
 *  projet n'est plus publique (projet devenu sensible, résumé retiré…). Rien du projet n'est envoyé. */
export async function withdrawQuest(admin: any, guildId: string, projetId: string, questId: string, prive = false) {
  const linked = await linkedQuest(admin, projetId);
  if (linked !== questId) throw new SyncError("not_linked", "quête non reliée à ce projet", 409);
  const { data: quest } = await admin.from("quests").select("id, guild_id, is_deleted").eq("id", questId).maybeSingle();
  if (!quest || quest.is_deleted) return { quest_id: questId, withdrawn: true };
  if (quest.guild_id !== guildId) throw new SyncError("forbidden", "quête hors de la guilde", 403);
  const { error } = await admin.from("quests")
    .update({ is_draft: true, public_visibility: "private", updated_at: new Date().toISOString() }).eq("id", questId);
  if (error) throw new SyncError("db", error.message ?? "update failed", 500);
  // Gardée privée sur le site (salle d'attente) : la quête sort de l'attente côté CTG aussi.
  if (prive) {
    await admin.from("quest_external_links").update({ pending_validation: false, decision: "private", decided_at: new Date().toISOString() })
      .eq("quest_id", questId).eq("source", SOURCE).eq("pending_validation", true);
  }
  return { quest_id: questId, withdrawn: true };
}

export interface Nouvelle { id?: unknown; titre?: unknown; texte?: unknown }

/**
 * Publie une nouvelle sur une quête reliée au projet (palier 2, B3 : un changement d'étape validé par le référent sur
 * le site). Une même nouvelle du site n'est publiée qu'une fois (quest_update_external_links). Auteur : la personne qui
 * l'a validée si elle est membre de la guilde, sinon la personne qui a créé la quête.
 */
export async function publishNews(admin: any, guildId: string, projetId: string, questId: string, n: Nouvelle, auteur?: unknown) {
  const id = typeof n?.id === "string" ? n.id.trim() : "";
  const titre = typeof n?.titre === "string" ? n.titre.trim() : "";
  const texte = typeof n?.texte === "string" ? n.texte.trim() : "";
  if (!/^[0-9a-zA-Z_-]{1,120}$/.test(id) || !titre) throw new SyncError("invalid_news", "id et titre de la nouvelle attendus");
  const linked = await linkedQuest(admin, projetId);
  if (linked !== questId) throw new SyncError("not_linked", "quête non reliée à ce projet", 409);
  const { data: quest } = await admin.from("quests").select("id, guild_id, is_deleted, created_by_user_id").eq("id", questId).maybeSingle();
  if (!quest || quest.is_deleted) throw new SyncError("gone", "quête supprimée", 410);
  if (quest.guild_id !== guildId) throw new SyncError("forbidden", "quête hors de la guilde", 403);
  const { data: deja } = await admin.from("quest_update_external_links").select("update_id")
    .eq("source", SOURCE).eq("external_id", id).maybeSingle();
  if (deja?.update_id) return { quest_id: questId, update_id: deja.update_id, created: false };
  let author = quest.created_by_user_id;
  if (typeof auteur === "string" && /^[0-9a-f-]{36}$/i.test(auteur)) {
    const { data: membre } = await admin.from("guild_members").select("user_id").eq("guild_id", guildId).eq("user_id", auteur).maybeSingle();
    if (membre) author = auteur;
  }
  const { data: upd, error } = await admin.from("quest_updates").insert({
    quest_id: questId, author_id: author, title: titre.slice(0, 200), content: texte.slice(0, 4000) || null,
    type: "GENERAL", visibility: "PUBLIC", posted_as_label: "Trois-Tiers",
  }).select("id").single();
  if (error || !upd) throw new SyncError("db", error?.message ?? "insert failed", 500);
  const { error: e2 } = await admin.from("quest_update_external_links").insert({ update_id: upd.id, source: SOURCE, external_id: id });
  if (e2) {
    // Publiée en même temps par un autre appel : on retire la nôtre.
    await admin.from("quest_updates").update({ is_deleted: true, deleted_at: new Date().toISOString() }).eq("id", upd.id);
    const { data: gagnant } = await admin.from("quest_update_external_links").select("update_id").eq("source", SOURCE).eq("external_id", id).maybeSingle();
    if (gagnant?.update_id) return { quest_id: questId, update_id: gagnant.update_id, created: false };
    throw new SyncError("db", e2.message ?? "link failed", 500);
  }
  return { quest_id: questId, update_id: upd.id, created: true };
}

/**
 * Toutes les quêtes de la guilde (brouillons compris, champs d'administration), avec le projet du site auquel chacune
 * est reliée par cette fonction (quest_external_links) : le site range les autres dans sa file « à classer » (B5).
 */
export async function guildQuestsForSite(admin: any, guildId: string) {
  const quests = await guildQuests(admin, guildId, true);
  const ids = quests.map((q: Row) => q.id);
  const { data: links } = ids.length
    ? await admin.from("quest_external_links").select("quest_id, external_id, pending_validation, decision").eq("source", SOURCE).in("quest_id", ids)
    : { data: [] };
  const lien = new Map((links ?? []).map((l: Row) => [l.quest_id, l]));
  return { guild_id: guildId, quests: quests.map((q: Row) => {
    const l = lien.get(q.id) as Row | undefined;
    return { ...q, projet_id: l?.external_id ?? null, en_attente: Boolean(l?.pending_validation), decision: l?.decision ?? null };
  }) };
}

/** Comparaison en temps constant de la clé du site. */
export function sameKey(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
