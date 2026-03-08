import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { useSubscription } from "@/hooks/useSubscription";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CreditCard, Zap, CheckCircle2, AlertCircle, XCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof CheckCircle2 }> = {
  active: { label: "Active", variant: "default", icon: CheckCircle2 },
  cancelled: { label: "Cancelled", variant: "secondary", icon: XCircle },
  past_due: { label: "Past Due", variant: "destructive", icon: AlertCircle },
  pending: { label: "Pending", variant: "outline", icon: Loader2 },
  inactive: { label: "Inactive", variant: "secondary", icon: XCircle },
};

export default function BillingPage() {
  const { subscription, isLoading, subscribe, cancelSubscription, isActive } = useSubscription();
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (searchParams.get("success") === "true") {
      toast.success("Subscription activated successfully!");
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const status = statusConfig[subscription?.status || "inactive"] || statusConfig.inactive;
  const StatusIcon = status.icon;

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto space-y-8">
        <div>
          <h1 className="text-2xl font-bold font-display text-foreground">Billing</h1>
          <p className="text-muted-foreground mt-1">
            Manage your Fixsense subscription and payment details.
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : subscription && subscription.status !== "inactive" ? (
          <>
            {/* Current Plan Card */}
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
                      $19<span className="text-sm font-normal text-muted-foreground">/month</span>
                    </p>
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

            {/* Payment Method */}
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
                    <span className="text-foreground font-mono">
                      •••• •••• •••• {subscription.card_last4}
                    </span>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Actions */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Subscription Actions</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-3">
                {isActive && (
                  <Button
                    variant="destructive"
                    onClick={() => cancelSubscription.mutate()}
                    disabled={cancelSubscription.isPending}
                  >
                    {cancelSubscription.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : null}
                    Cancel Subscription
                  </Button>
                )}
                {subscription.status === "cancelled" && (
                  <Button
                    onClick={() => subscribe.mutate()}
                    disabled={subscribe.isPending}
                  >
                    {subscribe.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : null}
                    Resubscribe
                  </Button>
                )}
              </CardContent>
            </Card>
          </>
        ) : (
          /* No subscription — show pricing card */
          <Card className="border-primary shadow-lg shadow-primary/10 max-w-md mx-auto">
            <CardHeader className="text-center pb-2">
              <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                <Zap className="w-6 h-6 text-primary" />
              </div>
              <CardTitle className="text-xl">Fixsense Monthly</CardTitle>
              <CardDescription>
                Everything you need to close more deals with AI-powered sales intelligence.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="text-center">
                <span className="text-4xl font-bold text-foreground">$19</span>
                <span className="text-muted-foreground">/month</span>
              </div>

              <ul className="space-y-3">
                {[
                  "Unlimited calls",
                  "Real-time AI analysis",
                  "All integrations",
                  "CRM sync",
                  "AI Sales Coach",
                  "Priority support",
                ].map((feature) => (
                  <li key={feature} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>

              <Button
                className="w-full"
                size="lg"
                onClick={() => subscribe.mutate()}
                disabled={subscribe.isPending}
              >
                {subscribe.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <CreditCard className="w-4 h-4 mr-2" />
                )}
                Subscribe with Paystack
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
