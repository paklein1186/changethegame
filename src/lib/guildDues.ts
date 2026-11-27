export type DuesState = { ok: boolean; kind: "until" | "open" | "lapsed" | "none"; date?: string };
type Plan = { status: string | null; current_period_end: string | null; membership_expires_at: string | null };

/** Cotisation en ordre = au moins une formule active (délai de grâce de 7 jours compris). */
export function duesState(plans: Plan[], now = Date.now()): DuesState {
  let best: string | null = null, open = false, last: string | null = null;
  for (const p of plans) {
    const end = p.current_period_end ?? p.membership_expires_at;
    const grace = p.status === "grace" ? 7 * 864e5 : 0;
    const okStatus = ["active", "grace"].includes(p.status ?? "active");
    if (okStatus && !end) open = true;
    else if (okStatus && end && Date.parse(end) + grace > now) { if (!best || end > best) best = end; }
    if (end && (!last || end > last)) last = end;
  }
  if (open) return { ok: true, kind: "open" };
  if (best) return { ok: true, kind: "until", date: best };
  if (last) return { ok: false, kind: "lapsed", date: last };
  return { ok: false, kind: "none" };
}
