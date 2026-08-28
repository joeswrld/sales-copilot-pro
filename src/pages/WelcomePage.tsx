import { useState, useCallback, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Icon, Logo } from "@/pages/LandingPage";
import AuthPanel from "@/components/AuthPanel";

/* ─────────────────────────────────────────────────────────────────────────
   WelcomePage — the /welcome recruiting-desk walkthrough every "Start Free"
   CTA on the landing page routes to. Eleven steps that dramatize a single,
   continuous placement — Senior .NET Developer at Harrow & Bell Technology,
   candidate Sarah Whitfield — reusing the same fs-* dark-panel vocabulary
   and Icon set as the landing page's workflow rail, so it reads as the same
   product rather than a separate marketing artifact. The final step is the
   real AuthPanel: there is no second authentication system here.
   ───────────────────────────────────────────────────────────────────────── */

type Step = {
  key: string;
  label: string;
  icon: string;
  kicker: string;
  title: string;
  desc: string;
};

const STEPS: Step[] = [
  {
    key: "job",
    label: "Create Job",
    icon: "briefcase",
    kicker: "Step 1 · Open the role",
    title: "Post the job once. Everything else hangs off it.",
    desc: "Add the client, the requirements, and the location. This becomes the single anchor every application, match, submission, and interview connects back to.",
  },
  {
    key: "applications",
    label: "Applications",
    icon: "inbox",
    kicker: "Step 2 · Applications arrive",
    title: "Applications land in the pipeline, not an inbox.",
    desc: "Share the job's application link and every candidate who applies drops straight into the pipeline, already attached to the right role.",
  },
  {
    key: "cv",
    label: "CV Parsing",
    icon: "file-text",
    kicker: "Step 3 · CV parsing",
    title: "Every CV becomes a structured record.",
    desc: "Fixsense reads each upload into a real candidate profile: skills, roles, history, and contact details, searchable across your whole desk in seconds.",
  },
  {
    key: "match",
    label: "AI Matching",
    icon: "sparkle",
    kicker: "Step 4 · AI matching",
    title: "AI scores every candidate against the job.",
    desc: "Each application is matched against the job's requirements with a score and a plain-language reason, so you know who's worth a closer look first.",
  },
  {
    key: "shortlist",
    label: "Shortlist",
    icon: "check-square",
    kicker: "Step 5 · Build the shortlist",
    title: "Move your strongest matches forward.",
    desc: "Shortlist candidates with one action, backed by the match reasoning underneath, not a gut call made at the end of a long day.",
  },
  {
    key: "submit",
    label: "Submit to Client",
    icon: "link",
    kicker: "Step 6 · Submit to client",
    title: "Send the submission as a tracked step, not an email.",
    desc: "Submissions go to the client through Fixsense, so you always know what's been sent, when, and what happens to it next.",
  },
  {
    key: "invite",
    label: "Interview Invite",
    icon: "user-plus",
    kicker: "Step 7 · Interview invitation",
    title: "Get the interview on the calendar in one step.",
    desc: "Send the invitation and lock in the time without leaving the candidate record or juggling a separate calendar app.",
  },
  {
    key: "conduct",
    label: "Conduct Interview",
    icon: "mic",
    kicker: "Step 8 · Conduct the interview",
    title: "Run the interview inside Fixsense Meetings.",
    desc: "Host the call live, with the candidate's profile and the job's requirements right there next to the conversation as it happens.",
  },
  {
    key: "transcript",
    label: "Transcript / AI Feedback",
    icon: "message",
    kicker: "Step 9 · Transcript & AI feedback",
    title: "The interview transcribes and scores itself.",
    desc: "A full transcript and AI-generated feedback save straight to the candidate record the moment the call ends, no notes to write up later.",
  },
  {
    key: "pipeline",
    label: "Pipeline Tracking",
    icon: "bar-chart",
    kicker: "Step 10 · Pipeline tracking",
    title: "See exactly where every candidate stands.",
    desc: "Client feedback, interview outcomes, and next steps all land on the pipeline in real time, so nothing waits on a status-update email.",
  },
  {
    key: "offer",
    label: "Offer / Placement",
    icon: "target",
    kicker: "Step 11 · Offer & placement",
    title: "Carry it through to a confirmed placement.",
    desc: "Track the offer through to acceptance and see it reflected immediately in your recruitment analytics. That's the whole desk, start to finish.",
  },
];

