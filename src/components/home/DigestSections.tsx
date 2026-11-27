import i18n from "@/i18n/config";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Check, CheckCheck, RefreshCw, Newspaper, CalendarDays, Vote, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

type Item = { key: string; title: string; sub?: string; href: string; date: string };
type Section = { id: string; label: string; icon: typeof Newspaper; items: Item[] };

const db = supabase as any;
const since = () => new Date(Date.now() - 14 * 864e5).toISOString();
const short = (s?: string | null, n = 90) => (s ?? "").replace(/@\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/\s+/g, " ").trim().slice(0, n);
const day = (d: string) => new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short" });

async function loadSections(uid: string): Promise<Section[]> {
  const [{ data: gm }, { data: myQuests }, { data: part }] = await Promise.all([
    db.from("guild_members").select("guild_id").eq("user_id", uid),
    db.from("quests").select("id,title").or(`owner_id.eq.${uid},created_by_user_id.eq.${uid}`).eq("is_deleted", false),
    db.from("quest_participants").select("quest_id").eq("user_id", uid),
  ]);
  const guildIds: string[] = (gm ?? []).map((r: any) => r.guild_id);
  const ownQuestIds: string[] = (myQuests ?? []).map((q: any) => q.id);
  const questIds = [...new Set([...ownQuestIds, ...(part ?? []).map((r: any) => r.quest_id)])];
  const none = ["00000000-0000-0000-0000-000000000000"];
  const g = guildIds.length ? guildIds : none;
  const q = questIds.length ? questIds : none;
  const oq = ownQuestIds.length ? ownQuestIds : none;
  const now = new Date().toISOString();

  const [posts, updates, events, rituals, bookings, polls, proposals, trust] = await Promise.all([
    db.from("feed_posts").select("id,content,created_at,context_id").eq("context_type", "GUILD").in("context_id", g).eq("is_deleted", false).neq("author_user_id", uid).gte("created_at", since()).order("created_at", { ascending: false }).limit(6),
    db.from("quest_updates").select("id,title,quest_id,created_at").in("quest_id", q).eq("is_deleted", false).eq("is_draft", false).gte("created_at", since()).order("created_at", { ascending: false }).limit(6),
    db.from("guild_events").select("id,title,start_at,guild_id").in("guild_id", g).eq("is_cancelled", false).gte("start_at", now).order("start_at").limit(6),
    db.from("rituals").select("id,title,next_occurrence,guild_id").in("guild_id", g).eq("is_active", true).gte("next_occurrence", now).order("next_occurrence").limit(4),
    db.from("bookings").select("id,start_date_time,requested_date_time,created_at").eq("provider_user_id", uid).eq("status", "PENDING").eq("is_deleted", false).limit(5),
    db.from("decision_polls").select("id,question,closes_at,entity_id,created_at").eq("entity_type", "GUILD").in("entity_id", g).eq("status", "OPEN").order("created_at", { ascending: false }).limit(6),
    db.from("quest_proposals").select("id,title,quest_id,created_at").in("quest_id", oq).eq("status", "PENDING").order("created_at", { ascending: false }).limit(6),
    db.from("trust_edges").select("id,edge_type,created_by,created_at").eq("to_node_type", "profile").eq("to_node_id", uid).eq("status", "active").gte("created_at", since()).order("created_at", { ascending: false }).limit(6),
  ]);

  return [
    { id: "network", label: "Vie du réseau", icon: Newspaper, items: [
      ...(posts.data ?? []).map((p: any) => ({ key: `post:${p.id}`, title: short(p.content) || "Nouveau post", sub: "Post dans une de vos guildes", href: `/guilds/${p.context_id}`, date: p.created_at })),
      ...(updates.data ?? []).map((u: any) => ({ key: `qupd:${u.id}`, title: u.title || "Mise à jour de quête", sub: "Quête suivie", href: `/quests/${u.quest_id}`, date: u.created_at })),
    ] },
    { id: "agenda", get label() { return i18n.t("uiDigestSections.agenda"); }, icon: CalendarDays, items: [
      ...(events.data ?? []).map((e: any) => ({ key: `evt:${e.id}`, title: e.title, sub: `Événement · ${day(e.start_at)}`, href: `/guilds/${e.guild_id}`, date: e.start_at })),
      ...(rituals.data ?? []).map((r: any) => ({ key: `rit:${r.id}:${r.next_occurrence}`, title: r.title, sub: `Rituel · ${day(r.next_occurrence)}`, href: `/guilds/${r.guild_id}`, date: r.next_occurrence })),
      ...(bookings.data ?? []).map((b: any) => ({ key: `bk:${b.id}`, title: "Réservation à confirmer", sub: day(b.start_date_time ?? b.requested_date_time ?? b.created_at), href: `/me/bookings`, date: b.created_at })),
    ] },
    { id: "decisions", label: "Décisions à rendre", icon: Vote, items: [
      ...(polls.data ?? []).map((p: any) => ({ key: `poll:${p.id}`, title: p.question, sub: p.closes_at ? `Sondage · clôture ${day(p.closes_at)}` : "Sondage ouvert", href: `/guilds/${p.entity_id}`, date: p.created_at })),
      ...(proposals.data ?? []).map((p: any) => ({ key: `prop:${p.id}`, title: p.title, sub: "Proposition d'aide à valider", href: `/quests/${p.quest_id}`, date: p.created_at })),
    ] },
    { id: "trust", get label() { return i18n.t("uiDigestSections.confiance"); }, icon: ShieldCheck, items: (trust.data ?? []).map((t: any) => ({ key: `trust:${t.id}`, title: "Nouvelle attestation reçue", sub: String(t.edge_type).replace(/_/g, " "), href: `/users/${t.created_by}`, date: t.created_at })) },
  ];
}

