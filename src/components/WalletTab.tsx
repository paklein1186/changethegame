import { useTranslation } from "react-i18next";
import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Wallet, CreditCard, Package, Crown, Compass,
  ArrowRight, ExternalLink, Loader2, History, Info,
  ArrowUpRight, ArrowDownRight, Filter, Send, Recycle, Timer,
  Shield, Banknote, Download,
} from "lucide-react";
import { CurrencyIcon } from "@/components/CurrencyIcon";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePlanLimits } from "@/hooks/usePlanLimits";
import { useToast } from "@/hooks/use-toast";
import { CREDIT_BUNDLES, ECONOMY_LABELS } from "@/lib/xpCreditsConfig";
import { useCoinsRate } from "@/hooks/useCoinsRate";
import { DEMURRAGE_RATE_PERCENT, estimateFade } from "@/lib/demurrageConfig";
import { TransferCreditsDialog } from "@/components/TransferCreditsDialog";
import { GiveBackHistory } from "@/components/giveback/GiveBackHistory";
import { CTGWalletSection } from "@/components/CTGWalletSection";
import { BountyBoard } from "@/components/ctg/BountyBoard";
import { SectionBanner, HintTooltip, HINTS } from "@/components/onboarding/ContextualHint";
import { EconomyModal, useEconomyModal } from "@/components/onboarding/EconomyOnboarding";
import { usePersona } from "@/hooks/usePersona";

const TX_TYPE_LABELS: Record<string, string> = {
  INITIAL_GRANT: "Welcome bonus",
  EARNED_ACTION: "Earned (action)",
  PURCHASED: "Purchased",
  SPENT_FEATURE: "Spent (feature)",
  QUEST_BUDGET_SPENT: "Quest budget reserved",
  QUEST_REWARD_EARNED: "Quest reward earned",
  TOP_UP_PURCHASE: "Top-up purchase",
  SUBSCRIPTION_MONTHLY_CREDIT: "Monthly plan Platform Credits",
  ADJUSTMENT: "Admin adjustment",
  GIFT_RECEIVED: "Platform Credits received (transfer)",
  GIFT_SENT: "Platform Credits sent (transfer)",
  MONTHLY_INCLUDED: "Monthly included",
  DEMURRAGE_FADE: "Ecosystem redistribution",
  TREASURY_DEMURRAGE_RECEIVED: "Treasury received",
  QUEST_FUNDING_REFUND: "Quest funding refunded",
  GIVE_BACK: "Give-back contribution",
};

const COIN_TX_LABELS: Record<string, string> = {
  quest_earned: "Earned from quest",
  quest_funded: "Quest funded",
  redistribution: "Redistribution share",
  withdrawal: "Fiat withdrawal",
  fiat_deposit: "Fiat deposit → Coins",
};

