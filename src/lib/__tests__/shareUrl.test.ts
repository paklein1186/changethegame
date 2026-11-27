import { describe, expect, it } from "vitest";
import { isPreviewHost, publicOrigin } from "../shareUrl";

describe("adresse publique des liens envoyés à quelqu'un", () => {
  it("reconnaît l'adresse de l'aperçu Lovable", () => {
    expect(
      isPreviewHost("d773ed43-bf03-4220-9566-7048900e3329.lovableproject.com"),
    ).toBe(true);
    expect(isPreviewHost("id-preview--d773ed43-bf03-4220-9566-7048900e3329.lovable.app")).toBe(true);
    expect(isPreviewHost("questhub101.lovable.app")).toBe(true);
  });

  it("laisse le vrai site et les adresses locales tranquilles", () => {
    expect(isPreviewHost("changethegame.xyz")).toBe(false);
    expect(isPreviewHost("www.changethegame.xyz")).toBe(false);
    expect(isPreviewHost("localhost")).toBe(false);
  });

  it("renvoie le site publié depuis l'aperçu, sinon l'adresse courante", () => {
    // jsdom sert localhost : l'origine publique doit rester l'origine courante.
    expect(publicOrigin()).toBe(window.location.origin);
  });
});
