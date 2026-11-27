import { useTranslation } from "react-i18next";
import i18n from "@/i18n/config";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Users, Shield, Building2, Landmark, Crown } from "lucide-react";

export type AudienceSegment =
  | "all"
  | "guild_admins"
  | "company_admins"
  | "org_reps"
  | "shareholders_a"
  | "shareholders_b";

interface SegmentOption {
  value: AudienceSegment;
  label: string;
  icon: React.ReactNode;
  description: string;
}

const SEGMENTS: SegmentOption[] = [
  { value: "all", get label() { return i18n.t("uiBroadcastAudiencePicker.allUsers"); }, icon: <Users className="h-4 w-4" />, get description() { return i18n.t("uiBroadcastAudiencePicker.everyRegisteredUser"); } },
  { value: "guild_admins", get label() { return i18n.t("uiBroadcastAudiencePicker.guildAdmins"); }, icon: <Shield className="h-4 w-4" />, get description() { return i18n.t("uiBroadcastAudiencePicker.usersWithAdminRoleInAny"); } },
  { value: "company_admins", get label() { return i18n.t("uiBroadcastAudiencePicker.companyAdmins"); }, icon: <Building2 className="h-4 w-4" />, get description() { return i18n.t("uiBroadcastAudiencePicker.usersWithAdminRoleInAny2"); } },
  { value: "org_reps", get label() { return i18n.t("uiBroadcastAudiencePicker.organizationReps"); }, icon: <Landmark className="h-4 w-4" />, get description() { return i18n.t("uiBroadcastAudiencePicker.contactPersonsOfTraditionalOrganizations"); } },
  { value: "shareholders_a", get label() { return i18n.t("uiBroadcastAudiencePicker.shareholdersClassA"); }, icon: <Crown className="h-4 w-4" />, get description() { return i18n.t("uiBroadcastAudiencePicker.cooperativeMembersWithClassAShares"); } },
  { value: "shareholders_b", get label() { return i18n.t("uiBroadcastAudiencePicker.shareholdersClassB"); }, icon: <Crown className="h-4 w-4" />, get description() { return i18n.t("uiBroadcastAudiencePicker.cooperativeMembersWithClassBShares"); } },
];

interface Props {
  selected: AudienceSegment[];
  onChange: (segments: AudienceSegment[]) => void;
  disabled?: boolean;
}

export function BroadcastAudiencePicker({ selected, onChange, disabled }: Props) {
  const { t } = useTranslation();
  const toggle = (seg: AudienceSegment) => {
    if (seg === "all") {
      // Toggle "all" — deselect others
      onChange(selected.includes("all") ? [] : ["all"]);
      return;
    }
    // If picking specific, remove "all"
    let next = selected.filter((s) => s !== "all");
    if (next.includes(seg)) {
      next = next.filter((s) => s !== seg);
    } else {
      next.push(seg);
    }
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{t("uiBroadcastAudiencePicker.audience")}</Label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {SEGMENTS.map((seg) => (
          <label
            key={seg.value}
            className={`flex items-start gap-2.5 rounded-lg border p-2.5 cursor-pointer transition-colors ${
              selected.includes(seg.value) ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
            } ${disabled ? "opacity-50 pointer-events-none" : ""}`}
          >
            <Checkbox
              checked={selected.includes(seg.value)}
              onCheckedChange={() => toggle(seg.value)}
              disabled={disabled}
              className="mt-0.5"
            />
            <div className="flex-1 min-w-0">
              <span className="flex items-center gap-1.5 text-sm font-medium">
                {seg.icon} {seg.label}
              </span>
              <p className="text-xs text-muted-foreground mt-0.5">{seg.description}</p>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}
