import i18n from "@/i18n/config";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  PlusCircle, Briefcase, Shield, Hash, Compass, Users,
  Handshake, Sparkles, Eye,
} from "lucide-react";
import type { PersonaType } from "@/lib/personaLabels";

interface ActionItem {
  label: string;
  icon: any;
  route: string;
}

const ACTIONS: Record<PersonaType | "ORG_REP", ActionItem[]> = {
  CREATIVE: [
    { get label() { return i18n.t("uiContextualActions.startANewCreation"); }, icon: PlusCircle, route: "/quests/new" },
    { get label() { return i18n.t("uiContextualActions.offerASkillSession"); }, icon: Briefcase, route: "/services/new" },
    { get label() { return i18n.t("uiContextualActions.joinACircleOrStudio"); }, icon: Shield, route: "/explore?tab=guilds" },
    { get label() { return i18n.t("uiContextualActions.exploreYourHouses"); }, icon: Hash, route: "/explore/houses" },
    { get label() { return i18n.t("uiContextualActions.seeInspirationsFromYourCircles"); }, icon: Sparkles, route: "/network" },
  ],
  IMPACT: [
    { get label() { return i18n.t("uiContextualActions.startAMission"); }, icon: PlusCircle, route: "/quests/new" },
    { get label() { return i18n.t("uiContextualActions.postAService"); }, icon: Briefcase, route: "/services/new" },
    { get label() { return i18n.t("uiContextualActions.joinAGuild"); }, icon: Shield, route: "/explore?tab=guilds" },
    { get label() { return i18n.t("uiContextualActions.reviewPartnershipRequests"); }, icon: Handshake, route: "/work" },
    { get label() { return i18n.t("uiContextualActions.exploreOpportunitiesInYourTerritories"); }, icon: Compass, route: "/explore" },
  ],
  HYBRID: [
    { get label() { return i18n.t("uiContextualActions.startAQuest"); }, icon: PlusCircle, route: "/quests/new" },
    { get label() { return i18n.t("uiContextualActions.shareAnOffering"); }, icon: Briefcase, route: "/services/new" },
    { get label() { return i18n.t("uiContextualActions.joinACircleOrGuild"); }, icon: Shield, route: "/explore?tab=guilds" },
    { get label() { return i18n.t("uiContextualActions.checkCollaborationsInProgress"); }, icon: Users, route: "/work" },
    { get label() { return i18n.t("uiContextualActions.exploreYourHybridHouses"); }, icon: Hash, route: "/explore/houses" },
  ],
  ORG_REP: [
    { get label() { return i18n.t("uiContextualActions.manageMyOrganizations"); }, icon: Users, route: "/me/companies" },
    { get label() { return i18n.t("uiContextualActions.createAService"); }, icon: Briefcase, route: "/services/new" },
    { get label() { return i18n.t("uiContextualActions.postAJob"); }, icon: Compass, route: "/jobs" },
    { get label() { return i18n.t("uiContextualActions.findPartners"); }, icon: Handshake, route: "/explore?tab=companies" },
    { get label() { return i18n.t("uiContextualActions.exploreGuildsNetworks"); }, icon: Shield, route: "/explore?tab=guilds" },
  ],
  UNSET: [
    { get label() { return i18n.t("uiContextualActions.startAQuest"); }, icon: PlusCircle, route: "/quests/new" },
    { get label() { return i18n.t("uiContextualActions.offerAService"); }, icon: Briefcase, route: "/services/new" },
    { get label() { return i18n.t("uiContextualActions.joinACommunity"); }, icon: Shield, route: "/explore?tab=guilds" },
    { get label() { return i18n.t("uiContextualActions.explore"); }, icon: Eye, route: "/explore" },
  ],
};

interface Props {
  persona: PersonaType;
}

export function ContextualActions({ persona }: Props) {
  const actions = ACTIONS[persona];

  return (
    <div className="flex flex-wrap gap-1.5 sm:gap-2">
      {actions.map((action, i) => {
        const Icon = action.icon;
        return (
          <motion.div key={action.label} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}>
            <Link to={action.route}
              className="inline-flex items-center gap-1.5 sm:gap-2 rounded-xl border border-border bg-card px-2.5 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-medium hover:border-primary/30 hover:shadow-sm transition-all group">
              <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary group-hover:scale-110 transition-transform shrink-0" />
              <span className="line-clamp-1">{action.label}</span>
            </Link>
          </motion.div>
        );
      })}
    </div>
  );
}
