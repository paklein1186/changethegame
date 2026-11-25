import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Wand2, Loader2, Plus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface Suggestion {
  id: string; label: string; category: string; kind: "explicit" | "implied"; reason: string | null; priority: number;
}

/** Needs detected in a quest (written ones and those this kind of project always runs into), for its managers to add or dismiss. */
export function NeedSuggestionsPanel({ questId }: { questId: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const currentUser = useCurrentUser();
  const [detecting, setDetecting] = useState(false);
  const key = ["need-suggestions", questId];

  const { data: canManage = false } = useQuery({
    queryKey: ["quest-manager", questId, currentUser.id],
    queryFn: async () => {
      const { data } = await (supabase as any).rpc("is_quest_manager", { _quest_id: questId, _uid: currentUser.id });
      return data === true;
    },
    enabled: !!currentUser.id && !!questId,
  });

  const { data: rows = [] } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("need_suggestions")
        .select("id, label, category, kind, reason, priority").eq("quest_id", questId).eq("status", "suggested")
        .order("priority", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Suggestion[];
    },
    enabled: canManage,
  });

  if (!canManage) return null;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: ["quest-needs", questId] });
    qc.invalidateQueries({ queryKey: ["opportunities"] });
  };
  const accept = async (id: string) => {
    const { error } = await (supabase as any).rpc("accept_need_suggestion", { _suggestion_id: id });
    if (error) toast.error(t("needSuggestions.failed")); else { toast.success(t("needSuggestions.added")); refresh(); }
  };
  const dismiss = async (id: string) => {
    const { error } = await (supabase as any).from("need_suggestions").update({ status: "dismissed" }).eq("id", id);
    if (error) toast.error(t("needSuggestions.failed")); else refresh();
  };
  const detect = async () => {
    setDetecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("opportunity-engine", { body: { mode: "quest", quest_id: questId } });
      if (error) throw error;
      toast.success(t("needSuggestions.detected", { count: data?.needs_suggested ?? 0 }));
      refresh();
    } catch {
      toast.error(t("needSuggestions.failed"));
    } finally {
      setDetecting(false);
    }
  };

  const groups: { kind: Suggestion["kind"]; items: Suggestion[] }[] = [
    { kind: "explicit", items: rows.filter((r) => r.kind === "explicit") },
    { kind: "implied", items: rows.filter((r) => r.kind === "implied") },
  ];

  return (
    <section className="rounded-2xl border border-dashed border-primary/30 bg-primary/[0.03] p-4 mb-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display font-semibold text-sm">{t("needSuggestions.title")}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{t("needSuggestions.subtitle")}</p>
        </div>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={detect} disabled={detecting}>
          {detecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
          {detecting ? t("needSuggestions.detecting") : t("needSuggestions.detect")}
        </Button>
      </div>
      {rows.length > 0 && (
        <div className="mt-3 space-y-3">
          {groups.filter((g) => g.items.length).map((g) => (
            <div key={g.kind}>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">{t(`needSuggestions.${g.kind}`)}</p>
              <ul className="space-y-1.5">
                {g.items.map((s) => (
                  <li key={s.id} className="rounded-lg border border-border bg-card p-2.5 flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {s.label}{" "}
                        <Badge variant="outline" className="text-[10px] ml-1">{t(`matchOpportunities.category.${s.category}`, s.category)}</Badge>
                        {s.priority === 1 && <Badge className="text-[10px] ml-1">{t("needSuggestions.urgent")}</Badge>}
                      </p>
                      {s.reason && <p className="text-xs text-muted-foreground mt-0.5">{s.reason}</p>}
                    </div>
                    <Button size="sm" className="h-7 text-xs gap-1 shrink-0" onClick={() => accept(s.id)}><Plus className="h-3.5 w-3.5" /> {t("needSuggestions.add")}</Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs shrink-0" onClick={() => dismiss(s.id)} aria-label={t("needSuggestions.dismiss")}><X className="h-3.5 w-3.5" /></Button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
