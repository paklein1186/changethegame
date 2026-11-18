import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForToken } from "../supabase";

export default defineTool({
  name: "list_my_guilds",
  title: "List my guilds",
  description:
    "List the guilds, networks and collectives the signed-in user is a member of, with their role in each.",
  inputSchema: {
    limit: z.number().int().min(1).max(100).default(50).describe("Maximum number of guilds to return."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit }, ctx) => {
    const userId = ctx.getUserId();
    if (!userId) return { content: [{ type: "text", text: "Not authenticated." }], isError: true };
    const supabase = supabaseForToken(ctx.getToken() ?? "");

    const { data: memberships, error } = await supabase
      .from("guild_members")
      .select("guild_id, role, joined_at")
      .eq("user_id", userId)
      .limit(limit ?? 50);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    const guildIds = (memberships ?? []).map((row) => row.guild_id);
    const { data: guilds, error: guildsError } = await supabase
      .from("guilds")
      .select("id, name, description, type, is_deleted")
      .in("id", guildIds)
      .eq("is_deleted", false);
    if (guildsError) return { content: [{ type: "text", text: guildsError.message }], isError: true };

    const visible = guilds ?? [];
    const rows = (memberships ?? []).flatMap((row) => {
      const guild = visible.find((item) => item.id === row.guild_id);
      return guild
        ? [{ id: guild.id, name: guild.name, description: guild.description, type: guild.type, my_role: row.role, joined_at: row.joined_at }]
        : [];
    });

    const payload = { count: rows.length, guilds: rows };
    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: { ...payload },
    };
  },
});
