import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForToken } from "../supabase";

export default defineTool({
  name: "update_personal_task",
  title: "Update personal task",
  description:
    "Update the status, priority or due date of one of the signed-in user's personal tasks.",
  inputSchema: {
    task_id: z.string().uuid().describe("The personal task id (from list_my_tasks)."),
    status: z.enum(["todo", "in_progress", "done"]).optional().describe("New status."),
    priority: z.enum(["low", "medium", "high"]).optional().describe("New priority."),
    due_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe("New due date in YYYY-MM-DD format."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async ({ task_id, status, priority, due_date }, ctx) => {
    const userId = ctx.getUserId();
    if (!userId) return { content: [{ type: "text", text: "Not authenticated." }], isError: true };
    const patch = {
      ...(status ? { status } : {}),
      ...(priority ? { priority } : {}),
      ...(due_date ? { due_date } : {}),
    };
    if (Object.keys(patch).length === 0) return { content: [{ type: "text", text: "Nothing to update." }], isError: true };

    const { data, error } = await supabaseForToken(ctx.getToken() ?? "")
      .from("personal_tasks")
      .update(patch)
      .eq("id", task_id)
      .eq("user_id", userId)
      .select("id, title, status, priority, due_date")
      .maybeSingle();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!data) return { content: [{ type: "text", text: "Task not found or not yours." }], isError: true };
    const payload = { updated: data };
    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: { ...payload },
    };
  },
});
