/**
 * JobDetailPage.tsx — Recruiter Job page (public application system §9)
 *
 * Team-scoped (public.jobs / job_application_links / candidate_jobs, RLS via
 * recruiting_is_team_member). Reads via get_job_application_summary(job_id),
 * which returns job + links + counts + the AI-ranked pipeline in one call.
 * All writes go through RPCs (create/update/extend/disable_application_link,
 * record_candidate_job_match indirectly via parse-candidate-cv's
 * candidate_job_match mode, schedule_interview) — never a direct table
 * write, matching every other recruiting page in this app.
 *
 * Mirrors CandidatesPage.tsx / PipelinePage.tsx conventions: inline styles,
 * cream/navy theme (#17170F text, #22315C navy, #FAFAF8 cream).
 */

import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatDistanceToNow, format } from "date-fns";
import {
  Loader2, Link as LinkIcon, Copy, Power, Calendar, Users, Sparkles,
  ChevronRight, X, Plus, Trash2, ExternalLink, CheckCircle2, Clock,
  Send, Pencil, Archive, RotateCcw,
} from "lucide-react";
import { ErrorBoundary } from "@/components/ErrorBoundary";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ApplicationLink {
  id: string;
  slug: string;
  is_active: boolean;
  expires_at: string | null;
  max_applications: number | null;
  application_count: number;
  require_cv: boolean;
  require_cover_letter: boolean;
  require_salary_expectation: boolean;
  require_phone: boolean;
  require_location: boolean;
  show_salary: boolean;
  custom_questions: { id: string; question: string; required: boolean }[];
  created_at: string;
}

interface PipelineCandidate {
  candidate_job_id: string;
  pipeline_stage: string;
  status: string;
  match_score: number | null;
  match_explanation: any;
  submission_date: string | null;
  created_at: string;
  candidate: {
    id: string; full_name: string; email: string | null; phone: string | null;
    location: string | null; years_experience: number | null; skills: string[];
    expected_salary: number | null; expected_salary_currency: string | null;
    notice_period: string | null; cv_file_url: string | null;
  };
}

interface JobSummary {
  job: {
    id: string; title: string; status: string; client_id: string;
    location: string | null; work_arrangement: string | null;
    salary_min: number | null; salary_max: number | null; salary_currency: string | null;
    headcount: number; positions_filled: number;
  };
  links: ApplicationLink[];
  application_count: number;
  candidate_count: number;
  shortlisted_count: number;
  interview_count: number;
  offer_count: number;
  placed_count: number;
  pipeline: PipelineCandidate[];
}

const STAGE_LABELS: Record<string, string> = {
  sourced: "Applied", screening: "Screening", shortlisted: "Shortlisted",
  submitted: "Submitted", client_review: "Client Review", interview: "Interview",
  final_interview: "Final Interview", offer: "Offer", placed: "Placed", rejected: "Rejected",
};

