import { useTranslation } from "react-i18next";
import { Settings } from "lucide-react";

export default function AdminSystemIntegrations() {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <h2 className="font-display text-2xl font-bold flex items-center gap-2">
        <Settings className="h-6 w-6 text-primary" /> {t("uiAdminSystemIntegrations.integrations")}
      </h2>
      <p className="text-muted-foreground">{t("uiAdminSystemIntegrations.integrationManagementStripeEmailProvidersEtc")}</p>
    </div>
  );
}
