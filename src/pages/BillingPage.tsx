import { useEffect, useRef, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { useSubscription, PlanChangePreview } from "@/hooks/useSubscription";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CreditCard, Zap, CheckCircle2, AlertCircle, XCircle, Loader2, Info, RefreshCw, ExternalLink, ArrowUp, ArrowDown, Receipt, BarChart3, TrendingUp, Users } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PLANS_SIMPLE, formatNGN, USD_TO_NGN, getTeamMembersLimit } from "@/config/plans";

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof CheckCircle2 }> = {
  active: { label: "Active", variant: "default", icon: CheckCircle2 },
  cancelled: { label: "Cancelled", variant: "secondary", icon: XCircle },
  past_due: { label: "Past Due", variant: "destructive", icon: AlertCircle },
  pending: { label: "Pending", variant: "outline", icon: Loader2 },
  inactive: { label: "Inactive", variant: "secondary", icon: XCircle },
};

export default function BillingPage() {
  const { user } = useAuth();
  const {
    subscription,
    isLoading,
    subscribe,
    cancelSubscription,
    changePlan,
    previewPlanChange,
    verifyPayment,
    isActive,
    refetch,
    currentPlanKey,
    transactions,
    isTransactionsLoading,
    isSyncingPending,
  } = useSubscription();

  const profileQuery = useQuery({
    queryKey: ["profile-usage", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("calls_used, calls_limit, plan_type")
        .eq("id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
    refetchInterval: 30000,
  });

  // Query team member count
  const teamMembersQuery = useQuery({
    queryKey: ["team-member-count", user?.id],
    queryFn: async () => {
      if (!user) return { count: 0, teamId: null };
      const { data: membership } = await supabase
        .from("team_members")
        .select("team_id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();
      if (!membership) return { count: 1, teamId: null };
      const { count } = await supabase
        .from("team_members")
        .select("*", { count: "exact", head: true })
        .eq("team_id", membership.team_id)
        .eq("status", "active");
      return { count: count ?? 1, teamId: membership.team_id };
    },
    enabled: !!user,
    refetchInterval: 30000,
  });

  const [searchParams, setSearchParams] = useSearchParams();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [changeDialogOpen, setChangeDialogOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [planPreview, setPlanPreview] = useState<PlanChangePreview | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const handledCallbackKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const shouldVerify = searchParams.get("success") === "true" || searchParams.get("upgraded") === "true";
    const reference = searchParams.get("reference");

    if (!shouldVerify) return;

    const callbackKey = `${searchParams.toString()}`;
    if (handledCallbackKeyRef.current === callbackKey) return;
    handledCallbackKeyRef.current = callbackKey;

    setSearchParams({}, { replace: true });
    verifyPayment.mutate({ reference, includeTransactions: false });
  }, [searchParams, setSearchParams, verifyPayment]);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    await verifyPayment.mutateAsync({
      reference: searchParams.get("reference"),
      includeTransactions: false,
    });
    await refetch();
    setIsRefreshing(false);
    toast.info("Payment status checked");
  };

  const getPlanKey = () => {
    const planName = subscription?.plan_name?.toLowerCase() || "";
    if (planName.includes("scale")) return "scale";
    if (planName.includes("growth")) return "growth";
    if (planName.includes("starter")) return "starter";
    return "starter";
  };

  const handleOpenChangePlan = async (planKey: string) => {
    setSelectedPlan(planKey);
    setChangeDialogOpen(true);
    setIsLoadingPreview(true);
    setPlanPreview(null);

    try {
      const preview = await previewPlanChange.mutateAsync(planKey);
      setPlanPreview(preview);
    } catch (err) {
      toast.error("Failed to load plan preview");
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleConfirmChangePlan = () => {
    if (selectedPlan) {
      changePlan.mutate(selectedPlan);
    }
  };

  const getAvailablePlans = () => {
    return PLANS_SIMPLE.filter((p) => p.key !== currentPlanKey);
  };

  const status = statusConfig[subscription?.status || "inactive"] || statusConfig.inactive;
  const StatusIcon = status.icon;

  const priceUSD = subscription?.plan_price_usd ||
    (subscription?.amount_kobo ? subscription.amount_kobo / USD_TO_NGN / 100 : 0);
  const priceNGN = subscription?.amount_kobo ? subscription.amount_kobo / 100 : 0;
  const availablePlans = getAvailablePlans();

  const teamMembersLimit = getTeamMembersLimit(currentPlanKey);
  const teamMembersUsed = teamMembersQuery.data?.count ?? 1;
  const isTeamUnlimited = teamMembersLimit === -1;
  const teamPct = isTeamUnlimited ? 0 : Math.min((teamMembersUsed / teamMembersLimit) * 100, 100);

  return (
    <TooltipProvider>
      <DashboardLayout>
        <div className="max-w-3xl mx-auto space-y-8">
          <div>
            <h1 className="text-2xl font-bold font-display text-foreground">Billing</h1>
            <p className="text-muted-foreground mt-1">Manage your Fixsense subscription and payment details.</p>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : subscription && subscription.status !== "inactive" ? (
            <>
              <Card className="border-primary/20 bg-primary/5">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Zap className="w-5 h-5 text-primary" />
                      {subscription.plan_name}
                    </CardTitle>
                    <CardDescription>Monthly subscription</CardDescription>
                  </div>
                  <Badge variant={status.variant} className="flex items-center gap-1.5 px-3 py-1">
                    <StatusIcon className="w-3.5 h-3.5" />
                    {status.label}
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <p className="text-sm text-muted-foreground">Price</p>
                      <p className="text-2xl font-bold text-foreground">
                        ${priceUSD}<span className="text-sm font-normal text-muted-foreground">/month</span>
                      </p>
                      {priceNGN > 0 && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <p className="text-xs text-muted-foreground mt-1 cursor-help inline-flex items-center gap-1">
                              {formatNGN(priceNGN)} billed monthly
                              <Info className="w-3 h-3" />
                            </p>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Billed in Nigerian Naira (NGN)</p>
                            <p className="text-xs text-muted-foreground">Rate: 1 USD = ₦1,500</p>
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Next billing date</p>
                      <p className="text-lg font-semibold text-foreground">
                        {subscription.next_payment_date
                          ? format(new Date(subscription.next_payment_date), "MMM d, yyyy")
                          : transactions.length > 0 && transactions[0].paid_at
                          ? format(new Date(new Date(transactions[0].paid_at).setMonth(new Date(transactions[0].paid_at).getMonth() + 1)), "MMM d, yyyy")
                          : subscription.created_at
                          ? format(new Date(new Date(subscription.created_at).setMonth(new Date(subscription.created_at).getMonth() + 1)), "MMM d, yyyy")
                          : "—"}
                      </p>
                      {!subscription.next_payment_date && transactions.length > 0 && transactions[0].paid_at && (
                        <p className="text-[11px] text-muted-foreground mt-0.5">Estimated from last payment</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Team & Usage Analytics */}
              {profileQuery.data && (
                <Card className="border-border">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <BarChart3 className="w-5 h-5 text-primary" />
                      Usage Analytics
                    </CardTitle>
                    <CardDescription>
                      Your current usage vs plan limits this billing cycle.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Team Members Usage */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-foreground flex items-center gap-2">
                          <Users className="w-4 h-4 text-primary" />
                          Team Members
                        </span>
                        <span className="text-sm font-semibold text-foreground">
                          {teamMembersUsed} / {isTeamUnlimited ? "∞" : teamMembersLimit}
                        </span>
                      </div>
                      <Progress value={isTeamUnlimited ? 0 : teamPct} className="h-3" />
                      <div className="flex justify-between mt-1.5">
                        <span className="text-xs text-muted-foreground">
                          {isTeamUnlimited
                            ? "Unlimited members on your plan"
                            : `${Math.round(teamPct)}% of team limit`}
                        </span>
                        {!isTeamUnlimited && teamPct >= 80 && teamPct < 100 && (
                          <span className="text-xs text-accent font-medium">Approaching limit</span>
                        )}
                        {!isTeamUnlimited && teamMembersUsed >= teamMembersLimit && (
                          <span className="text-xs text-destructive font-medium">Limit reached</span>
                        )}
                      </div>
                    </div>

                    {/* Meetings Usage */}
                    {(() => {
                      const used = profileQuery.data.calls_used ?? 0;
                      const limit = profileQuery.data.calls_limit ?? 5;
                      const isUnlimited = limit < 0 || currentPlanKey === "scale";
                      const pct = isUnlimited ? Math.min(used, 100) : Math.min((used / limit) * 100, 100);
                      const isNearLimit = !isUnlimited && pct >= 80;
                      const isAtLimit = !isUnlimited && used >= limit;

                      const nextPlan = PLANS_SIMPLE.find((_, i) => {
                        const ci = PLANS_SIMPLE.findIndex(p => p.key === currentPlanKey);
                        return i === ci + 1;
                      });

                      return (
                        <>
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-medium text-foreground">Meetings This Month</span>
                              <span className="text-sm font-semibold text-foreground">
                                {used} / {isUnlimited ? "∞" : limit}
                              </span>
                            </div>
                            <Progress value={isUnlimited ? 0 : pct} className="h-3" />
                            <div className="flex justify-between mt-1.5">
                              <span className="text-xs text-muted-foreground">
                                {isUnlimited
                                  ? "Unlimited meetings on your plan"
                                  : `${Math.round(pct)}% of monthly limit`}
                              </span>
                              {isNearLimit && !isAtLimit && (
                                <span className="text-xs text-accent font-medium">Approaching limit</span>
                              )}
                              {isAtLimit && (
                                <span className="text-xs text-destructive font-medium">Limit reached</span>
                              )}
                            </div>
                          </div>

                          {/* Upgrade recommendation */}
                          {((isNearLimit && nextPlan) || (!isTeamUnlimited && teamPct >= 80 && nextPlan)) && (
                            <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                              <div className="flex items-start gap-3">
                                <TrendingUp className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                                <div className="space-y-2">
                                  <p className="text-sm font-medium text-foreground">
                                    {isAtLimit || teamMembersUsed >= teamMembersLimit
                                      ? "You've hit a limit!"
                                      : "You're approaching a limit"}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {!isTeamUnlimited && teamMembersUsed >= teamMembersLimit
                                      ? `You're using ${teamMembersUsed} of ${teamMembersLimit} team seats. `
                                      : isNearLimit
                                      ? `You've used ${used} of ${limit} meetings this month (${Math.round(pct)}%). `
                                      : ""}
                                    Upgrade to <strong>{nextPlan.name}</strong> for{" "}
                                    {nextPlan.team_members_limit === -1 ? "unlimited" : nextPlan.team_members_limit} team members and{" "}
                                    {nextPlan.calls_limit < 0 ? "unlimited" : nextPlan.calls_limit} meetings at ${nextPlan.price_usd}/mo.
                                  </p>
                                  <Button
                                    size="sm"
                                    variant="default"
                                    onClick={() => handleOpenChangePlan(nextPlan.key)}
                                  >
                                    <ArrowUp className="w-3.5 h-3.5 mr-1.5" />
                                    Upgrade to {nextPlan.name}
                                  </Button>
                                </div>
                              </div>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </CardContent>
                </Card>
              )}

              {subscription.card_last4 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <CreditCard className="w-5 h-5 text-muted-foreground" />
                      Payment Method
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-8 rounded bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground uppercase">
                        {subscription.card_brand || "Card"}
                      </div>
                      <span className="text-foreground font-mono">•••• •••• •••• {subscription.card_last4}</span>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Change Plan Card */}
              {isActive && availablePlans.length > 0 && (
                <Card className="border-primary/30">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <ArrowUp className="w-5 h-5 text-primary" />
                      Change Your Plan
                    </CardTitle>
                    <CardDescription>
                      Upgrade or downgrade with prorated billing. You'll only pay for the time remaining in your current cycle.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4 sm:grid-cols-2">
                      {availablePlans.map((plan) => {
                        const isUpgrade = PLANS_SIMPLE.findIndex(p => p.key === plan.key) > PLANS_SIMPLE.findIndex(p => p.key === currentPlanKey);
                        return (
                          <div key={plan.key} className="p-4 rounded-lg border border-border hover:border-primary/50 transition-colors">
                            <div className="flex justify-between items-start mb-2">
                              <div className="flex items-center gap-2">
                                <h3 className="font-semibold text-foreground">{plan.name}</h3>
                                {isUpgrade ? (
                                  <Badge variant="default" className="text-xs">
                                    <ArrowUp className="w-3 h-3 mr-1" />
                                    Upgrade
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary" className="text-xs">
                                    <ArrowDown className="w-3 h-3 mr-1" />
                                    Downgrade
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <p className="text-2xl font-bold text-foreground mb-1">
                              ${plan.price_usd}<span className="text-sm font-normal text-muted-foreground">/mo</span>
                            </p>
                            <p className="text-sm text-muted-foreground mb-1">
                              {plan.calls_limit === -1 ? "Unlimited" : plan.calls_limit} meetings/month
                            </p>
                            <p className="text-sm text-muted-foreground mb-2 flex items-center gap-1">
                              <Users className="w-3.5 h-3.5" />
                              {plan.team_members_limit === -1 ? "Unlimited" : `Up to ${plan.team_members_limit}`} team members
                            </p>
                            <p className="text-xs text-muted-foreground mb-3">{formatNGN(plan.price_usd * USD_TO_NGN)} billed monthly</p>
                            <Button 
                              size="sm" 
                              className="w-full"
                              variant={isUpgrade ? "default" : "outline"}
                              onClick={() => handleOpenChangePlan(plan.key)}
                            >
                              {isUpgrade ? "Upgrade" : "Downgrade"} to {plan.name}
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Plan Change Dialog */}
              <Dialog open={changeDialogOpen} onOpenChange={setChangeDialogOpen}>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>
                      {planPreview?.is_upgrade ? "Upgrade" : "Downgrade"} to {PLANS_SIMPLE.find(p => p.key === selectedPlan)?.name}
                    </DialogTitle>
                    <DialogDescription>
                      Review your plan change with prorated billing
                    </DialogDescription>
                  </DialogHeader>
                  
                  {isLoadingPreview ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : planPreview ? (
                    <div className="space-y-4 pt-2">
                      <div className="p-4 rounded-lg bg-muted/50 space-y-3">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Current plan</span>
                          <span className="font-medium">{PLANS_SIMPLE.find(p => p.key === planPreview.current_plan)?.name}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">New plan</span>
                          <span className="font-medium">{PLANS_SIMPLE.find(p => p.key === planPreview.new_plan)?.name}</span>
                        </div>
                        {planPreview.days_remaining > 0 && (
                          <>
                            <div className="border-t border-border pt-3">
                              <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Days remaining in cycle</span>
                                <span>{planPreview.days_remaining} days</span>
                              </div>
                            </div>
                            {planPreview.is_upgrade && planPreview.credit_ngn > 0 && (
                              <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Credit from current plan</span>
                                <span className="text-primary">-{formatNGN(planPreview.credit_ngn)}</span>
                              </div>
                            )}
                          </>
                        )}
                        <div className="border-t border-border pt-3">
                          <div className="flex justify-between">
                            <span className="font-medium">Amount due today</span>
                            <span className="font-bold text-lg">
                              {planPreview.is_upgrade 
                                ? formatNGN(planPreview.prorated_amount_ngn)
                                : formatNGN(planPreview.new_price_ngn)
                              }
                            </span>
                          </div>
                          {planPreview.is_upgrade && planPreview.prorated_amount_ngn < planPreview.new_price_ngn && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Prorated for {planPreview.days_remaining} days remaining
                            </p>
                          )}
                        </div>
                        <div className="flex justify-between text-sm pt-2">
                          <span className="text-muted-foreground">Then monthly</span>
                          <span>{formatNGN(planPreview.new_monthly_price_ngn)} (${planPreview.new_monthly_price_usd})</span>
                        </div>
                      </div>

                      {planPreview.is_downgrade && (
                        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                          <p className="text-sm text-destructive">
                            <strong>Note:</strong> Downgrading will reduce your limits. Check that your current team size fits the new plan.
                          </p>
                        </div>
                      )}

                      <div className="flex gap-3 pt-2">
                        <Button 
                          variant="outline" 
                          className="flex-1" 
                          onClick={() => setChangeDialogOpen(false)}
                        >
                          Cancel
                        </Button>
                        <Button 
                          className="flex-1" 
                          onClick={handleConfirmChangePlan}
                          disabled={changePlan.isPending}
                        >
                          {changePlan.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                          Confirm {planPreview.is_upgrade ? "Upgrade" : "Downgrade"}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground py-4">Unable to load plan preview.</p>
                  )}
                </DialogContent>
              </Dialog>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Subscription Actions</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-3">
                  {isActive && (
                    <Button variant="destructive" onClick={() => cancelSubscription.mutate()} disabled={cancelSubscription.isPending}>
                      {cancelSubscription.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      Cancel Subscription
                    </Button>
                  )}
                  {subscription.status === "pending" && (
                    <div className="w-full space-y-4">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <RefreshCw className={`w-4 h-4 ${(isRefreshing || isSyncingPending) ? "animate-spin" : ""}`} />
                        <span>Checking payment status every few seconds...</span>
                        <Button variant="ghost" size="sm" onClick={handleManualRefresh} disabled={isRefreshing || verifyPayment.isPending}>
                          Refresh now
                        </Button>
                      </div>
                      <div className="p-4 rounded-lg bg-accent/10 border border-accent/20">
                        <p className="text-sm text-accent-foreground mb-3">
                          <strong>Payment incomplete?</strong> If you left the payment page before completing, you can continue where you left off.
                        </p>
                        <Button onClick={() => subscribe.mutate(getPlanKey())} disabled={subscribe.isPending} className="w-full sm:w-auto">
                          {subscribe.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ExternalLink className="w-4 h-4 mr-2" />}
                          Continue Payment
                        </Button>
                      </div>
                    </div>
                  )}
                  {(subscription.status === "cancelled" || subscription.status === "inactive") && (
                    <Button onClick={() => subscribe.mutate("starter")} disabled={subscribe.isPending}>
                      {subscribe.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      Resubscribe
                    </Button>
                  )}
                </CardContent>
              </Card>
            </>
          ) : (
            <Card className="border-primary shadow-lg shadow-primary/10 max-w-md mx-auto">
              <CardHeader className="text-center pb-2">
                <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                  <Zap className="w-6 h-6 text-primary" />
                </div>
                <CardTitle className="text-xl">Fixsense Monthly</CardTitle>
                <CardDescription>Everything you need to close more deals with AI-powered sales intelligence.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="text-center">
                  <span className="text-4xl font-bold text-foreground">$19</span>
                  <span className="text-muted-foreground">/month</span>
                </div>
                <Button className="w-full" size="lg" onClick={() => subscribe.mutate("starter")} disabled={subscribe.isPending}>
                  {subscribe.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CreditCard className="w-4 h-4 mr-2" />}
                  Subscribe with Paystack
                </Button>
                <p className="text-xs text-center text-muted-foreground">
                  Or <Link to="/pricing" className="text-primary hover:underline">view all plans</Link>
                </p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Receipt className="w-5 h-5 text-muted-foreground" />
                Transaction History
              </CardTitle>
              <CardDescription>Your recent Paystack transactions.</CardDescription>
            </CardHeader>
            <CardContent>
              {isTransactionsLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading transactions...
                </div>
              ) : transactions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No transactions yet.</p>
              ) : (
                <div className="space-y-3">
                  {transactions.slice(0, 10).map((tx) => (
                    <div key={tx.reference} className="p-3 rounded-lg border border-border flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">{formatNGN(tx.amount_ngn)}</p>
                        <p className="text-xs text-muted-foreground">
                          {tx.paid_at ? format(new Date(tx.paid_at), "MMM d, yyyy • h:mm a") : format(new Date(tx.created_at), "MMM d, yyyy • h:mm a")}
                        </p>
                        <p className="text-xs text-muted-foreground">Ref: {tx.reference}</p>
                      </div>
                      <Badge variant={tx.status === "success" ? "default" : tx.status === "pending" ? "outline" : "secondary"}>
                        {tx.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    </TooltipProvider>
  );
}
