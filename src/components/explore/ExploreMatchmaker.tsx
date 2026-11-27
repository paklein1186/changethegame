import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { OpportunitiesPanel } from "@/components/opportunities/OpportunitiesPanel";
import { MatchmakerPanel } from "@/components/MatchmakerPanel";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Target = { kind: "me" } | { kind: "guild"; id: string; name: string } | { kind: "quest"; id: string; name: string };
type Person = { user_id: string; name: string | null; avatar_url?: string | null };

/** Explore › Matchmaker: real matches for me / a guild / a quest, AI leads, introductions and follow-up. */
export function ExploreMatchmaker({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const [target, setTarget] = useState<Target>({ kind: "me" });
  const [introOpen, setIntroOpen] = useState(false);

  const { data: targets } = useQuery({
    queryKey: ["matchmaker-targets", userId],
    staleTime: 60_000,
    queryFn: async () => {
      const [{ data: gm }, { data: qp }, { data: owned }] = await Promise.all([
        supabase.from("guild_members").select("guild_id, guilds!inner(id, name, is_deleted)").eq("user_id", userId),
        supabase.from("quest_participants").select("quest_id").eq("user_id", userId),
        supabase.from("quests").select("id, title").eq("created_by_user_id", userId).eq("is_deleted", false).eq("is_draft", false),
      ]);
      const guilds = ((gm as any[]) ?? []).filter((g) => g.guilds && !g.guilds.is_deleted).map((g) => ({ id: g.guilds.id as string, name: g.guilds.name as string }));
      const ids = [...new Set(((qp as any[]) ?? []).map((q) => q.quest_id as string))].filter((id) => !(owned ?? []).some((o: any) => o.id === id));
      const { data: joined } = ids.length
        ? await supabase.from("quests").select("id, title").in("id", ids).eq("is_deleted", false)
        : { data: [] as any[] };
      const quests = [...(owned ?? []), ...(joined ?? [])].map((q: any) => ({ id: q.id as string, name: q.title as string }));
      return { guilds, quests };
    },
  });


  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">{t("matchmakerHub.target")}</span>
          <div className="inline-flex rounded-lg border border-border bg-background p-0.5" role="tablist">
            {(["me", "guild", "quest"] as const).map((k) => (
              <button key={k} role="tab" aria-selected={target.kind === k}
                disabled={k === "guild" ? !targets?.guilds.length : k === "quest" ? !targets?.quests.length : false}
                onClick={() => {
                  if (k === "me") setTarget({ kind: "me" });
                  else { const first = (k === "guild" ? targets?.guilds : targets?.quests)?.[0]; if (first) setTarget({ kind: k, ...first }); }
                }}
                className={cn("px-3 py-1 text-xs rounded-md transition-colors disabled:opacity-40", target.kind === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
                {t(`matchmakerHub.${k}`)}
              </button>
            ))}
          </div>
          {target.kind !== "me" && (
            <Select value={target.id} onValueChange={(id) => {
              const list = target.kind === "guild" ? targets?.guilds : targets?.quests;
              const item = list?.find((x) => x.id === id);
              if (item) setTarget({ kind: target.kind, ...item } as Target);
            }}>
              <SelectTrigger className="h-8 w-64 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-80">
                {(target.kind === "guild" ? targets?.guilds : targets?.quests)?.map((x) => (
                  <SelectItem key={x.id} value={x.id} className="text-xs">{x.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <Button size="sm" variant="outline" onClick={() => setIntroOpen(true)}>
          <UserPlus className="h-4 w-4 mr-1.5" /> {t("matchmakerHub.intro")}
        </Button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-5">
          <OpportunitiesPanel
            key={target.kind + ((target as any).id ?? "")}
            guildId={target.kind === "guild" ? target.id : undefined}
            questId={target.kind === "quest" ? target.id : undefined}
            showMapLink={target.kind === "me"}
            initialCount={8}
          />
          <section>
            <h3 className="text-sm font-semibold mb-1">{t("matchmakerHub.aiTitle")}</h3>
            <p className="text-xs text-muted-foreground mb-2">{t("matchmakerHub.aiHint")}</p>
            <MatchmakerPanel
              key={"ai" + target.kind + ((target as any).id ?? "")}
              matchType={target.kind === "me" ? "user" : target.kind}
              userId={userId}
              guildId={target.kind === "guild" ? target.id : undefined}
              questId={target.kind === "quest" ? target.id : undefined}
            />
          </section>
        </div>
        <FollowUp userId={userId} />
      </div>

      <IntroDialog open={introOpen} onOpenChange={setIntroOpen} userId={userId} />
    </div>
  );
}

function FollowUp({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const { data = [] } = useQuery({
    queryKey: ["matchmaker-followup", userId],
    staleTime: 60_000,
    queryFn: async () => {
      const [{ data: reqs }, { data: convs }] = await Promise.all([
        (supabase as any).from("opportunity_requests").select("id, requester_id, recipient_id, conversation_id, created_at")
          .or(`requester_id.eq.${userId},recipient_id.eq.${userId}`).order("created_at", { ascending: false }).limit(20),
        supabase.from("conversations").select("id, title, created_at").eq("created_by", userId).eq("sender_entity_type", "introduction")
          .order("created_at", { ascending: false }).limit(10),
      ]);
      const others = [...new Set(((reqs as any[]) ?? []).map((r) => (r.requester_id === userId ? r.recipient_id : r.requester_id)))];
      const { data: people } = others.length
        ? await (supabase as any).from("profiles_public").select("user_id, name").in("user_id", others)
        : { data: [] };
      const nameOf = new Map(((people as any[]) ?? []).map((p) => [p.user_id, p.name]));
      const items = [
        ...((reqs as any[]) ?? []).map((r) => {
          const mine = r.requester_id === userId;
          const name = nameOf.get(mine ? r.recipient_id : r.requester_id) ?? "?";
          return { id: r.id, label: t(mine ? "matchmakerHub.sentTo" : "matchmakerHub.receivedFrom", { name }), conv: r.conversation_id, at: r.created_at };
        }),
        ...((convs as any[]) ?? []).map((c) => ({ id: c.id, label: c.title ?? t("matchmakerHub.intro"), conv: c.id, at: c.created_at })),
      ];
      return items.sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 20);
    },
  });

  return (
    <aside className="rounded-2xl border border-border bg-card/40 p-4 h-fit">
      <h3 className="flex items-center gap-2 text-sm font-semibold mb-3"><MessageSquare className="h-4 w-4 text-primary" /> {t("matchmakerHub.follow")}</h3>
      {data.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("matchmakerHub.followEmpty")}</p>
      ) : (
        <ul className="space-y-2">
          {data.map((i) => (
            <li key={i.id} className="flex items-center justify-between gap-2 text-xs">
              <div className="min-w-0">
                <p className="truncate text-foreground">{i.label}</p>
                <p className="text-muted-foreground">{new Date(i.at).toLocaleDateString()}</p>
              </div>
              {i.conv && <Button size="sm" variant="ghost" className="h-7 px-2" asChild><Link to={`/inbox?c=${i.conv}`}>{t("matchmakerHub.open")}</Link></Button>}
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

function PersonPicker({ label, value, onChange, exclude }: { label: string; value: Person | null; onChange: (p: Person | null) => void; exclude: string[] }) {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const { data = [] } = useQuery({
    queryKey: ["intro-people", q],
    enabled: q.trim().length >= 2,
    queryFn: async () => {
      const { data } = await (supabase as any).from("profiles_public").select("user_id, name, avatar_url").ilike("name", `%${q.trim()}%`).limit(8);
      return (data ?? []) as Person[];
    },
  });
  const results = useMemo(() => data.filter((p) => !exclude.includes(p.user_id)), [data, exclude]);
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium">{label}</p>
      {value ? (
        <div className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
          {value.name}
          <button onClick={() => onChange(null)} aria-label="×"><X className="h-4 w-4" /></button>
        </div>
      ) : (
        <>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("matchmakerHub.searchPeople")} aria-label={label} />
          {results.length > 0 && (
            <ul className="rounded-md border border-border max-h-40 overflow-y-auto">
              {results.map((p) => (
                <li key={p.user_id}>
                  <button className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted" onClick={() => { onChange(p); setQ(""); }}>{p.name}</button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function IntroDialog({ open, onOpenChange, userId }: { open: boolean; onOpenChange: (v: boolean) => void; userId: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [a, setA] = useState<Person | null>(null);
  const [b, setB] = useState<Person | null>(null);
  const [msg, setMsg] = useState("");
  const [sending, setSending] = useState(false);
  const template = a && b ? t("matchmakerHub.introTemplate", { a: a.name, b: b.name }) : "";
  const text = msg || template;

  const send = async () => {
    if (!a || !b || !text.trim()) return;
    setSending(true);
    try {
      const { data: conv, error } = await supabase.from("conversations")
        .insert({ title: `${a.name} ↔ ${b.name}`, is_group: true, created_by: userId, sender_entity_type: "introduction" } as any)
        .select("id").single();
      if (error || !conv) throw error;
      const { error: pErr } = await supabase.from("conversation_participants").insert(
        [userId, a.user_id, b.user_id].map((u) => ({ conversation_id: conv.id, user_id: u })));
      if (pErr) throw pErr;
      const { data: m, error: mErr } = await supabase.from("direct_messages")
        .insert({ conversation_id: conv.id, sender_id: userId, content: text.trim() } as any).select("id").single();
      if (mErr) throw mErr;
      supabase.functions.invoke("send-dm-notification", { body: { messageId: m?.id, conversationId: conv.id, senderId: userId, content: text.trim() } }).catch(() => {});
      toast.success(t("matchmakerHub.introSent"));
      qc.invalidateQueries({ queryKey: ["matchmaker-followup"] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
      setA(null); setB(null); setMsg(""); onOpenChange(false);
    } catch {
      toast.error(t("matchmakerHub.introFailed"));
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("matchmakerHub.introTitle")}</DialogTitle>
          <DialogDescription>{t("matchmakerHub.introHint")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <PersonPicker label={t("matchmakerHub.personA")} value={a} onChange={setA} exclude={[userId, b?.user_id ?? ""]} />
          <PersonPicker label={t("matchmakerHub.personB")} value={b} onChange={setB} exclude={[userId, a?.user_id ?? ""]} />
          {a && b && (
            <div className="space-y-1">
              <p className="text-xs font-medium">{t("matchmakerHub.introMessage")}</p>
              <Textarea rows={5} value={text} onChange={(e) => setMsg(e.target.value)} aria-label={t("matchmakerHub.introMessage")} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{t("matchOpportunities.cancel")}</Button>
          <Button onClick={send} disabled={!a || !b || !text.trim() || sending}>{t("matchmakerHub.introSend")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
