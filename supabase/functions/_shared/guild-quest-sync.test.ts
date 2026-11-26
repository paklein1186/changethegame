import { assert, assertEquals, assertRejects, assertThrows } from "jsr:@std/assert@1";
import { createQuest, questFields, sameKey, SyncError, updateQuest } from "./guild-quest-sync.ts";
import { fakeAdmin } from "./fake-admin.test-helper.ts";

const G = "4964c699-4684-43a9-b508-cee21c77e24e";
const P = "2cf01a9b-a263-440d-b877-8dc91dad79f7";
const ORIG = ["https://troistiers.space"];
const face = (o: Record<string, unknown> = {}) => ({
  titre: "Journée de clôture", resume: "Retours d'expérience.", besoins: "relayer", nature: "PROJECT", statut: "OPEN",
  etiquettes: ["famille:coordination"], lien_retour: `https://troistiers.space/projets/${P}`, audience: "public", ...o,
});
const base = () => fakeAdmin({ quests: [{ id: "autre", guild_id: "x", is_deleted: false }], quest_external_links: [] },
  { quest_external_links: ["source", "external_id"] });

Deno.test("face : seuls les champs de présentation, besoins dans la description", () => {
  const f = questFields(face({ budget: 9000, obstacles: "secret" } as any), ORIG);
  assertEquals(Object.keys(f).sort(), ["description", "public_visibility", "quest_nature", "status", "title", "web_tags", "website_url"]);
  assertEquals(f.description, "Retours d'expérience.\n\nBesoins : relayer");
  assertEquals(f.public_visibility, "public");
});

Deno.test("face : refuse nature inconnue, adresse hors du site, titre vide ; audience guilde → privée", () => {
  assertThrows(() => questFields(face({ nature: "ACHIEVEMENT" }), ORIG), SyncError);
  assertThrows(() => questFields(face({ lien_retour: "https://evil.example/projets/x" }), ORIG), SyncError);
  assertThrows(() => questFields(face({ titre: " " }), ORIG), SyncError);
  assertEquals(questFields(face({ audience: "guilde" }), ORIG).public_visibility, "private");
});

Deno.test("création : quête de la guilde, reliée ; une seconde publication renvoie la même", async () => {
  const a = base();
  const r1 = await createQuest(a, G, "u-coord", P, questFields(face(), ORIG));
  assert(r1.created);
  const r2 = await createQuest(a, G, "u-coord", P, questFields(face(), ORIG));
  assertEquals([r2.quest_id, r2.created], [r1.quest_id, false]);
  const { data: qs } = await a.from("quests").select("*").eq("guild_id", G);
  assertEquals(qs.length, 1);
  assertEquals([qs[0].owner_type, qs[0].created_by_user_id, qs[0].is_draft], ["GUILD", "u-coord", false]);
});

Deno.test("mise à jour : seulement la quête reliée à ce projet, dans la guilde", async () => {
  const a = base();
  const { quest_id } = await createQuest(a, G, "u-coord", P, questFields(face(), ORIG));
  await updateQuest(a, G, P, quest_id, questFields(face({ titre: "Nouveau titre", audience: null }), ORIG));
  const { data: q } = await a.from("quests").select("*").eq("id", quest_id).maybeSingle();
  assertEquals([q.title, q.public_visibility, q.created_by_user_id], ["Nouveau titre", "private", "u-coord"]);
  await assertRejects(() => updateQuest(a, G, P, "autre", questFields(face(), ORIG)), SyncError);
  await assertRejects(() => updateQuest(a, G, "11111111-1111-1111-1111-111111111111", quest_id, questFields(face(), ORIG)), SyncError);
});

Deno.test("clé du site : comparaison stricte", () => {
  assert(sameKey("a".repeat(40), "a".repeat(40)));
  assert(!sameKey("a".repeat(40), "a".repeat(39) + "b"));
  assert(!sameKey("", ""));
});
