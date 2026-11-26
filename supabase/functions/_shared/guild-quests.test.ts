import { assert, assertEquals } from "jsr:@std/assert@1";
import { guildQuests, isGuildAdmin, PUBLIC_FIELDS } from "./guild-quests.ts";
import { fakeAdmin } from "./fake-admin.test-helper.ts";

const G = "4964c699-4684-43a9-b508-cee21c77e24e";
const q = (id: string, o: Record<string, unknown> = {}) => ({
  id, title: id, description: "d", guild_id: G, is_deleted: false, is_draft: false, public_visibility: "public",
  web_visibility_override: "inherit", quest_nature: "PROJECT", status: "OPEN", coin_budget: 500, ctg_budget: 9,
  reward_xp: 50, created_by_user_id: "u-x", updated_at: "2026-11-01", ...o,
});

function base() {
  return fakeAdmin({
    guilds: [{ id: G, created_by_user_id: "u-createur", is_deleted: false }],
    guild_members: [{ guild_id: G, user_id: "u-admin", role: "ADMIN" }, { guild_id: G, user_id: "u-membre", role: "MEMBER" }],
    quests: [
      q("publique", { featured_order: 1 }),
      q("privee", { public_visibility: "private" }),
      q("non-listee", { public_visibility: "unlisted" }),
      q("brouillon", { is_draft: true }),
      q("supprimee", { is_deleted: true }),
      q("masquee", { web_visibility_override: "force_hidden" }),
      q("affiliee", { guild_id: "autre", updated_at: "2026-11-20" }),
      q("ailleurs", { guild_id: "autre" }),
    ],
    quest_affiliations: [
      { quest_id: "affiliee", entity_type: "GUILD", entity_id: G },
      { quest_id: "publique", entity_type: "GUILD", entity_id: G },
      { quest_id: "ailleurs", entity_type: "COMPANY", entity_id: G },
    ],
  });
}

Deno.test("public : seulement les quêtes publiques, publiées, non masquées, propres ou affiliées, sans doublon", async () => {
  const r = await guildQuests(base(), G, false);
  assertEquals(r.map((x) => x.id), ["publique", "affiliee"]);
});

Deno.test("public : aucun champ de budget, récompense ou personne", async () => {
  const [x] = await guildQuests(base(), G, false);
  assertEquals(Object.keys(x).sort(), [...PUBLIC_FIELDS, "url"].sort());
  assertEquals(x.url, "https://changethegame.xyz/quests/publique");
  for (const k of ["coin_budget", "ctg_budget", "reward_xp", "created_by_user_id", "is_draft", "public_visibility"]) assert(!(k in x));
});

Deno.test("admin : toutes les quêtes non supprimées, avec leurs réglages", async () => {
  const r = await guildQuests(base(), G, true);
  assertEquals(r.map((x) => x.id).sort(), ["affiliee", "brouillon", "masquee", "non-listee", "privee", "publique"]);
  const b = r.find((x) => x.id === "brouillon")!;
  assertEquals([b.is_draft, b.link], [true, "guild"]);
  assertEquals(r.find((x) => x.id === "affiliee")!.link, "affiliation");
  assert(!("coin_budget" in b));
});

Deno.test("admin : créateur ou rôle ADMIN seulement", async () => {
  const a = base();
  assertEquals(await isGuildAdmin(a, G, "u-createur"), true);
  assertEquals(await isGuildAdmin(a, G, "u-admin"), true);
  assertEquals(await isGuildAdmin(a, G, "u-membre"), false);
  assertEquals(await isGuildAdmin(a, "inconnue", "u-admin"), false);
});
