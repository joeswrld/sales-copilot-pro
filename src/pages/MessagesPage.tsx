/**
 * MessagesPage.tsx — Fixsense Sales Intelligence Communication Hub v4
 *
 * FIXES applied vs v3:
 *  1. Removed local useUserStatus hook (localStorage + broadcast) —
 *     replaced with the DB-backed `useUserStatus` from src/hooks/useUserStatus.ts
 *  2. Removed buildDealRoomsFromCalls() client-side fabrication —
 *     replaced with real `useDealRooms()` from src/hooks/useDealRooms.ts
 *  3. Deal room chat now uses `room.conversation_id` (real DB conversation)
 *     instead of the fake `deal_${call_id}` string
 *  4. `activeDealRoom` now typed as the real `DealRoom` from useDealRooms.ts
 *  5. Status picker wired to `setStatus()` from DB-backed hook
 */

import {
  useState, useRef, useEffect, useMemo, useCallback,
} from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Search, Send, MessageSquare, Bell, Plus, Users, FileText,
  Image as ImageIcon, Paperclip, X, Check, CheckCheck,
  TrendingUp, AtSign, AlertCircle, ArrowLeft, Copy, Trash2,
  Pencil, Loader2, ChevronRight, Pin, Bookmark, Hash,
  MessageCircle, BellOff, Smile, Reply, CornerDownRight,
  Clock, Calendar, Bold, Italic, Code, List,
  ChevronDown, Eye, Phone, Target, Zap, BarChart3,
  AlertTriangle, Star, Activity, Briefcase, ChevronUp,
  Globe, Radio, Building2, TrendingDown, Award,
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
import { format, isToday, isYesterday, formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import type { Conversation, ReadReceipt } from "@/hooks/useTeamMessaging";
import type { TeamMember } from "@/hooks/useTeam";
import { useTypingIndicator } from "@/hooks/useTypingIndicator";
import { useQueryClient } from "@tanstack/react-query";

// ── DB-backed hooks (replaces local versions) ──────────────────────────
import {
  useUserStatus,
  STATUS_CONFIG,
  type UserStatus,
} from "@/hooks/useUserStatus";
import {
  useDealRooms,
  DEAL_STAGE_CONFIG,
  type DealRoom,
} from "@/hooks/useDealRooms";

// ─────────────────────────────────────────────────────────────
//  TYPES (non-deal-room, non-status types stay local)
// ─────────────────────────────────────────────────────────────
interface RtMsg {
  id: string;
  conversation_id: string;
  sender_id: string;
  message_text: string;
  created_at: string;
  parent_id?: string | null;
  file_url?: string | null;
  file_name?: string | null;
  file_type?: string | null;
  sender?: { full_name: string | null; email: string | null } | null;
  reply_count?: number;
}

interface Reaction { emoji: string; count: number; mine: boolean; users: string[] }
interface PinRow { id: string; message_id: string; message_preview: string | null; created_at: string; pinned_by: string }
interface ScheduledMsg {
  id: string;
  conversation_id: string;
  sender_id: string;
  message_text: string;
  scheduled_for: string;
  status: string;
  created_at: string;
}

interface SearchResult {
  type: "message" | "call" | "transcript";
  id: string;
  title: string;
  preview: string;
  timestamp: string;
  conversation_id?: string;
  call_id?: string;
  sender?: string;
  score?: number;
}

// ─────────────────────────────────────────────────────────────
//  AUDIO
// ─────────────────────────────────────────────────────────────
let _lastSound = 0;
function playPing() {
  const now = Date.now(); if (now - _lastSound < 800) return; _lastSound = now;
  try {
    const ac = new (window.AudioContext || (window as any).webkitAudioContext)();
    const mg = ac.createGain(); mg.gain.value = 0.4; mg.connect(ac.destination);
    [[1046,0,.12],[1318,.01,.1],[2093,.02,.08]].forEach(([f,d,dur]) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = "sine"; o.frequency.value = f as number;
      const t = ac.currentTime + (d as number);
      g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(.5,t+.01);
      g.gain.exponentialRampToValueAtTime(.001,t+(dur as number));
      o.connect(g); g.connect(mg); o.start(t); o.stop(t+(dur as number));
    });
    setTimeout(()=>ac.close(),600);
  } catch {}
}

// ─────────────────────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────────────────────
const initials = (n?: string|null) =>
  (n||"?").split(" ").map(w=>w[0]).join("").toUpperCase().slice(0,2);

const fmtTime = (d: string) => {
  const dt = new Date(d);
  if (isToday(dt)) return format(dt,"h:mm a");
  if (isYesterday(dt)) return "Yesterday";
  return format(dt,"MMM d");
};

function renderMd(t: string): string {
  return t
    .replace(/```([\s\S]*?)```/g, '<pre class="md-pre"><code>$1</code></pre>')
    .replace(/`([^`]+)`/g, '<code class="md-code">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/^• (.+)$/gm, '<li class="md-li">$1</li>')
    .replace(/@all\b/g, '<span class="md-mention md-mention--all">@all</span>')
    .replace(/@(\w[\w\s]*?)(?=[\s,!?.]|$)/g, '<span class="md-mention">@$1</span>')
    .replace(/\n/g, "<br/>");
}

// ─────────────────────────────────────────────────────────────
//  PRESENCE HOOK
// ─────────────────────────────────────────────────────────────
function usePresence(teamId?: string, uid?: string) {
  const [online, setOnline] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!teamId || !uid) return;
    const ch = supabase.channel(`pres:${teamId}`, { config: { presence: { key: uid } } });
    ch.on("presence", { event:"sync" }, () => setOnline(new Set(Object.keys(ch.presenceState()))))
      .on("presence", { event:"join" }, ({key}:any) => setOnline(p=>new Set([...p,key])))
      .on("presence", { event:"leave"}, ({key}:any) => setOnline(p=>{const s=new Set(p);s.delete(key);return s;}))
      .subscribe(async st => { if(st==="SUBSCRIBED") await ch.track({user_id:uid}); });
    return () => { ch.untrack(); supabase.removeChannel(ch); };
  }, [teamId, uid]);
  return useCallback((id:string) => online.has(id), [online]);
}

// ─────────────────────────────────────────────────────────────
//  STATUS BADGE
// ─────────────────────────────────────────────────────────────
function StatusBadge({ status, size = "sm" }: { status: UserStatus; size?: "xs" | "sm" | "md" }) {
  const cfg = STATUS_CONFIG[status];
  const sizes = { xs: 6, sm: 8, md: 10 };
  const sz = sizes[size];
  return (
    <span
      title={cfg.label}
      style={{
        display: "inline-block",
        width: sz, height: sz,
        borderRadius: "50%",
        background: cfg.color,
        border: `2px solid #0b0f1c`,
        flexShrink: 0,
      }}
    />
  );
}

