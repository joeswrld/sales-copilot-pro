// src/pages/DashboardHome.tsx
import DashboardLayout from "@/components/DashboardLayout";
import TeamInvitationsBanner from "@/components/TeamInvitationsBanner";
import PlanInheritanceBanner from "@/components/PlanInheritanceBanner";
import { PlanBanner } from "@/components/plan/PlanGate";
import { Phone, TrendingUp, AlertTriangle, CheckCircle, Loader2, Activity, ArrowUp, ArrowDown, Minus } from "lucide-react";
import { useCalls, useCallStats } from "@/hooks/useCalls";
import { useAuth } from "@/contexts/AuthContext";
import { Link, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { useEffect } from "react";
import { useUserProfile } from "@/hooks/useSettings";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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
  const strokeColor = score >= 75 ? "hsl(152, 60%, 48%)" : score >= 55 ? "hsl(217, 91%, 65%)" : score >= 35 ? "hsl(38, 92%, 55%)" : "hsl(0, 72%, 50%)";
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
            <circle cx="30" cy="30" r={radius} fill="none" stroke="hsl(222, 30%, 18%)" strokeWidth="5" />
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

export default function DashboardHome() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: stats, isLoading: statsLoading } = useCallStats();
  const { data: calls, isLoading: callsLoading } = useCalls();
  const { profile, isLoading: profileLoading } = useUserProfile();

  useEffect(() => {
    if (profileLoading || callsLoading) return;
    if (profile && !profile.onboarding_complete && (!calls || calls.length === 0)) {
      navigate("/onboarding", { replace: true });
    }
  }, [profile, profileLoading, calls, callsLoading, navigate]);

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

        {/* ── Recent Calls ── */}
        <div className="glass rounded-xl overflow-hidden">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h2 className="font-display font-semibold">Recent Calls</h2>
            <Link to="/dashboard/calls" className="text-xs text-primary hover:underline">View all</Link>
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
              <p className="text-sm text-muted-foreground">No calls yet. Start by adding your first call.</p>
              <Link to="/dashboard/live" className="text-xs text-primary hover:underline mt-2 inline-block">
                Start a live call →
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {recentCalls.map(call => (
                <Link
                  key={call.id}
                  to={`/dashboard/calls/${call.id}`}
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
                    <span className={`text-xs px-2 py-1 rounded-full ${statusColors[call.status || ""] || "bg-secondary text-secondary-foreground"}`}>
                      {call.status}
                    </span>
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