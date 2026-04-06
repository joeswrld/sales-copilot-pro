/**
 * DealsPage.tsx
 *
 * Deal Timeline — the core differentiator.
 * Prospect Thread: all calls tied to a deal, aggregated AI intelligence.
 *
 * Route: /dashboard/deals
 * UPDATED: Full mobile responsiveness
 */

import { useState, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import {
  Plus, Search, TrendingUp, TrendingDown, Minus, AlertCircle,
  ChevronRight, Phone, Clock, BarChart3, Sparkles, Target,
  Building2, User, Calendar, DollarSign, Loader2, ArrowLeft,
  X, Check, Edit3, Trash2, ExternalLink, Activity, Award,
  Zap, RefreshCw, Shield, Tag, MoreHorizontal, Brain,
} from "lucide-react";
import { format } from "date-fns";
import { useDeals, DEAL_STAGE_CFG, type DealStageValue, type DealListItem } from "@/hooks/useDeals";
import { useCalls } from "@/hooks/useCalls";
import { useDealIntelligence, type DealChangeAnalysis } from "@/hooks/useDealIntelligence";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ─── Stage pill ───────────────────────────────────────────────────────────────

function StagePill({ stage, size = "sm" }: { stage: DealStageValue; size?: "sm" | "xs" }) {
  const cfg = DEAL_STAGE_CFG[stage];
  const pad = size === "xs" ? "2px 7px" : "3px 10px";
  const fs  = size === "xs" ? 10 : 11;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      fontSize: fs, fontWeight: 700, padding: pad, borderRadius: 20,
      color: cfg.color, background: cfg.bg,
      border: `1px solid ${cfg.color}30`,
      whiteSpace: "nowrap",
    }}>
      {cfg.icon} {cfg.label}
    </span>
  );
}

// ─── Sentiment trend icon ─────────────────────────────────────────────────────

function TrendIcon({ trend }: { trend: string | null }) {
  if (trend === "improving") return <TrendingUp style={{ width: 13, height: 13, color: "#22c55e" }} />;
  if (trend === "declining") return <TrendingDown style={{ width: 13, height: 13, color: "#ef4444" }} />;
  if (trend === "stable")   return <Minus style={{ width: 13, height: 13, color: "#94a3b8" }} />;
  return null;
}

// ─── Risk badge ───────────────────────────────────────────────────────────────

function RiskBadge({ score }: { score: number | null }) {
  if (score == null) return null;
  const color  = score >= 70 ? "#ef4444" : score >= 40 ? "#f59e0b" : "#22c55e";
  const label  = score >= 70 ? "High Risk" : score >= 40 ? "Moderate" : "Low Risk";
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
      color, background: `${color}18`, border: `1px solid ${color}30`,
    }}>
      {label} {score}
    </span>
  );
}

// ─── Deal card ────────────────────────────────────────────────────────────────

function DealCard({
  deal, isSelected, onClick,
}: {
  deal: DealListItem;
  isSelected: boolean;
  onClick: () => void;
}) {
  const cfg = DEAL_STAGE_CFG[deal.stage];
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%", textAlign: "left", cursor: "pointer",
        background: isSelected ? "rgba(96,165,250,.08)" : "rgba(255,255,255,.02)",
        border: `1px solid ${isSelected ? "rgba(96,165,250,.35)" : "rgba(255,255,255,.06)"}`,
        borderRadius: 13, padding: "12px 13px", marginBottom: 6,
        transition: "all .13s", fontFamily: "'DM Sans',sans-serif",
      }}
      onMouseEnter={e => {
        if (!isSelected) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,.04)";
      }}
      onMouseLeave={e => {
        if (!isSelected) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,.02)";
      }}
    >
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 9, marginBottom: 8 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 9, flexShrink: 0,
          background: cfg.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15,
        }}>
          {cfg.icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,.9)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {deal.name}
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,.38)", marginTop: 1 }}>
            {deal.company || "No company"} {deal.contact_name ? `· ${deal.contact_name}` : ""}
          </div>
        </div>
        <TrendIcon trend={deal.sentiment_trend} />
      </div>

      {/* Stage + stats */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: deal.deal_summary ? 7 : 0 }}>
        <StagePill stage={deal.stage} size="xs" />
        {deal.call_count > 0 && (
          <span style={{ fontSize: 10, color: "rgba(255,255,255,.3)", display: "flex", alignItems: "center", gap: 3 }}>
            <Phone style={{ width: 9, height: 9 }} /> {deal.call_count} call{deal.call_count !== 1 ? "s" : ""}
          </span>
        )}
        {deal.avg_sentiment != null && (
          <span style={{ fontSize: 10, color: deal.avg_sentiment >= 70 ? "#22c55e" : deal.avg_sentiment >= 40 ? "#f59e0b" : "#ef4444" }}>
            {deal.avg_sentiment}% sentiment
          </span>
        )}
        {deal.value != null && (
          <span style={{ fontSize: 10, color: "#60a5fa", marginLeft: "auto" }}>
            ${deal.value.toLocaleString()}
          </span>
        )}
      </div>

      {/* AI summary snippet */}
      {deal.deal_summary && (
        <div style={{
          fontSize: 11, color: "rgba(255,255,255,.42)", lineHeight: 1.5,
          overflow: "hidden", display: "-webkit-box",
          WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
        }}>
          {deal.deal_summary}
        </div>
      )}
    </button>
  );
}

