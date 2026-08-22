/**
 * SubmissionsPage.tsx — Submission workspace
 *
 * Select a candidate already in a job's pipeline → create a draft
 * submission (create_submission, frozen snapshot of verified data only) →
 * send it (send_submission, auto-advances pipeline_stage to 'submitted') →
 * track status → record client response (record_client_feedback) → move
 * the candidate to the next stage (advance_candidate_pipeline_stage).
 *
 * All writes go through the Phase 5 RPCs — nothing here bypasses RLS or
 * writes ai_extractions/candidate/job fields directly.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { useTeam } from "@/hooks/useTeam";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import {
  Loader2, Send, Plus, ChevronRight, MessageSquare, CheckCircle2, X, Briefcase, User,
} from "lucide-react";
import { ErrorBoundary } from "@/components/ErrorBoundary";

interface CandidateJobOpt {
  id: string;
  pipeline_stage: string;
  candidate: { id: string; full_name: string } | null;
  job: { id: string; title: string } | null;
}

interface Submission {
  id: string;
  candidate_job_id: string;
  status: string;
  relevance_explanation: string | null;
  submitted_at: string | null;
  created_at: string;
  candidate_job?: CandidateJobOpt | null;
}

const STATUS_CFG: Record<string, { label: string; color: string }> = {
  draft: { label: "Draft", color: "#94a3b8" },
  submitted: { label: "Submitted", color: "#60a5fa" },
  client_reviewing: { label: "Client Reviewing", color: "#a78bfa" },
  client_responded: { label: "Client Responded", color: "#22c55e" },
};

const NEXT_STAGE_OPTIONS = [
  { key: "client_review", label: "Client Review" },
  { key: "interview", label: "Interview" },
  { key: "final_interview", label: "Final Interview" },
  { key: "offer", label: "Offer" },
  { key: "rejected", label: "Reject" },
];

function StatusPill({ status }: { status: string }) {
  const cfg = STATUS_CFG[status] ?? { label: status, color: "#94a3b8" };
  return (
    <span style={{ fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 7, background: cfg.color + "18", color: cfg.color }}>
      {cfg.label}
    </span>
  );
}

// ─── Create submission drawer ────────────────────────────────────────────────

function CreateSubmissionDrawer({ options, onClose, onCreated }: {
  options: CandidateJobOpt[]; onClose: () => void; onCreated: () => void;
}) {
  const [candidateJobId, setCandidateJobId] = useState("");
  const [explanation, setExplanation] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!candidateJobId) { toast.error("Select a candidate + job"); return; }
    setSaving(true);
    try {
      const { error } = await (supabase as any).rpc("create_submission", {
        p_candidate_job_id: candidateJobId,
        p_relevance_explanation: explanation || null,
      });
      if (error) throw error;
      toast.success("Draft submission created");
      onCreated();
      onClose();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to create submission");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#FAFAF8", borderRadius: "18px 18px 0 0", padding: 20, width: "100%", maxWidth: 480, fontFamily: "'Inter', sans-serif", boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: "#17170F", margin: 0 }}>New Submission</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(23,23,15,0.4)" }}><X style={{ width: 18, height: 18 }} /></button>
        </div>

        <label style={labelStyle}>Candidate → Job</label>
        <select value={candidateJobId} onChange={e => setCandidateJobId(e.target.value)} style={{ ...inputStyle, marginBottom: 10 }}>
          <option value="">Select…</option>
          {options.map(o => (
            <option key={o.id} value={o.id}>
              {o.candidate?.full_name} → {o.job?.title} ({o.pipeline_stage})
            </option>
          ))}
        </select>

        <label style={labelStyle}>Why this candidate fits (optional)</label>
        <textarea
          value={explanation}
          onChange={e => setExplanation(e.target.value)}
          style={{ ...inputStyle, minHeight: 90, resize: "vertical", marginBottom: 16 }}
          placeholder="Meets salary band, strong systems design background, available in 4 weeks…"
        />

        <button onClick={submit} disabled={saving} style={{ width: "100%", padding: "12px 16px", background: "#22315C", border: "none", borderRadius: 10, color: "#FAFAF8", fontSize: 13.5, fontWeight: 700, cursor: saving ? "default" : "pointer" }}>
          {saving ? "Creating…" : "Create Draft Submission"}
        </button>
      </div>
    </div>
  );
}

// ─── Feedback modal ──────────────────────────────────────────────────────────

function ClientFeedbackModal({ submission, onClose, onSubmit }: {
  submission: Submission; onClose: () => void;
  onSubmit: (text: string, sentiment: string, nextStage: string | null) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [sentiment, setSentiment] = useState("positive");
  const [nextStage, setNextStage] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!text.trim()) { toast.error("Feedback text is required"); return; }
    setSaving(true);
    try { await onSubmit(text.trim(), sentiment, nextStage || null); } finally { setSaving(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#FAFAF8", borderRadius: "18px 18px 0 0", padding: 20, width: "100%", maxWidth: 480, fontFamily: "'Inter', sans-serif", boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: "#17170F", margin: 0 }}>Record Client Feedback</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(23,23,15,0.4)" }}><X style={{ width: 18, height: 18 }} /></button>
        </div>

        <label style={labelStyle}>Sentiment</label>
        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          {["positive", "mixed", "negative"].map(s => (
            <button
              key={s}
              onClick={() => setSentiment(s)}
              style={{
                flex: 1, padding: "8px 0", borderRadius: 8, border: sentiment === s ? "1.5px solid #22315C" : "1px solid rgba(23,23,15,0.12)",
                background: sentiment === s ? "rgba(34,49,92,0.08)" : "#fff", color: "#17170F", fontSize: 12, fontWeight: 700,
                textTransform: "capitalize", cursor: "pointer",
              }}
            >
              {s}
            </button>
          ))}
        </div>

        <label style={labelStyle}>Feedback</label>
        <textarea value={text} onChange={e => setText(e.target.value)} style={{ ...inputStyle, minHeight: 90, resize: "vertical", marginBottom: 10 }} placeholder="What did the client say?" />

        <label style={labelStyle}>Move candidate to (optional)</label>
        <select value={nextStage} onChange={e => setNextStage(e.target.value)} style={{ ...inputStyle, marginBottom: 16 }}>
          <option value="">Keep current stage</option>
          {NEXT_STAGE_OPTIONS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>

        <button onClick={submit} disabled={saving} style={{ width: "100%", padding: "12px 16px", background: "#22315C", border: "none", borderRadius: 10, color: "#FAFAF8", fontSize: 13.5, fontWeight: 700, cursor: saving ? "default" : "pointer" }}>
          {saving ? "Saving…" : "Save Feedback"}
        </button>
      </div>
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

function SubmissionsPageInner() {
  const { teamId } = useTeam();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [pipelineOptions, setPipelineOptions] = useState<CandidateJobOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [feedbackFor, setFeedbackFor] = useState<Submission | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!teamId) return;
    setLoading(true);
    try {
      const [subRes, cjRes] = await Promise.all([
        (supabase as any)
          .from("submissions")
          .select("id, candidate_job_id, status, relevance_explanation, submitted_at, created_at, candidate_job:candidate_jobs(id, pipeline_stage, candidate:candidates(id, full_name), job:jobs(id, title))")
          .eq("team_id", teamId)
          .order("created_at", { ascending: false }),
        (supabase as any)
          .from("candidate_jobs")
          .select("id, pipeline_stage, candidate:candidates(id, full_name), job:jobs(id, title)")
          .eq("team_id", teamId)
          .in("pipeline_stage", ["sourced", "screening", "shortlisted"])
          .order("updated_at", { ascending: false }),
      ]);
      if (subRes.error) throw subRes.error;
      setSubmissions(subRes.data ?? []);
      setPipelineOptions(cjRes.data ?? []);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to load submissions");
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => { load(); }, [load]);

  const sendSubmission = async (id: string) => {
    setBusyId(id);
    try {
      const { error } = await (supabase as any).rpc("send_submission", { p_submission_id: id });
      if (error) throw error;
      toast.success("Submission sent to client");
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to send submission");
    } finally {
      setBusyId(null);
    }
  };

  const submitFeedback = async (text: string, sentiment: string, nextStage: string | null) => {
    if (!feedbackFor) return;
    try {
      const { error: fbErr } = await (supabase as any).rpc("record_client_feedback", {
        p_candidate_job_id: feedbackFor.candidate_job_id,
        p_feedback_text: text,
        p_sentiment: sentiment,
        p_submission_id: feedbackFor.id,
      });
      if (fbErr) throw fbErr;

      if (nextStage) {
        const args: Record<string, any> = { p_candidate_job_id: feedbackFor.candidate_job_id, p_new_stage: nextStage };
        if (nextStage === "rejected") { args.p_rejection_reason = "client_rejected"; args.p_rejection_notes = text; }
        const { error: stageErr } = await (supabase as any).rpc("advance_candidate_pipeline_stage", args);
        if (stageErr) throw stageErr;
      }

      toast.success("Client feedback recorded");
      setFeedbackFor(null);
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to record feedback");
    }
  };

  const grouped = useMemo(() => {
    const active = submissions.filter(s => s.status !== "client_responded");
    const responded = submissions.filter(s => s.status === "client_responded");
    return { active, responded };
  }, [submissions]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 760, margin: "0 auto", fontFamily: "'Inter', sans-serif" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 19, fontWeight: 800, color: "#17170F", margin: 0 }}>Submissions</h1>
          <p style={{ fontSize: 12, color: "rgba(23,23,15,0.45)", margin: "2px 0 0" }}>Submit candidates to clients and track their response.</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 14px", background: "#22315C", border: "none", borderRadius: 10, color: "#FAFAF8", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}
        >
          <Plus style={{ width: 14, height: 14 }} />New Submission
        </button>
      </div>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
          <Loader2 style={{ width: 22, height: 22, color: "rgba(23,23,15,0.3)", animation: "spin 1s linear infinite" }} />
        </div>
      ) : submissions.length === 0 ? (
        <div style={{ textAlign: "center", padding: "48px 20px", background: "rgba(23,23,15,0.02)", borderRadius: 14 }}>
          <p style={{ fontSize: 13, color: "rgba(23,23,15,0.45)" }}>No submissions yet.</p>
        </div>
      ) : (
        <>
          {grouped.active.length > 0 && (
            <div>
              <div style={sectionHeaderStyle}>Active ({grouped.active.length})</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {grouped.active.map(s => (
                  <SubmissionRow key={s.id} s={s} busy={busyId === s.id} onSend={() => sendSubmission(s.id)} onFeedback={() => setFeedbackFor(s)} />
                ))}
              </div>
            </div>
          )}
          {grouped.responded.length > 0 && (
            <div>
              <div style={sectionHeaderStyle}>Client Responded ({grouped.responded.length})</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {grouped.responded.map(s => (
                  <SubmissionRow key={s.id} s={s} busy={busyId === s.id} onSend={() => sendSubmission(s.id)} onFeedback={() => setFeedbackFor(s)} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {showCreate && (
        <CreateSubmissionDrawer options={pipelineOptions} onClose={() => setShowCreate(false)} onCreated={load} />
      )}
      {feedbackFor && (
        <ClientFeedbackModal submission={feedbackFor} onClose={() => setFeedbackFor(null)} onSubmit={submitFeedback} />
      )}
    </div>
  );
}

function SubmissionRow({ s, busy, onSend, onFeedback }: {
  s: Submission; busy: boolean; onSend: () => void; onFeedback: () => void;
}) {
  const cj = s.candidate_job;
  return (
    <div style={{ background: "#fff", border: "1px solid rgba(23,23,15,0.08)", borderRadius: 12, padding: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <User style={{ width: 13, height: 13, color: "#22315C" }} />
          <span style={{ fontSize: 13.5, fontWeight: 700, color: "#17170F" }}>{cj?.candidate?.full_name ?? "Unknown"}</span>
          <ChevronRight style={{ width: 12, height: 12, color: "rgba(23,23,15,0.3)" }} />
          <Briefcase style={{ width: 12, height: 12, color: "rgba(23,23,15,0.4)" }} />
          <span style={{ fontSize: 12.5, color: "rgba(23,23,15,0.6)" }}>{cj?.job?.title ?? "Unknown"}</span>
        </div>
        <StatusPill status={s.status} />
      </div>

      {s.relevance_explanation && (
        <p style={{ fontSize: 12, color: "rgba(23,23,15,0.55)", margin: "0 0 8px" }}>{s.relevance_explanation}</p>
      )}

      <div style={{ fontSize: 10.5, color: "rgba(23,23,15,0.35)", marginBottom: 10 }}>
        {s.submitted_at ? `Submitted ${formatDistanceToNow(new Date(s.submitted_at), { addSuffix: true })}` : `Created ${formatDistanceToNow(new Date(s.created_at), { addSuffix: true })}`}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        {s.status === "draft" && (
          <button onClick={onSend} disabled={busy} style={actionBtnStyle("#22315C", "#FAFAF8")}>
            {busy ? <Loader2 style={{ width: 12, height: 12, animation: "spin 1s linear infinite" }} /> : <Send style={{ width: 12, height: 12 }} />}
            Send to Client
          </button>
        )}
        {s.status !== "draft" && (
          <button onClick={onFeedback} style={actionBtnStyle("rgba(34,49,92,0.08)", "#22315C")}>
            <MessageSquare style={{ width: 12, height: 12 }} />
            {s.status === "client_responded" ? "Add Feedback" : "Record Client Response"}
          </button>
        )}
      </div>
    </div>
  );
}

function actionBtnStyle(bg: string, color: string): React.CSSProperties {
  return {
    display: "flex", alignItems: "center", gap: 6, padding: "8px 13px", background: bg, border: "none",
    borderRadius: 8, color, fontSize: 11.5, fontWeight: 700, cursor: "pointer",
  };
}

const sectionHeaderStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: "rgba(23,23,15,0.35)", textTransform: "uppercase",
  letterSpacing: "0.06em", marginBottom: 8,
};
const inputStyle: React.CSSProperties = {
  width: "100%", padding: "9px 11px", background: "rgba(23,23,15,0.03)",
  border: "1px solid rgba(23,23,15,0.1)", borderRadius: 8, color: "#17170F",
  fontSize: 13, fontFamily: "'Inter', sans-serif", outline: "none", boxSizing: "border-box",
};
const labelStyle: React.CSSProperties = {
  fontSize: 10.5, fontWeight: 700, color: "rgba(23,23,15,0.4)", marginBottom: 5, display: "block",
  textTransform: "uppercase", letterSpacing: "0.05em",
};

export default function SubmissionsPage() {
  return (
    <DashboardLayout>
      <ErrorBoundary>
        <SubmissionsPageInner />
      </ErrorBoundary>
    </DashboardLayout>
  );
}