import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Search, Send, MessageSquare, Bell, Plus, Users, FileText,
  Image as ImageIcon, Paperclip, X, Check, CheckCheck, TrendingUp,
  AtSign, AlertCircle, ArrowLeft, Copy, Trash2, Pencil,
  Loader2, ChevronRight, Pin, Bookmark, BookmarkCheck, Hash,
  MessageCircle, BellOff, ChevronDown, Smile, Reply,
  CornerDownRight, Globe, Filter,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTeam } from "@/hooks/useTeam";
import {
  useTeamMessaging, useConversationMessages,
  getConversationName, getConversationInitials,
} from "@/hooks/useTeamMessaging";
import { useNotifications } from "@/hooks/useNotifications";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/use-toast";
import { format, isToday, isYesterday, isThisWeek } from "date-fns";
import { cn } from "@/lib/utils";
import type { Conversation, ReadReceipt } from "@/hooks/useTeamMessaging";
import type { TeamMember } from "@/hooks/useTeam";
import { useTypingIndicator } from "@/hooks/useTypingIndicator";
import { useQueryClient } from "@tanstack/react-query";

/* ══════════════════════════════════════════════════════════════
   🔊  NOTIFICATION SOUNDS
══════════════════════════════════════════════════════════════ */
function playMessageSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.55, ctx.currentTime);
    master.connect(ctx.destination);
    const notes: [number, number, number][] = [[1046, 0, 0.13], [1318, 0.01, 0.11], [2093, 0.02, 0.08]];
    notes.forEach(([freq, delay, dur]) => {
      const osc = ctx.createOscillator(); const g = ctx.createGain();
      osc.type = "sine"; osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);
      g.gain.setValueAtTime(0, ctx.currentTime + delay);
      g.gain.linearRampToValueAtTime(0.5, ctx.currentTime + delay + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + dur);
      osc.connect(g); g.connect(master);
      osc.start(ctx.currentTime + delay); osc.stop(ctx.currentTime + delay + dur);
    });
    setTimeout(() => ctx.close(), 500);
  } catch { /* silently fail */ }
}

function playAlertSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.45, ctx.currentTime);
    master.connect(ctx.destination);
    const notes: [number, number, number][] = [[783, 0, 0.19], [659, 0.24, 0.22]];
    notes.forEach(([freq, delay, dur]) => {
      const osc = ctx.createOscillator(); const g = ctx.createGain();
      osc.type = "triangle"; osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);
      g.gain.setValueAtTime(0, ctx.currentTime + delay);
      g.gain.linearRampToValueAtTime(0.45, ctx.currentTime + delay + 0.015);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + dur);
      osc.connect(g); g.connect(master);
      osc.start(ctx.currentTime + delay); osc.stop(ctx.currentTime + delay + dur);
    });
    setTimeout(() => ctx.close(), 700);
  } catch { /* silently fail */ }
}

let _lastSound = 0;
function throttledSound(fn: () => void) {
  const now = Date.now();
  if (now - _lastSound > 800) { _lastSound = now; fn(); }
}

/* ══════════════════════════════════════════════════════════════
   📦  TYPES
══════════════════════════════════════════════════════════════ */
interface Reaction {
  emoji: string;
  count: number;
  userIds: string[];
  users: string[];
}

interface PinnedMessage {
  id: string;
  message_id: string;
  message_text: string;
  pinned_by: string;
  created_at: string;
  sender_name: string;
}

interface SavedMessage {
  id: string;
  message_id: string;
  message_text: string;
  created_at: string;
  sender_name: string;
  conversation_name: string;
}

interface SearchResult {
  message_id: string;
  message_text: string;
  sender_name: string;
  conversation_id: string;
  conversation_name: string;
  created_at: string;
}

interface RtMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  message_text: string;
  created_at: string;
  file_url?: string | null;
  file_name?: string | null;
  file_type?: string | null;
  parent_id?: string | null;
  sender?: { full_name: string | null; email: string | null } | null;
}

/* ══════════════════════════════════════════════════════════════
   🎨  EMOJI PICKER (lightweight, no external dep)
══════════════════════════════════════════════════════════════ */
const EMOJI_GROUPS = {
  "Reactions": ["👍", "❤️", "😂", "😮", "😢", "🔥", "🎉", "👏", "🚀", "💯", "✅", "⚡"],
  "Faces": ["😀", "😎", "🤔", "🙏", "💪", "🤝", "👋", "✌️", "🤞", "👌"],
  "Objects": ["📊", "📈", "💡", "🎯", "📝", "💬", "🔔", "⭐", "🏆", "💎"],
};