// ─── Create deal modal ────────────────────────────────────────────────────────

function CreateDealModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { createDeal } = useDeals();
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [contact, setContact] = useState("");
  const [email, setEmail] = useState("");
  const [stage, setStage] = useState<DealStageValue>("discovery");
  const [value, setValue] = useState("");
  const [closeDate, setCloseDate] = useState("");

  const handleCreate = async () => {
    if (!name.trim()) return;
    const deal = await createDeal.mutateAsync({
      name: name.trim(),
      company: company.trim() || undefined,
      contact_name: contact.trim() || undefined,
      contact_email: email.trim() || undefined,
      stage,
      value: value ? parseFloat(value) : undefined,
      close_date: closeDate || undefined,
    });
    onCreated(deal.id);
    onClose();
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.09)",
    borderRadius: 9, padding: "9px 12px", color: "#f0f6fc", fontSize: 13,
    fontFamily: "'DM Sans',sans-serif", outline: "none",
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,.45)",
    textTransform: "uppercase", letterSpacing: ".07em", display: "block", marginBottom: 5,
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(0,0,0,.75)", backdropFilter: "blur(12px)",
      display: "flex", alignItems: "flex-end",
      justifyContent: "center", padding: 0,
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <style>{`
        @media (min-width: 600px) {
          .create-deal-sheet {
            align-self: center !important;
            border-radius: 18px !important;
            max-height: 88vh !important;
            margin: 20px !important;
          }
        }
      `}</style>
      <div className="create-deal-sheet" style={{
        width: "100%", maxWidth: 520, overflowY: "auto",
        background: "#0d1117", border: "1px solid rgba(255,255,255,.09)",
        borderRadius: "18px 18px 0 0", padding: 22,
        boxShadow: "0 -20px 60px rgba(0,0,0,.8)",
        maxHeight: "92vh",
      }}>
        {/* Drag handle */}
        <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,.15)", margin: "0 auto 18px" }} />

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 34, height: 34, borderRadius: 9,
              background: "rgba(96,165,250,.15)", border: "1px solid rgba(96,165,250,.3)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Building2 style={{ width: 15, height: 15, color: "#60a5fa" }} />
            </div>
            <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#f0f6fc", fontFamily: "'Bricolage Grotesque',sans-serif" }}>
              New Deal
            </p>
          </div>
          <button onClick={onClose} style={{
            background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)",
            borderRadius: 8, width: 28, height: 28, display: "flex", alignItems: "center",
            justifyContent: "center", cursor: "pointer", color: "rgba(255,255,255,.4)",
          }}>
            <X style={{ width: 13, height: 13 }} />
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={labelStyle}>Deal Name *</label>
            <input style={inputStyle} placeholder="e.g. Acme Corp — Enterprise License" value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === "Enter" && handleCreate()} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={labelStyle}>Company</label>
              <input style={inputStyle} placeholder="Acme Corp" value={company} onChange={e => setCompany(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Contact Name</label>
              <input style={inputStyle} placeholder="Jane Smith" value={contact} onChange={e => setContact(e.target.value)} />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Contact Email</label>
            <input style={inputStyle} placeholder="jane@acme.com" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={labelStyle}>Stage</label>
              <select
                value={stage} onChange={e => setStage(e.target.value as DealStageValue)}
                style={{ ...inputStyle, cursor: "pointer" }}
              >
                {(Object.entries(DEAL_STAGE_CFG) as [DealStageValue, any][])
                  .sort((a, b) => a[1].order - b[1].order)
                  .map(([k, v]) => (
                    <option key={k} value={k}>{v.icon} {v.label}</option>
                  ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Deal Value (USD)</label>
              <input style={inputStyle} type="number" placeholder="50000" value={value} onChange={e => setValue(e.target.value)} />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Expected Close Date</label>
            <input style={{ ...inputStyle, colorScheme: "dark" }} type="date" value={closeDate} onChange={e => setCloseDate(e.target.value)} />
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: "flex", gap: 8, marginTop: 22 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: "10px", background: "rgba(255,255,255,.05)",
            border: "1px solid rgba(255,255,255,.1)", borderRadius: 10,
            color: "rgba(255,255,255,.6)", fontSize: 13, fontWeight: 600,
            cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
          }}>
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!name.trim() || createDeal.isPending}
            style={{
              flex: 2, padding: "10px", display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
              background: !name.trim() ? "rgba(255,255,255,.07)" : "linear-gradient(135deg,#3b82f6,#2563eb)",
              border: "none", borderRadius: 10,
              color: !name.trim() ? "rgba(255,255,255,.3)" : "#fff",
              fontSize: 13, fontWeight: 700, cursor: name.trim() ? "pointer" : "not-allowed",
              fontFamily: "'DM Sans',sans-serif",
              boxShadow: name.trim() ? "0 4px 14px rgba(59,130,246,.35)" : "none",
            }}
          >
            {createDeal.isPending
              ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} />
              : <Plus style={{ width: 14, height: 14 }} />}
            Create Deal
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Attach call modal ────────────────────────────────────────────────────────

function AttachCallModal({
  dealId,
  dealName,
  onClose,
}: {
  dealId: string;
  dealName: string;
  onClose: () => void;
}) {
  const { attachCall } = useDeals();
  const { data: calls = [], isLoading } = useCalls();
  const [search, setSearch] = useState("");

  const unlinked = calls.filter(c =>
    !(c as any).deal_id &&
    c.status !== "live" &&
    (c.name.toLowerCase().includes(search.toLowerCase()) || !search)
  );

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(0,0,0,.75)", backdropFilter: "blur(10px)",
      display: "flex", alignItems: "flex-end", justifyContent: "center",
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <style>{`
        @media (min-width: 600px) {
          .attach-call-sheet {
            align-self: center !important;
            border-radius: 18px !important;
            margin: 20px !important;
          }
        }
      `}</style>
      <div className="attach-call-sheet" style={{
        width: "100%", maxWidth: 480, background: "#0d1117",
        border: "1px solid rgba(255,255,255,.09)", borderRadius: "18px 18px 0 0", padding: 22,
        boxShadow: "0 -20px 60px rgba(0,0,0,.8)", maxHeight: "80vh", display: "flex", flexDirection: "column",
      }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,.15)", margin: "0 auto 16px" }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#f0f6fc", fontFamily: "'Bricolage Grotesque',sans-serif" }}>
            Link a Call
          </p>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,.4)" }}>
            <X style={{ width: 14, height: 14 }} />
          </button>
        </div>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,.35)", margin: "0 0 12px" }}>
          Select a call to add to <strong style={{ color: "rgba(255,255,255,.7)" }}>{dealName}</strong>
        </p>
        <div style={{ position: "relative", marginBottom: 12 }}>
          <Search style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 13, height: 13, color: "rgba(255,255,255,.25)" }} />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search calls…"
            style={{
              width: "100%", paddingLeft: 30, paddingRight: 10, paddingTop: 8, paddingBottom: 8,
              background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)",
              borderRadius: 9, color: "rgba(255,255,255,.8)", fontSize: 12, outline: "none",
              fontFamily: "'DM Sans',sans-serif",
            }}
          />
        </div>
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
          {isLoading ? (
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <Loader2 style={{ width: 18, height: 18, color: "#3b82f6", animation: "spin 1s linear infinite" }} />
            </div>
          ) : unlinked.length === 0 ? (
            <p style={{ fontSize: 12, color: "rgba(255,255,255,.3)", textAlign: "center", padding: "20px 0" }}>
              No unlinked calls available
            </p>
          ) : unlinked.map(call => (
            <button
              key={call.id}
              onClick={async () => {
                await attachCall.mutateAsync({ callId: call.id, dealId });
                onClose();
              }}
              disabled={attachCall.isPending}
              style={{
                display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)",
                borderRadius: 10, cursor: "pointer", textAlign: "left", width: "100%",
                fontFamily: "'DM Sans',sans-serif", transition: ".12s",
              }}
            >
              <div style={{
                width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                background: "rgba(59,130,246,.12)", display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Phone style={{ width: 13, height: 13, color: "#60a5fa" }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "#f0f6fc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {call.name}
                </p>
                <p style={{ margin: 0, fontSize: 10, color: "rgba(255,255,255,.3)" }}>
                  {format(new Date(call.date), "MMM d, yyyy")}
                  {call.duration_minutes ? ` · ${call.duration_minutes}min` : ""}
                  {call.sentiment_score ? ` · ${call.sentiment_score}% sentiment` : ""}
                </p>
              </div>
              <ChevronRight style={{ width: 12, height: 12, color: "rgba(255,255,255,.2)", flexShrink: 0 }} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Deal detail panel ────────────────────────────────────────────────────────

function DealDetailPanel({ dealId, onBack }: { dealId: string; onBack: () => void }) {
  const { useDealDetail, generateSummary, updateDeal, deleteDeal } = useDeals();
  const { data, isLoading, error } = useDealDetail(dealId);
  const navigate = useNavigate();
  const [showAttach, setShowAttach] = useState(false);
  const [editStage, setEditStage] = useState(false);

  if (isLoading) return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <Loader2 style={{ width: 22, height: 22, color: "#3b82f6", animation: "spin 1s linear infinite" }} />
    </div>
  );

  if (error || !data) return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 10, color: "rgba(255,255,255,.3)" }}>
      <AlertCircle style={{ width: 28, height: 28 }} />
      <p style={{ margin: 0, fontSize: 13 }}>Failed to load deal</p>
    </div>
  );

  const { deal, calls, summary, events } = data;
  const cfg = DEAL_STAGE_CFG[deal.stage];
  const avgSentiment = calls.length
    ? Math.round(calls.filter(c => c.sentiment_score != null).reduce((s, c) => s + (c.sentiment_score || 0), 0) / calls.filter(c => c.sentiment_score != null).length)
    : null;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
      {/* Header */}
      <div style={{
        padding: "12px 14px", borderBottom: "1px solid rgba(255,255,255,.07)",
        background: "rgba(11,15,28,.9)", flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={onBack}
            style={{
              background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.08)",
              borderRadius: 8, width: 30, height: 30, minWidth: 30, display: "flex", alignItems: "center",
              justifyContent: "center", cursor: "pointer", color: "rgba(255,255,255,.5)",
              flexShrink: 0,
            }}
          >
            <ArrowLeft style={{ width: 14, height: 14 }} />
          </button>
          <div style={{
            width: 36, height: 36, borderRadius: 9, flexShrink: 0,
            background: cfg.bg, display: "flex", alignItems: "center",
            justifyContent: "center", fontSize: 16,
          }}>
            {cfg.icon}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{
              margin: 0, fontSize: 15, fontWeight: 800, color: "#f0f6fc",
              fontFamily: "'Bricolage Grotesque',sans-serif",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {deal.name}
            </h2>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,.38)", marginTop: 1 }}>
              {deal.company && <span>{deal.company}</span>}
              {deal.contact_name && <span> · {deal.contact_name}</span>}
            </div>
          </div>

          {/* Stage picker */}
          <div style={{ position: "relative", flexShrink: 0 }}>
            <button onClick={() => setEditStage(p => !p)} style={{ background: "none", border: "none", cursor: "pointer" }}>
              <StagePill stage={deal.stage} />
            </button>
            {editStage && (
              <div style={{
                position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 50,
                background: "rgba(10,13,22,.98)", border: "1px solid rgba(255,255,255,.1)",
                borderRadius: 12, padding: 6, minWidth: 160,
                boxShadow: "0 20px 60px rgba(0,0,0,.7)",
              }}>
                {(Object.entries(DEAL_STAGE_CFG) as [DealStageValue, any][])
                  .sort((a, b) => a[1].order - b[1].order)
                  .map(([k, v]) => (
                    <button key={k} onClick={async () => {
                      await updateDeal.mutateAsync({ id: deal.id, stage: k });
                      setEditStage(false);
                    }} style={{
                      display: "flex", alignItems: "center", gap: 8, width: "100%",
                      padding: "8px 10px", borderRadius: 8, background: deal.stage === k ? v.bg : "transparent",
                      border: "none", cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
                    }}>
                      <span style={{ fontSize: 14 }}>{v.icon}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: v.color }}>{v.label}</span>
                      {deal.stage === k && <Check style={{ width: 12, height: 12, color: v.color, marginLeft: "auto" }} />}
                    </button>
                  ))}
              </div>
            )}
          </div>
        </div>

        {/* Stats row — scrollable on mobile */}
        <div style={{
          display: "flex", gap: 12, marginTop: 10, flexWrap: "nowrap",
          overflowX: "auto", paddingBottom: 2,
          msOverflowStyle: "none", scrollbarWidth: "none",
        }}>
          {[
            { label: "Calls", value: String(calls.length), icon: Phone, color: "#60a5fa" },
            { label: "Sentiment", value: avgSentiment != null ? `${avgSentiment}%` : "—", icon: BarChart3, color: avgSentiment != null ? (avgSentiment >= 70 ? "#22c55e" : avgSentiment >= 40 ? "#f59e0b" : "#ef4444") : "#94a3b8" },
            { label: "Risk", value: deal.risk_score != null ? `${deal.risk_score}/100` : "—", icon: Shield, color: deal.risk_score != null ? (deal.risk_score >= 70 ? "#ef4444" : deal.risk_score >= 40 ? "#f59e0b" : "#22c55e") : "#94a3b8" },
            ...(deal.value ? [{ label: "Value", value: `$${deal.value.toLocaleString()}`, icon: DollarSign, color: "#34d399" }] : []),
          ].map(s => (
            <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
              <s.icon style={{ width: 11, height: 11, color: "rgba(255,255,255,.3)" }} />
              <span style={{ fontSize: 11, color: "rgba(255,255,255,.35)" }}>{s.label}:</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: s.color }}>{s.value}</span>
            </div>
          ))}
          {deal.sentiment_trend && (
            <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
              <TrendIcon trend={deal.sentiment_trend} />
              <span style={{ fontSize: 11, color: "rgba(255,255,255,.35)" }}>
                {deal.sentiment_trend === "improving" ? "Improving" : deal.sentiment_trend === "declining" ? "Declining" : "Stable"}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "14px 14px" }}>

        {/* AI Deal Intelligence */}
        <div style={{
          background: "linear-gradient(135deg, rgba(59,130,246,.08), rgba(147,51,234,.06))",
          border: "1px solid rgba(59,130,246,.2)", borderRadius: 14, padding: 14, marginBottom: 16,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: summary ? 10 : 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <Sparkles style={{ width: 14, height: 14, color: "#60a5fa" }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: "#f0f6fc", fontFamily: "'Bricolage Grotesque',sans-serif" }}>
                AI Intelligence
              </span>
              {summary && (
                <span style={{ fontSize: 10, color: "rgba(255,255,255,.3)" }}>
                  · {format(new Date(summary.generated_at), "MMM d")}
                </span>
              )}
            </div>
            <button
              onClick={() => generateSummary.mutate(deal.id)}
              disabled={generateSummary.isPending || calls.length === 0}
              style={{
                display: "flex", alignItems: "center", gap: 5, padding: "5px 10px",
                background: "rgba(59,130,246,.15)", border: "1px solid rgba(59,130,246,.3)",
                borderRadius: 8, color: "#60a5fa", fontSize: 11, fontWeight: 600,
                cursor: calls.length > 0 ? "pointer" : "not-allowed", fontFamily: "'DM Sans',sans-serif",
                opacity: calls.length === 0 ? .4 : 1,
              }}
            >
              {generateSummary.isPending
                ? <Loader2 style={{ width: 11, height: 11, animation: "spin 1s linear infinite" }} />
                : <RefreshCw style={{ width: 11, height: 11 }} />}
              {summary ? "Refresh" : "Generate"}
            </button>
          </div>

          {generateSummary.isPending && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 0", color: "rgba(255,255,255,.4)", fontSize: 12 }}>
              <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} />
              Analyzing {calls.length} call{calls.length !== 1 ? "s" : ""}…
            </div>
          )}

          {!summary && !generateSummary.isPending && (
            <p style={{ fontSize: 12, color: "rgba(255,255,255,.3)", margin: "8px 0 0", lineHeight: 1.6 }}>
              {calls.length === 0
                ? "Link at least one call to generate AI intelligence on this deal."
                : `Click Generate to analyze ${calls.length} call${calls.length !== 1 ? "s" : ""}.`}
            </p>
          )}

          {summary && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <p style={{ margin: 0, fontSize: 13, color: "rgba(255,255,255,.78)", lineHeight: 1.65 }}>
                {summary.summary}
              </p>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {summary.open_objections?.length > 0 && (
                  <IntelSection label="Open Objections" color="#ef4444" items={summary.open_objections} />
                )}
                {summary.buying_signals?.length > 0 && (
                  <IntelSection label="Buying Signals" color="#22c55e" items={summary.buying_signals} />
                )}
                {summary.risks?.length > 0 && (
                  <IntelSection label="Risks" color="#f59e0b" items={summary.risks} />
                )}
                {summary.key_themes?.length > 0 && (
                  <IntelSection label="Key Themes" color="#a78bfa" items={summary.key_themes} />
                )}
              </div>

              {summary.recommended_actions?.length > 0 && (
                <div style={{
                  background: "rgba(59,130,246,.07)", border: "1px solid rgba(59,130,246,.15)",
                  borderRadius: 10, padding: "10px 13px",
                }}>
                  <p style={{ margin: "0 0 7px", fontSize: 10, fontWeight: 700, color: "#60a5fa", textTransform: "uppercase", letterSpacing: ".07em" }}>
                    🎯 Recommended Actions
                  </p>
                  <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 5 }}>
                    {summary.recommended_actions.map((a, i) => (
                      <li key={i} style={{ display: "flex", gap: 7, fontSize: 12, color: "rgba(255,255,255,.75)", lineHeight: 1.5 }}>
                        <span style={{ color: "#60a5fa", fontWeight: 700, flexShrink: 0 }}>{i + 1}.</span>
                        {a}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Next step */}
        {deal.next_step && (
          <div style={{
            display: "flex", alignItems: "flex-start", gap: 9, padding: "10px 13px",
            background: "rgba(96,165,250,.06)", border: "1px solid rgba(96,165,250,.15)",
            borderRadius: 11, marginBottom: 16,
          }}>
            <Target style={{ width: 14, height: 14, color: "#60a5fa", flexShrink: 0, marginTop: 1 }} />
            <div>
              <span style={{ fontSize: 10, fontWeight: 700, color: "#60a5fa", textTransform: "uppercase", letterSpacing: ".07em", display: "block", marginBottom: 3 }}>Next Step</span>
              <span style={{ fontSize: 13, color: "rgba(255,255,255,.8)" }}>{deal.next_step}</span>
            </div>
          </div>
        )}

        {/* Call timeline */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,.8)", fontFamily: "'Bricolage Grotesque',sans-serif" }}>
              Call History ({calls.length})
            </h3>
            <button
              onClick={() => setShowAttach(true)}
              style={{
                display: "flex", alignItems: "center", gap: 5, padding: "6px 12px",
                background: "rgba(59,130,246,.12)", border: "1px solid rgba(59,130,246,.25)",
                borderRadius: 8, color: "#60a5fa", fontSize: 12, fontWeight: 600,
                cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
              }}
            >
              <Plus style={{ width: 12, height: 12 }} /> Link Call
            </button>
          </div>

          {calls.length === 0 ? (
            <div style={{
              padding: "28px 16px", textAlign: "center",
              background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.06)",
              borderRadius: 13, color: "rgba(255,255,255,.25)",
            }}>
              <Phone style={{ width: 26, height: 26, margin: "0 auto 8px", opacity: .3 }} />
              <p style={{ margin: 0, fontSize: 12 }}>No calls linked yet</p>
              <p style={{ margin: "4px 0 0", fontSize: 11, color: "rgba(255,255,255,.15)" }}>
                Link existing calls or complete a new one
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 0, position: "relative" }}>
              {/* Timeline line */}
              <div style={{ position: "absolute", left: 16, top: 20, bottom: 20, width: 1, background: "rgba(255,255,255,.07)" }} />

              {calls.map((call, i) => {
                const sentColor = call.sentiment_score != null
                  ? call.sentiment_score >= 70 ? "#22c55e" : call.sentiment_score >= 40 ? "#f59e0b" : "#ef4444"
                  : "rgba(255,255,255,.3)";
                return (
                  <div key={call.id} style={{ display: "flex", gap: 12, paddingBottom: 12, position: "relative" }}>
                    {/* Dot */}
                    <div style={{
                      width: 33, height: 33, borderRadius: "50%", flexShrink: 0,
                      background: "rgba(59,130,246,.12)", border: "1px solid rgba(59,130,246,.25)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      zIndex: 1, marginTop: 4,
                    }}>
                      <Phone style={{ width: 12, height: 12, color: "#60a5fa" }} />
                    </div>

                    {/* Content */}
                    <div style={{
                      flex: 1, background: "rgba(255,255,255,.025)", border: "1px solid rgba(255,255,255,.06)",
                      borderRadius: 12, padding: "10px 12px", minWidth: 0,
                    }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                        <Link
                          to={`/dashboard/calls/${call.id}`}
                          style={{
                            fontSize: 13, fontWeight: 700, color: "#f0f6fc", textDecoration: "none",
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1,
                          }}
                        >
                          {call.name}
                        </Link>
                        <Link to={`/dashboard/calls/${call.id}`} style={{ color: "rgba(255,255,255,.25)", flexShrink: 0 }}>
                          <ExternalLink style={{ width: 11, height: 11 }} />
                        </Link>
                      </div>

                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: call.call_summary ? 8 : 0 }}>
                        <span style={{ fontSize: 10, color: "rgba(255,255,255,.3)", display: "flex", alignItems: "center", gap: 3 }}>
                          <Calendar style={{ width: 9, height: 9 }} />
                          {format(new Date(call.date), "MMM d, yyyy")}
                        </span>
                        {call.duration_minutes && (
                          <span style={{ fontSize: 10, color: "rgba(255,255,255,.3)", display: "flex", alignItems: "center", gap: 3 }}>
                            <Clock style={{ width: 9, height: 9 }} />
                            {call.duration_minutes}min
                          </span>
                        )}
                        {call.sentiment_score != null && (
                          <span style={{ fontSize: 10, fontWeight: 600, color: sentColor }}>
                            {call.sentiment_score}% sentiment
                          </span>
                        )}
                        {call.meeting_type && (
                          <span style={{ fontSize: 10, color: "rgba(255,255,255,.25)", textTransform: "capitalize" }}>
                            {call.meeting_type.replace("_", " ")}
                          </span>
                        )}
                      </div>

                      {call.call_summary && (
                        <p style={{
                          margin: 0, fontSize: 11, color: "rgba(255,255,255,.5)", lineHeight: 1.55,
                          overflow: "hidden", display: "-webkit-box",
                          WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                        }}>
                          {call.call_summary}
                        </p>
                      )}

                      {call.next_steps && call.next_steps.length > 0 && (
                        <div style={{ marginTop: 7, display: "flex", flexDirection: "column", gap: 2 }}>
                          {call.next_steps.slice(0, 2).map((ns, j) => (
                            <span key={j} style={{ fontSize: 10, color: "#60a5fa", display: "flex", alignItems: "center", gap: 4 }}>
                              <ChevronRight style={{ width: 9, height: 9, flexShrink: 0 }} />
                              {ns}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Timeline events */}
        {events.length > 0 && (
          <div>
            <h3 style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,.8)", fontFamily: "'Bricolage Grotesque',sans-serif" }}>
              Activity Log
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {events.slice(0, 15).map(ev => (
                <div key={ev.id} style={{
                  display: "flex", alignItems: "flex-start", gap: 10,
                  padding: "8px 11px", background: "rgba(255,255,255,.02)",
                  border: "1px solid rgba(255,255,255,.04)", borderRadius: 9,
                }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                    background: ev.event_type === "ai_summary_generated" ? "rgba(96,165,250,.12)"
                      : ev.event_type === "stage_changed" ? "rgba(167,139,250,.12)"
                      : "rgba(255,255,255,.06)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11,
                  }}>
                    {ev.event_type === "ai_summary_generated" ? "✨"
                      : ev.event_type === "stage_changed" ? "→"
                      : ev.event_type === "call_added" ? "📞"
                      : "•"}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,.65)", fontWeight: 500 }}>{ev.title}</p>
                    {ev.detail && (
                      <p style={{ margin: "2px 0 0", fontSize: 11, color: "rgba(255,255,255,.35)", lineHeight: 1.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {ev.detail}
                      </p>
                    )}
                  </div>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,.2)", flexShrink: 0 }}>
                    {format(new Date(ev.happened_at), "MMM d")}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {showAttach && (
        <AttachCallModal dealId={deal.id} dealName={deal.name} onClose={() => setShowAttach(false)} />
      )}
    </div>
  );
}

// ─── Intel section helper ─────────────────────────────────────────────────────

function IntelSection({ label, color, items }: { label: string; color: string; items: string[] }) {
  return (
    <div style={{
      background: `${color}0d`, border: `1px solid ${color}25`,
      borderRadius: 10, padding: "9px 11px",
    }}>
      <p style={{ margin: "0 0 6px", fontSize: 10, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: ".07em" }}>
        {label}
      </p>
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 3 }}>
        {items.slice(0, 3).map((item, i) => (
          <li key={i} style={{ fontSize: 11, color: "rgba(255,255,255,.65)", lineHeight: 1.45, display: "flex", gap: 5 }}>
            <span style={{ color, flexShrink: 0 }}>·</span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function DealsPage() {
  const { deals, isLoading, pipeline } = useDeals();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<DealStageValue | "all">("all");
  const [showCreate, setShowCreate] = useState(false);
  // Mobile view: "list" | "detail"
  const [mobileView, setMobileView] = useState<"list" | "detail">("list");

  const filtered = useMemo(() =>
    deals.filter(d => {
      if (stageFilter !== "all" && d.stage !== stageFilter) return false;
      if (search && !d.name.toLowerCase().includes(search.toLowerCase()) &&
        !(d.company || "").toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    }),
    [deals, search, stageFilter]
  );

  const groupedByStage = useMemo(() => {
    const groups: { stage: DealStageValue; deals: DealListItem[] }[] = [];
    const stageOrder: DealStageValue[] = ["discovery", "demo", "negotiation", "proposal", "won", "lost", "on_hold"];
    stageOrder.forEach(stage => {
      const stageDeal = filtered.filter(d => d.stage === stage);
      if (stageDeal.length > 0) groups.push({ stage, deals: stageDeal });
    });
    return groups;
  }, [filtered]);

  const handleSelectDeal = (id: string) => {
    setSelectedId(id);
    setMobileView("detail");
  };

  const handleBack = () => {
    setSelectedId(null);
    setMobileView("list");
  };

  return (
    <DashboardLayout>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }

        .deals-page {
          display: flex;
          height: calc(100vh - 7rem);
          overflow: hidden;
          margin: -28px;
          background: #060912;
          border-radius: 0;
          font-family: 'DM Sans', system-ui, sans-serif;
        }

        /* Sidebar */
        .deals-sidebar {
          width: 300px;
          flex-shrink: 0;
          border-right: 1px solid rgba(255,255,255,.07);
          background: #0b0f1c;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        /* Detail panel */
        .deals-detail {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-width: 0;
          background: rgba(6,9,18,.7);
        }

        /* ── Mobile: show only one panel at a time ── */
        @media (max-width: 767px) {
          .deals-page {
            margin: -16px;
            height: calc(100dvh - 4rem);
          }

          .deals-sidebar {
            width: 100%;
            border-right: none;
          }

          .deals-sidebar--hidden {
            display: none;
          }

          .deals-detail--hidden {
            display: none;
          }

          .deals-detail {
            width: 100%;
          }
        }

        /* Stage filter — horizontal scroll on mobile */
        .stage-filters {
          display: flex;
          gap: 4px;
          margin-top: 8px;
          overflow-x: auto;
          padding-bottom: 2px;
          flex-wrap: nowrap;
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .stage-filters::-webkit-scrollbar { display: none; }

        /* Stats row — always 3 columns */
        .pipeline-stats {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 6px;
          margin-bottom: 10px;
        }

        /* Intel grid — responsive */
        .intel-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }
        @media (max-width: 400px) {
          .intel-grid {
            grid-template-columns: 1fr;
          }
        }

        /* Create deal modal — responsive grid */
        .create-deal-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }
        @media (max-width: 380px) {
          .create-deal-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <div className="deals-page">
        {/* ── Sidebar ── */}
        <div className={cn("deals-sidebar", mobileView === "detail" && "deals-sidebar--hidden")}>
          {/* Sidebar header */}
          <div style={{ padding: "14px 12px 10px", flexShrink: 0, borderBottom: "1px solid rgba(255,255,255,.06)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 8,
                  background: "rgba(59,130,246,.15)", border: "1px solid rgba(59,130,246,.25)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Building2 style={{ width: 13, height: 13, color: "#60a5fa" }} />
                </div>
                <h1 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: "#f0f6fc", fontFamily: "'Bricolage Grotesque',sans-serif" }}>
                  Deal Pipeline
                </h1>
              </div>
              <button
                onClick={() => setShowCreate(true)}
                style={{
                  width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                  background: "rgba(59,130,246,.15)", border: "1px solid rgba(59,130,246,.3)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer", color: "#60a5fa",
                }}
              >
                <Plus style={{ width: 14, height: 14 }} />
              </button>
            </div>

            {/* Pipeline stats */}
            <div className="pipeline-stats">
              {[
                { label: "Active", value: pipeline.active, color: "#60a5fa" },
                { label: "Won", value: pipeline.won, color: "#22c55e" },
                { label: "Total", value: pipeline.total, color: "rgba(255,255,255,.7)" },
              ].map(s => (
                <div key={s.label} style={{
                  background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.05)",
                  borderRadius: 9, padding: "7px 8px", textAlign: "center",
                }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: s.color, fontFamily: "'Bricolage Grotesque',sans-serif", lineHeight: 1 }}>{s.value}</div>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,.3)", textTransform: "uppercase", letterSpacing: ".05em", marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Search */}
            <div style={{ position: "relative" }}>
              <Search style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", width: 12, height: 12, color: "rgba(255,255,255,.25)" }} />
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search deals…"
                style={{
                  width: "100%", paddingLeft: 28, paddingRight: 10, paddingTop: 8, paddingBottom: 8,
                  background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)",
                  borderRadius: 9, color: "rgba(255,255,255,.8)", fontSize: 14,
                  fontFamily: "'DM Sans',sans-serif", outline: "none",
                }}
              />
            </div>

            {/* Stage filter tabs — horizontal scroll */}
            <div className="stage-filters">
              <button
                onClick={() => setStageFilter("all")}
                style={{
                  padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: "pointer",
                  background: stageFilter === "all" ? "rgba(255,255,255,.12)" : "transparent",
                  border: `1px solid ${stageFilter === "all" ? "rgba(255,255,255,.2)" : "transparent"}`,
                  color: stageFilter === "all" ? "#f0f6fc" : "rgba(255,255,255,.35)",
                  fontFamily: "'DM Sans',sans-serif", whiteSpace: "nowrap", flexShrink: 0,
                }}
              >
                All
              </button>
              {(["discovery","demo","negotiation","won"] as DealStageValue[]).map(s => {
                const cfg = DEAL_STAGE_CFG[s];
                const on = stageFilter === s;
                return (
                  <button key={s} onClick={() => setStageFilter(on ? "all" : s)} style={{
                    padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: "pointer",
                    background: on ? cfg.bg : "transparent",
                    border: `1px solid ${on ? cfg.color + "40" : "transparent"}`,
                    color: on ? cfg.color : "rgba(255,255,255,.35)",
                    fontFamily: "'DM Sans',sans-serif", whiteSpace: "nowrap", flexShrink: 0,
                  }}>
                    {cfg.icon} {cfg.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Deal list */}
          <div style={{ flex: 1, overflowY: "auto", padding: "8px 8px" }}>
            {isLoading ? (
              <div style={{ display: "flex", justifyContent: "center", paddingTop: 40 }}>
                <Loader2 style={{ width: 18, height: 18, color: "#3b82f6", animation: "spin 1s linear infinite" }} />
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 16px", color: "rgba(255,255,255,.2)" }}>
                <Building2 style={{ width: 28, height: 28, margin: "0 auto 8px", opacity: .3 }} />
                <p style={{ fontSize: 12, margin: 0 }}>
                  {deals.length === 0 ? "No deals yet" : "No deals match filters"}
                </p>
                {deals.length === 0 && (
                  <button onClick={() => setShowCreate(true)} style={{
                    marginTop: 12, display: "inline-flex", alignItems: "center", gap: 5,
                    background: "rgba(59,130,246,.15)", border: "1px solid rgba(59,130,246,.3)",
                    borderRadius: 8, padding: "8px 16px", color: "#60a5fa", fontSize: 13, fontWeight: 600,
                    cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
                  }}>
                    <Plus style={{ width: 12, height: 12 }} /> Create first deal
                  </button>
                )}
              </div>
            ) : stageFilter !== "all" ? (
              filtered.map(d => (
                <DealCard key={d.id} deal={d} isSelected={selectedId === d.id} onClick={() => handleSelectDeal(d.id)} />
              ))
            ) : (
              groupedByStage.map(({ stage, deals: stageDeal }) => {
                const cfg = DEAL_STAGE_CFG[stage];
                return (
                  <div key={stage} style={{ marginBottom: 6 }}>
                    <div style={{
                      display: "flex", alignItems: "center", gap: 5, padding: "5px 4px 4px",
                    }}>
                      <span style={{ fontSize: 11 }}>{cfg.icon}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: cfg.color, textTransform: "uppercase", letterSpacing: ".07em" }}>
                        {cfg.label}
                      </span>
                      <span style={{
                        fontSize: 9, background: cfg.bg, color: cfg.color,
                        borderRadius: 10, padding: "1px 6px", fontWeight: 700,
                      }}>
                        {stageDeal.length}
                      </span>
                    </div>
                    {stageDeal.map(d => (
                      <DealCard key={d.id} deal={d} isSelected={selectedId === d.id} onClick={() => handleSelectDeal(d.id)} />
                    ))}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ── Main content ── */}
        <div className={cn("deals-detail", mobileView === "list" && !selectedId ? "deals-detail--hidden" : "", !selectedId && "deals-detail--hidden")}>
          {selectedId ? (
            <DealDetailPanel
              key={selectedId}
              dealId={selectedId}
              onBack={handleBack}
            />
          ) : (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 32 }}>
              <div style={{
                width: 72, height: 72, borderRadius: 20, marginBottom: 20,
                background: "rgba(59,130,246,.08)", border: "1px solid rgba(59,130,246,.15)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Building2 style={{ width: 30, height: 30, color: "#60a5fa", opacity: .7 }} />
              </div>
              <h2 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 800, color: "#64748b", fontFamily: "'Bricolage Grotesque',sans-serif" }}>
                Deal Intelligence
              </h2>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,.22)", maxWidth: 300, lineHeight: 1.65, margin: "0 0 24px" }}>
                Select a deal to view its complete call history, AI analysis, and deal intelligence.
              </p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
                {[
                  { icon: Phone, text: "All calls in one thread" },
                  { icon: Sparkles, text: "AI deal intelligence" },
                  { icon: TrendingUp, text: "Sentiment trends" },
                  { icon: Target, text: "Next step guidance" },
                ].map(({ icon: Icon, text }) => (
                  <div key={text} style={{
                    display: "flex", alignItems: "center", gap: 7,
                    background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.07)",
                    borderRadius: 10, padding: "8px 13px", fontSize: 12, color: "rgba(255,255,255,.35)",
                  }}>
                    <Icon style={{ width: 13, height: 13, color: "#60a5fa" }} />
                    {text}
                  </div>
                ))}
              </div>
              {deals.length === 0 && (
                <button onClick={() => setShowCreate(true)} style={{
                  marginTop: 22, display: "inline-flex", alignItems: "center", gap: 7,
                  background: "linear-gradient(135deg,#3b82f6,#2563eb)",
                  border: "none", borderRadius: 11, padding: "11px 22px",
                  color: "#fff", fontSize: 13, fontWeight: 700,
                  cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
                  boxShadow: "0 4px 14px rgba(59,130,246,.35)",
                }}>
                  <Plus style={{ width: 14, height: 14 }} /> Create Your First Deal
                </button>
              )}
            </div>
          )}
        </div>

        {/* Desktop empty state when no deal selected */}
        <style>{`
          @media (min-width: 768px) {
            .deals-detail--hidden {
              display: flex !important;
            }
          }
        `}</style>
      </div>

      {showCreate && (
        <CreateDealModal
          onClose={() => setShowCreate(false)}
          onCreated={id => { setShowCreate(false); handleSelectDeal(id); }}
        />
      )}
    </DashboardLayout>
  );
}