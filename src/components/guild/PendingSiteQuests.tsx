import { useTranslation } from "react-i18next";
import { useState } from "react";
import { CheckCircle2, Lock, Loader2, Compass, Hourglass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";

// Salle d'attente des missions d'un site partenaire (Trois-Tiers) : quêtes arrivées en brouillon, à valider (publiées
// pour les membres, selon leur niveau) ou à garder privées. Admins de la guilde seulement ; la base vérifie aussi.
interface Pending {
  quest_id: string; title: string; description: string | null; access_min_level: string | null;
  website_url: string | null; source: string; created_at: string;
}

export function PendingSiteQuests({ guildId, isAdmin }: { guildId: string; isAdmin: boolean }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [processing, setProcessing] = useState<string | null>(null);

  const { data: pending = [], isLoading } = useQuery({
    queryKey: ["pending-site-quests", guildId],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("guild_pending_site_quests", { _guild_id: guildId });
      if (error) throw error;
      return (data ?? []) as Pending[];
    },
  });

  const decide = async (questId: string, decision: "validated" | "private") => {
    setProcessing(questId);
    const { error } = await (supabase.rpc as any)("decide_site_quest", { _quest_id: questId, _decision: decision });
    if (error) {
      toast({ title: t("uiPendingSiteQuests.error"), description: error.message, variant: "destructive" });
    } else {
      toast({ title: decision === "validated" ? t("uiPendingSiteQuests.validated") : t("uiPendingSiteQuests.keptPrivate") });
      qc.invalidateQueries({ queryKey: ["pending-site-quests", guildId] });
      qc.invalidateQueries({ queryKey: ["quests-for-guild", guildId] });
    }
    setProcessing(null);
  };

  if (!isAdmin || isLoading || pending.length === 0) return null;

  return (
    <Card className="border-sky-200 bg-sky-50/50 dark:bg-sky-950/20 dark:border-sky-800 mb-3">
      <CardContent className="p-4 space-y-3">
        <h4 className="font-display font-semibold text-sm flex items-center gap-2">
          <Hourglass className="h-4 w-4 text-sky-600" />
          {t("uiPendingSiteQuests.title")}
          <Badge variant="outline" className="text-[10px] text-sky-700 border-sky-300">{pending.length}</Badge>
        </h4>
        <p className="text-xs text-muted-foreground">{t("uiPendingSiteQuests.intro")}</p>
        <div className="space-y-2">
          {pending.map((p) => (
            <div key={p.quest_id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-background p-3">
              <div className="min-w-0 flex-1">
                <Link to={`/quests/${p.quest_id}`} className="text-sm font-medium hover:text-primary transition-colors block truncate">
                  <Compass className="h-3.5 w-3.5 inline mr-1.5 text-muted-foreground" />{p.title}
                </Link>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t("uiPendingSiteQuests.level", { level: p.access_min_level ?? "N2" })}
                  {p.website_url && <> · <a href={p.website_url} target="_blank" rel="noopener noreferrer" className="underline">{t("uiPendingSiteQuests.openOnSite")}</a></>}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Button size="sm" variant="outline" className="h-7 text-xs text-emerald-600 border-emerald-300 hover:bg-emerald-50"
                  onClick={() => decide(p.quest_id, "validated")} disabled={processing === p.quest_id}>
                  {processing === p.quest_id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
                  {t("uiPendingSiteQuests.validate")}
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs"
                  onClick={() => decide(p.quest_id, "private")} disabled={processing === p.quest_id}>
                  <Lock className="h-3 w-3 mr-1" />{t("uiPendingSiteQuests.keepPrivate")}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
