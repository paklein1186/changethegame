import { useTranslation } from "react-i18next";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Save, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useCoinsRate } from "@/hooks/useCoinsRate";
import { Link } from "react-router-dom";

type MembershipStyle = "none" | "symbolic_supporter" | "core_members" | "cooperative_circle";

const PRESETS: Record<MembershipStyle, {
  entry_fee_credits: number;
  members_only_quests: boolean;
  members_only_events: boolean;
  members_only_voting: boolean;
  membership_benefits_text: string;
  membership_commitments_text: string;
}> = {
  none: {
    entry_fee_credits: 0,
    members_only_quests: false,
    members_only_events: false,
    members_only_voting: false,
    membership_benefits_text: "",
    membership_commitments_text: "",
  },
  symbolic_supporter: {
    entry_fee_credits: 20,
    members_only_quests: false,
    members_only_events: false,
    members_only_voting: false,
    membership_benefits_text: "You support the guild's work and appear as a supporter on our page.",
    membership_commitments_text: "You contribute a one-time entry fee to help us run activities.",
  },
  core_members: {
    entry_fee_credits: 100,
    members_only_quests: true,
    members_only_events: true,
    members_only_voting: true,
    membership_benefits_text: "You can create quests and events in this guild, vote on key decisions, and are listed as a core member.",
    membership_commitments_text: "You contribute an entry fee and commit to at least one contribution per year, plus our shared code of practice.",
  },
  cooperative_circle: {
    entry_fee_credits: 250,
    members_only_quests: true,
    members_only_events: true,
    members_only_voting: true,
    membership_benefits_text: "You join the cooperative circle: full participation in quests, events, and governance, with priority in residencies and strategic decisions.",
    membership_commitments_text: "You contribute a higher entry fee and commit to regular contributions, participation in assemblies, and shared responsibility.",
  },
};

interface Props {
  guild: any;
  guildId: string;
}

