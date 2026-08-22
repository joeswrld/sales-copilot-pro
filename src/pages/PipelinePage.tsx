/**
 * PipelinePage.tsx — Recruitment Pipeline Kanban
 *
 * Team-scoped board over public.candidate_jobs (RLS via
 * recruiting_is_team_member). Stage moves go through
 * advance_candidate_pipeline_stage() — never a direct table update — so
 * every move is validated, timestamped, and logged to
 * recruiting_timeline_events by the existing tl_pipeline_stage_changed
 * trigger. Placement (drag to "Placed") opens a modal to collect the
 * placement fields Phase 5 requires (salary, currency, fee, notes) before
 * calling the RPC — a candidate is never marked placed without that
 * explicit recruiter input.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { useTeam } from "@/hooks/useTeam";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import {
  Loader2, Filter, X, DollarSign, Briefcase, ChevronLeft, ChevronRight,
} from "lucide-react";
import { ErrorBoundary } from "@/components/ErrorBoundary";

// ─── Types ───────────────────────────────────────────────────────────────────

interface PipelineRow {
  id: string;
  candidate_id: string;
  job_id: string;
  pipeline_stage: string;
  status: string;
  match_score: number | null;
  updated_at: string;
  candidate: { full_name: string; candidate_current_role: string | null } | null;
  job: { title: string; client_id: string | null } | null;
}

interface JobOpt {
  id: string;
  title: string;
}

const STAGES: { key: string; label: string; color: string }[] = [
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

const REJECTION_REASONS = [
  "skills_gap", "salary_mismatch", "location", "availability",
  "client_rejected", "interview_performance", "candidate_withdrew", "other",
];

// ─── Placement modal ─────────────────────────────────────────────────────────

function PlacementModal({ row, onClose, onSubmit }: {
  row: PipelineRow; onClose: () => void; onSubmit: (fields: any) => Promise<void>;
}) {
  const [salary, setSalary] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [fee, setFee] = useState("");
  const [feeCurrency, setFeeCurrency] = useState("USD");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      await onSubmit({
        placement_salary: salary ? Number(salary) : null,
        placement_salary_currency: currency,
        placement_fee: fee ? Number(fee) : null,
        placement_fee_currency: feeCurrency,
        placement_notes: notes || null,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "#FAFAF8", borderRadius: "18px 18px 0 0", padding: 20,
          width: "100%", maxWidth: 480, maxHeight: "85vh", overflowY: "auto",
          fontFamily: "'Inter', sans-serif", boxSizing: "border-box",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: "#17170F", margin: 0 }}>
            Mark {row.candidate?.full_name ?? "candidate"} as Placed
          </h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(23,23,15,0.4)" }}>
            <X style={{ width: 18, height: 18 }} />
          </button>
        </div>
        <p style={{ fontSize: 12, color: "rgba(23,23,15,0.5)", marginBottom: 16 }}>
          This records a confirmed placement. This action is always explicit — never automatic from AI output.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 90px", gap: 8, marginBottom: 10 }}>
          <div>
            <label style={labelStyle}>Placement salary</label>
            <input type="number" value={salary} onChange={e => setSalary(e.target.value)} style={inputStyle} placeholder="85000" />
          </div>
          <div>
            <label style={labelStyle}>Currency</label>
            <select value={currency} onChange={e => setCurrency(e.target.value)} style={inputStyle}>
              <option>USD</option><option>GBP</option><option>EUR</option><option>NGN</option>
            </select>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 90px", gap: 8, marginBottom: 10 }}>
          <div>
            <label style={labelStyle}>Placement fee</label>
            <input type="number" value={fee} onChange={e => setFee(e.target.value)} style={inputStyle} placeholder="17000" />
          </div>
          <div>
            <label style={labelStyle}>Fee currency</label>
            <select value={feeCurrency} onChange={e => setFeeCurrency(e.target.value)} style={inputStyle}>
              <option>USD</option><option>GBP</option><option>EUR</option><option>NGN</option>
            </select>
          </div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Placement notes</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} style={{ ...inputStyle, minHeight: 70, resize: "vertical" }} placeholder="Start date, offer details, etc." />
        </div>

        <button
          onClick={submit}
          disabled={saving}
          style={{ width: "100%", padding: "12px 16px", background: "#22c55e", border: "none", borderRadius: 10, color: "#fff", fontSize: 13.5, fontWeight: 700, cursor: saving ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
        >
          {saving ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> : null}
          Confirm Placement
        </button>
      </div>
    </div>
  );
}

function RejectionModal({ row, onClose, onSubmit }: {
  row: PipelineRow; onClose: () => void; onSubmit: (reason: string, notes: string) => Promise<void>;
}) {
  const [reason, setReason] = useState(REJECTION_REASONS[0]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try { await onSubmit(reason, notes); } finally { setSaving(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#FAFAF8", borderRadius: "18px 18px 0 0", padding: 20, width: "100%", maxWidth: 480, fontFamily: "'Inter', sans-serif", boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: "#17170F", margin: 0 }}>Reject {row.candidate?.full_name ?? "candidate"}</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(23,23,15,0.4)" }}><X style={{ width: 18, height: 18 }} /></button>
        </div>
        <label style={labelStyle}>Reason</label>
        <select value={reason} onChange={e => setReason(e.target.value)} style={{ ...inputStyle, marginBottom: 10 }}>
          {REJECTION_REASONS.map(r => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}
        </select>
        <label style={labelStyle}>Notes</label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} style={{ ...inputStyle, minHeight: 70, resize: "vertical", marginBottom: 16 }} />
        <button onClick={submit} disabled={saving} style={{ width: "100%", padding: "12px 16px", background: "#ef4444", border: "none", borderRadius: 10, color: "#fff", fontSize: 13.5, fontWeight: 700, cursor: saving ? "default" : "pointer" }}>
          {saving ? "Saving…" : "Confirm Rejection"}
        </button>
      </div>
    </div>
  );
}

// ─── Card ────────────────────────────────────────────────────────────────────

function PipelineCard({ row, draggable, onDragStart, onClick }: {
  row: PipelineRow; draggable: boolean; onDragStart: (e: React.DragEvent) => void; onClick: () => void;
}) {
  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onClick={onClick}
      style={{
        background: "#FFFFFF", border: "1px solid rgba(23,23,15,0.08)", borderRadius: 10,
        padding: "10px 12px", marginBottom: 8, cursor: "pointer", fontFamily: "'Inter', sans-serif",
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, color: "#17170F", marginBottom: 3 }}>
        {row.candidate?.full_name ?? "Unknown candidate"}
      </div>
      <div style={{ fontSize: 11, color: "rgba(23,23,15,0.5)", display: "flex", alignItems: "center", gap: 4, marginBottom: row.match_score !== null ? 6 : 0 }}>
        <Briefcase style={{ width: 10, height: 10 }} />
        {row.job?.title ?? "Unknown job"}
      </div>
      {row.match_score !== null && (
        <div style={{
          display: "inline-block", fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 6,
          background: row.match_score >= 70 ? "rgba(34,197,94,0.12)" : "rgba(251,191,36,0.15)",
          color: row.match_score >= 70 ? "#16a34a" : "#b45309",
        }}>
          {row.match_score}% match
        </div>
      )}
    </div>
  );
}

// ─── Column ──────────────────────────────────────────────────────────────────

function Column({ stage, rows, onDrop, onCardClick, mobile }: {
  stage: typeof STAGES[number]; rows: PipelineRow[];
  onDrop: (rowId: string, stage: string) => void;
  onCardClick: (row: PipelineRow) => void;
  mobile: boolean;
}) {
  const [dragOver, setDragOver] = useState(false);
  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => {
        e.preventDefault();
        setDragOver(false);
        const rowId = e.dataTransfer.getData("text/plain");
        if (rowId) onDrop(rowId, stage.key);
      }}
      style={{
        minWidth: mobile ? "82vw" : 240, width: mobile ? "82vw" : 240, flexShrink: 0,
        background: dragOver ? "rgba(96,165,250,0.06)" : "rgba(23,23,15,0.02)",
        border: dragOver ? "1.5px dashed rgba(96,165,250,0.4)" : "1px solid rgba(23,23,15,0.06)",
        borderRadius: 14, padding: 10, display: "flex", flexDirection: "column",
        maxHeight: mobile ? "none" : "calc(100vh - 220px)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10, padding: "0 2px" }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: stage.color, flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: "#17170F" }}>{stage.label}</span>
        <span style={{ fontSize: 11, color: "rgba(23,23,15,0.35)", marginLeft: "auto" }}>{rows.length}</span>
      </div>
      <div style={{ overflowY: "auto", flex: 1 }}>
        {rows.length === 0 ? (
          <p style={{ fontSize: 11, color: "rgba(23,23,15,0.25)", textAlign: "center", padding: "16px 0" }}>Empty</p>
        ) : (
          rows.map(r => (
            <PipelineCard
              key={r.id}
              row={r}
              draggable={stage.key !== "placed" && stage.key !== "rejected"}
              onDragStart={e => e.dataTransfer.setData("text/plain", r.id)}
              onClick={() => onCardClick(r)}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

function PipelinePageInner() {
  const navigate = useNavigate();
  const { teamId } = useTeam();
  const isMobile = useIsMobile();

  const [rows, setRows] = useState<PipelineRow[]>([]);
  const [jobs, setJobs] = useState<JobOpt[]>([]);
  const [jobFilter, setJobFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [placementRow, setPlacementRow] = useState<PipelineRow | null>(null);
  const [rejectionRow, setRejectionRow] = useState<PipelineRow | null>(null);
  const [mobileStageIdx, setMobileStageIdx] = useState(0);

  const load = useCallback(async () => {
    if (!teamId) return;
    setLoading(true);
    try {
      const [cjRes, jobsRes] = await Promise.all([
        (supabase as any)
          .from("candidate_jobs")
          .select("id, candidate_id, job_id, pipeline_stage, status, match_score, updated_at, candidate:candidates(full_name, candidate_current_role), job:jobs(title, client_id)")
          .eq("team_id", teamId)
          .order("updated_at", { ascending: false }),
        (supabase as any).from("jobs").select("id, title").eq("team_id", teamId).order("created_at", { ascending: false }),
      ]);
      if (cjRes.error) throw cjRes.error;
      setRows(cjRes.data ?? []);
      setJobs(jobsRes.data ?? []);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to load pipeline");
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => { load(); }, [load]);

  const filteredRows = useMemo(
    () => (jobFilter ? rows.filter(r => r.job_id === jobFilter) : rows),
    [rows, jobFilter]
  );

  const byStage = useMemo(() => {
    const map: Record<string, PipelineRow[]> = {};
    for (const s of STAGES) map[s.key] = [];
    for (const r of filteredRows) {
      if (!map[r.pipeline_stage]) map[r.pipeline_stage] = [];
      map[r.pipeline_stage].push(r);
    }
    return map;
  }, [filteredRows]);

  const moveStage = async (rowId: string, newStage: string, extra: Record<string, any> = {}) => {
    const row = rows.find(r => r.id === rowId);
    if (!row || row.pipeline_stage === newStage) return;

    if (newStage === "placed") {
      setPlacementRow(row);
      return;
    }
    if (newStage === "rejected") {
      setRejectionRow(row);
      return;
    }

    // optimistic update
    setRows(rs => rs.map(r => r.id === rowId ? { ...r, pipeline_stage: newStage } : r));
    try {
      const { error } = await (supabase as any).rpc("advance_candidate_pipeline_stage", {
        p_candidate_job_id: rowId, p_new_stage: newStage, ...extra,
      });
      if (error) throw error;
      toast.success(`Moved to ${STAGES.find(s => s.key === newStage)?.label ?? newStage}`);
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to move candidate");
      load();
    }
  };

  const confirmPlacement = async (fields: any) => {
    if (!placementRow) return;
    try {
      const { error } = await (supabase as any).rpc("advance_candidate_pipeline_stage", {
        p_candidate_job_id: placementRow.id, p_new_stage: "placed", ...fields,
      });
      if (error) throw error;
      toast.success("Candidate placed 🎉");
      setPlacementRow(null);
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to record placement");
    }
  };

  const confirmRejection = async (reason: string, notes: string) => {
    if (!rejectionRow) return;
    try {
      const { error } = await (supabase as any).rpc("advance_candidate_pipeline_stage", {
        p_candidate_job_id: rejectionRow.id, p_new_stage: "rejected",
        p_rejection_reason: reason, p_rejection_notes: notes || null,
      });
      if (error) throw error;
      toast.success("Candidate rejected");
      setRejectionRow(null);
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to reject candidate");
    }
  };

  const openCandidate = (row: PipelineRow) => navigate(`/candidates/${row.candidate_id}?job=${row.job_id}&cj=${row.id}`);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, fontFamily: "'Inter', sans-serif" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 19, fontWeight: 800, color: "#17170F", margin: 0 }}>Recruitment Pipeline</h1>
          <p style={{ fontSize: 12, color: "rgba(23,23,15,0.45)", margin: "2px 0 0" }}>
            Drag candidates between stages, or tap a card to open the candidate.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Filter style={{ width: 13, height: 13, color: "rgba(23,23,15,0.35)" }} />
          <select
            value={jobFilter}
            onChange={e => setJobFilter(e.target.value)}
            style={{ fontSize: 12, padding: "7px 10px", borderRadius: 8, border: "1px solid rgba(23,23,15,0.12)", background: "#fff", color: "#17170F" }}
          >
            <option value="">All jobs</option>
            {jobs.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
          <Loader2 style={{ width: 22, height: 22, color: "rgba(23,23,15,0.3)", animation: "spin 1s linear infinite" }} />
        </div>
      ) : isMobile ? (
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <button onClick={() => setMobileStageIdx(i => Math.max(0, i - 1))} disabled={mobileStageIdx === 0} style={navBtnStyle(mobileStageIdx === 0)}>
              <ChevronLeft style={{ width: 16, height: 16 }} />
            </button>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#17170F" }}>
              {STAGES[mobileStageIdx].label} ({byStage[STAGES[mobileStageIdx].key]?.length ?? 0})
            </span>
            <button onClick={() => setMobileStageIdx(i => Math.min(STAGES.length - 1, i + 1))} disabled={mobileStageIdx === STAGES.length - 1} style={navBtnStyle(mobileStageIdx === STAGES.length - 1)}>
              <ChevronRight style={{ width: 16, height: 16 }} />
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {(byStage[STAGES[mobileStageIdx].key] ?? []).length === 0 ? (
              <p style={{ fontSize: 12, color: "rgba(23,23,15,0.3)", textAlign: "center", padding: "24px 0" }}>No candidates in this stage.</p>
            ) : (
              byStage[STAGES[mobileStageIdx].key].map(r => (
                <div key={r.id} onClick={() => openCandidate(r)} style={{ background: "#fff", border: "1px solid rgba(23,23,15,0.08)", borderRadius: 12, padding: 14 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#17170F" }}>{r.candidate?.full_name}</div>
                  <div style={{ fontSize: 12, color: "rgba(23,23,15,0.5)", marginTop: 3 }}>{r.job?.title}</div>
                  <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                    {STAGES.filter(s => s.key !== r.pipeline_stage).slice(0, 4).map(s => (
                      <button
                        key={s.key}
                        onClick={ev => { ev.stopPropagation(); moveStage(r.id, s.key); }}
                        style={{ fontSize: 10.5, fontWeight: 600, padding: "5px 9px", borderRadius: 7, border: "1px solid rgba(23,23,15,0.1)", background: "rgba(23,23,15,0.03)", color: "#17170F", cursor: "pointer" }}
                      >
                        → {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 8 }}>
          {STAGES.map(stage => (
            <Column
              key={stage.key}
              stage={stage}
              rows={byStage[stage.key] ?? []}
              onDrop={moveStage}
              onCardClick={openCandidate}
              mobile={false}
            />
          ))}
        </div>
      )}

      {placementRow && (
        <PlacementModal row={placementRow} onClose={() => setPlacementRow(null)} onSubmit={confirmPlacement} />
      )}
      {rejectionRow && (
        <RejectionModal row={rejectionRow} onClose={() => setRejectionRow(null)} onSubmit={confirmRejection} />
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "9px 11px", background: "rgba(23,23,15,0.03)",
  border: "1px solid rgba(23,23,15,0.1)", borderRadius: 8, color: "#17170F",
  fontSize: 13, fontFamily: "'Inter', sans-serif", outline: "none", boxSizing: "border-box",
};
const labelStyle: React.CSSProperties = {
  fontSize: 10.5, fontWeight: 700, color: "rgba(23,23,15,0.4)", marginBottom: 5, display: "block",
  textTransform: "uppercase", letterSpacing: "0.05em",
};
function navBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    width: 30, height: 30, borderRadius: 8, border: "1px solid rgba(23,23,15,0.1)",
    background: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
    color: disabled ? "rgba(23,23,15,0.2)" : "#17170F", cursor: disabled ? "default" : "pointer",
  };
}

export default function PipelinePage() {
  return (
    <DashboardLayout>
      <ErrorBoundary>
        <PipelinePageInner />
      </ErrorBoundary>
    </DashboardLayout>
  );
}