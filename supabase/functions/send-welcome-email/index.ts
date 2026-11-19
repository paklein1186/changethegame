import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BASE_URL = "https://changethegame.xyz";
const APP_NAME = "changethegame";

const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

// Même charte que les autres e-mails de la plateforme (send-notification-email) : violet changethegame, DM Sans.
const COPY = {
  fr: {
    subject: (n: string) => n ? `Bienvenue sur changethegame, ${n} 🌿` : "Bienvenue sur changethegame 🌿",
    hello: (n: string) => n ? `Bienvenue, ${n} !` : "Bienvenue !",
    intro: "Ravi de vous compter parmi les personnes, collectifs et lieux qui coopèrent sur leurs territoires.",
    start: "Pour bien démarrer :",
    items: [
      ["/explore?tab=quests", "Découvrir les quêtes", "et rejoindre un projet qui vous parle"],
      ["/explore?tab=entities", "Trouver une guilde", "— un collectif autour de vos sujets"],
      ["/explore?tab=territories", "Explorer votre territoire", "et l'écosystème qui l'anime"],
      ["/profile/edit", "Compléter votre profil", "pour que les bonnes personnes vous trouvent"],
    ],
    cta: "Ouvrir changethegame",
    footer: "Vous recevez cet e-mail parce que vous venez de créer votre compte.",
    prefs: "Gérer mes notifications",
  },
  en: {
    subject: (n: string) => n ? `Welcome to changethegame, ${n} 🌿` : "Welcome to changethegame 🌿",
    hello: (n: string) => n ? `Welcome, ${n}!` : "Welcome!",
    intro: "Glad to have you among the people, collectives and places cooperating across their territories.",
    start: "A few ways to get started:",
    items: [
      ["/explore?tab=quests", "Discover quests", "and join a project that speaks to you"],
      ["/explore?tab=entities", "Find a guild", "— a collective around the topics you care about"],
      ["/explore?tab=territories", "Explore your territory", "and the ecosystem around it"],
      ["/profile/edit", "Complete your profile", "so the right people can find you"],
    ],
    cta: "Open changethegame",
    footer: "You're receiving this email because you just created your account.",
    prefs: "Manage notifications",
  },
} as const;

function buildWelcomeHtml(name: string, lang: "fr" | "en"): string {
  const c = COPY[lang];
  const items = c.items.map(([path, label, rest]) => `
        <tr><td style="padding:8px 0;font-size:15px;line-height:1.5;color:hsl(250,12%,36%);">
          <a href="${BASE_URL}${path}" style="color:hsl(262,83%,58%);font-weight:600;text-decoration:none;">${label}</a> ${rest}
        </td></tr>`).join("");
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:#f5f4fb;font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px;">
    <div style="background:linear-gradient(135deg,hsl(262,83%,58%),hsl(290,70%,58%));border-radius:12px 12px 0 0;padding:20px 28px;">
      <span style="font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:rgba(255,255,255,0.9);">${APP_NAME}</span>
    </div>
    <div style="background:#ffffff;border:1px solid hsl(250,18%,90%);border-top:none;border-radius:0 0 12px 12px;padding:32px 28px;">
      <h1 style="font-size:22px;font-weight:700;color:hsl(250,30%,8%);margin:0 0 12px;">${c.hello(esc(name))}</h1>
      <p style="font-size:15px;line-height:1.6;color:hsl(250,12%,36%);margin:0 0 20px;">${c.intro}</p>
      <p style="font-size:15px;font-weight:600;color:hsl(250,30%,8%);margin:0 0 4px;">${c.start}</p>
      <table role="presentation" style="width:100%;border-collapse:collapse;margin:0 0 24px;">${items}
      </table>
      <a href="${BASE_URL}/home" style="display:inline-block;background:hsl(262,83%,58%);color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">${c.cta}</a>
      <hr style="border:none;border-top:1px solid hsl(250,18%,90%);margin:32px 0 20px;" />
      <p style="font-size:12px;color:hsl(250,12%,46%);line-height:1.6;margin:0;">
        ${c.footer}
        <a href="${BASE_URL}/me/settings" style="color:hsl(262,83%,58%);text-decoration:underline;">${c.prefs}</a>
      </p>
    </div>
    <p style="text-align:center;font-size:11px;color:hsl(250,12%,46%);margin-top:16px;">
      <a href="${BASE_URL}" style="color:hsl(250,12%,46%);">changethegame.xyz</a>
    </p>
  </div>
</body>
</html>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userId, lang: uiLang } = await req.json();
    if (!userId) {
      return new Response(JSON.stringify({ error: "userId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Seule la personne elle-même (ou un appel serveur) peut déclencher son e-mail de bienvenue.
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (token !== supabaseServiceKey) {
      const { data: auth } = await supabase.auth.getUser(token);
      if (!auth?.user || auth.user.id !== userId) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Check if welcome email was already sent (idempotency via activity_log)
    const { data: existing } = await supabase
      .from("activity_log")
      .select("id")
      .eq("actor_user_id", userId)
      .eq("action_type", "welcome_email_sent")
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({ skipped: true, reason: "already_sent" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch user profile
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("name, email, preferred_language")
      .eq("user_id", userId)
      .maybeSingle();

    if (profileError || !profile) {
      throw new Error(`Profile not found for user ${userId}`);
    }

    const email = profile.email;
    // Langue de l'interface au moment de l'inscription, sinon celle du profil (qui vaut « en » par défaut).
    const langSource = String(uiLang ?? (profile as any).preferred_language ?? "").toLowerCase();
    const lang: "fr" | "en" = langSource.startsWith("fr") ? "fr" : "en";
    const name = String(profile.name ?? "").trim();

    if (!email) {
      throw new Error("User has no email address");
    }

    // Send via Resend
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${APP_NAME} <hello@changethegame.xyz>`,
        to: [email],
        subject: COPY[lang].subject(name),
        html: buildWelcomeHtml(name, lang),
      }),
    });

    const resendData = await resendRes.json();
    if (!resendRes.ok) {
      throw new Error(`Resend API error [${resendRes.status}]: ${JSON.stringify(resendData)}`);
    }

    // Mark welcome email as sent in activity_log
    await supabase.from("activity_log").insert({
      actor_user_id: userId,
      action_type: "welcome_email_sent",
      target_type: "USER",
      target_id: userId,
      metadata: { resend_id: resendData.id },
    });

    console.log(`✅ Welcome email sent to ${email} (Resend ID: ${resendData.id})`);

    return new Response(JSON.stringify({ success: true, resend_id: resendData.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error sending welcome email:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
