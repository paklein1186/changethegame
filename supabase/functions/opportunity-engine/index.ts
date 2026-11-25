// Moteur d'opportunités : relie ce dont les projets ont besoin à ce que les membres, guildes et organisations
// peuvent offrir.
//
// 1. Capacités : pour chaque personne / guilde / organisation dont l'activité a changé, un modèle lit les preuves
//    (tâches faites, contributions, quêtes menées, services, cours, attestations, CV fourni, bio…) et en déduit
//    ce qu'elle peut offrir, chaque capacité citant ses preuves. Les capacités confirmées ou écartées par leur
//    titulaire ne sont jamais écrasées.
// 2. Besoins : pour chaque quête ouverte qui a changé, le modèle distingue les besoins écrits (explicites) de ceux
//    que ce type de projet rencontre toujours (implicites), en s'appuyant sur les besoins de quêtes comparables.
// 3. Correspondances : chaque besoin actif est comparé aux capacités (vecteurs), le score tient compte du sens,
//    du territoire, des thèmes et de la solidité des preuves ; un modèle valide chaque nouvelle paire et écrit
//    une phrase d'explication (FR + EN).
//
// Appel : tâche planifiée (toutes les heures) ou personne connectée — { mode: "profile" } pour soi,
// { mode: "quest", quest_id } si elle gère la quête, { mode: "guild", guild_id } si elle administre la guilde,
// { mode: "all" } pour un administrateur.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { authenticateCronRequest } from "../_shared/cron-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const GATEWAY = "https://ai.gateway.lovable.dev/v1";
const EMBEDDING_MODEL = "openai/text-embedding-3-small"; // même modèle que l'index de recherche (1536 dimensions)
const CHAT_MODEL = "google/gemini-3-flash-preview";
const TIME_BUDGET_MS = 125_000;
const BUDGET = { owners: 14, quests: 10, embeds: 300, pairs: 60 };
const SIM_MIN = 0.36;     // similarité minimale entre un besoin et une capacité
const SCORE_MIN = 0.42;   // score minimal pour proposer une correspondance
const PER_NEED = 4;       // correspondances gardées par besoin

const CAP_CATEGORIES = ["SKILLS", "TOOLS", "PLACE", "FUNDING", "MENTORSHIP", "VISIBILITY", "PARTNERSHIPS", "VOLUNTEER"];
const NEED_CATEGORIES = ["GENERAL", ...CAP_CATEGORIES];
const OPEN_NEED = new Set(["OPEN", "ACTIVE", "IN_PROGRESS"]);
const OPEN_QUEST = new Set(["OPEN", "IN_PROGRESS"]);
const DONE_TASK = new Set(["DONE", "COMPLETED"]);

// ── utilitaires ──────────────────────────────────────────────────────────────────────────────────
const clip = (v: unknown, n: number) => {
  const s = String(v ?? "").replace(/\s+/g, " ").trim();
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
};
async function sha256(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function fetchAll(q: (from: number, to: number) => any): Promise<any[]> {
  const out: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await q(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}
const groupBy = <T>(rows: T[], key: (r: T) => string | null | undefined) => {
  const m = new Map<string, T[]>();
  for (const r of rows) { const k = key(r); if (!k) continue; if (!m.has(k)) m.set(k, []); m.get(k)!.push(r); }
  return m;
};

async function embed(apiKey: string, texts: string[]): Promise<number[][]> {
  const res = await fetch(`${GATEWAY}/embeddings`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts }),
    signal: AbortSignal.timeout(40_000),
  });
  if (!res.ok) throw Object.assign(new Error(`embeddings ${res.status}`), { status: res.status });
  return (await res.json()).data.map((d: any) => d.embedding as number[]);
}

