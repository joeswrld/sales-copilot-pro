/**
 * GuestJoin.tsx — v2 (Mobile-first, Meet-style grid)
 *
 * Guest experience for joining a Fixsense meeting via share link.
 * Features:
 *  - Pre-join lobby with camera/mic preview
 *  - Google Meet-style video grid with spotlight + strip
 *  - Click any tile to pin/focus them
 *  - Mobile bottom sheet for participants
 *  - Responsive from 320px up
 *  - Guest approval request flow
 */

import { useState, useEffect, useRef, useCallback, memo, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Mic, MicOff, Video, VideoOff, PhoneOff, Users,
  Loader2, WifiOff, RefreshCw, Settings, LayoutGrid,
  Maximize2, PanelRight, X, Pin, PinOff, ChevronRight,
  AlertCircle, CheckCircle2, Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useDailyCall, DailyParticipant, CallQuality } from "@/hooks/useDailyCall";
import { VideoTile } from "@/components/VideoTile";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ─── Types ──────────────────────────────────────────────────────────────────────
type VideoLayout = "spotlight" | "grid" | "sidebar";
type JoinStep    = "lobby" | "requesting" | "waiting" | "admitted" | "denied";

// ─── Design tokens ───────────────────────────────────────────────────────────────
const T = {
  bg:     "#080a12",
  panel:  "rgba(12,14,22,0.96)",
  card:   "rgba(255,255,255,0.04)",
  border: "rgba(255,255,255,0.07)",
  accent: "#6366f1",
  text:   "rgba(255,255,255,0.85)",
  muted:  "rgba(255,255,255,0.35)",
  subtle: "rgba(255,255,255,0.12)",
};

