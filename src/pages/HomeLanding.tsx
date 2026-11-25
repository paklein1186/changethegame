import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight, Sparkles, Map, Database, FileText, Eye, Network, HandHeart,
  Quote, ShieldCheck, GitBranch, Mail, Users, MapPin, Coins, Compass,
  Sprout, Landmark, Building2, TrendingUp, Search, Share2,
} from "lucide-react";
import logoImg from "@/assets/logo.png";
import heroCollective from "@/assets/home-collective.png.asset.json";

import { Button } from "@/components/ui/button";
import { SiteFooter } from "@/components/SiteFooter";
import { CookieConsentBanner } from "@/components/CookieConsentBanner";
import { LandingLanguageSwitcher } from "@/components/LandingLanguageSwitcher";
import { LandingStatBar } from "@/components/landing/LandingStatBar";
import { LandingLivingMapSection } from "@/components/landing/LandingLivingMapSection";
import { LandingEntityConstellation } from "@/components/landing/LandingEntityConstellation";

import { useTranslation } from "react-i18next";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { setPosture } from "@/lib/posture";

const fadeUp = {
  hidden: { opacity: 0, y: 22 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.07, duration: 0.5, ease: "easeOut" as const },
  }),
};

const ENTITY_LINKS: { label: string; to: string }[] = [
  { label: "Trois-Tiers", to: "/guilds/4964c699-4684-43a9-b508-cee21c77e24e" },
  { label: "Poiethic", to: "/companies/e786a8cc-6e46-4fed-ae25-0e5fed5f7f90" },
];

/** Turns known entity names inside a plain string into bold links to their pages. */
function linkifyEntities(text: string): React.ReactNode[] {
  const pattern = new RegExp(`(${ENTITY_LINKS.map((e) => e.label).join("|")})`, "g");
  return text.split(pattern).map((part, i) => {
    const match = ENTITY_LINKS.find((e) => e.label === part);
    if (!match) return <span key={i}>{part}</span>;
    return (
      <Link key={i} to={match.to} className="font-semibold text-primary hover:underline">
        {part}
      </Link>
    );
  });
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary mb-3">
      {children}
    </p>
  );
}

