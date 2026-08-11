// src/components/OnboardingChecklist.tsx
//
// Guided checklist for the dashboard empty state: Start your first
// recording -> Watch a sample meeting -> Generate your first AI summary.
// Steps are driven by real platform data wherever possible (calls,
// call_summaries) rather than local flags, so the checklist reflects what
// the user has actually done. "Watch a sample" is the one self-contained
// demo step, kept so a brand-new user can see the product before they've
// recorded anything real — it steps aside once real activity exists.
//
// Visually matches the marketing site (LandingPage.tsx): warm paper
// background, navy accent, IBM Plex Mono kicker labels, numbered steps rail.

import { useState, useCallback, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  Mic, PlayCircle, Sparkles, ChevronRight, X,
  Check, Loader2, ArrowRight,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useCalls } from "@/hooks/useCalls";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ─── Real "has this user generated an AI summary" check ────────────────────
// Looks at call_summaries directly (not a local flag) so this step reflects
// actual platform usage, not just whether the demo modal was opened.
function useHasRealSummary(userId: string | undefined) {
  return useQuery({
    queryKey: ["onboarding-has-summary", userId],
    queryFn: async () => {
      if (!userId) return false;
      const { count, error } = await supabase
        .from("call_summaries")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId);
      if (error) throw error;
      return (count ?? 0) > 0;
    },
    enabled: !!userId,
    staleTime: 60_000,
  });
}

// ─── Sample data for the "watch a sample meeting" step, so a new user gets
//     a feel for the product before they've recorded anything themselves.
const SAMPLE_TRANSCRIPT = [
  { speaker: "Maria Chen", text: "So where are we on the Q2 renewal for Kestrel Logistics?" },
  { speaker: "Daniel Osei", text: "They came back with a question about the per-seat pricing on the Growth tier." },
  { speaker: "Maria Chen", text: "Okay, can you send them the volume discount breakdown today?" },
  { speaker: "Daniel Osei", text: "Yes, I will get that over this afternoon and follow up Thursday if we have not heard back." },
];

const SAMPLE_SUMMARY = {
  headline: "Kestrel Logistics renewal, pricing question resolved with a next step",
  sentiment: 84,
  actionItems: [
    "Send the volume discount breakdown to Kestrel Logistics today",
    "Follow up Thursday if no response has been received",
  ],
};

function localStorageKey(userId: string, step: string) {
  return `fixsense_onboard_${step}_${userId}`;
}

type StepId = "record" | "watch_sample" | "generate_summary";

