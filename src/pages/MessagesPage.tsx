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
  AtSign, AlertCircle, ArrowLeft
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
  comment: "bg-blue-500/10 text-blue-400",
  coaching: "bg-emerald-500/10 text-emerald-400",
  mention: "bg-amber-500/10 text-amber-400",
  system: "bg-muted text-muted-foreground",
};

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
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>New Conversation</DialogTitle>
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
                className={cn("flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors",
                  checked ? "bg-secondary/50" : "hover:bg-secondary/30")}>
                <Checkbox checked={checked} className="pointer-events-none" />
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">
                    {getInitials(m.profile?.full_name)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-medium">{name}</p>
                  <p className="text-xs text-muted-foreground capitalize">{m.role}</p>
                </div>
              </div>
            );
          })}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => { setSelectedIds([]); onClose(); }}>Cancel</Button>
          <Button size="sm" onClick={handleStart} disabled={!selectedIds.length || startConversation.isPending}>
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const myName = user?.user_metadata?.full_name || user?.email || "You";

  const convo = conversations.find(c => c.id === conversationId);
  const chatName = convo ? getConversationName(convo) : "Chat";
  const isGroup = convo?.is_group ?? false;

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

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
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-border bg-card/80 shrink-0">
        {onBack && (
          <Button variant="ghost" size="icon" className="h-8 w-8 md:hidden" onClick={onBack}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
        )}
        <Avatar className="h-9 w-9 shrink-0">
          <AvatarFallback className={cn("text-xs font-bold",
            isGroup ? "bg-accent/20 text-accent-foreground" : "bg-primary/20 text-primary")}>
            {isGroup ? <Users className="w-4 h-4" /> : (convo ? getConversationInitials(convo) : "?")}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="font-semibold text-sm truncate">{chatName}</p>
          {isGroup && (
            <p className="text-[11px] text-muted-foreground">{(convo?.participants.length ?? 0) + 1} members</p>
          )}
        </div>
        {typingUsers.length > 0 && (
          <p className="ml-auto text-xs text-muted-foreground italic animate-pulse">
            {typingUsers.map(u => u.name.split(" ")[0]).join(", ")} typing…
          </p>
        )}
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 px-5 py-4">
        {messagesLoading ? (
          <div className="flex justify-center py-8">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-3">
              <MessageSquare className="w-5 h-5 text-primary" />
            </div>
            <p className="text-sm font-medium">No messages yet</p>
            <p className="text-xs text-muted-foreground mt-1">Send the first message to start the conversation.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {grouped.map(group => (
              <div key={group.label}>
                <div className="flex items-center gap-3 my-3">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider px-2">{group.label}</span>
                  <div className="flex-1 h-px bg-border" />
                </div>
                <div className="space-y-1">
                  {group.msgs.map((msg, idx) => {
                    const isMe = msg.sender_id === user?.id;
                    const status = getReadStatus(msg.created_at, msg.sender_id, user?.id ?? "", readReceipts);
                    const nextMsg = group.msgs[idx + 1];
                    const showReceipt = isMe && (!nextMsg || nextMsg.sender_id !== user?.id);
                    const prevMsg = group.msgs[idx - 1];
                    const sameSenderAsPrev = prevMsg?.sender_id === msg.sender_id;

                    return (
                      <div key={msg.id} className={cn("flex gap-2.5", isMe ? "justify-end" : "justify-start", sameSenderAsPrev ? "mt-0.5" : "mt-3")}>
                        {!isMe && !sameSenderAsPrev && (
                          <Avatar className="h-7 w-7 shrink-0 mt-0.5">
                            <AvatarFallback className="bg-secondary text-foreground text-[10px] font-bold">
                              {getInitials(msg.sender?.full_name || msg.sender?.email)}
                            </AvatarFallback>
                          </Avatar>
                        )}
                        {!isMe && sameSenderAsPrev && <div className="w-7 shrink-0" />}
                        <div className={cn("max-w-[72%]", isMe ? "items-end" : "items-start", "flex flex-col gap-0.5")}>
                          {!isMe && !sameSenderAsPrev && (
                            <p className="text-[10px] font-medium text-muted-foreground ml-1">
                              {msg.sender?.full_name || msg.sender?.email || "Unknown"}
                            </p>
                          )}
                          <div className={cn(
                            "rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
                            isMe
                              ? "bg-primary text-primary-foreground rounded-br-sm"
                              : "bg-secondary text-foreground rounded-bl-sm"
                          )}>
                            {msg.file_url && (
                              <div className="mb-1.5">
                                {isImageFile(msg.file_type) ? (
                                  <a href={msg.file_url} target="_blank" rel="noopener noreferrer">
                                    <img src={msg.file_url} alt={msg.file_name ?? "image"} className="rounded-lg max-w-full max-h-40 object-cover" />
                                  </a>
                                ) : (
                                  <a href={msg.file_url} target="_blank" rel="noopener noreferrer"
                                    className={cn("flex items-center gap-2 p-2 rounded-lg text-xs", isMe ? "bg-primary-foreground/10" : "bg-background/50")}>
                                    <FileText className="w-3.5 h-3.5 shrink-0" />
                                    <span className="truncate">{msg.file_name ?? "File"}</span>
                                  </a>
                                )}
                              </div>
                            )}
                            {(!msg.file_url || msg.message_text !== msg.file_name) && msg.message_text}
                          </div>
                          <div className={cn("flex items-center gap-1", isMe ? "justify-end" : "")}>
                            <span className="text-[10px] text-muted-foreground">{format(new Date(msg.created_at), "h:mm a")}</span>
                            {showReceipt && status === "read" && <CheckCheck className="w-3 h-3 text-primary" />}
                            {showReceipt && status === "sent" && <Check className="w-3 h-3 text-muted-foreground" />}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            <div ref={scrollRef} />
          </div>
        )}
      </ScrollArea>

      {/* File preview */}
      {pendingFile && (
        <div className="px-5 pt-2 shrink-0">
          <div className="flex items-center gap-2 bg-secondary/60 rounded-xl p-2.5 text-sm">
            {pendingFile.type.startsWith("image/") ? <ImageIcon className="w-4 h-4 text-primary shrink-0" /> : <FileText className="w-4 h-4 text-primary shrink-0" />}
            <span className="truncate flex-1 text-xs">{pendingFile.name}</span>
            <span className="text-[10px] text-muted-foreground shrink-0">{(pendingFile.size / 1024).toFixed(0)} KB</span>
            <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setPendingFile(null)}>
              <X className="w-3 h-3" />
            </Button>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="px-5 py-3.5 border-t border-border bg-card/50 shrink-0">
        <input type="file" ref={fileInputRef} className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f && f.size <= 20 * 1024 * 1024) setPendingFile(f); e.target.value = ""; }} accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv" />
        <div className="flex items-center gap-2 bg-secondary/40 rounded-2xl px-3 py-1.5 border border-border/60 focus-within:border-primary/40 transition-colors">
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            <Paperclip className="w-4 h-4" />
          </Button>
          <input
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60 py-1"
            placeholder="Write a message..."
            value={input}
            onChange={e => handleInputChange(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleSend()}
            disabled={uploading}
          />
          <Button size="icon" className="h-8 w-8 shrink-0 rounded-xl"
            onClick={handleSend}
            disabled={(!input.trim() && !pendingFile) || sendMessage.isPending || uploading}>
            <Send className="w-3.5 h-3.5" />
          </Button>
        </div>
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
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <h3 className="font-semibold text-sm">Notifications</h3>
          {unreadCount > 0 && (
            <Badge className="bg-primary/15 text-primary border-0 text-[10px] h-4 px-1.5">{unreadCount} new</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className={cn("h-7 text-xs", filter === "all" ? "text-foreground" : "text-muted-foreground")} onClick={() => setFilter("all")}>All</Button>
          <Button variant="ghost" size="sm" className={cn("h-7 text-xs", filter === "unread" ? "text-foreground" : "text-muted-foreground")} onClick={() => setFilter("unread")}>Unread</Button>
          {unreadCount > 0 && (
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={() => markAllRead.mutate()} disabled={markAllRead.isPending}>
              <CheckCheck className="w-3 h-3" />
              Mark all read
            </Button>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1">
        {notificationsLoading ? (
          <div className="flex justify-center py-8"><div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-6">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-3">
              <Bell className="w-5 h-5 text-primary" />
            </div>
            <p className="text-sm font-medium">{filter === "unread" ? "No unread notifications" : "You're all caught up"}</p>
            <p className="text-xs text-muted-foreground mt-1">Notifications from coaching feedback, team mentions, and performance updates will appear here.</p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {filtered.map(n => {
              const Icon = notifTypeIcons[n.type] ?? Bell;
              const colorClass = notifTypeColors[n.type] ?? notifTypeColors.system;
              return (
                <div key={n.id}
                  onClick={() => !n.is_read && markRead.mutate(n.id)}
                  className={cn("flex gap-3.5 p-4 transition-colors cursor-pointer",
                    !n.is_read ? "bg-primary/[0.04] hover:bg-primary/[0.07]" : "hover:bg-secondary/30")}>
                  <div className={cn("p-2 rounded-xl shrink-0 mt-0.5", colorClass)}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-sm leading-snug", !n.is_read ? "font-medium text-foreground" : "text-muted-foreground")}>{n.message}</p>
                    <p className="text-[10px] text-muted-foreground/70 mt-1">{format(new Date(n.created_at), "MMM d, h:mm a")}</p>
                  </div>
                  {!n.is_read && <div className="w-2 h-2 rounded-full bg-primary shrink-0 mt-2" />}
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>
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
    <DashboardLayout>
      <div className="flex flex-col h-[calc(100vh-6rem)] md:h-[calc(100vh-4rem)] -m-4 md:-m-6">

        {/* ── Top bar ── */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-card/60 backdrop-blur-sm shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
              <MessageSquare className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h1 className="text-base font-semibold">Messages</h1>
              <p className="text-[11px] text-muted-foreground hidden sm:block">Team conversations & notifications</p>
            </div>
            {totalBadge > 0 && (
              <Badge className="bg-primary text-primary-foreground text-[10px] h-5 px-1.5 ml-1">{totalBadge}</Badge>
            )}
          </div>
          <Button size="sm" className="gap-2 h-8" onClick={() => setNewConvoOpen(true)}>
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline text-xs">New Message</span>
          </Button>
        </div>

        {/* ── Body ── */}
        <div className="flex flex-1 min-h-0">

          {/* ── Left sidebar ── */}
          <div className={cn(
            "flex flex-col w-full md:w-72 lg:w-80 border-r border-border bg-card/40 shrink-0",
            mobileView === "thread" ? "hidden md:flex" : "flex"
          )}>
            {/* Tab switcher */}
            <div className="flex border-b border-border shrink-0">
              <button
                onClick={() => setActiveTab("messages")}
                className={cn("flex-1 flex items-center justify-center gap-2 py-3 text-xs font-medium transition-colors",
                  activeTab === "messages" ? "text-foreground border-b-2 border-primary -mb-px" : "text-muted-foreground hover:text-foreground")}>
                <MessageSquare className="w-3.5 h-3.5" />
                Messages
                {totalUnread > 0 && <Badge className="bg-primary/15 text-primary border-0 text-[10px] h-4 px-1">{totalUnread}</Badge>}
              </button>
              <button
                onClick={() => setActiveTab("notifications")}
                className={cn("flex-1 flex items-center justify-center gap-2 py-3 text-xs font-medium transition-colors",
                  activeTab === "notifications" ? "text-foreground border-b-2 border-primary -mb-px" : "text-muted-foreground hover:text-foreground")}>
                <Bell className="w-3.5 h-3.5" />
                Alerts
                {notifUnreadCount > 0 && <Badge className="bg-primary/15 text-primary border-0 text-[10px] h-4 px-1">{notifUnreadCount}</Badge>}
              </button>
            </div>

            {activeTab === "messages" ? (
              <>
                {/* Search */}
                <div className="px-3 py-2.5 border-b border-border/50 shrink-0">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <input
                      className="w-full h-8 bg-secondary/50 rounded-lg pl-8 pr-3 text-xs outline-none placeholder:text-muted-foreground/60 focus:bg-secondary/80 transition-colors"
                      placeholder="Search conversations..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                    />
                  </div>
                </div>

                {/* Conversation list */}
                <ScrollArea className="flex-1">
                  {conversationsLoading ? (
                    <div className="flex justify-center py-8"><div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
                  ) : filteredConvos.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-2">
                        <MessageSquare className="w-4 h-4 text-primary" />
                      </div>
                      <p className="text-xs font-medium">{searchQuery ? "No results" : "No conversations"}</p>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        {searchQuery ? "Try a different search term." : "Start a new conversation with your team."}
                      </p>
                    </div>
                  ) : (
                    <div className="py-1">
                      {filteredConvos.map(c => {
                        const name = getConversationName(c);
                        const isSelected = selectedConvo === c.id;
                        const initials = getConversationInitials(c);
                        return (
                          <button
                            key={c.id}
                            onClick={() => handleSelectConvo(c.id)}
                            className={cn(
                              "w-full flex items-center gap-3 px-3 py-3 transition-colors text-left",
                              isSelected ? "bg-primary/10" : c.unread_count > 0 ? "hover:bg-secondary/50" : "hover:bg-secondary/30"
                            )}
                          >
                            <div className="relative shrink-0">
                              <Avatar className="h-9 w-9">
                                <AvatarFallback className={cn("text-xs font-bold",
                                  c.is_group ? "bg-accent/20 text-accent-foreground" : "bg-primary/20 text-primary")}>
                                  {c.is_group ? <Users className="w-4 h-4" /> : initials}
                                </AvatarFallback>
                              </Avatar>
                              {c.unread_count > 0 && (
                                <div className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-primary rounded-full flex items-center justify-center">
                                  <span className="text-[9px] font-bold text-primary-foreground">{c.unread_count}</span>
                                </div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-1">
                                <p className={cn("text-xs truncate", c.unread_count > 0 ? "font-semibold text-foreground" : "font-medium text-foreground/90")}>{name}</p>
                                {c.last_message && (
                                  <span className="text-[10px] text-muted-foreground shrink-0">{formatTime(c.last_message.created_at)}</span>
                                )}
                              </div>
                              {c.last_message && (
                                <p className={cn("text-[11px] truncate mt-0.5", c.unread_count > 0 ? "text-foreground/70 font-medium" : "text-muted-foreground")}>
                                  {c.last_message.message_text}
                                </p>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </ScrollArea>
              </>
            ) : (
              <NotificationsPanel />
            )}
          </div>

          {/* ── Right panel ── */}
          <div className={cn(
            "flex-1 flex flex-col min-w-0 bg-background",
            mobileView === "list" ? "hidden md:flex" : "flex"
          )}>
            {activeTab === "messages" ? (
              selectedConvo ? (
                <ChatThread
                  conversationId={selectedConvo}
                  conversations={conversations}
                  onBack={handleBack}
                />
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                  <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                    <MessageSquare className="w-7 h-7 text-primary" />
                  </div>
                  <h3 className="text-base font-semibold mb-1">Select a conversation</h3>
                  <p className="text-sm text-muted-foreground max-w-xs">Choose a conversation from the left panel to view messages, or start a new one with your team.</p>
                  <Button className="mt-5 gap-2" size="sm" onClick={() => setNewConvoOpen(true)}>
                    <Plus className="w-3.5 h-3.5" />
                    New Message
                  </Button>
                </div>
              )
            ) : (
              <div className="flex-1 min-h-0 overflow-hidden">
                <NotificationsPanel />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* New conversation dialog */}
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
  );
}
