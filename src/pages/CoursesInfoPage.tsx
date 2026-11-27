import { ContentPageShell, ContentSection, ContentList, ContentCTA } from "@/components/ContentPageShell";
import { useTranslation } from "react-i18next";

export default function CoursesInfoPage() {
  const { t } = useTranslation();
  return (
    <ContentPageShell title={t("pages.coursesInfo.title")} subtitle={t("pages.coursesInfo.subtitle")}>
      <ContentSection title="What Courses Include">
        <p>{t("uiCoursesInfoPage.coursesAllowUsersAndGuildsTo")}</p>
        <ContentList items={["Lessons", "Videos", "Files", "Exercises", "Discussions"]} />
      </ContentSection>

      <ContentSection title="Pricing">
        <p>{t("uiCoursesInfoPage.coursesCanBeFreeOrMonetized")}</p>
      </ContentSection>

      <ContentCTA links={[
        { label: "Browse courses", href: "/explore?tab=courses" },
        { label: t("uiCoursesInfoPage.createACourse"), href: "/courses/new" },
      ]} />
    </ContentPageShell>
  );
}
