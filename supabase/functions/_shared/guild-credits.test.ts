import { assert, assertEquals } from "jsr:@std/assert@1";
import { creditMetadata, expiryAfter, grantCreditsFromSession } from "./guild-credits.ts";
import { fakeAdmin } from "./fake-admin.test-helper.ts";

const GUILD = "4964c699-4684-43a9-b508-cee21c77e24e";
const PACK = { code: "pack_100", credits: 100, valid_months: 12 };

const base = () =>
  fakeAdmin({
    guilds: [{ id: GUILD, name: "Trois-Tiers", stripe_account_ref: "GUILD" }],
    guild_credit_purchases: [],
  });

const session = (extra: Record<string, unknown> = {}) => ({
  id: "cs_test_pack1",
  mode: "payment",
  payment_status: "paid",
  amount_total: 1500,
  currency: "eur",
  payment_intent: "pi_1",
  metadata: creditMetadata(GUILD, "user-pa", "GUILD", PACK),
  ...extra,
});

Deno.test("un pack payé est crédité une seule fois (webhook puis page de retour)", async () => {
  const db = base();
  const a = await grantCreditsFromSession(db, "GUILD", session());
  const b = await grantCreditsFromSession(db, "GUILD", session());
  assertEquals(db.tables.guild_credit_purchases.length, 1);
  assertEquals(a?.credits, 100);
  assertEquals(b?.credits_remaining, 100);
  const achat = db.tables.guild_credit_purchases[0];
  assertEquals([achat.user_id, achat.pack_code, achat.amount_cents, achat.stripe_payment_intent_id], ["user-pa", "pack_100", 1500, "pi_1"]);
  // valide 12 mois
  const mois = (new Date(achat.expires_at).getTime() - new Date(achat.purchased_at).getTime()) / 86400_000;
  assert(mois > 360 && mois < 370);
});

Deno.test("rien n'est crédité sans paiement, pour un autre compte Stripe ou une cotisation", async () => {
  const db = base();
  assertEquals(await grantCreditsFromSession(db, "GUILD", session({ payment_status: "unpaid" })), null);
  assertEquals(await grantCreditsFromSession(db, "AUTRE", session()), null);
  assertEquals(await grantCreditsFromSession(db, "GUILD", session({ mode: "subscription" })), null);
  assertEquals(await grantCreditsFromSession(db, "GUILD", session({ metadata: { kind: "guild_membership", guild_id: GUILD, user_id: "u" } })), null);
  assertEquals(await grantCreditsFromSession(db, "GUILD", session({ metadata: { ...creditMetadata(GUILD, "u", "GUILD", PACK), credits: "-5" } })), null);
  assertEquals(db.tables.guild_credit_purchases.length, 0);
});

Deno.test("pack sans durée : pas d'expiration", async () => {
  const db = base();
  const achat = await grantCreditsFromSession(db, "GUILD", session({ metadata: creditMetadata(GUILD, "u", "GUILD", { code: "p", credits: 20, valid_months: null }) }));
  assertEquals(achat?.expires_at, null);
});

Deno.test("expiration : fin de mois respectée", () => {
  assertEquals(expiryAfter(new Date("2026-01-31T10:00:00Z"), 1), "2026-02-28T10:00:00.000Z");
  assertEquals(expiryAfter(new Date("2026-11-20T10:00:00Z"), 12), "2027-11-20T10:00:00.000Z");
  assertEquals(expiryAfter(new Date(), null), null);
});
