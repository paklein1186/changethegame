import { useTranslation } from "react-i18next";
import { useState, useEffect } from "react";
import { UserPlus, Clock, Lock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useNotifications } from "@/hooks/useNotifications";

type EntityType = "guild" | "pod" | "company";

interface EntityJoinButtonProps {
  entityType: EntityType;
  entityId: string;
  entityName?: string;
  joinPolicy: string;
  applicationQuestions: string[];
  currentUserId: string;
  currentUserName?: string;
  onJoined?: () => void;
  /** Phrase affichée après avoir rejoint ou candidaté, quand l'entité propose une adhésion payante. */
  membershipHint?: string;
}

const TABLE_MAP = {
  guild: { applications: "guild_applications", members: "guild_members", idCol: "guild_id", memberRole: "MEMBER" },
  pod: { applications: "pod_applications", members: "pod_members", idCol: "pod_id", memberRole: "MEMBER" },
  company: { applications: "company_applications", members: "company_members", idCol: "company_id", memberRole: "MEMBER" },
} as const;

const LABELS = {
  guild: "guild",
  pod: "pod",
  company: "organization",
};

export function EntityJoinButton({
  entityType,
  entityId,
  entityName,
  joinPolicy,
  applicationQuestions,
  currentUserId,
  currentUserName,
  onJoined,
  membershipHint,
}: EntityJoinButtonProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { notifyJoinRequest } = useNotifications();
  const [loading, setLoading] = useState(false);
  const [pendingApp, setPendingApp] = useState(false);
  const [checkingApp, setCheckingApp] = useState(true);
  const [applyOpen, setApplyOpen] = useState(false);
  const [answers, setAnswers] = useState<string[]>([]);

  const cfg = TABLE_MAP[entityType];
  const label = LABELS[entityType];

  useEffect(() => {
    if (joinPolicy !== "APPROVAL_REQUIRED") {
      setCheckingApp(false);
      return;
    }
    (async () => {
      const { data } = await (supabase
        .from(cfg.applications as any)
        .select("id, status")
        .eq(cfg.idCol, entityId)
        .eq("applicant_user_id", currentUserId)
        .eq("status", "PENDING")
        .maybeSingle() as any);
      setPendingApp(!!data);
      setCheckingApp(false);
    })();
  }, [entityId, currentUserId, joinPolicy]);

  const handleOpenJoin = async () => {
    setLoading(true);
    const insertData: any = { [cfg.idCol]: entityId, user_id: currentUserId };
    if (entityType !== "company") insertData.role = cfg.memberRole;
    const { error } = await (supabase.from(cfg.members as any).insert(insertData) as any);
    setLoading(false);
    if (error) {
      toast({ title: t("uiEntityJoinButton.failedToJoin"), description: error.message, variant: "destructive" });
    } else {
      toast({ title: `Joined ${label}!`, description: membershipHint });
      onJoined?.();
    }
  };

  const handleSubmitApplication = async () => {
    setLoading(true);
    const answerPayload = applicationQuestions.map((q, i) => ({
      question: q,
      answer: answers[i] || "",
    }));
    const { error } = await (supabase.from(cfg.applications as any).insert({
      [cfg.idCol]: entityId,
      applicant_user_id: currentUserId,
      answers: answerPayload,
      status: "PENDING",
    }) as any);
    setLoading(false);
    if (error) {
      if (error.message?.includes("unique") || error.code === "23505") {
        toast({ title: t("uiEntityJoinButton.youAlreadyHaveAPendingApplication"), variant: "destructive" });
      } else {
        toast({ title: t("uiEntityJoinButton.failedToSubmit"), description: error.message, variant: "destructive" });
      }
    } else {
      setPendingApp(true);
      setApplyOpen(false);
      toast({ title: t("uiEntityJoinButton.applicationSubmitted"), description: membershipHint ? `Admins will review it. ${membershipHint}` : t("uiEntityJoinButton.adminsWillReviewIt") });
      // Notify admins about the join request
      notifyJoinRequest({ entityType, entityId, entityName: entityName || label, applicantName: currentUserName || "Someone" });
    }
  };

  if (checkingApp) return null;

  if (joinPolicy === "INVITE_ONLY") {
    return (
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Lock className="h-4 w-4" />
        <span>{t("uiEntityJoinButton.inviteOnly")} {label}</span>
      </div>
    );
  }

  if (joinPolicy === "APPROVAL_REQUIRED" && pendingApp) {
    return (
      <Badge variant="outline" className="gap-1">
        <Clock className="h-3 w-3" /> {t("uiEntityJoinButton.applicationPending")}
      </Badge>
    );
  }

  if (joinPolicy === "APPROVAL_REQUIRED") {
    return (
      <>
        <Button size="sm" variant="outline" onClick={() => {
          setAnswers(applicationQuestions.map(() => ""));
          setApplyOpen(true);
        }}>
          <UserPlus className="h-4 w-4 mr-1" /> {t("uiEntityJoinButton.applyToJoin")}
        </Button>

        <Dialog open={applyOpen} onOpenChange={setApplyOpen}>
          <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t("uiEntityJoinButton.applyToJoin")}</DialogTitle>
              <DialogDescription>{t("uiEntityJoinButton.answerTheQuestionsBelowAdminsWill")}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              {applicationQuestions.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("uiEntityJoinButton.noSpecificQuestionsJustSubmitTo")}</p>
              ) : (
                applicationQuestions.map((q, i) => (
                  <div key={i}>
                    <label className="text-sm font-medium mb-1 block">{q}</label>
                    <Textarea
                      value={answers[i] || ""}
                      onChange={(e) => {
                        const next = [...answers];
                        next[i] = e.target.value;
                        setAnswers(next);
                      }}
                      placeholder={t("uiEntityJoinButton.yourAnswer")}
                      maxLength={1000}
                      className="resize-none"
                    />
                  </div>
                ))
              )}
              <Button onClick={handleSubmitApplication} disabled={loading} className="w-full">
                {loading && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                {t("uiEntityJoinButton.submitApplication")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // OPEN
  return (
    <Button size="sm" variant="outline" onClick={handleOpenJoin} disabled={loading}>
      {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <UserPlus className="h-4 w-4 mr-1" />}
      {t("uiEntityJoinButton.join")} {label}
    </Button>
  );
}
