import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, Sprout, Landmark, HandHelping, Building2 } from "lucide-react";
import { setPosture, type Posture } from "@/lib/posture";

const DOORS: { posture: Exclude<Posture, "explorer">; to: string; icon: typeof Sprout }[] = [
  { posture: "initiative", to: "/home/initiative", icon: Sprout },
  { posture: "territory", to: "/home/territoire", icon: Landmark },
  { posture: "contributor", to: "/welcome", icon: HandHelping },
  { posture: "organization", to: "/landing/organization", icon: Building2 },
];

/**
 * "Not quite you?" strip shown at the bottom of each persona page: the other
 * doors of the meta home, so a visitor who landed on the wrong page can switch.
 */
export function LandingPostureLinks({ current }: { current: Exclude<Posture, "explorer"> | "explorer" }) {
  const { t } = useTranslation();
  const doors = DOORS.filter((d) => d.posture !== current);

  return (
    <section className="border-t border-border bg-muted/30">
      <div className="container px-5 sm:px-6 lg:px-8 py-12">
        <h2 className="font-display text-xl font-semibold text-center mb-6">{t("personaPages.otherDoors.title")}</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 max-w-5xl mx-auto">
          {doors.map((d) => (
            <Link
              key={d.posture}
              to={d.to}
              onClick={() => setPosture(d.posture)}
              className="group flex items-center gap-3 rounded-2xl border border-border bg-card p-4 transition-all hover:border-primary/40 hover:shadow-md"
            >
              <div className="h-9 w-9 shrink-0 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                <d.icon className="h-4 w-4" />
              </div>
              <span className="text-sm font-medium flex-1">{t(`metaHome.doors.${d.posture}.title`)}</span>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </Link>
          ))}
        </div>
        <p className="text-center mt-5">
          <Link to="/home" className="text-sm text-primary hover:underline">{t("personaPages.otherDoors.home")}</Link>
        </p>
      </div>
    </section>
  );
}
