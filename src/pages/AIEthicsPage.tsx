import { ContentPageShell, ContentSection, ContentList } from "@/components/ContentPageShell";
import { useTranslation } from "react-i18next";

export default function AIEthicsPage() {
  const { t } = useTranslation();
  return (
    <ContentPageShell title={t("pages.aiEthics.title")} subtitle={t("pages.aiEthics.subtitle")}>
      <ContentSection title={t("uiAIEthicsPage.whyWeUseAi")}>
        <p>{t("uiAIEthicsPage.aiAmplifiesHumanCollaborationCreativityAnd")}</p>
      </ContentSection>

      <ContentSection title={t("uiAIEthicsPage.principles")}>
        <ContentList items={[
          t("uiAIEthicsPage.whatAiCanAndCannotDo"),
          t("uiAIEthicsPage.dataBoundariesAreStrictlyEnforcedPer"),
          t("uiAIEthicsPage.transparencyOfAlgorithmsAndRecommendations"),
          t("uiAIEthicsPage.memoryIsPerUnitNotGlobal"),
          t("uiAIEthicsPage.usersControlTheirAiInteractions"),
          t("uiAIEthicsPage.deletionAndPrivacyOptionsAreAlways"),
          t("uiAIEthicsPage.commitmentToResponsibleAndEthicalUse"),
        ]} />
      </ContentSection>
    </ContentPageShell>
  );
}
