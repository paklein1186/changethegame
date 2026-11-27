import { ContentPageShell, ContentSection } from "@/components/ContentPageShell";
import { useTranslation } from "react-i18next";

export default function CookiesPage() {
  const { t } = useTranslation();
  return (
    <ContentPageShell title={t("pages.cookies.title")} subtitle={t("pages.cookies.subtitle")}>
      <ContentSection title={t("uiCookiesPage.1WhatAreCookies")}>
        <p>{t("uiCookiesPage.cookiesAreSmallTextFilesStored")}</p>
      </ContentSection>

      <ContentSection title={t("uiCookiesPage.2TypesOfCookiesUsed")}>
        <p><strong>Essential:</strong> {t("uiCookiesPage.necessaryForThePlatformToFunction")}</p>
        <p><strong>Analytics:</strong> {t("uiCookiesPage.helpUsUnderstandHowUsersInteract")}</p>
        <p><strong>Preferences:</strong> {t("uiCookiesPage.rememberYourSettingsSuchAsLanguage")}</p>
      </ContentSection>

      <ContentSection title="3. How We Use Cookies">
        <p>{t("uiCookiesPage.cookiesEnableAuthenticationPersonalizationAnalyticsAnd")}</p>
      </ContentSection>

      <ContentSection title={t("uiCookiesPage.4HowToManageCookies")}>
        <p>{t("uiCookiesPage.youCanManageYourCookiePreferences")}</p>
      </ContentSection>

      <ContentSection title={t("uiCookiesPage.5ImpactOfDisablingCookies")}>
        <p>{t("uiCookiesPage.disablingEssentialCookiesMayPreventYou")}</p>
      </ContentSection>

      <ContentSection title="6. Contact">
        <p>{t("uiCookiesPage.forQuestionsAboutOurCookiePractices")} <a href="mailto:privacy@changethegame.xyz" className="text-primary hover:underline">privacy@changethegame.xyz</a>.</p>
      </ContentSection>
    </ContentPageShell>
  );
}
