/**
 * CandidateDetailPage.tsx — Candidate Intelligence detail
 *
 * Reads/writes public.candidates, candidate_skills, candidate_cv_files,
 * recruiting_calls, ai_extractions, recruiting_timeline_events directly via
 * the Supabase client (RLS via recruiting_is_team_member). AI review actions
 * go through confirm_candidate_ai_extraction / edit_candidate_ai_extraction /
 * reject_candidate_ai_extraction RPCs — never write ai_extractions directly.
 *
 * No Edge Functions: CV parsing status stays "pending" until an external
 * parser is connected in a later phase; nothing here fakes AI output.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { useTeam } from "@/hooks/useTeam";
import { toast } from "sonner";
import { formatDistanceToNow, format } from "date-fns";
import {
  ArrowLeft, Loader2, Mail, Phone, MapPin, Briefcase, Building2,
  DollarSign, Calendar, FileText, Upload, Check, X, Edit3, ChevronDown,
  ChevronUp, Sparkles, Clock, Plus, RefreshCw, AlertCircle, CheckCircle2,
  XCircle, User, Tag,
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
  const { teamId } = useTeam();

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

  const load = useCallback(async () => {
    if (!id || !teamId) return;
    setLoading(true);
    setError(null);
    try {
      const [candRes, skillsRes, cvRes, callsRes, extRes, timelineRes] = await Promise.all([
        (supabase as any).from("candidates").select("*").eq("id", id).single(),
        (supabase as any).from("candidate_skills").select("*").eq("candidate_id", id).order("skill_name"),
        (supabase as any).from("candidate_cv_files").select("id, file_path, file_name, parsing_status, created_at").eq("candidate_id", id).order("created_at", { ascending: false }),
        (supabase as any).from("recruiting_calls").select("id, call_type, title, scheduled_at, occurred_at, status").eq("candidate_id", id).order("created_at", { ascending: false }),
        (supabase as any).from("ai_extractions").select("*").eq("entity_type", "candidate").eq("entity_id", id).order("created_at", { ascending: false }),
        (supabase as any).from("recruiting_timeline_events").select("id, event_type, title, created_at").eq("entity_type", "candidate").eq("entity_id", id).order("created_at", { ascending: false }).limit(20),
      ]);

      if (candRes.error) throw candRes.error;
      setCandidate(candRes.data);
      setSkills(skillsRes.data ?? []);
      setCvFiles(cvRes.data ?? []);
      setCalls(callsRes.data ?? []);
      setExtractions(extRes.data ?? []);
      setTimeline(timelineRes.data ?? []);
    } catch (e: any) {
      setError(e.message ?? "Failed to load candidate");
    } finally {
      setLoading(false);
    }
  }, [id, teamId]);

  useEffect(() => { load(); }, [load]);

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

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(240px, 300px)", gap: 16, alignItems: "start" }}>
        {/* LEFT: main content */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>

          {/* Overview */}
          <Section title="Overview" icon={User} accent="#22315C">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 4 }}>
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
                    <div key={f.id} onClick={() => openCv(f.file_path)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 11px", background: "rgba(23,23,15,0.03)", borderRadius: 9, cursor: "pointer" }}>
                      <FileText style={{ width: 13, height: 13, color: "rgba(23,23,15,0.35)", flexShrink: 0 }} />
                      <span style={{ fontSize: 12.5, color: "#17170F", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.file_name}</span>
                      <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 700, color: st.color, flexShrink: 0 }}>
                        <StIcon style={{ width: 10, height: 10 }} />{st.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </Section>

          {/* Skills */}
          <Section title={`Skills (${skills.length})`} icon={Tag} accent="#22315C">
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
          <div style={{ background: "rgba(23,23,15,0.02)", border: "1px solid rgba(23,23,15,0.06)", borderRadius: 14, padding: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(23,23,15,0.25)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Timeline</div>
              <button onClick={load} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(23,23,15,0.3)", padding: 2 }}>
                <RefreshCw style={{ width: 12, height: 12 }} />
              </button>
            </div>
            {timeline.length === 0 ? (
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
            )}
          </div>
        </div>
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