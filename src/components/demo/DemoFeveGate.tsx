import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Loader2, LockKeyhole } from "lucide-react";
import { useDemoFeveAccess } from "@/hooks/useDemoFeve";
import { canViewDemoFeveShowcase } from "@/lib/demoFeve";
import { Button } from "@/components/ui/button";

export function DemoFeveGate({ children }: { children: ReactNode }) {
  const { loading, user } = useDemoFeveAccess();
  if (loading) return <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (!canViewDemoFeveShowcase(user?.id)) {
    return <div className="mx-auto max-w-md rounded-2xl border border-border bg-card p-8 text-center space-y-4">
      <LockKeyhole className="mx-auto h-8 w-8 text-primary" />
      <h1 className="font-display text-xl font-semibold">Connecte-toi pour découvrir la démo</h1>
      <p className="text-sm text-muted-foreground">Le digest, la carte et le matchmaker présentent uniquement des données fictives.</p>
      <Button asChild><Link to="/login">Se connecter</Link></Button>
    </div>;
  }
  return <>{children}</>;
}
