import { useEffect, useRef, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { useSubscription } from "@/hooks/useSubscription";
import { useMinuteUsage } from "@/hooks/useMinuteUsage";
import { useEffectivePlan } from "@/hooks/useEffectivePlan";
import PlanInheritanceBanner from "@/components/PlanInheritanceBanner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  CreditCard, Zap, CheckCircle2, AlertCircle, XCircle, Loader2,
  RefreshCw, ArrowUp, ArrowDown, Receipt, Timer, TrendingUp,
  Users, Calendar, Sparkles, AlertTriangle, RotateCcw, Clock,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { PLANS_SIMPLE, formatNGN, USD_TO_NGN, getTeamMembersLimit, formatMinutes } from "@/config/plans";
import { cn } from "@/lib/utils";

const STATUS_CFG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof CheckCircle2 }> = {
  active:    { label: "Active",    variant: "default",     icon: CheckCircle2 },
  cancelled: { label: "Cancelled", variant: "secondary",   icon: XCircle },
  past_due:  { label: "Past Due",  variant: "destructive", icon: AlertCircle },
  pending:   { label: "Pending",   variant: "outline",     icon: Loader2 },
  inactive:  { label: "Inactive",  variant: "secondary",   icon: XCircle },
};

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

  const [searchParams, setSearchParams] = useSearchParams();
  const [refreshing, setRefreshing]     = useState(false);
  const handledRef                      = useRef<string | null>(null);

  useEffect(() => {
    const ref = searchParams.get("reference") || searchParams.get("trxref");
    if (!ref) {
      const p = sessionStorage.getItem("fixsense_pending_payment_ref");
      if (p) { sessionStorage.removeItem("fixsense_pending_payment_ref"); markAbandoned.mutate(p); }
      return;
    }
    if (handledRef.current === ref) return;
    handledRef.current = ref;
    sessionStorage.removeItem("fixsense_pending_payment_ref");
    setSearchParams({}, { replace: true });
    verifyPayment.mutate({ reference: ref, includeTransactions: false }, {
      onSuccess: (d) => {
        if ((d as any)?.updated) toast.success("🎉 Payment confirmed! Your plan has been upgraded.");
        else toast.info("Payment received — confirming your plan upgrade...");
      },
    });
  }, [searchParams]);

  const doRefresh = async () => {
    setRefreshing(true);
    await verifyPayment.mutateAsync({ reference: null, includeTransactions: false });
    await refetch();
    setRefreshing(false);
    toast.info("Payment status checked");
  };

  const available   = PLANS_SIMPLE.filter((p) => p.key !== currentPlanKey && p.key !== "free");
  const showActive  = billingState.billingStatus === "active";
  const showPending = billingState.hasIncompleteCheckout;
  const sc          = STATUS_CFG[subscription?.status || "inactive"] || STATUS_CFG.inactive;
  const SI          = sc.icon;
  const priceUSD    = subscription?.plan_price_usd || (subscription?.amount_kobo ? subscription.amount_kobo / USD_TO_NGN / 100 : 0);
  const priceNGN    = subscription?.amount_kobo ? subscription.amount_kobo / 100 : 0;
  const resolvedKey = effectivePlan?.planKey ?? currentPlanKey;
  const tmLimit     = getTeamMembersLimit(teamQuery.data?.adminPlanKey ?? resolvedKey);
  const tmUsed      = teamQuery.data?.count ?? 1;
  const tmUnlim     = tmLimit === -1;
  const tmPct       = tmUnlim ? 0 : Math.min((tmUsed / tmLimit) * 100, 100);

  // Usage vars
  const minutesUsed      = usage?.minutesUsed ?? 0;
  const minuteLimit      = usage?.minuteLimit ?? 30;
  const minutesRemaining = usage && !usage.isUnlimited ? Math.max(0, (usage.minutesRemaining as number)) : null;
  const usedLabel        = formatMinutes(minutesUsed);
  const limitLabel       = usage?.isUnlimited ? "Unlimited" : formatMinutes(minuteLimit);
  const remainingLabel   = minutesRemaining != null ? formatMinutes(minutesRemaining) : "Unlimited";

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto space-y-8">
        <div>
          <h1 className="text-2xl font-bold font-display text-foreground">Billing</h1>
          <p className="text-muted-foreground mt-1">Manage your subscription and minute-based usage.</p>
        </div>

        <PlanInheritanceBanner />

        {isLoading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            {/* Incomplete checkout banner */}
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
                            <span>You were subscribing to the <strong className="text-foreground capitalize">{billingState.pendingPlanKey}</strong> plan.</span>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        {billingState.pendingPlanKey && (
                          <Button size="sm" onClick={() => subscribe.mutate(billingState.pendingPlanKey!)} disabled={subscribe.isPending}>
                            {subscribe.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RotateCcw className="w-4 h-4 mr-2" />} Retry Payment
                          </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={doRefresh} disabled={refreshing || verifyPayment.isPending}>
                          <RefreshCw className={cn("w-4 h-4 mr-2", (refreshing || isSyncingPending) && "animate-spin")} /> Check Status
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {showActive && subscription ? (
              <>
                {/* Active plan card */}
                <Card className="border-primary/20 bg-primary/5">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2"><Zap className="w-5 h-5 text-primary" />{subscription.plan_name}</CardTitle>
                      <CardDescription>Monthly subscription · billed in NGN</CardDescription>
                    </div>
                    <Badge variant={sc.variant} className="flex items-center gap-1.5 px-3 py-1"><SI className="w-3.5 h-3.5" />{sc.label}</Badge>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <p className="text-sm text-muted-foreground">Price</p>
                        <p className="text-2xl font-bold text-foreground">${priceUSD}<span className="text-sm font-normal text-muted-foreground">/month</span></p>
                        {priceNGN > 0 && <p className="text-xs text-muted-foreground mt-1">{formatNGN(priceNGN * 100)} billed monthly</p>}
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Next billing date</p>
                        <p className="text-lg font-semibold text-foreground">
                          {subscription.next_payment_date
                            ? format(new Date(subscription.next_payment_date), "MMM d, yyyy")
                            : "—"}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Usage card */}
                <Card className="border-border">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2"><Timer className="w-5 h-5 text-primary" />Usage This Billing Cycle</CardTitle>
                    <CardDescription>
                      Minutes are your billing unit — each completed call's duration is tracked automatically.
                      {effectivePlan?.isInherited && (
                        <span className="ml-1 inline-flex items-center gap-1 text-primary">
                          <Sparkles className="w-3 h-3" />Limits reflect your workspace's {effectivePlan.planName} plan.
                        </span>
                      )}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Minutes bar */}
                    {usage && (
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-foreground flex items-center gap-2">
                            <Clock className="w-4 h-4 text-primary" />Call Minutes This Month
                          </span>
                          <span className={cn("text-sm font-semibold tabular-nums",
                            usage.isAtLimit ? "text-destructive" : usage.isNearLimit ? "text-amber-500" : "text-foreground")}>
                            {usage.isUnlimited ? `${usedLabel} used · Unlimited` : `${usedLabel} / ${limitLabel}`}
                          </span>
                        </div>
                        {!usage.isUnlimited ? (
                          <>
                            <Progress
                              value={usage.pct}
                              className={cn("h-3",
                                usage.isAtLimit ? "[&>div]:bg-destructive"
                                  : usage.isNearLimit ? "[&>div]:bg-amber-500"
                                  : "")}
                            />
                            <div className="flex justify-between mt-1.5 text-xs text-muted-foreground">
                              <span>
                                {usage.isAtLimit
                                  ? <span className="text-destructive font-medium">Limit reached — upgrade to continue</span>
                                  : `${remainingLabel} remaining · ${Math.round(usage.pct)}% used`}
                              </span>
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />Resets {format(usage.resetDate, "MMM d, yyyy")}
                              </span>
                            </div>
                          </>
                        ) : (
                          <div className="h-3 rounded-full bg-primary/10 overflow-hidden">
                            <div className="h-full rounded-full bg-gradient-to-r from-primary/50 to-primary" style={{ width: `${Math.min((usage.minutesUsed / 300) * 100, 100)}%` }} />
                          </div>
                        )}
                      </div>
                    )}

                    {/* Meeting count */}
                    {usage && (
                      <div className="flex items-center justify-between px-4 py-3 rounded-lg bg-secondary/30 border border-border">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Clock className="w-4 h-4" />Meetings completed this month
                        </div>
                        <span className="font-semibold text-sm text-foreground">{usage.meetingsUsed}</span>
                      </div>
                    )}

                    {/* Team members */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-foreground flex items-center gap-2">
                          <Users className="w-4 h-4 text-primary" />Team Members
                        </span>
                        <span className="text-sm font-semibold text-foreground">{tmUsed} / {tmUnlim ? "∞" : tmLimit}</span>
                      </div>
                      <Progress value={tmUnlim ? 0 : tmPct} className="h-3" />
                      <div className="flex justify-between mt-1.5 text-xs text-muted-foreground">
                        <span>{tmUnlim ? "Unlimited members" : `${Math.round(tmPct)}% of seat limit`}</span>
                        {!tmUnlim && tmUsed >= tmLimit && <span className="text-destructive font-medium">Seat limit reached</span>}
                      </div>
                    </div>

                    {/* Upgrade nudge */}
                    {usage && !usage.isUnlimited && (usage.isNearLimit || usage.isAtLimit) && (() => {
                      const ci   = PLANS_SIMPLE.findIndex((p) => p.key === currentPlanKey);
                      const next = PLANS_SIMPLE[ci + 1];
                      if (!next) return null;
                      return (
                        <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                          <div className="flex items-start gap-3">
                            <TrendingUp className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                            <div className="space-y-2">
                              <p className="text-sm font-medium text-foreground">
                                {usage.isAtLimit ? "You've used all your call minutes this month" : `${remainingLabel} of call minutes remaining`}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Upgrade to <strong>{next.name}</strong> for {formatMinutes(next.minute_quota)} at ${next.price_usd}/mo.
                              </p>
                              <Button size="sm" onClick={() => changePlan.mutate(next.key)} disabled={changePlan.isPending}>
                                {changePlan.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <ArrowUp className="w-3.5 h-3.5 mr-1.5" />}
                                Upgrade to {next.name}
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>

                {/* Change plan */}
                {isActive && available.length > 0 && (
                  <Card className="border-primary/30">
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2"><ArrowUp className="w-5 h-5 text-primary" />Change Your Plan</CardTitle>
                      <CardDescription>Switch plans via Paystack — changes take effect immediately.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid gap-4 sm:grid-cols-2">
                        {available.map((plan) => {
                          const up = PLANS_SIMPLE.findIndex((p) => p.key === plan.key) > PLANS_SIMPLE.findIndex((p) => p.key === currentPlanKey);
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
                              <p className="text-2xl font-bold text-foreground mb-1">${plan.price_usd}<span className="text-sm font-normal text-muted-foreground">/mo</span></p>
                              <p className="text-sm text-muted-foreground mb-1 flex items-center gap-1.5">
                                <Timer className="w-3.5 h-3.5" />{formatMinutes(plan.minute_quota)}/month
                              </p>
                              <p className="text-sm text-muted-foreground mb-2 flex items-center gap-1.5">
                                <Users className="w-3.5 h-3.5" />{plan.team_members_limit === -1 ? "Unlimited" : `Up to ${plan.team_members_limit}`} team members
                              </p>
                              <p className="text-xs text-muted-foreground mb-3">{formatNGN(plan.price_usd * USD_TO_NGN * 100)} billed monthly</p>
                              <Button size="sm" className="w-full" variant={up ? "default" : "outline"} onClick={() => changePlan.mutate(plan.key)} disabled={changePlan.isPending}>
                                {changePlan.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : up ? <ArrowUp className="w-4 h-4 mr-2" /> : <ArrowDown className="w-4 h-4 mr-2" />}
                                {up ? "Upgrade" : "Downgrade"} to {plan.name}
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                )}

                <Card>
                  <CardHeader><CardTitle className="text-lg">Subscription Actions</CardTitle></CardHeader>
                  <CardContent>
                    {isActive && (
                      <Button variant="destructive" onClick={() => cancelSubscription.mutate()} disabled={cancelSubscription.isPending}>
                        {cancelSubscription.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Cancel Subscription
                      </Button>
                    )}
                  </CardContent>
                </Card>
              </>
            ) : !showPending ? (
              /* Subscribe — no active plan */
              <Card className="border-primary shadow-lg shadow-primary/10 max-w-md mx-auto">
                <CardHeader className="text-center pb-2">
                  <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                    <Zap className="w-6 h-6 text-primary" />
                  </div>
                  <CardTitle className="text-xl">Choose a Plan</CardTitle>
                  <CardDescription>Minute-based billing — pay for exactly how long you talk.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {PLANS_SIMPLE.filter((p) => p.key !== "free").map((plan) => (
                    <div key={plan.key} className={cn("p-4 rounded-lg border transition-colors",
                      plan.key === "growth" ? "border-primary bg-primary/5" : "border-border hover:border-primary/50")}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-foreground">{plan.name}</h3>
                          {plan.badge && <Badge variant="default" className="text-xs">{plan.badge}</Badge>}
                        </div>
                        <span className="text-xl font-bold text-foreground">${plan.price_usd}<span className="text-sm font-normal text-muted-foreground">/mo</span></span>
                      </div>
                      <p className="text-xs text-muted-foreground mb-3 flex items-center gap-1">
                        <Timer className="w-3 h-3" />{formatMinutes(plan.minute_quota)} · {plan.team_members_limit === -1 ? "Unlimited" : `Up to ${plan.team_members_limit}`} members
                      </p>
                      <Button className="w-full" variant={plan.key === "growth" ? "default" : "outline"} size="sm" onClick={() => subscribe.mutate(plan.key)} disabled={subscribe.isPending}>
                        {subscribe.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CreditCard className="w-4 h-4 mr-2" />}
                        Subscribe with Paystack
                      </Button>
                    </div>
                  ))}
                  <p className="text-xs text-center text-muted-foreground">
                    Or <Link to="/pricing" className="text-primary hover:underline">view full pricing details</Link>
                  </p>
                </CardContent>
              </Card>
            ) : null}
          </>
        )}

        {/* Transactions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2"><Receipt className="w-5 h-5 text-muted-foreground" />Transaction History</CardTitle>
            <CardDescription>Your recent Paystack transactions.</CardDescription>
          </CardHeader>
          <CardContent>
            {isTransactionsLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="w-4 h-4 animate-spin" />Loading transactions...</div>
            ) : transactions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No transactions yet.</p>
            ) : (
              <div className="space-y-3">
                {transactions.slice(0, 10).map((tx) => (
                  <div key={tx.reference} className="p-3 rounded-lg border border-border flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">{formatNGN(tx.amount_ngn * 100)}</p>
                      <p className="text-xs text-muted-foreground">{tx.paid_at ? format(new Date(tx.paid_at), "MMM d, yyyy • h:mm a") : format(new Date(tx.created_at), "MMM d, yyyy • h:mm a")}</p>
                      <p className="text-xs text-muted-foreground">Ref: {tx.reference}</p>
                    </div>
                    <Badge variant={tx.status === "success" ? "default" : tx.status === "pending" ? "outline" : "secondary"}>{tx.status}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}