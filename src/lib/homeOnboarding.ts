export const HOME_GUILD_FAVORITE_TARGET = 3;
export const HOME_TERRITORY_LIMIT = 6;

export interface TerritoryRecommendation {
  id: string;
  name: string;
  parent_name?: string | null;
  quests: number;
  entities: number;
  memoryContributions: number;
  topTopics: string[];
}

export interface TerritoryPreferences {
  topicNames: string[];
  territoryIds: string[];
  location?: string;
}

function normalized(value: string) {
  return value.trim().toLocaleLowerCase();
}

export function rankHomeTerritories<T extends TerritoryRecommendation>(
  territories: T[],
  preferences: TerritoryPreferences,
): T[] {
  const topicNames = new Set(preferences.topicNames.map(normalized));
  const attachedTerritories = new Set(preferences.territoryIds);
  const location = normalized(preferences.location ?? "");

  return territories
    .map((territory, index) => {
      const sharedTopics = territory.topTopics.filter((topic) => topicNames.has(normalized(topic))).length;
      const matchesLocation = location.length > 0 && [territory.name, territory.parent_name ?? ""]
        .some((name) => normalized(name).includes(location));
      const score =
        (attachedTerritories.has(territory.id) ? 1_000 : 0) +
        (matchesLocation ? 60 : 0) +
        sharedTopics * 30 +
        territory.quests * 3 +
        territory.entities * 2 +
        territory.memoryContributions;
      return { territory, score, index };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, HOME_TERRITORY_LIMIT)
    .map(({ territory }) => territory);
}

export interface GuildRecommendation {
  id: string;
  topicIds: string[];
  territoryIds: string[];
  memberCount: number;
}

export interface GuildPreferences {
  topicIds: string[];
  territoryIds: string[];
}

export function rankHomeGuilds<T extends GuildRecommendation>(
  guilds: T[],
  preferences: GuildPreferences,
): T[] {
  const topicIds = new Set(preferences.topicIds);
  const territoryIds = new Set(preferences.territoryIds);

  return guilds
    .map((guild, index) => {
      const sharedTopics = guild.topicIds.filter((id) => topicIds.has(id)).length;
      const sharedTerritories = guild.territoryIds.filter((id) => territoryIds.has(id)).length;
      const score = sharedTopics * 30 + sharedTerritories * 15 + Math.min(guild.memberCount, 5);
      return { guild, score, index };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ guild }) => guild);
}

export function remainingGuildFavorites(followedCount: number): number {
  return Math.max(0, HOME_GUILD_FAVORITE_TARGET - Math.max(0, followedCount));
}

export interface OwnGuildOption {
  id: string;
  name: string;
  isMember: boolean;
}

/** Guilds a person can pin: members first, then followed, alphabetical, filtered by search. */
export function sortOwnGuildOptions<T extends OwnGuildOption>(guilds: T[], search = ""): T[] {
  const query = normalized(search);
  return guilds
    .filter((guild) => !query || normalized(guild.name).includes(query))
    .sort((a, b) => Number(b.isMember) - Number(a.isMember) || a.name.localeCompare(b.name));
}

export function canAddGuildFavorite(favoriteCount: number): boolean {
  return favoriteCount < HOME_GUILD_FAVORITE_TARGET;
}
