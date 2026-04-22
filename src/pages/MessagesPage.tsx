/**
 * MessagesPage.tsx — with plan enforcement
 * Fixed: removed circular self-import (was importing itself as MessagesPageInner)
 * Team Messages requires Starter plan.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { LockedCard } from "@/components/plan/PlanGate";
import { usePlanEnforcement } from "@/contexts/PlanEnforcementContext";
import { useAuth } from "@/contexts/AuthContext";
import { useTeam } from "@/hooks/useTeam";
import { useTeamMessaging, useConversationMessages, getConversationName, getConversationInitials, type Conversation } from "@/hooks/useTeamMessaging";
import { useTypingIndicator } from "@/hooks/useTypingIndicator";
import { useMessageNotifications } from "@/hooks/useMessageNotifications";
import { cn } from "@/lib/utils";
import {
  Search, Plus, Send, Loader2, MessageSquare, Hash,
  Users, MoreHorizontal, Paperclip, Smile, X,
} from "lucide-react";
import { format, isToday, isYesterday } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

// ─── Date label ──────────────────────────────────────────────────────────────

function msgDateLabel(dateStr: string) {
  const d = new Date(dateStr);
  if (isToday(d)) return format(d, "h:mm a");
  if (isYesterday(d)) return "Yesterday";
  return format(d, "MMM d");
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ initials, size = 36, color = "#0ef5d4" }: { initials: string; size?: number; color?: string }) {
  return (
    <div
      style={{
        width: size, height: size, borderRadius: size * 0.28, flexShrink: 0,
        background: `${color}18`, border: `1px solid ${color}35`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: size * 0.38, fontWeight: 700, color,
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      {initials.slice(0, 2).toUpperCase()}
    </div>
  );
}

// ─── Conversation list item ──────────────────────────────────────────────────

function ConvoItem({
  convo, isActive, onClick,
}: {
  convo: Conversation; isActive: boolean; onClick: () => void;
}) {
  const name = getConversationName(convo);
  const initials = getConversationInitials(convo);
  const lastMsg = convo.last_message;

  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "10px 14px", width: "100%", border: "none",
        background: isActive ? "rgba(14,245,212,.08)" : "transparent",
        borderLeft: isActive ? "2px solid #0ef5d4" : "2px solid transparent",
        cursor: "pointer", textAlign: "left", transition: "all .15s",
      }}
    >
      <Avatar initials={initials} size={34} color={isActive ? "#0ef5d4" : "rgba(255,255,255,.4)"} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{
            fontSize: 13, fontWeight: 600,
            color: isActive ? "#f0f6fc" : "rgba(255,255,255,.75)",
            fontFamily: "'DM Sans', sans-serif",
            maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>{name}</span>
          {lastMsg?.created_at && (
            <span style={{ fontSize: 10, color: "rgba(255,255,255,.28)", flexShrink: 0 }}>
              {msgDateLabel(lastMsg.created_at)}
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 1 }}>
          <span style={{
            fontSize: 11, color: "rgba(255,255,255,.38)",
            maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {lastMsg?.message_text || "No messages yet"}
          </span>
          {convo.unread_count > 0 && (
            <span style={{
              fontSize: 10, fontWeight: 700, color: "#060912",
              background: "#0ef5d4", borderRadius: 10,
              padding: "1px 6px", flexShrink: 0, marginLeft: 4,
            }}>{convo.unread_count > 99 ? "99+" : convo.unread_count}</span>
          )}
        </div>
      </div>
    </button>
  );
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({ msg, isOwn }: { msg: any; isOwn: boolean }) {
  return (
    <div style={{
      display: "flex", flexDirection: isOwn ? "row-reverse" : "row",
      alignItems: "flex-end", gap: 8, marginBottom: 4,
    }}>
      {!isOwn && (
        <Avatar
          initials={(msg.sender?.full_name || msg.sender?.email || "?")[0]}
          size={26}
          color="rgba(255,255,255,.4)"
        />
      )}
      <div style={{ maxWidth: "72%", minWidth: 0 }}>
        {!isOwn && (
          <div style={{ fontSize: 10, color: "rgba(255,255,255,.38)", marginBottom: 3, paddingLeft: 4 }}>
            {msg.sender?.full_name || msg.sender?.email || "Unknown"}
          </div>
        )}
        <div style={{
          padding: "8px 12px", borderRadius: isOwn ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
          background: isOwn ? "linear-gradient(135deg, #0ef5d4, #0891b2)" : "rgba(255,255,255,.06)",
          border: isOwn ? "none" : "1px solid rgba(255,255,255,.08)",
          fontSize: 13, color: isOwn ? "#060912" : "rgba(255,255,255,.85)",
          fontFamily: "'DM Sans', sans-serif", lineHeight: 1.5,
          wordBreak: "break-word",
        }}>
          {msg.message_text}
        </div>
        <div style={{
          fontSize: 9.5, color: "rgba(255,255,255,.22)", marginTop: 3,
          textAlign: isOwn ? "right" : "left", paddingLeft: isOwn ? 0 : 4,
        }}>
          {format(new Date(msg.created_at), "h:mm a")}
        </div>
      </div>
    </div>
  );
}

// ─── Conversation panel ───────────────────────────────────────────────────────

function ConversationPanel({
  conversationId, userId, convoName,
}: { conversationId: string; userId: string; convoName: string }) {
  const { messages, messagesLoading, sendMessage } = useConversationMessages(conversationId);
  const { typingUsers, sendTyping, sendStopTyping } = useTypingIndicator(conversationId);
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<number>();
  const { user } = useAuth();

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || sendMessage.isPending) return;
    setText("");
    sendStopTyping();
    await sendMessage.mutateAsync({ text: trimmed });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    const displayName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Someone";
    sendTyping(displayName);
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = window.setTimeout(() => sendStopTyping(), 2000);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#0a0d18" }}>
      {/* Header */}
      <div style={{
        padding: "12px 18px", borderBottom: "1px solid rgba(255,255,255,.06)",
        display: "flex", alignItems: "center", gap: 10, flexShrink: 0,
        background: "rgba(255,255,255,.02)",
      }}>
        <Hash style={{ width: 15, height: 15, color: "rgba(255,255,255,.35)" }} />
        <span style={{ fontSize: 14, fontWeight: 600, color: "#f0f6fc", fontFamily: "'DM Sans', sans-serif" }}>
          {convoName}
        </span>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,.28)", marginLeft: 4 }}>
          {messages.length} messages
        </span>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px", minHeight: 0 }}>
        {messagesLoading ? (
          <div style={{ display: "flex", justifyContent: "center", paddingTop: 40 }}>
            <Loader2 style={{ width: 20, height: 20, color: "#0ef5d4", animation: "spin 1s linear infinite" }} />
          </div>
        ) : messages.length === 0 ? (
          <div style={{ textAlign: "center", paddingTop: 60 }}>
            <MessageSquare style={{ width: 32, height: 32, color: "rgba(255,255,255,.12)", margin: "0 auto 12px" }} />
            <p style={{ fontSize: 13, color: "rgba(255,255,255,.3)" }}>No messages yet. Start the conversation!</p>
          </div>
        ) : (
          messages.map((msg) => (
            <MessageBubble key={msg.id} msg={msg} isOwn={msg.sender_id === userId} />
          ))
        )}

        {/* Typing indicator */}
        {typingUsers.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0" }}>
            <div style={{ display: "flex", gap: 3 }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{
                  width: 5, height: 5, borderRadius: "50%", background: "#0ef5d4",
                  animation: `pulse 1.2s ease ${i * 0.2}s infinite`,
                }} />
              ))}
            </div>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,.35)" }}>
              {typingUsers.map(u => u.name).join(", ")} {typingUsers.length === 1 ? "is" : "are"} typing…
            </span>
          </div>
        )}

        <div ref={endRef} />
      </div>

      {/* Input */}
      <div style={{
        padding: "10px 14px", borderTop: "1px solid rgba(255,255,255,.06)",
        background: "rgba(255,255,255,.02)", flexShrink: 0,
      }}>
        <div style={{
          display: "flex", alignItems: "flex-end", gap: 8,
          background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)",
          borderRadius: 12, padding: "8px 10px",
        }}>
          <textarea
            value={text}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder={`Message ${convoName}…`}
            rows={1}
            style={{
              flex: 1, background: "transparent", border: "none", outline: "none",
              resize: "none", fontSize: 13, color: "#f0f6fc",
              fontFamily: "'DM Sans', sans-serif", lineHeight: 1.5,
              maxHeight: 100, overflowY: "auto",
            }}
          />
          <button
            onClick={handleSend}
            disabled={!text.trim() || sendMessage.isPending}
            style={{
              width: 32, height: 32, borderRadius: 8, border: "none",
              background: text.trim() ? "#0ef5d4" : "rgba(255,255,255,.06)",
              color: text.trim() ? "#060912" : "rgba(255,255,255,.25)",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: text.trim() ? "pointer" : "not-allowed", transition: "all .15s", flexShrink: 0,
            }}
          >
            {sendMessage.isPending
              ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} />
              : <Send style={{ width: 14, height: 14 }} />}
          </button>
        </div>
        <p style={{ fontSize: 10, color: "rgba(255,255,255,.2)", marginTop: 4, paddingLeft: 4 }}>
          Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}

