import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const log = (step: string, details?: unknown) => {
  console.log(`[GUILD-MEMBERSHIP-PAY] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const anon = createClient(url, Deno.env.get("SUPABASE_ANON_KEY") ?? "", { auth: { persistSession: false } });
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });

  const fail = (message: string, status = 400) =>
    new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return fail("Not authenticated", 401);
    const { data: userData, error: authError } = await anon.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !userData.user) return fail("Not authenticated", 401);
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const guildId = typeof body?.guild_id === "string" ? body.guild_id : null;
    if (!guildId || !/^[0-9a-f-]{36}$/i.test(guildId)) return fail("Invalid guild_id");
    const rawChosen = Number(body?.chosen_amount);
    const chosenAmount = Number.isFinite(rawChosen) && rawChosen > 0 ? Math.round(rawChosen) : null;

    const { data: guild } = await admin
      .from("guilds")
      .select(
        "id, name, enable_membership, entry_fee_credits, entry_fee_max_credits, monthly_fee_credits, monthly_fee_max_credits, joining_fee_credits, billing_model, membership_duration_months, requires_application_before_payment, join_policy, created_by_user_id",
      )
      .eq("id", guildId)
      .maybeSingle();

    if (!guild) return fail("Guild not found", 404);
    if (!guild.enable_membership) return fail("This guild has not enabled membership yet.");

    // Formules récurrentes : mensuelle ou annuelle. Le montant par période est dans monthly_fee_credits (nom historique).
    const interval: "month" | "year" | null =
      guild.billing_model === "monthly" ? "month" : guild.billing_model === "yearly" ? "year" : null;
    const monthly = interval !== null;

    const { data: membership } = await admin
      .from("user_guild_memberships")
      .select("*")
      .eq("user_id", userId)
      .eq("guild_id", guildId)
      .maybeSingle();

    // Guild creator is always a member, never charged
    if (guild.created_by_user_id === userId) {
      return new Response(JSON.stringify({ ok: true, already_member: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Application gating
    const needsApproval =
      guild.requires_application_before_payment || guild.join_policy === "APPROVAL_REQUIRED";
    if (needsApproval) {
      const { data: app } = await admin
        .from("guild_applications")
        .select("id, status")
        .eq("guild_id", guildId)
        .eq("applicant_user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!app) return fail("You need to apply to this guild first.", 403);
      if (app.status !== "APPROVED") return fail("Your application has not been approved yet.", 403);
    }

    const firstPayment = !membership?.last_payment_at;
    const joiningFee = firstPayment ? Number(guild.joining_fee_credits ?? 0) : 0;
    const minFee = monthly ? Number(guild.monthly_fee_credits ?? 0) : Number(guild.entry_fee_credits ?? 0);
    const maxFee = Number(
      (monthly ? guild.monthly_fee_max_credits : guild.entry_fee_max_credits) ?? 0,
    );
    const isRange = maxFee > minFee;

    let baseFee = minFee;
    if (isRange && chosenAmount !== null) {
      if (chosenAmount < minFee || chosenAmount > maxFee) {
        return fail(`Choose an amount between ${minFee} and ${maxFee} Coins.`);
      }
      baseFee = chosenAmount;
    }
    const amount = baseFee + joiningFee;

    if (!amount || amount <= 0) return fail("No membership fee is configured for this guild.");

    // Débit atomique (solde suffisant vérifié dans la même requête) et crédit de la guilde dans la même transaction.
    const { data: profile } = await admin.from("profiles").select("name").eq("user_id", userId).maybeSingle();
    if (!profile) return fail("Profile not found", 404);
    const label = interval === "year" ? "Yearly" : "Monthly";
    const { data: newBalance, error: chargeError } = await admin.rpc("charge_guild_membership_coins", {
      p_user_id: userId,
      p_guild_id: guildId,
      p_amount: amount,
      p_tx_type: monthly ? (interval === "year" ? "MEMBERSHIP_YEARLY" : "MEMBERSHIP_MONTHLY") : "MEMBERSHIP_ENTRY",
      p_user_source: monthly
        ? `${label} membership – ${guild.name}${joiningFee ? " (incl. joining fee)" : ""}`
        : `Membership entry fee – ${guild.name}`,
      p_guild_source: `${profile.name ?? "A member"} paid ${amount} Coins`,
    });
    if (chargeError) throw chargeError;
    if (newBalance === null) return fail(`Not enough Coins. You need ${amount} Coins.`, 402);

    // Membership period
    const now = new Date();
    let periodEnd: string | null = null;
    if (monthly) {
      const base =
        membership?.current_period_end && new Date(membership.current_period_end) > now
          ? new Date(membership.current_period_end)
          : now;
      base.setMonth(base.getMonth() + (interval === "year" ? 12 : 1));
      periodEnd = base.toISOString();
    } else if (guild.membership_duration_months) {
      const d = new Date(now);
      d.setMonth(d.getMonth() + Number(guild.membership_duration_months));
      periodEnd = d.toISOString();
    }

    await admin.from("user_guild_memberships").upsert(
      {
        user_id: userId,
        guild_id: guildId,
        role: "member",
        status: "active",
        joined_at: membership?.joined_at ?? now.toISOString(),
        membership_expires_at: periodEnd,
        current_period_end: periodEnd,
        cancel_at_period_end: false,
        chosen_fee_credits: baseFee,
        last_payment_at: now.toISOString(),
      },
      { onConflict: "user_id,guild_id" },
    );

    // Real member of the guild roster
    await admin
      .from("guild_members")
      .insert({ guild_id: guildId, user_id: userId, role: "MEMBER" })
      .then(() => undefined, () => undefined);

    // Notify guild admins
    const { data: admins } = await admin
      .from("guild_members")
      .select("user_id")
      .eq("guild_id", guildId)
      .eq("role", "ADMIN");
    const adminIds = new Set<string>((admins ?? []).map((a: { user_id: string }) => a.user_id));
    if (guild.created_by_user_id) adminIds.add(guild.created_by_user_id);
    if (adminIds.size > 0) {
      await admin.from("notifications").insert(
        [...adminIds].map((aid) => ({
          user_id: aid,
          type: "GUILD_MEMBERSHIP_PAYMENT",
          title: "New paid membership",
          body: `${profile.name ?? "Someone"} paid ${amount} Coins to join ${guild.name}.`,
          related_entity_type: "guild",
          related_entity_id: guildId,
          deep_link_url: `/guilds/${guildId}`,
        })),
      );
    }

    log("Payment completed", { userId, guildId, amount });

    return new Response(
      JSON.stringify({ ok: true, amount, current_period_end: periodEnd, new_balance: Number(newBalance) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log("ERROR", { msg });
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
