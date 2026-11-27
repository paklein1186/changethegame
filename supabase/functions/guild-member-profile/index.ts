// Profil d'une personne dans une guilde, pour les sites qui utilisent ChangeTheGame
// comme connexion unique (ex. troistiers.space).
//
//   GET /functions/v1/guild-member-profile?guild_id=<uuid>
//   Authorization: Bearer <jeton d'accès de la personne>   (jeton OAuth ou de session)
//
// Ne renvoie que ce qui concerne la personne elle-même : identité, appartenance à la
// guilde, adhésion payée (formule la plus haute), formules cumulées (plans), niveau calculé, badges (rôles de guilde à code, avec date de fin et portée) et
// accès propres aux quêtes reliées aux projets du site (acces_quetes : lecture = accès
// personnel, equipe = participant, admin = co-admin de la quête ; donnés et retirés sur
// ChangeTheGame, recopiés par le site). Le site décide ensuite des accès selon sa configuration.
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
        .select("expires_at, scope_type, scope_id, entity_roles!inner(code, level, requires_dues, entity_type, entity_id)")
        .eq("user_id", user.id)
        .eq("entity_roles.entity_type", "guild")
        .eq("entity_roles.entity_id", guildId),
    ]);
    if (!guild) return json({ error: "Guild not found" }, 404);

    // Toutes les formules de la personne (cumulables) et son niveau calculé dans la guilde.
    const [{ data: planRows }, { data: planDefs }, { data: level }] = await Promise.all([
      admin
        .from("user_guild_plans")
        .select("plan_code, status, current_period_end, membership_expires_at")
        .eq("guild_id", guildId)
        .eq("user_id", user.id),
      admin.from("guild_membership_plans").select("code, level").eq("guild_id", guildId),
      admin.rpc("guild_member_level", { _guild_id: guildId, _user_id: user.id }),
    ]);
    const levelOf = new Map(((planDefs as any[]) ?? []).map((p) => [p.code as string, (p.level as number | null) ?? null]));

    // Source des liens quête ↔ projet du site (quest_external_links) ; « trois-tiers » par défaut.
    const source = new URL(req.url).searchParams.get("source") ?? "trois-tiers";
    if (!/^[a-z0-9_-]{2,40}$/.test(source)) return json({ error: "Invalid source" }, 400);
    const { data: questAccess, error: qaError } = await admin.rpc("external_quest_access", {
      p_user_id: user.id, p_guild_id: guildId, p_source: source,
    });
    if (qaError) console.log(`[GUILD-MEMBER-PROFILE] acces_quetes indisponible - ${qaError.message}`);

    const now = Date.now();
    const end = membership?.current_period_end ?? membership?.membership_expires_at ?? null;
    const membershipActive =
      membership?.role === "member" &&
      ["active", "grace"].includes(membership?.status ?? "active") &&
      (!end || new Date(end).getTime() > now);

    // Admin direct, ou admin d'une entité (organisation, autre guilde) qui administre la guilde.
    const isAdmin = guild.created_by_user_id === user.id || roster?.role === "ADMIN" ||
      (await admin.rpc("is_guild_admin", { _guild_id: guildId, _user_id: user.id })).data === true;

    // Une catégorie à cotisation requise ne compte que si la cotisation est en ordre.
    const { data: duesOk } = await admin.rpc("guild_dues_in_order", { _guild_id: guildId, _user_id: user.id });
    const counts = (r: any) => !r.entity_roles?.requires_dues || duesOk === true;

    const badges = ((roles as any[]) ?? [])
      .filter((r) => r.entity_roles?.code)
      .filter((r) => !r.expires_at || new Date(r.expires_at).getTime() > now)
      .filter(counts)
      .map((r) => ({
        code: r.entity_roles.code as string,
        expires_at: r.expires_at as string | null,
        scope: r.scope_type && r.scope_id ? { type: r.scope_type as string, id: r.scope_id as string } : null,
      }));

    // Rôles à code non expirés (Source, catégories du catalogue…) qui comptent, recopiés par le site.
    const rolesOut = ((roles as any[]) ?? [])
      .filter((r) => r.entity_roles?.code)
      .filter((r) => !r.expires_at || new Date(r.expires_at).getTime() > now)
      .filter(counts)
      .map((r) => ({
        code: r.entity_roles.code as string,
        level: (r.entity_roles.level as number | null) ?? null,
        expires_at: (r.expires_at as string | null) ?? null,
        scope_type: (r.scope_type as string | null) ?? null,
        scope_id: (r.scope_id as string | null) ?? null,
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
      roles: rolesOut,
      plans: ((planRows as any[]) ?? []).map((p) => {
        const planEnd = (p.current_period_end ?? p.membership_expires_at ?? null) as string | null;
        const graceMs = p.status === "grace" ? 7 * 24 * 3600 * 1000 : 0;
        return {
          plan_code: p.plan_code as string,
          level: levelOf.get(p.plan_code) ?? null,
          active: ["active", "grace"].includes(p.status ?? "active") && (!planEnd || new Date(planEnd).getTime() + graceMs > now),
          current_period_end: planEnd,
        };
      }),
      // Niveau calculé : le plus haut parmi admin (5), rôles, formules, membre (2), suiveur (1) ; 0 sinon.
      niveau: typeof level === "number" ? level : null,
      // null : indisponible (base pas encore à jour) ; [] : aucun accès propre.
      acces_quetes: qaError ? null : ((questAccess as any[]) ?? []).map((a) => ({
        quest_id: a.quest_id as string,
        niveau: a.niveau as "lecture" | "equipe" | "admin",
        accorde_par: (a.accorde_par as string | null) ?? null,
        accorde_le: (a.accorde_le as string | null) ?? null,
        expire_le: (a.expire_le as string | null) ?? null,
      })),
    });
  } catch (error) {
    console.log(`[GUILD-MEMBER-PROFILE] ERROR - ${error instanceof Error ? error.message : String(error)}`);
    return json({ error: "Profile unavailable" }, 500);
  }
});
