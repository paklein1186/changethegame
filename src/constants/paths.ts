import i18n from "@/i18n/config";
export interface PathConfig {
  id: string;
  name: string;
  icon: string;
  description: string;
  forWho: string;
  steps: number;
}

export const PATHS: PathConfig[] = [
  {
    id: "explorer",
    name: "The Explorer",
    icon: "🌱",
    get description() { return i18n.t("uiPaths.discoverCtgBuildYourProfileFind"); },
    forWho: "New to the platform",
    steps: 6,
  },
  {
    id: "mapper",
    name: "The Mapper",
    icon: "🗺️",
    get description() { return i18n.t("uiPaths.documentYourTerritoryMonitorNaturalSystems"); },
    forWho: "You care about a specific place",
    steps: 6,
  },
  {
    id: "builder",
    name: "The Builder",
    icon: "🏗️",
    get description() { return i18n.t("uiPaths.createOrStrengthenGuildsCollaborateOn"); },
    forWho: "You want to build community",
    steps: 6,
  },
  {
    id: "quester",
    name: "The Quester",
    icon: "⚔️",
    get description() { return i18n.t("uiPaths.takeActionCompleteMissionsEarnXp"); },
    forWho: "You want to DO things",
    steps: 6,
  },
  {
    id: "weaver",
    name: "The Weaver",
    icon: "🕸️",
    get description() { return i18n.t("uiPaths.understandAndShapeTheEconomicFlows"); },
    forWho: "You think in systems and value",
    steps: 6,
  },
  {
    id: "steward",
    name: "The Steward",
    icon: "🌳",
    get description() { return i18n.t("uiPaths.leadWithServiceGovernWithConsent"); },
    forWho: "You want to lead and guide",
    steps: 6,
  },
];
