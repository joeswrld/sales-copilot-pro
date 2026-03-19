import { useState, useRef, useEffect, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import { useOnlinePresence } from "@/hooks/useOnlinePresence";
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

/* ─── helpers ─────────────────────────────────────────────── */
function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  if (isToday(d)) return format(d, "h:mm a");
  if (isYesterday(d)) return "Yesterday";
  if (isThisWeek(d)) return format(d, "EEE");
  return format(d, "MMM d");
}
function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}
function isImageFile(type: string | null | undefined): boolean {
  return !!type?.startsWith("image/");
}
function getReadStatus(at: string, sid: string, uid: string, rr: ReadReceipt[]): "none"|"sent"|"read" {
  if (sid !== uid) return "none";
  return rr.some(r => r.last_read_at && new Date(r.last_read_at) >= new Date(at)) ? "read" : "sent";
}
const notifIcons: Record<string, typeof Bell> = { comment: MessageSquare, coaching: TrendingUp, mention: AtSign, system: AlertCircle };

/* ─── Online dot ──────────────────────────────────────────── */
function OnlineDot({ online, size = "sm" }: { online: boolean; size?: "sm" | "md" }) {
  const sz = size === "md" ? "w-3 h-3" : "w-2 h-2";
  const offset = size === "md" ? "-bottom-0.5 -right-0.5" : "-bottom-px -right-px";
  return (
    <span
      className={cn(
        "absolute rounded-full border-2 border-[#0b0f1c] transition-colors duration-300",
        sz, offset,
        online ? "bg-emerald-400" : "bg-slate-600"
      )}
      title={online ? "Online" : "Offline"}
    />
  );
}

/* ─── context menu ────────────────────────────────────────── */
function CtxMenu({ isMe, pos, onCopy, onEdit, onDelete, onClose }: {
  isMe: boolean; pos: { x: number; y: number };
  onCopy(): void; onEdit?(): void; onDelete?(): void; onClose(): void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose]);
  const left = Math.min(pos.x, window.innerWidth - 168);
  const top  = Math.min(pos.y, window.innerHeight - (isMe ? 120 : 48));
  const items = [
    { icon: Copy,   label: "Copy",   fn: onCopy,    danger: false },
    ...(isMe ? [
      { icon: Pencil, label: "Edit",   fn: onEdit!,   danger: false },
      { icon: Trash2, label: "Delete", fn: onDelete!, danger: true  },
    ] : []),
  ];
  return (
    <div ref={ref} style={{ position: "fixed", left, top, zIndex: 9999 }} className="mp-ctxmenu">
      {items.map((a, i) => (
        <button key={i} onClick={() => { a.fn(); onClose(); }}
          className={cn("mp-ctx-item", a.danger && "mp-ctx-item--danger")}>
          <a.icon style={{ width: 13, height: 13 }} />{a.label}
        </button>
      ))}
    </div>
  );
}

