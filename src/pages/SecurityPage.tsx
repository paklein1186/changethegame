import { ContentPageShell, ContentSection, ContentList } from "@/components/ContentPageShell";
import { useTranslation } from "react-i18next";

export default function SecurityPage() {
  const { t } = useTranslation();
  return (
    <ContentPageShell title={t("pages.security.title")} subtitle={t("pages.security.subtitle")}>
      <ContentSection title={t("uiSecurityPage.ourCommitment")}>
        <p>{t("uiSecurityPage.securityIsFoundationalToChangethegameWe")}</p>
      </ContentSection>

      <ContentSection title={t("uiSecurityPage.measuresInPlace")}>
        <ContentList items={[
          "Encryption in transit (TLS) and at rest",
          "Row-level security on all database tables",
          "Rate limiting on all sensitive endpoints",
          "Role-based access control for guilds, companies, and admin",
          "Secure authentication with email verification",
          "Session management with automatic expiry",
          "Soft-delete with permanent removal after 30 days",
        ]} />
      </ContentSection>

      <ContentSection title="Responsible Disclosure">
        <p>{t("uiSecurityPage.ifYouDiscoverAVulnerabilityPlease")} <a href="mailto:security@changethegame.xyz" className="text-primary hover:underline">security@changethegame.xyz</a>{t("uiSecurityPage.weTakeAllReportsSeriouslyAnd")}</p>
      </ContentSection>
    </ContentPageShell>
  );
}
