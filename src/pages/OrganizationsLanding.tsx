import i18n from "@/i18n/config";
import { useTranslation } from "react-i18next";
import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight, Building2, Landmark, GraduationCap, Heart, Leaf,
  Users, Target, Briefcase, Handshake, MapPin, Shield, Compass,
  Sparkles, Zap, Globe,
} from "lucide-react";
import logoImg from "@/assets/logo.png";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SiteFooter } from "@/components/SiteFooter";
import { CookieConsentBanner } from "@/components/CookieConsentBanner";
import { useAuth } from "@/hooks/useAuth";
import { GuestOnboardingAssistant } from "@/components/GuestOnboardingAssistant";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.08, duration: 0.5, ease: "easeOut" as const } }),
};

const ORG_TYPES = [
  { icon: Landmark, get label() { return i18n.t("uiOrganizationsLanding.publicSector"); }, get desc() { return i18n.t("uiOrganizationsLanding.governmentAgenciesMunicipalitiesPublicInstitutions"); } },
  { icon: Building2, get label() { return i18n.t("uiOrganizationsLanding.corporations"); }, get desc() { return i18n.t("uiOrganizationsLanding.companiesBringingInnovationAndResourcesTo"); } },
  { icon: GraduationCap, get label() { return i18n.t("uiOrganizationsLanding.academicsResearch"); }, get desc() { return i18n.t("uiOrganizationsLanding.universitiesLabsAndResearchInstitutions"); } },
  { icon: Heart, get label() { return i18n.t("uiOrganizationsLanding.foundations"); }, get desc() { return i18n.t("uiOrganizationsLanding.philanthropicOrganizationsDrivingSystemicChange"); } },
  { icon: Leaf, get label() { return i18n.t("uiOrganizationsLanding.ngos"); }, get desc() { return i18n.t("uiOrganizationsLanding.nonProfitsWorkingOnSocialAnd"); } },
];

const STEPS = [
  { step: "01", get title() { return i18n.t("uiOrganizationsLanding.createYourProfile"); }, get desc() { return i18n.t("uiOrganizationsLanding.addYourOrganizationDetailsOrLet"); } },
  { step: "02", get title() { return i18n.t("uiOrganizationsLanding.aiMapsYourMission"); }, get desc() { return i18n.t("uiOrganizationsLanding.weMatchYourTopicsTerritoriesAnd"); } },
  { step: "03", get title() { return i18n.t("uiOrganizationsLanding.launchOpportunities"); }, get desc() { return i18n.t("uiOrganizationsLanding.postQuestsJobsOrCallsFor"); } },
  { step: "04", get title() { return i18n.t("uiOrganizationsLanding.matchWithBuilders"); }, get desc() { return i18n.t("uiOrganizationsLanding.discoverGuildsUsersAndPodsAligned"); } },
];

const WHY_JOIN = [
  { icon: Users, get title() { return i18n.t("uiOrganizationsLanding.accessTalent"); }, get desc() { return i18n.t("uiOrganizationsLanding.findSkilledIndividualsAndGuildsAligned"); } },
  { icon: Target, get title() { return i18n.t("uiOrganizationsLanding.launchCallsForProposals"); }, get desc() { return i18n.t("uiOrganizationsLanding.createMonetizedQuestsOpenToThe"); } },
  { icon: Handshake, get title() { return i18n.t("uiOrganizationsLanding.coCreateWithGuilds"); }, get desc() { return i18n.t("uiOrganizationsLanding.partnerWithMissionDrivenCommunities"); } },
  { icon: MapPin, get title() { return i18n.t("uiOrganizationsLanding.territorialImpact"); }, get desc() { return i18n.t("uiOrganizationsLanding.strengthenYourPresenceInSpecificTerritories"); } },
  { icon: Compass, get title() { return i18n.t("uiOrganizationsLanding.discoverInnovations"); }, get desc() { return i18n.t("uiOrganizationsLanding.exploreRegenerativePracticesAndNewApproaches"); } },
];

