// Gabarit des e-mails transactionnels changethegame (même charte que send-welcome-email) et envoi par Resend.
// Les paragraphes sont du HTML : échapper toute valeur venant de la base avec esc().

export const BASE_URL = "https://changethegame.xyz";

export const esc = (v: string): string =>
  v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

export interface BrandEmail {
  lang: "fr" | "en";
  heading: string;
  paragraphs: string[];
  /** Lignes « libellé / valeur » affichées dans un encadré (texte brut, échappé ici). */
  details?: [string, string][];
  cta?: { label: string; url: string };
  footer: string;
}

export function renderBrandEmail(e: BrandEmail): string {
  const p = (html: string) =>
    `<p style="font-size:15px;line-height:1.6;color:hsl(250,12%,36%);margin:0 0 20px;">${html}</p>`;
  const details = e.details?.length
    ? `<table role="presentation" style="width:100%;border-collapse:collapse;margin:0 0 24px;background:hsl(250,30%,98%);border:1px solid hsl(250,18%,90%);border-radius:8px;">${e.details
        .map(
          ([k, v]) =>
            `<tr><td style="padding:10px 16px;font-size:14px;color:hsl(250,12%,36%);">${esc(k)}</td><td style="padding:10px 16px;font-size:14px;color:hsl(250,30%,8%);text-align:right;font-weight:600;">${esc(v)}</td></tr>`,
        )
        .join("")}</table>`
    : "";
  const cta = e.cta
    ? `<a href="${e.cta.url}" style="display:inline-block;background:hsl(262,83%,58%);color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">${esc(e.cta.label)}</a>`
    : "";
  return `<!DOCTYPE html>
<html lang="${e.lang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:#f5f4fb;font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px;">
    <div style="background:linear-gradient(135deg,hsl(262,83%,58%),hsl(290,70%,58%));border-radius:12px 12px 0 0;padding:20px 28px;">
      <span style="font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:rgba(255,255,255,0.9);">changethegame</span>
    </div>
    <div style="background:#ffffff;border:1px solid hsl(250,18%,90%);border-top:none;border-radius:0 0 12px 12px;padding:32px 28px;">
      <h1 style="font-size:22px;font-weight:700;color:hsl(250,30%,8%);margin:0 0 12px;">${esc(e.heading)}</h1>
      ${e.paragraphs.map(p).join("\n      ")}
      ${details}
      ${cta}
      <hr style="border:none;border-top:1px solid hsl(250,18%,90%);margin:32px 0 20px;" />
      <p style="font-size:12px;color:hsl(250,12%,46%);line-height:1.6;margin:0;">${e.footer}</p>
    </div>
    <p style="text-align:center;font-size:11px;color:hsl(250,12%,46%);margin-top:16px;">
      <a href="${BASE_URL}" style="color:hsl(250,12%,46%);">changethegame.xyz</a>
    </p>
  </div>
</body>
</html>`;
}

/** Envoie par Resend ; false si la clé manque ou si Resend refuse (la cause est journalisée). */
export async function sendBrandEmail(to: string, subject: string, html: string): Promise<boolean> {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) {
    console.warn("[brand-email] RESEND_API_KEY absent : e-mail non envoyé");
    return false;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "changethegame <hello@changethegame.xyz>", to: [to], subject, html }),
  });
  if (!res.ok) {
    console.error(`[brand-email] Resend ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return false;
  }
  return true;
}
