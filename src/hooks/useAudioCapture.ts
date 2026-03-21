/**
 * useAudioCapture.ts — v3
 *
 * Real dual-stream audio capture: merges BOTH sides of the conversation.
 *
 * Why the old approach failed:
 *   getDisplayMedia alone requires the user to tick "Share tab audio" in Chrome.
 *   If they skip that checkbox, audio tracks = 0, and we fell through to mic-only.
 *   The fix: ALWAYS also request the mic and merge both streams with AudioContext.
 *   Even if the display stream has no audio, we have the mic. Even if mic is denied,
 *   we have the display stream. When both work, AudioContext merges them.
 *
 * Capture paths (in priority order):
 *   DUAL     — getDisplayMedia (tab/speaker) + getUserMedia (mic) merged → full both-sides
 *   TAB      — getDisplayMedia audio only (mic denied)
 *   LOOPBACK — Windows Stereo Mix / VB-Cable / BlackHole → full both-sides
 *   MIC      — getUserMedia only → rep voice only (last resort, shows warning)
 */

import { useRef, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UseAudioCaptureOptions {
  callId: string | null;
  onChunkProcessed?: (result: any) => void;
}

export type CaptureSource = "dual" | "tab" | "loopback" | "mic" | null;

export type CaptureStep =
  | "idle"
  | "requesting_display"
  | "requesting_mic"
  | "active"
  | "error";

// ─── Feature detection ────────────────────────────────────────────────────────

function isMobileDevice(): boolean {
  return (
    typeof navigator !== "undefined" &&
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent,
    )
  );
}

function hasGetDisplayMedia(): boolean {
  return (
    !isMobileDevice() &&
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getDisplayMedia === "function"
  );
}

function hasGetUserMedia(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === "function"
  );
}

function hasMediaRecorder(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof (window as any).MediaRecorder !== "undefined"
  );
}

function pickWebmMimeType(): string | null {
  if (!hasMediaRecorder()) return null;
  if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus"))
    return "audio/webm;codecs=opus";
  if (MediaRecorder.isTypeSupported("audio/webm")) return "audio/webm";
  return null;
}

// ─── Audio stream merger ──────────────────────────────────────────────────────

/**
 * Merges display audio (prospect from speakers) and mic audio (rep voice)
 * into a single stream using Web Audio API. Both sides captured in one recording.
 */
function mergeAudioStreams(
  displayStream: MediaStream,
  micStream: MediaStream,
): { merged: MediaStream; ctx: AudioContext } {
  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  const dest = ctx.createMediaStreamDestination();

  if (displayStream.getAudioTracks().length > 0) {
    const displaySource = ctx.createMediaStreamSource(displayStream);
    const displayGain = ctx.createGain();
    displayGain.gain.value = 1.0;
    displaySource.connect(displayGain);
    displayGain.connect(dest);
  }

  if (micStream.getAudioTracks().length > 0) {
    const micSource = ctx.createMediaStreamSource(micStream);
    const micGain = ctx.createGain();
    micGain.gain.value = 1.2; // Slight mic boost to balance with speaker output
    micSource.connect(micGain);
    micGain.connect(dest);
  }

  return { merged: dest.stream, ctx };
}

// ─── Loopback device detection ────────────────────────────────────────────────