export default function OrganizationsLanding() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [guestOpen, setGuestOpen] = useState(false);
  const [guestAction, setGuestAction] = useState("");
  const triggerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (user) return;
    const dismissed = localStorage.getItem("guestAssistantDismissed");
    if (dismissed) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setGuestAction("get guidance");
          setGuestOpen(true);
          observer.disconnect();
        }
      },
      { threshold: 0.3 }
    );
    if (triggerRef.current) observer.observe(triggerRef.current);
    return () => observer.disconnect();
  }, [user]);

  const handleGatedClick = (label: string, authRoute: string) => {
    if (user) navigate(authRoute);
    else { setGuestAction(label); setGuestOpen(true); }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-lg">
        <div className="container flex h-14 items-center justify-between">
          <Link to="/welcome" className="flex items-center gap-2 font-display text-lg font-bold tracking-tight">
            <img src={logoImg} alt="changethegame" className="h-6 w-6" /> changethegame
          </Link>
          <nav className="flex items-center gap-2">
            <Button size="sm" variant="ghost" asChild><Link to="/explore"><Compass className="h-4 w-4 mr-1" /> {t("uiOrganizationsLanding.explore")}</Link></Button>
            {user ? (
              <Button size="sm" asChild><Link to="/">{t("uiOrganizationsLanding.enter")}</Link></Button>
            ) : (
              <>
                <Button size="sm" variant="ghost" asChild><Link to="/login">{t("uiOrganizationsLanding.logIn")}</Link></Button>
                <Button size="sm" asChild><Link to="/welcome">{t("uiOrganizationsLanding.signUp")}</Link></Button>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-amber-500/5 via-transparent to-transparent pointer-events-none" />
        <div className="container py-16 sm:py-24 md:py-32 text-center relative z-10 px-4">
          <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <Badge variant="secondary" className="mb-4 px-3 py-1 text-xs font-medium">
              <Building2 className="h-3 w-3 mr-1" /> {t("uiOrganizationsLanding.forInstitutionsOrganizations")}
            </Badge>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.6 }}
            className="font-display text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight max-w-4xl mx-auto leading-[1.1] px-2"
          >
            {t("uiOrganizationsLanding.institutionsShapingTheFutureWith")}{" "}
            <span className="text-primary">{t("uiOrganizationsLanding.regenerativeCollaboration")}</span>
          </motion.h1>

          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25, duration: 0.6 }}
            className="mt-5 text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed"
          >
            {t("uiOrganizationsLanding.connectWithInnovatorsTerritoriesAndMission")}
          </motion.p>

          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4, duration: 0.5 }}
            className="mt-8 flex flex-col sm:flex-row gap-3 justify-center"
          >
            <Button size="lg" className="gap-2" onClick={() => handleGatedClick("create an organization profile", "/onboarding/organization")}>
              <Building2 className="h-4 w-4" /> {t("uiOrganizationsLanding.createOrganizationProfile")}
            </Button>
            <Button size="lg" variant="outline" className="gap-2" asChild>
              <Link to="/explore"><Compass className="h-4 w-4" /> {t("uiOrganizationsLanding.exploreEcosystem")}</Link>
            </Button>
          </motion.div>
        </div>
      </section>

      {/* Why Join */}
      <section ref={triggerRef} className="border-t border-border bg-muted/40">
        <div className="container py-16 md:py-24">
          <h2 className="font-display text-2xl md:text-3xl font-bold text-center mb-12">{t("uiOrganizationsLanding.whyJoinTheEcosystem")}</h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {WHY_JOIN.map((item, i) => (
              <motion.div key={item.title} custom={i} variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true }}
                className="rounded-2xl border border-border bg-card p-6 text-center"
              >
                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <item.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="font-display font-semibold text-sm mb-1">{item.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="border-t border-border">
        <div className="container py-16 md:py-24">
          <h2 className="font-display text-2xl md:text-3xl font-bold text-center mb-12">{t("uiOrganizationsLanding.howItWorks")}</h2>
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <motion.div key={s.step} custom={i} variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true }}
                className="relative"
              >
                <div className="text-5xl font-display font-black text-primary/10 mb-2">{s.step}</div>
                <h3 className="font-display font-semibold text-lg mb-2">{s.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Organization Types */}
      <section className="border-t border-border bg-muted/40">
        <div className="container py-16 md:py-24">
          <h2 className="font-display text-2xl md:text-3xl font-bold text-center mb-4">{t("uiOrganizationsLanding.typesOfOrganizations")}</h2>
          <p className="text-muted-foreground text-center mb-12 max-w-lg mx-auto">
            {t("uiOrganizationsLanding.whetherPublicOrPrivateLargeOr")}
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {ORG_TYPES.map((t, i) => (
              <motion.div key={t.label} custom={i} variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true }}
                className="rounded-2xl border border-border bg-card p-5 text-center"
              >
                <t.icon className="h-8 w-8 text-primary mx-auto mb-3" />
                <h3 className="font-display font-semibold text-sm mb-1">{t.label}</h3>
                <p className="text-xs text-muted-foreground">{t.desc}</p>
              </motion.div>
            ))}
          </div>
          <div className="mt-8 text-center">
            <p className="text-sm text-muted-foreground mb-3">
              {t("uiOrganizationsLanding.ifYouReA")} <strong>{t("uiOrganizationsLanding.daoCollectiveOrCommunity")}</strong>{t("uiOrganizationsLanding.considerCreatingA")}{" "}
              <Link to="/create/guild-info" className="text-primary font-medium hover:underline">{t("uiOrganizationsLanding.guild")}</Link> instead.
            </p>
          </div>
        </div>
      </section>

      {/* Governance & Transparency */}
      <section className="border-t border-border">
        <div className="container py-16 md:py-24 max-w-3xl mx-auto text-center">
          <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}>
            <Shield className="h-8 w-8 text-primary mx-auto mb-6" />
            <h2 className="font-display text-2xl md:text-3xl font-bold mb-6">{t("uiOrganizationsLanding.governanceTransparency")}</h2>
            <div className="grid gap-4 sm:grid-cols-2 text-left">
              <div className="rounded-xl border border-border bg-card p-4">
                <Zap className="h-5 w-5 text-amber-500 mb-2" />
                <h3 className="font-semibold text-sm mb-1">{t("uiOrganizationsLanding.xpReputation")}</h3>
                <p className="text-xs text-muted-foreground">{t("uiOrganizationsLanding.nonFinancialReputationEarnedThroughContributions")}</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <Sparkles className="h-5 w-5 text-blue-500 mb-2" />
                <h3 className="font-semibold text-sm mb-1">{t("uiOrganizationsLanding.creditsPlatformCurrency")}</h3>
                <p className="text-xs text-muted-foreground">{t("uiOrganizationsLanding.internalCurrencyForPremiumFeaturesEarned")}</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <Globe className="h-5 w-5 text-emerald-500 mb-2" />
                <h3 className="font-semibold text-sm mb-1">{t("uiOrganizationsLanding.moneyRealTransactions")}</h3>
                <p className="text-xs text-muted-foreground">{t("uiOrganizationsLanding.stripePoweredPaymentsForQuestsServices")}</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <Shield className="h-5 w-5 text-purple-500 mb-2" />
                <h3 className="font-semibold text-sm mb-1">{t("uiOrganizationsLanding.openCollaboration")}</h3>
                <p className="text-xs text-muted-foreground">{t("uiOrganizationsLanding.reputationBasedTrustGovernanceRightsDepend")}</p>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="border-t border-border bg-primary/5">
        <div className="container py-16 text-center">
          <h2 className="font-display text-2xl md:text-3xl font-bold mb-3">{t("uiOrganizationsLanding.readyToJoinTheEcosystem")}</h2>
          <p className="text-muted-foreground mb-6">{t("uiOrganizationsLanding.createYourOrganizationProfileAndStart")}</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button size="lg" onClick={() => handleGatedClick("create an organization profile", "/onboarding/organization")}>
              {t("uiOrganizationsLanding.createOrganizationProfile")} <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link to="/explore">{t("uiOrganizationsLanding.exploreThePlatform")}</Link>
            </Button>
          </div>
        </div>
      </section>

      <SiteFooter />
      <CookieConsentBanner />
      <GuestOnboardingAssistant open={guestOpen} onOpenChange={setGuestOpen} actionLabel={guestAction} />
    </div>
  );
}
