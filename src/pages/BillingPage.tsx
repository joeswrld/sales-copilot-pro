/**
 * BillingPage.tsx — v3 (Modern SaaS billing experience)
 *
 * Key UX fixes carried over from v2:
 *  1. When a user cancels a Paystack popup, show "Payment cancelled — your
 *     current plan remains active." NEVER show "Retry to restore access"
 *     unless the subscription has actually expired.
 *  2. The payment verification flow only runs when there is a real Paystack
 *     reference in the URL (i.e. a completed redirect from Paystack).
 *  3. markAbandoned is only called when the user has no active subscription.
 *  4. All billing state is derived from the subscription row, not the
 *     payments table, so cancelled checkouts never look like downgrades.
 *
 * v3 additions:
 *  - CheckoutDialog: every subscribe / upgrade / buy-minutes action opens a
 *    transparent pre-payment confirmation (subtotal, VAT, total, currency
 *    notice, ToS checkbox) before redirecting to Paystack.
 *  - InvoiceTable + InvoiceDialog: proper invoice history with a detailed
 *    receipt view (print / PDF via browser print).
 *  - SubscriptionCard / UsageCard: redesigned, with an explicit 80% usage
 *    warning state.
 *  - ComplianceFooter: renewal disclosure, VAT notice, refund policy,
 *    ToS/Privacy links, and security badges.
 */

