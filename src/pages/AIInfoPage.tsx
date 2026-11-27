import { ContentPageShell, ContentSection, ContentList } from "@/components/ContentPageShell";
import { useTranslation } from "react-i18next";

export default function AIInfoPage() {
  const { t } = useTranslation();
  return (
    <ContentPageShell title={t("pages.ai.title")} subtitle={t("pages.ai.subtitle")}>
      <ContentSection title={t("uiAIInfoPage.aiAgentsAssistYouBy")}>
        <ContentList items={[
          t("uiAIInfoPage.summarizingMissions"),
          t("uiAIInfoPage.proposingCollaborators"),
          t("uiAIInfoPage.draftingGuildOrQuestDescriptions"),
          t("uiAIInfoPage.generatingUpdates"),
          t("uiAIInfoPage.analyzingTerritoryActivity"),
          t("uiAIInfoPage.suggestingNextSteps"),
          t("uiAIInfoPage.offeringCreativeInspiration"),
          t("uiAIInfoPage.supportingGovernanceWithPollsAndOptions"),
        ]} />
      </ContentSection>

      <ContentSection title="Contextual Memory">
        <p>{t("uiAIInfoPage.eachUnitGuildQuestCompanyTerritory")}</p>
      </ContentSection>
    </ContentPageShell>
  );
}
