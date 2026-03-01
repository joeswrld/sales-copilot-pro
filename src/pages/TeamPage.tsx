import DashboardLayout from "@/components/DashboardLayout";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const teamMembers = [
  { name: "Sarah Lee", role: "Senior AE", calls: 42, winRate: 78, avgSentiment: 82, objectionRate: 91 },
  { name: "John Smith", role: "Account Executive", calls: 38, winRate: 72, avgSentiment: 76, objectionRate: 89 },
  { name: "Mike Chen", role: "SDR", calls: 35, winRate: 65, avgSentiment: 71, objectionRate: 78 },
  { name: "Lisa Park", role: "Account Executive", calls: 29, winRate: 69, avgSentiment: 79, objectionRate: 85 },
];

const teamTrend = [
  { week: "W1", avgWin: 62 },
  { week: "W2", avgWin: 65 },
  { week: "W3", avgWin: 68 },
  { week: "W4", avgWin: 71 },
];

export default function TeamPage() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold font-display">Team</h1>
          <p className="text-sm text-muted-foreground">Monitor team performance and coaching insights</p>
        </div>

        {/* Team Win Rate Trend */}
        <div className="glass rounded-xl p-5">
          <h3 className="font-display font-semibold text-sm mb-4">Team Win Rate Trend</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={teamTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 30%, 18%)" />
              <XAxis dataKey="week" tick={{ fill: "hsl(215, 20%, 55%)", fontSize: 12 }} axisLine={false} />
              <YAxis domain={[50, 80]} tick={{ fill: "hsl(215, 20%, 55%)", fontSize: 12 }} axisLine={false} />
              <Tooltip contentStyle={{ background: "hsl(222, 44%, 9%)", border: "1px solid hsl(222, 30%, 18%)", borderRadius: 8, color: "hsl(210, 40%, 96%)" }} />
              <Bar dataKey="avgWin" fill="hsl(174, 72%, 50%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Team Members Table */}
        <div className="glass rounded-xl overflow-hidden">
          <div className="p-4 border-b border-border">
            <h3 className="font-display font-semibold text-sm">Team Members</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-4 text-xs font-medium text-muted-foreground">Rep</th>
                  <th className="text-left p-4 text-xs font-medium text-muted-foreground">Calls</th>
                  <th className="text-left p-4 text-xs font-medium text-muted-foreground">Win Rate</th>
                  <th className="text-left p-4 text-xs font-medium text-muted-foreground">Avg Sentiment</th>
                  <th className="text-left p-4 text-xs font-medium text-muted-foreground">Objection Handling</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {teamMembers.map(m => (
                  <tr key={m.name} className="hover:bg-secondary/30 transition-colors">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-bold">
                          {m.name[0]}
                        </div>
                        <div>
                          <p className="text-sm font-medium">{m.name}</p>
                          <p className="text-xs text-muted-foreground">{m.role}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 text-sm">{m.calls}</td>
                    <td className="p-4">
                      <span className="text-sm font-medium text-primary">{m.winRate}%</span>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-12 rounded-full bg-muted">
                          <div className="h-1.5 rounded-full bg-primary" style={{ width: `${m.avgSentiment}%` }} />
                        </div>
                        <span className="text-xs text-muted-foreground">{m.avgSentiment}%</span>
                      </div>
                    </td>
                    <td className="p-4">
                      <span className="text-sm text-success">{m.objectionRate}%</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
