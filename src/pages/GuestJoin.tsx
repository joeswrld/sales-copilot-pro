/**
 * GuestJoin.tsx — v3
 *
 * Route: /join/:roomName
 * Public — NO Fixsense auth required.
 *
 * v3 changes:
 *  - Replaced the Daily.co prebuilt iframe with a custom call-object UI
 *    (matches the LiveMeeting workspace look) so guests get their own
 *    mic/camera controls instead of Daily's default chrome.
 *  - Added a host-approval "waiting room": guest requests to join via
 *    guest-join-request, polls guest-request-status until admitted/denied.
 *  - Camera/mic preview while waiting, carried into the call on admit.
 *  - Fully responsive (stacked on mobile, wider layout on desktop).
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import {
  Loader2, Shield, Users, Video, VideoOff, Mic, MicOff,
  AlertCircle, RefreshCw, CheckCircle2, PhoneOff, Hourglass, XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useDailyCall, DailyParticipant } from "@/hooks/useDailyCall";
import { toast } from "sonner";

// ─── Env ────────────────────────────────────────────────────────────────────
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

// ─── Types ──────────────────────────────────────────────────────────────────
interface RoomInfo {
  found: boolean;
  room_url: string;
  room_name: string;
  call_name: string;
  status: string;
  id?: string; // call_id, when found
}

type PageStatus =
  | "loading"
  | "name_entry"
  | "waiting"
  | "denied"
  | "connecting"
  | "in_meeting"
  | "error";

// ─── Room info lookup ───────────────────────────────────────────────────────
async function fetchRoomInfo(roomName: string): Promise<RoomInfo> {
  const fnUrl = `${SUPABASE_URL}/functions/v1/get-guest-room-info?room=${encodeURIComponent(roomName)}`;
  const res = await fetch(fnUrl, {
    headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
  });
  if (!res.ok) {
    return {
      found: false,
      room_url: `https://fixsense.daily.co/${roomName}`,
      room_name: roomName,
      call_name: "Fixsense Meeting",
      status: "unknown",
    };
  }
  return res.json();
}

// ─── Guest join request / status ───────────────────────────────────────────
async function requestToJoin(roomName: string, guestName: string) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/guest-join-request`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ room_name: roomName, guest_name: guestName }),
  });
  if (!res.ok) throw new Error("Could not reach the host. Please try again.");
  return res.json() as Promise<{
    requires_approval: boolean;
    request_id: string | null;
    call_id?: string;
    status: string;
  }>;
}

async function checkRequestStatus(requestId: string) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/guest-request-status?id=${requestId}`, {
    headers: { apikey: SUPABASE_ANON_KEY },
  });
  if (!res.ok) throw new Error("status check failed");
  return res.json() as Promise<{ status: string }>;
}

// ─── Local video tile (self + remote, video-only — Daily autoplays remote audio) ──
function VideoTile({
  participant, isMain = false, activeSpeakerId, className,
}: {
  participant: DailyParticipant;
  isMain?: boolean;
  activeSpeakerId: string | null;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const isSpeaking = participant.session_id === activeSpeakerId;

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (participant.videoTrack && participant.video) {
      el.srcObject = new MediaStream([participant.videoTrack]);
      el.play().catch(() => {});
    } else {
      el.srcObject = null;
    }
  }, [participant.videoTrack, participant.video]);

  return (
    <div
      className={cn(
        "relative overflow-hidden border transition-all duration-300 rounded-xl",
        isSpeaking ? "border-emerald-400/60 shadow-[0_0_20px_rgba(52,211,153,0.15)]" : "border-white/8",
        className,
      )}
      style={{ background: "linear-gradient(135deg, #1a1d26 0%, #0f1117 100%)" }}
    >
      {participant.video && participant.videoTrack ? (
        <video ref={videoRef} autoPlay muted={participant.local} playsInline className="w-full h-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className={cn(
            "rounded-full flex items-center justify-center font-bold text-white",
            isMain ? "w-16 h-16 text-xl" : "w-10 h-10 text-sm",
            isSpeaking
              ? "bg-gradient-to-br from-emerald-500/40 to-teal-600/40 border-2 border-emerald-400/50"
              : "bg-gradient-to-br from-violet-500/40 to-indigo-600/40 border border-white/10",
          )}>
            {(participant.user_name || "?")[0]?.toUpperCase()}
          </div>
        </div>
      )}

      {isSpeaking && <div className="absolute inset-0 rounded-xl border-2 border-emerald-400/50 pointer-events-none animate-pulse" />}

      <div
        className="absolute bottom-0 left-0 right-0 p-2 flex items-center justify-between"
        style={{ background: "linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 100%)" }}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[11px] font-medium text-white/90 truncate">
            {participant.user_name || "Participant"}
            {participant.local && " (You)"}
          </span>
          {!participant.local && (
            <span className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-md text-indigo-300"
              style={{ background: "rgba(99,102,241,0.18)", border: "1px solid rgba(99,102,241,0.25)" }}>
              Host
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {!participant.audio && <MicOff className="w-3 h-3 text-red-400" />}
          {!participant.video && <VideoOff className="w-3 h-3 text-orange-400/70" />}
        </div>
      </div>
    </div>
  );
}

// ─── Self preview (waiting room) ───────────────────────────────────────────
function SelfPreview({ camOn, micOn, name }: { camOn: boolean; micOn: boolean; name: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      // Tear down any existing stream first
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;

      if (!camOn && !micOn) return;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: camOn, audio: micOn });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current && camOn) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      } catch {
        // Permission denied or no device — silently fall back to avatar
      }
    }

    start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [camOn, micOn]);

  return (
    <div
      className="relative w-full aspect-video rounded-2xl overflow-hidden border"
      style={{ background: "linear-gradient(135deg, #1a1d26 0%, #0f1117 100%)", borderColor: "rgba(255,255,255,0.08)" }}
    >
      {camOn ? (
        <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-16 h-16 rounded-full flex items-center justify-center font-bold text-white text-xl"
            style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.35), rgba(139,92,246,0.25))", border: "1px solid rgba(99,102,241,0.3)" }}>
            {(name || "?")[0]?.toUpperCase()}
          </div>
        </div>
      )}
      <div className="absolute bottom-2 left-2 flex items-center gap-1.5">
        {!micOn && (
          <span className="flex items-center gap-1 text-[10px] font-medium text-red-300 px-2 py-0.5 rounded-md"
            style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.25)" }}>
            <MicOff className="w-3 h-3" /> Mic off
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Control button ─────────────────────────────────────────────────────────
function ControlBtn({ icon: Icon, label, onClick, active = true, danger = false }: {
  icon: React.FC<any>; label: string; onClick?: () => void; active?: boolean; danger?: boolean;
}) {
  return (
    <button onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-all min-w-[64px]",
        danger
          ? "bg-red-500/90 hover:bg-red-500 text-white"
          : active
            ? "bg-white/8 hover:bg-white/12 text-white"
            : "bg-red-500/15 border border-red-500/25 text-red-400 hover:bg-red-500/20",
      )}>
      <Icon className="w-5 h-5" />
      <span className="text-[10px] font-medium opacity-80">{label}</span>
    </button>
  );
}

// ─── MAIN COMPONENT ─────────────────────────────────────────────────────────
export default function GuestJoin() {
  const { roomName } = useParams<{ roomName: string }>();
  const [searchParams] = useSearchParams();

  const [status, setStatus] = useState<PageStatus>("loading");
  const [roomInfo, setRoomInfo] = useState<RoomInfo | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [camOn, setCamOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Pre-fill name from URL param
  useEffect(() => {
    const n = searchParams.get("name");
    if (n) setNameInput(decodeURIComponent(n));
  }, [searchParams]);

  // Load room info
  const loadRoom = useCallback(async () => {
    if (!roomName) {
      setErrorMsg("No room name in URL. Please ask the host for a new link.");
      setStatus("error");
      return;
    }
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

  // ── Daily call hook (guest connects with no auth token — public room) ────
  const daily = useDailyCall({
    callId: null,
    roomName: roomInfo?.room_name ?? null,
    meetingToken: null,
    userName: displayName || "Guest",
    startWithVideoOff: !camOn,
    onJoined: () => {
      setStatus("in_meeting");
      // Apply mic preference now that the call object exists
      if (!micOn) daily.setAudioEnabled(false).catch(() => {});
    },
    onLeft: () => setStatus("name_entry"),
  });

  // ── Submit join request ───────────────────────────────────────────────
  const handleRequestJoin = useCallback(async () => {
    if (!roomInfo || !roomName) return;
    const name = nameInput.trim() || "Guest";
    setDisplayName(name);
    setIsSubmitting(true);

    try {
      const result = await requestToJoin(roomName, name);

      if (!result.requires_approval || !result.request_id) {
        // No host gating possible — connect straight away
        setStatus("connecting");
        const ok = await daily.joinCall({ rName: roomInfo.room_name, displayName: name });
        if (!ok) { setStatus("error"); setErrorMsg("Could not connect to the meeting."); }
        return;
      }

      setRequestId(result.request_id);
      setStatus("waiting");

      // Poll for host decision
      pollRef.current = setInterval(async () => {
        try {
          const { status: s } = await checkRequestStatus(result.request_id!);
          if (s === "admitted") {
            if (pollRef.current) clearInterval(pollRef.current);
            setStatus("connecting");
            const ok = await daily.joinCall({ rName: roomInfo.room_name, displayName: name });
            if (!ok) { setStatus("error"); setErrorMsg("Could not connect to the meeting."); }
          } else if (s === "denied" || s === "expired" || s === "cancelled") {
            if (pollRef.current) clearInterval(pollRef.current);
            setStatus("denied");
          }
        } catch {
          // transient — keep polling
        }
      }, 2500);
    } catch (e: any) {
      toast.error(e?.message || "Could not request to join. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  }, [roomInfo, roomName, nameInput, camOn, micOn, daily]);

  // Cleanup poller on unmount
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleRequestJoin();
  };

  const handleLeave = useCallback(async () => {
    await daily.leaveCall();
    setRequestId(null);
    setStatus("name_entry");
  }, [daily]);

  const handleRetry = useCallback(() => {
    setRequestId(null);
    setStatus("name_entry");
  }, []);

  // ── Toggle handlers (work in waiting room AND in-call) ──────────────────
  const toggleMic = useCallback(async () => {
    if (status === "in_meeting") await daily.setAudioEnabled(!micOn);
    setMicOn((v) => !v);
  }, [status, micOn, daily]);

  const toggleCam = useCallback(async () => {
    if (status === "in_meeting") await daily.setVideoEnabled(!camOn);
    setCamOn((v) => !v);
  }, [status, camOn, daily]);

  // ── Shared shell ─────────────────────────────────────────────────────────
  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "#0a0c13" }}>
      {children}
    </div>
  );

  // ── Loading ──────────────────────────────────────────────────────────────
  if (status === "loading") {
    return (
      <Shell>
        <div className="text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto"
            style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.2), rgba(139,92,246,0.1))", border: "1px solid rgba(99,102,241,0.25)" }}>
            <Loader2 className="w-7 h-7 animate-spin text-indigo-400" />
          </div>
          <p className="text-sm text-white/40">Loading meeting…</p>
        </div>
      </Shell>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────
  if (status === "error") {
    return (
      <Shell>
        <div className="text-center space-y-5 max-w-sm">
          <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto">
            <AlertCircle className="w-7 h-7 text-red-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white mb-1">Couldn't load meeting</h1>
            <p className="text-sm text-white/40">{errorMsg}</p>
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

  // ── Denied ───────────────────────────────────────────────────────────────
  if (status === "denied") {
    return (
      <Shell>
        <div className="text-center space-y-5 max-w-sm">
          <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto">
            <XCircle className="w-7 h-7 text-red-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white mb-1">Not admitted</h1>
            <p className="text-sm text-white/40">The host didn't let you into this meeting, or the request expired.</p>
          </div>
          <button onClick={handleRetry}
            className="flex items-center gap-2 mx-auto px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all"
            style={{ background: "linear-gradient(135deg, #4f46e5, #7c3aed)" }}>
            <RefreshCw className="w-4 h-4" /> Ask Again
          </button>
        </div>
      </Shell>
    );
  }

  // ── In meeting ───────────────────────────────────────────────────────────
  if (status === "in_meeting" || status === "connecting") {
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
            <Users className="w-3.5 h-3.5 text-white/40" />
            <span className="text-xs text-white/50">{daily.participantCount}</span>
            <span className="hidden sm:flex items-center gap-1 text-[10px] text-white/20 ml-2">
              <Shield className="w-3 h-3" /> Encrypted
            </span>
          </div>
        </div>

        {/* Video area */}
        <div className="flex-1 p-2 sm:p-3 min-h-0">
          {status === "connecting" || daily.isConnecting ? (
            <div className="h-full flex flex-col items-center justify-center gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
              <p className="text-sm text-white/50">Connecting…</p>
            </div>
          ) : daily.callState === "error" ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-center p-4">
              <WifiOffIcon />
              <p className="text-sm font-semibold text-red-400">Connection failed</p>
              <p className="text-xs text-white/30">{daily.error || "Could not connect to the meeting room."}</p>
              <button onClick={() => daily.joinCall({ rName: roomInfo!.room_name, displayName })}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white"
                style={{ background: "rgba(99,102,241,0.2)", border: "1px solid rgba(99,102,241,0.3)" }}>
                <RefreshCw className="w-4 h-4" /> Retry
              </button>
            </div>
          ) : displayParticipants.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-2 text-center">
              <Users className="w-10 h-10 text-white/20" />
              <p className="text-sm text-white/40">Waiting for the host to join…</p>
            </div>
          ) : displayParticipants.length === 1 ? (
            <VideoTile participant={displayParticipants[0]} isMain activeSpeakerId={daily.activeSpeakerId} className="h-full" />
          ) : displayParticipants.length === 2 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 h-full">
              {displayParticipants.map((p) => (
                <VideoTile key={p.session_id} participant={p} activeSpeakerId={daily.activeSpeakerId} className="h-full min-h-[160px]" />
              ))}
            </div>
          ) : (
            <div className="grid gap-2 h-full" style={{ gridTemplateRows: "2fr 1fr" }}>
              <div className="min-h-0">
                {mainSpeaker && <VideoTile participant={mainSpeaker} isMain activeSpeakerId={daily.activeSpeakerId} className="h-full" />}
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 min-h-0">
                {displayParticipants.filter((p) => p.session_id !== mainSpeaker?.session_id).slice(0, 4).map((p) => (
                  <VideoTile key={p.session_id} participant={p} activeSpeakerId={daily.activeSpeakerId} className="h-full" />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="shrink-0 px-3 sm:px-4 py-3 border-t flex items-center justify-center gap-3"
          style={{ borderColor: "rgba(255,255,255,0.08)", background: "rgba(13,15,24,0.98)" }}>
          <ControlBtn icon={micOn ? Mic : MicOff} label={micOn ? "Mute" : "Unmute"} active={micOn} onClick={toggleMic} />
          <ControlBtn icon={camOn ? Video : VideoOff} label={camOn ? "Stop Video" : "Start Video"} active={camOn} onClick={toggleCam} />
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

  // ── Waiting room ─────────────────────────────────────────────────────────
  if (status === "waiting") {
    return (
      <Shell>
        <div className="w-full max-w-sm space-y-5">
          <SelfPreview camOn={camOn} micOn={micOn} name={displayName} />

          <div className="text-center space-y-2">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto"
              style={{ background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.25)" }}>
              <Hourglass className="w-6 h-6 text-indigo-400 animate-pulse" />
            </div>
            <h1 className="text-lg font-bold text-white">Asking the host to let you in…</h1>
            <p className="text-sm text-white/40">
              {roomInfo?.call_name && roomInfo.call_name !== "Fixsense Meeting"
                ? `You'll join "${roomInfo.call_name}" as ${displayName} once admitted.`
                : `You'll be connected as ${displayName} once admitted.`}
            </p>
          </div>

          <div className="flex items-center justify-center gap-3">
            <ControlBtn icon={micOn ? Mic : MicOff} label={micOn ? "Mic on" : "Mic off"} active={micOn} onClick={toggleMic} />
            <ControlBtn icon={camOn ? Video : VideoOff} label={camOn ? "Cam on" : "Cam off"} active={camOn} onClick={toggleCam} />
          </div>

          <button onClick={handleRetry}
            className="w-full h-11 rounded-xl text-sm font-medium text-white/60 transition-colors"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
            Cancel
          </button>
        </div>
      </Shell>
    );
  }

  // ── Name entry (pre-join lobby) ─────────────────────────────────────────
  return (
    <Shell>
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-3">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto"
            style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.25), rgba(139,92,246,0.15))", border: "1px solid rgba(99,102,241,0.3)" }}>
            <Users className="w-8 h-8 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white mb-1">Join Meeting</h1>
            {roomInfo?.call_name && roomInfo.call_name !== "Fixsense Meeting" && (
              <p className="text-sm font-medium text-indigo-300/80">{roomInfo.call_name}</p>
            )}
            <p className="text-sm text-white/35 mt-1">Enter your name, check your camera, and request to join</p>
          </div>

          {roomInfo?.status === "live" && (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium"
              style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)", color: "#4ade80" }}>
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              Meeting is live
            </div>
          )}
        </div>

        <SelfPreview camOn={camOn} micOn={micOn} name={nameInput || "Guest"} />

        <div className="flex items-center justify-center gap-3">
          <ControlBtn icon={micOn ? Mic : MicOff} label={micOn ? "Mic on" : "Mic off"} active={micOn} onClick={() => setMicOn((v) => !v)} />
          <ControlBtn icon={camOn ? Video : VideoOff} label={camOn ? "Cam on" : "Cam off"} active={camOn} onClick={() => setCamOn((v) => !v)} />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-white/50 block">Your display name</label>
          <input
            type="text"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="e.g. John Smith"
            maxLength={60}
            autoFocus
            className="w-full h-12 rounded-xl px-4 text-sm text-white placeholder:text-white/20 focus:outline-none transition-all"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}
            onFocus={(e) => { e.target.style.border = "1px solid rgba(99,102,241,0.5)"; e.target.style.background = "rgba(99,102,241,0.05)"; }}
            onBlur={(e) => { e.target.style.border = "1px solid rgba(255,255,255,0.1)"; e.target.style.background = "rgba(255,255,255,0.04)"; }}
          />
        </div>

        <button
          onClick={handleRequestJoin}
          disabled={isSubmitting}
          className="w-full h-12 rounded-xl text-sm font-semibold text-white transition-all active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-2"
          style={{ background: "linear-gradient(135deg, #4f46e5, #7c3aed)", boxShadow: "0 4px 20px rgba(99,102,241,0.35)" }}
        >
          {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {isSubmitting ? "Requesting…" : "Ask to Join"}
        </button>

        <div className="flex items-center justify-center gap-4 pt-1">
          <span className="text-[11px] text-white/20 flex items-center gap-1">
            <Shield className="w-3 h-3" /> No account needed
          </span>
          <span className="text-white/10">·</span>
          <span className="text-[11px] text-white/20 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> Free to join
          </span>
        </div>
      </div>
    </Shell>
  );
}

// Small inline icon helper (avoids extra import churn for a one-off)
function WifiOffIcon() {
  return (
    <div className="w-14 h-14 rounded-full flex items-center justify-center"
      style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.2)" }}>
      <AlertCircle className="w-7 h-7 text-red-400" />
    </div>
  );
}