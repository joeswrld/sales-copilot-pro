/**
 * useLiveMeetingAI
 *
 * Fires an async server-side AI analysis every ~20s during an active live call.
 * Never touches the audio/transcription path — the client just triggers the
 * edge function; results land in meeting_signals + ai_coaching_suggestions and
 * flow through the existing useMeetingWorkspace Realtime subscription.
 */

import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

const INTERVAL_MS = 20_000;

export function useLiveMeetingAI(callId: string | null, enabled: boolean) {
  const inflight = useRef(false);

  useEffect(() => {
    if (!callId || !enabled) return;

    let cancelled = false;

    const tick = async () => {
      if (inflight.current || cancelled) return;
      inflight.current = true;
      try {
        await supabase.functions.invoke("live-meeting-ai", {
          body: { call_id: callId },
        });
      } catch (e) {
        // Silent — this runs in the background, must not disturb the call UI.
        console.debug("live-meeting-ai tick failed", e);
      } finally {
        inflight.current = false;
      }
    };

    // Kick off shortly after mount, then poll.
    const kickoff = setTimeout(tick, 5_000);
    const interval = setInterval(tick, INTERVAL_MS);

    return () => {
      cancelled = true;
      clearTimeout(kickoff);
      clearInterval(interval);
    };
  }, [callId, enabled]);
}
