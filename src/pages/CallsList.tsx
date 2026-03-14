import DashboardLayout from "@/components/DashboardLayout";
import { Link } from "react-router-dom";
import { Search, Loader2 } from "lucide-react";
import { useState } from "react";
import { useCalls } from "@/hooks/useCalls";
import { format } from "date-fns";

const statusColors: Record<string, string> = {
  "Won": "bg-success/10 text-success",
  "In Progress": "bg-primary/10 text-primary",
  "At Risk": "bg-accent/10 text-accent",
  "Lost": "bg-destructive/10 text-destructive",
  "live": "bg-destructive/10 text-destructive",
  "completed": "bg-success/10 text-success",
};

export default function CallsList() {
  const [search, setSearch] = useState("");

  const { data: calls, isLoading } = useCalls();

  const filtered = (calls || []).filter(c => c.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold font-display">Calls</h1>
          <p className="text-sm text-muted-foreground">Review past and live calls with AI-powered insights</p>
        </div>

        <div className="flex gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input type="text" placeholder="Search calls..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg bg-secondary border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : filtered.length === 0 ? (
          <div className="glass rounded-xl p-10 text-center">
            <p className="text-muted-foreground text-sm">No calls found. Calls are created automatically when you start a live meeting.</p>
          </div>
        ) : (
          <div className="glass rounded-xl overflow-hidden">
            <div className="hidden md:grid grid-cols-6 gap-4 p-4 text-xs font-medium text-muted-foreground border-b border-border">
              <span className="col-span-2">Call</span>
              <span>Platform</span>
              <span>Duration</span>
              <span>Engagement</span>
              <span>Status</span>
            </div>
            <div className="divide-y divide-border">
              {filtered.map(call => {
                const isLive = call.status === "live";
                return (
                  <Link
                    key={call.id}
                    to={isLive ? "/dashboard/live" : `/dashboard/calls/${call.id}`}
                    className="grid grid-cols-1 md:grid-cols-6 gap-2 md:gap-4 p-4 hover:bg-secondary/30 transition-colors items-center"
                  >
                    <div className="md:col-span-2 min-w-0">
                      <div className="flex items-center gap-2">
                        {isLive && <span className="w-2 h-2 rounded-full bg-destructive animate-pulse-glow shrink-0" />}
                        <p className="font-medium text-sm truncate">{call.name}</p>
                      </div>
                      <p className="text-xs text-muted-foreground">{format(new Date(call.date), "MMM d, yyyy")}</p>
                    </div>
                    <span className="text-sm text-muted-foreground">{(call as any).platform || "—"}</span>
                    <span className="text-sm text-muted-foreground">{call.duration_minutes ? `${call.duration_minutes} min` : isLive ? "In progress" : "—"}</span>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-12 rounded-full bg-muted">
                        <div className="h-1.5 rounded-full bg-primary" style={{ width: `${call.sentiment_score || 0}%` }} />
                      </div>
                      <span className="text-xs text-muted-foreground">{call.sentiment_score || 0}%</span>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full w-fit ${statusColors[call.status || ""] || "bg-secondary text-secondary-foreground"}`}>
                      {isLive ? "● LIVE" : call.status}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}