import { ContentPageShell, ContentSection, ContentList, ContentCTA } from "@/components/ContentPageShell";
import { useTranslation } from "react-i18next";

export default function CreateQuestInfoPage() {
  const { t } = useTranslation();
  return (
    <ContentPageShell title={t("pages.createQuest.title")} subtitle={t("pages.createQuest.subtitle")}>
      <ContentSection title={t("uiCreateQuestInfoPage.aQuestCanBe")}>
        <ContentList items={["A project you want to start", "An initiative in your guild", "A creative act", "A social or territorial action"]} />
      </ContentSection>

      <ContentSection title={t("uiCreateQuestInfoPage.questLifecycle")}>
        <ContentList items={["Starting", "Ongoing", "Completed (achievement)"]} />
      </ContentSection>

      <ContentSection title={t("uiCreateQuestInfoPage.youCanAdd")}>
        <ContentList items={["Houses", "Territories", "Credits / funding", "Images", "Participants"]} />
      </ContentSection>

      <ContentCTA links={[{ label: t("uiCreateQuestInfoPage.createAQuestNow"), href: "/quests/new" }]} />
    </ContentPageShell>
  );
}
