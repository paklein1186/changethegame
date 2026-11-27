import { useTranslation } from "react-i18next";
import { ScrollText } from "lucide-react";

export default function AdminContentCourses() {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <h2 className="font-display text-2xl font-bold flex items-center gap-2">
        <ScrollText className="h-6 w-6 text-primary" /> {t("uiAdminContentCourses.courses")}
      </h2>
      <p className="text-muted-foreground">{t("uiAdminContentCourses.courseManagementComingSoon")}</p>
    </div>
  );
}
