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
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import {
  Loader2, Send, Plus, ChevronRight, MessageSquare, CheckCircle2, X, Briefcase, User, Mail, AlertTriangle,
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
  recipient_email?: string | null;
  candidate_job?: CandidateJobOpt | null;
}

// Full candidate/job/client detail needed to draft the submission email.
// Loaded lazily, only when the recruiter opens "Submit to Client" for a
// given submission — the list view above stays on its lighter query.
interface SubmissionEmailContext {
  candidate: {
    id: string;
    full_name: string;
    email: string | null;
    location: string | null;
    candidate_current_role: string | null;
    current_company: string | null;
    years_experience: number | null;
    expected_salary: number | null;
    expected_salary_currency: string | null;
    notice_period: string | null;
    availability_date: string | null;
    skills: string[] | null;
    recruiter_assessment: string | null;
    cv_file_url: string | null;
    cv_file_name: string | null;
  };
  job: {
    id: string;
    title: string;
    location: string | null;
    salary_min: number | null;
    salary_max: number | null;
    salary_currency: string | null;
    client_id: string;
  };
  client: { id: string; name: string } | null;
  contacts: { id: string; full_name: string; email: string | null; job_title: string | null; is_primary_contact: boolean }[];
  coverLetter: string | null;
  cvSignedUrl: string | null;
  recruiter: { name: string; email: string | null };
  teamName: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function fmtMoney(amount: number | null | undefined, currency: string | null | undefined) {
  if (amount == null) return null;
  const cur = currency || "";
  return `${cur} ${Number(amount).toLocaleString()}`.trim();
}

function buildSubjectAndBody(ctx: SubmissionEmailContext, recruiterMessage: string) {
  const { candidate, job, client } = ctx;

  const subject = `Candidate Submission: ${candidate.full_name} for ${job.title}${client?.name ? " — " + client.name : ""}`;

  const lines: string[] = [];
  lines.push(`Dear ${client?.name || "Hiring Team"},`);
  lines.push("");
  lines.push(`I'm pleased to submit ${candidate.full_name} for the ${job.title} role.`);
  lines.push("");

  if (recruiterMessage.trim()) {
    lines.push(recruiterMessage.trim());
    lines.push("");
  }

  lines.push("CANDIDATE SUMMARY");
  const summaryBits: string[] = [];
  if (candidate.candidate_current_role) summaryBits.push(candidate.candidate_current_role + (candidate.current_company ? ` at ${candidate.current_company}` : ""));
  if (candidate.years_experience != null) summaryBits.push(`${candidate.years_experience} years of experience`);
  lines.push(summaryBits.length ? summaryBits.join(", ") : `${candidate.full_name} is being submitted for this role.`);
  if (candidate.recruiter_assessment) {
    lines.push("");
    lines.push(candidate.recruiter_assessment);
  }
  lines.push("");

  if (candidate.skills && candidate.skills.length > 0) {
    lines.push("RELEVANT SKILLS & EXPERIENCE");
    lines.push(candidate.skills.join(", "));
    lines.push("");
  }

  const salaryLine = fmtMoney(candidate.expected_salary, candidate.expected_salary_currency);
  if (salaryLine) {
    lines.push(`Salary Expectation: ${salaryLine}`);
  }
  if (candidate.notice_period || candidate.availability_date) {
    const avail = [candidate.notice_period, candidate.availability_date ? `available ${candidate.availability_date}` : null]
      .filter(Boolean).join(" — ");
    lines.push(`Notice Period / Availability: ${avail}`);
  }
  if (candidate.location) {
    lines.push(`Location: ${candidate.location}`);
  }
  if (salaryLine || candidate.notice_period || candidate.availability_date || candidate.location) lines.push("");

  if (ctx.cvSignedUrl) {
    lines.push(`CV: ${ctx.cvSignedUrl}`);
  }
  if (ctx.coverLetter) {
    lines.push("");
    lines.push("COVER LETTER");
    lines.push(ctx.coverLetter);
  }
  lines.push("");

  lines.push("Please let me know if you'd like to move forward or need anything further.");
  lines.push("");
  lines.push("Best regards,");
  lines.push(ctx.recruiter.name || "Recruiter");
  if (ctx.teamName) lines.push(ctx.teamName);
  if (ctx.recruiter.email) lines.push(ctx.recruiter.email);

  // Collapse consecutive blank lines (candidates with several missing
  // optional fields — e.g. no skills, no salary, no CV — otherwise leave
  // stacked blank lines where those sections would have been).
  const collapsed: string[] = [];
  for (const l of lines) {
    if (l === "" && collapsed[collapsed.length - 1] === "") continue;
    collapsed.push(l);
  }
  return { subject, body: collapsed.join("\n").trim() };
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

// ─── Submit to Client drawer (load context → draft email → edit → mailto:) ──

function SendEmailDrawer({ submission, onClose, onSent }: {
  submission: Submission; onClose: () => void; onSent: () => void;
}) {
  const { team } = useTeam();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [ctx, setCtx] = useState<SubmissionEmailContext | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [recruiterMessage, setRecruiterMessage] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [selectedContactId, setSelectedContactId] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const [recording, setRecording] = useState(false);

  const cj = submission.candidate_job;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const candidateId = cj?.candidate?.id;
        const jobId = cj?.job?.id;
        if (!candidateId || !jobId) throw new Error("Missing candidate or job on this submission");

        const [candRes, jobRes, profileRes] = await Promise.all([
          (supabase as any).from("candidates").select(
            "id, full_name, email, location, candidate_current_role, current_company, years_experience, expected_salary, expected_salary_currency, notice_period, availability_date, skills, recruiter_assessment, cv_file_url, cv_file_name"
          ).eq("id", candidateId).single(),
          (supabase as any).from("jobs").select(
            "id, title, location, salary_min, salary_max, salary_currency, client_id"
          ).eq("id", jobId).single(),
          user?.id
            ? (supabase as any).from("profiles").select("full_name, email").eq("id", user.id).maybeSingle()
            : Promise.resolve({ data: null }),
        ]);
        if (candRes.error) throw candRes.error;
        if (jobRes.error) throw jobRes.error;

        const job = jobRes.data;
        const [clientRes, contactsRes, coverLetterRes] = await Promise.all([
          (supabase as any).from("recruiting_clients").select("id, name").eq("id", job.client_id).maybeSingle(),
          (supabase as any).from("client_contacts").select("id, full_name, email, job_title, is_primary_contact").eq("client_id", job.client_id),
          (supabase as any).from("job_applications").select("cover_letter").eq("candidate_job_id", submission.candidate_job_id).maybeSingle(),
        ]);

        let cvSignedUrl: string | null = null;
        const candidate = candRes.data;
        if (candidate.cv_file_url) {
          const { data: signed, error: signErr } = await supabase.storage
            .from("candidate-cvs")
            .createSignedUrl(candidate.cv_file_url, 60 * 60 * 24 * 7); // 7 days — long enough to sit in a client's inbox
          if (!signErr) cvSignedUrl = signed?.signedUrl ?? null;
        }

        const contacts = (contactsRes.data ?? []) as SubmissionEmailContext["contacts"];
        const primary = contacts.find(c => c.is_primary_contact && c.email) ?? contacts.find(c => c.email);

        const nextCtx: SubmissionEmailContext = {
          candidate,
          job,
          client: clientRes.data ?? null,
          contacts,
          coverLetter: coverLetterRes.data?.cover_letter || null,
          cvSignedUrl,
          recruiter: { name: profileRes.data?.full_name || user?.email || "Recruiter", email: profileRes.data?.email || user?.email || null },
          teamName: team?.name || "",
        };

        if (cancelled) return;
        setCtx(nextCtx);
        const { subject: s, body: b } = buildSubjectAndBody(nextCtx, submission.relevance_explanation || "");
        setSubject(s);
        setBody(b);
        setRecruiterMessage(submission.relevance_explanation || "");
        if (primary?.email) {
          setSelectedContactId(primary.id);
          setRecipientEmail(primary.email);
        }
      } catch (e: any) {
        if (!cancelled) setLoadError(e.message ?? "Failed to load candidate/job/client details");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submission.id]);

