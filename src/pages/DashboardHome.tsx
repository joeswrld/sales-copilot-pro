// src/pages/DashboardHome.tsx
import DashboardLayout from "@/components/DashboardLayout";
import TeamInvitationsBanner from "@/components/TeamInvitationsBanner";
import PlanInheritanceBanner from "@/components/PlanInheritanceBanner";
import { PlanBanner } from "@/components/plan/PlanGate";
import OnboardingChecklist from "@/components/OnboardingChecklist";
import {
  Phone, TrendingUp, AlertTriangle, CheckCircle, Loader2, Activity, ArrowUp, ArrowDown, Minus,
  Briefcase, UserPlus, ClipboardCheck, Video, PhoneCall, Send, ListTodo, Award, PartyPopper, Sparkles,
} from "lucide-react";
import { MatchExplanation, scoreColor, scoreBg } from "@/lib/matchExplanation";
import { useCalls, useCallStats } from "@/hooks/useCalls";
import { useAuth } from "@/contexts/AuthContext";
import { Link, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useEffect, useState } from "react";
import { useUserProfile } from "@/hooks/useSettings";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTeam } from "@/hooks/useTeam";

const statusColors: Record<string, string> = {
  "Won": "bg-success/10 text-success",
  "In Progress": "bg-primary/10 text-primary",
  "At Risk": "bg-accent/10 text-accent",
  "Lost": "bg-destructive/10 text-destructive",
  "Completed": "bg-success/10 text-success",
  "Follow-up": "bg-accent/10 text-accent",
};

