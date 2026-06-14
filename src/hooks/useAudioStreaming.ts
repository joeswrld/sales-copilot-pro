/**
 * useAudioStreaming.ts — v4
 *
 * Root-cause fixes for the 16:30:48 flood / SW-block pattern:
 *
 *  1. SERIAL QUEUE — chunks are sent one at a time, never in parallel.
 *     When the WSS drops, chunks buffer locally. On reconnect, they drain
 *     at a controlled rate (1 per 600ms) instead of all at once.
 *
 *  2. STALE CHUNK DROP — any chunk buffered > 90s is dropped before sending.
 *     This prevents a 2-minute backlog flooding the edge function on reconnect.
 *
 *  3. QUEUE CAP — max 20 buffered chunks. Oldest are dropped when full.
 *     Prevents memory growth during long disconnections.
 *
 *  4. EXPONENTIAL BACKOFF — on 429 (flood guard) or network error, waits
 *     1s → 2s → 4s → 8s → 16s before retrying (max 16s).
 *
 *  5. SW-SAFE — sends a `sent_at` timestamp with every chunk so the edge
 *     function can drop stale chunks that were held by the service worker.
 *
 *  6. NETWORK DETECTION — pauses queue when navigator.onLine === false,
 *     resumes automatically when online event fires.
 */

