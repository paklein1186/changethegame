import { useTranslation } from "react-i18next";
import { Star } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface QuestStarButtonProps {
  questId: string;
  pinned: boolean;
  /** "entity" updates quests.pinned_at; "user" toggles user_pinned_quests row */
  scope: "entity" | "user";
  userId?: string;
  invalidateKeys?: any[][];
  className?: string;
  disabled?: boolean;
}

export function QuestStarButton({
  questId,
  pinned,
  scope,
  userId,
  invalidateKeys = [],
  className,
  disabled,
}: QuestStarButtonProps) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: async () => {
      if (scope === "entity") {
        const { error } = await supabase
          .from("quests")
          .update({ pinned_at: pinned ? null : new Date().toISOString() })
          .eq("id", questId);
        if (error) throw error;
      } else {
        if (!userId) throw new Error("Not signed in");
        if (pinned) {
          const { error } = await supabase
            .from("user_pinned_quests")
            .delete()
            .eq("user_id", userId)
            .eq("quest_id", questId);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("user_pinned_quests")
            .insert({ user_id: userId, quest_id: questId });
          if (error) throw error;
        }
      }
    },
    onSuccess: () => {
      invalidateKeys.forEach((k) => qc.invalidateQueries({ queryKey: k }));
      toast({ title: pinned ? "Unstarred" : "Starred", duration: 1500 });
    },
    onError: (e: any) => {
      toast({
        title: t("uiQuestStarButton.couldnTUpdateStar"),
        description: e?.message?.includes("max 5") || e?.message?.includes("at most 5") || e?.message?.includes("limit reached")
          ? t("uiQuestStarButton.youCanHighlightAtMost5")
          : e?.message || "Try again",
        variant: "destructive",
      });
    },
  });

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!disabled) mutation.mutate();
      }}
      disabled={disabled || mutation.isPending}
      title={pinned ? "Unstar (highlighted)" : t("uiQuestStarButton.starToHighlightMax5")}
      className={cn(
        "inline-flex items-center justify-center h-7 w-7 rounded-md hover:bg-accent transition-colors shrink-0",
        className
      )}
    >
      <Star
        className={cn(
          "h-4 w-4 transition-colors",
          pinned ? "fill-amber-400 text-amber-500" : "text-muted-foreground hover:text-amber-500"
        )}
      />
    </button>
  );
}
