import { assert, assertEquals } from "jsr:@std/assert@1";
import { beneficiaryPlan, newCode, normalizeCode, slotsFromMetadata } from "./guild-euro-membership.ts";

Deno.test("un code neuf a la forme XXXX-XXXX-XXXX, sans caractères ambigus", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 2000; i++) {
    const c = newCode();
    assert(/^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/.test(c), c);
    assert(!/[01OIL]/.test(c), c);
    seen.add(c);
  }
  assertEquals(seen.size, 2000);
});

Deno.test("un code recopié à la main est reconnu", () => {
  assertEquals(normalizeCode("abcd efgh jkmn"), "ABCD-EFGH-JKMN");
  assertEquals(normalizeCode(" ABCD-EFGH-JKMN "), "ABCD-EFGH-JKMN");
  assertEquals(normalizeCode("abcdefghjkmn"), "ABCD-EFGH-JKMN");
});

Deno.test("un code invalide est refusé", () => {
  for (const v of ["", "ABCD-EFGH", "ABCD-EFGH-JKMN-PQRS", "ABCD-EFGH-JKM0", "ABCD-EFGH-JKMI", null, 42, undefined]) {
    assertEquals(normalizeCode(v), null, String(v));
  }
});

Deno.test("places payées lues dans les métadonnées Stripe", () => {
  assertEquals(slotsFromMetadata({ extra_persons: "2", small_places: "3", large_places: "0" }), {
    extra_person: 2, small_place: 3, large_place: 0,
  });
  assertEquals(slotsFromMetadata({ small_places: "-1", large_places: "1.5", extra_persons: "9999" }), {
    extra_person: 0, small_place: 0, large_place: 0,
  });
  assertEquals(slotsFromMetadata(undefined), { extra_person: 0, small_place: 0, large_place: 0 });
});

Deno.test("formule du bénéficiaire selon le type de place", () => {
  const gal = { code: "partenaire_beneficiaire", small_place_plan_code: "lieu_moins_20", large_place_plan_code: "lieu_20_et_plus" };
  assertEquals(beneficiaryPlan(gal, "small_place"), "lieu_moins_20");
  assertEquals(beneficiaryPlan(gal, "large_place"), "lieu_20_et_plus");
  const orga = { code: "accompagnant_organisation" };
  assertEquals(beneficiaryPlan(orga, "extra_person"), "accompagnant_organisation");
  assertEquals(beneficiaryPlan(orga, "small_place"), null);
});
