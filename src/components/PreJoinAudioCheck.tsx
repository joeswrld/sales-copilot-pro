/**
 * PreJoinAudioCheck.tsx — v1
 *
 * Full-screen pre-join wizard that runs mic, speaker, and network tests
 * before letting the user enter a Fixsense meeting. Matches the visual
 * language of LiveMeeting.tsx (dark theme, indigo accents).
 *
 * Usage:
 *   <PreJoinAudioCheck
 *     onReady={(micStream) => joinMeeting(micStream)}
 *     onSkip={() => joinMeeting(null)}
 *     meetingName="Q3 Sales Review"
 *   />
 */

import { useState, useEffect, useRef, useCallback, memo } from "react";
import {
  Mic, MicOff, Volume2, VolumeOff, Wifi, WifiOff,
  CheckCircle2, AlertCircle, AlertTriangle, Loader2,
  ArrowRight, RefreshCw, X, Activity, Radio,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useAudioQuality,
  type TestStatus,
  type MicTestResult,
  type SpeakerTestResult,
  type NetworkTestResult,
} from "@/hooks/useAudioQuality";

// ─── Design tokens (match LiveMeeting) ───────────────────────────────────────
const T = {
  bg:      "#080a12",
  panel:   "rgba(12,14,22,0.97)",
  card:    "rgba(255,255,255,0.04)",
  border:  "rgba(255,255,255,0.07)",
  accent:  "#6366f1",
  text:    "rgba(255,255,255,0.85)",
  muted:   "rgba(255,255,255,0.38)",
  subtle:  "rgba(255,255,255,0.10)",
  emerald: "#10b981",
  amber:   "#f59e0b",
  red:     "#ef4444",
};

// ─── Status helpers ──────────────────────────────────────────────────────────
function StatusIcon({ status, size = 16 }: { status: TestStatus; size?: number }) {
  const cls = `w-${size / 4} h-${size / 4}`;
  if (status === "running") return <Loader2 className={cn(cls, "animate-spin text-indigo-400")} />;
  if (status === "passed")  return <CheckCircle2 className={cn(cls, "text-emerald-400")} />;
  if (status === "warning") return <AlertTriangle className={cn(cls, "text-amber-400")} />;
  if (status === "failed")  return <AlertCircle className={cn(cls, "text-red-400")} />;
  return <div className={cn(cls, "rounded-full")} style={{ background: T.subtle }} />;
}

function statusColor(status: TestStatus) {
  if (status === "passed")  return T.emerald;
  if (status === "warning") return T.amber;
  if (status === "failed")  return T.red;
  if (status === "running") return T.accent;
  return T.muted;
}

// ─── Animated mic level bar ──────────────────────────────────────────────────
const MicLevelBar = memo(({ level, status }: { level: number; status: TestStatus }) => {
  const bars = 12;
  const color = level > 80 ? T.red : level > 50 ? T.emerald : level > 10 ? T.emerald : T.muted;
  return (
    <div className="flex items-end gap-0.5 h-8">
      {Array.from({ length: bars }, (_, i) => {
        const threshold = ((i + 1) / bars) * 100;
        const active = status === "running" && level >= threshold;
        return (
          <div
            key={i}
            className="flex-1 rounded-sm transition-all duration-75"
            style={{
              background: active ? color : T.subtle,
              height: `${20 + (i / bars) * 80}%`,
              opacity: active ? 1 : 0.3,
            }}
          />
        );
      })}
    </div>
  );
});

