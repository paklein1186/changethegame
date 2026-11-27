import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";
import { decideProposal, listNeeds, listProposals, pushNeeds } from "./guild-quest-needs.ts";
import { SOURCE } from "./guild-quest-sync.ts";
import { fakeAdmin } from "./fake-admin.test-helper.ts";

const G = "4964c699-4684-43a9-b508-cee21c77e24e";
const P = "2cf01a9b-a263-440d-b877-8dc91dad79f7";
const Q = "aaaaaaaa-0000-0000-0000-000000000001";
const U = "00000000-0000-0000-0000-0000000000d1";
const AUTRE = "00000000-0000-0000-0000-0000000000e9";
const base = () => fakeAdmin({
  quests: [{ id: Q, guild_id: G, is_deleted: false, created_by_user_id: "createur" }, { id: "q-x", guild_id: G, is_deleted: false }],
  quest_external_links: [{ quest_id: Q, source: SOURCE, external_id: P }],
  quest_needs: [{ id: "bbbbbbbb-0000-0000-0000-00000000c7c1", quest_id: Q, title: "Une salle", description: null, category: "PLACE", status: "OPEN", updated_at: "2026-11-28T10:00:00Z" },
                { id: "bbbbbbbb-0000-0000-0000-00000000a07e", quest_id: "q-x", title: "Ailleurs", status: "OPEN" }],
  quest_need_external_links: [],
  guild_members: [{ guild_id: G, user_id: U }],
  quest_proposals: [
    { id: "11111111-0000-0000-0000-000000000001", quest_id: Q, need_id: "bbbbbbbb-0000-0000-0000-00000000c7c1", status: "PENDING", proposer_type: "USER", proposer_id: AUTRE, title: "J'ai une salle", requested_credits: 0, requested_fiat: 0 },
    { id: "11111111-0000-0000-0000-000000000002", quest_id: Q, need_id: null, status: "PENDING", proposer_type: "USER", proposer_id: AUTRE, title: "Contre crédits", requested_credits: 50, requested_fiat: 0 },
    { id: "11111111-0000-0000-0000-000000000003", quest_id: Q, need_id: "bbbbbbbb-0000-0000-0000-00000000c7c1", status: "REJECTED", proposer_type: "USER", proposer_id: AUTRE, title: "Ancienne" },
  ],
  profiles: [{ user_id: AUTRE, name: "Camille", email: "camille@ex.org" }],
  notifications: [],
}, { quest_need_external_links: ["source", "external_id"] });

Deno.test("besoins (B4) : liste avec compteurs, sans lien pour un besoin né sur CTG", async () => {
  const r = await listNeeds(base(), G, P, Q);
  assertEquals(r.besoins.length, 1);
  assertEquals(r.besoins[0], { need_id: "bbbbbbbb-0000-0000-0000-00000000c7c1", external_id: null, titre: "Une salle", description: null, categorie: "PLACE", statut: "OPEN",
    maj_le: "2026-11-28T10:00:00Z", propositions_en_attente: 1 });
  assertEquals(r.propositions_sans_besoin, 1);
});

Deno.test("besoins : création reliée, une seule fois ; reprise d'un besoin né sur CTG ; retrait = fermé", async () => {
  const a = base();
  const r1 = await pushNeeds(a, G, P, Q, [{ id: "b1", titre: "Bénévoles", categorie: "volunteer" }, { id: "b2", need_id: "bbbbbbbb-0000-0000-0000-00000000c7c1", titre: "Une grande salle", categorie: "PLACE" }], U);
  assertEquals(r1.besoins.map((b: any) => b.id), ["b1", "b2"]);
  assertEquals(r1.besoins[1].need_id, "bbbbbbbb-0000-0000-0000-00000000c7c1");
  const cree = a.tables.quest_needs.find((n: any) => n.title === "Bénévoles")!;
  assertEquals([cree.category, cree.created_by_user_id, cree.quest_id], ["VOLUNTEER", U, Q]);
  assertEquals(a.tables.quest_needs.find((n: any) => n.id === "bbbbbbbb-0000-0000-0000-00000000c7c1")!.title, "Une grande salle");
  await pushNeeds(a, G, P, Q, [{ id: "b1", titre: "Bénévoles (10)", categorie: "VOLUNTEER" }]);
  assertEquals(a.tables.quest_needs.filter((n: any) => n.quest_id === Q).length, 2);
  await pushNeeds(a, G, P, Q, [{ id: "b1", supprime: true }]);
  assertEquals(a.tables.quest_needs.find((n: any) => n.id === cree.id)!.status, "CLOSED");
  assertEquals((await listNeeds(a, G, P, Q)).besoins.find((b: any) => b.need_id === cree.id)!.external_id, "b1");
});

Deno.test("besoins : refus hors quête reliée, besoin d'une autre quête, catégorie inconnue ; auteur hors guilde → créateur", async () => {
  const a = base();
  await assertRejects(() => pushNeeds(a, G, P, "q-x", [{ id: "b1", titre: "x" }]));
  await assertRejects(() => pushNeeds(a, G, P, Q, [{ id: "b1", titre: "x", categorie: "ARGENT" }]));
  await pushNeeds(a, G, P, Q, [{ id: "b9", need_id: "bbbbbbbb-0000-0000-0000-00000000a07e", titre: "Volé ?" }], AUTRE);
  assertEquals(a.tables.quest_needs.find((n: any) => n.id === "bbbbbbbb-0000-0000-0000-00000000a07e")!.title, "Ailleurs");
  assertEquals(a.tables.quest_needs.find((n: any) => n.title === "Volé ?")!.created_by_user_id, "createur");
});

Deno.test("propositions : lues en direct, nom sans e-mail ; toutes acceptables, contrepartie à suivre sans versement ; une seule fois", async () => {
  const a = base();
  const l = await listProposals(a, G, P, Q);
  assertEquals(l.propositions.length, 2);
  assertEquals(l.propositions[0].nom, "Camille");
  assert(!JSON.stringify(l).includes("camille@ex.org"));
  assertEquals(l.propositions.map((p: any) => p.contrepartie_a_suivre), [false, true]);
  const r = await decideProposal(a, G, P, Q, "11111111-0000-0000-0000-000000000001", "accept", U);
  assertEquals([r.statut, r.par, r.contrepartie_a_suivre], ["ACCEPTED", U, false]);
  assertEquals(a.tables.notifications[0].user_id, AUTRE);
  await assertRejects(() => decideProposal(a, G, P, Q, "11111111-0000-0000-0000-000000000001", "reject", U));
  const r2 = await decideProposal(a, G, P, Q, "11111111-0000-0000-0000-000000000002", "accept", U);
  assertEquals([r2.statut, r2.contrepartie_a_suivre], ["ACCEPTED", true]);
  assert(a.tables.notifications[1].body.includes("50 crédits"));
  assert(a.tables.notifications[1].body.includes("rien n'a été versé"));
  assertEquals((await listNeeds(a, G, P, Q)).besoins[0].propositions_en_attente, 0);
});