// ─────────────────────────────────────────────────────────────
//  STATUS PICKER MODAL
// ─────────────────────────────────────────────────────────────
function StatusPicker({
  current, onSelect, onClose,
}: {
  current: UserStatus;
  onSelect: (s: UserStatus, custom?: string) => void;
  onClose: () => void;
}) {
  const [custom, setCustom] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose]);

  return (
    <div ref={ref} className="status-picker">
      <p className="sp-title">Set your status</p>
      {(Object.entries(STATUS_CONFIG) as [UserStatus, typeof STATUS_CONFIG[UserStatus]][]).map(([key, cfg]) => (
        <button
          key={key}
          className={cn("sp-item", current === key && "sp-item--active")}
          onClick={() => { onSelect(key, custom); onClose(); }}
        >
          <span className="sp-emoji">{cfg.emoji}</span>
          <span className="sp-label">{cfg.label}</span>
          {current === key && <Check style={{ width: 12, height: 12, color: "#7c3aed", marginLeft: "auto" }} />}
        </button>
      ))}
      <div className="sp-divider" />
      <input
        className="sp-input"
        placeholder="What are you working on?"
        value={custom}
        onChange={e => setCustom(e.target.value)}
        onKeyDown={e => e.key === "Enter" && onClose()}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  DEAL ROOM CARD  (uses real DealRoom type from useDealRooms)
// ─────────────────────────────────────────────────────────────
function DealRoomCard({
  room, isSelected, onClick,
}: {
  room: DealRoom;
  isSelected: boolean;
  onClick: () => void;
}) {
  const stage = DEAL_STAGE_CONFIG[room.stage];
  const sentimentColor = room.sentiment_score
    ? room.sentiment_score >= 70 ? "#22c55e"
      : room.sentiment_score >= 40 ? "#f59e0b"
      : "#ef4444"
    : "rgba(255,255,255,.3)";

  return (
    <button
      className={cn("dr-card", isSelected && "dr-card--active")}
      onClick={onClick}
    >
      <div className="dr-card-top">
        <div className="dr-card-icon" style={{ background: stage.bg, color: stage.color }}>
          {stage.icon}
        </div>
        <div className="dr-card-info">
          <div className="dr-card-name">{room.deal_name}</div>
          {room.company && <div className="dr-card-company">{room.company}</div>}
        </div>
        {(room.unread_count ?? 0) > 0 && (
          <div className="dr-unread">{(room.unread_count ?? 0) > 9 ? "9+" : room.unread_count}</div>
        )}
      </div>
      <div className="dr-card-meta">
        <span className="dr-stage-badge" style={{ color: stage.color, background: stage.bg }}>
          {stage.icon} {stage.label}
        </span>
        {room.sentiment_score != null && (
          <span className="dr-sentiment" style={{ color: sentimentColor }}>
            {room.sentiment_score}% sentiment
          </span>
        )}
      </div>
      {room.next_step && (
        <div className="dr-next-step">
          <Target style={{ width: 9, height: 9, flexShrink: 0 }} />
          {room.next_step}
        </div>
      )}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
//  DEAL ROOM HEADER
// ─────────────────────────────────────────────────────────────
function DealRoomHeader({ room }: { room: DealRoom }) {
  const stage = DEAL_STAGE_CONFIG[room.stage];
  const sentimentColor = room.sentiment_score
    ? room.sentiment_score >= 70 ? "#22c55e"
      : room.sentiment_score >= 40 ? "#f59e0b"
      : "#ef4444"
    : "rgba(255,255,255,.3)";

  return (
    <div className="drh-wrap">
      <div className="drh-left">
        <div className="drh-icon" style={{ background: stage.bg, color: stage.color }}>
          <Building2 style={{ width: 14, height: 14 }} />
        </div>
        <div>
          <div className="drh-name">{room.deal_name}</div>
          {room.company && <div className="drh-company">{room.company}</div>}
        </div>
      </div>
      <div className="drh-stats">
        <div className="drh-stat">
          <span className="drh-stat-label">Stage</span>
          <span className="drh-stat-val" style={{ color: stage.color }}>
            {stage.icon} {stage.label}
          </span>
        </div>
        {room.sentiment_score != null && (
          <div className="drh-stat">
            <span className="drh-stat-label">Sentiment</span>
            <span className="drh-stat-val" style={{ color: sentimentColor }}>
              {room.sentiment_score}%
            </span>
          </div>
        )}
        {room.last_call_score != null && (
          <div className="drh-stat">
            <span className="drh-stat-label">Last Score</span>
            <span className="drh-stat-val">{room.last_call_score}/10</span>
          </div>
        )}
        {room.next_step && (
          <div className="drh-stat drh-stat--next">
            <span className="drh-stat-label">Next Step</span>
            <span className="drh-stat-val drh-stat-val--next">{room.next_step}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  GLOBAL SEARCH PANEL
// ─────────────────────────────────────────────────────────────
function GlobalSearchPanel({
  onClose,
  onNavigate,
}: {
  onClose: () => void;
  onNavigate: (convId?: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "messages" | "calls" | "transcripts">("all");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const timeout = setTimeout(async () => {
      setLoading(true);
      try {
        const found: SearchResult[] = [];

        if (filter === "all" || filter === "messages") {
          const { data: msgs } = await supabase
            .from("team_messages")
            .select("id, message_text, created_at, conversation_id, sender_id")
            .ilike("message_text", `%${query}%`)
            .limit(10);
          if (msgs) {
            msgs.forEach((m: any) => {
              found.push({
                type: "message", id: m.id, title: "Message",
                preview: m.message_text, timestamp: m.created_at,
                conversation_id: m.conversation_id,
              });
            });
          }
        }

        if (filter === "all" || filter === "transcripts") {
          const { data: summaries } = await supabase
            .from("call_summaries")
            .select("id, call_id, summary, created_at")
            .ilike("summary", `%${query}%`)
            .limit(5);
          if (summaries) {
            summaries.forEach((s: any) => {
              found.push({
                type: "transcript", id: s.id, title: "Call Transcript",
                preview: s.summary || "", timestamp: s.created_at,
                call_id: s.call_id,
              });
            });
          }
        }

        found.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        setResults(found);
      } catch (e) {
        console.error("Search error:", e);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [query, filter]);

  const typeIcon = (type: SearchResult["type"]) => {
    if (type === "message") return <MessageSquare style={{ width: 13, height: 13 }} />;
    if (type === "call") return <Phone style={{ width: 13, height: 13 }} />;
    return <FileText style={{ width: 13, height: 13 }} />;
  };
  const typeColor = (type: SearchResult["type"]) => {
    if (type === "message") return "#818cf8";
    if (type === "call") return "#2dd4bf";
    return "#f59e0b";
  };
  const handleResultClick = (r: SearchResult) => {
    if (r.conversation_id) onNavigate(r.conversation_id);
    else if (r.call_id) window.location.href = `/dashboard/calls/${r.call_id}`;
    onClose();
  };

  const filterTabs: { key: typeof filter; label: string; icon: React.ElementType }[] = [
    { key: "all", label: "All", icon: Globe },
    { key: "messages", label: "Messages", icon: MessageSquare },
    { key: "calls", label: "Calls", icon: Phone },
    { key: "transcripts", label: "Transcripts", icon: FileText },
  ];

  return (
    <div className="gs-overlay">
      <div className="gs-panel">
        <div className="gs-input-wrap">
          <Search style={{ width: 18, height: 18, color: "rgba(255,255,255,.4)", flexShrink: 0 }} />
          <input ref={inputRef} className="gs-input" placeholder="Search messages, calls, transcripts…"
            value={query} onChange={e => setQuery(e.target.value)} />
          {loading && <Loader2 style={{ width: 16, height: 16, color: "#7c3aed", animation: "spin 1s linear infinite", flexShrink: 0 }} />}
          <button className="gs-close" onClick={onClose}><X style={{ width: 14, height: 14 }} /></button>
        </div>
        <div className="gs-filters">
          {filterTabs.map(t => (
            <button key={t.key} className={cn("gs-filter", filter === t.key && "gs-filter--on")} onClick={() => setFilter(t.key)}>
              <t.icon style={{ width: 11, height: 11 }} />{t.label}
            </button>
          ))}
        </div>
        <div className="gs-results">
          {!query.trim() ? (
            <div className="gs-empty">
              <Search style={{ width: 32, height: 32, opacity: .15 }} />
              <p>Search across all your messages, calls and transcripts</p>
            </div>
          ) : results.length === 0 && !loading ? (
            <div className="gs-empty">
              <Search style={{ width: 28, height: 28, opacity: .15 }} />
              <p>No results for "{query}"</p>
            </div>
          ) : (
            <>
              {results.length > 0 && (
                <p className="gs-count">{results.length} result{results.length !== 1 ? "s" : ""}</p>
              )}
              {results.map(r => (
                <button key={`${r.type}-${r.id}`} className="gs-result" onClick={() => handleResultClick(r)}>
                  <div className="gs-result-icon" style={{ background: `${typeColor(r.type)}18`, color: typeColor(r.type) }}>
                    {typeIcon(r.type)}
                  </div>
                  <div className="gs-result-body">
                    <div className="gs-result-top">
                      <span className="gs-result-title">{r.title}</span>
                      <span className="gs-result-type" style={{ color: typeColor(r.type) }}>{r.type}</span>
                      <span className="gs-result-time">{fmtTime(r.timestamp)}</span>
                    </div>
                    <p className="gs-result-preview">{r.preview.slice(0, 120)}{r.preview.length > 120 ? "…" : ""}</p>
                  </div>
                  <ChevronRight style={{ width: 13, height: 13, color: "rgba(255,255,255,.2)", flexShrink: 0 }} />
                </button>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  REAL-TIME MESSAGE HOOK
// ─────────────────────────────────────────────────────────────
function useRealtimeChannel(
  convId: string|null,
  myId: string|undefined,
  cacheRef: React.MutableRefObject<Map<string,{full_name:string|null;email:string|null}>>,
  onInsert: (m:RtMsg)=>void,
  onDelete: (id:string)=>void,
  onUpdate: (id:string,text:string)=>void,
) {
  const iRef = useRef(onInsert); const dRef = useRef(onDelete); const uRef = useRef(onUpdate);
  useEffect(()=>{ iRef.current=onInsert; },[onInsert]);
  useEffect(()=>{ dRef.current=onDelete; },[onDelete]);
  useEffect(()=>{ uRef.current=onUpdate; },[onUpdate]);
  useEffect(() => {
    if (!convId) return;
    const ch = supabase.channel(`rt:msg:${convId}`)
      .on("postgres_changes",
        { event:"INSERT", schema:"public", table:"team_messages", filter:`conversation_id=eq.${convId}` },
        ({ new:row }:any) => {
          iRef.current({ ...row, sender: cacheRef.current.get(row.sender_id) ?? null });
          if (row.sender_id !== myId) playPing();
        })
      .on("postgres_changes",
        { event:"DELETE", schema:"public", table:"team_messages", filter:`conversation_id=eq.${convId}` },
        ({ old:row }:any) => row?.id && dRef.current(row.id))
      .on("postgres_changes",
        { event:"UPDATE", schema:"public", table:"team_messages", filter:`conversation_id=eq.${convId}` },
        ({ new:row }:any) => row?.id && uRef.current(row.id, row.message_text))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [convId]);
}

// ─────────────────────────────────────────────────────────────
//  REACTIONS
// ─────────────────────────────────────────────────────────────
function useReactions(msgId: string, myId: string) {
  const [rxns, setRxns] = useState<Reaction[]>([]);
  const load = useCallback(async () => {
    try {
      const { data } = await supabase.from("message_reactions" as any).select("emoji, user_id").eq("message_id", msgId);
      if (!data) return;
      const map = new Map<string,{count:number;mine:boolean;users:string[]}>();
      (data as any[]).forEach(r => {
        const e = map.get(r.emoji) ?? { count:0, mine:false, users:[] };
        e.count++; if (r.user_id===myId) e.mine=true; e.users.push(r.user_id); map.set(r.emoji, e);
      });
      setRxns(Array.from(map.entries()).map(([emoji,d])=>({emoji,...d})));
    } catch {}
  }, [msgId, myId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const ch = supabase.channel(`rxn:${msgId}`)
      .on("postgres_changes", { event:"*", schema:"public", table:"message_reactions", filter:`message_id=eq.${msgId}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [msgId, load]);
  const toggle = useCallback(async (emoji: string) => {
    const existing = rxns.find(r=>r.emoji===emoji);
    if (existing?.mine) {
      await supabase.from("message_reactions" as any).delete().eq("message_id",msgId).eq("user_id",myId).eq("emoji",emoji);
    } else {
      await supabase.from("message_reactions" as any).insert({ message_id:msgId, user_id:myId, emoji });
    }
  }, [rxns, msgId, myId]);
  return { rxns, toggle };
}

// ─────────────────────────────────────────────────────────────
//  EMOJI PICKER
// ─────────────────────────────────────────────────────────────
const QUICK = ["👍","❤️","😂","🎉","🔥","✅","👏","🚀","💯","😮","😢","⚡"];
const FACES = ["😀","😎","🤔","🙏","💪","🤝","👋","✌️","🤞","👌","🫡","🥳"];
const WORK  = ["📊","📈","💡","🎯","📝","💬","🔔","⭐","🏆","💎","🔑","📌"];

function EmojiPicker({ onPick, onClose }: { onPick:(e:string)=>void; onClose:()=>void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h=(e:MouseEvent)=>{ if(!ref.current?.contains(e.target as Node)) onClose(); };
    document.addEventListener("mousedown",h); return ()=>document.removeEventListener("mousedown",h);
  },[onClose]);
  return (
    <div ref={ref} className="ep-wrap">
      {[["Quick",QUICK],["Faces",FACES],["Work",WORK]].map(([label,list])=>(
        <div key={label as string}>
          <p className="ep-label">{label as string}</p>
          <div className="ep-grid">
            {(list as string[]).map(e=>(
              <button key={e} className="ep-btn" onClick={()=>{onPick(e);onClose();}}>{e}</button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  REACTIONS BAR
// ─────────────────────────────────────────────────────────────
function ReactBar({ msgId, myId }: { msgId:string; myId:string }) {
  const { rxns, toggle } = useReactions(msgId, myId);
  const [open, setOpen] = useState(false);
  return (
    <div className="rxn-bar">
      {rxns.map(r=>(
        <button key={r.emoji} title={`${r.count}`}
          className={cn("rxn-chip", r.mine && "rxn-chip--mine")}
          onClick={()=>toggle(r.emoji)}>
          {r.emoji}<span>{r.count}</span>
        </button>
      ))}
      <div style={{position:"relative"}}>
        <button className="rxn-add" onClick={()=>setOpen(p=>!p)}>
          <Smile style={{width:12,height:12}}/>
        </button>
        {open && <EmojiPicker onPick={toggle} onClose={()=>setOpen(false)}/>}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  SCHEDULE MESSAGE DIALOG
// ─────────────────────────────────────────────────────────────
function ScheduleDialog({ convId, myId, text, onClose, onScheduled }: {
  convId: string; myId: string; text: string; onClose: () => void;
  onScheduled: () => void;
}) {
  const [when, setWhen] = useState("");
  const [saving, setSaving] = useState(false);
  const minDate = new Date();
  minDate.setMinutes(minDate.getMinutes() + 1);
  const minStr = minDate.toISOString().slice(0,16);

  const save = async () => {
    if (!when || !text.trim()) return;
    setSaving(true);
    try {
      await supabase.from("scheduled_messages" as any).insert({
        sender_id: myId, conversation_id: convId,
        message_text: text.trim(),
        scheduled_for: new Date(when).toISOString(), status: "pending",
      });
      toast({ title: "Message scheduled!", description: `Will send ${format(new Date(when), "MMM d 'at' h:mm a")}` });
      onScheduled(); onClose();
    } catch {
      toast({ title: "Failed to schedule", variant: "destructive" });
    } finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={v=>{ if(!v) onClose(); }}>
      <DialogContent className="sch-dlg">
        <DialogHeader>
          <DialogTitle className="sch-title">
            <Clock style={{width:16,height:16,color:"#a78bfa"}}/> Schedule Message
          </DialogTitle>
        </DialogHeader>
        <div className="sch-preview">
          <div className="sch-preview-label">Message preview</div>
          <div className="sch-preview-txt" dangerouslySetInnerHTML={{__html: renderMd(text.slice(0,120)+(text.length>120?"…":""))}}/>
        </div>
        <div className="sch-field">
          <label className="sch-label">Send at</label>
          <input type="datetime-local" value={when} min={minStr} onChange={e=>setWhen(e.target.value)} className="sch-input"/>
          <p className="sch-hint">Must be at least 1 minute in the future</p>
        </div>
        <DialogFooter className="sch-footer">
          <button className="sch-btn-cancel" onClick={onClose}>Cancel</button>
          <button className="sch-btn-save" disabled={!when || !text.trim() || saving} onClick={save}>
            {saving ? <Loader2 style={{width:14,height:14,animation:"spin 1s linear infinite"}}/> : <Calendar style={{width:14,height:14}}/>}
            {saving ? "Scheduling…" : "Schedule"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────
//  SCHEDULED MESSAGES LIST
// ─────────────────────────────────────────────────────────────
function ScheduledList({ convId, myId, onClose }: { convId:string; myId:string; onClose:()=>void }) {
  const [items, setItems] = useState<ScheduledMsg[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase.from("scheduled_messages" as any)
      .select("*").eq("conversation_id", convId).eq("sender_id", myId)
      .eq("status", "pending").order("scheduled_for", { ascending: true });
    setItems((data || []) as unknown as ScheduledMsg[]);
    setLoading(false);
  }, [convId, myId]);

  useEffect(() => { load(); }, [load]);

  const cancel = async (id: string) => {
    await supabase.from("scheduled_messages" as any).delete().eq("id", id);
    setItems(p => p.filter(x => x.id !== id));
    toast({ title: "Scheduled message cancelled" });
  };

  return (
    <div className="thread-overlay">
      <div className="thread-panel">
        <div className="thread-hdr">
          <Clock style={{width:13,height:13,color:"#a78bfa"}}/>
          <span className="thread-title">Scheduled Messages</span>
          <button className="panel-close" onClick={onClose}><X style={{width:13,height:13}}/></button>
        </div>
        <div className="thread-body">
          {loading ? <div className="center-spin"><Loader2 className="spin"/></div>
            : items.length === 0 ? (
              <div className="panel-empty"><Clock style={{width:28,height:28,opacity:.2}}/><p>No scheduled messages</p></div>
            ) : items.map(m => (
              <div key={m.id} className="sched-item">
                <div className="sched-when"><Calendar style={{width:11,height:11}}/>{format(new Date(m.scheduled_for), "MMM d, yyyy 'at' h:mm a")}</div>
                <div className="sched-txt" dangerouslySetInnerHTML={{__html: renderMd(m.message_text.slice(0,100))}}/>
                <button className="sched-cancel" onClick={()=>cancel(m.id)}><X style={{width:11,height:11}}/> Cancel</button>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  RICH COMPOSER
// ─────────────────────────────────────────────────────────────
interface ComposerProps {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onFile: () => void;
  onSchedule: (text: string) => void;
  members: TeamMember[];
  myId: string;
  placeholder?: string;
  busy?: boolean;
  disabled?: boolean;
  replyTo?: { id: string; text: string; sender: string } | null;
  onCancelReply?: () => void;
}

function Composer({
  value, onChange, onSend, onFile, onSchedule, members, myId,
  placeholder = "Message… (@ to mention, ** for bold)", busy, disabled, replyTo, onCancelReply,
}: ComposerProps) {
  const [mentions, setMentions] = useState<Array<{id:string;name:string;isAll?:boolean}>>([]);
  const [mentionAt, setMentionAt] = useState(-1);
  const [mq, setMq] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const others = useMemo(()=>members.filter(m=>m.user_id!==myId),[members,myId]);

  const autoResize = () => {
    if (taRef.current) {
      taRef.current.style.height = "auto";
      taRef.current.style.height = Math.min(taRef.current.scrollHeight, 160) + "px";
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    onChange(v);
    autoResize();
    const pos = e.target.selectionStart;
    const before = v.slice(0, pos);
    const at = before.lastIndexOf("@");
    if (at !== -1 && !before.slice(at).includes(" ")) {
      const q = before.slice(at + 1);
      setMentionAt(at); setMq(q);
      const filtered: Array<{id:string;name:string;isAll?:boolean}> = [];
      if ("all".startsWith(q.toLowerCase())) filtered.push({ id:"__all__", name:"all", isAll:true });
      others.filter(m => (m.profile?.full_name||m.invited_email||"").toLowerCase().includes(q.toLowerCase()))
        .slice(0, 5).forEach(m => filtered.push({ id: m.user_id, name: m.profile?.full_name||m.invited_email||"user" }));
      setMentions(filtered);
    } else { setMentions([]); }
  };

  const insertMention = (item: {id:string;name:string;isAll?:boolean}) => {
    const tag = item.isAll ? "@all " : `@${item.name} `;
    const newVal = value.slice(0, mentionAt) + tag + value.slice(mentionAt + mq.length + 1);
    onChange(newVal); setMentions([]);
    setTimeout(() => taRef.current?.focus(), 0);
  };

  const wrapSelection = (prefix: string, suffix?: string) => {
    const el = taRef.current; if (!el) return;
    const s = el.selectionStart, e = el.selectionEnd;
    const sel = value.slice(s, e) || "text";
    const suf = suffix ?? prefix;
    const newVal = value.slice(0, s) + prefix + sel + suf + value.slice(e);
    onChange(newVal);
    setTimeout(() => { el.focus(); el.setSelectionRange(s + prefix.length, s + prefix.length + sel.length); }, 0);
  };

  const canSend = value.trim().length > 0 && !busy && !disabled;

  return (
    <div className="cmp-wrap">
      {replyTo && (
        <div className="cmp-reply">
          <CornerDownRight style={{width:11,height:11,color:"#7c3aed",flexShrink:0}}/>
          <span className="cmp-reply-name">{replyTo.sender}</span>
          <span className="cmp-reply-txt">{replyTo.text.slice(0,60)}{replyTo.text.length>60?"…":""}</span>
          <button className="cmp-reply-x" onClick={onCancelReply}><X style={{width:11,height:11}}/></button>
        </div>
      )}
      <div className="cmp-fmt">
        {[
          { Icon: Bold,   title: "Bold",   fn: () => wrapSelection("**") },
          { Icon: Italic, title: "Italic", fn: () => wrapSelection("*") },
          { Icon: Code,   title: "Code",   fn: () => wrapSelection("`") },
          { Icon: AtSign, title: "Mention",fn: () => { onChange(value + "@"); setTimeout(()=>taRef.current?.focus(),0); } },
        ].map(({ Icon, title, fn }) => (
          <button key={title} title={title} className="cmp-fmt-btn" onClick={fn}>
            <Icon style={{width:12,height:12}}/>
          </button>
        ))}
        <div className="cmp-sep"/>
        <button className={cn("cmp-fmt-btn", showPreview && "cmp-fmt-btn--on")} title="Preview" onClick={() => setShowPreview(p=>!p)}>
          <Eye style={{width:12,height:12}}/>
        </button>
        <button className="cmp-fmt-btn cmp-fmt-btn--schedule" title="Schedule message"
          disabled={!value.trim()} onClick={() => value.trim() && onSchedule(value)}>
          <Clock style={{width:12,height:12}}/><span className="cmp-fmt-lbl">Schedule</span>
        </button>
      </div>

      {mentions.length > 0 && (
        <div className="cmp-mention-list">
          {mentions.map(m => (
            <button key={m.id} className="cmp-mention-item" onClick={() => insertMention(m)}>
              <div className={cn("cmp-mention-av", m.isAll && "cmp-mention-av--all")}>
                {m.isAll ? "✦" : m.name[0]?.toUpperCase()}
              </div>
              <div>
                <span className={cn("cmp-mention-name", m.isAll && "cmp-mention-name--all")}>@{m.name}</span>
                {m.isAll && <span className="cmp-mention-desc"> · Notify everyone</span>}
              </div>
            </button>
          ))}
        </div>
      )}

      {showPreview && value.trim() && (
        <div className="cmp-preview">
          <div className="cmp-preview-label">Preview</div>
          <div className="cmp-preview-body" dangerouslySetInnerHTML={{__html: renderMd(value)}}/>
        </div>
      )}

      <div className="cmp-row">
        <button className="cmp-icon" onClick={onFile} disabled={!!busy} title="Attach file">
          <Paperclip style={{width:16,height:16}}/>
        </button>
        <textarea
          ref={taRef}
          className="cmp-ta"
          placeholder={placeholder}
          value={value}
          onChange={handleChange}
          disabled={!!disabled || !!busy}
          rows={1}
          onKeyDown={e => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (canSend) onSend(); }
            if (e.key === "Escape") setMentions([]);
            if (e.key === "Tab" && mentions.length > 0) { e.preventDefault(); insertMention(mentions[0]); }
          }}
        />
        <button className={cn("cmp-send", canSend && "cmp-send--on")} onClick={onSend} disabled={!canSend} title="Send (Enter)">
          <Send style={{width:15,height:15}}/>
        </button>
      </div>
      <p className="cmp-hint">Enter to send · Shift+Enter newline · **bold** · *italic* · `code` · @mention</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  THREAD PANEL
// ─────────────────────────────────────────────────────────────
function ThreadPanel({ parent, members, myId, onClose }: {
  parent: RtMsg; members: TeamMember[]; myId: string; onClose: () => void;
}) {
  const [replies, setReplies] = useState<RtMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const botRef = useRef<HTMLDivElement>(null);
  const profCache = useRef(new Map<string,{full_name:string|null;email:string|null}>());

  const loadReplies = useCallback(async () => {
    const { data } = await supabase.from("team_messages" as any).select("*").eq("parent_id", parent.id).order("created_at", { ascending: true });
    if (!data?.length) { setReplies([]); setLoading(false); return; }
    const senderIds = [...new Set((data as any[]).map((r:any) => r.sender_id))];
    const { data: profiles } = await supabase.from("profiles").select("id, full_name, email").in("id", senderIds);
    const pm = new Map(profiles?.map((p:any) => [p.id, p]) ?? []);
    profiles?.forEach((p:any) => profCache.current.set(p.id, p));
    setReplies((data as any[]).map((r:any) => ({ ...r, sender: pm.get(r.sender_id) ?? null })));
    setLoading(false);
  }, [parent.id]);

  useEffect(() => { loadReplies(); }, [loadReplies]);
  useEffect(() => { botRef.current?.scrollIntoView({ behavior: "smooth" }); }, [replies.length]);

  useEffect(() => {
    const ch = supabase.channel(`thread:${parent.id}`)
      .on("postgres_changes", { event:"INSERT", schema:"public", table:"team_messages", filter:`parent_id=eq.${parent.id}` },
        async ({ new: row }: any) => {
          let sender = profCache.current.get(row.sender_id) ?? null;
          if (!sender) {
            const { data } = await supabase.from("profiles").select("id,full_name,email").eq("id", row.sender_id).single();
            if (data) { sender = data; profCache.current.set(row.sender_id, data); }
          }
          setReplies(p => [...p, { ...row, sender }]);
          if (row.sender_id !== myId) playPing();
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [parent.id, myId]);

  const send = async () => {
    if (!input.trim() || sending) return;
    setSending(true);
    try {
      await supabase.from("team_messages" as any).insert({
        conversation_id: parent.conversation_id, sender_id: myId,
        message_text: input.trim(), parent_id: parent.id,
      });
      setInput("");
    } catch { toast({ title: "Failed to send reply", variant: "destructive" }); }
    finally { setSending(false); }
  };

  const pSender = parent.sender?.full_name || parent.sender?.email || "Unknown";
  return (
    <div className="thread-overlay">
      <div className="thread-panel">
        <div className="thread-hdr">
          <MessageCircle style={{width:14,height:14,color:"#818cf8"}}/>
          <span className="thread-title">Thread · {replies.length} {replies.length===1?"reply":"replies"}</span>
          <button className="panel-close" onClick={onClose}><X style={{width:13,height:13}}/></button>
        </div>
        <div className="thread-body">
          <div className="thread-parent">
            <div className="msg-av small">{initials(pSender)}</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
                <p className="msg-sender">{pSender}</p>
                <span className="meta-time">{format(new Date(parent.created_at),"MMM d, h:mm a")}</span>
              </div>
              <div className="bubble them" style={{borderRadius:12,marginTop:4}}>
                <p className="bubble-txt" dangerouslySetInnerHTML={{__html:renderMd(parent.message_text)}}/>
              </div>
            </div>
          </div>
          {loading ? <div className="center-spin"><Loader2 className="spin"/></div>
            : replies.length === 0 ? (
              <div className="thread-empty"><Reply style={{width:22,height:22,opacity:.15}}/><p>No replies yet</p></div>
            ) : replies.map(r => {
              const isMe = r.sender_id === myId;
              const name = r.sender?.full_name || r.sender?.email || "Unknown";
              return (
                <div key={r.id} className={cn("msg-row thread-reply", isMe ? "msg-me" : "msg-them")} style={{marginBottom:6}}>
                  {!isMe && <div className="msg-av small">{initials(name)}</div>}
                  <div className={cn("msg-body", isMe ? "body-me" : "body-them")}>
                    {!isMe && <p className="msg-sender">{name}</p>}
                    <div className={cn("bubble", isMe ? "me" : "them")}>
                      <p className="bubble-txt" dangerouslySetInnerHTML={{__html:renderMd(r.message_text)}}/>
                    </div>
                    <div className={cn("msg-meta", isMe && "msg-meta--me")}>
                      <span className="meta-time">{format(new Date(r.created_at),"h:mm a")}</span>
                    </div>
                    <ReactBar msgId={r.id} myId={myId}/>
                  </div>
                </div>
              );
            })}
          <div ref={botRef}/>
        </div>
        <Composer value={input} onChange={setInput} onSend={send}
          onFile={()=>{}} onSchedule={()=>{}}
          members={members} myId={myId} placeholder="Reply in thread…" busy={sending}/>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  PINS PANEL
// ─────────────────────────────────────────────────────────────
function PinsPanel({ convId, onClose }: { convId:string; onClose:()=>void }) {
  const [pins, setPins] = useState<PinRow[]>([]); const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    try {
      const { data } = await supabase.from("pinned_messages" as any).select("*").eq("conversation_id",convId).order("created_at",{ascending:false});
      setPins((data||[]) as PinRow[]); setLoading(false);
    } catch { setLoading(false); }
  },[convId]);
  useEffect(()=>{ load(); },[load]);
  return (
    <div className="thread-overlay">
      <div className="thread-panel">
        <div className="thread-hdr">
          <Pin style={{width:13,height:13,color:"#f59e0b"}}/>
          <span className="thread-title">Pinned Messages</span>
          <button className="panel-close" onClick={onClose}><X style={{width:13,height:13}}/></button>
        </div>
        <div className="thread-body">
          {loading ? <div className="center-spin"><Loader2 className="spin"/></div>
            : pins.length===0 ? (
              <div className="panel-empty"><Pin style={{width:28,height:28,opacity:.2}}/><p>No pinned messages</p></div>
            ) : pins.map(p=>(
              <div key={p.id} className="pin-item">
                <Pin style={{width:11,height:11,color:"#f59e0b",flexShrink:0,marginTop:2}}/>
                <div style={{flex:1,minWidth:0}}>
                  <p className="pin-txt">{p.message_preview||"(no preview)"}</p>
                  <p className="pin-meta">{format(new Date(p.created_at),"MMM d, h:mm a")}</p>
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  CONTEXT MENU
// ─────────────────────────────────────────────────────────────
function CtxMenu({ pos, isMe, onClose, on }: {
  pos:{x:number;y:number}; isMe:boolean; onClose:()=>void;
  on:{ copy:()=>void; reply:()=>void; pin:()=>void; save:()=>void; edit?:()=>void; del?:()=>void; }
}) {
  const ref=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const h=(e:MouseEvent)=>{ if(!ref.current?.contains(e.target as Node)) onClose(); };
    document.addEventListener("mousedown",h); return ()=>document.removeEventListener("mousedown",h);
  },[onClose]);
  const items:[React.ElementType,string,()=>void,boolean][] = [
    [MessageCircle,"Reply in Thread",on.reply,false],
    [Copy,"Copy Text",on.copy,false],
    [Pin,"Pin Message",on.pin,false],
    [Bookmark,"Save Message",on.save,false],
    ...(isMe?([[Pencil,"Edit Message",on.edit!,false],[Trash2,"Delete",on.del!,true]] as [React.ElementType,string,()=>void,boolean][]):[]),
  ];
  return (
    <div ref={ref} style={{position:"fixed",left:Math.min(pos.x,window.innerWidth-190),top:Math.min(pos.y,window.innerHeight-items.length*36-8),zIndex:9999}} className="ctx-menu">
      {items.map(([Icon,label,fn,danger],i)=>(
        <button key={i} className={cn("ctx-item",danger&&"ctx-item--danger")} onClick={()=>{fn();onClose();}}>
          <Icon style={{width:13,height:13}}/>{label}
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  REPLY COUNT BADGE
// ─────────────────────────────────────────────────────────────
function ReplyCountBadge({ msgId, onClick }: { msgId: string; onClick: () => void }) {
  const [count, setCount] = useState<number|null>(null);
  useEffect(() => {
    supabase.from("team_messages" as any).select("id", { count: "exact", head: true }).eq("parent_id", msgId)
      .then(({ count: c }) => setCount(c ?? 0));
  }, [msgId]);
  if (count === null || count === 0) return null;
  return (
    <button className="reply-count-badge" onClick={onClick}>
      <MessageCircle style={{width:10,height:10}}/>{count} {count===1?"reply":"replies"}<ChevronDown style={{width:9,height:9,opacity:.6}}/>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
//  MAIN CHAT THREAD
// ─────────────────────────────────────────────────────────────
function ChatThread({ convId, convs, onBack, isOnline, members, myId, dealRoom, getStatus }: {
  convId:string; convs:Conversation[]; onBack:()=>void;
  isOnline:(id:string)=>boolean; members:TeamMember[]; myId:string;
  dealRoom?: DealRoom;
  getStatus: (uid: string) => UserStatus;
}) {
  const qc = useQueryClient();
  const { messages:base, messagesLoading, sendMessage, readReceipts } = useConversationMessages(convId);
  const { typingUsers, sendTyping, sendStopTyping } = useTypingIndicator(convId);

  const [rtAdded, setRtAdded]   = useState<RtMsg[]>([]);
  const [rtDel, setRtDel]       = useState<Set<string>>(new Set());
  const [rtEdit, setRtEdit]     = useState<Map<string,string>>(new Map());
  const [optDel, setOptDel]     = useState<Set<string>>(new Set());
  const [input, setInput]       = useState("");
  const [pFile, setPFile]       = useState<File|null>(null);
  const [busy, setBusy]         = useState(false);
  const [editId, setEditId]     = useState<string|null>(null);
  const [editTxt, setEditTxt]   = useState("");
  const [ctx, setCtx]           = useState<{id:string;x:number;y:number}|null>(null);
  const [thread, setThread]     = useState<RtMsg|null>(null);
  const [showPins, setShowPins] = useState(false);
  const [muted, setMuted]       = useState(false);
  const [scheduleFor, setSched] = useState<string|null>(null);
  const [showSched, setShowSched] = useState(false);
  const [quoteReply, setQuoteReply] = useState<{id:string;text:string;sender:string}|null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef   = useRef<HTMLInputElement>(null);
  const editRef   = useRef<HTMLInputElement>(null);
  const typTimer  = useRef<NodeJS.Timeout|null>(null);

  const conv = convs.find(c=>c.id===convId);
  const name = conv ? getConversationName(conv) : dealRoom?.deal_name || "Chat";
  const isGrp= conv?.is_group ?? false;
  const otherId = !isGrp ? conv?.participants?.[0]?.user_id : undefined;
  const otherOn = otherId ? isOnline(otherId) : false;
  const otherStatus = otherId ? getStatus(otherId) : "available";
  const myName = members.find(m=>m.user_id===myId)?.profile?.full_name || "You";

  useEffect(()=>{
    (async()=>{
      try {
        const { data } = await supabase.from("conversation_preferences" as any)
          .select("is_muted").eq("conversation_id",convId).eq("user_id",myId).maybeSingle();
        setMuted(!!(data as any)?.is_muted);
      } catch {}
    })();
  },[convId,myId]);

  const toggleMute = async () => {
    const v=!muted; setMuted(v);
    await supabase.from("conversation_preferences" as any).upsert({
      conversation_id:convId, user_id:myId, is_muted:v, updated_at:new Date().toISOString(),
    });
    toast({title:v?"Conversation muted":"Unmuted"});
  };

  const profCache = useRef(new Map<string,{full_name:string|null;email:string|null}>());
  useEffect(()=>{ base.forEach(m=>{ if(m.sender) profCache.current.set(m.sender_id,m.sender as any); }); },[base]);

  const onInsert = useCallback((m:RtMsg)=>{
    if (m.parent_id) return;
    setRtAdded(p=>{ if(p.some(x=>x.id===m.id)||base.some(x=>x.id===m.id)) return p; return [...p,m]; });
    qc.invalidateQueries({queryKey:["team-conversations"]});
  },[base,qc]);
  const onDelete = useCallback((id:string)=>{ setRtDel(p=>new Set([...p,id])); setOptDel(p=>new Set([...p,id])); },[]);
  const onUpdate = useCallback((id:string,text:string)=>{ setRtEdit(p=>new Map(p).set(id,text)); },[]);

  useRealtimeChannel(convId, myId, profCache, onInsert, onDelete, onUpdate);

  const messages = useMemo(()=>{
    const del=new Set([...rtDel,...optDel]);
    const merged=[
      ...base.filter((m:any)=>!del.has(m.id)&&!m.parent_id&&!rtAdded.some(r=>r.id===m.id)),
      ...rtAdded.filter(m=>!del.has(m.id)&&!m.parent_id),
    ].sort((a,b)=>new Date(a.created_at).getTime()-new Date(b.created_at).getTime());
    return merged.map(m=>{ const ed=rtEdit.get(m.id); return ed!==undefined?{...m,message_text:ed}:m; });
  },[base,rtAdded,rtDel,rtEdit,optDel]);

  useEffect(()=>{ scrollRef.current?.scrollIntoView({behavior:"smooth"}); },[messages.length]);
  useEffect(()=>{ if(editId&&editRef.current) editRef.current.focus(); },[editId]);

  const handleInput = (v:string) => {
    setInput(v);
    if(v.trim()){ sendTyping(myName); if(typTimer.current) clearTimeout(typTimer.current); typTimer.current=setTimeout(()=>sendStopTyping(),2000); }
    else sendStopTyping();
  };

  const upload = async (file:File) => {
    const ext=file.name.split(".").pop()??"bin";
    const path=`${convId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from("team-attachments").upload(path,file,{contentType:file.type});
    if(error) throw error;
    const { data } = supabase.storage.from("team-attachments").getPublicUrl(path);
    return { url:data.publicUrl, name:file.name, type:file.type };
  };

  const handleSend = async () => {
    if(!input.trim()&&!pFile) return;
    setBusy(true);
    try {
      let fd:any;
      if(pFile) fd=await upload(pFile);
      sendMessage.mutate({ text: input.trim() || (pFile?.name ?? "Attachment"), file_url:fd?.url, file_name:fd?.name, file_type:fd?.type } as any);
      setInput(""); setPFile(null); setQuoteReply(null); sendStopTyping();
    } finally { setBusy(false); }
  };

  const saveEdit = async (id:string) => {
    const prev=messages.find(m=>m.id===id)?.message_text??"";
    setRtEdit(p=>new Map(p).set(id,editTxt.trim())); setEditId(null); setEditTxt("");
    try { await supabase.from("team_messages").update({message_text:editTxt.trim()}).eq("id",id); toast({title:"Updated"});
    } catch { setRtEdit(p=>new Map(p).set(id,prev)); toast({title:"Failed",variant:"destructive"}); }
  };

  const delMsg = useCallback(async (id:string)=>{
    setOptDel(p=>new Set([...p,id])); setCtx(null);
    try { await supabase.from("team_messages").delete().eq("id",id); toast({title:"Deleted"});
    } catch { setOptDel(p=>{ const s=new Set(p);s.delete(id);return s; }); }
  },[]);

  const pinMsg = async (id:string,text:string) => {
    try {
      await supabase.from("pinned_messages" as any).insert({ message_id:id, conversation_id:convId, pinned_by:myId, message_preview:text.slice(0,120) });
      toast({title:"Pinned"});
    } catch { toast({title:"Could not pin",variant:"destructive"}); }
  };

  const saveMsg = async (id:string) => {
    try { await supabase.from("saved_messages" as any).insert({message_id:id,user_id:myId}); toast({title:"Saved"}); }
    catch { toast({title:"Could not save",variant:"destructive"}); }
  };

  const grouped = useMemo(()=>{
    const g:{label:string;msgs:typeof messages}[]=[];let last="";
    messages.forEach(m=>{
      const d=new Date(m.created_at);
      const lbl=isToday(d)?"Today":isYesterday(d)?"Yesterday":format(d,"MMMM d, yyyy");
      if(lbl!==last){g.push({label:lbl,msgs:[]});last=lbl;}
      g[g.length-1].msgs.push(m);
    });
    return g;
  },[messages]);

  function rsStatus(at:string,sid:string,rr:ReadReceipt[]):"none"|"sent"|"read" {
    if(sid!==myId) return "none";
    return rr.some(r=>r.last_read_at&&new Date(r.last_read_at)>=new Date(at))?"read":"sent";
  }

  const otherStatusCfg = STATUS_CONFIG[otherStatus];

  return (
    <div className="thread">
      {dealRoom && <DealRoomHeader room={dealRoom} />}

      <div className="chat-hdr">
        <button className="back-btn" onClick={onBack}><ArrowLeft style={{width:15,height:15}}/></button>
        <div style={{position:"relative",flexShrink:0}}>
          <div className="chat-av">
            {isGrp
              ? <Users style={{width:14,height:14,color:"#a78bfa"}}/>
              : dealRoom
              ? <Building2 style={{width:14,height:14,color:"#60a5fa"}}/>
              : <span style={{fontSize:12,fontWeight:700,color:"#818cf8"}}>{conv?getConversationInitials(conv):"?"}</span>}
          </div>
          {!isGrp && otherId && (
            <span className="pres-dot" style={{ background: otherOn ? otherStatusCfg.color : "rgba(255,255,255,.13)" }} />
          )}
        </div>
        <div className="chat-info">
          <p className="chat-name">{name}</p>
          {typingUsers.length > 0
            ? <p className="chat-typing">typing…</p>
            : !isGrp && otherId
            ? <p className="chat-sub" style={{color: otherOn ? otherStatusCfg.color : "rgba(255,255,255,.28)"}}>
                {otherOn ? `${otherStatusCfg.emoji} ${otherStatusCfg.label}` : "○ Offline"}
              </p>
            : isGrp
            ? <p className="chat-sub" style={{color:"rgba(255,255,255,.3)"}}>{(conv?.participants.length??0)+1} members</p>
            : null}
        </div>
        <div className="hdr-acts">
          <button className={cn("hdr-btn",showSched&&"hdr-btn--on")} title="Scheduled" onClick={()=>setShowSched(p=>!p)}>
            <Clock style={{width:13,height:13}}/>
          </button>
          <button className={cn("hdr-btn",showPins&&"hdr-btn--on")} title="Pinned" onClick={()=>setShowPins(p=>!p)}>
            <Pin style={{width:13,height:13}}/>
          </button>
          <button className={cn("hdr-btn",muted&&"hdr-btn--muted")} title={muted?"Unmute":"Mute"} onClick={toggleMute}>
            {muted?<BellOff style={{width:13,height:13}}/>:<Bell style={{width:13,height:13}}/>}
          </button>
        </div>
        {typingUsers.length>0&&<div className="typing-dots"><span/><span/><span/></div>}
      </div>

      {showPins && <PinsPanel convId={convId} onClose={()=>setShowPins(false)}/>}
      {showSched && <ScheduledList convId={convId} myId={myId} onClose={()=>setShowSched(false)}/>}
      {thread && <ThreadPanel parent={thread} members={members} myId={myId} onClose={()=>setThread(null)}/>}

      <div className="msgs-area">
        {messagesLoading ? <div className="center-spin"><Loader2 className="spin"/></div>
          : messages.length===0 ? (
            <div className="empty-chat">
              <div className="empty-icon">
                {dealRoom
                  ? <Building2 style={{width:22,height:22,color:"#60a5fa"}}/>
                  : <MessageSquare style={{width:22,height:22,color:"#7c3aed"}}/>}
              </div>
              <p className="empty-title">{dealRoom ? `${dealRoom.deal_name} Deal Room` : "No messages yet"}</p>
              <p className="empty-sub">
                {dealRoom
                  ? "Discuss this deal, share insights, and track next steps"
                  : "Start the conversation below"}
              </p>
            </div>
          ) : grouped.map(grp=>(
            <div key={grp.label}>
              <div className="divider-row"><div className="div-line"/><span className="div-label">{grp.label}</span><div className="div-line"/></div>
              {grp.msgs.map((msg,i)=>{
                const isMe=msg.sender_id===myId;
                const st=rsStatus(msg.created_at,msg.sender_id,readReceipts);
                const showRec=isMe&&(!grp.msgs[i+1]||grp.msgs[i+1].sender_id!==myId);
                const same=grp.msgs[i-1]?.sender_id===msg.sender_id;
                const isDel=optDel.has(msg.id);
                const isEd=editId===msg.id;
                const nm=msg.sender?.full_name||msg.sender?.email||"Unknown";
                const isImg=(t?:string|null)=>!!t?.startsWith("image/");
                // System messages from sentinel UUID
                const isSystem = msg.sender_id === "00000000-0000-0000-0000-000000000000";

                if (isSystem) {
                  return (
                    <div key={msg.id} className="sys-msg">
                      <div className="sys-msg-icon"><Zap style={{width:12,height:12}}/></div>
                      <div className="sys-msg-body" dangerouslySetInnerHTML={{__html: renderMd(msg.message_text)}}/>
                      <span className="sys-msg-time">{format(new Date(msg.created_at),"h:mm a")}</span>
                    </div>
                  );
                }

                return (
                  <div key={msg.id}
                    className={cn("msg-row",isMe?"msg-me":"msg-them",same&&"msg-same",rtAdded.some(r=>r.id===msg.id)&&!isMe&&"msg-new")}
                    style={{opacity:isDel?.2:1,transition:"opacity .15s",pointerEvents:isDel?"none":undefined}}
                    onContextMenu={e=>{if(!isDel){e.preventDefault();setCtx({id:msg.id,x:e.clientX,y:e.clientY});}}}>

                    {!isMe&&!same&&<div className="msg-av">{initials(nm)}</div>}
                    {!isMe&&same&&<div className="msg-av-sp"/>}

                    <div className={cn("msg-body",isMe?"body-me":"body-them")}>
                      {!isMe&&!same&&<p className="msg-sender">{nm}</p>}
                      {isEd?(
                        <div className="edit-wrap">
                          <input ref={editRef} value={editTxt} onChange={e=>setEditTxt(e.target.value)}
                            onKeyDown={e=>{if(e.key==="Enter")saveEdit(msg.id);if(e.key==="Escape"){setEditId(null);setEditTxt("");}}}
                            className="edit-input"/>
                          <button className="edit-save" onClick={()=>saveEdit(msg.id)}>Save</button>
                          <button className="edit-cancel" onClick={()=>{setEditId(null);setEditTxt("");}}>×</button>
                        </div>
                      ):(
                        <div className={cn("bubble",isMe?"me":"them")}>
                          {msg.file_url&&(
                            <div className="attach">
                              {isImg((msg as any).file_type)
                                ?<a href={msg.file_url} target="_blank" rel="noopener noreferrer"><img src={msg.file_url} alt={(msg as any).file_name??"img"} className="attach-img"/></a>
                                :<a href={msg.file_url} target="_blank" rel="noopener noreferrer" className={cn("attach-file",isMe&&"attach-file--me")}>
                                  <FileText style={{width:13,height:13,flexShrink:0}}/><span className="attach-name">{(msg as any).file_name??"File"}</span>
                                </a>}
                            </div>
                          )}
                          {(!msg.file_url||msg.message_text!==(msg as any).file_name)&&(
                            <div className="bubble-txt" dangerouslySetInnerHTML={{__html:renderMd(msg.message_text)}}/>
                          )}
                        </div>
                      )}
                      {!isDel&&!isEd&&<ReactBar msgId={msg.id} myId={myId}/>}
                      {!isDel&&!isEd&&<ReplyCountBadge msgId={msg.id} onClick={()=>setThread(msg as RtMsg)}/>}
                      {!isEd&&!isDel&&(
                        <div className={cn("ha-row",isMe?"ha-row--me":"ha-row--them")}>
                          {[
                            [MessageCircle,"Thread",()=>setThread(msg as RtMsg)],
                            [Copy,"Copy",()=>{navigator.clipboard.writeText(msg.message_text);toast({title:"Copied"});}],
                            [Pin,"Pin",()=>pinMsg(msg.id,msg.message_text)],
                            [Bookmark,"Save",()=>saveMsg(msg.id)],
                            ...(isMe?[[Pencil,"Edit",()=>{setEditId(msg.id);setEditTxt(msg.message_text);}],[Trash2,"Delete",()=>delMsg(msg.id)]]:[] as any[]),
                          ].map(([Icon,title,fn]:any,k)=>(
                            <button key={k} className={cn("ha",title==="Delete"&&"ha-del")} title={title} onClick={fn}>
                              <Icon style={{width:11,height:11}}/>
                            </button>
                          ))}
                        </div>
                      )}
                      <div className={cn("msg-meta",isMe&&"msg-meta--me")}>
                        <span className="meta-time">{format(new Date(msg.created_at),"h:mm a")}</span>
                        {showRec&&st==="read"&&<CheckCheck style={{width:12,height:12,color:"#818cf8"}}/>}
                        {showRec&&st==="sent"&&<Check style={{width:12,height:12,color:"rgba(255,255,255,.3)"}}/>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        <div ref={scrollRef}/>
      </div>

      {ctx&&(()=>{
        const m=messages.find(x=>x.id===ctx.id);
        return <CtxMenu pos={{x:ctx.x,y:ctx.y}} isMe={m?.sender_id===myId} onClose={()=>setCtx(null)} on={{
          copy:()=>{navigator.clipboard.writeText(m?.message_text??"");toast({title:"Copied"});},
          reply:()=>{ if(m) setThread(m as RtMsg); },
          pin:()=>{ if(m) pinMsg(m.id,m.message_text); },
          save:()=>{ if(m) saveMsg(m.id); },
          edit:()=>{ if(m){setEditId(m.id);setEditTxt(m.message_text);} },
          del:()=>delMsg(ctx.id),
        }}/>;
      })()}

      {pFile&&(
        <div className="file-prev">
          {pFile.type.startsWith("image/")?<ImageIcon style={{width:13,height:13,color:"#818cf8",flexShrink:0}}/>:<FileText style={{width:13,height:13,color:"#818cf8",flexShrink:0}}/>}
          <span className="fp-name">{pFile.name}</span>
          <span className="fp-size">{(pFile.size/1024).toFixed(0)}KB</span>
          <button className="ha" onClick={()=>setPFile(null)}><X style={{width:11,height:11}}/></button>
        </div>
      )}

      <input type="file" ref={fileRef} className="sr-only"
        onChange={e=>{const f=e.target.files?.[0];if(f&&f.size<=20*1024*1024)setPFile(f);e.target.value="";}}
        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"/>

      <Composer value={input} onChange={handleInput} onSend={handleSend}
        onFile={()=>fileRef.current?.click()}
        onSchedule={(text) => setSched(text)}
        members={members} myId={myId} busy={busy}
        replyTo={quoteReply} onCancelReply={()=>setQuoteReply(null)}
        placeholder={dealRoom ? `Message in ${dealRoom.deal_name}…` : "Message… (@ to mention)"}
      />

      {scheduleFor && (
        <ScheduleDialog convId={convId} myId={myId} text={scheduleFor}
          onClose={()=>setSched(null)} onScheduled={()=>{ setInput(""); setSched(null); }}/>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  SIDEBAR SECTION
// ─────────────────────────────────────────────────────────────
function SidebarSection({ label, icon: Icon, count, children, defaultOpen = true }: {
  label: string; icon: React.ElementType; count?: number;
  children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="sb-section">
      <button className="sb-section-hdr" onClick={() => setOpen(p => !p)}>
        <Icon style={{ width: 10, height: 10 }} />
        <span className="sb-section-label">{label}</span>
        {count != null && count > 0 && <span className="sb-section-ct">{count}</span>}
        <span style={{ marginLeft: "auto" }}>
          {open ? <ChevronDown style={{ width: 10, height: 10 }} /> : <ChevronRight style={{ width: 10, height: 10 }} />}
        </span>
      </button>
      {open && children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  NEW CONVERSATION DIALOG
// ─────────────────────────────────────────────────────────────
function NewConvDialog({ open,onClose,members,myId,teamId,convs,refetch,onCreate,isOnline,getStatus }: {
  open:boolean;onClose:()=>void;members:TeamMember[];myId:string;teamId:string;
  convs:Conversation[];refetch:()=>void;onCreate:(id:string)=>void;
  isOnline:(id:string)=>boolean; getStatus:(uid:string)=>UserStatus;
}) {
  const { startConversation }=useConversationMessages(null);
  const [sel,setSel]=useState<string[]>([]);
  const others=members.filter(m=>m.user_id!==myId&&m.status==="active");
  const tog=(uid:string)=>setSel(p=>p.includes(uid)?p.filter(x=>x!==uid):[...p,uid]);
  const go=async()=>{
    if(!sel.length) return;
    try {
      if(sel.length===1){
        const ex=convs.find(c=>!c.is_group&&c.participants.length===1&&c.participants.some(p=>p.user_id===sel[0]));
        if(ex){setSel([]);onCreate(ex.id);return;}
      }
      const id=await startConversation.mutateAsync({teamId,memberIds:sel});
      refetch();setSel([]);onCreate(id);toast({title:"Conversation started"});
    } catch(e:any){toast({title:"Could not start chat",description:e?.message,variant:"destructive"});}
  };
  return (
    <Dialog open={open} onOpenChange={v=>{if(!v){setSel([]);onClose();}}}>
      <DialogContent style={{background:"#0d1117",border:"1px solid rgba(255,255,255,.08)",borderRadius:16}}>
        <DialogHeader><DialogTitle style={{color:"#f0f6fc",fontFamily:"'Bricolage Grotesque',sans-serif"}}>New Conversation</DialogTitle></DialogHeader>
        {sel.length>1&&<p style={{fontSize:11,color:"rgba(255,255,255,.35)"}}>Group · {sel.length} members</p>}
        <div style={{maxHeight:280,overflowY:"auto",display:"flex",flexDirection:"column",gap:3}}>
          {others.length===0?<p style={{fontSize:12,color:"rgba(255,255,255,.3)",padding:"20px 0",textAlign:"center"}}>No other members</p>
            :others.map(m=>{
              const nm=m.profile?.full_name||m.invited_email||"Unknown";
              const chk=sel.includes(m.user_id);
              const status = getStatus(m.user_id);
              const stCfg = STATUS_CONFIG[status];
              return(
                <div key={m.id} onClick={()=>tog(m.user_id)}
                  style={{display:"flex",alignItems:"center",gap:10,padding:"9px 12px",borderRadius:10,cursor:"pointer",border:"1px solid",
                    borderColor:chk?"rgba(124,58,237,.4)":"transparent",background:chk?"rgba(124,58,237,.1)":"transparent",transition:"all .13s"}}>
                  <Checkbox checked={chk} className="pointer-events-none"/>
                  <div style={{position:"relative",flexShrink:0}}>
                    <Avatar className="h-8 w-8"><AvatarFallback className="bg-violet-500/20 text-violet-400 text-xs font-bold">{initials(nm)}</AvatarFallback></Avatar>
                    <StatusBadge status={status} size="xs" />
                  </div>
                  <div>
                    <p style={{fontSize:13,fontWeight:500,color:"#e2e8f0",margin:0}}>{nm}</p>
                    <p style={{fontSize:10,fontWeight:600,color:stCfg.color,margin:0}}>
                      {stCfg.emoji} {stCfg.label}
                    </p>
                  </div>
                </div>
              );
            })}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={()=>{setSel([]);onClose();}}>Cancel</Button>
          <Button size="sm" disabled={!sel.length||startConversation.isPending} onClick={go} style={{background:"linear-gradient(135deg,#7c3aed,#6d28d9)"}}>
            {sel.length>1?"Create Group":"Start Chat"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────
//  NOTIFICATIONS PANEL
// ─────────────────────────────────────────────────────────────
const NI:{[k:string]:React.ElementType}={comment:MessageSquare,coaching:TrendingUp,mention:AtSign,system:AlertCircle};
function NotifsPanel() {
  const { notifications,notificationsLoading,unreadCount,markRead,markAllRead } = useNotifications();
  const [filter,setFilter]=useState<"all"|"unread">("all");
  const items=notifications.filter(n=>filter==="all"||!n.is_read);
  return (
    <div className="notif-panel">
      <div className="notif-hdr">
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span className="notif-title">Notifications</span>
          {unreadCount>0&&<span className="notif-badge">{unreadCount}</span>}
        </div>
        <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
          {(["all","unread"] as const).map(f=>(
            <button key={f} className={cn("filter-btn",filter===f&&"filter-btn--on")} onClick={()=>setFilter(f)}>{f==="all"?"All":"Unread"}</button>
          ))}
          {unreadCount>0&&<button className="filter-btn" onClick={()=>markAllRead.mutate()}><CheckCheck style={{width:11,height:11}}/> All read</button>}
        </div>
      </div>
      <div className="notif-list">
        {notificationsLoading?<div className="center-spin"><Loader2 className="spin"/></div>
          :items.length===0?<div className="panel-empty"><Bell style={{width:28,height:28,opacity:.2}}/><p>{filter==="unread"?"No unread":"All caught up"}</p></div>
          :items.map(n=>{
            const Ic=NI[n.type]??Bell;
            return (
              <div key={n.id} className={cn("notif-item",!n.is_read&&"notif-item--unread")} onClick={()=>!n.is_read&&markRead.mutate(n.id)}>
                <div className="notif-icon"><Ic style={{width:13,height:13}}/></div>
                <div style={{flex:1,minWidth:0}}>
                  <p className={cn("notif-txt",!n.is_read&&"notif-txt--bold")}>{n.message}</p>
                  <p className="meta-time" style={{marginTop:2}}>{format(new Date(n.created_at),"MMM d, h:mm a")}</p>
                </div>
                {!n.is_read&&<div className="notif-dot"/>}
              </div>
            );
          })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  ROOT PAGE
// ─────────────────────────────────────────────────────────────
export default function MessagesPage() {
  const { user } = useAuth();
  const { team, members } = useTeam();

  // ── DB-backed status (replaces local hook) ─────────────────────────
  const { myStatus, setStatus, getStatus } = useUserStatus(team?.id);

  // ── DB-backed deal rooms (replaces buildDealRoomsFromCalls) ────────
  const { dealRooms, isLoading: dealRoomsLoading } = useDealRooms();

  const { conversations, conversationsLoading, totalUnread, refetchConversations } = useTeamMessaging(team?.id);
  const { unreadCount: notifCount } = useNotifications();
  const isOnline = usePresence(team?.id, user?.id);

  const [sel, setSel]             = useState<string|null>(null);
  const [tab, setTab]             = useState<"deals"|"chats"|"notifs">("deals");
  const [newOpen, setNewOpen]     = useState(false);
  const [mobile, setMobile]       = useState<"list"|"chat">("list");
  const [showSearch, setShowSearch] = useState(false);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  // activeDealRoom is now the real DealRoom from useDealRooms
  const [activeDealRoom, setActiveDealRoom] = useState<DealRoom|null>(null);

  // Stats derived from real deal rooms
  const atRiskDeals = dealRooms.filter(d => d.stage === "at_risk").length;
  const wonDeals    = dealRooms.filter(d => d.stage === "won").length;
  const totalBadge  = totalUnread + notifCount + (dealRooms.reduce((s, r) => s + (r.unread_count ?? 0), 0));

  const myStatusCfg = STATUS_CONFIG[myStatus];

  const pick = (id: string) => { setSel(id); setMobile("chat"); setTab("chats"); setActiveDealRoom(null); };

  // When a deal room is selected, open its real conversation_id
  const pickDealRoom = (room: DealRoom) => {
    setActiveDealRoom(room);
    setSel(null);
    setMobile("chat");
  };

  const back = () => { setMobile("list"); setActiveDealRoom(null); };

  const handleSearchNavigate = (convId?: string) => {
    if (convId) { setSel(convId); setMobile("chat"); }
  };

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setShowSearch(true); }
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, []);

  const dmConvs    = conversations.filter(c => !c.is_group);
  const groupConvs = conversations.filter(c => c.is_group);

  // The conversation ID to render in ChatThread:
  // - for regular convos: sel
  // - for deal rooms: activeDealRoom.conversation_id (real DB id)
  const activeChatConvId = activeDealRoom?.conversation_id ?? sel;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;1,400&family=Bricolage+Grotesque:wght@600;700;800&display=swap');

        .mp {
          --bg0:#060912; --bg1:#0b0f1c; --bg2:#0f1424;
          --bdr:rgba(255,255,255,.07); --bdr2:rgba(255,255,255,.04);
          --ac:#7c3aed; --acg:rgba(124,58,237,.35); --acs:rgba(124,58,237,.12);
          --t1:#f0f6fc; --t2:rgba(255,255,255,.6); --t3:rgba(255,255,255,.3); --t4:rgba(255,255,255,.14);
          --grn:#22c55e; --amr:#f59e0b; --red:#ef4444;
          --deal:#60a5fa;
          display:flex; flex-direction:column;
          height:calc(100dvh - 4rem); margin:-28px; overflow:hidden;
          background:var(--bg0); font-family:'DM Sans',system-ui,sans-serif;
          -webkit-font-smoothing:antialiased;
        }
        @media(max-width:767px){ .mp{ margin:-16px; height:calc(100dvh - 3rem); padding-bottom:56px; } }

        @keyframes spin   { to { transform:rotate(360deg); } }
        @keyframes bounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-4px)} }
        @keyframes slideIn{ from{transform:translateX(100%);opacity:0} to{transform:translateX(0);opacity:1} }
        @keyframes fadeIn { from{opacity:0} to{opacity:1} }
        @keyframes pop    { from{opacity:0;transform:scale(.94) translateY(6px)} to{opacity:1;transform:scale(1) translateY(0)} }
        @keyframes mentionPop{ from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }
        @keyframes searchSlide{ from{opacity:0;transform:translateY(-20px) scale(.97)} to{opacity:1;transform:translateY(0) scale(1)} }
        @keyframes statusPop{ from{opacity:0;transform:translateY(8px) scale(.96)} to{opacity:1;transform:translateY(0) scale(1)} }

        .topbar{ display:flex; align-items:center; justify-content:space-between; padding:0 18px; height:52px; flex-shrink:0; background:rgba(11,15,28,.97); border-bottom:1px solid var(--bdr); backdrop-filter:blur(20px); gap:10px; }
        .topbar-l{ display:flex; align-items:center; gap:9px; min-width:0; }
        .topbar-icon{ width:30px; height:30px; border-radius:9px; background:rgba(96,165,250,.12); border:1px solid rgba(96,165,250,.2); display:flex; align-items:center; justify-content:center; flex-shrink:0; }
        .topbar-title{ font-size:15px; font-weight:700; color:var(--t1); font-family:'Bricolage Grotesque',sans-serif; white-space:nowrap; }
        .topbar-badge{ font-size:10px; font-weight:700; background:linear-gradient(135deg,#7c3aed,#6d28d9); color:#fff; padding:2px 8px; border-radius:20px; box-shadow:0 2px 8px var(--acg); flex-shrink:0; }
        .topbar-r{ display:flex; align-items:center; gap:6px; flex-shrink:0; }
        .search-btn{ display:flex; align-items:center; gap:7px; background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.09); border-radius:9px; padding:6px 12px; color:var(--t3); font-size:12px; cursor:pointer; transition:.13s; font-family:'DM Sans',sans-serif; }
        .search-btn:hover{ background:rgba(255,255,255,.07); color:var(--t2); }
        .search-shortcut{ font-size:10px; background:rgba(255,255,255,.08); border:1px solid rgba(255,255,255,.1); border-radius:5px; padding:1px 5px; color:var(--t4); font-family:monospace; }
        .status-btn{ display:flex; align-items:center; gap:6px; background:rgba(255,255,255,.04); border:1px solid var(--bdr); border-radius:9px; padding:5px 10px; cursor:pointer; font-size:12px; color:var(--t2); transition:.13s; font-family:'DM Sans',sans-serif; position:relative; }
        .status-btn:hover{ background:rgba(255,255,255,.08); }
        .status-btn-emoji{ font-size:13px; }
        .status-btn-label{ display:none; }
        @media(min-width:900px){ .status-btn-label{ display:inline; } }
        .new-btn{ display:flex; align-items:center; gap:6px; background:linear-gradient(135deg,#7c3aed,#6d28d9); border:none; border-radius:9px; padding:7px 14px; color:#fff; font-size:12px; font-weight:600; cursor:pointer; box-shadow:0 3px 12px var(--acg); font-family:'DM Sans',sans-serif; transition:transform .15s, box-shadow .15s; white-space:nowrap; }
        .new-btn:hover{ transform:translateY(-1px); box-shadow:0 6px 18px var(--acg); }

        .status-picker{ position:absolute; top:calc(100% + 8px); right:0; z-index:9999; background:rgba(10,13,22,.98); border:1px solid rgba(255,255,255,.1); border-radius:14px; padding:8px; width:220px; box-shadow:0 20px 60px rgba(0,0,0,.7); animation:statusPop .16s ease; }
        .sp-title{ font-size:10px; font-weight:700; color:var(--t4); text-transform:uppercase; letter-spacing:.08em; padding:4px 8px 8px; }
        .sp-item{ display:flex; align-items:center; gap:9px; width:100%; padding:9px 10px; border-radius:9px; background:transparent; border:none; cursor:pointer; transition:.12s; font-family:'DM Sans',sans-serif; }
        .sp-item:hover{ background:rgba(255,255,255,.06); }
        .sp-item--active{ background:rgba(124,58,237,.1); }
        .sp-emoji{ font-size:16px; }
        .sp-label{ font-size:13px; font-weight:500; color:var(--t1); }
        .sp-divider{ height:1px; background:var(--bdr2); margin:6px 0; }
        .sp-input{ width:100%; background:rgba(255,255,255,.05); border:1px solid rgba(255,255,255,.09); border-radius:8px; padding:7px 10px; color:var(--t1); font-size:12px; font-family:'DM Sans',sans-serif; outline:none; }
        .sp-input::placeholder{ color:var(--t4); }
        .sp-input:focus{ border-color:rgba(124,58,237,.4); }

        .gs-overlay{ position:fixed; inset:0; z-index:9990; background:rgba(0,0,0,.7); backdrop-filter:blur(8px); display:flex; align-items:flex-start; justify-content:center; padding-top:80px; animation:fadeIn .15s ease; }
        .gs-panel{ width:100%; max-width:640px; margin:0 16px; background:rgba(10,13,22,.99); border:1px solid rgba(255,255,255,.1); border-radius:18px; overflow:hidden; box-shadow:0 40px 100px rgba(0,0,0,.8); animation:searchSlide .18s ease; max-height:calc(100vh - 120px); display:flex; flex-direction:column; }
        .gs-input-wrap{ display:flex; align-items:center; gap:12px; padding:16px 20px; border-bottom:1px solid var(--bdr); }
        .gs-input{ flex:1; background:transparent; border:none; outline:none; color:var(--t1); font-size:16px; font-family:'DM Sans',sans-serif; }
        .gs-input::placeholder{ color:var(--t4); }
        .gs-close{ background:rgba(255,255,255,.07); border:1px solid var(--bdr); border-radius:7px; width:28px; height:28px; display:flex; align-items:center; justify-content:center; cursor:pointer; color:var(--t3); flex-shrink:0; transition:.12s; }
        .gs-close:hover{ color:var(--t1); background:rgba(255,255,255,.12); }
        .gs-filters{ display:flex; gap:4px; padding:10px 16px; border-bottom:1px solid var(--bdr2); flex-shrink:0; flex-wrap:wrap; }
        .gs-filter{ display:flex; align-items:center; gap:5px; padding:4px 10px; border-radius:20px; background:transparent; border:1px solid transparent; color:var(--t3); font-size:11px; font-weight:600; cursor:pointer; font-family:'DM Sans',sans-serif; transition:.12s; }
        .gs-filter:hover{ background:rgba(255,255,255,.05); color:var(--t1); }
        .gs-filter--on{ background:var(--acs); border-color:rgba(124,58,237,.3); color:#a78bfa; }
        .gs-results{ flex:1; overflow-y:auto; padding:8px 0; }
        .gs-empty{ display:flex; flex-direction:column; align-items:center; gap:10px; padding:48px 20px; text-align:center; color:var(--t3); }
        .gs-empty p{ font-size:13px; margin:0; }
        .gs-count{ font-size:10px; font-weight:600; color:var(--t4); text-transform:uppercase; letter-spacing:.08em; padding:4px 20px 8px; }
        .gs-result{ display:flex; align-items:center; gap:12px; width:100%; padding:11px 20px; background:transparent; border:none; cursor:pointer; text-align:left; transition:.12s; border-bottom:1px solid var(--bdr2); font-family:'DM Sans',sans-serif; }
        .gs-result:last-child{ border-bottom:none; }
        .gs-result:hover{ background:rgba(255,255,255,.03); }
        .gs-result-icon{ width:32px; height:32px; border-radius:9px; flex-shrink:0; display:flex; align-items:center; justify-content:center; }
        .gs-result-body{ flex:1; min-width:0; }
        .gs-result-top{ display:flex; align-items:center; gap:8px; margin-bottom:3px; }
        .gs-result-title{ font-size:13px; font-weight:600; color:var(--t1); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; flex:1; }
        .gs-result-type{ font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; flex-shrink:0; }
        .gs-result-time{ font-size:10px; color:var(--t4); flex-shrink:0; }
        .gs-result-preview{ font-size:12px; color:var(--t3); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin:0; }

        .body{ display:flex; flex:1; min-height:0; }
        .sidebar{ width:288px; flex-shrink:0; display:flex; flex-direction:column; border-right:1px solid var(--bdr); background:var(--bg1); }
        @media(max-width:767px){ .sidebar{ width:100%; border-right:none; } .sidebar--hidden{ display:none; } }
        .tabs{ display:flex; gap:4px; padding:7px 9px; border-bottom:1px solid var(--bdr2); flex-shrink:0; }
        .tab{ flex:1; display:flex; align-items:center; justify-content:center; gap:5px; padding:7px 0; border-radius:8px; background:transparent; border:1px solid transparent; color:var(--t3); font-size:12px; font-weight:600; cursor:pointer; transition:all .13s; font-family:'DM Sans',sans-serif; }
        .tab--on{ background:var(--acs); border-color:rgba(124,58,237,.25); color:#a78bfa; }
        .tab-badge{ background:var(--ac); color:#fff; font-size:9px; font-weight:700; padding:1px 5px; border-radius:10px; }

        .sb-section{ margin-bottom:2px; }
        .sb-section-hdr{ display:flex; align-items:center; gap:6px; width:100%; padding:6px 12px; background:transparent; border:none; cursor:pointer; font-family:'DM Sans',sans-serif; transition:.12s; }
        .sb-section-hdr:hover{ background:rgba(255,255,255,.03); }
        .sb-section-label{ font-size:10px; font-weight:700; color:var(--t4); text-transform:uppercase; letter-spacing:.08em; flex:1; text-align:left; }
        .sb-section-ct{ background:var(--acs); color:#a78bfa; font-size:9px; padding:1px 6px; border-radius:10px; }

        .deals-panel{ flex:1; overflow-y:auto; padding:4px 8px 8px; }
        .deal-stats{ display:grid; grid-template-columns:1fr 1fr 1fr; gap:6px; padding:8px 10px; margin-bottom:4px; }
        .deal-stat{ background:rgba(255,255,255,.03); border:1px solid var(--bdr2); border-radius:10px; padding:8px 10px; text-align:center; }
        .deal-stat-val{ font-size:18px; font-weight:800; font-family:'Bricolage Grotesque',sans-serif; color:var(--t1); }
        .deal-stat-lbl{ font-size:9px; color:var(--t4); text-transform:uppercase; letter-spacing:.06em; }

        .dr-card{ width:100%; text-align:left; background:rgba(255,255,255,.02); border:1px solid rgba(255,255,255,.05); border-radius:11px; padding:10px 11px; margin-bottom:5px; cursor:pointer; transition:all .13s; font-family:'DM Sans',sans-serif; }
        .dr-card:hover{ background:rgba(255,255,255,.05); border-color:rgba(96,165,250,.2); }
        .dr-card--active{ background:rgba(96,165,250,.07)!important; border-color:rgba(96,165,250,.3)!important; }
        .dr-card-top{ display:flex; align-items:center; gap:8px; margin-bottom:6px; }
        .dr-card-icon{ width:28px; height:28px; border-radius:7px; flex-shrink:0; display:flex; align-items:center; justify-content:center; font-size:14px; }
        .dr-card-info{ flex:1; min-width:0; }
        .dr-card-name{ font-size:12px; font-weight:600; color:var(--t1); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .dr-card-company{ font-size:10px; color:var(--t3); }
        .dr-unread{ min-width:16px; height:16px; border-radius:8px; background:linear-gradient(135deg,#7c3aed,#6d28d9); font-size:9px; font-weight:700; color:#fff; padding:0 3px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
        .dr-card-meta{ display:flex; align-items:center; gap:6px; margin-bottom:5px; flex-wrap:wrap; }
        .dr-stage-badge{ font-size:10px; font-weight:600; padding:2px 7px; border-radius:20px; }
        .dr-sentiment{ font-size:10px; font-weight:500; }
        .dr-next-step{ display:flex; align-items:center; gap:5px; font-size:10px; color:#60a5fa; margin-top:5px; background:rgba(96,165,250,.08); border-radius:6px; padding:3px 7px; }

        .drh-wrap{ display:flex; align-items:center; gap:12px; flex-wrap:wrap; padding:10px 16px; border-bottom:1px solid rgba(96,165,250,.12); background:rgba(96,165,250,.04); flex-shrink:0; }
        .drh-left{ display:flex; align-items:center; gap:9px; }
        .drh-icon{ width:32px; height:32px; border-radius:8px; flex-shrink:0; display:flex; align-items:center; justify-content:center; }
        .drh-name{ font-size:13px; font-weight:600; color:var(--t1); font-family:'Bricolage Grotesque',sans-serif; }
        .drh-company{ font-size:10px; color:var(--t3); }
        .drh-stats{ display:flex; align-items:center; gap:12px; flex-wrap:wrap; margin-left:auto; }
        .drh-stat{ display:flex; flex-direction:column; gap:1px; }
        .drh-stat-label{ font-size:9px; color:var(--t4); text-transform:uppercase; letter-spacing:.06em; }
        .drh-stat-val{ font-size:12px; font-weight:600; color:var(--t1); }
        .drh-stat--next{ max-width:200px; }
        .drh-stat-val--next{ font-size:11px; color:#60a5fa; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

        .conv-list{ flex:1; overflow-y:auto; padding:0 6px 8px; }
        .conv-item{ width:100%; display:flex; align-items:center; gap:9px; padding:9px 10px; border-radius:10px; border:1px solid transparent; background:transparent; cursor:pointer; text-align:left; transition:all .12s; margin-bottom:2px; font-family:'DM Sans',sans-serif; }
        .conv-item:hover{ background:rgba(255,255,255,.03); }
        .conv-item--active{ background:var(--acs)!important; border-color:rgba(124,58,237,.22)!important; }
        .conv-av-wrap{ position:relative; flex-shrink:0; }
        .conv-av{ width:38px; height:38px; border-radius:11px; background:rgba(124,58,237,.18); border:1px solid rgba(124,58,237,.2); display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:700; color:#a78bfa; }
        .conv-av--grp{ background:rgba(139,92,246,.15); color:#c084fc; }
        .conv-unread{ position:absolute; top:-4px; left:-4px; min-width:16px; height:16px; border-radius:8px; background:linear-gradient(135deg,#7c3aed,#6d28d9); display:flex; align-items:center; justify-content:center; font-size:9px; font-weight:700; color:#fff; padding:0 3px; box-shadow:0 2px 6px var(--acg); }
        .conv-info{ flex:1; min-width:0; }
        .conv-row1{ display:flex; justify-content:space-between; align-items:baseline; gap:4px; }
        .conv-name{ font-size:13px; font-weight:500; color:rgba(255,255,255,.7); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .conv-name--bold{ font-weight:700; color:var(--t1); }
        .conv-preview{ font-size:11px; color:var(--t3); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin:1px 0 0; }
        .conv-preview--bold{ color:rgba(255,255,255,.5); font-weight:500; }
        .conv-chev{ color:var(--t4); flex-shrink:0; }
        @media(min-width:768px){ .conv-chev{ display:none; } }

        .right{ flex:1; display:flex; flex-direction:column; min-width:0; background:rgba(6,9,18,.7); }
        @media(max-width:767px){ .right--hidden{ display:none; } }
        .right-empty{ flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:40px; }
        .re-icon{ width:72px; height:72px; border-radius:20px; margin-bottom:20px; background:rgba(96,165,250,.08); border:1px solid rgba(96,165,250,.15); display:flex; align-items:center; justify-content:center; }
        .right-empty h3{ font-size:18px; font-weight:700; color:#64748b; font-family:'Bricolage Grotesque',sans-serif; margin:0 0 8px; }
        .right-empty p{ font-size:13px; color:var(--t4); max-width:280px; line-height:1.6; margin:0 0 24px; }
        .re-actions{ display:flex; gap:10px; flex-wrap:wrap; justify-content:center; }
        .re-btn{ display:inline-flex; align-items:center; gap:7px; background:linear-gradient(135deg,#7c3aed,#6d28d9); border:none; border-radius:10px; padding:9px 18px; color:#fff; font-size:13px; font-weight:600; cursor:pointer; font-family:'DM Sans',sans-serif; }
        .re-btn-secondary{ display:inline-flex; align-items:center; gap:7px; background:rgba(96,165,250,.1); border:1px solid rgba(96,165,250,.2); border-radius:10px; padding:9px 18px; color:#60a5fa; font-size:13px; font-weight:600; cursor:pointer; font-family:'DM Sans',sans-serif; }

        .sys-msg{ display:flex; align-items:flex-start; gap:9px; margin:10px 0; padding:11px 14px; background:rgba(96,165,250,.05); border:1px solid rgba(96,165,250,.12); border-radius:12px; border-left:3px solid rgba(96,165,250,.4); }
        .sys-msg-icon{ width:22px; height:22px; border-radius:6px; flex-shrink:0; background:rgba(96,165,250,.15); color:#60a5fa; display:flex; align-items:center; justify-content:center; margin-top:1px; }
        .sys-msg-body{ flex:1; font-size:12px; color:rgba(255,255,255,.7); line-height:1.55; }
        .sys-msg-time{ font-size:10px; color:var(--t4); flex-shrink:0; margin-top:3px; }

        .thread{ display:flex; flex-direction:column; height:100%; position:relative; }
        .chat-hdr{ display:flex; align-items:center; gap:9px; padding:10px 14px; flex-shrink:0; background:rgba(11,15,28,.93); border-bottom:1px solid var(--bdr); backdrop-filter:blur(20px); flex-wrap:nowrap; min-width:0; }
        .back-btn{ background:rgba(255,255,255,.05); border:1px solid var(--bdr); border-radius:8px; width:29px; height:29px; min-width:29px; display:flex; align-items:center; justify-content:center; cursor:pointer; color:var(--t2); flex-shrink:0; transition:.12s; }
        .back-btn:hover{ background:rgba(255,255,255,.09); }
        @media(min-width:768px){ .back-btn{ display:none; } }
        .chat-av{ width:34px; height:34px; border-radius:9px; flex-shrink:0; min-width:34px; background:linear-gradient(135deg,rgba(124,58,237,.25),rgba(109,40,217,.25)); border:1px solid rgba(124,58,237,.28); display:flex; align-items:center; justify-content:center; }
        .chat-info{ flex:1; min-width:0; }
        .chat-name{ font-size:14px; font-weight:600; color:var(--t1); font-family:'Bricolage Grotesque',sans-serif; margin:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .chat-sub{ font-size:11px; margin:0; }
        .chat-typing{ font-size:11px; margin:0; color:#a78bfa; font-style:italic; }
        .hdr-acts{ display:flex; align-items:center; gap:3px; flex-shrink:0; }
        .hdr-btn{ width:27px; height:27px; border-radius:7px; background:transparent; border:1px solid transparent; display:flex; align-items:center; justify-content:center; cursor:pointer; color:var(--t3); transition:.12s; }
        .hdr-btn:hover{ background:rgba(255,255,255,.06); color:var(--t1); }
        .hdr-btn--on{ background:var(--acs); border-color:rgba(124,58,237,.3); color:#a78bfa; }
        .hdr-btn--muted{ color:#f59e0b; }
        .typing-dots{ display:flex; gap:3px; align-items:center; flex-shrink:0; }
        .typing-dots span{ width:5px; height:5px; border-radius:50%; background:#7c3aed; display:block; }
        .typing-dots span:nth-child(1){ animation:bounce 1.2s 0s infinite; }
        .typing-dots span:nth-child(2){ animation:bounce 1.2s .2s infinite; }
        .typing-dots span:nth-child(3){ animation:bounce 1.2s .4s infinite; }

        .msgs-area{ flex:1; overflow-y:auto; padding:14px 16px; }
        @media(max-width:767px){ .msgs-area{ padding:10px 10px 10px; } }
        .center-spin{ display:flex; justify-content:center; padding:40px 0; }
        .spin{ width:20px; height:20px; color:#7c3aed; animation:spin 1s linear infinite; }
        .empty-chat{ display:flex; flex-direction:column; align-items:center; justify-content:center; padding:60px 20px; text-align:center; }
        .empty-icon{ width:56px; height:56px; border-radius:16px; margin-bottom:14px; background:rgba(124,58,237,.1); border:1px solid rgba(124,58,237,.2); display:flex; align-items:center; justify-content:center; }
        .empty-title{ font-size:15px; font-weight:600; color:#64748b; margin:0 0 6px; font-family:'Bricolage Grotesque',sans-serif; }
        .empty-sub{ font-size:12px; color:var(--t4); margin:0; max-width:260px; line-height:1.6; }

        .divider-row{ display:flex; align-items:center; gap:10px; margin:16px 0 10px; }
        .div-line{ flex:1; height:1px; background:var(--bdr2); }
        .div-label{ font-size:10px; font-weight:600; letter-spacing:.07em; text-transform:uppercase; color:var(--t3); padding:3px 9px; background:rgba(255,255,255,.03); border:1px solid var(--bdr2); border-radius:20px; white-space:nowrap; }

        .msg-row{ display:flex; margin-bottom:2px; position:relative; }
        .msg-me{ justify-content:flex-end; margin-top:3px; }
        .msg-them{ justify-content:flex-start; margin-top:3px; }
        .msg-row:not(.msg-same){ margin-top:10px; }
        .msg-new .bubble{ animation:pop .22s ease forwards; }
        .msg-av{ width:30px; height:30px; border-radius:8px; flex-shrink:0; min-width:30px; background:rgba(124,58,237,.2); border:1px solid rgba(124,58,237,.2); display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:700; color:#818cf8; margin-right:8px; margin-top:2px; }
        .msg-av.small{ width:26px; height:26px; font-size:10px; margin-right:6px; min-width:26px; }
        .msg-av-sp{ width:38px; flex-shrink:0; min-width:38px; }
        .msg-body{ display:flex; flex-direction:column; max-width:72%; position:relative; }
        @media(max-width:480px){ .msg-body{ max-width:86%; } }
        .body-me{ align-items:flex-end; }
        .body-them{ align-items:flex-start; }
        .msg-sender{ font-size:10px; color:var(--t3); margin:0 0 3px 2px; font-weight:500; }

        .bubble{ padding:9px 13px; line-height:1.55; cursor:context-menu; word-break:break-word; transition:all .13s; }
        .bubble.me{ background:linear-gradient(135deg,#7c3aed,#6d28d9); border:1px solid rgba(124,58,237,.4); border-radius:16px 16px 4px 16px; box-shadow:0 3px 16px rgba(124,58,237,.28); }
        .bubble.them{ background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.07); border-radius:16px 16px 16px 4px; }
        .bubble-txt{ font-size:13px; color:#fff; margin:0; font-family:'DM Sans',sans-serif; line-height:1.6; }
        .bubble.them .bubble-txt{ color:rgba(255,255,255,.84); }
        @media(max-width:767px){ .bubble-txt{ font-size:14px; } .bubble{ padding:10px 14px; } }
        .md-code{ background:rgba(0,0,0,.35); border-radius:4px; padding:1px 5px; font-family:monospace; font-size:12px; }
        .md-pre{ background:rgba(0,0,0,.4); border-radius:8px; padding:10px 12px; font-family:monospace; font-size:11px; overflow-x:auto; margin:4px 0 0; white-space:pre; }
        .md-mention{ color:#c084fc; font-weight:700; background:rgba(192,132,252,.1); border-radius:4px; padding:0 3px; }
        .md-mention--all{ color:#fbbf24; background:rgba(251,191,36,.12); }

        .reply-count-badge{ display:inline-flex; align-items:center; gap:4px; margin-top:4px; padding:2px 8px 2px 6px; background:var(--acs); border:1px solid rgba(124,58,237,.3); border-radius:20px; font-size:10px; font-weight:600; color:#a78bfa; cursor:pointer; transition:all .13s; }
        .reply-count-badge:hover{ background:rgba(124,58,237,.2); }

        .rxn-bar{ display:flex; flex-wrap:wrap; gap:3px; margin-top:4px; align-items:center; }
        .rxn-chip{ display:inline-flex; align-items:center; gap:3px; background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.1); border-radius:20px; padding:2px 7px; cursor:pointer; font-size:13px; transition:all .12s; }
        .rxn-chip:hover{ background:rgba(255,255,255,.1); }
        .rxn-chip--mine{ background:var(--acs); border-color:rgba(124,58,237,.4); }
        .rxn-chip span{ font-size:11px; color:rgba(255,255,255,.7); font-weight:600; }
        .rxn-add{ width:21px; height:21px; border-radius:50%; background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.08); display:flex; align-items:center; justify-content:center; cursor:pointer; color:var(--t3); transition:.12s; }
        .rxn-add:hover{ background:rgba(255,255,255,.1); color:var(--t1); }

        .ep-wrap{ position:absolute; bottom:calc(100% + 6px); left:0; z-index:9999; background:rgba(10,13,22,.97); backdrop-filter:blur(20px); border:1px solid rgba(255,255,255,.1); border-radius:12px; padding:12px; width:216px; box-shadow:0 20px 60px rgba(0,0,0,.7); animation:fadeIn .12s ease; }
        .ep-label{ font-size:9px; font-weight:700; color:var(--t4); text-transform:uppercase; letter-spacing:.08em; margin:8px 0 4px; }
        .ep-label:first-child{ margin-top:0; }
        .ep-grid{ display:grid; grid-template-columns:repeat(6,1fr); gap:2px; }
        .ep-btn{ padding:5px; border:none; background:transparent; cursor:pointer; font-size:16px; border-radius:6px; transition:.1s; text-align:center; }
        .ep-btn:hover{ background:rgba(255,255,255,.1); }

        .ha-row{ display:none; position:absolute; top:4px; background:rgba(11,15,28,.96); border:1px solid var(--bdr); border-radius:9px; padding:3px; box-shadow:0 8px 24px rgba(0,0,0,.5); gap:2px; align-items:center; }
        .ha-row--me{ right:calc(100% + 6px); }
        .ha-row--them{ left:calc(100% + 6px); }
        @media(min-width:768px){ .msg-row:hover .ha-row{ display:flex; } }
        .ha{ background:transparent; border:none; border-radius:6px; padding:4px 5px; cursor:pointer; color:rgba(255,255,255,.35); display:flex; align-items:center; transition:.12s; }
        .ha:hover{ background:rgba(255,255,255,.08); color:#fff; }
        .ha-del:hover{ background:rgba(239,68,68,.15); color:#f87171; }

        .edit-wrap{ display:flex; align-items:center; gap:5px; background:rgba(124,58,237,.1); border:1px solid rgba(124,58,237,.3); border-radius:12px; padding:7px 10px; }
        .edit-input{ background:transparent; border:none; outline:none; color:var(--t1); font-size:13px; min-width:80px; flex:1; font-family:'DM Sans',sans-serif; }
        .edit-save{ background:#7c3aed; border:none; border-radius:6px; padding:3px 9px; color:#fff; font-size:11px; font-weight:600; cursor:pointer; }
        .edit-cancel{ background:transparent; border:none; color:var(--t3); cursor:pointer; font-size:16px; line-height:1; padding:0 2px; }

        .msg-meta{ display:flex; align-items:center; gap:4px; margin-top:3px; padding:0 2px; }
        .msg-meta--me{ justify-content:flex-end; }
        .meta-time{ font-size:10px; color:var(--t4); }

        .cmp-wrap{ border-top:1px solid var(--bdr2); background:rgba(11,15,28,.85); backdrop-filter:blur(12px); flex-shrink:0; }
        .cmp-reply{ display:flex; align-items:center; gap:7px; padding:7px 14px; background:rgba(124,58,237,.08); border-bottom:1px solid rgba(124,58,237,.15); }
        .cmp-reply-name{ font-size:11px; font-weight:700; color:#a78bfa; flex-shrink:0; }
        .cmp-reply-txt{ font-size:11px; color:var(--t3); flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .cmp-reply-x{ background:none; border:none; color:var(--t3); cursor:pointer; padding:0; display:flex; }
        .cmp-fmt{ display:flex; align-items:center; gap:2px; padding:6px 12px 0; border-top:1px solid var(--bdr2); flex-wrap:wrap; }
        .cmp-fmt-btn{ background:transparent; border:none; color:var(--t3); padding:4px 7px; border-radius:6px; cursor:pointer; font-size:12px; display:flex; align-items:center; justify-content:center; transition:.12s; min-width:26px; gap:4px; }
        .cmp-fmt-btn:hover{ background:rgba(255,255,255,.07); color:var(--t1); }
        .cmp-fmt-btn--on{ background:var(--acs); color:#a78bfa; }
        .cmp-fmt-btn--schedule{ margin-left:auto; background:rgba(124,58,237,.08); border:1px solid rgba(124,58,237,.2); color:#a78bfa; border-radius:8px; padding:3px 10px; }
        .cmp-fmt-btn--schedule:hover{ background:rgba(124,58,237,.18); }
        .cmp-fmt-btn--schedule:disabled{ opacity:.4; cursor:not-allowed; }
        .cmp-fmt-lbl{ font-size:11px; font-weight:600; }
        .cmp-sep{ width:1px; height:14px; background:var(--bdr); margin:0 2px; }
        .cmp-mention-list{ background:rgba(10,13,22,.98); border:1px solid rgba(255,255,255,.1); border-bottom:none; overflow:hidden; animation:mentionPop .14s ease; box-shadow:0 -12px 30px rgba(0,0,0,.4); }
        .cmp-mention-item{ display:flex; align-items:center; gap:9px; width:100%; padding:9px 14px; background:transparent; border:none; border-bottom:1px solid rgba(255,255,255,.05); cursor:pointer; text-align:left; color:var(--t1); font-family:'DM Sans',sans-serif; transition:.1s; }
        .cmp-mention-item:hover{ background:var(--acs); }
        .cmp-mention-av{ width:26px; height:26px; border-radius:7px; background:rgba(124,58,237,.2); border:1px solid rgba(124,58,237,.25); display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:700; color:#a78bfa; flex-shrink:0; }
        .cmp-mention-av--all{ background:rgba(251,191,36,.15); border-color:rgba(251,191,36,.3); color:#fbbf24; }
        .cmp-mention-name{ font-size:13px; font-weight:600; color:var(--t1); }
        .cmp-mention-name--all{ color:#fbbf24; }
        .cmp-mention-desc{ font-size:11px; color:var(--t3); }
        .cmp-preview{ margin:0 12px 6px; padding:10px 12px; background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.07); border-radius:10px; animation:fadeIn .15s ease; }
        .cmp-preview-label{ font-size:9px; font-weight:700; color:var(--t4); text-transform:uppercase; letter-spacing:.08em; margin-bottom:6px; }
        .cmp-preview-body{ font-size:13px; color:rgba(255,255,255,.75); line-height:1.6; }
        .cmp-row{ display:flex; align-items:flex-end; gap:7px; padding:8px 12px; }
        .cmp-icon{ background:none; border:none; cursor:pointer; color:var(--t3); display:flex; align-items:center; padding:6px; border-radius:7px; transition:.12s; flex-shrink:0; }
        .cmp-icon:hover{ color:var(--t1); background:rgba(255,255,255,.06); }
        .cmp-ta{ flex:1; background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.08); border-radius:10px; padding:8px 12px; color:var(--t1); font-size:13px; font-family:'DM Sans',sans-serif; resize:none; outline:none; line-height:1.55; transition:border-color .13s; min-height:36px; max-height:160px; }
        .cmp-ta::placeholder{ color:var(--t4); }
        .cmp-ta:focus{ border-color:rgba(124,58,237,.4); }
        @media(max-width:767px){ .cmp-ta{ font-size:16px; } }
        .cmp-send{ width:34px; height:34px; border-radius:10px; border:none; background:rgba(124,58,237,.3); color:rgba(255,255,255,.4); display:flex; align-items:center; justify-content:center; cursor:pointer; flex-shrink:0; transition:all .13s; align-self:flex-end; }
        .cmp-send--on{ background:linear-gradient(135deg,#7c3aed,#6d28d9); color:#fff; box-shadow:0 3px 12px var(--acg); }
        .cmp-send--on:hover{ transform:scale(1.05); }
        .cmp-hint{ font-size:10px; color:var(--t4); text-align:center; padding:0 0 8px; margin:0; font-family:'DM Sans',sans-serif; }
        @media(max-width:767px){ .cmp-hint{ display:none; } }

        .sch-dlg{ background:#0d1117!important; border:1px solid rgba(255,255,255,.08)!important; border-radius:16px!important; }
        .sch-title{ display:flex; align-items:center; gap:8px; font-family:'Bricolage Grotesque',sans-serif; color:#f0f6fc; font-size:16px; }
        .sch-preview{ padding:10px 14px; background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.07); border-radius:10px; margin-bottom:4px; }
        .sch-preview-label{ font-size:9px; font-weight:700; color:var(--t4); text-transform:uppercase; letter-spacing:.08em; margin-bottom:6px; }
        .sch-preview-txt{ font-size:12px; color:rgba(255,255,255,.6); line-height:1.5; }
        .sch-field{ display:flex; flex-direction:column; gap:5px; }
        .sch-label{ font-size:12px; font-weight:600; color:rgba(255,255,255,.5); }
        .sch-input{ width:100%; background:rgba(255,255,255,.05); border:1px solid rgba(255,255,255,.1); border-radius:10px; padding:10px 12px; color:#f0f6fc; font-size:13px; font-family:'DM Sans',sans-serif; outline:none; transition:border-color .13s; color-scheme:dark; }
        .sch-input:focus{ border-color:rgba(124,58,237,.4); }
        .sch-hint{ font-size:11px; color:var(--t4); margin:0; }
        .sch-footer{ display:flex; gap:8px; justify-content:flex-end; margin-top:4px; }
        .sch-btn-cancel{ background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.1); border-radius:9px; padding:8px 16px; color:var(--t2); font-size:13px; font-weight:500; cursor:pointer; font-family:'DM Sans',sans-serif; transition:.13s; }
        .sch-btn-cancel:hover{ background:rgba(255,255,255,.1); }
        .sch-btn-save{ display:flex; align-items:center; gap:6px; background:linear-gradient(135deg,#7c3aed,#6d28d9); border:none; border-radius:9px; padding:8px 18px; color:#fff; font-size:13px; font-weight:600; cursor:pointer; font-family:'DM Sans',sans-serif; transition:all .13s; box-shadow:0 3px 10px var(--acg); }
        .sch-btn-save:hover{ transform:translateY(-1px); }
        .sch-btn-save:disabled{ opacity:.4; cursor:not-allowed; transform:none; }
        .sched-item{ padding:12px 14px; border-radius:10px; background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.06); margin-bottom:6px; display:flex; flex-direction:column; gap:6px; }
        .sched-when{ display:flex; align-items:center; gap:5px; font-size:10px; font-weight:600; color:#a78bfa; }
        .sched-txt{ font-size:12px; color:rgba(255,255,255,.6); line-height:1.4; }
        .sched-cancel{ display:inline-flex; align-items:center; gap:4px; font-size:10px; color:#f87171; background:rgba(239,68,68,.1); border:1px solid rgba(239,68,68,.2); border-radius:6px; padding:3px 8px; cursor:pointer; align-self:flex-end; font-family:'DM Sans',sans-serif; transition:.12s; }

        .thread-overlay{ position:absolute; inset:0; z-index:40; pointer-events:none; }
        .thread-panel{ position:absolute; right:0; top:0; bottom:0; width:360px; background:var(--bg2); border-left:1px solid var(--bdr); display:flex; flex-direction:column; pointer-events:all; animation:slideIn .22s ease; box-shadow:-20px 0 60px rgba(0,0,0,.5); }
        @media(max-width:767px){ .thread-panel{ width:100%; border-left:none; } }
        .thread-hdr{ display:flex; align-items:center; gap:8px; padding:13px 16px; border-bottom:1px solid var(--bdr); flex-shrink:0; }
        .thread-title{ font-size:13px; font-weight:600; color:var(--t1); font-family:'Bricolage Grotesque',sans-serif; flex:1; }
        .panel-close{ background:rgba(255,255,255,.06); border:1px solid var(--bdr); border-radius:7px; width:26px; height:26px; display:flex; align-items:center; justify-content:center; cursor:pointer; color:var(--t3); transition:.12s; }
        .panel-close:hover{ color:var(--t1); background:rgba(255,255,255,.1); }
        .thread-body{ flex:1; overflow-y:auto; padding:12px; }
        .panel-empty{ display:flex; flex-direction:column; align-items:center; gap:8px; padding:32px 16px; text-align:center; color:var(--t3); font-size:12px; }
        .thread-parent{ display:flex; gap:9px; padding:12px; background:rgba(255,255,255,.03); border-radius:10px; margin-bottom:10px; border-left:3px solid #7c3aed; }
        .thread-empty{ display:flex; flex-direction:column; align-items:center; gap:8px; padding:32px 16px; text-align:center; color:var(--t3); font-size:12px; }
        .thread-reply{ margin-top:4px!important; }
        .pin-item{ display:flex; gap:8px; padding:10px 12px; border-radius:9px; background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.05); margin-bottom:6px; }
        .pin-txt{ font-size:12px; color:rgba(255,255,255,.7); margin:0 0 3px; line-height:1.4; }
        .pin-meta{ font-size:10px; color:var(--t4); margin:0; }

        .attach{ margin-bottom:6px; }
        .attach-img{ border-radius:8px; max-width:100%; max-height:160px; object-fit:cover; display:block; }
        .attach-file{ display:flex; align-items:center; gap:7px; padding:7px 10px; border-radius:8px; text-decoration:none; background:rgba(255,255,255,.1); font-size:12px; color:rgba(255,255,255,.85); }
        .attach-file--me{ background:rgba(255,255,255,.15); }
        .attach-name{ overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .file-prev{ display:flex; align-items:center; gap:7px; margin:0 14px 4px; background:rgba(124,58,237,.07); border:1px solid rgba(124,58,237,.2); border-radius:10px; padding:7px 12px; }
        .fp-name{ flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:12px; color:#94a3b8; }
        .fp-size{ font-size:10px; color:var(--t3); flex-shrink:0; }

        .ctx-menu{ background:rgba(10,13,22,.97); backdrop-filter:blur(20px); border:1px solid rgba(255,255,255,.08); border-radius:12px; box-shadow:0 20px 60px rgba(0,0,0,.7); overflow:hidden; width:190px; animation:fadeIn .12s ease; }
        .ctx-item{ display:flex; align-items:center; gap:9px; width:100%; padding:9px 14px; background:transparent; border:none; border-bottom:1px solid rgba(255,255,255,.05); color:rgba(255,255,255,.7); font-size:12px; font-weight:500; cursor:pointer; font-family:'DM Sans',sans-serif; transition:.12s; }
        .ctx-item:last-child{ border-bottom:none; }
        .ctx-item:hover{ background:rgba(255,255,255,.06); color:#fff; }
        .ctx-item--danger{ color:#f87171; }
        .ctx-item--danger:hover{ background:rgba(239,68,68,.12); }

        .notif-panel{ display:flex; flex-direction:column; height:100%; }
        .notif-hdr{ display:flex; align-items:center; justify-content:space-between; padding:12px 16px; border-bottom:1px solid var(--bdr); background:rgba(11,15,28,.9); flex-shrink:0; flex-wrap:wrap; gap:7px; }
        .notif-title{ font-size:14px; font-weight:600; color:var(--t1); font-family:'Bricolage Grotesque',sans-serif; }
        .notif-badge{ background:var(--acs); color:#a78bfa; font-size:10px; font-weight:700; padding:2px 7px; border-radius:20px; border:1px solid rgba(124,58,237,.3); }
        .filter-btn{ background:transparent; border:1px solid transparent; border-radius:6px; padding:3px 9px; color:var(--t3); font-size:11px; font-weight:500; cursor:pointer; font-family:'DM Sans',sans-serif; transition:.12s; display:flex; align-items:center; gap:3px; }
        .filter-btn--on{ background:var(--acs); border-color:rgba(124,58,237,.3); color:#a78bfa; }
        .notif-list{ flex:1; overflow-y:auto; }
        .notif-item{ display:flex; gap:10px; padding:12px 16px; border-bottom:1px solid var(--bdr2); cursor:pointer; transition:.12s; }
        .notif-item:hover{ background:rgba(255,255,255,.02); }
        .notif-item--unread{ background:rgba(124,58,237,.04); }
        .notif-icon{ width:32px; height:32px; border-radius:9px; flex-shrink:0; background:var(--acs); border:1px solid rgba(124,58,237,.2); display:flex; align-items:center; justify-content:center; color:#a78bfa; margin-top:1px; }
        .notif-txt{ font-size:13px; color:rgba(255,255,255,.5); margin:0; line-height:1.5; font-family:'DM Sans',sans-serif; }
        .notif-txt--bold{ font-weight:600; color:rgba(255,255,255,.88); }
        .notif-dot{ width:7px; height:7px; border-radius:50%; background:var(--ac); flex-shrink:0; margin-top:5px; }

        .pres-dot{ display:inline-block; width:8px; height:8px; border-radius:50%; border:2px solid var(--bg1); flex-shrink:0; }

        .bnav{ display:none; position:fixed; bottom:0; left:0; right:0; background:rgba(11,15,28,.98); backdrop-filter:blur(20px); border-top:1px solid var(--bdr); z-index:50; padding-bottom:env(safe-area-inset-bottom,0); }
        @media(max-width:767px){ .bnav{ display:flex; } }
        .bnav-btn{ flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:3px; padding:10px 0; background:transparent; border:none; cursor:pointer; color:var(--t3); font-size:10px; font-weight:600; font-family:'DM Sans',sans-serif; transition:color .13s; }
        .bnav-btn--on{ color:#a78bfa; }
        .bnav-icon{ position:relative; }
        .bnav-badge{ position:absolute; top:-4px; right:-6px; width:14px; height:14px; border-radius:50%; background:linear-gradient(135deg,#7c3aed,#6d28d9); font-size:8px; font-weight:700; color:#fff; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 6px var(--acg); }

        .msgs-area::-webkit-scrollbar, .conv-list::-webkit-scrollbar, .notif-list::-webkit-scrollbar, .thread-body::-webkit-scrollbar, .deals-panel::-webkit-scrollbar, .gs-results::-webkit-scrollbar { width:3px; }
        .msgs-area::-webkit-scrollbar-thumb, .conv-list::-webkit-scrollbar-thumb, .notif-list::-webkit-scrollbar-thumb, .thread-body::-webkit-scrollbar-thumb, .deals-panel::-webkit-scrollbar-thumb, .gs-results::-webkit-scrollbar-thumb { background:rgba(124,58,237,.2); border-radius:2px; }

        .sr-only{ position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0,0,0,0); }
      `}</style>

      <DashboardLayout>
        <div className="mp">
          {/* ── TOPBAR ── */}
          <div className="topbar">
            <div className="topbar-l">
              <div className="topbar-icon">
                <Briefcase style={{ width: 14, height: 14, color: "#60a5fa" }} />
              </div>
              <p className="topbar-title">Sales Hub</p>
              {totalBadge > 0 && <span className="topbar-badge">{totalBadge}</span>}
              {atRiskDeals > 0 && (
                <div style={{
                  display: "flex", alignItems: "center", gap: 5,
                  background: "rgba(249,115,22,.1)", border: "1px solid rgba(249,115,22,.2)",
                  borderRadius: 20, padding: "2px 10px 2px 7px",
                  fontSize: 11, fontWeight: 600, color: "#f97316",
                }}>
                  <AlertTriangle style={{ width: 10, height: 10 }} />
                  {atRiskDeals} at risk
                </div>
              )}
            </div>
            <div className="topbar-r">
              <button className="search-btn" onClick={() => setShowSearch(true)}>
                <Search style={{ width: 13, height: 13 }} />
                <span>Search</span>
                <span className="search-shortcut">⌘K</span>
              </button>

              {/* Status picker — wired to DB-backed setStatus */}
              <div style={{ position: "relative" }}>
                <button className="status-btn" onClick={() => setShowStatusPicker(p => !p)}>
                  <span className="status-btn-emoji">{myStatusCfg.emoji}</span>
                  <span className="status-btn-label">{myStatusCfg.label}</span>
                  <ChevronDown style={{ width: 10, height: 10, color: "rgba(255,255,255,.3)" }} />
                </button>
                {showStatusPicker && (
                  <StatusPicker
                    current={myStatus}
                    onSelect={(status, custom) => setStatus(status, custom)}
                    onClose={() => setShowStatusPicker(false)}
                  />
                )}
              </div>

              <button className="new-btn" onClick={() => setNewOpen(true)}>
                <Plus style={{ width: 13, height: 13 }} /><span>New Chat</span>
              </button>
            </div>
          </div>

          {/* ── BODY ── */}
          <div className="body">
            {/* ── SIDEBAR ── */}
            <div className={cn("sidebar", mobile === "chat" && "sidebar--hidden")}>
              <div className="tabs">
                <button className={cn("tab", tab === "deals" && "tab--on")} onClick={() => setTab("deals")}>
                  <Briefcase style={{ width: 12, height: 12 }} />Deals
                  {dealRooms.length > 0 && <span className="tab-badge">{dealRooms.length}</span>}
                </button>
                <button className={cn("tab", tab === "chats" && "tab--on")} onClick={() => setTab("chats")}>
                  <MessageSquare style={{ width: 12, height: 12 }} />Chats
                  {totalUnread > 0 && <span className="tab-badge">{totalUnread}</span>}
                </button>
                <button className={cn("tab", tab === "notifs" && "tab--on")} onClick={() => setTab("notifs")}>
                  <Bell style={{ width: 12, height: 12 }} />Alerts
                  {notifCount > 0 && <span className="tab-badge">{notifCount}</span>}
                </button>
              </div>

              {/* DEALS TAB */}
              {tab === "deals" && (
                <div className="deals-panel">
                  <div className="deal-stats">
                    <div className="deal-stat">
                      <div className="deal-stat-val" style={{ color: "#22c55e" }}>{wonDeals}</div>
                      <div className="deal-stat-lbl">Won</div>
                    </div>
                    <div className="deal-stat">
                      <div className="deal-stat-val" style={{ color: "#f97316" }}>{atRiskDeals}</div>
                      <div className="deal-stat-lbl">At Risk</div>
                    </div>
                    <div className="deal-stat">
                      <div className="deal-stat-val">{dealRooms.length}</div>
                      <div className="deal-stat-lbl">Total</div>
                    </div>
                  </div>

                  {dealRoomsLoading ? (
                    <div className="center-spin"><Loader2 className="spin" /></div>
                  ) : dealRooms.length === 0 ? (
                    <div className="panel-empty">
                      <Briefcase style={{ width: 28, height: 28, opacity: .2 }} />
                      <p>No deal rooms yet</p>
                      <p style={{ fontSize: 11 }}>Complete a call to auto-create a deal room</p>
                    </div>
                  ) : (
                    <>
                      {atRiskDeals > 0 && (
                        <SidebarSection label="At Risk" icon={AlertTriangle} count={atRiskDeals}>
                          {dealRooms.filter(d => d.stage === "at_risk").map(room => (
                            <DealRoomCard key={room.id} room={room}
                              isSelected={activeDealRoom?.id === room.id}
                              onClick={() => pickDealRoom(room)} />
                          ))}
                        </SidebarSection>
                      )}
                      <SidebarSection label="Active Deals" icon={Activity}
                        count={dealRooms.filter(d => !["won","lost","at_risk"].includes(d.stage)).length}>
                        {dealRooms.filter(d => !["won","lost","at_risk"].includes(d.stage)).map(room => (
                          <DealRoomCard key={room.id} room={room}
                            isSelected={activeDealRoom?.id === room.id}
                            onClick={() => pickDealRoom(room)} />
                        ))}
                      </SidebarSection>
                      {wonDeals > 0 && (
                        <SidebarSection label="Won" icon={Award} count={wonDeals} defaultOpen={false}>
                          {dealRooms.filter(d => d.stage === "won").map(room => (
                            <DealRoomCard key={room.id} room={room}
                              isSelected={activeDealRoom?.id === room.id}
                              onClick={() => pickDealRoom(room)} />
                          ))}
                        </SidebarSection>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* CHATS TAB */}
              {tab === "chats" && (
                <div className="conv-list">
                  {conversationsLoading ? (
                    <div className="center-spin"><Loader2 className="spin" /></div>
                  ) : conversations.length === 0 ? (
                    <div className="panel-empty">
                      <MessageSquare style={{ width: 24, height: 24, opacity: .2 }} />
                      <p>No conversations yet</p>
                    </div>
                  ) : (
                    <>
                      {groupConvs.length > 0 && (
                        <SidebarSection label="Group Chats" icon={Hash} count={groupConvs.length}>
                          {groupConvs.map(c => {
                            const nm = getConversationName(c);
                            return (
                              <button key={c.id} className={cn("conv-item", sel === c.id && "conv-item--active")} onClick={() => pick(c.id)}>
                                <div className="conv-av-wrap">
                                  <div className="conv-av conv-av--grp"><Users style={{ width: 14, height: 14 }} /></div>
                                  {c.unread_count > 0 && <div className="conv-unread">{c.unread_count > 9 ? "9+" : c.unread_count}</div>}
                                </div>
                                <div className="conv-info">
                                  <div className="conv-row1">
                                    <span className={cn("conv-name", c.unread_count > 0 && "conv-name--bold")}>{nm}</span>
                                    {c.last_message && <span className="meta-time">{fmtTime(c.last_message.created_at)}</span>}
                                  </div>
                                  <p className={cn("conv-preview", c.unread_count > 0 && "conv-preview--bold")}>
                                    {c.last_message?.message_text || "No messages yet"}
                                  </p>
                                </div>
                                <ChevronRight className="conv-chev" style={{ width: 13, height: 13 }} />
                              </button>
                            );
                          })}
                        </SidebarSection>
                      )}
                      {dmConvs.length > 0 && (
                        <SidebarSection label="Direct Messages" icon={MessageSquare} count={dmConvs.length}>
                          {dmConvs.map(c => {
                            const nm = getConversationName(c);
                            const otherId = c.participants[0]?.user_id;
                            const otherOn = otherId ? isOnline(otherId) : false;
                            const status = otherId ? getStatus(otherId) : "available";
                            const stCfg = STATUS_CONFIG[status];
                            return (
                              <button key={c.id} className={cn("conv-item", sel === c.id && "conv-item--active")} onClick={() => pick(c.id)}>
                                <div className="conv-av-wrap">
                                  <div className="conv-av">{initials(nm)}</div>
                                  <span className="pres-dot" style={{ position: "absolute", bottom: -1, right: -1, background: otherOn ? stCfg.color : "rgba(255,255,255,.13)" }} />
                                  {c.unread_count > 0 && <div className="conv-unread">{c.unread_count > 9 ? "9+" : c.unread_count}</div>}
                                </div>
                                <div className="conv-info">
                                  <div className="conv-row1">
                                    <span className={cn("conv-name", c.unread_count > 0 && "conv-name--bold")}>{nm}</span>
                                    {c.last_message && <span className="meta-time">{fmtTime(c.last_message.created_at)}</span>}
                                  </div>
                                  <p className={cn("conv-preview", c.unread_count > 0 && "conv-preview--bold")}>
                                    {otherOn ? `${stCfg.emoji} ${stCfg.label}` : c.last_message?.message_text || "No messages yet"}
                                  </p>
                                </div>
                                <ChevronRight className="conv-chev" style={{ width: 13, height: 13 }} />
                              </button>
                            );
                          })}
                        </SidebarSection>
                      )}
                    </>
                  )}
                </div>
              )}

              {tab === "notifs" && <NotifsPanel />}
            </div>

            {/* ── RIGHT PANEL ── */}
            <div className={cn("right", mobile === "list" && "right--hidden")}>
              {activeChatConvId ? (
                <ChatThread
                  convId={activeChatConvId}
                  convs={conversations}
                  onBack={back}
                  isOnline={isOnline}
                  members={members}
                  myId={user?.id ?? ""}
                  dealRoom={activeDealRoom ?? undefined}
                  getStatus={getStatus}
                />
              ) : (
                <div className="right-empty">
                  <div className="re-icon">
                    <Briefcase style={{ width: 28, height: 28, color: "#60a5fa" }} />
                  </div>
                  <h3>Sales Intelligence Hub</h3>
                  <p>Select a Deal Room to discuss a deal, or open a Direct Message to collaborate with your team.</p>
                  <div className="re-actions">
                    <button className="re-btn-secondary" onClick={() => setTab("deals")}>
                      <Briefcase style={{ width: 13, height: 13 }} /> View Deals
                    </button>
                    <button className="re-btn" onClick={() => setNewOpen(true)}>
                      <Plus style={{ width: 13, height: 13 }} /> New Message
                    </button>
                  </div>
                  {atRiskDeals > 0 && (
                    <div style={{
                      marginTop: 24, padding: "10px 16px",
                      background: "rgba(249,115,22,.08)", border: "1px solid rgba(249,115,22,.2)",
                      borderRadius: 12, display: "flex", alignItems: "center", gap: 8,
                      fontSize: 12, color: "#f97316",
                    }}>
                      <AlertTriangle style={{ width: 14, height: 14 }} />
                      <span><strong>{atRiskDeals}</strong> deal{atRiskDeals !== 1 ? "s" : ""} need{atRiskDeals === 1 ? "s" : ""} your attention</span>
                      <button onClick={() => setTab("deals")}
                        style={{ marginLeft: "auto", background: "none", border: "none", color: "#f97316", cursor: "pointer", fontSize: 11, fontWeight: 600 }}>
                        Review →
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ── MOBILE BOTTOM NAV ── */}
          <nav className="bnav">
            {([
              { id: "deals"  as const, label: "Deals",  Icon: Briefcase,     badge: atRiskDeals },
              { id: "chats"  as const, label: "Chats",  Icon: MessageSquare, badge: totalUnread },
              { id: "notifs" as const, label: "Alerts", Icon: Bell,          badge: notifCount },
            ]).map(t => (
              <button key={t.id} className={cn("bnav-btn", tab === t.id && mobile === "list" && "bnav-btn--on")}
                onClick={() => { setTab(t.id); setMobile("list"); }}>
                <div className="bnav-icon">
                  <t.Icon style={{ width: 20, height: 20 }} />
                  {t.badge > 0 && <span className="bnav-badge">{t.badge > 9 ? "9+" : t.badge}</span>}
                </div>
                {t.label}
              </button>
            ))}
            <button className="bnav-btn" onClick={() => setShowSearch(true)}>
              <div className="bnav-icon"><Search style={{ width: 20, height: 20 }} /></div>
              Search
            </button>
          </nav>
        </div>

        {showSearch && (
          <GlobalSearchPanel
            onClose={() => setShowSearch(false)}
            onNavigate={handleSearchNavigate}
          />
        )}

        {team && (
          <NewConvDialog
            open={newOpen} onClose={() => setNewOpen(false)}
            members={members} myId={user?.id ?? ""} teamId={team.id}
            convs={conversations} refetch={refetchConversations}
            isOnline={isOnline} getStatus={getStatus}
            onCreate={id => { setNewOpen(false); setTab("chats"); pick(id); }}
          />
        )}
      </DashboardLayout>
    </>
  );
}
