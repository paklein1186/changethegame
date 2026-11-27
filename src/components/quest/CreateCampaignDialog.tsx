import { useTranslation } from "react-i18next";
import { useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, Loader2 } from "lucide-react";
import { CurrencyIcon } from "@/components/CurrencyIcon";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { useCoinsRate } from "@/hooks/useCoinsRate";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useQueryClient } from "@tanstack/react-query";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currency: "coins" | "ctg";
  questId: string;
  ocuEnabled?: boolean;
  /** If provided, we're editing an existing campaign */
  editingCampaign?: any;
}

export function CreateCampaignDialog({
  open, onOpenChange, currency, questId, ocuEnabled = false, editingCampaign,
}: Props) {
  const { t } = useTranslation();
  const currentUser = useCurrentUser();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { rate: coinsRate } = useCoinsRate();

  const isEditing = !!editingCampaign;

  const [title, setTitle] = useState(editingCampaign?.title ?? "");
  const [description, setDescription] = useState(editingCampaign?.description ?? "");
  const [threshold, setThreshold] = useState(String(editingCampaign?.threshold_amount ?? ""));
  const [dispatchMode, setDispatchMode] = useState(editingCampaign?.dispatch_mode ?? "manual");
  const [endDate, setEndDate] = useState<Date | undefined>(
    editingCampaign?.end_date ? new Date(editingCampaign.end_date) : undefined
  );
  const [saving, setSaving] = useState(false);

  // Reset form when dialog opens with new data
  const handleOpenChange = (v: boolean) => {
    if (v && !isEditing) {
      setTitle("");
      setDescription("");
      setThreshold("");
      setDispatchMode("manual");
      setEndDate(undefined);
    }
    onOpenChange(v);
  };

  const handleSave = async () => {
    if (!title.trim() || !threshold) {
      toast({ title: t("uiCreateCampaignDialog.titleAndThresholdAreRequired"), variant: "destructive" });
      return;
    }
    setSaving(true);

    const payload: any = {
      title: title.trim(),
      campaign_currency: currency,
      threshold_amount: Number(threshold),
      dispatch_mode: dispatchMode,
      type: currency === "coins" ? "FIAT" : "CREDITS",
      goal_amount: Number(threshold),
      currency: currency === "coins" ? "EUR" : "CTG",
    };

    if (isEditing) {
      const { error } = await supabase.from("quest_campaigns" as any).update(payload).eq("id", editingCampaign.id);
      if (error) { toast({ title: t("uiCreateCampaignDialog.failedToUpdateCampaign"), description: error.message, variant: "destructive" }); setSaving(false); return; }
      toast({ title: t("uiCreateCampaignDialog.campaignUpdated") });
    } else {
      payload.quest_id = questId;
      payload.created_by_user_id = currentUser.id;
      payload.status = "ACTIVE";
      payload.raised_amount = 0;
      const { error } = await supabase.from("quest_campaigns" as any).insert(payload);
      if (error) { toast({ title: t("uiCreateCampaignDialog.failedToCreateCampaign"), description: error.message, variant: "destructive" }); setSaving(false); return; }
      toast({ title: t("uiCreateCampaignDialog.campaignCreated") });
    }

    qc.invalidateQueries({ queryKey: ["quest-campaigns", questId] });
    setSaving(false);
    onOpenChange(false);
  };

  const currencyEmoji = currency === "coins" ? "🟩" : "🌱";
  const currencyLabel = currency === "coins" ? "Coins" : "$CTG";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEditing ? t("uiCreateCampaignDialog.edit") : t("uiCreateCampaignDialog.new")} {currencyEmoji} {currencyLabel} {t("uiCreateCampaignDialog.campaign")}
          </DialogTitle>
          <DialogDescription>
            {currency === "coins"
              ? t("uiCreateCampaignDialog.createACoinsFundraisingCampaignCoins")
              : t("uiCreateCampaignDialog.createACtgCampaignCtgIs")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-1 block">{t("uiCreateCampaignDialog.campaignTitle")}</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("uiCreateCampaignDialog.eGSeedRoundCommunitySprint")}
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">{t("uiCreateCampaignDialog.descriptionOptional")}</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("uiCreateCampaignDialog.whatWillTheFundsBeUsed")}
              rows={3}
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1 flex items-center gap-1.5">
              <CurrencyIcon currency={currency === "coins" ? "coins" : "ctg"} className="h-4 w-4" />
              {t("uiCreateCampaignDialog.thresholdAmount")}{currency === "coins" ? t("uiCreateCampaignDialog.coins") : "$CTG"})
            </label>
            <Input
              type="number"
              min={1}
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              placeholder={`Target in ${currency === "coins" ? "Coins" : "$CTG"}`}
            />
            {currency === "coins" && threshold && (
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                <CurrencyIcon currency="coins" className="h-3 w-3" />
                ≈ €{(Number(threshold) * coinsRate).toFixed(2)}
              </p>
            )}
            {currency === "ctg" && threshold && (
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                <CurrencyIcon currency="ctg" className="h-3 w-3" />
                {Number(threshold).toLocaleString()} {t("uiCreateCampaignDialog.ctgNotFiatBacked")}
              </p>
            )}
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">{t("uiCreateCampaignDialog.dispatchMode")}</label>
            <Select value={dispatchMode} onValueChange={setDispatchMode}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">{t("uiCreateCampaignDialog.manualAdminDistributesWhenReady")}</SelectItem>
                {ocuEnabled && (
                  <SelectItem value="auto_pie">{t("uiCreateCampaignDialog.autoOcuPieProportionalOnThreshold")}</SelectItem>
                )}
                <SelectItem value="auto_equal">{t("uiCreateCampaignDialog.autoEqualSplitEqualToAll")}</SelectItem>
              </SelectContent>
            </Select>
            {!ocuEnabled && dispatchMode !== "manual" && dispatchMode !== "auto_equal" && (
              <p className="text-xs text-muted-foreground mt-1">
                {t("uiCreateCampaignDialog.ocuPieModeRequiresOcuTo")}
              </p>
            )}
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">{t("uiCreateCampaignDialog.endDateOptional")}</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !endDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="h-4 w-4 mr-2" />
                  {endDate ? format(endDate, "PPP") : t("uiCreateCampaignDialog.noEndDate")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={endDate}
                  onSelect={setEndDate}
                  disabled={(date) => date < new Date()}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("uiCreateCampaignDialog.cancel")}</Button>
          <Button onClick={handleSave} disabled={saving || !title.trim() || !threshold}>
            {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            {isEditing ? t("uiCreateCampaignDialog.update") : t("uiCreateCampaignDialog.create")} {t("uiCreateCampaignDialog.campaign")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
