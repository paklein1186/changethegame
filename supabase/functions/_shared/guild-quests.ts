// Quêtes d'une guilde, lues par un site partenaire (ex. troistiers.space). Utilisé par guild-quests.
//
// Deux modes :
// - public (sans jeton, ou jeton d'une personne qui n'administre pas la guilde) : seulement les quêtes publiées,
//   non supprimées, marquées « public » (public_visibility) et non masquées pour le web ; champs de présentation
//   seulement (jamais budget, cagnotte, récompense ni personnes) ;
// - administration (jeton d'un·e admin de la guilde) : toutes les quêtes non supprimées, brouillons compris, avec
//   leurs réglages de visibilité, pour relier à la main les quêtes aux projets du site.
//
// La base laisse lire toute quête publiée (faille signalée) : le filtre est donc fait ici, côté serveur.

type Row = Record<string, any>;

export const BASE_URL = "https://changethegame.xyz";

export const PUBLIC_FIELDS = [
  "id", "title", "description", "quest_nature", "status", "cover_image_url", "website_url",
  "web_tags", "web_scopes", "featured_order", "created_at", "updated_at",
] as const;
const ADMIN_FIELDS = [...PUBLIC_FIELDS, "is_draft", "public_visibility", "web_visibility_override", "guild_id"] as const;

export function isPublicQuest(q: Row): boolean {
  return q.is_deleted !== true && q.is_draft !== true && q.public_visibility === "public" &&
    q.web_visibility_override !== "force_hidden";
}

export function presentQuest(q: Row, guildId: string, admin: boolean): Row {
  const out: Row = {};
  for (const k of admin ? ADMIN_FIELDS : PUBLIC_FIELDS) out[k] = q[k] ?? null;
  out.web_tags = q.web_tags ?? [];
  out.web_scopes = q.web_scopes ?? [];
  out.url = `${BASE_URL}/quests/${q.id}`;
  if (admin) out.link = q.guild_id === guildId ? "guild" : "affiliation";
  return out;
}

export async function isGuildAdmin(admin: any, guildId: string, userId: string): Promise<boolean> {
  const [{ data: guild }, { data: roster }] = await Promise.all([
    admin.from("guilds").select("id, created_by_user_id").eq("id", guildId).maybeSingle(),
    admin.from("guild_members").select("role").eq("guild_id", guildId).eq("user_id", userId).maybeSingle(),
  ]);
  return Boolean(guild) && (guild.created_by_user_id === userId || roster?.role === "ADMIN");
}

/** Quêtes de la guilde (propres ou affiliées), sans doublon, triées : mises en avant puis plus récentes. */
export async function guildQuests(admin: any, guildId: string, asAdmin: boolean): Promise<Row[]> {
  const [{ data: own, error: e1 }, { data: afs, error: e2 }] = await Promise.all([
    admin.from("quests").select("*").eq("guild_id", guildId).eq("is_deleted", false),
    admin.from("quest_affiliations").select("quest_id").eq("entity_type", "GUILD").eq("entity_id", guildId),
  ]);
  if (e1 || e2) throw new Error((e1 ?? e2).message ?? "query failed");
  const ids = ((afs as Row[]) ?? []).map((a) => a.quest_id).filter((id) => !(own ?? []).some((q: Row) => q.id === id));
  let affiliated: Row[] = [];
  if (ids.length) {
    const { data, error } = await admin.from("quests").select("*").in("id", ids).eq("is_deleted", false);
    if (error) throw new Error(error.message ?? "query failed");
    affiliated = data ?? [];
  }
  const seen = new Set<string>();
  return [...(own ?? []), ...affiliated]
    .filter((q) => (seen.has(q.id) ? false : (seen.add(q.id), true)))
    .filter((q) => q.is_deleted !== true && (asAdmin || isPublicQuest(q)))
    .sort((a, b) =>
      (a.featured_order ?? Infinity) - (b.featured_order ?? Infinity) ||
      String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? "")))
    .map((q) => presentQuest(q, guildId, asAdmin));
}
