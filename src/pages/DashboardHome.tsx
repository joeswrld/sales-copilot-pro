import DashboardLayout from "@/components/DashboardLayout";
import { Phone, TrendingUp, AlertTriangle, CheckCircle } from "lucide-react";

const stats = [
  { label: "Total Calls", value: "127", change: "+12%", icon: Phone, color: "text-primary" },
  { label: "Win Rate", value: "68%", change: "+5%", icon: TrendingUp, color: "text-success" },
  { label: "Objections Handled", value: "89%", change: "+3%", icon: CheckCircle, color: "text-accent" },
  { label: "At-Risk Deals", value: "4", change: "-2", icon: AlertTriangle, color: "text-destructive" },
];

const recentCalls = [
  { id: 1, name: "Acme Corp - Demo Call", date: "Today, 2:30 PM", duration: "34 min", sentiment: 87, status: "Completed" },
  { id: 2, name: "TechFlow - Discovery", date: "Today, 11:00 AM", duration: "28 min", sentiment: 72, status: "Completed" },
  { id: 3, name: "DataSync - Negotiation", date: "Yesterday", duration: "45 min", sentiment: 64, status: "Follow-up" },
  { id: 4, name: "CloudBase - Proposal", date: "Yesterday", duration: "22 min", sentiment: 91, status: "Completed" },
];

export default function DashboardHome() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold font-display">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Welcome back, John. Here's your sales performance overview.</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map(s => (
            <div key={s.label} className="glass rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground">{s.label}</span>
                <s.icon className={`w-4 h-4 ${s.color}`} />
              </div>
              <div className="text-2xl font-bold font-display">{s.value}</div>
              <span className="text-xs text-success">{s.change} from last month</span>
            </div>
          ))}
        </div>

        {/* Recent Calls */}
        <div className="glass rounded-xl overflow-hidden">
          <div className="p-4 border-b border-border">
            <h2 className="font-display font-semibold">Recent Calls</h2>
          </div>
          <div className="divide-y divide-border">
            {recentCalls.map(call => (
              <div key={call.id} className="flex items-center justify-between p-4 hover:bg-secondary/30 transition-colors">
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{call.name}</p>
                  <p className="text-xs text-muted-foreground">{call.date} · {call.duration}</p>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <div className="hidden sm:flex items-center gap-2">
                    <div className="h-1.5 w-16 rounded-full bg-muted">
                      <div className="h-1.5 rounded-full bg-primary" style={{ width: `${call.sentiment}%` }} />
                    </div>
                    <span className="text-xs text-muted-foreground">{call.sentiment}%</span>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full ${call.status === "Completed" ? "bg-success/10 text-success" : "bg-accent/10 text-accent"}`}>
                    {call.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
