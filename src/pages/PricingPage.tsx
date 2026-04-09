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
    <div ref={ref} className={className} style={{ opacity: inView ? 1 : 0, transform: inView ? "translateY(0)" : "translateY(20px)", transition: `opacity 0.6s ease ${delay}ms, transform 0.6s ease ${delay}ms` }}>
      {children}
    </div>
  );
}
function Logo({ size = 28 }: { size?: number }) {
  return <img src="/fixsense_icon_logo (2).png" alt="Fixsense" width={size} height={size}
    style={{ width: size, height: size, borderRadius: Math.round(size * 0.24), objectFit: "cover", display: "block", flexShrink: 0 }} />;
}
function CheckIcon({ on = true, accent = false }: { on?: boolean; accent?: boolean }) {
  if (!on) return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" style={{ flexShrink: 0, marginTop: 2 }}>
      <circle cx="7.5" cy="7.5" r="7" fill="rgba(100,116,139,0.1)" />
      <path d="M5 5l5 5M10 5l-5 5" stroke="#94a3b8" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" style={{ flexShrink: 0, marginTop: 2 }}>
      <circle cx="7.5" cy="7.5" r="7" fill={accent ? "rgba(99,102,241,0.15)" : "rgba(16,185,129,0.12)"} />
      <path d="M4.5 7.5l2 2 4-4" stroke={accent ? "#818cf8" : "#10b981"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
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

function FAQ() {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <section style={{ padding: "80px 24px", background: "var(--bg)" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <FadeIn>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ind)", marginBottom: 12 }}>FAQ</div>
            <h2 style={{ fontFamily: "var(--fd)", fontSize: "clamp(26px,4vw,38px)", fontWeight: 800, letterSpacing: "-0.04em", color: "var(--ink)", lineHeight: 1.1 }}>Common questions</h2>
          </div>
        </FadeIn>
        <FadeIn delay={60}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {FAQS.map((f, i) => (
              <div key={i} style={{ border: "1px solid var(--br)", borderRadius: 12, overflow: "hidden" }}>
                <button onClick={() => setOpen(open === i ? null : i)}
                  style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "17px 20px", background: open === i ? "var(--bg2)" : "var(--bg)", border: "none", fontFamily: "var(--fb)", fontSize: 14, fontWeight: 600, color: "var(--ink)", cursor: "pointer", textAlign: "left", gap: 16, transition: "background 0.15s" }}>
                  {f.q}
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, transform: open === i ? "rotate(180deg)" : "none", transition: "transform 0.25s", color: "var(--mu)" }}>
                    <path d="M3.5 5.5l3.5 3.5 3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                {open === i && <div style={{ padding: "0 20px 17px", background: "var(--bg2)", fontSize: 13.5, color: "var(--mu)", lineHeight: 1.7 }}>{f.a}</div>}
              </div>
            ))}
          </div>
        </FadeIn>
      </div>
    </section>
  );
}

