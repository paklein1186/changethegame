import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Search, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { AccessModePicker, type AccessValue } from "./AccessModePicker";
import { useMyQuestAccess, type AccessMode } from "./questAccess";

interface Person { id: string; user_id: string; name: string | null; avatar_url: string | null; message?: string | null; note?: string | null; created_at: string }

/**
 * Onglet « Accès » des paramètres d'une quête : qui la voit (membranes de la guilde), demandes d'accès en
 * attente, permissions personnelles accordées (révocables) et ajout d'une personne hors membranes.
 */
export function QuestAccessSettings({ questId }: { questId: string }) {
  const { t } = useTranslation();
  const currentUser = useCurrentUser();
  const qc = useQueryClient();
  const { data: access } = useMyQuestAccess(questId, currentUser.id);
  const [value, setValue] = useState<AccessValue | null>(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const guildId = access?.effective?.guild_id ?? null;
  const { data: guildDefault } = useQuery({
    queryKey: ["guild-quest-access-default", guildId],
    enabled: !!guildId,
    queryFn: async () => {
      const { data } = await (supabase as any).from("guilds").select("name, quest_access_default").eq("id", guildId).maybeSingle();
      return data as { name: string; quest_access_default: AccessMode } | null;
    },
  });

  useEffect(() => {
    if (!access || value) return;
    const mode = (access.access_mode ?? "inherit") as AccessMode;
    setValue({
      mode,
      plans: mode === "inherit" ? [] : access.effective?.plans ?? [],
      roleIds: mode === "inherit" ? [] : access.effective?.role_ids ?? [],
    });
  }, [access, value]);

  const { data: admin, refetch } = useQuery({
    queryKey: ["quest-access-admin", questId],
    enabled: !!access?.is_admin,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("quest_access_admin_view", { p_quest_id: questId });
      if (error) throw error;
      return data as { requests: Person[]; grants: Person[] };
    },
  });

  const { data: people = [] } = useQuery({
    queryKey: ["quest-access-people-search", search],
    enabled: search.trim().length >= 2,
    queryFn: async () => {
      const { data } = await (supabase as any).from("profiles").select("user_id, name, avatar_url")
        .ilike("name", `%${search.trim()}%`).eq("is_agent", false).limit(6);
      return (data ?? []) as { user_id: string; name: string | null; avatar_url: string | null }[];
    },
  });

  const refresh = () => {
    refetch();
    qc.invalidateQueries({ queryKey: ["my-quest-access", questId] });
  };

  const save = async () => {
    if (!value) return;
    if (value.mode === "selected" && !value.plans.length && !value.roleIds.length) {
      toast.error(t("questAccess.pickOne"));
      return;
    }
    setSaving(true);
    const { error } = await (supabase as any).rpc("set_quest_access", {
      p_quest_id: questId, p_mode: value.mode, p_plans: value.plans, p_role_ids: value.roleIds,
    });
    setSaving(false);
    if (error) { toast.error(t("questAccess.saveFailed"), { description: error.message }); return; }
    toast.success(t("questAccess.saved"));
    qc.invalidateQueries({ queryKey: ["my-quest-access", questId] });
    qc.invalidateQueries({ queryKey: ["quest", questId] });
  };

  const run = async (key: string, fn: () => Promise<{ error: any }>, ok: string) => {
    setBusy(key);
    const { error } = await fn();
    setBusy(null);
    if (error) { toast.error(t("questAccess.actionFailed"), { description: error.message }); return; }
    toast.success(ok);
    refresh();
  };

  if (!access) return <Loader2 className="h-5 w-5 animate-spin" />;
  if (!access.is_admin) return <p className="text-sm text-muted-foreground">{t("questAccess.adminsOnly")}</p>;

  const PersonRow = ({ p, children }: { p: { user_id: string; name: string | null; avatar_url: string | null }; children: React.ReactNode }) => (
    <li className="flex items-center gap-3 py-2">
      <Avatar className="h-8 w-8"><AvatarImage src={p.avatar_url ?? undefined} /><AvatarFallback>{(p.name ?? "?").slice(0, 1)}</AvatarFallback></Avatar>
      <div className="min-w-0 flex-1">{children}</div>
    </li>
  );

  return (
    <div className="space-y-8 max-w-xl">
      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold">{t("questAccess.whoSees")}</h2>
          <p className="text-sm text-muted-foreground">{t("questAccess.whoSeesHint")}</p>
        </div>
        {value && (
          <AccessModePicker
            value={value}
            onChange={setValue}
            guildId={guildId}
            allowInherit
            inheritedLabel={guildId && guildDefault
              ? `${t(`questAccess.mode.${guildDefault.quest_access_default}`)} (${guildDefault.name})`
              : t("questAccess.mode.public")}
            disabled={saving}
          />
        )}
        <Button size="sm" onClick={save} disabled={saving || !value}>
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}{t("questAccess.save")}
        </Button>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">{t("questAccess.requests")}</h2>
        {!admin?.requests.length ? (
          <p className="text-sm text-muted-foreground">{t("questAccess.noRequests")}</p>
        ) : (
          <ul className="divide-y divide-border">
            {admin.requests.map((r) => (
              <PersonRow key={r.id} p={r}>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{r.name}</p>
                    {r.message && <p className="text-xs text-muted-foreground">« {r.message} »</p>}
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <Button size="sm" disabled={!!busy} onClick={() => run(r.id, () => (supabase as any).rpc("grant_quest_access", { p_quest_id: questId, p_user_id: r.user_id, p_note: null }), t("questAccess.granted"))}>
                      {busy === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5 mr-1" />}{t("questAccess.accept")}
                    </Button>
                    <Button size="sm" variant="ghost" disabled={!!busy} aria-label={t("questAccess.decline")}
                      onClick={() => run(`d${r.id}`, () => (supabase as any).rpc("decline_quest_access_request", { p_request_id: r.id }), t("questAccess.declined"))}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </PersonRow>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">{t("questAccess.grants")}</h2>
        <p className="text-sm text-muted-foreground">{t("questAccess.grantsHint")}</p>
        {!!admin?.grants.length && (
          <ul className="divide-y divide-border">
            {admin.grants.map((g) => (
              <PersonRow key={g.id} p={g}>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{g.name}</p>
                    <p className="text-xs text-muted-foreground">{t("questAccess.since", { date: new Date(g.created_at).toLocaleDateString() })}</p>
                  </div>
                  <Button size="sm" variant="outline" disabled={!!busy}
                    onClick={() => run(g.id, () => (supabase as any).rpc("revoke_quest_access", { p_grant_id: g.id }), t("questAccess.revoked"))}>
                    {busy === g.id && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}{t("questAccess.revoke")}
                  </Button>
                </div>
              </PersonRow>
            ))}
          </ul>
        )}
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("questAccess.addPerson")} className="pl-8" />
        </div>
        {search.trim().length >= 2 && (
          <ul className="divide-y divide-border">
            {people.filter((p) => p.user_id !== currentUser.id && !admin?.grants.some((g) => g.user_id === p.user_id)).map((p) => (
              <PersonRow key={p.user_id} p={p}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm truncate">{p.name}</p>
                  <Button size="sm" variant="secondary" disabled={!!busy}
                    onClick={() => run(p.user_id, () => (supabase as any).rpc("grant_quest_access", { p_quest_id: questId, p_user_id: p.user_id, p_note: null }), t("questAccess.granted")).then(() => setSearch(""))}>
                    {busy === p.user_id ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <UserPlus className="h-3.5 w-3.5 mr-1" />}
                    {t("questAccess.give")}
                  </Button>
                </div>
              </PersonRow>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