function usePipelineHealth() {
  return useQuery({
    queryKey: ["pipeline-health"],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return null;
      const res = await supabase.functions.invoke("pipeline-health");
      if (res.error) throw res.error;
      return res.data as {
        score: number;
        label: string;
        trend: "up" | "down" | "stable";
        breakdown: Record<string, { score: number; label: string; weight: number }>;
        meta: Record<string, number>;
      };
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

function PipelineHealthCard() {
  const { data: health, isLoading } = usePipelineHealth();

  if (isLoading) {
    return (
      <div className="glass rounded-xl p-4 border border-border">
        <div className="flex items-center justify-between mb-2">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-4 w-4 rounded" />
        </div>
        <div className="flex items-center gap-3 mt-2">
          <Skeleton className="h-14 w-14 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-3 w-14" />
          </div>
        </div>
      </div>
    );
  }

  if (!health) return null;

  const score = health.score;
  const color = score >= 75 ? "text-success" : score >= 55 ? "text-primary" : score >= 35 ? "text-accent" : "text-destructive";
  const strokeColor = score >= 75 ? "hsl(152, 40%, 30%)" : score >= 55 ? "hsl(224, 46%, 25%)" : score >= 35 ? "hsl(32, 62%, 33%)" : "hsl(6, 58%, 42%)";
  const borderColor = score >= 75 ? "border-success/20" : score >= 55 ? "border-primary/20" : score >= 35 ? "border-accent/20" : "border-destructive/20";

  const TrendIcon = health.trend === "up" ? ArrowUp : health.trend === "down" ? ArrowDown : Minus;
  const trendColor = health.trend === "up" ? "text-success" : health.trend === "down" ? "text-destructive" : "text-muted-foreground";

  const radius = 26;
  const circ = 2 * Math.PI * radius;
  const dash = (score / 100) * circ;

  const breakdownItems = Object.values(health.breakdown).sort((a, b) => a.score - b.score).slice(0, 3);

  return (
    <div className={`glass rounded-xl p-4 border ${borderColor} col-span-2 lg:col-span-1`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-muted-foreground font-medium">Pipeline Health</span>
        <Activity className={`w-4 h-4 ${color}`} />
      </div>
      <div className="flex items-center gap-3 mb-3">
        <div className="relative w-14 h-14 shrink-0">
          <svg viewBox="0 0 60 60" className="w-14 h-14 -rotate-90">
            <circle cx="30" cy="30" r={radius} fill="none" stroke="hsl(68, 21%, 7%, 0.09)" strokeWidth="5" />
            <circle cx="30" cy="30" r={radius} fill="none" stroke={strokeColor} strokeWidth="5"
              strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
              style={{ transition: "stroke-dasharray 0.6s ease" }} />
          </svg>
          <span className={`absolute inset-0 flex items-center justify-center text-sm font-bold font-display ${color}`}>
            {score}
          </span>
        </div>
        <div>
          <div className={`text-base font-bold font-display flex items-center gap-1 ${color}`}>
            {health.label}
            <TrendIcon className={`w-3.5 h-3.5 ${trendColor}`} />
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">out of 100</div>
        </div>
      </div>
      <div className="space-y-1.5 pt-2 border-t border-border">
        {breakdownItems.map(item => {
          const itemColor = item.score >= 70 ? "bg-success" : item.score >= 45 ? "bg-primary" : item.score >= 25 ? "bg-accent" : "bg-destructive";
          return (
            <div key={item.label} className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-28 truncate">{item.label}</span>
              <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
                <div className={`h-1 rounded-full ${itemColor}`} style={{ width: `${item.score}%`, transition: "width 0.5s ease" }} />
              </div>
              <span className="text-xs text-muted-foreground w-7 text-right">{item.score}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Recruiting overview ──────────────────────────────────────────────────
// This dashboard already covers sales (deals/win-rate/pipeline health via
// PipelineHealthCard above). This panel adds the recruiting-side "what
// needs my attention today" view, reading directly from the existing
// recruiting tables (jobs, job_applications, candidates, candidate_jobs,
// interviews, recruiting_calls, submissions, client_feedback,
// recruiting_tasks) — no new tables or RPCs. Only rendered when the team
// actually has recruiting data, so a pure-sales team's dashboard is
// unchanged.
interface RecruitingOverviewData {
  openJobs: number;
  newApplications: number;
  candidatesNeedingReview: number;
  upcomingInterviews: { id: string; candidate_name: string; job_title: string; scheduled_at: string | null; candidate_id: string }[];
  todaysCalls: { id: string; call_type: string; title: string | null; scheduled_at: string | null; candidate_id: string | null }[];
  submissionsAwaitingFeedback: number;
  openFollowUps: number;
  offers: number;
  placements: number;
  hasAnyRecruitingData: boolean;
}

function useRecruitingDashboard(teamId: string | null) {
  return useQuery({
    queryKey: ["recruiting-dashboard", teamId],
    queryFn: async (): Promise<RecruitingOverviewData | null> => {
      if (!teamId) return null;

      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
      const sevenDaysOut = new Date(Date.now() + 7 * 86400_000).toISOString();

      const [
        jobsRes, applicationsRes, extractionsRes, interviewsRes, callsRes,
        submissionsRes, tasksRes, candidateJobsRes,
      ] = await Promise.all([
        supabase.from("jobs" as any).select("id", { count: "exact", head: true }).eq("team_id", teamId).eq("status", "open"),
        supabase.from("job_applications" as any).select("id", { count: "exact", head: true }).eq("team_id", teamId).gte("created_at", new Date(Date.now() - 7 * 86400_000).toISOString()),
        supabase.from("ai_extractions" as any).select("id", { count: "exact", head: true }).eq("team_id", teamId).eq("status", "pending_review"),
        supabase.from("interviews" as any)
          .select("id, scheduled_at, candidate_job_id, candidate_jobs:candidate_job_id(candidate_id, candidates:candidate_id(full_name), jobs:job_id(title))")
          .eq("team_id", teamId).eq("status", "scheduled")
          .not("scheduled_at", "is", null)
          .lte("scheduled_at", sevenDaysOut)
          .order("scheduled_at", { ascending: true })
          .limit(8),
        supabase.from("recruiting_calls" as any)
          .select("id, call_type, title, scheduled_at, candidate_id")
          .eq("team_id", teamId)
          .gte("scheduled_at", todayStart.toISOString())
          .lte("scheduled_at", todayEnd.toISOString())
          .order("scheduled_at", { ascending: true }),
        supabase.from("submissions" as any)
          .select("id, candidate_job_id")
          .eq("team_id", teamId)
          .in("status", ["submitted", "client_reviewing"]),
        supabase.from("recruiting_tasks" as any).select("id", { count: "exact", head: true }).eq("team_id", teamId).eq("status", "open"),
        supabase.from("candidate_jobs" as any).select("id, pipeline_stage", { count: "exact" }).eq("team_id", teamId).in("pipeline_stage", ["offer", "placed"]),
      ]);

      // "Submissions awaiting feedback" = sent to client, no client_feedback row yet.
      const submissionRows = (submissionsRes.data ?? []) as unknown as { id: string; candidate_job_id: string }[];
      let submissionsAwaitingFeedback = 0;
      if (submissionRows.length) {
        const { data: fbRows } = await supabase
          .from("client_feedback" as any)
          .select("submission_id")
          .in("submission_id", submissionRows.map(s => s.id));
        const withFeedback = new Set(((fbRows ?? []) as unknown as { submission_id: string }[]).map(f => f.submission_id));
        submissionsAwaitingFeedback = submissionRows.filter(s => !withFeedback.has(s.id)).length;
      }

      const cjRows = (candidateJobsRes.data ?? []) as unknown as { id: string; pipeline_stage: string }[];
      const offers = cjRows.filter(c => c.pipeline_stage === "offer").length;
      const placements = cjRows.filter(c => c.pipeline_stage === "placed").length;

      const upcomingInterviews = ((interviewsRes.data ?? []) as any[]).map(iv => ({
        id: iv.id,
        candidate_name: iv.candidate_jobs?.candidates?.full_name ?? "Candidate",
        job_title: iv.candidate_jobs?.jobs?.title ?? "Role",
        scheduled_at: iv.scheduled_at,
        candidate_id: iv.candidate_jobs?.candidate_id ?? "",
      }));

      const todaysCalls = ((callsRes.data ?? []) as any[]).map(c => ({
        id: c.id,
        call_type: c.call_type,
        title: c.title,
        scheduled_at: c.scheduled_at,
        candidate_id: c.candidate_id,
      }));

      const openJobs = jobsRes.count ?? 0;
      const newApplications = applicationsRes.count ?? 0;
      const candidatesNeedingReview = extractionsRes.count ?? 0;
      const submissionsTotal = submissionRows.length;
      const openFollowUps = tasksRes.count ?? 0;

      const hasAnyRecruitingData = !!(
        openJobs || newApplications || candidatesNeedingReview || upcomingInterviews.length ||
        todaysCalls.length || submissionsTotal || openFollowUps || offers || placements
      );

      return {
        openJobs, newApplications, candidatesNeedingReview, upcomingInterviews, todaysCalls,
        submissionsAwaitingFeedback, openFollowUps, offers, placements, hasAnyRecruitingData,
      };
    },
    enabled: !!teamId,
    staleTime: 30_000,
  });
}

const CALL_TYPE_LABEL: Record<string, string> = {
  candidate_screening: "Screening",
  client_intake: "Client Intake",
  interview: "Interview",
  other: "Call",
};

// ─── AI Matches ─────────────────────────────────────────────────────────────
// Surfaces the strongest existing AI matches so a recruiter can act on them
// without opening the Pipeline board. This reads match_score and
// match_explanation directly off public.candidate_jobs — the same columns
// the parse-candidate-cv edge function (mode: candidate_job_match) already
// writes and that PipelinePage already displays. No new matching system,
// table, or RPC is introduced; this only surfaces existing data on an
// active (non-rejected, non-placed) pipeline row.
interface AiMatchRow {
  id: string;
  candidate_id: string;
  job_id: string;
  match_score: number;
  match_explanation: MatchExplanation | null;
  candidate_name: string;
  job_title: string;
}

function useTopAiMatches(teamId: string | null) {
  return useQuery({
    queryKey: ["dashboard-ai-matches", teamId],
    queryFn: async (): Promise<AiMatchRow[]> => {
      if (!teamId) return [];
      const { data, error } = await supabase
        .from("candidate_jobs" as any)
        .select("id, candidate_id, job_id, match_score, match_explanation, candidate:candidates(full_name), job:jobs(title)")
        .eq("team_id", teamId)
        .not("match_score", "is", null)
        .not("pipeline_stage", "in", "(placed,rejected)")
        .gte("match_score", 70)
        .order("match_score", { ascending: false })
        .limit(5);
      if (error) throw error;
      return ((data ?? []) as any[]).map(r => ({
        id: r.id,
        candidate_id: r.candidate_id,
        job_id: r.job_id,
        match_score: r.match_score,
        match_explanation: r.match_explanation,
        candidate_name: r.candidate?.full_name ?? "Candidate",
        job_title: r.job?.title ?? "Role",
      }));
    },
    enabled: !!teamId,
    staleTime: 30_000,
  });
}

function AiMatchesPanel() {
  const { teamId } = useTeam();
  const navigate = useNavigate();
  const { data: matches, isLoading } = useTopAiMatches(teamId ?? null);

  if (isLoading) {
    return (
      <div className="glass rounded-xl p-4 border border-border space-y-3">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-16 rounded-lg" />
      </div>
    );
  }

  if (!matches || matches.length === 0) return null;

  return (
    <div className="glass rounded-xl overflow-hidden border border-border">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h2 className="font-display font-semibold flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-primary" /> Top AI Matches
        </h2>
        <Link to="/pipeline" className="text-xs text-primary hover:underline">View pipeline</Link>
      </div>
      <div className="divide-y divide-border">
        {matches.map(m => (
          <button
            key={m.id}
            onClick={() => navigate(`/candidates/${m.candidate_id}?job=${m.job_id}&cj=${m.id}`)}
            className="w-full text-left p-4 hover:bg-secondary/30 transition-colors"
          >
            <div className="flex items-center justify-between gap-3 mb-1">
              <span className="text-sm font-medium truncate">
                {m.candidate_name} <span className="text-muted-foreground">→ {m.job_title}</span>
              </span>
              <span
                className="text-xs font-bold shrink-0 px-2 py-0.5 rounded-full"
                style={{ background: scoreBg(m.match_score), color: scoreColor(m.match_score) }}
              >
                {m.match_score}% match
              </span>
            </div>
            {m.match_explanation?.overall_recommendation && (
              <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                {m.match_explanation.overall_recommendation}
              </p>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function RecruitingOverview() {
  const { teamId } = useTeam();
  const navigate = useNavigate();
  const { data, isLoading } = useRecruitingDashboard(teamId ?? null);

  if (isLoading) {
    return (
      <div className="glass rounded-xl p-4 border border-border space-y-3">
        <Skeleton className="h-4 w-40" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
        </div>
      </div>
    );
  }

  if (!data || !data.hasAnyRecruitingData) return null;

  const metrics = [
    { label: "Open Jobs", value: data.openJobs, icon: Briefcase, color: "text-primary", to: "/jobs" },
    { label: "New Applications", value: data.newApplications, icon: UserPlus, color: "text-accent", to: "/candidates" },
    { label: "Need Review", value: data.candidatesNeedingReview, icon: ClipboardCheck, color: data.candidatesNeedingReview > 0 ? "text-destructive" : "text-muted-foreground", to: "/candidates" },
    { label: "Follow-ups", value: data.openFollowUps, icon: ListTodo, color: "text-accent", to: "/interviews" },
    { label: "Submissions Awaiting Feedback", value: data.submissionsAwaitingFeedback, icon: Send, color: data.submissionsAwaitingFeedback > 0 ? "text-accent" : "text-muted-foreground", to: "/candidates" },
    { label: "Offers Out", value: data.offers, icon: Award, color: "text-primary", to: "/candidates" },
    { label: "Placements", value: data.placements, icon: PartyPopper, color: "text-success", to: "/candidates" },
  ];

  return (
    <div className="glass rounded-xl overflow-hidden border border-border">
      <div className="p-4 border-b border-border">
        <h2 className="font-display font-semibold">Recruiting Overview</h2>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4">
        {metrics.map(m => (
          <Link key={m.label} to={m.to} className="rounded-lg border border-border bg-card p-3 hover:bg-secondary/30 transition-colors">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] text-muted-foreground leading-tight">{m.label}</span>
              <m.icon className={`w-3.5 h-3.5 shrink-0 ${m.color}`} />
            </div>
            <div className={`text-xl font-bold font-display ${m.color}`}>{m.value}</div>
          </Link>
        ))}
      </div>

      <div className="grid sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-border border-t border-border">
        {/* Today's calls */}
        <div className="p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <PhoneCall className="w-3.5 h-3.5" /> Today's Calls
            </h3>
            <Link to="/live" className="text-[11px] text-primary hover:underline">View all</Link>
          </div>
          {data.todaysCalls.length === 0 ? (
            <p className="text-xs text-muted-foreground">No recruiting calls scheduled today.</p>
          ) : (
            <div className="space-y-1.5">
              {data.todaysCalls.map(c => (
                <div key={c.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="flex items-center gap-1.5 min-w-0">
                    <Badge variant="outline" className="text-[9px] shrink-0">{CALL_TYPE_LABEL[c.call_type] ?? c.call_type}</Badge>
                    <span className="truncate">{c.title ?? "Recruiting call"}</span>
                  </span>
                  <span className="text-muted-foreground shrink-0">
                    {c.scheduled_at ? format(new Date(c.scheduled_at), "h:mm a") : "—"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Upcoming interviews */}
        <div className="p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <Video className="w-3.5 h-3.5" /> Upcoming Interviews
            </h3>
            <Link to="/interviews" className="text-[11px] text-primary hover:underline">View all</Link>
          </div>
          {data.upcomingInterviews.length === 0 ? (
            <p className="text-xs text-muted-foreground">No interviews scheduled in the next 7 days.</p>
          ) : (
            <div className="space-y-1.5">
              {data.upcomingInterviews.map(iv => (
                <button
                  key={iv.id}
                  onClick={() => navigate(`/candidates/${iv.candidate_id}`)}
                  className="flex items-center justify-between gap-2 text-xs w-full text-left hover:text-primary transition-colors"
                >
                  <span className="truncate">
                    <span className="font-medium">{iv.candidate_name}</span>
                    <span className="text-muted-foreground"> — {iv.job_title}</span>
                  </span>
                  <span className="text-muted-foreground shrink-0">
                    {iv.scheduled_at ? format(new Date(iv.scheduled_at), "MMM d, h:mm a") : "—"}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function DashboardHome() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: stats, isLoading: statsLoading } = useCallStats();
  const { data: calls, isLoading: callsLoading } = useCalls();
  const { profile, isLoading: profileLoading } = useUserProfile();

  const checklistDismissKey = user ? `fixsense_onboard_checklist_dismissed_${user.id}` : null;
  const [checklistDismissed, setChecklistDismissed] = useState(
    () => checklistDismissKey ? localStorage.getItem(checklistDismissKey) === "1" : false
  );

  useEffect(() => {
    if (profileLoading || callsLoading) return;
    if (profile && !profile.onboarding_complete && (!calls || calls.length === 0)) {
      navigate("/onboarding", { replace: true });
    }
  }, [profile, profileLoading, calls, callsLoading, navigate]);

  // Show the checklist for anyone who hasn't recorded a real meeting yet,
  // until they explicitly dismiss it. This replaces the bare empty state
  // with a guided path to first value.
  const showChecklist = !checklistDismissed && !callsLoading && (!calls || calls.length === 0);

  const handleDismissChecklist = () => {
    setChecklistDismissed(true);
    if (checklistDismissKey) localStorage.setItem(checklistDismissKey, "1");
  };

  const displayName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "User";
  const recentCalls = (calls || []).slice(0, 5);

  const statCards = [
    { label: "Total Calls", value: stats?.total ?? "—", icon: Phone, color: "text-primary" },
    { label: "Win Rate", value: stats ? `${stats.winRate}%` : "—", icon: TrendingUp, color: "text-success" },
    { label: "Avg Sentiment", value: stats ? `${stats.avgSentiment}%` : "—", icon: CheckCircle, color: "text-accent" },
    { label: "At-Risk Deals", value: stats?.atRisk ?? "—", icon: AlertTriangle, color: "text-destructive" },
  ];

  if (profileLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">

        {/* ── Banners (invitations + plan) ── */}
        <div className="space-y-3">
          <TeamInvitationsBanner />
          <PlanInheritanceBanner />
          <PlanBanner />
        </div>

        {/* ── Page header ── */}
        <div>
          <h1 className="text-2xl font-bold font-display">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Welcome back, {displayName}. Here's your sales performance overview.
          </p>
        </div>

        {/* ── Guided onboarding checklist, shown until the person has a
             real recorded meeting or dismisses it ── */}
        {showChecklist && <OnboardingChecklist onDismiss={handleDismissChecklist} />}

        {/* ── Stat cards + Pipeline Health ── */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {statsLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="glass rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-4 w-4 rounded" />
                </div>
                <Skeleton className="h-8 w-16" />
              </div>
            ))
          ) : (
            <>
              {statCards.map(s => (
                <div key={s.label} className="glass rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-muted-foreground">{s.label}</span>
                    <s.icon className={`w-4 h-4 ${s.color}`} />
                  </div>
                  <div className="text-2xl font-bold font-display">{s.value}</div>
                </div>
              ))}
              <PipelineHealthCard />
            </>
          )}
        </div>

        {/* ── Recruiting Overview (only rendered when the team has
             recruiting data — a pure-sales workspace sees nothing extra) ── */}
        <RecruitingOverview />

        {/* ── Top AI Matches — existing match_score/match_explanation data,
             surfaced here so a recruiter can act without opening Pipeline ── */}
        <AiMatchesPanel />

        {/* ── Recent Calls ── */}
        <div className="glass rounded-xl overflow-hidden">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h2 className="font-display font-semibold">Recent Calls</h2>
            <Link to="/calls" className="text-xs text-primary hover:underline">View all</Link>
          </div>
          {callsLoading ? (
            <div className="divide-y divide-border">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between p-4">
                  <div className="space-y-2 min-w-0">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-6 w-16 rounded-full" />
                </div>
              ))}
            </div>
          ) : recentCalls.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm text-muted-foreground">No calls yet. Use the checklist above to get your first summary.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {recentCalls.map(call => (
                <Link
                  key={call.id}
                  to={`/calls/${call.id}`}
                  className="flex items-center justify-between p-4 hover:bg-secondary/30 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{call.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(call.date), "MMM d, yyyy")} · {call.duration_minutes ? `${call.duration_minutes} min` : "—"}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <div className="hidden sm:flex items-center gap-2">
                      <div className="h-1.5 w-16 rounded-full bg-muted">
                        <div className="h-1.5 rounded-full bg-primary" style={{ width: `${call.sentiment_score || 0}%` }} />
                      </div>
                      <span className="text-xs text-muted-foreground">{call.sentiment_score || 0}%</span>
                    </div>
                    {(() => {
                      // "live" status is stamped at link-creation time so the
                      // host can locate their own room; it does not mean a
                      // real participant has joined. Only start_time (set by
                      // the join webhook) confirms an actual attendee. Show
                      // unattended links as "Link created", not "live".
                      const isWaiting = call.status === "live" && !call.start_time;
                      const label = isWaiting ? "Link created" : call.status;
                      const classes = isWaiting
                        ? "bg-muted text-muted-foreground"
                        : statusColors[call.status || ""] || "bg-secondary text-secondary-foreground";
                      return (
                        <span className={`text-xs px-2 py-1 rounded-full ${classes}`}>
                          {label}
                        </span>
                      );
                    })()}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

      </div>
    </DashboardLayout>
  );
}