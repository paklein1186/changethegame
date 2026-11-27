import { ContentPageShell, ContentSection, ContentList, ContentCTA } from "@/components/ContentPageShell";
import { useTranslation } from "react-i18next";

export default function CreateGuildInfoPage() {
  const { t } = useTranslation();
  return (
    <ContentPageShell title={t("pages.createGuild.title")} subtitle={t("pages.createGuild.subtitle")}>
      <ContentSection title={t("uiCreateGuildInfoPage.whatGuildsOffer")}>
        <p>{t("uiCreateGuildInfoPage.guildsOrCollectivesAreCollaborativeGroups")}</p>
        <ContentList items={[t("uiCreateGuildInfoPage.quests"), t("uiCreateGuildInfoPage.collaborationTools"), t("uiCreateGuildInfoPage.events"), t("uiCreateGuildInfoPage.services"), t("uiCreateGuildInfoPage.membersAndRoles"), t("uiCreateGuildInfoPage.anAiAgentForCoordination")]} />
      </ContentSection>

      <ContentSection title="Membership">
        <p>{t("uiCreateGuildInfoPage.youCanRequireApplicationsOrKeep")}</p>
      </ContentSection>

      <ContentCTA links={[{ label: t("uiCreateGuildInfoPage.createAGuild"), href: "/me/guilds" }]} />
    </ContentPageShell>
  );
}
