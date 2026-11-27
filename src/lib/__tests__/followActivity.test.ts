import { describe, expect, it } from "vitest";
import { groupConsecutiveFollows, type FollowActivityItem } from "../followActivity";

function follow(id: string, actor = "actor-1", targetType = "user"): FollowActivityItem {
  return {
    id,
    actor_user_id: actor,
    action_type: "followed",
    target_type: targetType,
    target_id: `target-${id}`,
    created_at: `2026-11-27T20:0${id.replace(/\D/g, "") || "0"}:00Z`,
  };
}

describe("groupConsecutiveFollows", () => {
  it("groups three or more consecutive people followed by the same actor", () => {
    const result = groupConsecutiveFollows([follow("1"), follow("2"), follow("3")]);

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("follow_group");
    if (result[0].type === "follow_group") {
      expect(result[0].entries.map((entry) => entry.id)).toEqual(["1", "2", "3"]);
    }
  });

  it("keeps one or two consecutive follows as individual entries", () => {
    const result = groupConsecutiveFollows([follow("1"), follow("2")]);

    expect(result.map((item) => item.type)).toEqual(["entry", "entry"]);
  });

  it("breaks a run when another activity or actor appears", () => {
    const post: FollowActivityItem = {
      id: "post",
      actor_user_id: "actor-1",
      action_type: "post_created",
      target_type: "post",
      target_id: "post-1",
      created_at: "2026-11-27T20:04:00Z",
    };
    const result = groupConsecutiveFollows([
      follow("1"), follow("2"), follow("3"),
      post,
      follow("4"), follow("5"), follow("6", "actor-2"),
    ]);

    expect(result.map((item) => item.type)).toEqual(["follow_group", "entry", "entry", "entry", "entry"]);
  });

  it("does not combine entity follows into a people popup", () => {
    const result = groupConsecutiveFollows([
      follow("1"), follow("2"), follow("3", "actor-1", "guild"), follow("4"),
    ]);

    expect(result.every((item) => item.type === "entry")).toBe(true);
  });
});
