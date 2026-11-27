import { describe, expect, it } from "vitest";
import { demoFeveRequests, isDemoFeveEmail, summarizeDemoFeveRequests } from "../demoFeve";

describe("démo FEVE", () => {
  it("conserve exactement 27 demandes, 22 sans réponse et 9 appariements", () => {
    expect(summarizeDemoFeveRequests(demoFeveRequests)).toEqual({ requests: 27, unanswered: 22, matches: 9 });
  });

  it("reconnaît Maurice comme compte démo et exclut un compte réel", () => {
    expect(isDemoFeveEmail("demo+maurice@changethegame.xyz")).toBe(true);
    expect(isDemoFeveEmail("personne@example.com")).toBe(false);
  });
});
