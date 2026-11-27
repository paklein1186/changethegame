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
          t("uiSecurityPage.encryptionInTransitTlsAndAt"),
          t("uiSecurityPage.rowLevelSecurityOnAllDatabase"),
          t("uiSecurityPage.rateLimitingOnAllSensitiveEndpoints"),
          t("uiSecurityPage.roleBasedAccessControlForGuilds"),
          t("uiSecurityPage.secureAuthenticationWithEmailVerification"),
          t("uiSecurityPage.sessionManagementWithAutomaticExpiry"),
          t("uiSecurityPage.softDeleteWithPermanentRemovalAfter"),
        ]} />
      </ContentSection>

      <ContentSection title={t("uiSecurityPage.responsibleDisclosure")}>
        <p>{t("uiSecurityPage.ifYouDiscoverAVulnerabilityPlease")} <a href="mailto:security@changethegame.xyz" className="text-primary hover:underline">{t("uiSecurityPage.securityChangethegameXyz")}</a>{t("uiSecurityPage.weTakeAllReportsSeriouslyAnd")}</p>
      </ContentSection>
    </ContentPageShell>
  );
}
