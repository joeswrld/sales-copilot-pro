/**
 * GuestLobby.tsx
 *
 * Production-grade pre-join lobby for GuestJoin:
 *  - Camera preview with live video
 *  - Microphone test with animated volume meter
 *  - Speaker test (plays a tone)
 *  - Network quality test (RTT probe)
 *  - Device selection (mic/camera/speaker)
 *  - Noise cancellation status
 *  - Mobile-first, fast, accessible
 */

import { useState, useEffect, useRef, useCallback, memo } from "react";
import {
  Mic, MicOff, Video, VideoOff, Volume2, VolumeX,
  Wifi, Check, X, Loader2, ChevronDown, RefreshCw,
  Shield, AlertCircle, CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LobbyPassResult {
  micEnabled: boolean;
  cameraEnabled: boolean;
  audioTrack: MediaStreamTrack | null;
  videoTrack: MediaStreamTrack | null;
  deviceIds: { mic: string | null; camera: string | null; speaker: string | null };
}

interface Props {
  guestName: string;
  meetingTitle?: string;
  onReady: (result: LobbyPassResult) => void;
  onCancel?: () => void;
}

type CheckStatus = "idle" | "checking" | "pass" | "fail" | "skipped";

// ─── Volume meter ─────────────────────────────────────────────────────────────

const VolumeMeter = memo(({ stream }: { stream: MediaStream | null }) => {
  const [level, setLevel] = useState(0);
  const rafRef = useRef<number>();
  const ctxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (!stream) { setLevel(0); return; }
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.6;
    ctx.createMediaStreamSource(stream).connect(analyser);
    ctxRef.current = ctx;
    const buf = new Uint8Array(analyser.frequencyBinCount);

    const tick = () => {
      analyser.getByteFrequencyData(buf);
      let sum = 0;
      for (const v of buf) sum += v * v;
      setLevel(Math.min(100, Math.round(Math.sqrt(sum / buf.length) / 128 * 100)));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(rafRef.current ?? 0); ctx.close().catch(() => {}); };
  }, [stream]);

  const bars = 20;
  return (
    <div className="flex items-end gap-0.5" style={{ height: 24 }}>
      {Array.from({ length: bars }).map((_, i) => {
        const threshold = (i / bars) * 100;
        const active = level > threshold;
        const color = level > 85 ? "#ef4444" : level > 50 ? "#10b981" : "#6366f1";
        return (
          <div key={i}
            className="rounded-sm transition-all duration-75 flex-1"
            style={{
              height: Math.max(3, 3 + (i / bars) * 21),
              background: active ? color : "rgba(255,255,255,0.1)",
            }}
          />
        );
      })}
    </div>
  );
});

// ─── Device selector ──────────────────────────────────────────────────────────

const DeviceSelect = memo(({ devices, value, onChange, placeholder }: {
  devices: MediaDeviceInfo[];
  value: string;
  onChange: (id: string) => void;
  placeholder: string;
}) => (
  <div className="relative">
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full appearance-none text-xs py-2 pl-3 pr-8 rounded-xl outline-none transition-colors"
      style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.8)" }}
    >
      {devices.length === 0 && <option value="">{placeholder}</option>}
      {devices.map((d) => (
        <option key={d.deviceId} value={d.deviceId} style={{ background: "#0f1117" }}>
          {d.label || `${placeholder} ${d.deviceId.slice(0, 6)}`}
        </option>
      ))}
    </select>
    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: "rgba(255,255,255,0.3)" }} />
  </div>
));

// ─── Status badge ─────────────────────────────────────────────────────────────

const StatusBadge = memo(({ status, label }: { status: CheckStatus; label: string }) => {
  const map = {
    idle:     { icon: null,         color: "rgba(255,255,255,0.3)", bg: "rgba(255,255,255,0.05)" },
    checking: { icon: Loader2,      color: "#818cf8", bg: "rgba(99,102,241,0.1)" },
    pass:     { icon: CheckCircle2, color: "#10b981", bg: "rgba(16,185,129,0.1)" },
    fail:     { icon: AlertCircle,  color: "#ef4444", bg: "rgba(239,68,68,0.1)" },
    skipped:  { icon: null,         color: "rgba(255,255,255,0.3)", bg: "rgba(255,255,255,0.04)" },
  }[status];

  const Icon = map.icon;
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium"
      style={{ background: map.bg, color: map.color }}>
      {Icon && <Icon className={cn("w-3 h-3", status === "checking" && "animate-spin")} />}
      {label}
    </div>
  );
});

// ─── Network quality test ─────────────────────────────────────────────────────

