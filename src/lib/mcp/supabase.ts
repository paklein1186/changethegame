import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Build a Supabase client that acts as the authenticated MCP caller.
 * RLS therefore runs as that user — never use a service-role key here.
 *
 * The Vite plugin bundles this module with esbuild, which erases every type
 * annotation. The `token` default below is therefore load-bearing: it keeps
 * the *generated* edge function (`supabase/functions/mcp/index.ts`)
 * type-correct, where `token: string` no longer exists. For the same reason
 * tool handlers build their result object inline — inside a handler the
 * literal `type: "text"` is checked against the SDK's `TextContent`, while a
 * shared helper's return type is inferred from the erased body and widens.
 *
 * Env is read lazily (inside the call) so this module stays import-safe.
 */
export function supabaseForToken(token: string = ""): SupabaseClient {
  const url = process.env.SUPABASE_URL ?? "";
  const key =
    process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";
  return createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
