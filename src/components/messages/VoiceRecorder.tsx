/**
 * VoiceRecorder.tsx — Fixsense Voice Notes v4
 *
 * Key fixes over v3:
 *  1. Preview playback fixed — togglePreview now always (re)binds the
 *     object URL to the <audio> element right before calling play(),
 *     instead of relying on a src assignment made inside onstop (which
 *     could race with the previewRef not being attached yet, leaving
 *     a.src empty and play() doing nothing).
 *  2. onstop no longer tries to set previewRef.current.src directly —
 *     it just creates the object URL; togglePreview binds it lazily.
 *  3. rec.start(100) — 100ms timeslice ensures ondataavailable fires regularly,
 *     preventing empty blobs when the user stops quickly.
 *  4. WebM duration fix — Chrome records WebM with duration=Infinity.
 *     After stop we seek a temporary hidden audio element to a huge timestamp,
 *     wait for the seeked event, then read back the real duration.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import {
  Square, X, Send, Pause, Play, RotateCcw, Lock, Mic,
  MessageSquare, CheckCircle2,
} from "lucide-react";

export interface VoiceRecorderProps {
  onCancel: () => void;
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

/**
 * Fix WebM duration metadata.
 * Creates a temporary <audio>, loads the blob, seeks to a huge time so the
 * browser has to parse the full container to find the end, then reads
 * the corrected duration and revokes the object URL.
 */
async function resolveWebmDuration(blob: Blob): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const audio = document.createElement("audio");
    audio.preload = "metadata";

    const cleanup = (dur: number) => {
      audio.src = "";
      URL.revokeObjectURL(url);
      resolve(dur > 0 && isFinite(dur) ? dur : 0);
    };

    audio.addEventListener("loadedmetadata", () => {
      if (isFinite(audio.duration) && audio.duration > 0) {
        cleanup(audio.duration);
        return;
      }
      // Duration is Infinity or NaN — do the seek trick
      audio.addEventListener("seeked", () => {
        const dur = audio.duration;
        cleanup(isFinite(dur) && dur > 0 ? dur : 0);
      }, { once: true });
      try { audio.currentTime = 1e8; } catch {
        cleanup(0);
      }
    });

    audio.addEventListener("error", () => cleanup(0));

    // Timeout safety net — resolve after 3s regardless
    const timer = setTimeout(() => cleanup(0), 3000);
    audio.addEventListener("seeked", () => clearTimeout(timer), { once: true });
    audio.addEventListener("loadedmetadata", () => clearTimeout(timer), { once: true });

    audio.src = url;
  });
}