export default function PricingPage() {
  const { user }          = useAuth();
  const { subscribe }     = useSubscription();
  const { profile }       = useUserProfile();
  const navigate          = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const currentPlan       = profile?.plan_type || "free";

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

  const FEATURE_MATRIX = [
    { label: "Minutes / month",       free: "30 min",   starter: "300 min",  growth: "1,500 min", scale: "5,000 min" },
    { label: "Live calls",            free: true,       starter: true,       growth: true,        scale: true },
    { label: "AI transcription",      free: "Basic",    starter: true,       growth: true,        scale: true },
    { label: "AI call summaries",     free: "1/month",  starter: true,       growth: true,        scale: true },
    { label: "Objection detection",   free: false,      starter: false,      growth: true,        scale: true },
    { label: "Sentiment analysis",    free: false,      starter: false,      growth: true,        scale: true },
    { label: "Engagement scoring",    free: false,      starter: false,      growth: true,        scale: true },
    { label: "Deal rooms & deals AI", free: false,      starter: false,      growth: true,        scale: true },
    { label: "Coaching clips",        free: false,      starter: false,      growth: true,        scale: true },
    { label: "Team members",          free: "Solo",     starter: "Up to 3",  growth: "Up to 10",  scale: "Unlimited" },
    { label: "Team messages",         free: false,      starter: false,      growth: true,        scale: true },
    { label: "Advanced analytics",    free: false,      starter: false,      growth: false,       scale: true },
    { label: "Rep leaderboards",      free: false,      starter: false,      growth: false,       scale: true },
    { label: "API access",            free: false,      starter: false,      growth: false,       scale: true },
    { label: "Dedicated CSM",         free: false,      starter: false,      growth: false,       scale: true },
  ];

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Sans:wght@300;400;500;600;700&display=swap');
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    .pp{
      --bg:#fafaf9;--bg2:#f3f2ef;--bg3:#ebe9e4;
      --ink:#1a1814;--ink2:#2d2b27;--mu:#7a7670;--mu2:#a09d98;--br:#e2dfd9;
      --ind:#5b21b6;--ind2:#4c1d95;--ind-l:rgba(91,33,182,0.08);--ind-g:rgba(91,33,182,0.18);
      --green:#059669;
      --fb:'DM Sans',sans-serif;--fd:'Instrument Serif',Georgia,serif;
      background:var(--bg);color:var(--ink);font-family:var(--fb);-webkit-font-smoothing:antialiased;overflow-x:hidden;line-height:1.6
    }
    .pp-nav{position:fixed;top:0;left:0;right:0;z-index:100;height:60px;display:flex;align-items:center;padding:0 24px;transition:all 0.3s;border-bottom:1px solid transparent}
    .pp-nav.sc{background:rgba(250,250,249,0.95);backdrop-filter:blur(16px);border-bottom-color:var(--br);box-shadow:0 1px 12px rgba(26,24,20,0.05)}
    .pp-nav-i{max-width:1140px;width:100%;margin:0 auto;display:flex;align-items:center;justify-content:space-between}
    .pp-logo{display:flex;align-items:center;gap:9px;text-decoration:none}
    .pp-logo-t{font-family:var(--fd);font-size:18px;font-style:italic;color:var(--ink)}
    .pp-nav-cta{font-size:13px;font-weight:600;color:#fff;background:var(--ind);border:none;cursor:pointer;padding:8px 20px;border-radius:100px;font-family:var(--fb);text-decoration:none;transition:all 0.15s;display:inline-block}
    .pp-nav-cta:hover{background:var(--ind2);transform:translateY(-1px)}
    .pp-nav-ghost{font-size:13px;font-weight:500;color:var(--mu);background:none;border:none;cursor:pointer;padding:8px 16px;border-radius:8px;font-family:var(--fb);text-decoration:none;transition:color 0.15s}
    .pp-nav-ghost:hover{color:var(--ink)}

    .pp-hero{padding:120px 24px 60px;text-align:center;position:relative;overflow:hidden}
    .pp-hero::before{content:'';position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse 60% 50% at 50% 0%,rgba(91,33,182,0.06) 0%,transparent 70%)}
    .pp-hero-kicker{display:inline-flex;align-items:center;gap:8px;font-size:12px;font-weight:600;color:var(--ind);letter-spacing:0.06em;text-transform:uppercase;margin-bottom:20px}
    .pp-hero-dot{width:6px;height:6px;border-radius:50%;background:var(--green);box-shadow:0 0 0 3px rgba(5,150,105,0.2)}
    .pp-hero-h{font-family:var(--fd);font-size:clamp(38px,6vw,66px);line-height:1.06;letter-spacing:-0.03em;color:var(--ink);margin-bottom:16px}
    .pp-hero-h em{font-style:italic;color:var(--ind)}
    .pp-hero-sub{font-size:clamp(15px,2vw,17px);color:var(--mu);line-height:1.7;max-width:520px;margin:0 auto 12px}

    /* Plan cards */
    .pp-plans{padding:48px 24px 80px}
    .pp-plans-i{max-width:1120px;margin:0 auto}
    .pp-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;align-items:start}
    .pp-card{border:1.5px solid var(--br);border-radius:18px;padding:26px 22px 22px;background:var(--bg);display:flex;flex-direction:column;transition:box-shadow 0.2s,transform 0.2s,border-color 0.2s;position:relative}
    .pp-card:hover{box-shadow:0 10px 36px rgba(26,24,20,0.08)}
    .pp-card-growth{border-color:var(--ind);border-width:2px;box-shadow:0 12px 48px var(--ind-g),0 0 0 1px rgba(91,33,182,0.06);transform:translateY(-8px)}
    .pp-card-growth:hover{transform:translateY(-11px);box-shadow:0 20px 56px var(--ind-g)}
    .pp-card-scale{border-color:var(--ink);background:var(--ink)}
    .pp-card-scale:hover{box-shadow:0 14px 48px rgba(26,24,20,0.25)}
    .pp-badge{display:inline-flex;align-items:center;font-size:10px;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;border-radius:5px;padding:3px 9px;margin-bottom:12px}
    .pp-badge-growth{background:var(--ind);color:#fff}
    .pp-badge-scale{background:rgba(255,255,255,0.1);color:rgba(255,255,255,0.5)}
    .pp-badge-plain{background:var(--bg3);color:var(--mu2)}
    .pp-plan-name{font-family:var(--fd);font-size:22px;font-style:italic;color:var(--ink);letter-spacing:-0.02em;margin-bottom:3px}
    .pp-plan-name-lt{color:#fff}
    .pp-price{font-family:var(--fd);font-size:48px;color:var(--ink);letter-spacing:-0.04em;line-height:1}
    .pp-price-lt{color:#fff}
    .pp-period{font-size:13px;color:var(--mu)}
    .pp-period-lt{color:rgba(255,255,255,0.35)}
    .pp-minutes{font-size:13px;font-weight:700;color:var(--ind);margin:6px 0 3px}
    .pp-minutes-scale{color:rgba(167,139,250,0.9)}
    .pp-tagline{font-size:11px;color:var(--mu2);margin-bottom:18px}
    .pp-tagline-lt{color:rgba(255,255,255,0.3);margin-bottom:18px}
    .pp-divider{height:1px;background:var(--br);margin-bottom:18px}
    .pp-divider-dk{background:rgba(255,255,255,0.07)}
    .pp-feats{list-style:none;display:flex;flex-direction:column;gap:9px;flex:1;margin-bottom:22px}
    .pp-feat{display:flex;align-items:flex-start;gap:8px;font-size:12.5px;color:var(--ink2);line-height:1.45}
    .pp-feat-dk{color:rgba(255,255,255,0.6)}
    .pp-cta{display:block;width:100%;text-align:center;padding:12px;border-radius:10px;font-size:13.5px;font-weight:600;font-family:var(--fb);cursor:pointer;text-decoration:none;transition:all 0.18s;border:1.5px solid}
    .pp-cta-ghost{background:var(--bg2);color:var(--mu);border-color:var(--br)}
    .pp-cta-ghost:hover{background:var(--bg3);color:var(--ink)}
    .pp-cta-out{background:transparent;color:var(--ind);border-color:var(--ind)}
    .pp-cta-out:hover{background:var(--ind-l)}
    .pp-cta-fill{background:var(--ind);color:#fff;border-color:var(--ind);box-shadow:0 3px 14px var(--ind-g)}
    .pp-cta-fill:hover{background:var(--ind2);transform:translateY(-1px);box-shadow:0 6px 20px var(--ind-g)}
    .pp-cta-inv{background:rgba(255,255,255,0.08);color:rgba(255,255,255,0.75);border-color:rgba(255,255,255,0.14)}
    .pp-cta-inv:hover{background:rgba(255,255,255,0.14);color:#fff}
    .pp-cta-cur{background:var(--bg3);color:var(--mu2);border-color:var(--br);cursor:default}
    .pp-cta-note{text-align:center;margin-top:8px;font-size:11px;color:var(--mu2)}

    /* Comparison table */
    .pp-matrix{padding:80px 24px;background:var(--bg)}
    .pp-matrix-i{max-width:960px;margin:0 auto}
    .pp-matrix-hdr{text-align:center;margin-bottom:44px}
    .pp-kicker{font-size:11px;font-weight:700;color:var(--ind);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:12px}
    .pp-mtable{width:100%;border-collapse:collapse;border-radius:14px;overflow:hidden;border:1px solid var(--br);box-shadow:0 2px 16px rgba(26,24,20,0.05)}
    .pp-thead{background:var(--ink)}
    .pp-th{padding:15px 18px;text-align:center;position:relative}
    .pp-th:first-child{text-align:left}
    .pp-th-name{font-family:var(--fd);font-size:15px;font-style:italic;color:#fff}
    .pp-th-name-g{color:#c4b5fd}
    .pp-th-price{font-size:11px;color:rgba(255,255,255,0.3);margin-top:2px}
    .pp-g-top{position:absolute;top:0;left:0;right:0;height:2px;background:var(--ind)}
    .pp-tr{border-bottom:1px solid var(--br)}
    .pp-tr:last-child{border-bottom:none}
    .pp-tr:nth-child(odd){background:#fff}
    .pp-tr:nth-child(even){background:var(--bg)}
    .pp-td{padding:11px 18px;text-align:center}
    .pp-td:first-child{text-align:left;font-size:12.5px;color:var(--mu);font-weight:500}
    .pp-td-v{font-size:12.5px;font-weight:600;color:var(--ink)}
    .pp-td-v-ind{color:var(--ind)}
    .pp-td-gbg{background:rgba(91,33,182,0.03)}
    .pp-td-part{font-size:11px;font-weight:700;color:#d97706;background:rgba(217,119,6,0.08);border-radius:4px;padding:2px 7px;display:inline-block}

    /* Final CTA */
    .pp-final{padding:100px 24px;background:var(--ink);text-align:center;position:relative;overflow:hidden}
    .pp-final::before{content:'';position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse 65% 65% at 50% 50%,rgba(91,33,182,0.15) 0%,transparent 65%)}
    .pp-final-i{position:relative;z-index:1;max-width:540px;margin:0 auto}
    .pp-final-h{font-family:var(--fd);font-size:clamp(32px,5.5vw,54px);font-style:italic;color:#fff;letter-spacing:-0.04em;line-height:1.07;margin-bottom:16px}
    .pp-final-p{font-size:15px;color:rgba(255,255,255,0.4);line-height:1.75;margin-bottom:36px}
    .pp-final-btns{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}
    .pp-btn-main{display:inline-flex;align-items:center;gap:8px;background:var(--ind);color:#fff;border:none;border-radius:100px;padding:14px 30px;font-size:14px;font-weight:600;font-family:var(--fb);cursor:pointer;text-decoration:none;transition:all 0.2s;box-shadow:0 4px 20px rgba(91,33,182,0.4)}
    .pp-btn-main:hover{background:var(--ind2);transform:translateY(-2px)}
    .pp-footer{background:#111009;padding:36px 24px 24px;border-top:1px solid rgba(255,255,255,0.05)}
    .pp-footer-i{max-width:1100px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px}
    .pp-footer-logo{display:flex;align-items:center;gap:9px;text-decoration:none}
    .pp-footer-name{font-family:var(--fd);font-size:16px;font-style:italic;color:#fff}
    .pp-footer-copy{font-size:12px;color:rgba(255,255,255,0.2)}
    .pp-footer-links{display:flex;gap:18px}
    .pp-footer-link{font-size:12px;color:rgba(255,255,255,0.22);text-decoration:none;transition:color 0.2s}
    .pp-footer-link:hover{color:rgba(255,255,255,0.55)}

    @media(max-width:1024px){.pp-grid{grid-template-columns:repeat(2,1fr)}.pp-card-growth{transform:none}}
    @media(max-width:680px){.pp-grid{grid-template-columns:1fr}.pp-final-btns{flex-direction:column;align-items:center}.pp-btn-main{width:100%;max-width:300px;justify-content:center}}
  `;

  return (
    <div className="pp">
      <style>{css}</style>

      {/* NAV */}
      <nav className={`pp-nav ${scrolled ? "sc" : ""}`}>
        <div className="pp-nav-i">
          <Link to="/" className="pp-logo"><Logo size={26} /><span className="pp-logo-t">Fixsense</span></Link>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {user ? <Link to="/dashboard" className="pp-nav-cta">Dashboard →</Link> : <>
              <Link to="/login" className="pp-nav-ghost">Sign in</Link>
              <Link to="/login" className="pp-nav-cta">Start Free →</Link>
            </>}
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section className="pp-hero">
        <FadeIn><div className="pp-hero-kicker"><div className="pp-hero-dot" />Minute-based · Transparent pricing</div></FadeIn>
        <FadeIn delay={50}><h1 className="pp-hero-h">Pay for minutes,<br /><em>unlock features</em> as you grow</h1></FadeIn>
        <FadeIn delay={100}><p className="pp-hero-sub">No per-seat tricks. Start with basic transcription and unlock AI insights, deal intelligence, and team collaboration as your plan scales.</p></FadeIn>
        <FadeIn delay={130}><p style={{ fontSize: 12, color: "var(--mu2)", display: "flex", alignItems: "center", justifyContent: "center", gap: 5, marginTop: 8 }}>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="6.5" r="5.5" stroke="#a09d98" strokeWidth="1.1"/><path d="M6.5 4v3" stroke="#a09d98" strokeWidth="1.1" strokeLinecap="round"/><circle cx="6.5" cy="9" r="0.55" fill="#a09d98"/></svg>
          Billed in NGN at ₦1,500/$1 via Paystack
        </p></FadeIn>
      </section>

      {/* PLAN CARDS */}
      <section className="pp-plans">
        <div className="pp-plans-i">
          <div className="pp-grid">
            {PLANS_SIMPLE.map((plan, i) => {
              const isG = plan.key === "growth", isS = plan.key === "scale", dark = isS;
              const isCur = !!user && currentPlan === plan.key;
              let cardClass = "pp-card";
              if (isG) cardClass += " pp-card-growth";
              if (isS) cardClass += " pp-card-scale";
              let ctaClass = "pp-cta ";
              if (isCur) ctaClass += "pp-cta-cur";
              else if (isG) ctaClass += "pp-cta-fill";
              else if (isS) ctaClass += "pp-cta-inv";
              else if (plan.key === "free") ctaClass += "pp-cta-ghost";
              else ctaClass += "pp-cta-out";

              const minuteLabel = plan.minute_quota >= 1000
                ? `${(plan.minute_quota / 60).toFixed(0)}h`
                : `${plan.minute_quota} min`;

              return (
                <FadeIn key={plan.key} delay={i * 65}>
                  <div className={cardClass}>
                    <div className={`pp-badge ${isG ? "pp-badge-growth" : isS ? "pp-badge-scale" : "pp-badge-plain"}`}>
                      {plan.badge || plan.name}
                    </div>
                    <div className={`pp-plan-name ${dark ? "pp-plan-name-lt" : ""}`}>{plan.name}</div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 2, marginBottom: 2 }}>
                      <div className={`pp-price ${dark ? "pp-price-lt" : ""}`}>${plan.price_usd}</div>
                      <div className={`pp-period ${dark ? "pp-period-lt" : ""}`}>/mo</div>
                    </div>
                    <div className={`pp-minutes ${isS ? "pp-minutes-scale" : ""}`}>{minuteLabel} call minutes/month</div>
                    <div className={`pp-tagline ${dark ? "pp-tagline-lt" : ""}`}>
                      {plan.key === "free" ? "Try for free" :
                       plan.key === "starter" ? "Individual reps" :
                       plan.key === "growth" ? "Growing sales teams" :
                       "Enterprise orgs"}
                    </div>
                    <div className={`pp-divider ${dark ? "pp-divider-dk" : ""}`} />
                    <ul className="pp-feats">
                      {plan.features.map((f) => (
                        <li key={f} className={`pp-feat ${dark ? "pp-feat-dk" : ""}`}>
                          <CheckIcon on={true} accent={isG || isS} />{f}
                        </li>
                      ))}
                    </ul>
                    <button className={ctaClass} disabled={isCur} onClick={() => handleCta(plan.key)}>
                      {isCur ? "Current Plan" : plan.key === "free" ? "Start Free" : `Get ${plan.name}`}
                    </button>
                    {isG && <div className="pp-cta-note">No credit card required · Cancel anytime</div>}
                  </div>
                </FadeIn>
              );
            })}
          </div>
        </div>
      </section>

      {/* FEATURE MATRIX */}
      <section className="pp-matrix">
        <div className="pp-matrix-i">
          <FadeIn>
            <div className="pp-matrix-hdr">
              <div className="pp-kicker">Compare Plans</div>
              <h2 style={{ fontFamily: "var(--fd)", fontSize: "clamp(26px,3.5vw,38px)", fontStyle: "italic", letterSpacing: "-0.03em", color: "var(--ink)", marginTop: 8 }}>
                Features at every tier
              </h2>
            </div>
          </FadeIn>
          <FadeIn delay={60}>
            <div style={{ overflowX: "auto" }}>
              <table className="pp-mtable">
                <thead>
                  <tr className="pp-thead">
                    <th className="pp-th"><div style={{ fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.35)" }}>Feature</div></th>
                    {[
                      { n: "Free", p: "$0/mo", g: false },
                      { n: "Starter", p: "$18/mo", g: false },
                      { n: "Growth", p: "$49/mo", g: true },
                      { n: "Scale", p: "$99/mo", g: false },
                    ].map((col) => (
                      <th key={col.n} className="pp-th">
                        {col.g && <div className="pp-g-top" />}
                        <div className={`pp-th-name ${col.g ? "pp-th-name-g" : ""}`}>{col.n}</div>
                        <div className="pp-th-price">{col.p}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {FEATURE_MATRIX.map((row) => (
                    <tr key={row.label} className="pp-tr">
                      <td className="pp-td">{row.label}</td>
                      {(["free", "starter", "growth", "scale"] as const).map((k) => {
                        const v = row[k]; const isG = k === "growth";
                        return (
                          <td key={k} className={`pp-td ${isG ? "pp-td-gbg" : ""}`}>
                            {typeof v === "boolean" ? (
                              <CheckIcon on={v} accent={isG || k === "scale"} />
                            ) : v === "Basic" || v === "1/month" ? (
                              <span className="pp-td-part">{v as string}</span>
                            ) : (
                              <span className={`pp-td-v ${isG ? "pp-td-v-ind" : ""}`}>{v as string}</span>
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

      <FAQ />

      {/* FINAL CTA */}
      <section className="pp-final">
        <div className="pp-final-i">
          <FadeIn>
            <h2 className="pp-final-h">Start free.<br />Scale when you're ready.</h2>
            <p className="pp-final-p">No setup. No IT tickets. Most teams are running live calls in minutes — and move to Growth before the week is out.</p>
            <div className="pp-final-btns">
              <Link to={user ? "/dashboard" : "/login"} className="pp-btn-main">
                Start Free Trial →
              </Link>
            </div>
          </FadeIn>
        </div>
      </section>

      <footer className="pp-footer">
        <div className="pp-footer-i">
          <Link to="/" className="pp-footer-logo"><Logo size={20} /><span className="pp-footer-name">Fixsense</span></Link>
          <span className="pp-footer-copy">© {new Date().getFullYear()} Fixsense, Inc.</span>
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