import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Search, Send, MessageSquare, Bell, Plus, Users, FileText,
  Image as ImageIcon, Paperclip, X, Check, CheckCheck, TrendingUp,
  AtSign, AlertCircle, ArrowLeft, Copy, Trash2, Pencil,
  Loader2, ChevronRight,
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
   - playMessageSound : bright ping  → new chat message
   - playAlertSound   : soft double-ding → new notification/alert
   Throttled to max once every 800 ms to avoid rapid-fire spam.
══════════════════════════════════════════════════════════════ */
function playMessageSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.55, ctx.currentTime);
    master.connect(ctx.destination);
    // bright overtone ping
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
  } catch { /* silently fail if AudioContext unavailable */ }
}

function playAlertSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.45, ctx.currentTime);
    master.connect(ctx.destination);
    // soft double-ding
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
   🌐  REALTIME MESSAGE SUBSCRIPTION
   Directly subscribes to postgres_changes on `team_messages` for
   the open conversation.  Calls onAdd / onDelete / onEdit as rows
   change so the UI updates WITHOUT any query invalidation / refetch.
══════════════════════════════════════════════════════════════ */
interface RtMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  message_text: string;
  created_at: string;
  file_url?: string | null;
  file_name?: string | null;
  file_type?: string | null;
  sender?: { full_name: string | null; email: string | null } | null;
}

function useRealtimeMessages(
  conversationId: string | null,
  currentUserId: string | undefined,
  profileCache: Map<string, { full_name: string | null; email: string | null }>,
  onAdd: (m: RtMessage) => void,
  onDelete: (id: string) => void,
  onEdit: (id: string, text: string) => void,
) {
  // keep stable refs so the effect doesn't re-subscribe on every render
  const onAddRef    = useRef(onAdd);
  const onDeleteRef = useRef(onDelete);
  const onEditRef   = useRef(onEdit);
  useEffect(() => { onAddRef.current    = onAdd;    }, [onAdd]);
  useEffect(() => { onDeleteRef.current = onDelete; }, [onDelete]);
  useEffect(() => { onEditRef.current   = onEdit;   }, [onEdit]);

  useEffect(() => {
    if (!conversationId) return;

    const ch = supabase
      .channel(`rt-msg-${conversationId}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "team_messages", filter: `conversation_id=eq.${conversationId}` },
        ({ new: row }: any) => {
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
  }, [conversationId, currentUserId]); // profileCache intentionally omitted — refreshed via ref
}

/* ══════════════════════════════════════════════════════════════
   🔔  ALERT SOUND ON NEW NOTIFICATION
══════════════════════════════════════════════════════════════ */
function useNotificationSound(userId: string | undefined) {
  const ready = useRef(false);
  useEffect(() => {
    if (!userId) return;
    // skip the first ~2 s so initial DB rows don't trigger sounds
    const t = setTimeout(() => { ready.current = true; }, 2000);
    const ch = supabase
      .channel(`rt-notif-snd-${userId}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        () => { if (ready.current) throttledSound(playAlertSound); })
      .subscribe();
    return () => { clearTimeout(t); supabase.removeChannel(ch); };
  }, [userId]);
}

/* ══════════════════════════════════════════════════════════════
   🟢  ONLINE PRESENCE
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

/* ─── UI atoms ────────────────────────────────────────────── */
function OnlineDot({ online }: { online: boolean }) {
  return <span style={{
    display: "inline-block", width: 9, height: 9, borderRadius: "50%", flexShrink: 0,
    background: online ? "#22c55e" : "rgba(255,255,255,0.13)",
    border: `2px solid ${online ? "rgba(34,197,94,0.22)" : "rgba(255,255,255,0.04)"}`,
    boxShadow: online ? "0 0 5px rgba(34,197,94,0.45)" : "none",
    transition: "all 0.3s",
  }} />;
}

function formatTime(d: string) {
  const dt = new Date(d);
  if (isToday(dt)) return format(dt, "h:mm a");
  if (isYesterday(dt)) return "Yesterday";
  if (isThisWeek(dt)) return format(dt, "EEE");
  return format(dt, "MMM d");
}
const getInitials = (n?: string | null) => n ? n.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2) : "?";
const isImg = (t?: string | null) => !!t?.startsWith("image/");
function readStatus(at: string, sid: string, uid: string, rr: ReadReceipt[]): "none"|"sent"|"read" {
  if (sid !== uid) return "none";
  return rr.some(r => r.last_read_at && new Date(r.last_read_at) >= new Date(at)) ? "read" : "sent";
}
const notifIcons: Record<string, typeof Bell> = { comment: MessageSquare, coaching: TrendingUp, mention: AtSign, system: AlertCircle };

/* ─── context menu ────────────────────────────────────────── */
function CtxMenu({ isMe, pos, onCopy, onEdit, onDelete, onClose }: {
  isMe: boolean; pos: { x: number; y: number };
  onCopy(): void; onEdit?(): void; onDelete?(): void; onClose(): void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose]);
  const items = [
    { icon: Copy,   label: "Copy",   fn: onCopy,    danger: false },
    ...(isMe ? [
      { icon: Pencil, label: "Edit",   fn: onEdit!,   danger: false },
      { icon: Trash2, label: "Delete", fn: onDelete!, danger: true  },
    ] : []),
  ];
  return (
    <div ref={ref} style={{ position: "fixed", left: Math.min(pos.x, window.innerWidth - 170), top: Math.min(pos.y, window.innerHeight - (isMe ? 120 : 52)), zIndex: 9999 }} className="mp-ctxmenu">
      {items.map((a, i) => (
        <button key={i} onClick={() => { a.fn(); onClose(); }} className={cn("mp-ctx-item", a.danger && "mp-ctx-item--danger")}>
          <a.icon style={{ width: 13, height: 13 }} />{a.label}
        </button>
      ))}
    </div>
  );
}

