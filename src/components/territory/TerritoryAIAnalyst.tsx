import i18n from "@/i18n/config";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain, Sparkles, Shield, TrendingUp, AlertTriangle,
  Search as SearchIcon, Compass, Loader2, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import ReactMarkdown from "react-markdown";

interface Props {
  territoryId: string;
  territoryName: string;
}

const AI_ACTIONS = [
  { key: "summarize", get label() { return i18n.t("uiTerritoryAIAnalyst.summarizeThisTerritory"); }, icon: Brain, prompt: "Provide a comprehensive summary of this territory based on all available memory and data." },
  { key: "strengths", get label() { return i18n.t("uiTerritoryAIAnalyst.strengthsWeaknesses"); }, icon: Shield, prompt: "Analyze the strengths and weaknesses of this territory based on all available intelligence." },
  { key: "opportunities", get label() { return i18n.t("uiTerritoryAIAnalyst.strategicOpportunities"); }, icon: Sparkles, prompt: "Identify strategic opportunities for growth, collaboration, and impact in this territory." },
  { key: "missing", get label() { return i18n.t("uiTerritoryAIAnalyst.highlightMissingInfo"); }, icon: SearchIcon, prompt: "Identify gaps in the territory's knowledge base — what information is missing and should be gathered?" },
  { key: "resilience", get label() { return i18n.t("uiTerritoryAIAnalyst.resilienceAnalysis"); }, icon: TrendingUp, prompt: "Generate a resilience analysis covering economic, social, and environmental dimensions." },
  { key: "quests", get label() { return i18n.t("uiTerritoryAIAnalyst.suggestQuests"); }, icon: Compass, prompt: "Suggest concrete quests/missions that could be launched based on territorial context and needs." },
  { key: "risks", get label() { return i18n.t("uiTerritoryAIAnalyst.riskAssessment"); }, icon: AlertTriangle, prompt: "Assess current and emerging risks for this territory across multiple dimensions." },
] as const;

export function TerritoryAIAnalyst({ territoryId, territoryName }: Props) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const { toast } = useToast();

  const runAction = async (actionKey: string, prompt: string) => {
    setLoading(true);
    setActiveAction(actionKey);
    setResponse(null);
    try {
      const { data, error } = await supabase.functions.invoke("territory-intelligence", {
        body: { territoryId, analysisPrompt: prompt },
      });
      if (error) throw error;
      if (data?.error) {
        toast({ title: t("uiTerritoryAIAnalyst.aiUnavailable"), description: data.error, variant: "destructive" });
        setResponse(null);
      } else if (data?.analysisResponse) {
        setResponse(data.analysisResponse);
      } else if (data?.summary) {
        // Fallback to structured response format
        setResponse(data.summary);
      } else {
        setResponse(JSON.stringify(data, null, 2));
      }
    } catch (e: any) {
      toast({ title: t("uiTerritoryAIAnalyst.aiError"), description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-4 h-fit lg:sticky lg:top-4 max-h-[calc(100vh-2rem)] overflow-y-auto">
      <div className="flex items-center gap-2">
        <Brain className="h-5 w-5 text-primary" />
        <h3 className="font-display font-semibold text-sm">{t("uiTerritoryAIAnalyst.aiTerritoryAnalyst")}</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        {t("uiTerritoryAIAnalyst.askTheAiToAnalyze")} {territoryName} {t("uiTerritoryAIAnalyst.usingAllAvailableMemoryAndData")}
      </p>

      <div className="space-y-1.5">
        {AI_ACTIONS.map(({ key, label, icon: Icon, prompt }) => (
          <Button
            key={key}
            variant={activeAction === key ? "default" : "ghost"}
            size="sm"
            className="w-full justify-start text-xs h-8"
            onClick={() => runAction(key, prompt)}
            disabled={loading}
          >
            <Icon className="h-3.5 w-3.5 mr-2 shrink-0" />
            {label}
          </Button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {loading && (
          <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-xs text-muted-foreground ml-2">{t("uiTerritoryAIAnalyst.analyzing")}</span>
          </motion.div>
        )}

        {!loading && response && (
          <motion.div key="response" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <ScrollArea className="max-h-[60vh]">
              <div className="prose prose-sm dark:prose-invert max-w-none text-xs leading-relaxed">
                <ReactMarkdown>{response}</ReactMarkdown>
              </div>
            </ScrollArea>
            <p className="text-[10px] text-muted-foreground mt-2">
              {t("uiTerritoryAIAnalyst.basedOnTerritoryMemoryEntriesAnd")}
            </p>
            <div className="flex justify-end mt-1">
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => activeAction && runAction(activeAction, AI_ACTIONS.find(a => a.key === activeAction)!.prompt)}>
                <RefreshCw className="h-3 w-3 mr-1" /> {t("uiTerritoryAIAnalyst.regenerate")}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
