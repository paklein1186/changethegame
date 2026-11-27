import i18n from "@/i18n/config";
// ─── Demurrage (Credit Fade) Configuration ──────────────────
// Monthly demurrage rate applied to wallet balances

/** Monthly fade rate for BOTH Platform Credits and $CTG tokens (1% = 0.01) */
export const DEMURRAGE_RATE = 0.01;

/** Monthly fade rate as a percentage string */
export const DEMURRAGE_RATE_PERCENT = "1%";

/** Treasury system key in cooperative_settings */
export const TREASURY_SETTINGS_KEY = "treasury_balance";

/** Estimate next demurrage for a given balance */
export function estimateFade(balance: number): number {
  if (balance <= 0) return 0;
  return Math.max(1, Math.floor(balance * DEMURRAGE_RATE));
}

/** Simulate balance decay over N months */
export function simulateDecay(balance: number, months: number): number[] {
  const results: number[] = [balance];
  let current = balance;
  for (let i = 0; i < months; i++) {
    const fade = Math.max(1, Math.floor(current * DEMURRAGE_RATE));
    current = Math.max(0, current - fade);
    results.push(current);
  }
  return results;
}

// ─── Credit Transaction Types (extended) ────────────────────
export const DEMURRAGE_TX_TYPES = {
  DEMURRAGE_FADE: "DEMURRAGE_FADE",
  TREASURY_DEMURRAGE_RECEIVED: "TREASURY_DEMURRAGE_RECEIVED",
} as const;

// ─── Economy Layer Labels ───────────────────────────────────
export const ECONOMY_LAYERS = [
  {
    key: "fiat",
    get label() { return i18n.t("uiDemurrageConfig.fiatCurrency"); },
    purpose: "Real economic exchange",
    icon: "Banknote",
    convertible: true,
    get description() { return i18n.t("uiDemurrageConfig.yourRealWorldEarningsFromPaid"); },
  },
  {
    key: "coins",
    get label() { return i18n.t("uiDemurrageConfig.coinsFiatBackedMissionValue"); },
    purpose: "Quest funding, compensation, OCU distribution",
    icon: "Leaf",
    convertible: true,
    get description() { return i18n.t("uiDemurrageConfig.internalUnitsBacked11By"); },
  },
  {
    key: "ctg",
    get label() { return i18n.t("uiDemurrageConfig.ctgContributionToken"); },
    purpose: "Commons value, quest incentive",
    icon: "Sprout",
    convertible: false,
    get description() { return i18n.t("uiDemurrageConfig.emittedWhenYouProduceVerifiedWork"); },
  },
  {
    key: "credits",
    get label() { return i18n.t("uiDemurrageConfig.platformCredits"); },
    purpose: "Feature fuel & gamification only",
    icon: "Coins",
    convertible: false,
    get description() { return i18n.t("uiDemurrageConfig.nonMonetaryPlatformUtilityPowersQuotas"); },
  },
  {
    key: "xp",
    get label() { return i18n.t("uiDemurrageConfig.xpReputation"); },
    purpose: "Permanent contribution level",
    icon: "Star",
    convertible: false,
    get description() { return i18n.t("uiDemurrageConfig.reflectsYourCumulativeImpactAndParticipation"); },
  },
  {
    key: "shares",
    get label() { return i18n.t("uiDemurrageConfig.shares"); },
    purpose: "Stewardship participation",
    icon: "Compass",
    convertible: false,
    get description() { return i18n.t("uiDemurrageConfig.longTermCommitmentToThePlatform"); },
  },
] as const;

export type EconomyLayerKey = (typeof ECONOMY_LAYERS)[number]["key"];
