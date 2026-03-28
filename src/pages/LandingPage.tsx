import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

function useInView(threshold = 0.12) {
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

function Counter({ end, suffix = "" }: { end: number; suffix?: string }) {
  const [n, setN] = useState(0);
  const { ref, inView } = useInView(0.5);
  useEffect(() => {
    if (!inView) return;
    let startTime: number;
    const step = (ts: number) => {
      if (!startTime) startTime = ts;
      const p = Math.min((ts - startTime) / 1800, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(Math.floor(eased * end));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [inView, end]);
  return <span ref={ref}>{n}{suffix}</span>;
}

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

const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <circle cx="7" cy="7" r="7" fill="#2563EB" fillOpacity="0.12"/>
    <path d="M4 7l2 2 4-4" stroke="#2563EB" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

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

  const PROBLEMS = [
    { icon: "📋", text: "Sales reps forget key details after calls" },
    { icon: "👁", text: "Managers can't review every meeting" },
    { icon: "❓", text: "Teams don't know why deals are lost" },
  ];

  const FEATURES = [
    { icon: "🎙", title: "Real-Time Transcription", desc: "Every word captured with 99% accuracy. Auto speaker identification, no setup required." },
    { icon: "🤖", title: "AI Meeting Summaries", desc: "Actionable summaries delivered before your next call. CRM-ready in one click." },
    { icon: "⚡", title: "Objection Detection", desc: "Surface objections and buying signals the moment they happen — not a day later." },
    { icon: "📊", title: "Engagement Scoring", desc: "Know exactly how engaged your prospect is, in real time, during every call." },
    { icon: "👥", title: "Team Analytics Dashboard", desc: "Give managers full visibility across the team without sitting on every call." },
    { icon: "🎯", title: "Sales Coaching Insights", desc: "Track talk ratio, question quality, and objection handling for every rep." },
  ];

  const STEPS = [
    { num: "01", title: "Connect your meetings", desc: "Link Zoom or Google Meet in seconds. Fixsense joins as a silent observer the moment your call begins — no configuration needed." },
    { num: "02", title: "AI analyzes every conversation", desc: "Transcription, objection detection, talk ratio, and sentiment analysis happen automatically while you focus on selling." },
    { num: "03", title: "Improve and close more deals", desc: "Receive coaching insights, full summaries, and action steps after every meeting — before your next call starts." },
  ];

  const TESTIMONIALS = [
    {
      quote: "Fixsense helped our team increase close rates by 30%. We finally understand what's happening in our sales calls.",
      name: "Sarah Mitchell",
      role: "Head of Sales",
      company: "Vantex Technologies",
      initials: "SM",
      metric: "+30% close rate",
    },
    {
      quote: "Before Fixsense, we guessed. Now we have data on every call. The objection detection alone changed how we train reps.",
      name: "James Okafor",
      role: "Startup Founder",
      company: "Launchflow",
      initials: "JO",
      metric: "3x faster ramp time",
    },
    {
      quote: "We replaced our entire call review process with Fixsense. Every manager has full visibility without listening to recordings.",
      name: "Priya Nair",
      role: "Chief Revenue Officer",
      company: "Cloudpath",
      initials: "PN",
      metric: "90→45 day ramp",
    },
  ];

  const PLANS = [
    {
      name: "Free",
      price: "$0",
      period: "/month",
      desc: "Try Fixsense risk-free",
      features: ["5 meetings/month", "Basic analytics", "Zoom integration", "Email support"],
      highlight: false,
      cta: "Get Started Free",
    },
    {
      name: "Starter",
      price: "$19",
      period: "/month",
      desc: "For individual reps",
      features: ["50 meetings/month", "AI summaries", "All integrations", "3 team members"],
      highlight: false,
      cta: "Start Free Trial",
    },
    {
      name: "Growth",
      price: "$49",
      period: "/month",
      desc: "Best for growing teams",
      features: ["300 meetings/month", "Team analytics", "Coaching insights", "10 team members", "Priority support"],
      highlight: true,
      cta: "Start Free Trial",
    },
    {
      name: "Scale",
      price: "$99",
      period: "/month",
      desc: "Enterprise sales orgs",
      features: ["Unlimited meetings", "Advanced analytics", "API access", "Unlimited members", "Dedicated CSM"],
      highlight: false,
      cta: "Contact Sales",
    },
  ];

  const WHY = [
    "No manual note-taking ever again",
    "Real-time insights during live calls",
    "Coaching built into your workflow",
    "Works with Zoom, Meet, Salesforce, HubSpot & Slack",
    "SOC 2 Type II certified",
    "Up and running in under 5 minutes",
  ];

  const METRICS = [
    { value: 30, suffix: "%", label: "Average increase in close rate" },
    { value: 10, suffix: "k+", label: "Sales meetings analyzed" },
    { value: 50, suffix: "%", label: "Reduction in rep ramp time" },
    { value: 99, suffix: "%", label: "Transcription accuracy" },
  ];

  return (
    <div className="lp">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,500;12..96,600;12..96,700;12..96,800&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        .lp {
          --bg: #ffffff;
          --bg-2: #f8fafc;
          --bg-3: #f1f5f9;
          --ink: #0f172a;
          --ink-2: #1e293b;
          --ink-3: #334155;
          --muted: #64748b;
          --muted-2: #94a3b8;
          --border: #e2e8f0;
          --border-2: #f1f5f9;
          --blue: #2563eb;
          --blue-2: #1d4ed8;
          --blue-light: rgba(37,99,235,0.08);
          --blue-glow: rgba(37,99,235,0.2);
          --green: #10b981;
          --amber: #f59e0b;
          --font: 'Plus Jakarta Sans', sans-serif;
          --font-display: 'Bricolage Grotesque', sans-serif;
          background: var(--bg);
          color: var(--ink);
          font-family: var(--font);
          -webkit-font-smoothing: antialiased;
          overflow-x: hidden;
          line-height: 1.6;
        }

        /* NAV */
        .nav {
          position: fixed; top: 0; left: 0; right: 0; z-index: 100;
          height: 64px; display: flex; align-items: center; padding: 0 24px;
          transition: all 0.3s ease;
          border-bottom: 1px solid transparent;
        }
        .nav.scrolled {
          background: rgba(255,255,255,0.95);
          backdrop-filter: blur(20px);
          border-bottom-color: var(--border);
          box-shadow: 0 1px 16px rgba(15,23,42,0.06);
        }
        .nav-inner {
          max-width: 1160px; width: 100%; margin: 0 auto;
          display: flex; align-items: center; justify-content: space-between;
        }
        .nav-logo { display: flex; align-items: center; gap: 10px; text-decoration: none; }
        .nav-logo-text { font-family: var(--font-display); font-size: 17px; font-weight: 700; color: var(--ink); letter-spacing: -0.03em; }
        .nav-links { display: flex; align-items: center; gap: 28px; }
        .nav-link { font-size: 14px; font-weight: 500; color: var(--muted); text-decoration: none; transition: color 0.2s; }
        .nav-link:hover { color: var(--ink); }
        .nav-actions { display: flex; align-items: center; gap: 10px; }
        .btn-ghost { font-size: 13.5px; font-weight: 500; color: var(--ink); background: none; border: none; cursor: pointer; padding: 8px 16px; border-radius: 8px; font-family: var(--font); text-decoration: none; transition: background 0.15s; }
        .btn-ghost:hover { background: var(--bg-3); }
        .btn-nav-primary { font-size: 13.5px; font-weight: 600; color: #fff; background: var(--blue); border: none; cursor: pointer; padding: 8px 20px; border-radius: 8px; font-family: var(--font); text-decoration: none; letter-spacing: -0.01em; transition: background 0.15s, transform 0.15s; }
        .btn-nav-primary:hover { background: var(--blue-2); transform: translateY(-1px); }
        .nav-user { display: flex; align-items: center; gap: 8px; background: var(--bg-3); border-radius: 100px; padding: 5px 14px 5px 5px; text-decoration: none; }
        .nav-user-av { width: 28px; height: 28px; border-radius: 50%; background: var(--blue); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; color: #fff; }
        .nav-user-name { font-size: 13px; font-weight: 600; color: var(--ink); }
        .hamburger { display: none; background: none; border: none; cursor: pointer; color: var(--ink); padding: 6px; }

        /* MOBILE DRAWER */
        .drawer-overlay { display: none; position: fixed; inset: 0; z-index: 200; background: rgba(15,23,42,0.5); backdrop-filter: blur(4px); }
        .drawer-overlay.open { display: block; }
        .drawer { position: fixed; top: 0; right: 0; bottom: 0; width: min(320px,90vw); z-index: 210; background: #fff; display: flex; flex-direction: column; transform: translateX(100%); transition: transform 0.28s cubic-bezier(0.4,0,0.2,1); box-shadow: -20px 0 60px rgba(15,23,42,0.15); }
        .drawer.open { transform: translateX(0); }
        .drawer-header { display: flex; align-items: center; justify-content: space-between; padding: 20px 24px; border-bottom: 1px solid var(--border); }
        .drawer-close { background: var(--bg-3); border: none; cursor: pointer; width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: var(--ink); }
        .drawer-nav { padding: 12px 16px; flex: 1; }
        .drawer-link { display: block; padding: 13px 8px; font-size: 15px; font-weight: 500; color: var(--ink); text-decoration: none; border-radius: 8px; transition: background 0.15s; }
        .drawer-link:hover { background: var(--bg-3); }
        .drawer-footer { padding: 16px 24px; border-top: 1px solid var(--border); display: flex; flex-direction: column; gap: 8px; }
        .btn-full { width: 100%; padding: 13px; border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer; font-family: var(--font); text-align: center; text-decoration: none; display: block; letter-spacing: -0.01em; }
        .btn-full-primary { background: var(--blue); color: #fff; border: none; }
        .btn-full-secondary { background: var(--bg-3); color: var(--ink); border: none; }

        /* HERO */
        .hero {
          padding: 140px 24px 100px;
          display: flex; flex-direction: column; align-items: center;
          text-align: center; position: relative; overflow: hidden;
          background: linear-gradient(180deg, #f8faff 0%, #ffffff 100%);
        }
        .hero-pattern {
          position: absolute; inset: 0; pointer-events: none;
          background-image: radial-gradient(circle, #e2e8f0 1px, transparent 1px);
          background-size: 32px 32px;
          mask-image: radial-gradient(ellipse 80% 70% at 50% 0%, black 0%, transparent 100%);
          opacity: 0.6;
        }
        .hero-glow {
          position: absolute; top: -100px; left: 50%; transform: translateX(-50%);
          width: 700px; height: 500px; pointer-events: none;
          background: radial-gradient(ellipse, rgba(37,99,235,0.08) 0%, transparent 65%);
        }
        .hero-badge {
          position: relative; z-index: 1;
          display: inline-flex; align-items: center; gap: 8px;
          background: #fff; border: 1px solid var(--border);
          border-radius: 100px; padding: 6px 16px 6px 8px;
          font-size: 12.5px; font-weight: 600; color: var(--muted);
          margin-bottom: 28px;
          box-shadow: 0 1px 8px rgba(15,23,42,0.06);
        }
        .hero-badge-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--green); box-shadow: 0 0 0 3px rgba(16,185,129,0.2); }
        .hero-title {
          position: relative; z-index: 1;
          font-family: var(--font-display);
          font-size: clamp(36px, 6vw, 68px);
          font-weight: 800; line-height: 1.05;
          letter-spacing: -0.04em; color: var(--ink);
          max-width: 800px; margin-bottom: 22px;
        }
        .hero-title .blue { color: var(--blue); }
        .hero-sub {
          position: relative; z-index: 1;
          font-size: clamp(16px, 2vw, 19px); color: var(--muted);
          line-height: 1.65; max-width: 560px; margin-bottom: 40px;
        }
        .hero-ctas {
          position: relative; z-index: 1;
          display: flex; gap: 12px; justify-content: center; flex-wrap: wrap;
          margin-bottom: 48px;
        }
        .btn-hero-primary {
          display: inline-flex; align-items: center; gap: 8px;
          background: var(--blue); color: #fff; border: none;
          border-radius: 10px; padding: 15px 30px;
          font-size: 15px; font-weight: 600; font-family: var(--font);
          cursor: pointer; text-decoration: none; letter-spacing: -0.01em;
          transition: all 0.2s; box-shadow: 0 4px 16px var(--blue-glow);
        }
        .btn-hero-primary:hover { background: var(--blue-2); transform: translateY(-2px); box-shadow: 0 8px 24px var(--blue-glow); }
        .btn-hero-secondary {
          display: inline-flex; align-items: center; gap: 8px;
          background: #fff; color: var(--ink);
          border: 1.5px solid var(--border); border-radius: 10px;
          padding: 15px 30px; font-size: 15px; font-weight: 600;
          font-family: var(--font); cursor: pointer; text-decoration: none;
          transition: all 0.2s; box-shadow: 0 1px 4px rgba(15,23,42,0.06);
        }
        .btn-hero-secondary:hover { border-color: var(--muted-2); transform: translateY(-2px); }
        .hero-trust {
          position: relative; z-index: 1;
          display: flex; align-items: center; gap: 24px;
          flex-wrap: wrap; justify-content: center; margin-bottom: 72px;
        }
        .hero-trust-item { display: flex; align-items: center; gap: 7px; font-size: 13px; color: var(--muted); font-weight: 500; }
        .trust-sep { width: 4px; height: 4px; border-radius: 50%; background: var(--border); }

        /* DASHBOARD MOCKUP */
        .hero-mockup {
          position: relative; z-index: 1;
          width: 100%; max-width: 940px; margin: 0 auto;
          border-radius: 16px; overflow: hidden;
          border: 1px solid var(--border);
          box-shadow: 0 40px 100px rgba(15,23,42,0.18), 0 0 0 1px rgba(15,23,42,0.04);
        }
        .mockup-bar {
          height: 40px; background: #1e293b;
          display: flex; align-items: center; gap: 7px; padding: 0 16px;
        }
        .m-dot { width: 11px; height: 11px; border-radius: 50%; }
        .mockup-addr {
          flex: 1; margin: 0 auto; max-width: 220px; text-align: center;
          background: rgba(255,255,255,0.06); border-radius: 5px;
          height: 22px; display: flex; align-items: center; justify-content: center;
          font-size: 10px; color: rgba(255,255,255,0.3); font-family: monospace;
        }
        .mockup-body {
          background: #0f172a; display: grid;
          grid-template-columns: 190px 1fr; min-height: 360px;
        }
        .mockup-sidebar {
          background: #1e293b; border-right: 1px solid rgba(255,255,255,0.06);
          padding: 20px 14px;
        }
        .m-logo-row { display: flex; align-items: center; gap: 8px; margin-bottom: 24px; }
        .m-logomark { width: 26px; height: 26px; border-radius: 7px; background: var(--blue); display: flex; align-items: center; justify-content: center; }
        .m-logoname { font-size: 13px; font-weight: 700; color: rgba(255,255,255,0.85); }
        .m-nav-item { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 7px; margin-bottom: 2px; font-size: 11.5px; color: rgba(255,255,255,0.4); cursor: default; }
        .m-nav-item.active { background: rgba(37,99,235,0.15); color: #93c5fd; }
        .m-dot-nav { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
        .mockup-main { padding: 20px; }
        .m-live-row { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
        .m-live { display: flex; align-items: center; gap: 5px; background: rgba(239,68,68,0.12); border: 1px solid rgba(239,68,68,0.2); border-radius: 20px; padding: 4px 10px; font-size: 10px; font-weight: 700; color: #f87171; }
        .pulse { width: 6px; height: 6px; border-radius: 50%; background: #ef4444; animation: pulse 1.4s ease-out infinite; }
        @keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(239,68,68,0.6); } 70% { box-shadow: 0 0 0 6px rgba(239,68,68,0); } 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0); } }
        .m-call-name { font-size: 13px; font-weight: 600; color: rgba(255,255,255,0.8); }
        .m-time { font-size: 11px; color: rgba(255,255,255,0.3); margin-left: auto; font-family: monospace; }
        .m-stats { display: grid; grid-template-columns: repeat(4,1fr); gap: 8px; margin-bottom: 14px; }
        .m-stat { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.07); border-radius: 8px; padding: 10px; }
        .m-stat-l { font-size: 9px; color: rgba(255,255,255,0.35); text-transform: uppercase; letter-spacing: .06em; margin-bottom: 4px; }
        .m-stat-v { font-size: 15px; font-weight: 700; }
        .m-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .m-transcript { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; padding: 10px; }
        .m-section-label { font-size: 9px; font-weight: 600; color: rgba(255,255,255,0.3); text-transform: uppercase; letter-spacing: .08em; margin-bottom: 8px; }
        .m-line { display: flex; gap: 6px; margin-bottom: 6px; }
        .m-speaker { font-size: 9px; font-weight: 700; min-width: 30px; }
        .m-text { font-size: 10px; color: rgba(255,255,255,0.4); line-height: 1.5; }
        .m-insights { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; padding: 10px; display: flex; flex-direction: column; gap: 6px; }
        .m-insight { border-radius: 6px; padding: 7px 9px; }
        .m-i-tag { font-size: 9px; font-weight: 700; margin-bottom: 2px; text-transform: uppercase; letter-spacing: .05em; }
        .m-i-body { font-size: 10px; color: rgba(255,255,255,0.4); line-height: 1.4; }

        /* LOGO STRIP */
        .logo-strip { border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); padding: 24px; background: var(--bg-2); }
        .logo-strip-inner { max-width: 960px; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 20px; }
        .logo-strip-label { font-size: 11.5px; font-weight: 600; color: var(--muted-2); text-transform: uppercase; letter-spacing: 0.1em; white-space: nowrap; }
        .logo-strip-logos { display: flex; align-items: center; gap: 32px; flex-wrap: wrap; }
        .logo-name { font-family: var(--font-display); font-size: 14px; font-weight: 600; color: var(--muted-2); transition: color 0.2s; cursor: default; }
        .logo-name:hover { color: var(--ink-2); }

        /* SECTION COMMON */
        .section-kicker { font-size: 12px; font-weight: 700; color: var(--blue); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 12px; }
        .section-title { font-family: var(--font-display); font-size: clamp(28px,4vw,44px); font-weight: 800; color: var(--ink); letter-spacing: -0.04em; line-height: 1.1; margin-bottom: 16px; }
        .section-sub { font-size: 16px; color: var(--muted); line-height: 1.7; max-width: 520px; }

        /* PROBLEM → SOLUTION */
        .problem { padding: 100px 24px; background: var(--bg); }
        .problem-inner { max-width: 1100px; margin: 0 auto; display: grid; grid-template-columns: 1fr 1fr; gap: 80px; align-items: center; }
        .problem-problems { display: flex; flex-direction: column; gap: 14px; margin-top: 32px; }
        .problem-item { display: flex; align-items: flex-start; gap: 14px; background: #fff7ed; border: 1px solid #fed7aa; border-radius: 10px; padding: 14px 16px; }
        .problem-icon { font-size: 20px; flex-shrink: 0; margin-top: 2px; }
        .problem-text { font-size: 14.5px; color: var(--ink-2); font-weight: 500; line-height: 1.5; }
        .solution-box { background: linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%); border: 1px solid #bfdbfe; border-radius: 16px; padding: 36px; }
        .solution-label { display: inline-block; background: var(--blue); color: #fff; border-radius: 6px; padding: 4px 12px; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 18px; }
        .solution-title { font-family: var(--font-display); font-size: 24px; font-weight: 800; color: var(--ink); letter-spacing: -0.03em; margin-bottom: 14px; }
        .solution-desc { font-size: 15px; color: var(--muted); line-height: 1.7; }

        /* METRICS */
        .metrics { padding: 90px 24px; background: var(--ink); }
        .metrics-inner { max-width: 960px; margin: 0 auto; }
        .metrics-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 1px; background: rgba(255,255,255,0.08); border-radius: 14px; overflow: hidden; border: 1px solid rgba(255,255,255,0.08); }
        .metric-card { background: rgba(255,255,255,0.04); padding: 40px 28px; }
        .metric-num { font-family: var(--font-display); font-size: clamp(40px,5vw,56px); font-weight: 800; color: var(--blue); letter-spacing: -0.04em; line-height: 1; margin-bottom: 10px; }
        .metric-label { font-size: 13px; color: rgba(255,255,255,0.45); line-height: 1.5; }

        /* HOW IT WORKS */
        .how { padding: 100px 24px; background: var(--bg-2); }
        .how-inner { max-width: 1000px; margin: 0 auto; }
        .how-header { text-align: center; margin-bottom: 72px; }
        .how-header .section-sub { margin: 0 auto; }
        .how-steps { display: grid; grid-template-columns: repeat(3,1fr); gap: 40px; position: relative; }
        .how-connector {
          position: absolute; top: 32px;
          left: calc(33.3% + 20px); right: calc(33.3% + 20px);
          height: 1px; background: linear-gradient(90deg, var(--blue), rgba(37,99,235,0.2), var(--blue));
          display: flex; align-items: center; justify-content: center;
        }
        .how-step { position: relative; }
        .how-step-num {
          width: 64px; height: 64px; border-radius: 16px;
          background: #fff; border: 1.5px solid var(--border);
          display: flex; align-items: center; justify-content: center;
          font-family: var(--font-display); font-size: 16px; font-weight: 800; color: var(--ink);
          margin-bottom: 24px; position: relative; z-index: 1;
          box-shadow: 0 4px 12px rgba(15,23,42,0.07);
        }
        .how-step-num.active { background: var(--blue); color: #fff; border-color: var(--blue); box-shadow: 0 6px 20px var(--blue-glow); }
        .how-step-title { font-family: var(--font-display); font-size: 18px; font-weight: 700; color: var(--ink); letter-spacing: -0.03em; margin-bottom: 10px; }
        .how-step-desc { font-size: 14px; color: var(--muted); line-height: 1.7; }

        /* FEATURES */
        .features { padding: 100px 24px; background: var(--bg); }
        .features-inner { max-width: 1100px; margin: 0 auto; }
        .features-header { margin-bottom: 64px; }
        .features-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 16px; }
        .feature-card {
          background: var(--bg-2); border: 1px solid var(--border);
          border-radius: 14px; padding: 28px;
          transition: border-color 0.2s, box-shadow 0.2s, transform 0.2s;
        }
        .feature-card:hover { border-color: #bfdbfe; box-shadow: 0 8px 32px rgba(37,99,235,0.08); transform: translateY(-2px); }
        .feature-icon { font-size: 28px; margin-bottom: 14px; }
        .feature-title { font-family: var(--font-display); font-size: 17px; font-weight: 700; color: var(--ink); letter-spacing: -0.02em; margin-bottom: 8px; }
        .feature-desc { font-size: 13.5px; color: var(--muted); line-height: 1.65; }

        /* TESTIMONIALS */
        .testimonials { padding: 100px 24px; background: var(--bg-2); }
        .testimonials-inner { max-width: 1100px; margin: 0 auto; }
        .testimonials-header { margin-bottom: 56px; }
        .testimonials-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 20px; }
        .testimonial-card {
          background: #fff; border: 1px solid var(--border);
          border-radius: 16px; padding: 32px;
          display: flex; flex-direction: column;
          transition: box-shadow 0.2s, border-color 0.2s;
        }
        .testimonial-card:hover { border-color: #bfdbfe; box-shadow: 0 12px 40px rgba(37,99,235,0.1); }
        .testimonial-metric { display: inline-block; background: #eff6ff; color: var(--blue); border-radius: 6px; padding: 4px 10px; font-size: 11px; font-weight: 700; margin-bottom: 18px; letter-spacing: 0.02em; }
        .testimonial-quote { font-size: 15px; color: var(--ink-2); line-height: 1.7; flex: 1; margin-bottom: 24px; }
        .testimonial-author { display: flex; align-items: center; gap: 12px; border-top: 1px solid var(--border); padding-top: 18px; }
        .testimonial-av { width: 40px; height: 40px; border-radius: 50%; background: linear-gradient(135deg, var(--ink-2), var(--blue)); display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; color: #fff; flex-shrink: 0; }
        .testimonial-name { font-size: 13.5px; font-weight: 700; color: var(--ink); }
        .testimonial-role { font-size: 12px; color: var(--muted); margin-top: 1px; }

        /* WHY SECTION */
        .why { padding: 100px 24px; background: var(--bg); }
        .why-inner { max-width: 1100px; margin: 0 auto; display: grid; grid-template-columns: 1fr 1fr; gap: 80px; align-items: center; }
        .why-list { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 32px; }
        .why-item { display: flex; align-items: flex-start; gap: 10px; font-size: 14px; color: var(--ink-2); font-weight: 500; line-height: 1.5; }
        .why-visual { background: linear-gradient(135deg, var(--ink) 0%, var(--ink-2) 100%); border-radius: 20px; padding: 40px; position: relative; overflow: hidden; }
        .why-visual-bg { position: absolute; top: -40px; right: -40px; width: 200px; height: 200px; border-radius: 50%; background: radial-gradient(circle, rgba(37,99,235,0.25) 0%, transparent 70%); }
        .why-stat { margin-bottom: 24px; }
        .why-stat-num { font-family: var(--font-display); font-size: 48px; font-weight: 800; color: #fff; letter-spacing: -0.04em; line-height: 1; }
        .why-stat-label { font-size: 13px; color: rgba(255,255,255,0.5); margin-top: 4px; }
        .why-divider { height: 1px; background: rgba(255,255,255,0.08); margin: 20px 0; }
        .why-tags { display: flex; flex-wrap: wrap; gap: 8px; }
        .why-tag { background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.1); border-radius: 100px; padding: 5px 14px; font-size: 12px; color: rgba(255,255,255,0.6); }

        /* PRICING */
        .pricing { padding: 100px 24px; background: var(--bg-2); }
        .pricing-inner { max-width: 1100px; margin: 0 auto; }
        .pricing-header { text-align: center; margin-bottom: 60px; }
        .pricing-header .section-sub { margin: 0 auto; }
        .pricing-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 16px; align-items: start; }
        .pricing-card { background: #fff; border: 1.5px solid var(--border); border-radius: 16px; padding: 28px 24px; transition: box-shadow 0.2s; }
        .pricing-card.highlight { background: var(--ink); border-color: var(--ink); box-shadow: 0 20px 60px rgba(15,23,42,0.2); }
        .pricing-badge { display: inline-block; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--blue); background: var(--blue-light); border-radius: 4px; padding: 3px 8px; margin-bottom: 14px; }
        .pricing-badge.dark { color: #93c5fd; background: rgba(37,99,235,0.15); }
        .pricing-name { font-family: var(--font-display); font-size: 20px; font-weight: 800; color: var(--ink); letter-spacing: -0.03em; margin-bottom: 4px; }
        .pricing-name.dark { color: #fff; }
        .pricing-desc { font-size: 13px; color: var(--muted); margin-bottom: 20px; }
        .pricing-desc.dark { color: rgba(255,255,255,0.45); }
        .pricing-price-row { display: flex; align-items: baseline; gap: 2px; margin-bottom: 20px; }
        .pricing-price { font-family: var(--font-display); font-size: 38px; font-weight: 800; color: var(--ink); letter-spacing: -0.04em; }
        .pricing-price.dark { color: #fff; }
        .pricing-period { font-size: 13px; color: var(--muted); }
        .pricing-period.dark { color: rgba(255,255,255,0.4); }
        .pricing-divider { height: 1px; background: var(--border); margin-bottom: 20px; }
        .pricing-divider.dark { background: rgba(255,255,255,0.08); }
        .pricing-list { list-style: none; display: flex; flex-direction: column; gap: 9px; margin-bottom: 24px; }
        .pricing-feat { display: flex; align-items: flex-start; gap: 9px; font-size: 13px; color: var(--ink-2); }
        .pricing-feat.dark { color: rgba(255,255,255,0.7); }
        .pricing-feat svg circle { fill: rgba(255,255,255,0.1); }
        .pricing-feat svg path { stroke: #93c5fd; }
        .btn-plan { display: block; width: 100%; text-align: center; padding: 12px; border-radius: 10px; font-size: 14px; font-weight: 600; font-family: var(--font); cursor: pointer; text-decoration: none; letter-spacing: -0.01em; transition: all 0.2s; border: 1.5px solid; }
        .btn-plan-light { background: var(--bg-2); color: var(--ink); border-color: var(--border); }
        .btn-plan-light:hover { background: var(--bg-3); }
        .btn-plan-dark { background: var(--blue); color: #fff; border-color: var(--blue); box-shadow: 0 4px 12px var(--blue-glow); }
        .btn-plan-dark:hover { background: var(--blue-2); transform: translateY(-1px); }

        /* FINAL CTA */
        .final-cta { padding: 120px 24px; background: var(--ink); text-align: center; position: relative; overflow: hidden; }
        .final-cta-glow { position: absolute; inset: 0; pointer-events: none; background: radial-gradient(ellipse 70% 70% at 50% 50%, rgba(37,99,235,0.12) 0%, transparent 65%); }
        .final-cta-inner { position: relative; z-index: 1; max-width: 600px; margin: 0 auto; }
        .final-cta-title { font-family: var(--font-display); font-size: clamp(34px,5.5vw,58px); font-weight: 800; color: #fff; letter-spacing: -0.04em; line-height: 1.06; margin-bottom: 18px; }
        .final-cta-title .blue { color: #93c5fd; }
        .final-cta-desc { font-size: 17px; color: rgba(255,255,255,0.45); line-height: 1.7; margin-bottom: 40px; }
        .final-cta-btns { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
        .btn-final-primary { display: inline-flex; align-items: center; gap: 8px; background: var(--blue); color: #fff; border: none; border-radius: 10px; padding: 15px 30px; font-size: 15px; font-weight: 600; font-family: var(--font); cursor: pointer; text-decoration: none; letter-spacing: -0.01em; transition: all 0.2s; box-shadow: 0 4px 16px rgba(37,99,235,0.4); }
        .btn-final-primary:hover { background: var(--blue-2); transform: translateY(-2px); }
        .btn-final-ghost { display: inline-flex; align-items: center; gap: 8px; background: rgba(255,255,255,0.07); color: rgba(255,255,255,0.7); border: 1px solid rgba(255,255,255,0.12); border-radius: 10px; padding: 15px 30px; font-size: 15px; font-weight: 500; font-family: var(--font); cursor: pointer; text-decoration: none; transition: all 0.2s; }
        .btn-final-ghost:hover { background: rgba(255,255,255,0.12); color: #fff; }

        /* FOOTER */
        .footer { background: #0f172a; padding: 60px 24px 32px; border-top: 1px solid rgba(255,255,255,0.06); }
        .footer-inner { max-width: 1100px; margin: 0 auto; }
        .footer-top { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap: 48px; margin-bottom: 48px; padding-bottom: 40px; border-bottom: 1px solid rgba(255,255,255,0.07); }
        .footer-brand-logo { display: flex; align-items: center; gap: 9px; margin-bottom: 14px; }
        .footer-brand-name { font-family: var(--font-display); font-size: 16px; font-weight: 700; color: #fff; letter-spacing: -0.03em; }
        .footer-brand-desc { font-size: 13px; color: rgba(255,255,255,0.35); line-height: 1.65; max-width: 240px; }
        .footer-col-title { font-size: 11px; font-weight: 700; color: rgba(255,255,255,0.5); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 16px; }
        .footer-link { display: block; font-size: 13px; color: rgba(255,255,255,0.35); text-decoration: none; margin-bottom: 10px; transition: color 0.2s; }
        .footer-link:hover { color: rgba(255,255,255,0.7); }
        .footer-bottom { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
        .footer-legal { font-size: 12px; color: rgba(255,255,255,0.22); }
        .footer-legal-links { display: flex; gap: 20px; }
        .footer-legal-link { font-size: 12px; color: rgba(255,255,255,0.25); text-decoration: none; transition: color 0.2s; }
        .footer-legal-link:hover { color: rgba(255,255,255,0.5); }

        /* RESPONSIVE */
        @media (max-width: 1024px) {
          .pricing-grid { grid-template-columns: repeat(2,1fr); }
          .footer-top { grid-template-columns: 1fr 1fr; }
          .why-list { grid-template-columns: 1fr; }
        }
        @media (max-width: 768px) {
          .hamburger { display: flex; }
          .nav-links, .nav-actions { display: none; }
          .hero { padding: 120px 20px 80px; }
          .mockup-body { grid-template-columns: 1fr; }
          .mockup-sidebar { display: none; }
          .m-stats { grid-template-columns: repeat(2,1fr); }
          .m-grid { grid-template-columns: 1fr; }
          .problem-inner { grid-template-columns: 1fr; gap: 40px; }
          .metrics-grid { grid-template-columns: repeat(2,1fr); }
          .how-steps { grid-template-columns: 1fr; }
          .how-connector { display: none; }
          .features-grid { grid-template-columns: 1fr 1fr; }
          .testimonials-grid { grid-template-columns: 1fr; }
          .why-inner { grid-template-columns: 1fr; gap: 40px; }
          .pricing-grid { grid-template-columns: 1fr 1fr; }
          .footer-top { grid-template-columns: 1fr 1fr; }
          .footer-bottom { flex-direction: column; align-items: flex-start; }
        }
        @media (max-width: 480px) {
          .features-grid { grid-template-columns: 1fr; }
          .pricing-grid { grid-template-columns: 1fr; }
          .hero-ctas { flex-direction: column; align-items: center; }
          .btn-hero-primary, .btn-hero-secondary { width: 100%; max-width: 320px; justify-content: center; }
          .final-cta-btns { flex-direction: column; align-items: center; }
          .btn-final-primary, .btn-final-ghost { width: 100%; max-width: 320px; justify-content: center; }
          .footer-top { grid-template-columns: 1fr; }
        }
      `}</style>

      {/* NAV */}
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
                <Link to="/dashboard" className="btn-nav-primary">Dashboard →</Link>
              </>
            ) : (
              <>
                <Link to="/login" className="btn-ghost">Sign in</Link>
                <Link to="/login" className="btn-nav-primary">Start Free Trial →</Link>
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

      {/* MOBILE DRAWER */}
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
          {NAV.map(l => (
            <a key={l.label} href={l.href} className="drawer-link" onClick={() => setMobileOpen(false)}>{l.label}</a>
          ))}
        </nav>
        <div className="drawer-footer">
          {user ? (
            <Link to="/dashboard" className="btn-full btn-full-primary" onClick={() => setMobileOpen(false)}>Go to Dashboard</Link>
          ) : (
            <>
              <Link to="/login" className="btn-full btn-full-primary" onClick={() => setMobileOpen(false)}>Start Free Trial</Link>
              <Link to="/login" className="btn-full btn-full-secondary" onClick={() => setMobileOpen(false)}>Sign in</Link>
            </>
          )}
        </div>
      </div>

      {/* ── HERO ── */}
      <section className="hero">
        <div className="hero-pattern" />
        <div className="hero-glow" />

        

        <FadeIn delay={60}>
          <h1 className="hero-title">
            Close More Deals With{" "}
            <span className="blue">AI-Powered</span>{" "}
            Sales Call Intelligence
          </h1>
        </FadeIn>

        <FadeIn delay={120}>
          <p className="hero-sub">
            Fixsense records, analyzes, and improves your sales meetings in real time — so your team closes more deals without guessing what works.
          </p>
        </FadeIn>

        <FadeIn delay={180}>
          <div className="hero-ctas">
            {user ? (
              <>
                <Link to="/dashboard" className="btn-hero-primary">
                  Go to Dashboard
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7h10M7 2l5 5-5 5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </Link>
                <Link to="/dashboard/live" className="btn-hero-secondary">
                  ▶ Start a Live Call
                </Link>
              </>
            ) : (
              <>
                <Link to="/login" className="btn-hero-primary">
                  Start Free Trial
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7h10M7 2l5 5-5 5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </Link>
                <Link to="/login" className="btn-hero-secondary">
                  ▶ Watch Demo
                </Link>
              </>
            )}
          </div>
        </FadeIn>

        <FadeIn delay={220}>
          <div className="hero-trust">
            {["No credit card required", "Used by modern sales teams", "AI-powered insights in seconds", "SOC 2 compliant"].map((t, i) => (
              <span key={t} style={{ display: "contents" }}>
                {i > 0 && <div className="trust-sep" />}
                <div className="hero-trust-item">
                  <CheckIcon />
                  {t}
                </div>
              </span>
            ))}
          </div>
        </FadeIn>

        <FadeIn delay={280}>
          <div className="hero-mockup">
            <div className="mockup-bar">
              <div className="m-dot" style={{ background: "#ff5f57" }} />
              <div className="m-dot" style={{ background: "#febc2e" }} />
              <div className="m-dot" style={{ background: "#28c840" }} />
              <div className="mockup-addr">fixsense.com.ng/dashboard/live</div>
            </div>
            <div className="mockup-body">
              <div className="mockup-sidebar">
                <div className="m-logo-row">
                  <div className="m-logomark"><Logo size={16} /></div>
                  <span className="m-logoname">Fixsense</span>
                </div>
                {[["Dashboard", false], ["Live Call", true], ["All Calls", false], ["AI Coach", false], ["Team", false]].map(([l, a]) => (
                  <div key={l as string} className={`m-nav-item ${a ? "active" : ""}`}>
                    <div className="m-dot-nav" />
                    <span style={{ fontFamily: "var(--font)", fontSize: 12 }}>{l as string}</span>
                  </div>
                ))}
              </div>
              <div className="mockup-main">
                <div className="m-live-row">
                  <div className="m-live"><div className="pulse" />LIVE</div>
                  <span className="m-call-name">Q4 Enterprise Discovery — Acme Corp</span>
                  <span className="m-time">14:23</span>
                </div>
                <div className="m-stats">
                  {[
                    { l: "Engagement", v: "87%", c: "#10b981" },
                    { l: "Talk Ratio", v: "42:58", c: "#818cf8" },
                    { l: "Sentiment", v: "Positive", c: "#34d399" },
                    { l: "Objections", v: "2 handled", c: "#f59e0b" },
                  ].map(s => (
                    <div key={s.l} className="m-stat">
                      <div className="m-stat-l">{s.l}</div>
                      <div className="m-stat-v" style={{ color: s.c }}>{s.v}</div>
                    </div>
                  ))}
                </div>
                <div className="m-grid">
                  <div className="m-transcript">
                    <div className="m-section-label">Live Transcript</div>
                    {[
                      { sp: "Rep", t: "What's your biggest challenge with forecasting?", c: "#60a5fa" },
                      { sp: "Acme", t: "We have zero visibility until deals are already lost.", c: "#818cf8" },
                      { sp: "Rep", t: "That's exactly what Fixsense was built to solve.", c: "#60a5fa" },
                    ].map((line, i) => (
                      <div key={i} className="m-line">
                        <div className="m-speaker" style={{ color: line.c }}>{line.sp}</div>
                        <div className="m-text">{line.t}</div>
                      </div>
                    ))}
                  </div>
                  <div className="m-insights">
                    <div className="m-section-label">AI Insights</div>
                    <div className="m-insight" style={{ background: "rgba(245,158,11,.08)", border: "1px solid rgba(245,158,11,.2)" }}>
                      <div className="m-i-tag" style={{ color: "#fbbf24" }}>⚡ Objection Detected</div>
                      <div className="m-i-body">Prospect flagged CRM complexity. Address ROI of automation.</div>
                    </div>
                    <div className="m-insight" style={{ background: "rgba(16,185,129,.06)", border: "1px solid rgba(16,185,129,.18)" }}>
                      <div className="m-i-tag" style={{ color: "#10b981" }}>✓ Buying Signal</div>
                      <div className="m-i-body">Mentioned Q1 budget. Ideal time to propose next steps.</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </FadeIn>
      </section>

      {/* LOGO STRIP */}
      <div className="logo-strip">
        <div className="logo-strip-inner">
          <span className="logo-strip-label">Integrates with</span>
          <div className="logo-strip-logos">
            {["Zoom", "Google Meet", "Salesforce", "HubSpot", "Slack", "Microsoft Teams"].map(l => (
              <span key={l} className="logo-name">{l}</span>
            ))}
          </div>
        </div>
      </div>

      {/* PROBLEM → SOLUTION */}
      <section className="problem" id="problem">
        <div className="problem-inner">
          <FadeIn>
            <div>
              <div className="section-kicker">The Problem</div>
              <h2 className="section-title">Your team is losing deals they shouldn't</h2>
              <p className="section-sub">Every sales team faces the same invisible leaks — and most never diagnose them.</p>
              <div className="problem-problems">
                {PROBLEMS.map((p, i) => (
                  <div key={i} className="problem-item">
                    <div className="problem-icon">{p.icon}</div>
                    <div className="problem-text">{p.text}</div>
                  </div>
                ))}
              </div>
            </div>
          </FadeIn>
          <FadeIn delay={120}>
            <div className="solution-box">
              <div className="solution-label">The Solution</div>
              <h3 className="solution-title">Full visibility into every sales conversation</h3>
              <p className="solution-desc">
                Fixsense automatically records and analyzes every sales call, giving you clear insights on what works and what doesn't — so you can replicate winning behaviors across your entire team.
              </p>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* METRICS */}
      <section className="metrics">
        <div className="metrics-inner">
          <FadeIn>
            <div className="metrics-grid">
              {METRICS.map((m, i) => (
                <div key={i} className="metric-card">
                  <div className="metric-num"><Counter end={m.value} suffix={m.suffix} /></div>
                  <div className="metric-label">{m.label}</div>
                </div>
              ))}
            </div>
          </FadeIn>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="how" id="how-it-works">
        <div className="how-inner">
          <FadeIn>
            <div className="how-header">
              <div className="section-kicker">How It Works</div>
              <h2 className="section-title">Live in minutes, results in days</h2>
              <p className="section-sub">No complex setup. No IT tickets. Just connect and start getting insights.</p>
            </div>
          </FadeIn>
          <div className="how-steps">
            <div className="how-connector" />
            {STEPS.map((s, i) => (
              <FadeIn key={i} delay={i * 100}>
                <div className="how-step">
                  <div className={`how-step-num ${i === 0 ? "active" : ""}`}>{s.num}</div>
                  <div className="how-step-title">{s.title}</div>
                  <div className="how-step-desc">{s.desc}</div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="features" id="features">
        <div className="features-inner">
          <FadeIn>
            <div className="features-header">
              <div className="section-kicker">Capabilities</div>
              <h2 className="section-title">Everything your revenue team needs</h2>
              <p className="section-sub">From the first word spoken to the final follow-up, Fixsense has every moment covered.</p>
            </div>
          </FadeIn>
          <div className="features-grid">
            {FEATURES.map((f, i) => (
              <FadeIn key={i} delay={i * 60}>
                <div className="feature-card">
                  <div className="feature-icon">{f.icon}</div>
                  <div className="feature-title">{f.title}</div>
                  <div className="feature-desc">{f.desc}</div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="testimonials" id="testimonials">
        <div className="testimonials-inner">
          <FadeIn>
            <div className="testimonials-header">
              <div className="section-kicker">Customer Stories</div>
              <h2 className="section-title">Revenue leaders trust Fixsense</h2>
            </div>
          </FadeIn>
          <div className="testimonials-grid">
            {TESTIMONIALS.map((t, i) => (
              <FadeIn key={i} delay={i * 80}>
                <div className="testimonial-card">
                  <div className="testimonial-metric">{t.metric}</div>
                  <p className="testimonial-quote">{t.quote}</p>
                  <div className="testimonial-author">
                    <div className="testimonial-av">{t.initials}</div>
                    <div>
                      <div className="testimonial-name">{t.name}</div>
                      <div className="testimonial-role">{t.role}, {t.company}</div>
                    </div>
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* WHY FIXSENSE */}
      <section className="why">
        <div className="why-inner">
          <FadeIn>
            <div>
              <div className="section-kicker">Why Fixsense</div>
              <h2 className="section-title">A sales performance engine, not just a recorder</h2>
              <p className="section-sub">Fixsense doesn't just capture calls — it turns every conversation into a coaching opportunity.</p>
              <div className="why-list">
                {WHY.map((w, i) => (
                  <div key={i} className="why-item">
                    <CheckIcon />
                    {w}
                  </div>
                ))}
              </div>
            </div>
          </FadeIn>
          <FadeIn delay={120}>
            <div className="why-visual">
              <div className="why-visual-bg" />
              <div className="why-stat">
                <div className="why-stat-num">30%</div>
                <div className="why-stat-label">Average increase in close rate within 90 days</div>
              </div>
              <div className="why-divider" />
              <div className="why-stat">
                <div className="why-stat-num">2x</div>
                <div className="why-stat-label">Faster rep onboarding with coaching built in</div>
              </div>
              <div className="why-divider" />
              <div className="why-tags">
                {["Zoom", "Google Meet", "Salesforce", "HubSpot", "Slack"].map(tag => (
                  <span key={tag} className="why-tag">{tag}</span>
                ))}
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* PRICING */}
      <section className="pricing" id="pricing">
        <div className="pricing-inner">
          <FadeIn>
            <div className="pricing-header">
              <div className="section-kicker">Pricing</div>
              <h2 className="section-title">Transparent pricing, no surprises</h2>
              <p className="section-sub">Start free. Upgrade when you're ready. Cancel anytime.</p>
            </div>
          </FadeIn>
          <div className="pricing-grid">
            {PLANS.map((p, i) => (
              <FadeIn key={i} delay={i * 70}>
                <div className={`pricing-card ${p.highlight ? "highlight" : ""}`}>
                  <div className={`pricing-badge ${p.highlight ? "dark" : ""}`}>
                    {p.highlight ? "Most Popular" : p.name}
                  </div>
                  <div className={`pricing-name ${p.highlight ? "dark" : ""}`}>{p.name}</div>
                  <div className={`pricing-desc ${p.highlight ? "dark" : ""}`}>{p.desc}</div>
                  <div className="pricing-price-row">
                    <div className={`pricing-price ${p.highlight ? "dark" : ""}`}>{p.price}</div>
                    <div className={`pricing-period ${p.highlight ? "dark" : ""}`}>{p.period}</div>
                  </div>
                  <div className={`pricing-divider ${p.highlight ? "dark" : ""}`} />
                  <ul className="pricing-list">
                    {p.features.map(f => (
                      <li key={f} className={`pricing-feat ${p.highlight ? "dark" : ""}`}>
                        <CheckIcon />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Link
                    to={user ? "/dashboard/billing" : "/login"}
                    className={`btn-plan ${p.highlight ? "btn-plan-dark" : "btn-plan-light"}`}
                  >
                    {p.cta}
                  </Link>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="final-cta">
        <div className="final-cta-glow" />
        <div className="final-cta-inner">
          <FadeIn>
            <h2 className="final-cta-title">
              {user
                ? "Your pipeline is waiting"
                : <span>Start closing more<br /><span className="blue">deals today</span></span>
              }
            </h2>
            <p className="final-cta-desc">
              {user
                ? "Open your dashboard and start your next call with full AI intelligence."
                : "Every call you run without Fixsense is a call you won't fully understand. Join thousands of reps closing more."}
            </p>
            <div className="final-cta-btns">
              <Link to={user ? "/dashboard" : "/login"} className="btn-final-primary">
                {user ? "Open Dashboard" : "Start Free Trial"}
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7h10M7 2l5 5-5 5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </Link>
              {!user && (
                <Link to="/login" className="btn-final-ghost">Book a Demo</Link>
              )}
            </div>
          </FadeIn>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="footer">
        <div className="footer-inner">
          <div className="footer-top">
            <div>
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
              {["Privacy Policy", "Terms of Service", "Security", "Contact"].map(l => <a key={l} href="#" className="footer-link">{l}</a>)}
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
