import DashboardLayout from "@/components/DashboardLayout";
import { Link } from "react-router-dom";
import { Search, Filter } from "lucide-react";
import { useState } from "react";

const calls = [
  { id: "1", name: "Acme Corp - Demo Call", rep: "John Smith", date: "Mar 1, 2026", duration: "34 min", sentiment: 87, objections: 3, status: "Won" },
  { id: "2", name: "TechFlow - Discovery", rep: "John Smith", date: "Mar 1, 2026", duration: "28 min", sentiment: 72, objections: 2, status: "In Progress" },
  { id: "3", name: "DataSync - Negotiation", rep: "Sarah Lee", date: "Feb 28, 2026", duration: "45 min", sentiment: 64, objections: 5, status: "At Risk" },
  { id: "4", name: "CloudBase - Proposal Review", rep: "John Smith", date: "Feb 28, 2026", duration: "22 min", sentiment: 91, objections: 1, status: "Won" },
  { id: "5", name: "NetWave - Intro Call", rep: "Mike Chen", date: "Feb 27, 2026", duration: "18 min", sentiment: 55, objections: 4, status: "Lost" },
  { id: "6", name: "QuantumAI - Technical Review", rep: "Sarah Lee", date: "Feb 27, 2026", duration: "52 min", sentiment: 78, objections: 2, status: "In Progress" },
];

const statusColors: Record<string, string> = {
  "Won": "bg-success/10 text-success",
  "In Progress": "bg-primary/10 text-primary",
  "At Risk": "bg-accent/10 text-accent",
  "Lost": "bg-destructive/10 text-destructive",
};

export default function CallsList() {
  const [search, setSearch] = useState("");
  const filtered = calls.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold font-display">Calls</h1>
          <p className="text-sm text-muted-foreground">Review past calls with AI-powered insights</p>
        </div>

        <div className="flex gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search calls..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg bg-secondary border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        <div className="glass rounded-xl overflow-hidden">
          {/* Table Header */}
          <div className="hidden md:grid grid-cols-6 gap-4 p-4 text-xs font-medium text-muted-foreground border-b border-border">
            <span className="col-span-2">Call</span>
            <span>Duration</span>
            <span>Sentiment</span>
            <span>Objections</span>
            <span>Status</span>
          </div>
          <div className="divide-y divide-border">
            {filtered.map(call => (
              <Link key={call.id} to={`/dashboard/calls/${call.id}`}
                className="grid grid-cols-1 md:grid-cols-6 gap-2 md:gap-4 p-4 hover:bg-secondary/30 transition-colors items-center">
                <div className="md:col-span-2 min-w-0">
                  <p className="font-medium text-sm truncate">{call.name}</p>
                  <p className="text-xs text-muted-foreground">{call.rep} · {call.date}</p>
                </div>
                <span className="text-sm text-muted-foreground">{call.duration}</span>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-12 rounded-full bg-muted">
                    <div className="h-1.5 rounded-full bg-primary" style={{ width: `${call.sentiment}%` }} />
                  </div>
                  <span className="text-xs text-muted-foreground">{call.sentiment}%</span>
                </div>
                <span className="text-sm text-muted-foreground">{call.objections}</span>
                <span className={`text-xs px-2 py-1 rounded-full w-fit ${statusColors[call.status]}`}>{call.status}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
