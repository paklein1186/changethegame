import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Sparkles, HandHeart, Clock, X, ArrowRight, MapPin, CalendarCheck, Send, Check, Loader2, CircleCheckBig, Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { Checkbox } from "@/components/ui/checkbox";
import { CreateTrustEdgeDialog } from "@/components/CreateTrustEdgeDialog";
import { TrustNodeType } from "@/types/enums";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export interface Opportunity {
  match_id: string;
  direction: "you_can_help" | "help_for_you" | "platform";
  quest_id: string;
  quest_title: string;
  need_label: string;
  need_kind: "explicit" | "implied";
  need_category: string;
  helper_type: "profile" | "guild" | "company";
  helper_id: string;
  helper_name: string | null;
  helper_avatar: string | null;
  capability_label: string;
  capability_status: string;
  reason_fr: string | null;
  reason_en: string | null;
  score: number;
  territory_names: string[] | null;
  my_verdict: "help" | "not_relevant" | "later" | null;
  /** Service the matched capability is backed by: the quest holder can book it directly. */
  capability_service_url?: string | null;
  capability_service_title?: string | null;
  capability_id?: string;
  /** A help request has already been sent by me for this opportunity. */
  request_sent?: boolean;
  /** I take part in the quest: I can say the help was actually delivered. */
  can_mark_done?: boolean;
  done?: boolean;
  outcome_id?: string | null;
  trust_given?: boolean;
}

const trustNodeType = (o: Opportunity) =>
  o.helper_type === "profile" ? TrustNodeType.PROFILE : o.helper_type === "guild" ? TrustNodeType.GUILD : TrustNodeType.PARTNER_ENTITY;

type Scope = "me" | "guilds" | "all";

const helperUrl = (o: Opportunity) =>
  o.helper_type === "profile" ? `/users/${o.helper_id}` : o.helper_type === "guild" ? `/guilds/${o.helper_id}` : `/companies/${o.helper_id}`;

/**
 * Opportunities spotted by the matching engine: needs of projects ↔ what members, guilds and organisations can offer.
 * - Home: scope "me" by default (what I can help with, who can help my quests), switchable to my guilds / everywhere.
 * - Guild: everything around one guild (its quests, the guild itself, its members).
 * - Quest: who could help this quest.
 */
