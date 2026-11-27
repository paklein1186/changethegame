import { ContentPageShell, ContentSection, ContentList } from "@/components/ContentPageShell";
import { useTranslation } from "react-i18next";

export default function CommunityGuidelinesPage() {
  const { t } = useTranslation();
  return (
    <ContentPageShell title={t("pages.community.title")} subtitle={t("pages.community.subtitle")}>
      <ContentSection title={t("uiCommunityGuidelinesPage.ourStandards")}>
        <ContentList items={[
          t("uiCommunityGuidelinesPage.respectAndKindnessInAllInteractions"),
          t("uiCommunityGuidelinesPage.zeroToleranceForHarassmentOrDiscrimination"),
          t("uiCommunityGuidelinesPage.constructiveCollaborationOverConflict"),
          t("uiCommunityGuidelinesPage.inclusiveLanguageThatWelcomesEveryone"),
          t("uiCommunityGuidelinesPage.respectForTerritoriesAndLocalCommunities"),
          t("uiCommunityGuidelinesPage.appropriateUseOfAiAgents"),
          t("uiCommunityGuidelinesPage.useReportingToolsWhenNeededModeration"),
        ]} />
      </ContentSection>
    </ContentPageShell>
  );
}