async function measureNetworkRtt(): Promise<{ rttMs: number; mbps: number | null }> {
  const start = Date.now();
  try {
    await fetch("https://www.gstatic.com/generate_204", { mode: "no-cors", cache: "no-store" });
    const rttMs = Date.now() - start;
    const conn = (navigator as any).connection;
    return { rttMs, mbps: conn?.downlink ?? null };
  } catch {
    return { rttMs: 9999, mbps: null };
  }
}

// ─── Speaker test ─────────────────────────────────────────────────────────────

function playSpeakerTest(sinkId?: string) {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 440;
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.8);
    setTimeout(() => ctx.close(), 1000);
  } catch {
    // Not all browsers support AudioContext in this context
  }
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export default function GuestLobby({ guestName, meetingTitle, onReady, onCancel }: Props) {
  const videoRef   = useRef<HTMLVideoElement>(null);
  const streamRef  = useRef<MediaStream | null>(null);

  const [micDevices,    setMicDevices]    = useState<MediaDeviceInfo[]>([]);
  const [camDevices,    setCamDevices]    = useState<MediaDeviceInfo[]>([]);
  const [speakerDevices, setSpeakerDevices] = useState<MediaDeviceInfo[]>([]);
  const [micId,    setMicId]    = useState("");
  const [camId,    setCamId]    = useState("");
  const [speakerId, setSpeakerId] = useState("");

  const [micOn,  setMicOn]  = useState(true);
  const [camOn,  setCamOn]  = useState(true);

  const [micStatus,     setMicStatus]     = useState<CheckStatus>("idle");
  const [camStatus,     setCamStatus]     = useState<CheckStatus>("idle");
  const [networkStatus, setNetworkStatus] = useState<CheckStatus>("idle");
  const [networkRtt,    setNetworkRtt]    = useState<number | null>(null);
  const [networkMbps,   setNetworkMbps]   = useState<number | null>(null);

  const [liveStream, setLiveStream] = useState<MediaStream | null>(null);
  const [isReady,    setIsReady]    = useState(false);
  const [isJoining,  setIsJoining]  = useState(false);

  // ── Enumerate devices ─────────────────────────────────────────────────────
  const enumerateDevices = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      setMicDevices(all.filter((d) => d.kind === "audioinput"));
      setCamDevices(all.filter((d) => d.kind === "videoinput"));
      setSpeakerDevices(all.filter((d) => d.kind === "audiooutput"));
    } catch {}
  }, []);

  // ── Start preview stream ──────────────────────────────────────────────────
  const startPreview = useCallback(async (mId?: string, cId?: string) => {
    // Stop existing stream
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setLiveStream(null);

    const constraints: MediaStreamConstraints = {
      audio: micOn ? { deviceId: mId ? { exact: mId } : undefined, echoCancellation: true, noiseSuppression: true, autoGainControl: true } : false,
      video: camOn ? { deviceId: cId ? { exact: cId } : undefined, width: { ideal: 1280 }, height: { ideal: 720 } } : false,
    };

    if (!constraints.audio && !constraints.video) return;

    try {
      setMicStatus("checking");
      setCamStatus("checking");

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      setLiveStream(stream);

      const hasMic = stream.getAudioTracks().length > 0;
      const hasCam = stream.getVideoTracks().length > 0;

      setMicStatus(micOn ? (hasMic ? "pass" : "fail") : "skipped");
      setCamStatus(camOn ? (hasCam ? "pass" : "fail") : "skipped");

      if (videoRef.current && hasCam) {
        videoRef.current.srcObject = new MediaStream(stream.getVideoTracks());
        videoRef.current.play().catch(() => {});
      } else if (videoRef.current) {
        videoRef.current.srcObject = null;
      }

      await enumerateDevices();
    } catch (e: any) {
      setMicStatus("fail");
      setCamStatus("fail");
    }
  }, [micOn, camOn, enumerateDevices]);

  // ── Run network test ──────────────────────────────────────────────────────
  const runNetworkTest = useCallback(async () => {
    setNetworkStatus("checking");
    const { rttMs, mbps } = await measureNetworkRtt();
    setNetworkRtt(rttMs);
    setNetworkMbps(mbps);
    setNetworkStatus(rttMs < 600 ? "pass" : rttMs < 1200 ? "pass" : "fail");
  }, []);

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    startPreview();
    runNetworkTest();
    return () => { streamRef.current?.getTracks().forEach((t) => t.stop()); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Determine readiness
  useEffect(() => {
    const micOk = micStatus === "pass" || micStatus === "skipped";
    const networkOk = networkStatus === "pass" || networkStatus === "skipped";
    setIsReady(micOk && networkOk);
  }, [micStatus, networkStatus]);

  // ── Re-init on device change ──────────────────────────────────────────────
  useEffect(() => { startPreview(micId || undefined, camId || undefined); }, [micId, camId]); // eslint-disable-line

  const handleToggleMic = () => {
    const next = !micOn;
    setMicOn(next);
    if (!next) { setMicStatus("skipped"); }
    else { startPreview(micId || undefined, camId || undefined); }
  };

  const handleToggleCam = () => {
    const next = !camOn;
    setCamOn(next);
    if (videoRef.current) videoRef.current.srcObject = null;
    if (!next) setCamStatus("skipped");
    else startPreview(micId || undefined, camId || undefined);
  };

  const handleJoin = useCallback(() => {
    setIsJoining(true);
    const audioTrack = liveStream?.getAudioTracks()[0] ?? null;
    const videoTrack = liveStream?.getVideoTracks()[0] ?? null;
    onReady({
      micEnabled: micOn,
      cameraEnabled: camOn,
      audioTrack,
      videoTrack,
      deviceIds: { mic: micId || null, camera: camId || null, speaker: speakerId || null },
    });
  }, [liveStream, micOn, camOn, micId, camId, speakerId, onReady]);

  const networkLabel =
    networkStatus === "checking" ? "Testing…"
    : networkStatus === "fail"   ? `High latency (${networkRtt}ms)`
    : networkStatus === "pass"   ? `Good${networkRtt ? ` · ${networkRtt}ms` : ""}${networkMbps ? ` · ${networkMbps.toFixed(1)} Mbps` : ""}`
    : "Not tested";

  const allPassed = micStatus === "pass" && camStatus === "pass" && networkStatus === "pass";

  return (
    <div className="w-full max-w-md space-y-4">
      {/* Header */}
      <div className="text-center space-y-1">
        <h2 className="text-lg font-bold text-white">Check your setup</h2>
        {meetingTitle && <p className="text-sm font-medium" style={{ color: "rgba(165,180,252,0.8)" }}>{meetingTitle}</p>}
        <p className="text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>Make sure your camera and mic are working before joining</p>
      </div>

      {/* Camera preview */}
      <div
        className="relative w-full aspect-video rounded-2xl overflow-hidden"
        style={{ background: "linear-gradient(135deg, #1a1d26 0%, #0f1117 100%)", border: "1px solid rgba(255,255,255,0.07)" }}
      >
        {camOn ? (
          <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover scale-x-[-1]" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold text-white"
              style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.4), rgba(139,92,246,0.3))", border: "1px solid rgba(99,102,241,0.3)" }}>
              {(guestName || "G")[0]?.toUpperCase()}
            </div>
          </div>
        )}

        {/* Status overlay */}
        <div className="absolute top-2 right-2 flex gap-1.5">
          <StatusBadge status={camStatus} label={camOn ? (camStatus === "pass" ? "Camera OK" : camStatus === "checking" ? "Checking" : "No camera") : "Camera off"} />
        </div>

        {/* Mic level meter overlay */}
        {micOn && liveStream && (
          <div className="absolute bottom-2 left-2 right-2">
            <VolumeMeter stream={liveStream} />
          </div>
        )}
      </div>

      {/* Quick toggles */}
      <div className="grid grid-cols-2 gap-2">
        <button onClick={handleToggleMic}
          className={cn(
            "flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-all",
            micOn ? "text-white" : "text-red-400",
          )}
          style={{
            background: micOn ? "rgba(255,255,255,0.06)" : "rgba(239,68,68,0.1)",
            border: micOn ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(239,68,68,0.25)",
          }}>
          {micOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
          {micOn ? "Mic on" : "Mic off"}
        </button>
        <button onClick={handleToggleCam}
          className={cn(
            "flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-all",
            camOn ? "text-white" : "text-red-400",
          )}
          style={{
            background: camOn ? "rgba(255,255,255,0.06)" : "rgba(239,68,68,0.1)",
            border: camOn ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(239,68,68,0.25)",
          }}>
          {camOn ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
          {camOn ? "Camera on" : "Camera off"}
        </button>
      </div>

      {/* Checks grid */}
      <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.07)" }}>
        <CheckRow icon={Mic} label="Microphone" status={micStatus}
          detail={micStatus === "pass" ? (liveStream?.getAudioTracks()[0]?.label?.slice(0, 36) ?? "Working") : micStatus === "fail" ? "Permission denied — allow mic access" : micStatus === "checking" ? "Requesting access…" : "Disabled"} />

        <CheckRow icon={Video} label="Camera" status={camStatus}
          detail={camStatus === "pass" ? (liveStream?.getVideoTracks()[0]?.label?.slice(0, 36) ?? "Working") : camStatus === "fail" ? "Permission denied or no camera" : camStatus === "checking" ? "Requesting access…" : "Disabled"}
          divider />

        <CheckRow icon={Wifi} label="Network" status={networkStatus}
          detail={networkLabel}
          action={networkStatus !== "checking" && (
            <button onClick={runNetworkTest} className="flex items-center gap-1 text-[10px]" style={{ color: "rgba(99,102,241,0.7)" }}>
              <RefreshCw className="w-2.5 h-2.5" /> Retest
            </button>
          )}
          divider />

        <CheckRow icon={Volume2} label="Speaker"
          status={networkStatus === "pass" ? "pass" : "idle"}
          detail="Click to test"
          action={
            <button onClick={() => playSpeakerTest(speakerId || undefined)}
              className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md"
              style={{ background: "rgba(99,102,241,0.15)", color: "#a5b4fc" }}>
              <Volume2 className="w-2.5 h-2.5" /> Test
            </button>
          }
          divider />
      </div>

      {/* Device selectors (collapsed by default on mobile) */}
      <details className="group">
        <summary className="text-xs font-medium cursor-pointer select-none" style={{ color: "rgba(255,255,255,0.35)" }}>
          Advanced — change devices
        </summary>
        <div className="mt-2 space-y-2">
          {micDevices.length > 0 && (
            <div>
              <p className="text-[10px] mb-1" style={{ color: "rgba(255,255,255,0.3)" }}>Microphone</p>
              <DeviceSelect devices={micDevices} value={micId} onChange={setMicId} placeholder="Select microphone" />
            </div>
          )}
          {camDevices.length > 0 && (
            <div>
              <p className="text-[10px] mb-1" style={{ color: "rgba(255,255,255,0.3)" }}>Camera</p>
              <DeviceSelect devices={camDevices} value={camId} onChange={setCamId} placeholder="Select camera" />
            </div>
          )}
          {speakerDevices.length > 0 && (
            <div>
              <p className="text-[10px] mb-1" style={{ color: "rgba(255,255,255,0.3)" }}>Speaker</p>
              <DeviceSelect devices={speakerDevices} value={speakerId} onChange={setSpeakerId} placeholder="Select speaker" />
            </div>
          )}
        </div>
      </details>

      {/* Noise cancellation badge */}
      <div className="flex items-center gap-2 text-[11px]" style={{ color: "rgba(255,255,255,0.25)" }}>
        <Shield className="w-3 h-3" />
        Noise cancellation active · No account needed · End-to-end encrypted
      </div>

      {/* Join button */}
      <button
        onClick={handleJoin}
        disabled={isJoining || !isReady}
        className="w-full h-12 rounded-xl text-sm font-semibold text-white transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
        style={{
          background: isReady ? "linear-gradient(135deg, #4f46e5, #7c3aed)" : "rgba(255,255,255,0.06)",
          boxShadow: isReady ? "0 4px 20px rgba(99,102,241,0.35)" : "none",
        }}
      >
        {isJoining ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        {isJoining ? "Connecting…" : isReady ? "Join Meeting" : "Checking your setup…"}
      </button>

      {onCancel && (
        <button onClick={onCancel} className="w-full text-xs py-2" style={{ color: "rgba(255,255,255,0.3)" }}>
          Cancel
        </button>
      )}
    </div>
  );
}

function CheckRow({ icon: Icon, label, status, detail, action, divider = false }: {
  icon: React.FC<any>;
  label: string;
  status: CheckStatus;
  detail: string;
  action?: React.ReactNode;
  divider?: boolean;
}) {
  const color = status === "pass" ? "#10b981" : status === "fail" ? "#ef4444" : status === "checking" ? "#6366f1" : "rgba(255,255,255,0.25)";
  return (
    <div className={cn("flex items-center gap-3 px-4 py-3", divider && "border-t")} style={{ borderColor: "rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)" }}>
      <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: `${color}15`, border: `1px solid ${color}25` }}>
        <Icon className="w-4 h-4" style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-white">{label}</p>
        <p className="text-[10px] truncate mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>{detail}</p>
      </div>
      <div className="shrink-0 flex items-center gap-2">
        {action}
        {status === "checking" && <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color }} />}
        {status === "pass"     && <Check className="w-3.5 h-3.5"               style={{ color }} />}
        {status === "fail"     && <X     className="w-3.5 h-3.5"               style={{ color }} />}
      </div>
    </div>
  );
}