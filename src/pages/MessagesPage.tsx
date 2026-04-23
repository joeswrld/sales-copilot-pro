/**
 * MessagesPage.tsx — v2
 * Fixes:
 *  - Uses get_deal_channels_v2 (now deployed) with fallback to team_conversations
 *  - Team member DMs via existing team_conversations / team_messages infra
 *  - Mobile-friendly notification panel (bottom sheet on mobile, popover on desktop)
 *  - Full mobile responsiveness with proper bottom nav
 */

import {
  useState, useEffect, useRef, useCallback, useMemo,
} from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useTeam } from "@/hooks/useTeam";
import { useTeamMessaging, useConversationMessages, getConversationName } from "@/hooks/useTeamMessaging";
import { supabase } from "@/integrations/supabase/client";
import { format, isToday, isYesterday } from "date-fns";
import { toast } from "sonner";
import { Send, Plus, Bell, X, ChevronLeft, Hash, Users, MessageSquare, Search, CheckCheck } from "lucide-react";

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
  // for team DMs
  conversationId?: string;
}

interface Msg {
  id: string;
  channel_id?: string;
  conversation_id?: string;
  user_id: string | null;
  sender_id?: string;
  parent_id: string | null;
  content?: string;
  message_text?: string;
  type: string;
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
  // team_messages compat
  sender?: { full_name: string | null; email: string | null };
  file_url?: string | null;
}

