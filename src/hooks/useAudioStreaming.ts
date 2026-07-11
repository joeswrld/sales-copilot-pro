/**
 * useAudioStreaming.ts — v7
 *
 * Fixes from v6:
 *  - Cache the access token via onAuthStateChange instead of calling
 *    supabase.auth.getSession() before every single chunk upload. With
 *    multiple recorders running at once (host mic + one per remote track),
 *    each firing every 8s, this was issuing several concurrent gotrue
 *    Web Lock acquisitions per second — the direct cause of the
 *    "Lock ... was not released within 5000ms" console warnings during
 *    live meetings. The lock always recovered on its own, but the
 *    contention was unnecessary: the token only changes on refresh/sign-in.
 *  - Exposed `isReconnecting` (true once we've been backing off for >2
 *    consecutive chunks) so the UI can show a small status indicator
 *    instead of failures being invisible to the user.
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
  isReconnecting: boolean;
}

interface AudioStreamingResult {
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  stopAll: () => void;
  startTrackRecording: (track: MediaStreamTrack, participantId: string, isLocal: boolean) => void;
  flush: (maxWaitMs?: number) => Promise<void>;
  isRecording: boolean;
  queueLength: number;
  state: AudioStreamingState;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const CHUNK_INTERVAL_MS  = 8_000;   // 8s chunks (was 5s — reduces pressure)
// FIX: was 10 (~80s of audio before permanent loss). On a genuinely bad
// connection — the exact scenario this exists to protect — an 80s backlog
// is trivial to hit, and every chunk past it used to be discarded forever,
// which is precisely the "some of what I said never shows up" symptom.
// 150 chunks ≈ 20 minutes of buffered audio at ~20KB each (a few MB total,
// nothing for a browser tab) so a rough patch of network never costs
// permanent data loss.
const MAX_QUEUE_SIZE     = 150;
// FIX: was 60s. A transcript that arrives late is still correct — it's
// ordered by its real `sent_at` timestamp, not by upload order — so there
// is no good reason to throw audio away just because the network took a
// while to recover. 10 minutes is a generous but still finite ceiling that
// only kicks in for a connection that's been down long enough that the
// data is genuinely unrecoverable for practical purposes.
const STALE_THRESHOLD_MS = 10 * 60_000;
const DRAIN_INTERVAL_MS  = 800;
const BASE_BACKOFF_MS    = 1_500;
const MAX_BACKOFF_MS     = 20_000;
// FIX: how long to keep retrying already-queued (but not yet uploaded)
// audio in the background after this hook unmounts — e.g. the host
// navigates away from /live/:id, or the brief window between "End Call"
// and the page navigating to Call Details. The fetch calls themselves
// don't depend on the component staying mounted; this just bounds how long
// we keep the 'online' listener and retry loop alive for a queue that may
// never recover (e.g. the tab genuinely went offline for good).
const BACKGROUND_DRAIN_GRACE_MS = 3 * 60_000;

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
  const retryStreakRef = useRef(0);

  // Cached access token, kept fresh via onAuthStateChange instead of
  // calling supabase.auth.getSession() (which acquires a Web Lock) before
  // every chunk upload. See v7 header note above.
  const accessTokenRef = useRef<string | null>(null);

  const [state, setState] = useState<AudioStreamingState>({ isStreaming: false, chunksSent: 0, isReconnecting: false });

  const updateStreaming  = useCallback((s: boolean) => setState((p) => ({ ...p, isStreaming: s })), []);
  const incrementChunks  = useCallback(() => setState((p) => ({ ...p, chunksSent: p.chunksSent + 1 })), []);
  const setReconnecting  = useCallback((r: boolean) => setState((p) => (p.isReconnecting === r ? p : { ...p, isReconnecting: r })), []);

  // ── Keep the access token cached, refreshed on auth changes only ────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      accessTokenRef.current = session?.access_token ?? null;
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      accessTokenRef.current = session?.access_token ?? null;
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // ── Enqueue ──────────────────────────────────────────────────────────────
  const enqueue = useCallback((job: ChunkJob) => {
    if (destroyedRef.current) return;
    // FIX: was `.shift()` — that evicts index 0, which is exactly the chunk
    // the drain loop is about to send next (FIFO: oldest = next up). Under
    // sustained overflow that means we kept discarding the audio closest to
    // actually being delivered while holding onto newer chunks behind it,
    // scrambling which moments of the conversation survive. Dropping the
    // newest instead preserves chronological continuity from wherever the
    // backlog started, which reads far better as a transcript than random
    // gaps throughout.
    if (queueRef.current.length >= MAX_QUEUE_SIZE) {
      queueRef.current.pop();
      console.warn(`[AudioStreaming] Queue full (${MAX_QUEUE_SIZE}) — dropped newest chunk`);
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
      let token = accessTokenRef.current;
      if (!token) {
        // Cold start / not cached yet — fall back to a direct check just this once.
        const { data: { session } } = await supabase.auth.getSession();
        token = session?.access_token ?? null;
        accessTokenRef.current = token;
      }
      if (!token) return 'retry';

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/transcribe-stream`,
        {
          method: 'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${token}`,
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
      if (res.status === 401) {
        // Cached token is stale — drop it so the next attempt re-fetches a fresh one.
        accessTokenRef.current = null;
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
      if (retryStreakRef.current > 0) { retryStreakRef.current = 0; setReconnecting(false); }
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

  // ── Flush ────────────────────────────────────────────────────────────────
  // Waits until the queue is empty (everything uploaded) or maxWaitMs
  // elapses, whichever comes first. Used before ending a call so the last
  // few seconds of speech get a real chance to upload before the AI summary
  // is generated from the transcript, instead of racing them.
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
        retryStreakRef.current += 1;
        // 2+ consecutive retries (~3-5s of real trouble) is enough to tell
        // the user we're having connectivity issues, without flickering on
        // every single transient blip.
        if (retryStreakRef.current >= 2) setReconnecting(true);
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
    retryStreakRef.current = 0;
    setReconnecting(false);
    console.log('[AudioStreaming] Stopped all recorders');
  }, [stopRecording, updateStreaming, setReconnecting]);

  // ── Online/offline handling ──────────────────────────────────────────────
  useEffect(() => {
    const onOnline  = () => { backoffRef.current = BASE_BACKOFF_MS; drainQueue(); };
    const onOffline = () => console.log('[AudioStreaming] Offline — pausing queue drain');
    window.addEventListener('online',  onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('offline', onOffline);
      // FIX: if there's still unsent audio when this hook unmounts (e.g.
      // the host navigated away from /live/:id), don't immediately rip
      // away the one thing that lets a stalled drain resume the moment the
      // connection comes back. Keep listening for a bounded grace period,
      // or until the queue actually empties, whichever comes first.
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
      // FIX: this used to set destroyedRef.current = true and wipe
      // queueRef here, which silently discarded any recorded-but-not-yet-
      // uploaded audio the instant the page unmounted — most commonly the
      // final few seconds of a call (End Call → summary generation →
      // navigate happens fast) and any time the host simply navigated away
      // from the meeting page. stopAll() below stops the mic/recorders so
      // no *new* audio is captured after unmount, but chunks already
      // queued keep draining in the background: the fetch calls and their
      // retry/backoff loop don't actually depend on this component still
      // being mounted, only on destroyedRef staying false and the queue
      // reference staying intact — both of which we now preserve.
      stopAll();
    };
  }, [stopAll]);

  return {
    startRecording, stopRecording, stopAll, startTrackRecording, flush,
    isRecording: isRecordingRef.current,
    queueLength: queueRef.current.length,
    state,
  };
}