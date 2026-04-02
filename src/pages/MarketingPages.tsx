/**
 * Fixsense Marketing Pages
 * Integrations · Changelog · About · Blog · Careers · Press
 *
 * All pages match LandingPage.tsx design tokens exactly.
 *
 * Add to App.tsx:
 *   import { IntegrationsPage, ChangelogPage, AboutPage, BlogPage, CareersPage, PressPage } from "./pages/MarketingPages";
 *   <Route path="/integrations" element={<IntegrationsPage />} />
 *   <Route path="/changelog"    element={<ChangelogPage />} />
 *   <Route path="/about"        element={<AboutPage />} />
 *   <Route path="/blog"         element={<BlogPage />} />
 *   <Route path="/careers"      element={<CareersPage />} />
 *   <Route path="/press"        element={<PressPage />} />
 */

import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";

// ─── Shared CSS (exact LandingPage tokens) ────────────────────────────────────
const BASE_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,500;12..96,600;12..96,700;12..96,800&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  .mp {
    --bg:        #ffffff;
    --bg-2:      #f8fafc;
    --bg-3:      #f1f5f9;
    --ink:       #0f172a;
    --ink-2:     #1e293b;
    --muted:     #64748b;
    --muted-2:   #94a3b8;
    --border:    #e2e8f0;
    --blue:      #2563eb;
    --blue-2:    #1d4ed8;
    --blue-light:rgba(37,99,235,0.08);
    --blue-glow: rgba(37,99,235,0.18);
    --green:     #10b981;
    --font:         'Plus Jakarta Sans', sans-serif;
    --font-display: 'Bricolage Grotesque', sans-serif;
    background: var(--bg); color: var(--ink);
    font-family: var(--font); -webkit-font-smoothing: antialiased;
    min-height: 100vh; line-height: 1.6; overflow-x: hidden;
  }

  /* ── NAV ── */
  .mp-nav {
    position: fixed; top: 0; left: 0; right: 0; z-index: 100; height: 64px;
    display: flex; align-items: center; padding: 0 24px;
    background: rgba(255,255,255,0.95); backdrop-filter: blur(20px);
    border-bottom: 1px solid var(--border);
    box-shadow: 0 1px 16px rgba(15,23,42,0.06);
  }
  .mp-nav-inner {
    max-width: 1160px; width: 100%; margin: 0 auto;
    display: flex; align-items: center; justify-content: space-between;
  }
  .mp-nav-brand { display: flex; align-items: center; gap: 10px; text-decoration: none; }
  .mp-nav-logo  { width: 28px; height: 28px; border-radius: 7px; object-fit: cover; display: block; }
  .mp-nav-name  { font-family: var(--font-display); font-size: 17px; font-weight: 700; color: var(--ink); letter-spacing: -0.03em; }
  .mp-nav-links { display: flex; align-items: center; gap: 28px; }
  .mp-nav-link  { font-size: 14px; font-weight: 500; color: var(--muted); text-decoration: none; transition: color 0.2s; }
  .mp-nav-link:hover { color: var(--ink); }
  .mp-nav-link--active { color: var(--blue); font-weight: 600; }
  .mp-nav-actions { display: flex; align-items: center; gap: 10px; }
  .mp-btn-ghost {
    font-size: 13.5px; font-weight: 500; color: var(--ink); background: none;
    border: none; cursor: pointer; padding: 8px 16px; border-radius: 8px;
    font-family: var(--font); text-decoration: none; transition: background 0.15s;
  }
  .mp-btn-ghost:hover { background: var(--bg-3); }
  .mp-btn-primary {
    font-size: 13.5px; font-weight: 600; color: #fff; background: var(--blue);
    border: none; cursor: pointer; padding: 8px 20px; border-radius: 8px;
    font-family: var(--font); text-decoration: none; transition: all 0.15s;
  }
  .mp-btn-primary:hover { background: var(--blue-2); transform: translateY(-1px); }
  @media(max-width:768px){
    .mp-nav-links { display: none; }
    .mp-nav { padding: 0 16px; }
    .mp-nav-actions .mp-btn-ghost { display: none; }
  }

  /* ── HERO ── */
  .mp-hero {
    padding: 118px 24px 80px;
    background: linear-gradient(180deg, #f0f6ff 0%, #ffffff 65%);
    position: relative; overflow: hidden;
  }
  .mp-hero-pattern {
    position: absolute; inset: 0; pointer-events: none;
    background-image: radial-gradient(circle, #d1defe 1px, transparent 1px);
    background-size: 32px 32px;
    mask-image: radial-gradient(ellipse 80% 60% at 50% 0%, black 0%, transparent 100%);
    opacity: 0.45;
  }
  .mp-hero-inner { position: relative; z-index: 1; max-width: 1160px; margin: 0 auto; }
  .mp-kicker {
    display: inline-flex; align-items: center; gap: 8px;
    font-size: 12px; font-weight: 700; color: var(--blue);
    text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 18px;
  }
  .mp-kicker-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--green); }
  .mp-h1 {
    font-family: var(--font-display);
    font-size: clamp(32px, 5vw, 58px); font-weight: 800;
    letter-spacing: -0.04em; line-height: 1.06; color: var(--ink); margin-bottom: 18px;
  }
  .mp-h1 .blue { color: var(--blue); }
  .mp-hero-sub {
    font-size: clamp(15px,2vw,18px); color: var(--muted);
    line-height: 1.7; max-width: 560px; margin-bottom: 36px;
  }
  .mp-hero-meta { display: flex; align-items: center; gap: 20px; flex-wrap: wrap; }
  .mp-hero-meta-item {
    display: inline-flex; align-items: center; gap: 7px;
    background: #fff; border: 1px solid var(--border); border-radius: 20px;
    padding: 5px 14px; font-size: 12px; font-weight: 500; color: var(--muted);
    box-shadow: 0 1px 6px rgba(15,23,42,0.05);
  }
  .mp-hero-meta-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--green); }
  .mp-hero-ctas { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 0; }
  .mp-btn-hero {
    display: inline-flex; align-items: center; gap: 8px;
    background: var(--blue); color: #fff; border: none; border-radius: 10px;
    padding: 14px 28px; font-size: 15px; font-weight: 600; font-family: var(--font);
    cursor: pointer; text-decoration: none; transition: all 0.2s;
    box-shadow: 0 4px 16px var(--blue-glow);
  }
  .mp-btn-hero:hover { background: var(--blue-2); transform: translateY(-2px); }
  .mp-btn-hero-ghost {
    display: inline-flex; align-items: center; gap: 8px;
    background: #fff; color: var(--ink); border: 1.5px solid var(--border);
    border-radius: 10px; padding: 14px 28px; font-size: 15px; font-weight: 600;
    font-family: var(--font); cursor: pointer; text-decoration: none; transition: all 0.2s;
  }
  .mp-btn-hero-ghost:hover { border-color: var(--muted-2); transform: translateY(-2px); }

  /* ── SECTION WRAPPER ── */
  .mp-section { padding: 96px 24px; }
  .mp-section-inner { max-width: 1160px; margin: 0 auto; }
  .mp-section--alt { background: var(--bg-2); }
  .mp-section--dark { background: var(--ink); }

  .mp-section-kicker { font-size: 12px; font-weight: 700; color: var(--blue); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 12px; }
  .mp-section-title { font-family: var(--font-display); font-size: clamp(26px,4vw,42px); font-weight: 800; color: var(--ink); letter-spacing: -0.04em; line-height: 1.1; margin-bottom: 14px; }
  .mp-section-title--light { color: #fff; }
  .mp-section-sub  { font-size: 16px; color: var(--muted); line-height: 1.7; max-width: 520px; }
  .mp-section-sub--light { color: rgba(255,255,255,0.5); }
  .mp-section-header { margin-bottom: 60px; }
  .mp-section-header--center { text-align: center; }
  .mp-section-header--center .mp-section-sub { margin: 0 auto; }

  /* ── CARDS ── */
  .mp-card {
    background: var(--bg-2); border: 1.5px solid var(--border); border-radius: 16px;
    padding: 28px; transition: border-color 0.2s, box-shadow 0.2s, transform 0.2s;
  }
  .mp-card:hover { border-color: #bfdbfe; box-shadow: 0 8px 32px var(--blue-glow); transform: translateY(-2px); }
  .mp-card--white { background: #fff; }
  .mp-card-icon { font-size: 28px; margin-bottom: 14px; }
  .mp-card-title { font-family: var(--font-display); font-size: 17px; font-weight: 700; color: var(--ink); letter-spacing: -0.02em; margin-bottom: 8px; }
  .mp-card-desc  { font-size: 13.5px; color: var(--muted); line-height: 1.65; }

  /* ── BADGE ── */
  .mp-badge {
    display: inline-flex; align-items: center; gap: 6px;
    background: var(--blue-light); color: var(--blue); border-radius: 6px;
    padding: 4px 10px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em;
  }
  .mp-badge--green { background: rgba(16,185,129,0.1); color: var(--green); }
  .mp-badge--gray  { background: var(--bg-3); color: var(--muted); }
  .mp-badge--orange { background: rgba(245,158,11,0.1); color: #d97706; }

  /* ── CHECK ICON ── */
  .mp-check {
    width: 18px; height: 18px; border-radius: 50%;
    background: rgba(37,99,235,0.1); display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  }

  /* ── FOOTER (exact landing footer) ── */
  .mp-footer { background: var(--ink); padding: 60px 24px 32px; border-top: 1px solid rgba(255,255,255,0.06); }
  .mp-footer-inner { max-width: 1160px; margin: 0 auto; }
  .mp-footer-top {
    display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap: 48px;
    margin-bottom: 48px; padding-bottom: 40px; border-bottom: 1px solid rgba(255,255,255,0.07);
  }
  .mp-footer-brand-logo { display: flex; align-items: center; gap: 9px; margin-bottom: 14px; }
  .mp-footer-brand-img  { width: 24px; height: 24px; border-radius: 6px; object-fit: cover; }
  .mp-footer-brand-name { font-family: var(--font-display); font-size: 16px; font-weight: 700; color: #fff; letter-spacing: -0.03em; }
  .mp-footer-brand-desc { font-size: 13px; color: rgba(255,255,255,0.35); line-height: 1.65; max-width: 240px; }
  .mp-footer-col-title  { font-size: 11px; font-weight: 700; color: rgba(255,255,255,0.5); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 16px; }
  .mp-footer-link { display: block; font-size: 13px; color: rgba(255,255,255,0.35); text-decoration: none; margin-bottom: 10px; transition: color 0.2s; }
  .mp-footer-link:hover { color: rgba(255,255,255,0.7); }
  .mp-footer-bottom { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
  .mp-footer-legal { font-size: 12px; color: rgba(255,255,255,0.22); }
  .mp-footer-legal-links { display: flex; gap: 20px; }
  .mp-footer-legal-link { font-size: 12px; color: rgba(255,255,255,0.25); text-decoration: none; transition: color 0.2s; }
  .mp-footer-legal-link:hover { color: rgba(255,255,255,0.5); }

  @media(max-width:1024px){ .mp-footer-top { grid-template-columns: 1fr 1fr; } }
  @media(max-width:640px){  .mp-footer-top { grid-template-columns: 1fr; } .mp-footer-bottom { flex-direction: column; align-items: flex-start; } }

  /* ── FADE-IN ANIMATION ── */
  @keyframes mp-fade-up { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: none; } }
  .mp-fade { animation: mp-fade-up 0.65s cubic-bezier(0.22,1,0.36,1) both; }
  .mp-fade-1 { animation-delay: 0ms; }
  .mp-fade-2 { animation-delay: 80ms; }
  .mp-fade-3 { animation-delay: 160ms; }
  .mp-fade-4 { animation-delay: 240ms; }
`;

// ─── Shared Nav ───────────────────────────────────────────────────────────────
const NAV_LINKS = [
  { href: "/",            label: "Product"     },
  { href: "/integrations",label: "Integrations"},
  { href: "/changelog",   label: "Changelog"   },
  { href: "/about",       label: "About"       },
  { href: "/blog",        label: "Blog"        },
];

function Nav({ active = "" }: { active?: string }) {
  return (
    <nav className="mp-nav">
      <div className="mp-nav-inner">
        <Link to="/" className="mp-nav-brand">
          <img src="/fixsense_icon_logo (2).png" alt="Fixsense" className="mp-nav-logo" />
          <span className="mp-nav-name">Fixsense</span>
        </Link>
        <div className="mp-nav-links">
          {NAV_LINKS.map(l => (
            <Link key={l.href} to={l.href}
              className={`mp-nav-link ${active === l.label ? "mp-nav-link--active" : ""}`}>
              {l.label}
            </Link>
          ))}
        </div>
        <div className="mp-nav-actions">
          <Link to="/login" className="mp-btn-ghost">Sign in</Link>
          <Link to="/login" className="mp-btn-primary">Start Free Trial →</Link>
        </div>
      </div>
    </nav>
  );
}

// ─── Shared Footer ────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer className="mp-footer">
      <div className="mp-footer-inner">
        <div className="mp-footer-top">
          <div>
            <div className="mp-footer-brand-logo">
              <img src="/fixsense_icon_logo (2).png" alt="Fixsense" className="mp-footer-brand-img" />
              <span className="mp-footer-brand-name">Fixsense</span>
            </div>
            <p className="mp-footer-brand-desc">AI-powered sales call intelligence for modern revenue teams.</p>
          </div>
          <div>
            <div className="mp-footer-col-title">Product</div>
            {[["/#features","Features"],["/#pricing","Pricing"],["/integrations","Integrations"],["/changelog","Changelog"]].map(([h,l])=>(
              <Link key={h} to={h} className="mp-footer-link">{l}</Link>
            ))}
          </div>
          <div>
            <div className="mp-footer-col-title">Company</div>
            {[["/about","About"],["/blog","Blog"],["/careers","Careers"],["/press","Press"]].map(([h,l])=>(
              <Link key={h} to={h} className="mp-footer-link">{l}</Link>
            ))}
          </div>
          <div>
            <div className="mp-footer-col-title">Legal</div>
            {[["/privacy","Privacy Policy"],["/terms","Terms of Service"],["/security","Security"],["/contact","Contact"]].map(([h,l])=>(
              <Link key={h} to={h} className="mp-footer-link">{l}</Link>
            ))}
          </div>
        </div>
        <div className="mp-footer-bottom">
          <span className="mp-footer-legal">© {new Date().getFullYear()} Fixsense, Inc. All rights reserved.</span>
          <div className="mp-footer-legal-links">
            <Link to="/privacy" className="mp-footer-legal-link">Privacy</Link>
            <Link to="/terms"   className="mp-footer-legal-link">Terms</Link>
            <Link to="/security"className="mp-footer-legal-link">Security</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  INTEGRATIONS PAGE
// ─────────────────────────────────────────────────────────────────────────────
const INTEGRATIONS = [
  { icon: "🎥", name: "Zoom", category: "Meetings", desc: "Auto-join as a silent bot. Record, transcribe, and analyze every Zoom call with zero friction.", badge: "Popular", badgeType: "mp-badge--green" },
  { icon: "📹", name: "Google Meet", category: "Meetings", desc: "Seamless Google Meet integration. Works with Google Workspace and personal accounts.", badge: "Popular", badgeType: "mp-badge--green" },
  { icon: "🟦", name: "Microsoft Teams", category: "Meetings", desc: "Full Teams support with enterprise SSO and compliance-mode recording.", badge: "", badgeType: "" },
  { icon: "☁️", name: "Salesforce", category: "CRM", desc: "Auto-create activities, log call scores, and push action items to Salesforce after every call.", badge: "Popular", badgeType: "mp-badge--green" },
  { icon: "🔶", name: "HubSpot", category: "CRM", desc: "Sync summaries, deals, and contact notes to HubSpot with one click. No copy-paste ever again.", badge: "Popular", badgeType: "mp-badge--green" },
  { icon: "💬", name: "Slack", category: "Notifications", desc: "Post call summaries and action items to any Slack channel the moment a call ends.", badge: "", badgeType: "" },
  { icon: "✅", name: "Asana", category: "Tasks", desc: "Turn action items from calls into Asana tasks automatically — assigned to the right rep.", badge: "New", badgeType: "mp-badge--orange" },
  { icon: "🗂️", name: "Notion", category: "Notes", desc: "Push call transcripts and summaries to Notion pages. Keep your wiki updated effortlessly.", badge: "New", badgeType: "mp-badge--orange" },
  { icon: "📧", name: "Gmail", category: "Email", desc: "Draft follow-up emails using AI summaries. Send them directly from Fixsense to your prospect.", badge: "", badgeType: "" },
  { icon: "📊", name: "Google Sheets", category: "Analytics", desc: "Export call analytics, scores, and rep leaderboards to Google Sheets for custom reporting.", badge: "", badgeType: "" },
  { icon: "🔗", name: "Zapier", category: "Automation", desc: "Connect Fixsense to 6,000+ apps via Zapier. Build custom workflows without code.", badge: "", badgeType: "" },
  { icon: "⚡", name: "Webhooks / API", category: "Developer", desc: "Full REST API and webhooks. Build custom integrations and automate anything.", badge: "", badgeType: "" },
];

const INT_CATEGORIES = ["All","Meetings","CRM","Notifications","Tasks","Notes","Email","Analytics","Developer","Automation"];

const intStyles = `
  ${BASE_CSS}
  .int-filter-bar { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 40px; }
  .int-filter-btn {
    padding: 7px 18px; border-radius: 20px; border: 1.5px solid var(--border);
    font-size: 13px; font-weight: 600; background: #fff; color: var(--muted);
    cursor: pointer; font-family: var(--font); transition: all 0.15s;
  }
  .int-filter-btn:hover { border-color: var(--blue); color: var(--blue); }
  .int-filter-btn--active { background: var(--blue); color: #fff; border-color: var(--blue); }
  .int-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 16px; }
  @media(max-width:900px){ .int-grid { grid-template-columns: repeat(2,1fr); } }
  @media(max-width:560px){ .int-grid { grid-template-columns: 1fr; } }
  .int-card {
    background: #fff; border: 1.5px solid var(--border); border-radius: 16px; padding: 26px;
    transition: border-color 0.2s, box-shadow 0.2s, transform 0.2s;
    display: flex; flex-direction: column; gap: 10px;
  }
  .int-card:hover { border-color: #bfdbfe; box-shadow: 0 8px 32px var(--blue-glow); transform: translateY(-2px); }
  .int-card-top  { display: flex; align-items: center; justify-content: space-between; }
  .int-card-icon { font-size: 32px; }
  .int-card-cat  { font-size: 11px; font-weight: 600; color: var(--muted-2); text-transform: uppercase; letter-spacing: 0.08em; }
  .int-card-name { font-family: var(--font-display); font-size: 18px; font-weight: 800; color: var(--ink); letter-spacing: -0.03em; }
  .int-card-desc { font-size: 13.5px; color: var(--muted); line-height: 1.65; flex: 1; }
  .int-card-link { font-size: 13px; font-weight: 600; color: var(--blue); text-decoration: none; margin-top: auto; }
  .int-card-link:hover { text-decoration: underline; }

  .int-cta-band {
    background: linear-gradient(135deg, var(--ink) 0%, var(--ink-2) 100%);
    border-radius: 20px; padding: 56px 48px; display: flex;
    align-items: center; justify-content: space-between; gap: 32px; flex-wrap: wrap;
    position: relative; overflow: hidden;
  }
  .int-cta-glow {
    position: absolute; top: -60px; right: -60px; width: 240px; height: 240px;
    border-radius: 50%; background: radial-gradient(circle, rgba(37,99,235,0.3) 0%, transparent 70%);
    pointer-events: none;
  }
  .int-cta-title { font-family: var(--font-display); font-size: 32px; font-weight: 800; color: #fff; letter-spacing: -0.04em; line-height: 1.1; }
  .int-cta-sub { font-size: 15px; color: rgba(255,255,255,0.45); margin-top: 8px; }
  .int-cta-btn {
    display: inline-flex; align-items: center; gap: 8px;
    background: var(--blue); color: #fff; border: none; border-radius: 10px;
    padding: 14px 28px; font-size: 15px; font-weight: 600; font-family: var(--font);
    cursor: pointer; text-decoration: none; transition: all 0.2s; white-space: nowrap;
    box-shadow: 0 4px 16px var(--blue-glow);
  }
  .int-cta-btn:hover { background: var(--blue-2); transform: translateY(-1px); }
`;

export function IntegrationsPage() {
  const [cat, setCat] = useState("All");
  const filtered = cat === "All" ? INTEGRATIONS : INTEGRATIONS.filter(i => i.category === cat);

  return (
    <div className="mp">
      <style>{intStyles}</style>
      <Nav active="Integrations" />

      <div className="mp-hero">
        <div className="mp-hero-pattern" />
        <div className="mp-hero-inner">
          <div className="mp-kicker mp-fade mp-fade-1"><div className="mp-kicker-dot" />Integrations</div>
          <h1 className="mp-h1 mp-fade mp-fade-2">Connect your entire<br /><span className="blue">sales stack.</span></h1>
          <p className="mp-hero-sub mp-fade mp-fade-3">Fixsense plugs into the tools your team already uses — meetings, CRM, email, Slack, and more. Zero disruption to your workflow.</p>
          <div className="mp-hero-meta mp-fade mp-fade-4">
            <div className="mp-hero-meta-item"><div className="mp-hero-meta-dot" />12 integrations live</div>
            <div className="mp-hero-meta-item">5-min setup</div>
            <div className="mp-hero-meta-item">No code required</div>
          </div>
        </div>
      </div>

      <section className="mp-section">
        <div className="mp-section-inner">
          <div className="int-filter-bar">
            {INT_CATEGORIES.map(c => (
              <button key={c} className={`int-filter-btn ${cat===c?"int-filter-btn--active":""}`} onClick={()=>setCat(c)}>{c}</button>
            ))}
          </div>
          <div className="int-grid">
            {filtered.map((intg,i) => (
              <div key={intg.name} className="int-card mp-fade" style={{animationDelay:`${i*40}ms`}}>
                <div className="int-card-top">
                  <div className="int-card-icon">{intg.icon}</div>
                  {intg.badge && <span className={`mp-badge ${intg.badgeType}`}>{intg.badge}</span>}
                </div>
                <div className="int-card-cat">{intg.category}</div>
                <div className="int-card-name">{intg.name}</div>
                <div className="int-card-desc">{intg.desc}</div>
                <a href="#" className="int-card-link">Learn more →</a>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mp-section mp-section--alt">
        <div className="mp-section-inner">
          <div className="int-cta-band">
            <div className="int-cta-glow" />
            <div style={{position:"relative",zIndex:1}}>
              <div className="int-cta-title">Don't see your tool?</div>
              <div className="int-cta-sub">Request an integration or build your own via our REST API.</div>
            </div>
            <Link to="/contact" className="int-cta-btn" style={{position:"relative",zIndex:1}}>Request Integration →</Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  CHANGELOG PAGE
// ─────────────────────────────────────────────────────────────────────────────
const CHANGELOG = [
  {
    version: "v2.4.0", date: "March 2026", badge: "Latest", badgeType: "mp-badge--green",
    title: "Asana & Notion Integrations",
    summary: "Turn action items from any call into Asana tasks automatically. Push full transcripts and summaries to Notion pages with one click.",
    changes: [
      { type: "new", text: "Asana integration — auto-create tasks from call action items" },
      { type: "new", text: "Notion integration — push transcripts and summaries to any page" },
      { type: "new", text: "Gmail draft mode — compose follow-up emails using AI summaries" },
      { type: "improved", text: "Objection detection accuracy improved by 18% on discovery calls" },
      { type: "improved", text: "Dashboard load time reduced by 40% across all plan tiers" },
      { type: "fixed", text: "Fixed transcript timestamps drifting on calls longer than 90 minutes" },
    ],
  },
  {
    version: "v2.3.0", date: "February 2026", badge: "", badgeType: "",
    title: "Live Call Mode & Real-Time Insights",
    summary: "See objections, buying signals, and sentiment scores in real time while your call is happening — not after.",
    changes: [
      { type: "new", text: "Live call dashboard with real-time transcript streaming" },
      { type: "new", text: "Real-time objection and buying-signal detection" },
      { type: "new", text: "Live talk-ratio meter and engagement score" },
      { type: "improved", text: "Speaker identification now works with 4+ participants" },
      { type: "fixed", text: "Fixed Zoom bot failing to join calls with waiting rooms enabled" },
    ],
  },
  {
    version: "v2.2.0", date: "January 2026", badge: "", badgeType: "",
    title: "Team Analytics Dashboard",
    summary: "Managers now get a full bird's-eye view of team performance without sitting on every call.",
    changes: [
      { type: "new", text: "Team leaderboard — rank reps by call score, talk ratio, and close rate" },
      { type: "new", text: "Manager digest emails — weekly summary of team performance" },
      { type: "new", text: "Rep comparison view — benchmark any two reps side by side" },
      { type: "improved", text: "Coaching insights now surfaced at team level, not just per-call" },
      { type: "improved", text: "Billing dashboard redesign with clearer usage tracking" },
    ],
  },
  {
    version: "v2.1.0", date: "December 2025", badge: "", badgeType: "",
    title: "HubSpot CRM Sync",
    summary: "Deep HubSpot integration — auto-log call activities, sync contact notes, and update deal stages without leaving Fixsense.",
    changes: [
      { type: "new", text: "HubSpot integration — sync summaries, scores, and action items" },
      { type: "new", text: "Deal stage auto-update based on call outcome signals" },
      { type: "improved", text: "Salesforce sync reliability improved — reduced failed syncs by 94%" },
      { type: "fixed", text: "Fixed action items not saving when call ended abruptly" },
    ],
  },
  {
    version: "v2.0.0", date: "November 2025", badge: "", badgeType: "",
    title: "Fixsense 2.0 — Rebuilt from the ground up",
    summary: "Completely redesigned UI, faster AI processing pipeline, and a new pricing structure that scales with your team.",
    changes: [
      { type: "new", text: "Completely rebuilt UI — faster, cleaner, better organized" },
      { type: "new", text: "New AI pipeline — 3× faster transcript generation" },
      { type: "new", text: "Growth and Scale plans with team seats and unlimited meetings" },
      { type: "improved", text: "Transcription accuracy improved to 99% across all accents" },
      { type: "improved", text: "Mobile-responsive dashboard for reviewing calls on the go" },
    ],
  },
];

const changelogStyles = `
  ${BASE_CSS}
  .cl-layout { display: grid; grid-template-columns: 200px 1fr; gap: 56px; align-items: start; }
  @media(max-width:840px){ .cl-layout { grid-template-columns: 1fr; } .cl-toc { display: none; } }
  .cl-toc { position: sticky; top: 84px; }
  .cl-toc-label { font-size: 10px; font-weight: 700; color: var(--muted-2); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 14px; }
  .cl-toc-link {
    display: block; padding: 7px 10px; border-radius: 8px; border-left: 2.5px solid transparent;
    font-size: 12.5px; font-weight: 500; color: var(--muted); text-decoration: none; margin-bottom: 2px; transition: all 0.15s;
  }
  .cl-toc-link:hover { color: var(--ink); background: var(--bg-3); }
  .cl-toc-link--active { color: var(--blue); background: var(--blue-light); border-left-color: var(--blue); font-weight: 600; }
  .cl-entry { padding-bottom: 56px; border-bottom: 1.5px solid var(--border); margin-bottom: 56px; scroll-margin-top: 88px; }
  .cl-entry:last-child { border-bottom: none; margin-bottom: 0; }
  .cl-entry-top { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; }
  .cl-version { font-family: var(--font-display); font-size: 14px; font-weight: 800; color: var(--ink); letter-spacing: -0.02em; }
  .cl-date { font-size: 12px; color: var(--muted-2); font-weight: 500; }
  .cl-entry-title { font-family: var(--font-display); font-size: 24px; font-weight: 800; color: var(--ink); letter-spacing: -0.04em; margin-bottom: 10px; }
  .cl-entry-summary { font-size: 14.5px; color: var(--muted); line-height: 1.75; margin-bottom: 24px; }
  .cl-changes { display: flex; flex-direction: column; gap: 10px; }
  .cl-change { display: flex; align-items: flex-start; gap: 10px; }
  .cl-change-tag {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 3px 10px; border-radius: 20px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em;
    flex-shrink: 0; margin-top: 1px; white-space: nowrap;
  }
  .cl-tag-new      { background: rgba(16,185,129,0.1);  color: #059669; }
  .cl-tag-improved { background: rgba(37,99,235,0.08);  color: var(--blue); }
  .cl-tag-fixed    { background: rgba(245,158,11,0.1);  color: #d97706; }
  .cl-change-text  { font-size: 14px; color: var(--ink-2); line-height: 1.6; }

  .cl-subscribe {
    background: linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%);
    border: 1px solid #bfdbfe; border-radius: 14px; padding: 24px 28px;
    display: flex; align-items: center; justify-content: space-between; gap: 20px; flex-wrap: wrap;
    margin-bottom: 48px;
  }
  .cl-subscribe-text { font-size: 14px; font-weight: 600; color: var(--ink-2); }
  .cl-subscribe-sub  { font-size: 13px; color: var(--muted); margin-top: 3px; }
  .cl-subscribe-form { display: flex; gap: 8px; flex-wrap: wrap; }
  .cl-input {
    background: #fff; border: 1.5px solid var(--border); border-radius: 8px;
    padding: 9px 14px; font-size: 13px; font-family: var(--font); color: var(--ink);
    outline: none; transition: border-color 0.15s, box-shadow 0.15s; min-width: 200px;
  }
  .cl-input:focus { border-color: var(--blue); box-shadow: 0 0 0 3px var(--blue-light); }
  .cl-input::placeholder { color: var(--muted-2); }
  .cl-subscribe-btn {
    background: var(--blue); color: #fff; border: none; border-radius: 8px;
    padding: 9px 18px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: var(--font); white-space: nowrap;
    transition: background 0.15s;
  }
  .cl-subscribe-btn:hover { background: var(--blue-2); }
`;

export function ChangelogPage() {
  const [activeVersion, setActiveVersion] = useState(CHANGELOG[0].version);
  const [email, setEmail] = useState("");
  const [subscribed, setSubscribed] = useState(false);

  useEffect(() => {
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) setActiveVersion(e.target.id); });
    }, { rootMargin: "-20% 0px -70% 0px" });
    CHANGELOG.forEach(c => { const el = document.getElementById(c.version); if (el) obs.observe(el); });
    return () => obs.disconnect();
  }, []);

  const tagClass = (type: string) => `cl-change-tag cl-tag-${type}`;

  return (
    <div className="mp">
      <style>{changelogStyles}</style>
      <Nav active="Changelog" />

      <div className="mp-hero">
        <div className="mp-hero-pattern" />
        <div className="mp-hero-inner">
          <div className="mp-kicker mp-fade mp-fade-1"><div className="mp-kicker-dot" />Changelog</div>
          <h1 className="mp-h1 mp-fade mp-fade-2">What's new in<br /><span className="blue">Fixsense.</span></h1>
          <p className="mp-hero-sub mp-fade mp-fade-3">Every update, improvement, and fix — in one place. We ship fast and tell you about it.</p>
          <div className="mp-hero-meta mp-fade mp-fade-4">
            <div className="mp-hero-meta-item"><div className="mp-hero-meta-dot" />v2.4.0 is live</div>
            <div className="mp-hero-meta-item">Updated March 2026</div>
          </div>
        </div>
      </div>

      <section className="mp-section">
        <div className="mp-section-inner">
          <div className="cl-subscribe">
            <div>
              <div className="cl-subscribe-text">Stay up to date</div>
              <div className="cl-subscribe-sub">Get an email whenever we ship something new.</div>
            </div>
            {subscribed ? (
              <span className="mp-badge mp-badge--green">✓ Subscribed!</span>
            ) : (
              <div className="cl-subscribe-form">
                <input className="cl-input" type="email" placeholder="your@email.com" value={email} onChange={e=>setEmail(e.target.value)} />
                <button className="cl-subscribe-btn" onClick={()=>setSubscribed(true)}>Subscribe</button>
              </div>
            )}
          </div>

          <div className="cl-layout">
            <aside className="cl-toc">
              <div className="cl-toc-label">Versions</div>
              {CHANGELOG.map(c => (
                <a key={c.version} href={`#${c.version}`} className={`cl-toc-link ${activeVersion===c.version?"cl-toc-link--active":""}`}>
                  {c.version}
                </a>
              ))}
            </aside>
            <div>
              {CHANGELOG.map(entry => (
                <div key={entry.version} id={entry.version} className="cl-entry">
                  <div className="cl-entry-top">
                    <div className="cl-version">{entry.version}</div>
                    {entry.badge && <span className={`mp-badge ${entry.badgeType}`}>{entry.badge}</span>}
                    <div className="cl-date">{entry.date}</div>
                  </div>
                  <div className="cl-entry-title">{entry.title}</div>
                  <div className="cl-entry-summary">{entry.summary}</div>
                  <div className="cl-changes">
                    {entry.changes.map((ch, i) => (
                      <div key={i} className="cl-change">
                        <span className={tagClass(ch.type)}>{ch.type}</span>
                        <div className="cl-change-text">{ch.text}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  ABOUT PAGE
// ─────────────────────────────────────────────────────────────────────────────
const TEAM = [
  { name: "Chukwuemeka Osei", role: "Co-founder & CEO", bio: "Former VP of Sales at Vantex. Built and scaled 3 sales orgs from 0 to $20M ARR. Obsessed with why good reps lose deals.", initials: "CO" },
  { name: "Amara Diallo", role: "Co-founder & CTO", bio: "Built ML pipelines at Google and Andela. PhD in NLP from University of Lagos. Loves hard problems in speech recognition.", initials: "AD" },
  { name: "Seun Adebayo", role: "Head of Product", bio: "Product at Paystack and Flutterwave. Believes great products solve one problem better than anyone thought possible.", initials: "SA" },
  { name: "Priscilla Edet", role: "Head of Sales", bio: "Closed her first enterprise deal at 24. Former SDR who became VP in 3 years. She coaches the reps who use the product she loves.", initials: "PE" },
  { name: "Babatunde Lawal", role: "Lead Engineer", bio: "Full-stack at PiggyVest. Writes clean code, ships fast, and makes fun of his own bugs in PRs. Typescript evangelist.", initials: "BL" },
  { name: "Ifeoma Nwosu", role: "AI / ML Engineer", bio: "Fine-tuned LLMs before it was cool. Researches better ways to detect intent and sentiment in African-accented speech.", initials: "IN" },
];

const VALUES = [
  { icon: "🎯", title: "Obsess over the problem", desc: "We care more about why deals are lost than how our dashboard looks. The product exists to solve a real pain." },
  { icon: "🔍", title: "Be radically transparent", desc: "With customers, with each other, and about what the data says — even when it's uncomfortable." },
  { icon: "⚡", title: "Ship fast, learn faster", desc: "We prefer a working feature on Friday to a perfect one next quarter. Speed is how we respect our customers' time." },
  { icon: "🌍", title: "Build for Africa and beyond", desc: "We're proud to be building a world-class product from Benin City. What we ship here should work for teams everywhere." },
];

const aboutStyles = `
  ${BASE_CSS}
  .about-mission {
    background: linear-gradient(135deg, var(--ink) 0%, var(--ink-2) 100%);
    border-radius: 24px; padding: 72px 64px; position: relative; overflow: hidden;
  }
  .about-mission-glow {
    position: absolute; bottom: -80px; right: -80px; width: 300px; height: 300px;
    border-radius: 50%; background: radial-gradient(circle, rgba(37,99,235,0.25) 0%, transparent 70%);
    pointer-events: none;
  }
  .about-mission-label { font-size: 12px; font-weight: 700; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 18px; }
  .about-mission-quote { font-family: var(--font-display); font-size: clamp(22px,3.5vw,38px); font-weight: 800; color: #fff; letter-spacing: -0.04em; line-height: 1.15; max-width: 720px; }
  .about-mission-quote .blue { color: #93c5fd; }
  .about-mission-attr { font-size: 14px; color: rgba(255,255,255,0.35); margin-top: 24px; }
  .about-stats-row { display: grid; grid-template-columns: repeat(4,1fr); gap: 1px; background: var(--border); border-radius: 14px; overflow: hidden; border: 1.5px solid var(--border); }
  .about-stat-card { background: var(--bg-2); padding: 32px 24px; }
  .about-stat-num  { font-family: var(--font-display); font-size: 42px; font-weight: 800; color: var(--blue); letter-spacing: -0.04em; line-height: 1; margin-bottom: 8px; }
  .about-stat-label { font-size: 13px; color: var(--muted); }
  @media(max-width:768px){ .about-stats-row { grid-template-columns: 1fr 1fr; } }
  @media(max-width:480px){ .about-stats-row { grid-template-columns: 1fr; } }
  .about-values-grid { display: grid; grid-template-columns: repeat(2,1fr); gap: 16px; }
  @media(max-width:600px){ .about-values-grid { grid-template-columns: 1fr; } }
  .about-team-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 16px; }
  @media(max-width:900px){ .about-team-grid { grid-template-columns: repeat(2,1fr); } }
  @media(max-width:560px){ .about-team-grid { grid-template-columns: 1fr; } }
  .about-team-card {
    background: #fff; border: 1.5px solid var(--border); border-radius: 16px; padding: 28px;
    transition: border-color 0.2s, box-shadow 0.2s;
  }
  .about-team-card:hover { border-color: #bfdbfe; box-shadow: 0 8px 32px var(--blue-glow); }
  .about-team-av {
    width: 52px; height: 52px; border-radius: 50%; margin-bottom: 14px;
    background: linear-gradient(135deg, var(--ink-2), var(--blue));
    display: flex; align-items: center; justify-content: center;
    font-size: 16px; font-weight: 700; color: #fff; letter-spacing: -0.02em;
  }
  .about-team-name { font-family: var(--font-display); font-size: 16px; font-weight: 800; color: var(--ink); letter-spacing: -0.02em; margin-bottom: 4px; }
  .about-team-role { font-size: 12px; font-weight: 600; color: var(--blue); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 10px; }
  .about-team-bio  { font-size: 13px; color: var(--muted); line-height: 1.65; }
  .about-origin { display: grid; grid-template-columns: 1fr 1fr; gap: 64px; align-items: center; }
  @media(max-width:768px){ .about-origin { grid-template-columns: 1fr; gap: 32px; } }
  .about-origin-visual {
    background: linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%);
    border: 1.5px solid #bfdbfe; border-radius: 20px; padding: 48px 36px;
    text-align: center;
  }
  .about-origin-flag { font-size: 64px; margin-bottom: 16px; }
  .about-origin-city { font-family: var(--font-display); font-size: 28px; font-weight: 800; color: var(--ink); letter-spacing: -0.04em; }
  .about-origin-sub  { font-size: 14px; color: var(--muted); margin-top: 6px; }
  .about-mission-wrap { margin-bottom: 72px; }
`;

export function AboutPage() {
  return (
    <div className="mp">
      <style>{aboutStyles}</style>
      <Nav active="About" />

      <div className="mp-hero">
        <div className="mp-hero-pattern" />
        <div className="mp-hero-inner">
          <div className="mp-kicker mp-fade mp-fade-1"><div className="mp-kicker-dot" />About Us</div>
          <h1 className="mp-h1 mp-fade mp-fade-2">We're on a mission to<br /><span className="blue">fix sales forever.</span></h1>
          <p className="mp-hero-sub mp-fade mp-fade-3">Fixsense was born from a frustration: too many great reps losing deals they shouldn't — and no one knowing why. We're changing that.</p>
          <div className="mp-hero-meta mp-fade mp-fade-4">
            <div className="mp-hero-meta-item"><div className="mp-hero-meta-dot" />Founded 2024</div>
            <div className="mp-hero-meta-item">Benin City, Nigeria</div>
            <div className="mp-hero-meta-item">6 people, global customers</div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <section className="mp-section">
        <div className="mp-section-inner">
          <div className="about-stats-row" style={{marginBottom:80}}>
            {[
              ["10k+","Sales meetings analyzed"],
              ["30%","Average increase in close rate"],
              ["99%","Transcription accuracy"],
              ["&lt;5 min","Average setup time"],
            ].map(([n,l])=>(
              <div key={l} className="about-stat-card">
                <div className="about-stat-num" dangerouslySetInnerHTML={{__html:n}} />
                <div className="about-stat-label">{l}</div>
              </div>
            ))}
          </div>

          {/* Mission */}
          <div className="about-mission-wrap">
            <div className="about-mission">
              <div className="about-mission-glow" />
              <div style={{position:"relative",zIndex:1}}>
                <div className="about-mission-label">Our mission</div>
                <div className="about-mission-quote">
                  "Give every sales rep the same <span className="blue">coaching, clarity, and confidence</span> that only the top 1% get today."
                </div>
                <div className="about-mission-attr">— Chukwuemeka Osei, CEO & Co-founder</div>
              </div>
            </div>
          </div>

          {/* Origin */}
          <div className="about-origin" style={{marginBottom:80}}>
            <div>
              <div className="mp-section-kicker">Our Story</div>
              <div className="mp-section-title" style={{marginBottom:20}}>Built from<br />first-hand pain.</div>
              <p style={{fontSize:15,color:"var(--muted)",lineHeight:1.78,marginBottom:16}}>
                Emeka spent 6 years in sales leadership watching brilliant reps lose deals they had no business losing. The problem was never talent — it was invisible gaps in coaching and feedback.
              </p>
              <p style={{fontSize:15,color:"var(--muted)",lineHeight:1.78,marginBottom:16}}>
                He met Amara at a Lagos tech meetup in 2023. Three months later, they quit their jobs and started building Fixsense from a co-working space in Benin City.
              </p>
              <p style={{fontSize:15,color:"var(--muted)",lineHeight:1.78}}>
                Today, Fixsense helps sales teams across Nigeria, the UK, and the US close more deals — and we're just getting started.
              </p>
            </div>
            <div className="about-origin-visual">
              <div className="about-origin-flag">🇳🇬</div>
              <div className="about-origin-city">Benin City</div>
              <div className="about-origin-sub">Edo State, Nigeria · Est. 2024</div>
            </div>
          </div>

          {/* Values */}
          <div style={{marginBottom:80}}>
            <div className="mp-section-header">
              <div className="mp-section-kicker">Values</div>
              <div className="mp-section-title">How we think and work.</div>
            </div>
            <div className="about-values-grid">
              {VALUES.map((v,i)=>(
                <div key={i} className="mp-card mp-card--white mp-fade" style={{animationDelay:`${i*60}ms`}}>
                  <div className="mp-card-icon">{v.icon}</div>
                  <div className="mp-card-title">{v.title}</div>
                  <div className="mp-card-desc">{v.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Team */}
          <div>
            <div className="mp-section-header">
              <div className="mp-section-kicker">The Team</div>
              <div className="mp-section-title">The people behind the product.</div>
              <div className="mp-section-sub">Small team. Big ambitions. Borderline unhealthy obsession with sales calls.</div>
            </div>
            <div className="about-team-grid">
              {TEAM.map((m,i)=>(
                <div key={i} className="about-team-card mp-fade" style={{animationDelay:`${i*60}ms`}}>
                  <div className="about-team-av">{m.initials}</div>
                  <div className="about-team-name">{m.name}</div>
                  <div className="about-team-role">{m.role}</div>
                  <div className="about-team-bio">{m.bio}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  BLOG PAGE
// ─────────────────────────────────────────────────────────────────────────────
const POSTS = [
  {
    id: "why-talk-ratio-matters",
    category: "Sales Science",
    title: "Why talk ratio is the most underrated metric in sales",
    excerpt: "The data is clear: top-performing reps talk less than you think. We analyzed 10,000 calls to find the exact ratio that closes deals.",
    author: "Chukwuemeka Osei", authorRole: "CEO", initials: "CO",
    date: "March 18, 2026", readTime: "6 min read", featured: true,
  },
  {
    id: "objection-handling",
    category: "Playbooks",
    title: "The 5 objections that kill SaaS deals (and how to handle each)",
    excerpt: "Pricing, timing, competition, budget, and 'let me think about it' — here's the exact framework our top customers use.",
    author: "Priscilla Edet", authorRole: "Head of Sales", initials: "PE",
    date: "March 10, 2026", readTime: "8 min read", featured: false,
  },
  {
    id: "ai-sales-coaching",
    category: "AI & Sales",
    title: "What AI can (and can't) replace in sales coaching",
    excerpt: "AI can surface patterns at scale. It cannot build trust, read body language, or replace a great sales manager. Here's where each belongs.",
    author: "Amara Diallo", authorRole: "CTO", initials: "AD",
    date: "March 3, 2026", readTime: "7 min read", featured: false,
  },
  {
    id: "ramp-time",
    category: "Team Building",
    title: "How to cut new rep ramp time in half without more headcount",
    excerpt: "Ramp time is the hidden tax on every sales hire. Here's the framework 3 of our customers used to go from 90 days to 45.",
    author: "Seun Adebayo", authorRole: "Head of Product", initials: "SA",
    date: "February 24, 2026", readTime: "5 min read", featured: false,
  },
  {
    id: "discovery-calls",
    category: "Playbooks",
    title: "The anatomy of a perfect discovery call",
    excerpt: "We broke down 500 discovery calls that converted versus 500 that didn't. The differences are both obvious and surprising.",
    author: "Priscilla Edet", authorRole: "Head of Sales", initials: "PE",
    date: "February 15, 2026", readTime: "9 min read", featured: false,
  },
  {
    id: "sales-tech-stack",
    category: "Tools",
    title: "The 2026 sales tech stack: what's actually worth it",
    excerpt: "Most sales teams are over-tooled and under-coached. Here's the minimal stack that consistently outperforms the bloated alternative.",
    author: "Chukwuemeka Osei", authorRole: "CEO", initials: "CO",
    date: "February 6, 2026", readTime: "6 min read", featured: false,
  },
];

const BLOG_CATS = ["All","Sales Science","Playbooks","AI & Sales","Team Building","Tools"];

const blogStyles = `
  ${BASE_CSS}
  .blog-cat-bar { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 40px; }
  .blog-cat-btn {
    padding: 7px 18px; border-radius: 20px; border: 1.5px solid var(--border);
    font-size: 13px; font-weight: 600; background: #fff; color: var(--muted);
    cursor: pointer; font-family: var(--font); transition: all 0.15s;
  }
  .blog-cat-btn:hover   { border-color: var(--blue); color: var(--blue); }
  .blog-cat-btn--active { background: var(--blue); color: #fff; border-color: var(--blue); }
  .blog-featured {
    display: grid; grid-template-columns: 1fr 1fr; gap: 32px; align-items: center;
    background: #fff; border: 1.5px solid var(--border); border-radius: 20px; padding: 40px;
    margin-bottom: 40px; transition: border-color 0.2s, box-shadow 0.2s;
  }
  .blog-featured:hover { border-color: #bfdbfe; box-shadow: 0 12px 40px var(--blue-glow); }
  @media(max-width:720px){ .blog-featured { grid-template-columns: 1fr; } }
  .blog-featured-img {
    background: linear-gradient(135deg, #dbeafe 0%, #dcfce7 100%);
    border-radius: 12px; aspect-ratio: 16/9; display: flex; align-items: center; justify-content: center;
    font-size: 56px;
  }
  .blog-featured-kicker { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
  .blog-featured-tag { font-size: 11px; font-weight: 700; color: var(--blue); text-transform: uppercase; letter-spacing: 0.08em; }
  .blog-featured-sep { width: 4px; height: 4px; border-radius: 50%; background: var(--border); }
  .blog-featured-read { font-size: 11px; color: var(--muted-2); font-weight: 500; }
  .blog-featured-title { font-family: var(--font-display); font-size: clamp(20px,3vw,28px); font-weight: 800; color: var(--ink); letter-spacing: -0.04em; line-height: 1.2; margin-bottom: 12px; }
  .blog-featured-excerpt { font-size: 14px; color: var(--muted); line-height: 1.7; margin-bottom: 20px; }
  .blog-featured-author { display: flex; align-items: center; gap: 10px; }
  .blog-av { width: 36px; height: 36px; border-radius: 50%; background: linear-gradient(135deg, var(--ink-2), var(--blue)); display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; color: #fff; flex-shrink: 0; }
  .blog-author-name { font-size: 13px; font-weight: 700; color: var(--ink); }
  .blog-author-meta { font-size: 12px; color: var(--muted); margin-top: 1px; }
  .blog-read-link { font-size: 14px; font-weight: 700; color: var(--blue); text-decoration: none; display: inline-flex; align-items: center; gap: 5px; }
  .blog-read-link:hover { text-decoration: underline; }
  .blog-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 20px; }
  @media(max-width:900px){ .blog-grid { grid-template-columns: repeat(2,1fr); } }
  @media(max-width:560px){ .blog-grid { grid-template-columns: 1fr; } }
  .blog-card {
    background: #fff; border: 1.5px solid var(--border); border-radius: 16px;
    overflow: hidden; transition: border-color 0.2s, box-shadow 0.2s, transform 0.2s;
    display: flex; flex-direction: column;
  }
  .blog-card:hover { border-color: #bfdbfe; box-shadow: 0 8px 32px var(--blue-glow); transform: translateY(-2px); }
  .blog-card-thumb {
    background: linear-gradient(135deg, #f0f6ff 0%, #f0fdf4 100%);
    height: 140px; display: flex; align-items: center; justify-content: center; font-size: 36px;
  }
  .blog-card-body { padding: 22px; display: flex; flex-direction: column; gap: 10px; flex: 1; }
  .blog-card-cat  { font-size: 11px; font-weight: 700; color: var(--blue); text-transform: uppercase; letter-spacing: 0.08em; }
  .blog-card-title { font-family: var(--font-display); font-size: 16px; font-weight: 800; color: var(--ink); letter-spacing: -0.03em; line-height: 1.3; }
  .blog-card-excerpt { font-size: 13px; color: var(--muted); line-height: 1.65; flex: 1; }
  .blog-card-footer { display: flex; align-items: center; justify-content: space-between; margin-top: auto; padding-top: 14px; border-top: 1px solid var(--border); }
  .blog-card-author { display: flex; align-items: center; gap: 8px; }
  .blog-card-av { width: 28px; height: 28px; border-radius: 50%; background: linear-gradient(135deg, var(--ink-2), var(--blue)); display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; color: #fff; }
  .blog-card-name { font-size: 12px; font-weight: 600; color: var(--ink-2); }
  .blog-card-date { font-size: 11px; color: var(--muted-2); }
  .blog-newsletter {
    background: var(--ink); border-radius: 20px; padding: 56px; text-align: center; margin-top: 72px;
    position: relative; overflow: hidden;
  }
  .blog-newsletter-glow {
    position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%);
    width: 400px; height: 200px; border-radius: 50%;
    background: radial-gradient(ellipse, rgba(37,99,235,0.15) 0%, transparent 70%);
    pointer-events: none;
  }
  .blog-newsletter-title { font-family: var(--font-display); font-size: 32px; font-weight: 800; color: #fff; letter-spacing: -0.04em; margin-bottom: 10px; position: relative; z-index: 1; }
  .blog-newsletter-sub { font-size: 15px; color: rgba(255,255,255,0.4); margin-bottom: 28px; position: relative; z-index: 1; }
  .blog-newsletter-form { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; position: relative; z-index: 1; }
  .blog-nl-input {
    background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15);
    border-radius: 10px; padding: 12px 18px; font-size: 14px; font-family: var(--font);
    color: #fff; outline: none; min-width: 260px; transition: border-color 0.15s;
  }
  .blog-nl-input::placeholder { color: rgba(255,255,255,0.3); }
  .blog-nl-input:focus { border-color: rgba(255,255,255,0.35); }
  .blog-nl-btn {
    background: var(--blue); color: #fff; border: none; border-radius: 10px;
    padding: 12px 24px; font-size: 14px; font-weight: 600; cursor: pointer; font-family: var(--font);
    transition: background 0.15s; white-space: nowrap;
  }
  .blog-nl-btn:hover { background: var(--blue-2); }
`;

const POST_ICONS: Record<string, string> = {
  "Sales Science": "📊", "Playbooks": "🎯", "AI & Sales": "🤖",
  "Team Building": "👥", "Tools": "🛠",
};

export function BlogPage() {
  const [cat, setCat] = useState("All");
  const [nlEmail, setNlEmail] = useState("");
  const [nlDone, setNlDone] = useState(false);
  const featured = POSTS.find(p => p.featured)!;
  const rest = POSTS.filter(p => !p.featured);
  const visible = cat === "All" ? rest : rest.filter(p => p.category === cat);

  return (
    <div className="mp">
      <style>{blogStyles}</style>
      <Nav active="Blog" />

      <div className="mp-hero">
        <div className="mp-hero-pattern" />
        <div className="mp-hero-inner">
          <div className="mp-kicker mp-fade mp-fade-1"><div className="mp-kicker-dot" />The Fixsense Blog</div>
          <h1 className="mp-h1 mp-fade mp-fade-2">Sales wisdom,<br /><span className="blue">backed by data.</span></h1>
          <p className="mp-hero-sub mp-fade mp-fade-3">Tactics, research, and honest takes from a team obsessed with why deals are won and lost.</p>
        </div>
      </div>

      <section className="mp-section">
        <div className="mp-section-inner">
          {/* Featured */}
          <a href={`/blog/${featured.id}`} style={{textDecoration:"none",display:"block"}} className="mp-fade mp-fade-1">
            <div className="blog-featured">
              <div className="blog-featured-img">{POST_ICONS[featured.category] || "📝"}</div>
              <div>
                <div className="blog-featured-kicker">
                  <span className="blog-featured-tag">{featured.category}</span>
                  <span className="blog-featured-sep" />
                  <span className="blog-featured-read">{featured.readTime}</span>
                  <span className="mp-badge mp-badge--green" style={{marginLeft:4}}>Featured</span>
                </div>
                <div className="blog-featured-title">{featured.title}</div>
                <div className="blog-featured-excerpt">{featured.excerpt}</div>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
                  <div className="blog-featured-author">
                    <div className="blog-av">{featured.initials}</div>
                    <div>
                      <div className="blog-author-name">{featured.author}</div>
                      <div className="blog-author-meta">{featured.authorRole} · {featured.date}</div>
                    </div>
                  </div>
                  <span className="blog-read-link">Read article →</span>
                </div>
              </div>
            </div>
          </a>

          {/* Filter */}
          <div className="blog-cat-bar">
            {BLOG_CATS.map(c=>(
              <button key={c} className={`blog-cat-btn ${cat===c?"blog-cat-btn--active":""}`} onClick={()=>setCat(c)}>{c}</button>
            ))}
          </div>

          {/* Grid */}
          <div className="blog-grid">
            {visible.map((post,i)=>(
              <a key={post.id} href={`/blog/${post.id}`} className="mp-fade" style={{textDecoration:"none", animationDelay:`${i*60}ms`}}>
                <div className="blog-card">
                  <div className="blog-card-thumb">{POST_ICONS[post.category] || "📝"}</div>
                  <div className="blog-card-body">
                    <div className="blog-card-cat">{post.category}</div>
                    <div className="blog-card-title">{post.title}</div>
                    <div className="blog-card-excerpt">{post.excerpt}</div>
                    <div className="blog-card-footer">
                      <div className="blog-card-author">
                        <div className="blog-card-av">{post.initials}</div>
                        <div className="blog-card-name">{post.author}</div>
                      </div>
                      <div className="blog-card-date">{post.readTime}</div>
                    </div>
                  </div>
                </div>
              </a>
            ))}
          </div>

          {/* Newsletter */}
          <div className="blog-newsletter">
            <div className="blog-newsletter-glow" />
            <div className="blog-newsletter-title">Get the best posts in your inbox</div>
            <div className="blog-newsletter-sub">Weekly sales insights from the Fixsense team. No spam, ever.</div>
            {nlDone ? (
              <span className="mp-badge mp-badge--green" style={{fontSize:14,padding:"10px 20px"}}>✓ You're subscribed!</span>
            ) : (
              <div className="blog-newsletter-form">
                <input className="blog-nl-input" type="email" placeholder="your@email.com" value={nlEmail} onChange={e=>setNlEmail(e.target.value)} />
                <button className="blog-nl-btn" onClick={()=>setNlDone(true)}>Subscribe →</button>
              </div>
            )}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  CAREERS PAGE
// ─────────────────────────────────────────────────────────────────────────────
const JOBS = [
  { id: 1, title: "Senior Full-Stack Engineer", dept: "Engineering", location: "Benin City / Remote", type: "Full-time", level: "Senior" },
  { id: 2, title: "AI / ML Engineer", dept: "Engineering", location: "Remote", type: "Full-time", level: "Senior" },
  { id: 3, title: "Sales Development Representative", dept: "Sales", location: "Benin City", type: "Full-time", level: "Mid" },
  { id: 4, title: "Account Executive", dept: "Sales", location: "Remote (Nigeria/UK)", type: "Full-time", level: "Mid-Senior" },
  { id: 5, title: "Product Designer", dept: "Design", location: "Remote", type: "Full-time", level: "Mid" },
  { id: 6, title: "Head of Customer Success", dept: "Customer Success", location: "Remote", type: "Full-time", level: "Lead" },
];

const PERKS = [
  { icon: "🌍", title: "Remote-first", desc: "Work from anywhere in Africa or beyond. We have team members across 4 countries." },
  { icon: "📈", title: "Equity from day one", desc: "Every Fixsense employee gets meaningful ownership in the company they're helping build." },
  { icon: "🏥", title: "Health coverage", desc: "Full health insurance for you and your dependents, no matter where you're based." },
  { icon: "📚", title: "Learning budget", desc: "₦300,000/year for courses, books, conferences — whatever makes you sharper." },
  { icon: "⏱", title: "Flexible hours", desc: "We care about output, not hours. Work when you're most effective." },
  { icon: "✈️", title: "Team retreats", desc: "Twice-yearly company meetups. One in Nigeria, one wherever the team votes for." },
];

const DEPTS = ["All","Engineering","Sales","Design","Customer Success"];

const careerStyles = `
  ${BASE_CSS}
  .career-dept-bar { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 32px; }
  .career-dept-btn {
    padding: 7px 18px; border-radius: 20px; border: 1.5px solid var(--border);
    font-size: 13px; font-weight: 600; background: #fff; color: var(--muted);
    cursor: pointer; font-family: var(--font); transition: all 0.15s;
  }
  .career-dept-btn:hover   { border-color: var(--blue); color: var(--blue); }
  .career-dept-btn--active { background: var(--blue); color: #fff; border-color: var(--blue); }
  .career-job-list { display: flex; flex-direction: column; gap: 12px; }
  .career-job {
    background: #fff; border: 1.5px solid var(--border); border-radius: 14px; padding: 24px 28px;
    display: flex; align-items: center; justify-content: space-between; gap: 20px; flex-wrap: wrap;
    transition: border-color 0.2s, box-shadow 0.2s; cursor: pointer; text-decoration: none;
  }
  .career-job:hover { border-color: #bfdbfe; box-shadow: 0 6px 24px var(--blue-glow); }
  .career-job-left { display: flex; flex-direction: column; gap: 6px; }
  .career-job-title { font-family: var(--font-display); font-size: 17px; font-weight: 800; color: var(--ink); letter-spacing: -0.03em; }
  .career-job-meta  { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .career-job-dept  { font-size: 12px; font-weight: 600; color: var(--blue); }
  .career-job-sep   { width: 3px; height: 3px; border-radius: 50%; background: var(--muted-2); }
  .career-job-loc   { font-size: 12px; color: var(--muted); }
  .career-job-right { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
  .career-apply-btn {
    display: inline-flex; align-items: center; gap: 6px;
    background: var(--blue-light); color: var(--blue); border-radius: 8px;
    padding: 9px 18px; font-size: 13px; font-weight: 700;
    font-family: var(--font); border: none; cursor: pointer; transition: all 0.15s;
    text-decoration: none;
  }
  .career-apply-btn:hover { background: var(--blue); color: #fff; }
  .career-perks-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 16px; }
  @media(max-width:900px){ .career-perks-grid { grid-template-columns: repeat(2,1fr); } }
  @media(max-width:560px){ .career-perks-grid { grid-template-columns: 1fr; } }
  .career-culture {
    background: linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%);
    border: 1.5px solid #bfdbfe; border-radius: 20px; padding: 56px;
    display: grid; grid-template-columns: 1fr 1fr; gap: 48px; align-items: center;
  }
  @media(max-width:720px){ .career-culture { grid-template-columns: 1fr; padding: 36px; } }
  .career-culture-title { font-family: var(--font-display); font-size: 30px; font-weight: 800; color: var(--ink); letter-spacing: -0.04em; margin-bottom: 14px; }
  .career-culture-desc  { font-size: 15px; color: var(--muted); line-height: 1.75; }
  .career-culture-stats { display: flex; flex-direction: column; gap: 20px; }
  .career-culture-stat  { display: flex; align-items: center; gap: 16px; }
  .career-culture-num   { font-family: var(--font-display); font-size: 36px; font-weight: 800; color: var(--blue); letter-spacing: -0.04em; min-width: 80px; }
  .career-culture-label { font-size: 13px; color: var(--muted); line-height: 1.5; }
  .career-no-role {
    background: var(--bg-2); border: 1.5px dashed var(--border); border-radius: 14px; padding: 40px;
    text-align: center; margin-top: 8px;
  }
  .career-no-role-title { font-family: var(--font-display); font-size: 18px; font-weight: 700; color: var(--ink); margin-bottom: 8px; }
  .career-no-role-sub { font-size: 14px; color: var(--muted); margin-bottom: 18px; }
`;

export function CareersPage() {
  const [dept, setDept] = useState("All");
  const visible = dept === "All" ? JOBS : JOBS.filter(j => j.dept === dept);

  return (
    <div className="mp">
      <style>{careerStyles}</style>
      <Nav />

      <div className="mp-hero">
        <div className="mp-hero-pattern" />
        <div className="mp-hero-inner">
          <div className="mp-kicker mp-fade mp-fade-1"><div className="mp-kicker-dot" />Careers at Fixsense</div>
          <h1 className="mp-h1 mp-fade mp-fade-2">Help us <span className="blue">fix sales</span><br />from the ground up.</h1>
          <p className="mp-hero-sub mp-fade mp-fade-3">We're a small team doing ambitious work. If you're obsessed with solving hard problems and want to build something people genuinely love — let's talk.</p>
          <div className="mp-hero-meta mp-fade mp-fade-4">
            <div className="mp-hero-meta-item"><div className="mp-hero-meta-dot" />{JOBS.length} open roles</div>
            <div className="mp-hero-meta-item">Remote-friendly</div>
            <div className="mp-hero-meta-item">Equity for everyone</div>
          </div>
        </div>
      </div>

      {/* Culture */}
      <section className="mp-section">
        <div className="mp-section-inner">
          <div className="career-culture" style={{marginBottom:80}}>
            <div>
              <div className="mp-section-kicker">Life at Fixsense</div>
              <div className="career-culture-title">Small team. Real ownership. Big impact.</div>
              <div className="career-culture-desc">
                We don't have a ping-pong table or a beer fridge. We have hard problems, fast feedback loops, and a product that real people pay real money to use every day.<br /><br />
                If you want to own your work, ship fast, and see the direct impact of what you build — this is the place.
              </div>
            </div>
            <div className="career-culture-stats">
              {[["6","Full-time team members"],["4","Countries represented"],["100%","Equity for full-time employees"],["2×","Annual team retreats"]].map(([n,l])=>(
                <div key={l} className="career-culture-stat">
                  <div className="career-culture-num">{n}</div>
                  <div className="career-culture-label">{l}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Perks */}
          <div style={{marginBottom:80}}>
            <div className="mp-section-header">
              <div className="mp-section-kicker">Benefits</div>
              <div className="mp-section-title">What we offer</div>
            </div>
            <div className="career-perks-grid">
              {PERKS.map((p,i)=>(
                <div key={i} className="mp-card mp-card--white mp-fade" style={{animationDelay:`${i*60}ms`}}>
                  <div className="mp-card-icon">{p.icon}</div>
                  <div className="mp-card-title">{p.title}</div>
                  <div className="mp-card-desc">{p.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Jobs */}
          <div>
            <div className="mp-section-header">
              <div className="mp-section-kicker">Open Roles</div>
              <div className="mp-section-title">Join the team</div>
            </div>
            <div className="career-dept-bar">
              {DEPTS.map(d=>(
                <button key={d} className={`career-dept-btn ${dept===d?"career-dept-btn--active":""}`} onClick={()=>setDept(d)}>{d}</button>
              ))}
            </div>
            <div className="career-job-list">
              {visible.map((job,i)=>(
                <a key={job.id} href={`/careers/${job.id}`} className="career-job mp-fade" style={{animationDelay:`${i*50}ms`}}>
                  <div className="career-job-left">
                    <div className="career-job-title">{job.title}</div>
                    <div className="career-job-meta">
                      <span className="career-job-dept">{job.dept}</span>
                      <span className="career-job-sep" />
                      <span className="career-job-loc">📍 {job.location}</span>
                      <span className="career-job-sep" />
                      <span className="mp-badge mp-badge--gray">{job.type}</span>
                      <span className="mp-badge">{job.level}</span>
                    </div>
                  </div>
                  <div className="career-job-right">
                    <span className="career-apply-btn">Apply →</span>
                  </div>
                </a>
              ))}
              {visible.length === 0 && (
                <div className="career-no-role">
                  <div className="career-no-role-title">No open roles in {dept} right now</div>
                  <div className="career-no-role-sub">We grow quickly. Drop us your CV and we'll reach out when something fits.</div>
                  <Link to="/contact" className="career-apply-btn" style={{display:"inline-flex"}}>Send open application →</Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  PRESS PAGE
// ─────────────────────────────────────────────────────────────────────────────
const PRESS_COVERAGE = [
  { outlet: "TechCabal", logo: "📰", date: "March 2026", headline: "Fixsense is bringing AI sales coaching to Africa's fastest-growing startups", type: "Feature" },
  { outlet: "Ventureburn", logo: "📰", date: "February 2026", headline: "Nigerian startup Fixsense raises seed funding to scale AI sales platform", type: "Funding" },
  { outlet: "Disrupt Africa", logo: "📰", date: "February 2026", headline: "How Fixsense is helping African sales teams compete on a global stage", type: "Feature" },
  { outlet: "Techpoint Africa", logo: "📰", date: "January 2026", headline: "Fixsense's AI closes the coaching gap for teams without a dedicated sales manager", type: "Product" },
];

const BRAND_ASSETS = [
  { label: "Logo (SVG)", desc: "Primary logo in all colour variants", icon: "🎨" },
  { label: "Logo (PNG)", desc: "High-resolution PNG, transparent bg", icon: "🖼️" },
  { label: "Brand Guidelines", desc: "Typography, colour tokens, usage rules", icon: "📋" },
  { label: "Product Screenshots", desc: "Dashboard, live call view, summary screen", icon: "🖥️" },
  { label: "Founder Photos", desc: "High-res headshots of the founding team", icon: "👥" },
  { label: "Press Kit (ZIP)", desc: "Everything above in a single download", icon: "📦" },
];

const FACTS = [
  ["2024", "Year founded"],
  ["Benin City, Nigeria", "Headquarters"],
  ["$0 → $X ARR", "Revenue trajectory (ask us!)"],
  ["6", "Full-time employees"],
  ["10,000+", "Sales meetings analyzed"],
  ["12", "Active integrations"],
  ["99%", "Transcription accuracy"],
  ["30%", "Avg. increase in close rate"],
];

const pressStyles = `
  ${BASE_CSS}
  .press-coverage-list { display: flex; flex-direction: column; gap: 12px; }
  .press-coverage-item {
    display: flex; align-items: center; justify-content: space-between; gap: 20px; flex-wrap: wrap;
    background: #fff; border: 1.5px solid var(--border); border-radius: 14px; padding: 22px 28px;
    transition: border-color 0.2s, box-shadow 0.2s;
  }
  .press-coverage-item:hover { border-color: #bfdbfe; box-shadow: 0 6px 24px var(--blue-glow); }
  .press-outlet-row { display: flex; align-items: center; gap: 14px; }
  .press-outlet-name { font-family: var(--font-display); font-size: 15px; font-weight: 800; color: var(--ink); letter-spacing: -0.02em; }
  .press-headline { font-size: 14px; color: var(--ink-2); line-height: 1.5; margin-top: 5px; max-width: 540px; }
  .press-meta { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
  .press-read { font-size: 13px; font-weight: 600; color: var(--blue); text-decoration: none; white-space: nowrap; }
  .press-read:hover { text-decoration: underline; }
  .press-assets-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 14px; }
  @media(max-width:768px){ .press-assets-grid { grid-template-columns: repeat(2,1fr); } }
  @media(max-width:480px){ .press-assets-grid { grid-template-columns: 1fr; } }
  .press-asset-card {
    background: #fff; border: 1.5px solid var(--border); border-radius: 14px; padding: 22px;
    display: flex; flex-direction: column; gap: 8px; cursor: pointer;
    transition: border-color 0.2s, box-shadow 0.2s, transform 0.2s;
  }
  .press-asset-card:hover { border-color: #bfdbfe; box-shadow: 0 6px 20px var(--blue-glow); transform: translateY(-2px); }
  .press-asset-icon  { font-size: 28px; }
  .press-asset-label { font-family: var(--font-display); font-size: 15px; font-weight: 700; color: var(--ink); letter-spacing: -0.02em; }
  .press-asset-desc  { font-size: 12.5px; color: var(--muted); line-height: 1.55; }
  .press-asset-dl { font-size: 12px; font-weight: 600; color: var(--blue); margin-top: auto; }
  .press-facts-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 1px; background: var(--border); border-radius: 16px; overflow: hidden; border: 1.5px solid var(--border); }
  @media(max-width:768px){ .press-facts-grid { grid-template-columns: repeat(2,1fr); } }
  @media(max-width:480px){ .press-facts-grid { grid-template-columns: 1fr; } }
  .press-fact { background: var(--bg-2); padding: 28px 22px; }
  .press-fact-val { font-family: var(--font-display); font-size: 20px; font-weight: 800; color: var(--ink); letter-spacing: -0.03em; margin-bottom: 5px; }
  .press-fact-label { font-size: 12px; color: var(--muted); line-height: 1.4; }
  .press-contact-band {
    background: linear-gradient(135deg, var(--ink) 0%, var(--ink-2) 100%);
    border-radius: 20px; padding: 56px 48px;
    display: flex; align-items: center; justify-content: space-between; gap: 32px; flex-wrap: wrap;
    position: relative; overflow: hidden; margin-top: 80px;
  }
  .press-contact-glow {
    position: absolute; top: -60px; left: -60px; width: 240px; height: 240px;
    border-radius: 50%; background: radial-gradient(circle, rgba(37,99,235,0.25) 0%, transparent 70%);
    pointer-events: none;
  }
  .press-contact-title { font-family: var(--font-display); font-size: 28px; font-weight: 800; color: #fff; letter-spacing: -0.04em; }
  .press-contact-sub   { font-size: 15px; color: rgba(255,255,255,0.4); margin-top: 8px; }
  .press-contact-btn {
    display: inline-flex; align-items: center; gap: 8px;
    background: var(--blue); color: #fff; border: none; border-radius: 10px;
    padding: 14px 28px; font-size: 15px; font-weight: 600;
    font-family: var(--font); text-decoration: none; cursor: pointer;
    transition: all 0.2s; white-space: nowrap; box-shadow: 0 4px 16px var(--blue-glow);
  }
  .press-contact-btn:hover { background: var(--blue-2); transform: translateY(-1px); }
`;

export function PressPage() {
  return (
    <div className="mp">
      <style>{pressStyles}</style>
      <Nav />

      <div className="mp-hero">
        <div className="mp-hero-pattern" />
        <div className="mp-hero-inner">
          <div className="mp-kicker mp-fade mp-fade-1"><div className="mp-kicker-dot" />Press & Media</div>
          <h1 className="mp-h1 mp-fade mp-fade-2">Built in Africa.<br /><span className="blue">Covered globally.</span></h1>
          <p className="mp-hero-sub mp-fade mp-fade-3">Find brand assets, company facts, and press contacts. For interview requests or press enquiries, we respond within 24 hours.</p>
          <div className="mp-hero-ctas mp-fade mp-fade-4">
            <a href="mailto:press@fixsense.com.ng" className="mp-btn-hero">Contact Press Team →</a>
            <a href="#assets" className="mp-btn-hero-ghost">Download Brand Kit</a>
          </div>
        </div>
      </div>

      <section className="mp-section">
        <div className="mp-section-inner">

          {/* Coverage */}
          <div style={{marginBottom:80}}>
            <div className="mp-section-header">
              <div className="mp-section-kicker">In the news</div>
              <div className="mp-section-title">Fixsense in the press.</div>
            </div>
            <div className="press-coverage-list">
              {PRESS_COVERAGE.map((item,i)=>(
                <div key={i} className="press-coverage-item mp-fade" style={{animationDelay:`${i*60}ms`}}>
                  <div>
                    <div className="press-outlet-row">
                      <span style={{fontSize:20}}>{item.logo}</span>
                      <span className="press-outlet-name">{item.outlet}</span>
                      <span className="mp-badge mp-badge--gray">{item.type}</span>
                    </div>
                    <div className="press-headline">"{item.headline}"</div>
                  </div>
                  <div className="press-meta">
                    <span style={{fontSize:12,color:"var(--muted-2)"}}>{item.date}</span>
                    <a href="#" className="press-read">Read →</a>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Brand Assets */}
          <div id="assets" style={{marginBottom:80}}>
            <div className="mp-section-header">
              <div className="mp-section-kicker">Brand Assets</div>
              <div className="mp-section-title">Everything you need.</div>
              <div className="mp-section-sub">All brand assets are free to use for editorial and press coverage with proper attribution.</div>
            </div>
            <div className="press-assets-grid">
              {BRAND_ASSETS.map((a,i)=>(
                <div key={i} className="press-asset-card mp-fade" style={{animationDelay:`${i*60}ms`}}>
                  <div className="press-asset-icon">{a.icon}</div>
                  <div className="press-asset-label">{a.label}</div>
                  <div className="press-asset-desc">{a.desc}</div>
                  <div className="press-asset-dl">↓ Download</div>
                </div>
              ))}
            </div>
          </div>

          {/* Company Facts */}
          <div style={{marginBottom:80}}>
            <div className="mp-section-header">
              <div className="mp-section-kicker">Fast Facts</div>
              <div className="mp-section-title">Company at a glance.</div>
            </div>
            <div className="press-facts-grid">
              {FACTS.map(([val,label],i)=>(
                <div key={i} className="press-fact">
                  <div className="press-fact-val">{val}</div>
                  <div className="press-fact-label">{label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Press Contact CTA */}
          <div className="press-contact-band">
            <div className="press-contact-glow" />
            <div style={{position:"relative",zIndex:1}}>
              <div className="press-contact-title">Working on a story?</div>
              <div className="press-contact-sub">We make ourselves available for interviews, quotes, and demos. Response time: &lt;24h.</div>
            </div>
            <a href="mailto:press@fixsense.com.ng" className="press-contact-btn" style={{position:"relative",zIndex:1}}>
              Email the Press Team →
            </a>
          </div>

        </div>
      </section>

      <Footer />
    </div>
  );
}
