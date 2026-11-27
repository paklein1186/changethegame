import i18n from "@/i18n/config";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { History, Undo2, Trash2, MessageSquare, FileText, Swords, Heart, UserPlus, Loader2, CheckSquare, Coins } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const ACTION_META: Record<string, { label: string; icon: typeof History; color: string; revertable?: boolean }> = {
  post_created: { get label() { return i18n.t("uiActivityHistoryTab.createdAPost"); }, icon: FileText, color: "text-blue-500", revertable: true },
  comment_created: { label: "Commented", icon: MessageSquare, color: "text-green-500", revertable: true },
  post_upvoted: { get label() { return i18n.t("uiActivityHistoryTab.upvotedAPost"); }, icon: Heart, color: "text-pink-500", revertable: true },
  quest_joined: { get label() { return i18n.t("uiActivityHistoryTab.joinedAQuest"); }, icon: Swords, color: "text-orange-500", revertable: true },
  quest_highlighted: { get label() { return i18n.t("uiActivityHistoryTab.highlightedAQuest"); }, icon: Swords, color: "text-yellow-500", revertable: true },
  guild_joined: { get label() { return i18n.t("uiActivityHistoryTab.joinedAGuild"); }, icon: UserPlus, color: "text-purple-500" },
  company_joined: { get label() { return i18n.t("uiActivityHistoryTab.joinedACompany"); }, icon: UserPlus, color: "text-indigo-500" },
  pod_joined: { get label() { return i18n.t("uiActivityHistoryTab.joinedAPod"); }, icon: UserPlus, color: "text-teal-500" },
  followed: { label: "Followed", icon: Heart, color: "text-pink-400", revertable: true },
  course_enrolled: { get label() { return i18n.t("uiActivityHistoryTab.enrolledInACourse"); }, icon: FileText, color: "text-cyan-500" },
  event_registered: { get label() { return i18n.t("uiActivityHistoryTab.registeredForAnEvent"); }, icon: FileText, color: "text-emerald-500" },
  quest_deleted: { get label() { return i18n.t("uiActivityHistoryTab.deletedAQuest"); }, icon: Trash2, color: "text-red-500", revertable: true },
  subtask_deleted: { get label() { return i18n.t("uiActivityHistoryTab.deletedASubtask"); }, icon: Trash2, color: "text-red-400" },
  subtask_completed: { get label() { return i18n.t("uiActivityHistoryTab.completedASubtask"); }, icon: CheckSquare, color: "text-green-600" },
  quest_funded: { get label() { return i18n.t("uiActivityHistoryTab.fundedAQuest"); }, icon: Coins, color: "text-emerald-600" },
};

