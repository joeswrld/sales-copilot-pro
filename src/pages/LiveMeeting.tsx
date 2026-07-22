/**
 * LiveMeeting.tsx — v10
 *
 * Mobile-first responsive overhaul:
 *  - Top bar: condensed on mobile, all items fit < 375px
 *  - Control bar: scrollable on very small screens, icons + labels scale
 *  - AI panel & people panel: full-height bottom sheets on mobile
 *  - Left / right panels: hidden on mobile, exposed via sheet
 *  - VideoGrid: fills all available space, grid math fixed for portrait
 *  - Touch targets: all buttons ≥ 44 × 44 px
 *  - Hand raise button in control bar (broadcasts via Daily app-message)
 *  - Noise cancellation toggle (desktop only)
 *  - Screen share now passes better constraints
 *  - Better transport-disconnect handling via useDailyCall v13
 *
 * FIX v10.1: Daily.co SDK throws "property 'token': token should be a string"
 * when token key is present with value null/undefined. All joinCall() calls
 * now use conditional spread: ...(meetingToken ? { token: meetingToken } : {})
 */

import {
  useState, useEffect, useRef, useMemo, useCallback, memo,
} from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Loader2, Clock, MessageSquare, Users,
  Mic, MicOff, Video, VideoOff, MonitorPlay, PhoneOff, SwitchCamera,
  Paperclip, Send,
  UserCheck, UserX, Bell, BookOpen,
  CircleDot, Upload, Plus,
  X, Hand,
  ArrowUpRight,
  Maximize2, Minimize2,
  Volume2, VolumeX, MonitorOff, MoreHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLiveCall } from "@/hooks/useLiveCall";
import { useDailyCall, DailyParticipant, CallQuality } from "@/hooks/useDailyCall";
import { useTeam } from "@/hooks/useTeam";
import { useUserStatus } from "@/hooks/useUserStatus";
import { useUserProfile } from "@/hooks/useSettings";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePendingGuestRequests } from "@/hooks/useGuestApproval";
import { useMeetingWorkspace } from "@/hooks/useMeetingWorkspace";
import { useCoaching } from "@/hooks/useCoaching";
import { useNotifications } from "@/hooks/useNotifications";
import { useMinuteUsage } from "@/hooks/useMeetingUsage";
import { useMeetingHealth } from "@/hooks/useMeetingHealth";
import { MeetingHealthBar } from "@/components/MeetingHealthBar";
import { useAuth } from "@/contexts/AuthContext";
import { VideoTile } from "@/components/VideoTile";
import { MeetingVideoGrid, type VideoLayout } from "@/components/MeetingVideoGrid";
import CallEndingOverlay from "@/components/CallEndingOverlay";
import { toast } from "sonner";

// ─── Design Tokens ─────────────────────────────────────────────────────────────
const T = {
  bg:      "#080a12",
  panel:   "rgba(12,14,22,0.96)",
  card:    "rgba(255,255,255,0.04)",
  border:  "rgba(255,255,255,0.07)",
  accent:  "#6366f1",
  text:    "rgba(255,255,255,0.85)",
  muted:   "rgba(255,255,255,0.35)",
  subtle:  "rgba(255,255,255,0.12)",
  emerald: "#10b981",
  amber:   "#f59e0b",
  red:     "#ef4444",
};

type MobilePanel = "none" | "people" | "chat" | "notes" | "more";
type LeftTab     = "people" | "chat" | "notes" | "files" | "notifications";
type VideoLayout = "spotlight" | "grid" | "sidebar";

function fmt(s: number) {
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
function qualityColor(q: CallQuality) {
  return q === "excellent" || q === "good" ? T.emerald : q === "fair" ? T.amber : T.red;
}
function deriveHostName(profile?: { full_name?: string | null; email?: string | null }, authEmail?: string | null) {
  if (profile?.full_name?.trim()) return profile.full_name.trim();
  const email = profile?.email || authEmail || "";
  return email.includes("@") ? email.split("@")[0] : "Host";
}

// PinnableTile + VideoGrid moved to src/components/MeetingVideoGrid.tsx so the
// host page and guest page share one implementation (see that file for the
// "focus" layout that replaces the old "spotlight" bottom-strip design).

// ─── Small helpers ──────────────────────────────────────────────────────────────
const NetDot = memo(({ quality }: { quality: CallQuality }) => {
  const c = qualityColor(quality);
  return (
    <div className="flex items-center gap-1 sm:gap-1.5">
      <div className="w-2 h-2 rounded-full shrink-0" style={{ background: c, boxShadow: `0 0 5px ${c}` }} />
      <span className="text-[10px] font-medium capitalize hidden sm:block" style={{ color: c }}>{quality}</span>
    </div>
  );
});

const RecBadge = memo(() => (
  <div className="flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2 py-1 rounded-lg"
    style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.22)" }}>
    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
    <span className="text-[10px] font-bold text-red-400">REC</span>
  </div>
));

// ─── Control button ─────────────────────────────────────────────────────────────
const Ctrl = memo(({ icon: Icon, label, onClick, active = true, danger = false, badge, disabled = false, compact = false, highlight = false, hideLabel = false, title }: any) => (
  <button onClick={onClick} disabled={disabled} title={title ?? label}
    className={cn(
      "relative flex flex-col items-center justify-center gap-0.5 rounded-xl transition-all select-none touch-manipulation",
      compact ? "w-11 h-11 px-1" : "px-2.5 sm:px-3 py-2 sm:py-2.5 min-w-[44px] min-h-[44px]",
      danger  ? "bg-red-500/90 hover:bg-red-500/100 text-white"
              : highlight ? "bg-amber-500/20 border border-amber-500/40 text-amber-400"
              : active    ? "bg-white/[0.08] hover:bg-white/[0.14] text-white"
                          : "bg-red-500/12 border border-red-500/25 text-red-400",
      disabled && "opacity-40 pointer-events-none",
    )}>
    <Icon className={compact ? "w-5 h-5" : "w-4 h-4 sm:w-5 sm:h-5"} />
    {!hideLabel && (
      <span className={cn("font-medium", compact ? "text-[9px] opacity-60" : "text-[9px] sm:text-[10px] opacity-60 hidden xs:block")}>{label}</span>
    )}
    {badge != null && badge > 0 && (
      <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-indigo-500 text-white text-[9px] font-bold flex items-center justify-center">
        {badge > 9 ? "9+" : badge}
      </span>
    )}
  </button>
));

