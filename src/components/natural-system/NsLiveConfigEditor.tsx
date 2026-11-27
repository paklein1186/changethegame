import { useTranslation } from "react-i18next";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  naturalSystemId: string;
  currentConfig: any;
}

export function NsLiveConfigEditor({ open, onOpenChange, naturalSystemId, currentConfig }: Props) {
  const { t } = useTranslation();
  const [type, setType] = useState<string>(currentConfig?.type ?? "http_api");
  const [endpoint, setEndpoint] = useState<string>(currentConfig?.endpoint ?? "");
  const [metric, setMetric] = useState<string>(currentConfig?.metric ?? "");
  const [unit, setUnit] = useState<string>(currentConfig?.unit ?? "");
  const [selector, setSelector] = useState<string>(currentConfig?.selector ?? "");
  const [metricsMap, setMetricsMap] = useState<string>(
    currentConfig?.metrics_map ? JSON.stringify(currentConfig.metrics_map, null, 2) : '{\n  "external_field": "internal_metric"\n}'
  );
  const [refreshMinutes, setRefreshMinutes] = useState<string>(String(currentConfig?.refresh_minutes ?? 60));
  const [saving, setSaving] = useState(false);

  const qc = useQueryClient();
  const { toast } = useToast();

  const handleSave = async () => {
    setSaving(true);
    try {
      let parsedMap = {};
      if (type === "http_api") {
        try { parsedMap = JSON.parse(metricsMap); } catch { throw new Error("Invalid JSON in metrics map"); }
      }

      const config = {
        type,
        endpoint,
        ...(type === "http_api" ? { metrics_map: parsedMap } : {}),
        ...(type === "scraper" ? { selector, metric, unit } : {}),
        refresh_minutes: parseInt(refreshMinutes) || 60,
      };

      const { error } = await supabase
        .from("natural_systems" as any)
        .update({ live_config: config } as any)
        .eq("id", naturalSystemId);

      if (error) throw error;

      qc.invalidateQueries({ queryKey: ["natural-system", naturalSystemId] });
      toast({ title: t("uiNsLiveConfigEditor.liveConfigSaved") });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: t("uiNsLiveConfigEditor.error"), description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("uiNsLiveConfigEditor.configureLiveDataSource")}</DialogTitle>
          <DialogDescription>
            {t("uiNsLiveConfigEditor.setUpHowThisNaturalSystem")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>{t("uiNsLiveConfigEditor.sourceType")}</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="http_api">{t("uiNsLiveConfigEditor.httpApiJson")}</SelectItem>
                <SelectItem value="scraper">{t("uiNsLiveConfigEditor.webScraperHtml")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>{t("uiNsLiveConfigEditor.endpointUrl")}</Label>
            <Input value={endpoint} onChange={e => setEndpoint(e.target.value)} placeholder="https://..." />
          </div>

          {type === "http_api" && (
            <div>
              <Label>{t("uiNsLiveConfigEditor.metricsMapJson")}</Label>
              <Textarea
                value={metricsMap}
                onChange={e => setMetricsMap(e.target.value)}
                rows={4}
                className="font-mono text-xs"
                placeholder='{ "external_field": "internal_metric" }'
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                {t("uiNsLiveConfigEditor.mapsExternalJsonFieldPathsTo")}
              </p>
            </div>
          )}

          {type === "scraper" && (
            <>
              <div>
                <Label>{t("uiNsLiveConfigEditor.cssSelector")}</Label>
                <Input value={selector} onChange={e => setSelector(e.target.value)} placeholder="#water-level-value" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>{t("uiNsLiveConfigEditor.metricName")}</Label>
                  <Input value={metric} onChange={e => setMetric(e.target.value)} placeholder="water_level" />
                </div>
                <div>
                  <Label>{t("uiNsLiveConfigEditor.unit")}</Label>
                  <Input value={unit} onChange={e => setUnit(e.target.value)} placeholder="m" />
                </div>
              </div>
            </>
          )}

          <div>
            <Label>{t("uiNsLiveConfigEditor.refreshIntervalMinutes")}</Label>
            <Input type="number" value={refreshMinutes} onChange={e => setRefreshMinutes(e.target.value)} min={5} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>{t("uiNsLiveConfigEditor.cancel")}</Button>
            <Button onClick={handleSave} disabled={saving || !endpoint}>
              {saving ? t("uiNsLiveConfigEditor.saving") : t("uiNsLiveConfigEditor.saveConfig")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
