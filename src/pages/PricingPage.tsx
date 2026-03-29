import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/hooks/useSubscription";
import { useUserProfile } from "@/hooks/useSettings";
import { PLANS, formatNGN } from "@/config/plans";

// ─── Reusable FadeIn (mirrors LandingPage) ────────────────────────────────────
function useInView(threshold = 0.1) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setInView(true); obs.disconnect(); }
    }, { threshold });
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, inView };
}

function FadeIn({ children, delay = 0, className = "" }: {
  children: React.ReactNode; delay?: number; className?: string;
}) {
  const { ref, inView } = useInView();
  return (
    <div ref={ref} className={className} style={{
      opacity: inView ? 1 : 0,
      transform: inView ? "translateY(0)" : "translateY(24px)",
      transition: `opacity 0.65s cubic-bezier(0.22,1,0.36,1) ${delay}ms, transform 0.65s cubic-bezier(0.22,1,0.36,1) ${delay}ms`,
    }}>
      {children}
    </div>
  );
}

function Logo({ size = 30 }: { size?: number }) {
  return (
    <img
      src="/fixsense_icon_logo (2).png"
      alt="Fixsense"
      width={size}
      height={size}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.24), objectFit: "cover", display: "block", flexShrink: 0 }}
    />
  );
}

const CheckIcon = ({ green = false }: { green?: boolean }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
    <circle cx="8" cy="8" r="8" fill={green ? "rgba(16,185,129,0.12)" : "rgba(37,99,235,0.1)"} />
    <path d="M5 8l2 2 4-4" stroke={green ? "#10b981" : "#2563EB"} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const XIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
    <circle cx="8" cy="8" r="8" fill="rgba(100,116,139,0.08)" />
    <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

// ─── Plan data optimized for upsell ──────────────────────────────────────────
const PRICING_PLANS = [
  {
    key: "free",
    name: "Free",
    tagline: "For individuals exploring Fixsense",
    price: "$0",
    period: "/month",
    perMeeting: null,
    meetings: "5 meetings/mo",
    seats: "1 user only",
    cta: "Get Started Free",
    highlight: false,
    badge: null,
    de_emphasize: false,
    features: [
      { text: "5 meetings per month", included: true },
      { text: "Basic transcription", included: true },
      { text: "Basic AI summaries", included: true },
      { text: "Zoom integration", included: true },
      { text: "Team members", included: false },
      { text: "Objection detection", included: false },
      { text: "Coaching insights", included: false },
      { text: "Internal messaging", included: false },
      { text: "Team analytics", included: false },
      { text: "Priority processing", included: false },
    ],
  },
  {
    key: "starter",
    name: "Starter",
    tagline: "Good for testing Fixsense",
    price: "$19",
    period: "/month",
    perMeeting: "$0.38 per meeting",
    meetings: "50 meetings/mo",
    seats: "Up to 3 members",
    cta: "Start Free Trial",
    highlight: false,
    badge: null,
    de_emphasize: true,
    features: [
      { text: "50 meetings per month", included: true },
      { text: "Full transcription", included: true },
      { text: "Basic AI summaries", included: true },
      { text: "Zoom + Google Meet", included: true },
      { text: "Up to 3 team members", included: true },
      { text: "Objection detection", included: false },
      { text: "Coaching insights", included: false },
      { text: "Internal messaging (limited)", included: false },
      { text: "Team analytics", included: false },
      { text: "Priority processing", included: false },
    ],
  },
  {
    key: "growth",
    name: "Growth",
    tagline: "The plan most sales teams choose",
    price: "$49",
    period: "/month",
    perMeeting: "$0.16 per meeting",
    meetings: "300 meetings/mo",
    seats: "Up to 10 members",
    cta: "Upgrade to Growth",
    highlight: true,
    badge: "Most Popular",
    de_emphasize: false,
    features: [
      { text: "300 meetings per month", included: true },
      { text: "Full transcription", included: true },
      { text: "Full AI summaries + action items", included: true },
      { text: "Zoom, Meet & Teams", included: true },
      { text: "Up to 10 team members", included: true },
      { text: "Objection detection", included: true },
      { text: "Coaching insights on calls", included: true },
      { text: "Full internal messaging", included: true },
      { text: "Team performance analytics", included: true },
      { text: "Priority support", included: true },
    ],
  },
  {
    key: "scale",
    name: "Scale",
    tagline: "For teams that rely on Fixsense daily",
    price: "$99",
    period: "/month",
    perMeeting: "Best value at scale",
    meetings: "Unlimited meetings",
    seats: "Unlimited members",
    cta: "Start Free Trial",
    highlight: false,
    badge: "Best Value",
    de_emphasize: false,
    features: [
      { text: "Unlimited meetings (fair use)", included: true },
      { text: "Full transcription", included: true },
      { text: "Full AI summaries + action items", included: true },
      { text: "Zoom, Meet & Teams", included: true },
      { text: "Unlimited team members", included: true },
      { text: "Objection detection", included: true },
      { text: "Advanced coaching + leaderboards", included: true },
      { text: "Full internal messaging", included: true },
      { text: "Advanced analytics + trends", included: true },
      { text: "Priority processing + early access", included: true },
    ],
  },
];

const MATRIX_ROWS = [
  { label: "Meetings / month", free: "5", starter: "50", growth: "300", scale: "Unlimited" },
  { label: "Team members / seats", free: "1", starter: "3", growth: "10", scale: "Unlimited" },
  { label: "AI meeting summaries", free: true, starter: "Basic", growth: true, scale: true },
  { label: "Objection detection", free: false, starter: false, growth: true, scale: true },
  { label: "Coaching insights", free: false, starter: false, growth: true, scale: true },
  { label: "Internal messaging", free: false, starter: "Limited", growth: true, scale: true },
  { label: "Team analytics", free: false, starter: false, growth: true, scale: true },
  { label: "Advanced leaderboards", free: false, starter: false, growth: false, scale: true },
  { label: "Priority processing", free: false, starter: false, growth: false, scale: true },
  { label: "Early feature access", free: false, starter: false, growth: false, scale: true },
];

// ─── FAQ Accordion ────────────────────────────────────────────────────────────
function FaqSection() {
  const [open, setOpen] = useState<number | null>(null);
  const FAQS = [
    { q: "Why do most teams choose Growth?", a: "Growth unlocks the full collaboration suite — coaching comments, team analytics, internal messaging, and objection detection. These are the features that move the needle on deal conversion. Starter is intentionally limited to individual-style usage." },
    { q: "What's the per-meeting cost difference?", a: "Starter costs $0.38 per meeting. Growth drops that to $0.16. If your team runs more than ~130 meetings per month, Growth already pays for itself in efficiency gains alone." },
    { q: "When do my monthly meetings reset?", a: "Your meeting count resets at the start of each billing cycle based on your subscription renewal date. You'll always see your exact reset date on the billing page." },
    { q: "What counts as a meeting?", a: "Any call started and completed through Fixsense counts as one meeting. Calls still in progress are not counted until they finish." },
    { q: "Why am I billed in NGN?", a: "We use Paystack for payments, which processes in Nigerian Naira. Prices shown in USD are converted at a fixed rate of 1 USD = ₦1,500 for full transparency." },
    { q: "Can I change plans anytime?", a: "Yes — upgrade or downgrade at any time. Changes take effect immediately with prorated billing. No locked contracts." },
  ];
  return (
    <section className="pp-faq">
      <div className="pp-faq-inner">
        <FadeIn>
          <div className="pp-faq-header">
            <div className="pp-section-kicker">FAQ</div>
            <h2 className="pp-section-title">Common questions</h2>
          </div>
        </FadeIn>
        <FadeIn delay={60}>
          <div className="pp-faq-list">
            {FAQS.map((faq, i) => (
              <div key={i} className="pp-faq-item">
                <button
                  className={`pp-faq-q ${open === i ? "open" : ""}`}
                  onClick={() => setOpen(open === i ? null : i)}
                >
                  {faq.q}
                  <svg
                    className={`pp-faq-chevron ${open === i ? "open" : ""}`}
                    width="16" height="16" viewBox="0 0 16 16" fill="none"
                  >
                    <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                {open === i && (
                  <div className="pp-faq-a">{faq.a}</div>
                )}
              </div>
            ))}
          </div>
        </FadeIn>
      </div>
    </section>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function PricingPage() {
  const { user } = useAuth();
  const { subscribe } = useSubscription();
  const { profile } = useUserProfile();
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);

  const currentPlan = profile?.plan_type || "free";

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  const handleCta = (plan: typeof PRICING_PLANS[0]) => {
    if (plan.key === "free") {
      user ? navigate("/dashboard") : navigate("/login");
      return;
    }
    if (!user) { navigate("/login"); return; }
    if (plan.key === currentPlan) { navigate("/dashboard"); return; }
    subscribe.mutate(plan.key);
  };

  const NAV = [
    
  ];

  return (
    <div className="pp">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,500;12..96,600;12..96,700;12..96,800&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        .pp {
          --bg: #ffffff; --bg-2: #f8fafc; --bg-3: #f1f5f9;
          --ink: #0f172a; --ink-2: #1e293b;
          --muted: #64748b; --muted-2: #94a3b8;
          --border: #e2e8f0;
          --blue: #2563eb; --blue-2: #1d4ed8;
          --blue-light: rgba(37,99,235,0.08); --blue-glow: rgba(37,99,235,0.2);
          --green: #10b981; --amber: #f59e0b;
          --font: 'Plus Jakarta Sans', sans-serif;
          --font-display: 'Bricolage Grotesque', sans-serif;
          background: var(--bg); color: var(--ink); font-family: var(--font);
          -webkit-font-smoothing: antialiased; overflow-x: hidden; line-height: 1.6;
        }

        /* NAV */
        .pp-nav { position: fixed; top: 0; left: 0; right: 0; z-index: 100; height: 64px; display: flex; align-items: center; padding: 0 24px; transition: all 0.3s ease; border-bottom: 1px solid transparent; }
        .pp-nav.scrolled { background: rgba(255,255,255,0.95); backdrop-filter: blur(20px); border-bottom-color: var(--border); box-shadow: 0 1px 16px rgba(15,23,42,0.06); }
        .pp-nav-inner { max-width: 1160px; width: 100%; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; }
        .pp-nav-logo { display: flex; align-items: center; gap: 10px; text-decoration: none; }
        .pp-nav-logo-text { font-family: var(--font-display); font-size: 17px; font-weight: 700; color: var(--ink); letter-spacing: -0.03em; }
        .pp-nav-links { display: flex; align-items: center; gap: 28px; }
        .pp-nav-link { font-size: 14px; font-weight: 500; color: var(--muted); text-decoration: none; transition: color 0.2s; }
        .pp-nav-link:hover { color: var(--ink); }
        .pp-nav-link-active { color: var(--ink) !important; font-weight: 600; }
        .pp-nav-actions { display: flex; align-items: center; gap: 10px; }
        .pp-btn-ghost { font-size: 13.5px; font-weight: 500; color: var(--ink); background: none; border: none; cursor: pointer; padding: 8px 16px; border-radius: 8px; font-family: var(--font); text-decoration: none; transition: background 0.15s; }
        .pp-btn-ghost:hover { background: var(--bg-3); }
        .pp-btn-primary-nav { font-size: 13.5px; font-weight: 600; color: #fff; background: var(--blue); border: none; cursor: pointer; padding: 8px 20px; border-radius: 8px; font-family: var(--font); text-decoration: none; transition: background 0.15s, transform 0.15s; display: inline-block; }
        .pp-btn-primary-nav:hover { background: var(--blue-2); transform: translateY(-1px); }

        /* HERO */
        .pp-hero { padding: 128px 24px 72px; background: linear-gradient(180deg, #f0f6ff 0%, #ffffff 70%); position: relative; overflow: hidden; text-align: center; }
        .pp-hero-pattern { position: absolute; inset: 0; pointer-events: none; background-image: radial-gradient(circle, #d1defe 1px, transparent 1px); background-size: 32px 32px; mask-image: radial-gradient(ellipse 80% 60% at 50% 0%, black 0%, transparent 100%); opacity: 0.45; }
        .pp-hero-inner { position: relative; z-index: 1; max-width: 680px; margin: 0 auto; }
        .pp-hero-badge { display: inline-flex; align-items: center; gap: 8px; background: #fff; border: 1px solid var(--border); border-radius: 100px; padding: 6px 16px 6px 8px; font-size: 12.5px; font-weight: 600; color: var(--muted); margin-bottom: 24px; box-shadow: 0 1px 8px rgba(15,23,42,0.06); }
        .pp-hero-badge-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--green); box-shadow: 0 0 0 3px rgba(16,185,129,0.2); }
        .pp-hero-title { font-family: var(--font-display); font-size: clamp(32px,5vw,56px); font-weight: 800; line-height: 1.06; letter-spacing: -0.04em; color: var(--ink); margin-bottom: 16px; }
        .pp-hero-blue { color: var(--blue); }
        .pp-hero-sub { font-size: clamp(15px,2vw,17px); color: var(--muted); line-height: 1.7; max-width: 480px; margin: 0 auto 14px; }
        .pp-hero-note { font-size: 12.5px; color: var(--muted-2); display: flex; align-items: center; justify-content: center; gap: 6px; }

        /* PLANS */
        .pp-plans { padding: 64px 24px 80px; background: var(--bg); }
        .pp-plans-inner { max-width: 1140px; margin: 0 auto; }
        .pp-plans-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; align-items: start; }

        .pp-card { border-radius: 16px; border: 1.5px solid var(--border); padding: 28px 24px 24px; background: #fff; display: flex; flex-direction: column; transition: box-shadow 0.2s, border-color 0.2s, transform 0.2s; position: relative; }
        .pp-card:hover { box-shadow: 0 12px 40px rgba(15,23,42,0.09); }
        .pp-card-growth { border-color: var(--blue); border-width: 2px; box-shadow: 0 16px 56px var(--blue-glow), 0 0 0 1px rgba(37,99,235,0.08); transform: translateY(-6px); }
        .pp-card-growth:hover { transform: translateY(-9px); box-shadow: 0 24px 64px var(--blue-glow); }
        .pp-card-scale { border-color: #1e293b; background: var(--ink); }
        .pp-card-scale:hover { box-shadow: 0 16px 48px rgba(15,23,42,0.28); }
        .pp-card-starter { opacity: 0.85; }

        .pp-badge { display: inline-flex; align-items: center; font-size: 10.5px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; border-radius: 6px; padding: 3px 10px; margin-bottom: 14px; }
        .pp-badge-growth { background: var(--blue); color: #fff; }
        .pp-badge-scale { background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.65); }
        .pp-badge-muted { background: var(--bg-3); color: var(--muted-2); }

        .pp-plan-name { font-family: var(--font-display); font-size: 20px; font-weight: 800; color: var(--ink); letter-spacing: -0.03em; margin-bottom: 4px; }
        .pp-plan-name-light { color: #fff; }
        .pp-plan-tagline { font-size: 12.5px; color: var(--muted); line-height: 1.5; margin-bottom: 20px; }
        .pp-plan-tagline-light { color: rgba(255,255,255,0.4); }

        .pp-price-row { display: flex; align-items: baseline; gap: 2px; margin-bottom: 4px; }
        .pp-price { font-family: var(--font-display); font-size: 42px; font-weight: 800; color: var(--ink); letter-spacing: -0.04em; line-height: 1; }
        .pp-price-light { color: #fff; }
        .pp-period { font-size: 13px; color: var(--muted); }
        .pp-period-light { color: rgba(255,255,255,0.4); }
        .pp-per-meeting { font-size: 11.5px; font-weight: 600; color: var(--blue); margin-bottom: 20px; }
        .pp-per-meeting-scale { color: rgba(147,197,253,0.85); }
        .pp-per-meeting-muted { color: var(--muted-2); margin-bottom: 20px; font-size: 11.5px; }
        .pp-no-meeting { margin-bottom: 20px; }

        .pp-chip-row { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 20px; }
        .pp-chip { display: inline-flex; align-items: center; gap: 5px; border-radius: 100px; padding: 4px 12px; font-size: 11.5px; font-weight: 600; }
        .pp-chip-blue { background: var(--blue-light); border: 1px solid rgba(37,99,235,0.12); color: var(--blue); }
        .pp-chip-dark { background: rgba(37,99,235,0.15); border: 1px solid rgba(37,99,235,0.25); color: #93c5fd; }
        .pp-chip-muted { background: var(--bg-3); border: 1px solid var(--border); color: var(--muted); }

        .pp-divider { height: 1px; background: var(--border); margin-bottom: 20px; }
        .pp-divider-dark { background: rgba(255,255,255,0.08); }

        .pp-features { list-style: none; display: flex; flex-direction: column; gap: 10px; flex: 1; margin-bottom: 24px; }
        .pp-feat { display: flex; align-items: flex-start; gap: 9px; font-size: 13px; color: var(--ink-2); line-height: 1.45; }
        .pp-feat-dim { color: var(--muted-2); }
        .pp-feat-dark { color: rgba(255,255,255,0.65); }
        .pp-feat-dark-dim { color: rgba(255,255,255,0.25); }

        .pp-cta-btn { display: block; width: 100%; text-align: center; padding: 13px; border-radius: 10px; font-size: 14px; font-weight: 600; font-family: var(--font); cursor: pointer; text-decoration: none; transition: all 0.2s; border: 1.5px solid; }
        .pp-cta-ghost { background: var(--bg-2); color: var(--muted); border-color: var(--border); }
        .pp-cta-ghost:hover { background: var(--bg-3); color: var(--ink); }
        .pp-cta-outline { background: transparent; color: var(--blue); border-color: var(--blue); }
        .pp-cta-outline:hover { background: var(--blue-light); }
        .pp-cta-fill { background: var(--blue); color: #fff; border-color: var(--blue); box-shadow: 0 4px 16px var(--blue-glow); }
        .pp-cta-fill:hover { background: var(--blue-2); transform: translateY(-1px); box-shadow: 0 8px 24px var(--blue-glow); }
        .pp-cta-inv { background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.8); border-color: rgba(255,255,255,0.15); }
        .pp-cta-inv:hover { background: rgba(255,255,255,0.17); color: #fff; }
        .pp-cta-disabled { background: var(--bg-3); color: var(--muted-2); border-color: var(--border); cursor: default; }

        .pp-sub-note { text-align: center; margin-top: 10px; font-size: 11px; color: var(--muted-2); }

        /* EFFICIENCY BAR */
        .pp-eff-bar { margin-top: 32px; background: var(--bg-2); border: 1px solid var(--border); border-radius: 12px; padding: 14px 24px; display: flex; align-items: center; justify-content: center; gap: 32px; flex-wrap: wrap; }
        .pp-eff-item { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--muted); }
        .pp-eff-sep { width: 1px; height: 18px; background: var(--border); }

        /* TEAM SECTION */
        .pp-team { padding: 80px 24px; background: var(--ink); }
        .pp-team-inner { max-width: 1000px; margin: 0 auto; display: grid; grid-template-columns: 1fr 1fr; gap: 80px; align-items: center; }
        .pp-section-kicker { font-size: 12px; font-weight: 700; color: var(--blue); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 12px; }
        .pp-team-kicker { color: #60a5fa; }
        .pp-section-title { font-family: var(--font-display); font-size: clamp(26px,4vw,40px); font-weight: 800; letter-spacing: -0.04em; line-height: 1.1; margin-bottom: 14px; }
        .pp-team-title { color: #fff; }
        .pp-team-desc { font-size: 15px; color: rgba(255,255,255,0.45); line-height: 1.75; margin-bottom: 28px; }
        .pp-team-bullets { display: flex; flex-direction: column; gap: 12px; }
        .pp-team-bullet { display: flex; align-items: flex-start; gap: 10px; }
        .pp-team-bullet-icon { width: 28px; height: 28px; border-radius: 8px; background: rgba(37,99,235,0.18); border: 1px solid rgba(37,99,235,0.3); display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 13px; }
        .pp-team-bullet-text { font-size: 13.5px; color: rgba(255,255,255,0.6); line-height: 1.5; padding-top: 4px; }
        .pp-team-visual { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 32px; position: relative; overflow: hidden; }
        .pp-team-visual-glow { position: absolute; top: -40px; right: -40px; width: 200px; height: 200px; border-radius: 50%; background: radial-gradient(circle, rgba(37,99,235,0.2) 0%, transparent 70%); pointer-events: none; }
        .pp-team-stat-num { font-family: var(--font-display); font-size: 52px; font-weight: 800; color: #fff; letter-spacing: -0.04em; line-height: 1; }
        .pp-team-stat-label { font-size: 13px; color: rgba(255,255,255,0.4); margin-top: 4px; margin-bottom: 24px; }
        .pp-team-divider { height: 1px; background: rgba(255,255,255,0.07); margin-bottom: 20px; }
        .pp-team-tags { display: flex; flex-wrap: wrap; gap: 8px; }
        .pp-team-tag { background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.1); border-radius: 100px; padding: 5px 14px; font-size: 11.5px; color: rgba(255,255,255,0.5); }

        /* MATRIX */
        .pp-matrix { padding: 80px 24px; background: var(--bg-2); }
        .pp-matrix-inner { max-width: 1000px; margin: 0 auto; }
        .pp-matrix-header { text-align: center; margin-bottom: 48px; }
        .pp-section-title-dark { color: var(--ink); }
        .pp-section-sub { font-size: 15px; color: var(--muted); line-height: 1.7; }
        .pp-table-wrap { border-radius: 14px; border: 1px solid var(--border); overflow: hidden; box-shadow: 0 4px 20px rgba(15,23,42,0.06); }
        .pp-table { width: 100%; border-collapse: collapse; }
        .pp-thead-row { background: var(--ink); }
        .pp-th-cell { padding: 16px 20px; text-align: center; position: relative; }
        .pp-th-cell:first-child { text-align: left; }
        .pp-th-name { font-family: var(--font-display); font-size: 15px; font-weight: 700; color: #fff; }
        .pp-th-name-growth { color: #93c5fd; }
        .pp-th-price { font-size: 11px; color: rgba(255,255,255,0.35); margin-top: 2px; }
        .pp-th-label { font-size: 11px; font-weight: 600; color: rgba(255,255,255,0.4); }
        .pp-growth-bar { position: absolute; top: 0; left: 0; right: 0; height: 3px; background: var(--blue); }
        .pp-tbody-row { border-bottom: 1px solid var(--border); }
        .pp-tbody-row:last-child { border-bottom: none; }
        .pp-tbody-row:nth-child(odd) { background: #fff; }
        .pp-tbody-row:nth-child(even) { background: var(--bg-2); }
        .pp-td-cell { padding: 12px 20px; text-align: center; }
        .pp-td-cell:first-child { text-align: left; font-size: 13px; color: var(--muted); font-weight: 500; }
        .pp-td-val { font-size: 13px; font-weight: 600; color: var(--ink); }
        .pp-td-val-growth { color: var(--blue); }
        .pp-td-growth-bg { background: rgba(37,99,235,0.03); }
        .pp-td-partial { font-size: 11.5px; color: var(--amber); font-weight: 600; background: rgba(245,158,11,0.08); border-radius: 4px; padding: 2px 6px; display: inline-block; }

        /* FAQ */
        .pp-faq { padding: 80px 24px; background: var(--bg); }
        .pp-faq-inner { max-width: 720px; margin: 0 auto; }
        .pp-faq-header { text-align: center; margin-bottom: 48px; }
        .pp-faq-list { display: flex; flex-direction: column; gap: 12px; }
        .pp-faq-item { border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
        .pp-faq-q { width: 100%; display: flex; align-items: center; justify-content: space-between; padding: 18px 20px; background: #fff; border: none; font-family: var(--font); font-size: 14.5px; font-weight: 600; color: var(--ink); cursor: pointer; text-align: left; gap: 16px; transition: background 0.15s; }
        .pp-faq-q:hover, .pp-faq-q.open { background: var(--bg-2); }
        .pp-faq-chevron { flex-shrink: 0; transition: transform 0.25s; color: var(--muted); }
        .pp-faq-chevron.open { transform: rotate(180deg); }
        .pp-faq-a { font-size: 13.5px; color: var(--muted); line-height: 1.7; padding: 0 20px 18px; background: var(--bg-2); }

        /* FINAL CTA */
        .pp-final { padding: 100px 24px; background: var(--ink); text-align: center; position: relative; overflow: hidden; }
        .pp-final-glow { position: absolute; inset: 0; pointer-events: none; background: radial-gradient(ellipse 70% 70% at 50% 50%, rgba(37,99,235,0.12) 0%, transparent 65%); }
        .pp-final-inner { position: relative; z-index: 1; max-width: 560px; margin: 0 auto; }
        .pp-final-title { font-family: var(--font-display); font-size: clamp(30px,5vw,50px); font-weight: 800; color: #fff; letter-spacing: -0.04em; line-height: 1.07; margin-bottom: 16px; }
        .pp-final-blue { color: #93c5fd; }
        .pp-final-desc { font-size: 16px; color: rgba(255,255,255,0.45); line-height: 1.7; margin-bottom: 36px; }
        .pp-final-btns { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
        .pp-btn-final-primary { display: inline-flex; align-items: center; gap: 8px; background: var(--blue); color: #fff; border: none; border-radius: 10px; padding: 14px 28px; font-size: 14.5px; font-weight: 600; font-family: var(--font); cursor: pointer; text-decoration: none; transition: all 0.2s; box-shadow: 0 4px 16px rgba(37,99,235,0.4); }
        .pp-btn-final-primary:hover { background: var(--blue-2); transform: translateY(-2px); }
        .pp-btn-final-ghost { display: inline-flex; align-items: center; gap: 8px; background: rgba(255,255,255,0.07); color: rgba(255,255,255,0.7); border: 1px solid rgba(255,255,255,0.12); border-radius: 10px; padding: 14px 28px; font-size: 14.5px; font-weight: 500; font-family: var(--font); cursor: pointer; text-decoration: none; transition: all 0.2s; }
        .pp-btn-final-ghost:hover { background: rgba(255,255,255,0.12); color: #fff; }

        /* FOOTER */
        .pp-footer { background: #0f172a; padding: 40px 24px 28px; border-top: 1px solid rgba(255,255,255,0.06); }
        .pp-footer-inner { max-width: 1100px; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
        .pp-footer-logo { display: flex; align-items: center; gap: 9px; text-decoration: none; }
        .pp-footer-name { font-family: var(--font-display); font-size: 15px; font-weight: 700; color: #fff; letter-spacing: -0.03em; }
        .pp-footer-legal { font-size: 12px; color: rgba(255,255,255,0.22); }
        .pp-footer-links { display: flex; gap: 20px; }
        .pp-footer-link { font-size: 12px; color: rgba(255,255,255,0.25); text-decoration: none; transition: color 0.2s; }
        .pp-footer-link:hover { color: rgba(255,255,255,0.55); }

        /* RESPONSIVE */
        @media (max-width: 1024px) {
          .pp-plans-grid { grid-template-columns: repeat(2, 1fr); }
          .pp-card-growth { transform: none; }
          .pp-team-inner { grid-template-columns: 1fr; gap: 40px; }
        }
        @media (max-width: 768px) {
          .pp-plans-grid { grid-template-columns: 1fr; }
          .pp-card-starter { opacity: 1; }
          .pp-eff-bar { gap: 16px; }
          .pp-eff-sep { display: none; }
        }
        @media (max-width: 480px) {
          .pp-final-btns { flex-direction: column; align-items: center; }
          .pp-btn-final-primary, .pp-btn-final-ghost { width: 100%; max-width: 300px; justify-content: center; }
        }
      `}</style>

      {/* NAV */}
      <nav className={`pp-nav ${scrolled ? "scrolled" : ""}`}>
        <div className="pp-nav-inner">
          <Link to="/" className="pp-nav-logo">
            <Logo size={28} />
            <span className="pp-nav-logo-text">Fixsense</span>
          </Link>
          <div className="pp-nav-links">
            {NAV.map(l => (
              <a key={l.label} href={l.href} className={`pp-nav-link ${l.href === "/pricing" ? "pp-nav-link-active" : ""}`}>
                {l.label}
              </a>
            ))}
          </div>
          <div className="pp-nav-actions">
            {user ? (
              <Link to="/dashboard" className="pp-btn-primary-nav">Dashboard →</Link>
            ) : (
              <>
                <Link to="/login" className="pp-btn-ghost">Sign in</Link>
                <Link to="/login" className="pp-btn-primary-nav">Start Free Trial →</Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section className="pp-hero">
        <div className="pp-hero-pattern" />
        <div className="pp-hero-inner">
          <FadeIn>
            <div className="pp-hero-badge">
              <div className="pp-hero-badge-dot" />
              Transparent pricing · No surprises
            </div>
          </FadeIn>
          <FadeIn delay={60}>
            <h1 className="pp-hero-title">
              Simple pricing for <span className="pp-hero-blue">winning sales teams</span>
            </h1>
          </FadeIn>
          <FadeIn delay={120}>
            <p className="pp-hero-sub">
              Start free. Upgrade when your team is ready. Most teams land on Growth — and never look back.
            </p>
          </FadeIn>
          <FadeIn delay={160}>
            <p className="pp-hero-note">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
                <circle cx="7" cy="7" r="6" stroke="#94a3b8" strokeWidth="1.2" />
                <path d="M7 4.5v3" stroke="#94a3b8" strokeWidth="1.2" strokeLinecap="round" />
                <circle cx="7" cy="9.5" r="0.6" fill="#94a3b8" />
              </svg>
              Prices shown in USD · Billed in NGN at 1 USD = ₦1,500 via Paystack
            </p>
          </FadeIn>
        </div>
      </section>

      {/* PLAN CARDS */}
      <section className="pp-plans">
        <div className="pp-plans-inner">
          <div className="pp-plans-grid">
            {PRICING_PLANS.map((plan, i) => {
              const isGrowth = plan.key === "growth";
              const isScale = plan.key === "scale";
              const isStarter = plan.key === "starter";
              const dark = isScale;
              const isCurrent = user && currentPlan === plan.key;

              let cardClass = "pp-card";
              if (isGrowth) cardClass += " pp-card-growth";
              if (isScale) cardClass += " pp-card-scale";
              if (isStarter) cardClass += " pp-card-starter";

              let ctaClass = "pp-cta-btn ";
              if (isCurrent) ctaClass += "pp-cta-disabled";
              else if (isGrowth) ctaClass += "pp-cta-fill";
              else if (isScale) ctaClass += "pp-cta-inv";
              else if (plan.key === "free") ctaClass += "pp-cta-ghost";
              else ctaClass += "pp-cta-outline";

              const chipClass = dark ? "pp-chip pp-chip-dark" : (plan.key === "free" || isStarter) ? "pp-chip pp-chip-muted" : "pp-chip pp-chip-blue";

              return (
                <FadeIn key={plan.key} delay={i * 70}>
                  <div className={cardClass}>
                    {/* Badge */}
                    {plan.badge ? (
                      <div className={`pp-badge ${isGrowth ? "pp-badge-growth" : "pp-badge-scale"}`}>{plan.badge}</div>
                    ) : (
                      <div className="pp-badge pp-badge-muted">{plan.name}</div>
                    )}

                    <div className={`pp-plan-name ${dark ? "pp-plan-name-light" : ""}`}>{plan.name}</div>
                    <div className={`pp-plan-tagline ${dark ? "pp-plan-tagline-light" : ""}`}>{plan.tagline}</div>

                    <div className="pp-price-row">
                      <div className={`pp-price ${dark ? "pp-price-light" : ""}`}>{plan.price}</div>
                      <div className={`pp-period ${dark ? "pp-period-light" : ""}`}>{plan.period}</div>
                    </div>

                    {plan.perMeeting ? (
                      <div className={`pp-per-meeting ${isScale ? "pp-per-meeting-scale" : isStarter ? "pp-per-meeting-muted" : ""}`}>
                        {plan.perMeeting}
                      </div>
                    ) : (
                      <div className="pp-no-meeting" />
                    )}

                    <div className="pp-chip-row">
                      <span className={chipClass}>
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                          <rect x="0.5" y="0.5" width="9" height="9" rx="2" stroke="currentColor" strokeWidth="1.1" />
                          <path d="M2.5 5l1.5 1.5 3-3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        {plan.meetings}
                      </span>
                      <span className={chipClass}>
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                          <circle cx="5" cy="3.2" r="1.8" stroke="currentColor" strokeWidth="1.1" />
                          <path d="M1 9c0-2.2 1.8-4 4-4s4 1.8 4 4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
                        </svg>
                        {plan.seats}
                      </span>
                    </div>

                    <div className={`pp-divider ${dark ? "pp-divider-dark" : ""}`} />

                    <ul className="pp-features">
                      {plan.features.map((f) => (
                        <li key={f.text} className={`pp-feat ${!f.included ? (dark ? "pp-feat-dark-dim" : "pp-feat-dim") : dark ? "pp-feat-dark" : ""}`}>
                          {f.included ? <CheckIcon green={isGrowth || isScale} /> : <XIcon />}
                          {f.text}
                        </li>
                      ))}
                    </ul>

                    <button className={ctaClass} disabled={!!isCurrent} onClick={() => handleCta(plan)}>
                      {isCurrent ? "Current Plan" : plan.cta}
                    </button>

                    {isGrowth && (
                      <div className="pp-sub-note">No credit card required · Cancel anytime</div>
                    )}
                  </div>
                </FadeIn>
              );
            })}
          </div>

          {/* Cost efficiency bar */}
          <FadeIn delay={320}>
            <div className="pp-eff-bar">
              <div className="pp-eff-item">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <circle cx="7" cy="7" r="6" stroke="#f59e0b" strokeWidth="1.2" />
                  <path d="M7 4v3h2" stroke="#f59e0b" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
                Starter: <strong style={{ color: "#f59e0b", marginLeft: 4 }}>$0.38 per meeting</strong>
              </div>
              <div className="pp-eff-sep" />
              <div className="pp-eff-item">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <circle cx="7" cy="7" r="6" stroke="#2563eb" strokeWidth="1.2" />
                  <path d="M5 7l1.5 1.5 2.5-3" stroke="#2563eb" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Growth: <strong style={{ color: "#2563eb", marginLeft: 4 }}>$0.16 per meeting</strong>
                <span style={{ color: "#64748b", fontSize: 11, marginLeft: 6 }}>— 58% more efficient</span>
              </div>
              <div className="pp-eff-sep" />
              <div className="pp-eff-item">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <circle cx="7" cy="7" r="6" stroke="#10b981" strokeWidth="1.2" />
                  <path d="M4.5 7l1.5 2 3-4" stroke="#10b981" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Scale: <strong style={{ color: "#10b981", marginLeft: 4 }}>best value for unlimited teams</strong>
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* TEAM PITCH */}
      <section className="pp-team">
        <div className="pp-team-inner">
          <FadeIn>
            <div>
              <div className="pp-section-kicker pp-team-kicker">Built for Teams</div>
              <h2 className="pp-section-title pp-team-title">Built for teams that want to win more deals</h2>
              <p className="pp-team-desc">
                Fixsense isn't just a call recorder. It's a performance layer for your entire sales org — so every rep improves, every manager has visibility, and every deal gets better coaching.
              </p>
              <div className="pp-team-bullets">
                {[
                  { icon: "👥", text: "Review calls together as a team — not in silos" },
                  { icon: "💬", text: "Share coaching feedback on specific call moments" },
                  { icon: "📈", text: "Track and improve individual rep performance over time" },
                  { icon: "🎯", text: "See exactly where deals are won and lost across your pipeline" },
                ].map((b, idx) => (
                  <div key={idx} className="pp-team-bullet">
                    <div className="pp-team-bullet-icon">{b.icon}</div>
                    <div className="pp-team-bullet-text">{b.text}</div>
                  </div>
                ))}
              </div>
            </div>
          </FadeIn>
          <FadeIn delay={120}>
            <div className="pp-team-visual">
              <div className="pp-team-visual-glow" />
              <div className="pp-team-stat-num">30%</div>
              <div className="pp-team-stat-label">Average increase in close rate within 90 days</div>
              <div className="pp-team-divider" />
              <div className="pp-team-stat-num">2×</div>
              <div className="pp-team-stat-label">Faster rep onboarding with coaching built in</div>
              <div className="pp-team-divider" />
              <div className="pp-team-tags">
                {["Zoom", "Google Meet", "Microsoft Teams", "HubSpot", "Salesforce", "Slack"].map(t => (
                  <span key={t} className="pp-team-tag">{t}</span>
                ))}
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* FEATURE MATRIX */}
      <section className="pp-matrix">
        <div className="pp-matrix-inner">
          <FadeIn>
            <div className="pp-matrix-header">
              <div className="pp-section-kicker">Compare Plans</div>
              <h2 className="pp-section-title pp-section-title-dark">Everything in one view</h2>
              <p className="pp-section-sub">See exactly what you get — and what unlocks when you upgrade.</p>
            </div>
          </FadeIn>
          <FadeIn delay={80}>
            <div className="pp-table-wrap">
              <table className="pp-table">
                <thead>
                  <tr className="pp-thead-row">
                    <th className="pp-th-cell">
                      <div className="pp-th-label">Feature</div>
                    </th>
                    {[
                      { name: "Starter", price: "$19/mo", growth: false },
                      { name: "Growth", price: "$49/mo", growth: true },
                      { name: "Scale", price: "$99/mo", growth: false },
                    ].map(col => (
                      <th key={col.name} className="pp-th-cell">
                        {col.growth && <div className="pp-growth-bar" />}
                        <div className={`pp-th-name ${col.growth ? "pp-th-name-growth" : ""}`}>{col.name}</div>
                        <div className="pp-th-price">{col.price}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {MATRIX_ROWS.map((row) => (
                    <tr key={row.label} className="pp-tbody-row">
                      <td className="pp-td-cell">{row.label}</td>
                      {/* Starter */}
                      <td className="pp-td-cell">
                        {typeof row.starter === "boolean" ? (
                          row.starter ? <CheckIcon /> : <XIcon />
                        ) : row.starter === "Limited" ? (
                          <span className="pp-td-partial">Limited</span>
                        ) : (
                          <span className="pp-td-val">{row.starter}</span>
                        )}
                      </td>
                      {/* Growth */}
                      <td className="pp-td-cell pp-td-growth-bg">
                        {typeof row.growth === "boolean" ? (
                          row.growth ? <CheckIcon green /> : <XIcon />
                        ) : (
                          <span className="pp-td-val pp-td-val-growth">{row.growth}</span>
                        )}
                      </td>
                      {/* Scale */}
                      <td className="pp-td-cell">
                        {typeof row.scale === "boolean" ? (
                          row.scale ? <CheckIcon green /> : <XIcon />
                        ) : (
                          <span className="pp-td-val">{row.scale}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* FAQ */}
      <FaqSection />

      {/* FINAL CTA */}
      <section className="pp-final">
        <div className="pp-final-glow" />
        <div className="pp-final-inner">
          <FadeIn>
            <h2 className="pp-final-title">
              Start with your team.<br />
              <span className="pp-final-blue">Scale when you're ready.</span>
            </h2>
            <p className="pp-final-desc">
              No complex setup. No IT tickets. Most teams are running live calls within 5 minutes — and choosing Growth before the week is out.
            </p>
            <div className="pp-final-btns">
              <Link to={user ? "/dashboard" : "/login"} className="pp-btn-final-primary">
                Start Free Trial
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M2 7h10M7 2l5 5-5 5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Link>
              <Link to={user ? "/dashboard/billing" : "/login"} className="pp-btn-final-ghost">
                Upgrade to Growth →
              </Link>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="pp-footer">
        <div className="pp-footer-inner">
          <Link to="/" className="pp-footer-logo">
            <Logo size={22} />
            <span className="pp-footer-name">Fixsense</span>
          </Link>
          <span className="pp-footer-legal">© {new Date().getFullYear()} Fixsense, Inc. All rights reserved.</span>
          <div className="pp-footer-links">
            <Link to="/privacy" className="pp-footer-link">Privacy</Link>
            <Link to="/terms" className="pp-footer-link">Terms</Link>
            <Link to="/security" className="pp-footer-link">Security</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
