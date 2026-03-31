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
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
    <circle cx="8" cy="8" r="8" fill="rgba(37,99,235,0.1)" />
    <path d="M5 8l2 2 4-4" stroke="#2563EB" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const StarIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="#f59e0b" style={{ flexShrink: 0 }}>
    <path d="M7 1l1.545 3.13 3.455.503-2.5 2.437.59 3.44L7 8.885l-3.09 1.625.59-3.44L2 4.633l3.455-.503z" />
  </svg>
);

// ─── Data ─────────────────────────────────────────────────────────────────────

const FEATURED = {
  quote: "Before Fixsense, every deal post-mortem was a guessing game. We'd sit in a room and speculate about why we lost. Now we have the data. We can see exactly where conversations stalled, which objections went unaddressed, and which reps need coaching on specific moments. Our close rate climbed 30% in the first quarter and it's stayed there.",
  name: "Sarah Mitchell",
  role: "Head of Sales",
  company: "Vantex Technologies",
  initials: "SM",
  metric: "+30% close rate",
  industry: "B2B SaaS",
  teamSize: "22 reps",
};

const TESTIMONIALS = [
  {
    quote: "The objection detection alone changed how we train reps. We can now identify exactly which objections each rep struggles with and build targeted coaching around that. 3x faster ramp time for new hires.",
    name: "James Okafor",
    role: "Startup Founder",
    company: "Launchflow",
    initials: "JO",
    metric: "3× faster ramp",
    industry: "Developer Tools",
    teamSize: "8 reps",
    category: "coaching",
  },
  {
    quote: "We replaced our entire call review process with Fixsense. Every manager has full visibility without listening to recordings. Ramp time dropped from 90 to 45 days.",
    name: "Priya Nair",
    role: "Chief Revenue Officer",
    company: "Cloudpath",
    initials: "PN",
    metric: "90 → 45 day ramp",
    industry: "Cloud Infrastructure",
    teamSize: "40 reps",
    category: "management",
  },
  {
    quote: "I was skeptical AI could actually help with sales. But seeing real-time objection flags during live calls is genuinely game-changing. We closed a $180k deal last month because the rep caught a signal they would have missed.",
    name: "Derek Arnolds",
    role: "VP of Sales",
    company: "Meridian SaaS",
    initials: "DA",
    metric: "$180k deal saved",
    industry: "MarTech",
    teamSize: "15 reps",
    category: "revenue",
  },
  {
    quote: "Our team is fully remote across 4 time zones. Managers can't sit on every call. Fixsense means nothing slips through the cracks — every call is analyzed, every action item is logged, every rep gets feedback.",
    name: "Lena Hartmann",
    role: "Director of Sales",
    company: "Orbis Global",
    initials: "LH",
    metric: "Zero missed reviews",
    industry: "Enterprise Logistics",
    teamSize: "30 reps",
    category: "management",
  },
  {
    quote: "The HubSpot sync is flawless. Reps used to spend 20 minutes updating the CRM after every call. Now it's automatic. We saved over 80 hours a month just on admin.",
    name: "Tomás Vela",
    role: "Sales Operations Lead",
    company: "Stackly",
    initials: "TV",
    metric: "80 hrs/month saved",
    industry: "FinTech",
    teamSize: "12 reps",
    category: "productivity",
  },
  {
    quote: "Talk ratio analytics completely changed how we coach. We discovered our best closers spoke only 42% of the time. We built a program around that insight and watched conversion jump 18% in six weeks.",
    name: "Amara Diallo",
    role: "Sales Enablement Manager",
    company: "PulseHR",
    initials: "AD",
    metric: "+18% conversion",
    industry: "HR Tech",
    teamSize: "18 reps",
    category: "coaching",
  },
  {
    quote: "Set up in literally 4 minutes. I've deployed Salesforce in a past life — the contrast is unreal. Fixsense connected to Zoom, analyzed our first call, and had summaries waiting in Slack the same morning.",
    name: "Ryan Cheung",
    role: "Head of Growth",
    company: "Fora Labs",
    initials: "RC",
    metric: "4-min setup",
    industry: "AI/ML Tooling",
    teamSize: "6 reps",
    category: "productivity",
  },
  {
    quote: "We tried two other conversation intelligence tools. Both felt like they were built for companies 10x our size. Fixsense actually works for a scrappy 10-person team without a dedicated RevOps person.",
    name: "Isabelle Morel",
    role: "Founding Account Executive",
    company: "Breeze CX",
    initials: "IM",
    metric: "Best fit for SMB",
    industry: "CX Software",
    teamSize: "10 reps",
    category: "revenue",
  },
  {
    quote: "The sentiment analysis catches things you'd never notice manually. We found that deals where prospects went quiet after the pricing slide had a 71% churn rate. We redesigned the entire pricing conversation based on that one insight.",
    name: "Carlos Mendez",
    role: "Revenue Analytics Lead",
    company: "ScaleIQ",
    initials: "CM",
    metric: "71% churn pattern caught",
    industry: "Analytics SaaS",
    teamSize: "25 reps",
    category: "revenue",
  },
];

