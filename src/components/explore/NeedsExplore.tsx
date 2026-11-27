import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { HandHelping, MapPin, Search, Sparkles, Users, Globe2, Loader2, Send, ArrowRight, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

/** Catégories des besoins de quête (mêmes valeurs que QuestNeedsManager). */
const CATEGORIES = ["SKILLS", "RESOURCES", "FUNDING", "TOOLS", "PLACE", "MENTORSHIP", "VISIBILITY", "PARTNERSHIPS", "VOLUNTEER", "GENERAL"];
type Scope = "me" | "me_and_guilds" | "all";
const PAGE = 30;

interface NeedRow {
  need_id: string;
  title: string;
  description: string | null;
  category: string;
  created_at: string;
  quest_id: string;
  quest_title: string;
  owner_id: string;
  owner_name: string | null;
  guild_id: string | null;
  guild_name: string | null;
  guild_logo: string | null;
  territory_names: string[] | null;
  match_score: number | null;
  match_label: string | null;
  match_owner_type: string | null;
  match_owner_name: string | null;
  is_mine: boolean;
  my_proposal_pending: boolean;
  total_count: number;
}

interface TerritoryRow { territory_id: string; name: string; level: string; need_count: number }

const LEVEL_GROUPS: { key: string; levels: string[] }[] = [
  { key: "regions", levels: ["NATIONAL", "REGION", "PROVINCE", "BIOREGION"] },
  { key: "places", levels: ["TOWN", "LOCALITY", "OTHER"] },
];

/**
 * Onglet « Besoins » d'Explorer : les besoins ouverts des quêtes et de leurs guildes.
 * Par défaut, ceux qui correspondent aux compétences de la personne ; elle peut élargir à ses guildes ou à tout.
 * Filtres (territoire, catégorie, recherche, portée) gardés dans l'adresse : une vue se partage telle quelle.
 */
export function NeedsExplore() {
  const { t } = useTranslation();
  const currentUser = useCurrentUser();
  const isGuest = !currentUser.id;
  const [params, setParams] = useSearchParams();
  const qc = useQueryClient();
  const [offerFor, setOfferFor] = useState<NeedRow | null>(null);

  const scope = (["me", "me_and_guilds", "all"].includes(params.get("scope") ?? "")
    ? params.get("scope")
    : isGuest ? "all" : "me") as Scope;
  const territory = params.get("territory") ?? "";
  const category = params.get("category") ?? "";
  const [search, setSearch] = useState(params.get("q") ?? "");
  const [query, setQuery] = useState(search);
  const [limit, setLimit] = useState(PAGE);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next, { replace: true });
    setLimit(PAGE);
  };

  // Recherche : on attend la fin de la frappe avant d'interroger la base.
  useEffect(() => {
    const h = window.setTimeout(() => { setQuery(search.trim()); if (search.trim() !== (params.get("q") ?? "")) setParam("q", search.trim()); }, 300);
    return () => window.clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // ?offer=<need id> (from Pi or a shared link): open the offer form for that need, then drop the parameter.
  const offerParam = params.get("offer") ?? "";
  useEffect(() => {
    if (!offerParam || isGuest) return;
    let cancelled = false;
    (async () => {
      const { data: need } = await (supabase as any).from("quest_needs")
        .select("id, title, description, category, created_at, quest_id, quests(title, created_by_user_id, guild_id)")
        .eq("id", offerParam).maybeSingle();
      const { data: pending } = await (supabase as any).from("quest_proposals")
        .select("id").eq("need_id", offerParam).eq("proposer_type", "USER").eq("proposer_id", currentUser.id)
        .eq("status", "PENDING").limit(1);
      if (cancelled) return;
      const next = new URLSearchParams(params);
      next.delete("offer");
      setParams(next, { replace: true });
      if (!need) {
        toast.error(t("needsExplore.offerNotFound"));
        return;
      }
      setOfferFor({
        need_id: need.id, title: need.title, description: need.description, category: need.category ?? "GENERAL",
        created_at: need.created_at, quest_id: need.quest_id, quest_title: need.quests?.title ?? "",
        owner_id: need.quests?.created_by_user_id ?? "", owner_name: null, guild_id: need.quests?.guild_id ?? null,
        guild_name: null, guild_logo: null, territory_names: null, match_score: null, match_label: null,
        match_owner_type: null, match_owner_name: null, is_mine: false, my_proposal_pending: !!pending?.length, total_count: 0,
      });
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offerParam, isGuest, currentUser.id]);

  const { data: territories = [] } = useQuery({
    queryKey: ["explore-needs-territories"],
    queryFn: async (): Promise<TerritoryRow[]> => {
      const { data, error } = await (supabase as any).rpc("explore_needs_territories");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60_000,
  });

  // Territoire principal de la personne, pour le raccourci « Près de chez moi ».
  const { data: homeTerritory } = useQuery({
    queryKey: ["my-primary-territory", currentUser.id],
    enabled: !!currentUser.id,
    queryFn: async () => {
      const { data } = await (supabase as any).from("user_territories")
        .select("territory_id, is_primary, territories(name)").eq("user_id", currentUser.id)
        .order("is_primary", { ascending: false }).limit(1).maybeSingle();
      return data ? { id: data.territory_id as string, name: (data.territories?.name ?? "") as string } : null;
    },
    staleTime: 10 * 60_000,
  });

  const { data: rows = [], isLoading, isFetching } = useQuery({
    queryKey: ["explore-needs", scope, territory, category, query, limit, currentUser.id],
    queryFn: async (): Promise<NeedRow[]> => {
      const { data, error } = await (supabase as any).rpc("explore_needs", {
        p_scope: scope,
        p_territory_id: territory || null,
        p_category: category || null,
        p_query: query || null,
        p_limit: limit,
        p_offset: 0,
      });
      if (error) throw error;
      return data ?? [];
    },
    placeholderData: (prev) => prev,
  });
  const total = rows[0]?.total_count ?? 0;

  const territoryName = useMemo(
    () => territories.find((x) => x.territory_id === territory)?.name ?? (homeTerritory?.id === territory ? homeTerritory?.name : ""),
    [territories, territory, homeTerritory],
  );

  const scopes: { value: Scope; icon: typeof Sparkles; hidden?: boolean }[] = [
    { value: "me", icon: Sparkles, hidden: isGuest },
    { value: "me_and_guilds", icon: Users, hidden: isGuest },
    { value: "all", icon: Globe2 },
  ];

  const matchText = (r: NeedRow) =>
    r.match_owner_type === "guild" && r.match_owner_name
      ? t("needsExplore.matchGuild", { skill: r.match_label, guild: r.match_owner_name })
      : t("needsExplore.matchMe", { skill: r.match_label });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground max-w-2xl">{t("needsExplore.intro")}</p>

      {/* Portée : mes compétences → élargie à mes guildes → tout */}
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("needsExplore.scopeLabel")}>
        {scopes.filter((s) => !s.hidden).map(({ value, icon: Icon }) => (
          <button
            key={value}
            role="radio"
            aria-checked={scope === value}
            onClick={() => setParam("scope", value === (isGuest ? "all" : "me") ? "" : value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium border transition-all",
              scope === value
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {t(`needsExplore.scope.${value}`)}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("needsExplore.search")} className="pl-9" />
        </div>
        <Select value={territory || "any"} onValueChange={(v) => setParam("territory", v === "any" ? "" : v)}>
          <SelectTrigger className="w-full sm:w-56">
            <div className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <div className="truncate">{territory ? territoryName || t("needsExplore.anyPlace") : t("needsExplore.anyPlace")}</div>
            </div>
          </SelectTrigger>
          <SelectContent className="max-h-80">
            <SelectItem value="any">{t("needsExplore.anyPlace")}</SelectItem>
            {homeTerritory && (
              <SelectItem value={homeTerritory.id}>{t("needsExplore.nearMe", { place: homeTerritory.name })}</SelectItem>
            )}
            {LEVEL_GROUPS.map((g) => {
              const items = territories.filter((x) => g.levels.includes(x.level) && x.territory_id !== homeTerritory?.id);
              return items.length ? (
                <SelectGroup key={g.key}>
                  <SelectLabel>{t(`needsExplore.levels.${g.key}`)}</SelectLabel>
                  {items.map((x) => (
                    <SelectItem key={x.territory_id} value={x.territory_id}>{x.name} ({x.need_count})</SelectItem>
                  ))}
                </SelectGroup>
              ) : null;
            })}
          </SelectContent>
        </Select>
        <Select value={category || "any"} onValueChange={(v) => setParam("category", v === "any" ? "" : v)}>
          <SelectTrigger className="w-full sm:w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="any">{t("needsExplore.anyCategory")}</SelectItem>
            {CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>{t(`matchOpportunities.category.${c}`, c)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isFetching && !isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label={t("needsExplore.loading")} />}
      </div>

      {!isLoading && (
        <p className="text-xs text-muted-foreground">{t("needsExplore.count", { count: total })}</p>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> {t("needsExplore.loading")}</p>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-border bg-card/50 p-8 text-center space-y-3">
          <HandHelping className="h-10 w-10 text-muted-foreground mx-auto" />
          <p className="text-muted-foreground">
            {scope === "all" ? t("needsExplore.emptyAll") : t("needsExplore.emptyMe")}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {scope === "me" && (
              <Button size="sm" variant="outline" onClick={() => setParam("scope", "me_and_guilds")}>{t("needsExplore.widenGuilds")}</Button>
            )}
            {scope !== "all" && (
              <Button size="sm" variant="outline" onClick={() => setParam("scope", "all")}>{t("needsExplore.widenAll")}</Button>
            )}
            {scope !== "all" && currentUser.id && (
              <Button size="sm" variant="ghost" asChild><Link to={`/users/${currentUser.id}`}>{t("needsExplore.completeSkills")}</Link></Button>
            )}
            {(territory || category || query) && (
              <Button size="sm" variant="ghost" onClick={() => { setSearch(""); setParams(new URLSearchParams({ tab: "needs", ...(params.get("scope") ? { scope: params.get("scope")! } : {}) }), { replace: true }); }}>
                {t("needsExplore.clearFilters")}
              </Button>
            )}
          </div>
        </div>
      ) : (
        <>
          <ul className="grid gap-3 md:grid-cols-2">
            {rows.map((r) => (
              <li key={r.need_id} className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline" className="text-[11px]">{t(`matchOpportunities.category.${r.category}`, r.category)}</Badge>
                  {r.is_mine && <Badge variant="secondary" className="text-[11px]">{t("needsExplore.yourQuest")}</Badge>}
                  {(r.territory_names ?? []).length > 0 && (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3" /> {(r.territory_names ?? []).join(", ")}
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold leading-snug text-balance">{r.title}</h3>
                  {r.description && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{r.description}</p>}
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("needsExplore.forQuest")}{" "}
                  <Link to={`/quests/${r.quest_id}`} className="font-medium text-foreground hover:text-primary">{r.quest_title}</Link>
                  {r.guild_id && r.guild_name && (
                    <>
                      {" · "}
                      <Link to={`/guilds/${r.guild_id}`} className="hover:text-primary">{r.guild_name}</Link>
                    </>
                  )}
                </p>
                {!r.is_mine && r.match_label && r.match_score !== null && r.match_score >= 0.36 && (
                  <p className="text-xs rounded-md bg-primary/5 text-primary px-2.5 py-1.5 flex items-start gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 mt-px shrink-0" />
                    <span>{matchText(r)}</span>
                  </p>
                )}
                <div className="mt-auto flex flex-wrap gap-2">
                  {!r.is_mine && currentUser.id && (
                    r.my_proposal_pending ? (
                      <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => setOfferFor(r)}>
                        <Check className="h-3.5 w-3.5" /> {t("needsExplore.offerSent")}
                      </Button>
                    ) : (
                      <Button size="sm" className="gap-1.5" onClick={() => setOfferFor(r)}>
                        <HandHelping className="h-3.5 w-3.5" /> {t("needsExplore.offerHelp")}
                      </Button>
                    )
                  )}
                  {!currentUser.id && (
                    <Button size="sm" asChild><Link to="/login">{t("needsExplore.loginToHelp")}</Link></Button>
                  )}
                  <Button size="sm" variant="outline" className="gap-1.5" asChild>
                    <Link to={`/quests/${r.quest_id}`}>{t("needsExplore.seeQuest")} <ArrowRight className="h-3.5 w-3.5" /></Link>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          <OfferHelpDialog
            need={offerFor}
            onClose={() => setOfferFor(null)}
            onSent={() => qc.invalidateQueries({ queryKey: ["explore-needs"] })}
          />
          {rows.length < total && (
            <div className="flex justify-center">
              <Button variant="outline" size="sm" onClick={() => setLimit((l) => Math.min(l + PAGE, 100))} disabled={isFetching || limit >= 100}>
                {isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                {t("needsExplore.more")}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * « Proposer mon aide » : crée une contribution liée au besoin (comme « Submit Contribution » sur la quête)
 * et prévient la personne qui a créé le besoin, le porteur de la quête et les admins de sa guilde.
 */
function OfferHelpDialog({ need, onClose, onSent }: { need: NeedRow | null; onClose: () => void; onSent: () => void }) {
  const { t } = useTranslation();
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [terms, setTerms] = useState<"free" | "CREDITS" | "FIAT">("free");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!need) return;
    // A draft prepared by Pi, if any: used once, then forgotten.
    let draft: { title?: string | null; message?: string | null; terms?: string | null; amount?: number | null } = {};
    try {
      const key = `pi-offer-draft:${need.need_id}`;
      draft = JSON.parse(sessionStorage.getItem(key) ?? "{}") ?? {};
      sessionStorage.removeItem(key);
    } catch { /* ignore */ }
    const draftTerms = ["free", "CREDITS", "FIAT"].includes(draft.terms ?? "") ? (draft.terms as "free" | "CREDITS" | "FIAT") : "free";
    setTitle((draft.title || t("needsExplore.offerDefaultTitle", { need: need.title })).slice(0, 160));
    setMessage((draft.message ?? "").slice(0, 2000));
    setTerms(draftTerms);
    setAmount(draftTerms !== "free" && Number(draft.amount) > 0 ? String(draft.amount) : "");
  }, [need, t]);

  const send = async () => {
    if (!need || !title.trim()) return;
    setBusy(true);
    const value = Math.max(0, Number(amount) || 0);
    const { data, error } = await (supabase as any).rpc("propose_need_contribution", {
      p_need_id: need.need_id,
      p_title: title.trim(),
      p_description: message.trim() || null,
      p_currency: terms === "FIAT" ? "FIAT" : "CREDITS",
      p_requested_credits: terms === "CREDITS" ? value : 0,
      p_requested_fiat: terms === "FIAT" ? value : 0,
    });
    setBusy(false);
    if (error) {
      toast.error(t("needsExplore.offerFailed"), { description: error.message });
      return;
    }
    if (data?.updated) toast.success(t("needsExplore.offerUpdated"));
    else if (data?.relayed_to_platform) toast.success(t("needsExplore.offerRelayed"));
    else toast.success(t("needsExplore.offerDone", { count: data?.notified ?? 0 }));
    onSent();
    onClose();
  };

  return (
    <Dialog open={!!need} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("needsExplore.offerTitle")}</DialogTitle>
          <DialogDescription>
            {need && t("needsExplore.offerDesc", { need: need.title, quest: need.quest_title })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="offer-title">{t("needsExplore.offerWhat")}</Label>
            <Input id="offer-title" value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="offer-message">{t("needsExplore.offerHow")}</Label>
            <Textarea id="offer-message" value={message} maxLength={2000} className="min-h-[96px] resize-none"
              placeholder={t("needsExplore.offerHowPlaceholder")} onChange={(e) => setMessage(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("needsExplore.offerTerms")}</Label>
            <div className="flex flex-wrap gap-2">
              {(["free", "CREDITS", "FIAT"] as const).map((v) => (
                <Button key={v} type="button" size="sm" variant={terms === v ? "default" : "outline"} onClick={() => setTerms(v)}>
                  {t(`needsExplore.terms.${v}`)}
                </Button>
              ))}
            </div>
            {terms !== "free" && (
              <Input type="number" min={0} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)}
                placeholder={terms === "FIAT" ? t("needsExplore.amountEur") : t("needsExplore.amountCtg")} className="mt-2 w-48" />
            )}
          </div>
          <p className="text-xs text-muted-foreground">{t("needsExplore.offerWho")}</p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t("needsExplore.cancel")}</Button>
          <Button onClick={send} disabled={busy || !title.trim()} className="gap-1.5">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            {need?.my_proposal_pending ? t("needsExplore.offerUpdate") : t("needsExplore.offerSend")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
