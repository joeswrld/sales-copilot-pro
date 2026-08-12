import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { openCookiePreferences } from "@/components/CookieConsent";
import { PLAN_CONFIG } from "@/config/plans";

// ─────────────────────────────────────────────────────────────────────────
// Scroll-reveal
// ─────────────────────────────────────────────────────────────────────────
function useInView(threshold = 0.14) {
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

function Reveal({ children, delay = 0, y = 14 }: { children: React.ReactNode; delay?: number; y?: number }) {
  const { ref, inView } = useInView();
  return (
    <div
      ref={ref}
      style={{
        opacity: inView ? 1 : 0,
        transform: inView ? "translateY(0)" : `translateY(${y}px)`,
        transition: `opacity 0.6s cubic-bezier(0.16,1,0.3,1) ${delay}ms, transform 0.6s cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Logo
// ─────────────────────────────────────────────────────────────────────────
function Logo({ size = 26 }: { size?: number }) {
  return (
    <img
      src="/fixsense_icon_logo (2).png"
      alt="Fixsense"
      width={size}
      height={size}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.22), objectFit: "cover", display: "block", flexShrink: 0 }}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Icon set — precise, uniform stroke, no decorative flourishes
// ─────────────────────────────────────────────────────────────────────────
function Icon({ name, size = 18, strokeWidth = 1.6 }: { name: string; size?: number; strokeWidth?: number }) {
  const p = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (name) {
    case "mic": return <svg {...p}><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0 0 14 0" /><path d="M12 19v3M8 22h8" /></svg>;
    case "file-text": return <svg {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="13" y2="17" /></svg>;
    case "users": return <svg {...p}><circle cx="9" cy="8" r="3.2" /><path d="M2.5 21c0-3.6 2.9-6.5 6.5-6.5s6.5 2.9 6.5 6.5" /><circle cx="17.5" cy="8.5" r="2.5" /><path d="M15.5 14.5c2.9.3 5.2 2.7 5.2 5.7" /></svg>;
    case "check-square": return <svg {...p}><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M8 12l3 3 5-6" /></svg>;
    case "trending": return <svg {...p}><polyline points="3 17 9 11 13 15 21 6" /><polyline points="15 6 21 6 21 12" /></svg>;
    case "briefcase": return <svg {...p}><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /><path d="M2 13h20" /></svg>;
    case "user-check": return <svg {...p}><circle cx="9" cy="8" r="4" /><path d="M2 21c0-4 3.1-7 7-7s7 3 7 7" /><path d="M17 11l2 2 4-4" /></svg>;
    case "book": return <svg {...p}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>;
    case "phone": return <svg {...p}><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .3 2 .6 2.9a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5c.9.3 1.9.5 2.9.6a2 2 0 0 1 1.8 2.1z" /></svg>;
    case "coffee": return <svg {...p}><path d="M17 8h1a4 4 0 0 1 0 8h-1" /><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V8z" /><line x1="6" y1="2" x2="6" y2="4" /><line x1="10" y1="2" x2="10" y2="4" /><line x1="14" y1="2" x2="14" y2="4" /></svg>;
    case "shield": return <svg {...p}><path d="M12 2l8 3.5v6c0 5-3.4 8.8-8 10.5-4.6-1.7-8-5.5-8-10.5v-6L12 2z" /><path d="M9 12l2 2 4-4" /></svg>;
    case "lock": return <svg {...p}><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>;
    case "eye-off": return <svg {...p}><path d="M17.9 17.9A9.6 9.6 0 0 1 12 20c-5 0-9-4-10-8a11.6 11.6 0 0 1 3.1-4.9M9.9 5.1A9.6 9.6 0 0 1 12 4c5 0 9 4 10 8a11.6 11.6 0 0 1-1.6 3" /><line x1="2" y1="2" x2="22" y2="22" /></svg>;
    case "arrow-right": return <svg {...p}><path d="M5 12h14M13 5l7 7-7 7" /></svg>;
    case "check": return <svg {...p} strokeWidth={2}><polyline points="20 6 9 17 4 12" /></svg>;
    case "clock": return <svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></svg>;
    case "message": return <svg {...p}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>;
    case "search": return <svg {...p}><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>;
    case "download": return <svg {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>;
    case "play": return <svg {...p} fill="currentColor" stroke="none"><path d="M7 5.5v13a1 1 0 0 0 1.5.87l11-6.5a1 1 0 0 0 0-1.74l-11-6.5A1 1 0 0 0 7 5.5z" /></svg>;
    case "plus": return <svg {...p}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>;
    case "minus": return <svg {...p}><line x1="5" y1="12" x2="19" y2="12" /></svg>;
    case "layers": return <svg {...p}><polygon points="12 2 2 8 12 14 22 8 12 2" /><polyline points="2 14 12 20 22 14" /><polyline points="2 11 12 17 22 11" /></svg>;
    case "server": return <svg {...p}><rect x="3" y="3" width="18" height="7" rx="1.5" /><rect x="3" y="14" width="18" height="7" rx="1.5" /><line x1="7" y1="6.5" x2="7.01" y2="6.5" /><line x1="7" y1="17.5" x2="7.01" y2="17.5" /></svg>;
    case "key": return <svg {...p}><circle cx="8" cy="14" r="4.5" /><path d="M11.5 10.5L20 2M17 5l2.5 2.5M14 8l2 2" /></svg>;
    case "user-plus": return <svg {...p}><circle cx="9" cy="8" r="4" /><path d="M2 21c0-4 3.1-7 7-7s7 3 7 7" /><line x1="19" y1="8" x2="19" y2="14" /><line x1="16" y1="11" x2="22" y2="11" /></svg>;
    case "link": return <svg {...p}><path d="M10 13a5 5 0 0 0 7.5.4l3-3a5 5 0 0 0-7.1-7.1l-1.5 1.5" /><path d="M14 11a5 5 0 0 0-7.5-.4l-3 3a5 5 0 0 0 7.1 7.1l1.5-1.5" /></svg>;
    case "grid": return <svg {...p}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>;
    default: return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Use cases — Fixsense is positioned for every kind of meeting, not just sales
// ─────────────────────────────────────────────────────────────────────────
const USE_CASES = [
  { icon: "briefcase", title: "Business meetings", desc: "Decisions, owners, and deadlines captured automatically, so nothing depends on someone's memory of what was agreed." },
  { icon: "user-check", title: "Interviews", desc: "Stay present with the candidate. A clean transcript and summary are ready for the hiring panel right after the call." },
  { icon: "book", title: "Classes and training", desc: "Every lecture or session becomes a searchable transcript that students and teammates can revisit anytime." },
  { icon: "phone", title: "Client calls", desc: "Know exactly what was promised and asked on every call, with a summary ready to send before you hang up." },
  { icon: "users", title: "Team meetings", desc: "Standups, planning sessions, and retros documented automatically, with action items assigned to the right person." },
  { icon: "coffee", title: "One-on-ones", desc: "Everyday conversations, check-ins, and brainstorms captured as reliably as your most important calls." },
];

const SECURITY_ITEMS = [
  { icon: "lock", title: "Encrypted in transit and at rest", desc: "Recordings and transcripts are encrypted end to end using industry-standard protocols." },
  { icon: "shield", title: "Built for GDPR", desc: "Data minimization, explicit consent, and the right to be forgotten are part of the design, not an add-on." },
  { icon: "eye-off", title: "No visible bot", desc: "Fixsense works natively inside your meeting room instead of joining as a separate participant." },
  { icon: "download", title: "You control your data", desc: "Export or permanently delete any recording or transcript from your account at any time." },
];

const FAQS = [
  { q: "Do I need to invite a bot to my meeting?", a: "No. Fixsense works natively inside the meeting room instead of sending a visible bot to join on your behalf. There is nothing extra for other participants to notice or approve before you can start recording and transcribing." },
  { q: "Who is Fixsense built for?", a: "Anyone who spends time in meetings. Sales and customer success teams use it for client calls, but so do founders running investor updates, recruiters conducting interviews, teachers recording lectures, consultants documenting client work, and teams that want a reliable record of what was said and agreed." },
  { q: "How accurate is the transcription and speaker identification?", a: "Fixsense uses automatic speech recognition tuned for real conversations, including overlapping speech and accents, and separates each speaker automatically so you always know who said what without manual tagging." },
  { q: "What happens to my recordings and transcripts?", a: "Your recordings and transcripts are encrypted, stored under your account, and never used to train shared AI models without your explicit consent. You can export or delete your data at any time from your account settings." },
  { q: "How quickly can I get started?", a: "Most people are recording their first meeting within minutes of signing up. There is no hardware to install and no IT approval required. You join your normal meeting link and Fixsense handles the rest." },
  { q: "Do I need a credit card to try it?", a: "No. The free plan starts with just an email address. You are only asked for billing details if you choose to upgrade to a paid plan." },
  { q: "Can I cancel anytime?", a: "Yes. There is no contract and no lock-in. You can cancel from your account settings at any time, and you keep access until the end of your current billing period." },
  { q: "What if someone on the call does not want to be recorded?", a: "Fixsense supports consent prompts you can enable for any meeting, and you stay in control of what gets recorded, stored, or deleted at all times." },
];

const NAV_LINKS = [
  { label: "Product", href: "#product" },
  { label: "How it works", href: "#how-it-works" },
  { label: "Use cases", href: "#use-cases" },
  { label: "Pricing", href: "#pricing" },
  { label: "Security", href: "#security" },
];

// ─────────────────────────────────────────────────────────────────────────
// Product mock — the hero interface. A realistic meeting screen: transcript
// on the left, AI summary and action items on the right. This is what a
// first-time visitor needs to see to understand the product in one glance.
// ─────────────────────────────────────────────────────────────────────────
const TRANSCRIPT_LINES = [
  { time: "00:11:42", speaker: "Maria Chen", text: "So the main blocker right now is getting sign-off from legal on the new contract terms." },
  { time: "00:11:58", speaker: "Daniel Osei", text: "I can follow up with them this afternoon and get a clear timeline back to the team." },
  { time: "00:12:14", speaker: "Priya Nair", text: "Good. Let's revisit this in Thursday's sync once you've heard back from legal." },
  { time: "00:12:29", speaker: "Maria Chen", text: "Agreed. I'll also loop in the client so they're not caught off guard by the delay." },
];

const ACTION_ITEMS = [
  { text: "Follow up with legal for a sign-off timeline", owner: "Daniel Osei", due: "Today" },
  { text: "Revisit contract status in Thursday's sync", owner: "Priya Nair", due: "Thursday" },
  { text: "Notify client about the possible delay", owner: "Maria Chen", due: "No date set" },
];

function ProductMock() {
  return (
    <div className="mock">
      <div className="mock-titlebar">
        <div className="mock-dots">
          <span /><span /><span />
        </div>
        <div className="mock-titlebar-name">Weekly Client Sync</div>
        <div className="mock-rec">
          <span className="mock-rec-dot" />
          Recording · 00:12:41
        </div>
      </div>

      <div className="mock-body">
        <div className="mock-transcript-pane">
          <div className="mock-pane-head">
            <Icon name="mic" size={13} />
            Live transcript
          </div>
          <div className="mock-transcript-list">
            {TRANSCRIPT_LINES.map((l, i) => (
              <div className="mock-t-row" key={i}>
                <div className="mock-t-meta">
                  <span className="mock-t-speaker">{l.speaker}</span>
                  <span className="mock-t-time">{l.time}</span>
                </div>
                <div className="mock-t-text">{l.text}</div>
              </div>
            ))}
            <div className="mock-t-row mock-t-live">
              <div className="mock-t-meta">
                <span className="mock-t-speaker">Daniel Osei</span>
                <span className="mock-t-time">Live</span>
              </div>
              <div className="mock-t-text">
                Sounds good, I'll send the updated terms as soon as I hear back
                <span className="mock-caret" />
              </div>
            </div>
          </div>
        </div>

        <div className="mock-summary-pane">
          <div className="mock-pane-head">
            <Icon name="file-text" size={13} />
            Summary
          </div>
          <p className="mock-summary-text">
            The team reviewed a legal sign-off blocker on the new contract terms. Daniel will follow up with legal today, and the group will revisit status in Thursday's sync.
          </p>

          <div className="mock-pane-head" style={{ marginTop: 18 }}>
            <Icon name="check-square" size={13} />
            Action items · 3
          </div>
          <div className="mock-action-list">
            {ACTION_ITEMS.map((a, i) => (
              <div className="mock-action-row" key={i}>
                <span className="mock-action-box" />
                <div>
                  <div className="mock-action-text">{a.text}</div>
                  <div className="mock-action-meta">{a.owner} · {a.due}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="mock-insight-row">
            <div className="mock-insight">
              <div className="mock-insight-val">4</div>
              <div className="mock-insight-label">Speakers</div>
            </div>
            <div className="mock-insight">
              <div className="mock-insight-val">92%</div>
              <div className="mock-insight-label">Follow-through</div>
            </div>
            <div className="mock-insight">
              <div className="mock-insight-val">1</div>
              <div className="mock-insight-label">Risk flagged</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// MAIN LANDING PAGE
// ─────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────
// "See how Fixsense works" — interactive, auto-playing product walkthrough
// ─────────────────────────────────────────────────────────────────────────

type Stage = {
  label: string;
  eyebrow: string;
  title: string;
  desc: string;
  frameLabel: string;
};

const STAGES: Stage[] = [
  {
    label: "Start meeting",
    eyebrow: "Step 1 · Start your meeting with Fixsense.",
    title: "Start your meeting.",
    desc: "Start a meeting from your Fixsense workspace, invite your participants, and join the live meeting. Fixsense records and transcribes the conversation automatically, so you can focus on the discussion instead of taking notes.",
    frameLabel: "live meeting · fixsense.com.ng",
  },
  {
    label: "Capture",
    eyebrow: "Step 2 · Fixsense captures the conversation",
    title: "Speakers are identified automatically.",
    desc: "While the conversation happens, Fixsense transcribes it in real time and attributes every line to the right speaker — no manual tagging.",
    frameLabel: "transcript · fixsense.com.ng",
  },
  {
    label: "AI understands",
    eyebrow: "Step 3 · AI understands what happened",
    title: "The conversation becomes structure.",
    desc: "Fixsense processes what was said into a summary, decisions, action items with owners and deadlines, and the key moments worth revisiting.",
    frameLabel: "analysis · fixsense.com.ng",
  },
  {
    label: "Meeting record",
    eyebrow: "Step 4 · Your meeting becomes a record",
    title: "Every call, permanently searchable.",
    desc: "The finished Call Details page holds the summary, action items, decisions, and full transcript — nothing lives only in someone's memory.",
    frameLabel: "call details · fixsense.com.ng",
  },
  {
    label: "Keep it moving",
    eyebrow: "Step 5 · Keep the conversation moving",
    title: "Your meeting doesn't end when the call does.",
    desc: "Decisions, commitments, and follow-ups flow straight into Messages and Deals — connected to the people and work they belong to.",
    frameLabel: "messages · fixsense.com.ng",
  },
];

const AUTOPLAY_MS = 4200;

function TypingCaption() {
  const text = "So the main blocker right now is getting sign-off from legal on the new terms.";
  const [shown, setShown] = useState(0);
  useEffect(() => {
    setShown(0);
    const id = setInterval(() => {
      setShown((n) => {
        if (n >= text.length) { clearInterval(id); return n; }
        return n + 1;
      });
    }, 32);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="s1-caption-text">
      {text.slice(0, shown)}
      <span className="s1-caret" />
    </div>
  );
}

function StageOne() {
  return (
    <div className="panel show">
      <div className="s1-callbar">
        <div className="s1-rec"><span className="s1-rec-dot" />REC</div>
        <div className="s1-timer">00:00:14</div>
      </div>
      <div className="s1-tiles">
        <div className="s1-tile speaking">
          <div className="s1-avatar">MC</div>
          <div className="s1-name-tag">Maria Chen</div>
          <div className="s1-wave"><span /><span /><span /><span /></div>
        </div>
        <div className="s1-tile">
          <div className="s1-avatar">DO</div>
          <div className="s1-name-tag">Daniel Osei</div>
        </div>
      </div>
      <div className="s1-controls">
        <div className="s1-ctl"><svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.7)" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0 0 14 0" /></svg></div>
        <div className="s1-ctl"><svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.7)" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><path d="M23 7l-7 5 7 5V7z" /><rect x="1" y="5" width="15" height="14" rx="2" /></svg></div>
        <div className="s1-ctl"><svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.7)" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg></div>
      </div>
      <div className="s1-caption-row">
        <div className="s1-caption-label">Live caption</div>
        <TypingCaption />
      </div>
    </div>
  );
}

function StageTwo() {
  const lines = [
    { n: "Maria Chen", i: "MC", t: "00:12:04", x: "So the main blocker right now is getting sign-off from legal on the new terms." },
    { n: "Daniel Osei", i: "DO", t: "00:12:19", x: "I can follow up with them this afternoon and get a timeline." },
    { n: "Priya Nair", i: "PN", t: "00:12:31", x: "Great, let's revisit this in Thursday's sync once you hear back." },
  ];
  return (
    <div className="panel show">
      <div className="s2-head">Live transcript</div>
      <div className="s2-list">
        {lines.map((l, i) => (
          <div key={i} className="s2-line in" style={{ animationDelay: `${i * 260}ms` }}>
            <div className="s2-avatar">{l.i}</div>
            <div className="s2-body">
              <div className="s2-meta"><span className="s2-name">{l.n}</span><span className="s2-time">{l.t}</span></div>
              <div className="s2-text">{l.x}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StageThree() {
  const cards = [
    { icon: "file-text", label: "Summary", val: "Legal sign-off is the sole blocker to close.", big: false },
    { icon: "check-square", label: "Decisions", val: "2", big: true },
    { icon: "trending", label: "Action items", val: "4", big: true },
    { icon: "clock", label: "Deadlines", val: "Thu sync", big: false },
  ];
  return (
    <div className="panel show">
      <div className="s3-head"><span className="s3-spinner" /> Fixsense is analyzing</div>
      <div className="s3-grid">
        {cards.map((c, i) => (
          <div key={i} className="s3-card in" style={{ animationDelay: `${i * 220}ms` }}>
            <div className="s3-card-label"><Icon name={c.icon} size={12} strokeWidth={1.8} />{c.label}</div>
            <div className={c.big ? "s3-card-val num" : "s3-card-val"}>{c.val}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StageFour() {
  const stats: [string, string][] = [["4", "Action items"], ["2", "Decisions"], ["3", "Participants"], ["34m", "Transcript"]];
  const items: [string, string][] = [
    ["Daniel to follow up with legal on contract terms", "Owner: Daniel Osei · Due Thu"],
    ["Priya to prep renewal numbers for next sync", "Owner: Priya Nair · Due Thu"],
    ["Send updated MSA redline to Acme legal team", "Owner: Maria Chen · Due Fri"],
  ];
  return (
    <div className="panel show">
      <div className="s4-top">
        <div>
          <div className="s4-title">Pipeline review — Acme Corp</div>
          <div className="s4-meta">Aug 12, 2026 · 34 min · 3 participants</div>
        </div>
        <div className="s4-badge">Complete</div>
      </div>
      <div className="s4-stats">
        {stats.map(([v, l], i) => (
          <div key={i} className="s4-stat">
            <div className="s4-stat-val" style={{ animationDelay: `${i * 90}ms` }}>{v}</div>
            <div className="s4-stat-label">{l}</div>
          </div>
        ))}
      </div>
      <div className="s4-rows">
        {items.map(([t, m], i) => (
          <div key={i} className="s4-row in" style={{ animationDelay: `${i * 200}ms` }}>
            <div className="s4-check"><Icon name="check" size={8} strokeWidth={2.6} /></div>
            <div><div className="s4-row-text">{t}</div><div className="s4-row-meta">{m}</div></div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StageFive() {
  const nodes: [string, string][] = [["file-text", "Meeting"], ["trending", "Summary"], ["check-square", "Action items"], ["message", "Team chat"]];
  return (
    <div className="panel show">
      <div className="s5-flow">
        {nodes.map((n, i) => (
          <div key={i} style={{ display: "contents" }}>
            <div className="s5-node in" style={{ animationDelay: `${i * 200}ms` }}>
              <div className="s5-node-icon"><Icon name={n[0]} size={16} strokeWidth={1.7} /></div>
              <div className="s5-node-label">{n[1]}</div>
            </div>
            {i < nodes.length - 1 && <div className="s5-arrow" />}
          </div>
        ))}
      </div>
      <div className="s5-thread in" style={{ animationDelay: "900ms" }}>
        <div className="s5-msg">
          <div className="s5-msg-avatar">FX</div>
          <div><div className="s5-msg-name">Fixsense</div><div className="s5-msg-text">4 action items posted from "Pipeline review — Acme Corp." Daniel is owner on 2.</div></div>
        </div>
        <div className="s5-msg">
          <div className="s5-msg-avatar">DO</div>
          <div><div className="s5-msg-name">Daniel Osei</div><div className="s5-msg-text">On it — following up with legal now.</div></div>
        </div>
      </div>
    </div>
  );
}

const STAGE_COMPONENTS = [StageOne, StageTwo, StageThree, StageFour, StageFive];

function HowItWorksInteractive() {
  // Autoplay is the default, continuous experience — it loops forever (stage 5 → stage 1)
  // until the visitor explicitly pauses it or clicks a stage/nav control themselves.
  const [current, setCurrent] = useState(0);
  const [autoplay, setAutoplay] = useState(true);
  const [progress, setProgress] = useState(0);
  const rafRef = useRef<number>();
  const startRef = useRef<number>(0);

  // Pause autoplay only while the section is actually on screen isn't required here —
  // IntersectionObserver could be added later, but requestAnimationFrame already stays
  // cheap (a single style write per tick) so it's safe to run continuously.
  const goTo = useCallback((i: number) => {
    setCurrent(i);
    setProgress(0);
  }, []);

  const stopAutoplay = useCallback(() => {
    setAutoplay(false);
    setProgress(0);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);

  const startAutoplay = useCallback(() => {
    setAutoplay(true);
  }, []);

  useEffect(() => {
    if (!autoplay) return;
    startRef.current = performance.now();
    function frame(now: number) {
      const elapsed = now - startRef.current;
      const pct = Math.min(100, (elapsed / AUTOPLAY_MS) * 100);
      setProgress(pct);
      if (elapsed >= AUTOPLAY_MS) {
        setCurrent((c) => (c === STAGES.length - 1 ? 0 : c + 1));
        startRef.current = now;
        setProgress(0);
      }
      rafRef.current = requestAnimationFrame(frame);
    }
    rafRef.current = requestAnimationFrame(frame);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [autoplay]);

  const StageVisual = STAGE_COMPONENTS[current];
  const s = STAGES[current];

  return (
    <section className="section" id="how-it-works">
      <div className="section-inner">
        <Reveal>
          <div style={{ textAlign: "center", marginBottom: 8 }}>
            <div className="kicker" style={{ justifyContent: "center" }}>See how Fixsense works</div>
            <h2 className="section-h" style={{ textAlign: "center", maxWidth: 620, margin: "0 auto" }}>
              From conversation to useful follow-up, automatically.
            </h2>
            <p className="section-sub" style={{ textAlign: "center", margin: "0 auto" }}>
              Click through each stage below, or let it play. This is the actual product experience — start to finish, in under 30 seconds.
            </p>
          </div>
        </Reveal>

        <div className="stage-rail">
          {STAGES.map((st, i) => (
            <div key={i} style={{ display: "contents" }}>
              <button
                className={`stage-btn${current === i ? " active" : ""}${current > i ? " done" : ""}`}
                onClick={() => { stopAutoplay(); goTo(i); }}
              >
                <span className="stage-num">{i + 1}</span>
                <span className="stage-label">{st.label}</span>
              </button>
              {i < STAGES.length - 1 && <div className="stage-connector" />}
            </div>
          ))}
        </div>

        <div className="progress-track"><div className="progress-fill" style={{ width: `${progress}%` }} /></div>
        <div className="autoplay-row">
          <button className="autoplay-btn" onClick={() => (autoplay ? stopAutoplay() : startAutoplay())}>
            {autoplay ? (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
            ) : (
              <Icon name="play" size={12} />
            )}
            {autoplay ? "Pause" : "Play walkthrough"}
          </button>
        </div>

        <div className="stage-panel">
          <div className="stage-copy">
            <div className="stage-eyebrow">{s.eyebrow}</div>
            <h3 className="stage-title">{s.title}</h3>
            <p className="stage-desc">{s.desc}</p>
          </div>
          <div className="stage-visual">
            <div className="frame">
              <div className="frame-bar">
                <div className="frame-dots"><span /><span /><span /></div>
                <span className="frame-label">{s.frameLabel}</span>
              </div>
              <div className="frame-body" key={current}>
                <StageVisual />
              </div>
            </div>
          </div>
        </div>

        <div className="stage-nav">
          <button className="nav-btn" disabled={current === 0} onClick={() => { stopAutoplay(); goTo(Math.max(0, current - 1)); }}>Back</button>
          <button className="nav-btn" onClick={() => { stopAutoplay(); goTo(current === STAGES.length - 1 ? 0 : current + 1); }}>
            {current === STAGES.length - 1 ? "Restart" : "Next stage"}
          </button>
        </div>

        <div className="hiw-cta">
          <div className="hiw-cta-h">Your first meeting can look like this.</div>
          <a href="/login" className="btn-hero">Start for free</a>
          <div className="hiw-cta-note">No credit card required.</div>
        </div>
      </div>
    </section>
  );
}

export default function LandingPage() {
  const { user } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeFaq, setActiveFaq] = useState<number | null>(0);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 24);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  const closeMobile = useCallback(() => setMobileOpen(false), []);

  const plans = [PLAN_CONFIG.free, PLAN_CONFIG.starter, PLAN_CONFIG.growth, PLAN_CONFIG.scale];

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,400;0,14..32,500;0,14..32,600;0,14..32,700;0,14..32,800&family=IBM+Plex+Mono:wght@500&display=swap');

    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    :root{
      --paper:#FAFAF8;--paper2:#F3F2ED;--ink-panel:#14140F;
      --ink:#17170F;--ink2:rgba(23,23,15,0.66);--muted:rgba(23,23,15,0.42);--faint:rgba(23,23,15,0.28);
      --border:rgba(23,23,15,0.11);--border-strong:rgba(23,23,15,0.18);
      --accent:#22315C;--accent-ink:#FAFAF8;--accent-soft:rgba(34,49,92,0.07);--accent-border:rgba(34,49,92,0.22);
      --good:#2F6B4F;--good-soft:rgba(47,107,79,0.09);
      --warn:#8A5A20;--warn-soft:rgba(138,90,32,0.09);
      --fd:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
      --fb:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
      --fm:'IBM Plex Mono',ui-monospace,monospace;
      --touch:44px;
      --radius-s:6px;--radius-m:10px;--radius-l:14px;
    }

    html{scroll-behavior:smooth;-webkit-text-size-adjust:100%;}
    @media (prefers-reduced-motion: reduce){
      html{scroll-behavior:auto;}
      .lp *{animation-duration:.001ms!important;animation-iteration-count:1!important;transition-duration:.001ms!important;}
    }
    .lp{background:var(--paper);color:var(--ink);font-family:var(--fb);-webkit-font-smoothing:antialiased;overflow-x:hidden;min-height:100vh;font-feature-settings:"cv02","cv03","cv04";}
    .lp :focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:3px;}
    .lp a{color:inherit;}

    /* ══════════════════════════════════════════
       NAV
    ══════════════════════════════════════════ */
    .nav{position:fixed;top:0;left:0;right:0;z-index:200;height:60px;display:flex;align-items:center;padding:0 22px;transition:background .25s,border-color .25s;border-bottom:1px solid transparent;}
    .nav.scrolled{background:rgba(250,250,248,0.92);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border-bottom-color:var(--border);}
    .nav-inner{max-width:1180px;width:100%;margin:0 auto;display:flex;align-items:center;justify-content:space-between;gap:16px;}
    .nav-brand{display:flex;align-items:center;gap:9px;text-decoration:none;min-height:var(--touch);align-self:center;}
    .nav-brandname{font-size:15.5px;font-weight:700;color:var(--ink)!important;letter-spacing:-.01em;}
    .nav-links{display:flex;align-items:center;gap:26px;}
    .nav-link{font-size:13.5px;font-weight:500;color:var(--ink2)!important;text-decoration:none;transition:color .15s;padding:4px 0;min-height:var(--touch);display:inline-flex;align-items:center;}
    .nav-link:hover{color:var(--ink)!important;}
    .nav-actions{display:flex;align-items:center;gap:6px;}
    .btn-ghost{font-size:13.5px;font-weight:500;color:var(--ink2)!important;background:none;border:none;padding:9px 14px;border-radius:var(--radius-s);cursor:pointer;text-decoration:none;transition:color .15s,background .15s;font-family:var(--fb);min-height:var(--touch);display:inline-flex;align-items:center;}
    .btn-ghost:hover{color:var(--ink)!important;background:rgba(23,23,15,.04);}
    .btn-primary{display:inline-flex;align-items:center;gap:6px;font-size:13.5px;font-weight:600;color:var(--accent-ink)!important;background:var(--accent);border:1px solid var(--accent);padding:9px 17px;border-radius:var(--radius-s);cursor:pointer;text-decoration:none;font-family:var(--fb);transition:opacity .15s,transform .15s;white-space:nowrap;min-height:var(--touch);}
    .btn-primary:hover{opacity:.88;}
    .btn-primary:active{transform:scale(.98);}
    .btn-outline{display:inline-flex;align-items:center;gap:6px;font-size:13.5px;font-weight:600;color:var(--ink)!important;background:transparent;border:1px solid var(--border-strong);padding:9px 17px;border-radius:var(--radius-s);cursor:pointer;text-decoration:none;font-family:var(--fb);transition:border-color .15s,background .15s;min-height:var(--touch);}
    .btn-outline:hover{border-color:var(--ink);background:rgba(23,23,15,.02);}

    .hamburger{display:none;flex-direction:column;gap:4px;width:40px;height:40px;align-items:center;justify-content:center;background:transparent;border:1px solid var(--border-strong);border-radius:var(--radius-s);cursor:pointer;-webkit-tap-highlight-color:transparent;flex-shrink:0;}
    .hamburger span{display:block;width:16px;height:1.5px;background:var(--ink);border-radius:2px;transition:all .2s;}
    .hamburger.open span:nth-child(1){transform:translateY(5.5px) rotate(45deg);}
    .hamburger.open span:nth-child(2){opacity:0;}
    .hamburger.open span:nth-child(3){transform:translateY(-5.5px) rotate(-45deg);}

    .mobile-menu{display:none;position:fixed;inset:0;top:60px;z-index:199;background:var(--paper);flex-direction:column;padding:8px 22px 32px;border-top:1px solid var(--border);overflow-y:auto;-webkit-overflow-scrolling:touch;}
    .mobile-menu.open{display:flex;}
    .mobile-link{font-size:18px;font-weight:600;color:var(--ink2)!important;text-decoration:none;padding:15px 0;border-bottom:1px solid var(--border);display:flex;align-items:center;transition:color .15s;min-height:52px;}
    .mobile-link:active,.mobile-link:hover{color:var(--ink)!important;}
    .mobile-ctas{margin-top:20px;display:flex;flex-direction:column;gap:9px;}

    @media(min-width:901px){
      .hamburger{display:none!important;}
      .mobile-menu{display:none!important;}
    }
    @media(max-width:900px){
      .nav-links{display:none;}
      .nav-actions .btn-ghost{display:none;}
      .hamburger{display:flex;}
    }

    /* ══════════════════════════════════════════
       HERO
    ══════════════════════════════════════════ */
    .hero{padding:126px 22px 0;position:relative;}
    .hero-inner{max-width:1180px;margin:0 auto;width:100%;}
    .hero-top{max-width:760px;}
    .hero-h{font-size:clamp(32px,4.8vw,58px);font-weight:700;line-height:1.08;letter-spacing:-.03em;color:var(--ink);margin-top:8px;margin-bottom:20px;}
    .hero-sub{font-size:clamp(15.5px,1.6vw,18px);color:var(--ink2);line-height:1.65;max-width:600px;margin-bottom:32px;}
    .hero-ctas{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:26px;}
    .btn-hero{display:inline-flex;align-items:center;justify-content:center;gap:8px;font-size:14.5px;font-weight:600;color:var(--accent-ink)!important;background:var(--accent);border:1px solid var(--accent);padding:13px 24px;border-radius:var(--radius-s);cursor:pointer;text-decoration:none;font-family:var(--fb);transition:opacity .15s,transform .12s;min-height:48px;}
    .btn-hero:hover{opacity:.9;}
    .btn-hero:active{transform:scale(.985);}
    .btn-hero-outline{display:inline-flex;align-items:center;justify-content:center;gap:8px;font-size:14.5px;font-weight:600;color:var(--ink)!important;background:transparent;border:1px solid var(--border-strong);padding:13px 22px;border-radius:var(--radius-s);cursor:pointer;text-decoration:none;font-family:var(--fb);transition:border-color .15s,background .15s;min-height:48px;}
    .btn-hero-outline:hover{border-color:var(--ink);background:rgba(23,23,15,.02);}
    .hero-trust{display:flex;align-items:center;gap:18px;flex-wrap:wrap;row-gap:8px;}
    .trust-pill{display:flex;align-items:center;gap:6px;font-size:12.5px;color:var(--muted);font-weight:500;}
    .trust-pill svg{color:var(--good);flex-shrink:0;}

    .hero-audience{margin:36px 0 0;padding-top:24px;border-top:1px solid var(--border);}
    .hero-audience-label{font-size:11px;font-weight:600;color:var(--faint);text-transform:uppercase;letter-spacing:.09em;margin-bottom:12px;font-family:var(--fm);}
    .hero-audience-list{display:flex;flex-wrap:wrap;gap:7px;}
    .hero-audience-pill{font-size:12.5px;font-weight:500;color:var(--ink2);background:var(--paper2);border:1px solid var(--border);border-radius:100px;padding:6px 13px;white-space:nowrap;}

    /* Product mock wrapper */
    .hero-mock-wrap{margin-top:48px;padding-bottom:64px;}

    @media(max-width:640px){
      .hero{padding:104px 16px 0;}
      .hero-ctas{flex-direction:column;align-items:stretch;}
      .hero-ctas a{width:100%;}
      .hero-mock-wrap{margin-top:36px;padding-bottom:44px;}
    }

    /* ══════════════════════════════════════════
       PRODUCT MOCK
    ══════════════════════════════════════════ */
    .mock{background:var(--ink-panel);border-radius:var(--radius-l);overflow:hidden;box-shadow:0 1px 2px rgba(0,0,0,.04), 0 24px 64px -24px rgba(20,20,15,.35), 0 0 0 1px rgba(20,20,15,.04);}
    .mock-titlebar{display:flex;align-items:center;gap:10px;padding:12px 16px;background:rgba(255,255,255,.03);border-bottom:1px solid rgba(255,255,255,.08);}
    .mock-dots{display:flex;gap:6px;}
    .mock-dots span{width:9px;height:9px;border-radius:50%;background:rgba(255,255,255,.14);}
    .mock-titlebar-name{font-size:12.5px;color:rgba(255,255,255,.55);font-weight:500;flex:1;text-align:center;}
    .mock-rec{display:flex;align-items:center;gap:6px;font-size:11.5px;font-weight:600;color:#E8998A;font-family:var(--fm);flex-shrink:0;}
    .mock-rec-dot{width:6px;height:6px;border-radius:50%;background:#E8998A;}

    .mock-body{display:grid;grid-template-columns:1.15fr 1fr;}
    .mock-transcript-pane{padding:18px 20px;border-right:1px solid rgba(255,255,255,.07);}
    .mock-summary-pane{padding:18px 20px;background:rgba(255,255,255,.015);}
    .mock-pane-head{display:flex;align-items:center;gap:7px;font-size:11px;font-weight:600;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:.07em;margin-bottom:14px;font-family:var(--fm);}
    .mock-pane-head svg{color:rgba(255,255,255,.4);}

    .mock-transcript-list{display:flex;flex-direction:column;gap:14px;}
    .mock-t-row{display:flex;flex-direction:column;gap:3px;}
    .mock-t-meta{display:flex;align-items:baseline;gap:8px;}
    .mock-t-speaker{font-size:12.5px;font-weight:600;color:rgba(255,255,255,.85);}
    .mock-t-time{font-size:10.5px;color:rgba(255,255,255,.3);font-family:var(--fm);}
    .mock-t-text{font-size:13px;color:rgba(255,255,255,.62);line-height:1.55;}
    .mock-t-live .mock-t-text{color:rgba(255,255,255,.85);}
    .mock-caret{display:inline-block;width:2px;height:12px;background:#8FA6D6;margin-left:2px;vertical-align:-2px;animation:mockblink 1s step-end infinite;}
    @keyframes mockblink{0%,49%{opacity:1}50%,100%{opacity:0}}

    .mock-summary-text{font-size:13px;color:rgba(255,255,255,.65);line-height:1.65;}
    .mock-action-list{display:flex;flex-direction:column;gap:10px;}
    .mock-action-row{display:flex;align-items:flex-start;gap:9px;}
    .mock-action-box{width:14px;height:14px;border-radius:4px;border:1.3px solid rgba(255,255,255,.28);flex-shrink:0;margin-top:2px;}
    .mock-action-text{font-size:12.5px;color:rgba(255,255,255,.8);line-height:1.5;}
    .mock-action-meta{font-size:11px;color:rgba(255,255,255,.35);margin-top:2px;}

    .mock-insight-row{display:flex;margin-top:18px;padding-top:16px;border-top:1px solid rgba(255,255,255,.07);gap:0;}
    .mock-insight{flex:1;}
    .mock-insight-val{font-size:19px;font-weight:700;color:#fff;letter-spacing:-.01em;margin-bottom:2px;}
    .mock-insight-label{font-size:10.5px;color:rgba(255,255,255,.38);}

    @media(max-width:760px){
      .mock-body{grid-template-columns:1fr;}
      .mock-transcript-pane{border-right:none;border-bottom:1px solid rgba(255,255,255,.07);}
    }
    @media(max-width:480px){
      .mock-titlebar-name{display:none;}
      .mock-body{padding:0;}
      .mock-transcript-pane,.mock-summary-pane{padding:15px 14px;}
    }

    /* ══════════════════════════════════════════
       LOGO / TRUST STRIP  (no fabricated numbers, plain company text)
    ══════════════════════════════════════════ */
    .strip{padding:20px 22px;border-top:1px solid var(--border);border-bottom:1px solid var(--border);background:var(--paper2);}
    .strip-inner{max-width:1180px;margin:0 auto;display:flex;align-items:center;gap:16px;flex-wrap:wrap;}
    .strip-label{font-size:12px;color:var(--muted);font-weight:500;}

    /* ══════════════════════════════════════════
       SHARED SECTION STYLES
    ══════════════════════════════════════════ */
    .section{padding:88px 22px;}
    .section-inner{max-width:1180px;margin:0 auto;}
    .kicker{font-family:var(--fm);font-size:11px;font-weight:600;color:var(--accent);text-transform:uppercase;letter-spacing:.09em;margin-bottom:14px;display:flex;align-items:center;gap:8px;}
    .section-h{font-size:clamp(24px,3.4vw,38px);font-weight:700;color:var(--ink);letter-spacing:-.025em;line-height:1.16;margin-bottom:14px;}
    .section-sub{font-size:clamp(14.5px,1.6vw,16px);color:var(--ink2);line-height:1.68;max-width:560px;}
    @media(max-width:640px){.section{padding:56px 16px;}}

    /* ══════════════════════════════════════════
       PROBLEM STRIP
    ══════════════════════════════════════════ */
    .problem-flow{display:flex;align-items:stretch;gap:0;margin-top:40px;border:1px solid var(--border);border-radius:var(--radius-l);overflow:hidden;}
    .problem-step{flex:1;padding:26px 22px;position:relative;background:var(--paper);}
    .problem-step + .problem-step{border-left:1px solid var(--border);}
    .problem-step-num{font-family:var(--fm);font-size:11px;font-weight:600;color:var(--faint);margin-bottom:10px;}
    .problem-step-title{font-size:14.5px;font-weight:600;color:var(--ink);margin-bottom:6px;letter-spacing:-.01em;}
    .problem-step-desc{font-size:12.5px;color:var(--muted);line-height:1.55;}
    .problem-step.is-fix{background:var(--accent-soft);}
    .problem-step.is-fix .problem-step-num{color:var(--accent);}
    @media(max-width:860px){
      .problem-flow{flex-direction:column;border-radius:var(--radius-m);}
      .problem-step + .problem-step{border-left:none;border-top:1px solid var(--border);}
    }

    /* ══════════════════════════════════════════
       USE CASES
    ══════════════════════════════════════════ */
    .usecase-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;margin-top:40px;background:var(--border);border:1px solid var(--border);border-radius:var(--radius-l);overflow:hidden;}
    .usecase-card{background:var(--paper);padding:26px 24px;}
    .usecase-icon{width:34px;height:34px;border-radius:var(--radius-s);background:var(--accent-soft);border:1px solid var(--accent-border);display:flex;align-items:center;justify-content:center;color:var(--accent);margin-bottom:16px;}
    .usecase-title{font-size:14.5px;font-weight:600;color:var(--ink);margin-bottom:6px;letter-spacing:-.01em;}
    .usecase-desc{font-size:12.5px;color:var(--muted);line-height:1.6;}
    @media(max-width:860px){.usecase-grid{grid-template-columns:1fr 1fr;}}
    @media(max-width:560px){.usecase-grid{grid-template-columns:1fr;}}

    /* ══════════════════════════════════════════
       FIRST MINUTES (numbered — genuine sequence)
    ══════════════════════════════════════════ */
    .steps-rail{margin-top:44px;display:flex;flex-direction:column;}
    .steps-row{display:grid;grid-template-columns:64px 1fr;gap:20px;padding:22px 0;}
    .steps-row + .steps-row{border-top:1px solid var(--border);}
    .steps-num-col{display:flex;flex-direction:column;align-items:center;}
    .steps-num{width:32px;height:32px;border-radius:50%;border:1px solid var(--border-strong);display:flex;align-items:center;justify-content:center;font-family:var(--fm);font-size:12.5px;font-weight:600;color:var(--ink2);flex-shrink:0;}
    .steps-body{display:flex;align-items:flex-start;gap:16px;flex-wrap:wrap;}
    .steps-icon{width:34px;height:34px;border-radius:var(--radius-s);background:var(--paper2);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;color:var(--ink2);flex-shrink:0;}
    .steps-text{flex:1;min-width:200px;}
    .steps-title{font-size:15px;font-weight:600;color:var(--ink);margin-bottom:4px;letter-spacing:-.01em;}
    .steps-desc{font-size:13px;color:var(--muted);line-height:1.6;max-width:480px;}
    @media(max-width:560px){
      .steps-row{grid-template-columns:40px 1fr;gap:12px;}
      .steps-num{width:26px;height:26px;font-size:11px;}
    }

    /* ══════════════════════════════════════════
       HOW IT WORKS — interactive walkthrough
    ══════════════════════════════════════════ */
    .hiw-cta{text-align:center;margin-top:56px;padding-top:44px;border-top:1px solid var(--border);}
    .hiw-cta-h{font-size:clamp(18px,2vw,22px);font-weight:700;letter-spacing:-.015em;margin-bottom:18px;}
    .hiw-cta-note{font-size:12px;color:var(--faint);margin-top:12px;}

    .stage-rail{display:flex;align-items:center;justify-content:center;gap:6px;margin:44px 0 28px;flex-wrap:wrap;}
    .stage-btn{display:flex;align-items:center;gap:9px;padding:9px 14px 9px 10px;border-radius:100px;border:1px solid var(--border);background:var(--paper);cursor:pointer;transition:border-color .2s,background .2s;font-family:var(--fb);}
    .stage-btn:hover{border-color:var(--border-strong);}
    .stage-btn.active{border-color:var(--accent);background:var(--accent-soft);}
    .stage-num{width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:var(--fm);font-size:10.5px;font-weight:600;background:var(--paper2);color:var(--muted);flex-shrink:0;transition:background .2s,color .2s;}
    .stage-btn.active .stage-num{background:var(--accent);color:var(--accent-ink);}
    .stage-btn.done .stage-num{background:var(--good-soft);color:var(--good);}
    .stage-label{font-size:12.5px;font-weight:600;color:var(--ink2);white-space:nowrap;}
    .stage-btn.active .stage-label{color:var(--ink);}
    .stage-connector{width:16px;height:1px;background:var(--border);flex-shrink:0;}
    @media (max-width:820px){.stage-connector{display:none;} .stage-rail{gap:8px;}}

    .progress-track{max-width:640px;margin:0 auto 4px;height:2px;background:var(--border);border-radius:2px;overflow:hidden;}
    .progress-fill{height:100%;background:var(--accent);width:0%;transition:width .05s linear;}
    .autoplay-row{display:flex;align-items:center;justify-content:center;gap:14px;margin-bottom:40px;}
    .autoplay-btn{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:600;color:var(--ink2);background:none;border:none;cursor:pointer;font-family:var(--fb);padding:4px 8px;}
    .autoplay-btn:hover{color:var(--ink);}

    .stage-panel{display:grid;grid-template-columns:1fr 1.3fr;gap:48px;align-items:center;}
    @media (max-width:860px){.stage-panel{grid-template-columns:1fr;gap:28px;}}
    .stage-copy{}
    .stage-eyebrow{font-family:var(--fm);font-size:11px;font-weight:600;color:var(--faint);text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px;}
    .stage-title{font-size:clamp(19px,2.2vw,24px);font-weight:700;letter-spacing:-.015em;line-height:1.24;margin-bottom:10px;}
    .stage-desc{font-size:14.5px;color:var(--ink2);line-height:1.68;max-width:380px;}
    .stage-visual{position:relative;}

    .frame{background:var(--ink-panel);border-radius:var(--radius-l);overflow:hidden;box-shadow:0 1px 2px rgba(0,0,0,.04), 0 24px 64px -24px rgba(20,20,15,.35), 0 0 0 1px rgba(20,20,15,.04);}
    .frame-bar{display:flex;align-items:center;gap:10px;padding:11px 15px;background:rgba(255,255,255,.03);border-bottom:1px solid rgba(255,255,255,.08);}
    .frame-dots{display:flex;gap:6px;}
    .frame-dots span{width:8px;height:8px;border-radius:50%;background:rgba(255,255,255,.14);}
    .frame-label{font-size:11px;color:rgba(255,255,255,.35);font-family:var(--fm);flex:1;text-align:center;}
    .frame-body{min-height:290px;position:relative;overflow:hidden;}

    .panel{padding:20px 22px;opacity:0;transform:translateY(6px);animation:panelIn .35s cubic-bezier(.16,1,.3,1) forwards;}
    .panel.show{opacity:1;transform:translateY(0);}
    @keyframes panelIn{to{opacity:1;transform:translateY(0)}}

    .s1-callbar{display:flex;align-items:center;justify-content:space-between;margin-bottom:22px;}
    .s1-rec{display:flex;align-items:center;gap:7px;font-size:11.5px;font-weight:600;color:#E8998A;font-family:var(--fm);}
    .s1-rec-dot{width:6px;height:6px;border-radius:50%;background:#E8998A;animation:pulse 1.4s ease-in-out infinite;}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}
    .s1-timer{font-size:11px;color:rgba(255,255,255,.3);font-family:var(--fm);}
    .s1-tiles{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:18px;}
    .s1-tile{aspect-ratio:16/10;border-radius:8px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.06);display:flex;align-items:center;justify-content:center;position:relative;}
    .s1-avatar{width:38px;height:38px;border-radius:50%;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:600;}
    .s1-name-tag{position:absolute;bottom:7px;left:8px;font-size:10px;color:rgba(255,255,255,.55);background:rgba(0,0,0,.3);padding:2px 6px;border-radius:4px;}
    .s1-tile.speaking{border-color:rgba(143,166,214,.5);}
    .s1-wave{position:absolute;bottom:7px;right:8px;display:flex;gap:2px;align-items:flex-end;height:12px;}
    .s1-wave span{width:2px;background:#8FA6D6;border-radius:1px;animation:wv 0.9s ease-in-out infinite;}
    .s1-wave span:nth-child(1){height:5px;animation-delay:0s}
    .s1-wave span:nth-child(2){height:10px;animation-delay:.15s}
    .s1-wave span:nth-child(3){height:7px;animation-delay:.3s}
    .s1-wave span:nth-child(4){height:11px;animation-delay:.45s}
    @keyframes wv{0%,100%{transform:scaleY(.4)}50%{transform:scaleY(1)}}
    .s1-controls{display:flex;align-items:center;justify-content:center;gap:10px;padding-top:14px;border-top:1px solid rgba(255,255,255,.07);}
    .s1-ctl{width:34px;height:34px;border-radius:50%;background:rgba(255,255,255,.06);display:flex;align-items:center;justify-content:center;}
    .s1-caption-row{margin-top:16px;padding-top:14px;border-top:1px solid rgba(255,255,255,.07);}
    .s1-caption-label{font-size:10px;font-weight:600;color:rgba(255,255,255,.35);text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px;font-family:var(--fm);}
    .s1-caption-text{font-size:13px;color:rgba(255,255,255,.75);line-height:1.5;min-height:20px;}
    .s1-caret{display:inline-block;width:2px;height:12px;background:#8FA6D6;margin-left:2px;vertical-align:-2px;animation:mockblink 1s step-end infinite;}

    .s2-head{display:flex;align-items:center;gap:7px;font-size:11px;font-weight:600;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:.07em;margin-bottom:16px;font-family:var(--fm);}
    .s2-list{display:flex;flex-direction:column;gap:15px;}
    .s2-line{display:flex;gap:11px;opacity:0;transform:translateY(4px);}
    .s2-line.in{animation:lineIn .4s cubic-bezier(.16,1,.3,1) forwards;}
    @keyframes lineIn{to{opacity:1;transform:translateY(0)}}
    .s2-avatar{width:26px;height:26px;border-radius:50%;background:rgba(255,255,255,.08);color:rgba(255,255,255,.7);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:600;flex-shrink:0;}
    .s2-body{flex:1;min-width:0;}
    .s2-meta{display:flex;align-items:baseline;gap:8px;margin-bottom:3px;}
    .s2-name{font-size:12.5px;font-weight:600;color:rgba(255,255,255,.85);}
    .s2-time{font-size:10.5px;color:rgba(255,255,255,.3);font-family:var(--fm);}
    .s2-text{font-size:13px;color:rgba(255,255,255,.65);line-height:1.55;}

    .s3-head{display:flex;align-items:center;gap:8px;font-size:11px;font-weight:600;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:.07em;margin-bottom:18px;font-family:var(--fm);}
    .s3-spinner{width:12px;height:12px;border-radius:50%;border:1.5px solid rgba(143,166,214,.25);border-top-color:#8FA6D6;animation:spin .8s linear infinite;display:inline-block;}
    @keyframes spin{to{transform:rotate(360deg)}}
    .s3-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
    .s3-card{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:8px;padding:12px 13px;opacity:0;transform:scale(.96);}
    .s3-card.in{animation:cardIn .45s cubic-bezier(.16,1,.3,1) forwards;}
    @keyframes cardIn{to{opacity:1;transform:scale(1)}}
    .s3-card-label{display:flex;align-items:center;gap:6px;font-size:10.5px;font-weight:600;color:rgba(255,255,255,.5);margin-bottom:6px;}
    .s3-card-label svg{color:rgba(255,255,255,.5);}
    .s3-card-val{font-size:13px;color:rgba(255,255,255,.85);line-height:1.4;}
    .s3-card-val.num{font-size:20px;font-weight:700;color:#fff;}

    .s4-top{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid rgba(255,255,255,.07);}
    .s4-title{font-size:14px;font-weight:600;color:#fff;margin-bottom:4px;}
    .s4-meta{font-size:11px;color:rgba(255,255,255,.35);font-family:var(--fm);}
    .s4-badge{font-size:10.5px;font-weight:600;color:#8FA6D6;background:rgba(143,166,214,.12);padding:4px 9px;border-radius:100px;}
    .s4-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:0;margin-bottom:18px;}
    .s4-stat{padding-right:10px;}
    .s4-stat-val{font-size:19px;font-weight:700;color:#fff;letter-spacing:-.01em;margin-bottom:2px;opacity:0;animation:fadeUp .4s cubic-bezier(.16,1,.3,1) forwards;}
    @keyframes fadeUp{from{opacity:0;transform:translateY(3px)}to{opacity:1;transform:translateY(0)}}
    .s4-stat-label{font-size:10px;color:rgba(255,255,255,.38);}
    .s4-rows{display:flex;flex-direction:column;gap:9px;}
    .s4-row{display:flex;align-items:flex-start;gap:9px;opacity:0;transform:translateY(4px);}
    .s4-row.in{animation:lineIn .4s cubic-bezier(.16,1,.3,1) forwards;}
    .s4-check{width:14px;height:14px;border-radius:4px;background:rgba(47,107,79,.25);display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1.5px;}
    .s4-check svg{stroke:#7FC79E;}
    .s4-row-text{font-size:12.5px;color:rgba(255,255,255,.8);line-height:1.5;}
    .s4-row-meta{font-size:10.5px;color:rgba(255,255,255,.35);margin-top:1px;}

    .s5-flow{display:flex;align-items:center;gap:0;margin-bottom:20px;flex-wrap:wrap;}
    .s5-node{display:flex;flex-direction:column;align-items:center;gap:6px;opacity:0;transform:scale(.92);}
    .s5-node.in{animation:cardIn .4s cubic-bezier(.16,1,.3,1) forwards;}
    .s5-node-icon{width:36px;height:36px;border-radius:9px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.09);display:flex;align-items:center;justify-content:center;}
    .s5-node-icon svg{color:rgba(255,255,255,.75);}
    .s5-node-label{font-size:10px;color:rgba(255,255,255,.45);text-align:center;white-space:nowrap;}
    .s5-arrow{flex:1;min-width:14px;height:1px;background:rgba(255,255,255,.14);position:relative;margin:0 4px 22px;}
    .s5-arrow::after{content:'';position:absolute;right:0;top:-3px;width:6px;height:6px;border-top:1px solid rgba(255,255,255,.3);border-right:1px solid rgba(255,255,255,.3);transform:rotate(45deg);}
    .s5-thread{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:8px;padding:12px 13px;opacity:0;transform:translateY(6px);}
    .s5-thread.in{animation:lineIn .45s cubic-bezier(.16,1,.3,1) forwards;}
    .s5-msg{display:flex;gap:9px;margin-bottom:9px;}
    .s5-msg:last-child{margin-bottom:0;}
    .s5-msg-avatar{width:22px;height:22px;border-radius:50%;background:rgba(255,255,255,.08);color:rgba(255,255,255,.65);display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:600;flex-shrink:0;}
    .s5-msg-name{font-size:11.5px;font-weight:600;color:rgba(255,255,255,.8);margin-bottom:2px;}
    .s5-msg-text{font-size:12px;color:rgba(255,255,255,.6);line-height:1.45;}

    .stage-nav{display:flex;justify-content:center;gap:10px;margin-top:28px;}
    .nav-btn{font-size:12.5px;font-weight:600;color:var(--ink2);background:var(--paper);border:1px solid var(--border-strong);padding:8px 16px;border-radius:100px;cursor:pointer;font-family:var(--fb);transition:border-color .15s,color .15s;}
    .nav-btn:hover{color:var(--ink);border-color:var(--ink);}
    .nav-btn:disabled{opacity:.35;cursor:default;}

    @media (prefers-reduced-motion: reduce){
      .s1-rec-dot,.s1-wave span,.s3-spinner,.stage-panel *{animation-duration:.001ms!important;}
    }

    /* ══════════════════════════════════════════
       PRODUCT SHOWCASE (deep dive rows)
    ══════════════════════════════════════════ */
    .showcase-wrap{display:flex;flex-direction:column;gap:72px;margin-top:48px;}
    .showcase-row{display:grid;grid-template-columns:1fr 1fr;gap:56px;align-items:center;}
    .showcase-row.reverse .showcase-copy{order:2;}
    .showcase-row.reverse .showcase-visual{order:1;}
    .showcase-tag{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:600;color:var(--accent);text-transform:uppercase;letter-spacing:.08em;margin-bottom:14px;font-family:var(--fm);}
    .showcase-title{font-size:clamp(19px,2.2vw,25px);font-weight:700;color:var(--ink);letter-spacing:-.02em;margin-bottom:12px;line-height:1.25;}
    .showcase-desc{font-size:14px;color:var(--ink2);line-height:1.7;margin-bottom:18px;}
    .showcase-list{display:flex;flex-direction:column;gap:9px;}
    .showcase-list-item{display:flex;align-items:flex-start;gap:10px;font-size:13px;color:var(--ink2);line-height:1.5;}
    .showcase-check{width:16px;height:16px;border-radius:50%;background:var(--accent-soft);border:1px solid var(--accent-border);display:flex;align-items:center;justify-content:center;color:var(--accent);flex-shrink:0;margin-top:1px;}

    .showcase-frame{background:var(--ink-panel);border-radius:var(--radius-m);overflow:hidden;box-shadow:0 20px 48px -20px rgba(20,20,15,.3), 0 0 0 1px rgba(20,20,15,.04);}
    .showcase-frame-bar{padding:10px 14px;background:rgba(255,255,255,.03);border-bottom:1px solid rgba(255,255,255,.08);display:flex;align-items:center;gap:7px;}
    .showcase-frame-dot{width:7px;height:7px;border-radius:50%;background:rgba(255,255,255,.14);}
    .showcase-frame-label{margin-left:6px;font-size:10.5px;color:rgba(255,255,255,.35);font-family:var(--fm);}
    .showcase-frame-body{padding:18px 20px;}

    .sc-transcript-line{display:flex;gap:10px;padding:9px 0;border-bottom:1px solid rgba(255,255,255,.06);}
    .sc-transcript-line:last-child{border-bottom:none;}
    .sc-avatar{width:24px;height:24px;border-radius:50%;background:rgba(255,255,255,.08);display:flex;align-items:center;justify-content:center;font-size:9.5px;font-weight:700;color:rgba(255,255,255,.7);flex-shrink:0;}
    .sc-t-body{flex:1;min-width:0;}
    .sc-t-meta{display:flex;align-items:baseline;gap:8px;margin-bottom:2px;}
    .sc-t-name{font-size:11.5px;font-weight:600;color:rgba(255,255,255,.85);}
    .sc-t-time{font-size:10px;color:rgba(255,255,255,.3);font-family:var(--fm);}
    .sc-t-text{font-size:12.5px;color:rgba(255,255,255,.6);line-height:1.55;}

    .sc-summary-label{font-size:10px;font-weight:600;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:.07em;margin-bottom:9px;font-family:var(--fm);}
    .sc-summary-section{margin-bottom:18px;}
    .sc-summary-section:last-child{margin-bottom:0;}
    .sc-summary-text{font-size:12.5px;color:rgba(255,255,255,.65);line-height:1.65;}
    .sc-action-row{display:flex;align-items:flex-start;gap:9px;padding:7px 0;}
    .sc-action-box{width:14px;height:14px;border-radius:4px;border:1.3px solid rgba(255,255,255,.28);flex-shrink:0;margin-top:2px;}
    .sc-action-text{font-size:12.5px;color:rgba(255,255,255,.78);line-height:1.5;}
    .sc-action-meta{font-size:10.5px;color:rgba(255,255,255,.35);margin-top:2px;}

    .sc-bar-row{display:flex;align-items:center;gap:12px;padding:8px 0;}
    .sc-bar-name{font-size:11.5px;font-weight:600;color:rgba(255,255,255,.7);width:80px;flex-shrink:0;}
    .sc-bar-track{flex:1;height:6px;border-radius:4px;background:rgba(255,255,255,.06);overflow:hidden;}
    .sc-bar-fill{height:100%;border-radius:4px;background:rgba(255,255,255,.45);}
    .sc-bar-pct{font-size:10.5px;font-weight:600;color:rgba(255,255,255,.4);width:32px;text-align:right;flex-shrink:0;font-family:var(--fm);}

    @media(max-width:900px){
      .showcase-row,.showcase-row.reverse{grid-template-columns:1fr;gap:28px;}
      .showcase-row.reverse .showcase-copy,.showcase-row.reverse .showcase-visual{order:initial;}
    }

    /* ══════════════════════════════════════════
       SECURITY
    ══════════════════════════════════════════ */
    .security-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;margin-top:40px;background:var(--border);border:1px solid var(--border);border-radius:var(--radius-l);overflow:hidden;}
    .security-card{background:var(--paper);padding:24px 22px;}
    .security-icon{width:32px;height:32px;border-radius:var(--radius-s);background:var(--paper2);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;color:var(--ink2);margin-bottom:14px;}
    .security-title{font-size:13.5px;font-weight:600;color:var(--ink);margin-bottom:6px;}
    .security-desc{font-size:12px;color:var(--muted);line-height:1.55;}
    @media(max-width:860px){.security-grid{grid-template-columns:1fr 1fr;}}
    @media(max-width:480px){.security-grid{grid-template-columns:1fr;}}
    .security-footline{margin-top:24px;}
    .security-footlink{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:600;color:var(--ink2)!important;text-decoration:none;transition:color .15s;}
    .security-footlink:hover{color:var(--accent)!important;}

    /* ══════════════════════════════════════════
       PRICING
    ══════════════════════════════════════════ */
    .pricing-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;align-items:stretch;margin-top:44px;}
    .plan-card{border:1px solid var(--border);border-radius:var(--radius-l);padding:24px 22px;display:flex;flex-direction:column;background:var(--paper);}
    .plan-card.featured{border-color:var(--ink);box-shadow:0 1px 2px rgba(0,0,0,.02);}
    .plan-badge{display:inline-block;font-family:var(--fm);font-size:10px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--accent);background:var(--accent-soft);border:1px solid var(--accent-border);border-radius:4px;padding:3px 8px;margin-bottom:14px;align-self:flex-start;}
    .plan-name{font-size:16px;font-weight:700;color:var(--ink);letter-spacing:-.01em;margin-bottom:10px;}
    .plan-price-row{display:flex;align-items:baseline;gap:3px;margin-bottom:4px;}
    .plan-price{font-size:34px;font-weight:700;color:var(--ink);letter-spacing:-.02em;line-height:1;}
    .plan-period{font-size:12.5px;color:var(--muted);}
    .plan-quota{font-size:12.5px;color:var(--ink2);font-weight:500;margin-bottom:18px;}
    .plan-divider{height:1px;background:var(--border);margin-bottom:18px;}
    .plan-feats{list-style:none;display:flex;flex-direction:column;gap:9px;flex:1;margin-bottom:22px;}
    .plan-feat{display:flex;align-items:flex-start;gap:8px;font-size:12.5px;color:var(--ink2);line-height:1.45;}
    .plan-feat svg{color:var(--good);flex-shrink:0;margin-top:2px;}
    .plan-cta{display:block;width:100%;text-align:center;padding:11px;border-radius:var(--radius-s);font-size:13.5px;font-weight:600;font-family:var(--fb);cursor:pointer;text-decoration:none;transition:opacity .15s,background .15s;border:1px solid var(--border-strong);color:var(--ink)!important;}
    .plan-cta:hover{background:rgba(23,23,15,.03);}
    .plan-cta.primary{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)!important;}
    .plan-cta.primary:hover{opacity:.9;background:var(--accent);}
    .pricing-footline{text-align:center;margin-top:28px;font-size:12.5px;color:var(--muted);}
    @media(max-width:960px){.pricing-grid{grid-template-columns:1fr 1fr;}}
    @media(max-width:560px){.pricing-grid{grid-template-columns:1fr;}}

    /* ══════════════════════════════════════════
       FAQ
    ══════════════════════════════════════════ */
    .faq-items{max-width:740px;margin:44px auto 0;}
    .faq-item{border-bottom:1px solid var(--border);}
    .faq-item:first-child{border-top:1px solid var(--border);}
    .faq-q{width:100%;display:flex;align-items:center;justify-content:space-between;padding:20px 4px;background:transparent;border:none;cursor:pointer;text-align:left;font-size:14.5px;font-weight:600;color:var(--ink)!important;font-family:var(--fb);gap:16px;min-height:56px;letter-spacing:-.01em;-webkit-tap-highlight-color:transparent;}
    .faq-icon{color:var(--faint);transition:transform .2s;flex-shrink:0;display:flex;}
    .faq-a{max-height:0;overflow:hidden;transition:max-height .3s ease,padding .25s ease;padding:0 4px;}
    .faq-a.open{max-height:400px;padding:0 4px 20px;}
    .faq-a p{font-size:13.5px;color:var(--ink2);line-height:1.75;max-width:660px;}
    @media(max-width:640px){.faq-q{font-size:13.5px;}}

    /* ══════════════════════════════════════════
       FINAL CTA
    ══════════════════════════════════════════ */
    .final{padding:96px 22px;text-align:center;border-top:1px solid var(--border);background:var(--paper2);}
    .final-inner{max-width:600px;margin:0 auto;}
    .final-h{font-size:clamp(26px,4vw,42px);font-weight:700;color:var(--ink);letter-spacing:-.03em;line-height:1.14;margin-bottom:16px;}
    .final-sub{font-size:clamp(14.5px,1.8vw,16px);color:var(--ink2);line-height:1.65;margin-bottom:30px;}
    .final-ctas{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-bottom:16px;}
    .final-footnote{font-size:12px;color:var(--muted);}
    @media(max-width:500px){
      .final{padding:64px 16px;}
      .final-ctas{flex-direction:column;align-items:stretch;}
      .final-ctas a{width:100%;}
    }

    /* ══════════════════════════════════════════
       FOOTER
    ══════════════════════════════════════════ */
    .footer{background:var(--paper);padding:52px 22px 24px;border-top:1px solid var(--border);}
    .footer-inner{max-width:1180px;margin:0 auto;}
    .footer-top{display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:40px;margin-bottom:32px;padding-bottom:32px;border-bottom:1px solid var(--border);}
    .footer-brand-name{font-size:14.5px;font-weight:700;color:var(--ink);letter-spacing:-.01em;margin-bottom:8px;display:flex;align-items:center;gap:8px;}
    .footer-brand-desc{font-size:12.5px;color:var(--muted);line-height:1.6;max-width:230px;}
    .footer-col-title{font-size:10.5px;font-weight:600;color:var(--faint);text-transform:uppercase;letter-spacing:.08em;margin-bottom:14px;font-family:var(--fm);}
    .footer-link{display:block;font-size:12.5px;color:var(--muted)!important;text-decoration:none;margin-bottom:10px;transition:color .15s;min-height:var(--touch);display:flex;align-items:center;background:none;border:none;padding:0;cursor:pointer;font-family:var(--fb);text-align:left;}
    .footer-link:hover{color:var(--ink)!important;}
    .footer-bottom{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;}
    .footer-copy{font-size:12px;color:var(--faint);}
    .footer-legal-links{display:flex;gap:16px;flex-wrap:wrap;}
    .footer-legal-link{font-size:12px;color:var(--faint)!important;text-decoration:none;transition:color .15s;min-height:36px;display:inline-flex;align-items:center;background:none;border:none;padding:0;cursor:pointer;font-family:var(--fb);}
    .footer-legal-link:hover{color:var(--muted)!important;}
    @media(max-width:960px){
      .footer{padding:40px 16px 20px;}
      .footer-top{grid-template-columns:1fr 1fr;gap:28px;}
    }
    @media(max-width:480px){
      .footer-top{grid-template-columns:1fr 1fr;gap:20px;}
      .footer-brand-desc{display:none;}
    }
    @media(max-width:360px){.footer-top{grid-template-columns:1fr;}}
  `;

  return (
    <div className="lp">
      <style>{css}</style>

      {/* NAV */}
      <nav className={`nav ${scrolled ? "scrolled" : ""}`}>
        <div className="nav-inner">
          <Link to="/" className="nav-brand" onClick={closeMobile}>
            <Logo size={24} />
            <span className="nav-brandname">Fixsense</span>
          </Link>
          <div className="nav-links">
            {NAV_LINKS.map(l => (
              <a key={l.label} href={l.href} className="nav-link">{l.label}</a>
            ))}
          </div>
          <div className="nav-actions">
            {user ? (
              <Link to="/dashboard" className="btn-primary">
                Dashboard
                <Icon name="arrow-right" size={13} />
              </Link>
            ) : (
              <>
                <Link to="/login" className="btn-ghost">Sign in</Link>
                <Link to="/login" className="btn-primary">Start free</Link>
              </>
            )}
            <button
              className={`hamburger ${mobileOpen ? "open" : ""}`}
              onClick={() => setMobileOpen(o => !o)}
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileOpen}
            >
              <span /><span /><span />
            </button>
          </div>
        </div>
      </nav>

      {/* MOBILE MENU */}
      <div className={`mobile-menu ${mobileOpen ? "open" : ""}`} role="navigation" aria-label="Mobile navigation">
        {NAV_LINKS.map(l => (
          <a key={l.label} href={l.href} className="mobile-link" onClick={closeMobile}>{l.label}</a>
        ))}
        <div className="mobile-ctas">
          {user ? (
            <Link to="/dashboard" className="btn-hero" onClick={closeMobile}>Dashboard</Link>
          ) : (
            <>
              <Link to="/login" className="btn-hero-outline" onClick={closeMobile}>Sign in</Link>
              <Link to="/login" className="btn-hero" onClick={closeMobile}>Start free</Link>
            </>
          )}
        </div>
      </div>

      {/* HERO */}
      <section className="hero" id="product">
        <div className="hero-inner">
          <div className="hero-top">
            <h1 className="hero-h">
              Every meeting, captured, transcribed, and turned into a record you can trust.
            </h1>
            <p className="hero-sub">
              Fixsense joins your calls, transcribes every word, and turns the conversation into a clear summary and action list, ready before the meeting is even over. No memory required, no notes to rebuild.
            </p>
            <div className="hero-ctas">
              <Link to={user ? "/dashboard" : "/login"} className="btn-hero">
                Start free
                <Icon name="arrow-right" size={14} />
              </Link>
              <a href="#how-it-works" className="btn-hero-outline">See how it works</a>
            </div>
            <div className="hero-trust">
              {["No credit card required", "No visible bot on your call", "Cancel anytime"].map((t, i) => (
                <div key={i} className="trust-pill">
                  <Icon name="check" size={13} strokeWidth={2.2} />
                  {t}
                </div>
              ))}
            </div>
          </div>

          <div className="hero-audience">
            <div className="hero-audience-label">Built for every kind of meeting</div>
            <div className="hero-audience-list">
              {["Business meetings", "Client calls", "Interviews", "Classes", "Team standups", "One-on-ones"].map((t, i) => (
                <span key={i} className="hero-audience-pill">{t}</span>
              ))}
            </div>
          </div>

          <div className="hero-mock-wrap">
            <ProductMock />
          </div>
        </div>
      </section>

      {/* TRUST STRIP — plain, no fabricated numbers */}
      <div className="strip">
        <div className="strip-inner">
          <span className="strip-label">
            Built for founders, consultants, recruiters, educators, and teams who need a record they can rely on.
          </span>
        </div>
      </div>

      {/* PROBLEM → SOLUTION FLOW */}
      <section className="section" id="problem">
        <div className="section-inner">
          <Reveal>
            <div className="kicker">The problem</div>
            <h2 className="section-h">Good meetings still get lost the moment they end.</h2>
            <p className="section-sub">Most of what is said in a meeting is forgotten within a day. Notes are incomplete, action items live in someone's memory, and nobody has time to write a proper recap.</p>
          </Reveal>
          <Reveal delay={80}>
            <div className="problem-flow">
              {[
                { num: "01", title: "The meeting happens", desc: "A real conversation, full of decisions, context, and detail that matters." },
                { num: "02", title: "Details get lost", desc: "Notes are partial, memory fades, and nobody agrees afterward on exactly what was said." },
                { num: "03", title: "Fixsense captures it", desc: "Every word is recorded and transcribed automatically, with each speaker identified.", fix: true },
                { num: "04", title: "AI builds the record", desc: "The transcript becomes a summary and a list of action items with clear owners.", fix: true },
                { num: "05", title: "Everyone knows what's next", desc: "The team shares one reliable record instead of five different memories of the call.", fix: true },
              ].map((s, i) => (
                <div key={i} className={`problem-step ${s.fix ? "is-fix" : ""}`}>
                  <div className="problem-step-num">{s.num}</div>
                  <div className="problem-step-title">{s.title}</div>
                  <div className="problem-step-desc">{s.desc}</div>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* USE CASES */}
      <section className="section" id="use-cases" style={{ background: "var(--paper2)" }}>
        <div className="section-inner">
          <Reveal>
            <div className="kicker">Where Fixsense fits</div>
            <h2 className="section-h">One AI meeting assistant. Every kind of conversation.</h2>
            <p className="section-sub">Fixsense was built for the meetings that make up a normal week, not just sales calls.</p>
          </Reveal>
          <Reveal delay={80}>
            <div className="usecase-grid">
              {USE_CASES.map((c, i) => (
                <div key={i} className="usecase-card">
                  <div className="usecase-icon"><Icon name={c.icon} size={17} /></div>
                  <div className="usecase-title">{c.title}</div>
                  <div className="usecase-desc">{c.desc}</div>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* HOW IT WORKS — interactive, auto-playing product walkthrough */}
      <HowItWorksInteractive />

      {/* PRODUCT SHOWCASE — deep dive on the three core outputs */}
      <section className="section" style={{ background: "var(--paper2)" }}>
        <div className="section-inner">
          <Reveal>
            <div style={{ textAlign: "center", marginBottom: 8 }}>
              <div className="kicker" style={{ justifyContent: "center" }}>Inside the product</div>
              <h2 className="section-h" style={{ textAlign: "center", maxWidth: 640, margin: "0 auto" }}>What you get after every meeting.</h2>
            </div>
          </Reveal>

          <div className="showcase-wrap">
            {/* Row 1: transcript */}
            <div className="showcase-row">
              <Reveal>
                <div className="showcase-copy">
                  <div className="showcase-tag">Transcription</div>
                  <h3 className="showcase-title">A transcript that knows who said what.</h3>
                  <p className="showcase-desc">Fixsense separates each voice automatically, so your transcript reads like a real conversation instead of a wall of unattributed text.</p>
                  <div className="showcase-list">
                    {["Speaker labels applied automatically, no manual tagging", "Accurate timestamps down to the second", "Searchable across every past meeting"].map((t, i) => (
                      <div key={i} className="showcase-list-item">
                        <span className="showcase-check"><Icon name="check" size={9} strokeWidth={2.4} /></span>
                        {t}
                      </div>
                    ))}
                  </div>
                </div>
              </Reveal>
              <Reveal delay={80}>
                <div className="showcase-visual">
                  <div className="showcase-frame">
                    <div className="showcase-frame-bar">
                      <div className="showcase-frame-dot" />
                      <div className="showcase-frame-dot" />
                      <div className="showcase-frame-dot" />
                      <span className="showcase-frame-label">transcript · fixsense.app</span>
                    </div>
                    <div className="showcase-frame-body">
                      {[
                        { name: "Maria Chen", time: "00:12:04", text: "So the main blocker right now is getting sign-off from legal on the new terms." },
                        { name: "Daniel Osei", time: "00:12:19", text: "I can follow up with them this afternoon and get a timeline." },
                        { name: "Priya Nair", time: "00:12:31", text: "Great, let's revisit this in Thursday's sync once you hear back." },
                      ].map((l, i) => (
                        <div key={i} className="sc-transcript-line">
                          <div className="sc-avatar">{l.name.split(" ").map(n => n[0]).join("")}</div>
                          <div className="sc-t-body">
                            <div className="sc-t-meta">
                              <span className="sc-t-name">{l.name}</span>
                              <span className="sc-t-time">{l.time}</span>
                            </div>
                            <div className="sc-t-text">{l.text}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </Reveal>
            </div>

            {/* Row 2: AI summary + action items */}
            <div className="showcase-row reverse">
              <Reveal>
                <div className="showcase-copy">
                  <div className="showcase-tag">AI summary and action items</div>
                  <h3 className="showcase-title">A summary you would actually want to read.</h3>
                  <p className="showcase-desc">No generic bullet points. Fixsense writes a clear recap of what was discussed and pulls out concrete action items with an owner attached whenever one is mentioned.</p>
                  <div className="showcase-list">
                    {["Plain-language summary of the whole meeting", "Action items extracted with owners and deadlines", "One click to copy, export, or share with your team"].map((t, i) => (
                      <div key={i} className="showcase-list-item">
                        <span className="showcase-check"><Icon name="check" size={9} strokeWidth={2.4} /></span>
                        {t}
                      </div>
                    ))}
                  </div>
                </div>
              </Reveal>
              <Reveal delay={80}>
                <div className="showcase-visual">
                  <div className="showcase-frame">
                    <div className="showcase-frame-bar">
                      <div className="showcase-frame-dot" />
                      <div className="showcase-frame-dot" />
                      <div className="showcase-frame-dot" />
                      <span className="showcase-frame-label">summary · fixsense.app</span>
                    </div>
                    <div className="showcase-frame-body">
                      <div className="sc-summary-section">
                        <div className="sc-summary-label">Summary</div>
                        <div className="sc-summary-text">The team reviewed the legal sign-off blocker on the new contract terms and agreed on next steps. Daniel will follow up with legal today. The topic will be revisited in Thursday's sync.</div>
                      </div>
                      <div className="sc-summary-section">
                        <div className="sc-summary-label">Action items</div>
                        {[
                          ["Follow up with legal for a sign-off timeline", "Daniel Osei · Due today"],
                          ["Revisit contract status in Thursday's sync", "Priya Nair · Due Thursday"],
                          ["Share updated terms with the client once approved", "Maria Chen · No date set"],
                        ].map(([text, owner], i) => (
                          <div key={i} className="sc-action-row">
                            <span className="sc-action-box" />
                            <div>
                              <div className="sc-action-text">{text}</div>
                              <div className="sc-action-meta">{owner}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </Reveal>
            </div>

            {/* Row 3: meeting insights */}
            <div className="showcase-row">
              <Reveal>
                <div className="showcase-copy">
                  <div className="showcase-tag">Meeting insights</div>
                  <h3 className="showcase-title">See how the conversation actually went.</h3>
                  <p className="showcase-desc">Talk-time balance and key moments are calculated automatically, giving you a clear picture of the meeting without rewatching the recording.</p>
                  <div className="showcase-list">
                    {["Talk-time ratio across every speaker", "Key moments flagged with timestamps", "Follow-through tracking on past action items"].map((t, i) => (
                      <div key={i} className="showcase-list-item">
                        <span className="showcase-check"><Icon name="check" size={9} strokeWidth={2.4} /></span>
                        {t}
                      </div>
                    ))}
                  </div>
                </div>
              </Reveal>
              <Reveal delay={80}>
                <div className="showcase-visual">
                  <div className="showcase-frame">
                    <div className="showcase-frame-bar">
                      <div className="showcase-frame-dot" />
                      <div className="showcase-frame-dot" />
                      <div className="showcase-frame-dot" />
                      <span className="showcase-frame-label">insights · fixsense.app</span>
                    </div>
                    <div className="showcase-frame-body">
                      <div className="sc-summary-label">Talk-time balance</div>
                      {[
                        ["Maria Chen", 42], ["Daniel Osei", 35], ["Priya Nair", 23],
                      ].map(([name, pct], i) => (
                        <div key={i} className="sc-bar-row">
                          <span className="sc-bar-name">{name}</span>
                          <div className="sc-bar-track"><div className="sc-bar-fill" style={{ width: `${pct}%` }} /></div>
                          <span className="sc-bar-pct">{pct}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </Reveal>
            </div>
          </div>
        </div>
      </section>

      {/* SECURITY */}
      <section className="section" id="security">
        <div className="section-inner">
          <Reveal>
            <div style={{ textAlign: "center", marginBottom: 8 }}>
              <div className="kicker" style={{ justifyContent: "center" }}>Built to be trusted</div>
              <h2 className="section-h" style={{ textAlign: "center", maxWidth: 600, margin: "0 auto" }}>Your meetings and data, protected by default.</h2>
              <p className="section-sub" style={{ textAlign: "center", maxWidth: 480, margin: "10px auto 0" }}>Every recording carries confidential conversations. We built Fixsense around that responsibility from day one.</p>
            </div>
          </Reveal>
          <Reveal delay={80}>
            <div className="security-grid">
              {SECURITY_ITEMS.map((c, i) => (
                <div key={i} className="security-card">
                  <div className="security-icon"><Icon name={c.icon} size={16} /></div>
                  <div className="security-title">{c.title}</div>
                  <div className="security-desc">{c.desc}</div>
                </div>
              ))}
            </div>
          </Reveal>
          <div className="security-footline" style={{ textAlign: "center" }}>
            <Link to="/security" className="security-footlink">
              Read our full security overview
              <Icon name="arrow-right" size={12} />
            </Link>
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section className="section" id="pricing" style={{ background: "var(--paper2)" }}>
        <div className="section-inner">
          <Reveal>
            <div style={{ textAlign: "center", marginBottom: 8 }}>
              <div className="kicker" style={{ justifyContent: "center" }}>Pricing</div>
              <h2 className="section-h" style={{ textAlign: "center", maxWidth: 560, margin: "0 auto" }}>Simple, minute-based pricing.</h2>
              <p className="section-sub" style={{ textAlign: "center", maxWidth: 480, margin: "10px auto 0" }}>No per-seat tricks. Start free and upgrade only when you need more minutes.</p>
            </div>
          </Reveal>
          <Reveal delay={80}>
            <div className="pricing-grid">
              {plans.map((p) => (
                <div key={p.key} className={`plan-card ${p.highlight ? "featured" : ""}`}>
                  {p.badge && <span className="plan-badge">{p.badge}</span>}
                  <div className="plan-name">{p.name}</div>
                  <div className="plan-price-row">
                    <span className="plan-price">${p.price_usd}</span>
                    <span className="plan-period">/month</span>
                  </div>
                  <div className="plan-quota">
                    {p.minute_quota === -1 ? "Unlimited minutes" : `${p.minute_quota.toLocaleString()} minutes / month`}
                  </div>
                  <div className="plan-divider" />
                  <ul className="plan-feats">
                    {p.features.map((f, j) => (
                      <li key={j} className="plan-feat">
                        <Icon name="check" size={13} strokeWidth={2.2} />
                        {f.trim()}
                      </li>
                    ))}
                  </ul>
                  <Link to={user ? "/dashboard" : "/login"} className={`plan-cta ${p.highlight ? "primary" : ""}`}>
                    {p.price_usd === 0 ? "Start free" : "Choose plan"}
                  </Link>
                </div>
              ))}
            </div>
          </Reveal>
          <div className="pricing-footline">
            All plans include unlimited transcript storage and no lock-in contract.{" "}
            <Link to="/pricing" className="security-footlink" style={{ display: "inline-flex" }}>
              See full plan comparison
              <Icon name="arrow-right" size={12} />
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="section">
        <div className="section-inner">
          <Reveal>
            <div style={{ textAlign: "center", marginBottom: 10 }}>
              <div className="kicker" style={{ justifyContent: "center" }}>Questions</div>
              <h2 className="section-h" style={{ textAlign: "center" }}>The ones we get every day.</h2>
            </div>
          </Reveal>
          <div className="faq-items">
            {FAQS.map((f, i) => (
              <div key={i} className="faq-item">
                <button className="faq-q" onClick={() => setActiveFaq(activeFaq === i ? null : i)} aria-expanded={activeFaq === i}>
                  {f.q}
                  <span className="faq-icon"><Icon name={activeFaq === i ? "minus" : "plus"} size={15} /></span>
                </button>
                <div className={`faq-a ${activeFaq === i ? "open" : ""}`} aria-hidden={activeFaq !== i}>
                  <p>{f.a}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="final">
        <div className="final-inner">
          <Reveal>
            <h2 className="final-h">Stop taking notes. Start having the meeting.</h2>
            <p className="final-sub">Try Fixsense free on your next meeting. No credit card required, no bot for anyone to notice, and your first summary ready in minutes.</p>
            <div className="final-ctas">
              <Link to={user ? "/dashboard" : "/login"} className="btn-hero">
                Start free
                <Icon name="arrow-right" size={14} />
              </Link>
              <a href="#how-it-works" className="btn-hero-outline">See how it works</a>
            </div>
            <p className="final-footnote">Free plan · No credit card required · No bot joins your call</p>
          </Reveal>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="footer">
        <div className="footer-inner">
          <div className="footer-top">
            <div>
              <div className="footer-brand-name"><Logo size={20} />Fixsense</div>
              <p className="footer-brand-desc">The AI meeting assistant that remembers everything, so you don't have to.</p>
            </div>
            <div>
              <div className="footer-col-title">Product</div>
              {[["#product", "Product"], ["#how-it-works", "How it works"], ["/pricing", "Pricing"], ["/changelog", "Changelog"]].map(([h, l]) => (
                h.startsWith("#")
                  ? <a key={h} href={h} className="footer-link">{l}</a>
                  : <Link key={h} to={h} className="footer-link">{l}</Link>
              ))}
            </div>
            <div>
              <div className="footer-col-title">Legal</div>
              {[["/privacy", "Privacy"], ["/terms", "Terms"], ["/security", "Security"], ["/contact", "Contact"]].map(([h, l]) => (
                <Link key={h} to={h} className="footer-link">{l}</Link>
              ))}
              <button className="footer-link" onClick={() => openCookiePreferences()}>
                Cookie preferences
              </button>
            </div>
          </div>
          <div className="footer-bottom">
            <span className="footer-copy">© {new Date().getFullYear()} Fixsense, Inc. All rights reserved.</span>
            <div className="footer-legal-links">
              <Link to="/privacy" className="footer-legal-link">Privacy</Link>
              <Link to="/terms" className="footer-legal-link">Terms</Link>
              <Link to="/security" className="footer-legal-link">Security</Link>
              <button className="footer-legal-link" onClick={() => openCookiePreferences()}>Cookie preferences</button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}