import { useRef, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

// ─── Types ────────────────────────────────────────────────────────────────────
interface ChunkJob {
  audioBase64: string;
  chunkIndex: number;
  speakerLabel: string;
  mimeType: string;
  sentAt: string; // ISO timestamp when chunk was created
}

interface AudioStreamingOptions {
  callId: string;
  speakerLabel?: string;
  mimeType?: string;
  onTranscript?: (text: string, speaker: string) => void;
  onAIAnalysis?: (analysis: {
    objections_found: number;
    topics: string[];
    sentiment_delta: number;
    buying_signals: string[];
    coaching_tip: string | null;
  }) => void;
  onError?: (err: string) => void;
}

interface AudioStreamingResult {
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  isRecording: boolean;
  queueLength: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const CHUNK_INTERVAL_MS = 5_000;      // Record in 5s chunks
const MAX_QUEUE_SIZE = 20;            // Drop oldest when full
const STALE_THRESHOLD_MS = 90_000;   // Drop chunks older than 90s
const DRAIN_INTERVAL_MS = 600;       // One chunk every 600ms on drain
const BASE_BACKOFF_MS = 1_000;       // 1s initial backoff
const MAX_BACKOFF_MS = 16_000;       // 16s max backoff

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useAudioStreaming(options: AudioStreamingOptions): AudioStreamingResult {
  const {
    callId,
    speakerLabel = 'You',
    mimeType = 'audio/webm;codecs=opus',
    onTranscript,
    onAIAnalysis,
    onError,
  } = options;

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isRecordingRef = useRef(false);
  const chunkIndexRef = useRef(0);

  // Serial queue
  const queueRef = useRef<ChunkJob[]>([]);
  const isDrainingRef = useRef(false);
  const backoffRef = useRef(BASE_BACKOFF_MS);
  const drainTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Enqueue a chunk ──────────────────────────────────────────────────────
  const enqueue = useCallback((job: ChunkJob) => {
    if (queueRef.current.length >= MAX_QUEUE_SIZE) {
      // Drop oldest (front of queue) to make room
      queueRef.current.shift();
      console.warn('[AudioStreaming] Queue full — dropped oldest chunk');
    }
    queueRef.current.push(job);
  }, []);

  // ── Send one chunk to edge function ─────────────────────────────────────
  const sendChunk = useCallback(async (job: ChunkJob): Promise<'ok' | 'retry' | 'drop'> => {
    // Drop stale chunks (held by SW or queued too long)
    const age = Date.now() - new Date(job.sentAt).getTime();
    if (age > STALE_THRESHOLD_MS) {
      console.log(`[AudioStreaming] Dropping stale chunk ${job.chunkIndex} (${Math.round(age / 1000)}s old)`);
      return 'drop';
    }

    // Don't send if offline
    if (!navigator.onLine) return 'retry';

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return 'retry';

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/transcribe-stream`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            call_id: callId,
            audio_base64: job.audioBase64,
            chunk_index: job.chunkIndex,
            speaker_label: job.speakerLabel,
            mime_type: job.mimeType,
            sent_at: job.sentAt, // lets edge fn drop stale too
          }),
        }
      );

      // Flood guard — back off
      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get('Retry-After') ?? '3', 10) * 1000;
        backoffRef.current = Math.min(retryAfter || backoffRef.current * 2, MAX_BACKOFF_MS);
        return 'retry';
      }

      if (!res.ok) {
        console.warn(`[AudioStreaming] Edge fn ${res.status} for chunk ${job.chunkIndex}`);
        return 'retry';
      }

      const data = await res.json();

      // Reset backoff on success
      backoffRef.current = BASE_BACKOFF_MS;

      if (data.text_preview && onTranscript) {
        onTranscript(data.text_preview, job.speakerLabel);
      }
      if (data.ai_analysis && onAIAnalysis) {
        onAIAnalysis(data.ai_analysis);
      }

      return 'ok';
    } catch (err: any) {
      console.warn(`[AudioStreaming] Network error chunk ${job.chunkIndex}:`, err?.message);
      // Exponential backoff on network errors
      backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS);
      return 'retry';
    }
  }, [callId, onTranscript, onAIAnalysis]);

  // ── Drain queue serially ─────────────────────────────────────────────────
  const drainQueue = useCallback(async () => {
    if (isDrainingRef.current) return;
    isDrainingRef.current = true;

    while (queueRef.current.length > 0) {
      const job = queueRef.current[0];
      const result = await sendChunk(job);

      if (result === 'ok' || result === 'drop') {
        // Remove from queue and move on
        queueRef.current.shift();
        // Brief pause between chunks to avoid burst
        if (queueRef.current.length > 0) {
          await new Promise(r => setTimeout(r, DRAIN_INTERVAL_MS));
        }
      } else {
        // 'retry' — wait backoff then try same chunk again
        console.log(`[AudioStreaming] Backing off ${backoffRef.current}ms before retry`);
        await new Promise(r => setTimeout(r, backoffRef.current));
        // If went offline during backoff, pause drain
        if (!navigator.onLine) break;
      }
    }

    isDrainingRef.current = false;
  }, [sendChunk]);

  // ── Process an audio blob ────────────────────────────────────────────────
  const processBlob = useCallback((blob: Blob, resolvedMime: string) => {
    if (blob.size < 1024) return; // skip silent

    const reader = new FileReader();
    reader.onloadend = () => {
      const b64 = (reader.result as string).split(',')[1];
      if (!b64) return;

      const job: ChunkJob = {
        audioBase64: b64,
        chunkIndex: chunkIndexRef.current++,
        speakerLabel,
        mimeType: resolvedMime,
        sentAt: new Date().toISOString(),
      };

      enqueue(job);
      // Kick off drain (no-op if already draining)
      drainQueue();
    };
    reader.readAsDataURL(blob);
  }, [speakerLabel, enqueue, drainQueue]);

  // ── Start recording ──────────────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    if (isRecordingRef.current) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;

      // Pick best supported mime
      const mimes = [
        'audio/webm;codecs=opus', 'audio/webm',
        'audio/ogg;codecs=opus', 'audio/mp4',
      ];
      const resolvedMime = mimes.find(m => MediaRecorder.isTypeSupported(m)) ?? 'audio/webm';

      const recorder = new MediaRecorder(stream, {
        mimeType: resolvedMime,
        audioBitsPerSecond: 16_000,
      });

      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        if (chunks.length === 0) return;
        const blob = new Blob(chunks, { type: resolvedMime });
        chunks.length = 0;
        processBlob(blob, resolvedMime);
      };

      // Slice into 5s chunks
      recorder.start();
      isRecordingRef.current = true;
      mediaRecorderRef.current = recorder;

      const interval = setInterval(() => {
        if (recorder.state === 'recording') {
          recorder.stop();
          recorder.start();
        }
      }, CHUNK_INTERVAL_MS);

      // Store interval ref for cleanup
      (recorder as any).__interval = interval;

      console.log(`[AudioStreaming] Started recording: ${speakerLabel} (${callId})`);
    } catch (err: any) {
      console.error('[AudioStreaming] getUserMedia failed:', err);
      onError?.(`Microphone access denied: ${err.message}`);
    }
  }, [callId, speakerLabel, processBlob, onError]);

  // ── Stop recording ───────────────────────────────────────────────────────
  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder) {
      clearInterval((recorder as any).__interval);
      if (recorder.state !== 'inactive') recorder.stop();
      mediaRecorderRef.current = null;
    }

    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    isRecordingRef.current = false;

    console.log(`[AudioStreaming] Stopped recording: ${callId}`);
  }, [callId]);

  // ── Online/offline handling ──────────────────────────────────────────────
  useEffect(() => {
    const onOnline = () => {
      console.log('[AudioStreaming] Back online — resuming queue drain');
      backoffRef.current = BASE_BACKOFF_MS; // reset backoff
      drainQueue();
    };
    const onOffline = () => {
      console.log('[AudioStreaming] Offline — pausing queue drain');
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [drainQueue]);

  // ── Cleanup on unmount ───────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      stopRecording();
      if (drainTimerRef.current) clearTimeout(drainTimerRef.current);
    };
  }, [stopRecording]);

  return {
    startRecording,
    stopRecording,
    isRecording: isRecordingRef.current,
    queueLength: queueRef.current.length,
  };
}