function EmojiPicker({ onSelect, onClose }: { onSelect: (e: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose]);

  return (
    <div ref={ref} className="mp-emoji-picker">
      {Object.entries(EMOJI_GROUPS).map(([group, emojis]) => (
        <div key={group}>
          <p className="mp-emoji-group">{group}</p>
          <div className="mp-emoji-grid">
            {emojis.map(e => (
              <button key={e} className="mp-emoji-btn" onClick={() => { onSelect(e); onClose(); }}>{e}</button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   📝  RICH TEXT COMPOSER
══════════════════════════════════════════════════════════════ */
function renderMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code class="mp-inline-code">$1</code>')
    .replace(/```([\s\S]*?)```/g, '<pre class="mp-code-block"><code>$1</code></pre>')
    .replace(/^• (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/s, '<ul class="mp-list">$1</ul>')
    .replace(/@(\w+)/g, '<span class="mp-mention">@$1</span>')
    .replace(/\n/g, '<br/>');
}

interface ComposerProps {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onFileClick: () => void;
  members: TeamMember[];
  currentUserId: string;
  placeholder?: string;
  uploading?: boolean;
  disabled?: boolean;
  replyTo?: { id: string; text: string; sender: string } | null;
  onCancelReply?: () => void;
}

function RichComposer({
  value, onChange, onSend, onFileClick, members, currentUserId,
  placeholder = "Message…", uploading, disabled, replyTo, onCancelReply
}: ComposerProps) {
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionStart, setMentionStart] = useState(-1);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const filteredMembers = useMemo(() =>
    members.filter(m =>
      m.user_id !== currentUserId &&
      (m.profile?.full_name || m.invited_email || "").toLowerCase().includes(mentionQuery.toLowerCase())
    ).slice(0, 5),
    [members, currentUserId, mentionQuery]
  );

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    onChange(v);
    const pos = e.target.selectionStart;
    const before = v.slice(0, pos);
    const atIdx = before.lastIndexOf("@");
    if (atIdx !== -1 && !before.slice(atIdx).includes(" ")) {
      setMentionStart(atIdx);
      setMentionQuery(before.slice(atIdx + 1));
      setShowMentions(true);
    } else {
      setShowMentions(false);
    }
    // auto-resize
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 120) + "px";
    }
  };

  const insertMention = (member: TeamMember) => {
    const name = member.profile?.full_name || member.invited_email || "user";
    const before = value.slice(0, mentionStart);
    const after = value.slice(mentionStart + mentionQuery.length + 1);
    onChange(before + `@${name} ` + after);
    setShowMentions(false);
    inputRef.current?.focus();
  };

  const insertFormat = (wrap: string) => {
    const el = inputRef.current;
    if (!el) return;
    const start = el.selectionStart, end = el.selectionEnd;
    const sel = value.slice(start, end) || "text";
    onChange(value.slice(0, start) + wrap + sel + wrap + value.slice(end));
  };

  const canSend = value.trim().length > 0 && !uploading && !disabled;

  return (
    <div className="mp-composer">
      {replyTo && (
        <div className="mp-reply-banner">
          <CornerDownRight style={{ width: 12, height: 12, color: "#7c3aed", flexShrink: 0 }} />
          <span className="mp-reply-sender">{replyTo.sender}</span>
          <span className="mp-reply-text">{replyTo.text.slice(0, 60)}{replyTo.text.length > 60 ? "…" : ""}</span>
          <button className="mp-reply-cancel" onClick={onCancelReply}><X style={{ width: 12, height: 12 }} /></button>
        </div>
      )}
      <div className="mp-format-bar">
        {[
          { label: "B", title: "Bold", action: () => insertFormat("**"), style: { fontWeight: 700 } },
          { label: "I", title: "Italic", action: () => insertFormat("*"), style: { fontStyle: "italic" } },
          { label: "</>", title: "Code", action: () => insertFormat("`"), style: { fontFamily: "monospace", fontSize: 11 } },
          { label: "•", title: "Bullet", action: () => onChange(value + "\n• "), style: {} },
        ].map(b => (
          <button key={b.label} title={b.title} className="mp-fmt-btn" onClick={b.action} style={b.style}>{b.label}</button>
        ))}
        <div className="mp-fmt-sep" />
        <button className="mp-fmt-btn" title="Mention" onClick={() => { onChange(value + "@"); inputRef.current?.focus(); }}>
          <AtSign style={{ width: 11, height: 11 }} />
        </button>
      </div>

      {showMentions && filteredMembers.length > 0 && (
        <div className="mp-mention-dropdown">
          {filteredMembers.map(m => {
            const name = m.profile?.full_name || m.invited_email || "Unknown";
            return (
              <button key={m.id} className="mp-mention-item" onClick={() => insertMention(m)}>
                <div className="mp-mention-av">{name[0]?.toUpperCase()}</div>
                <span>{name}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="mp-input-row">
        <button className="mp-input-icon" onClick={onFileClick} disabled={!!uploading}>
          <Paperclip style={{ width: 16, height: 16 }} />
        </button>
        <textarea
          ref={inputRef}
          className="mp-chat-textarea"
          placeholder={placeholder}
          value={value}
          onChange={handleInput}
          onKeyDown={e => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (canSend) onSend(); }
          }}
          disabled={!!disabled || !!uploading}
          rows={1}
        />
        <button
          className={cn("mp-send", canSend && "mp-send--active")}
          onClick={onSend}
          disabled={!canSend}
        >
          <Send style={{ width: 15, height: 15 }} />
        </button>
      </div>
      <p className="mp-hint">Shift+Enter for new line · **bold** · *italic* · `code` · @mention</p>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   🔖  REACTIONS BAR
══════════════════════════════════════════════════════════════ */
function ReactionsBar({ messageId, currentUserId }: { messageId: string; currentUserId: string }) {
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    loadReactions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageId]);

  const loadReactions = async () => {
    try {
      const { data } = await supabase
        .from("message_reactions" as any)
        .select("emoji, user_id, id")
        .eq("message_id", messageId);
      if (!data) return;
      const map = new Map<string, { count: number; userIds: string[]; users: string[] }>();
      data.forEach((r: any) => {
        if (!map.has(r.emoji)) map.set(r.emoji, { count: 0, userIds: [], users: [] });
        const e = map.get(r.emoji)!;
        e.count++;
        e.userIds.push(r.user_id);
      });
      setReactions(Array.from(map.entries()).map(([emoji, d]) => ({ emoji, ...d })));
    } catch { /* table may not exist yet */ }
  };

  const toggleReaction = async (emoji: string) => {
    const existing = reactions.find(r => r.emoji === emoji);
    const alreadyReacted = existing?.userIds.includes(currentUserId);
    if (alreadyReacted) {
      await supabase.from("message_reactions" as any).delete()
        .eq("message_id", messageId).eq("user_id", currentUserId).eq("emoji", emoji);
    } else {
      await supabase.from("message_reactions" as any).insert({ message_id: messageId, user_id: currentUserId, emoji });
    }
    loadReactions();
  };

  return (
    <div className="mp-reactions-wrap">
      {reactions.map(r => (
        <button
          key={r.emoji}
          className={cn("mp-reaction", r.userIds.includes(currentUserId) && "mp-reaction--mine")}
          onClick={() => toggleReaction(r.emoji)}
          title={`${r.count} reaction${r.count !== 1 ? "s" : ""}`}
        >
          <span>{r.emoji}</span>
          <span className="mp-reaction-count">{r.count}</span>
        </button>
      ))}
      <div style={{ position: "relative" }}>
        <button className="mp-add-reaction" onClick={() => setShowPicker(p => !p)}>
          <Smile style={{ width: 12, height: 12 }} />
        </button>
        {showPicker && <EmojiPicker onSelect={toggleReaction} onClose={() => setShowPicker(false)} />}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   📌  PINNED MESSAGES PANEL
══════════════════════════════════════════════════════════════ */
function PinnedPanel({ conversationId, onClose }: { conversationId: string; onClose: () => void }) {
  const [pins, setPins] = useState<PinnedMessage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPins();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  const loadPins = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("pinned_messages" as any)
        .select("*, team_messages(message_text, sender_id)")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(20);
      setPins((data || []) as PinnedMessage[]);
    } catch { setPins([]); }
    setLoading(false);
  };

  return (
    <div className="mp-panel-overlay">
      <div className="mp-side-panel">
        <div className="mp-side-panel-hdr">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Pin style={{ width: 14, height: 14, color: "#f59e0b" }} />
            <span className="mp-side-panel-title">Pinned Messages</span>
          </div>
          <button className="mp-side-panel-close" onClick={onClose}><X style={{ width: 14, height: 14 }} /></button>
        </div>
        <div className="mp-side-panel-body">
          {loading ? <div className="mp-center"><Loader2 className="mp-spin" /></div>
            : pins.length === 0 ? (
              <div className="mp-panel-empty">
                <Pin style={{ width: 28, height: 28, opacity: 0.3 }} />
                <p>No pinned messages yet</p>
                <p style={{ fontSize: 11, opacity: 0.5 }}>Pin important messages from the message menu</p>
              </div>
            ) : pins.map((pin: any) => (
              <div key={pin.id} className="mp-pin-item">
                <Pin style={{ width: 11, height: 11, color: "#f59e0b", flexShrink: 0, marginTop: 2 }} />
                <div>
                  <p className="mp-pin-text">{pin.team_messages?.message_text || "Message deleted"}</p>
                  <p className="mp-pin-meta">Pinned {format(new Date(pin.created_at), "MMM d")}</p>
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   💾  SAVED MESSAGES PAGE
══════════════════════════════════════════════════════════════ */
function SavedPanel({ userId, onJumpTo }: { userId: string; onJumpTo: (convId: string) => void }) {
  const [saved, setSaved] = useState<SavedMessage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data } = await supabase
          .from("saved_messages" as any)
          .select("*, team_messages(message_text, sender_id, conversation_id)")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(50);
        setSaved((data || []) as SavedMessage[]);
      } catch { setSaved([]); }
      setLoading(false);
    })();
  }, [userId]);

  const unsave = async (id: string) => {
    await supabase.from("saved_messages" as any).delete().eq("id", id);
    setSaved(p => p.filter(s => s.id !== id));
  };

  return (
    <div className="mp-thread" style={{ padding: "0" }}>
      <div className="mp-thread-header">
        <Bookmark style={{ width: 16, height: 16, color: "#a78bfa" }} />
        <div className="mp-thread-info">
          <p className="mp-thread-name">Saved Messages</p>
          <p className="mp-thread-sub" style={{ color: "rgba(255,255,255,0.3)" }}>{saved.length} saved</p>
        </div>
      </div>
      <div className="mp-messages">
        {loading ? <div className="mp-center"><Loader2 className="mp-spin" /></div>
          : saved.length === 0 ? (
            <div className="mp-empty-thread">
              <div className="mp-empty-icon"><Bookmark style={{ width: 22, height: 22, color: "#7c3aed" }} /></div>
              <p className="mp-empty-title">No saved messages</p>
              <p className="mp-empty-sub">Save messages from the context menu to find them here</p>
            </div>
          ) : saved.map((s: any) => (
            <div key={s.id} className="mp-saved-item">
              <div className="mp-saved-body">
                <p className="mp-saved-text">{s.team_messages?.message_text || "Deleted message"}</p>
                <p className="mp-saved-meta">
                  {s.created_at ? format(new Date(s.created_at), "MMM d, h:mm a") : ""}
                </p>
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                {s.team_messages?.conversation_id && (
                  <button className="mp-ha" onClick={() => onJumpTo(s.team_messages.conversation_id)}>
                    <CornerDownRight style={{ width: 11, height: 11 }} />
                  </button>
                )}
                <button className="mp-ha mp-ha--del" onClick={() => unsave(s.id)}>
                  <X style={{ width: 11, height: 11 }} />
                </button>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   🔍  GLOBAL SEARCH
══════════════════════════════════════════════════════════════ */
function GlobalSearch({ conversations, onJumpTo, onClose }: {
  conversations: Conversation[];
  onJumpTo: (convId: string, msgId?: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const timer = useRef<NodeJS.Timeout | null>(null);

  const search = useCallback(async (q: string) => {
    if (!q.trim() || q.length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      const { data } = await supabase
        .from("team_messages" as any)
        .select("id, message_text, sender_id, conversation_id, created_at")
        .ilike("message_text", `%${q}%`)
        .order("created_at", { ascending: false })
        .limit(20);

      const convMap = new Map(conversations.map(c => [c.id, getConversationName(c)]));
      setResults((data || []).map((m: any) => ({
        message_id: m.id,
        message_text: m.message_text,
        sender_name: "Team Member",
        conversation_id: m.conversation_id,
        conversation_name: convMap.get(m.conversation_id) || "Unknown",
        created_at: m.created_at,
      })));
    } catch { setResults([]); }
    setLoading(false);
  }, [conversations]);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => search(query), 300);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [query, search]);

  const highlight = (text: string, q: string) => {
    if (!q) return text;
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return text.slice(0, 80);
    const start = Math.max(0, idx - 20);
    const end = Math.min(text.length, idx + q.length + 40);
    return (start > 0 ? "…" : "") + text.slice(start, end) + (end < text.length ? "…" : "");
  };

  return (
    <div className="mp-search-modal-overlay" onClick={onClose}>
      <div className="mp-search-modal" onClick={e => e.stopPropagation()}>
        <div className="mp-search-modal-input-wrap">
          <Search style={{ width: 18, height: 18, color: "rgba(255,255,255,0.3)", flexShrink: 0 }} />
          <input
            autoFocus
            className="mp-search-modal-input"
            placeholder="Search all messages…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          {loading && <Loader2 style={{ width: 16, height: 16, color: "#7c3aed", animation: "mpSpin 1s linear infinite", flexShrink: 0 }} />}
          <button className="mp-search-clr" onClick={onClose}><X style={{ width: 14, height: 14 }} /></button>
        </div>
        <div className="mp-search-results">
          {query.length > 1 && results.length === 0 && !loading && (
            <p className="mp-search-empty">No messages found for "{query}"</p>
          )}
          {results.map(r => (
            <button key={r.message_id} className="mp-search-result" onClick={() => { onJumpTo(r.conversation_id, r.message_id); onClose(); }}>
              <div className="mp-search-result-conv">
                <Hash style={{ width: 10, height: 10 }} />
                <span>{r.conversation_name}</span>
                <span style={{ opacity: 0.4, marginLeft: "auto" }}>{format(new Date(r.created_at), "MMM d")}</span>
              </div>
              <p className="mp-search-result-text" dangerouslySetInnerHTML={{
                __html: highlight(r.message_text, query).replace(
                  new RegExp(query, "gi"), m => `<mark style="background:rgba(124,58,237,0.3);color:#c084fc;border-radius:2px;padding:0 2px">${m}</mark>`
                )
              }} />
            </button>
          ))}
          {!query && (
            <div className="mp-search-hint">
              <Search style={{ width: 32, height: 32, opacity: 0.2 }} />
              <p>Type to search across all conversations</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   🧵  THREAD PANEL
══════════════════════════════════════════════════════════════ */
function ThreadPanel({ parentMessage, conversations, currentUserId, members, onClose }: {
  parentMessage: RtMessage;
  conversations: Conversation[];
  currentUserId: string;
  members: TeamMember[];
  onClose: () => void;
}) {
  const [replies, setReplies] = useState<RtMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadReplies = useCallback(async () => {
    const { data } = await supabase
      .from("team_messages" as any)
      .select("*")
      .eq("parent_id", parentMessage.id)
      .order("created_at", { ascending: true });
    setReplies((data || []) as RtMessage[]);
    setLoading(false);
  }, [parentMessage.id]);

  useEffect(() => { loadReplies(); }, [loadReplies]);
  useEffect(() => { scrollRef.current?.scrollIntoView({ behavior: "smooth" }); }, [replies.length]);

  const sendReply = async () => {
    if (!input.trim()) return;
    await supabase.from("team_messages" as any).insert({
      conversation_id: parentMessage.conversation_id,
      sender_id: currentUserId,
      message_text: input.trim(),
      parent_id: parentMessage.id,
    });
    setInput("");
    loadReplies();
  };

  const parentSender = parentMessage.sender?.full_name || parentMessage.sender?.email || "Unknown";
  const getInitials = (n: string) => n.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);

  return (
    <div className="mp-panel-overlay">
      <div className="mp-side-panel mp-thread-panel">
        <div className="mp-side-panel-hdr">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <MessageCircle style={{ width: 14, height: 14, color: "#818cf8" }} />
            <span className="mp-side-panel-title">Thread</span>
          </div>
          <button className="mp-side-panel-close" onClick={onClose}><X style={{ width: 14, height: 14 }} /></button>
        </div>
        <div className="mp-side-panel-body" style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
          {/* Parent */}
          <div className="mp-thread-parent">
            <div className="mp-av" style={{ width: 32, height: 32, fontSize: 12 }}>{getInitials(parentSender)}</div>
            <div>
              <p className="mp-sender" style={{ marginBottom: 4 }}>{parentSender}</p>
              <div className="mp-bubble mp-bubble--them" style={{ borderRadius: 12 }}>
                <p className="mp-bubble-text" dangerouslySetInnerHTML={{ __html: renderMarkdown(parentMessage.message_text) }} />
              </div>
            </div>
          </div>
          <div className="mp-thread-divider">
            <div className="mp-div-line" />
            <span className="mp-div-label">{replies.length} {replies.length === 1 ? "reply" : "replies"}</span>
            <div className="mp-div-line" />
          </div>
          {loading ? <div className="mp-center"><Loader2 className="mp-spin" /></div>
            : replies.map(r => {
              const isMe = r.sender_id === currentUserId;
              const name = r.sender?.full_name || r.sender?.email || "Unknown";
              return (
                <div key={r.id} className={cn("mp-msg-row", isMe ? "mp-msg-row--me" : "mp-msg-row--them")} style={{ marginBottom: 8 }}>
                  {!isMe && <div className="mp-av" style={{ width: 28, height: 28, fontSize: 10, marginRight: 6 }}>{getInitials(name)}</div>}
                  <div className={cn("mp-msg-body", isMe ? "mp-msg-body--me" : "mp-msg-body--them")}>
                    {!isMe && <p className="mp-sender">{name}</p>}
                    <div className={cn("mp-bubble", isMe ? "mp-bubble--me" : "mp-bubble--them")}>
                      <p className="mp-bubble-text" dangerouslySetInnerHTML={{ __html: renderMarkdown(r.message_text) }} />
                    </div>
                    <p className="mp-time" style={{ marginTop: 2 }}>{format(new Date(r.created_at), "h:mm a")}</p>
                  </div>
                </div>
              );
            })}
          <div ref={scrollRef} />
        </div>
        <div style={{ flexShrink: 0 }}>
          <RichComposer
            value={input}
            onChange={setInput}
            onSend={sendReply}
            onFileClick={() => {}}
            members={members}
            currentUserId={currentUserId}
            placeholder="Reply in thread…"
          />
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   🟢  PRESENCE + HOOKS
══════════════════════════════════════════════════════════════ */
function useOnlinePresence(teamId: string | undefined, currentUserId: string | undefined) {
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!teamId || !currentUserId) return;
    const ch = supabase.channel(`presence:team:${teamId}`, { config: { presence: { key: currentUserId } } });
    ch.on("presence", { event: "sync" }, () => setOnlineUsers(new Set(Object.keys(ch.presenceState()))))
      .on("presence", { event: "join" }, ({ key }: any) => setOnlineUsers(p => new Set([...p, key])))
      .on("presence", { event: "leave" }, ({ key }: any) => setOnlineUsers(p => { const s = new Set(p); s.delete(key); return s; }))
      .subscribe(async (st) => { if (st === "SUBSCRIBED") await ch.track({ user_id: currentUserId }); });
    return () => { ch.untrack(); supabase.removeChannel(ch); };
  }, [teamId, currentUserId]);
  const isOnline = useCallback((uid: string) => onlineUsers.has(uid), [onlineUsers]);
  return { onlineUsers, isOnline };
}

function useNotificationSound(userId: string | undefined) {
  const ready = useRef(false);
  useEffect(() => {
    if (!userId) return;
    const t = setTimeout(() => { ready.current = true; }, 2000);
    const ch = supabase.channel(`rt-notif-snd-${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        () => { if (ready.current) throttledSound(playAlertSound); })
      .subscribe();
    return () => { clearTimeout(t); supabase.removeChannel(ch); };
  }, [userId]);
}

function useRealtimeMessages(
  conversationId: string | null,
  currentUserId: string | undefined,
  profileCache: Map<string, { full_name: string | null; email: string | null }>,
  onAdd: (m: RtMessage) => void,
  onDelete: (id: string) => void,
  onEdit: (id: string, text: string) => void,
) {
  const onAddRef = useRef(onAdd);
  const onDeleteRef = useRef(onDelete);
  const onEditRef = useRef(onEdit);
  useEffect(() => { onAddRef.current = onAdd; }, [onAdd]);
  useEffect(() => { onDeleteRef.current = onDelete; }, [onDelete]);
  useEffect(() => { onEditRef.current = onEdit; }, [onEdit]);

  useEffect(() => {
    if (!conversationId) return;
    const ch = supabase.channel(`rt-msg-${conversationId}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "team_messages", filter: `conversation_id=eq.${conversationId}` },
        ({ new: row }: any) => {
          if (row?.parent_id) return; // threads handled separately
          const profile = profileCache.get(row.sender_id) ?? null;
          onAddRef.current({ ...row, sender: profile });
          if (row.sender_id !== currentUserId) throttledSound(playMessageSound);
        })
      .on("postgres_changes",
        { event: "DELETE", schema: "public", table: "team_messages", filter: `conversation_id=eq.${conversationId}` },
        ({ old: row }: any) => { if (row?.id) onDeleteRef.current(row.id); })
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "team_messages", filter: `conversation_id=eq.${conversationId}` },
        ({ new: row }: any) => { if (row?.id) onEditRef.current(row.id, row.message_text); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [conversationId, currentUserId]);
}

/* ══════════════════════════════════════════════════════════════
   🔔  CONTEXT MENU (extended)
══════════════════════════════════════════════════════════════ */
function CtxMenu({ isMe, pos, onCopy, onEdit, onDelete, onReply, onPin, onSave, onClose }: {
  isMe: boolean; pos: { x: number; y: number };
  onCopy(): void; onEdit?(): void; onDelete?(): void;
  onReply(): void; onPin(): void; onSave(): void; onClose(): void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose]);

  const items = [
    { icon: Reply, label: "Reply in Thread", fn: onReply, danger: false },
    { icon: Copy, label: "Copy Text", fn: onCopy, danger: false },
    { icon: Pin, label: "Pin Message", fn: onPin, danger: false },
    { icon: Bookmark, label: "Save Message", fn: onSave, danger: false },
    ...(isMe ? [
      { icon: Pencil, label: "Edit", fn: onEdit!, danger: false },
      { icon: Trash2, label: "Delete", fn: onDelete!, danger: true },
    ] : []),
  ];

  return (
    <div ref={ref} style={{ position: "fixed", left: Math.min(pos.x, window.innerWidth - 190), top: Math.min(pos.y, window.innerHeight - items.length * 36 - 16), zIndex: 9999 }} className="mp-ctxmenu">
      {items.map((a, i) => (
        <button key={i} onClick={() => { a.fn(); onClose(); }} className={cn("mp-ctx-item", a.danger && "mp-ctx-item--danger")}>
          <a.icon style={{ width: 13, height: 13 }} />{a.label}
        </button>
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   💬  CHAT THREAD  — main message area
══════════════════════════════════════════════════════════════ */
function ChatThread({ conversationId, conversations, onBack, isOnline, members, currentUserId }: {
  conversationId: string; conversations: Conversation[]; onBack?(): void;
  isOnline(uid: string): boolean; members: TeamMember[]; currentUserId: string;
}) {
  const qc = useQueryClient();
  const { messages: baseMessages, messagesLoading, sendMessage, readReceipts } = useConversationMessages(conversationId);
  const { typingUsers, sendTyping, sendStopTyping } = useTypingIndicator(conversationId);
  const { user } = useAuth();

  const [rtAdded, setRtAdded] = useState<RtMessage[]>([]);
  const [rtDeleted, setRtDeleted] = useState<Set<string>>(new Set());
  const [rtEdited, setRtEdited] = useState<Map<string, string>>(new Map());
  const [optDeleted, setOptDeleted] = useState<Set<string>>(new Set());

  const [input, setInput] = useState("");
  const [pendingFile, setPF] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editTxt, setEditTxt] = useState("");
  const [ctx, setCtx] = useState<{ id: string; x: number; y: number } | null>(null);
  const [replyTo, setReplyTo] = useState<{ id: string; text: string; sender: string } | null>(null);
  const [threadMsg, setThreadMsg] = useState<RtMessage | null>(null);
  const [showPinned, setShowPinned] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const editRef = useRef<HTMLInputElement>(null);
  const typingTimer = useRef<NodeJS.Timeout | null>(null);
  const lpTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [lpId, setLpId] = useState<string | null>(null);

  const convo = conversations.find(c => c.id === conversationId);
  const chatName = convo ? getConversationName(convo) : "Chat";
  const isGroup = convo?.is_group ?? false;
  const myName = user?.user_metadata?.full_name || user?.email || "You";

  // load mute pref
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.from("conversation_preferences" as any)
          .select("is_muted").eq("conversation_id", conversationId).eq("user_id", currentUserId).maybeSingle();
        setIsMuted(!!(data as any)?.is_muted);
      } catch { }
    })();
  }, [conversationId, currentUserId]);

  const toggleMute = async () => {
    const newVal = !isMuted;
    setIsMuted(newVal);
    try {
      await supabase.from("conversation_preferences" as any).upsert({
        conversation_id: conversationId,
        user_id: currentUserId,
        is_muted: newVal,
      });
      toast({ title: newVal ? "Conversation muted" : "Conversation unmuted" });
    } catch { }
  };

  const profileCache = useMemo(() => {
    const m = new Map<string, { full_name: string | null; email: string | null }>();
    baseMessages.forEach(msg => { if (msg.sender) m.set(msg.sender_id, msg.sender as any); });
    return m;
  }, [baseMessages]);

  const handleAdd = useCallback((msg: RtMessage) => {
    setRtAdded(prev => {
      if (prev.some(m => m.id === msg.id) || baseMessages.some(m => m.id === msg.id)) return prev;
      return [...prev, msg];
    });
    qc.invalidateQueries({ queryKey: ["team-conversations"] });
  }, [baseMessages, qc]);

  const handleDelete = useCallback((id: string) => {
    setRtDeleted(prev => new Set([...prev, id]));
    setOptDeleted(prev => new Set([...prev, id]));
  }, []);

  const handleEdit = useCallback((id: string, text: string) => {
    setRtEdited(prev => new Map(prev).set(id, text));
  }, []);

  useRealtimeMessages(conversationId, currentUserId, profileCache, handleAdd, handleDelete, handleEdit);

  const messages = useMemo(() => {
    const allDel = new Set([...rtDeleted, ...optDeleted]);
    const merged = [
      ...baseMessages.filter(m => !allDel.has(m.id) && !rtAdded.some(r => r.id === m.id) && !(m as any).parent_id),
      ...rtAdded.filter(m => !allDel.has(m.id)),
    ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    return merged.map(m => {
      const edited = rtEdited.get(m.id);
      return edited !== undefined ? { ...m, message_text: edited } : m;
    });
  }, [baseMessages, rtAdded, rtDeleted, rtEdited, optDeleted]);

  const otherUserId = !isGroup ? convo?.participants?.[0]?.user_id : undefined;
  const otherOnline = otherUserId ? isOnline(otherUserId) : false;

  useEffect(() => { scrollRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length]);
  useEffect(() => { if (editId && editRef.current) editRef.current.focus(); }, [editId]);

  const onInputChange = (v: string) => {
    setInput(v);
    if (v.trim()) {
      sendTyping(myName);
      if (typingTimer.current) clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => sendStopTyping(), 2000);
    } else sendStopTyping();
  };

  const uploadFile = async (file: File) => {
    const ext = file.name.split(".").pop() ?? "bin";
    const path = `${conversationId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from("team-attachments").upload(path, file, { contentType: file.type });
    if (error) throw error;
    const { data } = supabase.storage.from("team-attachments").getPublicUrl(path);
    return { url: data.publicUrl, name: file.name, type: file.type };
  };

  const handleSend = async () => {
    if (!input.trim() && !pendingFile) return;
    setUploading(true);
    try {
      let fd: { url: string; name: string; type: string } | undefined;
      if (pendingFile) fd = await uploadFile(pendingFile);
      sendMessage.mutate({
        text: input.trim() || (pendingFile?.name ?? "Attachment"),
        file_url: fd?.url,
        file_name: fd?.name,
        file_type: fd?.type,
      });
      setInput(""); setPF(null); setReplyTo(null); sendStopTyping();
    } finally { setUploading(false); }
  };

  const copyMsg = (t: string) => { navigator.clipboard.writeText(t); toast({ title: "Copied" }); };
  const startEdit = (id: string, t: string) => { setEditId(id); setEditTxt(t); };

  const saveEdit = async (id: string) => {
    if (!editTxt.trim()) return;
    const prev = messages.find(m => m.id === id)?.message_text ?? "";
    setRtEdited(p => new Map(p).set(id, editTxt.trim()));
    setEditId(null); setEditTxt("");
    try {
      await supabase.from("team_messages").update({ message_text: editTxt.trim() }).eq("id", id);
      toast({ title: "Updated" });
    } catch {
      setRtEdited(p => new Map(p).set(id, prev));
      toast({ title: "Failed to update", variant: "destructive" });
    }
  };

  const delMsg = useCallback(async (id: string) => {
    setOptDeleted(p => new Set([...p, id]));
    setCtx(null); setLpId(null);
    try {
      await supabase.from("team_messages").delete().eq("id", id);
      toast({ title: "Deleted" });
    } catch {
      setOptDeleted(p => { const s = new Set(p); s.delete(id); return s; });
      toast({ title: "Failed to delete", variant: "destructive" });
    }
  }, []);

  const pinMsg = async (msgId: string, text: string) => {
    try {
      await supabase.from("pinned_messages" as any).insert({
        message_id: msgId, conversation_id: conversationId,
        pinned_by: currentUserId, message_preview: text.slice(0, 100),
      });
      toast({ title: "Message pinned", description: "Pinned messages appear in the 📌 panel" });
    } catch { toast({ title: "Could not pin message", variant: "destructive" }); }
  };

  const saveMsg = async (msgId: string) => {
    try {
      await supabase.from("saved_messages" as any).insert({ message_id: msgId, user_id: currentUserId });
      toast({ title: "Message saved", description: "View saved messages in the Saved section" });
    } catch { toast({ title: "Could not save message", variant: "destructive" }); }
  };

  const onCtx = (e: React.MouseEvent, id: string) => { e.preventDefault(); setCtx({ id, x: e.clientX, y: e.clientY }); };
  const onTouchStart = (id: string) => { lpTimer.current = setTimeout(() => setLpId(id), 500); };
  const onTouchEnd = () => { if (lpTimer.current) clearTimeout(lpTimer.current); };
  const getInitials = (n: string) => n.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);

  const grouped = useMemo(() => {
    const g: { label: string; msgs: typeof messages }[] = []; let last = "";
    messages.forEach(m => {
      const d = new Date(m.created_at);
      const label = isToday(d) ? "Today" : isYesterday(d) ? "Yesterday" : format(d, "MMMM d, yyyy");
      if (label !== last) { g.push({ label, msgs: [] }); last = label; }
      g[g.length - 1].msgs.push(m);
    });
    return g;
  }, [messages]);

  const lpMsg = messages.find(m => m.id === lpId);
  const lpIsMe = lpMsg?.sender_id === currentUserId;

  function readStatus(at: string, sid: string, uid: string, rr: ReadReceipt[]): "none" | "sent" | "read" {
    if (sid !== uid) return "none";
    return rr.some(r => r.last_read_at && new Date(r.last_read_at) >= new Date(at)) ? "read" : "sent";
  }

  const isImg = (t?: string | null) => !!t?.startsWith("image/");

  return (
    <div className="mp-thread">
      {/* Header */}
      <div className="mp-thread-header">
        <button className="mp-back-btn" onClick={onBack}><ArrowLeft style={{ width: 16, height: 16 }} /></button>
        <div style={{ position: "relative", flexShrink: 0 }}>
          <div className="mp-thread-av">
            {isGroup ? <Users style={{ width: 14, height: 14, color: "#a78bfa" }} />
              : <span style={{ fontSize: 12, fontWeight: 700, color: "#818cf8" }}>{convo ? getConversationInitials(convo) : "?"}</span>}
          </div>
          {!isGroup && otherUserId && (
            <span style={{ position: "absolute", bottom: -1, right: -1 }}>
              <span style={{ display: "inline-block", width: 9, height: 9, borderRadius: "50%", background: otherOnline ? "#22c55e" : "rgba(255,255,255,0.13)", border: `2px solid ${otherOnline ? "rgba(34,197,94,0.22)" : "rgba(255,255,255,0.04)"}` }} />
            </span>
          )}
        </div>
        <div className="mp-thread-info">
          <p className="mp-thread-name">{chatName}</p>
          {typingUsers.length > 0
            ? <p className="mp-thread-typing">typing…</p>
            : !isGroup
              ? <p className="mp-thread-sub" style={{ color: otherOnline ? "#22c55e" : "rgba(255,255,255,0.28)" }}>
                  {otherOnline ? "● Online now" : "○ Offline"}
                </p>
              : <p className="mp-thread-sub" style={{ color: "rgba(255,255,255,0.3)" }}>{(convo?.participants.length ?? 0) + 1} members</p>}
        </div>
        {/* Header actions */}
        <div className="mp-thread-actions">
          <button className={cn("mp-thread-action", showPinned && "mp-thread-action--active")} title="Pinned messages" onClick={() => setShowPinned(p => !p)}>
            <Pin style={{ width: 14, height: 14 }} />
          </button>
          <button className={cn("mp-thread-action", isMuted && "mp-thread-action--muted")} title={isMuted ? "Unmute" : "Mute"} onClick={toggleMute}>
            {isMuted ? <BellOff style={{ width: 14, height: 14 }} /> : <Bell style={{ width: 14, height: 14 }} />}
          </button>
        </div>
        {typingUsers.length > 0 && <div className="mp-typing-dots"><span /><span /><span /></div>}
      </div>

      {/* Pinned Panel */}
      {showPinned && <PinnedPanel conversationId={conversationId} onClose={() => setShowPinned(false)} />}

      {/* Thread Panel */}
      {threadMsg && (
        <ThreadPanel
          parentMessage={threadMsg}
          conversations={conversations}
          currentUserId={currentUserId}
          members={members}
          onClose={() => setThreadMsg(null)}
        />
      )}

      {/* Messages */}
      <div className="mp-messages">
        {messagesLoading ? (
          <div className="mp-center"><Loader2 className="mp-spin" /></div>
        ) : messages.length === 0 ? (
          <div className="mp-empty-thread">
            <div className="mp-empty-icon"><MessageSquare style={{ width: 22, height: 22, color: "#7c3aed" }} /></div>
            <p className="mp-empty-title">No messages yet</p>
            <p className="mp-empty-sub">Start the conversation below</p>
          </div>
        ) : grouped.map(group => (
          <div key={group.label}>
            <div className="mp-date-div">
              <div className="mp-div-line" /><span className="mp-div-label">{group.label}</span><div className="mp-div-line" />
            </div>
            {group.msgs.map((msg, idx) => {
              const isMe = msg.sender_id === currentUserId;
              const status = readStatus(msg.created_at, msg.sender_id, currentUserId, readReceipts);
              const showRec = isMe && (!group.msgs[idx + 1] || group.msgs[idx + 1].sender_id !== currentUserId);
              const samePrev = group.msgs[idx - 1]?.sender_id === msg.sender_id;
              const isEd = editId === msg.id;
              const isDel = optDeleted.has(msg.id);
              const isLive = rtAdded.some(r => r.id === msg.id);
              const name = msg.sender?.full_name || msg.sender?.email || "Unknown";
              const hasThread = false; // would query thread count in production

              return (
                <div key={msg.id}
                  className={cn("mp-msg-row", isMe ? "mp-msg-row--me" : "mp-msg-row--them", samePrev && "mp-msg-row--same", isLive && !isMe && "mp-msg-row--new")}
                  style={{ opacity: isDel ? 0.2 : 1, transition: "opacity 0.15s ease", pointerEvents: isDel ? "none" : undefined }}
                  onContextMenu={e => !isDel && onCtx(e, msg.id)}
                  onTouchStart={() => !isDel && onTouchStart(msg.id)}
                  onTouchEnd={onTouchEnd} onTouchMove={onTouchEnd}>

                  {!isMe && !samePrev && (
                    <div style={{ position: "relative", flexShrink: 0 }}>
                      <div className="mp-av">{getInitials(name)}</div>
                    </div>
                  )}
                  {!isMe && samePrev && <div className="mp-av-sp" />}

                  <div className={cn("mp-msg-body", isMe ? "mp-msg-body--me" : "mp-msg-body--them")}>
                    {!isMe && !samePrev && <p className="mp-sender">{name}</p>}
                    {isEd ? (
                      <div className="mp-edit-wrap">
                        <input ref={editRef} value={editTxt} onChange={e => setEditTxt(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") saveEdit(msg.id); if (e.key === "Escape") { setEditId(null); setEditTxt(""); } }}
                          className="mp-edit-input" />
                        <button className="mp-edit-save" onClick={() => saveEdit(msg.id)}>Save</button>
                        <button className="mp-edit-cancel" onClick={() => { setEditId(null); setEditTxt(""); }}>×</button>
                      </div>
                    ) : (
                      <div className={cn("mp-bubble", isMe ? "mp-bubble--me" : "mp-bubble--them")}>
                        {msg.file_url && (
                          <div className="mp-attach">
                            {isImg((msg as any).file_type)
                              ? <a href={msg.file_url} target="_blank" rel="noopener noreferrer"><img src={msg.file_url} alt={(msg as any).file_name ?? "img"} className="mp-attach-img" /></a>
                              : <a href={msg.file_url} target="_blank" rel="noopener noreferrer" className={cn("mp-attach-file", isMe && "mp-attach-file--me")}>
                                  <FileText style={{ width: 14, height: 14, flexShrink: 0 }} /><span className="mp-attach-name">{(msg as any).file_name ?? "File"}</span>
                                </a>}
                          </div>
                        )}
                        {(!msg.file_url || msg.message_text !== (msg as any).file_name) && (
                          <p className="mp-bubble-text" dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.message_text) }} />
                        )}
                      </div>
                    )}

                    {/* Reactions */}
                    {!isDel && !isEd && (
                      <ReactionsBar messageId={msg.id} currentUserId={currentUserId} />
                    )}

                    {/* Thread reply count */}
                    {!isDel && !isEd && (
                      <button className="mp-reply-count" onClick={() => setThreadMsg(msg as RtMessage)}>
                        <Reply style={{ width: 10, height: 10 }} />
                        <span>Reply in thread</span>
                      </button>
                    )}

                    {/* Hover actions (desktop) */}
                    {isMe && !isEd && !isDel && (
                      <div className="mp-hover-acts">
                        <button className="mp-ha" title="React" onClick={() => {}}><Smile style={{ width: 11, height: 11 }} /></button>
                        <button className="mp-ha" title="Reply" onClick={() => setThreadMsg(msg as RtMessage)}><Reply style={{ width: 11, height: 11 }} /></button>
                        <button className="mp-ha" title="Copy" onClick={() => copyMsg(msg.message_text)}><Copy style={{ width: 11, height: 11 }} /></button>
                        <button className="mp-ha" title="Pin" onClick={() => pinMsg(msg.id, msg.message_text)}><Pin style={{ width: 11, height: 11 }} /></button>
                        <button className="mp-ha" title="Save" onClick={() => saveMsg(msg.id)}><Bookmark style={{ width: 11, height: 11 }} /></button>
                        <button className="mp-ha" title="Edit" onClick={() => startEdit(msg.id, msg.message_text)}><Pencil style={{ width: 11, height: 11 }} /></button>
                        <button className="mp-ha mp-ha--del" title="Delete" onClick={() => delMsg(msg.id)}><Trash2 style={{ width: 11, height: 11 }} /></button>
                      </div>
                    )}

                    <div className={cn("mp-meta", isMe && "mp-meta--me")}>
                      <span className="mp-time">{format(new Date(msg.created_at), "h:mm a")}</span>
                      {showRec && status === "read" && <CheckCheck style={{ width: 12, height: 12, color: "#818cf8" }} />}
                      {showRec && status === "sent" && <Check style={{ width: 12, height: 12, color: "rgba(255,255,255,0.3)" }} />}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
        <div ref={scrollRef} />
      </div>

      {/* Context Menu */}
      {ctx && (() => {
        const ctxMsg = messages.find(m => m.id === ctx.id);
        const ctxIsMe = ctxMsg?.sender_id === currentUserId;
        return (
          <CtxMenu
            isMe={ctxIsMe ?? false}
            pos={{ x: ctx.x, y: ctx.y }}
            onCopy={() => copyMsg(ctxMsg?.message_text ?? "")}
            onEdit={() => { if (ctxMsg) startEdit(ctxMsg.id, ctxMsg.message_text); }}
            onDelete={() => delMsg(ctx.id)}
            onReply={() => {
              if (ctxMsg) setThreadMsg(ctxMsg as RtMessage);
            }}
            onPin={() => { if (ctxMsg) pinMsg(ctxMsg.id, ctxMsg.message_text); }}
            onSave={() => saveMsg(ctx.id)}
            onClose={() => setCtx(null)}
          />
        );
      })()}

      {/* Mobile long-press sheet */}
      {lpId && lpMsg && (
        <div className="mp-sheet-overlay" onClick={() => setLpId(null)}>
          <div className="mp-sheet" onClick={e => e.stopPropagation()}>
            <div className="mp-sheet-handle" />
            <div className="mp-sheet-emoji-row">
              {["👍", "❤️", "😂", "🎉", "🔥", "✅"].map(e => (
                <button key={e} className="mp-sheet-emoji" onClick={async () => {
                  await supabase.from("message_reactions" as any).insert({ message_id: lpId, user_id: currentUserId, emoji: e });
                  setLpId(null);
                }}>{e}</button>
              ))}
            </div>
            <div className="mp-sheet-preview"><p className="mp-sheet-preview-txt">{lpMsg.message_text.slice(0, 70)}</p></div>
            {[
              { icon: Reply, label: "Reply in Thread", fn: () => { setThreadMsg(lpMsg as RtMessage); setLpId(null); }, danger: false },
              { icon: Copy, label: "Copy text", fn: () => { copyMsg(lpMsg.message_text); setLpId(null); }, danger: false },
              { icon: Pin, label: "Pin message", fn: () => { pinMsg(lpId, lpMsg.message_text); setLpId(null); }, danger: false },
              { icon: Bookmark, label: "Save message", fn: () => { saveMsg(lpId); setLpId(null); }, danger: false },
              ...(lpIsMe ? [
                { icon: Pencil, label: "Edit message", fn: () => { startEdit(lpMsg.id, lpMsg.message_text); setLpId(null); }, danger: false },
                { icon: Trash2, label: "Delete message", fn: () => { delMsg(lpId); }, danger: true },
              ] : []),
            ].map((a, i) => (
              <button key={i} className={cn("mp-sheet-btn", a.danger && "mp-sheet-btn--danger")} onClick={a.fn}>
                <a.icon style={{ width: 18, height: 18 }} />{a.label}
              </button>
            ))}
            <button className="mp-sheet-cancel" onClick={() => setLpId(null)}>Cancel</button>
          </div>
        </div>
      )}

      {/* File preview */}
      {pendingFile && (
        <div className="mp-file-prev">
          {pendingFile.type.startsWith("image/") ? <ImageIcon style={{ width: 14, height: 14, color: "#818cf8", flexShrink: 0 }} /> : <FileText style={{ width: 14, height: 14, color: "#818cf8", flexShrink: 0 }} />}
          <span className="mp-fp-name">{pendingFile.name}</span>
          <span className="mp-fp-size">{(pendingFile.size / 1024).toFixed(0)} KB</span>
          <button className="mp-fp-rm" onClick={() => setPF(null)}><X style={{ width: 12, height: 12 }} /></button>
        </div>
      )}

      {/* Input */}
      <input type="file" ref={fileRef} className="sr-only"
        onChange={e => { const f = e.target.files?.[0]; if (f && f.size <= 20 * 1024 * 1024) setPF(f); e.target.value = ""; }}
        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv" />
      <RichComposer
        value={input}
        onChange={onInputChange}
        onSend={handleSend}
        onFileClick={() => fileRef.current?.click()}
        members={members}
        currentUserId={currentUserId}
        uploading={uploading}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
      />
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   🔔  NOTIFICATIONS PANEL
══════════════════════════════════════════════════════════════ */
const notifIcons: Record<string, typeof Bell> = { comment: MessageSquare, coaching: TrendingUp, mention: AtSign, system: AlertCircle };

function NotifsPanel() {
  const { notifications, notificationsLoading, unreadCount, markRead, markAllRead } = useNotifications();
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const filtered = notifications.filter(n => filter === "all" || !n.is_read);
  return (
    <div className="mp-notif-panel">
      <div className="mp-notif-hdr">
        <div className="mp-notif-hdr-l">
          <span className="mp-notif-title">Notifications</span>
          {unreadCount > 0 && <span className="mp-notif-badge">{unreadCount}</span>}
        </div>
        <div className="mp-notif-hdr-r">
          {(["all", "unread"] as const).map(f => (
            <button key={f} className={cn("mp-filter-btn", filter === f && "mp-filter-btn--active")} onClick={() => setFilter(f)}>
              {f === "all" ? "All" : "Unread"}
            </button>
          ))}
          {unreadCount > 0 && (
            <button className="mp-markall-btn" onClick={() => markAllRead.mutate()} disabled={markAllRead.isPending}>
              <CheckCheck style={{ width: 11, height: 11 }} /> All read
            </button>
          )}
        </div>
      </div>
      <div className="mp-notif-list">
        {notificationsLoading ? <div className="mp-center"><Loader2 className="mp-spin" /></div>
          : filtered.length === 0 ? (
            <div className="mp-notif-empty">
              <Bell style={{ width: 28, height: 28, color: "rgba(124,58,237,0.4)" }} />
              <p>{filter === "unread" ? "No unread notifications" : "You're all caught up"}</p>
            </div>
          ) : filtered.map(n => {
            const Icon = notifIcons[n.type] ?? Bell;
            return (
              <div key={n.id} className={cn("mp-notif-item", !n.is_read && "mp-notif-item--unread")} onClick={() => !n.is_read && markRead.mutate(n.id)}>
                <div className="mp-notif-icon"><Icon style={{ width: 14, height: 14 }} /></div>
                <div className="mp-notif-body">
                  <p className={cn("mp-notif-text", !n.is_read && "mp-notif-text--bold")}>{n.message}</p>
                  <p className="mp-notif-time">{format(new Date(n.created_at), "MMM d, h:mm a")}</p>
                </div>
                {!n.is_read && <div className="mp-notif-dot" />}
              </div>
            );
          })}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   💬  CONVO LIST PANEL (with channel/DM grouping)
══════════════════════════════════════════════════════════════ */
function ConvoListPanel({ convos, loading, selected, onSelect, isOnline }: {
  convos: Conversation[]; loading: boolean; selected: string | null;
  onSelect(id: string): void; isOnline(uid: string): boolean;
}) {
  const dms = convos.filter(c => !c.is_group);
  const groups = convos.filter(c => c.is_group);
  const getInitials = (n: string) => n.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
  const formatTime = (d: string) => {
    const dt = new Date(d);
    if (isToday(dt)) return format(dt, "h:mm a");
    if (isYesterday(dt)) return "Yesterday";
    return format(dt, "MMM d");
  };

  const renderConvo = (c: Conversation) => {
    const name = getConversationName(c);
    const isSel = selected === c.id;
    const other = !c.is_group && c.participants[0];
    const partOnline = other ? isOnline(other.user_id) : false;
    return (
      <button key={c.id} className={cn("mp-convo-item", isSel && "mp-convo-item--active")} onClick={() => onSelect(c.id)}>
        <div className="mp-convo-av-wrap">
          <div className={cn("mp-convo-av", c.is_group && "mp-convo-av--group")}>
            {c.is_group ? <Users style={{ width: 14, height: 14 }} /> : getInitials(name)}
          </div>
          {!c.is_group && <span style={{ position: "absolute", bottom: -1, right: -1 }}>
            <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: partOnline ? "#22c55e" : "rgba(255,255,255,0.13)", border: "2px solid #0b0f1c" }} />
          </span>}
          {c.unread_count > 0 && <div className="mp-convo-unread">{c.unread_count > 9 ? "9+" : c.unread_count}</div>}
        </div>
        <div className="mp-convo-info">
          <div className="mp-convo-row1">
            <span className={cn("mp-convo-name", c.unread_count > 0 && "mp-convo-name--unread")}>{name}</span>
            {c.last_message && <span className="mp-convo-time">{formatTime(c.last_message.created_at)}</span>}
          </div>
          {!c.is_group ? (
            <p className="mp-convo-preview" style={{ color: partOnline ? "#22c55e" : undefined }}>
              {partOnline ? "● Online" : (c.last_message?.message_text ?? "No messages yet")}
            </p>
          ) : c.last_message ? (
            <p className={cn("mp-convo-preview", c.unread_count > 0 && "mp-convo-preview--unread")}>{c.last_message.message_text}</p>
          ) : null}
        </div>
        <ChevronRight className="mp-chevron" style={{ width: 14, height: 14 }} />
      </button>
    );
  };

  return (
    <div className="mp-convo-panel">
      <div className="mp-convo-items">
        {loading ? <div className="mp-center"><Loader2 className="mp-spin" /></div>
          : convos.length === 0 ? (
            <div className="mp-convo-empty">
              <MessageSquare style={{ width: 26, height: 26, color: "rgba(124,58,237,0.3)" }} />
              <p>No conversations yet</p>
            </div>
          ) : (
            <>
              {groups.length > 0 && (
                <div className="mp-convo-section">
                  <div className="mp-convo-section-hdr">
                    <Hash style={{ width: 11, height: 11 }} />
                    <span>Group Chats</span>
                    <span className="mp-convo-section-count">{groups.length}</span>
                  </div>
                  {groups.map(renderConvo)}
                </div>
              )}
              {dms.length > 0 && (
                <div className="mp-convo-section">
                  <div className="mp-convo-section-hdr">
                    <MessageSquare style={{ width: 11, height: 11 }} />
                    <span>Direct Messages</span>
                    <span className="mp-convo-section-count">{dms.length}</span>
                  </div>
                  {dms.map(renderConvo)}
                </div>
              )}
            </>
          )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   🆕  NEW CONVO DIALOG
══════════════════════════════════════════════════════════════ */
function NewConvoDialog({ open, onClose, members, currentUserId, teamId, conversations, refetchConversations, onCreated, isOnline }: {
  open: boolean; onClose(): void; members: TeamMember[]; currentUserId: string; teamId: string;
  conversations: Conversation[]; refetchConversations(): void; onCreated(id: string): void;
  isOnline(uid: string): boolean;
}) {
  const { startConversation } = useConversationMessages(null);
  const [sel, setSel] = useState<string[]>([]);
  const others = members.filter(m => m.user_id !== currentUserId && m.status === "active");
  const toggle = (uid: string) => setSel(p => p.includes(uid) ? p.filter(x => x !== uid) : [...p, uid]);
  const handleStart = async () => {
    if (!sel.length) return;
    try {
      if (sel.length === 1) {
        const ex = conversations.find(c => !c.is_group && c.participants.length === 1 && c.participants.some(p => p.user_id === sel[0]));
        if (ex) { setSel([]); onCreated(ex.id); return; }
      }
      const id = await startConversation.mutateAsync({ teamId, memberIds: sel });
      refetchConversations(); setSel([]); onCreated(id);
      toast({ title: "Conversation started" });
    } catch (e: any) { toast({ title: "Could not start chat", description: e?.message, variant: "destructive" }); }
  };
  const getInitials = (n: string) => n.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { setSel([]); onClose(); } }}>
      <DialogContent className="sm:max-w-sm" style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16 }}>
        <DialogHeader><DialogTitle style={{ color: "#f0f6fc", fontFamily: "'Bricolage Grotesque',sans-serif" }}>New Conversation</DialogTitle></DialogHeader>
        {sel.length > 1 && <p className="text-xs text-slate-400 flex items-center gap-1.5 px-1"><Users className="w-3.5 h-3.5" /> Group · {sel.length} members</p>}
        <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
          {others.length === 0 ? <p className="text-sm text-slate-500 text-center py-6">No other members.</p>
            : others.map(m => {
              const name = m.profile?.full_name || m.invited_email || "Unknown";
              const chk = sel.includes(m.user_id);
              return (
                <div key={m.id} onClick={() => toggle(m.user_id)}
                  className={cn("flex items-center gap-3 p-2.5 rounded-xl cursor-pointer transition-all select-none", chk ? "bg-violet-500/15 border border-violet-500/30" : "hover:bg-white/[0.04] border border-transparent")}>
                  <Checkbox checked={chk} className="pointer-events-none" />
                  <div style={{ position: "relative", flexShrink: 0 }}>
                    <Avatar className="h-8 w-8"><AvatarFallback className="bg-violet-500/20 text-violet-400 text-xs font-bold">{getInitials(name)}</AvatarFallback></Avatar>
                    <span style={{ position: "absolute", bottom: -1, right: -1, width: 9, height: 9, borderRadius: "50%", background: isOnline(m.user_id) ? "#22c55e" : "rgba(255,255,255,0.13)", border: "2px solid #0d1117", display: "inline-block" }} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-200">{name}</p>
                    <p className="text-[11px] font-semibold" style={{ color: isOnline(m.user_id) ? "#22c55e" : "rgba(255,255,255,0.25)" }}>
                      {isOnline(m.user_id) ? "● Online" : "○ Offline"}
                    </p>
                  </div>
                </div>
              );
            })}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => { setSel([]); onClose(); }}>Cancel</Button>
          <Button size="sm" disabled={!sel.length || startConversation.isPending} onClick={handleStart} style={{ background: "linear-gradient(135deg,#7c3aed,#6d28d9)" }}>
            {sel.length > 1 ? "Create Group" : "Start Chat"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ══════════════════════════════════════════════════════════════
   🏠  MAIN PAGE
══════════════════════════════════════════════════════════════ */
export default function MessagesPage() {
  const { user } = useAuth();
  const { team, members } = useTeam();
  const { conversations, conversationsLoading, totalUnread, refetchConversations } = useTeamMessaging(team?.id);
  const { unreadCount: notifCount } = useNotifications();
  const { isOnline, onlineUsers } = useOnlinePresence(team?.id, user?.id);

  useNotificationSound(user?.id);

  const [selected, setSelected] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [tab, setTab] = useState<"chats" | "notifs" | "saved">("chats");
  const [mobileScr, setMobileScr] = useState<"list" | "thread">("list");
  const [showSearch, setShowSearch] = useState(false);

  const selectConvo = (id: string) => { setSelected(id); setMobileScr("thread"); setTab("chats"); };
  const goBack = () => setMobileScr("list");
  const totalBadge = totalUnread + notifCount;

  const onlineCount = useMemo(() =>
    members.filter(m => m.user_id !== user?.id && isOnline(m.user_id)).length,
    [members, onlineUsers, user?.id]
  );

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;1,400&family=Bricolage+Grotesque:wght@600;700;800&display=swap');

        .mp-page{
          --bg0:#060912;--bg1:#0b0f1c;--bg2:#0f1424;
          --border:rgba(255,255,255,0.07);--border2:rgba(255,255,255,0.04);
          --ac:#7c3aed;--ac-glow:rgba(124,58,237,0.35);--ac-soft:rgba(124,58,237,0.12);
          --t1:#f0f6fc;--t2:rgba(255,255,255,0.6);--t3:rgba(255,255,255,0.3);--t4:rgba(255,255,255,0.14);
          display:flex;flex-direction:column;height:calc(100dvh - 4rem);margin:-24px;overflow:hidden;
          background:var(--bg0);font-family:'DM Sans',system-ui,sans-serif;
        }
        @media(max-width:767px){.mp-page{margin:-16px;height:calc(100dvh - 3.5rem);padding-bottom:58px;}}

        @keyframes mpSpin{to{transform:rotate(360deg)}}
        @keyframes mpBounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-4px)}}
        @keyframes mpSheetUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
        @keyframes mpFade{from{opacity:0}to{opacity:1}}
        @keyframes mpPop{from{opacity:0;transform:scale(0.94) translateY(5px)}to{opacity:1;transform:scale(1) translateY(0)}}
        @keyframes mpSlideIn{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}

        /* ── TOP BAR ── */
        .mp-topbar{display:flex;align-items:center;justify-content:space-between;padding:0 20px;height:56px;flex-shrink:0;background:rgba(11,15,28,0.96);border-bottom:1px solid var(--border);backdrop-filter:blur(20px);}
        .mp-topbar-l{display:flex;align-items:center;gap:10px;}
        .mp-topbar-icon{width:32px;height:32px;border-radius:9px;background:var(--ac-soft);border:1px solid rgba(124,58,237,0.25);display:flex;align-items:center;justify-content:center;flex-shrink:0;}
        .mp-topbar-title{font-size:15px;font-weight:700;color:var(--t1);font-family:'Bricolage Grotesque',sans-serif;margin:0;}
        .mp-topbar-badge{font-size:10px;font-weight:700;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#fff;padding:2px 8px;border-radius:20px;box-shadow:0 2px 8px var(--ac-glow);}
        .mp-online-pill{display:inline-flex;align-items:center;gap:5px;background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.18);border-radius:20px;padding:2px 10px 2px 7px;font-size:11px;font-weight:600;color:#22c55e;}
        .mp-online-dot{width:6px;height:6px;border-radius:50%;background:#22c55e;animation:mpBounce 2s ease-in-out infinite;flex-shrink:0;}
        .mp-topbar-actions{display:flex;align-items:center;gap:6px;}
        .mp-topbar-btn{width:32px;height:32px;border-radius:8px;background:rgba(255,255,255,0.04);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--t3);transition:.15s;}
        .mp-topbar-btn:hover{background:rgba(255,255,255,0.08);color:var(--t1);}
        .mp-new-btn{display:flex;align-items:center;gap:6px;background:linear-gradient(135deg,#7c3aed,#6d28d9);border:none;border-radius:9px;padding:7px 14px;color:#fff;font-size:12px;font-weight:600;cursor:pointer;box-shadow:0 3px 12px var(--ac-glow);font-family:'DM Sans',sans-serif;transition:transform .15s,box-shadow .15s;}
        .mp-new-btn:hover{transform:translateY(-1px);box-shadow:0 6px 18px var(--ac-glow);}
        @media(max-width:480px){.mp-new-btn span{display:none;}.mp-new-btn{width:34px;height:34px;padding:0;border-radius:50%;justify-content:center;}}

        /* ── BODY ── */
        .mp-body{display:flex;flex:1;min-height:0;}
        .mp-sidebar{width:300px;flex-shrink:0;display:flex;flex-direction:column;border-right:1px solid var(--border);background:var(--bg1);}
        @media(max-width:767px){.mp-sidebar{width:100%;border-right:none;}.mp-sidebar--hidden{display:none;}}

        /* ── TABS ── */
        .mp-tabs{display:flex;gap:4px;padding:8px 10px;border-bottom:1px solid var(--border2);flex-shrink:0;}
        .mp-tab{flex:1;display:flex;align-items:center;justify-content:center;gap:5px;padding:7px 0;border-radius:8px;background:transparent;border:1px solid transparent;color:var(--t3);font-size:12px;font-weight:600;cursor:pointer;transition:all .15s;font-family:'DM Sans',sans-serif;}
        .mp-tab--active{background:var(--ac-soft);border-color:rgba(124,58,237,0.25);color:#a78bfa;}
        .mp-tab-badge{background:var(--ac);color:#fff;font-size:9px;font-weight:700;padding:1px 5px;border-radius:10px;}

        /* ── CONVO LIST ── */
        .mp-convo-panel{display:flex;flex-direction:column;flex:1;min-height:0;}
        .mp-convo-items{flex:1;overflow-y:auto;padding:4px 6px 8px;}
        .mp-convo-empty{display:flex;flex-direction:column;align-items:center;gap:8px;padding:32px 16px;color:var(--t3);font-size:12px;}
        .mp-convo-section{margin-bottom:8px;}
        .mp-convo-section-hdr{display:flex;align-items:center;gap:6px;padding:6px 10px 4px;font-size:10px;font-weight:700;color:var(--t4);text-transform:uppercase;letter-spacing:.08em;}
        .mp-convo-section-count{margin-left:auto;background:var(--ac-soft);color:#a78bfa;font-size:9px;padding:1px 6px;border-radius:10px;}
        .mp-convo-item{width:100%;display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:10px;border:1px solid transparent;background:transparent;cursor:pointer;text-align:left;transition:all .13s;margin-bottom:2px;font-family:'DM Sans',sans-serif;}
        .mp-convo-item:hover{background:rgba(255,255,255,0.03);}
        .mp-convo-item--active{background:var(--ac-soft)!important;border-color:rgba(124,58,237,0.22)!important;}
        .mp-convo-av-wrap{position:relative;flex-shrink:0;}
        .mp-convo-av{width:38px;height:38px;border-radius:11px;background:rgba(124,58,237,0.18);border:1px solid rgba(124,58,237,0.2);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#a78bfa;}
        .mp-convo-av--group{background:rgba(139,92,246,0.15);color:#c084fc;}
        .mp-convo-unread{position:absolute;top:-4px;left:-4px;min-width:16px;height:16px;border-radius:8px;background:linear-gradient(135deg,#7c3aed,#6d28d9);display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#fff;padding:0 3px;}
        .mp-convo-info{flex:1;min-width:0;}
        .mp-convo-row1{display:flex;justify-content:space-between;align-items:baseline;gap:4px;}
        .mp-convo-name{font-size:13px;font-weight:500;color:rgba(255,255,255,0.7);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .mp-convo-name--unread{font-weight:700;color:var(--t1);}
        .mp-convo-time{font-size:10px;color:var(--t3);flex-shrink:0;}
        .mp-convo-preview{font-size:11px;color:var(--t3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px;}
        .mp-convo-preview--unread{color:rgba(255,255,255,0.5);font-weight:500;}
        .mp-chevron{color:var(--t4);flex-shrink:0;}
        @media(min-width:768px){.mp-chevron{display:none;}}

        /* ── RIGHT PANEL ── */
        .mp-right{flex:1;display:flex;flex-direction:column;min-width:0;background:rgba(6,9,18,0.7);}
        @media(max-width:767px){.mp-right--hidden{display:none;}}
        .mp-right-empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:40px;}
        .mp-re-icon{width:68px;height:68px;border-radius:20px;margin-bottom:18px;background:rgba(124,58,237,0.08);border:1px solid rgba(124,58,237,0.15);display:flex;align-items:center;justify-content:center;}
        .mp-right-empty h3{font-size:15px;font-weight:700;color:#64748b;font-family:'Bricolage Grotesque',sans-serif;margin:0 0 6px;}
        .mp-right-empty p{font-size:12px;color:var(--t4);max-width:240px;line-height:1.6;margin:0 0 20px;}
        .mp-re-btn{display:flex;align-items:center;gap:7px;background:linear-gradient(135deg,#7c3aed,#6d28d9);border:none;border-radius:10px;padding:9px 18px;color:#fff;font-size:13px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;}

        /* ── THREAD ── */
        .mp-thread{display:flex;flex-direction:column;height:100%;}
        .mp-thread-header{display:flex;align-items:center;gap:10px;padding:10px 16px;flex-shrink:0;background:rgba(11,15,28,0.92);border-bottom:1px solid var(--border);backdrop-filter:blur(20px);}
        .mp-back-btn{background:rgba(255,255,255,0.05);border:1px solid var(--border);border-radius:8px;width:30px;height:30px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--t2);flex-shrink:0;transition:.13s;}
        .mp-back-btn:hover{background:rgba(255,255,255,0.09);}
        @media(min-width:768px){.mp-back-btn{display:none;}}
        .mp-thread-av{width:34px;height:34px;border-radius:9px;background:linear-gradient(135deg,rgba(124,58,237,0.25),rgba(109,40,217,0.25));border:1px solid rgba(124,58,237,0.28);display:flex;align-items:center;justify-content:center;flex-shrink:0;}
        .mp-thread-info{flex:1;min-width:0;}
        .mp-thread-name{font-size:14px;font-weight:600;color:var(--t1);font-family:'Bricolage Grotesque',sans-serif;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .mp-thread-sub,.mp-thread-typing{font-size:11px;margin:0;}
        .mp-thread-typing{color:#a78bfa;font-style:italic;}
        .mp-thread-actions{display:flex;align-items:center;gap:4px;flex-shrink:0;}
        .mp-thread-action{width:28px;height:28px;border-radius:7px;background:transparent;border:1px solid transparent;display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--t3);transition:.13s;}
        .mp-thread-action:hover{background:rgba(255,255,255,0.06);color:var(--t1);}
        .mp-thread-action--active{background:var(--ac-soft);border-color:rgba(124,58,237,0.3);color:#a78bfa;}
        .mp-thread-action--muted{color:#f59e0b;}
        .mp-typing-dots{display:flex;gap:3px;align-items:center;flex-shrink:0;}
        .mp-typing-dots span{width:5px;height:5px;border-radius:50%;background:#7c3aed;display:block;}
        .mp-typing-dots span:nth-child(1){animation:mpBounce 1.2s 0s infinite;}
        .mp-typing-dots span:nth-child(2){animation:mpBounce 1.2s .2s infinite;}
        .mp-typing-dots span:nth-child(3){animation:mpBounce 1.2s .4s infinite;}

        /* ── MESSAGES ── */
        .mp-messages{flex:1;overflow-y:auto;padding:14px 16px;}
        @media(max-width:767px){.mp-messages{padding:10px;}}
        .mp-center{display:flex;justify-content:center;padding:40px 0;}
        .mp-spin{width:20px;height:20px;color:#7c3aed;animation:mpSpin 1s linear infinite;}
        .mp-empty-thread{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;text-align:center;}
        .mp-empty-icon{width:52px;height:52px;border-radius:16px;margin-bottom:14px;background:rgba(124,58,237,0.1);border:1px solid rgba(124,58,237,0.2);display:flex;align-items:center;justify-content:center;}
        .mp-empty-title{font-size:14px;font-weight:600;color:#64748b;margin:0 0 4px;}
        .mp-empty-sub{font-size:12px;color:var(--t4);margin:0;}

        /* ── DATE DIVIDER ── */
        .mp-date-div{display:flex;align-items:center;gap:10px;margin:18px 0 10px;}
        .mp-div-line{flex:1;height:1px;background:var(--border2);}
        .mp-div-label{font-size:10px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--t3);padding:3px 9px;background:rgba(255,255,255,0.03);border:1px solid var(--border2);border-radius:20px;white-space:nowrap;}
        .mp-thread-divider{display:flex;align-items:center;gap:10px;margin:12px 0;}

        /* ── MSG ROW ── */
        .mp-msg-row{display:flex;margin-bottom:2px;position:relative;}
        .mp-msg-row--me{justify-content:flex-end;margin-top:3px;}
        .mp-msg-row--them{justify-content:flex-start;margin-top:3px;}
        .mp-msg-row:not(.mp-msg-row--same){margin-top:10px;}
        .mp-msg-row--new .mp-bubble{animation:mpPop .22s ease forwards;}
        .mp-av{width:30px;height:30px;border-radius:8px;flex-shrink:0;background:rgba(124,58,237,0.2);border:1px solid rgba(124,58,237,0.2);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#818cf8;margin-right:8px;margin-top:2px;}
        .mp-av-sp{width:38px;flex-shrink:0;}
        .mp-msg-body{display:flex;flex-direction:column;max-width:70%;position:relative;}
        @media(max-width:480px){.mp-msg-body{max-width:86%;}}
        .mp-msg-body--me{align-items:flex-end;}
        .mp-msg-body--them{align-items:flex-start;}
        .mp-sender{font-size:10px;color:var(--t3);margin:0 0 3px 2px;font-weight:500;}

        /* ── BUBBLES ── */
        .mp-bubble{padding:9px 13px;line-height:1.5;cursor:context-menu;word-break:break-word;transition:all .15s;}
        .mp-bubble--me{background:linear-gradient(135deg,#7c3aed,#6d28d9);border:1px solid rgba(124,58,237,0.4);border-radius:16px 16px 4px 16px;box-shadow:0 3px 16px rgba(124,58,237,0.28);}
        .mp-bubble--them{background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.07);border-radius:16px 16px 16px 4px;}
        .mp-bubble-text{font-size:13px;color:#fff;margin:0;font-family:'DM Sans',sans-serif;}
        .mp-bubble--them .mp-bubble-text{color:rgba(255,255,255,0.84);}
        @media(max-width:767px){.mp-bubble-text{font-size:14px;}.mp-bubble{padding:10px 14px;}}
        .mp-inline-code{background:rgba(0,0,0,0.3);border-radius:4px;padding:1px 5px;font-family:monospace;font-size:12px;}
        .mp-code-block{background:rgba(0,0,0,0.4);border-radius:8px;padding:10px 12px;font-family:monospace;font-size:11px;overflow-x:auto;margin:4px 0 0;white-space:pre;}
        .mp-list{margin:4px 0 0 16px;padding:0;}
        .mp-mention{color:#c084fc;font-weight:600;}

        /* ── REACTIONS ── */
        .mp-reactions-wrap{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;align-items:center;}
        .mp-reaction{display:inline-flex;align-items:center;gap:3px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:20px;padding:2px 7px;cursor:pointer;font-size:13px;transition:all .13s;}
        .mp-reaction:hover{background:rgba(255,255,255,0.1);border-color:rgba(255,255,255,0.2);}
        .mp-reaction--mine{background:var(--ac-soft);border-color:rgba(124,58,237,0.4);}
        .mp-reaction-count{font-size:11px;color:rgba(255,255,255,0.7);font-weight:600;}
        .mp-add-reaction{width:22px;height:22px;border-radius:50%;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--t3);transition:.13s;}
        .mp-add-reaction:hover{background:rgba(255,255,255,0.1);color:var(--t1);}

        /* ── EMOJI PICKER ── */
        .mp-emoji-picker{position:absolute;bottom:calc(100% + 6px);left:0;z-index:9999;background:rgba(12,16,28,0.97);backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:12px;width:220px;box-shadow:0 20px 60px rgba(0,0,0,0.7);animation:mpFade .12s ease;}
        .mp-emoji-group{font-size:9px;font-weight:700;color:var(--t4);text-transform:uppercase;letter-spacing:.08em;margin:8px 0 4px;padding:0;}
        .mp-emoji-group:first-child{margin-top:0;}
        .mp-emoji-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:2px;}
        .mp-emoji-btn{padding:5px;border:none;background:transparent;cursor:pointer;font-size:16px;border-radius:6px;transition:.1s;text-align:center;}
        .mp-emoji-btn:hover{background:rgba(255,255,255,0.1);}

        /* ── THREAD REPLY ── */
        .mp-reply-count{display:inline-flex;align-items:center;gap:4px;font-size:10px;color:var(--ac);background:var(--ac-soft);border:none;border-radius:20px;padding:2px 8px;cursor:pointer;margin-top:4px;transition:.13s;font-family:'DM Sans',sans-serif;}
        .mp-reply-count:hover{background:rgba(124,58,237,0.2);}
        .mp-thread-parent{display:flex;gap:10px;padding:12px;background:rgba(255,255,255,0.03);border-radius:12px;margin-bottom:12px;border-left:3px solid #7c3aed;}

        /* ── HOVER ACTIONS ── */
        .mp-hover-acts{display:none;position:absolute;right:calc(100% + 6px);top:4px;gap:3px;align-items:center;background:rgba(11,15,28,0.95);border:1px solid var(--border);border-radius:9px;padding:3px;box-shadow:0 8px 24px rgba(0,0,0,0.5);}
        @media(min-width:768px){.mp-msg-row:hover .mp-hover-acts{display:flex;}}
        .mp-msg-row--them .mp-hover-acts{right:auto;left:calc(100% + 6px);}
        .mp-ha{background:transparent;border:none;border-radius:6px;padding:4px 5px;cursor:pointer;color:rgba(255,255,255,0.4);display:flex;align-items:center;transition:.12s;}
        .mp-ha:hover{background:rgba(255,255,255,0.08);color:#fff;}
        .mp-ha--del:hover{background:rgba(239,68,68,0.15);color:#f87171;}

        /* ── EDIT ── */
        .mp-edit-wrap{display:flex;align-items:center;gap:6px;background:rgba(124,58,237,0.1);border:1px solid rgba(124,58,237,0.3);border-radius:12px;padding:7px 10px;}
        .mp-edit-input{background:transparent;border:none;outline:none;color:var(--t1);font-size:13px;min-width:100px;flex:1;font-family:'DM Sans',sans-serif;}
        .mp-edit-save{background:#7c3aed;border:none;border-radius:6px;padding:3px 9px;color:#fff;font-size:11px;font-weight:600;cursor:pointer;}
        .mp-edit-cancel{background:transparent;border:none;color:var(--t3);cursor:pointer;font-size:16px;line-height:1;padding:0 2px;}

        /* ── META ── */
        .mp-meta{display:flex;align-items:center;gap:4px;margin-top:3px;padding:0 2px;}
        .mp-meta--me{justify-content:flex-end;}
        .mp-time{font-size:10px;color:var(--t4);}

        /* ── RICH COMPOSER ── */
        .mp-composer{border-top:1px solid var(--border2);background:rgba(11,15,28,0.75);backdrop-filter:blur(12px);flex-shrink:0;}
        .mp-reply-banner{display:flex;align-items:center;gap:8px;padding:8px 14px;background:rgba(124,58,237,0.08);border-bottom:1px solid rgba(124,58,237,0.15);}
        .mp-reply-sender{font-size:11px;font-weight:700;color:#a78bfa;flex-shrink:0;}
        .mp-reply-text{font-size:11px;color:var(--t3);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
        .mp-reply-cancel{background:none;border:none;color:var(--t3);cursor:pointer;padding:0;display:flex;}
        .mp-format-bar{display:flex;align-items:center;gap:3px;padding:6px 12px 0;border-top:1px solid var(--border2);}
        .mp-fmt-btn{background:transparent;border:none;color:var(--t3);padding:3px 7px;border-radius:5px;cursor:pointer;font-size:12px;display:flex;align-items:center;justify-content:center;transition:.12s;min-width:26px;}
        .mp-fmt-btn:hover{background:rgba(255,255,255,0.07);color:var(--t1);}
        .mp-fmt-sep{width:1px;height:16px;background:var(--border);margin:0 3px;}
        .mp-mention-dropdown{position:absolute;bottom:calc(100% + 4px);left:0;right:0;background:rgba(12,16,28,0.97);border:1px solid rgba(255,255,255,0.1);border-radius:10px;overflow:hidden;z-index:100;box-shadow:0 12px 40px rgba(0,0,0,0.6);}
        .mp-mention-item{display:flex;align-items:center;gap:9px;width:100%;padding:8px 12px;background:transparent;border:none;cursor:pointer;text-align:left;color:var(--t1);font-size:13px;font-family:'DM Sans',sans-serif;transition:.1s;}
        .mp-mention-item:hover{background:var(--ac-soft);}
        .mp-mention-av{width:24px;height:24px;border-radius:6px;background:rgba(124,58,237,0.2);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#a78bfa;flex-shrink:0;}
        .mp-input-row{display:flex;align-items:flex-end;gap:8px;padding:8px 12px;}
        .mp-input-icon{background:none;border:none;cursor:pointer;color:var(--t3);display:flex;align-items:center;padding:6px;border-radius:7px;transition:.13s;flex-shrink:0;}
        .mp-input-icon:hover{color:var(--t1);background:rgba(255,255,255,0.06);}
        .mp-chat-textarea{flex:1;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:8px 12px;color:var(--t1);font-size:13px;font-family:'DM Sans',sans-serif;resize:none;outline:none;line-height:1.5;transition:border-color .15s;min-height:36px;max-height:120px;}
        .mp-chat-textarea::placeholder{color:var(--t4);}
        .mp-chat-textarea:focus{border-color:rgba(124,58,237,0.4);}
        @media(max-width:767px){.mp-chat-textarea{font-size:16px;}}
        .mp-send{width:34px;height:34px;border-radius:10px;border:none;background:rgba(124,58,237,0.3);color:rgba(255,255,255,0.4);display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;transition:all .15s;align-self:flex-end;}
        .mp-send--active{background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#fff;box-shadow:0 3px 12px var(--ac-glow);}
        .mp-send--active:hover{transform:scale(1.05);}
        .mp-hint{font-size:10px;color:var(--t4);text-align:center;padding:0 0 8px;margin:0;font-family:'DM Sans',sans-serif;}
        @media(max-width:767px){.mp-hint{display:none;}}

        /* ── ATTACH ── */
        .mp-attach{margin-bottom:6px;}
        .mp-attach-img{border-radius:8px;max-width:100%;max-height:160px;object-fit:cover;display:block;}
        .mp-attach-file{display:flex;align-items:center;gap:7px;padding:7px 10px;border-radius:8px;text-decoration:none;background:rgba(255,255,255,0.1);font-size:12px;color:rgba(255,255,255,0.85);}
        .mp-attach-file--me{background:rgba(255,255,255,0.15);}
        .mp-attach-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
        .mp-file-prev{display:flex;align-items:center;gap:8px;margin:0 14px 4px;background:rgba(124,58,237,0.07);border:1px solid rgba(124,58,237,0.2);border-radius:10px;padding:8px 12px;}
        .mp-fp-name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:#94a3b8;}
        .mp-fp-size{font-size:10px;color:var(--t3);flex-shrink:0;}
        .mp-fp-rm{background:none;border:none;cursor:pointer;color:var(--t3);display:flex;padding:0;}

        /* ── CTX MENU ── */
        .mp-ctxmenu{background:rgba(10,13,22,0.97);backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,0.08);border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,0.7);overflow:hidden;width:180px;animation:mpFade .12s ease;}
        .mp-ctx-item{display:flex;align-items:center;gap:9px;width:100%;padding:9px 14px;background:transparent;border:none;border-bottom:1px solid rgba(255,255,255,0.05);color:rgba(255,255,255,0.7);font-size:12px;font-weight:500;cursor:pointer;font-family:'DM Sans',sans-serif;transition:.12s;}
        .mp-ctx-item:last-child{border-bottom:none;}
        .mp-ctx-item:hover{background:rgba(255,255,255,0.06);color:#fff;}
        .mp-ctx-item--danger{color:#f87171;}
        .mp-ctx-item--danger:hover{background:rgba(248,113,113,0.1);}

        /* ── MOBILE SHEET ── */
        .mp-sheet-overlay{position:fixed;inset:0;z-index:9998;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);animation:mpFade .2s ease;}
        .mp-sheet{position:absolute;bottom:0;left:0;right:0;background:#0f1424;border-top:1px solid rgba(255,255,255,0.08);border-radius:20px 20px 0 0;padding:0 0 env(safe-area-inset-bottom,16px);animation:mpSheetUp .25s ease;}
        .mp-sheet-handle{width:36px;height:4px;border-radius:2px;background:rgba(255,255,255,0.15);margin:10px auto 0;}
        .mp-sheet-emoji-row{display:flex;justify-content:center;gap:12px;padding:14px 16px;border-bottom:1px solid rgba(255,255,255,0.05);}
        .mp-sheet-emoji{background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:50%;width:40px;height:40px;font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:.13s;}
        .mp-sheet-emoji:hover{background:rgba(255,255,255,0.12);transform:scale(1.1);}
        .mp-sheet-preview{padding:12px 20px 10px;border-bottom:1px solid rgba(255,255,255,0.05);}
        .mp-sheet-preview-txt{font-size:12px;color:var(--t3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin:0;}
        .mp-sheet-btn{display:flex;align-items:center;gap:14px;width:100%;padding:16px 22px;background:transparent;border:none;border-bottom:1px solid rgba(255,255,255,0.05);color:var(--t1);font-size:16px;font-weight:500;cursor:pointer;text-align:left;font-family:'DM Sans',sans-serif;}
        .mp-sheet-btn--danger{color:#f87171;}
        .mp-sheet-cancel{display:block;width:calc(100% - 24px);margin:8px 12px 4px;padding:14px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);border-radius:12px;color:var(--t2);font-size:16px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;}

        /* ── SIDE PANEL (pinned, thread) ── */
        .mp-panel-overlay{position:absolute;inset:0;z-index:50;pointer-events:none;}
        .mp-side-panel{position:absolute;right:0;top:0;bottom:0;width:320px;background:var(--bg2);border-left:1px solid var(--border);display:flex;flex-direction:column;pointer-events:all;animation:mpSlideIn .25s ease;box-shadow:-20px 0 60px rgba(0,0,0,0.5);}
        @media(max-width:767px){.mp-side-panel{width:100%;border-left:none;}}
        .mp-thread-panel{width:360px;}
        .mp-side-panel-hdr{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid var(--border);flex-shrink:0;}
        .mp-side-panel-title{font-size:13px;font-weight:600;color:var(--t1);font-family:'Bricolage Grotesque',sans-serif;}
        .mp-side-panel-close{background:rgba(255,255,255,0.06);border:1px solid var(--border);border-radius:7px;width:28px;height:28px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--t3);transition:.13s;}
        .mp-side-panel-close:hover{color:var(--t1);background:rgba(255,255,255,0.1);}
        .mp-side-panel-body{flex:1;overflow-y:auto;padding:12px;}
        .mp-panel-empty{display:flex;flex-direction:column;align-items:center;gap:8px;padding:32px 20px;text-align:center;color:var(--t3);font-size:12px;}
        .mp-pin-item{display:flex;gap:8px;padding:10px 12px;border-radius:9px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.05);margin-bottom:6px;}
        .mp-pin-text{font-size:12px;color:rgba(255,255,255,0.7);margin:0 0 3px;line-height:1.4;}
        .mp-pin-meta{font-size:10px;color:var(--t4);margin:0;}

        /* ── SAVED ── */
        .mp-saved-item{display:flex;align-items:flex-start;gap:10px;padding:12px;border-bottom:1px solid var(--border2);}
        .mp-saved-body{flex:1;min-width:0;}
        .mp-saved-text{font-size:12px;color:rgba(255,255,255,0.7);margin:0 0 3px;line-height:1.4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
        .mp-saved-meta{font-size:10px;color:var(--t4);margin:0;}

        /* ── GLOBAL SEARCH ── */
        .mp-search-modal-overlay{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.7);backdrop-filter:blur(8px);display:flex;align-items:flex-start;justify-content:center;padding-top:80px;animation:mpFade .15s ease;}
        .mp-search-modal{width:100%;max-width:600px;background:rgba(10,13,22,0.98);border:1px solid rgba(255,255,255,0.1);border-radius:16px;overflow:hidden;box-shadow:0 40px 80px rgba(0,0,0,0.8);animation:mpPop .2s ease;}
        .mp-search-modal-input-wrap{display:flex;align-items:center;gap:12px;padding:16px 20px;border-bottom:1px solid var(--border);}
        .mp-search-modal-input{flex:1;background:transparent;border:none;outline:none;color:var(--t1);font-size:16px;font-family:'DM Sans',sans-serif;}
        .mp-search-modal-input::placeholder{color:var(--t4);}
        .mp-search-results{max-height:400px;overflow-y:auto;}
        .mp-search-result{display:block;width:100%;padding:12px 20px;background:transparent;border:none;border-bottom:1px solid var(--border2);cursor:pointer;text-align:left;transition:.13s;font-family:'DM Sans',sans-serif;}
        .mp-search-result:hover{background:var(--ac-soft);}
        .mp-search-result-conv{display:flex;align-items:center;gap:5px;font-size:10px;color:var(--t3);margin-bottom:4px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;}
        .mp-search-result-text{font-size:13px;color:rgba(255,255,255,0.7);margin:0;line-height:1.4;}
        .mp-search-empty{text-align:center;padding:24px;font-size:13px;color:var(--t3);}
        .mp-search-hint{display:flex;flex-direction:column;align-items:center;gap:10px;padding:40px 20px;color:var(--t4);font-size:12px;}

        /* ── NOTIFICATIONS ── */
        .mp-notif-panel{display:flex;flex-direction:column;height:100%;}
        .mp-notif-hdr{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--border);background:rgba(11,15,28,0.9);flex-shrink:0;flex-wrap:wrap;gap:8px;}
        .mp-notif-hdr-l{display:flex;align-items:center;gap:8px;}
        .mp-notif-title{font-size:14px;font-weight:600;color:var(--t1);font-family:'Bricolage Grotesque',sans-serif;}
        .mp-notif-badge{background:var(--ac-soft);color:#a78bfa;font-size:10px;font-weight:700;padding:2px 7px;border-radius:20px;border:1px solid rgba(124,58,237,0.3);}
        .mp-notif-hdr-r{display:flex;align-items:center;gap:5px;flex-wrap:wrap;}
        .mp-filter-btn{background:transparent;border:1px solid transparent;border-radius:6px;padding:3px 9px;color:var(--t3);font-size:11px;font-weight:500;cursor:pointer;font-family:'DM Sans',sans-serif;transition:.13s;}
        .mp-filter-btn--active{background:var(--ac-soft);border-color:rgba(124,58,237,0.3);color:#a78bfa;}
        .mp-markall-btn{display:flex;align-items:center;gap:4px;background:rgba(255,255,255,0.04);border:1px solid var(--border);border-radius:6px;padding:3px 9px;color:var(--t2);font-size:11px;cursor:pointer;font-family:'DM Sans',sans-serif;}
        .mp-notif-list{flex:1;overflow-y:auto;}
        .mp-notif-empty{display:flex;flex-direction:column;align-items:center;gap:10px;padding:50px 20px;color:var(--t3);font-size:12px;}
        .mp-notif-item{display:flex;gap:11px;padding:13px 18px;border-bottom:1px solid var(--border2);cursor:pointer;transition:.13s;}
        .mp-notif-item:hover{background:rgba(255,255,255,0.02);}
        .mp-notif-item--unread{background:rgba(124,58,237,0.04);}
        .mp-notif-icon{width:34px;height:34px;border-radius:10px;flex-shrink:0;background:var(--ac-soft);border:1px solid rgba(124,58,237,0.2);display:flex;align-items:center;justify-content:center;color:#a78bfa;margin-top:1px;}
        .mp-notif-body{flex:1;min-width:0;}
        .mp-notif-text{font-size:13px;color:rgba(255,255,255,0.5);margin:0;line-height:1.5;font-family:'DM Sans',sans-serif;}
        .mp-notif-text--bold{font-weight:600;color:rgba(255,255,255,0.88);}
        .mp-notif-time{font-size:10px;color:var(--t4);margin-top:3px;}
        .mp-notif-dot{width:7px;height:7px;border-radius:50%;background:var(--ac);flex-shrink:0;margin-top:6px;}

        /* ── BOTTOM NAV ── */
        .mp-bottom-nav{display:none;position:fixed;bottom:0;left:0;right:0;background:rgba(11,15,28,0.97);backdrop-filter:blur(20px);border-top:1px solid var(--border);z-index:50;padding-bottom:env(safe-area-inset-bottom,0px);}
        @media(max-width:767px){.mp-bottom-nav{display:flex;}}
        .mp-bnav-btn{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding:10px 0;background:transparent;border:none;cursor:pointer;color:var(--t3);font-size:10px;font-weight:600;font-family:'DM Sans',sans-serif;transition:color .15s;}
        .mp-bnav-btn--active{color:#a78bfa;}
        .mp-bnav-icon{position:relative;}
        .mp-bnav-badge{position:absolute;top:-4px;right:-6px;width:14px;height:14px;border-radius:50%;background:linear-gradient(135deg,#7c3aed,#6d28d9);font-size:8px;font-weight:700;color:#fff;display:flex;align-items:center;justify-content:center;}

        /* ── SCROLLBARS ── */
        .mp-messages::-webkit-scrollbar,.mp-convo-items::-webkit-scrollbar,.mp-notif-list::-webkit-scrollbar,.mp-side-panel-body::-webkit-scrollbar,.mp-search-results::-webkit-scrollbar{width:3px;}
        .mp-messages::-webkit-scrollbar-thumb,.mp-convo-items::-webkit-scrollbar-thumb,.mp-notif-list::-webkit-scrollbar-thumb,.mp-side-panel-body::-webkit-scrollbar-thumb,.mp-search-results::-webkit-scrollbar-thumb{background:rgba(124,58,237,0.2);border-radius:2px;}
        .sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);}
      `}</style>

      <DashboardLayout>
        <div className="mp-page">
          {/* TOP BAR */}
          <div className="mp-topbar">
            <div className="mp-topbar-l">
              <div className="mp-topbar-icon"><MessageSquare style={{ width: 15, height: 15, color: "#a78bfa" }} /></div>
              <p className="mp-topbar-title">Messages</p>
              {totalBadge > 0 && <span className="mp-topbar-badge">{totalBadge}</span>}
              {onlineCount > 0 && (
                <div className="mp-online-pill">
                  <span className="mp-online-dot" />
                  {onlineCount} online
                </div>
              )}
            </div>
            <div className="mp-topbar-actions">
              <button className="mp-topbar-btn" title="Search all messages" onClick={() => setShowSearch(true)}>
                <Search style={{ width: 14, height: 14 }} />
              </button>
              <button className="mp-new-btn" onClick={() => setNewOpen(true)}>
                <Plus style={{ width: 13, height: 13 }} /><span>New Message</span>
              </button>
            </div>
          </div>

          {/* Global Search Modal */}
          {showSearch && (
            <GlobalSearch
              conversations={conversations}
              onJumpTo={(convId) => { selectConvo(convId); setShowSearch(false); }}
              onClose={() => setShowSearch(false)}
            />
          )}

          <div className="mp-body">
            {/* SIDEBAR */}
            <div className={cn("mp-sidebar", mobileScr === "thread" && "mp-sidebar--hidden")}>
              <div className="mp-tabs">
                {([
                  { id: "chats" as const, label: "Chats", Icon: MessageSquare, badge: totalUnread },
                  { id: "saved" as const, label: "Saved", Icon: Bookmark, badge: 0 },
                  { id: "notifs" as const, label: "Alerts", Icon: Bell, badge: notifCount },
                ] as const).map(t => (
                  <button key={t.id} className={cn("mp-tab", tab === t.id && "mp-tab--active")} onClick={() => setTab(t.id)}>
                    <t.Icon style={{ width: 13, height: 13 }} />
                    {t.label}
                    {t.badge > 0 && <span className="mp-tab-badge">{t.badge}</span>}
                  </button>
                ))}
              </div>

              {tab === "chats" && (
                <ConvoListPanel
                  convos={conversations}
                  loading={conversationsLoading}
                  selected={selected}
                  onSelect={selectConvo}
                  isOnline={isOnline}
                />
              )}
              {tab === "saved" && user && (
                <SavedPanel userId={user.id} onJumpTo={selectConvo} />
              )}
              {tab === "notifs" && <NotifsPanel />}
            </div>

            {/* RIGHT PANEL */}
            <div className={cn("mp-right", mobileScr === "list" && "mp-right--hidden")}>
              {tab === "saved" && user ? (
                <SavedPanel userId={user.id} onJumpTo={selectConvo} />
              ) : selected ? (
                <ChatThread
                  conversationId={selected}
                  conversations={conversations}
                  onBack={goBack}
                  isOnline={isOnline}
                  members={members}
                  currentUserId={user?.id ?? ""}
                />
              ) : (
                <div className="mp-right-empty">
                  <div className="mp-re-icon"><MessageSquare style={{ width: 26, height: 26, color: "#7c3aed" }} /></div>
                  <h3>Select a conversation</h3>
                  <p>Pick a thread from the sidebar, or search for messages across all conversations.</p>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="mp-re-btn" onClick={() => setNewOpen(true)}><Plus style={{ width: 14, height: 14 }} />New Message</button>
                    <button className="mp-re-btn" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }} onClick={() => setShowSearch(true)}>
                      <Search style={{ width: 14, height: 14 }} />Search
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* BOTTOM NAV (mobile) */}
          <nav className="mp-bottom-nav">
            {([
              { id: "chats" as const, label: "Chats", Icon: MessageSquare, badge: totalUnread },
              { id: "saved" as const, label: "Saved", Icon: Bookmark, badge: 0 },
              { id: "notifs" as const, label: "Alerts", Icon: Bell, badge: notifCount },
            ] as const).map(t => (
              <button key={t.id} className={cn("mp-bnav-btn", tab === t.id && mobileScr === "list" && "mp-bnav-btn--active")}
                onClick={() => { setTab(t.id); setMobileScr("list"); }}>
                <div className="mp-bnav-icon">
                  <t.Icon style={{ width: 20, height: 20 }} />
                  {t.badge > 0 && <span className="mp-bnav-badge">{t.badge > 9 ? "9+" : t.badge}</span>}
                </div>
                {t.label}
              </button>
            ))}
            <button className="mp-bnav-btn" onClick={() => setShowSearch(true)}>
              <div className="mp-bnav-icon"><Search style={{ width: 20, height: 20 }} /></div>
              Search
            </button>
            <button className="mp-bnav-btn" onClick={() => setNewOpen(true)}>
              <div className="mp-bnav-icon"><Plus style={{ width: 20, height: 20 }} /></div>
              New
            </button>
          </nav>
        </div>

        {/* New Convo Dialog */}
        {team && (
          <NewConvoDialog
            open={newOpen} onClose={() => setNewOpen(false)}
            members={members} currentUserId={user?.id ?? ""}
            teamId={team.id} conversations={conversations}
            refetchConversations={refetchConversations}
            isOnline={isOnline}
            onCreated={id => { setNewOpen(false); setTab("chats"); selectConvo(id); }}
          />
        )}
      </DashboardLayout>
    </>
  );
}
