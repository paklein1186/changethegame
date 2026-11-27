import i18n from "@/i18n/config";
import { useTranslation } from "react-i18next";
import { PageShell } from "@/components/PageShell";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import {
  Rocket,
  BookOpen,
  AlertCircle,
  LifeBuoy,
  Sparkles,
  Users,
  MapPin,
  GraduationCap,
  ShieldCheck,
  BriefcaseBusiness,
  Compass,
  Swords,
  Wrench,
  MessageCircleQuestion,
} from "lucide-react";
import { useEffect, useState } from "react";

const sections = [
  { id: "quickstart", get label() { return i18n.t("uiGuidesPage.quickstart"); }, icon: Rocket },
  { id: "indepth", get label() { return i18n.t("uiGuidesPage.inDepthGuides"); }, icon: BookOpen },
  { id: "troubleshooting", get label() { return i18n.t("uiGuidesPage.troubleshooting"); }, icon: AlertCircle },
  { id: "help", get label() { return i18n.t("uiGuidesPage.askForHelp"); }, icon: LifeBuoy },
] as const;

const quickstartItems = [
  {
    get title() { return i18n.t("uiGuidesPage.howToCreateYourProfile"); },
    icon: Users,
    get text() { return i18n.t("uiGuidesPage.setYourNamePictureBioCreative"); },
  },
  {
    get title() { return i18n.t("uiGuidesPage.howToLaunchAQuest"); },
    icon: Swords,
    get text() { return i18n.t("uiGuidesPage.goToExploreQuestsCreateAdd"); },
  },
  {
    get title() { return i18n.t("uiGuidesPage.howToJoinAGuild"); },
    icon: Users,
    get text() { return i18n.t("uiGuidesPage.visitAnyGuildPageAndClick"); },
  },
  {
    get title() { return i18n.t("uiGuidesPage.howToOfferAService"); },
    icon: BriefcaseBusiness,
    get text() { return i18n.t("uiGuidesPage.openProfileServicesSetYourPricing"); },
  },
  {
    get title() { return i18n.t("uiGuidesPage.howToUseAiAgents"); },
    icon: Sparkles,
    get text() { return i18n.t("uiGuidesPage.anywhereYouSeeTheIconThe"); },
  },
];

const indepthItems = [
  {
    get title() { return i18n.t("uiGuidesPage.xpCreditsContributionIndex"); },
    icon: Compass,
    get text() { return i18n.t("uiGuidesPage.xpTracksParticipationAndCreativityCredits"); },
  },
  {
    get title() { return i18n.t("uiGuidesPage.podsAndCollaborationTools"); },
    icon: Users,
    get text() { return i18n.t("uiGuidesPage.podsAreSmallGroupsForCollaboration"); },
  },
  {
    get title() { return i18n.t("uiGuidesPage.guildGovernance"); },
    icon: ShieldCheck,
    get text() { return i18n.t("uiGuidesPage.guildsHaveAdminsCoreMembersGuests"); },
  },
  {
    get title() { return i18n.t("uiGuidesPage.territoryActivation"); },
    icon: MapPin,
    get text() { return i18n.t("uiGuidesPage.territoriesSurfaceEventsNearYouJoin"); },
  },
  {
    get title() { return i18n.t("uiGuidesPage.coursesLearningModules"); },
    icon: GraduationCap,
    get text() { return i18n.t("uiGuidesPage.coursesIncludeLessonsFilesOrVideos"); },
  },
  {
    get title() { return i18n.t("uiGuidesPage.howAiWorksAndWhereData"); },
    icon: ShieldCheck,
    get text() { return i18n.t("uiGuidesPage.aiOnlyUsesTheDataYou"); },
  },
];

const troubleshootingItems = [
  {
    get title() { return i18n.t("uiGuidesPage.iCanTCreateAQuest"); },
    icon: Wrench,
    get text() { return i18n.t("uiGuidesPage.checkYouReLoggedInAnd"); },
  },
  {
    get title() { return i18n.t("uiGuidesPage.myGuildDoesnTDisplayProperly"); },
    icon: Wrench,
    get text() { return i18n.t("uiGuidesPage.yourApplicationMayStillBePending"); },
  },
  {
    get title() { return i18n.t("uiGuidesPage.myCompanyIsnTAttached"); },
    icon: Wrench,
    get text() { return i18n.t("uiGuidesPage.goToProfileCompaniesAndAttach"); },
  },
  {
    get title() { return i18n.t("uiGuidesPage.bookingsDonTOpen"); },
    icon: Wrench,
    get text() { return i18n.t("uiGuidesPage.ensureSlotsExistTrySwitchingDevice"); },
  },
  {
    get title() { return i18n.t("uiGuidesPage.notificationsDonTAppear"); },
    icon: Wrench,
    get text() { return i18n.t("uiGuidesPage.enableNotificationsInSettingsNotificationsAnd"); },
  },
];

