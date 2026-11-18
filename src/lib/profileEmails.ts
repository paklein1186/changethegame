import { supabase } from "@/integrations/supabase/client";

/**
 * Profile emails are not readable directly. This merges them in for rows the
 * caller may see (their own row, or every row for admins); others get null.
 */
export async function attachEmails<T extends Record<string, any>>(
  rows: T[] | null | undefined,
  key: keyof T = "user_id",
): Promise<(T & { email: string | null })[]> {
  const list = rows ?? [];
  const ids = [...new Set(list.map((r) => r[key]).filter(Boolean))] as string[];
  if (ids.length === 0) return list.map((r): T & { email: string | null } => ({ ...r, email: null }));
  const { data } = await (supabase.rpc as any)("get_profile_emails", { _user_ids: ids });
  const map = new Map<string, string>(((data as any[]) ?? []).map((d) => [d.user_id, d.email]));
  return list.map((r): T & { email: string | null } => ({ ...r, email: map.get(r[key] as string) ?? null }));
}
