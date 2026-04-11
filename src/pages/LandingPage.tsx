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
    <img src="/fixsense_icon_logo (2).png" alt="Fixsense" width={size} height={size}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.24), objectFit: "cover", display: "block", flexShrink: 0 }} />
  );
}

export default function LandingPage() {
  const { user } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [activeFaq, setActiveFaq] = useState<number | null>(null);

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
    { label: "Features", href: "#features" },
    { label: "How It Works", href: "#how" },
    { label: "Pricing", href: "/pricing" },
    { label: "Testimonials", href: "/testimonials" },
  ];

  const FAQS = [
    { q: "How does the live call room work?", a: "Fixsense creates a private meeting room powered by 100ms. You get a shareable link — send it to your prospect, no account needed. The moment you join, AI transcribes both sides in real time." },
    { q: "What does 'minute-based billing' mean?", a: "Each completed call's duration counts against your monthly quota. A 30-minute discovery call uses 30 minutes. No per-seat tricks — pay for what you actually record." },
    { q: "What are Coaching Clips?", a: "Select any lines from a call transcript, add a coaching note and tags, and Fixsense generates a shareable clip page. Share it with your rep or the whole team. No video editing required." },
    { q: "What is the Deal Timeline?", a: "Every call you link to a deal builds a living timeline. The AI compares calls over time to show you what changed — new objections, buying signals, sentiment shifts — and recommends your next best action." },
    { q: "Is my call data secure?", a: "All data is encrypted at rest (AES-256) and in transit (TLS 1.3). We comply with NDPR and GDPR. Your recordings are never used to train AI models." },
    { q: "Can I use it without a team?", a: "Absolutely. Free and Starter plans are built for individual reps. Upgrade to Growth when you're ready to coach teammates and manage deals collaboratively." },
  ];

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500;600&family=Syne+Mono&display=swap');
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    .lp {
      --bg: #050810;
      --bg2: #0a0d18;
      --bg3: #0f1220;
      --card: rgba(255,255,255,0.03);
      --card-border: rgba(255,255,255,0.07);
      --card-hover: rgba(255,255,255,0.06);
      --ink: #f0f2f8;
      --ink2: rgba(240,242,248,0.65);
      --ink3: rgba(240,242,248,0.38);
      --ink4: rgba(240,242,248,0.18);
      --cyan: #0ef5d4;
      --cyan2: rgba(14,245,212,0.15);
      --cyan3: rgba(14,245,212,0.07);
      --purple: #8b5cf6;
      --amber: #f59e0b;
      --green: #10b981;
      --blue: #3b82f6;
      --red: #f43f5e;
      --font: 'DM Sans', system-ui, sans-serif;
      --fd: 'Syne', system-ui, sans-serif;
      --fm: 'Syne Mono', monospace;
      background: var(--bg); color: var(--ink); font-family: var(--font);
      -webkit-font-smoothing: antialiased; overflow-x: hidden; line-height: 1.6;
    }

    /* NAV */
    .nav { position: fixed; top: 0; left: 0; right: 0; z-index: 100; height: 60px; display: flex; align-items: center; padding: 0 24px; transition: all 0.3s; }
    .nav.sc { background: rgba(5,8,16,0.92); backdrop-filter: blur(20px); border-bottom: 1px solid var(--card-border); }
    .nav-i { max-width: 1140px; width: 100%; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; }
    .nav-logo { display: flex; align-items: center; gap: 9px; text-decoration: none; }
    .nav-name { font-family: var(--fd); font-size: 16px; font-weight: 700; color: var(--ink); letter-spacing: -0.02em; }
    .nav-links { display: flex; align-items: center; gap: 28px; }
    .nav-link { font-size: 13.5px; font-weight: 500; color: var(--ink3); text-decoration: none; transition: color 0.2s; }
    .nav-link:hover { color: var(--ink); }
    .nav-acts { display: flex; align-items: center; gap: 8px; }
    .nav-ghost { font-size: 13px; font-weight: 500; color: var(--ink3); background: none; border: none; padding: 8px 14px; border-radius: 8px; font-family: var(--font); cursor: pointer; text-decoration: none; transition: color 0.15s; }
    .nav-ghost:hover { color: var(--ink); }
    .nav-cta { font-size: 13px; font-weight: 600; color: var(--bg); background: var(--cyan); border: none; padding: 8px 20px; border-radius: 8px; font-family: var(--font); cursor: pointer; text-decoration: none; transition: all 0.15s; white-space: nowrap; }
    .nav-cta:hover { opacity: 0.88; transform: translateY(-1px); }
    .burger { display: none; background: none; border: 1px solid var(--card-border); border-radius: 7px; width: 36px; height: 36px; cursor: pointer; color: var(--ink3); align-items: center; justify-content: center; }

    /* DRAWER */
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
    .hero-orb1 { position: absolute; top: -100px; left: 50%; transform: translateX(-50%); width: 700px; height: 700px; background: radial-gradient(ellipse, rgba(14,245,212,0.07) 0%, transparent 65%); pointer-events: none; }
    .hero-orb2 { position: absolute; top: 200px; left: -100px; width: 400px; height: 400px; background: radial-gradient(ellipse, rgba(139,92,246,0.05) 0%, transparent 65%); pointer-events: none; }
    .hero-pill { position: relative; z-index: 1; display: inline-flex; align-items: center; gap: 8px; background: rgba(14,245,212,0.08); border: 1px solid rgba(14,245,212,0.2); border-radius: 100px; padding: 6px 16px 6px 6px; font-size: 12px; font-weight: 600; color: var(--cyan); margin-bottom: 28px; }
    .hero-pill-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--cyan); box-shadow: 0 0 8px var(--cyan); animation: pulse 2.2s ease-in-out infinite; }
    @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.5;transform:scale(0.85)} }
    .hero-h { position: relative; z-index: 1; font-family: var(--fd); font-size: clamp(36px,6.5vw,72px); font-weight: 800; line-height: 1.04; letter-spacing: -0.05em; color: var(--ink); max-width: 820px; margin-bottom: 22px; }
    .hero-h .c { color: var(--cyan); }
    .hero-h .m { color: var(--ink3); }
    .hero-sub { position: relative; z-index: 1; font-size: clamp(15px,2vw,18px); color: var(--ink2); line-height: 1.72; max-width: 560px; margin-bottom: 38px; }
    .hero-ctas { position: relative; z-index: 1; display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; margin-bottom: 48px; }
    .btn-main { display: inline-flex; align-items: center; gap: 8px; background: var(--cyan); color: var(--bg); border: none; border-radius: 10px; padding: 15px 30px; font-size: 15px; font-weight: 700; font-family: var(--font); cursor: pointer; text-decoration: none; transition: all 0.2s; letter-spacing: -0.01em; }
    .btn-main:hover { opacity: 0.88; transform: translateY(-2px); box-shadow: 0 12px 32px rgba(14,245,212,0.25); }
    .btn-sec { display: inline-flex; align-items: center; gap: 8px; background: transparent; color: var(--ink2); border: 1px solid var(--card-border); border-radius: 10px; padding: 15px 28px; font-size: 15px; font-weight: 500; font-family: var(--font); cursor: pointer; text-decoration: none; transition: all 0.2s; }
    .btn-sec:hover { border-color: rgba(255,255,255,0.2); color: var(--ink); }
    .hero-trust { position: relative; z-index: 1; display: flex; align-items: center; gap: 20px; flex-wrap: wrap; justify-content: center; }
    .hero-trust-item { display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--ink3); font-weight: 500; }
    .trust-sep { width: 3px; height: 3px; border-radius: 50%; background: var(--card-border); }

    /* DEMO SCREEN */
    .demo-section { padding: 0 24px 100px; position: relative; }
    .demo-label { text-align: center; font-family: var(--fm); font-size: 11px; color: var(--cyan); text-transform: uppercase; letter-spacing: 0.12em; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; justify-content: center; }
    .demo-label-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--green); animation: pulse 1.8s ease-in-out infinite; }
    .demo-wrap { max-width: 980px; margin: 0 auto; background: var(--bg2); border: 1px solid var(--card-border); border-radius: 16px; overflow: hidden; box-shadow: 0 40px 100px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04); }
    .demo-bar { height: 38px; background: rgba(255,255,255,0.03); border-bottom: 1px solid var(--card-border); display: flex; align-items: center; gap: 7px; padding: 0 14px; }
    .demo-dot { width: 10px; height: 10px; border-radius: 50%; }
    .demo-addr { flex: 1; max-width: 260px; margin: 0 auto; background: rgba(255,255,255,0.04); border-radius: 5px; height: 20px; display: flex; align-items: center; justify-content: center; font-size: 10px; color: var(--ink4); font-family: var(--fm); }
    .demo-inner { display: grid; grid-template-columns: 200px 1fr 260px; height: 460px; }
    .demo-sidebar { border-right: 1px solid var(--card-border); padding: 14px 10px; background: rgba(255,255,255,0.01); }
    .demo-s-logo { display: flex; align-items: center; gap: 7px; margin-bottom: 20px; padding: 0 4px; }
    .demo-s-name { font-family: var(--fd); font-size: 13px; font-weight: 700; color: var(--ink); }
    .demo-nav-item { display: flex; align-items: center; gap: 7px; padding: 7px 9px; border-radius: 7px; font-size: 11.5px; color: var(--ink3); margin-bottom: 2px; }
    .demo-nav-item.active { background: rgba(14,245,212,0.08); color: var(--cyan); }
    .demo-nav-dot { width: 4px; height: 4px; border-radius: 50%; background: currentColor; }
    .demo-main { display: flex; flex-direction: column; overflow: hidden; }
    .demo-topbar { padding: 10px 14px; border-bottom: 1px solid var(--card-border); display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; }
    .demo-title { font-family: var(--fd); font-size: 14px; font-weight: 700; color: var(--ink); }
    .demo-live-badge { display: flex; align-items: center; gap: 5px; background: rgba(244,63,94,0.12); border: 1px solid rgba(244,63,94,0.2); border-radius: 20px; padding: 3px 10px; font-size: 10px; font-weight: 700; color: #f87171; font-family: var(--fm); }
    .demo-live-dot { width: 6px; height: 6px; border-radius: 50%; background: #ef4444; animation: livepulse 1.4s ease-out infinite; }
    @keyframes livepulse { 0%{box-shadow:0 0 0 0 rgba(239,68,68,.6)} 70%{box-shadow:0 0 0 5px rgba(239,68,68,0)} 100%{box-shadow:0 0 0 0 rgba(239,68,68,0)} }
    .demo-stats { display: grid; grid-template-columns: repeat(4,1fr); gap: 7px; padding: 10px 14px; border-bottom: 1px solid var(--card-border); flex-shrink: 0; }
    .demo-stat { background: var(--card); border-radius: 8px; padding: 8px 10px; }
    .demo-stat-lbl { font-size: 9px; color: var(--ink4); text-transform: uppercase; letter-spacing: .06em; margin-bottom: 3px; }
    .demo-stat-val { font-size: 14px; font-weight: 700; color: var(--ink); font-family: var(--fd); }
    .demo-transcript { flex: 1; overflow-y: auto; padding: 10px 14px; display: flex; flex-direction: column; gap: 7px; }
    .demo-transcript::-webkit-scrollbar { width: 2px; }
    .demo-transcript::-webkit-scrollbar-thumb { background: var(--card-border); }
    .demo-line { display: flex; gap: 7px; animation: lineFade 0.4s ease; }
    @keyframes lineFade { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:none} }
    .demo-speaker { font-size: 9px; font-weight: 700; min-width: 32px; margin-top: 1px; }
    .demo-text { font-size: 10.5px; color: var(--ink3); line-height: 1.5; }
    .demo-typing { display: flex; align-items: center; gap: 3px; padding: 4px 0; }
    .demo-t-dot { width: 4px; height: 4px; border-radius: 50%; background: var(--ink4); animation: tdot 1s ease infinite; }
    @keyframes tdot { 0%,80%,100%{opacity:.3;transform:scale(1)} 40%{opacity:1;transform:scale(1.2)} }
    .demo-right { border-left: 1px solid var(--card-border); display: flex; flex-direction: column; overflow: hidden; }
    .demo-r-hdr { padding: 10px 12px; border-bottom: 1px solid var(--card-border); font-family: var(--fd); font-size: 11px; font-weight: 600; color: var(--ink3); text-transform: uppercase; letter-spacing: .08em; display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
    .demo-insights { flex: 1; overflow-y: auto; padding: 8px 10px; display: flex; flex-direction: column; gap: 7px; }
    .demo-insight { border-radius: 8px; padding: 9px 11px; }
    .demo-insight-tag { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; margin-bottom: 3px; }
    .demo-insight-body { font-size: 10.5px; color: var(--ink3); line-height: 1.45; }
    .demo-ratio { padding: 10px; border-top: 1px solid var(--card-border); flex-shrink: 0; }
    .demo-ratio-lbl { font-size: 9px; color: var(--ink4); margin-bottom: 5px; text-transform: uppercase; letter-spacing: .06em; display: flex; justify-content: space-between; }
    .demo-ratio-bar { height: 6px; border-radius: 3px; background: rgba(255,255,255,0.06); overflow: hidden; display: flex; }
    .demo-ratio-rep { height: 100%; background: var(--cyan); border-radius: 3px; }

    /* LOGO STRIP */
    .logo-strip { border-top: 1px solid var(--card-border); border-bottom: 1px solid var(--card-border); padding: 20px 24px; background: var(--bg2); }
    .logo-strip-i { max-width: 1100px; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px; }
    .logo-lbl { font-size: 11px; font-weight: 600; color: var(--ink4); text-transform: uppercase; letter-spacing: .12em; white-space: nowrap; }
    .logo-names { display: flex; align-items: center; gap: 28px; flex-wrap: wrap; }
    .logo-name { font-family: var(--fd); font-size: 13.5px; font-weight: 600; color: var(--ink4); transition: color 0.2s; }
    .logo-name:hover { color: var(--ink3); }

    /* METRICS */
    .metrics { padding: 90px 24px; background: var(--bg); }
    .metrics-i { max-width: 960px; margin: 0 auto; }
    .metrics-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 1px; background: var(--card-border); border-radius: 14px; overflow: hidden; border: 1px solid var(--card-border); }
    .metric-card { background: var(--bg2); padding: 38px 26px; }
    .metric-num { font-family: var(--fd); font-size: clamp(38px,5vw,54px); font-weight: 800; color: var(--cyan); letter-spacing: -0.04em; line-height: 1; margin-bottom: 8px; }
    .metric-lbl { font-size: 13px; color: var(--ink3); line-height: 1.5; }

    /* FEATURES */
    .features { padding: 100px 24px; background: var(--bg); }
    .features-i { max-width: 1120px; margin: 0 auto; }
    .sec-kicker { font-family: var(--fm); font-size: 11px; font-weight: 600; color: var(--cyan); text-transform: uppercase; letter-spacing: .14em; margin-bottom: 14px; }
    .sec-title { font-family: var(--fd); font-size: clamp(28px,4.5vw,46px); font-weight: 800; color: var(--ink); letter-spacing: -0.04em; line-height: 1.08; margin-bottom: 14px; }
    .sec-sub { font-size: 16px; color: var(--ink2); line-height: 1.72; max-width: 540px; }
    .features-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 14px; }
    .feat-card { background: var(--card); border: 1px solid var(--card-border); border-radius: 16px; padding: 28px; transition: border-color 0.2s, background 0.2s, transform 0.2s; }
    .feat-card:hover { border-color: rgba(14,245,212,0.18); background: var(--card-hover); transform: translateY(-2px); }
    .feat-icon { font-size: 26px; margin-bottom: 14px; }
    .feat-title { font-family: var(--fd); font-size: 17px; font-weight: 700; color: var(--ink); letter-spacing: -0.02em; margin-bottom: 8px; }
    .feat-desc { font-size: 13.5px; color: var(--ink2); line-height: 1.65; }
    .feat-tag { display: inline-block; background: var(--cyan2); color: var(--cyan); border-radius: 4px; padding: 2px 8px; font-size: 10px; font-weight: 700; margin-top: 10px; font-family: var(--fm); letter-spacing: .04em; }

    /* DEAL TIMELINE SHOWCASE */
    .showcase { padding: 100px 24px; background: var(--bg2); position: relative; overflow: hidden; }
    .showcase-orb { position: absolute; top: -100px; right: -100px; width: 500px; height: 500px; background: radial-gradient(ellipse, rgba(139,92,246,0.06) 0%, transparent 60%); pointer-events: none; }
    .showcase-i { max-width: 1120px; margin: 0 auto; }
    .showcase-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 64px; align-items: center; }
    .showcase-card { background: var(--bg3); border: 1px solid var(--card-border); border-radius: 18px; overflow: hidden; }
    .sc-header { padding: 16px 18px; border-bottom: 1px solid var(--card-border); display: flex; align-items: center; gap: 10px; }
    .sc-h-icon { width: 32px; height: 32px; border-radius: 9px; background: rgba(139,92,246,0.15); border: 1px solid rgba(139,92,246,0.25); display: flex; align-items: center; justify-content: center; font-size: 14px; }
    .sc-h-title { font-family: var(--fd); font-size: 13px; font-weight: 700; color: var(--ink); }
    .sc-h-badge { margin-left: auto; font-size: 10px; font-weight: 700; color: var(--green); background: rgba(16,185,129,0.1); border: 1px solid rgba(16,185,129,0.2); border-radius: 20px; padding: 2px 9px; display: flex; align-items: center; gap: 4px; }
    .sc-body { padding: 14px 16px; }
    .sc-call { display: flex; gap: 11px; margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid var(--card-border); }
    .sc-call-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; margin-top: 4px; }
    .sc-call-name { font-size: 12px; font-weight: 600; color: var(--ink); }
    .sc-call-meta { font-size: 10.5px; color: var(--ink3); margin-top: 2px; }
    .sc-call-score { margin-left: auto; text-align: right; }
    .sc-call-score-n { font-family: var(--fd); font-size: 16px; font-weight: 700; }
    .sc-call-score-l { font-size: 9px; color: var(--ink4); }
    .sc-intel { background: rgba(139,92,246,0.06); border: 1px solid rgba(139,92,246,0.15); border-radius: 11px; padding: 12px 13px; }
    .sc-intel-hdr { font-size: 10px; font-weight: 700; color: #a78bfa; text-transform: uppercase; letter-spacing: .08em; margin-bottom: 8px; }
    .sc-intel-item { display: flex; gap: 6px; font-size: 11.5px; color: var(--ink2); margin-bottom: 5px; line-height: 1.45; }

    /* COACHING CLIPS */
    .clips-section { padding: 100px 24px; background: var(--bg); }
    .clips-i { max-width: 1120px; margin: 0 auto; }
    .clips-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 64px; align-items: center; }
    .clip-demo { background: var(--bg2); border: 1px solid var(--card-border); border-radius: 18px; overflow: hidden; }
    .clip-transcript { padding: 14px 16px; max-height: 280px; overflow-y: hidden; }
    .clip-line { display: flex; gap: 9px; padding: 7px 9px; border-radius: 8px; margin-bottom: 4px; cursor: pointer; transition: background .1s; }
    .clip-line.sel { background: rgba(139,92,246,0.12); border: 1px solid rgba(139,92,246,0.25); }
    .clip-line:not(.sel) { border: 1px solid transparent; }
    .clip-speaker { font-size: 9.5px; font-weight: 700; min-width: 30px; margin-top: 1px; }
    .clip-text { font-size: 11px; color: var(--ink3); line-height: 1.5; }
    .clip-action { padding: 12px 14px; border-top: 1px solid var(--card-border); display: flex; align-items: center; gap: 10px; background: rgba(139,92,246,0.05); }
    .clip-sel-info { font-size: 11px; color: #a78bfa; flex: 1; }
    .clip-btn { background: linear-gradient(135deg,#7c3aed,#6d28d9); border: none; border-radius: 8px; padding: 7px 14px; color: #fff; font-size: 11.5px; font-weight: 700; cursor: pointer; font-family: var(--font); display: flex; align-items: center; gap: 5px; }

    /* TESTIMONIALS */
    .testimonials { padding: 100px 24px; background: var(--bg2); }
    .testimonials-i { max-width: 1100px; margin: 0 auto; }
    .testi-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 18px; }
    .testi-card { background: var(--bg3); border: 1px solid var(--card-border); border-radius: 16px; padding: 30px; display: flex; flex-direction: column; transition: border-color 0.2s, transform 0.2s; }
    .testi-card:hover { border-color: rgba(14,245,212,0.14); transform: translateY(-2px); }
    .testi-metric { display: inline-block; background: rgba(14,245,212,0.08); color: var(--cyan); border-radius: 5px; padding: 3px 10px; font-size: 11px; font-weight: 700; margin-bottom: 16px; font-family: var(--fm); }
    .testi-quote { font-size: 14px; color: var(--ink2); line-height: 1.72; flex: 1; margin-bottom: 22px; }
    .testi-author { display: flex; align-items: center; gap: 11px; border-top: 1px solid var(--card-border); padding-top: 16px; }
    .testi-av { width: 38px; height: 38px; border-radius: 50%; background: linear-gradient(135deg, rgba(14,245,212,0.2), rgba(139,92,246,0.2)); display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; color: var(--cyan); flex-shrink: 0; border: 1px solid rgba(14,245,212,0.15); }
    .testi-name { font-size: 13px; font-weight: 600; color: var(--ink); }
    .testi-role { font-size: 11.5px; color: var(--ink3); margin-top: 2px; }

    /* PLANS */
    .plans { padding: 100px 24px; background: var(--bg); }
    .plans-i { max-width: 1120px; margin: 0 auto; }
    .plans-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 14px; align-items: start; margin-top: 60px; }
    .plan-card { background: var(--card); border: 1px solid var(--card-border); border-radius: 16px; padding: 24px 20px 20px; transition: border-color 0.2s, transform 0.2s; }
    .plan-card:hover { border-color: rgba(255,255,255,0.12); }
    .plan-card.hot { border: 1.5px solid var(--cyan); background: rgba(14,245,212,0.04); transform: translateY(-6px); box-shadow: 0 20px 60px rgba(14,245,212,0.08); }
    .plan-card.hot:hover { transform: translateY(-8px); }
    .plan-badge { display: inline-block; font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; border-radius: 4px; padding: 3px 9px; margin-bottom: 12px; }
    .plan-badge-hot { background: var(--cyan); color: var(--bg); }
    .plan-badge-gray { background: var(--card-hover); color: var(--ink3); }
    .plan-name { font-family: var(--fd); font-size: 20px; font-weight: 800; color: var(--ink); letter-spacing: -0.03em; margin-bottom: 3px; }
    .plan-price { font-family: var(--fd); font-size: 44px; font-weight: 800; color: var(--ink); letter-spacing: -0.05em; line-height: 1; }
    .plan-period { font-size: 13px; color: var(--ink3); }
    .plan-mins { font-family: var(--fm); font-size: 12px; font-weight: 600; color: var(--cyan); margin: 7px 0 3px; }
    .plan-desc { font-size: 11.5px; color: var(--ink3); margin-bottom: 18px; }
    .plan-div { height: 1px; background: var(--card-border); margin-bottom: 18px; }
    .plan-feats { list-style: none; display: flex; flex-direction: column; gap: 9px; margin-bottom: 22px; }
    .plan-feat { display: flex; align-items: flex-start; gap: 8px; font-size: 12.5px; color: var(--ink2); line-height: 1.45; }
    .plan-feat-dot { width: 15px; height: 15px; border-radius: 50%; flex-shrink: 0; margin-top: 1px; display: flex; align-items: center; justify-content: center; }
    .plan-feat-dot.on { background: rgba(14,245,212,0.12); }
    .plan-feat-dot.off { background: var(--card); }
    .plan-cta { display: block; width: 100%; text-align: center; padding: 12px; border-radius: 10px; font-size: 13.5px; font-weight: 600; font-family: var(--font); cursor: pointer; text-decoration: none; transition: all 0.18s; border: 1px solid; }
    .plan-cta-hot { background: var(--cyan); color: var(--bg); border-color: var(--cyan); }
    .plan-cta-hot:hover { opacity: 0.88; transform: translateY(-1px); }
    .plan-cta-out { background: transparent; color: var(--cyan); border-color: rgba(14,245,212,0.3); }
    .plan-cta-out:hover { background: var(--cyan2); }
    .plan-cta-ghost { background: transparent; color: var(--ink3); border-color: var(--card-border); }
    .plan-cta-ghost:hover { border-color: rgba(255,255,255,0.15); color: var(--ink); }

    /* HOW IT WORKS */
    .how { padding: 100px 24px; background: var(--bg2); }
    .how-i { max-width: 1060px; margin: 0 auto; }
    .how-steps { display: grid; grid-template-columns: repeat(3,1fr); gap: 40px; position: relative; margin-top: 60px; }
    .how-connector { position: absolute; top: 24px; left: calc(33.3% + 20px); right: calc(33.3% + 20px); height: 1px; background: linear-gradient(90deg, var(--cyan), rgba(14,245,212,0.2), var(--cyan)); }
    .how-step-num { width: 48px; height: 48px; border-radius: 12px; background: rgba(14,245,212,0.08); border: 1px solid rgba(14,245,212,0.2); display: flex; align-items: center; justify-content: center; font-family: var(--fd); font-size: 16px; font-weight: 800; color: var(--cyan); margin-bottom: 20px; position: relative; z-index: 1; }
    .how-step-num.done { background: var(--cyan); color: var(--bg); }
    .how-step-title { font-family: var(--fd); font-size: 17px; font-weight: 700; color: var(--ink); letter-spacing: -0.02em; margin-bottom: 10px; }
    .how-step-desc { font-size: 13.5px; color: var(--ink2); line-height: 1.68; }

    /* FAQ */
    .faq { padding: 100px 24px; background: var(--bg); }
    .faq-i { max-width: 720px; margin: 0 auto; }
    .faq-item { border: 1px solid var(--card-border); border-radius: 12px; margin-bottom: 10px; overflow: hidden; transition: border-color 0.15s; }
    .faq-item:hover { border-color: rgba(255,255,255,0.12); }
    .faq-q { width: 100%; display: flex; align-items: center; justify-content: space-between; padding: 17px 20px; background: transparent; border: none; cursor: pointer; text-align: left; font-size: 14px; font-weight: 600; color: var(--ink); font-family: var(--font); gap: 16px; transition: background .15s; }
    .faq-q:hover { background: var(--card); }
    .faq-chevron { flex-shrink: 0; transition: transform 0.22s; color: var(--ink3); }
    .faq-chevron.open { transform: rotate(180deg); }
    .faq-a { max-height: 0; overflow: hidden; transition: max-height 0.28s ease, padding 0.28s ease; padding: 0 20px; }
    .faq-a.open { max-height: 200px; padding: 0 20px 18px; }
    .faq-a p { font-size: 13.5px; color: var(--ink2); line-height: 1.72; margin: 0; }

    /* FINAL CTA */
    .final { padding: 120px 24px; background: var(--bg); text-align: center; position: relative; overflow: hidden; }
    .final-orb { position: absolute; inset: 0; pointer-events: none; background: radial-gradient(ellipse 70% 70% at 50% 50%, rgba(14,245,212,0.06) 0%, transparent 65%); }
    .final-i { position: relative; z-index: 1; max-width: 580px; margin: 0 auto; }
    .final-h { font-family: var(--fd); font-size: clamp(34px,6vw,58px); font-weight: 800; color: var(--ink); letter-spacing: -0.05em; line-height: 1.06; margin-bottom: 16px; }
    .final-h .c { color: var(--cyan); }
    .final-p { font-size: 16px; color: var(--ink2); line-height: 1.72; margin-bottom: 38px; }
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

    @media(max-width:1060px){
      .plans-grid{grid-template-columns:repeat(2,1fr)}
      .footer-top{grid-template-columns:1fr 1fr}
    }
    @media(max-width:900px){
      .demo-inner{grid-template-columns:1fr;height:auto}
      .demo-sidebar{display:none}
      .demo-right{display:none}
      .demo-inner{grid-template-columns:1fr}
      .features-grid{grid-template-columns:1fr 1fr}
      .showcase-grid,.clips-grid{grid-template-columns:1fr;gap:32px}
      .testi-grid{grid-template-columns:1fr}
      .how-steps{grid-template-columns:1fr;gap:24px}
      .how-connector{display:none}
    }
    @media(max-width:768px){
      .burger{display:flex}
      .nav-links,.nav-acts{display:none}
      .hero{padding:110px 18px 64px}
      .demo-section{padding:0 16px 72px}
      .metrics-grid{grid-template-columns:repeat(2,1fr)}
      .features-grid{grid-template-columns:1fr}
      .plans-grid{grid-template-columns:1fr}
      .plan-card.hot{transform:none}
      .footer-top{grid-template-columns:1fr 1fr}
      .footer-bottom{flex-direction:column;align-items:flex-start}
    }
    @media(max-width:480px){
      .hero-ctas{flex-direction:column;align-items:center}
      .btn-main,.btn-sec{width:100%;max-width:300px;justify-content:center}
      .final-btns{flex-direction:column;align-items:center}
      .footer-top{grid-template-columns:1fr}
    }
  `;

  const FEATURES = [
    { icon: "🎙", title: "Live Call Rooms", desc: "Create a meeting room in one click. Share the link — prospects join without any account. AI records and transcribes both sides in real time, automatically.", tag: "100ms powered" },
    { icon: "🧠", title: "AI Call Intelligence", desc: "Every call gets automatic objection detection, sentiment scoring, talk ratio analysis, buying signal identification, and a structured AI summary — ready before your next meeting.", tag: "Claude AI" },
    { icon: "📈", title: "Deal Timeline", desc: "Link calls to deals and build a living prospect thread. The AI compares calls over time to show exactly what changed — new objections, sentiment shifts, momentum.", tag: "Deal Intelligence" },
    { icon: "✂️", title: "Coaching Clips", desc: "Select any moment from a transcript, add a coaching note, tag it, and share a public clip page with your team. Asynchronous coaching at scale.", tag: "Team Coaching" },
    { icon: "⚡", title: "Priority Action Layer", desc: "After each call, AI generates your single most important next action, drafts the follow-up email, and readies it for HubSpot or Salesforce — one click to push.", tag: "CRM Ready" },
    { icon: "👥", title: "Team Analytics", desc: "Rep leaderboards, win rate trends, sentiment patterns, talk ratio benchmarks. Managers get full visibility without sitting on every call.", tag: "Performance" },
  ];

  const PLANS = [
    { key: "free", name: "Free", price: "$0", mins: "30 min/month", desc: "Try without a card", badge: "", badgeType: "plan-badge-gray", ctaText: "Start Free", ctaClass: "plan-cta-ghost", feats: ["Live call rooms", "Basic transcription", "1 AI summary/month", "Solo use"] },
    { key: "starter", name: "Starter", price: "$18", mins: "300 min/month (5h)", desc: "Individual reps", badge: "", badgeType: "plan-badge-gray", ctaText: "Get Starter", ctaClass: "plan-cta-out", feats: ["Everything in Free", "Full AI summaries", "Objection detection", "Up to 3 members"] },
    { key: "growth", name: "Growth", price: "$49", mins: "1,500 min/month (25h)", desc: "Best for growing teams", badge: "Most Popular", badgeType: "plan-badge-hot", ctaText: "Start Free Trial", ctaClass: "plan-cta-hot", hot: true, feats: ["Everything in Starter", "Deal Timeline + AI Intel", "Coaching Clips", "Team messages", "Up to 10 members", "Action Layer + CRM push"] },
    { key: "scale", name: "Scale", price: "$99", mins: "5,000 min/month (83h)", desc: "Enterprise sales orgs", badge: "", badgeType: "plan-badge-gray", ctaText: "Get Scale", ctaClass: "plan-cta-out", feats: ["Everything in Growth", "Advanced analytics", "Rep leaderboards", "API access", "Unlimited members", "Dedicated CSM"] },
  ];

  const TESTIMONIALS = [
    { metric: "+30% close rate", quote: "Fixsense helped our team increase close rates by 30%. The Deal Timeline alone changed how we track complex opportunities — we finally understand the full context of every deal.", name: "Sarah Mitchell", role: "Head of Sales, Vantex Technologies", initials: "SM" },
    { metric: "3× faster ramp", quote: "We replaced our entire post-call review process. Managers now have full visibility across every rep without listening to recordings. New reps ramp in half the time using Coaching Clips.", name: "James Okafor", role: "VP Sales, Launchflow", initials: "JO" },
    { metric: "90 → 45 day ramp", quote: "The objection detection is genuinely game-changing. We see the exact moments deals stall and can coach around them systematically. Our close rate has stayed 30% higher for two quarters running.", name: "Priya Nair", role: "CRO, Cloudpath", initials: "PN" },
  ];

  // Demo state
  const [demoStep, setDemoStep] = useState(0);
  const [demoTyping, setDemoTyping] = useState<{speaker: string; color: string} | null>(null);
  const [demoLines, setDemoLines] = useState<{speaker: string; text: string; color: string}[]>([]);
  const [demoInsights, setDemoInsights] = useState<{tag: string; body: string; bg: string; color: string}[]>([]);
  const [talkRep, setTalkRep] = useState(60);
  const transcriptRef = useRef<HTMLDivElement>(null);

  const DEMO_SCRIPT = [
    { speaker: "Rep", color: "#818cf8", text: "Hi Alex, thanks for making time. What's your current process for tracking sales calls?" },
    { speaker: "Alex", color: "#2dd4bf", text: "Honestly? We're still using spreadsheets and reps update them manually. It's a mess." },
    { speaker: "Rep", color: "#818cf8", text: "How many calls does your team do per week, and how many do you actually review?" },
    { speaker: "Alex", color: "#2dd4bf", text: "About 60 calls a week. We review maybe 3 or 4. We just don't have the bandwidth." },
    { speaker: "Rep", color: "#818cf8", text: "What's it costing you — in deals, in coaching time?" },
    { speaker: "Alex", color: "#2dd4bf", text: "We lost a $200k deal last quarter because of a pricing objection nobody flagged. That's what finally got me looking at tools like this." },
  ];

  const DEMO_INSIGHTS = [
    { tag: "⚡ Pain Confirmed", body: "Manual tracking + zero review coverage = clear need. Strong qualification signal.", bg: "rgba(245,158,11,.08)", color: "#fbbf24" },
    { tag: "✓ Buying Signal", body: "$200k deal lost to unhandled objection. Budget exists. High urgency.", bg: "rgba(14,245,212,.06)", color: "#0ef5d4" },
    { tag: "→ Next Action", body: "Prospect is decision-ready. Transition to pricing and ROI calculation now.", bg: "rgba(139,92,246,.08)", color: "#a78bfa" },
  ];

  useEffect(() => {
    let i = 0;
    function scheduleNext() {
      if (i >= DEMO_SCRIPT.length) return;
      const line = DEMO_SCRIPT[i];
      setTimeout(() => {
        setDemoTyping({ speaker: line.speaker, color: line.color });
        setTimeout(() => {
          setDemoTyping(null);
          setDemoLines(prev => [...prev, line]);
          setTalkRep(prev => line.speaker === "Rep" ? Math.max(45, prev - 2) : Math.min(68, prev + 3));
          i++;
          if (i < 3) scheduleNext();
          else if (i === 3) {
            setDemoInsights(prev => [...prev, DEMO_INSIGHTS[0]]);
            scheduleNext();
          } else if (i === 5) {
            setDemoInsights(prev => [...prev, DEMO_INSIGHTS[1], DEMO_INSIGHTS[2]]);
            scheduleNext();
          } else { scheduleNext(); }
        }, 1400 + Math.random() * 400);
      }, 1000 + Math.random() * 500);
    }
    scheduleNext();
  }, []);

  useEffect(() => {
    if (transcriptRef.current) transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
  }, [demoLines, demoTyping]);

  return (
    <div className="lp">
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
              l.href.startsWith("#")
                ? <a key={l.label} href={l.href} className="nav-link">{l.label}</a>
                : <Link key={l.label} to={l.href} className="nav-link">{l.label}</Link>
            ))}
          </div>
          <div className="nav-acts">
            {user ? (
              <>
                <Link to="/dashboard/profile" style={{ display:"flex",alignItems:"center",gap:7, background:"rgba(255,255,255,.06)", border:"1px solid var(--card-border)", borderRadius:100, padding:"5px 12px 5px 5px", textDecoration:"none" }}>
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
            l.href.startsWith("#")
              ? <a key={l.label} href={l.href} className="drw-link" onClick={() => setMobileOpen(false)}>{l.label}</a>
              : <Link key={l.label} to={l.href} className="drw-link" onClick={() => setMobileOpen(false)}>{l.label}</Link>
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
        <FadeIn delay={40}>
          <div className="hero-pill">
            <div className="hero-pill-dot" />
            AI-powered sales call intelligence
          </div>
        </FadeIn>
        <FadeIn delay={90}>
          <h1 className="hero-h">
            Every sales call.<br />
            <span className="c">Analyzed.</span>{" "}
            <span className="m">Automatically.</span>
          </h1>
        </FadeIn>
        <FadeIn delay={140}>
          <p className="hero-sub">
            Fixsense records both sides of your sales calls, detects objections and buying signals in real time, builds deal intelligence across every touchpoint, and coaches your team — without any manual work.
          </p>
        </FadeIn>
        <FadeIn delay={190}>
          <div className="hero-ctas">
            <Link to={user ? "/dashboard" : "/login"} className="btn-main">
              Start for free
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7h10M7 2l5 5-5 5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </Link>
            <Link to="/pricing" className="btn-sec">See pricing →</Link>
          </div>
        </FadeIn>
        <FadeIn delay={240}>
          <div className="hero-trust">
            {["No credit card required", "30 min free every month", "Up in 60 seconds", "GDPR & NDPR compliant"].map((t, i) => (
              <span key={t} style={{ display:"contents" }}>
                {i > 0 && <div className="trust-sep" />}
                <div className="hero-trust-item">
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ flexShrink:0 }}>
                    <circle cx="6.5" cy="6.5" r="6" fill="rgba(14,245,212,0.1)"/>
                    <path d="M4 6.5l1.5 1.5 3.5-3.5" stroke="#0ef5d4" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  {t}
                </div>
              </span>
            ))}
          </div>
        </FadeIn>
      </section>

      {/* LIVE DEMO MOCKUP */}
      <div className="demo-section">
        <FadeIn>
          <div className="demo-label">
            <div className="demo-label-dot" />
            Live demo — watch AI analyze a real sales call
          </div>
          <div className="demo-wrap">
            <div className="demo-bar">
              <div className="demo-dot" style={{ background:"#ff5f57" }} />
              <div className="demo-dot" style={{ background:"#febc2e" }} />
              <div className="demo-dot" style={{ background:"#28c840" }} />
              <div className="demo-addr">fixsense.com.ng/dashboard/live</div>
            </div>
            <div className="demo-inner">
              {/* Sidebar */}
              <div className="demo-sidebar">
                <div className="demo-s-logo">
                  <Logo size={22} />
                  <span className="demo-s-name">Fixsense</span>
                </div>
                {["Dashboard","Live Call","Calls","Deals","AI Coach","Team"].map((l,i) => (
                  <div key={l} className={`demo-nav-item ${i===1?"active":""}`}>
                    <div className="demo-nav-dot" />{l}
                  </div>
                ))}
              </div>
              {/* Main */}
              <div className="demo-main">
                <div className="demo-topbar">
                  <div className="demo-title">Acme Corp — Discovery Call</div>
                  <div className="demo-live-badge"><div className="demo-live-dot" />LIVE</div>
                </div>
                <div className="demo-stats">
                  {[
                    { lbl: "Sentiment", val: "78%", color: "#0ef5d4" },
                    { lbl: "Engagement", val: "84%", color: "#a78bfa" },
                    { lbl: "Objections", val: demoInsights.length > 0 ? "1" : "0", color: demoInsights.length > 0 ? "#fbbf24" : "#475569" },
                    { lbl: "Duration", val: `${demoLines.length}:${String(demoLines.length * 18 % 60).padStart(2,"0")}`, color: "#60a5fa" },
                  ].map(s => (
                    <div key={s.lbl} className="demo-stat">
                      <div className="demo-stat-lbl">{s.lbl}</div>
                      <div className="demo-stat-val" style={{ color: s.color }}>{s.val}</div>
                    </div>
                  ))}
                </div>
                <div className="demo-transcript" ref={transcriptRef}>
                  {demoLines.map((ln, i) => (
                    <div key={i} className="demo-line">
                      <div className="demo-speaker" style={{ color: ln.color }}>{ln.speaker}</div>
                      <div className="demo-text">{ln.text}</div>
                    </div>
                  ))}
                  {demoTyping && (
                    <div className="demo-line">
                      <div className="demo-speaker" style={{ color: demoTyping.color }}>{demoTyping.speaker}</div>
                      <div className="demo-typing">
                        <div className="demo-t-dot" />
                        <div className="demo-t-dot" style={{ animationDelay:"0.2s" }} />
                        <div className="demo-t-dot" style={{ animationDelay:"0.4s" }} />
                      </div>
                    </div>
                  )}
                  {demoLines.length === 0 && !demoTyping && (
                    <div style={{ textAlign:"center", padding:"20px 0", color:"var(--ink4)", fontSize:12 }}>Transcript will appear here as you speak…</div>
                  )}
                </div>
                {/* Talk ratio */}
                <div className="demo-ratio">
                  <div className="demo-ratio-lbl">
                    <span style={{ color:"#818cf8" }}>Rep {100-talkRep}%</span>
                    <span style={{ color:"#2dd4bf" }}>Prospect {talkRep}%</span>
                  </div>
                  <div className="demo-ratio-bar">
                    <div className="demo-ratio-rep" style={{ width:`${100-talkRep}%`, background:"#818cf8" }} />
                    <div style={{ height:"100%", background:"#2dd4bf", flex:1 }} />
                  </div>
                </div>
              </div>
              {/* Right panel */}
              <div className="demo-right">
                <div className="demo-r-hdr">
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><circle cx="5" cy="5" r="4" stroke="var(--cyan)" strokeWidth="1.2"/><path d="M3.5 5l1 1 2-2" stroke="var(--cyan)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  AI Insights
                </div>
                <div className="demo-insights">
                  {demoInsights.length === 0 && (
                    <div style={{ textAlign:"center", padding:"20px 0", color:"var(--ink4)", fontSize:11 }}>
                      <div style={{ marginBottom:8, fontSize:16 }}>👂</div>
                      Listening for signals…
                    </div>
                  )}
                  {demoInsights.map((ins, i) => (
                    <div key={i} className="demo-insight" style={{ background: ins.bg, border:`1px solid ${ins.color}30`, animation:"lineFade .3s ease" }}>
                      <div className="demo-insight-tag" style={{ color: ins.color }}>{ins.tag}</div>
                      <div className="demo-insight-body">{ins.body}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </FadeIn>
      </div>

      {/* LOGO STRIP */}
      <div className="logo-strip">
        <div className="logo-strip-i">
          <span className="logo-lbl">Integrates with</span>
          <div className="logo-names">
            {["100ms", "HubSpot", "Salesforce", "Slack", "Paystack", "Supabase"].map(l => (
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
                { val: 99, suf: "%", lbl: "Transcription accuracy" },
                { val: 50, suf: "%", lbl: "Reduction in rep ramp time" },
                { val: 10, suf: "k+", lbl: "Sales meetings analyzed" },
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

      {/* FEATURES */}
      <section className="features" id="features">
        <div className="features-i">
          <FadeIn>
            <div style={{ marginBottom: 60 }}>
              <div className="sec-kicker">Platform Capabilities</div>
              <h2 className="sec-title">Everything your revenue team needs</h2>
              <p className="sec-sub">From the moment a call starts to the moment the deal closes — Fixsense has every touchpoint covered.</p>
            </div>
          </FadeIn>
          <div className="features-grid">
            {FEATURES.map((f, i) => (
              <FadeIn key={i} delay={i * 65}>
                <div className="feat-card">
                  <div className="feat-icon">{f.icon}</div>
                  <div className="feat-title">{f.title}</div>
                  <div className="feat-desc">{f.desc}</div>
                  <div className="feat-tag">{f.tag}</div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* DEAL TIMELINE SHOWCASE */}
      <section className="showcase">
        <div className="showcase-orb" />
        <div className="showcase-i">
          <div className="showcase-grid">
            <FadeIn>
              <div>
                <div className="sec-kicker">Deal Intelligence</div>
                <h2 className="sec-title">Your entire deal, in one thread.</h2>
                <p style={{ fontSize:15, color:"var(--ink2)", lineHeight:1.75, marginBottom:22 }}>
                  Stop losing context between calls. Link every call to a deal and Fixsense builds a living timeline — objections, buying signals, sentiment trend, and a running AI analysis of where the deal stands.
                </p>
                <p style={{ fontSize:15, color:"var(--ink2)", lineHeight:1.75, marginBottom:28 }}>
                  Click "What Changed?" and the AI compares your last two calls to tell you exactly how the deal momentum shifted and what your next best action is.
                </p>
                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  {[
                    "Complete call history linked to every deal",
                    "'What Changed?' AI analysis between calls",
                    "Sentiment trend: improving, declining, or stable",
                    "Recommended next best actions after each call",
                  ].map((t, i) => (
                    <div key={i} style={{ display:"flex", alignItems:"center", gap:10, fontSize:14, color:"var(--ink2)" }}>
                      <svg width="15" height="15" viewBox="0 0 15 15" fill="none" style={{ flexShrink:0 }}>
                        <circle cx="7.5" cy="7.5" r="7" fill="rgba(14,245,212,0.1)"/>
                        <path d="M4.5 7.5l2 2 4-4" stroke="#0ef5d4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      {t}
                    </div>
                  ))}
                </div>
              </div>
            </FadeIn>
            <FadeIn delay={100}>
              <div className="showcase-card">
                <div className="sc-header">
                  <div className="sc-h-icon">🏢</div>
                  <div>
                    <div className="sc-h-title">Acme Corp — Enterprise Deal</div>
                    <div style={{ fontSize:10, color:"var(--ink4)" }}>3 calls · $85,000</div>
                  </div>
                  <div className="sc-h-badge">
                    <div style={{ width:5, height:5, borderRadius:"50%", background:"var(--green)" }} />
                    Improving
                  </div>
                </div>
                <div className="sc-body">
                  {[
                    { name:"Discovery Call", date:"Mar 3", score:72, color:"#f59e0b", dotColor:"rgba(245,158,11,.4)" },
                    { name:"Product Demo", date:"Mar 10", score:84, color:"#22c55e", dotColor:"rgba(34,197,94,.4)" },
                    { name:"Negotiation", date:"Mar 17", score:91, color:"#0ef5d4", dotColor:"rgba(14,245,212,.4)", active:true },
                  ].map((c, i) => (
                    <div key={i} className="sc-call" style={{ borderBottom: i < 2 ? "1px solid var(--card-border)" : "none" }}>
                      <div className="sc-call-dot" style={{ background: c.dotColor }} />
                      <div>
                        <div className="sc-call-name">{c.name}</div>
                        <div className="sc-call-meta">{c.date} · {c.active ? "Latest" : "Completed"}</div>
                      </div>
                      <div className="sc-call-score">
                        <div className="sc-call-score-n" style={{ color: c.color }}>{c.score}</div>
                        <div className="sc-call-score-l">/ 100</div>
                      </div>
                    </div>
                  ))}
                  <div className="sc-intel">
                    <div className="sc-intel-hdr">✨ What Changed — AI Analysis</div>
                    {[
                      "Pricing objection from demo fully resolved",
                      "New stakeholder: CFO joining next call",
                      "Sentiment improved 7pts — strong momentum",
                    ].map((t, i) => (
                      <div key={i} className="sc-intel-item">
                        <span style={{ color:"#a78bfa", flexShrink:0 }}>·</span>{t}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* COACHING CLIPS */}
      <section className="clips-section">
        <div className="clips-i">
          <div className="clips-grid">
            <FadeIn>
              <div className="clip-demo">
                <div style={{ padding:"12px 14px", borderBottom:"1px solid var(--card-border)", display:"flex", alignItems:"center", gap:9 }}>
                  <div style={{ width:28, height:28, borderRadius:7, background:"rgba(139,92,246,.15)", border:"1px solid rgba(139,92,246,.25)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12 }}>✂️</div>
                  <div style={{ fontFamily:"var(--fd)", fontSize:12, fontWeight:700, color:"var(--ink)" }}>Transcript · Select lines to clip</div>
                </div>
                <div className="clip-transcript">
                  {[
                    { sp:"Rep", c:"#818cf8", t:"What's the biggest pain with your current setup?", sel:false },
                    { sp:"Alex", c:"#2dd4bf", t:"We lost a $200k deal because nobody flagged the pricing objection.", sel:true },
                    { sp:"Rep", c:"#818cf8", t:"That's the exact gap Fixsense closes. When did you realize it?", sel:true },
                    { sp:"Alex", c:"#2dd4bf", t:"In the post-mortem. By then it was too late.", sel:true },
                    { sp:"Rep", c:"#818cf8", t:"With real-time objection detection you'd see that flag mid-call.", sel:false },
                  ].map((l, i) => (
                    <div key={i} className={`clip-line${l.sel?" sel":""}`}>
                      <div className="clip-speaker" style={{ color: l.c }}>{l.sp}</div>
                      <div className="clip-text">{l.t}</div>
                      {l.sel && <div style={{ width:6, height:6, borderRadius:"50%", background:"#a78bfa", flexShrink:0, margin:"auto 0" }} />}
                    </div>
                  ))}
                </div>
                <div className="clip-action">
                  <div className="clip-sel-info">3 lines · 0:28 selected</div>
                  <div className="clip-btn">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 2l8 8M2 10l8-8" stroke="#fff" strokeWidth="1.2" strokeLinecap="round"/></svg>
                    Create Clip
                  </div>
                </div>
              </div>
            </FadeIn>
            <FadeIn delay={100}>
              <div>
                <div className="sec-kicker">Coaching Clips</div>
                <h2 className="sec-title">Clip moments.<br />Coach at scale.</h2>
                <p style={{ fontSize:15, color:"var(--ink2)", lineHeight:1.75, marginBottom:22 }}>
                  Select any lines from a call transcript, add a coaching note, tag it (Objection, Pricing, Discovery, Best Practice…), and Fixsense creates a shareable clip page instantly.
                </p>
                <p style={{ fontSize:15, color:"var(--ink2)", lineHeight:1.75, marginBottom:28 }}>
                  No video editing. No meeting to sit through. Share a 30-second clip with your whole team and move on.
                </p>
                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  {[
                    "Select transcript lines and clip in seconds",
                    "Add coaching notes, tags, and share links",
                    "Public clip pages — no Fixsense account needed",
                    "React with emoji, thread replies, view counts",
                  ].map((t, i) => (
                    <div key={i} style={{ display:"flex", alignItems:"center", gap:10, fontSize:14, color:"var(--ink2)" }}>
                      <svg width="15" height="15" viewBox="0 0 15 15" fill="none" style={{ flexShrink:0 }}>
                        <circle cx="7.5" cy="7.5" r="7" fill="rgba(139,92,246,0.12)"/>
                        <path d="M4.5 7.5l2 2 4-4" stroke="#a78bfa" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      {t}
                    </div>
                  ))}
                </div>
              </div>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="how" id="how">
        <div className="how-i">
          <FadeIn>
            <div style={{ textAlign:"center", marginBottom:60 }}>
              <div className="sec-kicker">How It Works</div>
              <h2 className="sec-title">Live in 60 seconds</h2>
              <p style={{ fontSize:16, color:"var(--ink2)", lineHeight:1.7, maxWidth:480, margin:"0 auto" }}>No IT tickets. No complex setup. Most teams are running their first call within 2 minutes.</p>
            </div>
          </FadeIn>
          <div className="how-steps">
            <div className="how-connector" />
            {[
              { n:"01", title:"Create a meeting room", desc:"Click 'New Meeting', enter a title and purpose. Fixsense generates a private room link in under 3 seconds.", active:true },
              { n:"02", title:"Share the link & join", desc:"Send the link to your prospect — no account needed. Join as host and AI starts transcribing both sides immediately.", active:false },
              { n:"03", title:"Get insights, close more", desc:"Receive real-time objection flags, a full AI summary, coaching clips, and your next best action the moment the call ends.", active:false },
            ].map((s, i) => (
              <FadeIn key={i} delay={i * 100}>
                <div>
                  <div className={`how-step-num ${s.active?"done":""}`}>{s.n}</div>
                  <div className="how-step-title">{s.title}</div>
                  <div className="how-step-desc">{s.desc}</div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="testimonials">
        <div className="testimonials-i">
          <FadeIn>
            <div style={{ marginBottom:56 }}>
              <div className="sec-kicker">Customer Stories</div>
              <h2 className="sec-title">Revenue leaders trust Fixsense</h2>
            </div>
          </FadeIn>
          <div className="testi-grid">
            {TESTIMONIALS.map((t, i) => (
              <FadeIn key={i} delay={i * 80}>
                <div className="testi-card">
                  <div className="testi-metric">{t.metric}</div>
                  <p className="testi-quote">{t.quote}</p>
                  <div className="testi-author">
                    <div className="testi-av">{t.initials}</div>
                    <div>
                      <div className="testi-name">{t.name}</div>
                      <div className="testi-role">{t.role}</div>
                    </div>
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* PLANS */}
      <section className="plans" id="pricing">
        <div className="plans-i">
          <FadeIn>
            <div style={{ textAlign:"center" }}>
              <div className="sec-kicker">Pricing</div>
              <h2 className="sec-title">Minute-based. Transparent.</h2>
              <p style={{ fontSize:16, color:"var(--ink2)", lineHeight:1.7, maxWidth:480, margin:"0 auto 12px" }}>Pay for exactly how long you record. Start free. Upgrade when you're ready. Cancel anytime.</p>
              <p style={{ fontSize:12, color:"var(--ink4)", display:"flex", alignItems:"center", justifyContent:"center", gap:5 }}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5" stroke="var(--ink4)" strokeWidth="1"/><path d="M6 4v3" stroke="var(--ink4)" strokeWidth="1" strokeLinecap="round"/><circle cx="6" cy="8.5" r=".5" fill="var(--ink4)"/></svg>
                Billed in NGN via Paystack · ₦1,500/$1
              </p>
            </div>
          </FadeIn>
          <div className="plans-grid">
            {PLANS.map((p, i) => (
              <FadeIn key={p.key} delay={i * 70}>
                <div className={`plan-card ${p.hot?"hot":""}`}>
                  {p.badge && <div className={`plan-badge ${p.badgeType}`}>{p.badge}</div>}
                  <div className="plan-name">{p.name}</div>
                  <div style={{ display:"flex", alignItems:"baseline", gap:2, marginBottom:2 }}>
                    <div className="plan-price">{p.price}</div>
                    <div className="plan-period">/mo</div>
                  </div>
                  <div className="plan-mins">{p.mins}</div>
                  <div className="plan-desc">{p.desc}</div>
                  <div className="plan-div" />
                  <ul className="plan-feats">
                    {p.feats.map(f => (
                      <li key={f} className="plan-feat">
                        <div className={`plan-feat-dot on`}>
                          <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                            <path d="M1.5 4l1.5 1.5 3.5-3" stroke={p.hot?"#0ef5d4":"#a78bfa"} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </div>
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Link to={user ? "/dashboard/billing" : "/login"} className={`plan-cta ${p.ctaClass}`}
                    onClick={() => !user && undefined}>
                    {p.ctaText}
                  </Link>
                  {p.hot && <div style={{ textAlign:"center", marginTop:8, fontSize:11, color:"var(--ink3)" }}>No credit card required</div>}
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="faq">
        <div className="faq-i">
          <FadeIn>
            <div style={{ textAlign:"center", marginBottom:48 }}>
              <div className="sec-kicker">FAQ</div>
              <h2 className="sec-title">Common questions</h2>
            </div>
          </FadeIn>
          <FadeIn delay={60}>
            {FAQS.map((f, i) => (
              <div key={i} className="faq-item">
                <button className="faq-q" onClick={() => setActiveFaq(activeFaq === i ? null : i)}>
                  {f.q}
                  <svg className={`faq-chevron ${activeFaq===i?"open":""}`} width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M3.5 5.5l3.5 3.5 3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                <div className={`faq-a ${activeFaq===i?"open":""}`}>
                  <p>{f.a}</p>
                </div>
              </div>
            ))}
          </FadeIn>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="final">
        <div className="final-orb" />
        <div className="final-i">
          <FadeIn>
            <h2 className="final-h">
              Start closing more deals<br /><span className="c">today.</span>
            </h2>
            <p className="final-p">
              Every call you run without Fixsense is a call you'll never fully understand. Start free — no credit card, no setup, just insights.
            </p>
            <div className="final-btns">
              <Link to={user ? "/dashboard" : "/login"} className="btn-main">
                {user ? "Open Dashboard" : "Start for free"}
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7h10M7 2l5 5-5 5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </Link>
              <Link to="/pricing" className="btn-sec">View pricing</Link>
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
              <div className="footer-brand-logo">
                <Logo size={22} />
                <span className="footer-brand-name">Fixsense</span>
              </div>
              <p className="footer-brand-desc">AI-powered sales call intelligence for modern revenue teams. Built in Benin City, Nigeria.</p>
            </div>
            <div>
              <div className="footer-col-title">Product</div>
              {[["#features","Features"],["#pricing","Pricing"],["/integrations","Integrations"],["/changelog","Changelog"]].map(([h,l])=>(
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