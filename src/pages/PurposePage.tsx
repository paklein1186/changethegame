import { PageShell } from "@/components/PageShell";
import { useTranslation } from "react-i18next";

/** Vision, raison d'être and governance — the three statements that frame changethegame. */
export default function PurposePage({ embedded }: { embedded?: boolean }) {
  const { t } = useTranslation();
  const blocks = ["vision", "purpose", "governance"] as const;

  const content = (
    <div className={embedded ? "max-w-2xl mx-auto px-4" : "max-w-2xl mx-auto py-12 sm:py-20 px-4"}>
      <h1 className="text-2xl sm:text-3xl font-display font-bold text-foreground mb-2">{t("purposePage.title")}</h1>
      <p className="text-muted-foreground text-lg mb-10">{t("purposePage.subtitle")}</p>

      <div className="space-y-5">
        {blocks.map((b) => (
          <section key={b} className="rounded-2xl border border-primary/30 bg-primary/5 p-7">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary mb-3">{t(`purposePage.${b}Label`)}</p>
            <p className="text-base sm:text-lg leading-relaxed text-foreground/90">{t(`purposePage.${b}`)}</p>
          </section>
        ))}
      </div>
    </div>
  );
  if (embedded) return content;
  return <PageShell>{content}</PageShell>;
}
