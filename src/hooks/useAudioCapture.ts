import { useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface UseAudioCaptureOptions {
  callId: string | null;
  onChunkProcessed?: (result: any) => void;
}

export function useAudioCapture({ callId, onChunkProcessed }: UseAudioCaptureOptions) {
  const [isCapturing, setIsCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunkIndexRef = useRef(0);
  const intervalRef = useRef<number>();

  const startCapture = useCallback(async () => {
    if (!callId) return;
    setError(null);

    try {
      // Request tab audio capture via getDisplayMedia
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: false,
        audio: true,
      });

      streamRef.current = stream;
      chunkIndexRef.current = 0;

      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm",
      });
      recorderRef.current = recorder;

      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      recorder.onstop = () => {
        // Process remaining chunks
        if (chunks.length > 0) {
          processChunks(chunks.splice(0));
        }
      };

      // Process chunks every 10 seconds
      recorder.start();
      setIsCapturing(true);

      intervalRef.current = window.setInterval(() => {
        if (recorder.state === "recording") {
          recorder.stop();
          recorder.start();
        }
      }, 10000);

      // Handle stream ending (user stops sharing)
      stream.getAudioTracks()[0]?.addEventListener("ended", () => {
        stopCapture();
      });
    } catch (err: any) {
      console.error("Audio capture failed:", err);
      if (err.name === "NotAllowedError") {
        setError("Screen sharing permission denied. Please allow tab audio capture.");
        toast.error("Please allow tab audio sharing to enable live transcription");
      } else {
        setError(err.message || "Failed to capture audio");
        toast.error("Failed to start audio capture");
      }
    }
  }, [callId]);

  const processChunks = useCallback(async (chunks: Blob[]) => {
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
  }, [callId, onChunkProcessed]);

  const stopCapture = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
    setIsCapturing(false);
  }, []);

  return {
    isCapturing,
    error,
    startCapture,
    stopCapture,
  };
}
