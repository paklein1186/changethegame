import { ContentPageShell, ContentSection, ContentList, ContentCTA } from "@/components/ContentPageShell";
import { useTranslation } from "react-i18next";

export default function CreateCompanyInfoPage() {
  const { t } = useTranslation();
  return (
    <ContentPageShell title={t("pages.createCompany.title")} subtitle={t("pages.createCompany.subtitle")}>
      <ContentSection title="What Traditional Organizations Manage">
        <p>{t("uiCreateCompanyInfoPage.aTraditionalOrganizationRefersToA")}</p>
        <ContentList items={["Organization quests", "Organization services", "Members and roles", "Bookings", "Governance"]} />
      </ContentSection>

      <ContentCTA links={[{ label: t("uiCreateCompanyInfoPage.createATraditionalOrganization"), href: "/me/companies" }]} />
    </ContentPageShell>
  );
}
