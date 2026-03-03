import DashboardLayout from "@/components/DashboardLayout";
import { Link } from "react-router-dom";
import { Search, Trash2, Loader2 } from "lucide-react";
import { useState } from "react";
import { useCalls, useDeleteCall } from "@/hooks/useCalls";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { toast } from "sonner";
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
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: calls, isLoading } = useCalls();
  const deleteCall = useDeleteCall();

  const filtered = (calls || []).filter(c => c.name.toLowerCase().includes(search.toLowerCase()));

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteCall.mutateAsync(deleteId);
      setDeleteId(null);
      toast.success("Call deleted");
    } catch { toast.error("Failed to delete call"); }
  };

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
            <div className="hidden md:grid grid-cols-7 gap-4 p-4 text-xs font-medium text-muted-foreground border-b border-border">
              <span className="col-span-2">Call</span>
              <span>Platform</span>
              <span>Duration</span>
              <span>Engagement</span>
              <span>Status</span>
              <span />
            </div>
            <div className="divide-y divide-border">
              {filtered.map(call => {
                const isLive = call.status === "live";
                return (
                  <div key={call.id} className="grid grid-cols-1 md:grid-cols-7 gap-2 md:gap-4 p-4 hover:bg-secondary/30 transition-colors items-center">
                    <Link to={isLive ? "/dashboard/live" : `/dashboard/calls/${call.id}`} className="md:col-span-2 min-w-0">
                      <div className="flex items-center gap-2">
                        {isLive && <span className="w-2 h-2 rounded-full bg-destructive animate-pulse-glow shrink-0" />}
                        <p className="font-medium text-sm truncate">{call.name}</p>
                      </div>
                      <p className="text-xs text-muted-foreground">{format(new Date(call.date), "MMM d, yyyy")}</p>
                    </Link>
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
                    <button onClick={() => setDeleteId(call.id)} className="text-muted-foreground hover:text-destructive transition-colors justify-self-end">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete this call?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This action cannot be undone.</p>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteCall.isPending}>
              {deleteCall.isPending && <Loader2 className="w-3 h-3 animate-spin mr-1" />} Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
