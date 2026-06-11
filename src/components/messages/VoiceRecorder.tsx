/**
 * VoiceRecorder.tsx — Fixsense Voice Notes v2
 *
 * Features:
 *  - Live waveform + timer
 *  - Pause / Resume / Restart / Cancel / Send
 *  - Preview playback before sending
 *  - Optional text caption
 *  - Mobile: slide-left-to-cancel, slide-up-to-lock
 *  - Upload progress indicator
 *  - Retry on failure
 */
import { useEffect, useRef, useState, useCallback } from "react";
import {
  Square, X, Send, Pause, Play, RotateCcw, Lock, Mic,
  ChevronRight, MessageSquare, Trash2, CheckCircle2,
} from "lucide-react";

export interface VoiceRecorderProps {
  onCancel: () => void;
  /** blob, durationSec, waveform (0-1 values) */
  onSend: (blob: Blob, durationSec: number, waveform: number[], caption: string) => Promise<void>;
  isMobile?: boolean;
}

type RecState = "starting" | "recording" | "paused" | "stopped" | "sending" | "sent" | "error";

function pickMime(): string {
  for (const t of [
    "audio/webm;codecs=opus", "audio/webm",
    "audio/ogg;codecs=opus", "audio/ogg",
  ]) {
    try { if (MediaRecorder.isTypeSupported(t)) return t; } catch {}
  }
  return "";
}

