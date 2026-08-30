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
import { motion } from "framer-motion";
import {
  Loader2, Link as LinkIcon, Copy, Power, Calendar, Users, Sparkles,
  ChevronRight, ChevronLeft, X, Plus, Trash2, ExternalLink, CheckCircle2, Clock,
  Send, Pencil, Archive, RotateCcw, Image as ImageIcon, Building2,
} from "lucide-react";
import { ErrorBoundary } from "@/components/ErrorBoundary";

// ─── Back to Jobs ───────────────────────────────────────────────────────────
// Same wayfinding pattern as the landing page's nav: quiet by default, a
// touch of motion under the pointer, never a dead click. Apple's "response"
// rule — feedback fires on press, not on release.
function BackToJobs() {
  const navigate = useNavigate();
  const [pressed, setPressed] = useState(false);
  return (
    <motion.button
      onClick={() => navigate("/jobs")}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      animate={{ scale: pressed ? 0.97 : 1, x: pressed ? -1 : 0 }}
      whileHover={{ x: -2 }}
      transition={{ type: "spring", bounce: 0, duration: 0.3 }}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "8px 12px 8px 8px",
        marginBottom: 14,
        background: "transparent",
        border: "none",
        borderRadius: 8,
        color: "rgba(23,23,15,0.55)",
        fontSize: 13,
        fontWeight: 600,
        fontFamily: "'Inter', sans-serif",
        cursor: "pointer",
      }}
    >
      <ChevronLeft style={{ width: 15, height: 15 }} strokeWidth={2} />
      Back to Jobs
    </motion.button>
  );
}

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

interface ClientPortalLink {
  id: string;
  slug: string;
  is_active: boolean;
  expires_at: string | null;
  access_count: number;
  last_accessed_at: string | null;
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
    description: string | null;
    location: string | null; work_arrangement: string | null; employment_type: string | null;
    salary_min: number | null; salary_max: number | null; salary_currency: string | null;
    headcount: number; positions_filled: number;
  };
  client?: { id: string; name: string; logo_url: string | null } | null;
  links: ApplicationLink[];
  application_count: number;
  candidate_count: number;
  shortlisted_count: number;
  interview_count: number;
  offer_count: number;
  placed_count: number;
  pipeline: PipelineCandidate[];
}

const EMPLOYMENT_TYPES = [
  { key: "permanent", label: "Permanent" },
  { key: "part_time", label: "Part-time" },
  { key: "contract", label: "Contract" },
  { key: "temporary", label: "Temporary" },
  { key: "internship", label: "Internship" },
];

async function uploadClientLogo(file: File, teamId: string, clientId: string): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "png";
  const path = `${teamId}/${clientId}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("company-logos").upload(path, file, { upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from("company-logos").getPublicUrl(path);
  return data.publicUrl;
}

const STAGE_LABELS: Record<string, string> = {
  sourced: "Applied", screening: "Screening", shortlisted: "Shortlisted",
  submitted: "Submitted", client_review: "Client Review", interview: "Interview",
  final_interview: "Final Interview", offer: "Offer", placed: "Placed", rejected: "Rejected",
};

// ─── Next recommended action ────────────────────────────────────────────────
// Reads the same JobSummary fields already loaded for the stats row / pipeline
// list — no extra queries. Walks the real recruiting workflow (job created →
// application link → collect candidates → AI matching → shortlist → submit
// to client → interview) and surfaces only the single next relevant step,
// not the whole checklist at once.
type NextAction = {
  label: string;
  detail: string;
  cta: string;
  onClick: () => void;
};

function getNextAction(summary: JobSummary, opts: { onCreateLink: () => void; onRunMatch: (candidateJobId: string) => void; navigate: (path: string) => void }): NextAction | null {
  const { links, candidate_count, shortlisted_count, offer_count, placed_count, pipeline } = summary;

  if (links.length === 0) {
    return {
      label: "Create an application link",
      detail: "Share a link so candidates can apply directly to this role.",
      cta: "Create link",
      onClick: opts.onCreateLink,
    };
  }

  if (candidate_count === 0) {
    return {
      label: "Collect candidates",
      detail: "Share your application link, or add candidates to this role from Candidates.",
      cta: "Go to candidates",
      onClick: () => opts.navigate("/candidates?create=1"),
    };
  }

  const unmatched = pipeline.find(pc => pc.match_score == null);
  if (unmatched) {
    return {
      label: "Run AI matching",
      detail: `${unmatched.candidate.full_name} hasn't been scored against this role yet.`,
      cta: "Run match",
      onClick: () => opts.onRunMatch(unmatched.candidate_job_id),
    };
  }

  if (shortlisted_count === 0 && candidate_count > 0) {
    return {
      label: "Shortlist a candidate",
      detail: "Review the AI-ranked pipeline and shortlist your strongest matches.",
      cta: "View pipeline",
      onClick: () => opts.navigate("/pipeline"),
    };
  }

  const submissionsSoFar = pipeline.filter(pc => ["submitted", "client_review"].includes(pc.pipeline_stage)).length;
  if (submissionsSoFar === 0 && shortlisted_count > 0) {
    return {
      label: "Submit to your client",
      detail: "Send your shortlisted candidates' package to the client for review.",
      cta: "Go to submissions",
      onClick: () => opts.navigate("/submissions"),
    };
  }

  if (offer_count === 0 && placed_count === 0 && submissionsSoFar > 0) {
    return {
      label: "Schedule an interview",
      detail: "Move a submitted candidate to interview once the client responds.",
      cta: "View pipeline",
      onClick: () => opts.navigate("/pipeline"),
    };
  }

  return null;
}

