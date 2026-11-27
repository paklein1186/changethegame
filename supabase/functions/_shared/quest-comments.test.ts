import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";
import { listComments, postComment, questOfGuild } from "./quest-comments.ts";
import { fakeAdmin } from "./fake-admin.test-helper.ts";

const G = "4964c699-4684-43a9-b508-cee21c77e24e";
const Q = "aaaaaaaa-0000-0000-0000-000000000001";
const U = "00000000-0000-0000-0000-0000000000d1";
const base = (acces = true) => {
  const a: any = fakeAdmin({
    quests: [{ id: Q, guild_id: G, is_deleted: false }, { id: "bbbbbbbb-0000-0000-0000-000000000001", guild_id: "autre", is_deleted: false }],
    comments: [
      { id: "cccccccc-0000-0000-0000-000000000001", content: "Bonjour", author_id: U, target_type: "QUEST", target_id: Q, is_deleted: false, created_at: "2026-11-28T10:00:00Z" },
      { id: "cccccccc-0000-0000-0000-000000000002", content: "Supprimé", author_id: U, target_type: "QUEST", target_id: Q, is_deleted: true, created_at: "2026-11-28T10:01:00Z" },
      { id: "cccccccc-0000-0000-0000-000000000003", content: "Ailleurs", author_id: U, target_type: "QUEST_UPDATE", target_id: Q, is_deleted: false, created_at: "2026-11-28T10:02:00Z" },
    ],
    profiles: [{ user_id: U, name: "Référente", avatar_url: null, email: "ref@ex.org" }],
  });
  a.rpc = async () => ({ data: acces, error: null });
  return a;
};

Deno.test("commentaires : quête de la guilde seulement", async () => {
  const a = base();
  await questOfGuild(a, G, Q);
  await assertRejects(() => questOfGuild(a, G, "bbbbbbbb-0000-0000-0000-000000000001"));
  await assertRejects(() => questOfGuild(a, G, "pas-un-uuid"));
});

Deno.test("commentaires : liste du fil de la quête, sans supprimés ni autres cibles, nom sans e-mail", async () => {
  const a = base();
  const r = await listComments(a, a, Q, U);
  assertEquals(r.commentaires.map((c: any) => c.contenu), ["Bonjour"]);
  assertEquals([r.commentaires[0].auteur.nom, r.commentaires[0].de_moi, r.peut_ecrire], ["Référente", true, true]);
  assert(!JSON.stringify(r).includes("ref@ex.org"));
  assertEquals((await listComments(a, a, Q, null)).peut_ecrire, false);
  assertEquals((await listComments(base(false), a, Q, U)).peut_ecrire, false);
});

Deno.test("commentaires : poster au nom de la personne, réponse dans le même fil seulement", async () => {
  const a = base();
  const r = await postComment(a, Q, U, "  Je peux aider pour la salle.  ", "cccccccc-0000-0000-0000-000000000001");
  const c = a.tables.comments.find((x: any) => x.id === r.id)!;
  assertEquals([c.content, c.author_id, c.target_type, c.target_id, c.parent_id], ["Je peux aider pour la salle.", U, "QUEST", Q, "cccccccc-0000-0000-0000-000000000001"]);
  await assertRejects(() => postComment(a, Q, U, "   "));
  await assertRejects(() => postComment(a, Q, U, "x".repeat(4001)));
  await assertRejects(() => postComment(a, Q, U, "réponse", "cccccccc-0000-0000-0000-000000000003"));
});
