import i18n from "@/i18n/config";
import { LEVEL_LABELS, XP_LEVEL_THRESHOLDS } from "@/lib/xpCreditsConfig";
import type { LucideIcon } from "lucide-react";

// ─── Cross-Territory Multiplier Config ─────────────────────
export const TERRITORY_MULTIPLIERS = {
  SAME_GUILD: 1.0,
  DIFFERENT_GUILD_SAME_TERRITORY: 1.1,
  DIFFERENT_TERRITORY_SAME_REGION: 1.2,
  DIFFERENT_REGION_SAME_COUNTRY: 1.3,
  DIFFERENT_COUNTRY: 1.5,
  MULTI_COUNTRY_3_PLUS: 1.8,
} as const;

/** Bonus multiplier when user collaborates in a territory with no prior activity */
export const TERRITORY_ACTIVATION_BONUS = 0.2; // +20%

// ─── Translocal Badges ─────────────────────────────────────
export const TRANSLOCAL_BADGES = [
  { key: "translocal", get label() { return i18n.t("uiGovernanceConfig.translocal"); }, minCountries: 3, minLevel: 11 },
  { key: "bioregional_architect", get label() { return i18n.t("uiGovernanceConfig.bioregionalArchitect"); }, minCountries: 5, minLevel: 11 },
] as const;

export function getTranslocalBadge(level: number, countriesCount: number) {
  // Return highest qualifying badge
  for (let i = TRANSLOCAL_BADGES.length - 1; i >= 0; i--) {
    const b = TRANSLOCAL_BADGES[i];
    if (level >= b.minLevel && countriesCount >= b.minCountries) return b;
  }
  return null;
}

// ─── Governance Permissions by Level ────────────────────────
export interface GovernanceRight {
  label: string;
  description: string;
  minLevel: number;
  sphere: "personal" | "guild" | "territory" | "platform";
}

