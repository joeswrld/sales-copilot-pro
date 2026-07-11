/**
 * GuestJoin.tsx — v4
 *
 * Fixes & improvements over v3:
 *  - CRITICAL: guests now exchange their admitted guest_session_token for a
 *    real Daily meeting token via get-guest-daily-token before joinCall().
 *    v3 called daily.joinCall({ rName, displayName }) with NO token at all,
 *    which is what produced the silent "send transport changed to
 *    disconnected" failures — Daily can't refresh permissions for a
 *    tokenless anonymous participant, so any transient network hiccup
 *    permanently dropped the connection.
 *  - Screen share button now present and wired to real Daily APIs
 *    (startScreenShare / stopScreenShare), matching the host experience.
 *  - Raise hand button now present and wired to daily.raiseHand(), broadcast
 *    to all participants (including the host) via Daily app-message, with a
 *    visible indicator badge.
 *  - Fully responsive: control bar wraps and scales for narrow viewports,
 *    lobby card uses fluid padding/typography, touch targets stay >=44px.
 */

import { useState, useEffect, useRef, useCallback, memo, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Mic, MicOff, Video, VideoOff, PhoneOff, Users,
  Loader2, WifiOff, RefreshCw, Monitor, MonitorOff,
  Maximize2, Minimize2, PanelRight, X, Pin, PinOff,
  AlertCircle, Clock, LayoutGrid, Hand, SwitchCamera,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useDailyCall, DailyParticipant, CallQuality } from "@/hooks/useDailyCall";
import { useIsMobile } from "@/hooks/use-mobile";
import { useGuestAudioStreaming } from "@/hooks/useGuestAudioStreaming";
import { useMeetingHealth } from "@/hooks/useMeetingHealth";
import { MeetingHealthBar } from "@/components/MeetingHealthBar";
import { VideoTile } from "@/components/VideoTile";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ─── Types ──────────────────────────────────────────────────────────────────────
type VideoLayout = "spotlight" | "grid" | "sidebar";
type JoinStep = "lobby" | "requesting" | "waiting" | "admitted" | "denied" | "disconnected";

// ─── Design tokens ───────────────────────────────────────────────────────────────
const T = {
  bg: "#080a12",
  panel: "rgba(12,14,22,0.96)",
  card: "rgba(255,255,255,0.04)",
  border: "rgba(255,255,255,0.07)",
  accent: "#6366f1",
  text: "rgba(255,255,255,0.85)",
  muted: "rgba(255,255,255,0.35)",
  subtle: "rgba(255,255,255,0.12)",
};

function qualityColor(q: CallQuality) {
  return q === "excellent" || q === "good"
    ? "#10b981"
    : q === "fair"
    ? "#f59e0b"
    : "#ef4444";
}
function fmt(s: number) {
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

// Derive a pleasant initial from any name
function getInitial(name: string | undefined | null): string {
  if (!name?.trim()) return "?";
  return name.trim()[0].toUpperCase();
}

// ─── Local camera preview ────────────────────────────────────────────────────────
const LocalPreview = memo(
  ({
    stream,
    isVideoOn,
    isAudioOn,
    guestName,
  }: {
    stream: MediaStream | null;
    isVideoOn: boolean;
    isAudioOn: boolean;
    guestName: string;
  }) => {
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
      const el = videoRef.current;
      if (!el) return;
      if (stream && isVideoOn) {
        const videoTracks = stream.getVideoTracks();
        if (videoTracks.length > 0) {
          el.srcObject = new MediaStream(videoTracks);
          el.play().catch(() => {});
        } else {
          el.srcObject = null;
        }
      } else {
        el.srcObject = null;
      }
    }, [stream, isVideoOn]);

    return (
      <div
        className="relative w-full aspect-video rounded-2xl overflow-hidden"
        style={{ background: "linear-gradient(135deg,#1a1d26,#0f1117)" }}
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={cn(
            "w-full h-full object-cover scale-x-[-1]",
            (!isVideoOn || !stream) && "hidden",
          )}
        />
        {(!isVideoOn || !stream) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <div
              className="w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center font-bold text-xl sm:text-2xl text-white"
              style={{
                background:
                  "linear-gradient(135deg,rgba(99,102,241,0.4),rgba(139,92,246,0.4))",
                border: "2px solid rgba(99,102,241,0.3)",
              }}
            >
              {getInitial(guestName) || "?"}
            </div>
            {guestName && (
              <p className="text-xs font-medium" style={{ color: T.muted }}>
                {guestName}
              </p>
            )}
          </div>
        )}
        {/* Mic status */}
        <div
          className="absolute bottom-2 left-2 flex items-center gap-1.5 px-2 py-1 rounded-lg"
          style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)" }}
        >
          {isAudioOn ? (
            <Mic className="w-3 h-3 text-emerald-400" />
          ) : (
            <MicOff className="w-3 h-3 text-red-400" />
          )}
          <span className="text-[10px]" style={{ color: T.muted }}>
            {isAudioOn ? "Mic on" : "Mic off"}
          </span>
        </div>
        {/* Camera status badge */}
        {!isVideoOn && (
          <div
            className="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-md"
            style={{
              background: "rgba(239,68,68,0.2)",
              border: "1px solid rgba(239,68,68,0.3)",
            }}
          >
            <VideoOff className="w-3 h-3 text-red-400" />
            <span className="text-[10px] text-red-400">Camera off</span>
          </div>
        )}
      </div>
    );
  },
);

