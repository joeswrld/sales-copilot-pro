import DashboardLayout from "@/components/DashboardLayout";
import { useParams, Link } from "react-router-dom";
import {
  ArrowLeft, Clock, AlertCircle, CheckCircle,
  Loader2, Pencil, Save, X, BarChart3, Target, Sparkles, MessageSquare,
  Bot, ChevronRight, Calendar, FileText, Lightbulb, ShieldAlert, Video, Download,
  Smile, Meh, Frown, Zap, HelpCircle, Mail, RefreshCw, Copy, TrendingUp,
  ThumbsUp, TrendingDown, GraduationCap, User,
  Building2, ThumbsDown, MinusCircle, ClipboardList, Edit3, Check,
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

interface CoachingFeedback {
  strengths?: string[];
  improvements?: string[];
  tips?: string[];
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

// ─── Recruiting call context ─────────────────────────────────────────────────
// If this `calls` row is the one backing a recruiting call (via
// recruiting_calls.linked_call_id), surface the full Candidate -> Job ->
// Client -> Interview chain plus AI interview feedback / extraction status
// right on this same Call Details page — reusing recruiting_calls,
// interviews, interview_feedback, ai_extractions, candidate_jobs exactly as
// they already exist. No new tables, no new RPCs. Writes go through the
// existing confirm_interview_feedback / update_interview_feedback_fields /
// confirm_candidate_ai_extraction RPCs only.
interface RecruitingCallContext {
  recruitingCallId: string;
  callType: "candidate_screening" | "client_intake" | "interview" | "other";
  extractionStatus: string;
  candidate: { id: string; full_name: string; email: string | null } | null;
  job: { id: string; title: string } | null;
  client: { id: string; name: string } | null;
  candidateJobId: string | null;
  interview: {
    id: string;
    status: string;
    interview_stage: string | null;
    scheduled_at: string | null;
    occurred_at: string | null;
  } | null;
  feedback: {
    id: string;
    status: string;
    overall_outcome: string | null;
    technical_strengths: string[];
    weaknesses: string[];
    skills_demonstrated: string[];
    concerns: string[];
    candidate_questions: string[];
    sentiment: string | null;
    recommended_next_step: string | null;
    follow_up_actions: string[];
    supporting_evidence: string | null;
  } | null;
  pendingExtractionCount: number;
  confirmedExtractionCount: number;
}

function useRecruitingCallContext(callId: string | undefined) {
  return useQuery({
    queryKey: ["recruiting-call-context", callId],
    queryFn: async (): Promise<RecruitingCallContext | null> => {
      if (!callId) return null;

      const { data: rc, error: rcErr } = await (supabase as any)
        .from("recruiting_calls")
        .select("id, call_type, extraction_status, candidate_id, client_id, job_id, candidate_job_id")
        .eq("linked_call_id", callId)
        .maybeSingle();
      if (rcErr) throw rcErr;
      if (!rc) return null;

      const [candidateRes, jobRes, clientRes, interviewRes, extractionsRes] = await Promise.all([
        rc.candidate_id
          ? (supabase as any).from("candidates").select("id, full_name, email").eq("id", rc.candidate_id).maybeSingle()
          : Promise.resolve({ data: null }),
        rc.job_id
          ? (supabase as any).from("jobs").select("id, title").eq("id", rc.job_id).maybeSingle()
          : Promise.resolve({ data: null }),
        rc.client_id
          ? (supabase as any).from("recruiting_clients").select("id, name").eq("id", rc.client_id).maybeSingle()
          : Promise.resolve({ data: null }),
        (supabase as any).from("interviews").select("id, status, interview_stage, scheduled_at, occurred_at").eq("call_id", rc.id).maybeSingle(),
        (supabase as any).from("ai_extractions").select("status").eq("source_call_id", rc.id),
      ]);

      // candidate_job_id may not be set directly on recruiting_calls for
      // interview-type calls yet (it's only guaranteed on the interviews
      // row) — fall back there, and derive job/client from it if this
      // recruiting_calls row didn't carry job_id/client_id directly.
      let candidateJobId: string | null = rc.candidate_job_id ?? null;
      let job = jobRes.data as { id: string; title: string } | null;
      let client = clientRes.data as { id: string; name: string } | null;
      let candidate = candidateRes.data as { id: string; full_name: string; email: string | null } | null;

      if (interviewRes.data?.candidate_job_id) {
        candidateJobId = interviewRes.data.candidate_job_id;
      }
      if (candidateJobId && (!job || !client || !candidate)) {
        const { data: cj } = await (supabase as any)
          .from("candidate_jobs")
          .select("id, candidate:candidate_id(id, full_name, email), job:job_id(id, title, client:client_id(id, name))")
          .eq("id", candidateJobId)
          .maybeSingle();
        if (cj) {
          candidate = candidate ?? cj.candidate;
          job = job ?? (cj.job ? { id: cj.job.id, title: cj.job.title } : null);
          client = client ?? cj.job?.client ?? null;
        }
      }

      let feedback: RecruitingCallContext["feedback"] = null;
      if (interviewRes.data?.id) {
        const { data: fb } = await (supabase as any)
          .from("interview_feedback")
          .select("id, status, overall_outcome, technical_strengths, weaknesses, skills_demonstrated, concerns, candidate_questions, sentiment, recommended_next_step, follow_up_actions, supporting_evidence")
          .eq("interview_id", interviewRes.data.id)
          .maybeSingle();
        feedback = fb ?? null;
      }

      const extractions = (extractionsRes.data ?? []) as { status: string }[];

      return {
        recruitingCallId: rc.id,
        callType: rc.call_type,
        extractionStatus: rc.extraction_status,
        candidate,
        job,
        client,
        candidateJobId,
        interview: interviewRes.data
          ? {
              id: interviewRes.data.id,
              status: interviewRes.data.status,
              interview_stage: interviewRes.data.interview_stage,
              scheduled_at: interviewRes.data.scheduled_at,
              occurred_at: interviewRes.data.occurred_at,
            }
          : null,
        feedback,
        pendingExtractionCount: extractions.filter(e => e.status === "pending_review").length,
        confirmedExtractionCount: extractions.filter(e => e.status === "confirmed" || e.status === "edited").length,
      };
    },
    enabled: !!callId,
    staleTime: 15_000,
  });
}

const CALL_TYPE_LABELS: Record<string, string> = {
  candidate_screening: "Candidate Screening",
  client_intake: "Client Intake",
  interview: "Interview",
  other: "Recruiting Call",
};

function extractionStatusDisplay(status: string) {
  switch (status) {
    case "completed": return { label: "AI extraction complete", color: "text-green-400" };
    case "processing": return { label: "AI extracting…", color: "text-primary" };
    case "failed": return { label: "AI extraction failed", color: "text-red-400" };
    default: return { label: "Extraction pending", color: "text-muted-foreground" };
  }
}

export default function CallDetail() {
  const { id } = useParams();

  const { call, summary } = useCallDetail(id);
  const { useCallClips }  = useCoachingClips();
  const { data: callClips = [] } = useCallClips(id ?? null);
  const updateCall = useUpdateCall();
  const generateSummary = useGenerateCallSummary();
  const { data: recruitingContext, isLoading: recruitingContextLoading, refetch: refetchRecruitingContext } = useRecruitingCallContext(id);

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

  // ── Recruiting interview feedback: edit + confirm ──────────────────────
  const [editingFeedback, setEditingFeedback] = useState(false);
  const [feedbackDraft, setFeedbackDraft] = useState<{
    technical_strengths: string; weaknesses: string; skills_demonstrated: string;
    concerns: string; candidate_questions: string; follow_up_actions: string;
    sentiment: string; recommended_next_step: string; supporting_evidence: string;
  } | null>(null);
  const [savingFeedback, setSavingFeedback] = useState(false);
  const [confirmingFeedback, setConfirmingFeedback] = useState(false);

  const toLines = (arr: string[] | null | undefined) => (arr ?? []).join("\n");
  const fromLines = (text: string) => text.split("\n").map(s => s.trim()).filter(Boolean);

  const startEditingFeedback = () => {
    if (!recruitingContext?.feedback) return;
    const fb = recruitingContext.feedback;
    setFeedbackDraft({
      technical_strengths: toLines(fb.technical_strengths),
      weaknesses: toLines(fb.weaknesses),
      skills_demonstrated: toLines(fb.skills_demonstrated),
      concerns: toLines(fb.concerns),
      candidate_questions: toLines(fb.candidate_questions),
      follow_up_actions: toLines(fb.follow_up_actions),
      sentiment: fb.sentiment ?? "",
      recommended_next_step: fb.recommended_next_step ?? "",
      supporting_evidence: fb.supporting_evidence ?? "",
    });
    setEditingFeedback(true);
  };

  const saveFeedbackEdits = async () => {
    if (!recruitingContext?.feedback || !feedbackDraft) return;
    setSavingFeedback(true);
    try {
      const { error } = await (supabase as any).rpc("update_interview_feedback_fields", {
        p_interview_feedback_id: recruitingContext.feedback.id,
        p_technical_strengths: fromLines(feedbackDraft.technical_strengths),
        p_weaknesses: fromLines(feedbackDraft.weaknesses),
        p_skills_demonstrated: fromLines(feedbackDraft.skills_demonstrated),
        p_concerns: fromLines(feedbackDraft.concerns),
        p_candidate_questions: fromLines(feedbackDraft.candidate_questions),
        p_sentiment: feedbackDraft.sentiment || null,
        p_recommended_next_step: feedbackDraft.recommended_next_step || null,
        p_follow_up_actions: fromLines(feedbackDraft.follow_up_actions),
        p_supporting_evidence: feedbackDraft.supporting_evidence || null,
      });
      if (error) throw error;
      toast.success("Interview feedback updated");
      setEditingFeedback(false);
      refetchRecruitingContext();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to update feedback");
    } finally {
      setSavingFeedback(false);
    }
  };

  // Confirming applies whatever is currently saved on the row (including
  // any edits just made via saveFeedbackEdits, which must complete first)
  // and — via the existing tl_interview_feedback_confirmed trigger — writes
  // it straight onto the candidate's timeline. Nothing here writes the
  // timeline directly.
  const confirmFeedbackOnCall = async (outcome: string) => {
    if (!recruitingContext?.feedback) return;
    setConfirmingFeedback(true);
    try {
      const { error } = await (supabase as any).rpc("confirm_interview_feedback", {
        p_interview_feedback_id: recruitingContext.feedback.id,
        p_overall_outcome: outcome,
      });
      if (error) throw error;
      toast.success("Feedback confirmed — added to candidate timeline");
      refetchRecruitingContext();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to confirm feedback");
    } finally {
      setConfirmingFeedback(false);
    }
  };

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
  // Older analyzed calls stored talk_ratio keyed by generic role labels
  // ("rep"/"prospect") before this was switched to real participant names.
  // Remap those legacy keys to the names we already have from the
  // transcript (same speaker_name values the backend now uses directly)
  // so old calls don't show literal "rep"/"prospect" in the UI. New rows
  // are already keyed by name and pass through untouched.
  const displayTalkRatio = useMemo(() => {
    if (!talkRatio) return null;
    const isLegacyRoleKeyed = Object.prototype.hasOwnProperty.call(talkRatio, "rep")
      || Object.prototype.hasOwnProperty.call(talkRatio, "prospect");
    if (!isLegacyRoleKeyed) return talkRatio;

    const hostLine = rawTranscript.find((l) => l.speaker === "You" && l.speaker_name);
    const guestLine = rawTranscript.find((l) => l.speaker === "Guest" && l.speaker_name);
    const hostLabel = hostLine?.speaker_name || "Host";
    const guestLabel = guestLine?.speaker_name || "Guest";

    const remapped: Record<string, number> = {};
    if (talkRatio.rep != null) remapped[hostLabel] = talkRatio.rep;
    if (talkRatio.prospect != null) remapped[guestLabel] = talkRatio.prospect;
    // Carry over any other keys unchanged (defensive — shouldn't normally happen)
    for (const [k, v] of Object.entries(talkRatio)) {
      if (k !== "rep" && k !== "prospect") remapped[k] = v;
    }
    return remapped;
  }, [talkRatio, rawTranscript]);
  const sentiment      = summaryData?.sentiment;
  const sentimentScore = summaryData?.sentiment_score;
  const engagementScore = summaryData?.engagement_score;
  const questionsAskedRaw = (summaryData?.questions_asked as unknown as unknown[]) || [];
  const followUpSubject = summaryData?.follow_up_email_subject;
  const followUpBody    = summaryData?.follow_up_email_body;
  const coachingFeedback = (summaryData?.coaching_feedback as unknown as CoachingFeedback | null) || null;
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
          {recruitingContext?.candidate && (
            <Link to={`/candidates/${recruitingContext.candidate.id}`}>
              <Badge variant="outline" className="flex items-center gap-1.5 border-primary/30 text-primary hover:bg-primary/10 transition-colors">
                <User className="w-3 h-3" />
                {recruitingContext.candidate.full_name}
              </Badge>
            </Link>
          )}
          <Badge className={statusColor(callData.status)}>{callData.status || "Unknown"}</Badge>
        </div>

        {/* ── Linked deal banner (sales calls) ── */}
        {recruitingContextLoading && dealId === null ? (
          <div className="flex items-center gap-2.5 rounded-xl border border-border bg-muted/40 px-3.5 py-2.5 text-sm animate-pulse">
            <div className="w-4 h-4 rounded-full bg-muted-foreground/20 shrink-0" />
            <div className="h-3.5 w-40 rounded bg-muted-foreground/20" />
          </div>
        ) : linkedDeal ? (
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
        ) : recruitingContext ? (
          /* ── Recruiting call banner: Candidate -> Job -> Client -> call type ── */
          <div className="rounded-xl border border-primary/25 bg-primary/5 p-3.5 space-y-2">
            <div className="flex items-center gap-2 flex-wrap text-sm">
              <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-wide border-primary/30 text-primary">
                {CALL_TYPE_LABELS[recruitingContext.callType] ?? recruitingContext.callType}
              </Badge>
              {recruitingContext.candidate && (
                <Link to={`/candidates/${recruitingContext.candidate.id}`} className="flex items-center gap-1.5 font-medium hover:underline">
                  <User className="w-3.5 h-3.5 text-primary shrink-0" />
                  {recruitingContext.candidate.full_name}
                </Link>
              )}
              {recruitingContext.job && (
                <>
                  <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Briefcase className="w-3.5 h-3.5 shrink-0" />
                    {recruitingContext.job.title}
                  </span>
                </>
              )}
              {recruitingContext.client && (
                <>
                  <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Building2 className="w-3.5 h-3.5 shrink-0" />
                    {recruitingContext.client.name}
                  </span>
                </>
              )}
            </div>
            <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
              {recruitingContext.interview && (
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3 h-3" />
                  {recruitingContext.interview.status === "scheduled"
                    ? `Scheduled ${recruitingContext.interview.scheduled_at ? format(new Date(recruitingContext.interview.scheduled_at), "MMM d, yyyy · h:mm a") : ""}`
                    : recruitingContext.interview.status === "completed"
                    ? `Completed ${recruitingContext.interview.occurred_at ? format(new Date(recruitingContext.interview.occurred_at), "MMM d, yyyy") : ""}`
                    : recruitingContext.interview.status}
                  {recruitingContext.interview.interview_stage ? ` · ${recruitingContext.interview.interview_stage}` : ""}
                </span>
              )}
              <span className={`flex items-center gap-1.5 ${extractionStatusDisplay(recruitingContext.extractionStatus).color}`}>
                <Bot className="w-3 h-3" />
                {extractionStatusDisplay(recruitingContext.extractionStatus).label}
                {recruitingContext.pendingExtractionCount > 0 && ` (${recruitingContext.pendingExtractionCount} pending review)`}
              </span>
              {recruitingContext.candidateJobId && (
                <Link to={`/candidates/${recruitingContext.candidate?.id ?? ""}`} className="text-primary hover:underline ml-auto">
                  View pipeline →
                </Link>
              )}
            </div>
          </div>
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
                      <div className="relative group">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled
                          className="h-7 text-xs gap-1.5 opacity-50 cursor-not-allowed border-dashed select-none"
                        >
                          HubSpot
                          <span className="inline-flex items-center text-[9px] font-bold text-violet-400 bg-violet-400/10 border border-violet-400/25 rounded-full px-1.5 py-0.5 leading-none">
                            Soon
                          </span>
                        </Button>
                        <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:flex items-center gap-1.5 whitespace-nowrap bg-popover border border-border rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground shadow-lg z-20">
                          🚧 HubSpot sync is coming soon
                        </div>
                      </div>

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
        {(engagementScore != null || (displayTalkRatio && Object.keys(displayTalkRatio).length > 0)) && (
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

            {displayTalkRatio && Object.keys(displayTalkRatio).length > 0 && (
              <div className="rounded-xl border border-border bg-card p-4">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-primary" /> Talk Ratio
                </h3>
                <div className="space-y-2">
                  {Object.entries(displayTalkRatio).map(([speaker, pct]) => (
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

        {/* ── Interview Feedback (recruiting calls) ── */}
        {/* Reads/writes public.interview_feedback only via
            update_interview_feedback_fields / confirm_interview_feedback —
            confirming here fires the existing tl_interview_feedback_confirmed
            trigger, which writes straight onto the candidate's timeline. */}
        {recruitingContext?.feedback && (
          <div className="rounded-xl border border-border bg-card p-4 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-primary" /> Interview Feedback
              </h3>
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className={`text-[10px] ${
                    recruitingContext.feedback.status === "confirmed"
                      ? "border-green-500/30 text-green-400"
                      : "border-indigo-500/30 text-indigo-400"
                  }`}
                >
                  {recruitingContext.feedback.status === "confirmed" ? "Confirmed" : recruitingContext.feedback.status === "edited" ? "Edited — pending confirmation" : "Pending review"}
                </Badge>
                {recruitingContext.feedback.status !== "confirmed" && !editingFeedback && (
                  <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={startEditingFeedback}>
                    <Edit3 className="w-3 h-3" /> Edit
                  </Button>
                )}
              </div>
            </div>

            {!editingFeedback ? (
              <>
                {recruitingContext.feedback.sentiment && (
                  <p className="text-xs text-muted-foreground"><b>Sentiment:</b> {recruitingContext.feedback.sentiment}</p>
                )}
                <div className="grid gap-4 sm:grid-cols-2">
                  {!!recruitingContext.feedback.technical_strengths?.length && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium flex items-center gap-1.5 text-green-400">
                        <ThumbsUp className="w-3.5 h-3.5" /> Strengths
                      </p>
                      <ul className="space-y-1">
                        {recruitingContext.feedback.technical_strengths.map((s, i) => (
                          <li key={i} className="text-xs text-muted-foreground leading-relaxed">• {s}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {!!recruitingContext.feedback.weaknesses?.length && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium flex items-center gap-1.5 text-amber-400">
                        <ThumbsDown className="w-3.5 h-3.5" /> Weaknesses
                      </p>
                      <ul className="space-y-1">
                        {recruitingContext.feedback.weaknesses.map((s, i) => (
                          <li key={i} className="text-xs text-muted-foreground leading-relaxed">• {s}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {!!recruitingContext.feedback.skills_demonstrated?.length && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium flex items-center gap-1.5 text-primary">
                        <Sparkles className="w-3.5 h-3.5" /> Skills Demonstrated
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {recruitingContext.feedback.skills_demonstrated.map((s, i) => (
                          <Badge key={i} variant="secondary" className="text-[10px] font-normal">{s}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {!!recruitingContext.feedback.concerns?.length && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium flex items-center gap-1.5 text-red-400">
                        <MinusCircle className="w-3.5 h-3.5" /> Concerns
                      </p>
                      <ul className="space-y-1">
                        {recruitingContext.feedback.concerns.map((s, i) => (
                          <li key={i} className="text-xs text-muted-foreground leading-relaxed">• {s}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {!!recruitingContext.feedback.candidate_questions?.length && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium flex items-center gap-1.5 text-primary">
                        <HelpCircle className="w-3.5 h-3.5" /> Candidate Questions
                      </p>
                      <ul className="space-y-1">
                        {recruitingContext.feedback.candidate_questions.map((s, i) => (
                          <li key={i} className="text-xs text-muted-foreground leading-relaxed">• {s}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {!!recruitingContext.feedback.follow_up_actions?.length && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium flex items-center gap-1.5 text-primary">
                        <Target className="w-3.5 h-3.5" /> Follow-ups
                      </p>
                      <ul className="space-y-1">
                        {recruitingContext.feedback.follow_up_actions.map((s, i) => (
                          <li key={i} className="text-xs text-muted-foreground leading-relaxed">• {s}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                {recruitingContext.feedback.recommended_next_step && (
                  <p className="text-xs text-muted-foreground pt-2 border-t border-border">
                    <b>Recommended next step:</b> {recruitingContext.feedback.recommended_next_step}
                  </p>
                )}
                {recruitingContext.feedback.status !== "confirmed" && (
                  <div className="flex items-center gap-2 pt-2 border-t border-border flex-wrap">
                    <span className="text-xs text-muted-foreground mr-1">Confirm outcome:</span>
                    {["positive", "mixed", "negative"].map(outcome => (
                      <Button
                        key={outcome}
                        size="sm"
                        variant="outline"
                        className={`h-7 text-xs gap-1.5 capitalize ${
                          outcome === "positive" ? "border-green-500/30 text-green-400 hover:bg-green-500/10"
                          : outcome === "negative" ? "border-red-500/30 text-red-400 hover:bg-red-500/10"
                          : "border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                        }`}
                        onClick={() => confirmFeedbackOnCall(outcome)}
                        disabled={confirmingFeedback}
                      >
                        {confirmingFeedback ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                        {outcome}
                      </Button>
                    ))}
                  </div>
                )}
              </>
            ) : feedbackDraft && (
              <div className="space-y-3">
                <p className="text-[11px] text-muted-foreground">One item per line.</p>
                {([
                  ["technical_strengths", "Strengths"],
                  ["weaknesses", "Weaknesses"],
                  ["skills_demonstrated", "Skills Demonstrated"],
                  ["concerns", "Concerns"],
                  ["candidate_questions", "Candidate Questions"],
                  ["follow_up_actions", "Follow-ups"],
                ] as const).map(([key, label]) => (
                  <div key={key}>
                    <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1 block">{label}</label>
                    <textarea
                      value={feedbackDraft[key]}
                      onChange={e => setFeedbackDraft(d => d ? { ...d, [key]: e.target.value } : d)}
                      className="w-full text-xs p-2 rounded-lg border border-border bg-background min-h-[56px] resize-y"
                    />
                  </div>
                ))}
                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1 block">Sentiment</label>
                  <Input
                    value={feedbackDraft.sentiment}
                    onChange={e => setFeedbackDraft(d => d ? { ...d, sentiment: e.target.value } : d)}
                    className="text-xs h-8"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1 block">Recommended next step</label>
                  <Input
                    value={feedbackDraft.recommended_next_step}
                    onChange={e => setFeedbackDraft(d => d ? { ...d, recommended_next_step: e.target.value } : d)}
                    className="text-xs h-8"
                  />
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <Button size="sm" className="h-7 text-xs gap-1.5" onClick={saveFeedbackEdits} disabled={savingFeedback}>
                    {savingFeedback ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Save
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs gap-1.5" onClick={() => setEditingFeedback(false)} disabled={savingFeedback}>
                    <X className="w-3 h-3" /> Cancel
                  </Button>
                </div>
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

        {/* ── AI Coaching Feedback ── */}
        {/* Generated by generate-call-summary from the final diarized
            transcript alongside every other AI field, but previously had
            no place to render — this is that place. Evaluates the host's
            (rep's) performance specifically, not the guest's. */}
        {coachingFeedback && (
          (coachingFeedback.strengths?.length ||
           coachingFeedback.improvements?.length ||
           coachingFeedback.tips?.length) ? (
            <div className="rounded-xl border border-border bg-card p-4 space-y-4">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <GraduationCap className="w-4 h-4 text-primary" /> AI Coaching Feedback
              </h3>
              <div className="grid gap-4 sm:grid-cols-3">
                {!!coachingFeedback.strengths?.length && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium flex items-center gap-1.5 text-green-400">
                      <ThumbsUp className="w-3.5 h-3.5" /> Strengths
                    </p>
                    <ul className="space-y-1">
                      {coachingFeedback.strengths.map((s, i) => (
                        <li key={i} className="text-xs text-muted-foreground leading-relaxed">• {s}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {!!coachingFeedback.improvements?.length && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium flex items-center gap-1.5 text-amber-400">
                      <TrendingDown className="w-3.5 h-3.5" /> Could Improve
                    </p>
                    <ul className="space-y-1">
                      {coachingFeedback.improvements.map((s, i) => (
                        <li key={i} className="text-xs text-muted-foreground leading-relaxed">• {s}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {!!coachingFeedback.tips?.length && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium flex items-center gap-1.5 text-primary">
                      <Lightbulb className="w-3.5 h-3.5" /> Tips For Next Call
                    </p>
                    <ul className="space-y-1">
                      {coachingFeedback.tips.map((s, i) => (
                        <li key={i} className="text-xs text-muted-foreground leading-relaxed">• {s}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          ) : null
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