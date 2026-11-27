import { describe, it, expect } from "vitest";
import { duesState } from "./guildDues";
const day = 864e5, now = Date.parse("2026-11-28T00:00:00Z");
const iso = (d: number) => new Date(now + d * day).toISOString();
describe("duesState", () => {
  it("en ordre avec une formule active", () => expect(duesState([{ status: "active", current_period_end: iso(10), membership_expires_at: null }], now).ok).toBe(true));
  it("échue quand la formule est passée", () => expect(duesState([{ status: "active", current_period_end: iso(-1), membership_expires_at: null }], now).kind).toBe("lapsed"));
  it("délai de grâce de 7 jours", () => expect(duesState([{ status: "grace", current_period_end: iso(-3), membership_expires_at: null }], now).ok).toBe(true));
  it("aucune cotisation", () => expect(duesState([], now).kind).toBe("none"));
});
