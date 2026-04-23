/**
 * MessagesPage.tsx — Deal-Driven Revenue Communication Layer
 * 
 * Layout: Left sidebar (channels) | Center (chat) | Right (deal context)
 * Philosophy: Every message tied to a deal, a call, or an action.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { LockedCard } from "@/components/plan/PlanGate";
import { usePlanEnforcement } from "@/contexts/PlanEnforcementContext";
import { useAuth } from "@/contexts/AuthContext";
import { useTeam } from "@/hooks/useTeam";
import { supabase } from "@/integrations/supabase/client";
import { format, isToday, isYesterday, formatDistanceToNow } from "date-fns";
import {
  Send, Plus, Search, Hash, X, Loader2, AlertTriangle,
  TrendingUp, TrendingDown, Minus, Sparkles, Phone,
  CheckCircle2, Circle, Pin, AtSign, MessageSquare,
  ChevronRight, Zap, Target, BarChart3, Clock,
  Building2, User, ArrowRight, Info, Bell
} from "lucide-react";
import { toast } from "sonner";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

interface DealChannel {
  id: string;
  name: string;
  type: "deal" | "call" | "team";
  deal_id: string | null;
  call_id: string | null;
  deal_name: string | null;
  deal_stage: string | null;
  deal_value: number | null;
  call_name: string | null;
  last_msg: string | null;
  last_msg_at: string | null;
  unread_count: number;
  msg_count: number;
}

interface ChannelMessage {
  id: string;
  channel_id: string;
  user_id: string | null;
  parent_id: string | null;
  content: string;
  type: "text" | "ai" | "system" | "call_insight";
  metadata: Record<string, any>;
  is_pinned: boolean;
  created_at: string;
  sender_name: string | null;
  sender_email: string | null;
  reply_count: number;
}

interface MessageTask {
  id: string;
  message_id: string;
  title: string;
  assigned_to: string | null;
  due_date: string | null;
  is_completed: boolean;
  created_at: string;
}

interface Deal {
  id: string;
  name: string;
  company: string | null;
  stage: string;
  value: number | null;
  next_step: string | null;
  sentiment_trend: string | null;
  risk_score: number | null;
  probability: number | null;
  close_date: string | null;
}

// ═══════════════════════════════════════════════════════════════
// CONSTANTS & HELPERS
// ═══════════════════════════════════════════════════════════════

const STAGE_COLORS: Record<string, { color: string; bg: string; label: string }> = {
  discovery:   { color: "#60a5fa", bg: "rgba(96,165,250,.12)",  label: "Discovery" },
  demo:        { color: "#a78bfa", bg: "rgba(167,139,250,.12)", label: "Demo" },
  negotiation: { color: "#fbbf24", bg: "rgba(251,191,36,.12)",  label: "Negotiation" },
  proposal:    { color: "#34d399", bg: "rgba(52,211,153,.12)",  label: "Proposal" },
  won:         { color: "#22c55e", bg: "rgba(34,197,94,.12)",   label: "Won" },
  lost:        { color: "#ef4444", bg: "rgba(239,68,68,.12)",   label: "Lost" },
  new:         { color: "#94a3b8", bg: "rgba(148,163,184,.12)", label: "New" },
};

function getStage(stage: string) {
  return STAGE_COLORS[stage?.toLowerCase()] ?? STAGE_COLORS.new;
}

function formatCurrency(value: number | null) {
  if (!value) return null;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toLocaleString()}`;
}

function msgTime(dateStr: string) {
  const d = new Date(dateStr);
  if (isToday(d)) return format(d, "h:mm a");
  if (isYesterday(d)) return "Yesterday";
  return format(d, "MMM d");
}

function getInitial(name: string | null) {
  if (!name) return "?";
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

// ═══════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════

// ─── Channel type icon ────────────────────────────────────────
function ChannelIcon({ type, size = 12 }: { type: string; size?: number }) {
  const s = { width: size, height: size, flexShrink: 0 as const };
  if (type === "call")   return <Phone style={s} />;
  if (type === "team")   return <Hash style={s} />;
  return <Hash style={s} />;
}

// ─── Sender avatar ────────────────────────────────────────────
function Avatar({ name, size = 28, isAI = false }: { name: string | null; size?: number; isAI?: boolean }) {
  const initials = isAI ? "AI" : getInitial(name);
  const bg = isAI ? "linear-gradient(135deg,#7c3aed,#4f46e5)" : "rgba(14,245,212,.15)";
  const border = isAI ? "1px solid rgba(124,58,237,.4)" : "1px solid rgba(14,245,212,.25)";
  const color = isAI ? "#e9d5ff" : "#0ef5d4";
  return (
    <div style={{
      width: size, height: size, borderRadius: size * 0.3, flexShrink: 0,
      background: bg, border, display: "flex", alignItems: "center",
      justifyContent: "center", fontSize: size * 0.36, fontWeight: 700,
      color, fontFamily: "'DM Sans',sans-serif", letterSpacing: "-0.3px",
    }}>{initials}</div>
  );
}

// ─── Call insight card (AI system message) ────────────────────
function CallInsightCard({ msg }: { msg: ChannelMessage }) {
  const m = msg.metadata;
  const sentiment = m.sentiment_score ?? null;
  const score = m.meeting_score ?? null;
  const steps = (m.next_steps ?? []) as string[];
  const objCount = m.objections_count ?? 0;
  const sentimentColor = sentiment == null ? "#94a3b8"
    : sentiment >= 65 ? "#22c55e"
    : sentiment >= 40 ? "#fbbf24" : "#ef4444";

  return (
    <div style={{
      margin: "12px 0",
      border: "1px solid rgba(99,102,241,.25)",
      borderRadius: 12,
      background: "linear-gradient(135deg,rgba(99,102,241,.06),rgba(124,58,237,.04))",
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        padding: "10px 14px", borderBottom: "1px solid rgba(99,102,241,.12)",
        display: "flex", alignItems: "center", gap: 8,
        background: "rgba(99,102,241,.08)",
      }}>
        <Sparkles style={{ width: 13, height: 13, color: "#818cf8", flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: "#c7d2fe" }}>
          📞 {m.call_name ?? "Call"} — AI Insights
        </span>
        <span style={{ marginLeft: "auto", fontSize: 10, color: "rgba(255,255,255,.3)" }}>
          {msgTime(msg.created_at)}
        </span>
      </div>

      {/* Metrics row */}
      <div style={{ padding: "10px 14px", display: "flex", gap: 16, flexWrap: "wrap" as const }}>
        {sentiment != null && (
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: sentimentColor }} />
            <span style={{ fontSize: 11, color: "rgba(255,255,255,.5)" }}>Sentiment</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: sentimentColor }}>{sentiment}%</span>
          </div>
        )}
        {score != null && (
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <BarChart3 style={{ width: 10, height: 10, color: "#a78bfa" }} />
            <span style={{ fontSize: 11, color: "rgba(255,255,255,.5)" }}>Score</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#a78bfa" }}>{score}/100</span>
          </div>
        )}
        {objCount > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <AlertTriangle style={{ width: 10, height: 10, color: "#f97316" }} />
            <span style={{ fontSize: 11, color: "rgba(255,255,255,.5)" }}>Objections</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#f97316" }}>{objCount}</span>
          </div>
        )}
      </div>

      {/* Summary */}
      {m.summary && (
        <div style={{ padding: "0 14px 10px" }}>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,.6)", lineHeight: 1.6 }}>{m.summary}</p>
        </div>
      )}

      {/* Next steps */}
      {steps.length > 0 && (
        <div style={{ padding: "8px 14px", borderTop: "1px solid rgba(255,255,255,.04)" }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,.3)", marginBottom: 6, textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>
            Next Steps
          </p>
          {steps.slice(0, 3).map((step, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 6, marginBottom: 4 }}>
              <ChevronRight style={{ width: 10, height: 10, color: "#0ef5d4", marginTop: 2, flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: "rgba(255,255,255,.65)" }}>{step}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Message bubble ───────────────────────────────────────────
function MessageBubble({
  msg, isOwn, onCreateTask, onPinMessage,
}: {
  msg: ChannelMessage;
  isOwn: boolean;
  onCreateTask: (msg: ChannelMessage) => void;
  onPinMessage: (msgId: string) => void;
}) {
  const [hover, setHover] = useState(false);

  if (msg.type === "call_insight") return <CallInsightCard msg={msg} />;

  const isSystem = msg.type === "system" || msg.type === "ai";

  if (isSystem) {
    return (
      <div style={{
        textAlign: "center" as const, padding: "6px 0", margin: "4px 0",
      }}>
        <span style={{
          fontSize: 11, color: "rgba(255,255,255,.28)", background: "rgba(255,255,255,.04)",
          border: "1px solid rgba(255,255,255,.06)", borderRadius: 20, padding: "3px 12px",
        }}>
          {msg.content}
        </span>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex", flexDirection: isOwn ? "row-reverse" : "row",
        alignItems: "flex-end", gap: 8, marginBottom: 6, padding: "2px 0",
        position: "relative" as const,
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {!isOwn && <Avatar name={msg.sender_name} size={28} />}

      <div style={{ maxWidth: "68%", minWidth: 0 }}>
        {!isOwn && (
          <div style={{ fontSize: 10, color: "rgba(255,255,255,.35)", marginBottom: 3, paddingLeft: 4 }}>
            {msg.sender_name || msg.sender_email || "Unknown"}
          </div>
        )}
        <div style={{
          padding: "9px 13px",
          borderRadius: isOwn ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
          background: isOwn
            ? "linear-gradient(135deg,#0ef5d4,#0891b2)"
            : "rgba(255,255,255,.055)",
          border: isOwn ? "none" : "1px solid rgba(255,255,255,.08)",
          fontSize: 13, lineHeight: 1.55,
          color: isOwn ? "#060912" : "rgba(255,255,255,.88)",
          fontFamily: "'DM Sans',sans-serif",
          wordBreak: "break-word" as const,
          position: "relative" as const,
        }}>
          {msg.is_pinned && (
            <Pin style={{ width: 9, height: 9, position: "absolute" as const, top: 6, right: 6, opacity: 0.6, color: "#fbbf24" }} />
          )}
          {msg.content}
        </div>

        <div style={{
          display: "flex", alignItems: "center", gap: 8, marginTop: 3,
          justifyContent: isOwn ? "flex-end" : "flex-start", paddingLeft: isOwn ? 0 : 4,
        }}>
          <span style={{ fontSize: 9.5, color: "rgba(255,255,255,.2)" }}>
            {msgTime(msg.created_at)}
          </span>
          {msg.reply_count > 0 && (
            <span style={{ fontSize: 9.5, color: "#60a5fa" }}>{msg.reply_count} repl{msg.reply_count === 1 ? "y" : "ies"}</span>
          )}
        </div>
      </div>

      {/* Action hover buttons */}
      {hover && (
        <div style={{
          display: "flex", alignItems: "center", gap: 3,
          position: "absolute" as const, top: 0,
          [isOwn ? "left" : "right"]: 0,
          background: "rgba(13,17,32,.9)", border: "1px solid rgba(255,255,255,.08)",
          borderRadius: 8, padding: "3px 5px",
        }}>
          <button
            title="Create task"
            onClick={() => onCreateTask(msg)}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 3, borderRadius: 4, color: "rgba(255,255,255,.5)", display: "flex" }}
          >
            <CheckCircle2 style={{ width: 12, height: 12 }} />
          </button>
          <button
            title={msg.is_pinned ? "Unpin" : "Pin message"}
            onClick={() => onPinMessage(msg.id)}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 3, borderRadius: 4, color: msg.is_pinned ? "#fbbf24" : "rgba(255,255,255,.5)", display: "flex" }}
          >
            <Pin style={{ width: 12, height: 12 }} />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Channel list item ────────────────────────────────────────
function ChannelItem({
  ch, isActive, onClick,
}: { ch: DealChannel; isActive: boolean; onClick: () => void }) {
  const stageCfg = ch.deal_stage ? getStage(ch.deal_stage) : null;

  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 9, width: "100%",
        padding: "9px 12px", border: "none", textAlign: "left" as const,
        background: isActive ? "rgba(14,245,212,.07)" : "transparent",
        borderLeft: `2px solid ${isActive ? "#0ef5d4" : "transparent"}`,
        cursor: "pointer", transition: "all .12s",
      }}
    >
      {/* Channel type indicator */}
      <div style={{
        width: 30, height: 30, borderRadius: 8, flexShrink: 0,
        background: isActive ? "rgba(14,245,212,.12)" : "rgba(255,255,255,.04)",
        border: `1px solid ${isActive ? "rgba(14,245,212,.25)" : "rgba(255,255,255,.07)"}`,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <ChannelIcon type={ch.type} size={12} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}>
          <span style={{
            fontSize: 12.5, fontWeight: isActive ? 700 : 600,
            color: isActive ? "#f0f6fc" : "rgba(255,255,255,.7)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
            maxWidth: 120, fontFamily: "'DM Sans',sans-serif",
          }}>{ch.name}</span>
          {ch.last_msg_at && (
            <span style={{ fontSize: 9.5, color: "rgba(255,255,255,.25)", flexShrink: 0 }}>
              {msgTime(ch.last_msg_at)}
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 2 }}>
          <span style={{
            fontSize: 11, color: "rgba(255,255,255,.32)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, maxWidth: 140,
          }}>
            {ch.last_msg ?? "No messages yet"}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
            {stageCfg && (
              <span style={{
                fontSize: 8.5, fontWeight: 700, color: stageCfg.color,
                background: stageCfg.bg, borderRadius: 6, padding: "1px 5px",
              }}>{stageCfg.label}</span>
            )}
            {ch.unread_count > 0 && (
              <span style={{
                fontSize: 9.5, fontWeight: 700, color: "#060912",
                background: "#0ef5d4", borderRadius: 10, padding: "1px 5px",
              }}>{ch.unread_count > 99 ? "99+" : ch.unread_count}</span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

// ─── Create Task Modal ────────────────────────────────────────
function CreateTaskModal({
  message, channelId, dealId, teamId, members, onClose, onCreated,
}: {
  message: ChannelMessage;
  channelId: string;
  dealId: string | null;
  teamId: string | null;
  members: any[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const { user } = useAuth();
  const [title, setTitle] = useState(message.content.slice(0, 80));
  const [assignedTo, setAssignedTo] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const { error } = await (supabase as any).from("deal_message_tasks").insert({
        message_id: message.id,
        channel_id: channelId,
        team_id: teamId,
        deal_id: dealId,
        title: title.trim(),
        assigned_to: assignedTo || null,
        due_date: dueDate ? new Date(dueDate).toISOString() : null,
        created_by: user?.id,
      });
      if (error) throw error;
      toast.success("Task created!");
      onCreated();
      onClose();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: "fixed" as const, inset: 0, zIndex: 60,
      background: "rgba(0,0,0,.75)", backdropFilter: "blur(8px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }}>
      <div style={{
        width: "100%", maxWidth: 400, background: "#0e1220",
        border: "1px solid rgba(14,245,212,.2)", borderRadius: 16,
        padding: 20, boxShadow: "0 24px 64px rgba(0,0,0,.6)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: "rgba(14,245,212,.12)", border: "1px solid rgba(14,245,212,.25)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <CheckCircle2 style={{ width: 14, height: 14, color: "#0ef5d4" }} />
            </div>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#f0f6fc", fontFamily: "'DM Sans',sans-serif" }}>Create Task</span>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,.4)" }}>
            <X style={{ width: 15, height: 15 }} />
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column" as const, gap: 12 }}>
          {/* Task title */}
          <div>
            <label style={{ fontSize: 11, color: "rgba(255,255,255,.4)", display: "block", marginBottom: 6, fontFamily: "'DM Sans',sans-serif" }}>Task Title</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              style={{ width: "100%", padding: "9px 12px", background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 10, color: "#f0f6fc", fontSize: 13, fontFamily: "'DM Sans',sans-serif", outline: "none", boxSizing: "border-box" as const }}
            />
          </div>

          {/* Assign to */}
          {members.length > 0 && (
            <div>
              <label style={{ fontSize: 11, color: "rgba(255,255,255,.4)", display: "block", marginBottom: 6, fontFamily: "'DM Sans',sans-serif" }}>Assign To</label>
              <select
                value={assignedTo}
                onChange={e => setAssignedTo(e.target.value)}
                style={{ width: "100%", padding: "9px 12px", background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 10, color: "#f0f6fc", fontSize: 13, fontFamily: "'DM Sans',sans-serif", outline: "none" }}
              >
                <option value="" style={{ background: "#111" }}>Unassigned</option>
                {members.map((m: any) => (
                  <option key={m.user_id} value={m.user_id} style={{ background: "#111" }}>
                    {m.profile?.full_name || m.profile?.email || "Unknown"}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Due date */}
          <div>
            <label style={{ fontSize: 11, color: "rgba(255,255,255,.4)", display: "block", marginBottom: 6, fontFamily: "'DM Sans',sans-serif" }}>Due Date (optional)</label>
            <input
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              style={{ width: "100%", padding: "9px 12px", background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 10, color: "#f0f6fc", fontSize: 13, fontFamily: "'DM Sans',sans-serif", outline: "none", colorScheme: "dark" as const }}
            />
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={!title.trim() || saving}
          style={{
            width: "100%", marginTop: 16, padding: "11px", borderRadius: 10, border: "none",
            background: title.trim() ? "linear-gradient(135deg,#0ef5d4,#0891b2)" : "rgba(255,255,255,.06)",
            color: title.trim() ? "#060912" : "rgba(255,255,255,.3)",
            fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans',sans-serif",
            cursor: title.trim() ? "pointer" : "not-allowed",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          }}
        >
          {saving ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> : <CheckCircle2 style={{ width: 14, height: 14 }} />}
          {saving ? "Creating…" : "Create Task"}
        </button>
      </div>
    </div>
  );
}

// ─── New Channel Modal ────────────────────────────────────────
function NewChannelModal({
  teamId, deals, onClose, onCreated,
}: { teamId: string; deals: Deal[]; onClose: () => void; onCreated: () => void }) {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [type, setType] = useState<"deal" | "team">("team");
  const [dealId, setDealId] = useState("");
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) { toast.error("Channel name required"); return; }
    setSaving(true);
    try {
      const { error } = await (supabase as any).from("deal_channels").insert({
        team_id: teamId,
        deal_id: dealId || null,
        type: dealId ? "deal" : type,
        name: name.trim(),
        created_by: user?.id,
      });
      if (error) throw error;
      toast.success("Channel created!");
      onCreated();
      onClose();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: "fixed" as const, inset: 0, zIndex: 60,
      background: "rgba(0,0,0,.75)", backdropFilter: "blur(8px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }}>
      <div style={{
        width: "100%", maxWidth: 380, background: "#0e1220",
        border: "1px solid rgba(255,255,255,.1)", borderRadius: 16,
        padding: 20, boxShadow: "0 24px 64px rgba(0,0,0,.6)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#f0f6fc", fontFamily: "'DM Sans',sans-serif" }}>New Channel</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,.4)" }}>
            <X style={{ width: 15, height: 15 }} />
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column" as const, gap: 12 }}>
          <div>
            <label style={{ fontSize: 11, color: "rgba(255,255,255,.4)", display: "block", marginBottom: 6 }}>Name</label>
            <input
              value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. #acme-corp-deal"
              style={{ width: "100%", padding: "9px 12px", background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 10, color: "#f0f6fc", fontSize: 13, outline: "none", boxSizing: "border-box" as const, fontFamily: "'DM Sans',sans-serif" }}
            />
          </div>

          <div>
            <label style={{ fontSize: 11, color: "rgba(255,255,255,.4)", display: "block", marginBottom: 6 }}>Link to Deal (optional)</label>
            <select
              value={dealId} onChange={e => setDealId(e.target.value)}
              style={{ width: "100%", padding: "9px 12px", background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 10, color: "#f0f6fc", fontSize: 13, outline: "none", fontFamily: "'DM Sans',sans-serif" }}
            >
              <option value="" style={{ background: "#111" }}>None — Team channel</option>
              {deals.map(d => (
                <option key={d.id} value={d.id} style={{ background: "#111" }}>{d.name}</option>
              ))}
            </select>
          </div>
        </div>

        <button
          onClick={handleCreate}
          disabled={!name.trim() || saving}
          style={{
            width: "100%", marginTop: 16, padding: "11px", borderRadius: 10, border: "none",
            background: name.trim() ? "rgba(14,245,212,.9)" : "rgba(255,255,255,.06)",
            color: name.trim() ? "#060912" : "rgba(255,255,255,.3)",
            fontSize: 13, fontWeight: 700, cursor: name.trim() ? "pointer" : "not-allowed",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            fontFamily: "'DM Sans',sans-serif",
          }}
        >
          {saving ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> : <Plus style={{ width: 14, height: 14 }} />}
          Create Channel
        </button>
      </div>
    </div>
  );
}

// ─── Right context panel — Deal info ─────────────────────────
function DealContextPanel({ channel, tasks, onTaskToggle }: {
  channel: DealChannel;
  tasks: MessageTask[];
  onTaskToggle: (taskId: string, completed: boolean) => void;
}) {
  const [deal, setDeal] = useState<Deal | null>(null);
  const stageCfg = deal ? getStage(deal.stage) : null;
  const trend = deal?.sentiment_trend;

  useEffect(() => {
    if (!channel.deal_id) return;
    supabase.from("deals").select("id,name,company,stage,value,next_step,sentiment_trend,risk_score,probability,close_date")
      .eq("id", channel.deal_id).maybeSingle()
      .then(({ data }) => setDeal(data as Deal | null));
  }, [channel.deal_id]);

  const openTasks = tasks.filter(t => !t.is_completed);
  const doneTasks = tasks.filter(t => t.is_completed);

  return (
    <div style={{
      display: "flex", flexDirection: "column" as const,
      height: "100%", overflowY: "auto",
      padding: "16px", gap: 14,
    }}>
      {/* Deal card */}
      {deal && (
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,.3)", textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 8 }}>Deal</p>
          <div style={{
            background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.07)",
            borderRadius: 12, overflow: "hidden",
          }}>
            {/* Stage bar */}
            {stageCfg && (
              <div style={{ height: 3, background: stageCfg.color, opacity: 0.8 }} />
            )}
            <div style={{ padding: "12px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 6 }}>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: "#f0f6fc", fontFamily: "'DM Sans',sans-serif" }}>{deal.name}</p>
                  {deal.company && (
                    <p style={{ fontSize: 11, color: "rgba(255,255,255,.35)", display: "flex", alignItems: "center", gap: 3 }}>
                      <Building2 style={{ width: 9, height: 9 }} /> {deal.company}
                    </p>
                  )}
                </div>
                {stageCfg && (
                  <span style={{
                    fontSize: 10, fontWeight: 700, color: stageCfg.color,
                    background: stageCfg.bg, borderRadius: 6, padding: "3px 7px", flexShrink: 0,
                  }}>{stageCfg.label}</span>
                )}
              </div>

              {/* Value */}
              {deal.value && (
                <p style={{ fontSize: 18, fontWeight: 900, color: "#22c55e", fontFamily: "'DM Sans',sans-serif", margin: "8px 0 6px" }}>
                  {formatCurrency(deal.value)}
                </p>
              )}

              {/* Metrics */}
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" as const, marginBottom: 8 }}>
                {deal.probability != null && (
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,.5)" }}>
                    <span style={{ color: "rgba(255,255,255,.3)" }}>Win prob </span>
                    <span style={{ fontWeight: 700, color: "#60a5fa" }}>{deal.probability}%</span>
                  </div>
                )}
                {trend && (
                  <div style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11 }}>
                    {trend === "improving" && <TrendingUp style={{ width: 11, height: 11, color: "#22c55e" }} />}
                    {trend === "declining" && <TrendingDown style={{ width: 11, height: 11, color: "#ef4444" }} />}
                    {trend === "stable"    && <Minus style={{ width: 11, height: 11, color: "#94a3b8" }} />}
                    <span style={{ color: trend === "improving" ? "#22c55e" : trend === "declining" ? "#ef4444" : "#94a3b8" }}>
                      {trend === "improving" ? "Improving" : trend === "declining" ? "Declining" : "Stable"}
                    </span>
                  </div>
                )}
              </div>

              {/* Next step */}
              {deal.next_step && (
                <div style={{
                  background: "rgba(14,245,212,.06)", border: "1px solid rgba(14,245,212,.12)",
                  borderRadius: 8, padding: "8px 10px",
                }}>
                  <p style={{ fontSize: 9.5, fontWeight: 700, color: "rgba(14,245,212,.6)", textTransform: "uppercase" as const, letterSpacing: "0.07em", marginBottom: 3 }}>Next Step</p>
                  <p style={{ fontSize: 11.5, color: "rgba(255,255,255,.75)", lineHeight: 1.5 }}>{deal.next_step}</p>
                </div>
              )}

              {/* Risk */}
              {deal.risk_score != null && deal.risk_score > 50 && (
                <div style={{
                  marginTop: 8, display: "flex", alignItems: "center", gap: 5,
                  fontSize: 11, color: "#f97316",
                  background: "rgba(249,115,22,.07)", borderRadius: 7, padding: "5px 8px",
                }}>
                  <AlertTriangle style={{ width: 10, height: 10, flexShrink: 0 }} />
                  Deal at risk — score {deal.risk_score}
                </div>
              )}

              {/* Close date */}
              {deal.close_date && (
                <p style={{ fontSize: 10.5, color: "rgba(255,255,255,.3)", marginTop: 8, display: "flex", alignItems: "center", gap: 4 }}>
                  <Clock style={{ width: 9, height: 9 }} />
                  Close {format(new Date(deal.close_date), "MMM d, yyyy")}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tasks */}
      {(openTasks.length > 0 || doneTasks.length > 0) && (
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,.3)", textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 8 }}>
            Tasks ({openTasks.length} open)
          </p>
          <div style={{ display: "flex", flexDirection: "column" as const, gap: 5 }}>
            {[...openTasks, ...doneTasks].slice(0, 6).map(task => (
              <div
                key={task.id}
                style={{
                  display: "flex", alignItems: "flex-start", gap: 8,
                  padding: "8px 10px", borderRadius: 8,
                  background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)",
                  opacity: task.is_completed ? 0.55 : 1,
                }}
              >
                <button
                  onClick={() => onTaskToggle(task.id, !task.is_completed)}
                  style={{ background: "none", border: "none", cursor: "pointer", padding: 0, marginTop: 1, color: task.is_completed ? "#0ef5d4" : "rgba(255,255,255,.3)" }}
                >
                  {task.is_completed
                    ? <CheckCircle2 style={{ width: 14, height: 14 }} />
                    : <Circle style={{ width: 14, height: 14 }} />}
                </button>
                <span style={{
                  fontSize: 11.5, color: task.is_completed ? "rgba(255,255,255,.4)" : "rgba(255,255,255,.8)",
                  textDecoration: task.is_completed ? "line-through" : "none",
                  lineHeight: 1.4,
                }}>
                  {task.title}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Channel info when no deal */}
      {!deal && channel.type !== "deal" && (
        <div style={{ textAlign: "center" as const, padding: "20px 0", color: "rgba(255,255,255,.2)" }}>
          <Hash style={{ width: 28, height: 28, margin: "0 auto 8px", opacity: 0.2 }} />
          <p style={{ fontSize: 12, fontFamily: "'DM Sans',sans-serif" }}>{channel.name}</p>
          <p style={{ fontSize: 11, marginTop: 4, opacity: 0.6 }}>{channel.msg_count} messages</p>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN MESSAGES INNER
// ═══════════════════════════════════════════════════════════════

function MessagesInner() {
  const { user } = useAuth();
  const { team, members } = useTeam();
  const teamId = team?.id;

  // State
  const [channels, setChannels] = useState<DealChannel[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChannelMessage[]>([]);
  const [tasks, setTasks] = useState<MessageTask[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [text, setText] = useState("");
  const [search, setSearch] = useState("");
  const [showNewChannel, setShowNewChannel] = useState(false);
  const [taskTarget, setTaskTarget] = useState<ChannelMessage | null>(null);
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 900);
  const [showRight, setShowRight] = useState(false);

  const endRef = useRef<HTMLDivElement>(null);
  const typingRef = useRef<number>();

  const activeChannel = channels.find(c => c.id === activeChannelId) ?? null;

  // Responsive
  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 900);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);

  // Load channels
  const loadChannels = useCallback(async () => {
    if (!teamId) return;
    setLoadingChannels(true);
    try {
      const { data } = await (supabase as any).rpc("get_deal_channels", { p_team_id: teamId });
      setChannels((data as DealChannel[]) ?? []);
      if (data?.length && !activeChannelId) setActiveChannelId(data[0].id);
    } catch (e) {
      console.error("load channels failed", e);
    } finally {
      setLoadingChannels(false);
    }
  }, [teamId, activeChannelId]);

  // Load deals for "new channel" modal
  const loadDeals = useCallback(async () => {
    if (!user) return;
    const { data } = await (supabase as any).from("deals").select("id,name,company,stage,value,next_step,sentiment_trend,risk_score,probability,close_date").eq("owner_id", user.id).order("updated_at", { ascending: false }).limit(30);
    setDeals((data as Deal[]) ?? []);
  }, [user]);

  useEffect(() => { loadChannels(); loadDeals(); }, [teamId]);

  // Load messages for active channel
  const loadMessages = useCallback(async (channelId: string) => {
    setLoadingMessages(true);
    try {
      const { data } = await (supabase as any).rpc("get_channel_messages", {
        p_channel_id: channelId,
        p_limit: 60,
      });
      setMessages((data as ChannelMessage[]) ?? []);
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  // Load tasks for active channel
  const loadTasks = useCallback(async (channelId: string) => {
    const { data } = await (supabase as any).from("deal_message_tasks")
      .select("*").eq("channel_id", channelId)
      .order("created_at", { ascending: false }).limit(20);
    setTasks((data as MessageTask[]) ?? []);
  }, []);

  useEffect(() => {
    if (!activeChannelId) return;
    loadMessages(activeChannelId);
    loadTasks(activeChannelId);
  }, [activeChannelId]);

  // Scroll to bottom
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Realtime subscriptions
  useEffect(() => {
    if (!activeChannelId) return;
    const ch = supabase.channel(`dcm-${activeChannelId}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "deal_channel_messages",
        filter: `channel_id=eq.${activeChannelId}`,
      }, () => { loadMessages(activeChannelId); loadChannels(); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [activeChannelId]);

  // Realtime for channels (unread counts)
  useEffect(() => {
    if (!teamId) return;
    const ch = supabase.channel(`dc-${teamId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "deal_channels" }, loadChannels)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [teamId]);

  // Send message
  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || !activeChannelId || !user || sending) return;
    setSending(true);
    setText("");
    try {
      const { error } = await (supabase as any).from("deal_channel_messages").insert({
        channel_id: activeChannelId,
        user_id: user.id,
        content: trimmed,
        type: "text",
      });
      if (error) throw error;
    } catch (e: any) {
      toast.error("Failed to send");
      setText(trimmed);
    } finally {
      setSending(false);
    }
  };

  // Pin / unpin
  const handlePinMessage = async (msgId: string) => {
    const msg = messages.find(m => m.id === msgId);
    if (!msg) return;
    await (supabase as any).from("deal_channel_messages")
      .update({ is_pinned: !msg.is_pinned }).eq("id", msgId);
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, is_pinned: !m.is_pinned } : m));
    toast.success(msg.is_pinned ? "Unpinned" : "Pinned!");
  };

  // Task toggle
  const handleTaskToggle = async (taskId: string, completed: boolean) => {
    await (supabase as any).from("deal_message_tasks").update({
      is_completed: completed,
      completed_at: completed ? new Date().toISOString() : null,
    }).eq("id", taskId);
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, is_completed: completed } : t));
  };

  // Filter channels
  const filtered = search
    ? channels.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) ||
        (c.deal_name ?? "").toLowerCase().includes(search.toLowerCase()))
    : channels;

  const dealChannels = filtered.filter(c => c.type === "deal");
  const teamChannels = filtered.filter(c => c.type === "team");
  const callChannels = filtered.filter(c => c.type === "call");

  const totalUnread = channels.reduce((s, c) => s + c.unread_count, 0);

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap');
    @keyframes spin { to { transform: rotate(360deg); } }
    * { box-sizing: border-box; }
    ::-webkit-scrollbar { width: 4px; height: 4px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: rgba(255,255,255,.08); border-radius: 4px; }
  `;

  return (
    <DashboardLayout>
      <style>{css}</style>

      {showNewChannel && teamId && (
        <NewChannelModal
          teamId={teamId}
          deals={deals}
          onClose={() => setShowNewChannel(false)}
          onCreated={() => { setShowNewChannel(false); loadChannels(); }}
        />
      )}

      {taskTarget && activeChannelId && (
        <CreateTaskModal
          message={taskTarget}
          channelId={activeChannelId}
          dealId={activeChannel?.deal_id ?? null}
          teamId={teamId ?? null}
          members={members}
          onClose={() => setTaskTarget(null)}
          onCreated={() => { setTaskTarget(null); if (activeChannelId) loadTasks(activeChannelId); }}
        />
      )}

      {/* Main container */}
      <div style={{
        display: "flex", height: "calc(100vh - 7rem)",
        borderRadius: 16, overflow: "hidden",
        border: "1px solid rgba(255,255,255,.07)",
        background: "#08090f",
        fontFamily: "'DM Sans',sans-serif",
      }}>

        {/* ═══ LEFT SIDEBAR — Channels ═══════════════════════════════════ */}
        <div style={{
          width: isMobile && activeChannelId ? 0 : (isMobile ? "100%" : 240),
          flexShrink: 0,
          borderRight: "1px solid rgba(255,255,255,.06)",
          display: isMobile && activeChannelId ? "none" : "flex",
          flexDirection: "column" as const,
          background: "#0c0f1e",
          overflow: "hidden",
        }}>
          {/* Sidebar header */}
          <div style={{ padding: "14px 12px 10px", borderBottom: "1px solid rgba(255,255,255,.05)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: "rgba(255,255,255,.8)" }}>Messages</span>
                {totalUnread > 0 && (
                  <span style={{ fontSize: 9, fontWeight: 800, color: "#060912", background: "#0ef5d4", borderRadius: 10, padding: "1px 5px" }}>
                    {totalUnread}
                  </span>
                )}
              </div>
              <button
                onClick={() => setShowNewChannel(true)}
                title="New channel"
                style={{
                  width: 24, height: 24, borderRadius: 7,
                  background: "rgba(14,245,212,.1)", border: "1px solid rgba(14,245,212,.2)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer",
                }}
              >
                <Plus style={{ width: 12, height: 12, color: "#0ef5d4" }} />
              </button>
            </div>

            {/* Search */}
            <div style={{
              display: "flex", alignItems: "center", gap: 6,
              background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.07)",
              borderRadius: 8, padding: "5px 9px",
            }}>
              <Search style={{ width: 11, height: 11, color: "rgba(255,255,255,.25)", flexShrink: 0 }} />
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search channels…"
                style={{ flex: 1, background: "transparent", border: "none", outline: "none", fontSize: 11.5, color: "#f0f6fc" }}
              />
            </div>
          </div>

          {/* Channel groups */}
          <div style={{ flex: 1, overflowY: "auto" }}>
            {loadingChannels ? (
              <div style={{ display: "flex", justifyContent: "center", padding: 32 }}>
                <Loader2 style={{ width: 18, height: 18, color: "#0ef5d4", animation: "spin 1s linear infinite" }} />
              </div>
            ) : (
              <>
                {/* Deal channels */}
                {dealChannels.length > 0 && (
                  <>
                    <div style={{ padding: "10px 12px 4px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 9.5, fontWeight: 800, color: "rgba(255,255,255,.25)", textTransform: "uppercase" as const, letterSpacing: "0.1em" }}>
                        Deals · {dealChannels.length}
                      </span>
                    </div>
                    {dealChannels.map(ch => (
                      <ChannelItem
                        key={ch.id} ch={ch}
                        isActive={ch.id === activeChannelId}
                        onClick={() => { setActiveChannelId(ch.id); if (isMobile) setShowRight(false); }}
                      />
                    ))}
                  </>
                )}

                {/* Team channels */}
                {teamChannels.length > 0 && (
                  <>
                    <div style={{ padding: "12px 12px 4px" }}>
                      <span style={{ fontSize: 9.5, fontWeight: 800, color: "rgba(255,255,255,.25)", textTransform: "uppercase" as const, letterSpacing: "0.1em" }}>
                        Team · {teamChannels.length}
                      </span>
                    </div>
                    {teamChannels.map(ch => (
                      <ChannelItem
                        key={ch.id} ch={ch}
                        isActive={ch.id === activeChannelId}
                        onClick={() => { setActiveChannelId(ch.id); if (isMobile) setShowRight(false); }}
                      />
                    ))}
                  </>
                )}

                {/* Call threads */}
                {callChannels.length > 0 && (
                  <>
                    <div style={{ padding: "12px 12px 4px" }}>
                      <span style={{ fontSize: 9.5, fontWeight: 800, color: "rgba(255,255,255,.25)", textTransform: "uppercase" as const, letterSpacing: "0.1em" }}>
                        Call Threads · {callChannels.length}
                      </span>
                    </div>
                    {callChannels.map(ch => (
                      <ChannelItem
                        key={ch.id} ch={ch}
                        isActive={ch.id === activeChannelId}
                        onClick={() => { setActiveChannelId(ch.id); if (isMobile) setShowRight(false); }}
                      />
                    ))}
                  </>
                )}

                {filtered.length === 0 && (
                  <div style={{ padding: "32px 16px", textAlign: "center" as const }}>
                    <Hash style={{ width: 24, height: 24, color: "rgba(255,255,255,.1)", margin: "0 auto 8px" }} />
                    <p style={{ fontSize: 12, color: "rgba(255,255,255,.25)" }}>
                      {search ? "No channels found" : "No channels yet.\nCreate one to start."}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* ═══ CENTER — Chat Area ════════════════════════════════════════ */}
        <div style={{
          flex: 1, minWidth: 0, display: "flex", flexDirection: "column" as const,
          borderRight: "1px solid rgba(255,255,255,.05)",
        }}>
          {activeChannelId && activeChannel ? (
            <>
              {/* Chat header */}
              <div style={{
                padding: "11px 16px", borderBottom: "1px solid rgba(255,255,255,.05)",
                display: "flex", alignItems: "center", gap: 10, flexShrink: 0,
                background: "rgba(255,255,255,.02)",
              }}>
                {isMobile && (
                  <button
                    onClick={() => setActiveChannelId(null)}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "#0ef5d4", fontSize: 12, padding: 0 }}
                  >←</button>
                )}
                <div style={{
                  width: 30, height: 30, borderRadius: 8,
                  background: "rgba(14,245,212,.1)", border: "1px solid rgba(14,245,212,.2)",
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}>
                  <ChannelIcon type={activeChannel.type} size={13} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13.5, fontWeight: 700, color: "#f0f6fc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                    {activeChannel.name}
                  </p>
                  {activeChannel.deal_stage && (
                    <p style={{ fontSize: 10.5, color: "rgba(255,255,255,.3)" }}>
                      {getStage(activeChannel.deal_stage).label}
                      {activeChannel.deal_value ? ` · ${formatCurrency(activeChannel.deal_value)}` : ""}
                    </p>
                  )}
                </div>

                {/* Right panel toggle on mobile */}
                {isMobile && activeChannel.deal_id && (
                  <button
                    onClick={() => setShowRight(v => !v)}
                    style={{ background: "none", border: "none", cursor: "pointer", color: showRight ? "#0ef5d4" : "rgba(255,255,255,.3)", padding: 4 }}
                  >
                    <Info style={{ width: 16, height: 16 }} />
                  </button>
                )}

                {/* Pinned count */}
                {messages.filter(m => m.is_pinned).length > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#fbbf24" }}>
                    <Pin style={{ width: 10, height: 10 }} />
                    {messages.filter(m => m.is_pinned).length}
                  </div>
                )}

                {/* Task count */}
                {tasks.filter(t => !t.is_completed).length > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#0ef5d4" }}>
                    <CheckCircle2 style={{ width: 10, height: 10 }} />
                    {tasks.filter(t => !t.is_completed).length} task{tasks.filter(t => !t.is_completed).length !== 1 ? "s" : ""}
                  </div>
                )}
              </div>

              {/* Messages */}
              <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px", minHeight: 0 }}>
                {loadingMessages ? (
                  <div style={{ display: "flex", justifyContent: "center", paddingTop: 40 }}>
                    <Loader2 style={{ width: 20, height: 20, color: "#0ef5d4", animation: "spin 1s linear infinite" }} />
                  </div>
                ) : messages.length === 0 ? (
                  <div style={{ textAlign: "center" as const, paddingTop: 60 }}>
                    <MessageSquare style={{ width: 32, height: 32, color: "rgba(255,255,255,.1)", margin: "0 auto 12px" }} />
                    <p style={{ fontSize: 13, color: "rgba(255,255,255,.25)" }}>No messages yet.</p>
                    <p style={{ fontSize: 11, color: "rgba(255,255,255,.15)", marginTop: 4 }}>
                      {activeChannel.type === "deal"
                        ? "Discuss this deal, share updates, assign tasks."
                        : "Start the conversation."}
                    </p>
                  </div>
                ) : (
                  messages.map(msg => (
                    <MessageBubble
                      key={msg.id}
                      msg={msg}
                      isOwn={msg.user_id === user?.id}
                      onCreateTask={setTaskTarget}
                      onPinMessage={handlePinMessage}
                    />
                  ))
                )}
                <div ref={endRef} />
              </div>

              {/* Input */}
              <div style={{
                padding: "10px 14px", borderTop: "1px solid rgba(255,255,255,.05)",
                flexShrink: 0, background: "rgba(255,255,255,.015)",
              }}>
                {/* AI suggestion strip */}
                {activeChannel.deal_id && messages.length > 0 && (
                  <div style={{
                    display: "flex", alignItems: "center", gap: 6, marginBottom: 8,
                    padding: "6px 10px", borderRadius: 8,
                    background: "rgba(99,102,241,.06)", border: "1px solid rgba(99,102,241,.12)",
                  }}>
                    <Sparkles style={{ width: 11, height: 11, color: "#818cf8", flexShrink: 0 }} />
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,.4)" }}>Tip: Use</span>
                    <span style={{ fontSize: 11, color: "#c7d2fe", fontWeight: 600 }}>@mention</span>
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,.4)" }}>team members or hover a message to create a task</span>
                  </div>
                )}

                <div style={{
                  display: "flex", alignItems: "flex-end", gap: 8,
                  background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)",
                  borderRadius: 12, padding: "8px 10px",
                }}>
                  <textarea
                    value={text}
                    onChange={e => setText(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                    placeholder={`Message ${activeChannel.name}… (Enter to send)`}
                    rows={1}
                    style={{
                      flex: 1, background: "transparent", border: "none", outline: "none",
                      resize: "none", fontSize: 13, color: "#f0f6fc",
                      fontFamily: "'DM Sans',sans-serif", lineHeight: 1.5,
                      maxHeight: 100, overflowY: "auto",
                    }}
                  />
                  <button
                    onClick={handleSend}
                    disabled={!text.trim() || sending}
                    style={{
                      width: 32, height: 32, borderRadius: 8, border: "none",
                      background: text.trim() ? "linear-gradient(135deg,#0ef5d4,#0891b2)" : "rgba(255,255,255,.05)",
                      color: text.trim() ? "#060912" : "rgba(255,255,255,.2)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      cursor: text.trim() ? "pointer" : "not-allowed", flexShrink: 0, transition: "all .15s",
                    }}
                  >
                    {sending
                      ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} />
                      : <Send style={{ width: 14, height: 14 }} />}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div style={{
              flex: 1, display: "flex", flexDirection: "column" as const,
              alignItems: "center", justifyContent: "center", padding: 24,
            }}>
              <div style={{
                width: 64, height: 64, borderRadius: 18,
                background: "rgba(14,245,212,.08)", border: "1px solid rgba(14,245,212,.15)",
                display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14,
              }}>
                <MessageSquare style={{ width: 28, height: 28, color: "#0ef5d4", opacity: 0.6 }} />
              </div>
              <p style={{ fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,.5)" }}>
                Select a channel
              </p>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,.2)", marginTop: 6, textAlign: "center" as const, maxWidth: 260 }}>
                Every deal has a dedicated channel. Calls auto-post insights. Messaging is for closing deals.
              </p>
              {channels.length === 0 && !loadingChannels && (
                <button
                  onClick={() => setShowNewChannel(true)}
                  style={{
                    marginTop: 18, padding: "10px 20px", background: "rgba(14,245,212,.1)",
                    border: "1px solid rgba(14,245,212,.25)", borderRadius: 10,
                    color: "#0ef5d4", fontSize: 13, fontWeight: 600, cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 7,
                  }}
                >
                  <Plus style={{ width: 14, height: 14 }} /> Create First Channel
                </button>
              )}
            </div>
          )}
        </div>

        {/* ═══ RIGHT — Deal Context Panel ═══════════════════════════════ */}
        {(!isMobile || showRight) && activeChannel && (
          <div style={{
            width: isMobile ? "100%" : 240, flexShrink: 0,
            background: "#0c0f1e",
            borderLeft: "1px solid rgba(255,255,255,.05)",
            overflowY: "auto",
            position: isMobile ? "absolute" as const : "relative" as const,
            right: isMobile ? 0 : undefined,
            top: isMobile ? 0 : undefined,
            bottom: isMobile ? 0 : undefined,
            zIndex: isMobile ? 20 : 1,
          }}>
            {/* Context panel header */}
            <div style={{
              padding: "12px 14px", borderBottom: "1px solid rgba(255,255,255,.05)",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              flexShrink: 0,
            }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,.3)", textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>
                {activeChannel.type === "deal" ? "Deal Intel" : "Channel Info"}
              </span>
              {isMobile && (
                <button onClick={() => setShowRight(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,.4)" }}>
                  <X style={{ width: 14, height: 14 }} />
                </button>
              )}
            </div>

            <DealContextPanel
              channel={activeChannel}
              tasks={tasks}
              onTaskToggle={handleTaskToggle}
            />
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

// ═══════════════════════════════════════════════════════════════
// GATED EXPORT
// ═══════════════════════════════════════════════════════════════

export default function MessagesPage() {
  const { hasFeature } = usePlanEnforcement();

  if (!hasFeature("team_messages")) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <LockedCard
            feature="team_messages"
            description="Deal-driven messaging — every conversation tied to a deal, a call, or an action. Collaborate to close faster."
          />
        </div>
      </DashboardLayout>
    );
  }

  return <MessagesInner />;
}