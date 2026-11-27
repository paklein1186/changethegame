import i18n from "@/i18n/config";
// ─── Ritual Session Type Configuration ────────────────────────
// Cultural grammar for Guild collective synchronization.

export const RITUAL_SESSION_TYPES = {
  INFORMAL_HANGING: {
    label: "Commons Café",
    subtitle: "Informal Hanging",
    icon: "Coffee",
    description: "Build trust, reduce friction, strengthen weak ties.",
    bestFor: "Early-stage guilds, post-conflict cooling, onboarding waves.",
    defaultDuration: 75,
    defaultXp: 3,
    facilitatorBonus: 0,
    governanceImpact: "low",
    defaultProgram: [
      { get title() { return i18n.t("uiRitualConfig.openArrival"); }, minutes: 10, role: null as null },
      { get title() { return i18n.t("uiRitualConfig.2MinPersonalCheckIn"); }, minutes: 15, role: null as null },
      { title: "Free conversation", minutes: 30, role: null as null },
      { get title() { return i18n.t("uiRitualConfig.emergentTopicClusters"); }, minutes: 15, role: null as null },
      { title: "Light closing round", minutes: 5, role: null as null },
    ],
  },
  EMOTIONAL_CHECKIN: {
    label: "Pulse Circle",
    get subtitle() { return i18n.t("uiRitualConfig.emotionalCheckIn"); },
    icon: "Heart",
    description: "Surface tensions before they become structural.",
    bestFor: "High-growth phases, conflict periods, collective transitions.",
    defaultDuration: 60,
    defaultXp: 5,
    facilitatorBonus: 5,
    governanceImpact: "indirect",
    defaultProgram: [
      { title: "Silence arrival", minutes: 2, role: null as null },
      { title: "1-word emotional state", minutes: 5, role: null as null },
      { title: "Structured round (3 min/person)", minutes: 40, role: "facilitator" },
      { title: "Reflection synthesis", minutes: 8, role: "facilitator" },
      { title: "Closing breath", minutes: 5, role: null as null },
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
      { title: "Metrics review", minutes: 15, role: "admin" },
      { get title() { return i18n.t("uiRitualConfig.questUpdates"); }, minutes: 20, role: null as null },
      { get title() { return i18n.t("uiRitualConfig.proposalPresentations"); }, minutes: 25, role: null as null },
      { title: "Decision block", minutes: 25, role: "admin" },
      { get title() { return i18n.t("uiRitualConfig.assignmentOfResponsibilities"); }, minutes: 15, role: "admin" },
      { title: "Closing alignment", minutes: 5, role: null as null },
    ],
  },
  MASTERMIND: {
    label: "Strategic Deep Dive",
    subtitle: "Mastermind Session",
    icon: "Brain",
    get description() { return i18n.t("uiRitualConfig.supportAMemberOrProjectThrough"); },
    bestFor: "Entrepreneurs, territory leads, complex dilemmas.",
    defaultDuration: 90,
    defaultXp: 8,
    facilitatorBonus: 8,
    governanceImpact: "medium",
    defaultProgram: [
      { title: "Presenter framing", minutes: 10, role: "presenter" },
      { title: "Clarifying questions", minutes: 15, role: null as null },
      { title: "Silent reflection", minutes: 5, role: null as null },
      { title: "Feedback round", minutes: 30, role: null as null },
      { title: "Integration plan", minutes: 15, role: "presenter" },
      { title: "Closing reflection", minutes: 5, role: null as null },
    ],
  },
  LEARNING_LAB: {
    label: "Skill Transmission",
    subtitle: "Learning Lab",
    icon: "GraduationCap",
    description: "Collective upskilling.",
    bestFor: "Topic-based guilds, technical cohorts, governance training.",
    defaultDuration: 75,
    defaultXp: 7,
    facilitatorBonus: 12,
    governanceImpact: "low",
    defaultProgram: [
      { title: "Input presentation", minutes: 30, role: "teacher" },
      { title: "Application breakout", minutes: 20, role: null as null },
      { title: "Collective reflection", minutes: 15, role: null as null },
      { get title() { return i18n.t("uiRitualConfig.nextStepCommitments"); }, minutes: 10, role: null as null },
    ],
  },
  SPRINT_ALIGNMENT: {
    label: "Mission Sync",
    subtitle: "Sprint Alignment",
    icon: "Zap",
    description: "Short-term operational alignment.",
    bestFor: "Active projects, campaign phases.",
    defaultDuration: 50,
    defaultXp: 4,
    facilitatorBonus: 3,
    governanceImpact: "operational",
    defaultProgram: [
      { title: "Objective reminder", minutes: 5, role: "admin" },
      { title: "Quick updates (2 min/person)", minutes: 25, role: null as null },
      { title: "Blockers surfaced", minutes: 10, role: null as null },
      { get title() { return i18n.t("uiRitualConfig.nextWeekCommitments"); }, minutes: 10, role: null as null },
    ],
  },
  CONFLICT_RESOLUTION: {
    label: "Restorative Circle",
    subtitle: "Conflict Resolution",
    icon: "Scale",
    description: "Repair relational rupture.",
    bestFor: "Interpersonal or strategic tensions.",
    defaultDuration: 75,
    defaultXp: 0,
    facilitatorBonus: 10,
    governanceImpact: "restorative",
    defaultProgram: [
      { title: "Mediator introduction", minutes: 5, role: "facilitator" },
      { title: "Structured speaking turns", minutes: 30, role: "facilitator" },
      { title: "Acknowledgment phase", minutes: 15, role: null as null },
      { title: "Commitment phase", minutes: 15, role: null as null },
      { get title() { return i18n.t("uiRitualConfig.followUpDate"); }, minutes: 10, role: "facilitator" },
    ],
  },
  VISIONARY_SESSION: {
    label: "Future Imagination",
    subtitle: "Visionary Session",
    icon: "Telescope",
    description: "Strategic long-term orientation.",
    bestFor: "Territory guilds, regenerative ecosystems.",
    defaultDuration: 90,
    defaultXp: 8,
    facilitatorBonus: 8,
    governanceImpact: "strategic",
    defaultProgram: [
      { title: "Future scenario framing", minutes: 15, role: "facilitator" },
      { title: "Silent writing", minutes: 15, role: null as null },
      { title: "Collective synthesis", minutes: 30, role: null as null },
      { title: "Roadmap extraction", minutes: 25, role: "admin" },
      { title: "Closing alignment", minutes: 5, role: null as null },
    ],
  },
  CROSS_GUILD_FEDERATION: {
    label: "Bridge Assembly",
    get subtitle() { return i18n.t("uiRitualConfig.crossGuildFederation"); },
    icon: "Network",
    get description() { return i18n.t("uiRitualConfig.alignMultipleGuilds"); },
    bestFor: "Territorial scaling, multi-guild coordination.",
    defaultDuration: 90,
    defaultXp: 12,
    facilitatorBonus: 10,
    governanceImpact: "high",
    defaultProgram: [
      { title: "Shared metrics", minutes: 15, role: "admin" },
      { get title() { return i18n.t("uiRitualConfig.crossQuestMapping"); }, minutes: 20, role: null as null },
      { title: "Federation decisions", minutes: 30, role: null as null },
      { title: "Resource pooling discussion", minutes: 20, role: null as null },
      { title: "Closing", minutes: 5, role: null as null },
    ],
  },
  CELEBRATION: {
    label: "Harvest Gathering",
    subtitle: "Celebration Ritual",
    icon: "PartyPopper",
    description: "Mark milestones.",
    bestFor: "End of cycle, major delivery, funding success.",
    defaultDuration: 60,
    defaultXp: 5,
    facilitatorBonus: 3,
    governanceImpact: "cultural",
    defaultProgram: [
      { title: "Storytelling", minutes: 15, role: null as null },
      { title: "Acknowledgments", minutes: 15, role: "admin" },
      { get title() { return i18n.t("uiRitualConfig.highlightQuests"); }, minutes: 15, role: null as null },
      { title: "Gratitude round", minutes: 15, role: null as null },
    ],
  },
} as const;