export default function VoiceRecorder({ onCancel, onSend, isMobile = false }: VoiceRecorderProps) {
  const [state, setState]             = useState<RecState>("starting");
  const [elapsed, setElapsed]         = useState(0);
  const [levels, setLevels]           = useState<number[]>(Array(48).fill(0.05));
  const [fullWave, setFullWave]       = useState<number[]>([]);
  const [blob, setBlob]               = useState<Blob | null>(null);
  const [resolvedDuration, setResolvedDuration] = useState(0);
  const [locked, setLocked]           = useState(false);
  const [errMsg, setErrMsg]           = useState<string | null>(null);
  const [slideX, setSlideX]           = useState(0);
  const [txStart, setTxStart]         = useState(0);
  const [tyStart, setTyStart]         = useState(0);
  const [caption, setCaption]         = useState("");
  const [showCaption, setShowCaption] = useState(false);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [previewPos, setPreviewPos]   = useState(0);
  const [previewDur, setPreviewDur]   = useState(0);
  const [uploadPct, setUploadPct]     = useState(0);

  const recRef        = useRef<MediaRecorder | null>(null);
  const streamRef     = useRef<MediaStream | null>(null);
  const audioCtxRef   = useRef<AudioContext | null>(null);
  const analyserRef   = useRef<AnalyserNode | null>(null);
  const rafRef        = useRef<number>(0);
  const timerRef      = useRef<number>(0);
  const startMs       = useRef<number>(0);
  const pausedMs      = useRef<number>(0);
  const pauseStartMs  = useRef<number>(0);
  const chunksRef     = useRef<Blob[]>([]);
  const mimeRef       = useRef<string>("");
  const previewRef    = useRef<HTMLAudioElement | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  // Track elapsed at time of stop for use in send()
  const elapsedAtStop = useRef<number>(0);

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
      const secs = Math.floor((Date.now() - startMs.current - pausedMs.current) / 1000);
      setElapsed(secs);
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

      const rec = new MediaRecorder(
        stream,
        mimeRef.current ? { mimeType: mimeRef.current } : undefined
      );
      recRef.current = rec;
      chunksRef.current = [];

      rec.ondataavailable = e => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      rec.onstop = async () => {
        // Capture elapsed before any async work
        elapsedAtStop.current = Math.floor(
          (Date.now() - startMs.current - pausedMs.current) / 1000
        );
        stopAll();

        if (chunksRef.current.length === 0) {
          setErrMsg("No audio captured. Please try again.");
          setState("error");
          return;
        }

        const recorded = new Blob(chunksRef.current, {
          type: mimeRef.current || "audio/webm",
        });

        // Revoke any old preview URL
        if (previewUrlRef.current) {
          URL.revokeObjectURL(previewUrlRef.current);
          previewUrlRef.current = null;
        }

        // Pre-create the object URL now so preview is instant on first tap.
        // NOTE: we deliberately do NOT touch previewRef.current.src here —
        // the <audio> element may not be mounted/attached yet for this
        // render pass. togglePreview() binds the src lazily and reliably.
        const objUrl = URL.createObjectURL(recorded);
        previewUrlRef.current = objUrl;

        // Resolve real duration (fixes WebM Infinity duration bug)
        const dur = await resolveWebmDuration(recorded);

        setBlob(recorded);
        setResolvedDuration(dur > 0 ? dur : elapsedAtStop.current);
        setPreviewDur(dur > 0 ? dur : elapsedAtStop.current);
        setState("stopped");
      };

      // *** KEY FIX: 100ms timeslice ensures chunks arrive even for short recordings ***
      rec.start(100);
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
    if (recRef.current && recRef.current.state !== "inactive") {
      recRef.current.stop(); // triggers onstop after flushing last chunk
    }
    cancelAnimationFrame(rafRef.current);
    clearInterval(timerRef.current);
  }, []);

  const restart = useCallback(() => {
    stopAll();
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    if (previewRef.current) {
      previewRef.current.pause();
      previewRef.current.removeAttribute("src");
      previewRef.current.load();
    }
    setBlob(null);
    setElapsed(0);
    setLevels(Array(48).fill(0.05));
    setFullWave([]);
    setLocked(false);
    setErrMsg(null);
    setPreviewPlaying(false);
    setPreviewPos(0);
    setPreviewDur(0);
    setResolvedDuration(0);
    setCaption("");
    setShowCaption(false);
    setUploadPct(0);
    startRecording();
  }, [stopAll, startRecording]);

  const cancel = useCallback(() => {
    stopAll();
    if (previewRef.current) {
      previewRef.current.pause();
      previewRef.current.removeAttribute("src");
      previewRef.current.load();
    }
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    onCancel();
  }, [stopAll, onCancel]);

  const send = useCallback(async () => {
    if (!blob) return;
    setState("sending");
    setUploadPct(0);
    const progTimer = setInterval(() => setUploadPct(p => Math.min(p + 8, 92)), 180);
    try {
      const wave = fullWave.length > 60
        ? fullWave.filter((_, i) => i % Math.ceil(fullWave.length / 60) === 0).slice(0, 60)
        : fullWave;
      // Use resolved duration; fall back to elapsed-at-stop
      const dur = resolvedDuration > 0 ? resolvedDuration : elapsedAtStop.current;
      await onSend(blob, dur, wave, caption);
      setUploadPct(100);
      setState("sent");
    } catch {
      setState("stopped");
      setErrMsg("Failed to send. Tap send to retry.");
    } finally {
      clearInterval(progTimer);
    }
  }, [blob, resolvedDuration, fullWave, caption, onSend]);

  // ── Preview playback ────────────────────────────────────────────────────
  // Always (re)bind the object URL to the <audio> element right before
  // playing. This avoids depending on a src assignment made during onstop,
  // which can silently fail if the <audio> ref wasn't attached at that time.
  const togglePreview = useCallback(() => {
    const a = previewRef.current;
    if (!a || !blob) return;

    if (previewPlaying) {
      a.pause();
      setPreviewPlaying(false);
      return;
    }

    if (!previewUrlRef.current) {
      previewUrlRef.current = URL.createObjectURL(blob);
    }

    // Re-bind if the element doesn't currently point at our blob URL
    if (a.src !== previewUrlRef.current) {
      a.src = previewUrlRef.current;
      a.load();
    }

    setErrMsg(null);

    const playIt = () => {
      a.play()
        .then(() => setPreviewPlaying(true))
        .catch(err => {
          console.warn("Preview play failed:", err);
          setErrMsg(
            err?.name === "NotSupportedError"
              ? "This browser can't play the recorded audio format."
              : "Preview playback failed. Tap play again."
          );
        });
    };

    // If metadata isn't ready yet (readyState 0), wait for it before playing —
    // calling play() too early on a freshly (re)loaded element can no-op.
    if (a.readyState === 0) {
      const onReady = () => { a.removeEventListener("loadedmetadata", onReady); playIt(); };
      a.addEventListener("loadedmetadata", onReady, { once: true });
    } else {
      playIt();
    }
  }, [blob, previewPlaying]);

  // Wire audio events on mount
  useEffect(() => {
    const a = previewRef.current;
    if (!a) return;
    const onTime  = () => setPreviewPos(a.currentTime);
    const onLoad  = () => {
      const d = isFinite(a.duration) && a.duration > 0 ? a.duration : 0;
      if (d > 0) setPreviewDur(d);
    };
    const onEnd   = () => { setPreviewPlaying(false); setPreviewPos(0); };
    const onErr   = () => {
      setPreviewPlaying(false);
      const code = a.error?.code;
      if (code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
        setErrMsg("This browser can't play the recorded audio format.");
      } else if (code === MediaError.MEDIA_ERR_NETWORK) {
        setErrMsg("Network error loading preview — try again.");
      }
    };
    a.addEventListener("timeupdate",    onTime);
    a.addEventListener("loadedmetadata", onLoad);
    a.addEventListener("durationchange", onLoad);
    a.addEventListener("ended",         onEnd);
    a.addEventListener("error",         onErr);
    return () => {
      a.removeEventListener("timeupdate",    onTime);
      a.removeEventListener("loadedmetadata", onLoad);
      a.removeEventListener("durationchange", onLoad);
      a.removeEventListener("ended",         onEnd);
      a.removeEventListener("error",         onErr);
    };
  }, []);

  // Start recording on mount
  useEffect(() => {
    startRecording();
    return () => {
      stopAll();
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []); // eslint-disable-line

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

  const isRec     = state === "recording";
  const isPaused  = state === "paused";
  const isStopped = state === "stopped";
  const isSending = state === "sending";
  const isSent    = state === "sent";
  const isError   = state === "error";
  const isActive  = isRec || isPaused;

  // Display waveform
  const displayWave = isActive
    ? levels
    : [...fullWave.slice(-48), ...Array(Math.max(0, 48 - Math.min(48, fullWave.length))).fill(0.05)];

  const fg  = "#0ef5d4";
  const pct = (previewDur > 0 && isStopped) ? (previewPos / previewDur) * 100 : 0;

  // Display timer — use resolved duration when stopped
  const displaySecs = isStopped
    ? (resolvedDuration > 0 ? resolvedDuration : elapsedAtStop.current)
    : elapsed;

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
      <div
        onTouchStart={isMobile && isActive ? onTouchStart : undefined}
        onTouchMove={isMobile && isActive ? onTouchMove : undefined}
        onTouchEnd={isMobile && isActive ? onTouchEnd : undefined}
        style={{
          display: "flex", alignItems: "center", gap: 8, padding: "7px 10px",
          background: isStopped ? "rgba(14,245,212,.06)" : isError ? "rgba(239,68,68,.08)" : "rgba(239,68,68,.07)",
          border: `1px solid ${isStopped ? "rgba(14,245,212,.2)" : isError ? "rgba(239,68,68,.3)" : "rgba(239,68,68,.22)"}`,
          borderRadius: 13, minHeight: 50, position: "relative",
          transform: `translateX(${slideX * 0.35}px)`,
          transition: "transform .08s linear, background .2s, border-color .2s",
          userSelect: "none",
        }}
      >
        {/* Hidden preview audio — src is bound lazily by togglePreview() */}
        <audio ref={previewRef} preload="auto" style={{ display: "none" }} playsInline />

        {locked
          ? <div style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(14,245,212,.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Lock size={13} color="#0ef5d4" />
            </div>
          : <button onClick={cancel} style={{ width: 28, height: 28, borderRadius: 8, border: "none", background: "rgba(255,255,255,.07)", color: "rgba(255,255,255,.55)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <X size={13} />
            </button>
        }

        {isError ? (
          <span style={{ fontSize: 12, color: "#ef4444", flex: 1, fontFamily: "'Geist',system-ui,sans-serif" }}>{errMsg}</span>
        ) : (
          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6, minWidth: 0, overflow: "hidden" }}>
            {isActive && (
              <div style={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0, background: isPaused ? "#f59e0b" : "#ef4444", animation: isRec ? "pdot 1s ease infinite" : "none" }} />
            )}
            <span style={{ fontSize: 13, fontWeight: 700, color: "#f0f6fc", fontVariantNumeric: "tabular-nums", minWidth: 38, flexShrink: 0, fontFamily: "'Geist',system-ui,sans-serif" }}>
              {fmtTime(Math.round(displaySecs))}
            </span>
            <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 1.5, height: 32 }}>
              {isSending ? (
                <div style={{ flex: 1, height: 4, borderRadius: 2, background: "rgba(255,255,255,.1)", overflow: "hidden" }}>
                  <div style={{ width: `${uploadPct}%`, height: "100%", background: "linear-gradient(90deg,#0ef5d4,#0891b2)", transition: "width .15s" }} />
                </div>
              ) : displayWave.map((v, i) => {
                const filled = isStopped && (i / 48) * 100 < pct;
                const h = Math.max(14, (v || 0.05) * 90);
                return (
                  <div key={i} onClick={() => {
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
            {isSending && (
              <span style={{ fontSize: 11, color: "#0ef5d4", fontFamily: "'Geist',system-ui,sans-serif", minWidth: 32 }}>{uploadPct}%</span>
            )}
          </div>
        )}

        <div style={{ display: "flex", gap: 5, flexShrink: 0, alignItems: "center" }}>
          {isStopped && !isSending && !isError && (
            <button onClick={togglePreview} style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${previewPlaying ? "rgba(14,245,212,.4)" : "rgba(255,255,255,.15)"}`, background: previewPlaying ? "rgba(14,245,212,.15)" : "rgba(255,255,255,.06)", color: previewPlaying ? "#0ef5d4" : "rgba(255,255,255,.7)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }} title="Preview recording">
              {previewPlaying ? <Pause size={13} fill="currentColor" /> : <Play size={13} fill="currentColor" />}
            </button>
          )}
          {(isStopped || isError) && !isSending && (
            <button onClick={restart} style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid rgba(255,255,255,.12)", background: "rgba(255,255,255,.06)", color: "rgba(255,255,255,.65)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }} title="Re-record">
              <RotateCcw size={13} />
            </button>
          )}
          {isRec && (
            <button onClick={pause} style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid rgba(245,158,11,.3)", background: "rgba(245,158,11,.1)", color: "#f59e0b", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Pause size={13} fill="#f59e0b" />
            </button>
          )}
          {isPaused && (
            <button onClick={resume} style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid rgba(34,197,94,.3)", background: "rgba(34,197,94,.1)", color: "#22c55e", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Play size={13} fill="#22c55e" />
            </button>
          )}
          {isActive && (
            <button onClick={stop} style={{ width: 34, height: 34, borderRadius: 9, border: "none", background: "#ef4444", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Square size={13} fill="#fff" />
            </button>
          )}
          {isStopped && !isSending && !isError && (
            <button onClick={() => setShowCaption(v => !v)} title="Add caption" style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${showCaption ? "rgba(167,139,250,.4)" : "rgba(255,255,255,.12)"}`, background: showCaption ? "rgba(167,139,250,.12)" : "rgba(255,255,255,.06)", color: showCaption ? "#a78bfa" : "rgba(255,255,255,.55)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <MessageSquare size={12} />
            </button>
          )}
          {(isStopped || isSending) && !isError && (
            <button onClick={send} disabled={isSending || !blob} style={{ width: 36, height: 36, borderRadius: 10, border: "none", background: isSending ? "rgba(255,255,255,.08)" : "linear-gradient(135deg,#0ef5d4,#0891b2)", color: "#060912", cursor: isSending ? "wait" : "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {isSending
                ? <span style={{ width: 12, height: 12, border: "2px solid rgba(255,255,255,.3)", borderTopColor: "#fff", borderRadius: "50%", display: "inline-block", animation: "spin .6s linear infinite" }} />
                : <Send size={14} />
              }
            </button>
          )}
        </div>

        {isMobile && isActive && !locked && (
          <div style={{ position: "absolute", bottom: -18, left: "50%", transform: "translateX(-50%)", fontSize: 9.5, color: "rgba(255,255,255,.22)", whiteSpace: "nowrap", pointerEvents: "none" }}>
            ← slide to cancel · ↑ slide to lock
          </div>
        )}
      </div>

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