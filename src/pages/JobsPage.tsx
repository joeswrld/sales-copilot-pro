/**
 * JobsPage.tsx — Job Requisitions list
 *
 * Team-scoped (public.jobs / public.recruiting_clients, RLS via
 * recruiting_is_team_member). Mirrors CandidatesPage.tsx conventions:
 * inline styles, cream/navy theme, bottom-sheet create modal,
 * mobile-responsive list. Creating a job is a direct insert into public.jobs
 * (same pattern CandidatesPage already uses for public.candidates) — this is
 * safe because trg_tl_job_created already fires on any INSERT into jobs
 * regardless of write path, so the timeline event is never skipped.
 *
 * A job must belong to a recruiting_clients row (jobs.client_id is NOT
 * NULL). The modal lets the recruiter pick an existing client or create one
 * inline (direct insert into public.recruiting_clients — same RLS-is-enough
 * reasoning as above; recruiting_clients has no creation-time trigger to
 * skip).
 *
 * This closes the only gap in the recruiting UI: every other entity
 * (candidates, pipeline, submissions, jobs/:id detail) had a list or detail
 * page and a way to create a row; public.jobs had a detail page
 * (JobDetailPage.tsx) but no list and no way to create one, so the only job
 * in the database had to be seeded directly via SQL.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTeam } from "@/hooks/useTeam";
import { toast } from "sonner";
import {
  Plus, Loader2, Search, X, ChevronRight, Briefcase, Building2,
  MapPin, RefreshCw, CheckCircle2, Upload, Image as ImageIcon,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Job {
  id: string;
  title: string;
  location: string | null;
  work_arrangement: string | null;
  employment_type: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  status: string;
  headcount: number;
  positions_filled: number;
  client_id: string;
  created_at: string;
  updated_at: string;
  recruiting_clients?: { name: string } | null;
}

interface ClientOpt {
  id: string;
  name: string;
  logo_url?: string | null;
}

// ─── Employment type config ─────────────────────────────────────────────────

const EMPLOYMENT_TYPES = [
  { key: "permanent", label: "Permanent" },
  { key: "part_time", label: "Part-time" },
  { key: "contract", label: "Contract" },
  { key: "temporary", label: "Temporary" },
  { key: "internship", label: "Internship" },
];

// Logo files land in the public "company-logos" bucket at
// {team_id}/{client_id}-{timestamp}.{ext} — RLS mirrors candidate-cvs
// (recruiting_is_team_member(team_id) on the folder segment), and the
// bucket itself is public so the logo can render on the unauthenticated
// PublicJobApplicationPage without a signed URL.
async function uploadClientLogo(file: File, teamId: string, clientId: string): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "png";
  const path = `${teamId}/${clientId}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("company-logos").upload(path, file, { upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from("company-logos").getPublicUrl(path);
  return data.publicUrl;
}

// ─── Status config ─────────────────────────────────────────────────────────────

const STATUSES = [
  { key: "draft", label: "Draft", color: "#94a3b8" },
  { key: "open", label: "Open", color: "#22c55e" },
  { key: "on_hold", label: "On Hold", color: "#fbbf24" },
  { key: "closed", label: "Closed", color: "#64748b" },
];

function getStatusCfg(status: string) {
  return STATUSES.find(s => s.key === status) ?? { key: status, label: status, color: "#94a3b8" };
}

function formatSalary(min: number | null, max: number | null, currency: string | null) {
  if (!min && !max) return null;
  const symbol = currency === "USD" ? "$" : currency === "EUR" ? "€" : currency === "NGN" ? "₦" : "£";
  const fmt = (v: number) => (v >= 1000 ? `${symbol}${(v / 1000).toFixed(0)}K` : `${symbol}${v.toLocaleString()}`);
  if (min && max) return `${fmt(min)}–${fmt(max)}`;
  return fmt((min ?? max) as number);
}

// ─── Job row ────────────────────────────────────────────────────────────────

function JobRow({ job, onClick }: { job: Job; onClick: () => void }) {
  const cfg = getStatusCfg(job.status);
  const salary = formatSalary(job.salary_min, job.salary_max, job.salary_currency);
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
      }}>
        <Briefcase style={{ width: 15, height: 15, color: "#22315C" }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#17170F", marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "'Inter', sans-serif" }}>
          {job.title}
        </div>
        <div style={{ fontSize: 11.5, color: "rgba(23,23,15,0.4)", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          {job.recruiting_clients?.name && (
            <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
              <Building2 style={{ width: 10, height: 10 }} />{job.recruiting_clients.name}
            </span>
          )}
          {job.location && (
            <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
              <MapPin style={{ width: 10, height: 10 }} />{job.location}
            </span>
          )}
          <span>{job.positions_filled}/{job.headcount} filled</span>
        </div>
      </div>
      {salary && (
        <div style={{ fontSize: 12.5, fontWeight: 700, color: "#17170F", flexShrink: 0 }}>
          {salary}
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

// ─── Create Job Modal ─────────────────────────────────────────────────────────

function CreateJobModal({ open, onClose, onCreated, teamId, userId, clients, onClientCreated }: {
  open: boolean; onClose: () => void; onCreated: (id: string) => void;
  teamId: string | null; userId: string | undefined;
  clients: ClientOpt[]; onClientCreated: (c: ClientOpt) => void;
}) {
  const [form, setForm] = useState({
    title: "", client_id: "", location: "", work_arrangement: "", employment_type: "",
    description: "", salary_min: "", salary_max: "", salary_currency: "GBP", headcount: "1",
  });
  const [newClientMode, setNewClientMode] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newClientLogoFile, setNewClientLogoFile] = useState<File | null>(null);
  const [newClientLogoPreview, setNewClientLogoPreview] = useState<string | null>(null);
  const [savingClient, setSavingClient] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const handleCreateClient = async () => {
    if (!newClientName.trim()) { toast.error("Client name required"); return; }
    if (!teamId || !userId) { toast.error("No team found"); return; }
    setSavingClient(true);
    try {
      const { data, error } = await (supabase as any).from("recruiting_clients").insert({
        team_id: teamId, owner_id: userId, name: newClientName.trim(), status: "active",
      }).select("id, name, logo_url").single();
      if (error) throw error;

      let logoUrl: string | null = null;
      if (newClientLogoFile) {
        try {
          logoUrl = await uploadClientLogo(newClientLogoFile, teamId, data.id);
          const { error: logoErr } = await (supabase as any).from("recruiting_clients")
            .update({ logo_url: logoUrl }).eq("id", data.id);
          if (logoErr) throw logoErr;
        } catch (e: any) {
          toast.error(e.message ?? "Client added, but logo upload failed");
        }
      }

      onClientCreated({ ...data, logo_url: logoUrl ?? data.logo_url });
      setForm(f => ({ ...f, client_id: data.id }));
      setNewClientMode(false);
      setNewClientName("");
      setNewClientLogoFile(null);
      setNewClientLogoPreview(null);
      toast.success("Client added");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to create client");
    } finally {
      setSavingClient(false);
    }
  };

  const handleCreate = async () => {
    if (!form.title.trim()) { toast.error("Job title required"); return; }
    if (!form.client_id) { toast.error("Select or add a client"); return; }
    if (!teamId || !userId) { toast.error("No team found"); return; }
    setSaving(true);
    try {
      const { data, error } = await (supabase as any).from("jobs").insert({
        team_id: teamId,
        client_id: form.client_id,
        owner_id: userId,
        assigned_recruiter_id: userId,
        title: form.title.trim(),
        description: form.description.trim() || null,
        location: form.location.trim() || null,
        work_arrangement: form.work_arrangement || null,
        employment_type: form.employment_type || null,
        salary_min: form.salary_min ? Number(form.salary_min) : null,
        salary_max: form.salary_max ? Number(form.salary_max) : null,
        salary_currency: form.salary_currency,
        headcount: form.headcount ? Number(form.headcount) : 1,
        status: "draft",
      }).select("id").single();
      if (error) throw error;
      toast.success("Job created");
      onCreated(data.id);
      onClose();
      setForm({ title: "", client_id: "", location: "", work_arrangement: "", employment_type: "", description: "", salary_min: "", salary_max: "", salary_currency: "GBP", headcount: "1" });
    } catch (e: any) {
      toast.error(e.message ?? "Failed to create job");
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
              <Briefcase style={{ width: 16, height: 16, color: "#22315C" }} />
            </div>
            <span style={{ fontSize: 16, fontWeight: 800, color: "#17170F", fontFamily: "'Inter', sans-serif" }}>New Job</span>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(23,23,15,0.3)", cursor: "pointer", padding: 8 }}>
            <X style={{ width: 18, height: 18 }} />
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={labelStyle}>Job title</label>
            <input style={inputStyle} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Senior Backend Engineer" autoFocus />
          </div>

          <div>
            <label style={labelStyle}>Client</label>
            {newClientMode ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", gap: 8 }}>
                  <label style={{
                    width: 40, height: 40, borderRadius: 10, flexShrink: 0, cursor: "pointer",
                    border: "1.5px dashed rgba(23,23,15,0.18)", background: "rgba(23,23,15,0.03)",
                    display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
                  }} title="Company logo">
                    {newClientLogoPreview ? (
                      <img src={newClientLogoPreview} alt="Logo preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <ImageIcon style={{ width: 15, height: 15, color: "rgba(23,23,15,0.3)" }} />
                    )}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/svg+xml"
                      style={{ display: "none" }}
                      onChange={e => {
                        const f = e.target.files?.[0] ?? null;
                        setNewClientLogoFile(f);
                        setNewClientLogoPreview(f ? URL.createObjectURL(f) : null);
                      }}
                    />
                  </label>
                  <input style={{ ...inputStyle, flex: 1 }} value={newClientName} onChange={e => setNewClientName(e.target.value)} placeholder="Acme Ltd" autoFocus />
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={handleCreateClient} disabled={savingClient} style={{ flex: 1, padding: "10px", background: "#22315C", border: "none", borderRadius: 10, color: "#FAFAF8", fontSize: 12, fontWeight: 700, cursor: savingClient ? "default" : "pointer" }}>
                    {savingClient ? <Loader2 style={{ width: 13, height: 13, animation: "spin 1s linear infinite" }} /> : "Add client"}
                  </button>
                  <button onClick={() => { setNewClientMode(false); setNewClientName(""); setNewClientLogoFile(null); setNewClientLogoPreview(null); }} style={{ padding: "0 14px", background: "rgba(23,23,15,0.06)", border: "none", borderRadius: 10, color: "rgba(23,23,15,0.5)", fontSize: 12, cursor: "pointer", flexShrink: 0 }}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 8 }}>
                <select style={{ ...inputStyle, cursor: "pointer" }} value={form.client_id} onChange={e => setForm(f => ({ ...f, client_id: e.target.value }))}>
                  <option value="">Select a client…</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <button onClick={() => setNewClientMode(true)} style={{ padding: "0 12px", background: "rgba(23,23,15,0.06)", border: "none", borderRadius: 10, color: "#17170F", fontSize: 12, fontWeight: 700, cursor: "pointer", flexShrink: 0, whiteSpace: "nowrap" }}>
                  + New
                </button>
              </div>
            )}
          </div>

          <div>
            <label style={labelStyle}>Location</label>
            <input style={inputStyle} value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="Lagos, Nigeria" />
          </div>

          <div>
            <label style={labelStyle}>Job description</label>
            <textarea
              style={{ ...inputStyle, minHeight: 90, resize: "vertical", fontFamily: "'Inter', sans-serif" }}
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
              <input style={inputStyle} type="number" value={form.salary_min} onChange={e => setForm(f => ({ ...f, salary_min: e.target.value }))} placeholder="60000" />
            </div>
            <div>
              <label style={labelStyle}>Salary max</label>
              <input style={inputStyle} type="number" value={form.salary_max} onChange={e => setForm(f => ({ ...f, salary_max: e.target.value }))} placeholder="90000" />
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
            {saving ? <Loader2 style={{ width: 15, height: 15, animation: "spin 1s linear infinite" }} /> : <CheckCircle2 style={{ width: 15, height: 15 }} />}
            {saving ? "Creating…" : "Create job"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

export default function JobsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { teamId, teamLoading } = useTeam();
  const [searchParams, setSearchParams] = useSearchParams();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [clients, setClients] = useState<ClientOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);

  // Deep-link support (?create=1) — used by the onboarding flow's "Create
  // your first job" choice and by anywhere else that wants to land here
  // with the Create Job workflow already open.
  useEffect(() => {
    if (searchParams.get("create") === "1") {
      setCreateOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete("create");
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadJobs = useCallback(async () => {
    if (!teamId) return;
    setLoading(true);
    setError(null);
    try {
      const [jobsRes, clientsRes] = await Promise.all([
        (supabase as any)
          .from("jobs")
          .select("id, title, location, work_arrangement, employment_type, salary_min, salary_max, salary_currency, status, headcount, positions_filled, client_id, created_at, updated_at, recruiting_clients(name)")
          .eq("team_id", teamId)
          .order("updated_at", { ascending: false }),
        (supabase as any)
          .from("recruiting_clients")
          .select("id, name, logo_url")
          .eq("team_id", teamId)
          .order("name"),
      ]);
      if (jobsRes.error) throw jobsRes.error;
      if (clientsRes.error) throw clientsRes.error;
      setJobs(jobsRes.data ?? []);
      setClients(clientsRes.data ?? []);
    } catch (e: any) {
      setError(e.message ?? "Failed to load jobs");
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    if (teamId) loadJobs();
  }, [teamId, loadJobs]);

  const filtered = useMemo(() => {
    let list = jobs;
    if (statusFilter !== "all") list = list.filter(j => j.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(j =>
        j.title.toLowerCase().includes(q) ||
        j.recruiting_clients?.name?.toLowerCase().includes(q) ||
        j.location?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [jobs, search, statusFilter]);

  return (
    <DashboardLayout>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 900, margin: "0 auto", fontFamily: "'Inter', sans-serif" }}>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: "#17170F", margin: 0 }}>Jobs</h1>
            <p style={{ fontSize: 12.5, color: "rgba(23,23,15,0.4)", margin: "3px 0 0" }}>
              {teamLoading ? "Loading…" : `${jobs.length} job${jobs.length === 1 ? "" : "s"}`}
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
            <Plus style={{ width: 15, height: 15 }} />New Job
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: 1, minWidth: 200, maxWidth: 320 }}>
            <Search style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 13, height: 13, color: "rgba(23,23,15,0.25)" }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search jobs…"
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
          <button onClick={loadJobs} style={{ marginLeft: "auto", padding: "7px", borderRadius: 8, border: "1px solid rgba(23,23,15,0.07)", background: "rgba(23,23,15,0.03)", color: "rgba(23,23,15,0.4)", cursor: "pointer" }}>
            <RefreshCw style={{ width: 14, height: 14 }} />
          </button>
        </div>

        {loading || teamLoading ? (
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: 200 }}>
            <Loader2 style={{ width: 24, height: 24, color: "#22315C", animation: "spin 1s linear infinite" }} />
          </div>
        ) : error ? (
          <div style={{ textAlign: "center", padding: "48px 20px" }}>
            <p style={{ fontSize: 13, color: "rgba(23,23,15,0.5)", marginBottom: 16 }}>Unable to load jobs.</p>
            <button onClick={loadJobs} style={{ padding: "9px 18px", background: "rgba(23,23,15,0.06)", border: "none", borderRadius: 10, color: "#17170F", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
              Retry
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px 20px" }}>
            <Briefcase style={{ width: 40, height: 40, margin: "0 auto 14px", opacity: 0.2 }} />
            <div style={{ fontSize: 16, fontWeight: 700, color: "rgba(23,23,15,0.5)", marginBottom: 8 }}>
              {jobs.length === 0 ? "No jobs yet" : "No matches"}
            </div>
            <p style={{ fontSize: 13, color: "rgba(23,23,15,0.35)", marginBottom: 20 }}>
              {jobs.length === 0 ? "Create your first job requisition to start building a pipeline." : "Try a different search or filter."}
            </p>
            {jobs.length === 0 && (
              <button onClick={() => setCreateOpen(true)} style={{ padding: "10px 20px", background: "linear-gradient(135deg, #22315C, #2A3F73)", border: "none", borderRadius: 10, color: "#FAFAF8", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                <Plus style={{ width: 14, height: 14, display: "inline", marginRight: 6 }} />Create First Job
              </button>
            )}
          </div>
        ) : (
          <div style={{ background: "rgba(23,23,15,0.02)", border: "1px solid rgba(23,23,15,0.06)", borderRadius: 14, overflow: "hidden" }}>
            {filtered.map(j => (
              <JobRow key={j.id} job={j} onClick={() => navigate(`/jobs/${j.id}`)} />
            ))}
          </div>
        )}
      </div>

      <CreateJobModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={id => navigate(`/jobs/${id}`)}
        teamId={teamId}
        userId={user?.id}
        clients={clients}
        onClientCreated={c => setClients(prev => [...prev, c].sort((a, b) => a.name.localeCompare(b.name)))}
      />
    </DashboardLayout>
  );
}