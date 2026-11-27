import i18n from "@/i18n/config";
// ─── Ritual Session Type Configuration ────────────────────────
// Cultural grammar for Guild collective synchronization.

export const RITUAL_SESSION_TYPES = {
  INFORMAL_HANGING: {
    label: "Commons Café",
    get subtitle() { return i18n.t("uiRitualConfig.informalHanging"); },
    icon: "Coffee",
    get description() { return i18n.t("uiRitualConfig.buildTrustReduceFrictionStrengthenWeak"); },
    bestFor: "Early-stage guilds, post-conflict cooling, onboarding waves.",
    defaultDuration: 75,
    defaultXp: 3,
    facilitatorBonus: 0,
    governanceImpact: "low",
    defaultProgram: [
      { get title() { return i18n.t("uiRitualConfig.openArrival"); }, minutes: 10, role: null as null },
      { get title() { return i18n.t("uiRitualConfig.2MinPersonalCheckIn"); }, minutes: 15, role: null as null },
      { get title() { return i18n.t("uiRitualConfig.freeConversation"); }, minutes: 30, role: null as null },
      { get title() { return i18n.t("uiRitualConfig.emergentTopicClusters"); }, minutes: 15, role: null as null },
      { get title() { return i18n.t("uiRitualConfig.lightClosingRound"); }, minutes: 5, role: null as null },
    ],
  },
  EMOTIONAL_CHECKIN: {
    get label() { return i18n.t("uiRitualConfig.pulseCircle"); },
    get subtitle() { return i18n.t("uiRitualConfig.emotionalCheckIn"); },
    icon: "Heart",
    get description() { return i18n.t("uiRitualConfig.surfaceTensionsBeforeTheyBecomeStructural"); },
    bestFor: "High-growth phases, conflict periods, collective transitions.",
    defaultDuration: 60,
    defaultXp: 5,
    facilitatorBonus: 5,
    governanceImpact: "indirect",
    defaultProgram: [
      { get title() { return i18n.t("uiRitualConfig.silenceArrival"); }, minutes: 2, role: null as null },
      { get title() { return i18n.t("uiRitualConfig.1WordEmotionalState"); }, minutes: 5, role: null as null },
      { get title() { return i18n.t("uiRitualConfig.structuredRound3MinPerson"); }, minutes: 40, role: "facilitator" },
      { get title() { return i18n.t("uiRitualConfig.reflectionSynthesis"); }, minutes: 8, role: "facilitator" },
      { get title() { return i18n.t("uiRitualConfig.closingBreath"); }, minutes: 5, role: null as null },
    ],
  },
  GUILD_ASSEMBLY: {
    get label() { return i18n.t("uiRitualConfig.openCouncil"); },
    get subtitle() { return i18n.t("uiRitualConfig.guildAssembly"); },
    icon: "Landmark",
    get description() { return i18n.t("uiRitualConfig.collectiveGovernanceAndDecisionMaking"); },
    bestFor: "Monthly or quarterly governance cycles.",
    defaultDuration: 105,
    defaultXp: 10,
    facilitatorBonus: 10,
    governanceImpact: "high",
    defaultProgram: [
      { get title() { return i18n.t("uiRitualConfig.metricsReview"); }, minutes: 15, role: "admin" },
      { get title() { return i18n.t("uiRitualConfig.questUpdates"); }, minutes: 20, role: null as null },
      { get title() { return i18n.t("uiRitualConfig.proposalPresentations"); }, minutes: 25, role: null as null },
      { get title() { return i18n.t("uiRitualConfig.decisionBlock"); }, minutes: 25, role: "admin" },
      { get title() { return i18n.t("uiRitualConfig.assignmentOfResponsibilities"); }, minutes: 15, role: "admin" },
      { get title() { return i18n.t("uiRitualConfig.closingAlignment"); }, minutes: 5, role: null as null },
    ],
  },
  MASTERMIND: {
    get label() { return i18n.t("uiRitualConfig.strategicDeepDive"); },
    get subtitle() { return i18n.t("uiRitualConfig.mastermindSession"); },
    icon: "Brain",
    get description() { return i18n.t("uiRitualConfig.supportAMemberOrProjectThrough"); },
    bestFor: "Entrepreneurs, territory leads, complex dilemmas.",
    defaultDuration: 90,
    defaultXp: 8,
    facilitatorBonus: 8,
    governanceImpact: "medium",
    defaultProgram: [
      { get title() { return i18n.t("uiRitualConfig.presenterFraming"); }, minutes: 10, role: "presenter" },
      { get title() { return i18n.t("uiRitualConfig.clarifyingQuestions"); }, minutes: 15, role: null as null },
      { get title() { return i18n.t("uiRitualConfig.silentReflection"); }, minutes: 5, role: null as null },
      { get title() { return i18n.t("uiRitualConfig.feedbackRound"); }, minutes: 30, role: null as null },
      { get title() { return i18n.t("uiRitualConfig.integrationPlan"); }, minutes: 15, role: "presenter" },
      { get title() { return i18n.t("uiRitualConfig.closingReflection"); }, minutes: 5, role: null as null },
    ],
  },
  LEARNING_LAB: {
    get label() { return i18n.t("uiRitualConfig.skillTransmission"); },
    get subtitle() { return i18n.t("uiRitualConfig.learningLab"); },
    icon: "GraduationCap",
    get description() { return i18n.t("uiRitualConfig.collectiveUpskilling"); },
    bestFor: "Topic-based guilds, technical cohorts, governance training.",
    defaultDuration: 75,
    defaultXp: 7,
    facilitatorBonus: 12,
    governanceImpact: "low",
    defaultProgram: [
      { get title() { return i18n.t("uiRitualConfig.inputPresentation"); }, minutes: 30, role: "teacher" },
      { get title() { return i18n.t("uiRitualConfig.applicationBreakout"); }, minutes: 20, role: null as null },
      { get title() { return i18n.t("uiRitualConfig.collectiveReflection"); }, minutes: 15, role: null as null },
      { get title() { return i18n.t("uiRitualConfig.nextStepCommitments"); }, minutes: 10, role: null as null },
    ],
  },
  SPRINT_ALIGNMENT: {
    get label() { return i18n.t("uiRitualConfig.missionSync"); },
    get subtitle() { return i18n.t("uiRitualConfig.sprintAlignment"); },
    icon: "Zap",
    get description() { return i18n.t("uiRitualConfig.shortTermOperationalAlignment"); },
    bestFor: "Active projects, campaign phases.",
    defaultDuration: 50,
    defaultXp: 4,
    facilitatorBonus: 3,
    governanceImpact: "operational",
    defaultProgram: [
      { get title() { return i18n.t("uiRitualConfig.objectiveReminder"); }, minutes: 5, role: "admin" },
      { get title() { return i18n.t("uiRitualConfig.quickUpdates2MinPerson"); }, minutes: 25, role: null as null },
      { get title() { return i18n.t("uiRitualConfig.blockersSurfaced"); }, minutes: 10, role: null as null },
      { get title() { return i18n.t("uiRitualConfig.nextWeekCommitments"); }, minutes: 10, role: null as null },
    ],
  },
  CONFLICT_RESOLUTION: {
    get label() { return i18n.t("uiRitualConfig.restorativeCircle"); },
    get subtitle() { return i18n.t("uiRitualConfig.conflictResolution"); },
    icon: "Scale",
    get description() { return i18n.t("uiRitualConfig.repairRelationalRupture"); },
    bestFor: "Interpersonal or strategic tensions.",
    defaultDuration: 75,
    defaultXp: 0,
    facilitatorBonus: 10,
    governanceImpact: "restorative",
    defaultProgram: [
      { get title() { return i18n.t("uiRitualConfig.mediatorIntroduction"); }, minutes: 5, role: "facilitator" },
      { get title() { return i18n.t("uiRitualConfig.structuredSpeakingTurns"); }, minutes: 30, role: "facilitator" },
      { get title() { return i18n.t("uiRitualConfig.acknowledgmentPhase"); }, minutes: 15, role: null as null },
      { get title() { return i18n.t("uiRitualConfig.commitmentPhase"); }, minutes: 15, role: null as null },
      { get title() { return i18n.t("uiRitualConfig.followUpDate"); }, minutes: 10, role: "facilitator" },
    ],
  },
  VISIONARY_SESSION: {
    get label() { return i18n.t("uiRitualConfig.futureImagination"); },
    get subtitle() { return i18n.t("uiRitualConfig.visionarySession"); },
    icon: "Telescope",
    get description() { return i18n.t("uiRitualConfig.strategicLongTermOrientation"); },
    bestFor: "Territory guilds, regenerative ecosystems.",
    defaultDuration: 90,
    defaultXp: 8,
    facilitatorBonus: 8,
    governanceImpact: "strategic",
    defaultProgram: [
      { get title() { return i18n.t("uiRitualConfig.futureScenarioFraming"); }, minutes: 15, role: "facilitator" },
      { get title() { return i18n.t("uiRitualConfig.silentWriting"); }, minutes: 15, role: null as null },
      { get title() { return i18n.t("uiRitualConfig.collectiveSynthesis"); }, minutes: 30, role: null as null },
      { get title() { return i18n.t("uiRitualConfig.roadmapExtraction"); }, minutes: 25, role: "admin" },
      { get title() { return i18n.t("uiRitualConfig.closingAlignment"); }, minutes: 5, role: null as null },
    ],
  },
  CROSS_GUILD_FEDERATION: {
    get label() { return i18n.t("uiRitualConfig.bridgeAssembly"); },
    get subtitle() { return i18n.t("uiRitualConfig.crossGuildFederation"); },
    icon: "Network",
    get description() { return i18n.t("uiRitualConfig.alignMultipleGuilds"); },
    bestFor: "Territorial scaling, multi-guild coordination.",
    defaultDuration: 90,
    defaultXp: 12,
    facilitatorBonus: 10,
    governanceImpact: "high",
    defaultProgram: [
      { get title() { return i18n.t("uiRitualConfig.sharedMetrics"); }, minutes: 15, role: "admin" },
      { get title() { return i18n.t("uiRitualConfig.crossQuestMapping"); }, minutes: 20, role: null as null },
      { get title() { return i18n.t("uiRitualConfig.federationDecisions"); }, minutes: 30, role: null as null },
      { get title() { return i18n.t("uiRitualConfig.resourcePoolingDiscussion"); }, minutes: 20, role: null as null },
      { get title() { return i18n.t("uiRitualConfig.closing"); }, minutes: 5, role: null as null },
    ],
  },
  CELEBRATION: {
    get label() { return i18n.t("uiRitualConfig.harvestGathering"); },
    get subtitle() { return i18n.t("uiRitualConfig.celebrationRitual"); },
    icon: "PartyPopper",
    get description() { return i18n.t("uiRitualConfig.markMilestones"); },
    bestFor: "End of cycle, major delivery, funding success.",
    defaultDuration: 60,
    defaultXp: 5,
    facilitatorBonus: 3,
    governanceImpact: "cultural",
    defaultProgram: [
      { get title() { return i18n.t("uiRitualConfig.storytelling"); }, minutes: 15, role: null as null },
      { get title() { return i18n.t("uiRitualConfig.acknowledgments"); }, minutes: 15, role: "admin" },
      { get title() { return i18n.t("uiRitualConfig.highlightQuests"); }, minutes: 15, role: null as null },
      { get title() { return i18n.t("uiRitualConfig.gratitudeRound"); }, minutes: 15, role: null as null },
    ],
  },
} as const;

