/**
 * useGuestAudioStreaming.ts — v1
 *
 * Guest-side counterpart to useAudioStreaming.ts. GuestJoin.tsx previously had
 * zero transcription wiring: no MediaRecorder, no call to
 * transcribe-guest-stream, so guest (prospect) speech was never transcribed
 * or recorded.
 *
 * This mirrors the host's chunking/queue/backoff behavior in
 * useAudioStreaming.ts as closely as possible, with two differences required
 * by the guest context:
 *
 *  1. Guests never have a Supabase auth session, so there's no
 *     `session.access_token` to send. Authorization instead happens via the
 *     `guest_session_token` minted by guest-request-status on admission
 *     (same token already used to exchange for a Daily meeting token via
 *     get-guest-daily-token). transcribe-guest-stream resolves call_id
 *     server-side from that token via validate_guest_session_token — the
 *     guest page never needs to know its own call_id.
 *  2. Since transcribe-guest-stream has verify_jwt enabled, requests still
 *     need a valid signed JWT in the Authorization header. The publishable
 *     (anon) key satisfies that check for an anonymous guest — same as any
 *     other unauthenticated Supabase call — so it's sent as both `apikey`
 *     and `Authorization: Bearer`.
 *
 * Usage mirrors the host: attach the guest's local Daily audio track via
 * startTrackRecording once it's available and the guest has been admitted.
 */

