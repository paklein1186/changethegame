import { describe, expect, it } from "vitest";
import { guildFollowState } from "../guildFollowState";

describe("guild follow display", () => {
  it("shows members as already following without a follow action", () => {
    expect(guildFollowState(false, true, false)).toEqual({ checked: true, locked: true });
  });
  it("shows administrators as already following without a follow action", () => {
    expect(guildFollowState(false, false, true)).toEqual({ checked: true, locked: true });
  });
  it("keeps manual follow available to non-members", () => {
    expect(guildFollowState(false, false, false)).toEqual({ checked: false, locked: false });
    expect(guildFollowState(true, false, false)).toEqual({ checked: true, locked: false });
  });
});