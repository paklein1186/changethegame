import { useTranslation } from "react-i18next";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Package, ArrowLeft, CheckCircle, Loader2, ArrowRight, Info, RefreshCw } from "lucide-react";
import { CurrencyIcon } from "@/components/CurrencyIcon";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageShell } from "@/components/PageShell";
import { useAuth } from "@/hooks/useAuth";
import { usePlanLimits } from "@/hooks/usePlanLimits";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { CREDIT_BUNDLES, CREDIT_COSTS, ECONOMY_LABELS } from "@/lib/xpCreditsConfig";

export default function BuyXpPage() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const { userCredits, userXp, plan, refresh } = usePlanLimits();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState<string | null>(null);

  const success = searchParams.get("success") === "true";
  const successBundle = searchParams.get("bundle");
  const successSessionId = searchParams.get("session_id");
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);

  // CTG balance & exchange rate
  const { data: ctgData } = useQuery({
    queryKey: ["buy-page-ctg"],
    queryFn: async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("ctg_balance")
        .eq("user_id", session?.user?.id ?? "")
        .maybeSingle();
      const { data: rate } = await supabase
        .from("ctg_exchange_rates")
        .select("rate_ctg_to_credits")
        .eq("active", true)
        .maybeSingle();
      return {
        ctgBalance: Number((profile as any)?.ctg_balance ?? 0),
        rate: Number((rate as any)?.rate_ctg_to_credits ?? 5),
      };
    },
    enabled: !!session?.user?.id,
  });

  const [exchangeAmount, setExchangeAmount] = useState("");
  const [exchangeLoading, setExchangeLoading] = useState(false);

  const handleCtgExchange = async () => {
    const amt = parseFloat(exchangeAmount);
    if (!amt || amt <= 0) return;
    setExchangeLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ctg-exchange", {
        body: { ctg_amount: amt },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({
        title: t("uiBuyXpPage.exchangeSuccessful"),
        description: `${data.ctg_spent} $CTG → ${data.credits_received} Credits`,
      });
      setExchangeAmount("");
      refresh();
    } catch (err: any) {
      toast({ title: t("uiBuyXpPage.exchangeFailed"), description: err.message, variant: "destructive" });
    } finally {
      setExchangeLoading(false);
    }
  };

  const previewCredits = ctgData?.rate
    ? Math.floor((parseFloat(exchangeAmount) || 0) * ctgData.rate)
    : 0;

  useEffect(() => {
    if (success && (successBundle || successSessionId) && !verified && !verifying) {
      setVerifying(true);
      supabase.functions.invoke("verify-credit-purchase", {
        body: { bundleCode: successBundle, sessionId: successSessionId },
      }).then(({ data, error }) => {
        setVerifying(false);
        setVerified(true);
        refresh();
        if (data?.granted) {
          toast({ title: t("uiBuyXpPage.creditsPurchased"), description: `${data.creditsAmount} credits added to your account.` });
        } else if (data?.alreadyGranted) {
          toast({ title: t("uiBuyXpPage.creditsAlreadyAdded"), description: t("uiBuyXpPage.thisPurchaseWasAlreadyProcessed") });
        } else if (error) {
          toast({ title: t("uiBuyXpPage.verificationIssue"), description: t("uiBuyXpPage.creditsMayTakeAMomentTo"), variant: "destructive" });
        }
      });
    }
  }, [success, successBundle, verified, verifying]);

  const handleBuy = async (code: string) => {
    setLoading(code);
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: { mode: "credit_bundle", bundleCode: code },
      });
      if (error) throw error;
      if (data?.url) window.open(data.url, "_blank");
    } catch (err: any) {
      toast({ title: t("uiBuyXpPage.error"), description: err.message, variant: "destructive" });
    } finally {
      setLoading(null);
    }
  };

  return (
    <PageShell>
      <div className="max-w-3xl mx-auto">
        <Button variant="ghost" size="sm" asChild className="mb-4">
          <Link to="/me"><ArrowLeft className="h-4 w-4 mr-1" /> {t("uiBuyXpPage.backToMe")}</Link>
        </Button>

        {success && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="rounded-lg border border-success/30 bg-success/5 p-4 mb-6 flex items-center gap-3">
            {verifying ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : <CheckCircle className="h-5 w-5 text-success" />}
            <div>
              <p className="font-medium text-sm">{verifying ? t("uiBuyXpPage.verifyingPayment") : t("uiBuyXpPage.paymentSuccessful")}</p>
              <p className="text-xs text-muted-foreground">{verifying ? t("uiBuyXpPage.pleaseWaitWhileWeConfirmYour") : t("uiBuyXpPage.yourCreditsHaveBeenAddedTo")}</p>
            </div>
          </motion.div>
        )}

        <div className="text-center mb-8">
          <h1 className="font-display text-3xl font-bold mb-2">{t("uiBuyXpPage.buyCredits")}</h1>
          <p className="text-muted-foreground">{t("uiBuyXpPage.creditsArePlatformUtilityUseThem")}</p>
          <div className="mt-4 flex items-center justify-center gap-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-5 py-2">
              <CurrencyIcon currency="credits" className="h-5 w-5" />
              <span className="text-lg font-bold">{userCredits}</span>
              <span className="text-sm text-muted-foreground">{t("uiBuyXpPage.credits")}</span>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/50 px-4 py-2">
              <span className="text-sm font-medium">{userXp} XP</span>
              <span className="text-xs text-muted-foreground">{t("uiBuyXpPage.reputation")}</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {t("uiBuyXpPage.yourPlan")}{plan.planName}{t("uiBuyXpPage.includes")} {plan.monthlyIncludedCredits} {t("uiBuyXpPage.creditsMonth")}
          </p>
        </div>

        {/* ── $CTG → Credits exchange ── */}
        {ctgData && ctgData.ctgBalance > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-6 mb-6"
          >
            <div className="flex items-center gap-3 mb-3">
              <CurrencyIcon currency="ctg" className="h-6 w-6" />
              <div>
                <h3 className="font-display text-lg font-bold flex items-center gap-2">
                  {t("uiBuyXpPage.exchangeYourCtgForCredits")}
                </h3>
                <p className="text-xs text-emerald-700 dark:text-emerald-300">
                  {t("uiBuyXpPage.noPaymentNeeded")}
                </p>
              </div>
            </div>

            <p className="text-sm text-muted-foreground mb-4">
              {t("uiBuyXpPage.youHave")}{" "}
              <span className="font-bold text-emerald-600 dark:text-emerald-400">
                {ctgData.ctgBalance.toLocaleString()} $CTG
              </span>{" "}
              {t("uiBuyXpPage.availableConvertContributionEarningsIntoPlatform")} {ctgData.rate} {t("uiBuyXpPage.credits2")}
              <span className="text-xs ml-1">
                {t("uiBuyXpPage.ctgFades1MonthExchangingSurplus")}
              </span>
            </p>

            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <CurrencyIcon currency="ctg" className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4" />
                <Input
                  type="number"
                  placeholder={t("uiBuyXpPage.amountToExchange")}
                  value={exchangeAmount}
                  onChange={(e) => setExchangeAmount(e.target.value)}
                  min={1}
                  max={ctgData.ctgBalance * 0.5}
                  className="pl-8 text-sm"
                />
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground shrink-0" />
              <div className="text-center min-w-[80px]">
                <p className="text-xl font-bold text-primary">
                  {previewCredits > 0 ? previewCredits.toLocaleString() : "—"}
                </p>
                <p className="text-xs text-muted-foreground">{t("uiBuyXpPage.credits")}</p>
              </div>
              <Button onClick={handleCtgExchange} disabled={exchangeLoading || !parseFloat(exchangeAmount)}>
                {exchangeLoading
                  ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> {t("uiBuyXpPage.exchanging")}</>
                  : <><RefreshCw className="h-4 w-4 mr-1" /> {t("uiBuyXpPage.exchange")}</>}
              </Button>
            </div>

            <p className="text-[10px] text-muted-foreground mt-3">
              {t("uiBuyXpPage.max50OfBalancePerTransaction")}
            </p>
          </motion.div>
        )}

        <div className="grid gap-4 md:grid-cols-3">
          {CREDIT_BUNDLES.map((bundle, i) => (
            <motion.div
              key={bundle.code}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="rounded-xl border border-border bg-card p-6 text-center relative overflow-hidden"
            >
              {bundle.code === "CREATOR_300" && (
                <Badge className="absolute top-3 right-3 bg-primary text-primary-foreground text-[10px]">{t("uiBuyXpPage.popular")}</Badge>
              )}
              <Package className="h-8 w-8 mx-auto mb-3 text-primary" />
              <h3 className="font-display text-lg font-bold">{bundle.label}</h3>
              <div className="my-3">
                <span className="text-3xl font-bold text-primary">{bundle.credits}</span>
                <span className="text-sm text-muted-foreground ml-1">{t("uiBuyXpPage.credits")}</span>
              </div>
              <p className="text-2xl font-bold mb-1">€{bundle.priceEur}</p>
              <p className="text-xs text-muted-foreground mb-4">
                €{(bundle.priceEur / bundle.credits).toFixed(3)} {t("uiBuyXpPage.perCredit")}
              </p>
              <Button
                onClick={() => handleBuy(bundle.code)}
                disabled={!!loading}
                className="w-full"
              >
                {loading === bundle.code ? (
                  <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> {t("uiBuyXpPage.processing")}</>
                ) : (
                  <><CurrencyIcon currency="credits" className="h-4 w-4 mr-1" /> {t("uiBuyXpPage.buy")} {bundle.credits} {t("uiBuyXpPage.credits")}</>
                )}
              </Button>
            </motion.div>
          ))}
        </div>

        {/* Credit Shop link */}
        <div className="mt-8 rounded-xl border border-border bg-muted/30 p-5 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <Info className="h-4 w-4 text-primary" /> {t("uiBuyXpPage.whatCanYouDoWithCredits")}
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              {t("uiBuyXpPage.boostsExtraCapacityAiSessionsCommission")}
            </p>
          </div>
          <Link to="/me/credit-shop">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs">
              {t("uiBuyXpPage.browseCreditShop")} <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>

        <div className="mt-6 text-center text-sm text-muted-foreground space-y-1">
          <p>{t("uiBuyXpPage.creditsAreNonRefundableStripePayments")}</p>
          <p className="text-xs">{ECONOMY_LABELS.creditsDisclaimer}</p>
          <p className="mt-2">
            {t("uiBuyXpPage.wantMoreFeatures")} <Link to="/plans" className="text-primary hover:underline">{t("uiBuyXpPage.seeSubscriptionPlans")}</Link>
          </p>
        </div>
      </div>
    </PageShell>
  );
}
