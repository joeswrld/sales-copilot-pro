/**
 * VoiceRecorder.tsx  —  Fixsense Voice Notes
 * Pause/Resume, Restart, Cancel, Send. Mobile slide-to-cancel + lock.
 * rec.start() with NO timeslice → single chunk on stop = seekable WebM.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { Square, X, Send, Pause, Play, RotateCcw, Lock } from "lucide-react";

export interface VoiceRecorderProps {
  onCancel: () => void;
  onSend: (blob: Blob, durationSec: number, waveform: number[]) => Promise<void>;
  isMobile?: boolean;
}

type RecState = "starting" | "recording" | "paused" | "stopped" | "sending";

function pickMime(): string {
  for (const t of ["audio/webm;codecs=opus","audio/webm","audio/ogg;codecs=opus","audio/ogg"]) {
    try { if (MediaRecorder.isTypeSupported(t)) return t; } catch {}
  }
  return "";
}

export default function VoiceRecorder({ onCancel, onSend, isMobile = false }: VoiceRecorderProps) {
  const [state, setState]     = useState<RecState>("starting");
  const [elapsed, setElapsed] = useState(0);
  const [levels, setLevels]   = useState<number[]>(Array(40).fill(0.05));
  const [fullWave, setFullWave] = useState<number[]>([]);
  const [blob, setBlob]       = useState<Blob | null>(null);
  const [locked, setLocked]   = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [slideX, setSlideX]   = useState(0);
  const [txStart, setTxStart] = useState(0);
  const [tyStart, setTyStart] = useState(0);

  const recRef      = useRef<MediaRecorder | null>(null);
  const streamRef   = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef      = useRef<number>(0);
  const timerRef    = useRef<number>(0);
  const startMs     = useRef<number>(0);
  const pausedMs    = useRef<number>(0);
  const pauseStartMs= useRef<number>(0);
  const chunksRef   = useRef<Blob[]>([]);
  const mimeRef     = useRef<string>("");

  const stopAll = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    try { if (audioCtxRef.current?.state !== "closed") audioCtxRef.current?.close(); } catch {}
    recRef.current = null; streamRef.current = null;
    audioCtxRef.current = null; analyserRef.current = null;
  }, []);

  const startAnalyserTick = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      if (!analyserRef.current) return;
      analyser.getByteFrequencyData(data);
      const avg = data.reduce((a, b) => a + b, 0) / data.length / 255;
      setLevels(p => [...p.slice(-39), avg]);
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
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      streamRef.current = stream;
      mimeRef.current = pickMime();
      const rec = new MediaRecorder(stream, mimeRef.current ? { mimeType: mimeRef.current } : undefined);
      recRef.current = rec;
      chunksRef.current = [];
      rec.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        setBlob(new Blob(chunksRef.current, { type: mimeRef.current || "audio/webm" }));
        setState("stopped");
        stopAll();
      };
      rec.start(); // NO timeslice — one blob on stop, seekable WebM
      startMs.current = Date.now(); pausedMs.current = 0;
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
      setError(e.name === "NotAllowedError" ? "Microphone access denied" : (e.message || "Start failed"));
      setState("stopped");
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
    stopAll(); setBlob(null); setElapsed(0);
    setLevels(Array(40).fill(0.05)); setFullWave([]);
    setLocked(false); setError(null);
    startRecording();
  }, [stopAll, startRecording]);

  const cancel = useCallback(() => { stopAll(); onCancel(); }, [stopAll, onCancel]);

  const send = useCallback(async () => {
    if (!blob) return;
    setState("sending");
    try { await onSend(blob, elapsed, fullWave.slice(-60)); } finally { setState("stopped"); }
  }, [blob, elapsed, fullWave, onSend]);

  useEffect(() => { startRecording(); return () => stopAll(); }, []); // eslint-disable-line

  const onTouchStart = (e: React.TouchEvent) => { setTxStart(e.touches[0].clientX); setTyStart(e.touches[0].clientY); };
  const onTouchMove  = (e: React.TouchEvent) => {
    const dx = e.touches[0].clientX - txStart;
    const dy = e.touches[0].clientY - tyStart;
    if (dx < 0) setSlideX(Math.max(-110, dx));
    if (dy < -60 && !locked) setLocked(true);
  };
  const onTouchEnd = () => { if (slideX < -80) { cancel(); return; } setSlideX(0); };

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");
  const isRec    = state === "recording";
  const isPaused = state === "paused";
  const isStopped = state === "stopped";
  const isSending = state === "sending";
  const isActive  = isRec || isPaused;

  return (
    <div
      onTouchStart={isMobile && isActive ? onTouchStart : undefined}
      onTouchMove={isMobile && isActive ? onTouchMove : undefined}
      onTouchEnd={isMobile && isActive ? onTouchEnd : undefined}
      style={{
        display: "flex", alignItems: "center", gap: 8, flex: 1,
        padding: "7px 10px",
        background: isStopped ? "rgba(14,245,212,.06)" : "rgba(239,68,68,.07)",
        border: `1px solid ${isStopped ? "rgba(14,245,212,.2)" : "rgba(239,68,68,.22)"}`,
        borderRadius: 13, minHeight: 48, position: "relative",
        transform: `translateX(${slideX * 0.4}px)`,
        transition: "transform .08s linear, background .2s, border-color .2s",
        userSelect: "none",
      }}
    >
      {/* Lock or cancel */}
      {locked
        ? <div style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(14,245,212,.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Lock size={13} color="#0ef5d4" />
          </div>
        : <button onClick={cancel} style={{ width: 28, height: 28, borderRadius: 8, border: "none", background: "rgba(255,255,255,.07)", color: "rgba(255,255,255,.55)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <X size={13} />
          </button>
      }

      {error
        ? <span style={{ fontSize: 12, color: "#ef4444", flex: 1, fontFamily: "'Geist',system-ui,sans-serif" }}>{error}</span>
        : (
          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6, minWidth: 0, overflow: "hidden" }}>
            {isActive && (
              <div style={{
                width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
                background: isPaused ? "#f59e0b" : "#ef4444",
                animation: isRec ? "pdot 1s ease infinite" : "none",
              }} />
            )}
            <span style={{ fontSize: 13, fontWeight: 600, color: "#f0f6fc", fontVariantNumeric: "tabular-nums", minWidth: 36, flexShrink: 0, fontFamily: "'Geist',system-ui,sans-serif" }}>
              {mm}:{ss}
            </span>
            <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 1.5, height: 28 }}>
              {(isActive ? levels : [...fullWave.slice(-40), ...Array(Math.max(0, 40-Math.min(40,fullWave.length))).fill(0.05)]).map((v, i) => (
                <div key={i} style={{
                  flex: 1, minWidth: 1, borderRadius: 1,
                  height: `${Math.max(15, (v || 0.05) * 88)}%`,
                  background: isPaused ? `rgba(245,158,11,${0.4+v*0.6})` : isStopped ? `rgba(14,245,212,${0.25+(v||0.05)*0.75})` : `rgba(239,68,68,${0.5+v*0.5})`,
                  transition: isActive ? "height .06s" : "none",
                }} />
              ))}
            </div>
          </div>
        )
      }

      <div style={{ display: "flex", gap: 5, flexShrink: 0, alignItems: "center" }}>
        {isStopped && !isSending && !error && (
          <button onClick={restart} style={{ width: 29, height: 29, borderRadius: 8, border: "1px solid rgba(255,255,255,.12)", background: "rgba(255,255,255,.06)", color: "rgba(255,255,255,.65)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <RotateCcw size={13} />
          </button>
        )}
        {isRec && (
          <button onClick={pause} style={{ width: 29, height: 29, borderRadius: 8, border: "1px solid rgba(245,158,11,.3)", background: "rgba(245,158,11,.1)", color: "#f59e0b", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Pause size={13} fill="#f59e0b" />
          </button>
        )}
        {isPaused && (
          <button onClick={resume} style={{ width: 29, height: 29, borderRadius: 8, border: "1px solid rgba(34,197,94,.3)", background: "rgba(34,197,94,.1)", color: "#22c55e", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Play size={13} fill="#22c55e" />
          </button>
        )}
        {isActive && (
          <button onClick={stop} style={{ width: 33, height: 33, borderRadius: 9, border: "none", background: "#ef4444", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Square size={13} fill="#fff" />
          </button>
        )}
        {(isStopped || isSending) && !error && (
          <button onClick={send} disabled={isSending || !blob} style={{ width: 33, height: 33, borderRadius: 9, border: "none", background: isSending ? "rgba(255,255,255,.1)" : "linear-gradient(135deg,#0ef5d4,#0891b2)", color: "#060912", cursor: isSending ? "wait" : "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {isSending ? <span style={{ width: 11, height: 11, border: "2px solid rgba(255,255,255,.4)", borderTopColor: "#fff", borderRadius: "50%", display: "inline-block", animation: "spin .6s linear infinite" }} /> : <Send size={13} />}
          </button>
        )}
      </div>

      {isMobile && isActive && !locked && (
        <div style={{ position: "absolute", bottom: -18, left: "50%", transform: "translateX(-50%)", fontSize: 9.5, color: "rgba(255,255,255,.22)", whiteSpace: "nowrap", pointerEvents: "none" }}>
          ← slide to cancel · ↑ slide to lock
        </div>
      )}
    </div>
  );
}