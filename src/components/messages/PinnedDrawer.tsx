/**
 * PinnedDrawer — slide-over panel listing pinned messages for the current channel/DM.
 */
import { useEffect, useState, useCallback } from "react";
import { X, Pin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { toast } from "sonner";

interface PinnedItem {
  id: string;
  text: string;
  sender_name: string;
  created_at: string;
  message_id: string;
}

interface Props {
  isDM: boolean;
  channelId?: string;
  conversationId?: string;
  onClose: () => void;
  onJump?: (messageId: string) => void;
}

export default function PinnedDrawer({ isDM, channelId, conversationId, onClose, onJump }: Props) {
  const [items, setItems] = useState<PinnedItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (isDM && conversationId) {
        const { data } = await (supabase as any)
          .from("pinned_messages")
          .select(`id, message_id, created_at, message_preview,
                   team_messages!inner(id, message_text, sender_id, profiles:sender_id(full_name,email))`)
          .eq("conversation_id", conversationId)
          .order("created_at", { ascending: false });
        setItems((data || []).map((p: any) => ({
          id: p.id, message_id: p.message_id, created_at: p.created_at,
          text: p.team_messages?.message_text || p.message_preview || "",
          sender_name: p.team_messages?.profiles?.full_name || p.team_messages?.profiles?.email?.split("@")[0] || "Unknown",
        })));
      } else if (!isDM && channelId) {
        const { data } = await (supabase as any)
          .from("deal_channel_messages")
          .select("id, content, created_at, user_id, profiles:user_id(full_name,email)")
          .eq("channel_id", channelId)
          .eq("is_pinned", true)
          .eq("is_deleted", false)
          .order("created_at", { ascending: false });
        setItems((data || []).map((m: any) => ({
          id: m.id, message_id: m.id, created_at: m.created_at,
          text: m.content || "",
          sender_name: m.profiles?.full_name || m.profiles?.email?.split("@")[0] || "Unknown",
        })));
      }
    } catch (e: any) {
      console.warn("PinnedDrawer load failed", e);
    } finally { setLoading(false); }
  }, [isDM, channelId, conversationId]);

  useEffect(() => { load(); }, [load]);

  const unpin = async (item: PinnedItem) => {
    try {
      if (isDM) {
        await supabase.from("pinned_messages").delete().eq("id", item.id);
      } else {
        await (supabase as any).from("deal_channel_messages").update({ is_pinned: false }).eq("id", item.message_id);
      }
      setItems(prev => prev.filter(p => p.id !== item.id));
      toast.success("Unpinned");
    } catch { toast.error("Failed to unpin"); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", justifyContent: "flex-end" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.55)", backdropFilter: "blur(4px)" }} />
      <div style={{
        position: "relative", width: "100%", maxWidth: 380, background: "#0c0f1e",
        borderLeft: "1px solid rgba(255,255,255,.08)", display: "flex", flexDirection: "column",
        fontFamily: "'Geist',system-ui,sans-serif",
      }}>
        <div style={{ padding: "14px 16px", borderBottom: "1px solid rgba(255,255,255,.06)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Pin size={14} color="#fbbf24" />
            <span style={{ fontSize: 14, fontWeight: 700, color: "#f0f6fc" }}>Pinned messages</span>
          </div>
          <button onClick={onClose} style={{
            width: 28, height: 28, borderRadius: 7, background: "rgba(255,255,255,.05)",
            border: "1px solid rgba(255,255,255,.08)", color: "rgba(255,255,255,.6)",
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          }}><X size={14} /></button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
          {loading ? (
            <p style={{ textAlign: "center", color: "rgba(255,255,255,.4)", fontSize: 12, padding: 24 }}>Loading…</p>
          ) : items.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 16px" }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>📌</div>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,.5)", margin: 0, fontWeight: 600 }}>No pinned messages</p>
              <p style={{ fontSize: 11.5, color: "rgba(255,255,255,.3)", margin: "4px 0 0" }}>Long-press or right-click a message to pin it.</p>
            </div>
          ) : items.map(item => (
            <div key={item.id} style={{
              padding: 12, borderRadius: 10, background: "rgba(255,255,255,.04)",
              border: "1px solid rgba(255,255,255,.06)", marginBottom: 8,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: "#fbbf24" }}>{item.sender_name}</span>
                <span style={{ fontSize: 10, color: "rgba(255,255,255,.35)" }}>{format(new Date(item.created_at), "MMM d, h:mm a")}</span>
              </div>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,.85)", margin: "0 0 8px", wordBreak: "break-word", lineHeight: 1.5 }}>
                {item.text || "(empty message)"}
              </p>
              <div style={{ display: "flex", gap: 6 }}>
                {onJump && (
                  <button onClick={() => { onJump(item.message_id); onClose(); }} style={{
                    padding: "4px 10px", borderRadius: 7, border: "1px solid rgba(14,245,212,.25)",
                    background: "rgba(14,245,212,.08)", color: "#0ef5d4",
                    fontSize: 11, fontWeight: 600, cursor: "pointer",
                  }}>Jump</button>
                )}
                <button onClick={() => unpin(item)} style={{
                  padding: "4px 10px", borderRadius: 7, border: "1px solid rgba(255,255,255,.1)",
                  background: "transparent", color: "rgba(255,255,255,.55)",
                  fontSize: 11, fontWeight: 600, cursor: "pointer",
                }}>Unpin</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
