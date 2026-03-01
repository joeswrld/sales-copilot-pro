import DashboardLayout from "@/components/DashboardLayout";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from "recharts";

const weeklyData = [
  { name: "Mon", calls: 5, wins: 3 },
  { name: "Tue", calls: 8, wins: 5 },
  { name: "Wed", calls: 6, wins: 4 },
  { name: "Thu", calls: 9, wins: 7 },
  { name: "Fri", calls: 7, wins: 5 },
];

const sentimentTrend = [
  { day: "Feb 24", score: 68 },
  { day: "Feb 25", score: 72 },
  { day: "Feb 26", score: 65 },
  { day: "Feb 27", score: 78 },
  { day: "Feb 28", score: 74 },
  { day: "Mar 1", score: 82 },
];

const objectionTypes = [
  { name: "Pricing", value: 35 },
  { name: "Competitor", value: 25 },
  { name: "Timeline", value: 20 },
  { name: "Authority", value: 15 },
  { name: "Other", value: 5 },
];

const COLORS = [
  "hsl(174, 72%, 50%)",
  "hsl(38, 92%, 55%)",
  "hsl(270, 60%, 60%)",
  "hsl(152, 60%, 48%)",
  "hsl(215, 20%, 55%)",
];

export default function Analytics() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold font-display">Analytics</h1>
          <p className="text-sm text-muted-foreground">Track performance metrics and identify trends</p>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Calls & Wins */}
          <div className="glass rounded-xl p-5">
            <h3 className="font-display font-semibold text-sm mb-4">Calls & Wins This Week</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={weeklyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 30%, 18%)" />
                <XAxis dataKey="name" tick={{ fill: "hsl(215, 20%, 55%)", fontSize: 12 }} axisLine={false} />
                <YAxis tick={{ fill: "hsl(215, 20%, 55%)", fontSize: 12 }} axisLine={false} />
                <Tooltip contentStyle={{ background: "hsl(222, 44%, 9%)", border: "1px solid hsl(222, 30%, 18%)", borderRadius: 8, color: "hsl(210, 40%, 96%)" }} />
                <Bar dataKey="calls" fill="hsl(222, 30%, 25%)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="wins" fill="hsl(174, 72%, 50%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Sentiment Trend */}
          <div className="glass rounded-xl p-5">
            <h3 className="font-display font-semibold text-sm mb-4">Average Sentiment Score</h3>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={sentimentTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 30%, 18%)" />
                <XAxis dataKey="day" tick={{ fill: "hsl(215, 20%, 55%)", fontSize: 12 }} axisLine={false} />
                <YAxis domain={[50, 100]} tick={{ fill: "hsl(215, 20%, 55%)", fontSize: 12 }} axisLine={false} />
                <Tooltip contentStyle={{ background: "hsl(222, 44%, 9%)", border: "1px solid hsl(222, 30%, 18%)", borderRadius: 8, color: "hsl(210, 40%, 96%)" }} />
                <Line type="monotone" dataKey="score" stroke="hsl(174, 72%, 50%)" strokeWidth={2} dot={{ fill: "hsl(174, 72%, 50%)", r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Objection Breakdown */}
          <div className="glass rounded-xl p-5">
            <h3 className="font-display font-semibold text-sm mb-4">Objection Types</h3>
            <div className="flex items-center">
              <ResponsiveContainer width="50%" height={200}>
                <PieChart>
                  <Pie data={objectionTypes} cx="50%" cy="50%" outerRadius={80} dataKey="value" strokeWidth={0}>
                    {objectionTypes.map((_, i) => (
                      <Cell key={i} fill={COLORS[i]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2">
                {objectionTypes.map((item, i) => (
                  <div key={item.name} className="flex items-center gap-2 text-xs">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS[i] }} />
                    <span className="text-muted-foreground">{item.name}</span>
                    <span className="font-medium">{item.value}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Top Performers */}
          <div className="glass rounded-xl p-5">
            <h3 className="font-display font-semibold text-sm mb-4">Top Performers</h3>
            <div className="space-y-4">
              {[
                { name: "Sarah Lee", calls: 42, winRate: 78, avatar: "S" },
                { name: "John Smith", calls: 38, winRate: 72, avatar: "J" },
                { name: "Mike Chen", calls: 35, winRate: 65, avatar: "M" },
              ].map((p, i) => (
                <div key={p.name} className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-4">{i + 1}</span>
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-bold">{p.avatar}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.calls} calls</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-primary">{p.winRate}%</p>
                    <p className="text-xs text-muted-foreground">win rate</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
