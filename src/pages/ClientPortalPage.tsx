/**
 * ClientPortalPage.tsx
 *
 * Anonymous client-facing portal at /portal/:slug — no auth required.
 * Visually matches PublicJobApplicationPage.tsx's design system (cream/paper
 * background, navy accent, Inter font, bordered cards) so a client's
 * experience feels continuous with any other Fixsense-hosted public page.
 *
 * Talks directly to the client-portal RPCs (all SECURITY DEFINER, granted to
 * anon, and slug-scoped — see resolve_client_portal_token and friends in the
 * DB). There's no edge function in front of these: the RPCs themselves are
 * the trust boundary, exactly like PublicJobApplicationPage uses an edge
 * function as its boundary. No direct table reads/writes from this page.
 *
 * Every client action (shortlist / reject / request interview / leave
 * feedback) writes a recruiting_timeline_events row keyed on the
 * candidate_job — get_candidate_job_timeline already surfaces those with no
 * extra plumbing, so the recruiter-side CandidateDetailPage timeline updates
 * automatically the next time a recruiter loads it.
 */

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useParams } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import {
  Loader2, AlertCircle, Building2, MapPin, Briefcase, DollarSign,
  ThumbsUp, ThumbsDown, CalendarClock, MessageSquare, CheckCircle2,
  X, Sparkles, Linkedin, Clock, GraduationCap,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

type RejectionReason =
  | "skills_gap" | "salary_mismatch" | "location" | "availability"
  | "client_rejected" | "interview_performance" | "candidate_withdrew" | "other";

const REJECTION_REASONS: { value: RejectionReason; label: string }[] = [
  { value: "skills_gap", label: "Skills gap" },
  { value: "salary_mismatch", label: "Salary mismatch" },
  { value: "location", label: "Location" },
  { value: "availability", label: "Availability" },
  { value: "interview_performance", label: "Interview performance" },
  { value: "candidate_withdrew", label: "Candidate withdrew" },
  { value: "client_rejected", label: "Not the right fit" },
  { value: "other", label: "Other" },
];

interface Interview {
  interview_id: string;
  status: "requested" | "scheduled" | "completed" | "cancelled" | "no_show";
  meeting_link: string | null;
  scheduled_at: string | null;
  interview_stage: string;
}

interface Feedback {
  id: string;
  sentiment: "positive" | "mixed" | "negative" | null;
  created_at: string;
  feedback_text: string;
}

interface CandidateSnapshot {
  email: string | null;
  phone: string | null;
  skills: string[];
  location: string | null;
  full_name: string;
  linkedin_url: string | null;
  notice_period: string | null;
  current_company: string | null;
  expected_salary: number | null;
  years_experience: number | null;
  work_authorization: string | null;
  recruiter_assessment: string | null;
  candidate_current_role: string | null;
  expected_salary_currency: string | null;
  work_arrangement_preference: string | null;
}

interface Submission {
  status: "submitted" | "client_reviewing" | "client_responded";
  feedback: Feedback[];
  interviews: Interview[];
  submitted_at: string;
  submission_id: string;
  pipeline_stage: string;
  candidate_job_id: string;
  summary_snapshot: {
    job: { title: string; location: string | null; salary_max: number | null; salary_min: number | null; salary_currency: string | null; work_arrangement: string | null };
    candidate: CandidateSnapshot;
    match_score: number | null;
    snapshot_taken_at: string;
  };
  relevance_explanation: string | null;
}

interface PortalData {
  job: { id: string; title: string; location: string | null; work_arrangement: string | null };
  client: { id: string; name: string; logo_url: string | null };
  submissions: Submission[];
}

type LoadState = "loading" | "ready" | "not_found" | "expired" | "disabled";

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatSalary(min: number | null, max: number | null, currency: string | null) {
  if (!min && !max) return null;
  const fmt = (n: number) => new Intl.NumberFormat("en-US").format(n);
  const cur = currency ?? "";
  if (min && max) return `${cur} ${fmt(min)} – ${fmt(max)}`;
  return `${cur} ${fmt((min ?? max) as number)}`;
}

function relTime(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

// Every client-portal RPC is granted to anon and takes p_slug first — a thin
// shared caller keeps error handling (Postgres RPC errors arrive as
// { message } via the SDK) consistent across all four actions.
async function callPortalRpc(fn: string, args: Record<string, unknown>) {
  const { data, error } = await (supabase as any).rpc(fn, args);
  if (error) return { ok: false as const, message: error.message ?? "Something went wrong. Please try again." };
  return { ok: true as const, data };
}

const STAGE_LABELS: Record<string, string> = {
  submitted: "Submitted", client_review: "Under review", shortlisted: "Shortlisted",
  interview: "Interview", final_interview: "Final interview", offer: "Offer",
  placed: "Placed", rejected: "Not proceeding",
};

// ─── Main ───────────────────────────────────────────────────────────────────

export default function ClientPortalPage() {
  const { slug } = useParams<{ slug: string }>();
  const [state, setState] = useState<LoadState>("loading");
  const [portal, setPortal] = useState<PortalData | null>(null);
  const [activeModal, setActiveModal] = useState<{ type: "reject" | "interview" | "feedback"; submissionId: string } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const prefersReducedMotion = useReducedMotion();

  const load = useCallback(async () => {
    if (!slug) return;
    const res = await callPortalRpc("get_client_portal_submissions", { p_slug: slug });
    if (!res.ok) {
      const msg = res.message.toLowerCase();
      if (msg.includes("expired")) setState("expired");
      else if (msg.includes("disabled")) setState("disabled");
      else setState("not_found");
      return;
    }
    setPortal(res.data as PortalData);
    setState("ready");
  }, [slug]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  const shortlist = async (submissionId: string) => {
    setActionError(null);
    const res = await callPortalRpc("client_portal_shortlist_candidate", { p_slug: slug, p_submission_id: submissionId });
    if (!res.ok) { setActionError(res.message); return; }
    setToast("Candidate shortlisted");
    await load();
  };

  const reject = async (submissionId: string, reason: RejectionReason, notes: string) => {
    setActionError(null);
    const res = await callPortalRpc("client_portal_reject_candidate", {
      p_slug: slug, p_submission_id: submissionId, p_reason: reason, p_notes: notes.trim() || null,
    });
    if (!res.ok) { setActionError(res.message); return; }
    setActiveModal(null);
    setToast("Feedback sent — candidate marked as not proceeding");
    await load();
  };

  const requestInterview = async (submissionId: string, message: string, preferredTimes: string) => {
    setActionError(null);
    const res = await callPortalRpc("client_portal_request_interview", {
      p_slug: slug, p_submission_id: submissionId,
      p_message: message.trim() || null, p_preferred_times: preferredTimes.trim() || null,
    });
    if (!res.ok) { setActionError(res.message); return; }
    setActiveModal(null);
    setToast("Interview request sent to the recruiting team");
    await load();
  };

  const leaveFeedback = async (submissionId: string, text: string, sentiment: "positive" | "mixed" | "negative" | null) => {
    setActionError(null);
    const res = await callPortalRpc("client_portal_leave_feedback", {
      p_slug: slug, p_submission_id: submissionId, p_feedback_text: text.trim(), p_sentiment: sentiment,
    });
    if (!res.ok) { setActionError(res.message); return; }
    setActiveModal(null);
    setToast("Feedback sent");
    await load();
  };

  const css = `
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    :root{
      --paper:#FAFAF8;--paper2:#F3F2ED;
      --ink:#17170F;--ink2:rgba(23,23,15,0.66);--muted:rgba(23,23,15,0.42);--faint:rgba(23,23,15,0.28);
      --border:rgba(23,23,15,0.11);--border-strong:rgba(23,23,15,0.18);
      --accent:#22315C;--accent-ink:#FAFAF8;--accent-soft:rgba(34,49,92,0.07);--accent-border:rgba(34,49,92,0.22);
      --bad:#b3432f;--bad-soft:rgba(179,67,47,0.08);--bad-border:rgba(179,67,47,0.22);
      --good:#2F6B4F;--good-soft:rgba(47,107,79,0.08);--good-border:rgba(47,107,79,0.22);
      --fb:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
      --fm:'IBM Plex Mono',ui-monospace,monospace;
      --radius-s:6px;--radius-m:10px;--radius-l:14px;
    }
    .cp-root{min-height:100vh;background:var(--paper);color:var(--ink);font-family:var(--fb);-webkit-font-smoothing:antialiased;font-feature-settings:"cv02","cv03","cv04";}
    @media (prefers-reduced-motion: reduce){ .cp-root *{animation-duration:.001ms!important;animation-iteration-count:1!important;} }
    .cp-nav{position:sticky;top:0;z-index:20;display:flex;align-items:center;height:60px;padding:0 22px;background:rgba(250,250,248,0.92);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border-bottom:1px solid var(--border);}
    .cp-nav-inner{max-width:860px;width:100%;margin:0 auto;display:flex;align-items:center;justify-content:space-between;}
    .cp-nav-brand{display:flex;align-items:center;gap:9px;}
    .cp-logo{width:26px;height:26px;border-radius:7px;background:var(--accent-soft);border:1px solid var(--accent-border);display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0;}
    .cp-logo img{width:100%;height:100%;object-fit:cover;}
    .cp-brand-name{font-size:15px;font-weight:700;color:var(--ink);letter-spacing:-.01em;}
    .cp-content{max-width:860px;margin:0 auto;padding:36px 20px 80px;}
    .cp-eyebrow{font-family:var(--fm);font-size:11px;font-weight:600;color:var(--accent);text-transform:uppercase;letter-spacing:.09em;margin-bottom:10px;display:flex;align-items:center;gap:7px;}
    .cp-title{font-size:clamp(22px,4vw,30px);font-weight:700;color:var(--ink);letter-spacing:-.03em;line-height:1.14;margin-bottom:10px;}
    .cp-meta-row{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:30px;}
    .cp-meta-item{display:flex;align-items:center;gap:6px;font-size:12.5px;font-weight:500;color:var(--ink2);background:var(--paper2);border:1px solid var(--border);border-radius:100px;padding:6px 12px 6px 10px;}
    .cp-meta-item svg{color:var(--muted);flex-shrink:0;}
    .cp-card{background:#fff;border:1px solid var(--border);border-radius:var(--radius-l);padding:22px;margin-bottom:16px;}
    .cp-card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px;}
    .cp-cand-name{font-size:17px;font-weight:700;letter-spacing:-.01em;color:var(--ink);}
    .cp-cand-role{font-size:13px;color:var(--ink2);margin-top:2px;}
    .cp-badge{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;padding:4px 9px;border-radius:100px;white-space:nowrap;flex-shrink:0;}
    .cp-badge-accent{background:var(--accent-soft);color:var(--accent);border:1px solid var(--accent-border);}
    .cp-badge-good{background:var(--good-soft);color:var(--good);border:1px solid var(--good-border);}
    .cp-badge-bad{background:var(--bad-soft);color:var(--bad);border:1px solid var(--bad-border);}
    .cp-tag{display:inline-flex;align-items:center;font-size:12px;font-weight:500;padding:5px 11px;border-radius:100px;color:var(--ink2);background:var(--paper2);border:1px solid var(--border);margin:0 6px 6px 0;}
    .cp-detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px 20px;margin:14px 0;}
    .cp-detail{font-size:12.5px;}
    .cp-detail-label{color:var(--faint);font-weight:600;text-transform:uppercase;letter-spacing:.05em;font-size:10px;margin-bottom:3px;}
    .cp-detail-value{color:var(--ink);}
    .cp-explain{background:var(--accent-soft);border:1px solid var(--accent-border);border-radius:var(--radius-m);padding:12px 14px;font-size:13px;color:var(--ink2);line-height:1.55;margin:14px 0;display:flex;gap:8px;align-items:flex-start;}
    .cp-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px;padding-top:16px;border-top:1px solid var(--border);}
    .cp-btn{display:flex;align-items:center;gap:7px;font-size:13px;font-weight:600;padding:10px 15px;border-radius:var(--radius-s);cursor:pointer;font-family:var(--fb);border:1px solid var(--border-strong);background:#fff;color:var(--ink);transition:opacity .15s;}
    .cp-btn:hover{opacity:.75;}
    .cp-btn:active{transform:scale(.98);}
    .cp-btn:disabled{opacity:.4;cursor:not-allowed;transform:none;}
    .cp-btn-primary{background:var(--accent);border-color:var(--accent);color:var(--accent-ink);}
    .cp-btn-bad{color:var(--bad);border-color:var(--bad-border);}
    .cp-btn-bad:hover{background:var(--bad-soft);}
    .cp-history{margin-top:14px;padding-top:14px;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:8px;}
    .cp-history-item{display:flex;gap:9px;font-size:12.5px;color:var(--ink2);}
    .cp-history-icon{flex-shrink:0;width:14px;height:14px;margin-top:1px;}
    .cp-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:50vh;text-align:center;padding:40px 20px;}
    .cp-modal-backdrop{position:fixed;inset:0;background:rgba(23,23,15,0.4);backdrop-filter:blur(2px);z-index:40;display:flex;align-items:center;justify-content:center;padding:20px;}
    .cp-modal{background:#fff;border-radius:var(--radius-l);border:1px solid var(--border);padding:24px;max-width:440px;width:100%;max-height:88vh;overflow-y:auto;}
    .cp-modal-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;}
    .cp-modal-title{font-size:16px;font-weight:700;letter-spacing:-.01em;}
    .cp-modal-close{background:none;border:none;cursor:pointer;color:var(--muted);padding:4px;}
    .cp-field{margin-bottom:14px;}
    .cp-field label{display:block;font-size:12.5px;font-weight:600;color:var(--ink2);margin-bottom:6px;}
    .cp-input, .cp-textarea, .cp-select{width:100%;background:var(--paper);border:1px solid var(--border-strong);border-radius:var(--radius-s);padding:11px 13px;color:var(--ink);font-size:14px;font-family:var(--fb);outline:none;transition:border-color .15s,background .15s;}
    .cp-input:focus, .cp-textarea:focus, .cp-select:focus{border-color:var(--accent);background:#fff;}
    .cp-textarea{resize:vertical;min-height:80px;}
    .cp-sentiment-row{display:flex;gap:8px;}
    .cp-sentiment-btn{flex:1;padding:9px;border-radius:var(--radius-s);border:1px solid var(--border-strong);background:#fff;font-size:12.5px;font-weight:600;cursor:pointer;color:var(--ink2);font-family:var(--fb);transition:all .15s;}
    .cp-sentiment-btn.active-positive{background:var(--good-soft);border-color:var(--good-border);color:var(--good);}
    .cp-sentiment-btn.active-mixed{background:var(--accent-soft);border-color:var(--accent-border);color:var(--accent);}
    .cp-sentiment-btn.active-negative{background:var(--bad-soft);border-color:var(--bad-border);color:var(--bad);}
    .cp-modal-error{font-size:12.5px;color:var(--bad);background:var(--bad-soft);border:1px solid var(--bad-border);border-radius:var(--radius-s);padding:9px 11px;margin-bottom:14px;}
    .cp-toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:var(--ink);color:var(--paper);font-size:13px;font-weight:500;padding:11px 18px;border-radius:100px;z-index:50;display:flex;align-items:center;gap:8px;box-shadow:0 8px 24px rgba(0,0,0,0.2);}
    @keyframes spin{to{transform:rotate(360deg)}}
  `;

  if (state === "loading") {
    return (
      <div style={{ minHeight: "100vh", background: "#FAFAF8", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <style>{css}</style>
        <Loader2 style={{ width: 26, height: 26, color: "#22315C", animation: "spin 1s linear infinite" }} />
      </div>
    );
  }

  if (state !== "ready" || !portal) {
    const messages: Record<string, string> = {
      not_found: "We couldn't find this portal link. Please check the link or contact your recruiter.",
      expired: "This portal link has expired. Please contact your recruiter for a new one.",
      disabled: "This portal link has been disabled. Please contact your recruiter.",
    };
    return (
      <div className="cp-root">
        <style>{css}</style>
        <div className="cp-empty">
          <AlertCircle style={{ width: 38, height: 38, color: "#b3432f", marginBottom: 16 }} />
          <h2 style={{ fontSize: 19, fontWeight: 700, letterSpacing: "-.02em", marginBottom: 8 }}>Portal unavailable</h2>
          <p style={{ fontSize: 13, color: "rgba(23,23,15,0.45)", maxWidth: 340, lineHeight: 1.6 }}>{messages[state]}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="cp-root">
      <style>{css}</style>
      <nav className="cp-nav">
        <div className="cp-nav-inner">
          <div className="cp-nav-brand">
            <div className="cp-logo">
              {portal.client.logo_url ? <img src={portal.client.logo_url} alt={portal.client.name} /> : <Building2 style={{ width: 13, height: 13, color: "#22315C" }} />}
            </div>
            <span className="cp-brand-name">{portal.client.name}</span>
          </div>
        </div>
      </nav>

      <div className="cp-content">
        <div className="cp-eyebrow"><Sparkles style={{ width: 12, height: 12 }} /> Candidate Portal</div>
        <h1 className="cp-title">{portal.job.title}</h1>
        <div className="cp-meta-row">
          {portal.job.location && <span className="cp-meta-item"><MapPin style={{ width: 13, height: 13 }} /> {portal.job.location}</span>}
          {portal.job.work_arrangement && <span className="cp-meta-item"><Briefcase style={{ width: 13, height: 13 }} /> {portal.job.work_arrangement}</span>}
          <span className="cp-meta-item">{portal.submissions.length} candidate{portal.submissions.length === 1 ? "" : "s"} submitted</span>
        </div>

        {portal.submissions.length === 0 ? (
          <div className="cp-card" style={{ textAlign: "center", padding: 40, color: "var(--muted)", fontSize: 13 }}>
            No candidates have been submitted for this role yet.
          </div>
        ) : (
          portal.submissions.map(sub => (
            <SubmissionCard
              key={sub.submission_id}
              sub={sub}
              onShortlist={() => shortlist(sub.submission_id)}
              onOpenReject={() => { setActionError(null); setActiveModal({ type: "reject", submissionId: sub.submission_id }); }}
              onOpenInterview={() => { setActionError(null); setActiveModal({ type: "interview", submissionId: sub.submission_id }); }}
              onOpenFeedback={() => { setActionError(null); setActiveModal({ type: "feedback", submissionId: sub.submission_id }); }}
            />
          ))
        )}
      </div>

      <AnimatePresence>
        {activeModal && (
          <ActionModal
            type={activeModal.type}
            error={actionError}
            prefersReducedMotion={!!prefersReducedMotion}
            onClose={() => { setActiveModal(null); setActionError(null); }}
            onSubmitReject={(reason, notes) => reject(activeModal.submissionId, reason, notes)}
            onSubmitInterview={(msg, times) => requestInterview(activeModal.submissionId, msg, times)}
            onSubmitFeedback={(text, sentiment) => leaveFeedback(activeModal.submissionId, text, sentiment)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.div
            className="cp-toast"
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
            transition={prefersReducedMotion ? { duration: 0.15 } : { type: "spring", bounce: 0, duration: 0.35 }}
          >
            <CheckCircle2 style={{ width: 14, height: 14 }} /> {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Submission card ────────────────────────────────────────────────────────

function SubmissionCard({ sub, onShortlist, onOpenReject, onOpenInterview, onOpenFeedback }: {
  sub: Submission;
  onShortlist: () => void;
  onOpenReject: () => void;
  onOpenInterview: () => void;
  onOpenFeedback: () => void;
}) {
  const cand = sub.summary_snapshot.candidate;
  const finalized = sub.pipeline_stage === "placed" || sub.pipeline_stage === "rejected";
  const canAct = !finalized; // actions still allowed post client_responded, per the RPCs — only a finalized pipeline blocks them
  const salary = formatSalary(sub.summary_snapshot.job.salary_min, sub.summary_snapshot.job.salary_max, sub.summary_snapshot.job.salary_currency);
  const expected = cand.expected_salary
    ? `${cand.expected_salary_currency ?? ""} ${new Intl.NumberFormat("en-US").format(cand.expected_salary)}`.trim()
    : null;

  const stageBadgeClass = sub.pipeline_stage === "placed" ? "cp-badge-good" : sub.pipeline_stage === "rejected" ? "cp-badge-bad" : "cp-badge-accent";

  return (
    <div className="cp-card">
      <div className="cp-card-head">
        <div>
          <div className="cp-cand-name">{cand.full_name}</div>
          {(cand.candidate_current_role || cand.current_company) && (
            <div className="cp-cand-role">
              {cand.candidate_current_role}{cand.candidate_current_role && cand.current_company ? " at " : ""}{cand.current_company}
            </div>
          )}
        </div>
        <span className={`cp-badge ${stageBadgeClass}`}>{STAGE_LABELS[sub.pipeline_stage] ?? sub.pipeline_stage}</span>
      </div>

      {sub.relevance_explanation && (
        <div className="cp-explain">
          <Sparkles style={{ width: 14, height: 14, color: "var(--accent)", flexShrink: 0, marginTop: 1 }} />
          <span>{sub.relevance_explanation}</span>
        </div>
      )}

      {!!cand.skills?.length && (
        <div style={{ marginBottom: 8 }}>
          {cand.skills.map((s, i) => <span key={i} className="cp-tag">{s}</span>)}
        </div>
      )}

      <div className="cp-detail-grid">
        {cand.years_experience != null && (
          <div className="cp-detail">
            <div className="cp-detail-label">Experience</div>
            <div className="cp-detail-value">{cand.years_experience} years</div>
          </div>
        )}
        {cand.location && (
          <div className="cp-detail">
            <div className="cp-detail-label">Location</div>
            <div className="cp-detail-value">{cand.location}</div>
          </div>
        )}
        {expected && (
          <div className="cp-detail">
            <div className="cp-detail-label">Expected salary</div>
            <div className="cp-detail-value">{expected}</div>
          </div>
        )}
        {cand.notice_period && (
          <div className="cp-detail">
            <div className="cp-detail-label">Notice period</div>
            <div className="cp-detail-value">{cand.notice_period}</div>
          </div>
        )}
        {cand.work_authorization && (
          <div className="cp-detail">
            <div className="cp-detail-label">Work authorization</div>
            <div className="cp-detail-value">{cand.work_authorization}</div>
          </div>
        )}
        {cand.linkedin_url && (
          <div className="cp-detail">
            <div className="cp-detail-label">LinkedIn</div>
            <div className="cp-detail-value">
              <a href={cand.linkedin_url} target="_blank" rel="noreferrer" style={{ color: "var(--accent)", display: "inline-flex", alignItems: "center", gap: 4 }}>
                <Linkedin style={{ width: 12, height: 12 }} /> View profile
              </a>
            </div>
          </div>
        )}
      </div>

      {!!sub.interviews?.length && (
        <div className="cp-history">
          {sub.interviews.map(iv => (
            <div key={iv.interview_id} className="cp-history-item">
              <CalendarClock className="cp-history-icon" />
              <span>
                Interview {iv.status === "requested" ? "requested — awaiting scheduling" : iv.status}
                {iv.scheduled_at ? ` for ${new Date(iv.scheduled_at).toLocaleString()}` : ""}
                {iv.meeting_link ? " · link will be shared" : ""}
              </span>
            </div>
          ))}
        </div>
      )}

      {!!sub.feedback?.length && (
        <div className="cp-history">
          {sub.feedback.map(fb => (
            <div key={fb.id} className="cp-history-item">
              <MessageSquare className="cp-history-icon" />
              <span>"{fb.feedback_text}" <span style={{ color: "var(--faint)" }}>· {relTime(fb.created_at)}</span></span>
            </div>
          ))}
        </div>
      )}

      {canAct && (
        <div className="cp-actions">
          {sub.pipeline_stage !== "shortlisted" && (
            <button className="cp-btn cp-btn-primary" onClick={onShortlist}>
              <ThumbsUp style={{ width: 14, height: 14 }} /> Shortlist
            </button>
          )}
          <button className="cp-btn" onClick={onOpenInterview}>
            <CalendarClock style={{ width: 14, height: 14 }} /> Request interview
          </button>
          <button className="cp-btn" onClick={onOpenFeedback}>
            <MessageSquare style={{ width: 14, height: 14 }} /> Leave feedback
          </button>
          <button className="cp-btn cp-btn-bad" onClick={onOpenReject}>
            <ThumbsDown style={{ width: 14, height: 14 }} /> Pass on candidate
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Action modal ───────────────────────────────────────────────────────────

function ActionModal({ type, error, prefersReducedMotion, onClose, onSubmitReject, onSubmitInterview, onSubmitFeedback }: {
  type: "reject" | "interview" | "feedback";
  error: string | null;
  prefersReducedMotion: boolean;
  onClose: () => void;
  onSubmitReject: (reason: RejectionReason, notes: string) => Promise<void>;
  onSubmitInterview: (message: string, preferredTimes: string) => Promise<void>;
  onSubmitFeedback: (text: string, sentiment: "positive" | "mixed" | "negative" | null) => Promise<void>;
}) {
  const [reason, setReason] = useState<RejectionReason>("client_rejected");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("");
  const [preferredTimes, setPreferredTimes] = useState("");
  const [feedbackText, setFeedbackText] = useState("");
  const [sentiment, setSentiment] = useState<"positive" | "mixed" | "negative" | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const titles = { reject: "Pass on this candidate", interview: "Request an interview", feedback: "Leave feedback" };

  const handleSubmit = async () => {
    setLocalError(null);
    if (type === "feedback" && !feedbackText.trim()) { setLocalError("Please add a comment before sending."); return; }
    setSubmitting(true);
    try {
      if (type === "reject") await onSubmitReject(reason, notes);
      else if (type === "interview") await onSubmitInterview(message, preferredTimes);
      else await onSubmitFeedback(feedbackText, sentiment);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      className="cp-modal-backdrop"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      onClick={onClose}
    >
      <motion.div
        className="cp-modal"
        onClick={e => e.stopPropagation()}
        initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 }}
        animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
        exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 }}
        transition={prefersReducedMotion ? { duration: 0.15 } : { type: "spring", bounce: 0, duration: 0.35 }}
      >
        <div className="cp-modal-head">
          <span className="cp-modal-title">{titles[type]}</span>
          <button className="cp-modal-close" onClick={onClose}><X style={{ width: 18, height: 18 }} /></button>
        </div>

        {(error || localError) && <div className="cp-modal-error">{error ?? localError}</div>}

        {type === "reject" && (
          <>
            <div className="cp-field">
              <label>Reason</label>
              <select className="cp-select" value={reason} onChange={e => setReason(e.target.value as RejectionReason)}>
                {REJECTION_REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div className="cp-field">
              <label>Notes (optional)</label>
              <textarea className="cp-textarea" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Anything the recruiting team should know..." />
            </div>
          </>
        )}

        {type === "interview" && (
          <>
            <div className="cp-field">
              <label>Message (optional)</label>
              <textarea className="cp-textarea" value={message} onChange={e => setMessage(e.target.value)} placeholder="What would you like the recruiting team to know?" />
            </div>
            <div className="cp-field">
              <label>Preferred times (optional)</label>
              <input className="cp-input" value={preferredTimes} onChange={e => setPreferredTimes(e.target.value)} placeholder="e.g. Weekday afternoons, next week" />
            </div>
          </>
        )}

        {type === "feedback" && (
          <>
            <div className="cp-field">
              <label>How do you feel about this candidate?</label>
              <div className="cp-sentiment-row">
                <button type="button" className={`cp-sentiment-btn ${sentiment === "positive" ? "active-positive" : ""}`} onClick={() => setSentiment(sentiment === "positive" ? null : "positive")}>Positive</button>
                <button type="button" className={`cp-sentiment-btn ${sentiment === "mixed" ? "active-mixed" : ""}`} onClick={() => setSentiment(sentiment === "mixed" ? null : "mixed")}>Mixed</button>
                <button type="button" className={`cp-sentiment-btn ${sentiment === "negative" ? "active-negative" : ""}`} onClick={() => setSentiment(sentiment === "negative" ? null : "negative")}>Negative</button>
              </div>
            </div>
            <div className="cp-field">
              <label>Comment</label>
              <textarea className="cp-textarea" value={feedbackText} onChange={e => setFeedbackText(e.target.value)} placeholder="Share your thoughts on this candidate..." />
            </div>
          </>
        )}

        <button className="cp-btn cp-btn-primary" style={{ width: "100%", justifyContent: "center", marginTop: 4 }} onClick={handleSubmit} disabled={submitting}>
          {submitting ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> : "Send"}
        </button>
      </motion.div>
    </motion.div>
  );
}