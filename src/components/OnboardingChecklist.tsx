// src/components/onboarding/OnboardingChecklist.tsx
//
// Replaces the empty dashboard state for brand-new users with a guided
// checklist: Connect a meeting -> Start your first recording -> Watch a
// sample meeting -> Generate your first AI summary. Real steps (connect,
// record) are detected from actual data (integrations, calls). The sample
// steps are self-contained so a user can get to value in under five
// minutes without needing a real meeting yet.

import { useState, useMemo, useCallback, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  Radio, Mic, PlayCircle, Sparkles, ChevronRight, X,
  Check, Loader2, ArrowRight,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useIntegrations } from "@/hooks/useSettings";
import { useCalls } from "@/hooks/useCalls";

// ─── Sample data used by the "watch a sample meeting" and "generate a
//     summary" steps, so a new user gets a real feel for the product
//     before they've recorded anything themselves. ─────────────────────────
const SAMPLE_TRANSCRIPT = [
  { speaker: "Maria Chen", color: "#0ef5d4", text: "So where are we on the Q2 renewal for Kestrel Logistics?" },
  { speaker: "Daniel Osei", color: "#818cf8", text: "They came back with a question about the per-seat pricing on the Growth tier." },
  { speaker: "Maria Chen", color: "#0ef5d4", text: "Okay, can you send them the volume discount breakdown today?" },
  { speaker: "Daniel Osei", color: "#818cf8", text: "Yes, I will get that over this afternoon and follow up Thursday if we have not heard back." },
];

const SAMPLE_SUMMARY = {
  headline: "Kestrel Logistics renewal, pricing question resolved with a next step",
  sentiment: 84,
  actionItems: [
    "Send the volume discount breakdown to Kestrel Logistics today",
    "Follow up Thursday if no response has been received",
  ],
  keyMoment: "Per-seat pricing raised as a blocker, addressed with a concrete owner and deadline in the same call.",
};

function localStorageKey(userId: string, step: string) {
  return `fixsense_onboard_${step}_${userId}`;
}

type StepId = "connect" | "record" | "watch_sample" | "generate_summary";

