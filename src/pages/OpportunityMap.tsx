import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import { LatLngBounds } from "leaflet";
import "leaflet/dist/leaflet.css";
import { ArrowLeft, Loader2, MapPinned, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

type Scope = "me" | "guilds" | "all";
type Layer = "projects" | "resources";
type OpportunityMapRow = {
  match_id: string;
  direction: "you_can_help" | "help_for_you" | "platform";
  quest_id: string;
  quest_title: string;
  quest_territory_name: string | null;
  quest_latitude: number | null;
  quest_longitude: number | null;
  helper_type: "profile" | "guild" | "company";
  helper_id: string;
  helper_name: string | null;
  helper_territory_name: string | null;
  helper_latitude: number | null;
  helper_longitude: number | null;
  need_label: string;
  reason_fr: string | null;
  reason_en: string | null;
  score: number;
};
type MapNode = {
  key: string;
  name: string;
  kind: Layer;
  lat: number;
  lng: number;
  territory: string;
  url: string;
};
type MapLink = { id: string; from: MapNode; to: MapNode; need: string; reason: string | null };

const colors: Record<Layer, string> = {
  projects: "hsl(var(--primary))",
  resources: "hsl(var(--secondary-foreground))",
};
const validCoordinate = (value: number | null) => value !== null && Number.isFinite(Number(value));
const helperUrl = (row: OpportunityMapRow) => row.helper_type === "profile"
  ? `/users/${row.helper_id}`
  : row.helper_type === "guild" ? `/guilds/${row.helper_id}` : `/companies/${row.helper_id}`;

function FitOpportunityBounds({ nodes }: { nodes: MapNode[] }): null {
  const map = useMap();
  useEffect(() => {
    const timer = window.setTimeout(() => map.invalidateSize(), 100);
    if (nodes.length === 1) map.setView([nodes[0].lat, nodes[0].lng], 8);
    if (nodes.length > 1) map.fitBounds(new LatLngBounds(nodes.map((node) => [node.lat, node.lng])), { padding: [40, 40], maxZoom: 8 });
    return () => window.clearTimeout(timer);
  }, [nodes, map]);
  return null;
}

export default function OpportunityMap() {
  const currentUser = useCurrentUser();
  const [scope, setScope] = useState<Scope>("me");
  const [layers, setLayers] = useState<Record<Layer, boolean>>({ projects: true, resources: true });
  const { data = [], isLoading, error } = useQuery<OpportunityMapRow[]>({
    queryKey: ["opportunity-map", currentUser.id, scope],
    enabled: !!currentUser.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_opportunity_map", { p_scope: scope });
      if (error) throw error;
      return (data ?? []) as OpportunityMapRow[];
    },
    staleTime: 60_000,
  });

  const { nodes, links, unlocated } = useMemo(() => {
    const nodes = new Map<string, MapNode>();
    const links: MapLink[] = [];
    for (const row of data) {
      let from: MapNode | undefined;
      let to: MapNode | undefined;
      if (validCoordinate(row.quest_latitude) && validCoordinate(row.quest_longitude)) {
        from = {
          key: `quest:${row.quest_id}`,
          name: row.quest_title,
          kind: "projects",
          lat: Number(row.quest_latitude),
          lng: Number(row.quest_longitude),
          territory: row.quest_territory_name ?? "Territoire",
          url: `/quests/${row.quest_id}`,
        };
        nodes.set(from.key, from);
      }
      if (validCoordinate(row.helper_latitude) && validCoordinate(row.helper_longitude)) {
        to = {
          key: `${row.helper_type}:${row.helper_id}`,
          name: row.helper_name ?? "Ressource",
          kind: "resources",
          lat: Number(row.helper_latitude),
          lng: Number(row.helper_longitude),
          territory: row.helper_territory_name ?? "Territoire",
          url: helperUrl(row),
        };
        nodes.set(to.key, to);
      }
      if (from && to) links.push({ id: row.match_id, from, to, need: row.need_label, reason: row.reason_fr ?? row.reason_en });
    }
    return { nodes: [...nodes.values()], links, unlocated: Math.max(0, data.length - links.length) };
  }, [data]);

  const visibleNodes = nodes.filter((node) => layers[node.kind]);
  const visibleKeys = new Set(visibleNodes.map((node) => node.key));
  const visibleLinks = links.filter((link) => visibleKeys.has(link.from.key) && visibleKeys.has(link.to.key));
  const labels: [Layer, string][] = [["projects", "Projets"], ["resources", "Personnes et ressources"]];

  return <PageShell><div className="space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2"><Link to="/"><ArrowLeft className="mr-1.5 h-4 w-4" /> Digest du jour</Link></Button>
        <h1 className="flex items-center gap-2 font-display text-2xl font-bold"><MapPinned className="h-7 w-7 text-primary" /> Carte des rapprochements</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Vos vraies opportunités, placées au niveau de leurs territoires. Chaque trait relie un besoin de projet à une personne ou une ressource susceptible d’aider.</p>
      </div>
      <Button variant="outline" size="sm" asChild><Link to="/opportunities"><Sparkles className="mr-1.5 h-4 w-4" /> Toutes les opportunités</Link></Button>
    </div>

    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3">
      <div className="inline-flex rounded-lg border border-border bg-background p-0.5" role="tablist" aria-label="Portée des rapprochements">
        {([["me", "Pour moi"], ["guilds", "Mes guildes"], ["all", "Partout"]] as [Scope, string][]).map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={scope === value} onClick={() => setScope(value)} className={`rounded-md px-3 py-1.5 text-xs transition-colors ${scope === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>{label}</button>)}
      </div>
      <div className="flex flex-wrap gap-4">{labels.map(([key, label]) => <label key={key} className="flex items-center gap-2 text-sm"><Checkbox checked={layers[key]} onCheckedChange={(value) => setLayers((old) => ({ ...old, [key]: value === true }))} />{label}</label>)}</div>
      <p className="text-xs text-muted-foreground">{data.length} rapprochement{data.length > 1 ? "s" : ""} · {links.length} localisé{links.length > 1 ? "s" : ""}</p>
    </div>

    {unlocated > 0 && <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">{unlocated} rapprochement{unlocated > 1 ? "s" : ""} sans territoire renseigné ne peuvent pas être tracés. Ajoutez un territoire aux quêtes et aux profils concernés pour compléter la carte.</p>}

    <div className="h-[65vh] min-h-[480px] overflow-hidden rounded-2xl border border-border bg-card">
      {isLoading ? <div className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        : error ? <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">La carte n’a pas pu être chargée. Réessayez dans un instant.</div>
        : visibleNodes.length === 0 ? <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center"><MapPinned className="h-8 w-8 text-muted-foreground" /><p className="max-w-md text-sm text-muted-foreground">Aucun rapprochement localisé dans cette vue. Complétez votre profil et les territoires de vos quêtes, ou consultez la vue « Partout ».</p><Button size="sm" variant="outline" onClick={() => setScope("all")}>Voir tous les rapprochements</Button></div>
        : <MapContainer center={[46.6, 2.4]} zoom={5} style={{ height: "100%", width: "100%" }}>
          <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <FitOpportunityBounds nodes={visibleNodes} />
          {visibleLinks.map((link) => <Polyline key={link.id} positions={[[link.from.lat, link.from.lng], [link.to.lat, link.to.lng]]} pathOptions={{ color: colors.projects, weight: 1.5, opacity: 0.4 }} />)}
          {visibleNodes.map((node) => {
            const related = links.filter((link) => link.from.key === node.key || link.to.key === node.key);
            return <CircleMarker key={node.key} center={[node.lat, node.lng]} radius={node.kind === "projects" ? 9 : 7} pathOptions={{ color: colors[node.kind], fillColor: colors[node.kind], fillOpacity: 0.75, weight: 2 }}><Popup><div className="max-w-xs space-y-2"><strong>{node.name}</strong><p className="text-xs">{node.territory}</p>{related.slice(0, 2).map((link) => <p key={link.id} className="text-xs"><b>{link.need}</b>{link.reason ? ` — ${link.reason}` : ""}</p>)}<Button size="sm" asChild><Link to={node.url}>Voir la fiche</Link></Button></div></Popup></CircleMarker>;
          })}
        </MapContainer>}
    </div>
  </div></PageShell>;
}