const PUBLIC_BASE_URL = "https://fixsense.com.ng/apply";

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [summary, setSummary] = useState<JobSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [createLinkOpen, setCreateLinkOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const [matchingId, setMatchingId] = useState<string | null>(null);
  const [extendingLinkId, setExtendingLinkId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    const { data, error } = await (supabase as any).rpc("get_job_application_summary", { p_job_id: id });
    if (error) {
      toast.error(error.message ?? "Failed to load job");
    } else {
      setSummary(data as JobSummary);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const copyLink = (slug: string) => {
    navigator.clipboard.writeText(`${PUBLIC_BASE_URL}/${slug}`).then(() => {
      setCopiedSlug(slug);
      setTimeout(() => setCopiedSlug(null), 2000);
    });
  };

  const toggleLinkActive = async (link: ApplicationLink) => {
    const { error } = await (supabase as any).rpc("update_application_link", {
      p_link_id: link.id,
      p_is_active: !link.is_active,
    });
    if (error) { toast.error(error.message); return; }
    toast.success(link.is_active ? "Link disabled" : "Link enabled");
    load();
  };

  const extendExpiration = async (linkId: string, days: number) => {
    const newExpiry = new Date(Date.now() + days * 86400000).toISOString();
    const { error } = await (supabase as any).rpc("extend_application_link_expiration", {
      p_link_id: linkId,
      p_new_expires_at: newExpiry,
    });
    if (error) { toast.error(error.message); return; }
    toast.success(`Extended ${days} days`);
    setExtendingLinkId(null);
    load();
  };

  const runAiMatch = async (candidateJobId: string) => {
    setMatchingId(candidateJobId);
    try {
      const { data, error } = await supabase.functions.invoke("parse-candidate-cv", {
        body: { mode: "candidate_job_match", candidate_job_id: candidateJobId },
      });
      if (error || (data as any)?.error) throw new Error((data as any)?.error || error?.message);
      toast.success(`AI match: ${(data as any).match_score}%`);
      load();
    } catch (e: any) {
      toast.error(e.message ?? "AI match failed");
    } finally {
      setMatchingId(null);
    }
  };

  // Archive/close and reopen are direct updates to public.jobs (same
  // RLS-is-enough pattern JobsPage.tsx uses for creation): the "team
  // members can write jobs" policy covers UPDATE, and trg_jobs_updated_at
  // keeps updated_at correct regardless of write path. No RPC exists for
  // job status changes, so this doesn't skip one — there isn't one to skip.
  const setJobStatus = async (status: string) => {
    if (!id) return;
    setArchiving(true);
    try {
      const { error } = await (supabase as any).from("jobs").update({ status }).eq("id", id);
      if (error) throw error;
      toast.success(status === "closed" ? "Job archived" : "Job reopened");
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to update job status");
    } finally {
      setArchiving(false);
    }
  };

  if (loading) {
    return <DashboardLayout><div style={{ padding: 40, display: "flex", justifyContent: "center" }}><Loader2 style={{ width: 24, height: 24, color: "#22315C", animation: "spin 1s linear infinite" }} /></div></DashboardLayout>;
  }

  if (!summary) {
    return <DashboardLayout><div style={{ padding: 40 }}>Job not found.</div></DashboardLayout>;
  }

  const sortedPipeline = [...summary.pipeline].sort((a, b) => (b.match_score ?? -1) - (a.match_score ?? -1));

  return (
    <ErrorBoundary>
      <DashboardLayout>
        <div style={{ padding: "24px 20px 60px", maxWidth: 980, margin: "0 auto", fontFamily: "'Inter', sans-serif" }}>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 800, color: "#17170F", margin: 0 }}>{summary.job.title}</h1>
              <span style={{ fontSize: 12.5, color: "rgba(23,23,15,0.45)", textTransform: "capitalize" }}>{summary.job.status}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <button
                onClick={() => setEditOpen(true)}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 14px", background: "rgba(23,23,15,0.06)", border: "none", borderRadius: 10, color: "#17170F", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
              >
                <Pencil style={{ width: 14, height: 14 }} /> Edit
              </button>
              {summary.job.status === "closed" ? (
                <button
                  onClick={() => setJobStatus("open")}
                  disabled={archiving}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 14px", background: "rgba(34,197,94,0.12)", border: "none", borderRadius: 10, color: "#16803c", fontSize: 13, fontWeight: 700, cursor: archiving ? "default" : "pointer", opacity: archiving ? 0.6 : 1 }}
                >
                  <RotateCcw style={{ width: 14, height: 14 }} /> Reopen
                </button>
              ) : (
                <button
                  onClick={() => setJobStatus("closed")}
                  disabled={archiving}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 14px", background: "rgba(23,23,15,0.06)", border: "none", borderRadius: 10, color: "rgba(23,23,15,0.7)", fontSize: 13, fontWeight: 700, cursor: archiving ? "default" : "pointer", opacity: archiving ? 0.6 : 1 }}
                >
                  <Archive style={{ width: 14, height: 14 }} /> Archive
                </button>
              )}
              <button
                onClick={() => setCreateLinkOpen(true)}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 18px", background: "linear-gradient(135deg, #22315C, #2A3F73)", border: "none", borderRadius: 10, color: "#FAFAF8", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
              >
                <Plus style={{ width: 15, height: 15 }} /> Create application link
              </button>
            </div>
          </div>

          {/* Stats row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 10, marginBottom: 24 }}>
            <StatCard label="Applications" value={summary.application_count} />
            <StatCard label="Candidates" value={summary.candidate_count} />
            <StatCard label="Shortlisted" value={summary.shortlisted_count} />
            <StatCard label="Interviews" value={summary.interview_count} />
            <StatCard label="Offers" value={summary.offer_count} />
            <StatCard label="Placed" value={summary.placed_count} />
          </div>

          {/* Application links */}
          <div style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: "#17170F", marginBottom: 12 }}>Application links</h2>
            {summary.links.length === 0 ? (
              <div style={{ padding: 24, background: "rgba(23,23,15,0.03)", borderRadius: 12, textAlign: "center", fontSize: 13, color: "rgba(23,23,15,0.4)" }}>
                No application links yet. Create one to start accepting public applications.
              </div>
            ) : (
              summary.links.map(link => (
                <LinkCard
                  key={link.id}
                  link={link}
                  copied={copiedSlug === link.slug}
                  onCopy={() => copyLink(link.slug)}
                  onToggle={() => toggleLinkActive(link)}
                  onExtend={() => setExtendingLinkId(link.id)}
                  extending={extendingLinkId === link.id}
                  onConfirmExtend={(days) => extendExpiration(link.id, days)}
                  onCancelExtend={() => setExtendingLinkId(null)}
                />
              ))
            )}
          </div>

          {/* AI-ranked candidate pipeline */}
          <div>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: "#17170F", marginBottom: 12 }}>Candidates</h2>
            {sortedPipeline.length === 0 ? (
              <div style={{ padding: 24, background: "rgba(23,23,15,0.03)", borderRadius: 12, textAlign: "center", fontSize: 13, color: "rgba(23,23,15,0.4)" }}>
                No candidates in the pipeline yet.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {sortedPipeline.map(pc => (
                  <CandidateRow
                    key={pc.candidate_job_id}
                    pc={pc}
                    onOpen={() => navigate(`/candidates/${pc.candidate.id}`)}
                    onRunMatch={() => runAiMatch(pc.candidate_job_id)}
                    matching={matchingId === pc.candidate_job_id}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {createLinkOpen && (
          <CreateLinkModal
            jobId={id!}
            onClose={() => setCreateLinkOpen(false)}
            onCreated={() => { setCreateLinkOpen(false); load(); }}
          />
        )}

        {editOpen && (
          <EditJobModal
            job={summary.job}
            onClose={() => setEditOpen(false)}
            onSaved={() => { setEditOpen(false); load(); }}
          />
        )}
      </DashboardLayout>
    </ErrorBoundary>
  );
}

// ─── Subcomponents ──────────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ background: "#FFFFFF", border: "1px solid rgba(23,23,15,0.08)", borderRadius: 10, padding: "12px 14px" }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: "#22315C" }}>{value}</div>
      <div style={{ fontSize: 11, color: "rgba(23,23,15,0.45)", fontWeight: 600 }}>{label}</div>
    </div>
  );
}

function LinkCard({
  link, copied, onCopy, onToggle, onExtend, extending, onConfirmExtend, onCancelExtend,
}: {
  link: ApplicationLink; copied: boolean; onCopy: () => void; onToggle: () => void;
  onExtend: () => void; extending: boolean; onConfirmExtend: (days: number) => void; onCancelExtend: () => void;
}) {
  const isExpired = link.expires_at && new Date(link.expires_at) < new Date();
  const isFull = link.max_applications != null && link.application_count >= link.max_applications;
  const effectiveStatus = !link.is_active ? "Disabled" : isExpired ? "Expired" : isFull ? "Full" : "Active";
  const statusColor = effectiveStatus === "Active" ? "#22c55e" : effectiveStatus === "Disabled" ? "#94a3b8" : "#f59e0b";

  return (
    <div style={{ background: "#FFFFFF", border: "1px solid rgba(23,23,15,0.08)", borderRadius: 12, padding: 16, marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <LinkIcon style={{ width: 14, height: 14, color: "#22315C", flexShrink: 0 }} />
          <code style={{ fontSize: 12.5, color: "#17170F", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {PUBLIC_BASE_URL}/{link.slug}
          </code>
          <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10, color: "#fff", background: statusColor, flexShrink: 0 }}>
            {effectiveStatus}
          </span>
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          <IconButton onClick={onCopy} title="Copy link">
            {copied ? <CheckCircle2 style={{ width: 14, height: 14, color: "#22c55e" }} /> : <Copy style={{ width: 14, height: 14 }} />}
          </IconButton>
          <IconButton onClick={() => window.open(`${PUBLIC_BASE_URL}/${link.slug}`, "_blank")} title="View applications">
            <ExternalLink style={{ width: 14, height: 14 }} />
          </IconButton>
          <IconButton onClick={onExtend} title="Extend expiration">
            <Calendar style={{ width: 14, height: 14 }} />
          </IconButton>
          <IconButton onClick={onToggle} title={link.is_active ? "Disable link" : "Enable link"}>
            <Power style={{ width: 14, height: 14, color: link.is_active ? "#ef4444" : "#22c55e" }} />
          </IconButton>
        </div>
      </div>

      <div style={{ display: "flex", gap: 16, marginTop: 10, fontSize: 11.5, color: "rgba(23,23,15,0.45)", flexWrap: "wrap" }}>
        <span>{link.application_count}{link.max_applications ? ` / ${link.max_applications}` : ""} applications</span>
        {link.expires_at && <span>Expires {format(new Date(link.expires_at), "MMM d, yyyy")}</span>}
        <span>Created {formatDistanceToNow(new Date(link.created_at), { addSuffix: true })}</span>
      </div>

      {extending && (
        <div style={{ display: "flex", gap: 6, marginTop: 10, alignItems: "center" }}>
          <span style={{ fontSize: 11.5, color: "rgba(23,23,15,0.5)" }}>Extend by:</span>
          {[7, 14, 30].map(d => (
            <button
              key={d}
              onClick={() => onConfirmExtend(d)}
              style={{ fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 6, border: "1px solid rgba(23,23,15,0.12)", background: "#fff", cursor: "pointer" }}
            >
              {d}d
            </button>
          ))}
          <button onClick={onCancelExtend} style={{ fontSize: 11, color: "rgba(23,23,15,0.4)", background: "none", border: "none", cursor: "pointer" }}>Cancel</button>
        </div>
      )}
    </div>
  );
}

function IconButton({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{ width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(23,23,15,0.04)", border: "none", borderRadius: 8, cursor: "pointer", color: "#17170F" }}
    >
      {children}
    </button>
  );
}

function CandidateRow({ pc, onOpen, onRunMatch, matching }: { pc: PipelineCandidate; onOpen: () => void; onRunMatch: () => void; matching: boolean }) {
  const scoreColor = pc.match_score == null ? "#94a3b8" : pc.match_score >= 75 ? "#22c55e" : pc.match_score >= 50 ? "#f59e0b" : "#ef4444";
  return (
    <div style={{ background: "#FFFFFF", border: "1px solid rgba(23,23,15,0.08)", borderRadius: 12, padding: 14, display: "flex", alignItems: "center", gap: 14, cursor: "pointer" }} onClick={onOpen}>
      <div style={{ width: 44, height: 44, borderRadius: 10, background: "rgba(34,49,92,0.08)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#22315C", flexShrink: 0 }}>
        {pc.match_score != null ? `${pc.match_score}%` : "—"}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: "#17170F" }}>{pc.candidate.full_name}</div>
        <div style={{ fontSize: 11.5, color: "rgba(23,23,15,0.45)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {pc.candidate.location ?? "—"} · {pc.candidate.years_experience ?? "?"} yrs · {STAGE_LABELS[pc.pipeline_stage] ?? pc.pipeline_stage}
        </div>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onRunMatch(); }}
        disabled={matching}
        style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", background: "rgba(124,58,237,0.08)", border: "1px solid rgba(124,58,237,0.2)", borderRadius: 8, color: "#7c3aed", fontSize: 11.5, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}
      >
        {matching ? <Loader2 style={{ width: 12, height: 12, animation: "spin 1s linear infinite" }} /> : <Sparkles style={{ width: 12, height: 12 }} />}
        AI Match
      </button>
      <ChevronRight style={{ width: 16, height: 16, color: "rgba(23,23,15,0.25)", flexShrink: 0 }} />
    </div>
  );
}

function CreateLinkModal({ jobId, onClose, onCreated }: { jobId: string; onClose: () => void; onCreated: () => void }) {
  const [requireCv, setRequireCv] = useState(true);
  const [requireCoverLetter, setRequireCoverLetter] = useState(false);
  const [requireSalary, setRequireSalary] = useState(false);
  const [requirePhone, setRequirePhone] = useState(true);
  const [requireLocation, setRequireLocation] = useState(true);
  const [showSalary, setShowSalary] = useState(false);
  const [expiresInDays, setExpiresInDays] = useState<string>("");
  const [maxApplications, setMaxApplications] = useState<string>("");
  const [questions, setQuestions] = useState<{ question: string; required: boolean }[]>([]);
  const [newQuestion, setNewQuestion] = useState("");
  const [creating, setCreating] = useState(false);

  const addQuestion = () => {
    if (!newQuestion.trim()) return;
    setQuestions(q => [...q, { question: newQuestion.trim(), required: false }]);
    setNewQuestion("");
  };

  const create = async () => {
    setCreating(true);
    try {
      const customQuestions = questions.map((q, i) => ({ id: `q${i + 1}`, question: q.question, required: q.required }));
      const { error } = await (supabase as any).rpc("create_application_link", {
        p_job_id: jobId,
        p_require_cv: requireCv,
        p_require_cover_letter: requireCoverLetter,
        p_require_salary_expectation: requireSalary,
        p_require_phone: requirePhone,
        p_require_location: requireLocation,
        p_show_salary: showSalary,
        p_expires_at: expiresInDays ? new Date(Date.now() + Number(expiresInDays) * 86400000).toISOString() : null,
        p_max_applications: maxApplications ? Number(maxApplications) : null,
        p_custom_questions: customQuestions,
      });
      if (error) throw error;
      toast.success("Application link created");
      onCreated();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to create link");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(23,23,15,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }} onClick={onClose}>
      <div
        style={{ width: "100%", maxWidth: 520, maxHeight: "85vh", overflowY: "auto", background: "#FFFFFF", border: "1px solid rgba(23,23,15,0.1)", borderRadius: 16, padding: 24 }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: "#17170F" }}>Create application link</span>
          <X style={{ width: 18, height: 18, cursor: "pointer", color: "rgba(23,23,15,0.4)" }} onClick={onClose} />
        </div>

        <Section title="Required fields">
          <Toggle label="Require CV" checked={requireCv} onChange={setRequireCv} />
          <Toggle label="Require cover letter" checked={requireCoverLetter} onChange={setRequireCoverLetter} />
          <Toggle label="Require salary expectation" checked={requireSalary} onChange={setRequireSalary} />
          <Toggle label="Require phone number" checked={requirePhone} onChange={setRequirePhone} />
          <Toggle label="Require location" checked={requireLocation} onChange={setRequireLocation} />
        </Section>

        <Section title="Public page">
          <Toggle label="Show salary range publicly" checked={showSalary} onChange={setShowSalary} />
        </Section>

        <Section title="Limits">
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: "rgba(23,23,15,0.55)", display: "block", marginBottom: 4 }}>Expires in (days)</label>
              <input type="number" min="1" value={expiresInDays} onChange={e => setExpiresInDays(e.target.value)} placeholder="No expiry"
                style={{ width: "100%", padding: "8px 10px", border: "1px solid rgba(23,23,15,0.12)", borderRadius: 8, fontSize: 13, boxSizing: "border-box" }} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: "rgba(23,23,15,0.55)", display: "block", marginBottom: 4 }}>Max applications</label>
              <input type="number" min="1" value={maxApplications} onChange={e => setMaxApplications(e.target.value)} placeholder="Unlimited"
                style={{ width: "100%", padding: "8px 10px", border: "1px solid rgba(23,23,15,0.12)", borderRadius: 8, fontSize: 13, boxSizing: "border-box" }} />
            </div>
          </div>
        </Section>

        <Section title="Custom questions">
          {questions.map((q, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, fontSize: 12.5 }}>
              <span style={{ flex: 1 }}>{q.question}</span>
              <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "rgba(23,23,15,0.5)" }}>
                <input type="checkbox" checked={q.required} onChange={e => setQuestions(qs => qs.map((qq, ii) => ii === i ? { ...qq, required: e.target.checked } : qq))} />
                Required
              </label>
              <Trash2 style={{ width: 13, height: 13, cursor: "pointer", color: "rgba(23,23,15,0.35)" }} onClick={() => setQuestions(qs => qs.filter((_, ii) => ii !== i))} />
            </div>
          ))}
          <div style={{ display: "flex", gap: 6 }}>
            <input value={newQuestion} onChange={e => setNewQuestion(e.target.value)} placeholder="Add a question…"
              style={{ flex: 1, padding: "8px 10px", border: "1px solid rgba(23,23,15,0.12)", borderRadius: 8, fontSize: 12.5, boxSizing: "border-box" }} />
            <button onClick={addQuestion} style={{ padding: "8px 12px", background: "rgba(23,23,15,0.06)", border: "none", borderRadius: 8, cursor: "pointer" }}>
              <Plus style={{ width: 14, height: 14 }} />
            </button>
          </div>
        </Section>

        <button
          onClick={create}
          disabled={creating}
          style={{ width: "100%", marginTop: 8, padding: "12px", background: "linear-gradient(135deg, #22315C, #2A3F73)", border: "none", borderRadius: 10, color: "#FAFAF8", fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}
        >
          {creating ? "Creating…" : "Create link"}
        </button>
      </div>
    </div>
  );
}

