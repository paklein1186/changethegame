import { supabase } from "@/integrations/supabase/client";

export type SearchResultType = "USER" | "GUILD" | "QUEST" | "POD" | "SERVICE" | "COMPANY" | "TERRITORY";

export interface SearchResult {
  type: SearchResultType;
  id: string;
  title: string;
  subtitle?: string;
  url: string;
  imageUrl?: string;
  logoUrl?: string;
  trustScore?: number;
  trustTopTags?: string[];
  trustCount?: number;
}

export interface SearchFilters {
  topicId?: string;
  territoryId?: string;
  priceMin?: number;
  priceMax?: number;
}

// Territory names are stored in English or with accents (« Wallonia », « Liège »): people type « wallonie », « liege ».
// Territories are few, so they are matched here, accent-insensitively, with French/English equivalents.
const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const TERRITORY_EQUIVALENTS: Record<string, string[]> = {
  wallonie: ["wallonia"], "region wallonne": ["wallonia"], flandre: ["flanders"], vlaanderen: ["flanders"],
  bruxelles: ["brussels"], brussel: ["brussels"], belgique: ["belgium"], belgie: ["belgium"],
  suisse: ["switzerland"], allemagne: ["germany"], espagne: ["spain"], "royaume uni": ["uk"], angleterre: ["uk"],
  bourgogne: ["burgundy"], lisbonne: ["lisbon"], geneve: ["geneva"], grece: ["greece", "grece"],
  brittany: ["bretagne"], normandy: ["normandie"], corsica: ["corse"], burgundy: ["bourgogne"],
};
let territoryCache: { at: number; rows: any[] } | null = null;
async function searchTerritories(term: string): Promise<any[]> {
  if (!territoryCache || Date.now() - territoryCache.at > 5 * 60_000) {
    const { data } = await (supabase as any).from("territories").select("id, name, level, summary, logo_url").eq("is_deleted", false).limit(5000);
    territoryCache = { at: Date.now(), rows: data ?? [] };
  }
  const q = norm(term);
  if (!q) return [];
  const wanted = [q, ...(TERRITORY_EQUIVALENTS[q] ?? [])];
  return territoryCache.rows
    .filter((t) => { const n = norm(t.name ?? ""); return wanted.some((w) => n.includes(w)); })
    .sort((a, b) => Number(norm(b.name) === q || wanted.includes(norm(b.name))) - Number(norm(a.name) === q || wanted.includes(norm(a.name))))
    .slice(0, 20);
}