function fmtTime(s: number) {
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

export default function VoiceRecorder({ onCancel, onSend, isMobile = false }: VoiceRecorderProps) {
  const [state, setState]         = useState<RecState>("starting");
  const [elapsed, setElapsed]     = useState(0);
  const [levels, setLevels]       = useState<number[]>(Array(48).fill(0.05));
  const [fullWave, setFullWave]   = useState<number[]>([]);
  const [blob, setBlob]           = useState<Blob | null>(null);
  const [locked, setLocked]       = useState(false);
  const [errMsg, setErrMsg]       = useState<string | null>(null);
  const [slideX, setSlideX]       = useState(0);
  const [txStart, setTxStart]     = useState(0);
  const [tyStart, setTyStart]     = useState(0);
  const [caption, setCaption]     = useState("");
  const [showCaption, setShowCaption] = useState(false);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [previewPos, setPreviewPos] = useState(0);
  const [previewDur, setPreviewDur] = useState(0);
  const [uploadPct, setUploadPct] = useState(0);

  const recRef       = useRef<MediaRecorder | null>(null);
  const streamRef    = useRef<MediaStream | null>(null);
  const audioCtxRef  = useRef<AudioContext | null>(null);
  const analyserRef  = useRef<AnalyserNode | null>(null);
  const rafRef       = useRef<number>(0);
  const timerRef     = useRef<number>(0);
  const startMs      = useRef<number>(0);
  const pausedMs     = useRef<number>(0);
  const pauseStartMs = useRef<number>(0);
  const chunksRef    = useRef<Blob[]>([]);
  const mimeRef      = useRef<string>("");
  const previewRef   = useRef<HTMLAudioElement | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  const stopAll = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    try { if (audioCtxRef.current?.state !== "closed") audioCtxRef.current?.close(); } catch {}
    recRef.current = null;
    streamRef.current = null;
    audioCtxRef.current = null;
    analyserRef.current = null;
  }, []);

  const startAnalyserTick = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      if (!analyserRef.current) return;
      analyser.getByteFrequencyData(data);
      const avg = data.reduce((a, b) => a + b, 0) / data.length / 255;
      setLevels(p => [...p.slice(-47), avg]);
      setFullWave(p => [...p, avg]);
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
  }, []);

  const startTimer = useCallback(() => {
    clearInterval(timerRef.current);
    timerRef.current = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - startMs.current - pausedMs.current) / 1000));
    }, 200);
  }, []);

  const startRecording = useCallback(async () => {
    setErrMsg(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;
      mimeRef.current = pickMime();
      const rec = new MediaRecorder(stream, mimeRef.current ? { mimeType: mimeRef.current } : undefined);
      recRef.current = rec;
      chunksRef.current = [];
      rec.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        const recorded = new Blob(chunksRef.current, { type: mimeRef.current || "audio/webm" });
        setBlob(recorded);
        setState("stopped");
        stopAll();
      };
      rec.start(); // No timeslice → single seekable chunk
      startMs.current = Date.now();
      pausedMs.current = 0;
      setState("recording");

      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      analyserRef.current = analyser;
      startAnalyserTick();
      startTimer();
    } catch (e: any) {
      const msg = e.name === "NotAllowedError"
        ? "Microphone access denied. Please allow it in browser settings."
        : (e.message || "Could not start recording");
      setErrMsg(msg);
      setState("error");
    }
  }, [startAnalyserTick, startTimer, stopAll]);

  const pause = useCallback(() => {
    if (recRef.current?.state === "recording") {
      recRef.current.pause();
      cancelAnimationFrame(rafRef.current);
      clearInterval(timerRef.current);
      pauseStartMs.current = Date.now();
      setState("paused");
    }
  }, []);

  const resume = useCallback(() => {
    if (recRef.current?.state === "paused") {
      recRef.current.resume();
      pausedMs.current += Date.now() - pauseStartMs.current;
      setState("recording");
      startAnalyserTick();
      startTimer();
    }
  }, [startAnalyserTick, startTimer]);

  const stop = useCallback(() => {
    if (recRef.current && recRef.current.state !== "inactive") recRef.current.stop();
    cancelAnimationFrame(rafRef.current);
    clearInterval(timerRef.current);
  }, []);

  const restart = useCallback(() => {
    stopAll();
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setBlob(null); setElapsed(0); setLevels(Array(48).fill(0.05)); setFullWave([]);
    setLocked(false); setErrMsg(null); setPreviewPlaying(false); setPreviewPos(0);
    setCaption(""); setShowCaption(false); setUploadPct(0);
    startRecording();
  }, [stopAll, startRecording]);

  const cancel = useCallback(() => {
    stopAll();
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    onCancel();
  }, [stopAll, onCancel]);

  const send = useCallback(async () => {
    if (!blob) return;
    setState("sending");
    setUploadPct(0);
    // Simulate progress ticks while actual upload runs
    const progTimer = setInterval(() => setUploadPct(p => Math.min(p + 8, 92)), 180);
    try {
      const wave = fullWave.length > 60
        ? fullWave.filter((_, i) => i % Math.ceil(fullWave.length / 60) === 0).slice(0, 60)
        : fullWave;
      await onSend(blob, elapsed, wave, caption);
      setUploadPct(100);
      setState("sent");
    } catch {
      setState("stopped");
      setErrMsg("Failed to send. Tap send to retry.");
    } finally {
      clearInterval(progTimer);
    }
  }, [blob, elapsed, fullWave, caption, onSend]);

  // Preview playback
  const togglePreview = useCallback(() => {
    if (!blob) return;
    if (!previewRef.current) return;
    if (previewPlaying) {
      previewRef.current.pause();
      setPreviewPlaying(false);
    } else {
      if (!previewUrlRef.current) {
        previewUrlRef.current = URL.createObjectURL(blob);
      }
      previewRef.current.src = previewUrlRef.current;
      previewRef.current.play().then(() => setPreviewPlaying(true)).catch(() => {});
    }
  }, [blob, previewPlaying]);

  useEffect(() => {
    const a = previewRef.current;
    if (!a) return;
    const onTime = () => setPreviewPos(a.currentTime);
    const onLoad = () => setPreviewDur(isFinite(a.duration) ? a.duration : 0);
    const onEnd  = () => { setPreviewPlaying(false); setPreviewPos(0); };
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onLoad);
    a.addEventListener("ended", onEnd);
    return () => { a.removeEventListener("timeupdate", onTime); a.removeEventListener("loadedmetadata", onLoad); a.removeEventListener("ended", onEnd); };
  }, []);

  // Clean up on unmount
  useEffect(() => { startRecording(); return () => stopAll(); }, []); // eslint-disable-line

  // Mobile gesture handlers
  const onTouchStart = (e: React.TouchEvent) => {
    setTxStart(e.touches[0].clientX);
    setTyStart(e.touches[0].clientY);
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const dx = e.touches[0].clientX - txStart;
    const dy = e.touches[0].clientY - tyStart;
    if (dx < 0) setSlideX(Math.max(-120, dx));
    if (dy < -60 && !locked) setLocked(true);
  };
  const onTouchEnd = () => {
    if (slideX < -90) { cancel(); return; }
    setSlideX(0);
  };

  const isRec      = state === "recording";
  const isPaused   = state === "paused";
  const isStopped  = state === "stopped";
  const isSending  = state === "sending";
  const isSent     = state === "sent";
  const isError    = state === "error";
  const isActive   = isRec || isPaused;
  const displayWave = isActive
    ? levels
    : [...(fullWave.slice(-48)), ...Array(Math.max(0, 48 - Math.min(48, fullWave.length))).fill(0.05)];

  const fg = "#0ef5d4";
  const pct = (previewDur > 0 && isStopped) ? (previewPos / previewDur) * 100 : 0;

  // Sent state — brief success flash
  if (isSent) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "rgba(34,197,94,.1)", border: "1px solid rgba(34,197,94,.25)", borderRadius: 13, minHeight: 48 }}>
        <CheckCircle2 size={18} color="#22c55e" />
        <span style={{ fontSize: 13, fontWeight: 600, color: "#22c55e", fontFamily: "'Geist',system-ui,sans-serif" }}>Voice note sent!</span>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {/* Main recorder row */}
      <div
        onTouchStart={isMobile && isActive ? onTouchStart : undefined}
        onTouchMove={isMobile && isActive ? onTouchMove : undefined}
        onTouchEnd={isMobile && isActive ? onTouchEnd : undefined}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "7px 10px",
          background: isStopped ? "rgba(14,245,212,.06)" : isError ? "rgba(239,68,68,.08)" : "rgba(239,68,68,.07)",
          border: `1px solid ${isStopped ? "rgba(14,245,212,.2)" : isError ? "rgba(239,68,68,.3)" : "rgba(239,68,68,.22)"}`,
          borderRadius: 13, minHeight: 50, position: "relative",
          transform: `translateX(${slideX * 0.35}px)`,
          transition: "transform .08s linear, background .2s, border-color .2s",
          userSelect: "none",
        }}
      >
        {/* Hidden preview audio element */}
        <audio ref={previewRef} preload="auto" style={{ display: "none" }} />

        {/* Lock icon (when locked for hands-free) */}
        {locked
          ? <div style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(14,245,212,.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Lock size={13} color="#0ef5d4" />
            </div>
          : <button onClick={cancel} style={{ width: 28, height: 28, borderRadius: 8, border: "none", background: "rgba(255,255,255,.07)", color: "rgba(255,255,255,.55)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <X size={13} />
            </button>
        }

        {/* Waveform / content area */}
        {isError ? (
          <span style={{ fontSize: 12, color: "#ef4444", flex: 1, fontFamily: "'Geist',system-ui,sans-serif" }}>{errMsg}</span>
        ) : (
          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6, minWidth: 0, overflow: "hidden" }}>
            {isActive && (
              <div style={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0, background: isPaused ? "#f59e0b" : "#ef4444", animation: isRec ? "pdot 1s ease infinite" : "none" }} />
            )}
            {/* Timer */}
            <span style={{ fontSize: 13, fontWeight: 700, color: "#f0f6fc", fontVariantNumeric: "tabular-nums", minWidth: 38, flexShrink: 0, fontFamily: "'Geist',system-ui,sans-serif" }}>
              {isStopped ? fmtTime(elapsed) : fmtTime(elapsed)}
            </span>
            {/* Waveform bars */}
            <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 1.5, height: 32 }}>
              {isSending ? (
                // Upload progress
                <div style={{ flex: 1, height: 4, borderRadius: 2, background: "rgba(255,255,255,.1)", overflow: "hidden" }}>
                  <div style={{ width: `${uploadPct}%`, height: "100%", background: "linear-gradient(90deg,#0ef5d4,#0891b2)", transition: "width .15s" }} />
                </div>
              ) : displayWave.map((v, i) => {
                const filled = isStopped && (i / 48) * 100 < pct;
                const h = Math.max(14, (v || 0.05) * 90);
                return (
                  <div key={i} onClick={() => {
                    // Seekable waveform when stopped
                    if (isStopped && previewRef.current && previewDur > 0) {
                      previewRef.current.currentTime = (i / 48) * previewDur;
                    }
                  }} style={{
                    flex: 1, minWidth: 1, borderRadius: 1, cursor: isStopped ? "pointer" : "default",
                    height: `${h}%`,
                    background: filled ? fg
                      : isPaused ? `rgba(245,158,11,${0.35 + v * 0.65})`
                      : isStopped ? `rgba(14,245,212,${0.22 + (v || 0.05) * 0.78})`
                      : `rgba(239,68,68,${0.45 + v * 0.55})`,
                    transition: isActive ? "height .07s" : "none",
                  }} />
                );
              })}
            </div>
            {/* Upload pct label while sending */}
            {isSending && (
              <span style={{ fontSize: 11, color: "#0ef5d4", fontFamily: "'Geist',system-ui,sans-serif", minWidth: 32 }}>{uploadPct}%</span>
            )}
          </div>
        )}

        {/* Controls */}
        <div style={{ display: "flex", gap: 5, flexShrink: 0, alignItems: "center" }}>
          {/* Preview play/pause button (stopped state only) */}
          {isStopped && !isSending && !isError && (
            <button onClick={togglePreview} style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${previewPlaying ? "rgba(14,245,212,.4)" : "rgba(255,255,255,.15)"}`, background: previewPlaying ? "rgba(14,245,212,.15)" : "rgba(255,255,255,.06)", color: previewPlaying ? "#0ef5d4" : "rgba(255,255,255,.7)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }} title="Preview recording">
              {previewPlaying ? <Pause size={13} fill="currentColor" /> : <Play size={13} fill="currentColor" />}
            </button>
          )}
          {/* Restart */}
          {(isStopped || isError) && !isSending && (
            <button onClick={restart} style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid rgba(255,255,255,.12)", background: "rgba(255,255,255,.06)", color: "rgba(255,255,255,.65)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }} title="Re-record">
              <RotateCcw size={13} />
            </button>
          )}
          {/* Pause while recording */}
          {isRec && (
            <button onClick={pause} style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid rgba(245,158,11,.3)", background: "rgba(245,158,11,.1)", color: "#f59e0b", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Pause size={13} fill="#f59e0b" />
            </button>
          )}
          {/* Resume when paused */}
          {isPaused && (
            <button onClick={resume} style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid rgba(34,197,94,.3)", background: "rgba(34,197,94,.1)", color: "#22c55e", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Play size={13} fill="#22c55e" />
            </button>
          )}
          {/* Stop recording */}
          {isActive && (
            <button onClick={stop} style={{ width: 34, height: 34, borderRadius: 9, border: "none", background: "#ef4444", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Square size={13} fill="#fff" />
            </button>
          )}
          {/* Caption toggle (stopped) */}
          {isStopped && !isSending && !isError && (
            <button onClick={() => setShowCaption(v => !v)} title="Add caption" style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${showCaption ? "rgba(167,139,250,.4)" : "rgba(255,255,255,.12)"}`, background: showCaption ? "rgba(167,139,250,.12)" : "rgba(255,255,255,.06)", color: showCaption ? "#a78bfa" : "rgba(255,255,255,.55)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <MessageSquare size={12} />
            </button>
          )}
          {/* Send */}
          {(isStopped || isSending) && !isError && (
            <button onClick={send} disabled={isSending || !blob} style={{ width: 36, height: 36, borderRadius: 10, border: "none", background: isSending ? "rgba(255,255,255,.08)" : "linear-gradient(135deg,#0ef5d4,#0891b2)", color: "#060912", cursor: isSending ? "wait" : "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {isSending
                ? <span style={{ width: 12, height: 12, border: "2px solid rgba(255,255,255,.3)", borderTopColor: "#fff", borderRadius: "50%", display: "inline-block", animation: "spin .6s linear infinite" }} />
                : <Send size={14} />
              }
            </button>
          )}
        </div>

        {/* Mobile slide hint */}
        {isMobile && isActive && !locked && (
          <div style={{ position: "absolute", bottom: -18, left: "50%", transform: "translateX(-50%)", fontSize: 9.5, color: "rgba(255,255,255,.22)", whiteSpace: "nowrap", pointerEvents: "none" }}>
            ← slide to cancel · ↑ slide to lock
          </div>
        )}
      </div>

      {/* Caption input */}
      {showCaption && isStopped && !isSending && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,.04)", border: "1px solid rgba(167,139,250,.2)", borderRadius: 10, padding: "6px 10px" }}>
          <MessageSquare size={12} color="#a78bfa" style={{ flexShrink: 0 }} />
          <input
            autoFocus
            value={caption}
            onChange={e => setCaption(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); send(); } }}
            placeholder="Add a caption…"
            style={{ flex: 1, background: "transparent", border: "none", outline: "none", fontSize: 13, color: "#f0f6fc", fontFamily: "'Geist',system-ui,sans-serif" }}
          />
          {caption && <button onClick={() => setCaption("")} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,.3)", fontSize: 14 }}>×</button>}
        </div>
      )}
    </div>
  );
}