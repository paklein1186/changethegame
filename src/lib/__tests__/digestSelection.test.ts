import { describe, expect, it } from "vitest";
import { digestSelection } from "../digestSelection";

const rows: { match_id: string; my_verdict: string | null }[] = Array.from({ length: 12 }, (_, i) => ({ match_id: String(i), my_verdict: null as string | null }));

describe("digest selection", () => {
  it("varies the first three suggestions with a new random seed", () => {
    expect(digestSelection(rows, 123).slice(0, 3)).not.toEqual(digestSelection(rows, 987).slice(0, 3));
  });
  it("keeps the selection stable during the same display and preserves every match", () => {
    expect(digestSelection(rows, 123)).toEqual(digestSelection(rows, 123));
    expect(digestSelection(rows, 123).map((r) => r.match_id).sort()).toEqual(rows.map((r) => r.match_id).sort());
    expect(rows[0]?.match_id).toBe("0");
  });
  it("never returns a match the user chose not to see", () => {
    const hidden = { match_id: "hidden", my_verdict: "not_relevant" };
    expect(digestSelection([...rows, hidden], 123).map((r) => r.match_id)).not.toContain("hidden");
  });
});