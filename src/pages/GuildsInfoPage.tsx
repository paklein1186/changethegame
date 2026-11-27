import { ContentPageShell, ContentSection, ContentList, ContentCTA } from "@/components/ContentPageShell";
import { useTranslation } from "react-i18next";

export default function GuildsInfoPage() {
  const { t } = useTranslation();
  return (
    <ContentPageShell title={t("pages.guildsInfo.title")} subtitle={t("pages.guildsInfo.subtitle")}>
      <ContentSection title={t("uiGuildsInfoPage.whatAreGuilds")}>
        <p>{t("uiGuildsInfoPage.guildsAreLivingCommunitiesThatGather")}</p>
        <ContentList items={[t("uiGuildsInfoPage.collaborateOnQuests"), t("uiGuildsInfoPage.shareResources"), t("uiGuildsInfoPage.organizeEvents"), t("uiGuildsInfoPage.useCollaborationToolsKanbanDocsAi"), t("uiGuildsInfoPage.applyOrInviteMembers")]} />
      </ContentSection>

      <ContentCTA links={[
        { label: t("uiGuildsInfoPage.browseGuilds"), href: "/explore?tab=guilds" },
        { label: t("uiGuildsInfoPage.createAGuild"), href: "/me/guilds" },
      ]} />
    </ContentPageShell>
  );
}