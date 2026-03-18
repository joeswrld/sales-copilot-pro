import { useState, useRef, useEffect, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Search, Send, MessageSquare, Bell, Plus, Users, FileText,
  Image as ImageIcon, Paperclip, X, Check, CheckCheck, TrendingUp,
  AtSign, AlertCircle, ArrowLeft, Copy, Trash2, Pencil, MoreHorizontal,
  Hash, ChevronRight, Loader2, Mic
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTeam } from "@/hooks/useTeam";
import { useTeamMessaging, useConversationMessages, getConversationName, getConversationInitials } from "@/hooks/useTeamMessaging";
import { useNotifications } from "@/hooks/useNotifications";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/components/ui/use-toast";
import { format, isToday, isYesterday, isThisWeek } from "date-fns";
import { cn } from "@/lib/utils";
import type { Conversation, ReadReceipt } from "@/hooks/useTeamMessaging";
import type { TeamMember } from "@/hooks/useTeam";
import { useTypingIndicator } from "@/hooks/useTypingIndicator";

// ─── Helpers ────────────────────────────────────────────────────────────────

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

function getReadStatus(
  msgCreatedAt: string,
  senderId: string,
  currentUserId: string,
  readReceipts: ReadReceipt[]
): "none" | "sent" | "read" {
  if (senderId !== currentUserId) return "none";
  const readBy = readReceipts.filter(r => r.last_read_at && new Date(r.last_read_at) >= new Date(msgCreatedAt));
  return readBy.length > 0 ? "read" : "sent";
}

const notifTypeIcons: Record<string, typeof Bell> = {
  comment: MessageSquare,
  coaching: TrendingUp,
  mention: AtSign,
  system: AlertCircle,
};

const notifTypeColors: Record<string, string> = {
  comment: "bg-indigo-500/10 text-indigo-400",
  coaching: "bg-emerald-500/10 text-emerald-400",
  mention: "bg-amber-500/10 text-amber-400",
  system: "bg-slate-500/10 text-slate-400",
};

// ─── Message Context Menu ────────────────────────────────────────────────────

interface MessageMenuProps {
  isMe: boolean;
  messageText: string;
  onCopy: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onClose: () => void;
  position: { x: number; y: number };
}

function MessageContextMenu({ isMe, messageText, onCopy, onEdit, onDelete, onClose, position }: MessageMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const actions = [
    { icon: Copy, label: "Copy text", action: onCopy, always: true },
    ...(isMe ? [
      { icon: Pencil, label: "Edit message", action: onEdit!, always: false },
      { icon: Trash2, label: "Delete message", action: onDelete!, always: false, danger: true },
    ] : []),
  ];

  return (
    <div
      ref={menuRef}
      style={{ position: "fixed", left: position.x, top: position.y, zIndex: 9999 }}
      className="w-44 rounded-xl border border-white/[0.08] shadow-2xl overflow-hidden"
      style={{
        position: "fixed",
        left: position.x,
        top: position.y,
        zIndex: 9999,
        background: "rgba(10, 14, 26, 0.97)",
        backdropFilter: "blur(20px)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: "12px",
        boxShadow: "0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)",
        width: "172px",
        overflow: "hidden",
      }}
    >
      {actions.map((action, i) => (
        <button
          key={i}
          onClick={() => { action.action?.(); onClose(); }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            width: "100%",
            padding: "9px 14px",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            color: action.danger ? "#f87171" : "rgba(255,255,255,0.75)",
            fontSize: "13px",
            fontWeight: 500,
            fontFamily: "'DM Sans', system-ui, sans-serif",
            transition: "background 0.15s, color 0.15s",
            borderBottom: i < actions.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none",
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.background = action.danger
              ? "rgba(248,113,113,0.1)"
              : "rgba(255,255,255,0.06)";
            (e.currentTarget as HTMLElement).style.color = action.danger ? "#f87171" : "#ffffff";
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.background = "transparent";
            (e.currentTarget as HTMLElement).style.color = action.danger ? "#f87171" : "rgba(255,255,255,0.75)";
          }}
        >
          <action.icon style={{ width: "14px", height: "14px", flexShrink: 0 }} />
          {action.label}
        </button>
      ))}
    </div>
  );
}

// ─── New Conversation Dialog ─────────────────────────────────────────────────

