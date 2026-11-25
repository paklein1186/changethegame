import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

type Tone = "actor" | "means" | "need";

interface EntityNode {
  key: string;
  /** Position on the circle, in % of the square box (desktop layout). */
  x: number;
  y: number;
  tone: Tone;
  to?: string;
}

const NODES: EntityNode[] = [
  { key: "individuals", x: 50, y: 8, tone: "actor", to: "/explore/people-info" },
  { key: "organizations", x: 81, y: 19, tone: "actor" },
  { key: "collectives", x: 90, y: 50, tone: "actor", to: "/explore/guilds-info" },
  { key: "opportunities", x: 81, y: 81, tone: "need", to: "/opportunities" },
  { key: "needs", x: 50, y: 92, tone: "need", to: "/explore/quests-info" },
  { key: "resources", x: 19, y: 81, tone: "means" },
  { key: "places", x: 10, y: 50, tone: "means", to: "/territories-houses" },
  { key: "consortiums", x: 19, y: 19, tone: "actor" },
  { key: "methodologies", x: 50, y: 29, tone: "means" },
];

const TONE_CLASSES: Record<Tone, string> = {
  actor: "bg-card border-border",
  means: "bg-primary/10 border-primary/30",
  need: "bg-accent/50 border-accent",
};

function Chip({ node, className }: { node: EntityNode; className?: string }) {
  const { t } = useTranslation();
  const label = t(`landingV2.entities.names.${node.key}`);
  const base = cn(
    "inline-flex items-center rounded-full border px-3 py-1.5 text-xs sm:text-sm font-semibold whitespace-nowrap shadow-sm",
    TONE_CLASSES[node.tone],
    className,
  );
  if (node.to) {
    return (
      <Link to={node.to} className={cn(base, "transition-colors hover:border-primary hover:text-primary")}>
        {label}
      </Link>
    );
  }
  return <span className={base}>{label}</span>;
}

/**
 * "Your territory" (or "Your initiative") at the centre, linked to the nine
 * kinds of entities the platform holds.
 */
export function LandingEntityConstellation({ center = "territory" }: { center?: "territory" | "initiative" }) {
  const { t } = useTranslation();
  const prefix = center === "initiative" ? "landingV2.entities.initiative." : "landingV2.entities.";

  return (
    <figure aria-label={t(`${prefix}figureLabel`)} className="m-0">
      {/* Mobile: simple wrap list */}
      <div className="sm:hidden flex flex-col items-center gap-4">
        <div className="rounded-full bg-foreground text-background font-display font-bold px-5 py-3 text-base">
          {t(`${prefix}center`)}
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {NODES.map((n) => (
            <Chip key={n.key} node={n} />
          ))}
        </div>
      </div>

      {/* Tablet & desktop: constellation */}
      <div className="hidden sm:block relative w-full max-w-[520px] aspect-square mx-auto rounded-full bg-muted/60 border border-border">
        <svg aria-hidden="true" viewBox="0 0 100 100" className="absolute inset-0 h-full w-full text-muted-foreground/40">
          <circle cx="50" cy="50" r="30" fill="none" stroke="currentColor" strokeWidth="0.3" />
          {NODES.map((n) => (
            <line
              key={n.key}
              x1="50"
              y1="50"
              x2={n.x}
              y2={n.y}
              stroke="currentColor"
              strokeWidth="0.35"
              strokeDasharray="1 1.2"
            />
          ))}
        </svg>
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[30%] aspect-square rounded-full bg-foreground text-background flex items-center justify-center text-center font-display font-bold text-base lg:text-lg leading-tight p-2">
          {t(`${prefix}center`)}
        </div>
        {NODES.map((n, i) => (
          <motion.div
            key={n.key}
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ delay: i * 0.05, duration: 0.4, ease: "easeOut" }}
            className="absolute"
            style={{ left: `${n.x}%`, top: `${n.y}%`, x: "-50%", y: "-50%" }}
          >
            <Chip node={n} />
          </motion.div>
        ))}
      </div>
    </figure>
  );
}
