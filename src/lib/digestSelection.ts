type DigestMatch = { match_id: string; my_verdict: string | null };

/** Stable for one display; a new seed renews the selection without changing match scores. */
export function digestSelection<T extends DigestMatch>(rows: readonly T[], seed: number): T[] {
  const result = rows.filter((row) => row.my_verdict !== "not_relevant");
  let state = seed >>> 0;
  for (let i = result.length - 1; i > 0; i--) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const j = Math.floor((state / 4294967296) * (i + 1));
    const a = result[i];
    const b = result[j];
    if (a && b) { result[i] = b; result[j] = a; }
  }
  return result;
}