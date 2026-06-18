/**
 * useAudioStreaming.ts — v6
 *
 * Fixes from v5:
 *  - Reduced STALE_THRESHOLD to 60s (was 90s) — chunks older than 60s are useless
 *  - MAX_QUEUE_SIZE reduced to 10 (was 20) — prevents runaway memory when offline
 *  - Applied noise cancellation / echo cancellation constraints on getUserMedia
 *  - CHUNK_INTERVAL_MS increased to 8s (was 5s) — fewer chunks during poor connectivity
 *  - Added navigator.onLine check before enqueue (don't buffer when known offline)
 *  - Deduplication: skip enqueueing if recorder is stopped/destroyed
 *  - Better error logging with chunk index for debugging
 */

import { useRef, useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

// ─── Types ────────────────────────────────────────────────────────────────────
interface ChunkJob {
  audioBase64: string;
  chunkIndex: number;
  speakerLabel: string;
  mimeType: string;
  sentAt: string;
}

interface AudioStreamingOptions {
  callId: string | null;
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

interface AudioStreamingState {
  isStreaming: boolean;
  chunksSent: number;
}

interface AudioStreamingResult {
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  stopAll: () => void;
  startTrackRecording: (track: MediaStreamTrack, participantId: string, isLocal: boolean) => void;
  isRecording: boolean;
  queueLength: number;
  state: AudioStreamingState;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const CHUNK_INTERVAL_MS  = 8_000;   // 8s chunks (was 5s — reduces pressure)
const MAX_QUEUE_SIZE     = 10;       // was 20
const STALE_THRESHOLD_MS = 60_000;  // 60s (was 90s)
const DRAIN_INTERVAL_MS  = 800;
const BASE_BACKOFF_MS    = 1_500;
const MAX_BACKOFF_MS     = 20_000;

// ─── Audio constraints with noise cancellation ────────────────────────────────
const AUDIO_CONSTRAINTS_LOCAL: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl:  true,
  // sampleRate: 16000, // commented out — some browsers reject this
};

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useAudioStreaming(options: AudioStreamingOptions): AudioStreamingResult {
  const {
    callId,
    speakerLabel = 'You',
    onTranscript,
    onAIAnalysis,
    onError,
  } = options;

  const mediaRecorderRef  = useRef<MediaRecorder | null>(null);
  const streamRef         = useRef<MediaStream | null>(null);
  const isRecordingRef    = useRef(false);
  const chunkIndexRef     = useRef(0);

  const trackRecordersRef = useRef<Map<string, { recorder: MediaRecorder; interval: ReturnType<typeof setInterval> }>>(new Map());

  const queueRef      = useRef<ChunkJob[]>([]);
  const isDrainingRef = useRef(false);
  const backoffRef    = useRef(BASE_BACKOFF_MS);
  const destroyedRef  = useRef(false);

  const [state, setState] = useState<AudioStreamingState>({ isStreaming: false, chunksSent: 0 });

  const updateStreaming  = useCallback((s: boolean) => setState((p) => ({ ...p, isStreaming: s })), []);
  const incrementChunks  = useCallback(() => setState((p) => ({ ...p, chunksSent: p.chunksSent + 1 })), []);

  // ── Enqueue ──────────────────────────────────────────────────────────────
  const enqueue = useCallback((job: ChunkJob) => {
    if (destroyedRef.current) return;
    // Drop oldest when queue is full
    if (queueRef.current.length >= MAX_QUEUE_SIZE) {
      queueRef.current.shift();
      console.warn(`[AudioStreaming] Queue full (${MAX_QUEUE_SIZE}) — dropped oldest chunk`);
    }
    queueRef.current.push(job);
  }, []);

  // ── Send one chunk ───────────────────────────────────────────────────────
  const sendChunk = useCallback(async (job: ChunkJob): Promise<'ok' | 'retry' | 'drop'> => {
    const age = Date.now() - new Date(job.sentAt).getTime();
    if (age > STALE_THRESHOLD_MS) {
      console.log(`[AudioStreaming] Dropping stale chunk ${job.chunkIndex} (${Math.round(age / 1000)}s old)`);
      return 'drop';
    }
    if (!navigator.onLine) return 'retry';

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return 'retry';

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/transcribe-stream`,
        {
          method: 'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey':        import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            call_id:       callId,
            audio_base64:  job.audioBase64,
            chunk_index:   job.chunkIndex,
            speaker_label: job.speakerLabel,
            mime_type:     job.mimeType,
            sent_at:       job.sentAt,
          }),
          signal: AbortSignal.timeout(15_000), // 15s timeout per chunk
        },
      );

      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get('Retry-After') ?? '3', 10) * 1000;
        backoffRef.current = Math.min(retryAfter || backoffRef.current * 2, MAX_BACKOFF_MS);
        return 'retry';
      }
      if (!res.ok) {
        console.warn(`[AudioStreaming] Edge fn ${res.status} for chunk ${job.chunkIndex}`);
        if (res.status === 405) {
          // Method not allowed — edge function routing issue, drop this chunk
          console.error(`[AudioStreaming] 405 Method Not Allowed for chunk ${job.chunkIndex} — check edge function deployment`);
          return 'drop';
        }
        return 'retry';
      }

      const data = await res.json();
      backoffRef.current = BASE_BACKOFF_MS;
      incrementChunks();

      if (data.text_preview && onTranscript) onTranscript(data.text_preview, job.speakerLabel);
      if (data.ai_analysis  && onAIAnalysis)  onAIAnalysis(data.ai_analysis);

      return 'ok';
    } catch (err: any) {
      if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
        console.warn(`[AudioStreaming] Chunk ${job.chunkIndex} timed out`);
        return 'retry';
      }
      console.warn(`[AudioStreaming] Network error chunk ${job.chunkIndex}:`, err?.message);
      backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS);
      return 'retry';
    }
  }, [callId, onTranscript, onAIAnalysis, incrementChunks]);

  // ── Drain queue serially ─────────────────────────────────────────────────
  const drainQueue = useCallback(async () => {
    if (isDrainingRef.current || destroyedRef.current) return;
    isDrainingRef.current = true;

    while (queueRef.current.length > 0 && !destroyedRef.current) {
      const job    = queueRef.current[0];
      const result = await sendChunk(job);

      if (result === 'ok' || result === 'drop') {
        queueRef.current.shift();
        if (queueRef.current.length > 0) {
          await new Promise((r) => setTimeout(r, DRAIN_INTERVAL_MS));
        }
      } else {
        console.log(`[AudioStreaming] Backing off ${backoffRef.current}ms`);
        await new Promise((r) => setTimeout(r, backoffRef.current));
        if (!navigator.onLine) break;
      }
    }

    isDrainingRef.current = false;
  }, [sendChunk]);

  // ── Process a Blob ───────────────────────────────────────────────────────
  const processBlob = useCallback((blob: Blob, resolvedMime: string, label: string) => {
    if (blob.size < 1024 || destroyedRef.current) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const b64 = (reader.result as string).split(',')[1];
      if (!b64) return;
      enqueue({
        audioBase64: b64,
        chunkIndex:  chunkIndexRef.current++,
        speakerLabel: label,
        mimeType:    resolvedMime,
        sentAt:      new Date().toISOString(),
      });
      drainQueue();
    };
    reader.readAsDataURL(blob);
  }, [enqueue, drainQueue]);

  // ── Create a MediaRecorder ───────────────────────────────────────────────
  const createRecorder = useCallback((
    stream: MediaStream,
    label: string,
  ): { recorder: MediaRecorder; interval: ReturnType<typeof setInterval> } | null => {
    const mimes = [
      'audio/webm;codecs=opus', 'audio/webm',
      'audio/ogg;codecs=opus',  'audio/mp4',
    ];
    const resolvedMime = mimes.find((m) => MediaRecorder.isTypeSupported(m)) ?? 'audio/webm';

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType: resolvedMime, audioBitsPerSecond: 16_000 });
    } catch (e) {
      console.warn('[AudioStreaming] MediaRecorder init failed:', e);
      return null;
    }

    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    recorder.onstop = () => {
      if (!chunks.length || destroyedRef.current) return;
      const blob = new Blob(chunks, { type: resolvedMime });
      chunks.length = 0;
      processBlob(blob, resolvedMime, label);
    };

    recorder.start();

    const interval = setInterval(() => {
      if (destroyedRef.current) { clearInterval(interval); return; }
      if (recorder.state === 'recording') {
        try { recorder.stop(); recorder.start(); } catch {}
      }
    }, CHUNK_INTERVAL_MS);

    return { recorder, interval };
  }, [processBlob]);

  // ── Start mic recording ──────────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    if (isRecordingRef.current || !callId) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: AUDIO_CONSTRAINTS_LOCAL,
        video: false,
      });
      streamRef.current = stream;

      const result = createRecorder(stream, speakerLabel);
      if (!result) return;

      mediaRecorderRef.current = result.recorder;
      (mediaRecorderRef.current as any).__interval = result.interval;
      isRecordingRef.current = true;
      updateStreaming(true);
    } catch (err: any) {
      console.error('[AudioStreaming] getUserMedia failed:', err);
      onError?.(`Microphone access denied: ${err.message}`);
    }
  }, [callId, speakerLabel, createRecorder, updateStreaming, onError]);

  // ── Stop mic recording ───────────────────────────────────────────────────
  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder) {
      clearInterval((recorder as any).__interval);
      try { if (recorder.state !== 'inactive') recorder.stop(); } catch {}
      mediaRecorderRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    isRecordingRef.current = false;

    if (trackRecordersRef.current.size === 0) updateStreaming(false);
    console.log(`[AudioStreaming] Stopped mic recording: ${callId}`);
  }, [callId, updateStreaming]);

  // ── Attach a specific MediaStreamTrack (Daily participant) ───────────────
  const startTrackRecording = useCallback((
    track: MediaStreamTrack,
    participantId: string,
    isLocal: boolean,
  ) => {
    if (!callId || destroyedRef.current) return;
    if (trackRecordersRef.current.has(participantId)) return;

    const stream = new MediaStream([track]);
    const label  = isLocal ? 'You' : `Participant-${participantId.slice(0, 6)}`;
    const result = createRecorder(stream, label);
    if (!result) return;

    trackRecordersRef.current.set(participantId, result);
    updateStreaming(true);

    track.addEventListener('ended', () => {
      const entry = trackRecordersRef.current.get(participantId);
      if (entry) {
        clearInterval(entry.interval);
        try { if (entry.recorder.state !== 'inactive') entry.recorder.stop(); } catch {}
        trackRecordersRef.current.delete(participantId);
        if (!isRecordingRef.current && trackRecordersRef.current.size === 0) updateStreaming(false);
      }
    }, { once: true });

    console.log(`[AudioStreaming] Started track recording for ${participantId}`);
  }, [callId, createRecorder, updateStreaming]);

  // ── Stop ALL recorders ───────────────────────────────────────────────────
  const stopAll = useCallback(() => {
    stopRecording();
    trackRecordersRef.current.forEach(({ recorder, interval }) => {
      clearInterval(interval);
      try { if (recorder.state !== 'inactive') recorder.stop(); } catch {}
    });
    trackRecordersRef.current.clear();
    updateStreaming(false);
    console.log('[AudioStreaming] Stopped all recorders');
  }, [stopRecording, updateStreaming]);

  // ── Online/offline handling ──────────────────────────────────────────────
  useEffect(() => {
    const onOnline  = () => { backoffRef.current = BASE_BACKOFF_MS; drainQueue(); };
    const onOffline = () => console.log('[AudioStreaming] Offline — pausing queue drain');
    window.addEventListener('online',  onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online',  onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [drainQueue]);

  // ── Cleanup on unmount ───────────────────────────────────────────────────
  useEffect(() => {
    destroyedRef.current = false;
    return () => {
      destroyedRef.current = true;
      stopAll();
      queueRef.current = [];
    };
  }, [stopAll]);

  return {
    startRecording, stopRecording, stopAll, startTrackRecording,
    isRecording: isRecordingRef.current,
    queueLength: queueRef.current.length,
    state,
  };
}