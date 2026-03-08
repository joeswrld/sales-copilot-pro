import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

/** Simple bell chime using Web Audio API — no external files needed */
function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();

    // Two-tone bell: high note then slightly lower
    const playTone = (freq: number, startTime: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(0.3, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + duration);
    };

    const now = ctx.currentTime;
    playTone(830, now, 0.15);       // first ding
    playTone(660, now + 0.18, 0.2); // second (lower) dong

    // Clean up context after sound finishes
    setTimeout(() => ctx.close(), 600);
  } catch {
    // Web Audio not available — silently skip
  }
}

/**
 * Subscribes to new team messages via Supabase Realtime
 * and shows a toast + plays a bell sound when a message arrives from someone else.
 */
export function useMessageNotifications(teamId: string | undefined) {
  const { user } = useAuth();
  const { toast } = useToast();
  const lastSoundRef = useRef(0);

  useEffect(() => {
    if (!user || !teamId) return;

    const channel = supabase
      .channel(`team-msg-notify-${teamId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "team_messages" },
        async (payload) => {
          const msg = payload.new as { sender_id: string; message_text: string; conversation_id: string };
          if (msg.sender_id === user.id) return;

          // Throttle sounds to max 1 per second to avoid rapid-fire spam
          const now = Date.now();
          if (now - lastSoundRef.current > 1000) {
            lastSoundRef.current = now;
            playNotificationSound();
          }

          // Get sender name
          const { data: profile } = await supabase
            .from("profiles")
            .select("full_name, email")
            .eq("id", msg.sender_id)
            .single();

          const name = profile?.full_name || profile?.email || "Someone";

          toast({
            title: `🔔 New message from ${name}`,
            description: msg.message_text.length > 80 ? msg.message_text.slice(0, 80) + "…" : msg.message_text,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, teamId, toast]);
}
