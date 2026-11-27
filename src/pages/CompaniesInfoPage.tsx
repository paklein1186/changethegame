import { ContentPageShell, ContentSection, ContentList, ContentCTA } from "@/components/ContentPageShell";
import { useTranslation } from "react-i18next";

export default function CompaniesInfoPage() {
  const { t } = useTranslation();
  return (
    <ContentPageShell title={t("pages.companiesInfo.title")} subtitle={t("pages.companiesInfo.subtitle")}>
      <ContentSection title={t("uiCompaniesInfoPage.traditionalOrganizationsInChangethegame")}>
        <p>{t("uiCompaniesInfoPage.traditionalOrganizationsRepresentTheProfessionalWorld")}</p>
        <ContentList items={[t("uiCompaniesInfoPage.attachYourselfToAnOrganization"), t("uiCompaniesInfoPage.createOrJoinOrganizationQuests"), t("uiCompaniesInfoPage.offerServicesAsAnOrganization"), t("uiCompaniesInfoPage.buildTeamsAndPods")]} />
      </ContentSection>

      <ContentCTA links={[
        { label: t("uiCompaniesInfoPage.browseTraditionalOrganizations"), href: "/explore?tab=companies" },
        { label: t("uiCompaniesInfoPage.createATraditionalOrganization"), href: "/me/companies" },
      ]} />
    </ContentPageShell>
  );
}