/* ─── new convo dialog ────────────────────────────────────── */
function NewConvoDialog({ open, onClose, members, currentUserId, teamId, conversations, refetchConversations, onCreated, isOnline }: {
  open: boolean; onClose(): void; members: TeamMember[];
  currentUserId: string; teamId: string;
  conversations: Conversation[]; refetchConversations(): void;
  onCreated(id: string): void;
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
        <DialogHeader>
          <DialogTitle style={{ color: "#f0f6fc", fontFamily: "'Bricolage Grotesque',sans-serif" }}>New Conversation</DialogTitle>
        </DialogHeader>
        {sel.length > 1 && <p className="text-xs text-slate-400 flex items-center gap-1.5 px-1"><Users className="w-3.5 h-3.5" /> Group · {sel.length} members</p>}
        <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
          {others.length === 0
            ? <p className="text-sm text-slate-500 text-center py-6">No other members.</p>
            : others.map(m => {
              const name = m.profile?.full_name || m.invited_email || "Unknown";
              const chk  = sel.includes(m.user_id);
              const online = isOnline(m.user_id);
              return (
                <div key={m.id} onClick={() => toggle(m.user_id)}
                  className={cn("flex items-center gap-3 p-2.5 rounded-xl cursor-pointer transition-all select-none",
                    chk ? "bg-violet-500/15 border border-violet-500/30" : "hover:bg-white/[0.04] border border-transparent")}>
                  <Checkbox checked={chk} className="pointer-events-none" />
                  <div className="relative">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-violet-500/20 text-violet-400 text-xs font-bold">{getInitials(name)}</AvatarFallback>
                    </Avatar>
                    <OnlineDot online={online} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-200">{name}</p>
                    <p className={cn("text-xs capitalize", online ? "text-emerald-400" : "text-slate-500")}>
                      {online ? "Online" : m.role}
                    </p>
                  </div>
                </div>
              );
            })}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => { setSel([]); onClose(); }}>Cancel</Button>
          <Button size="sm" disabled={!sel.length || startConversation.isPending} onClick={handleStart}
            style={{ background: "linear-gradient(135deg,#7c3aed,#6d28d9)" }}>
            {sel.length > 1 ? "Create Group" : "Start Chat"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── chat thread ─────────────────────────────────────────── */
function ChatThread({ conversationId, conversations, onBack, isOnline }: {
  conversationId: string; conversations: Conversation[]; onBack?(): void;
  isOnline(uid: string): boolean;
}) {
  const { user } = useAuth();
  const { messages: rawMessages, messagesLoading, sendMessage, readReceipts } = useConversationMessages(conversationId);
  const { typingUsers, sendTyping, sendStopTyping } = useTypingIndicator(conversationId);
  const [input, setInput]         = useState("");
  const [pendingFile, setPF]      = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [editId, setEditId]       = useState<string | null>(null);
  const [editTxt, setEditTxt]     = useState("");
  const [ctx, setCtx]             = useState<{ id: string; x: number; y: number } | null>(null);
  const [lpId, setLpId]           = useState<string | null>(null);

  // ── Optimistic deletes: track locally deleted IDs ──
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());

  const scrollRef   = useRef<HTMLDivElement>(null);
  const fileRef     = useRef<HTMLInputElement>(null);
  const editRef     = useRef<HTMLInputElement>(null);
  const typingTimer = useRef<NodeJS.Timeout | null>(null);
  const lpTimer     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const myName = user?.user_metadata?.full_name || user?.email || "You";
  const convo   = conversations.find(c => c.id === conversationId);
  const chatName = convo ? getConversationName(convo) : "Chat";
  const isGroup  = convo?.is_group ?? false;

  // Filter out optimistically deleted messages
  const messages = useMemo(
    () => rawMessages.filter(m => !deletedIds.has(m.id)),
    [rawMessages, deletedIds]
  );

  // Get the other participant's userId for online status (1-on-1 chats)
  const otherUserId = !isGroup && convo?.participants?.[0]?.user_id;
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
  const saveEdit  = async (id: string) => {
    if (!editTxt.trim()) return;
    try { await supabase.from("team_messages").update({ message_text: editTxt.trim() }).eq("id", id); toast({ title: "Updated" }); }
    catch { toast({ title: "Failed to update", variant: "destructive" }); }
    finally { setEditId(null); setEditTxt(""); }
  };

  // ── Optimistic delete: remove from UI immediately ──
  const delMsg = async (id: string) => {
    // Optimistically hide it right away
    setDeletedIds(prev => new Set([...prev, id]));
    try {
      await supabase.from("team_messages").delete().eq("id", id);
      toast({ title: "Deleted" });
    } catch {
      // Rollback on failure
      setDeletedIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      toast({ title: "Failed to delete", variant: "destructive" });
    }
  };

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
        <div className="relative">
          <div className="mp-thread-av">
            {isGroup ? <Users style={{ width: 14, height: 14, color: "#a78bfa" }} />
              : <span style={{ fontSize: 12, fontWeight: 700, color: "#818cf8" }}>{convo ? getConversationInitials(convo) : "?"}</span>}
          </div>
          {/* Online indicator on avatar in header */}
          {!isGroup && (
            <OnlineDot online={otherOnline} size="md" />
          )}
        </div>
        <div className="mp-thread-info">
          <p className="mp-thread-name">{chatName}</p>
          {typingUsers.length > 0 ? (
            <p className="mp-thread-typing">typing…</p>
          ) : isGroup ? (
            <p className="mp-thread-sub">{(convo?.participants.length ?? 0) + 1} members</p>
          ) : (
            <p className={cn("mp-thread-sub", otherOnline && "mp-thread-online")}>
              {otherOnline ? "● Online" : "Offline"}
            </p>
          )}
        </div>
        {typingUsers.length > 0 && (
          <div className="mp-typing-dots"><span /><span /><span /></div>
        )}
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
              const isMe   = msg.sender_id === user?.id;
              const status = getReadStatus(msg.created_at, msg.sender_id, user?.id ?? "", readReceipts);
              const next   = group.msgs[idx + 1];
              const prev   = group.msgs[idx - 1];
              const showRec = isMe && (!next || next.sender_id !== user?.id);
              const samePrev = prev?.sender_id === msg.sender_id;
              const isEd = editId === msg.id;
              return (
                <div key={msg.id}
                  className={cn("mp-msg-row", isMe ? "mp-msg-row--me" : "mp-msg-row--them", samePrev && "mp-msg-row--same")}
                  onContextMenu={e => onCtx(e, msg.id)}
                  onTouchStart={() => onTouchStart(msg.id)}
                  onTouchEnd={onTouchEnd} onTouchMove={onTouchEnd}>
                  {!isMe && !samePrev && (
                    <div className="mp-av">{getInitials(msg.sender?.full_name || msg.sender?.email)}</div>
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
                            {isImageFile(msg.file_type)
                              ? <a href={msg.file_url} target="_blank" rel="noopener noreferrer"><img src={msg.file_url} alt={msg.file_name ?? "img"} className="mp-attach-img" /></a>
                              : <a href={msg.file_url} target="_blank" rel="noopener noreferrer" className={cn("mp-attach-file", isMe && "mp-attach-file--me")}><FileText style={{ width: 14, height: 14, flexShrink: 0 }} /><span className="mp-attach-name">{msg.file_name ?? "File"}</span></a>}
                          </div>
                        )}
                        {(!msg.file_url || msg.message_text !== msg.file_name) && (
                          <p className="mp-bubble-text">{msg.message_text}</p>
                        )}
                      </div>
                    )}
                    {/* desktop hover actions */}
                    {isMe && !isEd && (
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

      {/* desktop context menu */}
      {ctx && (
        <CtxMenu
          isMe={messages.find(m => m.id === ctx.id)?.sender_id === user?.id ?? false}
          pos={{ x: ctx.x, y: ctx.y }}
          onCopy={()   => copyMsg(messages.find(m => m.id === ctx.id)?.message_text ?? "")}
          onEdit={()   => { const m = messages.find(x => x.id === ctx.id); if (m) startEdit(m.id, m.message_text); }}
          onDelete={()  => delMsg(ctx.id)}
          onClose={()  => setCtx(null)}
        />
      )}

      {/* mobile long-press action sheet */}
      {lpId && lpMsg && (
        <div className="mp-sheet-overlay" onClick={() => setLpId(null)}>
          <div className="mp-sheet" onClick={e => e.stopPropagation()}>
            <div className="mp-sheet-handle" />
            <div className="mp-sheet-preview">
              <p className="mp-sheet-preview-txt">{lpMsg.message_text.slice(0, 70)}{lpMsg.message_text.length > 70 ? "…" : ""}</p>
            </div>
            {[
              { icon: Copy,   label: "Copy text",      fn: () => { copyMsg(lpMsg.message_text); setLpId(null); }, danger: false },
              ...(lpIsMe ? [
                { icon: Pencil, label: "Edit message",   fn: () => { startEdit(lpMsg.id, lpMsg.message_text); setLpId(null); }, danger: false },
                { icon: Trash2, label: "Delete message", fn: () => { delMsg(lpMsg.id); setLpId(null); }, danger: true },
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

      {/* file preview */}
      {pendingFile && (
        <div className="mp-file-prev">
          {pendingFile.type.startsWith("image/") ? <ImageIcon style={{ width: 14, height: 14, color: "#818cf8", flexShrink: 0 }} /> : <FileText style={{ width: 14, height: 14, color: "#818cf8", flexShrink: 0 }} />}
          <span className="mp-fp-name">{pendingFile.name}</span>
          <span className="mp-fp-size">{(pendingFile.size / 1024).toFixed(0)} KB</span>
          <button className="mp-fp-rm" onClick={() => setPF(null)}><X style={{ width: 12, height: 12 }} /></button>
        </div>
      )}

      {/* input */}
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

/* ─── notifications ───────────────────────────────────────── */
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
        {notificationsLoading ? (
          <div className="mp-center"><Loader2 className="mp-spin" /></div>
        ) : filtered.length === 0 ? (
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
  onSelect(id: string): void; search: string; onSearchChange(v: string): void;
  isOnline(uid: string): boolean;
}) {
  return (
    <div className="mp-convo-panel">
      <div className="mp-search-wrap">
        <Search style={{ width: 14, height: 14, color: "rgba(255,255,255,0.22)", flexShrink: 0 }} />
        <input className="mp-search" placeholder="Search…" value={search} onChange={e => onSearchChange(e.target.value)} />
        {search && <button className="mp-search-clr" onClick={() => onSearchChange("")}><X style={{ width: 12, height: 12 }} /></button>}
      </div>
      <div className="mp-convo-items">
        {loading ? (
          <div className="mp-center"><Loader2 className="mp-spin" /></div>
        ) : convos.length === 0 ? (
          <div className="mp-convo-empty">
            <MessageSquare style={{ width: 26, height: 26, color: "rgba(124,58,237,0.3)" }} />
            <p>{search ? "No results" : "No conversations"}</p>
          </div>
        ) : convos.map(c => {
          const name = getConversationName(c);
          const init = getConversationInitials(c);
          const isSel = selected === c.id;
          // For 1-on-1 chats, check if the other person is online
          const otherParticipant = !c.is_group && c.participants[0];
          const participantOnline = otherParticipant ? isOnline(otherParticipant.user_id) : false;

          return (
            <button key={c.id} className={cn("mp-convo-item", isSel && "mp-convo-item--active")} onClick={() => onSelect(c.id)}>
              <div className="mp-convo-av-wrap">
                <div className={cn("mp-convo-av", c.is_group && "mp-convo-av--group")}>
                  {c.is_group ? <Users style={{ width: 14, height: 14 }} /> : init}
                </div>
                {/* Online indicator dot on conversation avatar */}
                {!c.is_group && (
                  <span
                    className={cn(
                      "absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-[#0b0f1c] transition-colors duration-300",
                      participantOnline ? "bg-emerald-400" : "bg-slate-600"
                    )}
                  />
                )}
                {c.unread_count > 0 && (
                  <div className="mp-convo-unread">{c.unread_count > 9 ? "9+" : c.unread_count}</div>
                )}
              </div>
              <div className="mp-convo-info">
                <div className="mp-convo-row1">
                  <span className={cn("mp-convo-name", c.unread_count > 0 && "mp-convo-name--unread")}>{name}</span>
                  {c.last_message && <span className="mp-convo-time">{formatTime(c.last_message.created_at)}</span>}
                </div>
                {/* Show online status text for 1-on-1 chats */}
                {!c.is_group ? (
                  <p className={cn("mp-convo-preview text-[10px] font-medium", participantOnline ? "text-emerald-400" : "text-slate-600")}>
                    {participantOnline ? "● Online" : c.last_message?.message_text ?? ""}
                  </p>
                ) : c.last_message && (
                  <p className={cn("mp-convo-preview", c.unread_count > 0 && "mp-convo-preview--unread")}>{c.last_message.message_text}</p>
                )}
              </div>
              <ChevronRight className="mp-chevron" style={{ width: 14, height: 14 }} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─── main ────────────────────────────────────────────────── */
export default function MessagesPage() {
  const { user }   = useAuth();
  const { team, members } = useTeam();
  const { conversations, conversationsLoading, totalUnread, refetchConversations } = useTeamMessaging(team?.id);
  const { unreadCount: notifCount } = useNotifications();

  // ── Online presence for the whole team ──
  const { isOnline } = useOnlinePresence(team?.id);

  const [selected, setSelected]   = useState<string | null>(null);
  const [newOpen, setNewOpen]      = useState(false);
  const [search, setSearch]        = useState("");
  const [tab, setTab]              = useState<"chats"|"notifs">("chats");
  const [mobileScr, setMobileScr] = useState<"list"|"thread">("list");

  const filtered = useMemo(() => {
    if (!search.trim()) return conversations;
    const q = search.toLowerCase();
    return conversations.filter(c =>
      getConversationName(c).toLowerCase().includes(q) ||
      (c.last_message?.message_text ?? "").toLowerCase().includes(q));
  }, [conversations, search]);

  const selectConvo = (id: string) => { setSelected(id); setMobileScr("thread"); };
  const goBack      = () => setMobileScr("list");
  const totalBadge  = totalUnread + notifCount;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;1,400&family=Bricolage+Grotesque:wght@600;700;800&display=swap');

        /* tokens */
        .mp-page{--bg0:#060912;--bg1:#0b0f1c;--bg2:#0f1424;--border:rgba(255,255,255,0.07);--border2:rgba(255,255,255,0.04);--ac:#7c3aed;--ac2:#6d28d9;--ac-glow:rgba(124,58,237,0.35);--ac-soft:rgba(124,58,237,0.12);--t1:#f0f6fc;--t2:rgba(255,255,255,0.6);--t3:rgba(255,255,255,0.3);--t4:rgba(255,255,255,0.14);--r:var(--font-body,'DM Sans',system-ui,sans-serif);--rd:'Bricolage Grotesque',system-ui,sans-serif;}

        @keyframes mpSpin{to{transform:rotate(360deg)}}
        @keyframes mpBounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-4px)}}
        @keyframes mpSlideUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
        @keyframes mpSheetUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
        @keyframes mpFade{from{opacity:0}to{opacity:1}}
        @keyframes mpMsgIn{from{opacity:0;transform:translateY(6px) scale(0.97)}to{opacity:1;transform:translateY(0) scale(1)}}

        .mp-page{display:flex;flex-direction:column;height:calc(100dvh - 4rem);margin:-24px;overflow:hidden;background:var(--bg0);font-family:'DM Sans',system-ui,sans-serif;}
        @media(max-width:767px){.mp-page{margin:-16px;height:calc(100dvh - 3.5rem);padding-bottom:58px;}}

        /* top bar */
        .mp-topbar{display:flex;align-items:center;justify-content:space-between;padding:0 20px;height:56px;flex-shrink:0;background:rgba(11,15,28,0.96);border-bottom:1px solid var(--border);backdrop-filter:blur(20px);}
        .mp-topbar-l{display:flex;align-items:center;gap:10px;}
        .mp-topbar-icon{width:32px;height:32px;border-radius:9px;background:var(--ac-soft);border:1px solid rgba(124,58,237,0.25);display:flex;align-items:center;justify-content:center;flex-shrink:0;}
        .mp-topbar-title{font-size:15px;font-weight:700;color:var(--t1);font-family:'Bricolage Grotesque',sans-serif;margin:0;}
        .mp-topbar-badge{font-size:10px;font-weight:700;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#fff;padding:2px 8px;border-radius:20px;box-shadow:0 2px 8px var(--ac-glow);}
        .mp-new-btn{display:flex;align-items:center;gap:6px;background:linear-gradient(135deg,#7c3aed,#6d28d9);border:none;border-radius:9px;padding:7px 14px;color:#fff;font-size:12px;font-weight:600;cursor:pointer;box-shadow:0 3px 12px var(--ac-glow);font-family:'DM Sans',sans-serif;transition:transform .15s,box-shadow .15s;}
        .mp-new-btn:hover{transform:translateY(-1px);box-shadow:0 6px 18px var(--ac-glow);}
        @media(max-width:480px){.mp-new-btn span{display:none;}.mp-new-btn{width:34px;height:34px;padding:0;border-radius:50%;justify-content:center;}}

        /* body */
        .mp-body{display:flex;flex:1;min-height:0;}

        /* sidebar */
        .mp-sidebar{width:300px;flex-shrink:0;display:flex;flex-direction:column;border-right:1px solid var(--border);background:var(--bg1);}
        @media(max-width:767px){.mp-sidebar{width:100%;border-right:none;}.mp-sidebar--hidden{display:none;}}

        /* tabs */
        .mp-tabs{display:flex;gap:4px;padding:8px 10px;border-bottom:1px solid var(--border2);flex-shrink:0;}
        .mp-tab{flex:1;display:flex;align-items:center;justify-content:center;gap:5px;padding:7px 0;border-radius:8px;background:transparent;border:1px solid transparent;color:var(--t3);font-size:12px;font-weight:600;cursor:pointer;transition:all .15s;font-family:'DM Sans',sans-serif;}
        .mp-tab--active{background:var(--ac-soft);border-color:rgba(124,58,237,0.25);color:#a78bfa;}
        .mp-tab-badge{background:var(--ac);color:#fff;font-size:9px;font-weight:700;padding:1px 5px;border-radius:10px;}

        /* convo panel */
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
        .mp-convo-unread{position:absolute;top:-3px;right:-3px;width:16px;height:16px;border-radius:50%;background:linear-gradient(135deg,#7c3aed,#6d28d9);display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#fff;box-shadow:0 2px 6px var(--ac-glow);}
        .mp-convo-info{flex:1;min-width:0;}
        .mp-convo-row1{display:flex;justify-content:space-between;align-items:baseline;gap:4px;}
        .mp-convo-name{font-size:13px;font-weight:500;color:rgba(255,255,255,0.7);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .mp-convo-name--unread{font-weight:600;color:var(--t1);}
        .mp-convo-time{font-size:10px;color:var(--t3);flex-shrink:0;}
        .mp-convo-preview{font-size:11px;color:var(--t3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px;}
        .mp-convo-preview--unread{color:rgba(255,255,255,0.5);font-weight:500;}
        .mp-chevron{color:var(--t4);flex-shrink:0;}
        @media(min-width:768px){.mp-chevron{display:none;}}

        /* right panel */
        .mp-right{flex:1;display:flex;flex-direction:column;min-width:0;background:rgba(6,9,18,0.7);}
        @media(max-width:767px){.mp-right--hidden{display:none;}}
        .mp-right-empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:40px;}
        .mp-re-icon{width:68px;height:68px;border-radius:20px;margin-bottom:18px;background:rgba(124,58,237,0.08);border:1px solid rgba(124,58,237,0.15);display:flex;align-items:center;justify-content:center;box-shadow:0 0 40px rgba(124,58,237,0.06);}
        .mp-right-empty h3{font-size:15px;font-weight:700;color:#64748b;font-family:'Bricolage Grotesque',sans-serif;margin:0 0 6px;}
        .mp-right-empty p{font-size:12px;color:var(--t4);max-width:240px;line-height:1.6;margin:0 0 20px;}
        .mp-re-btn{display:flex;align-items:center;gap:7px;background:linear-gradient(135deg,#7c3aed,#6d28d9);border:none;border-radius:10px;padding:9px 18px;color:#fff;font-size:13px;font-weight:600;cursor:pointer;box-shadow:0 4px 16px var(--ac-glow);font-family:'DM Sans',sans-serif;}

        /* thread */
        .mp-thread{display:flex;flex-direction:column;height:100%;}

        /* thread header */
        .mp-thread-header{display:flex;align-items:center;gap:10px;padding:12px 18px;flex-shrink:0;background:rgba(11,15,28,0.92);border-bottom:1px solid var(--border);backdrop-filter:blur(20px);}
        .mp-back-btn{background:rgba(255,255,255,0.05);border:1px solid var(--border);border-radius:8px;width:32px;height:32px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--t2);flex-shrink:0;transition:.13s;}
        .mp-back-btn:hover{background:rgba(255,255,255,0.09);}
        @media(min-width:768px){.mp-back-btn{display:none;}}
        .mp-thread-av{width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,rgba(124,58,237,0.25),rgba(109,40,217,0.25));border:1px solid rgba(124,58,237,0.28);display:flex;align-items:center;justify-content:center;flex-shrink:0;}
        .mp-thread-info{flex:1;min-width:0;}
        .mp-thread-name{font-size:14px;font-weight:600;color:var(--t1);font-family:'Bricolage Grotesque',sans-serif;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .mp-thread-sub{font-size:11px;color:var(--t3);margin:0;}
        .mp-thread-online{color:#34d399!important;font-weight:500;}
        .mp-thread-typing{font-size:11px;color:#a78bfa;font-style:italic;margin:0;}
        .mp-typing-dots{display:flex;gap:3px;align-items:center;flex-shrink:0;}
        .mp-typing-dots span{width:5px;height:5px;border-radius:50%;background:#7c3aed;display:block;}
        .mp-typing-dots span:nth-child(1){animation:mpBounce 1.2s .0s infinite;}
        .mp-typing-dots span:nth-child(2){animation:mpBounce 1.2s .2s infinite;}
        .mp-typing-dots span:nth-child(3){animation:mpBounce 1.2s .4s infinite;}

        /* messages */
        .mp-messages{flex:1;overflow-y:auto;padding:14px 16px;}
        @media(max-width:767px){.mp-messages{padding:10px 10px;}}
        .mp-center{display:flex;justify-content:center;padding:40px 0;}
        .mp-spin{width:20px;height:20px;color:#7c3aed;animation:mpSpin 1s linear infinite;}
        .mp-empty-thread{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;text-align:center;}
        .mp-empty-icon{width:52px;height:52px;border-radius:16px;margin-bottom:14px;background:rgba(124,58,237,0.1);border:1px solid rgba(124,58,237,0.2);display:flex;align-items:center;justify-content:center;}
        .mp-empty-title{font-size:14px;font-weight:600;color:#64748b;margin:0 0 4px;}
        .mp-empty-sub{font-size:12px;color:var(--t4);margin:0;}

        /* date divider */
        .mp-date-div{display:flex;align-items:center;gap:10px;margin:18px 0 10px;}
        .mp-div-line{flex:1;height:1px;background:var(--border2);}
        .mp-div-label{font-size:10px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--t3);padding:3px 9px;background:rgba(255,255,255,0.03);border:1px solid var(--border2);border-radius:20px;white-space:nowrap;}

        /* message rows */
        .mp-msg-row{display:flex;margin-bottom:2px;position:relative;animation:mpMsgIn .2s ease;}
        .mp-msg-row--me{justify-content:flex-end;margin-top:3px;}
        .mp-msg-row--them{justify-content:flex-start;margin-top:3px;}
        .mp-msg-row--same{margin-bottom:1px;}
        .mp-msg-row:not(.mp-msg-row--same){margin-top:10px;}
        .mp-av{width:30px;height:30px;border-radius:8px;flex-shrink:0;background:rgba(124,58,237,0.2);border:1px solid rgba(124,58,237,0.2);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#818cf8;margin-right:8px;margin-top:2px;}
        .mp-av-sp{width:38px;flex-shrink:0;}
        .mp-msg-body{display:flex;flex-direction:column;max-width:70%;}
        @media(max-width:480px){.mp-msg-body{max-width:86%;}}
        .mp-msg-body--me{align-items:flex-end;}
        .mp-msg-body--them{align-items:flex-start;}
        .mp-sender{font-size:10px;color:var(--t3);margin:0 0 2px 2px;font-weight:500;}

        /* bubbles */
        .mp-bubble{padding:9px 13px;line-height:1.5;cursor:context-menu;transition:box-shadow .13s;word-break:break-word;}
        .mp-bubble--me{background:linear-gradient(135deg,#7c3aed,#6d28d9);border:1px solid rgba(124,58,237,0.4);border-radius:16px 16px 4px 16px;box-shadow:0 3px 16px rgba(124,58,237,0.28);}
        .mp-bubble--them{background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.07);border-radius:16px 16px 16px 4px;}
        .mp-bubble-text{font-size:13px;color:#fff;margin:0;font-family:'DM Sans',sans-serif;}
        .mp-bubble--them .mp-bubble-text{color:rgba(255,255,255,0.84);}
        @media(max-width:767px){.mp-bubble-text{font-size:14px;}.mp-bubble{padding:10px 14px;}}

        /* attachments */
        .mp-attach{margin-bottom:6px;}
        .mp-attach-img{border-radius:8px;max-width:100%;max-height:160px;object-fit:cover;display:block;}
        .mp-attach-file{display:flex;align-items:center;gap:7px;padding:7px 10px;border-radius:8px;text-decoration:none;background:rgba(255,255,255,0.1);font-size:12px;color:rgba(255,255,255,0.85);}
        .mp-attach-file--me{background:rgba(255,255,255,0.15);}
        .mp-attach-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}

        /* hover actions — desktop only */
        .mp-hover-acts{display:none;position:absolute;right:calc(100% + 6px);top:50%;transform:translateY(-50%);gap:3px;align-items:center;}
        @media(min-width:768px){.mp-msg-row--me:hover .mp-hover-acts{display:flex;}}
        .mp-ha{background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:4px 5px;cursor:pointer;color:rgba(255,255,255,0.4);display:flex;align-items:center;transition:.12s;}
        .mp-ha:hover{background:rgba(255,255,255,0.12);color:#fff;}
        .mp-ha--del{background:rgba(239,68,68,0.06);border-color:rgba(239,68,68,0.15);}
        .mp-ha--del:hover{background:rgba(239,68,68,0.15);color:#f87171;}

        /* edit */
        .mp-edit-wrap{display:flex;align-items:center;gap:6px;background:rgba(124,58,237,0.1);border:1px solid rgba(124,58,237,0.3);border-radius:12px;padding:7px 10px;}
        .mp-edit-input{background:transparent;border:none;outline:none;color:var(--t1);font-size:13px;min-width:100px;flex:1;font-family:'DM Sans',sans-serif;}
        .mp-edit-save{background:#7c3aed;border:none;border-radius:6px;padding:3px 9px;color:#fff;font-size:11px;font-weight:600;cursor:pointer;}
        .mp-edit-cancel{background:transparent;border:none;color:var(--t3);cursor:pointer;font-size:16px;line-height:1;padding:0 2px;}

        /* meta */
        .mp-meta{display:flex;align-items:center;gap:4px;margin-top:3px;padding:0 2px;}
        .mp-meta--me{justify-content:flex-end;}
        .mp-time{font-size:10px;color:var(--t4);}

        /* context menu */
        .mp-ctxmenu{background:rgba(10,13,22,0.97);backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,0.08);border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,0.7);overflow:hidden;width:160px;animation:mpFade .12s ease;}
        .mp-ctx-item{display:flex;align-items:center;gap:9px;width:100%;padding:9px 14px;background:transparent;border:none;border-bottom:1px solid rgba(255,255,255,0.05);color:rgba(255,255,255,0.7);font-size:12px;font-weight:500;cursor:pointer;font-family:'DM Sans',sans-serif;transition:.12s;}
        .mp-ctx-item:last-child{border-bottom:none;}
        .mp-ctx-item:hover{background:rgba(255,255,255,0.06);color:#fff;}
        .mp-ctx-item--danger{color:#f87171;}
        .mp-ctx-item--danger:hover{background:rgba(248,113,113,0.1);}

        /* action sheet */
        .mp-sheet-overlay{position:fixed;inset:0;z-index:9998;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);animation:mpFade .2s ease;}
        .mp-sheet{position:absolute;bottom:0;left:0;right:0;background:#0f1424;border-top:1px solid rgba(255,255,255,0.08);border-radius:20px 20px 0 0;padding:0 0 env(safe-area-inset-bottom,16px);animation:mpSheetUp .25s ease;}
        .mp-sheet-handle{width:36px;height:4px;border-radius:2px;background:rgba(255,255,255,0.15);margin:10px auto 0;}
        .mp-sheet-preview{padding:12px 20px 10px;border-bottom:1px solid rgba(255,255,255,0.05);}
        .mp-sheet-preview-txt{font-size:12px;color:var(--t3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin:0;}
        .mp-sheet-btn{display:flex;align-items:center;gap:14px;width:100%;padding:16px 22px;background:transparent;border:none;border-bottom:1px solid rgba(255,255,255,0.05);color:var(--t1);font-size:16px;font-weight:500;cursor:pointer;text-align:left;font-family:'DM Sans',sans-serif;}
        .mp-sheet-btn--danger{color:#f87171;}
        .mp-sheet-cancel{display:block;width:calc(100% - 24px);margin:8px 12px 4px;padding:14px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);border-radius:12px;color:var(--t2);font-size:16px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;}

        /* file preview */
        .mp-file-prev{display:flex;align-items:center;gap:8px;margin:0 14px 4px;background:rgba(124,58,237,0.07);border:1px solid rgba(124,58,237,0.2);border-radius:10px;padding:8px 12px;}
        .mp-fp-name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:#94a3b8;}
        .mp-fp-size{font-size:10px;color:var(--t3);flex-shrink:0;}
        .mp-fp-rm{background:none;border:none;cursor:pointer;color:var(--t3);display:flex;padding:0;}

        /* input bar */
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

        /* notifications */
        .mp-notif-panel{display:flex;flex-direction:column;height:100%;}
        .mp-notif-hdr{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--border);background:rgba(11,15,28,0.9);flex-shrink:0;flex-wrap:wrap;gap:8px;}
        .mp-notif-hdr-l{display:flex;align-items:center;gap:8px;}
        .mp-notif-title{font-size:14px;font-weight:600;color:var(--t1);font-family:'Bricolage Grotesque',sans-serif;}
        .mp-notif-badge{background:var(--ac-soft);color:#a78bfa;font-size:10px;font-weight:700;padding:2px 7px;border-radius:20px;border:1px solid rgba(124,58,237,0.3);}
        .mp-notif-hdr-r{display:flex;align-items:center;gap:5px;flex-wrap:wrap;}
        .mp-filter-btn{background:transparent;border:1px solid transparent;border-radius:6px;padding:3px 9px;color:var(--t3);font-size:11px;font-weight:500;cursor:pointer;font-family:'DM Sans',sans-serif;text-transform:capitalize;transition:.13s;}
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
        .mp-notif-text--bold{font-weight:500;color:rgba(255,255,255,0.84);}
        .mp-notif-time{font-size:10px;color:var(--t4);margin-top:3px;}
        .mp-notif-dot{width:7px;height:7px;border-radius:50%;background:var(--ac);flex-shrink:0;margin-top:6px;}

        /* mobile bottom nav */
        .mp-bottom-nav{display:none;position:fixed;bottom:0;left:0;right:0;background:rgba(11,15,28,0.97);backdrop-filter:blur(20px);border-top:1px solid var(--border);z-index:50;padding-bottom:env(safe-area-inset-bottom,0px);}
        @media(max-width:767px){.mp-bottom-nav{display:flex;}}
        .mp-bnav-btn{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding:10px 0;background:transparent;border:none;cursor:pointer;color:var(--t3);font-size:10px;font-weight:600;font-family:'DM Sans',sans-serif;transition:color .15s;}
        .mp-bnav-btn--active{color:#a78bfa;}
        .mp-bnav-icon{position:relative;}
        .mp-bnav-badge{position:absolute;top:-4px;right:-6px;width:14px;height:14px;border-radius:50%;background:linear-gradient(135deg,#7c3aed,#6d28d9);font-size:8px;font-weight:700;color:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px var(--ac-glow);}

        /* scrollbars */
        .mp-messages::-webkit-scrollbar,.mp-convo-items::-webkit-scrollbar,.mp-notif-list::-webkit-scrollbar{width:3px;}
        .mp-messages::-webkit-scrollbar-track,.mp-convo-items::-webkit-scrollbar-track,.mp-notif-list::-webkit-scrollbar-track{background:transparent;}
        .mp-messages::-webkit-scrollbar-thumb,.mp-convo-items::-webkit-scrollbar-thumb,.mp-notif-list::-webkit-scrollbar-thumb{background:rgba(124,58,237,0.2);border-radius:2px;}

        .sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);}
      `}</style>

      <DashboardLayout>
        <div className="mp-page">

          {/* top bar */}
          <div className="mp-topbar">
            <div className="mp-topbar-l">
              <div className="mp-topbar-icon"><MessageSquare style={{ width: 15, height: 15, color: "#a78bfa" }} /></div>
              <p className="mp-topbar-title">Messages</p>
              {totalBadge > 0 && <span className="mp-topbar-badge">{totalBadge}</span>}
            </div>
            <button className="mp-new-btn" onClick={() => setNewOpen(true)}>
              <Plus style={{ width: 13, height: 13 }} /><span>New Message</span>
            </button>
          </div>

          {/* body */}
          <div className="mp-body">

            {/* sidebar */}
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

            {/* right panel */}
            <div className={cn("mp-right", mobileScr === "list" && "mp-right--hidden")}>
              {tab === "chats"
                ? selected
                  ? <ChatThread conversationId={selected} conversations={conversations} onBack={goBack} isOnline={isOnline} />
                  : (
                    <div className="mp-right-empty">
                      <div className="mp-re-icon"><MessageSquare style={{ width: 26, height: 26, color: "#7c3aed" }} /></div>
                      <h3>Select a conversation</h3>
                      <p>Pick a thread from the sidebar or start a new one with your team.</p>
                      <button className="mp-re-btn" onClick={() => setNewOpen(true)}>
                        <Plus style={{ width: 14, height: 14 }} />New Message
                      </button>
                    </div>
                  )
                : <NotifsPanel />}
            </div>
          </div>

          {/* mobile bottom nav */}
          <nav className="mp-bottom-nav">
            {([
              { id: "chats"  as const, label: "Chats",  Icon: MessageSquare, badge: totalUnread },
              { id: "notifs" as const, label: "Alerts", Icon: Bell,          badge: notifCount  },
            ] as const).map(t => (
              <button key={t.id}
                className={cn("mp-bnav-btn", tab === t.id && mobileScr === "list" && "mp-bnav-btn--active")}
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