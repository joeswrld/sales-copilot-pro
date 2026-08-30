// src/components/OnboardingChecklist.tsx
//
// Recruiting-native activation checklist for the dashboard empty state:
// Post your first job -> Add candidates -> Get your first AI match ->
// Submit to a client. Every step is driven by real platform data (jobs,
// candidates, candidate_jobs, submissions — all team-scoped) rather than
// local flags, so the checklist reflects what the recruiter has actually
// done. Replaces the old sales-era version (start a recording / watch a
// sample meeting / generate an AI summary), which no longer matches this
// product.
//
// Visually matches the marketing site (LandingPage.tsx): warm paper
// background, navy accent, IBM Plex Mono kicker labels, numbered steps rail.

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Briefcase, Users, Sparkles, Send, ChevronRight, X, Check, ArrowRight,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTeam } from "@/hooks/useTeam";

// ─── Real "has the team done this yet" checks — reads existing
// team-scoped tables directly (same tables/RLS every other recruiting page
// uses), not local flags, so the checklist reflects actual platform usage.
function useActivationProgress(teamId: string | null) {
  return useQuery({
    queryKey: ["onboarding-activation-progress", teamId],
    queryFn: async () => {
      if (!teamId) return null;

      const [jobsRes, candidatesRes, matchesRes, submissionsRes] = await Promise.all([
        supabase.from("jobs" as any).select("id", { count: "exact", head: true }).eq("team_id", teamId),
        supabase.from("candidates" as any).select("id", { count: "exact", head: true }).eq("team_id", teamId),
        supabase.from("candidate_jobs" as any).select("id", { count: "exact", head: true }).eq("team_id", teamId).not("match_score", "is", null),
        supabase.from("submissions" as any).select("id", { count: "exact", head: true }).eq("team_id", teamId),
      ]);

      return {
        hasJob: (jobsRes.count ?? 0) > 0,
        hasCandidate: (candidatesRes.count ?? 0) > 0,
        hasMatch: (matchesRes.count ?? 0) > 0,
        hasSubmission: (submissionsRes.count ?? 0) > 0,
      };
    },
    enabled: !!teamId,
    staleTime: 30_000,
  });
}

function localStorageKey(teamId: string) {
  return `fixsense_activation_checklist_dismissed_${teamId}`;
}

type StepId = "job" | "candidates" | "match" | "submit";

export default function OnboardingChecklist({ onDismiss }: { onDismiss?: () => void }) {
  const navigate = useNavigate();
  const { teamId } = useTeam();
  const { data: progress } = useActivationProgress(teamId ?? null);

  const [dismissed, setDismissed] = useState(
    () => teamId ? localStorage.getItem(localStorageKey(teamId)) === "1" : false
  );

  // teamId can resolve after first render (team fetch is async) — re-check
  // the dismissal flag once it's available so a returning user on a team
  // that wasn't cached yet doesn't briefly see a dismissed checklist reappear.
  useEffect(() => {
    if (teamId && localStorage.getItem(localStorageKey(teamId)) === "1") {
      setDismissed(true);
    }
  }, [teamId]);

  const steps: { id: StepId; icon: typeof Briefcase; title: string; desc: string; done: boolean; path: string }[] = [
    {
      id: "job",
      icon: Briefcase,
      title: "Post your first job",
      desc: "Create a job requisition against one of your clients.",
      done: !!progress?.hasJob,
      path: "/jobs?create=1",
    },
    {
      id: "candidates",
      icon: Users,
      title: "Add candidates",
      desc: "Add or import candidates to start building a pipeline.",
      done: !!progress?.hasCandidate,
      path: "/candidates?create=1",
    },
    {
      id: "match",
      icon: Sparkles,
      title: "Get your first AI match",
      desc: "Run AI matching to score a candidate against an open role.",
      done: !!progress?.hasMatch,
      path: "/pipeline",
    },
    {
      id: "submit",
      icon: Send,
      title: "Submit to a client",
      desc: "Send a shortlisted candidate's package to the client.",
      done: !!progress?.hasSubmission,
      path: "/submissions",
    },
  ];

  const doneCount = steps.filter(s => s.done).length;
  const pct = Math.round((doneCount / steps.length) * 100);
  const allDone = doneCount === steps.length;

  const handleStepClick = (path: string) => navigate(path);

  const handleDismiss = () => {
    setDismissed(true);
    if (teamId) localStorage.setItem(localStorageKey(teamId), "1");
    onDismiss?.();
  };

  if (dismissed || allDone) return null;

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
      `}</style>

      <div className="onboard-progress-track">
        <div className="onboard-progress-fill" style={{ width: `${pct}%` }} />
      </div>

      <div className="flex items-center justify-between px-5 pt-5 pb-2">
        <div>
          <div className="onboard-kicker mb-1.5">Getting started</div>
          <h3 className="font-semibold text-sm text-foreground">Get your recruitment desk running</h3>
          <p className="text-xs text-muted-foreground mt-1">{doneCount} of {steps.length} steps done</p>
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
          <button key={step.id} className="onboard-step" onClick={() => handleStepClick(step.path)}>
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

      <div className="px-5 py-3.5 border-t border-border/60">
        <button
          onClick={() => navigate("/jobs?create=1")}
          className="text-xs font-medium inline-flex items-center gap-1"
          style={{ color: "hsl(var(--primary))" }}
        >
          Skip the checklist, post a job <ArrowRight className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}