export const GOVERNANCE_RIGHTS: GovernanceRight[] = [
  { get label() { return i18n.t("uiGovernanceConfig.createProfile"); }, get description() { return i18n.t("uiGovernanceConfig.setUpYourIdentityInThe"); }, minLevel: 1, sphere: "personal" },
  { get label() { return i18n.t("uiGovernanceConfig.joinGuilds"); }, get description() { return i18n.t("uiGovernanceConfig.participateInCollaborativeGroups"); }, minLevel: 1, sphere: "guild" },
  { get label() { return i18n.t("uiGovernanceConfig.commentUpvote"); }, get description() { return i18n.t("uiGovernanceConfig.engageInDiscussions"); }, minLevel: 1, sphere: "personal" },
  { get label() { return i18n.t("uiGovernanceConfig.completeQuests"); }, get description() { return i18n.t("uiGovernanceConfig.takeOnCollaborativeMissions"); }, minLevel: 1, sphere: "personal" },
  { get label() { return i18n.t("uiGovernanceConfig.createPods"); }, get description() { return i18n.t("uiGovernanceConfig.organizeSmallCollaborativeGroups"); }, minLevel: 1, sphere: "guild" },
  { get label() { return i18n.t("uiGovernanceConfig.proposePublicQuests"); }, get description() { return i18n.t("uiGovernanceConfig.submitQuestsForCommunityReview"); }, minLevel: 1, sphere: "guild" },
  { get label() { return i18n.t("uiGovernanceConfig.createLocalEvents"); }, get description() { return i18n.t("uiGovernanceConfig.organizeCommunityGatherings"); }, minLevel: 1, sphere: "guild" },
  { get label() { return i18n.t("uiGovernanceConfig.participateInGuildVotes"); }, get description() { return i18n.t("uiGovernanceConfig.voteOnGuildLevelDecisions"); }, minLevel: 1, sphere: "guild" },
  { get label() { return i18n.t("uiGovernanceConfig.moderateOwnPods"); }, get description() { return i18n.t("uiGovernanceConfig.manageYourPodSpaces"); }, minLevel: 1, sphere: "guild" },
  { get label() { return i18n.t("uiGovernanceConfig.flagContent"); }, get description() { return i18n.t("uiGovernanceConfig.reportInappropriateContent"); }, minLevel: 1, sphere: "guild" },
  { get label() { return i18n.t("uiGovernanceConfig.endorseCollaborators"); }, get description() { return i18n.t("uiGovernanceConfig.vouchForTrustedContributors"); }, minLevel: 1, sphere: "guild" },
  { get label() { return i18n.t("uiGovernanceConfig.launchPublicQuests"); }, get description() { return i18n.t("uiGovernanceConfig.createQuestsWithoutPreApproval"); }, minLevel: 1, sphere: "guild" },
  { get label() { return i18n.t("uiGovernanceConfig.hostCrossGuildProjects"); }, get description() { return i18n.t("uiGovernanceConfig.bridgeMultipleGuilds"); }, minLevel: 1, sphere: "guild" },
  { get label() { return i18n.t("uiGovernanceConfig.createTerritoryProposals"); }, get description() { return i18n.t("uiGovernanceConfig.proposeChangesToTerritories"); }, minLevel: 1, sphere: "territory" },
  { get label() { return i18n.t("uiGovernanceConfig.offerPaidServices"); }, get description() { return i18n.t("uiGovernanceConfig.monetizeYourExpertise"); }, minLevel: 1, sphere: "personal" },
  { get label() { return i18n.t("uiGovernanceConfig.nominatePodModerators"); }, get description() { return i18n.t("uiGovernanceConfig.suggestModeratorsForPods"); }, minLevel: 1, sphere: "guild" },
  { get label() { return i18n.t("uiGovernanceConfig.proposeGuildPartnerships"); }, get description() { return i18n.t("uiGovernanceConfig.initiateInterGuildCollaborations"); }, minLevel: 1, sphere: "guild" },
  { get label() { return i18n.t("uiGovernanceConfig.createNewGuilds"); }, get description() { return i18n.t("uiGovernanceConfig.establishCollaborativeGroupsWithReview"); }, minLevel: 1, sphere: "guild" },
  { get label() { return i18n.t("uiGovernanceConfig.createTerritoryPages"); }, get description() { return i18n.t("uiGovernanceConfig.setUpTerritoryPresence"); }, minLevel: 1, sphere: "territory" },
  { get label() { return i18n.t("uiGovernanceConfig.initiateFundingPools"); }, get description() { return i18n.t("uiGovernanceConfig.startCollectiveResourcePools"); }, minLevel: 1, sphere: "guild" },
  { get label() { return i18n.t("uiGovernanceConfig.moderateGuilds"); }, get description() { return i18n.t("uiGovernanceConfig.stewardGuildCommunities"); }, minLevel: 1, sphere: "guild" },
  { get label() { return i18n.t("uiGovernanceConfig.voteInTerritoryGovernance"); }, get description() { return i18n.t("uiGovernanceConfig.participateInTerritoryDecisions"); }, minLevel: 1, sphere: "territory" },
  { get label() { return i18n.t("uiGovernanceConfig.validateCrossTerritoryProjects"); }, get description() { return i18n.t("uiGovernanceConfig.approveMultiTerritoryInitiatives"); }, minLevel: 1, sphere: "territory" },
  { get label() { return i18n.t("uiGovernanceConfig.accessGovernanceVoting"); }, get description() { return i18n.t("uiGovernanceConfig.participateInPlatformReferendums"); }, minLevel: 1, sphere: "platform" },
  { get label() { return i18n.t("uiGovernanceConfig.initiateTerritoryCouncils"); }, get description() { return i18n.t("uiGovernanceConfig.setUpTerritorialGovernanceBodies"); }, minLevel: 1, sphere: "territory" },
  { get label() { return i18n.t("uiGovernanceConfig.launchGovernanceProposals"); }, get description() { return i18n.t("uiGovernanceConfig.proposeRuleAmendments"); }, minLevel: 1, sphere: "platform" },
  { get label() { return i18n.t("uiGovernanceConfig.coModerateTerritories"); }, get description() { return i18n.t("uiGovernanceConfig.stewardTerritorialCommunities"); }, minLevel: 1, sphere: "territory" },
  { get label() { return i18n.t("uiGovernanceConfig.approveGuildCreation"); }, get description() { return i18n.t("uiGovernanceConfig.reviewAndApproveNewGuilds"); }, minLevel: 1, sphere: "platform" },
  { get label() { return i18n.t("uiGovernanceConfig.suspendMaliciousActivity"); }, get description() { return i18n.t("uiGovernanceConfig.temporarySafetyInterventions"); }, minLevel: 1, sphere: "platform" },
  { get label() { return i18n.t("uiGovernanceConfig.nominateModerators"); }, get description() { return i18n.t("uiGovernanceConfig.recommendCommunityStewards"); }, minLevel: 1, sphere: "platform" },
  { get label() { return i18n.t("uiGovernanceConfig.platformWideGovernanceVote"); }, get description() { return i18n.t("uiGovernanceConfig.voteOnPlatformLevelDecisions"); }, minLevel: 1, sphere: "platform" },
  { get label() { return i18n.t("uiGovernanceConfig.initiateConstitutionalReview"); }, get description() { return i18n.t("uiGovernanceConfig.triggerGovernanceReformProcesses"); }, minLevel: 1, sphere: "platform" },
  { get label() { return i18n.t("uiGovernanceConfig.strategicCouncilEligibility"); }, get description() { return i18n.t("uiGovernanceConfig.joinTheHighestStewardshipBody"); }, minLevel: 1, sphere: "platform" },
  { get label() { return i18n.t("uiGovernanceConfig.finalArbitrationRole"); }, get description() { return i18n.t("uiGovernanceConfig.collectiveDisputeResolutionMultiSignature"); }, minLevel: 1, sphere: "platform" },
  { get label() { return i18n.t("uiGovernanceConfig.emergencyModerationOverride"); }, get description() { return i18n.t("uiGovernanceConfig.requiresQuorumOf3Stewards"); }, minLevel: 1, sphere: "platform" },
];

