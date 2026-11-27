import i18n from "@/i18n/config";
import { CircleDollarSign, Sprout, Zap, Star, Scale, type LucideProps } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type CurrencyType = "coins" | "ctg" | "credits" | "xp" | "weight";

interface CurrencyConfig {
  icon: React.FC<LucideProps>;
  label: string;
  tooltip: string;
  colorClass: string;
}

const CURRENCY_MAP: Record<CurrencyType, CurrencyConfig> = {
  coins: {
    icon: CircleDollarSign,
    get label() { return i18n.t("uiCurrencyIcon.coins"); },
    get tooltip() { return i18n.t("uiCurrencyIcon.coinsFiatBackedMissionCurrency1"); },
    colorClass: "text-amber-600 dark:text-amber-400",
  },
  ctg: {
    icon: Sprout,
    label: "$CTG",
    get tooltip() { return i18n.t("uiCurrencyIcon.ctgEarnedByContributingToThe"); },
    colorClass: "text-emerald-600 dark:text-emerald-400",
  },
  credits: {
    icon: Zap,
    get label() { return i18n.t("uiCurrencyIcon.credits"); },
    get tooltip() { return i18n.t("uiCurrencyIcon.creditsPlatformUtilityFuelSpendOn"); },
    colorClass: "text-cyan-600 dark:text-cyan-400",
  },
  xp: {
    icon: Star,
    label: "XP",
    get tooltip() { return i18n.t("uiCurrencyIcon.xpYourPermanentReputationScoreNever"); },
    colorClass: "text-violet-600 dark:text-violet-400",
  },
  weight: {
    icon: Scale,
    label: "Weight",
    get tooltip() { return i18n.t("uiCurrencyIcon.weightMultiplierUsedToCalculateWeighted"); },
    colorClass: "text-slate-600 dark:text-slate-400",
  },
};

interface CurrencyIconProps extends Omit<LucideProps, "ref"> {
  currency: CurrencyType;
  /** Show tooltip on hover */
  showTooltip?: boolean;
  /** Override default color class */
  colorClassName?: string;
}

export function CurrencyIcon({
  currency,
  showTooltip = false,
  colorClassName,
  className,
  ...props
}: CurrencyIconProps) {
  const config = CURRENCY_MAP[currency];
  const Icon = config.icon;
  const iconEl = (
    <Icon className={cn(colorClassName ?? config.colorClass, className)} {...props} />
  );

  if (!showTooltip) return iconEl;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{iconEl}</TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        {config.tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

/** Helper to get config without rendering */
export function getCurrencyConfig(currency: CurrencyType) {
  return CURRENCY_MAP[currency];
}

export { CURRENCY_MAP };
