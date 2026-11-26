// Fausse base minimale pour tester la logique des adhésions sans Supabase.
// Ne couvre que les méthodes utilisées par _shared/guild-euro-membership.ts.
type Row = Record<string, any>;

export function fakeAdmin(tables: Record<string, Row[]>, uniques: Record<string, string[]> = {}) {
  const t = (name: string) => (tables[name] ??= []);
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
        return { data: returning ? hit.map((r) => ({ ...r })) : null, error: null };
      }
      const list = Array.isArray(patch) ? patch : [patch];
      const keys = op === "upsert" ? String(opts.onConflict).split(",") : uniques[name];
      for (const p of list) {
        const same = keys && rows.find((r) => keys.every((k) => r[k] === p[k]));
        if (same) {
          if (op === "insert") return { data: null, error: { code: "23505" } };
          if (!opts.ignoreDuplicates) Object.assign(same, p);
        } else rows.push({ id: crypto.randomUUID(), ...p });
      }
      return { data: null, error: null };
    }
    return q;
  }
  return { from: query, tables };
}