import { useEffect, useRef, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { useSubscription } from "@/hooks/useSubscription";
import { useMinuteUsage } from "@/hooks/useMinuteUsage";
import { useEffectivePlan } from "@/hooks/useEffectivePlan";
import PlanInheritanceBanner from "@/components/PlanInheritanceBanner";
import { TeamUsageBillingCard } from "@/components/TeamMinuteUsageComponents";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CreditCard, Zap, Loader2, AlertTriangle, RotateCcw, Info,
  ArrowUp, ArrowDown, Timer, Users,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { PLANS_SIMPLE, formatNGN, USD_TO_NGN, getTeamMembersLimit, formatMinutes } from "@/config/plans";
import { cn } from "@/lib/utils";
import ExtraMinutesBundles from "@/components/ExtraMinutesBundles";
import { useExtraMinutes } from "@/hooks/useExtraMinutes";

import CheckoutDialog, { type CheckoutItem } from "@/components/billing/CheckoutDialog";
import SubscriptionCard from "@/components/billing/SubscriptionCard";
import UsageCard from "@/components/billing/UsageCard";
import InvoiceTable from "@/components/billing/InvoiceTable";
import ComplianceFooter from "@/components/billing/ComplianceFooter";

export default function BillingPage() {
  const { user } = useAuth();
  const {
    subscription, isLoading, billingState, subscribe, cancelSubscription, changePlan,
    verifyPayment, markAbandoned, isActive, refetch, currentPlanKey,
    transactions, isTransactionsLoading, isSyncingPending,
  } = useSubscription();
  const { usage } = useMinuteUsage();
  const { effectivePlan } = useEffectivePlan();

  const teamQuery = useQuery({
    queryKey: ["team-member-count", user?.id],
    queryFn: async () => {
      if (!user) return { count: 0, adminPlanKey: "free" };
      const { data: m } = await supabase.from("team_members").select("team_id").eq("user_id", user.id).eq("status", "active").limit(1).maybeSingle();
      if (!m) return { count: 1, adminPlanKey: "free" };
      const { count } = await supabase.from("team_members").select("*", { count: "exact", head: true }).eq("team_id", m.team_id).eq("status", "active");
      const { data: admin } = await supabase.from("team_members").select("user_id").eq("team_id", m.team_id).eq("role", "admin").eq("status", "active").limit(1).single();
      let adminPlanKey = "free";
      if (admin) {
        const { data: ap } = await supabase.from("profiles").select("plan_type").eq("id", admin.user_id).single();
        adminPlanKey = ap?.plan_type || "free";
      }
      return { count: count ?? 1, adminPlanKey };
    },
    enabled: !!user,
    refetchInterval: 30_000,
  });

  const { verify: verifyBundle, purchase: purchaseBundle, isPurchasing: isPurchasingBundle } = useExtraMinutes();
  const [searchParams, setSearchParams] = useSearchParams();
  const [paymentCancelledNotice, setPaymentCancelledNotice] = useState(false);
  const handledRef = useRef<string | null>(null);

  // ── Checkout dialog state ────────────────────────────────────────────────
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutItem, setCheckoutItem] = useState<CheckoutItem | null>(null);
  const [checkoutAction, setCheckoutAction] = useState<null | (() => void)>(null);

  const openPlanCheckout = (plan: (typeof PLANS_SIMPLE)[number], action: () => void) => {
    setCheckoutItem({ kind: "plan", planKey: plan.key, planName: plan.name, priceUsd: plan.price_usd, badge: plan.badge });
    setCheckoutAction(() => action);
    setCheckoutOpen(true);
  };

  const openBundleCheckout = (bundle: { minutes: number; price_usd: number; label: string }) => {
    setCheckoutItem({ kind: "bundle", minutes: bundle.minutes, label: bundle.label, priceUsd: bundle.price_usd });
    setCheckoutAction(() => () => purchaseBundle.mutate(bundle.minutes));
    setCheckoutOpen(true);
  };

  const isCheckoutProcessing =
    (checkoutItem?.kind === "plan" && (subscribe.isPending || changePlan.isPending)) ||
    (checkoutItem?.kind === "bundle" && isPurchasingBundle);

  const handleCheckoutConfirm = () => {
    checkoutAction?.();
  };

  useEffect(() => {
    const ref = searchParams.get("reference") || searchParams.get("trxref");

    if (!ref) {
      // User returned without a Paystack reference — they closed the popup.
      // Only mark abandoned + show notice if they have NO active subscription.
      const pendingRef = sessionStorage.getItem("fixsense_pending_payment_ref");
      if (pendingRef) {
        sessionStorage.removeItem("fixsense_pending_payment_ref");

        if (subscription?.status === "active") {
          // User cancelled an upgrade checkout — keep their current plan.
          setPaymentCancelledNotice(true);
        } else {
          // No active plan — mark the dangling reference abandoned.
          markAbandoned.mutate(pendingRef);
        }
      }
      return;
    }

    if (handledRef.current === ref) return;
    handledRef.current = ref;
    sessionStorage.removeItem("fixsense_pending_payment_ref");
    setSearchParams({}, { replace: true });

    // Bundle purchase
    if (ref.startsWith("bundle_")) {
      verifyBundle.mutate(ref);
      return;
    }

    // Real Paystack callback — verify the payment
    verifyPayment.mutate({ reference: ref, includeTransactions: false }, {
      onSuccess: (d) => {
        if ((d as any)?.updated) toast.success("🎉 Payment confirmed! Your plan has been upgraded.");
        else toast.info("Payment received — confirming your plan upgrade...");
      },
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, subscription?.status]);

  // Auto-sync with Paystack on mount (and when next_payment_date is stale)
  // so users never see an outdated renewal date.
  const autoSyncedRef = useRef(false);
  useEffect(() => {
    if (autoSyncedRef.current) return;
    if (!subscription || subscription.status !== "active") return;
    const nextDate = subscription.next_payment_date
      ? new Date(subscription.next_payment_date)
      : null;
    const isStale = !nextDate || nextDate.getTime() < Date.now();
    autoSyncedRef.current = true;
    if (isStale) {
      verifyPayment.mutate(
        { reference: null, includeTransactions: false },
        { onSuccess: () => refetch() }
      );
    } else {
      // Fire a light refresh in the background to keep card + dates fresh.
      verifyPayment.mutate({ reference: null, includeTransactions: false });
    }
  }, [subscription?.status, subscription?.next_payment_date]);

  const available   = PLANS_SIMPLE.filter((p) => p.key !== currentPlanKey && p.key !== "free");
  const showActive  = billingState.billingStatus === "active";
  const showPending = billingState.hasIncompleteCheckout;
  const priceUSD    = subscription?.plan_price_usd || (subscription?.amount_kobo ? subscription.amount_kobo / USD_TO_NGN / 100 : 0);
  const priceNGN    = subscription?.amount_kobo ? subscription.amount_kobo / 100 : 0;
  const resolvedKey = effectivePlan?.planKey ?? currentPlanKey;
  const tmLimit     = getTeamMembersLimit(teamQuery.data?.adminPlanKey ?? resolvedKey);
  const tmUsed      = teamQuery.data?.count ?? 1;
  const tmUnlim     = tmLimit === -1;

  const minutesRemaining = usage && !usage.isUnlimited ? Math.max(0, (usage.minutesRemaining as number)) : null;

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto space-y-8">
        <div>
          <h1 className="text-2xl font-bold font-display text-foreground">Billing</h1>
          <p className="text-muted-foreground mt-1">Manage your subscription, usage, and invoices.</p>
        </div>

        <PlanInheritanceBanner />

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <TeamUsageBillingCard className="mb-2" />

            {/* ── Payment cancelled notice ── */}
            {paymentCancelledNotice && showActive && (
              <Card className="border-blue-500/40 bg-blue-500/5">
                <CardContent className="pt-6">
                  <div className="flex items-start gap-4">
                    <Info className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" />
                    <div className="flex-1">
                      <p className="font-semibold text-foreground">Payment cancelled</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        No problem — your current <strong className="text-foreground capitalize">{subscription?.plan_name}</strong> plan
                        remains fully active. Nothing has changed.
                      </p>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => setPaymentCancelledNotice(false)} className="shrink-0">
                      Dismiss
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ── Incomplete checkout banner ── */}
            {showPending && (
              <Card className="border-amber-500/40 bg-amber-500/5">
                <CardContent className="pt-6">
                  <div className="flex items-start gap-4">
                    <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
                    <div className="space-y-3 flex-1">
                      <div>
                        <p className="font-semibold text-foreground">Payment not completed</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          {billingState.pendingPlanKey && (
                            <span>
                              You started a checkout for the{" "}
                              <strong className="text-foreground capitalize">{billingState.pendingPlanKey}</strong> plan
                              but it wasn't completed. Retry to activate.
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        {billingState.pendingPlanKey && (() => {
                          const plan = PLANS_SIMPLE.find((p) => p.key === billingState.pendingPlanKey);
                          return (
                            <Button
                              size="sm"
                              onClick={() => plan && openPlanCheckout(plan, () => subscribe.mutate(plan.key))}
                              disabled={subscribe.isPending}
                            >
                              {subscribe.isPending
                                ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                : <RotateCcw className="w-4 h-4 mr-2" />}
                              Retry Payment
                            </Button>
                          );
                        })()}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            await verifyPayment.mutateAsync({ reference: null, includeTransactions: false });
                            await refetch();
                            toast.info("Payment status checked");
                          }}
                          disabled={verifyPayment.isPending}
                        >
                          <RotateCcw className={cn("w-4 h-4 mr-2", isSyncingPending && "animate-spin")} />
                          Check Status
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {showActive && subscription ? (
              <>
                <SubscriptionCard
                  planName={subscription.plan_name}
                  status={subscription.status}
                  priceUsd={priceUSD}
                  priceNgn={priceNGN}
                  nextBillingDate={subscription.next_payment_date}
                  minuteQuota={usage?.minuteLimit ?? 0}
                  minutesRemaining={minutesRemaining}
                  isUnlimited={usage?.isUnlimited ?? false}
                  teamSeatsUsed={tmUsed}
                  teamSeatsLimit={tmLimit}
                  onUpgrade={() => {
                    const next = PLANS_SIMPLE[PLANS_SIMPLE.findIndex((p) => p.key === currentPlanKey) + 1];
                    if (next) openPlanCheckout(next, () => changePlan.mutate(next.key));
                    else document.getElementById("change-plan-section")?.scrollIntoView({ behavior: "smooth" });
                  }}
                  onCancel={(reason, feedback, offerShown) =>
                    cancelSubscription.mutate({
                      reason,
                      feedback,
                      retentionOutcome: "cancelled",
                      retentionOfferShown: offerShown,
                    })
                  }
                  isCancelling={cancelSubscription.isPending}
                  canUpgrade={isActive && available.some((p) => PLANS_SIMPLE.findIndex((x) => x.key === p.key) > PLANS_SIMPLE.findIndex((x) => x.key === currentPlanKey))}
                  cancelAtPeriodEnd={billingState.cancelAtPeriodEnd}
                  cancelDate={billingState.cancelDate}
                  cancellationReason={billingState.cancellationReason}
                  cancellationFeedback={billingState.cancellationFeedback}
                  retentionOutcome={billingState.retentionOutcome}
                  reactivatedAt={billingState.reactivatedAt}

                />

                {usage && (
                  <UsageCard
                    minutesUsed={usage.minutesUsed}
                    minutesRemaining={minutesRemaining}
                    minuteLimit={usage.minuteLimit}
                    isUnlimited={usage.isUnlimited}
                    pct={usage.pct}
                    isNearLimit={usage.isNearLimit}
                    isAtLimit={usage.isAtLimit}
                    resetDate={usage.resetDate}
                    extraMinutes={usage.extraMinutes}
                    extraMinutesExpiresAt={usage.extraMinutesExpiresAt}
                  />
                )}

                {/* Team seats detail */}
                <Card className="border-border">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Users className="w-4 h-4 text-primary" />
                      Team Seats
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-muted-foreground">Members active on this plan</span>
                      <span className="text-sm font-semibold text-foreground">{tmUsed} / {tmUnlim ? "∞" : tmLimit}</span>
                    </div>
                    {!tmUnlim && tmUsed >= tmLimit && (
                      <p className="text-xs text-destructive font-medium">Seat limit reached — upgrade to add more team members.</p>
                    )}
                  </CardContent>
                </Card>

                <ExtraMinutesBundles
                  isActivePlan={showActive}
                  currentPlanKey={currentPlanKey}
                  extraMinutes={usage?.extraMinutes}
                  extraMinutesExpiresAt={usage?.extraMinutesExpiresAt}
                  onBuyClick={openBundleCheckout}
                />

                {isActive && available.length > 0 && (
                  <Card id="change-plan-section" className="border-primary/30">
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <ArrowUp className="w-5 h-5 text-primary" />
                        Change Your Plan
                      </CardTitle>
                      <CardDescription>
                        Switch plans via Paystack — changes take effect immediately.
                        If you cancel the checkout, your current plan stays active.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid gap-4 sm:grid-cols-2">
                        {available.map((plan) => {
                          const up = PLANS_SIMPLE.findIndex((p) => p.key === plan.key) >
                            PLANS_SIMPLE.findIndex((p) => p.key === currentPlanKey);
                          return (
                            <div key={plan.key} className="p-4 rounded-lg border border-border hover:border-primary/50 transition-colors">
                              <div className="flex justify-between items-start mb-2">
                                <div className="flex items-center gap-2">
                                  <h3 className="font-semibold text-foreground">{plan.name}</h3>
                                  {up
                                    ? <Badge variant="default" className="text-xs"><ArrowUp className="w-3 h-3 mr-1" />Upgrade</Badge>
                                    : <Badge variant="secondary" className="text-xs"><ArrowDown className="w-3 h-3 mr-1" />Downgrade</Badge>}
                                </div>
                              </div>
                              <p className="text-2xl font-bold text-foreground mb-1">
                                ${plan.price_usd}
                                <span className="text-sm font-normal text-muted-foreground">/mo</span>
                              </p>
                              <p className="text-sm text-muted-foreground mb-1 flex items-center gap-1.5">
                                <Timer className="w-3.5 h-3.5" />
                                {formatMinutes(plan.minute_quota)}/month
                              </p>
                              <p className="text-sm text-muted-foreground mb-2 flex items-center gap-1.5">
                                <Users className="w-3.5 h-3.5" />
                                {plan.team_members_limit === -1 ? "Unlimited" : `Up to ${plan.team_members_limit}`} team members
                              </p>
                              <p className="text-xs text-muted-foreground mb-3">
                                {formatNGN(plan.price_usd * USD_TO_NGN * 100)} billed monthly
                              </p>
                              <Button
                                size="sm"
                                className="w-full"
                                variant={up ? "default" : "outline"}
                                onClick={() => openPlanCheckout(plan, () => changePlan.mutate(plan.key))}
                                disabled={changePlan.isPending}
                              >
                                {changePlan.isPending
                                  ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                  : up
                                  ? <ArrowUp className="w-4 h-4 mr-2" />
                                  : <ArrowDown className="w-4 h-4 mr-2" />}
                                {up ? "Upgrade" : "Downgrade"} to {plan.name}
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            ) : !showPending ? (
              /* No active plan and no pending checkout */
              <Card className="border-primary shadow-lg shadow-primary/10 max-w-md mx-auto">
                <CardHeader className="text-center pb-2">
                  <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                    <Zap className="w-6 h-6 text-primary" />
                  </div>
                  <CardTitle className="text-xl">Choose a Plan</CardTitle>
                  <CardDescription>
                    Minute-based billing — pay for exactly how long you talk.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {PLANS_SIMPLE.filter((p) => p.key !== "free").map((plan) => (
                    <div
                      key={plan.key}
                      className={cn(
                        "p-4 rounded-lg border transition-colors",
                        plan.key === "growth"
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      )}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-foreground">{plan.name}</h3>
                          {plan.badge && <Badge variant="default" className="text-xs">{plan.badge}</Badge>}
                        </div>
                        <span className="text-xl font-bold text-foreground">
                          ${plan.price_usd}
                          <span className="text-sm font-normal text-muted-foreground">/mo</span>
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mb-3 flex items-center gap-1">
                        <Timer className="w-3 h-3" />
                        {formatMinutes(plan.minute_quota)} · {plan.team_members_limit === -1 ? "Unlimited" : `Up to ${plan.team_members_limit}`} members
                      </p>
                      <Button
                        className="w-full"
                        variant={plan.key === "growth" ? "default" : "outline"}
                        size="sm"
                        onClick={() => openPlanCheckout(plan, () => subscribe.mutate(plan.key))}
                        disabled={subscribe.isPending}
                      >
                        {subscribe.isPending
                          ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          : <CreditCard className="w-4 h-4 mr-2" />}
                        Subscribe with Paystack
                      </Button>
                    </div>
                  ))}
                  <p className="text-xs text-center text-muted-foreground">
                    Or{" "}
                    <Link to="/pricing" className="text-primary hover:underline">
                      view full pricing details
                    </Link>
                  </p>
                </CardContent>
              </Card>
            ) : null}
          </>
        )}

        {/* Invoices */}
        <InvoiceTable transactions={transactions} isLoading={isTransactionsLoading} />

        {/* Compliance & trust */}
        <ComplianceFooter />
      </div>

      <CheckoutDialog
        open={checkoutOpen}
        onOpenChange={setCheckoutOpen}
        item={checkoutItem}
        isProcessing={isCheckoutProcessing}
        onConfirm={handleCheckoutConfirm}
      />
    </DashboardLayout>
  );
}