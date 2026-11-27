import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, CalendarCheck, Loader2, Map as MapIcon, Send, Sparkles, UserRound } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useDemoFeveSnapshot } from "@/hooks/useDemoFeve";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

export function DemoFeveDigest() {
  const { data, isLoading } = useDemoFeveSnapshot();
  const [selected, setSelected] = useState<any | null>(null);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const cards = useMemo(() => {
    if (!data) return [];
    const quest = data.quests.find((q) => q.title.includes("poules pondeuses"));
    const needs = new Map(data.opportunity_needs.map((n) => [n.id, n]));
    const caps = new Map(data.capabilities.map((c) => [c.id, c]));
    const names = new Map<string, string>();
    data.companies.forEach((c) => names.set(`company:${c.id}`, c.name));
    data.guilds.forEach((g) => names.set(`guild:${g.id}`, g.name));
    data.profiles.forEach((p) => names.set(`profile:${p.user_id}`, p.name));
    return data.opportunity_matches.filter((m) => m.quest_id === quest?.id).map((m) => {
      const cap = caps.get(m.capability_id);
      return { ...m, need: needs.get(m.need_id), cap, helperName: names.get(`${cap?.owner_type}:${cap?.owner_id}`) ?? "Ressource locale", serviceUrl: cap?.evidence?.find((e: any) => e.kind === "service")?.url };
    });
  }, [data]);
  const wanted = ["Bresse en Paniers", "Atelier Mobile Volailles", "Terres Partagées"].map((name) => cards.find((c) => c.helperName.includes(name))).filter(Boolean);
  const vet = cards.find((c) => c.helperName.includes("Lefort"));
  const event = data?.guild_events?.[0];
  const ask = (card: any) => {
    setSelected(card);
    setMessage(`Bonjour ${card.helperName}, je lance mon atelier de poules pondeuses en Bresse. Votre proposition « ${card.cap?.label} » semble correspondre à mon besoin « ${card.need?.label} ». Pourrions-nous en échanger ?`);
  };
  const send = async () => {
    if (!selected) return;
    setSending(true);
    try {
      const { error } = await (supabase as any).rpc("request_opportunity_help", { p_match_id: selected.id, p_message: message });
      if (error) throw error;
      toast.success("Demande envoyée");
      setSelected(null);
    } catch (error: any) {
      toast.error(error?.message ?? "La demande n’a pas pu être envoyée");
    } finally { setSending(false); }
  };
  if (isLoading) return <div className="rounded-2xl border border-border bg-card p-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;
  return <section className="rounded-2xl border border-primary/20 bg-primary/[0.03] p-4 sm:p-5 space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="flex items-center gap-2 font-display text-lg font-semibold"><Sparkles className="h-5 w-5 text-primary" /> Ton digest du jour</h2><p className="text-sm text-muted-foreground">Des rapprochements concrets pour ton installation en Bresse.</p></div>
      <div className="flex gap-2"><Button variant="outline" size="sm" asChild><Link to="/demo/carte"><MapIcon className="mr-1.5 h-4 w-4" /> Carte</Link></Button><Button variant="outline" size="sm" asChild><Link to="/demo/matchmaker">27 demandes</Link></Button></div>
    </div>
    <div className="grid gap-3 md:grid-cols-3">
      {wanted.map((card) => <article key={card.id} className="rounded-xl border border-border bg-card p-4 flex flex-col">
        <h3 className="font-semibold text-sm">{card.helperName}</h3><p className="mt-1 text-xs font-medium text-primary">{card.cap?.label}</p>
        <p className="mt-2 flex-1 text-xs leading-relaxed text-muted-foreground">{card.reason_fr}</p>
        <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => ask(card)}><Send className="mr-1 h-3.5 w-3.5" /> Demander</Button>{card.serviceUrl && <Button size="sm" asChild><Link to={card.serviceUrl}><CalendarCheck className="mr-1 h-3.5 w-3.5" /> Réserver</Link></Button>}</div>
      </article>)}
    </div>
    <div className="grid gap-3 md:grid-cols-2">
      {vet && <article className="rounded-xl border border-border bg-card p-4"><div className="flex items-center gap-2 text-sm font-semibold"><UserRound className="h-4 w-4 text-primary" /> Nouvelle personne proche</div><p className="mt-2 text-sm">{vet.helperName}</p><p className="mt-1 text-xs text-muted-foreground">{vet.reason_fr}</p><Button className="mt-3" size="sm" variant="outline" onClick={() => ask(vet)}><Send className="mr-1 h-3.5 w-3.5" /> Demander</Button></article>}
      {event && <article className="rounded-xl border border-border bg-card p-4"><div className="flex items-center gap-2 text-sm font-semibold"><CalendarDays className="h-4 w-4 text-primary" /> Samedi</div><p className="mt-2 text-sm">{event.title}</p><p className="mt-1 text-xs text-muted-foreground">{new Date(event.start_at).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" })} · {event.location_text}</p><Button className="mt-3" size="sm" variant="outline" asChild><Link to={`/events/${event.id}`}>Voir l’événement</Link></Button></article>}
    </div>
    <aside className="rounded-xl border border-border bg-muted/40 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notre vision</p><p className="mt-1 text-sm">Relier les projets porteurs de respect et d’harmonie entre humains et avec le vivant, territoire par territoire.</p></aside>
    <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}><DialogContent><DialogHeader><DialogTitle>Demander à {selected?.helperName}</DialogTitle><DialogDescription>Message pré-rempli, modifiable avant envoi.</DialogDescription></DialogHeader><Textarea rows={8} value={message} onChange={(e) => setMessage(e.target.value)} /><DialogFooter><Button variant="ghost" onClick={() => setSelected(null)}>Annuler</Button><Button disabled={sending || message.trim().length < 10} onClick={send}>{sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />} Envoyer</Button></DialogFooter></DialogContent></Dialog>
  </section>;
}
