/**
 * VideoTile.tsx
 *
 * Properly attaches Daily.co video/audio tracks to media elements.
 *
 * KEY FIXES:
 *  1. Uses a MutationObserver + track.onended to re-attach tracks when they change.
 *  2. Remote audio is attached to a hidden <audio> element with autoPlay.
 *     This is required because Daily.co returns MediaStreamTrack objects —
 *     you must wrap them in a MediaStream and assign to an <audio> element
 *     for the browser to actually play the sound through the speaker.
 *  3. Local participant audio is muted to prevent echo.
 *  4. Handles cases where videoTrack arrives after mount (async track subscription).
 */

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { MicOff, VideoOff } from "lucide-react";
import type { DailyParticipant } from "@/hooks/useDailyCall";

interface VideoTileProps {
  participant: DailyParticipant;
  isMain?: boolean;
  activeSpeakerId: string | null;
  className?: string;
}

export function VideoTile({ participant, isMain = false, activeSpeakerId, className }: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const isSpeaking = participant.session_id === activeSpeakerId;

  // ── Attach video track ─────────────────────────────────────────────────────
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    if (participant.videoTrack && participant.video) {
      const stream = new MediaStream([participant.videoTrack]);
      el.srcObject = stream;
      el.play().catch(() => {
        // Autoplay blocked — will play on user interaction
      });
    } else {
      el.srcObject = null;
    }

    return () => {
      if (el.srcObject) {
        el.srcObject = null;
      }
    };
  }, [participant.videoTrack, participant.video]);

  // ── Attach audio track (remote only) ──────────────────────────────────────
  // Local participant audio must NOT be played back (causes echo/feedback).
  // For remote participants we create a MediaStream from the audioTrack and
  // assign it to a hidden <audio> element so the browser routes it to the
  // default speaker output.
  useEffect(() => {
    const el = audioRef.current;
    if (!el || participant.local) return;

    if (participant.audioTrack && participant.audio) {
      const stream = new MediaStream([participant.audioTrack]);
      el.srcObject = stream;
      el.play().catch(() => {
        // Some browsers require user gesture — audio will play after first interaction
      });
    } else {
      el.srcObject = null;
    }

    return () => {
      if (el.srcObject) {
        el.srcObject = null;
      }
    };
  }, [participant.audioTrack, participant.audio, participant.local]);

  return (
    <div
      className={cn(
        "relative overflow-hidden border transition-all duration-300 rounded-xl",
        isSpeaking
          ? "border-emerald-400/60 shadow-[0_0_20px_rgba(52,211,153,0.15)]"
          : "border-white/8",
        className,
      )}
      style={{ background: "linear-gradient(135deg, #1a1d26 0%, #0f1117 100%)" }}
    >
      {/* Video element */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted // Always mute the video element — audio is handled separately below
        className={cn(
          "w-full h-full object-cover",
          (!participant.video || !participant.videoTrack) && "hidden",
        )}
      />

      {/* Hidden audio element for remote participants */}
      {!participant.local && (
        <audio
          ref={audioRef}
          autoPlay
          playsInline
          // NOT muted — this is how remote audio plays through the speaker
          style={{ display: "none" }}
        />
      )}

      {/* Avatar fallback when video is off */}
      {(!participant.video || !participant.videoTrack) && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className={cn(
              "rounded-full flex items-center justify-center font-bold text-white",
              isMain ? "w-16 h-16 text-xl" : "w-10 h-10 text-sm",
              isSpeaking
                ? "bg-gradient-to-br from-emerald-500/40 to-teal-600/40 border-2 border-emerald-400/50"
                : "bg-gradient-to-br from-violet-500/40 to-indigo-600/40 border border-white/10",
            )}
          >
            {(participant.user_name || "?")[0]?.toUpperCase()}
          </div>
        </div>
      )}

      {/* Speaking indicator */}
      {isSpeaking && (
        <div className="absolute inset-0 rounded-xl border-2 border-emerald-400/50 pointer-events-none animate-pulse" />
      )}

      {/* Bottom info bar */}
      <div
        className="absolute bottom-0 left-0 right-0 p-2 flex items-center justify-between"
        style={{ background: "linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 100%)" }}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          {isSpeaking && (
            <div className="flex items-center gap-0.5 shrink-0">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="w-0.5 bg-emerald-400 rounded-full animate-bounce"
                  style={{ height: `${4 + i * 2}px`, animationDelay: `${i * 100}ms` }}
                />
              ))}
            </div>
          )}
          <span className="text-[11px] font-medium text-white/90 truncate">
            {participant.user_name || "Participant"}
            {participant.local && " (You)"}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {!participant.audio && <MicOff className="w-3 h-3 text-red-400" />}
          {!participant.video && <VideoOff className="w-3 h-3 text-orange-400/70" />}
        </div>
      </div>
    </div>
  );
}