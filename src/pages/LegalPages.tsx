/**
 * Fixsense Legal & Contact Pages
 * 
 * Four pages: PrivacyPage, TermsPage, SecurityPage, ContactPage
 * 
 * Add to App.tsx:
 *   import { PrivacyPage, TermsPage, SecurityPage, ContactPage } from "./pages/LegalPages";
 *   <Route path="/privacy" element={<PrivacyPage />} />
 *   <Route path="/terms" element={<TermsPage />} />
 *   <Route path="/security" element={<SecurityPage />} />
 *   <Route path="/contact" element={<ContactPage />} />
 */

import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";

// ─── Shared styles ────────────────────────────────────────────────────────────

const sharedStyles = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=Bricolage+Grotesque:wght@600;700;800&family=DM+Mono:wght@400;500&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  .lp-page {
    --bg: #080b13;
    --bg2: #0c1020;
    --border: rgba(255,255,255,0.07);
    --border2: rgba(255,255,255,0.12);
    --t1: rgba(255,255,255,0.95);
    --t2: rgba(255,255,255,0.55);
    --t3: rgba(255,255,255,0.28);
    --ac: #1af0c4;
    --ac2: rgba(26,240,196,0.12);
    --ac3: rgba(26,240,196,0.06);
    --blue: #60a5fa;
    --font: 'DM Sans', system-ui, sans-serif;
    --font-display: 'Bricolage Grotesque', sans-serif;
    --font-mono: 'DM Mono', monospace;
    background: var(--bg);
    color: var(--t1);
    font-family: var(--font);
    -webkit-font-smoothing: antialiased;
    min-height: 100vh;
    line-height: 1.7;
    overflow-x: hidden;
  }

  .lp-page * { box-sizing: border-box; }

  /* ── Nav ── */
  .lp-nav {
    position: fixed; top: 0; left: 0; right: 0; z-index: 100;
    height: 60px;
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 32px;
    background: rgba(8,11,19,0.92);
    backdrop-filter: blur(20px);
    border-bottom: 1px solid var(--border);
  }
  .lp-nav-brand {
    display: flex; align-items: center; gap: 10px;
    text-decoration: none;
  }
  .lp-nav-logo {
    width: 28px; height: 28px; border-radius: 8px; object-fit: cover;
  }
  .lp-nav-name {
    font-family: var(--font-display);
    font-size: 16px; font-weight: 700;
    color: var(--t1); letter-spacing: -0.03em;
  }
  .lp-nav-links {
    display: flex; align-items: center; gap: 24px;
  }
  .lp-nav-link {
    font-size: 13px; font-weight: 500; color: var(--t2);
    text-decoration: none; transition: color 0.15s;
  }
  .lp-nav-link:hover { color: var(--t1); }
  .lp-nav-link--active { color: var(--ac); }
  .lp-nav-btn {
    display: inline-flex; align-items: center; gap: 6px;
    background: rgba(26,240,196,0.12);
    border: 1px solid rgba(26,240,196,0.25);
    border-radius: 8px; padding: 7px 16px;
    font-size: 13px; font-weight: 600; color: var(--ac);
    text-decoration: none; transition: all 0.15s; cursor: pointer;
  }
  .lp-nav-btn:hover { background: rgba(26,240,196,0.18); }

  /* ── Hero band ── */
  .lp-hero {
    padding: 120px 32px 60px;
    max-width: 840px; margin: 0 auto; position: relative;
  }
  .lp-hero::before {
    content: '';
    position: absolute; top: 60px; left: 50%; transform: translateX(-50%);
    width: 600px; height: 300px;
    background: radial-gradient(ellipse, rgba(26,240,196,0.06) 0%, transparent 70%);
    pointer-events: none;
  }
  .lp-tag {
    display: inline-flex; align-items: center; gap: 6px;
    font-family: var(--font-mono); font-size: 11px; font-weight: 500;
    color: var(--ac); letter-spacing: 0.1em; text-transform: uppercase;
    background: var(--ac3); border: 1px solid rgba(26,240,196,0.2);
    border-radius: 20px; padding: 5px 14px;
    margin-bottom: 20px;
  }
  .lp-tag-dot {
    width: 6px; height: 6px; border-radius: 50%; background: var(--ac);
  }
  .lp-h1 {
    font-family: var(--font-display);
    font-size: clamp(32px, 5vw, 52px);
    font-weight: 800; letter-spacing: -0.04em; line-height: 1.1;
    color: var(--t1); margin-bottom: 16px;
  }
  .lp-h1 span { color: var(--ac); }
  .lp-sub {
    font-size: 16px; color: var(--t2); line-height: 1.65;
    max-width: 540px; margin-bottom: 32px;
  }
  .lp-meta {
    display: flex; align-items: center; gap: 20px; flex-wrap: wrap;
  }
  .lp-meta-item {
    display: flex; align-items: center; gap: 6px;
    font-size: 12px; color: var(--t3); font-family: var(--font-mono);
  }
  .lp-meta-dot { width: 4px; height: 4px; border-radius: 50%; background: var(--t3); }

  /* ── Page body ── */
  .lp-body {
    max-width: 840px; margin: 0 auto; padding: 0 32px 80px;
    display: grid; grid-template-columns: 200px 1fr; gap: 48px;
    align-items: start;
  }
  @media(max-width:768px){
    .lp-body { grid-template-columns: 1fr; gap: 24px; }
    .lp-toc { display: none; }
    .lp-hero { padding: 100px 20px 40px; }
    .lp-body { padding: 0 20px 60px; }
    .lp-nav { padding: 0 16px; }
    .lp-nav-links { display: none; }
  }

  /* ── TOC ── */
  .lp-toc {
    position: sticky; top: 80px;
    padding: 16px; border: 1px solid var(--border); border-radius: 12px;
    background: var(--bg2);
  }
  .lp-toc-title {
    font-size: 10px; font-weight: 700; color: var(--t3);
    text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 12px;
    font-family: var(--font-mono);
  }
  .lp-toc-link {
    display: block; padding: 5px 8px; border-radius: 6px;
    font-size: 12px; font-weight: 500; color: var(--t2);
    text-decoration: none; transition: all 0.12s; margin-bottom: 2px;
    border-left: 2px solid transparent;
  }
  .lp-toc-link:hover { color: var(--t1); background: rgba(255,255,255,0.04); }
  .lp-toc-link--active { color: var(--ac); border-left-color: var(--ac); }

  /* ── Content ── */
  .lp-content { min-width: 0; }
  .lp-section {
    margin-bottom: 48px; scroll-margin-top: 80px;
  }
  .lp-section h2 {
    font-family: var(--font-display);
    font-size: 22px; font-weight: 700; letter-spacing: -0.03em;
    color: var(--t1); margin-bottom: 16px;
    padding-bottom: 12px; border-bottom: 1px solid var(--border);
  }
  .lp-section h3 {
    font-family: var(--font-display);
    font-size: 16px; font-weight: 600; color: var(--t1);
    margin: 24px 0 10px;
  }
  .lp-section p {
    font-size: 14px; color: var(--t2); line-height: 1.75;
    margin-bottom: 14px;
  }
  .lp-section ul, .lp-section ol {
    margin: 0 0 14px 0; padding-left: 0;
    list-style: none;
  }
  .lp-section ul li, .lp-section ol li {
    font-size: 14px; color: var(--t2); line-height: 1.65;
    display: flex; align-items: flex-start; gap: 10px;
    margin-bottom: 8px;
  }
  .lp-section ul li::before {
    content: '—'; color: var(--ac); font-size: 12px;
    font-family: var(--font-mono); flex-shrink: 0; margin-top: 2px;
  }
  .lp-section ol { counter-reset: item; }
  .lp-section ol li::before {
    counter-increment: item; content: counter(item) '.';
    color: var(--ac); font-size: 12px; font-family: var(--font-mono);
    flex-shrink: 0; margin-top: 2px; font-weight: 600; min-width: 18px;
  }
  .lp-section a {
    color: var(--ac); text-decoration: none;
  }
  .lp-section a:hover { text-decoration: underline; }
  .lp-highlight {
    background: var(--ac3); border: 1px solid rgba(26,240,196,0.15);
    border-radius: 10px; padding: 16px 18px; margin: 20px 0;
  }
  .lp-highlight p { color: rgba(255,255,255,0.75); margin: 0; font-size: 14px; }
  .lp-highlight strong { color: var(--ac); font-weight: 600; }
  .lp-badge-row {
    display: flex; flex-wrap: wrap; gap: 8px; margin: 16px 0;
  }
  .lp-badge {
    display: flex; align-items: center; gap: 6px;
    background: rgba(255,255,255,0.04); border: 1px solid var(--border);
    border-radius: 20px; padding: 5px 12px;
    font-size: 12px; color: var(--t2); font-family: var(--font-mono);
  }
  .lp-badge-icon { font-size: 14px; }
  code {
    font-family: var(--font-mono);
    font-size: 12px; color: var(--ac);
    background: var(--ac3); border-radius: 4px; padding: 1px 6px;
  }

  /* ── Footer ── */
  .lp-footer {
    border-top: 1px solid var(--border);
    padding: 32px;
    display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px;
  }
  .lp-footer-left { display: flex; align-items: center; gap: 10px; }
  .lp-footer-text { font-size: 12px; color: var(--t3); }
  .lp-footer-links { display: flex; gap: 20px; flex-wrap: wrap; }
  .lp-footer-link { font-size: 12px; color: var(--t3); text-decoration: none; transition: color 0.15s; }
  .lp-footer-link:hover { color: var(--t2); }
