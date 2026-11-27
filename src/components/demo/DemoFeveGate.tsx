import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Loader2, LockKeyhole } from "lucide-react";
import { useDemoFeveAccess } from "@/hooks/useDemoFeve";
import { canViewDemoFeveShowcase } from "@/lib/demoFeve";
import { Button } from "@/components/ui/button";

export function DemoFeveGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { access, loading, user } = useDemoFeveAccess();
  if (loading) return <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (!user) {
    return <div className="mx-auto max-w-md rounded-2xl border border-border bg-card p-8 text-center space-y-4">
      <LockKeyhole className="mx-auto h-8 w-8 text-primary" />
      <h1 className="font-display text-xl font-semibold">Démo réservée aux comptes autorisés</h1>
      <Button asChild><Link to="/login">{t("uiDemoFeveGate.seConnecter")}</Link></Button>
    </div>;
  }
  if (!canViewDemoFeveShowcase(user.id, access)) {
    return <div className="mx-auto max-w-md rounded-2xl border border-border bg-card p-8 text-center space-y-3">
      <LockKeyhole className="mx-auto h-8 w-8 text-muted-foreground" />
      <h1 className="font-display text-xl font-semibold">Aucune donnée démo sur ce compte</h1>
      <p className="text-sm text-muted-foreground">Ce contrôle empêche les données fictives d’apparaître dans les comptes réels.</p>
    </div>;
  }
  return <>{children}</>;
}
