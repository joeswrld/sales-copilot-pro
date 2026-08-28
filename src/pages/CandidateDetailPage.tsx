/**
 * CandidateDetailPage.tsx — Candidate Intelligence detail
 *
 * Reads/writes public.candidates, candidate_skills, candidate_cv_files,
 * recruiting_calls, ai_extractions, recruiting_timeline_events directly via
 * the Supabase client (RLS via recruiting_is_team_member). AI review actions
 * go through confirm_candidate_ai_extraction / edit_candidate_ai_extraction /
 * reject_candidate_ai_extraction RPCs — never write ai_extractions directly.
 *
 * Phase 5: also surfaces this candidate's job pipelines (candidate_jobs),
 * and — per selected pipeline — interviews, AI interview feedback,
 * submissions, and client feedback. All state changes for those go through
 * the existing Phase 5 RPCs (schedule_interview, confirm_interview_feedback,
 * advance_candidate_pipeline_stage, create_submission, send_submission,
 * record_client_feedback) — nothing here writes those tables directly.
 * The unified timeline calls get_candidate_job_timeline for the selected
 * pipeline instead of querying recruiting_timeline_events directly, so it
 * shows the same cross-entity history the Pipeline/Submissions pages rely on.
 *
 * No Edge Functions added. CV parsing goes through the existing
 * parse-candidate-cv function; nothing here fakes AI output.
 *
 * Responsive: the two-column desktop layout (content + timeline sidebar)
 * collapses to a single stacked column below the mobile breakpoint via
 * useIsMobile(), matching the convention already used in PipelinePage.tsx.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { useTeam } from "@/hooks/useTeam";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import { formatDistanceToNow, format } from "date-fns";
import {
  ArrowLeft, Loader2, Mail, Phone, MapPin, Briefcase, Building2,
  DollarSign, Calendar, FileText, Upload, Check, X, Edit3, ChevronDown,
  ChevronUp, Sparkles, Clock, Plus, RefreshCw, AlertCircle, CheckCircle2,
  XCircle, User, Tag, Kanban, Send, MessageSquare, Video, ThumbsUp, ExternalLink, Copy,
  Shield, ShieldAlert, Trash2, ShieldCheck,
} from "lucide-react";
import { ErrorBoundary } from "@/components/ErrorBoundary";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Candidate {
  id: string;
  team_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  location: string | null;
  candidate_current_role: string | null;
  current_company: string | null;
  years_experience: number | null;
  current_salary: number | null;
  current_salary_currency: string | null;
  expected_salary: number | null;
  expected_salary_currency: string | null;
  notice_period: string | null;
  availability_date: string | null;
  work_arrangement_preference: string | null;
  work_authorization: string | null;
  skills: string[];
  motivation_for_moving: string | null;
  candidate_concerns: string | null;
  recruiter_assessment: string | null;
  recruiter_notes: string | null;
  cv_file_url: string | null;
  cv_file_name: string | null;
  cv_uploaded_at: string | null;
  cv_parsed_at: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  data_consent_given: boolean;
  data_consent_given_at: string | null;
  data_consent_source: string | null;
  recording_consent_given: boolean;
  recording_consent_given_at: string | null;
  marketing_consent_given: boolean;
  retention_expires_at: string | null;
  deletion_requested_at: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  anonymized: boolean;
}

interface CandidateSkill {
  id: string;
  skill_name: string;
  years_experience: number | null;
  proficiency: string | null;
  source: string;
  verified: boolean;
}

interface CvFile {
  id: string;
  file_path: string;
  file_name: string;
  parsing_status: string;
  created_at: string;
}

interface RecruitingCall {
  id: string;
  call_type: string;
  title: string | null;
  scheduled_at: string | null;
  occurred_at: string | null;
  status: string;
}

interface AiExtraction {
  id: string;
  field_name: string;
  ai_value: any;
  confidence: number | null;
  status: string;
  recruiter_correction: any;
  created_at: string;
}

interface TimelineEvent {
  id: string;
  event_type: string;
  title: string;
  created_at: string;
}

// ── Phase 5 types ────────────────────────────────────────────────────────────

interface CandidateJobRow {
  id: string;
  job_id: string;
  pipeline_stage: string;
  status: string;
  match_score: number | null;
  match_explanation: {
    matched_requirements?: string[];
    missing_requirements?: string[];
    relevant_experience?: string | null;
    relevant_skills?: string[];
    potential_concerns?: string[];
    salary_compatibility?: string;
    location_compatibility?: string;
    availability_notice?: string | null;
    overall_recommendation?: string | null;
    computed_at?: string;
  } | null;
  rejection_reason: string | null;
  placed_at: string | null;
  placement_salary: number | null;
  placement_salary_currency: string | null;
  placement_fee: number | null;
  placement_fee_currency: string | null;
  placement_notes: string | null;
  job: { id: string; title: string; client_id: string | null; client: { id: string; name: string } | null } | null;
}

interface InterviewRow {
  id: string;
  candidate_job_id: string;
  interview_stage: string;
  scheduled_at: string | null;
  occurred_at: string | null;
  interviewer_names: string[] | null;
  status: string;
  meeting_link: string | null;
  call_id: string | null;
  interview_instructions: string | null;
  candidate_notified_at: string | null;
}

interface InterviewFeedbackRow {
  id: string;
  interview_id: string;
  candidate_job_id: string;
  overall_outcome: string | null;
  technical_strengths: string[];
  weaknesses: string[];
  concerns: string[];
  recommended_next_step: string | null;
  status: string;
  confirmed_at: string | null;
}

interface SubmissionRow {
  id: string;
  candidate_job_id: string;
  status: string;
  relevance_explanation: string | null;
  submitted_at: string | null;
  created_at: string;
}

interface ClientFeedbackRow {
  id: string;
  candidate_job_id: string;
  feedback_text: string;
  sentiment: string | null;
  created_at: string;
}

interface UnifiedTimelineEvent {
  occurred_at: string;
  event_type: string;
  title: string;
  description: string | null;
  source: string;
}

const PIPELINE_STAGES: { key: string; label: string; color: string }[] = [
  { key: "sourced", label: "New", color: "#94a3b8" },
  { key: "screening", label: "Screening", color: "#60a5fa" },
  { key: "shortlisted", label: "Shortlisted", color: "#818cf8" },
  { key: "submitted", label: "Submitted", color: "#a78bfa" },
  { key: "client_review", label: "Client Review", color: "#f472b6" },
  { key: "interview", label: "Interview", color: "#fb923c" },
  { key: "final_interview", label: "Final Interview", color: "#f59e0b" },
  { key: "offer", label: "Offer", color: "#facc15" },
  { key: "placed", label: "Placed", color: "#22c55e" },
  { key: "rejected", label: "Rejected", color: "#ef4444" },
];

function getStageCfg(stage: string) {
  return PIPELINE_STAGES.find(s => s.key === stage) ?? { key: stage, label: stage, color: "#94a3b8" };
}

const STATUSES = [
  { key: "active", label: "Active", color: "#22c55e" },
  { key: "passive", label: "Passive", color: "#fbbf24" },
  { key: "placed", label: "Placed", color: "#22315C" },
  { key: "do_not_contact", label: "Do Not Contact", color: "#ef4444" },
  { key: "archived", label: "Archived", color: "#64748b" },
];

const FIELD_LABELS: Record<string, string> = {
  expected_salary: "Expected salary",
  current_salary: "Current salary",
  notice_period: "Notice period",
  location: "Location",
  candidate_current_role: "Current role",
  current_company: "Current company",
  years_experience: "Years experience",
  work_arrangement_preference: "Work arrangement",
  work_authorization: "Work authorization",
  motivation_for_moving: "Motivation",
  candidate_concerns: "Concerns",
  email: "Email",
  phone: "Phone",
  full_name: "Full name",
  linkedin_url: "LinkedIn",
  recruiter_assessment: "Recruiter assessment",
};

function getStatusCfg(status: string) {
  return STATUSES.find(s => s.key === status) ?? { key: status, label: status, color: "#94a3b8" };
}

function formatMoney(value: number | null, currency: string | null) {
  if (value === null || value === undefined) return null;
  const symbol = currency === "USD" ? "$" : currency === "EUR" ? "€" : "£";
  return `${symbol}${value.toLocaleString()}`;
}

// humanizeCompat turns a snake/kebab-case compatibility code from the AI
// match (e.g. "good_fit", "strong-match", "mismatch") into a readable label.
// Falls back to a plain word-split for any code not in the known set, so an
// unexpected value from the model never breaks rendering.
const COMPAT_LABELS: Record<string, string> = {
  match: "Match", good_fit: "Good fit", strong_match: "Strong match",
  within_range: "Within range", above_range: "Above range", below_range: "Below range",
  stretch: "Stretch", mismatch: "Mismatch", unknown: "Unknown", not_specified: "Not specified",
};

function humanizeCompat(value: string | null | undefined): string {
  if (!value) return "";
  const key = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (COMPAT_LABELS[key]) return COMPAT_LABELS[key];
  return value
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

// ─── Collapsible section ────────────────────────────────────────────────────

function Section({ title, icon: Icon, defaultOpen = true, accent, right, children }: {
  title: string; icon: React.ElementType; defaultOpen?: boolean; accent?: string; right?: React.ReactNode; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ background: "rgba(23,23,15,0.02)", border: "1px solid rgba(23,23,15,0.05)", borderRadius: 14, overflow: "hidden" }}>
      <div style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 16px" }}>
        <button onClick={() => setOpen(v => !v)} style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
          <Icon style={{ width: 14, height: 14, color: accent ?? "rgba(23,23,15,0.4)" }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(23,23,15,0.8)" }}>{title}</span>
          {open ? <ChevronUp style={{ width: 13, height: 13, color: "rgba(23,23,15,0.3)" }} /> : <ChevronDown style={{ width: 13, height: 13, color: "rgba(23,23,15,0.3)" }} />}
        </button>
        {right}
      </div>
      {open && <div style={{ padding: "0 16px 14px" }}>{children}</div>}
    </div>
  );
}

// ─── AI Match helpers ────────────────────────────────────────────────────────
// MatchList renders one labeled group of bullet items from match_explanation
// (matched/missing requirements, relevant skills, concerns). MatchField
// renders a single labeled value (salary/location compatibility, notice,
// relevant experience). Both were referenced by the AI Match section but
// never defined — that's what threw "MatchList is not defined".

function MatchList({ label, items, icon, color }: {
  label: string; items: string[]; icon: string; color: string;
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: "rgba(23,23,15,0.4)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {items.map((item, i) => (
          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 7, fontSize: 12.5, color: "rgba(23,23,15,0.75)", lineHeight: 1.5 }}>
            <span style={{ color, flexShrink: 0, fontWeight: 700 }}>{icon}</span>
            <span>{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MatchField({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: "rgba(23,23,15,0.4)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 12.5, color: "rgba(23,23,15,0.75)", lineHeight: 1.5 }}>{value}</div>
    </div>
  );
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function DetailSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <style>{`@keyframes shimmer { 0%{opacity:.5} 50%{opacity:1} 100%{opacity:.5} } .sk{animation:shimmer 1.6s ease-in-out infinite;background:rgba(23,23,15,0.06);border-radius:8px;}`}</style>
      <div className="sk" style={{ height: 60, width: "100%" }} />
      <div className="sk" style={{ height: 200, width: "100%" }} />
      <div className="sk" style={{ height: 140, width: "100%" }} />
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

function CandidateDetailPageInner() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { teamId, team } = useTeam();
  const { user } = useAuth();
  const isMobile = useIsMobile();

  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [skills, setSkills] = useState<CandidateSkill[]>([]);
  const [cvFiles, setCvFiles] = useState<CvFile[]>([]);
  const [calls, setCalls] = useState<RecruitingCall[]>([]);
  const [extractions, setExtractions] = useState<AiExtraction[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [newSkill, setNewSkill] = useState("");
  const [addingSkill, setAddingSkill] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [editDrafts, setEditDrafts] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Phase 5 state ──────────────────────────────────────────────────────────
  const [candidateJobs, setCandidateJobs] = useState<CandidateJobRow[]>([]);
  const [selectedCjId, setSelectedCjId] = useState<string | null>(null);
  const [interviews, setInterviews] = useState<InterviewRow[]>([]);
  const [interviewFeedback, setInterviewFeedback] = useState<InterviewFeedbackRow[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [clientFeedback, setClientFeedback] = useState<ClientFeedbackRow[]>([]);
  const [unifiedTimeline, setUnifiedTimeline] = useState<UnifiedTimelineEvent[]>([]);
  const [pipelineBusy, setPipelineBusy] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [runningAiMatch, setRunningAiMatch] = useState(false);

  const load = useCallback(async () => {
    if (!id || !teamId) return;
    setLoading(true);
    setError(null);
    try {
      const [candRes, skillsRes, cvRes, callsRes, extRes, timelineRes, cjRes] = await Promise.all([
        (supabase as any).from("candidates").select("*").eq("id", id).single(),
        (supabase as any).from("candidate_skills").select("*").eq("candidate_id", id).order("skill_name"),
        (supabase as any).from("candidate_cv_files").select("id, file_path, file_name, parsing_status, created_at").eq("candidate_id", id).order("created_at", { ascending: false }),
        (supabase as any).from("recruiting_calls").select("id, call_type, title, scheduled_at, occurred_at, status").eq("candidate_id", id).order("created_at", { ascending: false }),
        (supabase as any).from("ai_extractions").select("*").eq("entity_type", "candidate").eq("entity_id", id).order("created_at", { ascending: false }),
        (supabase as any).from("recruiting_timeline_events").select("id, event_type, title, created_at").eq("entity_type", "candidate").eq("entity_id", id).order("created_at", { ascending: false }).limit(20),
        (supabase as any)
          .from("candidate_jobs")
          .select("id, job_id, pipeline_stage, status, match_score, match_explanation, rejection_reason, placed_at, placement_salary, placement_salary_currency, placement_fee, placement_fee_currency, placement_notes, job:jobs(id, title, client_id, client:recruiting_clients(id, name))")
          .eq("candidate_id", id)
          .order("updated_at", { ascending: false }),
      ]);

      if (candRes.error) throw candRes.error;
      setCandidate(candRes.data);
      setSkills(skillsRes.data ?? []);
      setCvFiles(cvRes.data ?? []);
      setCalls(callsRes.data ?? []);
      setExtractions(extRes.data ?? []);
      setTimeline(timelineRes.data ?? []);
      const cjRows: CandidateJobRow[] = cjRes.data ?? [];
      setCandidateJobs(cjRows);
      setSelectedCjId(prev => (prev && cjRows.some(r => r.id === prev)) ? prev : (cjRows[0]?.id ?? null));
    } catch (e: any) {
      setError(e.message ?? "Failed to load candidate");
    } finally {
      setLoading(false);
    }
  }, [id, teamId]);

  useEffect(() => { load(); }, [load]);

  // Load everything scoped to the currently-selected job pipeline
  // (interviews, AI feedback, submissions, client feedback, unified timeline).
  const loadPipelineDetail = useCallback(async () => {
    if (!selectedCjId) {
      setInterviews([]); setInterviewFeedback([]); setSubmissions([]);
      setClientFeedback([]); setUnifiedTimeline([]);
      return;
    }
    try {
      const [ivRes, fbRes, subRes, cfRes, tlRes] = await Promise.all([
        (supabase as any).from("interviews").select("id, candidate_job_id, interview_stage, scheduled_at, occurred_at, interviewer_names, status, meeting_link, call_id, interview_instructions, candidate_notified_at").eq("candidate_job_id", selectedCjId).order("scheduled_at", { ascending: false }),
        (supabase as any).from("interview_feedback").select("id, interview_id, candidate_job_id, overall_outcome, technical_strengths, weaknesses, concerns, recommended_next_step, status, confirmed_at").eq("candidate_job_id", selectedCjId).order("created_at", { ascending: false }),
        (supabase as any).from("submissions").select("id, candidate_job_id, status, relevance_explanation, submitted_at, created_at").eq("candidate_job_id", selectedCjId).order("created_at", { ascending: false }),
        (supabase as any).from("client_feedback").select("id, candidate_job_id, feedback_text, sentiment, created_at").eq("candidate_job_id", selectedCjId).order("created_at", { ascending: false }),
        (supabase as any).rpc("get_candidate_job_timeline", { p_candidate_job_id: selectedCjId }),
      ]);
      setInterviews(ivRes.data ?? []);
      setInterviewFeedback(fbRes.data ?? []);
      setSubmissions(subRes.data ?? []);
      setClientFeedback(cfRes.data ?? []);
      setUnifiedTimeline(tlRes.data ?? []);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to load pipeline detail");
    }
  }, [selectedCjId]);

  useEffect(() => { loadPipelineDetail(); }, [loadPipelineDetail]);

  const selectedCj = candidateJobs.find(cj => cj.id === selectedCjId) ?? null;

  // ── Phase 5 actions ─────────────────────────────────────────────────────────
  const moveStage = async (newStage: string, extra: Record<string, any> = {}) => {
    if (!selectedCjId) return;
    setPipelineBusy(true);
    try {
      const { error } = await (supabase as any).rpc("advance_candidate_pipeline_stage", {
        p_candidate_job_id: selectedCjId, p_new_stage: newStage, ...extra,
      });
      if (error) throw error;
      toast.success(`Moved to ${getStageCfg(newStage).label}`);
      load();
      loadPipelineDetail();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to move candidate");
    } finally {
      setPipelineBusy(false);
    }
  };

  const copyMeetingLink = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Meeting link copied");
    } catch {
      toast.info(link, { duration: 8000 });
    }
  };

  // ── Invite to Interview ──────────────────────────────────────────────────
  // Always creates a native Fixsense Meeting (never Google Meet/Zoom/Teams/
  // a manually typed URL) by reusing the exact same infrastructure the Live
  // Call / Meeting Control OS page uses: a `calls` row + create-daily-room.
  // The resulting branded share_link is what gets stored on interviews.meeting_link
  // and is the only link ever shown to or emailed to the candidate.
  //
  // After scheduling, also calls the existing create_recruiting_call RPC
  // (call_type='interview', candidate_job_id, linked_call_id=the new calls
  // row) so the already-built post-interview pipeline — recording ->
  // transcript -> AI interview feedback -> recruiter confirmation ->
  // candidate timeline — fires automatically once the meeting completes.
  // Nothing about that pipeline is reimplemented here.
  const createFixsenseMeetingForInterview = async (title: string): Promise<{ callId: string; shareLink: string }> => {
    if (!user) throw new Error("Not authenticated");

    const { data: callRow, error: callErr } = await supabase.from("calls").insert({
      user_id: user.id,
      name: title,
      status: "scheduled",
      meeting_type: "interview",
      date: new Date().toISOString(),
    } as any).select().single();
    if (callErr) throw callErr;

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    if (!accessToken) throw new Error("Not authenticated");

    const { data: roomData, error: roomErr } = await supabase.functions.invoke("create-daily-room", {
      headers: { Authorization: `Bearer ${accessToken}` },
      body: {
        call_id: callRow.id,
        title,
        meeting_type: "interview",
        exp_minutes: 1440, // 24h — interviews are scheduled ahead, not started immediately
        privacy: "public",
        app_origin: typeof window !== "undefined" ? window.location.origin : "https://fixsense.com.ng",
      },
    });
    if (roomErr) throw new Error(roomErr.message ?? "Failed to create the Fixsense Meeting");
    const room = roomData as { error?: string; share_link?: string } | null;
    if (room?.error) throw new Error(room.error);

    const shareLink = room?.share_link;
    if (!shareLink) throw new Error("Fixsense Meeting was created but returned no link");

    return { callId: callRow.id as string, shareLink };
  };

  const scheduleInterview = async (
    stage: string, scheduledAt: string, timezone: string, interviewers: string[],
    instructions: string, messageToCandidate: string,
  ): Promise<{ interviewId: string; meetingLink: string } | null> => {
    if (!selectedCjId || !selectedCj || !teamId) return null;
    const candidateName = candidate?.full_name ?? "Candidate";
    const jobTitle = selectedCj.job?.title ?? "the role";
    try {
      const meetingTitle = `Interview — ${candidateName} — ${jobTitle}`;
      const { callId, shareLink } = await createFixsenseMeetingForInterview(meetingTitle);

      // create_recruiting_call links this Fixsense Meeting to the
      // Candidate -> Job -> Client -> Interview -> Recruiter chain and its
      // own trigger (trg_ensure_interview_and_feedback_draft) creates the
      // canonical interviews row + a draft interview_feedback row — the
      // same single source of truth used by the post-interview AI pipeline.
      // That trigger defaults status/occurred_at as if the call already
      // happened (its original use is post-hoc linking), so
      // finalize_scheduled_interview_meeting immediately corrects those two
      // fields and fills in the recruiter's actual scheduling details on
      // that exact same row — never a second interviews row.
      const { data: recruitingCall, error: linkErr } = await (supabase as any).rpc("create_recruiting_call", {
        p_linked_call_id: callId,
        p_team_id: teamId,
        p_call_type: "interview",
        p_candidate_job_id: selectedCjId,
        p_title: meetingTitle,
      });
      if (linkErr) throw linkErr;

      const combinedInstructions = instructions
        ? (timezone ? `${instructions}\n\nTimezone: ${timezone}` : instructions)
        : (timezone ? `Timezone: ${timezone}` : null);

      const { data: interview, error } = await (supabase as any).rpc("finalize_scheduled_interview_meeting", {
        p_recruiting_call_id: recruitingCall.id,
        p_scheduled_at: scheduledAt || null,
        p_interviewer_names: interviewers.length ? interviewers : null,
        p_meeting_link: shareLink,
        p_interview_instructions: combinedInstructions,
        p_message_to_candidate: messageToCandidate || null,
        p_interview_stage: stage || null,
      });
      if (error) throw error;

      toast.success("Fixsense Meeting created and interview scheduled");
      // Deliberately NOT calling load()/loadPipelineDetail() here: load()
      // flips the page-level `loading` flag, which unmounts the whole page
      // tree (including this modal and its in-progress `result` state) via
      // the `if (loading) return <DetailSkeleton />` guard below — before
      // ScheduleInterviewModal's submit() can transition to the AI-drafted
      // invitation step. The page refreshes instead of showing "next step".
      // A full reload happens once the modal actually closes (see the
      // ScheduleInterviewModal onClose prop below), by which point the
      // invite flow is done.
      return { interviewId: (interview as any)?.id, meetingLink: shareLink };
    } catch (e: any) {
      toast.error(e.message ?? "Failed to schedule interview");
      return null;
    }
  };


  const runAiMatch = async () => {
    if (!selectedCjId) return;
    setRunningAiMatch(true);
    try {
      const { data, error } = await supabase.functions.invoke("parse-candidate-cv", {
        body: { mode: "candidate_job_match", candidate_job_id: selectedCjId },
      });
      if (error || (data as any)?.error) throw new Error((data as any)?.error ?? error?.message);
      toast.success(`AI match: ${(data as any).match_score}%`);
      loadPipelineDetail();
      load();
    } catch (e: any) {
      toast.error(e.message ?? "AI match failed");
    } finally {
      setRunningAiMatch(false);
    }
  };

  const confirmFeedback = async (feedbackId: string, outcome: string) => {
    try {
      const { error } = await (supabase as any).rpc("confirm_interview_feedback", {
        p_interview_feedback_id: feedbackId, p_overall_outcome: outcome,
      });
      if (error) throw error;
      toast.success("Feedback confirmed");
      loadPipelineDetail();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to confirm feedback");
    }
  };

  const createSubmission = async (explanation: string) => {
    if (!selectedCjId) return;
    try {
      const { error } = await (supabase as any).rpc("create_submission", {
        p_candidate_job_id: selectedCjId, p_relevance_explanation: explanation || null,
      });
      if (error) throw error;
      toast.success("Draft submission created");
      loadPipelineDetail();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to create submission");
    }
  };

  const sendSubmission = async (submissionId: string) => {
    try {
      const { error } = await (supabase as any).rpc("send_submission", { p_submission_id: submissionId });
      if (error) throw error;
      toast.success("Submission sent to client");
      loadPipelineDetail();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to send submission");
    }
  };

  // ── Field editing ──────────────────────────────────────────────────────────
  const updateField = async (field: keyof Candidate, value: any) => {
    if (!candidate) return;
    setSaving(true);
    try {
      const { error } = await (supabase as any).from("candidates").update({ [field]: value }).eq("id", candidate.id);
      if (error) throw error;
      setCandidate(c => c ? { ...c, [field]: value } : c);
      toast.success("Saved");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  // ── Consent & erasure (compliance) ──────────────────────────────────────
  // request_candidate_deletion / execute_candidate_erasure are the only
  // sanctioned way to mutate deletion/erasure state — never write
  // deleted_at / anonymized directly, so the audit trail in
  // recruiting_timeline_events always reflects what actually happened.
  const [erasing, setErasing] = useState(false);
  const [requestingDeletion, setRequestingDeletion] = useState(false);
  const [showErasureConfirm, setShowErasureConfirm] = useState(false);
  const [erasureConfirmText, setErasureConfirmText] = useState("");

  const setConsent = async (field: "data_consent_given" | "recording_consent_given" | "marketing_consent_given", value: boolean) => {
    if (!candidate) return;
    setSaving(true);
    try {
      const timestampField = field === "data_consent_given" ? "data_consent_given_at"
        : field === "recording_consent_given" ? "recording_consent_given_at" : null;
      const updates: Record<string, any> = { [field]: value };
      if (timestampField) updates[timestampField] = value ? new Date().toISOString() : null;
      if (field === "data_consent_given" && value) updates.data_consent_source = "recruiter_recorded";
      const { error } = await (supabase as any).from("candidates").update(updates).eq("id", candidate.id);
      if (error) throw error;
      setCandidate(c => c ? { ...c, ...updates } : c);
      toast.success(value ? "Consent recorded" : "Consent withdrawn");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to update consent");
    } finally {
      setSaving(false);
    }
  };

  const requestDeletion = async () => {
    if (!candidate) return;
    setRequestingDeletion(true);
    try {
      const { error } = await (supabase as any).rpc("request_candidate_deletion", {
        p_candidate_id: candidate.id,
        p_reason: null,
      });
      if (error) throw error;
      setCandidate(c => c ? { ...c, deletion_requested_at: new Date().toISOString() } : c);
      setTimeline(t => [{ id: `local-${Date.now()}`, event_type: "deletion_requested", title: "Deletion/erasure requested", created_at: new Date().toISOString() }, ...t]);
      toast.success("Deletion requested — erase the record when you're ready to finalize it");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to request deletion");
    } finally {
      setRequestingDeletion(false);
    }
  };

  const cancelDeletionRequest = async () => {
    if (!candidate) return;
    setRequestingDeletion(true);
    try {
      const { error } = await (supabase as any).from("candidates").update({ deletion_requested_at: null }).eq("id", candidate.id);
      if (error) throw error;
      setCandidate(c => c ? { ...c, deletion_requested_at: null } : c);
      toast.success("Deletion request cancelled");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to cancel deletion request");
    } finally {
      setRequestingDeletion(false);
    }
  };

  const executeErasure = async () => {
    if (!candidate) return;
    setErasing(true);
    try {
      const { error } = await (supabase as any).rpc("execute_candidate_erasure", { p_candidate_id: candidate.id });
      if (error) throw error;
      toast.success("Candidate data erased");
      setShowErasureConfirm(false);
      setErasureConfirmText("");
      await load();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to erase candidate data");
    } finally {
      setErasing(false);
    }
  };

  // ── CV upload ────────────────────────────────────────────────────────────
  const handleCvUpload = async (file: File) => {
    if (!candidate || !teamId) return;
    setUploading(true);
    try {
      // storage RLS requires the first path segment to be the team_id
      const ext = file.name.split(".").pop() ?? "pdf";
      const path = `${teamId}/${candidate.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: upErr } = await supabase.storage.from("candidate-cvs").upload(path, file, { contentType: file.type });
      if (upErr) throw upErr;

      const { error: metaErr } = await (supabase as any).from("candidate_cv_files").insert({
        team_id: teamId,
        candidate_id: candidate.id,
        file_path: path,
        file_name: file.name,
        mime_type: file.type,
        file_size: file.size,
        parsing_status: "pending",
      });
      if (metaErr) throw metaErr;

      // update the "current CV" pointer on the candidate row
      await (supabase as any).from("candidates").update({
        cv_file_url: path, cv_file_name: file.name, cv_uploaded_at: new Date().toISOString(),
      }).eq("id", candidate.id);

      toast.success("CV uploaded");
      load();
    } catch (e: any) {
      toast.error(e.message ?? "CV upload failed");
    } finally {
      setUploading(false);
    }
  };

  const openCv = async (path: string) => {
    try {
      const { data, error } = await supabase.storage.from("candidate-cvs").createSignedUrl(path, 60 * 5);
      if (error) throw error;
      window.open(data.signedUrl, "_blank");
    } catch (e: any) {
      toast.error("Unable to open CV");
    }
  };

  // ── Skills ────────────────────────────────────────────────────────────────
  const addSkill = async () => {
    if (!candidate || !newSkill.trim()) return;
    setAddingSkill(true);
    try {
      const { error } = await (supabase as any).from("candidate_skills").insert({
        team_id: candidate.team_id,
        candidate_id: candidate.id,
        skill_name: newSkill.trim(),
        source: "recruiter",
      });
      if (error) throw error;
      setNewSkill("");
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to add skill");
    } finally {
      setAddingSkill(false);
    }
  };

  const removeSkill = async (skillId: string) => {
    try {
      const { error } = await (supabase as any).from("candidate_skills").delete().eq("id", skillId);
      if (error) throw error;
      setSkills(s => s.filter(sk => sk.id !== skillId));
    } catch (e: any) {
      toast.error(e.message ?? "Failed to remove skill");
    }
  };

  // AI-extracted skills (candidate.skills, confirmed via ai_extractions) are a
  // separate source from the manually-tracked candidate_skills rows above —
  // this promotes one into a tracked skill (source: "ai_extraction") without
  // touching the others, then drops it from the suggestion list.
  const [addingAiSkill, setAddingAiSkill] = useState<string | null>(null);
  const addAiSkill = async (skillName: string) => {
    if (!candidate) return;
    setAddingAiSkill(skillName);
    try {
      const { error } = await (supabase as any).from("candidate_skills").insert({
        team_id: candidate.team_id,
        candidate_id: candidate.id,
        skill_name: skillName,
        source: "ai_extraction",
      });
      if (error) throw error;
      await load();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to add skill");
    } finally {
      setAddingAiSkill(null);
    }
  };

  // ── AI extraction review ─────────────────────────────────────────────────
  const pendingExtractions = extractions.filter(e => e.status === "pending_review");

  const confirmExtraction = async (extractionId: string) => {
    setReviewingId(extractionId);
    try {
      const { error } = await (supabase as any).rpc("confirm_candidate_ai_extraction", { p_extraction_id: extractionId });
      if (error) throw error;
      toast.success("Confirmed");
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to confirm");
    } finally {
      setReviewingId(null);
    }
  };

  const editExtraction = async (extractionId: string, rawValue: string) => {
    setReviewingId(extractionId);
    try {
      // ai_value/recruiter_correction are jsonb; send raw string values as a JSON scalar
      let jsonValue: any = rawValue;
      if (!isNaN(Number(rawValue)) && rawValue.trim() !== "") jsonValue = Number(rawValue);
      const { error } = await (supabase as any).rpc("edit_candidate_ai_extraction", {
        p_extraction_id: extractionId, p_recruiter_value: jsonValue,
      });
      if (error) throw error;
      toast.success("Saved edit");
      setEditDrafts(d => { const next = { ...d }; delete next[extractionId]; return next; });
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to save edit");
    } finally {
      setReviewingId(null);
    }
  };

  const rejectExtraction = async (extractionId: string) => {
    setReviewingId(extractionId);
    try {
      const { error } = await (supabase as any).rpc("reject_candidate_ai_extraction", { p_extraction_id: extractionId });
      if (error) throw error;
      toast.success("Rejected");
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to reject");
    } finally {
      setReviewingId(null);
    }
  };

  const confirmAllPending = async () => {
    const ids = pendingExtractions.map(e => e.id);
    if (ids.length === 0) return;
    setReviewingId("__all__");
    try {
      for (const eid of ids) {
        const { error } = await (supabase as any).rpc("confirm_candidate_ai_extraction", { p_extraction_id: eid });
        if (error) throw error;
      }
      toast.success(`Confirmed ${ids.length} field${ids.length === 1 ? "" : "s"}`);
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to confirm all");
    } finally {
      setReviewingId(null);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return <DashboardLayout><DetailSkeleton /></DashboardLayout>;
  }

  if (error || !candidate) {
    return (
      <DashboardLayout>
        <div style={{ textAlign: "center", padding: "48px 20px" }}>
          <p style={{ fontSize: 13, color: "rgba(23,23,15,0.5)", marginBottom: 16 }}>{error ?? "Candidate not found"}</p>
          <button onClick={load} style={{ padding: "9px 18px", background: "rgba(23,23,15,0.06)", border: "none", borderRadius: 10, color: "#17170F", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
            Retry
          </button>
        </div>
      </DashboardLayout>
    );
  }

  const statusCfg = getStatusCfg(candidate.status);
  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "8px 10px", background: "rgba(23,23,15,0.03)",
    border: "1px solid rgba(23,23,15,0.1)", borderRadius: 8, color: "#17170F",
    fontSize: 12.5, fontFamily: "'Inter', sans-serif", outline: "none", boxSizing: "border-box",
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 10.5, fontWeight: 700, color: "rgba(23,23,15,0.4)", marginBottom: 5, display: "block",
    textTransform: "uppercase", letterSpacing: "0.05em",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 900, margin: "0 auto", fontFamily: "'Inter', sans-serif" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button onClick={() => navigate("/candidates")} style={{ background: "none", border: "none", cursor: "pointer", padding: 6, color: "rgba(23,23,15,0.4)" }}>
          <ArrowLeft style={{ width: 18, height: 18 }} />
        </button>
        <div style={{
          width: 40, height: 40, borderRadius: 11, background: "rgba(34,49,92,0.08)",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700, color: "#22315C",
        }}>
          {candidate.full_name.slice(0, 1).toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: 18, fontWeight: 800, color: "#17170F", margin: 0 }}>{candidate.full_name}</h1>
          <p style={{ fontSize: 12, color: "rgba(23,23,15,0.4)", margin: "2px 0 0" }}>
            {candidate.candidate_current_role || "No role set"}{candidate.current_company ? ` · ${candidate.current_company}` : ""}
          </p>
        </div>
        <select
          value={candidate.status}
          onChange={e => updateField("status", e.target.value)}
          style={{
            fontSize: 11, fontWeight: 700, padding: "6px 10px", borderRadius: 8, border: "none",
            background: statusCfg.color + "18", color: statusCfg.color, cursor: "pointer",
          }}
        >
          {STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
      </div>

      {/* AI Review Panel — only shown when there's something to review */}
      {pendingExtractions.length > 0 && (
        <div style={{ background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.18)", borderRadius: 14, padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#4c3ea8", display: "flex", alignItems: "center", gap: 7 }}>
              <Sparkles style={{ width: 14, height: 14 }} />
              AI Extracted Candidate Information ({pendingExtractions.length})
            </div>
            <button
              onClick={confirmAllPending}
              disabled={reviewingId !== null}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", background: "#22315C", border: "none", borderRadius: 8, color: "#FAFAF8", fontSize: 11.5, fontWeight: 700, cursor: reviewingId ? "default" : "pointer", opacity: reviewingId ? 0.6 : 1 }}
            >
              {reviewingId === "__all__" ? <Loader2 style={{ width: 12, height: 12, animation: "spin 1s linear infinite" }} /> : <CheckCircle2 style={{ width: 12, height: 12 }} />}
              Confirm All
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {pendingExtractions.map(ext => {
              const isRowBusy = reviewingId === ext.id || reviewingId === "__all__";
              const draftValue = editDrafts[ext.id] ?? String(ext.ai_value ?? "");
              return (
                <div key={ext.id} style={{ background: "#FFFFFF", border: "1px solid rgba(23,23,15,0.08)", borderRadius: 10, padding: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, gap: 8, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(23,23,15,0.4)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                        {FIELD_LABELS[ext.field_name] ?? ext.field_name}
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#17170F", marginTop: 2 }}>
                        {typeof ext.ai_value === "object" ? JSON.stringify(ext.ai_value) : String(ext.ai_value)}
                      </div>
                    </div>
                    {ext.confidence !== null && (
                      <div style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6, background: ext.confidence >= 0.85 ? "rgba(34,197,94,0.12)" : "rgba(251,191,36,0.15)", color: ext.confidence >= 0.85 ? "#16a34a" : "#b45309" }}>
                        {Math.round(ext.confidence * 100)}% confidence
                      </div>
                    )}
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <input
                      value={draftValue}
                      onChange={e => setEditDrafts(d => ({ ...d, [ext.id]: e.target.value }))}
                      style={{ ...inputStyle, flex: 1, minWidth: 120 }}
                      disabled={isRowBusy}
                    />
                    <button
                      onClick={() => confirmExtraction(ext.id)}
                      disabled={isRowBusy}
                      style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 11px", background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.25)", borderRadius: 8, color: "#16a34a", fontSize: 11.5, fontWeight: 700, cursor: isRowBusy ? "default" : "pointer" }}
                    >
                      <Check style={{ width: 12, height: 12 }} />Confirm
                    </button>
                    <button
                      onClick={() => editExtraction(ext.id, draftValue)}
                      disabled={isRowBusy}
                      style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 11px", background: "rgba(96,165,250,0.12)", border: "1px solid rgba(96,165,250,0.25)", borderRadius: 8, color: "#22315C", fontSize: 11.5, fontWeight: 700, cursor: isRowBusy ? "default" : "pointer" }}
                    >
                      <Edit3 style={{ width: 12, height: 12 }} />Edit &amp; Confirm
                    </button>
                    <button
                      onClick={() => rejectExtraction(ext.id)}
                      disabled={isRowBusy}
                      style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 11px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, color: "#dc2626", fontSize: 11.5, fontWeight: 700, cursor: isRowBusy ? "default" : "pointer" }}
                    >
                      <X style={{ width: 12, height: 12 }} />Reject
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Job pipelines for this candidate */}
      <Section title={`Job Pipelines (${candidateJobs.length})`} icon={Kanban} accent="#22315C" defaultOpen={candidateJobs.length > 0}>
        {candidateJobs.length === 0 ? (
          <p style={{ fontSize: 12, color: "rgba(23,23,15,0.3)" }}>Not yet added to a job pipeline. Add this candidate to a job from the Pipeline board.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {candidateJobs.map(cj => {
              const stageCfg = getStageCfg(cj.pipeline_stage);
              const isSelected = cj.id === selectedCjId;
              return (
                <div
                  key={cj.id}
                  onClick={() => setSelectedCjId(cj.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, cursor: "pointer",
                    background: isSelected ? "rgba(34,49,92,0.07)" : "rgba(23,23,15,0.03)",
                    border: isSelected ? "1.5px solid rgba(34,49,92,0.3)" : "1px solid transparent",
                    flexWrap: "wrap",
                  }}
                >
                  <Briefcase style={{ width: 13, height: 13, color: "#22315C", flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#17170F", flex: 1, minWidth: 120 }}>{cj.job?.title ?? "Unknown job"}</span>
                  {cj.match_score !== null && (
                    <span style={{ fontSize: 10.5, fontWeight: 700, padding: "3px 8px", borderRadius: 6, background: cj.match_score >= 70 ? "rgba(34,197,94,0.12)" : "rgba(251,191,36,0.15)", color: cj.match_score >= 70 ? "#16a34a" : "#b45309" }}>
                      {cj.match_score}% match
                    </span>
                  )}
                  <span style={{ fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 7, background: stageCfg.color + "18", color: stageCfg.color, flexShrink: 0 }}>
                    {stageCfg.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {selectedCj && selectedCj.pipeline_stage === "placed" && (
          <div style={{ marginTop: 12, padding: 12, background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#16a34a", marginBottom: 6 }}>Placed</div>
            <div style={{ fontSize: 11.5, color: "rgba(23,23,15,0.6)", display: "flex", flexDirection: "column", gap: 3 }}>
              {selectedCj.placement_salary && <span>Salary: {formatMoney(selectedCj.placement_salary, selectedCj.placement_salary_currency)}</span>}
              {selectedCj.placement_fee && <span>Fee: {formatMoney(selectedCj.placement_fee, selectedCj.placement_fee_currency)}</span>}
              {selectedCj.placement_notes && <span>{selectedCj.placement_notes}</span>}
            </div>
          </div>
        )}
      </Section>

      {selectedCj && (
        <>
        <Section title="AI Match" icon={Sparkles} accent="#7c3aed" defaultOpen right={
          <button
            onClick={runAiMatch}
            disabled={runningAiMatch}
            style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", background: "rgba(124,58,237,0.1)", border: "1px solid rgba(124,58,237,0.25)", borderRadius: 8, color: "#7c3aed", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}
          >
            {runningAiMatch ? <Loader2 style={{ width: 12, height: 12, animation: "spin 1s linear infinite" }} /> : <Sparkles style={{ width: 12, height: 12 }} />}
            {selectedCj.match_score !== null ? "Re-run AI Match" : "Run AI Match"}
          </button>
        }>
          {selectedCj.match_score === null ? (
            <p style={{ fontSize: 12, color: "rgba(23,23,15,0.3)" }}>No AI match computed yet for this pipeline. Click "Run AI Match" to compare this candidate against the job's requirements.</p>
          ) : (
            <div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 14 }}>
                <span style={{ fontSize: 30, fontWeight: 800, color: selectedCj.match_score >= 75 ? "#16a34a" : selectedCj.match_score >= 50 ? "#b45309" : "#dc2626" }}>
                  {selectedCj.match_score}%
                </span>
                <span style={{ fontSize: 12, color: "rgba(23,23,15,0.4)" }}>match</span>
              </div>

              {!!selectedCj.match_explanation?.matched_requirements?.length && (
                <MatchList label="Strong matches" items={selectedCj.match_explanation.matched_requirements} icon="✓" color="#16a34a" />
              )}
              {!!selectedCj.match_explanation?.missing_requirements?.length && (
                <MatchList label="Missing requirements" items={selectedCj.match_explanation.missing_requirements} icon="✗" color="#dc2626" />
              )}
              {!!selectedCj.match_explanation?.relevant_skills?.length && (
                <MatchList label="Relevant skills" items={selectedCj.match_explanation.relevant_skills} icon="•" color="#22315C" />
              )}
              {selectedCj.match_explanation?.relevant_experience && (
                <MatchField label="Relevant experience" value={selectedCj.match_explanation.relevant_experience} />
              )}
              {!!selectedCj.match_explanation?.potential_concerns?.length && (
                <MatchList label="Potential concerns" items={selectedCj.match_explanation.potential_concerns} icon="⚠" color="#b45309" />
              )}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, margin: "10px 0" }}>
                {selectedCj.match_explanation?.salary_compatibility && (
                  <MatchField label="Salary" value={humanizeCompat(selectedCj.match_explanation.salary_compatibility)} />
                )}
                {selectedCj.match_explanation?.location_compatibility && (
                  <MatchField label="Location" value={humanizeCompat(selectedCj.match_explanation.location_compatibility)} />
                )}
              </div>
              {selectedCj.match_explanation?.availability_notice && (
                <MatchField label="Availability / notice" value={selectedCj.match_explanation.availability_notice} />
              )}
              {selectedCj.match_explanation?.overall_recommendation && (
                <div style={{ marginTop: 10, padding: 12, background: "rgba(124,58,237,0.06)", border: "1px solid rgba(124,58,237,0.18)", borderRadius: 10 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: "#7c3aed", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>
                    Recommendation for the recruiter
                  </div>
                  <div style={{ fontSize: 12.5, color: "#17170F", lineHeight: 1.6 }}>{selectedCj.match_explanation.overall_recommendation}</div>
                </div>
              )}
              <p style={{ fontSize: 10.5, color: "rgba(23,23,15,0.3)", marginTop: 10 }}>
                This is an AI-generated recommendation only. You make the final decision.
              </p>
            </div>
          )}
        </Section>
        <>
          {/* Interviews */}
          <Section title={`Interviews (${interviews.length})`} icon={Video} accent="#22315C" right={
            <button
              onClick={() => setShowScheduleModal(true)}
              style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 11px", background: "#22315C", border: "none", borderRadius: 8, color: "#FAFAF8", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
            >
              <Plus style={{ width: 11, height: 11 }} />Schedule
            </button>
          }>
            {interviews.length === 0 ? (
              <p style={{ fontSize: 12, color: "rgba(23,23,15,0.3)" }}>No interviews scheduled yet.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {interviews.map(iv => (
                  <div key={iv.id} style={{ display: "flex", flexDirection: "column", gap: 6, padding: "9px 11px", background: "rgba(23,23,15,0.03)", borderRadius: 9 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <Video style={{ width: 12, height: 12, color: "#22315C", flexShrink: 0 }} />
                      <span style={{ fontSize: 12.5, color: "#17170F", flex: 1, minWidth: 100, textTransform: "capitalize" }}>{iv.interview_stage.replace(/_/g, " ")}</span>
                      {iv.scheduled_at && <span style={{ fontSize: 11, color: "rgba(23,23,15,0.45)" }}>{format(new Date(iv.scheduled_at), "MMM d, h:mm a")}</span>}
                      <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(23,23,15,0.4)", textTransform: "capitalize", flexShrink: 0 }}>{iv.status}</span>
                    </div>
                    {iv.meeting_link && (
                      <div style={{ display: "flex", alignItems: "center", gap: 6, paddingLeft: 20 }}>
                        <span style={{ fontSize: 11, color: "rgba(23,23,15,0.45)", fontFamily: "monospace", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{iv.meeting_link}</span>
                        <button
                          onClick={() => copyMeetingLink(iv.meeting_link!)}
                          title="Copy Fixsense Meeting link"
                          style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, background: "transparent", border: "1px solid rgba(23,23,15,0.12)", borderRadius: 6, cursor: "pointer", color: "rgba(23,23,15,0.5)", flexShrink: 0 }}
                        >
                          <Copy style={{ width: 11, height: 11 }} />
                        </button>
                        <a
                          href={iv.meeting_link} target="_blank" rel="noopener noreferrer"
                          title="Open Fixsense Meeting"
                          style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, background: "transparent", border: "1px solid rgba(23,23,15,0.12)", borderRadius: 6, color: "rgba(23,23,15,0.5)", flexShrink: 0 }}
                        >
                          <ExternalLink style={{ width: 11, height: 11 }} />
                        </a>
                        {iv.candidate_notified_at && (
                          <span style={{ fontSize: 9.5, fontWeight: 700, color: "#2F6B4F", flexShrink: 0 }}>Candidate notified</span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* AI interview feedback */}
          <Section title={`Interview Feedback (${interviewFeedback.length})`} icon={Sparkles} accent="#22315C" defaultOpen={interviewFeedback.some(f => f.status === "pending_review")}>
            {interviewFeedback.length === 0 ? (
              <p style={{ fontSize: 12, color: "rgba(23,23,15,0.3)" }}>No interview feedback yet.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {interviewFeedback.map(fb => (
                  <div key={fb.id} style={{ background: fb.status === "pending_review" ? "rgba(99,102,241,0.05)" : "#FFFFFF", border: "1px solid rgba(23,23,15,0.08)", borderRadius: 10, padding: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(23,23,15,0.5)", textTransform: "capitalize" }}>{fb.overall_outcome ?? "pending"}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6, background: fb.status === "confirmed" ? "rgba(34,197,94,0.12)" : "rgba(99,102,241,0.12)", color: fb.status === "confirmed" ? "#16a34a" : "#4c3ea8" }}>
                        {fb.status === "confirmed" ? "Confirmed" : "Pending review"}
                      </span>
                    </div>
                    {fb.technical_strengths?.length > 0 && (
                      <p style={{ fontSize: 12, color: "rgba(23,23,15,0.6)", margin: "0 0 4px" }}><b>Strengths:</b> {fb.technical_strengths.join(", ")}</p>
                    )}
                    {fb.concerns?.length > 0 && (
                      <p style={{ fontSize: 12, color: "rgba(23,23,15,0.6)", margin: "0 0 4px" }}><b>Concerns:</b> {fb.concerns.join(", ")}</p>
                    )}
                    {fb.recommended_next_step && (
                      <p style={{ fontSize: 12, color: "rgba(23,23,15,0.6)", margin: "0 0 8px" }}><b>Next step:</b> {fb.recommended_next_step}</p>
                    )}
                    {fb.status === "pending_review" && (
                      <button
                        onClick={() => confirmFeedback(fb.id, fb.overall_outcome ?? "pending")}
                        style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 11px", background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.25)", borderRadius: 8, color: "#16a34a", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}
                      >
                        <ThumbsUp style={{ width: 11, height: 11 }} />Confirm feedback
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Submissions */}
          <Section title={`Submissions (${submissions.length})`} icon={Send} accent="#22315C">
            {submissions.length === 0 ? (
              <div>
                <p style={{ fontSize: 12, color: "rgba(23,23,15,0.3)", marginBottom: 8 }}>No submissions yet for this pipeline.</p>
                <button
                  onClick={() => createSubmission("")}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 13px", background: "#22315C", border: "none", borderRadius: 8, color: "#FAFAF8", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}
                >
                  <Plus style={{ width: 12, height: 12 }} />Create Draft Submission
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {submissions.map(s => (
                  <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 11px", background: "rgba(23,23,15,0.03)", borderRadius: 9, flexWrap: "wrap" }}>
                    <Send style={{ width: 12, height: 12, color: "#22315C", flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: "rgba(23,23,15,0.6)", flex: 1, minWidth: 100 }}>
                      {s.submitted_at ? `Submitted ${formatDistanceToNow(new Date(s.submitted_at), { addSuffix: true })}` : `Created ${formatDistanceToNow(new Date(s.created_at), { addSuffix: true })}`}
                    </span>
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: "rgba(23,23,15,0.4)", textTransform: "capitalize", flexShrink: 0 }}>{s.status.replace(/_/g, " ")}</span>
                    {s.status === "draft" && (
                      <button onClick={() => sendSubmission(s.id)} style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 9px", background: "#22315C", border: "none", borderRadius: 7, color: "#FAFAF8", fontSize: 10.5, fontWeight: 700, cursor: "pointer" }}>
                        <Send style={{ width: 10, height: 10 }} />Send
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Client feedback */}
          <Section title={`Client Feedback (${clientFeedback.length})`} icon={MessageSquare} accent="#22315C" defaultOpen={clientFeedback.length > 0}>
            {clientFeedback.length === 0 ? (
              <p style={{ fontSize: 12, color: "rgba(23,23,15,0.3)" }}>No client feedback recorded yet.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {clientFeedback.map(cf => (
                  <div key={cf.id} style={{ padding: "9px 11px", background: "rgba(23,23,15,0.03)", borderRadius: 9 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: "capitalize", color: cf.sentiment === "positive" ? "#16a34a" : cf.sentiment === "negative" ? "#dc2626" : "#b45309" }}>{cf.sentiment ?? "neutral"}</span>
                      <span style={{ fontSize: 10, color: "rgba(23,23,15,0.35)" }}>{formatDistanceToNow(new Date(cf.created_at), { addSuffix: true })}</span>
                    </div>
                    <p style={{ fontSize: 12, color: "#17170F", margin: 0 }}>{cf.feedback_text}</p>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Pipeline stage controls */}
          <Section title="Move Pipeline Stage" icon={Kanban} accent="#22315C" defaultOpen={false}>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {PIPELINE_STAGES.filter(s => s.key !== selectedCj.pipeline_stage).map(s => (
                <button
                  key={s.key}
                  disabled={pipelineBusy}
                  onClick={() => {
                    if (s.key === "rejected") {
                      const reason = window.prompt("Rejection reason (required): skills_gap, salary_mismatch, location, availability, client_rejected, interview_performance, candidate_withdrew, other");
                      if (!reason) return;
                      moveStage("rejected", { p_rejection_reason: reason });
                    } else if (s.key === "placed") {
                      toast.info("Use the Pipeline board to record placement details (salary, fee, notes).");
                    } else {
                      moveStage(s.key);
                    }
                  }}
                  style={{ fontSize: 11, fontWeight: 600, padding: "7px 11px", borderRadius: 8, border: "1px solid rgba(23,23,15,0.1)", background: "rgba(23,23,15,0.03)", color: "#17170F", cursor: pipelineBusy ? "default" : "pointer", opacity: pipelineBusy ? 0.6 : 1 }}
                >
                  → {s.label}
                </button>
              ))}
            </div>
          </Section>
        </>
        </>
      )}

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0,1fr) minmax(240px, 300px)", gap: 16, alignItems: "start" }}>
        {/* LEFT: main content */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>

          {/* Overview */}
          <Section title="Overview" icon={User} accent="#22315C">
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10, marginTop: 4 }}>
              <div>
                <label style={labelStyle}>Email</label>
                <input style={inputStyle} defaultValue={candidate.email ?? ""} onBlur={e => e.target.value !== (candidate.email ?? "") && updateField("email", e.target.value || null)} />
              </div>
              <div>
                <label style={labelStyle}>Phone</label>
                <input style={inputStyle} defaultValue={candidate.phone ?? ""} onBlur={e => e.target.value !== (candidate.phone ?? "") && updateField("phone", e.target.value || null)} />
              </div>
              <div>
                <label style={labelStyle}>Location</label>
                <input style={inputStyle} defaultValue={candidate.location ?? ""} onBlur={e => e.target.value !== (candidate.location ?? "") && updateField("location", e.target.value || null)} />
              </div>
              <div>
                <label style={labelStyle}>Years experience</label>
                <input type="number" style={inputStyle} defaultValue={candidate.years_experience ?? ""} onBlur={e => updateField("years_experience", e.target.value ? Number(e.target.value) : null)} />
              </div>
              <div>
                <label style={labelStyle}>Current role</label>
                <input style={inputStyle} defaultValue={candidate.candidate_current_role ?? ""} onBlur={e => updateField("candidate_current_role", e.target.value || null)} />
              </div>
              <div>
                <label style={labelStyle}>Current company</label>
                <input style={inputStyle} defaultValue={candidate.current_company ?? ""} onBlur={e => updateField("current_company", e.target.value || null)} />
              </div>
              <div>
                <label style={labelStyle}>Expected salary</label>
                <input type="number" style={inputStyle} defaultValue={candidate.expected_salary ?? ""} onBlur={e => updateField("expected_salary", e.target.value ? Number(e.target.value) : null)} />
              </div>
              <div>
                <label style={labelStyle}>Notice period</label>
                <input style={inputStyle} defaultValue={candidate.notice_period ?? ""} onBlur={e => updateField("notice_period", e.target.value || null)} />
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <label style={labelStyle}>Recruiter assessment</label>
              <textarea
                style={{ ...inputStyle, minHeight: 60, resize: "vertical" }}
                defaultValue={candidate.recruiter_assessment ?? ""}
                onBlur={e => updateField("recruiter_assessment", e.target.value || null)}
              />
            </div>
          </Section>

          {/* CV */}
          <Section title="CV" icon={FileText} accent="#22315C">
            <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) handleCvUpload(f); e.target.value = ""; }} />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", background: "rgba(96,165,250,0.1)", border: "1px dashed rgba(96,165,250,0.3)", borderRadius: 10, color: "#22315C", fontSize: 12.5, fontWeight: 600, cursor: uploading ? "default" : "pointer", marginBottom: 10 }}
            >
              {uploading ? <Loader2 style={{ width: 13, height: 13, animation: "spin 1s linear infinite" }} /> : <Upload style={{ width: 13, height: 13 }} />}
              {uploading ? "Uploading…" : "Upload CV"}
            </button>

            {cvFiles.length === 0 ? (
              <p style={{ fontSize: 12, color: "rgba(23,23,15,0.3)" }}>No CV uploaded yet.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {cvFiles.map(f => {
                  const statusMap: Record<string, { label: string; color: string; icon: React.ElementType }> = {
                    pending: { label: "CV uploaded", color: "rgba(23,23,15,0.4)", icon: FileText },
                    processing: { label: "CV processing", color: "#b45309", icon: Loader2 },
                    completed: { label: "CV processed", color: "#16a34a", icon: CheckCircle2 },
                    failed: { label: "CV parsing failed", color: "#dc2626", icon: AlertCircle },
                  };
                  const st = statusMap[f.parsing_status] ?? statusMap.pending;
                  const StIcon = st.icon;
                  return (
                    <div key={f.id} onClick={() => openCv(f.file_path)} title="Click to open CV" style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 11px", background: "rgba(23,23,15,0.03)", borderRadius: 9, cursor: "pointer" }}>
                      <FileText style={{ width: 13, height: 13, color: "rgba(23,23,15,0.35)", flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, color: "#17170F", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.file_name}</div>
                        <div style={{ fontSize: 10.5, color: "rgba(23,23,15,0.35)" }}>{formatDistanceToNow(new Date(f.created_at), { addSuffix: true })}</div>
                      </div>
                      <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 700, color: st.color, flexShrink: 0 }}>
                        <StIcon style={{ width: 10, height: 10 }} />{st.label}
                      </span>
                      <ExternalLink style={{ width: 12, height: 12, color: "rgba(23,23,15,0.3)", flexShrink: 0 }} />
                    </div>
                  );
                })}
              </div>
            )}
          </Section>

          {/* Skills */}
          <Section title={`Skills (${skills.length})`} icon={Tag} accent="#22315C">
            {!!candidate.skills?.length && (() => {
              const trackedNames = new Set(skills.map(s => s.skill_name.trim().toLowerCase()));
              const suggested = candidate.skills.filter(sk => !trackedNames.has(sk.trim().toLowerCase()));
              if (!suggested.length) return null;
              return (
                <div style={{ marginBottom: 14, padding: "10px 12px", background: "rgba(34,49,92,0.05)", border: "1px solid rgba(34,49,92,0.14)", borderRadius: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, fontSize: 10.5, fontWeight: 700, color: "#22315C", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    <Sparkles style={{ width: 11, height: 11 }} /> From CV / AI extraction
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {suggested.map(sk => (
                      <button
                        key={sk}
                        onClick={() => addAiSkill(sk)}
                        disabled={addingAiSkill === sk}
                        style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", background: "#FAFAF8", border: "1px dashed rgba(34,49,92,0.3)", borderRadius: 8, fontSize: 12, color: "#17170F", cursor: addingAiSkill === sk ? "default" : "pointer" }}
                      >
                        {addingAiSkill === sk ? <Loader2 style={{ width: 10, height: 10, animation: "spin 1s linear infinite" }} /> : <Plus style={{ width: 10, height: 10, color: "#22315C" }} />}
                        {sk}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}
            <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
              <input
                value={newSkill}
                onChange={e => setNewSkill(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") addSkill(); }}
                placeholder="Add a skill…"
                style={{ ...inputStyle, flex: 1 }}
              />
              <button onClick={addSkill} disabled={addingSkill || !newSkill.trim()} style={{ display: "flex", alignItems: "center", gap: 5, padding: "8px 12px", background: "#22315C", border: "none", borderRadius: 8, color: "#FAFAF8", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                <Plus style={{ width: 12, height: 12 }} />Add
              </button>
            </div>
            {skills.length === 0 ? (
              <p style={{ fontSize: 12, color: "rgba(23,23,15,0.3)" }}>No skills recorded yet.</p>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {skills.map(s => (
                  <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", background: "rgba(34,49,92,0.07)", borderRadius: 8, fontSize: 12 }}>
                    <span style={{ color: "#17170F", fontWeight: 600 }}>{s.skill_name}</span>
                    {s.years_experience && <span style={{ color: "rgba(23,23,15,0.35)" }}>· {s.years_experience}y</span>}
                    <span style={{ fontSize: 9, color: "rgba(23,23,15,0.3)", textTransform: "uppercase" }}>{s.source}</span>
                    <button onClick={() => removeSkill(s.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", color: "rgba(23,23,15,0.3)" }}>
                      <X style={{ width: 11, height: 11 }} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Calls */}
          <Section title={`Screening Calls (${calls.length})`} icon={Phone} accent="#22315C">
            {calls.length === 0 ? (
              <p style={{ fontSize: 12, color: "rgba(23,23,15,0.3)" }}>No calls linked yet.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {calls.map(c => (
                  <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 11px", background: "rgba(23,23,15,0.03)", borderRadius: 9 }}>
                    <Phone style={{ width: 12, height: 12, color: "#22315C", flexShrink: 0 }} />
                    <span style={{ fontSize: 12.5, color: "#17170F", flex: 1 }}>{c.title || c.call_type.replace(/_/g, " ")}</span>
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: "rgba(23,23,15,0.35)", textTransform: "capitalize" }}>{c.status}</span>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>

        {/* RIGHT: timeline */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
          <div style={{ background: "rgba(23,23,15,0.02)", border: "1px solid rgba(23,23,15,0.06)", borderRadius: 14, padding: 14, maxHeight: isMobile ? 420 : "calc(100vh - 220px)", overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(23,23,15,0.25)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                {selectedCj ? "Pipeline Timeline" : "Timeline"}
              </div>
              <button onClick={() => { load(); loadPipelineDetail(); }} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(23,23,15,0.3)", padding: 2 }}>
                <RefreshCw style={{ width: 12, height: 12 }} />
              </button>
            </div>

            {selectedCj ? (
              unifiedTimeline.length === 0 ? (
                <p style={{ fontSize: 12, color: "rgba(23,23,15,0.25)" }}>No activity yet for this pipeline.</p>
              ) : (
                unifiedTimeline.map((e, i) => (
                  <div key={`${e.event_type}-${e.occurred_at}-${i}`} style={{ display: "flex", gap: 9, paddingBottom: 10, position: "relative" }}>
                    {i < unifiedTimeline.length - 1 && <div style={{ position: "absolute", left: 5, top: 16, bottom: 0, width: 1, background: "rgba(23,23,15,0.06)" }} />}
                    <div style={{ width: 11, height: 11, borderRadius: "50%", background: "rgba(96,165,250,0.3)", border: "1px solid rgba(96,165,250,0.4)", flexShrink: 0, marginTop: 2, zIndex: 1 }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: "rgba(23,23,15,0.65)" }}>{e.title}</div>
                      {e.description && <div style={{ fontSize: 11, color: "rgba(23,23,15,0.4)", marginTop: 2 }}>{e.description}</div>}
                      <div style={{ fontSize: 10, color: "rgba(23,23,15,0.25)", marginTop: 2 }}>{formatDistanceToNow(new Date(e.occurred_at), { addSuffix: true })}</div>
                    </div>
                  </div>
                ))
              )
            ) : (
              timeline.length === 0 ? (
                <p style={{ fontSize: 12, color: "rgba(23,23,15,0.25)" }}>No activity yet.</p>
              ) : (
                timeline.map((e, i) => (
                  <div key={e.id} style={{ display: "flex", gap: 9, paddingBottom: 10, position: "relative" }}>
                    {i < timeline.length - 1 && <div style={{ position: "absolute", left: 5, top: 16, bottom: 0, width: 1, background: "rgba(23,23,15,0.06)" }} />}
                    <div style={{ width: 11, height: 11, borderRadius: "50%", background: "rgba(96,165,250,0.3)", border: "1px solid rgba(96,165,250,0.4)", flexShrink: 0, marginTop: 2, zIndex: 1 }} />
                    <div>
                      <div style={{ fontSize: 12, color: "rgba(23,23,15,0.65)" }}>{e.title}</div>
                      <div style={{ fontSize: 10, color: "rgba(23,23,15,0.25)", marginTop: 2 }}>{formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}</div>
                    </div>
                  </div>
                ))
              )
            )}
          </div>
        </div>
      </div>

      {/* Privacy & Compliance */}
      <div style={{ background: "#FFFFFF", border: "1px solid rgba(23,23,15,0.08)", borderRadius: 14, padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 12 }}>
          <Shield style={{ width: 14, height: 14, color: "#22315C" }} />
          <h3 style={{ fontSize: 13, fontWeight: 800, color: "#17170F", margin: 0 }}>Privacy &amp; Compliance</h3>
        </div>

        {candidate.anonymized || candidate.deleted_at ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: "rgba(100,116,139,0.08)", border: "1px solid rgba(100,116,139,0.2)", borderRadius: 10 }}>
            <ShieldCheck style={{ width: 14, height: 14, color: "#64748b", flexShrink: 0 }} />
            <p style={{ fontSize: 12, color: "rgba(23,23,15,0.55)", margin: 0 }}>
              This candidate's personal data was erased{candidate.deleted_at ? ` ${formatDistanceToNow(new Date(candidate.deleted_at), { addSuffix: true })}` : ""}. Name, contact details, resume, notes, and skills have been removed; the record is kept only as an anonymized placeholder for pipeline history.
            </p>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: "#17170F" }}>Data processing consent</div>
                  <div style={{ fontSize: 11, color: "rgba(23,23,15,0.4)" }}>
                    {candidate.data_consent_given && candidate.data_consent_given_at
                      ? `Given ${formatDistanceToNow(new Date(candidate.data_consent_given_at), { addSuffix: true })}`
                      : "Not yet recorded"}
                  </div>
                </div>
                <button
                  onClick={() => setConsent("data_consent_given", !candidate.data_consent_given)}
                  disabled={saving}
                  style={{
                    fontSize: 11, fontWeight: 700, padding: "6px 12px", borderRadius: 8, border: "none", flexShrink: 0,
                    background: candidate.data_consent_given ? "rgba(34,197,94,0.12)" : "rgba(23,23,15,0.06)",
                    color: candidate.data_consent_given ? "#16a34a" : "rgba(23,23,15,0.5)",
                    cursor: saving ? "default" : "pointer",
                  }}
                >
                  {candidate.data_consent_given ? "Given" : "Not given"}
                </button>
              </div>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: "#17170F" }}>Call recording consent</div>
                  <div style={{ fontSize: 11, color: "rgba(23,23,15,0.4)" }}>
                    {candidate.recording_consent_given && candidate.recording_consent_given_at
                      ? `Given ${formatDistanceToNow(new Date(candidate.recording_consent_given_at), { addSuffix: true })}`
                      : "Not yet recorded"}
                  </div>
                </div>
                <button
                  onClick={() => setConsent("recording_consent_given", !candidate.recording_consent_given)}
                  disabled={saving}
                  style={{
                    fontSize: 11, fontWeight: 700, padding: "6px 12px", borderRadius: 8, border: "none", flexShrink: 0,
                    background: candidate.recording_consent_given ? "rgba(34,197,94,0.12)" : "rgba(23,23,15,0.06)",
                    color: candidate.recording_consent_given ? "#16a34a" : "rgba(23,23,15,0.5)",
                    cursor: saving ? "default" : "pointer",
                  }}
                >
                  {candidate.recording_consent_given ? "Given" : "Not given"}
                </button>
              </div>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: "#17170F" }}>Marketing consent</div>
                  <div style={{ fontSize: 11, color: "rgba(23,23,15,0.4)" }}>Future roles &amp; updates</div>
                </div>
                <button
                  onClick={() => setConsent("marketing_consent_given", !candidate.marketing_consent_given)}
                  disabled={saving}
                  style={{
                    fontSize: 11, fontWeight: 700, padding: "6px 12px", borderRadius: 8, border: "none", flexShrink: 0,
                    background: candidate.marketing_consent_given ? "rgba(34,197,94,0.12)" : "rgba(23,23,15,0.06)",
                    color: candidate.marketing_consent_given ? "#16a34a" : "rgba(23,23,15,0.5)",
                    cursor: saving ? "default" : "pointer",
                  }}
                >
                  {candidate.marketing_consent_given ? "Given" : "Not given"}
                </button>
              </div>
            </div>

            <div style={{ borderTop: "1px solid rgba(23,23,15,0.06)", paddingTop: 12 }}>
              {candidate.deletion_requested_at ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 12px", background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: 10 }}>
                    <ShieldAlert style={{ width: 14, height: 14, color: "#b45309", flexShrink: 0, marginTop: 1 }} />
                    <p style={{ fontSize: 12, color: "#92400e", margin: 0 }}>
                      Deletion requested {formatDistanceToNow(new Date(candidate.deletion_requested_at), { addSuffix: true })}. No data has been removed yet — erase the record to permanently delete this candidate's personal data, or cancel the request if it's no longer needed.
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      onClick={cancelDeletionRequest}
                      disabled={requestingDeletion}
                      style={{ padding: "8px 14px", background: "rgba(23,23,15,0.05)", border: "none", borderRadius: 9, color: "rgba(23,23,15,0.6)", fontSize: 12, fontWeight: 700, cursor: requestingDeletion ? "default" : "pointer" }}
                    >
                      Cancel request
                    </button>
                    <button
                      onClick={() => setShowErasureConfirm(true)}
                      style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.22)", borderRadius: 9, color: "#dc2626", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                    >
                      <Trash2 style={{ width: 12, height: 12 }} />Erase candidate data
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ fontSize: 11.5, color: "rgba(23,23,15,0.45)", maxWidth: 420 }}>
                    If this candidate asks to be forgotten, request deletion first — it flags the record without removing anything, so you can double-check before it's irreversible.
                  </div>
                  <button
                    onClick={requestDeletion}
                    disabled={requestingDeletion}
                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: "rgba(23,23,15,0.05)", border: "1px solid rgba(23,23,15,0.1)", borderRadius: 9, color: "rgba(23,23,15,0.6)", fontSize: 12, fontWeight: 700, cursor: requestingDeletion ? "default" : "pointer", flexShrink: 0 }}
                  >
                    {requestingDeletion ? <Loader2 style={{ width: 12, height: 12, animation: "spin 1s linear infinite" }} /> : <ShieldAlert style={{ width: 12, height: 12 }} />}
                    Request deletion
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Erasure confirmation — a destructive, irreversible action gets an
          explicit typed confirmation rather than a plain confirm button,
          since it permanently removes the candidate's PII. */}
      {showErasureConfirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(23,23,15,0.45)", backdropFilter: "blur(6px)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={() => { setShowErasureConfirm(false); setErasureConfirmText(""); }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#FFFFFF", borderRadius: 16, padding: 22, width: "100%", maxWidth: 420, boxSizing: "border-box" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <Trash2 style={{ width: 16, height: 16, color: "#dc2626" }} />
              <h3 style={{ fontSize: 15, fontWeight: 800, color: "#17170F", margin: 0 }}>Erase candidate data</h3>
            </div>
            <p style={{ fontSize: 12.5, color: "rgba(23,23,15,0.55)", lineHeight: 1.6, marginBottom: 14 }}>
              This permanently removes {candidate.full_name}'s name, contact details, resume, notes, and skills. This can't be undone. Pipeline and interview history will remain, but attributed to an anonymized record.
            </p>
            <label style={{ fontSize: 10.5, fontWeight: 700, color: "rgba(23,23,15,0.4)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 6 }}>
              Type ERASE to confirm
            </label>
            <input
              value={erasureConfirmText}
              onChange={e => setErasureConfirmText(e.target.value)}
              placeholder="ERASE"
              style={{ width: "100%", padding: "10px 12px", background: "rgba(23,23,15,0.03)", border: "1px solid rgba(23,23,15,0.12)", borderRadius: 10, fontSize: 13, color: "#17170F", outline: "none", boxSizing: "border-box", marginBottom: 16 }}
            />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                onClick={() => { setShowErasureConfirm(false); setErasureConfirmText(""); }}
                disabled={erasing}
                style={{ padding: "9px 16px", background: "rgba(23,23,15,0.05)", border: "none", borderRadius: 9, color: "rgba(23,23,15,0.6)", fontSize: 12.5, fontWeight: 700, cursor: erasing ? "default" : "pointer" }}
              >
                Cancel
              </button>
              <button
                onClick={executeErasure}
                disabled={erasing || erasureConfirmText !== "ERASE"}
                style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", borderRadius: 9, border: "none", fontSize: 12.5, fontWeight: 700,
                  background: erasureConfirmText === "ERASE" ? "#dc2626" : "rgba(220,38,38,0.15)",
                  color: erasureConfirmText === "ERASE" ? "#FFFFFF" : "rgba(220,38,38,0.5)",
                  cursor: erasing || erasureConfirmText !== "ERASE" ? "default" : "pointer",
                }}
              >
                {erasing ? <Loader2 style={{ width: 12, height: 12, animation: "spin 1s linear infinite" }} /> : <Trash2 style={{ width: 12, height: 12 }} />}
                Erase permanently
              </button>
            </div>
          </div>
        </div>
      )}

      {showScheduleModal && selectedCjId && (
        <ScheduleInterviewModal
          onClose={() => {
            setShowScheduleModal(false);
            // Refresh once the modal is actually done (closed), instead of
            // mid-flow inside scheduleInterview — see the comment there.
            load();
            loadPipelineDetail();
          }}
          onSubmit={scheduleInterview}
          candidateJobId={selectedCjId}
          candidateName={candidate?.full_name ?? "Candidate"}
          candidateEmail={candidate?.email ?? null}
          jobTitle={selectedCj?.job?.title ?? "the role"}
          companyName={selectedCj?.job?.client?.name ?? team?.name ?? "our team"}
          recruiterName={(user?.user_metadata?.full_name as string | undefined) ?? user?.email ?? "Your recruiter"}
        />
      )}
    </div>
  );
}

// ─── Schedule interview modal ────────────────────────────────────────────────
// Invite to Interview flow: date/time/timezone/instructions -> create a
// native Fixsense Meeting -> get its unique URL -> AI drafts an editable
// invitation (send-interview-invitation, mode: "draft") -> recruiter
// reviews/edits subject+body -> "Send Invitation" sends it server-side via
// send-interview-invitation (mode: "send", backed by Resend), passing the
// reviewed text as an override so the recruiter's edits are what actually
// goes out. That call also records candidate_notified_at itself. The
// interview, meeting, and Fixsense-meeting linkage (Candidate -> Job ->
// Client -> Interview -> Recruiter) are all already persisted by the time
// this step is reached — sending the invitation is a follow-up action on
// top of an already-saved interview, never a prerequisite for it.
function ScheduleInterviewModal({
  onClose, onSubmit,
  candidateJobId, candidateName, candidateEmail, jobTitle, companyName, recruiterName,
}: {
  onClose: () => void;
  onSubmit: (
    stage: string, scheduledAt: string, timezone: string, interviewers: string[],
    instructions: string, messageToCandidate: string,
  ) => Promise<{ interviewId: string; meetingLink: string } | null>;
  candidateJobId: string;
  candidateName: string;
  candidateEmail: string | null;
  jobTitle: string;
  companyName: string;
  recruiterName: string;
}) {
  const [stage, setStage] = useState("interview");
  const [scheduledAt, setScheduledAt] = useState("");
  const [timezone] = useState(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; }
  });
  const [interviewerInput, setInterviewerInput] = useState("");
  const [instructions, setInstructions] = useState("");
  const [messageToCandidate, setMessageToCandidate] = useState("");
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);

  // Step 2 state — populated once the Fixsense Meeting + interview are created.
  const [result, setResult] = useState<{ interviewId: string; meetingLink: string } | null>(null);
  const [invitationBody, setInvitationBody] = useState("");
  const [invitationSubject, setInvitationSubject] = useState("");

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "9px 11px", background: "rgba(23,23,15,0.03)",
    border: "1px solid rgba(23,23,15,0.1)", borderRadius: 8, color: "#17170F",
    fontSize: 13, fontFamily: "'Inter', sans-serif", outline: "none", boxSizing: "border-box",
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 10.5, fontWeight: 700, color: "rgba(23,23,15,0.4)", marginBottom: 5, display: "block",
    textTransform: "uppercase", letterSpacing: "0.05em",
  };

  const stageLabel = (s: string) => (
    s === "screening_call" ? "screening call" :
    s === "final_interview" ? "final interview" :
    "interview"
  );

  const buildInvitation = (meetingLink: string, scheduledIso: string) => {
    const when = scheduledIso
      ? new Date(scheduledIso).toLocaleString(undefined, {
          weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit",
        })
      : "a time to be confirmed";
    const label = stageLabel(stage);
    const subject = `${label.charAt(0).toUpperCase() + label.slice(1)} invitation — ${jobTitle} at ${companyName}`;
    const body = [
      `Hi ${candidateName},`,
      ``,
      `We'd like to invite you to a ${label} for the ${jobTitle} role at ${companyName}.`,
      ``,
      `Date/time: ${when} (${timezone})`,
      `Meeting link (Fixsense Meeting): ${meetingLink}`,
      instructions ? `\nWhat to prepare: ${instructions}` : "",
      messageToCandidate ? `\n${messageToCandidate}` : "",
      ``,
      `What to expect: join the link a few minutes before the scheduled time. You'll connect directly through Fixsense — no separate app or download is required. The conversation will be recorded for internal review, and we'll follow up with next steps afterward.`,
      ``,
      `Looking forward to speaking with you.`,
      ``,
      recruiterName,
      companyName,
    ].filter(l => l !== "").join("\n");
    return { subject, body };
  };

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [generatingInvitation, setGeneratingInvitation] = useState(false);

  // AI drafts the invitation first; the hand-written template above is only
  // a fallback if the AI call fails for any reason (no key, rate limit, bad
  // JSON) — scheduling the interview must never be blocked on this, and the
  // recruiter can always edit either result before sending.
  // AI drafts the invitation first (via send-interview-invitation's "draft"
  // mode); the hand-written template above is only a local fallback if that
  // call can't be reached at all (network error) — the edge function itself
  // also falls back to its own copy of this template on AI failure, so this
  // is a last resort. Scheduling the interview must never be blocked on
  // this, and the recruiter can always edit either result before sending.
  const generateAiInvitation = async (meetingLink: string, scheduledIso: string) => {
    try {
      const { data, error } = await (supabase as any).functions.invoke("send-interview-invitation", {
        body: {
          mode: "draft",
          candidate_job_id: candidateJobId,
          candidate_name: candidateName,
          job_title: jobTitle,
          company_name: companyName,
          recruiter_name: recruiterName,
          interview_stage: stage,
          scheduled_at_display: scheduledIso
            ? new Date(scheduledIso).toLocaleString(undefined, {
                weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit",
              })
            : null,
          timezone,
          meeting_link: meetingLink,
          instructions: instructions.trim() || null,
          message_to_candidate: messageToCandidate.trim() || null,
        },
      });
      if (error || !data || !data.subject || !data.body) {
        return buildInvitation(meetingLink, scheduledIso);
      }
      // data.fallback true just means the server used its own template
      // instead of AI — still perfectly good text to show, no need to
      // discard it in favor of a second, client-side template.
      return { subject: data.subject as string, body: data.body as string };
    } catch {
      return buildInvitation(meetingLink, scheduledIso);
    }
  };

  const submit = async () => {
    setSaving(true);
    setSubmitError(null);
    try {
      const interviewers = interviewerInput.split(",").map(s => s.trim()).filter(Boolean);
      const iso = scheduledAt ? new Date(scheduledAt).toISOString() : "";
      const created = await onSubmit(stage, iso, timezone, interviewers, instructions.trim(), messageToCandidate.trim());
      if (created) {
        setResult(created);
        setGeneratingInvitation(true);
        const { subject, body } = await generateAiInvitation(created.meetingLink, iso);
        setInvitationSubject(subject);
        setInvitationBody(body);
        setGeneratingInvitation(false);
      } else {
        // onSubmit already toasted the specific error — this inline message
        // is a backstop for anyone who missed the toast, so the modal never
        // just silently sits there with no explanation.
        setSubmitError("Couldn't schedule the interview. Check the toast notification for details, then try again.");
      }
    } finally {
      setSaving(false);
    }
  };

  const sendInvitation = async () => {
    if (!result || !candidateEmail) return;
    setSending(true);
    try {
      // Sends server-side via send-interview-invitation ("send" mode, backed
      // by Resend) using the recruiter's reviewed/edited subject and body as
      // overrides — never the function's own built-in template once a
      // recruiter has looked at and approved this text. The function itself
      // records candidate_notified_at on success/failure, so there's no
      // separate client-side RPC call needed here anymore.
      const { data, error } = await (supabase as any).functions.invoke("send-interview-invitation", {
        body: {
          interview_id: result.interviewId,
          subject: invitationSubject,
          body: invitationBody,
        },
      });

      if (error || !data?.success) {
        const message: string = data?.error ?? error?.message ?? "Failed to send the invitation.";
        // RESEND_API_KEY not configured yet is a distinct, actionable state
        // — surface it clearly rather than a generic failure toast, since
        // the fix is a one-time project setting, not a retry.
        if (message.toLowerCase().includes("not configured")) {
          toast.error("Email sending isn't set up yet for this project (missing Resend API key). Copy the invitation below and send it manually for now.", { duration: 10000 });
        } else {
          toast.error(message);
        }
        return;
      }

      toast.success("Invitation sent to the candidate.");
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to send the invitation. The email draft below is unchanged — you can still copy and send it manually.");
    } finally {
      setSending(false);
    }
  };

  const copyInvitationText = async () => {
    try {
      await navigator.clipboard.writeText(`To: ${candidateEmail ?? ""}\nSubject: ${invitationSubject}\n\n${invitationBody}`);
      toast.success("Copied — paste into any email client");
    } catch {
      toast.error("Couldn't copy — select and copy the text manually");
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#FAFAF8", borderRadius: "18px 18px 0 0", padding: 20, width: "100%", maxWidth: 480, maxHeight: "88vh", overflowY: "auto", fontFamily: "'Inter', sans-serif", boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: "#17170F", margin: 0 }}>Invite to Interview</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(23,23,15,0.4)" }}><X style={{ width: 18, height: 18 }} /></button>
        </div>

        {!result ? (
          <>
            <label style={labelStyle}>Interview type</label>
            <select value={stage} onChange={e => setStage(e.target.value)} style={{ ...inputStyle, marginBottom: 10 }}>
              <option value="screening_call">Screening call</option>
              <option value="interview">Interview</option>
              <option value="final_interview">Final interview</option>
            </select>

            <label style={labelStyle}>Date/time</label>
            <input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} style={{ ...inputStyle, marginBottom: 10 }} />

            <label style={labelStyle}>Timezone</label>
            <div style={{ ...inputStyle, marginBottom: 10, color: "rgba(23,23,15,0.6)" }}>{timezone} (detected from your browser)</div>

            <label style={labelStyle}>Interviewers (comma-separated, optional)</label>
            <input value={interviewerInput} onChange={e => setInterviewerInput(e.target.value)} style={{ ...inputStyle, marginBottom: 10 }} placeholder="Jane Doe, John Smith" />

            <label style={labelStyle}>Meeting</label>
            <div style={{ ...inputStyle, marginBottom: 10, display: "flex", alignItems: "center", gap: 8, color: "rgba(23,23,15,0.6)" }}>
              <Video style={{ width: 13, height: 13, flexShrink: 0 }} />
              A native Fixsense Meeting will be created automatically with a unique link.
            </div>

            <label style={labelStyle}>Interview instructions</label>
            <textarea value={instructions} onChange={e => setInstructions(e.target.value)} style={{ ...inputStyle, marginBottom: 10, minHeight: 60, resize: "vertical" }} placeholder="What to prepare, format, duration…" />

            <label style={labelStyle}>Message to candidate (optional)</label>
            <textarea value={messageToCandidate} onChange={e => setMessageToCandidate(e.target.value)} style={{ ...inputStyle, marginBottom: 16, minHeight: 60, resize: "vertical" }} placeholder="A personal note included in the invitation email" />

            {submitError && (
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "9px 11px", background: "rgba(178,58,58,0.08)", borderRadius: 8, marginBottom: 12, fontSize: 12, color: "#B23A3A", lineHeight: 1.5 }}>
                {submitError}
              </div>
            )}

            <button onClick={submit} disabled={saving} style={{ width: "100%", padding: "12px 16px", background: "#22315C", border: "none", borderRadius: 10, color: "#FAFAF8", fontSize: 13.5, fontWeight: 700, cursor: saving ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              {saving ? (<><Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> Creating Fixsense Meeting…</>) : "Create Meeting & Continue"}
            </button>
          </>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 11px", background: "rgba(47,107,79,0.08)", borderRadius: 8, marginBottom: 12 }}>
              <Video style={{ width: 13, height: 13, color: "#2F6B4F", flexShrink: 0 }} />
              <span style={{ fontSize: 11.5, color: "#2F6B4F", fontWeight: 600, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{result.meetingLink}</span>
              <button
                onClick={async () => { try { await navigator.clipboard.writeText(result.meetingLink); toast.success("Copied"); } catch { /* noop */ } }}
                style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, background: "transparent", border: "1px solid rgba(47,107,79,0.25)", borderRadius: 6, cursor: "pointer", color: "#2F6B4F", flexShrink: 0 }}
              >
                <Copy style={{ width: 11, height: 11 }} />
              </button>
            </div>

            <label style={labelStyle}>Candidate email</label>
            <div style={{ ...inputStyle, marginBottom: 10, color: candidateEmail ? "#17170F" : "#B23A3A" }}>
              {candidateEmail ?? "No email on file — add one to the candidate record before sending"}
            </div>

            {!candidateEmail && (
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "9px 11px", background: "rgba(178,58,58,0.08)", borderRadius: 8, marginBottom: 10, fontSize: 12, color: "#B23A3A", lineHeight: 1.5 }}>
                The meeting was created and the interview is scheduled — but there's no email on file for this candidate, so the invitation can't be sent yet. Add an email to their record, or copy the text below to send it another way.
              </div>
            )}

            {generatingInvitation ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "20px 0", justifyContent: "center", color: "rgba(23,23,15,0.5)", fontSize: 12.5 }}>
                <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} />
                Drafting the invitation with AI…
              </div>
            ) : (
              <>
                <label style={labelStyle}>Subject (editable)</label>
                <input value={invitationSubject} onChange={e => setInvitationSubject(e.target.value)} style={{ ...inputStyle, marginBottom: 10 }} />

                <label style={labelStyle}>Invitation (editable)</label>
                <textarea value={invitationBody} onChange={e => setInvitationBody(e.target.value)} style={{ ...inputStyle, marginBottom: 16, minHeight: 220, resize: "vertical", fontFamily: "'Inter', sans-serif", lineHeight: 1.5 }} />
              </>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={sendInvitation}
                disabled={sending || !candidateEmail || generatingInvitation}
                style={{ flex: 1, padding: "12px 16px", background: "#22315C", border: "none", borderRadius: 10, color: "#FAFAF8", fontSize: 13.5, fontWeight: 700, cursor: (sending || !candidateEmail || generatingInvitation) ? "default" : "pointer", opacity: (sending || !candidateEmail || generatingInvitation) ? 0.6 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
              >
                {sending ? (<><Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> Sending…</>) : (<><Send style={{ width: 14, height: 14 }} /> Send Invitation</>)}
              </button>
              <button
                onClick={copyInvitationText}
                disabled={generatingInvitation}
                title="Copy invitation text"
                style={{ padding: "12px 14px", background: "transparent", border: "1px solid rgba(23,23,15,0.15)", borderRadius: 10, color: "#17170F", fontSize: 13, fontWeight: 600, cursor: generatingInvitation ? "default" : "pointer", opacity: generatingInvitation ? 0.5 : 1, display: "flex", alignItems: "center", gap: 6 }}
              >
                <Copy style={{ width: 14, height: 14 }} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function CandidateDetailPage() {
  return (
    <DashboardLayout>
      <ErrorBoundary>
        <CandidateDetailPageInner />
      </ErrorBoundary>
    </DashboardLayout>
  );
}