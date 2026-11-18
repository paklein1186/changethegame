import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForToken } from "../supabase";

export default defineTool({
  name: "list_my_quests",
  title: "List my quests",
  description:
    "List the quests the signed-in user created or participates in, most recent first.",
  inputSchema: {
    limit: z.number().int().min(1).max(50).default(20).describe("Maximum number of quests to return."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit }, ctx) => {
    const userId = ctx.getUserId();
    if (!userId) return { content: [{ type: "text", text: "Not authenticated." }], isError: true };
    const supabase = supabaseForToken(ctx.getToken() ?? "");
    const max = limit ?? 20;

    const [created, joined] = await Promise.all([
      supabase
        .from("quests")
        .select("id, title, status, guild_id, created_at")
        .eq("created_by_user_id", userId)
        .eq("is_deleted", false)
        .order("created_at", { ascending: false })
        .limit(max),
      supabase
        .from("quest_participants")
        .select("quest_id, role, status, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(max),
    ]);
    if (created.error) return { content: [{ type: "text", text: created.error.message }], isError: true };
    if (joined.error) return { content: [{ type: "text", text: joined.error.message }], isError: true };

    const questIds = (joined.data ?? []).map((row) => row.quest_id);
    const { data: joinedQuests, error: joinedQuestsError } = await supabase
      .from("quests")
      .select("id, title, status, guild_id, created_at")
      .in("id", questIds)
      .eq("is_deleted", false);
    if (joinedQuestsError) return { content: [{ type: "text", text: joinedQuestsError.message }], isError: true };

    const visible = joinedQuests ?? [];
    const participating = (joined.data ?? []).flatMap((row) => {
      const quest = visible.find((item) => item.id === row.quest_id);
      return quest ? [{ ...quest, my_role: row.role, my_status: row.status }] : [];
    });

    const payload = { created: created.data ?? [], participating };
    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: { ...payload },
    };
  },
});
