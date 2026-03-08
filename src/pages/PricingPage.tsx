import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Zap, Check, ArrowRight, Shield, CreditCard, X,
  Mic, BarChart3, Users, Bot, Headphones, Slack,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/hooks/useSubscription";
import { useUserProfile } from "@/hooks/useSettings";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.5, ease: "easeOut" as const },
  }),
};

const plans = [
  {
    key: "free",
    name: "Free",
    price: "$0",
    period: "/month",
    description: "Get started with AI-powered meeting intelligence",
    features: [
      { text: "Up to 5 meetings/month", included: true },
      { text: "Zoom integration", included: true },
      { text: "Google Meet integration", included: true },
      { text: "AI meeting summaries", included: true },
      { text: "Basic analytics", included: true },
      { text: "Email support (limited)", included: true },
      { text: "Team dashboard", included: false },
      { text: "Action items", included: false },
      { text: "Priority support", included: false },
    ],
    cta: "Get Started Free",
    popular: false,
    paystack_plan: null,
    amount: 0,
    calls_limit: 5,
  },
  {
    key: "starter",
    name: "Starter",
    price: "$19",
    period: "/month",
    description: "For individual reps who want more meetings",
    features: [
      { text: "Up to 50 meetings/month", included: true },
      { text: "Zoom integration", included: true },
      { text: "Google Meet integration", included: true },
      { text: "AI meeting summaries", included: true },
      { text: "Basic analytics", included: true },
      { text: "Email support", included: true },
      { text: "Team dashboard", included: false },
      { text: "Action items", included: false },
      { text: "Priority support", included: false },
    ],
    cta: "Select Plan",
    popular: false,
    paystack_plan: "starter",
    amount: 1900,
    calls_limit: 50,
  },
  {
    key: "growth",
    name: "Growth",
    price: "$49",
    period: "/month",
    description: "For growing teams with advanced needs",
    features: [
      { text: "Up to 300 meetings/month", included: true },
      { text: "Zoom + Google Meet + Slack", included: true },
      { text: "AI summaries + action items", included: true },
      { text: "Advanced analytics", included: true },
      { text: "Team dashboard", included: true },
      { text: "Priority email support", included: true },
      { text: "Admin controls", included: false },
      { text: "API access", included: false },
      { text: "Unlimited meetings", included: false },
    ],
    cta: "Select Plan",
    popular: true,
    paystack_plan: "growth",
    amount: 4900,
    calls_limit: 300,
  },
  {
    key: "scale",
    name: "Scale",
    price: "$99",
    period: "/month",
    description: "For large teams that need everything",
    features: [
      { text: "Unlimited meetings", included: true },
      { text: "All integrations", included: true },
      { text: "AI insights + summaries", included: true },
      { text: "Team performance analytics", included: true },
      { text: "Admin controls + API access", included: true },
      { text: "Priority support", included: true },
      { text: "Custom onboarding", included: true },
      { text: "Dedicated account manager", included: true },
      { text: "SLA guarantee", included: true },
    ],
    cta: "Select Plan",
    popular: false,
    paystack_plan: "scale",
    amount: 9900,
    calls_limit: -1, // unlimited
  },
];

const comparisonFeatures = [
  { label: "Monthly meetings", free: "5", starter: "50", growth: "300", scale: "Unlimited" },
  { label: "Zoom integration", free: true, starter: true, growth: true, scale: true },
  { label: "Google Meet", free: true, starter: true, growth: true, scale: true },
  { label: "Slack integration", free: false, starter: false, growth: true, scale: true },
  { label: "AI meeting summaries", free: true, starter: true, growth: true, scale: true },
  { label: "AI action items", free: false, starter: false, growth: true, scale: true },
  { label: "Basic analytics", free: true, starter: true, growth: true, scale: true },
  { label: "Advanced analytics", free: false, starter: false, growth: true, scale: true },
  { label: "Team dashboard", free: false, starter: false, growth: true, scale: true },
  { label: "Admin controls", free: false, starter: false, growth: false, scale: true },
  { label: "API access", free: false, starter: false, growth: false, scale: true },
  { label: "Priority support", free: false, starter: false, growth: true, scale: true },
];

function ComparisonCell({ value }: { value: boolean | string }) {
  if (typeof value === "string") {
    return <span className="text-sm font-medium text-foreground">{value}</span>;
  }
  return value ? (
    <Check className="w-4 h-4 text-primary mx-auto" />
  ) : (
    <X className="w-4 h-4 text-muted-foreground/30 mx-auto" />
  );
}

