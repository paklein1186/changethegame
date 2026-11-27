import { FlaskConical } from "lucide-react";
import { Link } from "react-router-dom";
import { useDemoFeveAccess } from "@/hooks/useDemoFeve";

export function DemoFeveBanner() {
  const { access, isDemoAccount } = useDemoFeveAccess();
  if (!access) return null;
  return <div className="border-b border-border bg-muted/70 px-3 py-1.5 text-center text-xs text-muted-foreground">
    <FlaskConical className="mr-1.5 inline h-3.5 w-3.5" />
    <strong className="font-medium text-foreground">Mode démo — données fictives</strong>
    {isDemoAccount && <span className="ml-2"><Link className="underline hover:text-foreground" to="/demo/carte">Carte</Link> · <Link className="underline hover:text-foreground" to="/demo/matchmaker">Matchmaker</Link></span>}
  </div>;
}
