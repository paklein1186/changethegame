import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";
import { CurrencyIcon } from "@/components/CurrencyIcon";

interface FundingPoolWizardProps {
  coinsBudget: string;
  setCoinsBudget: (v: string) => void;
  ctgBudget: string;
  setCtgBudget: (v: string) => void;
  coinsEnabled: boolean;
  setCoinsEnabled: (v: boolean) => void;
  ctgEnabled: boolean;
  setCtgEnabled: (v: boolean) => void;
  coinsBalance: number;
  ctgBalance: number;
  coinEurRate: number;
  toEur: (coins: number) => string;
}

export function FundingPoolWizard({
  coinsBudget, setCoinsBudget,
  ctgBudget, setCtgBudget,
  coinsEnabled, setCoinsEnabled,
  ctgEnabled, setCtgEnabled,
  coinsBalance, ctgBalance,
  coinEurRate, toEur,
}: FundingPoolWizardProps) {
  const { t } = useTranslation();
  const coinsVal = Number(coinsBudget) || 0;
  const ctgVal = Number(ctgBudget) || 0;

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">{t("uiFundingPoolWizard.fundingPools")}</h3>
      <p className="text-xs text-muted-foreground">
        {t("uiFundingPoolWizard.allocateFundsFromYourWalletTo")}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Coins Pool */}
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CurrencyIcon currency="coins" className="h-4 w-4" />
              <Label className="text-sm font-semibold">{t("uiFundingPoolWizard.coinsPool")}</Label>
            </div>
            <Switch checked={coinsEnabled} onCheckedChange={setCoinsEnabled} />
          </div>

          {coinsEnabled && (
            <>
              <div>
                <Label className="text-xs">{t("uiFundingPoolWizard.coinsToAllocate")}{toEur(coinsVal)})</Label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={coinsBudget}
                  onChange={(e) => setCoinsBudget(e.target.value)}
                  className="mt-1"
                  placeholder="0"
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                {t("uiFundingPoolWizard.coinsAreFiatBackedAndWithdrawable")}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {t("uiFundingPoolWizard.yourBalance")} <span className="font-medium text-foreground">{coinsBalance.toFixed(0)} {t("uiFundingPoolWizard.coins")}</span>
              </p>
              {coinsVal > coinsBalance && (
                <div className="flex items-center gap-1.5 text-xs text-destructive">
                  <AlertTriangle className="h-3 w-3" />
                  {t("uiFundingPoolWizard.insufficientCoinsBalance")}
                </div>
              )}
            </>
          )}
        </Card>

        {/* CTG Pool */}
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CurrencyIcon currency="ctg" className="h-4 w-4" />
              <Label className="text-sm font-semibold">{t("uiFundingPoolWizard.ctgPool")}</Label>
            </div>
            <Switch checked={ctgEnabled} onCheckedChange={setCtgEnabled} />
          </div>

          {ctgEnabled && (
            <>
              <div>
                <Label className="text-xs">{t("uiFundingPoolWizard.ctgToAllocate")}</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.5"
                  value={ctgBudget}
                  onChange={(e) => setCtgBudget(e.target.value)}
                  className="mt-1"
                  placeholder="0"
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                {t("uiFundingPoolWizard.ctgIsFrozenFromDemurrageWhile")}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {t("uiFundingPoolWizard.yourBalance")} <span className="font-medium text-foreground">{ctgBalance.toFixed(1)} $CTG</span>
              </p>
              {ctgVal > ctgBalance && (
                <div className="flex items-center gap-1.5 text-xs text-destructive">
                  <AlertTriangle className="h-3 w-3" />
                  {t("uiFundingPoolWizard.insufficientCtgBalance")}
                </div>
              )}
            </>
          )}
        </Card>
      </div>

      {(coinsVal > 0 || ctgVal > 0) && (
        <div className="rounded-md bg-muted/50 p-3 text-sm">
          <p>
            {t("uiFundingPoolWizard.thisQuestWillHold")}
            {coinsVal > 0 && <> 🟩 <span className="font-semibold">{coinsVal}</span> {t("uiFundingPoolWizard.coins")}</>}
            {coinsVal > 0 && ctgVal > 0 && "  +  "}
            {ctgVal > 0 && <> 🌱 <span className="font-semibold">{ctgVal}</span> $CTG</>}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {t("uiFundingPoolWizard.youCanAddMoreFundsOr")}
          </p>
        </div>
      )}
    </div>
  );
}
