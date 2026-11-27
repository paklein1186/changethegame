import { ContentPageShell, ContentSection, ContentList, ContentCTA } from "@/components/ContentPageShell";
import { useTranslation } from "react-i18next";

export default function CompaniesInfoPage() {
  const { t } = useTranslation();
  return (
    <ContentPageShell title={t("pages.companiesInfo.title")} subtitle={t("pages.companiesInfo.subtitle")}>
      <ContentSection title={t("uiCompaniesInfoPage.traditionalOrganizationsInChangethegame")}>
        <p>{t("uiCompaniesInfoPage.traditionalOrganizationsRepresentTheProfessionalWorld")}</p>
        <ContentList items={["Attach yourself to an organization", "Create or join organization quests", "Offer services as an organization", "Build teams and pods"]} />
      </ContentSection>

      <ContentCTA links={[
        { label: "Browse Traditional Organizations", href: "/explore?tab=companies" },
        { label: t("uiCompaniesInfoPage.createATraditionalOrganization"), href: "/me/companies" },
      ]} />
    </ContentPageShell>
  );
}