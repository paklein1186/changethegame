import i18n from "@/i18n/config";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Eye, Pencil, Database, Users, Info } from "lucide-react";

interface Props {
  agent: any;
}

const TRUST_THRESHOLDS = {
  view_public: 0,
  view_restricted: 60,
  view_private: 75,
  propose_quests: 20,
  create_posts: 40,
  create_entities: 60,
  modify_data: 80,
  crawl_public: 0,
  crawl_restricted: 70,
  chat_ingestion: 60,
  act_on_behalf: 80,
};

const PERMISSION_GROUPS = [
  {
    label: "READ",
    icon: Eye,
    items: [
      { key: "view_public", get label() { return i18n.t("uiAgentPermissionsTab.viewPublicContent"); }, threshold: 0 },
      { key: "view_restricted", get label() { return i18n.t("uiAgentPermissionsTab.viewRestrictedContent"); }, threshold: 60, note: "Needs trust ≥60" },
      { key: "view_private", get label() { return i18n.t("uiAgentPermissionsTab.viewPrivateDashboards"); }, threshold: 75, note: "Needs trust ≥75 & guild approval" },
    ],
  },
  {
    label: "WRITE",
    icon: Pencil,
    items: [
      { key: "propose_quests", get label() { return i18n.t("uiAgentPermissionsTab.proposeQuestsLimited5Day"); }, threshold: 20 },
      { key: "create_posts", get label() { return i18n.t("uiAgentPermissionsTab.createPosts"); }, threshold: 40 },
      { key: "create_entities", get label() { return i18n.t("uiAgentPermissionsTab.createEntitiesNaturalSystemsItems"); }, threshold: 60 },
      { key: "modify_data", label: "Modify Data", threshold: 80 },
    ],
  },
  {
    label: "DATA INGESTION",
    icon: Database,
    items: [
      { key: "crawl_public", get label() { return i18n.t("uiAgentPermissionsTab.crawlPublicPages2CreditsPage"); }, threshold: 0 },
      { key: "crawl_restricted", label: "Crawl Restricted Pages", threshold: 70, note: "Needs trust ≥70" },
      { key: "chat_ingestion", get label() { return i18n.t("uiAgentPermissionsTab.connectToSlackDiscordForChat"); }, threshold: 60 },
    ],
  },
  {
    label: "DELEGATION",
    icon: Users,
    items: [
      { key: "act_on_behalf", get label() { return i18n.t("uiAgentPermissionsTab.actOnBehalfOfOwner"); }, threshold: 80, note: "Needs review" },
    ],
  },
];

const TRUST_RATE_MULTIPLIERS = [
  { range: "0–20", multiplier: "×1.5", label: "Untrusted" },
  { range: "20–40", multiplier: "×1.2", label: "Guest Agent" },
  { range: "40–60", multiplier: "×1.0", get label() { return i18n.t("uiAgentPermissionsTab.memberAgent"); } },
  { range: "60–80", multiplier: "×0.8", label: "Trusted Agent" },
  { range: "80–100", multiplier: "×0.5", label: "Autonomous" },
];

export default function AgentPermissionsTab({ agent }: Props) {
  const { t } = useTranslation();
  const { data: trustScore } = useQuery({
    queryKey: ["agent-trust-score", agent.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("agent_trust_scores" as any)
        .select("total_score")
        .eq("agent_id", agent.id)
        .maybeSingle();
      return data as any;
    },
  });

  const trust = trustScore ? Number(trustScore.total_score) : 50;

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      {/* Permissions Matrix */}
      <div className="lg:col-span-2 space-y-4">
        {PERMISSION_GROUPS.map((group) => (
          <Card key={group.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <group.icon className="h-4 w-4" /> {group.label}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {group.items.map((item) => {
                const allowed = trust >= item.threshold;
                return (
                  <div key={item.key} className="flex items-center gap-3">
                    <Checkbox checked={allowed} disabled className="pointer-events-none" />
                    <div className="flex-1">
                      <span className={`text-sm ${allowed ? "text-foreground" : "text-muted-foreground"}`}>
                        {item.label}
                      </span>
                      {item.note && !allowed && (
                        <span className="text-[10px] text-muted-foreground ml-2">({item.note})</span>
                      )}
                    </div>
                    <Badge variant={allowed ? "default" : "secondary"} className="text-[9px]">
                      ≥{item.threshold}
                    </Badge>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Sidebar: Trust thresholds + Rate multipliers */}
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Info className="h-4 w-4" /> Current Trust
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-primary">{trust.toFixed(0)}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {t("uiAgentPermissionsTab.higherTrustUnlocksMorePermissionsAnd")}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Trust → Rate Multipliers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {TRUST_RATE_MULTIPLIERS.map((row) => {
                const [min] = row.range.split("–").map(Number);
                const [, max] = row.range.split("–").map(Number);
                const active = trust >= min && trust < max;
                return (
                  <div key={row.range} className={`flex items-center justify-between text-xs p-1.5 rounded ${active ? "bg-primary/10 font-semibold" : ""}`}>
                    <span>{row.range}</span>
                    <span>{row.label}</span>
                    <span className="font-mono">{row.multiplier}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Permission Levels</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between"><span className="text-destructive">0–20</span><span>{t("uiAgentPermissionsTab.onlyPublicCrawlNoWrite")}</span></div>
              <div className="flex justify-between"><span className="text-orange-500">20–40</span><span>{t("uiAgentPermissionsTab.draftQuestsLimitedCrawl")}</span></div>
              <div className="flex justify-between"><span className="text-yellow-600">40–60</span><span>Restricted content, suggest</span></div>
              <div className="flex justify-between"><span className="text-primary">60–80</span><span>{t("uiAgentPermissionsTab.privateDataCreateUnderReview")}</span></div>
              <div className="flex justify-between"><span className="text-emerald-500">80–100</span><span>Semi-autonomous, modify data</span></div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
