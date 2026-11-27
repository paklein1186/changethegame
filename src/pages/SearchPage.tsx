import i18n from "@/i18n/config";
import { useState, useMemo } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Search, Filter, Users, Shield, Compass, Briefcase, Building2, Boxes, Loader2, MapPin } from "lucide-react";
import { UnitCoverImage, type UnitType } from "@/components/UnitCoverImage";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { PageShell } from "@/components/PageShell";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useTopics, useTerritories } from "@/hooks/useSupabaseData";
import { globalSearch, type SearchResult, type SearchResultType } from "@/lib/search";
import { useQuery } from "@tanstack/react-query";
import { useTrustSummaryBatch } from "@/hooks/useTrustSummary";
import { TrustSummaryBadge } from "@/components/trust/TrustSummaryBadge";
import { useTranslation } from "react-i18next";
import { translateTopicName } from "@/lib/entityLabels";

const TYPE_META: Record<SearchResultType, { label: string; icon: typeof Users; color: string }> = {
  USER: { get label() { return i18n.t("uiSearchPage.users"); }, icon: Users, color: "text-blue-600" },
  GUILD: { get label() { return i18n.t("uiSearchPage.guilds"); }, icon: Shield, color: "text-emerald-600" },
  QUEST: { get label() { return i18n.t("uiSearchPage.quests"); }, icon: Compass, color: "text-amber-600" },
  POD: { get label() { return i18n.t("uiSearchPage.pods"); }, icon: Boxes, color: "text-violet-600" },
  SERVICE: { get label() { return i18n.t("uiSearchPage.services"); }, icon: Briefcase, color: "text-rose-600" },
  COMPANY: { get label() { return i18n.t("uiSearchPage.companies"); }, icon: Building2, color: "text-cyan-600" },
  TERRITORY: { get label() { return i18n.t("uiSearchPage.territories"); }, icon: MapPin, color: "text-orange-600" },
};

