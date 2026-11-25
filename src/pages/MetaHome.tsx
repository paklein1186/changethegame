import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles, Sprout, Landmark, HandHelping, Building2, Compass, ShieldCheck } from "lucide-react";
import logoImg from "@/assets/logo.png";

import { Button } from "@/components/ui/button";
import { SiteFooter } from "@/components/SiteFooter";
import { CookieConsentBanner } from "@/components/CookieConsentBanner";
import { LandingLanguageSwitcher } from "@/components/LandingLanguageSwitcher";
import { LandingStatBar } from "@/components/landing/LandingStatBar";
import { LandingLivingMapSection } from "@/components/landing/LandingLivingMapSection";
import { LandingEntityConstellation } from "@/components/landing/LandingEntityConstellation";

import { useTranslation } from "react-i18next";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { setPosture, type Posture } from "@/lib/posture";

const fadeUp = {
  hidden: { opacity: 0, y: 22 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.07, duration: 0.5, ease: "easeOut" as const },
  }),
};

const TROIS_TIERS_URL = "/guilds/4964c699-4684-43a9-b508-cee21c77e24e";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary mb-3">{children}</p>;
}

/**
 * Public meta home: one sentence on the course, then the five doors by posture.
 * Each door remembers the posture so onboarding starts on the right path.
 */
export default function MetaHome() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  useDocumentTitle(t("pageTitles.landing"));
  const m = (s: string) => t(`metaHome.${s}`);
  const k = (s: string) => t(`landing.home.${s}`);

  const doors: { key: string; posture: Posture; to: string; icon: typeof Sprout; primary?: boolean }[] = [
    { key: "initiative", posture: "initiative", to: "/home/initiative", icon: Sprout, primary: true },
    { key: "territory", posture: "territory", to: "/home/territoire", icon: Landmark, primary: true },
    { key: "contributor", posture: "contributor", to: "/welcome", icon: HandHelping },
    { key: "organization", posture: "organization", to: "/landing/organization", icon: Building2 },
    { key: "explorer", posture: "explorer", to: "/explore", icon: Compass },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* ─── Nav ─── */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-lg">
        <div className="container px-5 sm:px-6 lg:px-8 flex h-14 items-center justify-between gap-2">
          <Link to="/home" className="flex items-center gap-2 font-display text-base sm:text-lg font-bold tracking-tight min-w-0">
            <img src={logoImg} alt="changethegame" className="h-6 w-6 shrink-0" />
            <span className="truncate">changethegame</span>
          </Link>
          <nav className="flex items-center gap-1 sm:gap-2 shrink-0">
            <LandingLanguageSwitcher />
            <Button variant="ghost" size="sm" onClick={() => navigate("/login")}>
              {k("nav.login")}
            </Button>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* ─── Course + doors ─── */}
        <section className="relative overflow-hidden border-b border-border">
          <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-background to-background" />
          <div className="container relative z-10 px-5 sm:px-6 lg:px-8 py-14 md:py-24">
            <div className="text-center max-w-3xl mx-auto">
              <motion.span
                initial={{ opacity: 0, y: -12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium mb-6"
              >
                <Sparkles className="h-3 w-3" /> {m("badge")}
              </motion.span>
              <motion.h1
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.6 }}
                className="font-display text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight leading-[1.08]"
              >
                {m("title")}
              </motion.h1>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.25, duration: 0.6 }}
                className="mt-6 text-lg text-muted-foreground leading-relaxed"
              >
                {m("sub")}
              </motion.p>
            </div>

            <h2 className="sr-only">{m("question")}</h2>
            <p className="text-center font-display text-xl font-semibold mt-12 mb-6" aria-hidden="true">
              {m("question")}
            </p>

            <div className="grid gap-4 md:grid-cols-2 max-w-5xl mx-auto">
              {doors
                .filter((d) => d.primary)
                .map((d, i) => (
                  <motion.div key={d.key} custom={i} variants={fadeUp} initial="hidden" animate="show">
                    <Link
                      to={d.to}
                      onClick={() => setPosture(d.posture)}
                      className="group flex h-full flex-col rounded-2xl border border-border bg-card p-7 text-left transition-all hover:border-primary/40 hover:shadow-md hover:-translate-y-0.5"
                    >
                      <div className="h-11 w-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-5">
                        <d.icon className="h-5 w-5" />
                      </div>
                      <h3 className="font-display text-2xl font-bold leading-snug">{m(`doors.${d.key}.title`)}</h3>
                      <p className="text-muted-foreground leading-relaxed mt-2 flex-1">{m(`doors.${d.key}.desc`)}</p>
                      <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
                        {m(`doors.${d.key}.cta`)}
                        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                      </span>
                    </Link>
                  </motion.div>
                ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-3 max-w-5xl mx-auto mt-4">
              {doors
                .filter((d) => !d.primary)
                .map((d, i) => (
                  <motion.div key={d.key} custom={i + 2} variants={fadeUp} initial="hidden" animate="show">
                    <Link
                      to={d.to}
                      onClick={() => setPosture(d.posture)}
                      className="group flex h-full items-start gap-3 rounded-2xl border border-border bg-card p-5 text-left transition-all hover:border-primary/40 hover:shadow-md"
                    >
                      <div className="h-9 w-9 shrink-0 rounded-lg bg-accent/50 text-foreground flex items-center justify-center">
                        <d.icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-display font-semibold leading-snug">{m(`doors.${d.key}.title`)}</h3>
                        <p className="text-sm text-muted-foreground leading-relaxed mt-1">{m(`doors.${d.key}.desc`)}</p>
                      </div>
                    </Link>
                  </motion.div>
                ))}
            </div>

            <div className="mt-12">
              <LandingStatBar />
            </div>
          </div>
        </section>

        {/* ─── Proof that it is alive ─── */}
        <LandingLivingMapSection />

        {/* ─── What the platform brings together ─── */}
        <section className="border-b border-border">
          <div className="container px-5 sm:px-6 lg:px-8 py-14 md:py-20">
            <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
              <div>
                <SectionLabel>{t("landingV2.entities.label")}</SectionLabel>
                <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight leading-tight">
                  {t("landingV2.entities.title")}
                </h2>
                <p className="mt-5 text-muted-foreground leading-relaxed">{t("landingV2.entities.lead")}</p>
              </div>
              <LandingEntityConstellation />
            </div>
          </div>
        </section>

        {/* ─── One story ─── */}
        <section className="border-b border-border bg-muted/30">
          <div className="container px-5 sm:px-6 lg:px-8 py-14 md:py-20 max-w-3xl">
            <SectionLabel>{k("story.label")}</SectionLabel>
            <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight">{k("story.title")}</h2>
            <p className="mt-5 text-muted-foreground leading-relaxed">{m("storyShort")}</p>
            <Link to={TROIS_TIERS_URL} className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
              {m("storyCta")} <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </section>

        {/* ─── The cooperative ─── */}
        <section>
          <div className="container px-5 sm:px-6 lg:px-8 py-14 md:py-20 max-w-3xl text-center">
            <ShieldCheck className="h-6 w-6 text-primary mx-auto mb-4" />
            <h2 className="font-display text-2xl md:text-3xl font-bold tracking-tight">{m("coopTitle")}</h2>
            <p className="mt-4 text-muted-foreground leading-relaxed">{m("coopDesc")}</p>
            <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
              <Button variant="outline" asChild>
                <Link to="/vision">{m("coopVision")}</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link to="/team">{m("coopTeam")}</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
      <CookieConsentBanner />
    </div>
  );
}
