import { ContentPageShell, ContentSection, ContentList } from "@/components/ContentPageShell";
import { useTranslation } from "react-i18next";

export default function RoadmapPage() {
  const { t } = useTranslation();
  return (
    <ContentPageShell title={t("pages.roadmap.title")} subtitle={t("pages.roadmap.subtitle")}>
      <ContentSection title={t("uiRoadmapPage.upcomingFeatures")}>
        <ContentList items={[
          t("uiRoadmapPage.enhancedTerritoryIntelligenceDashboards"),
          t("uiRoadmapPage.advancedGuildGovernanceTools"),
          t("uiRoadmapPage.publicApiForIntegrations"),
          t("uiRoadmapPage.mobileOptimizedExperienceImprovements"),
          t("uiRoadmapPage.crossPlatformAiMatchmakingUpgrades"),
        ]} />
      </ContentSection>

      <ContentSection title={t("uiRoadmapPage.recentUpdates")}>
        <ContentList items={[
          t("uiRoadmapPage.networkHubWithRelationalEcosystemView"),
          t("uiRoadmapPage.aiMatchmakerIntegrationAcrossAllUnits"),
          t("uiRoadmapPage.courseCreationAndEnrollmentSystem"),
          t("uiRoadmapPage.questProposalsAndFundingWorkflows"),
          t("uiRoadmapPage.personaBasedUiPersonalization"),
        ]} />
      </ContentSection>

      <ContentSection title={t("uiRoadmapPage.communityProposals")}>
        <p>{t("uiRoadmapPage.featuresShapedByCommunityFeedbackAre")}</p>
      </ContentSection>
    </ContentPageShell>
  );
}
