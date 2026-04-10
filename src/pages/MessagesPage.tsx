/**
 * MessagesPage.tsx — v5
 *
 * Improvements:
 *  1. Full mobile responsiveness — single-panel navigation on small screens
 *  2. Auto-status based on route + idle detection (no manual status needed but still supported)
 *  3. Deal rooms fully wired to real DB (useDealRooms)
 *  4. Deal Room panel shows deal metadata + chat in same view
 *  5. Status indicator shows "auto" badge when automatically managed
 *  6. Better deal room UX: stage badges, sentiment indicators, next-step editing inline
 */

import {
  useState, useRef, useEffect, useMemo, useCallback,
} from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Search, Send, MessageSquare, Bell, Plus, Users, FileText,
  Image as ImageIcon, Paperclip, X, Check, CheckCheck,
  TrendingUp, AtSign, AlertCircle, ArrowLeft, Copy, Trash2,
  Pencil, Loader2, ChevronRight, Pin, Bookmark,
  MessageCircle, BellOff, Smile, Reply, CornerDownRight,
  Clock, Calendar, Bold, Italic, Code,
  ChevronDown, Eye, Phone, Target, Zap, BarChart3,
  AlertTriangle, Activity, Briefcase,
  Globe, Radio, Building2, Award, Settings,
  Wifi, WifiOff,
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
import { format, isToday, isYesterday } from "date-fns";
import { cn } from "@/lib/utils";
import type { Conversation, ReadReceipt } from "@/hooks/useTeamMessaging";
import type { TeamMember } from "@/hooks/useTeam";
import { useTypingIndicator } from "@/hooks/useTypingIndicator";
import { useQueryClient } from "@tanstack/react-query";
import { Checkbox } from "@/components/ui/checkbox";

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

// ─── Types ───────────────────────────────────────────────────────────────────

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
}

interface Reaction { emoji: string; count: number; mine: boolean }
interface PinRow { id: string; message_id: string; message_preview: string | null; created_at: string; pinned_by: string }

interface SearchResult {
  type: "message" | "call" | "transcript";
  id: string;
  title: string;
  preview: string;
  timestamp: string;
  conversation_id?: string;
  call_id?: string;
}

// ─── Audio ping ───────────────────────────────────────────────────────────────

let _lastSound = 0;
function playPing() {
  const now = Date.now(); if (now - _lastSound < 800) return; _lastSound = now;
  try {
    const ac = new (window.AudioContext || (window as any).webkitAudioContext)();
    const mg = ac.createGain(); mg.gain.value = 0.35; mg.connect(ac.destination);
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
    .replace(/@all\b/g, '<span class="md-mention md-mention--all">@all</span>')
    .replace(/@(\w[\w\s]*?)(?=[\s,!?.]|$)/g, '<span class="md-mention">@$1</span>')
    .replace(/\n/g, "<br/>");
}

// ─── Presence hook ────────────────────────────────────────────────────────────

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

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusDot({ status, size = 8 }: { status: UserStatus; size?: number }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span style={{
      display: "inline-block",
      width: size, height: size, borderRadius: "50%",
      background: cfg.color,
      border: `1.5px solid #0b0f1c`,
      flexShrink: 0,
    }} title={cfg.label} />
  );
}

// ─── Status Picker ────────────────────────────────────────────────────────────

function StatusPicker({
  current, isManual, onSelect, onClose,
}: {
  current: UserStatus; isManual: boolean;
  onSelect: (s: UserStatus) => void; onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose]);

  return (
    <div ref={ref} className="status-picker">
      <div className="sp-header">
        <span className="sp-title">Your Status</span>
        {!isManual && (
          <span className="sp-auto-badge">
            <Radio style={{width:9,height:9}}/> Auto
          </span>
        )}
        {isManual && (
          <span className="sp-manual-badge">
            <Settings style={{width:9,height:9}}/> Manual (30m)
          </span>
        )}
      </div>
      <p className="sp-hint">
        {isManual ? "Status is manually set for 30 minutes." : "Status updates automatically based on your activity."}
      </p>
      {(Object.entries(STATUS_CONFIG) as [UserStatus, typeof STATUS_CONFIG[UserStatus]][]).map(([key, cfg]) => (
        <button
          key={key}
          className={cn("sp-item", current === key && "sp-item--active")}
          onClick={() => { onSelect(key); onClose(); }}
        >
          <span className="sp-emoji">{cfg.emoji}</span>
          <div>
            <span className="sp-label">{cfg.label}</span>
            <span className="sp-desc">{cfg.description}</span>
          </div>
          {current === key && <Check style={{width:12,height:12,color:cfg.color,marginLeft:"auto"}}/>}
        </button>
      ))}
    </div>
  );
}

// ─── Deal Room Card ───────────────────────────────────────────────────────────

function DealRoomCard({ room, isSelected, onClick }: {
  room: DealRoom; isSelected: boolean; onClick: () => void;
}) {
  const stage = DEAL_STAGE_CONFIG[room.stage];
  const sentimentColor =
    room.sentiment_score == null ? "rgba(255,255,255,.3)"
    : room.sentiment_score >= 70 ? "#22c55e"
    : room.sentiment_score >= 40 ? "#f59e0b" : "#ef4444";

  return (
    <button className={cn("dr-card", isSelected && "dr-card--active")} onClick={onClick}>
      <div className="dr-card-row1">
        <div className="dr-icon" style={{background:stage.bg,color:stage.color}}>{stage.icon}</div>
        <div className="dr-info">
          <span className="dr-name">{room.deal_name}</span>
          {room.company && <span className="dr-company">{room.company}</span>}
        </div>
        {(room.unread_count ?? 0) > 0 && (
          <div className="dr-unread">{(room.unread_count ?? 0) > 9 ? "9+" : room.unread_count}</div>
        )}
      </div>
      <div className="dr-card-row2">
        <span className="dr-stage" style={{color:stage.color,background:stage.bg}}>
          {stage.icon} {stage.label}
        </span>
        {room.sentiment_score != null && (
          <span className="dr-sent" style={{color:sentimentColor}}>{room.sentiment_score}%</span>
        )}
        {room.last_call_score != null && (
          <span className="dr-score">Score: {Number(room.last_call_score).toFixed(1)}</span>
        )}
      </div>
      {room.next_step && (
        <div className="dr-next">
          <Target style={{width:9,height:9,flexShrink:0}}/>
          <span>{room.next_step}</span>
        </div>
      )}
    </button>
  );
}

// ─── Deal Room Header (shown above chat) ─────────────────────────────────────

function DealRoomChatHeader({ room }: { room: DealRoom }) {
  const stage = DEAL_STAGE_CONFIG[room.stage];
  const sentimentColor =
    room.sentiment_score == null ? "rgba(255,255,255,.35)"
    : room.sentiment_score >= 70 ? "#22c55e"
    : room.sentiment_score >= 40 ? "#f59e0b" : "#ef4444";

  return (
    <div className="drh">
      <div className="drh-icon" style={{background:stage.bg,color:stage.color}}>
        <Building2 style={{width:13,height:13}}/>
      </div>
      <div className="drh-content">
        <div className="drh-name">{room.deal_name}</div>
        {room.company && <div className="drh-company">{room.company}</div>}
      </div>
      <div className="drh-stats">
        <span className="drh-stage" style={{color:stage.color,background:stage.bg}}>
          {stage.icon} {stage.label}
        </span>
        {room.sentiment_score != null && (
          <span className="drh-stat" style={{color:sentimentColor}}>
            <BarChart3 style={{width:10,height:10}}/>{room.sentiment_score}%
          </span>
        )}
        {room.next_step && (
          <span className="drh-next">
            <Target style={{width:9,height:9,flexShrink:0}}/>{room.next_step}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Realtime message hook ────────────────────────────────────────────────────

function useRealtimeChannel(
  convId: string|null, myId: string|undefined,
  cacheRef: React.MutableRefObject<Map<string,{full_name:string|null;email:string|null}>>,
  onInsert: (m:RtMsg)=>void, onDelete: (id:string)=>void, onUpdate: (id:string,text:string)=>void,
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

// ─── Reactions ────────────────────────────────────────────────────────────────

function useReactions(msgId: string, myId: string) {
  const [rxns, setRxns] = useState<Reaction[]>([]);
  const load = useCallback(async () => {
    try {
      const { data } = await supabase.from("message_reactions" as any).select("emoji, user_id").eq("message_id", msgId);
      if (!data) return;
      const map = new Map<string,{count:number;mine:boolean}>();
      (data as any[]).forEach(r => {
        const e = map.get(r.emoji) ?? { count:0, mine:false };
        e.count++; if (r.user_id===myId) e.mine=true; map.set(r.emoji, e);
      });
      setRxns(Array.from(map.entries()).map(([emoji,d])=>({emoji,...d})));
    } catch {}
  }, [msgId, myId]);
  useEffect(() => { load(); }, [load]);
  const toggle = useCallback(async (emoji: string) => {
    const existing = rxns.find(r=>r.emoji===emoji);
    if (existing?.mine) {
      await supabase.from("message_reactions" as any).delete().eq("message_id",msgId).eq("user_id",myId).eq("emoji",emoji);
    } else {
      await supabase.from("message_reactions" as any).insert({ message_id:msgId, user_id:myId, emoji });
    }
    load();
  }, [rxns, msgId, myId, load]);
  return { rxns, toggle };
}

// ─── Emoji picker ─────────────────────────────────────────────────────────────

const QUICK = ["👍","❤️","😂","🎉","🔥","✅","👏","🚀","💯","😮"];
function EmojiPicker({ onPick, onClose }: { onPick:(e:string)=>void; onClose:()=>void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h=(e:MouseEvent)=>{ if(!ref.current?.contains(e.target as Node)) onClose(); };
    document.addEventListener("mousedown",h); return ()=>document.removeEventListener("mousedown",h);
  },[onClose]);
  return (
    <div ref={ref} className="ep-wrap">
      <div className="ep-grid">
        {QUICK.map(e=>(
          <button key={e} className="ep-btn" onClick={()=>{onPick(e);onClose();}}>{e}</button>
        ))}
      </div>
    </div>
  );
}

// ─── Reactions Bar ────────────────────────────────────────────────────────────

function ReactBar({ msgId, myId }: { msgId:string; myId:string }) {
  const { rxns, toggle } = useReactions(msgId, myId);
  const [open, setOpen] = useState(false);
  if (rxns.length === 0 && !open) return (
    <div style={{display:"flex",alignItems:"center",marginTop:3}}>
      <button className="rxn-add" onClick={()=>setOpen(p=>!p)}>
        <Smile style={{width:11,height:11}}/>
      </button>
      {open && <EmojiPicker onPick={toggle} onClose={()=>setOpen(false)}/>}
    </div>
  );
  return (
    <div className="rxn-bar">
      {rxns.map(r=>(
        <button key={r.emoji} className={cn("rxn-chip", r.mine && "rxn-chip--mine")} onClick={()=>toggle(r.emoji)}>
          {r.emoji}<span>{r.count}</span>
        </button>
      ))}
      <div style={{position:"relative"}}>
        <button className="rxn-add" onClick={()=>setOpen(p=>!p)}><Smile style={{width:11,height:11}}/></button>
        {open && <EmojiPicker onPick={toggle} onClose={()=>setOpen(false)}/>}
      </div>
    </div>
  );
}

// ─── Context Menu ─────────────────────────────────────────────────────────────

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
    [MessageCircle,"Reply",on.reply,false],
    [Copy,"Copy",on.copy,false],
    [Pin,"Pin",on.pin,false],
    [Bookmark,"Save",on.save,false],
    ...(isMe?([[Pencil,"Edit",on.edit!,false],[Trash2,"Delete",on.del!,true]] as [React.ElementType,string,()=>void,boolean][]):[]),
  ];
  return (
    <div ref={ref} style={{
      position:"fixed",
      left:Math.min(pos.x,window.innerWidth-190),
      top:Math.min(pos.y,window.innerHeight-items.length*38-8),
      zIndex:9999,
    }} className="ctx-menu">
      {items.map(([Icon,label,fn,danger],i)=>(
        <button key={i} className={cn("ctx-item",danger&&"ctx-item--danger")} onClick={()=>{fn();onClose();}}>
          <Icon style={{width:13,height:13}}/>{label}
        </button>
      ))}
    </div>
  );
}

// ─── Thread Panel ─────────────────────────────────────────────────────────────

function ThreadPanel({ parent, myId, onClose }: {
  parent: RtMsg; myId: string; onClose: () => void;
}) {
  const [replies, setReplies] = useState<RtMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const botRef = useRef<HTMLDivElement>(null);
  const profCache = useRef(new Map<string,{full_name:string|null;email:string|null}>());

  const load = useCallback(async () => {
    const { data } = await supabase.from("team_messages" as any).select("*").eq("parent_id", parent.id).order("created_at", { ascending: true });
    if (!data?.length) { setLoading(false); return; }
    const ids = [...new Set((data as any[]).map((r:any) => r.sender_id))];
    const { data: profiles } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
    const pm = new Map(profiles?.map((p:any) => [p.id, p]) ?? []);
    profiles?.forEach((p:any) => profCache.current.set(p.id, p));
    setReplies((data as any[]).map((r:any) => ({ ...r, sender: pm.get(r.sender_id) ?? null })));
    setLoading(false);
  }, [parent.id]);

  useEffect(() => { load(); }, [load]);
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
    } catch { toast({ title: "Failed to send", variant: "destructive" }); }
    finally { setSending(false); }
  };

  const pSender = parent.sender?.full_name || parent.sender?.email || "Unknown";
  return (
    <div className="side-panel">
      <div className="panel-hdr">
        <MessageCircle style={{width:13,height:13,color:"#818cf8"}}/>
        <span className="panel-title">Thread · {replies.length} replies</span>
        <button className="panel-close-btn" onClick={onClose}><X style={{width:13,height:13}}/></button>
      </div>
      <div className="panel-body">
        <div className="thread-parent">
          <div className="msg-av small">{initials(pSender)}</div>
          <div style={{flex:1}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span className="msg-sender">{pSender}</span>
              <span className="meta-time">{format(new Date(parent.created_at),"MMM d, h:mm a")}</span>
            </div>
            <div className="bubble them" style={{borderRadius:12,marginTop:4}}>
              <p className="bubble-txt" dangerouslySetInnerHTML={{__html:renderMd(parent.message_text)}}/>
            </div>
          </div>
        </div>
        {loading ? <div className="center-spin"><Loader2 className="spin"/></div>
          : replies.map(r => {
            const isMe = r.sender_id === myId;
            const nm = r.sender?.full_name || r.sender?.email || "?";
            return (
              <div key={r.id} className={cn("msg-row",isMe?"msg-me":"msg-them")} style={{marginBottom:6}}>
                {!isMe && <div className="msg-av small">{initials(nm)}</div>}
                <div className={cn("msg-body",isMe?"body-me":"body-them")}>
                  {!isMe && <p className="msg-sender">{nm}</p>}
                  <div className={cn("bubble",isMe?"me":"them")}>
                    <p className="bubble-txt" dangerouslySetInnerHTML={{__html:renderMd(r.message_text)}}/>
                  </div>
                  <span className="meta-time" style={{marginTop:3,display:"block"}}>{format(new Date(r.created_at),"h:mm a")}</span>
                </div>
              </div>
            );
          })}
        <div ref={botRef}/>
      </div>
      <div className="panel-composer">
        <input
          className="pc-input" placeholder="Reply in thread…" value={input}
          onChange={e=>setInput(e.target.value)}
          onKeyDown={e=>{ if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}}}
        />
        <button className={cn("pc-send",input.trim()&&"pc-send--on")} onClick={send} disabled={sending||!input.trim()}>
          <Send style={{width:14,height:14}}/>
        </button>
      </div>
    </div>
  );
}

