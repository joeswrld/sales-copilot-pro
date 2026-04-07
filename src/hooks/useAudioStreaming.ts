/**
 * useAudioStreaming.ts
 *
 * Real-time audio streaming architecture:
 *  - Captures audio from Daily.co participant tracks (no bot needed)
 *  - Chunks audio into 3-second blobs
 *  - Sends to transcribe-stream edge function
 *  - Updates Supabase transcripts / objections / topics in real-time
 *
 * NO MeetingBaas. NO webhooks. NO external bot.
 * Pure: Daily audio tracks → MediaRecorder → edge function → DB → UI
 */

import { useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface StreamingState {
  isStreaming: boolean;
  chunksSent: number;
  error: string | null;
}

export interface UseAudioStreamingOptions {
  callId: string | null;
  onTranscriptChunk?: (data: { transcript_count: number; engagement_score: number }) => void;
}

const CHUNK_INTERVAL_MS = 3000; // 3-second chunks for ~3s latency

function pickMimeType(): string {
  const types = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];
  for (const t of types) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) return t;
  }
  return "audio/webm";
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export function useAudioStreaming({ callId, onTranscriptChunk }: UseAudioStreamingOptions) {
  const [state, setState] = useState<StreamingState>({
    isStreaming: false,
    chunksSent: 0,
    error: null,
  });

  // Map of session_id → { recorder, stream, label }
  const recordersRef = useRef<
    Map<
      string,
      {
        recorder: MediaRecorder;
        stream: MediaStream;
        label: string;
        chunkIndex: number;
        chunks: Blob[];
        intervalId: number;
      }
    >
  >(new Map());

  const chunkCountRef = useRef(0);

  // ── Send a single chunk to the edge function ────────────────────────────────
  const sendChunk = useCallback(
    async (blob: Blob, sessionId: string, label: string, chunkIndex: number) => {
      if (!callId || blob.size < 100) return; // skip silent/tiny chunks

      try {
        const base64 = await blobToBase64(blob);
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;

        const { data, error } = await supabase.functions.invoke("transcribe-stream", {
          headers: { Authorization: `Bearer ${session.access_token}` },
          body: {
            call_id: callId,
            audio_base64: base64,
            chunk_index: chunkIndex,
            speaker_id: sessionId,
            speaker_label: label,
          },
        });

        if (error) {
          console.warn("Transcription chunk error:", error);
          return;
        }

        chunkCountRef.current += 1;
        setState((prev) => ({ ...prev, chunksSent: chunkCountRef.current }));
        onTranscriptChunk?.(data);
      } catch (e) {
        console.warn("sendChunk error:", e);
      }
    },
    [callId, onTranscriptChunk]
  );

  // ── Start recording a single participant's audio track ──────────────────────
  const startTrackRecording = useCallback(
    (track: MediaStreamTrack, sessionId: string, isLocal: boolean) => {
      if (!callId) return;
      if (recordersRef.current.has(sessionId)) return; // already recording

      const label = isLocal ? "You" : "Prospect";

      try {
        const stream = new MediaStream([track]);
        const mimeType = pickMimeType();
        const recorder = new MediaRecorder(stream, { mimeType });
        const chunks: Blob[] = [];
        let chunkIndex = 0;

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };

        recorder.onstop = () => {
          if (chunks.length > 0) {
            const blob = new Blob([...chunks], { type: mimeType });
            chunks.length = 0;
            sendChunk(blob, sessionId, label, chunkIndex++);
          }
        };

        recorder.start();

        // Rotate every CHUNK_INTERVAL_MS
        const intervalId = window.setInterval(() => {
          const r = recordersRef.current.get(sessionId);
          if (!r || r.recorder.state !== "recording") return;
          try {
            r.recorder.stop();
            r.recorder.start();
            r.chunkIndex = chunkIndex;
          } catch (_) {}
        }, CHUNK_INTERVAL_MS);

        recordersRef.current.set(sessionId, {
          recorder,
          stream,
          label,
          chunkIndex,
          chunks,
          intervalId,
        });

        console.log(`[AudioStreaming] Started recording: ${label} (${sessionId})`);
        setState((prev) => ({ ...prev, isStreaming: true, error: null }));
      } catch (e: any) {
        console.error("[AudioStreaming] Failed to start recording for", sessionId, e);
        setState((prev) => ({ ...prev, error: e.message }));
      }
    },
    [callId, sendChunk]
  );

  // ── Stop recording a single participant ────────────────────────────────────
  const stopTrackRecording = useCallback((sessionId: string) => {
    const entry = recordersRef.current.get(sessionId);
    if (!entry) return;

    clearInterval(entry.intervalId);
    try {
      if (entry.recorder.state === "recording") {
        entry.recorder.stop();
      }
    } catch (_) {}
    entry.stream.getTracks().forEach((t) => t.stop());
    recordersRef.current.delete(sessionId);

    if (recordersRef.current.size === 0) {
      setState((prev) => ({ ...prev, isStreaming: false }));
    }

    console.log(`[AudioStreaming] Stopped recording: ${sessionId}`);
  }, []);

  // ── Stop all recordings ────────────────────────────────────────────────────
  const stopAll = useCallback(() => {
    for (const sessionId of recordersRef.current.keys()) {
      stopTrackRecording(sessionId);
    }
    setState({ isStreaming: false, chunksSent: chunkCountRef.current, error: null });
  }, [stopTrackRecording]);

  return {
    state,
    startTrackRecording,
    stopTrackRecording,
    stopAll,
  };
}