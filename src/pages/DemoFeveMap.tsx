import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import { LatLngBounds } from "leaflet";
import "leaflet/dist/leaflet.css";
import { Loader2, MapPinned } from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { DemoFeveGate } from "@/components/demo/DemoFeveGate";
import { useDemoFeveAccess, useDemoFeveSnapshot } from "@/hooks/useDemoFeve";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";

type Layer = "projects" | "resources" | "places" | "river";
type Node = { id: string; name: string; kind: Layer; lat: number; lng: number; description?: string; url: string };
const colors: Record<Layer, string> = {
  projects: "hsl(var(--primary))",
  resources: "hsl(var(--secondary-foreground))",
  places: "hsl(var(--accent-foreground))",
  river: "hsl(var(--muted-foreground))",
};
function FitDemoBounds({ nodes }: { nodes: Node[] }): null {
  const map = useMap();
  useEffect(() => {
    setTimeout(() => map.invalidateSize(), 100);
    if (nodes.length) map.fitBounds(new LatLngBounds(nodes.map((n) => [n.lat, n.lng] as [number, number])), { padding: [35, 35], maxZoom: 8 });
  }, [nodes, map]);
  return null;
}

export default function DemoFeveMap() {
  const { data, isLoading } = useDemoFeveSnapshot();
  const { isDemoAccount } = useDemoFeveAccess();
  const [layers, setLayers] = useState<Record<Layer, boolean>>({ projects: true, resources: true, places: true, river: true });
  const { nodes, links, riverPath } = useMemo(() => {
    if (!data) return { nodes: [] as Node[], links: [] as { from: Node; to: Node; reason: string }[], riverPath: [] as [number, number][] };
    const territories = new Map(data.territories.map((t) => [t.id, t]));
    const point = (territoryId: string, offset = 0): [number, number] => {
      const t = territories.get(territoryId);
      return [Number(t?.latitude ?? 46.45) + offset * 0.018, Number(t?.longitude ?? 5.2) + offset * 0.025];
    };
    const nodes: Node[] = [];
    const questNodes = new Map<string, Node>();
    const serviceNodes = new Map<string, Node>();
    const ownerNodes = new Map<string, Node>();
    data.quests.forEach((q, index) => {
      const link = data.quest_territories.find((x) => x.quest_id === q.id);
      const [lat, lng] = point(link?.territory_id, index % 4);
      const node = { id: q.id, name: q.title, kind: "projects" as const, lat, lng, description: q.description, url: `/quests/${q.id}` };
      nodes.push(node); questNodes.set(q.id, node); ownerNodes.set(`profile:${q.created_by_user_id}`, node);
    });
    data.services.forEach((s, index) => {
      const link = data.service_territories.find((x) => x.service_id === s.id);
      const [lat, lng] = point(link?.territory_id, (index % 5) - 2);
      const node = { id: s.id, name: s.title, kind: "resources" as const, lat, lng, description: s.description, url: `/services/${s.id}` };
      nodes.push(node); serviceNodes.set(s.id, node);
      ownerNodes.set(`${String(s.owner_type).toLowerCase() === "user" ? "profile" : String(s.owner_type).toLowerCase()}:${s.owner_id}`, node);
    });
    data.companies.filter((c) => c.org_type === "lieu hybride nourricier").forEach((c, index) => {
      const link = data.company_territories.find((x) => x.company_id === c.id);
      const [lat, lng] = point(link?.territory_id, index + 1);
      const node = { id: c.id, name: c.name, kind: "places" as const, lat, lng, description: c.description, url: `/companies/${c.id}` };
      nodes.push(node); ownerNodes.set(`company:${c.id}`, node);
    });
    const ns = data.natural_systems[0];
    const nsTerritory = ns ? territories.get(ns.territory_id) : null;
    const riverPath: [number, number][] = nsTerritory ? [
      [Number(nsTerritory.latitude) - 0.08, Number(nsTerritory.longitude) - 0.16],
      [Number(nsTerritory.latitude) - 0.02, Number(nsTerritory.longitude) - 0.06],
      [Number(nsTerritory.latitude) + 0.04, Number(nsTerritory.longitude) + 0.04],
      [Number(nsTerritory.latitude) + 0.10, Number(nsTerritory.longitude) + 0.15],
    ] : [];
    if (ns && nsTerritory) nodes.push({ id: ns.id, name: ns.name, kind: "river", lat: Number(nsTerritory.latitude), lng: Number(nsTerritory.longitude), description: ns.description, url: `/natural-systems/${ns.id}` });
    const needs = new Map(data.opportunity_needs.map((n) => [n.id, n]));
    const caps = new Map(data.capabilities.map((c) => [c.id, c]));
    const links = data.opportunity_matches.map((m) => {
      const from = questNodes.get(m.quest_id);
      const cap = caps.get(m.capability_id);
      const serviceUrl = cap?.evidence?.find((e: any) => e.kind === "service")?.url;
      const serviceId = serviceUrl?.split("/").pop();
      const to = (serviceId && serviceNodes.get(serviceId)) || ownerNodes.get(`${cap?.owner_type}:${cap?.owner_id}`);
      return from && to ? { from, to, reason: m.reason_fr ?? needs.get(m.need_id)?.label ?? "Appariement suggéré" } : null;
    }).filter(Boolean) as { from: Node; to: Node; reason: string }[];
    return { nodes, links, riverPath };
  }, [data]);
  const visibleNodes = nodes.filter((n) => layers[n.kind]);
  const nodeIds = new Set(visibleNodes.map((n) => n.id));
  const visibleLinks = links.filter((l) => nodeIds.has(l.from.id) && nodeIds.has(l.to.id));
  const labels: [Layer, string][] = [["projects", "Porteurs de projets"], ["resources", "Ressources et services"], ["places", "Lieux du réseau"], ["river", "Rivière démo"]];
  return <PageShell><DemoFeveGate><div className="space-y-4">
    <div><h1 className="flex items-center gap-2 font-display text-2xl font-bold"><MapPinned className="h-7 w-7 text-primary" /> Carte des rapprochements</h1><p className="mt-1 text-sm text-muted-foreground">Démo FEVE — données entièrement fictives. Chaque trait relie un besoin à une ressource proposée. Clique sur un point pour comprendre le rapprochement.</p></div>
    <div className="flex flex-wrap gap-4 rounded-xl border border-border bg-card p-3">{labels.map(([key, label]) => <label key={key} className="flex items-center gap-2 text-sm"><Checkbox checked={layers[key]} onCheckedChange={(value) => setLayers((old) => ({ ...old, [key]: value === true }))} />{label}</label>)}</div>
    <div className="h-[65vh] min-h-[480px] overflow-hidden rounded-2xl border border-border bg-card">
      {isLoading ? <div className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div> : <MapContainer center={[47.2, 4.5]} zoom={6} style={{ height: "100%", width: "100%" }}>
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <FitDemoBounds nodes={visibleNodes} />
        {layers.river && riverPath.length > 0 && <Polyline positions={riverPath} pathOptions={{ color: colors.river, weight: 4, dashArray: "8 6" }} />}
        {visibleLinks.map((link, index) => <Polyline key={`${link.from.id}-${link.to.id}-${index}`} positions={[[link.from.lat, link.from.lng], [link.to.lat, link.to.lng]]} pathOptions={{ color: colors.projects, weight: 1.5, opacity: 0.35 }} />)}
        {visibleNodes.map((node) => {
          const reason = links.find((l) => l.from.id === node.id || l.to.id === node.id)?.reason;
          return <CircleMarker key={`${node.kind}-${node.id}`} center={[node.lat, node.lng]} radius={node.kind === "projects" ? 9 : 7} pathOptions={{ color: colors[node.kind], fillColor: colors[node.kind], fillOpacity: 0.75, weight: 2 }}><Popup><div className="max-w-xs space-y-2"><strong>{node.name}</strong>{node.description && <p className="text-xs">{node.description}</p>}{reason && <p className="text-xs"><b>Pourquoi ce rapprochement :</b> {reason}</p>}{isDemoAccount && <Button size="sm" asChild><Link to={node.kind === "resources" ? "/opportunities" : node.url}>{node.kind === "resources" ? "Voir l’opportunité" : "Voir la fiche"}</Link></Button>}</div></Popup></CircleMarker>;
        })}
      </MapContainer>}
    </div>
  </div></DemoFeveGate></PageShell>;
}
