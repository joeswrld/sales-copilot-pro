import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

/** Notification sound using Web Audio API — throttled to max 1/3s */
function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-10, ctx.currentTime);
    compressor.knee.setValueAtTime(0, ctx.currentTime);
    compressor.ratio.setValueAtTime(20, ctx.currentTime);
    compressor.attack.setValueAtTime(0, ctx.currentTime);
    compressor.release.setValueAtTime(0.1, ctx.currentTime);
    compressor.connect(ctx.destination);

    const playTone = (freq: number, startTime: number, duration: number) => {
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
    playTone(1000, now, 0.15);
    playTone(1200, now + 0.17, 0.15);
    playTone(1000, now + 0.34, 0.15);

    // Close context after sound finishes to avoid memory leak
    setTimeout(() => {
      ctx.close().catch(() => {});
    }, 800);
  } catch {
    // Web Audio not available
  }
}

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