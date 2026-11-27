import { useTranslation } from "react-i18next";
import { Compass } from "lucide-react";
import { QuestsTab } from "./tabs/ContentTabs";

export default function AdminContentQuests() {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <h2 className="font-display text-2xl font-bold flex items-center gap-2">
        <Compass className="h-6 w-6 text-primary" /> {t("uiAdminContentQuests.quests")}
      </h2>
      <QuestsTab />
    </div>
  );
}