export default function OnboardingChecklist({ onDismiss }: { onDismiss?: () => void }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { integrations } = useIntegrations();
  const { data: calls } = useCalls();

  const [dismissed, setDismissed] = useState(false);
  const [sampleOpen, setSampleOpen] = useState(false);
  const [summaryGenerating, setSummaryGenerating] = useState(false);
  const [summaryDone, setSummaryDone] = useState(() =>
    user ? localStorage.getItem(localStorageKey(user.id, "summary")) === "1" : false
  );
  const [sampleWatched, setSampleWatched] = useState(() =>
    user ? localStorage.getItem(localStorageKey(user.id, "sample")) === "1" : false
  );

  const hasConnectedMeeting = useMemo(
    () => (integrations || []).some(i => i.status === "connected"),
    [integrations]
  );
  const hasRecording = (calls?.length || 0) > 0;

  const steps: { id: StepId; icon: typeof Radio; title: string; desc: string; done: boolean }[] = [
    {
      id: "connect",
      icon: Radio,
      title: "Connect a meeting",
      desc: "Link Zoom, Google Meet, or Teams, or use a Fixsense room directly.",
      done: hasConnectedMeeting,
    },
    {
      id: "record",
      icon: Mic,
      title: "Start your first recording",
      desc: "Record a real meeting so Fixsense has something to analyze.",
      done: hasRecording,
    },
    {
      id: "watch_sample",
      icon: PlayCircle,
      title: "Watch a sample meeting",
      desc: "See a real transcript and summary before you record your own.",
      done: sampleWatched,
    },
    {
      id: "generate_summary",
      icon: Sparkles,
      title: "Generate your first AI summary",
      desc: "Turn the sample transcript into a summary in one click.",
      done: summaryDone,
    },
  ];

  const doneCount = steps.filter(s => s.done).length;
  const pct = Math.round((doneCount / steps.length) * 100);
  const allDone = doneCount === steps.length;

  const markSampleWatched = useCallback(() => {
    setSampleWatched(true);
    if (user) localStorage.setItem(localStorageKey(user.id, "sample"), "1");
  }, [user]);

  useEffect(() => {
    if (sampleOpen && !sampleWatched) markSampleWatched();
  }, [sampleOpen, sampleWatched, markSampleWatched]);

  const runSampleSummary = useCallback(() => {
    setSummaryGenerating(true);
    setTimeout(() => {
      setSummaryGenerating(false);
      setSummaryDone(true);
      if (user) localStorage.setItem(localStorageKey(user.id, "summary"), "1");
    }, 1400);
  }, [user]);

  const handleStepClick = (id: StepId) => {
    if (id === "connect") navigate("/dashboard/integrations");
    else if (id === "record") navigate("/live");
    else if (id === "watch_sample") setSampleOpen(true);
    else if (id === "generate_summary") { setSampleOpen(true); if (!summaryDone) runSampleSummary(); }
  };

  const handleDismiss = () => {
    setDismissed(true);
    onDismiss?.();
  };

  if (dismissed) return null;

  return (
    <div className="glass rounded-xl border border-border overflow-hidden onboard-checklist">
      <style>{`
        .onboard-checklist{position:relative;}
        .onboard-progress-track{height:4px;background:hsl(var(--muted));position:relative;overflow:hidden;}
        .onboard-progress-fill{height:100%;background:linear-gradient(90deg,#0ef5d4,rgba(14,245,212,.5));transition:width .5s cubic-bezier(.4,0,.2,1);}
        .onboard-step{display:flex;align-items:flex-start;gap:12px;padding:14px 18px;transition:background .15s;cursor:pointer;border:none;width:100%;text-align:left;background:transparent;}
        .onboard-step:hover{background:hsl(var(--secondary)/0.4);}
        .onboard-step-icon{width:34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:2px;transition:all .2s;}
        .onboard-step-icon.done{background:rgba(34,197,94,.12);color:#22c55e;}
        .onboard-step-icon.pending{background:rgba(14,245,212,.08);color:#0ef5d4;}
        .onboard-modal-backdrop{position:fixed;inset:0;background:rgba(3,5,13,.75);backdrop-filter:blur(6px);z-index:400;display:flex;align-items:center;justify-content:center;padding:20px;animation:onboardFadeIn .18s ease;}
        .onboard-modal{background:#0b0e1a;border:1px solid rgba(255,255,255,.09);border-radius:18px;max-width:520px;width:100%;max-height:85vh;overflow-y:auto;box-shadow:0 40px 100px rgba(0,0,0,.6);animation:onboardSlideUp .22s cubic-bezier(.22,1,.36,1);}
        @keyframes onboardFadeIn{from{opacity:0}to{opacity:1}}
        @keyframes onboardSlideUp{from{opacity:0;transform:translateY(16px) scale(.98)}to{opacity:1;transform:none}}
        @media (prefers-reduced-motion: reduce){.onboard-modal-backdrop,.onboard-modal{animation:none;}}
      `}</style>

      <div className="onboard-progress-track">
        <div className="onboard-progress-fill" style={{ width: `${pct}%` }} />
      </div>

      <div className="flex items-center justify-between px-4 pt-4 pb-1">
        <div>
          <h3 className="font-display font-semibold text-sm">
            {allDone ? "You're set up" : "Get your first AI summary"}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {allDone
              ? "You've completed every step. This checklist will not show again."
              : `${doneCount} of ${steps.length} steps done, about ${Math.max(1, 5 - doneCount)} minutes left`}
          </p>
        </div>
        <button
          onClick={handleDismiss}
          className="p-1.5 rounded-lg hover:bg-secondary/60 text-muted-foreground transition-colors"
          aria-label="Dismiss checklist"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="divide-y divide-border/60 mt-1">
        {steps.map(step => (
          <button key={step.id} className="onboard-step" onClick={() => handleStepClick(step.id)}>
            <div className={`onboard-step-icon ${step.done ? "done" : "pending"}`}>
              {step.done ? <Check className="w-4 h-4" /> : <step.icon className="w-4 h-4" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className={`text-sm font-medium ${step.done ? "text-muted-foreground line-through decoration-1" : ""}`}>
                  {step.title}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{step.desc}</p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-2" />
          </button>
        ))}
      </div>

      {!allDone && (
        <div className="px-4 py-3 border-t border-border/60">
          <Link to="/live" className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-1">
            Skip the checklist, start a real meeting <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      )}

      {sampleOpen && (
        <div className="onboard-modal-backdrop" onClick={() => setSampleOpen(false)}>
          <div className="onboard-modal" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Sample meeting</div>
                <div className="text-sm font-display font-semibold mt-0.5">Kestrel Logistics, Renewal Check-in</div>
              </div>
              <button
                onClick={() => setSampleOpen(false)}
                className="p-1.5 rounded-lg hover:bg-secondary/60 text-muted-foreground transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="space-y-2.5">
                {SAMPLE_TRANSCRIPT.map((line, i) => (
                  <div key={i} className="flex gap-2.5 text-sm">
                    <span className="font-semibold min-w-[92px] flex-shrink-0" style={{ color: line.color }}>{line.speaker}</span>
                    <span className="text-muted-foreground leading-relaxed">{line.text}</span>
                  </div>
                ))}
              </div>

              <div className="pt-3 border-t border-border">
                {!summaryDone && !summaryGenerating && (
                  <button
                    onClick={runSampleSummary}
                    className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground text-sm font-semibold rounded-lg py-2.5 hover:opacity-90 transition-opacity"
                  >
                    <Sparkles className="w-4 h-4" />
                    Generate AI summary
                  </button>
                )}

                {summaryGenerating && (
                  <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-2.5">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Analyzing the conversation
                  </div>
                )}

                {summaryDone && (
                  <div className="space-y-3 animate-in fade-in duration-300">
                    <div className="flex items-center gap-2 text-xs font-semibold text-green-400">
                      <Sparkles className="w-3.5 h-3.5" />
                      Summary ready
                    </div>
                    <div className="bg-secondary/40 rounded-lg p-3 text-sm">
                      {SAMPLE_SUMMARY.headline}
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Action items</div>
                      <div className="space-y-1.5">
                        {SAMPLE_SUMMARY.actionItems.map((a, i) => (
                          <div key={i} className="flex items-start gap-2 text-sm">
                            <Check className="w-3.5 h-3.5 text-green-400 mt-0.5 flex-shrink-0" />
                            {a}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 pt-2">
                      <div className="text-xs text-muted-foreground">Sentiment</div>
                      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-green-400" style={{ width: `${SAMPLE_SUMMARY.sentiment}%` }} />
                      </div>
                      <div className="text-xs font-semibold text-green-400">{SAMPLE_SUMMARY.sentiment}%</div>
                    </div>
                    <button
                      onClick={() => { setSampleOpen(false); navigate("/live"); }}
                      className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground text-sm font-semibold rounded-lg py-2.5 hover:opacity-90 transition-opacity mt-2"
                    >
                      This is what your own meetings will look like. Start a real one
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}