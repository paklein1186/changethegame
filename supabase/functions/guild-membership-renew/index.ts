// Renouvellement des cotisations de guilde payées en Coins (formules mensuelles ou annuelles).
// Appelée une fois par jour par le cron. Pour chaque adhésion récurrente :
//   - 7 jours avant la fin de période : e-mail + notification de rappel, avec un avertissement si le solde
//     ne couvre pas le montant (un seul rappel par période : renewal_reminder_sent_for) ;
//   - à la fin de période : renouvellement atomique par renew_guild_membership_coins (aucun double débit,
//     même si l'appel est rejoué), reçu par e-mail ;
//   - solde insuffisant : 7 jours de grâce (e-mail), nouvelle tentative chaque jour, puis retour au statut d'invité ;
//   - renouvellement arrêté par le membre : retour au statut d'invité à la fin de période.
// Les cotisations en euros (abonnement Stripe) ne passent pas ici : voir guild-euro-webhook et guild-membership-reminders.
// Appel manuel par un admin de la plateforme avec { "dry_run": true } : décrit ce qui serait fait, sans rien changer.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { authenticateCronRequest } from "../_shared/cron-auth.ts";
import { BASE_URL, esc, renderBrandEmail, sendBrandEmail } from "../_shared/brand-email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const log = (step: string, details?: unknown) =>
  console.log(`[GUILD-MEMBERSHIP-RENEW] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const GRACE_DAYS = 7;
const REMIND_DAYS = 7;
const DAY = 86_400_000;

type Lang = "fr" | "en";
type Interval = "month" | "year";

/** Montant d'une période : le montant choisi par le membre si la guilde propose une fourchette, sinon le prix fixe. */
function periodFee(guild: any, chosen: unknown): number {
  const min = Number(guild?.monthly_fee_credits ?? 0);
  const max = Number(guild?.monthly_fee_max_credits ?? 0);
  if (max > min) {
    const c = Number(chosen ?? 0);
    return c > 0 ? Math.min(Math.max(c, min), max) : min;
  }
  return min;
}

function intervalOf(billingModel: unknown): Interval | null {
  return billingModel === "monthly" ? "month" : billingModel === "yearly" ? "year" : null;
}

const fmtDate = (iso: string, lang: Lang) =>
  new Date(iso).toLocaleDateString(lang === "fr" ? "fr-BE" : "en-GB", {
    day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Brussels",
  });

const rhythmFr = (i: Interval) => (i === "month" ? "mensuelle" : "annuelle");
const rhythmEn = (i: Interval) => (i === "month" ? "monthly" : "yearly");

const T = {
  fr: {
    hello: (n: string) => (n ? `Bonjour ${n},` : "Bonjour,"),
    wallet: "Recharger mes Coins",
    manage: "Voir ma cotisation",
    footer: (g: string) => `Vous recevez cet e-mail parce que vous êtes membre cotisant de ${esc(g)}.`,
    details: (fee: number, date: string, balance: number) =>
      [["Montant", `${fee} Coins`], ["Prélevé le", date], ["Votre solde actuel", `${balance} Coins`]] as [string, string][],
    reminder: {
      subject: (g: string, d: string) => `Votre cotisation à ${g} se renouvelle le ${d}`,
      body: (g: string, i: Interval, d: string) =>
        `Votre cotisation ${rhythmFr(i)} à <strong>${esc(g)}</strong> se renouvelle automatiquement le <strong>${esc(d)}</strong>, prélevée sur votre solde de Coins.`,
      ok: "Votre solde couvre le renouvellement : vous n'avez rien à faire. Vous pouvez arrêter le renouvellement depuis la page de la guilde.",
      short: (missing: number) =>
        `Il vous manque <strong>${missing} Coins</strong> pour ce renouvellement. Rechargez votre portefeuille avant cette date pour rester membre.`,
      notif: (g: string, d: string, fee: number) => `Votre cotisation à ${g} se renouvelle le ${d} (${fee} Coins).`,
      title: "Renouvellement de cotisation",
    },
    renewed: {
      subject: (g: string) => `Cotisation renouvelée : ${g}`,
      body: (g: string, fee: number, d: string) =>
        `Votre cotisation à <strong>${esc(g)}</strong> a été renouvelée : ${fee} Coins ont été prélevés. Votre adhésion court jusqu'au <strong>${esc(d)}</strong>.`,
      title: "Cotisation renouvelée",
      notif: (g: string, fee: number, d: string) => `${fee} Coins prélevés pour ${g}. Adhésion jusqu'au ${d}.`,
    },
    failed: {
      subject: (g: string) => `Action requise : votre cotisation à ${g}`,
      body: (g: string, fee: number, balance: number) =>
        `Nous n'avons pas pu renouveler votre cotisation à <strong>${esc(g)}</strong> : il faut ${fee} Coins et votre solde est de ${balance} Coins.`,
      grace: (d: string) => `Vous restez membre jusqu'au <strong>${esc(d)}</strong>. Rechargez vos Coins d'ici là : le renouvellement sera retenté chaque jour.`,
      title: "Cotisation : solde insuffisant",
      notif: (g: string, fee: number, d: string) => `Il faut ${fee} Coins pour renouveler votre cotisation à ${g}. Rechargez avant le ${d}.`,
    },
    lapsed: {
      subject: (g: string) => `Votre adhésion à ${g} a pris fin`,
      body: (g: string) =>
        `Faute de solde suffisant, votre adhésion à <strong>${esc(g)}</strong> a pris fin. Vous restez invité de la guilde et pouvez cotiser à nouveau à tout moment.`,
      title: "Adhésion terminée",
      notif: (g: string) => `Votre adhésion à ${g} a pris fin. Vous pouvez cotiser à nouveau à tout moment.`,
    },
    cancelled: {
      title: "Adhésion terminée",
      notif: (g: string) => `Comme demandé, votre adhésion à ${g} n'a pas été renouvelée.`,
    },
  },
  en: {
    hello: (n: string) => (n ? `Hello ${n},` : "Hello,"),
    wallet: "Top up my Coins",
    manage: "See my membership",
    footer: (g: string) => `You are receiving this email because you are a paying member of ${esc(g)}.`,
    details: (fee: number, date: string, balance: number) =>
      [["Amount", `${fee} Coins`], ["Charged on", date], ["Your current balance", `${balance} Coins`]] as [string, string][],
    reminder: {
      subject: (g: string, d: string) => `Your ${g} membership renews on ${d}`,
      body: (g: string, i: Interval, d: string) =>
        `Your ${rhythmEn(i)} membership of <strong>${esc(g)}</strong> renews automatically on <strong>${esc(d)}</strong>, from your Coins balance.`,
      ok: "Your balance covers the renewal: nothing to do. You can stop the renewal from the guild page.",
      short: (missing: number) =>
        `You are <strong>${missing} Coins</strong> short for this renewal. Top up your wallet before that date to stay a member.`,
      notif: (g: string, d: string, fee: number) => `Your membership of ${g} renews on ${d} (${fee} Coins).`,
      title: "Membership renewal coming up",
    },
    renewed: {
      subject: (g: string) => `Membership renewed: ${g}`,
      body: (g: string, fee: number, d: string) =>
        `Your membership of <strong>${esc(g)}</strong> has been renewed: ${fee} Coins were charged. You are a member until <strong>${esc(d)}</strong>.`,
      title: "Membership renewed",
      notif: (g: string, fee: number, d: string) => `${fee} Coins charged for ${g}. Member until ${d}.`,
    },
    failed: {
      subject: (g: string) => `Action needed: your ${g} membership`,
      body: (g: string, fee: number, balance: number) =>
        `We could not renew your membership of <strong>${esc(g)}</strong>: it costs ${fee} Coins and your balance is ${balance} Coins.`,
      grace: (d: string) => `You remain a member until <strong>${esc(d)}</strong>. Top up your Coins by then: we will retry every day.`,
      title: "Membership renewal needs Coins",
      notif: (g: string, fee: number, d: string) => `Renewing your membership of ${g} needs ${fee} Coins. Top up before ${d}.`,
    },
    lapsed: {
      subject: (g: string) => `Your ${g} membership has ended`,
      body: (g: string) =>
        `Your membership of <strong>${esc(g)}</strong> has ended because your balance was too low. You are still a guest and can rejoin at any time.`,
      title: "Membership lapsed",
      notif: (g: string) => `Your membership of ${g} has ended. You can rejoin at any time.`,
    },
    cancelled: {
      title: "Membership ended",
      notif: (g: string) => `As requested, your membership of ${g} was not renewed.`,
    },
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });
  const body = await req.json().catch(() => ({}));

  // Cron géré (LOVABLE_CRON_SECRET), cron pg_net (CRON_SECRET), ou admin de la plateforme. Avant : aucun contrôle.
  const cronSecret = Deno.env.get("CRON_SECRET");
  const managedCron = !!Deno.env.get("LOVABLE_CRON_SECRET") && authenticateCronRequest(req) === null;
  let allowed = managedCron || (!!cronSecret && req.headers.get("x-cron-secret") === cronSecret);
  if (!allowed) {
    const anon = createClient(url, Deno.env.get("SUPABASE_ANON_KEY") ?? "", { auth: { persistSession: false } });
    const { data: auth } = await anon.auth.getUser((req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, ""));
    if (auth?.user) {
      const { data: isAdmin } = await admin.rpc("has_role", { _user_id: auth.user.id, _role: "admin" });
      allowed = isAdmin === true;
    }
  }
  if (!allowed) return json({ error: "Unauthorized" }, 401);
  const dryRun = body?.dry_run === true;

  const results = { reminders: 0, renewed: 0, grace: 0, lapsed: 0, cancelled: 0, emails_failed: 0, dry_run: dryRun, preview: [] as unknown[] };

  try {
    const now = Date.now();
    const { data: memberships, error } = await admin
      .from("user_guild_memberships")
      .select(
        "id, user_id, guild_id, status, current_period_end, cancel_at_period_end, chosen_fee_credits, renewal_reminder_sent_for, guilds!inner(id, name, billing_model, monthly_fee_credits, monthly_fee_max_credits, enable_membership, euro_membership_enabled, created_by_user_id)",
      )
      .eq("role", "member")
      .in("status", ["active", "grace"])
      .is("stripe_subscription_id", null)
      .not("current_period_end", "is", null)
      .lte("current_period_end", new Date(now + REMIND_DAYS * DAY).toISOString());
    if (error) throw error;

    const due = ((memberships ?? []) as any[]).filter((m) => {
      const g = m.guilds;
      return g?.enable_membership && !g.euro_membership_enabled && intervalOf(g.billing_model) && g.created_by_user_id !== m.user_id;
    });
    const userIds = [...new Set(due.map((m) => m.user_id))];
    const { data: profiles } = userIds.length
      ? await admin.from("profiles").select("user_id, name, email, coins_balance, preferred_language").in("user_id", userIds)
      : { data: [] };
    const profileOf = new Map(((profiles ?? []) as any[]).map((p) => [p.user_id, p]));

    for (const m of due) {
      const guild = m.guilds;
      const interval = intervalOf(guild.billing_model) as Interval;
      const fee = periodFee(guild, m.chosen_fee_credits);
      if (fee <= 0) continue; // guilde sans montant configuré : rien à prélever ni à rappeler
      const profile = profileOf.get(m.user_id) ?? {};
      const lang: Lang = String(profile.preferred_language ?? "").toLowerCase().startsWith("fr") ? "fr" : "en";
      const t = T[lang];
      const balance = Number(profile.coins_balance ?? 0);
      const end = new Date(m.current_period_end).getTime();
      const name = String(profile.name ?? "").trim();
      const guildLink = `${BASE_URL}/guilds/${guild.id}`;

      const notify = (title: string, text: string) =>
        admin.from("notifications").insert({
          user_id: m.user_id,
          type: "GUILD_MEMBERSHIP_RENEWAL",
          title,
          body: text,
          related_entity_type: "guild",
          related_entity_id: guild.id,
          deep_link_url: `/guilds/${guild.id}`,
        });
      const mail = async (subject: string, paragraphs: string[], details?: [string, string][], cta?: { label: string; url: string }) => {
        if (!profile.email) return true;
        const ok = await sendBrandEmail(
          profile.email,
          subject,
          renderBrandEmail({ lang, heading: t.hello(name), paragraphs, details, cta, footer: t.footer(guild.name) }),
        );
        if (!ok) results.emails_failed++;
        return ok;
      };

      // 1. Période en cours : rappel une semaine avant (une seule fois par période).
      if (end > now) {
        const already = m.renewal_reminder_sent_for && new Date(m.renewal_reminder_sent_for).getTime() === end;
        if (already || m.cancel_at_period_end || m.status !== "active") continue;
        const date = fmtDate(m.current_period_end, lang);
        if (dryRun) {
          results.preview.push({ action: "reminder", membership_id: m.id, guild: guild.name, fee, balance, date });
          continue;
        }
        const short = balance < fee;
        const sent = await mail(
          t.reminder.subject(guild.name, date),
          [t.reminder.body(guild.name, interval, date), short ? t.reminder.short(fee - balance) : t.reminder.ok],
          t.details(fee, date, balance),
          short ? { label: t.wallet, url: `${BASE_URL}/settings/wallet` } : { label: t.manage, url: guildLink },
        );
        if (!sent) continue; // réessai au prochain passage, sans doublon de notification
        await notify(t.reminder.title, t.reminder.notif(guild.name, date, fee));
        await admin.from("user_guild_memberships").update({ renewal_reminder_sent_for: m.current_period_end }).eq("id", m.id);
        results.reminders++;
        continue;
      }

      // 2. Fin de période atteinte, renouvellement arrêté par le membre.
      if (m.cancel_at_period_end) {
        if (dryRun) { results.preview.push({ action: "cancel", membership_id: m.id, guild: guild.name }); continue; }
        await admin.from("user_guild_memberships").update({ role: "guest", status: "cancelled" }).eq("id", m.id);
        await notify(t.cancelled.title, t.cancelled.notif(guild.name));
        results.cancelled++;
        continue;
      }

      if (dryRun) {
        results.preview.push({ action: balance >= fee ? "renew" : m.status === "grace" ? "retry_or_lapse" : "grace", membership_id: m.id, guild: guild.name, fee, balance });
        continue;
      }

      // 3. Renouvellement (atomique : rejouer l'appel ne prélève pas deux fois).
      {
        const { data: r, error: rErr } = await admin.rpc("renew_guild_membership_coins", {
          p_membership_id: m.id,
          p_expected_period_end: m.current_period_end,
          p_amount: fee,
          p_interval: interval,
          p_user_source: `${interval === "month" ? "Monthly" : "Yearly"} membership renewal – ${guild.name}`,
          p_guild_source: `${name || "A member"} renewed for ${fee} Coins`,
        });
        if (rErr) { log("Renew failed", { membership: m.id, msg: rErr.message }); continue; }
        if (r?.ok) {
          const until = fmtDate(r.current_period_end, lang);
          await notify(t.renewed.title, t.renewed.notif(guild.name, fee, until));
          await mail(t.renewed.subject(guild.name), [t.renewed.body(guild.name, fee, until)], undefined, { label: t.manage, url: guildLink });
          results.renewed++;
          continue;
        }
        if (r?.reason !== "insufficient") continue; // déjà traité par un autre passage
      }

      // 4. Solde insuffisant : période de grâce, puis retour au statut d'invité.
      const graceUntil = new Date(end + GRACE_DAYS * DAY);
      const graceDate = fmtDate(graceUntil.toISOString(), lang);
      if (m.status !== "grace") {
        await admin.from("user_guild_memberships").update({ status: "grace" }).eq("id", m.id).eq("status", "active");
        await notify(t.failed.title, t.failed.notif(guild.name, fee, graceDate));
        await mail(
          t.failed.subject(guild.name),
          [t.failed.body(guild.name, fee, balance), t.failed.grace(graceDate)],
          undefined,
          { label: t.wallet, url: `${BASE_URL}/settings/wallet` },
        );
        results.grace++;
      } else if (now > graceUntil.getTime()) {
        await admin.from("user_guild_memberships").update({ role: "guest", status: "lapsed" }).eq("id", m.id).eq("status", "grace");
        await notify(t.lapsed.title, t.lapsed.notif(guild.name));
        await mail(t.lapsed.subject(guild.name), [t.lapsed.body(guild.name)], undefined, { label: t.manage, url: guildLink });
        results.lapsed++;
      }
    }

    log("Done", { ...results, preview: results.preview.length });
    return json({ ok: true, ...results });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log("ERROR", { msg });
    return json({ error: msg }, 500);
  }
});
