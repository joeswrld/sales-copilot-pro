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
// Icon set: precise, uniform stroke, no decorative flourishes
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
    case "target": return <svg {...p}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></svg>;
    case "inbox": return <svg {...p}><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /></svg>;
    case "database": return <svg {...p}><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5" /><path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3" /></svg>;
    case "bar-chart": return <svg {...p}><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>;
    case "compass": return <svg {...p}><circle cx="12" cy="12" r="10" /><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" /></svg>;
    case "sparkle": return <svg {...p}><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" /></svg>;
    case "route": return <svg {...p}><circle cx="6" cy="19" r="2.5" /><circle cx="18" cy="5" r="2.5" /><path d="M8.5 19H15a4 4 0 0 0 4-4v-1a4 4 0 0 0-4-4H9a4 4 0 0 1-4-4v-1" /></svg>;
    default: return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// The complete workflow, a genuine sequence, so a numbered rail is earned.
// ─────────────────────────────────────────────────────────────────────────
type FlowStage = { key: string; label: string; icon: string };
const FLOW: FlowStage[] = [
  { key: "job", label: "Job", icon: "briefcase" },
  { key: "applications", label: "Applications", icon: "inbox" },
  { key: "candidates", label: "Candidates", icon: "database" },
  { key: "match", label: "AI Match", icon: "sparkle" },
  { key: "shortlist", label: "Shortlist", icon: "check-square" },
  { key: "submit", label: "Submit", icon: "link" },
  { key: "interview", label: "Interview", icon: "mic" },
  { key: "intel", label: "AI Interview Intelligence", icon: "file-text" },
  { key: "feedback", label: "Client Feedback", icon: "message" },
  { key: "placement", label: "Placement", icon: "target" },
];

// ─────────────────────────────────────────────────────────────────────────
// Recruiter pain → Fixsense fix, using real shipped features only
// ─────────────────────────────────────────────────────────────────────────
const PAIN_POINTS = [
  {
    icon: "inbox",
    pain: "Too many applications to get through",
    fix: "Every application lands against the job automatically through your application link, so nothing sits unread in an inbox.",
  },
  {
    icon: "database",
    pain: "CVs and candidate details scattered everywhere",
    fix: "CV parsing reads every upload straight into a structured candidate record in one database: skills, roles, history, all searchable.",
  },
  {
    icon: "mic",
    pain: "Time wasted screening and taking notes",
    fix: "Fixsense Meetings transcribes the call live, so you can run the conversation instead of typing through it.",
  },
  {
    icon: "message",
    pain: "Losing track of client feedback",
    fix: "Client feedback is logged against the candidate and the job in the Client CRM, not buried in an email thread.",
  },
  {
    icon: "route",
    pain: "Candidates getting stuck between stages",
    fix: "The candidate pipeline shows exactly which stage every candidate is sitting at, for every open job, at once.",
  },
  {
    icon: "clock",
    pain: "Follow-ups being forgotten",
    fix: "Candidate timelines log every action automatically, so a stalled candidate is visible, not forgotten.",
  },
  {
    icon: "target",
    pain: "Hard to know who is actually the best fit",
    fix: "AI job matching scores every candidate against the job and explains the reasoning, so shortlisting starts from evidence.",
  },
];

// ─────────────────────────────────────────────────────────────────────────
// Recruiting-specific differentiators: real, shipped functionality only
// ─────────────────────────────────────────────────────────────────────────
const DIFFERENTIATORS = [
  { icon: "database", title: "Candidate database & CV parsing", desc: "Upload a CV and Fixsense extracts skills, roles, and history into a structured, searchable record." },
  { icon: "sparkle", title: "AI job matching", desc: "Every candidate gets a match score against a job, with the reasoning behind it, not just a ranked list." },
  { icon: "link", title: "Application links", desc: "A public link per job collects applications directly into your pipeline, no manual re-entry." },
  { icon: "route", title: "Candidate pipeline", desc: "See every candidate's stage across every open job, from application to placement, in one view." },
  { icon: "briefcase", title: "Client CRM", desc: "Clients, contacts, jobs, candidates, interviews, and placements roll up into one company record." },
  { icon: "check-square", title: "Candidate & client submissions", desc: "Submit a shortlist to a client and track it as a first-class step in the pipeline, not a side email." },
  { icon: "mic", title: "Fixsense Meetings", desc: "Live transcription for interviews and client calls, built into the workflow, not bolted on." },
  { icon: "file-text", title: "Interview transcription & AI feedback", desc: "Every interview becomes a transcript and structured feedback the panel can actually use." },
  { icon: "clock", title: "Candidate timelines", desc: "A full, automatic activity history for every candidate: every stage change, note, and interaction." },
  { icon: "user-plus", title: "Interview invitations", desc: "Send and track interview invitations without leaving the candidate record." },
  { icon: "target", title: "Placement tracking", desc: "Follow a candidate from submission through offer to a confirmed placement." },
  { icon: "bar-chart", title: "Recruitment analytics", desc: "Time-to-shortlist, interview-to-offer ratio, placements per recruiter, and pipeline value, in one dashboard." },
  { icon: "shield", title: "Compliance & data controls", desc: "Candidate data stays access-controlled by team, with export and deletion in your control." },
];

const SECURITY_ITEMS = [
  { icon: "lock", title: "Encrypted in transit and at rest", desc: "Candidate records, CVs, and interview transcripts are encrypted end to end." },
  { icon: "shield", title: "Built for GDPR", desc: "Data minimisation, explicit consent, and the right to be forgotten are part of the design, for candidate data as much as client data." },
  { icon: "users", title: "Team-scoped access", desc: "Candidate and client records are scoped to your agency's team, not shared across accounts." },
  { icon: "download", title: "You control your data", desc: "Export or permanently delete any candidate record, CV, or transcript from your account at any time." },
];

const FAQS = [
  { q: "Is Fixsense a full ATS, or just an add-on?", a: "Fixsense is the operating system for your recruitment desk: jobs, candidates, AI matching, applications, submissions, interviews, meeting intelligence, client feedback, and placements all live in one system, not stitched together from a spreadsheet, an inbox, and a separate call-recording tool." },
  { q: "Do I need to invite a bot to interviews?", a: "No. Fixsense Meetings works natively inside your call instead of sending a visible bot to join. Nothing extra for the candidate or client to notice before you start." },
  { q: "How does AI matching work?", a: "Every candidate is scored against a job's requirements, with an explanation of what drove the score, not a black-box number. You decide who gets shortlisted." },
  { q: "What happens to candidate CVs and data?", a: "CVs and candidate records are encrypted, stored under your agency's account, and scoped to your team. You can export or delete any candidate's data at any time." },
  { q: "Do I need a credit card to try it?", a: "No. The free plan starts with just an email address. You're only asked for billing details if you choose to upgrade to a paid plan." },
  { q: "Can I cancel anytime?", a: "Yes. There's no contract and no lock-in. Cancel from your account settings at any time and keep access until the end of your current billing period." },
  { q: "How quickly can I get started?", a: "Most agencies have their first job posted and application link live within minutes of signing up. There's no hardware to install and no IT approval required." },
];

