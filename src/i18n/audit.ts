/**
 * Audit des traductions (utilisé par src/i18n/__tests__/translations.test.ts, jamais par l'application) :
 * - les clés t("…") utilisées dans le code et absentes de fr.json ou en.json ;
 * - les textes d'interface anglais écrits en dur (texte JSX, attributs visibles, titres de toast, libellés…).
 * La détection des textes est volontairement prudente : elle vise ce qui s'affiche, pas les codes ou les classes.
 */
import ts from "typescript";
import fs from "node:fs";
import path from "node:path";

const ATTRS = new Set(["placeholder", "title", "aria-label", "alt", "label", "description", "emptyText", "tooltip", "helperText", "confirmText", "cancelText", "subtitle", "buttonLabel"]);
const PROPS = new Set(["title", "description", "label", "placeholder", "message", "text", "buttonLabel", "confirmLabel", "cancelLabel", "emptyText", "subtitle", "tooltip", "hint", "desc"]);
const NOTIFY = /^(toast(\.(success|error|info|warning|message))?|alert|confirm|window\.confirm)$/;

/** Ce texte ressemble-t-il à une phrase d'interface en anglais ? */
export function looksEnglish(raw: string): boolean {
  const t = raw.replace(/\s+/g, " ").trim();
  if (t.length < 2 || !/[A-Za-z]{2}/.test(t)) return false;
  if (/^[\w.-]+\.[\w.-]+$/.test(t) && !t.includes(" ")) return false;
  if (/^(https?:|\/|#|[a-z]+:)/.test(t) || /^[a-z0-9_-]+$/.test(t)) return false;
  if (/^[A-Z0-9_]+$/.test(t)) return false;
  if (/^[\p{Emoji}\s·•—–\-+|:/()0-9%€$.,!?]+$/u.test(t)) return false;
  return /\b(the|a|an|to|of|and|or|your|you|no|yet|add|create|save|cancel|delete|edit|view|see|loading|failed|error|this|with|for|new|all|more|less|search|select|choose|back|next|close|open|join|leave|send|submit|update|remove|invite|settings|members?|quests?|guilds?|needs?|proposals?|contributions?|is|are|be|not|from|by|on|in|at|my|our|here|now|share|copy|copied|follow|request|apply|approve|reject|status|name|description|title|amount|date|time|none|empty|available|link|upload|download|file|files|task|tasks|subtasks?|event|events|overview|activity|details|budget|fund(ing|s)?|credits?|coins?|xp|level|profile|account|sign|log|login|logout|welcome|get started|learn|help|about|done|confirm|continue|skip|start|stop|pending|active|completed|cancelled|draft|public|private|owner|admin|role|roles|territor(y|ies)|topics?)\b/i.test(t)
    && !/[àâçéèêëîïôûùüÿœæ]/i.test(t)
    && !/\b(le|la|les|des|du|une|un|et|pour|avec|sur|dans|vos|votre|aucun|ajouter)\b/i.test(t);
}

export interface Finding { file: string; line: number; kind: string; text: string }

/** Tous les fichiers .ts/.tsx d'interface sous `root` (hors tests, types générés et traductions). */
export function sourceFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const f of fs.readdirSync(d)) {
      const p = path.join(d, f);
      if (fs.statSync(p).isDirectory()) { if (!/node_modules|__tests__|[\\/]i18n$|[\\/]test$/.test(p)) walk(p); }
      else if (/\.(tsx|ts)$/.test(f) && !/\.test\.|\.d\.ts$|integrations[\\/]supabase[\\/]types/.test(p)) out.push(p);
    }
  };
  walk(root);
  return out.sort();
}

export function scanFile(file: string, root: string): { findings: Finding[]; keys: { key: string; line: number }[] } {
  const src = fs.readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const rel = path.relative(root, file).split(path.sep).join("/");
  const line = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const findings: Finding[] = [];
  const keys: { key: string; line: number }[] = [];
  const hit = (n: ts.Node, kind: string, text: string) => findings.push({ file: rel, line: line(n), kind, text: text.replace(/\s+/g, " ").trim() });
  const isStr = (n: ts.Node | undefined): n is ts.StringLiteral | ts.NoSubstitutionTemplateLiteral => !!n && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n));
  const inUiBranch = (n: ts.Node): boolean => {
    let c: ts.Node = n, p: ts.Node | undefined = n.parent, branch = false;
    while (p && (ts.isParenthesizedExpression(p) || ts.isConditionalExpression(p) ||
      (ts.isBinaryExpression(p) && [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(p.operatorToken.kind)))) {
      if (ts.isConditionalExpression(p) && p.condition === c) return false;
      if ((ts.isConditionalExpression(p) && (p.whenTrue === c || p.whenFalse === c)) || (ts.isBinaryExpression(p) && p.right === c)) branch = true;
      c = p; p = p.parent;
    }
    if (!branch || !p) return false;
    if (ts.isJsxExpression(p)) return ts.isJsxElement(p.parent) || ts.isJsxFragment(p.parent) || (ts.isJsxAttribute(p.parent) && ATTRS.has(p.parent.name.getText(sf)));
    if (ts.isPropertyAssignment(p)) return PROPS.has(p.name.getText(sf));
    if (ts.isCallExpression(p)) return NOTIFY.test(p.expression.getText(sf));
    return false;
  };
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n) && isStr(n.arguments[0]) && /(^|\.)t$/.test(n.expression.getText(sf)) && /^[a-zA-Z][\w-]*(\.[\w-]+)+$/.test(n.arguments[0].text)) {
      keys.push({ key: n.arguments[0].text, line: line(n) });
    }
    if (ts.isJsxText(n) && looksEnglish(n.text)) hit(n, "texte", n.text);
    else if (ts.isJsxAttribute(n) && n.initializer && ts.isStringLiteral(n.initializer) && ATTRS.has(n.name.getText(sf)) && looksEnglish(n.initializer.text)) hit(n, n.name.getText(sf), n.initializer.text);
    else if (ts.isJsxExpression(n) && isStr(n.expression) && looksEnglish(n.expression.text) && n.parent && (ts.isJsxElement(n.parent) || ts.isJsxFragment(n.parent))) hit(n, "texte", n.expression.text);
    else if (ts.isPropertyAssignment(n) && PROPS.has(n.name.getText(sf)) && isStr(n.initializer) && looksEnglish(n.initializer.text)) hit(n, "propriété " + n.name.getText(sf), n.initializer.text);
    else if (ts.isCallExpression(n) && NOTIFY.test(n.expression.getText(sf)) && isStr(n.arguments[0]) && looksEnglish(n.arguments[0].text)) hit(n, n.expression.getText(sf), n.arguments[0].text);
    else if (isStr(n) && looksEnglish(n.text) && inUiBranch(n)) hit(n, "condition", n.text);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return { findings, keys };
}

export function flatten(obj: Record<string, unknown>, prefix = "", out: Record<string, unknown> = {}): Record<string, unknown> {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v as Record<string, unknown>, key, out);
    else out[key] = v;
  }
  return out;
}

/** Une clé existe si elle est une feuille, une forme plurielle (_one / _other) ou une section entière. */
export function hasKey(flat: Record<string, unknown>, key: string): boolean {
  if (key in flat || `${key}_one` in flat || `${key}_other` in flat) return true;
  const prefix = key + ".";
  return Object.keys(flat).some((k) => k.startsWith(prefix));
}
