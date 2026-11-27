import { useTranslation } from "react-i18next";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Loader2, CreditCard, Users, CalendarClock } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useGuildMembership, isActiveMember } from "@/hooks/useGuildMembership";
import { useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCoinsRate } from "@/hooks/useCoinsRate";

interface Props {
  guild: any;
}

export function GuildMembershipCard({ guild }: Props) {
  const { t } = useTranslation();
  const { session } = useAuth();
  const navigate = useNavigate();
  const {
    membership,
    application,
    isGuest,
    isMember,
    isLoading,
    joinAsGuest,
    becomeMember,
    cancelRenewal,
  } = useGuildMembership(guild.id);
  const [processing, setProcessing] = useState(false);
  const [chosenAmount, setChosenAmount] = useState<number | null>(null);
  const { rate, toEur } = useCoinsRate();

  const { data: coinsBalance } = useQuery({
    queryKey: ["my-coins-balance", session?.user?.id],
    enabled: !!session?.user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("coins_balance")
        .eq("user_id", session!.user.id)
        .maybeSingle();
      return Number((data as any)?.coins_balance ?? 0);
    },
  });

  if (!guild.enable_membership) return null;

  // « monthly » désigne ici toute formule récurrente (mensuelle ou annuelle) ; `period` donne le mot affiché.
  const yearly = guild.billing_model === "yearly";
  const monthly = guild.billing_model === "monthly" || yearly;
  const period = yearly ? "year" : "month";
  const joiningFee = Number(guild.joining_fee_credits ?? 0);
  const recurringFee = Number(guild.monthly_fee_credits ?? 0);
  const oneTimeFee = Number(guild.entry_fee_credits ?? 0);
  const firstPayment = !membership?.last_payment_at;

  const minFee = monthly ? recurringFee : oneTimeFee;
  const maxFee = Number(
    (monthly ? guild.monthly_fee_max_credits : guild.entry_fee_max_credits) ?? 0
  );
  const isRange = maxFee > minFee;
  const chosenFee = isRange ? Math.min(Math.max(chosenAmount ?? minFee, minFee), maxFee) : minFee;
  const dueNow = monthly ? chosenFee + (firstPayment ? joiningFee : 0) : chosenFee;

  const active = isActiveMember(membership, guild);
  const isCreator = guild.created_by_user_id === session?.user?.id;
  const needsApproval = guild.requires_application_before_payment || guild.join_policy === "APPROVAL_REQUIRED";
  const approved = application?.status === "APPROVED";
  const pendingApplication = application?.status === "PENDING";
  const blockedByApproval = needsApproval && !approved && !isCreator;

  const periodEnd = membership?.current_period_end ?? membership?.membership_expires_at;
  // Montant du prochain renouvellement : celui choisi par le membre dans la fourchette, sinon le prix fixe.
  const renewalFee = isRange
    ? Math.min(Math.max(Number(membership?.chosen_fee_credits ?? 0) || minFee, minFee), maxFee)
    : minFee;
  const renewalShort =
    monthly && !membership?.cancel_at_period_end && coinsBalance !== undefined && renewalFee > 0 && coinsBalance < renewalFee;
  const graceEnd = membership?.status === "grace" && periodEnd
    ? new Date(new Date(periodEnd).getTime() + 7 * 86_400_000).toISOString()
    : null;
  const formatDate = (d: string) => new Date(d).toLocaleDateString();

  const handleBecomeMember = async () => {
    setProcessing(true);
    await becomeMember(isRange ? chosenFee : undefined);
    setProcessing(false);
  };

  const AmountPicker = () =>
    isRange ? (
      <div className="space-y-1.5 rounded-lg border border-border bg-muted/30 p-2.5">
        <p className="text-xs text-foreground">
          {t("uiGuildMembershipCard.chooseWhatYouPay")}{monthly ? ` each ${period}` : ""}: <strong>🟩 {chosenFee} {t("uiGuildMembershipCard.coins2")}</strong> (~{toEur(chosenFee)} €)
        </p>
        <Slider
          value={[chosenFee]}
          min={minFee}
          max={maxFee}
          step={1}
          onValueChange={(v) => setChosenAmount(v[0])}
        />
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>🟩 {minFee}</span>
          <span>🟩 {maxFee}</span>
        </div>
      </div>
    ) : null;

  const payLabel = monthly
    ? `Become Member (${dueNow} Coins / ${period}${firstPayment && joiningFee ? ", incl. joining fee" : ""})`
    : `Become Member (${dueNow} Coins)`;

  const notEnoughCoins = dueNow > 0 && coinsBalance !== undefined && coinsBalance < dueNow;

  const PayButton = ({ label }: { label: string }) => (
    <div className="space-y-1.5">
      <AmountPicker />
      <Button
        size="sm"
        onClick={handleBecomeMember}
        disabled={processing || blockedByApproval || notEnoughCoins}
        className="w-full"
      >
        {processing && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
        {label}
      </Button>
      {notEnoughCoins && (
        <p className="text-xs text-muted-foreground">
          {t("uiGuildMembershipCard.youHave")} {coinsBalance} {t("uiGuildMembershipCard.coinsAndNeed")} {dueNow}{t("uiGuildMembershipCard.1Coin")} {rate.toFixed(2)} €.{" "}
          <Link to="/settings/wallet" className="text-primary underline underline-offset-2">
            {t("uiGuildMembershipCard.topUpYourWallet")}
          </Link>
        </p>
      )}
    </div>
  );

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-primary" />
        <h3 className="font-semibold text-sm">{t("uiGuildMembershipCard.membership")}</h3>
      </div>

      {!session ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {t("uiGuildMembershipCard.logInOrCreateAnAccount")}
          </p>
          <Button size="sm" onClick={() => navigate("/login")} className="w-full">
            {t("uiGuildMembershipCard.logIn")}
          </Button>
        </div>
      ) : isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin mx-auto" />
      ) : isCreator ? (
        <div className="space-y-1">
          <Badge className="bg-primary/10 text-primary border-0 text-xs">{t("uiGuildMembershipCard.foundingMember")}</Badge>
          <p className="text-xs text-muted-foreground">
            {t("uiGuildMembershipCard.asTheFounderOfThisGuild")}
          </p>
        </div>
      ) : (
        <>
          {/* Pricing */}
          {dueNow > 0 && (
            <div className="flex items-start gap-1 text-xs text-muted-foreground">
              <CreditCard className="h-3 w-3 mt-0.5 shrink-0" />
              <span>
                {monthly ? (
                  <>
                    {yearly ? t("uiGuildMembershipCard.yearly") : t("uiGuildMembershipCard.monthly")} {t("uiGuildMembershipCard.fee")}{" "}
                    <strong className="text-foreground">
                      🟩 {isRange ? `${minFee} – ${maxFee}` : recurringFee} {t("uiGuildMembershipCard.coins")} {period}
                    </strong>{" "}
                    (~{toEur(minFee)} €{isRange ? ` – ${toEur(maxFee)} €` : ""})
                    {joiningFee > 0 && (
                      <> {t("uiGuildMembershipCard.oneTimeJoiningFee")} <strong className="text-foreground">🟩 {joiningFee} {t("uiGuildMembershipCard.coins2")}</strong></>
                    )}
                  </>
                ) : (
                  <>
                    {t("uiGuildMembershipCard.oneTimeEntryFee")}{" "}
                    <strong className="text-foreground">
                      🟩 {isRange ? `${minFee} – ${maxFee}` : oneTimeFee} {t("uiGuildMembershipCard.coins2")}
                    </strong>{" "}
                    (~{toEur(minFee)} €{isRange ? ` – ${toEur(maxFee)} €` : ""})
                  </>
                )}
              </span>
            </div>
          )}

          {guild.membership_benefits_text && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-0.5">{t("uiGuildMembershipCard.whatYouGet")}</p>
              <p className="text-xs text-foreground">{guild.membership_benefits_text}</p>
            </div>
          )}

          {guild.membership_commitments_text && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-0.5">{t("uiGuildMembershipCard.whatYouCommitTo")}</p>
              <p className="text-xs text-foreground">{guild.membership_commitments_text}</p>
            </div>
          )}

          {/* Approval gate */}
          {blockedByApproval && (
            <p className="text-xs text-muted-foreground">
              {pendingApplication
                ? t("uiGuildMembershipCard.yourApplicationIsWaitingForAn")
                : t("uiGuildMembershipCard.youNeedToApplyAndBe")}
            </p>
          )}

          {/* Status & Actions */}
          {!membership && (
            <div className="flex flex-col gap-2">
              <Button size="sm" variant="outline" onClick={joinAsGuest} className="w-full">
                {t("uiGuildMembershipCard.joinAsGuest")}
              </Button>
              {dueNow > 0 && <PayButton label={payLabel} />}
            </div>
          )}

          {isGuest && (
            <div className="space-y-2">
              <Badge variant="outline" className="text-xs">{t("uiGuildMembershipCard.statusGuest")}</Badge>
              <p className="text-xs text-muted-foreground">{t("uiGuildMembershipCard.youCanStillParticipateInPublic")}</p>
              {dueNow > 0 && <PayButton label={payLabel} />}
            </div>
          )}

          {isMember && active && (
            <div className="space-y-2">
              <Badge className="bg-primary/10 text-primary border-0 text-xs">
                {t("uiGuildMembershipCard.statusMember")}{membership?.status === "grace" ? ` ${t("uiGuildMembershipCard.paymentPending")}` : ""}
              </Badge>
              <p className="text-xs text-muted-foreground">{t("uiGuildMembershipCard.youHaveFullMemberPrivilegesIn")}</p>
              {periodEnd && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <CalendarClock className="h-3 w-3" />
                  {monthly
                    ? membership?.cancel_at_period_end
                      ? `Ends on ${formatDate(periodEnd)}`
                      : `Renews on ${formatDate(periodEnd)}`
                    : `Valid until ${formatDate(periodEnd)}`}
                </p>
              )}
              {monthly && !membership?.cancel_at_period_end && periodEnd && (
                <p className="text-[11px] text-muted-foreground">
                  🟩 {renewalFee} {t("uiGuildMembershipCard.coinsWillBeTakenFromYour")} {formatDate(periodEnd)}{t("uiGuildMembershipCard.youGetAReminderEmailOne")}
                </p>
              )}
              {renewalShort && (
                <p className="text-xs text-destructive">
                  {membership?.status === "grace"
                    ? `Renewal failed: you need 🟩 ${renewalFee} Coins and have ${coinsBalance}. Top up before ${graceEnd ? formatDate(graceEnd) : "the end of the grace period"} to stay a member.`
                    : `Your balance (🟩 ${coinsBalance}) is below the next renewal (🟩 ${renewalFee}).`}{" "}
                  <Link to="/settings/wallet" className="underline underline-offset-2">{t("uiGuildMembershipCard.topUpYourWallet")}</Link>
                </p>
              )}
              {membership?.last_payment_at && (
                <p className="text-[11px] text-muted-foreground">
                  {t("uiGuildMembershipCard.lastPayment")} {formatDate(membership.last_payment_at)}
                </p>
              )}
              {monthly && (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={() => cancelRenewal(!membership?.cancel_at_period_end)}
                >
                  {membership?.cancel_at_period_end ? t("uiGuildMembershipCard.reactivateAutomaticRenewal") : t("uiGuildMembershipCard.stopAutomaticRenewal")}
                </Button>
              )}
            </div>
          )}

          {isMember && !active && (
            <div className="space-y-2">
              <Badge variant="destructive" className="text-xs">{t("uiGuildMembershipCard.membershipExpired")}</Badge>
              {dueNow > 0 && <PayButton label={`Renew membership (${dueNow} Coins)`} />}
            </div>
          )}
        </>
      )}
    </div>
  );
}
