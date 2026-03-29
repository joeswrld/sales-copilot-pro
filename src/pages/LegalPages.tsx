/**
 * Fixsense Legal & Contact Pages
 * Redesigned to match LandingPage.tsx aesthetic exactly.
 *
 * Add to App.tsx:
 *   import { PrivacyPage, TermsPage, SecurityPage, ContactPage } from "./pages/LegalPages";
 *   <Route path="/privacy"  element={<PrivacyPage />} />
 *   <Route path="/terms"    element={<TermsPage />} />
 *   <Route path="/security" element={<SecurityPage />} />
 *   <Route path="/contact"  element={<ContactPage />} />
 */

import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";

// ─── Shared CSS (mirrors LandingPage tokens exactly) ──────────────────────────
const sharedStyles = `
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,500;12..96,600;12..96,700;12..96,800&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  .lp-page {
    /* ── exact same tokens as LandingPage ── */
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
    --blue-light: rgba(37,99,235,0.08);
    --blue-glow:  rgba(37,99,235,0.18);
    --green:     #10b981;
    --font:         'Plus Jakarta Sans', sans-serif;
    --font-display: 'Bricolage Grotesque', sans-serif;

    background: var(--bg);
    color: var(--ink);
    font-family: var(--font);
    -webkit-font-smoothing: antialiased;
    min-height: 100vh;
    line-height: 1.6;
    overflow-x: hidden;
  }

  /* ── Nav (identical to landing) ── */
  .lp-nav {
    position: fixed; top: 0; left: 0; right: 0; z-index: 100;
    height: 64px;
    display: flex; align-items: center;
    padding: 0 24px;
    background: rgba(255,255,255,0.95);
    backdrop-filter: blur(20px);
    border-bottom: 1px solid var(--border);
    box-shadow: 0 1px 16px rgba(15,23,42,0.06);
  }
  .lp-nav-inner {
    max-width: 1160px; width: 100%; margin: 0 auto;
    display: flex; align-items: center; justify-content: space-between;
  }
  .lp-nav-brand {
    display: flex; align-items: center; gap: 10px; text-decoration: none;
  }
  .lp-nav-logo {
    width: 28px; height: 28px; border-radius: 7px; object-fit: cover; display: block;
  }
  .lp-nav-name {
    font-family: var(--font-display); font-size: 17px; font-weight: 700;
    color: var(--ink); letter-spacing: -0.03em;
  }
  .lp-nav-links {
    display: flex; align-items: center; gap: 28px;
  }
  .lp-nav-link {
    font-size: 14px; font-weight: 500; color: var(--muted);
    text-decoration: none; transition: color 0.2s;
  }
  .lp-nav-link:hover { color: var(--ink); }
  .lp-nav-link--active { color: var(--blue); font-weight: 600; }
  .lp-nav-btn {
    font-size: 13.5px; font-weight: 600; color: #fff;
    background: var(--blue); border: none; cursor: pointer;
    padding: 8px 20px; border-radius: 8px;
    font-family: var(--font); text-decoration: none;
    transition: background 0.15s, transform 0.15s;
  }
  .lp-nav-btn:hover { background: var(--blue-2); transform: translateY(-1px); }
  @media(max-width:768px){
    .lp-nav-links { display: none; }
    .lp-nav { padding: 0 16px; }
  }

  /* ── Hero band ── */
  .lp-hero {
    padding: 112px 24px 64px;
    background: linear-gradient(180deg, #f0f6ff 0%, #ffffff 70%);
    position: relative; overflow: hidden;
  }
  .lp-hero-pattern {
    position: absolute; inset: 0; pointer-events: none;
    background-image: radial-gradient(circle, #d1defe 1px, transparent 1px);
    background-size: 32px 32px;
    mask-image: radial-gradient(ellipse 80% 60% at 50% 0%, black 0%, transparent 100%);
    opacity: 0.45;
  }
  .lp-hero-inner {
    position: relative; z-index: 1;
    max-width: 1160px; margin: 0 auto;
  }
  .lp-kicker {
    display: inline-flex; align-items: center; gap: 8px;
    font-size: 12px; font-weight: 700; color: var(--blue);
    text-transform: uppercase; letter-spacing: 0.1em;
    margin-bottom: 18px;
  }
  .lp-kicker-dot {
    width: 7px; height: 7px; border-radius: 50%; background: var(--green);
  }
  .lp-h1 {
    font-family: var(--font-display);
    font-size: clamp(30px, 4.5vw, 52px);
    font-weight: 800; letter-spacing: -0.04em; line-height: 1.08;
    color: var(--ink); margin-bottom: 16px;
  }
  .lp-h1 .blue { color: var(--blue); }
  .lp-sub {
    font-size: 16px; color: var(--muted); line-height: 1.7;
    max-width: 560px; margin-bottom: 28px;
  }
  .lp-meta {
    display: flex; align-items: center; gap: 18px; flex-wrap: wrap;
  }
  .lp-meta-item {
    display: inline-flex; align-items: center; gap: 6px;
    background: var(--bg-2); border: 1px solid var(--border); border-radius: 20px;
    padding: 5px 14px; font-size: 12px; font-weight: 500; color: var(--muted);
  }
  .lp-meta-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--green); }

  /* ── Breadcrumb ── */
  .lp-breadcrumb {
    display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
    margin-bottom: 28px;
  }
  .lp-breadcrumb a, .lp-breadcrumb span {
    font-size: 13px; color: var(--muted); text-decoration: none;
    transition: color 0.15s;
  }
  .lp-breadcrumb a:hover { color: var(--ink); }
  .lp-breadcrumb .sep { color: var(--muted-2); }
  .lp-breadcrumb .current { color: var(--ink); font-weight: 600; }

  /* ── Layout ── */
  .lp-layout {
    max-width: 1160px; margin: 0 auto; padding: 64px 24px 96px;
    display: grid; grid-template-columns: 220px 1fr; gap: 56px;
    align-items: start;
  }
  @media(max-width:900px){
    .lp-layout { grid-template-columns: 1fr; gap: 32px; padding: 40px 20px 72px; }
    .lp-toc    { display: none; }
  }

  /* ── TOC ── */
  .lp-toc {
    position: sticky; top: 84px;
    background: var(--bg-2); border: 1.5px solid var(--border);
    border-radius: 14px; padding: 20px 16px;
  }
  .lp-toc-title {
    font-size: 10px; font-weight: 700; color: var(--muted-2);
    text-transform: uppercase; letter-spacing: 0.1em;
    margin-bottom: 14px; padding-left: 8px;
  }
  .lp-toc-link {
    display: block; padding: 7px 10px; border-radius: 8px;
    font-size: 12.5px; font-weight: 500; color: var(--muted);
    text-decoration: none; transition: all 0.15s; margin-bottom: 2px;
    border-left: 2.5px solid transparent;
  }
  .lp-toc-link:hover { color: var(--ink); background: var(--bg-3); }
  .lp-toc-link--active {
    color: var(--blue); background: var(--blue-light);
    border-left-color: var(--blue); font-weight: 600;
  }

  /* ── Content ── */
  .lp-content { min-width: 0; }

  .lp-section {
    margin-bottom: 52px; scroll-margin-top: 88px;
  }
  .lp-section h2 {
    font-family: var(--font-display);
    font-size: 22px; font-weight: 800; letter-spacing: -0.03em;
    color: var(--ink); margin-bottom: 18px;
    padding-bottom: 14px; border-bottom: 1.5px solid var(--border);
  }
  .lp-section h3 {
    font-family: var(--font-display);
    font-size: 15px; font-weight: 700; color: var(--ink-2);
    margin: 22px 0 8px; letter-spacing: -0.02em;
  }
  .lp-section p {
    font-size: 14.5px; color: var(--muted); line-height: 1.78;
    margin-bottom: 14px;
  }
  .lp-section strong { color: var(--ink-2); font-weight: 600; }
  .lp-section ul, .lp-section ol {
    margin: 0 0 16px; padding-left: 0; list-style: none;
    display: flex; flex-direction: column; gap: 8px;
  }
  .lp-section li {
    display: flex; align-items: flex-start; gap: 10px;
    font-size: 14px; color: var(--muted); line-height: 1.65;
  }
  .lp-section ul li::before {
    content: '';
    display: block; width: 6px; height: 6px; border-radius: 50%;
    background: var(--blue); flex-shrink: 0; margin-top: 7px;
  }
  .lp-section ol { counter-reset: li; }
  .lp-section ol li::before {
    counter-increment: li; content: counter(li);
    display: flex; align-items: center; justify-content: center;
    width: 22px; height: 22px; border-radius: 50%;
    background: var(--blue-light); color: var(--blue);
    font-size: 11px; font-weight: 700; flex-shrink: 0; margin-top: 1px;
  }
  .lp-section a { color: var(--blue); text-decoration: none; }
  .lp-section a:hover { text-decoration: underline; }

  /* highlight box — matches solution-box style from landing */
  .lp-highlight {
    background: linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%);
    border: 1px solid #bfdbfe;
    border-radius: 12px; padding: 18px 20px; margin: 20px 0;
  }
  .lp-highlight p { color: var(--ink-2); margin: 0; font-size: 14px; }
  .lp-highlight strong { color: var(--blue); }

  /* badge row */
  .lp-badge-row { display: flex; flex-wrap: wrap; gap: 8px; margin: 16px 0; }
  .lp-badge {
    display: inline-flex; align-items: center; gap: 6px;
    background: var(--bg-2); border: 1px solid var(--border);
    border-radius: 20px; padding: 5px 14px;
    font-size: 12px; font-weight: 500; color: var(--ink-2);
  }

  code {
    font-size: 12.5px; color: var(--blue);
    background: var(--blue-light); border-radius: 5px; padding: 1px 7px;
    font-family: 'Courier New', monospace;
  }

  /* ── Footer (matches landing footer style) ── */
  .lp-footer {
    background: var(--ink); padding: 48px 24px 28px;
    border-top: 1px solid rgba(255,255,255,0.06);
  }
  .lp-footer-inner {
    max-width: 1160px; margin: 0 auto;
    display: flex; align-items: center; justify-content: space-between;
    flex-wrap: wrap; gap: 16px;
  }
  .lp-footer-brand {
    display: flex; align-items: center; gap: 9px;
  }
  .lp-footer-logo {
    width: 22px; height: 22px; border-radius: 6px; object-fit: cover;
  }
  .lp-footer-name {
    font-family: var(--font-display); font-size: 14px; font-weight: 700;
    color: rgba(255,255,255,0.8); letter-spacing: -0.02em;
  }
  .lp-footer-copy { font-size: 12px; color: rgba(255,255,255,0.22); }
  .lp-footer-links { display: flex; gap: 20px; flex-wrap: wrap; }
  .lp-footer-link {
    font-size: 12px; color: rgba(255,255,255,0.28); text-decoration: none; transition: color 0.2s;
  }
  .lp-footer-link:hover { color: rgba(255,255,255,0.55); }

  /* ── Contact-specific ── */
  .contact-cards {
    display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 48px;
  }
  @media(max-width:580px){ .contact-cards { grid-template-columns: 1fr; } }

  .contact-card {
    background: var(--bg-2); border: 1.5px solid var(--border);
    border-radius: 14px; padding: 24px;
    transition: border-color 0.2s, box-shadow 0.2s, transform 0.2s;
  }
  .contact-card:hover {
    border-color: #bfdbfe; box-shadow: 0 8px 28px var(--blue-glow);
    transform: translateY(-2px);
  }
  .contact-card-icon { font-size: 26px; margin-bottom: 12px; display: block; }
  .contact-card-title {
    font-family: var(--font-display); font-size: 16px; font-weight: 700;
    color: var(--ink); margin-bottom: 6px; letter-spacing: -0.02em;
  }
  .contact-card-desc { font-size: 13px; color: var(--muted); line-height: 1.65; margin-bottom: 14px; }
  .contact-card-link {
    font-size: 13px; font-weight: 600; color: var(--blue);
    text-decoration: none; display: inline-flex; align-items: center; gap: 5px;
  }
  .contact-card-link:hover { text-decoration: underline; }

  .contact-form-wrap {
    background: var(--bg-2); border: 1.5px solid var(--border);
    border-radius: 16px; padding: 36px; margin-bottom: 48px;
  }
  .contact-form-title {
    font-family: var(--font-display); font-size: 22px; font-weight: 800;
    color: var(--ink); letter-spacing: -0.03em; margin-bottom: 6px;
  }
  .contact-form-sub { font-size: 14px; color: var(--muted); margin-bottom: 28px; }
  .contact-form { display: flex; flex-direction: column; gap: 16px; }
  .contact-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  @media(max-width:580px){ .contact-row { grid-template-columns: 1fr; } }

  .form-field { display: flex; flex-direction: column; gap: 6px; }
  .form-label {
    font-size: 11px; font-weight: 700; color: var(--muted);
    text-transform: uppercase; letter-spacing: 0.08em;
  }
  .form-input, .form-select, .form-textarea {
    background: #fff; border: 1.5px solid var(--border);
    border-radius: 10px; padding: 11px 14px;
    color: var(--ink); font-size: 14px; font-family: var(--font);
    outline: none; transition: border-color 0.15s, box-shadow 0.15s;
    width: 100%;
  }
  .form-input::placeholder, .form-textarea::placeholder { color: var(--muted-2); }
  .form-input:focus, .form-select:focus, .form-textarea:focus {
    border-color: var(--blue); box-shadow: 0 0 0 3px var(--blue-light);
  }
  .form-select { cursor: pointer; }
  .form-textarea { resize: vertical; min-height: 120px; line-height: 1.6; }
  .form-submit {
    display: inline-flex; align-items: center; gap: 8px;
    background: var(--blue); color: #fff; border: none;
    border-radius: 10px; padding: 13px 28px;
    font-size: 14px; font-weight: 600; font-family: var(--font);
    cursor: pointer; transition: all 0.2s;
    box-shadow: 0 4px 14px var(--blue-glow); align-self: flex-start;
  }
  .form-submit:hover:not(:disabled) { background: var(--blue-2); transform: translateY(-1px); }
  .form-submit:disabled { opacity: 0.5; cursor: not-allowed; }

  .form-success {
    display: flex; flex-direction: column; align-items: center;
    justify-content: center; padding: 48px 24px; text-align: center; gap: 14px;
  }
  .form-success-icon {
    width: 64px; height: 64px; border-radius: 50%;
    background: linear-gradient(135deg, #d1fae5, #a7f3d0);
    display: flex; align-items: center; justify-content: center;
    font-size: 28px;
  }
  .form-success-title {
    font-family: var(--font-display); font-size: 22px; font-weight: 800;
    color: var(--ink); letter-spacing: -0.03em;
  }
  .form-success-sub { font-size: 14px; color: var(--muted); max-width: 340px; line-height: 1.65; }

  /* FAQ */
  .faq-section-title {
    font-family: var(--font-display); font-size: 22px; font-weight: 800;
    color: var(--ink); letter-spacing: -0.03em; margin-bottom: 8px;
  }
  .faq-section-sub { font-size: 14px; color: var(--muted); margin-bottom: 24px; }

  .faq-item {
    border: 1.5px solid var(--border); border-radius: 12px; margin-bottom: 10px;
    background: #fff; overflow: hidden; transition: border-color 0.15s;
  }
  .faq-item:hover { border-color: #bfdbfe; }
  .faq-q {
    width: 100%; display: flex; align-items: center; justify-content: space-between;
    padding: 16px 20px; background: transparent; border: none; cursor: pointer;
    text-align: left; font-size: 14px; font-weight: 600; color: var(--ink);
    font-family: var(--font); gap: 12px;
  }
  .faq-chevron {
    width: 22px; height: 22px; border-radius: 50%; background: var(--bg-3);
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0; transition: transform 0.2s, background 0.15s;
    font-size: 10px; color: var(--muted);
  }
  .faq-chevron--open { transform: rotate(180deg); background: var(--blue-light); color: var(--blue); }
  .faq-a {
    max-height: 0; overflow: hidden;
    transition: max-height 0.28s ease, padding 0.28s ease;
    padding: 0 20px;
  }
  .faq-a--open { max-height: 240px; padding: 0 20px 18px; }
  .faq-a p { font-size: 13.5px; color: var(--muted); line-height: 1.7; margin: 0; }

  @keyframes spin { to { transform: rotate(360deg); } }
`;

