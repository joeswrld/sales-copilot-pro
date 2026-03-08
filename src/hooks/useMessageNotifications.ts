import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

/** Very loud, impossible-to-miss notification alarm using Web Audio API */
function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();

    // Master compressor to maximize perceived loudness
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-10, ctx.currentTime);
    compressor.knee.setValueAtTime(0, ctx.currentTime);
    compressor.ratio.setValueAtTime(20, ctx.currentTime);
    compressor.attack.setValueAtTime(0, ctx.currentTime);
    compressor.release.setValueAtTime(0.1, ctx.currentTime);
    compressor.connect(ctx.destination);

    const playTone = (freq: number, startTime: number, duration: number) => {
      // Layer two oscillators for thickness
      for (const type of ["square", "sawtooth"] as OscillatorType[]) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, startTime);
        gain.gain.setValueAtTime(1.0, startTime);
        gain.gain.setValueAtTime(1.0, startTime + duration * 0.7);
        gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
        osc.connect(gain);
        gain.connect(compressor);
        osc.start(startTime);
        osc.stop(startTime + duration);
      }
    };

    const now = ctx.currentTime;
    // Alarm-style: 5 rapid loud chimes
    playTone(1000, now, 0.15);
    playTone(1200, now + 0.17, 0.15);
    playTone(1000, now + 0.34, 0.15);
    playTone(1200, now + 0.51, 0.15);
    playTone(1000, now + 0.68, 0.25);

    setTimeout(() => ctx.close(), 1200);
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
