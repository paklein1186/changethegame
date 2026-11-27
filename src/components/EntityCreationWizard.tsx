import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { translateTopicName } from "@/lib/entityLabels";
import { autoFollowEntity } from "@/hooks/useFollow";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield, CircleDot, Building2, ChevronRight, ChevronLeft, Sparkles,
  Loader2, MapPin, Hash, Lock, Users, Eye, ArrowRight, Check, Globe, PenLine
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { ImageUpload } from "@/components/ImageUpload";
import { useToast } from "@/hooks/use-toast";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useTopics, useTerritories, useCreateGuild, useCreatePod, useQuests } from "@/hooks/useSupabaseData";
import { supabase } from "@/integrations/supabase/client";
import { SearchableTagPicker } from "@/components/SearchableTagPicker";
import { AddTerritoryDialog } from "@/components/AddTerritoryDialog";
import { SUGGESTED_DEFAULT_ROLES } from "@/lib/permissions";
import { GuildType, GuildJoinPolicy, PodType, CompanySize } from "@/types/enums";
import { normalizeUrl } from "@/components/SocialLinks";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

type EntityKind = "guild" | "pod" | "company";

interface EntityCreationWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialKind?: EntityKind;
}

const STEPS = ["kind", "source", "details", "classify", "policy", "branding", "review"] as const;
type Step = typeof STEPS[number];

const STEP_LABEL_KEYS: Record<Step, string> = {
  kind: "wizard.chooseType",
  source: "wizard.getStarted",
  details: "wizard.nameAndDetails",
  classify: "wizard.topicsAndTerritories",
  policy: "wizard.accessAndVisibility",
  branding: "wizard.branding",
  review: "wizard.reviewAndCreate",
};

const KIND_CONFIG: Record<EntityKind, { icon: typeof Shield; labelKey: string; descKey: string; color: string }> = {
  guild: { icon: Shield, labelKey: "wizard.guild", descKey: "wizard.guildDesc", color: "text-emerald-600" },
  pod: { icon: CircleDot, labelKey: "wizard.pod", descKey: "wizard.podDesc", color: "text-blue-600" },
  company: { icon: Building2, labelKey: "wizard.company", descKey: "wizard.companyDesc", color: "text-amber-600" },
};