// ─── Shared Layout ─────────────────────────────────────────────────────────────

function LegalLayout({
  page,
  kicker,
  title,
  titleBlue,
  subtitle,
  updated,
  version,
  sections,
  children,
}: {
  page: string;
  kicker: string;
  title: string;
  titleBlue?: string;
  subtitle: string;
  updated: string;
  version: string;
  sections: { id: string; label: string }[];
  children: React.ReactNode;
}) {
  const [activeSection, setActiveSection] = useState(sections[0]?.id);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => { if (e.isIntersecting) setActiveSection(e.target.id); });
      },
      { rootMargin: "-20% 0px -70% 0px" }
    );
    sections.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [sections]);

  const NAV = [
    { href: "/privacy",  label: "Privacy"  },
    { href: "/terms",    label: "Terms"    },
    { href: "/security", label: "Security" },
    { href: "/contact",  label: "Contact"  },
  ];

  return (
    <div className="lp-page">
      <style>{sharedStyles}</style>

      {/* Nav */}
      <nav className="lp-nav">
        <div className="lp-nav-inner">
          <Link to="/" className="lp-nav-brand">
            <img src="/fixsense_icon_logo (2).png" alt="Fixsense" className="lp-nav-logo" />
            <span className="lp-nav-name">Fixsense</span>
          </Link>
          <div className="lp-nav-links">
            {NAV.map((l) => (
              <Link
                key={l.href}
                to={l.href}
                className={`lp-nav-link ${page === l.label.toLowerCase() ? "lp-nav-link--active" : ""}`}
              >
                {l.label}
              </Link>
            ))}
          </div>
          <Link to="/dashboard" className="lp-nav-btn">Dashboard →</Link>
        </div>
      </nav>

      {/* Hero */}
      <div className="lp-hero">
        <div className="lp-hero-pattern" />
        <div className="lp-hero-inner">
          {/* Breadcrumb */}
          <div className="lp-breadcrumb">
            <Link to="/">Home</Link>
            <span className="sep">/</span>
            <span className="current">{kicker}</span>
          </div>

          <div className="lp-kicker">
            <div className="lp-kicker-dot" />
            {kicker}
          </div>

          <h1 className="lp-h1">
            {title}
            {titleBlue && <> <span className="blue">{titleBlue}</span></>}
          </h1>
          <p className="lp-sub">{subtitle}</p>

          <div className="lp-meta">
            <div className="lp-meta-item">
              <div className="lp-meta-dot" />
              Last updated: {updated}
            </div>
            <div className="lp-meta-item">Version {version}</div>
            <div className="lp-meta-item">Effective immediately</div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="lp-layout">
        <aside className="lp-toc">
          <div className="lp-toc-title">On this page</div>
          {sections.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className={`lp-toc-link ${activeSection === s.id ? "lp-toc-link--active" : ""}`}
            >
              {s.label}
            </a>
          ))}
        </aside>
        <div className="lp-content">{children}</div>
      </div>

      {/* Footer */}
      <footer className="lp-footer">
        <div className="lp-footer-inner">
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div className="lp-footer-brand">
              <img src="/fixsense_icon_logo (2).png" alt="Fixsense" className="lp-footer-logo" />
              <span className="lp-footer-name">Fixsense</span>
            </div>
            <span className="lp-footer-copy">© {new Date().getFullYear()} Fixsense, Inc. All rights reserved.</span>
          </div>
          <div className="lp-footer-links">
            {[
              { href: "/privacy",  label: "Privacy Policy" },
              { href: "/terms",    label: "Terms of Service" },
              { href: "/security", label: "Security" },
              { href: "/contact",  label: "Contact" },
            ].map((l) => (
              <Link key={l.href} to={l.href} className="lp-footer-link">{l.label}</Link>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  PRIVACY PAGE
// ─────────────────────────────────────────────────────────────────────────────

export function PrivacyPage() {
  const sections = [
    { id: "overview",       label: "Overview"          },
    { id: "data-collected", label: "Data We Collect"   },
    { id: "how-we-use",     label: "How We Use Data"   },
    { id: "sharing",        label: "Data Sharing"      },
    { id: "storage",        label: "Storage & Retention" },
    { id: "rights",         label: "Your Rights"       },
    { id: "cookies",        label: "Cookies"           },
    { id: "children",       label: "Children's Privacy" },
    { id: "changes",        label: "Changes to Policy" },
    { id: "contact",        label: "Contact Us"        },
  ];

  return (
    <LegalLayout
      page="privacy"
      kicker="Privacy Policy"
      title="Your data."
      titleBlue="Our responsibility."
      subtitle="We're committed to protecting your personal information and being fully transparent about what we collect, why, and how we protect it."
      updated="March 29, 2026"
      version="2.1"
      sections={sections}
    >
      <section className="lp-section" id="overview">
        <h2>Overview</h2>
        <div className="lp-highlight">
          <p>
            <strong>TL;DR:</strong> We collect data necessary to provide Fixsense. We do not sell your data to third parties. Your call recordings and transcripts are encrypted and processed solely to deliver AI insights back to you.
          </p>
        </div>
        <p>
          Fixsense, Inc. ("Fixsense", "we", "us", or "our") operates the Fixsense sales intelligence platform. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our services.
        </p>
        <p>
          By using Fixsense, you agree to the collection and use of information in accordance with this policy. If you do not agree, please discontinue use of our services.
        </p>
      </section>

      <section className="lp-section" id="data-collected">
        <h2>Data We Collect</h2>
        <h3>Account Information</h3>
        <p>When you create an account, we collect:</p>
        <ul>
          <li>Name, email address, and password (hashed)</li>
          <li>Organization name, team name, and role</li>
          <li>Profile photo (optional)</li>
          <li>Billing name and payment method (processed by Paystack)</li>
        </ul>
        <h3>Call & Meeting Data</h3>
        <p>When you record a meeting through Fixsense, we collect:</p>
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
          <li>Performance and analytics data</li>
        </ul>
        <h3>Integration Data</h3>
        <p>
          If you connect third-party services (Zoom, Google Meet, Salesforce, HubSpot, Slack), we receive OAuth tokens and only the data scopes you explicitly authorize.
        </p>
      </section>

      <section className="lp-section" id="how-we-use">
        <h2>How We Use Data</h2>
        <p>We use your data to:</p>
        <ul>
          <li>Provide, operate, and improve the Fixsense platform</li>
          <li>Generate AI-powered transcripts, summaries, and coaching insights</li>
          <li>Process payments and manage your subscription</li>
          <li>Send transactional emails (call summaries, account updates, invoices)</li>
          <li>Provide customer support and respond to inquiries</li>
          <li>Detect fraud, abuse, and security incidents</li>
          <li>Comply with legal obligations</li>
        </ul>
        <p>
          We do <strong>not</strong> use your call recordings or transcripts to train general AI models without your explicit consent. AI processing of your recordings occurs solely to generate insights returned directly to you.
        </p>
      </section>

      <section className="lp-section" id="sharing">
        <h2>Data Sharing</h2>
        <div className="lp-highlight">
          <p><strong>We do not sell your data.</strong> We do not share your personal information with advertisers or data brokers, ever.</p>
        </div>
        <h3>Service Providers</h3>
        <p>We work with trusted third-party vendors who process data only on our behalf under strict confidentiality agreements:</p>
        <ul>
          <li><strong>Supabase</strong> — Database and authentication infrastructure</li>
          <li><strong>Paystack</strong> — Payment processing (never stores full card data on our servers)</li>
          <li><strong>Anthropic / Claude</strong> — AI analysis of transcripts to generate insights</li>
          <li><strong>Recall.ai</strong> — Meeting bot infrastructure for automated recording</li>
        </ul>
        <h3>Legal Requirements</h3>
        <p>
          We may disclose data when required by law, court order, or governmental authority, or to protect the rights, property, or safety of Fixsense, our users, or the public.
        </p>
        <h3>Business Transfers</h3>
        <p>
          In the event of a merger, acquisition, or sale of assets, user data may be transferred. We will notify you via email and provide 30 days to export or delete your data before any transfer occurs.
        </p>
      </section>

      <section className="lp-section" id="storage">
        <h2>Storage & Retention</h2>
        <p>
          Your data is stored on servers operated by Supabase. All data is encrypted at rest (AES-256) and in transit (TLS 1.3).
        </p>
        <h3>Retention Periods</h3>
        <ul>
          <li>Call recordings: Retained while your account is active. Deleted within 30 days of account deletion.</li>
          <li>Transcripts and summaries: Retained while your account is active. Deleted within 30 days of account deletion.</li>
          <li>Account information: Retained for 7 years for compliance purposes after deletion.</li>
          <li>Payment records: Retained for 7 years per financial regulations.</li>
          <li>Access logs: Retained for 90 days for security purposes.</li>
        </ul>
        <p>
          You may request early deletion of recordings or transcripts through your account settings or by contacting <a href="mailto:privacy@fixsense.com.ng">privacy@fixsense.com.ng</a>.
        </p>
      </section>

      <section className="lp-section" id="rights">
        <h2>Your Rights</h2>
        <p>Depending on your jurisdiction, you may have the following rights:</p>
        <ul>
          <li><strong>Access:</strong> Request a copy of all personal data we hold about you</li>
          <li><strong>Rectification:</strong> Correct inaccurate or incomplete data</li>
          <li><strong>Erasure:</strong> Request deletion of your account and associated data</li>
          <li><strong>Portability:</strong> Receive your data in a machine-readable format</li>
          <li><strong>Objection:</strong> Object to specific types of processing</li>
          <li><strong>Restriction:</strong> Request that we limit processing of your data</li>
          <li><strong>Withdraw Consent:</strong> Revoke consent for data processing where applicable</li>
        </ul>
        <p>
          To exercise any of these rights, contact us at <a href="mailto:privacy@fixsense.com.ng">privacy@fixsense.com.ng</a>. We will respond within 30 days. You can also export and delete your account data directly from your Profile Settings.
        </p>
        <h3>GDPR (European Users)</h3>
        <p>
          If you are located in the European Economic Area, you have additional rights under GDPR. Our lawful basis for processing includes contract performance, legitimate interests, and consent where applicable.
        </p>
        <h3>NDPR (Nigerian Users)</h3>
        <p>
          We comply with the Nigeria Data Protection Regulation (NDPR). Our Data Protection Officer can be reached at <a href="mailto:dpo@fixsense.com.ng">dpo@fixsense.com.ng</a>.
        </p>
      </section>

      <section className="lp-section" id="cookies">
        <h2>Cookies</h2>
        <p>We use cookies and similar tracking technologies for:</p>
        <ul>
          <li><strong>Essential cookies:</strong> Authentication session management (cannot be disabled)</li>
          <li><strong>Functional cookies:</strong> Remembering your preferences and settings</li>
          <li><strong>Analytics cookies:</strong> Understanding how users interact with the platform</li>
        </ul>
        <p>
          We do not use advertising or third-party tracking cookies. You can disable non-essential cookies in your browser settings without affecting core functionality.
        </p>
      </section>

      <section className="lp-section" id="children">
        <h2>Children's Privacy</h2>
        <p>
          Fixsense is a professional B2B tool not intended for individuals under 18 years of age. We do not knowingly collect personal information from children. If we become aware that we have collected data from a minor, we will delete it promptly.
        </p>
      </section>

      <section className="lp-section" id="changes">
        <h2>Changes to Policy</h2>
        <p>
          We may update this Privacy Policy periodically. When we make material changes, we will notify you by email at least 14 days before the changes take effect and update the "Last updated" date at the top of this page.
        </p>
        <p>
          Continued use of Fixsense after the effective date constitutes acceptance of the updated policy.
        </p>
      </section>

      <section className="lp-section" id="contact">
        <h2>Contact Us</h2>
        <p>For privacy-related inquiries:</p>
        <ul>
          <li>Privacy team: <a href="mailto:privacy@fixsense.com.ng">privacy@fixsense.com.ng</a></li>
          <li>Data Protection Officer: <a href="mailto:dpo@fixsense.com.ng">dpo@fixsense.com.ng</a></li>
        </ul>
      </section>
    </LegalLayout>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  TERMS PAGE
// ─────────────────────────────────────────────────────────────────────────────

export function TermsPage() {
  const sections = [
    { id: "agreement",            label: "Agreement to Terms"    },
    { id: "services",             label: "Use of Services"       },
    { id: "accounts",             label: "Accounts"              },
    { id: "plans",                label: "Plans & Billing"       },
    { id: "content",              label: "Your Content"          },
    { id: "acceptable-use",       label: "Acceptable Use"        },
    { id: "intellectual-property",label: "Intellectual Property" },
    { id: "third-party",          label: "Third-Party Services"  },
    { id: "warranty",             label: "Disclaimers"           },
    { id: "liability",            label: "Limitation of Liability"},
    { id: "termination",          label: "Termination"           },
    { id: "governing-law",        label: "Governing Law"         },
    { id: "contact",              label: "Contact"               },
  ];

  return (
    <LegalLayout
      page="terms"
      kicker="Terms of Service"
      title="The rules of"
      titleBlue="the road."
      subtitle="By using Fixsense, you agree to these terms. Please read them carefully — they govern your use of our platform and services."
      updated="March 29, 2026"
      version="3.0"
      sections={sections}
    >
      <section className="lp-section" id="agreement">
        <h2>Agreement to Terms</h2>
        <div className="lp-highlight">
          <p>
            <strong>By accessing or using Fixsense, you confirm you are at least 18 years old and agree to be bound by these Terms.</strong> If you're using Fixsense on behalf of an organization, you represent that you have authority to bind that organization.
          </p>
        </div>
        <p>
          These Terms of Service ("Terms") constitute a legally binding agreement between you and Fixsense, Inc. governing your access to and use of the Fixsense platform, website, and related services (collectively, the "Services").
        </p>
      </section>

      <section className="lp-section" id="services">
        <h2>Use of Services</h2>
        <p>
          Fixsense provides AI-powered sales intelligence tools including call recording, transcription, analysis, coaching insights, and team collaboration features. Our Services are designed for professional sales use.
        </p>
        <p>
          We reserve the right to modify, suspend, or discontinue any part of the Services at any time with reasonable notice for material changes.
        </p>
        <p>
          You acknowledge that Fixsense uses AI models (including Anthropic's Claude) to process your meeting content. AI outputs are intended to assist — not replace — human judgment.
        </p>
      </section>

      <section className="lp-section" id="accounts">
        <h2>Accounts</h2>
        <h3>Registration</h3>
        <p>
          You must provide accurate, current, and complete information when creating your account. You are responsible for maintaining the confidentiality of your credentials and for all activities under your account.
        </p>
        <h3>Team Accounts</h3>
        <p>
          Team administrators are responsible for managing access permissions, inviting members, and ensuring team members comply with these Terms. The team admin's subscription governs all member access and limits.
        </p>
        <h3>Account Security</h3>
        <ul>
          <li>Use a strong, unique password and enable any available 2FA</li>
          <li>Do not share account credentials with others</li>
          <li>Notify us immediately at <a href="mailto:security@fixsense.com.ng">security@fixsense.com.ng</a> if you suspect unauthorized access</li>
        </ul>
      </section>

      <section className="lp-section" id="plans">
        <h2>Plans & Billing</h2>
        <h3>Subscription Plans</h3>
        <p>
          Fixsense offers Free, Starter, Growth, and Scale plans. Plan features, meeting limits, and team member limits are defined on our Pricing page and may be updated with 30 days' notice.
        </p>
        <h3>Payment</h3>
        <ul>
          <li>All paid plans are billed monthly via Paystack</li>
          <li>Prices are displayed in USD and converted at the published rate</li>
          <li>Subscriptions renew automatically unless cancelled</li>
          <li>We do not store full payment card details on our servers</li>
        </ul>
        <h3>Refunds</h3>
        <p>
          We offer a 7-day money-back guarantee on all new paid subscriptions. Refund requests after 7 days are considered on a case-by-case basis. Contact <a href="mailto:billing@fixsense.com.ng">billing@fixsense.com.ng</a>.
        </p>
        <h3>Cancellation</h3>
        <p>
          You may cancel your subscription at any time from your billing dashboard. Cancellation takes effect at the end of the current billing period. You retain access to paid features until then.
        </p>
      </section>

      <section className="lp-section" id="content">
        <h2>Your Content</h2>
        <p>
          "Your Content" means all recordings, transcripts, notes, messages, and other materials you upload, generate, or create through Fixsense.
        </p>
        <h3>Ownership</h3>
        <p>
          You retain full ownership of Your Content. We do not claim any intellectual property rights over materials you provide or create.
        </p>
        <h3>License to Fixsense</h3>
        <p>
          By using our Services, you grant Fixsense a limited, non-exclusive, royalty-free license to process, store, and display Your Content solely to provide and improve the Services to you. This license terminates when you delete content or close your account.
        </p>
        <h3>Recording Consent</h3>
        <p>
          You are solely responsible for obtaining necessary consent from all meeting participants before recording. Recording consent laws vary by jurisdiction. Fixsense is not liable for your failure to obtain proper consent.
        </p>
      </section>

      <section className="lp-section" id="acceptable-use">
        <h2>Acceptable Use</h2>
        <p>You agree not to use Fixsense to:</p>
        <ul>
          <li>Record meetings without proper participant consent where legally required</li>
          <li>Process any content that is illegal, harmful, or violates third-party rights</li>
          <li>Attempt to gain unauthorized access to our systems or other users' accounts</li>
          <li>Reverse engineer, decompile, or attempt to extract our source code or AI models</li>
          <li>Use automated tools to scrape, crawl, or extract data from our platform</li>
          <li>Resell, sublicense, or provide access to our Services without authorization</li>
          <li>Transmit malware, viruses, or any malicious code</li>
        </ul>
        <p>Violations may result in immediate account suspension without refund.</p>
      </section>

      <section className="lp-section" id="intellectual-property">
        <h2>Intellectual Property</h2>
        <p>
          The Fixsense platform, brand, website, and all associated technology, software, algorithms, and AI models are owned by Fixsense, Inc. and protected by copyright, trademark, and other intellectual property laws.
        </p>
        <p>
          If you submit feedback or suggestions about our Services, you grant us an unlimited, royalty-free right to use them without any obligation to you.
        </p>
      </section>

      <section className="lp-section" id="third-party">
        <h2>Third-Party Services</h2>
        <p>
          Fixsense integrates with third-party services including Zoom, Google Meet, Microsoft Teams, Salesforce, HubSpot, Slack, and others. Your use of these integrations is subject to their respective terms of service and privacy policies.
        </p>
        <p>
          We are not responsible for the availability, accuracy, or practices of third-party services.
        </p>
      </section>

      <section className="lp-section" id="warranty">
        <h2>Disclaimers</h2>
        <p>
          THE SERVICES ARE PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT.
        </p>
        <p>
          AI transcriptions, summaries, and coaching recommendations may contain errors. Always apply professional judgment before acting on AI-generated content.
        </p>
      </section>

      <section className="lp-section" id="liability">
        <h2>Limitation of Liability</h2>
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, FIXSENSE SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOSS OF PROFITS, DATA, OR BUSINESS OPPORTUNITIES.
        </p>
        <p>
          OUR TOTAL LIABILITY SHALL NOT EXCEED THE AMOUNT YOU PAID FIXSENSE IN THE 12 MONTHS PRECEDING THE CLAIM.
        </p>
      </section>

      <section className="lp-section" id="termination">
        <h2>Termination</h2>
        <p>
          Either party may terminate this agreement at any time. You may close your account through settings. We may suspend or terminate your account for violations of these Terms, non-payment, or at our discretion with 30 days' notice.
        </p>
        <p>
          Upon termination: access to Services ends immediately; you may export your data within 30 days; data will be permanently deleted within 60 days per our retention policy.
        </p>
      </section>

      <section className="lp-section" id="governing-law">
        <h2>Governing Law</h2>
        <p>
          These Terms are governed by the laws of the Federal Republic of Nigeria. Any disputes shall be resolved in the courts of Edo State, Nigeria.
        </p>
        <p>
          We may update these Terms with 30 days' notice. Continued use constitutes acceptance.
        </p>
      </section>

      <section className="lp-section" id="contact">
        <h2>Contact</h2>
        <p>Questions about these Terms? Reach us at:</p>
        <ul>
          <li>Email: <a href="mailto:legal@fixsense.com.ng">legal@fixsense.com.ng</a></li>
        </ul>
      </section>
    </LegalLayout>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  SECURITY PAGE
// ─────────────────────────────────────────────────────────────────────────────

export function SecurityPage() {
  const sections = [
    { id: "commitment",     label: "Our Commitment"         },
    { id: "infrastructure", label: "Infrastructure"         },
    { id: "encryption",     label: "Encryption"             },
    { id: "access",         label: "Access Control"         },
    { id: "ai-security",    label: "AI & Data Security"     },
    { id: "compliance",     label: "Compliance"             },
    { id: "incident",       label: "Incident Response"      },
    { id: "disclosure",     label: "Vulnerability Disclosure"},
    { id: "contact",        label: "Contact Security"       },
  ];

  return (
    <LegalLayout
      page="security"
      kicker="Security"
      title="Built for"
      titleBlue="enterprise trust."
      subtitle="Security isn't a feature — it's the foundation. Here's exactly how we protect your calls, transcripts, and data."
      updated="March 29, 2026"
      version="1.4"
      sections={sections}
    >
      <section className="lp-section" id="commitment">
        <h2>Our Commitment</h2>
        <div className="lp-highlight">
          <p>
            <strong>Your call recordings and transcripts contain sensitive business conversations.</strong> We treat that data with the seriousness it deserves — end-to-end encryption, strict access controls, and zero tolerance for unauthorized access.
          </p>
        </div>
        <p>
          Fixsense is built on security-first infrastructure. Every design decision prioritizes the confidentiality and integrity of your data.
        </p>
        <div className="lp-badge-row">
          <div className="lp-badge">🔒 AES-256 Encryption</div>
          <div className="lp-badge">🛡️ TLS 1.3</div>
          <div className="lp-badge">✅ SOC 2 Type II</div>
          <div className="lp-badge">🇳🇬 NDPR Compliant</div>
          <div className="lp-badge">🇪🇺 GDPR Ready</div>
        </div>
      </section>

      <section className="lp-section" id="infrastructure">
        <h2>Infrastructure Security</h2>
        <h3>Cloud & Hosting</h3>
        <p>
          Fixsense runs on Supabase's managed cloud infrastructure, hosted on enterprise-grade data centers with physical security controls, redundant power, and 24/7 monitoring. Our infrastructure is distributed across multiple availability zones for resilience.
        </p>
        <h3>Network Security</h3>
        <ul>
          <li>All traffic routed through Supabase's hardened network perimeter</li>
          <li>DDoS protection and rate limiting on all public endpoints</li>
          <li>Database is not publicly accessible — only through authenticated API layer</li>
          <li>Edge functions run in isolated, ephemeral environments</li>
          <li>Web Application Firewall (WAF) on all inbound traffic</li>
        </ul>
        <h3>Availability</h3>
        <p>
          We target 99.9% uptime. Planned maintenance windows are announced at least 24 hours in advance.
        </p>
      </section>

      <section className="lp-section" id="encryption">
        <h2>Encryption</h2>
        <h3>Data at Rest</h3>
        <ul>
          <li>All database data encrypted with <code>AES-256</code></li>
          <li>Call recordings and audio files encrypted in object storage</li>
          <li>Encryption keys managed by the cloud provider's KMS with regular rotation</li>
          <li>OAuth tokens stored encrypted using column-level encryption</li>
        </ul>
        <h3>Data in Transit</h3>
        <ul>
          <li>All connections enforced over <code>TLS 1.3</code> minimum</li>
          <li>HTTPS enforced with HSTS headers; HTTP automatically redirected</li>
          <li>WebSocket connections for real-time features use WSS (TLS)</li>
        </ul>
      </section>

      <section className="lp-section" id="access">
        <h2>Access Control</h2>
        <h3>Authentication</h3>
        <ul>
          <li>Passwords hashed using <code>bcrypt</code> with a strong salt factor</li>
          <li>Google OAuth available as a secure authentication alternative</li>
          <li>Session tokens are short-lived with automatic renewal</li>
          <li>Brute-force protection and account lockout on repeated failures</li>
        </ul>
        <h3>Row-Level Security</h3>
        <p>
          We use Supabase's Row-Level Security (RLS) to enforce that users can only access their own data. Every database query is automatically scoped to the authenticated user. Team data is further scoped by team membership and role.
        </p>
        <h3>Employee Access</h3>
        <ul>
          <li>Fixsense employees do not have routine access to customer call recordings or transcripts</li>
          <li>Support access to customer data requires explicit customer authorization and is logged</li>
          <li>All team members complete security training and sign NDAs</li>
          <li>Access to production systems is restricted by role, IP, and 2FA enforcement</li>
        </ul>
      </section>

      <section className="lp-section" id="ai-security">
        <h2>AI & Data Security</h2>
        <h3>How We Process Your Recordings</h3>
        <p>
          When you record a call, audio is securely transmitted to our edge functions, processed for transcription, then stored encrypted. AI analysis is performed using Anthropic's Claude API under an enterprise data agreement.
        </p>
        <h3>What We Guarantee</h3>
        <ul>
          <li>Your recordings are never used to train Anthropic's or Fixsense's general AI models</li>
          <li>Anthropic processes your data under a zero data retention agreement for API calls</li>
          <li>AI processing occurs in isolated, stateless execution environments</li>
          <li>No human reviews your call content without your explicit authorization</li>
        </ul>
      </section>

      <section className="lp-section" id="compliance">
        <h2>Compliance</h2>
        <div className="lp-badge-row">
          <div className="lp-badge">✅ SOC 2 Type II</div>
          <div className="lp-badge">🔒 ISO 27001 (via Supabase)</div>
          <div className="lp-badge">🇪🇺 GDPR</div>
          <div className="lp-badge">🇳🇬 NDPR 2019</div>
          <div className="lp-badge">💳 PCI DSS (via Paystack)</div>
        </div>
        <h3>Recording Consent</h3>
        <p>
          Fixsense's meeting bot joins calls visibly as "Fixsense AI Recorder" — conspicuous to all participants. Users are responsible for compliance with their jurisdiction's recording consent laws.
        </p>
        <h3>Data Residency</h3>
        <p>
          Enterprise customers with specific data residency requirements should contact us at <a href="mailto:enterprise@fixsense.com.ng">enterprise@fixsense.com.ng</a>.
        </p>
      </section>

      <section className="lp-section" id="incident">
        <h2>Incident Response</h2>
        <p>In the event of a security breach:</p>
        <ol>
          <li>Immediate containment and impact assessment within 1 hour</li>
          <li>Affected customers notified within 72 hours of confirmation</li>
          <li>Regulatory notification as required by GDPR/NDPR</li>
          <li>Post-incident report published within 30 days for significant incidents</li>
          <li>Remediation steps implemented and verified</li>
        </ol>
        <p>
          We conduct tabletop security exercises quarterly to ensure our response procedures are current and effective.
        </p>
      </section>

      <section className="lp-section" id="disclosure">
        <h2>Vulnerability Disclosure</h2>
        <p>
          We welcome responsible disclosure of security vulnerabilities. Please report them before making public.
        </p>
        <div className="lp-highlight">
          <p>
            <strong>Report to:</strong> <a href="mailto:security@fixsense.com.ng">security@fixsense.com.ng</a><br />
            Include: steps to reproduce, potential impact, and any relevant evidence.
          </p>
        </div>
        <p>We commit to:</p>
        <ul>
          <li>Acknowledge receipt within 24 hours</li>
          <li>Provide a status update within 5 business days</li>
          <li>Not pursue legal action for good-faith security research</li>
          <li>Credit researchers in our security acknowledgments (if desired)</li>
        </ul>
      </section>

      <section className="lp-section" id="contact">
        <h2>Contact Security</h2>
        <p>For security-related matters:</p>
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
//  CONTACT PAGE
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
    setSending(false);
    setSent(true);
  };

  const contactCards = [
    { icon: "💬", title: "General Support",    desc: "Questions about your account, billing, or features.",          link: "mailto:support@fixsense.com.ng",    label: "support@fixsense.com.ng"    },
    { icon: "🔒", title: "Security & Privacy", desc: "Report vulnerabilities, data concerns, or privacy inquiries.", link: "mailto:security@fixsense.com.ng",   label: "security@fixsense.com.ng"   },
    { icon: "🏢", title: "Enterprise Sales",   desc: "Custom pricing, data residency, SSO, or volume licensing.",   link: "mailto:enterprise@fixsense.com.ng", label: "enterprise@fixsense.com.ng" },
    { icon: "⚖️", title: "Legal & Compliance", desc: "DPAs, legal notices, GDPR/NDPR inquiries, subpoenas.",        link: "mailto:legal@fixsense.com.ng",      label: "legal@fixsense.com.ng"      },
  ];

  const faqs = [
    { q: "What's the typical response time for support?",      a: "We aim to respond within 24 hours on business days. Enterprise customers get priority response within 4 hours. Urgent security issues are addressed within 1 hour." },
    { q: "I can't access my account. What should I do?",       a: "Try the 'Forgot Password' link on the login page. If that doesn't work, email support@fixsense.com.ng with your account email and we'll manually verify and restore access." },
    { q: "How do I cancel my subscription?",                   a: "Cancel directly from your Billing dashboard at any time. Your access continues until the end of the billing period. Email billing@fixsense.com.ng if you need help." },
    { q: "Can I get a demo before subscribing?",               a: "Yes — the Free plan includes up to 5 meetings per month, no credit card required. For a personalized demo with our team, email enterprise@fixsense.com.ng." },
    { q: "Do you offer refunds?",                              a: "We offer a 7-day money-back guarantee on new paid subscriptions. After 7 days, refunds are considered case-by-case. Email billing@fixsense.com.ng." },
  ];

  const NAV = [
    { href: "/privacy",  label: "Privacy"  },
    { href: "/terms",    label: "Terms"    },
    { href: "/security", label: "Security" },
    { href: "/contact",  label: "Contact"  },
  ];

  return (
    <div className="lp-page">
      <style>{sharedStyles}</style>

      {/* Nav */}
      <nav className="lp-nav">
        <div className="lp-nav-inner">
          <Link to="/" className="lp-nav-brand">
            <img src="/fixsense_icon_logo (2).png" alt="Fixsense" className="lp-nav-logo" />
            <span className="lp-nav-name">Fixsense</span>
          </Link>
          <div className="lp-nav-links">
            {NAV.map((l) => (
              <Link key={l.href} to={l.href} className={`lp-nav-link ${l.label === "Contact" ? "lp-nav-link--active" : ""}`}>
                {l.label}
              </Link>
            ))}
          </div>
          <Link to="/dashboard" className="lp-nav-btn">Dashboard →</Link>
        </div>
      </nav>

      {/* Hero */}
      <div className="lp-hero">
        <div className="lp-hero-pattern" />
        <div className="lp-hero-inner">
          <div className="lp-breadcrumb">
            <Link to="/">Home</Link>
            <span className="sep">/</span>
            <span className="current">Contact</span>
          </div>
          <div className="lp-kicker">
            <div className="lp-kicker-dot" />
            Get in Touch
          </div>
          <h1 className="lp-h1">
            We're here.<br /><span className="blue">Let's talk.</span>
          </h1>
          <p className="lp-sub">
            Whether you have a question about your account, a security concern, or want to discuss enterprise needs — the right team is just an email away.
          </p>
          <div className="lp-meta">
            <div className="lp-meta-item"><div className="lp-meta-dot" />Avg. response: &lt;24 hours</div>
            <div className="lp-meta-item">Mon–Fri, 9am–6pm WAT</div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ maxWidth: 1160, margin: "0 auto", padding: "64px 24px 96px" }}>

        {/* Contact cards */}
        <div className="contact-cards">
          {contactCards.map((card) => (
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
              <div className="form-success-sub">
                We've received your message and will get back to you within 24 hours. Check your inbox for a confirmation.
              </div>
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
                      <option value="legal">Legal or compliance inquiry</option>
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
                  {sending ? (
                    <><span style={{ display: "inline-block", animation: "spin 1s linear infinite" }}>⟳</span> Sending…</>
                  ) : (
                    <>Send Message →</>
                  )}
                </button>
              </form>
            </>
          )}
        </div>

        {/* FAQ */}
        <div>
          <div className="faq-section-title">Frequently asked questions</div>
          <div className="faq-section-sub">Quick answers to the most common questions.</div>
          {faqs.map((faq, i) => (
            <div className="faq-item" key={i}>
              <button className="faq-q" onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                {faq.q}
                <span className={`faq-chevron ${openFaq === i ? "faq-chevron--open" : ""}`}>▾</span>
              </button>
              <div className={`faq-a ${openFaq === i ? "faq-a--open" : ""}`}>
                <p>{faq.a}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <footer className="lp-footer">
        <div className="lp-footer-inner">
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div className="lp-footer-brand">
              <img src="/fixsense_icon_logo (2).png" alt="Fixsense" className="lp-footer-logo" />
              <span className="lp-footer-name">Fixsense</span>
            </div>
            <span className="lp-footer-copy">© {new Date().getFullYear()} Fixsense, Inc. All rights reserved.</span>
          </div>
          <div className="lp-footer-links">
            {[
              { href: "/privacy",  label: "Privacy Policy" },
              { href: "/terms",    label: "Terms of Service" },
              { href: "/security", label: "Security" },
              { href: "/contact",  label: "Contact" },
            ].map((l) => (
              <Link key={l.href} to={l.href} className="lp-footer-link">{l.label}</Link>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
