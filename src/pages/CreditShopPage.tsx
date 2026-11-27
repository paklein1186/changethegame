import i18n from "@/i18n/config";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import {
  ArrowLeft, Rocket, Star, Sparkles, ShieldCheck, Eye,
  Megaphone, GraduationCap, Store, Percent, Bot, Zap, ArrowRight,
} from "lucide-react";
import { CurrencyIcon } from "@/components/CurrencyIcon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/PageShell";
import { usePlanLimits } from "@/hooks/usePlanLimits";
import { CREDIT_COSTS } from "@/lib/xpCreditsConfig";

interface ShopItem {
  label: string;
  cost: number;
  description: string;
  icon: React.ReactNode;
  category: "capacity" | "visibility" | "utility";
  action?: string; // future: inline spend
}

const SHOP_ITEMS: ShopItem[] = [
  {
    get label() { return i18n.t("uiCreditShopPage.createAnExtraQuest"); },
    cost: CREDIT_COSTS.EXTRA_QUEST_CREATION,
    get description() { return i18n.t("uiCreditShopPage.exceedYourPlanSQuestLimit"); },
    icon: <Rocket className="h-5 w-5" />,
    category: "capacity",
  },
  {
    get label() { return i18n.t("uiCreditShopPage.openAnExtraPod"); },
    cost: CREDIT_COSTS.EXTRA_POD_CREATION,
    get description() { return i18n.t("uiCreditShopPage.spinUpAnAdditionalPodBeyond"); },
    icon: <Store className="h-5 w-5" />,
    category: "capacity",
  },
  {
    get label() { return i18n.t("uiCreditShopPage.boostQuestVisibility"); },
    cost: CREDIT_COSTS.BOOST_QUEST_VISIBILITY,
    get description() { return i18n.t("uiCreditShopPage.pushYourQuestHigherInExplore"); },
    icon: <Eye className="h-5 w-5" />,
    category: "visibility",
  },
  {
    get label() { return i18n.t("uiCreditShopPage.boostServiceVisibility"); },
    cost: CREDIT_COSTS.BOOST_SERVICE_VISIBILITY,
    get description() { return i18n.t("uiCreditShopPage.increaseYourServiceSRankingIn"); },
    icon: <Megaphone className="h-5 w-5" />,
    category: "visibility",
  },
  {
    get label() { return i18n.t("uiCreditShopPage.featureQuestFor7Days"); },
    cost: CREDIT_COSTS.FEATURE_QUEST_7D,
    get description() { return i18n.t("uiCreditShopPage.pinYourQuestToTheFeatured"); },
    icon: <Star className="h-5 w-5" />,
    category: "visibility",
  },
  {
    get label() { return i18n.t("uiCreditShopPage.boostGuildInExplore"); },
    cost: CREDIT_COSTS.BOOST_GUILD_EXPLORE,
    get description() { return i18n.t("uiCreditShopPage.highlightYourGuildForIncreasedDiscoverability"); },
    icon: <ShieldCheck className="h-5 w-5" />,
    category: "visibility",
  },
  {
    get label() { return i18n.t("uiCreditShopPage.boostCourseVisibility"); },
    cost: CREDIT_COSTS.BOOST_COURSE,
    get description() { return i18n.t("uiCreditShopPage.promoteYourCourseInTheLearning"); },
    icon: <GraduationCap className="h-5 w-5" />,
    category: "visibility",
  },
  {
    get label() { return i18n.t("uiCreditShopPage.aiProSession"); },
    cost: CREDIT_COSTS.ENABLE_AI_PRO_SESSION,
    get description() { return i18n.t("uiCreditShopPage.unlockAnAdvancedAiAssistantSession"); },
    icon: <Bot className="h-5 w-5" />,
    category: "utility",
  },
  {
    get label() { return i18n.t("uiCreditShopPage.reduceCommissionBy1"); },
    cost: CREDIT_COSTS.REDUCE_COMMISSION_BY_1_PERCENT,
    get description() { return i18n.t("uiCreditShopPage.permanentlyLowerThePlatformFeeOn"); },
    icon: <Percent className="h-5 w-5" />,
    category: "utility",
  },
];

const CATEGORIES = [
  { key: "capacity" as const, get label() { return i18n.t("uiCreditShopPage.extraCapacity"); }, get description() { return i18n.t("uiCreditShopPage.goBeyondYourPlanLimits"); } },
  { key: "visibility" as const, get label() { return i18n.t("uiCreditShopPage.visibilityBoosts"); }, get description() { return i18n.t("uiCreditShopPage.getNoticedInExploreSearch"); } },
  { key: "utility" as const, get label() { return i18n.t("uiCreditShopPage.utilityTools"); }, get description() { return i18n.t("uiCreditShopPage.unlockSpecialFeatures"); } },
];