interface NotificationItem {
  id: string;
  type: string;
  message: string;
  is_read: boolean;
  created_at: string;
  reference_id: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STAGE_CFG: Record<string, { color: string; bg: string; label: string }> = {
  discovery:   { color: "#60a5fa", bg: "rgba(96,165,250,.1)",  label: "Discovery" },
  demo:        { color: "#a78bfa", bg: "rgba(167,139,250,.1)", label: "Demo" },
  negotiation: { color: "#fbbf24", bg: "rgba(251,191,36,.1)",  label: "Negotiation" },
  proposal:    { color: "#34d399", bg: "rgba(52,211,153,.1)",  label: "Proposal" },
  won:         { color: "#22c55e", bg: "rgba(34,197,94,.1)",   label: "Won" },
  lost:        { color: "#ef4444", bg: "rgba(239,68,68,.1)",   label: "Lost" },
};

function getStage(s?: string | null) {
  return STAGE_CFG[s?.toLowerCase() ?? ""] ?? { color: "#94a3b8", bg: "rgba(148,163,184,.1)", label: "New" };
}

function fmtTime(d: string) {
  const dt = new Date(d);
  if (isToday(dt))     return format(dt, "h:mm a");
  if (isYesterday(dt)) return "Yesterday";
  return format(dt, "MMM d");
}

function initials(name: string | null | undefined) {
  if (!name) return "?";
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

function msgText(msg: Msg): string {
  return msg.content || msg.message_text || "";
}

function msgUserId(msg: Msg): string | null {
  return msg.user_id || msg.sender_id || null;
}

function msgSenderName(msg: Msg): string {
  return msg.sender_name || msg.sender?.full_name || msg.sender?.email?.split("@")[0] || "Unknown";
}

// ─── CSS ──────────────────────────────────────────────────────────────────────

const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700;800;900&display=swap');
  @keyframes msg-in { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
  @keyframes slide-up { from { transform:translateY(100%); opacity:0; } to { transform:translateY(0); opacity:1; } }
  @keyframes fade-in { from { opacity:0; } to { opacity:1; } }
  @keyframes spin { to { transform: rotate(360deg); } }
  .msg-bubble { animation: msg-in 0.18s ease; }
  * { box-sizing: border-box; }
  ::-webkit-scrollbar { width: 3px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(255,255,255,.1); border-radius: 3px; }
  textarea:focus, input:focus { outline: none !important; }
  .notif-sheet { animation: slide-up 0.25s ease; }
  .notif-popover { animation: fade-in 0.15s ease; }
`;

// ─── Avatar Component ─────────────────────────────────────────────────────────

function Avatar({ name, size = 32, color = "#0ef5d4" }: { name?: string | null; size?: number; color?: string }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: size * 0.3, flexShrink: 0,
      background: `${color}18`, border: `1px solid ${color}30`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.38, fontWeight: 700, color,
      fontFamily: "'Geist',system-ui,sans-serif",
    }}>
      {initials(name)}
    </div>
  );
}

// ─── Notification Bell (works on both mobile + desktop) ───────────────────────

function NotificationBell({
  notifications, onMarkAll, onMarkOne, isMobile,
}: {
  notifications: NotificationItem[];
  onMarkAll: () => void;
  onMarkOne: (id: string) => void;
  isMobile: boolean;
}) {
  const [open, setOpen] = useState(false);
  const unread = notifications.filter(n => !n.is_read).length;
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open || isMobile) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, isMobile]);

  const typeIcon: Record<string, string> = {
    comment: "💬", coaching: "📈", mention: "@", system: "⚙️", default: "🔔",
  };

  const NotifList = () => (
    <div style={{ overflowY: "auto", flex: 1 }}>
      {notifications.length === 0 ? (
        <div style={{ padding: "40px 20px", textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🔔</div>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,.3)", margin: 0, fontFamily: "'Geist',system-ui,sans-serif" }}>
            All caught up!
          </p>
        </div>
      ) : notifications.map(n => (
        <div
          key={n.id}
          onClick={() => { if (!n.is_read) onMarkOne(n.id); }}
          style={{
            display: "flex", gap: 12, padding: "12px 16px",
            borderBottom: "1px solid rgba(255,255,255,.04)",
            background: n.is_read ? "transparent" : "rgba(14,245,212,.04)",
            cursor: n.is_read ? "default" : "pointer",
            transition: "background .15s",
          }}
        >
          <div style={{
            width: 34, height: 34, borderRadius: 10, flexShrink: 0,
            background: "rgba(255,255,255,.06)",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14,
          }}>
            {typeIcon[n.type] ?? typeIcon.default}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{
              fontSize: 13, margin: "0 0 3px", lineHeight: 1.45,
              color: n.is_read ? "rgba(255,255,255,.5)" : "rgba(255,255,255,.88)",
              fontWeight: n.is_read ? 400 : 600,
              fontFamily: "'Geist',system-ui,sans-serif",
              overflow: "hidden", textOverflow: "ellipsis",
              display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
            }}>
              {n.message}
            </p>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,.28)" }}>
              {fmtTime(n.created_at)}
            </span>
          </div>
          {!n.is_read && (
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#0ef5d4", flexShrink: 0, marginTop: 4 }} />
          )}
        </div>
      ))}
    </div>
  );

  const Header = () => (
    <div style={{
      padding: "14px 16px", borderBottom: "1px solid rgba(255,255,255,.08)",
      display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: "#f0f6fc", fontFamily: "'Geist',system-ui,sans-serif" }}>
          Notifications
        </span>
        {unread > 0 && (
          <span style={{
            fontSize: 10, fontWeight: 800, background: "#ef4444", color: "#fff",
            borderRadius: 10, padding: "1px 6px",
          }}>{unread}</span>
        )}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {unread > 0 && (
          <button
            onClick={onMarkAll}
            style={{
              background: "rgba(14,245,212,.1)", border: "1px solid rgba(14,245,212,.2)",
              borderRadius: 7, padding: "4px 10px", cursor: "pointer",
              fontSize: 11, color: "#0ef5d4", fontFamily: "'Geist',system-ui,sans-serif",
              display: "flex", alignItems: "center", gap: 4,
            }}
          >
            <CheckCheck size={11} /> All read
          </button>
        )}
        {isMobile && (
          <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,.4)", fontSize: 18, lineHeight: 1 }}>
            ×
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {/* Bell button */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          position: "relative",
          background: open ? "rgba(14,245,212,.12)" : "rgba(255,255,255,.07)",
          border: `1px solid ${open ? "rgba(14,245,212,.3)" : "rgba(255,255,255,.1)"}`,
          borderRadius: 9, width: 36, height: 36,
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer", color: open ? "#0ef5d4" : "rgba(255,255,255,.6)",
          transition: "all .15s",
        }}
      >
        <Bell size={15} />
        {unread > 0 && (
          <div style={{
            position: "absolute", top: -4, right: -4,
            minWidth: 17, height: 17, borderRadius: 9,
            background: "#ef4444", border: "2px solid #08090f",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 9, fontWeight: 800, color: "#fff", padding: "0 3px",
          }}>
            {unread > 99 ? "99+" : unread}
          </div>
        )}
      </button>

      {/* Desktop popover */}
      {open && !isMobile && (
        <div
          className="notif-popover"
          style={{
            position: "absolute", top: "calc(100% + 8px)", right: 0,
            width: 340, maxHeight: 480,
            background: "#111827", border: "1px solid rgba(255,255,255,.1)",
            borderRadius: 14, overflow: "hidden",
            boxShadow: "0 20px 60px rgba(0,0,0,.7)",
            zIndex: 200, display: "flex", flexDirection: "column",
          }}
        >
          <Header />
          <NotifList />
        </div>
      )}

      {/* Mobile bottom sheet */}
      {open && isMobile && (
        <div style={{ position: "fixed", inset: 0, zIndex: 300 }}>
          {/* Backdrop */}
          <div
            onClick={() => setOpen(false)}
            style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.65)", backdropFilter: "blur(4px)" }}
          />
          {/* Sheet */}
          <div
            className="notif-sheet"
            style={{
              position: "absolute", bottom: 0, left: 0, right: 0,
              background: "#111827", borderRadius: "18px 18px 0 0",
              border: "1px solid rgba(255,255,255,.1)",
              borderBottom: "none", maxHeight: "75vh",
              display: "flex", flexDirection: "column",
            }}
          >
            {/* Drag handle */}
            <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 0" }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,.2)" }} />
            </div>
            <Header />
            <NotifList />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── New DM Modal ─────────────────────────────────────────────────────────────

function NewDMModal({
  members, currentUserId, conversations, teamId,
  onClose, onCreated,
}: {
  members: any[];
  currentUserId: string;
  conversations: any[];
  teamId: string;
  onClose: () => void;
  onCreated: (id: string, name: string) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const others = members.filter(m => m.user_id !== currentUserId && m.status === "active");

  const handleStart = async () => {
    if (!selected.length) return;
    setLoading(true);
    try {
      // Check existing 1-on-1
      if (selected.length === 1) {
        const existing = conversations.find(c =>
          !c.is_group && c.participants?.length === 1 && c.participants.some((p: any) => p.user_id === selected[0])
        );
        if (existing) {
          const name = existing.participants[0]?.full_name || existing.participants[0]?.email || "DM";
          onCreated(existing.id, name);
          return;
        }
      }
      // Create new conversation
      const convoId = crypto.randomUUID();
      const { error: ce } = await supabase.from("team_conversations").insert({ id: convoId, team_id: teamId });
      if (ce) throw ce;
      const participants = [currentUserId, ...selected].map(uid => ({ conversation_id: convoId, user_id: uid }));
      const { error: pe } = await supabase.from("conversation_participants").insert(participants);
      if (pe) throw pe;
      const m = members.find(m => m.user_id === selected[0]);
      const name = selected.length === 1
        ? (m?.profile?.full_name || m?.profile?.email || "DM")
        : `Group (${selected.length + 1})`;
      onCreated(convoId, name);
    } catch (e: any) {
      toast.error(e.message || "Failed to start conversation");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,.7)", backdropFilter: "blur(6px)", display: "flex", alignItems: "flex-end" }}>
      <div style={{
        width: "100%", maxWidth: 420, margin: "0 auto",
        background: "#111827", borderRadius: "16px 16px 0 0",
        border: "1px solid rgba(255,255,255,.1)", borderBottom: "none",
        padding: 20,
      }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,.2)" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#f0f6fc", fontFamily: "'Geist',system-ui,sans-serif" }}>
            New Message
          </span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,.4)", fontSize: 18 }}>×</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 300, overflowY: "auto", marginBottom: 16 }}>
          {others.map(m => {
            const name = m.profile?.full_name || m.invited_email || "Unknown";
            const checked = selected.includes(m.user_id);
            return (
              <div
                key={m.id}
                onClick={() => setSelected(prev => checked ? prev.filter(id => id !== m.user_id) : [...prev, m.user_id])}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "10px 12px", borderRadius: 10, cursor: "pointer",
                  background: checked ? "rgba(14,245,212,.08)" : "rgba(255,255,255,.03)",
                  border: `1px solid ${checked ? "rgba(14,245,212,.25)" : "rgba(255,255,255,.07)"}`,
                  transition: "all .1s",
                }}
              >
                <div style={{
                  width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                  border: `2px solid ${checked ? "#0ef5d4" : "rgba(255,255,255,.3)"}`,
                  background: checked ? "#0ef5d4" : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {checked && <span style={{ fontSize: 11, color: "#060912", fontWeight: 800 }}>✓</span>}
                </div>
                <Avatar name={name} size={32} color={checked ? "#0ef5d4" : "#a78bfa"} />
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: "#f0f6fc", margin: 0, fontFamily: "'Geist',system-ui,sans-serif" }}>{name}</p>
                  <p style={{ fontSize: 11, color: "rgba(255,255,255,.35)", margin: 0, textTransform: "capitalize" }}>{m.role}</p>
                </div>
              </div>
            );
          })}
          {others.length === 0 && (
            <p style={{ textAlign: "center", color: "rgba(255,255,255,.3)", fontSize: 13, padding: "20px 0", fontFamily: "'Geist',system-ui,sans-serif" }}>
              No other team members
            </p>
          )}
        </div>
        <button
          onClick={handleStart}
          disabled={!selected.length || loading}
          style={{
            width: "100%", padding: "12px 0", borderRadius: 11, border: "none",
            background: selected.length ? "linear-gradient(135deg,#0ef5d4,#0891b2)" : "rgba(255,255,255,.08)",
            color: selected.length ? "#060912" : "rgba(255,255,255,.3)",
            fontSize: 14, fontWeight: 700, cursor: selected.length ? "pointer" : "not-allowed",
            fontFamily: "'Geist',system-ui,sans-serif",
          }}
        >
          {loading ? "Starting…" : selected.length > 1 ? "Start Group Chat" : "Start Conversation"}
        </button>
      </div>
    </div>
  );
}

// ─── Channel List Item ────────────────────────────────────────────────────────

function ChannelItem({ ch, isActive, onClick }: { ch: Channel; isActive: boolean; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  const icon = ch.type === "deal" ? "◈" : ch.type === "dm" ? "●" : "#";
  const iconColor = ch.type === "deal" ? getStage(ch.deal_stage).color : ch.type === "dm" ? "#a78bfa" : "#60a5fa";

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex", alignItems: "center", gap: 10, width: "100%",
        padding: "9px 12px", border: "none", textAlign: "left",
        background: isActive ? "rgba(14,245,212,.09)" : hovered ? "rgba(255,255,255,.04)" : "transparent",
        borderLeft: `2px solid ${isActive ? "#0ef5d4" : "transparent"}`,
        cursor: "pointer", transition: "all .1s",
      }}
    >
      <span style={{ fontSize: 12, color: iconColor, flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 4 }}>
          <span style={{
            fontSize: 13, fontWeight: ch.unread_count > 0 ? 700 : 500,
            color: isActive ? "#f0f6fc" : "rgba(255,255,255,.65)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            fontFamily: "'Geist',system-ui,sans-serif",
          }}>
            {ch.name}
          </span>
          {ch.last_msg_at && (
            <span style={{ fontSize: 10, color: "rgba(255,255,255,.25)", flexShrink: 0 }}>
              {fmtTime(ch.last_msg_at)}
            </span>
          )}
        </div>
        {ch.last_msg && (
          <span style={{
            fontSize: 11.5, color: "rgba(255,255,255,.3)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block",
          }}>
            {ch.last_msg.length > 40 ? ch.last_msg.slice(0, 40) + "…" : ch.last_msg}
          </span>
        )}
      </div>
      {ch.unread_count > 0 && (
        <span style={{
          fontSize: 10, fontWeight: 800, color: "#060912",
          background: "#0ef5d4", borderRadius: 10, padding: "1.5px 6px", flexShrink: 0,
        }}>
          {ch.unread_count > 99 ? "99+" : ch.unread_count}
        </span>
      )}
    </button>
  );
}

// ─── Message Bubble ───────────────────────────────────────────────────────────

function MessageBubble({ msg, isOwn, isMobile }: { msg: Msg; isOwn: boolean; isMobile: boolean }) {
  const text = msgText(msg);
  const name = msgSenderName(msg);

  if (msg.type === "system") {
    return (
      <div style={{ textAlign: "center", padding: "4px 0" }}>
        <span style={{
          fontSize: 11, color: "rgba(255,255,255,.3)",
          background: "rgba(255,255,255,.05)",
          borderRadius: 20, padding: "3px 12px",
        }}>{text}</span>
      </div>
    );
  }

  return (
    <div
      className="msg-bubble"
      style={{
        display: "flex", flexDirection: isOwn ? "row-reverse" : "row",
        alignItems: "flex-end", gap: 8, marginBottom: 2,
      }}
    >
      {!isOwn && <Avatar name={name} size={28} color="#a78bfa" />}
      <div style={{ maxWidth: isMobile ? "85%" : "72%", minWidth: 0 }}>
        {!isOwn && (
          <div style={{ display: "flex", gap: 6, marginBottom: 3, alignItems: "baseline" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,.75)", fontFamily: "'Geist',system-ui,sans-serif" }}>
              {name}
            </span>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,.22)" }}>{fmtTime(msg.created_at)}</span>
          </div>
        )}
        <div style={{
          padding: "9px 13px",
          background: isOwn
            ? "linear-gradient(135deg,rgba(14,245,212,.9),rgba(8,145,178,.9))"
            : "rgba(255,255,255,.07)",
          border: isOwn ? "none" : "1px solid rgba(255,255,255,.08)",
          borderRadius: isOwn ? "13px 13px 3px 13px" : "13px 13px 13px 3px",
          fontSize: 13.5, lineHeight: 1.55,
          color: isOwn ? "#060912" : "rgba(255,255,255,.9)",
          fontFamily: "'Geist',system-ui,sans-serif",
          wordBreak: "break-word",
        }}>
          {msg.file_url ? (
            <a href={msg.file_url} target="_blank" rel="noopener noreferrer"
              style={{ color: isOwn ? "#060912" : "#0ef5d4", textDecoration: "underline" }}>
              📎 {text}
            </a>
          ) : text}
        </div>
        {isOwn && (
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 2 }}>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,.22)" }}>{fmtTime(msg.created_at)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── New Channel Modal ────────────────────────────────────────────────────────

function NewChannelModal({ teamId, onClose, onCreated }: { teamId: string; onClose: () => void; onCreated: () => void }) {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const { error } = await (supabase as any).from("deal_channels").insert({
        team_id: teamId, type: "team", name: name.trim(), created_by: user?.id,
      });
      if (error) throw error;
      toast.success("Channel created!");
      onCreated();
      onClose();
    } catch (e: any) {
      toast.error(e.message);
    } finally { setSaving(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,.7)", backdropFilter: "blur(6px)", display: "flex", alignItems: "flex-end" }}>
      <div style={{ width: "100%", maxWidth: 420, margin: "0 auto", background: "#111827", borderRadius: "16px 16px 0 0", border: "1px solid rgba(255,255,255,.1)", borderBottom: "none", padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,.2)" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#f0f6fc", fontFamily: "'Geist',system-ui,sans-serif" }}># New Channel</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,.4)", fontSize: 18 }}>×</button>
        </div>
        <input
          autoFocus value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleCreate()}
          placeholder="Channel name (e.g. general, sales-team)"
          style={{
            width: "100%", padding: "11px 14px", borderRadius: 10, marginBottom: 14,
            background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.1)",
            color: "#f0f6fc", fontSize: 14, fontFamily: "'Geist',system-ui,sans-serif",
          }}
        />
        <button
          onClick={handleCreate} disabled={!name.trim() || saving}
          style={{
            width: "100%", padding: "12px 0", borderRadius: 11, border: "none",
            background: name.trim() ? "rgba(14,245,212,.9)" : "rgba(255,255,255,.08)",
            color: name.trim() ? "#060912" : "rgba(255,255,255,.3)",
            fontSize: 14, fontWeight: 700, cursor: name.trim() ? "pointer" : "not-allowed",
            fontFamily: "'Geist',system-ui,sans-serif",
          }}
        >
          {saving ? "Creating…" : "Create Channel"}
        </button>
      </div>
    </div>
  );
}

// ─── Chat Area ────────────────────────────────────────────────────────────────

function ChatArea({
  activeChannel, currentUserId, isMobile, onBack,
}: {
  activeChannel: Channel;
  currentUserId: string;
  isMobile: boolean;
  onBack: () => void;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const endRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();

  const isDM = activeChannel.type === "dm" && activeChannel.conversationId;

  // Load messages
  const loadMessages = useCallback(async () => {
    if (isDM && activeChannel.conversationId) {
      // Use team_messages for DMs
      const { data } = await supabase
        .from("team_messages")
        .select("*, sender:profiles!team_messages_sender_id_fkey(full_name, email)")
        .eq("conversation_id", activeChannel.conversationId)
        .order("created_at", { ascending: true })
        .limit(80);

      setMessages(((data || []) as any[]).map((m: any) => ({
        ...m,
        user_id: m.sender_id,
        content: m.message_text,
        type: "text",
        metadata: {},
        is_pinned: false,
        reply_count: 0,
        reactions: [],
        updated_at: null,
        sender_name: m.sender?.full_name || null,
        sender_email: m.sender?.email || null,
        sender_avatar: null,
        edited: false,
      })));
    } else {
      // Use deal_channel_messages
      const { data } = await (supabase as any).rpc("get_channel_messages_v2", {
        p_channel_id: activeChannel.id,
        p_limit: 80,
      });
      setMessages((data as Msg[]) ?? []);
    }
    setLoading(false);
  }, [activeChannel.id, activeChannel.conversationId, isDM]);

  useEffect(() => {
    setLoading(true);
    setMessages([]);
    loadMessages();
  }, [activeChannel.id]);

  // Realtime
  useEffect(() => {
    if (isDM && activeChannel.conversationId) {
      const ch = supabase
        .channel(`tm-rt-${activeChannel.conversationId}`)
        .on("postgres_changes", {
          event: "INSERT", schema: "public", table: "team_messages",
          filter: `conversation_id=eq.${activeChannel.conversationId}`,
        }, () => loadMessages())
        .subscribe();
      return () => { supabase.removeChannel(ch); };
    } else {
      const ch = supabase
        .channel(`dcm-rt-${activeChannel.id}`)
        .on("postgres_changes", {
          event: "INSERT", schema: "public", table: "deal_channel_messages",
          filter: `channel_id=eq.${activeChannel.id}`,
        }, () => loadMessages())
        .subscribe();
      return () => { supabase.removeChannel(ch); };
    }
  }, [activeChannel.id, activeChannel.conversationId, isDM, loadMessages]);

  // Auto-scroll
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const sendMessage = async () => {
    const t = text.trim();
    if (!t || !user || sending) return;
    setSending(true);
    setText("");
    try {
      if (isDM && activeChannel.conversationId) {
        const { error } = await supabase.from("team_messages").insert({
          conversation_id: activeChannel.conversationId,
          sender_id: user.id,
          message_text: t,
        } as any);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("deal_channel_messages").insert({
          channel_id: activeChannel.id,
          user_id: user.id,
          content: t,
          type: "text",
        });
        if (error) throw error;
      }
    } catch (e: any) {
      toast.error("Failed to send");
      setText(t);
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* Header */}
      <div style={{
        padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,.06)",
        display: "flex", alignItems: "center", gap: 10, flexShrink: 0,
        background: "rgba(255,255,255,.02)",
      }}>
        {isMobile && (
          <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: "#0ef5d4", flexShrink: 0, padding: 4 }}>
            <ChevronLeft size={20} />
          </button>
        )}
        <div style={{
          width: 34, height: 34, borderRadius: 10, flexShrink: 0,
          background: activeChannel.type === "dm" ? "rgba(167,139,250,.1)" : "rgba(14,245,212,.08)",
          border: `1px solid ${activeChannel.type === "dm" ? "rgba(167,139,250,.2)" : "rgba(14,245,212,.15)"}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 14, color: activeChannel.type === "dm" ? "#a78bfa" : "#0ef5d4",
        }}>
          {activeChannel.type === "deal" ? "◈" : activeChannel.type === "dm" ? "●" : "#"}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            fontSize: 14, fontWeight: 700, color: "#f0f6fc",
            margin: 0, fontFamily: "'Geist',system-ui,sans-serif",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {activeChannel.name}
          </p>
          {activeChannel.deal_stage && (
            <p style={{ fontSize: 11, color: "rgba(255,255,255,.3)", margin: 0 }}>
              {getStage(activeChannel.deal_stage).label}
              {activeChannel.deal_value ? ` · $${Number(activeChannel.deal_value).toLocaleString()}` : ""}
            </p>
          )}
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px 4px", minHeight: 0 }}>
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
            <div style={{ width: 22, height: 22, borderRadius: "50%", border: "2px solid rgba(14,245,212,.3)", borderTopColor: "#0ef5d4", animation: "spin .8s linear infinite" }} />
          </div>
        ) : messages.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 20px" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>
              {activeChannel.type === "dm" ? "👋" : "#"}
            </div>
            <p style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,.4)", margin: "0 0 6px", fontFamily: "'Geist',system-ui,sans-serif" }}>
              {activeChannel.type === "dm" ? `Start a conversation with ${activeChannel.name}` : `#${activeChannel.name}`}
            </p>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,.22)", margin: 0 }}>
              {activeChannel.type === "dm" ? "Send a message to get started." : "This is the beginning of this channel."}
            </p>
          </div>
        ) : (
          <>
            {messages.map((msg, i) => {
              const prev = i > 0 ? messages[i - 1] : null;
              const showDate = !prev ||
                new Date(msg.created_at).toDateString() !== new Date(prev.created_at).toDateString();
              const uid = msgUserId(msg);
              return (
                <div key={msg.id}>
                  {showDate && (
                    <div style={{ display: "flex", alignItems: "center", margin: "14px 0 10px", gap: 10 }}>
                      <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,.06)" }} />
                      <span style={{ fontSize: 11, color: "rgba(255,255,255,.28)", whiteSpace: "nowrap" }}>
                        {isToday(new Date(msg.created_at)) ? "Today" : isYesterday(new Date(msg.created_at)) ? "Yesterday" : format(new Date(msg.created_at), "MMMM d")}
                      </span>
                      <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,.06)" }} />
                    </div>
                  )}
                  <div style={{ marginBottom: 6 }}>
                    <MessageBubble msg={msg} isOwn={uid === currentUserId} isMobile={isMobile} />
                  </div>
                </div>
              );
            })}
            <div ref={endRef} style={{ height: 4 }} />
          </>
        )}
      </div>

      {/* Input */}
      <div style={{ padding: "10px 14px 12px", borderTop: "1px solid rgba(255,255,255,.06)", flexShrink: 0 }}>
        <div style={{
          display: "flex", alignItems: "flex-end", gap: 8,
          background: "rgba(255,255,255,.05)",
          border: `1px solid ${text ? "rgba(14,245,212,.25)" : "rgba(255,255,255,.09)"}`,
          borderRadius: 13, padding: "8px 10px 8px 14px", transition: "border-color .15s",
        }}>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            placeholder={`Message ${activeChannel.type === "dm" ? activeChannel.name : "#" + activeChannel.name}…`}
            rows={1}
            style={{
              flex: 1, background: "transparent", border: "none", outline: "none",
              resize: "none", fontSize: 14, color: "#f0f6fc",
              fontFamily: "'Geist',system-ui,sans-serif", lineHeight: 1.5, maxHeight: 100, overflowY: "auto",
            }}
          />
          <button
            onClick={sendMessage}
            disabled={!text.trim() || sending}
            style={{
              width: 34, height: 34, borderRadius: 9, border: "none", flexShrink: 0,
              background: text.trim() ? "linear-gradient(135deg,#0ef5d4,#0891b2)" : "rgba(255,255,255,.07)",
              color: text.trim() ? "#060912" : "rgba(255,255,255,.25)",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: text.trim() ? "pointer" : "not-allowed", transition: "all .15s",
            }}
          >
            <Send size={14} />
          </button>
        </div>
        {!isMobile && (
          <p style={{ fontSize: 10.5, color: "rgba(255,255,255,.2)", margin: "5px 0 0 2px", fontFamily: "'Geist',system-ui,sans-serif" }}>
            Enter to send · Shift+Enter for new line
          </p>
        )}
      </div>
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export default function MessagesPage() {
  const { user } = useAuth();
  const { team, members } = useTeam();
  const teamId = team?.id;

  // Team conversations (DMs) via existing hook
  const { conversations } = useTeamMessaging(teamId);

  const [dealChannels, setDealChannels] = useState<Channel[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [showNewChannel, setShowNewChannel] = useState(false);
  const [showNewDM, setShowNewDM] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [showSearch, setShowSearch] = useState(false);

  // Responsive
  const [isMobile, setIsMobile] = useState(false);
  const [mobileView, setMobileView] = useState<"list" | "chat">("list");

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Load deal channels
  const loadDealChannels = useCallback(async () => {
    if (!teamId) return;
    setLoadingChannels(true);
    try {
      const { data, error } = await (supabase as any).rpc("get_deal_channels_v2", { p_team_id: teamId });
      if (error) throw error;
      setDealChannels((data as Channel[]) ?? []);
    } catch {
      // Fallback: try get_deal_channels
      try {
        const { data } = await (supabase as any).rpc("get_deal_channels", { p_team_id: teamId });
        setDealChannels((data as Channel[]) ?? []);
      } catch {
        setDealChannels([]);
      }
    } finally {
      setLoadingChannels(false);
    }
  }, [teamId]);

  useEffect(() => { loadDealChannels(); }, [teamId]);

  // Build DM channels from conversations
  const dmChannels = useMemo((): Channel[] => {
    return conversations.map(c => {
      const otherParticipant = c.participants[0];
      const name = otherParticipant
        ? (otherParticipant.full_name || otherParticipant.email?.split("@")[0] || "Unknown")
        : (c.participants.length > 0 ? `Group (${c.participants.length + 1})` : "Chat");
      return {
        id: `dm-${c.id}`,
        name,
        type: "dm" as const,
        conversationId: c.id,
        deal_id: null, call_id: null,
        deal_name: null, deal_stage: null, deal_value: null, deal_health: null, deal_next_step: null,
        call_name: null, call_summary: null, call_sentiment: null,
        last_msg: c.last_message?.message_text || null,
        last_msg_at: c.last_message?.created_at || null,
        unread_count: c.unread_count,
        msg_count: 0,
        is_muted: false,
      };
    });
  }, [conversations]);

  // All channels
  const allChannels = useMemo(() => {
    const all = [...dealChannels, ...dmChannels];
    if (!searchQ) return all;
    return all.filter(c => c.name.toLowerCase().includes(searchQ.toLowerCase()));
  }, [dealChannels, dmChannels, searchQ]);

  const teamChannelsList = allChannels.filter(c => c.type === "team");
  const dealChannelsList = allChannels.filter(c => c.type === "deal");
  const dmChannelsList = allChannels.filter(c => c.type === "dm");

  const totalUnread = allChannels.reduce((s, c) => s + c.unread_count, 0);

  // Load notifications
  const loadNotifications = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30);
    setNotifications((data ?? []) as NotificationItem[]);
  }, [user]);

  useEffect(() => { loadNotifications(); }, [user]);

  // Realtime notifications
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`notif-msg-${user.id}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "notifications",
        filter: `user_id=eq.${user.id}`,
      }, loadNotifications)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, loadNotifications]);

  const markAllRead = async () => {
    if (!user) return;
    await supabase.from("notifications").update({ is_read: true } as any)
      .eq("user_id", user.id).eq("is_read", false);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  };

  const markOneRead = async (id: string) => {
    await supabase.from("notifications").update({ is_read: true } as any).eq("id", id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  };

  const handleSelectChannel = (ch: Channel) => {
    setActiveChannel(ch);
    if (isMobile) setMobileView("chat");
  };

  if (!teamId) {
    return (
      <DashboardLayout>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh", fontFamily: "'Geist',system-ui,sans-serif" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>💬</div>
            <p style={{ fontSize: 16, fontWeight: 700, color: "rgba(255,255,255,.6)", marginBottom: 8 }}>Team Required</p>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,.35)" }}>Create or join a team to access messaging.</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const SidebarContent = () => (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div style={{
        padding: "12px 14px 10px",
        borderBottom: "1px solid rgba(255,255,255,.06)",
        background: "rgba(255,255,255,.01)",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 30, height: 30, borderRadius: 8,
              background: "linear-gradient(135deg,#0ef5d4,#0891b2)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 14, color: "#060912", fontWeight: 900,
            }}>F</div>
            <div>
              <p style={{ fontSize: 13, fontWeight: 800, color: "#f0f6fc", margin: 0, fontFamily: "'Geist',system-ui,sans-serif" }}>
                {team?.name || "Fixsense"}
              </p>
              <p style={{ fontSize: 10, color: "rgba(255,255,255,.3)", margin: 0 }}>
                {members.length} member{members.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <NotificationBell
              notifications={notifications}
              onMarkAll={markAllRead}
              onMarkOne={markOneRead}
              isMobile={isMobile}
            />
            <button
              onClick={() => setShowSearch(v => !v)}
              style={{
                width: 34, height: 34, borderRadius: 9,
                background: showSearch ? "rgba(14,245,212,.12)" : "rgba(255,255,255,.07)",
                border: `1px solid ${showSearch ? "rgba(14,245,212,.3)" : "rgba(255,255,255,.1)"}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", color: showSearch ? "#0ef5d4" : "rgba(255,255,255,.5)",
              }}
            >
              <Search size={13} />
            </button>
          </div>
        </div>

        {showSearch && (
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.1)",
            borderRadius: 9, padding: "7px 11px",
          }}>
            <Search size={12} color="rgba(255,255,255,.3)" />
            <input
              autoFocus value={searchQ} onChange={e => setSearchQ(e.target.value)}
              placeholder="Search channels…"
              style={{ flex: 1, background: "transparent", border: "none", outline: "none", fontSize: 13, color: "#f0f6fc", fontFamily: "'Geist',system-ui,sans-serif" }}
            />
            {searchQ && <button onClick={() => setSearchQ("")} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,.3)", fontSize: 14 }}>×</button>}
          </div>
        )}
      </div>

      {/* Channels */}
      <div style={{ flex: 1, overflowY: "auto", paddingTop: 4 }}>
        {loadingChannels ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 32 }}>
            <div style={{ width: 18, height: 18, borderRadius: "50%", border: "2px solid rgba(14,245,212,.3)", borderTopColor: "#0ef5d4", animation: "spin .8s linear infinite" }} />
          </div>
        ) : (
          <>
            {/* DMs */}
            <div style={{ padding: "10px 12px 4px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 9.5, fontWeight: 800, color: "rgba(255,255,255,.25)", textTransform: "uppercase", letterSpacing: ".1em" }}>
                ● Direct Messages
              </span>
              <button
                onClick={() => setShowNewDM(true)}
                title="New DM"
                style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,.35)", fontSize: 16, lineHeight: 1, padding: "0 2px" }}
              >
                +
              </button>
            </div>
            {dmChannelsList.map(ch => (
              <ChannelItem key={ch.id} ch={ch} isActive={activeChannel?.id === ch.id} onClick={() => handleSelectChannel(ch)} />
            ))}
            {dmChannelsList.length === 0 && (
              <button
                onClick={() => setShowNewDM(true)}
                style={{
                  display: "flex", alignItems: "center", gap: 8, width: "100%",
                  padding: "8px 14px", border: "none", background: "transparent", cursor: "pointer",
                  color: "rgba(255,255,255,.25)", fontSize: 12, fontFamily: "'Geist',system-ui,sans-serif",
                }}
              >
                <Plus size={13} /> Message a teammate
              </button>
            )}

            {/* Team Channels */}
            {teamChannelsList.length > 0 && (
              <>
                <div style={{ padding: "12px 12px 4px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 9.5, fontWeight: 800, color: "rgba(255,255,255,.25)", textTransform: "uppercase", letterSpacing: ".1em" }}>
                    # Channels
                  </span>
                  <button
                    onClick={() => setShowNewChannel(true)}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,.35)", fontSize: 16, lineHeight: 1, padding: "0 2px" }}
                  >
                    +
                  </button>
                </div>
                {teamChannelsList.map(ch => (
                  <ChannelItem key={ch.id} ch={ch} isActive={activeChannel?.id === ch.id} onClick={() => handleSelectChannel(ch)} />
                ))}
              </>
            )}

            {/* Deal Channels */}
            {dealChannelsList.length > 0 && (
              <>
                <div style={{ padding: "12px 12px 4px" }}>
                  <span style={{ fontSize: 9.5, fontWeight: 800, color: "rgba(255,255,255,.25)", textTransform: "uppercase", letterSpacing: ".1em" }}>
                    ◈ Deals
                  </span>
                </div>
                {dealChannelsList.map(ch => (
                  <ChannelItem key={ch.id} ch={ch} isActive={activeChannel?.id === ch.id} onClick={() => handleSelectChannel(ch)} />
                ))}
              </>
            )}

            {allChannels.length === 0 && !loadingChannels && !searchQ && (
              <div style={{ padding: "30px 16px", textAlign: "center" }}>
                <p style={{ fontSize: 13, color: "rgba(255,255,255,.3)", margin: "0 0 12px", fontFamily: "'Geist',system-ui,sans-serif" }}>
                  No channels yet
                </p>
                <button
                  onClick={() => setShowNewChannel(true)}
                  style={{
                    padding: "8px 18px", borderRadius: 9,
                    background: "rgba(14,245,212,.1)", border: "1px solid rgba(14,245,212,.2)",
                    color: "#0ef5d4", fontSize: 12, fontWeight: 600, cursor: "pointer",
                    fontFamily: "'Geist',system-ui,sans-serif",
                  }}
                >
                  + Create Channel
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Bottom new channel button (mobile) */}
      {isMobile && (
        <div style={{ padding: "10px 14px", borderTop: "1px solid rgba(255,255,255,.06)", display: "flex", gap: 8 }}>
          <button
            onClick={() => setShowNewDM(true)}
            style={{
              flex: 1, padding: "10px 0", borderRadius: 10,
              background: "rgba(167,139,250,.1)", border: "1px solid rgba(167,139,250,.2)",
              color: "#a78bfa", fontSize: 13, fontWeight: 600, cursor: "pointer",
              fontFamily: "'Geist',system-ui,sans-serif", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}
          >
            <MessageSquare size={14} /> New DM
          </button>
          <button
            onClick={() => setShowNewChannel(true)}
            style={{
              flex: 1, padding: "10px 0", borderRadius: 10,
              background: "rgba(14,245,212,.1)", border: "1px solid rgba(14,245,212,.2)",
              color: "#0ef5d4", fontSize: 13, fontWeight: 600, cursor: "pointer",
              fontFamily: "'Geist',system-ui,sans-serif", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}
          >
            <Hash size={14} /> New Channel
          </button>
        </div>
      )}
    </div>
  );

  return (
    <DashboardLayout>
      <style>{GLOBAL_CSS}</style>

      {/* Modals */}
      {showNewChannel && (
        <NewChannelModal
          teamId={teamId}
          onClose={() => setShowNewChannel(false)}
          onCreated={() => { setShowNewChannel(false); loadDealChannels(); }}
        />
      )}
      {showNewDM && user && (
        <NewDMModal
          members={members}
          currentUserId={user.id}
          conversations={conversations}
          teamId={teamId}
          onClose={() => setShowNewDM(false)}
          onCreated={(convoId, name) => {
            setShowNewDM(false);
            const ch: Channel = {
              id: `dm-${convoId}`, name, type: "dm", conversationId: convoId,
              deal_id: null, call_id: null, deal_name: null, deal_stage: null,
              deal_value: null, deal_health: null, deal_next_step: null,
              call_name: null, call_summary: null, call_sentiment: null,
              last_msg: null, last_msg_at: null, unread_count: 0, msg_count: 0, is_muted: false,
            };
            handleSelectChannel(ch);
          }}
        />
      )}

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

        {/* ── Sidebar ── */}
        {(!isMobile || mobileView === "list") && (
          <div style={{
            width: isMobile ? "100%" : 260,
            flexShrink: 0,
            borderRight: "1px solid rgba(255,255,255,.06)",
            background: "#0c0f1e",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}>
            <SidebarContent />
          </div>
        )}

        {/* ── Chat ── */}
        {(!isMobile || mobileView === "chat") && (
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
            {activeChannel ? (
              <ChatArea
                activeChannel={activeChannel}
                currentUserId={user?.id ?? ""}
                isMobile={isMobile}
                onBack={() => setMobileView("list")}
              />
            ) : (
              <div style={{
                flex: 1, display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", padding: 32, textAlign: "center",
              }}>
                {isMobile && (
                  <button onClick={() => setMobileView("list")} style={{ position: "absolute", top: 16, left: 16, background: "none", border: "none", cursor: "pointer", color: "#0ef5d4" }}>
                    <ChevronLeft size={22} />
                  </button>
                )}
                <div style={{
                  width: 72, height: 72, borderRadius: 20,
                  background: "rgba(14,245,212,.07)", border: "1px solid rgba(14,245,212,.12)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 30, marginBottom: 16,
                }}>💬</div>
                <p style={{ fontSize: 16, fontWeight: 700, color: "rgba(255,255,255,.4)", margin: "0 0 8px", fontFamily: "'Geist',system-ui,sans-serif" }}>
                  Select a conversation
                </p>
                <p style={{ fontSize: 13, color: "rgba(255,255,255,.22)", maxWidth: 280, lineHeight: 1.6, margin: 0 }}>
                  Message teammates directly or collaborate in team and deal channels.
                </p>
                <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                  <button
                    onClick={() => setShowNewDM(true)}
                    style={{
                      padding: "10px 18px", borderRadius: 10,
                      background: "rgba(167,139,250,.1)", border: "1px solid rgba(167,139,250,.25)",
                      color: "#a78bfa", fontSize: 13, fontWeight: 600, cursor: "pointer",
                      fontFamily: "'Geist',system-ui,sans-serif", display: "flex", alignItems: "center", gap: 6,
                    }}
                  >
                    <Users size={14} /> New DM
                  </button>
                  <button
                    onClick={() => setShowNewChannel(true)}
                    style={{
                      padding: "10px 18px", borderRadius: 10,
                      background: "rgba(14,245,212,.1)", border: "1px solid rgba(14,245,212,.25)",
                      color: "#0ef5d4", fontSize: 13, fontWeight: 600, cursor: "pointer",
                      fontFamily: "'Geist',system-ui,sans-serif", display: "flex", alignItems: "center", gap: 6,
                    }}
                  >
                    <Hash size={14} /> New Channel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}