// ─── Test row component ──────────────────────────────────────────────────────
const TestRow = memo(({
  icon: Icon, title, description, status, children, onRetest,
}: {
  icon: any; title: string; description: string;
  status: TestStatus; children?: React.ReactNode; onRetest?: () => void;
}) => (
  <div
    className="rounded-xl p-4 border transition-all duration-200"
    style={{
      background: T.card,
      borderColor: status === "failed" ? "rgba(239,68,68,0.3)"
                 : status === "passed" ? "rgba(16,185,129,0.2)"
                 : status === "warning" ? "rgba(245,158,11,0.2)"
                 : T.border,
    }}
  >
    <div className="flex items-start gap-3">
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
        style={{
          background: status === "idle" ? T.subtle : `${statusColor(status)}18`,
          border: `1px solid ${statusColor(status)}30`,
        }}
      >
        <Icon className="w-4 h-4" style={{ color: status === "idle" ? T.muted : statusColor(status) }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-sm font-semibold" style={{ color: T.text }}>{title}</span>
          <StatusIcon status={status} size={14} />
          {(status === "failed" || status === "warning") && onRetest && (
            <button
              onClick={onRetest}
              className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-lg touch-manipulation"
              style={{ background: "rgba(99,102,241,0.12)", color: "#a5b4fc" }}
            >
              <RefreshCw className="w-2.5 h-2.5" /> Retry
            </button>
          )}
        </div>
        <p className="text-xs leading-relaxed" style={{ color: T.muted }}>{description}</p>
        {children && <div className="mt-3">{children}</div>}
      </div>
    </div>
  </div>
));

// ─── Network quality indicator ───────────────────────────────────────────────
const NetworkBars = memo(({ rttMs }: { rttMs: number | null }) => {
  const quality = rttMs === null ? 0 : rttMs < 80 ? 4 : rttMs < 150 ? 3 : rttMs < 300 ? 2 : 1;
  return (
    <div className="flex items-end gap-0.5 h-5">
      {[1, 2, 3, 4].map((level) => (
        <div
          key={level}
          className="w-2 rounded-sm"
          style={{
            height: `${level * 25}%`,
            background: level <= quality
              ? quality >= 3 ? T.emerald : quality === 2 ? T.amber : T.red
              : T.subtle,
          }}
        />
      ))}
    </div>
  );
});

// ─── Main component ──────────────────────────────────────────────────────────

interface PreJoinAudioCheckProps {
  meetingName?: string;
  onReady: (micStream: MediaStream | null) => void;
  onSkip: () => void;
  className?: string;
}

export function PreJoinAudioCheck({ meetingName, onReady, onSkip, className }: PreJoinAudioCheckProps) {
  const aq = useAudioQuality();
  const [liveMicLevel, setLiveMicLevel] = useState(0);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const [running, setRunning] = useState(false);

  // Auto-start mic level preview immediately (no full test yet)
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: { ideal: 1 },
          },
          video: false,
        });
        if (!active) { stream.getTracks().forEach((t) => t.stop()); return; }
        setLocalStream(stream);

        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({
          latencyHint: "interactive",
        });
        audioCtxRef.current = ctx;
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.4;
        ctx.createMediaStreamSource(stream).connect(analyser);
        analyserRef.current = analyser;

        const buf = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          analyser.getByteFrequencyData(buf);
          let sum = 0;
          for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
          const lvl = Math.min(100, Math.round((Math.sqrt(sum / buf.length) / 128) * 100));
          setLiveMicLevel(lvl);
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch {
        // Permission denied or no mic — tests will catch this
      }
    })();

    return () => {
      active = false;
      cancelAnimationFrame(rafRef.current);
      audioCtxRef.current?.close().catch(() => {});
    };
  }, []);

  const handleRunTests = useCallback(async () => {
    setRunning(true);
    await aq.runAllTests();
    setRunning(false);
  }, [aq]);

  const handleJoin = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    audioCtxRef.current?.close().catch(() => {});
    onReady(localStream);
  }, [localStream, onReady]);

  // Mic test description based on status
  const micDesc = aq.mic.status === "idle"
    ? "We'll check your microphone volume and clarity."
    : aq.mic.status === "running"
    ? "Listening… please speak a few words."
    : aq.mic.status === "passed"
    ? `Peak: ${aq.mic.peakLevel}% · ${aq.mic.deviceLabel ?? "Default mic"}`
    : aq.mic.errorMessage ?? "Microphone issue detected.";

  const networkDesc = aq.network.status === "idle"
    ? "We'll check your connection latency and stability."
    : aq.network.status === "running"
    ? "Measuring latency to audio servers…"
    : aq.network.rttMs !== null
    ? `Latency: ${aq.network.rttMs}ms${aq.network.downloadMbps ? ` · ${aq.network.downloadMbps.toFixed(1)} Mbps` : ""}`
    : aq.network.errorMessage ?? "Network check complete.";

  const speakerDesc = aq.speaker.status === "idle"
    ? "We'll play a test tone to verify your speakers."
    : aq.speaker.status === "running"
    ? "Playing test tone…"
    : aq.speaker.status === "passed"
    ? "Speakers OK — you heard the test tone."
    : aq.speaker.errorMessage ?? "Speaker issue detected.";

  return (
    <div
      className={cn("flex flex-col items-center justify-center min-h-dvh px-4 py-6", className)}
      style={{ background: T.bg }}
    >
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-6">
          <div
            className="w-12 h-12 rounded-2xl mx-auto mb-3 flex items-center justify-center"
            style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)" }}
          >
            <Radio className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-xl font-bold text-white">Audio Check</h1>
          {meetingName && (
            <p className="text-sm mt-1" style={{ color: T.muted }}>
              Before joining: <span style={{ color: "rgba(255,255,255,0.6)" }}>{meetingName}</span>
            </p>
          )}
        </div>

        {/* Live mic level preview (always visible) */}
        <div
          className="mb-4 px-4 py-3 rounded-xl border flex items-center gap-3"
          style={{ background: T.card, borderColor: T.border }}
        >
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: liveMicLevel > 5 ? "rgba(16,185,129,0.15)" : T.subtle }}>
            {liveMicLevel > 5
              ? <Mic className="w-4 h-4 text-emerald-400" />
              : <MicOff className="w-4 h-4" style={{ color: T.muted }} />}
          </div>
          <div className="flex-1 min-w-0">
            <MicLevelBar level={liveMicLevel} status={liveMicLevel > 0 ? "running" : "idle"} />
          </div>
          <span className="text-[11px] font-mono tabular-nums w-8 text-right" style={{ color: T.muted }}>
            {liveMicLevel}%
          </span>
        </div>

        {/* Test cards */}
        <div className="space-y-3 mb-6">
          <TestRow
            icon={Mic} title="Microphone" description={micDesc}
            status={aq.mic.status}
            onRetest={() => aq.testMicrophone()}
          >
            {aq.mic.status === "running" && (
              <MicLevelBar level={liveMicLevel} status="running" />
            )}
            {aq.mic.status === "passed" && (
              <div className="flex items-center gap-3">
                <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: T.subtle }}>
                  <div className="h-full rounded-full" style={{ width: `${aq.mic.peakLevel}%`, background: T.emerald }} />
                </div>
                <span className="text-[10px] font-mono" style={{ color: T.muted }}>{aq.mic.peakLevel}%</span>
              </div>
            )}
          </TestRow>

          <TestRow
            icon={Volume2} title="Speaker" description={speakerDesc}
            status={aq.speaker.status}
            onRetest={aq.testSpeaker}
          >
            {aq.speaker.status === "running" && (
              <div className="flex items-center gap-2">
                <div className="flex gap-0.5">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div key={i} className="w-1 rounded-full animate-bounce bg-indigo-400"
                      style={{ height: `${8 + i * 3}px`, animationDelay: `${i * 0.08}s` }} />
                  ))}
                </div>
                <span className="text-[11px]" style={{ color: T.muted }}>Playing 440 Hz tone…</span>
              </div>
            )}
          </TestRow>

          <TestRow
            icon={aq.network.status === "failed" ? WifiOff : Wifi}
            title="Network"
            description={networkDesc}
            status={aq.network.status}
            onRetest={aq.testNetwork}
          >
            {aq.network.rttMs !== null && (
              <div className="flex items-center gap-3">
                <NetworkBars rttMs={aq.network.rttMs} />
                <div className="flex gap-3 text-[11px]">
                  <span style={{ color: T.muted }}>RTT: <span style={{ color: T.text }}>{aq.network.rttMs}ms</span></span>
                  {aq.network.jitterMs !== null && (
                    <span style={{ color: T.muted }}>Jitter: <span style={{ color: T.text }}>{aq.network.jitterMs}ms</span></span>
                  )}
                </div>
              </div>
            )}
            {aq.network.status === "passed" && !aq.network.canSupportHD && (
              <p className="text-[11px] mt-1" style={{ color: T.amber }}>
                Video quality may be limited. Audio will work fine.
              </p>
            )}
          </TestRow>
        </div>

        {/* Action buttons */}
        {aq.mic.status === "idle" ? (
          <button
            onClick={handleRunTests}
            disabled={running}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-semibold text-white touch-manipulation min-h-[48px]"
            style={{ background: "linear-gradient(135deg,#4f46e5,#7c3aed)" }}
          >
            {running
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Running tests…</>
              : <><Activity className="w-4 h-4" /> Run Audio Check</>}
          </button>
        ) : (
          <div className="space-y-2">
            <button
              onClick={handleJoin}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 touch-manipulation min-h-[48px]"
              style={{ background: "linear-gradient(135deg,#4f46e5,#7c3aed)" }}
            >
              <ArrowRight className="w-4 h-4" />
              {aq.allTestsPassed ? "Join Meeting" : "Join Anyway"}
            </button>
            <button
              onClick={onSkip}
              className="w-full py-3 rounded-xl text-sm text-center touch-manipulation min-h-[44px]"
              style={{ color: T.muted }}
            >
              Skip audio check
            </button>
          </div>
        )}

        {/* Quality legend */}
        {aq.allTestsPassed && (
          <div
            className="mt-4 px-4 py-3 rounded-xl flex items-center gap-2"
            style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.15)" }}
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <p className="text-xs" style={{ color: "rgba(255,255,255,0.6)" }}>
              Your audio setup looks great. Expect crystal-clear voice with {" "}
              <span className="text-emerald-400 font-medium">Opus 48kHz</span> codec.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}