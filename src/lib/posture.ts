/**
 * Entry posture — what a visitor comes to do, chosen on the public meta home
 * ("I run an initiative", "I lead a territory", ...). It is remembered in the
 * same `guestOnboardingContext` the guest assistant already uses, so that
 * onboarding can start on the right path without asking again.
 *
 * Posture is distinct from `persona_type` (IMPACT / CREATIVE / HYBRID), which
 * describes who the person is; nothing is written to the database here.
 */
export type Posture = "initiative" | "territory" | "contributor" | "organization" | "explorer";

const KEY = "guestOnboardingContext";

/** Legacy persona the onboarding already understands, per posture. */
const PERSONA_FOR_POSTURE: Partial<Record<Posture, string>> = {
  initiative: "impact",
  territory: "impact",
  organization: "impact",
};

export function setPosture(posture: Posture): void {
  try {
    const raw = localStorage.getItem(KEY);
    const ctx = raw ? JSON.parse(raw) : {};
    ctx.posture = posture;
    const persona = PERSONA_FOR_POSTURE[posture];
    if (persona) ctx.persona = persona;
    if (posture === "organization") ctx.is_org_rep = true;
    localStorage.setItem(KEY, JSON.stringify(ctx));
  } catch {
    /* storage unavailable: onboarding simply asks as before */
  }
}

export function getPosture(): Posture | null {
  try {
    const raw = localStorage.getItem(KEY) || sessionStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw)?.posture;
    return p === "initiative" || p === "territory" || p === "contributor" || p === "organization" || p === "explorer"
      ? p
      : null;
  } catch {
    return null;
  }
}
