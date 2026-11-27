import { useTranslation } from "react-i18next";
import { CreditCard } from "lucide-react";
import { BookingsSection } from "./tabs/ContentTabs";

export default function AdminEconomyBookings() {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <h2 className="font-display text-2xl font-bold flex items-center gap-2">
        <CreditCard className="h-6 w-6 text-primary" /> {t("uiAdminEconomyBookings.bookingsSessions")}
      </h2>
      <BookingsSection />
    </div>
  );
}
