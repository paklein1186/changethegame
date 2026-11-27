import { useTranslation } from "react-i18next";
import { ShoppingBag } from "lucide-react";
import { ServicesSection } from "./tabs/ContentTabs";

export default function AdminContentServices() {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <h2 className="font-display text-2xl font-bold flex items-center gap-2">
        <ShoppingBag className="h-6 w-6 text-primary" /> {t("uiAdminContentServices.services")}
      </h2>
      <ServicesSection />
    </div>
  );
}
