// Quêtes d'une guilde, lues par un site partenaire (ex. troistiers.space). Utilisé par guild-quests.
//
// Trois modes :
// - public (sans jeton) : seulement les quêtes publiées, non supprimées, marquées « public » (public_visibility),
//   non masquées pour le web ET ouvertes à tous (accès « public » : transparence complète) ; champs de
//   présentation seulement (jamais budget, cagnotte, récompense ni personnes) ;
// - membre (jeton d'une personne qui n'administre pas la guilde) : les quêtes publiées et non masquées que cette
//   personne peut voir selon les règles d'accès des quêtes (membranes de la guilde, permissions personnelles),
//   avec leur niveau : « full » (champs de présentation) ou « teaser » (fiche seule + lien pour demander l'accès
//   sur changethegame, où les admins de la quête sont prévenus) ;
// - administration (jeton d'un·e admin de la guilde) : toutes les quêtes non supprimées, brouillons compris, avec
//   leurs réglages de visibilité et d'accès, pour relier à la main les quêtes aux projets du site.
//
// Les niveaux d'accès sont calculés par la base (my_quest_access_levels) : le site n'a pas à refaire les règles.

type Row = Record<string, any>;

export const BASE_URL = "https://changethegame.xyz";

export const PUBLIC_FIELDS = [
  "id", "title", "description", "quest_nature", "status", "cover_image_url", "website_url",
  "web_tags", "web_scopes", "featured_order", "created_at", "updated_at",
] as const;
const ADMIN_FIELDS = [...PUBLIC_FIELDS, "is_draft", "public_visibility", "web_visibility_override", "guild_id"] as const;

export type Mode = "public" | "member" | "admin";
export type Level = "full" | "teaser" | "none";
const TEASER_FIELDS = ["id", "title", "description", "quest_nature", "status", "cover_image_url", "web_tags", "web_scopes"] as const;

export function isPublicQuest(q: Row): boolean {
  return q.is_deleted !== true && q.is_draft !== true && q.public_visibility === "public" &&
    q.web_visibility_override !== "force_hidden";
}

export function presentQuest(q: Row, guildId: string, admin: boolean, level?: Level): Row {
  const out: Row = {};
  const fields = admin ? [...ADMIN_FIELDS, "access_mode"] : level === "teaser" ? TEASER_FIELDS : PUBLIC_FIELDS;
  for (const k of fields) out[k] = q[k] ?? null;
  out.web_tags = q.web_tags ?? [];
  out.web_scopes = q.web_scopes ?? [];
  out.url = `${BASE_URL}/quests/${q.id}`;
  if (admin) out.link = q.guild_id === guildId ? "guild" : "affiliation";
  if (level) {
    out.access = level;
    if (level === "teaser") out.request_access_url = `${BASE_URL}/quests/${q.id}?access=request`;
  }
  return out;
}

export async function isGuildAdmin(admin: any, guildId: string, userId: string): Promise<boolean> {
  const [{ data: guild }, { data: roster }] = await Promise.all([
    admin.from("guilds").select("id, created_by_user_id").eq("id", guildId).maybeSingle(),
    admin.from("guild_members").select("role").eq("guild_id", guildId).eq("user_id", userId).maybeSingle(),
  ]);
  if (!guild) return false;
  if (guild.created_by_user_id === userId || roster?.role === "ADMIN") return true;
  // Admin d'une entité (organisation, autre guilde) qui administre la guilde : règle de la base.
  if (typeof admin.rpc !== "function") return false;
  const { data } = await admin.rpc("is_guild_admin", { _guild_id: guildId, _user_id: userId });
  return data === true;
}

/**
 * Quêtes de la guilde (propres ou affiliées), sans doublon, triées : mises en avant puis plus récentes.
 * `levelsFor` donne le niveau d'accès de la personne (ou d'un visiteur anonyme) pour chaque quête ;
 * sans lui (tests, ancien appel), toutes les quêtes sont considérées ouvertes.
 */
export async function guildQuests(
  admin: any,
  guildId: string,
  asAdmin: boolean,
  opts: { mode?: Mode; levelsFor?: (ids: string[]) => Promise<Record<string, Level>> } = {},
): Promise<Row[]> {
  const mode: Mode = asAdmin ? "admin" : opts.mode ?? "public";
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
  const candidates = [...(own ?? []), ...affiliated]
    .filter((q) => (seen.has(q.id) ? false : (seen.add(q.id), true)))
    .filter((q) => q.is_deleted !== true)
    .filter((q) => mode === "admin" ||
      (mode === "public" ? isPublicQuest(q) : q.is_draft !== true && q.web_visibility_override !== "force_hidden"));
  const levels: Record<string, Level> = mode === "admin" || !opts.levelsFor
    ? Object.fromEntries(candidates.map((q) => [q.id, "full" as Level]))
    : await opts.levelsFor(candidates.map((q) => q.id));
  return candidates
    .filter((q) => mode === "admin" || (mode === "public" ? levels[q.id] === "full" : (levels[q.id] ?? "none") !== "none"))
    .sort((a, b) =>
      (a.featured_order ?? Infinity) - (b.featured_order ?? Infinity) ||
      String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? "")))
    .map((q) => presentQuest(q, guildId, mode === "admin", mode === "member" ? levels[q.id] : undefined));
}

/** Niveaux d'accès lus dans la base : client de service = visiteur anonyme ; client au jeton = cette personne. */
export function levelsFrom(client: any): (ids: string[]) => Promise<Record<string, Level>> {
  return async (ids: string[]) => {
    const out: Record<string, Level> = Object.fromEntries(ids.map((id) => [id, "none" as Level]));
    if (!ids.length) return out;
    const { data, error } = await client.rpc("my_quest_access_levels", { p_quest_ids: ids });
    if (error) throw new Error(error.message ?? "access levels unavailable");
    for (const r of data ?? []) out[r.quest_id] = r.level as Level;
    return out;
  };
}
