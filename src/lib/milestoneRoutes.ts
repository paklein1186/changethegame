import i18n from "@/i18n/config";
/**
 * Canonical mapping from milestone codes → actionable routes.
 * Used by MilestonesHub, MilestoneTracker, MilestoneJourney.
 */
export const MILESTONE_ROUTES: Record<string, { label: string; to: string }> = {
  // ── Phase 1: Discover ──────────────────────────────────────
  complete_profile_v2:    { get label() { return i18n.t("uiMilestoneRoutes.editYourProfile"); },        to: "/profile/edit" },
  explore_guilds:         { get label() { return i18n.t("uiMilestoneRoutes.browseGuilds"); },            to: "/explore?tab=entities" },
  join_first_guild_v2:    { get label() { return i18n.t("uiMilestoneRoutes.browseGuilds"); },            to: "/explore?tab=entities" },
  first_comment:          { get label() { return i18n.t("uiMilestoneRoutes.goToFeed"); },               to: "/feed" },
  follow_3_quests:        { get label() { return i18n.t("uiMilestoneRoutes.browseQuests"); },            to: "/explore?tab=quests" },
  visit_territory:        { get label() { return i18n.t("uiMilestoneRoutes.exploreTerritories"); },      to: "/territories" },
  read_guide:             { label: "Read guides",              to: "/guides" },
  set_spoken_languages:   { get label() { return i18n.t("uiMilestoneRoutes.editProfile"); },             to: "/profile/edit" },
  explore_services:       { label: "Browse services",          to: "/explore?tab=services" },
  view_user_profile:      { label: "Explore people",           to: "/explore/users" },
  follow_user:            { label: "Explore people",           to: "/explore/users" },
  send_first_message:     { get label() { return i18n.t("uiMilestoneRoutes.openInbox"); },               to: "/inbox" },

  // ── Phase 2: Contribute ────────────────────────────────────
  respond_opportunity:    { label: "Browse opportunities",     to: "/explore?tab=jobs&sub=opportunities" },
  join_quest:             { get label() { return i18n.t("uiMilestoneRoutes.browseQuests"); },            to: "/explore?tab=quests" },
  complete_subtask:       { get label() { return i18n.t("uiMilestoneRoutes.goToWorkHub"); },           to: "/work" },
  log_contribution:       { get label() { return i18n.t("uiMilestoneRoutes.goToWorkHub"); },           to: "/work" },
  add_knowledge:          { get label() { return i18n.t("uiMilestoneRoutes.exploreTerritories"); },      to: "/territories" },
  join_event:             { get label() { return i18n.t("uiMilestoneRoutes.browseEvents"); },            to: "/calendar" },
  react_discussion:       { get label() { return i18n.t("uiMilestoneRoutes.goToFeed"); },               to: "/feed" },
  help_or_resource:       { get label() { return i18n.t("uiMilestoneRoutes.browseQuests"); },            to: "/explore?tab=quests" },
  fund_quest:             { get label() { return i18n.t("uiMilestoneRoutes.browseQuests"); },            to: "/explore?tab=quests" },
  give_trust:             { label: "Explore people",           to: "/explore/users" },
  book_service:           { label: "Browse services",          to: "/explore?tab=services" },
  join_second_guild:      { get label() { return i18n.t("uiMilestoneRoutes.browseGuilds"); },            to: "/explore?tab=entities" },
  complete_5_subtasks:    { get label() { return i18n.t("uiMilestoneRoutes.goToWorkHub"); },           to: "/work" },
  get_contribution_verified: { get label() { return i18n.t("uiMilestoneRoutes.goToWorkHub"); },        to: "/work" },
  follow_quest_v2:        { get label() { return i18n.t("uiMilestoneRoutes.browseQuests"); },            to: "/explore?tab=quests" },

  // ── Phase 3: Create ────────────────────────────────────────
  create_quest:           { get label() { return i18n.t("uiMilestoneRoutes.createAQuest"); },           to: "/quests/new" },
  publish_service_v2:     { get label() { return i18n.t("uiMilestoneRoutes.createAService"); },         to: "/services/new" },
  invite_collaborator:    { get label() { return i18n.t("uiMilestoneRoutes.myGuilds"); },                to: "/me/guilds" },
  post_update:            { get label() { return i18n.t("uiMilestoneRoutes.goToWorkHub"); },           to: "/work" },
  create_event:           { get label() { return i18n.t("uiMilestoneRoutes.myGuilds"); },                to: "/me/guilds" },
  create_course:          { get label() { return i18n.t("uiMilestoneRoutes.createACourse"); },          to: "/courses/new" },
  open_fundraising:       { get label() { return i18n.t("uiMilestoneRoutes.goToWorkHub"); },           to: "/work" },
  set_availability:       { label: "Set availability",         to: "/me/availability" },
  add_quest_needs:        { get label() { return i18n.t("uiMilestoneRoutes.goToWorkHub"); },           to: "/work" },
  receive_first_proposal: { get label() { return i18n.t("uiMilestoneRoutes.goToWorkHub"); },           to: "/work" },
  quest_with_3_participants: { get label() { return i18n.t("uiMilestoneRoutes.goToWorkHub"); },        to: "/work" },
  complete_first_quest:   { get label() { return i18n.t("uiMilestoneRoutes.goToWorkHub"); },           to: "/work" },
  earn_100_xp:            { get label() { return i18n.t("uiMilestoneRoutes.viewYourXp"); },             to: "/me/xp" },

  // ── Phase 4: Structure ─────────────────────────────────────
  create_guild_v2:        { get label() { return i18n.t("uiMilestoneRoutes.createAGuild"); },           to: "/create/guild-info" },
  become_admin:           { get label() { return i18n.t("uiMilestoneRoutes.myGuilds"); },                to: "/me/guilds" },
  governance_vote:        { get label() { return i18n.t("uiMilestoneRoutes.myGuilds"); },                to: "/me/guilds" },
  setup_contract:         { get label() { return i18n.t("uiMilestoneRoutes.goToWorkHub"); },           to: "/work" },
  configure_exit:         { get label() { return i18n.t("uiMilestoneRoutes.myGuilds"); },                to: "/me/guilds" },
  create_partnership:     { get label() { return i18n.t("uiMilestoneRoutes.myGuilds"); },                to: "/me/guilds" },
  freeze_pie:             { get label() { return i18n.t("uiMilestoneRoutes.goToWorkHub"); },           to: "/work" },
  distribute_rewards:     { get label() { return i18n.t("uiMilestoneRoutes.goToWorkHub"); },           to: "/work" },
  guild_10_members:       { get label() { return i18n.t("uiMilestoneRoutes.myGuilds"); },                to: "/me/guilds" },
  become_shareholder_v2:  { get label() { return i18n.t("uiMilestoneRoutes.viewShares"); },              to: "/shares" },

  // ── Legacy codes (backward compat) ─────────────────────────
  complete_profile:       { get label() { return i18n.t("uiMilestoneRoutes.editProfile"); },             to: "/profile/edit" },
  add_spoken_languages:   { get label() { return i18n.t("uiMilestoneRoutes.editProfile"); },             to: "/profile/edit" },
  join_first_guild:       { get label() { return i18n.t("uiMilestoneRoutes.browseGuilds"); },            to: "/explore?tab=entities" },
  create_first_quest:     { get label() { return i18n.t("uiMilestoneRoutes.createAQuest"); },           to: "/quests/new" },
  publish_service:        { get label() { return i18n.t("uiMilestoneRoutes.createAService"); },         to: "/services/new" },
  collaborate_pod:        { get label() { return i18n.t("uiMilestoneRoutes.browseQuests"); },            to: "/explore?tab=quests" },
  contribute_territory:   { get label() { return i18n.t("uiMilestoneRoutes.exploreTerritories"); },      to: "/territories" },
  attend_event:           { get label() { return i18n.t("uiMilestoneRoutes.browseEvents"); },            to: "/calendar" },
  become_shareholder:     { get label() { return i18n.t("uiMilestoneRoutes.viewShares"); },              to: "/shares" },
  publish_course:         { get label() { return i18n.t("uiMilestoneRoutes.createACourse"); },          to: "/courses/new" },
  creative_class:         { get label() { return i18n.t("uiMilestoneRoutes.createACourse"); },          to: "/courses/new" },
  creative_artwork_quest: { get label() { return i18n.t("uiMilestoneRoutes.createAQuest"); },           to: "/quests/new" },
  impact_quest:           { get label() { return i18n.t("uiMilestoneRoutes.createAQuest"); },           to: "/quests/new" },
  impact_territory_memory:{ get label() { return i18n.t("uiMilestoneRoutes.exploreTerritories"); },      to: "/territories" },
  impact_guild:           { get label() { return i18n.t("uiMilestoneRoutes.browseGuilds"); },            to: "/explore?tab=entities" },
  join_creative_circle:   { get label() { return i18n.t("uiMilestoneRoutes.browseGuilds"); },            to: "/explore?tab=entities" },
  host_workshop:          { get label() { return i18n.t("uiMilestoneRoutes.myGuilds"); },                to: "/me/guilds" },
  invite_friend:          { get label() { return i18n.t("uiMilestoneRoutes.myGuilds"); },                to: "/me/guilds" },
};

/** Phase display metadata */
export const PHASE_META: Record<string, { label: string; emoji: string; color: string }> = {
  discover:   { label: "Discover",    emoji: "🌱", color: "text-emerald-600" },
  contribute: { label: "Contribute",  emoji: "🔗", color: "text-blue-600" },
  create:     { get label() { return i18n.t("uiMilestoneRoutes.create"); },      emoji: "🚀", color: "text-purple-600" },
  structure:  { label: "Structure",   emoji: "🏛️", color: "text-amber-600" },
};