export type RitualSessionTypeKey = keyof typeof RITUAL_SESSION_TYPES;

export const RITUAL_FREQUENCIES = {
  WEEKLY: { label: "Weekly", description: "Every week" },
  BIWEEKLY: { label: "Biweekly", description: "Every two weeks" },
  MONTHLY: { label: "Monthly", get description() { return i18n.t("uiRitualConfig.onceAMonth"); } },
  QUARTERLY: { label: "Quarterly", description: "Every three months" },
  CUSTOM: { label: "Custom", description: "Custom recurrence" },
} as const;

export const RITUAL_ACCESS_TYPES = {
  PUBLIC: { get label() { return i18n.t("uiRitualConfig.public"); }, get description() { return i18n.t("uiRitualConfig.visibleAndJoinableByAnyone"); } },
  MEMBERS: { get label() { return i18n.t("uiRitualConfig.guildMembers"); }, get description() { return i18n.t("uiRitualConfig.onlyGuildMembers"); } },
  ROLES: { get label() { return i18n.t("uiRitualConfig.specificRoles"); }, get description() { return i18n.t("uiRitualConfig.membersWithSpecificRoles"); } },
  XP_THRESHOLD: { get label() { return i18n.t("uiRitualConfig.xpThreshold"); }, get description() { return i18n.t("uiRitualConfig.minimumXpLevelRequired"); } },
  SHARE_CLASS: { label: "Shareholding Class", get description() { return i18n.t("uiRitualConfig.specificShareClassRequired"); } },
  INVITE_ONLY: { label: "Invitation Only", get description() { return i18n.t("uiRitualConfig.byInvitationOnly"); } },
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
