import DashboardLayout from "@/components/DashboardLayout";
import { useUserProfile } from "@/hooks/useSettings";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CreditCard, Zap, Check } from "lucide-react";

const plans = [
  {
    name: "Free",
    price: "$0",
    period: "/month",
    features: ["5 calls/month", "Basic transcription", "AI summaries", "1 integration"],
    current: true,
  },
  {
    name: "Pro",
    price: "$49",
    period: "/month",
    features: ["Unlimited calls", "Real-time analysis", "All integrations", "CRM sync", "Priority support"],
    current: false,
    popular: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    features: ["Everything in Pro", "SSO & SAML", "Dedicated support", "Custom AI models", "SLA guarantee"],
    current: false,
  },
];

export default function BillingPage() {
  const { profile } = useUserProfile();
  const planType = profile?.plan_type ?? "free";
  const callsUsed = profile?.calls_used ?? 0;
  const callsLimit = profile?.calls_limit ?? 5;

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto space-y-8">
        <div>
          <h1 className="text-2xl font-bold font-display text-foreground">Billing</h1>
          <p className="text-muted-foreground mt-1">Manage your subscription and usage.</p>
        </div>

        {/* Current plan summary */}
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-lg">Current Plan</CardTitle>
              <CardDescription>Your active subscription details</CardDescription>
            </div>
            <Badge variant="secondary" className="capitalize text-sm px-3 py-1">
              {planType}
            </Badge>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-6">
              <div>
                <p className="text-sm text-muted-foreground">Calls used this month</p>
                <p className="text-2xl font-bold text-foreground">{callsUsed} <span className="text-sm font-normal text-muted-foreground">/ {callsLimit}</span></p>
              </div>
              <div className="flex-1 max-w-xs">
                <div className="h-2 rounded-full bg-muted">
                  <div
                    className="h-2 rounded-full bg-primary transition-all"
                    style={{ width: `${callsLimit > 0 ? Math.min((callsUsed / callsLimit) * 100, 100) : 0}%` }}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Plans grid */}
        <div className="grid gap-6 md:grid-cols-3">
          {plans.map((plan) => {
            const isCurrentPlan = plan.name.toLowerCase() === planType;
            return (
              <Card
                key={plan.name}
                className={
                  plan.popular
                    ? "border-primary shadow-lg shadow-primary/10 relative"
                    : "border-border"
                }
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-primary text-primary-foreground text-xs">Most Popular</Badge>
                  </div>
                )}
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    {plan.name === "Pro" && <Zap className="w-4 h-4 text-primary" />}
                    {plan.name === "Enterprise" && <CreditCard className="w-4 h-4 text-primary" />}
                    {plan.name}
                  </CardTitle>
                  <div className="mt-2">
                    <span className="text-3xl font-bold text-foreground">{plan.price}</span>
                    <span className="text-muted-foreground text-sm">{plan.period}</span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ul className="space-y-2">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Check className="w-4 h-4 text-primary shrink-0" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <Button
                    className="w-full"
                    variant={isCurrentPlan ? "outline" : plan.popular ? "default" : "secondary"}
                    disabled={isCurrentPlan}
                  >
                    {isCurrentPlan ? "Current Plan" : plan.name === "Enterprise" ? "Contact Sales" : "Upgrade"}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </DashboardLayout>
  );
}
