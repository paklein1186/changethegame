import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { Clock, KeyRound, Loader2, Lock, Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { MyQuestAccess } from "./questAccess";

/**
 * Fiche d'une quête réservée à d'autres membranes de la guilde : titre, image, guilde, résumé et enjeux,
 * et une demande d'accès. Les admins de la quête sont prévenus et accordent (ou non) un accès révocable.
 */
export function QuestTeaser({ quest, access }: { quest: any; access: MyQuestAccess }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  // ?access=request (lien depuis troistiers.space ou un partage) : ouvre directement la demande.
  useEffect(() => {
    if (params.get("access") === "request") {
      if (!access.pending_request) setOpen(true);
      const next = new URLSearchParams(params);
      next.delete("access");
      setParams(next, { replace: true });
    }
  }, [params, setParams, access.pending_request]);

  const refresh = () => qc.invalidateQueries({ queryKey: ["my-quest-access", quest.id] });

  const send = async () => {
    setBusy(true);
    const { data, error } = await (supabase as any).rpc("request_quest_access", { p_quest_id: quest.id, p_message: message.trim() || null });
    setBusy(false);
    if (error) { toast.error(t("questAccess.requestFailed"), { description: error.message }); return; }
    toast.success(data?.updated ? t("questAccess.requestUpdated") : t("questAccess.requestSent"));
    setOpen(false);
    refresh();
  };

  const cancel = async () => {
    setBusy(true);
    const { error } = await (supabase as any).rpc("cancel_quest_access_request", { p_quest_id: quest.id });
    setBusy(false);
    if (error) { toast.error(t("questAccess.actionFailed"), { description: error.message }); return; }
    refresh();
  };

  const guild = quest.guilds;
  return (
    <article className="max-w-2xl mx-auto rounded-xl border border-border bg-card overflow-hidden">
      {quest.cover_image_url && <img src={quest.cover_image_url} alt="" className="w-full h-48 object-cover" />}
      <div className="p-6 space-y-4">
        <div className="space-y-1">
          {guild && (
            <Link to={`/guilds/${guild.id}`} className="text-xs font-medium text-muted-foreground hover:text-foreground">{guild.name}</Link>
          )}
          <h1 className="font-display text-2xl font-bold text-balance">{quest.title}</h1>
        </div>
        {quest.description && <p className="text-sm text-muted-foreground whitespace-pre-line">{quest.description}</p>}
        <div className="flex items-start gap-3 rounded-lg bg-muted/50 p-3">
          <Lock className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
          <p className="text-sm">{t("questAccess.teaserExplain")}</p>
        </div>
        {access.pending_request ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground"><Clock className="h-4 w-4" />{t("questAccess.pending")}</span>
            <Button size="sm" variant="outline" onClick={() => setOpen(true)} disabled={busy}>{t("questAccess.editRequest")}</Button>
            <Button size="sm" variant="ghost" onClick={cancel} disabled={busy}>{t("questAccess.cancelRequest")}</Button>
          </div>
        ) : (
          <Button onClick={() => setOpen(true)} className="gap-1.5"><KeyRound className="h-4 w-4" />{t("questAccess.request")}</Button>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("questAccess.requestTitle")}</DialogTitle>
            <DialogDescription>{t("questAccess.requestDesc", { quest: quest.title })}</DialogDescription>
          </DialogHeader>
          <Textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={1000}
            placeholder={t("questAccess.requestPlaceholder")} className="min-h-[96px] resize-none" />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>{t("questAccess.cancel")}</Button>
            <Button onClick={send} disabled={busy} className="gap-1.5">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}{t("questAccess.send")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </article>
  );
}
