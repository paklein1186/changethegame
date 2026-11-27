export type FollowActivityItem = {
  id: string;
  created_at: string;
  actor_user_id?: string | null;
  action_type?: string | null;
  target_type?: string | null;
  target_id?: string | null;
};

export type ActivityGrouping<T> =
  | { type: "entry"; entry: T }
  | {
      type: "follow_group";
      id: string;
      actor_user_id: string;
      created_at: string;
      entries: T[];
    };

export function isUserFollowActivity(item: FollowActivityItem): boolean {
  return item.action_type === "followed"
    && item.target_type?.toLowerCase() === "user"
    && Boolean(item.target_id);
}

/**
 * Groups runs of at least three user follows by the same actor. Any other
 * activity, a different actor, or an entity follow breaks the run.
 */
export function groupConsecutiveFollows<T extends FollowActivityItem>(
  items: T[],
): ActivityGrouping<T>[] {
  const grouped: ActivityGrouping<T>[] = [];
  let index = 0;

  while (index < items.length) {
    const entry = items[index];
    const actorId = entry.actor_user_id;

    if (!isUserFollowActivity(entry) || !actorId) {
      grouped.push({ type: "entry", entry });
      index += 1;
      continue;
    }

    const entries = [entry];
    let next = index + 1;
    while (
      next < items.length
      && items[next].actor_user_id === actorId
      && isUserFollowActivity(items[next])
    ) {
      entries.push(items[next]);
      next += 1;
    }

    if (entries.length >= 3) {
      grouped.push({
        type: "follow_group",
        id: `follow-group:${actorId}:${entries.map((item) => item.id).join(":")}`,
        actor_user_id: actorId,
        created_at: entry.created_at,
        entries,
      });
    } else {
      entries.forEach((item) => grouped.push({ type: "entry", entry: item }));
    }

    index = next;
  }

  return grouped;
}