export function WalletTab() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const userId = session?.user?.id;
  const limits = usePlanLimits();
  const { toast } = useToast();
  const [buyLoading, setBuyLoading] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [txFilter, setTxFilter] = useState("all");
  const [transferOpen, setTransferOpen] = useState(false);
  const [activeWallet, setActiveWallet] = useState<"platform" | "coins" | "ctg">("platform");
  const { persona } = usePersona();
  const { open: economyOpen, close: closeEconomy, mode: economyMode, openIfNeeded } = useEconomyModal();
  const { rate: COIN_EUR_RATE, toEur } = useCoinsRate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [topupLoading, setTopupLoading] = useState<number | null>(null);

  useEffect(() => {
    openIfNeeded();
  }, [openIfNeeded]);

  // Handle coins top-up success redirect
  useEffect(() => {
    if (searchParams.get("coins_success") === "true") {
      const amount = searchParams.get("coins_amount") || "0";
      toast({ title: t("uiWalletTab.coinsAdded"), description: `${amount} Coins have been added to your wallet.` });
      setActiveWallet("coins");
      // Clean URL params
      searchParams.delete("coins_success");
      searchParams.delete("coins_amount");
      searchParams.delete("session_id");
      setSearchParams(searchParams, { replace: true });
    }
  }, []);

  // Platform Credit transactions
  const { data: transactions = [], isLoading: txLoading } = useQuery({
    queryKey: ["credit-transactions", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from("credit_transactions")
        .select("*")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false })
        .limit(50);
      return data ?? [];
    },
  });

  // $CTG Token balance
  const { data: coinsBalance } = useQuery({
    queryKey: ["coins-balance", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("coins_balance, stripe_connect_onboarded")
        .eq("user_id", userId!)
        .single();
      return data as any;
    },
  });

  // Coins transactions
  const { data: coinsTx = [], isLoading: coinsTxLoading } = useQuery({
    queryKey: ["coins-transactions", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from("coin_transactions" as any)
        .select("*")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false })
        .limit(50);
      return (data ?? []) as any[];
    },
  });

  // Withdrawal requests
  const { data: withdrawals = [] } = useQuery({
    queryKey: ["coins-withdrawals", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from("coin_withdrawal_requests" as any)
        .select("*")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false })
        .limit(10);
      return (data ?? []) as any[];
    },
  });

  const { data: profileShares } = useQuery({
    queryKey: ["wallet-shares", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("total_shares_a, total_shares_b, governance_weight, is_cooperative_member, ctg_balance")
        .eq("user_id", userId!)
        .single();
      return data;
    },
  });
  const ctgBal = Number((profileShares as any)?.ctg_balance ?? 0);

  const filteredTx = transactions.filter((tx: any) => {
    if (txFilter === "all") return true;
    if (txFilter === "earned") return tx.amount > 0;
    if (txFilter === "spent") return tx.amount < 0;
    return true;
  });

  const filteredCoinsTx = coinsTx.filter((tx: any) => {
    if (txFilter === "all") return true;
    if (txFilter === "earned") return tx.amount > 0;
    if (txFilter === "spent") return tx.amount < 0;
    return true;
  });

  const handleBuyCredits = async (code: string) => {
    setBuyLoading(code);
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout", { body: { mode: "credit_bundle", bundleCode: code } });
      if (error) throw error;
      if (data?.url) window.open(data.url, "_blank");
    } catch (err: any) {
      toast({ title: t("uiWalletTab.error"), description: err.message, variant: "destructive" });
    } finally { setBuyLoading(null); }
  };

  const handleManageSubscription = async () => {
    setPortalLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("customer-portal");
      if (error) throw error;
      if (data?.url) window.open(data.url, "_blank");
    } catch (err: any) {
      toast({ title: t("uiWalletTab.error"), description: err.message, variant: "destructive" });
    } finally { setPortalLoading(false); }
  };

  const handleRequestWithdrawal = async () => {
    const balance = Number(coinsBalance?.coins_balance ?? 0);
    if (balance <= 0) {
      toast({ title: t("uiWalletTab.noCoins"), description: t("uiWalletTab.youHaveNoCoinsToWithdraw"), variant: "destructive" });
      return;
    }
    if (!coinsBalance?.stripe_connect_onboarded) {
      toast({ title: "Stripe Connect required", description: t("uiWalletTab.youNeedToSetUpYour"), variant: "destructive" });
      return;
    }
    try {
      const { error } = await supabase.from("coin_withdrawal_requests" as any).insert({
        user_id: userId,
        amount_tokens: balance,
        amount_fiat: balance * COIN_EUR_RATE,
        currency: "EUR",
      });
      if (error) throw error;
      toast({ title: "Withdrawal requested", description: `${balance} Coins → €${toEur(balance)} submitted for processing.` });
    } catch (err: any) {
      toast({ title: t("uiWalletTab.error"), description: err.message, variant: "destructive" });
    }
  };

  const handleStripeConnectOnboarding = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("stripe-connect-onboarding");
      if (error) throw error;
      if (data?.url) window.open(data.url, "_blank");
    } catch (err: any) {
      toast({ title: t("uiWalletTab.error"), description: err.message, variant: "destructive" });
    }
  };

  const totalShares = ((profileShares as any)?.total_shares_a ?? 0) + ((profileShares as any)?.total_shares_b ?? 0);
  const coinsBal = Number(coinsBalance?.coins_balance ?? 0);

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <EconomyModal open={economyOpen} onClose={closeEconomy} persona={persona} mode={economyMode} />
        <SectionBanner {...HINTS.banners.walletFirst} />
        {/* ═══ HEADER ═══ */}
        <div className="space-y-2">
          <h2 className="font-display text-xl font-bold flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" /> {t("uiWalletTab.yourValueDashboard")}
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {t("uiWalletTab.threeDistinctValueLayersPowerThe")}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-muted-foreground">
            <div className="flex items-start gap-2 rounded-lg bg-muted/30 p-2.5">
              <span className="text-base leading-none mt-0.5">🔷</span>
              <div><strong className="text-foreground">{t("uiWalletTab.platformCredits")}</strong> {t("uiWalletTab.utilityFuelForFeaturesBoostsQuotas")}</div>
            </div>
            <div className="flex items-start gap-2 rounded-lg bg-muted/30 p-2.5">
              <span className="text-base leading-none mt-0.5">🌱</span>
              <div><strong className="text-foreground">🌱 $CTG</strong> {t("uiWalletTab.contributionTokenEarnedByProducingVerified")}</div>
            </div>
            <div className="flex items-start gap-2 rounded-lg bg-muted/30 p-2.5">
              <span className="text-base leading-none mt-0.5">⭐</span>
              <div><strong className="text-foreground">XP</strong> {t("uiWalletTab.nonTransferableReputationScoreReflectingYour")}</div>
            </div>
          </div>
        </div>

        {/* ═══ VALUE TILES ═══ */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {/* Fiat */}
          <ValueTile icon={<Banknote className="h-5 w-5" />} label="Fiat Balance" emoji="💶"
            tooltip={t("uiWalletTab.yourFiatEarningsFromPaidServices")}>
            <Button variant="outline" size="sm" className="w-full mt-2 text-xs" onClick={handleManageSubscription} disabled={portalLoading}>
              {portalLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <ExternalLink className="h-3 w-3 mr-1" />}
              Stripe Portal
            </Button>
          </ValueTile>

          {/* Platform Credits (🔷) */}
          <ValueTile icon={<CurrencyIcon currency="credits" className="h-5 w-5" />} label={<span className="inline-flex items-center gap-1">{t("uiWalletTab.platformCredits")} <HintTooltip {...HINTS.tooltips.creditFade} /></span>} emoji="🔷"
            value={limits.userCredits}
            tooltip={t("uiWalletTab.nonMonetaryUtilityCreditsForPlatform")}>
            <p className="text-[10px] text-muted-foreground mt-1">Utility fuel</p>
          </ValueTile>

          {/* $CTG Token (🟡) */}
          <ValueTile icon={<CurrencyIcon currency="ctg" className="h-5 w-5" />} label={<span className="inline-flex items-center gap-1">$CTG Token <HintTooltip {...HINTS.tooltips.ctgToken} /></span>} emoji="🌱"
            value={ctgBal}
            tooltip={t("uiWalletTab.ctgWhatYouProduceForThe")}>
            <Button variant="ghost" size="sm" className="w-full mt-1 text-xs p-0 h-auto" onClick={() => setActiveWallet("ctg")}>
              {t("uiWalletTab.viewWallet")}
            </Button>
          </ValueTile>

          {/* XP */}
          <ValueTile icon={<CurrencyIcon currency="xp" className="h-5 w-5" />} label={t("uiWalletTab.xpLevel")} emoji="⭐"
            value={`Lv. ${limits.userLevel}`} subValue={`${limits.userXp} XP`}
            tooltip={ECONOMY_LABELS.xpNature}>
            <Button variant="ghost" size="sm" className="w-full mt-1 text-xs p-0 h-auto" asChild>
              <Link to="/credit-economy">{t("uiWalletTab.viewXpLadder")}</Link>
            </Button>
          </ValueTile>

          {/* Shares */}
          <ValueTile icon={<Compass className="h-5 w-5" />} label={<span className="inline-flex items-center gap-1">Shares <HintTooltip {...HINTS.tooltips.shares} /></span>} emoji="🧭"
            value={totalShares} tooltip={ECONOMY_LABELS.sharesNature}>
            {(profileShares as any)?.is_cooperative_member ? (
              <div className="flex gap-1 mt-1 flex-wrap">
                {((profileShares as any)?.total_shares_a ?? 0) > 0 && <Badge variant="default" className="text-[9px] px-1 py-0">Guardian</Badge>}
                {((profileShares as any)?.total_shares_b ?? 0) > 0 && <Badge variant="secondary" className="text-[9px] px-1 py-0">Steward</Badge>}
              </div>
            ) : (
              <Button variant="ghost" size="sm" className="w-full mt-1 text-xs p-0 h-auto" asChild>
                <Link to="/shares">{t("uiWalletTab.learnAboutShares")}</Link>
              </Button>
            )}
          </ValueTile>
        </div>

        {/* ═══ WALLET SWITCHER ═══ */}
        <div className="flex gap-2">
          <Button
            variant={activeWallet === "platform" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveWallet("platform")}
            className="gap-1.5"
          >
            {t("uiWalletTab.platformCredits2")}
          </Button>
          <Button
            variant={activeWallet === "ctg" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveWallet("ctg")}
            className="gap-1.5"
          >
            🌱 $CTG Token
          </Button>
          <Button
            variant={activeWallet === "coins" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveWallet("coins")}
            className="gap-1.5"
          >
            {t("uiWalletTab.fiatCoins")}
          </Button>
        </div>

        {/* ═══ $CTG WALLET ═══ */}
        {activeWallet === "ctg" && (
          <>
            <CTGWalletSection />
            <div className="mt-6">
              <BountyBoard />
            </div>
          </>
        )}

        {/* ═══ COINS WALLET ═══ */}
        {activeWallet === "coins" && (
          <>
            <Section title={t("uiWalletTab.coinsMissionPayouts")} icon={<Banknote className="h-5 w-5" />}>
              <div className="space-y-4">
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-xs text-muted-foreground">{t("uiWalletTab.coinsBalance")}</p>
                      <p className="text-2xl font-bold">{coinsBal} 🟩</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Fiat value (est.)</p>
                      <p className="text-lg font-semibold">€{toEur(coinsBal)}</p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t("uiWalletTab.coinsRepresentFiatBackedValueEarned")} {COIN_EUR_RATE} {t("uiWalletTab.eurPerCoinSetByThe")}
                  </p>
                </div>

                {/* ── Add Coins ── */}
                <div className="space-y-2">
                  <h4 className="text-xs font-medium text-muted-foreground">{t("uiWalletTab.addCoinsToWallet")}</h4>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { coins: 250, label: "Small" },
                      { coins: 1000, label: "Standard" },
                      { coins: 2500, label: "Builder" },
                    ].map((opt) => (
                      <button
                        key={opt.coins}
                        onClick={async () => {
                          setTopupLoading(opt.coins);
                          try {
                            const { data, error } = await supabase.functions.invoke("create-checkout", {
                              body: { mode: "coins_topup", coinsAmount: opt.coins },
                            });
                            if (error) throw error;
                            if (data?.url) window.open(data.url, "_blank");
                          } catch (err: any) {
                            toast({ title: t("uiWalletTab.error"), description: err.message, variant: "destructive" });
                          } finally {
                            setTopupLoading(null);
                          }
                        }}
                        disabled={!!topupLoading}
                        className="rounded-lg border border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-950/30 p-3 text-center hover:bg-teal-100 dark:hover:bg-teal-950/50 transition-colors disabled:opacity-50"
                      >
                        <p className="text-sm font-bold text-teal-700 dark:text-teal-300">
                          🟩 {opt.coins.toLocaleString()}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          ≈ €{(opt.coins * COIN_EUR_RATE).toFixed(0)}
                        </p>
                        <p className="text-[10px] font-medium text-teal-600 dark:text-teal-400">{opt.label}</p>
                        {topupLoading === opt.coins && <Loader2 className="h-3 w-3 animate-spin mx-auto mt-1" />}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    {t("uiWalletTab.coinsAreFiatBackedUsedFor")}
                  </p>
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleRequestWithdrawal} disabled={coinsBal <= 0}>
                    <Download className="h-4 w-4 mr-1" /> {t("uiWalletTab.withdrawToBank")}
                  </Button>
                  {!coinsBalance?.stripe_connect_onboarded && (
                    <Button variant="outline" size="sm" onClick={handleStripeConnectOnboarding}>
                      <CreditCard className="h-4 w-4 mr-1" /> Set up Stripe Connect
                    </Button>
                  )}
                </div>

                {/* Pending withdrawals */}
                {withdrawals.length > 0 && (
                  <div className="space-y-1">
                    <h4 className="text-xs font-medium text-muted-foreground">Recent withdrawals</h4>
                    {withdrawals.map((w: any) => (
                      <div key={w.id} className="flex items-center justify-between py-1.5 px-2 rounded bg-muted/30 text-xs">
                        <span>{w.amount_tokens} {t("uiWalletTab.coins")}{w.amount_fiat}</span>
                        <Badge variant={w.status === "completed" ? "default" : "secondary"} className="text-[10px]">{w.status}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Section>

            <Separator />

            <Section title={t("uiWalletTab.coinsTransactionHistory")} icon={<History className="h-5 w-5" />}>
              <TxFilterBar value={txFilter} onChange={setTxFilter} />
              <TxList loading={coinsTxLoading} items={filteredCoinsTx} labels={COIN_TX_LABELS} />
            </Section>
          </>
        )}

        {/* ═══ PLATFORM CREDITS WALLET ═══ */}
        {activeWallet === "platform" && (
          <>
            <Section title={t("uiWalletTab.platformCreditsFeatureFuel")} icon={<CurrencyIcon currency="credits" className="h-5 w-5" />}>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
                    <p className="text-xs font-semibold text-foreground mb-2">{t("uiWalletTab.platformCreditsAreEarnedBy")}</p>
                    <ul className="text-xs space-y-1 list-disc list-inside text-muted-foreground">
                      <li>Monthly plan allocation</li>
                      <li>Top-up purchases</li>
                      <li>Gamified actions & streaks</li>
                      <li>Onboarding organizations</li>
                    </ul>
                  </div>
                  <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
                    <p className="text-xs font-semibold text-foreground mb-2">{t("uiWalletTab.platformCreditsAreSpentOn")}</p>
                    <ul className="text-xs space-y-1 list-disc list-inside text-muted-foreground">
                      <li>{t("uiWalletTab.boostingQuestVisibility")}</li>
                      <li>{t("uiWalletTab.creatingQuestsBeyondQuota")}</li>
                      <li>Advanced AI insights</li>
                      <li>{t("uiWalletTab.highlightingProfile")}</li>
                      <li>{t("uiWalletTab.governanceProposals")}</li>
                    </ul>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setTransferOpen(true)}>
                    <Send className="h-4 w-4 mr-1" /> Transfer
                  </Button>
                </div>

                {/* Demurrage */}
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Recycle className="h-5 w-5 text-amber-500" />
                    <h4 className="font-display text-sm font-semibold">{t("uiWalletTab.creditsCirculation")}</h4>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg bg-card border border-border p-3 text-center">
                      <p className="text-xs text-muted-foreground mb-1">{t("uiWalletTab.nextMonthlyFade")}</p>
                      <p className="text-lg font-bold text-amber-600">−{estimateFade(limits.userCredits)}</p>
                      <p className="text-[10px] text-muted-foreground">{DEMURRAGE_RATE_PERCENT} of {limits.userCredits}</p>
                    </div>
                    <div className="rounded-lg bg-card border border-border p-3 text-center">
                      <p className="text-xs text-muted-foreground mb-1">Projected balance</p>
                      <p className="text-lg font-bold text-primary">{Math.max(0, limits.userCredits - estimateFade(limits.userCredits))}</p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Timer className="h-3 w-3" /> {t("uiWalletTab.creditsFadeBy")} {DEMURRAGE_RATE_PERCENT}/month to encourage circulation.
                  </p>
                </div>

                <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3">
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Info className="h-3 w-3" /> {t("uiWalletTab.platformCreditsAre")} <strong>{t("uiWalletTab.notMoney")}</strong>{t("uiWalletTab.theyCannotBeExchangedWithdrawnOr")}
                  </p>
                </div>
              </div>
            </Section>

            <TransferCreditsDialog open={transferOpen} onOpenChange={setTransferOpen} currentBalance={limits.userCredits} />

            <Separator />

            {/* Plan & Top-Up */}
            <Section title={t("uiWalletTab.planCreditsTopUp")} icon={<Package className="h-5 w-5" />}>
              <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-4 mb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Crown className="h-4 w-4 text-primary" />
                      <h4 className="font-display text-lg font-bold">{limits.plan.planName}</h4>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{limits.plan.monthlyIncludedCredits} {t("uiWalletTab.platformCreditsMonthIncluded")}</p>
                  </div>
                  <Badge className="bg-primary text-primary-foreground">{t("uiWalletTab.active")}</Badge>
                </div>
                <div className="flex gap-2 mt-3">
                  <Button variant="outline" size="sm" asChild>
                    <Link to="/plans">Change plan <ArrowRight className="h-3.5 w-3.5 ml-1" /></Link>
                  </Button>
                  {limits.plan.planCode !== "FREE" && (
                    <Button variant="outline" size="sm" onClick={handleManageSubscription} disabled={portalLoading}>
                      {portalLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <ExternalLink className="h-4 w-4 mr-1" />}
                      Manage subscription
                    </Button>
                  )}
                </div>
              </div>

              <h4 className="text-sm font-medium mb-3">{t("uiWalletTab.topUpPlatformCredits")}</h4>

              {/* CTG → Credits exchange nudge */}
              {ctgBal > 0 ? (
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 mb-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <CurrencyIcon currency="ctg" className="h-5 w-5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium">
                        {t("uiWalletTab.exchangeCtgCredits")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t("uiWalletTab.youHave")} {ctgBal.toLocaleString()} {t("uiWalletTab.ctgNoPaymentNeeded")}
                      </p>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setActiveWallet("ctg")} className="gap-1.5 shrink-0">
                    <Recycle className="h-3.5 w-3.5" /> Exchange
                  </Button>
                </div>
              ) : (
                <div className="rounded-lg border border-border bg-muted/30 p-3 mb-4 flex items-start gap-2.5 text-xs text-muted-foreground">
                  <CurrencyIcon currency="ctg" className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>
                    {t("uiWalletTab.earnCtgByCompletingQuestsAnd")}{" "}
                    <Link to="/explore" className="text-primary hover:underline">
                      {t("uiWalletTab.findQuests")}
                    </Link>
                  </span>
                </div>
              )}

              <div className="grid gap-3 md:grid-cols-3">
                {CREDIT_BUNDLES.map((b) => (
                  <div key={b.code} className="rounded-lg border border-border bg-card p-4 text-center">
                    <Package className="h-6 w-6 mx-auto mb-2 text-primary" />
                    <p className="font-bold">{b.credits} {t("uiWalletTab.credits")}</p>
                    <p className="text-lg font-bold">€{b.priceEur}</p>
                    <p className="text-xs text-muted-foreground mb-2">€{(b.priceEur / b.credits).toFixed(3)}/credit</p>
                    <Button size="sm" className="w-full" onClick={() => handleBuyCredits(b.code)} disabled={!!buyLoading}>
                      {buyLoading === b.code ? <Loader2 className="h-4 w-4 animate-spin" /> : <CurrencyIcon currency="credits" className="h-4 w-4 mr-1" />}
                      {buyLoading === b.code ? "Processing…" : "Buy"}
                    </Button>
                  </div>
                ))}
              </div>
            </Section>

            <Separator />

            {/* Platform Credit Transaction History */}
            <Section title={t("uiWalletTab.platformCreditHistory")} icon={<History className="h-5 w-5" />}>
              <TxFilterBar value={txFilter} onChange={setTxFilter} />
              <TxList loading={txLoading} items={filteredTx} labels={TX_TYPE_LABELS} />
            </Section>

            <GiveBackHistory />
          </>
        )}


        <Separator />

        {/* ═══ COMMISSION BENEFITS ═══ */}
        <Section title="Commission Benefits" icon={<CreditCard className="h-5 w-5" />}>
          <div className="rounded-lg bg-muted/30 border border-border p-4 space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Base platform commission</span>
              <span className="font-medium">10%</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t("uiWalletTab.yourPlanDiscount")}{limits.plan.planName})</span>
              <span className="font-bold text-primary">{limits.plan.commissionDiscountPercent}%</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Minimum final rate</span>
              <span className="font-medium">1%</span>
            </div>
          </div>
        </Section>
      </div>
    </TooltipProvider>
  );
}