/** Get all governance rights unlocked at a specific level */
export function getGovernanceRightsForLevel(level: number) {
  return GOVERNANCE_RIGHTS.filter((r) => r.minLevel <= level);
}

/** Get newly unlocked rights at this exact level */
export function getNewRightsAtLevel(level: number) {
  return GOVERNANCE_RIGHTS.filter((r) => r.minLevel === level);
}

// ─── Governance Voting Thresholds ──────────────────────────
export const VOTING_THRESHOLDS = {
  pod: 1,
  guild: 1,
  territory: 1,
  platform: 1,
} as const;

// ─── Governance Bodies ─────────────────────────────────────
export const GOVERNANCE_BODIES = [
  { name: "Pod Council", minLevel: 1, get description() { return i18n.t("uiGovernanceConfig.localCollaborativeGovernance"); } },
  { name: "Guild Council", minLevel: 1, get description() { return i18n.t("uiGovernanceConfig.guildLevelDecisionMaking"); } },
  { name: "Territory Council", minLevel: 1, get description() { return i18n.t("uiGovernanceConfig.territorialGovernanceAndCoordination"); } },
  { name: "Translocal Assembly", minLevel: 1, get description() { return i18n.t("uiGovernanceConfig.crossTerritoryStrategicCoordination"); }, extraReq: "3+ territories" },
  { name: "Strategic Steward Council", minLevel: 1, get description() { return i18n.t("uiGovernanceConfig.highestStewardshipBodyCappedMembership"); } },
] as const;

// ─── Level-gated feature check ─────────────────────────────
/**
 * Enforce XP-gated governance tiers:
 * L1–4: Participate, L5–8: Comment & Vote, L9–12: Propose, L13–15: Steward
 */
export function canAccessFeature(level: number, requiredLevel: number): boolean {
  return level >= requiredLevel;
}

// ─── Governance Tier Helpers ───────────────────────────────
export function getGovernanceTier(level: number): string {
  if (level >= 1) return "steward";
  return "participate";
}

export function canVote(level: number): boolean {
  return level >= 1;
}

export function canPropose(level: number): boolean {
  return level >= 1;
}

export function isStewardEligible(level: number): boolean {
  return level >= 1;
}

// ─── XP Action Rewards (updated with cross-territory) ─────
export const XP_ACTION_REWARDS = {
  POST: 5,
  POST_UPVOTE_QUALITY: 2,
  COMPLETE_QUEST: 20,
  CO_CREATE_QUEST: 35,
  HOST_EVENT: 40,
  JOIN_GUILD: 10,
  CROSS_TERRITORY_PROJECT: 50,
  PUBLISH_RESOURCE: 30,
  MENTORSHIP_VALIDATED: 25,
} as const;
