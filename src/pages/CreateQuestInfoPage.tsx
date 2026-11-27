import { ContentPageShell, ContentSection, ContentList, ContentCTA } from "@/components/ContentPageShell";
import { useTranslation } from "react-i18next";

export default function CreateQuestInfoPage() {
  const { t } = useTranslation();
  return (
    <ContentPageShell title={t("pages.createQuest.title")} subtitle={t("pages.createQuest.subtitle")}>
      <ContentSection title={t("uiCreateQuestInfoPage.aQuestCanBe")}>
        <ContentList items={[t("uiCreateQuestInfoPage.aProjectYouWantToStart"), t("uiCreateQuestInfoPage.anInitiativeInYourGuild"), t("uiCreateQuestInfoPage.aCreativeAct"), t("uiCreateQuestInfoPage.aSocialOrTerritorialAction")]} />
      </ContentSection>

      <ContentSection title={t("uiCreateQuestInfoPage.questLifecycle")}>
        <ContentList items={[t("uiCreateQuestInfoPage.starting"), t("uiCreateQuestInfoPage.ongoing"), t("uiCreateQuestInfoPage.completedAchievement")]} />
      </ContentSection>

      <ContentSection title={t("uiCreateQuestInfoPage.youCanAdd")}>
        <ContentList items={[t("uiCreateQuestInfoPage.houses"), t("uiCreateQuestInfoPage.territories"), t("uiCreateQuestInfoPage.creditsFunding"), t("uiCreateQuestInfoPage.images"), t("uiCreateQuestInfoPage.participants")]} />
      </ContentSection>

      <ContentCTA links={[{ label: t("uiCreateQuestInfoPage.createAQuestNow"), href: "/quests/new" }]} />
    </ContentPageShell>
  );
}