// ─── New Conversation Modal ───────────────────────────────────────────────────

function NewConvoModal({
  teamId, userId, onCreated, onClose,
}: { teamId: string; userId: string; onCreated: (id: string) => void; onClose: () => void }) {
  const [members, setMembers] = useState<any[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    supabase
      .from("team_members")
      .select("user_id, profile:profiles(full_name, email)")
      .eq("team_id", teamId)
      .eq("status", "active")
      .neq("user_id", userId)
      .then(({ data }) => setMembers(data || []));
  }, [teamId, userId]);

  const handleCreate = async () => {
    if (!selected.length) return;
    setCreating(true);
    try {
      const convoId = crypto.randomUUID();
      const { error: convoErr } = await supabase
        .from("team_conversations")
        .insert({ id: convoId, team_id: teamId });
      if (convoErr) throw convoErr;

      await supabase.from("conversation_participants").insert(
        [userId, ...selected].map(uid => ({ conversation_id: convoId, user_id: uid }))
      );
      onCreated(convoId);
    } catch (e) {
      console.error("Create convo failed:", e);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 50,
      background: "rgba(0,0,0,.7)", backdropFilter: "blur(8px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }}>
      <div style={{
        width: "100%", maxWidth: 400, background: "#0e1220",
        border: "1px solid rgba(255,255,255,.1)", borderRadius: 16,
        padding: 20, boxShadow: "0 24px 64px rgba(0,0,0,.6)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#f0f6fc", fontFamily: "'DM Sans', sans-serif" }}>
            New Conversation
          </span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,.4)" }}>
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        <p style={{ fontSize: 12, color: "rgba(255,255,255,.4)", marginBottom: 12 }}>
          Select team members to start a conversation with:
        </p>

        <div style={{ maxHeight: 240, overflowY: "auto", marginBottom: 16 }}>
          {members.map((m: any) => {
            const name = m.profile?.full_name || m.profile?.email || "Unknown";
            const isChecked = selected.includes(m.user_id);
            return (
              <button
                key={m.user_id}
                onClick={() => setSelected(s => isChecked ? s.filter(id => id !== m.user_id) : [...s, m.user_id])}
                style={{
                  display: "flex", alignItems: "center", gap: 10, width: "100%",
                  padding: "9px 10px", borderRadius: 9, border: "none",
                  background: isChecked ? "rgba(14,245,212,.08)" : "transparent",
                  cursor: "pointer", marginBottom: 4,
                }}
              >
                <div style={{
                  width: 18, height: 18, borderRadius: 5,
                  border: `1.5px solid ${isChecked ? "#0ef5d4" : "rgba(255,255,255,.2)"}`,
                  background: isChecked ? "#0ef5d4" : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}>
                  {isChecked && <span style={{ fontSize: 11, color: "#060912", fontWeight: 900 }}>✓</span>}
                </div>
                <Avatar initials={name[0]} size={28} />
                <span style={{ fontSize: 13, color: "rgba(255,255,255,.75)", fontFamily: "'DM Sans', sans-serif" }}>{name}</span>
              </button>
            );
          })}
        </div>

        <button
          onClick={handleCreate}
          disabled={!selected.length || creating}
          style={{
            width: "100%", padding: "11px", borderRadius: 10, border: "none",
            background: selected.length ? "#0ef5d4" : "rgba(255,255,255,.06)",
            color: selected.length ? "#060912" : "rgba(255,255,255,.3)",
            fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif",
            cursor: selected.length ? "pointer" : "not-allowed", display: "flex",
            alignItems: "center", justifyContent: "center", gap: 6,
          }}
        >
          {creating ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> : null}
          {creating ? "Creating…" : `Start conversation with ${selected.length || ""} member${selected.length !== 1 ? "s" : ""}`}
        </button>
      </div>
    </div>
  );
}

