import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Save, Euro } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

/**
 * Réglage « Cotisation en euros (Stripe) » d'une guilde : activation, compte Stripe,
 * et formules par profil. Les montants sont saisis en euros et stockés en centimes.
 * Les secrets Stripe ne sont jamais saisis ici : seule la référence du compte l'est
 * (STRIPE_SECRET_KEY_<ref> côté serveur).
 */

interface PlanRow {
  id?: string;
  code: string;
  label: string;
  billing_interval: "month" | "year";
  base: string;
  perPerson: string;
  perSmallPlace: string;
  perLargePlace: string;
  active: boolean;
  sort_order: number;
  description: string;
  benefits: string; // une ligne par avantage
  isNew?: boolean;
}

const toEuros = (cents: number | null | undefined) => (cents ? String(cents / 100) : "0");
const toCents = (value: string) => {
  const n = Number(String(value).replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : NaN;
};
const slug = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 60);

/** Modèle tiré de l'expérience de Trois-Tiers (réseau de tiers-lieux), à adapter. */
const IA = "Usage de base des assistants IA inclus";
const MODELE_RESEAU: Omit<PlanRow, "sort_order">[] = [
  { code: "citoyen", label: "Citoyen soutenant", billing_interval: "year", base: "60", perPerson: "0", perSmallPlace: "0", perLargePlace: "0", active: true,
    description: "Pour les habitants et curieux qui soutiennent l'émergence des lieux sans en porter un.",
    benefits: ["Accès au commun : bibliothèque, savoirs, outils", "Communauté apprenante et suivi des missions", "Groupes de travail, accueilli par leur lead", IA].join("\n") },
  { code: "accompagnant_freelance", label: "Accompagnant freelance", billing_interval: "year", base: "100", perPerson: "0", perSmallPlace: "0", perLargePlace: "0", active: true,
    description: "Pour les professionnels indépendants qui accompagnent des lieux.",
    benefits: ["Accès complet au commun et à la capitalisation des missions", "Missions facturées via le réseau, ventilées par rôle", "Dossier de mission ouvert le temps de chaque mission", "Peut lancer et animer un groupe de travail", IA].join("\n") },
  { code: "accompagnant_organisation", label: "Organisation d'accompagnement", billing_interval: "year", base: "100", perPerson: "50", perSmallPlace: "0", perLargePlace: "0", active: true,
    description: "Pour les structures dont plusieurs personnes accompagnent des lieux. La structure paie, chaque personne a son accès.",
    benefits: ["Tout ce qu'ouvre la formule accompagnant, pour chaque personne", "Accès nominatifs pour l'équipe", "Visibilité de la structure dans le réseau", IA].join("\n") },
  { code: "partenaire_allie", label: "Partenaire allié", billing_interval: "year", base: "350", perPerson: "0", perSmallPlace: "0", perLargePlace: "0", active: true,
    description: "Pour les structures qui font le même métier ou un métier complémentaire, et montent des consortiums avec le réseau.",
    benefits: ["Consortiums et co-candidatures (dont européennes)", "Données de son territoire", "Accès aux projets co-portés, le temps du projet", "Siège consultatif à l'organe d'administration", IA].join("\n") },
  { code: "partenaire_beneficiaire", label: "Partenaire bénéficiaire", billing_interval: "year", base: "350", perPerson: "0", perSmallPlace: "60", perLargePlace: "100", active: true,
    description: "Pour les communes, GAL et institutions qui suivent les lieux de leur territoire.",
    benefits: ["Exploration de l'écosystème dans le commun", "Suivi des lieux de son bassin et données comparées", "Peut porter l'adhésion des lieux de son territoire", "Prestations sur demande (autodiagnostic, formation), payées à part", IA].join("\n") },
  { code: "lieu_moins_20", label: "Lieu (moins de 20 usagers)", billing_interval: "year", base: "60", perPerson: "0", perSmallPlace: "0", perLargePlace: "0", active: true,
    description: "Pour les tiers-lieux existants ou en projet, de moins de 20 usagers réguliers par semaine.",
    benefits: ["Pairs, expéditions et visites", "Mise en relation besoins et ressources", "Visibilité dans « Lieux à soutenir »", "Accès au commun", IA].join("\n") },
  { code: "lieu_20_et_plus", label: "Lieu (20 usagers ou plus)", billing_interval: "year", base: "100", perPerson: "0", perSmallPlace: "0", perLargePlace: "0", active: true,
    description: "Pour les tiers-lieux de 20 usagers réguliers ou plus par semaine.",
    benefits: ["Pairs, expéditions et visites", "Mise en relation besoins et ressources", "Visibilité dans « Lieux à soutenir »", "Accès au commun", IA].join("\n") },
];

