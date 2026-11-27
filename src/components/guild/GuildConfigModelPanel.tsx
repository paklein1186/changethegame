import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Model = "open" | "membranes" | "cooperative" | "custom";
const MODELS: Model[] = ["open", "membranes", "cooperative", "custom"];
// Radix Select refuse une valeur vide : « aucun niveau » a sa propre valeur.
const NONE = "none";
const SYMBOLIC = new Set(["source"]);

interface RoleRow { id: string; code: string | null; name: string; level: number | null; is_default: boolean; requires_dues: boolean }
interface PlanRow { id: string; code: string; label: string; level: number | null }

/**
 * Modèle de la guilde : un admin choisit comment la configurer (ouverte, membranes, coopérative,
 * personnalisée), puis règle le niveau (N1 à N3 ; N4 et N5 sont réservés à l’équipe de la quête et aux admins) que donne chaque rôle et chaque formule.
 * Appliquer un modèle crée ce qui manque et règle les niveaux ; rien n'est supprimé ni retiré.
 */
export function GuildConfigModelPanel({ guild }: { guild: any }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [model, setModel] = useState<Model>((guild.config_model ?? "custom") as Model);
  const [applying, setApplying] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => { setModel((guild.config_model ?? "custom") as Model); }, [guild.config_model]);

  const { data, refetch } = useQuery({
    queryKey: ["guild-config-levels", guild.id],
    queryFn: async () => {
      const [roles, plans] = await Promise.all([
        (supabase as any).from("entity_roles").select("id, code, name, level, is_default, requires_dues, sort_order")
          .eq("entity_type", "guild").eq("entity_id", guild.id).order("sort_order"),
        (supabase as any).from("guild_membership_plans").select("id, code, label, level, sort_order")
          .eq("guild_id", guild.id).order("sort_order"),
      ]);
      return { roles: (roles.data ?? []) as RoleRow[], plans: (plans.data ?? []) as PlanRow[] };
    },
  });
  const roles = data?.roles ?? [];
  const plans = data?.plans ?? [];

  const refreshAll = () => {
    refetch();
    qc.invalidateQueries({ queryKey: ["guild-membranes", guild.id] });
    qc.invalidateQueries({ queryKey: ["guild-settings", guild.id] });
  };

  const apply = async () => {
    setApplying(true);
    const { error } = await (supabase as any).rpc("apply_guild_config_model", { _guild_id: guild.id, _model: model });
    if (!error && model === "cooperative") {
      // Reprend le préréglage « cercle coopératif » de l'adhésion, sans toucher aux montants.
      await supabase.from("guilds").update({
        membership_style: "cooperative_circle",
        members_only_quests: true,
        members_only_events: true,
        members_only_voting: true,
      } as any).eq("id", guild.id);
    }
    setApplying(false);
    if (error) { toast.error(t("guildModel.applyFailed"), { description: error.message }); return; }
    toast.success(t("guildModel.applied"));
    refreshAll();
  };

  const setLevel = async (table: "entity_roles" | "guild_membership_plans", id: string, v: string) => {
    setBusyId(id);
    const level = v === NONE ? null : Number(v);
    const { error } = await (supabase as any).from(table).update({ level }).eq("id", id);
    setBusyId(null);
    if (error) { toast.error(t("guildModel.levelFailed"), { description: error.message }); return; }
    refreshAll();
  };

  const setDues = async (id: string, v: boolean) => {
    setBusyId(id);
    const { error } = await (supabase as any).from("entity_roles").update({ requires_dues: v }).eq("id", id);
    setBusyId(null);
    if (error) { toast.error(t("guildModel.levelFailed"), { description: error.message }); return; }
    refreshAll();
  };

  const minLevel = Number(String(guild.quest_access_min_level ?? "N2").replace("N", "")) || 2;
  const reaching = [
    ...roles.filter((r) => (r.level ?? 0) >= minLevel).map((r) => r.name),
    ...plans.filter((p) => (p.level ?? 0) >= minLevel).map((p) => p.label),
  ];

  const levelPicker = (table: "entity_roles" | "guild_membership_plans", id: string, level: number | null, label: string) => (
    <Select value={level ? String(level) : NONE} onValueChange={(v) => setLevel(table, id, v)} disabled={busyId === id}>
      <SelectTrigger className="h-8 w-28" aria-label={t("guildModel.levelFor", { name: label })}><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>{t("guildModel.noLevel")}</SelectItem>
        {[1, 2, 3].map((n) => <SelectItem key={n} value={String(n)}>N{n}</SelectItem>)}
      </SelectContent>
    </Select>
  );

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-semibold">{t("guildModel.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("guildModel.hint")}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={model} onValueChange={(v) => setModel(v as Model)}>
          <SelectTrigger className="w-64" aria-label={t("guildModel.title")}><SelectValue /></SelectTrigger>
          <SelectContent>
            {MODELS.map((m) => <SelectItem key={m} value={m}>{t(`guildModel.models.${m}`)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={apply} disabled={applying}>
          {applying && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}{t("guildModel.apply")}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{t(`guildModel.modelHints.${model}`)}</p>

      <div className="grid gap-4 sm:grid-cols-2">
        <fieldset className="space-y-1.5">
          <legend className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">{t("guildModel.roles")}</legend>
          {roles.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 truncate">{r.name}</span>
              {!(r.is_default || (r.code && SYMBOLIC.has(r.code))) && (
                <label className="flex items-center gap-1 text-[11px] text-muted-foreground shrink-0 ml-auto">
                  <input type="checkbox" checked={r.requires_dues} disabled={!!r.code || busyId === r.id}
                    onChange={(e) => setDues(r.id, e.target.checked)} />
                  {t("guildModel.requiresDues")}
                </label>
              )}
              {r.is_default || (r.code && SYMBOLIC.has(r.code))
                ? <span className="text-xs text-muted-foreground">{t("guildModel.symbolic")}</span>
                : levelPicker("entity_roles", r.id, r.level, r.name)}
            </div>
          ))}
        </fieldset>
        <fieldset className="space-y-1.5">
          <legend className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">{t("guildModel.plans")}</legend>
          {plans.length === 0 && <p className="text-xs text-muted-foreground">{t("guildModel.noPlans")}</p>}
          {plans.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 truncate">{p.label}</span>
              {levelPicker("guild_membership_plans", p.id, p.level, p.label)}
            </div>
          ))}
        </fieldset>
      </div>

      <p className="text-sm rounded-md border border-border bg-muted/30 p-2.5">
        {t("guildModel.whoSees", {
          level: `N${minLevel}`,
          list: reaching.length ? reaching.join(", ") : t("guildModel.nobodyExtra"),
        })}
      </p>
    </section>
  );
}
