/**
 * useAudioCapture.ts — v2
 *
 * Improved capture fallback chain:
 *   1. getDisplayMedia (desktop only — captures tab audio incl. both sides)
 *   2. Loopback / Stereo Mix device (Windows — captures all system audio)
 *   3. getUserMedia mic (universal fallback — captures rep only)
 *
 * Mobile behavior:
 *   Skips display media entirely.
 *   Tries loopback, then falls back to mic.
 *
 * Bot architecture note:
 *   When a bot-based capture backend is available, startCapture() should
 *   first attempt to trigger the bot via the join-meeting-bot edge function.
 *   The current implementation is the device-side fallback for when the bot
 *   is unavailable or the meeting hasn't started yet.
 */

import { useRef, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

interface UseAudioCaptureOptions {
  callId: string | null;
  onChunkProcessed?: (result: any) => void;
}

type CaptureSource = "tab" | "loopback" | "mic" | null;

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

// ─── Loopback capture ─────────────────────────────────────────────────────────

/**
 * Attempts to capture a Windows "Stereo Mix" or virtual loopback device.
 * These devices capture all system audio output (both sides of a call).
 * Returns null if no loopback device is found or permission is denied.
 */
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

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId:        { exact: loopbackDevice.deviceId },
        echoCancellation: false, // must be off for loopback
        noiseSuppression: false,
        autoGainControl:  false,
      },
      video: false,
    });

    return stream;
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

  const streamRef   = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunkIndex  = useRef(0);
  const intervalRef = useRef<number>();

  // ── Capabilities ────────────────────────────────────────────────────────
  const capabilities = useMemo(() => {
    const mobile      = isMobileDevice();
    const tabAudio    = hasGetDisplayMedia();
    const micAudio    = hasGetUserMedia();
    const mrSupported = hasMediaRecorder();
    const webmSupport = !!pickWebmMimeType();

    return {
      isMobile:      mobile,
      tabAudio,
      micAudio,
      mediaRecorder: mrSupported,
      webmRecorder:  webmSupport,
      // Loopback availability can only be determined after getUserMedia permission
      loopback:      micAudio,
    };
  }, []);

  // ── Stop capture ──────────────────────────────────────────────────────────
  const stopCapture = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);

    try {
      if (recorderRef.current?.state === "recording") {
        recorderRef.current.stop();
      }
    } catch (e) {
      console.warn("Recorder stop error:", e);
    }

    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current   = null;
    recorderRef.current = null;

    setIsCapturing(false);
    setCaptureSource(null);
  }, []);

  // ── Process audio chunks ──────────────────────────────────────────────────
  const processChunks = useCallback(
    async (chunks: Blob[]) => {
      if (!callId || chunks.length === 0) return;

      const blob        = new Blob(chunks, { type: "audio/webm" });
      const arrayBuffer = await blob.arrayBuffer();
      const uint8       = new Uint8Array(arrayBuffer);

      let binary = "";
      for (let i = 0; i < uint8.length; i++) {
        binary += String.fromCharCode(uint8[i]);
      }
      const base64 = btoa(binary);

      try {
        const { data, error } = await supabase.functions.invoke(
          "transcribe-audio",
          {
            body: {
              call_id:      callId,
              audio_base64: base64,
              chunk_index:  chunkIndex.current++,
            },
          },
        );

        if (error) {
          console.error("Transcription error:", error);
        } else {
          onChunkProcessed?.(data);
        }
      } catch (err) {
        console.error("Failed to process audio chunk:", err);
      }
    },
    [callId, onChunkProcessed],
  );

  // ── Start recorder from a stream ─────────────────────────────────────────
  const startRecorder = useCallback(
    (stream: MediaStream, source: Exclude<CaptureSource, null>) => {
      const mimeType = pickWebmMimeType()!;
      const audioOnlyStream = new MediaStream(stream.getAudioTracks());
      const recorder        = new MediaRecorder(audioOnlyStream, { mimeType });

      recorderRef.current = recorder;
      chunkIndex.current  = 0;
      setCaptureSource(source);

      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        if (chunks.length > 0) {
          processChunks(chunks.splice(0));
        }
      };

      recorder.start();
      setIsCapturing(true);

      // Rotate every 10 seconds
      intervalRef.current = window.setInterval(() => {
        const r = recorderRef.current;
        if (!r) return;
        if (r.state === "recording") {
          try {
            r.stop();
            r.start();
          } catch (e) {
            console.warn("Recorder rotation error:", e);
          }
        }
      }, 10_000);

      // Handle stream ending (share stopped, mic unplugged, etc.)
      stream.getAudioTracks()[0]?.addEventListener("ended", () => {
        stopCapture();
        toast.info("Audio stream ended — capture stopped.");
      });
    },
    [processChunks, stopCapture],
  );

  // ── Main start capture ────────────────────────────────────────────────────
  const startCapture = useCallback(async () => {
    if (!callId) return;
    setError(null);

    if (!capabilities.mediaRecorder) {
      const msg =
        "Audio recording is not supported in this browser. Use Chrome or Edge on desktop.";
      setError(msg);
      toast.error(msg);
      return;
    }

    if (!pickWebmMimeType()) {
      const msg =
        "This browser cannot record audio in WebM/Opus format. Use Chrome or Edge.";
      setError(msg);
      toast.error(msg);
      return;
    }

    const mobile = capabilities.isMobile;

    // ── Attempt 1: Tab / Display audio (desktop only) ─────────────────
    if (!mobile && capabilities.tabAudio) {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,  // required by most browsers to show the picker
          audio: true,
        });

        // Check audio tracks actually exist (user might have shared screen without audio)
        if (stream.getAudioTracks().length === 0) {
          stream.getTracks().forEach((t) => t.stop());
          toast.warning(
            "No audio was captured. Please tick 'Share tab audio' when sharing your screen.",
          );
          // Fall through to loopback / mic
        } else {
          streamRef.current = stream;
          startRecorder(stream, "tab");
          return; // ✅ success
        }
      } catch (err: any) {
        if (err?.name === "NotAllowedError") {
          // User cancelled the picker — don't fall through, respect their choice
          toast.info("Tab audio sharing was cancelled.");
          return;
        }
        // Other errors (NotSupportedError, etc.) — fall through to next method
        console.warn("displayMedia failed, trying loopback:", err.name);
      }
    }

    // ── Attempt 2: Loopback / Stereo Mix (captures both sides on Windows) ─
    try {
      const loopbackStream = await tryLoopbackCapture();
      if (loopbackStream) {
        streamRef.current = loopbackStream;
        startRecorder(loopbackStream, "loopback");
        toast.success("Capturing system audio via Stereo Mix.");
        return; // ✅ success
      }
    } catch {
      // silently continue
    }

    // ── Attempt 3: Microphone (universal fallback) ────────────────────
    if (capabilities.micAudio) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression:  true,
            autoGainControl:   true,
          },
          video: false,
        });

        streamRef.current = stream;
        startRecorder(stream, "mic");

        // Inform the user they're only capturing their own audio
        if (mobile) {
          toast.info("Capturing microphone audio. Only your voice will be transcribed.");
        } else {
          toast.warning(
            "Tab audio unavailable — capturing microphone only. " +
            "For two-sided transcription, use Chrome and share your tab with audio.",
          );
        }
        return; // ✅ success (partial)
      } catch (err: any) {
        if (err?.name === "NotAllowedError") {
          const msg = "Microphone access denied. Please allow microphone access in your browser settings.";
          setError(msg);
          toast.error(msg);
          return;
        }
        const msg = `Microphone capture failed: ${err?.message ?? "unknown error"}`;
        setError(msg);
        toast.error(msg);
        return;
      }
    }

    // ── All methods failed ─────────────────────────────────────────────
    const msg =
      "Audio capture is not available on this device or browser. " +
      "Please use Chrome or Edge on desktop for the best experience.";
    setError(msg);
    toast.error(msg);
  }, [callId, capabilities, startRecorder, stopCapture]);

  // ── Friendly labels for UI ────────────────────────────────────────────────
  const captureButtonLabel = capabilities.isMobile
    ? capabilities.micAudio
      ? "Start Audio Capture"
      : "Audio Unsupported"
    : capabilities.tabAudio
      ? "Share Tab Audio"
      : capabilities.micAudio
        ? "Share Mic Audio"
        : "Audio Unsupported";

  const captureSourceLabel =
    captureSource === "tab"      ? "Tab audio (both sides)"
    : captureSource === "loopback" ? "System audio (both sides)"
    : captureSource === "mic"      ? "Microphone only"
    : null;

  return {
    isCapturing,
    error,
    captureSource,
    captureSourceLabel,
    captureButtonLabel,
    capabilities,
    startCapture,
    stopCapture,
  };
}
