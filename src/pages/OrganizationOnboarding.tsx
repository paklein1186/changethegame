import i18n from "@/i18n/config";
import { useTranslation } from "react-i18next";
import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Building2, Landmark, GraduationCap, Heart, Leaf, Handshake,
  ChevronRight, ChevronLeft, Loader2, Globe, MapPin, Hash,
  Sparkles, Check, ArrowRight, Shield, Briefcase, Target, Users, Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ImageUpload } from "@/components/ImageUpload";
import { PageShell } from "@/components/PageShell";
import { useToast } from "@/hooks/use-toast";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useTopics, useTerritories } from "@/hooks/useSupabaseData";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { EntityCreationWizard } from "@/components/EntityCreationWizard";
import { FrenchTextOverlay } from "@/components/onboarding/FrenchTextOverlay";

const ORG_TYPES = [
  { value: "public_sector", get label() { return i18n.t("uiOrganizationOnboarding.publicSector"); }, icon: Landmark, get desc() { return i18n.t("uiOrganizationOnboarding.governmentMunicipalityPublicInstitution"); } },
  { value: "corporation", get label() { return i18n.t("uiOrganizationOnboarding.companyCorporation"); }, icon: Building2, get desc() { return i18n.t("uiOrganizationOnboarding.privateCompanyStartupSme"); } },
  { value: "academic", get label() { return i18n.t("uiOrganizationOnboarding.academicResearch"); }, icon: GraduationCap, get desc() { return i18n.t("uiOrganizationOnboarding.universityLabResearchCenter"); } },
  { value: "foundation", get label() { return i18n.t("uiOrganizationOnboarding.foundation"); }, icon: Heart, get desc() { return i18n.t("uiOrganizationOnboarding.philanthropicOrGrantMakingOrganization"); } },
  { value: "ngo", label: "NGO", icon: Leaf, get desc() { return i18n.t("uiOrganizationOnboarding.nonProfitAssociationStructuredNgo"); } },
  { value: "cooperative", get label() { return i18n.t("uiOrganizationOnboarding.cooperative"); }, icon: Handshake, get desc() { return i18n.t("uiOrganizationOnboarding.formalCooperativeStructure"); } },
];

const REDIRECT_TYPES = ["dao", "collective", "community", "informal_network"];

const STEPS = ["type", "info", "ai_scrape", "classify", "review"] as const;
type Step = typeof STEPS[number];

