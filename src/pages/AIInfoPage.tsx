import { ContentPageShell, ContentSection, ContentList } from "@/components/ContentPageShell";
import { useTranslation } from "react-i18next";

export default function AIInfoPage() {
  const { t } = useTranslation();
  return (
    <ContentPageShell title={t("pages.ai.title")} subtitle={t("pages.ai.subtitle")}>
      <ContentSection title={t("uiAIInfoPage.aiAgentsAssistYouBy")}>
        <ContentList items={[
          "Summarizing missions",
          "Proposing collaborators",
          "Drafting guild or quest descriptions",
          "Generating updates",
          "Analyzing territory activity",
          "Suggesting next steps",
          "Offering creative inspiration",
          "Supporting governance with polls and options",
        ]} />
      </ContentSection>

      <ContentSection title="Contextual Memory">
        <p>{t("uiAIInfoPage.eachUnitGuildQuestCompanyTerritory")}</p>
      </ContentSection>
    </ContentPageShell>
  );
}
