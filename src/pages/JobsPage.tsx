import { useTranslation } from "react-i18next";
import { useState } from "react";
import { Briefcase, Share2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { AuthPromptDialog } from "@/components/AuthPromptDialog";
import { AddJobDialog } from "@/components/AddJobDialog";
import { useToast } from "@/hooks/use-toast";
import JobsExplore from "./JobsExplore";
import { PageShell } from "@/components/PageShell";

export default function JobsPage() {
  const { t } = useTranslation();
  const currentUser = useCurrentUser();
  const isGuest = !currentUser?.id;
  const { toast } = useToast();

  const [authOpen, setAuthOpen] = useState(false);
  const [jobDialogOpen, setJobDialogOpen] = useState(false);

  const handleShare = () => {
    const url = "https://www.changethegame.xyz/jobs";
    navigator.clipboard.writeText(url);
    toast({ title: t("uiJobsPage.linkCopied"), description: t("uiJobsPage.shareThisPageWithAnyone") });
  };

  const handlePostJob = () => {
    if (isGuest) {
      setAuthOpen(true);
    } else {
      setJobDialogOpen(true);
    }
  };

  return (
    <PageShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Briefcase className="h-7 w-7 text-primary" />
            <div>
              <h1 className="text-2xl font-display font-bold">{t("uiJobsPage.jobBoard")}</h1>
              <p className="text-sm text-muted-foreground">{t("uiJobsPage.exploreOpenPositionsInTheEcosystem")}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleShare}>
              <Share2 className="h-4 w-4 mr-1" /> {t("uiJobsPage.share")}
            </Button>
            <Button size="sm" onClick={handlePostJob}>
              <Plus className="h-4 w-4 mr-1" /> {t("uiJobsPage.postAJob")}
            </Button>
          </div>
        </div>

        <JobsExplore bare />
      </div>

      <AuthPromptDialog
        open={authOpen}
        onOpenChange={setAuthOpen}
        actionLabel="post a job"
      />
      {!isGuest && <AddJobDialog open={jobDialogOpen} onOpenChange={setJobDialogOpen} />}
    </PageShell>
  );
}