export function GuildEuroPlansSettings({ guild, guildId }: { guild: any; guildId: string }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [enabled, setEnabled] = useState<boolean>(Boolean(guild?.euro_membership_enabled));
  const [accountRef, setAccountRef] = useState<string>(guild?.stripe_account_ref ?? "GUILD");
  const [rows, setRows] = useState<PlanRow[]>([]);
  const [saving, setSaving] = useState(false);

  const { data: plans, isLoading } = useQuery({
    queryKey: ["guild-membership-plans-admin", guildId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("guild_membership_plans" as any)
        .select("*")
        .eq("guild_id", guildId)
        .order("sort_order");
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });

  useEffect(() => {
    if (!plans) return;
    setRows(
      plans.map((p: any) => ({
        id: p.id,
        code: p.code,
        label: p.label,
        billing_interval: p.billing_interval,
        base: toEuros(p.base_amount_cents),
        perPerson: toEuros(p.per_extra_person_cents),
        perSmallPlace: toEuros(p.per_small_place_cents),
        perLargePlace: toEuros(p.per_large_place_cents),
        active: p.active,
        sort_order: p.sort_order,
        description: p.description ?? "",
        benefits: (p.benefits ?? []).join("\n"),
      })),
    );
  }, [plans]);

  const update = (i: number, patch: Partial<PlanRow>) =>
    setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)));

  const addRow = () =>
    setRows((r) => [
      ...r,
      { code: "", label: "", billing_interval: "year", base: "0", perPerson: "0", perSmallPlace: "0", perLargePlace: "0", active: true, sort_order: (r.length + 1) * 10, description: "", benefits: "", isNew: true },
    ]);

  // Ajoute les formules manquantes du modèle et remplit description et avantages vides des formules existantes.
  const loadModel = () =>
    setRows((r) => [
      ...r.map((x) => {
        const m = MODELE_RESEAU.find((y) => y.code === x.code);
        return m ? { ...x, description: x.description || m.description, benefits: x.benefits || m.benefits } : x;
      }),
      ...MODELE_RESEAU.filter((m) => !r.some((x) => x.code === m.code)).map((m, i) => ({ ...m, sort_order: (r.length + i + 1) * 10, isNew: true })),
    ]);

  const save = async () => {
    if (!/^[A-Z0-9_]{1,40}$/.test(accountRef)) {
      toast({ title: "Référence du compte Stripe invalide", description: "Majuscules, chiffres et _ uniquement (ex. GUILD).", variant: "destructive" });
      return;
    }
    const payload = [];
    for (const row of rows) {
      const code = row.code || slug(row.label);
      const cents = [row.base, row.perPerson, row.perSmallPlace, row.perLargePlace].map(toCents);
      if (!row.label.trim() || !code) {
        toast({ title: "Chaque formule doit avoir un nom", variant: "destructive" });
        return;
      }
      if (cents.some((c) => Number.isNaN(c))) {
        toast({ title: `Montant invalide dans « ${row.label} »`, description: "Utilisez des nombres positifs, ex. 60 ou 12,50.", variant: "destructive" });
        return;
      }
      payload.push({
        guild_id: guildId,
        code,
        label: row.label.trim(),
        billing_interval: row.billing_interval,
        base_amount_cents: cents[0],
        per_extra_person_cents: cents[1],
        per_small_place_cents: cents[2],
        per_large_place_cents: cents[3],
        active: row.active,
        sort_order: row.sort_order,
        description: row.description.trim() || null,
        benefits: row.benefits.split("\n").map((b) => b.trim()).filter(Boolean),
      });
    }
    if (enabled && !payload.some((p) => p.active && p.base_amount_cents + p.per_extra_person_cents + p.per_small_place_cents + p.per_large_place_cents > 0)) {
      toast({ title: "Ajoutez au moins une formule active avec un montant", variant: "destructive" });
      return;
    }

    setSaving(true);
    const { error: gErr } = await supabase
      .from("guilds")
      .update({ euro_membership_enabled: enabled, stripe_account_ref: accountRef } as any)
      .eq("id", guildId);
    let pErr = null;
    if (!gErr && payload.length) {
      const r = await supabase.from("guild_membership_plans" as any).upsert(payload as any, { onConflict: "guild_id,code" });
      pErr = r.error;
    }
    setSaving(false);
    if (gErr || pErr) {
      toast({ title: "Enregistrement impossible", description: (gErr ?? pErr)?.message, variant: "destructive" });
      return;
    }
    toast({ title: "Cotisation en euros enregistrée" });
    qc.invalidateQueries({ queryKey: ["guild-membership-plans-admin", guildId] });
    qc.invalidateQueries({ queryKey: ["guild-membership-plans", guildId] });
    qc.invalidateQueries({ queryKey: ["guild", guildId] });
  };

  const money = (i: number, field: "base" | "perPerson" | "perSmallPlace" | "perLargePlace", label: string) => (
    <div className="space-y-1">
      <Label htmlFor={`${field}-${i}`} className="text-[11px] text-muted-foreground">{label}</Label>
      <Input id={`${field}-${i}`} inputMode="decimal" value={rows[i][field]} onChange={(e) => update(i, { [field]: e.target.value } as any)} />
    </div>
  );

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-5 mt-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold flex items-center gap-2"><Euro className="h-4 w-4" /> Cotisation en euros (Stripe)</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Les membres paient en euros sur le compte Stripe de la guilde, avec une formule par profil.
            Une fois activée, elle remplace la cotisation en Coins sur la page de la guilde.
            Rejoindre la guilde sans cotiser donne le statut d'observateur.
          </p>
        </div>
        <Switch checked={enabled} onCheckedChange={setEnabled} aria-label="Activer la cotisation en euros" />
      </div>

      <div className="space-y-1 max-w-xs">
        <Label htmlFor="stripe-ref" className="text-xs">Référence du compte Stripe</Label>
        <Input id="stripe-ref" value={accountRef} onChange={(e) => setAccountRef(e.target.value.toUpperCase())} />
        <p className="text-[11px] text-muted-foreground">Correspond aux secrets serveur STRIPE_SECRET_KEY_{accountRef || "…"} et STRIPE_WEBHOOK_SECRET_{accountRef || "…"}.</p>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-sm font-medium">Formules</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={loadModel}>Compléter avec le modèle « réseau de tiers-lieux »</Button>
            <Button variant="outline" size="sm" onClick={addRow}><Plus className="h-3.5 w-3.5 mr-1" /> Ajouter une formule</Button>
          </div>
        </div>

        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune formule pour l'instant.</p>
        ) : (
          rows.map((row, i) => (
            <div key={row.id ?? `new-${i}`} className="rounded-lg border border-border p-3 space-y-3">
              <div className="flex gap-3 items-end flex-wrap">
                <div className="space-y-1 flex-1 min-w-[180px]">
                  <Label htmlFor={`label-${i}`} className="text-[11px] text-muted-foreground">Nom de la formule</Label>
                  <Input id={`label-${i}`} value={row.label} onChange={(e) => update(i, { label: e.target.value, ...(row.isNew ? { code: slug(e.target.value) } : {}) })} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`interval-${i}`} className="text-[11px] text-muted-foreground">Périodicité</Label>
                  <select
                    id={`interval-${i}`}
                    className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={row.billing_interval}
                    onChange={(e) => update(i, { billing_interval: e.target.value as "month" | "year" })}
                  >
                    <option value="year">{t("uiGuildEuroPlansSettings.parAn")}</option>
                    <option value="month">Par mois</option>
                  </select>
                </div>
                <label className="flex items-center gap-2 text-sm pb-2">
                  <Switch checked={row.active} onCheckedChange={(v) => update(i, { active: v })} /> Proposée
                </label>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {money(i, "base", "Montant de base (€)")}
                {money(i, "perPerson", "Par personne en plus (€)")}
                {money(i, "perSmallPlace", "Par lieu < 20 usagers (€)")}
                {money(i, "perLargePlace", "Par lieu ≥ 20 usagers (€)")}
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor={`desc-${i}`} className="text-[11px] text-muted-foreground">Pour qui (description)</Label>
                  <Textarea id={`desc-${i}`} rows={3} value={row.description} onChange={(e) => update(i, { description: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`benef-${i}`} className="text-[11px] text-muted-foreground">Avantages et accès (un par ligne)</Label>
                  <Textarea id={`benef-${i}`} rows={3} value={row.benefits} onChange={(e) => update(i, { benefits: e.target.value })} />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">Identifiant : {row.code || slug(row.label) || "—"} (stable, ne change plus après l'enregistrement)</p>
            </div>
          ))
        )}
      </div>

      <Button onClick={save} disabled={saving} className="w-full">
        {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
        Enregistrer la cotisation en euros
      </Button>
    </section>
  );
}
