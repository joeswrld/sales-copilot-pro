/**
 * useLiveMeetingAI
 *
 * Fires an async server-side AI analysis every few seconds during an active
 * live call. Never touches the audio/transcription path — the client just
 * triggers the edge function; results land in meeting_live_analysis (the
 * Live AI Analysis / Meeting Score snapshot) plus meeting_signals and
 * ai_coaching_suggestions (the running AI Coaching feed), and flow through
 * the existing useMeetingWorkspace Realtime subscription — so the UI updates
 * itself the moment a pass completes, with no polling on the read side.
 *
 * FIX: previously polled every 20s with no talk-ratio input, so the
 * server-computed Meeting Score fell back to a stale/default 50/50 split.
 * Now polls every 8s (still comfortably outside any rate limit — the edge
 * function itself no-ops when there isn't enough new transcript) and reads
 * the live talk ratio via a ref so the interval doesn't get torn down and
 * restarted on every transcript line.
 */

import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

const INTERVAL_MS = 8_000;
const KICKOFF_MS = 4_000;
const ERROR_BACKOFF_MS = 30_000; // pause polling briefly on 402/429 (credits/rate limit)

export interface TalkRatio {
  rep: number;
  prospect: number;
}

export function useLiveMeetingAI(
  callId: string | null,
  enabled: boolean,
  talkRatio?: TalkRatio,
) {
  const inflight = useRef(false);
  const talkRatioRef = useRef<TalkRatio | undefined>(talkRatio);
  const pausedUntilRef = useRef(0);

  // Keep the latest talk ratio available to the interval without resetting it.
  useEffect(() => {
    talkRatioRef.current = talkRatio;
  }, [talkRatio]);

  useEffect(() => {
    if (!callId || !enabled) return;

    let cancelled = false;

    const tick = async () => {
      if (inflight.current || cancelled) return;
      if (Date.now() < pausedUntilRef.current) return;
      inflight.current = true;
      try {
        const ratio = talkRatioRef.current;
        const { data, error } = await supabase.functions.invoke("live-meeting-ai", {
          body: {
            call_id: callId,
            ...(ratio
              ? { talk_ratio_rep: ratio.rep, talk_ratio_prospect: ratio.prospect }
              : {}),
          },
        });
        if (error) {
          const status = (error as any)?.context?.status;
          if (status === 402 || status === 429) {
            pausedUntilRef.current = Date.now() + ERROR_BACKOFF_MS;
          }
        } else if (data?.error === "AI credits exhausted" || data?.error === "Rate limited") {
          pausedUntilRef.current = Date.now() + ERROR_BACKOFF_MS;
        }
      } catch (e) {
        // Silent — this runs in the background, must not disturb the call UI.
        console.debug("live-meeting-ai tick failed", e);
      } finally {
        inflight.current = false;
      }
    };

    // Kick off shortly after mount (give the transcript a moment to
    // accumulate a first segment), then poll every few seconds.
    const kickoff = setTimeout(tick, KICKOFF_MS);
    const interval = setInterval(tick, INTERVAL_MS);

    return () => {
      cancelled = true;
      clearTimeout(kickoff);
      clearInterval(interval);
    };
  }, [callId, enabled]);
}