export function GuildMembershipSettingsPanel({ guild, guildId }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { rate, toEur } = useCoinsRate();

  const [enableMembership, setEnableMembership] = useState<boolean>(guild.enable_membership ?? false);
  const [membershipStyle, setMembershipStyle] = useState<MembershipStyle>((guild.membership_style as MembershipStyle) ?? "none");
  const [entryFee, setEntryFee] = useState<number>(guild.entry_fee_credits ?? 0);
  const [membersOnlyQuests, setMembersOnlyQuests] = useState<boolean>(guild.members_only_quests ?? false);
  const [membersOnlyEvents, setMembersOnlyEvents] = useState<boolean>(guild.members_only_events ?? false);
  const [membersOnlyVoting, setMembersOnlyVoting] = useState<boolean>(guild.members_only_voting ?? false);
  const [billingModel, setBillingModel] = useState<string>(guild.billing_model ?? "one_time");
  const [monthlyFee, setMonthlyFee] = useState<number>(guild.monthly_fee_credits ?? 0);
  const [monthlyFeeMax, setMonthlyFeeMax] = useState<number>(guild.monthly_fee_max_credits ?? 0);
  const [entryFeeMax, setEntryFeeMax] = useState<number>(guild.entry_fee_max_credits ?? 0);
  const [joiningFee, setJoiningFee] = useState<number>(guild.joining_fee_credits ?? 0);
  const [priceMode, setPriceMode] = useState<"fixed" | "range">(
    (guild.billing_model === "monthly" || guild.billing_model === "yearly"
      ? Number(guild.monthly_fee_max_credits ?? 0) > Number(guild.monthly_fee_credits ?? 0)
      : Number(guild.entry_fee_max_credits ?? 0) > Number(guild.entry_fee_credits ?? 0))
      ? "range"
      : "fixed",
  );
  const [requiresApplication, setRequiresApplication] = useState<boolean>(guild.requires_application_before_payment ?? false);
  const [benefitsText, setBenefitsText] = useState<string>(guild.membership_benefits_text ?? "");
  const [commitmentsText, setCommitmentsText] = useState<string>(guild.membership_commitments_text ?? "");

  // Advanced
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [redistributionPercent, setRedistributionPercent] = useState<number>(guild.redistribution_percent ?? 50);
  const [xpBonus, setXpBonus] = useState<number>(guild.member_xp_bonus_percent ?? 0);
  const [durationMonths, setDurationMonths] = useState<string>(guild.membership_duration_months?.toString() ?? "");

  const applyPreset = (style: MembershipStyle) => {
    if (style === "none") return;
    const p = PRESETS[style];
    setEntryFee(p.entry_fee_credits);
    setMembersOnlyQuests(p.members_only_quests);
    setMembersOnlyEvents(p.members_only_events);
    setMembersOnlyVoting(p.members_only_voting);
    // Only overwrite text if currently empty or matches previous preset
    if (!benefitsText || Object.values(PRESETS).some((pr) => pr.membership_benefits_text === benefitsText)) {
      setBenefitsText(p.membership_benefits_text);
    }
    if (!commitmentsText || Object.values(PRESETS).some((pr) => pr.membership_commitments_text === commitmentsText)) {
      setCommitmentsText(p.membership_commitments_text);
    }
  };

  const handleStyleChange = (val: MembershipStyle) => {
    setMembershipStyle(val);
    if (enableMembership) applyPreset(val);
  };

  const handleSave = async () => {
    // Mensuelle ou annuelle : même champs (montant par période), seule la durée change.
    const isMonthly = billingModel === "monthly" || billingModel === "yearly";
    const useRange = priceMode === "range";
    const { error } = await supabase
      .from("guilds")
      .update({
        enable_membership: enableMembership,
        membership_style: membershipStyle,
        entry_fee_credits: isMonthly ? null : entryFee || null,
        entry_fee_max_credits:
          !isMonthly && useRange && entryFeeMax > entryFee ? entryFeeMax : null,
        members_only_quests: membersOnlyQuests,
        members_only_events: membersOnlyEvents,
        members_only_voting: membersOnlyVoting,
        membership_benefits_text: benefitsText || null,
        membership_commitments_text: commitmentsText || null,
        redistribution_percent: redistributionPercent,
        member_xp_bonus_percent: xpBonus,
        membership_duration_months: durationMonths ? parseInt(durationMonths) : null,
        billing_model: billingModel,
        monthly_fee_credits: isMonthly ? monthlyFee || null : null,
        monthly_fee_max_credits:
          isMonthly && useRange && monthlyFeeMax > monthlyFee ? monthlyFeeMax : null,
        joining_fee_credits: isMonthly ? joiningFee || null : null,
        requires_application_before_payment: requiresApplication,
      } as any)

      .eq("id", guildId);

    if (error) {
      toast({ title: t("uiGuildMembershipSettingsPanel.failedToSaveMembershipSettings"), variant: "destructive" });
      return;
    }
    qc.invalidateQueries({ queryKey: ["guild-settings", guildId] });
    qc.invalidateQueries({ queryKey: ["guild", guildId] });
    toast({ title: t("uiGuildMembershipSettingsPanel.membershipSettingsSaved") });
  };

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h3 className="text-lg font-semibold mb-1">{t("uiGuildMembershipSettingsPanel.membershipContributions")}</h3>
        <p className="text-sm text-muted-foreground">
          {t("uiGuildMembershipSettingsPanel.optionalTurnThisOnIfYou")}
        </p>
      </div>

      {/* Enable toggle */}
      <div className="flex items-center justify-between rounded-lg border border-border bg-card p-4">
        <div>
          <Label className="text-sm font-medium">{t("uiGuildMembershipSettingsPanel.enableMembership")}</Label>
          <p className="text-xs text-muted-foreground">{t("uiGuildMembershipSettingsPanel.addsAMembershipSystemToThis")}</p>
        </div>
        <Switch checked={enableMembership} onCheckedChange={setEnableMembership} />
      </div>

      {enableMembership && (
        <>
          {/* Membership style */}
          <div>
            <Label className="text-sm font-medium mb-1 block">{t("uiGuildMembershipSettingsPanel.membershipStyle")}</Label>
            <Select value={membershipStyle} onValueChange={(v) => handleStyleChange(v as MembershipStyle)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("uiGuildMembershipSettingsPanel.noMembership")}</SelectItem>
                <SelectItem value="symbolic_supporter">{t("uiGuildMembershipSettingsPanel.symbolicSupporters")}</SelectItem>
                <SelectItem value="core_members">{t("uiGuildMembershipSettingsPanel.coreMembers")}</SelectItem>
                <SelectItem value="cooperative_circle">{t("uiGuildMembershipSettingsPanel.cooperativeCircle")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Billing model */}
          <div>
            <Label className="text-sm font-medium mb-1 block">{t("uiGuildMembershipSettingsPanel.billingModel")}</Label>
            <Select value={billingModel} onValueChange={setBillingModel}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="one_time">{t("uiGuildMembershipSettingsPanel.oneTimeEntryFee")}</SelectItem>
                <SelectItem value="monthly">{t("uiGuildMembershipSettingsPanel.monthlyFeeRenewedAutomatically")}</SelectItem>
                <SelectItem value="yearly">{t("uiGuildMembershipSettingsPanel.yearlyFeeRenewedAutomatically")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <p className="text-xs text-muted-foreground -mt-2">
            {t("uiGuildMembershipSettingsPanel.membershipFeesArePaidInCoins")} {rate.toFixed(2)} {t("uiGuildMembershipSettingsPanel.membersTopUpTheirCoinsFrom")}{" "}
            <Link to="/settings/wallet" className="text-primary underline underline-offset-2">wallet</Link>.
          </p>

          {/* Fee editor — depends on the billing model */}
          {(() => {
            const isMonthly = billingModel === "monthly" || billingModel === "yearly";
            const yearly = billingModel === "yearly";
            const per = isMonthly ? (yearly ? " / year" : " / month") : "";
            const fee = isMonthly ? monthlyFee : entryFee;
            const feeMax = isMonthly ? monthlyFeeMax : entryFeeMax;
            const setFee = isMonthly ? setMonthlyFee : setEntryFee;
            const setFeeMax = isMonthly ? setMonthlyFeeMax : setEntryFeeMax;
            const validRange = priceMode === "range" && feeMax > fee;

            return (
              <div className="rounded-lg border border-border bg-card p-4 space-y-4">
                <div>
                  <Label className="text-sm font-medium mb-1 block">
                    {isMonthly ? (yearly ? t("uiGuildMembershipSettingsPanel.yearlyMembershipPrice") : t("uiGuildMembershipSettingsPanel.monthlyMembershipPrice")) : t("uiGuildMembershipSettingsPanel.oneTimeEntryPrice")}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {t("uiGuildMembershipSettingsPanel.paidInCoins")}{isMonthly
                      ? `, every ${yearly ? "year" : "month"}, to keep the member role. Renewed automatically from the member's Coins balance, with a reminder email one week before`
                      : ` ${t("uiGuildMembershipSettingsPanel.toBecomeAMember")}`}.
                  </p>
                </div>

                <Select value={priceMode} onValueChange={(v) => setPriceMode(v as "fixed" | "range")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed">{t("uiGuildMembershipSettingsPanel.fixedPriceEveryonePaysTheSame")}</SelectItem>
                    <SelectItem value="range">{t("uiGuildMembershipSettingsPanel.freeChoiceEachMemberPicksAn")}</SelectItem>
                  </SelectContent>
                </Select>

                {priceMode === "fixed" ? (
                  <div>
                    <Label className="text-xs mb-1 block">{t("uiGuildMembershipSettingsPanel.priceCoins")}{per})</Label>
                    <Input
                      type="number"
                      min={0}
                      value={fee}
                      onChange={(e) => setFee(parseInt(e.target.value) || 0)}
                    />
                    {fee > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {t("uiGuildMembershipSettingsPanel.membersPay")} {fee} {t("uiGuildMembershipSettingsPanel.coins")}{per} (~{toEur(fee)} €{per}).
                      </p>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs mb-1 block">{t("uiGuildMembershipSettingsPanel.minimumCoins")}{per})</Label>
                        <Input
                          type="number"
                          min={0}
                          value={fee}
                          onChange={(e) => setFee(parseInt(e.target.value) || 0)}
                        />
                      </div>
                      <div>
                        <Label className="text-xs mb-1 block">{t("uiGuildMembershipSettingsPanel.maximumCoins")}{per})</Label>
                        <Input
                          type="number"
                          min={0}
                          value={feeMax}
                          onChange={(e) => setFeeMax(parseInt(e.target.value) || 0)}
                        />
                      </div>
                    </div>
                    {validRange ? (
                      <p className="text-xs text-muted-foreground">
                        {t("uiGuildMembershipSettingsPanel.eachMemberChoosesWhatTheyPay")} {fee} {t("uiGuildMembershipSettingsPanel.and")} {feeMax} {t("uiGuildMembershipSettingsPanel.coins")}{per} (
                        {toEur(fee)} € – {toEur(feeMax)} €).
                      </p>
                    ) : (
                      <p className="text-xs text-destructive">
                        {t("uiGuildMembershipSettingsPanel.theMaximumMustBeHigherThan")} {fee} {t("uiGuildMembershipSettingsPanel.coins2")}
                      </p>
                    )}
                  </>
                )}

                {isMonthly && (
                  <div>
                    <Label className="text-xs mb-1 block">{t("uiGuildMembershipSettingsPanel.joiningFeeCoinsOptional")}</Label>
                    <Input
                      type="number"
                      min={0}
                      value={joiningFee}
                      onChange={(e) => setJoiningFee(parseInt(e.target.value) || 0)}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      {t("uiGuildMembershipSettingsPanel.chargedOnceOnTopOfThe")} {yearly ? "yearly" : "monthly"} payment
                      {joiningFee > 0 ? ` — about ${toEur(joiningFee)} €` : ""}.
                    </p>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Application gating */}
          <div className="flex items-center justify-between rounded-lg border border-border bg-card p-4">
            <div className="pr-3">
              <Label className="text-sm font-medium">{t("uiGuildMembershipSettingsPanel.requireAnApprovedApplicationBeforePaying")}</Label>
              <p className="text-xs text-muted-foreground">{t("uiGuildMembershipSettingsPanel.candidatesFillTheFormAnAdmin")}</p>
            </div>
            <Switch checked={requiresApplication} onCheckedChange={setRequiresApplication} />
          </div>


          {/* Gating checkboxes */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Checkbox
                checked={membersOnlyQuests}
                onCheckedChange={(v) => setMembersOnlyQuests(!!v)}
              />
              <Label className="text-sm">{t("uiGuildMembershipSettingsPanel.onlyMembersCanCreateQuestsIn")}</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                checked={membersOnlyEvents}
                onCheckedChange={(v) => setMembersOnlyEvents(!!v)}
              />
              <Label className="text-sm">{t("uiGuildMembershipSettingsPanel.onlyMembersCanCreateEventsIn")}</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                checked={membersOnlyVoting}
                onCheckedChange={(v) => setMembersOnlyVoting(!!v)}
              />
              <Label className="text-sm">{t("uiGuildMembershipSettingsPanel.onlyMembersCanParticipateInGuild")}</Label>
            </div>
          </div>

          {/* Benefits & commitments */}
          <div>
            <Label className="text-sm font-medium mb-1 block">{t("uiGuildMembershipSettingsPanel.whatMembersGet")}</Label>
            <Textarea
              value={benefitsText}
              onChange={(e) => setBenefitsText(e.target.value)}
              rows={3}
              className="resize-none"
              placeholder={t("uiGuildMembershipSettingsPanel.describeWhatMembersGet")}
            />
          </div>
          <div>
            <Label className="text-sm font-medium mb-1 block">{t("uiGuildMembershipSettingsPanel.whatMembersCommitTo")}</Label>
            <Textarea
              value={commitmentsText}
              onChange={(e) => setCommitmentsText(e.target.value)}
              rows={3}
              className="resize-none"
              placeholder={t("uiGuildMembershipSettingsPanel.describeWhatMembersCommitTo")}
            />
          </div>

          {/* Advanced toggle */}
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-1 text-sm text-primary hover:underline"
          >
            {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            {showAdvanced ? t("uiGuildMembershipSettingsPanel.hideAdvancedOptions") : t("uiGuildMembershipSettingsPanel.showAdvancedOptions")}
          </button>

          {showAdvanced && (
            <div className="space-y-4 pl-2 border-l-2 border-primary/20">
              <div>
                <Label className="text-sm font-medium mb-1 block">
                  {t("uiGuildMembershipSettingsPanel.ctgRedistribution")}{redistributionPercent}%)
                </Label>
                <p className="text-xs text-muted-foreground mb-2">
                  {t("uiGuildMembershipSettingsPanel.percentOfQuestEarnedCtgRedistributed")}
                </p>
                <Slider
                  value={[redistributionPercent]}
                  onValueChange={(v) => setRedistributionPercent(v[0])}
                  min={0}
                  max={100}
                  step={5}
                />
              </div>
              <div>
                <Label className="text-sm font-medium mb-1 block">{t("uiGuildMembershipSettingsPanel.xpBonusForMembers")}</Label>
                <p className="text-xs text-muted-foreground mb-2">
                  {t("uiGuildMembershipSettingsPanel.xpBonusForMembersInGuild")}
                </p>
                <Input
                  type="number"
                  min={0}
                  max={50}
                  value={xpBonus}
                  onChange={(e) => setXpBonus(parseInt(e.target.value) || 0)}
                />
              </div>
              <div>
                <Label className="text-sm font-medium mb-1 block">{t("uiGuildMembershipSettingsPanel.membershipDurationMonths")}</Label>
                <p className="text-xs text-muted-foreground mb-2">
                  {t("uiGuildMembershipSettingsPanel.ifEmptyMembershipDoesNotExpire")}
                </p>
                <Input
                  type="number"
                  min={1}
                  value={durationMonths}
                  onChange={(e) => setDurationMonths(e.target.value)}
                  placeholder={t("uiGuildMembershipSettingsPanel.noExpiry")}
                />
              </div>
            </div>
          )}
        </>
      )}

      <Button onClick={handleSave} className="w-full">
        <Save className="h-4 w-4 mr-2" /> {t("uiGuildMembershipSettingsPanel.saveMembershipSettings")}
      </Button>
    </div>
  );
}
