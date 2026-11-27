import { useState } from "react";
import { ContentPageShell, ContentSection } from "@/components/ContentPageShell";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

export default function BugReportingPage() {
  const { t } = useTranslation();
  const [title, setTitle] = useState("");
  const [steps, setSteps] = useState("");
  const [device, setDevice] = useState("");
  const [link, setLink] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success(t("uiBugReportingPage.bugReportSubmittedThankYou"));
    setTitle(""); setSteps(""); setDevice(""); setLink("");
  };

  return (
    <ContentPageShell title={t("pages.bugReport.title")} subtitle={t("pages.bugReport.subtitle")}>
      <ContentSection title={t("uiBugReportingPage.reportABug")}>
        <p>{t("uiBugReportingPage.ifSomethingIsBrokenConfusingOr")}</p>
      </ContentSection>

      <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
        <Input placeholder={t("uiBugReportingPage.bugTitle")} value={title} onChange={e => setTitle(e.target.value)} required />
        <Textarea placeholder={t("uiBugReportingPage.stepsToReproduce")} value={steps} onChange={e => setSteps(e.target.value)} required rows={4} />
        <Input placeholder={t("uiBugReportingPage.deviceBrowser")} value={device} onChange={e => setDevice(e.target.value)} />
        <Input placeholder={t("uiBugReportingPage.linkToImpactedPageOptional")} value={link} onChange={e => setLink(e.target.value)} />
        <Button type="submit">{t("uiBugReportingPage.submitBugReport")}</Button>
      </form>
    </ContentPageShell>
  );
}