export default function CreditShopPage() {
  const { t } = useTranslation();
  const { userCredits } = usePlanLimits();

  return (
    <PageShell>
      <div className="max-w-3xl mx-auto space-y-6 pb-16">
        {/* Back link */}
        <Link
          to="/me"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> {t("uiCreditShopPage.backToMe")}
        </Link>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-2"
        >
          <h1 className="font-display text-2xl font-bold flex items-center justify-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" /> {t("uiCreditShopPage.creditShop")}
          </h1>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">
            {t("uiCreditShopPage.spendYourCreditsOnBoostsExtra")}
          </p>

          {/* Balance */}
          <div className="flex items-center justify-center gap-3 pt-2">
            <Badge variant="outline" className="text-base px-4 py-1.5 gap-2 font-semibold">
              <CurrencyIcon currency="credits" className="h-4 w-4" />
              {userCredits.toLocaleString()} {t("uiCreditShopPage.credits")}
            </Badge>
            <Link to="/me/credits">
              <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                <Zap className="h-3.5 w-3.5" /> {t("uiCreditShopPage.topUp")}
              </Button>
            </Link>
          </div>
        </motion.div>

        {/* Categories */}
        {CATEGORIES.map((cat, catIdx) => {
          const items = SHOP_ITEMS.filter((i) => i.category === cat.key);
          return (
            <motion.div
              key={cat.key}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: catIdx * 0.08 }}
              className="space-y-3"
            >
              <div>
                <h2 className="font-display font-semibold text-lg">{cat.label}</h2>
                <p className="text-xs text-muted-foreground">{cat.description}</p>
              </div>

              <div className="grid gap-2">
                {items.map((item) => {
                  const canAfford = userCredits >= item.cost;
                  return (
                    <div
                      key={item.label}
                      className={`flex items-center gap-4 rounded-xl border px-4 py-3 transition-colors ${
                        canAfford
                          ? "border-border bg-card hover:bg-muted/40"
                          : "border-border/50 bg-card/50 opacity-60"
                      }`}
                    >
                      <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                        {item.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{item.label}</p>
                        <p className="text-xs text-muted-foreground line-clamp-1">
                          {item.description}
                        </p>
                      </div>
                      <Badge
                        variant={canAfford ? "default" : "secondary"}
                        className="text-xs font-mono shrink-0"
                      >
                        {item.cost} cr
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          );
        })}

        {/* How to earn */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="rounded-xl border border-border bg-muted/30 p-5 space-y-3"
        >
          <h3 className="font-display font-semibold text-sm flex items-center gap-2">
            <CurrencyIcon currency="credits" className="h-4 w-4" /> {t("uiCreditShopPage.howToGetCredits")}
          </h3>
          <div className="grid sm:grid-cols-3 gap-3 text-xs text-muted-foreground">
            <div className="flex items-start gap-2">
              <ArrowRight className="h-3.5 w-3.5 mt-0.5 text-primary shrink-0" />
              <span>
                <strong className="text-foreground">{t("uiCreditShopPage.buyWith")}</strong> {t("uiCreditShopPage.instantStripePurchaseFromThe")}{" "}
                <Link to="/me/credits" className="text-primary hover:underline">
                  {t("uiCreditShopPage.topUpPage")}
                </Link>
                .
              </span>
            </div>
            <div className="flex items-start gap-2">
              <ArrowRight className="h-3.5 w-3.5 mt-0.5 text-primary shrink-0" />
              <span>
                <strong className="text-foreground">{t("uiCreditShopPage.exchangeCtg")}</strong> {t("uiCreditShopPage.convertContributionTokensEarnedThroughQuests")}
              </span>
            </div>
            <div className="flex items-start gap-2">
              <ArrowRight className="h-3.5 w-3.5 mt-0.5 text-primary shrink-0" />
              <span>
                <strong className="text-foreground">{t("uiCreditShopPage.levelUp")}</strong> {t("uiCreditShopPage.earnBonusCreditsAtXpLevel")}
              </span>
            </div>
          </div>
        </motion.div>

        {/* Disclaimer */}
        <p className="text-[11px] text-muted-foreground text-center">
          {t("uiCreditShopPage.creditsAreNonRefundableSubjectTo")}
        </p>
      </div>
    </PageShell>
  );
}