const TOTAL_STEPS = STEPS.length + 1; // + the final account step

// ───────────────────────────────────────────────────────────────────────
// Per-step animated mock screens (same fs-* vocabulary as the landing
// page's FlowScreen* components, built fresh here so WelcomePage doesn't
// depend on LandingPage's unexported internals).
// ───────────────────────────────────────────────────────────────────────
function ScreenJob() {
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

function ScreenApplications() {
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

function ScreenCv() {
  return (
    <div className="fs-panel fs-in">
      <div className="fs-head"><Icon name="file-text" size={13} />Candidate record</div>
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

function ScreenMatch() {
  return (
    <div className="fs-panel fs-in">
      <div className="fs-head"><Icon name="sparkle" size={13} />AI match score</div>
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

function ScreenShortlist() {
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

function ScreenSubmit() {
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

function ScreenInvite() {
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

function ScreenConduct() {
  const lines = [
    { n: "Client", t: "Tell me about your Azure migration work." },
    { n: "Sarah", t: "I led the migration for a 40-service platform over six months." },
  ];
  return (
    <div className="fs-panel fs-in">
      <div className="fs-head"><Icon name="mic" size={13} />Fixsense Meetings · live</div>
      {lines.map((l, i) => (
        <div className="fs-row fs-row-in" style={{ animationDelay: `${i * 220}ms` }} key={l.n}>
          <span className="fs-avatar">{l.n[0]}</span>
          <span className="fs-row-text">{l.t}</span>
        </div>
      ))}
      <div className="fs-note fs-in" style={{ animationDelay: "480ms" }}>Recording · transcribing live</div>
    </div>
  );
}

function ScreenTranscript() {
  return (
    <div className="fs-panel fs-in">
      <div className="fs-head"><Icon name="message" size={13} />AI interview feedback</div>
      <p className="fs-quote fs-in" style={{ animationDelay: "120ms" }}>
        Strong technical depth on Azure migrations, clear communicator, comfortable owning ambiguity. Recommend advancing.
      </p>
      <div className="fs-row fs-row-in" style={{ animationDelay: "300ms" }}>
        <span className="fs-check"><Icon name="check" size={9} strokeWidth={2.6} /></span>
        <span className="fs-row-text">Full transcript saved to candidate record</span>
      </div>
      <div className="fs-row fs-row-in" style={{ animationDelay: "420ms" }}>
        <span className="fs-check"><Icon name="check" size={9} strokeWidth={2.6} /></span>
        <span className="fs-row-text">Panel feedback logged automatically</span>
      </div>
    </div>
  );
}

function ScreenPipeline() {
  const rows = [
    { name: "Sarah Whitfield", stage: "Client feedback", tone: "good" as const },
    { name: "Aisha Malik", stage: "Interview scheduled", tone: "accent" as const },
  ];
  return (
    <div className="fs-panel fs-in">
      <div className="fs-head"><Icon name="bar-chart" size={13} />Pipeline · Senior .NET Developer</div>
      {rows.map((r, i) => (
        <div className="fs-row fs-row-in" style={{ animationDelay: `${i * 150}ms` }} key={r.name}>
          <span className={`fs-dot fs-dot-${r.tone}`} />
          <span className="fs-row-text">{r.name}</span>
          <span className="fs-row-meta">{r.stage}</span>
        </div>
      ))}
      <div className="fs-note fs-in" style={{ animationDelay: "380ms" }}>Client feedback: "Moving to a second interview with the engineering lead."</div>
    </div>
  );
}

function ScreenOffer() {
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

const SCREENS: Record<string, React.ComponentType> = {
  job: ScreenJob,
  applications: ScreenApplications,
  cv: ScreenCv,
  match: ScreenMatch,
  shortlist: ScreenShortlist,
  submit: ScreenSubmit,
  invite: ScreenInvite,
  conduct: ScreenConduct,
  transcript: ScreenTranscript,
  pipeline: ScreenPipeline,
  offer: ScreenOffer,
};

export default function WelcomePage() {
  const { user } = useAuth();
  const [step, setStep] = useState(0); // 0..STEPS.length-1 walkthrough, STEPS.length = account step
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const liveRegionRef = useRef<HTMLDivElement>(null);

  const isAccountStep = step === STEPS.length;
  const current = !isAccountStep ? STEPS[step] : null;

  const goNext = useCallback(() => {
    setDirection("forward");
    setStep((s) => Math.min(s + 1, STEPS.length));
  }, []);

  const goBack = useCallback(() => {
    setDirection("back");
    setStep((s) => Math.max(s - 1, 0));
  }, []);

  const jumpTo = useCallback((i: number) => {
    setDirection(i > step ? "forward" : "back");
    setStep(i);
  }, [step]);

  useEffect(() => {
    if (liveRegionRef.current) {
      liveRegionRef.current.textContent = isAccountStep
        ? "Create your account"
        : `Step ${step + 1} of ${TOTAL_STEPS}: ${current?.label}`;
    }
  }, [step, isAccountStep, current]);

  // Already-signed-in users skip straight to their workspace instead of
  // being made to sit through onboarding marketing again — but they can
  // still browse the walkthrough manually if they land here directly.
  const alreadySignedIn = !!user;

  const Screen = current ? SCREENS[current.key] : null;
  const progressPct = ((isAccountStep ? STEPS.length : step) / STEPS.length) * 100;

  const css = `
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    :root{
      --paper:#FAFAF8;--paper2:#F3F2ED;--ink-panel:#14140F;
      --ink:#17170F;--ink2:rgba(23,23,15,0.66);--muted:rgba(23,23,15,0.42);--faint:rgba(23,23,15,0.28);
      --border:rgba(23,23,15,0.11);--border-strong:rgba(23,23,15,0.18);
      --accent:#22315C;--accent-ink:#FAFAF8;--accent-soft:rgba(34,49,92,0.07);--accent-border:rgba(34,49,92,0.22);
      --good:#2F6B4F;--good-soft:rgba(47,107,79,0.09);
      --fd:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
      --fb:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
      --fm:'IBM Plex Mono',ui-monospace,monospace;
      --touch:44px;--radius-s:6px;--radius-m:10px;--radius-l:14px;
    }
    html{scroll-behavior:smooth;-webkit-text-size-adjust:100%;}
    @media (prefers-reduced-motion: reduce){
      .wp *{animation-duration:.001ms!important;animation-iteration-count:1!important;transition-duration:.001ms!important;}
    }
    .wp{background:var(--paper);color:var(--ink);font-family:var(--fb);-webkit-font-smoothing:antialiased;min-height:100vh;display:flex;flex-direction:column;}
    .wp :focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:3px;}
    .wp a{color:inherit;}

    .wp-topbar{position:sticky;top:0;z-index:20;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 22px;border-bottom:1px solid var(--border);background:rgba(250,250,248,0.92);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);}
    .wp-brand{display:flex;align-items:center;gap:9px;text-decoration:none;}
    .wp-brandname{font-size:14.5px;font-weight:700;color:var(--ink)!important;letter-spacing:-.01em;}
    .wp-exit{font-size:13px;font-weight:500;color:var(--muted)!important;text-decoration:none;padding:8px 12px;border-radius:var(--radius-s);transition:color .15s,background .15s;}
    .wp-exit:hover{color:var(--ink)!important;background:rgba(23,23,15,.04);}

    .wp-progress-track{height:3px;background:var(--border);position:relative;overflow:hidden;flex-shrink:0;}
    .wp-progress-fill{height:100%;background:var(--accent);transition:width .45s cubic-bezier(.16,1,.3,1);}

    .wp-steps{display:flex;align-items:center;gap:6px;overflow-x:auto;padding:14px 22px;max-width:1040px;margin:0 auto;width:100%;scrollbar-width:none;}
    .wp-steps::-webkit-scrollbar{display:none;}
    .wp-step-dot{width:7px;height:7px;border-radius:50%;background:var(--border-strong);flex-shrink:0;transition:background .25s,transform .25s;border:none;padding:0;cursor:pointer;}
    .wp-step-dot.active{background:var(--accent);transform:scale(1.5);}
    .wp-step-dot.done{background:var(--good);}
    .wp-step-dot:disabled{cursor:default;}

    .wp-main{flex:1;display:flex;align-items:center;padding:20px 22px 140px;}
    .wp-main-inner{max-width:1040px;margin:0 auto;width:100%;}

    .wp-panel{display:grid;grid-template-columns:1fr 1.1fr;gap:52px;align-items:center;}
    @media(max-width:860px){.wp-panel{grid-template-columns:1fr;gap:28px;}}

    .wp-detail{max-width:440px;}
    .wp-kicker{font-family:var(--fm);font-size:11px;font-weight:600;color:var(--accent);text-transform:uppercase;letter-spacing:.08em;margin-bottom:14px;display:flex;align-items:center;gap:8px;}
    .wp-icon-badge{width:38px;height:38px;border-radius:10px;background:var(--accent-soft);border:1px solid var(--accent-border);display:flex;align-items:center;justify-content:center;color:var(--accent);margin-bottom:18px;}
    .wp-title{font-size:clamp(22px,3vw,30px);font-weight:700;color:var(--ink);letter-spacing:-.025em;margin-bottom:12px;line-height:1.2;}
    .wp-desc{font-size:14.5px;color:var(--ink2);line-height:1.68;}

    .wp-frame{background:var(--ink-panel);border-radius:var(--radius-l);overflow:hidden;box-shadow:0 1px 2px rgba(0,0,0,.04), 0 24px 64px -24px rgba(20,20,15,.35), 0 0 0 1px rgba(20,20,15,.04);animation:wpFrameIn .45s cubic-bezier(.16,1,.3,1);}
    @keyframes wpFrameIn{from{opacity:0;transform:translateY(10px) scale(.99)}to{opacity:1;transform:translateY(0) scale(1)}}
    .wp-frame-bar{display:flex;align-items:center;gap:10px;padding:11px 15px;background:rgba(255,255,255,.03);border-bottom:1px solid rgba(255,255,255,.08);}
    .wp-frame-dots{display:flex;gap:6px;}
    .wp-frame-dots span{width:8px;height:8px;border-radius:50%;background:rgba(255,255,255,.14);}
    .wp-frame-label{font-size:11px;color:rgba(255,255,255,.35);font-family:var(--fm);flex:1;text-align:center;}
    .wp-frame-body{min-height:230px;position:relative;overflow:hidden;}

    /* fs-* mock-screen vocabulary, shared with the landing page's flow rail */
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
      .fs-panel,.fs-row,.fs-note,.fs-quote,.fs-stat,.wp-frame{animation-duration:.001ms!important;}
    }

    /* Account step */
    .wp-account-wrap{max-width:440px;margin:0 auto;}
    .wp-account-head{text-align:center;margin-bottom:26px;}
    .wp-account-icon{width:44px;height:44px;border-radius:12px;background:var(--good-soft);border:1px solid rgba(47,107,79,.28);display:flex;align-items:center;justify-content:center;color:var(--good);margin:0 auto 16px;}
    .wp-account-title{font-size:clamp(21px,2.8vw,26px);font-weight:700;color:var(--ink);letter-spacing:-.02em;margin-bottom:8px;}
    .wp-account-sub{font-size:13.5px;color:var(--ink2);line-height:1.6;}
    .wp-account-card{background:var(--paper);border:1px solid var(--border);border-radius:var(--radius-l);padding:26px 24px;box-shadow:0 1px 2px rgba(0,0,0,.02);}

    /* Bottom nav bar */
    .wp-bottombar{position:fixed;left:0;right:0;bottom:0;z-index:20;background:rgba(250,250,248,0.94);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border-top:1px solid var(--border);padding:14px 22px;}
    .wp-bottombar-inner{max-width:1040px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;gap:14px;}
    .wp-back-btn{display:inline-flex;align-items:center;gap:6px;font-size:13.5px;font-weight:600;color:var(--ink2)!important;background:none;border:1px solid var(--border-strong);padding:11px 18px;border-radius:var(--radius-s);cursor:pointer;font-family:var(--fb);transition:border-color .15s,background .15s,opacity .15s;min-height:44px;}
    .wp-back-btn:hover{border-color:var(--ink);background:rgba(23,23,15,.02);}
    .wp-back-btn:disabled{opacity:0;pointer-events:none;}
    .wp-continue-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;font-size:14px;font-weight:600;color:var(--accent-ink)!important;background:var(--accent);border:1px solid var(--accent);padding:12px 26px;border-radius:var(--radius-s);cursor:pointer;font-family:var(--fb);transition:opacity .15s,transform .12s;min-height:44px;margin-left:auto;}
    .wp-continue-btn:hover{opacity:.9;}
    .wp-continue-btn:active{transform:scale(.985);}
    .wp-bottombar-count{font-size:12px;color:var(--muted);font-family:var(--fm);flex-shrink:0;}
    @media(max-width:640px){
      .wp-bottombar-count{display:none;}
      .wp-main{padding:16px 16px 130px;}
      .wp-topbar{padding:14px 16px;}
    }
  `;

  return (
    <div className="wp">
      <style>{css}</style>
      <div ref={liveRegionRef} role="status" aria-live="polite" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0,0,0,0)" }} />

      <div className="wp-topbar">
        <Link to="/" className="wp-brand">
          <Logo size={22} />
          <span className="wp-brandname">Fixsense</span>
        </Link>
        {alreadySignedIn ? (
          <Link to="/dashboard" className="wp-exit">Go to workspace</Link>
        ) : (
          <Link to="/" className="wp-exit">Exit</Link>
        )}
      </div>

      <div className="wp-progress-track">
        <div className="wp-progress-fill" style={{ width: `${progressPct}%` }} />
      </div>

      <div className="wp-steps" role="tablist" aria-label="Onboarding progress">
        {[...STEPS, { key: "account", label: "Your account" } as Step].map((s, i) => (
          <button
            key={s.key}
            className={`wp-step-dot${i === step ? " active" : ""}${i < step ? " done" : ""}`}
            onClick={() => jumpTo(i)}
            disabled={i > step}
            aria-label={`Step ${i + 1}: ${s.label}`}
            aria-current={i === step ? "step" : undefined}
          />
        ))}
      </div>

      <main className="wp-main">
        <div className="wp-main-inner" key={step} style={{ animation: `wp${direction === "forward" ? "SlideIn" : "SlideBack"} .4s cubic-bezier(.16,1,.3,1)` }}>
          <style>{`
            @keyframes wpSlideIn{from{opacity:0;transform:translateX(18px)}to{opacity:1;transform:translateX(0)}}
            @keyframes wpSlideBack{from{opacity:0;transform:translateX(-18px)}to{opacity:1;transform:translateX(0)}}
          `}</style>

          {!isAccountStep && current && Screen ? (
            <div className="wp-panel">
              <div className="wp-detail">
                <div className="wp-kicker">{current.kicker}</div>
                <div className="wp-icon-badge"><Icon name={current.icon} size={19} strokeWidth={1.7} /></div>
                <h1 className="wp-title">{current.title}</h1>
                <p className="wp-desc">{current.desc}</p>
              </div>
              <div className="wp-frame">
                <div className="wp-frame-bar">
                  <div className="wp-frame-dots"><span /><span /><span /></div>
                  <span className="wp-frame-label">fixsense.app · {current.label.toLowerCase()}</span>
                </div>
                <div className="wp-frame-body">
                  <Screen />
                </div>
              </div>
            </div>
          ) : (
            <div className="wp-account-wrap">
              <div className="wp-account-head">
                <div className="wp-account-icon"><Icon name="check" size={20} strokeWidth={2.4} /></div>
                <h1 className="wp-account-title">
                  {alreadySignedIn ? "You're already set up." : "Create your free account."}
                </h1>
                <p className="wp-account-sub">
                  {alreadySignedIn
                    ? "You're signed in, so there's nothing else to set up here — head straight into your workspace."
                    : "That's the whole desk: job to placement, in one system. Sign up to start running yours."}
                </p>
              </div>
              {alreadySignedIn ? (
                <div className="wp-account-card" style={{ textAlign: "center" }}>
                  <Link to="/dashboard" className="wp-continue-btn" style={{ width: "100%" }}>
                    Go to your workspace
                    <Icon name="arrow-right" size={14} />
                  </Link>
                </div>
              ) : (
                <div className="wp-account-card">
                  <AuthPanel
                    initialMode="signup"
                    hideTabs={false}
                    trackingSource="welcome_flow"
                    oauthRedirectPath="/dashboard"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      <div className="wp-bottombar">
        <div className="wp-bottombar-inner">
          <button className="wp-back-btn" onClick={goBack} disabled={step === 0}>
            <span style={{ display: "inline-flex", transform: "scaleX(-1)" }}><Icon name="arrow-right" size={13} strokeWidth={2} /></span>
            Back
          </button>
          <span className="wp-bottombar-count">
            {isAccountStep ? `Step ${TOTAL_STEPS} of ${TOTAL_STEPS}` : `Step ${step + 1} of ${TOTAL_STEPS}`}
          </span>
          {!isAccountStep && (
            <button className="wp-continue-btn" onClick={goNext}>
              Continue
              <Icon name="arrow-right" size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}