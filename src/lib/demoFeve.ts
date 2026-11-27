export type DemoFeveRequest = { title: string; place: string; unanswered: boolean; matches: string[] };

const specific: DemoFeveRequest[] = [
  { title: "Couple formé aux fermes collectives cherche un lieu", place: "Côte-d’Or (Dijon)", unanswered: true, matches: ["Écovillage 30–45 ha — projet collectif compatible"] },
  { title: "Écovillage cherche 30 à 45 ha", place: "Saône-et-Loire / Allier / Nièvre", unanswered: true, matches: ["Achat de foncier à plusieurs — recherche mutualisable"] },
  { title: "Trois GAEC cherchent des associés", place: "Saône-et-Loire", unanswered: false, matches: ["Couple de Dijon — formation et projet directement compatibles"] },
  { title: "Paysans-boulangers cherchent un éleveur pour 90 ha", place: "Hautes-Pyrénées", unanswered: true, matches: ["Achat de foncier à plusieurs — même territoire", "Écovillage ariégeois — 45 ha de prairies bio"] },
  { title: "Paysan-boulanger expérimenté cherche un fournil", place: "Mobile", unanswered: true, matches: ["Fournil disponible en Vaucluse", "Fournil disponible en Ariège", "Écovillage ariégeois — accueil sur 45 ha bio"] },
  { title: "Écovillage cherche des porteurs de projets", place: "Ariège", unanswered: true, matches: ["Maurice — compétence en élevage plein air"] },
];
const genericPlaces = ["Gers", "Landes", "Allier", "Nièvre", "Bresse", "Wallonie", "Bourgogne"];
const generic: DemoFeveRequest[] = Array.from({ length: 21 }, (_, i) => ({
  title: `Demande agricole anonymisée ${String(i + 7).padStart(2, "0")}`,
  place: genericPlaces[i % genericPlaces.length], unanswered: i < 17, matches: [] as string[],
}));
export const demoFeveRequests = [...specific, ...generic];
export const summarizeDemoFeveRequests = (requests: DemoFeveRequest[]) => ({
  requests: requests.length,
  unanswered: requests.filter((r) => r.unanswered).length,
  matches: requests.reduce((sum, r) => sum + r.matches.length, 0),
});
export const isDemoFeveEmail = (email: string | null | undefined) => {
  const value = email?.toLowerCase() ?? "";
  return value.startsWith("demo+") && value.endsWith("@changethegame.xyz");
};

export const canViewDemoFeveShowcase = (userId: string | null | undefined) => Boolean(userId);