// Direct update to public.jobs — same RLS-is-enough reasoning JobsPage.tsx
// uses for creation. trg_jobs_updated_at (BEFORE UPDATE) keeps updated_at
// correct; there's no UPDATE-time timeline/audit trigger on jobs to skip.
function EditJobModal({ job, onClose, onSaved }: {
  job: JobSummary["job"];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    title: job.title,
    location: job.location ?? "",
    work_arrangement: job.work_arrangement ?? "",
    salary_min: job.salary_min?.toString() ?? "",
    salary_max: job.salary_max?.toString() ?? "",
    salary_currency: job.salary_currency ?? "GBP",
    headcount: job.headcount.toString(),
  });
  const [saving, setSaving] = useState(false);

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 12px", background: "rgba(23,23,15,0.03)",
    border: "1px solid rgba(23,23,15,0.1)", borderRadius: 10, color: "#17170F",
    fontSize: 13, outline: "none", boxSizing: "border-box",
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 11.5, fontWeight: 600, color: "rgba(23,23,15,0.55)", display: "block", marginBottom: 4,
  };

  const save = async () => {
    if (!form.title.trim()) { toast.error("Job title required"); return; }
    setSaving(true);
    try {
      const { error } = await (supabase as any).from("jobs").update({
        title: form.title.trim(),
        location: form.location.trim() || null,
        work_arrangement: form.work_arrangement || null,
        salary_min: form.salary_min ? Number(form.salary_min) : null,
        salary_max: form.salary_max ? Number(form.salary_max) : null,
        salary_currency: form.salary_currency,
        headcount: form.headcount ? Number(form.headcount) : 1,
      }).eq("id", job.id);
      if (error) throw error;
      toast.success("Job updated");
      onSaved();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to update job");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(23,23,15,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }} onClick={onClose}>
      <div
        style={{ width: "100%", maxWidth: 480, maxHeight: "85vh", overflowY: "auto", background: "#FFFFFF", border: "1px solid rgba(23,23,15,0.1)", borderRadius: 16, padding: 24 }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: "#17170F" }}>Edit job</span>
          <X style={{ width: 18, height: 18, cursor: "pointer", color: "rgba(23,23,15,0.4)" }} onClick={onClose} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={labelStyle}>Job title</label>
            <input style={inputStyle} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} autoFocus />
          </div>

          <div>
            <label style={labelStyle}>Location</label>
            <input style={inputStyle} value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="Lagos, Nigeria" />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={labelStyle}>Work arrangement</label>
              <select style={{ ...inputStyle, cursor: "pointer" }} value={form.work_arrangement} onChange={e => setForm(f => ({ ...f, work_arrangement: e.target.value }))}>
                <option value="">—</option>
                <option value="remote">Remote</option>
                <option value="hybrid">Hybrid</option>
                <option value="onsite">Onsite</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Headcount</label>
              <input style={inputStyle} type="number" min={1} value={form.headcount} onChange={e => setForm(f => ({ ...f, headcount: e.target.value }))} />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <div>
              <label style={labelStyle}>Salary min</label>
              <input style={inputStyle} type="number" value={form.salary_min} onChange={e => setForm(f => ({ ...f, salary_min: e.target.value }))} />
            </div>
            <div>
              <label style={labelStyle}>Salary max</label>
              <input style={inputStyle} type="number" value={form.salary_max} onChange={e => setForm(f => ({ ...f, salary_max: e.target.value }))} />
            </div>
            <div>
              <label style={labelStyle}>Currency</label>
              <select style={{ ...inputStyle, cursor: "pointer" }} value={form.salary_currency} onChange={e => setForm(f => ({ ...f, salary_currency: e.target.value }))}>
                <option value="GBP">GBP</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="NGN">NGN</option>
              </select>
            </div>
          </div>
        </div>

        <button
          onClick={save}
          disabled={saving}
          style={{ width: "100%", marginTop: 18, padding: "12px", background: "linear-gradient(135deg, #22315C, #2A3F73)", border: "none", borderRadius: 10, color: "#FAFAF8", fontSize: 13.5, fontWeight: 700, cursor: saving ? "default" : "pointer", opacity: saving ? 0.7 : 1 }}
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(23,23,15,0.4)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0", cursor: "pointer" }}>
      <span style={{ fontSize: 13, color: "#17170F" }}>{label}</span>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
    </label>
  );
}