import DashboardLayout from "@/components/DashboardLayout";
import { useParams, Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Download, Clock, Users, TrendingUp, AlertCircle, CheckCircle, Loader2, Pencil, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCallDetail, useUpdateCall } from "@/hooks/useCalls";
import { format } from "date-fns";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Json } from "@/integrations/supabase/types";

interface Objection {
  text: string;
  handled: boolean;
  response: string;
}

interface TranscriptLine {
  time: string;
  speaker: string;
  text: string;
}

export default function CallDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { call, summary } = useCallDetail(id);
  const updateCall = useUpdateCall();
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");

  const callData = call.data;
  const summaryData = summary.data;

  if (call.isLoading) {
    return <DashboardLayout><div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div></DashboardLayout>;
  }

  if (!callData) {
    return <DashboardLayout><div className="text-center py-20"><p className="text-muted-foreground">Call not found.</p><Link to="/dashboard/calls" className="text-primary text-sm mt-2 inline-block">← Back to calls</Link></div></DashboardLayout>;
  }

  const objections = (summaryData?.objections as unknown as Objection[] | null) || [];
  const transcript = (summaryData?.transcript as unknown as TranscriptLine[] | null) || [];

  const handleSaveName = async () => {
    try {
      await updateCall.mutateAsync({ id: callData.id, name: editName });
      setEditing(false);
      toast.success("Call updated");
    } catch { toast.error("Failed to update"); }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-4xl">
        <div className="flex items-center gap-3">
          <Link to="/dashboard/calls">
            <Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
          </Link>
          <div className="flex-1 min-w-0">
            {editing ? (
              <div className="flex items-center gap-2">
                <Input value={editName} onChange={e => setEditName(e.target.value)} className="h-8" />
                <Button size="icon" variant="ghost" onClick={handleSaveName}><Save className="w-4 h-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => setEditing(false)}><X className="w-4 h-4" /></Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold font-display truncate">{callData.name}</h1>
                <button onClick={() => { setEditing(true); setEditName(callData.name); }} className="text-muted-foreground hover:text-foreground"><Pencil className="w-3 h-3" /></button>
              </div>
            )}
            <p className="text-sm text-muted-foreground">{format(new Date(callData.date), "MMMM d, yyyy 'at' h:mm a")}</p>
          </div>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="glass rounded-lg p-3">
            <div className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" /> Duration</div>
            <div className="font-bold font-display mt-1">{callData.duration_minutes ? `${callData.duration_minutes} min` : "—"}</div>
          </div>
          <div className="glass rounded-lg p-3">
            <div className="text-xs text-muted-foreground flex items-center gap-1"><Users className="w-3 h-3" /> Participants</div>
            <div className="font-bold font-display mt-1">{callData.participants?.length || 0}</div>
          </div>
          <div className="glass rounded-lg p-3">
            <div className="text-xs text-muted-foreground flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Sentiment</div>
            <div className="font-bold font-display mt-1 text-primary">{callData.sentiment_score || 0}%</div>
          </div>
          <div className="glass rounded-lg p-3">
            <div className="text-xs text-muted-foreground flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Deal Score</div>
            <div className="font-bold font-display mt-1 text-success">{callData.deal_score || "—"}</div>
          </div>
        </div>

        {/* Summary */}
        {summaryData?.summary && (
          <div className="glass rounded-xl p-5">
            <h2 className="font-display font-semibold mb-3">AI Summary</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">{summaryData.summary}</p>
          </div>
        )}

        {/* Key Decisions & Next Steps */}
        {((summaryData?.key_decisions?.length || 0) > 0 || (summaryData?.next_steps?.length || 0) > 0) && (
          <div className="grid md:grid-cols-2 gap-4">
            {(summaryData?.key_decisions?.length || 0) > 0 && (
              <div className="glass rounded-xl p-5">
                <h2 className="font-display font-semibold mb-3">Key Decisions</h2>
                <ul className="space-y-2">
                  {summaryData!.key_decisions!.map((d, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <CheckCircle className="w-4 h-4 text-success shrink-0 mt-0.5" />{d}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {(summaryData?.next_steps?.length || 0) > 0 && (
              <div className="glass rounded-xl p-5">
                <h2 className="font-display font-semibold mb-3">Next Steps</h2>
                <ul className="space-y-2">
                  {summaryData!.next_steps!.map((s, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 text-xs font-bold mt-0.5">{i + 1}</span>{s}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Objections */}
        {objections.length > 0 && (
          <div className="glass rounded-xl p-5">
            <h2 className="font-display font-semibold mb-3">Objections ({objections.length})</h2>
            <div className="space-y-3">
              {objections.map((obj, i) => (
                <div key={i} className="rounded-lg border border-border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium">{obj.text}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${obj.handled ? "bg-success/10 text-success" : "bg-accent/10 text-accent"}`}>
                      {obj.handled ? "Handled" : "Open"}
                    </span>
                  </div>
                  {obj.response && <p className="text-xs text-muted-foreground mt-2">Response: {obj.response}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Transcript */}
        {transcript.length > 0 && (
          <div className="glass rounded-xl p-5">
            <h2 className="font-display font-semibold mb-3">Transcript</h2>
            <div className="space-y-4">
              {transcript.map((line, i) => (
                <div key={i} className={line.speaker !== "You" ? "pl-4 border-l-2 border-accent/40" : ""}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-medium ${line.speaker === "You" ? "text-primary" : "text-accent"}`}>{line.speaker}</span>
                    <span className="text-xs text-muted-foreground">{line.time}</span>
                  </div>
                  <p className="text-sm text-foreground/90">{line.text}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty state when no summary */}
        {!summaryData && !summary.isLoading && (
          <div className="glass rounded-xl p-10 text-center">
            <p className="text-muted-foreground text-sm">No AI summary available for this call yet.</p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
