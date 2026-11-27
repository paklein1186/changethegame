// Fausse base minimale pour tester la logique des adhésions sans Supabase.
// Ne couvre que les méthodes utilisées par _shared/guild-euro-membership.ts.
type Row = Record<string, any>;

export function fakeAdmin(tables: Record<string, Row[]>, uniques: Record<string, string[]> = {}) {
  const t = (name: string) => (tables[name] ??= []);
  // Imite les déclencheurs de la base : l'adhésion avec formule recopie sa ligne de formule,
  // et une formule mise à jour se recopie sur l'adhésion qui la porte.
  const PLAN_FIELDS = ["status", "current_period_end", "membership_expires_at", "cancel_at_period_end",
    "stripe_customer_id", "stripe_subscription_id", "payer_user_id", "last_payment_at"];
  function mirror(name: string, rows: Row[]) {
    if (name === "user_guild_memberships") {
      for (const m of rows) {
        if (!m.plan_code) continue;
        const plans = t("user_guild_plans");
        let p = plans.find((x) => x.user_id === m.user_id && x.guild_id === m.guild_id && x.plan_code === m.plan_code);
        if (!p) plans.push((p = { id: crypto.randomUUID(), user_id: m.user_id, guild_id: m.guild_id, plan_code: m.plan_code }));
        for (const k of PLAN_FIELDS) if (k in m) p[k] = m[k];
      }
    } else if (name === "user_guild_plans") {
      for (const p of rows) {
        const m = t("user_guild_memberships").find((x) => x.user_id === p.user_id && x.guild_id === p.guild_id && x.plan_code === p.plan_code);
        if (m) for (const k of PLAN_FIELDS) if (k in p) m[k] = p[k];
      }
    }
  }
  function query(name: string) {
    const filters: ((r: Row) => boolean)[] = [];
    let op: "select" | "update" | "upsert" | "insert" = "select";
    let patch: Row | Row[] = {};
    let opts: any = {};
    let returning = false;
    const q: any = {
      select() { returning = true; return q; },
      eq(k: string, v: unknown) { filters.push((r) => r[k] === v); return q; },
      neq(k: string, v: unknown) { filters.push((r) => r[k] !== v); return q; },
      in(k: string, vs: unknown[]) { filters.push((r) => vs.includes(r[k])); return q; },
      is(k: string, v: unknown) { filters.push((r) => (r[k] ?? null) === v); return q; },
      order() { return q; },
      update(p: Row) { op = "update"; patch = p; return q; },
      upsert(p: Row | Row[], o: any = {}) { op = "upsert"; patch = p; opts = o; return q; },
      insert(p: Row | Row[]) { op = "insert"; patch = p; return q; },
      maybeSingle() { return Promise.resolve(run()).then((r) => ({ data: r.data?.[0] ?? null, error: r.error })); },
      single() { return q.maybeSingle(); },
      then(ok: any, ko: any) { return Promise.resolve(run()).then(ok, ko); },
    };
    function run(): { data: Row[] | null; error: any } {
      const rows = t(name);
      const match = (r: Row) => filters.every((f) => f(r));
      if (op === "select") return { data: rows.filter(match).map((r) => ({ ...r })), error: null };
      if (op === "update") {
        const hit = rows.filter(match);
        hit.forEach((r) => Object.assign(r, patch));
        mirror(name, hit);
        return { data: returning ? hit.map((r) => ({ ...r })) : null, error: null };
      }
      const list = Array.isArray(patch) ? patch : [patch];
      const keys = op === "upsert" ? String(opts.onConflict).split(",") : uniques[name];
      const written: Row[] = [];
      for (const p of list) {
        const same = keys && rows.find((r) => keys.every((k) => r[k] === p[k]));
        if (same) {
          if (op === "insert") return { data: null, error: { code: "23505" } };
          if (!opts.ignoreDuplicates) Object.assign(same, p);
          written.push(same);
        } else {
          const row = { id: crypto.randomUUID(), ...p };
          rows.push(row);
          written.push(row);
        }
      }
      mirror(name, written);
      return { data: returning ? written.map((r) => ({ ...r })) : null, error: null };
    }
    return q;
  }
  return { from: query, tables };
}