function NewConversationDialog({
  open, onClose, members, currentUserId, teamId, conversations, refetchConversations, onCreated,
}: {
  open: boolean; onClose: () => void; members: TeamMember[];
  currentUserId: string; teamId: string;
  conversations: Conversation[]; refetchConversations: () => void;
  onCreated: (id: string) => void;
}) {
  const { startConversation } = useConversationMessages(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const others = members.filter(m => m.user_id !== currentUserId && m.status === "active");

  const toggle = (uid: string) =>
    setSelectedIds(prev => prev.includes(uid) ? prev.filter(x => x !== uid) : [...prev, uid]);

  const handleStart = async () => {
    if (!selectedIds.length) return;
    try {
      if (selectedIds.length === 1) {
        const existing = conversations.find(c =>
          !c.is_group && c.participants.length === 1 && c.participants.some(p => p.user_id === selectedIds[0])
        );
        if (existing) { setSelectedIds([]); onCreated(existing.id); return; }
      }
      const id = await startConversation.mutateAsync({ teamId, memberIds: selectedIds });
      refetchConversations();
      setSelectedIds([]);
      onCreated(id);
      toast({ title: "Conversation started" });
    } catch (err: any) {
      toast({ title: "Could not start chat", description: err?.message ?? "Try again.", variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { setSelectedIds([]); onClose(); } }}>
      <DialogContent className="sm:max-w-sm" style={{ background: "rgba(10,14,26,0.98)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "16px" }}>
        <DialogHeader>
          <DialogTitle style={{ color: "#f1f5f9", fontFamily: "'Bricolage Grotesque', sans-serif" }}>New Conversation</DialogTitle>
        </DialogHeader>
        {selectedIds.length > 1 && (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5 px-1">
            <Users className="w-3.5 h-3.5" /> Group chat · {selectedIds.length} members
          </p>
        )}
        <div className="space-y-1 max-h-72 overflow-y-auto">
          {others.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No other team members.</p>
          ) : others.map(m => {
            const name = m.profile?.full_name || m.invited_email || "Unknown";
            const checked = selectedIds.includes(m.user_id);
            return (
              <div key={m.id} onClick={() => toggle(m.user_id)}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all",
                  checked
                    ? "bg-indigo-500/15 border border-indigo-500/30"
                    : "hover:bg-white/[0.04] border border-transparent"
                )}>
                <Checkbox checked={checked} className="pointer-events-none" />
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-indigo-500/20 text-indigo-400 text-xs font-bold">
                    {getInitials(m.profile?.full_name)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-medium text-slate-200">{name}</p>
                  <p className="text-xs text-slate-500 capitalize">{m.role}</p>
                </div>
              </div>
            );
          })}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => { setSelectedIds([]); onClose(); }}>Cancel</Button>
          <Button size="sm" onClick={handleStart} disabled={!selectedIds.length || startConversation.isPending}
            style={{ background: "linear-gradient(135deg, #6366f1, #4f46e5)" }}>
            {selectedIds.length > 1 ? "Create Group" : "Start Chat"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Chat Thread Panel ────────────────────────────────────────────────────────

function ChatThread({
  conversationId, conversations, onBack,
}: {
  conversationId: string; conversations: Conversation[]; onBack?: () => void;
}) {
  const { user } = useAuth();
  const { messages, messagesLoading, sendMessage, readReceipts } = useConversationMessages(conversationId);
  const { typingUsers, sendTyping, sendStopTyping } = useTypingIndicator(conversationId);
  const [input, setInput] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [contextMenu, setContextMenu] = useState<{ msgId: string; x: number; y: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const myName = user?.user_metadata?.full_name || user?.email || "You";

  const convo = conversations.find(c => c.id === conversationId);
  const chatName = convo ? getConversationName(convo) : "Chat";
  const isGroup = convo?.is_group ?? false;

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
    }
  }, [editingId]);

  const handleInputChange = (val: string) => {
    setInput(val);
    if (val.trim()) {
      sendTyping(myName);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => sendStopTyping(), 2000);
    } else {
      sendStopTyping();
    }
  };

  const uploadFile = async (file: File) => {
    const ext = file.name.split(".").pop() ?? "bin";
    const path = `${conversationId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from("team-attachments").upload(path, file, { contentType: file.type });
    if (error) throw error;
    const { data: urlData } = supabase.storage.from("team-attachments").getPublicUrl(path);
    return { url: urlData.publicUrl, name: file.name, type: file.type };
  };

  const handleSend = async () => {
    if (!input.trim() && !pendingFile) return;
    setUploading(true);
    try {
      let fileData: { url: string; name: string; type: string } | undefined;
      if (pendingFile) fileData = await uploadFile(pendingFile);
      sendMessage.mutate({
        text: input.trim() || (pendingFile?.name ?? "Attachment"),
        file_url: fileData?.url,
        file_name: fileData?.name,
        file_type: fileData?.type,
      });
      setInput("");
      setPendingFile(null);
      sendStopTyping();
    } finally {
      setUploading(false);
    }
  };

  const handleCopyMessage = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast({ title: "Copied to clipboard" });
    });
  };

  const handleStartEdit = (msgId: string, text: string) => {
    setEditingId(msgId);
    setEditText(text);
  };

  const handleSaveEdit = async (msgId: string) => {
    if (!editText.trim()) return;
    try {
      const { error } = await supabase
        .from("team_messages")
        .update({ message_text: editText.trim() })
        .eq("id", msgId);
      if (error) throw error;
      toast({ title: "Message updated" });
    } catch {
      toast({ title: "Failed to update message", variant: "destructive" });
    } finally {
      setEditingId(null);
      setEditText("");
    }
  };

  const handleDeleteMessage = async (msgId: string) => {
    try {
      const { error } = await supabase
        .from("team_messages")
        .delete()
        .eq("id", msgId);
      if (error) throw error;
      toast({ title: "Message deleted" });
    } catch {
      toast({ title: "Failed to delete message", variant: "destructive" });
    }
  };

  const handleContextMenu = (e: React.MouseEvent, msgId: string) => {
    e.preventDefault();
    const x = Math.min(e.clientX, window.innerWidth - 180);
    const y = Math.min(e.clientY, window.innerHeight - 140);
    setContextMenu({ msgId, x, y });
  };

  // Group messages by date
  const grouped = useMemo(() => {
    const groups: { label: string; msgs: typeof messages }[] = [];
    let last = "";
    messages.forEach(m => {
      const d = new Date(m.created_at);
      const label = isToday(d) ? "Today" : isYesterday(d) ? "Yesterday" : format(d, "MMMM d, yyyy");
      if (label !== last) { groups.push({ label, msgs: [] }); last = label; }
      groups[groups.length - 1].msgs.push(m);
    });
    return groups;
  }, [messages]);

  return (
    <div className="flex flex-col h-full" style={{ background: "rgba(8,11,20,0.6)" }}>
      {/* Header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "14px 20px",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        background: "rgba(10,14,26,0.8)",
        backdropFilter: "blur(20px)",
        flexShrink: 0,
      }}>
        {onBack && (
          <button
            className="md:hidden"
            onClick={onBack}
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "8px",
              width: "32px",
              height: "32px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: "rgba(255,255,255,0.6)",
            }}
          >
            <ArrowLeft style={{ width: "14px", height: "14px" }} />
          </button>
        )}

        <div style={{
          width: "38px",
          height: "38px",
          borderRadius: "10px",
          background: isGroup
            ? "linear-gradient(135deg, rgba(139,92,246,0.3), rgba(99,102,241,0.3))"
            : "linear-gradient(135deg, rgba(99,102,241,0.3), rgba(79,70,229,0.3))",
          border: "1px solid rgba(99,102,241,0.3)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}>
          {isGroup
            ? <Users style={{ width: "16px", height: "16px", color: "#818cf8" }} />
            : <span style={{ fontSize: "13px", fontWeight: 700, color: "#818cf8" }}>
                {convo ? getConversationInitials(convo) : "?"}
              </span>
          }
        </div>

        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ fontSize: "14px", fontWeight: 600, color: "#f1f5f9", fontFamily: "'Bricolage Grotesque', sans-serif", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {chatName}
          </p>
          {isGroup && (
            <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.35)" }}>
              {(convo?.participants.length ?? 0) + 1} members
            </p>
          )}
        </div>

        {typingUsers.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
            <div style={{ display: "flex", gap: "3px" }}>
              {[0,1,2].map(i => (
                <div key={i} style={{
                  width: "5px", height: "5px", borderRadius: "50%",
                  background: "#6366f1",
                  animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
                }} />
              ))}
            </div>
            <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", fontStyle: "italic" }}>
              {typingUsers.map(u => u.name.split(" ")[0]).join(", ")} typing
            </p>
          </div>
        )}
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
        {messagesLoading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
            <Loader2 style={{ width: "20px", height: "20px", color: "#6366f1", animation: "spin 1s linear infinite" }} />
          </div>
        ) : messages.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 20px", textAlign: "center" }}>
            <div style={{
              width: "56px", height: "56px", borderRadius: "16px",
              background: "linear-gradient(135deg, rgba(99,102,241,0.15), rgba(139,92,246,0.15))",
              border: "1px solid rgba(99,102,241,0.2)",
              display: "flex", alignItems: "center", justifyContent: "center",
              marginBottom: "16px",
            }}>
              <MessageSquare style={{ width: "22px", height: "22px", color: "#6366f1" }} />
            </div>
            <p style={{ fontSize: "14px", fontWeight: 600, color: "#94a3b8", marginBottom: "4px" }}>No messages yet</p>
            <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.25)" }}>Send the first message to get the conversation going.</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
            {grouped.map(group => (
              <div key={group.label}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", margin: "20px 0 12px" }}>
                  <div style={{ flex: 1, height: "1px", background: "rgba(255,255,255,0.06)" }} />
                  <span style={{
                    fontSize: "10px", color: "rgba(255,255,255,0.25)",
                    fontWeight: 600, letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    padding: "3px 10px",
                    background: "rgba(255,255,255,0.04)",
                    borderRadius: "20px",
                    border: "1px solid rgba(255,255,255,0.06)",
                    fontFamily: "'DM Sans', system-ui, sans-serif",
                  }}>
                    {group.label}
                  </span>
                  <div style={{ flex: 1, height: "1px", background: "rgba(255,255,255,0.06)" }} />
                </div>

                {group.msgs.map((msg, idx) => {
                  const isMe = msg.sender_id === user?.id;
                  const status = getReadStatus(msg.created_at, msg.sender_id, user?.id ?? "", readReceipts);
                  const nextMsg = group.msgs[idx + 1];
                  const showReceipt = isMe && (!nextMsg || nextMsg.sender_id !== user?.id);
                  const prevMsg = group.msgs[idx - 1];
                  const sameSender = prevMsg?.sender_id === msg.sender_id;
                  const isEditing = editingId === msg.id;
                  const isContextMsg = contextMenu?.msgId === msg.id;

                  return (
                    <div
                      key={msg.id}
                      style={{
                        display: "flex",
                        justifyContent: isMe ? "flex-end" : "flex-start",
                        marginTop: sameSender ? "2px" : "12px",
                        position: "relative",
                      }}
                      onContextMenu={e => handleContextMenu(e, msg.id)}
                    >
                      {!isMe && !sameSender && (
                        <div style={{
                          width: "30px", height: "30px", borderRadius: "8px",
                          background: "linear-gradient(135deg, rgba(99,102,241,0.2), rgba(139,92,246,0.2))",
                          border: "1px solid rgba(99,102,241,0.2)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          flexShrink: 0, marginRight: "8px", marginTop: "2px",
                          fontSize: "11px", fontWeight: 700, color: "#818cf8",
                        }}>
                          {getInitials(msg.sender?.full_name || msg.sender?.email)}
                        </div>
                      )}
                      {!isMe && sameSender && <div style={{ width: "38px", flexShrink: 0 }} />}

                      <div style={{
                        maxWidth: "68%",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: isMe ? "flex-end" : "flex-start",
                      }}>
                        {!isMe && !sameSender && (
                          <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.35)", marginBottom: "3px", marginLeft: "2px", fontWeight: 500 }}>
                            {msg.sender?.full_name || msg.sender?.email || "Unknown"}
                          </p>
                        )}

                        {isEditing ? (
                          <div style={{
                            display: "flex",
                            gap: "6px",
                            alignItems: "center",
                            background: "rgba(99,102,241,0.1)",
                            border: "1px solid rgba(99,102,241,0.3)",
                            borderRadius: "12px",
                            padding: "6px 10px",
                          }}>
                            <input
                              ref={editInputRef}
                              value={editText}
                              onChange={e => setEditText(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === "Enter") handleSaveEdit(msg.id);
                                if (e.key === "Escape") { setEditingId(null); setEditText(""); }
                              }}
                              style={{
                                background: "transparent",
                                border: "none",
                                outline: "none",
                                color: "#f1f5f9",
                                fontSize: "13px",
                                minWidth: "120px",
                                fontFamily: "'DM Sans', system-ui, sans-serif",
                              }}
                            />
                            <button
                              onClick={() => handleSaveEdit(msg.id)}
                              style={{ background: "#6366f1", border: "none", borderRadius: "6px", padding: "3px 8px", color: "#fff", fontSize: "11px", cursor: "pointer", fontWeight: 600 }}
                            >
                              Save
                            </button>
                            <button
                              onClick={() => { setEditingId(null); setEditText(""); }}
                              style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: "11px" }}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div
                            style={{
                              padding: "9px 13px",
                              borderRadius: isMe ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                              background: isMe
                                ? "linear-gradient(135deg, #6366f1, #4f46e5)"
                                : "rgba(255,255,255,0.06)",
                              border: isMe
                                ? "1px solid rgba(99,102,241,0.4)"
                                : "1px solid rgba(255,255,255,0.07)",
                              cursor: "context-menu",
                              boxShadow: isContextMsg
                                ? "0 0 0 2px rgba(99,102,241,0.4)"
                                : isMe
                                ? "0 4px 20px rgba(99,102,241,0.3)"
                                : "none",
                              transition: "box-shadow 0.15s",
                            }}
                          >
                            {msg.file_url && (
                              <div style={{ marginBottom: "8px" }}>
                                {isImageFile(msg.file_type) ? (
                                  <a href={msg.file_url} target="_blank" rel="noopener noreferrer">
                                    <img src={msg.file_url} alt={msg.file_name ?? "image"} style={{ borderRadius: "8px", maxWidth: "100%", maxHeight: "160px", objectFit: "cover", display: "block" }} />
                                  </a>
                                ) : (
                                  <a href={msg.file_url} target="_blank" rel="noopener noreferrer"
                                    style={{
                                      display: "flex", alignItems: "center", gap: "8px",
                                      padding: "8px 10px", borderRadius: "8px",
                                      background: isMe ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.06)",
                                      textDecoration: "none",
                                    }}>
                                    <FileText style={{ width: "14px", height: "14px", color: isMe ? "rgba(255,255,255,0.8)" : "#818cf8", flexShrink: 0 }} />
                                    <span style={{ fontSize: "12px", color: isMe ? "rgba(255,255,255,0.9)" : "#cbd5e1", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                      {msg.file_name ?? "File"}
                                    </span>
                                  </a>
                                )}
                              </div>
                            )}
                            {(!msg.file_url || msg.message_text !== msg.file_name) && (
                              <p style={{
                                fontSize: "13px",
                                lineHeight: "1.55",
                                color: isMe ? "#fff" : "rgba(255,255,255,0.82)",
                                margin: 0,
                                fontFamily: "'DM Sans', system-ui, sans-serif",
                              }}>
                                {msg.message_text}
                              </p>
                            )}
                          </div>
                        )}

                        <div style={{ display: "flex", alignItems: "center", gap: "5px", marginTop: "3px" }}>
                          <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.25)" }}>
                            {format(new Date(msg.created_at), "h:mm a")}
                          </span>
                          {showReceipt && status === "read" && (
                            <CheckCheck style={{ width: "12px", height: "12px", color: "#818cf8" }} />
                          )}
                          {showReceipt && status === "sent" && (
                            <Check style={{ width: "12px", height: "12px", color: "rgba(255,255,255,0.3)" }} />
                          )}
                        </div>
                      </div>

                      {/* Inline action buttons on hover */}
                      {isMe && !isEditing && (
                        <div
                          className="msg-actions"
                          style={{
                            display: "flex",
                            gap: "4px",
                            alignItems: "center",
                            marginRight: "8px",
                            opacity: 0,
                            transition: "opacity 0.15s",
                          }}
                        >
                          <button
                            onClick={() => handleCopyMessage(msg.message_text)}
                            title="Copy"
                            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "6px", padding: "4px 6px", cursor: "pointer", color: "rgba(255,255,255,0.5)", display: "flex", alignItems: "center" }}
                          >
                            <Copy style={{ width: "11px", height: "11px" }} />
                          </button>
                          <button
                            onClick={() => handleStartEdit(msg.id, msg.message_text)}
                            title="Edit"
                            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "6px", padding: "4px 6px", cursor: "pointer", color: "rgba(255,255,255,0.5)", display: "flex", alignItems: "center" }}
                          >
                            <Pencil style={{ width: "11px", height: "11px" }} />
                          </button>
                          <button
                            onClick={() => handleDeleteMessage(msg.id)}
                            title="Delete"
                            style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.15)", borderRadius: "6px", padding: "4px 6px", cursor: "pointer", color: "rgba(248,113,113,0.6)", display: "flex", alignItems: "center" }}
                          >
                            <Trash2 style={{ width: "11px", height: "11px" }} />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
            <div ref={scrollRef} />
          </div>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <MessageContextMenu
          isMe={messages.find(m => m.id === contextMenu.msgId)?.sender_id === user?.id}
          messageText={messages.find(m => m.id === contextMenu.msgId)?.message_text ?? ""}
          position={{ x: contextMenu.x, y: contextMenu.y }}
          onCopy={() => handleCopyMessage(messages.find(m => m.id === contextMenu.msgId)?.message_text ?? "")}
          onEdit={() => {
            const msg = messages.find(m => m.id === contextMenu.msgId);
            if (msg) handleStartEdit(msg.id, msg.message_text);
          }}
          onDelete={() => handleDeleteMessage(contextMenu.msgId)}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* File preview */}
      {pendingFile && (
        <div style={{ padding: "8px 20px 0", flexShrink: 0 }}>
          <div style={{
            display: "flex", alignItems: "center", gap: "8px",
            background: "rgba(99,102,241,0.08)",
            border: "1px solid rgba(99,102,241,0.2)",
            borderRadius: "10px", padding: "8px 12px",
          }}>
            {pendingFile.type.startsWith("image/")
              ? <ImageIcon style={{ width: "14px", height: "14px", color: "#818cf8", flexShrink: 0 }} />
              : <FileText style={{ width: "14px", height: "14px", color: "#818cf8", flexShrink: 0 }} />
            }
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "12px", color: "#94a3b8" }}>{pendingFile.name}</span>
            <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.3)", flexShrink: 0 }}>
              {(pendingFile.size / 1024).toFixed(0)} KB
            </span>
            <button onClick={() => setPendingFile(null)} style={{ background: "transparent", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.4)", display: "flex", alignItems: "center" }}>
              <X style={{ width: "13px", height: "13px" }} />
            </button>
          </div>
        </div>
      )}

      {/* Input */}
      <div style={{
        padding: "12px 20px 16px",
        borderTop: "1px solid rgba(255,255,255,0.05)",
        background: "rgba(10,14,26,0.6)",
        backdropFilter: "blur(12px)",
        flexShrink: 0,
      }}>
        <input type="file" ref={fileInputRef} className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f && f.size <= 20 * 1024 * 1024) setPendingFile(f); e.target.value = ""; }}
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv" />
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: "14px",
          padding: "6px 8px 6px 14px",
          transition: "border-color 0.2s",
        }}
          onFocus={() => {}}
        >
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            style={{ background: "transparent", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.3)", display: "flex", alignItems: "center", padding: "4px", borderRadius: "6px", transition: "color 0.15s" }}
            onMouseEnter={e => (e.currentTarget.style.color = "rgba(255,255,255,0.7)")}
            onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.3)")}
          >
            <Paperclip style={{ width: "16px", height: "16px" }} />
          </button>
          <input
            style={{
              flex: 1, background: "transparent", border: "none", outline: "none",
              color: "#f1f5f9", fontSize: "13px",
              padding: "6px 0",
              fontFamily: "'DM Sans', system-ui, sans-serif",
            }}
            placeholder="Type a message..."
            value={input}
            onChange={e => handleInputChange(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleSend()}
            disabled={uploading}
          />
          <button
            onClick={handleSend}
            disabled={(!input.trim() && !pendingFile) || sendMessage.isPending || uploading}
            style={{
              width: "34px", height: "34px", borderRadius: "10px",
              background: ((!input.trim() && !pendingFile) || sendMessage.isPending || uploading)
                ? "rgba(99,102,241,0.3)"
                : "linear-gradient(135deg, #6366f1, #4f46e5)",
              border: "none", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.2s",
              boxShadow: ((!input.trim() && !pendingFile) || sendMessage.isPending || uploading)
                ? "none"
                : "0 4px 12px rgba(99,102,241,0.4)",
            }}
          >
            <Send style={{ width: "14px", height: "14px", color: "#fff" }} />
          </button>
        </div>
        <p style={{ fontSize: "10px", color: "rgba(255,255,255,0.15)", marginTop: "6px", textAlign: "center", fontFamily: "'DM Sans', system-ui, sans-serif" }}>
          Right-click any message to copy, edit, or delete · Enter to send
        </p>
      </div>
    </div>
  );
}

// ─── Notifications Panel ─────────────────────────────────────────────────────

function NotificationsPanel() {
  const { notifications, notificationsLoading, unreadCount, markRead, markAllRead } = useNotifications();
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const filtered = notifications.filter(n => filter === "all" || !n.is_read);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)",
        background: "rgba(10,14,26,0.8)", flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <h3 style={{ fontSize: "14px", fontWeight: 600, color: "#f1f5f9", fontFamily: "'Bricolage Grotesque', sans-serif", margin: 0 }}>Notifications</h3>
          {unreadCount > 0 && (
            <span style={{
              background: "rgba(99,102,241,0.2)", color: "#818cf8",
              fontSize: "10px", fontWeight: 700, padding: "2px 8px",
              borderRadius: "20px", border: "1px solid rgba(99,102,241,0.3)",
            }}>
              {unreadCount} new
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          {["all", "unread"].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f as "all" | "unread")}
              style={{
                background: filter === f ? "rgba(99,102,241,0.15)" : "transparent",
                border: filter === f ? "1px solid rgba(99,102,241,0.3)" : "1px solid transparent",
                borderRadius: "6px", padding: "3px 10px",
                color: filter === f ? "#818cf8" : "rgba(255,255,255,0.4)",
                fontSize: "11px", fontWeight: 500, cursor: "pointer",
                transition: "all 0.15s",
                textTransform: "capitalize",
                fontFamily: "'DM Sans', system-ui, sans-serif",
              }}
            >
              {f}
            </button>
          ))}
          {unreadCount > 0 && (
            <button
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: "6px", padding: "3px 10px",
                color: "rgba(255,255,255,0.5)",
                fontSize: "11px", cursor: "pointer",
                display: "flex", alignItems: "center", gap: "5px",
                fontFamily: "'DM Sans', system-ui, sans-serif",
              }}
            >
              <CheckCheck style={{ width: "11px", height: "11px" }} />
              Mark all read
            </button>
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>
        {notificationsLoading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
            <Loader2 style={{ width: "20px", height: "20px", color: "#6366f1", animation: "spin 1s linear infinite" }} />
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 24px", textAlign: "center" }}>
            <div style={{
              width: "48px", height: "48px", borderRadius: "14px",
              background: "rgba(99,102,241,0.1)",
              border: "1px solid rgba(99,102,241,0.2)",
              display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "14px",
            }}>
              <Bell style={{ width: "20px", height: "20px", color: "#6366f1" }} />
            </div>
            <p style={{ fontSize: "13px", fontWeight: 600, color: "#64748b", marginBottom: "4px" }}>
              {filter === "unread" ? "No unread notifications" : "All caught up"}
            </p>
            <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.2)" }}>
              Coaching feedback, mentions, and updates will appear here.
            </p>
          </div>
        ) : (
          <div>
            {filtered.map(n => {
              const Icon = notifTypeIcons[n.type] ?? Bell;
              const colorClass = notifTypeColors[n.type] ?? notifTypeColors.system;
              return (
                <div
                  key={n.id}
                  onClick={() => !n.is_read && markRead.mutate(n.id)}
                  style={{
                    display: "flex",
                    gap: "12px",
                    padding: "14px 20px",
                    borderBottom: "1px solid rgba(255,255,255,0.04)",
                    cursor: "pointer",
                    background: !n.is_read ? "rgba(99,102,241,0.04)" : "transparent",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
                  onMouseLeave={e => (e.currentTarget.style.background = !n.is_read ? "rgba(99,102,241,0.04)" : "transparent")}
                >
                  <div className={cn("p-2 rounded-xl shrink-0 mt-0.5", colorClass)} style={{ width: "34px", height: "34px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon style={{ width: "15px", height: "15px" }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{
                      fontSize: "13px",
                      lineHeight: "1.5",
                      color: !n.is_read ? "#e2e8f0" : "rgba(255,255,255,0.45)",
                      fontWeight: !n.is_read ? 500 : 400,
                      fontFamily: "'DM Sans', system-ui, sans-serif",
                      margin: 0,
                    }}>
                      {n.message}
                    </p>
                    <p style={{ fontSize: "10px", color: "rgba(255,255,255,0.2)", marginTop: "3px" }}>
                      {format(new Date(n.created_at), "MMM d, h:mm a")}
                    </p>
                  </div>
                  {!n.is_read && (
                    <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#6366f1", flexShrink: 0, marginTop: "6px" }} />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main MessagesPage ────────────────────────────────────────────────────────

export default function MessagesPage() {
  const { user } = useAuth();
  const { team, members } = useTeam();
  const { conversations, conversationsLoading, totalUnread, refetchConversations } = useTeamMessaging(team?.id);
  const { unreadCount: notifUnreadCount } = useNotifications();
  const [selectedConvo, setSelectedConvo] = useState<string | null>(null);
  const [newConvoOpen, setNewConvoOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"messages" | "notifications">("messages");
  const [mobileView, setMobileView] = useState<"list" | "thread">("list");

  const filteredConvos = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const q = searchQuery.toLowerCase();
    return conversations.filter(c => {
      const name = getConversationName(c).toLowerCase();
      const lastMsg = c.last_message?.message_text?.toLowerCase() ?? "";
      return name.includes(q) || lastMsg.includes(q);
    });
  }, [conversations, searchQuery]);

  const handleSelectConvo = (id: string) => {
    setSelectedConvo(id);
    setMobileView("thread");
  };

  const handleBack = () => {
    setMobileView("list");
  };

  const totalBadge = totalUnread + notifUnreadCount;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=Bricolage+Grotesque:wght@600;700;800&display=swap');

        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-4px); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .msg-row:hover .msg-actions {
          opacity: 1 !important;
        }
        .convo-item:hover {
          background: rgba(255,255,255,0.03) !important;
        }
        .convo-item.active {
          background: rgba(99,102,241,0.1) !important;
          border-color: rgba(99,102,241,0.2) !important;
        }
      `}</style>

      <DashboardLayout>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            height: "calc(100vh - 4rem)",
            margin: "-24px",
            background: "rgba(6,9,18,0.98)",
            overflow: "hidden",
          }}
        >
          {/* ── Top Header Bar ── */}
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 24px",
            height: "60px",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            background: "rgba(10,14,26,0.95)",
            backdropFilter: "blur(20px)",
            flexShrink: 0,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
              <div style={{
                width: "32px", height: "32px", borderRadius: "9px",
                background: "linear-gradient(135deg, rgba(99,102,241,0.25), rgba(139,92,246,0.25))",
                border: "1px solid rgba(99,102,241,0.3)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <MessageSquare style={{ width: "15px", height: "15px", color: "#818cf8" }} />
              </div>
              <div>
                <h1 style={{ fontSize: "15px", fontWeight: 700, color: "#f1f5f9", fontFamily: "'Bricolage Grotesque', sans-serif", margin: 0, lineHeight: 1.2 }}>
                  Messages
                </h1>
                <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)", margin: 0, display: "none" }}
                  className="sm:block">
                  Team workspace communications
                </p>
              </div>
              {totalBadge > 0 && (
                <span style={{
                  background: "linear-gradient(135deg, #6366f1, #4f46e5)",
                  color: "#fff",
                  fontSize: "10px", fontWeight: 700,
                  padding: "2px 8px", borderRadius: "20px",
                  boxShadow: "0 2px 8px rgba(99,102,241,0.4)",
                }}>
                  {totalBadge}
                </span>
              )}
            </div>

            <button
              onClick={() => setNewConvoOpen(true)}
              style={{
                display: "flex", alignItems: "center", gap: "7px",
                background: "linear-gradient(135deg, #6366f1, #4f46e5)",
                border: "none", borderRadius: "9px",
                padding: "7px 14px",
                color: "#fff", fontSize: "12px", fontWeight: 600,
                cursor: "pointer",
                boxShadow: "0 4px 14px rgba(99,102,241,0.35)",
                transition: "all 0.2s",
                fontFamily: "'DM Sans', system-ui, sans-serif",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 6px 20px rgba(99,102,241,0.5)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ""; (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 14px rgba(99,102,241,0.35)"; }}
            >
              <Plus style={{ width: "13px", height: "13px" }} />
              <span>New Message</span>
            </button>
          </div>

          {/* ── Body ── */}
          <div style={{ display: "flex", flex: 1, minHeight: 0 }}>

            {/* ── Left Sidebar ── */}
            <div
              style={{
                width: "300px",
                flexShrink: 0,
                display: mobileView === "thread" ? "none" : "flex",
                flexDirection: "column",
                borderRight: "1px solid rgba(255,255,255,0.05)",
                background: "rgba(8,11,20,0.8)",
              }}
              className="md:flex"
            >
              {/* Tabs */}
              <div style={{
                display: "flex",
                padding: "10px 12px",
                gap: "4px",
                borderBottom: "1px solid rgba(255,255,255,0.05)",
                flexShrink: 0,
              }}>
                {[
                  { id: "messages" as const, label: "Chats", icon: MessageSquare, badge: totalUnread },
                  { id: "notifications" as const, label: "Alerts", icon: Bell, badge: notifUnreadCount },
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    style={{
                      flex: 1,
                      display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
                      padding: "7px 12px",
                      borderRadius: "8px",
                      background: activeTab === tab.id ? "rgba(99,102,241,0.15)" : "transparent",
                      border: activeTab === tab.id ? "1px solid rgba(99,102,241,0.25)" : "1px solid transparent",
                      color: activeTab === tab.id ? "#818cf8" : "rgba(255,255,255,0.35)",
                      fontSize: "12px", fontWeight: 600,
                      cursor: "pointer",
                      transition: "all 0.15s",
                      fontFamily: "'DM Sans', system-ui, sans-serif",
                    }}
                  >
                    <tab.icon style={{ width: "13px", height: "13px" }} />
                    {tab.label}
                    {tab.badge > 0 && (
                      <span style={{
                        background: activeTab === tab.id ? "#6366f1" : "rgba(99,102,241,0.4)",
                        color: "#fff",
                        fontSize: "9px", fontWeight: 700,
                        padding: "1px 6px", borderRadius: "10px",
                        minWidth: "16px", textAlign: "center",
                      }}>
                        {tab.badge}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {activeTab === "messages" ? (
                <>
                  {/* Search */}
                  <div style={{ padding: "10px 12px", flexShrink: 0 }}>
                    <div style={{
                      display: "flex", alignItems: "center", gap: "8px",
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.07)",
                      borderRadius: "9px", padding: "7px 12px",
                    }}>
                      <Search style={{ width: "13px", height: "13px", color: "rgba(255,255,255,0.25)", flexShrink: 0 }} />
                      <input
                        style={{
                          flex: 1, background: "transparent", border: "none", outline: "none",
                          color: "#f1f5f9", fontSize: "12px",
                          fontFamily: "'DM Sans', system-ui, sans-serif",
                        }}
                        placeholder="Search conversations..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                      />
                      {searchQuery && (
                        <button onClick={() => setSearchQuery("")} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.3)", display: "flex" }}>
                          <X style={{ width: "12px", height: "12px" }} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Conversation List */}
                  <div style={{ flex: 1, overflowY: "auto" }}>
                    {conversationsLoading ? (
                      <div style={{ display: "flex", justifyContent: "center", padding: "30px 0" }}>
                        <Loader2 style={{ width: "18px", height: "18px", color: "#6366f1", animation: "spin 1s linear infinite" }} />
                      </div>
                    ) : filteredConvos.length === 0 ? (
                      <div style={{ padding: "30px 20px", textAlign: "center" }}>
                        <MessageSquare style={{ width: "28px", height: "28px", color: "rgba(99,102,241,0.3)", margin: "0 auto 10px" }} />
                        <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.3)", fontFamily: "'DM Sans', system-ui, sans-serif" }}>
                          {searchQuery ? "No results found" : "No conversations yet"}
                        </p>
                      </div>
                    ) : (
                      <div style={{ padding: "6px 8px" }}>
                        {filteredConvos.map(c => {
                          const name = getConversationName(c);
                          const isSelected = selectedConvo === c.id;
                          const initials = getConversationInitials(c);
                          return (
                            <button
                              key={c.id}
                              onClick={() => handleSelectConvo(c.id)}
                              className={`convo-item ${isSelected ? "active" : ""}`}
                              style={{
                                width: "100%",
                                display: "flex", alignItems: "center", gap: "10px",
                                padding: "10px 10px",
                                borderRadius: "10px",
                                border: isSelected ? "1px solid rgba(99,102,241,0.2)" : "1px solid transparent",
                                background: isSelected ? "rgba(99,102,241,0.1)" : "transparent",
                                cursor: "pointer",
                                textAlign: "left",
                                transition: "all 0.15s",
                                marginBottom: "2px",
                              }}
                            >
                              <div style={{ position: "relative", flexShrink: 0 }}>
                                <div style={{
                                  width: "36px", height: "36px", borderRadius: "10px",
                                  background: c.is_group
                                    ? "linear-gradient(135deg, rgba(139,92,246,0.25), rgba(99,102,241,0.25))"
                                    : "linear-gradient(135deg, rgba(99,102,241,0.2), rgba(79,70,229,0.2))",
                                  border: `1px solid ${c.is_group ? "rgba(139,92,246,0.2)" : "rgba(99,102,241,0.2)"}`,
                                  display: "flex", alignItems: "center", justifyContent: "center",
                                  fontSize: "12px", fontWeight: 700,
                                  color: c.is_group ? "#a78bfa" : "#818cf8",
                                }}>
                                  {c.is_group ? <Users style={{ width: "15px", height: "15px" }} /> : initials}
                                </div>
                                {c.unread_count > 0 && (
                                  <div style={{
                                    position: "absolute", top: "-3px", right: "-3px",
                                    width: "16px", height: "16px",
                                    background: "linear-gradient(135deg, #6366f1, #4f46e5)",
                                    borderRadius: "50%",
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    fontSize: "9px", fontWeight: 700, color: "#fff",
                                    boxShadow: "0 2px 6px rgba(99,102,241,0.5)",
                                  }}>
                                    {c.unread_count > 9 ? "9+" : c.unread_count}
                                  </div>
                                )}
                              </div>

                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "4px" }}>
                                  <p style={{
                                    fontSize: "13px",
                                    fontWeight: c.unread_count > 0 ? 600 : 500,
                                    color: c.unread_count > 0 ? "#f1f5f9" : "rgba(255,255,255,0.7)",
                                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                    fontFamily: "'DM Sans', system-ui, sans-serif",
                                    margin: 0,
                                  }}>
                                    {name}
                                  </p>
                                  {c.last_message && (
                                    <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.25)", flexShrink: 0 }}>
                                      {formatTime(c.last_message.created_at)}
                                    </span>
                                  )}
                                </div>
                                {c.last_message && (
                                  <p style={{
                                    fontSize: "11px",
                                    color: c.unread_count > 0 ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.25)",
                                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                    marginTop: "1px",
                                    fontFamily: "'DM Sans', system-ui, sans-serif",
                                    fontWeight: c.unread_count > 0 ? 500 : 400,
                                  }}>
                                    {c.last_message.message_text}
                                  </p>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <NotificationsPanel />
              )}
            </div>

            {/* ── Right Panel ── */}
            <div
              style={{
                flex: 1,
                display: (mobileView === "list" && !selectedConvo) ? "none" : "flex",
                flexDirection: "column",
                minWidth: 0,
                background: "rgba(6,9,18,0.7)",
              }}
              className="md:flex"
            >
              {activeTab === "messages" ? (
                selectedConvo ? (
                  <ChatThread
                    conversationId={selectedConvo}
                    conversations={conversations}
                    onBack={handleBack}
                  />
                ) : (
                  <div style={{
                    flex: 1,
                    display: "flex", flexDirection: "column",
                    alignItems: "center", justifyContent: "center",
                    textAlign: "center", padding: "40px",
                  }}>
                    <div style={{
                      width: "72px", height: "72px", borderRadius: "20px",
                      background: "linear-gradient(135deg, rgba(99,102,241,0.12), rgba(139,92,246,0.12))",
                      border: "1px solid rgba(99,102,241,0.15)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      marginBottom: "20px",
                      boxShadow: "0 0 40px rgba(99,102,241,0.08)",
                    }}>
                      <MessageSquare style={{ width: "28px", height: "28px", color: "#6366f1" }} />
                    </div>
                    <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#94a3b8", fontFamily: "'Bricolage Grotesque', sans-serif", marginBottom: "8px" }}>
                      Select a conversation
                    </h3>
                    <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.25)", maxWidth: "280px", lineHeight: 1.6, fontFamily: "'DM Sans', system-ui, sans-serif", marginBottom: "24px" }}>
                      Choose a thread from the sidebar or start a new conversation with your team.
                    </p>
                    <button
                      onClick={() => setNewConvoOpen(true)}
                      style={{
                        display: "flex", alignItems: "center", gap: "8px",
                        background: "linear-gradient(135deg, #6366f1, #4f46e5)",
                        border: "none", borderRadius: "10px",
                        padding: "10px 20px",
                        color: "#fff", fontSize: "13px", fontWeight: 600,
                        cursor: "pointer",
                        boxShadow: "0 4px 16px rgba(99,102,241,0.35)",
                        fontFamily: "'DM Sans', system-ui, sans-serif",
                      }}
                    >
                      <Plus style={{ width: "15px", height: "15px" }} />
                      New Message
                    </button>
                  </div>
                )
              ) : (
                <div style={{ flex: 1, overflowY: "hidden" }}>
                  <NotificationsPanel />
                </div>
              )}
            </div>
          </div>
        </div>

        {team && (
          <NewConversationDialog
            open={newConvoOpen}
            onClose={() => setNewConvoOpen(false)}
            members={members}
            currentUserId={user?.id ?? ""}
            teamId={team.id}
            conversations={conversations}
            refetchConversations={refetchConversations}
            onCreated={id => {
              setNewConvoOpen(false);
              setActiveTab("messages");
              handleSelectConvo(id);
            }}
          />
        )}
      </DashboardLayout>
    </>
  );
}