export function DigestSections({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const sections = useQuery({ queryKey: ["digest-sections", userId], queryFn: () => loadSections(userId), staleTime: 60_000 });
  const reads = useQuery({
    queryKey: ["digest-reads", userId],
    queryFn: async () => new Set<string>(((await db.from("digest_read_items").select("item_key").eq("user_id", userId)).data ?? []).map((r: any) => r.item_key)),
  });
  const markRead = async (keys: string[]) => {
    if (!keys.length) return;
    qc.setQueryData(["digest-reads", userId], (s: Set<string> | undefined) => new Set([...(s ?? []), ...keys]));
    await db.from("digest_read_items").upsert(keys.map((item_key) => ({ user_id: userId, item_key })), { ignoreDuplicates: true });
  };
  const read = reads.data ?? new Set<string>();
  const visible = (sections.data ?? []).map((s) => ({ ...s, items: s.items.filter((i) => !read.has(i.key)) })).filter((s) => s.items.length > 0);
  if (!visible.length) return null;

  return (
    <section className="mb-5 space-y-3" aria-label="Sections du digest">
      <div className="flex items-center justify-end gap-1">
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => qc.invalidateQueries({ queryKey: ["digest-sections", userId] })} disabled={sections.isFetching}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1 ${sections.isFetching ? "animate-spin" : ""}`} />Rafraîchir
        </Button>
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => markRead(visible.flatMap((s) => s.items.map((i) => i.key)))}>
          <CheckCheck className="h-3.5 w-3.5 mr-1" />{t("uiDigestSections.toutMarquerLu")}
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {visible.map((s) => (
          <div key={s.id} className="group/section rounded-lg border border-border bg-card p-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold"><s.icon className="h-4 w-4 text-primary" />{s.label}<span className="text-xs text-muted-foreground font-normal">({s.items.length})</span></h3>
              <button type="button" onClick={() => markRead(s.items.map((i) => i.key))} className="text-xs text-muted-foreground hover:text-foreground opacity-100 md:opacity-0 md:group-hover/section:opacity-100 focus:opacity-100 transition-opacity">{t("uiDigestSections.marquerLu")}</button>
            </div>
            <ul className="space-y-1">
              {s.items.slice(0, 4).map((i) => (
                <li key={i.key} className="group/item flex items-start gap-2 rounded px-1.5 py-1 hover:bg-muted/50">
                  <Link to={i.href} onClick={() => markRead([i.key])} className="min-w-0 flex-1">
                    <p className="text-sm truncate">{i.title}</p>
                    {i.sub && <p className="text-xs text-muted-foreground truncate">{i.sub}</p>}
                  </Link>
                  <button type="button" aria-label={t("uiDigestSections.marquerCommeLu")} title={t("uiDigestSections.marquerCommeLu")} onClick={() => markRead([i.key])} className="shrink-0 p-1 text-muted-foreground hover:text-primary opacity-100 md:opacity-0 md:group-hover/item:opacity-100 focus:opacity-100 transition-opacity">
                    <Check className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
