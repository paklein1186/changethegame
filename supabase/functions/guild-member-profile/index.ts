// Profil d'une personne dans une guilde, pour les sites qui utilisent ChangeTheGame
// comme connexion unique (ex. troistiers.space).
//
//   GET /functions/v1/guild-member-profile?guild_id=<uuid>
//   Authorization: Bearer <jeton d'accès de la personne>   (jeton OAuth ou de session)
//
// Ne renvoie que ce qui concerne la personne elle-même : identité, appartenance à la
// guilde, adhésion payée et badges (rôles de guilde à code, avec date de fin et portée).
// Le site client décide ensuite des accès à partir de sa propre configuration.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const anon = createClient(url, Deno.env.get("SUPABASE_ANON_KEY") ?? "", { auth: { persistSession: false } });
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });

  try {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Not authenticated" }, 401);
    const { data: userData, error: authError } = await anon.auth.getUser(token);
    if (authError || !userData.user) return json({ error: "Not authenticated" }, 401);
    const user = userData.user;

    const guildId = new URL(req.url).searchParams.get("guild_id") ?? "";
    if (!/^[0-9a-f-]{36}$/i.test(guildId)) return json({ error: "Invalid guild_id" }, 400);

    const [{ data: guild }, { data: roster }, { data: membership }, { data: profile }, { data: roles }] = await Promise.all([
      admin.from("guilds").select("id, name, created_by_user_id").eq("id", guildId).maybeSingle(),
      admin.from("guild_members").select("role").eq("guild_id", guildId).eq("user_id", user.id).maybeSingle(),
      admin
        .from("user_guild_memberships")
        .select("role, status, plan_code, current_period_end, membership_expires_at, cancel_at_period_end")
        .eq("guild_id", guildId)
        .eq("user_id", user.id)
        .maybeSingle(),
      admin.from("profiles").select("name").eq("user_id", user.id).maybeSingle(),
      admin
        .from("entity_member_roles")
        .select("expires_at, scope_type, scope_id, entity_roles!inner(code, entity_type, entity_id)")
        .eq("user_id", user.id)
        .eq("entity_roles.entity_type", "guild")
        .eq("entity_roles.entity_id", guildId),
    ]);
    if (!guild) return json({ error: "Guild not found" }, 404);

    const now = Date.now();
    const end = membership?.current_period_end ?? membership?.membership_expires_at ?? null;
    const membershipActive =
      membership?.role === "member" &&
      ["active", "grace"].includes(membership?.status ?? "active") &&
      (!end || new Date(end).getTime() > now);

    // Admin direct, ou admin d'une entité (organisation, autre guilde) qui administre la guilde.
    const isAdmin = guild.created_by_user_id === user.id || roster?.role === "ADMIN" ||
      (await admin.rpc("is_guild_admin", { _guild_id: guildId, _user_id: user.id })).data === true;

    const badges = ((roles as any[]) ?? [])
      .filter((r) => r.entity_roles?.code)
      .filter((r) => !r.expires_at || new Date(r.expires_at).getTime() > now)
      .map((r) => ({
        code: r.entity_roles.code as string,
        expires_at: r.expires_at as string | null,
        scope: r.scope_type && r.scope_id ? { type: r.scope_type as string, id: r.scope_id as string } : null,
      }));

    return json({
      email: user.email,
      name: profile?.name ?? user.user_metadata?.full_name ?? null,
      guild_id: guild.id,
      guild_member: Boolean(roster) || isAdmin,
      guild_role: roster?.role ?? (isAdmin ? "ADMIN" : null),
      is_guild_admin: isAdmin,
      membership: membership
        ? {
            active: membershipActive,
            status: membership.status ?? null,
            plan_code: membership.plan_code ?? null,
            current_period_end: end,
            cancel_at_period_end: Boolean(membership.cancel_at_period_end),
          }
        : null,
      badges,
    });
  } catch (error) {
    console.log(`[GUILD-MEMBER-PROFILE] ERROR - ${error instanceof Error ? error.message : String(error)}`);
    return json({ error: "Profile unavailable" }, 500);
  }
});
