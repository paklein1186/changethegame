import { ContentPageShell, ContentSection, ContentList, ContentCTA } from "@/components/ContentPageShell";
import { useTranslation } from "react-i18next";

export default function QuestsInfoPage() {
  const { t } = useTranslation();
  return (
    <ContentPageShell title={t("pages.questsInfo.title")} subtitle={t("pages.questsInfo.subtitle")}>
      <ContentSection title={t("uiQuestsInfoPage.whatAreQuests")}>
        <p>{t("uiQuestsInfoPage.questsAreTheBeatingHeartOf")}</p>
        <ContentList items={["Personal projects", "Community missions", "Creative journeys", "Impact collaborations", "Guild projects", "Company assignments"]} />
      </ContentSection>

      <ContentSection title={t("uiQuestsInfoPage.whatYouCanDo")}>
        <ContentList items={["Create quests", "Join quests", "Propose contributions", "Earn XP (reputation) for every contribution", "Earn 🟩 Coins from funded quest pools and 🌱 $CTG for commons contributions", "Fund and support quests"]} />
      </ContentSection>

      <ContentSection title={t("uiQuestsInfoPage.questFundingPools")}>
        <p>
          {t("uiQuestsInfoPage.everyProjectOrOngoingMissionQuest")}
        </p>
        <ContentList items={[
          "🟩 Coins — fiat-backed mission value. Pre-funded by the creator or raised via campaigns. Distributed to contributors via OCU pie, equal split, or manual dispatch. Withdrawable to €.",
          "🌱 $CTG — contribution token. Also fundable into quest escrow as an incentive. Frozen from demurrage while in escrow. Resumes 1%/month decay on distribution.",
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
