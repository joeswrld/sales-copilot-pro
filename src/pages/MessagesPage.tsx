/**
 * MessagesPage.tsx — Slack-like Deal-Driven Communication Layer
 *
 * Architecture:
 *  - Left sidebar: workspaces, deal channels, team channels, DMs
 *  - Center: real-time chat with threads, reactions, AI insights
 *  - Right panel: dynamic deal/call context
 *  - Notification system: in-app bell, push, email fallback
 *  - AI layer: auto-post call insights, risk alerts, reply suggestions
 */

import {
  useState, useEffect, useRef, useCallback, useMemo,
} from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useTeam } from "@/hooks/useTeam";
import { supabase } from "@/integrations/supabase/client";
import {
  format, isToday, isYesterday, formatDistanceToNow, parseISO,
} from "date-fns";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Channel {
  id: string;
  name: string;
  type: "deal" | "team" | "dm" | "call";
  deal_id: string | null;
  call_id: string | null;
  deal_name: string | null;
  deal_stage: string | null;
  deal_value: number | null;
  deal_health: number | null;
  deal_next_step: string | null;
  call_name: string | null;
  call_summary: string | null;
  call_sentiment: number | null;
  last_msg: string | null;
  last_msg_at: string | null;
  unread_count: number;
  msg_count: number;
  is_muted: boolean;
}

interface Msg {
  id: string;
  channel_id: string;
  user_id: string | null;
  parent_id: string | null;
  content: string;
  type: "text" | "ai" | "system" | "call_insight" | "risk_alert";
  metadata: Record<string, any>;
  is_pinned: boolean;
  reply_count: number;
  reactions: { emoji: string; count: number; by_me: boolean }[];
  created_at: string;
  updated_at: string | null;
  sender_name: string | null;
  sender_email: string | null;
  sender_avatar: string | null;
  edited: boolean;
}

interface Task {
  id: string;
  message_id: string;
  title: string;
  assigned_to: string | null;
  assigned_name: string | null;
  due_date: string | null;
  is_completed: boolean;
  created_at: string;
}

interface DealContext {
  id: string;
  name: string;
  company: string | null;
  stage: string;
  value: number | null;
  health_score: number;
  next_step: string | null;
  sentiment_trend: string | null;
  risk_score: number | null;
  probability: number | null;
  close_date: string | null;
  last_call_at: string | null;
  call_count: number;
}

