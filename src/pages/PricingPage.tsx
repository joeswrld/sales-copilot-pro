import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/hooks/useSubscription";
import { useUserProfile } from "@/hooks/useSettings";
import { PLANS_SIMPLE, formatMinutes } from "@/config/plans";

function useInView(threshold = 0.08) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setInView(true); obs.disconnect(); } }, { threshold });
    obs.observe(el); return () => obs.disconnect();
  }, [threshold]);
  return { ref, inView };
}

function FadeIn({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const { ref, inView } = useInView();
  return (
    <div ref={ref} className={className} style={{
      opacity: inView ? 1 : 0,
      transform: inView ? "translateY(0)" : "translateY(24px)",
      transition: `opacity 0.7s cubic-bezier(0.22,1,0.36,1) ${delay}ms, transform 0.7s cubic-bezier(0.22,1,0.36,1) ${delay}ms`
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
      setN(Math.floor((1 - Math.pow(1 - p, 3)) * end));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [inView, end]);
  return <span ref={ref}>{n}{suffix}</span>;
}

function Logo({ size = 28 }: { size?: number }) {
  return <img src="/fixsense_icon_logo (2).png" alt="Fixsense" width={size} height={size}
    style={{ width: size, height: size, borderRadius: Math.round(size * 0.24), objectFit: "cover", display: "block", flexShrink: 0 }} />;
}

const FAQS = [
  { q: "What counts as a minute?", a: "Every minute of a completed call recorded through Fixsense counts against your monthly quota. A 30-minute call uses exactly 30 minutes. Calls in progress are not counted until they end." },
  { q: "What happens when I hit my limit?", a: "New live calls are blocked until your cycle resets or you upgrade. All completed calls, summaries, and recordings remain fully accessible." },
  { q: "When does my quota reset?", a: "Your minute quota resets at the start of each billing cycle, anchored to your subscription renewal date. The exact reset date is visible on your billing page." },
  { q: "Why minute-based billing?", a: "Per-call pricing punished short discovery calls and rewarded long rambling ones. Per-minute pricing is proportional to the compute cost of transcription and AI analysis — you pay for what you actually use." },
  { q: "Can I change plans mid-cycle?", a: "Yes. Upgrades take effect immediately with prorated billing. Downgrades take effect at the next cycle. No locked contracts — cancel anytime." },
  { q: "Which features unlock at Growth?", a: "Growth unlocks objection detection, sentiment analysis, engagement scoring, deal rooms, deal intelligence AI, coaching clips, and team collaboration features. Free and Starter get transcription and AI summaries only." },
  { q: "Why am I billed in NGN?", a: "We use Paystack for payments, which processes in Nigerian Naira. All prices in USD are converted at a fixed rate of ₦1,500 per $1 for full transparency." },
];

const FEATURE_MATRIX = [
  { label: "Minutes / month",       free: "30 min",    starter: "300 min",  growth: "1,500 min", scale: "5,000 min" },
  { label: "Live calls",            free: true,        starter: true,       growth: true,        scale: true },
  { label: "AI transcription",      free: "true",     starter: true,       growth: true,        scale: true },
  { label: "AI call summaries",     free: "true",   starter: true,       growth: true,        scale: true },
  { label: "Objection detection",   free: false,       starter: true,      growth: true,        scale: true },
  { label: "Sentiment analysis",    free: false,       starter: true,      growth: true,        scale: true },
  { label: "Engagement scoring",    free: false,       starter: true ,      growth: true,        scale: true },
  { label: "Deal rooms & deals AI", free: false,       starter: false,      growth: true,        scale: true },
  { label: "Coaching clips",        free: false,       starter: false,      growth: true,        scale: true },
  { label: "Team members",          free: "Solo",      starter: "Up to 3",  growth: "Up to 10",  scale: "Unlimited" },
  { label: "Team messages",         free: false,       starter: true,      growth: true,        scale: true },
  { label: "Advanced analytics",    free: false,       starter: false,      growth: true,       scale: true },
  { label: "Rep leaderboards",      free: false,       starter: false,      growth: true,       scale: true },
  { label: "Action Layer + CRM push",            free: false,       starter: true,      growth: true,       scale: true },
  { label: "Dedicated CSM",         free: false,       starter: false,      growth: false,       scale: true },
];

export default function PricingPage() {
  const { user } = useAuth();
  const { subscribe } = useSubscription();
  const { profile } = useUserProfile();
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const currentPlan = profile?.plan_type || "free";

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  const handleCta = (planKey: string) => {
    if (planKey === "free") { user ? navigate("/dashboard") : navigate("/login"); return; }
    if (!user) { navigate("/login"); return; }
    if (planKey === currentPlan) { navigate("/dashboard"); return; }
    subscribe.mutate(planKey);
  };

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500;600;700&display=swap');
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    .pp{
      --bg:#050810;--bg2:#0a0d18;--bg3:#0f1220;
      --ink:#f0f2f8;--ink2:rgba(240,242,248,0.65);--mu:rgba(240,242,248,0.38);--mu2:rgba(240,242,248,0.18);
      --br:rgba(255,255,255,0.07);--br2:rgba(255,255,255,0.04);
      --cyan:#0ef5d4;--cyan2:rgba(14,245,212,0.15);--cyan3:rgba(14,245,212,0.07);
      --purple:#8b5cf6;--green:#10b981;--amber:#f59e0b;
      --fd:'Syne',system-ui,sans-serif;--fb:'DM Sans',system-ui,sans-serif;
      background:var(--bg);color:var(--ink);font-family:var(--fb);-webkit-font-smoothing:antialiased;overflow-x:hidden;line-height:1.6;min-height:100vh;
    }
    
    /* NAV */
    .nav{position:fixed;top:0;left:0;right:0;z-index:100;height:60px;display:flex;align-items:center;padding:0 24px;transition:all .3s;}
    .nav.sc{background:rgba(5,8,16,0.95);backdrop-filter:blur(20px);border-bottom:1px solid var(--br);}
    .nav-i{max-width:1140px;width:100%;margin:0 auto;display:flex;align-items:center;justify-content:space-between;}
    .nav-logo{display:flex;align-items:center;gap:9px;text-decoration:none;}
    .nav-name{font-family:var(--fd);font-size:16px;font-weight:700;color:var(--ink);letter-spacing:-.03em;}
    .nav-links{display:flex;align-items:center;gap:28px;}
    .nav-link{font-size:13.5px;font-weight:500;color:var(--mu);text-decoration:none;transition:color .2s;}
    .nav-link:hover,.nav-link.act{color:var(--ink);}
    .nav-link.act{color:var(--cyan);}
    .nav-acts{display:flex;align-items:center;gap:8px;}
    .btn-ghost{font-size:13px;font-weight:500;color:var(--mu);background:none;border:none;padding:8px 14px;border-radius:8px;font-family:var(--fb);cursor:pointer;text-decoration:none;transition:color .15s;}
    .btn-ghost:hover{color:var(--ink);}
    .btn-cta{font-size:13px;font-weight:600;color:var(--bg);background:var(--cyan);border:none;padding:8px 20px;border-radius:8px;font-family:var(--fb);cursor:pointer;text-decoration:none;transition:all .15s;white-space:nowrap;}
    .btn-cta:hover{opacity:.88;transform:translateY(-1px);}
    @media(max-width:768px){.nav-links{display:none;}}

    /* HERO */
    .hero{padding:130px 24px 80px;text-align:center;position:relative;overflow:hidden;}
    .hero-orb{position:absolute;top:-100px;left:50%;transform:translateX(-50%);width:700px;height:500px;background:radial-gradient(ellipse,rgba(14,245,212,0.06) 0%,transparent 65%);pointer-events:none;}
    .hero-pill{display:inline-flex;align-items:center;gap:8px;background:rgba(14,245,212,0.08);border:1px solid rgba(14,245,212,0.2);border-radius:100px;padding:6px 16px 6px 6px;font-size:12px;font-weight:600;color:var(--cyan);margin-bottom:28px;}
    .hero-dot{width:7px;height:7px;border-radius:50%;background:var(--cyan);box-shadow:0 0 8px var(--cyan);animation:pulse 2.2s ease-in-out infinite;}
    @keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(.85)}}
    .hero-h{font-family:var(--fd);font-size:clamp(34px,6vw,68px);font-weight:800;line-height:1.05;letter-spacing:-.05em;color:var(--ink);max-width:760px;margin:0 auto 20px;}
    .hero-h .c{color:var(--cyan);}
    .hero-sub{font-size:clamp(15px,2vw,18px);color:var(--ink2);line-height:1.7;max-width:520px;margin:0 auto 14px;}
    .hero-note{font-size:12px;color:var(--mu);display:flex;align-items:center;justify-content:center;gap:5px;}

    /* METRICS STRIP */
    .metrics-strip{padding:56px 24px;background:var(--bg2);border-top:1px solid var(--br);border-bottom:1px solid var(--br);}
    .metrics-strip-i{max-width:960px;margin:0 auto;}
    .metrics-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--br);border-radius:14px;overflow:hidden;border:1px solid var(--br);}
    .metric-card{background:var(--bg2);padding:36px 24px;}
    .metric-num{font-family:var(--fd);font-size:clamp(36px,4.5vw,52px);font-weight:800;color:var(--cyan);letter-spacing:-.04em;line-height:1;margin-bottom:8px;}
    .metric-lbl{font-size:13px;color:var(--mu);line-height:1.5;}
    @media(max-width:768px){.metrics-grid{grid-template-columns:1fr 1fr;}}

    /* PLANS */
    .plans{padding:80px 24px;}
    .plans-i{max-width:1140px;margin:0 auto;}
    .plans-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;align-items:start;}
    @media(max-width:1080px){.plans-grid{grid-template-columns:repeat(2,1fr);}}
    @media(max-width:600px){.plans-grid{grid-template-columns:1fr;}}
    
    .plan-card{background:rgba(255,255,255,.025);border:1px solid var(--br);border-radius:18px;padding:26px 22px 22px;display:flex;flex-direction:column;transition:border-color .2s,box-shadow .2s,transform .2s;position:relative;overflow:hidden;}
    .plan-card:hover{border-color:rgba(14,245,212,.18);box-shadow:0 10px 40px rgba(14,245,212,.06);}
    .plan-card-growth{border-color:var(--cyan)!important;border-width:1.5px;box-shadow:0 12px 48px rgba(14,245,212,.12)!important;transform:translateY(-8px);}
    .plan-card-growth:hover{transform:translateY(-11px);}
    .plan-card-scale{border-color:rgba(139,92,246,.4)!important;background:rgba(139,92,246,.04)!important;}
    .plan-card-scale:hover{border-color:rgba(139,92,246,.6)!important;}
    .plan-card-growth::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,var(--cyan),rgba(14,245,212,.5));}
    
    .plan-badge{display:inline-flex;align-items:center;font-size:10px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;border-radius:5px;padding:3px 9px;margin-bottom:12px;}
    .badge-growth{background:var(--cyan);color:var(--bg);}
    .badge-scale{background:rgba(139,92,246,.2);color:#c4b5fd;}
    .badge-plain{background:rgba(255,255,255,.06);color:var(--mu);}
    
    .plan-name{font-family:var(--fd);font-size:20px;font-weight:800;color:var(--ink);letter-spacing:-.03em;margin-bottom:3px;}
    .plan-price-row{display:flex;align-items:baseline;gap:2px;margin-bottom:2px;}
    .plan-price{font-family:var(--fd);font-size:48px;font-weight:800;color:var(--ink);letter-spacing:-.04em;line-height:1;}
    .plan-price-growth{color:var(--cyan);}
    .plan-period{font-size:13px;color:var(--mu);}
    .plan-mins{font-size:13px;font-weight:700;color:var(--cyan);margin:6px 0 3px;}
    .plan-mins-scale{color:#c4b5fd;}
    .plan-tagline{font-size:11.5px;color:var(--mu);margin-bottom:18px;}
    .plan-divider{height:1px;background:var(--br);margin-bottom:18px;}
    .plan-feats{list-style:none;display:flex;flex-direction:column;gap:9px;flex:1;margin-bottom:22px;}
    .plan-feat{display:flex;align-items:flex-start;gap:8px;font-size:12.5px;color:var(--ink2);line-height:1.45;}
    .plan-cta{display:block;width:100%;text-align:center;padding:12px;border-radius:10px;font-size:13.5px;font-weight:600;font-family:var(--fb);cursor:pointer;text-decoration:none;transition:all .18s;border:1px solid;}
    .cta-ghost{background:rgba(255,255,255,.04);color:var(--mu);border-color:var(--br);}
    .cta-ghost:hover{background:rgba(255,255,255,.08);color:var(--ink);}
    .cta-out{background:rgba(14,245,212,.06);color:var(--cyan);border-color:rgba(14,245,212,.3);}
    .cta-out:hover{background:rgba(14,245,212,.12);}
    .cta-fill{background:var(--cyan);color:var(--bg);border-color:var(--cyan);box-shadow:0 4px 18px rgba(14,245,212,.3);}
    .cta-fill:hover{opacity:.88;transform:translateY(-1px);box-shadow:0 6px 24px rgba(14,245,212,.4);}
    .cta-purple{background:rgba(139,92,246,.15);color:#c4b5fd;border-color:rgba(139,92,246,.35);}
    .cta-purple:hover{background:rgba(139,92,246,.25);}
    .cta-cur{background:rgba(255,255,255,.04);color:var(--mu);border-color:var(--br);cursor:default;}
    .cta-note{text-align:center;margin-top:8px;font-size:11px;color:var(--mu);}

    /* FEATURE MATRIX */
    .matrix{padding:80px 24px;background:var(--bg2);}
    .matrix-i{max-width:980px;margin:0 auto;}
    .kicker{font-size:11px;font-weight:700;color:var(--cyan);text-transform:uppercase;letter-spacing:.12em;margin-bottom:12px;}
    .sec-title{font-family:var(--fd);font-size:clamp(26px,4.5vw,42px);font-weight:800;color:var(--ink);letter-spacing:-.04em;line-height:1.1;margin-bottom:14px;}
    .mtable{width:100%;border-collapse:collapse;border-radius:14px;overflow:hidden;border:1px solid var(--br);}
    .mthead{background:rgba(255,255,255,.03);}
    .mth{padding:14px 18px;text-align:center;position:relative;border-bottom:1px solid var(--br);}
    .mth:first-child{text-align:left;}
    .mth-name{font-family:var(--fd);font-size:13px;font-weight:700;color:var(--ink);}
    .mth-name-c{color:var(--cyan);}
    .mth-price{font-size:10px;color:var(--mu);margin-top:2px;}
    .mth-top{position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,var(--cyan),rgba(14,245,212,.4));}
    .mtr{border-bottom:1px solid var(--br2);}
    .mtr:last-child{border-bottom:none;}
    .mtr:nth-child(odd){background:rgba(255,255,255,.015);}
    .mtd{padding:10px 18px;text-align:center;}
    .mtd:first-child{text-align:left;font-size:12px;color:var(--mu);font-weight:500;}
    .mtd-v{font-size:12px;font-weight:600;color:var(--ink);}
    .mtd-c{color:var(--cyan);}
    .mtd-gbg{background:rgba(14,245,212,.025);}
    .mtd-part{font-size:10px;font-weight:700;color:var(--amber);background:rgba(245,158,11,.08);border-radius:4px;padding:2px 7px;display:inline-block;}
    
    /* FAQ */
    .faq{padding:80px 24px;background:var(--bg);}
    .faq-i{max-width:720px;margin:0 auto;}
    .faq-item{border:1px solid var(--br);border-radius:12px;margin-bottom:10px;overflow:hidden;}
    .faq-q{width:100%;display:flex;align-items:center;justify-content:space-between;padding:17px 20px;background:transparent;border:none;cursor:pointer;text-align:left;font-size:14px;font-weight:600;color:var(--ink);font-family:var(--fb);gap:16px;transition:background .15s;}
    .faq-q:hover{background:rgba(255,255,255,.03);}
    .faq-chev{flex-shrink:0;color:var(--mu);transition:transform .22s;}
    .faq-chev.op{transform:rotate(180deg);}
    .faq-a{max-height:0;overflow:hidden;transition:max-height .28s ease,padding .28s ease;padding:0 20px;}
    .faq-a.op{max-height:200px;padding:0 20px 18px;}
    .faq-a p{font-size:13.5px;color:var(--ink2);line-height:1.72;margin:0;}

    /* FINAL CTA */
    .final{padding:120px 24px;background:var(--bg);text-align:center;position:relative;overflow:hidden;}
    .final-orb{position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse 65% 65% at 50% 50%,rgba(14,245,212,0.05) 0%,transparent 65%);}
    .final-i{position:relative;z-index:1;max-width:560px;margin:0 auto;}
    .final-h{font-family:var(--fd);font-size:clamp(32px,5.5vw,56px);font-weight:800;color:var(--ink);letter-spacing:-.05em;line-height:1.07;margin-bottom:16px;}
    .final-h .c{color:var(--cyan);}
    .final-p{font-size:16px;color:var(--ink2);line-height:1.72;margin-bottom:36px;}
    .final-btns{display:flex;gap:12px;justify-content:center;flex-wrap:wrap;}
    .btn-main{display:inline-flex;align-items:center;gap:8px;background:var(--cyan);color:var(--bg);border:none;border-radius:10px;padding:14px 28px;font-size:15px;font-weight:700;font-family:var(--fb);cursor:pointer;text-decoration:none;transition:all .2s;box-shadow:0 4px 20px rgba(14,245,212,.25);}
    .btn-main:hover{opacity:.88;transform:translateY(-2px);}
    .btn-sec{display:inline-flex;align-items:center;gap:8px;background:transparent;color:var(--ink2);border:1px solid var(--br);border-radius:10px;padding:14px 26px;font-size:15px;font-weight:500;font-family:var(--fb);cursor:pointer;text-decoration:none;transition:all .2s;}
    .btn-sec:hover{border-color:rgba(255,255,255,.2);color:var(--ink);}
    .final-note{margin-top:14px;font-size:12px;color:var(--mu);}

    /* FOOTER */
    .footer{background:var(--bg2);padding:56px 24px 28px;border-top:1px solid var(--br);}
    .footer-i{max-width:1100px;margin:0 auto;}
    .footer-top{display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:48px;margin-bottom:44px;padding-bottom:40px;border-bottom:1px solid var(--br2);}
    .footer-brand-logo{display:flex;align-items:center;gap:9px;margin-bottom:12px;}
    .footer-brand-name{font-family:var(--fd);font-size:15px;font-weight:700;color:var(--ink);letter-spacing:-.02em;}
    .footer-brand-desc{font-size:13px;color:var(--mu);line-height:1.65;max-width:230px;}
    .footer-col-title{font-size:10.5px;font-weight:700;color:var(--mu);text-transform:uppercase;letter-spacing:.1em;margin-bottom:14px;}
    .footer-link{display:block;font-size:13px;color:var(--mu);text-decoration:none;margin-bottom:9px;transition:color .2s;}
    .footer-link:hover{color:var(--ink);}
    .footer-bottom{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;}
    .footer-legal{font-size:12px;color:var(--mu2);}
    .footer-legal-links{display:flex;gap:18px;}
    .footer-ll{font-size:12px;color:var(--mu2);text-decoration:none;transition:color .2s;}
    .footer-ll:hover{color:var(--mu);}
    @media(max-width:1024px){.footer-top{grid-template-columns:1fr 1fr;}}
    @media(max-width:640px){.footer-top{grid-template-columns:1fr;}.footer-bottom{flex-direction:column;align-items:flex-start;}}
  `;

  function CheckIcon({ on = true, accent = false }: { on?: boolean; accent?: boolean }) {
    if (!on) return (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none" style={{ flexShrink: 0, marginTop: 2 }}>
        <circle cx="7.5" cy="7.5" r="7" fill="rgba(255,255,255,.04)" />
        <path d="M5 5l5 5M10 5l-5 5" stroke="rgba(255,255,255,.2)" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    );
    return (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none" style={{ flexShrink: 0, marginTop: 2 }}>
        <circle cx="7.5" cy="7.5" r="7" fill={accent ? "rgba(14,245,212,.12)" : "rgba(14,245,212,.08)"} />
        <path d="M4.5 7.5l2 2 4-4" stroke="#0ef5d4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  const PLANS_CONFIG = [
    {
      key: "free", name: "Free", price: "$0", badge: null, badgeClass: "badge-plain",
      mins: "30 min/month", tagline: "Try without a card",
      ctaText: "Start Free", ctaClass: "cta-ghost",
      cardClass: "", priceClass: "", minsClass: "",
      feats: ["Live call rooms", "Basic transcription", " AI summary", "Solo use"],
    },
    {
      key: "starter", name: "Starter", price: "$18", badge: null, badgeClass: "badge-plain",
      mins: "300 min/month (5h)", tagline: "Individual reps",
      ctaText: "Get Starter", ctaClass: "cta-out",
      cardClass: "", priceClass: "", minsClass: "",
      feats: ["Everything in Free", "Full AI summaries", "Objection detection", "Up to 3 members"],
    },
    {
      key: "growth", name: "Growth", price: "$60", badge: "Most Popular", badgeClass: "badge-growth",
      mins: "1,500 min/month (25h)", tagline: "Best for growing teams",
      ctaText: "Start Free Trial", ctaClass: "cta-fill",
      cardClass: "plan-card-growth", priceClass: "plan-price-growth", minsClass: "",
      feats: ["Everything in Starter", "Deal Timeline + AI Intel", "Coaching Clips", "Team messages", "Up to 10 members", "Action Layer + CRM push"],
    },
    {
      key: "scale", name: "Scale", price: "$120", badge: "Enterprise", badgeClass: "badge-scale",
      mins: "5,000 min/month (83h)", tagline: "Enterprise sales orgs",
      ctaText: "Get Scale", ctaClass: "cta-purple",
      cardClass: "plan-card-scale", priceClass: "", minsClass: "plan-mins-scale",
      feats: ["Everything in Growth", "Advanced analytics", "Rep leaderboards", "Action Layer + CRM push", "Unlimited members"],
    },
  ];

  const NAV = [
    { label: "Features", href: "/#features" },
    { label: "How It Works", href: "/#how" },
    { label: "Pricing", href: "/pricing" },
    { label: "Testimonials", href: "/testimonials" },
  ];

  return (
    <div className="pp">
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
              <a key={l.label} href={l.href} className={`nav-link ${l.href === "/pricing" ? "act" : ""}`}>{l.label}</a>
            ))}
          </div>
          <div className="nav-acts">
            {user ? (
              <Link to="/dashboard" className="btn-cta">Dashboard →</Link>
            ) : (
              <>
                <Link to="/login" className="btn-ghost">Sign in</Link>
                <Link to="/login" className="btn-cta">Start Free →</Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section className="hero">
        <div className="hero-orb" />
        <FadeIn delay={80}>
          <h1 className="hero-h">
            Pay for minutes,<br /><span className="c">unlock features</span> as you grow
          </h1>
        </FadeIn>
        <FadeIn delay={130}>
          <p className="hero-sub">
            No per-seat tricks. Start with basic transcription and unlock AI insights, deal intelligence, and team collaboration as your plan scales.
          </p>
        </FadeIn>
        <FadeIn delay={160}>
          <p className="hero-note">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <circle cx="6.5" cy="6.5" r="5.5" stroke="rgba(255,255,255,.3)" strokeWidth="1.1"/>
              <path d="M6.5 4v3" stroke="rgba(255,255,255,.3)" strokeWidth="1.1" strokeLinecap="round"/>
              <circle cx="6.5" cy="9" r=".55" fill="rgba(255,255,255,.3)"/>
            </svg>
            Billed in NGN at ₦1,500/$1 via Paystack
          </p>
        </FadeIn>
      </section>

      {/* METRICS */}
      <section className="metrics-strip">
        <div className="metrics-strip-i">
          <FadeIn>
            <div className="metrics-grid">
              {[
                { val: 30, suf: "%", lbl: "Avg. increase in close rate" },
                { val: 10, suf: "k+", lbl: "Sales meetings analyzed" },
                { val: 99, suf: "%", lbl: "Transcription accuracy" },
                { val: 50, suf: "%", lbl: "Reduction in rep ramp time" },
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

      {/* PLAN CARDS */}
      <section className="plans">
        <div className="plans-i">
          <FadeIn>
            <div style={{ textAlign: "center", marginBottom: 56 }}>
              <div className="kicker">Plans & Pricing</div>
              <h2 className="sec-title">Choose your plan</h2>
              <p style={{ fontSize: 16, color: "var(--ink2)", lineHeight: 1.7, maxWidth: 480, margin: "0 auto" }}>
                All plans include a 30-minute free trial. No credit card required to start.
              </p>
            </div>
          </FadeIn>
          <div className="plans-grid">
            {PLANS_CONFIG.map((plan, i) => {
              const isCur = !!user && currentPlan === plan.key;
              const isGrowth = plan.key === "growth";
              return (
                <FadeIn key={plan.key} delay={i * 65}>
                  <div className={`plan-card ${plan.cardClass}`}>
                    {plan.badge && (
                      <div className={`plan-badge ${plan.badgeClass}`}>{plan.badge}</div>
                    )}
                    <div className="plan-name">{plan.name}</div>
                    <div className="plan-price-row">
                      <div className={`plan-price ${plan.priceClass}`}>{plan.price}</div>
                      <div className="plan-period">/mo</div>
                    </div>
                    <div className={`plan-mins ${plan.minsClass}`}>{plan.mins}</div>
                    <div className="plan-tagline">{plan.tagline}</div>
                    <div className="plan-divider" />
                    <ul className="plan-feats">
                      {plan.feats.map(f => (
                        <li key={f} className="plan-feat">
                          <CheckIcon on={true} accent={isGrowth} />{f}
                        </li>
                      ))}
                    </ul>
                    <button
                      className={`plan-cta ${isCur ? "cta-cur" : plan.ctaClass}`}
                      disabled={isCur}
                      onClick={() => handleCta(plan.key)}
                    >
                      {isCur ? "Current Plan" : plan.ctaText}
                    </button>
                    {isGrowth && <div className="cta-note">No credit card required · Cancel anytime</div>}
                  </div>
                </FadeIn>
              );
            })}
          </div>
        </div>
      </section>

      {/* FEATURE MATRIX */}
      <section className="matrix">
        <div className="matrix-i">
          <FadeIn>
            <div style={{ textAlign: "center", marginBottom: 48 }}>
              <div className="kicker">Compare Plans</div>
              <h2 className="sec-title">Features at every tier</h2>
            </div>
          </FadeIn>
          <FadeIn delay={60}>
            <div style={{ overflowX: "auto" }}>
              <table className="mtable">
                <thead>
                  <tr className="mthead">
                    <th className="mth" style={{ textAlign: "left" }}>
                      <div style={{ fontSize: 11, fontWeight: 500, color: "var(--mu)" }}>Feature</div>
                    </th>
                    {[
                      { n: "Free", p: "$0/mo", g: false },
                      { n: "Starter", p: "$18/mo", g: false },
                      { n: "Growth", p: "$49/mo", g: true },
                      { n: "Scale", p: "$99/mo", g: false },
                    ].map(col => (
                      <th key={col.n} className={`mth ${col.g ? "mtd-gbg" : ""}`}>
                        {col.g && <div className="mth-top" />}
                        <div className={`mth-name ${col.g ? "mth-name-c" : ""}`}>{col.n}</div>
                        <div className="mth-price">{col.p}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {FEATURE_MATRIX.map(row => (
                    <tr key={row.label} className="mtr">
                      <td className="mtd">{row.label}</td>
                      {(["free", "starter", "growth", "scale"] as const).map(k => {
                        const v = row[k]; const isG = k === "growth";
                        return (
                          <td key={k} className={`mtd ${isG ? "mtd-gbg" : ""}`}>
                            {typeof v === "boolean" ? (
                              <CheckIcon on={v} accent={isG || k === "scale"} />
                            ) : v === "Basic" || v === "1/month" ? (
                              <span className="mtd-part">{v as string}</span>
                            ) : (
                              <span className={`mtd-v ${isG ? "mtd-c" : ""}`}>{v as string}</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* FAQ */}
      <section className="faq">
        <div className="faq-i">
          <FadeIn>
            <div style={{ textAlign: "center", marginBottom: 48 }}>
              <div className="kicker">FAQ</div>
              <h2 className="sec-title">Common questions</h2>
            </div>
          </FadeIn>
          <FadeIn delay={60}>
            {FAQS.map((f, i) => (
              <div key={i} className="faq-item">
                <button className="faq-q" onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                  {f.q}
                  <svg className={`faq-chev ${openFaq === i ? "op" : ""}`} width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M3.5 5.5l3.5 3.5 3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <div className={`faq-a ${openFaq === i ? "op" : ""}`}><p>{f.a}</p></div>
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
            <h2 className="final-h">Start free.<br /><span className="c">Scale when you're ready.</span></h2>
            <p className="final-p">No setup. No IT tickets. Most teams are running live calls in minutes — and move to Growth before the week is out.</p>
            <div className="final-btns">
              <Link to={user ? "/dashboard" : "/login"} className="btn-main">
                Start Free Trial
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7h10M7 2l5 5-5 5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </Link>
              <Link to="/testimonials" className="btn-sec">See customer stories →</Link>
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