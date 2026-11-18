import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForToken } from "../supabase";

export default defineTool({
  name: "get_quest",
  title: "Get quest detail",
  description:
    "Fetch one quest with its subtasks, participants and recent updates. Use search_quests or list_my_quests first to get the quest id.",
  inputSchema: {
    quest_id: z.string().uuid().describe("The quest id."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ quest_id }, ctx) => {
    if (!ctx.getUserId()) return { content: [{ type: "text", text: "Not authenticated." }], isError: true };
    const supabase = supabaseForToken(ctx.getToken() ?? "");

    const { data: quest, error } = await supabase
      .from("quests")
      .select(
        "id, title, description, status, quest_nature, guild_id, owner_type, owner_id, reward_xp, credit_reward, ctg_budget, coins_budget, funding_goal_credits, ai_summary, created_at, updated_at",
      )
      .eq("id", quest_id)
      .maybeSingle();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!quest) return { content: [{ type: "text", text: "Quest not found or not visible to you." }], isError: true };

    const [subtasks, participants, updates] = await Promise.all([
      supabase
        .from("quest_subtasks")
        .select("id, title, status, priority, due_date, assignee_user_ids, xp_reward, ctg_reward, order_index")
        .eq("quest_id", quest_id)
        .order("order_index", { ascending: true })
        .limit(100),
      supabase
        .from("quest_participants")
        .select("user_id, role, status, created_at")
        .eq("quest_id", quest_id)
        .limit(100),
      supabase
        .from("quest_updates")
        .select("id, content, created_at")
        .eq("quest_id", quest_id)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    const payload = {
      quest,
      subtasks: subtasks.data ?? [],
      participants: participants.data ?? [],
      recent_updates: updates.data ?? [],
    };
    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: { ...payload },
    };
  },
});
