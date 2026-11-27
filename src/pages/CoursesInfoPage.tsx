import { ContentPageShell, ContentSection, ContentList, ContentCTA } from "@/components/ContentPageShell";
import { useTranslation } from "react-i18next";

export default function CoursesInfoPage() {
  const { t } = useTranslation();
  return (
    <ContentPageShell title={t("pages.coursesInfo.title")} subtitle={t("pages.coursesInfo.subtitle")}>
      <ContentSection title={t("uiCoursesInfoPage.whatCoursesInclude")}>
        <p>{t("uiCoursesInfoPage.coursesAllowUsersAndGuildsTo")}</p>
        <ContentList items={[t("uiCoursesInfoPage.lessons"), t("uiCoursesInfoPage.videos"), t("uiCoursesInfoPage.files"), t("uiCoursesInfoPage.exercises"), t("uiCoursesInfoPage.discussions")]} />
      </ContentSection>

      <ContentSection title={t("uiCoursesInfoPage.pricing")}>
        <p>{t("uiCoursesInfoPage.coursesCanBeFreeOrMonetized")}</p>
      </ContentSection>

      <ContentCTA links={[
        { label: t("uiCoursesInfoPage.browseCourses"), href: "/explore?tab=courses" },
        { label: t("uiCoursesInfoPage.createACourse"), href: "/courses/new" },
      ]} />
    </ContentPageShell>
  );
}