// Characters that break PostgREST's or() syntax (and ilike wildcards) are turned into spaces.
const cleanTerm = (query: string) => query.replace(/[,()"\\%*]/g, " ").replace(/\s+/g, " ").trim();

/** Keeps only the ids linked to the given topic / territory, in one query per filter. */
async function keepLinked(table: string, fk: string, ids: string[], filters?: SearchFilters): Promise<Set<string>> {
  let keep = new Set(ids);
  if (!ids.length) return keep;
  const tables: [string, string | undefined][] = [
    [`${table}_topics`, filters?.topicId && "topic_id"],
    [`${table}_territories`, filters?.territoryId && "territory_id"],
  ];
  for (const [tbl, col] of tables) {
    if (!col) continue;
    const value = col === "topic_id" ? filters!.topicId! : filters!.territoryId!;
    const { data } = await (supabase as any).from(tbl).select(fk).eq(col, value).in(fk, [...keep]);
    keep = new Set((data ?? []).map((r: any) => r[fk]));
  }
  return keep;
}

export async function globalSearch(
  query: string,
  currentUserId: string,
  filters?: SearchFilters,
): Promise<SearchResult[]> {
  const term = cleanTerm(query);
  if (!term) return [];
  const q = `%${term}%`;
  const db = supabase as any;

  // Every source is queried at the same time: the dialog used to wait for eight round trips in a row.
  const [blocks, users, guilds, quests, pods, services, companies, territories] = await Promise.all([
    currentUserId
      ? db.from("user_blocks").select("blocker_id, blocked_id").or(`blocker_id.eq.${currentUserId},blocked_id.eq.${currentUserId}`)
      : Promise.resolve({ data: [] }),
    db.from("profiles_public").select("user_id, name, headline, avatar_url").or(`name.ilike.${q},headline.ilike.${q}`).limit(20),
    db.from("guilds").select("id, name, description, logo_url, banner_url").eq("is_deleted", false).eq("is_draft", false).or(`name.ilike.${q},description.ilike.${q}`).limit(20),
    db.from("quests").select("id, title, description, cover_image_url").eq("is_deleted", false).eq("is_draft", false).or(`title.ilike.${q},description.ilike.${q}`).limit(20),
    db.from("pods").select("id, name, description, image_url").eq("is_deleted", false).eq("is_draft", false).or(`name.ilike.${q},description.ilike.${q}`).limit(20),
    db.from("services").select("id, title, description, price_amount, image_url").eq("is_deleted", false).eq("is_draft", false).or(`title.ilike.${q},description.ilike.${q}`).limit(20),
    db.from("companies").select("id, name, description, logo_url, banner_url").eq("is_deleted", false).or(`name.ilike.${q},description.ilike.${q}`).limit(20),
    searchTerritories(term).then((data) => ({ data })),
  ]);

  const blockedIds = new Set(
    (blocks.data ?? []).map((b: any) => (b.blocker_id === currentUserId ? b.blocked_id : b.blocker_id)),
  );
  const userRows = (users.data ?? []).filter((u: any) => u.user_id && u.user_id !== currentUserId && !blockedIds.has(u.user_id));
  const filtering = !!(filters?.topicId || filters?.territoryId);
  const [userKeep, guildKeep, questKeep, serviceKeep] = filtering
    ? await Promise.all([
        keepLinked("user", "user_id", userRows.map((u: any) => u.user_id), filters),
        keepLinked("guild", "guild_id", (guilds.data ?? []).map((g: any) => g.id), filters),
        keepLinked("quest", "quest_id", (quests.data ?? []).map((x: any) => x.id), filters),
        keepLinked("service", "service_id", (services.data ?? []).map((x: any) => x.id), filters),
      ])
    : [null, null, null, null];

  const results: SearchResult[] = [];
  for (const u of userRows) {
    if (userKeep && !userKeep.has(u.user_id)) continue;
    results.push({ type: "USER", id: u.user_id, title: u.name ?? "Unknown", subtitle: u.headline ?? undefined, url: `/users/${u.user_id}`, imageUrl: u.avatar_url ?? undefined });
  }
  for (const g of guilds.data ?? []) {
    if (guildKeep && !guildKeep.has(g.id)) continue;
    results.push({ type: "GUILD", id: g.id, title: g.name, subtitle: g.description ?? undefined, url: `/guilds/${g.id}`, logoUrl: g.logo_url ?? undefined, imageUrl: g.banner_url ?? undefined });
  }
  for (const quest of quests.data ?? []) {
    if (questKeep && !questKeep.has(quest.id)) continue;
    results.push({ type: "QUEST", id: quest.id, title: quest.title, subtitle: quest.description ?? undefined, url: `/quests/${quest.id}`, imageUrl: quest.cover_image_url ?? undefined });
  }
  // Pods, companies and territories have no topic / territory filter (unchanged behaviour).
  for (const p of pods.data ?? []) {
    results.push({ type: "POD", id: p.id, title: p.name, subtitle: p.description ?? undefined, url: `/pods/${p.id}`, imageUrl: p.image_url ?? undefined });
  }
  for (const s of services.data ?? []) {
    if (serviceKeep && !serviceKeep.has(s.id)) continue;
    if (filters?.priceMin !== undefined && (s.price_amount ?? 0) < filters.priceMin) continue;
    if (filters?.priceMax !== undefined && (s.price_amount ?? 0) > filters.priceMax) continue;
    results.push({ type: "SERVICE", id: s.id, title: s.title, subtitle: `€${s.price_amount ?? 0}`, url: `/services/${s.id}`, imageUrl: s.image_url ?? undefined });
  }
  for (const c of companies.data ?? []) {
    results.push({ type: "COMPANY", id: c.id, title: c.name, subtitle: c.description ?? undefined, url: `/companies/${c.id}`, logoUrl: c.logo_url ?? undefined, imageUrl: c.banner_url ?? undefined });
  }
  for (const t of territories.data ?? []) {
    results.push({ type: "TERRITORY", id: t.id, title: t.name, subtitle: t.level ?? undefined, url: `/territories/${t.id}`, logoUrl: t.logo_url ?? undefined });
  }

  return results;
}
