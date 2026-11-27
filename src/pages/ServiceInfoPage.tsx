import { ContentPageShell, ContentSection, ContentList, ContentCTA } from "@/components/ContentPageShell";
import { useTranslation } from "react-i18next";

export default function ServiceInfoPage() {
  const { t } = useTranslation();
  return (
    <ContentPageShell title={t("pages.serviceInfo.title")} subtitle={t("pages.serviceInfo.subtitle")}>
      <ContentSection title={t("uiServiceInfoPage.whatYouCanOffer")}>
        <p>{t("uiServiceInfoPage.servicesOrSkillSessionsLetYou")}</p>
        <ContentList items={[t("uiServiceInfoPage.expertise"), t("uiServiceInfoPage.creativeSessions"), t("uiServiceInfoPage.workshops"), t("uiServiceInfoPage.mentoring"), t("uiServiceInfoPage.coaching"), t("uiServiceInfoPage.artisticPractices")]} />
      </ContentSection>

      <ContentSection title={t("uiServiceInfoPage.features")}>
        <p>{t("uiServiceInfoPage.integratedBookingCalendarAndOptionalCredit")}</p>
      </ContentSection>

      <ContentCTA links={[{ label: t("uiServiceInfoPage.createAService"), href: "/services/new" }]} />
    </ContentPageShell>
  );
}