export type RitualSessionTypeKey = keyof typeof RITUAL_SESSION_TYPES;

export const RITUAL_FREQUENCIES = {
  WEEKLY: { get label() { return i18n.t("uiRitualConfig.weekly"); }, get description() { return i18n.t("uiRitualConfig.everyWeek"); } },
  BIWEEKLY: { get label() { return i18n.t("uiRitualConfig.biweekly"); }, get description() { return i18n.t("uiRitualConfig.everyTwoWeeks"); } },
  MONTHLY: { get label() { return i18n.t("uiRitualConfig.monthly"); }, get description() { return i18n.t("uiRitualConfig.onceAMonth"); } },
  QUARTERLY: { get label() { return i18n.t("uiRitualConfig.quarterly"); }, get description() { return i18n.t("uiRitualConfig.everyThreeMonths"); } },
  CUSTOM: { get label() { return i18n.t("uiRitualConfig.custom"); }, get description() { return i18n.t("uiRitualConfig.customRecurrence"); } },
} as const;

export const RITUAL_ACCESS_TYPES = {
  PUBLIC: { get label() { return i18n.t("uiRitualConfig.public"); }, get description() { return i18n.t("uiRitualConfig.visibleAndJoinableByAnyone"); } },
  MEMBERS: { get label() { return i18n.t("uiRitualConfig.guildMembers"); }, get description() { return i18n.t("uiRitualConfig.onlyGuildMembers"); } },
  ROLES: { get label() { return i18n.t("uiRitualConfig.specificRoles"); }, get description() { return i18n.t("uiRitualConfig.membersWithSpecificRoles"); } },
  XP_THRESHOLD: { get label() { return i18n.t("uiRitualConfig.xpThreshold"); }, get description() { return i18n.t("uiRitualConfig.minimumXpLevelRequired"); } },
  SHARE_CLASS: { get label() { return i18n.t("uiRitualConfig.shareholdingClass"); }, get description() { return i18n.t("uiRitualConfig.specificShareClassRequired"); } },
  INVITE_ONLY: { get label() { return i18n.t("uiRitualConfig.invitationOnly"); }, get description() { return i18n.t("uiRitualConfig.byInvitationOnly"); } },
} as const;

export const GOVERNANCE_IMPACT_COLORS: Record<string, string> = {
  low: "text-emerald-600 bg-emerald-500/10",
  indirect: "text-sky-600 bg-sky-500/10",
  medium: "text-amber-600 bg-amber-500/10",
  high: "text-red-600 bg-red-500/10",
  operational: "text-blue-600 bg-blue-500/10",
  restorative: "text-purple-600 bg-purple-500/10",
  strategic: "text-indigo-600 bg-indigo-500/10",
  cultural: "text-pink-600 bg-pink-500/10",
};

export interface ProgramSegment {
  title: string;
  minutes: number;
  role: string | null;
  notes?: string;
  aiPrompt?: string;
}