export default function PricingPage() {
  const { user } = useAuth();
  const { subscribe } = useSubscription();
  const { profile } = useUserProfile();
  const navigate = useNavigate();

  const currentPlan = profile?.plan_type || "free";

  const handleSelectPlan = (plan: typeof plans[0]) => {
    if (plan.key === "free") {
      if (user) {
        navigate("/dashboard");
      } else {
        navigate("/login");
      }
      return;
    }

    if (!user) {
      navigate("/login");
      return;
    }

    // Trigger Paystack checkout with plan info
    subscribe.mutate(plan.key);
  };

  return (
    <div className="min-h-screen gradient-hero">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass border-b border-border">
        <div className="container flex items-center justify-between h-16 px-4">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg gradient-accent flex items-center justify-center">
              <Zap className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold font-display text-foreground">Fixsense</span>
          </Link>
          <div className="hidden md:flex items-center gap-8">
            <Link to="/#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Features</Link>
            <Link to="/pricing" className="text-sm text-foreground font-medium transition-colors">Pricing</Link>
          </div>
          <div className="flex items-center gap-3">
            {user ? (
              <Link to="/dashboard">
                <Button size="sm">Dashboard</Button>
              </Link>
            ) : (
              <>
                <Link to="/login">
                  <Button variant="ghost" size="sm">Log in</Button>
                </Link>
                <Link to="/login">
                  <Button size="sm">Get Started</Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-6 px-4">
        <div className="container max-w-3xl text-center">
          <motion.div
            initial="hidden" animate="visible" variants={fadeUp} custom={0}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/30 bg-primary/10 text-primary text-sm mb-6"
          >
            <CreditCard className="w-3.5 h-3.5" />
            Simple, transparent pricing
          </motion.div>
          <motion.h1
            initial="hidden" animate="visible" variants={fadeUp} custom={1}
            className="text-3xl sm:text-4xl md:text-5xl font-bold font-display leading-tight mb-4"
          >
            Simple pricing for{" "}
            <span className="text-gradient">smarter sales meetings</span>
          </motion.h1>
          <motion.p
            initial="hidden" animate="visible" variants={fadeUp} custom={2}
            className="text-lg text-muted-foreground max-w-xl mx-auto mb-4"
          >
            Connect your meetings, analyze insights, and automate follow-ups.
            Start free — upgrade as you grow.
          </motion.p>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="py-12 px-4">
        <div className="container max-w-6xl">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {plans.map((plan, i) => {
              const isCurrent = user && currentPlan === plan.key;
              return (
                <motion.div
                  key={plan.key}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true }}
                  variants={fadeUp}
                  custom={i}
                  className={`relative rounded-2xl p-6 border flex flex-col ${
                    plan.popular
                      ? "border-primary shadow-glow bg-primary/5 ring-1 ring-primary/20"
                      : "border-border glass"
                  }`}
                >
                  {plan.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <Badge className="bg-primary text-primary-foreground text-xs px-3 py-0.5 font-medium">
                        Most Popular
                      </Badge>
                    </div>
                  )}

                  <div className="mb-5">
                    <h3 className="font-display font-bold text-lg mb-1 text-foreground">
                      {plan.name}
                    </h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {plan.description}
                    </p>
                  </div>

                  <div className="flex items-baseline gap-1 mb-6">
                    <span className="text-4xl font-bold font-display text-foreground">
                      {plan.price}
                    </span>
                    <span className="text-sm text-muted-foreground">{plan.period}</span>
                  </div>

                  <ul className="space-y-2.5 mb-8 flex-1">
                    {plan.features.map((f) => (
                      <li
                        key={f.text}
                        className={`flex items-start gap-2 text-sm ${
                          f.included ? "text-muted-foreground" : "text-muted-foreground/30"
                        }`}
                      >
                        {f.included ? (
                          <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                        ) : (
                          <X className="w-4 h-4 shrink-0 mt-0.5" />
                        )}
                        {f.text}
                      </li>
                    ))}
                  </ul>

                  <Button
                    variant={plan.popular ? "default" : isCurrent ? "outline" : "secondary"}
                    className={`w-full ${plan.popular ? "shadow-glow" : ""}`}
                    disabled={!!isCurrent}
                    onClick={() => handleSelectPlan(plan)}
                  >
                    {isCurrent ? (
                      "Current Plan"
                    ) : (
                      <>
                        {plan.cta}
                        {plan.key !== "free" && <ArrowRight className="w-4 h-4 ml-1.5" />}
                      </>
                    )}
                  </Button>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Usage indicator for logged-in free users */}
      {user && currentPlan === "free" && profile && (
        <section className="pb-8 px-4">
          <div className="container max-w-md">
            <motion.div
              initial="hidden" whileInView="visible" viewport={{ once: true }}
              variants={fadeUp} custom={0}
              className="glass rounded-xl p-5 text-center"
            >
              <p className="text-sm text-muted-foreground mb-2">
                Your usage this month
              </p>
              <p className="text-2xl font-bold font-display text-foreground mb-3">
                {profile.calls_used}{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  / {profile.calls_limit} calls
                </span>
              </p>
              <div className="h-2 rounded-full bg-muted mb-3">
                <div
                  className="h-2 rounded-full bg-primary transition-all"
                  style={{
                    width: `${Math.min(
                      (profile.calls_used / profile.calls_limit) * 100,
                      100
                    )}%`,
                  }}
                />
              </div>
              {profile.calls_used >= profile.calls_limit && (
                <p className="text-xs text-accent font-medium">
                  You've reached your limit. Upgrade to continue analyzing meetings.
                </p>
              )}
            </motion.div>
          </div>
        </section>
      )}

      {/* Comparison Table */}
      <section className="py-16 px-4">
        <div className="container max-w-5xl">
          <motion.div
            initial="hidden" whileInView="visible" viewport={{ once: true }}
            variants={fadeUp} custom={0}
            className="text-center mb-10"
          >
            <h2 className="text-2xl md:text-3xl font-bold font-display mb-2 text-foreground">
              Compare plans
            </h2>
            <p className="text-muted-foreground text-sm">
              See exactly what you get with each plan.
            </p>
          </motion.div>

          <motion.div
            initial="hidden" whileInView="visible" viewport={{ once: true }}
            variants={fadeUp} custom={1}
            className="glass rounded-xl overflow-hidden"
          >
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left text-sm font-medium text-muted-foreground p-4 min-w-[180px]">
                      Feature
                    </th>
                    {["Free", "Starter", "Growth", "Scale"].map((name) => (
                      <th
                        key={name}
                        className={`text-center text-sm font-semibold p-4 min-w-[100px] ${
                          name === "Growth" ? "text-primary" : "text-foreground"
                        }`}
                      >
                        {name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {comparisonFeatures.map((row, i) => (
                    <tr
                      key={row.label}
                      className={`border-b border-border/50 ${
                        i % 2 === 0 ? "" : "bg-muted/20"
                      }`}
                    >
                      <td className="text-sm text-muted-foreground p-4">
                        {row.label}
                      </td>
                      <td className="text-center p-4">
                        <ComparisonCell value={row.free} />
                      </td>
                      <td className="text-center p-4">
                        <ComparisonCell value={row.starter} />
                      </td>
                      <td className="text-center p-4">
                        <ComparisonCell value={row.growth} />
                      </td>
                      <td className="text-center p-4">
                        <ComparisonCell value={row.scale} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Trust elements */}
      <section className="py-16 px-4 border-t border-border">
        <div className="container max-w-4xl">
          <div className="grid sm:grid-cols-3 gap-8 text-center">
            <motion.div
              initial="hidden" whileInView="visible" viewport={{ once: true }}
              variants={fadeUp} custom={0}
              className="flex flex-col items-center gap-3"
            >
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <X className="w-5 h-5 text-primary" />
              </div>
              <h3 className="font-display font-semibold text-foreground">Cancel anytime</h3>
              <p className="text-sm text-muted-foreground">
                No long-term contracts. Cancel your subscription at any time with one click.
              </p>
            </motion.div>
            <motion.div
              initial="hidden" whileInView="visible" viewport={{ once: true }}
              variants={fadeUp} custom={1}
              className="flex flex-col items-center gap-3"
            >
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Shield className="w-5 h-5 text-primary" />
              </div>
              <h3 className="font-display font-semibold text-foreground">Secure payments</h3>
              <p className="text-sm text-muted-foreground">
                All payments are securely processed by Paystack with bank-grade encryption.
              </p>
            </motion.div>
            <motion.div
              initial="hidden" whileInView="visible" viewport={{ once: true }}
              variants={fadeUp} custom={2}
              className="flex flex-col items-center gap-3"
            >
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Users className="w-5 h-5 text-primary" />
              </div>
              <h3 className="font-display font-semibold text-foreground">Trusted by teams</h3>
              <p className="text-sm text-muted-foreground">
                Sales teams worldwide use Fixsense to close more deals and coach better.
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4">
        <div className="container max-w-2xl text-center">
          <motion.div
            initial="hidden" whileInView="visible" viewport={{ once: true }}
            variants={fadeUp} custom={0}
          >
            <h2 className="text-2xl md:text-3xl font-bold font-display mb-4 text-foreground">
              Ready to close more deals?
            </h2>
            <p className="text-muted-foreground mb-8">
              Start with the Free plan and upgrade as your team grows.
            </p>
            <Link to={user ? "/dashboard" : "/login"}>
              <Button size="lg" className="text-base gap-2 px-8 shadow-glow">
                Get Started <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-12 px-4">
        <div className="container flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded gradient-accent flex items-center justify-center">
              <Zap className="w-3 h-3 text-primary-foreground" />
            </div>
            <span className="font-display font-bold text-foreground">Fixsense</span>
          </div>
          <p className="text-sm text-muted-foreground">© 2026 Fixsense. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