export default function HomeLanding({ mode = "initiative" }: { mode?: "initiative" | "territory" }) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  useDocumentTitle(t("pageTitles.landing"));
  const k = (s: string) => t(`landing.home.${s}`);
  const v = (s: string) => t(`landingV2.${s}`);
  const MODE_PATH = { initiative: "/home/initiative", territory: "/home/territoire" } as const;
  const h = (s: string) => v(`hero.${mode === "initiative" ? "initiative." : ""}${s}`);

  const failures = [
    { icon: Map, t: k("problem.c1t"), d: k("problem.c1d") },
    { icon: Database, t: k("problem.c2t"), d: k("problem.c2d") },
    { icon: FileText, t: k("problem.c3t"), d: k("problem.c3d") },
  ];

  const entityGroups = [
    { icon: Users, key: "who" },
    { icon: MapPin, key: "where" },
    { icon: Coins, key: "with" },
    { icon: Compass, key: "why" },
  ];

  const gestures = [
    { icon: Eye, n: "01", key: "g1", to: "/explore" },
    { icon: Network, n: "02", key: "g2", to: "/agents" },
    { icon: HandHeart, n: "03", key: "g3", to: "/explore/quests-info" },
  ];

  const storySteps = [1, 2, 3, 4, 5].map((i) => ({
    t: k(`story.s${i}t`),
    d: k(`story.s${i}d`),
  }));

  const initiativeBenefits = [
    { icon: TrendingUp, n: "01", key: "b1" },
    { icon: Search, n: "02", key: "b2" },
    { icon: Share2, n: "03", key: "b3" },
  ];

  const doors = [
    { icon: Sprout, key: "d1", to: "/signup", posture: "initiative" as const },
    { icon: Landmark, key: "d2", to: "/territories", posture: "territory" as const },
    { icon: Building2, key: "d3", to: "/opportunities", posture: "organization" as const },
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
            <Button variant="ghost" size="sm" className="hidden sm:inline-flex" onClick={() => navigate("/login")}>
              {k("nav.login")}
            </Button>
            <Button size="sm" className="gap-1.5 px-2.5 sm:px-3" onClick={() => { setPosture(mode); navigate("/signup"); }}>
              <span className="truncate max-w-[9rem]">{k("nav.cta")}</span> <ArrowRight className="h-3.5 w-3.5 shrink-0" />
            </Button>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* ─── Hero ─── */}
        <section className="relative overflow-hidden border-b border-border">
          <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-background to-background" />
          <div className="container relative z-10 px-5 sm:px-6 lg:px-8 py-16 md:py-28 text-center">
            <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
              <div
                role="group"
                aria-label={v("mode.label")}
                className="inline-flex flex-wrap justify-center gap-1 rounded-full border border-border bg-card p-1 mb-6"
              >
                {(["initiative", "territory"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={mode === m}
                    onClick={() => navigate(MODE_PATH[m], { replace: true })}
                    className={
                      "rounded-full px-4 py-2 text-sm font-medium transition-colors min-h-[40px] " +
                      (mode === m ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")
                    }
                  >
                    {v(`mode.${m}`)}
                  </button>
                ))}
              </div>
              <div>
                <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium mb-6">
                  <Sparkles className="h-3 w-3" /> {v("hero.badge")}
                </span>
              </div>
            </motion.div>
            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.6 }}
              className="font-display text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight leading-[1.08] max-w-4xl mx-auto"
            >
              {h("title1")}{" "}
              <span className="text-primary">{h("title2")}</span>
            </motion.h1>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.25, duration: 0.6 }}
              className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed"
            >
              {h("sub")}
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.5 }}
              className="mt-9 flex flex-col sm:flex-row gap-3 justify-center"
            >
              <Button size="lg" className="gap-2" asChild>
                <Link
                  to={mode === "initiative" ? "/signup" : "/explore"}
                  onClick={() => mode === "initiative" && setPosture("initiative")}
                >
                  {h("cta1")} <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                {mode === "initiative" ? (
                  <Link to="/opportunities">{h("cta2")}</Link>
                ) : (
                  <a href="#co-experimentation">{h("cta2")}</a>
                )}
              </Button>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.7 }}
              className="mt-12 max-w-5xl mx-auto"
            >
              <img
                src={heroCollective.url}
                alt={h("title1") + " " + h("title2")}
                loading="lazy"
                className="w-full rounded-2xl border border-border shadow-lg"
              />
            </motion.div>
            <div className="mt-12">
              <LandingStatBar />
            </div>
          </div>
        </section>

        {/* ─── Living map: what is connecting right now ─── */}
        <LandingLivingMapSection />

        {/* ─── Problem ─── */}
        <section className="border-b border-border">
          <div className="container px-5 sm:px-6 lg:px-8 py-14 md:py-20">
            <div className="max-w-3xl">
              <SectionLabel>{k("problem.label")}</SectionLabel>
              <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight leading-tight">
                {k("problem.title")}
              </h2>
              <p className="mt-5 text-muted-foreground leading-relaxed">{k("problem.lead")}</p>
              <p className="mt-3 text-muted-foreground leading-relaxed">{k("problem.lead2")}</p>
            </div>

            <div className="grid gap-4 md:grid-cols-3 mt-10">
              {failures.map((f, i) => (
                <motion.div
                  key={f.t}
                  custom={i}
                  variants={fadeUp}
                  initial="hidden"
                  whileInView="show"
                  viewport={{ once: true, margin: "-60px" }}
                  className="rounded-2xl border border-border bg-card p-6"
                >
                  <div className="h-10 w-10 rounded-xl bg-destructive/10 text-destructive flex items-center justify-center mb-4">
                    <f.icon className="h-5 w-5" />
                  </div>
                  <h3 className="font-display font-semibold mb-1.5">{f.t}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{f.d}</p>
                </motion.div>
              ))}
            </div>

            <p className="mt-8 text-sm font-medium text-foreground/80 border-l-2 border-primary pl-4 max-w-2xl">
              {k("problem.result")}
            </p>
          </div>
        </section>

        {/* ─── Entities ─── */}
        <section className="border-b border-border bg-muted/30">
          <div className="container px-5 sm:px-6 lg:px-8 py-14 md:py-20">
            <div className="max-w-3xl">
              <SectionLabel>{v("entities.label")}</SectionLabel>
              <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight leading-tight">
                {v("entities.title")}
              </h2>
              <p className="mt-5 text-muted-foreground leading-relaxed">{v("entities.lead")}</p>
            </div>

            <div className="grid gap-10 lg:grid-cols-2 lg:items-center mt-10">
              <LandingEntityConstellation center={mode} />

              <div className="grid gap-4 sm:grid-cols-2">
                {entityGroups.map((g, i) => (
                  <motion.div
                    key={g.key}
                    custom={i}
                    variants={fadeUp}
                    initial="hidden"
                    whileInView="show"
                    viewport={{ once: true, margin: "-60px" }}
                    className="rounded-2xl border border-border bg-card p-6"
                  >
                    <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-4">
                      <g.icon className="h-5 w-5" />
                    </div>
                    <p className="text-xs uppercase tracking-wider text-primary mb-1">{v(`entities.groups.${g.key}.label`)}</p>
                    <h3 className="font-display font-semibold mb-1.5">{v(`entities.groups.${g.key}.title`)}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{v(`entities.groups.${g.key}.desc`)}</p>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ─── For impact initiatives ─── */}
        <section id="initiatives" className="border-b border-border bg-primary/5">
          <div className="container px-5 sm:px-6 lg:px-8 py-14 md:py-20">
            <div className="max-w-3xl">
              <SectionLabel>{v("initiatives.label")}</SectionLabel>
              <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight leading-tight">{v("initiatives.title")}</h2>
              <p className="mt-5 text-muted-foreground leading-relaxed">{v("initiatives.lead")}</p>
            </div>

            <div className="grid gap-4 md:grid-cols-3 mt-10">
              {initiativeBenefits.map((b, i) => (
                <motion.div
                  key={b.key}
                  custom={i}
                  variants={fadeUp}
                  initial="hidden"
                  whileInView="show"
                  viewport={{ once: true, margin: "-40px" }}
                  className="rounded-2xl border border-border bg-card p-6"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                      <b.icon className="h-5 w-5" />
                    </div>
                    <span className="text-xs font-mono text-muted-foreground">{b.n}</span>
                  </div>
                  <h3 className="font-display text-lg font-bold">{v(`initiatives.${b.key}t`)}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed mt-2">{v(`initiatives.${b.key}d`)}</p>
                </motion.div>
              ))}
            </div>

            <div className="mt-8">
              <Button size="lg" className="gap-2" asChild>
                <Link to="/signup" onClick={() => setPosture("initiative")}>
                  {v("initiatives.cta")} <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </section>

        {/* ─── How it works: three gestures ─── */}
        <section className="border-b border-border">
          <div className="container px-5 sm:px-6 lg:px-8 py-14 md:py-20">
            <div className="text-center max-w-2xl mx-auto mb-12">
              <SectionLabel>{v("how.label")}</SectionLabel>
              <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight">{v("how.title")}</h2>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {gestures.map((p, i) => (
                <motion.div
                  key={p.n}
                  custom={i}
                  variants={fadeUp}
                  initial="hidden"
                  whileInView="show"
                  viewport={{ once: true, margin: "-40px" }}
                >
                  <Link
                    to={p.to}
                    className="group block h-full rounded-2xl border border-border bg-card p-6 transition-all hover:border-primary/40 hover:shadow-md hover:-translate-y-0.5"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                        <p.icon className="h-5 w-5" />
                      </div>
                      <span className="text-xs font-mono text-muted-foreground">{p.n}</span>
                    </div>
                    <h3 className="font-display text-lg font-bold uppercase tracking-tight">{v(`how.${p.key}t`)}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed mt-2">{v(`how.${p.key}d`)}</p>
                  </Link>
                </motion.div>
              ))}
            </div>

            <div className="text-center mt-8">
              <Link to="/how-it-works" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
                {v("how.more")} <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </section>

        {/* ─── Doors: where to start ─── */}
        <section className="border-b border-border bg-muted/30">
          <div className="container px-5 sm:px-6 lg:px-8 py-14 md:py-20">
            <div className="text-center max-w-2xl mx-auto mb-12">
              <SectionLabel>{v("doors.label")}</SectionLabel>
              <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight">{v("doors.title")}</h2>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {doors.map((d, i) => (
                <motion.div
                  key={d.key}
                  custom={i}
                  variants={fadeUp}
                  initial="hidden"
                  whileInView="show"
                  viewport={{ once: true, margin: "-40px" }}
                >
                  <Link
                    to={d.to}
                    onClick={() => setPosture(d.posture)}
                    className="group flex h-full flex-col rounded-2xl border border-border bg-card p-7 transition-all hover:border-primary/40 hover:shadow-md hover:-translate-y-0.5"
                  >
                    <div className="h-10 w-10 rounded-xl bg-accent/50 text-foreground flex items-center justify-center mb-5">
                      <d.icon className="h-5 w-5" />
                    </div>
                    <h3 className="font-display text-xl font-bold leading-snug">{v(`doors.${d.key}t`)}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed mt-2 flex-1">{v(`doors.${d.key}d`)}</p>
                    <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
                      {v(`doors.${d.key}cta`)} <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </Link>
                </motion.div>
              ))}
            </div>

            <p className="text-center text-sm text-muted-foreground mt-8 max-w-2xl mx-auto">{v("doors.others")}</p>
          </div>
        </section>

        {/* ─── Story (example) ─── */}
        <section className="border-b border-border">
          <div className="container px-5 sm:px-6 lg:px-8 py-14 md:py-20">
            <div className="max-w-3xl">
              <SectionLabel>{k("story.label")}</SectionLabel>
              <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight">{k("story.title")}</h2>
              <p className="mt-5 text-muted-foreground leading-relaxed">{k("story.lead")}</p>
              <p className="mt-3 text-muted-foreground leading-relaxed">{k("story.lead2")}</p>
              <p className="mt-3 text-muted-foreground leading-relaxed">{linkifyEntities(k("story.lead3"))}</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5 mt-10">
              {storySteps.map((s, i) => (
                <motion.div
                  key={s.t}
                  custom={i}
                  variants={fadeUp}
                  initial="hidden"
                  whileInView="show"
                  viewport={{ once: true, margin: "-40px" }}
                  className="relative rounded-2xl border border-border bg-card p-5"
                >
                  <span className="text-xs font-mono text-primary">{`0${i + 1}`}</span>
                  <h3 className="font-display font-semibold mt-2">{s.t}</h3>
                  <p className="text-xs text-muted-foreground mt-1">{s.d}</p>
                </motion.div>
              ))}
            </div>

            <div className="mt-8 flex flex-wrap gap-2">
              {[k("story.tag1"), k("story.tag2"), k("story.tag3"), k("story.tag4")].map((tag) => (
                <span key={tag} className="rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
                  {tag}
                </span>
              ))}
            </div>

            <figure className="mt-8 max-w-3xl rounded-2xl border border-primary/30 bg-primary/5 p-7">
              <Quote className="h-6 w-6 text-primary mb-3" />
              <blockquote className="text-lg leading-relaxed font-display">{k("story.quote")}</blockquote>
              <figcaption className="mt-4 text-sm text-muted-foreground">— {k("story.quoteAuthor")}</figcaption>
            </figure>

            <p className="mt-6 max-w-3xl text-sm text-muted-foreground border-l-2 border-primary pl-4">
              {linkifyEntities(k("story.credit"))}
            </p>
          </div>
        </section>

        {/* ─── Our course & governance ─── */}
        <section className="border-b border-border bg-muted/30">
          <div className="container px-5 sm:px-6 lg:px-8 py-14 md:py-20">
            <div className="max-w-3xl">
              <SectionLabel>{v("cap.label")}</SectionLabel>
              <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight leading-tight">{v("cap.title")}</h2>
            </div>

            <div className="grid gap-4 md:grid-cols-2 mt-10">
              {["vision", "purpose"].map((key) => (
                <div key={key} className="rounded-2xl border border-primary/30 bg-primary/5 p-7">
                  <p className="text-xs uppercase tracking-wider text-primary mb-2">{v(`cap.${key}Label`)}</p>
                  <p className="font-display text-lg leading-relaxed">{v(`cap.${key}`)}</p>
                </div>
              ))}
            </div>

            <div className="max-w-3xl mt-16">
              <SectionLabel>{k("governance.label")}</SectionLabel>
              <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight">{k("governance.title")}</h2>
              <p className="mt-5 text-muted-foreground leading-relaxed">{k("governance.lead")}</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3 mt-10">
              {[k("governance.col1"), k("governance.col2"), k("governance.col3")].map((c) => (
                <div key={c} className="rounded-2xl border border-border bg-card p-6 text-center">
                  <ShieldCheck className="h-5 w-5 text-primary mx-auto mb-3" />
                  <h3 className="font-display font-semibold">{c}</h3>
                  <p className="text-xs text-muted-foreground mt-1">{k("governance.colSub")}</p>
                </div>
              ))}
            </div>

            <div className="grid gap-4 sm:grid-cols-3 mt-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="rounded-2xl border border-border bg-card p-6">
                  <span className="text-xs font-mono text-primary">{`0${i}`}</span>
                  <h3 className="font-display font-semibold mt-2">{k(`governance.pr${i}t`)}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed mt-1.5">{k(`governance.pr${i}d`)}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-2xl border border-primary/30 bg-primary/5 p-7 flex gap-4">
              <GitBranch className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div>
                <h3 className="font-display font-semibold">{k("governance.openTitle")}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed mt-1.5 max-w-2xl">
                  {k("governance.openDesc")}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ─── Final CTA ─── */}
        <section id="co-experimentation" className="scroll-mt-20">
          <div className="container px-5 sm:px-6 lg:px-8 py-14 md:py-20 text-center max-w-2xl mx-auto">
            <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight">{v("final.title")}</h2>
            <p className="mt-3 text-lg text-primary">{v("final.sub")}</p>
            <p className="mt-5 text-muted-foreground leading-relaxed">{k("final.body")}</p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
              <Button size="lg" className="gap-2" onClick={() => { setPosture(mode); navigate("/signup"); }}>
                {k("final.cta1")} <ArrowRight className="h-4 w-4" />
              </Button>
              <Button size="lg" variant="outline" className="gap-2" asChild>
                <a href="mailto:pa@changethegame.xyz">
                  <Mail className="h-4 w-4" /> {k("final.cta2")}
                </a>
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
