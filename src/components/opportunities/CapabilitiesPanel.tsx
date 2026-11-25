import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Check, X, Plus, Loader2, Wand2, FileText, ChevronDown, CalendarPlus, CalendarCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const CATEGORIES = ["SKILLS", "TOOLS", "PLACE", "FUNDING", "MENTORSHIP", "VISIBILITY", "PARTNERSHIPS", "VOLUNTEER"];
const COLUMNS = "id, owner_type, owner_id, label, category, description, evidence, confidence, status, source";

interface Capability {
  id: string; label: string; category: string; description: string | null; confidence: number;
  status: "inferred" | "confirmed" | "dismissed"; source: "inferred" | "manual";
  evidence: { kind: string; title: string; url: string | null }[];
}

/**
 * "What I can offer": capabilities inferred from activity (tasks, projects, services, courses, attestations, CV),
 * to confirm or dismiss, plus manual additions. Visitors only see confirmed capabilities.
 */
export function CapabilitiesPanel({ ownerType, ownerId, canManage }: {
  ownerType: "profile" | "guild" | "company";
  ownerId: string;
  canManage: boolean;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const key = ["capabilities", ownerType, ownerId];
  const [analysing, setAnalysing] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newCategory, setNewCategory] = useState("SKILLS");
  const [cvOpen, setCvOpen] = useState(false);
  const [cv, setCv] = useState("");

  const { data: caps = [], isLoading } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("capabilities").select(COLUMNS)
        .eq("owner_type", ownerType).eq("owner_id", ownerId).order("confidence", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Capability[];
    },
    enabled: !!ownerId,
  });

  const { data: savedCv } = useQuery({
    queryKey: ["capability-inputs", ownerId],
    queryFn: async () => {
      const { data } = await (supabase as any).from("capability_inputs").select("cv_text").eq("user_id", ownerId).maybeSingle();
      return (data?.cv_text as string | null) ?? "";
    },
    enabled: canManage && ownerType === "profile",
  });
  useEffect(() => { if (savedCv !== undefined) setCv(savedCv ?? ""); }, [savedCv]);

  const refresh = () => qc.invalidateQueries({ queryKey: key });
  const setStatus = async (id: string, status: Capability["status"]) => {
    const { error } = await (supabase as any).from("capabilities").update({ status }).eq("id", id);
    if (error) toast.error(t("capabilities.saveFailed")); else refresh();
  };
  const add = async () => {
    const label = newLabel.trim();
    if (!label) return;
    const { error } = await (supabase as any).from("capabilities").insert({
      owner_type: ownerType, owner_id: ownerId, label, category: newCategory, source: "manual", status: "confirmed", confidence: 0.7,
    });
    if (error) toast.error(t("capabilities.saveFailed")); else { setNewLabel(""); refresh(); }
  };
  const analyse = async () => {
    setAnalysing(true);
    try {
      if (ownerType === "profile" && cv !== (savedCv ?? "")) {
        await (supabase as any).from("capability_inputs").upsert({ user_id: ownerId, cv_text: cv.trim() || null, updated_at: new Date().toISOString() });
      }
      const body = ownerType === "profile" ? { mode: "profile" } : { mode: "guild", guild_id: ownerId };
      const { data, error } = await supabase.functions.invoke("opportunity-engine", { body });
      if (error) throw error;
      toast.success(t("capabilities.analysed", { count: data?.capabilities_written ?? 0 }));
      refresh();
      qc.invalidateQueries({ queryKey: ["opportunities"] });
    } catch {
      toast.error(t("capabilities.analyseFailed"));
    } finally {
      setAnalysing(false);
    }
  };

  const confirmed = caps.filter((c) => c.status === "confirmed");
  const toReview = caps.filter((c) => c.status === "inferred");
  // Visiteurs : les compétences confirmées, puis celles que la plateforme suggère à partir de l'activité publique.
  const suggested = canManage ? [] : toReview.filter((c) => c.evidence?.some((e) => e.kind !== "cv"));
  if (!canManage && !confirmed.length && !suggested.length) return null;

  return (
    <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="font-display font-semibold">{canManage ? t("capabilities.titleOwn") : t("capabilities.title")}</h3>
          {canManage && <p className="text-xs text-muted-foreground mt-0.5">{t("capabilities.subtitle")}</p>}
        </div>
        {canManage && (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={analyse} disabled={analysing}>
            {analysing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
            {analysing ? t("capabilities.analysing") : t("capabilities.analyse")}
          </Button>
        )}
      </div>

      {isLoading ? null : (
        <div className="space-y-4">
          {confirmed.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {confirmed.map((c) => {
                const serviceUrl = c.evidence?.find((e) => e.kind === "service" && e.url?.startsWith("/services/"))?.url;
                const makeService = `/services/new?${new URLSearchParams({ title: c.label, description: c.description ?? "" })}`;
                return (
                <Badge key={c.id} variant="secondary" className="text-xs gap-1 py-1">
                  {c.label}
                  {serviceUrl ? (
                    <Link to={serviceUrl} title={t("capabilities.seeService")} aria-label={t("capabilities.seeService")} className="opacity-70 hover:opacity-100">
                      <CalendarCheck className="h-3 w-3" />
                    </Link>
                  ) : canManage && ownerType === "profile" && (
                    <Link to={makeService} title={t("capabilities.makeService")} aria-label={t("capabilities.makeService")} className="opacity-60 hover:opacity-100">
                      <CalendarPlus className="h-3 w-3" />
                    </Link>
                  )}
                  {canManage && (
                    <button onClick={() => setStatus(c.id, "dismissed")} aria-label={t("capabilities.remove")} className="ml-0.5 opacity-60 hover:opacity-100">
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </Badge>
                );
              })}
            </div>
          )}

          {suggested.length > 0 && (
            <div>
              <p className="text-[11px] text-muted-foreground mb-1.5" title={t("matchOpportunities.suggestedHint")}>{t("capabilities.suggestedByPlatform")}</p>
              <div className="flex flex-wrap gap-1.5">
                {suggested.map((c) => (
                  <Badge key={c.id} variant="outline" className="text-xs py-1 border-dashed text-muted-foreground" title={c.evidence?.filter((e) => e.kind !== "cv").slice(0, 2).map((e) => e.title).join(" · ")}>
                    {c.label}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {canManage && ownerType === "profile" && confirmed.some((c) => !c.evidence?.some((e) => e.kind === "service")) && (
            <p className="text-[11px] text-muted-foreground flex items-center gap-1">
              <CalendarPlus className="h-3 w-3" /> {t("capabilities.makeServiceHint")}
            </p>
          )}

          {canManage && toReview.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">{t("capabilities.toReview", { count: toReview.length })}</p>
              <ul className="space-y-2">
                {toReview.map((c) => (
                  <li key={c.id} className="rounded-xl border border-dashed border-border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{c.label} <span className="text-[10px] text-muted-foreground">· {t(`matchOpportunities.category.${c.category}`, c.category)}</span></p>
                        {c.description && <p className="text-xs text-muted-foreground mt-0.5">{c.description}</p>}
                        {c.evidence?.length > 0 && (
                          <ul className="mt-1.5 space-y-0.5">
                            {c.evidence.slice(0, 3).map((e, i) => (
                              <li key={i} className="text-[11px] text-muted-foreground flex gap-1">
                                <FileText className="h-3 w-3 shrink-0 mt-0.5" />
                                {e.url ? <Link to={e.url} className="hover:text-primary line-clamp-1">{e.title}</Link> : <span className="line-clamp-1">{e.title}</span>}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button size="sm" className="h-7 text-xs gap-1" onClick={() => setStatus(c.id, "confirmed")}><Check className="h-3.5 w-3.5" /> {t("capabilities.confirm")}</Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setStatus(c.id, "dismissed")} aria-label={t("capabilities.dismiss")}><X className="h-3.5 w-3.5" /></Button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {canManage && !caps.length && <p className="text-sm text-muted-foreground">{t("capabilities.empty")}</p>}

          {canManage && (
            <div className="flex flex-wrap gap-2">
              <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }}
                placeholder={t("capabilities.addPlaceholder")} className="h-8 text-sm flex-1 min-w-[180px]" maxLength={80} />
              <Select value={newCategory} onValueChange={setNewCategory}>
                <SelectTrigger className="h-8 w-auto text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{t(`matchOpportunities.category.${c}`, c)}</SelectItem>)}</SelectContent>
              </Select>
              <Button size="sm" variant="outline" className="h-8 gap-1" onClick={add} disabled={!newLabel.trim()}><Plus className="h-3.5 w-3.5" /> {t("capabilities.add")}</Button>
            </div>
          )}

          {canManage && ownerType === "profile" && (
            <div>
              <button onClick={() => setCvOpen((v) => !v)} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${cvOpen ? "rotate-180" : ""}`} /> {t("capabilities.cvToggle")}
              </button>
              {cvOpen && (
                <div className="mt-2 space-y-1.5">
                  <Textarea value={cv} onChange={(e) => setCv(e.target.value)} rows={6} maxLength={12000} placeholder={t("capabilities.cvPlaceholder")} className="text-sm" />
                  <p className="text-[11px] text-muted-foreground">{t("capabilities.cvPrivacy")}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
