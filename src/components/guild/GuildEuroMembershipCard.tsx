import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, CreditCard, CalendarClock } from "lucide-react";
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
}

const euros = (cents: number) =>
  (cents / 100).toLocaleString("fr-BE", { style: "currency", currency: "EUR", maximumFractionDigits: 2 });

export function GuildEuroMembershipCard({ guild }: { guild: any }) {
  const { session } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { membership, application, refresh } = useGuildMembership(guild.id);
  const [planCode, setPlanCode] = useState<string>("");
  const [extraPersons, setExtraPersons] = useState(0);
  const [smallPlaces, setSmallPlaces] = useState(0);
  const [largePlaces, setLargePlaces] = useState(0);
  const [busy, setBusy] = useState(false);
  const confirmed = useRef(false);

  const { data: plans = [] } = useQuery({
    queryKey: ["guild-membership-plans", guild.id],
    queryFn: async (): Promise<Plan[]> => {
      const { data } = await supabase
        .from("guild_membership_plans" as any)
        .select("code, label, billing_interval, base_amount_cents, per_extra_person_cents, per_small_place_cents, per_large_place_cents")
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
    window.location.href = url;
  };

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
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold flex items-center gap-2"><CreditCard className="h-4 w-4" /> Cotisation</h3>
        {active && <Badge>Adhérent</Badge>}
      </div>

      {active ? (
        <p className="text-sm text-muted-foreground flex items-center gap-1.5">
          <CalendarClock className="h-4 w-4" />
          {end ? `Adhésion active jusqu'au ${new Date(end).toLocaleDateString("fr-BE")}.` : "Adhésion active."}
          {membership?.cancel_at_period_end ? " Le renouvellement est arrêté." : ""}
        </p>
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
          <div className="space-y-1">
            <Label htmlFor="plan" className="text-xs">Votre profil</Label>
            <select
              id="plan"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={planCode}
              onChange={(e) => setPlanCode(e.target.value)}
            >
              <option value="">Choisir…</option>
              {plans.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.label} — {euros(p.base_amount_cents)} / {p.billing_interval === "month" ? "mois" : "an"}
                </option>
              ))}
            </select>
          </div>
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
          <p className="text-[11px] text-muted-foreground">Paiement sécurisé par Stripe, renouvelé automatiquement ; vous pouvez l'arrêter à tout moment.</p>
        </div>
      )}
    </div>
  );
}
