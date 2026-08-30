/**
 * CandidatesPage.tsx — Candidate Intelligence list
 *
 * Team-scoped (public.candidates, RLS via recruiting_is_team_member).
 * Mirrors DealsPage.tsx conventions: inline styles, cream/navy theme,
 * bottom-sheet create modal, mobile-responsive list.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTeam } from "@/hooks/useTeam";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import {
  Plus, Loader2, Search, X, ChevronRight, Users, Building2,
  MapPin, Briefcase, RefreshCw, UserCheck,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Candidate {
  id: string;
  full_name: string;
  email: string | null;
  location: string | null;
  candidate_current_role: string | null;
  current_company: string | null;
  expected_salary: number | null;
  expected_salary_currency: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

// ─── Status config ─────────────────────────────────────────────────────────────

const STATUSES = [
  { key: "active", label: "Active", color: "#22c55e" },
  { key: "passive", label: "Passive", color: "#fbbf24" },
  { key: "placed", label: "Placed", color: "#22315C" },
  { key: "do_not_contact", label: "Do Not Contact", color: "#ef4444" },
  { key: "archived", label: "Archived", color: "#64748b" },
];

function getStatusCfg(status: string) {
  return STATUSES.find(s => s.key === status) ?? { key: status, label: status, color: "#94a3b8" };
}

function formatSalary(value: number | null, currency: string | null) {
  if (!value) return null;
  const symbol = currency === "USD" ? "$" : currency === "EUR" ? "€" : "£";
  if (value >= 1000) return `${symbol}${(value / 1000).toFixed(0)}K`;
  return `${symbol}${value.toLocaleString()}`;
}

// ─── Candidate row ────────────────────────────────────────────────────────────

function CandidateRow({ candidate, onClick }: { candidate: Candidate; onClick: () => void }) {
  const cfg = getStatusCfg(candidate.status);
  return (
    <div
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "13px 14px", cursor: "pointer",
        borderBottom: "1px solid rgba(23,23,15,0.05)",
        transition: "background 0.15s",
        WebkitTapHighlightColor: "transparent",
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = "rgba(23,23,15,0.02)"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
    >
      <div style={{
        width: 36, height: 36, borderRadius: 10, flexShrink: 0,
        background: "rgba(34,49,92,0.08)", display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 13, fontWeight: 700, color: "#22315C", fontFamily: "'Inter', sans-serif",
      }}>
        {candidate.full_name.slice(0, 1).toUpperCase()}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#17170F", marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "'Inter', sans-serif" }}>
          {candidate.full_name}
        </div>
        <div style={{ fontSize: 11.5, color: "rgba(23,23,15,0.4)", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          {candidate.candidate_current_role && (
            <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
              <Briefcase style={{ width: 10, height: 10 }} />{candidate.candidate_current_role}
              {candidate.current_company ? ` · ${candidate.current_company}` : ""}
            </span>
          )}
          {candidate.location && (
            <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
              <MapPin style={{ width: 10, height: 10 }} />{candidate.location}
            </span>
          )}
        </div>
      </div>
      {candidate.expected_salary && (
        <div style={{ fontSize: 12.5, fontWeight: 700, color: "#17170F", flexShrink: 0 }}>
          {formatSalary(candidate.expected_salary, candidate.expected_salary_currency)}
        </div>
      )}
      <div style={{
        fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6, flexShrink: 0,
        background: cfg.color + "18", color: cfg.color, textTransform: "capitalize",
        fontFamily: "'Inter', sans-serif",
      }}>
        {cfg.label}
      </div>
      <ChevronRight style={{ width: 14, height: 14, color: "rgba(23,23,15,0.2)", flexShrink: 0 }} />
    </div>
  );
}

// ─── Create Candidate Modal ─────────────────────────────────────────────────

function CreateCandidateModal({ open, onClose, onCreated, teamId, userId }: {
  open: boolean; onClose: () => void; onCreated: (id: string) => void; teamId: string | null; userId: string | undefined;
}) {
  const [form, setForm] = useState({ full_name: "", email: "", phone: "", location: "", candidate_current_role: "", current_company: "" });
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const handleCreate = async () => {
    if (!form.full_name.trim()) { toast.error("Candidate name required"); return; }
    if (!teamId) { toast.error("No team found"); return; }
    setSaving(true);
    try {
      const { data, error } = await (supabase as any).from("candidates").insert({
        team_id: teamId,
        owner_id: userId,
        full_name: form.full_name.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        location: form.location.trim() || null,
        candidate_current_role: form.candidate_current_role.trim() || null,
        current_company: form.current_company.trim() || null,
        source: "manual",
      }).select("id").single();
      if (error) throw error;
      toast.success("Candidate created");
      onCreated(data.id);
      onClose();
      setForm({ full_name: "", email: "", phone: "", location: "", candidate_current_role: "", current_company: "" });
    } catch (e: any) {
      toast.error(e.message ?? "Failed to create candidate");
    } finally {
      setSaving(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 12px", background: "rgba(23,23,15,0.03)",
    border: "1px solid rgba(23,23,15,0.1)", borderRadius: 10, color: "#17170F",
    fontSize: 13, fontFamily: "'Inter', sans-serif", outline: "none", boxSizing: "border-box",
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, color: "rgba(23,23,15,0.45)", marginBottom: 6, display: "block",
    textTransform: "uppercase", letterSpacing: "0.05em",
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(23,23,15,0.45)", backdropFilter: "blur(12px)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        width: "100%", maxWidth: 480, background: "#FFFFFF", border: "1px solid rgba(23,23,15,0.1)",
        borderRadius: "20px 20px 0 0", padding: "20px 20px calc(20px + env(safe-area-inset-bottom, 0px))",
        boxShadow: "0 -20px 80px -16px rgba(23,23,15,0.35)", maxHeight: "92vh", overflowY: "auto",
      }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: "rgba(23,23,15,0.15)" }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(96,165,250,0.15)", border: "1px solid rgba(96,165,250,0.25)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Plus style={{ width: 16, height: 16, color: "#22315C" }} />
            </div>
            <span style={{ fontSize: 16, fontWeight: 800, color: "#17170F", fontFamily: "'Inter', sans-serif" }}>New Candidate</span>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(23,23,15,0.3)", cursor: "pointer", padding: 8 }}>
            <X style={{ width: 18, height: 18 }} />
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={labelStyle}>Full name</label>
            <input style={inputStyle} value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} placeholder="Jordan Lee" autoFocus />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={labelStyle}>Email</label>
              <input style={inputStyle} value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="jordan@email.com" />
            </div>
            <div>
              <label style={labelStyle}>Phone</label>
              <input style={inputStyle} value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+44 7…" />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Location</label>
            <input style={inputStyle} value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="Manchester, UK" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={labelStyle}>Current role</label>
              <input style={inputStyle} value={form.candidate_current_role} onChange={e => setForm(f => ({ ...f, candidate_current_role: e.target.value }))} placeholder="Senior Engineer" />
            </div>
            <div>
              <label style={labelStyle}>Current company</label>
              <input style={inputStyle} value={form.current_company} onChange={e => setForm(f => ({ ...f, current_company: e.target.value }))} placeholder="Acme Ltd" />
            </div>
          </div>

          <button
            onClick={handleCreate}
            disabled={saving}
            style={{
              marginTop: 6, padding: "12px", background: "linear-gradient(135deg, #22315C, #2A3F73)",
              border: "none", borderRadius: 12, color: "#FAFAF8", fontSize: 14, fontWeight: 700,
              cursor: saving ? "default" : "pointer", opacity: saving ? 0.7 : 1,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              fontFamily: "'Inter', sans-serif",
            }}
          >
            {saving ? <Loader2 style={{ width: 15, height: 15, animation: "spin 1s linear infinite" }} /> : <UserCheck style={{ width: 15, height: 15 }} />}
            {saving ? "Creating…" : "Create candidate"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

export default function CandidatesPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { teamId, teamLoading } = useTeam();
  const [searchParams, setSearchParams] = useSearchParams();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);

  // Deep-link support (?create=1) — used by the onboarding flow's
  // "Add/import candidates" choice and anywhere else that wants to land
  // here with the Add/Import Candidate workflow already open.
  useEffect(() => {
    if (searchParams.get("create") === "1") {
      setCreateOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete("create");
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadCandidates = useCallback(async () => {
    if (!teamId) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await (supabase as any)
        .from("candidates")
        .select("id, full_name, email, location, candidate_current_role, current_company, expected_salary, expected_salary_currency, status, created_at, updated_at")
        .eq("team_id", teamId)
        // Erased candidates (execute_candidate_erasure) are anonymized in
        // place, not row-deleted — pipeline/interview history still points
        // to them — so exclude them here explicitly rather than relying on
        // the caller to have just navigated from an erasure.
        .is("deleted_at", null)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      setCandidates(data ?? []);
    } catch (e: any) {
      setError(e.message ?? "Failed to load candidates");
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    if (teamId) loadCandidates();
  }, [teamId, loadCandidates]);

  // If we just arrived here from erasing a candidate on the detail page,
  // drop it from local state immediately — no waiting on loadCandidates()
  // to re-run, no visible flash of the (already-gone) row. This handles
  // the case where this list was already mounted/cached in memory before
  // the erasure happened. Clear the nav state afterward so a manual
  // refresh or re-visit doesn't try to re-apply it.
  useEffect(() => {
    const erasedId = (location.state as { erasedCandidateId?: string } | null)?.erasedCandidateId;
    if (!erasedId) return;
    setCandidates(cs => cs.filter(c => c.id !== erasedId));
    navigate(location.pathname, { replace: true, state: null });
  }, [location.state, location.pathname, navigate]);

  const filtered = useMemo(() => {
    let list = candidates;
    if (statusFilter !== "all") list = list.filter(c => c.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        c.full_name.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.current_company?.toLowerCase().includes(q) ||
        c.candidate_current_role?.toLowerCase().includes(q) ||
        c.location?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [candidates, search, statusFilter]);

  return (
    <DashboardLayout>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 900, margin: "0 auto", fontFamily: "'Inter', sans-serif" }}>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: "#17170F", margin: 0 }}>Candidates</h1>
            <p style={{ fontSize: 12.5, color: "rgba(23,23,15,0.4)", margin: "3px 0 0" }}>
              {teamLoading ? "Loading…" : `${candidates.length} candidate${candidates.length === 1 ? "" : "s"}`}
            </p>
          </div>
          <button
            onClick={() => setCreateOpen(true)}
            style={{
              display: "flex", alignItems: "center", gap: 8, padding: "10px 16px",
              background: "linear-gradient(135deg, #22315C, #2A3F73)", border: "none", borderRadius: 12,
              color: "#FAFAF8", fontSize: 13, fontWeight: 700, cursor: "pointer",
              boxShadow: "0 8px 24px rgba(59,130,246,0.35)",
            }}
          >
            <Plus style={{ width: 15, height: 15 }} />New Candidate
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: 1, minWidth: 200, maxWidth: 320 }}>
            <Search style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 13, height: 13, color: "rgba(23,23,15,0.25)" }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search candidates…"
              style={{ width: "100%", paddingLeft: 32, paddingRight: search ? 32 : 12, paddingTop: 8, paddingBottom: 8, background: "rgba(23,23,15,0.04)", border: "1px solid rgba(23,23,15,0.07)", borderRadius: 10, color: "#17170F", fontSize: 13, outline: "none", boxSizing: "border-box" }}
            />
            {search && <button onClick={() => setSearch("")} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "rgba(23,23,15,0.3)", cursor: "pointer" }}><X style={{ width: 12, height: 12 }} /></button>}
          </div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {[{ key: "all", label: "All" }, ...STATUSES].map(s => (
              <button
                key={s.key}
                onClick={() => setStatusFilter(s.key)}
                style={{ fontSize: 11, fontWeight: 600, padding: "5px 10px", borderRadius: 8, border: "none", background: statusFilter === s.key ? "rgba(23,23,15,0.12)" : "rgba(23,23,15,0.04)", color: statusFilter === s.key ? "#17170F" : "rgba(23,23,15,0.35)", cursor: "pointer" }}
              >
                {s.label}
              </button>
            ))}
          </div>
          <button onClick={loadCandidates} style={{ marginLeft: "auto", padding: "7px", borderRadius: 8, border: "1px solid rgba(23,23,15,0.07)", background: "rgba(23,23,15,0.03)", color: "rgba(23,23,15,0.4)", cursor: "pointer" }}>
            <RefreshCw style={{ width: 14, height: 14 }} />
          </button>
        </div>

        {loading || teamLoading ? (
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: 200 }}>
            <Loader2 style={{ width: 24, height: 24, color: "#22315C", animation: "spin 1s linear infinite" }} />
          </div>
        ) : error ? (
          <div style={{ textAlign: "center", padding: "48px 20px" }}>
            <p style={{ fontSize: 13, color: "rgba(23,23,15,0.5)", marginBottom: 16 }}>Unable to load candidates.</p>
            <button onClick={loadCandidates} style={{ padding: "9px 18px", background: "rgba(23,23,15,0.06)", border: "none", borderRadius: 10, color: "#17170F", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
              Retry
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px 20px" }}>
            <Users style={{ width: 40, height: 40, margin: "0 auto 14px", opacity: 0.2 }} />
            <div style={{ fontSize: 16, fontWeight: 700, color: "rgba(23,23,15,0.5)", marginBottom: 8 }}>
              {candidates.length === 0 ? "No candidates yet" : "No matches"}
            </div>
            <p style={{ fontSize: 13, color: "rgba(23,23,15,0.35)", marginBottom: 20 }}>
              {candidates.length === 0 ? "Add your first candidate to start building the pipeline." : "Try a different search or filter."}
            </p>
            {candidates.length === 0 && (
              <button onClick={() => setCreateOpen(true)} style={{ padding: "10px 20px", background: "linear-gradient(135deg, #22315C, #2A3F73)", border: "none", borderRadius: 10, color: "#FAFAF8", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                <Plus style={{ width: 14, height: 14, display: "inline", marginRight: 6 }} />Add First Candidate
              </button>
            )}
          </div>
        ) : (
          <div style={{ background: "rgba(23,23,15,0.02)", border: "1px solid rgba(23,23,15,0.06)", borderRadius: 14, overflow: "hidden" }}>
            {filtered.map(c => (
              <CandidateRow key={c.id} candidate={c} onClick={() => navigate(`/candidates/${c.id}`)} />
            ))}
          </div>
        )}
      </div>

      <CreateCandidateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={id => navigate(`/candidates/${id}`)}
        teamId={teamId}
        userId={user?.id}
      />
    </DashboardLayout>
  );
}