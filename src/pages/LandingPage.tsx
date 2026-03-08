import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { ArrowRight, Zap, Shield, BarChart3, Mic, Brain, Users } from "lucide-react";
import { motion } from "framer-motion";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.1, duration: 0.6, ease: "easeOut" as const }
  }),
};

const features = [
  { icon: Mic, title: "Live Transcription", desc: "Real-time speech-to-text during every call with speaker identification." },
  { icon: Brain, title: "AI Objection Detection", desc: "Instantly detects sales objections and suggests winning responses." },
  { icon: Zap, title: "Sentiment Analysis", desc: "Track buyer engagement and sentiment shifts throughout the call." },
  { icon: BarChart3, title: "Post-Call Summaries", desc: "Auto-generated summaries with key decisions, next steps, and action items." },
  { icon: Users, title: "Team Analytics", desc: "Dashboards showing performance trends, coaching insights, and deal risk." },
  { icon: Shield, title: "Enterprise Security", desc: "SOC2, GDPR, and optional HIPAA compliance with end-to-end encryption." },
];

const pricing = [
  { name: "Free", price: "$0", period: "/month", desc: "For solo reps getting started", features: ["5 calls/month", "Basic transcription", "Call summaries", "Email export"], cta: "Get Started", highlight: false },
  { name: "Pro", price: "$25", period: "/user/mo", desc: "Full AI insights for growing teams", features: ["Unlimited calls", "AI objection detection", "Sentiment analysis", "CRM integration", "PDF & CSV export"], cta: "Start Free Trial", highlight: true },
  { name: "Team", price: "$75", period: "/user/mo", desc: "Advanced analytics & coaching", features: ["Everything in Pro", "Team dashboards", "Coaching insights", "Performance benchmarking", "Priority support"], cta: "Contact Sales", highlight: false },
  { name: "Enterprise", price: "Custom", period: "", desc: "For large organizations", features: ["Everything in Team", "Custom integrations", "HIPAA compliance", "Dedicated CSM", "SLA guarantee"], cta: "Talk to Us", highlight: false },
];

export default function LandingPage() {
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
            <a href="#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Features</a>
            <Link to="/pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Pricing</Link>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/login">
              <Button variant="ghost" size="sm">Log in</Button>
            </Link>
            <Link to="/dashboard">
              <Button size="sm">Get Started</Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-20 px-4">
        <div className="container max-w-4xl text-center">
          <motion.div initial="hidden" animate="visible" variants={fadeUp} custom={0}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/30 bg-primary/10 text-primary text-sm mb-8">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse-glow" />
            AI-Powered Sales Intelligence
          </motion.div>
          <motion.h1 initial="hidden" animate="visible" variants={fadeUp} custom={1}
            className="text-4xl sm:text-5xl md:text-7xl font-bold font-display leading-tight mb-6">
            Close more deals with{" "}
            <span className="text-gradient">AI copilot</span>{" "}
            for sales meetings
          </motion.h1>
          <motion.p initial="hidden" animate="visible" variants={fadeUp} custom={2}
            className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10">
            Real-time objection handling, live transcription, sentiment analysis, and automated summaries — all in one platform.
          </motion.p>
          <motion.div initial="hidden" animate="visible" variants={fadeUp} custom={3}
            className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/dashboard">
              <Button size="lg" className="text-base gap-2 px-8 shadow-glow">
                Start Free Trial <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            <Button variant="outline" size="lg" className="text-base px-8">
              Watch Demo
            </Button>
          </motion.div>
          {/* Hero visual */}
          <motion.div initial="hidden" animate="visible" variants={fadeUp} custom={4}
            className="mt-16 rounded-xl border border-border overflow-hidden shadow-card gradient-card p-1">
            <div className="rounded-lg bg-secondary/50 p-4 md:p-8">
              <div className="grid grid-cols-3 gap-3 md:gap-6">
                <div className="glass rounded-lg p-3 md:p-4">
                  <div className="text-xs text-muted-foreground mb-1">Engagement</div>
                  <div className="text-2xl md:text-3xl font-bold font-display text-success">87%</div>
                  <div className="h-1 rounded-full bg-muted mt-2">
                    <div className="h-1 rounded-full bg-success" style={{ width: "87%" }} />
                  </div>
                </div>
                <div className="glass rounded-lg p-3 md:p-4">
                  <div className="text-xs text-muted-foreground mb-1">Objections Handled</div>
                  <div className="text-2xl md:text-3xl font-bold font-display text-primary">12/14</div>
                  <div className="h-1 rounded-full bg-muted mt-2">
                    <div className="h-1 rounded-full bg-primary" style={{ width: "86%" }} />
                  </div>
                </div>
                <div className="glass rounded-lg p-3 md:p-4">
                  <div className="text-xs text-muted-foreground mb-1">Deal Score</div>
                  <div className="text-2xl md:text-3xl font-bold font-display text-accent">A+</div>
                  <div className="h-1 rounded-full bg-muted mt-2">
                    <div className="h-1 rounded-full bg-accent" style={{ width: "95%" }} />
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 px-4">
        <div className="container max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold font-display mb-4">
              Everything you need to <span className="text-gradient">win deals</span>
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              From live call intelligence to post-call insights, Fixsense covers the entire sales meeting lifecycle.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f, i) => (
              <motion.div key={f.title} initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={i}
                className="glass rounded-xl p-6 hover:border-primary/40 transition-colors group">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                  <f.icon className="w-5 h-5 text-primary" />
                </div>
                <h3 className="text-lg font-semibold font-display mb-2">{f.title}</h3>
                <p className="text-sm text-muted-foreground">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Integrations */}
      <section className="py-16 px-4 border-y border-border">
        <div className="container text-center">
          <p className="text-sm text-muted-foreground mb-6">Integrates seamlessly with your stack</p>
          <div className="flex flex-wrap justify-center gap-8 md:gap-16 text-muted-foreground/60">
            {["Zoom", "Google Meet", "Microsoft Teams", "Salesforce", "HubSpot", "Slack"].map(name => (
              <span key={name} className="text-lg font-display font-semibold">{name}</span>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20 px-4">
        <div className="container max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold font-display mb-4">Simple, transparent pricing</h2>
            <p className="text-muted-foreground">Start free. Scale as you grow.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {pricing.map((p, i) => (
              <motion.div key={p.name} initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={i}
                className={`rounded-xl p-6 border ${p.highlight ? "border-primary shadow-glow bg-primary/5" : "border-border glass"}`}>
                <h3 className="font-display font-bold text-lg mb-1">{p.name}</h3>
                <p className="text-sm text-muted-foreground mb-4">{p.desc}</p>
                <div className="flex items-baseline gap-1 mb-6">
                  <span className="text-3xl font-bold font-display">{p.price}</span>
                  <span className="text-sm text-muted-foreground">{p.period}</span>
                </div>
                <ul className="space-y-2 mb-6">
                  {p.features.map(f => (
                    <li key={f} className="text-sm text-muted-foreground flex items-start gap-2">
                      <span className="text-primary mt-0.5">✓</span> {f}
                    </li>
                  ))}
                </ul>
                <Button variant={p.highlight ? "default" : "outline"} className="w-full" size="sm">
                  {p.cta}
                </Button>
              </motion.div>
            ))}
          </div>
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
