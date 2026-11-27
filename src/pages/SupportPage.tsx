import { ContentPageShell, ContentSection, ContentList, ContentCTA } from "@/components/ContentPageShell";
import { useTranslation } from "react-i18next";

export default function SupportPage() {
  const { t } = useTranslation();
  return (
    <ContentPageShell title={t("pages.support.title")} subtitle={t("pages.support.subtitle")}>
      <ContentSection title={t("uiSupportPage.quickstartGuides")}>
        <ContentList items={[
          t("uiSupportPage.howToCreateYourProfile"),
          t("uiSupportPage.howToLaunchAQuest"),
          t("uiSupportPage.howToJoinAGuild"),
          t("uiSupportPage.howToOfferAService"),
          t("uiSupportPage.howToUseAiAgents"),
        ]} />
      </ContentSection>

      <ContentSection title={t("uiSupportPage.inDepthGuides")}>
        <ContentList items={[
          t("uiSupportPage.xpCreditsContributionIndex"),
          t("uiSupportPage.podsAndCollaborationTools"),
          t("uiSupportPage.guildGovernance"),
          t("uiSupportPage.territoryActivation"),
          t("uiSupportPage.coursesLearningModules"),
          t("uiSupportPage.howAiWorksAndWhereData"),
        ]} />
      </ContentSection>

      <ContentSection title={t("uiSupportPage.troubleshooting")}>
        <ContentList items={[
          t("uiSupportPage.iCanTCreateAQuest"),
          t("uiSupportPage.myGuildDoesnTDisplayProperly"),
          t("uiSupportPage.myCompanyIsnTAttached"),
          t("uiSupportPage.bookingsDonTOpen"),
          t("uiSupportPage.notificationsDonTAppear"),
        ]} />
      </ContentSection>

      <ContentSection title={t("uiSupportPage.askForHelp")}>
        <p>{t("uiSupportPage.stuckContactTheTeamForDirect")}</p>
      </ContentSection>

      <ContentCTA links={[{ label: "Contact us", href: "/contact" }]} />
    </ContentPageShell>
  );
}