  // Regenerate the draft body when the recruiter's message changes, but only
  // up to the point they start editing the body directly (bodyEdited).
  const [bodyEdited, setBodyEdited] = useState(false);
  useEffect(() => {
    if (!ctx || bodyEdited) return;
    const { subject: s, body: b } = buildSubjectAndBody(ctx, recruiterMessage);
    setSubject(s);
    setBody(b);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recruiterMessage, ctx]);

  const emailValid = EMAIL_RE.test(recipientEmail.trim());
  const showEmailError = emailTouched && recipientEmail.trim().length > 0 && !emailValid;
  const showEmailRequired = emailTouched && recipientEmail.trim().length === 0;

  const handleSend = async () => {
    setEmailTouched(true);
    const trimmedEmail = recipientEmail.trim();
    if (!trimmedEmail) { toast.error("Enter the client's email address"); return; }
    if (!EMAIL_RE.test(trimmedEmail)) { toast.error("That doesn't look like a valid email address"); return; }
    if (!subject.trim()) { toast.error("Subject can't be empty"); return; }
    if (!body.trim()) { toast.error("Message can't be empty"); return; }

    // Open the recruiter's own email client via mailto: — no third-party
    // email provider, nothing sent server-side, no connected account required.
    const mailto = `mailto:${encodeURIComponent(trimmedEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    const win = window.open(mailto, "_self");

    // Record the submission only after handoff to the mail client — this is
    // the send_submission RPC overload that also stores recipient/subject/
    // message on the submission row (see migration: submissions.recipient_email
    // / email_subject / email_message) and flips status draft -> submitted,
    // which in turn advances candidate_jobs.pipeline_stage and fires the
    // existing trg_tl_submission_sent timeline trigger.
    setRecording(true);
    try {
      const { error } = await (supabase as any).rpc("send_submission", {
        p_submission_id: submission.id,
        p_recipient_email: trimmedEmail,
        p_email_subject: subject,
        p_email_message: body,
      });
      if (error) throw error;
      toast.success("Submission recorded — finish sending the email in your mail app");
      onSent();
      onClose();
    } catch (e: any) {
      toast.error(e.message ?? "Email opened, but recording the submission failed");
    } finally {
      setRecording(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#FAFAF8", borderRadius: "18px 18px 0 0", padding: 20, width: "100%", maxWidth: 560, maxHeight: "90vh", overflowY: "auto", fontFamily: "'Inter', sans-serif", boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 800, color: "#17170F", margin: 0 }}>Submit to Client</h2>
            <p style={{ fontSize: 11.5, color: "rgba(23,23,15,0.45)", margin: "2px 0 0" }}>
              {cj?.candidate?.full_name ?? "Candidate"} → {cj?.job?.title ?? "Job"}
            </p>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(23,23,15,0.4)" }}><X style={{ width: 18, height: 18 }} /></button>
        </div>

        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
            <Loader2 style={{ width: 20, height: 20, color: "rgba(23,23,15,0.3)", animation: "spin 1s linear infinite" }} />
          </div>
        ) : loadError ? (
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: 14, background: "rgba(239,68,68,0.08)", borderRadius: 10, color: "#b91c1c", fontSize: 12.5 }}>
            <AlertTriangle style={{ width: 15, height: 15, flexShrink: 0, marginTop: 1 }} />
            <span>{loadError}</span>
          </div>
        ) : ctx ? (
          <>
            <label style={labelStyle}>Client Email</label>
            {ctx.contacts.length > 0 && (
              <select
                value={selectedContactId}
                onChange={e => {
                  setSelectedContactId(e.target.value);
                  const c = ctx.contacts.find(c => c.id === e.target.value);
                  if (c?.email) setRecipientEmail(c.email);
                }}
                style={{ ...inputStyle, marginBottom: 8 }}
              >
                <option value="">Choose a client contact…</option>
                {ctx.contacts.map(c => (
                  <option key={c.id} value={c.id} disabled={!c.email}>
                    {c.full_name}{c.job_title ? ` (${c.job_title})` : ""}{!c.email ? " — no email on file" : ""}
                  </option>
                ))}
              </select>
            )}
            <input
              value={recipientEmail}
              onChange={e => { setRecipientEmail(e.target.value); setSelectedContactId(""); }}
              onBlur={() => setEmailTouched(true)}
              placeholder="client@company.com"
              style={{ ...inputStyle, marginBottom: showEmailError || showEmailRequired ? 4 : 10, borderColor: (showEmailError || showEmailRequired) ? "#ef4444" : undefined }}
            />
            {showEmailError && <div style={{ fontSize: 11, color: "#ef4444", marginBottom: 10 }}>Enter a valid email address.</div>}
            {showEmailRequired && <div style={{ fontSize: 11, color: "#ef4444", marginBottom: 10 }}>Client email is required to send.</div>}
            {ctx.contacts.length === 0 && (
              <div style={{ fontSize: 11, color: "rgba(23,23,15,0.4)", marginTop: -4, marginBottom: 10 }}>
                No contacts on file for this client yet — enter their email directly.
              </div>
            )}

            <label style={labelStyle}>Your Message to the Client (optional)</label>
            <textarea
              value={recruiterMessage}
              onChange={e => setRecruiterMessage(e.target.value)}
              style={{ ...inputStyle, minHeight: 60, resize: "vertical", marginBottom: 10 }}
              placeholder="Why this candidate is a strong fit…"
            />

            <label style={labelStyle}>Subject</label>
            <input
              value={subject}
              onChange={e => setSubject(e.target.value)}
              style={{ ...inputStyle, marginBottom: 10 }}
            />

            <label style={labelStyle}>Email Preview (edit before sending)</label>
            <textarea
              value={body}
              onChange={e => { setBody(e.target.value); setBodyEdited(true); }}
              style={{ ...inputStyle, minHeight: 260, resize: "vertical", marginBottom: 6, fontFamily: "monospace", fontSize: 12 }}
            />
            {!ctx.cvSignedUrl && (
              <div style={{ fontSize: 11, color: "rgba(23,23,15,0.4)", marginBottom: 10 }}>
                No CV on file for this candidate — the email will go out without a CV link.
              </div>
            )}

            <button
              onClick={handleSend}
              disabled={recording}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, width: "100%", padding: "12px 16px", background: "#22315C", border: "none", borderRadius: 10, color: "#FAFAF8", fontSize: 13.5, fontWeight: 700, cursor: recording ? "default" : "pointer" }}
            >
              {recording ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> : <Mail style={{ width: 14, height: 14 }} />}
              {recording ? "Recording…" : "Send"}
            </button>
            <p style={{ fontSize: 10.5, color: "rgba(23,23,15,0.4)", margin: "8px 0 0", textAlign: "center" }}>
              Opens your default email app with this message pre-filled. The submission is recorded once handed off.
            </p>
          </>
        ) : null}
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
  const [sendFor, setSendFor] = useState<Submission | null>(null);

  const load = useCallback(async () => {
    if (!teamId) return;
    setLoading(true);
    try {
      const [subRes, cjRes] = await Promise.all([
        (supabase as any)
          .from("submissions")
          .select("id, candidate_job_id, status, relevance_explanation, submitted_at, created_at, recipient_email, candidate_job:candidate_jobs(id, pipeline_stage, candidate:candidates(id, full_name), job:jobs(id, title))")
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
                  <SubmissionRow key={s.id} s={s} onSend={() => setSendFor(s)} onFeedback={() => setFeedbackFor(s)} />
                ))}
              </div>
            </div>
          )}
          {grouped.responded.length > 0 && (
            <div>
              <div style={sectionHeaderStyle}>Client Responded ({grouped.responded.length})</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {grouped.responded.map(s => (
                  <SubmissionRow key={s.id} s={s} onSend={() => setSendFor(s)} onFeedback={() => setFeedbackFor(s)} />
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
      {sendFor && (
        <SendEmailDrawer submission={sendFor} onClose={() => setSendFor(null)} onSent={load} />
      )}
    </div>
  );
}

function SubmissionRow({ s, onSend, onFeedback }: {
  s: Submission; onSend: () => void; onFeedback: () => void;
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
        {s.recipient_email ? ` · to ${s.recipient_email}` : ""}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        {s.status === "draft" && (
          <button onClick={onSend} style={actionBtnStyle("#22315C", "#FAFAF8")}>
            <Send style={{ width: 12, height: 12 }} />
            Submit to Client
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