function qualityColor(q: CallQuality) {
  return q === "excellent" || q === "good" ? "#10b981" : q === "fair" ? "#f59e0b" : "#ef4444";
}
function fmt(s: number) {
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

// ─── Pinnable tile ──────────────────────────────────────────────────────────────
const PinnableTile = memo(({
  participant, activeSpeakerId, isPinned, onPin, className, isMain = false,
}: {
  participant: DailyParticipant; activeSpeakerId: string | null;
  isPinned: boolean; onPin: (id: string | null) => void;
  className?: string; isMain?: boolean;
}) => (
  <div className={cn("relative group cursor-pointer select-none rounded-xl overflow-hidden", className)}
    onClick={() => onPin(isPinned ? null : participant.session_id)}>
    <VideoTile participant={participant} isMain={isMain} activeSpeakerId={activeSpeakerId} className="w-full h-full" />
    <div className={cn(
      "absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold transition-all duration-150",
      "opacity-0 group-hover:opacity-100",
      isPinned ? "opacity-100" : "",
    )}
      style={{ background: isPinned ? "rgba(99,102,241,0.85)" : "rgba(0,0,0,0.55)", backdropFilter: "blur(8px)", color: "#fff" }}>
      {isPinned ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
      {isPinned ? "Unpin" : "Pin"}
    </div>
  </div>
));

// ─── Video grid (same logic as LiveMeeting) ─────────────────────────────────────
const VideoGrid = memo(({
  participants, activeSpeakerId, isConnecting, error, onRetry,
  pinnedId, onPin, layout, onLayoutChange,
}: {
  participants: DailyParticipant[]; activeSpeakerId: string | null;
  isConnecting: boolean; error: string | null; onRetry: () => void;
  pinnedId: string | null; onPin: (id: string | null) => void;
  layout: VideoLayout; onLayoutChange: (l: VideoLayout) => void;
}) => {
  if (error) return (
    <div className="h-full flex flex-col items-center justify-center gap-4 p-8 text-center">
      <WifiOff className="w-10 h-10 text-red-400" />
      <div>
        <p className="text-sm font-semibold text-red-400 mb-1">Connection failed</p>
        <p className="text-xs max-w-xs" style={{ color: T.muted }}>{error}</p>
      </div>
      <button onClick={onRetry} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white"
        style={{ background: "rgba(99,102,241,0.2)", border: "1px solid rgba(99,102,241,0.3)" }}>
        <RefreshCw className="w-4 h-4" /> Retry
      </button>
    </div>
  );

  if (isConnecting) return (
    <div className="h-full flex flex-col items-center justify-center gap-3">
      <Loader2 className="w-8 h-8 animate-spin" style={{ color: T.accent }} />
      <p className="text-sm" style={{ color: T.muted }}>Joining meeting…</p>
    </div>
  );

  if (participants.length === 0) return (
    <div className="h-full flex flex-col items-center justify-center gap-3 text-center p-6">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
        style={{ background: T.card, border: `1px solid ${T.border}` }}>
        <Users className="w-8 h-8" style={{ color: T.subtle }} />
      </div>
      <p className="text-sm" style={{ color: T.muted }}>Waiting for others…</p>
    </div>
  );

  const LayoutSwitcher = (
    <div className="absolute top-3 right-3 z-20 flex items-center gap-1.5">
      {(["spotlight", "grid", "sidebar"] as VideoLayout[]).map((l) => {
        const icons = { spotlight: Maximize2, grid: LayoutGrid, sidebar: PanelRight };
        const Icon = icons[l];
        return (
          <button key={l} onClick={(e) => { e.stopPropagation(); onLayoutChange(l); }}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-all"
            style={{
              background: layout === l ? "rgba(99,102,241,0.85)" : "rgba(0,0,0,0.45)",
              backdropFilter: "blur(8px)",
              border: `1px solid ${layout === l ? "rgba(99,102,241,0.5)" : "rgba(255,255,255,0.1)"}`,
            }}>
            <Icon className="w-3.5 h-3.5 text-white" />
          </button>
        );
      })}
    </div>
  );

  if (participants.length === 1) return (
    <div className="relative h-full">
      {LayoutSwitcher}
      <PinnableTile participant={participants[0]} activeSpeakerId={activeSpeakerId}
        isPinned={false} onPin={onPin} isMain className="h-full" />
    </div>
  );

  const spotlightId = pinnedId ?? activeSpeakerId ?? participants[0]?.session_id;
  const spotlight   = participants.find((p) => p.session_id === spotlightId) ?? participants[0];
  const strip       = participants.filter((p) => p.session_id !== spotlight.session_id);

  if (layout === "spotlight") return (
    <div className="relative h-full flex flex-col gap-2">
      {LayoutSwitcher}
      <div className="flex-1 min-h-0">
        <PinnableTile participant={spotlight} activeSpeakerId={activeSpeakerId}
          isPinned={!!pinnedId} onPin={onPin} isMain className="h-full" />
      </div>
      {strip.length > 0 && (
        <div className="flex gap-2 shrink-0 overflow-x-auto pb-1"
          style={{ height: "clamp(80px, 20%, 130px)" }}>
          {strip.map((p) => (
            <div key={p.session_id} className="shrink-0 rounded-xl overflow-hidden"
              style={{ width: "clamp(120px, 160px, 200px)", height: "100%" }}>
              <PinnableTile participant={p} activeSpeakerId={activeSpeakerId}
                isPinned={pinnedId === p.session_id} onPin={onPin} className="h-full w-full" />
            </div>
          ))}
        </div>
      )}
    </div>
  );

  if (layout === "sidebar") return (
    <div className="relative h-full flex gap-2">
      {LayoutSwitcher}
      <div className="flex-1 min-w-0">
        <PinnableTile participant={spotlight} activeSpeakerId={activeSpeakerId}
          isPinned={!!pinnedId} onPin={onPin} isMain className="h-full" />
      </div>
      {strip.length > 0 && (
        <div className="flex flex-col gap-2 overflow-y-auto" style={{ width: "clamp(100px, 22%, 180px)" }}>
          {strip.map((p) => (
            <div key={p.session_id} className="shrink-0 rounded-xl overflow-hidden aspect-video">
              <PinnableTile participant={p} activeSpeakerId={activeSpeakerId}
                isPinned={pinnedId === p.session_id} onPin={onPin} className="h-full w-full" />
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // Grid
  const count = participants.length;
  const cols  = count <= 2 ? 2 : count <= 4 ? 2 : count <= 6 ? 3 : 4;
  const rows  = Math.ceil(count / cols);
  return (
    <div className="relative h-full">
      {LayoutSwitcher}
      <div className="h-full gap-2" style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` }}>
        {participants.map((p) => (
          <PinnableTile key={p.session_id} participant={p} activeSpeakerId={activeSpeakerId}
            isPinned={pinnedId === p.session_id} onPin={onPin} className="h-full" />
        ))}
      </div>
    </div>
  );
});

// ─── Pre-join lobby camera preview ──────────────────────────────────────────────
const LobbyPreview = memo(({ stream, isAudioOn, isVideoOn }: {
  stream: MediaStream | null; isAudioOn: boolean; isVideoOn: boolean;
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (stream && isVideoOn) {
      el.srcObject = stream;
      el.play().catch(() => {});
    } else {
      el.srcObject = null;
    }
  }, [stream, isVideoOn]);

  return (
    <div className="relative w-full aspect-video rounded-2xl overflow-hidden"
      style={{ background: "linear-gradient(135deg,#1a1d26,#0f1117)" }}>
      <video ref={videoRef} autoPlay playsInline muted className={cn("w-full h-full object-cover", (!isVideoOn || !stream) && "hidden")} />
      {(!isVideoOn || !stream) && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-16 h-16 rounded-full flex items-center justify-center font-bold text-2xl text-white"
            style={{ background: "linear-gradient(135deg,rgba(99,102,241,0.4),rgba(139,92,246,0.4))", border: "2px solid rgba(99,102,241,0.3)" }}>
            ?
          </div>
        </div>
      )}
      {/* Audio indicator */}
      <div className="absolute bottom-3 left-3 flex items-center gap-1.5 px-2 py-1 rounded-lg"
        style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)" }}>
        {isAudioOn
          ? <div className="flex items-end gap-px">{[3,5,4,6,3].map((h, i) => (
              <div key={i} className="w-[2px] bg-emerald-400 rounded-full" style={{ height: `${h}px` }} />
            ))}</div>
          : <MicOff className="w-3 h-3 text-red-400" />}
        <span className="text-[10px]" style={{ color: T.muted }}>{isAudioOn ? "Mic on" : "Mic off"}</span>
      </div>
    </div>
  );
});

// ─── MAIN ───────────────────────────────────────────────────────────────────────
export default function GuestJoin() {
  const { roomName } = useParams<{ roomName: string }>();
  const navigate     = useNavigate();

  const [step,        setStep]        = useState<JoinStep>("lobby");
  const [guestName,   setGuestName]   = useState("");
  const [isAudioOn,   setIsAudioOn]   = useState(true);
  const [isVideoOn,   setIsVideoOn]   = useState(true);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [requestId,   setRequestId]   = useState<string | null>(null);
  const [pinnedId,    setPinnedId]    = useState<string | null>(null);
  const [videoLayout, setVideoLayout] = useState<VideoLayout>("spotlight");
  const [showPeople,  setShowPeople]  = useState(false);

  // Get local camera/mic for lobby preview
  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then(setLocalStream)
      .catch(() => {
        // Try audio only
        navigator.mediaDevices.getUserMedia({ audio: true })
          .then(setLocalStream)
          .catch(() => {});
      });
    return () => { localStream?.getTracks().forEach((t) => t.stop()); };
  }, []); // eslint-disable-line

  const daily = useDailyCall({
    callId:   null,
    roomName: step === "admitted" ? (roomName ?? null) : null,
    userName: guestName || "Guest",
    onJoined:  () => setStep("admitted"),
    onLeft:    () => navigate("/"),
    onParticipantJoined: (p) => toast.info(`${p.user_name || "Someone"} joined`),
    onParticipantLeft:   () => {},
  });

  // Poll for admission status
  useEffect(() => {
    if (step !== "waiting" || !requestId) return;
    const interval = setInterval(async () => {
      const { data } = await (supabase as any)
        .from("call_guest_requests")
        .select("status")
        .eq("id", requestId)
        .maybeSingle();
      if (data?.status === "admitted") {
        setStep("admitted");
        daily.joinCall({ rName: roomName!, displayName: guestName || "Guest" });
      } else if (data?.status === "denied" || data?.status === "expired") {
        setStep("denied");
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [step, requestId, roomName, guestName, daily]);

  const handleRequestJoin = async () => {
    if (!guestName.trim() || !roomName) return;
    setStep("requesting");
    try {
      const { data, error } = await supabase.functions.invoke("guest-join-request", {
        body: { room_name: roomName, guest_name: guestName.trim() },
      });
      if (error) throw error;
      setRequestId(data?.request_id ?? null);
      setStep("waiting");
    } catch {
      toast.error("Couldn't send join request. Check the meeting link.");
      setStep("lobby");
    }
  };

  const handleLeave = useCallback(async () => {
    localStream?.getTracks().forEach((t) => t.stop());
    await daily.leaveCall();
    navigate("/");
  }, [localStream, daily, navigate]);

  // ── LOBBY ────────────────────────────────────────────────────────────────────
  if (step !== "admitted") return (
    <div className="min-h-dvh flex flex-col items-center justify-center p-4 sm:p-6"
      style={{ background: T.bg }}>
      <div className="w-full max-w-md">
        {/* Logo / branding */}
        <div className="text-center mb-6">
          <div className="w-10 h-10 rounded-xl mx-auto mb-3 flex items-center justify-center"
            style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)" }}>
            <Video className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-xl font-bold text-white">Join Meeting</h1>
          {roomName && <p className="text-xs mt-1" style={{ color: T.muted }}>Room: {roomName}</p>}
        </div>

        <div className="rounded-2xl p-4 sm:p-6 space-y-5"
          style={{ background: T.panel, border: `1px solid ${T.border}` }}>

          {/* Camera preview */}
          <LobbyPreview stream={localStream} isAudioOn={isAudioOn} isVideoOn={isVideoOn} />

          {/* Mic / Camera toggles */}
          <div className="flex gap-3">
            <button onClick={() => setIsAudioOn((v) => !v)}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium transition-all touch-manipulation"
              style={isAudioOn
                ? { background: "rgba(255,255,255,0.08)", border: `1px solid ${T.border}`, color: "#fff" }
                : { background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", color: "#f87171" }}>
              {isAudioOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
              {isAudioOn ? "Mic on" : "Mic off"}
            </button>
            <button onClick={() => setIsVideoOn((v) => !v)}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium transition-all touch-manipulation"
              style={isVideoOn
                ? { background: "rgba(255,255,255,0.08)", border: `1px solid ${T.border}`, color: "#fff" }
                : { background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", color: "#f87171" }}>
              {isVideoOn ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
              {isVideoOn ? "Camera on" : "Camera off"}
            </button>
          </div>

          {/* Name input */}
          {step !== "denied" && (
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: T.muted }}>
                Your name
              </label>
              <input
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && guestName.trim() && handleRequestJoin()}
                placeholder="Enter your name…"
                className="w-full px-4 py-3 rounded-xl outline-none text-sm"
                style={{ background: T.card, border: `1px solid ${T.border}`, color: T.text }}
                autoFocus
              />
            </div>
          )}

          {/* Status message */}
          {step === "waiting" && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
              style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)" }}>
              <Loader2 className="w-4 h-4 animate-spin text-indigo-400 shrink-0" />
              <div>
                <p className="text-sm font-medium text-white">Waiting for the host</p>
                <p className="text-[11px]" style={{ color: T.muted }}>The host will admit you shortly</p>
              </div>
            </div>
          )}

          {step === "denied" && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
              style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <div>
                <p className="text-sm font-medium text-red-400">Entry not allowed</p>
                <p className="text-[11px]" style={{ color: T.muted }}>The host declined your request</p>
              </div>
            </div>
          )}

          {/* CTA */}
          {step !== "denied" && (
            <button
              onClick={handleRequestJoin}
              disabled={!guestName.trim() || step === "requesting" || step === "waiting"}
              className="w-full py-3.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-[0.98] touch-manipulation disabled:opacity-50 disabled:pointer-events-none"
              style={{ background: "linear-gradient(135deg,#4f46e5,#7c3aed)" }}>
              {step === "requesting" ? (
                <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Sending request…</span>
              ) : step === "waiting" ? (
                <span className="flex items-center justify-center gap-2"><Clock className="w-4 h-4" /> Waiting for host…</span>
              ) : "Ask to join"}
            </button>
          )}

          {step === "denied" && (
            <button onClick={() => setStep("lobby")}
              className="w-full py-3.5 rounded-xl text-sm font-semibold text-white touch-manipulation"
              style={{ background: T.card, border: `1px solid ${T.border}` }}>
              Try again
            </button>
          )}
        </div>
      </div>
    </div>
  );

  // ── IN MEETING ───────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col overflow-hidden" style={{ height: "100dvh", background: T.bg }}>

      {/* Top bar */}
      <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 border-b shrink-0 gap-2"
        style={{ borderColor: T.border, background: T.panel, backdropFilter: "blur(20px)" }}>
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="w-2 h-2 rounded-full bg-emerald-400" style={{ boxShadow: "0 0 8px rgba(16,185,129,.8)" }} />
            <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-widest hidden sm:block">Live</span>
          </div>
          <div className="h-4 w-px shrink-0 hidden sm:block" style={{ background: T.border }} />
          <span className="text-xs sm:text-sm font-semibold text-white truncate">
            {roomName?.replace(/-/g, " ") || "Meeting"}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3" style={{ color: T.muted }} />
            <span className="text-xs font-mono font-semibold text-white tabular-nums">{fmt(daily.elapsedSeconds)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ background: qualityColor(daily.networkQuality) }} />
          </div>
          <button onClick={() => setShowPeople((v) => !v)}
            className="relative w-8 h-8 rounded-xl flex items-center justify-center touch-manipulation"
            style={{ background: showPeople ? "rgba(99,102,241,0.2)" : T.card, border: `1px solid ${T.border}` }}>
            <Users className="w-4 h-4 text-white" />
            {daily.participantCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-indigo-500 text-white text-[9px] font-bold flex items-center justify-center">
                {daily.participantCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Video */}
      <div className="flex-1 min-h-0 p-2 sm:p-3">
        <VideoGrid
          participants={daily.participants} activeSpeakerId={daily.activeSpeakerId}
          isConnecting={daily.isConnecting} error={daily.error}
          onRetry={() => daily.joinCall({ rName: roomName!, displayName: guestName || "Guest" })}
          pinnedId={pinnedId} onPin={setPinnedId}
          layout={videoLayout} onLayoutChange={setVideoLayout}
        />
      </div>

      {/* Control bar */}
      <div className="px-2 sm:px-3 pb-2 sm:pb-3 shrink-0">
        <div className="flex items-center justify-center gap-2 sm:gap-3 px-4 py-2.5 rounded-2xl"
          style={{ background: "rgba(13,15,24,0.95)", border: `1px solid ${T.border}`, backdropFilter: "blur(24px)" }}>

          <button onClick={async () => { await daily.setAudioEnabled(!isAudioOn); setIsAudioOn((v) => !v); }}
            className="w-12 h-12 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all touch-manipulation"
            style={{ background: isAudioOn ? "rgba(255,255,255,0.08)" : "rgba(239,68,68,0.15)", border: `1px solid ${isAudioOn ? T.border : "rgba(239,68,68,0.3)"}` }}>
            {isAudioOn ? <Mic className="w-5 h-5 text-white" /> : <MicOff className="w-5 h-5 text-red-400" />}
            <span className="text-[9px] font-medium" style={{ color: isAudioOn ? T.muted : "#f87171" }}>
              {isAudioOn ? "Mic" : "Muted"}
            </span>
          </button>

          <button onClick={async () => { await daily.setVideoEnabled(!isVideoOn); setIsVideoOn((v) => !v); }}
            className="w-12 h-12 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all touch-manipulation"
            style={{ background: isVideoOn ? "rgba(255,255,255,0.08)" : "rgba(239,68,68,0.15)", border: `1px solid ${isVideoOn ? T.border : "rgba(239,68,68,0.3)"}` }}>
            {isVideoOn ? <Video className="w-5 h-5 text-white" /> : <VideoOff className="w-5 h-5 text-red-400" />}
            <span className="text-[9px] font-medium" style={{ color: isVideoOn ? T.muted : "#f87171" }}>
              {isVideoOn ? "Cam" : "Off"}
            </span>
          </button>

          <button onClick={handleLeave}
            className="h-12 px-5 sm:px-8 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95 touch-manipulation"
            style={{ background: "linear-gradient(135deg,#dc2626,#b91c1c)", boxShadow: "0 4px 16px rgba(220,38,38,.35)" }}>
            <PhoneOff className="w-5 h-5 sm:hidden" />
            <span className="hidden sm:inline">Leave meeting</span>
          </button>
        </div>
      </div>

      {/* Participants sidebar (mobile bottom sheet / desktop overlay) */}
      {showPeople && (
        <>
          <div className="fixed inset-0 z-40 sm:hidden bg-black/60 backdrop-blur-sm"
            onClick={() => setShowPeople(false)} />
          <div className="fixed z-50 bottom-0 left-0 right-0 sm:static rounded-t-2xl sm:rounded-xl sm:absolute sm:top-12 sm:right-3 sm:bottom-auto sm:w-64"
            style={{ background: T.panel, border: `1px solid ${T.border}`, maxHeight: "70vh" }}>
            <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: T.border }}>
              <div className="w-8 h-1 rounded-full mx-auto absolute top-2 left-1/2 -translate-x-1/2 sm:hidden"
                style={{ background: T.subtle }} />
              <span className="text-sm font-semibold text-white">
                Participants ({daily.participantCount})
              </span>
              <button onClick={() => setShowPeople(false)}
                className="w-7 h-7 rounded-lg flex items-center justify-center touch-manipulation"
                style={{ background: T.card }}>
                <X className="w-4 h-4" style={{ color: T.muted }} />
              </button>
            </div>
            <div className="overflow-y-auto p-2" style={{ maxHeight: "calc(70vh - 56px)" }}>
              {daily.participants.map((p) => (
                <div key={p.session_id} className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-white/[0.04] cursor-pointer transition-colors"
                  onClick={() => { setPinnedId(pinnedId === p.session_id ? null : p.session_id); setShowPeople(false); }}>
                  <div className="relative">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
                      style={{ background: p.session_id === daily.activeSpeakerId ? "linear-gradient(135deg,#10b981,#059669)" : "linear-gradient(135deg,#6366f1,#8b5cf6)" }}>
                      {(p.user_name || "?")[0]?.toUpperCase()}
                    </div>
                    {p.session_id === daily.activeSpeakerId && (
                      <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 bg-emerald-400"
                        style={{ borderColor: T.bg }} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate" style={{ color: T.text }}>
                      {p.user_name || "Participant"}
                      {p.local && <span style={{ color: T.muted }}> (You)</span>}
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
          </div>
        </>
      )}
    </div>
  );
}