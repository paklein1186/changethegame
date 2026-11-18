import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForToken } from "../supabase";

export default defineTool({
  name: "create_personal_task",
  title: "Create personal task",
  description:
    "Create a private personal task on the signed-in user's changethegame to-do list.",
  inputSchema: {
    title: z.string().trim().min(1).max(200).describe("Short task title."),
    description: z.string().trim().max(2000).optional().describe("Optional task details."),
    priority: z.enum(["low", "medium", "high"]).default("medium").describe("Task priority."),
    due_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe("Optional due date in YYYY-MM-DD format."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async ({ title, description, priority, due_date }, ctx) => {
    const userId = ctx.getUserId();
    if (!userId) return { content: [{ type: "text", text: "Not authenticated." }], isError: true };
    const { data, error } = await supabaseForToken(ctx.getToken() ?? "")
      .from("personal_tasks")
      .insert({
        user_id: userId,
        title,
        description: description ?? null,
        priority: priority ?? "medium",
        due_date: due_date ?? null,
        status: "todo",
      })
      .select("id, title, status, priority, due_date")
      .single();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const payload = { created: data };
    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: { ...payload },
    };
  },
});