`;

// ─── Shared Layout ─────────────────────────────────────────────────────────────

function LegalLayout({
  page,
  tag,
  title,
  titleHighlight,
  subtitle,
  updated,
  version,
  sections,
  children,
}: {
  page: string;
  tag: string;
  title: string;
  titleHighlight?: string;
  subtitle: string;
  updated: string;
  version: string;
  sections: { id: string; label: string }[];
  children: React.ReactNode;
}) {
  const [activeSection, setActiveSection] = useState(sections[0]?.id);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActiveSection(entry.target.id);
        });
      },
      { rootMargin: "-20% 0px -70% 0px" }
    );
    sections.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [sections]);

  const navLinks = [
    { href: "/privacy", label: "Privacy" },
    { href: "/terms", label: "Terms" },
    { href: "/security", label: "Security" },
    { href: "/contact", label: "Contact" },
  ];

  return (
    <div className="lp-page">
      <style>{sharedStyles}</style>

      {/* Nav */}
      <nav className="lp-nav">
        <a href="/" className="lp-nav-brand">
          <img src="/fixsense_icon_logo (2).png" alt="Fixsense" className="lp-nav-logo" />
          <span className="lp-nav-name">Fixsense</span>
        </a>
        <div className="lp-nav-links">
          {navLinks.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className={`lp-nav-link ${page === l.label.toLowerCase() ? "lp-nav-link--active" : ""}`}
            >
              {l.label}
            </a>
          ))}
        </div>
        <a href="/dashboard" className="lp-nav-btn">Dashboard →</a>
      </nav>

      {/* Hero */}
      <div className="lp-hero">
        <div className="lp-tag"><span className="lp-tag-dot" />{tag}</div>
        <h1 className="lp-h1">
          {title}
          {titleHighlight && <><br /><span>{titleHighlight}</span></>}
        </h1>
        <p className="lp-sub">{subtitle}</p>
        <div className="lp-meta">
          <div className="lp-meta-item">Last updated: {updated}</div>
          <div className="lp-meta-dot" />
          <div className="lp-meta-item">Version {version}</div>
          <div className="lp-meta-dot" />
          <div className="lp-meta-item">Effective immediately</div>
        </div>
      </div>

      {/* Body */}
      <div className="lp-body">
        {/* TOC */}
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

        {/* Content */}
        <div className="lp-content" ref={contentRef}>
          {children}
        </div>
      </div>

      {/* Footer */}
      <footer className="lp-footer">
        <div className="lp-footer-left">
          <span className="lp-footer-text">© {new Date().getFullYear()} Fixsense, Inc.</span>
        </div>
        <div className="lp-footer-links">
          {[
            { href: "/privacy", label: "Privacy Policy" },
            { href: "/terms", label: "Terms of Service" },
            { href: "/security", label: "Security" },
            { href: "/contact", label: "Contact" },
          ].map((l) => (
            <a key={l.href} href={l.href} className="lp-footer-link">{l.label}</a>
          ))}
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
    <LegalLayout
      page="privacy"
      tag="Legal · Privacy Policy"
      title="Your data."
      titleHighlight="Our responsibility."
      subtitle="We're committed to protecting your personal information and being transparent about what we collect and why."
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
          <li>Billing name and payment method information (processed by Paystack)</li>
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
          <p><strong>We do not sell your data.</strong> We do not share your personal information with advertisers or data brokers.</p>
        </div>
        <p>We may share data in limited circumstances:</p>
        <h3>Service Providers</h3>
        <p>
          We work with trusted third-party vendors to operate our service. These providers process data only on our behalf under strict confidentiality agreements:
        </p>
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
          Your data is stored on servers operated by Supabase in their contracted cloud infrastructure. All data is encrypted at rest (AES-256) and in transit (TLS 1.3).
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
          You may request early deletion of recordings or transcripts at any time through your account settings or by contacting <a href="mailto:privacy@fixsense.com.ng">privacy@fixsense.com.ng</a>.
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
          To exercise any of these rights, contact us at <a href="mailto:privacy@fixsense.com.ng">privacy@fixsense.com.ng</a>. We will respond within 30 days. You can also export and delete your account data directly from your Profile Settings page.
        </p>
        <h3>GDPR (European Users)</h3>
        <p>
          If you are located in the European Economic Area, you have additional rights under the General Data Protection Regulation. Our lawful basis for processing includes contract performance (providing the service), legitimate interests, and consent where applicable.
        </p>
        <h3>NDPR (Nigerian Users)</h3>
        <p>
          We comply with the Nigeria Data Protection Regulation (NDPR). Users in Nigeria have full data subject rights. Our Data Protection Officer can be reached at <a href="mailto:dpo@fixsense.com.ng">dpo@fixsense.com.ng</a>.
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
          <li>Email: <a href="mailto:privacy@fixsense.com.ng">privacy@fixsense.com.ng</a></li>
          <li>Data Protection Officer: <a href="mailto:dpo@fixsense.com.ng">dpo@fixsense.com.ng</a></li>
          <li>Address: Fixsense, Inc., Benin City, Edo State, Nigeria</li>
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
    { id: "agreement", label: "Agreement to Terms" },
    { id: "services", label: "Use of Services" },
    { id: "accounts", label: "Accounts" },
    { id: "plans", label: "Plans & Billing" },
    { id: "content", label: "Your Content" },
    { id: "acceptable-use", label: "Acceptable Use" },
    { id: "intellectual-property", label: "Intellectual Property" },
    { id: "third-party", label: "Third-Party Services" },
    { id: "warranty", label: "Disclaimers" },
    { id: "liability", label: "Limitation of Liability" },
    { id: "termination", label: "Termination" },
    { id: "governing-law", label: "Governing Law" },
    { id: "contact", label: "Contact" },
  ];

  return (
    <LegalLayout
      page="terms"
      tag="Legal · Terms of Service"
      title="The rules of"
      titleHighlight="the road."
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
          We reserve the right to modify, suspend, or discontinue any part of the Services at any time. We will provide reasonable notice for material changes.
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
          <li>All paid plans are billed monthly in Nigerian Naira (NGN) via Paystack</li>
          <li>Prices are displayed in USD and converted at a fixed rate (1 USD = ₦1,500)</li>
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
        <h3>AI Processing</h3>
        <p>
          You explicitly authorize Fixsense to use AI models to analyze Your Content for the purpose of generating transcripts, summaries, coaching insights, and other features. We do not use Your Content to train general AI models.
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
          <li>Use our Services for any purpose that violates applicable laws or regulations</li>
          <li>Transmit malware, viruses, or any malicious code</li>
          <li>Harass, threaten, or intimidate other users or our team</li>
        </ul>
        <p>
          Violations may result in immediate account suspension without refund and reporting to appropriate authorities where required.
        </p>
      </section>

      <section className="lp-section" id="intellectual-property">
        <h2>Intellectual Property</h2>
        <p>
          The Fixsense platform, brand, website, and all associated technology, software, algorithms, and AI models are owned by Fixsense, Inc. and protected by copyright, trademark, and other intellectual property laws.
        </p>
        <p>
          Nothing in these Terms grants you rights to use the Fixsense name, logo, or trademarks without our prior written consent.
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
          We are not responsible for the availability, accuracy, or practices of third-party services. Revoking third-party access may limit certain Fixsense features.
        </p>
      </section>

      <section className="lp-section" id="warranty">
        <h2>Disclaimers</h2>
        <p>
          THE SERVICES ARE PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT.
        </p>
        <p>
          We do not warrant that: (a) the Services will be uninterrupted or error-free; (b) defects will be corrected; (c) AI-generated insights are accurate, complete, or suitable for any specific purpose.
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
          OUR TOTAL LIABILITY TO YOU FOR ANY CLAIMS ARISING FROM OR RELATED TO THE SERVICES SHALL NOT EXCEED THE AMOUNT YOU PAID FIXSENSE IN THE 12 MONTHS PRECEDING THE CLAIM.
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
        <p>
          Sections on Intellectual Property, Disclaimers, Limitation of Liability, and Governing Law survive termination.
        </p>
      </section>

      <section className="lp-section" id="governing-law">
        <h2>Governing Law</h2>
        <p>
          These Terms are governed by the laws of the Federal Republic of Nigeria, without regard to conflict of law principles. Any disputes shall be resolved in the courts of Edo State, Nigeria.
        </p>
        <p>
          If any provision of these Terms is found unenforceable, the remaining provisions continue in full force.
        </p>
        <p>
          We may update these Terms with 30 days' notice. Continued use constitutes acceptance. If you disagree with changes, you may terminate your account before the effective date.
        </p>
      </section>

      <section className="lp-section" id="contact">
        <h2>Contact</h2>
        <p>Questions about these Terms? Reach us at:</p>
        <ul>
          <li>Email: <a href="mailto:legal@fixsense.com.ng">legal@fixsense.com.ng</a></li>
          <li>Address: Fixsense, Inc., Benin City, Edo State, Nigeria</li>
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
    <LegalLayout
      page="security"
      tag="Trust & Safety · Security"
      title="Built for"
      titleHighlight="enterprise trust."
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
          Fixsense is built on security-first infrastructure. Every design decision — from how we store recordings to how our AI models process transcripts — prioritizes the confidentiality and integrity of your data.
        </p>
        <div className="lp-badge-row">
          <div className="lp-badge"><span className="lp-badge-icon">🔒</span> AES-256 Encryption</div>
          <div className="lp-badge"><span className="lp-badge-icon">🛡️</span> TLS 1.3</div>
          <div className="lp-badge"><span className="lp-badge-icon">✅</span> SOC 2 Type II</div>
          <div className="lp-badge"><span className="lp-badge-icon">🇳🇬</span> NDPR Compliant</div>
          <div className="lp-badge"><span className="lp-badge-icon">🇪🇺</span> GDPR Ready</div>
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
          <li>Database is not publicly accessible — only accessible through authenticated API layer</li>
          <li>Edge functions run in isolated, ephemeral environments</li>
          <li>Web Application Firewall (WAF) on all inbound traffic</li>
        </ul>
        <h3>Availability</h3>
        <p>
          We target 99.9% uptime. Real-time status is available at our status page. Planned maintenance windows are announced at least 24 hours in advance.
        </p>
      </section>

      <section className="lp-section" id="encryption">
        <h2>Encryption</h2>
        <h3>Data at Rest</h3>
        <ul>
          <li>All database data encrypted with <code>AES-256</code></li>
          <li>Call recordings and audio files encrypted in object storage</li>
          <li>Encryption keys managed by the cloud provider's KMS with regular rotation</li>
          <li>OAuth tokens and API keys stored encrypted using column-level encryption</li>
        </ul>
        <h3>Data in Transit</h3>
        <ul>
          <li>All connections enforced over <code>TLS 1.3</code> minimum</li>
          <li>HTTPS enforced with HSTS headers; HTTP automatically redirected</li>
          <li>Internal service-to-service communication also encrypted</li>
          <li>WebSocket connections for real-time features use WSS (TLS)</li>
        </ul>
        <h3>Key Management</h3>
        <p>
          Encryption keys are managed through the hosting provider's KMS. Keys are never stored alongside the data they encrypt. Automatic key rotation occurs on a scheduled basis.
        </p>
      </section>

      <section className="lp-section" id="access">
        <h2>Access Control</h2>
        <h3>Authentication</h3>
        <ul>
          <li>Passwords are hashed using <code>bcrypt</code> with a strong salt factor</li>
          <li>Google OAuth available as a secure authentication alternative</li>
          <li>Session tokens are short-lived with automatic renewal</li>
          <li>Brute-force protection and account lockout on repeated failures</li>
        </ul>
        <h3>Authorization (Row-Level Security)</h3>
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
          When you record a call, audio is securely transmitted to our edge functions, processed for transcription, then stored encrypted. AI analysis (summaries, objection detection, coaching insights) is performed using Anthropic's Claude API with your content submitted under an enterprise data agreement.
        </p>
        <h3>What We Guarantee</h3>
        <ul>
          <li>Your recordings are never used to train Anthropic's or Fixsense's general AI models</li>
          <li>Anthropic processes your data under a zero data retention agreement for API calls</li>
          <li>AI processing occurs in isolated, stateless execution environments</li>
          <li>No human reviews your call content unless you explicitly contact support about a specific issue and authorize it</li>
        </ul>
        <h3>Data Minimization</h3>
        <p>
          We only collect the data necessary to provide our services. Temporary processing artifacts (intermediate transcription buffers) are deleted immediately after processing.
        </p>
      </section>

      <section className="lp-section" id="compliance">
        <h2>Compliance</h2>
        <h3>Certifications & Standards</h3>
        <div className="lp-badge-row">
          <div className="lp-badge"><span className="lp-badge-icon">✅</span> SOC 2 Type II</div>
          <div className="lp-badge"><span className="lp-badge-icon">🔒</span> ISO 27001 (via Supabase)</div>
          <div className="lp-badge"><span className="lp-badge-icon">🇪🇺</span> GDPR</div>
          <div className="lp-badge"><span className="lp-badge-icon">🇳🇬</span> NDPR 2019</div>
          <div className="lp-badge"><span className="lp-badge-icon">💳</span> PCI DSS (via Paystack)</div>
        </div>
        <h3>Recording Consent Compliance</h3>
        <p>
          Fixsense's meeting bot joins calls visibly as "Fixsense AI Recorder" — conspicuous to all participants. We support recording consent frameworks but users are responsible for compliance with their jurisdiction's recording consent laws (one-party vs. two-party consent).
        </p>
        <h3>Data Residency</h3>
        <p>
          Data is currently stored in Supabase's designated cloud regions. Enterprise customers with specific data residency requirements should contact us at <a href="mailto:enterprise@fixsense.com.ng">enterprise@fixsense.com.ng</a>.
        </p>
      </section>

      <section className="lp-section" id="incident">
        <h2>Incident Response</h2>
        <p>We maintain a documented incident response plan with clear roles and escalation paths. In the event of a security breach:</p>
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
          We welcome responsible disclosure of security vulnerabilities. If you discover a potential security issue, please report it to us before making it public.
        </p>
        <div className="lp-highlight">
          <p>
            <strong>Report to:</strong> <a href="mailto:security@fixsense.com.ng">security@fixsense.com.ng</a><br />
            Please include: steps to reproduce, potential impact, and any relevant evidence.
          </p>
        </div>
        <p>We commit to:</p>
        <ul>
          <li>Acknowledge receipt within 24 hours</li>
          <li>Provide a status update within 5 business days</li>
          <li>Not pursue legal action for good-faith security research</li>
          <li>Credit researchers in our security acknowledgments (if desired)</li>
        </ul>
        <p>
          Please do not access or modify other users' data during your research. Scope is limited to fixsense.com.ng and its subdomains.
        </p>
      </section>

      <section className="lp-section" id="contact">
        <h2>Contact Security</h2>
        <p>For security-related matters:</p>
        <ul>
          <li>Security vulnerabilities: <a href="mailto:security@fixsense.com.ng">security@fixsense.com.ng</a></li>
          <li>Data breach reports: <a href="mailto:security@fixsense.com.ng">security@fixsense.com.ng</a></li>
          <li>Enterprise security inquiries: <a href="mailto:enterprise@fixsense.com.ng">enterprise@fixsense.com.ng</a></li>
          <li>GDPR/NDPR inquiries: <a href="mailto:dpo@fixsense.com.ng">dpo@fixsense.com.ng</a></li>
        </ul>
        <p>
          For urgent security matters, please mark your email subject with <code>[URGENT SECURITY]</code>.
        </p>
      </section>
    </LegalLayout>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  CONTACT PAGE
// ─────────────────────────────────────────────────────────────────────────────

const contactStyles = `
  ${sharedStyles}

  .contact-grid {
    display: grid; grid-template-columns: 1fr 1fr;
    gap: 16px; margin-bottom: 48px;
  }
  @media(max-width:640px){ .contact-grid { grid-template-columns: 1fr; } }

  .contact-card {
    background: var(--bg2); border: 1px solid var(--border);
    border-radius: 14px; padding: 24px;
    transition: border-color 0.2s;
  }
  .contact-card:hover { border-color: rgba(26,240,196,0.25); }
  .contact-card-icon {
    font-size: 28px; margin-bottom: 12px; display: block;
  }
  .contact-card-title {
    font-family: var(--font-display); font-size: 16px; font-weight: 700;
    color: var(--t1); margin-bottom: 6px; letter-spacing: -0.02em;
  }
  .contact-card-desc {
    font-size: 13px; color: var(--t2); line-height: 1.6; margin-bottom: 14px;
  }
  .contact-card-link {
    font-size: 13px; font-weight: 600; color: var(--ac);
    text-decoration: none; font-family: var(--font-mono);
    display: flex; align-items: center; gap: 5px;
  }
  .contact-card-link:hover { text-decoration: underline; }

  .contact-form-wrap {
    background: var(--bg2); border: 1px solid var(--border);
    border-radius: 16px; padding: 36px; margin-bottom: 48px;
  }
  .contact-form-title {
    font-family: var(--font-display); font-size: 22px; font-weight: 700;
    color: var(--t1); letter-spacing: -0.03em; margin-bottom: 6px;
  }
  .contact-form-sub {
    font-size: 14px; color: var(--t2); margin-bottom: 28px;
  }
  .contact-form { display: flex; flex-direction: column; gap: 16px; }
  .contact-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  @media(max-width:580px){ .contact-row { grid-template-columns: 1fr; } }
  .form-field { display: flex; flex-direction: column; gap: 6px; }
  .form-label {
    font-size: 11px; font-weight: 600; color: var(--t3);
    text-transform: uppercase; letter-spacing: 0.08em; font-family: var(--font-mono);
  }
  .form-input, .form-select, .form-textarea {
    background: rgba(255,255,255,0.04); border: 1px solid var(--border);
    border-radius: 10px; padding: 11px 14px;
    color: var(--t1); font-size: 14px; font-family: var(--font);
    outline: none; transition: border-color 0.15s;
    width: 100%;
  }
  .form-input::placeholder, .form-textarea::placeholder { color: var(--t3); }
  .form-input:focus, .form-select:focus, .form-textarea:focus {
    border-color: rgba(26,240,196,0.4);
  }
  .form-select { color-scheme: dark; cursor: pointer; }
  .form-select option { background: #0c1020; color: var(--t1); }
  .form-textarea { resize: vertical; min-height: 120px; line-height: 1.6; }
  .form-submit {
    display: inline-flex; align-items: center; gap: 8px;
    background: rgba(26,240,196,0.15); border: 1px solid rgba(26,240,196,0.35);
    border-radius: 10px; padding: 13px 28px;
    font-size: 14px; font-weight: 600; color: var(--ac);
    font-family: var(--font); cursor: pointer; transition: all 0.15s;
    align-self: flex-start;
  }
  .form-submit:hover { background: rgba(26,240,196,0.22); transform: translateY(-1px); }
  .form-submit:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
  .form-success {
    display: flex; flex-direction: column; align-items: center;
    justify-content: center; padding: 40px; text-align: center; gap: 12px;
  }
  .form-success-icon { font-size: 48px; }
  .form-success-title {
    font-family: var(--font-display); font-size: 20px; font-weight: 700;
    color: var(--t1); letter-spacing: -0.03em;
  }
  .form-success-sub { font-size: 14px; color: var(--t2); max-width: 320px; }

  .faq-item {
    border: 1px solid var(--border); border-radius: 12px;
    margin-bottom: 10px; overflow: hidden;
  }
  .faq-q {
    width: 100%; display: flex; align-items: center; justify-content: space-between;
    padding: 16px 20px; background: transparent; border: none; cursor: pointer;
    text-align: left; font-size: 14px; font-weight: 600; color: var(--t1);
    font-family: var(--font); transition: background 0.12s;
  }
  .faq-q:hover { background: rgba(255,255,255,0.03); }
  .faq-chevron { font-size: 16px; color: var(--t3); transition: transform 0.2s; flex-shrink: 0; }
  .faq-chevron--open { transform: rotate(180deg); color: var(--ac); }
  .faq-a {
    padding: 0 20px; max-height: 0; overflow: hidden;
    transition: max-height 0.25s ease, padding 0.25s ease;
  }
  .faq-a--open { max-height: 200px; padding: 0 20px 16px; }
  .faq-a p { font-size: 13px; color: var(--t2); line-height: 1.65; margin: 0; }

  .lp-body-single {
    max-width: 840px; margin: 0 auto; padding: 0 32px 80px;
  }
  @media(max-width:768px){ .lp-body-single { padding: 0 20px 60px; } }
`;

export function ContactPage() {
  const [form, setForm] = useState({
    name: "", email: "", company: "", category: "", message: "",
  });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    // Simulate form submission
    await new Promise(res => setTimeout(res, 1400));
    setSending(false);
    setSent(true);
  };

  const contactCards = [
    {
      icon: "💬",
      title: "General Support",
      desc: "Questions about your account, billing, or how to use a feature.",
      link: "mailto:support@fixsense.com.ng",
      label: "support@fixsense.com.ng",
    },
    {
      icon: "🔒",
      title: "Security & Privacy",
      desc: "Report vulnerabilities, data concerns, or privacy inquiries.",
      link: "mailto:security@fixsense.com.ng",
      label: "security@fixsense.com.ng",
    },
    {
      icon: "🏢",
      title: "Enterprise Sales",
      desc: "Custom pricing, data residency, SSO, or volume licensing.",
      link: "mailto:enterprise@fixsense.com.ng",
      label: "enterprise@fixsense.com.ng",
    },
    {
      icon: "⚖️",
      title: "Legal & Compliance",
      desc: "DPAs, legal notices, GDPR/NDPR inquiries, subpoenas.",
      link: "mailto:legal@fixsense.com.ng",
      label: "legal@fixsense.com.ng",
    },
  ];

  const faqs = [
    {
      q: "What's the typical response time for support?",
      a: "We aim to respond to all support inquiries within 24 hours on business days. Enterprise customers receive priority response within 4 hours. Urgent security issues are addressed within 1 hour.",
    },
    {
      q: "I can't access my account. What should I do?",
      a: "Try the 'Forgot Password' link on the login page first. If that doesn't work, email support@fixsense.com.ng with your account email and we'll manually verify your identity and restore access.",
    },
    {
      q: "How do I cancel my subscription?",
      a: "You can cancel directly from your Billing dashboard at any time. Your access continues until the end of the billing period. If you need help, email billing@fixsense.com.ng.",
    },
    {
      q: "Can I get a demo before subscribing?",
      a: "Absolutely. You can try Fixsense on the Free plan with up to 5 meetings per month — no credit card required. For a personalized demo with a team member, email enterprise@fixsense.com.ng.",
    },
    {
      q: "Do you offer refunds?",
      a: "We offer a 7-day money-back guarantee on new paid subscriptions. After 7 days, refunds are considered on a case-by-case basis. Email billing@fixsense.com.ng.",
    },
  ];

  const navLinks = [
    { href: "/privacy", label: "Privacy" },
    { href: "/terms", label: "Terms" },
    { href: "/security", label: "Security" },
    { href: "/contact", label: "Contact" },
  ];

  return (
    <div className="lp-page">
      <style>{contactStyles}</style>

      <nav className="lp-nav">
        <a href="/" className="lp-nav-brand">
          <img src="/fixsense_icon_logo (2).png" alt="Fixsense" className="lp-nav-logo" />
          <span className="lp-nav-name">Fixsense</span>
        </a>
        <div className="lp-nav-links">
          {navLinks.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className={`lp-nav-link ${l.label === "Contact" ? "lp-nav-link--active" : ""}`}
            >
              {l.label}
            </a>
          ))}
        </div>
        <a href="/dashboard" className="lp-nav-btn">Dashboard →</a>
      </nav>

      {/* Hero */}
      <div className="lp-hero" style={{ maxWidth: 840, margin: "0 auto" }}>
        <div className="lp-tag"><span className="lp-tag-dot" />Get in Touch</div>
        <h1 className="lp-h1">We're here.<br /><span>Let's talk.</span></h1>
        <p className="lp-sub">
          Whether you have a question about your account, a security concern, or want to discuss enterprise needs — the right team is just an email away.
        </p>
        <div className="lp-meta">
          <div className="lp-meta-item">⚡ Avg. response: &lt;24 hours</div>
          <div className="lp-meta-dot" />
          <div className="lp-meta-item">🕐 Mon–Fri, 9am–6pm WAT</div>
        </div>
      </div>

      <div className="lp-body-single">
        {/* Contact cards */}
        <div className="contact-grid">
          {contactCards.map((card) => (
            <div className="contact-card" key={card.title}>
              <span className="contact-card-icon">{card.icon}</span>
              <div className="contact-card-title">{card.title}</div>
              <div className="contact-card-desc">{card.desc}</div>
              <a href={card.link} className="contact-card-link">
                {card.label} →
              </a>
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
                    <input
                      type="text"
                      name="name"
                      className="form-input"
                      placeholder="Alex Johnson"
                      value={form.name}
                      onChange={handleChange}
                      required
                    />
                  </div>
                  <div className="form-field">
                    <label className="form-label">Work email *</label>
                    <input
                      type="email"
                      name="email"
                      className="form-input"
                      placeholder="alex@company.com"
                      value={form.email}
                      onChange={handleChange}
                      required
                    />
                  </div>
                </div>
                <div className="contact-row">
                  <div className="form-field">
                    <label className="form-label">Company</label>
                    <input
                      type="text"
                      name="company"
                      className="form-input"
                      placeholder="Acme Corp"
                      value={form.company}
                      onChange={handleChange}
                    />
                  </div>
                  <div className="form-field">
                    <label className="form-label">Topic *</label>
                    <select
                      name="category"
                      className="form-select"
                      value={form.category}
                      onChange={handleChange}
                      required
                    >
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
                  <textarea
                    name="message"
                    className="form-textarea"
                    placeholder="Tell us what's on your mind. The more detail you provide, the faster we can help."
                    value={form.message}
                    onChange={handleChange}
                    required
                  />
                </div>
                <button
                  type="submit"
                  className="form-submit"
                  disabled={sending}
                >
                  {sending ? (
                    <>
                      <span style={{ display: "inline-block", animation: "spin 1s linear infinite" }}>⟳</span>
                      Sending…
                    </>
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
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 22, fontWeight: 700, color: "rgba(255,255,255,0.95)", letterSpacing: "-0.03em", marginBottom: 8 }}>
              Frequently asked questions
            </div>
            <div style={{ fontSize: 14, color: "rgba(255,255,255,0.45)" }}>
              Quick answers to the most common questions.
            </div>
          </div>
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
        <div className="lp-footer-left">
          <span className="lp-footer-text">© {new Date().getFullYear()} Fixsense, Inc.</span>
        </div>
        <div className="lp-footer-links">
          {[
            { href: "/privacy", label: "Privacy Policy" },
            { href: "/terms", label: "Terms of Service" },
            { href: "/security", label: "Security" },
            { href: "/contact", label: "Contact" },
          ].map((l) => (
            <a key={l.href} href={l.href} className="lp-footer-link">{l.label}</a>
          ))}
        </div>
      </footer>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