// ─── Pins Panel ───────────────────────────────────────────────────────────────

function PinsPanel({ convId, onClose }: { convId:string; onClose:()=>void }) {
  const [pins, setPins] = useState<PinRow[]>([]); const [loading, setLoading] = useState(true);
  useEffect(()=>{
    supabase.from("pinned_messages" as any).select("*").eq("conversation_id",convId).order("created_at",{ascending:false})
      .then(({data})=>{setPins((data||[]) as unknown as PinRow[]);setLoading(false);});
  },[convId]);
  return (
    <div className="side-panel">
      <div className="panel-hdr">
        <Pin style={{width:13,height:13,color:"#f59e0b"}}/>
        <span className="panel-title">Pinned Messages</span>
        <button className="panel-close-btn" onClick={onClose}><X style={{width:13,height:13}}/></button>
      </div>
      <div className="panel-body">
        {loading ? <div className="center-spin"><Loader2 className="spin"/></div>
          : pins.length===0 ? <div className="panel-empty"><Pin style={{width:24,height:24,opacity:.2}}/><p>No pinned messages</p></div>
          : pins.map(p=>(
            <div key={p.id} className="pin-item">
              <Pin style={{width:11,height:11,color:"#f59e0b",flexShrink:0}}/>
              <div>
                <p className="pin-txt">{p.message_preview||"(no preview)"}</p>
                <p className="meta-time">{format(new Date(p.created_at),"MMM d, h:mm a")}</p>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

// ─── Global Search ────────────────────────────────────────────────────────────

function GlobalSearch({ onClose, onNavigate }: {
  onClose: ()=>void; onNavigate: (convId?: string)=>void;
}) {
  const [query, setQuery] = useState(""); const [results, setResults] = useState<SearchResult[]>([]); const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if(e.key==="Escape") onClose(); };
    document.addEventListener("keydown",h); return ()=>document.removeEventListener("keydown",h);
  },[onClose]);
  useEffect(() => {
    if(!query.trim()) { setResults([]); return; }
    const t = setTimeout(async () => {
      setLoading(true);
      const found:SearchResult[] = [];
      const { data:msgs } = await supabase.from("team_messages").select("id,message_text,created_at,conversation_id").ilike("message_text",`%${query}%`).limit(10);
      msgs?.forEach((m:any)=>found.push({type:"message",id:m.id,title:"Message",preview:m.message_text,timestamp:m.created_at,conversation_id:m.conversation_id}));
      found.sort((a,b)=>new Date(b.timestamp).getTime()-new Date(a.timestamp).getTime());
      setResults(found); setLoading(false);
    }, 300);
    return ()=>clearTimeout(t);
  },[query]);
  return (
    <div className="gs-overlay">
      <div className="gs-panel">
        <div className="gs-row">
          <Search style={{width:16,height:16,color:"rgba(255,255,255,.3)"}}/>
          <input ref={inputRef} className="gs-input" placeholder="Search messages…" value={query} onChange={e=>setQuery(e.target.value)}/>
          {loading && <Loader2 style={{width:14,height:14,color:"#7c3aed",animation:"spin 1s linear infinite"}}/>}
          <button className="gs-close" onClick={onClose}><X style={{width:13,height:13}}/></button>
        </div>
        <div className="gs-results">
          {!query.trim() ? (
            <div className="gs-empty"><Search style={{width:28,height:28,opacity:.15}}/><p>Search across messages</p></div>
          ) : results.length===0 && !loading ? (
            <div className="gs-empty"><p>No results for "{query}"</p></div>
          ) : results.map(r=>(
            <button key={r.id} className="gs-result" onClick={()=>{ if(r.conversation_id) onNavigate(r.conversation_id); onClose(); }}>
              <MessageSquare style={{width:13,height:13,color:"#818cf8"}}/>
              <div style={{flex:1,minWidth:0}}>
                <p className="gs-preview">{r.preview.slice(0,100)}{r.preview.length>100?"…":""}</p>
                <p className="meta-time">{fmtTime(r.timestamp)}</p>
              </div>
              <ChevronRight style={{width:12,height:12,color:"rgba(255,255,255,.2)"}}/>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Composer ─────────────────────────────────────────────────────────────────

interface ComposerProps {
  value: string; onChange: (v:string)=>void; onSend: ()=>void; onFile: ()=>void;
  members: TeamMember[]; myId: string; placeholder?: string; busy?: boolean; disabled?: boolean;
}
function Composer({ value, onChange, onSend, onFile, members, myId, placeholder, busy, disabled }: ComposerProps) {
  const [mentions, setMentions] = useState<{id:string;name:string}[]>([]);
  const [mentionAt, setMentionAt] = useState(-1);
  const [mq, setMq] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);
  const others = members.filter(m=>m.user_id!==myId);

  const autoResize = () => {
    if(taRef.current){taRef.current.style.height="auto";taRef.current.style.height=Math.min(taRef.current.scrollHeight,160)+"px";}
  };
  const handleChange = (e:React.ChangeEvent<HTMLTextAreaElement>) => {
    const v=e.target.value; onChange(v); autoResize();
    const pos=e.target.selectionStart; const before=v.slice(0,pos); const at=before.lastIndexOf("@");
    if(at!==-1&&!before.slice(at).includes(" ")){
      const q=before.slice(at+1); setMentionAt(at); setMq(q);
      const f=others.filter(m=>(m.profile?.full_name||m.invited_email||"").toLowerCase().includes(q.toLowerCase())).slice(0,5);
      setMentions(f.map(m=>({id:m.user_id,name:m.profile?.full_name||m.invited_email||"user"})));
    } else { setMentions([]); }
  };
  const insertMention=(item:{id:string;name:string})=>{
    const tag=`@${item.name} `;
    onChange(value.slice(0,mentionAt)+tag+value.slice(mentionAt+mq.length+1));
    setMentions([]);
    setTimeout(()=>taRef.current?.focus(),0);
  };
  const wrapSel=(prefix:string,suffix?:string)=>{
    const el=taRef.current; if(!el) return;
    const s=el.selectionStart,end=el.selectionEnd;
    const sel=value.slice(s,end)||"text"; const suf=suffix??prefix;
    onChange(value.slice(0,s)+prefix+sel+suf+value.slice(end));
    setTimeout(()=>{ el.focus(); el.setSelectionRange(s+prefix.length,s+prefix.length+sel.length); },0);
  };
  const canSend=value.trim().length>0&&!busy&&!disabled;

  return (
    <div className="cmp">
      <div className="cmp-fmt">
        <button className="cmp-fmt-btn" onClick={()=>wrapSel("**")} title="Bold"><Bold style={{width:12,height:12}}/></button>
        <button className="cmp-fmt-btn" onClick={()=>wrapSel("*")} title="Italic"><Italic style={{width:12,height:12}}/></button>
        <button className="cmp-fmt-btn" onClick={()=>wrapSel("`")} title="Code"><Code style={{width:12,height:12}}/></button>
        <button className="cmp-fmt-btn" onClick={()=>{onChange(value+"@");setTimeout(()=>taRef.current?.focus(),0);}} title="Mention"><AtSign style={{width:12,height:12}}/></button>
      </div>
      {mentions.length>0&&(
        <div className="cmp-mentions">
          {mentions.map(m=>(
            <button key={m.id} className="cmp-mention-item" onClick={()=>insertMention(m)}>
              <div className="cmp-mention-av">{m.name[0]?.toUpperCase()}</div>
              <span>@{m.name}</span>
            </button>
          ))}
        </div>
      )}
      <div className="cmp-row">
        <button className="cmp-icon" onClick={onFile} disabled={!!busy} title="Attach"><Paperclip style={{width:16,height:16}}/></button>
        <textarea
          ref={taRef} className="cmp-ta" placeholder={placeholder||"Message…"} value={value}
          onChange={handleChange} disabled={!!disabled||!!busy} rows={1}
          onKeyDown={e=>{
            if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();if(canSend)onSend();}
            if(e.key==="Escape")setMentions([]);
            if(e.key==="Tab"&&mentions.length>0){e.preventDefault();insertMention(mentions[0]);}
          }}
        />
        <button className={cn("cmp-send",canSend&&"cmp-send--on")} onClick={onSend} disabled={!canSend}>
          <Send style={{width:15,height:15}}/>
        </button>
      </div>
      <p className="cmp-hint">Enter to send · Shift+Enter newline · **bold** · @mention</p>
    </div>
  );
}

// ─── Chat Thread ──────────────────────────────────────────────────────────────

function ChatThread({ convId, convs, onBack, isOnline, members, myId, dealRoom, getStatus, isMobile }: {
  convId: string; convs: Conversation[]; onBack: ()=>void;
  isOnline: (id:string)=>boolean; members: TeamMember[]; myId: string;
  dealRoom?: DealRoom; getStatus: (uid:string)=>UserStatus; isMobile: boolean;
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

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef   = useRef<HTMLInputElement>(null);
  const editRef   = useRef<HTMLInputElement>(null);
  const typTimer  = useRef<NodeJS.Timeout|null>(null);

  const conv = convs.find(c=>c.id===convId);
  const name = conv ? getConversationName(conv) : dealRoom?.deal_name || "Chat";
  const isGrp= conv?.is_group ?? false;
  const otherId = !isGrp ? conv?.participants?.[0]?.user_id : undefined;
  const otherStatus = otherId ? getStatus(otherId) : "available";
  const myName = members.find(m=>m.user_id===myId)?.profile?.full_name || "You";

  const profCache = useRef(new Map<string,{full_name:string|null;email:string|null}>());
  useEffect(()=>{ base.forEach(m=>{ if(m.sender) profCache.current.set(m.sender_id,m.sender as any); }); },[base]);

  const onInsert = useCallback((m:RtMsg)=>{
    if(m.parent_id) return;
    setRtAdded(p=>{ if(p.some(x=>x.id===m.id)||base.some(x=>x.id===m.id)) return p; return [...p,m]; });
    qc.invalidateQueries({queryKey:["team-conversations"]});
  },[base,qc]);
  const onDelete = useCallback((id:string)=>{ setRtDel(p=>new Set([...p,id])); setOptDel(p=>new Set([...p,id])); },[]);
  const onUpdate = useCallback((id:string,text:string)=>{ setRtEdit(p=>new Map(p).set(id,text)); },[]);
  useRealtimeChannel(convId, myId, profCache, onInsert, onDelete, onUpdate);

  const messages = useMemo(()=>{
    const del=new Set([...rtDel,...optDel]);
    return [
      ...base.filter((m:any)=>!del.has(m.id)&&!m.parent_id&&!rtAdded.some(r=>r.id===m.id)),
      ...rtAdded.filter(m=>!del.has(m.id)&&!m.parent_id),
    ].sort((a,b)=>new Date(a.created_at).getTime()-new Date(b.created_at).getTime())
     .map(m=>{ const ed=rtEdit.get(m.id); return ed!==undefined?{...m,message_text:ed}:m; });
  },[base,rtAdded,rtDel,rtEdit,optDel]);

  useEffect(()=>{ scrollRef.current?.scrollIntoView({behavior:"smooth"}); },[messages.length]);
  useEffect(()=>{ if(editId&&editRef.current) editRef.current.focus(); },[editId]);

  const handleInput=(v:string)=>{
    setInput(v);
    if(v.trim()){ sendTyping(myName); if(typTimer.current) clearTimeout(typTimer.current); typTimer.current=setTimeout(()=>sendStopTyping(),2000); }
    else sendStopTyping();
  };

  const upload=async(file:File)=>{
    const ext=file.name.split(".").pop()??"bin";
    const path=`${convId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const {error}=await supabase.storage.from("team-attachments").upload(path,file,{contentType:file.type});
    if(error) throw error;
    const {data}=supabase.storage.from("team-attachments").getPublicUrl(path);
    return {url:data.publicUrl,name:file.name,type:file.type};
  };

  const handleSend=async()=>{
    if(!input.trim()&&!pFile) return; setBusy(true);
    try {
      let fd:any; if(pFile) fd=await upload(pFile);
      sendMessage.mutate({text:input.trim()||(pFile?.name??"Attachment"),file_url:fd?.url,file_name:fd?.name,file_type:fd?.type} as any);
      setInput(""); setPFile(null); sendStopTyping();
    } finally { setBusy(false); }
  };

  const saveEdit=async(id:string)=>{
    const prev=messages.find(m=>m.id===id)?.message_text??"";
    setRtEdit(p=>new Map(p).set(id,editTxt.trim())); setEditId(null); setEditTxt("");
    try { await supabase.from("team_messages").update({message_text:editTxt.trim()}).eq("id",id); }
    catch { setRtEdit(p=>new Map(p).set(id,prev)); }
  };

  const delMsg=useCallback(async(id:string)=>{
    setOptDel(p=>new Set([...p,id])); setCtx(null);
    try { await supabase.from("team_messages").delete().eq("id",id); } catch {}
  },[]);

  const pinMsg=async(id:string,text:string)=>{
    try { await supabase.from("pinned_messages" as any).insert({message_id:id,conversation_id:convId,pinned_by:myId,message_preview:text.slice(0,120)}); toast({title:"Pinned"}); }
    catch { toast({title:"Could not pin",variant:"destructive"}); }
  };

  const saveMsg=async(id:string)=>{
    try { await supabase.from("saved_messages" as any).insert({message_id:id,user_id:myId}); toast({title:"Saved"}); } catch {}
  };

  const grouped=useMemo(()=>{
    const g:{label:string;msgs:typeof messages}[]=[]; let last="";
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
  const otherOn = otherId ? isOnline(otherId) : false;

  return (
    <div className="chat-thread">
      {dealRoom && <DealRoomChatHeader room={dealRoom}/>}

      {/* Header */}
      <div className="chat-hdr">
        <button className="back-btn" onClick={onBack}><ArrowLeft style={{width:15,height:15}}/></button>
        <div className="chat-av-wrap">
          <div className="chat-av">
            {isGrp
              ? <Users style={{width:13,height:13,color:"#a78bfa"}}/>
              : dealRoom
              ? <Building2 style={{width:13,height:13,color:"#60a5fa"}}/>
              : <span style={{fontSize:11,fontWeight:700,color:"#818cf8"}}>{conv?getConversationInitials(conv):"?"}</span>}
          </div>
          {!isGrp && otherId && (
            <span className="pres-dot" style={{background: otherOn ? otherStatusCfg.color : "rgba(255,255,255,.15)"}}/>
          )}
        </div>
        <div className="chat-info">
          <p className="chat-name">{name}</p>
          {typingUsers.length > 0
            ? <p className="chat-typing">{typingUsers.map(u=>u.name).join(", ")} typing…</p>
            : !isGrp && otherId
            ? <p className="chat-sub" style={{color: otherOn ? otherStatusCfg.color : "rgba(255,255,255,.28)"}}>
                {otherOn ? `${otherStatusCfg.emoji} ${otherStatusCfg.label}` : "○ Offline"}
              </p>
            : isGrp ? <p className="chat-sub">{(conv?.participants.length??0)+1} members</p> : null}
        </div>
        <div className="hdr-acts">
          <button className={cn("hdr-btn",showPins&&"hdr-btn--on")} title="Pinned" onClick={()=>setShowPins(p=>!p)}>
            <Pin style={{width:13,height:13}}/>
          </button>
          <button className={cn("hdr-btn",muted&&"hdr-btn--muted")} title={muted?"Unmute":"Mute"} onClick={()=>setMuted(p=>!p)}>
            {muted?<BellOff style={{width:13,height:13}}/>:<Bell style={{width:13,height:13}}/>}
          </button>
        </div>
      </div>

      {/* Overlay panels */}
      {showPins && <PinsPanel convId={convId} onClose={()=>setShowPins(false)}/>}
      {thread && <ThreadPanel parent={thread} myId={myId} onClose={()=>setThread(null)}/>}

      {/* Messages */}
      <div className="msgs-area">
        {messagesLoading ? <div className="center-spin"><Loader2 className="spin"/></div>
          : messages.length===0 ? (
            <div className="empty-chat">
              <div className="empty-icon">
                {dealRoom ? <Building2 style={{width:20,height:20,color:"#60a5fa"}}/> : <MessageSquare style={{width:20,height:20,color:"#7c3aed"}}/>}
              </div>
              <p className="empty-title">{dealRoom ? `${dealRoom.deal_name} Deal Room` : "No messages yet"}</p>
              <p className="empty-sub">{dealRoom ? "Discuss this deal and track next steps" : "Start the conversation"}</p>
            </div>
          ) : grouped.map(grp=>(
            <div key={grp.label}>
              <div className="divider-row">
                <div className="div-line"/><span className="div-label">{grp.label}</span><div className="div-line"/>
              </div>
              {grp.msgs.map((msg,i)=>{
                const isMe=msg.sender_id===myId;
                const st=rsStatus(msg.created_at,msg.sender_id,readReceipts);
                const showRec=isMe&&(!grp.msgs[i+1]||grp.msgs[i+1].sender_id!==myId);
                const same=grp.msgs[i-1]?.sender_id===msg.sender_id;
                const isDel=optDel.has(msg.id);
                const isEd=editId===msg.id;
                const nm=msg.sender?.full_name||msg.sender?.email||"?";
                const isSystem=msg.sender_id==="00000000-0000-0000-0000-000000000000";

                if(isSystem) return (
                  <div key={msg.id} className="sys-msg">
                    <Zap style={{width:11,height:11,flexShrink:0}}/>
                    <div dangerouslySetInnerHTML={{__html:renderMd(msg.message_text)}}/>
                    <span className="meta-time">{format(new Date(msg.created_at),"h:mm a")}</span>
                  </div>
                );

                return (
                  <div key={msg.id}
                    className={cn("msg-row",isMe?"msg-me":"msg-them",same&&"msg-same")}
                    style={{opacity:isDel?.2:1,transition:"opacity .15s"}}
                    onContextMenu={e=>{ if(!isDel){e.preventDefault();setCtx({id:msg.id,x:e.clientX,y:e.clientY});} }}>
                    {!isMe&&!same&&<div className="msg-av">{initials(nm)}</div>}
                    {!isMe&&same&&<div className="msg-av-sp"/>}
                    <div className={cn("msg-body",isMe?"body-me":"body-them")}>
                      {!isMe&&!same&&<p className="msg-sender">{nm}</p>}
                      {isEd ? (
                        <div className="edit-wrap">
                          <input ref={editRef} value={editTxt} onChange={e=>setEditTxt(e.target.value)}
                            onKeyDown={e=>{if(e.key==="Enter")saveEdit(msg.id);if(e.key==="Escape"){setEditId(null);setEditTxt("");}}}
                            className="edit-input"/>
                          <button className="edit-save" onClick={()=>saveEdit(msg.id)}>Save</button>
                          <button className="edit-cancel" onClick={()=>{setEditId(null);setEditTxt("");}}>×</button>
                        </div>
                      ) : (
                        <div className={cn("bubble",isMe?"me":"them")}>
                          {msg.file_url&&(
                            <div style={{marginBottom:6}}>
                              {(msg as any).file_type?.startsWith("image/")
                                ? <a href={msg.file_url} target="_blank" rel="noopener noreferrer"><img src={msg.file_url} alt={(msg as any).file_name??"img"} className="attach-img"/></a>
                                : <a href={msg.file_url} target="_blank" rel="noopener noreferrer" className="attach-file">
                                    <FileText style={{width:13,height:13}}/><span>{(msg as any).file_name??"File"}</span>
                                  </a>}
                            </div>
                          )}
                          {(!msg.file_url||msg.message_text!==(msg as any).file_name)&&(
                            <div className="bubble-txt" dangerouslySetInnerHTML={{__html:renderMd(msg.message_text)}}/>
                          )}
                        </div>
                      )}
                      {!isDel&&!isEd&&<ReactBar msgId={msg.id} myId={myId}/>}
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
          <FileText style={{width:13,height:13,color:"#818cf8"}}/>
          <span className="fp-name">{pFile.name}</span>
          <span className="meta-time">{(pFile.size/1024).toFixed(0)}KB</span>
          <button className="ha" onClick={()=>setPFile(null)}><X style={{width:11,height:11}}/></button>
        </div>
      )}

      <input type="file" ref={fileRef} className="sr-only"
        onChange={e=>{const f=e.target.files?.[0];if(f&&f.size<=20*1024*1024)setPFile(f);e.target.value="";}}
        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"/>

      <Composer value={input} onChange={handleInput} onSend={handleSend}
        onFile={()=>fileRef.current?.click()} members={members} myId={myId} busy={busy}
        placeholder={dealRoom?`Message ${dealRoom.deal_name}…`:"Message… (@ to mention)"}
      />
    </div>
  );
}

// ─── Notifications Panel ──────────────────────────────────────────────────────

const NI:{[k:string]:React.ElementType}={comment:MessageSquare,coaching:TrendingUp,mention:AtSign,system:AlertCircle};
function NotifsPanel() {
  const { notifications, notificationsLoading, unreadCount, markRead, markAllRead } = useNotifications();
  return (
    <div className="notif-panel">
      <div className="notif-hdr">
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span className="notif-title">Notifications</span>
          {unreadCount>0&&<span className="notif-badge">{unreadCount}</span>}
        </div>
        {unreadCount>0&&(
          <button className="filter-btn" onClick={()=>markAllRead.mutate()}>
            <CheckCheck style={{width:11,height:11}}/> All read
          </button>
        )}
      </div>
      <div className="notif-list">
        {notificationsLoading ? <div className="center-spin"><Loader2 className="spin"/></div>
          : notifications.length===0 ? (
            <div className="panel-empty"><Bell style={{width:28,height:28,opacity:.2}}/><p>No notifications</p></div>
          ) : notifications.map(n=>{
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

// ─── New Conversation Dialog ──────────────────────────────────────────────────

function NewConvDialog({ open, onClose, members, myId, teamId, convs, refetch, onCreate, getStatus }: {
  open:boolean; onClose:()=>void; members:TeamMember[]; myId:string; teamId:string;
  convs:Conversation[]; refetch:()=>void; onCreate:(id:string)=>void;
  getStatus:(uid:string)=>UserStatus;
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
              const status=getStatus(m.user_id);
              const stCfg=STATUS_CONFIG[status];
              return(
                <div key={m.id} onClick={()=>tog(m.user_id)} style={{
                  display:"flex",alignItems:"center",gap:10,padding:"9px 12px",borderRadius:10,cursor:"pointer",
                  border:"1px solid",borderColor:chk?"rgba(124,58,237,.4)":"transparent",
                  background:chk?"rgba(124,58,237,.1)":"transparent",transition:"all .13s",
                }}>
                  <Checkbox checked={chk} className="pointer-events-none"/>
                  <div style={{position:"relative",flexShrink:0}}>
                    <Avatar className="h-8 w-8"><AvatarFallback className="bg-violet-500/20 text-violet-400 text-xs font-bold">{initials(nm)}</AvatarFallback></Avatar>
                    <StatusDot status={status} size={8}/>
                  </div>
                  <div>
                    <p style={{fontSize:13,fontWeight:500,color:"#e2e8f0",margin:0}}>{nm}</p>
                    <p style={{fontSize:10,fontWeight:600,color:stCfg.color,margin:0}}>{stCfg.emoji} {stCfg.label}</p>
                  </div>
                </div>
              );
            })}
        </div>
        <DialogFooter>
          <button style={{background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.1)",borderRadius:9,padding:"8px 16px",color:"rgba(255,255,255,.6)",fontSize:13,cursor:"pointer"}} onClick={()=>{setSel([]);onClose();}}>Cancel</button>
          <button style={{display:"flex",alignItems:"center",gap:6,background:"linear-gradient(135deg,#7c3aed,#6d28d9)",border:"none",borderRadius:9,padding:"8px 18px",color:"#fff",fontSize:13,fontWeight:600,cursor:"pointer",opacity:!sel.length?0.5:1}} disabled={!sel.length||startConversation.isPending} onClick={go}>
            {sel.length>1?"Create Group":"Start Chat"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MessagesPage() {
  const { user } = useAuth();
  const { team, members } = useTeam();
  const { myStatus, isManual, setStatus, getStatus } = useUserStatus(team?.id);
  const { dealRooms, isLoading: dealRoomsLoading } = useDealRooms();
  const { conversations, conversationsLoading, totalUnread, refetchConversations } = useTeamMessaging(team?.id);
  const { unreadCount: notifCount } = useNotifications();
  const isOnline = usePresence(team?.id, user?.id);

  const [sel, setSel]                   = useState<string|null>(null);
  const [tab, setTab]                   = useState<"deals"|"chats"|"notifs">("deals");
  const [newOpen, setNewOpen]           = useState(false);
  const [showSearch, setShowSearch]     = useState(false);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [activeDealRoom, setActiveDealRoom]     = useState<DealRoom|null>(null);
  // Mobile: "list" = show sidebar, "chat" = show chat
  const [mobileView, setMobileView]     = useState<"list"|"chat">("list");

  const atRiskDeals = dealRooms.filter(d=>d.stage==="at_risk").length;
  const wonDeals    = dealRooms.filter(d=>d.stage==="won").length;
  const totalBadge  = totalUnread + notifCount;

  const myStatusCfg = STATUS_CONFIG[myStatus];

  const pick = (id:string) => {
    setSel(id); setMobileView("chat"); setTab("chats"); setActiveDealRoom(null);
  };
  const pickDealRoom = (room:DealRoom) => {
    setActiveDealRoom(room); setSel(null); setMobileView("chat");
  };
  const back = () => { setMobileView("list"); setActiveDealRoom(null); };

  const activeChatConvId = activeDealRoom?.conversation_id ?? sel;

  useEffect(() => {
    const h=(e:KeyboardEvent)=>{ if((e.metaKey||e.ctrlKey)&&e.key==="k"){e.preventDefault();setShowSearch(true);} };
    document.addEventListener("keydown",h); return ()=>document.removeEventListener("keydown",h);
  },[]);

  const dmConvs    = conversations.filter(c=>!c.is_group);
  const groupConvs = conversations.filter(c=>c.is_group);
  const activeDeals = dealRooms.filter(d=>!["won","lost","at_risk"].includes(d.stage));

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=Bricolage+Grotesque:wght@600;700;800&display=swap');

        .mp {
          --bg0:#060912; --bg1:#0b0f1c; --bg2:#0f1424;
          --bdr:rgba(255,255,255,.07); --bdr2:rgba(255,255,255,.04);
          --ac:#7c3aed; --acg:rgba(124,58,237,.35); --acs:rgba(124,58,237,.12);
          --t1:#f0f6fc; --t2:rgba(255,255,255,.6); --t3:rgba(255,255,255,.3); --t4:rgba(255,255,255,.14);
          display:flex; flex-direction:column;
          height:calc(100dvh - 4rem); margin:-28px; overflow:hidden;
          background:var(--bg0); font-family:'DM Sans',system-ui,sans-serif;
          -webkit-font-smoothing:antialiased;
        }
        @media(max-width:767px){
          .mp{ margin:-16px; height:calc(100dvh - 3.5rem); }
        }

        @keyframes spin{to{transform:rotate(360deg);}}
        @keyframes bounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-4px)}}
        @keyframes pop{from{opacity:0;transform:scale(.94) translateY(6px)}to{opacity:1;transform:scale(1) translateY(0)}}
        @keyframes slideIn{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}

        /* ── TOP BAR ── */
        .topbar{display:flex;align-items:center;justify-content:space-between;padding:0 16px;height:52px;flex-shrink:0;background:rgba(11,15,28,.97);border-bottom:1px solid var(--bdr);backdrop-filter:blur(20px);gap:8px;overflow:hidden;}
        .topbar-l{display:flex;align-items:center;gap:8px;min-width:0;flex:1;}
        .topbar-icon{width:28px;height:28px;border-radius:8px;background:rgba(96,165,250,.12);border:1px solid rgba(96,165,250,.2);display:flex;align-items:center;justify-content:center;flex-shrink:0;}
        .topbar-title{font-size:14px;font-weight:700;color:var(--t1);font-family:'Bricolage Grotesque',sans-serif;white-space:nowrap;}
        .topbar-badge{font-size:10px;font-weight:700;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#fff;padding:2px 7px;border-radius:20px;flex-shrink:0;}
        .topbar-risk{display:flex;align-items:center;gap:5px;background:rgba(249,115,22,.1);border:1px solid rgba(249,115,22,.2);border-radius:20px;padding:2px 10px 2px 7px;font-size:11px;font-weight:600;color:#f97316;flex-shrink:0;}
        .topbar-r{display:flex;align-items:center;gap:6px;flex-shrink:0;}
        .search-btn{display:flex;align-items:center;gap:6px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.09);border-radius:8px;padding:5px 10px;color:var(--t3);font-size:12px;cursor:pointer;transition:.13s;}
        .search-btn:hover{background:rgba(255,255,255,.07);color:var(--t2);}
        .search-shortcut{font-size:10px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.1);border-radius:5px;padding:1px 5px;color:var(--t4);font-family:monospace;}
        @media(max-width:480px){.search-btn span,.search-shortcut{display:none;}}
        .status-btn{display:flex;align-items:center;gap:5px;background:rgba(255,255,255,.04);border:1px solid var(--bdr);border-radius:8px;padding:5px 9px;cursor:pointer;font-size:12px;color:var(--t2);transition:.13s;position:relative;}
        .status-btn:hover{background:rgba(255,255,255,.08);}
        .status-emoji{font-size:14px;}
        .status-label{display:none;}
        @media(min-width:900px){.status-label{display:inline;}}
        .auto-indicator{display:inline-flex;align-items:center;gap:2px;font-size:9px;color:rgba(34,197,94,.7);background:rgba(34,197,94,.08);border-radius:20px;padding:1px 6px;font-weight:600;}
        .new-btn{display:flex;align-items:center;gap:5px;background:linear-gradient(135deg,#7c3aed,#6d28d9);border:none;border-radius:8px;padding:6px 12px;color:#fff;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;}
        @media(max-width:480px){.new-btn span{display:none;}}

        /* ── STATUS PICKER ── */
        .status-picker{position:absolute;top:calc(100% + 8px);right:0;z-index:9999;background:rgba(10,13,22,.98);border:1px solid rgba(255,255,255,.1);border-radius:14px;padding:10px;width:240px;box-shadow:0 20px 60px rgba(0,0,0,.7);animation:fadeUp .15s ease;}
        .sp-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;}
        .sp-title{font-size:12px;font-weight:700;color:var(--t1);}
        .sp-auto-badge{display:inline-flex;align-items:center;gap:3px;font-size:10px;color:#22c55e;background:rgba(34,197,94,.1);border-radius:20px;padding:2px 8px;font-weight:600;}
        .sp-manual-badge{display:inline-flex;align-items:center;gap:3px;font-size:10px;color:#f59e0b;background:rgba(245,158,11,.1);border-radius:20px;padding:2px 8px;font-weight:600;}
        .sp-hint{font-size:10px;color:var(--t4);margin:0 0 8px;line-height:1.4;}
        .sp-item{display:flex;align-items:center;gap:9px;width:100%;padding:8px 10px;border-radius:8px;background:transparent;border:none;cursor:pointer;transition:.12s;font-family:'DM Sans',sans-serif;text-align:left;}
        .sp-item:hover{background:rgba(255,255,255,.06);}
        .sp-item--active{background:rgba(124,58,237,.1);}
        .sp-emoji{font-size:16px;flex-shrink:0;}
        .sp-label{font-size:12px;font-weight:500;color:var(--t1);display:block;}
        .sp-desc{font-size:10px;color:var(--t4);display:block;}

        /* ── BODY LAYOUT ── */
        .mp-body{display:flex;flex:1;min-height:0;}

        /* ── SIDEBAR ── */
        .sidebar{width:280px;flex-shrink:0;display:flex;flex-direction:column;border-right:1px solid var(--bdr);background:var(--bg1);overflow:hidden;}
        @media(max-width:767px){
          .sidebar{width:100%;border-right:none;}
          .sidebar--hidden{display:none;}
        }

        .tabs{display:flex;gap:3px;padding:7px 8px;border-bottom:1px solid var(--bdr2);flex-shrink:0;}
        .tab{flex:1;display:flex;align-items:center;justify-content:center;gap:4px;padding:6px 0;border-radius:7px;background:transparent;border:1px solid transparent;color:var(--t3);font-size:11px;font-weight:600;cursor:pointer;transition:.13s;font-family:'DM Sans',sans-serif;position:relative;}
        .tab--on{background:var(--acs);border-color:rgba(124,58,237,.25);color:#a78bfa;}
        .tab-badge{background:var(--ac);color:#fff;font-size:9px;font-weight:700;padding:1px 5px;border-radius:10px;}

        /* ── DEALS PANEL ── */
        .deals-panel{flex:1;overflow-y:auto;padding:6px 8px 12px;}
        .deal-stats{display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px;padding:6px 8px;margin-bottom:3px;}
        .deal-stat{background:rgba(255,255,255,.03);border:1px solid var(--bdr2);border-radius:9px;padding:7px 8px;text-align:center;}
        .deal-stat-val{font-size:17px;font-weight:800;font-family:'Bricolage Grotesque',sans-serif;line-height:1;}
        .deal-stat-lbl{font-size:9px;color:var(--t4);text-transform:uppercase;letter-spacing:.05em;}
        .dr-card{width:100%;text-align:left;background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.05);border-radius:10px;padding:10px 11px;margin-bottom:4px;cursor:pointer;transition:all .13s;font-family:'DM Sans',sans-serif;}
        .dr-card:hover{background:rgba(255,255,255,.04);}
        .dr-card--active{background:rgba(96,165,250,.07)!important;border-color:rgba(96,165,250,.3)!important;}
        .dr-card-row1{display:flex;align-items:center;gap:8px;margin-bottom:5px;}
        .dr-icon{width:26px;height:26px;border-radius:7px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:13px;}
        .dr-info{flex:1;min-width:0;}
        .dr-name{font-size:12px;font-weight:600;color:var(--t1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block;}
        .dr-company{font-size:10px;color:var(--t3);display:block;}
        .dr-unread{min-width:15px;height:15px;border-radius:8px;background:linear-gradient(135deg,#7c3aed,#6d28d9);font-size:9px;font-weight:700;color:#fff;padding:0 3px;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
        .dr-card-row2{display:flex;align-items:center;gap:5px;margin-bottom:4px;flex-wrap:wrap;}
        .dr-stage{font-size:10px;font-weight:600;padding:2px 7px;border-radius:20px;}
        .dr-sent{font-size:10px;font-weight:500;}
        .dr-score{font-size:10px;color:var(--t3);}
        .dr-next{display:flex;align-items:center;gap:4px;font-size:10px;color:#60a5fa;background:rgba(96,165,250,.08);border-radius:6px;padding:3px 7px;overflow:hidden;}
        .dr-next span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}

        /* ── DEAL ROOM HEADER (above chat) ── */
        .drh{display:flex;align-items:center;gap:10px;padding:10px 14px;background:rgba(96,165,250,.04);border-bottom:1px solid rgba(96,165,250,.12);flex-shrink:0;flex-wrap:wrap;min-width:0;}
        .drh-icon{width:30px;height:30px;border-radius:8px;flex-shrink:0;display:flex;align-items:center;justify-content:center;}
        .drh-content{flex:1;min-width:0;}
        .drh-name{font-size:13px;font-weight:700;color:var(--t1);font-family:'Bricolage Grotesque',sans-serif;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
        .drh-company{font-size:10px;color:var(--t3);}
        .drh-stats{display:flex;align-items:center;gap:8px;flex-wrap:wrap;flex-shrink:0;}
        .drh-stage{font-size:10px;font-weight:600;padding:2px 8px;border-radius:20px;}
        .drh-stat{display:inline-flex;align-items:center;gap:3px;font-size:11px;font-weight:600;}
        .drh-next{display:inline-flex;align-items:center;gap:4px;font-size:10px;color:#60a5fa;background:rgba(96,165,250,.08);border-radius:6px;padding:3px 7px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}

        /* ── SECTION HEADERS ── */
        .sb-sec{margin-bottom:2px;}
        .sb-sec-hdr{display:flex;align-items:center;gap:6px;width:100%;padding:5px 10px 3px;background:transparent;border:none;cursor:pointer;font-family:'DM Sans',sans-serif;}
        .sb-sec-hdr:hover{background:rgba(255,255,255,.02);}
        .sb-sec-label{font-size:9px;font-weight:700;color:var(--t4);text-transform:uppercase;letter-spacing:.08em;flex:1;text-align:left;}
        .sb-sec-ct{background:var(--acs);color:#a78bfa;font-size:9px;padding:1px 6px;border-radius:10px;}

        /* ── CONV LIST ── */
        .conv-list{flex:1;overflow-y:auto;padding:0 6px 8px;}
        .conv-item{width:100%;display:flex;align-items:center;gap:9px;padding:8px 9px;border-radius:10px;border:1px solid transparent;background:transparent;cursor:pointer;text-align:left;transition:all .12s;margin-bottom:2px;font-family:'DM Sans',sans-serif;}
        .conv-item:hover{background:rgba(255,255,255,.03);}
        .conv-item--active{background:var(--acs)!important;border-color:rgba(124,58,237,.22)!important;}
        .conv-av-wrap{position:relative;flex-shrink:0;}
        .conv-av{width:36px;height:36px;border-radius:10px;background:rgba(124,58,237,.18);border:1px solid rgba(124,58,237,.2);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#a78bfa;}
        .conv-av--grp{background:rgba(139,92,246,.15);color:#c084fc;}
        .conv-unread{position:absolute;top:-4px;left:-4px;min-width:15px;height:15px;border-radius:8px;background:linear-gradient(135deg,#7c3aed,#6d28d9);display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#fff;padding:0 3px;}
        .conv-info{flex:1;min-width:0;}
        .conv-row1{display:flex;justify-content:space-between;align-items:baseline;gap:4px;}
        .conv-name{font-size:12px;font-weight:500;color:rgba(255,255,255,.65);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .conv-name--bold{font-weight:700;color:var(--t1);}
        .conv-preview{font-size:11px;color:var(--t3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin:1px 0 0;}

        /* ── RIGHT PANEL ── */
        .right{flex:1;display:flex;flex-direction:column;min-width:0;background:rgba(6,9,18,.7);}
        @media(max-width:767px){.right--hidden{display:none!important;}.right{width:100%;}}

        .right-empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:40px 24px;}
        .re-icon{width:64px;height:64px;border-radius:18px;margin-bottom:18px;background:rgba(96,165,250,.08);border:1px solid rgba(96,165,250,.15);display:flex;align-items:center;justify-content:center;}
        .right-empty h3{font-size:17px;font-weight:700;color:#64748b;font-family:'Bricolage Grotesque',sans-serif;margin:0 0 8px;}
        .right-empty p{font-size:12px;color:var(--t4);max-width:260px;line-height:1.65;margin:0 0 20px;}
        .re-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;}
        .re-btn{display:inline-flex;align-items:center;gap:6px;background:linear-gradient(135deg,#7c3aed,#6d28d9);border:none;border-radius:10px;padding:8px 16px;color:#fff;font-size:12px;font-weight:600;cursor:pointer;}
        .re-btn-sec{display:inline-flex;align-items:center;gap:6px;background:rgba(96,165,250,.1);border:1px solid rgba(96,165,250,.2);border-radius:10px;padding:8px 16px;color:#60a5fa;font-size:12px;font-weight:600;cursor:pointer;}
        .re-risk-alert{margin-top:20px;padding:10px 14px;background:rgba(249,115,22,.08);border:1px solid rgba(249,115,22,.2);border-radius:11px;display:flex;align-items:center;gap:8px;font-size:12px;color:#f97316;}

        /* ── CHAT THREAD ── */
        .chat-thread{display:flex;flex-direction:column;height:100%;position:relative;}
        .chat-hdr{display:flex;align-items:center;gap:8px;padding:9px 12px;flex-shrink:0;background:rgba(11,15,28,.93);border-bottom:1px solid var(--bdr);backdrop-filter:blur(20px);flex-wrap:nowrap;min-width:0;}
        .back-btn{background:rgba(255,255,255,.05);border:1px solid var(--bdr);border-radius:7px;width:28px;height:28px;min-width:28px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--t2);flex-shrink:0;}
        @media(min-width:768px){.back-btn{display:none;}}
        .chat-av-wrap{position:relative;flex-shrink:0;}
        .chat-av{width:32px;height:32px;border-radius:8px;background:linear-gradient(135deg,rgba(124,58,237,.25),rgba(109,40,217,.25));border:1px solid rgba(124,58,237,.28);display:flex;align-items:center;justify-content:center;}
        .chat-info{flex:1;min-width:0;}
        .chat-name{font-size:13px;font-weight:600;color:var(--t1);font-family:'Bricolage Grotesque',sans-serif;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .chat-sub{font-size:10px;margin:0;}
        .chat-typing{font-size:10px;margin:0;color:#a78bfa;font-style:italic;}
        .hdr-acts{display:flex;align-items:center;gap:2px;flex-shrink:0;}
        .hdr-btn{width:26px;height:26px;border-radius:6px;background:transparent;border:1px solid transparent;display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--t3);transition:.12s;}
        .hdr-btn:hover{background:rgba(255,255,255,.06);color:var(--t1);}
        .hdr-btn--on{background:var(--acs);border-color:rgba(124,58,237,.3);color:#a78bfa;}
        .hdr-btn--muted{color:#f59e0b;}
        .pres-dot{display:inline-block;width:8px;height:8px;border-radius:50%;border:2px solid var(--bg1);position:absolute;bottom:-1px;right:-1px;flex-shrink:0;}

        /* ── MESSAGES ── */
        .msgs-area{flex:1;overflow-y:auto;padding:12px 14px;}
        @media(max-width:767px){.msgs-area{padding:10px;}}
        .center-spin{display:flex;justify-content:center;padding:40px 0;}
        .spin{width:18px;height:18px;color:#7c3aed;animation:spin 1s linear infinite;}
        .empty-chat{display:flex;flex-direction:column;align-items:center;padding:60px 20px;text-align:center;}
        .empty-icon{width:50px;height:50px;border-radius:14px;margin-bottom:12px;background:rgba(124,58,237,.1);border:1px solid rgba(124,58,237,.2);display:flex;align-items:center;justify-content:center;}
        .empty-title{font-size:14px;font-weight:600;color:#64748b;margin:0 0 6px;font-family:'Bricolage Grotesque',sans-serif;}
        .empty-sub{font-size:11px;color:var(--t4);margin:0;max-width:220px;line-height:1.6;}
        .divider-row{display:flex;align-items:center;gap:10px;margin:14px 0 8px;}
        .div-line{flex:1;height:1px;background:var(--bdr2);}
        .div-label{font-size:10px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--t3);padding:2px 8px;background:rgba(255,255,255,.03);border:1px solid var(--bdr2);border-radius:20px;white-space:nowrap;}
        .msg-row{display:flex;margin-bottom:2px;}
        .msg-me{justify-content:flex-end;margin-top:2px;}
        .msg-them{justify-content:flex-start;margin-top:2px;}
        .msg-row:not(.msg-same){margin-top:9px;}
        .msg-av{width:28px;height:28px;border-radius:7px;flex-shrink:0;min-width:28px;background:rgba(124,58,237,.2);border:1px solid rgba(124,58,237,.2);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#818cf8;margin-right:7px;margin-top:2px;}
        .msg-av.small{width:24px;height:24px;font-size:9px;margin-right:6px;min-width:24px;}
        .msg-av-sp{width:35px;flex-shrink:0;min-width:35px;}
        .msg-body{display:flex;flex-direction:column;max-width:70%;position:relative;}
        @media(max-width:480px){.msg-body{max-width:85%;}}
        .body-me{align-items:flex-end;}.body-them{align-items:flex-start;}
        .msg-sender{font-size:10px;color:var(--t3);margin:0 0 2px 2px;font-weight:500;}
        .bubble{padding:8px 12px;line-height:1.55;cursor:context-menu;word-break:break-word;}
        .bubble.me{background:linear-gradient(135deg,#7c3aed,#6d28d9);border:1px solid rgba(124,58,237,.4);border-radius:14px 14px 4px 14px;box-shadow:0 2px 12px rgba(124,58,237,.25);}
        .bubble.them{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.07);border-radius:14px 14px 14px 4px;}
        .bubble-txt{font-size:13px;color:#fff;margin:0;font-family:'DM Sans',sans-serif;line-height:1.6;}
        .bubble.them .bubble-txt{color:rgba(255,255,255,.83);}
        @media(max-width:767px){.bubble-txt{font-size:14px;}.bubble{padding:9px 13px;}}
        .md-code{background:rgba(0,0,0,.35);border-radius:4px;padding:1px 5px;font-family:monospace;font-size:11px;}
        .md-pre{background:rgba(0,0,0,.4);border-radius:8px;padding:9px 12px;font-family:monospace;font-size:11px;overflow-x:auto;margin:4px 0 0;white-space:pre;}
        .md-mention{color:#c084fc;font-weight:700;background:rgba(192,132,252,.1);border-radius:4px;padding:0 3px;}
        .md-mention--all{color:#fbbf24;background:rgba(251,191,36,.12);}
        .sys-msg{display:flex;align-items:flex-start;gap:8px;margin:10px 0;padding:10px 13px;background:rgba(96,165,250,.05);border:1px solid rgba(96,165,250,.12);border-radius:11px;border-left:3px solid rgba(96,165,250,.4);font-size:12px;color:rgba(255,255,255,.7);line-height:1.55;}
        .rxn-bar{display:flex;flex-wrap:wrap;gap:3px;margin-top:4px;align-items:center;}
        .rxn-chip{display:inline-flex;align-items:center;gap:3px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:20px;padding:2px 7px;cursor:pointer;font-size:13px;transition:.12s;}
        .rxn-chip:hover{background:rgba(255,255,255,.1);}
        .rxn-chip--mine{background:var(--acs);border-color:rgba(124,58,237,.4);}
        .rxn-chip span{font-size:11px;color:rgba(255,255,255,.7);font-weight:600;}
        .rxn-add{width:20px;height:20px;border-radius:50%;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--t3);}
        .rxn-add:hover{background:rgba(255,255,255,.1);}
        .ep-wrap{position:absolute;bottom:calc(100% + 6px);left:0;z-index:9999;background:rgba(10,13,22,.97);border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:8px;box-shadow:0 16px 48px rgba(0,0,0,.7);animation:fadeUp .12s ease;}
        .ep-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:2px;}
        .ep-btn{padding:4px;border:none;background:transparent;cursor:pointer;font-size:16px;border-radius:5px;transition:.1s;}
        .ep-btn:hover{background:rgba(255,255,255,.1);}
        .ha-row{display:none;position:absolute;top:4px;background:rgba(11,15,28,.96);border:1px solid var(--bdr);border-radius:8px;padding:2px;box-shadow:0 8px 24px rgba(0,0,0,.5);gap:1px;align-items:center;}
        .ha-row--me{right:calc(100% + 6px);}
        .ha-row--them{left:calc(100% + 6px);}
        @media(min-width:768px){.msg-row:hover .ha-row{display:flex;}}
        .ha{background:transparent;border:none;border-radius:5px;padding:4px 5px;cursor:pointer;color:rgba(255,255,255,.35);display:flex;align-items:center;}
        .ha:hover{background:rgba(255,255,255,.08);color:#fff;}
        .ha-del:hover{background:rgba(239,68,68,.15);color:#f87171;}
        .edit-wrap{display:flex;align-items:center;gap:5px;background:rgba(124,58,237,.1);border:1px solid rgba(124,58,237,.3);border-radius:10px;padding:6px 10px;}
        .edit-input{background:transparent;border:none;outline:none;color:var(--t1);font-size:13px;flex:1;font-family:'DM Sans',sans-serif;}
        .edit-save{background:#7c3aed;border:none;border-radius:5px;padding:3px 8px;color:#fff;font-size:11px;font-weight:600;cursor:pointer;}
        .edit-cancel{background:transparent;border:none;color:var(--t3);cursor:pointer;font-size:16px;line-height:1;padding:0 2px;}
        .msg-meta{display:flex;align-items:center;gap:4px;margin-top:3px;padding:0 2px;}
        .msg-meta--me{justify-content:flex-end;}
        .meta-time{font-size:10px;color:var(--t4);}
        .attach-img{border-radius:8px;max-width:100%;max-height:150px;object-fit:cover;display:block;}
        .attach-file{display:flex;align-items:center;gap:7px;padding:6px 9px;border-radius:7px;text-decoration:none;background:rgba(255,255,255,.1);font-size:12px;color:rgba(255,255,255,.85);}
        .file-prev{display:flex;align-items:center;gap:7px;margin:0 12px 4px;background:rgba(124,58,237,.07);border:1px solid rgba(124,58,237,.2);border-radius:9px;padding:6px 11px;}
        .fp-name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:#94a3b8;}

        /* ── COMPOSER ── */
        .cmp{border-top:1px solid var(--bdr2);background:rgba(11,15,28,.85);backdrop-filter:blur(12px);flex-shrink:0;}
        .cmp-fmt{display:flex;align-items:center;gap:1px;padding:5px 10px 0;border-top:1px solid var(--bdr2);}
        .cmp-fmt-btn{background:transparent;border:none;color:var(--t3);padding:4px 6px;border-radius:5px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:.12s;}
        .cmp-fmt-btn:hover{background:rgba(255,255,255,.07);color:var(--t1);}
        .cmp-mentions{background:rgba(10,13,22,.98);border:1px solid rgba(255,255,255,.1);border-bottom:none;animation:fadeUp .13s ease;}
        .cmp-mention-item{display:flex;align-items:center;gap:9px;width:100%;padding:8px 13px;background:transparent;border:none;border-bottom:1px solid rgba(255,255,255,.05);cursor:pointer;font-family:'DM Sans',sans-serif;transition:.1s;color:var(--t1);}
        .cmp-mention-item:hover{background:var(--acs);}
        .cmp-mention-av{width:24px;height:24px;border-radius:6px;background:rgba(124,58,237,.2);border:1px solid rgba(124,58,237,.25);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#a78bfa;flex-shrink:0;}
        .cmp-row{display:flex;align-items:flex-end;gap:6px;padding:7px 10px;}
        .cmp-icon{background:none;border:none;cursor:pointer;color:var(--t3);display:flex;align-items:center;padding:5px;border-radius:6px;transition:.12s;flex-shrink:0;}
        .cmp-icon:hover{color:var(--t1);background:rgba(255,255,255,.06);}
        .cmp-ta{flex:1;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:9px;padding:8px 11px;color:var(--t1);font-size:13px;font-family:'DM Sans',sans-serif;resize:none;outline:none;line-height:1.55;transition:border-color .13s;min-height:36px;max-height:140px;}
        .cmp-ta::placeholder{color:var(--t4);}
        .cmp-ta:focus{border-color:rgba(124,58,237,.4);}
        @media(max-width:767px){.cmp-ta{font-size:16px;}}
        .cmp-send{width:33px;height:33px;border-radius:9px;border:none;background:rgba(124,58,237,.3);color:rgba(255,255,255,.4);display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;transition:all .13s;align-self:flex-end;}
        .cmp-send--on{background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#fff;box-shadow:0 2px 10px var(--acg);}
        .cmp-hint{font-size:10px;color:var(--t4);text-align:center;padding:0 0 7px;margin:0;}
        @media(max-width:767px){.cmp-hint{display:none;}}

        /* ── SIDE PANELS ── */
        .side-panel{position:absolute;right:0;top:0;bottom:0;width:340px;background:var(--bg2);border-left:1px solid var(--bdr);display:flex;flex-direction:column;z-index:40;animation:slideIn .2s ease;box-shadow:-16px 0 48px rgba(0,0,0,.5);}
        @media(max-width:767px){.side-panel{width:100%;border-left:none;}}
        .panel-hdr{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid var(--bdr);flex-shrink:0;}
        .panel-title{font-size:12px;font-weight:600;color:var(--t1);font-family:'Bricolage Grotesque',sans-serif;flex:1;}
        .panel-close-btn{background:rgba(255,255,255,.06);border:1px solid var(--bdr);border-radius:6px;width:24px;height:24px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--t3);}
        .panel-body{flex:1;overflow-y:auto;padding:10px;}
        .panel-composer{padding:8px 10px;border-top:1px solid var(--bdr2);display:flex;gap:6px;}
        .pc-input{flex:1;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:7px 11px;color:var(--t1);font-size:13px;font-family:'DM Sans',sans-serif;outline:none;}
        .pc-input:focus{border-color:rgba(124,58,237,.4);}
        .pc-send{width:31px;height:31px;border-radius:8px;border:none;background:rgba(124,58,237,.3);color:rgba(255,255,255,.4);display:flex;align-items:center;justify-content:center;cursor:pointer;align-self:flex-end;}
        .pc-send--on{background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#fff;}
        .panel-empty{display:flex;flex-direction:column;align-items:center;gap:8px;padding:32px 16px;text-align:center;color:var(--t3);font-size:12px;}
        .thread-parent{display:flex;gap:8px;padding:10px;background:rgba(255,255,255,.03);border-radius:9px;margin-bottom:9px;border-left:3px solid #7c3aed;}
        .pin-item{display:flex;gap:8px;padding:9px 11px;border-radius:8px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.05);margin-bottom:5px;}
        .pin-txt{font-size:12px;color:rgba(255,255,255,.7);margin:0 0 3px;line-height:1.4;}

        /* ── CONTEXT MENU ── */
        .ctx-menu{background:rgba(10,13,22,.97);border:1px solid rgba(255,255,255,.08);border-radius:11px;box-shadow:0 20px 60px rgba(0,0,0,.7);overflow:hidden;width:180px;animation:fadeUp .12s ease;}
        .ctx-item{display:flex;align-items:center;gap:9px;width:100%;padding:8px 13px;background:transparent;border:none;border-bottom:1px solid rgba(255,255,255,.05);color:rgba(255,255,255,.7);font-size:12px;font-weight:500;cursor:pointer;font-family:'DM Sans',sans-serif;transition:.12s;}
        .ctx-item:last-child{border-bottom:none;}
        .ctx-item:hover{background:rgba(255,255,255,.06);color:#fff;}
        .ctx-item--danger{color:#f87171;}
        .ctx-item--danger:hover{background:rgba(239,68,68,.12);}

        /* ── GLOBAL SEARCH ── */
        .gs-overlay{position:fixed;inset:0;z-index:9990;background:rgba(0,0,0,.7);backdrop-filter:blur(8px);display:flex;align-items:flex-start;justify-content:center;padding-top:70px;animation:fadeUp .14s ease;}
        .gs-panel{width:100%;max-width:600px;margin:0 14px;background:rgba(10,13,22,.99);border:1px solid rgba(255,255,255,.1);border-radius:16px;overflow:hidden;box-shadow:0 40px 100px rgba(0,0,0,.8);max-height:calc(100dvh - 100px);display:flex;flex-direction:column;}
        .gs-row{display:flex;align-items:center;gap:10px;padding:14px 18px;border-bottom:1px solid var(--bdr);}
        .gs-input{flex:1;background:transparent;border:none;outline:none;color:var(--t1);font-size:15px;font-family:'DM Sans',sans-serif;}
        .gs-input::placeholder{color:var(--t4);}
        .gs-close{background:rgba(255,255,255,.07);border:1px solid var(--bdr);border-radius:6px;width:26px;height:26px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--t3);}
        .gs-results{flex:1;overflow-y:auto;padding:6px 0;}
        .gs-empty{display:flex;flex-direction:column;align-items:center;gap:10px;padding:40px 20px;text-align:center;color:var(--t3);font-size:12px;}
        .gs-result{display:flex;align-items:center;gap:10px;width:100%;padding:10px 18px;background:transparent;border:none;cursor:pointer;text-align:left;transition:.12s;border-bottom:1px solid var(--bdr2);font-family:'DM Sans',sans-serif;}
        .gs-result:hover{background:rgba(255,255,255,.03);}
        .gs-preview{font-size:12px;color:rgba(255,255,255,.65);margin:0 0 2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}

        /* ── NOTIFICATIONS ── */
        .notif-panel{display:flex;flex-direction:column;height:100%;}
        .notif-hdr{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid var(--bdr);flex-shrink:0;flex-wrap:wrap;gap:6px;}
        .notif-title{font-size:13px;font-weight:600;color:var(--t1);font-family:'Bricolage Grotesque',sans-serif;}
        .notif-badge{background:var(--acs);color:#a78bfa;font-size:10px;font-weight:700;padding:2px 7px;border-radius:20px;}
        .filter-btn{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);border-radius:6px;padding:3px 9px;color:var(--t3);font-size:11px;font-weight:500;cursor:pointer;display:flex;align-items:center;gap:3px;}
        .filter-btn:hover{background:rgba(255,255,255,.08);color:var(--t1);}
        .notif-list{flex:1;overflow-y:auto;}
        .notif-item{display:flex;gap:10px;padding:11px 14px;border-bottom:1px solid var(--bdr2);cursor:pointer;transition:.12s;}
        .notif-item:hover{background:rgba(255,255,255,.02);}
        .notif-item--unread{background:rgba(124,58,237,.04);}
        .notif-icon{width:30px;height:30px;border-radius:8px;flex-shrink:0;background:var(--acs);border:1px solid rgba(124,58,237,.2);display:flex;align-items:center;justify-content:center;color:#a78bfa;margin-top:1px;}
        .notif-txt{font-size:12px;color:rgba(255,255,255,.5);margin:0;line-height:1.5;}
        .notif-txt--bold{font-weight:600;color:rgba(255,255,255,.88);}
        .notif-dot{width:6px;height:6px;border-radius:50%;background:var(--ac);flex-shrink:0;margin-top:5px;}

        /* ── MOBILE BOTTOM NAV ── */
        .bnav{display:none;position:fixed;bottom:0;left:0;right:0;background:rgba(11,15,28,.98);backdrop-filter:blur(20px);border-top:1px solid var(--bdr);z-index:50;padding-bottom:env(safe-area-inset-bottom,0);}
        @media(max-width:767px){.bnav{display:flex;}}
        .bnav-btn{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding:10px 0;background:transparent;border:none;cursor:pointer;color:var(--t3);font-size:10px;font-weight:600;font-family:'DM Sans',sans-serif;transition:color .13s;}
        .bnav-btn--on{color:#a78bfa;}
        .bnav-icon{position:relative;}
        .bnav-badge{position:absolute;top:-4px;right:-6px;width:13px;height:13px;border-radius:50%;background:linear-gradient(135deg,#7c3aed,#6d28d9);font-size:8px;font-weight:700;color:#fff;display:flex;align-items:center;justify-content:center;}

        /* ── SCROLLBARS ── */
        .msgs-area::-webkit-scrollbar,.conv-list::-webkit-scrollbar,.notif-list::-webkit-scrollbar,.panel-body::-webkit-scrollbar,.deals-panel::-webkit-scrollbar,.gs-results::-webkit-scrollbar{width:3px;}
        .msgs-area::-webkit-scrollbar-thumb,.conv-list::-webkit-scrollbar-thumb,.notif-list::-webkit-scrollbar-thumb,.panel-body::-webkit-scrollbar-thumb,.deals-panel::-webkit-scrollbar-thumb,.gs-results::-webkit-scrollbar-thumb{background:rgba(124,58,237,.2);border-radius:2px;}

        .sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);}
      `}</style>

      <DashboardLayout>
        <div className="mp">
          {/* ── TOP BAR ── */}
          <div className="topbar">
            <div className="topbar-l">
              <div className="topbar-icon"><Briefcase style={{width:13,height:13,color:"#60a5fa"}}/></div>
              <p className="topbar-title">Sales Hub</p>
              {totalBadge>0&&<span className="topbar-badge">{totalBadge}</span>}
              {atRiskDeals>0&&(
                <div className="topbar-risk"><AlertTriangle style={{width:10,height:10}}/>{atRiskDeals} at risk</div>
              )}
            </div>
            <div className="topbar-r">
              <button className="search-btn" onClick={()=>setShowSearch(true)}>
                <Search style={{width:12,height:12}}/><span>Search</span>
                <span className="search-shortcut">⌘K</span>
              </button>

              {/* Status button — shows auto/manual state */}
              <div style={{position:"relative"}}>
                <button className="status-btn" onClick={()=>setShowStatusPicker(p=>!p)}>
                  <span className="status-emoji">{myStatusCfg.emoji}</span>
                  <span className="status-label">{myStatusCfg.label}</span>
                  {!isManual && <span className="auto-indicator"><Radio style={{width:8,height:8}}/>Auto</span>}
                  <ChevronDown style={{width:9,height:9,color:"rgba(255,255,255,.3)"}}/>
                </button>
                {showStatusPicker&&(
                  <StatusPicker
                    current={myStatus} isManual={isManual}
                    onSelect={(s)=>setStatus(s)}
                    onClose={()=>setShowStatusPicker(false)}
                  />
                )}
              </div>

              <button className="new-btn" onClick={()=>setNewOpen(true)}>
                <Plus style={{width:13,height:13}}/><span>New Chat</span>
              </button>
            </div>
          </div>

          {/* ── BODY ── */}
          <div className="mp-body">
            {/* ── SIDEBAR ── */}
            <div className={cn("sidebar", mobileView==="chat" && "sidebar--hidden")}>
              <div className="tabs">
                <button className={cn("tab",tab==="deals"&&"tab--on")} onClick={()=>setTab("deals")}>
                  <Briefcase style={{width:11,height:11}}/>Deals
                  {dealRooms.length>0&&<span className="tab-badge">{dealRooms.length}</span>}
                </button>
                <button className={cn("tab",tab==="chats"&&"tab--on")} onClick={()=>setTab("chats")}>
                  <MessageSquare style={{width:11,height:11}}/>Chats
                  {totalUnread>0&&<span className="tab-badge">{totalUnread}</span>}
                </button>
                <button className={cn("tab",tab==="notifs"&&"tab--on")} onClick={()=>setTab("notifs")}>
                  <Bell style={{width:11,height:11}}/>Alerts
                  {notifCount>0&&<span className="tab-badge">{notifCount}</span>}
                </button>
              </div>

              {/* DEALS TAB */}
              {tab==="deals"&&(
                <div className="deals-panel">
                  <div className="deal-stats">
                    <div className="deal-stat">
                      <div className="deal-stat-val" style={{color:"#22c55e"}}>{wonDeals}</div>
                      <div className="deal-stat-lbl">Won</div>
                    </div>
                    <div className="deal-stat">
                      <div className="deal-stat-val" style={{color:"#f97316"}}>{atRiskDeals}</div>
                      <div className="deal-stat-lbl">At Risk</div>
                    </div>
                    <div className="deal-stat">
                      <div className="deal-stat-val">{dealRooms.length}</div>
                      <div className="deal-stat-lbl">Total</div>
                    </div>
                  </div>

                  {dealRoomsLoading ? (
                    <div className="center-spin"><Loader2 className="spin"/></div>
                  ) : dealRooms.length===0 ? (
                    <div className="panel-empty">
                      <Briefcase style={{width:28,height:28,opacity:.2}}/>
                      <p>No deal rooms yet</p>
                      <p style={{fontSize:10,color:"rgba(255,255,255,.2)"}}>Complete a live call to create one</p>
                    </div>
                  ) : (
                    <>
                      {atRiskDeals>0&&(
                        <div className="sb-sec">
                          <div className="sb-sec-hdr">
                            <AlertTriangle style={{width:9,height:9,color:"#f97316"}}/>
                            <span className="sb-sec-label" style={{color:"rgba(249,115,22,.5)"}}>At Risk</span>
                            <span className="sb-sec-ct" style={{background:"rgba(249,115,22,.1)",color:"#f97316"}}>{atRiskDeals}</span>
                          </div>
                          {dealRooms.filter(d=>d.stage==="at_risk").map(room=>(
                            <DealRoomCard key={room.id} room={room} isSelected={activeDealRoom?.id===room.id} onClick={()=>pickDealRoom(room)}/>
                          ))}
                        </div>
                      )}
                      {activeDeals.length>0&&(
                        <div className="sb-sec">
                          <div className="sb-sec-hdr">
                            <Activity style={{width:9,height:9,color:"rgba(255,255,255,.3)"}}/>
                            <span className="sb-sec-label">Active</span>
                            <span className="sb-sec-ct">{activeDeals.length}</span>
                          </div>
                          {activeDeals.map(room=>(
                            <DealRoomCard key={room.id} room={room} isSelected={activeDealRoom?.id===room.id} onClick={()=>pickDealRoom(room)}/>
                          ))}
                        </div>
                      )}
                      {wonDeals>0&&(
                        <div className="sb-sec">
                          <div className="sb-sec-hdr">
                            <Award style={{width:9,height:9,color:"rgba(255,255,255,.3)"}}/>
                            <span className="sb-sec-label">Won</span>
                            <span className="sb-sec-ct" style={{background:"rgba(34,197,94,.1)",color:"#22c55e"}}>{wonDeals}</span>
                          </div>
                          {dealRooms.filter(d=>d.stage==="won").map(room=>(
                            <DealRoomCard key={room.id} room={room} isSelected={activeDealRoom?.id===room.id} onClick={()=>pickDealRoom(room)}/>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* CHATS TAB */}
              {tab==="chats"&&(
                <div className="conv-list">
                  {conversationsLoading ? <div className="center-spin"><Loader2 className="spin"/></div>
                    : conversations.length===0 ? (
                      <div className="panel-empty"><MessageSquare style={{width:24,height:24,opacity:.2}}/><p>No conversations</p></div>
                    ) : (
                      <>
                        {groupConvs.length>0&&(
                          <div className="sb-sec">
                            <div className="sb-sec-hdr">
                              <Users style={{width:9,height:9,color:"rgba(255,255,255,.3)"}}/>
                              <span className="sb-sec-label">Group Chats</span>
                            </div>
                            {groupConvs.map(c=>{
                              const nm=getConversationName(c);
                              return (
                                <button key={c.id} className={cn("conv-item",sel===c.id&&"conv-item--active")} onClick={()=>pick(c.id)}>
                                  <div className="conv-av-wrap">
                                    <div className="conv-av conv-av--grp"><Users style={{width:13,height:13}}/></div>
                                    {c.unread_count>0&&<div className="conv-unread">{c.unread_count>9?"9+":c.unread_count}</div>}
                                  </div>
                                  <div className="conv-info">
                                    <div className="conv-row1">
                                      <span className={cn("conv-name",c.unread_count>0&&"conv-name--bold")}>{nm}</span>
                                      {c.last_message&&<span className="meta-time">{fmtTime(c.last_message.created_at)}</span>}
                                    </div>
                                    <p className="conv-preview">{c.last_message?.message_text||"No messages yet"}</p>
                                  </div>
                                  <ChevronRight style={{width:12,height:12,color:"rgba(255,255,255,.15)"}}/>
                                </button>
                              );
                            })}
                          </div>
                        )}
                        {dmConvs.length>0&&(
                          <div className="sb-sec">
                            <div className="sb-sec-hdr">
                              <MessageSquare style={{width:9,height:9,color:"rgba(255,255,255,.3)"}}/>
                              <span className="sb-sec-label">Direct Messages</span>
                            </div>
                            {dmConvs.map(c=>{
                              const nm=getConversationName(c);
                              const otherId=c.participants[0]?.user_id;
                              const otherOn=otherId?isOnline(otherId):false;
                              const status=otherId?getStatus(otherId):"available";
                              const stCfg=STATUS_CONFIG[status];
                              return (
                                <button key={c.id} className={cn("conv-item",sel===c.id&&"conv-item--active")} onClick={()=>pick(c.id)}>
                                  <div className="conv-av-wrap">
                                    <div className="conv-av">{initials(nm)}</div>
                                    <span className="pres-dot" style={{position:"absolute",bottom:-1,right:-1,background:otherOn?stCfg.color:"rgba(255,255,255,.12)"}}/>
                                    {c.unread_count>0&&<div className="conv-unread">{c.unread_count>9?"9+":c.unread_count}</div>}
                                  </div>
                                  <div className="conv-info">
                                    <div className="conv-row1">
                                      <span className={cn("conv-name",c.unread_count>0&&"conv-name--bold")}>{nm}</span>
                                      {c.last_message&&<span className="meta-time">{fmtTime(c.last_message.created_at)}</span>}
                                    </div>
                                    <p className="conv-preview">
                                      {otherOn?`${stCfg.emoji} ${stCfg.label}`:c.last_message?.message_text||"No messages yet"}
                                    </p>
                                  </div>
                                  <ChevronRight style={{width:12,height:12,color:"rgba(255,255,255,.15)"}}/>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </>
                    )}
                </div>
              )}

              {tab==="notifs"&&<NotifsPanel/>}
            </div>

            {/* ── RIGHT PANEL ── */}
            <div className={cn("right", mobileView==="list" && "right--hidden")}>
              {activeChatConvId ? (
                <ChatThread
                  convId={activeChatConvId}
                  convs={conversations}
                  onBack={back}
                  isOnline={isOnline}
                  members={members}
                  myId={user?.id??""}
                  dealRoom={activeDealRoom??undefined}
                  getStatus={getStatus}
                  isMobile={mobileView==="chat"}
                />
              ) : (
                <div className="right-empty">
                  <div className="re-icon"><Briefcase style={{width:26,height:26,color:"#60a5fa"}}/></div>
                  <h3>Sales Intelligence Hub</h3>
                  <p>Select a Deal Room for deal-specific chat, or open a Direct Message to collaborate with teammates.</p>
                  <div className="re-actions">
                    <button className="re-btn-sec" onClick={()=>setTab("deals")}>
                      <Briefcase style={{width:12,height:12}}/> View Deals
                    </button>
                    <button className="re-btn" onClick={()=>setNewOpen(true)}>
                      <Plus style={{width:12,height:12}}/> New Message
                    </button>
                  </div>
                  {atRiskDeals>0&&(
                    <div className="re-risk-alert">
                      <AlertTriangle style={{width:13,height:13}}/>
                      <span><strong>{atRiskDeals}</strong> deal{atRiskDeals!==1?"s":""} need attention</span>
                      <button onClick={()=>setTab("deals")} style={{marginLeft:"auto",background:"none",border:"none",color:"#f97316",cursor:"pointer",fontSize:11,fontWeight:600}}>
                        Review →
                      </button>
                    </div>
                  )}
                  {/* Auto-status info card */}
                  <div style={{marginTop:16,padding:"10px 14px",background:"rgba(34,197,94,.06)",border:"1px solid rgba(34,197,94,.15)",borderRadius:11,display:"flex",alignItems:"center",gap:8,fontSize:11,color:"rgba(34,197,94,.8)"}}>
                    <Radio style={{width:12,height:12,flexShrink:0}}/>
                    <span>Status auto-tracks your activity — {myStatusCfg.emoji} {myStatusCfg.label}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── MOBILE BOTTOM NAV ── */}
          <nav className="bnav">
            {([
              {id:"deals" as const, label:"Deals",  Icon:Briefcase,    badge:atRiskDeals},
              {id:"chats" as const, label:"Chats",  Icon:MessageSquare,badge:totalUnread},
              {id:"notifs"as const, label:"Alerts", Icon:Bell,         badge:notifCount},
            ]).map(t=>(
              <button key={t.id} className={cn("bnav-btn",tab===t.id&&mobileView==="list"&&"bnav-btn--on")}
                onClick={()=>{ setTab(t.id); setMobileView("list"); }}>
                <div className="bnav-icon">
                  <t.Icon style={{width:20,height:20}}/>
                  {t.badge>0&&<span className="bnav-badge">{t.badge>9?"9+":t.badge}</span>}
                </div>
                {t.label}
              </button>
            ))}
            <button className="bnav-btn" onClick={()=>setShowSearch(true)}>
              <div className="bnav-icon"><Search style={{width:20,height:20}}/></div>
              Search
            </button>
          </nav>
        </div>

        {showSearch&&(
          <GlobalSearch
            onClose={()=>setShowSearch(false)}
            onNavigate={id=>{ if(id){setSel(id);setMobileView("chat");} }}
          />
        )}

        {team&&(
          <NewConvDialog
            open={newOpen} onClose={()=>setNewOpen(false)}
            members={members} myId={user?.id??""} teamId={team.id}
            convs={conversations} refetch={refetchConversations}
            getStatus={getStatus}
            onCreate={id=>{ setNewOpen(false); setTab("chats"); pick(id); }}
          />
        )}
      </DashboardLayout>
    </>
  );
}