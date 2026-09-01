/**
 * CrmPage.tsx — Recruitment CRM (replaces the old sales Deals page)
 *
 * This is the converted "Deals -> CRM" page called for in the Fixsense
 * recruitment upgrade. It does NOT use the sales `deals` table — that model
 * (contact_name/contact_email/sentiment/call_count) is a different entity
 * and stays untouched at /deals until this page is confirmed working.
 *
 * Data model reused as-is (no new tables):
 *   recruiting_clients -> client_contacts -> jobs -> candidate_jobs
 *   -> interviews / client_feedback / client_updates -> recruiting_timeline_events
 *
 * Two new SECURITY DEFINER RPCs were added (recruiting_crm_client_rollup migration)
 * because no existing function aggregated a client's full pipeline:
 *   - list_recruiting_clients_with_stats(p_team_id)  -> CRM index list
 *   - get_recruiting_client_with_pipeline(p_client_id) -> CRM company drawer
 *
 * Mirrors CandidatesPage.tsx / DealsPage.tsx conventions: inline styles,
 * cream/navy theme, bottom-sheet create modal, mobile-responsive list.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTeam } from "@/hooks/useTeam";
import { toast } from "sonner";
import { formatDistanceToNow, format } from "date-fns";
import {
  Plus, Loader2, Search, X, ChevronRight, Building2, Users, Briefcase,
  Calendar, DollarSign, RefreshCw, Mail, Phone as PhoneIcon, Star,
  MessageSquare, TrendingUp, CheckCircle2, Clock, ExternalLink, Globe,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ClientListItem {
  id: string;
  name: string;
  industry: string | null;
  website: string | null;
  logo_url: string | null;
  company_size: string | null;
  headquarters_location: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  open_jobs_count: number;
  candidates_count: number;
  placements_count: number;
  total_fees_by_currency: Record<string, number>;
  last_activity_at: string | null;
}

interface ClientDetail {
  client: {
    id: string; name: string; industry: string | null; website: string | null;
    company_size: string | null; headquarters_location: string | null;
    status: string; billing_notes: string | null; general_notes: string | null;
    created_at: string; updated_at: string;
  };
  contacts: Array<{
    id: string; full_name: string; job_title: string | null; email: string | null;
    phone: string | null; is_hiring_manager: boolean; is_primary_contact: boolean;
  }>;
  jobs: Array<{
    id: string; title: string; status: string; headcount: number; positions_filled: number;
    location: string | null; salary_min: number | null; salary_max: number | null; salary_currency: string | null;
    candidate_count: number; submitted_count: number; interview_count: number; offer_count: number; placement_count: number;
    created_at: string;
  }>;
  candidates: Array<{
    candidate_job_id: string; pipeline_stage: string; status: string; match_score: number | null;
    submission_date: string | null; placed_at: string | null;
    placement_salary: number | null; placement_salary_currency: string | null;
    placement_fee: number | null; placement_fee_currency: string | null;
    guarantee_status: string | null;
    candidate: { id: string; full_name: string; email: string | null; candidate_current_role: string | null; location: string | null };
    job: { id: string; title: string };
    latest_feedback: { feedback_text: string; sentiment: string | null; created_at: string } | null;
  }>;
  timeline: Array<{ source: string; event_type: string; title: string; description: string | null; occurred_at: string }>;
  revenue: { placement_count: number; total_fees_by_currency: Record<string, number> };
}

// ─── Status config ─────────────────────────────────────────────────────────

const CLIENT_STATUSES = [
  { key: "active", label: "Active", color: "#22c55e" },
  { key: "prospect", label: "Prospect", color: "#60a5fa" },
  { key: "on_hold", label: "On Hold", color: "#fbbf24" },
  { key: "inactive", label: "Inactive", color: "#94a3b8" },
];

function getClientStatusCfg(status: string) {
  return CLIENT_STATUSES.find(s => s.key === status) ?? { key: status, label: status || "Prospect", color: "#94a3b8" };
}

const PIPELINE_STAGE_LABELS: Record<string, { label: string; color: string }> = {
  sourced: { label: "Sourced", color: "#94a3b8" },
  screening: { label: "Screening", color: "#60a5fa" },
  submitted: { label: "Submitted", color: "#a78bfa" },
  client_review: { label: "Client Review", color: "#fbbf24" },
  interview: { label: "Interview", color: "#fb923c" },
  offer: { label: "Offer", color: "#34d399" },
  placed: { label: "Placed", color: "#22c55e" },
  rejected: { label: "Rejected", color: "#ef4444" },
  withdrawn: { label: "Withdrawn", color: "#64748b" },
};

function getStageCfg(stage: string) {
  return PIPELINE_STAGE_LABELS[stage] ?? { label: stage, color: "#94a3b8" };
}

function formatMoney(value: number | null | undefined, currency: string | null | undefined) {
  if (!value) return null;
  const symbol = currency === "USD" ? "$" : currency === "GBP" ? "£" : currency === "EUR" ? "€" : "₦";
  if (value >= 1_000_000) return `${symbol}${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1000) return `${symbol}${(value / 1000).toFixed(0)}K`;
  return `${symbol}${value.toLocaleString()}`;
}

// Formats a { currency: amount } map as "$500 + £19K" etc. Clients can earn
// fees in more than one currency, so totals are never collapsed into a
// single number — each currency is shown with its own amount.
function formatFeesByCurrency(byCurrency: Record<string, number> | null | undefined): string | null {
  if (!byCurrency) return null;
  const entries = Object.entries(byCurrency).filter(([, amt]) => !!amt);
  if (!entries.length) return null;
  return entries.map(([cur, amt]) => formatMoney(amt, cur)).join(" + ");
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 12px", background: "rgba(23,23,15,0.03)",
  border: "1px solid rgba(23,23,15,0.1)", borderRadius: 10, color: "#17170F",
  fontSize: 13, fontFamily: "'Inter', sans-serif", outline: "none", boxSizing: "border-box",
};
const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: "rgba(23,23,15,0.45)", marginBottom: 6, display: "block",
  textTransform: "uppercase", letterSpacing: "0.05em",
};

// ─── Client row (list) ───────────────────────────────────────────────────────

function ClientRow({ client, onClick }: { client: ClientListItem; onClick: () => void }) {
  const cfg = getClientStatusCfg(client.status);
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
        fontSize: 13, fontWeight: 700, color: "#22315C", fontFamily: "'Inter', sans-serif", overflow: "hidden",
      }}>
        {client.logo_url ? (
          <img src={client.logo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          client.name.slice(0, 1).toUpperCase()
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#17170F", marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "'Inter', sans-serif" }}>
          {client.name}
        </div>
        <div style={{ fontSize: 11.5, color: "rgba(23,23,15,0.4)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {client.industry && <span>{client.industry}</span>}
          <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
            <Briefcase style={{ width: 10, height: 10 }} />{client.open_jobs_count} open
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
            <Users style={{ width: 10, height: 10 }} />{client.candidates_count}
          </span>
          {client.placements_count > 0 && (
            <span style={{ display: "flex", alignItems: "center", gap: 3, color: "#22c55e" }}>
              <CheckCircle2 style={{ width: 10, height: 10 }} />{client.placements_count} placed
            </span>
          )}
        </div>
      </div>
      {(() => {
        const feesLabel = formatFeesByCurrency(client.total_fees_by_currency);
        return feesLabel ? (
          <div style={{ fontSize: 12.5, fontWeight: 700, color: "#17170F", flexShrink: 0 }}>
            {feesLabel}
          </div>
        ) : null;
      })()}
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

// ─── Create Client Modal ─────────────────────────────────────────────────────

function CreateClientModal({ open, onClose, onCreated, teamId, userId }: {
  open: boolean; onClose: () => void; onCreated: (id: string) => void; teamId: string | null; userId: string | undefined;
}) {
  const [form, setForm] = useState({ name: "", industry: "", website: "", headquarters_location: "", company_size: "" });
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const handleCreate = async () => {
    if (!form.name.trim()) { toast.error("Company name required"); return; }
    if (!teamId) { toast.error("No team found"); return; }
    setSaving(true);
    try {
      const { data, error } = await (supabase as any).from("recruiting_clients").insert({
        team_id: teamId,
        owner_id: userId,
        name: form.name.trim(),
        industry: form.industry.trim() || null,
        website: form.website.trim() || null,
        headquarters_location: form.headquarters_location.trim() || null,
        company_size: form.company_size.trim() || null,
        status: "prospect",
      }).select("id").single();
      if (error) throw error;
      toast.success("Client added");
      onCreated(data.id);
      onClose();
      setForm({ name: "", industry: "", website: "", headquarters_location: "", company_size: "" });
    } catch (e: any) {
      toast.error(e.message ?? "Failed to create client");
    } finally {
      setSaving(false);
    }
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
              <Building2 style={{ width: 16, height: 16, color: "#22315C" }} />
            </div>
            <span style={{ fontSize: 16, fontWeight: 800, color: "#17170F", fontFamily: "'Inter', sans-serif" }}>New Client</span>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(23,23,15,0.3)", cursor: "pointer", padding: 8 }}>
            <X style={{ width: 18, height: 18 }} />
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={labelStyle}>Company name</label>
            <input style={inputStyle} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Acme Fintech Ltd" autoFocus />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={labelStyle}>Industry</label>
              <input style={inputStyle} value={form.industry} onChange={e => setForm(f => ({ ...f, industry: e.target.value }))} placeholder="Fintech" />
            </div>
            <div>
              <label style={labelStyle}>Company size</label>
              <input style={inputStyle} value={form.company_size} onChange={e => setForm(f => ({ ...f, company_size: e.target.value }))} placeholder="51-200" />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Headquarters</label>
            <input style={inputStyle} value={form.headquarters_location} onChange={e => setForm(f => ({ ...f, headquarters_location: e.target.value }))} placeholder="Lagos, Nigeria" />
          </div>
          <div>
            <label style={labelStyle}>Website</label>
            <input style={inputStyle} value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} placeholder="acme.com" />
          </div>
        </div>

        <button
          onClick={handleCreate}
          disabled={saving}
          style={{
            marginTop: 18, width: "100%", padding: "12px", background: "linear-gradient(135deg, #22315C, #2A3F73)",
            border: "none", borderRadius: 12, color: "#FAFAF8", fontSize: 14, fontWeight: 700,
            cursor: saving ? "default" : "pointer", opacity: saving ? 0.7 : 1,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            fontFamily: "'Inter', sans-serif",
          }}
        >
          {saving ? <Loader2 style={{ width: 15, height: 15, animation: "spin 1s linear infinite" }} /> : <Building2 style={{ width: 15, height: 15 }} />}
          {saving ? "Creating…" : "Add client"}
        </button>
      </div>
    </div>
  );
}

// ─── Client Detail Drawer ────────────────────────────────────────────────────

function SectionHeader({ icon: Icon, title, count }: { icon: React.ElementType; title: string; count?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
      <Icon style={{ width: 13, height: 13, color: "rgba(23,23,15,0.35)" }} />
      <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(23,23,15,0.4)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {title}{count !== undefined ? ` (${count})` : ""}
      </span>
    </div>
  );
}

function ClientDetailDrawer({ clientId, onClose }: { clientId: string; onClose: () => void }) {
  const [detail, setDetail] = useState<ClientDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any).rpc("get_recruiting_client_with_pipeline", { p_client_id: clientId });
      if (error) throw error;
      setDetail(data as ClientDetail);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to load client");
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  const revenueTotal = useMemo(() => {
    if (!detail?.revenue?.total_fees_by_currency) return null;
    const entries = Object.entries(detail.revenue.total_fees_by_currency);
    if (!entries.length) return null;
    return entries.map(([cur, amt]) => formatMoney(amt as number, cur)).join(" + ");
  }, [detail]);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9998, background: "rgba(23,23,15,0.45)", backdropFilter: "blur(8px)", display: "flex", justifyContent: "flex-end" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        width: "100%", maxWidth: 560, height: "100%", background: "#FAFAF8", overflowY: "auto",
        boxShadow: "-20px 0 80px -16px rgba(23,23,15,0.35)", fontFamily: "'Inter', sans-serif",
      }}>
        {loading || !detail ? (
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: 300 }}>
            <Loader2 style={{ width: 24, height: 24, color: "#22315C", animation: "spin 1s linear infinite" }} />
          </div>
        ) : (
          <div style={{ padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
              <div>
                <h2 style={{ fontSize: 19, fontWeight: 800, color: "#17170F", margin: 0 }}>{detail.client.name}</h2>
                <div style={{ fontSize: 12, color: "rgba(23,23,15,0.4)", marginTop: 4, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {detail.client.industry && <span>{detail.client.industry}</span>}
                  {detail.client.headquarters_location && <span>{detail.client.headquarters_location}</span>}
                  {detail.client.website && (
                    <a href={`https://${detail.client.website.replace(/^https?:\/\//, "")}`} target="_blank" rel="noreferrer" style={{ color: "#22315C", display: "flex", alignItems: "center", gap: 3 }}>
                      <Globe style={{ width: 11, height: 11 }} />{detail.client.website}<ExternalLink style={{ width: 9, height: 9 }} />
                    </a>
                  )}
                </div>
              </div>
              <button onClick={onClose} style={{ background: "rgba(23,23,15,0.06)", border: "none", borderRadius: 8, padding: 8, cursor: "pointer" }}>
                <X style={{ width: 16, height: 16, color: "rgba(23,23,15,0.5)" }} />
              </button>
            </div>

            {/* Revenue summary */}
            <div style={{ display: "flex", gap: 10, marginBottom: 22, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 120, background: "#FFFFFF", border: "1px solid rgba(23,23,15,0.06)", borderRadius: 12, padding: "12px 14px" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(23,23,15,0.4)", textTransform: "uppercase", marginBottom: 4 }}>Open Jobs</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: "#17170F" }}>{detail.jobs.filter(j => j.status === "open").length}</div>
              </div>
              <div style={{ flex: 1, minWidth: 120, background: "#FFFFFF", border: "1px solid rgba(23,23,15,0.06)", borderRadius: 12, padding: "12px 14px" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(23,23,15,0.4)", textTransform: "uppercase", marginBottom: 4 }}>Placements</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: "#22c55e" }}>{detail.revenue.placement_count}</div>
              </div>
              <div style={{ flex: 1, minWidth: 120, background: "#FFFFFF", border: "1px solid rgba(23,23,15,0.06)", borderRadius: 12, padding: "12px 14px" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(23,23,15,0.4)", textTransform: "uppercase", marginBottom: 4 }}>Revenue / Fees</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#17170F" }}>{revenueTotal ?? "—"}</div>
              </div>
            </div>

            {/* Contacts */}
            <SectionHeader icon={Users} title="Contacts" count={detail.contacts.length} />
            <div style={{ marginBottom: 20 }}>
              {detail.contacts.length === 0 ? (
                <div style={{ fontSize: 12.5, color: "rgba(23,23,15,0.35)", padding: "8px 0" }}>No decision makers added yet.</div>
              ) : detail.contacts.map(c => (
                <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid rgba(23,23,15,0.05)" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#17170F", display: "flex", alignItems: "center", gap: 6 }}>
                      {c.full_name}
                      {c.is_primary_contact && <Star style={{ width: 11, height: 11, color: "#fbbf24" }} />}
                    </div>
                    <div style={{ fontSize: 11.5, color: "rgba(23,23,15,0.4)" }}>
                      {c.job_title}{c.is_hiring_manager ? " · Hiring Manager" : ""}
                    </div>
                  </div>
                  {c.email && <a href={`mailto:${c.email}`} style={{ color: "#22315C" }}><Mail style={{ width: 14, height: 14 }} /></a>}
                  {c.phone && <a href={`tel:${c.phone}`} style={{ color: "#22315C" }}><PhoneIcon style={{ width: 14, height: 14 }} /></a>}
                </div>
              ))}
            </div>

            {/* Open jobs */}
            <SectionHeader icon={Briefcase} title="Jobs" count={detail.jobs.length} />
            <div style={{ marginBottom: 20 }}>
              {detail.jobs.length === 0 ? (
                <div style={{ fontSize: 12.5, color: "rgba(23,23,15,0.35)", padding: "8px 0" }}>No jobs for this client yet.</div>
              ) : detail.jobs.map(j => (
                <div key={j.id} style={{ background: "#FFFFFF", border: "1px solid rgba(23,23,15,0.06)", borderRadius: 10, padding: "10px 12px", marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#17170F" }}>{j.title}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 6, background: j.status === "open" ? "rgba(34,197,94,0.12)" : "rgba(148,163,184,0.15)", color: j.status === "open" ? "#22c55e" : "#64748b", textTransform: "capitalize" }}>
                      {j.status}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: "rgba(23,23,15,0.4)", display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <span>{j.candidate_count} candidates</span>
                    <span>{j.submitted_count} submitted</span>
                    <span>{j.interview_count} interviews</span>
                    <span>{j.offer_count} offers</span>
                    <span style={{ color: j.placement_count > 0 ? "#22c55e" : undefined }}>{j.placement_count} placed</span>
                    <span>{j.positions_filled}/{j.headcount} filled</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Candidates submitted / pipeline */}
            <SectionHeader icon={Users} title="Candidates Submitted" count={detail.candidates.length} />
            <div style={{ marginBottom: 20 }}>
              {detail.candidates.length === 0 ? (
                <div style={{ fontSize: 12.5, color: "rgba(23,23,15,0.35)", padding: "8px 0" }}>No candidates submitted yet.</div>
              ) : detail.candidates.map(cj => {
                const stage = getStageCfg(cj.pipeline_stage);
                return (
                  <div key={cj.candidate_job_id} style={{ background: "#FFFFFF", border: "1px solid rgba(23,23,15,0.06)", borderRadius: 10, padding: "10px 12px", marginBottom: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#17170F" }}>{cj.candidate.full_name}</div>
                        <div style={{ fontSize: 11, color: "rgba(23,23,15,0.4)" }}>{cj.candidate.candidate_current_role} · for {cj.job.title}</div>
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6, background: stage.color + "18", color: stage.color }}>
                        {stage.label}
                      </span>
                    </div>
                    {cj.match_score !== null && (
                      <div style={{ fontSize: 11, color: "rgba(23,23,15,0.4)", marginTop: 4 }}>Match score: {cj.match_score}%</div>
                    )}
                    {cj.placed_at && cj.guarantee_status === "voided" ? (
                      <div style={{ fontSize: 11, color: "#ef4444", marginTop: 4, fontWeight: 600 }}>
                        Placement fell through — was {formatMoney(cj.placement_salary, cj.placement_salary_currency)} salary
                        {cj.placement_fee ? ` · fee ${formatMoney(cj.placement_fee, cj.placement_fee_currency)} (voided)` : ""}
                      </div>
                    ) : cj.placed_at ? (
                      <div style={{ fontSize: 11, color: "#22c55e", marginTop: 4, fontWeight: 600 }}>
                        Placed {formatMoney(cj.placement_salary, cj.placement_salary_currency)} salary
                        {cj.placement_fee ? ` · fee ${formatMoney(cj.placement_fee, cj.placement_fee_currency)}` : ""}
                      </div>
                    ) : null}
                    {cj.latest_feedback && (
                      <div style={{ fontSize: 11.5, color: "rgba(23,23,15,0.55)", marginTop: 6, borderTop: "1px solid rgba(23,23,15,0.05)", paddingTop: 6, fontStyle: "italic" }}>
                        "{cj.latest_feedback.feedback_text}"
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Communication timeline */}
            <SectionHeader icon={MessageSquare} title="Communication Timeline" />
            <div>
              {detail.timeline.length === 0 ? (
                <div style={{ fontSize: 12.5, color: "rgba(23,23,15,0.35)", padding: "8px 0" }}>No activity yet.</div>
              ) : detail.timeline.slice(0, 30).map((evt, i) => (
                <div key={i} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: "1px solid rgba(23,23,15,0.05)" }}>
                  <div style={{ width: 22, flexShrink: 0, display: "flex", justifyContent: "center", paddingTop: 2 }}>
                    <Clock style={{ width: 12, height: 12, color: "rgba(23,23,15,0.25)" }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: "#17170F" }}>{evt.title}</div>
                    {evt.description && <div style={{ fontSize: 11.5, color: "rgba(23,23,15,0.45)", marginTop: 2 }}>{evt.description}</div>}
                    <div style={{ fontSize: 10.5, color: "rgba(23,23,15,0.3)", marginTop: 2 }}>
                      {formatDistanceToNow(new Date(evt.occurred_at), { addSuffix: true })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

export default function CrmPage() {
  const { user } = useAuth();
  const { teamId, teamLoading } = useTeam();
  const [clients, setClients] = useState<ClientListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);

  const loadClients = useCallback(async () => {
    if (!teamId) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await (supabase as any).rpc("list_recruiting_clients_with_stats", { p_team_id: teamId });
      if (error) throw error;
      setClients((data ?? []) as ClientListItem[]);
    } catch (e: any) {
      setError(e.message ?? "Failed to load clients");
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    if (teamId) loadClients();
  }, [teamId, loadClients]);

  const filtered = useMemo(() => {
    let list = clients;
    if (statusFilter !== "all") list = list.filter(c => c.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.industry?.toLowerCase().includes(q) ||
        c.headquarters_location?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [clients, search, statusFilter]);

  const totals = useMemo(() => {
    const revenueByCurrency: Record<string, number> = {};
    for (const c of clients) {
      for (const [cur, amt] of Object.entries(c.total_fees_by_currency ?? {})) {
        revenueByCurrency[cur] = (revenueByCurrency[cur] ?? 0) + (amt ?? 0);
      }
    }
    return {
      openJobs: clients.reduce((s, c) => s + c.open_jobs_count, 0),
      placements: clients.reduce((s, c) => s + c.placements_count, 0),
      revenueByCurrency,
    };
  }, [clients]);

  const revenueLabel = useMemo(() => formatFeesByCurrency(totals.revenueByCurrency), [totals]);

  return (
    <DashboardLayout>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 900, margin: "0 auto", fontFamily: "'Inter', sans-serif" }}>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: "#17170F", margin: 0 }}>CRM</h1>
            <p style={{ fontSize: 12.5, color: "rgba(23,23,15,0.4)", margin: "3px 0 0" }}>
              {teamLoading ? "Loading…" : `${clients.length} client${clients.length === 1 ? "" : "s"} · ${totals.openJobs} open jobs · ${totals.placements} placements`}
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
            <Plus style={{ width: 15, height: 15 }} />New Client
          </button>
        </div>

        {/* Revenue summary strip */}
        {clients.length > 0 && (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 140, background: "rgba(23,23,15,0.02)", border: "1px solid rgba(23,23,15,0.06)", borderRadius: 12, padding: "10px 14px", display: "flex", alignItems: "center", gap: 8 }}>
              <TrendingUp style={{ width: 14, height: 14, color: "#22315C" }} />
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: "#17170F" }}>{revenueLabel ?? "—"}</div>
                <div style={{ fontSize: 10, color: "rgba(23,23,15,0.4)" }}>Total fees</div>
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 140, background: "rgba(23,23,15,0.02)", border: "1px solid rgba(23,23,15,0.06)", borderRadius: 12, padding: "10px 14px", display: "flex", alignItems: "center", gap: 8 }}>
              <DollarSign style={{ width: 14, height: 14, color: "#22c55e" }} />
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: "#17170F" }}>{totals.placements}</div>
                <div style={{ fontSize: 10, color: "rgba(23,23,15,0.4)" }}>Total placements</div>
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 140, background: "rgba(23,23,15,0.02)", border: "1px solid rgba(23,23,15,0.06)", borderRadius: 12, padding: "10px 14px", display: "flex", alignItems: "center", gap: 8 }}>
              <Calendar style={{ width: 14, height: 14, color: "#fbbf24" }} />
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: "#17170F" }}>{totals.openJobs}</div>
                <div style={{ fontSize: 10, color: "rgba(23,23,15,0.4)" }}>Open jobs</div>
              </div>
            </div>
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: 1, minWidth: 200, maxWidth: 320 }}>
            <Search style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 13, height: 13, color: "rgba(23,23,15,0.25)" }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search clients…"
              style={{ width: "100%", paddingLeft: 32, paddingRight: search ? 32 : 12, paddingTop: 8, paddingBottom: 8, background: "rgba(23,23,15,0.04)", border: "1px solid rgba(23,23,15,0.07)", borderRadius: 10, color: "#17170F", fontSize: 13, outline: "none", boxSizing: "border-box" }}
            />
            {search && <button onClick={() => setSearch("")} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "rgba(23,23,15,0.3)", cursor: "pointer" }}><X style={{ width: 12, height: 12 }} /></button>}
          </div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {[{ key: "all", label: "All" }, ...CLIENT_STATUSES].map(s => (
              <button
                key={s.key}
                onClick={() => setStatusFilter(s.key)}
                style={{ fontSize: 11, fontWeight: 600, padding: "5px 10px", borderRadius: 8, border: "none", background: statusFilter === s.key ? "rgba(23,23,15,0.12)" : "rgba(23,23,15,0.04)", color: statusFilter === s.key ? "#17170F" : "rgba(23,23,15,0.35)", cursor: "pointer" }}
              >
                {s.label}
              </button>
            ))}
          </div>
          <button onClick={loadClients} style={{ marginLeft: "auto", padding: "7px", borderRadius: 8, border: "1px solid rgba(23,23,15,0.07)", background: "rgba(23,23,15,0.03)", color: "rgba(23,23,15,0.4)", cursor: "pointer" }}>
            <RefreshCw style={{ width: 14, height: 14 }} />
          </button>
        </div>

        {loading || teamLoading ? (
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: 200 }}>
            <Loader2 style={{ width: 24, height: 24, color: "#22315C", animation: "spin 1s linear infinite" }} />
          </div>
        ) : error ? (
          <div style={{ textAlign: "center", padding: "48px 20px" }}>
            <p style={{ fontSize: 13, color: "rgba(23,23,15,0.5)", marginBottom: 16 }}>Unable to load clients.</p>
            <button onClick={loadClients} style={{ padding: "9px 18px", background: "rgba(23,23,15,0.06)", border: "none", borderRadius: 10, color: "#17170F", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
              Retry
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px 20px" }}>
            <Building2 style={{ width: 40, height: 40, margin: "0 auto 14px", opacity: 0.2 }} />
            <div style={{ fontSize: 16, fontWeight: 700, color: "rgba(23,23,15,0.5)", marginBottom: 8 }}>
              {clients.length === 0 ? "No clients yet" : "No matches"}
            </div>
            <p style={{ fontSize: 13, color: "rgba(23,23,15,0.35)", marginBottom: 20 }}>
              {clients.length === 0 ? "Add your first client company to start tracking jobs and placements." : "Try a different search or filter."}
            </p>
            {clients.length === 0 && (
              <button onClick={() => setCreateOpen(true)} style={{ padding: "10px 20px", background: "linear-gradient(135deg, #22315C, #2A3F73)", border: "none", borderRadius: 10, color: "#FAFAF8", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                <Plus style={{ width: 14, height: 14, display: "inline", marginRight: 6 }} />Add First Client
              </button>
            )}
          </div>
        ) : (
          <div style={{ background: "rgba(23,23,15,0.02)", border: "1px solid rgba(23,23,15,0.06)", borderRadius: 14, overflow: "hidden" }}>
            {filtered.map(c => (
              <ClientRow key={c.id} client={c} onClick={() => setSelectedClientId(c.id)} />
            ))}
          </div>
        )}
      </div>

      <CreateClientModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={id => { setSelectedClientId(id); loadClients(); }}
        teamId={teamId}
        userId={user?.id}
      />

      {selectedClientId && (
        <ClientDetailDrawer clientId={selectedClientId} onClose={() => { setSelectedClientId(null); loadClients(); }} />
      )}
    </DashboardLayout>
  );
}