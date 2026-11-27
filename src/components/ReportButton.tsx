import { useTranslation } from "react-i18next";
import { useState } from "react";
import { notifyPlatformAdmins } from "@/lib/notifyAdmins";
import { Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ReportTargetType } from "@/types/enums";

interface ReportButtonProps {
  targetType: ReportTargetType;
  targetId: string;
  variant?: "sm" | "inline";
}

export function ReportButton({ targetType, targetId, variant = "sm" }: ReportButtonProps) {
  const { t } = useTranslation();
  const currentUser = useCurrentUser();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  const submit = async () => {
    if (!reason.trim()) {
      toast({ title: t("uiReportButton.pleaseProvideAReason"), variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("reports").insert({
      reporter_id: currentUser.id,
      target_type: targetType,
      target_id: targetId,
      reason: reason.trim(),
      status: "OPEN",
    });
    if (error) { toast({ title: t("uiReportButton.failedToSubmitReport"), variant: "destructive" }); return; }
    setReason("");
    setOpen(false);
    toast({ title: "Report submitted", description: t("uiReportButton.anAdminWillReviewItShortly") });
    notifyPlatformAdmins({
      type: "SYSTEM_ABUSE_REPORT",
      title: t("uiReportButton.newContentReport"),
      body: `${targetType} was reported`,
      deepLinkUrl: "/admin/content/reports",
      relatedEntityId: targetId,
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {variant === "inline" ? (
          <Button variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground hover:text-destructive">
            <Flag className="h-3 w-3 mr-1" />Report
          </Button>
        ) : (
          <Button size="sm" variant="outline" className="text-muted-foreground hover:text-destructive hover:border-destructive">
            <Flag className="h-4 w-4 mr-1" /> Report
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report {targetType.toLowerCase().replace(/_/g, " ")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <p className="text-sm text-muted-foreground">
            {t("uiReportButton.pleaseDescribeWhyYouReReporting")}
          </p>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("uiReportButton.describeTheIssue")} className="min-h-[100px] resize-none" maxLength={500} />
          <Button onClick={submit} disabled={!reason.trim()} className="w-full">
            <Flag className="h-4 w-4 mr-1" /> {t("uiReportButton.submitReport")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
