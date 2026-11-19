import { assert, assertEquals } from "jsr:@std/assert@1";
import { activateFromSubscription, redeemCode } from "./guild-euro-membership.ts";
import { fakeAdmin } from "./fake-admin.test-helper.ts";

const GUILD = "4964c699-4684-43a9-b508-cee21c77e24e";
const GAL = "user-gal";
const LIEU = "user-lieu";
const fin = (jours: number) => new Date(Date.now() + jours * 86400_000).toISOString();
const ts = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);

function base() {
  return fakeAdmin(
    {
      guilds: [{ id: GUILD, name: "Trois-Tiers", stripe_account_ref: "GUILD", created_by_user_id: "user-admin" }],
      guild_membership_plans: [
        { guild_id: GUILD, code: "partenaire_beneficiaire", badge_codes: ["adherent"], small_place_plan_code: "lieu_moins_20", large_place_plan_code: "lieu_20_et_plus" },
        { guild_id: GUILD, code: "lieu_moins_20", badge_codes: ["adherent"] },
        { guild_id: GUILD, code: "lieu_20_et_plus", badge_codes: ["adherent"] },
      ],
      entity_roles: [],
      entity_member_roles: [],
      user_guild_memberships: [],
      guild_members: [],
      guild_membership_codes: [],
      notifications: [],
    },
    { guild_members: ["guild_id", "user_id"] },
  );
}

const abonnement = (end: string, extra: Record<string, string> = {}) => ({
  id: "sub_gal",
  customer: "cus_gal",
  current_period_end: ts(end),
  cancel_at_period_end: false,
  metadata: { kind: "guild_membership", guild_id: GUILD, user_id: GAL, plan_code: "partenaire_beneficiaire", small_places: "2", large_places: "1", ...extra },
});

Deno.test("le paiement d'un GAL crée un code par lieu payé, sans doublon si l'activation est rejouée", async () => {
  const db = base();
  const end = fin(365);
  await activateFromSubscription(db, "GUILD", abonnement(end), 59000, "eur", false);
  await activateFromSubscription(db, "GUILD", abonnement(end), 59000, "eur", false); // webhook + confirmation
  const codes = db.tables.guild_membership_codes;
  assertEquals(codes.length, 3);
  assertEquals(codes.filter((c) => c.plan_code === "lieu_moins_20").length, 2);
  assertEquals(codes.filter((c) => c.plan_code === "lieu_20_et_plus").length, 1);
  assert(codes.every((c) => c.payer_user_id === GAL && c.valid_until === new Date(ts(end) * 1000).toISOString()));
});

Deno.test("un lieu utilise son code : adhésion active, badge adhérent daté, lié à l'abonnement du GAL", async () => {
  const db = base();
  await activateFromSubscription(db, "GUILD", abonnement(fin(365)), 59000, "eur", false);
  const code = db.tables.guild_membership_codes.find((c) => c.slot === "small_place")!.code;

  const r = await redeemCode(db, LIEU, code.toLowerCase().replaceAll("-", " "));
  assert(r.ok);
  const m = db.tables.user_guild_memberships.find((x) => x.user_id === LIEU)!;
  assertEquals([m.role, m.status, m.plan_code, m.payer_user_id, m.stripe_subscription_id], ["member", "active", "lieu_moins_20", GAL, "sub_gal"]);
  const badge = db.tables.entity_member_roles.find((x) => x.user_id === LIEU)!;
  assertEquals(badge.expires_at, m.current_period_end);
  assertEquals(db.tables.notifications.filter((n) => n.user_id === GAL).length, 1);

  // La même personne qui ressaisit son code : pas d'erreur, rien en double.
  assert((await redeemCode(db, LIEU, code)).ok);
  assertEquals(db.tables.notifications.filter((n) => n.user_id === GAL).length, 1);
});

Deno.test("un code ne sert qu'une fois", async () => {
  const db = base();
  await activateFromSubscription(db, "GUILD", abonnement(fin(365)), 59000, "eur", false);
  const code = db.tables.guild_membership_codes[0].code;
  assert((await redeemCode(db, LIEU, code)).ok);
  assertEquals(await redeemCode(db, "autre-lieu", code), { ok: false, reason: "used" });
});

Deno.test("refus : code inconnu, expiré, révoqué, utilisé par le payeur, personne déjà adhérente", async () => {
  const db = base();
  await activateFromSubscription(db, "GUILD", abonnement(fin(365)), 59000, "eur", false);
  const [a, b, c] = db.tables.guild_membership_codes;
  assertEquals(await redeemCode(db, LIEU, "ZZZZ-ZZZZ-ZZZZ"), { ok: false, reason: "invalid" });
  assertEquals(await redeemCode(db, LIEU, "pas un code"), { ok: false, reason: "invalid" });
  assertEquals(await redeemCode(db, GAL, a.code), { ok: false, reason: "own_code" });
  a.valid_until = fin(-1);
  assertEquals(await redeemCode(db, LIEU, a.code), { ok: false, reason: "expired" });
  b.revoked_at = fin(0);
  assertEquals(await redeemCode(db, LIEU, b.code), { ok: false, reason: "invalid" });
  db.tables.user_guild_memberships.push({ guild_id: GUILD, user_id: "deja", role: "member", status: "active", stripe_subscription_id: "sub_autre", current_period_end: fin(100) });
  assertEquals(await redeemCode(db, "deja", c.code), { ok: false, reason: "already_member" });
  assertEquals(c.redeemed_by_user_id ?? null, null); // le code reste disponible
});

Deno.test("un observateur (invité sans cotisation) peut utiliser un code", async () => {
  const db = base();
  await activateFromSubscription(db, "GUILD", abonnement(fin(365)), 59000, "eur", false);
  db.tables.user_guild_memberships.push({ guild_id: GUILD, user_id: LIEU, role: "guest", status: "active", joined_at: "2026-01-01T00:00:00Z" });
  assert((await redeemCode(db, LIEU, db.tables.guild_membership_codes[0].code)).ok);
  const m = db.tables.user_guild_memberships.find((x) => x.user_id === LIEU)!;
  assertEquals([m.role, m.joined_at], ["member", "2026-01-01T00:00:00Z"]);
});

Deno.test("le renouvellement du GAL prolonge les codes et les lieux qui les ont utilisés", async () => {
  const db = base();
  const an1 = fin(365), an2 = fin(730);
  await activateFromSubscription(db, "GUILD", abonnement(an1), 59000, "eur", false);
  await redeemCode(db, LIEU, db.tables.guild_membership_codes[0].code);
  await activateFromSubscription(db, "GUILD", abonnement(an2), 59000, "eur", false);
  const attendu = new Date(ts(an2) * 1000).toISOString();
  assert(db.tables.guild_membership_codes.every((c) => c.valid_until === attendu));
  const m = db.tables.user_guild_memberships.find((x) => x.user_id === LIEU)!;
  assertEquals([m.current_period_end, m.membership_expires_at], [attendu, attendu]);
  assertEquals(db.tables.entity_member_roles.find((x) => x.user_id === LIEU)!.expires_at, attendu);
  // Le payeur n'est pas compté parmi les bénéficiaires.
  assertEquals(db.tables.user_guild_memberships.find((x) => x.user_id === GAL)!.plan_code, "partenaire_beneficiaire");
});

Deno.test("une formule sans place pour d'autres ne crée aucun code", async () => {
  const db = base();
  await activateFromSubscription(db, "GUILD", abonnement(fin(365), { plan_code: "lieu_moins_20", small_places: "0", large_places: "0" }), 6000, "eur", false);
  assertEquals(db.tables.guild_membership_codes.length, 0);
});
