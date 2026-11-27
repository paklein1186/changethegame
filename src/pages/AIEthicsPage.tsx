import { ContentPageShell, ContentSection, ContentList } from "@/components/ContentPageShell";
import { useTranslation } from "react-i18next";

export default function AIEthicsPage() {
  const { t } = useTranslation();
  return (
    <ContentPageShell title={t("pages.aiEthics.title")} subtitle={t("pages.aiEthics.subtitle")}>
      <ContentSection title="Why We Use AI">
        <p>{t("uiAIEthicsPage.aiAmplifiesHumanCollaborationCreativityAnd")}</p>
      </ContentSection>

      <ContentSection title="Principles">
        <ContentList items={[
          "What AI can and cannot do is clearly communicated",
          "Data boundaries are strictly enforced per unit",
          "Transparency of algorithms and recommendations",
          "Memory is per unit, not global",
          "Users control their AI interactions",
          "Deletion and privacy options are always available",
          "Commitment to responsible and ethical use",
        ]} />
      </ContentSection>
    </ContentPageShell>
  );
}
