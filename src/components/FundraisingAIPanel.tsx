import i18n from "@/i18n/config";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { Sparkles, FileText, MessageSquare, Target, ArrowLeftRight, Share2, Loader2, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import ReactMarkdown from "react-markdown";

type FundraisingAction = "pitch" | "funder_message" | "suggest_goal" | "convert" | "social_summary";

interface QuestData {
  title: string;
  description: string | null;
  credit_budget: number;
  credit_reward: number;
  escrow_credits: number;
  funding_goal_credits: number | null;
  price_fiat: number;
  price_currency: string;
  status: string;
  allow_fundraising: boolean;
}

interface FundraisingAIPanelProps {
  quest: QuestData;
}

const actions: { key: FundraisingAction; label: string; icon: typeof FileText; desc: string }[] = [
  { key: "pitch", get label() { return i18n.t("uiFundraisingAIPanel.generatePitch"); }, icon: FileText, get desc() { return i18n.t("uiFundraisingAIPanel.compellingFundraisingPitchFromQuestDescription"); } },
  { key: "funder_message", get label() { return i18n.t("uiFundraisingAIPanel.writeToFunders"); }, icon: MessageSquare, get desc() { return i18n.t("uiFundraisingAIPanel.personalizedOutreachMessageForPotentialSupporters"); } },
  { key: "suggest_goal", get label() { return i18n.t("uiFundraisingAIPanel.suggestCreditGoal"); }, icon: Target, get desc() { return i18n.t("uiFundraisingAIPanel.aiRecommendedRealisticFundingTarget"); } },
  { key: "convert", get label() { return i18n.t("uiFundraisingAIPanel.creditsFiat"); }, icon: ArrowLeftRight, get desc() { return i18n.t("uiFundraisingAIPanel.convertBetweenCreditsAndEur"); } },
  { key: "social_summary", get label() { return i18n.t("uiFundraisingAIPanel.socialSummary"); }, icon: Share2, get desc() { return i18n.t("uiFundraisingAIPanel.readyToSharePostsForSocial"); } },
];

export function FundraisingAIPanel({ quest }: FundraisingAIPanelProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState<FundraisingAction | null>(null);
  const [results, setResults] = useState<Record<string, any>>({});
  const [copied, setCopied] = useState<string | null>(null);
  const { toast } = useToast();

  const run = async (action: FundraisingAction) => {
    setLoading(action);
    try {
      const { data, error } = await supabase.functions.invoke("fundraising-ai", {
        body: { action, quest },
      });
      if (error) throw error;
      if (data?.error) {
        toast({ title: t("uiFundraisingAIPanel.aiUnavailable"), description: data.error, variant: "destructive" });
        return;
      }
      setResults(prev => ({ ...prev, [action]: data.result }));
    } catch (e: any) {
      toast({ title: t("uiFundraisingAIPanel.failed"), description: e.message, variant: "destructive" });
    } finally {
      setLoading(null);
    }
  };

  const copyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    toast({ title: t("uiFundraisingAIPanel.copied") });
    setTimeout(() => setCopied(null), 2000);
  };

  const CopyBtn = ({ text, label }: { text: string; label: string }) => (
    <Button variant="ghost" size="sm" className="h-7" onClick={() => copyText(text, label)}>
      {copied === label ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
    </Button>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="h-5 w-5 text-primary" />
        <h3 className="font-display font-semibold">{t("uiFundraisingAIPanel.fundraisingAi")}</h3>
      </div>
      <p className="text-sm text-muted-foreground">{t("uiFundraisingAIPanel.aiPoweredToolsToHelpYou")}</p>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {actions.map(a => (
          <Button
            key={a.key}
            variant="outline"
            className="h-auto py-3 px-4 flex flex-col items-start text-left gap-1"
            onClick={() => run(a.key)}
            disabled={loading !== null}
          >
            <span className="flex items-center gap-2 font-medium text-sm">
              {loading === a.key ? <Loader2 className="h-4 w-4 animate-spin" /> : <a.icon className="h-4 w-4" />}
              {a.label}
            </span>
            <span className="text-xs text-muted-foreground font-normal">{a.desc}</span>
          </Button>
        ))}
      </div>

      {/* Pitch Result */}
      {results.pitch && (
        <Card className="p-4 space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">{results.pitch.headline}</h4>
            <CopyBtn text={results.pitch.pitch} label="pitch" />
          </div>
          <div className="text-sm text-muted-foreground prose prose-sm max-w-none">
            <ReactMarkdown>{results.pitch.pitch}</ReactMarkdown>
          </div>
        </Card>
      )}

      {/* Funder Message Result */}
      {results.funder_message && (
        <Card className="p-4 space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">{t("uiFundraisingAIPanel.messageToFunders")}</h4>
            <CopyBtn text={`Subject: ${results.funder_message.subject}\n\n${results.funder_message.message}\n\n${results.funder_message.closing}`} label="funder" />
          </div>
          <p className="text-xs font-medium text-primary">{t("uiFundraisingAIPanel.subject")} {results.funder_message.subject}</p>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{results.funder_message.message}</p>
          <p className="text-sm italic text-muted-foreground">{results.funder_message.closing}</p>
        </Card>
      )}

      {/* Suggest Goal Result */}
      {results.suggest_goal && (
        <Card className="p-4 space-y-3">
          <h4 className="text-sm font-semibold">{t("uiFundraisingAIPanel.suggestedCreditGoal")}</h4>
          <div className="grid grid-cols-2 gap-3">
            <div className="text-center p-3 rounded-md bg-primary/10">
              <p className="text-xs text-muted-foreground">{t("uiFundraisingAIPanel.recommended")}</p>
              <p className="text-xl font-bold text-primary">{results.suggest_goal.suggested_credits} {t("uiFundraisingAIPanel.credits")}</p>
            </div>
            <div className="text-center p-3 rounded-md bg-muted/50">
              <p className="text-xs text-muted-foreground">{t("uiFundraisingAIPanel.stretchGoal")}</p>
              <p className="text-xl font-bold">{results.suggest_goal.stretch_goal_credits} {t("uiFundraisingAIPanel.credits")}</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">{results.suggest_goal.reasoning}</p>
          {results.suggest_goal.breakdown?.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium">{t("uiFundraisingAIPanel.breakdown")}</p>
              {results.suggest_goal.breakdown.map((b: any, i: number) => (
                <div key={i} className="flex justify-between text-xs text-muted-foreground">
                  <span>{b.item}</span>
                  <span className="font-medium">{b.credits} {t("uiFundraisingAIPanel.credits")}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Convert Result */}
      {results.convert && (
        <Card className="p-4 space-y-2">
          <h4 className="text-sm font-semibold">{t("uiFundraisingAIPanel.creditsEurConversion")}</h4>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-2 rounded-md bg-muted/50">
              <p className="text-[10px] text-muted-foreground">{t("uiFundraisingAIPanel.budget")}</p>
              <p className="text-sm font-bold">€{results.convert.credit_budget_eur?.toFixed(2)}</p>
            </div>
            <div className="p-2 rounded-md bg-muted/50">
              <p className="text-[10px] text-muted-foreground">{t("uiFundraisingAIPanel.fundingGoal")}</p>
              <p className="text-sm font-bold">€{results.convert.funding_goal_eur?.toFixed(2)}</p>
            </div>
            <div className="p-2 rounded-md bg-muted/50">
              <p className="text-[10px] text-muted-foreground">{t("uiFundraisingAIPanel.fiatCredits")}</p>
              <p className="text-sm font-bold">{results.convert.fiat_price_credits} Cr</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">{results.convert.summary}</p>
          <p className="text-xs italic text-primary">{results.convert.tip}</p>
        </Card>
      )}

      {/* Social Summary Result */}
      {results.social_summary && (
        <Card className="p-4 space-y-3">
          <h4 className="text-sm font-semibold">{t("uiFundraisingAIPanel.socialMediaContent")}</h4>
          <div className="space-y-3">
            <div className="rounded-md border border-border p-3">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-medium">{t("uiFundraisingAIPanel.twitterX")}</p>
                <CopyBtn text={results.social_summary.twitter} label="twitter" />
              </div>
              <p className="text-sm text-muted-foreground">{results.social_summary.twitter}</p>
            </div>
            <div className="rounded-md border border-border p-3">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-medium">LinkedIn</p>
                <CopyBtn text={results.social_summary.linkedin} label="linkedin" />
              </div>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{results.social_summary.linkedin}</p>
            </div>
            <div className="rounded-md border border-border p-3">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-medium">{t("uiFundraisingAIPanel.shortPitch")}</p>
                <CopyBtn text={results.social_summary.short_pitch} label="short" />
              </div>
              <p className="text-sm text-muted-foreground">{results.social_summary.short_pitch}</p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
