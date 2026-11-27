import { useTranslation } from "react-i18next";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useAuth } from "@/hooks/useAuth";
import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Save } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

function useEventAccess(eventId: string | undefined) {
  const currentUser = useCurrentUser();
  const { data: event, isLoading } = useQuery({
    queryKey: ["event-detail", eventId],
    queryFn: async () => {
      const { data, error } = await supabase.from("guild_events" as any).select("*").eq("id", eventId).single();
      if (error) throw error;
      return data as any;
    },
    enabled: !!eventId,
  });

  const { data: guildMembership } = useQuery({
    queryKey: ["guild-membership-check", event?.guild_id, currentUser.id],
    queryFn: async () => {
      const { data } = await supabase.from("guild_members").select("role").eq("guild_id", event.guild_id).eq("user_id", currentUser.id).maybeSingle();
      return data;
    },
    enabled: !!event?.guild_id && !!currentUser.id,
  });

  const { data: userRoles = [] } = useQuery({
    queryKey: ["user-roles", currentUser.id],
    queryFn: async () => {
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", currentUser.id);
      return data ?? [];
    },
    enabled: !!currentUser.id,
  });

  const isSuperAdmin = userRoles.some((r: any) => r.role === "superadmin");
  const isHost = event?.created_by_user_id === currentUser.id;
  const isGuildAdmin = guildMembership?.role === "ADMIN";
  const canManage = isHost || isGuildAdmin || isSuperAdmin;

  return { event, isLoading, canManage };
}

export { useEventAccess };

export default function EventEdit() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { session } = useAuth();
  const { event, isLoading, canManage } = useEventAccess(id);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [locationType, setLocationType] = useState("ONLINE");
  const [locationText, setLocationText] = useState("");
  const [callUrl, setCallUrl] = useState("");
  const [maxAttendees, setMaxAttendees] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (event) {
      setTitle(event.title || "");
      setDescription(event.description || "");
      setStartAt(event.start_at ? format(new Date(event.start_at), "yyyy-MM-dd'T'HH:mm") : "");
      setEndAt(event.end_at ? format(new Date(event.end_at), "yyyy-MM-dd'T'HH:mm") : "");
      setLocationType(event.location_type || "ONLINE");
      setLocationText(event.location_text || "");
      setCallUrl(event.call_url || "");
      setMaxAttendees(event.max_attendees ? String(event.max_attendees) : "");
    }
  }, [event]);

  if (isLoading) return <PageShell><p>{t("uiEventEdit.loading")}</p></PageShell>;
  if (!event) return <PageShell><p>{t("uiEventEdit.eventNotFound")}</p></PageShell>;
  if (!canManage) {
    return (
      <PageShell>
        <div className="text-center py-16">
          <h2 className="text-xl font-bold mb-2">Access Denied</h2>
          <p className="text-muted-foreground mb-4">{t("uiEventEdit.youDonTHavePermissionTo")}</p>
          <Button asChild><Link to={`/events/${id}`}>{t("uiEventEdit.backToEvent")}</Link></Button>
        </div>
      </PageShell>
    );
  }

  const isCancelled = event.is_cancelled || event.status === "CANCELLED";
  const isCompleted = event.status === "COMPLETED";
  const readOnly = isCancelled || isCompleted;

  const handleSave = async () => {
    if (!title.trim()) { toast.error(t("uiEventEdit.titleIsRequired")); return; }
    if (!startAt) { toast.error(t("uiEventEdit.startDateIsRequired")); return; }

    setSaving(true);
    const { error } = await supabase
      .from("guild_events" as any)
      .update({
        title: title.trim(),
        description: description.trim() || null,
        start_at: new Date(startAt).toISOString(),
        end_at: endAt ? new Date(endAt).toISOString() : null,
        location_type: locationType,
        location_text: locationText.trim() || null,
        call_url: callUrl.trim() || null,
        max_attendees: maxAttendees ? parseInt(maxAttendees) : null,
      } as any)
      .eq("id", id);
    setSaving(false);

    if (error) { toast.error("Failed to save: " + error.message); return; }
    toast.success(t("uiEventEdit.eventUpdated"));
    navigate(`/events/${id}`);
  };

  return (
    <PageShell>
      <Button variant="ghost" size="sm" asChild className="mb-4">
        <Link to={`/events/${id}`}><ArrowLeft className="h-4 w-4 mr-1" /> {t("uiEventEdit.backToEvent")}</Link>
      </Button>

      <div className="max-w-2xl space-y-6">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-2xl font-bold">{t("uiEventEdit.editEvent")}</h1>
          {isCancelled && <Badge variant="destructive">{t("uiEventEdit.cancelled")}</Badge>}
          {isCompleted && <Badge variant="secondary">{t("uiEventEdit.completed")}</Badge>}
        </div>

        {readOnly && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {t("uiEventEdit.thisEventIs")} {isCancelled ? "cancelled" : "completed"}{t("uiEventEdit.someFieldsCannotBeChanged")}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <Label>{t("uiEventEdit.title")}</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} disabled={readOnly} placeholder={t("uiEventEdit.eventTitle")} />
          </div>

          <div>
            <Label>{t("uiEventEdit.description")}</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} disabled={readOnly} placeholder={t("uiEventEdit.describeTheEvent")} className="min-h-[120px]" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>{t("uiEventEdit.startDateTime")}</Label>
              <Input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} disabled={readOnly} />
            </div>
            <div>
              <Label>{t("uiEventEdit.endDateTime")}</Label>
              <Input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} disabled={readOnly} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Location type</Label>
              <Select value={locationType} onValueChange={setLocationType} disabled={readOnly}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ONLINE">Online</SelectItem>
                  <SelectItem value="OFFLINE">Offline</SelectItem>
                  <SelectItem value="HYBRID">Hybrid</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Max participants</Label>
              <Input type="number" min={1} value={maxAttendees} onChange={(e) => setMaxAttendees(e.target.value)} disabled={readOnly} placeholder="Unlimited" />
            </div>
          </div>

          <div>
            <Label>Location / Address</Label>
            <Input value={locationText} onChange={(e) => setLocationText(e.target.value)} disabled={readOnly} placeholder={t("uiEventEdit.venueAddressOrInstructions")} />
          </div>

          <div>
            <Label>Call / Meeting URL</Label>
            <Input value={callUrl} onChange={(e) => setCallUrl(e.target.value)} disabled={readOnly} placeholder="https://…" />
          </div>
        </div>

        <div className="flex gap-3 pt-4 border-t border-border">
          <Button onClick={handleSave} disabled={saving || readOnly}>
            <Save className="h-4 w-4 mr-1" /> {saving ? "Saving…" : t("uiEventEdit.saveChanges")}
          </Button>
          <Button variant="ghost" asChild><Link to={`/events/${id}`}>{t("uiEventEdit.cancel")}</Link></Button>
        </div>
      </div>
    </PageShell>
  );
}
