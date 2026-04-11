import DashboardLayout from "@/components/DashboardLayout";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Clock, Users, TrendingUp, AlertCircle, CheckCircle,
  Loader2, Pencil, Save, X, BarChart3, Target, Sparkles, MessageSquare,
  Bot, ChevronRight, Calendar, FileText, Lightbulb, ShieldAlert, Video, Download
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCallDetail, useUpdateCall } from "@/hooks/useCalls";
import { format } from "date-fns";
import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

import TranscriptClipSelector from "@/components/coaching/TranscriptClipSelector";
import { useCoachingClips } from "@/hooks/useCoachingClips";
import { useCallAction } from "@/hooks/useCallActions";
import { toast } from "sonner";

interface Objection {
  text?: string;
  type?: string;
  handled?: boolean;
  response?: string;
  suggestion?: string;
  confidence?: number;
}

interface TranscriptLine {
  time?: string;
  timestamp?: string;
  speaker: string;
  text: string;
}

function parseTimeToSeconds(time?: string) {
  if (!time) return 0;
  const parts = time.split(":").map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

function statusColor(status?: string | null) {
  switch (status) {
    case "completed": return "bg-green-500/10 text-green-400 border-green-500/20";
    case "Won": return "bg-green-500/10 text-green-400 border-green-500/20";
    case "In Progress": return "bg-blue-500/10 text-blue-400 border-blue-500/20";
    case "At Risk": return "bg-red-500/10 text-red-400 border-red-500/20";
    default: return "bg-muted text-muted-foreground";
  }
}

export default function CallDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const { call, summary } = useCallDetail(id);
  const { useCallClips } = useCoachingClips();
  const { data: callClips = [] } = useCallClips(id ?? null);
  const updateCall = useUpdateCall();

  const { action, isLoading: actionLoading, generate: generateAction, toggleComplete, markCrmPushed } = useCallAction(id);

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");

  const callData = call.data;
  const summaryData = summary.data;

  const objections = (summaryData?.objections as unknown as Objection[]) || [];
  const rawTranscript = (summaryData?.transcript as unknown as TranscriptLine[]) || [];
  const topics = summaryData?.topics || [];
  const nextSteps = summaryData?.next_steps || [];
  const actionItems = summaryData?.action_items || [];
  const keyDecisions = summaryData?.key_decisions || [];
  const buyingSignals = summaryData?.buying_signals || [];
  const summaryText = summaryData?.summary || "";
  const meetingScore = summaryData?.meeting_score;
  const talkRatio = summaryData?.talk_ratio as Record<string, number> | null;

  const normalizedTranscript = useMemo(() => {
    if (!Array.isArray(rawTranscript)) return [];
    return rawTranscript.map((line, index) => {
      const start = parseTimeToSeconds(line.time || line.timestamp);
      const nextLine = rawTranscript[index + 1];
      const end = nextLine
        ? parseTimeToSeconds(nextLine.time || nextLine.timestamp)
        : start + 5;
      return {
        ...line,
        timestamp: line.timestamp || line.time || "0:00",
        start,
        end,
      };
    });
  }, [rawTranscript]);

  const recordingUrl = callData?.recording_url || callData?.audio_url || null;

  if (call.isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  if (!callData) {
    return (
      <DashboardLayout>
        <div className="text-center py-20">
          <p className="text-muted-foreground">Call not found.</p>
          <Link to="/dashboard/calls">
            <Button variant="outline" className="mt-4">Back to Calls</Button>
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-4xl mx-auto">

        {/* Header */}
        <div className="flex items-center gap-3">
          <Link to="/dashboard/calls">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div className="flex-1">
            {editing ? (
              <div className="flex gap-2">
                <Input value={editName} onChange={e => setEditName(e.target.value)} />
                <Button size="sm" onClick={async () => {
                  await updateCall.mutateAsync({ id: callData.id, name: editName });
                  setEditing(false);
                }}>
                  <Save className="w-4 h-4" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <div className="flex gap-2 items-center">
                <h1 className="text-xl font-bold">{callData.name}</h1>
                <button onClick={() => { setEditing(true); setEditName(callData.name); }}
                  className="text-muted-foreground hover:text-foreground transition-colors">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
          <Badge className={statusColor(callData.status)}>{callData.status || "Unknown"}</Badge>
        </div>

        {/* Meta info cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MetaCard icon={<Calendar className="w-4 h-4" />} label="Date"
            value={format(new Date(callData.date), "MMM d, yyyy")} />
          <MetaCard icon={<Clock className="w-4 h-4" />} label="Duration"
            value={callData.duration_minutes ? `${callData.duration_minutes} min` : "N/A"} />
          <MetaCard icon={<TrendingUp className="w-4 h-4" />} label="Sentiment"
            value={callData.sentiment_score ? `${callData.sentiment_score}%` : "N/A"} />
          <MetaCard icon={<Target className="w-4 h-4" />} label="Score"
            value={meetingScore != null ? `${meetingScore}/100` : "N/A"} />
        </div>

        {/* Recording player */}
        {recordingUrl && (
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Video className="w-4 h-4 text-primary" /> Meeting Recording
              </h3>
              <a href={recordingUrl} target="_blank" rel="noopener noreferrer" download>
                <Button size="sm" variant="outline" className="gap-1.5 text-xs h-7">
                  <Download className="w-3 h-3" /> Download
                </Button>
              </a>
            </div>
            <video
              src={recordingUrl}
              controls
              className="w-full rounded-lg bg-black max-h-[400px]"
              preload="metadata"
            />
          </div>
        )}

        {/* AI Action Layer */}
        {callData.status === "completed" && summaryData && (
          <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" /> Priority Next Action
              </h3>
              {!action && !actionLoading && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-xs h-7"
                  onClick={() => generateAction.mutate(callData.id)}
                  disabled={generateAction.isPending}
                >
                  {generateAction.isPending ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Sparkles className="w-3 h-3" />
                  )}
                  Generate
                </Button>
              )}
            </div>

            {actionLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading...
              </div>
            )}

            {action && (
              <div className="space-y-3">
                {/* Priority action */}
                <div className="flex items-start gap-3">
                  <button
                    onClick={() => toggleComplete.mutate({ actionId: action.id, completed: !action.is_completed })}
                    className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                      action.is_completed
                        ? "bg-green-500 border-green-500 text-white"
                        : "border-muted-foreground/40 hover:border-primary"
                    }`}
                  >
                    {action.is_completed && <CheckCircle className="w-3 h-3" />}
                  </button>
                  <p className={`text-sm font-medium ${action.is_completed ? "line-through text-muted-foreground" : ""}`}>
                    {action.priority_action}
                  </p>
                </div>

                {/* Draft email */}
                {action.draft_email_subject && (
                  <div className="rounded-lg bg-card border border-border p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Draft Follow-up Email</p>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-xs gap-1"
                        onClick={() => {
                          const text = `Subject: ${action.draft_email_subject}\n\n${action.draft_email_body || ""}`;
                          navigator.clipboard.writeText(text);
                          toast.success("Email copied to clipboard!");
                        }}
                      >
                        <FileText className="w-3 h-3" /> Copy
                      </Button>
                    </div>
                    <p className="text-sm font-medium">{action.draft_email_subject}</p>
                    <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
                      {action.draft_email_body}
                    </p>
                  </div>
                )}

                {/* CRM push */}
<div className="flex items-center gap-2">
  {action.crm_pushed ? (
    <Badge className="bg-green-500/10 text-green-400 border-green-500/20 text-xs">
      <CheckCircle className="w-3 h-3 mr-1" />
      Pushed to {action.crm_provider || "CRM"}
    </Badge>
  ) : (
    <>
      <Button
        size="sm"
        variant="outline"
        className="h-7 text-xs gap-1"
        onClick={() =>
          markCrmPushed.mutate({
            actionId: action.id,
            provider: "hubspot",
          })
        }
      >
        Push to HubSpot
      </Button>

      <div className="relative group">
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs gap-1 opacity-50 cursor-not-allowed border-dashed"
          disabled
        >
          Salesforce
          <span className="text-[9px] font-bold text-violet-400 bg-violet-400/10 border border-violet-400/20 rounded-full px-1.5 py-0.5 ml-0.5">
            Soon
          </span>
        </Button>
      </div>
    </>
  )}
</div>

{/* Loading state */}
{generateAction.isPending && (
  <div className="flex items-center gap-2 text-sm text-muted-foreground">
    <Loader2 className="w-4 h-4 animate-spin" />
    Generating your next action...
  </div>
)}

        {/* Talk ratio */}
        {talkRatio && Object.keys(talkRatio).length > 0 && (
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" /> Talk Ratio
            </h3>
            <div className="space-y-2">
              {Object.entries(talkRatio).map(([speaker, pct]) => (
                <div key={speaker} className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-16 truncate">{speaker}</span>
                  <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Number(pct))}%` }} />
                  </div>
                  <span className="text-xs font-medium w-10 text-right">{Number(pct).toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Summary */}
        {summaryText && (
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" /> Summary
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{summaryText}</p>
          </div>
        )}

        {/* Topics */}
        {topics.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" /> Topics Discussed
            </h3>
            <div className="flex flex-wrap gap-2">
              {topics.map((t, i) => (
                <Badge key={i} variant="secondary" className="text-xs">{t}</Badge>
              ))}
            </div>
          </div>
        )}

        {/* Objections */}
        {objections.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-destructive" /> Objections ({objections.length})
            </h3>
            <div className="space-y-3">
              {objections.map((obj, i) => (
                <div key={i} className="rounded-lg bg-muted/50 p-3 space-y-1">
                  <div className="flex items-center gap-2">
                    {obj.handled ? (
                      <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                    ) : (
                      <AlertCircle className="w-3.5 h-3.5 text-destructive" />
                    )}
                    <span className="text-sm font-medium">{obj.type || obj.text || "Objection"}</span>
                    {obj.confidence != null && (
                      <span className="text-[10px] text-muted-foreground ml-auto">{(obj.confidence * 100).toFixed(0)}%</span>
                    )}
                  </div>
                  {obj.text && obj.type && <p className="text-xs text-muted-foreground">{obj.text}</p>}
                  {obj.suggestion && (
                    <p className="text-xs text-primary/80 flex items-start gap-1">
                      <Lightbulb className="w-3 h-3 mt-0.5 shrink-0" /> {obj.suggestion}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Buying signals */}
        {buyingSignals.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-green-400" /> Buying Signals
            </h3>
            <ul className="space-y-1">
              {buyingSignals.map((s, i) => (
                <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                  <CheckCircle className="w-3.5 h-3.5 text-green-400 mt-0.5 shrink-0" /> {s}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Next steps & Action items */}
        {(nextSteps.length > 0 || actionItems.length > 0) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {nextSteps.length > 0 && (
              <div className="rounded-xl border border-border bg-card p-4">
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <ChevronRight className="w-4 h-4 text-primary" /> Next Steps
                </h3>
                <ul className="space-y-1">
                  {nextSteps.map((s, i) => (
                    <li key={i} className="text-sm text-muted-foreground">• {s}</li>
                  ))}
                </ul>
              </div>
            )}
            {actionItems.length > 0 && (
              <div className="rounded-xl border border-border bg-card p-4">
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <Target className="w-4 h-4 text-primary" /> Action Items
                </h3>
                <ul className="space-y-1">
                  {actionItems.map((a, i) => (
                    <li key={i} className="text-sm text-muted-foreground">• {a}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Key decisions */}
        {keyDecisions.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-primary" /> Key Decisions
            </h3>
            <ul className="space-y-1">
              {keyDecisions.map((d, i) => (
                <li key={i} className="text-sm text-muted-foreground">• {d}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Transcript + Clip Selector */}
        {Array.isArray(normalizedTranscript) && normalizedTranscript.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-5">
            <h2 className="font-semibold mb-3 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-primary" />
              Transcript
            </h2>
            <TranscriptClipSelector
              callId={callData.id}
              callTitle={callData.name}
              transcriptLines={normalizedTranscript}
              recordingUrl={recordingUrl}
              existingClipCount={callClips.length}
            />
          </div>
        )}

        {/* No summary yet */}
        {!summary.isLoading && !summaryData && (
          <div className="rounded-xl border border-dashed border-border bg-card/50 p-8 text-center">
            <Bot className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No AI summary available yet for this call.</p>
            <p className="text-xs text-muted-foreground mt-1">Summaries are generated after the call ends.</p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

function MetaCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 flex items-center gap-3">
      <div className="text-primary">{icon}</div>
      <div>
        <p className="text-[10px] uppercase text-muted-foreground tracking-wider">{label}</p>
        <p className="text-sm font-semibold">{value}</p>
      </div>
    </div>
  );
}
