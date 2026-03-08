import { useState, useRef, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, MessageSquare, Plus, ArrowLeft } from "lucide-react";
import { useTeamMessaging, useConversationMessages } from "@/hooks/useTeamMessaging";
import { useTypingIndicator } from "@/hooks/useTypingIndicator";
import type { Conversation } from "@/hooks/useTeamMessaging";
import type { TeamMember } from "@/hooks/useTeam";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { format } from "date-fns";

interface Props {
  teamId: string;
  members: TeamMember[];
}

export default function TeamInboxTab({ teamId, members }: Props) {
  const { user } = useAuth();
  const { conversations, conversationsLoading } = useTeamMessaging(teamId);
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
                    const otherName = c.participants[0]?.full_name || c.participants[0]?.email || "Unknown";
                    const initial = otherName[0]?.toUpperCase() || "?";
                    const isSelected = selectedConvo === c.id;
                    return (
                      <div
                        key={c.id}
                        className={`flex items-center gap-3 p-3 cursor-pointer transition-colors ${isSelected ? "bg-secondary/40" : "hover:bg-secondary/20"}`}
                        onClick={() => handleSelectConvo(c.id)}
                      >
                        <div className="relative">
                          <Avatar className="h-9 w-9">
                            <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">{initial}</AvatarFallback>
                          </Avatar>
                          {c.unread_count > 0 && (
                            <div className="absolute -top-1 -right-1 w-4 h-4 bg-primary rounded-full flex items-center justify-center">
                              <span className="text-[9px] font-bold text-primary-foreground">{c.unread_count}</span>
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <p className={`text-sm truncate ${c.unread_count > 0 ? "font-bold" : "font-medium"}`}>{otherName}</p>
                            {c.last_message && (
                              <span className="text-[10px] text-muted-foreground shrink-0">
                                {format(new Date(c.last_message.created_at), "MMM d")}
                              </span>
                            )}
                          </div>
                          {c.last_message && (
                            <p className="text-xs text-muted-foreground truncate mt-0.5">{c.last_message.message_text}</p>
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
        onConversationCreated={(id) => {
          setNewConvoOpen(false);
          handleSelectConvo(id);
        }}
      />
    </div>
  );
}

function ChatArea({ conversationId, conversations, onBack }: {
  conversationId: string;
  conversations: Conversation[];
  onBack: () => void;
}) {
  const { user } = useAuth();
  const { messages, messagesLoading, sendMessage } = useConversationMessages(conversationId);
  const { typingUsers, sendTyping, sendStopTyping } = useTypingIndicator(conversationId);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const convo = conversations.find(c => c.id === conversationId);
  const otherName = convo?.participants[0]?.full_name || convo?.participants[0]?.email || "Chat";

  // Get current user's display name for typing indicator
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

  const handleSend = () => {
    if (!input.trim()) return;
    sendMessage.mutate(input.trim());
    setInput("");
    sendStopTyping();
  };

  return (
    <>
      {/* Chat Header */}
      <div className="flex items-center gap-3 p-3 border-b border-border shrink-0">
        <Button variant="ghost" size="icon" className="md:hidden h-8 w-8" onClick={onBack}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <Avatar className="h-8 w-8">
          <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">
            {otherName[0]?.toUpperCase() || "?"}
          </AvatarFallback>
        </Avatar>
        <p className="font-medium text-sm">{otherName}</p>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-3">
        <div className="space-y-3">
          {messagesLoading ? (
            <p className="text-center text-sm text-muted-foreground py-8">Loading messages...</p>
          ) : messages.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">No messages yet. Say hello!</p>
          ) : (
            messages.map((msg) => {
              const isMe = msg.sender_id === user?.id;
              return (
                <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] rounded-xl px-3 py-2 ${isMe ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>
                    {!isMe && (
                      <p className="text-[10px] font-medium text-muted-foreground mb-0.5">
                        {msg.sender?.full_name || msg.sender?.email || "Unknown"}
                      </p>
                    )}
                    <p className="text-sm">{msg.message_text}</p>
                    <p className={`text-[10px] mt-1 ${isMe ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                      {format(new Date(msg.created_at), "h:mm a")}
                    </p>
                  </div>
                </div>
              );
            })
          )}
          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="p-3 border-t border-border shrink-0">
        <div className="flex gap-2">
          <Input
            placeholder="Type a message..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            className="flex-1"
          />
          <Button size="icon" onClick={handleSend} disabled={!input.trim() || sendMessage.isPending}>
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </>
  );
}

function NewConversationDialog({ open, onClose, members, currentUserId, teamId, conversations, onConversationCreated }: {
  open: boolean;
  onClose: () => void;
  members: TeamMember[];
  currentUserId: string;
  teamId: string;
  conversations: Conversation[];
  onConversationCreated: (id: string) => void;
}) {
  const { startConversation } = useConversationMessages(null);

  const otherMembers = members.filter(m => m.user_id !== currentUserId && m.status === "active");

  const handleSelect = async (userId: string) => {
    // Check if conversation already exists
    const existing = conversations.find(c =>
      c.participants.some(p => p.user_id === userId)
    );
    if (existing) {
      onConversationCreated(existing.id);
      return;
    }

    const convoId = await startConversation.mutateAsync({ teamId, otherUserId: userId });
    onConversationCreated(convoId);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>New Conversation</DialogTitle>
        </DialogHeader>
        <div className="space-y-1 max-h-[300px] overflow-y-auto">
          {otherMembers.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4 text-center">No other team members available.</p>
          ) : (
            otherMembers.map((m) => {
              const name = m.profile?.full_name || m.invited_email || "Unknown";
              const initial = name[0]?.toUpperCase() || "?";
              return (
                <div
                  key={m.id}
                  className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-secondary/30 cursor-pointer transition-colors"
                  onClick={() => handleSelect(m.user_id)}
                >
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
      </DialogContent>
    </Dialog>
  );
}
