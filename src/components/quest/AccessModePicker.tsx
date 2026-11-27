import { useTranslation } from "react-i18next";
import { Globe2, Users, EyeOff, CornerDownRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AccessMode, MinLevel } from "./questAccess";

export interface AccessValue {
  mode: AccessMode;
  minLevel: MinLevel;
}

interface Props {
  value: AccessValue;
  onChange: (v: AccessValue) => void;
  /** Guilde de référence ; null : quête sans guilde (pas de niveau N3). */
  guildId: string | null;
  /** Proposer « comme la guilde » (réglage d'une quête). */
  allowInherit?: boolean;
  /** Libellé du réglage de la guilde, affiché sous « comme la guilde ». */
  inheritedLabel?: string;
  /** Résumé de ce que couvre N3 dans cette guilde (rôles et formules), ou null si la table est vide. */
  n3Summary?: string | null;
  disabled?: boolean;
}

const ICONS: Record<AccessMode, typeof Globe2> = { inherit: CornerDownRight, public: Globe2, members: Users, hidden: EyeOff };

/**
 * Qui voit une quête (contrat commun avec le site Trois-Tiers) : tout le monde ; les membres à partir d'un niveau
 * (N2 adhésion active, N3 rôles ou formules de membrane), qui voient la fiche, le contenu restant à l'équipe ;
 * ou personne d'autre que ses admins.
 */
export function AccessModePicker({ value, onChange, guildId, allowInherit, inheritedLabel, n3Summary, disabled }: Props) {
  const { t } = useTranslation();
  const modes: AccessMode[] = [...(allowInherit ? (["inherit"] as AccessMode[]) : []), "public", "members", "hidden"];

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
            {m === "members" && active && guildId && (
              <div className="px-3 pb-3 pl-10 space-y-1.5" role="radiogroup" aria-label={t("questAccess.minLevel")}>
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{t("questAccess.minLevel")}</p>
                {(["N2", "N3"] as MinLevel[]).map((lvl) => (
                  <label key={lvl} className="flex items-start gap-2 text-sm cursor-pointer">
                    <input type="radio" name="min-level" className="mt-1 accent-primary" checked={value.minLevel === lvl} disabled={disabled}
                      onChange={() => onChange({ ...value, minLevel: lvl })} />
                    <span>
                      <span className="font-medium">{t(`questAccess.level.${lvl}`)}</span>
                      <span className="block text-xs text-muted-foreground">
                        {lvl === "N3" ? (n3Summary ? t("questAccess.levelHint.N3", { list: n3Summary }) : t("questAccess.levelHint.N3empty")) : t("questAccess.levelHint.N2")}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
