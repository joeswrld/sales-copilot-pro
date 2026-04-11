/**
 * LegalPages.tsx — Redesigned to match Fixsense dark landing page aesthetic.
 * Privacy, Terms, Security, Contact — all unified with the dark theme.
 */

import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";

// ─── Logo ─────────────────────────────────────────────────────────────────────

function Logo({ size = 28 }: { size?: number }) {
  return (
    <img src="/fixsense_icon_logo (2).png" alt="Fixsense" width={size} height={size}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.24), objectFit: "cover", display: "block", flexShrink: 0 }} />
  );
}

// ─── Shared CSS ───────────────────────────────────────────────────────────────

const sharedCss = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500;600&family=Syne+Mono&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  .lp-legal {
    --bg: #050810; --bg2: #0a0d18; --bg3: #0f1220;
    --card: rgba(255,255,255,0.03); --card-border: rgba(255,255,255,0.07); --card-hover: rgba(255,255,255,0.06);
    --ink: #f0f2f8; --ink2: rgba(240,242,248,0.65); --ink3: rgba(240,242,248,0.38); --ink4: rgba(240,242,248,0.18);
    --cyan: #0ef5d4; --cyan2: rgba(14,245,212,0.15); --cyan3: rgba(14,245,212,0.07);
    --purple: #8b5cf6; --amber: #f59e0b; --green: #10b981; --blue: #3b82f6;
    --font: 'DM Sans', system-ui, sans-serif;
    --fd: 'Syne', system-ui, sans-serif;
    --fm: 'Syne Mono', monospace;
    background: var(--bg); color: var(--ink); font-family: var(--font);
    -webkit-font-smoothing: antialiased; min-height: 100vh; line-height: 1.6; overflow-x: hidden;
  }

  /* NAV */
  .lg-nav { position: fixed; top: 0; left: 0; right: 0; z-index: 100; height: 60px; display: flex; align-items: center; padding: 0 24px; background: rgba(5,8,16,0.92); backdrop-filter: blur(20px); border-bottom: 1px solid var(--card-border); }
  .lg-nav-i { max-width: 1100px; width: 100%; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; }
  .lg-nav-logo { display: flex; align-items: center; gap: 9px; text-decoration: none; }
  .lg-nav-name { font-family: var(--fd); font-size: 15px; font-weight: 700; color: var(--ink); letter-spacing: -0.02em; }
  .lg-nav-links { display: flex; align-items: center; gap: 22px; }
  .lg-nav-link { font-size: 13px; font-weight: 500; color: var(--ink3); text-decoration: none; transition: color 0.2s; }
  .lg-nav-link:hover, .lg-nav-link.act { color: var(--ink); }
  .lg-nav-link.act { color: var(--cyan); }
  .lg-nav-cta { font-size: 13px; font-weight: 600; color: var(--bg); background: var(--cyan); border: none; padding: 7px 18px; border-radius: 8px; font-family: var(--font); cursor: pointer; text-decoration: none; transition: all 0.15s; }
  .lg-nav-cta:hover { opacity: 0.88; }
  @media(max-width:768px){ .lg-nav-links { display: none; } }

  /* HERO BAND */
  .lg-hero { padding: 108px 24px 60px; position: relative; overflow: hidden; }
  .lg-hero-orb { position: absolute; top: -80px; left: 50%; transform: translateX(-50%); width: 600px; height: 400px; background: radial-gradient(ellipse, rgba(14,245,212,0.05) 0%, transparent 65%); pointer-events: none; }
  .lg-hero-inner { max-width: 1100px; margin: 0 auto; }
  .lg-kicker { display: inline-flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 700; color: var(--cyan); text-transform: uppercase; letter-spacing: 0.12em; margin-bottom: 16px; font-family: var(--fm); }
  .lg-kicker-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--green); }
  .lg-h1 { font-family: var(--fd); font-size: clamp(28px,4.5vw,50px); font-weight: 800; letter-spacing: -0.04em; line-height: 1.07; color: var(--ink); margin-bottom: 14px; }
  .lg-h1 .c { color: var(--cyan); }
  .lg-sub { font-size: 16px; color: var(--ink2); line-height: 1.7; max-width: 540px; margin-bottom: 24px; }
  .lg-meta { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  .lg-meta-pill { display: inline-flex; align-items: center; gap: 6px; background: var(--card); border: 1px solid var(--card-border); border-radius: 20px; padding: 5px 14px; font-size: 12px; color: var(--ink3); }
  .lg-meta-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--green); }
  .lg-breadcrumb { display: flex; align-items: center; gap: 7px; margin-bottom: 20px; font-size: 12px; color: var(--ink4); }
  .lg-breadcrumb a { color: var(--ink3); text-decoration: none; transition: color 0.15s; }
  .lg-breadcrumb a:hover { color: var(--ink); }
  .lg-breadcrumb .sep { color: var(--ink4); }
  .lg-breadcrumb .cur { color: var(--cyan); }

  /* LAYOUT */
  .lg-layout { max-width: 1100px; margin: 0 auto; padding: 56px 24px 96px; display: grid; grid-template-columns: 210px 1fr; gap: 52px; align-items: start; }
  @media(max-width:860px){ .lg-layout { grid-template-columns: 1fr; gap: 28px; padding: 36px 20px 72px; } .lg-toc { display: none; } }

  /* TOC */
  .lg-toc { position: sticky; top: 76px; background: var(--bg2); border: 1px solid var(--card-border); border-radius: 14px; padding: 18px 14px; }
  .lg-toc-title { font-size: 9.5px; font-weight: 700; color: var(--ink4); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 12px; padding-left: 6px; font-family: var(--fm); }
  .lg-toc-link { display: block; padding: 6px 9px; border-radius: 7px; border-left: 2px solid transparent; font-size: 12px; font-weight: 500; color: var(--ink3); text-decoration: none; transition: all 0.15s; margin-bottom: 2px; }
  .lg-toc-link:hover { color: var(--ink); background: var(--card); }
  .lg-toc-link.act { color: var(--cyan); background: var(--cyan3); border-left-color: var(--cyan); }

  /* CONTENT */
  .lg-content { min-width: 0; }
  .lg-section { margin-bottom: 48px; scroll-margin-top: 80px; }
  .lg-section h2 { font-family: var(--fd); font-size: 20px; font-weight: 800; letter-spacing: -0.03em; color: var(--ink); margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid var(--card-border); }
  .lg-section h3 { font-family: var(--fd); font-size: 14px; font-weight: 700; color: var(--ink2); margin: 20px 0 8px; letter-spacing: -0.02em; }
  .lg-section p { font-size: 14px; color: var(--ink2); line-height: 1.8; margin-bottom: 14px; }
  .lg-section strong { color: var(--ink); font-weight: 600; }
  .lg-section ul, .lg-section ol { margin: 0 0 16px; padding-left: 0; list-style: none; display: flex; flex-direction: column; gap: 8px; }
  .lg-section li { display: flex; align-items: flex-start; gap: 10px; font-size: 14px; color: var(--ink2); line-height: 1.65; }
  .lg-section ul li::before { content: ''; display: block; width: 5px; height: 5px; border-radius: 50%; background: var(--cyan); flex-shrink: 0; margin-top: 8px; }
  .lg-section ol { counter-reset: li; }
  .lg-section ol li::before { counter-increment: li; content: counter(li); display: flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: 50%; background: var(--cyan3); color: var(--cyan); font-size: 10px; font-weight: 700; flex-shrink: 0; margin-top: 1px; border: 1px solid rgba(14,245,212,.2); }
  .lg-section a { color: var(--cyan); text-decoration: none; }
  .lg-section a:hover { text-decoration: underline; }

  .lg-highlight { background: rgba(14,245,212,.04); border: 1px solid rgba(14,245,212,.15); border-left: 3px solid var(--cyan); border-radius: 0 10px 10px 0; padding: 16px 18px; margin: 16px 0; }
  .lg-highlight p { color: var(--ink); margin: 0; font-size: 14px; }
  .lg-highlight strong { color: var(--cyan); }

  .lg-badge-row { display: flex; flex-wrap: wrap; gap: 8px; margin: 14px 0; }
  .lg-badge { display: inline-flex; align-items: center; gap: 6px; background: var(--card); border: 1px solid var(--card-border); border-radius: 20px; padding: 4px 12px; font-size: 11.5px; color: var(--ink2); }

  code { font-size: 12px; color: var(--cyan); background: var(--cyan3); border-radius: 4px; padding: 1px 6px; font-family: var(--fm); border: 1px solid rgba(14,245,212,.15); }

  /* FOOTER */
  .lg-footer { background: var(--bg2); padding: 40px 24px 28px; border-top: 1px solid var(--card-border); }
  .lg-footer-i { max-width: 1100px; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px; }
  .lg-footer-brand { display: flex; align-items: center; gap: 9px; }
  .lg-footer-name { font-family: var(--fd); font-size: 14px; font-weight: 700; color: var(--ink); letter-spacing: -0.02em; }
  .lg-footer-copy { font-size: 12px; color: var(--ink4); margin-top: 4px; }
  .lg-footer-links { display: flex; gap: 18px; flex-wrap: wrap; }
  .lg-footer-link { font-size: 12px; color: var(--ink3); text-decoration: none; transition: color 0.2s; }
  .lg-footer-link:hover { color: var(--ink); }

  /* CONTACT-SPECIFIC */
  .contact-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 44px; }
  @media(max-width:540px){ .contact-cards { grid-template-columns: 1fr; } }
  .contact-card { background: var(--bg2); border: 1px solid var(--card-border); border-radius: 14px; padding: 22px; transition: border-color 0.2s, transform 0.2s; }
  .contact-card:hover { border-color: rgba(14,245,212,.2); transform: translateY(-2px); }
  .contact-card-icon { font-size: 24px; margin-bottom: 10px; display: block; }
  .contact-card-title { font-family: var(--fd); font-size: 15px; font-weight: 700; color: var(--ink); margin-bottom: 6px; }
  .contact-card-desc { font-size: 13px; color: var(--ink3); line-height: 1.65; margin-bottom: 12px; }
  .contact-card-link { font-size: 13px; font-weight: 600; color: var(--cyan); text-decoration: none; display: inline-flex; align-items: center; gap: 4px; }
  .contact-card-link:hover { text-decoration: underline; }

  .contact-form-wrap { background: var(--bg2); border: 1px solid var(--card-border); border-radius: 16px; padding: 32px; margin-bottom: 44px; }
  .contact-form-title { font-family: var(--fd); font-size: 20px; font-weight: 800; color: var(--ink); letter-spacing: -0.03em; margin-bottom: 6px; }
  .contact-form-sub { font-size: 13px; color: var(--ink3); margin-bottom: 24px; }
  .contact-form { display: flex; flex-direction: column; gap: 14px; }
  .contact-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  @media(max-width:540px){ .contact-row { grid-template-columns: 1fr; } }
  .form-field { display: flex; flex-direction: column; gap: 5px; }
  .form-label { font-size: 10px; font-weight: 700; color: var(--ink4); text-transform: uppercase; letter-spacing: 0.1em; font-family: var(--fm); }
  .form-input, .form-select, .form-textarea { background: var(--bg3); border: 1px solid var(--card-border); border-radius: 9px; padding: 10px 13px; color: var(--ink); font-size: 13.5px; font-family: var(--font); outline: none; transition: border-color 0.15s; width: 100%; }
  .form-input::placeholder, .form-textarea::placeholder { color: var(--ink4); }
  .form-input:focus, .form-select:focus, .form-textarea:focus { border-color: rgba(14,245,212,.4); }
  .form-select { cursor: pointer; }
  .form-select option { background: #0a0d18; }
  .form-textarea { resize: vertical; min-height: 110px; line-height: 1.6; }
  .form-submit { display: inline-flex; align-items: center; gap: 8px; background: var(--cyan); color: var(--bg); border: none; border-radius: 9px; padding: 12px 26px; font-size: 13.5px; font-weight: 700; font-family: var(--font); cursor: pointer; transition: all 0.2s; align-self: flex-start; }
  .form-submit:hover:not(:disabled) { opacity: 0.88; transform: translateY(-1px); }
  .form-submit:disabled { opacity: 0.5; cursor: not-allowed; }

  .form-success { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 48px 24px; text-align: center; gap: 12px; }
  .form-success-icon { width: 56px; height: 56px; border-radius: 50%; background: rgba(16,185,129,.12); border: 1px solid rgba(16,185,129,.25); display: flex; align-items: center; justify-content: center; font-size: 24px; }
  .form-success-title { font-family: var(--fd); font-size: 20px; font-weight: 800; color: var(--ink); }
  .form-success-sub { font-size: 14px; color: var(--ink3); max-width: 320px; line-height: 1.65; }

  /* FAQ in contact */
  .faq-section-title { font-family: var(--fd); font-size: 20px; font-weight: 800; color: var(--ink); letter-spacing: -0.03em; margin-bottom: 6px; }
  .faq-section-sub { font-size: 13px; color: var(--ink3); margin-bottom: 20px; }
  .cfaq-item { border: 1px solid var(--card-border); border-radius: 11px; margin-bottom: 8px; overflow: hidden; background: var(--card); transition: border-color 0.15s; }
  .cfaq-item:hover { border-color: rgba(14,245,212,.15); }
  .cfaq-q { width: 100%; display: flex; align-items: center; justify-content: space-between; padding: 15px 18px; background: transparent; border: none; cursor: pointer; text-align: left; font-size: 13.5px; font-weight: 600; color: var(--ink); font-family: var(--font); gap: 12px; }
  .cfaq-chevron { width: 20px; height: 20px; border-radius: 50%; background: var(--card-hover); display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: transform 0.2s, background 0.15s; font-size: 10px; color: var(--ink3); }
  .cfaq-chevron.open { transform: rotate(180deg); background: var(--cyan3); color: var(--cyan); }
  .cfaq-a { max-height: 0; overflow: hidden; transition: max-height 0.28s ease, padding 0.28s ease; padding: 0 18px; }
  .cfaq-a.open { max-height: 220px; padding: 0 18px 16px; }
  .cfaq-a p { font-size: 13px; color: var(--ink2); line-height: 1.72; margin: 0; }
  @keyframes spin { to { transform: rotate(360deg); } }
`;

// ─── Shared Layout ─────────────────────────────────────────────────────────────

function LegalLayout({
  page, kicker, title, titleC, subtitle, updated, version, sections, children,
}: {
  page: string; kicker: string; title: string; titleC?: string; subtitle: string;
  updated: string; version: string; sections: { id: string; label: string }[];
  children: React.ReactNode;
}) {
  const [active, setActive] = useState(sections[0]?.id);

  useEffect(() => {
    const obs = new IntersectionObserver(
      entries => { entries.forEach(e => { if (e.isIntersecting) setActive(e.target.id); }); },
      { rootMargin: "-20% 0px -70% 0px" }
    );
    sections.forEach(({ id }) => { const el = document.getElementById(id); if (el) obs.observe(el); });
    return () => obs.disconnect();
  }, [sections]);

  const NAV = [
    { href: "/privacy", label: "Privacy" },
    { href: "/terms", label: "Terms" },
    { href: "/security", label: "Security" },
    { href: "/contact", label: "Contact" },
  ];

  return (
    <div className="lp-legal">
      <style>{sharedCss}</style>
      <nav className="lg-nav">
        <div className="lg-nav-i">
          <Link to="/" className="lg-nav-logo">
            <Logo size={24} /><span className="lg-nav-name">Fixsense</span>
          </Link>
          <div className="lg-nav-links">
            {NAV.map(l => (
              <Link key={l.href} to={l.href} className={`lg-nav-link ${page === l.label.toLowerCase() ? "act" : ""}`}>{l.label}</Link>
            ))}
          </div>
          <Link to="/dashboard" className="lg-nav-cta">Dashboard →</Link>
        </div>
      </nav>

      <div className="lg-hero">
        <div className="lg-hero-orb" />
        <div className="lg-hero-inner">
          <div className="lg-breadcrumb">
            <Link to="/">Home</Link><span className="sep">/</span><span className="cur">{kicker}</span>
          </div>
          <div className="lg-kicker"><div className="lg-kicker-dot" />{kicker}</div>
          <h1 className="lg-h1">{title}{titleC && <> <span className="c">{titleC}</span></>}</h1>
          <p className="lg-sub">{subtitle}</p>
          <div className="lg-meta">
            <div className="lg-meta-pill"><div className="lg-meta-dot" />Updated: {updated}</div>
            <div className="lg-meta-pill">Version {version}</div>
            <div className="lg-meta-pill">Effective immediately</div>
          </div>
        </div>
      </div>

      <div className="lg-layout">
        <aside className="lg-toc">
          <div className="lg-toc-title">On this page</div>
          {sections.map(s => (
            <a key={s.id} href={`#${s.id}`} className={`lg-toc-link ${active === s.id ? "act" : ""}`}>{s.label}</a>
          ))}
        </aside>
        <div className="lg-content">{children}</div>
      </div>

      <footer className="lg-footer">
        <div className="lg-footer-i">
          <div>
            <div className="lg-footer-brand"><Logo size={20} /><span className="lg-footer-name">Fixsense</span></div>
            <div className="lg-footer-copy">© {new Date().getFullYear()} Fixsense, Inc. All rights reserved.</div>
          </div>
          <div className="lg-footer-links">
            {[["/privacy","Privacy"],["/terms","Terms"],["/security","Security"],["/contact","Contact"]].map(([h,l]) => (
              <Link key={h} to={h} className="lg-footer-link">{l}</Link>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PRIVACY PAGE
// ─────────────────────────────────────────────────────────────────────────────

export function PrivacyPage() {
  const sections = [
    { id: "overview", label: "Overview" },
    { id: "data-collected", label: "Data We Collect" },
    { id: "how-we-use", label: "How We Use Data" },
    { id: "sharing", label: "Data Sharing" },
    { id: "storage", label: "Storage & Retention" },
    { id: "rights", label: "Your Rights" },
    { id: "cookies", label: "Cookies" },
    { id: "children", label: "Children's Privacy" },
    { id: "changes", label: "Changes to Policy" },
    { id: "contact", label: "Contact Us" },
  ];

  return (
    <LegalLayout page="privacy" kicker="Privacy Policy" title="Your data." titleC="Our responsibility."
      subtitle="We're committed to protecting your personal information and being fully transparent about what we collect, why, and how we protect it."
      updated="March 29, 2026" version="2.1" sections={sections}>

      <section className="lg-section" id="overview">
        <h2>Overview</h2>
        <div className="lg-highlight">
          <p><strong>TL;DR:</strong> We collect data necessary to provide Fixsense. We do not sell your data to third parties. Your call recordings and transcripts are encrypted and processed solely to deliver AI insights back to you.</p>
        </div>
        <p>Fixsense, Inc. ("Fixsense", "we", "us") operates the Fixsense sales intelligence platform. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our services.</p>
        <p>By using Fixsense, you agree to the collection and use of information in accordance with this policy.</p>
      </section>

      <section className="lg-section" id="data-collected">
        <h2>Data We Collect</h2>
        <h3>Account Information</h3>
        <ul>
          <li>Name, email address, and password (hashed)</li>
          <li>Organization name, team name, and role</li>
          <li>Profile photo (optional)</li>
          <li>Billing name and payment method (processed by Paystack)</li>
        </ul>
        <h3>Call & Meeting Data</h3>
        <ul>
          <li>Audio recordings of sales calls and meetings</li>
          <li>Transcripts generated from recordings</li>
          <li>Participant metadata (names, email addresses, if provided)</li>
          <li>Meeting duration, platform, and timestamps</li>
          <li>AI-generated summaries, action items, and objection analyses</li>
        </ul>
        <h3>Usage Data</h3>
        <ul>
          <li>Features accessed and interactions within the platform</li>
          <li>IP address, browser type, and device information</li>
          <li>Log data and error reports</li>
        </ul>
        <h3>Integration Data</h3>
        <p>If you connect third-party services (Zoom, Google Meet, Salesforce, HubSpot, Slack), we receive OAuth tokens and only the data scopes you explicitly authorize.</p>
      </section>

      <section className="lg-section" id="how-we-use">
        <h2>How We Use Data</h2>
        <p>We use your data to:</p>
        <ul>
          <li>Provide, operate, and improve the Fixsense platform</li>
          <li>Generate AI-powered transcripts, summaries, and coaching insights</li>
          <li>Process payments and manage your subscription</li>
          <li>Send transactional emails (call summaries, invoices)</li>
          <li>Provide customer support</li>
          <li>Detect fraud, abuse, and security incidents</li>
          <li>Comply with legal obligations</li>
        </ul>
        <p>We do <strong>not</strong> use your call recordings or transcripts to train general AI models without your explicit consent.</p>
      </section>

      <section className="lg-section" id="sharing">
        <h2>Data Sharing</h2>
        <div className="lg-highlight">
          <p><strong>We do not sell your data.</strong> We do not share your personal information with advertisers or data brokers, ever.</p>
        </div>
        <h3>Service Providers</h3>
        <ul>
          <li><strong>Supabase</strong> — Database and authentication infrastructure</li>
          <li><strong>Paystack</strong> — Payment processing</li>
          <li><strong>Anthropic / Claude</strong> — AI analysis of transcripts to generate insights</li>
          <li><strong>100ms</strong> — Meeting room infrastructure</li>
        </ul>
        <h3>Legal Requirements</h3>
        <p>We may disclose data when required by law, court order, or governmental authority.</p>
        <h3>Business Transfers</h3>
        <p>In the event of a merger or acquisition, we will notify you and provide 30 days to export or delete your data before any transfer occurs.</p>
      </section>

      <section className="lg-section" id="storage">
        <h2>Storage & Retention</h2>
        <p>All data is encrypted at rest (AES-256) and in transit (TLS 1.3). Servers are operated by Supabase.</p>
        <h3>Retention Periods</h3>
        <ul>
          <li>Call recordings: Retained while your account is active. Deleted within 30 days of account deletion.</li>
          <li>Transcripts and summaries: Retained while your account is active.</li>
          <li>Account information: Retained for 7 years for compliance.</li>
          <li>Payment records: Retained for 7 years per financial regulations.</li>
          <li>Access logs: Retained for 90 days.</li>
        </ul>
      </section>

      <section className="lg-section" id="rights">
        <h2>Your Rights</h2>
        <ul>
          <li><strong>Access:</strong> Request a copy of all personal data we hold</li>
          <li><strong>Rectification:</strong> Correct inaccurate or incomplete data</li>
          <li><strong>Erasure:</strong> Request deletion of your account and data</li>
          <li><strong>Portability:</strong> Receive your data in a machine-readable format</li>
          <li><strong>Withdraw Consent:</strong> Revoke consent for data processing</li>
        </ul>
        <p>To exercise any of these rights, contact us at <a href="mailto:privacy@fixsense.com.ng">privacy@fixsense.com.ng</a>. We will respond within 30 days.</p>
        <h3>GDPR (European Users)</h3>
        <p>If you are located in the EEA, you have additional rights under GDPR. Our lawful basis for processing includes contract performance, legitimate interests, and consent.</p>
        <h3>NDPR (Nigerian Users)</h3>
        <p>We comply with the Nigeria Data Protection Regulation (NDPR). Our DPO: <a href="mailto:dpo@fixsense.com.ng">dpo@fixsense.com.ng</a>.</p>
      </section>

      <section className="lg-section" id="cookies">
        <h2>Cookies</h2>
        <ul>
          <li><strong>Essential cookies:</strong> Authentication session management (cannot be disabled)</li>
          <li><strong>Functional cookies:</strong> Remembering your preferences and settings</li>
          <li><strong>Analytics cookies:</strong> Understanding how users interact with the platform</li>
        </ul>
        <p>We do not use advertising or third-party tracking cookies.</p>
      </section>

      <section className="lg-section" id="children">
        <h2>Children's Privacy</h2>
        <p>Fixsense is a professional B2B tool not intended for individuals under 18 years of age. We do not knowingly collect personal information from children.</p>
      </section>

      <section className="lg-section" id="changes">
        <h2>Changes to Policy</h2>
        <p>When we make material changes, we will notify you by email at least 14 days before the changes take effect and update the "Last updated" date at the top of this page.</p>
      </section>

      <section className="lg-section" id="contact">
        <h2>Contact Us</h2>
        <ul>
          <li>Privacy team: <a href="mailto:privacy@fixsense.com.ng">privacy@fixsense.com.ng</a></li>
          <li>Data Protection Officer: <a href="mailto:dpo@fixsense.com.ng">dpo@fixsense.com.ng</a></li>
        </ul>
      </section>
    </LegalLayout>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TERMS PAGE
// ─────────────────────────────────────────────────────────────────────────────

export function TermsPage() {
  const sections = [
    { id: "agreement", label: "Agreement to Terms" },
    { id: "services", label: "Use of Services" },
    { id: "accounts", label: "Accounts" },
    { id: "plans", label: "Plans & Billing" },
    { id: "content", label: "Your Content" },
    { id: "acceptable-use", label: "Acceptable Use" },
    { id: "ip", label: "Intellectual Property" },
    { id: "warranty", label: "Disclaimers" },
    { id: "liability", label: "Limitation of Liability" },
    { id: "termination", label: "Termination" },
    { id: "governing-law", label: "Governing Law" },
    { id: "contact", label: "Contact" },
  ];

  return (
    <LegalLayout page="terms" kicker="Terms of Service" title="The rules of" titleC="the road."
      subtitle="By using Fixsense, you agree to these terms. Please read them carefully — they govern your use of our platform and services."
      updated="March 29, 2026" version="3.0" sections={sections}>

      <section className="lg-section" id="agreement">
        <h2>Agreement to Terms</h2>
        <div className="lg-highlight">
          <p><strong>By accessing or using Fixsense, you confirm you are at least 18 years old and agree to be bound by these Terms.</strong> If you're using Fixsense on behalf of an organization, you represent that you have authority to bind that organization.</p>
        </div>
        <p>These Terms of Service constitute a legally binding agreement between you and Fixsense, Inc. governing your access to and use of the Fixsense platform and related services.</p>
      </section>

      <section className="lg-section" id="services">
        <h2>Use of Services</h2>
        <p>Fixsense provides AI-powered sales intelligence tools including call recording, transcription, analysis, coaching insights, and team collaboration features. Our Services are designed for professional sales use.</p>
        <p>We reserve the right to modify, suspend, or discontinue any part of the Services at any time with reasonable notice for material changes.</p>
        <p>You acknowledge that Fixsense uses AI models (including Anthropic's Claude) to process your meeting content. AI outputs are intended to assist — not replace — human judgment.</p>
      </section>

      <section className="lg-section" id="accounts">
        <h2>Accounts</h2>
        <h3>Registration</h3>
        <p>You must provide accurate, current, and complete information when creating your account. You are responsible for maintaining the confidentiality of your credentials and for all activities under your account.</p>
        <h3>Team Accounts</h3>
        <p>Team administrators are responsible for managing access permissions, inviting members, and ensuring team members comply with these Terms.</p>
        <h3>Account Security</h3>
        <ul>
          <li>Use a strong, unique password and enable any available 2FA</li>
          <li>Do not share account credentials with others</li>
          <li>Notify us immediately at <a href="mailto:security@fixsense.com.ng">security@fixsense.com.ng</a> if you suspect unauthorized access</li>
        </ul>
      </section>

      <section className="lg-section" id="plans">
        <h2>Plans & Billing</h2>
        <h3>Subscription Plans</h3>
        <p>Fixsense offers Free, Starter, Growth, and Scale plans. Plan features, minute limits, and team member limits are defined on our Pricing page and may be updated with 30 days' notice.</p>
        <h3>Payment</h3>
        <ul>
          <li>All paid plans are billed monthly via Paystack</li>
          <li>Prices are displayed in USD and converted at the published rate</li>
          <li>Subscriptions renew automatically unless cancelled</li>
        </ul>
        <h3>Refunds</h3>
        <p>We offer a 7-day money-back guarantee on all new paid subscriptions. Contact <a href="mailto:billing@fixsense.com.ng">billing@fixsense.com.ng</a>.</p>
        <h3>Cancellation</h3>
        <p>You may cancel at any time from your billing dashboard. Cancellation takes effect at the end of the current billing period.</p>
      </section>

      <section className="lg-section" id="content">
        <h2>Your Content</h2>
        <p>You retain full ownership of all recordings, transcripts, notes, and materials you create through Fixsense. We do not claim any intellectual property rights over your content.</p>
        <h3>License to Fixsense</h3>
        <p>By using our Services, you grant Fixsense a limited, non-exclusive, royalty-free license to process, store, and display your content solely to provide the Services to you.</p>
        <h3>Recording Consent</h3>
        <p>You are solely responsible for obtaining necessary consent from all meeting participants before recording. Recording consent laws vary by jurisdiction.</p>
      </section>

      <section className="lg-section" id="acceptable-use">
        <h2>Acceptable Use</h2>
        <p>You agree not to use Fixsense to:</p>
        <ul>
          <li>Record meetings without proper participant consent where legally required</li>
          <li>Process any content that is illegal, harmful, or violates third-party rights</li>
          <li>Attempt to gain unauthorized access to our systems</li>
          <li>Reverse engineer, decompile, or attempt to extract our source code</li>
          <li>Use automated tools to scrape or extract data from our platform</li>
          <li>Resell, sublicense, or provide access to our Services without authorization</li>
        </ul>
        <p>Violations may result in immediate account suspension without refund.</p>
      </section>

      <section className="lg-section" id="ip">
        <h2>Intellectual Property</h2>
        <p>The Fixsense platform, brand, website, and all associated technology, software, algorithms, and AI models are owned by Fixsense, Inc. and protected by copyright, trademark, and other intellectual property laws.</p>
      </section>

      <section className="lg-section" id="warranty">
        <h2>Disclaimers</h2>
        <p>THE SERVICES ARE PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED.</p>
        <p>AI transcriptions, summaries, and coaching recommendations may contain errors. Always apply professional judgment before acting on AI-generated content.</p>
      </section>

      <section className="lg-section" id="liability">
        <h2>Limitation of Liability</h2>
        <p>TO THE MAXIMUM EXTENT PERMITTED BY LAW, FIXSENSE SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES.</p>
        <p>OUR TOTAL LIABILITY SHALL NOT EXCEED THE AMOUNT YOU PAID FIXSENSE IN THE 12 MONTHS PRECEDING THE CLAIM.</p>
      </section>

      <section className="lg-section" id="termination">
        <h2>Termination</h2>
        <p>Either party may terminate this agreement at any time. You may close your account through settings. We may suspend or terminate your account for violations of these Terms or non-payment.</p>
        <p>Upon termination: access to Services ends immediately; you may export your data within 30 days; data will be permanently deleted within 60 days.</p>
      </section>

      <section className="lg-section" id="governing-law">
        <h2>Governing Law</h2>
        <p>These Terms are governed by the laws of the Federal Republic of Nigeria. Any disputes shall be resolved in the courts of Edo State, Nigeria.</p>
        <p>We may update these Terms with 30 days' notice. Continued use constitutes acceptance.</p>
      </section>

      <section className="lg-section" id="contact">
        <h2>Contact</h2>
        <ul>
          <li>Legal: <a href="mailto:legal@fixsense.com.ng">legal@fixsense.com.ng</a></li>
          <li>Billing: <a href="mailto:billing@fixsense.com.ng">billing@fixsense.com.ng</a></li>
        </ul>
      </section>
    </LegalLayout>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECURITY PAGE
// ─────────────────────────────────────────────────────────────────────────────

export function SecurityPage() {
  const sections = [
    { id: "commitment", label: "Our Commitment" },
    { id: "infrastructure", label: "Infrastructure" },
    { id: "encryption", label: "Encryption" },
    { id: "access", label: "Access Control" },
    { id: "ai-security", label: "AI & Data Security" },
    { id: "compliance", label: "Compliance" },
    { id: "incident", label: "Incident Response" },
    { id: "disclosure", label: "Vulnerability Disclosure" },
    { id: "contact", label: "Contact Security" },
  ];

  return (
    <LegalLayout page="security" kicker="Security" title="Built for" titleC="enterprise trust."
      subtitle="Security isn't a feature — it's the foundation. Here's exactly how we protect your calls, transcripts, and data."
      updated="March 29, 2026" version="1.4" sections={sections}>

      <section className="lg-section" id="commitment">
        <h2>Our Commitment</h2>
        <div className="lg-highlight">
          <p><strong>Your call recordings and transcripts contain sensitive business conversations.</strong> We treat that data with the seriousness it deserves — end-to-end encryption, strict access controls, and zero tolerance for unauthorized access.</p>
        </div>
        <div className="lg-badge-row">
          <div className="lg-badge">🔒 AES-256 Encryption</div>
          <div className="lg-badge">🛡️ TLS 1.3</div>
          <div className="lg-badge">✅ SOC 2 Type II</div>
          <div className="lg-badge">🇳🇬 NDPR Compliant</div>
          <div className="lg-badge">🇪🇺 GDPR Ready</div>
        </div>
      </section>

      <section className="lg-section" id="infrastructure">
        <h2>Infrastructure Security</h2>
        <h3>Cloud & Hosting</h3>
        <p>Fixsense runs on Supabase's managed cloud infrastructure, hosted on enterprise-grade data centers with physical security controls, redundant power, and 24/7 monitoring. Our infrastructure is distributed across multiple availability zones.</p>
        <h3>Network Security</h3>
        <ul>
          <li>All traffic routed through Supabase's hardened network perimeter</li>
          <li>DDoS protection and rate limiting on all public endpoints</li>
          <li>Database is not publicly accessible — only through authenticated API layer</li>
          <li>Web Application Firewall (WAF) on all inbound traffic</li>
        </ul>
      </section>

      <section className="lg-section" id="encryption">
        <h2>Encryption</h2>
        <h3>Data at Rest</h3>
        <ul>
          <li>All database data encrypted with <code>AES-256</code></li>
          <li>Call recordings and audio files encrypted in object storage</li>
          <li>OAuth tokens stored encrypted using column-level encryption</li>
        </ul>
        <h3>Data in Transit</h3>
        <ul>
          <li>All connections enforced over <code>TLS 1.3</code> minimum</li>
          <li>HTTPS enforced with HSTS headers; HTTP automatically redirected</li>
          <li>WebSocket connections for real-time features use WSS (TLS)</li>
        </ul>
      </section>

      <section className="lg-section" id="access">
        <h2>Access Control</h2>
        <h3>Authentication</h3>
        <ul>
          <li>Passwords hashed using <code>bcrypt</code> with a strong salt factor</li>
          <li>Google OAuth available as a secure authentication alternative</li>
          <li>Brute-force protection and account lockout on repeated failures</li>
        </ul>
        <h3>Row-Level Security</h3>
        <p>We use Supabase's Row-Level Security (RLS) to enforce that users can only access their own data. Every database query is automatically scoped to the authenticated user.</p>
        <h3>Employee Access</h3>
        <ul>
          <li>Fixsense employees do not have routine access to customer call recordings</li>
          <li>Support access to customer data requires explicit customer authorization and is logged</li>
          <li>All team members complete security training and sign NDAs</li>
        </ul>
      </section>

      <section className="lg-section" id="ai-security">
        <h2>AI & Data Security</h2>
        <h3>What We Guarantee</h3>
        <ul>
          <li>Your recordings are never used to train Anthropic's or Fixsense's general AI models</li>
          <li>Anthropic processes your data under a zero data retention agreement for API calls</li>
          <li>AI processing occurs in isolated, stateless execution environments</li>
          <li>No human reviews your call content without your explicit authorization</li>
        </ul>
      </section>

      <section className="lg-section" id="compliance">
        <h2>Compliance</h2>
        <div className="lg-badge-row">
          <div className="lg-badge">✅ SOC 2 Type II</div>
          <div className="lg-badge">🔒 ISO 27001 (via Supabase)</div>
          <div className="lg-badge">🇪🇺 GDPR</div>
          <div className="lg-badge">🇳🇬 NDPR 2019</div>
          <div className="lg-badge">💳 PCI DSS (via Paystack)</div>
        </div>
        <h3>Recording Consent</h3>
        <p>Fixsense's meeting bot joins calls visibly as "Fixsense AI Recorder" — conspicuous to all participants. Users are responsible for compliance with their jurisdiction's recording consent laws.</p>
      </section>

      <section className="lg-section" id="incident">
        <h2>Incident Response</h2>
        <p>In the event of a security breach:</p>
        <ol>
          <li>Immediate containment and impact assessment within 1 hour</li>
          <li>Affected customers notified within 72 hours of confirmation</li>
          <li>Regulatory notification as required by GDPR/NDPR</li>
          <li>Post-incident report published within 30 days for significant incidents</li>
          <li>Remediation steps implemented and verified</li>
        </ol>
      </section>

      <section className="lg-section" id="disclosure">
        <h2>Vulnerability Disclosure</h2>
        <div className="lg-highlight">
          <p><strong>Report to:</strong> <a href="mailto:security@fixsense.com.ng">security@fixsense.com.ng</a><br />Include: steps to reproduce, potential impact, and any relevant evidence.</p>
        </div>
        <p>We commit to:</p>
        <ul>
          <li>Acknowledge receipt within 24 hours</li>
          <li>Provide a status update within 5 business days</li>
          <li>Not pursue legal action for good-faith security research</li>
          <li>Credit researchers in our security acknowledgments (if desired)</li>
        </ul>
      </section>

      <section className="lg-section" id="contact">
        <h2>Contact Security</h2>
        <ul>
          <li>Security vulnerabilities: <a href="mailto:security@fixsense.com.ng">security@fixsense.com.ng</a></li>
          <li>Enterprise security inquiries: <a href="mailto:enterprise@fixsense.com.ng">enterprise@fixsense.com.ng</a></li>
          <li>GDPR/NDPR inquiries: <a href="mailto:dpo@fixsense.com.ng">dpo@fixsense.com.ng</a></li>
        </ul>
        <p>For urgent matters, mark your subject with <code>[URGENT SECURITY]</code>.</p>
      </section>
    </LegalLayout>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTACT PAGE
// ─────────────────────────────────────────────────────────────────────────────

export function ContactPage() {
  const [form, setForm] = useState({ name: "", email: "", company: "", category: "", message: "" });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    await new Promise(res => setTimeout(res, 1400));
    setSending(false); setSent(true);
  };

  const contactCards = [
    { icon: "💬", title: "General Support", desc: "Questions about your account, billing, or features.", link: "mailto:support@fixsense.com.ng", label: "support@fixsense.com.ng" },
    { icon: "🔒", title: "Security & Privacy", desc: "Report vulnerabilities, data concerns, or privacy inquiries.", link: "mailto:security@fixsense.com.ng", label: "security@fixsense.com.ng" },
    { icon: "🏢", title: "Enterprise Sales", desc: "Custom pricing, data residency, SSO, or volume licensing.", link: "mailto:enterprise@fixsense.com.ng", label: "enterprise@fixsense.com.ng" },
    { icon: "⚖️", title: "Legal & Compliance", desc: "DPAs, legal notices, GDPR/NDPR inquiries, subpoenas.", link: "mailto:legal@fixsense.com.ng", label: "legal@fixsense.com.ng" },
  ];

  const faqs = [
    { q: "What's the typical response time for support?", a: "We aim to respond within 24 hours on business days. Enterprise customers get priority response within 4 hours. Urgent security issues are addressed within 1 hour." },
    { q: "I can't access my account. What should I do?", a: "Try the 'Forgot Password' link on the login page. If that doesn't work, email support@fixsense.com.ng with your account email and we'll manually verify and restore access." },
    { q: "How do I cancel my subscription?", a: "Cancel directly from your Billing dashboard at any time. Your access continues until the end of the billing period." },
    { q: "Can I get a demo before subscribing?", a: "Yes — the Free plan includes up to 30 minutes per month, no credit card required. For a personalized demo with our team, email enterprise@fixsense.com.ng." },
    { q: "Do you offer refunds?", a: "We offer a 7-day money-back guarantee on new paid subscriptions. After 7 days, refunds are considered case-by-case. Email billing@fixsense.com.ng." },
  ];

  const NAV = [
    { href: "/privacy", label: "Privacy" },
    { href: "/terms", label: "Terms" },
    { href: "/security", label: "Security" },
    { href: "/contact", label: "Contact" },
  ];

  return (
    <div className="lp-legal">
      <style>{sharedCss}</style>
      <nav className="lg-nav">
        <div className="lg-nav-i">
          <Link to="/" className="lg-nav-logo"><Logo size={24} /><span className="lg-nav-name">Fixsense</span></Link>
          <div className="lg-nav-links">
            {NAV.map(l => (
              <Link key={l.href} to={l.href} className={`lg-nav-link ${l.label === "Contact" ? "act" : ""}`}>{l.label}</Link>
            ))}
          </div>
          <Link to="/dashboard" className="lg-nav-cta">Dashboard →</Link>
        </div>
      </nav>

      <div className="lg-hero">
        <div className="lg-hero-orb" />
        <div className="lg-hero-inner">
          <div className="lg-breadcrumb">
            <Link to="/">Home</Link><span className="sep">/</span><span className="cur">Contact</span>
          </div>
          <div className="lg-kicker"><div className="lg-kicker-dot" />Get in Touch</div>
          <h1 className="lg-h1">We're here.<br /><span className="c">Let's talk.</span></h1>
          <p className="lg-sub">Whether you have a question about your account, a security concern, or want to discuss enterprise needs — the right team is just an email away.</p>
          <div className="lg-meta">
            <div className="lg-meta-pill"><div className="lg-meta-dot" />Avg. response: &lt;24 hours</div>
            <div className="lg-meta-pill">Mon–Fri, 9am–6pm WAT</div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "52px 24px 96px" }}>

        {/* Contact cards */}
        <div className="contact-cards">
          {contactCards.map(card => (
            <div className="contact-card" key={card.title}>
              <span className="contact-card-icon">{card.icon}</span>
              <div className="contact-card-title">{card.title}</div>
              <div className="contact-card-desc">{card.desc}</div>
              <a href={card.link} className="contact-card-link">{card.label} →</a>
            </div>
          ))}
        </div>

        {/* Contact form */}
        <div className="contact-form-wrap">
          {sent ? (
            <div className="form-success">
              <div className="form-success-icon">✅</div>
              <div className="form-success-title">Message sent!</div>
              <div className="form-success-sub">We've received your message and will get back to you within 24 hours.</div>
            </div>
          ) : (
            <>
              <div className="contact-form-title">Send us a message</div>
              <div className="contact-form-sub">Fill in the form and we'll route it to the right team.</div>
              <form className="contact-form" onSubmit={handleSubmit}>
                <div className="contact-row">
                  <div className="form-field">
                    <label className="form-label">Your name *</label>
                    <input type="text" name="name" className="form-input" placeholder="Alex Johnson" value={form.name} onChange={handleChange} required />
                  </div>
                  <div className="form-field">
                    <label className="form-label">Work email *</label>
                    <input type="email" name="email" className="form-input" placeholder="alex@company.com" value={form.email} onChange={handleChange} required />
                  </div>
                </div>
                <div className="contact-row">
                  <div className="form-field">
                    <label className="form-label">Company</label>
                    <input type="text" name="company" className="form-input" placeholder="Acme Corp" value={form.company} onChange={handleChange} />
                  </div>
                  <div className="form-field">
                    <label className="form-label">Topic *</label>
                    <select name="category" className="form-select" value={form.category} onChange={handleChange} required>
                      <option value="">Select a topic…</option>
                      <option value="support">Account & billing support</option>
                      <option value="technical">Technical issue or bug</option>
                      <option value="enterprise">Enterprise & custom pricing</option>
                      <option value="security">Security or privacy concern</option>
                      <option value="feature">Feature request or feedback</option>
                      <option value="other">Something else</option>
                    </select>
                  </div>
                </div>
                <div className="form-field">
                  <label className="form-label">Message *</label>
                  <textarea name="message" className="form-textarea" placeholder="Tell us what's on your mind. The more detail you provide, the faster we can help." value={form.message} onChange={handleChange} required />
                </div>
                <button type="submit" className="form-submit" disabled={sending}>
                  {sending ? <><span style={{ display:"inline-block",animation:"spin 1s linear infinite" }}>⟳</span> Sending…</> : <>Send Message →</>}
                </button>
              </form>
            </>
          )}
        </div>

        {/* FAQ */}
        <div className="faq-section-title">Frequently asked questions</div>
        <div className="faq-section-sub">Quick answers to the most common questions.</div>
        {faqs.map((faq, i) => (
          <div className="cfaq-item" key={i}>
            <button className="cfaq-q" onClick={() => setOpenFaq(openFaq === i ? null : i)}>
              {faq.q}
              <span className={`cfaq-chevron ${openFaq === i ? "open" : ""}`}>▾</span>
            </button>
            <div className={`cfaq-a ${openFaq === i ? "open" : ""}`}><p>{faq.a}</p></div>
          </div>
        ))}
      </div>

      <footer className="lg-footer">
        <div className="lg-footer-i">
          <div>
            <div className="lg-footer-brand"><Logo size={20} /><span className="lg-footer-name">Fixsense</span></div>
            <div className="lg-footer-copy">© {new Date().getFullYear()} Fixsense, Inc. All rights reserved.</div>
          </div>
          <div className="lg-footer-links">
            {[["/privacy","Privacy Policy"],["/terms","Terms of Service"],["/security","Security"],["/contact","Contact"]].map(([h,l]) => (
              <Link key={h} to={h} className="lg-footer-link">{l}</Link>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}