// ─── Presenting indicator ─────────────────────────────────────────────────────
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

// ─── Draggable / resizable / expandable self-view (PiP) ────────────────────────
// Camera self-view: portrait-ish (matches a phone's front camera). Enlarged
// from the original { sm: 68x90, md: 96x128 } — that was too small to
// actually see yourself clearly. Aspect ratio (~3:4) kept, just scaled up,
// and matched with GuestJoin.tsx's sizing.
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
  const [size, setSize] = useState<"sm" | "md">("sm");
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

  // FIX: this stage was built for the 1:1 case — one full-bleed main tile
  // plus a small self-PiP — and that's still correct for exactly 2
  // participants. But it was used unconditionally for ANY call with 2+
  // people, including 4/5/6-person calls, and it only ever renders
  // `mainParticipant` (one participant) + `pipParticipant` (local self).
  // Everyone else in `participants` was computed into the DOM never:
  // no error, no indicator, just silently absent from the screen. From
  // the host's (or guest's) point of view that's indistinguishable from
  // "the other people didn't actually join" even though they're fully
  // connected and sending media. Add a tappable strip for anyone not
  // currently occupying the main or PiP slot, so nobody is ever rendered
  // nowhere. Tapping a strip tile pins them into the main slot (existing
  // onPin behavior), swapping whoever was there into the strip instead.
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
          className="absolute right-2 z-30 flex flex-col gap-1.5 overflow-y-auto"
          style={{
            top: "max(52px, calc(env(safe-area-inset-top) + 44px))",
            bottom: "max(10px, env(safe-area-inset-bottom))",
          }}
        >
          {others.slice(0, 4).map((p) => {
            const isSpeaking = p.session_id === activeSpeakerId;
            return (
              <button
                key={p.session_id}
                onClick={() => onPin(p.session_id)}
                aria-label={`Show ${p.user_name ?? "participant"} as main view`}
                className="relative shrink-0 rounded-xl overflow-hidden touch-manipulation transition-transform active:scale-[0.96]"
                style={{
                  width: "clamp(72px, 22vw, 104px)",
                  aspectRatio: "9 / 16",
                  boxShadow: isSpeaking
                    ? "0 0 0 2px #6366f1, 0 0 14px rgba(99,102,241,0.55)"
                    : "0 0 0 1px rgba(255,255,255,0.15)",
                }}
              >
                <VideoTile participant={p} activeSpeakerId={activeSpeakerId} className="w-full h-full" fit="cover" />
              </button>
            );
          })}
          {others.length > 4 && (
            <div
              className="shrink-0 rounded-xl flex flex-col items-center justify-center gap-0.5"
              style={{
                width: "clamp(72px, 22vw, 104px)",
                aspectRatio: "9 / 16",
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.15)",
              }}
            >
              <span className="text-sm font-bold text-white">+{others.length - 4}</span>
              <span className="text-[9px]" style={{ color: "rgba(255,255,255,0.5)" }}>more</span>
            </div>
          )}
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
const GuestBanner = memo(({ requests, admit, deny, loading }: any) => {
  if (!requests.length) return null;
  return (
    <div className="px-2 sm:px-3 pt-2 space-y-2 shrink-0 z-30 relative">
      {requests.map((r: any) => (
        <div key={r.id} className="flex items-center gap-2 sm:gap-3 px-3 py-2.5 rounded-xl"
          style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)" }}>
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
            style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)" }}>
            {(r.guest_name || "?")[0]?.toUpperCase()}
          </div>
          <p className="text-xs flex-1 min-w-0 truncate" style={{ color: "rgba(255,255,255,0.7)" }}>
            <span className="font-semibold text-white">{r.guest_name}</span>
            <span className="hidden sm:inline"> wants to join</span>
          </p>
          <div className="flex gap-1.5 shrink-0">
            <button onClick={() => deny(r.id)} disabled={loading}
              className="w-9 h-9 rounded-lg flex items-center justify-center text-red-400 touch-manipulation"
              style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}>
              <UserX className="w-4 h-4" />
            </button>
            <button onClick={() => admit(r.id)} disabled={loading}
              className="h-9 px-2.5 sm:px-3 rounded-lg text-white font-medium flex items-center gap-1 text-xs touch-manipulation"
              style={{ background: "linear-gradient(135deg,#4f46e5,#7c3aed)" }}>
              <UserCheck className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Admit</span>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
});

// ─── Left panel ─────────────────────────────────────────────────────────────────
const LeftPanel = memo(({ activeTab, onTab, participants, activeSpeakerId, callId, userId }: any) => {
  const { workspace, addNote, uploadFile } = useMeetingWorkspace(callId);
  const { comments, addComment }           = useCoaching(callId);
  const { notifications, markRead, unreadCount } = useNotifications();
  const [chatInput, setChatInput] = useState("");
  const [noteInput, setNoteInput] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef   = useRef<HTMLDivElement>(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [comments.length]);

  const sendChat = useCallback(async () => {
    const t = chatInput.trim(); if (!t) return;
    setChatInput(""); await addComment.mutateAsync({ text: t });
  }, [chatInput, addComment]);

  const tabs = [
    { id: "people",        icon: Users,         label: "People",        badge: participants.length },
    { id: "chat",          icon: MessageSquare, label: "Chat" },
    { id: "notes",         icon: BookOpen,      label: "Notes" },
    { id: "files",         icon: Paperclip,     label: "Files",         badge: workspace.files.length || undefined },
    { id: "notifications", icon: Bell,          label: "Alerts",        badge: unreadCount || undefined },
  ];

  return (
    <div className="flex flex-col h-full" style={{ background: T.panel }}>
      <div className="flex items-center border-b shrink-0 overflow-x-auto" style={{ borderColor: T.border }}>
        {tabs.map((tab: any) => {
          const Icon = tab.icon;
          return (
            <button key={tab.id} onClick={() => onTab(tab.id)}
              className="relative flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium border-b-2 transition-all min-w-[44px] touch-manipulation min-h-[44px]"
              style={{ borderColor: activeTab === tab.id ? T.accent : "transparent", color: activeTab === tab.id ? "#a5b4fc" : T.muted }}>
              <Icon className="w-3.5 h-3.5" />
              <span className="hidden lg:block text-[10px]">{tab.label}</span>
              {tab.badge != null && tab.badge > 0 && (
                <span className="absolute top-1 right-1 w-3.5 h-3.5 rounded-full bg-indigo-500 text-white text-[8px] flex items-center justify-center font-bold">
                  {tab.badge > 9 ? "9+" : tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="flex-1 overflow-y-auto">
        {activeTab === "people" && (
          <div className="p-2 space-y-0.5">
            {participants.length === 0
              ? <div className="py-8 text-center"><Users className="w-8 h-8 mx-auto mb-2" style={{ color: T.subtle }} /><p className="text-xs" style={{ color: T.muted }}>No participants yet</p></div>
              : participants.map((p: DailyParticipant) => (
                  <div key={p.session_id} className="flex items-center gap-2 sm:gap-2.5 px-2 sm:px-3 py-2.5 rounded-xl hover:bg-white/[0.04] transition-colors">
                    <div className="relative shrink-0">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
                        style={{ background: p.session_id === activeSpeakerId ? "linear-gradient(135deg,#10b981,#059669)" : "linear-gradient(135deg,#6366f1,#8b5cf6)" }}>
                        {(p.user_name || "?")[0]?.toUpperCase()}
                      </div>
                      {p.session_id === activeSpeakerId && (
                        <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 bg-emerald-400" style={{ borderColor: T.bg }} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <p className="text-xs font-medium truncate" style={{ color: T.text }}>
                          {p.user_name || "Participant"}
                          {p.local && <span style={{ color: T.muted }}> (You)</span>}
                        </p>
                        {p.handRaised && <span className="text-sm">✋</span>}
                      </div>
                      <p className="text-[10px]" style={{ color: T.muted }}>{p.local ? "Host" : "Guest"}</p>
                    </div>
                    <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                      {!p.audio && <MicOff className="w-3 h-3 text-red-400" />}
                      {!p.video && <VideoOff className="w-3 h-3" style={{ color: T.muted }} />}
                    </div>
                  </div>
                ))}
          </div>
        )}
        {activeTab === "chat" && (
          <div className="flex flex-col h-full">
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {comments.map((c: any) => (
                <div key={c.id} className="flex gap-2">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                    style={{ background: c.user_id === userId ? "linear-gradient(135deg,#6366f1,#8b5cf6)" : "linear-gradient(135deg,#8b5cf6,#ec4899)" }}>
                    {((c.profile?.full_name ?? c.profile?.email ?? "?")[0] ?? "?").toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 mb-0.5">
                      <span className="text-[11px] font-semibold" style={{ color: T.text }}>{c.profile?.full_name ?? c.profile?.email ?? "Someone"}</span>
                      <span className="text-[10px]" style={{ color: T.subtle }}>{new Date(c.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                    <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.7)" }}>{c.comment_text}</p>
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            <div className="border-t p-2 shrink-0" style={{ borderColor: T.border }}>
              <div className="flex gap-2">
                <input value={chatInput} onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), sendChat())}
                  placeholder="Message the team…" className="flex-1 text-xs px-3 py-2 rounded-xl outline-none min-h-[40px]"
                  style={{ background: T.card, border: `1px solid ${T.border}`, color: T.text }} />
                <button onClick={sendChat} disabled={!chatInput.trim()}
                  className="w-10 h-10 rounded-xl flex items-center justify-center touch-manipulation shrink-0"
                  style={{ background: chatInput.trim() ? "linear-gradient(135deg,#6366f1,#8b5cf6)" : T.card }}>
                  <Send className="w-3.5 h-3.5 text-white" />
                </button>
              </div>
            </div>
          </div>
        )}
        {activeTab === "notes" && (
          <div className="p-3 space-y-3">
            <div className="flex gap-2">
              <textarea value={noteInput} onChange={(e) => setNoteInput(e.target.value)} placeholder="Add a note…" rows={2}
                className="flex-1 text-xs px-3 py-2 rounded-xl outline-none resize-none"
                style={{ background: T.card, border: `1px solid ${T.border}`, color: T.text }} />
              <button onClick={async () => { if (noteInput.trim()) { await addNote(noteInput); setNoteInput(""); }}}
                className="w-10 h-10 rounded-xl flex items-center justify-center self-start shrink-0 touch-manipulation"
                style={{ background: noteInput.trim() ? "linear-gradient(135deg,#6366f1,#8b5cf6)" : T.card }}>
                <Plus className="w-3.5 h-3.5 text-white" />
              </button>
            </div>
            {workspace.notes.map((n: any) => (
              <div key={n.id} className="rounded-xl p-3 border" style={{ background: T.card, borderColor: T.border }}>
                <p className="text-xs leading-relaxed" style={{ color: T.text }}>{n.content}</p>
                <p className="text-[10px] mt-1.5" style={{ color: T.subtle }}>{n.full_name ?? n.email ?? "You"}</p>
              </div>
            ))}
          </div>
        )}
        {activeTab === "files" && (
          <div className="p-3 space-y-3">
            <input type="file" ref={fileInputRef} onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = ""; }} className="hidden" />
            <button onClick={() => fileInputRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-medium touch-manipulation min-h-[44px]"
              style={{ background: T.card, border: `1px dashed ${T.border}`, color: T.muted }}>
              <Upload className="w-3.5 h-3.5" /> Share a file
            </button>
            {workspace.files.map((f: any) => (
              <a key={f.id} href={f.file_url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border transition-colors"
                style={{ background: T.card, borderColor: T.border }}>
                <Paperclip className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <p className="text-xs font-medium truncate flex-1" style={{ color: T.text }}>{f.file_name}</p>
                <ArrowUpRight className="w-3 h-3 shrink-0" style={{ color: T.muted }} />
              </a>
            ))}
          </div>
        )}
        {activeTab === "notifications" && (
          <div className="p-2 space-y-1.5">
            {notifications.slice(0, 20).map((n: any) => (
              <button key={n.id} onClick={() => !n.is_read && markRead.mutate(n.id)}
                className="w-full text-left flex items-start gap-2.5 px-3 py-2.5 rounded-xl hover:bg-white/[0.04] touch-manipulation min-h-[44px]"
                style={{ opacity: n.is_read ? 0.5 : 1 }}>
                <Bell className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: n.is_read ? T.muted : "#a5b4fc" }} />
                <div className="flex-1 min-w-0">
                  {n.title && <p className="text-[11px] font-semibold mb-0.5" style={{ color: T.text }}>{n.title}</p>}
                  <p className="text-[11px]" style={{ color: T.muted }}>{n.message}</p>
                </div>
                {!n.is_read && <div className="w-2 h-2 rounded-full shrink-0 mt-1.5" style={{ background: T.accent }} />}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

// ─── "More" panel — Chat / Notes / Files / Notifications tabs plus the
// host actions (Record, Noise cancellation, Switch camera) that used to
// live in the always-visible left sidebar / mobile "More" sheet. Shown as
// a desktop popover or a mobile bottom sheet from the top bar's More
// button — nothing here was removed, only regrouped into one place instead
// of a permanent sidebar column. ─────────────────────────────────────────
const MorePanelBody = memo(({
  daily, noiseCancelOn, onToggleNoiseCancellation, leftTab, onLeftTab, callId, userId, isMobile,
}: {
  daily: ReturnType<typeof useDailyCall>;
  noiseCancelOn: boolean;
  onToggleNoiseCancellation: () => void;
  leftTab: LeftTab;
  onLeftTab: (t: LeftTab) => void;
  callId?: string;
  userId?: string;
  isMobile?: boolean;
}) => {
  const [tab, setTab] = useState<Exclude<LeftTab, "people">>(
    leftTab === "people" ? "chat" : leftTab,
  );

  return (
    <div className="flex flex-col h-full">
      {/* Host actions — same controls previously in the mobile "More" sheet,
          now shared by both desktop and mobile. */}
      <div className="p-3 space-y-2 border-b shrink-0" style={{ borderColor: T.border }}>
        {isMobile && (
          <button
            onClick={() => daily.switchCamera()}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left touch-manipulation"
            style={{ background: T.card, border: `1px solid ${T.border}` }}
          >
            <SwitchCamera className="w-4 h-4" style={{ color: T.text }} />
            <span className="text-sm font-medium" style={{ color: T.text }}>Switch camera</span>
          </button>
        )}
        <button
          onClick={onToggleNoiseCancellation}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left touch-manipulation"
          style={{ background: T.card, border: `1px solid ${T.border}` }}
        >
          {noiseCancelOn ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4" style={{ color: T.muted }} />}
          <span className="text-sm font-medium" style={{ color: T.text }}>
            Noise cancellation {noiseCancelOn ? "on" : "off"}
          </span>
        </button>
        <button
          onClick={() => daily.isRecording ? daily.stopRecording() : daily.startRecording()}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left touch-manipulation"
          style={{ background: T.card, border: `1px solid ${T.border}` }}
        >
          <CircleDot className={cn("w-4 h-4", daily.isRecording ? "text-red-400" : "")} style={!daily.isRecording ? { color: T.text } : undefined} />
          <span className="text-sm font-medium" style={{ color: T.text }}>
            {daily.isRecording ? "Stop recording" : "Start recording"}
          </span>
        </button>
      </div>

      {/* Chat / Notes / Files / Notifications */}
      <LeftPanel
        activeTab={tab}
        onTab={(t: LeftTab) => { setTab(t as Exclude<LeftTab, "people">); onLeftTab(t); }}
        participants={daily.participants}
        activeSpeakerId={daily.activeSpeakerId}
        callId={callId}
        userId={userId}
      />
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
          maxHeight: "82dvh",
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

// ─── MAIN COMPONENT ─────────────────────────────────────────────────────────────
export default function LiveMeeting() {
  const { id }    = useParams<{ id: string }>();
  const navigate  = useNavigate();
  const isMobile  = useIsMobile();
  const { user, session } = useAuth();
  const { team }  = useTeam();
  const { setStatus } = useUserStatus(team?.id);
  const { profile }   = useUserProfile();

  const hostName = useMemo(() => deriveHostName(profile, user?.email), [profile, user?.email]);

  const {
    liveCall, isLive, isLoading, endCall, markCallStarted, markHostJoined, callId,
  } = useLiveCall({ onCallEnded: () => setStatus("available") });

  const roomName     = (liveCall as any)?.daily_room_name    ?? null;
  const meetingToken = (liveCall as any)?.daily_meeting_token ?? null;

  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const health = useMeetingHealth(callId, micStream);

  const daily = useDailyCall({
    callId: callId ?? null, roomName, meetingToken, userName: hostName,
    // FIX: anchors the on-screen timer to the call's real DB start_time
    // instead of this tab's own join instant — see the sharedStartTime doc
    // comment in useDailyCall.ts. Fixes the timer resetting to 0 whenever
    // the host navigates away from /live/:id and back, and keeps it in
    // sync with whatever a guest sees on GuestJoin.
    sharedStartTime: (liveCall as any)?.start_time ?? null,
    // FIX: previously start_time (which determines whether the call ends up
    // "completed" vs "cancelled", and whether minutes get counted at all)
    // was stamped only by a server-side Daily webhook. If that webhook was
    // ever delayed or missed, a fully-attended meeting would incorrectly be
    // marked "cancelled" with 0 minutes used. Stamping it here too — the
    // instant the host's own browser confirms it joined — makes this
    // reliable regardless of webhook delivery. Idempotent / safe to call
    // more than once (no-op once start_time is already set).
    onJoined:  () => {
      setStatus("on_call");
      health.recordReconnect();
      if (callId) { markCallStarted(callId); markHostJoined(callId); }
    },
    onLeft:    () => {},
    onParticipantJoined: (p) => toast.success(`${p.user_name || "Someone"} joined`),
    onParticipantLeft:   () => toast.info("A participant left"),
    onRecordingStarted:  () => toast.success("Recording started"),
    onRecordingStopped:  () => toast.info("Recording stopped"),
    onNetworkQualityChange: (q) => {
      health.updateDailyNetworkQuality(q);
      if (q === "poor") toast.warning("Weak connection — video quality reduced", { id: "net" });
      else toast.dismiss("net");
    },
    onHandRaiseChange: (sid, raised, uname) => {
      if (raised) toast.info(`✋ ${uname} raised their hand`, { duration: 5000 });
    },
  });

  const { requests: guestRequests, admit: admitGuest, deny: denyGuest, isResponding } = usePendingGuestRequests(callId);
  const { workspace } = useMeetingWorkspace(callId);
  const { usage }     = useMinuteUsage();

  const [leftTab,         setLeftTab]         = useState<LeftTab>("people");
  const [isAudioOn,       setIsAudioOn]       = useState(true);
  const [isVideoOn,       setIsVideoOn]       = useState(true);
  // Desktop equivalent of mobilePanel: which on-demand popover (if any) is
  // open, anchored over the video stage instead of a permanent sidebar —
  // matches how Guest Join surfaces its People panel.
  const [desktopPanel,    setDesktopPanel]    = useState<"none" | "people" | "more">("none");
  const [reconnectCount,  setReconnectCount]  = useState(0);
  const [pinnedId,        setPinnedId]        = useState<string | null>(null);
  const [videoLayout,     setVideoLayout]     = useState<VideoLayout>("focus");
  const [mobilePanel,     setMobilePanel]     = useState<MobilePanel>("none");
  const [isHandRaised,    setIsHandRaised]    = useState(false);
  const [noiseCancelOn,   setNoiseCancelOn]   = useState(true);

  // ── Join ────────────────────────────────────────────────────────────────────
  // FIX: Use conditional spread so `token` key is entirely absent when falsy.
  // Daily.co SDK throws "property 'token': token should be a string" when the
  // key is present with value null or undefined.
  const joinAttemptedRef = useRef(false);
  useEffect(() => {
    if (!roomName || joinAttemptedRef.current || daily.isConnected || daily.isConnecting || daily.callState === "error") return;
    joinAttemptedRef.current = true;
    daily.joinCall({ rName: roomName, ...(meetingToken ? { token: meetingToken } : {}), displayName: hostName })
      .then((ok) => { if (!ok) joinAttemptedRef.current = false; });
  }, [roomName, hostName]); // eslint-disable-line

  // ── Auto-reconnect ──────────────────────────────────────────────────────────
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (daily.callState === "error" && isLive && reconnectCount < 3 && roomName) {
      setReconnectCount((c) => c + 1);
      const delay = Math.min(1000 * Math.pow(2, reconnectCount), 8000);
      reconnectTimerRef.current = setTimeout(() => {
        joinAttemptedRef.current = false;
        // FIX: Conditional spread — token key omitted when falsy
        daily.joinCall({ rName: roomName, ...(meetingToken ? { token: meetingToken } : {}), displayName: hostName });
      }, delay);
    }
    return () => clearTimeout(reconnectTimerRef.current);
  }, [daily.callState]); // eslint-disable-line

  // ── Mic level tracking ───────────────────────────────────────────────────────
  // Just feeds the mic-level meter in the health bar — no transcription
  // pipeline attached to this track anymore. The full call audio is captured
  // by Daily.co's cloud recording and transcribed after the call ends via
  // the Deepgram batch + diarization pipeline (see finalize-recording-transcript).
  const attachedTrackIdRef = useRef<string | null>(null);
  useEffect(() => {
    const localP = daily.participants.find((p) => p.local && p.audioTrack);
    if (!localP?.audioTrack) return;
    if (localP.audioTrack.id === attachedTrackIdRef.current) return;
    attachedTrackIdRef.current = localP.audioTrack.id;
    setMicStream(new MediaStream([localP.audioTrack]));
  }, [daily.participants]);

  // ── Auto-start recording the instant the host joins ─────────────────────
  // Recording-first pipeline: the entire post-meeting flow (Deepgram batch
  // transcription, speaker diarization, Host/Guest mapping, AI analysis)
  // only has anything to work with once Daily has a finished cloud
  // recording of the call — so this is the step that makes the rest of the
  // pipeline possible at all. It must not wait on a guest joining or any
  // timer: the host may talk before a guest ever connects (prep notes,
  // solo practice, waiting-room chatter), and none of that should be lost.
  // Starts as soon as the local (host) participant is connected — leaving
  // the manual Record/Stop control in the control bar for the host to stop
  // early or restart if needed.
  //
  // Guarded so this only ever fires once per call (autoRecordAttemptedRef),
  // and only once daily.isRecording is confirmed false, so a webhook-delayed
  // recording_status or a race with a manual click doesn't trigger a second,
  // redundant startRecording() call.
  const autoRecordAttemptedRef = useRef(false);
  useEffect(() => {
    if (autoRecordAttemptedRef.current) return;
    if (!daily.isConnected) return;
    if (daily.isRecording) { autoRecordAttemptedRef.current = true; return; }

    const hostConnected = daily.participants.some((p) => p.local);
    if (hostConnected) {
      autoRecordAttemptedRef.current = true;
      daily.startRecording().catch((e) => {
        console.warn("Auto-start recording failed, allowing manual retry:", e);
        autoRecordAttemptedRef.current = false;
      });
    }
  }, [daily.isConnected, daily.isRecording, daily.participants]);

  // ── Backgrounded-tab guard ───────────────────────────────────────────────────
  // Keeps the device awake (best-effort) while the host is on a call, and
  // warns them once per background/foreground cycle that mic/video may be
  // throttled by the OS while the tab isn't in view.
  const wakeLockRef = useRef<any>(null);
  const backgroundWarnedRef = useRef(false);
  useEffect(() => {
    if (!isLive) return;

    const requestWakeLock = async () => {
      try {
        if ("wakeLock" in navigator) {
          wakeLockRef.current = await (navigator as any).wakeLock.request("screen");
        }
      } catch (e) {
        // Not fatal — just means the throttling mitigation below is
        // unavailable on this browser/OS. The visibility warning still works.
        console.warn("[LiveMeeting] Wake Lock request failed:", e);
      }
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        if (!backgroundWarnedRef.current) {
          backgroundWarnedRef.current = true;
          toast.warning(
            "This tab is now in the background — your mic and camera may pause on most phones until you switch back.",
            { id: "bg-tab-warning", duration: 6000 },
          );
        }
      } else {
        // Coming back to the foreground: re-arm the one-time warning for
        // the next time it happens, and re-acquire the wake lock (the OS
        // releases it automatically whenever the tab is hidden).
        backgroundWarnedRef.current = false;
        requestWakeLock();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    requestWakeLock();

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      try { wakeLockRef.current?.release?.(); } catch { /* noop */ }
      wakeLockRef.current = null;
    };
  }, [isLive]);

  useEffect(() => { if (!isLoading && !isLive) navigate("/live"); }, [isLoading, isLive, navigate]);

  useEffect(() => () => {
    clearTimeout(reconnectTimerRef.current);
    attachedTrackIdRef.current = null;
    setMicStream(null);
  }, []);

  const handleToggleMic = useCallback(async () => {
    await daily.setAudioEnabled(!isAudioOn);
    setIsAudioOn((v) => !v);
  }, [isAudioOn, daily]);

  const handleToggleCam = useCallback(async () => {
    await daily.setVideoEnabled(!isVideoOn);
    setIsVideoOn((v) => !v);
  }, [isVideoOn, daily]);

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

  const handleNoiseCancellation = useCallback(async () => {
    const next = !noiseCancelOn;
    setNoiseCancelOn(next);
    await daily.setNoiseCancellation(next);
    toast.info(next ? "Noise cancellation on" : "Noise cancellation off");
  }, [noiseCancelOn, daily]);

  const handleRetryJoin = useCallback(() => {
    if (!roomName) return;
    joinAttemptedRef.current = false;
    // FIX: Conditional spread — token key omitted when falsy
    daily.joinCall({ rName: roomName, ...(meetingToken ? { token: meetingToken } : {}), displayName: hostName });
  }, [roomName, meetingToken, hostName, daily]);

  // Drives CallEndingOverlay: null = not ending, "processing" while the
  // end-call mutation is in flight, "ready" for a brief celebratory beat
  // right before navigating to the summary.
  const [endingPhase, setEndingPhase] = useState<"processing" | "ready" | null>(null);
  const [summaryFailed, setSummaryFailed] = useState(false);

  // Minimum time to hold each phase so the overlay reads as steady,
  // deliberate progress rather than a flash — especially on a fast
  // connection where the underlying work could otherwise finish in under a
  // second and make the whole thing feel abrupt.
  const MIN_PROCESSING_MS = 4_500;
  const READY_HOLD_MS     = 2_200;

  const handleEnd = useCallback(async () => {
    const startedAt = Date.now();
    setEndingPhase("processing");
    setSummaryFailed(false);
    await daily.leaveCall();
    try {
      const result = await endCall.mutateAsync();
      setSummaryFailed(!(result as any)?.summaryGenerated);

      const elapsed = Date.now() - startedAt;
      if (elapsed < MIN_PROCESSING_MS) {
        await new Promise((r) => setTimeout(r, MIN_PROCESSING_MS - elapsed));
      }

      setEndingPhase("ready");
      // Brief pause so "Almost there" is actually seen rather than flashing
      // by — the navigation underneath happens instantly, this is purely
      // about the transition feeling intentional instead of abrupt.
      await new Promise((r) => setTimeout(r, READY_HOLD_MS));

      // FIX: always land on Call Details (where the summary lives), never
      // back on a "live call" screen. callId should always be set here
      // (we're mid-call-end), but if it somehow isn't, the call list is a
      // far better fallback than /live, which reads as "start a new
      // meeting" — the opposite of what someone who just finished one
      // wants to see.
      navigate(callId ? `/calls/${callId}` : "/calls");
    } catch {
      setEndingPhase(null);
      toast.error("Failed to end call");
    }
  }, [endCall, callId, navigate, daily]);

  const handRaiseCount = useMemo(() =>
    daily.participants.filter((p) => p.handRaised).length,
  [daily.participants]);

  if (isLoading) return (
    <div className="min-h-dvh flex items-center justify-center" style={{ background: T.bg }}>
      <Loader2 className="w-6 h-6 animate-spin" style={{ color: T.accent }} />
    </div>
  );

  // ── Layout note ────────────────────────────────────────────────────────
  // This page intentionally matches the Guest Join page's shell: a full-
  // bleed 100dvh stage with a slim top bar, a single video area, and one
  // floating control pill — no dashboard chrome, no permanent side panel.
  // Every host control that used to live in the always-visible left panel
  // (People / Chat / Notes / Files / Notifications, plus Record and Noise
  // Cancellation) is still here, just surfaced the same way Guest Join
  // surfaces People: as an on-demand popover on desktop and a swipeable
  // bottom sheet on mobile, opened from the top bar or control pill. No
  // meeting control was removed — only the always-on multi-column shell
  // and the (already-unused) Live Transcription / Live AI Analysis / Live
  // AI Coaching surfaces that used to anchor it.
  return (
    <div className="flex flex-col overflow-hidden" style={{ height: "100dvh", background: T.bg }}>
      {endingPhase && <CallEndingOverlay phase={endingPhase} summaryFailed={summaryFailed} />}

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-2.5 sm:px-4 py-2 sm:py-2.5 border-b shrink-0 gap-1.5 sm:gap-2"
        style={{ borderColor: T.border, background: T.panel, backdropFilter: "blur(20px)" }}
      >
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="w-2 h-2 rounded-full bg-red-500" style={{ boxShadow: "0 0 8px rgba(239,68,68,.9)" }} />
            <span className="text-[11px] font-bold text-red-400 uppercase tracking-widest hidden sm:block">Live</span>
          </div>
          <div className="h-4 w-px shrink-0 hidden sm:block" style={{ background: T.border }} />
          <span className="text-xs sm:text-sm font-semibold text-white truncate max-w-[100px] xs:max-w-[160px] sm:max-w-none">
            {liveCall?.name || "Live Meeting"}
          </span>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3" style={{ color: T.muted }} />
            <span className="text-[11px] sm:text-xs font-mono font-semibold text-white tabular-nums">
              {fmt(daily.elapsedSeconds)}
            </span>
          </div>

          <div className="hidden md:block">
            <MeetingHealthBar health={health.health} />
          </div>

          <NetDot quality={daily.networkQuality} />
          {daily.isRecording && <RecBadge />}

          {handRaiseCount > 0 && (
            <div className="flex items-center gap-1 px-1.5 sm:px-2 py-1 rounded-lg"
              style={{ background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.25)" }}>
              <span className="text-xs">✋</span>
              <span className="text-[10px] font-bold text-amber-400">{handRaiseCount}</span>
            </div>
          )}

          {usage && !usage.isUnlimited && usage.pct >= 80 && (
            <div className="hidden sm:flex items-center gap-1 px-1.5 py-1 rounded-lg"
              style={{
                background: usage.pct >= 90 ? "rgba(239,68,68,0.1)" : "rgba(245,158,11,0.1)",
                border: `1px solid ${usage.pct >= 90 ? "rgba(239,68,68,0.25)" : "rgba(245,158,11,0.25)"}`,
              }}>
              <Clock className="w-3 h-3" style={{ color: usage.pct >= 90 ? T.red : T.amber }} />
              <span className="text-[10px] font-semibold" style={{ color: usage.pct >= 90 ? T.red : T.amber }}>
                {usage.minutesRemaining}m
              </span>
            </div>
          )}

          {/* People — same slot GuestJoin uses, with a badge for pending
              guest requests instead of just participant count. */}
          <button
            onClick={() => (isMobile ? setMobilePanel(mobilePanel === "people" ? "none" : "people") : setDesktopPanel(desktopPanel === "people" ? "none" : "people"))}
            className="relative w-8 h-8 rounded-xl flex items-center justify-center touch-manipulation"
            style={{
              background: (isMobile ? mobilePanel === "people" : desktopPanel === "people") ? "rgba(99,102,241,0.2)" : T.card,
              border: `1px solid ${T.border}`,
            }}
          >
            <Users className="w-4 h-4 text-white" />
            {(daily.participantCount > 0 || guestRequests.length > 0) && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-indigo-500 text-white text-[9px] font-bold flex items-center justify-center">
                {guestRequests.length || daily.participantCount}
              </span>
            )}
          </button>

          {/* More — Chat / Notes / Files / Notifications / Record / Noise
              cancellation / switch camera, in one popover (desktop) or
              sheet (mobile), instead of a permanent side panel. */}
          <button
            onClick={() => (isMobile ? setMobilePanel(mobilePanel === "more" ? "none" : "more") : setDesktopPanel(desktopPanel === "more" ? "none" : "more"))}
            className="relative w-8 h-8 rounded-xl flex items-center justify-center touch-manipulation"
            style={{
              background: (isMobile ? mobilePanel === "more" : desktopPanel === "more") ? "rgba(99,102,241,0.2)" : T.card,
              border: `1px solid ${T.border}`,
            }}
          >
            <MoreHorizontal className="w-4 h-4 text-white" />
          </button>
        </div>
      </div>

      {/* Guest approval banner */}
      <GuestBanner requests={guestRequests} admit={admitGuest} deny={denyGuest} loading={isResponding} />

      {/* ── Video — full-bleed stage, same as Guest Join ────────────────── */}
      <div className="flex-1 min-h-0 p-1 sm:p-3 relative">
        {isMobile && daily.isConnected && !daily.error && daily.participants.length >= 2 ? (
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
            participants={daily.participants} activeSpeakerId={daily.activeSpeakerId}
            isConnecting={daily.isConnecting} isConnected={daily.isConnected}
            error={daily.error} roomName={roomName} onRetry={handleRetryJoin}
            pinnedId={pinnedId} onPin={setPinnedId}
            layout={videoLayout} onLayoutChange={setVideoLayout}
          />
        )}

        {/* Desktop panel — anchored popover instead of a permanent sidebar */}
        {!isMobile && desktopPanel !== "none" && (
          <div
            className="absolute top-2 right-2 w-80 rounded-2xl overflow-hidden flex flex-col z-30"
            style={{ height: "min(560px, calc(100% - 16px))", background: T.panel, border: `1px solid ${T.border}`, boxShadow: "0 12px 40px rgba(0,0,0,0.45)" }}
          >
            <div className="flex items-center justify-between px-3 py-2 border-b shrink-0" style={{ borderColor: T.border }}>
              <span className="text-xs font-semibold text-white">
                {desktopPanel === "people" ? "Participants" : "More"}
              </span>
              <button onClick={() => setDesktopPanel("none")} className="w-6 h-6 rounded-lg flex items-center justify-center"
                style={{ background: T.card }}>
                <X className="w-3.5 h-3.5" style={{ color: T.muted }} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {desktopPanel === "people" ? (
                <LeftPanel activeTab={leftTab} onTab={setLeftTab} participants={daily.participants}
                  activeSpeakerId={daily.activeSpeakerId} callId={callId} userId={user?.id} />
              ) : (
                <MorePanelBody
                  daily={daily}
                  noiseCancelOn={noiseCancelOn}
                  onToggleNoiseCancellation={handleNoiseCancellation}
                  leftTab={leftTab}
                  onLeftTab={setLeftTab}
                  callId={callId}
                  userId={user?.id}
                />
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Control bar — one floating pill, same shape as Guest Join's ──── */}
      <div className="px-1.5 sm:px-3 pb-1.5 sm:pb-3 shrink-0" style={{ paddingBottom: "max(6px, env(safe-area-inset-bottom))" }}>
        <div
          className="flex items-center justify-center gap-1 sm:gap-2 px-1.5 sm:px-3 py-2 sm:py-2.5 rounded-2xl flex-wrap"
          style={{ background: "rgba(13,15,24,0.95)", border: `1px solid ${T.border}`, backdropFilter: "blur(24px)" }}
        >
          <Ctrl icon={isAudioOn ? Mic : MicOff} label={isAudioOn ? "Mic" : "Muted"} active={isAudioOn} onClick={handleToggleMic} />
          <Ctrl icon={isVideoOn ? Video : VideoOff} label={isVideoOn ? "Cam" : "Off"} active={isVideoOn} onClick={handleToggleCam} />

          {isMobile && (
            <Ctrl icon={SwitchCamera} label="Flip" onClick={() => daily.switchCamera()} />
          )}

          <Ctrl
            icon={daily.isScreenSharing ? MonitorOff : MonitorPlay}
            label={daily.isScreenSharing ? "Stop" : "Share"}
            title={!daily.isScreenSharing ? daily.screenShareUnavailableMessage ?? undefined : undefined}
            active={!daily.isScreenSharing}
            highlight={daily.isScreenSharing}
            onClick={handleScreenShare}
          />

          <Ctrl icon={Hand} label={isHandRaised ? "Lower" : "Raise"} highlight={isHandRaised} onClick={handleHandRaise} />

          {!isMobile && (
            <Ctrl
              icon={noiseCancelOn ? Volume2 : VolumeX}
              label={noiseCancelOn ? "NC On" : "NC Off"}
              active={noiseCancelOn}
              onClick={handleNoiseCancellation}
            />
          )}

          <Ctrl
            icon={CircleDot}
            label={daily.isRecording ? "Stop" : "Record"}
            active={!daily.isRecording}
            badge={daily.isRecording ? 1 : undefined}
            onClick={() => daily.isRecording ? daily.stopRecording() : daily.startRecording()}
          />

          <button
            onClick={handleEnd}
            disabled={endCall.isPending}
            className="h-10 sm:h-12 px-3 sm:px-8 rounded-xl text-xs sm:text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95 touch-manipulation"
            style={{ background: "linear-gradient(135deg,#dc2626,#b91c1c)", boxShadow: "0 4px 16px rgba(220,38,38,.35)" }}
          >
            {endCall.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin sm:hidden" />
            ) : (
              <PhoneOff className="w-4 h-4 sm:hidden" />
            )}
            <span className="hidden sm:inline">{endCall.isPending ? "Ending…" : "End Call"}</span>
          </button>
        </div>
      </div>

      {/* ── Mobile bottom sheets ─────────────────────────────────────────── */}
      <MobileSheet open={mobilePanel === "people"} onClose={() => setMobilePanel("none")} title="Participants">
        <LeftPanel activeTab={leftTab} onTab={setLeftTab} participants={daily.participants}
          activeSpeakerId={daily.activeSpeakerId} callId={callId} userId={user?.id} />
      </MobileSheet>

      <MobileSheet open={mobilePanel === "more"} onClose={() => setMobilePanel("none")} title="More">
        <MorePanelBody
          daily={daily}
          noiseCancelOn={noiseCancelOn}
          onToggleNoiseCancellation={handleNoiseCancellation}
          leftTab={leftTab}
          onLeftTab={setLeftTab}
          callId={callId}
          userId={user?.id}
          isMobile
        />
      </MobileSheet>
    </div>
  );
}