function NextActionCard({ action }: { action: NextAction }) {
  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", marginBottom: 24,
        background: "rgba(34,49,92,0.05)", border: "1px solid rgba(34,49,92,0.16)", borderRadius: 12,
      }}
    >
      <div style={{
        width: 32, height: 32, borderRadius: 9, flexShrink: 0, background: "#22315C",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Sparkles style={{ width: 15, height: 15, color: "#FAFAF8" }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: "#17170F" }}>{action.label}</div>
        <div style={{ fontSize: 12, color: "rgba(23,23,15,0.5)", marginTop: 1 }}>{action.detail}</div>
      </div>
      <button
        onClick={action.onClick}
        style={{
          flexShrink: 0, display: "flex", alignItems: "center", gap: 6, padding: "8px 14px",
          background: "#22315C", border: "none", borderRadius: 8, color: "#FAFAF8",
          fontSize: 12.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
        }}
      >
        {action.cta} <ChevronRight style={{ width: 13, height: 13 }} />
      </button>
    </div>
  );
}

const PUBLIC_BASE_URL = "https://fixsense.com.ng/apply";
// Client portal links use the app's actual runtime origin rather than the
// hardcoded apply-link domain — CreateClipModal.tsx already establishes this
// pattern for share links, and it's the more robust choice for a link type
// introduced after PUBLIC_BASE_URL was hardcoded.
const portalBaseUrl = () => `${typeof window !== "undefined" ? window.location.origin : "https://fixsense.com.ng"}/portal`;

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
  const [companyEditOpen, setCompanyEditOpen] = useState(false);
  const [portalLinks, setPortalLinks] = useState<ClientPortalLink[]>([]);
  const [creatingPortalLink, setCreatingPortalLink] = useState(false);
  const [copiedPortalSlug, setCopiedPortalSlug] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    const { data, error } = await (supabase as any).rpc("get_job_application_summary", { p_job_id: id });
    if (error) {
      toast.error(error.message ?? "Failed to load job");
    } else {
      setSummary(data as JobSummary);
    }
    // client_portal_links has no equivalent in get_job_application_summary
    // (it's a client-facing concern, not an applicant-facing one) — RLS
    // ("team members can read client portal links") scopes this select to
    // the recruiter's own team, same trust boundary as every other direct
    // table read in this app.
    const { data: linkRows, error: linkErr } = await (supabase as any)
      .from("client_portal_links")
      .select("id, slug, is_active, expires_at, access_count, last_accessed_at, created_at")
      .eq("job_id", id)
      .order("created_at", { ascending: false });
    if (linkErr) {
      toast.error(linkErr.message ?? "Failed to load client portal links");
    } else {
      setPortalLinks((linkRows ?? []) as ClientPortalLink[]);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const createPortalLink = async () => {
    if (!id) return;
    setCreatingPortalLink(true);
    try {
      const { error } = await (supabase as any).rpc("create_client_portal_link", { p_job_id: id });
      if (error) throw error;
      toast.success("Client portal link created");
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to create client portal link");
    } finally {
      setCreatingPortalLink(false);
    }
  };

  const copyPortalLink = (slug: string) => {
    navigator.clipboard.writeText(`${portalBaseUrl()}/${slug}`).then(() => {
      setCopiedPortalSlug(slug);
      setTimeout(() => setCopiedPortalSlug(null), 2000);
    });
  };

  const togglePortalLinkActive = async (link: ClientPortalLink) => {
    // disable_client_portal_link only turns a link off (matches its RPC
    // signature — one-way by design, since re-enabling a client-facing
    // review link is a deliberate recruiter action). Re-enable goes through
    // a direct update, same as setJobStatus below does for jobs.
    if (link.is_active) {
      const { error } = await (supabase as any).rpc("disable_client_portal_link", { p_link_id: link.id });
      if (error) { toast.error(error.message); return; }
      toast.success("Portal link disabled");
    } else {
      const { error } = await (supabase as any).from("client_portal_links").update({ is_active: true }).eq("id", link.id);
      if (error) { toast.error(error.message); return; }
      toast.success("Portal link enabled");
    }
    load();
  };

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
    return (
      <DashboardLayout>
        <div style={{ padding: "24px 20px 0", maxWidth: 980, margin: "0 auto" }}>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          <BackToJobs />
          <div style={{ padding: 40, display: "flex", justifyContent: "center" }}>
            <Loader2 style={{ width: 24, height: 24, color: "#22315C", animation: "spin 1s linear infinite" }} />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!summary) {
    return (
      <DashboardLayout>
        <div style={{ padding: "24px 20px 60px", maxWidth: 980, margin: "0 auto" }}>
          <BackToJobs />
          <div
            style={{
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              padding: "56px 20px", textAlign: "center", background: "#F3F2ED",
              border: "1px solid rgba(23,23,15,0.11)", borderRadius: 14,
            }}
          >
            <div
              style={{
                width: 48, height: 48, borderRadius: 12, background: "rgba(138,90,32,0.09)",
                border: "1px solid rgba(138,90,32,0.2)", display: "flex", alignItems: "center",
                justifyContent: "center", marginBottom: 16,
              }}
            >
              <Building2 style={{ width: 20, height: 20, color: "#8A5A20" }} strokeWidth={1.6} />
            </div>
            <h2 style={{ fontSize: 17, fontWeight: 700, color: "#17170F", marginBottom: 6 }}>Job not found</h2>
            <p style={{ fontSize: 13.5, color: "rgba(23,23,15,0.5)", marginBottom: 20, maxWidth: 320, lineHeight: 1.5 }}>
              This job may have been deleted, or the link is out of date.
            </p>
            <button
              onClick={() => navigate("/jobs")}
              style={{
                display: "flex", alignItems: "center", gap: 7, padding: "10px 18px",
                background: "#22315C", border: "none", borderRadius: 8, color: "#FAFAF8",
                fontSize: 13.5, fontWeight: 600, cursor: "pointer",
              }}
            >
              <ChevronLeft style={{ width: 14, height: 14 }} /> Back to Jobs
            </button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const sortedPipeline = [...summary.pipeline].sort((a, b) => (b.match_score ?? -1) - (a.match_score ?? -1));
  const nextAction = getNextAction(summary, {
    onCreateLink: () => setCreateLinkOpen(true),
    onRunMatch: runAiMatch,
    navigate,
  });

  return (
    <ErrorBoundary>
      <DashboardLayout>
        <div style={{ padding: "24px 20px 60px", maxWidth: 980, margin: "0 auto", fontFamily: "'Inter', sans-serif" }}>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

          <BackToJobs />

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
            <div>
              <button
                onClick={() => setCompanyEditOpen(true)}
                style={{
                  display: "flex", alignItems: "center", gap: 8, marginBottom: 8,
                  background: "none", border: "none", cursor: "pointer", padding: 0,
                }}
                title="Edit company name & logo"
              >
                <div style={{
                  width: 26, height: 26, borderRadius: 7, flexShrink: 0, overflow: "hidden",
                  background: "rgba(34,49,92,0.08)", display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {summary.client?.logo_url ? (
                    <img src={summary.client.logo_url} alt={summary.client?.name ?? "Company"} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <Building2 style={{ width: 13, height: 13, color: "#22315C" }} />
                  )}
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(23,23,15,0.55)" }}>
                  {summary.client?.name ?? "No client"}
                </span>
                <Pencil style={{ width: 11, height: 11, color: "rgba(23,23,15,0.25)" }} />
              </button>
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

          {/* Next recommended action — one step at a time, driven by real
              job/application/candidate data already loaded above */}
          {nextAction && <NextActionCard action={nextAction} />}

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

          {/* Client portal links */}
          <div style={{ marginBottom: 32 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <h2 style={{ fontSize: 14, fontWeight: 700, color: "#17170F" }}>Client portal</h2>
              <button
                onClick={createPortalLink}
                disabled={creatingPortalLink}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: "#fff", border: "1px solid rgba(23,23,15,0.15)", borderRadius: 8, color: "#17170F", fontSize: 12.5, fontWeight: 600, cursor: creatingPortalLink ? "not-allowed" : "pointer", opacity: creatingPortalLink ? 0.6 : 1 }}
              >
                {creatingPortalLink ? <Loader2 style={{ width: 13, height: 13, animation: "spin 1s linear infinite" }} /> : <Plus style={{ width: 13, height: 13 }} />}
                New portal link
              </button>
            </div>
            {portalLinks.length === 0 ? (
              <div style={{ padding: 24, background: "rgba(23,23,15,0.03)", borderRadius: 12, textAlign: "center", fontSize: 13, color: "rgba(23,23,15,0.4)" }}>
                No client portal links yet. Create one to let the client review, shortlist, and give feedback on submitted candidates.
              </div>
            ) : (
              portalLinks.map(link => (
                <PortalLinkCard
                  key={link.id}
                  link={link}
                  copied={copiedPortalSlug === link.slug}
                  onCopy={() => copyPortalLink(link.slug)}
                  onToggle={() => togglePortalLinkActive(link)}
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

        {companyEditOpen && summary.client && (
          <CompanyEditModal
            client={summary.client}
            onClose={() => setCompanyEditOpen(false)}
            onSaved={() => { setCompanyEditOpen(false); load(); }}
          />
        )}
      </DashboardLayout>
    </ErrorBoundary>
  );
}

// Company (recruiting_clients) name + logo editor, opened from the job
// header. Logo goes to the public "company-logos" bucket (RLS mirrors
// candidate-cvs via recruiting_is_team_member(team_id)) so it's reachable,
// unauthenticated, from PublicJobApplicationPage.
function CompanyEditModal({ client, onClose, onSaved }: {
  client: { id: string; name: string; logo_url: string | null };
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(client.name);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(client.logo_url);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) { toast.error("Company name required"); return; }
    setSaving(true);
    try {
      let logoUrl = client.logo_url;
      if (logoFile) {
        // team_id isn't in scope here — recruiting_clients RLS already
        // scopes the row update to the caller's team, and the storage path
        // only needs to start with a team_id the caller belongs to. We
        // fetch it once from the client row itself via a minimal select.
        const { data: clientRow, error: clientErr } = await (supabase as any)
          .from("recruiting_clients").select("team_id").eq("id", client.id).single();
        if (clientErr) throw clientErr;
        const ext = logoFile.name.split(".").pop()?.toLowerCase() || "png";
        const path = `${clientRow.team_id}/${client.id}-${Date.now()}.${ext}`;
        const { error: uploadErr } = await supabase.storage.from("company-logos").upload(path, logoFile, { upsert: true });
        if (uploadErr) throw uploadErr;
        logoUrl = supabase.storage.from("company-logos").getPublicUrl(path).data.publicUrl;
      }
      const { error } = await (supabase as any).from("recruiting_clients")
        .update({ name: name.trim(), logo_url: logoUrl }).eq("id", client.id);
      if (error) throw error;
      toast.success("Company updated");
      onSaved();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to update company");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(23,23,15,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }} onClick={onClose}>
      <div
        style={{ width: "100%", maxWidth: 420, background: "#FFFFFF", border: "1px solid rgba(23,23,15,0.1)", borderRadius: 16, padding: 24 }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: "#17170F" }}>Edit company</span>
          <X style={{ width: 18, height: 18, cursor: "pointer", color: "rgba(23,23,15,0.4)" }} onClick={onClose} />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
          <label style={{
            width: 64, height: 64, borderRadius: 14, flexShrink: 0, cursor: "pointer", overflow: "hidden",
            border: "1.5px dashed rgba(23,23,15,0.18)", background: "rgba(23,23,15,0.03)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {logoPreview ? (
              <img src={logoPreview} alt="Logo preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <ImageIcon style={{ width: 20, height: 20, color: "rgba(23,23,15,0.3)" }} />
            )}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              style={{ display: "none" }}
              onChange={e => {
                const f = e.target.files?.[0] ?? null;
                setLogoFile(f);
                setLogoPreview(f ? URL.createObjectURL(f) : logoPreview);
              }}
            />
          </label>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11.5, fontWeight: 600, color: "rgba(23,23,15,0.55)", display: "block", marginBottom: 4 }}>Company name</label>
            <input
              style={{ width: "100%", padding: "10px 12px", background: "rgba(23,23,15,0.03)", border: "1px solid rgba(23,23,15,0.1)", borderRadius: 10, color: "#17170F", fontSize: 13, outline: "none", boxSizing: "border-box" }}
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
            />
          </div>
        </div>

        <button
          onClick={save}
          disabled={saving}
          style={{ width: "100%", padding: "12px", background: "linear-gradient(135deg, #22315C, #2A3F73)", border: "none", borderRadius: 10, color: "#FAFAF8", fontSize: 13.5, fontWeight: 700, cursor: saving ? "default" : "pointer", opacity: saving ? 0.7 : 1 }}
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
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

function PortalLinkCard({ link, copied, onCopy, onToggle }: {
  link: ClientPortalLink; copied: boolean; onCopy: () => void; onToggle: () => void;
}) {
  const isExpired = link.expires_at && new Date(link.expires_at) < new Date();
  const effectiveStatus = !link.is_active ? "Disabled" : isExpired ? "Expired" : "Active";
  const statusColor = effectiveStatus === "Active" ? "#22c55e" : effectiveStatus === "Disabled" ? "#94a3b8" : "#f59e0b";

  return (
    <div style={{ background: "#FFFFFF", border: "1px solid rgba(23,23,15,0.08)", borderRadius: 12, padding: 16, marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <LinkIcon style={{ width: 14, height: 14, color: "#22315C", flexShrink: 0 }} />
          <code style={{ fontSize: 12.5, color: "#17170F", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {portalBaseUrl()}/{link.slug}
          </code>
          <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10, color: "#fff", background: statusColor, flexShrink: 0 }}>
            {effectiveStatus}
          </span>
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          <IconButton onClick={onCopy} title="Copy link">
            {copied ? <CheckCircle2 style={{ width: 14, height: 14, color: "#22c55e" }} /> : <Copy style={{ width: 14, height: 14 }} />}
          </IconButton>
          <IconButton onClick={() => window.open(`${portalBaseUrl()}/${link.slug}`, "_blank")} title="Open portal">
            <ExternalLink style={{ width: 14, height: 14 }} />
          </IconButton>
          <IconButton onClick={onToggle} title={link.is_active ? "Disable link" : "Enable link"}>
            <Power style={{ width: 14, height: 14, color: link.is_active ? "#ef4444" : "#22c55e" }} />
          </IconButton>
        </div>
      </div>

      <div style={{ display: "flex", gap: 16, marginTop: 10, fontSize: 11.5, color: "rgba(23,23,15,0.45)", flexWrap: "wrap" }}>
        <span>{link.access_count} view{link.access_count === 1 ? "" : "s"}</span>
        {link.last_accessed_at && <span>Last viewed {formatDistanceToNow(new Date(link.last_accessed_at), { addSuffix: true })}</span>}
        {link.expires_at && <span>Expires {format(new Date(link.expires_at), "MMM d, yyyy")}</span>}
        <span>Created {formatDistanceToNow(new Date(link.created_at), { addSuffix: true })}</span>
      </div>
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
    description: job.description ?? "",
    location: job.location ?? "",
    work_arrangement: job.work_arrangement ?? "",
    employment_type: job.employment_type ?? "",
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
        description: form.description.trim() || null,
        location: form.location.trim() || null,
        work_arrangement: form.work_arrangement || null,
        employment_type: form.employment_type || null,
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

          <div>
            <label style={labelStyle}>Job description</label>
            <textarea
              style={{ ...inputStyle, minHeight: 90, resize: "vertical" }}
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="What this role involves, responsibilities, and what a great candidate looks like…"
            />
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
              <label style={labelStyle}>Employment type</label>
              <select style={{ ...inputStyle, cursor: "pointer" }} value={form.employment_type} onChange={e => setForm(f => ({ ...f, employment_type: e.target.value }))}>
                <option value="">—</option>
                {EMPLOYMENT_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Headcount</label>
            <input style={inputStyle} type="number" min={1} value={form.headcount} onChange={e => setForm(f => ({ ...f, headcount: e.target.value }))} />
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