/* ─── new convo dialog ────────────────────────────────────── */
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
                    <span style={{ position: "absolute", bottom: -1, right: -1 }}><OnlineDot online={isOnline(m.user_id)} /></span>
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
   💬  CHAT THREAD  — true realtime, no refresh
══════════════════════════════════════════════════════════════ */
function ChatThread({ conversationId, conversations, onBack, isOnline }: {
  conversationId: string; conversations: Conversation[]; onBack?(): void; isOnline(uid: string): boolean;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { messages: baseMessages, messagesLoading, sendMessage, readReceipts } = useConversationMessages(conversationId);

  // ── live state overlays ──
  const [rtAdded,   setRtAdded]   = useState<RtMessage[]>([]);
  const [rtDeleted, setRtDeleted] = useState<Set<string>>(new Set());
  const [rtEdited,  setRtEdited]  = useState<Map<string, string>>(new Map());
  // optimistic deletes (instant hide before DB confirms)
  const [optDeleted, setOptDeleted] = useState<Set<string>>(new Set());

  const { typingUsers, sendTyping, sendStopTyping } = useTypingIndicator(conversationId);
  const [input, setInput]       = useState("");
  const [pendingFile, setPF]    = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [editId, setEditId]     = useState<string | null>(null);
  const [editTxt, setEditTxt]   = useState("");
  const [ctx, setCtx]           = useState<{ id: string; x: number; y: number } | null>(null);
  const [lpId, setLpId]         = useState<string | null>(null);

  const scrollRef   = useRef<HTMLDivElement>(null);
  const fileRef     = useRef<HTMLInputElement>(null);
  const editRef     = useRef<HTMLInputElement>(null);
  const typingTimer = useRef<NodeJS.Timeout | null>(null);
  const lpTimer     = useRef<ReturnType<typeof setTimeout> | null>(null);

  const convo    = conversations.find(c => c.id === conversationId);
  const chatName = convo ? getConversationName(convo) : "Chat";
  const isGroup  = convo?.is_group ?? false;
  const myName   = user?.user_metadata?.full_name || user?.email || "You";

  // build profile cache so realtime rows can be enriched
  const profileCache = useMemo(() => {
    const m = new Map<string, { full_name: string | null; email: string | null }>();
    baseMessages.forEach(msg => { if (msg.sender) m.set(msg.sender_id, msg.sender as any); });
    return m;
  }, [baseMessages]);

  // stable callbacks for the realtime hook
  const handleAdd = useCallback((msg: RtMessage) => {
    setRtAdded(prev => {
      if (prev.some(m => m.id === msg.id)) return prev;
      if (baseMessages.some(m => m.id === msg.id)) return prev;
      return [...prev, msg];
    });
    // keep the conversation list sidebar in sync
    qc.invalidateQueries({ queryKey: ["team-conversations"] });
  }, [baseMessages, qc]);

  const handleDelete = useCallback((id: string) => {
    setRtDeleted(prev => new Set([...prev, id]));
    setOptDeleted(prev => new Set([...prev, id]));
  }, []);

  const handleEdit = useCallback((id: string, text: string) => {
    setRtEdited(prev => new Map(prev).set(id, text));
  }, []);

  useRealtimeMessages(conversationId, user?.id, profileCache, handleAdd, handleDelete, handleEdit);

  // merge base + realtime, applying all overlays
  const messages = useMemo(() => {
    const allDel = new Set([...rtDeleted, ...optDeleted]);
    const merged = [
      ...baseMessages.filter(m => !allDel.has(m.id) && !rtAdded.some(r => r.id === m.id)),
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
    const ext  = file.name.split(".").pop() ?? "bin";
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
      sendMessage.mutate({ text: input.trim() || (pendingFile?.name ?? "Attachment"), file_url: fd?.url, file_name: fd?.name, file_type: fd?.type });
      setInput(""); setPF(null); sendStopTyping();
    } finally { setUploading(false); }
  };

  const copyMsg   = (t: string) => { navigator.clipboard.writeText(t); toast({ title: "Copied" }); };
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

  const onCtx = (e: React.MouseEvent, id: string) => { e.preventDefault(); setCtx({ id, x: e.clientX, y: e.clientY }); };
  const onTouchStart = (id: string) => { lpTimer.current = setTimeout(() => setLpId(id), 500); };
  const onTouchEnd   = () => { if (lpTimer.current) clearTimeout(lpTimer.current); };

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

  const lpMsg  = messages.find(m => m.id === lpId);
  const lpIsMe = lpMsg?.sender_id === user?.id;

  return (
    <div className="mp-thread">
      {/* header */}
      <div className="mp-thread-header">
        <button className="mp-back-btn" onClick={onBack}><ArrowLeft style={{ width: 16, height: 16 }} /></button>
        <div style={{ position: "relative", flexShrink: 0 }}>
          <div className="mp-thread-av">
            {isGroup ? <Users style={{ width: 14, height: 14, color: "#a78bfa" }} />
              : <span style={{ fontSize: 12, fontWeight: 700, color: "#818cf8" }}>{convo ? getConversationInitials(convo) : "?"}</span>}
          </div>
          {!isGroup && <span style={{ position: "absolute", bottom: -1, right: -1 }}><OnlineDot online={otherOnline} /></span>}
        </div>
        <div className="mp-thread-info">
          <p className="mp-thread-name">{chatName}</p>
          {isGroup
            ? <p className="mp-thread-sub" style={{ color: "rgba(255,255,255,0.3)" }}>{(convo?.participants.length ?? 0) + 1} members</p>
            : typingUsers.length > 0
              ? <p className="mp-thread-typing">typing…</p>
              : <p className="mp-thread-sub" style={{ color: otherOnline ? "#22c55e" : "rgba(255,255,255,0.28)" }}>
                  {otherOnline ? "● Online now" : "○ Offline"}
                </p>}
        </div>
        {typingUsers.length > 0 && <div className="mp-typing-dots"><span /><span /><span /></div>}
      </div>

      {/* messages */}
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
              const isMe     = msg.sender_id === user?.id;
              const status   = readStatus(msg.created_at, msg.sender_id, user?.id ?? "", readReceipts);
              const showRec  = isMe && (!group.msgs[idx + 1] || group.msgs[idx + 1].sender_id !== user?.id);
              const samePrev = group.msgs[idx - 1]?.sender_id === msg.sender_id;
              const isEd     = editId === msg.id;
              const isDel    = optDeleted.has(msg.id);
              const isLive   = rtAdded.some(r => r.id === msg.id); // newly arrived via realtime

              return (
                <div key={msg.id}
                  className={cn("mp-msg-row", isMe ? "mp-msg-row--me" : "mp-msg-row--them", samePrev && "mp-msg-row--same", isLive && !isMe && "mp-msg-row--new")}
                  style={{ opacity: isDel ? 0.2 : 1, transition: "opacity 0.15s ease", pointerEvents: isDel ? "none" : undefined }}
                  onContextMenu={e => !isDel && onCtx(e, msg.id)}
                  onTouchStart={() => !isDel && onTouchStart(msg.id)}
                  onTouchEnd={onTouchEnd} onTouchMove={onTouchEnd}>

                  {!isMe && !samePrev && (
                    <div style={{ position: "relative", flexShrink: 0 }}>
                      <div className="mp-av">{getInitials(msg.sender?.full_name || msg.sender?.email)}</div>
                      <span style={{ position: "absolute", bottom: -1, right: -1 }}><OnlineDot online={isOnline(msg.sender_id)} /></span>
                    </div>
                  )}
                  {!isMe && samePrev && <div className="mp-av-sp" />}

                  <div className={cn("mp-msg-body", isMe ? "mp-msg-body--me" : "mp-msg-body--them")}>
                    {!isMe && !samePrev && <p className="mp-sender">{msg.sender?.full_name || msg.sender?.email || "Unknown"}</p>}
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
                            {isImg(msg.file_type)
                              ? <a href={msg.file_url} target="_blank" rel="noopener noreferrer"><img src={msg.file_url} alt={msg.file_name ?? "img"} className="mp-attach-img" /></a>
                              : <a href={msg.file_url} target="_blank" rel="noopener noreferrer" className={cn("mp-attach-file", isMe && "mp-attach-file--me")}>
                                  <FileText style={{ width: 14, height: 14, flexShrink: 0 }} /><span className="mp-attach-name">{msg.file_name ?? "File"}</span>
                                </a>}
                          </div>
                        )}
                        {(!msg.file_url || msg.message_text !== msg.file_name) && <p className="mp-bubble-text">{msg.message_text}</p>}
                      </div>
                    )}
                    {isMe && !isEd && !isDel && (
                      <div className="mp-hover-acts">
                        <button className="mp-ha" title="Copy"   onClick={() => copyMsg(msg.message_text)}><Copy   style={{ width: 11, height: 11 }} /></button>
                        <button className="mp-ha" title="Edit"   onClick={() => startEdit(msg.id, msg.message_text)}><Pencil style={{ width: 11, height: 11 }} /></button>
                        <button className="mp-ha mp-ha--del" title="Delete" onClick={() => delMsg(msg.id)}><Trash2 style={{ width: 11, height: 11 }} /></button>
                      </div>
                    )}
                    <div className={cn("mp-meta", isMe && "mp-meta--me")}>
                      <span className="mp-time">{format(new Date(msg.created_at), "h:mm a")}</span>
                      {showRec && status === "read" && <CheckCheck style={{ width: 12, height: 12, color: "#818cf8" }} />}
                      {showRec && status === "sent" && <Check      style={{ width: 12, height: 12, color: "rgba(255,255,255,0.3)" }} />}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
        <div ref={scrollRef} />
      </div>

      {ctx && (
        <CtxMenu
          isMe={(messages.find(m => m.id === ctx.id)?.sender_id === user?.id) ?? false}
          pos={{ x: ctx.x, y: ctx.y }}
          onCopy={()   => copyMsg(messages.find(m => m.id === ctx.id)?.message_text ?? "")}
          onEdit={()   => { const m = messages.find(x => x.id === ctx.id); if (m) startEdit(m.id, m.message_text); }}
          onDelete={()  => delMsg(ctx.id)}
          onClose={()  => setCtx(null)}
        />
      )}

      {lpId && lpMsg && (
        <div className="mp-sheet-overlay" onClick={() => setLpId(null)}>
          <div className="mp-sheet" onClick={e => e.stopPropagation()}>
            <div className="mp-sheet-handle" />
            <div className="mp-sheet-preview"><p className="mp-sheet-preview-txt">{lpMsg.message_text.slice(0, 70)}{lpMsg.message_text.length > 70 ? "…" : ""}</p></div>
            {[
              { icon: Copy,   label: "Copy text",      fn: () => { copyMsg(lpMsg.message_text); setLpId(null); }, danger: false },
              ...(lpIsMe ? [
                { icon: Pencil, label: "Edit message",   fn: () => { startEdit(lpMsg.id, lpMsg.message_text); setLpId(null); }, danger: false },
                { icon: Trash2, label: "Delete message", fn: () => { delMsg(lpMsg.id); },                                       danger: true  },
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

      {pendingFile && (
        <div className="mp-file-prev">
          {pendingFile.type.startsWith("image/") ? <ImageIcon style={{ width: 14, height: 14, color: "#818cf8", flexShrink: 0 }} /> : <FileText style={{ width: 14, height: 14, color: "#818cf8", flexShrink: 0 }} />}
          <span className="mp-fp-name">{pendingFile.name}</span>
          <span className="mp-fp-size">{(pendingFile.size / 1024).toFixed(0)} KB</span>
          <button className="mp-fp-rm" onClick={() => setPF(null)}><X style={{ width: 12, height: 12 }} /></button>
        </div>
      )}

      <div className="mp-input-bar">
        <input type="file" ref={fileRef} className="sr-only"
          onChange={e => { const f = e.target.files?.[0]; if (f && f.size <= 20 * 1024 * 1024) setPF(f); e.target.value = ""; }}
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv" />
        <div className="mp-input-wrap">
          <button className="mp-input-icon" onClick={() => fileRef.current?.click()} disabled={uploading}><Paperclip style={{ width: 17, height: 17 }} /></button>
          <input className="mp-chat-input" placeholder="Message…" value={input}
            onChange={e => onInputChange(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleSend()}
            disabled={uploading} />
          <button className={cn("mp-send", (input.trim() || pendingFile) && !uploading && !sendMessage.isPending && "mp-send--active")}
            onClick={handleSend} disabled={(!input.trim() && !pendingFile) || sendMessage.isPending || uploading}>
            <Send style={{ width: 15, height: 15 }} />
          </button>
        </div>
        <p className="mp-hint">Long-press on mobile · Right-click on desktop to copy / edit / delete</p>
      </div>
    </div>
  );
}

/* ─── notifications panel ─────────────────────────────────── */
function NotifsPanel() {
  const { notifications, notificationsLoading, unreadCount, markRead, markAllRead } = useNotifications();
  const [filter, setFilter] = useState<"all"|"unread">("all");
  const filtered = notifications.filter(n => filter === "all" || !n.is_read);
  return (
    <div className="mp-notif-panel">
      <div className="mp-notif-hdr">
        <div className="mp-notif-hdr-l">
          <span className="mp-notif-title">Notifications</span>
          {unreadCount > 0 && <span className="mp-notif-badge">{unreadCount}</span>}
        </div>
        <div className="mp-notif-hdr-r">
          {(["all","unread"] as const).map(f => (
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

/* ─── convo list panel ────────────────────────────────────── */
function ConvoListPanel({ convos, loading, selected, onSelect, search, onSearchChange, isOnline }: {
  convos: Conversation[]; loading: boolean; selected: string | null;
  onSelect(id: string): void; search: string; onSearchChange(v: string): void; isOnline(uid: string): boolean;
}) {
  return (
    <div className="mp-convo-panel">
      <div className="mp-search-wrap">
        <Search style={{ width: 14, height: 14, color: "rgba(255,255,255,0.22)", flexShrink: 0 }} />
        <input className="mp-search" placeholder="Search…" value={search} onChange={e => onSearchChange(e.target.value)} />
        {search && <button className="mp-search-clr" onClick={() => onSearchChange("")}><X style={{ width: 12, height: 12 }} /></button>}
      </div>
      <div className="mp-convo-items">
        {loading ? <div className="mp-center"><Loader2 className="mp-spin" /></div>
          : convos.length === 0 ? (
            <div className="mp-convo-empty">
              <MessageSquare style={{ width: 26, height: 26, color: "rgba(124,58,237,0.3)" }} />
              <p>{search ? "No results" : "No conversations"}</p>
            </div>
          ) : convos.map(c => {
            const name = getConversationName(c);
            const isSel = selected === c.id;
            const other = !c.is_group && c.participants[0];
            const partOnline = other ? isOnline(other.user_id) : false;
            return (
              <button key={c.id} className={cn("mp-convo-item", isSel && "mp-convo-item--active")} onClick={() => onSelect(c.id)}>
                <div className="mp-convo-av-wrap">
                  <div className={cn("mp-convo-av", c.is_group && "mp-convo-av--group")}>
                    {c.is_group ? <Users style={{ width: 14, height: 14 }} /> : getConversationInitials(c)}
                  </div>
                  {!c.is_group && <span style={{ position: "absolute", bottom: -1, right: -1 }}><OnlineDot online={partOnline} /></span>}
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
          })}
      </div>
    </div>
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

  // 🔔 alert sound whenever a new notification arrives
  useNotificationSound(user?.id);

  const [selected, setSelected]   = useState<string | null>(null);
  const [newOpen, setNewOpen]      = useState(false);
  const [search, setSearch]        = useState("");
  const [tab, setTab]              = useState<"chats"|"notifs">("chats");
  const [mobileScr, setMobileScr] = useState<"list"|"thread">("list");

  const filtered = useMemo(() => {
    if (!search.trim()) return conversations;
    const q = search.toLowerCase();
    return conversations.filter(c => getConversationName(c).toLowerCase().includes(q) || (c.last_message?.message_text ?? "").toLowerCase().includes(q));
  }, [conversations, search]);

  const selectConvo = (id: string) => { setSelected(id); setMobileScr("thread"); };
  const goBack      = () => setMobileScr("list");
  const totalBadge  = totalUnread + notifCount;
  const onlineCount = useMemo(() => members.filter(m => m.user_id !== user?.id && isOnline(m.user_id)).length, [members, onlineUsers, user?.id]);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;1,400&family=Bricolage+Grotesque:wght@600;700;800&display=swap');
        .mp-page{--bg0:#060912;--bg1:#0b0f1c;--border:rgba(255,255,255,0.07);--border2:rgba(255,255,255,0.04);--ac:#7c3aed;--ac-glow:rgba(124,58,237,0.35);--ac-soft:rgba(124,58,237,0.12);--t1:#f0f6fc;--t2:rgba(255,255,255,0.6);--t3:rgba(255,255,255,0.3);--t4:rgba(255,255,255,0.14);}
        @keyframes mpSpin{to{transform:rotate(360deg)}}
        @keyframes mpBounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-4px)}}
        @keyframes mpSheetUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
        @keyframes mpFade{from{opacity:0}to{opacity:1}}
        @keyframes mpPop{from{opacity:0;transform:scale(0.94) translateY(5px)}to{opacity:1;transform:scale(1) translateY(0)}}
        @keyframes mpOnlinePulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.5;transform:scale(0.85)}}
        .mp-page{display:flex;flex-direction:column;height:calc(100dvh - 4rem);margin:-24px;overflow:hidden;background:var(--bg0);font-family:'DM Sans',system-ui,sans-serif;}
        @media(max-width:767px){.mp-page{margin:-16px;height:calc(100dvh - 3.5rem);padding-bottom:58px;}}
        .mp-topbar{display:flex;align-items:center;justify-content:space-between;padding:0 20px;height:56px;flex-shrink:0;background:rgba(11,15,28,0.96);border-bottom:1px solid var(--border);backdrop-filter:blur(20px);}
        .mp-topbar-l{display:flex;align-items:center;gap:10px;}
        .mp-topbar-icon{width:32px;height:32px;border-radius:9px;background:var(--ac-soft);border:1px solid rgba(124,58,237,0.25);display:flex;align-items:center;justify-content:center;flex-shrink:0;}
        .mp-topbar-title{font-size:15px;font-weight:700;color:var(--t1);font-family:'Bricolage Grotesque',sans-serif;margin:0;}
        .mp-topbar-badge{font-size:10px;font-weight:700;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#fff;padding:2px 8px;border-radius:20px;box-shadow:0 2px 8px var(--ac-glow);}
        .mp-online-pill{display:inline-flex;align-items:center;gap:5px;background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.18);border-radius:20px;padding:2px 10px 2px 7px;font-size:11px;font-weight:600;color:#22c55e;}
        .mp-online-dot{width:6px;height:6px;border-radius:50%;background:#22c55e;animation:mpOnlinePulse 2s ease-in-out infinite;flex-shrink:0;}
        .mp-new-btn{display:flex;align-items:center;gap:6px;background:linear-gradient(135deg,#7c3aed,#6d28d9);border:none;border-radius:9px;padding:7px 14px;color:#fff;font-size:12px;font-weight:600;cursor:pointer;box-shadow:0 3px 12px var(--ac-glow);font-family:'DM Sans',sans-serif;transition:transform .15s,box-shadow .15s;}
        .mp-new-btn:hover{transform:translateY(-1px);box-shadow:0 6px 18px var(--ac-glow);}
        @media(max-width:480px){.mp-new-btn span{display:none;}.mp-new-btn{width:34px;height:34px;padding:0;border-radius:50%;justify-content:center;}}
        .mp-body{display:flex;flex:1;min-height:0;}
        .mp-sidebar{width:300px;flex-shrink:0;display:flex;flex-direction:column;border-right:1px solid var(--border);background:var(--bg1);}
        @media(max-width:767px){.mp-sidebar{width:100%;border-right:none;}.mp-sidebar--hidden{display:none;}}
        .mp-tabs{display:flex;gap:4px;padding:8px 10px;border-bottom:1px solid var(--border2);flex-shrink:0;}
        .mp-tab{flex:1;display:flex;align-items:center;justify-content:center;gap:5px;padding:7px 0;border-radius:8px;background:transparent;border:1px solid transparent;color:var(--t3);font-size:12px;font-weight:600;cursor:pointer;transition:all .15s;font-family:'DM Sans',sans-serif;}
        .mp-tab--active{background:var(--ac-soft);border-color:rgba(124,58,237,0.25);color:#a78bfa;}
        .mp-tab-badge{background:var(--ac);color:#fff;font-size:9px;font-weight:700;padding:1px 5px;border-radius:10px;}
        .mp-convo-panel{display:flex;flex-direction:column;flex:1;min-height:0;}
        .mp-search-wrap{display:flex;align-items:center;gap:8px;margin:8px 10px;background:rgba(255,255,255,0.04);border:1px solid var(--border);border-radius:8px;padding:7px 10px;flex-shrink:0;}
        .mp-search{flex:1;background:transparent;border:none;outline:none;color:var(--t1);font-size:12px;font-family:'DM Sans',sans-serif;}
        .mp-search::placeholder{color:var(--t4);}
        .mp-search-clr{background:none;border:none;cursor:pointer;color:var(--t3);display:flex;padding:0;}
        .mp-convo-items{flex:1;overflow-y:auto;padding:4px 6px;}
        .mp-convo-empty{display:flex;flex-direction:column;align-items:center;gap:8px;padding:32px 16px;color:var(--t3);font-size:12px;}
        .mp-convo-item{width:100%;display:flex;align-items:center;gap:10px;padding:10px;border-radius:12px;border:1px solid transparent;background:transparent;cursor:pointer;text-align:left;transition:all .13s;margin-bottom:2px;font-family:'DM Sans',sans-serif;}
        .mp-convo-item:hover{background:rgba(255,255,255,0.03);}
        .mp-convo-item--active{background:var(--ac-soft)!important;border-color:rgba(124,58,237,0.22)!important;}
        .mp-convo-av-wrap{position:relative;flex-shrink:0;}
        .mp-convo-av{width:40px;height:40px;border-radius:12px;background:rgba(124,58,237,0.18);border:1px solid rgba(124,58,237,0.2);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#a78bfa;}
        .mp-convo-av--group{background:rgba(139,92,246,0.15);color:#c084fc;}
        .mp-convo-unread{position:absolute;top:-4px;left:-4px;min-width:16px;height:16px;border-radius:8px;background:linear-gradient(135deg,#7c3aed,#6d28d9);display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#fff;box-shadow:0 2px 6px var(--ac-glow);padding:0 3px;}
        .mp-convo-info{flex:1;min-width:0;}
        .mp-convo-row1{display:flex;justify-content:space-between;align-items:baseline;gap:4px;}
        .mp-convo-name{font-size:13px;font-weight:500;color:rgba(255,255,255,0.7);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .mp-convo-name--unread{font-weight:700;color:var(--t1);}
        .mp-convo-time{font-size:10px;color:var(--t3);flex-shrink:0;}
        .mp-convo-preview{font-size:11px;color:var(--t3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px;}
        .mp-convo-preview--unread{color:rgba(255,255,255,0.5);font-weight:500;}
        .mp-chevron{color:var(--t4);flex-shrink:0;}
        @media(min-width:768px){.mp-chevron{display:none;}}
        .mp-right{flex:1;display:flex;flex-direction:column;min-width:0;background:rgba(6,9,18,0.7);}
        @media(max-width:767px){.mp-right--hidden{display:none;}}
        .mp-right-empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:40px;}
        .mp-re-icon{width:68px;height:68px;border-radius:20px;margin-bottom:18px;background:rgba(124,58,237,0.08);border:1px solid rgba(124,58,237,0.15);display:flex;align-items:center;justify-content:center;}
        .mp-right-empty h3{font-size:15px;font-weight:700;color:#64748b;font-family:'Bricolage Grotesque',sans-serif;margin:0 0 6px;}
        .mp-right-empty p{font-size:12px;color:var(--t4);max-width:240px;line-height:1.6;margin:0 0 20px;}
        .mp-re-btn{display:flex;align-items:center;gap:7px;background:linear-gradient(135deg,#7c3aed,#6d28d9);border:none;border-radius:10px;padding:9px 18px;color:#fff;font-size:13px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;}
        .mp-thread{display:flex;flex-direction:column;height:100%;}
        .mp-thread-header{display:flex;align-items:center;gap:10px;padding:12px 18px;flex-shrink:0;background:rgba(11,15,28,0.92);border-bottom:1px solid var(--border);backdrop-filter:blur(20px);}
        .mp-back-btn{background:rgba(255,255,255,0.05);border:1px solid var(--border);border-radius:8px;width:32px;height:32px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--t2);flex-shrink:0;transition:.13s;}
        .mp-back-btn:hover{background:rgba(255,255,255,0.09);}
        @media(min-width:768px){.mp-back-btn{display:none;}}
        .mp-thread-av{width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,rgba(124,58,237,0.25),rgba(109,40,217,0.25));border:1px solid rgba(124,58,237,0.28);display:flex;align-items:center;justify-content:center;}
        .mp-thread-info{flex:1;min-width:0;}
        .mp-thread-name{font-size:14px;font-weight:600;color:var(--t1);font-family:'Bricolage Grotesque',sans-serif;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .mp-thread-sub,.mp-thread-typing{font-size:11px;margin:0;}
        .mp-thread-typing{color:#a78bfa;font-style:italic;}
        .mp-typing-dots{display:flex;gap:3px;align-items:center;flex-shrink:0;}
        .mp-typing-dots span{width:5px;height:5px;border-radius:50%;background:#7c3aed;display:block;}
        .mp-typing-dots span:nth-child(1){animation:mpBounce 1.2s 0s infinite;}
        .mp-typing-dots span:nth-child(2){animation:mpBounce 1.2s .2s infinite;}
        .mp-typing-dots span:nth-child(3){animation:mpBounce 1.2s .4s infinite;}
        .mp-messages{flex:1;overflow-y:auto;padding:14px 16px;}
        @media(max-width:767px){.mp-messages{padding:10px;}}
        .mp-center{display:flex;justify-content:center;padding:40px 0;}
        .mp-spin{width:20px;height:20px;color:#7c3aed;animation:mpSpin 1s linear infinite;}
        .mp-empty-thread{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;text-align:center;}
        .mp-empty-icon{width:52px;height:52px;border-radius:16px;margin-bottom:14px;background:rgba(124,58,237,0.1);border:1px solid rgba(124,58,237,0.2);display:flex;align-items:center;justify-content:center;}
        .mp-empty-title{font-size:14px;font-weight:600;color:#64748b;margin:0 0 4px;}
        .mp-empty-sub{font-size:12px;color:var(--t4);margin:0;}
        .mp-date-div{display:flex;align-items:center;gap:10px;margin:18px 0 10px;}
        .mp-div-line{flex:1;height:1px;background:var(--border2);}
        .mp-div-label{font-size:10px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--t3);padding:3px 9px;background:rgba(255,255,255,0.03);border:1px solid var(--border2);border-radius:20px;white-space:nowrap;}
        .mp-msg-row{display:flex;margin-bottom:2px;position:relative;}
        .mp-msg-row--me{justify-content:flex-end;margin-top:3px;}
        .mp-msg-row--them{justify-content:flex-start;margin-top:3px;}
        .mp-msg-row:not(.mp-msg-row--same){margin-top:10px;}
        .mp-msg-row--new .mp-bubble{animation:mpPop .22s ease forwards;}
        .mp-av{width:30px;height:30px;border-radius:8px;flex-shrink:0;background:rgba(124,58,237,0.2);border:1px solid rgba(124,58,237,0.2);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#818cf8;margin-right:8px;margin-top:2px;}
        .mp-av-sp{width:38px;flex-shrink:0;}
        .mp-msg-body{display:flex;flex-direction:column;max-width:70%;}
        @media(max-width:480px){.mp-msg-body{max-width:86%;}}
        .mp-msg-body--me{align-items:flex-end;}
        .mp-msg-body--them{align-items:flex-start;}
        .mp-sender{font-size:10px;color:var(--t3);margin:0 0 2px 2px;font-weight:500;}
        .mp-bubble{padding:9px 13px;line-height:1.5;cursor:context-menu;word-break:break-word;}
        .mp-bubble--me{background:linear-gradient(135deg,#7c3aed,#6d28d9);border:1px solid rgba(124,58,237,0.4);border-radius:16px 16px 4px 16px;box-shadow:0 3px 16px rgba(124,58,237,0.28);}
        .mp-bubble--them{background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.07);border-radius:16px 16px 16px 4px;}
        .mp-bubble-text{font-size:13px;color:#fff;margin:0;font-family:'DM Sans',sans-serif;}
        .mp-bubble--them .mp-bubble-text{color:rgba(255,255,255,0.84);}
        @media(max-width:767px){.mp-bubble-text{font-size:14px;}.mp-bubble{padding:10px 14px;}}
        .mp-attach{margin-bottom:6px;}
        .mp-attach-img{border-radius:8px;max-width:100%;max-height:160px;object-fit:cover;display:block;}
        .mp-attach-file{display:flex;align-items:center;gap:7px;padding:7px 10px;border-radius:8px;text-decoration:none;background:rgba(255,255,255,0.1);font-size:12px;color:rgba(255,255,255,0.85);}
        .mp-attach-file--me{background:rgba(255,255,255,0.15);}
        .mp-attach-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
        .mp-hover-acts{display:none;position:absolute;right:calc(100% + 6px);top:50%;transform:translateY(-50%);gap:3px;align-items:center;}
        @media(min-width:768px){.mp-msg-row--me:hover .mp-hover-acts{display:flex;}}
        .mp-ha{background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:4px 5px;cursor:pointer;color:rgba(255,255,255,0.4);display:flex;align-items:center;transition:.12s;}
        .mp-ha:hover{background:rgba(255,255,255,0.12);color:#fff;}
        .mp-ha--del:hover{background:rgba(239,68,68,0.15);color:#f87171;}
        .mp-edit-wrap{display:flex;align-items:center;gap:6px;background:rgba(124,58,237,0.1);border:1px solid rgba(124,58,237,0.3);border-radius:12px;padding:7px 10px;}
        .mp-edit-input{background:transparent;border:none;outline:none;color:var(--t1);font-size:13px;min-width:100px;flex:1;font-family:'DM Sans',sans-serif;}
        .mp-edit-save{background:#7c3aed;border:none;border-radius:6px;padding:3px 9px;color:#fff;font-size:11px;font-weight:600;cursor:pointer;}
        .mp-edit-cancel{background:transparent;border:none;color:var(--t3);cursor:pointer;font-size:16px;line-height:1;padding:0 2px;}
        .mp-meta{display:flex;align-items:center;gap:4px;margin-top:3px;padding:0 2px;}
        .mp-meta--me{justify-content:flex-end;}
        .mp-time{font-size:10px;color:var(--t4);}
        .mp-ctxmenu{background:rgba(10,13,22,0.97);backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,0.08);border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,0.7);overflow:hidden;width:160px;animation:mpFade .12s ease;}
        .mp-ctx-item{display:flex;align-items:center;gap:9px;width:100%;padding:9px 14px;background:transparent;border:none;border-bottom:1px solid rgba(255,255,255,0.05);color:rgba(255,255,255,0.7);font-size:12px;font-weight:500;cursor:pointer;font-family:'DM Sans',sans-serif;transition:.12s;}
        .mp-ctx-item:last-child{border-bottom:none;}
        .mp-ctx-item:hover{background:rgba(255,255,255,0.06);color:#fff;}
        .mp-ctx-item--danger{color:#f87171;}
        .mp-ctx-item--danger:hover{background:rgba(248,113,113,0.1);}
        .mp-sheet-overlay{position:fixed;inset:0;z-index:9998;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);animation:mpFade .2s ease;}
        .mp-sheet{position:absolute;bottom:0;left:0;right:0;background:#0f1424;border-top:1px solid rgba(255,255,255,0.08);border-radius:20px 20px 0 0;padding:0 0 env(safe-area-inset-bottom,16px);animation:mpSheetUp .25s ease;}
        .mp-sheet-handle{width:36px;height:4px;border-radius:2px;background:rgba(255,255,255,0.15);margin:10px auto 0;}
        .mp-sheet-preview{padding:12px 20px 10px;border-bottom:1px solid rgba(255,255,255,0.05);}
        .mp-sheet-preview-txt{font-size:12px;color:var(--t3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin:0;}
        .mp-sheet-btn{display:flex;align-items:center;gap:14px;width:100%;padding:16px 22px;background:transparent;border:none;border-bottom:1px solid rgba(255,255,255,0.05);color:var(--t1);font-size:16px;font-weight:500;cursor:pointer;text-align:left;font-family:'DM Sans',sans-serif;}
        .mp-sheet-btn--danger{color:#f87171;}
        .mp-sheet-cancel{display:block;width:calc(100% - 24px);margin:8px 12px 4px;padding:14px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);border-radius:12px;color:var(--t2);font-size:16px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;}
        .mp-file-prev{display:flex;align-items:center;gap:8px;margin:0 14px 4px;background:rgba(124,58,237,0.07);border:1px solid rgba(124,58,237,0.2);border-radius:10px;padding:8px 12px;}
        .mp-fp-name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:#94a3b8;}
        .mp-fp-size{font-size:10px;color:var(--t3);flex-shrink:0;}
        .mp-fp-rm{background:none;border:none;cursor:pointer;color:var(--t3);display:flex;padding:0;}
        .mp-input-bar{padding:10px 14px 12px;border-top:1px solid var(--border2);background:rgba(11,15,28,0.75);backdrop-filter:blur(12px);flex-shrink:0;}
        @media(max-width:767px){.mp-input-bar{padding:8px 10px calc(8px + env(safe-area-inset-bottom,0px));}}
        .mp-input-wrap{display:flex;align-items:center;gap:8px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:6px 6px 6px 12px;transition:border-color .15s;}
        .mp-input-wrap:focus-within{border-color:rgba(124,58,237,0.4);}
        .mp-input-icon{background:none;border:none;cursor:pointer;color:var(--t3);display:flex;align-items:center;padding:4px;border-radius:6px;transition:.13s;}
        .mp-input-icon:hover{color:var(--t1);background:rgba(255,255,255,0.06);}
        .mp-chat-input{flex:1;background:transparent;border:none;outline:none;color:var(--t1);font-size:13px;padding:6px 0;font-family:'DM Sans',sans-serif;}
        .mp-chat-input::placeholder{color:var(--t4);}
        @media(max-width:767px){.mp-chat-input{font-size:16px;}}
        .mp-send{width:34px;height:34px;border-radius:10px;border:none;background:rgba(124,58,237,0.3);color:rgba(255,255,255,0.4);display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;transition:all .15s;}
        .mp-send--active{background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#fff;box-shadow:0 3px 12px var(--ac-glow);}
        .mp-send--active:hover{transform:scale(1.05);}
        .mp-hint{font-size:10px;color:var(--t4);text-align:center;margin:5px 0 0;font-family:'DM Sans',sans-serif;}
        @media(max-width:767px){.mp-hint{display:none;}}
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
        .mp-bottom-nav{display:none;position:fixed;bottom:0;left:0;right:0;background:rgba(11,15,28,0.97);backdrop-filter:blur(20px);border-top:1px solid var(--border);z-index:50;padding-bottom:env(safe-area-inset-bottom,0px);}
        @media(max-width:767px){.mp-bottom-nav{display:flex;}}
        .mp-bnav-btn{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding:10px 0;background:transparent;border:none;cursor:pointer;color:var(--t3);font-size:10px;font-weight:600;font-family:'DM Sans',sans-serif;transition:color .15s;}
        .mp-bnav-btn--active{color:#a78bfa;}
        .mp-bnav-icon{position:relative;}
        .mp-bnav-badge{position:absolute;top:-4px;right:-6px;width:14px;height:14px;border-radius:50%;background:linear-gradient(135deg,#7c3aed,#6d28d9);font-size:8px;font-weight:700;color:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px var(--ac-glow);}
        .mp-messages::-webkit-scrollbar,.mp-convo-items::-webkit-scrollbar,.mp-notif-list::-webkit-scrollbar{width:3px;}
        .mp-messages::-webkit-scrollbar-thumb,.mp-convo-items::-webkit-scrollbar-thumb,.mp-notif-list::-webkit-scrollbar-thumb{background:rgba(124,58,237,0.2);border-radius:2px;}
        .sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);}
      `}</style>

      <DashboardLayout>
        <div className="mp-page">
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
            <button className="mp-new-btn" onClick={() => setNewOpen(true)}>
              <Plus style={{ width: 13, height: 13 }} /><span>New Message</span>
            </button>
          </div>

          <div className="mp-body">
            <div className={cn("mp-sidebar", mobileScr === "thread" && "mp-sidebar--hidden")}>
              <div className="mp-tabs">
                {([
                  { id: "chats"  as const, label: "Chats",  Icon: MessageSquare, badge: totalUnread },
                  { id: "notifs" as const, label: "Alerts", Icon: Bell,          badge: notifCount  },
                ] as const).map(t => (
                  <button key={t.id} className={cn("mp-tab", tab === t.id && "mp-tab--active")} onClick={() => setTab(t.id)}>
                    <t.Icon style={{ width: 13, height: 13 }} />
                    {t.label}
                    {t.badge > 0 && <span className="mp-tab-badge">{t.badge}</span>}
                  </button>
                ))}
              </div>
              {tab === "chats"
                ? <ConvoListPanel convos={filtered} loading={conversationsLoading} selected={selected} onSelect={selectConvo} search={search} onSearchChange={setSearch} isOnline={isOnline} />
                : <NotifsPanel />}
            </div>

            <div className={cn("mp-right", mobileScr === "list" && "mp-right--hidden")}>
              {tab === "chats"
                ? selected
                  ? <ChatThread conversationId={selected} conversations={conversations} onBack={goBack} isOnline={isOnline} />
                  : (
                    <div className="mp-right-empty">
                      <div className="mp-re-icon"><MessageSquare style={{ width: 26, height: 26, color: "#7c3aed" }} /></div>
                      <h3>Select a conversation</h3>
                      <p>Pick a thread from the sidebar or start a new one with your team.</p>
                      <button className="mp-re-btn" onClick={() => setNewOpen(true)}><Plus style={{ width: 14, height: 14 }} />New Message</button>
                    </div>
                  )
                : <NotifsPanel />}
            </div>
          </div>

          <nav className="mp-bottom-nav">
            {([
              { id: "chats"  as const, label: "Chats",  Icon: MessageSquare, badge: totalUnread },
              { id: "notifs" as const, label: "Alerts", Icon: Bell,          badge: notifCount  },
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
            <button className="mp-bnav-btn" onClick={() => setNewOpen(true)}>
              <div className="mp-bnav-icon"><Plus style={{ width: 20, height: 20 }} /></div>
              New
            </button>
          </nav>
        </div>

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