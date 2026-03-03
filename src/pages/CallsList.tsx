import DashboardLayout from "@/components/DashboardLayout";
import { Link } from "react-router-dom";
import { Search, Plus, Trash2, Loader2 } from "lucide-react";
import { useState } from "react";
import { useCalls, useCreateCall, useDeleteCall } from "@/hooks/useCalls";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { format } from "date-fns";

const statusColors: Record<string, string> = {
  "Won": "bg-success/10 text-success",
  "In Progress": "bg-primary/10 text-primary",
  "At Risk": "bg-accent/10 text-accent",
  "Lost": "bg-destructive/10 text-destructive",
};

export default function CallsList() {
  const [search, setSearch] = useState("");
  const [newCallOpen, setNewCallOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [newCall, setNewCall] = useState({ name: "", status: "In Progress" });

  const { data: calls, isLoading } = useCalls();
  const createCall = useCreateCall();
  const deleteCall = useDeleteCall();

  const filtered = (calls || []).filter(c => c.name.toLowerCase().includes(search.toLowerCase()));

  const handleCreate = async () => {
    if (!newCall.name.trim()) return;
    try {
      await createCall.mutateAsync({ name: newCall.name, status: newCall.status });
      setNewCall({ name: "", status: "In Progress" });
      setNewCallOpen(false);
      toast.success("Call created");
    } catch { toast.error("Failed to create call"); }
  };

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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold font-display">Calls</h1>
            <p className="text-sm text-muted-foreground">Review past calls with AI-powered insights</p>
          </div>
          <Dialog open={newCallOpen} onOpenChange={setNewCallOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5"><Plus className="w-3 h-3" /> New Call</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add New Call</DialogTitle></DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label>Call Name</Label>
                  <Input placeholder="e.g. Acme Corp - Demo" value={newCall.name} onChange={e => setNewCall(p => ({ ...p, name: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={newCall.status} onValueChange={v => setNewCall(p => ({ ...p, status: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="In Progress">In Progress</SelectItem>
                      <SelectItem value="Won">Won</SelectItem>
                      <SelectItem value="At Risk">At Risk</SelectItem>
                      <SelectItem value="Lost">Lost</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                <Button onClick={handleCreate} disabled={createCall.isPending}>
                  {createCall.isPending && <Loader2 className="w-3 h-3 animate-spin mr-1" />} Create
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
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
            <p className="text-muted-foreground text-sm">No calls found. Create your first call to get started.</p>
          </div>
        ) : (
          <div className="glass rounded-xl overflow-hidden">
            <div className="hidden md:grid grid-cols-7 gap-4 p-4 text-xs font-medium text-muted-foreground border-b border-border">
              <span className="col-span-2">Call</span>
              <span>Duration</span>
              <span>Sentiment</span>
              <span>Objections</span>
              <span>Status</span>
              <span />
            </div>
            <div className="divide-y divide-border">
              {filtered.map(call => (
                <div key={call.id} className="grid grid-cols-1 md:grid-cols-7 gap-2 md:gap-4 p-4 hover:bg-secondary/30 transition-colors items-center">
                  <Link to={`/dashboard/calls/${call.id}`} className="md:col-span-2 min-w-0">
                    <p className="font-medium text-sm truncate">{call.name}</p>
                    <p className="text-xs text-muted-foreground">{format(new Date(call.date), "MMM d, yyyy")}</p>
                  </Link>
                  <span className="text-sm text-muted-foreground">{call.duration_minutes ? `${call.duration_minutes} min` : "—"}</span>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-12 rounded-full bg-muted">
                      <div className="h-1.5 rounded-full bg-primary" style={{ width: `${call.sentiment_score || 0}%` }} />
                    </div>
                    <span className="text-xs text-muted-foreground">{call.sentiment_score || 0}%</span>
                  </div>
                  <span className="text-sm text-muted-foreground">{call.objections_count || 0}</span>
                  <span className={`text-xs px-2 py-1 rounded-full w-fit ${statusColors[call.status || ""] || "bg-secondary text-secondary-foreground"}`}>{call.status}</span>
                  <button onClick={() => setDeleteId(call.id)} className="text-muted-foreground hover:text-destructive transition-colors justify-self-end">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
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
