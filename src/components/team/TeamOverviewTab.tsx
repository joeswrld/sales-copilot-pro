import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Users, TrendingUp, TrendingDown, Target, Trophy, Medal, Award,
  Lightbulb, AlertTriangle, Sparkles, Mic, CheckCircle2, Phone
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useTeamCalls } from "@/hooks/useCoaching";
import { format, startOfMonth, getWeek } from "date-fns";

function ScoreIndicator({ score }: { score: number }) {
  const color = score >= 8 ? "text-emerald-400" : score >= 7 ? "text-amber-400" : "text-red-400";
  return <span className={`font-bold ${color}`}>{score.toFixed(1)}</span>;
}

function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

export default function TeamOverviewTab() {
  const { teamCalls, teamCallsLoading } = useTeamCalls();

  // Compute metrics from real data
  const metrics = useMemo(() => {
    const now = new Date();
    const monthStart = startOfMonth(now);
    const thisMonth = teamCalls.filter(c => new Date(c.date) >= monthStart);

    const totalMeetings = thisMonth.length;
    const scores = thisMonth.filter(c => c.sentiment_score != null).map(c => c.sentiment_score!);
    const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length / 10 : 0;
    const totalObjections = thisMonth.reduce((sum, c) => sum + (c.objections_count ?? 0), 0);
    const withComments = thisMonth.filter(c => c.comment_count > 0).length;

    return { totalMeetings, avgScore, totalObjections, withComments };
  }, [teamCalls]);

  // Per-member stats
  const memberStats = useMemo(() => {
    const now = new Date();
    const monthStart = startOfMonth(now);
    const thisMonth = teamCalls.filter(c => new Date(c.date) >= monthStart);

    const byUser = new Map<string, { name: string; initials: string; calls: typeof thisMonth }>();
    thisMonth.forEach(c => {
      const uid = c.user_id;
      if (!byUser.has(uid)) {
        const name = c.profile?.full_name || c.profile?.email || "Unknown";
        byUser.set(uid, { name, initials: getInitials(c.profile?.full_name), calls: [] });
      }
      byUser.get(uid)!.calls.push(c);
    });

    return Array.from(byUser.entries()).map(([uid, data]) => {
      const scores = data.calls.filter(c => c.sentiment_score != null).map(c => c.sentiment_score!);
      const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length / 10 : 0;
      const lastCall = data.calls[0]?.date;
      return { uid, name: data.name, initials: data.initials, meetings: data.calls.length, avgScore, lastCall };
    }).sort((a, b) => b.avgScore - a.avgScore);
  }, [teamCalls]);

  // Weekly trend (last 4 weeks)
  const weeklyTrend = useMemo(() => {
    const weeks = new Map<number, { scores: number[]; count: number }>();
    teamCalls.forEach(c => {
      const w = getWeek(new Date(c.date));
      if (!weeks.has(w)) weeks.set(w, { scores: [], count: 0 });
      const entry = weeks.get(w)!;
      entry.count++;
      if (c.sentiment_score != null) entry.scores.push(c.sentiment_score / 10);
    });

    return Array.from(weeks.entries())
      .sort((a, b) => a[0] - b[0])
      .slice(-4)
      .map(([w, data]) => ({
        week: `W${w}`,
        score: data.scores.length ? +(data.scores.reduce((a, b) => a + b, 0) / data.scores.length).toFixed(1) : 0,
        meetings: data.count,
      }));
  }, [teamCalls]);

  // Top 3 performers
  const topPerformers = memberStats.slice(0, 3);
  const labels = ["Top Performer", "Strong Performer", "Rising Performer"];

  // Recent meetings (first 6)
  const recentMeetings = teamCalls.slice(0, 6);

  // AI insights from real data
  const coachingInsights = useMemo(() => {
    const insights: { type: string; text: string }[] = [];
    if (metrics.totalMeetings === 0) return insights;

    if (metrics.avgScore < 7) {
      insights.push({ type: "warning", text: `Team average score is ${metrics.avgScore.toFixed(1)}/10. Focus on coaching to bring it above 7.0.` });
    } else if (metrics.avgScore >= 8) {
      insights.push({ type: "success", text: `Strong team performance — average score is ${metrics.avgScore.toFixed(1)}/10 this month.` });
    }

    if (metrics.totalObjections > 0) {
      insights.push({ type: "tip", text: `${metrics.totalObjections} objection(s) detected across ${metrics.totalMeetings} meetings. Review objection handling patterns.` });
    }

    const lowScoreMembers = memberStats.filter(m => m.avgScore < 7 && m.meetings >= 2);
    if (lowScoreMembers.length > 0) {
      insights.push({ type: "warning", text: `${lowScoreMembers.map(m => m.name).join(", ")} scored below 7.0 — schedule 1:1 coaching sessions.` });
    }

    if (topPerformers.length > 0 && topPerformers[0].avgScore >= 8) {
      insights.push({ type: "success", text: `${topPerformers[0].name} leads with ${topPerformers[0].avgScore.toFixed(1)}/10. Consider having them share techniques.` });
    }

    const reviewRate = metrics.totalMeetings > 0 ? (metrics.withComments / metrics.totalMeetings * 100) : 0;
    if (reviewRate < 50) {
      insights.push({ type: "warning", text: `Only ${reviewRate.toFixed(0)}% of meetings have coaching feedback. Increase review cadence.` });
    }

    return insights;
  }, [metrics, memberStats, topPerformers]);

  if (teamCallsLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (teamCalls.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Phone className="w-10 h-10 text-muted-foreground mb-3" />
        <h3 className="text-sm font-semibold">No team meetings yet</h3>
        <p className="text-xs text-muted-foreground mt-1 max-w-xs">
          When team members complete calls, performance data will appear here.
        </p>
      </div>
    );
  }

  const summaryCards = [
    { label: "Team Meetings", value: String(metrics.totalMeetings), icon: Users },
    { label: "Avg Score", value: metrics.avgScore.toFixed(1), icon: Target },
    { label: "Objections", value: String(metrics.totalObjections), icon: AlertTriangle },
    { label: "Reviewed", value: String(metrics.withComments), icon: CheckCircle2 },
    { label: "Team Members", value: String(memberStats.length), icon: Mic },
  ];

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
        {summaryCards.map((card) => (
          <Card key={card.label} className="bg-card border-border">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center justify-between mb-1.5 sm:mb-2">
                <card.icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground" />
              </div>
              <p className="text-xl sm:text-2xl font-bold font-display">{card.value}</p>
              <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1">{card.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main Grid */}
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Chart */}
          {weeklyTrend.length > 0 && (
            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-display">Weekly Performance Trend</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={weeklyTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="week" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} axisLine={false} />
                    <YAxis domain={[0, 10]} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} axisLine={false} />
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, color: "hsl(var(--foreground))" }} />
                    <Bar dataKey="score" name="Avg Score" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Recent Meetings */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-display">Recent Team Meetings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {recentMeetings.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No recent meetings.</p>
              ) : recentMeetings.map((entry) => {
                const name = entry.profile?.full_name || entry.profile?.email || "Unknown";
                const initials = getInitials(entry.profile?.full_name);
                const score = entry.sentiment_score != null ? entry.sentiment_score / 10 : null;
                return (
                  <div key={entry.id} className="flex gap-3 p-3 rounded-lg bg-secondary/20 hover:bg-secondary/30 transition-colors">
                    <Avatar className="h-8 w-8 shrink-0 mt-0.5">
                      <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">{initials}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                        <p className="text-sm font-medium truncate">{name}</p>
                        <div className="flex items-center gap-2 shrink-0">
                          {score != null && <ScoreIndicator score={score} />}
                          <span className="text-xs text-muted-foreground">{format(new Date(entry.date), "MMM d")}</span>
                        </div>
                      </div>
                      <p className="text-xs text-primary/80 font-medium mt-0.5">{entry.name}</p>
                      {entry.summary?.summary && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{entry.summary.summary}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Leaderboard */}
          {topPerformers.length > 0 && (
            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-display flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-amber-400" />
                  Top Performers
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {topPerformers.map((m, i) => {
                  const icons = [Trophy, Medal, Award];
                  const colors = ["text-amber-400", "text-zinc-400", "text-orange-400"];
                  const Icon = icons[i] ?? Award;
                  return (
                    <div key={m.uid} className="flex items-center gap-3 p-3 rounded-lg bg-secondary/20">
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-secondary">
                        <Icon className={`w-4 h-4 ${colors[i] ?? colors[2]}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{m.name}</p>
                        <p className="text-xs text-muted-foreground">{labels[i] ?? ""} · {m.meetings} meetings</p>
                      </div>
                      <ScoreIndicator score={m.avgScore} />
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {/* Coaching Insights */}
          {coachingInsights.length > 0 && (
            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-display flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  AI Coaching Insights
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[280px] lg:h-[360px] pr-2">
                  <div className="space-y-3">
                    {coachingInsights.map((insight, i) => {
                      const iconMap: Record<string, typeof AlertTriangle> = { warning: AlertTriangle, tip: Lightbulb, success: CheckCircle2 };
                      const colorMap: Record<string, string> = { warning: "text-amber-400 bg-amber-400/10", tip: "text-primary bg-primary/10", success: "text-emerald-400 bg-emerald-400/10" };
                      const Icon = iconMap[insight.type] ?? Lightbulb;
                      const colorClass = colorMap[insight.type] ?? "text-primary bg-primary/10";
                      return (
                        <div key={i} className="p-3 rounded-lg bg-secondary/20">
                          <div className="flex items-start gap-2">
                            <div className={`p-1.5 rounded-md shrink-0 ${colorClass}`}>
                              <Icon className="w-3.5 h-3.5" />
                            </div>
                            <p className="text-xs text-muted-foreground leading-relaxed">{insight.text}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
