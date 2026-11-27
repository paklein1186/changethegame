import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, CircleDashed, Network } from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { DemoFeveGate } from "@/components/demo/DemoFeveGate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { demoFeveRequests as requests, summarizeDemoFeveRequests } from "@/lib/demoFeve";

export default function DemoFeveMatchmaker() {
  const { t } = useTranslation();
  const { unanswered, matches: matchCount } = summarizeDemoFeveRequests(requests);
  return <PageShell><DemoFeveGate><div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="flex items-center gap-2 font-display text-2xl font-bold"><Network className="h-7 w-7 text-primary" /> Matchmaker La Grange</h1><p className="mt-1 text-sm text-muted-foreground">Demandes anonymisées et lignes génériques fictives, sans données personnelles.</p></div><Button variant="outline" asChild><Link to="/demo/carte">Voir la carte <ArrowRight className="ml-2 h-4 w-4" /></Link></Button></div>
    <div className="rounded-2xl border border-primary/20 bg-primary/[0.04] p-5"><p className="font-display text-xl font-semibold">22 / 27 demandes sans réponse visible → 9 appariements proposés</p><p className="mt-1 text-sm text-muted-foreground">Contrôle calculé sur ce tableau : {unanswered} sans réponse, {matchCount} suggestions.</p></div>
    <div className="rounded-xl border border-border bg-card overflow-hidden"><Table><TableHeader><TableRow><TableHead>{t("uiDemoFeveMatchmaker.demande")}</TableHead><TableHead>{t("uiDemoFeveMatchmaker.territoire")}</TableHead><TableHead>État</TableHead><TableHead>Appariements suggérés</TableHead></TableRow></TableHeader><TableBody>
      {requests.map((request, index) => <TableRow key={request.title}><TableCell className="font-medium">{request.title}</TableCell><TableCell className="text-muted-foreground">{request.place}</TableCell><TableCell>{request.unanswered ? <Badge variant="secondary"><CircleDashed className="mr-1 h-3 w-3" /> Sans réponse visible</Badge> : <Badge variant="outline"><CheckCircle2 className="mr-1 h-3 w-3" /> Réponse visible</Badge>}</TableCell><TableCell>{request.matches.length ? <ul className="space-y-1 text-sm">{request.matches.map((m) => <li key={m} className="text-foreground">→ {m}</li>)}</ul> : <span className="text-sm text-muted-foreground">À analyser</span>}</TableCell></TableRow>)}
    </TableBody></Table></div>
  </div></DemoFeveGate></PageShell>;
}
