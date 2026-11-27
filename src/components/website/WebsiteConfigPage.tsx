import { useTranslation } from "react-i18next";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Plus, Trash2, Globe, Eye, EyeOff } from "lucide-react";
import { WebsitePageEditor } from "./WebsitePageEditor";
import { getDefaultTemplate } from "@/lib/websiteTemplates";

interface WebsiteConfigPageProps {
  ownerType: "user" | "guild" | "territory" | "program";
  ownerId: string;
}

export function WebsiteConfigPage({ ownerType, ownerId }: WebsiteConfigPageProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const currentUser = useCurrentUser();

  const { data: website, isLoading } = useQuery({
    queryKey: ["website", ownerType, ownerId],
    queryFn: async () => {
      const { data } = await supabase
        .from("websites")
        .select("*")
        .eq("owner_type", ownerType)
        .eq("owner_id", ownerId)
        .maybeSingle();
      return data;
    },
  });

  const { data: pages } = useQuery({
    queryKey: ["website-pages", website?.id],
    enabled: !!website?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("website_pages")
        .select("*")
        .eq("website_id", website!.id)
        .order("sort_order");
      return data || [];
    },
  });

  const [form, setForm] = useState({
    title: "",
    slug: "",
    subtitle: "",
    description: "",
    themeMode: "solar" as string,
    primaryColor: "",
    accentColor: "",
    fontHeading: "",
    fontBody: "",
    isPublished: false,
  });

  useEffect(() => {
    if (website) {
      const theme = (website.theme as any) || {};
      setForm({
        title: website.title || "",
        slug: website.slug || "",
        subtitle: website.subtitle || "",
        description: website.description || "",
        themeMode: theme.mode || "solar",
        primaryColor: theme.primaryColor || "",
        accentColor: theme.accentColor || "",
        fontHeading: theme.fontHeading || "",
        fontBody: theme.fontBody || "",
        isPublished: website.is_published || false,
      });
    }
  }, [website]);

  const upsertWebsite = useMutation({
    mutationFn: async () => {
      const theme: Record<string, string> = { mode: form.themeMode };
      if (form.primaryColor) theme.primaryColor = form.primaryColor;
      if (form.accentColor) theme.accentColor = form.accentColor;
      if (form.fontHeading) theme.fontHeading = form.fontHeading;
      if (form.fontBody) theme.fontBody = form.fontBody;

      if (website) {
        const { error } = await supabase
          .from("websites")
          .update({
            title: form.title,
            slug: form.slug,
            subtitle: form.subtitle || null,
            description: form.description || null,
            theme,
            is_published: form.isPublished,
          })
          .eq("id", website.id);
        if (error) throw error;
      } else {
        // Create website
        const { data: newSite, error } = await supabase
          .from("websites")
          .insert({
            owner_type: ownerType,
            owner_id: ownerId,
            title: form.title,
            slug: form.slug,
            subtitle: form.subtitle || null,
            description: form.description || null,
            theme,
            is_published: form.isPublished,
          })
          .select("id")
          .single();
        if (error) throw error;

        // Scaffold default pages + sections from template
        const template = getDefaultTemplate(ownerType);
        for (let pi = 0; pi < template.length; pi++) {
          const pageDef = template[pi];
          const { data: newPage, error: pErr } = await supabase
            .from("website_pages")
            .insert({
              website_id: newSite.id,
              slug: pageDef.slug,
              title: pageDef.title,
              page_type: pageDef.page_type,
              sort_order: pi,
            })
            .select("id")
            .single();
          if (pErr || !newPage) continue;

          const sectionRows = pageDef.sections.map((s, si) => ({
            page_id: newPage.id,
            type: s.type,
            title: s.title || null,
            subtitle: s.subtitle || null,
            body_markdown: s.body_markdown || null,
            source: s.source as string,
            layout: s.layout || null,
            filters: (s.filters as any) || null,
            sort_order: si,
          }));
          if (sectionRows.length > 0) {
            await supabase.from("website_sections").insert(sectionRows);
          }
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["website", ownerType, ownerId] });
      queryClient.invalidateQueries({ queryKey: ["website-pages"] });
      toast.success(website ? t("uiWebsiteConfigPage.websiteSaved") : t("uiWebsiteConfigPage.websiteCreatedWithDefaultPages"));
    },
    onError: (err: any) => toast.error(err.message),
  });

  const addPage = useMutation({
    mutationFn: async () => {
      if (!website) return;
      const count = (pages || []).length;
      const { error } = await supabase.from("website_pages").insert({
        website_id: website.id,
        slug: `page-${count + 1}`,
        title: t("uiWebsiteConfigPage.newPage"),
        page_type: "custom",
        sort_order: count,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["website-pages", website?.id] });
      toast.success(t("uiWebsiteConfigPage.pageAdded"));
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deletePage = useMutation({
    mutationFn: async (pageId: string) => {
      // Delete sections first, then the page
      await supabase.from("website_sections").delete().eq("page_id", pageId);
      const { error } = await supabase.from("website_pages").delete().eq("id", pageId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["website-pages", website?.id] });
      toast.success(t("uiWebsiteConfigPage.pageRemoved"));
    },
  });

  if (isLoading) return <div className="p-4 text-muted-foreground">{t("uiWebsiteConfigPage.loading")}</div>;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Globe className="h-5 w-5" /> {t("uiWebsiteConfigPage.websiteConfiguration")}
        </h2>
        {website && (
          <div className="flex items-center gap-2 text-sm">
            {form.isPublished ? (
              <span className="text-primary flex items-center gap-1"><Eye className="h-3.5 w-3.5" /> {t("uiWebsiteConfigPage.published")}</span>
            ) : (
              <span className="text-muted-foreground flex items-center gap-1"><EyeOff className="h-3.5 w-3.5" /> {t("uiWebsiteConfigPage.draft")}</span>
            )}
          </div>
        )}
      </div>

      {/* General settings */}
      <Card>
        <CardHeader><CardTitle className="text-base">{t("uiWebsiteConfigPage.general")}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>{t("uiWebsiteConfigPage.title")}</Label>
              <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder={t("uiWebsiteConfigPage.myWebsite")} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("uiWebsiteConfigPage.slugUrlPath")}</Label>
              <Input value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") }))} placeholder="my-website" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t("uiWebsiteConfigPage.subtitle")}</Label>
            <Input value={form.subtitle} onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("uiWebsiteConfigPage.description")}</Label>
            <Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={3} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>{t("uiWebsiteConfigPage.themeMode")}</Label>
              <Select value={form.themeMode} onValueChange={(v) => setForm((f) => ({ ...f, themeMode: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="solar">{t("uiWebsiteConfigPage.solarLight")}</SelectItem>
                  <SelectItem value="lunar">{t("uiWebsiteConfigPage.lunarDark")}</SelectItem>
                  <SelectItem value="custom">{t("uiWebsiteConfigPage.custom")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.themeMode === "custom" && (
              <>
                <div className="space-y-1.5">
                  <Label>{t("uiWebsiteConfigPage.primaryColor")}</Label>
                  <Input value={form.primaryColor} onChange={(e) => setForm((f) => ({ ...f, primaryColor: e.target.value }))} placeholder="#3B82F6" />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("uiWebsiteConfigPage.accentColor")}</Label>
                  <Input value={form.accentColor} onChange={(e) => setForm((f) => ({ ...f, accentColor: e.target.value }))} placeholder="#10B981" />
                </div>
              </>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>{t("uiWebsiteConfigPage.headingFont")}</Label>
              <Input value={form.fontHeading} onChange={(e) => setForm((f) => ({ ...f, fontHeading: e.target.value }))} placeholder={t("uiWebsiteConfigPage.spaceGrotesk")} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("uiWebsiteConfigPage.bodyFont")}</Label>
              <Input value={form.fontBody} onChange={(e) => setForm((f) => ({ ...f, fontBody: e.target.value }))} placeholder={t("uiWebsiteConfigPage.inter")} />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Switch checked={form.isPublished} onCheckedChange={(v) => setForm((f) => ({ ...f, isPublished: v }))} />
            <Label>{t("uiWebsiteConfigPage.publishWebsiteMakePublicApiAvailable")}</Label>
          </div>

          <Button onClick={() => upsertWebsite.mutate()} disabled={!form.title || !form.slug || upsertWebsite.isPending}>
            {upsertWebsite.isPending ? t("uiWebsiteConfigPage.saving") : website ? t("uiWebsiteConfigPage.saveChanges") : t("uiWebsiteConfigPage.createWebsite")}
          </Button>
          {!website && (
            <p className="text-xs text-muted-foreground">
              {t("uiWebsiteConfigPage.creatingWillScaffoldDefaultPagesBased")} {ownerType === "user" ? "individual" : ownerType} template.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Pages */}
      {website && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{t("uiWebsiteConfigPage.pages")}</CardTitle>
              <Button variant="outline" size="sm" onClick={() => addPage.mutate()}>
                <Plus className="h-3.5 w-3.5 mr-1" /> {t("uiWebsiteConfigPage.addPage")}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {(!pages || pages.length === 0) && (
              <p className="text-sm text-muted-foreground">{t("uiWebsiteConfigPage.noPagesYetAddOneTo")}</p>
            )}
            <Tabs defaultValue={(pages || [])[0]?.id} className="w-full">
              {(pages || []).length > 0 && (
                <TabsList className="flex-wrap h-auto gap-1 mb-4">
                  {(pages || []).map((p: any) => (
                    <TabsTrigger key={p.id} value={p.id} className="text-xs">
                      {p.title}
                    </TabsTrigger>
                  ))}
                </TabsList>
              )}
              {(pages || []).map((p: any) => (
                <TabsContent key={p.id} value={p.id}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium">{p.title}</span>
                    <Button variant="ghost" size="sm" className="text-destructive" onClick={() => deletePage.mutate(p.id)}>
                      <Trash2 className="h-3.5 w-3.5 mr-1" /> {t("uiWebsiteConfigPage.remove")}
                    </Button>
                  </div>
                  <WebsitePageEditor page={p} websiteId={website.id} ownerType={ownerType} ownerId={ownerId} />
                </TabsContent>
              ))}
            </Tabs>
          </CardContent>
        </Card>
      )}

      {/* API Info */}
      {website?.is_published && (
        <Card>
          <CardHeader><CardTitle className="text-base">{t("uiWebsiteConfigPage.publicApi")}</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="text-muted-foreground">{t("uiWebsiteConfigPage.useTheseEndpointsToFetchYour")}</p>
            <code className="block bg-muted p-2 rounded text-xs break-all">
              {t("uiWebsiteConfigPage.getFunctionsV1PublicWebsite")}{website.slug}
            </code>
            <code className="block bg-muted p-2 rounded text-xs break-all">
              {t("uiWebsiteConfigPage.getFunctionsV1PublicWebsite")}{website.slug}/full
            </code>
            <code className="block bg-muted p-2 rounded text-xs break-all">
              {t("uiWebsiteConfigPage.getFunctionsV1PublicWebsite")}{website.slug}/pages/{t("uiWebsiteConfigPage.pageslug")}/resolved
            </code>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
