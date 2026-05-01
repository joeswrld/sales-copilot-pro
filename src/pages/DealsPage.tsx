/**
 * DealsPage.tsx — AI Revenue Command Center
 * Fully responsive: mobile-first kanban/list with touch-friendly controls
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import {
  Plus, Loader2, Search, X, ChevronRight, TrendingUp, TrendingDown,
  Minus, Phone, Calendar, DollarSign, Target, AlertTriangle,
  Zap, Building2, User, BarChart3, Sparkles, ArrowRight,
  Filter, LayoutGrid, List, RefreshCw, ArrowUpRight,
  CheckCircle2, Clock, Activity, Brain
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Deal {
  id: string;
  name: string;
  company: string | null;
  contact_name: string | null;
  contact_email: string | null;
  stage: string;
  value: number | null;
  currency: string;
  probability: number | null;
  close_date: string | null;
  notes: string | null;
  deal_health_score: number;
  next_step: string | null;
  next_best_action: string | null;
  sentiment_trend: string | null;
  risk_score: number;
  risk_flags: any[];
  ai_insights: any[];
  call_count: number;
  last_call_at: string | null;
  avg_sentiment: number | null;
  created_at: string;
  updated_at: string;
  tags: string[];
  assigned_to: string | null;
}

// ─── Stage config ─────────────────────────────────────────────────────────────

const STAGES = [
  { key: "new", label: "New", color: "#94a3b8", glow: "rgba(148,163,184,0.15)", icon: "✦", order: 0 },
  { key: "qualified", label: "Qualified", color: "#60a5fa", glow: "rgba(96,165,250,0.15)", icon: "◈", order: 1 },
  { key: "demo", label: "Demo", color: "#a78bfa", glow: "rgba(167,139,250,0.15)", icon: "◎", order: 2 },
  { key: "negotiation", label: "Negotiation", color: "#fbbf24", glow: "rgba(251,191,36,0.15)", icon: "⬡", order: 3 },
  { key: "won", label: "Won", color: "#22c55e", glow: "rgba(34,197,94,0.15)", icon: "★", order: 4 },
  { key: "lost", label: "Lost", color: "#ef4444", glow: "rgba(239,68,68,0.15)", icon: "✕", order: 5 },
  { key: "discovery", label: "Discovery", color: "#06b6d4", glow: "rgba(6,182,212,0.15)", icon: "◉", order: -1 },
  { key: "proposal", label: "Proposal", color: "#34d399", glow: "rgba(52,211,153,0.15)", icon: "▣", order: -1 },
  { key: "on_hold", label: "On Hold", color: "#64748b", glow: "rgba(100,116,139,0.15)", icon: "⏸", order: -1 },
];

const KANBAN_STAGES = STAGES.filter(s => s.order >= 0).sort((a, b) => a.order - b.order);

function getStageCfg(stage: string) {
  return STAGES.find(s => s.key === stage) ?? { key: stage, label: stage, color: "#94a3b8", glow: "rgba(148,163,184,0.15)", icon: "◦" };
}

function formatCurrency(value: number | null) {
  if (!value) return null;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toLocaleString()}`;
}

function HealthBar({ score }: { score: number }) {
  const color = score >= 70 ? "#22c55e" : score >= 45 ? "#fbbf24" : "#ef4444";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ flex: 1, height: 3, borderRadius: 2, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
        <div style={{ width: `${score}%`, height: "100%", background: color, borderRadius: 2, transition: "width 0.6s ease" }} />
      </div>
      <span style={{ fontSize: 10, fontWeight: 700, color, minWidth: 16 }}>{score}</span>
    </div>
  );
}

// ─── Deal Card ────────────────────────────────────────────────────────────────

function DealCard({ deal, onClick }: { deal: Deal; onClick: () => void }) {
  const cfg = getStageCfg(deal.stage);
  const health = deal.deal_health_score ?? 0;
  const healthColor = health >= 70 ? "#22c55e" : health >= 45 ? "#fbbf24" : "#ef4444";
  const topRisk = deal.risk_flags?.[0];

  return (
    <div
      onClick={onClick}
      style={{
        background: "rgba(255,255,255,0.025)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 12,
        padding: "12px 14px",
        cursor: "pointer",
        transition: "all 0.15s",
        marginBottom: 8,
        position: "relative",
        overflow: "hidden",
        WebkitTapHighlightColor: "transparent",
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.045)";
        (e.currentTarget as HTMLDivElement).style.borderColor = cfg.color + "40";
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(-1px)";
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.025)";
        (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.06)";
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
      }}
    >
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: healthColor, borderRadius: "12px 0 0 12px", opacity: 0.8 }} />
      <div style={{ paddingLeft: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.9)", marginBottom: 3, lineHeight: 1.3, fontFamily: "'DM Sans', sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {deal.name}
        </div>
        {deal.company && (
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.38)", marginBottom: 8, display: "flex", alignItems: "center", gap: 4 }}>
            <Building2 style={{ width: 10, height: 10 }} />
            {deal.company}
          </div>
        )}
        {deal.value && (
          <div style={{ fontSize: 14, fontWeight: 800, color: "#22c55e", marginBottom: 8 }}>
            {formatCurrency(deal.value)}
          </div>
        )}
        <div style={{ marginBottom: 8 }}>
          <HealthBar score={health} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {deal.call_count > 0 && (
            <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10, color: "rgba(255,255,255,0.3)" }}>
              <Phone style={{ width: 9, height: 9 }} />{deal.call_count}
            </span>
          )}
          {deal.last_call_at && (
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>
              {formatDistanceToNow(new Date(deal.last_call_at), { addSuffix: true })}
            </span>
          )}
          {deal.avg_sentiment != null && (
            <span style={{ fontSize: 10, color: deal.avg_sentiment >= 60 ? "#22c55e" : deal.avg_sentiment >= 40 ? "#fbbf24" : "#ef4444" }}>
              {Math.round(deal.avg_sentiment)}%
            </span>
          )}
        </div>
        {topRisk && (
          <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "#f97316", background: "rgba(249,115,22,0.08)", borderRadius: 6, padding: "4px 7px" }}>
            <AlertTriangle style={{ width: 9, height: 9, flexShrink: 0 }} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{topRisk.text ?? topRisk}</span>
          </div>
        )}
        {(deal.next_best_action || deal.next_step) && (
          <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "#60a5fa", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            <Zap style={{ width: 9, height: 9, flexShrink: 0 }} />
            {deal.next_best_action ?? deal.next_step}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Mobile Deal Row (stacked card for list on mobile) ────────────────────────

function MobileDealRow({ deal, onClick }: { deal: Deal; onClick: () => void }) {
  const cfg = getStageCfg(deal.stage);
  const health = deal.deal_health_score ?? 0;
  const healthColor = health >= 70 ? "#22c55e" : health >= 45 ? "#fbbf24" : "#ef4444";

  return (
    <div
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "13px 14px",
        borderBottom: "1px solid rgba(255,255,255,0.04)",
        cursor: "pointer",
        position: "relative",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      {/* Left health strip */}
      <div style={{ width: 3, alignSelf: "stretch", borderRadius: 2, background: healthColor, flexShrink: 0, opacity: 0.8 }} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 2 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.88)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "'DM Sans', sans-serif" }}>
            {deal.name}
          </div>
          {deal.value && (
            <div style={{ fontSize: 13, fontWeight: 800, color: "#22c55e", flexShrink: 0 }}>{formatCurrency(deal.value)}</div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: cfg.color }}>{cfg.label}</span>
          {deal.company && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>{deal.company}</span>}
          {deal.call_count > 0 && (
            <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10, color: "rgba(255,255,255,0.3)" }}>
              <Phone style={{ width: 9, height: 9 }} />{deal.call_count}
            </span>
          )}
        </div>
        <div style={{ marginTop: 6 }}>
          <HealthBar score={health} />
        </div>
      </div>
      <ChevronRight style={{ width: 14, height: 14, color: "rgba(255,255,255,0.2)", flexShrink: 0 }} />
    </div>
  );
}

