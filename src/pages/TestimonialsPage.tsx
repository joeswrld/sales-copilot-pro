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
      transform: inView ? "translateY(0)" : "translateY(28px)",
      transition: `opacity 0.7s cubic-bezier(0.22,1,0.36,1) ${delay}ms, transform 0.7s cubic-bezier(0.22,1,0.36,1) ${delay}ms`,
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

// ─── Data ─────────────────────────────────────────────────────────────────────

const FEATURED = {
  quote: "Before Fixsense, every deal post-mortem was a guessing game. We'd speculate about why we lost. Now we have the data — exactly where conversations stalled, which objections went unaddressed, which reps need coaching on specific moments. Our close rate climbed 30% in the first quarter and it's stayed there.",
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
    quote: "The objection detection alone changed how we train reps. We identify exactly which objections each rep struggles with and build targeted coaching around that. 3× faster ramp time for new hires.",
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
    quote: "Our team is fully remote across 4 time zones. Managers can't sit on every call. Fixsense means nothing slips through the cracks — every call is analyzed, every action item logged, every rep gets feedback.",
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
    quote: "We tried two other conversation intelligence tools. Both felt built for companies 10× our size. Fixsense actually works for a scrappy 10-person team without a dedicated RevOps person.",
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
    quote: "The sentiment analysis catches things you'd never notice manually. We found deals where prospects went quiet after the pricing slide had a 71% churn rate. We redesigned the entire pricing conversation based on that one insight.",
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

const CATEGORIES = [
  { id: "all", label: "All stories" },
  { id: "revenue", label: "Revenue impact" },
  { id: "coaching", label: "Coaching" },
  { id: "management", label: "Management" },
  { id: "productivity", label: "Productivity" },
];

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
    { label: "Features", href: "/#features" },
    { label: "How It Works", href: "/#how" },
    { label: "Pricing", href: "/pricing" },
    { label: "Testimonials", href: "/testimonials" },
  ];

  const filtered = activeCategory === "all"
    ? TESTIMONIALS
    : TESTIMONIALS.filter(t => t.category === activeCategory);

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500;600;700&family=Syne+Mono&display=swap');
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    .tp {
      --bg: #050810; --bg2: #0a0d18; --bg3: #0f1220;
      --card: rgba(255,255,255,0.03); --card-border: rgba(255,255,255,0.07); --card-hover: rgba(255,255,255,0.06);
      --ink: #f0f2f8; --ink2: rgba(240,242,248,0.65); --ink3: rgba(240,242,248,0.38); --ink4: rgba(240,242,248,0.18);
      --cyan: #0ef5d4; --cyan2: rgba(14,245,212,0.15); --cyan3: rgba(14,245,212,0.07);
      --purple: #8b5cf6; --amber: #f59e0b; --green: #10b981; --blue: #3b82f6;
      --font: 'DM Sans', system-ui, sans-serif; --fd: 'Syne', system-ui, sans-serif; --fm: 'Syne Mono', monospace;
      background: var(--bg); color: var(--ink); font-family: var(--font);
      -webkit-font-smoothing: antialiased; overflow-x: hidden; line-height: 1.6; min-height: 100vh;
    }

    /* NAV */
    .nav { position: fixed; top: 0; left: 0; right: 0; z-index: 100; height: 60px; display: flex; align-items: center; padding: 0 24px; transition: all 0.3s; }
    .nav.sc { background: rgba(5,8,16,0.95); backdrop-filter: blur(20px); border-bottom: 1px solid var(--card-border); }
    .nav-i { max-width: 1140px; width: 100%; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; }
    .nav-logo { display: flex; align-items: center; gap: 9px; text-decoration: none; }
    .nav-name { font-family: var(--fd); font-size: 16px; font-weight: 700; color: var(--ink); letter-spacing: -0.02em; }
    .nav-links { display: flex; align-items: center; gap: 28px; }
    .nav-link { font-size: 13.5px; font-weight: 500; color: var(--ink3); text-decoration: none; transition: color 0.2s; }
    .nav-link:hover { color: var(--ink); }
    .nav-link.act { color: var(--cyan); }
    .nav-acts { display: flex; align-items: center; gap: 8px; }
    .nav-ghost { font-size: 13px; font-weight: 500; color: var(--ink3); background: none; border: none; padding: 8px 14px; border-radius: 8px; font-family: var(--font); cursor: pointer; text-decoration: none; transition: color 0.15s; }
    .nav-ghost:hover { color: var(--ink); }
    .nav-cta { font-size: 13px; font-weight: 600; color: var(--bg); background: var(--cyan); border: none; padding: 8px 20px; border-radius: 8px; font-family: var(--font); cursor: pointer; text-decoration: none; transition: all 0.15s; white-space: nowrap; }
    .nav-cta:hover { opacity: 0.88; transform: translateY(-1px); }
    .burger { display: none; background: none; border: 1px solid var(--card-border); border-radius: 7px; width: 36px; height: 36px; cursor: pointer; color: var(--ink3); align-items: center; justify-content: center; }

    .drw-ov { display: none; position: fixed; inset: 0; z-index: 200; background: rgba(0,0,0,0.7); backdrop-filter: blur(4px); }
    .drw-ov.on { display: block; }
    .drw { position: fixed; top: 0; right: 0; bottom: 0; width: min(300px,88vw); z-index: 210; background: var(--bg2); border-left: 1px solid var(--card-border); display: flex; flex-direction: column; transform: translateX(100%); transition: transform 0.26s cubic-bezier(0.4,0,0.2,1); }
    .drw.on { transform: translateX(0); }
    .drw-hdr { display: flex; align-items: center; justify-content: space-between; padding: 18px 20px; border-bottom: 1px solid var(--card-border); }
    .drw-close { background: var(--card); border: 1px solid var(--card-border); border-radius: 7px; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; cursor: pointer; color: var(--ink3); }
    .drw-nav { padding: 12px 14px; flex: 1; }
    .drw-link { display: block; padding: 13px 10px; font-size: 15px; font-weight: 500; color: var(--ink2); text-decoration: none; border-radius: 8px; transition: background 0.15s; }
    .drw-link:hover { background: var(--card); }
    .drw-foot { padding: 14px 20px; border-top: 1px solid var(--card-border); display: flex; flex-direction: column; gap: 8px; }
    .btn-fw { display: block; width: 100%; padding: 13px; border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer; font-family: var(--font); text-align: center; text-decoration: none; border: none; }
    .btn-fw-p { background: var(--cyan); color: var(--bg); }
    .btn-fw-s { background: var(--card); color: var(--ink2); border: 1px solid var(--card-border); }

    /* HERO */
    .hero { padding: 130px 24px 80px; display: flex; flex-direction: column; align-items: center; text-align: center; position: relative; overflow: hidden; }
    .hero-orb1 { position: absolute; top: -80px; left: 50%; transform: translateX(-50%); width: 700px; height: 500px; background: radial-gradient(ellipse, rgba(14,245,212,0.06) 0%, transparent 65%); pointer-events: none; }
    .hero-orb2 { position: absolute; top: 200px; right: -100px; width: 400px; height: 400px; background: radial-gradient(ellipse, rgba(139,92,246,0.04) 0%, transparent 65%); pointer-events: none; }
    .hero-pill { position: relative; z-index: 1; display: inline-flex; align-items: center; gap: 8px; background: rgba(14,245,212,0.08); border: 1px solid rgba(14,245,212,0.2); border-radius: 100px; padding: 6px 16px 6px 6px; font-size: 12px; font-weight: 600; color: var(--cyan); margin-bottom: 28px; }
    .hero-pill-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--cyan); box-shadow: 0 0 8px var(--cyan); animation: pulse 2.2s ease-in-out infinite; }
    @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.5;transform:scale(0.85)} }
    .hero-h { position: relative; z-index: 1; font-family: var(--fd); font-size: clamp(36px,6.5vw,70px); font-weight: 800; line-height: 1.04; letter-spacing: -0.05em; color: var(--ink); max-width: 820px; margin-bottom: 22px; }
    .hero-h .c { color: var(--cyan); }
    .hero-h .m { color: var(--ink3); font-style: italic; }
    .hero-sub { position: relative; z-index: 1; font-size: clamp(15px,2vw,18px); color: var(--ink2); line-height: 1.72; max-width: 540px; margin-bottom: 38px; }
    .hero-ctas { position: relative; z-index: 1; display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
    .btn-main { display: inline-flex; align-items: center; gap: 8px; background: var(--cyan); color: var(--bg); border: none; border-radius: 10px; padding: 14px 28px; font-size: 15px; font-weight: 700; font-family: var(--font); cursor: pointer; text-decoration: none; transition: all 0.2s; }
    .btn-main:hover { opacity: 0.88; transform: translateY(-2px); box-shadow: 0 10px 28px rgba(14,245,212,0.22); }
    .btn-sec { display: inline-flex; align-items: center; gap: 8px; background: transparent; color: var(--ink2); border: 1px solid var(--card-border); border-radius: 10px; padding: 14px 26px; font-size: 15px; font-weight: 500; font-family: var(--font); cursor: pointer; text-decoration: none; transition: all 0.2s; }
    .btn-sec:hover { border-color: rgba(255,255,255,0.2); color: var(--ink); }

    /* LOGO STRIP */
    .logo-strip { border-top: 1px solid var(--card-border); border-bottom: 1px solid var(--card-border); padding: 20px 24px; background: var(--bg2); }
    .logo-strip-i { max-width: 1100px; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px; }
    .logo-lbl { font-size: 11px; font-weight: 600; color: var(--ink4); text-transform: uppercase; letter-spacing: .12em; }
    .logo-names { display: flex; align-items: center; gap: 28px; flex-wrap: wrap; }
    .logo-name { font-family: var(--fd); font-size: 13.5px; font-weight: 600; color: var(--ink4); }

    /* METRICS */
    .metrics { padding: 90px 24px; background: var(--bg); }
    .metrics-i { max-width: 960px; margin: 0 auto; }
    .metrics-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 1px; background: var(--card-border); border-radius: 14px; overflow: hidden; border: 1px solid var(--card-border); }
    .metric-card { background: var(--bg2); padding: 38px 26px; }
    .metric-num { font-family: var(--fd); font-size: clamp(38px,5vw,54px); font-weight: 800; color: var(--cyan); letter-spacing: -0.04em; line-height: 1; margin-bottom: 8px; }
    .metric-lbl { font-size: 13px; color: var(--ink3); line-height: 1.5; }

    /* FEATURED */
    .featured { padding: 80px 24px 0; background: var(--bg); }
    .featured-i { max-width: 1100px; margin: 0 auto; }
    .featured-card {
      background: var(--bg2);
      border: 1px solid var(--card-border);
      border-radius: 20px;
      padding: 60px;
      position: relative; overflow: hidden;
    }
    .featured-card::before {
      content: '';
      position: absolute; top: 0; left: 0; right: 0; height: 2px;
      background: linear-gradient(90deg, var(--cyan), rgba(14,245,212,0.4));
    }
    .featured-orb { position: absolute; top: -60px; right: -60px; width: 280px; height: 280px; border-radius: 50%; background: radial-gradient(circle, rgba(14,245,212,0.07) 0%, transparent 70%); pointer-events: none; }
    .featured-orb2 { position: absolute; bottom: -60px; left: 40px; width: 200px; height: 200px; border-radius: 50%; background: radial-gradient(circle, rgba(139,92,246,0.06) 0%, transparent 70%); pointer-events: none; }
    .featured-quote-mark { font-family: var(--fd); font-size: 120px; line-height: 0.8; color: rgba(14,245,212,0.08); position: absolute; top: 40px; left: 52px; pointer-events: none; user-select: none; }
    .featured-content { position: relative; z-index: 1; }
    .featured-metric { display: inline-flex; align-items: center; gap: 6px; background: var(--cyan3); color: var(--cyan); border: 1px solid rgba(14,245,212,0.2); border-radius: 6px; padding: 4px 12px; font-size: 12px; font-weight: 700; letter-spacing: .06em; font-family: var(--fm); margin-bottom: 22px; }
    .featured-stars { display: flex; gap: 3px; margin-bottom: 20px; }
    .featured-text { font-size: clamp(16px,2.2vw,21px); color: var(--ink2); line-height: 1.68; font-weight: 400; margin-bottom: 36px; max-width: 800px; font-style: italic; }
    .featured-author { display: flex; align-items: center; gap: 16px; }
    .featured-av { width: 52px; height: 52px; border-radius: 50%; background: linear-gradient(135deg, rgba(14,245,212,0.3), rgba(59,130,246,0.3)); border: 1px solid rgba(14,245,212,0.3); display: flex; align-items: center; justify-content: center; font-family: var(--fd); font-size: 16px; font-weight: 700; color: var(--cyan); flex-shrink: 0; }
    .featured-name { font-family: var(--fd); font-size: 15px; font-weight: 700; color: var(--ink); }
    .featured-role { font-size: 13px; color: var(--ink3); margin-top: 2px; }
    .featured-tags { display: flex; gap: 8px; margin-top: 10px; }
    .featured-tag { background: var(--card); border: 1px solid var(--card-border); border-radius: 20px; padding: 3px 12px; font-size: 11px; color: var(--ink3); font-family: var(--fm); }

    /* FILTER + GRID */
    .filter-section { padding: 80px 24px 0; background: var(--bg); }
    .filter-i { max-width: 1100px; margin: 0 auto; }
    .sec-kicker { font-family: var(--fm); font-size: 11px; font-weight: 600; color: var(--cyan); text-transform: uppercase; letter-spacing: .14em; margin-bottom: 12px; }
    .sec-title { font-family: var(--fd); font-size: clamp(28px,4.5vw,46px); font-weight: 800; color: var(--ink); letter-spacing: -0.04em; line-height: 1.08; margin-bottom: 14px; }
    .sec-sub { font-size: 16px; color: var(--ink2); line-height: 1.72; max-width: 520px; }
    .filter-bar { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 32px; }
    .filter-btn { background: transparent; border: 1px solid var(--card-border); border-radius: 100px; padding: 8px 20px; font-size: 13px; font-weight: 600; color: var(--ink3); cursor: pointer; font-family: var(--font); transition: all 0.18s; }
    .filter-btn:hover { border-color: rgba(14,245,212,0.3); color: var(--ink); }
    .filter-btn.act { background: var(--cyan); border-color: var(--cyan); color: var(--bg); }

    .testi-section { padding: 48px 24px 100px; background: var(--bg); }
    .testi-i { max-width: 1100px; margin: 0 auto; }
    .testi-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 16px; }

    .testi-card {
      background: var(--card);
      border: 1px solid var(--card-border);
      border-radius: 16px; padding: 28px;
      display: flex; flex-direction: column;
      transition: border-color 0.2s, box-shadow 0.2s, transform 0.2s;
    }
    .testi-card:hover {
      border-color: rgba(14,245,212,0.18);
      box-shadow: 0 8px 32px rgba(14,245,212,0.06);
      transform: translateY(-2px);
    }
    .testi-top { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 16px; }
    .testi-metric { display: inline-flex; align-items: center; background: var(--cyan3); color: var(--cyan); border: 1px solid rgba(14,245,212,0.2); border-radius: 5px; padding: 3px 10px; font-size: 11px; font-weight: 700; font-family: var(--fm); }
    .testi-stars { display: flex; gap: 2px; }
    .testi-quote { font-size: 14px; color: var(--ink2); line-height: 1.72; flex: 1; margin-bottom: 22px; }
    .testi-author { display: flex; align-items: center; gap: 12px; border-top: 1px solid var(--card-border); padding-top: 18px; }
    .testi-av { width: 40px; height: 40px; border-radius: 10px; background: linear-gradient(135deg, rgba(14,245,212,0.15), rgba(139,92,246,0.15)); border: 1px solid rgba(14,245,212,0.2); display: flex; align-items: center; justify-content: center; font-family: var(--fd); font-size: 13px; font-weight: 700; color: var(--cyan); flex-shrink: 0; }
    .testi-name { font-family: var(--fd); font-size: 13px; font-weight: 700; color: var(--ink); }
    .testi-role { font-size: 12px; color: var(--ink3); margin-top: 1px; }
    .testi-meta { display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap; }
    .testi-tag { background: var(--bg3); border: 1px solid var(--card-border); border-radius: 4px; padding: 2px 8px; font-size: 10px; color: var(--ink3); font-family: var(--fm); }

    /* TRUST STRIP */
    .trust { padding: 80px 24px; background: var(--bg2); border-top: 1px solid var(--card-border); border-bottom: 1px solid var(--card-border); }
    .trust-i { max-width: 960px; margin: 0 auto; text-align: center; }
    .trust-title { font-family: var(--fd); font-size: 24px; font-weight: 800; color: var(--ink); letter-spacing: -0.03em; margin-bottom: 8px; }
    .trust-sub { font-size: 15px; color: var(--ink3); margin-bottom: 36px; }
    .trust-badges { display: flex; justify-content: center; flex-wrap: wrap; gap: 12px; }
    .trust-badge { display: flex; align-items: center; gap: 8px; background: var(--card); border: 1px solid var(--card-border); border-radius: 10px; padding: 12px 20px; font-size: 13px; font-weight: 500; color: var(--ink2); transition: border-color 0.2s; }
    .trust-badge:hover { border-color: rgba(14,245,212,0.2); }
    .trust-badge-icon { font-size: 16px; }

    /* FINAL CTA */
    .final { padding: 120px 24px; background: var(--bg); text-align: center; position: relative; overflow: hidden; }
    .final-orb { position: absolute; inset: 0; pointer-events: none; background: radial-gradient(ellipse 70% 70% at 50% 50%, rgba(14,245,212,0.05) 0%, transparent 65%); }
    .final-i { position: relative; z-index: 1; max-width: 580px; margin: 0 auto; }
    .final-h { font-family: var(--fd); font-size: clamp(34px,6vw,58px); font-weight: 800; color: var(--ink); letter-spacing: -0.05em; line-height: 1.06; margin-bottom: 16px; }
    .final-h .c { color: var(--cyan); }
    .final-p { font-size: 16px; color: var(--ink2); line-height: 1.72; margin-bottom: 36px; }
    .final-btns { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
    .final-note { margin-top: 14px; font-size: 12px; color: var(--ink4); }

    /* FOOTER */
    .footer { background: var(--bg2); padding: 56px 24px 28px; border-top: 1px solid var(--card-border); }
    .footer-i { max-width: 1100px; margin: 0 auto; }
    .footer-top { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap: 48px; margin-bottom: 44px; padding-bottom: 40px; border-bottom: 1px solid var(--card-border); }
    .footer-brand-logo { display: flex; align-items: center; gap: 9px; margin-bottom: 12px; }
    .footer-brand-name { font-family: var(--fd); font-size: 15px; font-weight: 700; color: var(--ink); letter-spacing: -0.02em; }
    .footer-brand-desc { font-size: 13px; color: var(--ink3); line-height: 1.65; max-width: 230px; }
    .footer-col-title { font-size: 10.5px; font-weight: 700; color: var(--ink4); text-transform: uppercase; letter-spacing: .1em; margin-bottom: 14px; }
    .footer-link { display: block; font-size: 13px; color: var(--ink3); text-decoration: none; margin-bottom: 9px; transition: color 0.2s; }
    .footer-link:hover { color: var(--ink); }
    .footer-bottom { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
    .footer-legal { font-size: 12px; color: var(--ink4); }
    .footer-legal-links { display: flex; gap: 18px; }
    .footer-ll { font-size: 12px; color: var(--ink4); text-decoration: none; transition: color 0.2s; }
    .footer-ll:hover { color: var(--ink3); }

    @media(max-width:1024px) { .footer-top { grid-template-columns: 1fr 1fr; } }
    @media(max-width:900px) {
      .testi-grid { grid-template-columns: repeat(2,1fr); }
      .metrics-grid { grid-template-columns: repeat(2,1fr); }
    }
    @media(max-width:768px) {
      .burger { display: flex; }
      .nav-links, .nav-acts { display: none; }
      .featured-card { padding: 36px 28px; }
      .featured-quote-mark { display: none; }
      .footer-top { grid-template-columns: 1fr 1fr; }
      .footer-bottom { flex-direction: column; align-items: flex-start; }
    }
    @media(max-width:560px) {
      .testi-grid { grid-template-columns: 1fr; }
      .hero-ctas { flex-direction: column; align-items: center; }
      .btn-main, .btn-sec { width: 100%; max-width: 320px; justify-content: center; }
      .final-btns { flex-direction: column; align-items: center; }
      .footer-top { grid-template-columns: 1fr; }
    }
  `;

  const StarIcon = () => (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="#0ef5d4" opacity="0.7">
      <path d="M6.5 1l1.4 2.83 3.12.455-2.26 2.2.533 3.105L6.5 7.895l-2.793 1.695.533-3.105L2.98 4.285l3.12-.455z"/>
    </svg>
  );

  return (
    <div className="tp">
      <style>{css}</style>

      {/* NAV */}
      <nav className={`nav ${scrolled ? "sc" : ""}`}>
        <div className="nav-i">
          <Link to="/" className="nav-logo">
            <Logo size={26} />
            <span className="nav-name">Fixsense</span>
          </Link>
          <div className="nav-links">
            {NAV.map(l => (
              <a key={l.label} href={l.href} className={`nav-link ${l.href === "/testimonials" ? "act" : ""}`}>{l.label}</a>
            ))}
          </div>
          <div className="nav-acts">
            {user ? (
              <>
                <Link to="/dashboard/profile" style={{ display:"flex",alignItems:"center",gap:7, background:"rgba(255,255,255,.06)", border:"1px solid rgba(255,255,255,.1)", borderRadius:100, padding:"5px 12px 5px 5px", textDecoration:"none" }}>
                  <div style={{ width:26,height:26,borderRadius:"50%",background:"var(--cyan2)",border:"1px solid rgba(14,245,212,.2)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color:"var(--cyan)" }}>{emailInitial}</div>
                  <span style={{ fontSize:12,fontWeight:600,color:"var(--ink2)" }}>{displayName}</span>
                </Link>
                <Link to="/dashboard" className="nav-cta">Dashboard →</Link>
              </>
            ) : (
              <>
                <Link to="/login" className="nav-ghost">Sign in</Link>
                <Link to="/login" className="nav-cta">Start Free →</Link>
              </>
            )}
          </div>
          <button className="burger" onClick={() => setMobileOpen(true)}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
        </div>
      </nav>

      {/* MOBILE DRAWER */}
      <div className={`drw-ov ${mobileOpen ? "on" : ""}`} onClick={() => setMobileOpen(false)} />
      <div className={`drw ${mobileOpen ? "on" : ""}`}>
        <div className="drw-hdr">
          <Link to="/" className="nav-logo" onClick={() => setMobileOpen(false)}>
            <Logo size={24} /><span className="nav-name">Fixsense</span>
          </Link>
          <button className="drw-close" onClick={() => setMobileOpen(false)}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M1 1l11 11M12 1L1 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
        </div>
        <nav className="drw-nav">
          {NAV.map(l => (
            <a key={l.label} href={l.href} className="drw-link" onClick={() => setMobileOpen(false)}>{l.label}</a>
          ))}
        </nav>
        <div className="drw-foot">
          {user ? (
            <Link to="/dashboard" className="btn-fw btn-fw-p" onClick={() => setMobileOpen(false)}>Go to Dashboard</Link>
          ) : (
            <>
              <Link to="/login" className="btn-fw btn-fw-p" onClick={() => setMobileOpen(false)}>Start Free Trial</Link>
              <Link to="/login" className="btn-fw btn-fw-s" onClick={() => setMobileOpen(false)}>Sign in</Link>
            </>
          )}
        </div>
      </div>

      {/* HERO */}
      <section className="hero">
        <div className="hero-orb1" />
        <div className="hero-orb2" />
        <FadeIn delay={60}>
          <div className="hero-pill">
            <div className="hero-pill-dot" />
            Real results from real sales teams
          </div>
        </FadeIn>
        <FadeIn delay={100}>
          <h1 className="hero-h">
            Trusted by teams<br />
            <span className="c">closing more deals</span>
          </h1>
        </FadeIn>
        <FadeIn delay={150}>
          <p className="hero-sub">
            From scrappy 6-person startups to enterprise revenue orgs — see how Fixsense is changing how teams sell, coach, and grow.
          </p>
        </FadeIn>
        <FadeIn delay={190}>
          <div className="hero-ctas">
            <Link to={user ? "/dashboard" : "/login"} className="btn-main">
              Start Free Trial
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7h10M7 2l5 5-5 5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </Link>
            <Link to="/pricing" className="btn-sec">View Pricing</Link>
          </div>
        </FadeIn>
      </section>

      {/* LOGO STRIP */}
      <div className="logo-strip">
        <div className="logo-strip-i">
          <span className="logo-lbl">Integrates with</span>
          <div className="logo-names">
            {["Zoom", "Google Meet", "Salesforce", "HubSpot", "Slack", "100ms"].map(l => (
              <span key={l} className="logo-name">{l}</span>
            ))}
          </div>
        </div>
      </div>

      {/* METRICS */}
      <section className="metrics">
        <div className="metrics-i">
          <FadeIn>
            <div className="metrics-grid">
              {[
                { val: 30, suf: "%", lbl: "Avg. increase in close rate" },
                { val: 10, suf: "k+", lbl: "Sales meetings analyzed" },
                { val: 50, suf: "%", lbl: "Reduction in rep ramp time" },
                { val: 99, suf: "%", lbl: "Transcription accuracy" },
              ].map((m, i) => (
                <div key={i} className="metric-card">
                  <div className="metric-num"><Counter end={m.val} suffix={m.suf} /></div>
                  <div className="metric-lbl">{m.lbl}</div>
                </div>
              ))}
            </div>
          </FadeIn>
        </div>
      </section>

      {/* FEATURED TESTIMONIAL */}
      <section className="featured">
        <div className="featured-i">
          <FadeIn>
            <div style={{ marginBottom: 24 }}>
              <div className="sec-kicker">Featured story</div>
            </div>
            <div className="featured-card">
              <div className="featured-orb" />
              <div className="featured-orb2" />
              <div className="featured-quote-mark">"</div>
              <div className="featured-content">
                <div className="featured-metric">⭐ {FEATURED.metric}</div>
                <div className="featured-stars">
                  {[...Array(5)].map((_, i) => <StarIcon key={i} />)}
                </div>
                <p className="featured-text">"{FEATURED.quote}"</p>
                <div className="featured-author">
                  <div className="featured-av">{FEATURED.initials}</div>
                  <div>
                    <div className="featured-name">{FEATURED.name}</div>
                    <div className="featured-role">{FEATURED.role}, {FEATURED.company}</div>
                    <div className="featured-tags">
                      <span className="featured-tag">{FEATURED.industry}</span>
                      <span className="featured-tag">{FEATURED.teamSize}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* FILTER + GRID */}
      <section className="filter-section">
        <div className="filter-i">
          <FadeIn>
            <div className="sec-kicker">All Customer Stories</div>
            <h2 className="sec-title">Every team, every use case</h2>
            <p className="sec-sub">Filter by what matters most to you.</p>
            <div className="filter-bar">
              {CATEGORIES.map(cat => (
                <button
                  key={cat.id}
                  className={`filter-btn ${activeCategory === cat.id ? "act" : ""}`}
                  onClick={() => setActiveCategory(cat.id)}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </FadeIn>
        </div>
      </section>

      <section className="testi-section">
        <div className="testi-i">
          <div className="testi-grid">
            {filtered.map((t, i) => (
              <FadeIn key={`${t.name}-${activeCategory}`} delay={i * 55}>
                <div className="testi-card">
                  <div className="testi-top">
                    <div className="testi-metric">{t.metric}</div>
                    <div className="testi-stars">
                      {[...Array(5)].map((_, si) => <StarIcon key={si} />)}
                    </div>
                  </div>
                  <p className="testi-quote">"{t.quote}"</p>
                  <div className="testi-author">
                    <div className="testi-av">{t.initials}</div>
                    <div>
                      <div className="testi-name">{t.name}</div>
                      <div className="testi-role">{t.role}, {t.company}</div>
                      <div className="testi-meta">
                        <span className="testi-tag">{t.industry}</span>
                        <span className="testi-tag">{t.teamSize}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* TRUST STRIP */}
      <section className="trust">
        <div className="trust-i">
          <FadeIn>
            <h3 className="trust-title">Built for security-conscious revenue teams</h3>
            <p className="trust-sub">Enterprise-grade compliance, out of the box.</p>
            <div className="trust-badges">
              {[
                { icon: "🔒", label: "SOC 2 Type II Certified" },
                { icon: "🔐", label: "End-to-end Encryption" },
                { icon: "🌍", label: "GDPR & NDPR Compliant" },
                { icon: "⚡", label: "99.9% Uptime SLA" },
                { icon: "🚫", label: "Zero data selling" },
              ].map((b, i) => (
                <div key={i} className="trust-badge">
                  <span className="trust-badge-icon">{b.icon}</span>
                  {b.label}
                </div>
              ))}
            </div>
          </FadeIn>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="final">
        <div className="final-orb" />
        <div className="final-i">
          <FadeIn>
            <h2 className="final-h">Your team's story<br /><span className="c">starts here.</span></h2>
            <p className="final-p">Join hundreds of sales teams who stopped guessing and started winning with Fixsense.</p>
            <div className="final-btns">
              <Link to={user ? "/dashboard" : "/login"} className="btn-main">
                Start Free Trial
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7h10M7 2l5 5-5 5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </Link>
              <Link to="/pricing" className="btn-sec">View pricing →</Link>
            </div>
            <div className="final-note">Free plan · 30 min/month · No credit card required</div>
          </FadeIn>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="footer">
        <div className="footer-i">
          <div className="footer-top">
            <div>
              <div className="footer-brand-logo"><Logo size={22} /><span className="footer-brand-name">Fixsense</span></div>
              <p className="footer-brand-desc">AI-powered sales call intelligence for modern revenue teams.</p>
            </div>
            <div>
              <div className="footer-col-title">Product</div>
              {[["/#features","Features"],["/#pricing","Pricing"],["/integrations","Integrations"],["/changelog","Changelog"]].map(([h,l])=>(
                <a key={h} href={h} className="footer-link">{l}</a>
              ))}
            </div>
            <div>
              <div className="footer-col-title">Company</div>
              {[["/about","About"],["/blog","Blog"],["/careers","Careers"],["/testimonials","Stories"]].map(([h,l])=>(
                <Link key={h} to={h} className="footer-link">{l}</Link>
              ))}
            </div>
            <div>
              <div className="footer-col-title">Legal</div>
              {[["/privacy","Privacy Policy"],["/terms","Terms of Service"],["/security","Security"],["/contact","Contact"]].map(([h,l])=>(
                <Link key={h} to={h} className="footer-link">{l}</Link>
              ))}
            </div>
          </div>
          <div className="footer-bottom">
            <span className="footer-legal">© {new Date().getFullYear()} Fixsense, Inc. All rights reserved.</span>
            <div className="footer-legal-links">
              <Link to="/privacy" className="footer-ll">Privacy</Link>
              <Link to="/terms" className="footer-ll">Terms</Link>
              <Link to="/security" className="footer-ll">Security</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}