import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Loader2, Plus, Search, Shield, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AccessModePicker, type AccessValue } from "@/components/quest/AccessModePicker";
import { GuildConfigModelPanel } from "@/components/guild/GuildConfigModelPanel";
import { useGuildN3, type AccessMode, type MinLevel } from "@/components/quest/questAccess";

interface AdminEntity { entity_type: "GUILD" | "COMPANY"; entity_id: string; name: string }

/**
 * Paramètres de guilde : qui voit ses quêtes par défaut (chaque quête peut s'en écarter), et les entités
 * (autres guildes, organisations) qui l'administrent : leurs admins deviennent admins de la guilde.
 */
export function GuildAccessSettings({ guild }: { guild: any }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [value, setValue] = useState<AccessValue>({
    mode: (guild.quest_access_default ?? "public") as AccessMode,
    minLevel: (guild.quest_access_min_level ?? "N2") as MinLevel,
  });
  const n3 = useGuildN3(guild.id);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    setValue({ mode: (guild.quest_access_default ?? "public") as AccessMode, minLevel: (guild.quest_access_min_level ?? "N2") as MinLevel });
  }, [guild.quest_access_default, guild.quest_access_min_level]);

  const { data: entities = [], refetch } = useQuery({
    queryKey: ["guild-admin-entities", guild.id],
    queryFn: async (): Promise<AdminEntity[]> => {
      const { data } = await (supabase as any).from("guild_admin_entities").select("entity_type, entity_id").eq("guild_id", guild.id);
      const rows = (data ?? []) as { entity_type: "GUILD" | "COMPANY"; entity_id: string }[];
      const gIds = rows.filter((r) => r.entity_type === "GUILD").map((r) => r.entity_id);
      const cIds = rows.filter((r) => r.entity_type === "COMPANY").map((r) => r.entity_id);
      const [g, c] = await Promise.all([
        gIds.length ? supabase.from("guilds").select("id, name").in("id", gIds) : Promise.resolve({ data: [] as any[] }),
        cIds.length ? supabase.from("companies").select("id, name").in("id", cIds) : Promise.resolve({ data: [] as any[] }),
      ]);
      const names = new Map<string, string>([...(g.data ?? []), ...(c.data ?? [])].map((x: any) => [x.id, x.name]));
      return rows.map((r) => ({ ...r, name: names.get(r.entity_id) ?? "?" }));
    },
  });

  const { data: candidates = [] } = useQuery({
    queryKey: ["guild-admin-entity-search", search],
    enabled: search.trim().length >= 2,
    queryFn: async (): Promise<AdminEntity[]> => {
      const q = `%${search.trim()}%`;
      const [g, c] = await Promise.all([
        supabase.from("guilds").select("id, name").ilike("name", q).eq("is_deleted", false).neq("id", guild.id).limit(5),
        supabase.from("companies").select("id, name").ilike("name", q).eq("is_deleted", false).limit(5),
      ]);
      return [
        ...(g.data ?? []).map((x: any) => ({ entity_type: "GUILD" as const, entity_id: x.id, name: x.name })),
        ...(c.data ?? []).map((x: any) => ({ entity_type: "COMPANY" as const, entity_id: x.id, name: x.name })),
      ];
    },
  });

  const save = async () => {
    setSaving(true);
    const { error } = await (supabase as any).rpc("set_guild_quest_access_default", {
      p_guild_id: guild.id, p_mode: value.mode, p_min_level: value.minLevel,
    });
    setSaving(false);
    if (error) { toast.error(t("questAccess.saveFailed"), { description: error.message }); return; }
    toast.success(t("questAccess.saved"));
    qc.invalidateQueries({ queryKey: ["guild-settings", guild.id] });
  };

  const setEntity = async (e: AdminEntity, add: boolean) => {
    const key = `${e.entity_type}:${e.entity_id}`;
    setBusy(key);
    const { error } = await (supabase as any).rpc("set_guild_admin_entity", {
      p_guild_id: guild.id, p_entity_type: e.entity_type, p_entity_id: e.entity_id, p_add: add,
    });
    setBusy(null);
    if (error) { toast.error(t("questAccess.actionFailed"), { description: error.message }); return; }
    if (add) setSearch("");
    refetch();
  };

  const Icon = ({ type }: { type: string }) => (type === "GUILD" ? <Shield className="h-4 w-4 text-muted-foreground" /> : <Building2 className="h-4 w-4 text-muted-foreground" />);

  return (
    <div className="space-y-8 max-w-xl">
      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold">{t("questAccess.guildDefault")}</h2>
          <p className="text-sm text-muted-foreground">{t("questAccess.guildDefaultHint")}</p>
        </div>
        <AccessModePicker value={value} onChange={setValue} guildId={guild.id} n3Summary={n3.summary} disabled={saving} />
        <Button size="sm" onClick={save} disabled={saving}>
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}{t("questAccess.save")}
        </Button>
      </section>

      <GuildConfigModelPanel guild={guild} />

      <section className="space-y-2">
        <h2 className="text-base font-semibold">{t("questAccess.adminEntities")}</h2>
        <p className="text-sm text-muted-foreground">{t("questAccess.adminEntitiesHint")}</p>
        {!!entities.length && (
          <ul className="divide-y divide-border">
            {entities.map((e) => (
              <li key={`${e.entity_type}:${e.entity_id}`} className="flex items-center gap-2 py-2">
                <Icon type={e.entity_type} />
                <span className="text-sm flex-1 truncate">{e.name}</span>
                <span className="text-xs text-muted-foreground">{t(`questAccess.entity.${e.entity_type}`)}</span>
                <Button size="sm" variant="ghost" aria-label={t("questAccess.remove")} disabled={!!busy} onClick={() => setEntity(e, false)}>
                  {busy === `${e.entity_type}:${e.entity_id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("questAccess.addEntity")} className="pl-8" />
        </div>
        {search.trim().length >= 2 && (
          <ul className="divide-y divide-border">
            {candidates.filter((c) => !entities.some((e) => e.entity_id === c.entity_id)).map((c) => (
              <li key={`${c.entity_type}:${c.entity_id}`} className="flex items-center gap-2 py-2">
                <Icon type={c.entity_type} />
                <span className="text-sm flex-1 truncate">{c.name}</span>
                <span className="text-xs text-muted-foreground">{t(`questAccess.entity.${c.entity_type}`)}</span>
                <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => setEntity(c, true)}>
                  {busy === `${c.entity_type}:${c.entity_id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
                  {t("questAccess.add")}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
