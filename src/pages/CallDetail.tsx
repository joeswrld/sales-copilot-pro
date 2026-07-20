import DashboardLayout from "@/components/DashboardLayout";
import { useParams, Link } from "react-router-dom";
import {
  ArrowLeft, Clock, AlertCircle, CheckCircle,
  Loader2, Pencil, Save, X, BarChart3, Target, Sparkles, MessageSquare,
  Bot, ChevronRight, Calendar, FileText, Lightbulb, ShieldAlert, Video, Download,
  Smile, Meh, Frown, Zap, HelpCircle, Mail, RefreshCw, Copy, TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCallDetail, useUpdateCall, useGenerateCallSummary } from "@/hooks/useCalls";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Briefcase } from "lucide-react";
import { format } from "date-fns";
import { useState, useMemo, useEffect, useRef } from "react";
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
  speaker_name?: string;
  text: string;
}

interface NextBestAction {
  text?: string;
  priority?: "high" | "medium" | "low";
}

interface QuestionAsked {
  question?: string;
  asked_by?: string;
  answered?: boolean;
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
    case "Won":       return "bg-green-500/10 text-green-400 border-green-500/20";
    case "In Progress": return "bg-blue-500/10 text-blue-400 border-blue-500/20";
    case "At Risk":   return "bg-red-500/10 text-red-400 border-red-500/20";
    default:          return "bg-muted text-muted-foreground";
  }
}

function scoreColor(score: number) {
  if (score >= 75) return "text-green-400";
  if (score >= 50) return "text-yellow-400";
  return "text-red-400";
}

function sentimentDisplay(sentiment?: string | null) {
  switch ((sentiment || "").toLowerCase()) {
    case "positive": return { icon: Smile, color: "text-green-400", label: "Positive" };
    case "negative": return { icon: Frown, color: "text-red-400", label: "Negative" };
    case "mixed": return { icon: Meh, color: "text-yellow-400", label: "Mixed" };
    default: return { icon: Meh, color: "text-muted-foreground", label: sentiment ? sentiment : "Neutral" };
  }
}

function normalizeNextBestAction(item: unknown): NextBestAction {
  if (typeof item === "string") return { text: item };
  if (item && typeof item === "object") return item as NextBestAction;
  return {};
}

function normalizeQuestion(item: unknown): QuestionAsked {
  if (typeof item === "string") return { question: item };
  if (item && typeof item === "object") return item as QuestionAsked;
  return {};
}

