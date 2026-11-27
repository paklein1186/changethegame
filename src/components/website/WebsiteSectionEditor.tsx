import i18n from "@/i18n/config";
import { useTranslation } from "react-i18next";
import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { WebsiteItemSelector } from "./WebsiteItemSelector";
import { PLACEMENT_TAGS } from "./WebVisibilityEditor";

const SECTION_TYPES = [
  { value: "hero", get label() { return i18n.t("uiWebsiteSectionEditor.hero"); } },
  { value: "text_block", get label() { return i18n.t("uiWebsiteSectionEditor.textBlock"); } },
  { value: "services_list", get label() { return i18n.t("uiWebsiteSectionEditor.servicesList"); } },
  { value: "quests_list", get label() { return i18n.t("uiWebsiteSectionEditor.questsList"); } },
  { value: "guilds_list", get label() { return i18n.t("uiWebsiteSectionEditor.guildsList"); } },
  { value: "projects_list", get label() { return i18n.t("uiWebsiteSectionEditor.projectsList"); } },
  { value: "cta", get label() { return i18n.t("uiWebsiteSectionEditor.callToAction"); } },
];

const LIST_TYPES = ["services_list", "quests_list", "guilds_list", "projects_list"];

interface Props {
  section: any;
  pageId: string;
  ownerType: string;
  ownerId: string;
}

export function WebsiteSectionEditor({ section, pageId, ownerType, ownerId }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [type, setType] = useState(section.type);
  const [title, setTitle] = useState(section.title || "");
  const [subtitle, setSubtitle] = useState(section.subtitle || "");
  const [bodyMarkdown, setBodyMarkdown] = useState(section.body_markdown || "");
  const [source, setSource] = useState(section.source || "manual");
  const [layout, setLayout] = useState(section.layout || "grid");
  const [selectedIds, setSelectedIds] = useState<string[]>(section.selected_ids || []);
  const [filters, setFilters] = useState<any>(section.filters || {});

  const isList = LIST_TYPES.includes(type);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("website_sections")
        .update({
          type,
          title: title || null,
          subtitle: subtitle || null,
          body_markdown: bodyMarkdown || null,
          source,
          layout,
          selected_ids: selectedIds,
          filters,
        })
        .eq("id", section.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["website-sections", pageId] });
      toast.success(t("uiWebsiteSectionEditor.sectionSaved"));
    },
    onError: (err: any) => toast.error(err.message),
  });

  const itemType = type === "services_list" ? "service"
    : type === "guilds_list" ? "guild"
    : "quest";

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">{t("uiWebsiteSectionEditor.sectionType")}</Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {SECTION_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{t("uiWebsiteSectionEditor.title")}</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} className="h-8 text-sm" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{t("uiWebsiteSectionEditor.subtitle")}</Label>
          <Input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} className="h-8 text-sm" />
        </div>
      </div>

      {(type === "text_block" || type === "hero" || type === "cta") && (
        <div className="space-y-1">
          <Label className="text-xs">{t("uiWebsiteSectionEditor.bodyMarkdown")}</Label>
          <Textarea value={bodyMarkdown} onChange={(e) => setBodyMarkdown(e.target.value)} rows={4} className="text-sm" />
        </div>
      )}

      {isList && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">{t("uiWebsiteSectionEditor.source")}</Label>
              <Select value={source} onValueChange={setSource}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">{t("uiWebsiteSectionEditor.manualSelection")}</SelectItem>
                  <SelectItem value="auto">{t("uiWebsiteSectionEditor.autoFilters")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("uiWebsiteSectionEditor.layout")}</Label>
              <Select value={layout} onValueChange={setLayout}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="grid">{t("uiWebsiteSectionEditor.grid")}</SelectItem>
                  <SelectItem value="list">{t("uiWebsiteSectionEditor.list")}</SelectItem>
                  <SelectItem value="carousel">{t("uiWebsiteSectionEditor.carousel")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {source === "manual" && (
            <WebsiteItemSelector
              itemType={itemType}
              ownerType={ownerType}
              ownerId={ownerId}
              selectedIds={selectedIds}
              onChange={setSelectedIds}
            />
          )}

          {source === "auto" && (
            <div className="space-y-2 p-3 bg-muted/50 rounded-md">
              <Label className="text-xs font-medium">{t("uiWebsiteSectionEditor.autoFilters2")}</Label>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs">{t("uiWebsiteSectionEditor.webTags")}</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {PLACEMENT_TAGS.map(tag => {
                      const active = (filters.webTags || []).includes(tag.value);
                      return (
                        <button
                          key={tag.value}
                          type="button"
                          onClick={() => setFilters((f: any) => {
                            const current: string[] = f.webTags || [];
                            const next = active
                              ? current.filter((t: string) => t !== tag.value)
                              : [...current, tag.value];
                            return { ...f, webTags: next };
                          })}
                          className={`px-2 py-0.5 rounded-full border text-xs transition-all ${
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
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t("uiWebsiteSectionEditor.limit")}</Label>
                  <Input
                    type="number"
                    value={filters.limit || ""}
                    onChange={(e) => setFilters((f: any) => ({ ...f, limit: e.target.value ? parseInt(e.target.value) : undefined }))}
                    className="h-8 text-sm w-24"
                    placeholder="10"
                  />
                </div>
              </div>
            </div>
          )}
        </>
      )}

      <Button variant="outline" size="sm" onClick={() => save.mutate()}>
        <Save className="h-3.5 w-3.5 mr-1" /> {t("uiWebsiteSectionEditor.saveSection")}
      </Button>
    </div>
  );
}
