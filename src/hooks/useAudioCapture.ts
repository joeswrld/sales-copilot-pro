import { useRef, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface UseAudioCaptureOptions {
  callId: string | null;
  onChunkProcessed?: (result: any) => void;
}

type CaptureSource = "tab" | "mic" | null;

function hasGetDisplayMedia(): boolean {
  return typeof navigator !== "undefined" &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getDisplayMedia === "function";
}

function hasGetUserMedia(): boolean {
  return typeof navigator !== "undefined" &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === "function";
}

function hasMediaRecorder(): boolean {
  return typeof window !== "undefined" && typeof (window as any).MediaRecorder !== "undefined";
}

function pickWebmMimeType(): string | null {
  if (!hasMediaRecorder()) return null;
  // We only send WebM/Opus because the backend transcription pipeline expects it.
  if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) return "audio/webm;codecs=opus";
  if (MediaRecorder.isTypeSupported("audio/webm")) return "audio/webm";
  return null;
}

export function useAudioCapture({ callId, onChunkProcessed }: UseAudioCaptureOptions) {
  const [isCapturing, setIsCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captureSource, setCaptureSource] = useState<CaptureSource>(null);

  // Keep the *original* stream so we can stop all tracks, even if we record audio-only.
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunkIndexRef = useRef(0);
  const intervalRef = useRef<number>();

  const capabilities = useMemo(() => {
    return {
      tabAudio: hasGetDisplayMedia(),
      micAudio: hasGetUserMedia(),
      mediaRecorder: hasMediaRecorder(),
      webmRecorder: !!pickWebmMimeType(),
    };
  }, []);

  const stopCapture = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    try {
      if (recorderRef.current?.state === "recording") {
        recorderRef.current.stop();
      }
    } catch (e) {
      console.warn("Failed stopping recorder:", e);
    }

    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;

    setIsCapturing(false);
    setCaptureSource(null);
  }, []);

  const processChunks = useCallback(
    async (chunks: Blob[]) => {
      if (!callId || chunks.length === 0) return;

      const blob = new Blob(chunks, { type: "audio/webm" });

      // Convert to base64
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
            chunk_index: chunkIndexRef.current++,
          },
        });

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

  const startCapture = useCallback(async () => {
    if (!callId) return;
    setError(null);

    if (!capabilities.mediaRecorder) {
      const msg = "Audio recording is not supported in this browser. Use desktop Chrome/Edge.";
      setError(msg);
      toast.error(msg);
      return;
    }

    const mimeType = pickWebmMimeType();
    if (!mimeType) {
      const msg = "This browser can’t record audio in WebM/Opus. Use desktop Chrome/Edge.";
      setError(msg);
      toast.error(msg);
      return;
    }

    try {
      let source: Exclude<CaptureSource, null>;
      let stream: MediaStream;

      // Prefer tab audio (desktop). On mobile, getDisplayMedia is often missing.
      if (capabilities.tabAudio) {
        source = "tab";
        // Most browsers require `video: true` to show the picker; we record audio-only by extracting audio tracks.
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
        });
      } else if (capabilities.micAudio) {
        source = "mic";
        stream = await navigator.mediaDevices.getUserMedia({
          video: false,
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          } as MediaTrackConstraints,
        });

        toast.info("Tab audio isn’t supported on this device. Capturing microphone audio instead.");
      } else {
        const msg = "Audio capture isn’t supported on this device/browser. Use desktop Chrome/Edge.";
        setError(msg);
        toast.error(msg);
        return;
      }

      streamRef.current = stream;
      chunkIndexRef.current = 0;
      setCaptureSource(source);

      const audioOnlyStream = new MediaStream(stream.getAudioTracks());
      const recorder = new MediaRecorder(audioOnlyStream, { mimeType });
      recorderRef.current = recorder;

      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        if (chunks.length > 0) {
          processChunks(chunks.splice(0));
        }
      };

      // Start recording and rotate every 10 seconds
      recorder.start();
      setIsCapturing(true);

      intervalRef.current = window.setInterval(() => {
        const r = recorderRef.current;
        if (!r) return;

        // Some browsers throw if stop/start is called too quickly; guard on state.
        if (r.state === "recording") {
          try {
            r.stop();
            r.start();
          } catch (e) {
            console.warn("Recorder rotation failed:", e);
          }
        }
      }, 10000);

      // Handle stream ending (user stops sharing / mic unplugged)
      stream.getAudioTracks()[0]?.addEventListener("ended", () => {
        stopCapture();
      });
    } catch (err: any) {
      console.error("Audio capture failed:", err);

      if (err?.name === "NotAllowedError") {
        const msg = capabilities.tabAudio
          ? "Permission denied. Please allow tab audio sharing to enable live transcription."
          : "Permission denied. Please allow microphone access to enable live transcription.";
        setError(msg);
        toast.error(msg);
        return;
      }

      if (err?.name === "NotSupportedError") {
        const msg = "Audio capture isn’t supported on this device/browser. Use desktop Chrome/Edge.";
        setError(msg);
        toast.error(msg);
        return;
      }

      setError(err?.message || "Failed to capture audio");
      toast.error("Failed to start audio capture");
    }
  }, [callId, capabilities, processChunks, stopCapture]);

  return {
    isCapturing,
    error,
    captureSource,
    capabilities,
    startCapture,
    stopCapture,
  };
}

