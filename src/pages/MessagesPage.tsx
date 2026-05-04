/**
 * MessagesPage.tsx — v4
 *
 * New in this version:
 *  - Sender name always shown above every message bubble (both sides)
 *  - Reply-to: tap/click any message → "Replying to X" bar appears,
 *    the reply is stored with parent_id, and the quoted preview renders inline
 *  - Sent / Seen ticks:
 *      ✓  (grey)  = message delivered (stored in DB)
 *      ✓✓ (teal)  = at least one other participant has read it
 *    Read receipts are written automatically when the RPC runs (see migration)
 *  - Online presence indicator (green dot beside avatar)
 *  - Typing indicator
 *  - Emoji reactions, edit, delete, copy (from v3)
 */

import {
  useState, useEffect, useRef, useCallback, useMemo,
} from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useTeam } from "@/hooks/useTeam";
import { useTeamMessaging, getConversationName } from "@/hooks/useTeamMessaging";
import { supabase } from "@/integrations/supabase/client";
import { format, isToday, isYesterday } from "date-fns";
import { toast } from "sonner";
import {
  Send, Plus, Bell, ChevronLeft, Hash, Users, MessageSquare,
  Search, CheckCheck, Check, Smile, Edit2, Trash2, Copy,
  MoreHorizontal, X, CornerUpLeft,
} from "lucide-react";

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
  conversationId?: string;
}

interface Reaction { emoji: string; count: number; by_me: boolean; }

interface Msg {
  id: string;
  conversation_id?: string;
  channel_id?: string;
  sender_id?: string;
  user_id?: string;
  message_text?: string;
  content?: string;
  created_at: string;
  file_url?: string | null;
  file_name?: string | null;
  file_type?: string | null;
  parent_id?: string | null;
  edited_at?: string | null;
  is_deleted?: boolean;
  // enriched
  sender_full_name?: string | null;
  sender_email?: string | null;
  sender_avatar_url?: string | null;
  // reply preview
  reply_to_text?: string | null;
  reply_to_sender_name?: string | null;
  // read receipts
  read_by?: string[];
  // reactions
  reactions: Reaction[];
  // deal channel compat
  type?: string;
  metadata?: Record<string, any>;
  is_pinned?: boolean;
}

interface NotificationItem {
  id: string; type: string; message: string;
  is_read: boolean; created_at: string; reference_id: string | null;
}

interface OnlineUser { userId: string; lastSeen: Date; }

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STAGE_CFG: Record<string, { color: string; label: string }> = {
  discovery:   { color: "#60a5fa", label: "Discovery" },
  demo:        { color: "#a78bfa", label: "Demo" },
  negotiation: { color: "#fbbf24", label: "Negotiation" },
  proposal:    { color: "#34d399", label: "Proposal" },
  won:         { color: "#22c55e", label: "Won" },
  lost:        { color: "#ef4444", label: "Lost" },
};
const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🔥", "✅", "👏"];

