import { afterEach, describe, expect, it, vi } from "vitest";
import { isPrivateHost, publicOrigin } from "../shareUrl";

const PRODUCTION = "https://changethegame.xyz";

describe("adresse publique des liens envoyés à quelqu'un", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reconnaît l'adresse de l'aperçu Lovable", () => {
    expect(
      isPrivateHost("d773ed43-bf03-4220-9566-7048900e3329.lovableproject.com"),
    ).toBe(true);
    expect(isPrivateHost("id-preview--d773ed43-bf03-4220-9566-7048900e3329.lovable.app")).toBe(true);
    expect(isPrivateHost("questhub101.lovable.app")).toBe(true);
    expect(isPrivateHost("localhost")).toBe(true);
  });

  it("laisse le vrai site tranquille", () => {
    expect(isPrivateHost("changethegame.xyz")).toBe(false);
    expect(isPrivateHost("www.changethegame.xyz")).toBe(false);
    expect(isPrivateHost("changethegame.fr")).toBe(false);
  });

  it("renvoie le site publié depuis l'aperçu", () => {
    vi.stubGlobal("window", { location: { hostname: "id-preview--abc.lovable.app", origin: "https://id-preview--abc.lovable.app" } });
    expect(publicOrigin()).toBe(PRODUCTION);
  });

  it("renvoie le site publié depuis une machine locale", () => {
    vi.stubGlobal("window", { location: { hostname: "localhost", origin: "http://localhost:8080" } });
    expect(publicOrigin()).toBe(PRODUCTION);
  });

  it("garde la propre adresse du site une fois publié", () => {
    vi.stubGlobal("window", { location: { hostname: "changethegame.xyz", origin: PRODUCTION } });
    expect(publicOrigin()).toBe(PRODUCTION);
    vi.stubGlobal("window", { location: { hostname: "changethegame.fr", origin: "https://changethegame.fr" } });
    expect(publicOrigin()).toBe("https://changethegame.fr");
  });
});
