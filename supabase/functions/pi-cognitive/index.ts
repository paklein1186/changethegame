// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// =====================================================================
// Tool definitions sent to the AI model
// =====================================================================
const TOOLS = [
  {
    type: "function",
    function: {
      name: "get_user_profile",
      description: "Get the current user's profile data",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "search_quests",
      description: "Search for quests matching criteria",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search keywords" },
          territory_id: { type: "string", description: "Filter by territory" },
          status: { type: "string", enum: ["open", "active", "completed"] },
          limit: { type: "number", description: "Max results (default 5)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "accept_quest",
      description: "Accept/join a quest for the user",
      parameters: {
        type: "object",
        properties: { quest_id: { type: "string" } },
        required: ["quest_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_guilds",
      description: "Search for guilds",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          territory_id: { type: "string" },
          limit: { type: "number" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "join_guild",
      description: "Request to join a guild",
      parameters: {
        type: "object",
        properties: { guild_id: { type: "string" } },
        required: ["guild_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "navigate_to",
      description: "Navigate the user to a specific screen",
      parameters: {
        type: "object",
        properties: {
          screen: { type: "string", description: "Route path like /quests/abc or /guilds/xyz" },
          highlight: { type: "string", description: "Element to highlight" },
        },
        required: ["screen"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "store_memory",
      description: "Store a memory about the user for future reference",
      parameters: {
        type: "object",
        properties: {
          key: { type: "string", description: "Memory key like 'motivation', 'preferred_quest_type'" },
          value: { type: "string", description: "The memory value" },
          tier: { type: "string", enum: ["short", "medium", "long"], description: "Memory duration tier" },
        },
        required: ["key", "value", "tier"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "show_notification",
      description: "Show a notification/toast to the user",
      parameters: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["success", "info", "warning"] },
          title: { type: "string" },
          message: { type: "string" },
        },
        required: ["type", "title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "award_xp",
      description: "Award XP to the user",
      parameters: {
        type: "object",
        properties: {
          amount: { type: "number" },
          reason: { type: "string" },
        },
        required: ["amount", "reason"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "suggest_next_quest",
      description: "Suggest quests matched to user's skills and interests",
      parameters: {
        type: "object",
        properties: { limit: { type: "number" } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "capture_vision",
      description: "Store a user's vision or dream in the vision bank",
      parameters: {
        type: "object",
        properties: {
          vision_text: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
          territory_id: { type: "string" },
          guild_id: { type: "string" },
        },
        required: ["vision_text"],
      },
    },
  },
  // ── Path tools ──
  {
    type: "function",
    function: {
      name: "advance_path_step",
      description: "Advance the user to the next step in their current path. Call when the user completes the current step's objective.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  // ── Quest decomposition tools ──
  {
    type: "function",
    function: {
      name: "create_subtasks",
      description: "Decompose a quest into sequential sub-tasks. First subtask starts active, rest are locked.",
      parameters: {
        type: "object",
        properties: {
          quest_id: { type: "string" },
          subtasks: {
            type: "array",
            items: {
              type: "object",
              properties: {
                step_number: { type: "number" },
                title: { type: "string" },
                description: { type: "string" },
                estimated_minutes: { type: "number" },
                xp_reward: { type: "number" },
              },
              required: ["step_number", "title", "description"],
            },
          },
        },
        required: ["quest_id", "subtasks"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "complete_subtask",
      description: "Mark a subtask as completed, unlock the next one, and award XP. If last subtask, also complete the parent quest.",
      parameters: {
        type: "object",
        properties: {
          subtask_id: { type: "string" },
        },
        required: ["subtask_id"],
      },
    },
  },
  // ── Quest context tools (operate on the quest the user is viewing) ──
  {
    type: "function",
    function: {
      name: "list_quest_members",
      description: "List participants and hosts of a quest with their roles and statuses.",
      parameters: {
        type: "object",
        properties: { quest_id: { type: "string" } },
        required: ["quest_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_quest_discussions",
      description: "Return the most recent feed posts (discussions) attached to a quest.",
      parameters: {
        type: "object",
        properties: {
          quest_id: { type: "string" },
          limit: { type: "number", description: "Max posts (default 10)" },
        },
        required: ["quest_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_quest_files",
      description: "List files and links attached to recent posts of a quest.",
      parameters: {
        type: "object",
        properties: {
          quest_id: { type: "string" },
          limit: { type: "number", description: "Max files (default 20)" },
        },
        required: ["quest_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "summarize_quest_progress",
      description: "Return a structured snapshot of quest progress: subtasks, members, recent activity.",
      parameters: {
        type: "object",
        properties: { quest_id: { type: "string" } },
        required: ["quest_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_site",
      description: "Search across the whole platform — quests, guilds, territories, services, courses and published AI agents — not just the entity currently being viewed. Use this when the user asks a broad 'where can I find...' / 'is there anything about...' question rather than a single-entity lookup.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search keywords" },
          limit: { type: "number", description: "Max results per entity type (default 5)" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_web",
      description: "Search the open web for information not available on the platform (news, definitions, external organizations, general knowledge). Returns a short instant-answer summary and related links, not a full page fetch.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Web search query" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_platform",
      description: "Semantic search across EVERYTHING on the platform: guilds, quests (with their open needs), organisations, pods, services, courses, AI agents, territories, topics and member profiles. Understands meaning, not just keywords — use it to advise someone on their path: which guild or quest to join, which people to meet, which service, course or agent could help, what already exists around a theme or place. Returns items with a ready-made markdown link. Prefer it over search_site for any advice or discovery question; call it several times with different angles when useful.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "What to look for, in natural language (any language). Be specific: a need, a theme, a place, a skill." },
          types: { type: "array", items: { type: "string", enum: ["guild", "quest", "company", "pod", "service", "course", "agent", "territory", "topic", "profile"] }, description: "Optional: restrict to these kinds of items" },
          limit: { type: "number", description: "Max results (default 8, up to 15)" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "find_needs",
      description: "List the open needs of quests and their guilds (skills, resources, places, funding, volunteers…), matched against the user's skills. Use it when someone asks how they could help, what projects need their skills, what is needed around a place, or browses needs. scope: 'me' = needs matching the user's own skills (default), 'me_and_guilds' = also their guilds' skills, 'all' = every open need. Each item has a markdown link to its quest and, when matched, the skill it matches. Also returns explore_link, the Needs tab with the same filters.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Optional words to look for in the need or quest title" },
          scope: { type: "string", enum: ["me", "me_and_guilds", "all"] },
          territory: { type: "string", description: "Optional place name (town, province, region, country); includes everything inside it" },
          category: { type: "string", enum: ["SKILLS", "RESOURCES", "FUNDING", "TOOLS", "PLACE", "MENTORSHIP", "VISIBILITY", "PARTNERSHIPS", "VOLUNTEER", "GENERAL"] },
          limit: { type: "number", description: "Max results (default 8, up to 20)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "offer_help_on_need",
      description: "Offer the user's help on a quest need (from find_needs: need_id). It adds a contribution to the quest, linked to the need, and notifies the person who posted the need, the quest holder and the guild admins. It sends something to other people on the user's behalf: ONLY call it after the user has explicitly agreed to the exact title, message and terms you propose, and set confirmed=true. Never call it on your own initiative.",
      parameters: {
        type: "object",
        properties: {
          need_id: { type: "string" },
          title: { type: "string", description: "Short offer, e.g. 'I can help: legal advice for a non-profit'" },
          message: { type: "string", description: "How, when, with what experience (the user's own words)" },
          terms: { type: "string", enum: ["free", "CREDITS", "FIAT"], description: "free = volunteer; CREDITS = paid in $CTG; FIAT = paid in euros" },
          amount: { type: "number", description: "Amount requested when terms is CREDITS or FIAT" },
          confirmed: { type: "boolean", description: "true only once the user explicitly agreed to send this exact offer" },
        },
        required: ["need_id", "title", "terms", "confirmed"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_my_opportunities",
      description: "Opportunities the platform detected for the user: needs they (or their guilds) could help with, and people or guilds who could help their own quests, with the reason and whether a service can be booked. scope: 'me' (default), 'guilds', 'all'.",
      parameters: {
        type: "object",
        properties: {
          scope: { type: "string", enum: ["me", "guilds", "all"] },
          limit: { type: "number", description: "Max results (default 8, up to 20)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_my_skills",
      description: "The skills and resources the platform knows the user can offer: confirmed ones, and ones suggested from their activity (tasks, quests led, services, CV) that they have not confirmed yet. Use it to explain what they are matched on, or to encourage them to confirm skills or turn them into bookable services.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_my_memberships",
      description: "The user's paid guild memberships: guild, formula, paid in euros (card, Stripe) or in Coins, monthly or yearly, next renewal date, whether renewal is stopped, and their Coins balance. Use it for questions about memberships, renewals, payments or reminders.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "list_my_active_agents",
      description: "List the AI agents currently active (attached) in the user's guilds, quests and pods. Use this to know what specialized help is already available to the user before answering yourself, or to point them to the right agent.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "consult_agent",
      description: "Ask one of the user's active agents a question and get its answer, so you can relay it instead of answering yourself. Give the agent's NAME (e.g. \"Space2\") — you do not need ids; the current page's space is used when the agent is available there. Write the question so it stands alone (the agent does not see this conversation).",
      parameters: {
        type: "object",
        properties: {
          agent_name: { type: "string", description: "Name (or part of the name) of the agent, e.g. Space2" },
          question: { type: "string", description: "Self-contained question to ask the agent" },
          deep: { type: "boolean", description: "true ONLY when the user explicitly asks for an in-depth, thorough analysis: the agent then uses a bigger model and costs more credits. Default: false." },
          agent_id: { type: "string", description: "Optional, from list_my_active_agents" },
          unit_type: { type: "string", enum: ["guild", "pod", "quest"], description: "Optional, from list_my_active_agents" },
          unit_id: { type: "string", description: "Optional, from list_my_active_agents" },
        },
        required: ["question"],
      },
    },
  },
];

// =====================================================================
// Tool execution
// =====================================================================
/** Agents active in the guilds, pods and quests the user belongs to. */
async function listActiveAgents(sb: any, userId: string) {
  const [guildMemberships, podMemberships, questMemberships] = await Promise.all([
    sb.from("guild_members").select("guild_id, guilds(id, name)").eq("user_id", userId),
    sb.from("pod_members").select("pod_id, pods(id, name)").eq("user_id", userId),
    sb.from("quest_participants").select("quest_id, quests(id, title)").eq("user_id", userId),
  ]);

  const units: { unit_type: string; unit_id: string; unit_name: string }[] = [
    ...((guildMemberships.data || []) as any[]).filter((m) => m.guilds).map((m) => ({ unit_type: "guild", unit_id: m.guild_id, unit_name: m.guilds.name })),
    ...((podMemberships.data || []) as any[]).filter((m) => m.pods).map((m) => ({ unit_type: "pod", unit_id: m.pod_id, unit_name: m.pods.name })),
    ...((questMemberships.data || []) as any[]).filter((m) => m.quests).map((m) => ({ unit_type: "quest", unit_id: m.quest_id, unit_name: m.quests.title })),
  ];
  if (units.length === 0) return [];

  const byType: Record<string, string[]> = {};
  for (const u of units) (byType[u.unit_type] ??= []).push(u.unit_id);

  const results = await Promise.all(
    Object.entries(byType).map(([unitType, unitIds]) =>
      sb.from("unit_agents").select("agent_id, unit_type, unit_id, agents(id, name, description, category)")
        .eq("unit_type", unitType).in("unit_id", unitIds).eq("is_active", true)
    )
  );
  const unitNameByKey = new Map(units.map((u) => [`${u.unit_type}:${u.unit_id}`, u.unit_name]));

  return results.flatMap((r: any) => (r.data || []) as any[]).map((ua: any) => ({
    agent_id: ua.agent_id,
    agent_name: ua.agents?.name as string | undefined,
    description: ua.agents?.description,
    category: ua.agents?.category,
    unit_type: ua.unit_type as string,
    unit_id: ua.unit_id as string,
    unit_name: unitNameByKey.get(`${ua.unit_type}:${ua.unit_id}`) || null,
  }));
}

const SEARCH_LABELS: Record<string, string> = {
  guild: "Guilde", quest: "Quête", company: "Organisation", pod: "Pod", service: "Service", course: "Cours",
  agent: "Agent IA", territory: "Territoire", topic: "Thème", profile: "Membre",
};

/** Keys « type:id » of the private items this user may see (their guilds, quests, organisations, pods, services). */
async function allowedSearchKeys(sb: any, userId: string): Promise<string[]> {
  const [guilds, pods, parts, owned, companies, services, ownGuilds] = await Promise.all([
    sb.from("guild_members").select("guild_id").eq("user_id", userId),
    sb.from("pod_members").select("pod_id").eq("user_id", userId),
    sb.from("quest_participants").select("quest_id").eq("user_id", userId),
    sb.from("quests").select("id").eq("created_by_user_id", userId),
    sb.from("company_members").select("company_id").eq("user_id", userId),
    sb.from("services").select("id").eq("provider_user_id", userId),
    sb.from("guilds").select("id").eq("created_by_user_id", userId),
  ]);
  const keys = new Set<string>();
  for (const r of guilds.data ?? []) keys.add(`guild:${r.guild_id}`);
  for (const r of ownGuilds.data ?? []) keys.add(`guild:${r.id}`);
  for (const r of pods.data ?? []) keys.add(`pod:${r.pod_id}`);
  for (const r of parts.data ?? []) keys.add(`quest:${r.quest_id}`);
  for (const r of owned.data ?? []) keys.add(`quest:${r.id}`);
  for (const r of companies.data ?? []) keys.add(`company:${r.company_id}`);
  for (const r of services.data ?? []) keys.add(`service:${r.id}`);
  return [...keys];
}

const normAgentName = (v: string) => v.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

// ── Accès aux quêtes ──
// Pi lit la base en service (sans règles d'accès) : chaque quête passe par le niveau d'accès de la personne,
// calculé par la base avec son jeton : full (tout), teaser (la fiche seulement), none (invisible pour elle).
async function questAccessLevels(authHeader: string | undefined, ids: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(ids.filter((x) => typeof x === "string" && /^[0-9a-f-]{36}$/i.test(x)))];
  if (!unique.length) return {};
  const asUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader ?? "" } } });
  const { data, error } = await asUser.rpc("my_quest_access_levels", { p_quest_ids: unique });
  if (error) {
    console.error("my_quest_access_levels error", error);
    return Object.fromEntries(unique.map((id) => [id, "none"]));
  }
  const out: Record<string, string> = Object.fromEntries(unique.map((id) => [id, "none"]));
  for (const r of data ?? []) out[r.quest_id] = r.level;
  return out;
}

/** Garde les quêtes visibles ; pour celles dont on ne voit que la fiche, le résumé seulement. */
async function filterQuestRows(authHeader: string | undefined, rows: any[]): Promise<any[]> {
  const levels = await questAccessLevels(authHeader, rows.map((r) => r.id));
  return rows
    .filter((r) => levels[r.id] && levels[r.id] !== "none")
    .map((r) => levels[r.id] === "full" ? r : {
      id: r.id, title: r.title, description: String(r.description ?? "").slice(0, 400), status: r.status,
      access: "summary only: the user can request access on the quest page",
    });
}

// Outils qui lisent ou modifient le contenu d'une quête : accès complet exigé.
const QUEST_CONTENT_TOOLS = new Set(["accept_quest", "create_subtasks", "list_quest_members", "list_quest_discussions", "list_quest_files", "summarize_quest_progress"]);

async function executeToolCall(
  toolName: string,
  params: any,
  userId: string,
  sb: any,
  authHeader?: string,
  pageCtx?: { type?: string; id?: string; language?: string }
): Promise<any> {
  if (QUEST_CONTENT_TOOLS.has(toolName) && params?.quest_id) {
    const level = (await questAccessLevels(authHeader, [String(params.quest_id)]))[String(params.quest_id)];
    if (level !== "full") {
      return level === "teaser"
        ? { error: `Restricted quest: the user only sees its summary. They can request access on [the quest page](/quests/${params.quest_id}); its admins will be notified.` }
        : { error: "Quest not found." };
    }
  }
  switch (toolName) {
    case "get_user_profile": {
      const { data } = await sb
        .from("profiles")
        .select("user_id, first_name, last_name, display_name, bio, skills, avatar_url, credits_balance, xp, current_path, path_step")
        .eq("user_id", userId)
        .maybeSingle();
      return data || { error: "Profile not found" };
    }

    case "search_quests": {
      const limit = params.limit || 8;
      const q = (params.query || "").trim();

      // Build candidate id set from territory filter
      let territoryIds: string[] | null = null;
      if (params.territory_id) {
        const { data: qtIds } = await sb
          .from("quest_territories")
          .select("quest_id")
          .eq("territory_id", params.territory_id);
        territoryIds = (qtIds || []).map((x: any) => x.quest_id);
        if (territoryIds.length === 0) return [];
      }

      // Build candidate id set from topic match (name or slug fuzzy match)
      let topicQuestIds: string[] = [];
      if (q) {
        const { data: matchingTopics } = await sb
          .from("topics")
          .select("id")
          .or(`name.ilike.%${q}%,slug.ilike.%${q}%`)
          .eq("is_deleted", false);
        if (matchingTopics?.length) {
          const { data: qt } = await sb
            .from("quest_topics")
            .select("quest_id")
            .in("topic_id", matchingTopics.map((t: any) => t.id));
          topicQuestIds = (qt || []).map((x: any) => x.quest_id);
        }
      }

      let query = sb
        .from("quests")
        .select("id, title, description, status, quest_nature, difficulty, xp_reward")
        .eq("is_deleted", false)
        .eq("is_draft", false)
        .limit(limit);
      if (territoryIds) query = query.in("id", territoryIds);
      if (params.status) query = query.eq("status", params.status);
      if (q) {
        // Match title OR description OR topic-based ids
        const orClauses = [`title.ilike.%${q}%`, `description.ilike.%${q}%`];
        if (topicQuestIds.length) orClauses.push(`id.in.(${topicQuestIds.join(",")})`);
        query = query.or(orClauses.join(","));
      }
      const { data } = await query;
      return await filterQuestRows(authHeader, data || []);
    }

    case "accept_quest": {
      const { error } = await sb.from("quest_participants").insert({
        quest_id: params.quest_id,
        user_id: userId,
        status: "active",
        role: "participant",
      });
      if (error) return { error: error.message };
      return { success: true, quest_id: params.quest_id };
    }

    case "search_guilds": {
      const q = (params.query || "").trim();
      let topicGuildIds: string[] = [];
      if (q) {
        const { data: matchingTopics } = await sb
          .from("topics")
          .select("id")
          .or(`name.ilike.%${q}%,slug.ilike.%${q}%`)
          .eq("is_deleted", false);
        if (matchingTopics?.length) {
          const { data: gt } = await sb
            .from("guild_topics")
            .select("guild_id")
            .in("topic_id", matchingTopics.map((t: any) => t.id));
          topicGuildIds = (gt || []).map((x: any) => x.guild_id);
        }
      }
      let query = sb
        .from("guilds")
        .select("id, name, description, member_count, guild_type")
        .eq("is_deleted", false)
        .limit(params.limit || 8);
      if (q) {
        const orClauses = [`name.ilike.%${q}%`, `description.ilike.%${q}%`];
        if (topicGuildIds.length) orClauses.push(`id.in.(${topicGuildIds.join(",")})`);
        query = query.or(orClauses.join(","));
      }
      const { data } = await query;
      return data || [];
    }

    case "join_guild": {
      const { error } = await sb.from("guild_members").insert({
        guild_id: params.guild_id,
        user_id: userId,
        role: "MEMBER",
        status: "PENDING",
      });
      if (error) return { error: error.message };
      return { success: true, guild_id: params.guild_id, status: "pending" };
    }

    case "navigate_to": {
      return { action: "navigate", screen: params.screen, highlight: params.highlight || null };
    }

    case "store_memory": {
      const { error } = await sb.from("pi_memories").upsert(
        {
          user_id: userId,
          key: params.key,
          value: params.value,
          tier: params.tier,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,key,tier" }
      );
      if (error) return { error: error.message };
      return { stored: true, key: params.key, tier: params.tier };
    }

    case "show_notification": {
      return { action: "notification", type: params.type, title: params.title, message: params.message };
    }

    case "award_xp": {
      const { data: profile } = await sb
        .from("profiles")
        .select("xp")
        .eq("user_id", userId)
        .maybeSingle();
      const currentXp = profile?.xp || 0;
      await sb.from("profiles").update({ xp: currentXp + params.amount }).eq("user_id", userId);
      return { action: "award_xp", amount: params.amount, reason: params.reason, new_total: currentXp + params.amount };
    }

    case "suggest_next_quest": {
      const { data: currentQuests } = await sb
        .from("quest_participants")
        .select("quest_id")
        .eq("user_id", userId);
      const excludeIds = (currentQuests || []).map((q: any) => q.quest_id);

      let query = sb
        .from("quests")
        .select("id, title, description, quest_nature, difficulty, xp_reward")
        .eq("is_deleted", false)
        .eq("is_draft", false)
        .eq("status", "open")
        .limit(params.limit || 3);

      if (excludeIds.length > 0) {
        query = query.not("id", "in", `(${excludeIds.join(",")})`);
      }

      const { data } = await query;
      return await filterQuestRows(authHeader, data || []);
    }

    case "capture_vision": {
      const { data, error } = await sb
        .from("vision_bank")
        .insert({
          user_id: userId,
          vision_text: params.vision_text,
          tags: params.tags || [],
          territory_id: params.territory_id || null,
          guild_id: params.guild_id || null,
        })
        .select()
        .single();
      if (error) return { error: error.message };
      return { stored: true, vision_id: data.id };
    }

    // ── Path tools ──
    case "advance_path_step": {
      const { data: profile } = await sb
        .from("profiles")
        .select("current_path, path_step")
        .eq("user_id", userId)
        .maybeSingle();
      if (!profile?.current_path) return { error: "User has no active path" };

      const newStep = (profile.path_step || 1) + 1;
      if (newStep > 6) {
        // Path complete!
        await sb.from("profiles")
          .update({ current_path: null, path_step: null })
          .eq("user_id", userId);
        return { action: "path_complete", completed_path: profile.current_path, celebration: true };
      }
      await sb.from("profiles")
        .update({ path_step: newStep })
        .eq("user_id", userId);
      return { action: "path_advanced", path: profile.current_path, new_step: newStep, total_steps: 6 };
    }

    // ── Quest decomposition tools ──
    case "create_subtasks": {
      const rows = (params.subtasks || []).map((st: any, i: number) => ({
        quest_id: params.quest_id,
        user_id: userId,
        step_number: st.step_number || i + 1,
        title: st.title,
        description: st.description,
        estimated_minutes: st.estimated_minutes || null,
        xp_reward: st.xp_reward || 0,
        status: st.step_number === 1 || i === 0 ? "active" : "locked",
      }));
      const { data, error } = await sb
        .from("quest_subtasks")
        .insert(rows)
        .select("id, step_number, title, status");
      if (error) return { error: error.message };
      return { created: true, subtasks: data };
    }

    case "complete_subtask": {
      // Get the subtask
      const { data: subtask } = await sb
        .from("quest_subtasks")
        .select("id, quest_id, step_number, xp_reward, user_id")
        .eq("id", params.subtask_id)
        .maybeSingle();
      if (!subtask) return { error: "Subtask not found" };

      // Mark as completed
      await sb.from("quest_subtasks")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", params.subtask_id);

      // Award XP if any
      if (subtask.xp_reward > 0) {
        const { data: profile } = await sb.from("profiles").select("xp").eq("user_id", userId).maybeSingle();
        await sb.from("profiles").update({ xp: (profile?.xp || 0) + subtask.xp_reward }).eq("user_id", userId);
      }

      // Check if there's a next subtask to unlock
      const { data: nextSub } = await sb
        .from("quest_subtasks")
        .select("id")
        .eq("quest_id", subtask.quest_id)
        .eq("user_id", userId)
        .eq("step_number", subtask.step_number + 1)
        .maybeSingle();

      if (nextSub) {
        await sb.from("quest_subtasks")
          .update({ status: "active" })
          .eq("id", nextSub.id);
        return {
          completed: true,
          xp_awarded: subtask.xp_reward,
          next_subtask_unlocked: nextSub.id,
          quest_complete: false,
        };
      }

      // No next subtask — check if quest is done
      const { count } = await sb
        .from("quest_subtasks")
        .select("id", { count: "exact", head: true })
        .eq("quest_id", subtask.quest_id)
        .eq("user_id", userId)
        .neq("status", "completed");

      if (count === 0) {
        // All subtasks done — complete parent quest
        await sb.from("quest_participants")
          .update({ status: "completed" })
          .eq("quest_id", subtask.quest_id)
          .eq("user_id", userId);
        return {
          completed: true,
          xp_awarded: subtask.xp_reward,
          quest_complete: true,
          quest_id: subtask.quest_id,
        };
      }

      return { completed: true, xp_awarded: subtask.xp_reward, quest_complete: false };
    }

    case "list_quest_members": {
      const qid = params.quest_id;
      if (!qid) return { error: "quest_id required" };
      const [partsR, hostsR] = await Promise.all([
        sb.from("quest_participants")
          .select("user_id, role, status")
          .eq("quest_id", qid).limit(100),
        sb.from("quest_hosts")
          .select("entity_type, entity_id, role").eq("quest_id", qid),
      ]);
      await hydrateProfiles(sb, partsR.data as any[], "user_id");
      return {
        participants: (partsR.data || []).map((p: any) => ({
          user_id: p.user_id, role: p.role, status: p.status, name: p.profiles?.name,
        })),
        hosts: hostsR.data || [],
      };
    }

    case "list_quest_discussions": {
      const qid = params.quest_id;
      if (!qid) return { error: "quest_id required" };
      const limit = Math.min(params.limit || 10, 30);
      const { data } = await sb.from("feed_posts")
        .select("id, author_user_id, content, created_at, upvote_count")
        .eq("context_type", "QUEST").eq("context_id", qid)
        .eq("is_deleted", false)
        .order("created_at", { ascending: false }).limit(limit);
      await hydrateProfiles(sb, data as any[], "author_user_id");
      return (data || []).map((p: any) => ({
        id: p.id, author: p.profiles?.name, created_at: p.created_at,
        upvotes: p.upvote_count, content: (p.content || "").slice(0, 600),
      }));
    }

    case "list_quest_files": {
      const qid = params.quest_id;
      if (!qid) return { error: "quest_id required" };
      const limit = Math.min(params.limit || 20, 50);
      const results: any[] = [];

      // 1) Files/links attached directly to the quest (Resources / Files tab)
      const { data: unitAtts, error: unitErr } = await sb.from("attachments")
        .select("id, title, file_name, file_url, mime_type, target_type, target_id, created_at")
        .eq("target_id", qid)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (unitErr) console.error("[pi] attachments error:", unitErr.message);
      for (const a of unitAtts || []) {
        results.push({
          source: "quest_resources",
          name: a.title || a.file_name || "file",
          url: a.file_url,
          mime_type: a.mime_type,
          created_at: a.created_at,
        });
      }

      // 2) Files attached to quest discussion posts
      const { data: posts } = await sb.from("feed_posts")
        .select("id").eq("context_type", "QUEST").eq("context_id", qid)
        .eq("is_deleted", false).order("created_at", { ascending: false }).limit(50);
      const ids = (posts || []).map((p: any) => p.id);
      if (ids.length) {
        const { data: postAtts } = await sb.from("post_attachments")
          .select("post_id, type, url, file_name, mime_type, created_at")
          .in("post_id", ids).limit(limit);
        for (const a of postAtts || []) {
          results.push({
            source: "discussion",
            name: a.file_name || a.type || "file",
            url: a.url,
            mime_type: a.mime_type,
            created_at: a.created_at,
          });
        }
      }

      return results.slice(0, limit);
    }

    case "summarize_quest_progress": {
      const qid = params.quest_id;
      if (!qid) return { error: "quest_id required" };
      const [questR, subsR, partsR, postsR] = await Promise.all([
        sb.from("quests").select("id, title, status, deadline, description").eq("id", qid).maybeSingle(),
        sb.from("quest_subtasks").select("id, title, status, assignee_user_id, due_date").eq("quest_id", qid).order("order_index"),
        sb.from("quest_participants").select("user_id, status").eq("quest_id", qid),
        sb.from("feed_posts").select("id, created_at").eq("context_type", "QUEST").eq("context_id", qid).eq("is_deleted", false).order("created_at", { ascending: false }).limit(1),
      ]);
      const subs = (subsR.data || []) as any[];
      const parts = (partsR.data || []) as any[];
      return {
        quest: questR.data,
        subtasks: { total: subs.length, done: subs.filter(s => (s.status || "").toUpperCase() === "DONE").length, items: subs },
        members: { total: parts.length, active: parts.filter(p => (p.status || "").toLowerCase() === "active").length },
        last_discussion_at: postsR.data?.[0]?.created_at || null,
      };
    }

    case "search_site": {
      const q = (params.query || "").trim();
      if (!q) return { error: "query required" };
      const limit = params.limit || 5;
      const like = `%${q}%`;

      const [quests, guilds, territories, services, courses, agents] = await Promise.all([
        sb.from("quests").select("id, title, description")
          .eq("is_deleted", false).eq("is_draft", false)
          .or(`title.ilike.${like},description.ilike.${like}`).limit(limit),
        sb.from("guilds").select("id, name, description")
          .eq("is_deleted", false)
          .or(`name.ilike.${like},description.ilike.${like}`).limit(limit),
        sb.from("territories").select("id, name")
          .ilike("name", like).limit(limit),
        sb.from("services").select("id, title, description")
          .eq("is_deleted", false)
          .or(`title.ilike.${like},description.ilike.${like}`).limit(limit),
        sb.from("courses").select("id, title, description")
          .eq("is_deleted", false).eq("is_published", true)
          .or(`title.ilike.${like},description.ilike.${like}`).limit(limit),
        sb.from("agents").select("id, name, description, category, purpose")
          .eq("is_published", true)
          .or(`name.ilike.${like},description.ilike.${like},purpose.ilike.${like}`).limit(limit),
      ]);

      return {
        quests: quests.data || [],
        guilds: guilds.data || [],
        territories: territories.data || [],
        services: services.data || [],
        courses: courses.data || [],
        agents: agents.data || [],
      };
    }

    case "search_web": {
      const q = (params.query || "").trim();
      if (!q) return { error: "query required" };
      try {
        const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1&skip_disambig=1`;
        const res = await fetch(url);
        if (!res.ok) return { error: `Web search failed (${res.status})` };
        const data = await res.json();
        const relatedTopics = (data.RelatedTopics || [])
          .filter((t: any) => t.Text)
          .slice(0, 5)
          .map((t: any) => ({ text: t.Text, url: t.FirstURL }));
        return {
          summary: data.AbstractText || null,
          summary_source: data.AbstractURL || null,
          related: relatedTopics,
          note: relatedTopics.length === 0 && !data.AbstractText
            ? "No instant-answer result for this query — this tool covers known entities/topics, not full web search."
            : undefined,
        };
      } catch (e: any) {
        return { error: `Web search error: ${e?.message || e}` };
      }
    }

    case "search_platform": {
      const query = String(params.query ?? "").trim();
      if (query.length < 2) return { error: "query required" };
      const limit = Math.min(Math.max(parseInt(params.limit) || 8, 1), 15);
      const types = Array.isArray(params.types) && params.types.length ? params.types.map(String) : null;
      const allowed = await allowedSearchKeys(sb, userId);

      // Semantic and keyword search together: meaning for advice, exact words for names.
      let semantic: any[] = [];
      let semanticError: string | null = null;
      try {
        const apiKey = Deno.env.get("LOVABLE_API_KEY");
        const res = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: "openai/text-embedding-3-small", input: query.slice(0, 2000) }),
          signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) throw new Error(`embeddings ${res.status}`);
        const vector = (await res.json()).data[0].embedding as number[];
        const { data, error } = await sb.rpc("match_search_index", {
          p_query_embedding: `[${vector.join(",")}]`, p_match_count: limit * 2, p_types: types, p_allowed_keys: allowed, p_authenticated: true,
        });
        if (error) throw new Error(error.message);
        semantic = data ?? [];
      } catch (e: any) {
        semanticError = String(e?.message ?? e);
      }
      const { data: keyword } = await sb.rpc("search_index_keyword", {
        p_query: query, p_match_count: limit, p_types: types, p_allowed_keys: allowed, p_authenticated: true,
      });

      const merged = new Map<string, any>();
      for (const r of [...semantic, ...(keyword ?? [])]) {
        const key = `${r.entity_type}:${r.entity_id}`;
        const prev = merged.get(key);
        // An item found both ways ranks higher.
        merged.set(key, prev ? { ...prev, score: Math.min(1, Math.max(prev.score, r.similarity) + 0.08) } : { ...r, score: r.similarity });
      }
      // Quêtes : seulement celles que la personne peut voir ; fiche seule = sans le détail indexé (besoins…).
      const questLevels = await questAccessLevels(authHeader, [...merged.values()].filter((r) => r.entity_type === "quest").map((r) => r.entity_id));
      for (const [key, r] of merged) {
        if (r.entity_type !== "quest") continue;
        const level = questLevels[r.entity_id] ?? "none";
        if (level === "none") merged.delete(key);
        else if (level === "teaser") merged.set(key, { ...r, body: `${String(r.body ?? "").split("\n")[0].slice(0, 200)} (summary only: access on request)` });
      }
      const results = [...merged.values()]
        .filter((r) => r.score >= 0.25)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((r) => ({
          type: SEARCH_LABELS[r.entity_type] ?? r.entity_type,
          title: r.title,
          link: `[${String(r.title).replace(/[\[\]]/g, "")}](${r.url})`,
          url: r.url,
          about: String(r.body ?? "").slice(0, 260),
          topics: (r.topics ?? []).slice(0, 5),
          territories: (r.territories ?? []).slice(0, 4),
          relevance: Math.round(r.score * 100) / 100,
        }));
      return {
        results,
        note: results.length === 0
          ? "Nothing relevant indexed yet. Say so plainly; do not invent items."
          : "Cite items with their `link` (markdown). Only mention what is in these results.",
        ...(semanticError ? { semantic_unavailable: semanticError } : {}),
      };
    }

    // ── Besoins, opportunités, compétences, cotisations ──
    // Les fonctions de base qui lisent auth.uid() sont appelées au nom de la personne (son jeton), pas en service.
    case "find_needs": {
      const asUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader ?? "" } } });
      const scope = ["me", "me_and_guilds", "all"].includes(params.scope) ? params.scope : "me";
      const limit = Math.min(Math.max(parseInt(params.limit) || 8, 1), 20);
      let territoryId: string | null = null;
      let territoryName: string | null = null;
      if (params.territory) {
        const name = String(params.territory).trim();
        const { data: places } = await sb.from("territories").select("id, name, level").eq("is_deleted", false).ilike("name", `%${name}%`).limit(10);
        const best = (places ?? []).sort((a: any, b: any) =>
          Number(b.name.toLowerCase() === name.toLowerCase()) - Number(a.name.toLowerCase() === name.toLowerCase()) || a.name.length - b.name.length)[0];
        if (!best) return { results: [], note: `No territory named "${name}" on the platform. Say so and offer to search without a place.` };
        territoryId = best.id;
        territoryName = best.name;
      }
      const category = params.category ? String(params.category) : null;
      const query = params.query ? String(params.query).trim() : null;
      const { data, error } = await asUser.rpc("explore_needs", {
        p_scope: scope, p_territory_id: territoryId, p_category: category, p_query: query, p_limit: limit, p_offset: 0,
      });
      if (error) return { error: error.message };
      const qs = new URLSearchParams({ tab: "needs" });
      if (scope !== "me") qs.set("scope", scope);
      if (territoryId) qs.set("territory", territoryId);
      if (category) qs.set("category", category);
      if (query) qs.set("q", query);
      const results = (data ?? []).map((r: any) => ({
        need_id: r.need_id,
        need: r.title,
        description: r.description ? String(r.description).slice(0, 200) : null,
        category: r.category,
        quest: `[${String(r.quest_title).replace(/[\[\]]/g, "")}](/quests/${r.quest_id})`,
        guild: r.guild_id && r.guild_name ? `[${String(r.guild_name).replace(/[\[\]]/g, "")}](/guilds/${r.guild_id})` : null,
        places: r.territory_names ?? [],
        matches_skill: !r.is_mine && r.match_label && Number(r.match_score) >= 0.36
          ? (r.match_owner_type === "guild" ? `${r.match_label} (${r.match_owner_name})` : r.match_label) : null,
        is_own_quest: r.is_mine,
        already_offered: r.my_proposal_pending,
      }));
      return {
        total: data?.[0]?.total_count ?? 0,
        territory: territoryName,
        results,
        explore_link: `[${territoryName ? `Besoins · ${territoryName}` : "Onglet Besoins"}](/explore?${qs.toString()})`,
        note: results.length === 0
          ? (scope === "me"
            ? "Nothing matches the user's skills with these filters. Offer to widen (scope me_and_guilds or all) or to complete their skills (get_my_skills)."
            : "No open need with these filters. Say so plainly; do not invent needs.")
          : "Link each quest. To help on a need, propose an offer and wait for the user's explicit yes before offer_help_on_need. Needs without matches_skill have not been analysed yet or do not match.",
      };
    }

    case "offer_help_on_need": {
      if (params.confirmed !== true) {
        return { error: "Not sent: the user has not confirmed. Show them the exact offer (title, message, terms) and ask for an explicit yes." };
      }
      const asUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader ?? "" } } });
      const terms = ["free", "CREDITS", "FIAT"].includes(params.terms) ? params.terms : "free";
      const amount = Math.max(0, Number(params.amount) || 0);
      const { data, error } = await asUser.rpc("propose_need_contribution", {
        p_need_id: String(params.need_id ?? ""),
        p_title: String(params.title ?? "").slice(0, 160),
        p_description: params.message ? String(params.message).slice(0, 2000) : null,
        p_currency: terms === "FIAT" ? "FIAT" : "CREDITS",
        p_requested_credits: terms === "CREDITS" ? amount : 0,
        p_requested_fiat: terms === "FIAT" ? amount : 0,
      });
      if (error) return { error: error.message };
      return {
        ok: true,
        updated_previous_offer: !!data?.updated,
        people_notified: data?.notified ?? 0,
        relayed_to_platform_team: !!data?.relayed_to_platform,
        note: data?.relayed_to_platform
          ? "Nobody on this quest can be reached on the platform (imported place): the platform team was notified to pass the offer on. Tell the user."
          : "Tell the user how many people were notified and that the holder can accept the contribution on the quest page.",
      };
    }

    case "get_my_opportunities": {
      const asUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader ?? "" } } });
      const scope = ["me", "guilds", "all"].includes(params.scope) ? params.scope : "me";
      const limit = Math.min(Math.max(parseInt(params.limit) || 8, 1), 20);
      const { data, error } = await asUser.rpc("get_opportunities", { p_scope: scope, p_guild_id: null, p_limit: limit });
      if (error) return { error: error.message };
      const fr = String(pageCtx?.language ?? "").startsWith("fr");
      const helperPath = (r: any) => r.helper_type === "profile" ? `/users/${r.helper_id}` : r.helper_type === "guild" ? `/guilds/${r.helper_id}` : `/companies/${r.helper_id}`;
      const results = (data ?? []).filter((r: any) => r.my_verdict !== "not_relevant").map((r: any) => ({
        direction: r.direction === "you_can_help" ? "you can help" : r.direction === "help_for_you" ? "help for your quest" : "platform",
        quest: `[${String(r.quest_title).replace(/[\[\]]/g, "")}](/quests/${r.quest_id})`,
        need: r.need_label,
        helper: `[${String(r.helper_name ?? "?").replace(/[\[\]]/g, "")}](${helperPath(r)})`,
        skill: r.capability_label,
        skill_confirmed: r.capability_status === "confirmed",
        reason: (fr ? r.reason_fr : r.reason_en) ?? r.reason_fr ?? r.reason_en,
        bookable_service: r.capability_service_url ? `[${String(r.capability_service_title ?? "Service").replace(/[\[\]]/g, "")}](${r.capability_service_url})` : null,
        done: r.done,
      }));
      return {
        results,
        note: results.length === 0
          ? "No opportunity detected yet for this scope. Suggest find_needs, or completing skills (get_my_skills)."
          : "The full list with actions (I can help, ask, book, mark as done) is on the home page above the task board: link [Accueil](/).",
      };
    }

    case "get_my_skills": {
      const { data, error } = await sb.from("capabilities")
        .select("label, category, status, confidence, evidence")
        .eq("owner_type", "profile").eq("owner_id", userId).neq("status", "dismissed")
        .order("status", { ascending: true }).order("confidence", { ascending: false }).limit(40);
      if (error) return { error: error.message };
      const skills = (data ?? []).map((c: any) => {
        const ev = Array.isArray(c.evidence) ? c.evidence : [];
        return {
          skill: c.label,
          category: c.category,
          status: c.status === "confirmed" ? "confirmed" : "suggested, to confirm",
          based_on: [...new Set(ev.map((e: any) => e?.kind).filter(Boolean))].slice(0, 5),
          bookable_service: ev.some((e: any) => e?.kind === "service"),
        };
      });
      return {
        skills,
        manage_link: `[Mes compétences](/users/${userId})`,
        note: skills.length === 0
          ? "No skill known yet. Suggest 'Analyser mon activité' or adding skills on their profile (manage_link), or pasting their CV/LinkedIn there."
          : "Suggested skills are already used for matching but shown as 'to confirm'. Encourage confirming them, and turning confirmed ones into a bookable service (/services/new).",
      };
    }

    case "get_my_memberships": {
      const [{ data: rows, error }, { data: profile }] = await Promise.all([
        sb.from("user_guild_memberships")
          .select("guild_id, status, plan_code, current_period_end, cancel_at_period_end, stripe_subscription_id, stripe_customer_id, chosen_fee_credits, guilds(name, billing_model, monthly_fee_credits, monthly_fee_max_credits, entry_fee_credits, euro_membership_enabled)")
          .eq("user_id", userId).eq("role", "member"),
        sb.from("profiles").select("coins_balance").eq("user_id", userId).maybeSingle(),
      ]);
      if (error) return { error: error.message };
      const memberships = [];
      for (const m of (rows ?? []) as any[]) {
        const g = m.guilds ?? {};
        const euro = !!m.stripe_subscription_id;
        let plan: any = null;
        if (euro && m.plan_code) {
          const { data } = await sb.from("guild_membership_plans").select("label, billing_interval").eq("guild_id", m.guild_id).eq("code", m.plan_code).maybeSingle();
          plan = data;
        }
        const min = Number(g.monthly_fee_credits ?? 0), max = Number(g.monthly_fee_max_credits ?? 0);
        const coinsFee = max > min ? Math.min(Math.max(Number(m.chosen_fee_credits ?? 0) || min, min), max) : min;
        memberships.push({
          guild: `[${String(g.name ?? "Guilde").replace(/[\[\]]/g, "")}](/guilds/${m.guild_id})`,
          paid_with: euro ? "euros (card via Stripe)" : g.billing_model === "monthly" || g.billing_model === "yearly" ? "Coins" : "one-off",
          formula: plan?.label ?? m.plan_code ?? null,
          rhythm: euro ? (plan?.billing_interval === "month" ? "monthly" : "yearly") : g.billing_model === "yearly" ? "yearly" : g.billing_model === "monthly" ? "monthly" : "one-off",
          coins_per_period: !euro && (g.billing_model === "monthly" || g.billing_model === "yearly") ? coinsFee : null,
          status: m.status,
          renews_or_ends_on: m.current_period_end,
          auto_renewal: (euro || g.billing_model === "monthly" || g.billing_model === "yearly") && !m.cancel_at_period_end,
          paid_by_someone_else: euro && !m.stripe_customer_id,
        });
      }
      return {
        memberships,
        coins_balance: Number(profile?.coins_balance ?? 0),
        note: "A reminder email is sent one week before each automatic renewal. Euro memberships: card change or stopping renewal via 'Gérer ma cotisation' on the guild page. Coins memberships: renewal is taken from the Coins balance, with 7 days of grace if it is too low; top up at [Portefeuille](/settings/wallet); stop renewal on the guild page.",
      };
    }

    case "list_my_active_agents": {
      return await listActiveAgents(sb, userId);
    }

    case "consult_agent": {
      const question = String(params.question ?? "").trim();
      if (!question) return { error: "question is required" };
      if (!authHeader) return { error: "Cannot consult agent: missing auth context" };

      const available = await listActiveAgents(sb, userId);
      const wanted = normAgentName(String(params.agent_name ?? ""));
      let matches = available.filter((a) =>
        params.agent_id ? a.agent_id === params.agent_id && (!params.unit_id || a.unit_id === params.unit_id)
          : wanted ? normAgentName(a.agent_name ?? "").includes(wanted) : false);
      if (!matches.length) {
        return {
          error: "No active agent matches. The agent must be attached to a guild, pod or quest the user belongs to.",
          available_agents: [...new Set(available.map((a) => a.agent_name).filter(Boolean))],
        };
      }
      // Prefer the space the user is looking at, then guild, quest, pod.
      const rank = (a: any) => (pageCtx?.id && pageCtx.id === a.unit_id ? 0 : a.unit_type === "guild" ? 1 : a.unit_type === "quest" ? 2 : 3);
      matches = [...matches].sort((x, y) => rank(x) - rank(y));
      const target = matches[0];

      // On a quest page, ask in the quest's own context when the agent comes from its guild.
      const attempts: { unit_type: string; unit_id: string }[] = [];
      if (pageCtx?.type === "quest" && pageCtx.id && target.unit_type === "guild") {
        const { data: q } = await sb.from("quests").select("guild_id").eq("id", pageCtx.id).maybeSingle();
        if (q?.guild_id === target.unit_id) attempts.push({ unit_type: "quest", unit_id: pageCtx.id });
      }
      attempts.push({ unit_type: target.unit_type, unit_id: target.unit_id });

      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      let lastError = "Agent chat failed";
      for (const at of attempts) {
        try {
          const res = await fetch(`${supabaseUrl}/functions/v1/unit-agent-chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: authHeader },
            body: JSON.stringify({ agentId: target.agent_id, unitType: at.unit_type, unitId: at.unit_id, messages: [{ role: "user", content: question }], language: pageCtx?.language, depth: params.deep === true ? "deep" : "fast" }),
            signal: AbortSignal.timeout(65_000),
          });
          const contentType = res.headers.get("content-type") || "";
          if (res.ok && contentType.includes("text/event-stream")) {
            const text = await res.text();
            const content = text.split("\n")
              .filter((l) => l.startsWith("data: ") && !l.includes("[DONE]"))
              .map((l) => { try { return JSON.parse(l.slice(6))?.choices?.[0]?.delta?.content || ""; } catch { return ""; } })
              .join("");
            return { agent: target.agent_name, space: target.unit_name, answer: content || null };
          }
          const data = await res.json().catch(() => ({}));
          if (res.ok) return { agent: target.agent_name, space: target.unit_name, answer: data.content || data.answer || null };
          if (res.status === 402) return { error: "The user does not have enough credits for this agent.", needs_top_up: true, top_up_path: "/me/credit-shop" };
          lastError = data?.error || `Agent chat failed (${res.status})`;
        } catch (e: any) {
          lastError = `Failed to consult agent: ${e?.message || e}`;
        }
      }
      return { error: lastError };
    }

    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}

// =====================================================================
// Path overlay prompts
// =====================================================================
const PATH_PROMPTS: Record<string, (step: number) => string> = {
  explorer: (step) => `\n\n## ACTIVE PATH: THE EXPLORER 🌱
The user is on step ${step} of 6.
Guide them through: Welcome → Profile → Territory → Guild → First Quest → Celebration.
Be warm, encouraging, introduce ONE concept per turn.
Always end with a single clear next action.
If they seem lost, simplify. If experienced, accelerate.`,

  mapper: (step) => `\n\n## ACTIVE PATH: THE MAPPER 🗺️
The user is on step ${step} of 6.
Guide them through: Territory selection → Bioregional context → Sensors → Mapping quest → Community → Stewardship.
Be grounded, scientific but accessible.
Always connect to their specific territory.
Use sensor data to make the territory feel alive.`,

  builder: (step) => `\n\n## ACTIVE PATH: THE BUILDER 🏗️
The user is on step ${step} of 6.
Guide them through: Guild discovery → Join or Create → Mission design → Recruit → First collaboration → Governance.
Be collaborative, energetic.
Emphasize shared purpose and team dynamics.`,

  quester: (step) => `\n\n## ACTIVE PATH: THE QUESTER ⚔️
The user is on step ${step} of 6.
Guide them through: Browse quests → First micro-quest → Skill matching → Quest chain → Team quest → Mastery.
Be action-oriented, direct, motivating.
Always provide the next tangible step.`,

  weaver: (step) => `\n\n## ACTIVE PATH: THE WEAVER 🕸️
The user is on step ${step} of 6.
Guide them through: Value concepts → OVN introduction → Contribution logging → Credits flow → Inter-guild economics → System design.
Be thoughtful, systems-oriented.
Use metaphors of weaving and flows.`,

  steward: (step) => `\n\n## ACTIVE PATH: THE STEWARD 🌳
The user is on step ${step} of 6.
Guide them through: Leadership philosophy → Consent governance → Facilitation → Mentoring → Community health → Succession.
Be wise, patient, service-oriented.
Model the leadership you're teaching.`,
};

// =====================================================================
// System prompt
// =====================================================================
// profiles has NO foreign key to other tables, so PostgREST embeds like
// `profiles:user_id(name)` always return null. Hydrate manually via profiles.user_id.
// Removes leftover JSON fragments (stray "}]", "```json" fences, dangling braces)
// that leak into the visible reply when the model mixes prose and JSON.
function sanitizeAiText(text: string): string {
  return (text || "")
    .replace(/```(?:json)?/gi, "")
    .replace(/^\s*[}\])]+[,;]?\s*$/gm, "")
    .replace(/^\s*"?(action_cards|suggestedActions|nextPrompt|memory|scene|emotion)"?\s*:\s*.*$/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function hydrateProfiles(sb: any, rows: any[] | null, key: string): Promise<any[]> {
  const list = rows || [];
  const ids = Array.from(new Set(list.map((r: any) => r?.[key]).filter(Boolean)));
  if (!ids.length) return list;
  const { data } = await sb.from("profiles").select("user_id,name,avatar_url").in("user_id", ids);
  const map = new Map<string, any>((data || []).map((p: any) => [p.user_id, p]));
  for (const r of list) r.profiles = map.get(r?.[key]) || null;
  return list;
}

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English", fr: "French", es: "Spanish", de: "German", it: "Italian",
  pt: "Portuguese", nl: "Dutch", pl: "Polish", ro: "Romanian", ar: "Arabic",
};
function languageDirective(code?: string | null): string {
  const lang = (code || "en").split("-")[0].toLowerCase();
  const name = LANGUAGE_NAMES[lang] || lang;
  return `

MULTILINGUAL RULES:
- The reader's interface language is ${name} (${lang}). ALWAYS write your answer in ${name}, whatever language the question or the source material is in.
- The activity, discussions, member profiles and uploaded documents you scan may be in other languages. Read them in their original language and translate the relevant parts into ${name} when you quote or summarise them.
- Keep proper nouns, entity names, quest titles, file names and mention tokens of the form @[Name](type:id) verbatim — never translate or alter them.
- If a term has no good equivalent, keep the original and add a short gloss in ${name} in parentheses.`;
}

const ROUTING_PROMPT = `

## ADVISING WITH THE WHOLE PLATFORM
You can search everything on the platform with search_platform: guilds, quests and their open needs, organisations, pods, services, courses, AI agents, territories, topics and member profiles. Use it whenever someone asks where to start, what to join, who to meet, what exists around a theme or a place, or how to move forward on their path.
- Search first, advise second. Run 2–3 searches from different angles when the need is broad (the person's interest, their place, the skill they seek), then propose a short, prioritised path: what to look at first, then next steps.
- EVERY item you mention must be a markdown link built from the tool result (use the \`link\` field, e.g. [Trois-Tiers](/guilds/…)). Never write a bare name for something you found, never invent a link, and never mention an item that is not in the results.
- For people, say why they match (shared themes, place, skills) in one line and link their profile. Do not reveal anything beyond what the result shows.
- Say which kind each item is (guild, quest, service…) and prefer a handful of strong suggestions over a long list.
- If the results are thin, say so and suggest how to broaden the search or what to create.

## AGENTS AND KNOWLEDGE — HOW TO ROUTE A QUESTION
You are the front door to the platform's specialised AI agents, and you can chain several tool calls in a row.
- NEVER say "I have no information" or "I cannot interact with agents" before trying: search_site (it covers guilds, quests, territories, services, courses AND published agents), then list_my_active_agents.
- If the user names an agent (for example "Space2") or asks about a domain an agent covers (for example third places / tiers-lieux, which Space2 knows), call consult_agent with agent_name and a self-contained question, then relay its answer faithfully. Say which agent answered and keep the sources it cites. Relay its answer in full — never shorten, summarise or flatten it unless the user asks; you may add a one-line pointer to a next question. Do not invent anything beyond what it returned.
- If the user asks what an agent is, describe it from search_site (name, description, purpose) and offer to ask it something.
- If consult_agent returns needs_top_up, tell the user they need more credits and link /me/credit-shop. If no agent matches, say which agents are available (available_agents) instead of guessing.
- Follow-ups such as "an agent…" or "yes, that one" refer to the previous messages: resolve them from the conversation before asking the user to repeat.
- Answer in the user's language, keep it concise, and still return the JSON format described above.
- In "message", use markdown: links [title](/path) for every item, short lists for options.

## NEEDS, OPPORTUNITIES, SKILLS AND MEMBERSHIPS
- "How can I help / where are my skills needed / what does this place need?" → find_needs (scope 'me' first; widen to 'me_and_guilds' or 'all' if empty or if asked; pass the place as territory). Link each quest, mention the matched skill, and give explore_link for the full filtered list.
- To offer help on a need: draft the offer (title, a short message in the user's words, terms: volunteer / $CTG / euros), show it, and call offer_help_on_need with confirmed=true ONLY after an explicit yes. Never send it on your own.
- "What did the platform spot for me?" → get_my_opportunities. The actions (I can help, ask, book, mark as done, give trust) live on the home page above the task board.
- "What am I matched on / what can I offer?" → get_my_skills. Encourage confirming suggested skills and turning confirmed ones into bookable services (/services/new).
- Memberships, renewals, payments, reminders → get_my_memberships. Never invent amounts or dates.`;

const BASE_SYSTEM_PROMPT = `You are Pi, the AI assistant of ChangeTheGame — a regenerative ecosystem
platform where humans collaborate to restore territories, build guilds,
complete quests, and create new economic flows.

You are helpful, clear, and concise. You speak in a neutral, professional tone.
You are direct when clarity matters and supportive when needed.
You avoid flowery language, excessive metaphors, and poetic flourishes.
You keep responses focused and practical.

For every user input, follow this loop:
1. PERCEIVE — What is the intent? The emotion? The implicit need?
2. CONTEXTUALIZE — Check the user context provided below.
3. REASON — What is the best action? Should you ask, act, or acknowledge?
4. ACT — Call tools when action is needed. Prefer action over explanation.
5. REFLECT — After acting, suggest a natural next step.

When suggesting actions, ALWAYS return them as structured action_cards in your
response JSON. Each action card must have:

{
  "action_cards": [
    {
      "title": "Short action title",
      "subtitle": "Context line",
      "description": "Why this matters (1-2 sentences)",
      "type": "instant | quick_input | guided_flow",
      "button_label": "Click text",
      "tool_call": "tool_name",
      "tool_params": { },
      "xp_reward": 0,
      "trust_reward": 0,
      "estimated_minutes": 0,
      "priority": "primary | secondary",
      "status": "ready | locked",
      "unlock_condition": "text or null",
      "depends_on": []
    }
  ]
}

ACTION CARD RULES:
- Maximum 5 action cards per response
- First card must be completable in under 2 minutes
- Every card needs a button_label — no informational-only cards
- tool_call must be the exact name of one of your tools (never an invented name), with real ids in tool_params
  taken from tool results. What the button does: navigate_to, accept_quest and join_guild run at once;
  offer_help_on_need (need_id from find_needs, plus your draft title, message and terms) opens the offer form
  pre-filled, for the user to review and send; any other tool brings the card back to you to act on.
- xp_reward only for a card that changes something (join, accept, offer help, complete a step): it is granted
  only once that really happened. 0 for cards that only show, explain or navigate.
- If the user needs to do something before an action, insert a prerequisite
  card and lock the dependent one
- For overwhelmed users, return only 1-2 cards
- For excited users, return 3-5 cards

QUEST DECOMPOSITION:
When a user accepts a complex quest (3+ objectives or estimated time > 60 minutes),
use the create_subtasks tool to decompose it into sequential sub-tasks.
Each sub-task should:
- Be completable in under 30 minutes (ideally under 15)
- Have a clear, specific deliverable
- The FIRST sub-task must be trivially easy (< 5 minutes)
- Sub-tasks unlock sequentially

Always respond with valid JSON:
{
  "message": "Your spoken response to the user",
  "action_cards": [],
  "scene": {
    "screen": "screen_name or null",
    "navigate": "/route or null"
  },
  "memory": {
    "store": [{ "key": "string", "value": "string", "tier": "short|medium|long" }]
  },
  "nextPrompt": "suggested follow-up or null",
  "emotion": "detected tone"
}

BOUNDARIES:
- Never fabricate data. If you don't know, say so.
- Never bypass user autonomy. Suggest, don't impose.
- When uncertain, ask. When stakes are high, confirm.
- Maximum 5 action suggestions per response.
- First suggested action should always be < 2 minutes effort.
- Keep messages concise (under 150 words unless storytelling).
- Use 🌿 🌱 🌊 🌀 🍂 sparingly for warmth.`;

// =====================================================================
// Context assembler
// =====================================================================
async function assembleContext(userId: string, sb: any, conversationId: string | null) {
  const [profileRes, guildsRes, territoriesRes, questsRes, memoriesLongRes, memoriesMedRes, messagesRes] =
    await Promise.all([
      sb.from("profiles")
        .select("user_id, first_name, last_name, display_name, bio, skills, avatar_url, xp, credits_balance, current_path, path_step")
        .eq("user_id", userId)
        .maybeSingle(),
      sb.from("guild_members")
        .select("guild_id, role, guilds(id, name, description)")
        .eq("user_id", userId)
        .limit(5),
      sb.from("user_territories")
        .select("territory_id, territories(id, name, description)")
        .eq("user_id", userId)
        .limit(5),
      sb.from("quest_participants")
        .select("quest_id, status, quests(id, title, status, quest_nature)")
        .eq("user_id", userId)
        .eq("status", "active")
        .limit(10),
      sb.from("pi_memories")
        .select("key, value")
        .eq("user_id", userId)
        .eq("tier", "long"),
      sb.from("pi_memories")
        .select("key, value")
        .eq("user_id", userId)
        .eq("tier", "medium"),
      conversationId
        ? sb.from("pi_messages")
            .select("role, content, created_at")
            .eq("conversation_id", conversationId)
            .order("created_at", { ascending: true })
            .limit(20)
        : Promise.resolve({ data: [] }),
    ]);

  const profile = profileRes.data;
  const guilds = (guildsRes.data || []).map((g: any) => ({
    id: g.guild_id,
    role: g.role,
    name: g.guilds?.name,
  }));
  const territories = (territoriesRes.data || []).map((t: any) => ({
    id: t.territory_id,
    name: t.territories?.name,
  }));
  const quests = (questsRes.data || []).map((q: any) => ({
    id: q.quest_id,
    title: q.quests?.title,
    type: q.quests?.quest_nature,
    status: q.status,
  }));
  const longMemories = (memoriesLongRes.data || []).reduce((acc: any, m: any) => {
    acc[m.key] = m.value;
    return acc;
  }, {});
  const medMemories = (memoriesMedRes.data || []).reduce((acc: any, m: any) => {
    acc[m.key] = m.value;
    return acc;
  }, {});
  const history = (messagesRes.data || []).map((m: any) => ({
    role: m.role === "pi" ? "assistant" : "user",
    content: m.content,
  }));

  const contextBlock = JSON.stringify(
    { profile, guilds, territories, activeQuests: quests, longTermMemory: longMemories, mediumTermMemory: medMemories },
    null,
    2
  );

  return { contextBlock, history, profile };
}

// =====================================================================
// Session greeting logic
// =====================================================================
async function getSessionGreeting(userId: string, sb: any): Promise<{
  type: string;
  greetingContext: string;
  daysSince?: number;
  items?: any[];
  streakDays?: number;
  lastGoal?: string;
}> {
  // Check for existing conversations
  const { count: convCount } = await sb
    .from("pi_conversations")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  // a) NEW user — no conversations at all
  if (!convCount || convCount === 0) {
    return {
      type: "welcome_new",
      greetingContext: "This is a brand new user who has never chatted with Pi. Use the Explorer path tone. Welcome them warmly and help them take their first step.",
    };
  }

  // Fetch profile for last_active
  const { data: profile } = await sb
    .from("profiles")
    .select("last_active, current_path, path_step, display_name, first_name")
    .eq("user_id", userId)
    .maybeSingle();

  const userName = profile?.display_name || profile?.first_name || null;
  const now = new Date();

  // b) RETURNING user — inactive for 14+ days
  if (profile?.last_active) {
    const lastActive = new Date(profile.last_active);
    const daysSince = Math.floor((now.getTime() - lastActive.getTime()) / (1000 * 60 * 60 * 24));
    if (daysSince >= 14) {
      // Fetch recent guild/territory activity
      const { data: recentQuests } = await sb
        .from("quests")
        .select("id, title, created_at")
        .eq("is_deleted", false)
        .gte("created_at", lastActive.toISOString())
        .order("created_at", { ascending: false })
        .limit(3);

      return {
        type: "welcome_back",
        daysSince,
        items: recentQuests || [],
        greetingContext: `User "${userName || "friend"}" has been away for ${daysSince} days. Welcome them back warmly. Mention what's new: ${JSON.stringify(recentQuests?.map((q: any) => q.title) || [])}. Offer a gentle re-entry point.`,
      };
    }
  }

  // c) URGENT items
  const urgentItems: any[] = [];
  const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

  // Quest deadlines < 48h
  const { data: urgentQuests } = await sb
    .from("quest_participants")
    .select("quest_id, quests(id, title, deadline)")
    .eq("user_id", userId)
    .eq("status", "active");

  for (const qp of urgentQuests || []) {
    const q = (qp as any).quests;
    if (q?.deadline && new Date(q.deadline) <= new Date(in48h)) {
      urgentItems.push({ type: "quest_deadline", title: q.title, deadline: q.deadline, id: q.id });
    }
  }

  // Unvoted proposals closing < 24h
  const { data: openPolls } = await sb
    .from("decision_polls")
    .select("id, question, closes_at")
    .eq("status", "open")
    .lte("closes_at", in24h);

  if (openPolls?.length) {
    for (const poll of openPolls) {
      const { count: voteCount } = await sb
        .from("decision_poll_votes")
        .select("id", { count: "exact", head: true })
        .eq("poll_id", poll.id)
        .eq("user_id", userId);
      if (!voteCount || voteCount === 0) {
        urgentItems.push({ type: "proposal_vote", title: poll.question, closes_at: poll.closes_at, id: poll.id });
      }
    }
  }

  // Unread guild invitations
  const { data: pendingInvites } = await sb
    .from("guild_members")
    .select("guild_id, guilds(name)")
    .eq("user_id", userId)
    .eq("status", "INVITED")
    .limit(3);

  for (const inv of pendingInvites || []) {
    urgentItems.push({ type: "guild_invite", title: (inv as any).guilds?.name, id: inv.guild_id });
  }

  if (urgentItems.length > 0) {
    return {
      type: "urgent_items",
      items: urgentItems,
      greetingContext: `User has ${urgentItems.length} urgent item(s) needing attention: ${JSON.stringify(urgentItems)}. Address the most urgent first. Be helpful but not alarming.`,
    };
  }

  // d) STREAK at risk — check consecutive days with completed quests/observations
  const { data: recentCompletions } = await sb
    .from("contribution_logs")
    .select("created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(30);

  if (recentCompletions?.length) {
    const dates = new Set(recentCompletions.map((c: any) =>
      new Date(c.created_at).toISOString().slice(0, 10)
    ));
    const today = now.toISOString().slice(0, 10);
    let streakDays = 0;
    const checkDate = new Date(now);
    // Start from yesterday
    checkDate.setDate(checkDate.getDate() - 1);
    while (dates.has(checkDate.toISOString().slice(0, 10))) {
      streakDays++;
      checkDate.setDate(checkDate.getDate() - 1);
    }
    if (streakDays >= 2 && !dates.has(today)) {
      return {
        type: "streak_reminder",
        streakDays,
        greetingContext: `User has a ${streakDays}-day contribution streak but hasn't contributed yet today! Motivate them to keep it going. Suggest something quick.`,
      };
    }
  }

  // e) Default NORMAL session — resume from last conversation
  const { data: lastConv } = await sb
    .from("pi_conversations")
    .select("id, title, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Check medium-term memory for last goal
  const { data: lastGoalMem } = await sb
    .from("pi_memories")
    .select("value")
    .eq("user_id", userId)
    .eq("key", "current_goal")
    .eq("tier", "medium")
    .maybeSingle();

  return {
    type: "resume",
    lastGoal: lastGoalMem?.value || lastConv?.title || null,
    greetingContext: lastGoalMem?.value
      ? `User was previously working on: "${lastGoalMem.value}". Offer to continue or start something new.`
      : lastConv?.title
        ? `User's last conversation was about: "${lastConv.title}". Ask if they'd like to continue or explore something else.`
        : `Returning user with no specific last goal. Greet warmly and offer options.`,
  };
}

// =====================================================================
// Action cards: saved with an id, run on the server, marked done only when something really happened
// =====================================================================
const TOOL_NAMES = new Set(TOOLS.map((t: any) => t.function.name));
// Tools that change something for the user. A card counts as done only if one of them succeeded.
const WRITE_TOOLS = new Set(["accept_quest", "join_guild", "offer_help_on_need", "create_subtasks", "complete_subtask", "capture_vision", "advance_path_step"]);
// Tools a card button runs directly, without going back to the model.
const DIRECT_CARD_TOOLS = new Set(["accept_quest", "join_guild", "navigate_to", "complete_subtask", "advance_path_step"]);
// A card can never award XP itself through these, and its reward is capped.
const CARD_FORBIDDEN_TOOLS = new Set(["award_xp", "show_notification"]);
const MAX_CARD_XP = 50;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cardTool(c: any): string | null {
  const t = c?.tool_call || c?.toolCall || null;
  return t && TOOL_NAMES.has(t) && !CARD_FORBIDDEN_TOOLS.has(t) ? t : null;
}

/** Saves the model's cards (invalid tool names dropped, enums sanitised) and returns them for the client, with their ids. */
async function saveActionCards(sb: any, conversationId: string, userId: string, cards: any[]): Promise<any[]> {
  const list = (Array.isArray(cards) ? cards : []).filter((c: any) => c && c.title).slice(0, 5);
  if (!list.length) return [];
  const rows = list.map((c: any, i: number) => {
    const tool = cardTool(c);
    return {
      conversation_id: conversationId,
      user_id: userId,
      type: ["instant", "quick_input", "guided_flow", "locked", "background", "delegation"].includes(c.type) ? c.type : "instant",
      title: String(c.title).slice(0, 200),
      subtitle: c.subtitle || null,
      description: c.description || null,
      status: c.status === "locked" ? "locked" : "ready",
      button_label: c.button_label || c.buttonLabel || "Do this",
      tool_call: tool,
      tool_params: tool ? (c.tool_params || c.toolParams || null) : null,
      xp_reward: Math.min(Math.max(parseInt(c.xp_reward ?? c.xpReward) || 0, 0), MAX_CARD_XP),
      trust_reward: Math.max(parseInt(c.trust_reward ?? c.trustReward) || 0, 0),
      estimated_minutes: parseInt(c.estimated_minutes ?? c.effortMinutes) || null,
      unlock_condition: c.unlock_condition || c.unlockCondition || null,
      priority: ["primary", "secondary", "optional"].includes(c.priority) ? c.priority : "secondary",
      sort_order: i,
    };
  });
  const { data, error } = await sb.from("action_cards").insert(rows).select("id, sort_order");
  if (error) console.error("action_cards insert error", error);
  const idByOrder = new Map((data ?? []).map((r: any) => [r.sort_order, r.id]));
  return rows.map((r: any, i: number) => ({
    id: idByOrder.get(i) ?? null,
    title: r.title,
    subtitle: r.subtitle ?? undefined,
    description: r.description ?? undefined,
    buttonLabel: r.button_label,
    effortMinutes: r.estimated_minutes ?? undefined,
    xpReward: r.xp_reward,
    trustReward: r.trust_reward,
    priority: r.priority,
    status: r.status,
    unlockCondition: r.unlock_condition ?? undefined,
    toolCall: r.tool_call ?? undefined,
    toolParams: r.tool_params ?? undefined,
  }));
}

/**
 * Closes a card run. Only "done" (a write tool succeeded) marks the card completed and grants its XP, once.
 * "opened" (a screen or form was opened for the user), "answered" (Pi replied, nothing changed) and "failed" leave it ready.
 */
async function finishCard(sb: any, card: any, userId: string, outcome: "done" | "opened" | "answered" | "failed") {
  let xpAwarded = 0;
  if (card?.id) {
    if (outcome === "done") {
      const { data: closed } = await sb.from("action_cards")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", card.id).eq("user_id", userId).neq("status", "completed")
        .select("id");
      const xp = Math.min(Math.max(parseInt(card.xp_reward) || 0, 0), MAX_CARD_XP);
      if (closed?.length && xp > 0) {
        const { data: p } = await sb.from("profiles").select("xp").eq("user_id", userId).maybeSingle();
        await sb.from("profiles").update({ xp: (p?.xp || 0) + xp }).eq("user_id", userId);
        xpAwarded = xp;
      }
    } else if (outcome === "failed") {
      await sb.from("action_cards").update({ status: "failed" }).eq("id", card.id).eq("user_id", userId).neq("status", "completed");
    }
  }
  return { outcome, xpAwarded };
}

/** Message for a card run directly (no model), in the user's language. */
function directCardMessage(tool: string, result: any, fr: boolean): string {
  if (result?.error) {
    const dup = /duplicate|already|unique/i.test(String(result.error));
    if (dup) return fr ? "C'est déjà le cas : rien n'a changé." : "That was already the case: nothing changed.";
    return fr ? `Je n'ai pas pu le faire : ${result.error}` : `I couldn't do it: ${result.error}`;
  }
  switch (tool) {
    case "accept_quest":
      return fr ? `C'est fait : tu participes maintenant à [la quête](/quests/${result.quest_id}).` : `Done: you now take part in [the quest](/quests/${result.quest_id}).`;
    case "join_guild":
      return fr ? `Demande envoyée à [la guilde](/guilds/${result.guild_id}) : elle attend la validation d'un admin.` : `Request sent to [the guild](/guilds/${result.guild_id}): it is waiting for an admin to approve it.`;
    default:
      return fr ? "C'est fait." : "Done.";
  }
}

// =====================================================================
// Main handler
// =====================================================================
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    let { message, conversationId: incomingConvId, actionCardId, greeting: isGreetingRequest, contextType, contextId, language } = await req.json();
    console.log("[pi-cognitive] req contextType=", contextType, "contextId=", contextId, "greeting=", isGreetingRequest);
    if (!message && !isGreetingRequest) return jsonRes({ error: "message is required" }, 400);

    // Fetch current-page context (the entity the user is looking at)
    async function buildPageContext(sb: any, ctxType: string | undefined, ctxId: string | undefined): Promise<string> {
      if (!ctxType || !ctxId || ctxType === "global" || ctxType === "onboarding") return "";
      try {
        const tableMap: Record<string, { table: string; nameCol: string; descCol?: string; authorCol?: string }> = {
          quest: { table: "quests", nameCol: "title", descCol: "description", authorCol: "created_by_user_id" },
          guild: { table: "guilds", nameCol: "name", descCol: "description", authorCol: "created_by_user_id" },
          territory: { table: "territories", nameCol: "name", descCol: "description" },
        };
        const cfg = tableMap[ctxType];
        if (!cfg) return "";
        const cols = ["id", cfg.nameCol, cfg.descCol, cfg.authorCol].filter(Boolean).join(",");
        const { data: row, error: rowErr } = await sb.from(cfg.table).select(cols).eq("id", ctxId).maybeSingle();
        console.log("[buildPageContext] ctxType=", ctxType, "ctxId=", ctxId, "row?", !!row, "err=", rowErr?.message);
        if (!row) return "";
        let questTeaser = false;
        if (ctxType === "quest") {
          const level = (await questAccessLevels(authHeader, [ctxId]))[ctxId];
          if (level === "none") return "";
          questTeaser = level === "teaser";
        }
        let authorName = "";
        if (cfg.authorCol && (row as any)[cfg.authorCol]) {
          const { data: prof } = await sb.from("profiles").select("name").eq("user_id", (row as any)[cfg.authorCol]).maybeSingle();
          authorName = prof?.name || "";
        }
        const name = (row as any)[cfg.nameCol] || "Unknown";
        const desc = ((row as any)[cfg.descCol] || "").slice(0, 800);

        // ===== Enriched context: members, subtasks, recent posts, files =====
        let enriched = "";
        try {
          if (ctxType === "quest" && questTeaser) {
            enriched = "\n(The user only sees this quest's summary: its content is reserved to some members. They can request access on the page; do not describe members, tasks, discussions or files.)";
          } else if (ctxType === "quest") {
            const [partsR, hostsR, subsR, postsR] = await Promise.all([
              sb.from("quest_participants")
                .select("user_id, role, status")
                .eq("quest_id", ctxId)
                .limit(30),
              sb.from("quest_hosts")
                .select("entity_type, entity_id, role")
                .eq("quest_id", ctxId)
                .limit(10),
              sb.from("quest_subtasks")
                .select("id, title, status, assignee_user_id, due_date, priority")
                .eq("quest_id", ctxId)
                .order("order_index", { ascending: true })
                .limit(20),
              sb.from("feed_posts")
                .select("id, author_user_id, content, created_at, upvote_count")
                .eq("context_type", "QUEST")
                .eq("context_id", ctxId)
                .eq("is_deleted", false)
                .order("created_at", { ascending: false })
                .limit(8),
            ]);

            const parts = await hydrateProfiles(sb, partsR.data as any[], "user_id");
            const subs = (subsR.data || []) as any[];
            const posts = await hydrateProfiles(sb, postsR.data as any[], "author_user_id");
            const hosts = (hostsR.data || []) as any[];
            const activeMembers = parts.filter(p => (p.status || "").toLowerCase() === "active").length;
            const doneSubs = subs.filter(s => (s.status || "").toUpperCase() === "DONE").length;

            let files: any[] = [];
            const { data: questAtts } = await sb.from("attachments")
              .select("id, title, file_name, file_url, mime_type, created_at")
              .eq("target_id", ctxId)
              .order("created_at", { ascending: false })
              .limit(20);
            for (const a of questAtts || []) {
              files.push({ type: "RESOURCE", file_name: a.title || a.file_name, url: a.file_url, mime_type: a.mime_type });
            }
            if (posts.length) {
              const { data: attR } = await sb.from("post_attachments")
                .select("post_id, type, url, file_name, mime_type")
                .in("post_id", posts.map(p => p.id))
                .limit(20);
              files = files.concat(attR || []);
            }

            const memberList = parts.slice(0, 12).map(p =>
              `- ${p.profiles?.name || "Unnamed member"} (${p.role}, ${p.status})`
            ).join("\n") || "- none";
            const hostList = hosts.map(h => `- ${h.entity_type}:${h.entity_id} (${h.role})`).join("\n") || "- none";
            const subList = subs.slice(0, 12).map(s =>
              `- [${s.status}] ${s.title}${s.priority && s.priority !== "NONE" ? ` (${s.priority})` : ""}${s.due_date ? ` — due ${String(s.due_date).slice(0,10)}` : ""}`
            ).join("\n") || "- none";
            const postList = posts.slice(0, 6).map(p => {
              const snippet = (p.content || "").replace(/\s+/g, " ").slice(0, 160);
              return `- ${p.profiles?.name || "Unknown"} (${new Date(p.created_at).toISOString().slice(0,10)}, ⬆${p.upvote_count}): ${snippet}`;
            }).join("\n") || "- none";
            const fileList = files.slice(0, 10).map(f =>
              `- [${f.type}] ${f.file_name || f.url}${f.mime_type ? ` (${f.mime_type})` : ""}`
            ).join("\n") || "- none";

            enriched =
              `\n\n### MEMBERS (${activeMembers}/${parts.length} active)\n${memberList}` +
              `\n\n### HOSTS\n${hostList}` +
              `\n\n### SUBTASKS (${doneSubs}/${subs.length} done)\n${subList}` +
              `\n\n### RECENT DISCUSSIONS (${posts.length})\n${postList}` +
              `\n\n### ATTACHED FILES\n${fileList}`;
          } else if (ctxType === "guild") {
            const [membersR, postsR] = await Promise.all([
              sb.from("guild_members")
                .select("user_id, role, status")
                .eq("guild_id", ctxId)
                .limit(30),
              sb.from("feed_posts")
                .select("id, author_user_id, content, created_at")
                .eq("context_type", "GUILD")
                .eq("context_id", ctxId)
                .eq("is_deleted", false)
                .order("created_at", { ascending: false })
                .limit(6),
            ]);
            const members = await hydrateProfiles(sb, membersR.data as any[], "user_id");
            const posts = await hydrateProfiles(sb, postsR.data as any[], "author_user_id");
            const memberList = members.slice(0, 15).map(m =>
              `- ${m.profiles?.name || "Unnamed member"} (${m.role}, ${m.status})`
            ).join("\n") || "- none";
            const postList = posts.map(p => {
              const snippet = (p.content || "").replace(/\s+/g, " ").slice(0, 160);
              return `- ${p.profiles?.name || "Unknown"} (${new Date(p.created_at).toISOString().slice(0,10)}): ${snippet}`;
            }).join("\n") || "- none";
            enriched =
              `\n\n### MEMBERS (${members.length})\n${memberList}` +
              `\n\n### RECENT DISCUSSIONS\n${postList}`;
          }
        } catch (e) {
          console.error("buildPageContext enrich error", e);
        }

        return `\n\n## CURRENT PAGE CONTEXT (AUTHORITATIVE — OVERRIDES ANY PRIOR DENIAL)\nYou CAN see what page the user is on. The system injects this for every request.\nThe user is RIGHT NOW viewing a ${ctxType} called "${name}" (id: ${ctxId})${authorName ? `\nCreated by: ${authorName}` : ""}${desc ? `\nDescription: ${desc}` : ""}${enriched}\n\nRULES:\n- NEVER say "I cannot see the page" or "I don't know which page you're on". You DO know — it's stated above.\n- When the user asks about members, tasks, discussions, files, or progress of THIS ${ctxType}, answer using the lists above directly.\n- For more detail call list_quest_members / list_quest_discussions / list_quest_files / summarize_quest_progress with quest_id="${ctxId}".\n- If a previous assistant message in history claimed you couldn't see the page, IGNORE it. That was wrong.`;
      } catch (e) {
        console.error("buildPageContext error", e);
        return "";
      }
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return jsonRes({ error: "AI gateway not configured" }, 500);

    const authHeader = req.headers.get("authorization") || "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const sbUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await sbUser.auth.getUser();
    if (authErr || !user) return jsonRes({ error: "Unauthorized" }, 401);

    const sb = createClient(supabaseUrl, supabaseServiceKey);

    // Handle greeting request — get session context and generate Pi's opening
    if (isGreetingRequest) {
      const userId = user.id;
      const greeting = await getSessionGreeting(userId, sb);

      // Fetch and consume pending pi_triggers
      const { data: pendingTriggers } = await sb
        .from("pi_triggers")
        .select("id, trigger_type, trigger_data")
        .eq("user_id", userId)
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(5);

      let triggerContext = "";
      if (pendingTriggers?.length) {
        // Mark triggers as delivered
        const triggerIds = pendingTriggers.map((t: any) => t.id);
        await sb
          .from("pi_triggers")
          .update({ status: "delivered", delivered_at: new Date().toISOString() })
          .in("id", triggerIds);

        triggerContext = `\n\n## PENDING NOTIFICATIONS\nThe following events need the user's attention:\n${JSON.stringify(pendingTriggers.map((t: any) => ({ type: t.trigger_type, ...t.trigger_data })))}\nAddress the most important trigger naturally in your greeting.`;
      }

      // Create a new conversation for the greeting
      const { data: conv } = await sb
        .from("pi_conversations")
        .insert({ user_id: userId, title: "Session greeting", is_active: true })
        .select("id")
        .single();
      if (!conv) return jsonRes({ error: "Failed to create conversation" }, 500);

      const { contextBlock, profile } = await assembleContext(userId, sb, null);

      let systemPrompt = BASE_SYSTEM_PROMPT + languageDirective(language);
      if (profile?.current_path && PATH_PROMPTS[profile.current_path]) {
        systemPrompt += PATH_PROMPTS[profile.current_path](profile.path_step || 1);
      }

      systemPrompt += `\n\n## SESSION GREETING CONTEXT\n${greeting.greetingContext}${triggerContext}\n\nGenerate a warm, proactive opening message. Do NOT wait for the user to speak first. Greet them and suggest what to do next based on the context above.`;

      const pageContext = await buildPageContext(sb, contextType, contextId);
      systemPrompt += pageContext;

      const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt + `\n\n[USER CONTEXT]\n${contextBlock}` },
            { role: "user", content: "SESSION_START" },
          ],
          tools: TOOLS,
          temperature: 0.7,
          max_tokens: 1500,
        }),
      });

      if (!aiResponse.ok) {
        return jsonRes({ error: "AI service error" }, 500);
      }

      const aiData = await aiResponse.json();
      let choice = aiData.choices?.[0];

      // Process tool calls
      const actions: any[] = [];
      if (choice?.message?.tool_calls?.length) {
        const toolResults: any[] = [];
        for (const tc of choice.message.tool_calls) {
          const toolName = tc.function.name;
          let toolParams: any = {};
          try { toolParams = JSON.parse(tc.function.arguments || "{}"); } catch {}
          const result = await executeToolCall(toolName, toolParams, userId, sb, authHeader);
          toolResults.push({ tool: toolName, result });
          if (result?.action) actions.push(result);
        }

        const toolMessages = [
          { role: "system", content: systemPrompt + `\n\n[USER CONTEXT]\n${contextBlock}` },
          { role: "user", content: "SESSION_START" },
          choice.message,
          ...choice.message.tool_calls.map((tc: any, i: number) => ({
            role: "tool",
            tool_call_id: tc.id,
            content: JSON.stringify(toolResults[i]?.result || {}),
          })),
        ];
        const finalResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ model: "google/gemini-2.5-flash", messages: toolMessages, temperature: 0.7, max_tokens: 1500 }),
        });
        if (finalResponse.ok) {
          const fd = await finalResponse.json();
          choice = fd.choices?.[0];
        }
      }

      let responseText = choice?.message?.content || "Welcome! How can I help you today?";
      let actionCards: any[] = [];
      let nextPrompt: string | null = null;

      try {
        const cleaned = responseText.replace(/```json\n?/gi, "").replace(/```\n?/g, "").trim();
        let parsed: any = null;
        try {
          parsed = JSON.parse(cleaned);
        } catch {
          const firstBrace = cleaned.indexOf("{");
          const lastBrace = cleaned.lastIndexOf("}");
          if (firstBrace !== -1 && lastBrace > firstBrace) {
            try {
              parsed = JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
              const prose = cleaned.slice(0, firstBrace).trim();
              if (prose && !parsed.message) parsed.message = prose;
            } catch { /* ignore */ }
          }
        }
        if (parsed) {
          responseText = parsed.message || responseText;
          actionCards = parsed.action_cards || parsed.suggestedActions || [];
          nextPrompt = parsed.nextPrompt || null;
        }
      } catch {}
      responseText = sanitizeAiText(responseText);

      // Save the cards first (they get their ids), then the greeting as Pi message
      const normalizedCards = await saveActionCards(sb, conv.id, userId, actionCards);

      await sb.from("pi_messages").insert({
        conversation_id: conv.id,
        role: "pi",
        content: responseText,
        metadata: {
          suggestedActions: normalizedCards.length > 0 ? normalizedCards : undefined,
          greetingType: greeting.type,
        },
      });

      return jsonRes({
        message: responseText,
        conversationId: conv.id,
        suggestedActions: normalizedCards,
        actions,
        nextPrompt,
        greetingType: greeting.type,
        pathInfo: profile?.current_path
          ? { path: profile.current_path, step: profile.path_step || 1, totalSteps: 6 }
          : null,
      });
    }
    const userId = user.id;

    // Resolve or create conversation
    let conversationId = incomingConvId;
    if (!conversationId) {
      const { data: conv, error: convErr } = await sb
        .from("pi_conversations")
        .insert({ user_id: userId, title: message.slice(0, 60), is_active: true })
        .select("id")
        .single();
      if (convErr) return jsonRes({ error: "Failed to create conversation" }, 500);
      conversationId = conv.id;
    }

    // A click on an action card: run it here and tell the client what really happened.
    // Cards saved by this function are read back from the database (tool, params and XP cannot be forged);
    // older clients still send "EXECUTE_ACTION: {tool, params}", run the same way but without XP.
    const fr = String(language ?? "").startsWith("fr");
    let shownMessage = message;
    let cardRun: any = null;
    if (actionCardId || String(message ?? "").startsWith("EXECUTE_ACTION:")) {
      let card: any = null;
      if (actionCardId) {
        if (!UUID_RE.test(String(actionCardId))) return jsonRes({ error: "Invalid action" }, 400);
        const { data } = await sb.from("action_cards").select("*").eq("id", actionCardId).eq("user_id", userId).maybeSingle();
        if (!data) return jsonRes({ error: "Action not found" }, 404);
        card = data;
      } else {
        let p: any = {};
        try { p = JSON.parse(String(message).slice("EXECUTE_ACTION:".length)); } catch {}
        card = { id: null, title: p.title || p.tool || "Action", description: p.description || null, tool_call: p.tool, tool_params: p.params, xp_reward: 0, status: "ready" };
      }
      shownMessage = `▶ ${card.title}`;
      if (card.status === "completed") {
        return jsonRes({ message: fr ? "C'est déjà fait." : "This is already done.", conversationId, cardResult: { outcome: "done", xpAwarded: 0 } });
      }
      const tool = cardTool(card);
      const params = card.tool_params && typeof card.tool_params === "object" ? card.tool_params : {};
      const saveExchange = async (reply: string, meta?: any) => {
        await sb.from("pi_messages").insert({ conversation_id: conversationId, role: "user", content: shownMessage });
        await sb.from("pi_messages").insert({ conversation_id: conversationId, role: "pi", content: reply, metadata: meta });
      };

      // Offering help sends something to other people: open the offer form, pre-filled, for the user to review and send.
      if (tool === "offer_help_on_need" && UUID_RE.test(String(params.need_id ?? ""))) {
        const { data: need } = await sb.from("quest_needs").select("id, title, status").eq("id", params.need_id).maybeSingle();
        if (need && ["OPEN", "ACTIVE", "IN_PROGRESS"].includes(String(need.status ?? "OPEN").toUpperCase())) {
          const reply = fr
            ? `J'ouvre le formulaire pour proposer ton aide sur « ${need.title} ». Relis-le, ajuste-le, puis envoie-le : la personne qui a posé le besoin, le porteur de la quête et les admins de sa guilde seront prévenus.`
            : `Opening the form to offer your help on "${need.title}". Review it, adjust it, then send it: whoever posted the need, the quest holder and the guild admins will be notified.`;
          await saveExchange(reply);
          return jsonRes({
            message: reply,
            conversationId,
            actions: [{
              action: "navigate",
              screen: `/explore?tab=needs&scope=all&offer=${need.id}`,
              draft: {
                key: `pi-offer-draft:${need.id}`,
                value: { title: params.title ?? null, message: params.message ?? null, terms: params.terms ?? null, amount: params.amount ?? null },
              },
            }],
            cardResult: await finishCard(sb, card, userId, "opened"),
          });
        }
      }

      if (tool && DIRECT_CARD_TOOLS.has(tool)) {
        const result = await executeToolCall(tool, params, userId, sb, authHeader, { type: contextType, id: contextId, language });
        await sb.from("pi_tool_logs").insert({ conversation_id: conversationId, tool_name: tool, params, result });
        const isNav = result?.action === "navigate";
        const dup = result?.error && /duplicate|already|unique/i.test(String(result.error));
        const outcome = isNav ? "opened" : result?.error ? (dup ? "answered" : "failed") : WRITE_TOOLS.has(tool) ? "done" : "answered";
        const reply = isNav ? "" : directCardMessage(tool, result, fr);
        if (reply) await saveExchange(reply, { toolCalls: [{ tool, result }] });
        return jsonRes({
          message: reply || null,
          conversationId,
          actions: result?.action ? [result] : [],
          cardResult: await finishCard(sb, card, userId, outcome),
        });
      }

      // Anything else: the model acts on the card with its tools; the result decides whether it is done.
      cardRun = card;
      message = [
        `The user clicked your action card "${card.title}"${card.description ? ` (${card.description})` : ""}.`,
        tool ? `Suggested tool: ${tool} with ${JSON.stringify(params)}.` : "",
        "Do what the card says now, with your tools. If it needs the user's input or explicit agreement (for instance before offer_help_on_need), ask for it in one short message.",
        "Never say that something was done, sent or changed unless a tool call in this turn succeeded.",
      ].filter(Boolean).join("\n");
    }

    // Save user message
    await sb.from("pi_messages").insert({
      conversation_id: conversationId,
      role: "user",
      content: shownMessage,
    });

    // Assemble context + history
    const { contextBlock, history, profile } = await assembleContext(userId, sb, conversationId);

    // Build system prompt with path overlay
    let systemPrompt = BASE_SYSTEM_PROMPT + languageDirective(language);
    if (profile?.current_path && PATH_PROMPTS[profile.current_path]) {
      systemPrompt += PATH_PROMPTS[profile.current_path](profile.path_step || 1);
    }

    const pageContext2 = await buildPageContext(sb, contextType, contextId);
    systemPrompt += pageContext2;
    systemPrompt += ROUTING_PROMPT;
    try {
      // What the user already has at hand, so Pi can point to it without having to look it up first.
      const mine = await listActiveAgents(sb, userId);
      if (mine.length) {
        const lines = mine.slice(0, 12).map((a) => `- ${a.agent_name} — ${a.description || a.category || ""} (in ${a.unit_name ?? a.unit_type})`);
        systemPrompt += `\n\n## THE USER'S ACTIVE AGENTS (already available in their spaces)\n${lines.join("\n")}\nWhen a request matches one of them, offer to ask it (or consult it directly) and suggest one concrete question to try.`;
      }
    } catch (e) {
      console.error("agents brief error", e);
    }

    // Build messages for AI
    const aiMessages = [
      { role: "system", content: systemPrompt + `\n\n[USER CONTEXT]\n${contextBlock}` },
      ...history.slice(-18),
      { role: "user", content: message },
    ];

    // Agentic loop: the model can chain tool calls (search → list agents → consult an agent …).
    const PI_MODEL = "google/gemini-3-flash-preview";
    const MAX_TOOL_ROUNDS = 5;
    const convo: any[] = [...aiMessages];
    const toolResults: any[] = [];
    const actions: any[] = [];
    let choice: any = null;

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      // The last round has no tools, so the model must answer with what it gathered.
      const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: PI_MODEL,
          messages: convo,
          ...(round < MAX_TOOL_ROUNDS ? { tools: TOOLS } : {}),
          temperature: 0.4,
          max_tokens: 4000,
        }),
      });

      if (!aiResponse.ok) {
        const errText = await aiResponse.text();
        console.error("AI gateway error:", aiResponse.status, errText);
        if (aiResponse.status === 429) return jsonRes({ error: "Rate limit exceeded. Please try again shortly." }, 429);
        if (aiResponse.status === 402) return jsonRes({ error: "AI credits exhausted. Please top up." }, 402);
        return jsonRes({ error: "AI service error" }, 500);
      }

      const aiData = await aiResponse.json();
      choice = aiData.choices?.[0];
      const calls = choice?.message?.tool_calls ?? [];
      if (!calls.length) break;

      convo.push(choice.message);
      for (const tc of calls) {
        const toolName = tc.function.name;
        let toolParams: any = {};
        try {
          toolParams = JSON.parse(tc.function.arguments || "{}");
        } catch {}

        const result = await executeToolCall(toolName, toolParams, userId, sb, authHeader, { type: contextType, id: contextId, language });
        toolResults.push({ tool: toolName, result });

        await sb.from("pi_tool_logs").insert({
          conversation_id: conversationId,
          tool_name: toolName,
          params: toolParams,
          result,
        });

        if (result?.action) actions.push(result);
        convo.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(result ?? {}).slice(0, 12000) });
      }
    }

    // Parse the response
    let responseText = choice?.message?.content || "I'm here. What would you like to explore?";
    let actionCards: any[] = [];
    let scene: any = null;
    let memoryOps: any[] = [];
    let nextPrompt: string | null = null;
    let emotion: string | null = null;

    try {
      const cleaned = responseText.replace(/```json\n?/gi, "").replace(/```\n?/g, "").trim();
      let parsed: any = null;
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        // Try to extract an embedded JSON object (model returned prose + JSON)
        const firstBrace = cleaned.indexOf("{");
        const lastBrace = cleaned.lastIndexOf("}");
        if (firstBrace !== -1 && lastBrace > firstBrace) {
          const candidate = cleaned.slice(firstBrace, lastBrace + 1);
          try {
            parsed = JSON.parse(candidate);
            const prose = cleaned.slice(0, firstBrace).trim();
            if (prose && !parsed.message) parsed.message = prose;
          } catch { /* leave as plain text */ }
        }
      }
      if (parsed) {
        responseText = parsed.message || responseText;
        actionCards = parsed.action_cards || parsed.suggestedActions || [];
        scene = parsed.scene || null;
        memoryOps = parsed.memory?.store || [];
        nextPrompt = parsed.nextPrompt || null;
        emotion = parsed.emotion || null;
      }
    } catch {
      // Plain text response — that's fine
    }
    responseText = sanitizeAiText(responseText);

    // Process memory operations
    for (const mem of memoryOps) {
      await sb.from("pi_memories").upsert(
        {
          user_id: userId,
          key: mem.key,
          value: mem.value,
          tier: mem.tier,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,key,tier" }
      );
    }

    // Save action cards (they get their ids) for the frontend
    const normalizedCards = await saveActionCards(sb, conversationId, userId, actionCards);

    // Save Pi's response
    await sb.from("pi_messages").insert({
      conversation_id: conversationId,
      role: "pi",
      content: responseText,
      metadata: {
        suggestedActions: normalizedCards.length > 0 ? normalizedCards : undefined,
        scene,
        emotion,
        toolCalls: toolResults.length > 0 ? toolResults : undefined,
      },
    });

    // Update conversation
    await sb.from("pi_conversations").update({
      updated_at: new Date().toISOString(),
      title: String(shownMessage).slice(0, 60),
    }).eq("id", conversationId);

    let cardResult: any = undefined;
    if (cardRun) {
      const did = toolResults.some((r: any) => WRITE_TOOLS.has(r.tool) && r.result && !r.result.error);
      const opened = actions.some((a: any) => a.action === "navigate");
      cardResult = await finishCard(sb, cardRun, userId, did ? "done" : opened ? "opened" : "answered");
    }

    return jsonRes({
      message: responseText,
      conversationId,
      suggestedActions: normalizedCards,
      actions,
      scene,
      nextPrompt,
      emotion,
      cardResult,
      pathInfo: profile?.current_path
        ? { path: profile.current_path, step: profile.path_step || 1, totalSteps: 6 }
        : null,
    });
  } catch (e: any) {
    console.error("pi-cognitive error:", e);
    return jsonRes({ error: e.message || "Internal error" }, 500);
  }
});