async function tryLoopbackCapture(): Promise<MediaStream | null> {
  if (!hasGetUserMedia()) return null;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const loopbackDevice = devices.find(
      (d) =>
        d.kind === "audioinput" &&
        /stereo\s*mix|what\s*u\s*hear|loopback|virtual\s*(cable|audio)|vb-audio|blackhole|soundflower/i.test(
          d.label,
        ),
    );
    if (!loopbackDevice) return null;
    return await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: { exact: loopbackDevice.deviceId },
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
      video: false,
    });
  } catch {
    return null;
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAudioCapture({
  callId,
  onChunkProcessed,
}: UseAudioCaptureOptions) {
  const [isCapturing, setIsCapturing]     = useState(false);
  const [error, setError]                 = useState<string | null>(null);
  const [captureSource, setCaptureSource] = useState<CaptureSource>(null);
  const [captureStep, setCaptureStep]     = useState<CaptureStep>("idle");

  const displayStreamRef = useRef<MediaStream | null>(null);
  const micStreamRef     = useRef<MediaStream | null>(null);
  const mergedStreamRef  = useRef<MediaStream | null>(null);
  const audioCtxRef      = useRef<AudioContext | null>(null);
  const recorderRef      = useRef<MediaRecorder | null>(null);
  const chunkIndex       = useRef(0);
  const intervalRef      = useRef<number>();

  const capabilities = useMemo(() => ({
    isMobile:      isMobileDevice(),
    tabAudio:      hasGetDisplayMedia(),
    micAudio:      hasGetUserMedia(),
    mediaRecorder: hasMediaRecorder(),
    webmRecorder:  !!pickWebmMimeType(),
  }), []);

  // ── Stop capture ──────────────────────────────────────────────────────────
  const stopCapture = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    try {
      if (recorderRef.current?.state === "recording") {
        recorderRef.current.stop();
      }
    } catch {}
    displayStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    mergedStreamRef.current?.getTracks().forEach((t) => t.stop());
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    displayStreamRef.current = null;
    micStreamRef.current = null;
    mergedStreamRef.current = null;
    recorderRef.current = null;
    setIsCapturing(false);
    setCaptureSource(null);
    setCaptureStep("idle");
  }, []);

  // ── Process chunks → transcribe-audio edge function ───────────────────────
  const processChunks = useCallback(
    async (chunks: Blob[]) => {
      if (!callId || chunks.length === 0) return;
      const blob = new Blob(chunks, { type: "audio/webm" });
      const arrayBuffer = await blob.arrayBuffer();
      const uint8 = new Uint8Array(arrayBuffer);
      let binary = "";
      for (let i = 0; i < uint8.length; i++) {
        binary += String.fromCharCode(uint8[i]);
      }
      const base64 = btoa(binary);
      try {
        const { data, error } = await supabase.functions.invoke("transcribe-audio", {
          body: {
            call_id: callId,
            audio_base64: base64,
            chunk_index: chunkIndex.current++,
          },
        });
        if (error) {
          console.error("Transcription error:", error);
        } else {
          onChunkProcessed?.(data);
        }
      } catch (err) {
        console.error("Failed to process chunk:", err);
      }
    },
    [callId, onChunkProcessed],
  );

  // ── Start recorder ────────────────────────────────────────────────────────
  const startRecorder = useCallback(
    (stream: MediaStream, source: Exclude<CaptureSource, null>) => {
      const mimeType = pickWebmMimeType()!;
      const audioOnly = new MediaStream(stream.getAudioTracks());
      const recorder = new MediaRecorder(audioOnly, { mimeType });

      recorderRef.current = recorder;
      chunkIndex.current = 0;
      setCaptureSource(source);
      setCaptureStep("active");

      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = () => { if (chunks.length > 0) processChunks(chunks.splice(0)); };

      recorder.start();
      setIsCapturing(true);

      // Rotate chunks every 10s for real-time transcription
      intervalRef.current = window.setInterval(() => {
        const r = recorderRef.current;
        if (!r || r.state !== "recording") return;
        try { r.stop(); r.start(); } catch {}
      }, 10_000);

      stream.getAudioTracks()[0]?.addEventListener("ended", () => {
        stopCapture();
        toast.info("Audio stream ended.");
      });
    },
    [processChunks, stopCapture],
  );

  // ── Main start capture ────────────────────────────────────────────────────
  const startCapture = useCallback(async () => {
    if (!callId) { toast.error("No active call."); return; }
    setError(null);

    if (!capabilities.mediaRecorder || !pickWebmMimeType()) {
      const msg = "Audio recording requires Chrome or Edge on desktop.";
      setError(msg); toast.error(msg); return;
    }

    const mobile = capabilities.isMobile;

    // ── PATH A: Dual stream (desktop — captures both sides) ────────────────
    if (!mobile && capabilities.tabAudio) {
      setCaptureStep("requesting_display");
      let displayStream: MediaStream | null = null;

      try {
        displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          } as any,
        });
      } catch (err: any) {
        if (err?.name === "NotAllowedError") {
          setCaptureStep("idle");
          toast.info("Screen sharing cancelled. Try again when ready.");
          return;
        }
        console.warn("getDisplayMedia failed:", err?.name);
      }

      // Always request mic too so we capture the rep's voice
      setCaptureStep("requesting_mic");
      let micStream: MediaStream | null = null;
      try {
        micStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: false,
        });
      } catch (err: any) {
        console.warn("getUserMedia mic failed:", err?.name);
      }

      const hasDisplayAudio = displayStream && displayStream.getAudioTracks().length > 0;
      const hasMic = micStream && micStream.getAudioTracks().length > 0;

      if (hasDisplayAudio && hasMic) {
        // ✅ BEST: Both sides — merge and record
        displayStreamRef.current = displayStream!;
        micStreamRef.current = micStream!;
        const { merged, ctx } = mergeAudioStreams(displayStream!, micStream!);
        mergedStreamRef.current = merged;
        audioCtxRef.current = ctx;
        startRecorder(merged, "dual");
        toast.success("🎙️ Capturing both sides — full transcription active.");
        return;
      }

      if (hasDisplayAudio && !hasMic) {
        displayStreamRef.current = displayStream!;
        startRecorder(displayStream!, "tab");
        toast.warning("Capturing meeting audio only (mic denied). Your voice won't be transcribed.");
        return;
      }

      if (!hasDisplayAudio && hasMic) {
        // Display shared but no audio ticked — mic-only with helpful message
        displayStream?.getTracks().forEach((t) => t.stop());
        micStreamRef.current = micStream!;
        startRecorder(micStream!, "mic");
        toast.warning(
          "Only your microphone captured. To capture your prospect too: share the tab with your meeting and tick '✓ Share tab audio' in Chrome's prompt.",
          { duration: 10_000 }
        );
        return;
      }

      // Both failed — fall through
      displayStream?.getTracks().forEach((t) => t.stop());
      micStream?.getTracks().forEach((t) => t.stop());
    }

    // ── PATH B: Loopback (Windows Stereo Mix) ──────────────────────────────
    setCaptureStep("requesting_mic");
    try {
      const loopback = await tryLoopbackCapture();
      if (loopback) {
        mergedStreamRef.current = loopback;
        startRecorder(loopback, "loopback");
        toast.success("Capturing system audio — both sides transcribed.");
        return;
      }
    } catch {}

    // ── PATH C: Mic only (last resort) ────────────────────────────────────
    if (capabilities.micAudio) {
      try {
        const micStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: false,
        });
        micStreamRef.current = micStream;
        startRecorder(micStream, "mic");
        toast.warning(
          mobile
            ? "Capturing your microphone only."
            : "Microphone only captured. For both sides: use Chrome, share your meeting tab, and tick 'Share tab audio'.",
          { duration: 8_000 }
        );
        return;
      } catch (err: any) {
        if (err?.name === "NotAllowedError") {
          const msg = "Microphone access denied. Please allow it in browser settings.";
          setError(msg); setCaptureStep("error"); toast.error(msg); return;
        }
      }
    }

    const msg = "Audio capture unavailable. Use Chrome or Edge on desktop.";
    setError(msg); setCaptureStep("error"); toast.error(msg);
  }, [callId, capabilities, startRecorder, stopCapture]);

  // ── Labels ───────────────────────────────────────────────────────────────
  const captureButtonLabel =
    captureStep === "requesting_display" ? "Select your tab…" :
    captureStep === "requesting_mic"     ? "Requesting mic…" :
    capabilities.isMobile
      ? (capabilities.micAudio ? "Start Audio Capture" : "Audio Unsupported")
      : capabilities.tabAudio
        ? "Capture Both Sides"
        : (capabilities.micAudio ? "Capture Mic Audio" : "Audio Unsupported");

  const captureSourceLabel =
    captureSource === "dual"      ? "Both sides captured (full transcription)"
    : captureSource === "tab"     ? "Meeting audio only (mic denied)"
    : captureSource === "loopback"? "System audio — both sides"
    : captureSource === "mic"     ? "Your microphone only"
    : null;

  const isFullCapture = captureSource === "dual" || captureSource === "loopback";

  return {
    isCapturing,
    error,
    captureSource,
    captureSourceLabel,
    captureButtonLabel,
    captureStep,
    isFullCapture,
    capabilities,
    startCapture,
    stopCapture,
  };
}
