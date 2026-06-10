/**
 * VoiceRecorder — MediaRecorder UI with live waveform and timer.
 * Returns the recorded webm/opus Blob on stop.
 *
 * Fix (v2):
 *   rec.start(100) was called with a 100ms timeslice, which makes MediaRecorder
 *   emit data every 100ms and produce a "fragmented" WebM container. Fragmented
 *   WebM files lack a proper SeekHead / Cues element, so when they are served
 *   over HTTP the browser cannot seek into them — it reports "no supported source"
 *   or plays silence even though the bytes are there.
 *
 *   The fix is rec.start() with NO timeslice. ondataavailable fires exactly once
 *   when stop() is called, producing a single well-formed WebM blob that browsers
 *   can seek and play from storage without issues.
 *
 *   The live waveform is unaffected — it reads from an AudioContext analyser that
 *   is completely separate from the MediaRecorder chunk pipeline.
 */
import { useEffect, useRef, useState } from "react";
import { Mic, Square, X, Send } from "lucide-react";

interface Props {
  onCancel: () => void;
  onSend: (blob: Blob, durationSec: number) => void | Promise<void>;
}

export default function VoiceRecorder({ onCancel, onSend }: Props) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [levels, setLevels] = useState<number[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mediaRecRef  = useRef<MediaRecorder | null>(null);
  const streamRef    = useRef<MediaStream | null>(null);
  const audioCtxRef  = useRef<AudioContext | null>(null);
  const analyserRef  = useRef<AnalyserNode | null>(null);
  const rafRef       = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const rafTimerRef  = useRef<number | null>(null); // elapsed ticker

  const stopAll = () => {
    if (rafRef.current)       cancelAnimationFrame(rafRef.current);
    if (rafTimerRef.current)  cancelAnimationFrame(rafTimerRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      audioCtxRef.current.close().catch(() => {});
    }
    mediaRecRef.current = null;
    streamRef.current   = null;
    audioCtxRef.current = null;
    analyserRef.current = null;
  };

  const start = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Pick the best supported MIME type
      const mimeType = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
        "audio/ogg",
      ].find(t => MediaRecorder.isTypeSupported(t)) ?? "";

      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecRef.current = rec;

      const chunks: Blob[] = [];
      rec.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
      rec.onstop = () => {
        const finalType = mimeType || "audio/webm";
        const b = new Blob(chunks, { type: finalType });
        setBlob(b);
        stopAll();
      };

      // *** KEY FIX: no timeslice argument ***
      // rec.start(100) produced a fragmented WebM (no SeekHead/Cues) that
      // browsers can't seek when served over HTTP. rec.start() with no argument
      // fires ondataavailable exactly once on stop(), giving a complete WebM.
      rec.start();

      setRecording(true);
      startTimeRef.current = Date.now();

      // Waveform via AudioContext (independent of MediaRecorder chunks)
      const ctx       = new AudioContext();
      audioCtxRef.current = ctx;
      const src       = ctx.createMediaStreamSource(stream);
      const analyser  = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      analyserRef.current = analyser;
      const data = new Uint8Array(analyser.frequencyBinCount);

      const tick = () => {
        if (!analyserRef.current) return;
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length / 255;
        setLevels(prev => [...prev.slice(-39), avg]);
        setElapsed((Date.now() - startTimeRef.current) / 1000);
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (e: any) {
      setError(e.message || "Microphone access denied");
    }
  };

  const stop = () => {
    if (mediaRecRef.current && mediaRecRef.current.state !== "inactive") {
      mediaRecRef.current.stop();
    }
    setRecording(false);
  };

  const cancel = () => {
    stop();
    stopAll();
    onCancel();
  };

  const send = async () => {
    if (!blob || sending) return;
    setSending(true);
    try { await onSend(blob, elapsed); } finally { setSending(false); }
  };

  useEffect(() => {
    start();
    return () => stopAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mm = Math.floor(elapsed / 60).toString().padStart(2, "0");
  const ss = Math.floor(elapsed % 60).toString().padStart(2, "0");

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.25)",
      borderRadius: 13, padding: "8px 12px", flex: 1, minHeight: 50,
    }}>
      <button onClick={cancel} title="Cancel" style={{
        width: 30, height: 30, borderRadius: 8, border: "none",
        background: "rgba(255,255,255,.07)", color: "rgba(255,255,255,.7)",
        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}><X size={14} /></button>

      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        {error ? (
          <span style={{ fontSize: 12, color: "#ef4444" }}>{error}</span>
        ) : (
          <>
            <div style={{
              width: 8, height: 8, borderRadius: "50%",
              background: recording ? "#ef4444" : "#94a3b8",
              animation: recording ? "pdot 1s ease infinite" : undefined,
            }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: "#f0f6fc", fontVariantNumeric: "tabular-nums", minWidth: 42 }}>
              {mm}:{ss}
            </span>
            <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 2, height: 24, overflow: "hidden" }}>
              {Array.from({ length: 40 }).map((_, i) => {
                const v = levels[i] ?? 0;
                return (
                  <div key={i} style={{
                    flex: 1, height: `${Math.max(8, v * 100)}%`, minHeight: 2,
                    background: recording ? "linear-gradient(180deg,#ef4444,#f87171)" : "rgba(14,245,212,.6)",
                    borderRadius: 1,
                  }} />
                );
              })}
            </div>
          </>
        )}
      </div>

      {recording ? (
        <button onClick={stop} title="Stop" style={{
          width: 36, height: 36, borderRadius: 9, border: "none",
          background: "#ef4444", color: "#fff",
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}><Square size={14} fill="#fff" /></button>
      ) : blob ? (
        <button onClick={send} disabled={sending} title="Send" style={{
          width: 36, height: 36, borderRadius: 9, border: "none",
          background: "linear-gradient(135deg,#0ef5d4,#0891b2)", color: "#060912",
          cursor: sending ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}><Send size={14} /></button>
      ) : (
        <button onClick={start} title="Re-record" style={{
          width: 36, height: 36, borderRadius: 9, border: "none",
          background: "rgba(255,255,255,.07)", color: "rgba(255,255,255,.6)",
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}><Mic size={14} /></button>
      )}
    </div>
  );
}