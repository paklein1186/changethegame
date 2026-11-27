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
import { autoFollowEntity } from "@/hooks/useFollow";
import { GuildJoinPolicy, GuildApplicationStatus } from "@/types/enums";
import { useNotifications } from "@/hooks/useNotifications";

interface GuildJoinButtonProps {
  guildId: string;
  guildName?: string;
  joinPolicy: GuildJoinPolicy;
  applicationQuestions: string[];
  currentUserId: string;
  currentUserName?: string;
  onJoined?: () => void;
}

export function GuildJoinButton({
  guildId,
  guildName,
  joinPolicy,
  applicationQuestions,
  currentUserId,
  currentUserName,
  onJoined,
}: GuildJoinButtonProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { notifyJoinRequest } = useNotifications();
  const [loading, setLoading] = useState(false);
  const [pendingApp, setPendingApp] = useState(false);
  const [checkingApp, setCheckingApp] = useState(true);
  const [applyOpen, setApplyOpen] = useState(false);
  const [answers, setAnswers] = useState<string[]>([]);

  // Check for existing pending application
  useEffect(() => {
    if (joinPolicy !== GuildJoinPolicy.APPROVAL_REQUIRED) {
      setCheckingApp(false);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("guild_applications")
        .select("id, status")
        .eq("guild_id", guildId)
        .eq("applicant_user_id", currentUserId)
        .eq("status", "PENDING")
        .maybeSingle();
      setPendingApp(!!data);
      setCheckingApp(false);
    })();
  }, [guildId, currentUserId, joinPolicy]);

  const handleOpenJoin = async () => {
    setLoading(true);
    const { error } = await supabase.from("guild_members").insert({
      guild_id: guildId,
      user_id: currentUserId,
      role: "MEMBER",
    });
    setLoading(false);
    if (error) {
      toast({ title: t("uiGuildJoinButton.failedToJoin"), description: error.message, variant: "destructive" });
    } else {
      autoFollowEntity(currentUserId, "GUILD", guildId);
      toast({ title: t("uiGuildJoinButton.joinedGuild") });
      onJoined?.();
    }
  };

  const handleSubmitApplication = async () => {
    setLoading(true);
    const answerPayload = applicationQuestions.map((q, i) => ({
      question: q,
      answer: answers[i] || "",
    }));
    const { error } = await supabase.from("guild_applications").insert({
      guild_id: guildId,
      applicant_user_id: currentUserId,
      answers: answerPayload,
      status: "PENDING",
    });
    setLoading(false);
    if (error) {
      if (error.message?.includes("unique") || error.code === "23505") {
        toast({ title: t("uiGuildJoinButton.youAlreadyHaveAPendingApplication"), variant: "destructive" });
      } else {
        toast({ title: t("uiGuildJoinButton.failedToSubmit"), description: error.message, variant: "destructive" });
      }
    } else {
      setPendingApp(true);
      setApplyOpen(false);
      toast({ title: t("uiGuildJoinButton.applicationSubmitted"), description: t("uiGuildJoinButton.guildAdminsWillReviewIt") });
      notifyJoinRequest({ entityType: "guild", entityId: guildId, entityName: guildName || "guild", applicantName: currentUserName || "Someone" });
    }
  };

  if (checkingApp) return null;

  // INVITE_ONLY
  if (joinPolicy === GuildJoinPolicy.INVITE_ONLY) {
    return (
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Lock className="h-4 w-4" />
        <span>{t("uiGuildJoinButton.inviteOnlyGuild")}</span>
      </div>
    );
  }

  // APPROVAL_REQUIRED with pending application
  if (joinPolicy === GuildJoinPolicy.APPROVAL_REQUIRED && pendingApp) {
    return (
      <Badge variant="outline" className="gap-1">
        <Clock className="h-3 w-3" /> {t("uiGuildJoinButton.applicationPending")}
      </Badge>
    );
  }

  // APPROVAL_REQUIRED — show apply button
  if (joinPolicy === GuildJoinPolicy.APPROVAL_REQUIRED) {
    return (
      <>
        <Button size="sm" variant="outline" onClick={() => {
          setAnswers(applicationQuestions.map(() => ""));
          setApplyOpen(true);
        }}>
          <UserPlus className="h-4 w-4 mr-1" /> {t("uiGuildJoinButton.applyToJoin")}
        </Button>

        <Dialog open={applyOpen} onOpenChange={setApplyOpen}>
          <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t("uiGuildJoinButton.applyToJoin")}</DialogTitle>
              <DialogDescription>{t("uiGuildJoinButton.answerTheQuestionsBelowGuildAdmins")}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              {applicationQuestions.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("uiGuildJoinButton.noSpecificQuestionsJustSubmitTo")}</p>
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
                      placeholder={t("uiGuildJoinButton.yourAnswer")}
                      maxLength={1000}
                      className="resize-none"
                    />
                  </div>
                ))
              )}
              <Button onClick={handleSubmitApplication} disabled={loading} className="w-full">
                {loading && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                {t("uiGuildJoinButton.submitApplication")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // OPEN — immediate join
  return (
    <Button size="sm" variant="outline" onClick={handleOpenJoin} disabled={loading}>
      {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <UserPlus className="h-4 w-4 mr-1" />}
      {t("uiGuildJoinButton.joinGuild")}
    </Button>
  );
}
