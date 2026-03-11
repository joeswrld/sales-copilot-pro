import DashboardLayout from "@/components/DashboardLayout";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from "recharts";
import { useCalls } from "@/hooks/useCalls";
import { Loader2 } from "lucide-react";
import { format, subDays, startOfDay } from "date-fns";
import { useMemo } from "react";

const COLORS = [
  "hsl(174, 72%, 50%)",
  "hsl(38, 92%, 55%)",
  "hsl(270, 60%, 60%)",
  "hsl(152, 60%, 48%)",
  "hsl(215, 20%, 55%)",
];

export default function Analytics() {
  const { data: calls, isLoading } = useCalls();

  const { dailyData, sentimentTrend, statusBreakdown } = useMemo(() => {
    if (!calls || calls.length === 0) return { dailyData: [], sentimentTrend: [], statusBreakdown: [] };

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

    // Sentiment trend (last 7 days with data)
    const sentiment = Array.from({ length: 7 }, (_, i) => {
      const date = subDays(new Date(), 6 - i);
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

    return { dailyData: days, sentimentTrend: sentiment, statusBreakdown: breakdown };
  }, [calls]);

  if (isLoading) {
    return <DashboardLayout><div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div></DashboardLayout>;
  }

  const noData = !calls || calls.length === 0;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold font-display">Analytics</h1>
          <p className="text-sm text-muted-foreground">Track performance metrics and identify trends</p>
        </div>

        {noData ? (
          <div className="glass rounded-xl p-10 text-center">
            <p className="text-muted-foreground text-sm">No data yet. Complete some calls to see your analytics.</p>
          </div>
        ) : (
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="glass rounded-xl p-5">
              <h3 className="font-display font-semibold text-sm mb-4">Calls & Wins (Last 7 Days)</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 30%, 18%)" />
                  <XAxis dataKey="name" tick={{ fill: "hsl(215, 20%, 55%)", fontSize: 12 }} axisLine={false} />
                  <YAxis tick={{ fill: "hsl(215, 20%, 55%)", fontSize: 12 }} axisLine={false} />
                  <Tooltip contentStyle={{ background: "hsl(222, 44%, 9%)", border: "1px solid hsl(222, 30%, 18%)", borderRadius: 8, color: "hsl(210, 40%, 96%)" }} />
                  <Bar dataKey="calls" fill="hsl(222, 30%, 25%)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="wins" fill="hsl(174, 72%, 50%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {sentimentTrend.length > 1 && (
              <div className="glass rounded-xl p-5">
                <h3 className="font-display font-semibold text-sm mb-4">Average Sentiment Score</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={sentimentTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 30%, 18%)" />
                    <XAxis dataKey="day" tick={{ fill: "hsl(215, 20%, 55%)", fontSize: 12 }} axisLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fill: "hsl(215, 20%, 55%)", fontSize: 12 }} axisLine={false} />
                    <Tooltip contentStyle={{ background: "hsl(222, 44%, 9%)", border: "1px solid hsl(222, 30%, 18%)", borderRadius: 8, color: "hsl(210, 40%, 96%)" }} />
                    <Line type="monotone" dataKey="score" stroke="hsl(174, 72%, 50%)" strokeWidth={2} dot={{ fill: "hsl(174, 72%, 50%)", r: 4 }} />
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
        )}
      </div>
    </DashboardLayout>
  );
}