import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

// ─── Intersection Observer Hook ────────────────────────────────────────────
function useInView(threshold = 0.15) {
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

function FadeIn({ children, delay = 0, className = "", up = true }: {
  children: React.ReactNode; delay?: number; className?: string; up?: boolean;
}) {
  const { ref, inView } = useInView();
  return (
    <div ref={ref} className={className} style={{
      opacity: inView ? 1 : 0,
      transform: inView ? "translateY(0)" : up ? "translateY(20px)" : "translateY(0)",
      transition: `opacity 0.7s cubic-bezier(0.22,1,0.36,1) ${delay}ms, transform 0.7s cubic-bezier(0.22,1,0.36,1) ${delay}ms`,
    }}>
      {children}
    </div>
  );
}

// ─── Logo ────────────────────────────────────────────────────────────────
function Logo({ size = 30 }: { size?: number }) {
  return (
    <img
      src="/fixsense_icon_logo (2).png"
      alt="Fixsense"
      width={size} height={size}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.24), objectFit: "cover", display: "block", flexShrink: 0 }}
    />
  );
}

// ─── Animated Number ─────────────────────────────────────────────────────
function Counter({ end, suffix = "" }: { end: number; suffix?: string }) {
  const [n, setN] = useState(0);
  const { ref, inView } = useInView(0.5);
  useEffect(() => {
    if (!inView) return;
    let start = 0, startTime: number;
    const step = (ts: number) => {
      if (!startTime) startTime = ts;
      const p = Math.min((ts - startTime) / 1600, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(Math.floor(eased * end));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [inView, end]);
  return <span ref={ref}>{n}{suffix}</span>;
}

export default function LandingPage() {
  const { user } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  const displayName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || null;
  const emailInitial = displayName?.[0]?.toUpperCase() || "U";

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  const NAV = [
    { label: "Product", href: "#features" },
    { label: "How It Works", href: "#how-it-works" },
    { label: "Pricing", href: "#pricing" },
    { label: "Testimonials", href: "#testimonials" },
  ];

  const METRICS = [
    { value: 30, suffix: "%", label: "Average increase in close rate" },
    { value: 10, suffix: "k+", label: "Sales meetings analyzed" },
    { value: 50, suffix: "%", label: "Reduction in ramp time" },
    { value: 99, suffix: "%", label: "Transcription accuracy" },
  ];

  const FEATURES = [
    {
      label: "Capture",
      title: "Real-Time Transcription",
      desc: "Every word, every speaker, captured with military-grade accuracy. Fixsense identifies voices automatically — no setup required.",
      detail: "Works across Zoom, Google Meet, and Microsoft Teams without any meeting room configuration.",
    },
    {
      label: "Analyze",
      title: "AI-Powered Deal Intelligence",
      desc: "Surface objections, buying signals, and engagement scores the moment they happen — not 24 hours later in a CRM note.",
      detail: "Proprietary sentiment models trained on millions of B2B sales conversations.",
    },
    {
      label: "Act",
      title: "Automated Follow-Through",
      desc: "Action items, CRM entries, and Slack summaries generated and delivered before the call window closes.",
      detail: "Connects to Salesforce, HubSpot, and Slack with zero manual data entry.",
    },
    {
      label: "Coach",
      title: "Systematic Rep Development",
      desc: "Replace opinion-based coaching with data-driven insight. Track talk ratio, objection handling, and question quality across every rep.",
      detail: "Team dashboards give managers visibility without sitting on every call.",
    },
  ];

  const LOGOS = ["Zoom", "Google Meet", "Salesforce", "HubSpot", "Slack", "Microsoft Teams"];

  const TESTIMONIALS = [
    {
      quote: "We replaced our entire call review process with Fixsense. Every manager now has full visibility across their book without listening to a single recording.",
      name: "Marcus Reid",
      title: "VP of Sales",
      company: "Vantex Technologies",
      initials: "MR",
      result: "42% improvement in quota attainment Q-over-Q",
    },
    {
      quote: "The objection intelligence alone justified the annual contract. Our reps get real-time responses instead of debriefing after the deal is lost.",
      name: "Sophia Chen",
      title: "Head of Revenue",
      company: "Launchflow",
      initials: "SC",
      result: "3.2× faster deal cycle on enterprise accounts",
    },
    {
      quote: "We onboard new reps in half the time. Fixsense gives them a coaching feedback loop that used to require years of shadowing.",
      name: "Daniel Osei",
      title: "Chief Revenue Officer",
      company: "Cloudpath",
      initials: "DO",
      result: "Ramp time reduced from 90 to 45 days",
    },
  ];

  const PLANS = [
    { name: "Starter", price: "$19", period: "/mo", desc: "Individual reps and small teams", features: ["50 meetings/month", "AI transcription & summaries", "Zoom + Google Meet", "3 team members", "Email support"], highlight: false },
    { name: "Growth", price: "$49", period: "/mo", desc: "Growing revenue teams", features: ["300 meetings/month", "Full AI deal intelligence", "All integrations", "10 team members", "Team analytics & coaching", "Priority support"], highlight: true },
    { name: "Scale", price: "$99", period: "/mo", desc: "Enterprise sales organizations", features: ["Unlimited meetings", "Unlimited team members", "Advanced analytics & API", "Custom onboarding", "Dedicated account manager", "SLA guarantee"], highlight: false },
  ];

  return (
    <div className="lp">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&family=DM+Mono:wght@300;400;500&family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        .lp {
          --ink: #0c0e14;
          --ink-2: #1c1f2b;
          --ink-3: #2d3147;
          --fog: #e8eaf2;
          --fog-2: #f3f4f8;
          --fog-3: #fafafc;
          --teal: #00b894;
          --teal-2: #00a07e;
          --teal-light: rgba(0,184,148,0.12);
          --teal-glow: rgba(0,184,148,0.25);
          --muted: #6b7280;
          --muted-2: #9ca3af;
          --border: rgba(28,31,43,0.1);
          --border-2: rgba(28,31,43,0.06);
          --font-display: 'Sora', sans-serif;
          --font-body: 'Sora', sans-serif;
          --font-mono: 'DM Mono', monospace;
          --font-serif: 'Libre Baskerville', serif;
          background: var(--fog-3);
          color: var(--ink);
          font-family: var(--font-body);
          -webkit-font-smoothing: antialiased;
          overflow-x: hidden;
        }

        /* ── NAV ── */
        .nav {
          position: fixed; top: 0; left: 0; right: 0; z-index: 100;
          height: 64px;
          display: flex; align-items: center;
          padding: 0 24px;
          transition: background 0.3s ease, box-shadow 0.3s ease, border-color 0.3s ease;
          border-bottom: 1px solid transparent;
        }
        .nav.scrolled {
          background: rgba(250,250,252,0.94);
          backdrop-filter: blur(20px);
          border-bottom-color: var(--border);
          box-shadow: 0 1px 0 var(--border-2);
        }
        .nav-inner {
          max-width: 1180px; width: 100%; margin: 0 auto;
          display: flex; align-items: center; justify-content: space-between;
        }
        .nav-logo {
          display: flex; align-items: center; gap: 10px;
          text-decoration: none;
        }
        .nav-logo-text {
          font-family: var(--font-display);
          font-size: 17px; font-weight: 700;
          color: var(--ink); letter-spacing: -0.03em;
        }
        .nav-links {
          display: flex; align-items: center; gap: 32px;
        }
        .nav-link {
          font-size: 13.5px; font-weight: 500; color: var(--muted);
          text-decoration: none; letter-spacing: -0.01em;
          transition: color 0.2s;
        }
        .nav-link:hover { color: var(--ink); }
        .nav-actions { display: flex; align-items: center; gap: 10px; }
        .btn-ghost-sm {
          font-size: 13px; font-weight: 500; color: var(--ink);
          background: none; border: none; cursor: pointer;
          padding: 7px 14px; border-radius: 8px;
          font-family: var(--font-body);
          text-decoration: none;
          transition: background 0.15s;
        }
        .btn-ghost-sm:hover { background: var(--fog); }
        .btn-primary-sm {
          font-size: 13px; font-weight: 600; color: #fff;
          background: var(--ink); border: none; cursor: pointer;
          padding: 8px 18px; border-radius: 8px;
          font-family: var(--font-body);
          text-decoration: none; letter-spacing: -0.01em;
          transition: background 0.15s;
        }
        .btn-primary-sm:hover { background: var(--ink-2); }
        .nav-user {
          display: flex; align-items: center; gap: 8px;
          background: var(--fog); border-radius: 100px;
          padding: 5px 12px 5px 5px;
          text-decoration: none;
        }
        .nav-user-av {
          width: 26px; height: 26px; border-radius: 50%;
          background: var(--teal); display: flex; align-items: center; justify-content: center;
          font-size: 11px; font-weight: 700; color: #fff;
        }
        .nav-user-name { font-size: 12.5px; font-weight: 600; color: var(--ink); }
        .hamburger {
          display: none; background: none; border: none; cursor: pointer;
          color: var(--ink); padding: 6px;
        }

        /* ── MOBILE DRAWER ── */
        .drawer-overlay {
          display: none; position: fixed; inset: 0; z-index: 200;
          background: rgba(12,14,20,0.55); backdrop-filter: blur(4px);
        }
        .drawer-overlay.open { display: block; }
        .drawer {
          position: fixed; top: 0; right: 0; bottom: 0;
          width: min(320px,90vw); z-index: 210;
          background: #fff; display: flex; flex-direction: column;
          transform: translateX(100%); transition: transform 0.28s cubic-bezier(0.4,0,0.2,1);
          box-shadow: -20px 0 60px rgba(12,14,20,0.18);
        }
        .drawer.open { transform: translateX(0); }
        .drawer-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 20px 24px; border-bottom: 1px solid var(--border-2);
        }
        .drawer-close {
          background: var(--fog); border: none; cursor: pointer;
          width: 32px; height: 32px; border-radius: 8px;
          display: flex; align-items: center; justify-content: center;
          color: var(--ink);
        }
        .drawer-nav { padding: 12px 16px; flex: 1; }
        .drawer-link {
          display: block; padding: 13px 8px;
          font-size: 15px; font-weight: 500; color: var(--ink);
          text-decoration: none; border-radius: 8px;
          transition: background 0.15s;
        }
        .drawer-link:hover { background: var(--fog); }
        .drawer-footer { padding: 16px 24px; border-top: 1px solid var(--border-2); display: flex; flex-direction: column; gap: 8px; }
        .btn-full {
          width: 100%; padding: 12px; border-radius: 10px;
          font-size: 14px; font-weight: 600; cursor: pointer;
          font-family: var(--font-body); text-align: center;
          text-decoration: none; display: block; letter-spacing: -0.01em;
        }
        .btn-full-primary { background: var(--ink); color: #fff; border: none; }
        .btn-full-secondary { background: var(--fog); color: var(--ink); border: none; }

        /* ── HERO ── */
        .hero {
          padding: 156px 24px 100px;
          display: flex; flex-direction: column; align-items: center;
          text-align: center; position: relative; overflow: hidden;
        }
        .hero-bg {
          position: absolute; inset: 0; pointer-events: none;
          background:
            radial-gradient(ellipse 60% 40% at 50% 0%, rgba(0,184,148,0.09) 0%, transparent 70%),
            linear-gradient(180deg, var(--fog-3) 0%, #fff 100%);
        }
        .hero-grid {
          position: absolute; inset: 0; pointer-events: none;
          background-image: linear-gradient(var(--border-2) 1px, transparent 1px), linear-gradient(90deg, var(--border-2) 1px, transparent 1px);
          background-size: 60px 60px;
          mask-image: radial-gradient(ellipse 80% 60% at 50% 0%, black 40%, transparent 100%);
        }
        .hero-eyebrow {
          display: inline-flex; align-items: center; gap: 8px;
          background: #fff; border: 1px solid var(--border);
          border-radius: 100px; padding: 5px 14px 5px 8px;
          font-size: 12px; font-weight: 600; color: var(--muted);
          letter-spacing: 0.02em; text-transform: uppercase;
          position: relative; z-index: 1; margin-bottom: 28px;
          box-shadow: 0 1px 4px rgba(12,14,20,0.06);
        }
        .hero-eyebrow-dot {
          width: 8px; height: 8px; border-radius: 50%; background: var(--teal);
        }
        .hero-title {
          font-family: var(--font-display);
          font-size: clamp(34px,6.5vw,72px);
          font-weight: 800; line-height: 1.04;
          letter-spacing: -0.04em; color: var(--ink);
          max-width: 820px; position: relative; z-index: 1;
          margin-bottom: 22px;
        }
        .hero-title em {
          font-style: italic; font-family: var(--font-serif);
          font-weight: 400; color: var(--teal);
          letter-spacing: -0.02em;
        }
        .hero-desc {
          font-size: clamp(15px,1.8vw,18px);
          color: var(--muted); line-height: 1.7;
          max-width: 520px; position: relative; z-index: 1;
          margin-bottom: 40px; font-weight: 400;
        }
        .hero-cta-group {
          display: flex; flex-wrap: wrap; gap: 12px; justify-content: center;
          position: relative; z-index: 1; margin-bottom: 56px;
        }
        .btn-hero-primary {
          display: inline-flex; align-items: center; gap: 8px;
          background: var(--ink); color: #fff;
          border: none; border-radius: 10px;
          padding: 14px 28px;
          font-size: 14px; font-weight: 600;
          font-family: var(--font-body); letter-spacing: -0.01em;
          cursor: pointer; text-decoration: none;
          transition: all 0.2s; box-shadow: 0 1px 2px rgba(12,14,20,0.15);
        }
        .btn-hero-primary:hover { background: var(--ink-2); transform: translateY(-1px); box-shadow: 0 4px 16px rgba(12,14,20,0.2); }
        .btn-hero-secondary {
          display: inline-flex; align-items: center; gap: 8px;
          background: #fff; color: var(--ink);
          border: 1px solid var(--border); border-radius: 10px;
          padding: 14px 28px;
          font-size: 14px; font-weight: 600;
          font-family: var(--font-body); letter-spacing: -0.01em;
          cursor: pointer; text-decoration: none;
          transition: all 0.2s; box-shadow: 0 1px 3px rgba(12,14,20,0.07);
        }
        .btn-hero-secondary:hover { border-color: rgba(12,14,20,0.25); transform: translateY(-1px); }
        .hero-trust {
          display: flex; align-items: center; gap: 20px;
          position: relative; z-index: 1; flex-wrap: wrap; justify-content: center;
        }
        .hero-trust-item {
          display: flex; align-items: center; gap: 6px;
          font-size: 12.5px; color: var(--muted); font-weight: 500;
        }
        .hero-trust-check {
          width: 18px; height: 18px; border-radius: 50%;
          background: rgba(0,184,148,0.12); display: flex; align-items: center; justify-content: center;
        }
        .hero-trust-sep { width: 3px; height: 3px; border-radius: 50%; background: var(--fog); }

        /* ── DASHBOARD SCREENSHOT ── */
        .hero-visual {
          position: relative; z-index: 1;
          max-width: 960px; width: 100%; margin: 0 auto;
          margin-top: 72px;
        }
        .hero-visual-frame {
          background: var(--ink); border-radius: 14px;
          padding: 0; overflow: hidden;
          box-shadow: 0 32px 80px rgba(12,14,20,0.28), 0 0 0 1px rgba(255,255,255,0.06);
        }
        .vf-bar {
          height: 38px; background: rgba(255,255,255,0.05);
          border-bottom: 1px solid rgba(255,255,255,0.06);
          display: flex; align-items: center; gap: 7px; padding: 0 14px;
        }
        .vf-dot { width: 10px; height: 10px; border-radius: 50%; }
        .vf-addr {
          flex: 1; text-align: center;
          background: rgba(255,255,255,0.06); border-radius: 5px;
          height: 22px; max-width: 240px; margin: 0 auto;
          display: flex; align-items: center; justify-content: center;
          font-family: var(--font-mono); font-size: 10px;
          color: rgba(255,255,255,0.3);
        }
        .vf-body {
          display: grid; grid-template-columns: 200px 1fr;
          height: 380px;
        }
        .vf-sidebar {
          background: rgba(255,255,255,0.03);
          border-right: 1px solid rgba(255,255,255,0.06);
          padding: 16px 12px;
        }
        .vf-s-logo {
          display: flex; align-items: center; gap: 7px; margin-bottom: 20px;
        }
        .vf-s-logomark {
          width: 24px; height: 24px; border-radius: 6px;
          background: var(--teal); display: flex; align-items: center; justify-content: center;
        }
        .vf-s-name { font-size: 12px; font-weight: 700; color: rgba(255,255,255,.8); font-family: var(--font-display); }
        .vf-nav-item {
          display: flex; align-items: center; gap: 8px;
          padding: 7px 10px; border-radius: 7px; margin-bottom: 2px;
          font-size: 11px; color: rgba(255,255,255,.4);
        }
        .vf-nav-item.active {
          background: rgba(0,184,148,.12); color: var(--teal);
        }
        .vf-dot-nav { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
        .vf-main { padding: 20px; overflow: hidden; }
        .vf-live-row {
          display: flex; align-items: center; gap: 10px; margin-bottom: 16px;
        }
        .vf-live-badge {
          display: flex; align-items: center; gap: 5px;
          background: rgba(239,68,68,.12); border: 1px solid rgba(239,68,68,.2);
          border-radius: 20px; padding: 4px 10px;
          font-size: 10px; font-weight: 700; color: #f87171;
          font-family: var(--font-mono);
        }
        .live-pulse {
          width: 6px; height: 6px; border-radius: 50%; background: #ef4444;
          animation: livepulse 1.4s ease-out infinite;
        }
        @keyframes livepulse {
          0% { box-shadow: 0 0 0 0 rgba(239,68,68,.6); }
          70% { box-shadow: 0 0 0 6px rgba(239,68,68,0); }
          100% { box-shadow: 0 0 0 0 rgba(239,68,68,0); }
        }
        .vf-call-name { font-size: 13px; font-weight: 600; color: rgba(255,255,255,.8); font-family: var(--font-display); }
        .vf-call-time { font-size: 11px; color: rgba(255,255,255,.35); font-family: var(--font-mono); margin-left: auto; }
        .vf-stats { display: grid; grid-template-columns: repeat(4,1fr); gap: 8px; margin-bottom: 16px; }
        .vf-stat {
          background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.07);
          border-radius: 8px; padding: 10px;
        }
        .vf-stat-label { font-size: 9px; color: rgba(255,255,255,.35); text-transform: uppercase; letter-spacing: .06em; margin-bottom: 4px; }
        .vf-stat-val { font-size: 16px; font-weight: 700; font-family: var(--font-display); }
        .vf-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .vf-transcript {
          background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.06);
          border-radius: 8px; padding: 10px;
        }
        .vf-t-label { font-size: 9px; font-weight: 600; color: rgba(255,255,255,.3); text-transform: uppercase; letter-spacing: .08em; margin-bottom: 8px; }
        .vf-t-line { display: flex; gap: 6px; margin-bottom: 6px; }
        .vf-t-speaker { font-size: 9px; font-weight: 700; min-width: 32px; margin-top: 1px; }
        .vf-t-text { font-size: 10px; color: rgba(255,255,255,.45); line-height: 1.5; }
        .vf-insights {
          background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.06);
          border-radius: 8px; padding: 10px; display: flex; flex-direction: column; gap: 6px;
        }
        .vf-i-card {
          border-radius: 6px; padding: 7px 9px;
        }
        .vf-i-tag { font-size: 9px; font-weight: 700; margin-bottom: 2px; text-transform: uppercase; letter-spacing: .06em; }
        .vf-i-body { font-size: 10px; color: rgba(255,255,255,.45); line-height: 1.4; }

        /* ── LOGO STRIP ── */
        .logo-strip {
          border-top: 1px solid var(--border-2); border-bottom: 1px solid var(--border-2);
          padding: 28px 24px;
        }
        .logo-strip-inner {
          max-width: 920px; margin: 0 auto;
          display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 24px;
        }
        .logo-strip-label {
          font-size: 11px; font-weight: 600; color: var(--muted-2);
          text-transform: uppercase; letter-spacing: 0.1em; white-space: nowrap;
        }
        .logo-strip-logos { display: flex; align-items: center; gap: 36px; flex-wrap: wrap; }
        .logo-name {
          font-family: var(--font-display); font-size: 14px; font-weight: 600;
          color: var(--muted-2); transition: color 0.2s; cursor: default;
        }
        .logo-name:hover { color: var(--ink); }

        /* ── METRICS ── */
        .metrics { padding: 96px 24px; background: var(--ink); }
        .metrics-inner { max-width: 900px; margin: 0 auto; }
        .metrics-header {
          display: flex; align-items: flex-end; justify-content: space-between;
          margin-bottom: 60px; gap: 24px; flex-wrap: wrap;
        }
        .metrics-kicker {
          font-size: 11px; font-weight: 600; color: var(--teal);
          text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 12px;
        }
        .metrics-title {
          font-family: var(--font-display); font-size: clamp(28px,4vw,42px);
          font-weight: 800; color: #fff; letter-spacing: -0.04em; line-height: 1.1;
          max-width: 440px;
        }
        .metrics-title em { font-style: italic; font-family: var(--font-serif); font-weight: 400; color: var(--teal); }
        .metrics-sub { font-size: 14px; color: rgba(255,255,255,.45); max-width: 280px; line-height: 1.6; }
        .metrics-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 1px; background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.07); border-radius: 12px; overflow: hidden; }
        .metric-card { background: rgba(255,255,255,.03); padding: 36px 28px; }
        .metric-num { font-family: var(--font-display); font-size: clamp(36px,4vw,52px); font-weight: 800; color: var(--teal); letter-spacing: -0.04em; line-height: 1; margin-bottom: 10px; }
        .metric-label { font-size: 13px; color: rgba(255,255,255,.4); line-height: 1.5; }

        /* ── FEATURES ── */
        .features { padding: 112px 24px; background: #fff; }
        .features-inner { max-width: 1100px; margin: 0 auto; }
        .section-kicker { font-size: 11px; font-weight: 600; color: var(--teal); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 14px; }
        .section-title { font-family: var(--font-display); font-size: clamp(28px,4vw,46px); font-weight: 800; color: var(--ink); letter-spacing: -0.04em; line-height: 1.1; margin-bottom: 16px; }
        .section-title em { font-style: italic; font-family: var(--font-serif); font-weight: 400; }
        .section-sub { font-size: 16px; color: var(--muted); line-height: 1.7; max-width: 520px; }
        .features-header { margin-bottom: 72px; }
        .features-grid { display: grid; grid-template-columns: repeat(2,1fr); gap: 2px; background: var(--fog); border-radius: 16px; overflow: hidden; }
        .feature-card {
          background: #fff; padding: 44px 40px;
          transition: background 0.2s;
        }
        .feature-card:hover { background: var(--fog-3); }
        .feature-label {
          display: inline-block;
          font-family: var(--font-mono); font-size: 10px; font-weight: 500;
          color: var(--teal); background: var(--teal-light);
          border-radius: 4px; padding: 3px 8px; margin-bottom: 18px;
          letter-spacing: 0.04em; text-transform: uppercase;
        }
        .feature-title { font-family: var(--font-display); font-size: 20px; font-weight: 700; color: var(--ink); letter-spacing: -0.03em; margin-bottom: 10px; }
        .feature-desc { font-size: 14px; color: var(--muted); line-height: 1.7; margin-bottom: 16px; }
        .feature-detail { font-size: 13px; color: var(--muted-2); line-height: 1.6; border-top: 1px solid var(--border-2); padding-top: 14px; }

        /* ── HOW IT WORKS ── */
        .how { padding: 112px 24px; background: var(--fog-3); }
        .how-inner { max-width: 1000px; margin: 0 auto; }
        .how-header { margin-bottom: 72px; }
        .how-steps { display: grid; grid-template-columns: repeat(3,1fr); gap: 0; position: relative; }
        .how-steps::before {
          content: ''; position: absolute;
          top: 28px; left: calc(16.66% + 24px); right: calc(16.66% + 24px);
          height: 1px; background: linear-gradient(90deg, var(--teal), transparent, var(--teal));
          opacity: .25;
        }
        .how-step { padding: 0 24px 0; }
        .how-step-num {
          width: 56px; height: 56px; border-radius: 14px;
          border: 1.5px solid var(--border); background: #fff;
          display: flex; align-items: center; justify-content: center;
          font-family: var(--font-display); font-size: 15px; font-weight: 800;
          color: var(--ink); margin-bottom: 24px;
          box-shadow: 0 2px 8px rgba(12,14,20,0.06);
          position: relative; z-index: 1;
        }
        .how-step-num.teal { background: var(--teal); color: #fff; border-color: var(--teal); box-shadow: 0 4px 16px var(--teal-glow); }
        .how-step-title { font-family: var(--font-display); font-size: 17px; font-weight: 700; color: var(--ink); letter-spacing: -0.03em; margin-bottom: 10px; }
        .how-step-desc { font-size: 14px; color: var(--muted); line-height: 1.65; }

        /* ── TESTIMONIALS ── */
        .testimonials { padding: 112px 24px; background: #fff; }
        .testimonials-inner { max-width: 1100px; margin: 0 auto; }
        .testimonials-header { margin-bottom: 64px; }
        .testimonials-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 20px; }
        .testimonial-card {
          background: var(--fog-3); border: 1px solid var(--border-2);
          border-radius: 16px; padding: 32px;
          display: flex; flex-direction: column;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .testimonial-card:hover { border-color: rgba(0,184,148,0.25); box-shadow: 0 8px 32px rgba(0,184,148,0.08); }
        .testimonial-result {
          display: inline-block;
          font-family: var(--font-mono); font-size: 10.5px; font-weight: 500;
          color: var(--teal); background: var(--teal-light);
          border-radius: 4px; padding: 3px 8px; margin-bottom: 18px;
          letter-spacing: 0.02em;
        }
        .testimonial-quote {
          font-size: 15px; color: var(--ink-2); line-height: 1.7;
          font-weight: 400; flex: 1; margin-bottom: 24px;
        }
        .testimonial-quote::before { content: '\201C'; color: var(--teal); font-size: 20px; font-family: var(--font-serif); line-height: 0; vertical-align: -5px; margin-right: 2px; }
        .testimonial-author { display: flex; align-items: center; gap: 12px; }
        .testimonial-av {
          width: 40px; height: 40px; border-radius: 50%;
          background: linear-gradient(135deg, var(--ink-2), var(--ink-3));
          display: flex; align-items: center; justify-content: center;
          font-size: 13px; font-weight: 700; color: #fff; flex-shrink: 0;
          font-family: var(--font-display);
        }
        .testimonial-name { font-size: 13.5px; font-weight: 700; color: var(--ink); letter-spacing: -0.02em; }
        .testimonial-title { font-size: 12px; color: var(--muted); margin-top: 1px; }

        /* ── PRICING ── */
        .pricing { padding: 112px 24px; background: var(--fog-3); }
        .pricing-inner { max-width: 980px; margin: 0 auto; }
        .pricing-header { text-align: center; margin-bottom: 64px; }
        .pricing-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 16px; align-items: start; }
        .pricing-card {
          background: #fff; border: 1px solid var(--border); border-radius: 16px;
          padding: 32px 28px; transition: box-shadow 0.2s;
        }
        .pricing-card.highlight {
          background: var(--ink); border-color: var(--ink);
          box-shadow: 0 16px 48px rgba(12,14,20,0.22);
        }
        .pricing-badge {
          display: inline-block; font-size: 10px; font-weight: 700;
          text-transform: uppercase; letter-spacing: 0.08em;
          color: var(--teal); background: var(--teal-light);
          border-radius: 4px; padding: 3px 8px; margin-bottom: 16px;
        }
        .pricing-badge.dark { color: var(--teal); background: rgba(0,184,148,0.15); }
        .pricing-name { font-family: var(--font-display); font-size: 20px; font-weight: 800; color: var(--ink); letter-spacing: -0.03em; margin-bottom: 4px; }
        .pricing-name.dark { color: #fff; }
        .pricing-desc { font-size: 13px; color: var(--muted); margin-bottom: 24px; }
        .pricing-desc.dark { color: rgba(255,255,255,.45); }
        .pricing-price-row { display: flex; align-items: baseline; gap: 2px; margin-bottom: 24px; }
        .pricing-price { font-family: var(--font-display); font-size: 40px; font-weight: 800; color: var(--ink); letter-spacing: -0.04em; }
        .pricing-price.dark { color: #fff; }
        .pricing-period { font-size: 14px; color: var(--muted); }
        .pricing-period.dark { color: rgba(255,255,255,.4); }
        .pricing-features-list { list-style: none; margin-bottom: 28px; display: flex; flex-direction: column; gap: 10px; }
        .pricing-feature { display: flex; align-items: flex-start; gap: 10px; font-size: 13.5px; color: var(--ink-2); }
        .pricing-feature.dark { color: rgba(255,255,255,.7); }
        .pricing-check { width: 18px; height: 18px; border-radius: 50%; background: rgba(0,184,148,0.12); flex-shrink: 0; display: flex; align-items: center; justify-content: center; margin-top: 1px; }
        .pricing-check svg { width: 10px; height: 10px; }
        .pricing-divider { height: 1px; background: var(--border-2); margin-bottom: 24px; }
        .pricing-divider.dark { background: rgba(255,255,255,.08); }
        .btn-plan {
          display: block; width: 100%; text-align: center;
          padding: 12px; border-radius: 10px;
          font-size: 14px; font-weight: 600;
          font-family: var(--font-body); cursor: pointer;
          text-decoration: none; letter-spacing: -0.01em;
          transition: all 0.2s; border: 1.5px solid;
        }
        .btn-plan-light { background: var(--fog-3); color: var(--ink); border-color: var(--border); }
        .btn-plan-light:hover { background: var(--fog); border-color: rgba(12,14,20,0.2); }
        .btn-plan-dark { background: var(--teal); color: #fff; border-color: var(--teal); }
        .btn-plan-dark:hover { background: var(--teal-2); }

        /* ── ENTERPRISE CTA ── */
        .enterprise { padding: 80px 24px; background: #fff; border-top: 1px solid var(--border-2); border-bottom: 1px solid var(--border-2); }
        .enterprise-inner {
          max-width: 900px; margin: 0 auto;
          display: flex; align-items: center; justify-content: space-between; gap: 40px; flex-wrap: wrap;
        }
        .enterprise-left { max-width: 520px; }
        .enterprise-kicker { font-size: 11px; font-weight: 600; color: var(--teal); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 12px; }
        .enterprise-title { font-family: var(--font-display); font-size: clamp(24px,3.5vw,36px); font-weight: 800; color: var(--ink); letter-spacing: -0.04em; line-height: 1.1; margin-bottom: 12px; }
        .enterprise-desc { font-size: 14px; color: var(--muted); line-height: 1.7; }
        .enterprise-right { display: flex; flex-direction: column; gap: 10px; min-width: 200px; }
        .btn-enterprise-primary {
          display: inline-flex; align-items: center; justify-content: center;
          background: var(--ink); color: #fff; border: none;
          border-radius: 10px; padding: 13px 24px;
          font-size: 14px; font-weight: 600; font-family: var(--font-body);
          cursor: pointer; text-decoration: none; letter-spacing: -0.01em;
          transition: background 0.2s;
        }
        .btn-enterprise-primary:hover { background: var(--ink-2); }
        .btn-enterprise-ghost {
          display: inline-flex; align-items: center; justify-content: center;
          background: none; color: var(--muted); border: 1px solid var(--border);
          border-radius: 10px; padding: 13px 24px;
          font-size: 14px; font-weight: 500; font-family: var(--font-body);
          cursor: pointer; text-decoration: none; letter-spacing: -0.01em;
          transition: border-color 0.2s, color 0.2s;
        }
        .btn-enterprise-ghost:hover { color: var(--ink); border-color: rgba(12,14,20,0.25); }
        .enterprise-assurances { margin-top: 20px; display: flex; flex-direction: column; gap: 7px; }
        .enterprise-assurance { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--muted); }
        .assurance-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--teal); flex-shrink: 0; }

        /* ── FINAL CTA ── */
        .final-cta { padding: 120px 24px; background: var(--ink); text-align: center; position: relative; overflow: hidden; }
        .final-cta-bg {
          position: absolute; inset: 0; pointer-events: none;
          background: radial-gradient(ellipse 60% 60% at 50% 50%, rgba(0,184,148,0.1) 0%, transparent 70%);
        }
        .final-cta-inner { position: relative; z-index: 1; max-width: 600px; margin: 0 auto; }
        .final-cta-title { font-family: var(--font-display); font-size: clamp(32px,5vw,56px); font-weight: 800; color: #fff; letter-spacing: -0.04em; line-height: 1.06; margin-bottom: 18px; }
        .final-cta-title em { font-style: italic; font-family: var(--font-serif); font-weight: 400; color: var(--teal); }
        .final-cta-desc { font-size: 16px; color: rgba(255,255,255,.45); line-height: 1.7; margin-bottom: 40px; }
        .final-cta-btns { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
        .btn-final-primary {
          display: inline-flex; align-items: center; gap: 8px;
          background: var(--teal); color: #fff; border: none;
          border-radius: 10px; padding: 14px 28px;
          font-size: 14px; font-weight: 600; font-family: var(--font-body);
          cursor: pointer; text-decoration: none; letter-spacing: -0.01em;
          transition: all 0.2s;
        }
        .btn-final-primary:hover { background: var(--teal-2); transform: translateY(-1px); }
        .btn-final-ghost {
          display: inline-flex; align-items: center; gap: 8px;
          background: rgba(255,255,255,.07); color: rgba(255,255,255,.7);
          border: 1px solid rgba(255,255,255,.12); border-radius: 10px;
          padding: 14px 28px; font-size: 14px; font-weight: 500;
          font-family: var(--font-body); cursor: pointer; text-decoration: none;
          letter-spacing: -0.01em; transition: all 0.2s;
        }
        .btn-final-ghost:hover { background: rgba(255,255,255,.12); color: #fff; }

        /* ── FOOTER ── */
        .footer { background: var(--ink-2); padding: 56px 24px 32px; }
        .footer-inner { max-width: 1100px; margin: 0 auto; }
        .footer-top {
          display: grid; grid-template-columns: 2fr 1fr 1fr 1fr;
          gap: 48px; margin-bottom: 48px; padding-bottom: 40px;
          border-bottom: 1px solid rgba(255,255,255,.07);
        }
        .footer-brand-logo { display: flex; align-items: center; gap: 9px; margin-bottom: 14px; }
        .footer-brand-name { font-family: var(--font-display); font-size: 16px; font-weight: 700; color: #fff; letter-spacing: -0.03em; }
        .footer-brand-desc { font-size: 13px; color: rgba(255,255,255,.35); line-height: 1.65; max-width: 240px; }
        .footer-col-title { font-size: 11px; font-weight: 600; color: rgba(255,255,255,.5); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 16px; }
        .footer-link { display: block; font-size: 13px; color: rgba(255,255,255,.35); text-decoration: none; margin-bottom: 10px; transition: color 0.2s; }
        .footer-link:hover { color: rgba(255,255,255,.7); }
        .footer-bottom {
          display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;
        }
        .footer-legal { font-size: 12px; color: rgba(255,255,255,.22); }
        .footer-legal-links { display: flex; gap: 20px; }
        .footer-legal-link { font-size: 12px; color: rgba(255,255,255,.25); text-decoration: none; transition: color 0.2s; }
        .footer-legal-link:hover { color: rgba(255,255,255,.5); }

        /* ── RESPONSIVE ── */
        @media (max-width: 1024px) {
          .footer-top { grid-template-columns: 1fr 1fr; }
        }
        @media (max-width: 768px) {
          .hamburger { display: flex; }
          .nav-links, .nav-actions { display: none; }
          .hero { padding: 120px 20px 80px; }
          .vf-body { grid-template-columns: 1fr; }
          .vf-sidebar { display: none; }
          .vf-stats { grid-template-columns: repeat(2,1fr); }
          .vf-grid { grid-template-columns: 1fr; }
          .metrics-header { flex-direction: column; }
          .metrics-grid { grid-template-columns: repeat(2,1fr); }
          .features-grid { grid-template-columns: 1fr; }
          .how-steps { grid-template-columns: 1fr; gap: 40px; }
          .how-steps::before { display: none; }
          .testimonials-grid { grid-template-columns: 1fr; }
          .pricing-grid { grid-template-columns: 1fr; }
          .enterprise-inner { flex-direction: column; }
          .footer-top { grid-template-columns: 1fr 1fr; }
          .footer-brand { grid-column: 1/-1; }
          .footer-bottom { flex-direction: column; align-items: flex-start; gap: 8px; }
        }
        @media (max-width: 480px) {
          .metrics-grid { grid-template-columns: 1fr 1fr; }
          .hero-cta-group { flex-direction: column; align-items: center; }
          .btn-hero-primary, .btn-hero-secondary { width: 100%; max-width: 320px; justify-content: center; }
          .final-cta-btns { flex-direction: column; align-items: center; }
          .btn-final-primary, .btn-final-ghost { width: 100%; max-width: 320px; justify-content: center; }
          .footer-top { grid-template-columns: 1fr; }
        }
      `}</style>

      {/* ── NAV ── */}
      <nav className={`nav ${scrolled ? "scrolled" : ""}`}>
        <div className="nav-inner">
          <Link to="/" className="nav-logo">
            <Logo size={28} />
            <span className="nav-logo-text">Fixsense</span>
          </Link>

          <div className="nav-links">
            {NAV.map(l => <a key={l.label} href={l.href} className="nav-link">{l.label}</a>)}
          </div>

          <div className="nav-actions">
            {user ? (
              <>
                <Link to="/dashboard/profile" className="nav-user">
                  <div className="nav-user-av">{emailInitial}</div>
                  <span className="nav-user-name">{displayName}</span>
                </Link>
                <Link to="/dashboard" className="btn-primary-sm">Dashboard →</Link>
              </>
            ) : (
              <>
                <Link to="/login" className="btn-ghost-sm">Sign in</Link>
                <Link to="/login" className="btn-primary-sm">Start free →</Link>
              </>
            )}
          </div>

          <button className="hamburger" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
      </nav>

      {/* ── MOBILE DRAWER ── */}
      <div className={`drawer-overlay ${mobileOpen ? "open" : ""}`} onClick={() => setMobileOpen(false)} />
      <div className={`drawer ${mobileOpen ? "open" : ""}`}>
        <div className="drawer-header">
          <Link to="/" className="nav-logo" onClick={() => setMobileOpen(false)}>
            <Logo size={26} />
            <span className="nav-logo-text">Fixsense</span>
          </Link>
          <button className="drawer-close" onClick={() => setMobileOpen(false)}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
        <nav className="drawer-nav">
          {NAV.map(l => <a key={l.label} href={l.href} className="drawer-link" onClick={() => setMobileOpen(false)}>{l.label}</a>)}
        </nav>
        <div className="drawer-footer">
          {user ? (
            <Link to="/dashboard" className="btn-full btn-full-primary" onClick={() => setMobileOpen(false)}>Go to Dashboard</Link>
          ) : (
            <>
              <Link to="/login" className="btn-full btn-full-primary" onClick={() => setMobileOpen(false)}>Start free trial</Link>
              <Link to="/login" className="btn-full btn-full-secondary" onClick={() => setMobileOpen(false)}>Sign in</Link>
            </>
          )}
        </div>
      </div>

      {/* ── HERO ── */}
      <section className="hero">
        <div className="hero-bg" />
        <div className="hero-grid" />

        <div className="hero-eyebrow">
          <div className="hero-eyebrow-dot" />
          AI Sales Intelligence Platform
        </div>

        <h1 className="hero-title">
          Win more deals with<br />
          <em>real-time</em> call intelligence
        </h1>

        <p className="hero-desc">
          Fixsense captures, transcribes, and analyzes every sales conversation — surfacing insights, objections, and next steps while the call is still live.
        </p>

        <div className="hero-cta-group">
          {user ? (
            <>
              <Link to="/dashboard" className="btn-hero-primary">
                Go to dashboard
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7h10M7 2l5 5-5 5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </Link>
              <Link to="/dashboard/live" className="btn-hero-secondary">Start a live call</Link>
            </>
          ) : (
            <>
              <Link to="/login" className="btn-hero-primary">
                Get started free
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7h10M7 2l5 5-5 5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </Link>
              <Link to="/pricing" className="btn-hero-secondary">View pricing</Link>
            </>
          )}
        </div>

        <div className="hero-trust">
          {["No credit card required", "5 free meetings/month", "SOC 2 compliant"].map((t, i) => (
            <span key={t} style={{ display: "contents" }}>
              {i > 0 && <div className="hero-trust-sep" />}
              <div className="hero-trust-item">
                <div className="hero-trust-check">
                  <svg width="9" height="9" viewBox="0 0 9 9" fill="none"><path d="M1.5 4.5l2 2L7.5 2" stroke="#00b894" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
                {t}
              </div>
            </span>
          ))}
        </div>

        {/* Dashboard mockup */}
        <div className="hero-visual">
          <div className="hero-visual-frame">
            <div className="vf-bar">
              <div className="vf-dot" style={{ background: "#ff5f57" }} />
              <div className="vf-dot" style={{ background: "#febc2e" }} />
              <div className="vf-dot" style={{ background: "#28c840" }} />
              <div className="vf-addr">app.fixsense.io/dashboard/live</div>
            </div>
            <div className="vf-body">
              <div className="vf-sidebar">
                <div className="vf-s-logo">
                  <div className="vf-s-logomark">
                    <Logo size={16} />
                  </div>
                  <span className="vf-s-name">Fixsense</span>
                </div>
                {[["Dashboard", false], ["Live Call", true], ["Calls", false], ["AI Coach", false], ["Team", false]].map(([l, a]) => (
                  <div key={l as string} className={`vf-nav-item ${a ? "active" : ""}`}>
                    <div className="vf-dot-nav" />
                    <span style={{ fontSize: 11, fontFamily: "var(--font-display)" }}>{l as string}</span>
                  </div>
                ))}
              </div>
              <div className="vf-main">
                <div className="vf-live-row">
                  <div className="vf-live-badge"><div className="live-pulse" />LIVE</div>
                  <span className="vf-call-name">Q4 Enterprise Discovery — Acme Corp</span>
                  <span className="vf-call-time">14:23</span>
                </div>
                <div className="vf-stats">
                  {[
                    { l: "Engagement", v: "87%", c: "#00b894" },
                    { l: "Talk Ratio", v: "42:58", c: "#818cf8" },
                    { l: "Sentiment", v: "Positive", c: "#34d399" },
                    { l: "Objections", v: "2 handled", c: "#f59e0b" },
                  ].map(s => (
                    <div key={s.l} className="vf-stat">
                      <div className="vf-stat-label">{s.l}</div>
                      <div className="vf-stat-val" style={{ color: s.c }}>{s.v}</div>
                    </div>
                  ))}
                </div>
                <div className="vf-grid">
                  <div className="vf-transcript">
                    <div className="vf-t-label">Live Transcript</div>
                    {[
                      { sp: "Rep", t: "What's your biggest challenge with your current forecasting process?", c: "#00b894" },
                      { sp: "Acme", t: "Honestly, we have zero visibility until deals are already lost.", c: "#818cf8" },
                      { sp: "Rep", t: "That's exactly what Fixsense was built to solve...", c: "#00b894" },
                    ].map((l, i) => (
                      <div key={i} className="vf-t-line">
                        <div className="vf-t-speaker" style={{ color: l.c }}>{l.sp}</div>
                        <div className="vf-t-text">{l.t}</div>
                      </div>
                    ))}
                  </div>
                  <div className="vf-insights">
                    <div className="vf-t-label">AI Insights</div>
                    <div className="vf-i-card" style={{ background: "rgba(245,158,11,.08)", border: "1px solid rgba(245,158,11,.2)" }}>
                      <div className="vf-i-tag" style={{ color: "#fbbf24" }}>⚡ Objection Detected</div>
                      <div className="vf-i-body">Prospect flagged CRM complexity. Address ROI of automation.</div>
                    </div>
                    <div className="vf-i-card" style={{ background: "rgba(0,184,148,.06)", border: "1px solid rgba(0,184,148,.18)" }}>
                      <div className="vf-i-tag" style={{ color: "#00b894" }}>✓ Buying Signal</div>
                      <div className="vf-i-body">Mentioned Q1 budget approval. Ideal time to propose.</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── LOGO STRIP ── */}
      <div className="logo-strip">
        <div className="logo-strip-inner">
          <span className="logo-strip-label">Integrates with</span>
          <div className="logo-strip-logos">
            {LOGOS.map(l => <span key={l} className="logo-name">{l}</span>)}
          </div>
        </div>
      </div>

      {/* ── METRICS ── */}
      <section className="metrics" id="results">
        <div className="metrics-inner">
          <FadeIn>
            <div className="metrics-header">
              <div>
                <div className="metrics-kicker">Proven results</div>
                <h2 className="metrics-title">Numbers that<br /><em>matter</em> to revenue teams</h2>
              </div>
              <p className="metrics-sub">Fixsense customers consistently outperform their prior benchmarks within a single quarter.</p>
            </div>
          </FadeIn>
          <FadeIn delay={80}>
            <div className="metrics-grid">
              {METRICS.map((m, i) => (
                <div key={i} className="metric-card">
                  <div className="metric-num"><Counter end={parseInt(m.value.toString())} suffix={m.suffix} /></div>
                  <div className="metric-label">{m.label}</div>
                </div>
              ))}
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section className="features" id="features">
        <div className="features-inner">
          <FadeIn>
            <div className="features-header">
              <div className="section-kicker">Capabilities</div>
              <h2 className="section-title">Built for the entire<br /><em>revenue workflow</em></h2>
              <p className="section-sub">From the moment a call starts to the second a deal closes, Fixsense gives your team an unfair advantage.</p>
            </div>
          </FadeIn>
          <div className="features-grid">
            {FEATURES.map((f, i) => (
              <FadeIn key={i} delay={i * 60}>
                <div className="feature-card">
                  <div className="feature-label">{f.label}</div>
                  <div className="feature-title">{f.title}</div>
                  <div className="feature-desc">{f.desc}</div>
                  <div className="feature-detail">{f.detail}</div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="how" id="how-it-works">
        <div className="how-inner">
          <FadeIn>
            <div className="how-header">
              <div className="section-kicker">How it works</div>
              <h2 className="section-title">Live in minutes,<br />results in days</h2>
            </div>
          </FadeIn>
          <div className="how-steps">
            {[
              { num: "01", title: "Connect your meetings", desc: "Link Zoom or Google Meet. No configuration required — Fixsense joins as a silent observer the moment your call begins.", active: true },
              { num: "02", title: "AI analyzes in real time", desc: "Every word is transcribed and analyzed for objections, sentiment, buying signals, and talk ratio as the conversation unfolds.", active: false },
              { num: "03", title: "Act on every insight", desc: "Receive a full summary, CRM entry, and coaching notes before your next meeting even starts.", active: false },
            ].map((s, i) => (
              <FadeIn key={i} delay={i * 90}>
                <div className="how-step">
                  <div className={`how-step-num ${s.active ? "teal" : ""}`}>{s.num}</div>
                  <div className="how-step-title">{s.title}</div>
                  <div className="how-step-desc">{s.desc}</div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ── */}
      <section className="testimonials" id="testimonials">
        <div className="testimonials-inner">
          <FadeIn>
            <div className="testimonials-header">
              <div className="section-kicker">Customer stories</div>
              <h2 className="section-title">Revenue leaders<br />trust Fixsense</h2>
            </div>
          </FadeIn>
          <div className="testimonials-grid">
            {TESTIMONIALS.map((t, i) => (
              <FadeIn key={i} delay={i * 70}>
                <div className="testimonial-card">
                  <div className="testimonial-result">{t.result}</div>
                  <p className="testimonial-quote">{t.quote}</p>
                  <div className="testimonial-author">
                    <div className="testimonial-av">{t.initials}</div>
                    <div>
                      <div className="testimonial-name">{t.name}</div>
                      <div className="testimonial-title">{t.title}, {t.company}</div>
                    </div>
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section className="pricing" id="pricing">
        <div className="pricing-inner">
          <FadeIn>
            <div className="pricing-header">
              <div className="section-kicker">Pricing</div>
              <h2 className="section-title" style={{ textAlign: "center" }}>Transparent pricing,<br />no surprises</h2>
              <p className="section-sub" style={{ textAlign: "center", margin: "12px auto 0" }}>Start free. Upgrade when you're ready. Cancel anytime.</p>
            </div>
          </FadeIn>
          <div className="pricing-grid">
            {PLANS.map((p, i) => (
              <FadeIn key={i} delay={i * 70}>
                <div className={`pricing-card ${p.highlight ? "highlight" : ""}`}>
                  <div className={`pricing-badge ${p.highlight ? "dark" : ""}`}>
                    {p.highlight ? "Most popular" : p.name}
                  </div>
                  <div className={`pricing-name ${p.highlight ? "dark" : ""}`}>{p.name}</div>
                  <div className={`pricing-desc ${p.highlight ? "dark" : ""}`}>{p.desc}</div>
                  <div className="pricing-price-row">
                    <div className={`pricing-price ${p.highlight ? "dark" : ""}`}>{p.price}</div>
                    <div className={`pricing-period ${p.highlight ? "dark" : ""}`}>{p.period}</div>
                  </div>
                  <div className={`pricing-divider ${p.highlight ? "dark" : ""}`} />
                  <ul className="pricing-features-list">
                    {p.features.map(f => (
                      <li key={f} className={`pricing-feature ${p.highlight ? "dark" : ""}`}>
                        <div className="pricing-check">
                          <svg viewBox="0 0 10 10" fill="none"><path d="M1.5 5l2 2 5-4" stroke="#00b894" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </div>
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Link
                    to={user ? "/dashboard/billing" : "/login"}
                    className={`btn-plan ${p.highlight ? "btn-plan-dark" : "btn-plan-light"}`}
                  >
                    {user ? (p.highlight ? "Upgrade to Growth" : "Get started") : "Start free trial"}
                  </Link>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── ENTERPRISE ── */}
      <section className="enterprise">
        <div className="enterprise-inner">
          <FadeIn>
            <div className="enterprise-left">
              <div className="enterprise-kicker">Enterprise</div>
              <h2 className="enterprise-title">Built to meet enterprise security requirements</h2>
              <p className="enterprise-desc">
                Custom contract terms, dedicated onboarding, SSO, audit logs, and a committed SLA. Talk to our enterprise team about what compliance looks like for your organization.
              </p>
              <div className="enterprise-assurances">
                {["SOC 2 Type II certified", "GDPR & CCPA compliant", "SSO / SAML support", "Custom data retention policies", "Dedicated customer success"].map(a => (
                  <div key={a} className="enterprise-assurance">
                    <div className="assurance-dot" />
                    {a}
                  </div>
                ))}
              </div>
            </div>
          </FadeIn>
          <FadeIn delay={120}>
            <div className="enterprise-right">
              <Link to="/login" className="btn-enterprise-primary">Talk to enterprise sales</Link>
              <Link to="/pricing" className="btn-enterprise-ghost">View all plans</Link>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section className="final-cta">
        <div className="final-cta-bg" />
        <div className="final-cta-inner">
          <FadeIn>
            <h2 className="final-cta-title">
              {user
                ? <>Your pipeline is<br /><em>waiting</em></>
                : <>Stop losing deals to<br /><em>missing information</>}
              </em>
            </h2>
            <p className="final-cta-desc">
              {user
                ? "Open your dashboard and start your next call with full AI intelligence."
                : "Every call you run without Fixsense is a call you won't fully understand. Start free today."}
            </p>
            <div className="final-cta-btns">
              <Link to={user ? "/dashboard" : "/login"} className="btn-final-primary">
                {user ? "Open dashboard" : "Get started free"}
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7h10M7 2l5 5-5 5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </Link>
              {!user && (
                <Link to="/pricing" className="btn-final-ghost">See pricing</Link>
              )}
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="footer">
        <div className="footer-inner">
          <div className="footer-top">
            <div className="footer-brand">
              <div className="footer-brand-logo">
                <Logo size={24} />
                <span className="footer-brand-name">Fixsense</span>
              </div>
              <p className="footer-brand-desc">AI-powered sales call intelligence for modern revenue teams. Capture, analyze, and act on every conversation.</p>
            </div>
            <div>
              <div className="footer-col-title">Product</div>
              {["Features", "Pricing", "Integrations", "Changelog"].map(l => <a key={l} href="#" className="footer-link">{l}</a>)}
            </div>
            <div>
              <div className="footer-col-title">Company</div>
              {["About", "Blog", "Careers", "Press"].map(l => <a key={l} href="#" className="footer-link">{l}</a>)}
            </div>
            <div>
              <div className="footer-col-title">Legal</div>
              {["Privacy Policy", "Terms of Service", "Security", "GDPR"].map(l => <a key={l} href="#" className="footer-link">{l}</a>)}
            </div>
          </div>
          <div className="footer-bottom">
            <span className="footer-legal">© {new Date().getFullYear()} Fixsense, Inc. All rights reserved.</span>
            <div className="footer-legal-links">
              <a href="#" className="footer-legal-link">Privacy</a>
              <a href="#" className="footer-legal-link">Terms</a>
              <a href="#" className="footer-legal-link">Security</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
