/**
 * LegalPages.tsx: matches the Fixsense landing page's light paper/navy aesthetic.
 * Privacy, Terms, Security, Contact: all unified with that design system.
 */

import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import {
  Lock, ShieldCheck, KeyRound, UserCheck, Trash2, Download,
  Server, Database, Users, Bug, Mail, FileText,
  Globe, Clock, ArrowUpRight, CheckCircle2, Building2,
} from "lucide-react";

// ─── Logo ─────────────────────────────────────────────────────────────────────

function Logo({ size = 28 }: { size?: number }) {
  return (
    <img src="/fixsense_icon_logo (2).png" alt="Fixsense" width={size} height={size}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.24), objectFit: "cover", display: "block", flexShrink: 0 }} />
  );
}

// ─── Shared CSS ───────────────────────────────────────────────────────────────

const sharedCss = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,400;0,14..32,500;0,14..32,600;0,14..32,700;0,14..32,800&family=IBM+Plex+Mono:wght@500&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  .lp-legal {
    --paper: #FAFAF8; --paper2: #F3F2ED; --ink-panel: #14140F;
    --card: rgba(23,23,15,0.025); --card-border: rgba(23,23,15,0.11); --card-hover: rgba(23,23,15,0.05);
    --ink: #17170F; --ink2: rgba(23,23,15,0.66); --ink3: rgba(23,23,15,0.42); --ink4: rgba(23,23,15,0.28);
    --accent: #22315C; --accent2: rgba(34,49,92,0.15); --accent3: rgba(34,49,92,0.07);
    --purple: #5b4b8a; --amber: #8A5A20; --green: #2F6B4F; --blue: #22315C;
    --font: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    --fd: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    --fm: 'IBM Plex Mono', ui-monospace, monospace;
    background: var(--paper); color: var(--ink); font-family: var(--font);
    -webkit-font-smoothing: antialiased; min-height: 100vh; line-height: 1.6; overflow-x: hidden;
  }

  /* NAV */
  .lg-nav { position: fixed; top: 0; left: 0; right: 0; z-index: 100; height: 60px; display: flex; align-items: center; padding: 0 24px; background: rgba(250,250,248,0.92); backdrop-filter: blur(10px); border-bottom: 1px solid var(--card-border); }
  .lg-nav-i { max-width: 1100px; width: 100%; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; }
  .lg-nav-logo { display: flex; align-items: center; gap: 9px; text-decoration: none; }
  .lg-nav-name { font-family: var(--fd); font-size: 15px; font-weight: 700; color: var(--ink); letter-spacing: -0.01em; }
  .lg-nav-links { display: flex; align-items: center; gap: 22px; }
  .lg-nav-link { font-size: 13px; font-weight: 500; color: var(--ink3); text-decoration: none; transition: color 0.2s; }
  .lg-nav-link:hover, .lg-nav-link.act { color: var(--ink); }
  .lg-nav-link.act { color: var(--accent); }
  .lg-nav-cta { font-size: 13px; font-weight: 600; color: var(--paper); background: var(--accent); border: 1px solid var(--accent); padding: 7px 18px; border-radius: 6px; font-family: var(--font); cursor: pointer; text-decoration: none; transition: all 0.15s; }
  .lg-nav-cta:hover { opacity: 0.88; }
  @media(max-width:768px){ .lg-nav-links { display: none; } }

  /* HERO BAND */
  .lg-hero { padding: 108px 24px 60px; position: relative; overflow: hidden; }
  .lg-hero-orb { position: absolute; top: -80px; left: 50%; transform: translateX(-50%); width: 600px; height: 400px; background: radial-gradient(ellipse, rgba(34,49,92,0.05) 0%, transparent 65%); pointer-events: none; }
  .lg-hero-inner { max-width: 1100px; margin: 0 auto; }
  .lg-kicker { display: inline-flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 600; color: var(--accent); text-transform: uppercase; letter-spacing: 0.09em; margin-bottom: 16px; font-family: var(--fm); }
  .lg-kicker-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--green); }
  .lg-h1 { font-family: var(--fd); font-size: clamp(28px,4.5vw,50px); font-weight: 700; letter-spacing: -0.03em; line-height: 1.07; color: var(--ink); margin-bottom: 14px; }
  .lg-h1 .c { color: var(--accent); }
  .lg-sub { font-size: 16px; color: var(--ink2); line-height: 1.7; max-width: 540px; margin-bottom: 24px; }
  .lg-meta { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  .lg-meta-pill { display: inline-flex; align-items: center; gap: 6px; background: var(--paper2); border: 1px solid var(--card-border); border-radius: 20px; padding: 5px 14px; font-size: 12px; color: var(--ink3); }
  .lg-meta-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--green); }
  .lg-breadcrumb { display: flex; align-items: center; gap: 7px; margin-bottom: 20px; font-size: 12px; color: var(--ink4); }
  .lg-breadcrumb a { color: var(--ink3); text-decoration: none; transition: color 0.15s; }
  .lg-breadcrumb a:hover { color: var(--ink); }
  .lg-breadcrumb .sep { color: var(--ink4); }
  .lg-breadcrumb .cur { color: var(--accent); }

  /* LAYOUT */
  .lg-layout { max-width: 1100px; margin: 0 auto; padding: 56px 24px 96px; display: grid; grid-template-columns: 210px 1fr; gap: 52px; align-items: start; }
  @media(max-width:860px){ .lg-layout { grid-template-columns: 1fr; gap: 28px; padding: 36px 20px 72px; } .lg-toc { display: none; } }

  /* TOC */
  .lg-toc { position: sticky; top: 76px; background: var(--paper2); border: 1px solid var(--card-border); border-radius: 14px; padding: 18px 14px; }
  .lg-toc-title { font-size: 9.5px; font-weight: 600; color: var(--ink4); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 12px; padding-left: 6px; font-family: var(--fm); }
  .lg-toc-link { display: block; padding: 6px 9px; border-radius: 7px; border-left: 2px solid transparent; font-size: 12px; font-weight: 500; color: var(--ink3); text-decoration: none; transition: all 0.15s; margin-bottom: 2px; }
  .lg-toc-link:hover { color: var(--ink); background: var(--card); }
  .lg-toc-link.act { color: var(--accent); background: var(--accent3); border-left-color: var(--accent); }

  /* CONTENT */
  .lg-content { min-width: 0; }
  .lg-section { margin-bottom: 48px; scroll-margin-top: 80px; }
  .lg-section h2 { font-family: var(--fd); font-size: 20px; font-weight: 700; letter-spacing: -0.02em; color: var(--ink); margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid var(--card-border); }
  .lg-section h3 { font-family: var(--fd); font-size: 14px; font-weight: 700; color: var(--ink2); margin: 20px 0 8px; letter-spacing: -0.01em; }
  .lg-section p { font-size: 14px; color: var(--ink2); line-height: 1.8; margin-bottom: 14px; }
  .lg-section strong { color: var(--ink); font-weight: 600; }
  .lg-section ul, .lg-section ol { margin: 0 0 16px; padding-left: 0; list-style: none; display: flex; flex-direction: column; gap: 8px; }
  .lg-section li { display: flex; align-items: flex-start; gap: 10px; font-size: 14px; color: var(--ink2); line-height: 1.65; }
  .lg-section ul li::before { content: ''; display: block; width: 5px; height: 5px; border-radius: 50%; background: var(--accent); flex-shrink: 0; margin-top: 8px; }
  .lg-section ol { counter-reset: li; }
  .lg-section ol li::before { counter-increment: li; content: counter(li); display: flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: 50%; background: var(--accent3); color: var(--accent); font-size: 10px; font-weight: 700; flex-shrink: 0; margin-top: 1px; border: 1px solid var(--accent2); }
  .lg-section a { color: var(--accent); text-decoration: none; }
  .lg-section a:hover { text-decoration: underline; }

  .lg-highlight { background: var(--accent3); border: 1px solid var(--accent2); border-left: 3px solid var(--accent); border-radius: 0 10px 10px 0; padding: 16px 18px; margin: 16px 0; }
  .lg-highlight p { color: var(--ink); margin: 0; font-size: 14px; }
  .lg-highlight strong { color: var(--accent); }

  .lg-badge-row { display: flex; flex-wrap: wrap; gap: 8px; margin: 14px 0; }
  .lg-badge { display: inline-flex; align-items: center; gap: 6px; background: var(--paper2); border: 1px solid var(--card-border); border-radius: 20px; padding: 4px 12px; font-size: 11.5px; color: var(--ink2); }

  code { font-size: 12px; color: var(--accent); background: var(--accent3); border-radius: 4px; padding: 1px 6px; font-family: var(--fm); border: 1px solid var(--accent2); }

  /* FOOTER */
  .lg-footer { background: var(--paper2); padding: 40px 24px 28px; border-top: 1px solid var(--card-border); }
  .lg-footer-i { max-width: 1100px; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px; }
  .lg-footer-brand { display: flex; align-items: center; gap: 9px; }
  .lg-footer-name { font-family: var(--fd); font-size: 14px; font-weight: 700; color: var(--ink); letter-spacing: -0.01em; }
  .lg-footer-copy { font-size: 12px; color: var(--ink4); margin-top: 4px; }
  .lg-footer-links { display: flex; gap: 18px; flex-wrap: wrap; }
  .lg-footer-link { font-size: 12px; color: var(--ink3); text-decoration: none; transition: color 0.2s; }
  .lg-footer-link:hover { color: var(--ink); }

  /* CONTACT-SPECIFIC */
  .contact-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 44px; }
  @media(max-width:540px){ .contact-cards { grid-template-columns: 1fr; } }
  .contact-card { background: var(--paper); border: 1px solid var(--card-border); border-radius: 14px; padding: 22px; transition: border-color 0.2s, transform 0.2s; }
  .contact-card:hover { border-color: var(--accent2); transform: translateY(-2px); }
  .contact-card-icon { font-size: 24px; margin-bottom: 10px; display: block; }
  .contact-card-title { font-family: var(--fd); font-size: 15px; font-weight: 700; color: var(--ink); margin-bottom: 6px; }
  .contact-card-desc { font-size: 13px; color: var(--ink3); line-height: 1.65; margin-bottom: 12px; }
  .contact-card-link { font-size: 13px; font-weight: 600; color: var(--accent); text-decoration: none; display: inline-flex; align-items: center; gap: 4px; }
  .contact-card-link:hover { text-decoration: underline; }

  .contact-form-wrap { background: var(--paper); border: 1px solid var(--card-border); border-radius: 16px; padding: 32px; margin-bottom: 44px; }
  .contact-form-title { font-family: var(--fd); font-size: 20px; font-weight: 700; color: var(--ink); letter-spacing: -0.02em; margin-bottom: 6px; }
  .contact-form-sub { font-size: 13px; color: var(--ink3); margin-bottom: 24px; }
  .contact-form { display: flex; flex-direction: column; gap: 14px; }
  .contact-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  @media(max-width:540px){ .contact-row { grid-template-columns: 1fr; } }
  .form-field { display: flex; flex-direction: column; gap: 5px; }
  .form-label { font-size: 10px; font-weight: 600; color: var(--ink4); text-transform: uppercase; letter-spacing: 0.1em; font-family: var(--fm); }
  .form-input, .form-select, .form-textarea { background: var(--paper2); border: 1px solid var(--card-border); border-radius: 8px; padding: 10px 13px; color: var(--ink); font-size: 13.5px; font-family: var(--font); outline: none; transition: border-color 0.15s; width: 100%; }
  .form-input::placeholder, .form-textarea::placeholder { color: var(--ink4); }
  .form-input:focus, .form-select:focus, .form-textarea:focus { border-color: var(--accent); }
  .form-select { cursor: pointer; }
  .form-select option { background: #FAFAF8; color: #17170F; }
  .form-textarea { resize: vertical; min-height: 110px; line-height: 1.6; }
  .form-submit { display: inline-flex; align-items: center; gap: 8px; background: var(--accent); color: var(--paper); border: 1px solid var(--accent); border-radius: 8px; padding: 12px 26px; font-size: 13.5px; font-weight: 600; font-family: var(--font); cursor: pointer; transition: all 0.2s; align-self: flex-start; }
  .form-submit:hover:not(:disabled) { opacity: 0.88; }
  .form-submit:disabled { opacity: 0.5; cursor: not-allowed; }

  .form-success { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 48px 24px; text-align: center; gap: 12px; }
  .form-success-icon { width: 56px; height: 56px; border-radius: 50%; background: rgba(47,107,79,.1); border: 1px solid rgba(47,107,79,.25); display: flex; align-items: center; justify-content: center; font-size: 24px; }
  .form-success-title { font-family: var(--fd); font-size: 20px; font-weight: 700; color: var(--ink); }
  .form-success-sub { font-size: 14px; color: var(--ink3); max-width: 320px; line-height: 1.65; }

  /* FAQ in contact */
  .faq-section-title { font-family: var(--fd); font-size: 20px; font-weight: 700; color: var(--ink); letter-spacing: -0.02em; margin-bottom: 6px; }
  .faq-section-sub { font-size: 13px; color: var(--ink3); margin-bottom: 20px; }
  .cfaq-item { border: 1px solid var(--card-border); border-radius: 11px; margin-bottom: 8px; overflow: hidden; background: var(--card); transition: border-color 0.15s; }
  .cfaq-item:hover { border-color: var(--accent2); }
  .cfaq-q { width: 100%; display: flex; align-items: center; justify-content: space-between; padding: 15px 18px; background: transparent; border: none; cursor: pointer; text-align: left; font-size: 13.5px; font-weight: 600; color: var(--ink); font-family: var(--font); gap: 12px; }
  .cfaq-chevron { width: 20px; height: 20px; border-radius: 50%; background: var(--card-hover); display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: transform 0.2s, background 0.15s; font-size: 10px; color: var(--ink3); }
  .cfaq-chevron.open { transform: rotate(180deg); background: var(--accent3); color: var(--accent); }
  .cfaq-a { max-height: 0; overflow: hidden; transition: max-height 0.28s ease, padding 0.28s ease; padding: 0 18px; }
  .cfaq-a.open { max-height: 220px; padding: 0 18px 16px; }
  .cfaq-a p { font-size: 13px; color: var(--ink2); line-height: 1.72; margin: 0; }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* ═══════════════════════════════════════════════════════════════
     SECURITY & PRIVACY CENTRE — distinctive elements
     ═══════════════════════════════════════════════════════════════ */

  /* Dark hero variant — signals "this page is evidence, not marketing" */
  .sec-hero { background: var(--ink-panel); position: relative; overflow: hidden; padding: 116px 24px 64px; }
  .sec-hero::before {
    content: ''; position: absolute; inset: 0;
    background-image: radial-gradient(rgba(250,250,248,0.045) 1px, transparent 1px);
    background-size: 22px 22px; mask-image: linear-gradient(180deg, black, transparent 85%);
  }
  .sec-hero-inner { max-width: 1100px; margin: 0 auto; position: relative; }
  .sec-breadcrumb { display: flex; align-items: center; gap: 7px; margin-bottom: 22px; font-size: 12px; color: rgba(250,250,248,0.34); }
  .sec-breadcrumb a { color: rgba(250,250,248,0.52); text-decoration: none; }
  .sec-breadcrumb a:hover { color: var(--paper); }
  .sec-breadcrumb .cur { color: #8FA3D6; }
  .sec-kicker { display: inline-flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 600; color: #8FA3D6; text-transform: uppercase; letter-spacing: 0.09em; margin-bottom: 18px; font-family: var(--fm); }
  .sec-kicker-dot { width: 6px; height: 6px; border-radius: 50%; background: #4ADE80; box-shadow: 0 0 0 3px rgba(74,222,128,0.16); }
  .sec-h1 { font-family: var(--fd); font-size: clamp(30px,4.6vw,52px); font-weight: 700; letter-spacing: -0.03em; line-height: 1.06; color: var(--paper); margin-bottom: 16px; max-width: 780px; }
  .sec-h1 .c { color: #8FA3D6; }
  .sec-sub { font-size: 16px; color: rgba(250,250,248,0.6); line-height: 1.7; max-width: 600px; margin-bottom: 28px; }
  .sec-hero-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 30px; }
  .sec-btn-primary { display: inline-flex; align-items: center; gap: 8px; background: var(--paper); color: var(--ink); border: 1px solid var(--paper); border-radius: 8px; padding: 11px 20px; font-size: 13.5px; font-weight: 600; font-family: var(--font); cursor: pointer; text-decoration: none; transition: opacity 0.15s; }
  .sec-btn-primary:hover { opacity: 0.88; }
  .sec-btn-ghost { display: inline-flex; align-items: center; gap: 8px; background: transparent; color: rgba(250,250,248,0.82); border: 1px solid rgba(250,250,248,0.18); border-radius: 8px; padding: 11px 20px; font-size: 13.5px; font-weight: 600; font-family: var(--font); cursor: pointer; text-decoration: none; transition: all 0.15s; }
  .sec-btn-ghost:hover { border-color: rgba(250,250,248,0.36); color: var(--paper); }
  .sec-hero-meta { display: flex; align-items: center; gap: 22px; flex-wrap: wrap; }
  .sec-hero-meta-item { display: flex; align-items: center; gap: 7px; font-size: 12.5px; color: rgba(250,250,248,0.5); }
  .sec-hero-meta-item svg { color: rgba(250,250,248,0.4); }

  /* Overview grid — six controls as evidence cards, not badges */
  .sec-band { padding: 64px 24px; }
  .sec-band.alt { background: var(--paper2); }
  .sec-band-inner { max-width: 1100px; margin: 0 auto; }
  .sec-band-eyebrow { font-family: var(--fm); font-size: 11px; font-weight: 600; color: var(--accent); text-transform: uppercase; letter-spacing: 0.09em; margin-bottom: 10px; }
  .sec-band-h2 { font-family: var(--fd); font-size: clamp(22px,3vw,30px); font-weight: 700; letter-spacing: -0.025em; color: var(--ink); margin-bottom: 12px; max-width: 620px; }
  .sec-band-p { font-size: 14.5px; color: var(--ink2); line-height: 1.75; max-width: 620px; margin-bottom: 36px; }

  .sec-grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
  .sec-grid-2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; }
  @media(max-width:860px){ .sec-grid-3, .sec-grid-2 { grid-template-columns: 1fr 1fr; } }
  @media(max-width:600px){ .sec-grid-3, .sec-grid-2 { grid-template-columns: 1fr; } }

  .sec-card { background: var(--paper); border: 1px solid var(--card-border); border-radius: 14px; padding: 22px; transition: border-color 0.2s, transform 0.2s; }
  .sec-card:hover { border-color: var(--accent2); transform: translateY(-2px); }
  .sec-card-icon { width: 38px; height: 38px; border-radius: 10px; background: var(--accent3); border: 1px solid var(--accent2); display: flex; align-items: center; justify-content: center; color: var(--accent); margin-bottom: 14px; }
  .sec-card-title { font-family: var(--fd); font-size: 14.5px; font-weight: 700; color: var(--ink); margin-bottom: 6px; letter-spacing: -0.01em; }
  .sec-card-desc { font-size: 13px; color: var(--ink3); line-height: 1.6; }

  /* Verification ledger — the signature element.
     Every claim states WHO/WHAT enforces it, so a reader can tell
     "implemented by Fixsense" apart from "provided by a vendor"
     apart from "self-assessed, not formally certified." No claim
     appears without its source. */
  .sec-ledger { border: 1px solid var(--card-border); border-radius: 14px; overflow: hidden; background: var(--paper); }
  .sec-ledger-row { display: grid; grid-template-columns: 1fr auto 180px; align-items: center; gap: 16px; padding: 16px 20px; border-top: 1px solid var(--card-border); }
  .sec-ledger-row:first-child { border-top: none; }
  @media(max-width:700px){ .sec-ledger-row { grid-template-columns: 1fr; gap: 8px; align-items: flex-start; } }
  .sec-ledger-claim { font-size: 13.5px; font-weight: 600; color: var(--ink); }
  .sec-ledger-detail { font-size: 12.5px; color: var(--ink3); margin-top: 2px; line-height: 1.55; }
  .sec-ledger-status { display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; font-weight: 600; padding: 4px 10px; border-radius: 20px; white-space: nowrap; }
  .sec-ledger-status.implemented { background: rgba(47,107,79,0.09); color: var(--green); border: 1px solid rgba(47,107,79,0.22); }
  .sec-ledger-status.vendor { background: rgba(34,49,92,0.07); color: var(--accent); border: 1px solid var(--accent2); }
  .sec-ledger-status.assessed { background: rgba(138,90,32,0.09); color: var(--amber); border: 1px solid rgba(138,90,32,0.22); }
  .sec-ledger-source { font-size: 12px; color: var(--ink4); text-align: right; }
  @media(max-width:700px){ .sec-ledger-source { text-align: left; } }
  .sec-ledger-legend { display: flex; flex-wrap: wrap; gap: 16px; margin-top: 16px; }
  .sec-ledger-legend-item { display: flex; align-items: center; gap: 7px; font-size: 12px; color: var(--ink3); }
  .sec-ledger-legend-dot { width: 8px; height: 8px; border-radius: 50%; }

  /* Data flow / AI processing steps */
  .sec-flow { display: flex; flex-direction: column; gap: 0; border: 1px solid var(--card-border); border-radius: 14px; overflow: hidden; background: var(--paper); }
  .sec-flow-step { display: flex; gap: 16px; padding: 20px 22px; border-top: 1px solid var(--card-border); }
  .sec-flow-step:first-child { border-top: none; }
  .sec-flow-num { width: 26px; height: 26px; border-radius: 50%; background: var(--accent3); border: 1px solid var(--accent2); color: var(--accent); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; font-family: var(--fm); flex-shrink: 0; }
  .sec-flow-title { font-family: var(--fd); font-size: 14px; font-weight: 700; color: var(--ink); margin-bottom: 4px; }
  .sec-flow-desc { font-size: 13px; color: var(--ink2); line-height: 1.65; }

  /* Documentation cards grid */
  .sec-doc-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
  @media(max-width:860px){ .sec-doc-grid { grid-template-columns: 1fr 1fr; } }
  @media(max-width:600px){ .sec-doc-grid { grid-template-columns: 1fr; } }
  .sec-doc-card { display: flex; flex-direction: column; gap: 12px; background: var(--paper); border: 1px solid var(--card-border); border-radius: 14px; padding: 20px; text-decoration: none; transition: all 0.2s; }
  .sec-doc-card:hover { border-color: var(--accent2); transform: translateY(-2px); }
  .sec-doc-top { display: flex; align-items: flex-start; justify-content: space-between; }
  .sec-doc-icon { width: 34px; height: 34px; border-radius: 9px; background: var(--accent3); border: 1px solid var(--accent2); display: flex; align-items: center; justify-content: center; color: var(--accent); }
  .sec-doc-arrow { color: var(--ink4); transition: transform 0.15s, color 0.15s; }
  .sec-doc-card:hover .sec-doc-arrow { color: var(--accent); transform: translate(2px,-2px); }
  .sec-doc-title { font-family: var(--fd); font-size: 14px; font-weight: 700; color: var(--ink); }
  .sec-doc-desc { font-size: 12.5px; color: var(--ink3); line-height: 1.55; }

  /* Note box for honest caveats — visually distinct from the accent highlight */
  .sec-note { display: flex; gap: 12px; background: var(--paper2); border: 1px solid var(--card-border); border-radius: 12px; padding: 15px 18px; margin: 18px 0; }
  .sec-note svg { flex-shrink: 0; color: var(--ink3); margin-top: 1px; }
  .sec-note p { font-size: 13px; color: var(--ink2); line-height: 1.65; margin: 0; }
  .sec-note strong { color: var(--ink); font-weight: 600; }

  /* Response-time table */
  .sec-sla-table { width: 100%; border-collapse: collapse; border: 1px solid var(--card-border); border-radius: 12px; overflow: hidden; }
  .sec-sla-table th { text-align: left; font-size: 10.5px; font-weight: 600; color: var(--ink4); text-transform: uppercase; letter-spacing: 0.08em; font-family: var(--fm); background: var(--paper2); padding: 11px 16px; border-bottom: 1px solid var(--card-border); }
  .sec-sla-table td { font-size: 13px; color: var(--ink2); padding: 13px 16px; border-bottom: 1px solid var(--card-border); }
  .sec-sla-table tr:last-child td { border-bottom: none; }
  .sec-sla-table td:first-child { color: var(--ink); font-weight: 600; }

  /* Final CTA band */
  .sec-cta-band { background: var(--ink-panel); padding: 68px 24px; position: relative; overflow: hidden; }
  .sec-cta-band::before { content:''; position:absolute; top:-100px; left:50%; transform:translateX(-50%); width:560px; height:340px; background: radial-gradient(ellipse, rgba(143,163,214,0.10) 0%, transparent 68%); pointer-events:none; }
  .sec-cta-inner { max-width: 720px; margin: 0 auto; text-align: center; position: relative; }
  .sec-cta-h2 { font-family: var(--fd); font-size: clamp(24px,3.4vw,34px); font-weight: 700; letter-spacing: -0.025em; color: var(--paper); margin-bottom: 14px; }
  .sec-cta-p { font-size: 14.5px; color: rgba(250,250,248,0.58); line-height: 1.7; margin-bottom: 34px; max-width: 480px; margin-left: auto; margin-right: auto; }
  .sec-cta-contacts { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; text-align: left; }
  @media(max-width:700px){ .sec-cta-contacts { grid-template-columns: 1fr; } }
  .sec-cta-contact { background: rgba(250,250,248,0.04); border: 1px solid rgba(250,250,248,0.1); border-radius: 12px; padding: 16px 18px; text-decoration: none; transition: all 0.15s; }
  .sec-cta-contact:hover { background: rgba(250,250,248,0.07); border-color: rgba(250,250,248,0.22); }
  .sec-cta-contact-label { font-size: 10.5px; font-weight: 600; color: rgba(250,250,248,0.42); text-transform: uppercase; letter-spacing: 0.08em; font-family: var(--fm); margin-bottom: 6px; }
  .sec-cta-contact-email { font-size: 13.5px; font-weight: 600; color: var(--paper); }

  /* Toc override for dark hero context */
  .lg-toc.sec-toc { top: 88px; }
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
      updated="August 8, 2026" version="2.2" sections={sections}>

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
        <p>If you connect third-party services , we receive OAuth tokens and only the data scopes you explicitly authorize.</p>
        <h3>Website Visitors & Abandoned Sign-ups</h3>
        <p>When you browse fixsense.com.ng, we record anonymous session activity (pages viewed, clicks, scroll depth, device and browser type) if you've accepted analytics cookies — never your keystrokes or anything you type. We never link this to your name or email unless you sign in.</p>
        <p>If you begin creating an account and enter an email address (and optionally your name) into the sign-up form but don't complete sign-up, we record that email and name so our team can follow up with you. This is active as of August 8, 2026. We only ever record what you've actually typed into that field, and only after you move on from it — never anything you haven't entered yourself. You can ask us to delete this, or opt out of future follow-up, at any time by contacting <a href="mailto:privacy@fixsense.com.ng">privacy@fixsense.com.ng</a>.</p>
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
          <li><strong>Supabase:</strong> Database and authentication infrastructure</li>
          <li><strong>Paystack:</strong> Payment processing</li>
          <li><strong>Anthropic / Claude:</strong> AI analysis of transcripts to generate insights</li>
          <li><strong>Daily.co:</strong> Meeting room infrastructure</li>
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
      subtitle="By using Fixsense, you agree to these terms. Please read them carefully: they govern your use of our platform and services."
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
        <p>You acknowledge that Fixsense uses AI models (including Anthropic's Claude) to process your meeting content. AI outputs are intended to assist, not replace, human judgment.</p>
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
        <p>These Terms are governed by the laws of the Federal Republic of Nigeria. Any disputes shall be resolved in the courts </p>
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
// SECURITY & PRIVACY CENTRE
// ─────────────────────────────────────────────────────────────────────────────

// Overview cards — the six controls the brief asked to lead with.
const SEC_OVERVIEW_CARDS = [
  { icon: Lock, title: "Encryption at rest", desc: "Database records, call recordings, and audio files are encrypted at rest using AES-256." },
  { icon: ShieldCheck, title: "Encryption in transit", desc: "All connections — API calls, dashboard traffic, and real-time features — run over TLS 1.2 or higher." },
  { icon: KeyRound, title: "Row-Level Security", desc: "Every database table is protected by Postgres Row-Level Security, scoping each query to the authenticated user or team." },
  { icon: Users, title: "Access controls", desc: "Role-based access separates admin and member permissions. Fixsense staff do not have routine, standing access to call content." },
  { icon: UserCheck, title: "Recording transparency", desc: "The meeting assistant joins visibly as \"Fixsense AI Recorder\" and announces itself to all participants when a call starts." },
  { icon: Trash2, title: "Deletion & export", desc: "Account deletion removes associated data. Users can request an export of their data at any time." },
] as const;

// Verification ledger — the page's signature element. Each row states what
// is claimed, who actually enforces it, and where that's implemented —
// so a reader can tell "built by Fixsense," "provided by a vendor we rely
// on," and "self-assessed, not a formal certification" apart at a glance.
type LedgerStatus = "implemented" | "vendor" | "assessed";
const LEDGER_STATUS_LABEL: Record<LedgerStatus, string> = {
  implemented: "Implemented by Fixsense",
  vendor: "Provided by infrastructure vendor",
  assessed: "Self-assessed, not certified",
};
const SEC_LEDGER: { claim: string; detail: string; status: LedgerStatus; source: string }[] = [
  { claim: "Row-Level Security on all data tables", detail: "Policies scope every query to the owning user or team at the database layer.", status: "implemented", source: "Fixsense · Postgres RLS" },
  { claim: "OAuth token encryption", detail: "Refresh tokens for connected integrations are encrypted at the application layer before storage.", status: "implemented", source: "Fixsense · AES-GCM" },
  { claim: "Webhook signature verification", detail: "Incoming payment and integration webhooks are verified against a signed secret before processing.", status: "implemented", source: "Fixsense · HMAC" },
  { claim: "Visible recording notice", detail: "The meeting assistant announces itself by name when it joins a call — no silent recording.", status: "implemented", source: "Fixsense" },
  { claim: "Database & storage encryption at rest", detail: "AES-256 encryption for database records and storage buckets, managed by our hosting provider.", status: "vendor", source: "Supabase" },
  { claim: "TLS in transit", detail: "TLS 1.2+ termination on all connections between clients and our infrastructure.", status: "vendor", source: "Supabase / hosting layer" },
  { claim: "Payment card handling", detail: "Card data is collected and processed by our payment processor; Fixsense never stores card numbers.", status: "vendor", source: "Paystack" },
  { claim: "UK GDPR–aligned data practices", detail: "Consent, minimization, deletion, export, and retention controls are designed to meet UK GDPR expectations.", status: "assessed", source: "Internal review — no formal certification held" },
];

// AI data-processing flow — states plainly what happens, without naming an
// unverified model provider or claiming a data-retention agreement that
// isn't in front of us.
const SEC_AI_FLOW = [
  { title: "What's sent", desc: "Call audio is transcribed, and the resulting transcript text — not the raw audio — is sent to our AI processing layer to generate summaries, action items, and objection notes." },
  { title: "Why it's processed", desc: "Solely to generate the summary, action items, and coaching insights that are returned to your account. It is not used for any purpose beyond producing that output." },
  { title: "Model training", desc: "Your call content is not used to train Fixsense's product or shared for third-party model training as part of our standard processing." },
  { title: "Retention by processing providers", desc: "We rely on the retention and deletion terms of our AI processing provider's commercial API. We have not independently published a zero-retention guarantee, and this page will be updated if that changes." },
  { title: "Human access", desc: "Fixsense staff do not routinely read transcripts or listen to recordings. Support access to a specific account's data requires the customer's request and is logged." },
] as const;

// Documentation cards
const SEC_DOCS = [
  { icon: FileText, title: "Privacy Policy", desc: "What we collect, why, and how long we keep it.", href: "/privacy" },
  { icon: FileText, title: "Terms of Service", desc: "The agreement covering your use of Fixsense.", href: "/terms" },
  { icon: Building2, title: "Subprocessors", desc: "Supabase, Paystack, and other vendors we rely on.", href: "/privacy#sharing" },
  { icon: Clock, title: "Data Retention", desc: "How long recordings, transcripts, and logs are kept.", href: "/privacy#storage" },
  { icon: ShieldCheck, title: "Data Processing Agreement", desc: "For teams that need a signed DPA on file, contact us.", href: "mailto:enterprise@fixsense.com.ng?subject=DPA%20Request" },
  { icon: Mail, title: "Security Contact", desc: "Report a vulnerability or ask a security question directly.", href: "mailto:security@fixsense.com.ng" },
] as const;

function LedgerRow({ row }: { row: typeof SEC_LEDGER[number] }) {
  const dotColor = row.status === "implemented" ? "var(--green)" : row.status === "vendor" ? "var(--accent)" : "var(--amber)";
  return (
    <div className="sec-ledger-row">
      <div>
        <div className="sec-ledger-claim">{row.claim}</div>
        <div className="sec-ledger-detail">{row.detail}</div>
      </div>
      <span className={`sec-ledger-status ${row.status}`}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: dotColor, display: "inline-block" }} />
        {LEDGER_STATUS_LABEL[row.status]}
      </span>
      <div className="sec-ledger-source">{row.source}</div>
    </div>
  );
}

function generateSecurityOverviewHtml() {
  const today = new Date().toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" });
  const rows = SEC_LEDGER.map(r => `<tr><td>${r.claim}</td><td>${LEDGER_STATUS_LABEL[r.status]}</td><td>${r.source}</td><td style="color:#555">${r.detail}</td></tr>`).join("");
  return `<!DOCTYPE html><html><head><title>Fixsense Security Overview</title>
<style>
  body{font-family:system-ui,-apple-system,sans-serif;max-width:820px;margin:40px auto;color:#17170F;font-size:13px;line-height:1.6}
  h1{font-size:22px;border-bottom:2px solid #17170F;padding-bottom:10px;margin-bottom:4px}
  .meta{color:#666;font-size:11.5px;margin-bottom:24px}
  h2{font-size:15px;margin-top:28px;margin-bottom:10px;color:#22315C}
  table{width:100%;border-collapse:collapse;margin:10px 0 22px}
  th,td{border:1px solid #ddd;padding:7px 10px;text-align:left;vertical-align:top;font-size:12px}
  th{background:#F3F2ED;font-size:10.5px;text-transform:uppercase;letter-spacing:.04em;color:#555}
  .note{background:#F3F2ED;border-left:3px solid #22315C;padding:10px 14px;margin:14px 0;font-size:12px}
  @media print{body{margin:20px}}
</style></head><body>
<h1>Fixsense — Security Overview</h1>
<p class="meta">Generated ${today} · fixsense.com.ng/security</p>
<div class="note">This document summarizes technical and organizational controls as implemented at the time of generation. It is not a certification and does not replace a signed Data Processing Agreement. For a DPA, contact enterprise@fixsense.com.ng.</div>

<h2>Core controls</h2>
<table><tr><th>Control</th><th>Detail</th></tr>
${SEC_OVERVIEW_CARDS.map(c => `<tr><td>${c.title}</td><td>${c.desc}</td></tr>`).join("")}
</table>

<h2>Verification ledger</h2>
<table><tr><th>Claim</th><th>Status</th><th>Source</th><th>Detail</th></tr>
${rows}
</table>

<h2>AI data processing</h2>
<table><tr><th>Step</th><th>Detail</th></tr>
${SEC_AI_FLOW.map(s => `<tr><td>${s.title}</td><td>${s.desc}</td></tr>`).join("")}
</table>

<h2>Contact</h2>
<p>Security: security@fixsense.com.ng &nbsp;·&nbsp; Enterprise: enterprise@fixsense.com.ng &nbsp;·&nbsp; DPO: dpo@fixsense.com.ng</p>
</body></html>`;
}

function downloadSecurityOverview() {
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(generateSecurityOverviewHtml());
  win.document.close();
  setTimeout(() => win.print(), 400);
}

export function SecurityPage() {
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
              <Link key={l.href} to={l.href} className={`lg-nav-link ${l.label === "Security" ? "act" : ""}`}>{l.label}</Link>
            ))}
          </div>
          <Link to="/dashboard" className="lg-nav-cta">Dashboard →</Link>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <div className="sec-hero">
        <div className="sec-hero-inner">
          <div className="sec-breadcrumb">
            <Link to="/">Home</Link><span>/</span><span className="cur">Security & Privacy</span>
          </div>
          <div className="sec-kicker"><span className="sec-kicker-dot" />Security & Privacy Centre</div>
          <h1 className="sec-h1">Security and privacy built into <span className="c">every meeting.</span></h1>
          <p className="sec-sub">
            Fixsense protects call recordings, transcripts, and personal information at every stage —
            collection, processing, storage, and deletion. This page explains exactly how, and is honest
            about where a claim comes from us versus a vendor we rely on.
          </p>
          <div className="sec-hero-actions">
            <button className="sec-btn-primary" onClick={downloadSecurityOverview}>
              <Download size={15} /> Download Security Overview
            </button>
            <a href="#ledger" className="sec-btn-ghost">
              View verification ledger
            </a>
          </div>
          <div className="sec-hero-meta">
            <div className="sec-hero-meta-item"><Clock size={13} /> Last reviewed {new Date().toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" })}</div>
            <div className="sec-hero-meta-item"><Globe size={13} /> Hosted on Supabase infrastructure</div>
            <div className="sec-hero-meta-item"><Mail size={13} /> security@fixsense.com.ng</div>
          </div>
        </div>
      </div>

      {/* ── Overview cards ───────────────────────────────────────────── */}
      <div className="sec-band">
        <div className="sec-band-inner">
          <div className="sec-band-eyebrow">Overview</div>
          <h2 className="sec-band-h2">The controls behind every call</h2>
          <p className="sec-band-p">A short summary of the technical controls protecting your data. Full detail on each is in the sections below.</p>
          <div className="sec-grid-3">
            {SEC_OVERVIEW_CARDS.map(c => (
              <div className="sec-card" key={c.title}>
                <div className="sec-card-icon"><c.icon size={18} /></div>
                <div className="sec-card-title">{c.title}</div>
                <div className="sec-card-desc">{c.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Verification ledger (signature element) ──────────────────── */}
      <div className="sec-band alt" id="ledger">
        <div className="sec-band-inner">
          <div className="sec-band-eyebrow">Verification Ledger</div>
          <h2 className="sec-band-h2">Every claim, sourced</h2>
          <p className="sec-band-p">
            Rather than a row of certification badges, here is exactly what each control is, who
            actually enforces it, and whether it's something Fixsense built, something a vendor
            provides, or something we assess internally without formal certification.
          </p>
          <div className="sec-ledger">
            {SEC_LEDGER.map(row => <LedgerRow row={row} key={row.claim} />)}
          </div>
          <div className="sec-ledger-legend">
            <div className="sec-ledger-legend-item"><span className="sec-ledger-legend-dot" style={{ background: "var(--green)" }} />Implemented directly by Fixsense</div>
            <div className="sec-ledger-legend-item"><span className="sec-ledger-legend-dot" style={{ background: "var(--accent)" }} />Provided by an infrastructure vendor</div>
            <div className="sec-ledger-legend-item"><span className="sec-ledger-legend-dot" style={{ background: "var(--amber)" }} />Self-assessed, not a formal certification</div>
          </div>
        </div>
      </div>

      {/* ── Meeting & candidate data ──────────────────────────────────── */}
      <div className="sec-band">
        <div className="sec-band-inner">
          <div className="sec-band-eyebrow">Meeting & Candidate Data</div>
          <h2 className="sec-band-h2">How recruitment calls are handled</h2>
          <p className="sec-band-p">
            For recruitment and staffing teams, calls often include candidate personal details, salary
            expectations, and client requirements. Here's specifically how that data moves through Fixsense.
          </p>
          <div className="sec-grid-2">
            <div className="sec-card">
              <div className="sec-card-icon"><UserCheck size={18} /></div>
              <div className="sec-card-title">Candidate screening & client intake calls</div>
              <div className="sec-card-desc">Interviews and intake calls are recorded and transcribed the same way as any other meeting on the platform — the assistant joins visibly, and a transcript with a summary and action items is generated after the call.</div>
            </div>
            <div className="sec-card">
              <div className="sec-card-icon"><Database size={18} /></div>
              <div className="sec-card-title">Where recordings and transcripts live</div>
              <div className="sec-card-desc">Recordings are stored in access-controlled storage; transcripts and summaries sit in database tables scoped by Row-Level Security to the account and team that owns the call.</div>
            </div>
            <div className="sec-card">
              <div className="sec-card-icon"><Users size={18} /></div>
              <div className="sec-card-title">Who can see it inside your team</div>
              <div className="sec-card-desc">Access follows your team's roles and permissions in Fixsense. A candidate call isn't automatically visible to everyone in the organization — it follows the same access rules as any other call.</div>
            </div>
            <div className="sec-card">
              <div className="sec-card-icon"><Trash2 size={18} /></div>
              <div className="sec-card-title">Deleting a candidate's data</div>
              <div className="sec-card-desc">Individual calls and their transcripts can be deleted from within the platform. Deleting an account removes associated recordings and transcripts.</div>
            </div>
          </div>
          <div className="sec-note">
            <ShieldCheck size={16} />
            <p><strong>Worth knowing:</strong> Fixsense is not a candidate database or applicant tracking system. It's built to capture and summarize the conversation itself — the record that sits alongside whatever ATS or CRM your team already uses.</p>
          </div>
        </div>
      </div>

      {/* ── AI & data processing ──────────────────────────────────────── */}
      <div className="sec-band alt">
        <div className="sec-band-inner">
          <div className="sec-band-eyebrow">AI & Data Processing</div>
          <h2 className="sec-band-h2">What happens when AI processes a call</h2>
          <p className="sec-band-p">Plainly stated, with no claim beyond what our current setup actually supports.</p>
          <div className="sec-flow">
            {SEC_AI_FLOW.map((step, i) => (
              <div className="sec-flow-step" key={step.title}>
                <div className="sec-flow-num">{String(i + 1).padStart(2, "0")}</div>
                <div>
                  <div className="sec-flow-title">{step.title}</div>
                  <div className="sec-flow-desc">{step.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Privacy & UK GDPR ───────────────────────────────────────────── */}
      <div className="sec-band">
        <div className="sec-band-inner">
          <div className="sec-band-eyebrow">Privacy & UK GDPR</div>
          <h2 className="sec-band-h2">Designed to support UK GDPR requirements</h2>
          <p className="sec-band-p">
            Fixsense is not formally UK GDPR certified — no such certification scheme exists to hold. What
            we can say is how the platform is designed to support the requirements UK organizations are
            assessed against.
          </p>
          <div className="sec-grid-3">
            {[
              { icon: UserCheck, title: "Consent", desc: "The recording assistant announces itself by name on joining a call, so participants know a recording is taking place." },
              { icon: Database, title: "Data minimization", desc: "We collect what's needed to run the platform and generate call insights — not more." },
              { icon: Trash2, title: "Deletion", desc: "Users can delete individual calls, and account deletion removes associated data." },
              { icon: Download, title: "Export", desc: "Data can be exported on request; call data is also accessible via the platform." },
              { icon: FileText, title: "Data-subject rights", desc: "Requests for access, correction, or erasure are handled by our privacy team on a reasonable timescale." },
              { icon: Clock, title: "Retention", desc: "Retention periods for recordings, transcripts, and account data are set out in the Privacy Policy." },
              { icon: Globe, title: "International transfers", desc: "Our infrastructure providers may process data outside the UK. Details are available on request." },
              { icon: FileText, title: "DPA availability", desc: "A Data Processing Agreement is available for teams that require one — contact our enterprise team." },
            ].map(item => (
              <div className="sec-card" key={item.title}>
                <div className="sec-card-icon"><item.icon size={18} /></div>
                <div className="sec-card-title">{item.title}</div>
                <div className="sec-card-desc">{item.desc}</div>
              </div>
            ))}
          </div>
          <div className="sec-note">
            <FileText size={16} />
            <p>Full detail on lawful basis, retention periods, and data-subject rights is in our <Link to="/privacy">Privacy Policy</Link>. If your due-diligence process needs a signed DPA, email <a href="mailto:enterprise@fixsense.com.ng">enterprise@fixsense.com.ng</a>.</p>
          </div>
        </div>
      </div>

      {/* ── Infrastructure ──────────────────────────────────────────────── */}
      <div className="sec-band alt">
        <div className="sec-band-inner">
          <div className="sec-band-eyebrow">Infrastructure</div>
          <h2 className="sec-band-h2">Built on Supabase</h2>
          <p className="sec-band-p">
            Fixsense is built on Supabase's managed infrastructure. Supabase's own certifications cover
            Supabase's platform — they don't automatically extend to Fixsense as an application, and we
            don't represent them as if they do. Here's what that layer actually provides, and what
            Fixsense adds on top of it.
          </p>
          <div className="sec-grid-2">
            <div className="sec-card">
              <div className="sec-card-icon"><Server size={18} /></div>
              <div className="sec-card-title">Hosting & database</div>
              <div className="sec-card-desc">Managed Postgres database and storage, hosted by Supabase, with automated encryption at rest.</div>
            </div>
            <div className="sec-card">
              <div className="sec-card-icon"><Lock size={18} /></div>
              <div className="sec-card-title">Storage encryption</div>
              <div className="sec-card-desc">Call recordings and file uploads sit in private storage buckets, accessed only via time-limited signed URLs — never a public link.</div>
            </div>
            <div className="sec-card">
              <div className="sec-card-icon"><KeyRound size={18} /></div>
              <div className="sec-card-title">Authentication</div>
              <div className="sec-card-desc">Supabase Auth handles sign-in via JWT-based sessions, with email verification and Google OAuth as an alternative.</div>
            </div>
            <div className="sec-card">
              <div className="sec-card-icon"><ShieldCheck size={18} /></div>
              <div className="sec-card-title">Row-Level Security</div>
              <div className="sec-card-desc">RLS policies, written and maintained by Fixsense, enforce that a query can only return data the requesting user is entitled to see.</div>
            </div>
            <div className="sec-card">
              <div className="sec-card-icon"><Globe size={18} /></div>
              <div className="sec-card-title">Network protection</div>
              <div className="sec-card-desc">The database is not publicly reachable — all access goes through an authenticated API layer with rate limiting on public endpoints.</div>
            </div>
            <div className="sec-card">
              <div className="sec-card-icon"><Users size={18} /></div>
              <div className="sec-card-title">Monitoring</div>
              <div className="sec-card-desc">Authentication failures and unusual access patterns are logged to a security events table for review.</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Compliance documentation ─────────────────────────────────────── */}
      <div className="sec-band">
        <div className="sec-band-inner">
          <div className="sec-band-eyebrow">Compliance Documentation</div>
          <h2 className="sec-band-h2">Everything for your due-diligence file</h2>
          <p className="sec-band-p">The documents most vendor security reviews ask for, in one place.</p>
          <div className="sec-doc-grid">
            {SEC_DOCS.map(doc => (
              <a href={doc.href} className="sec-doc-card" key={doc.title} target={doc.href.startsWith("mailto") ? undefined : "_self"}>
                <div className="sec-doc-top">
                  <div className="sec-doc-icon"><doc.icon size={16} /></div>
                  <ArrowUpRight size={15} className="sec-doc-arrow" />
                </div>
                <div>
                  <div className="sec-doc-title">{doc.title}</div>
                  <div className="sec-doc-desc">{doc.desc}</div>
                </div>
              </a>
            ))}
          </div>
        </div>
      </div>

      {/* ── Incident response ───────────────────────────────────────────── */}
      <div className="sec-band alt">
        <div className="sec-band-inner">
          <div className="sec-band-eyebrow">Incident Response</div>
          <h2 className="sec-band-h2">If something goes wrong</h2>
          <p className="sec-band-p">Response commitments we can actually meet, not aspirational SLAs.</p>
          <table className="sec-sla-table">
            <thead>
              <tr><th>Stage</th><th>What happens</th></tr>
            </thead>
            <tbody>
              <tr><td>Detection</td><td>Security events (failed logins, unusual access patterns, rate-limit triggers) are logged and reviewed on an ongoing basis.</td></tr>
              <tr><td>Containment</td><td>On confirmation of an incident, access is restricted or credentials rotated as the first response step.</td></tr>
              <tr><td>Customer notification</td><td>Affected customers are notified without undue delay once we've confirmed a personal-data incident has occurred, in line with UK GDPR expectations.</td></tr>
              <tr><td>Regulatory notification</td><td>Notified to the relevant regulator where required by law.</td></tr>
              <tr><td>Remediation</td><td>Root cause addressed and verified before the incident is considered closed.</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Vulnerability disclosure ─────────────────────────────────────── */}
      <div className="sec-band">
        <div className="sec-band-inner">
          <div className="sec-band-eyebrow">Vulnerability Disclosure</div>
          <h2 className="sec-band-h2">Found a security issue?</h2>
          <p className="sec-band-p">We take reports from security researchers seriously and handle them through a straightforward process.</p>
          <div className="sec-grid-2">
            <div className="sec-card">
              <div className="sec-card-icon"><Bug size={18} /></div>
              <div className="sec-card-title">How to report</div>
              <div className="sec-card-desc">Email <a href="mailto:security@fixsense.com.ng" style={{ color: "var(--accent)" }}>security@fixsense.com.ng</a> with steps to reproduce, potential impact, and any supporting evidence.</div>
            </div>
            <div className="sec-card">
              <div className="sec-card-icon"><CheckCircle2 size={18} /></div>
              <div className="sec-card-title">What we commit to</div>
              <div className="sec-card-desc">Acknowledge your report within 2 business days, keep you updated as we investigate, and not pursue legal action for good-faith, non-destructive security research.</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Final CTA ────────────────────────────────────────────────────── */}
      <div className="sec-cta-band">
        <div className="sec-cta-inner">
          <h2 className="sec-cta-h2">Have security questions?</h2>
          <p className="sec-cta-p">Whether you're running vendor due diligence, need a DPA on file, or found something that looks off — the right team is one email away.</p>
          <div className="sec-cta-contacts">
            <a href="mailto:security@fixsense.com.ng" className="sec-cta-contact">
              <div className="sec-cta-contact-label">Security</div>
              <div className="sec-cta-contact-email">security@fixsense.com.ng</div>
            </a>
            <a href="mailto:enterprise@fixsense.com.ng" className="sec-cta-contact">
              <div className="sec-cta-contact-label">Enterprise</div>
              <div className="sec-cta-contact-email">enterprise@fixsense.com.ng</div>
            </a>
            <a href="mailto:dpo@fixsense.com.ng" className="sec-cta-contact">
              <div className="sec-cta-contact-label">Data Protection Officer</div>
              <div className="sec-cta-contact-email">dpo@fixsense.com.ng</div>
            </a>
          </div>
        </div>
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
    { q: "Can I get a demo before subscribing?", a: "Yes, the Free plan includes up to 30 minutes per month, no credit card required. For a personalized demo with our team, email enterprise@fixsense.com.ng." },
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
          <p className="lg-sub">Whether you have a question about your account, a security concern, or want to discuss enterprise needs, the right team is just an email away.</p>
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