import { describe, expect, it } from "vitest";
import {
  HOME_GUILD_FAVORITE_TARGET,
  HOME_TERRITORY_LIMIT,
  rankHomeGuilds,
  rankHomeTerritories,
  remainingGuildFavorites,
  type GuildRecommendation,
  type TerritoryRecommendation,
} from "../homeOnboarding";

function territory(id: string, overrides: Partial<TerritoryRecommendation> = {}): TerritoryRecommendation {
  return { id, name: id, quests: 0, entities: 0, memoryContributions: 0, topTopics: [], ...overrides };
}

function guild(id: string, overrides: Partial<GuildRecommendation> = {}): GuildRecommendation {
  return { id, topicIds: [], territoryIds: [], memberCount: 0, ...overrides };
}

describe("home onboarding recommendations", () => {
  it("shows at most six territories, prioritizing attached territories and shared topics", () => {
    const items = Array.from({ length: 8 }, (_, index) => territory(`t${index}`, { quests: index }));
    items[6].topTopics = ["Climate"];
    items[7].quests = 0;

    const selected = rankHomeTerritories(items, { topicNames: ["climate"], territoryIds: ["t7"] });

    expect(HOME_TERRITORY_LIMIT).toBe(6);
    expect(selected).toHaveLength(6);
    expect(selected[0].id).toBe("t7");
    expect(selected[1].id).toBe("t6");
  });

  it("uses real activity to rank territories when the profile is empty", () => {
    const selected = rankHomeTerritories(
      [territory("quiet", { quests: 1 }), territory("active", { quests: 4, entities: 2 })],
      { topicNames: [], territoryIds: [] },
    );

    expect(selected.map((item) => item.id)).toEqual(["active", "quiet"]);
  });

  it("prioritizes a territory matching the location already entered", () => {
    const selected = rankHomeTerritories(
      [
        territory("elsewhere", { name: "Lyon", quests: 20 }),
        territory("home", { name: "Saint-Étienne", quests: 1 }),
      ],
      { topicNames: [], territoryIds: [], location: "étienne" },
    );

    expect(selected[0].id).toBe("home");
  });

  it("ranks guilds by shared topics before shared territories and activity", () => {
    const selected = rankHomeGuilds(
      [
        guild("active-only", { memberCount: 20 }),
        guild("same-place", { territoryIds: ["territory-1"] }),
        guild("same-interest", { topicIds: ["topic-1"] }),
      ],
      { topicIds: ["topic-1"], territoryIds: ["territory-1"] },
    );

    expect(selected.map((item) => item.id)).toEqual(["same-interest", "same-place", "active-only"]);
  });

  it("asks for three guild favorites and never a negative number", () => {
    expect(HOME_GUILD_FAVORITE_TARGET).toBe(3);
    expect(remainingGuildFavorites(0)).toBe(3);
    expect(remainingGuildFavorites(2)).toBe(1);
    expect(remainingGuildFavorites(3)).toBe(0);
    expect(remainingGuildFavorites(8)).toBe(0);
  });
});

import { canAddGuildFavorite, sortOwnGuildOptions } from "@/lib/homeOnboarding";

describe("guild favorites picker", () => {
  it("allows at most three favorites", () => {
    expect(canAddGuildFavorite(2)).toBe(true);
    expect(canAddGuildFavorite(3)).toBe(false);
  });
  it("lists member guilds before followed ones and filters by search", () => {
    const list = [
      { id: "a", name: "Zeta", isMember: true },
      { id: "b", name: "Alpha", isMember: false },
      { id: "c", name: "Beta", isMember: true },
    ];
    expect(sortOwnGuildOptions(list).map((g) => g.id)).toEqual(["c", "a", "b"]);
    expect(sortOwnGuildOptions(list, "alp").map((g) => g.id)).toEqual(["b"]);
  });
});

import { isProfileSparse } from "@/lib/homeOnboarding";

describe("Pulse reminder", () => {
  const full = { headline: "Designer", bio: "x".repeat(101), topicCount: 2 };
  it("hides for a filled profile", () => expect(isProfileSparse(full)).toBe(false));
  it("shows without headline, short bio or topics", () => {
    expect(isProfileSparse({ ...full, headline: "" })).toBe(true);
    expect(isProfileSparse({ ...full, bio: "court" })).toBe(true);
    expect(isProfileSparse({ ...full, topicCount: 0 })).toBe(true);
  });
});