// ─── Pinnable tile ──────────────────────────────────────────────────────────────
const PinnableTile = memo(
  ({
    participant,
    activeSpeakerId,
    isPinned,
    onPin,
    className,
    isMain = false,
  }: {
    participant: DailyParticipant;
    activeSpeakerId: string | null;
    isPinned: boolean;
    onPin: (id: string | null) => void;
    className?: string;
    isMain?: boolean;
  }) => (
    <div
      className={cn(
        "relative group cursor-pointer select-none rounded-xl overflow-hidden",
        className,
      )}
      onClick={() => onPin(isPinned ? null : participant.session_id)}
    >
      <VideoTile
        participant={participant}
        isMain={isMain}
        activeSpeakerId={activeSpeakerId}
        className="w-full h-full"
      />
      {participant.handRaised && (
        <div
          className="absolute top-2 left-2 flex items-center gap-1 px-2 py-1 rounded-lg z-20"
          style={{ background: "rgba(245,158,11,0.9)", backdropFilter: "blur(8px)" }}
        >
          <span className="text-sm">✋</span>
        </div>
      )}
      <div
        className={cn(
          "absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold",
          "transition-all duration-150 opacity-0 group-hover:opacity-100",
          isPinned && "opacity-100",
        )}
        style={{
          background: isPinned ? "rgba(99,102,241,0.85)" : "rgba(0,0,0,0.55)",
          backdropFilter: "blur(8px)",
          color: "#fff",
        }}
      >
        {isPinned ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
        {isPinned ? "Unpin" : "Pin"}
      </div>
    </div>
  ),
);

// ─── Video grid ─────────────────────────────────────────────────────────────────
const VideoGrid = memo(
  ({
    participants,
    activeSpeakerId,
    isConnecting,
    error,
    onRetry,
    pinnedId,
    onPin,
    layout,
    onLayoutChange,
  }: {
    participants: DailyParticipant[];
    activeSpeakerId: string | null;
    isConnecting: boolean;
    error: string | null;
    onRetry: () => void;
    pinnedId: string | null;
    onPin: (id: string | null) => void;
    layout: VideoLayout;
    onLayoutChange: (l: VideoLayout) => void;
  }) => {
    if (error)
      return (
        <div className="h-full flex flex-col items-center justify-center gap-4 p-6 sm:p-8 text-center">
          <WifiOff className="w-10 h-10 text-red-400" />
          <div>
            <p className="text-sm font-semibold text-red-400 mb-1">Connection failed</p>
            <p className="text-xs max-w-xs" style={{ color: T.muted }}>
              {error}
            </p>
          </div>
          <button
            onClick={onRetry}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-white touch-manipulation"
            style={{
              background: "rgba(99,102,241,0.2)",
              border: "1px solid rgba(99,102,241,0.3)",
            }}
          >
            <RefreshCw className="w-4 h-4" /> Retry
          </button>
        </div>
      );

    if (isConnecting)
      return (
        <div className="h-full flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: T.accent }} />
          <p className="text-sm" style={{ color: T.muted }}>
            Joining meeting…
          </p>
        </div>
      );

    if (participants.length === 0)
      return (
        <div className="h-full flex flex-col items-center justify-center gap-3 text-center p-6">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center"
            style={{ background: T.card, border: `1px solid ${T.border}` }}
          >
            <Users className="w-8 h-8" style={{ color: T.subtle }} />
          </div>
          <p className="text-sm" style={{ color: T.muted }}>
            Waiting for others to join…
          </p>
        </div>
      );

    const LayoutSwitcher = (
      <div className="absolute top-2 sm:top-3 right-2 sm:right-3 z-20 flex items-center gap-1 sm:gap-1.5">
        {(["spotlight", "grid", "sidebar"] as VideoLayout[]).map((l) => {
          const icons = { spotlight: Maximize2, grid: LayoutGrid, sidebar: PanelRight };
          const Icon = icons[l];
          return (
            <button
              key={l}
              onClick={(e) => { e.stopPropagation(); onLayoutChange(l); }}
              className="w-7 h-7 rounded-lg flex items-center justify-center transition-all touch-manipulation"
              style={{
                background: layout === l ? "rgba(99,102,241,0.85)" : "rgba(0,0,0,0.45)",
                backdropFilter: "blur(8px)",
                border: `1px solid ${layout === l ? "rgba(99,102,241,0.5)" : "rgba(255,255,255,0.1)"}`,
              }}
            >
              <Icon className="w-3.5 h-3.5 text-white" />
            </button>
          );
        })}
      </div>
    );

    if (participants.length === 1)
      return (
        <div className="relative h-full">
          {LayoutSwitcher}
          <PinnableTile
            participant={participants[0]}
            activeSpeakerId={activeSpeakerId}
            isPinned={false}
            onPin={onPin}
            isMain
            className="h-full"
          />
        </div>
      );

    // FIX: previously this only ever followed a manual pin or the active
    // speaker — someone starting a screen share had no effect on what showed
    // in the main tile unless they also happened to be speaking or got
    // pinned. A screen share should automatically become the focus the
    // instant it starts (a manual pin still overrides it, same as before).
    const screenSharer = participants.find((p) => p.screen);
    const spotlightId =
      pinnedId ?? screenSharer?.session_id ?? activeSpeakerId ?? participants[0]?.session_id;
    const spotlight =
      participants.find((p) => p.session_id === spotlightId) ?? participants[0];
    const strip = participants.filter((p) => p.session_id !== spotlight.session_id);

    if (layout === "spotlight")
      return (
        <div className="relative h-full flex flex-col gap-2">
          {LayoutSwitcher}
          <div className="flex-1 min-h-0">
            <PinnableTile
              participant={spotlight}
              activeSpeakerId={activeSpeakerId}
              isPinned={!!pinnedId}
              onPin={onPin}
              isMain
              className="h-full"
            />
          </div>
          {strip.length > 0 && (
            <div
              className="flex gap-2 shrink-0 overflow-x-auto pb-1"
              style={{ height: "clamp(72px, 18%, 130px)" }}
            >
              {strip.map((p) => (
                <div
                  key={p.session_id}
                  className="shrink-0 rounded-xl overflow-hidden"
                  style={{ width: "clamp(100px, 150px, 200px)", height: "100%" }}
                >
                  <PinnableTile
                    participant={p}
                    activeSpeakerId={activeSpeakerId}
                    isPinned={pinnedId === p.session_id}
                    onPin={onPin}
                    className="h-full w-full"
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      );

    if (layout === "sidebar")
      return (
        <div className="relative h-full flex gap-2">
          {LayoutSwitcher}
          <div className="flex-1 min-w-0">
            <PinnableTile
              participant={spotlight}
              activeSpeakerId={activeSpeakerId}
              isPinned={!!pinnedId}
              onPin={onPin}
              isMain
              className="h-full"
            />
          </div>
          {strip.length > 0 && (
            <div
              className="flex flex-col gap-2 overflow-y-auto"
              style={{ width: "clamp(90px, 22%, 180px)" }}
            >
              {strip.map((p) => (
                <div
                  key={p.session_id}
                  className="shrink-0 rounded-xl overflow-hidden aspect-video"
                >
                  <PinnableTile
                    participant={p}
                    activeSpeakerId={activeSpeakerId}
                    isPinned={pinnedId === p.session_id}
                    onPin={onPin}
                    className="h-full w-full"
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      );

    // Grid
    const count = participants.length;
    const cols = count <= 2 ? 2 : count <= 4 ? 2 : count <= 6 ? 3 : 4;
    const rows = Math.ceil(count / cols);
    return (
      <div className="relative h-full">
        {LayoutSwitcher}
        <div
          className="h-full gap-2"
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gridTemplateRows: `repeat(${rows}, 1fr)`,
          }}
        >
          {participants.map((p) => (
            <PinnableTile
              key={p.session_id}
              participant={p}
              activeSpeakerId={activeSpeakerId}
              isPinned={pinnedId === p.session_id}
              onPin={onPin}
              className="h-full"
            />
          ))}
        </div>
      </div>
    );
  },
);

// ─── "Someone is presenting" banner with Stop control (matches host page) ───────
const PresentingBanner = memo(({ isSelfPresenting, presenterName, onStop }: {
  isSelfPresenting: boolean;
  presenterName: string | null;
  onStop: () => void;
}) => {
  if (!isSelfPresenting && !presenterName) return null;
  return (
    <div
      className="absolute z-30 left-1/2 -translate-x-1/2 flex items-center gap-2 pl-3 pr-1.5 py-1.5 rounded-full"
      style={{
        top: "max(10px, env(safe-area-inset-top))",
        background: "rgba(79,70,229,0.94)",
        backdropFilter: "blur(14px)",
        boxShadow: "0 6px 20px rgba(79,70,229,0.4)",
      }}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-white shrink-0" style={{ animation: "soundwave 1.1s ease-in-out infinite alternate" }} />
      <span className="text-[11px] font-semibold text-white whitespace-nowrap">
        {isSelfPresenting ? "You're presenting" : `${presenterName} is presenting`}
      </span>
      {isSelfPresenting && (
        <button
          onClick={onStop}
          className="flex items-center gap-1 pl-2 pr-2.5 py-1 rounded-full text-[10px] font-bold text-white touch-manipulation min-h-[28px]"
          style={{ background: "rgba(0,0,0,0.25)" }}
        >
          <MonitorOff className="w-3 h-3" /> Stop
        </button>
      )}
    </div>
  );
});

// ─── Draggable / resizable / expandable self-view (PiP) ─────────────────────────
// Camera self-view: portrait-ish (matches a phone's front camera). Enlarged
// from the original { sm: 84x112, md: 114x152 } — that was too small to
// actually see yourself clearly. Aspect ratio (3:4) kept, just scaled up.
const CAM_PIP_SIZES = { sm: { w: 132, h: 176 }, md: { w: 176, h: 235 } } as const;

// FIX: while you're screen-sharing, this same PiP automatically switches to
// showing your own screen-share preview instead of your camera (see
// VideoTile's isScreenShare logic) — but it was still being boxed into the
// small *portrait* camera size above, which both cropped/shrank a widescreen
// desktop capture and made any on-screen text unreadable. Screen content
// gets its own, much bigger, landscape (16:9) box instead.
const SCREEN_PIP_SIZES = { sm: { w: 220, h: 124 }, md: { w: 300, h: 169 } } as const;

const DraggablePiP = memo(({
  participant, containerRef, onExpand, onSwitchCamera, fit = "cover",
}: {
  participant: DailyParticipant;
  containerRef: React.RefObject<HTMLDivElement>;
  onExpand: () => void;
  onSwitchCamera: () => void;
  fit?: "cover" | "contain";
}) => {
  const [size, setSize] = useState<"sm" | "md">("md");
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const draggingRef = useRef(false);
  const dragStartRef = useRef<{ x: number; y: number; origX: number; origY: number } | null>(null);
  // Screen-share previews get the bigger landscape box; camera previews keep
  // the portrait one. `participant.screen` flips automatically the instant
  // this participant starts/stops sharing, so the box resizes (and repositions
  // via the effect below) right along with it — no separate prop needed.
  const dims = participant.screen ? SCREEN_PIP_SIZES[size] : CAM_PIP_SIZES[size];

  const clamp = useCallback((x: number, y: number) => {
    const c = containerRef.current;
    const pad = 10;
    if (!c) return { x: Math.max(pad, x), y: Math.max(pad, y) };
    const b = c.getBoundingClientRect();
    const maxX = Math.max(pad, b.width - dims.w - pad);
    const maxY = Math.max(pad, b.height - dims.h - pad);
    return { x: Math.min(Math.max(pad, x), maxX), y: Math.min(Math.max(pad, y), maxY) };
  }, [containerRef, dims.w, dims.h]);

  // Initial resting spot: top-right, below the presenting banner / safe area.
  useEffect(() => {
    if (pos) return;
    const c = containerRef.current;
    if (!c) return;
    const b = c.getBoundingClientRect();
    setPos(clamp(b.width - dims.w - 12, 52));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the PiP on-screen if the viewport (or size) changes.
  useEffect(() => {
    if (!pos) return;
    setPos((p) => (p ? clamp(p.x, p.y) : p));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dims.w, dims.h]);

  useEffect(() => {
    const onResize = () => setPos((p) => (p ? clamp(p.x, p.y) : p));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [clamp]);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    dragStartRef.current = { x: e.clientX, y: e.clientY, origX: pos?.x ?? 0, origY: pos?.y ?? 0 };
    draggingRef.current = false;
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const start = dragStartRef.current;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (!draggingRef.current && Math.hypot(dx, dy) < 5) return;
    draggingRef.current = true;
    setPos(clamp(start.origX + dx, start.origY + dy));
  };
  const onPointerUp = () => {
    const wasDragging = draggingRef.current;
    dragStartRef.current = null;
    draggingRef.current = false;
    if (!wasDragging || !pos || !containerRef.current) return;
    // Snap to nearest side, like a native PiP window.
    const b = containerRef.current.getBoundingClientRect();
    const snappedX = pos.x + dims.w / 2 < b.width / 2 ? 10 : b.width - dims.w - 10;
    setPos(clamp(snappedX, pos.y));
  };

  if (!pos) return null;

  return (
    <div
      role="group"
      aria-label={participant.local ? "Your video preview, drag to reposition" : `${participant.user_name}'s video`}
      className="absolute z-20 rounded-2xl overflow-hidden touch-none select-none"
      style={{
        width: dims.w, height: dims.h,
        left: pos.x, top: pos.y,
        boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
        border: "1.5px solid rgba(255,255,255,0.16)",
        transition: draggingRef.current ? "none" : "left 0.22s cubic-bezier(.32,.72,0,1), top 0.22s cubic-bezier(.32,.72,0,1), width 0.18s ease, height 0.18s ease",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <VideoTile participant={participant} activeSpeakerId={null} className="w-full h-full" fit={fit} />

      <div className="absolute top-1 right-1 flex items-center gap-1">
        {!participant.screen && (
          <button
            onClick={(e) => { e.stopPropagation(); onSwitchCamera(); }}
            aria-label="Switch camera"
            className="w-6 h-6 rounded-lg flex items-center justify-center touch-manipulation"
            style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)" }}
          >
            <SwitchCamera className="w-3 h-3 text-white" />
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onExpand(); }}
          aria-label="Expand to full screen"
          className="w-6 h-6 rounded-lg flex items-center justify-center touch-manipulation"
          style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)" }}
        >
          <Maximize2 className="w-3 h-3 text-white" />
        </button>
      </div>

      <button
        onClick={(e) => { e.stopPropagation(); setSize((s) => (s === "sm" ? "md" : "sm")); }}
        aria-label={size === "sm" ? "Enlarge preview" : "Shrink preview"}
        className="absolute bottom-1 left-1 w-5 h-5 rounded-md flex items-center justify-center touch-manipulation"
        style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)" }}
      >
        <span
          className="block rounded-[2px] border border-white/80"
          style={{ width: size === "sm" ? 7 : 9, height: size === "sm" ? 7 : 9 }}
        />
      </button>
    </div>
  );
});

// ─── Mobile video stage: full-bleed main tile + floating PiP self-view ─────────
// Used instead of VideoGrid on mobile once 2+ participants are present — for
// 0/1 participants VideoGrid's existing waiting/solo states already cover it.
const MobileVideoStage = memo(({
  participants, activeSpeakerId, pinnedId, onPin, onSwitchCamera, onStopShare,
}: {
  participants: DailyParticipant[];
  activeSpeakerId: string | null;
  pinnedId: string | null;
  onPin: (id: string | null) => void;
  onSwitchCamera: () => void;
  onStopShare: () => void;
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const local = participants.find((p) => p.local) ?? null;
  const remotePresenter = participants.find((p) => p.screen && !p.local) ?? null;
  const selfPresenting = !!local?.screen;

  const mainParticipant =
    remotePresenter
    ?? (pinnedId && participants.find((p) => p.session_id === pinnedId))
    ?? (activeSpeakerId && participants.find((p) => p.session_id === activeSpeakerId && !p.local))
    ?? participants.find((p) => !p.local)
    ?? local;

  const pipParticipant = local && mainParticipant?.session_id !== local.session_id ? local : null;

  return (
    <div ref={containerRef} className="relative w-full h-full rounded-2xl overflow-hidden">
      {mainParticipant && (
        <VideoTile
          participant={mainParticipant}
          isMain
          activeSpeakerId={activeSpeakerId}
          className="w-full h-full"
          fit={mainParticipant.screen ? "contain" : "cover"}
        />
      )}

      <PresentingBanner
        isSelfPresenting={selfPresenting}
        presenterName={remotePresenter && !selfPresenting ? (remotePresenter.user_name?.replace(/\s*\(You\)\s*$/i, "").trim() ?? "Someone") : null}
        onStop={onStopShare}
      />

      {mainParticipant?.local && (
        <button
          onClick={() => onPin(null)}
          aria-label="Back to call view"
          className="absolute z-30 left-2 w-8 h-8 rounded-lg flex items-center justify-center touch-manipulation"
          style={{ top: "max(10px, env(safe-area-inset-top))", background: "rgba(0,0,0,0.55)", backdropFilter: "blur(8px)" }}
        >
          <Minimize2 className="w-4 h-4 text-white" />
        </button>
      )}

      {pipParticipant && (
        <DraggablePiP
          participant={pipParticipant}
          containerRef={containerRef}
          onExpand={() => onPin(pipParticipant.session_id)}
          onSwitchCamera={onSwitchCamera}
          fit={pipParticipant.screen ? "contain" : "cover"}
        />
      )}
    </div>
  );
});

// ─── Mobile bottom sheet — real swipe-up / swipe-down-to-dismiss gesture ────────
const MobileSheet = memo(({ open, onClose, title, children }: any) => {
  const sheetRef = useRef<HTMLDivElement>(null);
  const [dragY, setDragY] = useState(0);
  const dragging = useRef(false);
  const start = useRef<{ y: number } | null>(null);

  useEffect(() => { if (open) setDragY(0); }, [open]);

  const onPointerDown = (e: React.PointerEvent) => {
    const scroller = sheetRef.current?.querySelector("[data-sheet-scroll]") as HTMLElement | null;
    const fromHandle = (e.target as HTMLElement).closest("[data-sheet-handle]");
    if (!fromHandle && scroller && scroller.scrollTop > 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    start.current = { y: e.clientY };
    dragging.current = false;
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!start.current) return;
    const dy = e.clientY - start.current.y;
    if (dy <= 0) return;
    dragging.current = true;
    setDragY(dy);
  };
  const onPointerUp = () => {
    if (!start.current) return;
    const wasDragging = dragging.current;
    start.current = null;
    dragging.current = false;
    if (wasDragging && dragY > 110) onClose();
    setDragY(0);
  };

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden transition-opacity duration-300",
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
        )}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl flex flex-col md:hidden touch-none"
        style={{
          background: T.panel,
          backdropFilter: "blur(24px)",
          border: `1px solid ${T.border}`,
          boxShadow: "0 -12px 40px rgba(0,0,0,0.45)",
          maxHeight: "70dvh",
          paddingBottom: "env(safe-area-inset-bottom)",
          transform: open ? `translateY(${dragY}px)` : "translateY(100%)",
          transition: dragging.current ? "none" : "transform 0.32s cubic-bezier(.32,.72,0,1)",
          opacity: open ? Math.max(1 - dragY / 400, 0.4) : 1,
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div
          data-sheet-handle
          className="relative flex items-center justify-between px-4 pt-5 pb-3 border-b shrink-0 cursor-grab active:cursor-grabbing"
          style={{ borderColor: T.border }}
        >
          <div className="w-10 h-1 rounded-full absolute top-2 left-1/2 -translate-x-1/2" style={{ background: T.subtle }} />
          <span className="text-sm font-semibold" style={{ color: T.text }}>{title}</span>
          <button
            onClick={onClose}
            aria-label={`Close ${title}`}
            className="w-8 h-8 rounded-lg flex items-center justify-center touch-manipulation"
            style={{ background: T.card }}
          >
            <X className="w-4 h-4" style={{ color: T.muted }} />
          </button>
        </div>
        <div data-sheet-scroll className="flex-1 overflow-y-auto overscroll-contain touch-pan-y">{children}</div>
      </div>
    </>
  );
});

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────────
export default function GuestJoin() {
  const { roomName } = useParams<{ roomName: string }>();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const [step, setStep] = useState<JoinStep>("lobby");
  const [guestName, setGuestName] = useState("");
  const [isAudioOn, setIsAudioOn] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [videoLayout, setVideoLayout] = useState<VideoLayout>("spotlight");
  const [showPeople, setShowPeople] = useState(false);
  const [isHandRaised, setIsHandRaised] = useState(false);

  // The real Daily meeting token, exchanged once the guest is admitted.
  const guestDailyTokenRef = useRef<string | null>(null);
  const voluntaryLeaveRef = useRef(false);

  // FIX: guest speech was never transcribed — GuestJoin had no MediaRecorder
  // and never called transcribe-guest-stream. The raw guest_session_token
  // (minted by guest-request-status on admission — distinct from the Daily
  // meeting token exchanged from it above) is kept in state so it can be
  // handed to useGuestAudioStreaming, which authorizes each chunk with it.
  // transcribe-guest-stream resolves call_id server-side from this token, so
  // this page never needs to know its own call_id.
  const [guestAuthToken, setGuestAuthToken] = useState<string | null>(null);
  // FIX: the call's real, DB-backed start_time (returned by
  // guest-request-status as `call_start_time` once admitted). Anchoring the
  // timer to this instead of this tab's own join instant is what keeps the
  // guest's timer in sync with the host's — see sharedStartTime doc comment
  // in useDailyCall.ts.
  const [callStartTime, setCallStartTime] = useState<string | null>(null);
  const [callMicStream, setCallMicStream] = useState<MediaStream | null>(null);
  const health = useMeetingHealth(null, callMicStream ?? localStream);
  const guestAudio = useGuestAudioStreaming({
    guestToken: guestAuthToken,
    onTranscript: (text) => health.recordTranscriptReceived(text.split(/\s+/).length),
  });
  const guestTrackStartedRef = useRef(false);

  // FIX: mirrors the host's auto-reconnect in LiveMeeting.tsx. useDailyCall
  // already self-heals brief transport blips internally, but once THAT is
  // exhausted the call drops to a full "error" state. The host page auto-
  // rejoins up to 3 more times with backoff when that happens; this guest
  // page previously had no equivalent — a guest whose connection dropped on
  // a flaky network just saw a "Connection failed" screen and had to notice
  // and manually tap Retry, easily missing part (or all) of the meeting.
  const [reconnectCount, setReconnectCount] = useState(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // Start camera preview immediately on mount — don't wait for user input.
  // Pulled out into a standalone, re-callable function: previously this only
  // ran once on mount, so if the guest denied the permission prompt (or a
  // camera/mic was busy in another app) there was no way to recover — the
  // Mic/Camera buttons below just flipped their own on/off label with no
  // actual stream behind them, which is why they looked "unavailable"
  // forever even after the guest fixed the underlying permission.
  const requestMedia = useCallback(async () => {
    setMediaError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      setLocalStream(stream);
      setIsAudioOn(true);
      setIsVideoOn(true);
      return true;
    } catch {
      // Try audio only
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        setLocalStream(stream);
        setIsAudioOn(true);
        setIsVideoOn(false);
        setMediaError("Camera unavailable — audio only. Check your browser's camera permission.");
        return true;
      } catch {
        // Neither camera nor mic could be acquired — surface this clearly and
        // turn both toggles "off" so they reflect reality (nothing is live)
        // instead of showing a misleading "on" state with no stream.
        setLocalStream(null);
        setIsAudioOn(false);
        setIsVideoOn(false);
        setMediaError("Camera & microphone unavailable. Check your browser's site permissions, then tap to retry.");
        return false;
      }
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      const result = await requestMedia();
      if (!active) return;
      // requestMedia already applied its own state; nothing further needed.
      void result;
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cleanup local stream on unmount
  useEffect(() => {
    return () => {
      localStream?.getTracks().forEach((t) => t.stop());
    };
  }, [localStream]);

  const daily = useDailyCall({
    callId: null,
    roomName: step === "admitted" ? (roomName ?? null) : null,
    userName: guestName.trim() || "Guest",
    startWithAudioOff: !isAudioOn,
    startWithVideoOff: !isVideoOn,
    // FIX: anchors this guest's timer to the same wall-clock start_time the
    // host's timer uses, instead of the moment this guest happened to join.
    sharedStartTime: callStartTime,
    onJoined: () => { setStep("admitted"); setReconnectCount(0); },
    onNetworkQualityChange: (q) => health.updateDailyNetworkQuality(q),
    onLeft: () => {
      if (voluntaryLeaveRef.current) {
        navigate("/");
        return;
      }
      // IMPORTANT: this fires when THIS guest's own connection drops out of
      // the call (network blip, ICE failure, etc). It has nothing to do with
      // whether the host is still in the meeting — Daily gives us no signal
      // here that the host ended anything, and the room is very likely still
      // live for everyone else. Claiming "the host has ended this meeting"
      // was simply wrong in this case, so instead we show a dedicated
      // "disconnected" screen with a retry/rejoin control and let the guest
      // (or the auto-reconnect effect below) attempt to rejoin, rather than
      // guessing what happened and bouncing them back to the homepage.
      setStep("disconnected");
    },
    onParticipantJoined: (p) => toast.info(`${p.user_name || "Someone"} joined`),
    onParticipantLeft: (_sid, wasOwner) => {
      // This IS a reliable, evidence-based signal (the host's own
      // participant actually left) — unlike guessing from our own
      // connection dropping, so it's safe to surface. It's informational
      // only: the Daily room stays live, so we don't force a disconnect.
      if (wasOwner) {
        toast.info("The host has left the meeting.", { duration: 6000 });
      }
    },
    onHandRaiseChange: (_sid, raised, uname) => {
      if (raised) toast.info(`✋ ${uname} raised their hand`, { duration: 5000 });
    },
  });

  // FIX: auto-reconnect after a full transport error, same policy as the
  // host page (3 attempts, exponential backoff capped at 8s). Manual Retry
  // button (handleRetryJoin / onRetry below) still remains as a fallback
  // once attempts are exhausted.
  useEffect(() => {
    if (daily.callState === "error" && step === "admitted" && reconnectCount < 3 && roomName) {
      setReconnectCount((c) => c + 1);
      health.recordReconnect();
      const delay = Math.min(1000 * Math.pow(2, reconnectCount), 8000);
      reconnectTimerRef.current = setTimeout(() => {
        daily.joinCall({
          rName: roomName,
          token: guestDailyTokenRef.current ?? undefined,
          displayName: guestName.trim() || "Guest",
        });
      }, delay);
    }
    return () => clearTimeout(reconnectTimerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daily.callState]);

  // Auto-reconnect after a FULL disconnect (left-meeting), same bounded
  // policy as above. This covers the case above's "error" state doesn't:
  // when the guest's call object fully leaves the meeting rather than
  // dropping into an in-call "error" state, onLeft routes here instead of
  // assuming the meeting ended. We quietly try to rejoin a few times before
  // asking the guest to tap Retry themselves.
  useEffect(() => {
    if (step === "disconnected" && reconnectCount < 3 && roomName) {
      setReconnectCount((c) => c + 1);
      health.recordReconnect();
      const delay = Math.min(1000 * Math.pow(2, reconnectCount), 8000);
      reconnectTimerRef.current = setTimeout(() => {
        daily.joinCall({
          rName: roomName,
          token: guestDailyTokenRef.current ?? undefined,
          displayName: guestName.trim() || "Guest",
        });
      }, delay);
    }
    return () => clearTimeout(reconnectTimerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // FIX: wire up guest transcription. Mirrors the host's tracksStartedRef
  // pattern in LiveMeeting.tsx — attach the recorder to the guest's own
  // local Daily audio track (so it reflects live mute state) as soon as it's
  // available post-join, rather than a separate getUserMedia stream.
  useEffect(() => {
    if (step !== "admitted" || guestTrackStartedRef.current) return;
    const localP = daily.participants.find((p) => p.local);
    if (localP?.audioTrack) {
      guestTrackStartedRef.current = true;
      guestAudio.startTrackRecording(localP.audioTrack);
      setCallMicStream(new MediaStream([localP.audioTrack]));
    }
    // guestAudio omitted intentionally: it's a fresh object every render, and
    // startTrackRecording is idempotent per the ref guard above. useGuestAudioStreaming
    // stops itself internally on unmount, so no separate cleanup effect is needed here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, daily.participants]);

  /**
   * Exchange the guest_session_token (minted by guest-request-status the
   * moment the host admits this guest) for a real Daily.co meeting token.
   * Without this, joinCall() runs with token: undefined and the connection
   * is fragile — any transient network hiccup permanently disconnects the
   * transport because Daily can't refresh permissions for an anonymous,
   * tokenless participant ("send transport changed to disconnected").
   */
  const exchangeForDailyToken = useCallback(async (guestSessionToken: string, displayName: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("get-guest-daily-token", {
        body: { guest_token: guestSessionToken, display_name: displayName },
      });
      if (error) throw error;
      if (!data?.token) throw new Error(data?.error || "No token returned");
      return data.token as string;
    } catch (err: any) {
      console.error("[GuestJoin] Failed to exchange guest token:", err);
      return null;
    }
  }, []);

  // Poll for admission status
  useEffect(() => {
    if (step !== "waiting" || !requestId) return;
    const interval = setInterval(async () => {
      try {
        const { data } = await supabase.functions.invoke("guest-request-status", {
          body: { id: requestId },
        });

        if (data?.status === "admitted") {
          clearInterval(interval);

          if (data.call_start_time) setCallStartTime(data.call_start_time);

          const displayName = guestName.trim() || "Guest";
          let dailyToken: string | null = null;
          if (data.guest_token) {
            dailyToken = await exchangeForDailyToken(data.guest_token, displayName);
            // Keep the raw guest_session_token too — transcribe-guest-stream
            // authorizes with this one, not the exchanged Daily token.
            setGuestAuthToken(data.guest_token);
          }
          guestDailyTokenRef.current = dailyToken;

          if (!dailyToken) {
            console.warn("[GuestJoin] Joining without a Daily token — connection may be unstable.");
          }

          // Stop local preview stream before Daily takes over
          localStream?.getTracks().forEach((t) => t.stop());
          setLocalStream(null);
          setStep("admitted");
          daily.joinCall({
            rName: data.room_name || roomName!,
            token: dailyToken ?? undefined,
            displayName,
          });
        } else if (data?.status === "denied" || data?.status === "expired") {
          clearInterval(interval);
          setStep("denied");
        }
      } catch {
        // Poll silently
      }
    }, 2000); // Poll every 2s for faster admission detection

    return () => clearInterval(interval);
  }, [step, requestId, roomName, guestName, localStream, daily, exchangeForDailyToken]);

  const handleRequestJoin = useCallback(async () => {
    const name = guestName.trim();
    if (!name || !roomName) return;
    setStep("requesting");
    try {
      const { data, error } = await supabase.functions.invoke("guest-join-request", {
        body: { room_name: roomName, guest_name: name },
      });
      if (error) throw error;
      setRequestId(data?.request_id ?? null);
      setStep("waiting");
    } catch (err: any) {
      toast.error(err?.message || "Couldn't send join request. Check the meeting link.");
      setStep("lobby");
    }
  }, [guestName, roomName]);

  const handleLeave = useCallback(async () => {
    voluntaryLeaveRef.current = true;
    guestAudio.stopAll();
    localStream?.getTracks().forEach((t) => t.stop());
    await daily.leaveCall();
    navigate("/");
  }, [localStream, daily, navigate, guestAudio]);

  const handleToggleMic = useCallback(async () => {
    if (step === "admitted") {
      await daily.setAudioEnabled(!isAudioOn);
      setIsAudioOn((v) => !v);
      return;
    }
    if (!localStream || localStream.getAudioTracks().length === 0) {
      // No live mic track (denied/busy earlier) — tapping the button is the
      // guest's retry gesture, so re-request permission instead of just
      // toggling a label that has nothing behind it.
      await requestMedia();
      return;
    }
    localStream.getAudioTracks().forEach((t) => { t.enabled = !isAudioOn; });
    setIsAudioOn((v) => !v);
  }, [step, daily, isAudioOn, localStream, requestMedia]);

  const handleToggleCam = useCallback(async () => {
    if (step === "admitted") {
      await daily.setVideoEnabled(!isVideoOn);
      setIsVideoOn((v) => !v);
      return;
    }
    if (!localStream || localStream.getVideoTracks().length === 0) {
      await requestMedia();
      return;
    }
    localStream.getVideoTracks().forEach((t) => { t.enabled = !isVideoOn; });
    setIsVideoOn((v) => !v);
  }, [step, daily, isVideoOn, localStream, requestMedia]);

  const handleScreenShare = useCallback(async () => {
    if (daily.isScreenSharing) {
      await daily.stopScreenShare();
    } else {
      await daily.startScreenShare();
    }
  }, [daily]);

  const handleHandRaise = useCallback(async () => {
    const next = !isHandRaised;
    setIsHandRaised(next);
    await daily.raiseHand(next);
  }, [isHandRaised, daily]);

  const handleRetryJoin = useCallback(() => {
    if (!roomName) return;
    // Manual retry always gets a fresh budget of auto-reconnect attempts,
    // so a guest who taps Retry after the automatic attempts ran out isn't
    // silently left with none remaining if this rejoin also has to recover.
    setReconnectCount(0);
    clearTimeout(reconnectTimerRef.current);
    daily.joinCall({
      rName: roomName,
      token: guestDailyTokenRef.current ?? undefined,
      displayName: guestName.trim() || "Guest",
    });
  }, [roomName, guestName, daily]);

  const handRaiseCount = useMemo(
    () => daily.participants.filter((p) => p.handRaised).length,
    [daily.participants],
  );

  // ── DISCONNECTED ──────────────────────────────────────────────────────────────
  // Shown when THIS guest's own connection drops out of the call. We never
  // claim the host ended the meeting here — we simply don't know that, and
  // the meeting is very likely still live for everyone else. The auto-retry
  // effect above keeps trying quietly in the background; this screen just
  // keeps the guest informed and gives them a manual way to try again.
  if (step === "disconnected") {
    const attemptsExhausted = reconnectCount >= 3;
    return (
      <div
        className="min-h-dvh flex flex-col items-center justify-center p-3 sm:p-6"
        style={{ background: T.bg }}
      >
        <div
          className="w-full max-w-sm rounded-2xl p-6 sm:p-8 flex flex-col items-center text-center gap-4"
          style={{ background: T.panel, border: `1px solid ${T.border}` }}
        >
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{ background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.3)" }}
          >
            <WifiOff className="w-7 h-7 text-amber-400" />
          </div>

          <div>
            <p className="text-sm font-semibold text-white mb-1">
              You've been disconnected
            </p>
            <p className="text-xs max-w-xs" style={{ color: T.muted }}>
              Your connection dropped — the meeting is likely still going on
              without you.{" "}
              {attemptsExhausted
                ? "Tap below to try rejoining."
                : "Trying to reconnect automatically…"}
            </p>
          </div>

          {!attemptsExhausted && (
            <Loader2 className="w-5 h-5 animate-spin" style={{ color: T.accent }} />
          )}

          <div className="w-full flex flex-col gap-2 mt-1">
            <button
              onClick={handleRetryJoin}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-[0.98] touch-manipulation min-h-[48px]"
              style={{ background: "linear-gradient(135deg,#4f46e5,#7c3aed)" }}
            >
              <RefreshCw className="w-4 h-4" /> Rejoin meeting
            </button>
            <button
              onClick={() => {
                voluntaryLeaveRef.current = true;
                navigate("/");
              }}
              className="w-full py-3 rounded-xl text-xs font-medium touch-manipulation min-h-[44px]"
              style={{ background: T.card, border: `1px solid ${T.border}`, color: T.muted }}
            >
              Leave
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── LOBBY ─────────────────────────────────────────────────────────────────────
  if (step !== "admitted") {
    return (
      <div
        className="min-h-dvh flex flex-col items-center justify-center p-3 sm:p-6"
        style={{ background: T.bg }}
      >
        <div className="w-full max-w-md">
          {/* Branding */}
          <div className="text-center mb-5 sm:mb-6">
            <div
              className="w-10 h-10 rounded-xl mx-auto mb-3 flex items-center justify-center"
              style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)" }}
            >
              <Video className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-lg sm:text-xl font-bold text-white">Join Meeting</h1>
            {roomName && (
              <p className="text-xs mt-1" style={{ color: T.muted }}>
                {roomName.replace(/-/g, " ")}
              </p>
            )}
          </div>

          <div
            className="rounded-2xl p-3.5 sm:p-6 space-y-3.5 sm:space-y-4"
            style={{ background: T.panel, border: `1px solid ${T.border}` }}
          >
            {/* Camera preview — shows immediately */}
            <LocalPreview
              stream={localStream}
              isVideoOn={isVideoOn}
              isAudioOn={isAudioOn}
              guestName={guestName}
            />

            {/* Media error */}
            {mediaError && (
              <div
                className="flex items-start gap-2 px-3 py-2.5 rounded-xl text-left"
                style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}
              >
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-red-400" />
                <p className="text-[11px] leading-snug" style={{ color: "rgba(255,255,255,0.65)" }}>
                  {mediaError}
                  {!localStream && (
                    <span className="block mt-0.5 font-medium text-red-300">
                      Tap Mic or Camera below to try again.
                    </span>
                  )}
                </p>
              </div>
            )}

            {/* Mic / Camera toggles */}
            <div className="flex gap-2 sm:gap-3">
              <button
                onClick={handleToggleMic}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs sm:text-sm font-medium transition-all touch-manipulation min-h-[44px]"
                style={
                  isAudioOn
                    ? {
                        background: "rgba(255,255,255,0.08)",
                        border: `1px solid ${T.border}`,
                        color: "#fff",
                      }
                    : {
                        background: "rgba(239,68,68,0.12)",
                        border: "1px solid rgba(239,68,68,0.3)",
                        color: "#f87171",
                      }
                }
              >
                {isAudioOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                {isAudioOn ? "Mic on" : "Mic off"}
              </button>
              <button
                onClick={handleToggleCam}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs sm:text-sm font-medium transition-all touch-manipulation min-h-[44px]"
                style={
                  isVideoOn
                    ? {
                        background: "rgba(255,255,255,0.08)",
                        border: `1px solid ${T.border}`,
                        color: "#fff",
                      }
                    : {
                        background: "rgba(239,68,68,0.12)",
                        border: "1px solid rgba(239,68,68,0.3)",
                        color: "#f87171",
                      }
                }
              >
                {isVideoOn ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
                {isVideoOn ? "Camera on" : "Camera off"}
              </button>
            </div>

            {/* Name input */}
            {step !== "denied" && (
              <div>
                <label
                  className="block text-xs font-medium mb-1.5"
                  style={{ color: T.muted }}
                >
                  Your name
                </label>
                <input
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  onKeyDown={(e) =>
                    e.key === "Enter" && guestName.trim() && handleRequestJoin()
                  }
                  placeholder="Enter your name…"
                  className="w-full px-4 py-3 rounded-xl outline-none text-sm min-h-[44px]"
                  style={{
                    background: T.card,
                    border: `1px solid ${T.border}`,
                    color: T.text,
                  }}
                  autoFocus
                />
              </div>
            )}

            {/* Status messages */}
            {step === "waiting" && (
              <div
                className="flex items-center gap-3 px-4 py-3 rounded-xl"
                style={{
                  background: "rgba(99,102,241,0.08)",
                  border: "1px solid rgba(99,102,241,0.2)",
                }}
              >
                <Loader2 className="w-4 h-4 animate-spin text-indigo-400 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-white">Waiting for the host</p>
                  <p className="text-[11px]" style={{ color: T.muted }}>
                    The host will admit you shortly
                  </p>
                </div>
              </div>
            )}

            {step === "denied" && (
              <div
                className="flex items-center gap-3 px-4 py-3 rounded-xl"
                style={{
                  background: "rgba(239,68,68,0.08)",
                  border: "1px solid rgba(239,68,68,0.2)",
                }}
              >
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-red-400">Entry not allowed</p>
                  <p className="text-[11px]" style={{ color: T.muted }}>
                    The host declined your request
                  </p>
                </div>
              </div>
            )}

            {/* CTA */}
            {step !== "denied" ? (
              <button
                onClick={handleRequestJoin}
                disabled={
                  !guestName.trim() || step === "requesting" || step === "waiting"
                }
                className="w-full py-3.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-[0.98] touch-manipulation disabled:opacity-50 disabled:pointer-events-none min-h-[48px]"
                style={{ background: "linear-gradient(135deg,#4f46e5,#7c3aed)" }}
              >
                {step === "requesting" ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Sending request…
                  </span>
                ) : step === "waiting" ? (
                  <span className="flex items-center justify-center gap-2">
                    <Clock className="w-4 h-4" /> Waiting for host…
                  </span>
                ) : (
                  "Ask to join"
                )}
              </button>
            ) : (
              <button
                onClick={() => { setStep("lobby"); setRequestId(null); }}
                className="w-full py-3.5 rounded-xl text-sm font-semibold text-white touch-manipulation min-h-[48px]"
                style={{ background: T.card, border: `1px solid ${T.border}` }}
              >
                Try again
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── IN MEETING ────────────────────────────────────────────────────────────────
  return (
    <div
      className="flex flex-col overflow-hidden"
      style={{ height: "100dvh", background: T.bg }}
    >
      {/* Top bar */}
      <div
        className="flex items-center justify-between px-2.5 sm:px-4 py-2 sm:py-2.5 border-b shrink-0 gap-1.5 sm:gap-2"
        style={{
          borderColor: T.border,
          background: T.panel,
          backdropFilter: "blur(20px)",
        }}
      >
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
          <div className="flex items-center gap-1.5 shrink-0">
            <span
              className="w-2 h-2 rounded-full bg-emerald-400"
              style={{ boxShadow: "0 0 8px rgba(16,185,129,.8)" }}
            />
            <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-widest hidden sm:block">
              Live
            </span>
          </div>
          <div
            className="h-4 w-px shrink-0 hidden sm:block"
            style={{ background: T.border }}
          />
          <span className="text-xs sm:text-sm font-semibold text-white truncate">
            {roomName?.replace(/-/g, " ") || "Meeting"}
          </span>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3" style={{ color: T.muted }} />
            <span className="text-[11px] sm:text-xs font-mono font-semibold text-white tabular-nums">
              {fmt(daily.elapsedSeconds)}
            </span>
          </div>
          <MeetingHealthBar health={health.health} isStreaming={guestAudio.state?.isStreaming ?? false} />
          {handRaiseCount > 0 && (
            <div
              className="flex items-center gap-1 px-1.5 sm:px-2 py-1 rounded-lg"
              style={{ background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.25)" }}
            >
              <span className="text-xs">✋</span>
              <span className="text-[10px] font-bold text-amber-400">{handRaiseCount}</span>
            </div>
          )}
          <button
            onClick={() => setShowPeople((v) => !v)}
            className="relative w-8 h-8 rounded-xl flex items-center justify-center touch-manipulation"
            style={{
              background: showPeople ? "rgba(99,102,241,0.2)" : T.card,
              border: `1px solid ${T.border}`,
            }}
          >
            <Users className="w-4 h-4 text-white" />
            {daily.participantCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-indigo-500 text-white text-[9px] font-bold flex items-center justify-center">
                {daily.participantCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Video — full-bleed stage with a draggable self-view on mobile once a
          second participant is present, matching the host's LiveMeeting page */}
      <div className="flex-1 min-h-0 p-1 sm:p-3">
        {isMobile && !daily.isConnecting && !daily.error && daily.participants.length >= 2 ? (
          <MobileVideoStage
            participants={daily.participants}
            activeSpeakerId={daily.activeSpeakerId}
            pinnedId={pinnedId}
            onPin={setPinnedId}
            onSwitchCamera={() => daily.switchCamera()}
            onStopShare={handleScreenShare}
          />
        ) : (
          <VideoGrid
            participants={daily.participants}
            activeSpeakerId={daily.activeSpeakerId}
            isConnecting={daily.isConnecting}
            error={daily.error}
            onRetry={handleRetryJoin}
            pinnedId={pinnedId}
            onPin={setPinnedId}
            layout={videoLayout}
            onLayoutChange={setVideoLayout}
          />
        )}
      </div>

      {/* Control bar */}
      <div className="px-1.5 sm:px-3 pb-1.5 sm:pb-3 shrink-0" style={{ paddingBottom: "max(6px, env(safe-area-inset-bottom))" }}>
        <div
          className="flex items-center justify-center gap-1 sm:gap-2 px-1.5 sm:px-3 py-2 sm:py-2.5 rounded-2xl flex-wrap"
          style={{
            background: "rgba(13,15,24,0.95)",
            border: `1px solid ${T.border}`,
            backdropFilter: "blur(24px)",
          }}
        >
          {/* Mic */}
          <button
            onClick={handleToggleMic}
            className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all touch-manipulation"
            style={{
              background: isAudioOn ? "rgba(255,255,255,0.08)" : "rgba(239,68,68,0.15)",
              border: `1px solid ${isAudioOn ? T.border : "rgba(239,68,68,0.3)"}`,
            }}
          >
            {isAudioOn ? (
              <Mic className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            ) : (
              <MicOff className="w-4 h-4 sm:w-5 sm:h-5 text-red-400" />
            )}
            <span
              className="text-[8px] sm:text-[9px] font-medium hidden xs:block"
              style={{ color: isAudioOn ? T.muted : "#f87171" }}
            >
              {isAudioOn ? "Mic" : "Muted"}
            </span>
          </button>

          {/* Camera */}
          <button
            onClick={handleToggleCam}
            className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all touch-manipulation"
            style={{
              background: isVideoOn ? "rgba(255,255,255,0.08)" : "rgba(239,68,68,0.15)",
              border: `1px solid ${isVideoOn ? T.border : "rgba(239,68,68,0.3)"}`,
            }}
          >
            {isVideoOn ? (
              <Video className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            ) : (
              <VideoOff className="w-4 h-4 sm:w-5 sm:h-5 text-red-400" />
            )}
            <span
              className="text-[8px] sm:text-[9px] font-medium hidden xs:block"
              style={{ color: isVideoOn ? T.muted : "#f87171" }}
            >
              {isVideoOn ? "Cam" : "Off"}
            </span>
          </button>

          {/* Switch camera (front/back) — visible on mobile only */}
          <button
            onClick={() => daily.switchCamera()}
            className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex-col items-center justify-center gap-0.5 transition-all touch-manipulation flex sm:hidden"
            style={{
              background: "rgba(255,255,255,0.08)",
              border: `1px solid ${T.border}`,
            }}
            title="Switch camera"
          >
            <SwitchCamera className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            <span className="text-[8px] font-medium hidden xs:block" style={{ color: T.muted }}>Flip</span>
          </button>

          {/* Screen Share — now works for guests too. FIX: proactively dimmed
              + tooltipped (not disabled outright — some browsers only reveal
              the real answer once the user gesture actually happens) when
              screen sharing is genuinely unavailable, with an accurate,
              platform-specific reason instead of a generic message. */}
          <button
            onClick={handleScreenShare}
            title={!daily.isScreenSharing ? daily.screenShareUnavailableMessage ?? undefined : undefined}
            className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all touch-manipulation"
            style={{
              background: daily.isScreenSharing
                ? "rgba(99,102,241,0.2)"
                : "rgba(255,255,255,0.08)",
              border: `1px solid ${daily.isScreenSharing ? "rgba(99,102,241,0.4)" : T.border}`,
              opacity: !daily.isScreenSharing && daily.screenShareUnavailableReason ? 0.45 : 1,
            }}
          >
            {daily.isScreenSharing ? (
              <MonitorOff className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-400" />
            ) : (
              <Monitor className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            )}
            <span
              className="text-[8px] sm:text-[9px] font-medium hidden xs:block"
              style={{ color: daily.isScreenSharing ? "#a5b4fc" : T.muted }}
            >
              {daily.isScreenSharing ? "Stop" : "Share"}
            </span>
          </button>

          {/* Raise hand — now present for guests too */}
          <button
            onClick={handleHandRaise}
            className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all touch-manipulation"
            style={{
              background: isHandRaised ? "rgba(245,158,11,0.2)" : "rgba(255,255,255,0.08)",
              border: `1px solid ${isHandRaised ? "rgba(245,158,11,0.4)" : T.border}`,
            }}
          >
            <Hand className={cn("w-4 h-4 sm:w-5 sm:h-5", isHandRaised ? "text-amber-400" : "text-white")} />
            <span
              className="text-[8px] sm:text-[9px] font-medium hidden xs:block"
              style={{ color: isHandRaised ? "#fbbf24" : T.muted }}
            >
              {isHandRaised ? "Lower" : "Raise"}
            </span>
          </button>

          {/* Leave */}
          <button
            onClick={handleLeave}
            className="h-10 sm:h-12 px-3 sm:px-8 rounded-xl text-xs sm:text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95 touch-manipulation"
            style={{
              background: "linear-gradient(135deg,#dc2626,#b91c1c)",
              boxShadow: "0 4px 16px rgba(220,38,38,.35)",
            }}
          >
            <PhoneOff className="w-4 h-4 sm:hidden" />
            <span className="hidden sm:inline">Leave meeting</span>
          </button>
        </div>
      </div>

      {/* Participants — reusable list, shown in a swipeable sheet on mobile and
          an anchored popover on desktop */}
      {(() => {
        const list = (
          <div className="overflow-y-auto p-2" style={{ maxHeight: isMobile ? undefined : "calc(70vh - 56px)" }}>
            {daily.participants.map((p) => (
              <div
                key={p.session_id}
                className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-white/[0.04] active:bg-white/[0.06] cursor-pointer transition-colors touch-manipulation"
                onClick={() => {
                  setPinnedId(pinnedId === p.session_id ? null : p.session_id);
                  setShowPeople(false);
                }}
              >
                <div className="relative">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
                    style={{
                      background:
                        p.session_id === daily.activeSpeakerId
                          ? "linear-gradient(135deg,#10b981,#059669)"
                          : "linear-gradient(135deg,#6366f1,#8b5cf6)",
                    }}
                  >
                    {getInitial(p.user_name)}
                  </div>
                  {p.session_id === daily.activeSpeakerId && (
                    <div
                      className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 bg-emerald-400"
                      style={{ borderColor: T.bg }}
                    />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate flex items-center gap-1" style={{ color: T.text }}>
                    {p.user_name || "Participant"}
                    {p.local && <span style={{ color: T.muted }}> (You)</span>}
                    {p.handRaised && <span className="text-sm">✋</span>}
                  </p>
                  <p className="text-[10px]" style={{ color: T.muted }}>
                    {pinnedId === p.session_id ? "Pinned" : p.local ? "You" : "Guest"}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  {!p.audio && <MicOff className="w-3 h-3 text-red-400" />}
                  {!p.video && <VideoOff className="w-3 h-3" style={{ color: T.muted }} />}
                  {pinnedId === p.session_id && <Pin className="w-3 h-3 text-indigo-400" />}
                </div>
              </div>
            ))}
          </div>
        );

        if (isMobile) {
          return (
            <MobileSheet
              open={showPeople}
              onClose={() => setShowPeople(false)}
              title={`Participants (${daily.participantCount})`}
            >
              {list}
            </MobileSheet>
          );
        }

        return showPeople ? (
          <>
            {/* Fixed, not absolute — an absolutely-positioned popover here was
                being silently clipped by the call container's overflow-hidden,
                so clicking "People" appeared to do nothing on desktop. Fixed
                positioning is immune to that ancestor clipping. */}
            <div className="fixed inset-0 z-40 bg-transparent" onClick={() => setShowPeople(false)} />
            <div
              className="fixed z-50 top-16 right-3 w-72 max-w-[calc(100vw-24px)] rounded-xl overflow-hidden"
              style={{ background: T.panel, border: `1px solid ${T.border}`, backdropFilter: "blur(20px)", boxShadow: "0 16px 40px rgba(0,0,0,0.5)", maxHeight: "70vh" }}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: T.border }}>
                <span className="text-sm font-semibold text-white">Participants ({daily.participantCount})</span>
                <button
                  onClick={() => setShowPeople(false)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center touch-manipulation"
                  style={{ background: T.card }}
                >
                  <X className="w-4 h-4" style={{ color: T.muted }} />
                </button>
              </div>
              {list}
            </div>
          </>
        ) : null;
      })()}
    </div>
  );
}