function getStage(s?: string | null) {
  return STAGE_CFG[s?.toLowerCase() ?? ""] ?? { color: "#94a3b8", label: "New" };
}
function fmtTime(d: string) {
  const dt = new Date(d);
  if (isToday(dt)) return format(dt, "h:mm a");
  if (isYesterday(dt)) return "Yesterday";
  return format(dt, "MMM d");
}
function initials(name: string | null | undefined) {
  if (!name) return "?";
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}
function msgText(m: Msg) {
  let raw = m.message_text || m.content || "";
  // Strip duplicated sender prefix patterns like "Name sent a message: 'actual text'"
  const prefixPattern = /^.+?\s+sent a message:\s*['"]?/i;
  if (prefixPattern.test(raw)) {
    raw = raw.replace(prefixPattern, "").replace(/['"]?\s*$/, "");
  }
  return raw;
}
function msgSenderId(m: Msg) { return m.sender_id || m.user_id || null; }
function msgSenderName(m: Msg) {
  return m.sender_full_name || m.sender_email?.split("@")[0] || "Unknown";
}

// ─── Global CSS ───────────────────────────────────────────────────────────────

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700;800&display=swap');
@keyframes msg-in  { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
@keyframes fade-in { from{opacity:0;transform:scale(.96)} to{opacity:1;transform:scale(1)} }
@keyframes slide-up{ from{transform:translateY(100%);opacity:0} to{transform:translateY(0);opacity:1} }
@keyframes spin    { to{transform:rotate(360deg)} }
@keyframes pdot    { 0%,100%{opacity:1} 50%{opacity:.3} }
*{box-sizing:border-box}
::-webkit-scrollbar{width:3px}
::-webkit-scrollbar-thumb{background:rgba(255,255,255,.1);border-radius:3px}
textarea:focus,input:focus{outline:none!important}
.msg-in  { animation:msg-in  .18s ease }
.fade-in { animation:fade-in .12s ease }
.slide-up{ animation:slide-up .25s ease }
.pdot{display:inline-block;width:5px;height:5px;border-radius:50%;
  background:rgba(255,255,255,.5);animation:pdot 1.2s ease infinite}
.pdot:nth-child(2){animation-delay:.2s}
.pdot:nth-child(3){animation-delay:.4s}
`;

// ─── Avatar ───────────────────────────────────────────────────────────────────

function MsgAvatar({ name, size = 32, color = "#0ef5d4", isOnline = false, avatarUrl }: {
  name?: string | null; size?: number; color?: string; isOnline?: boolean; avatarUrl?: string | null;
}) {
  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={name || "User"}
          style={{
            width: size, height: size, borderRadius: size * 0.3,
            objectFit: "cover", border: `1px solid ${color}30`,
          }}
        />
      ) : (
        <div style={{
          width: size, height: size, borderRadius: size * 0.3,
          background: `${color}18`, border: `1px solid ${color}30`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: size * 0.38, fontWeight: 700, color,
          fontFamily: "'Geist',system-ui,sans-serif",
        }}>
          {initials(name)}
        </div>
      )}
      {isOnline && (
        <div style={{
          position: "absolute", bottom: -1, right: -1,
          width: size * 0.32, height: size * 0.32,
          borderRadius: "50%", background: "#22c55e",
          border: "2px solid #08090f",
        }} />
      )}
    </div>
  );
}

// ─── Notification Bell ────────────────────────────────────────────────────────

function NotificationBell({ notifications, onMarkAll, onMarkOne, isMobile }: {
  notifications: NotificationItem[]; onMarkAll: () => void;
  onMarkOne: (id: string) => void; isMobile: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const unread = notifications.filter(n => !n.is_read).length;

  useEffect(() => {
    if (!open || isMobile) return;
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open, isMobile]);

  const List = () => (
    <div style={{ overflowY: "auto", flex: 1 }}>
      {notifications.length === 0 ? (
        <div style={{ padding: "40px 20px", textAlign: "center", color: "rgba(255,255,255,.3)", fontFamily: "'Geist',system-ui,sans-serif", fontSize: 13 }}>
          🔔 All caught up!
        </div>
      ) : notifications.map(n => (
        <div key={n.id} onClick={() => !n.is_read && onMarkOne(n.id)} style={{
          display: "flex", gap: 12, padding: "12px 16px",
          borderBottom: "1px solid rgba(255,255,255,.04)",
          background: n.is_read ? "transparent" : "rgba(14,245,212,.04)",
          cursor: n.is_read ? "default" : "pointer",
        }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: "rgba(255,255,255,.06)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>
            {{ comment: "💬", coaching: "📈", mention: "@", system: "⚙️" }[n.type] ?? "🔔"}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 13, margin: "0 0 3px", color: n.is_read ? "rgba(255,255,255,.5)" : "rgba(255,255,255,.88)", fontWeight: n.is_read ? 400 : 600, fontFamily: "'Geist',system-ui,sans-serif", overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
              {n.message}
            </p>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,.28)" }}>{fmtTime(n.created_at)}</span>
          </div>
          {!n.is_read && <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#0ef5d4", flexShrink: 0, marginTop: 4 }} />}
        </div>
      ))}
    </div>
  );

  const Header = () => (
    <div style={{ padding: "14px 16px", borderBottom: "1px solid rgba(255,255,255,.08)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: "#f0f6fc", fontFamily: "'Geist',system-ui,sans-serif" }}>Notifications</span>
        {unread > 0 && <span style={{ fontSize: 10, fontWeight: 800, background: "#ef4444", color: "#fff", borderRadius: 10, padding: "1px 6px" }}>{unread}</span>}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {unread > 0 && (
          <button onClick={onMarkAll} style={{ background: "rgba(14,245,212,.1)", border: "1px solid rgba(14,245,212,.2)", borderRadius: 7, padding: "4px 10px", cursor: "pointer", fontSize: 11, color: "#0ef5d4", fontFamily: "'Geist',system-ui,sans-serif", display: "flex", alignItems: "center", gap: 4 }}>
            <CheckCheck size={11} /> All read
          </button>
        )}
        {isMobile && <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,.4)", fontSize: 18 }}>×</button>}
      </div>
    </div>
  );

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen(v => !v)} style={{ position: "relative", background: open ? "rgba(14,245,212,.12)" : "rgba(255,255,255,.07)", border: `1px solid ${open ? "rgba(14,245,212,.3)" : "rgba(255,255,255,.1)"}`, borderRadius: 9, width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: open ? "#0ef5d4" : "rgba(255,255,255,.6)" }}>
        <Bell size={15} />
        {unread > 0 && <div style={{ position: "absolute", top: -4, right: -4, minWidth: 17, height: 17, borderRadius: 9, background: "#ef4444", border: "2px solid #08090f", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 800, color: "#fff", padding: "0 3px" }}>{unread > 99 ? "99+" : unread}</div>}
      </button>
      {open && !isMobile && (
        <div style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, width: 340, maxHeight: 480, background: "#111827", border: "1px solid rgba(255,255,255,.1)", borderRadius: 14, overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,.7)", zIndex: 200, display: "flex", flexDirection: "column" }}>
          <Header /><List />
        </div>
      )}
      {open && isMobile && (
        <div style={{ position: "fixed", inset: 0, zIndex: 300 }}>
          <div onClick={() => setOpen(false)} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.65)", backdropFilter: "blur(4px)" }} />
          <div className="slide-up" style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "#111827", borderRadius: "18px 18px 0 0", border: "1px solid rgba(255,255,255,.1)", borderBottom: "none", maxHeight: "75vh", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 0" }}><div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,.2)" }} /></div>
            <Header /><List />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Channel List Item ────────────────────────────────────────────────────────

function ChannelItem({ ch, isActive, onClick }: { ch: Channel; isActive: boolean; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  const icon = ch.type === "deal" ? "◈" : ch.type === "dm" ? "●" : "#";
  const iconColor = ch.type === "deal" ? getStage(ch.deal_stage).color : ch.type === "dm" ? "#a78bfa" : "#60a5fa";
  return (
    <button onClick={onClick} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 12px", border: "none", textAlign: "left", background: isActive ? "rgba(14,245,212,.09)" : hovered ? "rgba(255,255,255,.04)" : "transparent", borderLeft: `2px solid ${isActive ? "#0ef5d4" : "transparent"}`, cursor: "pointer", transition: "all .1s" }}>
      <span style={{ fontSize: 12, color: iconColor, flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 4 }}>
          <span style={{ fontSize: 13, fontWeight: ch.unread_count > 0 ? 700 : 500, color: isActive ? "#f0f6fc" : "rgba(255,255,255,.65)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "'Geist',system-ui,sans-serif" }}>{ch.name}</span>
          {ch.last_msg_at && <span style={{ fontSize: 10, color: "rgba(255,255,255,.25)", flexShrink: 0 }}>{fmtTime(ch.last_msg_at)}</span>}
        </div>
        {ch.last_msg && <span style={{ fontSize: 11.5, color: "rgba(255,255,255,.3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>{ch.last_msg.length > 40 ? ch.last_msg.slice(0, 40) + "…" : ch.last_msg}</span>}
      </div>
      {ch.unread_count > 0 && <span style={{ fontSize: 10, fontWeight: 800, color: "#060912", background: "#0ef5d4", borderRadius: 10, padding: "1.5px 6px", flexShrink: 0 }}>{ch.unread_count > 99 ? "99+" : ch.unread_count}</span>}
    </button>
  );
}

// ─── Emoji Picker ─────────────────────────────────────────────────────────────

function EmojiPicker({ onSelect, onClose, isOwn }: { onSelect: (e: string) => void; onClose: () => void; isOwn: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    setTimeout(() => document.addEventListener("mousedown", h), 50);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose]);
  return (
    <div ref={ref} className="fade-in" style={{ position: "absolute", bottom: "calc(100% + 4px)", [isOwn ? "right" : "left"]: 0, background: "#1a1f2e", border: "1px solid rgba(255,255,255,.12)", borderRadius: 12, padding: 8, zIndex: 100, display: "flex", gap: 3, flexWrap: "wrap", width: 196, boxShadow: "0 8px 32px rgba(0,0,0,.6)" }}>
      {QUICK_EMOJIS.map(e => (
        <button key={e} onClick={() => { onSelect(e); onClose(); }} style={{ width: 34, height: 34, borderRadius: 8, border: "none", background: "rgba(255,255,255,.06)", cursor: "pointer", fontSize: 17 }}
          onMouseEnter={ev => (ev.currentTarget.style.background = "rgba(255,255,255,.15)")}
          onMouseLeave={ev => (ev.currentTarget.style.background = "rgba(255,255,255,.06)")}>
          {e}
        </button>
      ))}
    </div>
  );
}

// ─── Context Menu ─────────────────────────────────────────────────────────────

function CtxMenu({ isOwn, x, y, isMobile, onReact, onReply, onEdit, onDelete, onCopy, onClose }: {
  isOwn: boolean; x: number; y: number; isMobile: boolean;
  onReact: (e: string) => void; onReply: () => void; onEdit: () => void;
  onDelete: () => void; onCopy: () => void; onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    setTimeout(() => document.addEventListener("mousedown", h), 50);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose]);

  const menuSt: React.CSSProperties = isMobile
    ? { position: "fixed", bottom: 0, left: 0, right: 0, background: "#1a1f2e", borderRadius: "16px 16px 0 0", border: "1px solid rgba(255,255,255,.1)", borderBottom: "none", padding: "8px 0 24px", zIndex: 500 }
    : { position: "fixed", left: Math.min(x, window.innerWidth - 200), top: Math.min(y, window.innerHeight - 260), background: "#1a1f2e", border: "1px solid rgba(255,255,255,.12)", borderRadius: 12, padding: "6px 0", zIndex: 500, minWidth: 190, boxShadow: "0 8px 32px rgba(0,0,0,.7)" };

  const Row = ({ icon, label, color, cb }: { icon: React.ReactNode; label: string; color?: string; cb: () => void }) => (
    <button onClick={() => { cb(); onClose(); }} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "11px 16px", border: "none", background: "transparent", cursor: "pointer", textAlign: "left", fontSize: 14, color: color || "rgba(255,255,255,.82)", fontFamily: "'Geist',system-ui,sans-serif" }}
      onMouseEnter={ev => (ev.currentTarget.style.background = "rgba(255,255,255,.06)")}
      onMouseLeave={ev => (ev.currentTarget.style.background = "transparent")}>
      {icon}{label}
    </button>
  );

  return (
    <>
      {isMobile && <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 499 }} />}
      <div ref={ref} className="fade-in" style={menuSt}>
        {isMobile && <div style={{ display: "flex", justifyContent: "center", padding: "8px 0 12px" }}><div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,.2)" }} /></div>}
        {/* Quick emoji strip */}
        <div style={{ display: "flex", gap: 3, padding: "6px 12px 10px", borderBottom: "1px solid rgba(255,255,255,.06)" }}>
          {QUICK_EMOJIS.slice(0, 6).map(e => (
            <button key={e} onClick={() => { onReact(e); onClose(); }} style={{ flex: 1, padding: "6px 2px", border: "none", borderRadius: 8, background: "rgba(255,255,255,.06)", cursor: "pointer", fontSize: 17 }}
              onMouseEnter={ev => (ev.currentTarget.style.background = "rgba(255,255,255,.15)")}
              onMouseLeave={ev => (ev.currentTarget.style.background = "rgba(255,255,255,.06)")}>
              {e}
            </button>
          ))}
        </div>
        <Row icon={<CornerUpLeft size={14} />} label="Reply" cb={onReply} />
        <Row icon={<Copy size={14} />} label="Copy text" cb={onCopy} />
        {isOwn && <Row icon={<Edit2 size={14} />} label="Edit message" cb={onEdit} />}
        {isOwn && <Row icon={<Trash2 size={14} />} label="Delete" color="#ef4444" cb={onDelete} />}
      </div>
    </>
  );
}

// ─── Reaction Row ─────────────────────────────────────────────────────────────

function ReactionRow({ reactions, onToggle }: { reactions: Reaction[]; onToggle: (e: string) => void }) {
  if (!reactions?.length) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 4 }}>
      {reactions.map(r => (
        <button key={r.emoji} onClick={() => onToggle(r.emoji)} style={{ display: "flex", alignItems: "center", gap: 3, padding: "2px 7px", borderRadius: 12, background: r.by_me ? "rgba(14,245,212,.18)" : "rgba(255,255,255,.07)", border: `1px solid ${r.by_me ? "rgba(14,245,212,.4)" : "rgba(255,255,255,.12)"}`, cursor: "pointer", fontSize: 12, color: r.by_me ? "#0ef5d4" : "rgba(255,255,255,.7)", fontFamily: "'Geist',system-ui,sans-serif" }}>
          {r.emoji}<span style={{ fontSize: 11, fontWeight: 700 }}>{r.count}</span>
        </button>
      ))}
    </div>
  );
}

// ─── Message Bubble ───────────────────────────────────────────────────────────

function MsgBubble({ msg, isOwn, isMobile, isOnline, totalParticipants, onReact, onReply, onEdit, onDelete, onCopy }: {
  msg: Msg; isOwn: boolean; isMobile: boolean; isOnline: boolean;
  totalParticipants: number;
  onReact: (e: string) => void; onReply: () => void;
  onEdit: () => void; onDelete: () => void; onCopy: () => void;
}) {
  const [showCtx, setShowCtx] = useState(false);
  const [ctxPos, setCtxPos] = useState({ x: 0, y: 0 });
  const [showEmoji, setShowEmoji] = useState(false);
  const [hovered, setHovered] = useState(false);
  const longRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const text = msgText(msg);
  const name = msgSenderName(msg);
  const senderColor = isOwn ? "#0ef5d4" : "#a78bfa";

  // Delivery status: seen = at least one other participant read it
  const seenCount = msg.read_by?.length ?? 0;
  const isSeen = seenCount > 0;

  const openCtx = (x: number, y: number) => { setCtxPos({ x, y }); setShowCtx(true); };

  if (msg.type === "system") {
    return (
      <div style={{ textAlign: "center", padding: "4px 0" }}>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,.3)", background: "rgba(255,255,255,.05)", borderRadius: 20, padding: "3px 12px" }}>{text}</span>
      </div>
    );
  }

  return (
    <div className="msg-in" style={{ display: "flex", flexDirection: isOwn ? "row-reverse" : "row", alignItems: "flex-end", gap: 8, marginBottom: 4 }}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => { setHovered(false); setShowEmoji(false); }}>

      {/* Avatar — always shown */}
      <MsgAvatar name={name} size={28} color={senderColor} isOnline={!isOwn && isOnline} avatarUrl={(msg as any).sender_avatar_url} />

      <div style={{ maxWidth: isMobile ? "84%" : "68%", minWidth: 0 }}>
        {/* Sender name — always above the bubble */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 3, flexDirection: isOwn ? "row-reverse" : "row" }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: senderColor, fontFamily: "'Geist',system-ui,sans-serif" }}>
            {isOwn ? "You" : name}
          </span>
          <span style={{ fontSize: 10, color: "rgba(255,255,255,.25)" }}>{fmtTime(msg.created_at)}</span>
          {!isOwn && isOnline && <span style={{ fontSize: 9, color: "#22c55e", fontWeight: 600 }}>● online</span>}
        </div>

        <div style={{ position: "relative" }}>
          {/* Reply preview */}
          {msg.reply_to_text && (
            <div style={{
              background: isOwn ? "rgba(0,0,0,.2)" : "rgba(255,255,255,.06)",
              borderLeft: `3px solid ${isOwn ? "rgba(255,255,255,.4)" : "#a78bfa"}`,
              borderRadius: "8px 8px 0 0", padding: "5px 10px", marginBottom: -2,
            }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: isOwn ? "rgba(255,255,255,.6)" : "#a78bfa", margin: "0 0 1px", fontFamily: "'Geist',system-ui,sans-serif" }}>
                {msg.reply_to_sender_name || "Unknown"}
              </p>
              <p style={{ fontSize: 11, color: isOwn ? "rgba(255,255,255,.5)" : "rgba(255,255,255,.4)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200 }}>
                {msg.reply_to_text}
              </p>
            </div>
          )}

          {/* Bubble */}
          <div
            onContextMenu={e => { if (!isMobile) { e.preventDefault(); openCtx(e.clientX, e.clientY); } }}
            onTouchStart={() => { if (isMobile) longRef.current = setTimeout(() => openCtx(0, 0), 500); }}
            onTouchEnd={() => { if (longRef.current) clearTimeout(longRef.current); }}
            style={{
              padding: "9px 13px",
              background: isOwn ? "linear-gradient(135deg,rgba(14,245,212,.9),rgba(8,145,178,.9))" : "rgba(255,255,255,.08)",
              border: isOwn ? "none" : "1px solid rgba(255,255,255,.09)",
              borderRadius: msg.reply_to_text
                ? (isOwn ? "0 13px 3px 13px" : "0 13px 13px 3px")
                : (isOwn ? "13px 13px 3px 13px" : "13px 13px 13px 3px"),
              fontSize: 13.5, lineHeight: 1.55,
              color: isOwn ? "#060912" : "rgba(255,255,255,.92)",
              fontFamily: "'Geist',system-ui,sans-serif",
              wordBreak: "break-word", cursor: "default",
            }}
          >
            {msg.file_url
              ? <a href={msg.file_url} target="_blank" rel="noopener noreferrer" style={{ color: isOwn ? "#060912" : "#0ef5d4", textDecoration: "underline" }}>📎 {text}</a>
              : text}
            {msg.edited_at && <span style={{ fontSize: 10, color: isOwn ? "rgba(0,0,0,.4)" : "rgba(255,255,255,.3)", marginLeft: 6 }}>(edited)</span>}
          </div>

          {/* Hover action bar (desktop) */}
          {!isMobile && hovered && (
            <div style={{ position: "absolute", top: -34, [isOwn ? "left" : "right"]: 0, display: "flex", gap: 3, zIndex: 10 }}>
              <div style={{ position: "relative" }}>
                <button onClick={() => setShowEmoji(v => !v)} style={{ width: 28, height: 28, borderRadius: 7, border: "1px solid rgba(255,255,255,.12)", background: "#1a1f2e", cursor: "pointer", color: "rgba(255,255,255,.6)", display: "flex", alignItems: "center", justifyContent: "center" }} title="React"><Smile size={13} /></button>
                {showEmoji && <EmojiPicker onSelect={onReact} onClose={() => setShowEmoji(false)} isOwn={isOwn} />}
              </div>
              <button onClick={onReply} style={{ width: 28, height: 28, borderRadius: 7, border: "1px solid rgba(255,255,255,.12)", background: "#1a1f2e", cursor: "pointer", color: "rgba(255,255,255,.6)", display: "flex", alignItems: "center", justifyContent: "center" }} title="Reply"><CornerUpLeft size={13} /></button>
              <button onClick={onCopy} style={{ width: 28, height: 28, borderRadius: 7, border: "1px solid rgba(255,255,255,.12)", background: "#1a1f2e", cursor: "pointer", color: "rgba(255,255,255,.6)", display: "flex", alignItems: "center", justifyContent: "center" }} title="Copy"><Copy size={12} /></button>
              {isOwn && <button onClick={onEdit} style={{ width: 28, height: 28, borderRadius: 7, border: "1px solid rgba(255,255,255,.12)", background: "#1a1f2e", cursor: "pointer", color: "rgba(255,255,255,.6)", display: "flex", alignItems: "center", justifyContent: "center" }} title="Edit"><Edit2 size={12} /></button>}
              {isOwn && <button onClick={onDelete} style={{ width: 28, height: 28, borderRadius: 7, border: "1px solid rgba(255,255,255,.12)", background: "#1a1f2e", cursor: "pointer", color: "#ef4444", display: "flex", alignItems: "center", justifyContent: "center" }} title="Delete"><Trash2 size={12} /></button>}
              <button onClick={e => openCtx(e.clientX, e.clientY)} style={{ width: 28, height: 28, borderRadius: 7, border: "1px solid rgba(255,255,255,.12)", background: "#1a1f2e", cursor: "pointer", color: "rgba(255,255,255,.6)", display: "flex", alignItems: "center", justifyContent: "center" }} title="More"><MoreHorizontal size={13} /></button>
            </div>
          )}
        </div>

        {/* Reactions */}
        <ReactionRow reactions={msg.reactions || []} onToggle={onReact} />

        {/* Sent / Seen ticks (own messages only, below right) */}
        {isOwn && (
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 3, alignItems: "center", gap: 2 }}>
            {isSeen
              ? <CheckCheck size={13} color="#0ef5d4" />
              : <Check size={13} color="rgba(255,255,255,.35)" />}
            <span style={{ fontSize: 9, color: isSeen ? "#0ef5d4" : "rgba(255,255,255,.3)", fontFamily: "'Geist',system-ui,sans-serif" }}>
              {isSeen ? "Seen" : "Sent"}
            </span>
          </div>
        )}
      </div>

      {/* Context menu */}
      {showCtx && (
        <CtxMenu
          isOwn={isOwn} x={ctxPos.x} y={ctxPos.y} isMobile={isMobile}
          onReact={onReact} onReply={onReply} onEdit={onEdit} onDelete={onDelete} onCopy={onCopy}
          onClose={() => setShowCtx(false)}
        />
      )}
    </div>
  );
}

// ─── New DM Modal ─────────────────────────────────────────────────────────────

function NewDMModal({ members, currentUserId, conversations, teamId, onClose, onCreated, onlineUsers }: {
  members: any[]; currentUserId: string; conversations: any[]; teamId: string;
  onClose: () => void; onCreated: (id: string, name: string) => void;
  onlineUsers: Map<string, OnlineUser>;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const others = members.filter(m => m.user_id !== currentUserId && m.status === "active");

  const start = async () => {
    if (!selected.length) return;
    setLoading(true);
    try {
      if (selected.length === 1) {
        const ex = conversations.find(c => !c.is_group && c.participants?.some((p: any) => p.user_id === selected[0]));
        if (ex) { const n = ex.participants[0]?.full_name || ex.participants[0]?.email || "DM"; onCreated(ex.id, n); return; }
      }
      const id = crypto.randomUUID();
      const { error: ce } = await supabase.from("team_conversations").insert({ id, team_id: teamId });
      if (ce) throw ce;
      await supabase.from("conversation_participants").insert([currentUserId, ...selected].map(uid => ({ conversation_id: id, user_id: uid })));
      const m = members.find(m => m.user_id === selected[0]);
      const name = selected.length === 1 ? (m?.profile?.full_name || m?.profile?.email || "DM") : `Group (${selected.length + 1})`;
      onCreated(id, name);
    } catch (e: any) { toast.error(e.message || "Failed"); } finally { setLoading(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,.7)", backdropFilter: "blur(6px)", display: "flex", alignItems: "flex-end" }}>
      <div style={{ width: "100%", maxWidth: 420, margin: "0 auto", background: "#111827", borderRadius: "16px 16px 0 0", border: "1px solid rgba(255,255,255,.1)", borderBottom: "none", padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}><div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,.2)" }} /></div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#f0f6fc", fontFamily: "'Geist',system-ui,sans-serif" }}>New Message</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,.4)", fontSize: 18 }}>×</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 300, overflowY: "auto", marginBottom: 16 }}>
          {others.map(m => {
            const name = m.profile?.full_name || m.invited_email || "Unknown";
            const checked = selected.includes(m.user_id);
            const online = onlineUsers.has(m.user_id) && Date.now() - onlineUsers.get(m.user_id)!.lastSeen.getTime() < 120_000;
            return (
              <div key={m.id} onClick={() => setSelected(p => checked ? p.filter(i => i !== m.user_id) : [...p, m.user_id])}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 10, cursor: "pointer", background: checked ? "rgba(14,245,212,.08)" : "rgba(255,255,255,.03)", border: `1px solid ${checked ? "rgba(14,245,212,.25)" : "rgba(255,255,255,.07)"}` }}>
                <div style={{ width: 18, height: 18, borderRadius: 5, flexShrink: 0, border: `2px solid ${checked ? "#0ef5d4" : "rgba(255,255,255,.3)"}`, background: checked ? "#0ef5d4" : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {checked && <span style={{ fontSize: 11, color: "#060912", fontWeight: 800 }}>✓</span>}
                </div>
                <MsgAvatar name={name} size={32} color={checked ? "#0ef5d4" : "#a78bfa"} isOnline={online} avatarUrl={m.profile?.avatar_url} />
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: "#f0f6fc", margin: 0, fontFamily: "'Geist',system-ui,sans-serif" }}>{name}</p>
                  <p style={{ fontSize: 11, color: online ? "#22c55e" : "rgba(255,255,255,.3)", margin: 0 }}>{online ? "● Online" : "○ Offline"}</p>
                </div>
              </div>
            );
          })}
          {others.length === 0 && <p style={{ textAlign: "center", color: "rgba(255,255,255,.3)", fontSize: 13, padding: "20px 0", fontFamily: "'Geist',system-ui,sans-serif" }}>No other team members</p>}
        </div>
        <button onClick={start} disabled={!selected.length || loading} style={{ width: "100%", padding: "12px 0", borderRadius: 11, border: "none", background: selected.length ? "linear-gradient(135deg,#0ef5d4,#0891b2)" : "rgba(255,255,255,.08)", color: selected.length ? "#060912" : "rgba(255,255,255,.3)", fontSize: 14, fontWeight: 700, cursor: selected.length ? "pointer" : "not-allowed", fontFamily: "'Geist',system-ui,sans-serif" }}>
          {loading ? "Starting…" : selected.length > 1 ? "Start Group Chat" : "Start Conversation"}
        </button>
      </div>
    </div>
  );
}

// ─── New Channel Modal ────────────────────────────────────────────────────────

function NewChannelModal({ teamId, onClose, onCreated }: { teamId: string; onClose: () => void; onCreated: () => void }) {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const create = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const { error } = await (supabase as any).from("deal_channels").insert({ team_id: teamId, type: "team", name: name.trim(), created_by: user?.id });
      if (error) throw error;
      toast.success("Channel created!");
      onCreated(); onClose();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,.7)", backdropFilter: "blur(6px)", display: "flex", alignItems: "flex-end" }}>
      <div style={{ width: "100%", maxWidth: 420, margin: "0 auto", background: "#111827", borderRadius: "16px 16px 0 0", border: "1px solid rgba(255,255,255,.1)", borderBottom: "none", padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}><div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,.2)" }} /></div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#f0f6fc", fontFamily: "'Geist',system-ui,sans-serif" }}># New Channel</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,.4)", fontSize: 18 }}>×</button>
        </div>
        <input autoFocus value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === "Enter" && create()} placeholder="Channel name (e.g. general)" style={{ width: "100%", padding: "11px 14px", borderRadius: 10, marginBottom: 14, background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.1)", color: "#f0f6fc", fontSize: 14, fontFamily: "'Geist',system-ui,sans-serif" }} />
        <button onClick={create} disabled={!name.trim() || saving} style={{ width: "100%", padding: "12px 0", borderRadius: 11, border: "none", background: name.trim() ? "rgba(14,245,212,.9)" : "rgba(255,255,255,.08)", color: name.trim() ? "#060912" : "rgba(255,255,255,.3)", fontSize: 14, fontWeight: 700, cursor: name.trim() ? "pointer" : "not-allowed", fontFamily: "'Geist',system-ui,sans-serif" }}>
          {saving ? "Creating…" : "Create Channel"}
        </button>
      </div>
    </div>
  );
}

// ─── Chat Area ────────────────────────────────────────────────────────────────

function ChatArea({ activeChannel, currentUserId, isMobile, onBack, onlineUsers }: {
  activeChannel: Channel; currentUserId: string; isMobile: boolean;
  onBack: () => void; onlineUsers: Map<string, OnlineUser>;
}) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<Msg | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [totalParticipants, setTotalParticipants] = useState(2);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isDM = activeChannel.type === "dm" && !!activeChannel.conversationId;

  // fetch participant count for read receipt display
  useEffect(() => {
    if (!activeChannel.conversationId) return;
    supabase.from("conversation_participants").select("user_id", { count: "exact", head: true })
      .eq("conversation_id", activeChannel.conversationId)
      .then(({ count }) => { if (count) setTotalParticipants(count); });
  }, [activeChannel.conversationId]);

  const load = useCallback(async () => {
    if (isDM && activeChannel.conversationId) {
      const { data, error } = await (supabase as any).rpc("get_team_messages_with_senders", {
        p_conversation_id: activeChannel.conversationId, p_limit: 100,
      });
      if (error) {
        console.error("get_team_messages_with_senders:", error);
        // graceful fallback — no enrichment
        const { data: raw } = await supabase.from("team_messages").select("*")
          .eq("conversation_id", activeChannel.conversationId)
          .order("created_at", { ascending: true }).limit(100);
        setMessages(((raw || []) as any[]).map((m: any) => ({ ...m, user_id: m.sender_id, reactions: [] })));
      } else {
        setMessages(((data || []) as any[]).map((m: any) => ({
          ...m, user_id: m.sender_id,
          reactions: Array.isArray(m.reactions) ? m.reactions : [],
          read_by: Array.isArray(m.read_by) ? m.read_by : [],
        })));
      }
    } else {
      const { data, error } = await (supabase as any).rpc("get_channel_messages_v2", { p_channel_id: activeChannel.id, p_limit: 100 });
      if (error) {
        const { data: raw } = await (supabase as any).from("deal_channel_messages").select("*").eq("channel_id", activeChannel.id).order("created_at", { ascending: true }).limit(100);
        setMessages(((raw || []) as any[]).map((m: any) => ({ ...m, reactions: [] })));
      } else {
        setMessages(((data || []) as any[]).map((m: any) => ({ ...m, reactions: Array.isArray(m.reactions) ? m.reactions : [] })));
      }
    }
    setLoading(false);
  }, [isDM, activeChannel.id, activeChannel.conversationId]);

  useEffect(() => { setLoading(true); setMessages([]); setReplyTo(null); setEditingId(null); setText(""); load(); }, [activeChannel.id]);

  // Realtime for messages
  useEffect(() => {
    const table = isDM ? "team_messages" : "deal_channel_messages";
    const filter = isDM ? `conversation_id=eq.${activeChannel.conversationId}` : `channel_id=eq.${activeChannel.id}`;
    const ch = supabase.channel(`msgs-rt-${activeChannel.id}`).on("postgres_changes", { event: "*", schema: "public", table, filter }, load).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [activeChannel.id, activeChannel.conversationId, isDM, load]);

  // Realtime for read receipts and reactions
  useEffect(() => {
    if (!isDM) return;
    const ch = supabase.channel(`extras-rt-${activeChannel.conversationId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "message_read_receipts" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "team_message_reactions" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [activeChannel.conversationId, isDM, load]);

  // Typing channel
  useEffect(() => {
    const ch = supabase.channel(`typing-${activeChannel.id}`);
    typingChannelRef.current = ch;
    ch.on("broadcast", { event: "typing" }, ({ payload }) => {
      if (payload.userId === currentUserId) return;
      setTypingUsers(p => p.includes(payload.name) ? p : [...p, payload.name]);
      setTimeout(() => setTypingUsers(p => p.filter(n => n !== payload.name)), 3000);
    }).on("broadcast", { event: "stop_typing" }, ({ payload }) => {
      setTypingUsers(p => p.filter(n => n !== payload.name));
    }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [activeChannel.id, currentUserId]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length]);

  const sendTyping = () => {
    typingChannelRef.current?.send({ type: "broadcast", event: "typing", payload: { userId: currentUserId, name: user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Someone" } });
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => { typingChannelRef.current?.send({ type: "broadcast", event: "stop_typing", payload: { userId: currentUserId } }); }, 2500);
  };

  const send = async () => {
    const t = text.trim();
    if (!t || !user || sending) return;
    setSending(true); setText("");
    typingChannelRef.current?.send({ type: "broadcast", event: "stop_typing", payload: { userId: currentUserId } });
    try {
      if (isDM) {
        await supabase.from("team_messages").insert({ conversation_id: activeChannel.conversationId, sender_id: user.id, message_text: t, parent_id: replyTo?.id ?? null } as any);
      } else {
        await (supabase as any).from("deal_channel_messages").insert({ channel_id: activeChannel.id, user_id: user.id, content: t, type: "text", parent_id: replyTo?.id ?? null });
      }
      setReplyTo(null);
    } catch { toast.error("Failed to send"); setText(t); } finally { setSending(false); }
  };

  const handleReact = async (msgId: string, emoji: string) => {
    if (!user) return;
    const table = isDM ? "team_message_reactions" : "message_reactions";
    const idCol = "message_id";
    const { data: ex } = await (supabase as any).from(table).select("id").eq(idCol, msgId).eq("user_id", user.id).eq("emoji", emoji).maybeSingle();
    if (ex) { await (supabase as any).from(table).delete().eq("id", ex.id); }
    else { await (supabase as any).from(table).insert({ [idCol]: msgId, user_id: user.id, emoji }); }
    load();
  };

  const saveEdit = async () => {
    if (!editingId || !editText.trim()) return;
    try {
      if (isDM) { await (supabase as any).from("team_messages").update({ message_text: editText.trim(), edited_at: new Date().toISOString() }).eq("id", editingId); }
      else { await (supabase as any).from("deal_channel_messages").update({ content: editText.trim(), edited_at: new Date().toISOString() }).eq("id", editingId); }
      setEditingId(null); load();
    } catch { toast.error("Failed to edit"); }
  };

  const deleteMsg = async (id: string) => {
    try {
      if (isDM) { await (supabase as any).from("team_messages").update({ is_deleted: true }).eq("id", id); }
      else { await (supabase as any).from("deal_channel_messages").update({ is_deleted: true }).eq("id", id); }
      load();
    } catch { toast.error("Failed to delete"); }
  };

  const copyMsg = (m: Msg) => navigator.clipboard.writeText(msgText(m)).then(() => toast.success("Copied!")).catch(() => toast.error("Copy failed"));

  const startReply = (m: Msg) => { setReplyTo(m); inputRef.current?.focus(); };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* Header */}
      <div style={{ padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,.06)", display: "flex", alignItems: "center", gap: 10, flexShrink: 0, background: "rgba(255,255,255,.02)" }}>
        {isMobile && <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: "#0ef5d4", flexShrink: 0, padding: 4 }}><ChevronLeft size={20} /></button>}
        <div style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, background: activeChannel.type === "dm" ? "rgba(167,139,250,.1)" : "rgba(14,245,212,.08)", border: `1px solid ${activeChannel.type === "dm" ? "rgba(167,139,250,.2)" : "rgba(14,245,212,.15)"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: activeChannel.type === "dm" ? "#a78bfa" : "#0ef5d4" }}>
          {activeChannel.type === "deal" ? "◈" : activeChannel.type === "dm" ? "●" : "#"}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: "#f0f6fc", margin: 0, fontFamily: "'Geist',system-ui,sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{activeChannel.name}</p>
          {activeChannel.deal_stage && <p style={{ fontSize: 11, color: "rgba(255,255,255,.3)", margin: 0 }}>{getStage(activeChannel.deal_stage).label}</p>}
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px 4px", minHeight: 0 }}>
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 40 }}><div style={{ width: 22, height: 22, borderRadius: "50%", border: "2px solid rgba(14,245,212,.3)", borderTopColor: "#0ef5d4", animation: "spin .8s linear infinite" }} /></div>
        ) : messages.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 20px" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>{activeChannel.type === "dm" ? "👋" : "#"}</div>
            <p style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,.4)", margin: "0 0 6px", fontFamily: "'Geist',system-ui,sans-serif" }}>{activeChannel.type === "dm" ? `Start a conversation with ${activeChannel.name}` : `#${activeChannel.name}`}</p>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,.22)", margin: 0 }}>Send a message to get started.</p>
          </div>
        ) : (
          <>
            {messages.map((msg, i) => {
              const prev = i > 0 ? messages[i - 1] : null;
              const showDate = !prev || new Date(msg.created_at).toDateString() !== new Date(prev.created_at).toDateString();
              const uid = msgSenderId(msg);
              const isOwn = uid === currentUserId;
              const senderOnline = uid ? (onlineUsers.has(uid) && Date.now() - onlineUsers.get(uid)!.lastSeen.getTime() < 120_000) : false;

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

                  {editingId === msg.id ? (
                    <div style={{ margin: "4px 0 8px", padding: "8px 12px", background: "rgba(14,245,212,.06)", borderRadius: 10, border: "1px solid rgba(14,245,212,.2)" }}>
                      <textarea value={editText} onChange={e => setEditText(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveEdit(); } if (e.key === "Escape") setEditingId(null); }}
                        autoFocus style={{ width: "100%", background: "transparent", border: "none", outline: "none", color: "#f0f6fc", fontSize: 13.5, resize: "none", minHeight: 36, fontFamily: "'Geist',system-ui,sans-serif" }} />
                      <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                        <button onClick={saveEdit} style={{ padding: "4px 12px", borderRadius: 7, border: "none", background: "#0ef5d4", color: "#060912", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Save</button>
                        <button onClick={() => setEditingId(null)} style={{ padding: "4px 12px", borderRadius: 7, border: "1px solid rgba(255,255,255,.15)", background: "transparent", color: "rgba(255,255,255,.6)", fontSize: 12, cursor: "pointer" }}>Cancel</button>
                        <span style={{ fontSize: 11, color: "rgba(255,255,255,.3)", alignSelf: "center" }}>Enter · Esc</span>
                      </div>
                    </div>
                  ) : (
                    <div style={{ marginBottom: 6 }}>
                      <MsgBubble
                        msg={msg} isOwn={isOwn} isMobile={isMobile}
                        isOnline={!isOwn && senderOnline}
                        totalParticipants={totalParticipants}
                        onReact={e => handleReact(msg.id, e)}
                        onReply={() => startReply(msg)}
                        onEdit={() => { setEditingId(msg.id); setEditText(msgText(msg)); }}
                        onDelete={() => deleteMsg(msg.id)}
                        onCopy={() => copyMsg(msg)}
                      />
                    </div>
                  )}
                </div>
              );
            })}
            <div ref={endRef} style={{ height: 4 }} />
          </>
        )}
      </div>

      {/* Typing indicator */}
      {typingUsers.length > 0 && (
        <div style={{ padding: "3px 16px", flexShrink: 0, display: "flex", alignItems: "center", gap: 6 }}>
          <span className="pdot" /><span className="pdot" /><span className="pdot" />
          <span style={{ fontSize: 12, color: "rgba(255,255,255,.4)", fontFamily: "'Geist',system-ui,sans-serif" }}>
            {typingUsers.join(", ")} {typingUsers.length === 1 ? "is" : "are"} typing…
          </span>
        </div>
      )}

      {/* Reply banner */}
      {replyTo && (
        <div style={{ margin: "0 14px 4px", padding: "6px 10px", background: "rgba(167,139,250,.08)", border: "1px solid rgba(167,139,250,.2)", borderRadius: 10, display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <CornerUpLeft size={13} color="#a78bfa" style={{ flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#a78bfa", fontFamily: "'Geist',system-ui,sans-serif" }}>
              Replying to {replyTo.sender_full_name || msgSenderName(replyTo)}
            </span>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,.4)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{msgText(replyTo)}</p>
          </div>
          <button onClick={() => setReplyTo(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,.4)", flexShrink: 0 }}><X size={14} /></button>
        </div>
      )}

      {/* Input */}
      <div style={{ padding: "8px 14px 12px", borderTop: "1px solid rgba(255,255,255,.06)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 8, background: "rgba(255,255,255,.05)", border: `1px solid ${text ? "rgba(14,245,212,.25)" : "rgba(255,255,255,.09)"}`, borderRadius: 13, padding: "8px 10px 8px 14px", transition: "border-color .15s" }}>
          <textarea
            ref={inputRef} value={text}
            onChange={e => { setText(e.target.value); sendTyping(); }}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder={`Message ${activeChannel.type === "dm" ? activeChannel.name : "#" + activeChannel.name}…`}
            rows={1}
            style={{ flex: 1, background: "transparent", border: "none", outline: "none", resize: "none", fontSize: 14, color: "#f0f6fc", fontFamily: "'Geist',system-ui,sans-serif", lineHeight: 1.5, maxHeight: 100, overflowY: "auto" }}
          />
          <button onClick={send} disabled={!text.trim() || sending} style={{ width: 34, height: 34, borderRadius: 9, border: "none", flexShrink: 0, background: text.trim() ? "linear-gradient(135deg,#0ef5d4,#0891b2)" : "rgba(255,255,255,.07)", color: text.trim() ? "#060912" : "rgba(255,255,255,.25)", display: "flex", alignItems: "center", justifyContent: "center", cursor: text.trim() ? "pointer" : "not-allowed", transition: "all .15s" }}>
            <Send size={14} />
          </button>
        </div>
        {!isMobile && <p style={{ fontSize: 10.5, color: "rgba(255,255,255,.2)", margin: "4px 0 0 2px", fontFamily: "'Geist',system-ui,sans-serif" }}>Enter to send · Shift+Enter newline · Hover a message to reply / react / edit</p>}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MessagesPage() {
  const { user } = useAuth();
  const { team, members } = useTeam();
  const teamId = team?.id;
  const { conversations } = useTeamMessaging(teamId);

  const [dealChannels, setDealChannels] = useState<Channel[]>([]);
  const [loadingCh, setLoadingCh] = useState(true);
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [showNewChannel, setShowNewChannel] = useState(false);
  const [showNewDM, setShowNewDM] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<Map<string, OnlineUser>>(new Map());
  const [isMobile, setIsMobile] = useState(false);
  const [mobileView, setMobileView] = useState<"list" | "chat">("list");

  useEffect(() => {
    const chk = () => setIsMobile(window.innerWidth < 768);
    chk(); window.addEventListener("resize", chk); return () => window.removeEventListener("resize", chk);
  }, []);

  // Presence heartbeat
  useEffect(() => {
    if (!user || !teamId) return;
    const beat = () => (supabase as any).rpc("upsert_user_presence", { p_status: "available", p_team_id: teamId, p_last_page: "messages" });
    beat();
    const t = setInterval(beat, 60_000);
    return () => clearInterval(t);
  }, [user, teamId]);

  // Fetch online users
  useEffect(() => {
    if (!teamId) return;
    const fetch = async () => {
      const twoMin = new Date(Date.now() - 120_000).toISOString();
      const { data } = await (supabase as any).from("user_statuses").select("user_id, last_seen_at").eq("team_id", teamId).gte("last_seen_at", twoMin);
      const m = new Map<string, OnlineUser>();
      ((data || []) as any[]).forEach((r: any) => m.set(r.user_id, { userId: r.user_id, lastSeen: new Date(r.last_seen_at) }));
      setOnlineUsers(m);
    };
    fetch();
    const t = setInterval(fetch, 30_000);
    const ch = supabase.channel(`presence-${teamId}`).on("postgres_changes", { event: "*", schema: "public", table: "user_statuses" }, (p: any) => {
      const row = p.new as any;
      if (row?.user_id && row?.last_seen_at) setOnlineUsers(prev => { const n = new Map(prev); n.set(row.user_id, { userId: row.user_id, lastSeen: new Date(row.last_seen_at) }); return n; });
    }).subscribe();
    return () => { clearInterval(t); supabase.removeChannel(ch); };
  }, [teamId]);

  // Load deal channels
  const loadDealChannels = useCallback(async () => {
    if (!teamId) return;
    setLoadingCh(true);
    try {
      const { data, error } = await (supabase as any).rpc("get_deal_channels_v2", { p_team_id: teamId });
      if (error) throw error;
      setDealChannels((data as Channel[]) ?? []);
    } catch { setDealChannels([]); } finally { setLoadingCh(false); }
  }, [teamId]);

  useEffect(() => { loadDealChannels(); }, [teamId]);

  // DM channels from conversations
  const dmChannels = useMemo((): Channel[] => conversations.map(c => {
    const other = c.participants[0];
    const name = other ? (other.full_name || other.email?.split("@")[0] || "Unknown") : c.participants.length > 0 ? `Group (${c.participants.length + 1})` : "Chat";
    return { id: `dm-${c.id}`, name, type: "dm" as const, conversationId: c.id, deal_id: null, call_id: null, deal_name: null, deal_stage: null, deal_value: null, deal_health: null, deal_next_step: null, call_name: null, call_summary: null, call_sentiment: null, last_msg: c.last_message?.message_text || null, last_msg_at: c.last_message?.created_at || null, unread_count: c.unread_count, msg_count: 0, is_muted: false };
  }), [conversations]);

  const allChannels = useMemo(() => {
    const all = [...dealChannels, ...dmChannels];
    if (!searchQ) return all;
    return all.filter(c => c.name.toLowerCase().includes(searchQ.toLowerCase()));
  }, [dealChannels, dmChannels, searchQ]);

  const teamChs = allChannels.filter(c => c.type === "team");
  const dealChs = allChannels.filter(c => c.type === "deal");
  const dmChs   = allChannels.filter(c => c.type === "dm");

  // Notifications
  const loadNotifs = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from("notifications").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(30);
    setNotifications((data ?? []) as NotificationItem[]);
  }, [user]);

  useEffect(() => { loadNotifs(); }, [user]);
  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel(`notif-${user.id}`).on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, loadNotifs).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, loadNotifs]);

  const markAllRead = async () => {
    if (!user) return;
    await supabase.from("notifications").update({ is_read: true } as any).eq("user_id", user.id).eq("is_read", false);
    setNotifications(p => p.map(n => ({ ...n, is_read: true })));
  };
  const markOneRead = async (id: string) => {
    await supabase.from("notifications").update({ is_read: true } as any).eq("id", id);
    setNotifications(p => p.map(n => n.id === id ? { ...n, is_read: true } : n));
  };

  const selectChannel = (ch: Channel) => { setActiveChannel(ch); if (isMobile) setMobileView("chat"); };

  if (!teamId) return (
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

  const Sidebar = () => (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Sidebar header */}
      <div style={{ padding: "12px 14px 10px", borderBottom: "1px solid rgba(255,255,255,.06)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: "linear-gradient(135deg,#0ef5d4,#0891b2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: "#060912", fontWeight: 900 }}>F</div>
            <div>
              <p style={{ fontSize: 13, fontWeight: 800, color: "#f0f6fc", margin: 0, fontFamily: "'Geist',system-ui,sans-serif" }}>{team?.name || "Fixsense"}</p>
              <p style={{ fontSize: 10, color: "rgba(255,255,255,.3)", margin: 0 }}>{onlineUsers.size} online · {members.length} members</p>
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <NotificationBell notifications={notifications} onMarkAll={markAllRead} onMarkOne={markOneRead} isMobile={isMobile} />
            <button onClick={() => setShowSearch(v => !v)} style={{ width: 34, height: 34, borderRadius: 9, background: showSearch ? "rgba(14,245,212,.12)" : "rgba(255,255,255,.07)", border: `1px solid ${showSearch ? "rgba(14,245,212,.3)" : "rgba(255,255,255,.1)"}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: showSearch ? "#0ef5d4" : "rgba(255,255,255,.5)" }}>
              <Search size={13} />
            </button>
          </div>
        </div>
        {showSearch && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 9, padding: "7px 11px" }}>
            <Search size={12} color="rgba(255,255,255,.3)" />
            <input autoFocus value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Search channels…" style={{ flex: 1, background: "transparent", border: "none", outline: "none", fontSize: 13, color: "#f0f6fc", fontFamily: "'Geist',system-ui,sans-serif" }} />
            {searchQ && <button onClick={() => setSearchQ("")} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,.3)", fontSize: 14 }}>×</button>}
          </div>
        )}
      </div>

      {/* Channel list */}
      <div style={{ flex: 1, overflowY: "auto", paddingTop: 4 }}>
        {loadingCh ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 32 }}><div style={{ width: 18, height: 18, borderRadius: "50%", border: "2px solid rgba(14,245,212,.3)", borderTopColor: "#0ef5d4", animation: "spin .8s linear infinite" }} /></div>
        ) : (
          <>
            {/* DMs */}
            <div style={{ padding: "10px 12px 4px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 9.5, fontWeight: 800, color: "rgba(255,255,255,.25)", textTransform: "uppercase", letterSpacing: ".1em" }}>● Direct Messages</span>
              <button onClick={() => setShowNewDM(true)} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,.35)", fontSize: 16, lineHeight: 1 }}>+</button>
            </div>
            {dmChs.map(ch => {
              const conv = conversations.find(c => `dm-${c.id}` === ch.id);
              const otherId = conv?.participants[0]?.user_id;
              const online = otherId ? (onlineUsers.has(otherId) && Date.now() - onlineUsers.get(otherId)!.lastSeen.getTime() < 120_000) : false;
              return (
                <div key={ch.id} style={{ position: "relative" }}>
                  <ChannelItem ch={ch} isActive={activeChannel?.id === ch.id} onClick={() => selectChannel(ch)} />
                  {online && <div style={{ position: "absolute", left: 22, top: "50%", transform: "translateY(-50%)", width: 7, height: 7, borderRadius: "50%", background: "#22c55e", border: "1.5px solid #0c0f1e", pointerEvents: "none" }} />}
                </div>
              );
            })}
            {dmChs.length === 0 && <button onClick={() => setShowNewDM(true)} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 14px", border: "none", background: "transparent", cursor: "pointer", color: "rgba(255,255,255,.25)", fontSize: 12, fontFamily: "'Geist',system-ui,sans-serif" }}><Plus size={13} /> Message a teammate</button>}

            {/* Team channels */}
            {teamChs.length > 0 && (
              <>
                <div style={{ padding: "12px 12px 4px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 9.5, fontWeight: 800, color: "rgba(255,255,255,.25)", textTransform: "uppercase", letterSpacing: ".1em" }}># Channels</span>
                  <button onClick={() => setShowNewChannel(true)} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,.35)", fontSize: 16, lineHeight: 1 }}>+</button>
                </div>
                {teamChs.map(ch => <ChannelItem key={ch.id} ch={ch} isActive={activeChannel?.id === ch.id} onClick={() => selectChannel(ch)} />)}
              </>
            )}

            {/* Deal channels */}
            {dealChs.length > 0 && (
              <>
                <div style={{ padding: "12px 12px 4px" }}>
                  <span style={{ fontSize: 9.5, fontWeight: 800, color: "rgba(255,255,255,.25)", textTransform: "uppercase", letterSpacing: ".1em" }}>◈ Deals</span>
                </div>
                {dealChs.map(ch => <ChannelItem key={ch.id} ch={ch} isActive={activeChannel?.id === ch.id} onClick={() => selectChannel(ch)} />)}
              </>
            )}

            {allChannels.length === 0 && !loadingCh && !searchQ && (
              <div style={{ padding: "30px 16px", textAlign: "center" }}>
                <p style={{ fontSize: 13, color: "rgba(255,255,255,.3)", margin: "0 0 12px", fontFamily: "'Geist',system-ui,sans-serif" }}>No channels yet</p>
                <button onClick={() => setShowNewChannel(true)} style={{ padding: "8px 18px", borderRadius: 9, background: "rgba(14,245,212,.1)", border: "1px solid rgba(14,245,212,.2)", color: "#0ef5d4", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'Geist',system-ui,sans-serif" }}>+ Create Channel</button>
              </div>
            )}
          </>
        )}
      </div>

      {isMobile && (
        <div style={{ padding: "10px 14px", borderTop: "1px solid rgba(255,255,255,.06)", display: "flex", gap: 8 }}>
          <button onClick={() => setShowNewDM(true)} style={{ flex: 1, padding: "10px 0", borderRadius: 10, background: "rgba(167,139,250,.1)", border: "1px solid rgba(167,139,250,.2)", color: "#a78bfa", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'Geist',system-ui,sans-serif", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}><MessageSquare size={14} /> New DM</button>
          <button onClick={() => setShowNewChannel(true)} style={{ flex: 1, padding: "10px 0", borderRadius: 10, background: "rgba(14,245,212,.1)", border: "1px solid rgba(14,245,212,.2)", color: "#0ef5d4", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'Geist',system-ui,sans-serif", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}><Hash size={14} /> New Channel</button>
        </div>
      )}
    </div>
  );

  return (
    <DashboardLayout>
      <style>{CSS}</style>

      {showNewChannel && <NewChannelModal teamId={teamId} onClose={() => setShowNewChannel(false)} onCreated={() => { setShowNewChannel(false); loadDealChannels(); }} />}
      {showNewDM && user && (
        <NewDMModal members={members} currentUserId={user.id} conversations={conversations} teamId={teamId} onlineUsers={onlineUsers}
          onClose={() => setShowNewDM(false)}
          onCreated={(convoId, name) => {
            setShowNewDM(false);
            selectChannel({ id: `dm-${convoId}`, name, type: "dm", conversationId: convoId, deal_id: null, call_id: null, deal_name: null, deal_stage: null, deal_value: null, deal_health: null, deal_next_step: null, call_name: null, call_summary: null, call_sentiment: null, last_msg: null, last_msg_at: null, unread_count: 0, msg_count: 0, is_muted: false });
          }}
        />
      )}

      <div style={{ display: "flex", height: "calc(100vh - 7rem)", borderRadius: 14, overflow: "hidden", border: "1px solid rgba(255,255,255,.07)", background: "#08090f", fontFamily: "'Geist',system-ui,sans-serif", minHeight: 0 }}>
        {(!isMobile || mobileView === "list") && (
          <div style={{ width: isMobile ? "100%" : 260, flexShrink: 0, borderRight: "1px solid rgba(255,255,255,.06)", background: "#0c0f1e", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <Sidebar />
          </div>
        )}
        {(!isMobile || mobileView === "chat") && (
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
            {activeChannel ? (
              <ChatArea activeChannel={activeChannel} currentUserId={user?.id ?? ""} isMobile={isMobile} onBack={() => setMobileView("list")} onlineUsers={onlineUsers} />
            ) : (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, textAlign: "center" }}>
                {isMobile && <button onClick={() => setMobileView("list")} style={{ position: "absolute", top: 16, left: 16, background: "none", border: "none", cursor: "pointer", color: "#0ef5d4" }}><ChevronLeft size={22} /></button>}
                <div style={{ width: 72, height: 72, borderRadius: 20, background: "rgba(14,245,212,.07)", border: "1px solid rgba(14,245,212,.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, marginBottom: 16 }}>💬</div>
                <p style={{ fontSize: 16, fontWeight: 700, color: "rgba(255,255,255,.4)", margin: "0 0 8px", fontFamily: "'Geist',system-ui,sans-serif" }}>Select a conversation</p>
                <p style={{ fontSize: 13, color: "rgba(255,255,255,.22)", maxWidth: 280, lineHeight: 1.6, margin: "0 0 20px" }}>Message teammates directly or collaborate in team and deal channels.</p>
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => setShowNewDM(true)} style={{ padding: "10px 18px", borderRadius: 10, background: "rgba(167,139,250,.1)", border: "1px solid rgba(167,139,250,.25)", color: "#a78bfa", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'Geist',system-ui,sans-serif", display: "flex", alignItems: "center", gap: 6 }}><Users size={14} /> New DM</button>
                  <button onClick={() => setShowNewChannel(true)} style={{ padding: "10px 18px", borderRadius: 10, background: "rgba(14,245,212,.1)", border: "1px solid rgba(14,245,212,.25)", color: "#0ef5d4", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'Geist',system-ui,sans-serif", display: "flex", alignItems: "center", gap: 6 }}><Hash size={14} /> New Channel</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}