export function OpportunitiesPanel({ guildId, questId, defaultScope = "me", initialCount = 5, className }: {
  guildId?: string;
  questId?: string;
  defaultScope?: Scope;
  initialCount?: number;
  className?: string;
}) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const currentUser = useCurrentUser();
  const [asking, setAsking] = useState<Opportunity | null>(null);
  const [askText, setAskText] = useState("");
  const [sending, setSending] = useState(false);
  const [marking, setMarking] = useState<Opportunity | null>(null);
  const [doneNote, setDoneNote] = useState("");
  const [alsoTrust, setAlsoTrust] = useState(true);
  const [savingDone, setSavingDone] = useState(false);
  const [trustFor, setTrustFor] = useState<{ o: Opportunity; outcomeId: string } | null>(null);
  const fr = i18n.language?.startsWith("fr");
  const [scope, setScope] = useState<Scope>(questId ? "all" : defaultScope);
  const [category, setCategory] = useState("all");
  const [place, setPlace] = useState("all");
  const [expanded, setExpanded] = useState(false);

  const queryKey = ["opportunities", currentUser.id ?? null, guildId ?? null, questId ? "all" : scope];
  const { data = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_opportunities", {
        p_scope: questId ? "all" : scope,
        p_guild_id: guildId ?? null,
        p_limit: 120,
      });
      if (error) throw error;
      return (data ?? []) as Opportunity[];
    },
    staleTime: 60_000,
  });

  const rows = useMemo(() => data.filter((o) => !questId || o.quest_id === questId), [data, questId]);
  const categories = useMemo(() => [...new Set(rows.map((o) => o.need_category))].sort(), [rows]);
  const places = useMemo(() => [...new Set(rows.flatMap((o) => o.territory_names ?? []))].sort(), [rows]);
  const filtered = rows.filter((o) =>
    (category === "all" || o.need_category === category) && (place === "all" || (o.territory_names ?? []).includes(place)));
  const shown = expanded ? filtered : filtered.slice(0, initialCount);

  const feedback = useMutation({
    mutationFn: async ({ id, verdict }: { id: string; verdict: "help" | "not_relevant" | "later" }) => {
      const { error } = await (supabase as any).rpc("set_opportunity_feedback", { p_match_id: id, p_verdict: verdict });
      if (error) throw error;
      return verdict;
    },
    onSuccess: (verdict) => {
      qc.invalidateQueries({ queryKey: ["opportunities"] });
      if (verdict === "help") toast.success(t("matchOpportunities.helpSent"));
    },
    onError: () => toast.error(t("matchOpportunities.feedbackFailed")),
  });

  // « Demander » : message direct, prérempli et modifiable, à la personne (ou aux admins de la guilde).
  const openAsk = (o: Opportunity) => {
    const origin = window.location.origin;
    setAskText(t("matchOpportunities.askTemplate", {
      name: o.helper_name ?? "",
      quest: o.quest_title,
      need: o.need_label,
      what: o.capability_label,
      profileUrl: `${origin}${helperUrl(o)}`,
      questUrl: `${origin}/quests/${o.quest_id}`,
    }));
    setAsking(o);
  };
  const sendAsk = async () => {
    if (!asking) return;
    setSending(true);
    try {
      const { data, error } = await (supabase as any).rpc("request_opportunity_help", { p_match_id: asking.match_id, p_message: askText });
      if (error) throw error;
      // Notification et e-mail, comme pour tout message direct.
      await Promise.all(((data ?? []) as { conversation_id: string; message_id: string }[]).map((r) =>
        supabase.functions.invoke("send-dm-notification", {
          body: { messageId: r.message_id, conversationId: r.conversation_id, senderId: currentUser.id, content: askText },
        }).catch((): null => null)));
      toast.success(t("matchOpportunities.askSent"));
      setAsking(null);
      qc.invalidateQueries({ queryKey: ["opportunities"] });
    } catch {
      toast.error(t("matchOpportunities.askFailed"));
    } finally {
      setSending(false);
    }
  };
  // « C'est réalisé » : l'aide a bien eu lieu. Puis, si coché, accorder sa confiance (Give trust).
  const markDone = async () => {
    if (!marking) return;
    setSavingDone(true);
    try {
      const { data, error } = await (supabase as any).rpc("mark_opportunity_done", { p_match_id: marking.match_id, p_note: doneNote || null });
      if (error) throw error;
      toast.success(t("matchOpportunities.doneSaved", { name: marking.helper_name ?? "" }));
      qc.invalidateQueries({ queryKey: ["opportunities"] });
      qc.invalidateQueries({ queryKey: ["quest-needs", marking.quest_id] });
      if (alsoTrust && data) setTrustFor({ o: marking, outcomeId: data as string });
      setMarking(null);
    } catch {
      toast.error(t("matchOpportunities.feedbackFailed"));
    } finally {
      setSavingDone(false);
    }
  };
  const trustGiven = async () => {
    if (!trustFor) return;
    await (supabase as any).rpc("set_opportunity_trust_given", { p_outcome_id: trustFor.outcomeId });
    qc.invalidateQueries({ queryKey: ["opportunities"] });
  };

  // Confirmer une compétence suggérée par la plateforme : elle devient visible comme confirmée.
  const confirmOffer = async (o: Opportunity) => {
    if (!o.capability_id) return;
    const { error } = await (supabase as any).from("capabilities").update({ status: "confirmed" }).eq("id", o.capability_id);
    if (error) { toast.error(t("matchOpportunities.feedbackFailed")); return; }
    toast.success(t("matchOpportunities.offerConfirmed"));
    qc.invalidateQueries({ queryKey: ["opportunities"] });
    qc.invalidateQueries({ queryKey: ["capabilities"] });
  };

  const sentence = (o: Opportunity) => {
    const quest = <Link to={`/quests/${o.quest_id}`} className="font-semibold text-foreground hover:text-primary">{o.quest_title}</Link>;
    const need = <span className="font-medium">« {o.need_label} »</span>;
    const helper = <Link to={helperUrl(o)} className="font-semibold text-foreground hover:text-primary">{o.helper_name ?? "?"}</Link>;
    if (o.direction === "you_can_help") {
      return <>{quest} {t("matchOpportunities.needs")} {need} — {t("matchOpportunities.youCouldHelp", { what: o.capability_label })}</>;
    }
    return <>{helper} {t("matchOpportunities.couldHelp")} {quest} {t("matchOpportunities.with")} {need}</>;
  };

  return (
    <section className={cn("rounded-2xl border border-primary/20 bg-primary/[0.03] p-4 sm:p-5", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <Sparkles className="h-4 w-4 text-primary" />
            {questId ? t("matchOpportunities.titleQuest") : guildId ? t("matchOpportunities.titleGuild") : t("matchOpportunities.title")}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">{t("matchOpportunities.subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!guildId && !questId && (
            <div className="inline-flex rounded-lg border border-border bg-background p-0.5" role="tablist">
              {(["me", "guilds", "all"] as Scope[]).map((s) => (
                <button
                  key={s}
                  role="tab"
                  aria-selected={scope === s}
                  onClick={() => setScope(s)}
                  className={cn("px-2.5 py-1 text-xs rounded-md transition-colors", scope === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
                >
                  {t(`matchOpportunities.scope.${s}`)}
                </button>
              ))}
            </div>
          )}
          {categories.length > 1 && (
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="h-8 w-auto text-xs gap-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("matchOpportunities.allKinds")}</SelectItem>
                {categories.map((c) => <SelectItem key={c} value={c}>{t(`matchOpportunities.category.${c}`, c)}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {places.length > 1 && (
            <Select value={place} onValueChange={setPlace}>
              <SelectTrigger className="h-8 w-auto text-xs gap-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("matchOpportunities.allPlaces")}</SelectItem>
                {places.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2"><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-3">
          {t(questId ? "matchOpportunities.emptyQuest" : "matchOpportunities.empty")}{" "}
          {!questId && <Link to="/me?tab=overview" className="text-primary hover:underline">{t("matchOpportunities.completeOffer")}</Link>}
        </p>
      ) : (
        <ul className="space-y-2">
          {shown.map((o) => {
            const reason = (fr ? o.reason_fr : o.reason_en) || o.reason_fr || o.reason_en;
            return (
              <li key={o.match_id} className="rounded-xl border border-border bg-card p-3 flex gap-3">
                <Link to={helperUrl(o)} className="shrink-0" aria-hidden tabIndex={-1}>
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={o.helper_avatar ?? undefined} />
                    <AvatarFallback className="text-xs">{(o.helper_name ?? "?").charAt(0)}</AvatarFallback>
                  </Avatar>
                </Link>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-foreground/90 leading-snug">{sentence(o)}</p>
                  {reason && <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{reason}</p>}
                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    <Badge variant="outline" className="text-[10px]">{t(`matchOpportunities.category.${o.need_category}`, o.need_category)}</Badge>
                    {o.need_kind === "implied" && <Badge variant="secondary" className="text-[10px]">{t("matchOpportunities.implied")}</Badge>}
                    {o.capability_status !== "confirmed" && (
                      <Badge variant="secondary" className="text-[10px]" title={t("matchOpportunities.suggestedHint")}>
                        {o.direction === "you_can_help" ? t("matchOpportunities.unconfirmedOffer") : t("matchOpportunities.suggested")}
                      </Badge>
                    )}
                    {o.done && (
                      <Badge className="text-[10px] gap-1 bg-emerald-600 hover:bg-emerald-600"><CircleCheckBig className="h-3 w-3" /> {t("matchOpportunities.done")}</Badge>
                    )}
                    {(o.territory_names ?? []).slice(0, 2).map((p) => (
                      <span key={p} className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground"><MapPin className="h-3 w-3" />{p}</span>
                    ))}
                    <div className="ml-auto flex flex-wrap items-center justify-end gap-1 max-w-full">
                      {o.done ? (
                        o.can_mark_done && !o.trust_given && o.outcome_id ? (
                          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setTrustFor({ o, outcomeId: o.outcome_id! })}>
                            <Shield className="h-3.5 w-3.5" /> {t("matchOpportunities.giveTrust")}
                          </Button>
                        ) : o.trust_given ? (
                          <span className="text-xs text-muted-foreground">{t("matchOpportunities.trustGiven")}</span>
                        ) : null
                      ) : o.direction === "you_can_help" ? (
                        o.my_verdict === "help" ? (
                          <span className="text-xs text-primary font-medium">{t("matchOpportunities.helpOffered")}</span>
                        ) : (
                          <>
                            {o.capability_status !== "confirmed" && o.helper_type === "profile" && (
                              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => confirmOffer(o)} title={t("matchOpportunities.confirmOfferHint")}>
                                <Check className="h-3.5 w-3.5" /> {t("matchOpportunities.confirmOffer")}
                              </Button>
                            )}
                            <Button size="sm" className="h-7 text-xs gap-1" disabled={feedback.isPending} onClick={() => feedback.mutate({ id: o.match_id, verdict: "help" })}>
                              <HandHeart className="h-3.5 w-3.5" /> {t("matchOpportunities.iCanHelp")}
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={feedback.isPending} onClick={() => feedback.mutate({ id: o.match_id, verdict: "later" })} title={t("matchOpportunities.later")}>
                              <Clock className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )
                      ) : (
                        <>
                          {o.direction === "help_for_you" && !o.capability_service_url && (
                            o.request_sent ? (
                              <span className="text-xs text-primary font-medium">{t("matchOpportunities.requestSent")}</span>
                            ) : (
                              <Button size="sm" className="h-7 text-xs gap-1" onClick={() => openAsk(o)}>
                                <Send className="h-3.5 w-3.5" /> {t("matchOpportunities.ask")}
                              </Button>
                            )
                          )}
                          {o.capability_service_url && (
                            <Button size="sm" className="h-7 text-xs gap-1" asChild>
                              <Link
                                to={o.capability_service_url}
                                title={o.capability_service_title ? `${t("matchOpportunities.book")} : ${o.capability_service_title}` : undefined}
                              >
                                <CalendarCheck className="h-3.5 w-3.5" /> {t("matchOpportunities.book")}
                              </Link>
                            </Button>
                          )}
                          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" asChild>
                            <Link to={helperUrl(o)}>{t("matchOpportunities.viewProfile")} <ArrowRight className="h-3 w-3" /></Link>
                          </Button>
                        </>
                      )}
                      {!o.done && o.can_mark_done && (
                        <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-emerald-700 dark:text-emerald-400" onClick={() => { setDoneNote(""); setAlsoTrust(true); setMarking(o); }} title={t("matchOpportunities.markDoneHint")}>
                          <CircleCheckBig className="h-3.5 w-3.5" /> {t("matchOpportunities.markDone")}
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={feedback.isPending} onClick={() => feedback.mutate({ id: o.match_id, verdict: "not_relevant" })} title={t("matchOpportunities.notRelevant")} aria-label={t("matchOpportunities.notRelevant")}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={!!asking} onOpenChange={(open) => { if (!open) setAsking(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="pr-6">{t("matchOpportunities.askTitle", { name: asking?.helper_name ?? "" })}</DialogTitle>
            <DialogDescription>{t("matchOpportunities.askHint")}</DialogDescription>
          </DialogHeader>
          <Textarea value={askText} onChange={(e) => setAskText(e.target.value)} rows={10} maxLength={2000} className="text-sm" />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAsking(null)}>{t("matchOpportunities.cancel")}</Button>
            <Button onClick={sendAsk} disabled={sending || askText.trim().length < 10} className="gap-1.5">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} {t("matchOpportunities.askSend")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!marking} onOpenChange={(open) => { if (!open) setMarking(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="pr-6">{t("matchOpportunities.markDoneTitle")}</DialogTitle>
            <DialogDescription>
              {t("matchOpportunities.markDoneDesc", { name: marking?.helper_name ?? "", need: marking?.need_label ?? "", quest: marking?.quest_title ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <Textarea value={doneNote} onChange={(e) => setDoneNote(e.target.value)} rows={3} maxLength={1000} placeholder={t("matchOpportunities.donePlaceholder")} className="text-sm" />
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={alsoTrust} onCheckedChange={(v) => setAlsoTrust(v === true)} />
            {t("matchOpportunities.alsoTrust", { name: marking?.helper_name ?? "" })}
          </label>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMarking(null)}>{t("matchOpportunities.cancel")}</Button>
            <Button onClick={markDone} disabled={savingDone} className="gap-1.5">
              {savingDone ? <Loader2 className="h-4 w-4 animate-spin" /> : <CircleCheckBig className="h-4 w-4" />} {t("matchOpportunities.markDoneConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {trustFor && (
        <CreateTrustEdgeDialog
          open={!!trustFor}
          onOpenChange={(open) => { if (!open) setTrustFor(null); }}
          targetNodeType={trustNodeType(trustFor.o)}
          targetNodeId={trustFor.o.helper_id}
          targetName={trustFor.o.helper_name ?? undefined}
          contextQuestId={trustFor.o.quest_id}
          onCreated={trustGiven}
        />
      )}

      {filtered.length > initialCount && (
        <Button variant="link" size="sm" className="mt-2 h-auto p-0 text-xs" onClick={() => setExpanded((v) => !v)}>
          {expanded ? t("matchOpportunities.showLess") : t("matchOpportunities.showAll", { count: filtered.length })}
        </Button>
      )}
    </section>
  );
}