// ─── Messages inner page ──────────────────────────────────────────────────────

function MessagesInner() {
  const { user } = useAuth();
  const { team } = useTeam();
  const { conversations, conversationsLoading, refetchConversations } = useTeamMessaging(team?.id);
  useMessageNotifications(team?.id);

  const [activeConvoId, setActiveConvoId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showNewConvo, setShowNewConvo] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  // Auto-select first conversation
  useEffect(() => {
    if (!activeConvoId && conversations.length > 0) {
      setActiveConvoId(conversations[0].id);
    }
  }, [conversations, activeConvoId]);

  const filtered = search
    ? conversations.filter(c =>
        getConversationName(c).toLowerCase().includes(search.toLowerCase())
      )
    : conversations;

  const activeConvo = conversations.find(c => c.id === activeConvoId);
  const activeConvoName = activeConvo ? getConversationName(activeConvo) : "Messages";

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.4;transform:scale(.8)} }
  `;

  return (
    <DashboardLayout>
      <style>{css}</style>

      {showNewConvo && team && user && (
        <NewConvoModal
          teamId={team.id}
          userId={user.id}
          onCreated={(id) => {
            setShowNewConvo(false);
            refetchConversations();
            setActiveConvoId(id);
          }}
          onClose={() => setShowNewConvo(false)}
        />
      )}

      <div style={{
        display: "flex", height: "calc(100vh - 7rem)", borderRadius: 16, overflow: "hidden",
        border: "1px solid rgba(255,255,255,.07)", background: "#0a0d18",
      }}>

        {/* Sidebar */}
        <div style={{
          width: isMobile && activeConvoId ? 0 : (isMobile ? "100%" : 260),
          flexShrink: 0, borderRight: "1px solid rgba(255,255,255,.06)",
          display: isMobile && activeConvoId ? "none" : "flex",
          flexDirection: "column", background: "#0d1120", overflow: "hidden",
          transition: "width .2s",
        }}>
          {/* Sidebar header */}
          <div style={{
            padding: "14px 14px 10px", borderBottom: "1px solid rgba(255,255,255,.06)",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,.7)", fontFamily: "'DM Sans', sans-serif" }}>
                Messages
              </span>
              <button
                onClick={() => setShowNewConvo(true)}
                style={{
                  width: 26, height: 26, borderRadius: 7, background: "rgba(14,245,212,.12)",
                  border: "1px solid rgba(14,245,212,.25)", display: "flex", alignItems: "center",
                  justifyContent: "center", cursor: "pointer",
                }}
              >
                <Plus style={{ width: 12, height: 12, color: "#0ef5d4" }} />
              </button>
            </div>
            <div style={{
              display: "flex", alignItems: "center", gap: 7,
              background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.07)",
              borderRadius: 8, padding: "6px 10px",
            }}>
              <Search style={{ width: 12, height: 12, color: "rgba(255,255,255,.3)", flexShrink: 0 }} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search conversations…"
                style={{
                  flex: 1, background: "transparent", border: "none", outline: "none",
                  fontSize: 12, color: "#f0f6fc", fontFamily: "'DM Sans', sans-serif",
                }}
              />
            </div>
          </div>

          {/* Conversation list */}
          <div style={{ flex: 1, overflowY: "auto" }}>
            {conversationsLoading ? (
              <div style={{ display: "flex", justifyContent: "center", paddingTop: 32 }}>
                <Loader2 style={{ width: 18, height: 18, color: "#0ef5d4", animation: "spin 1s linear infinite" }} />
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: "24px 16px", textAlign: "center" }}>
                <Users style={{ width: 24, height: 24, color: "rgba(255,255,255,.15)", margin: "0 auto 8px" }} />
                <p style={{ fontSize: 12, color: "rgba(255,255,255,.3)", fontFamily: "'DM Sans', sans-serif" }}>
                  {search ? "No conversations found" : "No conversations yet.\nClick + to start one."}
                </p>
              </div>
            ) : (
              filtered.map(convo => (
                <ConvoItem
                  key={convo.id}
                  convo={convo}
                  isActive={convo.id === activeConvoId}
                  onClick={() => setActiveConvoId(convo.id)}
                />
              ))
            )}
          </div>
        </div>

        {/* Main area */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          {activeConvoId && user ? (
            <>
              {/* Mobile back button */}
              {isMobile && (
                <button
                  onClick={() => setActiveConvoId(null)}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "8px 14px", background: "rgba(255,255,255,.03)",
                    border: "none", borderBottom: "1px solid rgba(255,255,255,.06)",
                    color: "#0ef5d4", fontSize: 12, cursor: "pointer",
                    fontFamily: "'DM Sans', sans-serif",
                  }}
                >
                  ← Back
                </button>
              )}
              <ConversationPanel
                conversationId={activeConvoId}
                userId={user.id}
                convoName={activeConvoName}
              />
            </>
          ) : (
            <div style={{
              flex: 1, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              color: "rgba(255,255,255,.2)",
            }}>
              <MessageSquare style={{ width: 40, height: 40, marginBottom: 12, opacity: 0.2 }} />
              <p style={{ fontSize: 14, fontFamily: "'DM Sans', sans-serif" }}>
                Select a conversation or start a new one
              </p>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

// ─── Gated export ─────────────────────────────────────────────────────────────

export default function MessagesPage() {
  const { hasFeature } = usePlanEnforcement();

  if (!hasFeature("team_messages")) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <LockedCard
            feature="team_messages"
            description="Collaborate with your team in real-time. Deal room conversations, direct messages, group chats, and coaching threads — all in one place."
          />
        </div>
      </DashboardLayout>
    );
  }

  return <MessagesInner />;
}