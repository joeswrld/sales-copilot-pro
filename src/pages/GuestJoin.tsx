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
  Maximize2, Minimize2, X, Pin,
  AlertCircle, Clock, Hand, SwitchCamera,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useDailyCall, DailyParticipant, CallQuality } from "@/hooks/useDailyCall";
import { useIsMobile } from "@/hooks/use-mobile";
import { useMeetingHealth } from "@/hooks/useMeetingHealth";
import { MeetingHealthBar } from "@/components/MeetingHealthBar";
import { VideoTile } from "@/components/VideoTile";
import { MeetingVideoGrid, type VideoLayout } from "@/components/MeetingVideoGrid";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ─── Types ──────────────────────────────────────────────────────────────────────
// VideoLayout ("focus" | "grid" | "sidebar") is imported from
// MeetingVideoGrid.tsx so the guest page shares the same layout type — and the
// same grid implementation — as the host page (LiveMeeting.tsx).
type JoinStep = "lobby" | "requesting" | "waiting" | "admitted" | "denied" | "locked" | "disconnected";

// ─── Design tokens ───────────────────────────────────────────────────────────────
const T = {
  bg: "#FAFAF8",
  panel: "rgba(255,255,255,0.96)",
  card: "rgba(23,23,15,0.03)",
  border: "rgba(23,23,15,0.09)",
  accent: "#22315C",
  text: "rgba(23,23,15,0.85)",
  muted: "rgba(23,23,15,0.4)",
  subtle: "rgba(23,23,15,0.12)",
};