export default function SearchPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const currentUser = useCurrentUser();
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [topicId, setTopicId] = useState("ALL");
  const [territoryId, setTerritoryId] = useState("ALL");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");

  const { data: topics } = useTopics();
  const { data: territories } = useTerritories();

  const { data: results = [], isLoading } = useQuery({
    queryKey: ["global-search", query, currentUser.id, topicId, territoryId, priceMin, priceMax],
    enabled: query.trim().length >= 2,
    queryFn: () => globalSearch(query, currentUser.id, {
      topicId: topicId !== "ALL" ? topicId : undefined,
      territoryId: territoryId !== "ALL" ? territoryId : undefined,
      priceMin: priceMin ? Number(priceMin) : undefined,
      priceMax: priceMax ? Number(priceMax) : undefined,
    }),
  });

  const filtered = useMemo(() => {
    if (typeFilter === "ALL") return results;
    return results.filter((r) => r.type === typeFilter);
  }, [results, typeFilter]);

  const grouped = useMemo(() => {
    const map = new Map<SearchResultType, SearchResult[]>();
    for (const r of filtered) {
      if (!map.has(r.type)) map.set(r.type, []);
      map.get(r.type)!.push(r);
    }
    return map;
  }, [filtered]);

  // Map search result types to trust node types
  const TRUST_NODE_MAP: Record<string, string> = { USER: "profile", GUILD: "guild", QUEST: "quest", SERVICE: "service", COMPANY: "partner_entity" };
  const trustableIds = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const r of filtered) {
      const nodeType = TRUST_NODE_MAP[r.type];
      if (nodeType) {
        if (!map[nodeType]) map[nodeType] = [];
        map[nodeType].push(r.id);
      }
    }
    return map;
  }, [filtered]);

  const { data: profileTrust } = useTrustSummaryBatch("profile", trustableIds["profile"] ?? []);
  const { data: guildTrust } = useTrustSummaryBatch("guild", trustableIds["guild"] ?? []);
  const { data: questTrust } = useTrustSummaryBatch("quest", trustableIds["quest"] ?? []);
  const { data: serviceTrust } = useTrustSummaryBatch("service", trustableIds["service"] ?? []);
  const { data: companyTrust } = useTrustSummaryBatch("partner_entity", trustableIds["partner_entity"] ?? []);

  const allTrust = useMemo(() => ({ ...profileTrust, ...guildTrust, ...questTrust, ...serviceTrust, ...companyTrust }), [profileTrust, guildTrust, questTrust, serviceTrust, companyTrust]);

  return (
    <PageShell>
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-display font-bold mb-6 flex items-center gap-2">
          <Search className="h-6 w-6" /> {t("uiSearchPage.advancedSearch")}
        </h1>

        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("uiSearchPage.searchAcrossAllEntities")}
            className="pl-10 h-12 text-base"
          />
        </div>

        <div className="flex flex-wrap gap-3 mb-6 p-4 rounded-lg border border-border bg-muted/30">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Filter className="h-4 w-4" /> {t("uiSearchPage.filters")}
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder={t("uiSearchPage.type")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{t("uiSearchPage.allTypes")}</SelectItem>
              {(Object.keys(TYPE_META) as SearchResultType[]).map((t) => (
                <SelectItem key={t} value={t}>{TYPE_META[t].label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={topicId} onValueChange={setTopicId}>
            <SelectTrigger className="w-[180px] h-9"><SelectValue placeholder={t("uiSearchPage.topic")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{t("uiSearchPage.allTopics")}</SelectItem>
              {(topics ?? []).map((topic) => <SelectItem key={topic.id} value={topic.id}>{translateTopicName(topic.name, t)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={territoryId} onValueChange={setTerritoryId}>
            <SelectTrigger className="w-[160px] h-9"><SelectValue placeholder={t("uiSearchPage.territory")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{t("uiSearchPage.allTerritories")}</SelectItem>
              {(territories ?? []).map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1">
            <Input type="number" value={priceMin} onChange={(e) => setPriceMin(e.target.value)} placeholder={t("uiSearchPage.min")} className="w-[80px] h-9" />
            <span className="text-muted-foreground text-sm">–</span>
            <Input type="number" value={priceMax} onChange={(e) => setPriceMax(e.target.value)} placeholder={t("uiSearchPage.max")} className="w-[80px] h-9" />
          </div>
        </div>

        {query.trim().length < 2 ? (
          <p className="text-muted-foreground text-center py-12">{t("uiSearchPage.typeAtLeast2CharactersTo")}</p>
        ) : isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <p className="text-muted-foreground text-center py-12">{t("uiSearchPage.noResultsFoundFor")}{query}".</p>
        ) : (
          <div className="space-y-8">
            <p className="text-sm text-muted-foreground">{filtered.length} result{filtered.length !== 1 ? "s" : ""} found</p>
            {Array.from(grouped.entries()).map(([type, items]) => {
              const meta = TYPE_META[type];
              const Icon = meta.icon;
              return (
                <div key={type}>
                  <h2 className="font-display font-semibold text-lg mb-3 flex items-center gap-2">
                    <Icon className={`h-5 w-5 ${meta.color}`} />
                    {meta.label}
                    <Badge variant="secondary" className="text-xs">{items.length}</Badge>
                  </h2>
                  <div className="space-y-2">
                    {items.map((item) => (
                      <Link key={`${item.type}-${item.id}`} to={item.url}>
                      <Card className="hover:bg-muted/50 transition-colors cursor-pointer overflow-hidden">
                          <CardContent className="p-0 flex items-center gap-0">
                            {item.type === "USER" ? (
                              <div className="w-16 h-16 shrink-0 flex items-center justify-center ml-2">
                                <Avatar className="h-12 w-12">
                                  <AvatarImage src={item.imageUrl ?? undefined} alt={item.title} />
                                  <AvatarFallback className="text-sm font-medium">{item.title?.charAt(0) ?? "?"}</AvatarFallback>
                                </Avatar>
                              </div>
                            ) : (
                              <UnitCoverImage type={item.type as UnitType} imageUrl={item.imageUrl} logoUrl={item.logoUrl} name={item.title} height="h-20" className="w-20 shrink-0" />
                            )}
                             <div className="p-4 min-w-0 flex flex-col justify-center flex-1">
                              <div className="flex items-center gap-2 mb-0.5">
                                <Badge variant="outline" className="text-[10px] shrink-0">{item.type}</Badge>
                              </div>
                              <p className="font-medium truncate">{item.title}</p>
                              {item.subtitle && <p className="text-sm text-muted-foreground truncate">{item.subtitle}</p>}
                              <TrustSummaryBadge summary={allTrust[item.id]} variant="full" />
                            </div>
                          </CardContent>
                        </Card>
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </PageShell>
  );
}