/* ── Shared helpers ── */

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="font-display text-lg font-semibold flex items-center gap-2 mb-3">
        {icon} {title}
      </h3>
      {children}
    </div>
  );
}

function ValueTile({
  icon, label, emoji, value, subValue, tooltip, children,
}: {
  icon: React.ReactNode;
  label: React.ReactNode;
  emoji: string;
  value?: string | number;
  subValue?: string;
  tooltip: string;
  children?: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="rounded-xl border border-border bg-card p-4 flex flex-col items-center text-center hover:border-primary/30 transition-colors cursor-default">
          <span className="text-2xl mb-1">{emoji}</span>
          <div className="text-primary mb-1">{icon}</div>
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          {value !== undefined && (
            <p className="text-xl font-bold mt-1">{value}</p>
          )}
          {subValue && <p className="text-[10px] text-muted-foreground">{subValue}</p>}
          {children}
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-[200px] text-xs">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

function TxFilterBar({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2 mb-3">
      <Filter className="h-4 w-4 text-muted-foreground" />
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("uiWalletTab.all")}</SelectItem>
          <SelectItem value="earned">Earned</SelectItem>
          <SelectItem value="spent">Spent</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

function TxList({ loading, items, labels }: { loading: boolean; items: any[]; labels: Record<string, string> }) {
  const { t } = useTranslation();
  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground py-4 text-center">{t("uiWalletTab.noTransactionsYet")}</p>;
  }
  return (
    <div className="space-y-1">
      {items.map((tx: any) => (
        <div key={tx.id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/50 transition-colors">
          <div className="flex items-center gap-3">
            {tx.amount > 0 ? (
              <ArrowDownRight className="h-4 w-4 text-primary shrink-0" />
            ) : (
              <ArrowUpRight className="h-4 w-4 text-destructive shrink-0" />
            )}
            <div>
              <p className="text-sm font-medium">{labels[tx.type] || tx.type}</p>
              {tx.source && <p className="text-xs text-muted-foreground">{tx.source}</p>}
            </div>
          </div>
          <div className="text-right">
            <p className={`text-sm font-bold ${tx.amount > 0 ? "text-primary" : "text-destructive"}`}>
              {tx.amount > 0 ? "+" : ""}{tx.amount}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {new Date(tx.created_at).toLocaleDateString()}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