function qualityColor(q: CallQuality) {
  return q === "excellent" || q === "good"
    ? "#2F6B4F"
    : q === "fair"
    ? "#8A5A20"
    : "#B3442F";
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
        style={{ background: "linear-gradient(135deg,#FFFFFF,#FFFFFF)" }}
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
                  "linear-gradient(135deg,rgba(34,49,92,0.4),rgba(102,66,161,0.4))",
                border: "2px solid rgba(34,49,92,0.3)",
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
              background: "rgba(179,68,47,0.2)",
              border: "1px solid rgba(179,68,47,0.3)",
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

// PinnableTile + VideoGrid moved to src/components/MeetingVideoGrid.tsx (as
// PinnableTile + MeetingVideoGrid) so this page shares one implementation
// with the host page (LiveMeeting.tsx) instead of a second, stale copy with
// its own fixed-column grid and "spotlight"-labelled layout.

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
        background: "rgba(34,49,92,0.94)",
        backdropFilter: "blur(14px)",
        boxShadow: "0 6px 20px rgba(34,49,92,0.4)",
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

  // FIX: see LiveMeeting.tsx's MobileVideoStage for the full explanation —
  // same component, same bug. This stage only ever rendered one remote
  // participant (`mainParticipant`) plus the local self-PiP, regardless of
  // how many people were actually in the call. Anyone beyond those two was
  // fully connected and sending media but never appeared anywhere on
  // screen — indistinguishable from "the app dropped them" to the guest
  // looking at their phone. Add a tappable strip for everyone not
  // currently in the main or PiP slot.
  const others = participants.filter(
    (p) => p.session_id !== mainParticipant?.session_id && p.session_id !== pipParticipant?.session_id,
  );

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

      {others.length > 0 && (
        <div
          className="absolute left-2 right-2 z-30 flex gap-1.5 overflow-x-auto"
          style={{ bottom: "max(10px, env(safe-area-inset-bottom))" }}
        >
          {others.map((p) => (
            <button
              key={p.session_id}
              onClick={() => onPin(p.session_id)}
              aria-label={`Show ${p.user_name ?? "participant"} as main view`}
              className="shrink-0 rounded-xl overflow-hidden touch-manipulation"
              style={{ width: 56, height: 56, border: "2px solid rgba(255,255,255,0.35)" }}
            >
              <VideoTile participant={p} activeSpeakerId={activeSpeakerId} className="w-full h-full" fit="cover" />
            </button>
          ))}
        </div>
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
  const [videoLayout, setVideoLayout] = useState<VideoLayout>("grid");
  const [showPeople, setShowPeople] = useState(false);
  const [isHandRaised, setIsHandRaised] = useState(false);

  // The real Daily meeting token, exchanged once the guest is admitted.
  const guestDailyTokenRef = useRef<string | null>(null);
  const voluntaryLeaveRef = useRef(false);

  // FIX: the call's real, DB-backed start_time (returned by
  // guest-request-status as `call_start_time` once admitted). Anchoring the
  // timer to this instead of this tab's own join instant is what keeps the
  // guest's timer in sync with the host's — see sharedStartTime doc comment
  // in useDailyCall.ts.
  const [callStartTime, setCallStartTime] = useState<string | null>(null);
  const [callMicStream, setCallMicStream] = useState<MediaStream | null>(null);
  const health = useMeetingHealth(null, callMicStream ?? localStream);
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

  // Attach the guest's own local Daily audio track to the health/mic-level
  // meter as soon as it's available post-join. Full call audio is captured
  // by Daily.co's cloud recording and transcribed after the call ends via
  // the Deepgram batch + diarization pipeline.
  useEffect(() => {
    if (step !== "admitted" || guestTrackStartedRef.current) return;
    const localP = daily.participants.find((p) => p.local);
    if (localP?.audioTrack) {
      guestTrackStartedRef.current = true;
      setCallMicStream(new MediaStream([localP.audioTrack]));
    }
  }, [step, daily.participants]);

  // ── Backgrounded-tab guard ───────────────────────────────────────────────────
  // Mirrors the host-side guard in LiveMeeting.tsx — see the doc comment
  // there for the full root-cause explanation. Short version: if this tab
  // gets backgrounded (e.g. the guest switches to another app on the same
  // phone), mobile browsers throttle its audio pipeline and this guest's own
  // mic silently stops being transcribed until they switch back.
  const guestWakeLockRef = useRef<any>(null);
  const guestBackgroundWarnedRef = useRef(false);
  useEffect(() => {
    if (step !== "admitted") return;

    const requestWakeLock = async () => {
      try {
        if ("wakeLock" in navigator) {
          guestWakeLockRef.current = await (navigator as any).wakeLock.request("screen");
        }
      } catch (e) {
        console.warn("[GuestJoin] Wake Lock request failed:", e);
      }
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        if (!guestBackgroundWarnedRef.current) {
          guestBackgroundWarnedRef.current = true;
          toast.warning(
            "This tab is now in the background — your mic and live captions will pause on most phones until you switch back.",
            { id: "bg-tab-warning-guest", duration: 6000 },
          );
        }
      } else {
        guestBackgroundWarnedRef.current = false;
        requestWakeLock();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    requestWakeLock();

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      try { guestWakeLockRef.current?.release?.(); } catch { /* noop */ }
      guestWakeLockRef.current = null;
    };
  }, [step]);

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

  /**
   * Shared "admit this guest into the call" logic — exchanges the guest
   * token for a real Daily token, stops the local preview stream, flips
   * step to "admitted", and calls daily.joinCall(). Used both by the
   * immediate-admit path (who_can_join === 'anyone_with_link', where
   * guest-join-request itself returns status: 'admitted' with no polling
   * needed) and by the polling path below (who_can_join === 'invited_only',
   * where guest-request-status eventually reports 'admitted' after the
   * host approves).
   */
  const admitGuest = useCallback(async (admitData: {
    call_start_time?: string | null;
    guest_token?: string | null;
    room_name?: string | null;
  }) => {
    if (admitData.call_start_time) setCallStartTime(admitData.call_start_time);

    const displayName = guestName.trim() || "Guest";
    let dailyToken: string | null = null;
    if (admitData.guest_token) {
      dailyToken = await exchangeForDailyToken(admitData.guest_token, displayName);
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
      rName: admitData.room_name || roomName!,
      token: dailyToken ?? undefined,
      displayName,
    });
  }, [guestName, localStream, daily, roomName, exchangeForDailyToken]);

  // Poll for admission status (only relevant once host approval is actually
  // required — see handleRequestJoin, which sends already-admitted guests
  // straight into admitGuest() and never reaches "waiting" at all)
  useEffect(() => {
    if (step !== "waiting" || !requestId) return;
    const interval = setInterval(async () => {
      try {
        const { data } = await supabase.functions.invoke("guest-request-status", {
          body: { id: requestId },
        });

        if (data?.status === "admitted") {
          clearInterval(interval);
          await admitGuest({
            call_start_time: data.call_start_time,
            guest_token: data.guest_token,
            room_name: data.room_name,
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
  }, [step, requestId, admitGuest]);

  const handleRequestJoin = useCallback(async () => {
    const name = guestName.trim();
    if (!name || !roomName) return;
    setStep("requesting");
    try {
      const { data, error } = await supabase.functions.invoke("guest-join-request", {
        body: { room_name: roomName, guest_name: name },
      });
      // The host has locked the meeting — guest-join-request returns 200 OK
      // with status: 'locked' in the body (a normal, expected outcome, not
      // an error), so it's always readable straight off `data`.
      if (data?.status === "locked") {
        setStep("locked");
        return;
      }
      if (error) throw error;

      // FIX: guest-join-request returns status: 'admitted' immediately when
      // the host's meeting is set to "Anyone with the link" (no approval
      // needed) — previously this branch was never checked, so every guest
      // was dropped into the "waiting" step and stuck on "Waiting for the
      // host" regardless of who_can_join, only escaping it once the 2s
      // poll happened to line up. Now an already-admitted guest is joined
      // to the call immediately, with no waiting screen at all.
      if (data?.status === "admitted") {
        await admitGuest({
          call_start_time: data.call_start_time,
          guest_token: data.guest_token,
          room_name: data.room_name ?? roomName,
        });
        return;
      }

      setRequestId(data?.request_id ?? null);
      setStep("waiting");
    } catch (err: any) {
      toast.error(err?.message || "Couldn't send join request. Check the meeting link.");
      setStep("lobby");
    }
  }, [guestName, roomName, admitGuest]);

  const handleLeave = useCallback(async () => {
    voluntaryLeaveRef.current = true;
    localStream?.getTracks().forEach((t) => t.stop());
    await daily.leaveCall();
    navigate("/");
  }, [localStream, daily, navigate]);

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
            style={{ background: "rgba(138,90,32,0.12)", border: "1px solid rgba(138,90,32,0.3)" }}
          >
            <WifiOff className="w-7 h-7 text-amber-400" />
          </div>

          <div>
            <p className="text-sm font-semibold text-[#17170F] mb-1">
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
              style={{ background: "linear-gradient(135deg,#22315C,#2A3F73)" }}
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
              style={{ background: "linear-gradient(135deg,#22315C,#2A3F73)" }}
            >
              <Video className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-lg sm:text-xl font-bold text-[#17170F]">Join Meeting</h1>
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
                style={{ background: "rgba(179,68,47,0.08)", border: "1px solid rgba(179,68,47,0.2)" }}
              >
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: "#B3442F" }} />
                <p className="text-[11px] leading-snug" style={{ color: "rgba(23,23,15,0.62)" }}>
                  {mediaError}
                  {!localStream && (
                    <span className="block mt-0.5 font-medium" style={{ color: "#8A3223" }}>
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
                        background: "rgba(23,23,15,0.03)",
                        border: `1px solid ${T.border}`,
                        color: "#17170F",
                      }
                    : {
                        background: "rgba(179,68,47,0.08)",
                        border: "1px solid rgba(179,68,47,0.25)",
                        color: "#B3442F",
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
                        background: "rgba(23,23,15,0.03)",
                        border: `1px solid ${T.border}`,
                        color: "#17170F",
                      }
                    : {
                        background: "rgba(179,68,47,0.08)",
                        border: "1px solid rgba(179,68,47,0.25)",
                        color: "#B3442F",
                      }
                }
              >
                {isVideoOn ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
                {isVideoOn ? "Camera on" : "Camera off"}
              </button>
            </div>

            {/* Name input */}
            {step !== "denied" && step !== "locked" && (
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
                  background: "rgba(34,49,92,0.08)",
                  border: "1px solid rgba(34,49,92,0.2)",
                }}
              >
                <Loader2 className="w-4 h-4 animate-spin shrink-0" style={{ color: "#22315C" }} />
                <div>
                  <p className="text-sm font-medium text-[#17170F]">Waiting for the host</p>
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
                  background: "rgba(179,68,47,0.08)",
                  border: "1px solid rgba(179,68,47,0.2)",
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

            {step === "locked" && (
              <div
                className="flex items-center gap-3 px-4 py-3 rounded-xl"
                style={{
                  background: "rgba(179,68,47,0.08)",
                  border: "1px solid rgba(179,68,47,0.2)",
                }}
              >
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-red-400">Meeting is locked</p>
                  <p className="text-[11px]" style={{ color: T.muted }}>
                    The host isn't admitting new participants right now
                  </p>
                </div>
              </div>
            )}

            {/* CTA */}
            {step !== "denied" && step !== "locked" ? (
              <button
                onClick={handleRequestJoin}
                disabled={
                  !guestName.trim() || step === "requesting" || step === "waiting"
                }
                className="w-full py-3.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-[0.98] touch-manipulation disabled:opacity-50 disabled:pointer-events-none min-h-[48px]"
                style={{ background: "linear-gradient(135deg,#22315C,#2A3F73)" }}
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
                className="w-full py-3.5 rounded-xl text-sm font-semibold text-[#17170F] touch-manipulation min-h-[48px]"
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
          <span className="text-xs sm:text-sm font-semibold text-[#17170F] truncate">
            {roomName?.replace(/-/g, " ") || "Meeting"}
          </span>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3" style={{ color: T.muted }} />
            <span className="text-[11px] sm:text-xs font-mono font-semibold text-[#17170F] tabular-nums">
              {fmt(daily.elapsedSeconds)}
            </span>
          </div>
          <MeetingHealthBar health={health.health} />
          {handRaiseCount > 0 && (
            <div
              className="flex items-center gap-1 px-1.5 sm:px-2 py-1 rounded-lg"
              style={{ background: "rgba(138,90,32,0.12)", border: "1px solid rgba(138,90,32,0.25)" }}
            >
              <span className="text-xs">✋</span>
              <span className="text-[10px] font-bold text-amber-400">{handRaiseCount}</span>
            </div>
          )}
          <button
            onClick={() => setShowPeople((v) => !v)}
            className="relative w-8 h-8 rounded-xl flex items-center justify-center touch-manipulation"
            style={{
              background: showPeople ? "rgba(34,49,92,0.2)" : T.card,
              border: `1px solid ${T.border}`,
            }}
          >
            <Users className="w-4 h-4 text-[#17170F]" />
            {daily.participantCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#22315C] text-white text-[9px] font-bold flex items-center justify-center">
                {daily.participantCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Video — full-bleed stage with a draggable self-view on mobile once a
          second participant is present, matching the host's LiveMeeting page.
          FIX: MobileVideoStage only ever shows ONE other participant at full
          size (everyone else was squeezed into a small thumbnail strip), so
          it's now reserved for the true 1-on-1 case (exactly 2 people) or an
          active screen share; 3+ participants fall through to
          MeetingVideoGrid so the guest can see everyone clearly. */}
      <div className="flex-1 min-h-0 p-1 sm:p-3 relative">
        {isMobile && !daily.isConnecting && !daily.error &&
        (daily.participants.length === 2 || daily.participants.some((p) => p.screen)) ? (
          <MobileVideoStage
            participants={daily.participants}
            activeSpeakerId={daily.activeSpeakerId}
            pinnedId={pinnedId}
            onPin={setPinnedId}
            onSwitchCamera={() => daily.switchCamera()}
            onStopShare={handleScreenShare}
          />
        ) : (
          <MeetingVideoGrid
            participants={daily.participants}
            activeSpeakerId={daily.activeSpeakerId}
            isConnecting={daily.isConnecting}
            isConnected={daily.isConnected}
            error={daily.error}
            roomName={roomName ?? null}
            onRetry={handleRetryJoin}
            pinnedId={pinnedId}
            onPin={setPinnedId}
            layout={videoLayout}
            onLayoutChange={setVideoLayout}
            connectingLabel="Joining meeting…"
            localName={guestName.trim() || "Guest"}
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
              background: isAudioOn ? "rgba(255,255,255,0.08)" : "rgba(179,68,47,0.15)",
              border: `1px solid ${isAudioOn ? T.border : "rgba(179,68,47,0.3)"}`,
            }}
          >
            {isAudioOn ? (
              <Mic className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            ) : (
              <MicOff className="w-4 h-4 sm:w-5 sm:h-5 text-red-400" />
            )}
            <span
              className="text-[8px] sm:text-[9px] font-medium hidden xs:block"
              style={{ color: isAudioOn ? T.muted : "#B3442F" }}
            >
              {isAudioOn ? "Mic" : "Muted"}
            </span>
          </button>

          {/* Camera */}
          <button
            onClick={handleToggleCam}
            className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all touch-manipulation"
            style={{
              background: isVideoOn ? "rgba(255,255,255,0.08)" : "rgba(179,68,47,0.15)",
              border: `1px solid ${isVideoOn ? T.border : "rgba(179,68,47,0.3)"}`,
            }}
          >
            {isVideoOn ? (
              <Video className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            ) : (
              <VideoOff className="w-4 h-4 sm:w-5 sm:h-5 text-red-400" />
            )}
            <span
              className="text-[8px] sm:text-[9px] font-medium hidden xs:block"
              style={{ color: isVideoOn ? T.muted : "#B3442F" }}
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
                ? "rgba(34,49,92,0.2)"
                : "rgba(255,255,255,0.08)",
              border: `1px solid ${daily.isScreenSharing ? "rgba(34,49,92,0.4)" : T.border}`,
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
              style={{ color: daily.isScreenSharing ? "#4A5D8F" : T.muted }}
            >
              {daily.isScreenSharing ? "Stop" : "Share"}
            </span>
          </button>

          {/* Raise hand — now present for guests too */}
          <button
            onClick={handleHandRaise}
            className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all touch-manipulation"
            style={{
              background: isHandRaised ? "rgba(138,90,32,0.2)" : "rgba(255,255,255,0.08)",
              border: `1px solid ${isHandRaised ? "rgba(138,90,32,0.4)" : T.border}`,
            }}
          >
            <Hand className={cn("w-4 h-4 sm:w-5 sm:h-5", isHandRaised ? "text-amber-400" : "text-white")} />
            <span
              className="text-[8px] sm:text-[9px] font-medium hidden xs:block"
              style={{ color: isHandRaised ? "#8A5A20" : T.muted }}
            >
              {isHandRaised ? "Lower" : "Raise"}
            </span>
          </button>

          {/* Leave */}
          <button
            onClick={handleLeave}
            className="h-10 sm:h-12 px-3 sm:px-8 rounded-xl text-xs sm:text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95 touch-manipulation"
            style={{
              background: "linear-gradient(135deg,#B3442F,#8A3223)",
              boxShadow: "0 4px 16px rgba(179,68,47,.35)",
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
                className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-[rgba(23,23,15,0.04)] active:bg-[rgba(23,23,15,0.06)] cursor-pointer transition-colors touch-manipulation"
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
                          ? "linear-gradient(135deg,#2F6B4F,#25573F)"
                          : "linear-gradient(135deg,#22315C,#2A3F73)",
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
                <span className="text-sm font-semibold text-[#17170F]">Participants ({daily.participantCount})</span>
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