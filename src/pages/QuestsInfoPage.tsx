import { ContentPageShell, ContentSection, ContentList, ContentCTA } from "@/components/ContentPageShell";
import { useTranslation } from "react-i18next";

export default function QuestsInfoPage() {
  const { t } = useTranslation();
  return (
    <ContentPageShell title={t("pages.questsInfo.title")} subtitle={t("pages.questsInfo.subtitle")}>
      <ContentSection title={t("uiQuestsInfoPage.whatAreQuests")}>
        <p>{t("uiQuestsInfoPage.questsAreTheBeatingHeartOf")}</p>
        <ContentList items={[t("uiQuestsInfoPage.personalProjects"), t("uiQuestsInfoPage.communityMissions"), t("uiQuestsInfoPage.creativeJourneys"), t("uiQuestsInfoPage.impactCollaborations"), t("uiQuestsInfoPage.guildProjects"), t("uiQuestsInfoPage.companyAssignments")]} />
      </ContentSection>

      <ContentSection title={t("uiQuestsInfoPage.whatYouCanDo")}>
        <ContentList items={[t("uiQuestsInfoPage.createQuests"), t("uiQuestsInfoPage.joinQuests"), t("uiQuestsInfoPage.proposeContributions"), t("uiQuestsInfoPage.earnXpReputationForEveryContribution"), t("uiQuestsInfoPage.earnCoinsFromFundedQuestPools"), t("uiQuestsInfoPage.fundAndSupportQuests")]} />
      </ContentSection>

      <ContentSection title={t("uiQuestsInfoPage.questFundingPools")}>
        <p>
          {t("uiQuestsInfoPage.everyProjectOrOngoingMissionQuest")}
        </p>
        <ContentList items={[
          t("uiQuestsInfoPage.coinsFiatBackedMissionValuePre"),
          t("uiQuestsInfoPage.ctgContributionTokenAlsoFundableInto"),
        ]} />
        <p className="text-sm text-muted-foreground mt-2 font-medium">
          {t("uiQuestsInfoPage.platformCreditsAreNeverUsedFor")}
        </p>
      </ContentSection>

      <ContentCTA links={[
        { label: t("uiQuestsInfoPage.browseQuests"), href: "/explore?tab=quests" },
        { label: t("uiQuestsInfoPage.createAQuest"), href: "/quests/new" },
        { label: t("uiQuestsInfoPage.understandTheValueSystem"), href: "/ecosystem?tab=funding" },
      ]} />
    </ContentPageShell>
  );
}