export default function GuidesPage() {
  const { t } = useTranslation();
  const [activeSection, setActiveSection] = useState("quickstart");

  useEffect(() => {
    const handleScroll = () => {
      for (const s of sections) {
        const el = document.getElementById(s.id);
        if (el) {
          const rect = el.getBoundingClientRect();
          if (rect.top <= 120) setActiveSection(s.id);
        }
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <PageShell>
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-10">
          <h1 className="text-3xl sm:text-4xl font-bold text-foreground font-display">
            Guides &amp; Support
          </h1>
          <p className="mt-2 text-muted-foreground text-lg">
            {t("uiGuidesPage.everythingYouNeedToGetStarted")}
          </p>
        </div>

        <div className="flex gap-8">
          {/* Sidebar navigation — hidden on mobile */}
          <nav className="hidden lg:block w-48 shrink-0 sticky top-24 self-start space-y-1">
            {sections.map((s) => {
              const Icon = s.icon;
              return (
                <button
                  key={s.id}
                  onClick={() => scrollTo(s.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    activeSection === s.id
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {s.label}
                </button>
              );
            })}
          </nav>

          {/* Main content */}
          <div className="flex-1 min-w-0 space-y-12">
            {/* Section 1 — Quickstart */}
            <section id="quickstart">
              <div className="flex items-center gap-2 mb-4">
                <Rocket className="h-5 w-5 text-primary" />
                <h2 className="text-xl font-semibold text-foreground">{t("uiGuidesPage.quickstartGuides")}</h2>
              </div>
              <Accordion type="multiple" className="space-y-2">
                {quickstartItems.map((item, i) => {
                  const Icon = item.icon;
                  return (
                    <AccordionItem
                      key={i}
                      value={`qs-${i}`}
                      className="border rounded-lg px-4 bg-card"
                    >
                      <AccordionTrigger className="hover:no-underline gap-3">
                        <span className="flex items-center gap-2 text-left font-medium">
                          <Icon className="h-4 w-4 text-primary shrink-0" />
                          {item.title}
                        </span>
                      </AccordionTrigger>
                      <AccordionContent className="text-muted-foreground leading-relaxed pl-6">
                        {item.text}
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            </section>

            {/* Section 2 — In-depth */}
            <section id="indepth">
              <div className="flex items-center gap-2 mb-4">
                <BookOpen className="h-5 w-5 text-primary" />
                <h2 className="text-xl font-semibold text-foreground">{t("uiGuidesPage.inDepthGuides")}</h2>
              </div>
              <Accordion type="multiple" className="space-y-2">
                {indepthItems.map((item, i) => {
                  const Icon = item.icon;
                  return (
                    <AccordionItem
                      key={i}
                      value={`id-${i}`}
                      className="border rounded-lg px-4 bg-card"
                    >
                      <AccordionTrigger className="hover:no-underline gap-3">
                        <span className="flex items-center gap-2 text-left font-medium">
                          <Icon className="h-4 w-4 text-primary shrink-0" />
                          {item.title}
                        </span>
                      </AccordionTrigger>
                      <AccordionContent className="text-muted-foreground leading-relaxed pl-6">
                        {item.text}
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            </section>

            {/* Section 3 — Troubleshooting */}
            <section id="troubleshooting">
              <div className="flex items-center gap-2 mb-4">
                <AlertCircle className="h-5 w-5 text-destructive" />
                <h2 className="text-xl font-semibold text-foreground">{t("uiGuidesPage.troubleshooting")}</h2>
              </div>
              <Accordion type="multiple" className="space-y-2">
                {troubleshootingItems.map((item, i) => (
                  <AccordionItem
                    key={i}
                    value={`ts-${i}`}
                    className="border rounded-lg px-4 bg-card"
                  >
                    <AccordionTrigger className="hover:no-underline gap-3">
                      <span className="flex items-center gap-2 text-left font-medium">
                        <MessageCircleQuestion className="h-4 w-4 text-destructive shrink-0" />
                        {item.title}
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground leading-relaxed pl-6">
                      {item.text}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </section>

            {/* Section 4 — Ask for Help */}
            <section id="help" className="pb-16">
              <div className="flex items-center gap-2 mb-4">
                <LifeBuoy className="h-5 w-5 text-accent" />
                <h2 className="text-xl font-semibold text-foreground">{t("uiGuidesPage.askForHelp")}</h2>
              </div>
              <div className="rounded-lg border bg-card p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <p className="text-muted-foreground flex-1">
                  {t("uiGuidesPage.stuckTheTeamWillSupportYou")}
                </p>
                <Button asChild>
                  <Link to="/contact">{t("uiGuidesPage.contactSupport")}</Link>
                </Button>
              </div>
            </section>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
