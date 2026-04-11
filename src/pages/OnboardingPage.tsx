/**
 * OnboardingPage.tsx
 *
 * First-run experience for new users.
 * Triggered automatically from DashboardHome when:
 *   - profile.onboarding_complete is false/null
 *   - user has no calls yet
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CheckCircle2, Loader2, ArrowRight,
  Video, Zap, Brain, BarChart3, SkipForward,
  Mic, Radio, Sparkles, Target, Users,
  ChevronRight, Play,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

// ─── Step definitions ─────────────────────────────────────────────────────────

const STEPS = [
  {
    id: "live_call",
    icon: Video,
    title: "Start meetings in one click",
    subtitle: "Create a private 100ms meeting room, share the link — your prospect joins without any account. AI transcribes both sides live.",
    color: "text-primary",
    bg: "bg-primary/10",
    borderColor: "border-primary/20",
  },
  {
    id: "ai_insights",
    icon: Brain,
    title: "AI works while you talk",
    subtitle: "Real-time objection detection, sentiment tracking, and engagement scoring happen automatically. You stay focused on the conversation.",
    color: "text-accent",
    bg: "bg-accent/10",
    borderColor: "border-accent/20",
  },
  {
    id: "summaries",
    icon: Sparkles,
    title: "Summaries & next actions ready instantly",
    subtitle: "The moment a call ends, Fixsense generates a full summary, extracts action items, identifies buying signals, and drafts your follow-up email.",
    color: "text-purple-400",
    bg: "bg-purple-500/10",
    borderColor: "border-purple-500/20",
  },
  {
    id: "deals",
    icon: Target,
    title: "Track every deal across all calls",
    subtitle: "Link calls to deals and build a living timeline. The AI compares calls over time — showing what changed, sentiment trends, and your next best action.",
    color: "text-green-400",
    bg: "bg-green-500/10",
    borderColor: "border-green-500/20",
  },
];

// ─── Feature highlights per step ─────────────────────────────────────────────

const STEP_FEATURES = [
  [
    { icon: Radio, text: "100ms-powered private rooms" },
    { icon: Mic, text: "Both sides transcribed in real time" },
    { icon: Users, text: "No account needed for guests" },
    { icon: Video, text: "Host video + mic controls built in" },
  ],
  [
    { icon: Zap, text: "Pricing & timeline objections flagged live" },
    { icon: BarChart3, text: "Sentiment score updates second by second" },
    { icon: Brain, text: "Talk ratio tracked throughout the call" },
    { icon: Sparkles, text: "AI coaching insights surface in real time" },
  ],
  [
    { icon: Sparkles, text: "Full AI summary generated on call end" },
    { icon: CheckCircle2, text: "Action items extracted automatically" },
    { icon: Target, text: "Follow-up email drafted and ready to send" },
    { icon: Zap, text: "One-click push to HubSpot or Salesforce" },
  ],
  [
    { icon: Target, text: "Deal Timeline — all calls in one thread" },
    { icon: Brain, text: "'What Changed?' AI analysis between calls" },
    { icon: BarChart3, text: "Sentiment trend: improving, declining, stable" },
    { icon: Sparkles, text: "AI recommended next best actions per deal" },
  ],
];

// ─── Demo preview per step ────────────────────────────────────────────────────

function StepPreview({ stepId }: { stepId: string }) {
  if (stepId === "live_call") return (
    <div style={{
      background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)",
      borderRadius: 14, overflow: "hidden",
    }}>
      <div style={{ padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,.07)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,.7)" }}>Acme Corp — Discovery Call</span>
        <span style={{ display: "flex", alignItems: "center", gap: 5, background: "rgba(239,68,68,.12)", border: "1px solid rgba(239,68,68,.2)", borderRadius: 20, padding: "2px 9px", fontSize: 10, fontWeight: 700, color: "#f87171" }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#ef4444", display: "inline-block", animation: "pulse 1.4s ease infinite" }} />
          LIVE
        </span>
      </div>
      <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
        {[
          { sp: "You", color: "#818cf8", text: "What's your biggest challenge with the current setup?" },
          { sp: "Alex", color: "#2dd4bf", text: "Honestly, we're losing deals and don't know why. No visibility." },
          { sp: "You", color: "#818cf8", text: "That's exactly what Fixsense solves. Every call gets analyzed automatically." },
        ].map((l, i) => (
          <div key={i} style={{ display: "flex", gap: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: l.color, minWidth: 28, paddingTop: 1 }}>{l.sp}</span>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,.6)", lineHeight: 1.5 }}>{l.text}</span>
          </div>
        ))}
        <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 4 }}>
          <span style={{ fontSize: 10, color: "rgba(255,255,255,.3)", display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", display: "inline-block" }} />
            AI transcribing both sides
          </span>
        </div>
      </div>
    </div>
  );

  if (stepId === "ai_insights") return (
    <div style={{
      background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)",
      borderRadius: 14, overflow: "hidden",
    }}>
      <div style={{ padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,.07)" }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,.7)" }}>Live AI Insights</span>
      </div>
      <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ background: "rgba(245,158,11,.07)", border: "1px solid rgba(245,158,11,.2)", borderLeft: "3px solid #f59e0b", borderRadius: "0 9px 9px 0", padding: "9px 12px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#fbbf24", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 3 }}>⚠ Pricing Objection · 94% confidence</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,.65)" }}>💡 Anchor on ROI — teams typically see payback in 6 weeks</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
          {[
            { lbl: "Sentiment", val: "78%", color: "#22c55e" },
            { lbl: "Talk Ratio", val: "42/58", color: "#818cf8" },
            { lbl: "Engagement", val: "85%", color: "#0ef5d4" },
            { lbl: "Objections", val: "1", color: "#f59e0b" },
          ].map(s => (
            <div key={s.lbl} style={{ background: "rgba(255,255,255,.03)", borderRadius: 8, padding: "8px 10px", textAlign: "center" }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: s.color }}>{s.val}</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,.3)" }}>{s.lbl}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  if (stepId === "summaries") return (
    <div style={{
      background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)",
      borderRadius: 14, overflow: "hidden",
    }}>
      <div style={{ padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,.07)", display: "flex", alignItems: "center", gap: 7 }}>
        <Sparkles style={{ width: 13, height: 13, color: "#a78bfa" }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,.7)" }}>AI Summary Ready</span>
        <span style={{ marginLeft: "auto", fontSize: 10, background: "rgba(34,197,94,.1)", color: "#22c55e", border: "1px solid rgba(34,197,94,.2)", borderRadius: 20, padding: "2px 8px" }}>Completed</span>
      </div>
      <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 9 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,.3)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 4 }}>Priority Action</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,.75)", lineHeight: 1.5, background: "rgba(14,245,212,.05)", border: "1px solid rgba(14,245,212,.15)", borderRadius: 8, padding: "8px 10px" }}>
            Send ROI breakdown within 24h — prospect signalled urgency on budget timeline
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,.3)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 4 }}>Buying Signals</div>
          <div style={{ fontSize: 11, color: "#22c55e" }}>✓ CFO joining next call &nbsp; ✓ Timeline confirmed &nbsp; ✓ Budget exists</div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <div style={{ flex: 1, padding: "7px 10px", background: "rgba(255,122,89,.1)", border: "1px solid rgba(255,122,89,.2)", borderRadius: 8, fontSize: 11, color: "#FF7A59", textAlign: "center", fontWeight: 600 }}>Push to HubSpot</div>
          <div style={{ flex: 1, padding: "7px 10px", background: "rgba(0,161,224,.1)", border: "1px solid rgba(0,161,224,.2)", borderRadius: 8, fontSize: 11, color: "#00A1E0", textAlign: "center", fontWeight: 600 }}>Push to Salesforce</div>
        </div>
      </div>
    </div>
  );

  if (stepId === "deals") return (
    <div style={{
      background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)",
      borderRadius: 14, overflow: "hidden",
    }}>
      <div style={{ padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,.07)", display: "flex", alignItems: "center", gap: 7 }}>
        <Target style={{ width: 13, height: 13, color: "#60a5fa" }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,.7)" }}>Acme Corp — Enterprise Deal</span>
        <span style={{ marginLeft: "auto", fontSize: 10, color: "#22c55e", display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#22c55e", display: "inline-block" }} /> Improving
        </span>
      </div>
      <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 7 }}>
        {[
          { name: "Discovery Call", date: "Mar 3", score: 72, color: "#f59e0b" },
          { name: "Product Demo", date: "Mar 10", score: 84, color: "#22c55e" },
          { name: "Negotiation", date: "Mar 17", score: 91, color: "#0ef5d4" },
        ].map((c, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: c.color, flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: "rgba(255,255,255,.65)", flex: 1 }}>{c.name}</span>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,.3)" }}>{c.date}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: c.color, minWidth: 28, textAlign: "right" }}>{c.score}</span>
          </div>
        ))}
        <div style={{ marginTop: 4, padding: "9px 11px", background: "rgba(139,92,246,.06)", border: "1px solid rgba(139,92,246,.15)", borderRadius: 9 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#a78bfa", marginBottom: 4 }}>✨ What Changed</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,.5)", lineHeight: 1.5 }}>Pricing objection resolved · New stakeholder: CFO · Sentiment +7pts</div>
        </div>
      </div>
    </div>
  );

  return null;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  const currentStep = STEPS[step];
  const Icon = currentStep.icon;
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
      navigate("/dashboard/live", { replace: true });
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

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@600;700;800&family=DM+Sans:wght@300;400;500;600&display=swap');
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(.85)} }
    @keyframes fadeUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
    @keyframes slideIn { from{opacity:0;transform:translateX(12px)} to{opacity:1;transform:translateX(0)} }
    .ob-page {
      min-height: 100vh; background: #060912; color: #f0f6fc;
      font-family: 'DM Sans', system-ui, sans-serif;
      -webkit-font-smoothing: antialiased;
      display: flex; flex-direction: column;
    }
    .ob-nav {
      display: flex; align-items: center; justify-content: space-between;
      padding: 0 24px; height: 56px; flex-shrink: 0;
      border-bottom: 1px solid rgba(255,255,255,.06);
      background: rgba(6,9,18,.95); backdrop-filter: blur(20px);
    }
    .ob-logo { display: flex; align-items: center; gap: 9px; text-decoration: none; }
    .ob-logo-img { width: 28px; height: 28px; border-radius: 8px; object-fit: cover; }
    .ob-logo-name { font-family: 'Bricolage Grotesque', sans-serif; font-size: 16px; font-weight: 700; color: #f0f6fc; letter-spacing: -.03em; }
    .ob-skip { display: flex; align-items: center; gap: 5px; background: none; border: none; cursor: pointer; font-size: 13px; color: rgba(255,255,255,.35); font-family: 'DM Sans', sans-serif; transition: color .15s; }
    .ob-skip:hover { color: rgba(255,255,255,.6); }
    .ob-body {
      flex: 1; display: grid; grid-template-columns: 1fr 1fr;
      max-width: 1100px; margin: 0 auto; width: 100%;
      padding: 48px 24px 80px; gap: 64px; align-items: start;
    }
    .ob-left { display: flex; flex-direction: column; gap: 0; }
    .ob-progress { margin-bottom: 32px; }
    .ob-progress-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
    .ob-progress-label { font-size: 12px; color: rgba(255,255,255,.38); }
    .ob-progress-bar { height: 3px; background: rgba(255,255,255,.07); border-radius: 2px; overflow: hidden; }
    .ob-progress-fill { height: 100%; background: linear-gradient(90deg, #0ef5d4, rgba(14,245,212,.5)); border-radius: 2px; transition: width .5s cubic-bezier(.4,0,.2,1); }
    .ob-step-pills { display: flex; gap: 6px; margin-bottom: 36px; }
    .ob-pill { width: 8px; height: 8px; border-radius: 50%; border: 1.5px solid rgba(255,255,255,.12); background: transparent; transition: all .25s; }
    .ob-pill--done { background: rgba(14,245,212,.5); border-color: transparent; }
    .ob-pill--active { background: #0ef5d4; border-color: transparent; box-shadow: 0 0 8px rgba(14,245,212,.6); width: 24px; border-radius: 4px; }
    .ob-content { animation: fadeUp .4s ease both; }
    .ob-icon-wrap { width: 52px; height: 52px; border-radius: 14px; display: flex; align-items: center; justify-content: center; margin-bottom: 20px; }
    .ob-step-num { font-size: 11px; font-weight: 700; color: rgba(255,255,255,.35); text-transform: uppercase; letter-spacing: .1em; margin-bottom: 8px; }
    .ob-title { font-family: 'Bricolage Grotesque', sans-serif; font-size: clamp(22px,3vw,30px); font-weight: 800; color: #f0f6fc; letter-spacing: -.04em; line-height: 1.15; margin-bottom: 12px; }
    .ob-subtitle { font-size: 15px; color: rgba(255,255,255,.5); line-height: 1.7; margin-bottom: 32px; max-width: 440px; }
    .ob-features { display: flex; flex-direction: column; gap: 10px; margin-bottom: 36px; }
    .ob-feat { display: flex; align-items: center; gap: 10px; font-size: 13px; color: rgba(255,255,255,.65); }
    .ob-feat-icon { width: 28px; height: 28px; border-radius: 8px; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.08); flex-shrink: 0; }
    .ob-actions { display: flex; align-items: center; gap: 12px; }
    .ob-btn-back { background: transparent; border: 1px solid rgba(255,255,255,.1); border-radius: 10px; padding: 11px 20px; font-size: 14px; font-weight: 500; color: rgba(255,255,255,.4); cursor: pointer; font-family: 'DM Sans', sans-serif; transition: all .15s; }
    .ob-btn-back:hover { border-color: rgba(255,255,255,.2); color: rgba(255,255,255,.7); }
    .ob-btn-next { display: flex; align-items: center; gap: 7px; background: #0ef5d4; border: none; border-radius: 10px; padding: 12px 24px; font-size: 14px; font-weight: 700; color: #060912; cursor: pointer; font-family: 'DM Sans', sans-serif; transition: all .15s; box-shadow: 0 4px 18px rgba(14,245,212,.3); }
    .ob-btn-next:hover { opacity: .88; transform: translateY(-1px); box-shadow: 0 6px 24px rgba(14,245,212,.4); }
    .ob-btn-next:disabled { opacity: .5; cursor: not-allowed; transform: none; }
    .ob-right { position: sticky; top: 80px; animation: slideIn .4s ease .1s both; }
    .ob-preview-header { margin-bottom: 16px; }
    .ob-preview-label { font-size: 11px; font-weight: 700; color: rgba(255,255,255,.25); text-transform: uppercase; letter-spacing: .1em; margin-bottom: 6px; }
    .ob-preview-title { font-family: 'Bricolage Grotesque', sans-serif; font-size: 16px; font-weight: 700; color: rgba(255,255,255,.7); }
    .ob-step-nav { display: none; }
    @media (max-width: 900px) {
      .ob-body { grid-template-columns: 1fr; gap: 32px; padding: 32px 16px 80px; }
      .ob-right { position: static; }
      .ob-step-nav { display: flex; gap: 6px; margin-bottom: 20px; }
    }
    @media (max-width: 600px) {
      .ob-title { font-size: 22px; }
      .ob-subtitle { font-size: 14px; }
      .ob-actions { flex-direction: column-reverse; align-items: stretch; }
      .ob-btn-back, .ob-btn-next { width: 100%; justify-content: center; }
    }
  `;

  return (
    <div className="ob-page">
      <style>{css}</style>

      {/* Nav */}
      <nav className="ob-nav">
        <a href="/" className="ob-logo">
          <img src="/fixsense_icon_logo (2).png" alt="Fixsense" className="ob-logo-img" />
          <span className="ob-logo-name">Fixsense</span>
        </a>
        <button className="ob-skip" onClick={skip}>
          <SkipForward style={{ width: 13, height: 13 }} />
          Skip to dashboard
        </button>
      </nav>

      {/* Body */}
      <div className="ob-body">

        {/* Left — content */}
        <div className="ob-left">

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
              <div
                key={i}
                className={`ob-pill ${i < step ? "ob-pill--done" : i === step ? "ob-pill--active" : ""}`}
              />
            ))}
          </div>

          {/* Step content */}
          <div className="ob-content" key={step}>
            <div
              className="ob-icon-wrap"
              style={{ background: `${currentStep.bg}`, border: `1px solid`, borderColor: currentStep.borderColor.replace("border-", "").replace("/20", "").replace("primary", "rgba(14,245,212,.2)").replace("accent", "rgba(245,158,11,.2)").replace("purple-500", "rgba(139,92,246,.2)").replace("green-500", "rgba(34,197,94,.2)") }}
            >
              <Icon className={`w-6 h-6 ${currentStep.color}`} />
            </div>

            <div className="ob-step-num">Step {step + 1} — {currentStep.id.replace("_", " ")}</div>
            <h2 className="ob-title">{currentStep.title}</h2>
            <p className="ob-subtitle">{currentStep.subtitle}</p>

            <div className="ob-features">
              {features.map(({ icon: FeatIcon, text }, i) => (
                <div key={i} className="ob-feat">
                  <div className="ob-feat-icon">
                    <FeatIcon style={{ width: 13, height: 13, color: "rgba(255,255,255,.5)" }} />
                  </div>
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
                onClick={() => {
                  if (isLast) markComplete();
                  else setStep(s => s + 1);
                }}
                disabled={saving}
              >
                {saving ? (
                  <><Loader2 style={{ width: 15, height: 15, animation: "spin 1s linear infinite" }} /> Setting up…</>
                ) : isLast ? (
                  <><Play style={{ width: 14, height: 14 }} /> Start my first call</>
                ) : (
                  <>Next <ChevronRight style={{ width: 14, height: 14 }} /></>
                )}
              </button>
            </div>

            {isLast && (
              <p style={{ marginTop: 12, fontSize: 12, color: "rgba(255,255,255,.25)", textAlign: "center" }}>
                You can also{" "}
                <button onClick={skip} style={{ background: "none", border: "none", color: "rgba(255,255,255,.4)", cursor: "pointer", fontSize: 12, textDecoration: "underline", fontFamily: "'DM Sans', sans-serif" }}>
                  explore the dashboard first
                </button>
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

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}