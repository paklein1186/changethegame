import { ContentPageShell, ContentSection, ContentList, ContentCTA } from "@/components/ContentPageShell";
import { useTranslation } from "react-i18next";

export default function CreateGuildInfoPage() {
  const { t } = useTranslation();
  return (
    <ContentPageShell title={t("pages.createGuild.title")} subtitle={t("pages.createGuild.subtitle")}>
      <ContentSection title={t("uiCreateGuildInfoPage.whatGuildsOffer")}>
        <p>{t("uiCreateGuildInfoPage.guildsOrCollectivesAreCollaborativeGroups")}</p>
        <ContentList items={["Quests", "Collaboration tools", "Events", "Services", "Members and roles", "An AI agent for coordination"]} />
      </ContentSection>

      <ContentSection title="Membership">
        <p>{t("uiCreateGuildInfoPage.youCanRequireApplicationsOrKeep")}</p>
      </ContentSection>

      <ContentCTA links={[{ label: t("uiCreateGuildInfoPage.createAGuild"), href: "/me/guilds" }]} />
    </ContentPageShell>
  );
}
