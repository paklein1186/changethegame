// @ts-nocheck — comme guild-euro-webhook : le SDK Stripe chargé depuis esm.sh n'est pas typé dans la vérification de prévisualisation.
// Rappel une semaine avant le renouvellement d'une cotisation de guilde payée en euros (abonnement Stripe).
// Appelée une fois par jour par le cron. Pour chaque payeur dont la période se termine dans les 7 jours :
//   - relit l'abonnement chez Stripe (montant, moyen de paiement, arrêt éventuel du renouvellement) ;
//   - envoie un e-mail (Resend) et une notification sur le site ;
//   - note la fin de période dans renewal_reminder_sent_for : un seul rappel par période.
// Les bénéficiaires d'une place payée par quelqu'un d'autre ne reçoivent rien : ils ne paient pas.
// Appel manuel par un admin de la plateforme avec { "dry_run": true } : liste ce qui partirait, sans rien envoyer.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { authenticateCronRequest } from "../_shared/cron-auth.ts";
import { periodEnd } from "../_shared/guild-euro-membership.ts";
import { BASE_URL, esc, renderBrandEmail, sendBrandEmail } from "../_shared/brand-email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const REMIND_DAYS = 7;
const DAY = 86_400_000;

const log = (step: string, details?: unknown) =>
  console.log(`[GUILD-MEMBERSHIP-REMINDERS] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const money = (cents: number, currency: string) =>
  (cents / 100).toLocaleString("fr-BE", { style: "currency", currency: currency.toUpperCase(), maximumFractionDigits: 2 });

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-BE", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Brussels" });

/** « Visa •••• 4242 », « prélèvement SEPA •••• 1234 », ou null si inconnu. */
function describePaymentMethod(pm: any): string | null {
  if (!pm || typeof pm !== "object") return null;
  if (pm.type === "card" && pm.card) {
    const brand = String(pm.card.brand ?? "carte");
    return `${brand.charAt(0).toUpperCase()}${brand.slice(1)} •••• ${pm.card.last4}`;
  }
  if (pm.type === "sepa_debit" && pm.sepa_debit) return `prélèvement SEPA •••• ${pm.sepa_debit.last4}`;
  return null;
}

interface Reminder {
  guildName: string;
  guildId: string;
  planLabel: string;
  amount: string | null;
  interval: "month" | "year" | null;
  renewsOn: string;
  paymentMethod: string | null;
}

function buildHtml(name: string, r: Reminder): string {
  const rhythm = r.interval === "month" ? "mensuelle " : r.interval === "year" ? "annuelle " : "";
  const how = r.paymentMethod ? `sur ${r.paymentMethod}` : "sur le moyen de paiement enregistré";
  return renderBrandEmail({
    lang: "fr",
    heading: name ? `Bonjour ${name},` : "Bonjour,",
    paragraphs: [
      `Votre cotisation ${rhythm}à <strong>${esc(r.guildName)}</strong> se renouvelle automatiquement le <strong>${esc(r.renewsOn)}</strong>.`,
      "Vous n'avez rien à faire pour rester adhérent. Pour changer de carte ou arrêter le renouvellement, c'est ici :",
    ],
    details: [
      ["Formule", r.planLabel],
      ["Montant", r.amount ?? "inchangé"],
      ["Prélevé le", r.renewsOn],
      ["Moyen de paiement", how.replace(/^sur /, "")],
    ],
    cta: { label: "Gérer ma cotisation", url: `${BASE_URL}/guilds/${r.guildId}?cotisation=gerer` },
    footer: `Vous recevez cet e-mail parce que vous avez une cotisation active à ${esc(r.guildName)}. Si vous arrêtez le renouvellement, votre adhésion reste valable jusqu'au ${esc(r.renewsOn)}.`,
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });
  const body = await req.json().catch(() => ({}));

  // Cron géré (LOVABLE_CRON_SECRET), cron pg_net (CRON_SECRET), ou admin de la plateforme.
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

  const now = Date.now();
  const report = { checked: 0, sent: 0, skipped_cancelled: 0, skipped_no_email: 0, failed: 0, dry_run: dryRun, preview: [] as unknown[] };

  try {
    // Payeurs uniquement (stripe_customer_id renseigné), période qui se termine dans les 7 jours,
    // renouvellement non arrêté. Le rappel déjà parti pour cette période est filtré plus bas.
    const { data: rows, error } = await admin
      .from("user_guild_plans")
      .select("id, user_id, guild_id, plan_code, stripe_subscription_id, stripe_customer_id, current_period_end, renewal_reminder_sent_for, amount_paid_cents, currency")
      .eq("status", "active")
      .eq("cancel_at_period_end", false)
      .not("stripe_subscription_id", "is", null)
      .not("stripe_customer_id", "is", null)
      .gt("current_period_end", new Date(now).toISOString())
      .lte("current_period_end", new Date(now + REMIND_DAYS * DAY).toISOString());
    if (error) throw error;

    const due = (rows ?? []).filter(
      (m: any) => !m.renewal_reminder_sent_for || new Date(m.renewal_reminder_sent_for).getTime() !== new Date(m.current_period_end).getTime(),
    );
    const guildIds = [...new Set(due.map((m: any) => m.guild_id))];
    const { data: guilds } = guildIds.length
      ? await admin.from("guilds").select("id, name, stripe_account_ref, euro_membership_enabled").in("id", guildIds)
      : { data: [] };
    const guildById = new Map((guilds ?? []).map((g: any) => [g.id, g]));
    const stripeByRef = new Map<string, any>();

    for (const m of due as any[]) {
      report.checked++;
      const guild: any = guildById.get(m.guild_id);
      if (!guild?.stripe_account_ref) continue;

      let renewsAt: string = m.current_period_end;
      let amountCents: number | null = m.amount_paid_cents ?? null;
      let currency: string = m.currency ?? "eur";
      let interval: "month" | "year" | null = null;
      let paymentMethod: string | null = null;

      // L'abonnement chez Stripe fait foi : montant, rythme, carte, et arrêt demandé depuis Stripe.
      const secret = Deno.env.get(`STRIPE_SECRET_KEY_${guild.stripe_account_ref}`);
      if (secret) {
        if (!stripeByRef.has(guild.stripe_account_ref)) {
          stripeByRef.set(guild.stripe_account_ref, new Stripe(secret, { apiVersion: "2025-08-27.basil" }));
        }
        try {
          const sub = await stripeByRef.get(guild.stripe_account_ref).subscriptions.retrieve(m.stripe_subscription_id, {
            expand: ["default_payment_method", "customer.invoice_settings.default_payment_method"],
          });
          if (!["active", "trialing"].includes(sub.status) || sub.cancel_at_period_end) {
            await admin.from("user_guild_plans")
              .update({ cancel_at_period_end: Boolean(sub.cancel_at_period_end) })
              .eq("id", m.id);
            report.skipped_cancelled++;
            continue;
          }
          renewsAt = periodEnd(sub) ?? renewsAt;
          const items = sub.items?.data ?? [];
          const total = items.reduce((s: number, it: any) => s + (it.price?.unit_amount ?? 0) * (it.quantity ?? 1), 0);
          if (total > 0) amountCents = total;
          currency = items[0]?.price?.currency ?? currency;
          interval = items[0]?.price?.recurring?.interval ?? null;
          paymentMethod =
            describePaymentMethod(sub.default_payment_method) ??
            describePaymentMethod(sub.customer?.invoice_settings?.default_payment_method);
        } catch (e) {
          log("Stripe lookup failed, using stored values", { membership: m.id, msg: e instanceof Error ? e.message : String(e) });
        }
      }

      const [{ data: profile }, { data: plan }] = await Promise.all([
        admin.from("profiles").select("name, email").eq("user_id", m.user_id).maybeSingle(),
        m.plan_code
          ? admin.from("guild_membership_plans").select("label, billing_interval").eq("guild_id", m.guild_id).eq("code", m.plan_code).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      interval = interval ?? plan?.billing_interval ?? null;

      const reminder: Reminder = {
        guildName: guild.name,
        guildId: guild.id,
        planLabel: plan?.label ?? m.plan_code ?? "Cotisation",
        amount: amountCents ? money(amountCents, currency) : null,
        interval,
        renewsOn: day(renewsAt),
        paymentMethod,
      };

      if (dryRun) {
        report.preview.push({ membership_id: m.id, guild: guild.name, renews_on: reminder.renewsOn, amount: reminder.amount, interval, has_email: !!profile?.email });
        continue;
      }

      let emailed = false;
      if (profile?.email) {
        emailed = await sendBrandEmail(
          profile.email,
          `Votre cotisation à ${guild.name} se renouvelle le ${reminder.renewsOn}`,
          buildHtml(String(profile.name ?? "").trim(), reminder),
        );
        if (!emailed) {
          // E-mail raté : rien n'est noté, on réessaie au prochain passage (sans doublon de notification).
          report.failed++;
          continue;
        }
      } else {
        report.skipped_no_email++;
      }

      await admin.from("notifications").insert({
        user_id: m.user_id,
        type: "GUILD_MEMBERSHIP_RENEWAL_REMINDER",
        title: "Renouvellement de cotisation",
        body: `Votre cotisation à ${guild.name} se renouvelle le ${reminder.renewsOn}${reminder.amount ? ` (${reminder.amount})` : ""}.`,
        related_entity_type: "guild",
        related_entity_id: guild.id,
        deep_link_url: `/guilds/${guild.id}?cotisation=gerer`,
      });

      await admin.from("user_guild_plans").update({ renewal_reminder_sent_for: m.current_period_end }).eq("id", m.id);
      if (emailed) report.sent++;
    }

    log("Done", { ...report, preview: report.preview.length });
    return json({ ok: true, ...report });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log("ERROR", { msg });
    return json({ error: msg }, 500);
  }
});
