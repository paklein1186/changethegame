import { defineTool } from "@lovable.dev/mcp-js";
import { supabaseForToken } from "../supabase";

export default defineTool({
  name: "whoami",
  title: "Who am I",
  description:
    "Return the changethegame profile of the signed-in user: name, headline, XP, level and wallet balances (Coins, $CTG, Credits, Biopoints).",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    const userId = ctx.getUserId();
    if (!userId) return { content: [{ type: "text", text: "Not authenticated." }], isError: true };
    const { data, error } = await supabaseForToken(ctx.getToken() ?? "")
      .from("profiles")
      .select(
        "user_id, name, headline, bio, location, xp_total, xp_level, coins_balance, ctg_balance, credits_balance, biopoints_balance, persona_type, current_plan_code",
      )
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!data) return { content: [{ type: "text", text: "No profile found for this account." }], isError: true };
    const payload = { profile: data };
    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: { ...payload },
    };
  },
});