interface NotificationItem {
  id: string;
  type: "mention" | "message" | "deal_update" | "ai_alert" | "call_completed";
  content: string;
  channel_name: string | null;
  is_read: boolean;
  created_at: string;
  deal_name: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STAGE_CFG: Record<string, { color: string; bg: string; dot: string; label: string }> = {
  discovery:   { color: "#60a5fa", bg: "rgba(96,165,250,.1)",  dot: "#60a5fa", label: "Discovery" },
  demo:        { color: "#a78bfa", bg: "rgba(167,139,250,.1)", dot: "#a78bfa", label: "Demo" },
  negotiation: { color: "#fbbf24", bg: "rgba(251,191,36,.1)",  dot: "#fbbf24", label: "Negotiation" },
  proposal:    { color: "#34d399", bg: "rgba(52,211,153,.1)",  dot: "#34d399", label: "Proposal" },
  won:         { color: "#22c55e", bg: "rgba(34,197,94,.1)",   dot: "#22c55e", label: "Won" },
  lost:        { color: "#ef4444", bg: "rgba(239,68,68,.1)",   dot: "#ef4444", label: "Lost" },
  new:         { color: "#94a3b8", bg: "rgba(148,163,184,.1)", dot: "#94a3b8", label: "New" },
};

const EMOJI_OPTIONS = ["👍", "🔥", "✅", "❌", "💡", "🎯", "⚠️", "🚀"];

function getStage(s?: string | null) {
  return STAGE_CFG[s?.toLowerCase() ?? ""] ?? STAGE_CFG.new;
}

function fmtCurrency(v?: number | null) {
  if (!v) return null;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toLocaleString()}`;
}

function msgTime(d: string) {
  const dt = new Date(d);
  if (isToday(dt))     return format(dt, "h:mm a");
  if (isYesterday(dt)) return "Yesterday";
  return format(dt, "MMM d");
}

function initials(name: string | null) {
  if (!name) return "?";
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

function healthColor(h?: number | null) {
  if (!h && h !== 0) return "#94a3b8";
  if (h >= 70) return "#22c55e";
  if (h >= 45) return "#fbbf24";
  return "#ef4444";
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({
  name, size = 32, isAI = false, isSystem = false,
}: { name: string | null; size?: number; isAI?: boolean; isSystem?: boolean }) {
  const bg = isAI
    ? "linear-gradient(135deg,#7c3aed,#4f46e5)"
    : isSystem
    ? "rgba(100,116,139,.3)"
    : "rgba(14,245,212,.12)";
  const border = isAI
    ? "1px solid rgba(124,58,237,.35)"
    : isSystem
    ? "1px solid rgba(100,116,139,.3)"
    : "1px solid rgba(14,245,212,.22)";
  const color = isAI ? "#e9d5ff" : isSystem ? "#94a3b8" : "#0ef5d4";
  const label = isAI ? "AI" : isSystem ? "#" : initials(name);

  return (
    <div style={{
      width: size, height: size, borderRadius: size * 0.28, flexShrink: 0,
      background: bg, border, display: "flex", alignItems: "center",
      justifyContent: "center", fontSize: size * 0.37, fontWeight: 700,
      color, fontFamily: "'Geist',system-ui,sans-serif", letterSpacing: "-0.3px",
    }}>{label}</div>
  );
}

// ─── Online dot ───────────────────────────────────────────────────────────────

function OnlineDot({ online }: { online: boolean }) {
  return (
    <div style={{
      width: 8, height: 8, borderRadius: "50%",
      background: online ? "#22c55e" : "#475569",
      border: "1.5px solid #0c0f1e", flexShrink: 0,
    }} />
  );
}

// ─── Health bar ───────────────────────────────────────────────────────────────

function HealthBar({ score }: { score: number }) {
  const c = healthColor(score);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{
        flex: 1, height: 4, borderRadius: 2,
        background: "rgba(255,255,255,.07)", overflow: "hidden",
      }}>
        <div style={{
          width: `${score}%`, height: "100%", background: c,
          borderRadius: 2, transition: "width .5s ease",
        }} />
      </div>
      <span style={{ fontSize: 10, fontWeight: 700, color: c, minWidth: 22, textAlign: "right" }}>
        {score}
      </span>
    </div>
  );
}

// ─── Channel list item ────────────────────────────────────────────────────────

function ChannelItem({
  ch, isActive, onClick, onMute,
}: {
  ch: Channel; isActive: boolean;
  onClick: () => void; onMute: (id: string, muted: boolean) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const stageCfg = getStage(ch.deal_stage);

  const icon = ch.type === "deal"
    ? <span style={{ fontSize: 10, color: stageCfg.color }}>◈</span>
    : ch.type === "call"
    ? <span style={{ fontSize: 10, color: "#60a5fa" }}>☎</span>
    : ch.type === "dm"
    ? <span style={{ fontSize: 10, color: "#a78bfa" }}>●</span>
    : <span style={{ fontSize: 10, color: "#94a3b8" }}>#</span>;

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex", alignItems: "center", gap: 8, width: "100%",
        padding: "7px 10px", border: "none", textAlign: "left",
        background: isActive
          ? "rgba(14,245,212,.08)"
          : hovered ? "rgba(255,255,255,.035)" : "transparent",
        borderLeft: `2px solid ${isActive ? "#0ef5d4" : "transparent"}`,
        cursor: "pointer", transition: "all .1s",
        opacity: ch.is_muted ? 0.5 : 1,
      }}
    >
      <div style={{
        width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
        background: ch.unread_count > 0 ? "#0ef5d4" : "transparent",
        boxShadow: ch.unread_count > 0 ? "0 0 6px rgba(14,245,212,.6)" : "none",
      }} />

      <span style={{ fontSize: 11, color: "rgba(255,255,255,.4)", flexShrink: 0 }}>
        {icon}
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}>
          <span style={{
            fontSize: 12.5, fontWeight: ch.unread_count > 0 ? 700 : 500,
            color: isActive ? "#f0f6fc" : "rgba(255,255,255,.65)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 130,
            fontFamily: "'Geist',system-ui,sans-serif",
          }}>
            {ch.name}
          </span>
          {ch.last_msg_at && (
            <span style={{ fontSize: 9.5, color: "rgba(255,255,255,.22)", flexShrink: 0 }}>
              {msgTime(ch.last_msg_at)}
            </span>
          )}
        </div>
        {ch.last_msg && (
          <span style={{
            fontSize: 11, color: "rgba(255,255,255,.28)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block",
          }}>
            {ch.last_msg.length > 35 ? ch.last_msg.slice(0, 35) + "…" : ch.last_msg}
          </span>
        )}
      </div>

      {ch.unread_count > 0 && (
        <span style={{
          fontSize: 9.5, fontWeight: 800, color: "#060912",
          background: "#0ef5d4", borderRadius: 10, padding: "1.5px 5px",
          flexShrink: 0, lineHeight: 1.4,
        }}>
          {ch.unread_count > 99 ? "99+" : ch.unread_count}
        </span>
      )}
    </button>
  );
}

// ─── AI Call Insight card ─────────────────────────────────────────────────────

function CallInsightCard({ msg, onTask }: { msg: Msg; onTask: (m: Msg) => void }) {
  const m = msg.metadata;
  const sentColor = !m.sentiment_score ? "#94a3b8"
    : m.sentiment_score >= 65 ? "#22c55e"
    : m.sentiment_score >= 40 ? "#fbbf24" : "#ef4444";

  return (
    <div style={{
      margin: "8px 0 8px 44px",
      border: "1px solid rgba(99,102,241,.22)",
      borderRadius: 12,
      background: "linear-gradient(135deg,rgba(99,102,241,.05),rgba(124,58,237,.03))",
      overflow: "hidden",
    }}>
      <div style={{
        padding: "9px 14px", borderBottom: "1px solid rgba(99,102,241,.1)",
        display: "flex", alignItems: "center", gap: 8,
        background: "rgba(99,102,241,.07)",
      }}>
        <span style={{ fontSize: 12 }}>📞</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#c7d2fe", fontFamily: "'Geist',system-ui,sans-serif" }}>
          {m.call_name ?? "Call"} — AI Summary
        </span>
        <span style={{ marginLeft: "auto", fontSize: 10, color: "rgba(255,255,255,.25)" }}>
          {msgTime(msg.created_at)}
        </span>
        <button
          onClick={() => onTask(msg)}
          title="Create task from this insight"
          style={{
            background: "rgba(14,245,212,.1)", border: "1px solid rgba(14,245,212,.2)",
            borderRadius: 5, padding: "2px 7px", fontSize: 10, color: "#0ef5d4",
            cursor: "pointer", fontFamily: "'Geist',system-ui,sans-serif",
          }}
        >
          + Task
        </button>
      </div>

      <div style={{ padding: "10px 14px", display: "flex", gap: 16, flexWrap: "wrap" }}>
        {m.sentiment_score != null && (
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: sentColor }} />
            <span style={{ fontSize: 11, color: "rgba(255,255,255,.4)" }}>Sentiment</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: sentColor }}>{m.sentiment_score}%</span>
          </div>
        )}
        {m.meeting_score != null && (
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: 10, color: "#a78bfa" }}>◉</span>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,.4)" }}>Score</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#a78bfa" }}>{m.meeting_score}/100</span>
          </div>
        )}
        {m.objections_count > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: 10, color: "#f97316" }}>⚠</span>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,.4)" }}>Objections</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#f97316" }}>{m.objections_count}</span>
          </div>
        )}
      </div>

      {m.summary && (
        <div style={{ padding: "0 14px 10px" }}>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,.6)", lineHeight: 1.6, margin: 0 }}>
            {m.summary}
          </p>
        </div>
      )}

      {Array.isArray(m.next_steps) && m.next_steps.length > 0 && (
        <div style={{ padding: "8px 14px 12px", borderTop: "1px solid rgba(255,255,255,.04)" }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,.28)", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 6px" }}>
            Next Steps
          </p>
          {m.next_steps.slice(0, 3).map((step: string, i: number) => (
            <div key={i} style={{ display: "flex", gap: 6, marginBottom: 4, alignItems: "flex-start" }}>
              <span style={{ fontSize: 10, color: "#0ef5d4", marginTop: 2, flexShrink: 0 }}>›</span>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,.65)", lineHeight: 1.5 }}>{step}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Risk alert card ──────────────────────────────────────────────────────────

function RiskAlertCard({ msg }: { msg: Msg }) {
  return (
    <div style={{
      margin: "6px 0 6px 44px",
      border: "1px solid rgba(249,115,22,.25)",
      borderRadius: 10,
      background: "rgba(249,115,22,.06)",
      padding: "10px 14px",
      display: "flex", alignItems: "flex-start", gap: 10,
    }}>
      <span style={{ fontSize: 14, flexShrink: 0 }}>⚠️</span>
      <div>
        <p style={{ fontSize: 12, fontWeight: 700, color: "#fb923c", margin: "0 0 2px", fontFamily: "'Geist',system-ui,sans-serif" }}>
          Deal Risk Alert
        </p>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,.6)", margin: 0, lineHeight: 1.5 }}>
          {msg.content}
        </p>
        <p style={{ fontSize: 10, color: "rgba(255,255,255,.25)", margin: "4px 0 0" }}>
          {msgTime(msg.created_at)}
        </p>
      </div>
    </div>
  );
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({
  msg, isOwn, currentUserId,
  onReact, onPin, onEdit, onDelete, onTask, onThread,
}: {
  msg: Msg; isOwn: boolean; currentUserId: string | undefined;
  onReact: (id: string, emoji: string) => void;
  onPin: (id: string) => void;
  onEdit: (msg: Msg) => void;
  onDelete: (id: string) => void;
  onTask: (msg: Msg) => void;
  onThread: (msg: Msg) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const emojiRef = useRef<HTMLDivElement>(null);

  if (msg.type === "call_insight") return <CallInsightCard msg={msg} onTask={onTask} />;
  if (msg.type === "risk_alert") return <RiskAlertCard msg={msg} />;

  const isSystem = msg.type === "system" || msg.type === "ai";

  if (isSystem) {
    return (
      <div style={{ textAlign: "center", padding: "5px 0" }}>
        <span style={{
          fontSize: 11, color: "rgba(255,255,255,.28)",
          background: "rgba(255,255,255,.04)",
          border: "1px solid rgba(255,255,255,.07)",
          borderRadius: 20, padding: "3px 12px",
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
        alignItems: "flex-start", gap: 9, marginBottom: 2,
        padding: hovered ? "3px 8px" : "3px 8px",
        background: hovered ? "rgba(255,255,255,.02)" : "transparent",
        borderRadius: 8, position: "relative", transition: "background .1s",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setShowEmojiPicker(false); }}
    >
      {!isOwn && <Avatar name={msg.sender_name} size={32} />}

      <div style={{ maxWidth: "72%", minWidth: 0, flex: 1 }}>
        {!isOwn && (
          <div style={{ display: "flex", alignItems: "baseline", gap: 7, marginBottom: 3 }}>
            <span style={{
              fontSize: 12.5, fontWeight: 700,
              color: "rgba(255,255,255,.8)",
              fontFamily: "'Geist',system-ui,sans-serif",
            }}>
              {msg.sender_name || msg.sender_email?.split("@")[0] || "Unknown"}
            </span>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,.22)" }}>
              {msgTime(msg.created_at)}
            </span>
            {msg.is_pinned && (
              <span style={{ fontSize: 9, color: "#fbbf24" }}>📌 pinned</span>
            )}
          </div>
        )}

        <div style={{
          padding: "9px 12px",
          background: isOwn
            ? "linear-gradient(135deg,rgba(14,245,212,.85),rgba(8,145,178,.85))"
            : "rgba(255,255,255,.055)",
          border: isOwn ? "none" : "1px solid rgba(255,255,255,.07)",
          borderRadius: isOwn ? "12px 12px 3px 12px" : "12px 12px 12px 3px",
          fontSize: 13, lineHeight: 1.55,
          color: isOwn ? "#060912" : "rgba(255,255,255,.88)",
          fontFamily: "'Geist',system-ui,sans-serif",
          wordBreak: "break-word",
        }}>
          {msg.content}
          {msg.edited && (
            <span style={{ fontSize: 10, opacity: 0.5, marginLeft: 6 }}>(edited)</span>
          )}
        </div>

        {isOwn && (
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 2 }}>
            <span style={{ fontSize: 9.5, color: "rgba(255,255,255,.2)" }}>
              {msgTime(msg.created_at)}
            </span>
          </div>
        )}

        {msg.reactions.length > 0 && (
          <div style={{ display: "flex", gap: 4, marginTop: 5, flexWrap: "wrap" }}>
            {msg.reactions.map((r) => (
              <button
                key={r.emoji}
                onClick={() => onReact(msg.id, r.emoji)}
                style={{
                  display: "flex", alignItems: "center", gap: 3,
                  padding: "2px 7px", borderRadius: 20,
                  background: r.by_me ? "rgba(14,245,212,.12)" : "rgba(255,255,255,.06)",
                  border: r.by_me ? "1px solid rgba(14,245,212,.25)" : "1px solid rgba(255,255,255,.08)",
                  cursor: "pointer", fontSize: 12,
                }}
              >
                <span>{r.emoji}</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: r.by_me ? "#0ef5d4" : "rgba(255,255,255,.5)" }}>
                  {r.count}
                </span>
              </button>
            ))}
          </div>
        )}

        {msg.reply_count > 0 && (
          <button
            onClick={() => onThread(msg)}
            style={{
              display: "flex", alignItems: "center", gap: 4, marginTop: 5,
              background: "none", border: "none", cursor: "pointer",
              fontSize: 11, color: "#60a5fa", padding: 0,
              fontFamily: "'Geist',system-ui,sans-serif",
            }}
          >
            ↳ {msg.reply_count} {msg.reply_count === 1 ? "reply" : "replies"}
          </button>
        )}
      </div>

      {hovered && (
        <div style={{
          position: "absolute", top: -2, right: isOwn ? undefined : 8, left: isOwn ? 8 : undefined,
          display: "flex", alignItems: "center", gap: 2,
          background: "#111827", border: "1px solid rgba(255,255,255,.1)",
          borderRadius: 8, padding: "3px 5px", zIndex: 10,
          boxShadow: "0 4px 12px rgba(0,0,0,.5)",
        }}>
          {[
            { label: "React", icon: "😊", action: () => setShowEmojiPicker(v => !v) },
            { label: "Thread", icon: "↳", action: () => onThread(msg) },
            { label: "Pin",   icon: msg.is_pinned ? "📌" : "📎", action: () => onPin(msg.id) },
            { label: "Task",  icon: "✅", action: () => onTask(msg) },
            ...(isOwn ? [
              { label: "Edit",   icon: "✏️", action: () => onEdit(msg) },
              { label: "Delete", icon: "🗑", action: () => onDelete(msg.id) },
            ] : []),
          ].map(a => (
            <button
              key={a.label}
              title={a.label}
              onClick={a.action}
              style={{
                background: "none", border: "none", cursor: "pointer",
                padding: "3px 5px", borderRadius: 5, fontSize: 13,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,.08)")}
              onMouseLeave={e => (e.currentTarget.style.background = "none")}
            >
              {a.icon}
            </button>
          ))}

          {showEmojiPicker && (
            <div ref={emojiRef} style={{
              position: "absolute", top: "110%", left: 0,
              display: "flex", gap: 4, background: "#111827",
              border: "1px solid rgba(255,255,255,.1)", borderRadius: 10,
              padding: "6px 8px", zIndex: 20, flexWrap: "wrap", maxWidth: 160,
            }}>
              {EMOJI_OPTIONS.map(e => (
                <button
                  key={e}
                  onClick={() => { onReact(msg.id, e); setShowEmojiPicker(false); }}
                  style={{
                    background: "none", border: "none", cursor: "pointer",
                    fontSize: 16, padding: 3, borderRadius: 5,
                    transition: "transform .1s",
                  }}
                  onMouseEnter={ev => (ev.currentTarget.style.transform = "scale(1.3)")}
                  onMouseLeave={ev => (ev.currentTarget.style.transform = "scale(1)")}
                >
                  {e}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Deal Context Panel ───────────────────────────────────────────────────────

function DealContextPanel({ channel, tasks, onTaskToggle, onRefreshTasks }: {
  channel: Channel;
  tasks: Task[];
  onTaskToggle: (id: string, done: boolean) => void;
  onRefreshTasks: () => void;
}) {
  const [deal, setDeal] = useState<DealContext | null>(null);
  const stageCfg = deal ? getStage(deal.stage) : null;

  useEffect(() => {
    if (!channel.deal_id) { setDeal(null); return; }
    (async () => {
      const { data } = await (supabase as any)
        .from("deals")
        .select("id,name,company,stage,value,next_step,sentiment_trend,risk_score,probability,close_date")
        .eq("id", channel.deal_id)
        .maybeSingle();
      if (data) {
        setDeal({ ...data, health_score: 75, last_call_at: null, call_count: 0 });
      }
    })();
  }, [channel.deal_id]);

  const openTasks = tasks.filter(t => !t.is_completed);
  const doneTasks = tasks.filter(t => t.is_completed);

  return (
    <div style={{ padding: 14, overflowY: "auto", height: "100%", display: "flex", flexDirection: "column", gap: 14 }}>
      {deal && stageCfg && (
        <div>
          <p style={{ fontSize: 9.5, fontWeight: 700, color: "rgba(255,255,255,.28)", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 8px" }}>
            Deal Intelligence
          </p>
          <div style={{
            background: "rgba(255,255,255,.03)",
            border: "1px solid rgba(255,255,255,.07)",
            borderRadius: 12, overflow: "hidden",
          }}>
            <div style={{ height: 3, background: stageCfg.color }} />
            <div style={{ padding: 12 }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: "#f0f6fc", margin: 0, fontFamily: "'Geist',system-ui,sans-serif" }}>
                    {deal.name}
                  </p>
                  {deal.company && (
                    <p style={{ fontSize: 11, color: "rgba(255,255,255,.35)", margin: "2px 0 0" }}>
                      {deal.company}
                    </p>
                  )}
                </div>
                <span style={{
                  fontSize: 10, fontWeight: 700, color: stageCfg.color,
                  background: stageCfg.bg, borderRadius: 6, padding: "3px 7px", flexShrink: 0, marginLeft: 8,
                }}>
                  {stageCfg.label}
                </span>
              </div>

              {deal.value && (
                <p style={{ fontSize: 20, fontWeight: 900, color: "#22c55e", margin: "0 0 10px", fontFamily: "'Geist',system-ui,sans-serif" }}>
                  {fmtCurrency(deal.value)}
                </p>
              )}

              <div style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,.35)" }}>Health</span>
                  <span style={{ fontSize: 10, color: healthColor(deal.health_score) }}>{deal.health_score}%</span>
                </div>
                <HealthBar score={deal.health_score} />
              </div>

              {deal.probability != null && (
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,.35)" }}>Win Probability</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#60a5fa" }}>{deal.probability}%</span>
                </div>
              )}

              {deal.sentiment_trend && (
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,.35)" }}>Sentiment</span>
                  <span style={{
                    fontSize: 11, fontWeight: 600,
                    color: deal.sentiment_trend === "improving" ? "#22c55e"
                      : deal.sentiment_trend === "declining" ? "#ef4444" : "#94a3b8",
                  }}>
                    {deal.sentiment_trend === "improving" ? "↑ Improving"
                      : deal.sentiment_trend === "declining" ? "↓ Declining"
                      : "→ Stable"}
                  </span>
                </div>
              )}

              {deal.next_step && (
                <div style={{
                  background: "rgba(14,245,212,.06)", border: "1px solid rgba(14,245,212,.12)",
                  borderRadius: 8, padding: "8px 10px", marginTop: 8,
                }}>
                  <p style={{ fontSize: 9.5, fontWeight: 700, color: "rgba(14,245,212,.5)", textTransform: "uppercase", letterSpacing: "0.07em", margin: "0 0 3px" }}>
                    Next Step
                  </p>
                  <p style={{ fontSize: 12, color: "rgba(255,255,255,.75)", margin: 0, lineHeight: 1.5 }}>
                    {deal.next_step}
                  </p>
                </div>
              )}

              {deal.risk_score != null && deal.risk_score > 50 && (
                <div style={{
                  marginTop: 8, display: "flex", alignItems: "center", gap: 5,
                  background: "rgba(249,115,22,.07)", border: "1px solid rgba(249,115,22,.15)",
                  borderRadius: 7, padding: "6px 9px",
                }}>
                  <span style={{ fontSize: 11, color: "#f97316" }}>⚠ At Risk — score {deal.risk_score}</span>
                </div>
              )}

              {deal.close_date && (
                <p style={{ fontSize: 10.5, color: "rgba(255,255,255,.28)", marginTop: 8, margin: "8px 0 0" }}>
                  🗓 Close {format(new Date(deal.close_date), "MMM d, yyyy")}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {(openTasks.length > 0 || doneTasks.length > 0) && (
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <p style={{ fontSize: 9.5, fontWeight: 700, color: "rgba(255,255,255,.28)", textTransform: "uppercase", letterSpacing: "0.1em", margin: 0 }}>
              Tasks ({openTasks.length} open)
            </p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {[...openTasks, ...doneTasks].slice(0, 8).map(task => (
              <div key={task.id} style={{
                display: "flex", alignItems: "flex-start", gap: 8,
                padding: "7px 9px", borderRadius: 8,
                background: "rgba(255,255,255,.025)",
                border: "1px solid rgba(255,255,255,.06)",
                opacity: task.is_completed ? 0.5 : 1,
              }}>
                <button
                  onClick={() => onTaskToggle(task.id, !task.is_completed)}
                  style={{
                    background: "none", border: "none", cursor: "pointer",
                    padding: 0, marginTop: 1, flexShrink: 0,
                    color: task.is_completed ? "#0ef5d4" : "rgba(255,255,255,.3)",
                    fontSize: 14,
                  }}
                >
                  {task.is_completed ? "☑" : "☐"}
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{
                    fontSize: 12, color: task.is_completed ? "rgba(255,255,255,.35)" : "rgba(255,255,255,.8)",
                    textDecoration: task.is_completed ? "line-through" : "none",
                    lineHeight: 1.4, display: "block",
                    fontFamily: "'Geist',system-ui,sans-serif",
                  }}>
                    {task.title}
                  </span>
                  {task.assigned_name && (
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,.25)" }}>→ {task.assigned_name}</span>
                  )}
                  {task.due_date && (
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,.25)", marginLeft: task.assigned_name ? 8 : 0 }}>
                      {format(new Date(task.due_date), "MMM d")}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!deal && channel.type !== "deal" && (
        <div style={{ textAlign: "center", padding: "20px 0", color: "rgba(255,255,255,.18)" }}>
          <p style={{ fontSize: 13, fontFamily: "'Geist',system-ui,sans-serif", margin: "0 0 4px" }}>
            #{channel.name}
          </p>
          <p style={{ fontSize: 11, margin: 0 }}>{channel.msg_count} messages</p>
        </div>
      )}
    </div>
  );
}

// ─── Thread panel ─────────────────────────────────────────────────────────────

function ThreadPanel({
  parentMsg, currentUserId, onClose,
}: { parentMsg: Msg; currentUserId: string | undefined; onClose: () => void }) {
  const [replies, setReplies] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const { user } = useAuth();

  const loadReplies = useCallback(async () => {
    const { data } = await (supabase as any).rpc("get_channel_messages", {
      p_channel_id: parentMsg.channel_id,
      p_parent_id: parentMsg.id,
      p_limit: 50,
    });
    setReplies((data as Msg[]) ?? []);
  }, [parentMsg.id, parentMsg.channel_id]);

  useEffect(() => { loadReplies(); }, [loadReplies]);

  const sendReply = async () => {
    if (!text.trim() || !user || sending) return;
    setSending(true);
    const t = text.trim();
    setText("");
    try {
      await (supabase as any).from("deal_channel_messages").insert({
        channel_id: parentMsg.channel_id,
        user_id: user.id,
        parent_id: parentMsg.id,
        content: t,
        type: "text",
      });
      await loadReplies();
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{
      display: "flex", flexDirection: "column", height: "100%",
      borderLeft: "1px solid rgba(255,255,255,.06)",
      background: "#0c0f1e",
    }}>
      <div style={{
        padding: "12px 14px", borderBottom: "1px solid rgba(255,255,255,.06)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#f0f6fc", fontFamily: "'Geist',system-ui,sans-serif" }}>
            Thread
          </span>
          <p style={{ fontSize: 10, color: "rgba(255,255,255,.28)", margin: "2px 0 0" }}>
            {replies.length} {replies.length === 1 ? "reply" : "replies"}
          </p>
        </div>
        <button
          onClick={onClose}
          style={{
            background: "rgba(255,255,255,.06)", border: "none",
            borderRadius: 7, padding: "4px 8px", color: "rgba(255,255,255,.4)",
            cursor: "pointer", fontSize: 13,
          }}
        >
          ✕
        </button>
      </div>

      <div style={{
        background: "rgba(255,255,255,.025)",
        borderBottom: "1px solid rgba(255,255,255,.06)",
        padding: "10px 14px",
      }}>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,.6)", margin: 0, lineHeight: 1.5, fontFamily: "'Geist',system-ui,sans-serif" }}>
          {parentMsg.content}
        </p>
        <span style={{ fontSize: 10, color: "rgba(255,255,255,.22)" }}>
          {parentMsg.sender_name} · {msgTime(parentMsg.created_at)}
        </span>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "10px 14px" }}>
        {replies.map(r => (
          <div key={r.id} style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <Avatar name={r.sender_name} size={26} />
            <div>
              <div style={{ display: "flex", gap: 6, alignItems: "baseline", marginBottom: 2 }}>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: "rgba(255,255,255,.75)", fontFamily: "'Geist',system-ui,sans-serif" }}>
                  {r.sender_name || "Unknown"}
                </span>
                <span style={{ fontSize: 9.5, color: "rgba(255,255,255,.22)" }}>
                  {msgTime(r.created_at)}
                </span>
              </div>
              <p style={{
                fontSize: 12.5, color: "rgba(255,255,255,.8)", margin: 0,
                lineHeight: 1.55, fontFamily: "'Geist',system-ui,sans-serif",
              }}>
                {r.content}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div style={{
        padding: "10px 14px", borderTop: "1px solid rgba(255,255,255,.06)",
      }}>
        <div style={{
          display: "flex", gap: 8, alignItems: "flex-end",
          background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)",
          borderRadius: 10, padding: "7px 10px",
        }}>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendReply(); } }}
            placeholder="Reply in thread…"
            rows={2}
            style={{
              flex: 1, background: "transparent", border: "none", outline: "none",
              resize: "none", fontSize: 12.5, color: "#f0f6fc",
              fontFamily: "'Geist',system-ui,sans-serif", lineHeight: 1.5,
            }}
          />
          <button
            onClick={sendReply}
            disabled={!text.trim() || sending}
            style={{
              width: 28, height: 28, borderRadius: 7, border: "none",
              background: text.trim() ? "rgba(14,245,212,.9)" : "rgba(255,255,255,.06)",
              color: text.trim() ? "#060912" : "rgba(255,255,255,.2)",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: text.trim() ? "pointer" : "not-allowed", flexShrink: 0, fontSize: 13,
            }}
          >
            ↑
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Notification bell ────────────────────────────────────────────────────────

function NotificationBell({ notifications, onMarkAll }: {
  notifications: NotificationItem[];
  onMarkAll: () => void;
}) {
  const [open, setOpen] = useState(false);
  const unread = notifications.filter(n => !n.is_read).length;

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          position: "relative", background: "rgba(255,255,255,.06)",
          border: "1px solid rgba(255,255,255,.08)", borderRadius: 8,
          width: 32, height: 32, display: "flex", alignItems: "center",
          justifyContent: "center", cursor: "pointer", fontSize: 15,
        }}
      >
        🔔
        {unread > 0 && (
          <div style={{
            position: "absolute", top: -3, right: -3,
            width: 16, height: 16, borderRadius: "50%",
            background: "#ef4444", border: "2px solid #0c0f1e",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 8, fontWeight: 800, color: "#fff",
          }}>
            {unread > 9 ? "9+" : unread}
          </div>
        )}
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "110%", right: 0,
          width: 320, maxHeight: 380,
          background: "#111827", border: "1px solid rgba(255,255,255,.1)",
          borderRadius: 12, overflow: "hidden",
          boxShadow: "0 16px 48px rgba(0,0,0,.6)",
          zIndex: 100,
        }}>
          <div style={{
            padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,.07)",
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#f0f6fc", fontFamily: "'Geist',system-ui,sans-serif" }}>
              Notifications
            </span>
            {unread > 0 && (
              <button
                onClick={onMarkAll}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  fontSize: 11, color: "#0ef5d4", fontFamily: "'Geist',system-ui,sans-serif",
                }}
              >
                Mark all read
              </button>
            )}
          </div>

          <div style={{ overflowY: "auto", maxHeight: 320 }}>
            {notifications.length === 0 ? (
              <div style={{ padding: "24px 16px", textAlign: "center" }}>
                <p style={{ fontSize: 12, color: "rgba(255,255,255,.3)", margin: 0, fontFamily: "'Geist',system-ui,sans-serif" }}>
                  All caught up!
                </p>
              </div>
            ) : notifications.map(n => (
              <div key={n.id} style={{
                padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,.04)",
                background: n.is_read ? "transparent" : "rgba(14,245,212,.04)",
                display: "flex", gap: 10, alignItems: "flex-start",
              }}>
                <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>
                  {n.type === "mention" ? "@"
                    : n.type === "deal_update" ? "◈"
                    : n.type === "ai_alert" ? "⚠"
                    : n.type === "call_completed" ? "📞"
                    : "💬"}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{
                    fontSize: 12, color: n.is_read ? "rgba(255,255,255,.5)" : "rgba(255,255,255,.85)",
                    margin: "0 0 2px", lineHeight: 1.45,
                    fontFamily: "'Geist',system-ui,sans-serif",
                    fontWeight: n.is_read ? 400 : 600,
                  }}>
                    {n.content}
                  </p>
                  {n.channel_name && (
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,.28)" }}>
                      #{n.channel_name}
                    </span>
                  )}
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,.22)", marginLeft: n.channel_name ? 8 : 0 }}>
                    {msgTime(n.created_at)}
                  </span>
                </div>
                {!n.is_read && (
                  <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#0ef5d4", flexShrink: 0, marginTop: 4 }} />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Create Task Modal ────────────────────────────────────────────────────────

function CreateTaskModal({
  message, channelId, dealId, teamId, members, onClose, onCreated,
}: {
  message: Msg; channelId: string; dealId: string | null; teamId: string | null;
  members: any[]; onClose: () => void; onCreated: () => void;
}) {
  const { user } = useAuth();
  const [title, setTitle] = useState(
    message.content.length > 80 ? message.content.slice(0, 80) + "…" : message.content
  );
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
      position: "fixed", inset: 0, zIndex: 200,
      background: "rgba(0,0,0,.75)", backdropFilter: "blur(8px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }}>
      <div style={{
        width: "100%", maxWidth: 400, background: "#0e1220",
        border: "1px solid rgba(14,245,212,.2)", borderRadius: 16,
        padding: 22, boxShadow: "0 24px 64px rgba(0,0,0,.6)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#f0f6fc", fontFamily: "'Geist',system-ui,sans-serif" }}>
            ✅ Create Task
          </span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,.4)", fontSize: 14 }}>✕</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[
            { label: "Task", val: title, set: setTitle, placeholder: "What needs to be done?", type: "text" as const },
          ].map(({ label, val, set, placeholder, type }) => (
            <div key={label}>
              <label style={{ fontSize: 11, color: "rgba(255,255,255,.4)", display: "block", marginBottom: 5, fontFamily: "'Geist',system-ui,sans-serif" }}>
                {label}
              </label>
              <input
                type={type}
                value={val}
                onChange={e => set(e.target.value)}
                placeholder={placeholder}
                style={{
                  width: "100%", padding: "9px 12px",
                  background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.08)",
                  borderRadius: 10, color: "#f0f6fc", fontSize: 13,
                  fontFamily: "'Geist',system-ui,sans-serif", outline: "none", boxSizing: "border-box",
                }}
              />
            </div>
          ))}

          {members.length > 0 && (
            <div>
              <label style={{ fontSize: 11, color: "rgba(255,255,255,.4)", display: "block", marginBottom: 5, fontFamily: "'Geist',system-ui,sans-serif" }}>
                Assign To
              </label>
              <select
                value={assignedTo}
                onChange={e => setAssignedTo(e.target.value)}
                style={{
                  width: "100%", padding: "9px 12px",
                  background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.08)",
                  borderRadius: 10, color: "#f0f6fc", fontSize: 13,
                  fontFamily: "'Geist',system-ui,sans-serif", outline: "none",
                }}
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

          <div>
            <label style={{ fontSize: 11, color: "rgba(255,255,255,.4)", display: "block", marginBottom: 5, fontFamily: "'Geist',system-ui,sans-serif" }}>
              Due Date (optional)
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              style={{
                width: "100%", padding: "9px 12px",
                background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.08)",
                borderRadius: 10, color: "#f0f6fc", fontSize: 13,
                fontFamily: "'Geist',system-ui,sans-serif", outline: "none",
                colorScheme: "dark",
              }}
            />
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={!title.trim() || saving}
          style={{
            width: "100%", marginTop: 16, padding: 11, borderRadius: 10, border: "none",
            background: title.trim() ? "linear-gradient(135deg,#0ef5d4,#0891b2)" : "rgba(255,255,255,.06)",
            color: title.trim() ? "#060912" : "rgba(255,255,255,.3)",
            fontSize: 13, fontWeight: 700,
            fontFamily: "'Geist',system-ui,sans-serif",
            cursor: title.trim() ? "pointer" : "not-allowed",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          }}
        >
          {saving ? "Creating…" : "Create Task"}
        </button>
      </div>
    </div>
  );
}

// ─── New Channel Modal ────────────────────────────────────────────────────────

function NewChannelModal({
  teamId, onClose, onCreated,
}: { teamId: string; onClose: () => void; onCreated: () => void }) {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [type, setType] = useState<"deal" | "team">("team");
  const [deals, setDeals] = useState<any[]>([]);
  const [dealId, setDealId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    (supabase as any).from("deals").select("id,name").eq("owner_id", user.id).limit(30)
      .then(({ data }: any) => setDeals(data ?? []));
  }, [user]);

  const handleCreate = async () => {
    if (!name.trim()) return;
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
      position: "fixed", inset: 0, zIndex: 200,
      background: "rgba(0,0,0,.75)", backdropFilter: "blur(8px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }}>
      <div style={{
        width: "100%", maxWidth: 360, background: "#0e1220",
        border: "1px solid rgba(255,255,255,.1)", borderRadius: 16,
        padding: 22,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#f0f6fc", fontFamily: "'Geist',system-ui,sans-serif" }}>
            # New Channel
          </span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,.4)", fontSize: 14 }}>✕</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={{ fontSize: 11, color: "rgba(255,255,255,.4)", display: "block", marginBottom: 5, fontFamily: "'Geist',system-ui,sans-serif" }}>Channel Name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleCreate()}
              placeholder="e.g. acme-corp-deal"
              style={{
                width: "100%", padding: "9px 12px",
                background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.08)",
                borderRadius: 10, color: "#f0f6fc", fontSize: 13,
                fontFamily: "'Geist',system-ui,sans-serif", outline: "none", boxSizing: "border-box",
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: 11, color: "rgba(255,255,255,.4)", display: "block", marginBottom: 5, fontFamily: "'Geist',system-ui,sans-serif" }}>Type</label>
            <div style={{ display: "flex", gap: 8 }}>
              {["team", "deal"].map(t => (
                <button
                  key={t}
                  onClick={() => setType(t as any)}
                  style={{
                    flex: 1, padding: "7px 0", borderRadius: 8,
                    border: type === t ? "1px solid rgba(14,245,212,.3)" : "1px solid rgba(255,255,255,.08)",
                    background: type === t ? "rgba(14,245,212,.08)" : "rgba(255,255,255,.03)",
                    color: type === t ? "#0ef5d4" : "rgba(255,255,255,.5)",
                    fontSize: 12, fontWeight: 600, cursor: "pointer",
                    fontFamily: "'Geist',system-ui,sans-serif",
                  }}
                >
                  {t === "team" ? "# Team" : "◈ Deal"}
                </button>
              ))}
            </div>
          </div>

          {deals.length > 0 && (
            <div>
              <label style={{ fontSize: 11, color: "rgba(255,255,255,.4)", display: "block", marginBottom: 5, fontFamily: "'Geist',system-ui,sans-serif" }}>
                Link to Deal (optional)
              </label>
              <select
                value={dealId}
                onChange={e => { setDealId(e.target.value); if (e.target.value) setType("deal"); }}
                style={{
                  width: "100%", padding: "9px 12px",
                  background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.08)",
                  borderRadius: 10, color: "#f0f6fc", fontSize: 13,
                  fontFamily: "'Geist',system-ui,sans-serif", outline: "none",
                }}
              >
                <option value="" style={{ background: "#111" }}>None</option>
                {deals.map((d: any) => (
                  <option key={d.id} value={d.id} style={{ background: "#111" }}>{d.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <button
          onClick={handleCreate}
          disabled={!name.trim() || saving}
          style={{
            width: "100%", marginTop: 16, padding: 11, borderRadius: 10, border: "none",
            background: name.trim() ? "rgba(14,245,212,.9)" : "rgba(255,255,255,.06)",
            color: name.trim() ? "#060912" : "rgba(255,255,255,.3)",
            fontSize: 13, fontWeight: 700,
            fontFamily: "'Geist',system-ui,sans-serif",
            cursor: name.trim() ? "pointer" : "not-allowed",
          }}
        >
          {saving ? "Creating…" : "Create Channel"}
        </button>
      </div>
    </div>
  );
}

// ─── Typing indicator ─────────────────────────────────────────────────────────

function TypingIndicator({ users }: { users: string[] }) {
  if (!users.length) return null;
  return (
    <div style={{ padding: "4px 56px 4px", display: "flex", alignItems: "center", gap: 7 }}>
      <div style={{ display: "flex", gap: 3 }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            width: 5, height: 5, borderRadius: "50%",
            background: "rgba(14,245,212,.5)",
            animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
          }} />
        ))}
      </div>
      <span style={{ fontSize: 11, color: "rgba(255,255,255,.35)", fontFamily: "'Geist',system-ui,sans-serif" }}>
        {users.slice(0, 2).join(", ")} {users.length === 1 ? "is" : "are"} typing…
      </span>
    </div>
  );
}

// ─── Message search ───────────────────────────────────────────────────────────

function MessageSearchBar({ onSearch, onClose }: {
  onSearch: (q: string) => void; onClose: () => void;
}) {
  const [q, setQ] = useState("");
  return (
    <div style={{
      padding: "8px 14px",
      borderBottom: "1px solid rgba(255,255,255,.06)",
      display: "flex", gap: 8, alignItems: "center",
      background: "rgba(255,255,255,.02)",
    }}>
      <span style={{ fontSize: 13, color: "rgba(255,255,255,.3)" }}>🔍</span>
      <input
        autoFocus
        value={q}
        onChange={e => { setQ(e.target.value); onSearch(e.target.value); }}
        placeholder="Search messages in this channel…"
        style={{
          flex: 1, background: "transparent", border: "none", outline: "none",
          fontSize: 13, color: "#f0f6fc", fontFamily: "'Geist',system-ui,sans-serif",
        }}
      />
      <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "rgba(255,255,255,.35)" }}>
        ✕
      </button>
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export default function MessagesPage() {
  const { user } = useAuth();
  const { team, members } = useTeam();
  const teamId = team?.id;

  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);

  const [text, setText] = useState("");
  const [editingMsg, setEditingMsg] = useState<Msg | null>(null);
  const [taskTarget, setTaskTarget] = useState<Msg | null>(null);
  const [threadMsg, setThreadMsg] = useState<Msg | null>(null);
  const [showNewChannel, setShowNewChannel] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showNotifications, setShowNotifications] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isMobileView, setIsMobileView] = useState(false);
  const [mobileScreen, setMobileScreen] = useState<"channels" | "chat" | "context">("channels");

  const [loadingChannels, setLoadingChannels] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [sending, setSending] = useState(false);

  const endRef = useRef<HTMLDivElement>(null);
  const typingTimerRef = useRef<number>();
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const msgChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const activeChannel = useMemo(() => channels.find(c => c.id === activeChannelId) ?? null, [channels, activeChannelId]);

  // Responsive detection
  useEffect(() => {
    const check = () => {
      const mobile = window.innerWidth < 768;
      setIsMobileView(mobile);
      if (!mobile) setSidebarCollapsed(false);
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Load channels
  const loadChannels = useCallback(async () => {
    if (!teamId) return;
    setLoadingChannels(true);
    try {
      const { data } = await (supabase as any).rpc("get_deal_channels_v2", { p_team_id: teamId });
      const chans = (data as Channel[]) ?? [];
      setChannels(chans);
      if (chans.length > 0 && !activeChannelId) {
        setActiveChannelId(chans[0].id);
        if (isMobileView) setMobileScreen("chat");
      }
    } catch (e) {
      // Fallback: create default team channel
      console.warn("get_deal_channels_v2 not found, using fallback");
    } finally {
      setLoadingChannels(false);
    }
  }, [teamId, activeChannelId, isMobileView]);

  useEffect(() => { loadChannels(); }, [teamId]);

  // Load messages
  const loadMessages = useCallback(async (channelId: string) => {
    setLoadingMsgs(true);
    try {
      const { data } = await (supabase as any).rpc("get_channel_messages_v2", {
        p_channel_id: channelId,
        p_limit: 80,
      });
      const msgs = (data as Msg[]) ?? [];
      setMessages(searchQuery ? msgs.filter(m => m.content.toLowerCase().includes(searchQuery.toLowerCase())) : msgs);
    } finally {
      setLoadingMsgs(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    if (!activeChannelId) return;
    loadMessages(activeChannelId);
    loadTasks(activeChannelId);
  }, [activeChannelId]);

  const loadTasks = useCallback(async (channelId: string) => {
    const { data } = await (supabase as any)
      .from("deal_message_tasks")
      .select("*")
      .eq("channel_id", channelId)
      .order("created_at", { ascending: false })
      .limit(20);
    setTasks((data as Task[]) ?? []);
  }, []);

  // Load notifications
  const loadNotifications = useCallback(async () => {
    if (!user) return;
    const { data } = await (supabase as any)
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30);
    setNotifications((data as NotificationItem[]) ?? []);
  }, [user]);

  useEffect(() => { loadNotifications(); }, [user]);

  // Real-time: messages
  useEffect(() => {
    if (!activeChannelId) return;
    if (msgChannelRef.current) supabase.removeChannel(msgChannelRef.current);

    const ch = supabase.channel(`dcm-rt-${activeChannelId}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "deal_channel_messages",
        filter: `channel_id=eq.${activeChannelId}`,
      }, () => {
        loadMessages(activeChannelId);
        loadChannels();
      })
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "deal_channel_messages",
        filter: `channel_id=eq.${activeChannelId}`,
      }, () => loadMessages(activeChannelId))
      .subscribe();

    msgChannelRef.current = ch;
    return () => { supabase.removeChannel(ch); };
  }, [activeChannelId]);

  // Real-time: channels (unread counts)
  useEffect(() => {
    if (!teamId) return;
    const ch = supabase.channel(`dc-rt-${teamId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "deal_channels" }, loadChannels)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [teamId]);

  // Real-time: typing indicator
  useEffect(() => {
    if (!activeChannelId) return;
    if (typingChannelRef.current) supabase.removeChannel(typingChannelRef.current);

    const ch = supabase.channel(`typing-${activeChannelId}`)
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        if (payload.userId === user?.id) return;
        setTypingUsers(prev => {
          if (prev.includes(payload.name)) return prev;
          return [...prev, payload.name];
        });
        setTimeout(() => {
          setTypingUsers(prev => prev.filter(n => n !== payload.name));
        }, 3000);
      })
      .subscribe();

    typingChannelRef.current = ch;
    return () => { supabase.removeChannel(ch); };
  }, [activeChannelId, user?.id]);

  // Real-time: notifications
  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel(`notif-${user.id}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "notifications",
        filter: `user_id=eq.${user.id}`,
      }, loadNotifications)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  // Scroll to bottom
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const broadcastTyping = useCallback(() => {
    if (!typingChannelRef.current || !user) return;
    const name = user.user_metadata?.full_name || user.email?.split("@")[0] || "Someone";
    typingChannelRef.current.send({
      type: "broadcast", event: "typing",
      payload: { userId: user.id, name },
    });
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
  }, [user]);

  const handleTextChange = (val: string) => {
    setText(val);
    if (val.trim()) broadcastTyping();
  };

  const sendMessage = async () => {
    const trimmed = text.trim();
    if (!trimmed || !activeChannelId || !user || sending) return;

    setSending(true);
    setText("");

    try {
      if (editingMsg) {
        await (supabase as any)
          .from("deal_channel_messages")
          .update({ content: trimmed, updated_at: new Date().toISOString() })
          .eq("id", editingMsg.id);
        setEditingMsg(null);
      } else {
        // Check for @mentions and create notifications
        const mentionRegex = /@(\w+)/g;
        const mentions: string[] = [];
        let match;
        while ((match = mentionRegex.exec(trimmed)) !== null) {
          mentions.push(match[1]);
        }

        await (supabase as any).from("deal_channel_messages").insert({
          channel_id: activeChannelId,
          user_id: user.id,
          content: trimmed,
          type: "text",
          metadata: {},
        });

        // Create mention notifications
        if (mentions.length > 0) {
          for (const mention of mentions) {
            const member = members.find(m =>
              (m.profile?.full_name || "").toLowerCase().includes(mention.toLowerCase()) ||
              (m.profile?.email || "").toLowerCase().includes(mention.toLowerCase())
            );
            if (member && member.user_id !== user.id) {
              await supabase.from("notifications").insert({
                user_id: member.user_id,
                type: "mention",
                message: `${user.user_metadata?.full_name || "Someone"} mentioned you: "${trimmed.slice(0, 80)}"`,
              } as any);
            }
          }
        }
      }
      await loadMessages(activeChannelId);
      await loadChannels();
    } catch (e: any) {
      toast.error("Failed to send");
      setText(trimmed);
    } finally {
      setSending(false);
    }
  };

  const handleReact = async (msgId: string, emoji: string) => {
    if (!user) return;
    const msg = messages.find(m => m.id === msgId);
    if (!msg) return;
    const existing = msg.reactions.find(r => r.emoji === emoji && r.by_me);
    if (existing) {
      await (supabase as any).from("deal_channel_reactions")
        .delete().eq("message_id", msgId).eq("user_id", user.id).eq("emoji", emoji);
    } else {
      await (supabase as any).from("deal_channel_reactions").insert({
        message_id: msgId, user_id: user.id, emoji,
      });
    }
    await loadMessages(activeChannelId!);
  };

  const handlePin = async (msgId: string) => {
    const msg = messages.find(m => m.id === msgId);
    if (!msg) return;
    await (supabase as any).from("deal_channel_messages")
      .update({ is_pinned: !msg.is_pinned }).eq("id", msgId);
    await loadMessages(activeChannelId!);
    toast.success(msg.is_pinned ? "Unpinned" : "Message pinned!");
  };

  const handleDelete = async (msgId: string) => {
    await (supabase as any).from("deal_channel_messages").delete().eq("id", msgId);
    setMessages(prev => prev.filter(m => m.id !== msgId));
  };

  const handleTaskToggle = async (taskId: string, done: boolean) => {
    await (supabase as any).from("deal_message_tasks").update({
      is_completed: done,
      completed_at: done ? new Date().toISOString() : null,
    }).eq("id", taskId);
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, is_completed: done } : t));
  };

  const markAllNotificationsRead = async () => {
    if (!user) return;
    await supabase.from("notifications").update({ is_read: true } as any)
      .eq("user_id", user.id).eq("is_read", false);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  };

  const dealChannels = channels.filter(c => c.type === "deal");
  const teamChannels = channels.filter(c => c.type === "team");
  const callChannels = channels.filter(c => c.type === "call");
  const dmChannels = channels.filter(c => c.type === "dm");

  const unreadCount = notifications.filter(n => !n.is_read).length;

  // ── No team state ────────────────────────────────────────────────────────────
  if (!teamId) {
    return (
      <DashboardLayout>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          height: "60vh", fontFamily: "'Geist',system-ui,sans-serif",
        }}>
          <div style={{ textAlign: "center" }}>
            <p style={{ fontSize: 36, marginBottom: 12 }}>💬</p>
            <p style={{ fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,.6)", marginBottom: 8 }}>
              Team Required
            </p>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,.35)" }}>
              Create or join a team to access deal-driven messaging.
            </p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const globalCSS = `
    @import url('https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700;800;900&display=swap');
    @keyframes pulse { 0%,80%,100%{transform:scale(0.5);opacity:.5} 40%{transform:scale(1);opacity:1} }
    * { box-sizing: border-box; }
    ::-webkit-scrollbar { width: 4px; height: 4px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: rgba(255,255,255,.08); border-radius: 4px; }
    ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,.14); }
    textarea:focus, input:focus { outline: none !important; border-color: rgba(14,245,212,.35) !important; }
  `;

  return (
    <DashboardLayout>
      <style>{globalCSS}</style>

      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      {showNewChannel && (
        <NewChannelModal
          teamId={teamId}
          onClose={() => setShowNewChannel(false)}
          onCreated={() => { setShowNewChannel(false); loadChannels(); }}
        />
      )}
      {taskTarget && activeChannelId && (
        <CreateTaskModal
          message={taskTarget}
          channelId={activeChannelId}
          dealId={activeChannel?.deal_id ?? null}
          teamId={teamId}
          members={members}
          onClose={() => setTaskTarget(null)}
          onCreated={() => { setTaskTarget(null); if (activeChannelId) loadTasks(activeChannelId); }}
        />
      )}

      {/* ── Main layout ────────────────────────────────────────────────────── */}
      <div style={{
        display: "flex",
        height: "calc(100vh - 7rem)",
        borderRadius: 14,
        overflow: "hidden",
        border: "1px solid rgba(255,255,255,.07)",
        background: "#08090f",
        fontFamily: "'Geist',system-ui,sans-serif",
        minHeight: 0,
      }}>

        {/* ══════════════════════════════════════════════════════════════════
            LEFT SIDEBAR
        ══════════════════════════════════════════════════════════════════ */}
        <div style={{
          width: isMobileView
            ? (mobileScreen === "channels" ? "100%" : 0)
            : (sidebarCollapsed ? 50 : 240),
          flexShrink: 0,
          borderRight: "1px solid rgba(255,255,255,.06)",
          display: isMobileView && mobileScreen !== "channels" ? "none" : "flex",
          flexDirection: "column",
          background: "#0c0f1e",
          overflow: "hidden",
          transition: "width .2s ease",
          minWidth: 0,
        }}>
          {!sidebarCollapsed && (
            <>
              {/* Workspace header */}
              <div style={{
                padding: "12px 12px 10px",
                borderBottom: "1px solid rgba(255,255,255,.05)",
                background: "linear-gradient(135deg,rgba(14,245,212,.04),rgba(8,145,178,.02))",
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: 7,
                      background: "linear-gradient(135deg,#0ef5d4,#0891b2)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 13, color: "#060912", fontWeight: 900,
                    }}>F</div>
                    <div>
                      <p style={{ fontSize: 12.5, fontWeight: 800, color: "#f0f6fc", margin: 0, lineHeight: 1 }}>
                        {team?.name || "Fixsense"}
                      </p>
                      <p style={{ fontSize: 9.5, color: "rgba(255,255,255,.35)", margin: "2px 0 0" }}>
                        {members.length} members online
                      </p>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                    <NotificationBell notifications={notifications} onMarkAll={markAllNotificationsRead} />
                    <button
                      onClick={() => setShowNewChannel(true)}
                      title="New channel"
                      style={{
                        width: 28, height: 28, borderRadius: 7,
                        background: "rgba(14,245,212,.1)", border: "1px solid rgba(14,245,212,.2)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        cursor: "pointer", fontSize: 15, color: "#0ef5d4",
                      }}
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* Search */}
                <div style={{
                  display: "flex", alignItems: "center", gap: 6,
                  background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.07)",
                  borderRadius: 8, padding: "5px 9px",
                }}>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,.25)" }}>🔍</span>
                  <input
                    placeholder="Find a channel…"
                    style={{
                      flex: 1, background: "transparent", border: "none", outline: "none",
                      fontSize: 11.5, color: "#f0f6fc", fontFamily: "'Geist',system-ui,sans-serif",
                    }}
                  />
                </div>
              </div>

              {/* Channel list */}
              <div style={{ flex: 1, overflowY: "auto", paddingTop: 6 }}>
                {loadingChannels ? (
                  <div style={{ display: "flex", justifyContent: "center", padding: 24 }}>
                    <div style={{
                      width: 18, height: 18, borderRadius: "50%",
                      border: "2px solid rgba(14,245,212,.3)", borderTopColor: "#0ef5d4",
                      animation: "spin 0.8s linear infinite",
                    }} />
                  </div>
                ) : (
                  <>
                    {/* Deal Channels */}
                    {dealChannels.length > 0 && (
                      <>
                        <div style={{ padding: "8px 12px 3px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <span style={{ fontSize: 9.5, fontWeight: 800, color: "rgba(255,255,255,.22)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                            ◈ Deals · {dealChannels.length}
                          </span>
                        </div>
                        {dealChannels.map(ch => (
                          <ChannelItem
                            key={ch.id}
                            ch={ch}
                            isActive={ch.id === activeChannelId}
                            onClick={() => {
                              setActiveChannelId(ch.id);
                              if (isMobileView) setMobileScreen("chat");
                            }}
                            onMute={(id, muted) => {}}
                          />
                        ))}
                      </>
                    )}

                    {/* Team Channels */}
                    {teamChannels.length > 0 && (
                      <>
                        <div style={{ padding: "10px 12px 3px" }}>
                          <span style={{ fontSize: 9.5, fontWeight: 800, color: "rgba(255,255,255,.22)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                            # Channels · {teamChannels.length}
                          </span>
                        </div>
                        {teamChannels.map(ch => (
                          <ChannelItem
                            key={ch.id}
                            ch={ch}
                            isActive={ch.id === activeChannelId}
                            onClick={() => {
                              setActiveChannelId(ch.id);
                              if (isMobileView) setMobileScreen("chat");
                            }}
                            onMute={(id, muted) => {}}
                          />
                        ))}
                      </>
                    )}

                    {/* Call Threads */}
                    {callChannels.length > 0 && (
                      <>
                        <div style={{ padding: "10px 12px 3px" }}>
                          <span style={{ fontSize: 9.5, fontWeight: 800, color: "rgba(255,255,255,.22)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                            ☎ Call Threads · {callChannels.length}
                          </span>
                        </div>
                        {callChannels.map(ch => (
                          <ChannelItem
                            key={ch.id}
                            ch={ch}
                            isActive={ch.id === activeChannelId}
                            onClick={() => {
                              setActiveChannelId(ch.id);
                              if (isMobileView) setMobileScreen("chat");
                            }}
                            onMute={(id, muted) => {}}
                          />
                        ))}
                      </>
                    )}

                    {/* Direct Messages */}
                    {dmChannels.length > 0 && (
                      <>
                        <div style={{ padding: "10px 12px 3px" }}>
                          <span style={{ fontSize: 9.5, fontWeight: 800, color: "rgba(255,255,255,.22)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                            ● DMs · {dmChannels.length}
                          </span>
                        </div>
                        {dmChannels.map(ch => (
                          <ChannelItem
                            key={ch.id}
                            ch={ch}
                            isActive={ch.id === activeChannelId}
                            onClick={() => {
                              setActiveChannelId(ch.id);
                              if (isMobileView) setMobileScreen("chat");
                            }}
                            onMute={(id, muted) => {}}
                          />
                        ))}
                      </>
                    )}

                    {channels.length === 0 && !loadingChannels && (
                      <div style={{ padding: "28px 16px", textAlign: "center" }}>
                        <p style={{ fontSize: 13, color: "rgba(255,255,255,.22)", margin: "0 0 4px" }}>No channels yet</p>
                        <button
                          onClick={() => setShowNewChannel(true)}
                          style={{
                            marginTop: 10, padding: "7px 16px",
                            background: "rgba(14,245,212,.1)", border: "1px solid rgba(14,245,212,.2)",
                            borderRadius: 8, color: "#0ef5d4", fontSize: 12, fontWeight: 600,
                            cursor: "pointer", fontFamily: "'Geist',system-ui,sans-serif",
                          }}
                        >
                          + Create Channel
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            CENTER: CHAT AREA
        ══════════════════════════════════════════════════════════════════ */}
        <div style={{
          flex: 1, minWidth: 0,
          display: isMobileView && mobileScreen !== "chat" ? "none" : "flex",
          flexDirection: "column",
          borderRight: "1px solid rgba(255,255,255,.05)",
        }}>
          {activeChannelId && activeChannel ? (
            <>
              {/* Chat header */}
              <div style={{
                padding: "10px 14px",
                borderBottom: "1px solid rgba(255,255,255,.06)",
                display: "flex", alignItems: "center", gap: 10,
                flexShrink: 0,
                background: "rgba(255,255,255,.02)",
              }}>
                {/* Back button mobile */}
                {isMobileView && (
                  <button
                    onClick={() => setMobileScreen("channels")}
                    style={{
                      background: "none", border: "none", cursor: "pointer",
                      color: "#0ef5d4", fontSize: 16, padding: 0, flexShrink: 0,
                    }}
                  >
                    ←
                  </button>
                )}

                <div style={{
                  width: 32, height: 32, borderRadius: 9, flexShrink: 0,
                  background: activeChannel.type === "deal"
                    ? getStage(activeChannel.deal_stage).bg
                    : "rgba(255,255,255,.05)",
                  border: `1px solid ${activeChannel.type === "deal" ? getStage(activeChannel.deal_stage).color + "30" : "rgba(255,255,255,.08)"}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 13,
                }}>
                  {activeChannel.type === "deal" ? "◈"
                    : activeChannel.type === "call" ? "☎"
                    : activeChannel.type === "dm" ? "●"
                    : "#"}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{
                    fontSize: 14, fontWeight: 700, color: "#f0f6fc",
                    margin: 0, overflow: "hidden", textOverflow: "ellipsis",
                    whiteSpace: "nowrap", fontFamily: "'Geist',system-ui,sans-serif",
                  }}>
                    {activeChannel.name}
                  </p>
                  {activeChannel.deal_stage && (
                    <p style={{ fontSize: 10.5, color: "rgba(255,255,255,.3)", margin: 0 }}>
                      {getStage(activeChannel.deal_stage).label}
                      {activeChannel.deal_value ? ` · ${fmtCurrency(activeChannel.deal_value)}` : ""}
                    </p>
                  )}
                </div>

                {/* Header actions */}
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                  {messages.filter(m => m.is_pinned).length > 0 && (
                    <span style={{ fontSize: 10, color: "#fbbf24", display: "flex", alignItems: "center", gap: 3 }}>
                      📌 {messages.filter(m => m.is_pinned).length}
                    </span>
                  )}
                  {tasks.filter(t => !t.is_completed).length > 0 && (
                    <span style={{ fontSize: 10, color: "#0ef5d4", display: "flex", alignItems: "center", gap: 3 }}>
                      ✅ {tasks.filter(t => !t.is_completed).length}
                    </span>
                  )}
                  <button
                    onClick={() => setShowSearch(v => !v)}
                    style={{
                      background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.08)",
                      borderRadius: 7, padding: "4px 8px", cursor: "pointer",
                      fontSize: 12, color: showSearch ? "#0ef5d4" : "rgba(255,255,255,.4)",
                    }}
                  >
                    🔍
                  </button>
                  {!isMobileView && activeChannel.deal_id && (
                    <button
                      onClick={() => setMobileScreen(v => v === "context" ? "chat" : "context")}
                      style={{
                        background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.08)",
                        borderRadius: 7, padding: "4px 8px", cursor: "pointer",
                        fontSize: 11, color: "rgba(255,255,255,.4)", fontFamily: "'Geist',system-ui,sans-serif",
                      }}
                    >
                      Deal Intel
                    </button>
                  )}
                  {isMobileView && (
                    <button
                      onClick={() => setMobileScreen("context")}
                      style={{
                        background: "rgba(255,255,255,.06)", border: "none",
                        borderRadius: 7, padding: "4px 8px", cursor: "pointer", fontSize: 13,
                      }}
                    >
                      ℹ️
                    </button>
                  )}
                </div>
              </div>

              {/* Search bar */}
              {showSearch && (
                <MessageSearchBar
                  onSearch={setSearchQuery}
                  onClose={() => { setShowSearch(false); setSearchQuery(""); }}
                />
              )}

              {/* Messages list */}
              <div style={{ flex: 1, overflowY: "auto", padding: "12px 8px 4px", minHeight: 0 }}>
                {loadingMsgs ? (
                  <div style={{ display: "flex", justifyContent: "center", padding: 32 }}>
                    <div style={{
                      width: 20, height: 20, borderRadius: "50%",
                      border: "2px solid rgba(14,245,212,.3)", borderTopColor: "#0ef5d4",
                      animation: "spin 0.8s linear infinite",
                    }} />
                  </div>
                ) : messages.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "48px 24px" }}>
                    <p style={{ fontSize: 32, marginBottom: 10 }}>
                      {activeChannel.type === "deal" ? "◈" : "#"}
                    </p>
                    <p style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,.4)", margin: "0 0 6px", fontFamily: "'Geist',system-ui,sans-serif" }}>
                      {activeChannel.name}
                    </p>
                    <p style={{ fontSize: 12, color: "rgba(255,255,255,.2)", margin: 0, lineHeight: 1.6 }}>
                      {activeChannel.type === "deal"
                        ? "Discuss this deal, share call insights, and coordinate your close."
                        : "Start the conversation. Call insights will auto-post here."}
                    </p>
                  </div>
                ) : (
                  <>
                    {messages.map((msg, i) => {
                      const prevMsg = i > 0 ? messages[i - 1] : null;
                      const showDateDivider = !prevMsg ||
                        !isToday(new Date(msg.created_at)) !== !isToday(new Date(prevMsg.created_at)) ||
                        new Date(msg.created_at).toDateString() !== new Date(prevMsg.created_at).toDateString();

                      return (
                        <div key={msg.id}>
                          {showDateDivider && (
                            <div style={{ display: "flex", alignItems: "center", margin: "12px 8px", gap: 8 }}>
                              <div style={{ flex: 1, height: "1px", background: "rgba(255,255,255,.07)" }} />
                              <span style={{ fontSize: 10.5, color: "rgba(255,255,255,.28)", whiteSpace: "nowrap" }}>
                                {isToday(new Date(msg.created_at)) ? "Today"
                                  : isYesterday(new Date(msg.created_at)) ? "Yesterday"
                                  : format(new Date(msg.created_at), "MMMM d")}
                              </span>
                              <div style={{ flex: 1, height: "1px", background: "rgba(255,255,255,.07)" }} />
                            </div>
                          )}
                          <MessageBubble
                            msg={msg}
                            isOwn={msg.user_id === user?.id}
                            currentUserId={user?.id}
                            onReact={handleReact}
                            onPin={handlePin}
                            onEdit={(m) => { setEditingMsg(m); setText(m.content); }}
                            onDelete={handleDelete}
                            onTask={setTaskTarget}
                            onThread={setThreadMsg}
                          />
                        </div>
                      );
                    })}
                    <TypingIndicator users={typingUsers} />
                    <div ref={endRef} style={{ height: 4 }} />
                  </>
                )}
              </div>

              {/* Edit mode banner */}
              {editingMsg && (
                <div style={{
                  padding: "6px 14px", borderTop: "1px solid rgba(255,255,255,.06)",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  background: "rgba(255,255,255,.025)",
                }}>
                  <span style={{ fontSize: 11.5, color: "rgba(255,255,255,.5)", fontFamily: "'Geist',system-ui,sans-serif" }}>
                    ✏️ Editing message
                  </span>
                  <button
                    onClick={() => { setEditingMsg(null); setText(""); }}
                    style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "rgba(255,255,255,.4)" }}
                  >
                    Cancel ✕
                  </button>
                </div>
              )}

              {/* AI suggestion strip */}
              {activeChannel.deal_id && messages.length > 2 && (
                <div style={{
                  padding: "5px 14px",
                  display: "flex", alignItems: "center", gap: 6,
                  borderTop: "1px solid rgba(255,255,255,.04)",
                  background: "rgba(99,102,241,.04)",
                }}>
                  <span style={{ fontSize: 11 }}>✨</span>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,.3)", fontFamily: "'Geist',system-ui,sans-serif" }}>
                    Tip: Use <span style={{ color: "#818cf8" }}>@name</span> to mention teammates · Hover a message to react, thread, or create a task
                  </span>
                </div>
              )}

              {/* Message input */}
              <div style={{
                padding: "10px 12px 12px",
                borderTop: "1px solid rgba(255,255,255,.06)",
                flexShrink: 0,
                background: "rgba(255,255,255,.01)",
              }}>
                <div style={{
                  display: "flex", alignItems: "flex-end", gap: 8,
                  background: "rgba(255,255,255,.04)",
                  border: `1px solid ${text ? "rgba(14,245,212,.25)" : "rgba(255,255,255,.08)"}`,
                  borderRadius: 12, padding: "8px 10px 8px 12px",
                  transition: "border-color .15s",
                }}>
                  <textarea
                    value={text}
                    onChange={e => handleTextChange(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                      }
                    }}
                    placeholder={`Message ${activeChannel.type === "dm" ? activeChannel.name : "#" + activeChannel.name}… (Enter to send, Shift+Enter for new line)`}
                    rows={1}
                    style={{
                      flex: 1, background: "transparent", border: "none", outline: "none",
                      resize: "none", fontSize: 13.5, color: "#f0f6fc",
                      fontFamily: "'Geist',system-ui,sans-serif", lineHeight: 1.5,
                      maxHeight: 120, overflowY: "auto",
                    }}
                  />

                  <div style={{ display: "flex", gap: 5, alignItems: "center", flexShrink: 0 }}>
                    <button
                      title="Attach file"
                      style={{
                        background: "none", border: "none", cursor: "pointer",
                        fontSize: 15, color: "rgba(255,255,255,.25)",
                        padding: "2px 4px",
                      }}
                    >
                      📎
                    </button>
                    <button
                      onClick={sendMessage}
                      disabled={!text.trim() || sending}
                      style={{
                        width: 32, height: 32, borderRadius: 8, border: "none",
                        background: text.trim()
                          ? "linear-gradient(135deg,#0ef5d4,#0891b2)"
                          : "rgba(255,255,255,.06)",
                        color: text.trim() ? "#060912" : "rgba(255,255,255,.2)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        cursor: text.trim() ? "pointer" : "not-allowed",
                        fontSize: 16, transition: "all .15s",
                        transform: sending ? "scale(0.9)" : "scale(1)",
                      }}
                    >
                      {sending ? "…" : "↑"}
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div style={{
              flex: 1, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", padding: 32,
            }}>
              <div style={{
                width: 72, height: 72, borderRadius: 20,
                background: "rgba(14,245,212,.07)",
                border: "1px solid rgba(14,245,212,.12)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 30, marginBottom: 16,
              }}>
                💬
              </div>
              <p style={{ fontSize: 16, fontWeight: 700, color: "rgba(255,255,255,.4)", margin: "0 0 8px", fontFamily: "'Geist',system-ui,sans-serif" }}>
                Select a channel
              </p>
              <p style={{ fontSize: 12.5, color: "rgba(255,255,255,.2)", textAlign: "center", maxWidth: 280, lineHeight: 1.6, margin: 0 }}>
                Every deal has a dedicated channel. Calls auto-post AI insights. Collaborate to close.
              </p>
              {channels.length === 0 && !loadingChannels && (
                <button
                  onClick={() => setShowNewChannel(true)}
                  style={{
                    marginTop: 20, padding: "10px 22px",
                    background: "rgba(14,245,212,.1)", border: "1px solid rgba(14,245,212,.22)",
                    borderRadius: 10, color: "#0ef5d4", fontSize: 13, fontWeight: 600,
                    cursor: "pointer", fontFamily: "'Geist',system-ui,sans-serif",
                  }}
                >
                  + Create First Channel
                </button>
              )}
            </div>
          )}
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            RIGHT: THREAD / CONTEXT PANEL
        ══════════════════════════════════════════════════════════════════ */}
        {(threadMsg || (activeChannel && !isMobileView)) && (
          <div style={{
            width: isMobileView ? "100%" : 260,
            flexShrink: 0,
            display: isMobileView && mobileScreen !== "context" ? "none" : "flex",
            flexDirection: "column",
            background: "#0c0f1e",
            overflow: "hidden",
          }}>
            {threadMsg ? (
              <ThreadPanel
                parentMsg={threadMsg}
                currentUserId={user?.id}
                onClose={() => setThreadMsg(null)}
              />
            ) : activeChannel ? (
              <>
                <div style={{
                  padding: "12px 14px",
                  borderBottom: "1px solid rgba(255,255,255,.06)",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  flexShrink: 0,
                }}>
                  <span style={{
                    fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,.28)",
                    textTransform: "uppercase", letterSpacing: "0.09em",
                  }}>
                    {activeChannel.type === "deal" ? "Deal Intel"
                      : activeChannel.type === "call" ? "Call Context"
                      : "Channel Info"}
                  </span>
                  {isMobileView && (
                    <button
                      onClick={() => setMobileScreen("chat")}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,.35)", fontSize: 13 }}
                    >
                      ✕
                    </button>
                  )}
                </div>
                <div style={{ flex: 1, overflowY: "auto" }}>
                  <DealContextPanel
                    channel={activeChannel}
                    tasks={tasks}
                    onTaskToggle={handleTaskToggle}
                    onRefreshTasks={() => activeChannelId && loadTasks(activeChannelId)}
                  />
                </div>
              </>
            ) : null}
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </DashboardLayout>
  );
}