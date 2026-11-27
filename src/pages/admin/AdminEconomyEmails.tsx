import { useTranslation } from "react-i18next";
import { Mail } from "lucide-react";
import { EmailsDigestsTab } from "./tabs/ContentTabs";

export default function AdminEconomyEmails() {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <h2 className="font-display text-2xl font-bold flex items-center gap-2">
        <Mail className="h-6 w-6 text-primary" /> {t("uiAdminEconomyEmails.emailsDigests")}
      </h2>
      <EmailsDigestsTab />
    </div>
  );
}
