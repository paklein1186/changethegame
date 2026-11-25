import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, Mail, ShieldCheck } from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

/**
 * Team & ecosystem hub — who builds changethegame, the cooperative behind it,
 * and the networks it grows with. Lists live here as data: add a person or an
 * organization by adding an entry (and its texts under `teamHub.*` in fr/en).
 */

const TEAM = [
  { key: "pa", name: "Pierre-Alexandre Klein", initials: "PA" },
  { key: "emelie", name: "Emelie Bergius", initials: "EB" },
  { key: "jeanPhilippe", name: "Jean-Philippe Vaudet", initials: "JV" },
  { key: "yannick", name: "Yannick Vilain", initials: "YV" },
] as const;

/** Founding members of the cooperative — add an entry only once the organization has agreed to be listed. */
const COOP_MEMBERS: { name: string; url?: string }[] = [];

/** Networks and partner entities, linked to their page on the platform when they have one. */
const NETWORKS = [
  { key: "troisTiers", name: "Trois-Tiers", to: "/guilds/4964c699-4684-43a9-b508-cee21c77e24e" },
  { key: "poiethic", name: "Poiethic", to: "/companies/e786a8cc-6e46-4fed-ae25-0e5fed5f7f90" },
] as const;

const TABS = [
  { value: "team", labelKey: "teamHub.tabs.team" },
  { value: "cooperative", labelKey: "teamHub.tabs.cooperative" },
  { value: "networks", labelKey: "teamHub.tabs.networks" },
] as const;

function TeamTab() {
  const { t } = useTranslation();
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {TEAM.map((p) => (
        <article key={p.key} className="rounded-2xl border border-border bg-card p-6 flex gap-4">
          <Avatar className="h-14 w-14 shrink-0">
            <AvatarFallback className="bg-primary/10 text-primary font-display font-bold">{p.initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <h3 className="font-display font-semibold text-lg leading-tight">{p.name}</h3>
            <p className="text-xs uppercase tracking-wider text-primary mt-1">{t(`teamHub.team.${p.key}.role`)}</p>
            <p className="text-sm text-muted-foreground leading-relaxed mt-2">{t(`teamHub.team.${p.key}.bio`)}</p>
          </div>
        </article>
      ))}
    </div>
  );
}

function CooperativeTab() {
  const { t } = useTranslation();
  const colleges = ["users", "operators", "funders"] as const;
  return (
    <div className="space-y-8">
      <p className="text-muted-foreground leading-relaxed max-w-2xl">{t("teamHub.cooperative.lead")}</p>

      <div className="grid gap-4 sm:grid-cols-3">
        {colleges.map((c) => (
          <div key={c} className="rounded-2xl border border-border bg-card p-6 text-center">
            <ShieldCheck className="h-5 w-5 text-primary mx-auto mb-3" />
            <h3 className="font-display font-semibold">{t(`teamHub.cooperative.colleges.${c}`)}</h3>
          </div>
        ))}
      </div>

      <section>
        <h2 className="font-display text-xl font-semibold mb-3">{t("teamHub.cooperative.membersTitle")}</h2>
        {COOP_MEMBERS.length > 0 ? (
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3">
            {COOP_MEMBERS.map((m) => (
              <div key={m.name} className="rounded-2xl border border-border bg-card p-5 font-display font-semibold text-center">
                {m.url ? <a href={m.url} target="_blank" rel="noreferrer" className="hover:text-primary">{m.name}</a> : m.name}
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
            {t("teamHub.cooperative.membersPending")}
          </p>
        )}
      </section>

      <div className="flex flex-wrap gap-3">
        <Button variant="outline" asChild>
          <Link to="/ecosystem?tab=governance">{t("teamHub.cooperative.ctaGovernance")}</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link to="/vision?tab=cooperative">{t("teamHub.cooperative.ctaCoop")}</Link>
        </Button>
      </div>
    </div>
  );
}

function NetworksTab() {
  const { t } = useTranslation();
  return (
    <div className="space-y-8">
      <p className="text-muted-foreground leading-relaxed max-w-2xl">{t("teamHub.networks.lead")}</p>

      <div className="grid gap-4 sm:grid-cols-2">
        {NETWORKS.map((n) => (
          <Link
            key={n.key}
            to={n.to}
            className="group block rounded-2xl border border-border bg-card p-6 transition-all hover:border-primary/40 hover:shadow-md"
          >
            <h3 className="font-display font-semibold text-lg">{n.name}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed mt-1.5">{t(`teamHub.networks.items.${n.key}`)}</p>
            <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
              {t("teamHub.networks.see")} <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </Link>
        ))}
      </div>

      <div className="rounded-2xl border border-primary/30 bg-primary/5 p-7">
        <h3 className="font-display font-semibold">{t("teamHub.networks.joinTitle")}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed mt-1.5 max-w-2xl">{t("teamHub.networks.joinDesc")}</p>
        <Button className="mt-4 gap-2" asChild>
          <a href="mailto:pa@changethegame.xyz">
            <Mail className="h-4 w-4" /> {t("teamHub.networks.joinCta")}
          </a>
        </Button>
      </div>
    </div>
  );
}

export default function TeamHub() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") || "team";
  const { t } = useTranslation();

  return (
    <PageShell>
      <div className="max-w-4xl mx-auto py-8 px-4">
        <h1 className="font-display text-2xl sm:text-3xl font-bold mb-1">{t("teamHub.title")}</h1>
        <p className="text-muted-foreground mb-6">{t("teamHub.subtitle")}</p>
        <Tabs value={tab} onValueChange={(v) => setParams({ tab: v }, { replace: true })}>
          <TabsList className="flex-wrap h-auto gap-1 mb-6">
            {TABS.map((item) => (
              <TabsTrigger key={item.value} value={item.value} className="text-xs sm:text-sm">
                {t(item.labelKey)}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="team"><TeamTab /></TabsContent>
          <TabsContent value="cooperative"><CooperativeTab /></TabsContent>
          <TabsContent value="networks"><NetworksTab /></TabsContent>
        </Tabs>
      </div>
    </PageShell>
  );
}
