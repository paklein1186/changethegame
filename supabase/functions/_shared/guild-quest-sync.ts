// Publication des projets d'un site partenaire (Trois-Tiers) en quêtes de sa guilde, puis mises à jour.
// Utilisé par guild-quest-sync. Le site reste maître du contenu ; CTG n'en reçoit que la face publique, et la
// fonction n'écrit que des champs de présentation sur des quêtes de la guilde qu'elle a reliées elle-même.

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
export async function createQuest(admin: any, guildId: string, userId: string, projetId: string, fields: Row) {
  const existing = await linkedQuest(admin, projetId);
  if (existing) return { quest_id: existing, created: false };
  const { data: quest, error } = await admin.from("quests").insert({
    ...fields, guild_id: guildId, owner_type: "GUILD", owner_id: guildId, created_by_user_id: userId, is_draft: false,
  }).select("id").single();
  if (error || !quest) throw new SyncError("db", error?.message ?? "insert failed", 500);
  const { error: e2 } = await admin.from("quest_external_links").insert({
    quest_id: quest.id, source: SOURCE, external_id: projetId, created_by_user_id: userId,
  });
  if (e2) {
    // Une autre publication du même projet a gagné la course : on retire la nôtre.
    await admin.from("quests").update({ is_deleted: true, deleted_at: new Date().toISOString() }).eq("id", quest.id);
    const winner = await linkedQuest(admin, projetId);
    if (winner) return { quest_id: winner, created: false };
    throw new SyncError("db", e2.message ?? "link failed", 500);
  }
  return { quest_id: quest.id, created: true };
}

/** Met à jour une quête que cette fonction a reliée à ce projet, dans la guilde, champs de présentation seulement. */
export async function updateQuest(admin: any, guildId: string, projetId: string, questId: string, fields: Row) {
  const linked = await linkedQuest(admin, projetId);
  if (linked !== questId) throw new SyncError("not_linked", "quête non reliée à ce projet", 409);
  const { data: quest } = await admin.from("quests").select("id, guild_id, is_deleted").eq("id", questId).maybeSingle();
  if (!quest || quest.is_deleted) throw new SyncError("gone", "quête supprimée", 410);
  if (quest.guild_id !== guildId) throw new SyncError("forbidden", "quête hors de la guilde", 403);
  const { error } = await admin.from("quests").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", questId);
  if (error) throw new SyncError("db", error.message ?? "update failed", 500);
  await admin.from("quest_external_links").update({ updated_at: new Date().toISOString() })
    .eq("quest_id", questId).eq("source", SOURCE);
  return { quest_id: questId, updated: true };
}

/** Comparaison en temps constant de la clé du site. */
export function sameKey(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
