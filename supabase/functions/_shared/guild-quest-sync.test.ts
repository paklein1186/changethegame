import { assert, assertEquals, assertRejects, assertThrows } from "jsr:@std/assert@1";
import { accessEnforced, createQuest, publishNews, questFields, sameKey, SyncError, updateQuest, visibilityFields, withdrawQuest } from "./guild-quest-sync.ts";
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

Deno.test("retrait : brouillon privé, sans rien écrire d'autre ; une face publique la remet en ligne", async () => {
  const a = base();
  const { quest_id } = await createQuest(a, G, "u-coord", P, questFields(face(), ORIG));
  await withdrawQuest(a, G, P, quest_id);
  let { data: q } = await a.from("quests").select("*").eq("id", quest_id).maybeSingle();
  assertEquals([q.is_draft, q.public_visibility, q.title], [true, "private", "Journée de clôture"]);
  await updateQuest(a, G, P, quest_id, questFields(face(), ORIG));
  ({ data: q } = await a.from("quests").select("*").eq("id", quest_id).maybeSingle());
  assertEquals([q.is_draft, q.public_visibility], [false, "public"]);
  await assertRejects(() => withdrawQuest(a, G, P, "autre"), SyncError);
});

Deno.test("visibilité : public, membres N2 / N3 ; tout le reste refusé ; absente = ancien format", () => {
  assertEquals(visibilityFields({ mode: "public" }), { access_mode: "public", public_visibility: "public" });
  assertEquals(visibilityFields({ mode: "membres", niveau_minimum: "N3" }),
    { access_mode: "members", access_min_level: "N3", public_visibility: "private" });
  assertThrows(() => visibilityFields({ mode: "membres" }), SyncError);
  assertThrows(() => visibilityFields({ mode: "membres", niveau_minimum: "N4" }), SyncError);
  assertThrows(() => visibilityFields({ mode: "cache" }), SyncError);
  assertEquals(visibilityFields(undefined), null);
});

Deno.test("protection mesurée : vrai seulement si la base le confirme", async () => {
  assertEquals(await accessEnforced({ rpc: async () => ({ data: true, error: null }) }), true);
  assertEquals(await accessEnforced({ rpc: async () => ({ data: null, error: { message: "function does not exist" } }) }), false);
  assertEquals(await accessEnforced({ rpc: async () => { throw new Error("réseau"); } }), false);
  assertEquals(await accessEnforced({}), false);
});

Deno.test("mise à jour « membres » : remet en ligne une quête retirée, sans l'exposer sur le web", async () => {
  const a = base();
  const fields = { ...questFields(face(), ORIG), ...visibilityFields({ mode: "membres", niveau_minimum: "N2" })! };
  const { quest_id } = await createQuest(a, G, "u-coord", P, { ...questFields(face(), ORIG), access_mode: "public" });
  await withdrawQuest(a, G, P, quest_id);
  await updateQuest(a, G, P, quest_id, fields);
  const q = a.tables.quests.find((x: any) => x.id === quest_id);
  assertEquals([q!.is_draft, q!.public_visibility, q!.access_mode, q!.access_min_level], [false, "private", "members", "N2"]);
});

Deno.test("nouvelle (B3) : publiée une seule fois sur la quête reliée, auteur membre de la guilde sinon créateur", async () => {
  const a = fakeAdmin({ quests: [], quest_external_links: [], quest_updates: [], quest_update_external_links: [],
    guild_members: [{ guild_id: G, user_id: "11111111-1111-4111-8111-111111111111" }] },
    { quest_external_links: ["source", "external_id"], quest_update_external_links: ["source", "external_id"] });
  const { quest_id } = await createQuest(a, G, "u-coord", P, questFields(face(), ORIG));
  const n = { id: "n-1", titre: "Étape : déploiement", texte: "Le projet passe au déploiement." };
  const r1 = await publishNews(a, G, P, quest_id, n, "11111111-1111-4111-8111-111111111111");
  assert(r1.created);
  const r2 = await publishNews(a, G, P, quest_id, n, "11111111-1111-4111-8111-111111111111");
  assertEquals([r2.update_id, r2.created], [r1.update_id, false]);
  const { data: ups } = await a.from("quest_updates").select("*").eq("quest_id", quest_id);
  assertEquals(ups.length, 1);
  assertEquals([ups[0].author_id, ups[0].title, ups[0].posted_as_label], ["11111111-1111-4111-8111-111111111111", "Étape : déploiement", "Trois-Tiers"]);
  const r3 = await publishNews(a, G, P, quest_id, { id: "n-2", titre: "Autre" }, "22222222-2222-4222-8222-222222222222");
  const { data: u3 } = await a.from("quest_updates").select("*").eq("id", r3.update_id).maybeSingle();
  assertEquals(u3.author_id, "u-coord");
  await assertRejects(() => publishNews(a, G, P, "autre", n), SyncError);
  await assertRejects(() => publishNews(a, G, P, quest_id, { id: "", titre: "x" }), SyncError);
});
