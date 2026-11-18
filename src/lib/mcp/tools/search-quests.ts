import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForToken } from "../supabase";

export default defineTool({
  name: "search_quests",
  title: "Search quests",
  description:
    "Search visible changethegame quests by keyword across title and description, optionally filtered by status or guild.",
  inputSchema: {
    query: z.string().trim().min(1).describe("Keyword to look for in quest titles and descriptions."),
    status: z
      .enum(["OPEN", "IN_PROGRESS", "COMPLETED", "OPEN_FOR_PROPOSALS", "ACTIVE", "IDEA"])
      .optional()
      .describe("Restrict results to this quest status."),
    guild_id: z.string().uuid().optional().describe("Restrict results to quests owned by this guild."),
    limit: z.number().int().min(1).max(50).default(10).describe("Maximum number of quests to return."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, status, guild_id, limit }, ctx) => {
    if (!ctx.getUserId()) return { content: [{ type: "text", text: "Not authenticated." }], isError: true };
    const escaped = query.replace(/[%,()]/g, " ").trim();
    let q = supabaseForToken(ctx.getToken() ?? "")
      .from("quests")
      .select("id, title, description, status, guild_id, reward_xp, ctg_budget, coins_budget, created_at")
      .eq("is_deleted", false)
      .eq("is_draft", false)
      .or(`title.ilike.%${escaped}%,description.ilike.%${escaped}%`)
      .order("created_at", { ascending: false })
      .limit(limit ?? 10);
    if (status) q = q.eq("status", status);
    if (guild_id) q = q.eq("guild_id", guild_id);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const payload = { count: data?.length ?? 0, quests: data ?? [] };
    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: { ...payload },
    };
  },
});
