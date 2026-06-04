import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { playNotificationSound } from "@/lib/notificationSound";

export function useMessageNotifications(teamId: string | undefined) {
  const { user } = useAuth();
  const { toast } = useToast();
  const lastSoundRef = useRef(0);
  // Cache profile lookups to avoid repeated DB calls
  const profileCacheRef = useRef<Map<string, { full_name: string | null; email: string | null }>>(new Map());

  useEffect(() => {
    if (!user || !teamId) return;

    const channel = supabase
      .channel(`team-msg-notify-${teamId}-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "team_messages" },
        async (payload) => {
          const msg = payload.new as { sender_id: string; message_text: string; conversation_id: string };
          if (msg.sender_id === user.id) return;

          // Throttle sounds to max 1 per 3 seconds
          const now = Date.now();
          if (now - lastSoundRef.current > 3000) {
            lastSoundRef.current = now;
            playNotificationSound();
          }

          // Use cached profile if available
          let profile = profileCacheRef.current.get(msg.sender_id);
          if (!profile) {
            const { data } = await supabase
              .from("profiles")
              .select("full_name, email")
              .eq("id", msg.sender_id)
              .single();
            profile = { full_name: data?.full_name ?? null, email: data?.email ?? null };
            profileCacheRef.current.set(msg.sender_id, profile);
          }

          const name = profile.full_name || profile.email || "Someone";
          const preview = msg.message_text.length > 80
            ? msg.message_text.slice(0, 80) + "…"
            : msg.message_text;

          toast({
            title: `New message from ${name}`,
            description: preview,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      // Clear profile cache on unmount to prevent stale data
      profileCacheRef.current.clear();
    };
  }, [user, teamId, toast]);
}