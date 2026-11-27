import i18n from "@/i18n/config";
import { useTranslation } from "react-i18next";
import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, Globe, Tag, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/* ─── Fixed vocabularies ─── */

const VISIBILITY_OPTIONS = [
  { value: "private", get label() { return i18n.t("uiWebVisibilityEditor.private"); }, get desc() { return i18n.t("uiWebVisibilityEditor.notVisibleOnAnyPublicWebsite"); } },
  { value: "unlisted", get label() { return i18n.t("uiWebVisibilityEditor.unlisted"); }, get desc() { return i18n.t("uiWebVisibilityEditor.accessibleViaDirectLinkOnly"); } },
  { value: "public", get label() { return i18n.t("uiWebVisibilityEditor.public"); }, get desc() { return i18n.t("uiWebVisibilityEditor.visibleOnPublicWebsites"); } },
] as const;

const WEB_SCOPES = [
  { value: "personal_site", get label() { return i18n.t("uiWebVisibilityEditor.personalSite"); }, get desc() { return i18n.t("uiWebVisibilityEditor.individualUserWebsites"); } },
  { value: "guild_site", get label() { return i18n.t("uiWebVisibilityEditor.guildSite"); }, get desc() { return i18n.t("uiWebVisibilityEditor.guildOrganisationWebsites"); } },
  { value: "territory_site", get label() { return i18n.t("uiWebVisibilityEditor.territorySite"); }, get desc() { return i18n.t("uiWebVisibilityEditor.territorialEntityWebsites"); } },
  { value: "program_site", get label() { return i18n.t("uiWebVisibilityEditor.programSite"); }, get desc() { return i18n.t("uiWebVisibilityEditor.programLevelWebsitesLibraErasmus"); } },
] as const;

const PLACEMENT_TAGS = [
  { value: "flagship", get label() { return i18n.t("uiWebVisibilityEditor.flagship"); }, get desc() { return i18n.t("uiWebVisibilityEditor.top35ItemsOnHome"); } },
  { value: "portfolio", get label() { return i18n.t("uiWebVisibilityEditor.portfolio"); }, get desc() { return i18n.t("uiWebVisibilityEditor.pastWorkToShowcaseOnProjects"); } },
  { value: "ongoing", get label() { return i18n.t("uiWebVisibilityEditor.ongoing"); }, get desc() { return i18n.t("uiWebVisibilityEditor.currentlyActiveWork"); } },
  { value: "secondary", get label() { return i18n.t("uiWebVisibilityEditor.secondary"); }, get desc() { return i18n.t("uiWebVisibilityEditor.showOnListingPagesNotFirst"); } },
  { value: "archived", get label() { return i18n.t("uiWebVisibilityEditor.archived"); }, get desc() { return i18n.t("uiWebVisibilityEditor.historicalHiddenByDefault"); } },
  { value: "community", get label() { return i18n.t("uiWebVisibilityEditor.community"); }, get desc() { return i18n.t("uiWebVisibilityEditor.showOnCommonsCommunitySections"); } },
  { value: "program", get label() { return i18n.t("uiWebVisibilityEditor.program"); }, get desc() { return i18n.t("uiWebVisibilityEditor.partOfANamedProgram"); } },
] as const;

const SCOPE_VALUES = WEB_SCOPES.map(s => s.value);
const TAG_VALUES = PLACEMENT_TAGS.map(t => t.value);

const OVERRIDE_OPTIONS = [
  { value: "inherit", get label() { return i18n.t("uiWebVisibilityEditor.inheritFromOwnerDefault"); } },
  { value: "force_visible", get label() { return i18n.t("uiWebVisibilityEditor.alwaysShowOnMyWebsite"); } },
  { value: "force_hidden", get label() { return i18n.t("uiWebVisibilityEditor.hideThisItemFromMyWebsite"); } },
] as const;

/* ─── Types ─── */

type EntityTable = "quests" | "services" | "guilds" | "companies" | "profiles";

interface OwnerContext {
  ownerType: string;
  ownerName: string;
  defaultVisible: boolean;
}

