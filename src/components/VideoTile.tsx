/**
 * VideoTile.tsx — v4
 *
 * Changes from v3:
 *  - Bottom info bar uses `text-[10px]` with tighter padding so it stays
 *    readable in thumbnail-sized tiles (strip / sidebar layout).
 *  - Screen-share badge is smaller and never clips the close corner.
 *  - Avatar uses `min-w` / `min-h` guards so it doesn't collapse to 0 in
 *    very small tiles.
 *  - Speaking animation ring is `pointer-events-none` and `rounded-xl`
 *    (already was, but now explicitly `inset-[1px]` so it sits inside the
 *    tile border without causing a layout shift).
 *  - Name in the bottom bar truncates gracefully even at 80px wide tiles.
 */

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { MicOff, VideoOff, Monitor } from "lucide-react";
import type { DailyParticipant } from "@/hooks/useDailyCall";

interface VideoTileProps {
  participant: DailyParticipant;
  isMain?: boolean;
  activeSpeakerId: string | null;
  className?: string;
}

/** Derive a display-friendly initial from any name string */
function getInitial(name: string | undefined | null): string {
  if (!name) return "?";
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const cleaned = trimmed.replace(/\s*\(You\)\s*$/i, "").trim();
  return (cleaned[0] ?? "?").toUpperCase();
}

/** Pick a deterministic gradient based on the session id */
function getAvatarGradient(sessionId: string, isSpeaking: boolean): string {
  if (isSpeaking) {
    return "linear-gradient(135deg,rgba(16,185,129,0.35),rgba(5,150,105,0.35))";
  }
  const hash = sessionId.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const gradients = [
    "linear-gradient(135deg,rgba(99,102,241,0.35),rgba(139,92,246,0.35))",
    "linear-gradient(135deg,rgba(59,130,246,0.35),rgba(99,102,241,0.35))",
    "linear-gradient(135deg,rgba(168,85,247,0.35),rgba(236,72,153,0.35))",
    "linear-gradient(135deg,rgba(14,165,233,0.35),rgba(59,130,246,0.35))",
    "linear-gradient(135deg,rgba(245,158,11,0.3),rgba(239,68,68,0.3))",
  ];
  return gradients[hash % gradients.length];
}

export function VideoTile({
  participant,
  isMain = false,
  activeSpeakerId,
  className,
}: VideoTileProps) {
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

  const hasVideo    = !!(participant.video && participant.videoTrack);
  const isScreenShare = !!(participant.screen);
  const initial    = getInitial(participant.user_name);
  const displayName = participant.user_name?.replace(/\s*\(You\)\s*$/i, "").trim() || "Participant";

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl transition-all duration-200",
        className,
      )}
      style={{
        background: "linear-gradient(135deg, #1a1d26 0%, #0f1117 100%)",
        outline: isSpeaking
          ? "2px solid rgba(52, 211, 153, 0.65)"
          : "1px solid rgba(255,255,255,0.06)",
        outlineOffset: "0px",
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
          participant.local && !isScreenShare && "scale-x-[-1]",
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
              // Use explicit min sizes so the avatar never collapses in strip tiles
              "min-w-[32px] min-h-[32px] w-[clamp(32px,25%,80px)] h-[clamp(32px,25%,80px)]",
            )}
            style={{
              background: getAvatarGradient(participant.session_id, isSpeaking),
              border: isSpeaking
                ? "2px solid rgba(52,211,153,0.5)"
                : "1px solid rgba(255,255,255,0.1)",
              fontSize: "clamp(11px, 8%, 28px)",
            }}
          >
            {initial}
          </div>
          {isMain && (
            <p
              className="text-xs font-medium px-2 text-center truncate max-w-[80%]"
              style={{ color: "rgba(255,255,255,0.5)" }}
            >
              {displayName}
              {participant.local && (
                <span style={{ color: "rgba(255,255,255,0.3)" }}> (You)</span>
              )}
            </p>
          )}
        </div>
      )}

      {/* Speaking animation ring — inset so it never shifts layout */}
      {isSpeaking && (
        <div className="absolute inset-[1px] rounded-xl border-2 border-emerald-400/40 pointer-events-none animate-pulse" />
      )}

      {/* Screen share badge — compact, top-left, never clips corner overlay */}
      {isScreenShare && (
        <div
          className="absolute top-1.5 left-1.5 flex items-center gap-1 px-1.5 py-0.5 rounded-md"
          style={{ background: "rgba(99,102,241,0.85)", backdropFilter: "blur(8px)" }}
        >
          <Monitor className="w-2.5 h-2.5 text-white" />
          {/* Only show the label on larger tiles */}
          <span className="text-[9px] font-medium text-white hidden sm:inline">Screen</span>
        </div>
      )}

      {/* Bottom info bar — stays readable even at ~80 px tile width */}
      <div
        className="absolute bottom-0 left-0 right-0 px-1.5 py-1 flex items-center justify-between gap-1"
        style={{
          background: "linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 100%)",
        }}
      >
        {/* Name + speaking waveform */}
        <div className="flex items-center gap-1 min-w-0">
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
          <span className="text-[10px] font-medium text-white/90 truncate leading-tight">
            {displayName}
            {participant.local && (
              <span className="text-white/50 ml-0.5">(You)</span>
            )}
          </span>
        </div>

        {/* Status badges — compact icons only in small tiles */}
        <div className="flex items-center gap-0.5 shrink-0">
          {!participant.audio && (
            <div
              className="w-4 h-4 rounded flex items-center justify-center"
              style={{ background: "rgba(239,68,68,0.25)" }}
            >
              <MicOff className="w-2.5 h-2.5 text-red-400" />
            </div>
          )}
          {!participant.video && !isScreenShare && (
            <div
              className="w-4 h-4 rounded flex items-center justify-center"
              style={{ background: "rgba(255,255,255,0.1)" }}
            >
              <VideoOff className="w-2.5 h-2.5 text-white/50" />
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