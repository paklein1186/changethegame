import { describe, expect, it } from "vitest";
import { canViewDemoFeveShowcase, demoFeveRequests, isDemoFeveEmail, summarizeDemoFeveRequests } from "../demoFeve";

describe("démo FEVE", () => {
  it("conserve exactement 27 demandes, 22 sans réponse et 9 appariements", () => {
    expect(summarizeDemoFeveRequests(demoFeveRequests)).toEqual({ requests: 27, unanswered: 22, matches: 9 });
  });

  it("reconnaît Maurice comme compte démo et exclut un compte réel", () => {
    expect(isDemoFeveEmail("demo+maurice@changethegame.xyz")).toBe(true);
    expect(isDemoFeveEmail("personne@example.com")).toBe(false);
  });

  it("ouvre la présentation fictive à tout compte connecté, mais pas aux visiteurs", () => {
    expect(canViewDemoFeveShowcase("compte-reel-123")).toBe(true);
    expect(canViewDemoFeveShowcase("demo-maurice-456")).toBe(true);
    expect(canViewDemoFeveShowcase(null)).toBe(false);
    expect(canViewDemoFeveShowcase(undefined)).toBe(false);
  });
});