export default function OrganizationOnboarding() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const currentUser = useCurrentUser();
  const qc = useQueryClient();
  const { data: topicsData } = useTopics();
  const { data: territoriesData } = useTerritories();
  const topics = topicsData ?? [];
  const territories = territoriesData ?? [];

  const [step, setStep] = useState<Step>("type");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showEntityWizard, setShowEntityWizard] = useState(false);

  // Step 1: Type selection
  const [orgType, setOrgType] = useState("");

  // Step 2: Basic info
  const [orgName, setOrgName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");

  // Step 3: AI scraping results (editable)
  const [scraping, setScraping] = useState(false);
  const [scraped, setScraped] = useState(false);
  const [mission, setMission] = useState("");
  const [description, setDescription] = useState("");
  const [sector, setSector] = useState("");
  const [scaleCategory, setScaleCategory] = useState("");
  const [suggestedTopics, setSuggestedTopics] = useState<string[]>([]);
  const [suggestedTerritories, setSuggestedTerritories] = useState<string[]>([]);
  const [collaborationInterests, setCollaborationInterests] = useState<string[]>([]);
  const [logoUrl, setLogoUrl] = useState<string | undefined>();

  // Step 4: Classification (selected topics/territories from platform)
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([]);
  const [selectedTerritoryIds, setSelectedTerritoryIds] = useState<string[]>([]);
  const [topicSearch, setTopicSearch] = useState("");
  const [terrSearch, setTerrSearch] = useState("");

  const filteredTopics = useMemo(() => {
    if (!topicSearch.trim()) return topics;
    const q = topicSearch.toLowerCase();
    return topics.filter((t: any) => t.name.toLowerCase().includes(q));
  }, [topics, topicSearch]);

  const filteredTerritories = useMemo(() => {
    if (!terrSearch.trim()) return territories;
    const q = terrSearch.toLowerCase();
    return territories.filter((t: any) => t.name.toLowerCase().includes(q));
  }, [territories, terrSearch]);

  // Reuse answers already given during personal onboarding (no duplicate questions)
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("orgOnboardingPrefill");
      if (!raw) return;
      const pre = JSON.parse(raw) as {
        topicIds?: string[]; territoryIds?: string[]; websiteUrl?: string; linkedinUrl?: string;
      };
      if (pre.topicIds?.length) setSelectedTopicIds(prev => [...new Set([...prev, ...pre.topicIds!])]);
      if (pre.territoryIds?.length) setSelectedTerritoryIds(prev => [...new Set([...prev, ...pre.territoryIds!])]);
      if (pre.websiteUrl) setWebsiteUrl(prev => prev || pre.websiteUrl!);
      if (pre.linkedinUrl) setLinkedinUrl(prev => prev || pre.linkedinUrl!);
      sessionStorage.removeItem("orgOnboardingPrefill");
    } catch { /* ignore */ }
  }, []);

  // Auto-match scraped suggestions to platform taxonomy
  useEffect(() => {
    if (!scraped) return;
    if (suggestedTopics.length > 0 && topics.length > 0) {
      const matched = topics
        .filter((t: any) => suggestedTopics.some(st => t.name.toLowerCase().includes(st.toLowerCase()) || st.toLowerCase().includes(t.name.toLowerCase())))
        .map((t: any) => t.id);
      if (matched.length > 0) setSelectedTopicIds(prev => [...new Set([...prev, ...matched])]);
    }
    if (suggestedTerritories.length > 0 && territories.length > 0) {
      const matched = territories
        .filter((t: any) => suggestedTerritories.some(st => t.name.toLowerCase().includes(st.toLowerCase()) || st.toLowerCase().includes(t.name.toLowerCase())))
        .map((t: any) => t.id);
      if (matched.length > 0) setSelectedTerritoryIds(prev => [...new Set([...prev, ...matched])]);
    }
  }, [scraped, suggestedTopics, suggestedTerritories, topics, territories]);

  const handleScrape = async () => {
    if (!websiteUrl && !linkedinUrl) {
      setStep("classify");
      return;
    }
    setScraping(true);
    try {
      const { data, error } = await supabase.functions.invoke("scrape-organization", {
        body: { url: websiteUrl || undefined, linkedinUrl: linkedinUrl || undefined },
      });
      if (error) throw error;
      if (data) {
        if (data.name && !orgName) setOrgName(data.name);
        if (data.mission_statement) setMission(data.mission_statement);
        if (data.description) setDescription(data.description);
        if (data.description) setDescription(data.description);
        if (data.size_estimate) setScaleCategory(data.size_estimate);
        if (data.org_type && data.org_type !== "other" && !orgType) setOrgType(data.org_type);
        if (data.topics) setSuggestedTopics(data.topics);
        if (data.territories) setSuggestedTerritories(data.territories);
        if (data.collaboration_interests) setCollaborationInterests(data.collaboration_interests);
        if (data.logo) setLogoUrl(data.logo);
        setScraped(true);
      }
    } catch (e) {
      console.error("Scrape error:", e);
      toast({ title: t("uiOrganizationOnboarding.couldnTScrapeTheUrlPlease"), variant: "destructive" });
    } finally {
      setScraping(false);
    }
  };

  const handleSubmit = async () => {
    if (!orgName.trim()) {
      toast({ title: t("uiOrganizationOnboarding.organizationNameIsRequired"), variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      // Create the company (organization)
      const { data: created, error } = await supabase.from("companies").insert({
        name: orgName.trim(),
        description: description.trim() || mission.trim() || null,
        website_url: websiteUrl.trim() || null,
        linkedin_url: linkedinUrl.trim() || null,
        logo_url: logoUrl || null,
        sector: null,
        contact_user_id: currentUser.id,
        org_type: orgType || "other",
        mission_statement: mission.trim() || null,
        collaboration_interests: collaborationInterests.length > 0 ? collaborationInterests : null,
        scale_category: scaleCategory || null,
      } as any).select("id").single();

      if (error) throw error;
      const companyId = created.id;

      // Add current user as owner
      await supabase.from("company_members").insert({
        company_id: companyId,
        user_id: currentUser.id,
        role: "owner",
      });

      // Attach topics
      if (selectedTopicIds.length > 0) {
        await supabase.from("company_topics").insert(
          selectedTopicIds.map(tid => ({ company_id: companyId, topic_id: tid }))
        );
      }

      // Attach territories
      if (selectedTerritoryIds.length > 0) {
        await supabase.from("company_territories").insert(
          selectedTerritoryIds.map(tid => ({ company_id: companyId, territory_id: tid }))
        );
      }

      qc.invalidateQueries({ queryKey: ["my-companies"] });
      toast({ title: t("uiOrganizationOnboarding.organizationCreatedSuccessfully") });
      navigate(`/organizations/${companyId}/next-steps`);
    } catch (e: any) {
      console.error(e);
      toast({ title: t("uiOrganizationOnboarding.failedToCreateOrganization"), description: e.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const stepIndex = STEPS.indexOf(step);
  const canGoBack = stepIndex > 0;
  const goBack = () => { if (canGoBack) setStep(STEPS[stepIndex - 1]); };

  return (
    <PageShell>
      <FrenchTextOverlay>
      <div className="max-w-2xl mx-auto">
        {/* Progress */}
        <div className="flex items-center gap-1 mb-8">
          {STEPS.map((s, i) => (
            <div key={s} className={cn(
              "h-1.5 flex-1 rounded-full transition-colors",
              i <= stepIndex ? "bg-primary" : "bg-muted"
            )} />
          ))}
        </div>

        <AnimatePresence mode="wait">
          {/* STEP 1: Organization Type */}
          {step === "type" && (
            <motion.div key="type" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <h1 className="font-display text-2xl md:text-3xl font-bold mb-2 flex items-center gap-3">
                <Building2 className="h-7 w-7 text-primary" /> {t("uiOrganizationOnboarding.whatTypeOfOrganization")}
              </h1>
              <p className="text-muted-foreground mb-8">{t("uiOrganizationOnboarding.selectTheCategoryThatBestDescribes")}</p>

              <div className="grid gap-3 sm:grid-cols-2">
                {ORG_TYPES.map((t) => (
                  <button key={t.value} onClick={() => { setOrgType(t.value); setStep("info"); }}
                    className={cn(
                      "text-left rounded-xl border p-4 transition-all hover:border-primary/40 hover:shadow-sm cursor-pointer",
                      orgType === t.value ? "border-primary bg-primary/5" : "border-border bg-card"
                    )}
                  >
                    <div className="flex items-center gap-3 mb-1">
                      <t.icon className="h-5 w-5 text-primary" />
                      <span className="font-semibold text-sm">{t.label}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{t.desc}</p>
                  </button>
                ))}
              </div>

              <div className="mt-6 rounded-xl border border-primary/20 bg-primary/5 p-4">
                <p className="text-sm font-medium mb-2">{t("uiOrganizationOnboarding.notATraditionalOrganization")}</p>
                <p className="text-xs text-muted-foreground mb-3">
                  {t("uiOrganizationOnboarding.createA")} <strong>{t("uiOrganizationOnboarding.guild")}</strong> {t("uiOrganizationOnboarding.communityCollectiveDaoOrA")} <strong>{t("uiOrganizationOnboarding.pod")}</strong> {t("uiOrganizationOnboarding.microTeamStudyGroupInstead")}
                </p>
                <Button variant="outline" size="sm" onClick={() => setShowEntityWizard(true)} className="gap-1.5">
                  <Plus className="h-3.5 w-3.5" /> {t("uiOrganizationOnboarding.createAGuildOrPod")}
                </Button>
              </div>

              <EntityCreationWizard open={showEntityWizard} onOpenChange={setShowEntityWizard} />
            </motion.div>
          )}

          {/* STEP 2: Basic Info */}
          {step === "info" && (
            <motion.div key="info" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <h1 className="font-display text-2xl font-bold mb-2">{t("uiOrganizationOnboarding.yourProjectOrOrganization")}</h1>
              <p className="text-muted-foreground mb-6">{t("uiOrganizationOnboarding.pasteAWebsiteUrlToAuto")}</p>

              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">{t("uiOrganizationOnboarding.organizationName")}</label>
                  <Input value={orgName} onChange={e => setOrgName(e.target.value)} placeholder={t("uiOrganizationOnboarding.eGUnitedNationsDevelopmentProgramme")} maxLength={100} />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">{t("uiOrganizationOnboarding.websiteUrl")}</label>
                  <Input value={websiteUrl} onChange={e => setWebsiteUrl(e.target.value)} placeholder="https://yourorganization.org" type="url" />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">{t("uiOrganizationOnboarding.linkedinPageOptional")}</label>
                  <Input value={linkedinUrl} onChange={e => setLinkedinUrl(e.target.value)} placeholder="https://linkedin.com/company/..." type="url" />
                </div>
              </div>

              <div className="flex justify-between mt-8">
                <Button variant="outline" onClick={goBack}><ChevronLeft className="h-4 w-4 mr-1" /> {t("uiOrganizationOnboarding.back")}</Button>
                <Button onClick={() => { setStep("ai_scrape"); if (websiteUrl || linkedinUrl) handleScrape(); else setScraped(false); }}>
                  {websiteUrl || linkedinUrl ? (
                    <><Sparkles className="h-4 w-4 mr-1" /> {t("uiOrganizationOnboarding.scrapeContinue")}</>
                  ) : (
                    <>{t("uiOrganizationOnboarding.continue")} <ChevronRight className="h-4 w-4 ml-1" /></>
                  )}
                </Button>
              </div>
            </motion.div>
          )}

          {/* STEP 3: AI Scrape Results (editable) */}
          {step === "ai_scrape" && (
            <motion.div key="ai_scrape" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <h1 className="font-display text-2xl font-bold mb-2 flex items-center gap-2">
                <Sparkles className="h-6 w-6 text-primary" />
                {scraping ? t("uiOrganizationOnboarding.aiIsAnalyzingYourOrganization") : t("uiOrganizationOnboarding.reviewEdit")}
              </h1>

              {scraping ? (
                <div className="flex flex-col items-center justify-center py-16 gap-4">
                  <Loader2 className="h-10 w-10 animate-spin text-primary" />
                  <p className="text-muted-foreground">{t("uiOrganizationOnboarding.extractingOrganizationData")}</p>
                </div>
              ) : (
                <div className="space-y-4 mt-6">
                  <div>
                    <label className="text-sm font-medium mb-1 block">{t("uiOrganizationOnboarding.organizationName2")}</label>
                    <Input value={orgName} onChange={e => setOrgName(e.target.value)} maxLength={100} />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">{t("uiOrganizationOnboarding.missionStatement")}</label>
                    <Textarea value={mission} onChange={e => setMission(e.target.value)} placeholder={t("uiOrganizationOnboarding.whatSYourOrganizationSMission")} className="resize-none" rows={3} />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">{t("uiOrganizationOnboarding.description")}</label>
                    <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder={t("uiOrganizationOnboarding.briefDescription")} className="resize-none" rows={3} />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">{t("uiOrganizationOnboarding.scale")}</label>
                    <Select value={scaleCategory} onValueChange={setScaleCategory}>
                      <SelectTrigger><SelectValue placeholder={t("uiOrganizationOnboarding.selectScale")} /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="small">{t("uiOrganizationOnboarding.small")}</SelectItem>
                        <SelectItem value="medium">{t("uiOrganizationOnboarding.medium")}</SelectItem>
                        <SelectItem value="large">{t("uiOrganizationOnboarding.large")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <ImageUpload label={t("uiOrganizationOnboarding.logo")} currentImageUrl={logoUrl} onChange={setLogoUrl} aspectRatio="1/1" description={t("uiOrganizationOnboarding.organizationLogo")} />

                  {suggestedTopics.length > 0 && (
                    <div>
                      <label className="text-sm font-medium mb-1 block">{t("uiOrganizationOnboarding.aiSuggestedTopics")}</label>
                      <div className="flex flex-wrap gap-1.5">
                        {suggestedTopics.map(t => <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>)}
                      </div>
                    </div>
                  )}
                  {suggestedTerritories.length > 0 && (
                    <div>
                      <label className="text-sm font-medium mb-1 block">{t("uiOrganizationOnboarding.aiSuggestedTerritories")}</label>
                      <div className="flex flex-wrap gap-1.5">
                        {suggestedTerritories.map(t => <Badge key={t} variant="outline" className="text-xs"><MapPin className="h-3 w-3 mr-0.5" />{t}</Badge>)}
                      </div>
                    </div>
                  )}
                  {collaborationInterests.length > 0 && (
                    <div>
                      <label className="text-sm font-medium mb-1 block">{t("uiOrganizationOnboarding.collaborationInterests")}</label>
                      <div className="flex flex-wrap gap-1.5">
                        {collaborationInterests.map(c => <Badge key={c} variant="outline" className="text-xs">{c}</Badge>)}
                      </div>
                    </div>
                  )}

                  <div className="flex justify-between mt-6">
                    <Button variant="outline" onClick={goBack}><ChevronLeft className="h-4 w-4 mr-1" /> {t("uiOrganizationOnboarding.back")}</Button>
                    <Button onClick={() => setStep("classify")}>{t("uiOrganizationOnboarding.selectTopicsTerritories")} <ChevronRight className="h-4 w-4 ml-1" /></Button>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* STEP 4: Classification */}
          {step === "classify" && (
            <motion.div key="classify" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <h1 className="font-display text-2xl font-bold mb-2">{t("uiOrganizationOnboarding.topicsTerritories")}</h1>
              <p className="text-muted-foreground mb-6">{t("uiOrganizationOnboarding.connectYourOrganizationToThePlatform")}</p>

              <div className="space-y-6">
                {/* Topics */}
                <div>
                  <label className="text-sm font-medium mb-2 block flex items-center gap-1"><Hash className="h-4 w-4" /> {t("uiOrganizationOnboarding.topics")}{selectedTopicIds.length} {t("uiOrganizationOnboarding.selected")}</label>
                  <Input value={topicSearch} onChange={e => setTopicSearch(e.target.value)} placeholder={t("uiOrganizationOnboarding.searchTopics")} className="mb-2" />
                  <div className="max-h-48 overflow-y-auto rounded-lg border border-border p-2 space-y-1">
                    {filteredTopics.map((t: any) => (
                      <label key={t.id} className="flex items-center gap-2 py-1 px-2 rounded hover:bg-muted/50 cursor-pointer text-sm">
                        <Checkbox checked={selectedTopicIds.includes(t.id)} onCheckedChange={(checked) => {
                          setSelectedTopicIds(prev => checked ? [...prev, t.id] : prev.filter(id => id !== t.id));
                        }} />
                        {t.name}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Territories */}
                <div>
                  <label className="text-sm font-medium mb-2 block flex items-center gap-1"><MapPin className="h-4 w-4" /> {t("uiOrganizationOnboarding.territories")}{selectedTerritoryIds.length} {t("uiOrganizationOnboarding.selected")}</label>
                  <Input value={terrSearch} onChange={e => setTerrSearch(e.target.value)} placeholder={t("uiOrganizationOnboarding.searchTerritories")} className="mb-2" />
                  <div className="max-h-48 overflow-y-auto rounded-lg border border-border p-2 space-y-1">
                    {filteredTerritories.map((t: any) => (
                      <label key={t.id} className="flex items-center gap-2 py-1 px-2 rounded hover:bg-muted/50 cursor-pointer text-sm">
                        <Checkbox checked={selectedTerritoryIds.includes(t.id)} onCheckedChange={(checked) => {
                          setSelectedTerritoryIds(prev => checked ? [...prev, t.id] : prev.filter(id => id !== t.id));
                        }} />
                        {t.name}
                        {t.level && <Badge variant="outline" className="text-[10px] ml-auto">{t.level}</Badge>}
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex justify-between mt-8">
                <Button variant="outline" onClick={goBack}><ChevronLeft className="h-4 w-4 mr-1" /> {t("uiOrganizationOnboarding.back")}</Button>
                <Button onClick={() => setStep("review")}>{t("uiOrganizationOnboarding.review")} <ChevronRight className="h-4 w-4 ml-1" /></Button>
              </div>
            </motion.div>
          )}

          {/* STEP 5: Review & Create */}
          {step === "review" && (
            <motion.div key="review" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <h1 className="font-display text-2xl font-bold mb-2 flex items-center gap-2">
                <Check className="h-6 w-6 text-primary" /> {t("uiOrganizationOnboarding.reviewCreate")}
              </h1>
              <p className="text-muted-foreground mb-6">{t("uiOrganizationOnboarding.everythingLooksGoodLetSCreate")}</p>

              <div className="rounded-xl border border-border bg-card p-6 space-y-4">
                <div className="flex items-center gap-4">
                  {logoUrl && <img src={logoUrl} alt="" className="h-14 w-14 rounded-xl object-cover" />}
                  <div>
                    <h2 className="font-display text-xl font-bold">{orgName || t("uiOrganizationOnboarding.unnamedOrganization")}</h2>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      {orgType && <Badge variant="outline" className="text-xs capitalize">{orgType.replace(/_/g, " ")}</Badge>}
                      {sector && <span>{sector}</span>}
                      {scaleCategory && <Badge variant="secondary" className="text-xs capitalize">{scaleCategory}</Badge>}
                    </div>
                  </div>
                </div>
                {mission && <div><span className="text-xs font-medium text-muted-foreground">{t("uiOrganizationOnboarding.mission")}</span><p className="text-sm">{mission}</p></div>}
                {description && <div><span className="text-xs font-medium text-muted-foreground">{t("uiOrganizationOnboarding.description")}</span><p className="text-sm">{description}</p></div>}
                {selectedTopicIds.length > 0 && (
                  <div>
                    <span className="text-xs font-medium text-muted-foreground">{t("uiOrganizationOnboarding.topics2")}</span>
                    <div className="flex flex-wrap gap-1 mt-1">{selectedTopicIds.map(id => {
                      const t = topics.find((t: any) => t.id === id);
                      return t ? <Badge key={id} variant="secondary" className="text-xs">{(t as any).name}</Badge> : null;
                    })}</div>
                  </div>
                )}
                {selectedTerritoryIds.length > 0 && (
                  <div>
                    <span className="text-xs font-medium text-muted-foreground">{t("uiOrganizationOnboarding.territories2")}</span>
                    <div className="flex flex-wrap gap-1 mt-1">{selectedTerritoryIds.map(id => {
                      const t = territories.find((t: any) => t.id === id);
                      return t ? <Badge key={id} variant="outline" className="text-xs"><MapPin className="h-3 w-3 mr-0.5" />{(t as any).name}</Badge> : null;
                    })}</div>
                  </div>
                )}
              </div>

              <div className="flex justify-between mt-8">
                <Button variant="outline" onClick={goBack}><ChevronLeft className="h-4 w-4 mr-1" /> {t("uiOrganizationOnboarding.back")}</Button>
                <Button onClick={handleSubmit} disabled={isSubmitting} className="gap-2">
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4" />}
                  {t("uiOrganizationOnboarding.createOrganization")}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      </FrenchTextOverlay>
    </PageShell>
  );
}
