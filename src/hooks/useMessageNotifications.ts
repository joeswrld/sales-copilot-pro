import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

/** Loud, attention-grabbing notification chime using Web Audio API */
function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();

    const playTone = (freq: number, startTime: number, duration: number, volume: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square"; // harsher, louder waveform
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(volume, startTime);
      gain.gain.setValueAtTime(volume, startTime + duration * 0.6);
      gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + duration);
    };

    const now = ctx.currentTime;
    // Three loud, punchy chimes
    playTone(880, now, 0.2, 1.0);
    playTone(1100, now + 0.22, 0.2, 1.0);
    playTone(880, now + 0.44, 0.3, 1.0);

    setTimeout(() => ctx.close(), 1000);
  } catch {
    // Web Audio not available
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
