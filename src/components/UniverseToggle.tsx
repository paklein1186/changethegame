import i18n from "@/i18n/config";
import { Sparkles, Globe, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { UniverseMode } from "@/lib/universeMapping";

interface Props {
  value: UniverseMode;
  onChange: (mode: UniverseMode) => void;
  className?: string;
}

const OPTIONS: { value: UniverseMode; label: string; icon: typeof Sparkles }[] = [
  { value: "creative", get label() { return i18n.t("uiUniverseToggle.creative"); }, icon: Sparkles },
  { value: "impact", get label() { return i18n.t("uiUniverseToggle.impact"); }, icon: Globe },
  { value: "both", get label() { return i18n.t("uiUniverseToggle.both"); }, icon: Layers },
];

export function UniverseToggle({ value, onChange, className = "" }: Props) {
  return (
    <div className={`inline-flex items-center rounded-lg border border-border bg-muted/40 p-0.5 ${className}`}>
      {OPTIONS.map(({ value: v, label, icon: Icon }) => (
        <Button
          key={v}
          variant={value === v ? "default" : "ghost"}
          size="sm"
          className={`text-xs gap-1.5 h-7 px-3 ${value === v ? "" : "text-muted-foreground"}`}
          onClick={() => onChange(v)}
        >
          <Icon className="h-3.5 w-3.5" />
          {label}
        </Button>
      ))}
    </div>
  );
}