interface Props {
  entityId: string;
  entityTable: EntityTable;
  initialVisibility?: string;
  initialScopes?: string[];
  initialTags?: string[];
  initialFeaturedOrder?: number | null;
  initialOverride?: string;
  ownerContext?: OwnerContext;
  onSaved?: () => void;
}

/* ─── Component ─── */

export function WebVisibilityEditor({
  entityId,
  entityTable,
  initialVisibility = "private",
  initialScopes = [],
  initialTags = [],
  initialFeaturedOrder = null,
  initialOverride = "inherit",
  ownerContext,
  onSaved,
}: Props) {
  const { t } = useTranslation();
  const [visibility, setVisibility] = useState(initialVisibility);
  const [scopes, setScopes] = useState<string[]>(initialScopes);
  const [tags, setTags] = useState<string[]>(initialTags);
  const [featuredOrder, setFeaturedOrder] = useState(initialFeaturedOrder);
  const [override, setOverride] = useState(initialOverride);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Fetch current values from DB on mount
  useEffect(() => {
    const load = async () => {
      const idCol = entityTable === "profiles" ? "user_id" : "id";
      const { data } = await (supabase as any)
        .from(entityTable)
        .select("public_visibility, web_scopes, web_tags, featured_order, web_visibility_override")
        .eq(idCol, entityId)
        .maybeSingle();
      if (data) {
        setVisibility(data.public_visibility || "private");
        setScopes(data.web_scopes || []);
        setTags(data.web_tags || []);
        setFeaturedOrder(data.featured_order ?? null);
        setOverride(data.web_visibility_override || "inherit");
      }
      setLoaded(true);
    };
    load();
  }, [entityTable, entityId]);

  const toggleScope = (v: string) =>
    setScopes(prev => prev.includes(v) ? prev.filter(s => s !== v) : [...prev, v]);

  const toggleTag = (v: string) =>
    setTags(prev => prev.includes(v) ? prev.filter(t => t !== v) : [...prev, v]);

  const effectiveVisible = override === "force_visible" ? true :
    override === "force_hidden" ? false :
    ownerContext?.defaultVisible ?? false;

  const save = async () => {
    setSaving(true);
    const idCol = entityTable === "profiles" ? "user_id" : "id";
    const { error } = await (supabase as any)
      .from(entityTable)
      .update({
        public_visibility: visibility,
        web_scopes: scopes,
        web_tags: tags,
        featured_order: featuredOrder,
        web_visibility_override: override,
      } as any)
      .eq(idCol, entityId);
    setSaving(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(t("uiWebVisibilityEditor.webVisibilitySaved"));
      onSaved?.();
    }
  };

  if (!loaded) {
    return <div className="rounded-xl border border-border bg-card p-5 animate-pulse h-32" />;
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-5">
      <div>
        <h3 className="font-display font-semibold flex items-center gap-2 text-base">
          <Globe className="h-4 w-4 text-primary" /> {t("uiWebVisibilityEditor.webVisibilityTags")}
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          {t("uiWebVisibilityEditor.controlHowThisItemAppearsOn")}
        </p>
      </div>

      {/* Per-item override */}
      {ownerContext && (
        <div className="space-y-2 rounded-lg border border-border bg-background p-4">
          <Label className="flex items-center gap-1.5 text-sm font-medium">
            <Eye className="h-3.5 w-3.5" /> {t("uiWebVisibilityEditor.webVisibilityOnYourWebsite")}
          </Label>
          <p className="text-xs text-muted-foreground">
            {t("uiWebVisibilityEditor.websiteOwner")} <strong>{ownerContext.ownerName}</strong> {t("uiWebVisibilityEditor.defaultFor")} {entityTable}: <strong>{ownerContext.defaultVisible ? t("uiWebVisibilityEditor.showAll") : t("uiWebVisibilityEditor.hideAll")}</strong>
          </p>
          <div className="space-y-1.5 mt-2">
            {OVERRIDE_OPTIONS.map(opt => {
              const isActive = override === opt.value;
              let sublabel = "";
              if (opt.value === "inherit") {
                sublabel = `(currently: ${effectiveVisible ? "Visible" : "Hidden"} on website)`;
              } else if (opt.value === "force_visible") {
                sublabel = "Force this item to be visible via the website feedpoint, even if hidden by default.";
              } else {
                sublabel = "Hide this item from the website feedpoint, even if visible by default.";
              }
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setOverride(opt.value)}
                  className={`w-full text-left rounded-lg border-2 p-3 transition-all ${
                    isActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
                  }`}
                >
                  <p className="text-sm font-medium">{opt.label}</p>
                  <p className="text-xs text-muted-foreground">{sublabel}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Public visibility */}
      <div className="space-y-2">
        <Label className="flex items-center gap-1.5 text-sm font-medium">
          <Eye className="h-3.5 w-3.5" /> {t("uiWebVisibilityEditor.publicVisibility")}
        </Label>
        <Select value={visibility} onValueChange={setVisibility}>
          <SelectTrigger className="w-full max-w-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {VISIBILITY_OPTIONS.map(opt => (
              <SelectItem key={opt.value} value={opt.value}>
                <span className="font-medium">{opt.label}</span>
                <span className="text-muted-foreground ml-2 text-xs">— {opt.desc}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Web Scopes */}
      <div className="space-y-2">
        <Label className="flex items-center gap-1.5 text-sm font-medium">
          <Globe className="h-3.5 w-3.5" /> {t("uiWebVisibilityEditor.webScopes")}
        </Label>
        <p className="text-xs text-muted-foreground">
          {t("uiWebVisibilityEditor.whoShouldBeAllowedToShow")}
        </p>
        <div className="flex flex-wrap gap-2">
          {WEB_SCOPES.map(scope => {
            const active = scopes.includes(scope.value);
            return (
              <button
                key={scope.value}
                type="button"
                onClick={() => toggleScope(scope.value)}
                className={`px-3 py-1.5 rounded-full border text-sm transition-all ${
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border hover:border-foreground/50 text-muted-foreground"
                }`}
                title={scope.desc}
              >
                {scope.label}
              </button>
            );
          })}
        </div>
        {scopes.length === 0 && visibility !== "private" && (
          <p className="text-xs text-amber-600">
            {t("uiWebVisibilityEditor.tipStartWithPersonalSiteYou")}
          </p>
        )}
      </div>

      {/* Web Tags */}
      <div className="space-y-2">
        <Label className="flex items-center gap-1.5 text-sm font-medium">
          <Tag className="h-3.5 w-3.5" /> {t("uiWebVisibilityEditor.webTags")}
        </Label>
        <p className="text-xs text-muted-foreground">
          {t("uiWebVisibilityEditor.howShouldThisItemBeUsed")}
        </p>
        <div className="flex flex-wrap gap-2">
          {PLACEMENT_TAGS.map(tag => {
            const active = tags.includes(tag.value);
            return (
              <button
                key={tag.value}
                type="button"
                onClick={() => toggleTag(tag.value)}
                className={`px-3 py-1.5 rounded-full border text-sm transition-all ${
                  active
                    ? "bg-accent text-accent-foreground border-accent"
                    : "border-border hover:border-foreground/50 text-muted-foreground"
                }`}
                title={tag.desc}
              >
                {tag.label}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          {tags.length > 0 && tags.map(t => (
            <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>
          ))}
        </div>
      </div>

      {/* Featured order */}
      {tags.includes("flagship") && (
        <div className="space-y-1">
          <Label className="text-sm font-medium">{t("uiWebVisibilityEditor.featuredOrder")}</Label>
          <Input
            type="number"
            value={featuredOrder ?? ""}
            onChange={e => setFeaturedOrder(e.target.value ? parseInt(e.target.value) : null)}
            className="w-32"
            placeholder={t("uiWebVisibilityEditor.auto")}
            min={0}
          />
          <p className="text-xs text-muted-foreground">{t("uiWebVisibilityEditor.lowerNumbersAppearFirstLeaveEmpty")}</p>
        </div>
      )}

      <Button variant="outline" size="sm" onClick={save} disabled={saving}>
        <Save className="h-3.5 w-3.5 mr-1" />
        {saving ? t("uiWebVisibilityEditor.saving") : t("uiWebVisibilityEditor.saveWebSettings")}
      </Button>
    </div>
  );
}

/* Export vocabularies for reuse */
export { WEB_SCOPES, PLACEMENT_TAGS, SCOPE_VALUES, TAG_VALUES };
