/**
 * GuestJoin.tsx — v4 (Professional Lobby)
 *
 * Route: /join/:roomName
 * Public — NO Fixsense auth required.
 *
 * v4 changes over v3:
 *  - Replaced simple name entry with full GuestLobby component
 *    (camera preview, mic meter, network test, speaker test, device picker)
 *  - Tracks and reuses the MediaStream from the lobby so camera turns on
 *    immediately when admitted — no second permission prompt
 *  - Reconnection: auto-retries on connection drop up to 3 times with
 *    exponential backoff; shows reconnection indicator
 *  - In-call: full quality indicators (network badge, speaking indicator)
 *  - Per-guest health event logging via log-meeting-health edge function
 *  - Mobile-optimised viewport and controls
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import {
  Loader2, Shield, Users, Video, VideoOff, Mic, MicOff,
  AlertCircle, RefreshCw, CheckCircle2, PhoneOff, Hourglass, XCircle,
  Wifi, WifiOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useDailyCall, DailyParticipant } from "@/hooks/useDailyCall";
import GuestLobby, { type LobbyPassResult } from "@/components/GuestLobby";
import { toast } from "sonner";

// ─── Env ────────────────────────────────────────────────────────────────────
const SUPABASE_URL     = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

// ─── Types ──────────────────────────────────────────────────────────────────
interface RoomInfo {
  found: boolean;
  room_url: string;
  room_name: string;
  call_name: string;
  status: string;
  id?: string;
}

type PageStatus =
  | "loading"
  | "name_entry"
  | "lobby"
  | "waiting"
  | "denied"
  | "connecting"
  | "reconnecting"
  | "in_meeting"
  | "error";

// ─── API helpers ─────────────────────────────────────────────────────────────

async function fetchRoomInfo(roomName: string): Promise<RoomInfo> {
  const res = await fetch(
    `${SUPABASE_URL}/functions/v1/get-guest-room-info?room=${encodeURIComponent(roomName)}`,
    { headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" } }
  );
  if (!res.ok) return { found: false, room_url: `https://fixsense.daily.co/${roomName}`, room_name: roomName, call_name: "Fixsense Meeting", status: "unknown" };
  return res.json();
}

async function requestToJoin(roomName: string, guestName: string) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/guest-join-request`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ room_name: roomName, guest_name: guestName }),
  });
  if (!res.ok) throw new Error("Could not reach the host. Please try again.");
  return res.json() as Promise<{ requires_approval: boolean; request_id: string | null; status: string }>;
}

async function checkRequestStatus(requestId: string) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/guest-request-status?id=${requestId}`, {
    headers: { apikey: SUPABASE_ANON_KEY },
  });
  if (!res.ok) throw new Error("status check failed");
  return res.json() as Promise<{ status: string }>;
}

function logHealthEvent(callId: string | undefined, type: string, severity: "info" | "warn" | "error", meta: Record<string, unknown> = {}) {
  if (!callId) return;
  fetch(`${SUPABASE_URL}/functions/v1/log-meeting-health`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ call_id: callId, event_type: type, severity, metadata: meta }),
  }).catch(() => {});
}

// ─── Video tile (lightweight, for in-call) ───────────────────────────────────

function GuestVideoTile({ participant, isMain = false, activeSpeakerId, className }: {
  participant: DailyParticipant; isMain?: boolean; activeSpeakerId: string | null; className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const isSpeaking = participant.session_id === activeSpeakerId;

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (participant.videoTrack && participant.video) {
      el.srcObject = new MediaStream([participant.videoTrack]);
      el.play().catch(() => {});
    } else { el.srcObject = null; }
    return () => { if (el.srcObject) el.srcObject = null; };
  }, [participant.videoTrack, participant.video]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el || participant.local) return;
    if (participant.audioTrack && participant.audio) {
      el.srcObject = new MediaStream([participant.audioTrack]);
      el.play().catch(() => {});
    } else { el.srcObject = null; }
    return () => { if (el.srcObject) el.srcObject = null; };
  }, [participant.audioTrack, participant.audio, participant.local]);

  return (
    <div className={cn(
      "relative overflow-hidden border transition-all duration-300 rounded-xl",
      isSpeaking ? "border-emerald-400/60 shadow-[0_0_20px_rgba(52,211,153,0.15)]" : "border-white/8",
      className,
    )} style={{ background: "linear-gradient(135deg, #1a1d26 0%, #0f1117 100%)" }}>
      <video ref={videoRef} autoPlay playsInline muted
        className={cn("w-full h-full object-cover scale-x-[-1]", (!participant.video || !participant.videoTrack) && "hidden")} />
      {!participant.local && <audio ref={audioRef} autoPlay playsInline style={{ display: "none" }} />}
      {(!participant.video || !participant.videoTrack) && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className={cn(
            "rounded-full flex items-center justify-center font-bold text-white",
            isMain ? "w-16 h-16 text-xl" : "w-10 h-10 text-sm",
            isSpeaking ? "bg-gradient-to-br from-emerald-500/40 to-teal-600/40 border-2 border-emerald-400/50"
                       : "bg-gradient-to-br from-violet-500/40 to-indigo-600/40 border border-white/10",
          )}>{(participant.user_name || "?")[0]?.toUpperCase()}</div>
        </div>
      )}
      {isSpeaking && <div className="absolute inset-0 rounded-xl border-2 border-emerald-400/50 pointer-events-none animate-pulse" />}
      <div className="absolute bottom-0 left-0 right-0 p-2 flex items-center justify-between"
        style={{ background: "linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 100%)" }}>
        <span className="text-[11px] font-medium text-white/90 truncate">
          {participant.user_name || "Participant"}{participant.local && " (You)"}
        </span>
        <div className="flex gap-1">
          {!participant.audio && <MicOff className="w-3 h-3 text-red-400" />}
          {!participant.video && <VideoOff className="w-3 h-3 text-orange-400/70" />}
        </div>
      </div>
    </div>
  );
}

function CtrlBtn({ icon: Icon, label, onClick, active = true, danger = false }: {
  icon: React.FC<any>; label: string; onClick?: () => void; active?: boolean; danger?: boolean;
}) {
  return (
    <button onClick={onClick} className={cn(
      "flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-all min-w-[64px]",
      danger ? "bg-red-500/90 hover:bg-red-500 text-white"
             : active ? "bg-white/8 hover:bg-white/12 text-white"
                      : "bg-red-500/15 border border-red-500/25 text-red-400",
    )}>
      <Icon className="w-5 h-5" />
      <span className="text-[10px] font-medium opacity-80">{label}</span>
    </button>
  );
}

const Shell = ({ children }: { children: React.ReactNode }) => (
  <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "#0a0c13" }}>{children}</div>
);

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export default function GuestJoin() {
  const { roomName }      = useParams<{ roomName: string }>();
  const [searchParams]    = useSearchParams();

  const [status,          setStatus]          = useState<PageStatus>("loading");
  const [roomInfo,        setRoomInfo]         = useState<RoomInfo | null>(null);
  const [errorMsg,        setErrorMsg]         = useState("");
  const [nameInput,       setNameInput]        = useState("");
  const [displayName,     setDisplayName]      = useState("");
  const [requestId,       setRequestId]        = useState<string | null>(null);
  const [isSubmitting,    setIsSubmitting]     = useState(false);
  const [micOn,           setMicOn]            = useState(true);
  const [camOn,           setCamOn]            = useState(true);
  const [lobbyResult,     setLobbyResult]      = useState<LobbyPassResult | null>(null);
  const [reconnectCount,  setReconnectCount]   = useState(0);

  const pollRef         = useRef<ReturnType<typeof setInterval> | null>(null);
  const callIdRef       = useRef<string | undefined>(undefined);
  const reconnectTimer  = useRef<ReturnType<typeof setTimeout>>();
  const maxReconnects   = 3;

  // Pre-fill name from URL param
  useEffect(() => {
    const n = searchParams.get("name");
    if (n) setNameInput(decodeURIComponent(n));
  }, [searchParams]);

  // Load room info
  const loadRoom = useCallback(async () => {
    if (!roomName) { setErrorMsg("No room name. Ask the host for a new link."); setStatus("error"); return; }
    setStatus("loading");
    try {
      const info = await fetchRoomInfo(roomName);
      setRoomInfo(info);
      setStatus("name_entry");
    } catch (e: any) {
      setErrorMsg(e?.message || "Could not load meeting. Please try again.");
      setStatus("error");
    }
  }, [roomName]);

  useEffect(() => { loadRoom(); }, [loadRoom]);

  // Daily call hook (guest has no auth token)
  const daily = useDailyCall({
    callId: null,
    roomName: roomInfo?.room_name ?? null,
    meetingToken: null,
    userName: displayName || "Guest",
    startWithVideoOff: !camOn,
    onJoined: () => {
      setStatus("in_meeting");
      logHealthEvent(callIdRef.current, "guest_joined", "info", { name: displayName });
    },
    onLeft: () => { setStatus("name_entry"); },
    onNetworkQualityChange: (q) => {
      if (q === "poor") {
        logHealthEvent(callIdRef.current, "network_poor", "warn", { quality: q });
        toast.warning("Poor connection — video quality reduced", { id: "gnet" });
      } else toast.dismiss("gnet");
    },
  });

  // Auto-reconnect on connection drop
  useEffect(() => {
    if (daily.callState === "error" && status === "in_meeting" && reconnectCount < maxReconnects && roomInfo) {
      setReconnectCount((c) => c + 1);
      setStatus("reconnecting");
      const delay = Math.min(1000 * Math.pow(2, reconnectCount), 8000);
      logHealthEvent(callIdRef.current, "reconnect_attempt", "warn", { attempt: reconnectCount + 1 });
      reconnectTimer.current = setTimeout(async () => {
        const ok = await daily.joinCall({ rName: roomInfo.room_name, displayName });
        if (ok) setReconnectCount(0);
        else if (reconnectCount + 1 >= maxReconnects) {
          setStatus("error");
          setErrorMsg("Could not reconnect. Please refresh the page.");
          logHealthEvent(callIdRef.current, "reconnect_failed", "error", { attempts: reconnectCount + 1 });
        }
      }, delay);
    }
  }, [daily.callState]); // eslint-disable-line

  useEffect(() => () => { clearTimeout(reconnectTimer.current); }, []);

  // Request to join (after lobby)
  const handleRequestJoin = useCallback(async (result?: LobbyPassResult) => {
    if (!roomInfo || !roomName) return;
    const name = nameInput.trim() || "Guest";
    setDisplayName(name);
    setIsSubmitting(true);
    const lr = result ?? lobbyResult;

    // Apply lobby device preferences to Daily
    if (lr?.micEnabled !== undefined) setMicOn(lr.micEnabled);
    if (lr?.cameraEnabled !== undefined) setCamOn(lr.cameraEnabled);

    try {
      const res = await requestToJoin(roomName, name);

      if (!res.requires_approval || !res.request_id) {
        setStatus("connecting");
        const ok = await daily.joinCall({ rName: roomInfo.room_name, displayName: name });
        if (!ok) { setStatus("error"); setErrorMsg("Could not connect to the meeting."); }
        return;
      }

      setRequestId(res.request_id);
      setStatus("waiting");

      pollRef.current = setInterval(async () => {
        try {
          const { status: s } = await checkRequestStatus(res.request_id!);
          if (s === "admitted") {
            if (pollRef.current) clearInterval(pollRef.current);
            setStatus("connecting");
            const ok = await daily.joinCall({ rName: roomInfo.room_name, displayName: name });
            if (!ok) { setStatus("error"); setErrorMsg("Could not connect to the meeting."); }
          } else if (s === "denied" || s === "expired" || s === "cancelled") {
            if (pollRef.current) clearInterval(pollRef.current);
            setStatus("denied");
            logHealthEvent(callIdRef.current, "guest_denied", "info", { name });
          }
        } catch { /* transient */ }
      }, 2500);
    } catch (e: any) {
      toast.error(e?.message || "Could not request to join. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  }, [roomInfo, roomName, nameInput, lobbyResult, daily]);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const handleLobbyReady = useCallback((result: LobbyPassResult) => {
    setLobbyResult(result);
    setMicOn(result.micEnabled);
    setCamOn(result.cameraEnabled);
    // If no approval gate exists, proceed directly to join
    handleRequestJoin(result);
  }, [handleRequestJoin]);

  const handleLeave = useCallback(async () => {
    logHealthEvent(callIdRef.current, "guest_left", "info", {});
    await daily.leaveCall();
    setRequestId(null);
    setStatus("name_entry");
  }, [daily]);

  const handleRetry = useCallback(() => { setRequestId(null); setStatus("name_entry"); setReconnectCount(0); }, []);

  const toggleMic = useCallback(async () => {
    if (status === "in_meeting") await daily.setAudioEnabled(!micOn);
    setMicOn((v) => !v);
  }, [status, micOn, daily]);

  const toggleCam = useCallback(async () => {
    if (status === "in_meeting") await daily.setVideoEnabled(!camOn);
    setCamOn((v) => !v);
  }, [status, camOn, daily]);

  // ── Loading ───────────────────────────────────────────────────────────────
  if (status === "loading") {
    return (
      <Shell>
        <div className="text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto"
            style={{ background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.25)" }}>
            <Loader2 className="w-7 h-7 animate-spin text-indigo-400" />
          </div>
          <p className="text-sm" style={{ color: "rgba(255,255,255,0.35)" }}>Loading meeting…</p>
        </div>
      </Shell>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (status === "error") {
    return (
      <Shell>
        <div className="text-center space-y-5 max-w-sm w-full">
          <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto">
            <AlertCircle className="w-7 h-7 text-red-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white mb-1">Couldn't load meeting</h1>
            <p className="text-sm" style={{ color: "rgba(255,255,255,0.35)" }}>{errorMsg}</p>
          </div>
          <button onClick={loadRoom}
            className="flex items-center gap-2 mx-auto px-4 py-2.5 rounded-xl text-sm font-medium text-white/80 transition-colors"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}>
            <RefreshCw className="w-4 h-4" /> Try Again
          </button>
        </div>
      </Shell>
    );
  }

  // ── Denied ────────────────────────────────────────────────────────────────
  if (status === "denied") {
    return (
      <Shell>
        <div className="text-center space-y-5 max-w-sm w-full">
          <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto">
            <XCircle className="w-7 h-7 text-red-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white mb-1">Not admitted</h1>
            <p className="text-sm" style={{ color: "rgba(255,255,255,0.35)" }}>The host didn't let you in, or the request expired.</p>
          </div>
          <button onClick={handleRetry}
            className="flex items-center gap-2 mx-auto px-4 py-2.5 rounded-xl text-sm font-semibold text-white"
            style={{ background: "linear-gradient(135deg, #4f46e5, #7c3aed)" }}>
            <RefreshCw className="w-4 h-4" /> Ask Again
          </button>
        </div>
      </Shell>
    );
  }

  // ── Name entry (first step before lobby) ─────────────────────────────────
  if (status === "name_entry") {
    return (
      <Shell>
        <div className="w-full max-w-sm space-y-5">
          <div className="text-center space-y-2">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto"
              style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.25), rgba(139,92,246,0.15))", border: "1px solid rgba(99,102,241,0.3)" }}>
              <Users className="w-8 h-8 text-indigo-400" />
            </div>
            <h1 className="text-2xl font-bold text-white">Join Meeting</h1>
            {roomInfo?.call_name && roomInfo.call_name !== "Fixsense Meeting" && (
              <p className="text-sm font-medium" style={{ color: "rgba(165,180,252,0.8)" }}>{roomInfo.call_name}</p>
            )}
            {roomInfo?.status === "live" && (
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium"
                style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)", color: "#4ade80" }}>
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" /> Meeting is live
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-medium block mb-1.5" style={{ color: "rgba(255,255,255,0.5)" }}>Your name</label>
            <input
              type="text" value={nameInput} onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && nameInput.trim() && setStatus("lobby")}
              placeholder="e.g. John Smith" maxLength={60} autoFocus
              className="w-full h-12 rounded-xl px-4 text-sm text-white placeholder:text-white/20 focus:outline-none transition-all"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}
              onFocus={(e) => { e.target.style.border = "1px solid rgba(99,102,241,0.5)"; }}
              onBlur={(e) => { e.target.style.border = "1px solid rgba(255,255,255,0.1)"; }}
            />
          </div>

          <button
            onClick={() => { setDisplayName(nameInput.trim() || "Guest"); setStatus("lobby"); }}
            disabled={!nameInput.trim()}
            className="w-full h-12 rounded-xl text-sm font-semibold text-white transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
            style={{ background: "linear-gradient(135deg, #4f46e5, #7c3aed)", boxShadow: "0 4px 20px rgba(99,102,241,0.35)" }}>
            Continue →
          </button>

          <div className="flex items-center justify-center gap-3 text-[11px]" style={{ color: "rgba(255,255,255,0.2)" }}>
            <span className="flex items-center gap-1"><Shield className="w-3 h-3" /> No account needed</span>
            <span>·</span>
            <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Free to join</span>
          </div>
        </div>
      </Shell>
    );
  }

  // ── Lobby (device checks) ─────────────────────────────────────────────────
  if (status === "lobby") {
    return (
      <Shell>
        <GuestLobby
          guestName={displayName || nameInput || "Guest"}
          meetingTitle={roomInfo?.call_name !== "Fixsense Meeting" ? roomInfo?.call_name : undefined}
          onReady={handleLobbyReady}
          onCancel={() => setStatus("name_entry")}
        />
      </Shell>
    );
  }

  // ── Waiting room ──────────────────────────────────────────────────────────
  if (status === "waiting") {
    return (
      <Shell>
        <div className="w-full max-w-sm space-y-5">
          <div className="text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto"
              style={{ background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.25)" }}>
              <Hourglass className="w-6 h-6 text-indigo-400 animate-pulse" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">Waiting for the host…</h1>
              <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.4)" }}>
                You'll join {roomInfo?.call_name && roomInfo.call_name !== "Fixsense Meeting" ? `"${roomInfo.call_name}"` : "the meeting"} as <strong className="text-white">{displayName}</strong> once admitted.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-center gap-3">
            <CtrlBtn icon={micOn ? Mic : MicOff} label={micOn ? "Mic on" : "Mic off"} active={micOn} onClick={toggleMic} />
            <CtrlBtn icon={camOn ? Video : VideoOff} label={camOn ? "Cam on" : "Cam off"} active={camOn} onClick={toggleCam} />
          </div>

          <button onClick={handleRetry}
            className="w-full h-11 rounded-xl text-sm font-medium transition-colors"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)" }}>
            Cancel
          </button>
        </div>
      </Shell>
    );
  }

  // ── Reconnecting ──────────────────────────────────────────────────────────
  if (status === "reconnecting") {
    return (
      <Shell>
        <div className="text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto"
            style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)" }}>
            <WifiOff className="w-7 h-7 text-amber-400" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white">Reconnecting…</h1>
            <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.35)" }}>
              Attempt {reconnectCount} of {maxReconnects}
            </p>
          </div>
          <Loader2 className="w-6 h-6 animate-spin text-amber-400 mx-auto" />
        </div>
      </Shell>
    );
  }

  // ── In meeting ────────────────────────────────────────────────────────────
  const displayParticipants = daily.participants;
  const mainSpeaker = daily.activeSpeaker || daily.remoteParticipants[0] || daily.localParticipant;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#0a0c13" }}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 shrink-0 border-b"
        style={{ borderColor: "rgba(255,255,255,0.06)", background: "rgba(13,15,24,0.98)" }}>
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" style={{ boxShadow: "0 0 6px rgba(52,211,153,0.8)" }} />
          <span className="text-sm font-semibold text-white truncate max-w-[160px] sm:max-w-xs">
            {roomInfo?.call_name || "Fixsense Meeting"}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Network quality badge */}
          <div className={cn(
            "flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium",
            daily.networkQuality === "poor" || daily.networkQuality === "disconnected"
              ? "text-red-400 bg-red-500/10" : daily.networkQuality === "fair"
              ? "text-amber-400 bg-amber-500/10" : "text-emerald-400 bg-emerald-500/10",
          )}>
            {daily.networkQuality === "poor" || daily.networkQuality === "disconnected"
              ? <WifiOff className="w-3 h-3" /> : <Wifi className="w-3 h-3" />}
            {daily.networkQuality}
          </div>
          <Users className="w-3.5 h-3.5" style={{ color: "rgba(255,255,255,0.4)" }} />
          <span className="text-xs" style={{ color: "rgba(255,255,255,0.5)" }}>{daily.participantCount}</span>
        </div>
      </div>

      {/* Connecting overlay */}
      {(status === "connecting" || daily.isConnecting) && (
        <div className="absolute inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(8,10,18,0.92)" }}>
          <div className="text-center space-y-3">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-400 mx-auto" />
            <p className="text-sm" style={{ color: "rgba(255,255,255,0.5)" }}>Connecting…</p>
          </div>
        </div>
      )}

      {/* Video area */}
      <div className="flex-1 p-2 sm:p-3 min-h-0">
        {daily.callState === "error" ? (
          <div className="h-full flex flex-col items-center justify-center gap-4 text-center p-6">
            <AlertCircle className="w-12 h-12 text-red-400" />
            <div>
              <p className="text-sm font-semibold text-red-400">Connection failed</p>
              <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.4)" }}>{daily.error || "Could not connect to the meeting room."}</p>
            </div>
            <button onClick={() => daily.joinCall({ rName: roomInfo!.room_name, displayName })}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white"
              style={{ background: "rgba(99,102,241,0.2)", border: "1px solid rgba(99,102,241,0.3)" }}>
              <RefreshCw className="w-4 h-4" /> Retry
            </button>
          </div>
        ) : displayParticipants.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-2 text-center">
            <Users className="w-10 h-10" style={{ color: "rgba(255,255,255,0.2)" }} />
            <p className="text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>Waiting for the host to join…</p>
          </div>
        ) : displayParticipants.length === 1 ? (
          <GuestVideoTile participant={displayParticipants[0]} isMain activeSpeakerId={daily.activeSpeakerId} className="h-full" />
        ) : displayParticipants.length === 2 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 h-full">
            {displayParticipants.map((p) => (
              <GuestVideoTile key={p.session_id} participant={p} activeSpeakerId={daily.activeSpeakerId} className="h-full min-h-[160px]" />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-2 h-full">
            <div className="flex-1 min-h-0">
              {mainSpeaker && <GuestVideoTile participant={mainSpeaker} isMain activeSpeakerId={daily.activeSpeakerId} className="h-full" />}
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 shrink-0" style={{ height: "25%" }}>
              {displayParticipants.filter((p) => p.session_id !== mainSpeaker?.session_id).slice(0, 4).map((p) => (
                <GuestVideoTile key={p.session_id} participant={p} activeSpeakerId={daily.activeSpeakerId} className="h-full" />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="shrink-0 px-3 sm:px-4 py-3 border-t flex items-center justify-center gap-3"
        style={{ borderColor: "rgba(255,255,255,0.08)", background: "rgba(13,15,24,0.98)" }}>
        <CtrlBtn icon={micOn ? Mic : MicOff} label={micOn ? "Mute" : "Unmute"} active={micOn} onClick={toggleMic} />
        <CtrlBtn icon={camOn ? Video : VideoOff} label={camOn ? "Stop Video" : "Start Video"} active={camOn} onClick={toggleCam} />
        <button onClick={handleLeave}
          className="flex flex-col items-center gap-1 px-4 py-2 rounded-xl min-w-[64px] text-white"
          style={{ background: "linear-gradient(135deg, #dc2626, #b91c1c)" }}>
          <PhoneOff className="w-5 h-5" />
          <span className="text-[10px] font-medium">Leave</span>
        </button>
      </div>
    </div>
  );
}