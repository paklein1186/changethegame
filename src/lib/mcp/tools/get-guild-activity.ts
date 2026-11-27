import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForToken } from "../supabase";

/**
 * Suivi de l'activité d'une guilde par un agent connecté en OAuth (ex. l'agent du Pilote Trois-Tiers) :
 * la base (fonction guild_activity) lit avec les droits de la personne connectée, qui doit être membre de la guilde.
 */
export default defineTool({
  name: "get_guild_activity",
  title: "Guild activity since a date",
  description:
    "Everything that happened in one of your guilds since a date, in one call: messages (rooms, guild discussion, its quests' discussions) and replies, decisions (vote tally and outcome), quests created or updated, quest news, needs, proposed contributions, events, new members. Only what you are allowed to see; never private messages. Get the guild id with list_my_guilds. Pass `next_since` from the answer as `since` next time; if `truncated` is true, call again from the last item you processed.",
  inputSchema: {
    guild_id: z.string().uuid().describe("The guild id (from list_my_guilds)."),
    since: z.string().datetime({ offset: true }).optional().describe("ISO date-time. Default: 48 hours ago."),
    until: z.string().datetime({ offset: true }).optional().describe("ISO date-time. Default: now."),
    max_per_section: z.number().int().min(1).max(200).optional().describe("Cap per section (default 100)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ guild_id, since, until, max_per_section }, ctx) => {
    if (!ctx.getUserId()) return { content: [{ type: "text", text: "Not authenticated." }], isError: true };
    const supabase = supabaseForToken(ctx.getToken() ?? "");
    const now = Date.now();
    const s0 = since ? new Date(since).toISOString() : new Date(now - 48 * 3600_000).toISOString();
    const u0 = until ? new Date(until).toISOString() : new Date(now).toISOString();
    const { data, error } = await supabase.rpc("guild_activity" as never, {
      p_guild_id: guild_id, p_since: s0, p_until: u0, p_cap: max_per_section ?? 100,
    } as never);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { activity: data as unknown },
    };
  },
});