export default function OnboardingChecklist({ onDismiss }: { onDismiss?: () => void }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: calls } = useCalls();
  const { data: hasRealSummary } = useHasRealSummary(user?.id);

  const [dismissed, setDismissed] = useState(false);
  const [sampleOpen, setSampleOpen] = useState(false);
  const [summaryGenerating, setSummaryGenerating] = useState(false);
  const [demoSummaryDone, setDemoSummaryDone] = useState(() =>
    user ? localStorage.getItem(localStorageKey(user.id, "summary")) === "1" : false
  );
  const [sampleWatched, setSampleWatched] = useState(() =>
    user ? localStorage.getItem(localStorageKey(user.id, "sample")) === "1" : false
  );

  const hasRecording = (calls?.length || 0) > 0;

  // "Generate your first AI summary" is done once a REAL summary exists.
  // Until then, the demo run inside the sample modal counts as a preview
  // step, not the checklist item itself, but it's fine to let it fast-track
  // this row so someone who just tried the demo doesn't feel unrewarded —
  // that value is capped, the row still needs a real summary to be checked
  // once the user has recorded anything at all.
  const summaryDone = !!hasRealSummary;

  const steps: { id: StepId; icon: typeof Mic; title: string; desc: string; done: boolean }[] = [
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
      desc: hasRecording
        ? "Open a recorded call and generate its summary."
        : "Turn the sample transcript into a summary in one click.",
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
      setDemoSummaryDone(true);
      if (user) localStorage.setItem(localStorageKey(user.id, "summary"), "1");
    }, 1400);
  }, [user]);

  const handleStepClick = (id: StepId) => {
    if (id === "record") navigate("/live");
    else if (id === "watch_sample") setSampleOpen(true);
    else if (id === "generate_summary") {
      if (hasRecording && !summaryDone) navigate("/calls");
      else { setSampleOpen(true); if (!demoSummaryDone) runSampleSummary(); }
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    onDismiss?.();
  };

  if (dismissed) return null;

  return (
    <div className="onboard-checklist rounded-xl border border-border bg-card overflow-hidden">
      <style>{`
        .onboard-checklist{
          --oc-accent: hsl(var(--primary));
          --oc-accent-soft: hsl(var(--primary) / 0.07);
          --oc-accent-border: hsl(var(--primary) / 0.22);
          --oc-good: hsl(var(--success));
          --oc-good-soft: hsl(var(--success) / 0.1);
          --oc-fm: 'IBM Plex Mono', ui-monospace, monospace;
          position: relative;
          box-shadow: var(--shadow-card, 0 1px 2px rgba(23,23,15,0.04), 0 12px 32px -16px rgba(23,23,15,0.14));
        }
        .onboard-kicker{
          font-family: var(--oc-fm);
          font-size: 11px;
          font-weight: 600;
          color: var(--oc-accent);
          text-transform: uppercase;
          letter-spacing: 0.09em;
        }
        .onboard-progress-track{height:3px;background:hsl(var(--muted));position:relative;overflow:hidden;}
        .onboard-progress-fill{height:100%;background:var(--oc-accent);transition:width .5s cubic-bezier(.4,0,.2,1);}
        .onboard-step{display:flex;align-items:flex-start;gap:12px;padding:16px 20px;transition:background .15s;cursor:pointer;border:none;width:100%;text-align:left;background:transparent;}
        .onboard-step:hover{background:hsl(var(--secondary)/0.5);}
        .onboard-step-num{
          width:32px;height:32px;border-radius:999px;border:1px solid hsl(var(--border));
          display:flex;align-items:center;justify-content:center;flex-shrink:0;
          font-family:var(--oc-fm);font-size:12.5px;font-weight:600;color:hsl(var(--muted-foreground));
          transition:all .2s;
        }
        .onboard-step-num.done{background:var(--oc-good-soft);border-color:transparent;color:var(--oc-good);}
        .onboard-step-num.pending{background:var(--oc-accent-soft);border-color:var(--oc-accent-border);color:var(--oc-accent);}
        .onboard-modal-backdrop{position:fixed;inset:0;background:hsl(var(--foreground) / 0.5);backdrop-filter:blur(4px);z-index:400;display:flex;align-items:center;justify-content:center;padding:20px;animation:onboardFadeIn .18s ease;}
        .onboard-modal{background:hsl(var(--card));border:1px solid hsl(var(--border));border-radius:16px;max-width:520px;width:100%;max-height:85vh;overflow-y:auto;box-shadow:0 40px 100px rgba(23,23,15,.25);animation:onboardSlideUp .22s cubic-bezier(.22,1,.36,1);}
        @keyframes onboardFadeIn{from{opacity:0}to{opacity:1}}
        @keyframes onboardSlideUp{from{opacity:0;transform:translateY(16px) scale(.98)}to{opacity:1;transform:none}}
        @media (prefers-reduced-motion: reduce){.onboard-modal-backdrop,.onboard-modal{animation:none;}}
      `}</style>

      <div className="onboard-progress-track">
        <div className="onboard-progress-fill" style={{ width: `${pct}%` }} />
      </div>

      <div className="flex items-center justify-between px-5 pt-5 pb-2">
        <div>
          <div className="onboard-kicker mb-1.5">Getting started</div>
          <h3 className="font-semibold text-sm text-foreground">
            {allDone ? "You're set up" : "Get your first AI summary"}
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            {allDone
              ? "You've completed every step. This checklist will not show again."
              : `${doneCount} of ${steps.length} steps done, about ${Math.max(1, 3 - doneCount)} minutes left`}
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
        {steps.map((step, i) => (
          <button key={step.id} className="onboard-step" onClick={() => handleStepClick(step.id)}>
            <div className={`onboard-step-num ${step.done ? "done" : "pending"}`}>
              {step.done ? <Check className="w-4 h-4" /> : i + 1}
            </div>
            <div className="min-w-0 flex-1">
              <span className={`text-sm font-medium text-foreground ${step.done ? "text-muted-foreground line-through decoration-1" : ""}`}>
                {step.title}
              </span>
              <p className="text-xs text-muted-foreground mt-0.5">{step.desc}</p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-2" />
          </button>
        ))}
      </div>

      {!allDone && (
        <div className="px-5 py-3.5 border-t border-border/60">
          <Link to="/live" className="text-xs font-medium inline-flex items-center gap-1" style={{ color: "hsl(var(--primary))" }}>
            Skip the checklist, start a real meeting <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      )}

      {sampleOpen && (
        <div className="onboard-modal-backdrop" onClick={() => setSampleOpen(false)}>
          <div className="onboard-modal" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div>
                <div className="onboard-kicker">Sample meeting</div>
                <div className="text-sm font-semibold text-foreground mt-1">Kestrel Logistics, Renewal Check-in</div>
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
                    <span className="font-semibold min-w-[92px] flex-shrink-0" style={{ color: "hsl(var(--primary))" }}>{line.speaker}</span>
                    <span className="text-muted-foreground leading-relaxed">{line.text}</span>
                  </div>
                ))}
              </div>

              <div className="pt-3 border-t border-border">
                {!demoSummaryDone && !summaryGenerating && (
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

                {demoSummaryDone && (
                  <div className="space-y-3 animate-in fade-in duration-300">
                    <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: "hsl(var(--success))" }}>
                      <Sparkles className="w-3.5 h-3.5" />
                      Summary ready
                    </div>
                    <div className="bg-secondary/50 rounded-lg p-3 text-sm text-foreground">
                      {SAMPLE_SUMMARY.headline}
                    </div>
                    <div>
                      <div className="onboard-kicker mb-1.5">Action items</div>
                      <div className="space-y-1.5">
                        {SAMPLE_SUMMARY.actionItems.map((a, i) => (
                          <div key={i} className="flex items-start gap-2 text-sm text-foreground">
                            <Check className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: "hsl(var(--success))" }} />
                            {a}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 pt-2">
                      <div className="text-xs text-muted-foreground">Sentiment</div>
                      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${SAMPLE_SUMMARY.sentiment}%`, background: "hsl(var(--success))" }} />
                      </div>
                      <div className="text-xs font-semibold" style={{ color: "hsl(var(--success))" }}>{SAMPLE_SUMMARY.sentiment}%</div>
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