// ─── Desktop List View Row ─────────────────────────────────────────────────────

function DealListRow({ deal, onClick }: { deal: Deal; onClick: () => void }) {
  const cfg = getStageCfg(deal.stage);
  const health = deal.deal_health_score;
  const healthColor = health >= 70 ? "#22c55e" : health >= 45 ? "#fbbf24" : "#ef4444";

  return (
    <div
      onClick={onClick}
      style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px 70px 80px 100px 28px", alignItems: "center", gap: 12, padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,0.04)", cursor: "pointer", transition: "background 0.1s", WebkitTapHighlightColor: "transparent" }}
      onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.03)"}
      onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = "transparent"}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.85)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "'DM Sans', sans-serif" }}>{deal.name}</div>
        {deal.company && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>{deal.company}</div>}
      </div>
      <div style={{ fontSize: 12, color: cfg.color, fontWeight: 600 }}>{cfg.label}</div>
      <div style={{ fontSize: 12, color: "#22c55e", fontWeight: 700 }}>{formatCurrency(deal.value) ?? "—"}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <div style={{ width: 32, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
          <div style={{ width: `${health}%`, height: "100%", background: healthColor }} />
        </div>
        <span style={{ fontSize: 10, color: healthColor, fontWeight: 700, minWidth: 16 }}>{health}</span>
      </div>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
        {deal.last_call_at ? formatDistanceToNow(new Date(deal.last_call_at), { addSuffix: true }) : "No calls"}
      </div>
      <div style={{ fontSize: 11, color: "#60a5fa", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {deal.next_best_action ?? deal.next_step ?? "—"}
      </div>
      <ChevronRight style={{ width: 14, height: 14, color: "rgba(255,255,255,0.2)" }} />
    </div>
  );
}

// ─── Kanban Column ────────────────────────────────────────────────────────────

function KanbanColumn({ stage, deals, onDealClick, onDrop }: {
  stage: typeof KANBAN_STAGES[0];
  deals: Deal[];
  onDealClick: (d: Deal) => void;
  onDrop: (dealId: string, stage: string) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const total = deals.reduce((s, d) => s + (d.value ?? 0), 0);

  return (
    <div
      style={{ minWidth: 220, flex: "0 0 220px", display: "flex", flexDirection: "column" }}
      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => {
        e.preventDefault();
        setDragOver(false);
        const id = e.dataTransfer.getData("dealId");
        if (id) onDrop(id, stage.key);
      }}
    >
      <div style={{
        padding: "10px 12px", borderRadius: "10px 10px 0 0",
        background: dragOver ? stage.glow : "rgba(255,255,255,0.03)",
        border: `1px solid ${dragOver ? stage.color + "50" : "rgba(255,255,255,0.06)"}`,
        borderBottom: "none",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        transition: "all 0.15s",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ fontSize: 14, color: stage.color }}>{stage.icon}</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.75)", fontFamily: "'DM Sans', sans-serif" }}>{stage.label}</span>
          <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.06)", borderRadius: 10, padding: "1px 6px" }}>{deals.length}</span>
        </div>
        {total > 0 && (
          <span style={{ fontSize: 10, color: stage.color, fontWeight: 600 }}>{formatCurrency(total)}</span>
        )}
      </div>
      <div style={{
        flex: 1, padding: "8px 6px", minHeight: 100,
        border: `1px solid ${dragOver ? stage.color + "40" : "rgba(255,255,255,0.04)"}`,
        borderTop: "none", borderRadius: "0 0 10px 10px",
        background: dragOver ? stage.glow : "rgba(255,255,255,0.01)",
        transition: "all 0.15s",
      }}>
        {deals.length === 0 && (
          <div style={{ textAlign: "center", padding: "20px 8px", color: "rgba(255,255,255,0.15)", fontSize: 11 }}>Drop deal here</div>
        )}
        {deals.map(deal => (
          <div key={deal.id} draggable onDragStart={e => e.dataTransfer.setData("dealId", deal.id)}>
            <DealCard deal={deal} onClick={() => onDealClick(deal)} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Mobile Stage Tabs (horizontal scrollable) ────────────────────────────────

function MobileStageView({ byStage, onDealClick }: {
  byStage: Record<string, Deal[]>;
  onDealClick: (d: Deal) => void;
}) {
  const [activeStage, setActiveStage] = useState(KANBAN_STAGES[0].key);
  const cfg = getStageCfg(activeStage);
  const deals = byStage[activeStage] ?? [];

  return (
    <div>
      {/* Scrollable stage tabs */}
      <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch", marginBottom: 12, paddingBottom: 4 }}>
        <div style={{ display: "flex", gap: 6, minWidth: "max-content", padding: "2px 0" }}>
          {KANBAN_STAGES.map(s => {
            const count = (byStage[s.key] ?? []).length;
            const isActive = activeStage === s.key;
            return (
              <button
                key={s.key}
                onClick={() => setActiveStage(s.key)}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "7px 12px",
                  borderRadius: 10,
                  border: isActive ? `1px solid ${s.color}50` : "1px solid rgba(255,255,255,0.06)",
                  background: isActive ? `${s.color}18` : "rgba(255,255,255,0.03)",
                  color: isActive ? s.color : "rgba(255,255,255,0.4)",
                  fontSize: 12, fontWeight: 700, cursor: "pointer",
                  fontFamily: "'DM Sans', sans-serif",
                  transition: "all 0.15s",
                  WebkitTapHighlightColor: "transparent",
                  flexShrink: 0,
                }}
              >
                <span>{s.icon}</span>
                <span>{s.label}</span>
                {count > 0 && (
                  <span style={{
                    fontSize: 10, fontWeight: 800, minWidth: 16, height: 16,
                    borderRadius: 8, background: isActive ? `${s.color}30` : "rgba(255,255,255,0.08)",
                    color: isActive ? s.color : "rgba(255,255,255,0.3)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    padding: "0 4px",
                  }}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Stage deals */}
      <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 12, overflow: "hidden" }}>
        {deals.length === 0 ? (
          <div style={{ padding: "32px 16px", textAlign: "center", color: "rgba(255,255,255,0.2)", fontSize: 12 }}>
            No deals in {cfg.label}
          </div>
        ) : (
          deals.map(d => <MobileDealRow key={d.id} deal={d} onClick={() => onDealClick(d)} />)
        )}
      </div>
    </div>
  );
}

// ─── Create Deal Modal ─────────────────────────────────────────────────────────

function CreateDealModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const { user } = useAuth();
  const [form, setForm] = useState({ name: "", company: "", contact_name: "", contact_email: "", stage: "new", value: "", notes: "" });
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const handleCreate = async () => {
    if (!form.name.trim()) { toast.error("Deal name required"); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from("deals").insert({
        owner_id: user!.id,
        name: form.name.trim(),
        company: form.company.trim() || null,
        contact_name: form.contact_name.trim() || null,
        contact_email: form.contact_email.trim() || null,
        stage: form.stage,
        value: form.value ? parseFloat(form.value) : null,
        notes: form.notes.trim() || null,
        currency: "USD",
      } as any);
      if (error) throw error;
      toast.success("Deal created!");
      onCreated();
      onClose();
      setForm({ name: "", company: "", contact_name: "", contact_email: "", stage: "new", value: "", notes: "" });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(12px)", display: "flex", alignItems: "flex-end", justifyContent: "center", padding: 0 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        width: "100%", maxWidth: 480,
        background: "linear-gradient(135deg, #0c1018, #111827)",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: "20px 20px 0 0",
        padding: "20px 20px calc(20px + env(safe-area-inset-bottom, 0px))",
        boxShadow: "0 -20px 80px rgba(0,0,0,0.6)",
        maxHeight: "92vh",
        overflowY: "auto",
      }}>
        {/* Handle */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.15)" }} />
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(96,165,250,0.15)", border: "1px solid rgba(96,165,250,0.25)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Plus style={{ width: 16, height: 16, color: "#60a5fa" }} />
            </div>
            <span style={{ fontSize: 16, fontWeight: 800, color: "#f0f6fc", fontFamily: "'DM Sans', sans-serif" }}>New Deal</span>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", cursor: "pointer", padding: 8 }}>
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[
            { label: "Deal Name *", key: "name", placeholder: "e.g. Acme Corp — Enterprise" },
            { label: "Company", key: "company", placeholder: "Company name" },
            { label: "Contact Name", key: "contact_name", placeholder: "Decision maker" },
            { label: "Contact Email", key: "contact_email", placeholder: "email@company.com" },
            { label: "Deal Value ($)", key: "value", placeholder: "0", type: "number" },
          ].map(({ label, key, placeholder, type }) => (
            <div key={key}>
              <label style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.4)", display: "block", marginBottom: 5, fontFamily: "'DM Sans', sans-serif" }}>{label}</label>
              <input
                type={type ?? "text"}
                value={(form as any)[key]}
                onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                placeholder={placeholder}
                onKeyDown={e => e.key === "Enter" && handleCreate()}
                style={{ width: "100%", padding: "11px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, color: "#f0f6fc", fontSize: 14, fontFamily: "'DM Sans', sans-serif", outline: "none", boxSizing: "border-box" }}
              />
            </div>
          ))}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.4)", display: "block", marginBottom: 5, fontFamily: "'DM Sans', sans-serif" }}>Stage</label>
            <select
              value={form.stage}
              onChange={e => setForm(f => ({ ...f, stage: e.target.value }))}
              style={{ width: "100%", padding: "11px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, color: "#f0f6fc", fontSize: 14, fontFamily: "'DM Sans', sans-serif", outline: "none" }}
            >
              {KANBAN_STAGES.map(s => <option key={s.key} value={s.key} style={{ background: "#111" }}>{s.label}</option>)}
            </select>
          </div>
        </div>

        <button
          onClick={handleCreate}
          disabled={!form.name.trim() || saving}
          style={{ width: "100%", marginTop: 18, padding: "14px", borderRadius: 12, border: "none", background: form.name.trim() ? "linear-gradient(135deg, #3b82f6, #6366f1)" : "rgba(255,255,255,0.06)", color: form.name.trim() ? "#fff" : "rgba(255,255,255,0.3)", fontSize: 14, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", cursor: form.name.trim() ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: form.name.trim() ? "0 8px 24px rgba(59,130,246,0.3)" : "none" }}
        >
          {saving ? <Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} /> : <Plus style={{ width: 16, height: 16 }} />}
          {saving ? "Creating…" : "Create Deal"}
        </button>
      </div>
    </div>
  );
}

// ─── Pipeline Stats ───────────────────────────────────────────────────────────

function PipelineStats({ deals }: { deals: Deal[] }) {
  const active = deals.filter(d => !["won", "lost"].includes(d.stage));
  const won = deals.filter(d => d.stage === "won");
  const atRisk = deals.filter(d => d.deal_health_score < 45 && !["won", "lost"].includes(d.stage));
  const totalValue = active.reduce((s, d) => s + (d.value ?? 0), 0);
  const wonValue = won.reduce((s, d) => s + (d.value ?? 0), 0);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
      {[
        { label: "Pipeline", value: formatCurrency(totalValue) ?? "$0", icon: DollarSign, color: "#60a5fa", sub: `${active.length} active` },
        { label: "Won", value: formatCurrency(wonValue) ?? "$0", icon: TrendingUp, color: "#22c55e", sub: `${won.length} closed` },
        { label: "At Risk", value: String(atRisk.length), icon: AlertTriangle, color: "#f97316", sub: "Health < 45" },
        { label: "Avg Health", value: deals.length ? Math.round(deals.reduce((s, d) => s + d.deal_health_score, 0) / deals.length) + "" : "—", icon: Activity, color: "#a78bfa", sub: "All deals" },
      ].map(({ label, value, icon: Icon, color, sub }) => (
        <div key={label} style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: "12px 14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
            <Icon style={{ width: 12, height: 12, color }} />
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", fontFamily: "'DM Sans', sans-serif" }}>{label}</span>
          </div>
          <div style={{ fontSize: 18, fontWeight: 900, color: "rgba(255,255,255,0.9)", fontFamily: "'DM Sans', sans-serif", lineHeight: 1 }}>{value}</div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", marginTop: 3 }}>{sub}</div>
        </div>
      ))}
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export default function DealsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [stageFilter, setStageFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"kanban" | "list">("kanban");

  // Detect mobile
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 768);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", check, { passive: true });
    return () => window.removeEventListener("resize", check);
  }, []);

  const loadDeals = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any).rpc("list_deals_v2");
      if (error) throw error;
      setDeals((data as Deal[]) ?? []);
    } catch {
      const { data } = await (supabase as any).from("deals").select("*").eq("owner_id", user?.id).order("updated_at", { ascending: false });
      setDeals((data as Deal[]) ?? []);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { loadDeals(); }, [loadDeals]);

  const filtered = useMemo(() => {
    return deals.filter(d => {
      const matchSearch = !search || d.name.toLowerCase().includes(search.toLowerCase()) || (d.company ?? "").toLowerCase().includes(search.toLowerCase());
      const matchStage = stageFilter === "all" || d.stage === stageFilter;
      return matchSearch && matchStage;
    });
  }, [deals, search, stageFilter]);

  const byStage = useMemo(() => {
    const map: Record<string, Deal[]> = {};
    KANBAN_STAGES.forEach(s => { map[s.key] = []; });
    filtered.forEach(d => {
      if (map[d.stage]) map[d.stage].push(d);
      else { map["new"] = map["new"] ?? []; map["new"].push(d); }
    });
    return map;
  }, [filtered]);

  const handleDrop = async (dealId: string, newStage: string) => {
    const deal = deals.find(d => d.id === dealId);
    if (!deal || deal.stage === newStage) return;
    setDeals(prev => prev.map(d => d.id === dealId ? { ...d, stage: newStage } : d));
    const { error } = await (supabase as any).from("deals").update({ stage: newStage, updated_at: new Date().toISOString() }).eq("id", dealId);
    if (error) { toast.error("Failed to update stage"); loadDeals(); }
    else toast.success(`Moved to ${getStageCfg(newStage).label}`);
  };

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;0,9..40,800;0,9..40,900&display=swap');
    @keyframes spin { to { transform: rotate(360deg); } }
    ::-webkit-scrollbar { width: 4px; height: 4px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
  `;

  return (
    <DashboardLayout>
      <style>{css}</style>
      <CreateDealModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={loadDeals} />

      <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? 14 : 18, fontFamily: "'DM Sans', sans-serif" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: isMobile ? "center" : "flex-start", justifyContent: "space-between", gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: isMobile ? 20 : 26, fontWeight: 900, color: "#f0f6fc", margin: 0, letterSpacing: "-0.5px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {isMobile ? "Deals" : "Revenue Command Center"}
            </h1>
            {!isMobile && (
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", margin: "4px 0 0" }}>
                AI-powered deal intelligence · {deals.length} deal{deals.length !== 1 ? "s" : ""} tracked
              </p>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            {isMobile && (
              <button
                onClick={() => setSearchOpen(v => !v)}
                style={{ width: 36, height: 36, borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.5)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
              >
                <Search style={{ width: 15, height: 15 }} />
              </button>
            )}
            <button
              onClick={() => setCreateOpen(true)}
              style={{ display: "flex", alignItems: "center", gap: isMobile ? 0 : 8, padding: isMobile ? "0" : "10px 18px", width: isMobile ? 36 : "auto", height: isMobile ? 36 : "auto", justifyContent: "center", background: "linear-gradient(135deg, #3b82f6, #6366f1)", border: "none", borderRadius: isMobile ? 10 : 12, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", boxShadow: "0 8px 24px rgba(59,130,246,0.35)", fontFamily: "'DM Sans', sans-serif" }}
            >
              <Plus style={{ width: 16, height: 16 }} />
              {!isMobile && "New Deal"}
            </button>
          </div>
        </div>

        {/* Mobile search bar (collapsible) */}
        {isMobile && searchOpen && (
          <div style={{ position: "relative" }}>
            <Search style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: "rgba(255,255,255,0.3)" }} />
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search deals…"
              style={{ width: "100%", paddingLeft: 34, paddingRight: search ? 34 : 12, paddingTop: 10, paddingBottom: 10, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, color: "#f0f6fc", fontSize: 14, fontFamily: "'DM Sans', sans-serif", outline: "none", boxSizing: "border-box" }}
            />
            {search && (
              <button onClick={() => setSearch("")} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "rgba(255,255,255,0.3)", cursor: "pointer", padding: 4 }}>
                <X style={{ width: 12, height: 12 }} />
              </button>
            )}
          </div>
        )}

        {/* Stats */}
        {!loading && deals.length > 0 && <PipelineStats deals={deals} />}

        {/* Desktop controls */}
        {!isMobile && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ position: "relative", flex: 1, minWidth: 200, maxWidth: 320 }}>
              <Search style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 13, height: 13, color: "rgba(255,255,255,0.25)" }} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search deals…"
                style={{ width: "100%", paddingLeft: 32, paddingRight: search ? 32 : 12, paddingTop: 8, paddingBottom: 8, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, color: "#f0f6fc", fontSize: 13, fontFamily: "'DM Sans', sans-serif", outline: "none", boxSizing: "border-box" }}
              />
              {search && <button onClick={() => setSearch("")} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "rgba(255,255,255,0.3)", cursor: "pointer" }}><X style={{ width: 12, height: 12 }} /></button>}
            </div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {[{ key: "all", label: "All" }, ...KANBAN_STAGES].map(s => (
                <button
                  key={s.key}
                  onClick={() => setStageFilter(s.key)}
                  style={{ fontSize: 11, fontWeight: 600, padding: "5px 10px", borderRadius: 8, border: "none", background: stageFilter === s.key ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.04)", color: stageFilter === s.key ? "#f0f6fc" : "rgba(255,255,255,0.35)", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}
                >
                  {s.key === "all" ? "All" : (s as any).label}
                </button>
              ))}
            </div>
            <div style={{ marginLeft: "auto", display: "flex", gap: 3, background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: 3 }}>
              {[{ mode: "kanban" as const, icon: LayoutGrid }, { mode: "list" as const, icon: List }].map(({ mode, icon: Icon }) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  style={{ padding: "5px 8px", borderRadius: 6, border: "none", background: viewMode === mode ? "rgba(255,255,255,0.1)" : "transparent", color: viewMode === mode ? "#f0f6fc" : "rgba(255,255,255,0.3)", cursor: "pointer" }}
                >
                  <Icon style={{ width: 14, height: 14 }} />
                </button>
              ))}
            </div>
            <button onClick={loadDeals} style={{ padding: "7px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.4)", cursor: "pointer" }}>
              <RefreshCw style={{ width: 14, height: 14 }} />
            </button>
          </div>
        )}

        {/* Mobile view toggle + refresh */}
        {isMobile && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ display: "flex", gap: 3, background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: 3 }}>
              {[{ mode: "kanban" as const, icon: LayoutGrid, label: "Kanban" }, { mode: "list" as const, icon: List, label: "List" }].map(({ mode, icon: Icon, label }) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 10px", borderRadius: 6, border: "none", background: viewMode === mode ? "rgba(255,255,255,0.1)" : "transparent", color: viewMode === mode ? "#f0f6fc" : "rgba(255,255,255,0.35)", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}
                >
                  <Icon style={{ width: 13, height: 13 }} />{label}
                </button>
              ))}
            </div>
            <button onClick={loadDeals} style={{ marginLeft: "auto", padding: "8px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.4)", cursor: "pointer" }}>
              <RefreshCw style={{ width: 14, height: 14 }} />
            </button>
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: 200 }}>
            <Loader2 style={{ width: 24, height: 24, color: "#60a5fa", animation: "spin 1s linear infinite" }} />
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px 20px", color: "rgba(255,255,255,0.2)" }}>
            <Target style={{ width: 40, height: 40, margin: "0 auto 14px", opacity: 0.3 }} />
            <div style={{ fontSize: 16, fontWeight: 700, color: "rgba(255,255,255,0.5)", marginBottom: 8 }}>
              {deals.length === 0 ? "No deals yet" : "No matches"}
            </div>
            <p style={{ fontSize: 13, marginBottom: 20 }}>{deals.length === 0 ? "Create your first deal to start tracking revenue." : "Try a different search or filter."}</p>
            {deals.length === 0 && (
              <button onClick={() => setCreateOpen(true)} style={{ padding: "10px 20px", background: "linear-gradient(135deg, #3b82f6, #6366f1)", border: "none", borderRadius: 10, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
                <Plus style={{ width: 14, height: 14, display: "inline", marginRight: 6 }} />Create First Deal
              </button>
            )}
          </div>
        ) : isMobile ? (
          /* Mobile: stage tabs or flat list */
          viewMode === "kanban"
            ? <MobileStageView byStage={byStage} onDealClick={d => navigate(`/deals/${d.id}`)} />
            : (
              <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, overflow: "hidden" }}>
                {filtered.map(d => <MobileDealRow key={d.id} deal={d} onClick={() => navigate(`/deals/${d.id}`)} />)}
              </div>
            )
        ) : viewMode === "kanban" ? (
          /* Desktop Kanban */
          <div style={{ overflowX: "auto", paddingBottom: 8 }}>
            <div style={{ display: "flex", gap: 12, minWidth: "max-content" }}>
              {KANBAN_STAGES.map(stage => (
                <KanbanColumn key={stage.key} stage={stage} deals={byStage[stage.key] ?? []} onDealClick={d => navigate(`/deals/${d.id}`)} onDrop={handleDrop} />
              ))}
            </div>
          </div>
        ) : (
          /* Desktop List */
          <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px 70px 80px 100px 28px", gap: 12, padding: "8px 14px", borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)" }}>
              {["Deal", "Stage", "Value", "Health", "Last Call", "Next Action", ""].map((h, i) => (
                <span key={i} style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.25)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{h}</span>
              ))}
            </div>
            {filtered.map(deal => <DealListRow key={deal.id} deal={deal} onClick={() => navigate(`/deals/${deal.id}`)} />)}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}