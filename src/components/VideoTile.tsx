/**
 * VideoTile.tsx — v2 (Mobile-friendly, Meet-style)
 *
 * Changes from v1:
 *  - Larger name label with backdrop blur
 *  - Speaking ring uses outline instead of inset border for reliability
 *  - Avatar initials scale with tile size via CSS clamp
 *  - Touch-safe — no hover-only states; speaking/mute badges always visible
 *  - Proper aspect-ratio handling for both landscape and portrait cameras
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

  // ── Attach video track ──────────────────────────────────────────────────────
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    if (participant.videoTrack && participant.video) {
      const stream = new MediaStream([participant.videoTrack]);
      el.srcObject = stream;
      el.play().catch(() => {});
    } else {
      el.srcObject = null;
    }

    return () => {
      if (el.srcObject) el.srcObject = null;
    };
  }, [participant.videoTrack, participant.video]);

  // ── Attach audio track (remote only) ────────────────────────────────────────
  useEffect(() => {
    const el = audioRef.current;
    if (!el || participant.local) return;

    if (participant.audioTrack && participant.audio) {
      const stream = new MediaStream([participant.audioTrack]);
      el.srcObject = stream;
      el.play().catch(() => {});
    } else {
      el.srcObject = null;
    }

    return () => {
      if (el.srcObject) el.srcObject = null;
    };
  }, [participant.audioTrack, participant.audio, participant.local]);

  const hasVideo = !!(participant.video && participant.videoTrack);
  const initials = (participant.user_name || "?")[0]?.toUpperCase();
  const displayName = participant.user_name || "Participant";

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl transition-all duration-200",
        className,
      )}
      style={{
        background: "linear-gradient(135deg, #1a1d26 0%, #0f1117 100%)",
        // Speaking ring — use outline so it sits outside and doesn't clip video
        outline: isSpeaking ? "2px solid rgba(52, 211, 153, 0.65)" : "1px solid rgba(255,255,255,0.06)",
        outlineOffset: isSpeaking ? "0px" : "0px",
        boxShadow: isSpeaking ? "0 0 0 4px rgba(52,211,153,0.12)" : "none",
      }}
    >
      {/* Video element — always rendered, hidden when no video */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={cn(
          "w-full h-full object-cover",
          !hasVideo && "hidden",
        )}
      />

      {/* Audio element for remote participants */}
      {!participant.local && (
        <audio ref={audioRef} autoPlay playsInline style={{ display: "none" }} />
      )}

      {/* Avatar — shown when camera is off */}
      {!hasVideo && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
          <div
            className={cn(
              "rounded-full flex items-center justify-center font-bold text-white select-none",
              "w-[clamp(40px,25%,80px)] h-[clamp(40px,25%,80px)]",
              "text-[clamp(14px,4cqw,28px)]",
            )}
            style={isSpeaking ? {
              background: "linear-gradient(135deg,rgba(16,185,129,0.35),rgba(5,150,105,0.35))",
              border: "2px solid rgba(52,211,153,0.5)",
            } : {
              background: "linear-gradient(135deg,rgba(99,102,241,0.35),rgba(139,92,246,0.35))",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            {initials}
          </div>
        </div>
      )}

      {/* Speaking animation ring */}
      {isSpeaking && (
        <div className="absolute inset-0 rounded-xl border-2 border-emerald-400/40 pointer-events-none animate-pulse" />
      )}

      {/* Bottom info bar */}
      <div
        className="absolute bottom-0 left-0 right-0 px-2 py-1.5 flex items-center justify-between gap-2"
        style={{ background: "linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 100%)" }}
      >
        {/* Name + speaking indicator */}
        <div className="flex items-center gap-1.5 min-w-0">
          {isSpeaking && (
            <div className="flex items-end gap-px shrink-0">
              {[3, 5, 4, 6, 3].map((h, i) => (
                <div
                  key={i}
                  className="w-[2px] bg-emerald-400 rounded-full"
                  style={{
                    height: `${h}px`,
                    animation: `soundwave 0.8s ease-in-out ${i * 0.1}s infinite alternate`,
                  }}
                />
              ))}
            </div>
          )}
          <span className="text-[11px] font-medium text-white/90 truncate leading-tight">
            {displayName}
            {participant.local && <span className="text-white/50 ml-1">(You)</span>}
          </span>
        </div>

        {/* Status badges */}
        <div className="flex items-center gap-1 shrink-0">
          {!participant.audio && (
            <div className="w-5 h-5 rounded-md flex items-center justify-center"
              style={{ background: "rgba(239,68,68,0.25)" }}>
              <MicOff className="w-3 h-3 text-red-400" />
            </div>
          )}
          {!participant.video && (
            <div className="w-5 h-5 rounded-md flex items-center justify-center"
              style={{ background: "rgba(255,255,255,0.1)" }}>
              <VideoOff className="w-3 h-3 text-white/50" />
            </div>
          )}
        </div>
      </div>

      {/* Inline keyframes for soundwave */}
      <style>{`
        @keyframes soundwave {
          from { transform: scaleY(0.5); opacity: 0.7; }
          to   { transform: scaleY(1.4); opacity: 1;   }
        }
      `}</style>
    </div>
  );
}