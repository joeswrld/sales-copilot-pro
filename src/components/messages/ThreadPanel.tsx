/**
 * ThreadPanel — Slack-style side panel for a message thread.
 * Loads child messages (parent_id = root.id) and lets the user reply in-thread.
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { X, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { toast } from "sonner";

interface ThreadMsg {
  id: string;
  parent_id?: string | null;
  message_text?: string | null;
  content?: string | null;
  sender_id?: string | null;
  user_id?: string | null;
  created_at: string;
  sender_full_name?: string | null;
  sender_email?: string | null;
  sender_avatar_url?: string | null;
}

interface Props {
  root: ThreadMsg;
  isDM: boolean;
  channelId?: string;
  conversationId?: string;
  onClose: () => void;
}

export default function ThreadPanel({ root, isDM, channelId, conversationId, onClose }: Props) {
  const { user } = useAuth();
  const [replies, setReplies] = useState<ThreadMsg[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const endRef = useRef<HTMLDivElement>(null);

  const table = isDM ? "team_messages" : "deal_channel_messages";

  const load = useCallback(async () => {
    const { data } = await (supabase as any)
      .from(table)
      .select(isDM
        ? "id, parent_id, message_text, sender_id, created_at, profiles:sender_id(full_name,email,avatar_url)"
        : "id, parent_id, content, user_id, created_at, profiles:user_id(full_name,email,avatar_url)"
      )
      .eq("parent_id", root.id)
      .order("created_at", { ascending: true });
    setReplies((data || []).map((m: any) => ({
      ...m,
      sender_full_name: m.profiles?.full_name,
      sender_email: m.profiles?.email,
      sender_avatar_url: m.profiles?.avatar_url,
    })));
    setLoading(false);
  }, [isDM, root.id, table]);

  useEffect(() => { load(); }, [load]);

  // Realtime
  useEffect(() => {
    const ch = supabase.channel(`thread-${root.id}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table,
        filter: `parent_id=eq.${root.id}`,
      }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [root.id, table, load]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [replies.length]);

  const send = async () => {
    const t = text.trim();
    if (!t || !user || sending) return;
    setSending(true); setText("");
    try {
      if (isDM) {
        await supabase.from("team_messages").insert({
          conversation_id: conversationId, sender_id: user.id,
          message_text: t, parent_id: root.id,
        } as any);
      } else {
        await (supabase as any).from("deal_channel_messages").insert({
          channel_id: channelId, user_id: user.id,
          content: t, type: "text", parent_id: root.id,
        });
      }
    } catch { toast.error("Failed to send reply"); setText(t); }
    finally { setSending(false); }
  };

  const rootText = root.message_text || root.content || "";
  const rootName = root.sender_full_name || root.sender_email?.split("@")[0] || "Unknown";

  return (
    <div style={{
      width: 360, flexShrink: 0, borderLeft: "1px solid rgba(255,255,255,.07)",
      background: "#0c0f1e", display: "flex", flexDirection: "column",
      fontFamily: "'Geist',system-ui,sans-serif", height: "100%",
    }}>
      <div style={{ padding: "12px 14px", borderBottom: "1px solid rgba(255,255,255,.06)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <p style={{ fontSize: 14, fontWeight: 700, color: "#f0f6fc", margin: 0 }}>Thread</p>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,.4)", margin: "2px 0 0" }}>
            {replies.length} {replies.length === 1 ? "reply" : "replies"}
          </p>
        </div>
        <button onClick={onClose} style={{
          width: 28, height: 28, borderRadius: 7, background: "rgba(255,255,255,.05)",
          border: "1px solid rgba(255,255,255,.08)", color: "rgba(255,255,255,.6)",
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
        }}><X size={14} /></button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px" }}>
        {/* Root message */}
        <div style={{ padding: 10, borderRadius: 10, background: "rgba(255,255,255,.04)", marginBottom: 12, borderLeft: "3px solid #a78bfa" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#a78bfa" }}>{rootName}</span>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,.3)" }}>{format(new Date(root.created_at), "MMM d · h:mm a")}</span>
          </div>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,.85)", margin: 0, wordBreak: "break-word" }}>{rootText}</p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "6px 0 12px" }}>
          <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,.06)" }} />
          <span style={{ fontSize: 11, color: "rgba(255,255,255,.35)" }}>
            {replies.length} {replies.length === 1 ? "Reply" : "Replies"}
          </span>
          <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,.06)" }} />
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: 20, color: "rgba(255,255,255,.4)", fontSize: 12 }}>Loading…</div>
        ) : replies.map(r => {
          const t = r.message_text || r.content || "";
          const name = r.sender_full_name || r.sender_email?.split("@")[0] || "Unknown";
          const isOwn = (r.sender_id || r.user_id) === user?.id;
          return (
            <div key={r.id} style={{ marginBottom: 10, display: "flex", gap: 8 }}>
              {r.sender_avatar_url ? (
                <img src={r.sender_avatar_url} alt="" style={{ width: 28, height: 28, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />
              ) : (
                <div style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0, background: isOwn ? "rgba(14,245,212,.18)" : "rgba(167,139,250,.18)", color: isOwn ? "#0ef5d4" : "#a78bfa", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 }}>
                  {(name[0] || "?").toUpperCase()}
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 2 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: isOwn ? "#0ef5d4" : "#a78bfa" }}>{isOwn ? "You" : name}</span>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,.3)" }}>{format(new Date(r.created_at), "h:mm a")}</span>
                </div>
                <p style={{ fontSize: 13, color: "rgba(255,255,255,.88)", margin: 0, wordBreak: "break-word", lineHeight: 1.5 }}>{t}</p>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <div style={{ padding: "10px 14px 14px", borderTop: "1px solid rgba(255,255,255,.06)" }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 8, background: "rgba(255,255,255,.05)", border: `1px solid ${text ? "rgba(14,245,212,.25)" : "rgba(255,255,255,.09)"}`, borderRadius: 12, padding: "8px 10px 8px 12px" }}>
          <textarea value={text} onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Reply in thread…" rows={1}
            style={{ flex: 1, background: "transparent", border: "none", outline: "none", resize: "none", fontSize: 13.5, color: "#f0f6fc", lineHeight: 1.5, maxHeight: 100, overflowY: "auto", fontFamily: "'Geist',system-ui,sans-serif" }} />
          <button onClick={send} disabled={!text.trim() || sending}
            style={{ width: 32, height: 32, borderRadius: 8, border: "none", flexShrink: 0, background: text.trim() ? "linear-gradient(135deg,#0ef5d4,#0891b2)" : "rgba(255,255,255,.07)", color: text.trim() ? "#060912" : "rgba(255,255,255,.25)", display: "flex", alignItems: "center", justifyContent: "center", cursor: text.trim() ? "pointer" : "not-allowed" }}>
            <Send size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}
