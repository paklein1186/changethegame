import { ContentPageShell, ContentSection, ContentList, ContentCTA } from "@/components/ContentPageShell";
import { useTranslation } from "react-i18next";

export default function PeopleInfoPage() {
  const { t } = useTranslation();
  return (
    <ContentPageShell title={t("pages.peopleInfo.title")} subtitle={t("pages.peopleInfo.subtitle")}>
      <ContentSection title={t("uiPeopleInfoPage.findYourPeople")}>
        <p>{t("uiPeopleInfoPage.useHousesTerritoriesXpAndContributions")}</p>
        <ContentList items={["Creators", "Experts", "Impact professionals", "Guild leaders", "Company representatives", "Local actors"]} />
      </ContentSection>

      <ContentCTA links={[{ label: "Explore people", href: "/explore/users" }]} />
    </ContentPageShell>
  );
}
