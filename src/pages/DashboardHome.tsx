import DashboardLayout from "@/components/DashboardLayout";
import { Phone, TrendingUp, AlertTriangle, CheckCircle, Loader2 } from "lucide-react";
import { useCalls, useCallStats } from "@/hooks/useCalls";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";

const statusColors: Record<string, string> = {
  "Won": "bg-success/10 text-success",
  "In Progress": "bg-primary/10 text-primary",
  "At Risk": "bg-accent/10 text-accent",
  "Lost": "bg-destructive/10 text-destructive",
  "Completed": "bg-success/10 text-success",
  "Follow-up": "bg-accent/10 text-accent",
};

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

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map(s => (
            <div key={s.label} className="glass rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground">{s.label}</span>
                <s.icon className={`w-4 h-4 ${s.color}`} />
              </div>
              <div className="text-2xl font-bold font-display">
                {statsLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : s.value}
              </div>
            </div>
          ))}
        </div>

        <div className="glass rounded-xl overflow-hidden">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h2 className="font-display font-semibold">Recent Calls</h2>
            <Link to="/dashboard/calls" className="text-xs text-primary hover:underline">View all</Link>
          </div>
          {callsLoading ? (
            <div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
          ) : recentCalls.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No calls yet. Start by adding your first call.</div>
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