export function ActivityHistoryTab() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [reverting, setReverting] = useState<string | null>(null);

  const { data: actions = [], isLoading } = useQuery({
    queryKey: ["my-activity-history", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("activity_log")
        .select("*")
        .eq("actor_user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(200);
      return data ?? [];
    },
    enabled: !!user?.id,
  });

  const revertAction = async (action: any) => {
    if (!user?.id) return;
    setReverting(action.id);
    try {
      switch (action.action_type) {
        case "post_created": {
          await supabase.from("feed_posts").update({ is_deleted: true, deleted_at: new Date().toISOString() }).eq("id", action.target_id).eq("author_user_id", user.id);
          toast({ title: "Post deleted" });
          break;
        }
        case "comment_created": {
          const commentId = action.metadata?.comment_id || action.target_id;
          await supabase.from("comments").update({ is_deleted: true, deleted_at: new Date().toISOString() }).eq("id", commentId).eq("author_id", user.id);
          toast({ title: "Comment deleted" });
          break;
        }
        case "post_upvoted": {
          await supabase.from("post_upvotes").delete().eq("post_id", action.target_id).eq("user_id", user.id);
          toast({ title: "Upvote removed" });
          break;
        }
        case "quest_joined": {
          await supabase.from("quest_participants").delete().eq("quest_id", action.target_id).eq("user_id", user.id);
          toast({ title: t("uiActivityHistoryTab.leftQuest") });
          break;
        }
        case "quest_highlighted": {
          await supabase.from("highlighted_quests").delete().eq("quest_id", action.target_id).eq("user_id", user.id);
          toast({ title: "Highlight removed" });
          break;
        }
        case "followed": {
          await supabase.from("follows").delete().eq("target_id", action.target_id).eq("follower_id", user.id);
          toast({ title: "Unfollowed" });
          break;
        }
        case "quest_deleted": {
          // Check if within 10-day grace period
          const deletedAt = new Date(action.created_at);
          const daysSince = (Date.now() - deletedAt.getTime()) / (1000 * 60 * 60 * 24);
          if (daysSince > 10) {
            toast({ title: "Grace period expired (10 days)", variant: "destructive" });
            break;
          }
          await supabase.from("quests").update({ is_deleted: false, deleted_at: null }).eq("id", action.target_id);
          toast({ title: t("uiActivityHistoryTab.questRestored") });
          break;
        }
        default:
          toast({ title: t("uiActivityHistoryTab.cannotRevertThisAction"), variant: "destructive" });
      }
      // Remove the activity_log entry itself
      await supabase.from("activity_log").delete().eq("id", action.id);
      qc.invalidateQueries({ queryKey: ["my-activity-history"] });
    } catch {
      toast({ title: t("uiActivityHistoryTab.revertFailed"), variant: "destructive" });
    } finally {
      setReverting(null);
    }
  };

  const meta = (type: string) => ACTION_META[type] || { label: type.replace(/_/g, " "), icon: History, color: "text-muted-foreground" };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-lg font-bold flex items-center gap-2">
          <History className="h-5 w-5 text-primary" /> {t("uiActivityHistoryTab.activityHistory")}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          {t("uiActivityHistoryTab.yourRecentContentActionsYouCan")}
        </p>
      </div>

      {actions.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">{t("uiActivityHistoryTab.noActivityRecordedYet")}</p>
      ) : (
        <div className="space-y-2">
          {actions.map((a: any) => {
            const m = meta(a.action_type);
            const Icon = m.icon;
            const isQuestDelete = a.action_type === "quest_deleted";
            const daysSinceDelete = isQuestDelete ? (Date.now() - new Date(a.created_at).getTime()) / (1000 * 60 * 60 * 24) : 0;
            const graceExpired = isQuestDelete && daysSinceDelete > 10;
            const daysLeft = isQuestDelete ? Math.max(0, Math.ceil(10 - daysSinceDelete)) : 0;
            const canRevert = !!(ACTION_META[a.action_type]?.revertable) && !graceExpired;
            return (
              <div key={a.id} className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
                <Icon className={`h-4 w-4 shrink-0 ${m.color}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {m.label}
                    {a.target_name && (
                      <span className="text-muted-foreground font-normal"> — {a.target_name}</span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(a.created_at).toLocaleString()}
                    {isQuestDelete && !graceExpired && (
                      <span className="ml-2 text-orange-500 font-medium">· {daysLeft}{t("uiActivityHistoryTab.dLeftToRestore")}</span>
                    )}
                    {graceExpired && (
                      <span className="ml-2 text-muted-foreground">· grace period expired</span>
                    )}
                  </p>
                </div>
                {canRevert && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="sm" className="shrink-0 text-destructive hover:text-destructive" disabled={reverting === a.id}>
                        {reverting === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />}
                        <span className="ml-1 text-xs">Undo</span>
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t("uiActivityHistoryTab.undoThisAction")}</AlertDialogTitle>
                        <AlertDialogDescription>
                          {t("uiActivityHistoryTab.thisWillRevert")}{m.label}{t("uiActivityHistoryTab.on")}{a.target_name || t("uiActivityHistoryTab.thisItem")}{t("uiActivityHistoryTab.thisCannotBeUndone")}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t("uiActivityHistoryTab.cancel")}</AlertDialogCancel>
                        <AlertDialogAction onClick={() => revertAction(a)}>{t("uiActivityHistoryTab.confirmUndo")}</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
                {!canRevert && (
                  <Badge variant="outline" className="text-xs shrink-0">Permanent</Badge>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
