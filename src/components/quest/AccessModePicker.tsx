import { useTranslation } from "react-i18next";
import { Globe2, Users, Layers, EyeOff, CornerDownRight } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { useGuildMembranes, type AccessMode } from "./questAccess";

export interface AccessValue {
  mode: AccessMode;
  plans: string[];
  roleIds: string[];
}

interface Props {
  value: AccessValue;
  onChange: (v: AccessValue) => void;
  /** Guilde de référence (ses formules et rôles) ; null : quête sans guilde. */
  guildId: string | null;
  /** Proposer « comme la guilde » (réglage d'une quête). */
  allowInherit?: boolean;
  /** Libellé du réglage de la guilde, affiché sous « comme la guilde ». */
  inheritedLabel?: string;
  disabled?: boolean;
}

const ICONS: Record<AccessMode, typeof Globe2> = {
  inherit: CornerDownRight, public: Globe2, members: Users, selected: Layers, hidden: EyeOff,
};

/** Choix des membranes qui voient une quête : public, membres en règle, formules ou rôles choisis, cachée. */
export function AccessModePicker({ value, onChange, guildId, allowInherit, inheritedLabel, disabled }: Props) {
  const { t } = useTranslation();
  const { data: membranes } = useGuildMembranes(guildId);
  const modes: AccessMode[] = [
    ...(allowInherit ? (["inherit"] as AccessMode[]) : []),
    "public", "members", ...(guildId ? (["selected"] as AccessMode[]) : []), "hidden",
  ];
  const toggle = (list: string[], item: string) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

  return (
    <div className="space-y-2" role="radiogroup" aria-label={t("questAccess.whoSees")}>
      {modes.map((m) => {
        const Icon = ICONS[m];
        const active = value.mode === m;
        return (
          <div key={m} className={cn("rounded-lg border transition-colors", active ? "border-primary bg-primary/5" : "border-border")}>
            <button
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => onChange({ ...value, mode: m })}
              className="w-full flex items-start gap-3 p-3 text-left disabled:opacity-60"
            >
              <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", active ? "text-primary" : "text-muted-foreground")} />
              <span className="min-w-0">
                <span className="block text-sm font-medium">{t(`questAccess.mode.${m}`)}</span>
                <span className="block text-xs text-muted-foreground">
                  {m === "inherit" && inheritedLabel
                    ? t("questAccess.inheritCurrently", { label: inheritedLabel })
                    : t(`questAccess.modeHint.${m}${m === "members" && !guildId ? "NoGuild" : ""}`)}
                </span>
              </span>
            </button>
            {m === "selected" && active && (
              <div className="px-3 pb-3 pl-10 space-y-3">
                {!membranes?.plans.length && !membranes?.roles.length && (
                  <p className="text-xs text-muted-foreground">{t("questAccess.noMembranes")}</p>
                )}
                {!!membranes?.plans.length && (
                  <fieldset className="space-y-1.5">
                    <legend className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">{t("questAccess.plans")}</legend>
                    {membranes.plans.map((p) => (
                      <label key={p.code} className="flex items-center gap-2 text-sm">
                        <Checkbox checked={value.plans.includes(p.code)} disabled={disabled}
                          onCheckedChange={() => onChange({ ...value, plans: toggle(value.plans, p.code) })} />
                        {p.label}
                      </label>
                    ))}
                  </fieldset>
                )}
                {!!membranes?.roles.length && (
                  <fieldset className="space-y-1.5">
                    <legend className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">{t("questAccess.roles")}</legend>
                    {membranes.roles.map((r) => (
                      <label key={r.id} className="flex items-center gap-2 text-sm">
                        <Checkbox checked={value.roleIds.includes(r.id)} disabled={disabled}
                          onCheckedChange={() => onChange({ ...value, roleIds: toggle(value.roleIds, r.id) })} />
                        {r.name}
                      </label>
                    ))}
                  </fieldset>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