export function EntityCreationWizard({ open, onOpenChange, initialKind }: EntityCreationWizardProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const currentUser = useCurrentUser();
  const qc = useQueryClient();
  const { data: topicsData } = useTopics();
  const { data: territoriesData } = useTerritories();
  const { data: questsData } = useQuests();
  const createGuildMut = useCreateGuild();
  const createPodMut = useCreatePod();

  const topics = topicsData ?? [];
  const territories = territoriesData ?? [];
  const quests = questsData ?? [];

  // Wizard state
  const [kind, setKind] = useState<EntityKind | null>(initialKind ?? null);
  const [step, setStep] = useState<Step>(initialKind ? "source" : "kind");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  // Source step
  const [sourceUrl, setSourceUrl] = useState("");
  const [scraping, setScraping] = useState(false);
  const [scraped, setScraped] = useState(false);

  // Entity fields
  const [name, setName] = useState("");
  const [mission, setMission] = useState("");
  const [description, setDescription] = useState("");
  // Guild-specific
  const [guildType, setGuildType] = useState<GuildType>(GuildType.GUILD);
  // Pod-specific
  const [podType, setPodType] = useState<PodType>(PodType.STUDY_POD);
  const [questId, setQuestId] = useState("none");
  const [podTopicId, setPodTopicId] = useState("none");
  // Company-specific
  const [orgType, setOrgType] = useState("");
  const [companySize, setCompanySize] = useState<CompanySize>(CompanySize.SME);
  // Shared
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([]);
  const [selectedTerritoryIds, setSelectedTerritoryIds] = useState<string[]>([]);
  const [joinPolicy, setJoinPolicy] = useState<string>(GuildJoinPolicy.OPEN);
  const [universeVisibility, setUniverseVisibility] = useState("both");
  const [isDraft, setIsDraft] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | undefined>();
  const [bannerUrl, setBannerUrl] = useState<string | undefined>();
  const [scrapedTopicIds, setScrapedTopicIds] = useState<string[]>([]);
  const [scrapedTerritoryIds, setScrapedTerritoryIds] = useState<string[]>([]);

  const resetState = useCallback(() => {
    setKind(initialKind ?? null);
    setStep(initialKind ? "source" : "kind");
    setName(""); setMission(""); setDescription("");
    setSourceUrl(""); setScraping(false); setScraped(false);
    setGuildType(GuildType.GUILD); setPodType(PodType.STUDY_POD);
    setQuestId("none"); setPodTopicId("none");
    setOrgType(""); setCompanySize(CompanySize.SME);
    setSelectedTopicIds([]); setSelectedTerritoryIds([]);
    setScrapedTopicIds([]); setScrapedTerritoryIds([]);
    setJoinPolicy(GuildJoinPolicy.OPEN); setUniverseVisibility("both");
    setIsDraft(false); setLogoUrl(undefined); setBannerUrl(undefined);
    setIsSubmitting(false); setAiLoading(false);
  }, [initialKind]);

  const handleOpenChange = (open: boolean) => {
    if (!open) resetState();
    onOpenChange(open);
  };

  // Step navigation
  const getSteps = (): Step[] => {
    if (!kind) return ["kind"];
    if (kind === "pod") {
      return ["kind", "source", "details", "policy", "review"];
    }
    return ["kind", "source", "details", "classify", "policy", "branding", "review"];
  };

  const activeSteps = getSteps();
  const currentIndex = activeSteps.indexOf(step);
  const canGoBack = currentIndex > 0;
  const canGoNext = currentIndex < activeSteps.length - 1;
  const isLastStep = currentIndex === activeSteps.length - 1;

  const goNext = () => { if (canGoNext) setStep(activeSteps[currentIndex + 1]); };
  const goBack = () => { if (canGoBack) setStep(activeSteps[currentIndex - 1]); };

  const selectKind = (k: EntityKind) => {
    setKind(k);
    setStep("source");
  };

  // URL scraping
  const handleScrape = async () => {
    if (!sourceUrl.trim()) return;
    setScraping(true);
    try {
      let urlToScrape = sourceUrl.trim();
      if (!/^https?:\/\//i.test(urlToScrape)) {
        urlToScrape = "https://" + urlToScrape;
      }
      const { data, error } = await supabase.functions.invoke("scrape-entity", {
        body: { url: urlToScrape },
      });
      if (error) throw error;
      if (data) {
        if (data.name && !name) setName(data.name);
        if (data.description && !description) setDescription(data.description);
        if (data.logo) setLogoUrl(data.logo);

        // Match suggested topic keywords against existing topics (fuzzy name match)
        if (data.suggestedTopics?.length && topics.length) {
          const matchedTopicIds = topics
            .filter(t => data.suggestedTopics.some((kw: string) =>
              t.name.toLowerCase().includes(kw.toLowerCase()) ||
              kw.toLowerCase().includes(t.name.toLowerCase())
            ))
            .map(t => t.id);
          if (matchedTopicIds.length) {
            setSelectedTopicIds(prev => [...new Set([...prev, ...matchedTopicIds])]);
            setScrapedTopicIds(matchedTopicIds);
          }
        }

        // Match suggested territory keywords against existing territories
        if (data.suggestedTerritories?.length && territories.length) {
          const matchedTerritoryIds = territories
            .filter(t => data.suggestedTerritories.some((kw: string) =>
              t.name.toLowerCase().includes(kw.toLowerCase()) ||
              kw.toLowerCase().includes(t.name.toLowerCase())
            ))
            .map(t => t.id);
          if (matchedTerritoryIds.length) {
            setSelectedTerritoryIds(prev => [...new Set([...prev, ...matchedTerritoryIds])]);
            setScrapedTerritoryIds(matchedTerritoryIds);
          }
        }

        setScraped(true);
        const pages = data.pagesVisited ?? 1;
        const pagesMsg = pages > 1 ? `Visited ${pages} pages. ` : "";
        const matched = (data.suggestedTopics?.length || data.suggestedTerritories?.length)
          ? "Topics & territories were pre-selected too."
          : "";
        toast({ title: t("uiEntityCreationWizard.websiteDataImported"), description: `${pagesMsg}${matched || "Review and adjust the pre-filled fields."}` });
      }
    } catch (err) {
      console.error("Scrape error:", err);
      toast({ title: t("uiEntityCreationWizard.couldNotExtractData"), description: t("uiEntityCreationWizard.youCanFillInTheDetails"), variant: "destructive" });
    } finally {
      setScraping(false);
    }
  };

  const handleSkipSource = () => {
    setScraped(false);
    goNext();
  };

  const handleScrapeAndContinue = async () => {
    await handleScrape();
    goNext();
  };

  // AI Assist
  const handleAiAssist = async () => {
    if (!mission.trim() || !kind) return;
    setAiLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("home-assistant", {
        body: {
          message: `I'm creating a ${t(KIND_CONFIG[kind].labelKey)} on a collaborative ecosystem platform. 
My mission/purpose: "${mission}"

Based on this, suggest:
1. A concise name (max 60 chars)
2. A compelling description (max 300 chars) that would attract members
3. A sector/category keyword (max 30 chars)

Respond ONLY in this exact JSON format, no markdown:
{"name": "...", "description": "...", "sector": "..."}`
        }
      });

      if (error) throw error;

      if (data) {
        // home-assistant returns parsed JSON with a "message" field containing the AI text
        let responseText = "";
        if (typeof data === "string") responseText = data;
        else if (data.message) responseText = data.message;
        else if (data.choices?.[0]?.message?.content) responseText = data.choices[0].message.content;

        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.name && !name) setName(parsed.name);
          if (parsed.description) setDescription(parsed.description);
          toast({ title: t("uiEntityCreationWizard.aiSuggestionsApplied"), description: t("uiEntityCreationWizard.reviewAndAdjustThePreFilled") });
        }
      }
    } catch (err) {
      console.error("AI assist error:", err);
      toast({ title: t("uiEntityCreationWizard.aiAssistUnavailable"), description: t("uiEntityCreationWizard.youCanFillInTheDetails"), variant: "destructive" });
    } finally {
      setAiLoading(false);
    }
  };

  // Submit
  const handleSubmit = async () => {
    if (!kind || !name.trim()) return;
    setIsSubmitting(true);

    try {
      if (kind === "guild") {
        const guild = await createGuildMut.mutateAsync({
          name: name.trim(),
          description: (description || mission).trim() || undefined,
          type: guildType,
          isDraft,
        });
        if (selectedTopicIds.length > 0) {
          await supabase.from("guild_topics").insert(
            selectedTopicIds.map(tid => ({ guild_id: guild.id, topic_id: tid }))
          );
        }
        if (selectedTerritoryIds.length > 0) {
          await supabase.from("guild_territories").insert(
            selectedTerritoryIds.map(tid => ({ guild_id: guild.id, territory_id: tid }))
          );
        }
        await supabase.from("guilds").update({
          join_policy: joinPolicy as any,
          universe_visibility: universeVisibility,
          logo_url: logoUrl || guild.logo_url,
          banner_url: bannerUrl || null,
        }).eq("id", guild.id);

        // Create suggested default roles
        const rolesToInsert = SUGGESTED_DEFAULT_ROLES.map((r) => ({
          entity_type: "guild",
          entity_id: guild.id,
          name: r.name,
          color: r.color,
          is_default: r.is_default,
          sort_order: r.sort_order,
        }));
        await supabase.from("entity_roles").insert(rolesToInsert as any);

        // Assign "Source" role to the creator
        const { data: createdRoles } = await supabase
          .from("entity_roles")
          .select("id")
          .eq("entity_type", "guild")
          .eq("entity_id", guild.id)
          .eq("name", "Source")
          .eq("is_default", true)
          .single();
        if (createdRoles && currentUser.id) {
          await supabase.from("entity_member_roles").insert({
            entity_role_id: createdRoles.id,
            user_id: currentUser.id,
          } as any);
        }

        // Create default discussion room
        await supabase.from("discussion_rooms").insert({
          scope_type: "GUILD",
          scope_id: guild.id,
          name: "General",
          description: "Default discussion room",
          audience_type: "MEMBERS",
          can_post_audience_type: "MEMBERS",
          can_reply_audience_type: "MEMBERS",
          can_manage_audience_type: "ADMINS_ONLY",
          created_by_user_id: currentUser.id,
          is_default: true,
          sort_order: 0,
        } as any);

        toast({ title: t("uiEntityCreationWizard.guildCreated"), description: `${name} is ready.` });
        handleOpenChange(false);
        navigate(`/guilds/${guild.id}`);
      } else if (kind === "pod") {
        const pod = await createPodMut.mutateAsync({
          name: name.trim(),
          description: (description || mission).trim() || undefined,
          type: podType,
          questId: podType === PodType.QUEST_POD && questId !== "none" ? questId : undefined,
          topicId: podType === PodType.STUDY_POD && podTopicId !== "none" ? podTopicId : undefined,
          startDate: undefined,
          endDate: undefined,
          isDraft,
        });
        await supabase.from("pods").update({
          join_policy: joinPolicy as any,
          universe_visibility: universeVisibility,
          image_url: logoUrl || null,
        }).eq("id", pod.id);

        toast({ title: t("uiEntityCreationWizard.podCreated"), description: `${name} is ready.` });
        handleOpenChange(false);
        navigate(`/pods/${pod.id}`);
      } else if (kind === "company") {
        const { data: newCompany, error } = await supabase
          .from("companies")
          .insert({
            name: name.trim(),
            description: (description || mission).trim() || null,
            org_type: orgType || null,
            size: companySize,
            logo_url: logoUrl || null,
            banner_url: bannerUrl || null,
            contact_user_id: currentUser.id,
            universe_visibility: universeVisibility,
          })
          .select()
          .single();
        if (error) throw error;
        await supabase.from("company_members").insert({ company_id: newCompany.id, user_id: currentUser.id, role: "ADMIN" });
        await autoFollowEntity(currentUser.id, "COMPANY", newCompany.id);
        if (selectedTopicIds.length > 0) {
          await supabase.from("company_topics").insert(
            selectedTopicIds.map(tid => ({ company_id: newCompany.id, topic_id: tid }))
          );
        }
        if (selectedTerritoryIds.length > 0) {
          await supabase.from("company_territories").insert(
            selectedTerritoryIds.map(tid => ({ company_id: newCompany.id, territory_id: tid }))
          );
        }
        qc.invalidateQueries({ queryKey: ["my-companies"] });
        toast({ title: t("uiEntityCreationWizard.organizationCreated") });
        handleOpenChange(false);
        navigate(`/companies/${newCompany.id}`);
      }
    } catch (err: any) {
      toast({ title: t("uiEntityCreationWizard.error"), description: err.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleTopic = (id: string) => setSelectedTopicIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleTerritory = (id: string) => setSelectedTerritoryIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const renderStep = () => {
    switch (step) {
      case "kind":
        return (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{t("wizard.whatKind")}</p>
            {(Object.entries(KIND_CONFIG) as [EntityKind, typeof KIND_CONFIG["guild"]][]).map(([k, cfg]) => {
              const Icon = cfg.icon;
              return (
                <button
                  key={k}
                  onClick={() => selectKind(k)}
                  className={cn(
                    "w-full flex items-start gap-4 p-4 rounded-xl border transition-all text-left",
                    kind === k ? "border-primary bg-primary/5 shadow-sm" : "border-border bg-card hover:border-primary/30 hover:shadow-sm"
                  )}
                >
                  <div className={cn("p-2 rounded-lg bg-muted", cfg.color)}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-display font-semibold text-sm">{t(cfg.labelKey)}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">{t(cfg.descKey)}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 mt-1 text-muted-foreground shrink-0" />
                </button>
              );
            })}
          </div>
        );

      case "source":
        return (
          <div className="space-y-5">
            <div>
              <h3 className="font-display font-semibold mb-1">{t("wizard.haveWebsite")}</h3>
              <p className="text-xs text-muted-foreground mb-4">
                {t("wizard.pasteUrl")}
              </p>
              <div className="space-y-3">
                <div className="relative">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={sourceUrl}
                    onChange={e => setSourceUrl(e.target.value)}
                    placeholder="https://your-organization.com"
                    className="pl-10"
                    onKeyDown={e => { if (e.key === "Enter" && sourceUrl.trim()) handleScrapeAndContinue(); }}
                  />
                </div>
                <Button
                  className="w-full"
                  onClick={handleScrapeAndContinue}
                  disabled={!sourceUrl.trim() || scraping}
                >
                  {scraping ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> {t("wizard.importingData")}</>
                  ) : (
                    <><Globe className="h-4 w-4 mr-2" /> {t("wizard.importFromWebsite")}</>
                  )}
                </Button>
              </div>
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">{t("common.or")}</span>
              </div>
            </div>

            <Button
              variant="outline"
              className="w-full"
              onClick={handleSkipSource}
            >
              <PenLine className="h-4 w-4 mr-2" /> {t("wizard.fillManually")}
            </Button>
          </div>
        );

      case "details":
        return (
          <div className="space-y-4">
            {scraped && (
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-primary/5 border border-primary/20 text-xs text-primary">
                <Check className="h-3.5 w-3.5 shrink-0" />
                <span>{t("wizard.prefilledFromWebsite")}</span>
              </div>
            )}
            <div>
              <label className="text-sm font-medium mb-1 block">{t("uiEntityCreationWizard.name")}</label>
              <Input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder={t(KIND_CONFIG[kind!].labelKey)}
                maxLength={80}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">{t("uiEntityCreationWizard.description")}</label>
              <Textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder={t("uiEntityCreationWizard.whatDoesThisEntityDoWhat")}
                maxLength={500}
                className="resize-none min-h-[100px]"
              />
              <p className="text-xs text-muted-foreground mt-1 text-right">{description.length}/500</p>
            </div>
            {!scraped && description.trim().length > 20 && (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={handleAiAssist}
                disabled={aiLoading}
              >
                {aiLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                {aiLoading ? t("uiEntityCreationWizard.aiIsThinking") : t("uiEntityCreationWizard.letAiSuggestNameDescription")}
              </Button>
            )}
            {kind === "guild" && (
              <div>
                <label className="text-sm font-medium mb-1 block">{t("uiEntityCreationWizard.type")}</label>
                <Select value={guildType} onValueChange={v => setGuildType(v as GuildType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={GuildType.GUILD}>{t("uiEntityCreationWizard.guild")}</SelectItem>
                    <SelectItem value={GuildType.NETWORK}>{t("uiEntityCreationWizard.network")}</SelectItem>
                    <SelectItem value={GuildType.COLLECTIVE}>{t("uiEntityCreationWizard.collective")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            {kind === "pod" && (
              <>
                <div>
                  <label className="text-sm font-medium mb-1 block">{t("uiEntityCreationWizard.podType")}</label>
                  <Select value={podType} onValueChange={v => setPodType(v as PodType)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={PodType.QUEST_POD}>{t("uiEntityCreationWizard.questPod")}</SelectItem>
                      <SelectItem value={PodType.STUDY_POD}>{t("uiEntityCreationWizard.studyPod")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {podType === PodType.QUEST_POD && (
                  <div>
                    <label className="text-sm font-medium mb-1 block">{t("uiEntityCreationWizard.linkedQuest")}</label>
                    <Select value={questId} onValueChange={setQuestId}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{t("uiEntityCreationWizard.noQuest")}</SelectItem>
                        {quests.map(q => <SelectItem key={q.id} value={q.id}>{q.title}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {podType === PodType.STUDY_POD && (
                  <div>
                    <label className="text-sm font-medium mb-1 block">{t("uiEntityCreationWizard.topicFocus")}</label>
                    <Select value={podTopicId} onValueChange={setPodTopicId}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{t("uiEntityCreationWizard.noTopic")}</SelectItem>
                        {topics.map(topic => <SelectItem key={topic.id} value={topic.id}>{translateTopicName(topic.name, t)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </>
            )}
            {kind === "company" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium mb-1 block">{t("uiEntityCreationWizard.type")}</label>
                  <Select value={orgType} onValueChange={setOrgType}>
                    <SelectTrigger><SelectValue placeholder={t("uiEntityCreationWizard.selectType")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="public">{t("uiEntityCreationWizard.public")}</SelectItem>
                      <SelectItem value="private">{t("uiEntityCreationWizard.private")}</SelectItem>
                      <SelectItem value="ngo">NGO</SelectItem>
                      <SelectItem value="academics">{t("uiEntityCreationWizard.academics")}</SelectItem>
                      <SelectItem value="company">{t("uiEntityCreationWizard.company")}</SelectItem>
                      <SelectItem value="foundation">{t("uiEntityCreationWizard.foundation")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">{t("uiEntityCreationWizard.size")}</label>
                  <Select value={companySize} onValueChange={v => setCompanySize(v as CompanySize)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={CompanySize.MICRO}>{t("uiEntityCreationWizard.micro")}</SelectItem>
                      <SelectItem value={CompanySize.SME}>SME</SelectItem>
                      <SelectItem value={CompanySize.LARGE}>{t("uiEntityCreationWizard.large")}</SelectItem>
                      <SelectItem value={CompanySize.OTHER}>{t("uiEntityCreationWizard.other")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>
        );

      case "classify":
        return (
          <div className="space-y-5">
            {(scrapedTopicIds.length > 0 || scrapedTerritoryIds.length > 0) && (
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-primary/5 border border-primary/20 text-xs text-primary">
                <Sparkles className="h-3.5 w-3.5 shrink-0" />
                <span>{t("uiEntityCreationWizard.preSelectedBasedOnYourWebsite")}</span>
              </div>
            )}
            <SearchableTagPicker
              label={t("uiEntityCreationWizard.topics")}
              items={topics.map(topic => ({
                id: topic.id,
                name: topic.name,
                suggested: scrapedTopicIds.includes(topic.id),
              }))}
              selectedIds={selectedTopicIds}
              onToggle={toggleTopic}
              variant="checkboxes"
            />
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{t("uiEntityCreationWizard.donTSeeYourTerritory")}</span>
                <AddTerritoryDialog
                  onCreated={(id) => {
                    if (!selectedTerritoryIds.includes(id)) toggleTerritory(id);
                  }}
                />
              </div>
              <SearchableTagPicker
                label={t("uiEntityCreationWizard.territories")}
                items={territories.map(territory => ({
                  id: territory.id,
                  name: territory.name,
                  suggested: scrapedTerritoryIds.includes(territory.id),
                }))}
                selectedIds={selectedTerritoryIds}
                onToggle={toggleTerritory}
                variant="checkboxes"
              />
            </div>
          </div>
        );

      case "policy":
        return (
          <div className="space-y-5">
            <div>
              <label className="text-sm font-medium mb-2 block flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5" /> {t("uiEntityCreationWizard.joinPolicy")}
              </label>
              <p className="text-xs text-muted-foreground mb-3">{t(KIND_CONFIG[kind!].labelKey)}</p>
              <div className="space-y-2">
                {[
                  { value: GuildJoinPolicy.OPEN, label: t("uiEntityCreationWizard.open"), desc: t("uiEntityCreationWizard.anyoneCanJoinImmediately"), icon: Users },
                  { value: GuildJoinPolicy.APPROVAL_REQUIRED, label: t("uiEntityCreationWizard.approvalRequired"), desc: t("uiEntityCreationWizard.membersMustApplyAndBeApproved"), icon: Eye },
                  { value: GuildJoinPolicy.INVITE_ONLY, label: t("uiEntityCreationWizard.inviteOnly"), desc: t("uiEntityCreationWizard.onlyInvitedMembersCanJoin"), icon: Lock },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setJoinPolicy(opt.value)}
                    className={cn(
                      "w-full flex items-center gap-3 p-3 rounded-lg border transition-all text-left",
                      joinPolicy === opt.value ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
                    )}
                  >
                    <opt.icon className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium">{opt.label}</span>
                      <p className="text-xs text-muted-foreground">{opt.desc}</p>
                    </div>
                    {joinPolicy === opt.value && <Check className="h-4 w-4 text-primary shrink-0" />}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">{t("uiEntityCreationWizard.universeVisibility")}</label>
              <Select value={universeVisibility} onValueChange={setUniverseVisibility}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="both">{t("uiEntityCreationWizard.bothCreativeImpact")}</SelectItem>
                  <SelectItem value="creative">{t("uiEntityCreationWizard.creativeOnly")}</SelectItem>
                  <SelectItem value="impact">{t("uiEntityCreationWizard.impactOnly")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg border border-border">
              <div>
                <label className="text-sm font-medium">{t("uiEntityCreationWizard.saveAsDraft")}</label>
                <p className="text-xs text-muted-foreground">{t("uiEntityCreationWizard.keepItPrivateUntilYouRe")}</p>
              </div>
              <Switch checked={isDraft} onCheckedChange={setIsDraft} />
            </div>
          </div>
        );

      case "branding":
        return (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              {scraped && logoUrl
                ? t("uiEntityCreationWizard.weImportedALogoFromYour")
                : t(KIND_CONFIG[kind!].labelKey)}
            </p>
            <ImageUpload
              label={t("uiEntityCreationWizard.logo")}
              currentImageUrl={logoUrl}
              onChange={setLogoUrl}
              aspectRatio="1/1"
              description={t("uiEntityCreationWizard.squareLogo256256Recommended")}
            />
            <ImageUpload
              label={t("uiEntityCreationWizard.bannerOptional")}
              currentImageUrl={bannerUrl}
              onChange={setBannerUrl}
              aspectRatio="16/9"
              description={t("uiEntityCreationWizard.wideBanner1200400Recommended")}
            />
          </div>
        );

      case "review":
        return (
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
              <div className="flex items-center gap-3">
                {kind && (() => {
                  const Icon = KIND_CONFIG[kind].icon;
                  return <div className={cn("p-2 rounded-lg bg-muted", KIND_CONFIG[kind].color)}><Icon className="h-5 w-5" /></div>;
                })()}
                <div>
                  <h3 className="font-display font-semibold">{name || t("uiEntityCreationWizard.untitled")}</h3>
                  <span className="text-xs text-muted-foreground">{kind && t(KIND_CONFIG[kind].labelKey)}</span>
                </div>
              </div>

              {(description || mission) && (
                <p className="text-sm text-muted-foreground">{description || mission}</p>
              )}

              {selectedTopicIds.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {selectedTopicIds.map(id => {
                    const t = topics.find(t => t.id === id);
                    return t ? <Badge key={id} variant="secondary" className="text-xs"><Hash className="h-3 w-3 mr-0.5" />{t.name}</Badge> : null;
                  })}
                </div>
              )}

              {selectedTerritoryIds.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {selectedTerritoryIds.map(id => {
                    const t = territories.find(t => t.id === id);
                    return t ? <Badge key={id} variant="outline" className="text-xs"><MapPin className="h-3 w-3 mr-0.5" />{t.name}</Badge> : null;
                  })}
                </div>
              )}

              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  {joinPolicy === GuildJoinPolicy.OPEN ? <Users className="h-3 w-3" /> : joinPolicy === GuildJoinPolicy.INVITE_ONLY ? <Lock className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  {joinPolicy === GuildJoinPolicy.OPEN ? t("uiEntityCreationWizard.open") : joinPolicy === GuildJoinPolicy.INVITE_ONLY ? t("uiEntityCreationWizard.inviteOnly") : t("uiEntityCreationWizard.approvalRequired")}
                </span>
                {isDraft && <Badge variant="outline" className="text-xs">{t("uiEntityCreationWizard.draft")}</Badge>}
              </div>
            </div>
          </div>
        );
    }
  };

  const canProceed = () => {
    if (step === "kind") return !!kind;
    if (step === "source") return true; // handled by buttons
    if (step === "details") return name.trim().length > 0;
    return true;
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {kind && (() => {
              const Icon = KIND_CONFIG[kind].icon;
              return <Icon className={cn("h-5 w-5", KIND_CONFIG[kind].color)} />;
            })()}
            {t(STEP_LABEL_KEYS[step])}
          </DialogTitle>
        </DialogHeader>

        {/* Progress dots */}
        <div className="flex items-center gap-1.5 justify-center">
          {activeSteps.map((s, i) => (
            <div
              key={s}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i <= currentIndex ? "bg-primary" : "bg-muted",
                s === step ? "w-6" : "w-1.5"
              )}
            />
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
          >
            {renderStep()}
          </motion.div>
        </AnimatePresence>

        {/* Navigation — source step has its own buttons */}
        {step !== "kind" && step !== "source" && (
          <div className="flex items-center justify-between pt-2">
            <Button variant="ghost" size="sm" onClick={goBack} disabled={!canGoBack}>
              <ChevronLeft className="h-4 w-4 mr-1" /> {t("common.back")}
            </Button>
            {isLastStep ? (
              <Button onClick={handleSubmit} disabled={!name.trim() || isSubmitting}>
                {isSubmitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
                {t("uiEntityCreationWizard.create")} {kind && t(KIND_CONFIG[kind].labelKey)}
              </Button>
            ) : (
              <Button onClick={goNext} disabled={!canProceed()}>
                {t("common.next")} <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            )}
          </div>
        )}
        {step === "source" && (
          <div className="flex items-center justify-start pt-2">
            <Button variant="ghost" size="sm" onClick={goBack}>
              <ChevronLeft className="h-4 w-4 mr-1" /> {t("uiEntityCreationWizard.back")}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
