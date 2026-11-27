// @ts-nocheck
// Charge et purge le jeu de démonstration FEVE. Réservé aux administrateurs.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { z } from "npm:zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const SEED = "feve-2026-12";
const TAGS = ["demo-feve"];
const BodySchema = z.object({ action: z.enum(["seed", "purge", "reset"]) });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

const slug = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70);
const idCache = new Map<string, string>();
async function did(key: string): Promise<string> {
  if (idCache.has(key)) return idCache.get(key)!;
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${SEED}:${key}`))).slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  const value = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  idCache.set(key, value);
  return value;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée" }, 405);
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const anon = createClient(url, Deno.env.get("SUPABASE_ANON_KEY") ?? "", { auth: { persistSession: false } });
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });
  try {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Authentification requise" }, 401);
    const { data: userData, error: authError } = await anon.auth.getUser(token);
    if (authError || !userData.user) return json({ error: "Authentification requise" }, 401);
    const [{ data: isAdmin }, { data: isSuperAdmin }] = await Promise.all([
      admin.rpc("has_role", { _user_id: userData.user.id, _role: "admin" }),
      admin.rpc("has_role", { _user_id: userData.user.id, _role: "superadmin" }),
    ]);
    if (isAdmin !== true && isSuperAdmin !== true) return json({ error: "Réservé aux administrateurs" }, 403);
    const parsed = BodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
    const password = Deno.env.get("DEMO_FEVE_PASSWORD");
    if (!password && parsed.data.action !== "purge") return json({ error: "DEMO_FEVE_PASSWORD absent" }, 500);

    async function row(table: string, key: string, values: Record<string, unknown>, conflict = "id") {
      const rowId = await did(key);
      const payload = conflict === "user_id" ? { user_id: rowId, ...values } : { id: rowId, ...values };
      if (table === "feed_posts") {
        const { error } = await admin.rpc("demo_feve_upsert_post", {
          p_id: rowId, p_author_user_id: values.author_user_id, p_context_type: values.context_type,
          p_context_id: values.context_id, p_content: values.content, p_visibility: values.visibility,
          p_posted_as_label: values.posted_as_label,
        });
        if (error) throw new Error(`${table}/${key}: ${error.message}`);
      } else if (table === "company_members" || table === "guild_members") {
        const { error } = await admin.rpc("demo_feve_upsert_membership", {
          p_table: table, p_id: rowId,
          p_owner_id: table === "company_members" ? values.company_id : values.guild_id,
          p_user_id: values.user_id, p_role: values.role,
        });
        if (error) throw new Error(`${table}/${key}: ${error.message}`);
      } else if (table === "services" || table === "guild_events") {
        const { error } = await admin.rpc("demo_feve_upsert_owned_row", {
          p_table: table, p_values: payload,
          p_actor_user_id: table === "services" ? values.provider_user_id : values.created_by_user_id,
        });
        if (error) throw new Error(`${table}/${key}: ${error.message}`);
      } else {
        const { error } = await admin.from(table).upsert(payload, { onConflict: conflict });
        if (error) throw new Error(`${table}/${key}: ${error.message}`);
      }
      const { error: registryError } = await admin.from("demo_seed_registry").upsert({
        table_name: table, row_id: rowId, seed_key: SEED,
      }, { onConflict: "seed_key,table_name,row_id" });
      if (registryError) throw new Error(`registre/${key}: ${registryError.message}`);
      return rowId;
    }

    async function ensureTerritory(name: string, lat: number, lng: number, summary: string, parentId: string | null = null) {
      const { data: existing, error } = await admin.from("territories").select("id,parent_id")
        .eq("name", name).eq("is_deleted", false).limit(1).maybeSingle();
      if (error) throw new Error(`territoire/${name}: ${error.message}`);
      if (existing) return existing.id as string;
      return row("territories", `territory:${slug(name)}`, {
        name, level: "LOCALITY", parent_id: parentId, slug: `${slug(name)}-demo-feve`, summary,
        latitude: lat, longitude: lng, public_visibility: "private", web_tags: TAGS,
        precision_level: "PERIMETER_MATCH", granularity: "CUSTOM_PERIMETER",
      });
    }

    async function ensureAuth(key: string, name: string) {
      const userId = await did(`auth:${key}`);
      const email = `demo+${slug(key)}@changethegame.xyz`;
      const { data: existing } = await admin.auth.admin.getUserById(userId);
      if (existing?.user) {
        const { error } = await admin.auth.admin.updateUserById(userId, {
          email, password, email_confirm: true, user_metadata: { name, demo_feve: true },
        });
        if (error) throw new Error(`auth/${key}: ${error.message}`);
      } else {
        const { error } = await admin.auth.admin.createUser({
          id: userId, email, password, email_confirm: true, user_metadata: { name, demo_feve: true },
        });
        if (error) throw new Error(`auth/${key}: ${error.message}`);
      }
      return { userId, email };
    }

    async function profile(key: string, name: string, values: Record<string, unknown> = {}) {
      const { userId, email } = await ensureAuth(key, name);
      await row("profiles", `auth:${key}`, {
        name, email, has_completed_onboarding: true, preferred_language: "fr",
        persona_type: "IMPACT", public_visibility: "private", web_tags: TAGS,
        milestone_popups_enabled: false, onboarding_skipped: true, ...values,
      }, "user_id");
      return { userId, email };
    }

    async function purge() {
      const { data: entries, error } = await admin.from("demo_seed_registry").select("table_name,row_id").eq("seed_key", SEED);
      if (error) throw error;
      const rows = entries ?? [];
      const idsFor = (table: string) => rows.filter((r) => r.table_name === table).map((r) => r.row_id);
      const matchIds = idsFor("opportunity_matches");
      const serviceIds = idsFor("services");
      const userIds = idsFor("profiles");
      for (const table of ["opportunity_requests", "opportunity_feedback", "opportunity_outcomes"]) {
        if (matchIds.length) {
          const { error: cleanupError } = await admin.from(table).delete().in("match_id", matchIds);
          if (cleanupError) throw new Error(`nettoyage/${table}: ${cleanupError.message}`);
        }
      }
      if (serviceIds.length) {
        const { error: bookingError } = await admin.from("bookings").delete().in("service_id", serviceIds);
        if (bookingError) throw new Error(`nettoyage/bookings: ${bookingError.message}`);
      }
      const order = ["opportunity_matches", "opportunity_needs", "capabilities", "natural_system_indicators", "natural_system_links",
        "feed_posts", "guild_events", "service_territories", "quest_territories", "company_territories", "guild_territories", "user_territories",
        "quest_hosts", "services", "quest_needs", "quest_participants", "company_members", "guild_members", "quests", "services", "natural_systems",
        "companies", "guilds", "territories", "profiles"];
      for (const table of [...new Set(order)]) {
        for (const rowId of idsFor(table)) {
          const keyColumn = table === "profiles" ? "user_id" : "id";
          const { error: deleteError } = await admin.from(table).delete().eq(keyColumn, rowId);
          if (deleteError) throw new Error(`purge/${table}/${rowId}: ${deleteError.message}`);
        }
      }
      for (const userId of userIds) {
        const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
        if (deleteError && !deleteError.message.toLowerCase().includes("not found")) throw new Error(`purge/auth/${userId}: ${deleteError.message}`);
      }
      const { error: registryError } = await admin.from("demo_seed_registry").delete().eq("seed_key", SEED);
      if (registryError) throw registryError;
      return { purged: rows.length, registry_remaining: 0 };
    }

    async function seed() {
      const accountEmails: Record<string, string> = {};
      const maurice = await profile("maurice", "Maurice B. — éleveur en installation", {
        location: "Bresse (Ain)",
        headline: "Je lance un atelier de 600 poules pondeuses plein air en Bresse",
        bio: "Ancien technicien agricole, 2 ha en location. Je cherche des débouchés locaux pour mes œufs, un bâtiment mobile d’occasion, un financement solidaire et des coups de main pour les clôtures.",
      });
      accountEmails.maurice = maurice.email;

      const { data: parents } = await admin.from("territories").select("id,name")
        .in("name", ["Ain", "Saône-et-Loire"]).eq("is_deleted", false).limit(2);
      const parentId = parents?.find((t) => t.name === "Ain")?.id ?? parents?.[0]?.id ?? null;
      const territoryDefs = [
        ["Bresse (démo)", 46.45, 5.20, "Bocage d’élevage entre Saône et Revermont, volailles AOP, mares et prairies humides.", parentId],
        ["Saône-et-Loire", 46.65, 4.65, "Territoire des cas anonymisés La Grange.", null],
        ["Hautes-Pyrénées", 43.05, 0.15, "Territoire des cas anonymisés La Grange.", null],
        ["Ariège", 42.95, 1.50, "Territoire des cas anonymisés La Grange.", null],
        ["Vaucluse", 44.00, 5.15, "Territoire des cas anonymisés La Grange.", null],
        ["Côte-d'Or (Dijon)", 47.32, 5.04, "Territoire des cas anonymisés La Grange.", null],
        ["Bourgogne-Franche-Comté", 47.20, 5.00, "Réseau fictif de lieux nourriciers.", null],
        ["Wallonie", 50.50, 4.70, "Réseau fictif de lieux nourriciers.", null],
      ] as const;
      const territories: Record<string, string> = {};
      for (const [name, lat, lng, summary, parent] of territoryDefs) territories[name] = await ensureTerritory(name, lat, lng, summary, parent);
      const bresse = territories["Bresse (démo)"];
      await row("user_territories", "user-territory:maurice", { user_id: maurice.userId, territory_id: bresse, attachment_type: "RESIDENCE", is_primary: true });

      const naturalSystemId = await row("natural_systems", "natural-system:seille", {
        name: "La Seille et ses prairies humides (démo)", type: "river", system_type: "river_watershed",
        kingdom: "multi_species_guild", territory_id: bresse, created_by_user_id: maurice.userId,
        description: "Rivière bocagère et prairies humides au cœur de la Bresse.",
        location_text: "Bresse", health_index: 68, resilience_index: 61, regenerative_potential: 82,
        stress_signals: [{ signal: "sécheresses estivales", severity: "modéré" }], tags: TAGS,
      });
      await row("natural_system_links", "natural-link:seille-bresse", { natural_system_id: naturalSystemId, linked_type: "territory", linked_id: bresse, linked_via: "demo-feve" }, "natural_system_id,linked_type,linked_id");
      await row("natural_system_indicators", "indicator:water", { natural_system_id: naturalSystemId, indicator: "qualité de l’eau", value: 78 });
      await row("natural_system_indicators", "indicator:hedges", { natural_system_id: naturalSystemId, indicator: "linéaire de haies", value: 120 });

      async function quest(key: string, ownerId: string, title: string, description: string, territoryId: string, nature = "PROJECT") {
        const questId = await row("quests", `quest:${key}`, {
          title, description, created_by_user_id: ownerId, owner_type: "USER", owner_id: ownerId,
          quest_nature: nature, status: "OPEN", monetization_type: "FREE", is_draft: false, is_deleted: false,
          universe_visibility: "both", public_visibility: "private", web_tags: TAGS, ocu_enabled: false,
        });
        await row("quest_territories", `quest-territory:${key}`, { quest_id: questId, territory_id: territoryId, relation_type: "primary", is_primary: true, is_hidden: false });
        await row("quest_participants", `quest-participant:${key}`, { quest_id: questId, user_id: ownerId, role: "ADMIN", status: "APPROVED" });
        return questId;
      }
      async function need(key: string, questId: string, ownerId: string, label: string, category: string, description = label) {
        const needId = await row("quest_needs", `need:${key}`, { quest_id: questId, title: label, description, category, status: "open", created_by_user_id: ownerId });
        const opportunityNeedId = await row("opportunity_needs", `opportunity-need:${key}`, {
          source: "quest_need", source_id: needId, quest_id: questId, label, category, kind: "explicit", content_hash: await did(`hash:${key}`),
        });
        return { needId, opportunityNeedId };
      }
      async function capability(key: string, ownerType: string, ownerId: string, label: string, serviceId: string | null = null, description = label) {
        return row("capabilities", `capability:${key}`, {
          owner_type: ownerType, owner_id: ownerId, label, description, category: "SKILLS", status: "confirmed", source: "manual", confidence: 0.95,
          evidence: serviceId ? [{ kind: "service", url: `/services/${serviceId}` }] : [],
        });
      }
      async function match(key: string, opportunityNeedId: string, capabilityId: string, questId: string, score: number, reason: string) {
        return row("opportunity_matches", `match:${key}`, {
          need_id: opportunityNeedId, capability_id: capabilityId, quest_id: questId, score, similarity: score, reason_fr: reason, reason_en: reason,
        });
      }
      async function post(key: string, authorId: string, contextType: string, contextId: string, content: string) {
        return row("feed_posts", `post:${key}`, {
          author_user_id: authorId, context_type: contextType, context_id: contextId, content,
          visibility: "PRIVATE", is_deleted: false, posted_as_label: "Démo FEVE",
        });
      }

      const mauriceQuest = await quest("maurice", maurice.userId, "Installer un atelier de poules pondeuses en Bresse",
        "Installation d’un atelier plein air de 600 poules sur 2 ha, avec vente locale et chantiers participatifs.", bresse);
      const mauriceCaps: Record<string, string> = {};
      for (const [key, label] of [["elevage", "Élevage avicole plein air"], ["mecanique", "Mécanique agricole"], ["vente", "Vente directe sur les marchés"]]) {
        mauriceCaps[key] = await capability(`maurice-${key}`, "profile", maurice.userId, label);
      }
      const mauriceNeeds: Record<string, { needId: string; opportunityNeedId: string }> = {};
      mauriceNeeds.debouches = await need("maurice-debouches", mauriceQuest, maurice.userId, "Débouchés : 300 œufs/semaine à écouler localement", "debouches");
      mauriceNeeds.batiment = await need("maurice-batiment", mauriceQuest, maurice.userId, "Bâtiment mobile pour 300 poules, occasion", "materiel");
      mauriceNeeds.financement = await need("maurice-financement", mauriceQuest, maurice.userId, "Financement : 18 000 €", "financement", "Prêt solidaire ou investissement citoyen");
      mauriceNeeds.clotures = await need("maurice-clotures", mauriceQuest, maurice.userId, "Chantier participatif clôtures, 2 week-ends", "main-d-oeuvre");
      mauriceNeeds.sanitaire = await need("maurice-sanitaire", mauriceQuest, maurice.userId, "Conseil sanitaire / vétérinaire volailles", "expertise");
      await post("maurice-installation", maurice.userId, "USER", maurice.userId, "Je m’installe en Bresse avec 600 poules pondeuses plein air. Les 2 ha sont sécurisés; je prépare maintenant le bâtiment et les clôtures.");
      await post("maurice-debouches", maurice.userId, "USER", maurice.userId, "Je cherche des débouchés pour environ 300 œufs par semaine, en magasin de producteurs, AMAP ou cantine locale.");
      await post("maurice-prairie", maurice.userId, "USER", maurice.userId, "Photo de prairie : les haies et la mare offrent déjà un bon abri. Prochaine étape, un poulailler mobile d’occasion.");

      const entities = [
        { key: "bresse-paniers", name: "Bresse en Paniers", kind: "company", type: "coopérative de producteurs", contact: "Contact — Bresse en Paniers", service: "Collecte et vente d’œufs en magasin de producteurs", description: "Collecte et vente d’œufs dans 2 points de vente de producteurs.", price: 0, cap: "Collecte et vente d’œufs plein air", need: "debouches", score: 0.92, reason: "Bresse en Paniers écoule déjà les œufs de 6 fermes à moins de 15 km et cherche un fournisseur plein air." },
        { key: "amap-seille", name: "AMAP Les Jardins de la Seille", kind: "guild", type: "association", contact: "Contact — AMAP Les Jardins de la Seille", service: "Contrat œufs hebdomadaire, 40 familles", description: "Contrat hebdomadaire d’œufs pour 40 familles, réservable à la saison.", price: 12, cap: "Contrat œufs hebdomadaire AMAP", need: "debouches", score: 0.88, reason: "Les 40 familles de l’AMAP veulent ajouter un contrat œufs hebdomadaire local." },
        { key: "cantine-montrevel", name: "Restaurant scolaire de Montrevel (démo)", kind: "company", type: "collectivité", contact: "Contact — Restaurant scolaire", service: "Appel à fournisseurs locaux, œufs bio", description: "Appel à fournisseurs locaux pour les menus de la cantine.", price: 0, cap: "Achat local d’œufs pour restauration collective", need: "debouches", score: 0.79, reason: "La cantine cherche des œufs locaux et peut réserver un volume hebdomadaire régulier." },
        { key: "atelier-mobile", name: "Atelier Mobile Volailles", kind: "company", type: "entreprise", contact: "Contact — Atelier Mobile Volailles", service: "Location et vente de poulaillers mobiles d’occasion", description: "Bâtiments mobiles révisés pour 300 poules, location ou achat.", price: 2800, cap: "Poulaillers mobiles d’occasion", need: "batiment", score: 0.90, reason: "Un bâtiment mobile révisé pour 300 poules est disponible à 42 km." },
        { key: "terres-partagees", name: "Terres Partagées (exemple)", kind: "company", type: "foncière solidaire fictive", contact: "Contact — Terres Partagées", service: "Accompagnement à l’installation et investissement citoyen", description: "Accompagnement au montage financier et à la recherche de financement solidaire.", price: 0, cap: "Financement solidaire de l’installation", need: "financement", score: 0.89, reason: "Le dispositif accompagne les installations avec investissement citoyen et prêt solidaire." },
        { key: "reseau-bras", name: "Le Réseau des Bras", kind: "guild", type: "collectif d’entraide", contact: "Contact — Le Réseau des Bras", service: "Chantiers participatifs le week-end", description: "Organisation gratuite de chantiers participatifs sur deux week-ends.", price: 0, cap: "Chantiers participatifs de clôtures", need: "clotures", score: 0.85, reason: "Le collectif organise des chantiers clôtures le week-end avec outillage partagé." },
        { key: "dr-lefort", name: "Dr Lefort, vétérinaire rurale (démo)", kind: "profile", type: "indépendante", contact: "Dr Lefort — vétérinaire fictive", service: "Visite conseil biosécurité volailles", description: "Visite de conseil en biosécurité et suivi sanitaire des volailles.", price: 90, cap: "Conseil sanitaire et biosécurité volailles", need: "sanitaire", score: 0.82, reason: "La vétérinaire rurale intervient en Bresse pour la biosécurité des petits ateliers plein air." },
      ];
      const entityRefs: Record<string, any> = {};
      for (const e of entities) {
        const contact = await profile(e.key, e.contact, { location: "Bresse", headline: e.type, bio: `Contact fictif pour ${e.name}.` });
        accountEmails[e.key] = contact.email;
        let ownerId = contact.userId;
        let ownerType = "profile";
        let contextType = "USER";
        if (e.kind === "company") {
          ownerId = await row("companies", `company:${e.key}`, {
            name: e.name, description: `${e.description} Structure fictive de démonstration.`, org_type: e.type,
            contact_user_id: contact.userId, is_deleted: false, universe_visibility: "both", public_visibility: "private", web_tags: TAGS,
          });
          ownerType = "company"; contextType = "COMPANY";
          await row("company_members", `company-member:${e.key}`, { company_id: ownerId, user_id: contact.userId, role: "ADMIN" });
          await row("company_territories", `company-territory:${e.key}`, { company_id: ownerId, territory_id: bresse, relation_type: "primary", is_primary: true });
        } else if (e.kind === "guild") {
          ownerId = await row("guilds", `guild:${e.key}`, {
            name: e.name, description: `${e.description} Structure fictive de démonstration.`, type: "COLLECTIVE",
            created_by_user_id: contact.userId, is_approved: true, is_draft: false, is_deleted: false, join_policy: "INVITE_ONLY",
            universe_visibility: "both", public_visibility: "private", web_tags: TAGS,
          });
          ownerType = "guild"; contextType = "GUILD";
          await row("guild_members", `guild-member:${e.key}`, { guild_id: ownerId, user_id: contact.userId, role: "ADMIN" });
          await row("guild_territories", `guild-territory:${e.key}`, { guild_id: ownerId, territory_id: bresse, relation_type: "primary", is_primary: true });
        }
        const serviceId = await row("services", `service:${e.key}`, {
          title: e.service, description: e.description, provider_user_id: contact.userId,
          provider_guild_id: e.kind === "guild" ? ownerId : null, owner_type: ownerType === "profile" ? "USER" : ownerType.toUpperCase(), owner_id: ownerId,
          duration_minutes: 60, price_currency: "EUR", price_amount: e.price, is_active: true, is_draft: false, is_deleted: false,
          universe_visibility: "both", public_visibility: "private", web_tags: TAGS, service_type: "OFFER", location_type: "ON_SITE", location_text: "Bresse",
        });
        await row("service_territories", `service-territory:${e.key}`, { service_id: serviceId, territory_id: bresse, relation_type: "primary", is_primary: true });
        const capId = await capability(e.key, ownerType, ownerId, e.cap, serviceId, e.description);
        await match(`maurice-${e.key}`, mauriceNeeds[e.need].opportunityNeedId, capId, mauriceQuest, e.score, e.reason);
        await post(`entity-${e.key}`, contact.userId, contextType, ownerId, `${e.name} : ${e.description}`);
        entityRefs[e.key] = { ownerId, ownerType, contact, serviceId, capId };
      }

      const nextSaturday = new Date();
      nextSaturday.setUTCDate(nextSaturday.getUTCDate() + ((6 - nextSaturday.getUTCDay() + 7) % 7 || 7));
      nextSaturday.setUTCHours(9, 0, 0, 0);
      const endSaturday = new Date(nextSaturday.getTime() + 5 * 3600 * 1000);
      await row("guild_events", "event:clotures", {
        guild_id: entityRefs["reseau-bras"].ownerId, title: "Chantier clôtures chez Maurice — samedi",
        description: "Chantier participatif fictif : pose des clôtures, repas partagé et outillage fourni.",
        start_at: nextSaturday.toISOString(), end_at: endSaturday.toISOString(), location_type: "PHYSICAL", location_text: "Bresse (adresse communiquée après inscription)",
        created_by_user_id: entityRefs["reseau-bras"].contact.userId, visibility: "PUBLIC", is_cancelled: false, status: "PUBLISHED",
      });

      const projects = [
        { key: "couple-dijon", title: "Un lieu pour une ferme collective autour de Dijon", description: "Un couple formé aux fermes collectives cherche un lieu autour de Dijon depuis plus de 15 mois.", territory: "Côte-d'Or (Dijon)", need: "Lieu et associés pour installer une ferme collective", cap: "Installation en ferme collective", nature: "IDEA" },
        { key: "ecovillage-30", title: "Écovillage agricole — 30 à 45 ha recherchés", description: "Un projet d’écovillage cherche 30 à 45 ha entre Allier, Saône-et-Loire et Nièvre.", territory: "Saône-et-Loire", need: "Foncier de 30 à 45 ha et porteurs de projets", cap: "Projet d’écovillage agricole", nature: "IDEA" },
        { key: "gaec-associes", title: "Trois GAEC cherchent des associés en Saône-et-Loire", description: "Trois GAEC de Saône-et-Loire souhaitent transmettre et accueillir de nouveaux associés.", territory: "Saône-et-Loire", need: "Associés pour trois GAEC", cap: "Transmission et association en GAEC", nature: "PROJECT" },
        { key: "paysans-90", title: "Paysans-boulangers cherchent un éleveur pour 90 ha", description: "Une ferme de 90 ha conduite par des paysans-boulangers cherche un éleveur.", territory: "Hautes-Pyrénées", need: "Éleveur pour une ferme de 90 ha", cap: "Paysannerie-boulangerie sur 90 ha", nature: "PROJECT" },
        { key: "foncier-groupe", title: "Acheter du foncier à plusieurs", description: "Une personne souhaite acheter du foncier à plusieurs dans le Gers, les Landes ou les Hautes-Pyrénées.", territory: "Hautes-Pyrénées", need: "Projet collectif d’achat de foncier", cap: "Achat collectif de foncier", nature: "IDEA" },
        { key: "fournil-experimente", title: "Paysan-boulanger expérimenté cherche un fournil", description: "Un paysan-boulanger expérimenté cherche un lieu avec fournil pour porter son activité.", territory: "Ariège", need: "Fournil et lieu d’installation", cap: "Paysannerie-boulangerie expérimentée", nature: "PROJECT" },
        { key: "fournil-vaucluse", title: "Un lieu cherche un paysan-boulanger en Vaucluse", description: "Un lieu disposant d’un fournil cherche un paysan-boulanger.", territory: "Vaucluse", need: "Paysan-boulanger pour le fournil", cap: "Fournil disponible en Vaucluse", nature: "PROJECT" },
        { key: "fournil-ariege", title: "Un lieu cherche un paysan-boulanger en Ariège", description: "Un lieu collectif cherche un paysan-boulanger pour animer son fournil.", territory: "Ariège", need: "Paysan-boulanger pour le fournil", cap: "Fournil disponible en Ariège", nature: "PROJECT" },
        { key: "ecovillage-ariege", title: "Écovillage ariégeois — 45 ha de prairies bio", description: "45 ha de prairies bio cherchent des porteurs de projets; appel republié un an après sans réponse.", territory: "Ariège", need: "Éleveur et paysan-boulanger sur 45 ha de prairies bio", cap: "Accueil de projets sur 45 ha bio", nature: "PROJECT" },
      ];
      const projectRefs: Record<string, any> = {};
      for (const p of projects) {
        const contact = await profile(p.key, "Porteur·se de projet (anonymisé)", { location: p.territory, headline: p.title, bio: "Cas réel anonymisé issu de La Grange; aucune donnée personnelle." });
        accountEmails[p.key] = contact.email;
        const questId = await quest(p.key, contact.userId, p.title, p.description, territories[p.territory], p.nature);
        const n = await need(p.key, questId, contact.userId, p.need, "installation");
        const capId = await capability(p.key, "profile", contact.userId, p.cap);
        await post(`project-${p.key}`, contact.userId, "USER", contact.userId, `${p.title} — ${p.need}.`);
        projectRefs[p.key] = { contact, questId, need: n, capId };
      }
      const lagrangeMatches = [
        ["couple-gaec", "couple-dijon", "gaec-associes", 0.91, "Trois GAEC proches cherchent précisément des associés formés aux fermes collectives."],
        ["couple-ecovillage", "couple-dijon", "ecovillage-30", 0.80, "Le couple et l’écovillage partagent un projet collectif et une zone de recherche compatible."],
        ["paysans-foncier", "paysans-90", "foncier-groupe", 0.89, "Le projet d’achat à plusieurs couvre les Hautes-Pyrénées et peut compléter la ferme de 90 ha."],
        ["fournil-vaucluse", "fournil-experimente", "fournil-vaucluse", 0.92, "Le fournil en Vaucluse est disponible et cherche exactement un paysan-boulanger expérimenté."],
        ["fournil-ariege", "fournil-experimente", "fournil-ariege", 0.90, "Le lieu ariégeois cherche un paysan-boulanger et dispose déjà d’un fournil."],
        ["fournil-ecovillage", "fournil-experimente", "ecovillage-ariege", 0.88, "Les 45 ha bio peuvent accueillir une activité de paysannerie-boulangerie avec fournil."],
        ["ecovillage-maurice", "ecovillage-ariege", "maurice", 0.78, "Maurice porte une compétence d’élevage plein air recherchée par l’écovillage ariégeois."],
        ["ecovillage-foncier", "ecovillage-30", "foncier-groupe", 0.77, "L’achat groupé peut élargir la recherche de foncier de l’écovillage."],
        ["paysans-ecovillage", "paysans-90", "ecovillage-ariege", 0.81, "L’écovillage cherche aussi un éleveur et offre des prairies bio adaptées au projet de 90 ha."],
      ] as const;
      for (const [key, needProject, helperProject, score, reason] of lagrangeMatches) {
        const target = projectRefs[needProject];
        const helperCap = helperProject === "maurice" ? mauriceCaps.elevage : projectRefs[helperProject].capId;
        await match(`lagrange-${key}`, target.need.opportunityNeedId, helperCap, target.questId, score, `La Grange — ${reason}`);
      }

      const places = [
        { key: "grange-bocage", name: "La Grange du Bocage (fictif)", territory: "Bourgogne-Franche-Comté", service: "Résidence d’installation agricole", target: "couple-dijon" },
        { key: "couveuse-vallee", name: "La Couveuse de la Vallée (fictif)", territory: "Bourgogne-Franche-Comté", service: "Couveuse agricole et formation à l’installation", target: "ecovillage-30" },
        { key: "atelier-wallonie", name: "L’Atelier des Cultures (fictif)", territory: "Wallonie", service: "Résidence d’installation et essai d’activité", target: "paysans-90" },
        { key: "maison-semences", name: "La Maison des Semences (fictif)", territory: "Wallonie", service: "Formation à la paysannerie-boulangerie", target: "fournil-experimente" },
      ];
      for (const [index, p] of places.entries()) {
        const contact = await profile(p.key, `Contact — ${p.name}`, { location: p.territory, headline: "Lieu hybride nourricier fictif", bio: "Lieu de formation et d’accueil du réseau fictif de démonstration." });
        accountEmails[p.key] = contact.email;
        const companyId = await row("companies", `company:${p.key}`, {
          name: p.name, description: `${p.service}. Lieu hybride nourricier fictif, sans auteur réel nommé.`,
          org_type: "lieu hybride nourricier", contact_user_id: contact.userId, is_deleted: false,
          universe_visibility: "both", public_visibility: "private", web_tags: TAGS,
        });
        await row("company_members", `company-member:${p.key}`, { company_id: companyId, user_id: contact.userId, role: "ADMIN" });
        await row("company_territories", `company-territory:${p.key}`, { company_id: companyId, territory_id: territories[p.territory], relation_type: "primary", is_primary: true });
        const serviceId = await row("services", `service:${p.key}`, {
          title: p.service, description: `${p.service} proposée par un lieu fictif du réseau.`, provider_user_id: contact.userId,
          owner_type: "COMPANY", owner_id: companyId, duration_minutes: 120, price_currency: "EUR", price_amount: 0,
          is_active: true, is_draft: false, is_deleted: false, universe_visibility: "both", public_visibility: "private", web_tags: TAGS,
          service_type: "FORMATION", location_type: "ON_SITE", location_text: p.territory,
        });
        await row("service_territories", `service-territory:${p.key}`, { service_id: serviceId, territory_id: territories[p.territory], relation_type: "primary", is_primary: true });
        const capId = await capability(p.key, "company", companyId, p.service, serviceId);
        const target = projectRefs[p.target];
        await match(`network-${p.key}`, target.need.opportunityNeedId, capId, target.questId, 0.75 + index * 0.03, `Formation / accueil — ${p.name} peut accueillir le projet avec « ${p.service} ».`);
        await post(`place-${p.key}`, contact.userId, "COMPANY", companyId, `${p.name} ouvre une offre : ${p.service}.`);
      }

      // Guilde « Ferme en Vie » : relie Maurice, les projets La Grange, citoyens et investisseurs.
      const animatrice = await profile("ferme-en-vie", "Claire — animatrice Ferme en Vie", { location: "Bresse", headline: "Animatrice du réseau Ferme en Vie", bio: "Compte fictif : anime la guilde qui relie les projets de fermes." });
      accountEmails["ferme-en-vie"] = animatrice.email;
      const fermeGuild = await row("guilds", "guild:ferme-en-vie", {
        name: "Ferme en Vie", description: "Réseau qui relie porteurs de projets agricoles, citoyens et investisseurs solidaires autour de l’installation de fermes vivantes. Structure fictive de démonstration.",
        type: "NETWORK", created_by_user_id: animatrice.userId, is_approved: true, is_draft: false, is_deleted: false, join_policy: "APPROVAL_REQUIRED",
        universe_visibility: "both", public_visibility: "private", web_tags: TAGS,
      });
      await row("guild_members", "guild-member:ferme-en-vie", { guild_id: fermeGuild, user_id: animatrice.userId, role: "ADMIN" });
      await row("guild_territories", "guild-territory:ferme-en-vie", { guild_id: fermeGuild, territory_id: bresse, relation_type: "primary", is_primary: true });
      const porteurs = [["maurice", maurice.userId], ...Object.entries(projectRefs).map(([k, r]) => [k, r.contact.userId])] as [string, string][];
      for (const [k, uid] of porteurs) await row("guild_members", `guild-member:ferme-en-vie:${k}`, { guild_id: fermeGuild, user_id: uid, role: "MEMBER" });
      const supporters = [
        { key: "citoyenne-lea", name: "Léa — citoyenne mangeuse", headline: "Citoyenne : achète local et donne des coups de main" },
        { key: "citoyen-karim", name: "Karim — citoyen bénévole", headline: "Citoyen : chantiers participatifs le week-end" },
        { key: "citoyenne-odile", name: "Odile — citoyenne retraitée", headline: "Citoyenne : accueil et transmission de savoir-faire" },
        { key: "investisseur-paul", name: "Paul — investisseur solidaire", headline: "Investisseur : épargne solidaire dans les fermes" },
        { key: "investisseuse-ines", name: "Inès — investisseuse citoyenne", headline: "Investisseuse : prise de parts dans le foncier agricole" },
      ];
      for (const s of supporters) {
        const u = await profile(s.key, s.name, { location: "Bresse", headline: s.headline, bio: `Compte fictif de démonstration — ${s.headline}.` });
        accountEmails[s.key] = u.email;
        await row("guild_members", `guild-member:ferme-en-vie:${s.key}`, { guild_id: fermeGuild, user_id: u.userId, role: "MEMBER" });
        await row("quest_participants", `quest-participant:maurice:${s.key}`, { quest_id: mauriceQuest, user_id: u.userId, role: "MEMBER", status: "APPROVED" });
      }

      // Banque coopérative fictive en soutien de chaque projet de ferme.
      const banquier = await profile("banque-cooperative", "Contact — Banque Coopérative du Bocage", { location: "Bresse", headline: "Chargé de financement solidaire", bio: "Contact fictif d’une banque coopérative de démonstration." });
      accountEmails["banque-cooperative"] = banquier.email;
      const bank = await row("companies", "company:banque-cooperative", {
        name: "Banque Coopérative du Bocage (fictif)", description: "Banque coopérative qui soutient les installations agricoles : prêts solidaires, garanties et épargne citoyenne fléchée. Structure fictive de démonstration.",
        org_type: "banque coopérative", contact_user_id: banquier.userId, is_deleted: false, universe_visibility: "both", public_visibility: "private", web_tags: TAGS,
      });
      await row("company_members", "company-member:banque-cooperative", { company_id: bank, user_id: banquier.userId, role: "ADMIN" });
      await row("company_territories", "company-territory:banque-cooperative", { company_id: bank, territory_id: bresse, relation_type: "primary", is_primary: true });
      const bankCap = await capability("banque-cooperative", "company", bank, "Prêt solidaire et garantie pour l’installation agricole");
      await match("maurice-banque-cooperative", mauriceNeeds.financement.opportunityNeedId, bankCap, mauriceQuest, 0.87, "La banque coopérative finance les installations agricoles avec prêt solidaire et épargne citoyenne fléchée.");
      await post("banque-cooperative", banquier.userId, "COMPANY", bank, "Banque Coopérative du Bocage : nous soutenons chaque projet de ferme du réseau Ferme en Vie.");
      await post("ferme-en-vie", animatrice.userId, "GUILD", fermeGuild, "Bienvenue dans Ferme en Vie : porteurs de projets, citoyens et investisseurs, réunis pour installer des fermes vivantes.");
      const farmQuests = [["maurice", mauriceQuest, maurice.userId], ...Object.entries(projectRefs).map(([k, r]) => [k, r.questId, r.contact.userId])] as [string, string, string][];
      for (const [k, questId, ownerId] of farmQuests) {
        await row("quest_hosts", `quest-host:guild:${k}`, { quest_id: questId, entity_type: "GUILD", entity_id: fermeGuild, role: "CO_HOST", created_by_user_id: ownerId });
        await row("quest_hosts", `quest-host:bank:${k}`, { quest_id: questId, entity_type: "COMPANY", entity_id: bank, role: "CO_HOST", created_by_user_id: ownerId });
      }
      const { error: guildLinkError } = await admin.from("quests").update({ guild_id: fermeGuild }).in("id", farmQuests.map((q) => q[1]));
      if (guildLinkError) throw new Error(`quests/guild: ${guildLinkError.message}`);

      const { count, error: countError } = await admin.from("demo_seed_registry").select("id", { count: "exact", head: true }).eq("seed_key", SEED);
      if (countError) throw countError;
      return { seeded: true, registry_count: count ?? 0, maurice_quest_id: mauriceQuest, accounts: accountEmails, demo_matches: 21 };
    }

    const report = parsed.data.action === "purge" ? await purge()
      : parsed.data.action === "reset" ? { purge: await purge(), seed: await seed() }
      : await seed();
    return json(report);
  } catch (error) {
    console.error("[DEMO-FEVE]", error);
    return json({
      error: error instanceof Error ? error.message : "Échec de la démo FEVE",
      details: typeof error === "object" && error && "details" in error ? String(error.details) : undefined,
      hint: typeof error === "object" && error && "hint" in error ? String(error.hint) : undefined,
    }, 500);
  }
});