const NAV_LINKS = [
  { label: "Product", href: "#product" },
  { label: "Workflow", href: "#workflow" },
  { label: "For agencies", href: "#agency" },
  { label: "Pricing", href: "#pricing" },
  { label: "Security", href: "#security" },
];

// ─────────────────────────────────────────────────────────────────────────
// Hero product mock: a real recruiting screen, pipeline + match score
// ─────────────────────────────────────────────────────────────────────────
const PIPELINE_CANDIDATES = [
  { name: "Sarah Whitfield", role: "Senior .NET Developer", stage: "Interview", match: 94 },
  { name: "Tom Adeyemi", role: "Senior .NET Developer", stage: "Shortlist", match: 88 },
  { name: "Aisha Malik", role: "Senior .NET Developer", stage: "Submitted", match: 91 },
  { name: "James Carrick", role: "Senior .NET Developer", stage: "Applied", match: 76 },
];

function ProductMock() {
  return (
    <div className="mock">
      <div className="mock-titlebar">
        <div className="mock-dots">
          <span /><span /><span />
        </div>
        <div className="mock-titlebar-name">Pipeline · Senior .NET Developer, London</div>
      </div>

      <div className="mock-body">
        <div className="mock-transcript-pane">
          <div className="mock-pane-head">
            <Icon name="route" size={13} />
            Pipeline · 4 candidates
          </div>
          <div className="mock-transcript-list">
            {PIPELINE_CANDIDATES.map((c, i) => (
              <div className="mock-t-row" key={i}>
                <div className="mock-t-meta">
                  <span className="mock-t-speaker">{c.name}</span>
                  <span className="mock-t-time">{c.stage}</span>
                </div>
                <div className="mock-t-text">{c.role}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="mock-summary-pane">
          <div className="mock-pane-head">
            <Icon name="sparkle" size={13} />
            Match score: Sarah Whitfield
          </div>
          <p className="mock-summary-text">
            94% match. Eight years .NET/Azure, matches all three required skills and the London hybrid requirement. Notice period aligns with the client's start date.
          </p>

          <div className="mock-pane-head" style={{ marginTop: 18 }}>
            <Icon name="check-square" size={13} />
            Next steps
          </div>
          <div className="mock-action-list">
            {[
              { text: "Submit to client with AI-generated profile summary", owner: "Ready to send", due: "" },
              { text: "Interview booked, invitation sent", owner: "Thu, 2:00pm", due: "" },
              { text: "Client feedback logged after last submission", owner: "2 days ago", due: "" },
            ].map((a, i) => (
              <div className="mock-action-row" key={i}>
                <span className="mock-action-box" />
                <div>
                  <div className="mock-action-text">{a.text}</div>
                  <div className="mock-action-meta">{a.owner}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="mock-insight-row">
            <div className="mock-insight">
              <div className="mock-insight-val">94%</div>
              <div className="mock-insight-label">Match score</div>
            </div>
            <div className="mock-insight">
              <div className="mock-insight-val">4</div>
              <div className="mock-insight-label">In pipeline</div>
            </div>
            <div className="mock-insight">
              <div className="mock-insight-val">1</div>
              <div className="mock-insight-label">Interview booked</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Workflow rail: Job → Applications → Candidates → AI Match → Shortlist →
// Submit → Interview → AI Interview Intelligence → Client Feedback → Placement
//
// Fully automated: plays itself on a loop through all ten stages, each with
// its own small animated screen built from the platform's actual pipeline,
// matching, transcription, feedback, and analytics views. Visitors can still
// click a stage to jump to it, which pauses autoplay.
// ─────────────────────────────────────────────────────────────────────────
const FLOW_DETAIL: Record<string, { title: string; desc: string }> = {
  job: { title: "Post the job once.", desc: "Create the job in Fixsense with the client, requirements, and location. It becomes the anchor everything downstream connects to." },
  applications: { title: "Applications land in one place.", desc: "Share the job's application link. Every application arrives directly into the pipeline instead of an inbox." },
  candidates: { title: "CVs become structured records.", desc: "CV parsing reads every application into your candidate database: skills, history, and contact details, searchable across your whole desk." },
  match: { title: "AI scores every candidate.", desc: "Each candidate is matched against the job's requirements with a score and a plain-language explanation of why." },
  shortlist: { title: "Build the shortlist from evidence.", desc: "Move the strongest matches into shortlist with one action, backed by the match reasoning, not a gut feeling alone." },
  submit: { title: "Submit to the client.", desc: "Send a submission to the client as a tracked step in the pipeline, not a one-off email that goes quiet." },
  interview: { title: "Schedule and send the invitation.", desc: "Send the interview invitation and get it on the calendar without leaving the candidate record." },
  intel: { title: "The interview transcribes itself.", desc: "Fixsense Meetings captures the interview live and turns it into a transcript with feedback for the panel." },
  feedback: { title: "Client feedback lands on the record.", desc: "Feedback from the client goes straight onto the candidate and job in the Client CRM, never lost in a thread." },
  placement: { title: "Track it through to placement.", desc: "Follow the candidate from offer to confirmed placement, and see it reflected in your recruitment analytics." },
};

const FLOW_AUTOPLAY_MS = 3400;

function FlowScreenJob() {
  return (
    <div className="fs-panel fs-in">
      <div className="fs-head"><Icon name="briefcase" size={13} />New job</div>
      <div className="fs-field"><span className="fs-field-label">Title</span><span className="fs-field-val">Senior .NET Developer</span></div>
      <div className="fs-field"><span className="fs-field-label">Client</span><span className="fs-field-val">Harrow &amp; Bell Technology</span></div>
      <div className="fs-field"><span className="fs-field-label">Location</span><span className="fs-field-val">London, hybrid</span></div>
      <div className="fs-field"><span className="fs-field-label">Status</span><span className="fs-chip">Open</span></div>
    </div>
  );
}

function FlowScreenApplications() {
  const rows = ["Sarah Whitfield", "Tom Adeyemi", "Aisha Malik", "James Carrick"];
  return (
    <div className="fs-panel fs-in">
      <div className="fs-head"><Icon name="inbox" size={13} />Applications · via job link</div>
      {rows.map((r, i) => (
        <div className="fs-row fs-row-in" style={{ animationDelay: `${i * 130}ms` }} key={r}>
          <span className="fs-dot" />
          <span className="fs-row-text">{r}</span>
          <span className="fs-row-meta">Applied</span>
        </div>
      ))}
    </div>
  );
}

function FlowScreenCandidates() {
  return (
    <div className="fs-panel fs-in">
      <div className="fs-head"><Icon name="database" size={13} />Candidate record</div>
      <div className="fs-cv-parse">
        <span className="fs-cv-icon"><Icon name="file-text" size={14} /></span>
        <span className="fs-cv-name">SarahWhitfield_CV.pdf</span>
        <span className="fs-chip fs-chip-good">Parsed</span>
      </div>
      {["8 yrs .NET / Azure", "London, hybrid preferred", "Notice period: 4 weeks"].map((t, i) => (
        <div className="fs-row fs-row-in" style={{ animationDelay: `${i * 140}ms` }} key={t}>
          <span className="fs-check"><Icon name="check" size={9} strokeWidth={2.6} /></span>
          <span className="fs-row-text">{t}</span>
        </div>
      ))}
    </div>
  );
}

function FlowScreenMatch() {
  return (
    <div className="fs-panel fs-in">
      <div className="fs-head"><Icon name="target" size={13} />Match score</div>
      <div className="fs-match-ring-row">
        <div className="fs-match-ring"><span>94%</span></div>
        <div className="fs-match-copy">Sarah Whitfield<br /><span className="fs-muted">vs. Senior .NET Developer</span></div>
      </div>
      {["All 3 required skills matched", "Location requirement met", "Notice period aligns with start date"].map((t, i) => (
        <div className="fs-row fs-row-in" style={{ animationDelay: `${i * 140}ms` }} key={t}>
          <span className="fs-check"><Icon name="check" size={9} strokeWidth={2.6} /></span>
          <span className="fs-row-text">{t}</span>
        </div>
      ))}
    </div>
  );
}

function FlowScreenShortlist() {
  const rows = [
    { name: "Sarah Whitfield", match: 94, on: true },
    { name: "Aisha Malik", match: 91, on: true },
    { name: "Tom Adeyemi", match: 88, on: false },
    { name: "James Carrick", match: 76, on: false },
  ];
  return (
    <div className="fs-panel fs-in">
      <div className="fs-head"><Icon name="check-square" size={13} />Shortlist · 2 selected</div>
      {rows.map((r, i) => (
        <div className="fs-row fs-row-in" style={{ animationDelay: `${i * 120}ms` }} key={r.name}>
          <span className={`fs-box${r.on ? " on" : ""}`}>{r.on && <Icon name="check" size={9} strokeWidth={2.8} />}</span>
          <span className="fs-row-text">{r.name}</span>
          <span className="fs-row-meta">{r.match}%</span>
        </div>
      ))}
    </div>
  );
}

function FlowScreenSubmit() {
  return (
    <div className="fs-panel fs-in">
      <div className="fs-head"><Icon name="link" size={13} />Submission · Harrow &amp; Bell Technology</div>
      {["Sarah Whitfield", "Aisha Malik"].map((n, i) => (
        <div className="fs-row fs-row-in" style={{ animationDelay: `${i * 150}ms` }} key={n}>
          <span className="fs-dot fs-dot-accent" />
          <span className="fs-row-text">{n}</span>
          <span className="fs-chip">Sent</span>
        </div>
      ))}
      <div className="fs-note fs-in" style={{ animationDelay: "420ms" }}>Client notified · tracked in Client CRM</div>
    </div>
  );
}

function FlowScreenInterview() {
  return (
    <div className="fs-panel fs-in">
      <div className="fs-head"><Icon name="user-plus" size={13} />Interview invitation</div>
      <div className="fs-field"><span className="fs-field-label">Candidate</span><span className="fs-field-val">Sarah Whitfield</span></div>
      <div className="fs-field"><span className="fs-field-label">Client</span><span className="fs-field-val">Harrow &amp; Bell Technology</span></div>
      <div className="fs-field"><span className="fs-field-label">When</span><span className="fs-field-val">Thu, 2:00pm</span></div>
      <div className="fs-note fs-in" style={{ animationDelay: "280ms" }}>Invitation sent · on the calendar</div>
    </div>
  );
}

function FlowScreenIntel() {
  const lines = [
    { n: "Client", t: "Tell me about your Azure migration work." },
    { n: "Sarah", t: "I led the migration for a 40-service platform over six months." },
  ];
  return (
    <div className="fs-panel fs-in">
      <div className="fs-head"><Icon name="mic" size={13} />Fixsense Meetings · live transcript</div>
      {lines.map((l, i) => (
        <div className="fs-row fs-row-in" style={{ animationDelay: `${i * 220}ms` }} key={l.n}>
          <span className="fs-avatar">{l.n[0]}</span>
          <span className="fs-row-text">{l.t}</span>
        </div>
      ))}
      <div className="fs-note fs-in" style={{ animationDelay: "480ms" }}>Transcript and feedback saved to candidate record</div>
    </div>
  );
}

function FlowScreenFeedback() {
  return (
    <div className="fs-panel fs-in">
      <div className="fs-head"><Icon name="message" size={13} />Client feedback · Harrow &amp; Bell Technology</div>
      <p className="fs-quote fs-in" style={{ animationDelay: "120ms" }}>
        Strong technical depth, good fit for the team. Moving to a second interview with the engineering lead.
      </p>
      <div className="fs-row fs-row-in" style={{ animationDelay: "360ms" }}>
        <span className="fs-dot fs-dot-good" />
        <span className="fs-row-text">Logged on candidate and job record</span>
      </div>
    </div>
  );
}

function FlowScreenPlacement() {
  return (
    <div className="fs-panel fs-in">
      <div className="fs-head"><Icon name="target" size={13} />Placement confirmed</div>
      <div className="fs-place-row">
        <span className="fs-chip fs-chip-good">Placed</span>
        <span className="fs-row-text">Sarah Whitfield → Senior .NET Developer</span>
      </div>
      <div className="fs-stat-row">
        {[["18d", "Time to fill"], ["4", "In pipeline"], ["2", "Interviews"]].map(([v, l], i) => (
          <div className="fs-stat fs-in" style={{ animationDelay: `${i * 130}ms` }} key={l}>
            <div className="fs-stat-val">{v}</div>
            <div className="fs-stat-label">{l}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

const FLOW_SCREENS: Record<string, React.ComponentType> = {
  job: FlowScreenJob,
  applications: FlowScreenApplications,
  candidates: FlowScreenCandidates,
  match: FlowScreenMatch,
  shortlist: FlowScreenShortlist,
  submit: FlowScreenSubmit,
  interview: FlowScreenInterview,
  intel: FlowScreenIntel,
  feedback: FlowScreenFeedback,
  placement: FlowScreenPlacement,
};

function WorkflowRail() {
  const [active, setActive] = useState(0);
  const [autoplay, setAutoplay] = useState(true);
  const [progress, setProgress] = useState(0);
  const rafRef = useRef<number>();
  const startRef = useRef(0);

  const goTo = useCallback((i: number) => {
    setActive(i);
    setProgress(0);
  }, []);

  const stopAutoplay = useCallback(() => {
    setAutoplay(false);
    setProgress(0);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);

  useEffect(() => {
    if (!autoplay) return;
    startRef.current = performance.now();
    function frame(now: number) {
      const elapsed = now - startRef.current;
      const pct = Math.min(100, (elapsed / FLOW_AUTOPLAY_MS) * 100);
      setProgress(pct);
      if (elapsed >= FLOW_AUTOPLAY_MS) {
        setActive((c) => (c === FLOW.length - 1 ? 0 : c + 1));
        startRef.current = now;
        setProgress(0);
      }
      rafRef.current = requestAnimationFrame(frame);
    }
    rafRef.current = requestAnimationFrame(frame);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [autoplay]);

  const stage = FLOW[active];
  const d = FLOW_DETAIL[stage.key];
  const Screen = FLOW_SCREENS[stage.key];

  return (
    <section className="section" id="workflow">
      <div className="section-inner">
        <Reveal>
          <div style={{ textAlign: "center", marginBottom: 8 }}>
            <div className="kicker" style={{ justifyContent: "center" }}>The complete workflow</div>
            <h2 className="section-h" style={{ textAlign: "center", maxWidth: 680, margin: "0 auto" }}>
              From job to placement, in one system.
            </h2>
            <p className="section-sub" style={{ textAlign: "center", margin: "10px auto 0" }}>
              Ten stages. One record per candidate. No handoffs to a spreadsheet or a separate inbox in between.
            </p>
          </div>
        </Reveal>

        <Reveal delay={80}>
          <div className="flow-rail">
            {FLOW.map((s, i) => (
              <div key={s.key} style={{ display: "contents" }}>
                <button
                  className={`flow-node${active === i ? " active" : ""}${active > i ? " done" : ""}`}
                  onClick={() => { stopAutoplay(); goTo(i); }}
                  aria-pressed={active === i}
                >
                  <span className="flow-node-icon"><Icon name={s.icon} size={16} strokeWidth={1.7} /></span>
                  <span className="flow-node-label">{s.label}</span>
                </button>
                {i < FLOW.length - 1 && <div className="flow-arrow" />}
              </div>
            ))}
          </div>
        </Reveal>

        <div className="flow-progress-track"><div className="flow-progress-fill" style={{ width: `${progress}%` }} /></div>

        <div className="flow-panel">
          <Reveal delay={80}>
            <div className="flow-detail">
              <div className="flow-detail-num">Stage {active + 1} of {FLOW.length}</div>
              <h3 className="flow-detail-title">{d.title}</h3>
              <p className="flow-detail-desc">{d.desc}</p>
            </div>
          </Reveal>
          <Reveal delay={120}>
            <div className="flow-frame">
              <div className="flow-frame-bar">
                <div className="flow-frame-dots"><span /><span /><span /></div>
                <span className="flow-frame-label">fixsense.app · {stage.label.toLowerCase()}</span>
              </div>
              <div className="flow-frame-body" key={stage.key}>
                <Screen />
              </div>
            </div>
          </Reveal>
        </div>

        <div className="flow-autoplay-row">
          <button className="autoplay-btn" onClick={() => (autoplay ? stopAutoplay() : setAutoplay(true))}>
            {autoplay ? (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
            ) : (
              <Icon name="play" size={12} />
            )}
            {autoplay ? "Pause" : "Play"}
          </button>
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
    .hero-h{font-size:clamp(32px,4.8vw,56px);font-weight:700;line-height:1.08;letter-spacing:-.03em;color:var(--ink);margin-top:8px;margin-bottom:20px;}
    .hero-sub{font-size:clamp(15.5px,1.6vw,18px);color:var(--ink2);line-height:1.65;max-width:620px;margin-bottom:32px;}
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
    .mock-rec{display:flex;align-items:center;gap:6px;font-size:11.5px;font-weight:600;color:#8FA6D6;font-family:var(--fm);flex-shrink:0;}

    .mock-body{display:grid;grid-template-columns:1.15fr 1fr;}
    .mock-transcript-pane{padding:18px 20px;border-right:1px solid rgba(255,255,255,.07);}
    .mock-summary-pane{padding:18px 20px;background:rgba(255,255,255,.015);}
    .mock-pane-head{display:flex;align-items:center;gap:7px;font-size:11px;font-weight:600;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:.07em;margin-bottom:14px;font-family:var(--fm);}
    .mock-pane-head svg{color:rgba(255,255,255,.4);}

    .mock-transcript-list{display:flex;flex-direction:column;gap:14px;}
    .mock-t-row{display:flex;flex-direction:column;gap:3px;}
    .mock-t-meta{display:flex;align-items:baseline;justify-content:space-between;gap:8px;}
    .mock-t-speaker{font-size:12.5px;font-weight:600;color:rgba(255,255,255,.85);}
    .mock-t-time{font-size:10.5px;color:#8FA6D6;font-family:var(--fm);flex-shrink:0;}
    .mock-t-text{font-size:12.5px;color:rgba(255,255,255,.55);line-height:1.5;}

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
       TRUST STRIP
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
       WORKFLOW RAIL (10-stage sequence)
    ══════════════════════════════════════════ */
    .flow-rail{display:flex;align-items:center;justify-content:center;gap:0;margin:44px 0 0;flex-wrap:wrap;row-gap:14px;}
    .flow-node{display:flex;flex-direction:column;align-items:center;gap:8px;width:88px;padding:10px 4px;background:transparent;border:none;cursor:pointer;flex-shrink:0;}
    .flow-node-icon{width:38px;height:38px;border-radius:10px;background:var(--paper2);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;color:var(--ink2);transition:background .2s,border-color .2s,color .2s;}
    .flow-node.active .flow-node-icon{background:var(--accent);border-color:var(--accent);color:var(--accent-ink);}
    .flow-node.done .flow-node-icon{background:var(--good-soft);border-color:var(--good);color:var(--good);}
    .flow-node-label{font-size:11px;font-weight:600;color:var(--muted);text-align:center;line-height:1.25;transition:color .2s;}
    .flow-node.active .flow-node-label{color:var(--ink);}
    .flow-arrow{width:16px;height:1px;background:var(--border);flex-shrink:0;margin-top:-24px;}
    @media(max-width:900px){.flow-arrow{display:none;} .flow-rail{gap:4px;}}
    @media(max-width:560px){.flow-node{width:72px;} .flow-node-icon{width:32px;height:32px;} .flow-node-label{font-size:10px;}}

    .flow-progress-track{max-width:640px;margin:28px auto 0;height:2px;background:var(--border);border-radius:2px;overflow:hidden;}
    .flow-progress-fill{height:100%;background:var(--accent);width:0%;transition:width .05s linear;}

    .flow-panel{display:grid;grid-template-columns:1fr 1.15fr;gap:48px;align-items:center;margin-top:40px;}
    @media(max-width:860px){.flow-panel{grid-template-columns:1fr;gap:24px;}}

    .flow-detail{max-width:420px;}
    .flow-detail-num{font-family:var(--fm);font-size:11px;font-weight:600;color:var(--accent);text-transform:uppercase;letter-spacing:.08em;margin-bottom:12px;}
    .flow-detail-title{font-size:clamp(19px,2.4vw,25px);font-weight:700;color:var(--ink);letter-spacing:-.02em;margin-bottom:10px;line-height:1.25;}
    .flow-detail-desc{font-size:14.5px;color:var(--ink2);line-height:1.68;}

    .flow-frame{background:var(--ink-panel);border-radius:var(--radius-l);overflow:hidden;box-shadow:0 1px 2px rgba(0,0,0,.04), 0 24px 64px -24px rgba(20,20,15,.35), 0 0 0 1px rgba(20,20,15,.04);}
    .flow-frame-bar{display:flex;align-items:center;gap:10px;padding:11px 15px;background:rgba(255,255,255,.03);border-bottom:1px solid rgba(255,255,255,.08);}
    .flow-frame-dots{display:flex;gap:6px;}
    .flow-frame-dots span{width:8px;height:8px;border-radius:50%;background:rgba(255,255,255,.14);}
    .flow-frame-label{font-size:11px;color:rgba(255,255,255,.35);font-family:var(--fm);flex:1;text-align:center;}
    .flow-frame-body{min-height:220px;position:relative;overflow:hidden;}

    .flow-autoplay-row{display:flex;align-items:center;justify-content:center;margin-top:24px;}

    /* Per-stage animated screens */
    .fs-panel{padding:20px 22px;opacity:0;transform:translateY(6px);}
    .fs-panel.fs-in{animation:fsPanelIn .35s cubic-bezier(.16,1,.3,1) forwards;}
    @keyframes fsPanelIn{to{opacity:1;transform:translateY(0)}}
    .fs-head{display:flex;align-items:center;gap:7px;font-size:11px;font-weight:600;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:.07em;margin-bottom:16px;font-family:var(--fm);}
    .fs-head svg{color:rgba(255,255,255,.4);}
    .fs-muted{color:rgba(255,255,255,.4);}

    .fs-field{display:flex;align-items:center;justify-content:space-between;padding:9px 0;border-bottom:1px solid rgba(255,255,255,.06);}
    .fs-field:last-child{border-bottom:none;}
    .fs-field-label{font-size:11px;color:rgba(255,255,255,.4);}
    .fs-field-val{font-size:12.5px;font-weight:600;color:rgba(255,255,255,.85);}

    .fs-chip{font-size:10.5px;font-weight:600;color:#8FA6D6;background:rgba(143,166,214,.12);padding:4px 9px;border-radius:100px;}
    .fs-chip-good{color:#7FC79E;background:rgba(127,199,158,.14);}

    .fs-row{display:flex;align-items:center;gap:10px;padding:8px 0;opacity:0;transform:translateY(4px);}
    .fs-row-in{animation:fsRowIn .4s cubic-bezier(.16,1,.3,1) forwards;}
    @keyframes fsRowIn{to{opacity:1;transform:translateY(0)}}
    .fs-row-text{flex:1;font-size:12.5px;color:rgba(255,255,255,.75);line-height:1.5;}
    .fs-row-meta{font-size:11px;color:rgba(255,255,255,.35);font-family:var(--fm);flex-shrink:0;}
    .fs-dot{width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,.28);flex-shrink:0;}
    .fs-dot-accent{background:#8FA6D6;}
    .fs-dot-good{background:#7FC79E;}
    .fs-check{width:14px;height:14px;border-radius:4px;background:rgba(127,199,158,.2);display:flex;align-items:center;justify-content:center;flex-shrink:0;}
    .fs-check svg{stroke:#7FC79E;}
    .fs-box{width:15px;height:15px;border-radius:4px;border:1.3px solid rgba(255,255,255,.28);flex-shrink:0;display:flex;align-items:center;justify-content:center;}
    .fs-box.on{background:#8FA6D6;border-color:#8FA6D6;color:#0e1119;}
    .fs-avatar{width:22px;height:22px;border-radius:50%;background:rgba(255,255,255,.08);color:rgba(255,255,255,.65);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;flex-shrink:0;}

    .fs-cv-parse{display:flex;align-items:center;gap:9px;padding:10px 12px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:8px;margin-bottom:12px;}
    .fs-cv-icon{color:rgba(255,255,255,.5);flex-shrink:0;display:flex;}
    .fs-cv-name{flex:1;font-size:12px;color:rgba(255,255,255,.65);font-family:var(--fm);}

    .fs-match-ring-row{display:flex;align-items:center;gap:16px;margin-bottom:16px;}
    .fs-match-ring{width:56px;height:56px;border-radius:50%;border:3px solid #8FA6D6;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
    .fs-match-ring span{font-size:13px;font-weight:700;color:#fff;}
    .fs-match-copy{font-size:12.5px;font-weight:600;color:rgba(255,255,255,.85);line-height:1.5;}

    .fs-note{font-size:11.5px;color:rgba(255,255,255,.4);margin-top:8px;padding-top:12px;border-top:1px solid rgba(255,255,255,.07);opacity:0;transform:translateY(4px);}
    .fs-note.fs-in{animation:fsRowIn .4s cubic-bezier(.16,1,.3,1) forwards;}
    .fs-quote{font-size:13px;color:rgba(255,255,255,.7);line-height:1.6;font-style:italic;opacity:0;transform:translateY(4px);}
    .fs-quote.fs-in{animation:fsRowIn .4s cubic-bezier(.16,1,.3,1) forwards;}

    .fs-place-row{display:flex;align-items:center;gap:10px;margin-bottom:18px;}
    .fs-stat-row{display:flex;gap:0;padding-top:16px;border-top:1px solid rgba(255,255,255,.07);}
    .fs-stat{flex:1;opacity:0;transform:translateY(4px);}
    .fs-stat.fs-in{animation:fsRowIn .4s cubic-bezier(.16,1,.3,1) forwards;}
    .fs-stat-val{font-size:19px;font-weight:700;color:#fff;letter-spacing:-.01em;margin-bottom:2px;}
    .fs-stat-label{font-size:10.5px;color:rgba(255,255,255,.38);}

    @media (prefers-reduced-motion: reduce){
      .fs-panel,.fs-row,.fs-note,.fs-quote,.fs-stat{animation-duration:.001ms!important;}
    }

    /* ══════════════════════════════════════════
       PAIN / FIX PAIRS
    ══════════════════════════════════════════ */
    .pain-grid{display:grid;grid-template-columns:1fr 1fr;gap:1px;margin-top:40px;background:var(--border);border:1px solid var(--border);border-radius:var(--radius-l);overflow:hidden;}
    .pain-card{background:var(--paper);padding:26px 24px;display:flex;flex-direction:column;gap:16px;}
    .pain-row{display:flex;align-items:flex-start;gap:12px;}
    .pain-icon{width:30px;height:30px;border-radius:var(--radius-s);background:var(--paper2);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;color:var(--faint);flex-shrink:0;}
    .pain-label{font-size:10.5px;font-weight:600;color:var(--faint);text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px;font-family:var(--fm);}
    .pain-text{font-size:14px;font-weight:600;color:var(--ink2);line-height:1.4;letter-spacing:-.01em;}
    .fix-row{display:flex;align-items:flex-start;gap:12px;padding-top:16px;border-top:1px dashed var(--border);}
    .fix-icon{width:30px;height:30px;border-radius:var(--radius-s);background:var(--accent-soft);border:1px solid var(--accent-border);display:flex;align-items:center;justify-content:center;color:var(--accent);flex-shrink:0;}
    .fix-label{font-size:10.5px;font-weight:600;color:var(--accent);text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px;font-family:var(--fm);}
    .fix-text{font-size:13px;color:var(--ink2);line-height:1.6;}
    @media(max-width:860px){.pain-grid{grid-template-columns:1fr;}}

    /* ══════════════════════════════════════════
       DIFFERENTIATORS GRID
    ══════════════════════════════════════════ */
    .diff-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;margin-top:40px;background:var(--border);border:1px solid var(--border);border-radius:var(--radius-l);overflow:hidden;}
    .diff-card{background:var(--paper);padding:24px 22px;}
    .diff-icon{width:32px;height:32px;border-radius:var(--radius-s);background:var(--paper2);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;color:var(--ink2);margin-bottom:14px;}
    .diff-title{font-size:13.5px;font-weight:600;color:var(--ink);margin-bottom:6px;letter-spacing:-.01em;}
    .diff-desc{font-size:12.5px;color:var(--muted);line-height:1.6;}
    @media(max-width:900px){.diff-grid{grid-template-columns:1fr 1fr;}}
    @media(max-width:560px){.diff-grid{grid-template-columns:1fr;}}

    /* ══════════════════════════════════════════
       BUILT FOR RECRUITERS
    ══════════════════════════════════════════ */
    .built-wrap{margin-top:44px;display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--border);border:1px solid var(--border);border-radius:var(--radius-l);overflow:hidden;}
    .built-col{padding:32px 28px;}
    .built-col.is-them{background:var(--paper);}
    .built-col.is-us{background:var(--ink-panel);}
    .built-col-label{font-family:var(--fm);font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;margin-bottom:20px;}
    .built-col.is-them .built-col-label{color:var(--faint);}
    .built-col.is-us .built-col-label{color:#8FA6D6;}
    .built-item{display:flex;align-items:flex-start;gap:10px;padding:12px 0;border-top:1px solid var(--border);}
    .built-col.is-them .built-item:first-of-type{border-top:none;}
    .built-col.is-us .built-item{border-top:1px solid rgba(255,255,255,.08);}
    .built-col.is-us .built-item:first-of-type{border-top:none;}
    .built-item-icon{width:16px;height:16px;flex-shrink:0;margin-top:2px;}
    .built-col.is-them .built-item-icon{color:var(--faint);}
    .built-col.is-us .built-item-icon{color:#7FC79E;}
    .built-item-text{font-size:13px;line-height:1.55;}
    .built-col.is-them .built-item-text{color:var(--muted);}
    .built-col.is-us .built-item-text{color:rgba(255,255,255,.75);}
    @media(max-width:760px){.built-wrap{grid-template-columns:1fr;}}

    /* ══════════════════════════════════════════
       CANDIDATE JOURNEY (numbered, real end-to-end sequence)
    ══════════════════════════════════════════ */
    .journey-rail{margin-top:44px;display:flex;flex-direction:column;}
    .journey-row{display:grid;grid-template-columns:64px 1fr;gap:20px;padding:22px 0;}
    .journey-row + .journey-row{border-top:1px solid var(--border);}
    .journey-num{width:32px;height:32px;border-radius:50%;border:1px solid var(--border-strong);display:flex;align-items:center;justify-content:center;font-family:var(--fm);font-size:12.5px;font-weight:600;color:var(--ink2);flex-shrink:0;}
    .journey-body{display:flex;align-items:flex-start;gap:16px;flex-wrap:wrap;}
    .journey-icon{width:34px;height:34px;border-radius:var(--radius-s);background:var(--paper2);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;color:var(--ink2);flex-shrink:0;}
    .journey-text{flex:1;min-width:200px;}
    .journey-title{font-size:15px;font-weight:600;color:var(--ink);margin-bottom:4px;letter-spacing:-.01em;}
    .journey-desc{font-size:13px;color:var(--muted);line-height:1.6;max-width:520px;}
    @media(max-width:560px){
      .journey-row{grid-template-columns:40px 1fr;gap:12px;}
      .journey-num{width:26px;height:26px;font-size:11px;}
    }

    /* ══════════════════════════════════════════
       AGENCY VISIBILITY
    ══════════════════════════════════════════ */
    .visibility-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;margin-top:40px;background:var(--border);border:1px solid var(--border);border-radius:var(--radius-l);overflow:hidden;}
    .vis-card{background:var(--paper);padding:24px 22px;}
    .vis-icon{width:32px;height:32px;border-radius:var(--radius-s);background:var(--accent-soft);border:1px solid var(--accent-border);display:flex;align-items:center;justify-content:center;color:var(--accent);margin-bottom:14px;}
    .vis-title{font-size:13.5px;font-weight:600;color:var(--ink);margin-bottom:6px;}
    .vis-desc{font-size:12.5px;color:var(--muted);line-height:1.6;}
    @media(max-width:860px){.visibility-grid{grid-template-columns:1fr 1fr;}}
    @media(max-width:560px){.visibility-grid{grid-template-columns:1fr;}}

    /* ══════════════════════════════════════════
       MID-PAGE CTA
    ══════════════════════════════════════════ */
    .mid-cta{padding:64px 22px;text-align:center;background:var(--ink-panel);}
    .mid-cta-inner{max-width:600px;margin:0 auto;}
    .mid-cta-h{font-size:clamp(22px,3.2vw,32px);font-weight:700;color:#fff;letter-spacing:-.025em;line-height:1.2;margin-bottom:14px;}
    .mid-cta-sub{font-size:14.5px;color:rgba(255,255,255,.6);line-height:1.6;margin-bottom:26px;}
    .mid-cta-ctas{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;}
    .btn-hero-dark{display:inline-flex;align-items:center;justify-content:center;gap:8px;font-size:14px;font-weight:600;color:var(--ink-panel)!important;background:#fff;border:1px solid #fff;padding:13px 24px;border-radius:var(--radius-s);cursor:pointer;text-decoration:none;font-family:var(--fb);transition:opacity .15s;min-height:48px;}
    .btn-hero-dark:hover{opacity:.88;}
    .btn-hero-outline-dark{display:inline-flex;align-items:center;justify-content:center;gap:8px;font-size:14px;font-weight:600;color:#fff!important;background:transparent;border:1px solid rgba(255,255,255,.28);padding:13px 22px;border-radius:var(--radius-s);cursor:pointer;text-decoration:none;font-family:var(--fb);transition:border-color .15s;min-height:48px;}
    .btn-hero-outline-dark:hover{border-color:#fff;}
    @media(max-width:500px){.mid-cta-ctas{flex-direction:column;align-items:stretch;} .mid-cta-ctas a{width:100%;}}

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
                <Link to="/login?mode=login" className="btn-ghost">Sign in</Link>
                <Link to="/welcome" className="btn-primary">Start Free</Link>
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
              <Link to="/login?mode=login" className="btn-hero-outline" onClick={closeMobile}>Sign in</Link>
              <Link to="/welcome" className="btn-hero" onClick={closeMobile}>Start Free</Link>
            </>
          )}
        </div>
      </div>

      {/* HERO */}
      <section className="hero" id="product">
        <div className="hero-inner">
          <div className="hero-top">
            <h1 className="hero-h">
              Run your recruitment desk without losing the details that win placements.
            </h1>
            <p className="hero-sub">
              Fixsense brings jobs, candidates, AI matching, applications, submissions, interviews, meeting intelligence, client feedback, and placements into one system, so nothing sits in a spreadsheet, an inbox, or someone's memory.
            </p>
            <div className="hero-ctas">
              <Link to="/welcome" className="btn-hero">
                Start Free
                <Icon name="arrow-right" size={14} />
              </Link>
              <a href="#workflow" className="btn-hero-outline">See How It Works</a>
            </div>
            <div className="hero-trust">
              {["No credit card required", "Live in minutes", "Cancel anytime"].map((t, i) => (
                <div key={i} className="trust-pill">
                  <Icon name="check" size={13} strokeWidth={2.2} />
                  {t}
                </div>
              ))}
            </div>
          </div>

          <div className="hero-audience">
            <div className="hero-audience-label">Built for UK recruitment &amp; staffing agencies</div>
            <div className="hero-audience-list">
              {["Contingency recruiters", "Agency owners & desk managers", "Executive search", "Contract & temp staffing", "In-house talent teams"].map((t, i) => (
                <span key={i} className="hero-audience-pill">{t}</span>
              ))}
            </div>
          </div>

          <div className="hero-mock-wrap">
            <ProductMock />
          </div>
        </div>
      </section>

      {/* TRUST STRIP */}
      <div className="strip">
        <div className="strip-inner">
          <span className="strip-label">
            Built for recruitment agencies running contingency, retained, and contract desks who need one system instead of five.
          </span>
        </div>
      </div>

      {/* THE COMPLETE WORKFLOW */}
      <WorkflowRail />

      {/* PAIN → FIX */}
      <section className="section" id="pain" style={{ background: "var(--paper2)" }}>
        <div className="section-inner">
          <Reveal>
            <div className="kicker">Where desks lose time</div>
            <h2 className="section-h">The problems every recruitment desk knows.</h2>
            <p className="section-sub">Not abstract inefficiencies. The specific moments where a placement slips, using the features already built to fix each one.</p>
          </Reveal>
          <Reveal delay={80}>
            <div className="pain-grid">
              {PAIN_POINTS.map((p, i) => (
                <div key={i} className="pain-card">
                  <div className="pain-row">
                    <div className="pain-icon"><Icon name={p.icon} size={15} /></div>
                    <div>
                      <div className="pain-label">The problem</div>
                      <div className="pain-text">{p.pain}</div>
                    </div>
                  </div>
                  <div className="fix-row">
                    <div className="fix-icon"><Icon name="check" size={14} strokeWidth={2.2} /></div>
                    <div>
                      <div className="fix-label">How Fixsense fixes it</div>
                      <div className="fix-text">{p.fix}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* DIFFERENTIATORS */}
      <section className="section" id="differentiators">
        <div className="section-inner">
          <Reveal>
            <div style={{ textAlign: "center", marginBottom: 8 }}>
              <div className="kicker" style={{ justifyContent: "center" }}>Recruiting-specific, not bolted on</div>
              <h2 className="section-h" style={{ textAlign: "center", maxWidth: 680, margin: "0 auto" }}>
                Everything a recruitment desk actually needs.
              </h2>
            </div>
          </Reveal>
          <Reveal delay={80}>
            <div className="diff-grid">
              {DIFFERENTIATORS.map((d, i) => (
                <div key={i} className="diff-card">
                  <div className="diff-icon"><Icon name={d.icon} size={16} /></div>
                  <div className="diff-title">{d.title}</div>
                  <div className="diff-desc">{d.desc}</div>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* MID-PAGE CTA */}
      <section className="mid-cta">
        <div className="mid-cta-inner">
          <h2 className="mid-cta-h">Stop stitching five tools into one recruitment process.</h2>
          <p className="mid-cta-sub">Jobs, candidates, matching, submissions, interviews, and placements, already connected. Start running your desk in Fixsense today.</p>
          <div className="mid-cta-ctas">
            <Link to="/welcome" className="btn-hero-dark">
              Start Free
              <Icon name="arrow-right" size={14} />
            </Link>
            <a href="#workflow" className="btn-hero-outline-dark">See How It Works</a>
          </div>
        </div>
      </section>

      {/* BUILT FOR RECRUITERS, NOT ADAPTED FOR RECRUITERS */}
      <section className="section" id="built-for" style={{ background: "var(--paper2)" }}>
        <div className="section-inner">
          <Reveal>
            <div style={{ textAlign: "center", marginBottom: 8 }}>
              <div className="kicker" style={{ justifyContent: "center" }}>Not a repurposed meeting tool</div>
              <h2 className="section-h" style={{ textAlign: "center", maxWidth: 640, margin: "0 auto" }}>Built for recruiters, not adapted for recruiters.</h2>
              <p className="section-sub" style={{ textAlign: "center", margin: "10px auto 0" }}>A generic AI notetaker records calls. Fixsense runs your entire desk.</p>
            </div>
          </Reveal>
          <Reveal delay={80}>
            <div className="built-wrap">
              <div className="built-col is-them">
                <div className="built-col-label">A generic meeting assistant</div>
                {[
                  "Transcribes a call and writes a summary",
                  "No concept of a job, a candidate, or a pipeline",
                  "No way to score a candidate against requirements",
                  "Client feedback lives in an inbox, disconnected from the call",
                  "Nothing connects the interview to a placement outcome",
                ].map((t, i) => (
                  <div key={i} className="built-item">
                    <span className="built-item-icon"><Icon name="minus" size={16} /></span>
                    <span className="built-item-text">{t}</span>
                  </div>
                ))}
              </div>
              <div className="built-col is-us">
                <div className="built-col-label">Fixsense</div>
                {[
                  "The interview transcript sits inside the candidate's record, on the job it's for",
                  "Every candidate has a pipeline stage, a match score, and a full timeline",
                  "AI matching scores candidates against the job with a stated reason",
                  "Client feedback is logged on the candidate and the client CRM record",
                  "The same record runs from application through to confirmed placement",
                ].map((t, i) => (
                  <div key={i} className="built-item">
                    <span className="built-item-icon"><Icon name="check" size={14} strokeWidth={2.4} /></span>
                    <span className="built-item-text">{t}</span>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* CANDIDATE JOURNEY: a realistic end-to-end run-through */}
      <section className="section" id="journey">
        <div className="section-inner">
          <Reveal>
            <div className="kicker">A realistic run-through</div>
            <h2 className="section-h">From creating a job to placing a candidate.</h2>
            <p className="section-sub">What a recruiter actually does inside Fixsense, start to finish, on a single vacancy.</p>
          </Reveal>
          <Reveal delay={80}>
            <div className="journey-rail">
              {[
                { icon: "briefcase", title: "Create the job", desc: "A recruiter adds a new vacancy: Senior .NET Developer, London, for an existing client in the Client CRM, with the requirements Fixsense will match against." },
                { icon: "link", title: "Share the application link", desc: "The job's application link goes out to the recruiter's network. Applications start arriving directly into the pipeline as they come in." },
                { icon: "database", title: "CVs parse into candidate records", desc: "Each application's CV is parsed automatically into a structured candidate profile (skills, experience, contact details) added to the candidate database." },
                { icon: "sparkle", title: "AI scores every applicant", desc: "AI job matching scores each candidate against the job's requirements and explains the reasoning behind each score." },
                { icon: "check-square", title: "Build the shortlist", desc: "The recruiter reviews the top matches and moves the strongest candidates into shortlist in the pipeline." },
                { icon: "user-plus", title: "Submit to the client", desc: "A submission is sent to the client with the shortlisted candidates, tracked in the Client CRM, not a one-off email." },
                { icon: "mic", title: "Run the interview in Fixsense Meetings", desc: "The client interview is held inside Fixsense Meetings, transcribed live with AI feedback generated for the panel afterward." },
                { icon: "message", title: "Log the client feedback", desc: "The client's feedback after the interview is logged directly against the candidate and the job." },
                { icon: "target", title: "Confirm the placement", desc: "Once the offer is accepted, the placement is recorded and reflected immediately in recruitment analytics." },
              ].map((s, i) => (
                <div className="journey-row" key={i}>
                  <div className="journey-num">{String(i + 1).padStart(2, "0")}</div>
                  <div className="journey-body">
                    <div className="journey-icon"><Icon name={s.icon} size={16} /></div>
                    <div className="journey-text">
                      <div className="journey-title">{s.title}</div>
                      <div className="journey-desc">{s.desc}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* AGENCY OWNER: VISIBILITY */}
      <section className="section" id="agency" style={{ background: "var(--paper2)" }}>
        <div className="section-inner">
          <Reveal>
            <div style={{ textAlign: "center", marginBottom: 8 }}>
              <div className="kicker" style={{ justifyContent: "center" }}>For agency owners and desk managers</div>
              <h2 className="section-h" style={{ textAlign: "center", maxWidth: 620, margin: "0 auto" }}>Know what is happening across your desk.</h2>
              <p className="section-sub" style={{ textAlign: "center", margin: "10px auto 0" }}>Every job, candidate, interview, submission, and placement, visible in one place, not five recruiters' separate spreadsheets.</p>
            </div>
          </Reveal>
          <Reveal delay={80}>
            <div className="visibility-grid">
              {[
                { icon: "briefcase", title: "Open jobs", desc: "See every live vacancy across the agency, which client it's for, and how it's progressing." },
                { icon: "route", title: "Candidate pipeline", desc: "Every candidate's stage, across every job and every recruiter, in one pipeline view." },
                { icon: "mic", title: "Interviews", desc: "Upcoming interviews, ones needing feedback, and completed ones, tracked as a team-wide agenda." },
                { icon: "user-plus", title: "Submissions", desc: "Every submission sent to a client, and whether it has moved to interview or feedback." },
                { icon: "target", title: "Placements", desc: "Confirmed placements and pipeline value, rolled up by client and by recruiter." },
                { icon: "bar-chart", title: "Recruiter activity", desc: "Time-to-shortlist, interview-to-offer ratio, and placements per recruiter in recruitment analytics." },
              ].map((v, i) => (
                <div key={i} className="vis-card">
                  <div className="vis-icon"><Icon name={v.icon} size={16} /></div>
                  <div className="vis-title">{v.title}</div>
                  <div className="vis-desc">{v.desc}</div>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* SECURITY */}
      <section className="section" id="security">
        <div className="section-inner">
          <Reveal>
            <div style={{ textAlign: "center", marginBottom: 8 }}>
              <div className="kicker" style={{ justifyContent: "center" }}>Built to be trusted</div>
              <h2 className="section-h" style={{ textAlign: "center", maxWidth: 600, margin: "0 auto" }}>Candidate and client data, protected by default.</h2>
              <p className="section-sub" style={{ textAlign: "center", maxWidth: 480, margin: "10px auto 0" }}>CVs, interviews, and client feedback carry sensitive information. Fixsense is built around that responsibility from day one.</p>
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
              <p className="section-sub" style={{ textAlign: "center", maxWidth: 480, margin: "10px auto 0" }}>No per-seat tricks. Start free and upgrade only when your desk needs more.</p>
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
                  <Link to={p.price_usd === 0 ? "/welcome" : (user ? "/dashboard" : "/login?mode=signup")} className={`plan-cta ${p.highlight ? "primary" : ""}`}>
                    {p.price_usd === 0 ? "Start Free" : "Choose plan"}
                  </Link>
                </div>
              ))}
            </div>
          </Reveal>
          <div className="pricing-footline">
            All plans include unlimited candidate and job records, and no lock-in contract.{" "}
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
            <h2 className="final-h">Run your desk here, not across five tools.</h2>
            <p className="final-sub">Post your first job, share the application link, and see AI matching work on your next shortlist. No credit card required, and you can be live in minutes.</p>
            <div className="final-ctas">
              <Link to="/welcome" className="btn-hero">
                Start Free
                <Icon name="arrow-right" size={14} />
              </Link>
              <a href="#workflow" className="btn-hero-outline">See How It Works</a>
            </div>
            <p className="final-footnote">Free plan · No credit card required · Live in minutes</p>
          </Reveal>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="footer">
        <div className="footer-inner">
          <div className="footer-top">
            <div>
              <div className="footer-brand-name"><Logo size={20} />Fixsense</div>
              <p className="footer-brand-desc">The recruitment operating system for agencies: jobs, candidates, matching, and placements, in one place.</p>
            </div>
            <div>
              <div className="footer-col-title">Product</div>
              {[["#product", "Product"], ["#workflow", "How it works"], ["/pricing", "Pricing"], ["/changelog", "Changelog"]].map(([h, l]) => (
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