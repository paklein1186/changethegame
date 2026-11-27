import { useTranslation } from "react-i18next";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, CreditCard, CalendarClock, Check, ExternalLink, Settings2, AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useGuildMembership } from "@/hooks/useGuildMembership";
import { useNavigate } from "react-router-dom";

/**
 * Cotisation de guilde en euros (Stripe), pour les guildes qui ont activé
 * `euro_membership_enabled`. Remplace la carte d'adhésion en Coins.
 * Au retour de Stripe (?adhesion=ok&session_id=…), confirme le paiement
 * auprès de guild-euro-confirm, sans attendre le webhook.
 */

interface Plan {
  code: string;
  label: string;
  billing_interval: "month" | "year";
  base_amount_cents: number;
  per_extra_person_cents: number;
  per_small_place_cents: number;
  per_large_place_cents: number;
  description?: string | null;
  benefits?: string[] | null;
}

const euros = (cents: number) =>
  (cents / 100).toLocaleString("fr-BE", { style: "currency", currency: "EUR", maximumFractionDigits: 2 });

export function GuildEuroMembershipCard({ guild }: { guild: any }) {
  const { t } = useTranslation();
  const { session } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { membership, application, refresh } = useGuildMembership(guild.id);
  const [planCode, setPlanCode] = useState<string>("");
  const [extraPersons, setExtraPersons] = useState(0);
  const [smallPlaces, setSmallPlaces] = useState(0);
  const [largePlaces, setLargePlaces] = useState(0);
  const [busy, setBusy] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [portalBusy, setPortalBusy] = useState(false);
  const [highlight, setHighlight] = useState(false);
  const confirmed = useRef(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // Lien « Gérer ma cotisation » de l'e-mail de rappel (?cotisation=gerer) : on amène la carte à l'écran.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("cotisation") !== "gerer") return;
    setHighlight(true);
    cardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    params.delete("cotisation");
    const rest = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${rest ? `?${rest}` : ""}`);
    const t = window.setTimeout(() => setHighlight(false), 4000);
    return () => window.clearTimeout(t);
  }, []);

  const { data: plans = [] } = useQuery({
    queryKey: ["guild-membership-plans", guild.id],
    queryFn: async (): Promise<Plan[]> => {
      const { data } = await supabase
        .from("guild_membership_plans" as any)
        .select("code, label, billing_interval, base_amount_cents, per_extra_person_cents, per_small_place_cents, per_large_place_cents, description, benefits")
        .eq("guild_id", guild.id)
        .eq("active", true)
        .order("sort_order");
      return ((data as any) ?? []) as Plan[];
    },
  });

  // Retour de Stripe : on confirme le paiement une seule fois, puis on nettoie l'adresse.
  useEffect(() => {
    if (confirmed.current || !session) return;
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");
    const outcome = params.get("adhesion");
    if (outcome === "annulee") {
      toast({ title: "Paiement annulé", description: "Aucun montant n'a été débité." });
    }
    if (outcome !== "ok" || !sessionId) return;
    confirmed.current = true;
    (async () => {
      const { data, error } = await supabase.functions.invoke("guild-euro-confirm", {
        body: { guild_id: guild.id, session_id: sessionId },
      });
      if (error || (data as any)?.error) {
        toast({ title: "Paiement reçu, confirmation en attente", description: "Rechargez la page dans un instant.", variant: "destructive" });
      } else if ((data as any)?.pending) {
        toast({ title: "Paiement en cours de validation", description: "Votre adhésion sera activée dès sa confirmation." });
      } else {
        toast({ title: "Adhésion activée", description: "Merci ! Votre badge Adhérent est actif." });
        refresh();
      }
      params.delete("session_id");
      params.delete("adhesion");
      const rest = params.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${rest ? `?${rest}` : ""}`);
    })();
  }, [session, guild.id, toast, refresh]);

  const plan = plans.find((p) => p.code === planCode) ?? null;
  const total = plan
    ? plan.base_amount_cents +
      plan.per_extra_person_cents * extraPersons +
      plan.per_small_place_cents * smallPlaces +
      plan.per_large_place_cents * largePlaces
    : 0;

  const end = membership?.current_period_end ?? membership?.membership_expires_at;
  const active = membership?.role === "member" && membership?.status === "active" && (!end || new Date(end) > new Date());
  // Seul le payeur a un client Stripe ; un bénéficiaire de code n'a rien à gérer.
  const isPayer = !!membership?.stripe_customer_id && membership?.payer_user_id === session?.user?.id;
  const pastDue = isPayer && membership?.role === "member" && membership?.status === "past_due";
  const needsApproval = guild.requires_application_before_payment || guild.join_policy === "APPROVAL_REQUIRED";
  const isCreator = guild.created_by_user_id === session?.user?.id;
  const blocked = needsApproval && application?.status !== "APPROVED" && !isCreator;

  const pay = async () => {
    if (!plan) return;
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("guild-euro-checkout", {
      body: {
        guild_id: guild.id,
        plan_code: plan.code,
        extra_persons: extraPersons,
        small_places: smallPlaces,
        large_places: largePlaces,
        return_url: window.location.href.split("?")[0],
      },
    });
    const url = (data as any)?.url;
    if (error || !url) {
      setBusy(false);
      toast({ title: "Le paiement n'a pas pu démarrer", description: (data as any)?.error ?? "Réessayez dans un instant.", variant: "destructive" });
      return;
    }
    openCheckout(url);
  };

  const openPortal = async () => {
    setPortalBusy(true);
    const { data, error } = await supabase.functions.invoke("guild-euro-portal", {
      body: { guild_id: guild.id, return_url: window.location.href.split("?")[0] },
    });
    const url = (data as any)?.url;
    if (error || !url) {
      setPortalBusy(false);
      toast({
        title: "Impossible d'ouvrir la gestion de la cotisation",
        description: (data as any)?.error ?? "Réessayez dans un instant, ou contactez la guilde.",
        variant: "destructive",
      });
      return;
    }
    openCheckout(url);
    setPortalBusy(false);
  };

  const manageButton = (
    <Button size="sm" variant="outline" className="w-full gap-1.5" onClick={openPortal} disabled={portalBusy}>
      {portalBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Settings2 className="h-3.5 w-3.5" />}
      Gérer ma cotisation
    </Button>
  );

  /**
   * Stripe refuse de s'afficher dans une iframe (aperçus Lovable, intégrations) :
   * on ouvre la page de paiement en pleine fenêtre, sinon dans un nouvel onglet,
   * et on garde un lien cliquable si le navigateur bloque les deux.
   */
  const openCheckout = (url: string) => {
    setBusy(false);
    setCheckoutUrl(url);
    if (window.top === window.self) {
      window.location.assign(url);
      return;
    }
    try {
      window.top!.location.href = url;
      return;
    } catch {
      /* navigation de la fenêtre parente interdite : on tente un nouvel onglet */
    }
    window.open(url, "_blank", "noopener");
  };

  const priceOf = (p: Plan) =>
    `${euros(p.base_amount_cents)} / ${p.billing_interval === "month" ? "mois" : "an"}${
      p.per_extra_person_cents ? ` + ${euros(p.per_extra_person_cents)} par personne en plus` : ""
    }${
      p.per_small_place_cents || p.per_large_place_cents
        ? ` + ${euros(p.per_small_place_cents)} ou ${euros(p.per_large_place_cents)} par lieu porté`
        : ""
    }`;

  const count = (value: number, set: (n: number) => void, id: string, label: string) => (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs">{label}</Label>
      <Input
        id={id}
        type="number"
        min={0}
        max={500}
        value={value}
        onChange={(e) => set(Math.max(0, Math.min(500, Math.floor(Number(e.target.value) || 0))))}
      />
    </div>
  );

  return (
    <div ref={cardRef} className={`rounded-lg border bg-card p-4 space-y-3 transition-shadow ${highlight ? "border-primary ring-2 ring-primary/40" : "border-border"}`}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold flex items-center gap-2"><CreditCard className="h-4 w-4" /> {t("uiGuildEuroMembershipCard.cotisation")}</h3>
        {active && <Badge>Adhérent</Badge>}
      </div>

      {active ? (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground flex items-start gap-1.5">
            <CalendarClock className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              {!end
                ? "Adhésion active."
                : isPayer && !membership?.cancel_at_period_end
                  ? `Adhésion active, renouvelée automatiquement le ${new Date(end).toLocaleDateString("fr-BE")}. Un rappel vous est envoyé par e-mail une semaine avant.`
                  : `Adhésion active jusqu'au ${new Date(end).toLocaleDateString("fr-BE")}.`}
              {membership?.cancel_at_period_end ? " Le renouvellement est arrêté." : ""}
            </span>
          </p>
          {isPayer && manageButton}
        </div>
      ) : pastDue ? (
        <div className="space-y-2">
          <p className="text-sm flex items-start gap-1.5 text-destructive">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>Le renouvellement de votre cotisation n'a pas pu être prélevé. Mettez à jour votre moyen de paiement : le prélèvement sera retenté automatiquement.</span>
          </p>
          {manageButton}
        </div>
      ) : !session ? (
        <Button size="sm" className="w-full" onClick={() => navigate("/login")}>Se connecter pour adhérer</Button>
      ) : blocked ? (
        <p className="text-sm text-muted-foreground">
          {application?.status === "PENDING"
            ? "Votre candidature est en cours d'examen. Vous pourrez cotiser dès qu'elle sera acceptée."
            : "Cette guilde valide les adhésions : envoyez d'abord une candidature."}
        </p>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Sans cotisation, vous suivez la guilde comme observateur. L'adhésion ouvre l'accès complet
            {guild.membership_benefits_text ? ` : ${guild.membership_benefits_text}` : "."}
          </p>
          <div className="space-y-1">
            <Label htmlFor="plan" className="text-xs">Votre profil</Label>
            <select
              id="plan"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={planCode}
              onChange={(e) => setPlanCode(e.target.value)}
            >
              <option value="">{t("uiGuildEuroMembershipCard.choisir")}</option>
              {plans.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.label} — {euros(p.base_amount_cents)} / {p.billing_interval === "month" ? "mois" : "an"}
                </option>
              ))}
            </select>
          </div>
          <button type="button" className="text-xs text-primary underline underline-offset-2" onClick={() => setCompareOpen(true)}>
            Comparer les formules et ce qu'elles ouvrent
          </button>
          {plan && (plan.description || (plan.benefits ?? []).length > 0) && (
            <div className="rounded-md border border-border bg-muted/30 p-2.5 text-xs space-y-1.5">
              {plan.description && <p>{plan.description}</p>}
              {(plan.benefits ?? []).length > 0 && (
                <ul className="space-y-0.5">
                  {(plan.benefits ?? []).map((b) => (
                    <li key={b} className="flex gap-1.5"><Check className="h-3 w-3 mt-0.5 shrink-0 text-primary" />{b}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {plan && plan.per_extra_person_cents > 0 &&
            count(extraPersons, setExtraPersons, "extra", `Personnes supplémentaires (${euros(plan.per_extra_person_cents)} chacune)`)}
          {plan && plan.per_small_place_cents > 0 &&
            count(smallPlaces, setSmallPlaces, "small", `Lieux portés de moins de 20 usagers (${euros(plan.per_small_place_cents)})`)}
          {plan && plan.per_large_place_cents > 0 &&
            count(largePlaces, setLargePlaces, "large", `Lieux portés de 20 usagers ou plus (${euros(plan.per_large_place_cents)})`)}
          <Button size="sm" className="w-full" onClick={pay} disabled={!plan || total <= 0 || busy}>
            {busy && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
            {plan ? `Payer ${euros(total)} / ${plan.billing_interval === "month" ? "mois" : "an"}` : "Choisissez un profil"}
          </Button>
          {checkoutUrl && (
            <a href={checkoutUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-1 text-xs text-primary underline underline-offset-2">
              La page de paiement ne s'est pas ouverte ? L'ouvrir ici <ExternalLink className="h-3 w-3" />
            </a>
          )}
          <p className="text-[11px] text-muted-foreground">Paiement sécurisé par Stripe, renouvelé automatiquement avec le même moyen de paiement. Rappel par e-mail une semaine avant chaque renouvellement ; vous pouvez l'arrêter à tout moment.</p>
        </div>
      )}

      <Dialog open={compareOpen} onOpenChange={setCompareOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Les formules d'adhésion</DialogTitle>
            <DialogDescription>
              Une seule adhésion, une cotisation selon votre profil. Sans cotisation, vous restez observateur.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            {plans.map((p) => (
              <div key={p.code} className={`rounded-lg border p-3 space-y-2 ${p.code === planCode ? "border-primary" : "border-border"}`}>
                <div>
                  <p className="font-medium text-sm">{p.label}</p>
                  <p className="text-xs text-muted-foreground">{priceOf(p)}</p>
                </div>
                {p.description && <p className="text-xs">{p.description}</p>}
                {(p.benefits ?? []).length > 0 && (
                  <ul className="space-y-0.5 text-xs">
                    {(p.benefits ?? []).map((b) => (
                      <li key={b} className="flex gap-1.5"><Check className="h-3 w-3 mt-0.5 shrink-0 text-primary" />{b}</li>
                    ))}
                  </ul>
                )}
                <Button size="sm" variant={p.code === planCode ? "default" : "outline"} className="w-full" onClick={() => { setPlanCode(p.code); setCompareOpen(false); }}>
                  {p.code === planCode ? t("uiGuildEuroMembershipCard.formuleChoisie") : "Choisir cette formule"}
                </Button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