export default function CallDetail() {
  const { id } = useParams();

  const { call, summary } = useCallDetail(id);
  const { useCallClips }  = useCoachingClips();
  const { data: callClips = [] } = useCallClips(id ?? null);
  const updateCall = useUpdateCall();
  const generateSummary = useGenerateCallSummary();

  // The call is already linked to a deal (calls.deal_id) the moment it's
  // created — this just surfaces that link on the page. Re-fetches whenever
  // call.data.deal_id changes, which happens automatically because
  // useCallDetail already keeps `calls` in sync via Realtime.
  const dealId = call.data?.deal_id ?? null;
  const { data: linkedDeal } = useQuery({
    queryKey: ["call-linked-deal", dealId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("deals")
        .select("id, name, company, stage, deal_health_score")
        .eq("id", dealId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!dealId,
  });

  const {
    action,
    isLoading: actionLoading,
    generate: generateAction,
    toggleComplete,
    markCrmPushed,
  } = useCallAction(id);

  const [editing, setEditing]   = useState(false);
  const [editName, setEditName] = useState("");

  const callData    = call.data;
  const summaryData = summary.data;

  const objections    = (summaryData?.objections as unknown as Objection[]) || [];
  const rawTranscript  = (summaryData?.transcript as unknown as TranscriptLine[]) || [];
  const topics         = summaryData?.topics       || [];
  const nextBestActionsRaw = (summaryData?.next_best_actions as unknown as unknown[]) || summaryData?.next_steps || [];
  const actionItems    = summaryData?.action_items || [];
  const buyingSignals  = summaryData?.buying_signals || [];
  const summaryText    = summaryData?.summary || "";
  const meetingScore   = summaryData?.meeting_score;
  const talkRatio      = summaryData?.talk_ratio as Record<string, number> | null;
  const sentiment      = summaryData?.sentiment;
  const sentimentScore = summaryData?.sentiment_score;
  const engagementScore = summaryData?.engagement_score;
  const questionsAskedRaw = (summaryData?.questions_asked as unknown as unknown[]) || [];
  const followUpSubject = summaryData?.follow_up_email_subject;
  const followUpBody    = summaryData?.follow_up_email_body;
  const analysisStatus  = summaryData?.analysis_status;
  // finalTranscriptStatus covers the FULL post-meeting window — from the
  // instant the meeting ends (daily-webhook / endCall stamp it "pending"
  // immediately) through Deepgram batch transcription + diarization
  // (finalize-recording-transcript sets "processing" then "completed" or
  // "failed"). analysisStatus only ever covered the AI-analysis sub-step,
  // which starts several seconds into that window at the earliest — so a
  // call that just ended showed no processing indicator at all until the
  // first-pass analysis actually kicked off. Combining both gives one
  // continuous "Processing Meeting…" state with no gap.
  const finalTranscriptStatus = (callData as any)?.final_transcript_status as
    | "not_started" | "pending" | "processing" | "completed" | "failed" | null | undefined;

  const nextBestActions = useMemo(() => nextBestActionsRaw.map(normalizeNextBestAction), [nextBestActionsRaw]);
  const questionsAsked  = useMemo(() => questionsAskedRaw.map(normalizeQuestion), [questionsAskedRaw]);

  const normalizedTranscript = useMemo(() => {
    if (!Array.isArray(rawTranscript)) return [];
    return rawTranscript.map((line, index) => {
      const start = parseTimeToSeconds(line.time || line.timestamp);
      const nextLine = rawTranscript[index + 1];
      const end = nextLine
        ? parseTimeToSeconds(nextLine.time || nextLine.timestamp)
        : start + 5;
      return { ...line, timestamp: line.timestamp || line.time || "0:00", start, end };
    });
  }, [rawTranscript]);

  const recordingUrl = callData?.recording_url || callData?.daily_recording_url || callData?.hms_recording_url || callData?.audio_url || null;

  // ── Auto-trigger: make sure the AI Analysis Hub is always up to date ──
  // If the meeting is done but analysis never ran (or is stuck pending/
  // failed), kick it off automatically so this page is a reliable single
  // source of truth without the person needing to know a trigger exists.
  //
  // Guarded against firing while the server-side pipeline is already in
  // flight: daily-webhook's "recording.ready-to-download" handler calls
  // finalize-recording-transcript once Daily's complete recording is ready,
  // which itself invokes generate-call-summary (force:true) against the
  // authoritative Deepgram-diarized transcript. Auto-triggering here too,
  // while final_transcript_status is still "pending" or "processing", would
  // just race a duplicate analysis pass against the one already running.
  const autoTriggeredRef = useRef<string | null>(null);
  useEffect(() => {
    if (!callData || !id) return;
    if (callData.status !== "completed") return;
    if (summary.isLoading) return;
    if (generateSummary.isPending) return;
    if (finalTranscriptStatus === "pending" || finalTranscriptStatus === "processing") return;
    const status = summaryData?.analysis_status;
    const needsRun = !summaryData || status === "pending" || status === "failed";
    if (!needsRun) return;
    if (autoTriggeredRef.current === id) return;
    autoTriggeredRef.current = id;
    generateSummary.mutate({ callId: id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callData?.status, id, summary.isLoading, summaryData?.analysis_status, finalTranscriptStatus]);

  // isProcessing covers the ENTIRE window from the moment the meeting ends
  // to the moment a usable report exists — not just the AI-analysis
  // sub-step. A call is "processing" if:
  //   - the recording/transcript pipeline hasn't finished yet
  //     (final_transcript_status is pending/processing/not_started AND we
  //     don't already have a usable summary from the fast first pass), or
  //   - the AI analysis step itself is actively running.
  // Once either a completed summary exists OR both pipelines have
  // conclusively finished (or failed), processing is over.
  const hasUsableSummary = !!summaryData?.summary && analysisStatus === "completed";
  const transcriptPipelineActive =
    finalTranscriptStatus === "pending" ||
    finalTranscriptStatus === "processing" ||
    finalTranscriptStatus === "not_started";
  const isProcessing =
    analysisStatus === "processing" ||
    generateSummary.isPending ||
    (transcriptPipelineActive && !hasUsableSummary);

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
          <Link to="/calls">
            <Button variant="outline" className="mt-4">Back to Calls</Button>
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  const SentimentIcon = sentimentDisplay(sentiment).icon;

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-4xl mx-auto">

        {/* ── Header ── */}
        <div className="flex items-center gap-3">
          <Link to="/calls">
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
                <button
                  onClick={() => { setEditing(true); setEditName(callData.name); }}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
          <Badge className={statusColor(callData.status)}>{callData.status || "Unknown"}</Badge>
        </div>

        {/* ── Linked deal banner ── */}
        {linkedDeal ? (
          <Link
            to={`/deals/${linkedDeal.id}`}
            className="flex items-center gap-2.5 rounded-xl border border-primary/25 bg-primary/5 px-3.5 py-2.5 text-sm hover:bg-primary/10 transition-colors"
          >
            <Briefcase className="w-4 h-4 text-primary shrink-0" />
            <span className="text-muted-foreground">Linked to deal:</span>
            <span className="font-medium">{linkedDeal.name}</span>
            {linkedDeal.company && (
              <span className="text-muted-foreground">— {linkedDeal.company}</span>
            )}
            <ChevronRight className="w-3.5 h-3.5 ml-auto text-muted-foreground shrink-0" />
          </Link>
        ) : dealId === null ? (
          <div className="flex items-center gap-2.5 rounded-xl border border-amber-500/25 bg-amber-500/5 px-3.5 py-2.5 text-sm">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="text-muted-foreground">
              This call isn't linked to a deal, so its insights won't sync anywhere else.
            </span>
          </div>
        ) : null}

        {/* ── Processing banner ── */}
        {/* "Processing Meeting..." spans the whole pipeline: it shows the
            instant the meeting ends (final_transcript_status flips to
            "pending" immediately, before any transcript work has started)
            through Deepgram batch transcription + diarization, and the
            final AI analysis pass — one continuous status, not just the
            AI-analysis sub-step. */}
        {callData.status === "completed" && isProcessing && (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 flex items-center gap-2.5">
            <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
            <p className="text-sm text-muted-foreground">
              {transcriptPipelineActive && !hasUsableSummary
                ? "Processing meeting… finalizing the recording and transcribing the full conversation. This page will fill in automatically — no need to refresh."
                : "Analyzing the final transcript — Meeting Score, sentiment, and the rest of this hub will fill in automatically."}
            </p>
          </div>
        )}
        {callData.status === "completed" && !isProcessing && analysisStatus === "failed" && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
              <p className="text-sm text-muted-foreground">AI analysis failed to complete for this call.</p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1.5"
              onClick={() => generateSummary.mutate({ callId: callData.id, force: true })}
              disabled={generateSummary.isPending}
            >
              {generateSummary.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
              Retry
            </Button>
          </div>
        )}
        {callData.status === "completed" && !isProcessing && finalTranscriptStatus === "failed" && !hasUsableSummary && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
            <p className="text-sm text-muted-foreground">
              We couldn't finalize the recording for this call, so the full diarized transcript isn't available. Anything captured live is still shown below.
            </p>
          </div>
        )}

        {/* ── Meta info cards ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MetaCard icon={<Calendar className="w-4 h-4" />} label="Date"
            value={format(new Date(callData.date), "MMM d, yyyy")} />
          <MetaCard icon={<Clock className="w-4 h-4" />} label="Duration"
            value={callData.duration_minutes ? `${callData.duration_minutes} min` : "N/A"} />
          <MetaCard
            icon={<SentimentIcon className={`w-4 h-4 ${sentimentDisplay(sentiment).color}`} />}
            label="Sentiment"
            value={sentiment ? `${sentimentDisplay(sentiment).label}${sentimentScore != null ? ` (${sentimentScore}%)` : ""}` : (isProcessing ? "Processing…" : "N/A")}
          />
          <MetaCard icon={<Target className="w-4 h-4" />} label="Meeting Score"
            value={meetingScore != null ? `${meetingScore}/100` : (isProcessing ? "Processing…" : "N/A")}
            valueClassName={meetingScore != null ? scoreColor(meetingScore) : undefined}
          />
        </div>

        {/* ── Recording player ── */}
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

        {/* ── AI Action Layer ── */}
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
                  {generateAction.isPending
                    ? <Loader2 className="w-3 h-3 animate-spin" />
                    : <Sparkles className="w-3 h-3" />}
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

                {action.draft_email_subject && (
                  <div className="rounded-lg bg-card border border-border p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Draft Follow-up Email
                      </p>
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

                <div className="flex items-center gap-2 flex-wrap">
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
                        className="h-7 text-xs gap-1.5"
                        onClick={() => markCrmPushed.mutate({ actionId: action.id, provider: "hubspot" })}
                        disabled={markCrmPushed.isPending}
                      >
                        {markCrmPushed.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                        Push to HubSpot
                      </Button>

                      <div className="relative group">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled
                          className="h-7 text-xs gap-1.5 opacity-50 cursor-not-allowed border-dashed select-none"
                        >
                          Salesforce
                          <span className="inline-flex items-center text-[9px] font-bold text-violet-400 bg-violet-400/10 border border-violet-400/25 rounded-full px-1.5 py-0.5 leading-none">
                            Soon
                          </span>
                        </Button>
                        <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:flex items-center gap-1.5 whitespace-nowrap bg-popover border border-border rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground shadow-lg z-20">
                          🚧 Salesforce sync is coming soon
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {generateAction.isPending && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" /> Generating your next action…
              </div>
            )}
          </div>
        )}

        {/* ── Engagement + Talk ratio ── */}
        {(engagementScore != null || (talkRatio && Object.keys(talkRatio).length > 0)) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {engagementScore != null && (
              <div className="rounded-xl border border-border bg-card p-4">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-yellow-400" /> Engagement
                </h3>
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-yellow-400"
                      style={{ width: `${Math.min(100, engagementScore)}%` }}
                    />
                  </div>
                  <span className={`text-sm font-semibold ${scoreColor(engagementScore)}`}>{engagementScore}%</span>
                </div>
              </div>
            )}

            {talkRatio && Object.keys(talkRatio).length > 0 && (
              <div className="rounded-xl border border-border bg-card p-4">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-primary" /> Talk Ratio
                </h3>
                <div className="space-y-2">
                  {Object.entries(talkRatio).map(([speaker, pct]) => (
                    <div key={speaker} className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground w-20 truncate" title={speaker}>{speaker}</span>
                      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${Math.min(100, Number(pct))}%` }}
                        />
                      </div>
                      <span className="text-xs font-medium w-10 text-right">{Number(pct).toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Summary ── */}
        {summaryText && (
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" /> Meeting Summary
              </h3>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 text-xs gap-1 text-muted-foreground"
                onClick={() => generateSummary.mutate({ callId: callData.id, force: true })}
                disabled={generateSummary.isPending}
              >
                {generateSummary.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                Regenerate
              </Button>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">{summaryText}</p>
          </div>
        )}

        {/* ── Topics ── */}
        {topics.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" /> Key Topics
            </h3>
            <div className="flex flex-wrap gap-2">
              {topics.map((t, i) => (
                <Badge key={i} variant="secondary" className="text-xs">{t}</Badge>
              ))}
            </div>
          </div>
        )}

        {/* ── Objections ── */}
        {objections.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-destructive" /> Objections ({objections.length})
            </h3>
            <div className="space-y-3">
              {objections.map((obj, i) => (
                <div key={i} className="rounded-lg bg-muted/50 p-3 space-y-1">
                  <div className="flex items-center gap-2">
                    {obj.handled
                      ? <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                      : <AlertCircle className="w-3.5 h-3.5 text-destructive" />}
                    <span className="text-sm font-medium">{obj.type || obj.text || "Objection"}</span>
                    {obj.confidence != null && (
                      <span className="text-[10px] text-muted-foreground ml-auto">
                        {(obj.confidence * 100).toFixed(0)}%
                      </span>
                    )}
                  </div>
                  {obj.text && obj.type && (
                    <p className="text-xs text-muted-foreground">{obj.text}</p>
                  )}
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

        {/* ── Buying signals ── */}
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

        {/* ── Questions asked ── */}
        {questionsAsked.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-primary" /> Questions Asked ({questionsAsked.length})
            </h3>
            <ul className="space-y-1.5">
              {questionsAsked.map((q, i) => (
                <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                  <span className="mt-0.5">•</span>
                  <span>
                    {q.question}
                    {q.asked_by && <span className="text-xs text-muted-foreground/70"> — {q.asked_by}</span>}
                    {q.answered === false && (
                      <Badge variant="outline" className="ml-1.5 text-[10px] border-yellow-500/30 text-yellow-400">unanswered</Badge>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ── Action items & Next best actions ── */}
        {(actionItems.length > 0 || nextBestActions.length > 0) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
            {nextBestActions.length > 0 && (
              <div className="rounded-xl border border-border bg-card p-4">
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <ChevronRight className="w-4 h-4 text-primary" /> Next Best Actions
                </h3>
                <ul className="space-y-1.5">
                  {nextBestActions.map((a, i) => (
                    <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                      <span>• {a.text}</span>
                      {a.priority && (
                        <Badge
                          variant="outline"
                          className={`text-[10px] shrink-0 ${
                            a.priority === "high" ? "border-red-500/30 text-red-400"
                            : a.priority === "medium" ? "border-yellow-500/30 text-yellow-400"
                            : "border-muted-foreground/30 text-muted-foreground"
                          }`}
                        >
                          {a.priority}
                        </Badge>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* ── Follow-up email draft ── */}
        {(followUpSubject || followUpBody) && (
          <div className="rounded-xl border border-border bg-card p-4 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Mail className="w-4 h-4 text-primary" /> Follow-up Email Draft
              </h3>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 text-xs gap-1"
                onClick={() => {
                  const text = `Subject: ${followUpSubject || ""}\n\n${followUpBody || ""}`;
                  navigator.clipboard.writeText(text);
                  toast.success("Email copied to clipboard!");
                }}
              >
                <Copy className="w-3 h-3" /> Copy
              </Button>
            </div>
            {followUpSubject && <p className="text-sm font-medium">{followUpSubject}</p>}
            {followUpBody && (
              <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">{followUpBody}</p>
            )}
          </div>
        )}

        {/* ── Transcript + Clip Selector ── */}
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

        {/* ── No summary yet ── */}
        {!summary.isLoading && !summaryData && callData.status !== "completed" && (
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

function MetaCard({ icon, label, value, valueClassName }: { icon: React.ReactNode; label: string; value: string; valueClassName?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 flex items-center gap-3">
      <div className="text-primary">{icon}</div>
      <div>
        <p className="text-[10px] uppercase text-muted-foreground tracking-wider">{label}</p>
        <p className={`text-sm font-semibold ${valueClassName || ""}`}>{value}</p>
      </div>
    </div>
  );
}