const METRICS = [
  { value: 30, suffix: "%", label: "Avg. increase in close rate" },
  { value: 10, suffix: "k+", label: "Sales meetings analyzed" },
  { value: 50, suffix: "%", label: "Reduction in ramp time" },
  { value: 99, suffix: "%", label: "Transcription accuracy" },
];

const CATEGORIES = [
  { id: "all", label: "All stories" },
  { id: "revenue", label: "Revenue impact" },
  { id: "coaching", label: "Coaching & training" },
  { id: "management", label: "Team management" },
  { id: "productivity", label: "Productivity" },
];

const LOGOS = ["Zoom", "Google Meet", "Salesforce", "HubSpot", "Slack", "Microsoft Teams"];

export default function TestimonialsPage() {
  const { user } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [activeCategory, setActiveCategory] = useState("all");

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
    { label: "Product", href: "/#features" },
    { label: "How It Works", href: "/#how-it-works" },
    { label: "Pricing", href: "/pricing" },
    { label: "Testimonials", href: "/testimonials" },
  ];

  const filtered = activeCategory === "all"
    ? TESTIMONIALS
    : TESTIMONIALS.filter(t => t.category === activeCategory);

  return (
    <div className="lp">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,500;12..96,600;12..96,700;12..96,800&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        .lp {
          --bg: #ffffff; --bg-2: #f8fafc; --bg-3: #f1f5f9;
          --ink: #0f172a; --ink-2: #1e293b;
          --muted: #64748b; --muted-2: #94a3b8;
          --border: #e2e8f0;
          --blue: #2563eb; --blue-2: #1d4ed8;
          --blue-light: rgba(37,99,235,0.08); --blue-glow: rgba(37,99,235,0.2);
          --green: #10b981;
          --font: 'Plus Jakarta Sans', sans-serif;
          --font-display: 'Bricolage Grotesque', sans-serif;
          background: var(--bg); color: var(--ink); font-family: var(--font);
          -webkit-font-smoothing: antialiased; overflow-x: hidden; line-height: 1.6;
        }

        /* NAV */
        .nav { position: fixed; top: 0; left: 0; right: 0; z-index: 100; height: 64px; display: flex; align-items: center; padding: 0 24px; transition: all 0.3s ease; border-bottom: 1px solid transparent; }
        .nav.scrolled { background: rgba(255,255,255,0.95); backdrop-filter: blur(20px); border-bottom-color: var(--border); box-shadow: 0 1px 16px rgba(15,23,42,0.06); }
        .nav-inner { max-width: 1160px; width: 100%; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; }
        .nav-logo { display: flex; align-items: center; gap: 10px; text-decoration: none; }
        .nav-logo-text { font-family: var(--font-display); font-size: 17px; font-weight: 700; color: var(--ink); letter-spacing: -0.03em; }
        .nav-links { display: flex; align-items: center; gap: 28px; }
        .nav-link { font-size: 14px; font-weight: 500; color: var(--muted); text-decoration: none; transition: color 0.2s; }
        .nav-link:hover, .nav-link.active { color: var(--ink); }
        .nav-link.active { color: var(--blue); }
        .nav-actions { display: flex; align-items: center; gap: 10px; }
        .btn-ghost { font-size: 13.5px; font-weight: 500; color: var(--ink); background: none; border: none; cursor: pointer; padding: 8px 16px; border-radius: 8px; font-family: var(--font); text-decoration: none; transition: background 0.15s; }
        .btn-ghost:hover { background: var(--bg-3); }
        .btn-nav-primary { font-size: 13.5px; font-weight: 600; color: #fff; background: var(--blue); border: none; cursor: pointer; padding: 8px 20px; border-radius: 8px; font-family: var(--font); text-decoration: none; transition: background 0.15s, transform 0.15s; }
        .btn-nav-primary:hover { background: var(--blue-2); transform: translateY(-1px); }
        .nav-user { display: flex; align-items: center; gap: 8px; background: var(--bg-3); border-radius: 100px; padding: 5px 14px 5px 5px; text-decoration: none; }
        .nav-user-av { width: 28px; height: 28px; border-radius: 50%; background: var(--blue); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; color: #fff; }
        .nav-user-name { font-size: 13px; font-weight: 600; color: var(--ink); }
        .hamburger { display: none; background: none; border: none; cursor: pointer; color: var(--ink); padding: 6px; }
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
        .btn-full { width: 100%; padding: 13px; border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer; font-family: var(--font); text-align: center; text-decoration: none; display: block; }
        .btn-full-primary { background: var(--blue); color: #fff; border: none; }
        .btn-full-secondary { background: var(--bg-3); color: var(--ink); border: none; }

        /* HERO */
        .hero { padding: 140px 24px 80px; display: flex; flex-direction: column; align-items: center; text-align: center; position: relative; overflow: hidden; background: linear-gradient(180deg, #f0f6ff 0%, #ffffff 60%); }
        .hero-pattern { position: absolute; inset: 0; pointer-events: none; background-image: radial-gradient(circle, #d1defe 1px, transparent 1px); background-size: 32px 32px; mask-image: radial-gradient(ellipse 80% 60% at 50% 0%, black 0%, transparent 100%); opacity: 0.5; }
        .hero-badge { position: relative; z-index: 1; display: inline-flex; align-items: center; gap: 8px; background: #fff; border: 1px solid var(--border); border-radius: 100px; padding: 6px 16px 6px 8px; font-size: 12.5px; font-weight: 600; color: var(--muted); margin-bottom: 24px; box-shadow: 0 1px 8px rgba(15,23,42,0.06); }
        .hero-badge-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--green); box-shadow: 0 0 0 3px rgba(16,185,129,0.2); }
        .hero-title { position: relative; z-index: 1; font-family: var(--font-display); font-size: clamp(34px,6vw,66px); font-weight: 800; line-height: 1.05; letter-spacing: -0.04em; color: var(--ink); max-width: 800px; margin-bottom: 20px; }
        .hero-title .blue { color: var(--blue); }
        .hero-sub { position: relative; z-index: 1; font-size: clamp(15px,2vw,18px); color: var(--muted); line-height: 1.7; max-width: 540px; margin-bottom: 36px; }
        .hero-ctas { position: relative; z-index: 1; display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; margin-bottom: 0; }
        .btn-hero-primary { display: inline-flex; align-items: center; gap: 8px; background: var(--blue); color: #fff; border: none; border-radius: 10px; padding: 14px 28px; font-size: 15px; font-weight: 600; font-family: var(--font); cursor: pointer; text-decoration: none; transition: all 0.2s; box-shadow: 0 4px 16px var(--blue-glow); }
        .btn-hero-primary:hover { background: var(--blue-2); transform: translateY(-2px); }
        .btn-hero-secondary { display: inline-flex; align-items: center; gap: 8px; background: #fff; color: var(--ink); border: 1.5px solid var(--border); border-radius: 10px; padding: 14px 28px; font-size: 15px; font-weight: 600; font-family: var(--font); cursor: pointer; text-decoration: none; transition: all 0.2s; }
        .btn-hero-secondary:hover { border-color: var(--muted-2); transform: translateY(-2px); }

        /* LOGO STRIP */
        .logo-strip { border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); padding: 24px; background: var(--bg-2); }
        .logo-strip-inner { max-width: 960px; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 20px; }
        .logo-strip-label { font-size: 11.5px; font-weight: 600; color: var(--muted-2); text-transform: uppercase; letter-spacing: 0.1em; white-space: nowrap; }
        .logo-strip-logos { display: flex; align-items: center; gap: 32px; flex-wrap: wrap; }
        .logo-name { font-family: var(--font-display); font-size: 14px; font-weight: 600; color: var(--muted-2); transition: color 0.2s; cursor: default; }
        .logo-name:hover { color: var(--ink-2); }

        /* METRICS */
        .metrics { padding: 90px 24px; background: var(--ink); }
        .metrics-inner { max-width: 960px; margin: 0 auto; }
        .metrics-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 1px; background: rgba(255,255,255,0.08); border-radius: 14px; overflow: hidden; border: 1px solid rgba(255,255,255,0.08); }
        .metric-card { background: rgba(255,255,255,0.04); padding: 40px 28px; }
        .metric-num { font-family: var(--font-display); font-size: clamp(40px,5vw,56px); font-weight: 800; color: var(--blue); letter-spacing: -0.04em; line-height: 1; margin-bottom: 10px; }
        .metric-label { font-size: 13px; color: rgba(255,255,255,0.45); line-height: 1.5; }

        /* FEATURED TESTIMONIAL */
        .featured { padding: 100px 24px 0; background: var(--bg); }
        .featured-inner { max-width: 1100px; margin: 0 auto; }
        .featured-card { background: var(--ink); border-radius: 24px; padding: 60px; position: relative; overflow: hidden; }
        .featured-blob { position: absolute; top: -60px; right: -60px; width: 300px; height: 300px; border-radius: 50%; background: radial-gradient(circle, rgba(37,99,235,0.2) 0%, transparent 70%); pointer-events: none; }
        .featured-blob-2 { position: absolute; bottom: -80px; left: 40px; width: 200px; height: 200px; border-radius: 50%; background: radial-gradient(circle, rgba(16,185,129,0.1) 0%, transparent 70%); pointer-events: none; }
        .featured-quote-mark { font-family: var(--font-display); font-size: 120px; line-height: 0.8; color: rgba(37,99,235,0.15); position: absolute; top: 40px; left: 52px; pointer-events: none; user-select: none; }
        .featured-content { position: relative; z-index: 1; }
        .featured-metric { display: inline-block; background: rgba(37,99,235,0.2); color: #93c5fd; border-radius: 6px; padding: 5px 14px; font-size: 12px; font-weight: 700; letter-spacing: 0.06em; margin-bottom: 28px; }
        .featured-stars { display: flex; gap: 3px; margin-bottom: 20px; }
        .featured-text { font-size: clamp(17px,2vw,22px); color: rgba(255,255,255,0.85); line-height: 1.65; font-weight: 400; margin-bottom: 36px; max-width: 800px; font-style: italic; }
        .featured-author { display: flex; align-items: center; gap: 16px; }
        .featured-av { width: 52px; height: 52px; border-radius: 50%; background: linear-gradient(135deg, var(--blue), #10b981); display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 700; color: #fff; flex-shrink: 0; }
        .featured-name { font-size: 15px; font-weight: 700; color: #fff; }
        .featured-role { font-size: 13px; color: rgba(255,255,255,0.45); margin-top: 2px; }
        .featured-tags { display: flex; gap: 8px; margi