async function callTool(apiKey: string, system: string, user: string, name: string, parameters: unknown): Promise<any> {
  const res = await fetch(`${GATEWAY}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: CHAT_MODEL,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      tools: [{ type: "function", function: { name, description: name, parameters } }],
      tool_choice: { type: "function", function: { name } },
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw Object.assign(new Error(`modèle ${res.status}`), { status: res.status });
  const data = await res.json();
  const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) throw new Error("réponse du modèle sans résultat");
  return typeof args === "string" ? JSON.parse(args) : args;
}

// ── consignes des modèles ────────────────────────────────────────────────────────────────────────
const CAP_SYSTEM = `You build the "what I can offer" profile of a member (person, guild or organisation) of changethegame,
a platform where people cooperate on territorial projects (third places, farms, commons, transition projects).
From the numbered EVIDENCE only, list what they can concretely offer to OTHER projects: skills, know-how,
resources or equipment, places, funding, mentoring, visibility, partnerships/network, volunteer time.
Rules:
- Only capabilities supported by the evidence. Cite the evidence numbers.
- Concrete and specific labels (3–7 words), e.g. "Organic market gardening", "Grant writing for EU funds",
  "Event hall for 80 people" — never vague ones like "Passionate", "Teamwork".
- confidence: 0.9 when proven by completed tasks, logged contributions, services, courses or peer attestations;
  0.6 for projects they led; 0.4 when only self-declared (bio, CV, interests).
- Write label and description in the language the evidence is mostly written in.
- At most 8 capabilities. Return an empty list if the evidence is too thin.`;

const NEED_SYSTEM = `You help project holders on changethegame (territorial cooperation: third places, farms, commons,
transition projects) understand what their project REALLY needs.
From the project description, its tasks and existing needs, list:
- explicit needs: stated in the text (even vaguely);
- implied needs: what projects of this kind, at this stage and in this place, almost always need but are not stated
  (e.g. a new farm: access to land, agronomic know-how, legal status and permits, start-up funding, equipment,
  outlets, seasonal volunteers). Use the needs of comparable projects when given.
Rules:
- Concrete labels (3–7 words) someone could answer, e.g. "Agronomist for soil diagnosis", "Access to 2 ha of farmland".
- reason: one sentence explaining why the project needs it.
- priority: 1 = blocking now, 2 = needed soon, 3 = useful later.
- Do not repeat the existing needs. At most 4 explicit and 6 implied needs.
- Write in the language of the project description.`;

const PAIR_SYSTEM = `You check suggested matches on changethegame between a project need and what a member can offer.
For each pair, keep it only if the member could realistically help with this specific need (same kind of help, plausible
scale, not a vague thematic overlap). When kept, write one short, concrete sentence explaining why, citing the evidence
(e.g. "Marie led the Huy shared garden and teaches organic market gardening"), in French (reason_fr) and English (reason_en).`;

// ── moteur ───────────────────────────────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const startedAt = Date.now();
  const timeLeft = () => TIME_BUDGET_MS - (Date.now() - startedAt);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return json({ error: "LOVABLE_API_KEY missing" }, 500);

  const body = await req.json().catch(() => ({}));
  const cronSecret = Deno.env.get("CRON_SECRET");
  const managedCron = !!Deno.env.get("LOVABLE_CRON_SECRET") && authenticateCronRequest(req) === null;
  const isCron = managedCron || (!!cronSecret && req.headers.get("x-cron-secret") === cronSecret);

  // Qui demande quoi.
  let mode: "all" | "profile" | "quest" | "guild" = "all";
  let target: { ownerType?: string; ownerId?: string; questId?: string } = {};
  if (!isCron) {
    const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: auth } = await anon.auth.getUser((req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, ""));
    const uid = auth?.user?.id;
    if (!uid) return json({ error: "Unauthorized" }, 401);
    const { data: isAdmin } = await sb.rpc("has_role", { _user_id: uid, _role: "admin" });
    mode = ["profile", "quest", "guild", "all"].includes(body.mode) ? body.mode : "profile";
    if (mode === "all" && isAdmin !== true) return json({ error: "Forbidden" }, 403);
    if (mode === "profile") target = { ownerType: "profile", ownerId: uid };
    if (mode === "quest") {
      const { data: ok } = await sb.rpc("is_quest_manager", { _quest_id: body.quest_id, _uid: uid });
      if (ok !== true) return json({ error: "Forbidden" }, 403);
      target = { questId: String(body.quest_id) };
    }
    if (mode === "guild") {
      const { data: ok } = await sb.rpc("can_manage_capability_owner", { _owner_type: "guild", _owner_id: body.guild_id, _uid: uid });
      if (ok !== true) return json({ error: "Forbidden" }, 403);
      target = { ownerType: "guild", ownerId: String(body.guild_id) };
    }
  }

  const report: Record<string, any> = {
    mode, owners_inferred: 0, capabilities_written: 0, quests_analysed: 0, needs_suggested: 0,
    embedded: 0, needs_active: 0, matches_new: 0, matches_updated: 0, matches_removed: 0, pairs_rejected: 0,
    deferred: 0, errors: [] as string[],
  };
  const fail = (where: string, e: any) => { report.errors.push(`${where} : ${e?.message ?? e}`); };
  let embedBudget = BUDGET.embeds;

  try {
    // ── données (la plateforme est petite : tout est lu en une fois) ──
    const [
      profiles, guilds, companies, quests, participants, subtasks, contributions, services, courses, trust,
      guildMembers, companyMembers, topics, userTopics, guildTopics, questTopics, territories, userTerr, guildTerr,
      questTerr, closure, questNeeds, inputs, runs,
    ] = await Promise.all([
      fetchAll((a, b) => sb.from("profiles").select("user_id, name, headline, bio, location, website_url, linkedin_url").range(a, b)),
      fetchAll((a, b) => sb.from("guilds").select("id, name, description, is_physical_place, is_approved, public_visibility, website_url").eq("is_deleted", false).range(a, b)),
      fetchAll((a, b) => sb.from("companies").select("id, name, description, mission_statement, sector, collaboration_interests, website_url").eq("is_deleted", false).range(a, b)),
      fetchAll((a, b) => sb.from("quests").select("id, title, description, status, created_by_user_id, guild_id, public_visibility, is_draft, updated_at").eq("is_deleted", false).range(a, b)),
      fetchAll((a, b) => sb.from("quest_participants").select("quest_id, user_id, role").range(a, b)),
      fetchAll((a, b) => sb.from("quest_subtasks").select("quest_id, title, description, status, completed_by_user_id, assignee_user_id, estimated_minutes").range(a, b)),
      fetchAll((a, b) => sb.from("contribution_logs").select("user_id, quest_id, title, description, task_type, contribution_type, hours_logged, verified_at, status").range(a, b)),
      fetchAll((a, b) => sb.from("services").select("id, title, description, provider_user_id, provider_guild_id, owner_type, owner_id, location_text").eq("is_deleted", false).eq("is_draft", false).range(a, b)),
      fetchAll((a, b) => sb.from("courses").select("id, title, description, owner_user_id, owner_guild_id, owner_company_id, level").eq("is_deleted", false).eq("is_published", true).range(a, b)),
      fetchAll((a, b) => sb.from("trust_edges").select("to_node_type, to_node_id, edge_type, tags, note, status, visibility").range(a, b)),
      fetchAll((a, b) => sb.from("guild_members").select("guild_id, user_id, role").range(a, b)),
      fetchAll((a, b) => sb.from("company_members").select("company_id, user_id, role").range(a, b)),
      fetchAll((a, b) => sb.from("topics").select("id, name").range(a, b)),
      fetchAll((a, b) => sb.from("user_topics").select("user_id, topic_id").range(a, b)),
      fetchAll((a, b) => sb.from("guild_topics").select("guild_id, topic_id").range(a, b)),
      fetchAll((a, b) => sb.from("quest_topics").select("quest_id, topic_id").range(a, b)),
      fetchAll((a, b) => sb.from("territories").select("id, name, level").eq("is_deleted", false).range(a, b)),
      fetchAll((a, b) => sb.from("user_territories").select("user_id, territory_id").range(a, b)),
      fetchAll((a, b) => sb.from("guild_territories").select("guild_id, territory_id").range(a, b)),
      fetchAll((a, b) => sb.from("quest_territories").select("quest_id, territory_id").range(a, b)),
      fetchAll((a, b) => sb.from("territory_closure").select("ancestor_id, descendant_id").range(a, b)),
      fetchAll((a, b) => sb.from("quest_needs").select("id, quest_id, title, description, category, status").range(a, b)),
      fetchAll((a, b) => sb.from("capability_inputs").select("user_id, cv_text").range(a, b)),
      fetchAll((a, b) => sb.from("capability_runs").select("owner_type, owner_id, evidence_hash").range(a, b)),
    ]);

    const topicName = new Map<any, any>(topics.map((t: any) => [t.id, t.name]));
    const terrById = new Map<any, any>(territories.map((t: any) => [t.id, t]));
    const questById = new Map<any, any>(quests.map((q: any) => [q.id, q]));
    const runHash = new Map<any, any>(runs.map((r: any) => [`${r.owner_type}:${r.owner_id}`, r.evidence_hash]));
    const cvByUser = new Map<any, any>(inputs.map((i: any) => [i.user_id, i.cv_text]));
    const byUser = {
      participations: groupBy(participants, (r: any) => r.user_id),
      tasks: groupBy(subtasks.filter((t: any) => DONE_TASK.has(String(t.status ?? "").toUpperCase())), (r: any) => r.completed_by_user_id ?? r.assignee_user_id),
      contributions: groupBy(contributions, (r: any) => r.user_id),
      services: groupBy(services, (r: any) => r.provider_user_id ?? (r.owner_type === "user" || r.owner_type === "USER" ? r.owner_id : null)),
      courses: groupBy(courses, (r: any) => r.owner_user_id),
      guilds: groupBy(guildMembers, (r: any) => r.user_id),
      topics: groupBy(userTopics, (r: any) => r.user_id),
      territories: groupBy(userTerr, (r: any) => r.user_id),
    };
    const questsCreatedBy = groupBy(quests, (q: any) => q.created_by_user_id);
    // Seules les attestations publiques servent de preuve.
    const trustTo = groupBy(
      trust.filter((t: any) => String(t.status ?? "active").toLowerCase() !== "revoked" && ["public", ""].includes(String(t.visibility ?? "public").toLowerCase())),
      (t: any) => `${t.to_node_type}:${t.to_node_id}`,
    );
    const guildById = new Map<any, any>(guilds.map((g: any) => [g.id, g]));
    const membersOfGuild = groupBy(guildMembers, (r: any) => r.guild_id);

    // ── 1. capacités ────────────────────────────────────────────────────────────────────────────
    type Ev = { kind: string; title: string; url?: string; weight: number };
    const evidenceFor = (ownerType: string, id: string): Ev[] => {
      const ev: Ev[] = [];
      const add = (kind: string, title: string, weight: number, url?: string) => { if (title.trim()) ev.push({ kind, title: clip(title, 420), weight, url }); };
      if (ownerType === "profile") {
        const p = profiles.find((x: any) => x.user_id === id);
        if (!p) return ev;
        if (p.headline || p.bio) add("self", `Self-description: ${p.headline ?? ""} — ${p.bio ?? ""}`, 1, `/users/${id}`);
        const cv = cvByUser.get(id);
        if (cv) add("cv", `CV / LinkedIn provided by the person: ${clip(cv, 3000)}`, 2);
        for (const s of byUser.services.get(id) ?? []) add("service", `Offers the service "${s.title}": ${s.description ?? ""}`, 3, `/services/${s.id}`);
        for (const c of byUser.courses.get(id) ?? []) add("course", `Teaches the course "${c.title}": ${c.description ?? ""}`, 3, `/courses/${c.id}`);
        for (const t of byUser.tasks.get(id) ?? []) add("task", `Completed the task "${t.title}" in the project "${questById.get(t.quest_id)?.title ?? "?"}"${t.description ? `: ${t.description}` : ""}`, 3, `/quests/${t.quest_id}`);
        for (const c of byUser.contributions.get(id) ?? []) add("contribution", `${c.verified_at ? "Verified contribution" : "Contribution"}: "${c.title ?? c.task_type ?? c.contribution_type}"${c.hours_logged ? ` (${c.hours_logged} h)` : ""}${c.description ? ` — ${c.description}` : ""}`, c.verified_at ? 3 : 2, c.quest_id ? `/quests/${c.quest_id}` : undefined);
        for (const q of questsCreatedBy.get(id) ?? []) if (!q.is_draft) add("led", `Created and leads the project "${q.title}": ${q.description ?? ""}`, 2, `/quests/${q.id}`);
        for (const pa of byUser.participations.get(id) ?? []) {
          const q = questById.get(pa.quest_id);
          if (q && q.created_by_user_id !== id) add("joined", `Takes part in the project "${q.title}" as ${pa.role ?? "participant"}`, 1, `/quests/${q.id}`);
        }
        for (const t of trustTo.get(`profile:${id}`) ?? []) add("attestation", `Peer attestation (${t.edge_type})${t.tags?.length ? ` on ${t.tags.join(", ")}` : ""}${t.note ? `: ${t.note}` : ""}`, 3);
        for (const m of byUser.guilds.get(id) ?? []) { const g = guildById.get(m.guild_id); if (g) add("guild", `Member of the guild "${g.name}"${m.role ? ` (${m.role})` : ""}`, 1, `/guilds/${g.id}`); }
        const interests = (byUser.topics.get(id) ?? []).map((t: any) => topicName.get(t.topic_id)).filter(Boolean);
        if (interests.length) add("interests", `Interests: ${interests.join(", ")}`, 1);
      } else if (ownerType === "guild") {
        const g = guildById.get(id);
        if (!g) return ev;
        if (g.description) add("self", `About the guild: ${g.description}`, 1, `/guilds/${id}`);
        if (g.is_physical_place) add("place", `The guild runs a physical place (third place / venue)`, 3, `/guilds/${id}`);
        for (const s of services.filter((s: any) => s.provider_guild_id === id || ((s.owner_type ?? "").toUpperCase() === "GUILD" && s.owner_id === id))) add("service", `Offers the service "${s.title}": ${s.description ?? ""}`, 3, `/services/${s.id}`);
        for (const c of courses.filter((c: any) => c.owner_guild_id === id)) add("course", `Teaches the course "${c.title}": ${c.description ?? ""}`, 3, `/courses/${c.id}`);
        for (const q of quests.filter((q: any) => q.guild_id === id && !q.is_draft)) add("project", `Project of the guild "${q.title}" (${q.status}): ${q.description ?? ""}`, String(q.status).toUpperCase() === "COMPLETED" ? 3 : 2, `/quests/${q.id}`);
        for (const t of trustTo.get(`guild:${id}`) ?? []) add("attestation", `Peer attestation (${t.edge_type})${t.tags?.length ? ` on ${t.tags.join(", ")}` : ""}${t.note ? `: ${t.note}` : ""}`, 3);
        const n = (membersOfGuild.get(id) ?? []).length;
        if (n > 2) add("members", `${n} members`, 1);
        const th = guildTopics.filter((t: any) => t.guild_id === id).map((t: any) => topicName.get(t.topic_id)).filter(Boolean);
        if (th.length) add("interests", `Themes: ${th.join(", ")}`, 1);
      } else {
        const c = companies.find((x: any) => x.id === id);
        if (!c) return ev;
        if (c.description || c.mission_statement) add("self", `About the organisation (${c.sector ?? "sector unknown"}): ${c.mission_statement ?? ""} ${c.description ?? ""}`, 1, `/companies/${id}`);
        if (c.collaboration_interests) add("interests", `Open to collaborate on: ${typeof c.collaboration_interests === "string" ? c.collaboration_interests : JSON.stringify(c.collaboration_interests)}`, 2);
        for (const s of services.filter((s: any) => (s.owner_type ?? "").toUpperCase() === "COMPANY" && s.owner_id === id)) add("service", `Offers the service "${s.title}": ${s.description ?? ""}`, 3, `/services/${s.id}`);
        for (const co of courses.filter((x: any) => x.owner_company_id === id)) add("course", `Teaches the course "${co.title}": ${co.description ?? ""}`, 3, `/courses/${co.id}`);
      }
      return ev;
    };

    // Qui analyser : la cible demandée, sinon ceux dont les preuves ont changé (dans la limite du budget).
    const owners: { type: string; id: string }[] = target.ownerId
      ? [{ type: target.ownerType!, id: target.ownerId }]
      : mode === "quest"
        ? []
        : [
            ...profiles.map((p: any) => ({ type: "profile", id: p.user_id })),
            ...guilds.filter((g: any) => g.is_approved !== false).map((g: any) => ({ type: "guild", id: g.id })),
            ...companies.map((c: any) => ({ type: "company", id: c.id })),
          ];
    let ownersDone = 0;
    for (const o of owners) {
      const ev = evidenceFor(o.type, o.id);
      const substantive = ev.filter((e) => e.kind !== "interests" && e.kind !== "members");
      const hash = await sha256(JSON.stringify(ev));
      if (!target.ownerId && runHash.get(`${o.type}:${o.id}`) === hash) continue;
      if (ownersDone >= BUDGET.owners || timeLeft() < 60_000) { report.deferred++; continue; }
      if (!substantive.length) {
        await sb.from("capability_runs").upsert({ owner_type: o.type, owner_id: o.id, evidence_hash: hash, inferred_at: new Date().toISOString() });
        continue;
      }
      ownersDone++;
      try {
        const res = await callTool(apiKey, CAP_SYSTEM,
          `Member type: ${o.type}\nEVIDENCE:\n${ev.map((e, i) => `[${i + 1}] (${e.kind}) ${e.title}`).join("\n")}`,
          "report_capabilities", {
            type: "object",
            properties: {
              capabilities: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    label: { type: "string" },
                    category: { type: "string", enum: CAP_CATEGORIES },
                    description: { type: "string" },
                    evidence: { type: "array", items: { type: "integer" } },
                    confidence: { type: "number" },
                  },
                  required: ["label", "category", "evidence", "confidence"],
                },
              },
            },
            required: ["capabilities"],
          });
        const found: any[] = (res.capabilities ?? []).filter((c: any) => c?.label && CAP_CATEGORIES.includes(c.category)).slice(0, 8);
        const { data: existing } = await sb.from("capabilities").select("id, label, status, source").eq("owner_type", o.type).eq("owner_id", o.id);
        const byLabel = new Map<any, any>((existing ?? []).map((c: any) => [String(c.label).toLowerCase(), c]));
        const keep = new Set<string>();
        for (const c of found) {
          const label = clip(c.label, 80);
          const key = label.toLowerCase();
          keep.add(key);
          const evidence = (c.evidence ?? []).map((n: number) => ev[n - 1]).filter(Boolean).slice(0, 6)
            .map((e: Ev) => ({ kind: e.kind, title: clip(e.title, 200), url: e.url ?? null }));
          const fields = {
            category: c.category, description: clip(c.description ?? "", 400) || null, evidence,
            confidence: Math.max(0, Math.min(1, Number(c.confidence) || 0.5)),
          };
          // Adossée à un service que le titulaire a lui-même publié : déjà rendue publique par lui, donc confirmée.
          const backedByService = evidence.some((e: any) => e.kind === "service");
          const prev = byLabel.get(key);
          if (!prev) {
            const { error } = await sb.from("capabilities").insert({ owner_type: o.type, owner_id: o.id, label, ...fields, ...(backedByService ? { status: "confirmed" } : {}) });
            if (!error) report.capabilities_written++;
          } else if (prev.status === "inferred") {
            await sb.from("capabilities").update({ ...fields, ...(backedByService ? { status: "confirmed" } : {}) }).eq("id", prev.id);
            report.capabilities_written++;
          } else {
            // confirmée ou écartée par son titulaire : on ne met à jour que les preuves
            await sb.from("capabilities").update({ evidence }).eq("id", prev.id);
          }
        }
        const stale = (existing ?? []).filter((c: any) => c.status === "inferred" && c.source === "inferred" && !keep.has(String(c.label).toLowerCase())).map((c: any) => c.id);
        if (stale.length) await sb.from("capabilities").delete().in("id", stale);
        await sb.from("capability_runs").upsert({ owner_type: o.type, owner_id: o.id, evidence_hash: hash, inferred_at: new Date().toISOString() });
        report.owners_inferred++;
      } catch (e) {
        fail(`capacités ${o.type}:${o.id}`, e);
        if ((e as any)?.status === 429 || (e as any)?.status === 402) break;
      }
    }

    // Vecteurs des capacités nouvelles ou modifiées.
    try {
      const caps = await fetchAll((a, b) => sb.from("capabilities").select("id, label, description, category, embedded_hash").neq("status", "dismissed").range(a, b));
      const todo: { id: string; text: string; hash: string }[] = [];
      for (const c of caps) {
        const text = `${c.label}. ${c.description ?? ""} (${c.category})`;
        const hash = await sha256(text);
        if (c.embedded_hash !== hash) todo.push({ id: c.id, text, hash });
      }
      for (let i = 0; i < todo.length && embedBudget > 0 && timeLeft() > 40_000; i += 48) {
        const batch = todo.slice(i, i + Math.min(48, embedBudget));
        const vectors = await embed(apiKey, batch.map((t) => t.text));
        for (let k = 0; k < batch.length; k++) {
          await sb.from("capabilities").update({ embedding: `[${vectors[k].join(",")}]`, embedded_hash: batch[k].hash }).eq("id", batch[k].id);
        }
        embedBudget -= batch.length;
        report.embedded += batch.length;
      }
    } catch (e) { fail("vecteurs des capacités", e); }

    // ── 2. besoins des quêtes ───────────────────────────────────────────────────────────────────
    const liveQuests = quests.filter((q: any) => !q.is_draft && OPEN_QUEST.has(String(q.status ?? "").toUpperCase()));
    const needsByQuest = groupBy(questNeeds, (n: any) => n.quest_id);
    const tasksByQuest = groupBy(subtasks, (t: any) => t.quest_id);
    const questTargets = target.questId
      ? liveQuests.filter((q: any) => q.id === target.questId)
      : mode === "all" ? liveQuests : [];
    let questsDone = 0;
    for (const q of questTargets) {
      const existingNeeds = needsByQuest.get(q.id) ?? [];
      const tasks = tasksByQuest.get(q.id) ?? [];
      const terrNames = questTerr.filter((t: any) => t.quest_id === q.id).map((t: any) => terrById.get(t.territory_id)?.name).filter(Boolean);
      const themeNames = questTopics.filter((t: any) => t.quest_id === q.id).map((t: any) => topicName.get(t.topic_id)).filter(Boolean);
      const doneTasks = tasks.filter((t: any) => DONE_TASK.has(String(t.status ?? "").toUpperCase())).length;
      const stage = doneTasks === 0 ? "idea / launch" : doneTasks < tasks.length ? "under way" : "mature";
      const sourceText = JSON.stringify([q.title, q.description, tasks.map((t: any) => [t.title, t.status]), existingNeeds.map((n: any) => [n.title, n.status]), terrNames, themeNames]);
      const hash = await sha256(sourceText);
      if (!target.questId && runHash.get(`quest:${q.id}`) === hash) continue;
      if (questsDone >= BUDGET.quests || timeLeft() < 45_000) { report.deferred++; continue; }
      if (clip(q.description, 2000).length < 40 && !tasks.length) {
        await sb.from("capability_runs").upsert({ owner_type: "quest", owner_id: q.id, evidence_hash: hash, inferred_at: new Date().toISOString() });
        continue;
      }
      questsDone++;
      try {
        // Besoins de projets comparables (même sens dans l'index de recherche).
        let comparable: string[] = [];
        const { data: idx } = await sb.from("search_index").select("embedding").eq("entity_type", "quest").eq("entity_id", q.id).maybeSingle();
        if (idx?.embedding) {
          const { data: similar } = await sb.rpc("match_search_index", { p_query_embedding: idx.embedding, p_match_count: 6, p_types: ["quest"], p_allowed_keys: [], p_authenticated: true });
          comparable = (similar ?? []).filter((s: any) => s.entity_id !== q.id && s.similarity > 0.45)
            .flatMap((s: any) => (needsByQuest.get(s.entity_id) ?? []).map((n: any) => `${n.title} (in "${s.title}")`)).slice(0, 15);
        }
        const res = await callTool(apiKey, NEED_SYSTEM, [
          `PROJECT: ${q.title}`,
          `DESCRIPTION: ${clip(q.description, 2500) || "(none)"}`,
          `STAGE: ${stage} — ${tasks.length} tasks, ${doneTasks} done`,
          tasks.length ? `TASKS: ${tasks.slice(0, 25).map((t: any) => `${t.title} [${t.status}]`).join("; ")}` : "",
          terrNames.length ? `PLACE: ${terrNames.join(", ")}` : "",
          themeNames.length ? `THEMES: ${themeNames.join(", ")}` : "",
          existingNeeds.length ? `EXISTING NEEDS (do not repeat): ${existingNeeds.map((n: any) => n.title).join("; ")}` : "",
          comparable.length ? `NEEDS OF COMPARABLE PROJECTS: ${comparable.join("; ")}` : "",
        ].filter(Boolean).join("\n"), "report_needs", {
          type: "object",
          properties: {
            needs: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  label: { type: "string" },
                  category: { type: "string", enum: NEED_CATEGORIES },
                  kind: { type: "string", enum: ["explicit", "implied"] },
                  reason: { type: "string" },
                  priority: { type: "integer", enum: [1, 2, 3] },
                },
                required: ["label", "category", "kind", "reason", "priority"],
              },
            },
          },
          required: ["needs"],
        });
        const existingTitles = new Set(existingNeeds.map((n: any) => String(n.title).toLowerCase().trim()));
        const found: any[] = (res.needs ?? []).filter((n: any) => n?.label && NEED_CATEGORIES.includes(n.category) && !existingTitles.has(String(n.label).toLowerCase().trim())).slice(0, 10);
        const { data: prevRows } = await sb.from("need_suggestions").select("id, label, status").eq("quest_id", q.id);
        const prevByLabel = new Map<any, any>((prevRows ?? []).map((r: any) => [String(r.label).toLowerCase(), r]));
        const keep = new Set<string>();
        for (const n of found) {
          const label = clip(n.label, 90);
          keep.add(label.toLowerCase());
          const fields = { category: n.category, kind: n.kind === "explicit" ? "explicit" : "implied", reason: clip(n.reason, 300), priority: [1, 2, 3].includes(n.priority) ? n.priority : 2, updated_at: new Date().toISOString() };
          const prev = prevByLabel.get(label.toLowerCase());
          if (!prev) { await sb.from("need_suggestions").insert({ quest_id: q.id, label, ...fields }); report.needs_suggested++; }
          else if (prev.status === "suggested") await sb.from("need_suggestions").update(fields).eq("id", prev.id);
        }
        const stale = (prevRows ?? []).filter((r: any) => r.status === "suggested" && !keep.has(String(r.label).toLowerCase())).map((r: any) => r.id);
        if (stale.length) await sb.from("need_suggestions").delete().in("id", stale);
        await sb.from("capability_runs").upsert({ owner_type: "quest", owner_id: q.id, evidence_hash: hash, inferred_at: new Date().toISOString() });
        report.quests_analysed++;
      } catch (e) {
        fail(`besoins de « ${q.title} »`, e);
        if ((e as any)?.status === 429 || (e as any)?.status === 402) break;
      }
    }

    // ── 3. besoins actifs → table de travail, avec vecteurs ────────────────────────────────────
    const liveIds = new Set(liveQuests.map((q: any) => q.id));
    const suggestions = await fetchAll((a, b) => sb.from("need_suggestions").select("id, quest_id, label, category, kind, reason, status").eq("status", "suggested").range(a, b));
    type Need = { source: string; source_id: string; quest_id: string; label: string; category: string; kind: string; text: string };
    const wanted: Need[] = [
      ...questNeeds.filter((n: any) => liveIds.has(n.quest_id) && OPEN_NEED.has(String(n.status ?? "OPEN").toUpperCase()))
        .map((n: any) => ({ source: "quest_need", source_id: n.id, quest_id: n.quest_id, label: clip(n.title, 120), category: NEED_CATEGORIES.includes(String(n.category).toUpperCase()) ? String(n.category).toUpperCase() : "GENERAL", kind: "explicit", text: `${n.title}. ${n.description ?? ""}` })),
      ...suggestions.filter((s: any) => liveIds.has(s.quest_id))
        .map((s: any) => ({ source: "suggestion", source_id: s.id, quest_id: s.quest_id, label: s.label, category: s.category, kind: s.kind, text: `${s.label}. ${s.reason ?? ""}` })),
    ];
    const known = await fetchAll((a, b) => sb.from("opportunity_needs").select("id, source, source_id, content_hash, embedding").range(a, b));
    const knownByKey = new Map<any, any>(known.map((n: any) => [`${n.source}:${n.source_id}`, n]));
    const wantedKeys = new Set(wanted.map((n) => `${n.source}:${n.source_id}`));
    const gone = known.filter((n: any) => !wantedKeys.has(`${n.source}:${n.source_id}`)).map((n: any) => n.id);
    for (let i = 0; i < gone.length; i += 200) await sb.from("opportunity_needs").delete().in("id", gone.slice(i, i + 200));
    const toEmbed: (Need & { hash: string })[] = [];
    for (const n of wanted) {
      const q = questById.get(n.quest_id);
      const text = `${n.text} (project: ${q?.title ?? ""})`;
      const hash = await sha256(JSON.stringify([text, n.category, n.kind]));
      const prev = knownByKey.get(`${n.source}:${n.source_id}`);
      if (!prev || prev.content_hash !== hash || !prev.embedding) toEmbed.push({ ...n, text, hash });
    }
    for (let i = 0; i < toEmbed.length && embedBudget > 0 && timeLeft() > 30_000; i += 48) {
      const batch = toEmbed.slice(i, i + Math.min(48, embedBudget));
      try {
        const vectors = await embed(apiKey, batch.map((n) => n.text));
        const rows = batch.map((n, k) => ({
          source: n.source, source_id: n.source_id, quest_id: n.quest_id, label: n.label, category: n.category, kind: n.kind,
          content_hash: n.hash, embedding: `[${vectors[k].join(",")}]`, matched_at: null, updated_at: new Date().toISOString(),
        }));
        const { error } = await sb.from("opportunity_needs").upsert(rows, { onConflict: "source,source_id" });
        if (error) throw new Error(error.message);
        embedBudget -= batch.length;
        report.embedded += batch.length;
      } catch (e) { fail("vecteurs des besoins", e); break; }
    }

    // ── 4. correspondances ──────────────────────────────────────────────────────────────────────
    const ancestors = groupBy(closure, (c: any) => c.descendant_id);
    const LOCAL_LEVELS = new Set(["TOWN", "DISTRICT", "PROVINCE", "REGION", "BIOREGION", "CITY", "VILLAGE"]);
    const placeSet = (ids: string[]) => {
      const s = new Set<string>();
      for (const id of ids) {
        s.add(id);
        for (const a of ancestors.get(id) ?? []) if (LOCAL_LEVELS.has(String(terrById.get(a.ancestor_id)?.level ?? "").toUpperCase())) s.add(a.ancestor_id);
      }
      return s;
    };
    const ownerPlaces = (type: string, id: string) => placeSet(
      type === "profile" ? (byUser.territories.get(id) ?? []).map((t: any) => t.territory_id)
        : type === "guild" ? guildTerr.filter((t: any) => t.guild_id === id).map((t: any) => t.territory_id) : [],
    );
    const ownerThemes = (type: string, id: string) => new Set(
      type === "profile" ? (byUser.topics.get(id) ?? []).map((t: any) => t.topic_id)
        : type === "guild" ? guildTopics.filter((t: any) => t.guild_id === id).map((t: any) => t.topic_id) : [],
    );
    const insiders = (q: any) => new Set<string>([
      `profile:${q.created_by_user_id}`,
      ...participants.filter((p: any) => p.quest_id === q.id).map((p: any) => `profile:${p.user_id}`),
      ...(q.guild_id ? [`guild:${q.guild_id}`] : []),
    ]);

    const needs = await fetchAll((a, b) => sb.from("opportunity_needs").select("id, quest_id, label, category, kind, embedding").not("embedding", "is", null).range(a, b));
    report.needs_active = needs.length;
    const existingMatches = await fetchAll((a, b) => sb.from("opportunity_matches").select("id, need_id, capability_id").range(a, b));
    const matchByPair = new Map<any, any>(existingMatches.map((m: any) => [`${m.need_id}:${m.capability_id}`, m.id]));
    const withFeedback = new Set((await fetchAll((a, b) => sb.from("opportunity_feedback").select("match_id").range(a, b))).map((f: any) => f.match_id));

    type Pair = { need: any; cap: any; score: number; similarity: number };
    const newPairs: Pair[] = [];
    const keptPairs = new Set<string>();
    let matchingComplete = true;
    for (const need of needs) {
      if (timeLeft() < 20_000) { matchingComplete = false; break; }
      const q = questById.get(need.quest_id);
      if (!q) continue;
      const { data: cands, error } = await sb.rpc("match_capabilities", { p_embedding: need.embedding, p_count: 15 });
      if (error) { fail("recherche de capacités", error); matchingComplete = false; break; }
      const inside = insiders(q);
      const qPlaces = placeSet(questTerr.filter((t: any) => t.quest_id === q.id).map((t: any) => t.territory_id));
      const qThemes = new Set(questTopics.filter((t: any) => t.quest_id === q.id).map((t: any) => t.topic_id));
      const scored: Pair[] = [];
      for (const c of cands ?? []) {
        if (c.similarity < SIM_MIN || inside.has(`${c.owner_type}:${c.owner_id}`)) continue;
        const places = ownerPlaces(c.owner_type, c.owner_id);
        const samePlace = [...qPlaces].some((p) => places.has(p)) ? 1 : 0;
        const themes = ownerThemes(c.owner_type, c.owner_id);
        const sameTheme = [...qThemes].some((t) => themes.has(t)) ? 1 : 0;
        const kindFit = need.category === "GENERAL" || need.category === c.category ? 1 : 0.5;
        const trustBoost = c.status === "confirmed" ? 1 : Number(c.confidence ?? 0.5);
        const score = 0.55 * c.similarity + 0.15 * samePlace + 0.08 * sameTheme + 0.1 * kindFit + 0.12 * trustBoost;
        if (score >= SCORE_MIN) scored.push({ need, cap: c, score: Math.round(score * 1000) / 1000, similarity: Math.round(c.similarity * 1000) / 1000 });
      }
      scored.sort((a, b) => b.score - a.score);
      for (const p of scored.slice(0, PER_NEED)) {
        const key = `${p.need.id}:${p.cap.id}`;
        keptPairs.add(key);
        const id = matchByPair.get(key);
        if (id) {
          await sb.from("opportunity_matches").update({ score: p.score, similarity: p.similarity, updated_at: new Date().toISOString() }).eq("id", id);
          report.matches_updated++;
        } else newPairs.push(p);
      }
      await sb.from("opportunity_needs").update({ matched_at: new Date().toISOString() }).eq("id", need.id);
    }

    // Nouvelles paires : validation et explication par le modèle, par lots.
    const toCheck = newPairs.sort((a, b) => b.score - a.score).slice(0, BUDGET.pairs);
    report.deferred += newPairs.length - toCheck.length;
    if (newPairs.length > toCheck.length) matchingComplete = false;
    for (let i = 0; i < toCheck.length && timeLeft() > 15_000; i += 15) {
      const batch = toCheck.slice(i, i + 15);
      try {
        const res = await callTool(apiKey, PAIR_SYSTEM, batch.map((p, k) => {
          const q = questById.get(p.need.quest_id);
          const owner = p.cap.owner_type === "profile" ? profiles.find((x: any) => x.user_id === p.cap.owner_id)?.name
            : p.cap.owner_type === "guild" ? guildById.get(p.cap.owner_id)?.name : companies.find((x: any) => x.id === p.cap.owner_id)?.name;
          const ev = (p.cap.evidence ?? []).slice(0, 3).map((e: any) => e.title).join(" | ");
          return `#${k + 1}\nNEED (${p.need.kind}, ${p.need.category}) of the project "${q?.title}": ${p.need.label}\nMEMBER ${owner ?? "?"} (${p.cap.owner_type}) can offer: ${p.cap.label} — ${p.cap.description ?? ""}\nEVIDENCE: ${ev || "self-declared"}`;
        }).join("\n\n"), "review_matches", {
          type: "object",
          properties: {
            matches: {
              type: "array",
              items: {
                type: "object",
                properties: { n: { type: "integer" }, keep: { type: "boolean" }, reason_fr: { type: "string" }, reason_en: { type: "string" } },
                required: ["n", "keep"],
              },
            },
          },
          required: ["matches"],
        });
        const verdicts = new Map<any, any>((res.matches ?? []).map((m: any) => [Number(m.n), m]));
        for (let k = 0; k < batch.length; k++) {
          const p = batch[k];
          const v: any = verdicts.get(k + 1);
          if (!v?.keep) { report.pairs_rejected++; keptPairs.delete(`${p.need.id}:${p.cap.id}`); continue; }
          const { error } = await sb.from("opportunity_matches").insert({
            need_id: p.need.id, capability_id: p.cap.id, quest_id: p.need.quest_id, score: p.score, similarity: p.similarity,
            reason_fr: clip(v.reason_fr, 300) || null, reason_en: clip(v.reason_en, 300) || null,
          });
          if (!error) report.matches_new++;
        }
      } catch (e) {
        fail("validation des correspondances", e);
        matchingComplete = false;
        if ((e as any)?.status === 429 || (e as any)?.status === 402) break;
      }
    }

    // Correspondances qui ne tiennent plus (sauf si quelqu'un y a déjà réagi). Seulement après un passage complet.
    if (matchingComplete && timeLeft() > 5_000) {
      const stale = existingMatches.filter((m: any) => !keptPairs.has(`${m.need_id}:${m.capability_id}`) && !withFeedback.has(m.id)).map((m: any) => m.id);
      for (let i = 0; i < stale.length; i += 200) await sb.from("opportunity_matches").delete().in("id", stale.slice(i, i + 200));
      report.matches_removed = stale.length;
    }
  } catch (e) {
    fail("moteur", e);
  }

  report.ms = Date.now() - startedAt;
  return json(report);
});
