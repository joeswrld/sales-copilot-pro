import DashboardLayout from "@/components/DashboardLayout";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend,
} from "recharts";
import { useCalls } from "@/hooks/useCalls";
import { Loader2, TrendingUp, BarChart3, Award, CheckCircle2 } from "lucide-react";
import { useActionStats } from "@/hooks/useCallActions";
import { format, subDays, startOfDay } from "date-fns";
import { useMemo, useState } from "react";

const COLORS = [
  "hsl(174, 72%, 50%)",
  "hsl(38, 92%, 55%)",
  "hsl(270, 60%, 60%)",
  "hsl(152, 60%, 48%)",
  "hsl(215, 20%, 55%)",
];

export default function Analytics() {
  const { data: calls, isLoading } = useCalls();
  const { data: actionStats } = useActionStats();
  const [activeTab, setActiveTab] = useState<"overview" | "reps" | "trends">("overview");

  const { dailyData, sentimentTrend, statusBreakdown, repData, trendData } = useMemo(() => {
    if (!calls || calls.length === 0) {
      return { dailyData: [], sentimentTrend: [], statusBreakdown: [], repData: [], trendData: [] };
    }

    // Last 7 days activity
    const days = Array.from({ length: 7 }, (_, i) => {
      const date = subDays(new Date(), 6 - i);
      const dayStr = format(date, "EEE");
      const start = startOfDay(date);
      const end = new Date(start.getTime() + 86400000);
      const dayCalls = calls.filter(c => {
        const d = new Date(c.date);
        return d >= start && d < end;
      });
      return {
        name: dayStr,
        calls: dayCalls.length,
        wins: dayCalls.filter(c => c.status === "Won").length,
      };
    });

    // Sentiment trend
    const sentiment = Array.from({ length: 14 }, (_, i) => {
      const date = subDays(new Date(), 13 - i);
      const start = startOfDay(date);
      const end = new Date(start.getTime() + 86400000);
      const dayCalls = calls.filter(c => {
        const d = new Date(c.date);
        return d >= start && d < end && c.sentiment_score;
      });
      const avg = dayCalls.length > 0
        ? Math.round(dayCalls.reduce((s, c) => s + (c.sentiment_score || 0), 0) / dayCalls.length)
        : null;
      return { day: format(date, "MMM d"), score: avg };
    }).filter(d => d.score !== null);

    // Status breakdown
    const statusMap: Record<string, number> = {};
    calls.forEach(c => { statusMap[c.status || "Unknown"] = (statusMap[c.status || "Unknown"] || 0) + 1; });
    const breakdown = Object.entries(statusMap).map(([name, value]) => ({ name, value }));

    // Rep performance — derive "rep name" from call name patterns or participants
    // Group calls by participant/rep, compute avg score, talk ratio, objection handling
    const repMap: Record<string, {
      calls: number;
      wins: number;
      totalSentiment: number;
      sentimentCount: number;
      totalScore: number;
      scoreCount: number;
    }> = {};

    calls.forEach(c => {
      // Use call name prefix as a proxy for rep (e.g. "John - Discovery")
      // Fall back to "You" if no participant info
      const repName = (c.participants as string[] | null)?.[0] || "You";
      if (!repMap[repName]) {
        repMap[repName] = { calls: 0, wins: 0, totalSentiment: 0, sentimentCount: 0, totalScore: 0, scoreCount: 0 };
      }
      repMap[repName].calls++;
      if (c.status === "Won") repMap[repName].wins++;
      if (c.sentiment_score) {
        repMap[repName].totalSentiment += c.sentiment_score;
        repMap[repName].sentimentCount++;
      }
      if ((c as any).deal_score) {
        repMap[repName].totalScore += Number((c as any).deal_score);
        repMap[repName].scoreCount++;
      }
    });

    const reps = Object.entries(repMap).map(([name, d]) => ({
      name: name.length > 14 ? name.slice(0, 14) + "…" : name,
      calls: d.calls,
      winRate: d.calls > 0 ? Math.round((d.wins / d.calls) * 100) : 0,
      avgSentiment: d.sentimentCount > 0 ? Math.round(d.totalSentiment / d.sentimentCount) : 0,
      avgScore: d.scoreCount > 0 ? Math.round(d.totalScore / d.scoreCount) : 0,
    })).sort((a, b) => b.winRate - a.winRate);

    // 30-day trend: calls per week + win rate
    const trendWeeks = Array.from({ length: 4 }, (_, i) => {
      const weekEnd = subDays(new Date(), i * 7);
      const weekStart = subDays(weekEnd, 7);
      const weekCalls = calls.filter(c => {
        const d = new Date(c.date);
        return d >= weekStart && d < weekEnd;
      });
      const wins = weekCalls.filter(c => c.status === "Won").length;
      return {
        week: `W-${i + 1}`,
        calls: weekCalls.length,
        winRate: weekCalls.length > 0 ? Math.round((wins / weekCalls.length) * 100) : 0,
        sentiment: weekCalls.length > 0
          ? Math.round(weekCalls.reduce((s, c) => s + (c.sentiment_score || 0), 0) / weekCalls.length)
          : 0,
      };
    }).reverse();

    return { dailyData: days, sentimentTrend: sentiment, statusBreakdown: breakdown, repData: reps, trendData: trendWeeks };
  }, [calls]);

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  const noData = !calls || calls.length === 0;

  const TABS = [
    { id: "overview" as const, label: "Overview", icon: BarChart3 },
    { id: "reps" as const, label: "Rep Performance", icon: Award },
    { id: "trends" as const, label: "Trends", icon: TrendingUp },
  ];

  const tooltipStyle = {
    contentStyle: {
      background: "hsl(222, 44%, 9%)",
      border: "1px solid hsl(222, 30%, 18%)",
      borderRadius: 8,
      color: "hsl(210, 40%, 96%)",
    },
  };

  const axisProps = { fill: "hsl(215, 20%, 55%)", fontSize: 12 };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold font-display">Analytics</h1>
          <p className="text-sm text-muted-foreground">Track performance metrics and identify trends</p>
        </div>

        {/* Tab bar */}
        <div className="flex gap-2 border-b border-border">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          ))}
        </div>

        {noData ? (
          <div className="glass rounded-xl p-10 text-center">
            <p className="text-muted-foreground text-sm">No data yet. Complete some calls to see your analytics.</p>
          </div>
        ) : (
          <>
            {/* OVERVIEW TAB */}
            {activeTab === "overview" && (
              <div className="space-y-6">
                {/* Action Completion Rate card */}
                {actionStats && actionStats.total > 0 && (
                  <div className="glass rounded-xl p-5">
                    <h3 className="font-display font-semibold text-sm mb-4 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-400" /> Action Completion Rate
                    </h3>
                    <div className="flex items-center gap-6">
                      <div className="text-center">
                        <div className="text-3xl font-bold font-display text-primary">{actionStats.rate}%</div>
                        <div className="text-xs text-muted-foreground">Completion Rate</div>
                      </div>
                      <div className="flex-1">
                        <div className="h-3 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${actionStats.rate}%` }} />
                        </div>
                        <div className="flex justify-between mt-1 text-xs text-muted-foreground">
                          <span>{actionStats.completed} completed</span>
                          <span>{actionStats.total} total actions</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid lg:grid-cols-2 gap-6">
                  <div className="glass rounded-xl p-5">
                    <h3 className="font-display font-semibold text-sm mb-4">Calls & Wins (Last 7 Days)</h3>
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={dailyData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 30%, 18%)" />
                        <XAxis dataKey="name" tick={axisProps} axisLine={false} />
                        <YAxis tick={axisProps} axisLine={false} />
                        <Tooltip {...tooltipStyle} />
                        <Bar dataKey="calls" fill="hsl(222, 30%, 25%)" radius={[4, 4, 0, 0]} name="Calls" />
                        <Bar dataKey="wins" fill="hsl(174, 72%, 50%)" radius={[4, 4, 0, 0]} name="Wins" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {sentimentTrend.length > 1 && (
                    <div className="glass rounded-xl p-5">
                      <h3 className="font-display font-semibold text-sm mb-4">Average Sentiment (Last 14 Days)</h3>
                      <ResponsiveContainer width="100%" height={250}>
                        <LineChart data={sentimentTrend}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 30%, 18%)" />
                          <XAxis dataKey="day" tick={axisProps} axisLine={false} />
                          <YAxis domain={[0, 100]} tick={axisProps} axisLine={false} />
                          <Tooltip {...tooltipStyle} />
                          <Line type="monotone" dataKey="score" stroke="hsl(174, 72%, 50%)" strokeWidth={2} dot={{ fill: "hsl(174, 72%, 50%)", r: 4 }} name="Sentiment %" />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  <div className="glass rounded-xl p-5">
                    <h3 className="font-display font-semibold text-sm mb-4">Deal Status Breakdown</h3>
                    <div className="flex items-center">
                      <ResponsiveContainer width="50%" height={200}>
                        <PieChart>
                          <Pie data={statusBreakdown} cx="50%" cy="50%" outerRadius={80} dataKey="value" strokeWidth={0}>
                            {statusBreakdown.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="space-y-2">
                        {statusBreakdown.map((item, i) => (
                          <div key={item.name} className="flex items-center gap-2 text-xs">
                            <div className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                            <span className="text-muted-foreground">{item.name}</span>
                            <span className="font-medium">{item.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* REP PERFORMANCE TAB */}
            {activeTab === "reps" && (
              <div className="space-y-6">
                {repData.length === 0 ? (
                  <div className="glass rounded-xl p-10 text-center">
                    <p className="text-muted-foreground text-sm">No rep data available yet.</p>
                  </div>
                ) : (
                  <>
                    {/* Leaderboard cards */}
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {repData.slice(0, 6).map((rep, i) => (
                        <div key={rep.name} className={`glass rounded-xl p-4 border ${i === 0 ? "border-primary/30 bg-primary/5" : "border-border"}`}>
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                                i === 0 ? "bg-primary text-primary-foreground" :
                                i === 1 ? "bg-accent/20 text-accent" :
                                "bg-secondary text-muted-foreground"
                              }`}>
                                {i + 1}
                              </div>
                              <span className="text-sm font-semibold">{rep.name}</span>
                            </div>
                            {i === 0 && <Award className="w-4 h-4 text-primary" />}
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-center">
                            <div>
                              <div className="text-lg font-bold font-display text-primary">{rep.winRate}%</div>
                              <div className="text-[10px] text-muted-foreground">Win Rate</div>
                            </div>
                            <div>
                              <div className="text-lg font-bold font-display">{rep.calls}</div>
                              <div className="text-[10px] text-muted-foreground">Calls</div>
                            </div>
                            <div>
                              <div className="text-lg font-bold font-display text-accent">{rep.avgSentiment}%</div>
                              <div className="text-[10px] text-muted-foreground">Sentiment</div>
                            </div>
                          </div>
                          {/* Win rate bar */}
                          <div className="mt-3">
                            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                              <div
                                className="h-full bg-primary transition-all"
                                style={{ width: `${rep.winRate}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Win rate comparison chart */}
                    <div className="glass rounded-xl p-5">
                      <h3 className="font-display font-semibold text-sm mb-4">Win Rate by Rep</h3>
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={repData} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 30%, 18%)" horizontal={false} />
                          <XAxis type="number" domain={[0, 100]} tick={axisProps} axisLine={false} tickFormatter={v => `${v}%`} />
                          <YAxis type="category" dataKey="name" tick={axisProps} axisLine={false} width={80} />
                          <Tooltip {...tooltipStyle} formatter={(v: number) => [`${v}%`, "Win Rate"]} />
                          <Bar dataKey="winRate" fill="hsl(174, 72%, 50%)" radius={[0, 4, 4, 0]} name="Win Rate %" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Sentiment comparison */}
                    <div className="glass rounded-xl p-5">
                      <h3 className="font-display font-semibold text-sm mb-4">Average Sentiment by Rep</h3>
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={repData} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 30%, 18%)" horizontal={false} />
                          <XAxis type="number" domain={[0, 100]} tick={axisProps} axisLine={false} tickFormatter={v => `${v}%`} />
                          <YAxis type="category" dataKey="name" tick={axisProps} axisLine={false} width={80} />
                          <Tooltip {...tooltipStyle} formatter={(v: number) => [`${v}%`, "Avg Sentiment"]} />
                          <Bar dataKey="avgSentiment" fill="hsl(38, 92%, 55%)" radius={[0, 4, 4, 0]} name="Avg Sentiment %" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* TRENDS TAB */}
            {activeTab === "trends" && (
              <div className="grid lg:grid-cols-2 gap-6">
                <div className="glass rounded-xl p-5">
                  <h3 className="font-display font-semibold text-sm mb-1">Weekly Call Volume</h3>
                  <p className="text-xs text-muted-foreground mb-4">Last 4 weeks</p>
                  <ResponsiveContainer width="100%" height={240}>
                    <LineChart data={trendData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 30%, 18%)" />
                      <XAxis dataKey="week" tick={axisProps} axisLine={false} />
                      <YAxis tick={axisProps} axisLine={false} />
                      <Tooltip {...tooltipStyle} />
                      <Line type="monotone" dataKey="calls" stroke="hsl(270, 60%, 60%)" strokeWidth={2} dot={{ r: 4, fill: "hsl(270, 60%, 60%)" }} name="Calls" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div className="glass rounded-xl p-5">
                  <h3 className="font-display font-semibold text-sm mb-1">Win Rate Trend</h3>
                  <p className="text-xs text-muted-foreground mb-4">Weekly win rate over last 4 weeks</p>
                  <ResponsiveContainer width="100%" height={240}>
                    <LineChart data={trendData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 30%, 18%)" />
                      <XAxis dataKey="week" tick={axisProps} axisLine={false} />
                      <YAxis domain={[0, 100]} tick={axisProps} axisLine={false} tickFormatter={v => `${v}%`} />
                      <Tooltip {...tooltipStyle} formatter={(v: number) => [`${v}%`, "Win Rate"]} />
                      <Line type="monotone" dataKey="winRate" stroke="hsl(174, 72%, 50%)" strokeWidth={2} dot={{ r: 4, fill: "hsl(174, 72%, 50%)" }} name="Win Rate %" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div className="glass rounded-xl p-5 lg:col-span-2">
                  <h3 className="font-display font-semibold text-sm mb-1">Sentiment Trend</h3>
                  <p className="text-xs text-muted-foreground mb-4">Average prospect sentiment over last 4 weeks</p>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={trendData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 30%, 18%)" />
                      <XAxis dataKey="week" tick={axisProps} axisLine={false} />
                      <YAxis domain={[0, 100]} tick={axisProps} axisLine={false} tickFormatter={v => `${v}%`} />
                      <Tooltip {...tooltipStyle} formatter={(v: number) => [`${v}%`, "Avg Sentiment"]} />
                      <Bar dataKey="sentiment" fill="hsl(38, 92%, 55%)" radius={[4, 4, 0, 0]} name="Sentiment %" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}