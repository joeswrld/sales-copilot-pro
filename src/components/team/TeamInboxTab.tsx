import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Send, MessageSquare, Plus, ArrowLeft, Users, Paperclip, FileText, Image as ImageIcon, X, CheckCheck, Check } from "lucide-react";
import { useTeamMessaging, useConversationMessages, getConversationName, getConversationInitials } from "@/hooks/useTeamMessaging";
import { useTypingIndicator } from "@/hooks/useTypingIndicator";
import type { Conversation, ReadReceipt } from "@/hooks/useTeamMessaging";
import type { TeamMember } from "@/hooks/useTeam";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/components/ui/use-toast";
import { format } from "date-fns";

interface Props {
  teamId: string;
  members: TeamMember[];
}

export default function TeamInboxTab({ teamId, members }: Props) {
  const { user } = useAuth();
  const { conversations, conversationsLoading, refetchConversations } = useTeamMessaging(teamId);
  const [selectedConvo, setSelectedConvo] = useState<string | null>(null);
  const [newConvoOpen, setNewConvoOpen] = useState(false);
  const [showConvoList, setShowConvoList] = useState(true);

  const handleSelectConvo = (id: string) => {
    setSelectedConvo(id);
    setShowConvoList(false);
  };

  const handleBack = () => {
    setShowConvoList(true);
    setSelectedConvo(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold font-display">Inbox</h2>
        <Button size="sm" onClick={() => setNewConvoOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">New Message</span>
        </Button>
      </div>

      <div className="grid md:grid-cols-3 gap-4 min-h-[500px]">
        {/* Conversations List */}
        <Card className={`bg-card border-border md:col-span-1 ${!showConvoList ? "hidden md:block" : ""}`}>
          <CardHeader className="pb-2 px-3 pt-3">
            <CardTitle className="text-xs font-display text-muted-foreground uppercase tracking-wider">Conversations</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[450px]">
              {conversationsLoading ? (
                <div className="p-4 text-center text-sm text-muted-foreground">Loading...</div>
              ) : conversations.length === 0 ? (
                <div className="p-6 text-center">
                  <MessageSquare className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No conversations yet</p>
                  <p className="text-xs text-muted-foreground mt-1">Start a new message</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {conversations.map((c) => {
                    const name = getConversationName(c);
                    const initials = getConversationInitials(c);
                    const isSelected = selectedConvo === c.id;
                    return (
                      <div
                        key={c.id}
                        className={`flex items-center gap-3 p-3 cursor-pointer transition-colors ${isSelected ? "bg-secondary/40" : "hover:bg-secondary/20"}`}
                        onClick={() => handleSelectConvo(c.id)}
                      >
                        <div className="relative">
                          <Avatar className="h-9 w-9">
                            <AvatarFallback className={`text-xs font-bold ${c.is_group ? "bg-accent/20 text-accent-foreground" : "bg-primary/20 text-primary"}`}>
                              {c.is_group ? <Users className="w-4 h-4" /> : initials}
                            </AvatarFallback>
                          </Avatar>
                          {c.unread_count > 0 && (
                            <div className="absolute -top-1 -right-1 w-4 h-4 bg-primary rounded-full flex items-center justify-center">
                              <span className="text-[9px] font-bold text-primary-foreground">{c.unread_count}</span>
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <p className={`text-sm truncate ${c.unread_count > 0 ? "font-bold" : "font-medium"}`}>{name}</p>
                            {c.last_message && (
                              <span className="text-[10px] text-muted-foreground shrink-0">
                                {format(new Date(c.last_message.created_at), "MMM d")}
                              </span>
                            )}
                          </div>
                          {c.last_message && (
                            <p className="text-xs text-muted-foreground truncate mt-0.5">{c.last_message.message_text}</p>
                          )}
                          {c.is_group && (
                            <Badge variant="secondary" className="text-[9px] h-3.5 px-1 mt-0.5">Group</Badge>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Chat Area */}
        <Card className={`bg-card border-border md:col-span-2 flex flex-col ${showConvoList && !selectedConvo ? "hidden md:flex" : ""}`}>
          {selectedConvo ? (
            <ChatArea
              conversationId={selectedConvo}
              conversations={conversations}
              onBack={handleBack}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <MessageSquare className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Select a conversation to start messaging</p>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* New Conversation Dialog */}
      <NewConversationDialog
        open={newConvoOpen}
        onClose={() => setNewConvoOpen(false)}
        members={members}
        currentUserId={user?.id ?? ""}
        teamId={teamId}
        conversations={conversations}
        refetchConversations={refetchConversations}
        onConversationCreated={(id) => {
          setNewConvoOpen(false);
          handleSelectConvo(id);
        }}
      />
    </div>
  );
}

function getReadStatus(
  msgCreatedAt: string,
  senderId: string,
  currentUserId: string,
  readReceipts: ReadReceipt[]
): "none" | "sent" | "read" {
  if (senderId !== currentUserId) return "none";
  const readBy = readReceipts.filter(
    (r) => r.last_read_at && new Date(r.last_read_at) >= new Date(msgCreatedAt)
  );
  if (readBy.length > 0) return "read";
  return "sent";
}

function isImageFile(type: string | null | undefined): boolean {
  if (!type) return false;
  return type.startsWith("image/");
}

function ChatArea({ conversationId, conversations, onBack }: {
  conversationId: string;
  conversations: Conversation[];
  onBack: () => void;
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

  const convo = conversations.find(c => c.id === conversationId);
  const chatName = convo ? getConversationName(convo) : "Chat";
  const isGroup = convo?.is_group ?? false;

  const myName = user?.user_metadata?.full_name || user?.email || "You";

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const handleInputChange = (value: string) => {
    setInput(value);
    if (value.trim()) {
      sendTyping(myName);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => sendStopTyping(), 2000);
    } else {
      sendStopTyping();
    }
  };

  const uploadFile = async (file: File): Promise<{ url: string; name: string; type: string }> => {
    const ext = file.name.split(".").pop() ?? "bin";
    const path = `${conversationId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage
      .from("team-attachments")
      .upload(path, file, { contentType: file.type });
    if (error) throw error;
    const { data: urlData } = supabase.storage.from("team-attachments").getPublicUrl(path);
    return { url: urlData.publicUrl, name: file.name, type: file.type };
  };

  const handleSend = async () => {
    const hasText = input.trim().length > 0;
    const hasFile = !!pendingFile;
    if (!hasText && !hasFile) return;

    setUploading(true);
    try {
      let fileData: { url: string; name: string; type: string } | undefined;
      if (pendingFile) {
        fileData = await uploadFile(pendingFile);
      }
      sendMessage.mutate({
        text: hasText ? input.trim() : (pendingFile?.name ?? "Attachment"),
        file_url: fileData?.url,
        file_name: fileData?.name,
        file_type: fileData?.type,
      });
      setInput("");
      setPendingFile(null);
      sendStopTyping();
    } catch (err) {
      console.error("Failed to send:", err);
    } finally {
      setUploading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 20 * 1024 * 1024) {
        alert("File must be under 20MB");
        return;
      }
      setPendingFile(file);
    }
    e.target.value = "";
  };

  return (
    <>
      {/* Chat Header */}
      <div className="flex items-center gap-3 p-3 border-b border-border shrink-0">
        <Button variant="ghost" size="icon" className="md:hidden h-8 w-8" onClick={onBack}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <Avatar className="h-8 w-8">
          <AvatarFallback className={`text-xs font-bold ${isGroup ? "bg-accent/20 text-accent-foreground" : "bg-primary/20 text-primary"}`}>
            {isGroup ? <Users className="w-3.5 h-3.5" /> : (convo ? getConversationInitials(convo) : "?")}
          </AvatarFallback>
        </Avatar>
        <div>
          <p className="font-medium text-sm">{chatName}</p>
          {isGroup && (
            <p className="text-[10px] text-muted-foreground">{(convo?.participants.length ?? 0) + 1} members</p>
          )}
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-3">
        <div className="space-y-3">
          {messagesLoading ? (
            <p className="text-center text-sm text-muted-foreground py-8">Loading messages...</p>
          ) : messages.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">No messages yet. Say hello!</p>
          ) : (
            messages.map((msg, idx) => {
              const isMe = msg.sender_id === user?.id;
              const status = getReadStatus(msg.created_at, msg.sender_id, user?.id ?? "", readReceipts);
              // Show read receipt only on last consecutive message from me
              const nextMsg = messages[idx + 1];
              const showReceipt = isMe && (!nextMsg || nextMsg.sender_id !== user?.id);

              return (
                <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] rounded-xl px-3 py-2 ${isMe ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>
                    {!isMe && (
                      <p className="text-[10px] font-medium text-muted-foreground mb-0.5">
                        {msg.sender?.full_name || msg.sender?.email || "Unknown"}
                      </p>
                    )}

                    {/* File attachment */}
                    {msg.file_url && (
                      <div className="mb-1.5">
                        {isImageFile(msg.file_type) ? (
                          <a href={msg.file_url} target="_blank" rel="noopener noreferrer">
                            <img
                              src={msg.file_url}
                              alt={msg.file_name ?? "Image"}
                              className="rounded-lg max-w-full max-h-48 object-cover cursor-pointer"
                              loading="lazy"
                            />
                          </a>
                        ) : (
                          <a
                            href={msg.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`flex items-center gap-2 p-2 rounded-lg ${isMe ? "bg-primary-foreground/10" : "bg-background/50"}`}
                          >
                            <FileText className="w-4 h-4 shrink-0" />
                            <span className="text-xs truncate">{msg.file_name ?? "File"}</span>
                          </a>
                        )}
                      </div>
                    )}

                    {/* Only show text if it's not just the file name */}
                    {(!msg.file_url || msg.message_text !== msg.file_name) && (
                      <p className="text-sm">{msg.message_text}</p>
                    )}

                    <div className={`flex items-center gap-1 mt-1 ${isMe ? "justify-end" : ""}`}>
                      <p className={`text-[10px] ${isMe ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                        {format(new Date(msg.created_at), "h:mm a")}
                      </p>
                      {showReceipt && status === "read" && (
                        <CheckCheck className={`w-3 h-3 ${isMe ? "text-primary-foreground/80" : "text-muted-foreground"}`} />
                      )}
                      {showReceipt && status === "sent" && (
                        <Check className={`w-3 h-3 ${isMe ? "text-primary-foreground/40" : "text-muted-foreground"}`} />
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      {/* Typing indicator */}
      {typingUsers.length > 0 && (
        <div className="px-3 pb-1 shrink-0">
          <p className="text-xs text-muted-foreground italic animate-pulse">
            {typingUsers.map(u => u.name).join(", ")} {typingUsers.length === 1 ? "is" : "are"} typing…
          </p>
        </div>
      )}

      {/* Pending file preview */}
      {pendingFile && (
        <div className="px-3 pt-2 shrink-0">
          <div className="flex items-center gap-2 bg-secondary/50 rounded-lg p-2 text-sm">
            {pendingFile.type.startsWith("image/") ? (
              <ImageIcon className="w-4 h-4 text-primary shrink-0" />
            ) : (
              <FileText className="w-4 h-4 text-primary shrink-0" />
            )}
            <span className="truncate flex-1">{pendingFile.name}</span>
            <span className="text-xs text-muted-foreground shrink-0">
              {(pendingFile.size / 1024).toFixed(0)} KB
            </span>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setPendingFile(null)}>
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="p-3 border-t border-border shrink-0">
        <div className="flex gap-2">
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            onChange={handleFileSelect}
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
          />
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            <Paperclip className="w-4 h-4" />
          </Button>
          <Input
            placeholder="Type a message..."
            value={input}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            className="flex-1"
            disabled={uploading}
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={(!input.trim() && !pendingFile) || sendMessage.isPending || uploading}
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </>
  );
}

function NewConversationDialog({ open, onClose, members, currentUserId, teamId, conversations, refetchConversations, onConversationCreated }: {
  open: boolean;
  onClose: () => void;
  members: TeamMember[];
  currentUserId: string;
  teamId: string;
  conversations: Conversation[];
  refetchConversations: () => Promise<unknown>;
  onConversationCreated: (id: string) => void;
}) {
  const { startConversation } = useConversationMessages(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const otherMembers = members.filter(m => m.user_id !== currentUserId && m.status === "active");

  const toggleMember = (userId: string) => {
    setSelectedIds(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const handleStart = async () => {
    if (selectedIds.length === 0) return;

    try {
      // For 1-on-1, check if conversation already exists
      if (selectedIds.length === 1) {
        const existing = conversations.find(c =>
          !c.is_group && c.participants.length === 1 && c.participants.some(p => p.user_id === selectedIds[0])
        );
        if (existing) {
          setSelectedIds([]);
          onConversationCreated(existing.id);
          return;
        }
      }

      const convoId = await startConversation.mutateAsync({ teamId, memberIds: selectedIds });
      await refetchConversations();
      setSelectedIds([]);
      onConversationCreated(convoId);
      toast({ title: "Conversation started" });
    } catch (error) {
      toast({
        title: "Could not start chat",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleClose = () => {
    setSelectedIds([]);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>New Conversation</DialogTitle>
        </DialogHeader>
        {selectedIds.length > 1 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
            <Users className="w-3.5 h-3.5" />
            <span>Group chat with {selectedIds.length} members</span>
          </div>
        )}
        <div className="space-y-1 max-h-[300px] overflow-y-auto">
          {otherMembers.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4 text-center">No other team members available.</p>
          ) : (
            otherMembers.map((m) => {
              const name = m.profile?.full_name || m.invited_email || "Unknown";
              const initial = name[0]?.toUpperCase() || "?";
              const isChecked = selectedIds.includes(m.user_id);
              return (
                <div
                  key={m.id}
                  className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors ${isChecked ? "bg-secondary/50" : "hover:bg-secondary/30"}`}
                  onClick={() => toggleMember(m.user_id)}
                >
                  <Checkbox checked={isChecked} className="pointer-events-none" />
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">{initial}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-medium">{name}</p>
                    <p className="text-xs text-muted-foreground capitalize">{m.role}</p>
                  </div>
                </div>
              );
            })
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={handleClose}>Cancel</Button>
          <Button size="sm" onClick={handleStart} disabled={selectedIds.length === 0 || startConversation.isPending}>
            {selectedIds.length > 1 ? "Create Group" : "Start Chat"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
