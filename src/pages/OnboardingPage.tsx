/**
 * OnboardingPage.tsx
 *
 * First-run experience for new users.
 * Triggered automatically from DashboardHome when:
 *   - profile.onboarding_complete is false/null
 *   - user has no calls yet
 *
 * Visual system matches LandingPage.tsx: warm paper background, deep-navy
 * accent, Inter/IBM Plex Mono type, custom stroke-icon set. Kept in the
 * same visual language on purpose — this is the first authenticated screen
 * a new user sees right after the marketing site, and switching palettes
 * here reads as leaving the product.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

// ─────────────────────────────────────────────────────────────────────────
// Icon set — same stroke icons as LandingPage.tsx, extended with a few
// onboarding-only glyphs (radio, sparkles, target, bar-chart, zap, play,
// skip-forward, loader, chevron-right)
// ─────────────────────────────────────────────────────────────────────────
function Icon({ name, size = 18, strokeWidth = 1.6, className = "" }: { name: string; size?: number; strokeWidth?: number; className?: string }) {
  const p = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, className };
  switch (name) {
    case "video": return <svg {...p}><rect x="2" y="6" width="14" height="12" rx="2" /><path d="M16 10l6-3.5v11L16 14" /></svg>;
    case "brain": return <svg {...p}><path d="M9.5 3a3 3 0 0 0-3 3v.3A3 3 0 0 0 5 9v1.2a3 3 0 0 0-1 5.6V17a3 3 0 0 0 3 3h.5" /><path d="M14.5 3a3 3 0 0 1 3 3v.3a3 3 0 0 1 1.5 2.7v1.2a3 3 0 0 1 1 5.6V17a3 3 0 0 1-3 3h-.5" /><path d="M9.5 3v18M14.5 3v18" /></svg>;
    case "sparkles": return <svg {...p}><path d="M12 3v4M12 17v4M3 12h4M17 12h4" /><path d="M6.5 6.5l2 2M15.5 15.5l2 2M17.5 6.5l-2 2M8.5 15.5l-2 2" strokeOpacity="0.5" /><path d="M12 8l1.3 3.7L17 13l-3.7 1.3L12 18l-1.3-3.7L7 13l3.7-1.3z" /></svg>;
    case "target": return <svg {...p}><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r=".8" fill="currentColor" /></svg>;
    case "skip-forward": return <svg {...p}><polygon points="5 4 15 12 5 20 5 4" /><line x1="19" y1="5" x2="19" y2="19" /></svg>;
    case "chevron-right": return <svg {...p}><polyline points="9 18 15 12 9 6" /></svg>;
    case "play": return <svg {...p} fill="currentColor" stroke="none"><path d="M7 5.5v13a1 1 0 0 0 1.5.87l11-6.5a1 1 0 0 0 0-1.74l-11-6.5A1 1 0 0 0 7 5.5z" /></svg>;
    case "loader": return <svg {...p}><path d="M12 3a9 9 0 1 0 9 9" /></svg>;
    case "radio": return <svg {...p}><circle cx="12" cy="12" r="2.2" /><path d="M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7M5.5 5.5a9.4 9.4 0 0 0 0 13M18.5 5.5a9.4 9.4 0 0 1 0 13" /></svg>;
    case "mic": return <svg {...p}><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0 0 14 0" /><path d="M12 19v3M8 22h8" /></svg>;
    case "users": return <svg {...p}><circle cx="9" cy="8" r="3.2" /><path d="M2.5 21c0-3.6 2.9-6.5 6.5-6.5s6.5 2.9 6.5 6.5" /><circle cx="17.5" cy="8.5" r="2.5" /><path d="M15.5 14.5c2.9.3 5.2 2.7 5.2 5.7" /></svg>;
    case "zap": return <svg {...p}><polygon points="13 2 4 14 11 14 10 22 20 10 13 10 13 2" /></svg>;
    case "bar-chart": return <svg {...p}><line x1="5" y1="21" x2="5" y2="12" /><line x1="12" y1="21" x2="12" y2="7" /><line x1="19" y1="21" x2="19" y2="15" /></svg>;
    case "check": return <svg {...p} strokeWidth={2}><polyline points="20 6 9 17 4 12" /></svg>;
    case "check-square": return <svg {...p}><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M8 12l3 3 5-6" /></svg>;
    default: return null;
  }
}

// ─── Step definitions ──────────────────────────────────────────────────────

const STEPS = [
  {
    id: "live_call",
    icon: "video",
    title: "Start meetings in one click",
    subtitle: "Create a private meeting room, share the link — your prospect joins without any account. AI transcribes both sides live.",
  },
  {
    id: "ai_insights",
    icon: "brain",
    title: "AI works while you talk",
    subtitle: "Real-time objection detection, sentiment tracking, and engagement scoring happen automatically. You stay focused on the conversation.",
  },
  {
    id: "summaries",
    icon: "sparkles",
    title: "Summaries and next actions, ready instantly",
    subtitle: "The moment a call ends, Fixsense generates a full summary, extracts action items, identifies buying signals, and drafts your follow-up email.",
  },
  {
    id: "deals",
    icon: "target",
    title: "Track every deal across all calls",
    subtitle: "Link calls to deals and build a living timeline. The AI compares calls over time, showing what changed, sentiment trends, and your next best action.",
  },
];

const STEP_FEATURES = [
  [
    { icon: "radio", text: "Fixsense-powered private rooms" },
    { icon: "mic", text: "Both sides transcribed in real time" },
    { icon: "users", text: "No account needed for guests" },
    { icon: "video", text: "Host video and mic controls built in" },
  ],
  [
    { icon: "zap", text: "Pricing and timeline objections flagged live" },
    { icon: "bar-chart", text: "Sentiment score updates second by second" },
    { icon: "brain", text: "Talk ratio tracked throughout the call" },
    { icon: "sparkles", text: "AI coaching insights surface in real time" },
  ],
  [
    { icon: "sparkles", text: "Full AI summary generated on call end" },
    { icon: "check-square", text: "Action items extracted automatically" },
    { icon: "target", text: "Follow-up email drafted and ready to send" },
    { icon: "zap", text: "One-click push to HubSpot or Salesforce" },
  ],
  [
    { icon: "target", text: "Deal timeline — all calls in one thread" },
    { icon: "brain", text: "\u201cWhat changed?\u201d AI analysis between calls" },
    { icon: "bar-chart", text: "Sentiment trend: improving, declining, stable" },
    { icon: "sparkles", text: "AI-recommended next best action per deal" },
  ],
];

// ─── Demo preview per step — same dark "product mock" panel used in the
// landing page hero (var(--ink-panel)), so the preview reads as "the
// product," while the surrounding page stays on the light paper surface ───

function StepPreview({ stepId }: { stepId: string }) {
  if (stepId === "live_call") return (
    <div className="ob-mock">
      <div className="ob-mock-bar">
        <span className="ob-mock-bar-title">Acme Corp — Discovery Call</span>
        <span className="ob-mock-live">
          <span className="ob-mock-live-dot" />
          Live · 00:12:41
        </span>
      </div>
      <div className="ob-mock-body">
        {[
          { sp: "You", text: "What's your biggest challenge with the current setup?" },
          { sp: "Alex", text: "Honestly, we're losing deals and don't know why. No visibility." },
          { sp: "You", text: "That's exactly what Fixsense solves. Every call gets analyzed automatically." },
        ].map((l, i) => (
          <div key={i} className="ob-mock-line">
            <span className="ob-mock-speaker">{l.sp}</span>
            <span className="ob-mock-text">{l.text}</span>
          </div>
        ))}
        <div className="ob-mock-status">
          <span className="ob-mock-status-dot" />
          AI transcribing both sides
        </div>
      </div>
    </div>
  );

  if (stepId === "ai_insights") return (
    <div className="ob-mock">
      <div className="ob-mock-bar"><span className="ob-mock-bar-title">Live AI insights</span></div>
      <div className="ob-mock-body">
        <div className="ob-mock-flag">
          <div className="ob-mock-flag-title">Pricing objection · 94% confidence</div>
          <div className="ob-mock-flag-body">Anchor on ROI — teams typically see payback in 6 weeks</div>
        </div>
        <div className="ob-mock-stat-grid">
          {[
            { lbl: "Sentiment", val: "78%" },
            { lbl: "Talk ratio", val: "42/58" },
            { lbl: "Engagement", val: "85%" },
            { lbl: "Objections", val: "1" },
          ].map(s => (
            <div key={s.lbl} className="ob-mock-stat">
              <div className="ob-mock-stat-val">{s.val}</div>
              <div className="ob-mock-stat-lbl">{s.lbl}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  if (stepId === "summaries") return (
    <div className="ob-mock">
      <div className="ob-mock-bar">
        <Icon name="sparkles" size={13} />
        <span className="ob-mock-bar-title">AI summary ready</span>
        <span className="ob-mock-badge">Completed</span>
      </div>
      <div className="ob-mock-body">
        <div className="ob-mock-label">Priority action</div>
        <div className="ob-mock-callout">Send ROI breakdown within 24h — prospect signalled urgency on budget timeline</div>
        <div className="ob-mock-label" style={{ marginTop: 12 }}>Buying signals</div>
        <div className="ob-mock-signals">CFO joining next call · Timeline confirmed · Budget exists</div>
        <div className="ob-mock-push-row">
          <div className="ob-mock-push">Push to HubSpot</div>
          <div className="ob-mock-push">Push to Salesforce</div>
        </div>
      </div>
    </div>
  );

  if (stepId === "deals") return (
    <div className="ob-mock">
      <div className="ob-mock-bar">
        <Icon name="target" size={13} />
        <span className="ob-mock-bar-title">Acme Corp — Enterprise deal</span>
        <span className="ob-mock-trend">Improving</span>
      </div>
      <div className="ob-mock-body">
        {[
          { name: "Discovery call", date: "Mar 3", score: 72 },
          { name: "Product demo", date: "Mar 10", score: 84 },
          { name: "Negotiation", date: "Mar 17", score: 91 },
        ].map((c, i) => (
          <div key={i} className="ob-mock-deal-row">
            <span className="ob-mock-deal-dot" />
            <span className="ob-mock-deal-name">{c.name}</span>
            <span className="ob-mock-deal-date">{c.date}</span>
            <span className="ob-mock-deal-score">{c.score}</span>
          </div>
        ))}
        <div className="ob-mock-changed">
          <div className="ob-mock-changed-title">What changed</div>
          <div className="ob-mock-changed-body">Pricing objection resolved · New stakeholder: CFO · Sentiment +7pts</div>
        </div>
      </div>
    </div>
  );

  return null;
}

// ─── Main component ────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  const currentStep = STEPS[step];
  const features = STEP_FEATURES[step];
  const isLast = step === STEPS.length - 1;
  const progressPct = ((step + 1) / STEPS.length) * 100;

  const markComplete = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          onboarding_complete: true,
          updated_at: new Date().toISOString(),
        } as any)
        .eq("id", user.id);

      if (error) console.warn("Could not update onboarding_complete:", error.message);

      toast.success("You're all set! Start your first call.");
      navigate("/live", { replace: true });
    } catch (err) {
      console.error("Onboarding finish error:", err);
      toast.error("Something went wrong.");
      navigate("/dashboard", { replace: true });
    } finally {
      setSaving(false);
    }
  };

  const skip = () => {
    if (user) {
      supabase
        .from("profiles")
        .update({ onboarding_complete: true, updated_at: new Date().toISOString() } as any)
        .eq("id", user.id)
        .then(({ error }) => {
          if (error) console.warn("Skip: could not mark onboarding complete:", error.message);
        });
    }
    navigate("/dashboard", { replace: true });
  };

  // ── CSS — same tokens as LandingPage.tsx (.lp): warm paper background,
  // deep-navy accent, Inter + IBM Plex Mono. The dark "product mock" panel
  // reuses --ink-panel exactly as the landing page hero does.
  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,400;0,14..32,500;0,14..32,600;0,14..32,700;0,14..32,800&family=IBM+Plex+Mono:wght@500&display=swap');

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
      --touch:44px;
      --radius-s:6px;--radius-m:10px;--radius-l:14px;
    }
    @media (prefers-reduced-motion: reduce){
      .ob *{animation-duration:.001ms!important;animation-iteration-count:1!important;transition-duration:.001ms!important;}
    }

    .ob{min-height:100vh;background:var(--paper);color:var(--ink);font-family:var(--fb);-webkit-font-smoothing:antialiased;display:flex;flex-direction:column;}
    .ob :focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:3px;}
    @keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
    @keyframes slideIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
    @keyframes obpulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(.85)}}
    @keyframes obblink{0%,49%{opacity:1}50%,100%{opacity:0}}
    @keyframes obspin{to{transform:rotate(360deg)}}

    /* ── nav ── */
    .ob-nav{height:60px;display:flex;align-items:center;justify-content:space-between;padding:0 22px;border-bottom:1px solid var(--border);flex-shrink:0;background:rgba(250,250,248,.92);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);position:sticky;top:0;z-index:20;}
    .ob-logo{display:flex;align-items:center;gap:9px;text-decoration:none;min-height:var(--touch);}
    .ob-logo-img{width:26px;height:26px;border-radius:6px;object-fit:cover;display:block;}
    .ob-logo-name{font-size:15.5px;font-weight:700;color:var(--ink)!important;letter-spacing:-.01em;}
    .ob-skip{display:flex;align-items:center;gap:6px;background:none;border:1px solid var(--border-strong);border-radius:var(--radius-s);cursor:pointer;font-size:13px;font-weight:500;color:var(--ink2);font-family:var(--fb);padding:8px 14px;min-height:var(--touch);transition:border-color .15s,color .15s,background .15s;}
    .ob-skip:hover{border-color:var(--ink);color:var(--ink);background:rgba(23,23,15,.02);}

    /* ── body layout ── */
    .ob-body{flex:1;display:grid;grid-template-columns:1fr 1fr;max-width:1180px;margin:0 auto;width:100%;padding:56px 22px 80px;gap:64px;align-items:start;}

    /* ── progress + step pills ── */
    .ob-progress{margin-bottom:28px;}
    .ob-progress-row{display:flex;justify-content:space-between;align-items:center;margin-bottom:9px;}
    .ob-progress-label{font-family:var(--fm);font-size:11px;font-weight:600;color:var(--faint);text-transform:uppercase;letter-spacing:.08em;}
    .ob-progress-bar{height:3px;background:var(--border);border-radius:2px;overflow:hidden;}
    .ob-progress-fill{height:100%;background:var(--accent);border-radius:2px;transition:width .5s cubic-bezier(.4,0,.2,1);}
    .ob-step-pills{display:flex;gap:6px;margin-bottom:32px;}
    .ob-pill{width:8px;height:8px;border-radius:50%;border:1.5px solid var(--border-strong);background:transparent;transition:all .25s;}
    .ob-pill--done{background:var(--accent);border-color:var(--accent);opacity:.45;}
    .ob-pill--active{background:var(--accent);border-color:var(--accent);width:22px;border-radius:4px;}

    /* ── step content ── */
    .ob-content{animation:fadeUp .45s cubic-bezier(0.16,1,0.3,1) both;}
    .ob-icon-wrap{width:48px;height:48px;border-radius:var(--radius-m);background:var(--accent-soft);border:1px solid var(--accent-border);display:flex;align-items:center;justify-content:center;color:var(--accent);margin-bottom:20px;}
    .ob-step-num{font-family:var(--fm);font-size:11px;font-weight:600;color:var(--faint);text-transform:uppercase;letter-spacing:.09em;margin-bottom:10px;}
    .ob-title{font-size:clamp(23px,2.8vw,32px);font-weight:700;color:var(--ink);letter-spacing:-.03em;line-height:1.14;margin-bottom:14px;}
    .ob-subtitle{font-size:15px;color:var(--ink2);line-height:1.68;margin-bottom:30px;max-width:440px;}

    .ob-features{display:flex;flex-direction:column;gap:11px;margin-bottom:32px;}
    .ob-feat{display:flex;align-items:center;gap:11px;font-size:13.5px;color:var(--ink2);}
    .ob-feat-icon{width:28px;height:28px;border-radius:var(--radius-s);display:flex;align-items:center;justify-content:center;background:var(--paper2);border:1px solid var(--border);color:var(--ink2);flex-shrink:0;}

    .ob-actions{display:flex;align-items:center;gap:10px;}
    .ob-btn-back{background:transparent;border:1px solid var(--border-strong);border-radius:var(--radius-s);padding:12px 20px;font-size:13.5px;font-weight:600;color:var(--ink2);cursor:pointer;font-family:var(--fb);transition:border-color .15s,background .15s,color .15s;min-height:48px;}
    .ob-btn-back:hover{border-color:var(--ink);background:rgba(23,23,15,.02);color:var(--ink);}
    .ob-btn-next{display:inline-flex;align-items:center;justify-content:center;gap:8px;background:var(--accent);border:1px solid var(--accent);border-radius:var(--radius-s);padding:13px 24px;font-size:14.5px;font-weight:600;color:var(--accent-ink)!important;cursor:pointer;font-family:var(--fb);transition:opacity .15s,transform .12s;min-height:48px;}
    .ob-btn-next:hover{opacity:.9;}
    .ob-btn-next:active{transform:scale(.985);}
    .ob-btn-next:disabled{opacity:.55;cursor:not-allowed;transform:none;}
    .ob-spin{animation:obspin 1s linear infinite;}

    .ob-skiplink{margin-top:14px;font-size:12.5px;color:var(--muted);text-align:center;}
    .ob-skiplink button{background:none;border:none;color:var(--ink2);cursor:pointer;font-size:12.5px;text-decoration:underline;font-family:var(--fb);}

    /* ── right: preview panel ── */
    .ob-right{position:sticky;top:92px;animation:slideIn .45s cubic-bezier(0.16,1,0.3,1) .08s both;}
    .ob-preview-header{margin-bottom:16px;}
    .ob-preview-label{font-family:var(--fm);font-size:11px;font-weight:600;color:var(--faint);text-transform:uppercase;letter-spacing:.09em;margin-bottom:6px;}
    .ob-preview-title{font-size:15.5px;font-weight:700;color:var(--ink);letter-spacing:-.01em;}

    /* ── dark product mock (matches .mock on the landing page) ── */
    .ob-mock{background:var(--ink-panel);border-radius:var(--radius-l);overflow:hidden;box-shadow:0 1px 2px rgba(0,0,0,.04), 0 24px 64px -24px rgba(20,20,15,.35), 0 0 0 1px rgba(20,20,15,.04);}
    .ob-mock-bar{display:flex;align-items:center;gap:7px;padding:12px 16px;background:rgba(255,255,255,.03);border-bottom:1px solid rgba(255,255,255,.08);}
    .ob-mock-bar-title{font-size:12.5px;font-weight:600;color:rgba(255,255,255,.75);}
    .ob-mock-live{display:flex;align-items:center;gap:6px;margin-left:auto;font-family:var(--fm);font-size:11px;font-weight:600;color:#E8998A;}
    .ob-mock-live-dot{width:6px;height:6px;border-radius:50%;background:#E8998A;animation:obpulse 1.4s ease infinite;}
    .ob-mock-badge{margin-left:auto;font-family:var(--fm);font-size:10px;font-weight:600;color:#7FB89C;background:rgba(47,107,79,.14);border:1px solid rgba(47,107,79,.3);border-radius:20px;padding:3px 9px;}
    .ob-mock-trend{margin-left:auto;font-size:11px;color:#7FB89C;font-weight:500;}

    .ob-mock-body{padding:18px 20px;display:flex;flex-direction:column;gap:10px;}
    .ob-mock-line{display:flex;gap:9px;}
    .ob-mock-speaker{font-size:11px;font-weight:700;color:rgba(255,255,255,.5);min-width:30px;flex-shrink:0;padding-top:1px;}
    .ob-mock-text{font-size:13px;color:rgba(255,255,255,.75);line-height:1.55;}
    .ob-mock-status{display:flex;align-items:center;gap:6px;margin-top:4px;font-size:11px;color:rgba(255,255,255,.4);}
    .ob-mock-status-dot{width:6px;height:6px;border-radius:50%;background:var(--good);}

    .ob-mock-flag{background:rgba(138,90,32,.08);border:1px solid rgba(138,90,32,.25);border-left:3px solid #C88A3E;border-radius:0 var(--radius-s) var(--radius-s) 0;padding:11px 13px;}
    .ob-mock-flag-title{font-family:var(--fm);font-size:10.5px;font-weight:600;color:#D9A15C;text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px;}
    .ob-mock-flag-body{font-size:12px;color:rgba(255,255,255,.68);line-height:1.5;}
    .ob-mock-stat-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:2px;}
    .ob-mock-stat{background:rgba(255,255,255,.03);border-radius:var(--radius-s);padding:10px 12px;text-align:center;}
    .ob-mock-stat-val{font-size:17px;font-weight:700;color:#fff;letter-spacing:-.01em;}
    .ob-mock-stat-lbl{font-size:10.5px;color:rgba(255,255,255,.38);margin-top:2px;}

    .ob-mock-label{font-family:var(--fm);font-size:10.5px;font-weight:600;color:rgba(255,255,255,.35);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;}
    .ob-mock-callout{font-size:12.5px;color:rgba(255,255,255,.78);line-height:1.55;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);border-radius:var(--radius-s);padding:10px 12px;}
    .ob-mock-signals{font-size:11.5px;color:#7FB89C;line-height:1.6;}
    .ob-mock-push-row{display:flex;gap:8px;margin-top:4px;}
    .ob-mock-push{flex:1;padding:9px 10px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);border-radius:var(--radius-s);font-size:11.5px;color:rgba(255,255,255,.7);text-align:center;font-weight:600;}

    .ob-mock-deal-row{display:flex;align-items:center;gap:10px;}
    .ob-mock-deal-dot{width:7px;height:7px;border-radius:50%;background:rgba(255,255,255,.3);flex-shrink:0;}
    .ob-mock-deal-name{font-size:12.5px;color:rgba(255,255,255,.72);flex:1;}
    .ob-mock-deal-date{font-family:var(--fm);font-size:10.5px;color:rgba(255,255,255,.32);}
    .ob-mock-deal-score{font-size:13px;font-weight:700;color:#fff;min-width:26px;text-align:right;}
    .ob-mock-changed{margin-top:6px;padding:11px 13px;background:var(--accent-soft);border:1px solid rgba(255,255,255,.1);border-radius:var(--radius-s);}
    .ob-mock-changed-title{font-family:var(--fm);font-size:10.5px;font-weight:600;color:#8FA6D6;text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px;}
    .ob-mock-changed-body{font-size:11.5px;color:rgba(255,255,255,.55);line-height:1.55;}

    /* ── responsive ── */
    .ob-step-nav{display:none;}
    @media(max-width:900px){
      .ob-body{grid-template-columns:1fr;gap:36px;padding:40px 18px 72px;}
      .ob-right{position:static;}
      .ob-step-nav{display:flex;gap:6px;margin-bottom:22px;}
    }
    @media(max-width:560px){
      .ob-nav{padding:0 16px;}
      .ob-title{font-size:23px;}
      .ob-subtitle{font-size:14px;}
      .ob-actions{flex-direction:column-reverse;align-items:stretch;}
      .ob-btn-back,.ob-btn-next{width:100%;justify-content:center;}
    }
  `;

  return (
    <div className="ob">
      <style>{css}</style>

      {/* Nav */}
      <nav className="ob-nav">
        <a href="/" className="ob-logo">
          <img src="/fixsense_icon_logo (2).png" alt="Fixsense" className="ob-logo-img" />
          <span className="ob-logo-name">Fixsense</span>
        </a>
        <button className="ob-skip" onClick={skip}>
          <Icon name="skip-forward" size={13} />
          Skip to dashboard
        </button>
      </nav>

      {/* Body */}
      <div className="ob-body">
        {/* Left — content */}
        <div>
          {/* Progress */}
          <div className="ob-progress">
            <div className="ob-progress-row">
              <span className="ob-progress-label">Getting started</span>
              <span className="ob-progress-label">{step + 1} of {STEPS.length}</span>
            </div>
            <div className="ob-progress-bar">
              <div className="ob-progress-fill" style={{ width: `${progressPct}%` }} />
            </div>
          </div>

          {/* Step pills */}
          <div className="ob-step-pills">
            {STEPS.map((_, i) => (
              <div key={i} className={`ob-pill ${i < step ? "ob-pill--done" : i === step ? "ob-pill--active" : ""}`} />
            ))}
          </div>

          {/* Step content */}
          <div className="ob-content" key={step}>
            <div className="ob-icon-wrap">
              <Icon name={currentStep.icon} size={22} strokeWidth={1.6} />
            </div>

            <div className="ob-step-num">Step {step + 1} — {currentStep.id.replace("_", " ")}</div>
            <h2 className="ob-title">{currentStep.title}</h2>
            <p className="ob-subtitle">{currentStep.subtitle}</p>

            <div className="ob-features">
              {features.map(({ icon, text }, i) => (
                <div key={i} className="ob-feat">
                  <div className="ob-feat-icon"><Icon name={icon} size={13} /></div>
                  {text}
                </div>
              ))}
            </div>

            <div className="ob-actions">
              {step > 0 && (
                <button className="ob-btn-back" onClick={() => setStep(s => s - 1)}>
                  Back
                </button>
              )}
              <button
                className="ob-btn-next"
                onClick={() => { if (isLast) markComplete(); else setStep(s => s + 1); }}
                disabled={saving}
              >
                {saving ? (
                  <><Icon name="loader" size={15} className="ob-spin" /> Setting up…</>
                ) : isLast ? (
                  <><Icon name="play" size={13} /> Start my first call</>
                ) : (
                  <>Next <Icon name="chevron-right" size={14} /></>
                )}
              </button>
            </div>

            {isLast && (
              <p className="ob-skiplink">
                You can also{" "}
                <button onClick={skip}>explore the dashboard first</button>
              </p>
            )}
          </div>
        </div>

        {/* Right — live preview */}
        <div className="ob-right">
          <div className="ob-preview-header">
            <div className="ob-preview-label">See it in action</div>
            <div className="ob-preview-title">{currentStep.title}</div>
          </div>
          <StepPreview stepId={currentStep.id} key={currentStep.id} />
        </div>
      </div>
    </div>
  );
}