import { useRef, useCallback, useEffect, useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────
interface ChunkJob {
  audioBase64: string;
  chunkIndex: number;
  mimeType: string;
  sentAt: string;
}

interface GuestAudioStreamingOptions {
  /** Raw guest_session_token from guest-request-status, not the exchanged Daily token. */
  guestToken: string | null;
  onTranscript?: (text: string) => void;
  onError?: (err: string) => void;
}

interface GuestAudioStreamingState {
  isStreaming: boolean;
  chunksSent: number;
}

interface GuestAudioStreamingResult {
  startTrackRecording: (track: MediaStreamTrack) => void;
  stopAll: () => void;
  flush: (maxWaitMs?: number) => Promise<void>;
  state: GuestAudioStreamingState;
}

// ─── Constants — mirrors useAudioStreaming.ts host-side tuning ───────────────
const CHUNK_INTERVAL_MS  = 8_000;
// FIX: was 10 (~80s buffer). See useAudioStreaming.ts host-side comment —
// same reasoning applies to the guest (prospect) side.
const MAX_QUEUE_SIZE     = 150;
// FIX: was 60s — a late transcript is still correct since it's ordered by
// its real timestamp, not upload order.
const STALE_THRESHOLD_MS = 10 * 60_000;
const DRAIN_INTERVAL_MS  = 800;
const BASE_BACKOFF_MS    = 1_500;
const MAX_BACKOFF_MS     = 20_000;
const BACKGROUND_DRAIN_GRACE_MS = 3 * 60_000;

const SUPABASE_URL           = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export function useGuestAudioStreaming(options: GuestAudioStreamingOptions): GuestAudioStreamingResult {
  const { guestToken, onTranscript, onError } = options;

  // Kept current via ref so in-flight closures (recorder callbacks, drain
  // loop) always see the latest token without needing to be torn down and
  // recreated whenever it changes.
  const guestTokenRef = useRef<string | null>(guestToken);
  useEffect(() => { guestTokenRef.current = guestToken; }, [guestToken]);

  const trackRecordersRef = useRef<Map<string, { recorder: MediaRecorder; interval: ReturnType<typeof setInterval> }>>(new Map());
  const chunkIndexRef = useRef(0);

  const queueRef      = useRef<ChunkJob[]>([]);
  const isDrainingRef = useRef(false);
  const backoffRef    = useRef(BASE_BACKOFF_MS);
  const destroyedRef  = useRef(false);

  const [state, setState] = useState<GuestAudioStreamingState>({ isStreaming: false, chunksSent: 0 });
  const updateStreaming = useCallback((s: boolean) => setState((p) => ({ ...p, isStreaming: s })), []);
  const incrementChunks = useCallback(() => setState((p) => ({ ...p, chunksSent: p.chunksSent + 1 })), []);

  // ── Enqueue ──────────────────────────────────────────────────────────────
  const enqueue = useCallback((job: ChunkJob) => {
    if (destroyedRef.current) return;
    // See useAudioStreaming.ts host-side comment — drop the newest, not the
    // oldest/next-to-send, to preserve chronological continuity.
    if (queueRef.current.length >= MAX_QUEUE_SIZE) {
      queueRef.current.pop();
      console.warn(`[GuestAudioStreaming] Queue full (${MAX_QUEUE_SIZE}) — dropped newest chunk`);
    }
    queueRef.current.push(job);
  }, []);

  // ── Send one chunk ───────────────────────────────────────────────────────
  const sendChunk = useCallback(async (job: ChunkJob): Promise<'ok' | 'retry' | 'drop'> => {
    const age = Date.now() - new Date(job.sentAt).getTime();
    if (age > STALE_THRESHOLD_MS) {
      console.log(`[GuestAudioStreaming] Dropping stale chunk ${job.chunkIndex} (${Math.round(age / 1000)}s old)`);
      return 'drop';
    }
    if (!navigator.onLine) return 'retry';

    const guest_token = guestTokenRef.current;
    if (!guest_token) return 'retry'; // not admitted / no token yet — keep buffering briefly

    try {
      const res = await fetch(
        `${SUPABASE_URL}/functions/v1/transcribe-guest-stream`,
        {
          method: 'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
            'apikey':        SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            guest_token,
            audio_base64: job.audioBase64,
            chunk_index:  job.chunkIndex,
            mime_type:    job.mimeType,
            sent_at:      job.sentAt,
          }),
          signal: AbortSignal.timeout(15_000),
        },
      );

      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get('Retry-After') ?? '3', 10) * 1000;
        backoffRef.current = Math.min(retryAfter || backoffRef.current * 2, MAX_BACKOFF_MS);
        return 'retry';
      }
      if (res.status === 401) {
        // Guest session token invalid/expired — dropping further retries for
        // this chunk won't help until admission state changes.
        console.warn(`[GuestAudioStreaming] 401 for chunk ${job.chunkIndex} — invalid/expired guest session`);
        return 'drop';
      }
      if (!res.ok) {
        console.warn(`[GuestAudioStreaming] Edge fn ${res.status} for chunk ${job.chunkIndex}`);
        return 'retry';
      }

      const data = await res.json();
      backoffRef.current = BASE_BACKOFF_MS;
      incrementChunks();

      if (data.text_preview && onTranscript) onTranscript(data.text_preview);

      return 'ok';
    } catch (err: any) {
      if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
        console.warn(`[GuestAudioStreaming] Chunk ${job.chunkIndex} timed out`);
        return 'retry';
      }
      console.warn(`[GuestAudioStreaming] Network error chunk ${job.chunkIndex}:`, err?.message);
      backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS);
      onError?.(err?.message || 'Transcription upload failed');
      return 'retry';
    }
  }, [onTranscript, onError, incrementChunks]);

  // ── Flush ────────────────────────────────────────────────────────────────
  const flush = useCallback((maxWaitMs = 8_000): Promise<void> => {
    return new Promise((resolve) => {
      const startedAt = Date.now();
      const check = () => {
        if (queueRef.current.length === 0 && !isDrainingRef.current) { resolve(); return; }
        if (Date.now() - startedAt >= maxWaitMs) { resolve(); return; }
        setTimeout(check, 250);
      };
      check();
    });
  }, []);

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
        await new Promise((r) => setTimeout(r, backoffRef.current));
        if (!navigator.onLine) break;
      }
    }

    isDrainingRef.current = false;
  }, [sendChunk]);

  // ── Process a Blob ───────────────────────────────────────────────────────
  const processBlob = useCallback((blob: Blob, resolvedMime: string) => {
    if (blob.size < 1024 || destroyedRef.current) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const b64 = (reader.result as string).split(',')[1];
      if (!b64) return;
      enqueue({
        audioBase64: b64,
        chunkIndex:  chunkIndexRef.current++,
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
      console.warn('[GuestAudioStreaming] MediaRecorder init failed:', e);
      return null;
    }

    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    recorder.onstop = () => {
      if (!chunks.length || destroyedRef.current) return;
      const blob = new Blob(chunks, { type: resolvedMime });
      chunks.length = 0;
      processBlob(blob, resolvedMime);
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

  // ── Attach the guest's local Daily audio track ───────────────────────────
  const startTrackRecording = useCallback((track: MediaStreamTrack) => {
    if (destroyedRef.current) return;
    const key = 'guest-local';
    if (trackRecordersRef.current.has(key)) return;

    const stream = new MediaStream([track]);
    const result = createRecorder(stream);
    if (!result) return;

    trackRecordersRef.current.set(key, result);
    updateStreaming(true);

    track.addEventListener('ended', () => {
      const entry = trackRecordersRef.current.get(key);
      if (entry) {
        clearInterval(entry.interval);
        try { if (entry.recorder.state !== 'inactive') entry.recorder.stop(); } catch {}
        trackRecordersRef.current.delete(key);
        if (trackRecordersRef.current.size === 0) updateStreaming(false);
      }
    }, { once: true });

    console.log('[GuestAudioStreaming] Started guest track recording');
  }, [createRecorder, updateStreaming]);

  // ── Stop ALL recorders ───────────────────────────────────────────────────
  const stopAll = useCallback(() => {
    trackRecordersRef.current.forEach(({ recorder, interval }) => {
      clearInterval(interval);
      try { if (recorder.state !== 'inactive') recorder.stop(); } catch {}
    });
    trackRecordersRef.current.clear();
    updateStreaming(false);
    console.log('[GuestAudioStreaming] Stopped all recorders');
  }, [updateStreaming]);

  // ── Online/offline handling ──────────────────────────────────────────────
  useEffect(() => {
    const onOnline = () => { backoffRef.current = BASE_BACKOFF_MS; drainQueue(); };
    window.addEventListener('online', onOnline);
    return () => {
      // See useAudioStreaming.ts host-side comment — keep listening for a
      // bounded grace period so a stalled background drain can still
      // recover after this hook unmounts (e.g. the guest's tab navigates).
      if (queueRef.current.length === 0) {
        window.removeEventListener('online', onOnline);
        return;
      }
      const graceDeadline = window.setTimeout(() => {
        window.removeEventListener('online', onOnline);
        window.clearInterval(emptyPoll);
      }, BACKGROUND_DRAIN_GRACE_MS);
      const emptyPoll = window.setInterval(() => {
        if (queueRef.current.length === 0) {
          window.clearTimeout(graceDeadline);
          window.clearInterval(emptyPoll);
          window.removeEventListener('online', onOnline);
        }
      }, 2_000);
    };
  }, [drainQueue]);

  // ── Cleanup on unmount ───────────────────────────────────────────────────
  useEffect(() => {
    destroyedRef.current = false;
    return () => {
      // FIX: no longer sets destroyedRef.current = true or wipes queueRef —
      // see useAudioStreaming.ts host-side comment for the full reasoning.
      // stopAll() still stops the mic/recorders so no new audio is captured
      // after unmount; anything already queued keeps draining in the
      // background.
      stopAll();
    };
  }, [stopAll]);

  return { startTrackRecording, stopAll, flush, state };
}