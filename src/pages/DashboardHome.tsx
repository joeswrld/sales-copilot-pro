import DashboardLayout from "@/components/DashboardLayout";
import { Phone, TrendingUp, AlertTriangle, CheckCircle, Loader2, Activity } from "lucide-react";
import { useCalls, useCallStats } from "@/hooks/useCalls";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { useMemo } from "react";

const statusColors: Record<string, string> = {
  "Won": "bg-success/10 text-success",
  "In Progress": "bg-primary/10 text-primary",
  "At Risk": "bg-accent/10 text-accent",
  "Lost": "bg-destructive/10 text-destructive",
  "Completed": "bg-success/10 text-success",
  "Follow-up": "bg-accent/10 text-accent",
};

function PipelineHealthCard({ calls }: { calls: any[] }) {
  const score = useMemo(() => {
    if (!calls || calls.length === 0) return null;

    const activeCalls = calls.filter(c => c.status !== "Won" && c.status !== "Lost");
    if (activeCalls.length === 0) return null;

    // Factor 1: average sentiment of active deals (0–100, weight 40%)
    const sentimentCalls = activeCalls.filter(c => c.sentiment_score);
    const avgSentiment = sentimentCalls.length > 0
      ? sentimentCalls.reduce((s, c) => s + (c.sentiment_score || 0), 0) / sentimentCalls.length
      : 50;

    // Factor 2: % of active deals NOT at-risk (weight 40%)
    const atRisk = activeCalls.filter(c => c.status === "At Risk").length;
    const safeRatio = activeCalls.length > 0 ? ((activeCalls.length - atRisk) / activeCalls.length) * 100 : 100;

    // Factor 3: recent call frequency — calls in last 7 days vs total active deals (weight 20%)
    const recentCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recentCalls = activeCalls.filter(c => new Date(c.date).getTime() > recentCutoff).length;
    const activityScore = Math.min((recentCalls / Math.max(activeCalls.length, 1)) * 100, 100);

    const raw = (avgSentiment * 0.4) + (safeRatio * 0.4) + (activityScore * 0.2);
    return Math.round(Math.min(Math.max(raw, 0), 100));
  }, [calls]);

  if (score === null) return null;

  const color = score >= 70 ? "text-success" : score >= 40 ? "text-accent" : "text-destructive";
  const bg = score >= 70 ? "bg-success/10" : score >= 40 ? "bg-accent/10" : "bg-destructive/10";
  const label = score >= 70 ? "Healthy" : score >= 40 ? "Needs attention" : "At risk";
  const strokeColor = score >= 70 ? "hsl(152, 60%, 48%)" : score >= 40 ? "hsl(38, 92%, 55%)" : "hsl(0, 72%, 50%)";

  const radius = 26;
  const circ = 2 * Math.PI * radius;
  const dash = (score / 100) * circ;

  return (
    <div className={`glass rounded-xl p-4 border ${score < 40 ? "border-destructive/20" : "border-border"}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted-foreground">Pipeline Health</span>
        <Activity className={`w-4 h-4 ${color}`} />
      </div>
      <div className="flex items-center gap-3">
        <div className="relative w-14 h-14 shrink-0">
          <svg viewBox="0 0 60 60" className="w-14 h-14 -rotate-90">
            <circle cx="30" cy="30" r={radius} fill="none" stroke="hsl(222, 30%, 18%)" strokeWidth="5" />
            <circle
              cx="30" cy="30" r={radius} fill="none"
              stroke={strokeColor} strokeWidth="5"
              strokeDasharray={`${dash} ${circ}`}
              strokeLinecap="round"
              style={{ transition: "stroke-dasharray 0.6s ease" }}
            />
          </svg>
          <span className={`absolute inset-0 flex items-center justify-center text-sm font-bold font-display ${color}`}>
            {score}
          </span>
        </div>
        <div>
          <div className={`text-base font-bold font-display ${color}`}>{label}</div>
          <div className="text-xs text-muted-foreground mt-0.5">out of 100</div>
        </div>
      </div>
    </div>
  );
}

export default function DashboardHome() {
  const { user } = useAuth();
  const { data: stats, isLoading: statsLoading } = useCallStats();
  const { data: calls, isLoading: callsLoading } = useCalls();

  const displayName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "User";
  const recentCalls = (calls || []).slice(0, 5);

  const statCards = [
    { label: "Total Calls", value: stats?.total ?? "—", icon: Phone, color: "text-primary" },
    { label: "Win Rate", value: stats ? `${stats.winRate}%` : "—", icon: TrendingUp, color: "text-success" },
    { label: "Avg Sentiment", value: stats ? `${stats.avgSentiment}%` : "—", icon: CheckCircle, color: "text-accent" },
    { label: "At-Risk Deals", value: stats?.atRisk ?? "—", icon: AlertTriangle, color: "text-destructive" },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold font-display">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Welcome back, {displayName}. Here's your sales performance overview.</p>
        </div>

        {/* Stat cards + Pipeline Health */}
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
              {/* Pipeline Health — spans remaining col on lg */}
              {calls && calls.length > 0 && (
                <PipelineHealthCard calls={calls} />
              )}
            </>
          )}
        </div>

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
                <Link key={call.id} to={`/dashboard/calls/${call.id}`} className="flex items-center justify-between p-4 hover:bg-secondary/30 transition-colors">
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{call.name}</p>
                    <p className="text-xs text-muted-foreground">{format(new Date(call.date), "MMM d, yyyy")} · {call.duration_minutes ? `${call.duration_minutes} min` : "—"}</p>
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