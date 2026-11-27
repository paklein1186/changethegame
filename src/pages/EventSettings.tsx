import { useTranslation } from "react-i18next";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEventAccess } from "@/pages/EventEdit";
import { PageShell } from "@/components/PageShell";
import { FrenchTextOverlay } from "@/components/onboarding/FrenchTextOverlay";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, Save, Trash2, XCircle, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export default function EventSettings() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { event, isLoading, canManage } = useEventAccess(id);

  // Registrations count for safety checks
  const { data: registrations = [] } = useQuery({
    queryKey: ["event-registrations", id],
    queryFn: async () => {
      const { data } = await supabase.from("guild_event_attendees" as any).select("id, status, payment_status").eq("event_id", id);
      return (data || []) as any[];
    },
    enabled: !!id,
  });

  const [visibility, setVisibility] = useState("PUBLIC");
  const [acceptanceMode, setAcceptanceMode] = useState("AUTO");
  const [isPaid, setIsPaid] = useState(false);
  const [pricePerTicket, setPricePerTicket] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [saving, setSaving] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  useEffect(() => {
    if (event) {
      setVisibility(event.visibility || "PUBLIC");
      setAcceptanceMode(event.acceptance_mode || "AUTO");
      setIsPaid(!!event.is_paid);
      setPricePerTicket(event.price_per_ticket ? String(event.price_per_ticket) : "");
      setCurrency(event.currency || "EUR");
    }
  }, [event]);

  if (isLoading) return <PageShell><FrenchTextOverlay><p>{t("uiEventSettings.loading")}</p></FrenchTextOverlay></PageShell>;
  if (!event) return <PageShell><FrenchTextOverlay><p>{t("uiEventSettings.eventNotFound")}</p></FrenchTextOverlay></PageShell>;
  if (!canManage) {
    return (
      <PageShell><FrenchTextOverlay>
        <div className="text-center py-16">
          <h2 className="text-xl font-bold mb-2">Access Denied</h2>
          <p className="text-muted-foreground mb-4">{t("uiEventSettings.youDonTHavePermissionTo")}</p>
          <Button asChild><Link to={`/events/${id}`}>{t("uiEventSettings.backToEvent")}</Link></Button>
        </div>
      </FrenchTextOverlay></PageShell>
    );
  }

  const isCancelled = event.is_cancelled || event.status === "CANCELLED";
  const hasPaidRegistrations = registrations.some((r: any) => r.payment_status === "PAID");
  const hasAnyRegistrations = registrations.length > 0;
  const canDelete = event.status === "DRAFT" && !hasAnyRegistrations;

  const handleSave = async () => {
    setSaving(true);
    const updates: any = {
      visibility,
      acceptance_mode: acceptanceMode,
      is_paid: isPaid,
    };
    if (isPaid) {
      updates.price_per_ticket = parseFloat(pricePerTicket) || 0;
      updates.currency = currency;
    } else {
      updates.price_per_ticket = null;
      updates.currency = null;
    }

    const { error } = await supabase.from("guild_events" as any).update(updates).eq("id", id);
    setSaving(false);
    if (error) { toast.error("Failed to save: " + error.message); return; }
    toast.success(t("uiEventSettings.settingsSaved"));
    qc.invalidateQueries({ queryKey: ["event-detail", id] });
  };

  const cancelEvent = async () => {
    await supabase.from("guild_events" as any).update({ is_cancelled: true, status: "CANCELLED" } as any).eq("id", id);
    // Mark all non-cancelled registrations
    const activeRegs = registrations.filter((r: any) => r.status !== "CANCELLED" && r.status !== "REFUNDED");
    for (const reg of activeRegs) {
      const update: any = { status: "CANCELLED", cancelled_at: new Date().toISOString() };
      if (reg.payment_status === "PAID") {
        update.status = "REFUNDED";
        update.payment_status = "REFUND_PENDING";
        update.refunded_at = new Date().toISOString();
      }
      await supabase.from("guild_event_attendees" as any).update(update).eq("id", reg.id);
    }
    setCancelDialogOpen(false);
    toast.success(t("uiEventSettings.eventCancelledParticipantsWillBeNotified"));
    qc.invalidateQueries({ queryKey: ["event-detail", id] });
    navigate(`/events/${id}`);
  };

  const deleteEvent = async () => {
    const { error } = await supabase.from("guild_events" as any).delete().eq("id", id);
    if (error) { toast.error(t("uiEventSettings.failedToDeleteEvent")); return; }
    setDeleteDialogOpen(false);
    toast.success(t("uiEventSettings.eventDeleted"));
    navigate(event.guild_id ? `/guilds/${event.guild_id}` : "/calendar");
  };

  return (
    <PageShell><FrenchTextOverlay>
      <Button variant="ghost" size="sm" asChild className="mb-4">
        <Link to={`/events/${id}`}><ArrowLeft className="h-4 w-4 mr-1" /> {t("uiEventSettings.backToEvent")}</Link>
      </Button>

      <div className="max-w-2xl space-y-8">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-2xl font-bold">{t("uiEventSettings.eventSettings")}</h1>
          {isCancelled && <Badge variant="destructive">{t("uiEventSettings.cancelled")}</Badge>}
        </div>

        {/* Visibility */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Visibility</h2>
          <div>
            <Label>{t("uiEventSettings.whoCanSeeThisEvent")}</Label>
            <Select value={visibility} onValueChange={setVisibility} disabled={isCancelled}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="PUBLIC">{t("uiEventSettings.publicAnyone")}</SelectItem>
                <SelectItem value="FOLLOWERS">{t("uiEventSettings.followersOnlyFollowersOfTheHost")}</SelectItem>
                <SelectItem value="INTERNAL">{t("uiEventSettings.internalOnlyGuildMembersParticipants")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </section>

        <Separator />

        {/* Participation Mode */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Participation Mode</h2>
          <div>
            <Label>{t("uiEventSettings.howAreParticipantsAccepted")}</Label>
            <Select value={acceptanceMode} onValueChange={setAcceptanceMode} disabled={isCancelled}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="AUTO">Automatic — First-come, first-served</SelectItem>
                <SelectItem value="MANUAL">{t("uiEventSettings.manualHostReviewsAndAccepts")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </section>

        <Separator />

        {/* Ticketing & Payment */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Ticketing & Payment</h2>
          <div className="flex items-center gap-3">
            <Switch
              checked={isPaid}
              onCheckedChange={setIsPaid}
              disabled={isCancelled || hasPaidRegistrations}
            />
            <Label>{t("uiEventSettings.thisIsAPaidEvent")}</Label>
          </div>
          {hasPaidRegistrations && isPaid && (
            <p className="text-xs text-amber-600 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> {t("uiEventSettings.ticketPriceCannotBeChangedAfter")}
            </p>
          )}
          {isPaid && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Ticket price</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={pricePerTicket}
                  onChange={(e) => setPricePerTicket(e.target.value)}
                  disabled={isCancelled || hasPaidRegistrations}
                  placeholder="0.00"
                />
              </div>
              <div>
                <Label>Currency</Label>
                <Select value={currency} onValueChange={setCurrency} disabled={isCancelled || hasPaidRegistrations}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EUR">EUR (€)</SelectItem>
                    <SelectItem value="USD">USD ($)</SelectItem>
                    <SelectItem value="GBP">GBP (£)</SelectItem>
                    <SelectItem value="CHF">CHF</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </section>

        {/* Save button */}
        {!isCancelled && (
          <div className="flex gap-3 pt-2">
            <Button onClick={handleSave} disabled={saving}>
              <Save className="h-4 w-4 mr-1" /> {saving ? "Saving…" : t("uiEventSettings.saveSettings")}
            </Button>
          </div>
        )}

        <Separator />

        {/* Danger Zone */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-destructive">Danger Zone</h2>
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-4">
            {!isCancelled && (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{t("uiEventSettings.cancelEvent")}</p>
                  <p className="text-xs text-muted-foreground">{t("uiEventSettings.allParticipantsWillBeNotifiedRefunds")}</p>
                </div>
                <Button variant="destructive" size="sm" onClick={() => setCancelDialogOpen(true)}>
                  <XCircle className="h-4 w-4 mr-1" /> {t("uiEventSettings.cancelEvent2")}
                </Button>
              </div>
            )}
            {canDelete && (
              <>
                {!isCancelled && <Separator className="bg-destructive/20" />}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{t("uiEventSettings.deleteEvent")}</p>
                    <p className="text-xs text-muted-foreground">{t("uiEventSettings.permanentlyRemoveThisDraftEventThis")}</p>
                  </div>
                  <Button variant="destructive" size="sm" onClick={() => setDeleteDialogOpen(true)}>
                    <Trash2 className="h-4 w-4 mr-1" /> {t("uiEventSettings.deleteEvent2")}
                  </Button>
                </div>
              </>
            )}
            {isCancelled && !canDelete && (
              <p className="text-sm text-muted-foreground">{t("uiEventSettings.thisEventHasBeenCancelled")}</p>
            )}
          </div>
        </section>
      </div>

      {/* Cancel confirmation */}
      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("uiEventSettings.cancelThisEvent")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("uiEventSettings.allParticipantsWillBeNotifiedFor")}
              {hasPaidRegistrations && (
                <span className="block mt-2 font-medium text-destructive">
                  {registrations.filter((r: any) => r.payment_status === "PAID").length} {t("uiEventSettings.paidRegistrationSWillBeMarked")}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("uiEventSettings.keepEvent")}</AlertDialogCancel>
            <AlertDialogAction onClick={cancelEvent} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t("uiEventSettings.cancelEvent2")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("uiEventSettings.deleteThisEventPermanently")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("uiEventSettings.thisActionCannotBeUndoneThe")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("uiEventSettings.keepEvent")}</AlertDialogCancel>
            <AlertDialogAction onClick={deleteEvent} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t("uiEventSettings.deletePermanently")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </FrenchTextOverlay></PageShell>
  );
}
