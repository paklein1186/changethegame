/**
 * Garde-fous des traductions.
 * - Toute clé t("…") utilisée existe en français et en anglais.
 * - fr.json et en.json ont les mêmes clés.
 * - Les textes anglais en dur ne progressent pas : chaque fichier reste sous son plafond
 *   (hardcoded-baseline.json). Quand on en traduit, régénérer le plafond pour verrouiller le progrès :
 *     UPDATE_I18N_BASELINE=1 npx vitest run src/i18n/__tests__/translations.test.ts
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { flatten, hasKey, scanFile, sourceFiles } from "../audit";
import fr from "../fr.json";
import en from "../en.json";

const SRC = path.resolve(__dirname, "../..");
const BASELINE = path.resolve(__dirname, "../hardcoded-baseline.json");
const F = flatten(fr as Record<string, unknown>);
const E = flatten(en as Record<string, unknown>);
const scans = sourceFiles(SRC).map((f) => scanFile(f, SRC));

describe("traductions", () => {
  it("chaque clé utilisée existe en français et en anglais", () => {
    const missing = scans.flatMap((s, i) => s.keys
      .filter(({ key }) => !hasKey(F, key) || !hasKey(E, key))
      .map(({ key, line }) => `${path.relative(SRC, sourceFiles(SRC)[i])}:${line} ${key}${hasKey(F, key) ? "" : " [fr]"}${hasKey(E, key) ? "" : " [en]"}`));
    expect(missing).toEqual([]);
  });

  it("le français et l'anglais ont les mêmes clés", () => {
    expect(Object.keys(E).filter((k) => !(k in F))).toEqual([]);
    expect(Object.keys(F).filter((k) => !(k in E))).toEqual([]);
  });

  it("les textes anglais en dur ne progressent pas", () => {
    const counts: Record<string, number> = {};
    for (const s of scans) for (const f of s.findings) counts[f.file] = (counts[f.file] ?? 0) + 1;
    if (process.env.UPDATE_I18N_BASELINE) {
      const sorted = Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
      fs.writeFileSync(BASELINE, JSON.stringify(sorted, null, 2) + "\n");
      return;
    }
    const baseline: Record<string, number> = JSON.parse(fs.readFileSync(BASELINE, "utf8"));
    const worse = Object.entries(counts)
      .filter(([file, n]) => n > (baseline[file] ?? 0))
      .map(([file, n]) => {
        const examples = scans.flatMap((s) => s.findings).filter((f) => f.file === file).slice(0, 5).map((f) => `  l.${f.line} « ${f.text} »`).join("\n");
        return `${file} : ${n} textes en dur (plafond ${baseline[file] ?? 0}). Passez-les par t() :\n${examples}`;
      });
    expect(worse, worse.join("\n\n")).toEqual([]);
  });
});
