import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Zap, Check, ArrowRight, Shield, CreditCard, X, Info,
  Users, Video, Infinity,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/hooks/useSubscription";
import { useUserProfile } from "@/hooks/useSettings";
import { useTeamUsage } from "@/hooks/useTeamUsage";
import { useMeetingUsage } from "@/hooks/useMeetingUsage";
import { PLANS, formatNGN, USD_TO_NGN } from "@/config/plans";
import { format } from "date-fns";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.5, ease: "easeOut" as const },
  }),
};

const comparisonFeatures = [
  { label: "Monthly meetings", free: "5", starter: "50", growth: "300", scale: "Unlimited" },
  { label: "Team members", free: "1", starter: "3", growth: "10", scale: "Unlimited" },
  { label: "Zoom integration", free: true, starter: true, growth: true, scale: true },
  { label: "Google Meet", free: true, starter: true, growth: true, scale: true },
  { label: "Slack integration", free: false, starter: false, growth: true, scale: true },
  { label: "AI meeting summaries", free: true, starter: true, growth: true, scale: true },
  { label: "AI action items", free: false, starter: false, growth: true, scale: true },
  { label: "Basic analytics", free: true, starter: true, growth: true, scale: true },
  { label: "Advanced analytics", free: false, starter: false, growth: true, scale: true },
  { label: "Team dashboard", free: false, starter: false, growth: true, scale: true },
  { label: "Coaching insights", free: false, starter: false, growth: true, scale: true },
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

function MeetingLimitBadge({ limit }: { limit: number }) {
  if (limit === -1) {
    return (
      <div className="flex items-center gap-1.5 text-primary font-semibold text-sm">
        <Infinity className="w-4 h-4" />
        Unlimited meetings/month
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5 text-foreground font-semibold text-sm">
      <Video className="w-4 h-4 text-primary" />
      {limit} meetings/month
    </div>
  );
}

export default function PricingPage() {
  const { user } = useAuth();
  const { subscribe } = useSubscription();
  const { profile } = useUserProfile();
  const { teamUsage } = useTeamUsage();
  const { usage } = useMeetingUsage();
  const navigate = useNavigate();

  const currentPlan = profile?.plan_type || "free";

  const handleSelectPlan = (plan: typeof PLANS[0]) => {
    if (plan.key === "free") {
      if (user) navigate("/dashboard");
      else navigate("/login");
      return;
    }
    if (!user) {
      navigate("/login");
      return;
    }
    subscribe.mutate(plan.key);
  };

  return (
    <TooltipProvider>
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
                  <Link to="/login"><Button variant="ghost" size="sm">Log in</Button></Link>
                  <Link to="/login"><Button size="sm">Get Started</Button></Link>
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
            <motion.div
              initial="hidden" animate="visible" variants={fadeUp} custom={3}
              className="inline-flex items-center gap-2 text-sm text-muted-foreground"
            >
              <Info className="w-4 h-4" />
              <span>Prices shown in USD. Billed in NGN at 1 USD = ₦1,500</span>
            </motion.div>
          </div>
        </section>

        {/* Pricing Cards */}
        <section className="py-12 px-4">
          <div className="container max-w-6xl">
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {PLANS.map((plan, i) => {
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

                    <div className="mb-4">
                      <h3 className="font-display font-bold text-lg mb-1 text-foreground">{plan.name}</h3>
                      <p className="text-xs text-muted-foreground leading-relaxed">{plan.description}</p>
                    </div>

                    {/* Price */}
                    <div className="mb-4">
                      <div className="flex items-baseline gap-1">
                        <span className="text-4xl font-bold font-display text-foreground">${plan.price_usd}</span>
                        <span className="text-sm text-muted-foreground">{plan.period}</span>
                      </div>
                      {plan.price_ngn > 0 && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <p className="text-xs text-muted-foreground mt-1 cursor-help inline-flex items-center gap-1">
                              ~{formatNGN(plan.price_ngn)} billed monthly
                              <Info className="w-3 h-3" />
                            </p>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>You will be billed in Nigerian Naira (NGN)</p>
                            <p className="text-xs text-muted-foreground">Conversion rate: 1 USD = ₦1,500</p>
                          </TooltipContent>
                        </Tooltip>
                      )}
                      {plan.price_usd === 0 && (
                        <p className="text-xs text-muted-foreground mt-1">₦0 — Free forever</p>
                      )}
                    </div>

                    {/* Meeting Limit — prominently highlighted */}
                    <div className={`mb-4 p-3 rounded-xl border ${
                      plan.calls_limit === -1
                        ? "bg-primary/10 border-primary/20"
                        : "bg-primary/5 border-primary/10"
                    }`}>
                      <MeetingLimitBadge limit={plan.calls_limit} />
                      {plan.calls_limit !== -1 && (
                        <p className="text-[11px] text-muted-foreground mt-1">
                          Resets monthly · AI analysis on every call
                        </p>
                      )}
                      {plan.calls_limit === -1 && (
                        <p className="text-[11px] text-muted-foreground mt-1">
                          No limits · Full AI on every call
                        </p>
                      )}
                    </div>

                    {/* Team members */}
                    <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
                      <Users className="w-4 h-4 text-primary shrink-0" />
                      {plan.team_members_limit === -1
                        ? "Unlimited team members"
                        : plan.team_members_limit === 1
                        ? "1 user only"
                        : `Up to ${plan.team_members_limit} team members`}
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

        {/* Usage indicator for logged-in users */}
        {user && usage && (
          <section className="pb-8 px-4">
            <div className="container max-w-md">
              <motion.div
                initial="hidden" whileInView="visible" viewport={{ once: true }}
                variants={fadeUp} custom={0}
                className="glass rounded-xl p-5 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-foreground">Your usage this month</p>
                  <span className="text-xs px-2.5 py-1 rounded-full bg-primary/10 text-primary font-medium capitalize">
                    {usage.planName} Plan
                  </span>
                </div>

                {/* Meetings usage */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                      <Video className="w-3.5 h-3.5" /> Meetings
                    </span>
                    <span className={`text-sm font-semibold ${
                      usage.isAtLimit ? "text-destructive" : usage.isNearLimit ? "text-accent" : "text-foreground"
                    }`}>
                      {usage.isUnlimited ? `${usage.used} used` : `${usage.used} / ${usage.limit}`}
                    </span>
                  </div>
                  {!usage.isUnlimited && (
                    <Progress
                      value={usage.pct}
                      className={`h-2 ${usage.isAtLimit ? "[&>div]:bg-destructive" : usage.isNearLimit ? "[&>div]:bg-accent" : ""}`}
                    />
                  )}
                  {usage.isUnlimited && (
                    <div className="flex items-center gap-1.5 text-primary text-xs font-medium mt-1">
                      <Infinity className="w-3.5 h-3.5" /> Unlimited meetings on your plan
                    </div>
                  )}
                  <div className="flex items-center justify-between mt-1.5">
                    {!usage.isUnlimited && (
                      <span className="text-xs text-muted-foreground">
                        Resets {format(usage.resetDate, "MMM d, yyyy")}
                      </span>
                    )}
                    {usage.isAtLimit && (
                      <span className="text-xs text-destructive font-medium ml-auto">
                        Limit reached — upgrade to continue
                      </span>
                    )}
                    {usage.isNearLimit && !usage.isAtLimit && (
                      <span className="text-xs text-accent font-medium ml-auto">
                        {usage.remaining} meetings remaining
                      </span>
                    )}
                  </div>
                </div>

                {/* Team members usage */}
                {teamUsage && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5" /> Team Members
                      </span>
                      <span className="text-sm font-semibold text-foreground">
                        {teamUsage.membersUsed} / {teamUsage.isUnlimited ? "∞" : teamUsage.membersLimit}
                      </span>
                    </div>
                    <Progress
                      value={teamUsage.isUnlimited ? 0 : teamUsage.membersPct}
                      className={`h-2 ${teamUsage.isAtLimit ? "[&>div]:bg-destructive" : teamUsage.isNearLimit ? "[&>div]:bg-accent" : ""}`}
                    />
                    {teamUsage.isAtLimit && (
                      <p className="text-xs text-destructive font-medium mt-1.5">
                        Team limit reached. Upgrade to add more members.
                      </p>
                    )}
                  </div>
                )}

                {(usage.isAtLimit || usage.isNearLimit) && (
                  <Button size="sm" className="w-full" onClick={() => navigate("/dashboard/billing")}>
                    <Zap className="w-3.5 h-3.5 mr-1.5" />
                    Upgrade Plan
                  </Button>
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
              <h2 className="text-2xl md:text-3xl font-bold font-display mb-2 text-foreground">Compare plans</h2>
              <p className="text-muted-foreground text-sm">See exactly what you get with each plan.</p>
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
                      <th className="text-left text-sm font-medium text-muted-foreground p-4 min-w-[180px]">Feature</th>
                      {PLANS.map((plan) => (
                        <th
                          key={plan.key}
                          className={`text-center text-sm font-semibold p-4 min-w-[100px] ${plan.popular ? "text-primary" : "text-foreground"}`}
                        >
                          <div>{plan.name}</div>
                          <div className="text-xs font-normal text-muted-foreground">${plan.price_usd}/mo</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {comparisonFeatures.map((row, i) => (
                      <tr key={row.label} className={`border-b border-border/50 ${i % 2 === 0 ? "" : "bg-muted/20"}`}>
                        <td className="text-sm text-muted-foreground p-4">{row.label}</td>
                        <td className="text-center p-4"><ComparisonCell value={row.free} /></td>
                        <td className="text-center p-4"><ComparisonCell value={row.starter} /></td>
                        <td className="text-center p-4"><ComparisonCell value={row.growth} /></td>
                        <td className="text-center p-4"><ComparisonCell value={row.scale} /></td>
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
              {[
                { icon: X, title: "Cancel anytime", desc: "No long-term contracts. Cancel with one click." },
                { icon: Shield, title: "Secure payments", desc: "Powered by Paystack. Always encrypted." },
                { icon: Users, title: "Trusted worldwide", desc: "Join thousands of sales teams using Fixsense." },
              ].map((item, i) => (
                <motion.div
                  key={item.title}
                  initial="hidden" whileInView="visible" viewport={{ once: true }}
                  variants={fadeUp} custom={i}
                  className="flex flex-col items-center gap-3"
                >
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <item.icon className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="font-display font-semibold text-foreground">{item.title}</h3>
                  <p className="text-sm text-muted-foreground">{item.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="py-16 px-4 border-t border-border">
          <div className="container max-w-3xl">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={0} className="text-center mb-10">
              <h2 className="text-2xl md:text-3xl font-bold font-display mb-2 text-foreground">Frequently asked questions</h2>
            </motion.div>
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={1} className="space-y-6">
              {[
                { q: "Why am I billed in NGN?", a: "We use Paystack for payment processing, which charges in Nigerian Naira (NGN). Prices are displayed in USD for reference, and converted at a fixed rate of 1 USD = ₦1,500." },
                { q: "When do my monthly meetings reset?", a: "Your meeting count resets at the start of each billing cycle, which is based on your subscription renewal date. You can see your exact reset date on the billing page and in the sidebar." },
                { q: "What counts as a meeting?", a: "Any call that is started and completed through Fixsense counts as one meeting. Live calls that have not ended yet are not counted until they complete." },
                { q: "Can I change plans later?", a: "Yes! You can upgrade or downgrade your plan at any time. Changes take effect immediately with prorated billing." },
                { q: "What happens if I exceed my meeting limit?", a: "You'll be prompted to upgrade to a higher plan before you can start new meetings. Your existing meetings and data remain fully accessible." },
                { q: "Is there a refund policy?", a: "We offer a 7-day money-back guarantee on all paid plans. Contact support for assistance." },
              ].map((faq) => (
                <div key={faq.q} className="glass rounded-xl p-6">
                  <h3 className="font-semibold text-foreground mb-2">{faq.q}</h3>
                  <p className="text-sm text-muted-foreground">{faq.a}</p>
                </div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* Footer CTA */}
        <section className="py-20 px-4">
          <div className="container max-w-3xl text-center">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={0} className="glass rounded-2xl p-10">
              <h2 className="text-2xl md:text-3xl font-bold font-display mb-4 text-foreground">Ready to close more deals?</h2>
              <p className="text-muted-foreground mb-8 max-w-lg mx-auto">Start with 5 free meetings per month. No credit card required.</p>
              <Link to={user ? "/dashboard" : "/login"}>
                <Button size="lg" className="shadow-glow">
                  Get Started Free
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
            </motion.div>
          </div>
        </section>

        {/* Footer */}
        <footer className="py-8 px-4 border-t border-border">
          <div className="container flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded gradient-accent flex items-center justify-center">
                <Zap className="w-3 h-3 text-primary-foreground" />
              </div>
              <span className="font-display font-semibold text-foreground">Fixsense</span>
            </div>
            <p>© {new Date().getFullYear()} Fixsense. All rights reserved.</p>
          </div>
        </footer>
      </div>
    </TooltipProvider>
  );
}