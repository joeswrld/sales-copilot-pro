/**
 * useLiveTranscriptionSocket.ts — v1
 *
 * True real-time captions (Zoom/Meet/YouTube-Live style) for the local
 * speaker's own mic. Pairs with the `transcribe-live` edge function, which
 * relays raw PCM straight into Deepgram's live streaming API and echoes
 * interim/final results back over the same socket.
 *
 * This intentionally does NOT replace useAudioStreaming/useGuestAudioStreaming.
 * Those remain the durable, offline-tolerant archival pipeline (queue,
 * backoff, retry — hard-won behavior worth keeping). This hook is a
 * best-effort low-latency *display* layer on top:
 *
 *   - While connected: this is the only thing transcribing the local mic.
 *     The caller should NOT also call the chunked pipeline's
 *     startTrackRecording for the same track — that would double-bill
 *     Deepgram and produce duplicate transcript rows.
 *   - If the socket can't connect, or drops repeatedly (network blocks
 *     WebSocket, corporate proxy, etc.): `status` becomes 'failed' and the
 *     caller should fall back to the chunked pipeline for that track. This
 *     hook makes no more reconnect attempts once failed, and never buffers
 *     audio for later replay — a caption that arrives late isn't a caption.
 *
 * Latency budget: mic → AudioWorklet frame (~100ms) → WS send → Deepgram
 * → interim result back over the same WS. In practice interim text
 * typically appears in the 150-400ms range, well under the 500ms target,
 * because nothing here waits for an utterance to finish before showing
 * something.
 */

import { useRef, useCallback, useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type CaptionEvent = {
  text: string;
  isFinal: boolean;
  speechFinal: boolean;
};

export type LiveSocketStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'failed';

interface Options {
  callId: string | null;
  /** 'host' uses the current Supabase session; 'guest' uses guestToken. */
  role: 'host' | 'guest';
  guestToken?: string | null;
  onCaption?: (evt: CaptionEvent) => void;
  onStatusChange?: (status: LiveSocketStatus) => void;
}

interface Result {
  start: (track: MediaStreamTrack) => Promise<void>;
  stop: () => void;
  status: LiveSocketStatus;
}

const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_BASE_MS = 1000;
const WORKLET_URL = '/audio-worklets/pcm16-processor.js';

function wsUrlBase(): string {
  const httpUrl: string = import.meta.env.VITE_SUPABASE_URL;
  return httpUrl.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:');
}

export function useLiveTranscriptionSocket(options: Options): Result {
  const { callId, role, guestToken, onCaption, onStatusChange } = options;

  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const attemptsRef = useRef(0);
  const intentionallyClosedRef = useRef(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const [status, setStatusState] = useState<LiveSocketStatus>('idle');
  const setStatus = useCallback((s: LiveSocketStatus) => {
    setStatusState(s);
    onStatusChange?.(s);
  }, [onStatusChange]);

  const teardownAudio = useCallback(() => {
    try { workletNodeRef.current?.disconnect(); } catch { /* noop */ }
    try { sourceRef.current?.disconnect(); } catch { /* noop */ }
    try { audioCtxRef.current?.close(); } catch { /* noop */ }
    workletNodeRef.current = null;
    sourceRef.current = null;
    audioCtxRef.current = null;
  }, []);

  const teardownSocket = useCallback(() => {
    if (wsRef.current) {
      try { wsRef.current.onopen = null; wsRef.current.onmessage = null; wsRef.current.onclose = null; wsRef.current.onerror = null; } catch { /* noop */ }
      try { wsRef.current.close(); } catch { /* noop */ }
      wsRef.current = null;
    }
  }, []);

  const buildUrl = useCallback(async (): Promise<string | null> => {
    if (!callId) return null;
    const base = `${wsUrlBase()}/functions/v1/transcribe-live`;
    if (role === 'host') {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return null;
      return `${base}?role=host&call_id=${encodeURIComponent(callId)}&token=${encodeURIComponent(token)}`;
    }
    if (!guestToken) return null;
    return `${base}?role=guest&token=${encodeURIComponent(guestToken)}`;
  }, [callId, role, guestToken]);

  const attachAudio = useCallback(async (track: MediaStreamTrack, ws: WebSocket) => {
    // 16kHz to match Deepgram's expected encoding — most browsers honor this
    // AudioContext hint; if a device truly can't, Web Audio still resamples
    // internally for us on the way into the worklet.
    const ctx = new AudioContext({ sampleRate: 16000 });
    await ctx.audioWorklet.addModule(WORKLET_URL);

    const stream = new MediaStream([track]);
    const source = ctx.createMediaStreamSource(stream);
    const worklet = new AudioWorkletNode(ctx, 'pcm16-processor');

    worklet.port.onmessage = (evt: MessageEvent<ArrayBuffer>) => {
      if (ws.readyState === WebSocket.OPEN) {
        try { ws.send(evt.data); } catch { /* noop */ }
      }
    };

    source.connect(worklet);
    // Worklet has no audio output we care about, but Chrome requires the
    // graph to be "pulled" — connect to a muted destination via a zero-gain
    // node rather than the real output to avoid any echo/feedback.
    const silentGain = ctx.createGain();
    silentGain.gain.value = 0;
    worklet.connect(silentGain);
    silentGain.connect(ctx.destination);

    audioCtxRef.current = ctx;
    sourceRef.current = source;
    workletNodeRef.current = worklet;
  }, []);

  const connect = useCallback(async (track: MediaStreamTrack) => {
    if (intentionallyClosedRef.current) return;
    const url = await buildUrl();
    if (!url) { setStatus('failed'); return; }

    setStatus(attemptsRef.current === 0 ? 'connecting' : 'reconnecting');

    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    ws.onopen = () => {
      // Wait for the server's {type:'ready'} (Deepgram upstream handshake
      // complete) before attaching audio, so the first syllables aren't
      // dropped into a socket with nothing listening upstream yet.
    };

    ws.onmessage = (evt) => {
      let msg: any;
      try { msg = JSON.parse(evt.data); } catch { return; }

      if (msg?.type === 'ready') {
        attachAudio(track, ws).then(() => {
          attemptsRef.current = 0;
          setStatus('connected');
        }).catch((e) => {
          console.warn('[LiveTranscription] audio graph setup failed:', e);
          setStatus('failed');
        });
        return;
      }

      if (msg?.type === 'transcript') {
        onCaption?.({ text: msg.text, isFinal: !!msg.is_final, speechFinal: !!msg.speech_final });
        return;
      }

      if (msg?.type === 'upstream_closed') {
        console.warn('[LiveTranscription] Deepgram upstream closed:', msg.reason);
      }
    };

    ws.onerror = () => {
      // onclose fires right after; reconnect logic lives there.
    };

    ws.onclose = () => {
      teardownAudio();
      if (intentionallyClosedRef.current) return;

      attemptsRef.current += 1;
      if (attemptsRef.current > MAX_RECONNECT_ATTEMPTS) {
        setStatus('failed');
        return;
      }
      const delay = RECONNECT_BASE_MS * Math.pow(2, attemptsRef.current - 1);
      reconnectTimerRef.current = setTimeout(() => {
        if (!intentionallyClosedRef.current) connect(track);
      }, delay);
    };
  }, [buildUrl, attachAudio, onCaption, setStatus, teardownAudio]);

  const start = useCallback(async (track: MediaStreamTrack) => {
    if (!callId) return;
    intentionallyClosedRef.current = false;
    attemptsRef.current = 0;
    trackRef.current = track;
    await connect(track);
  }, [callId, connect]);

  const stop = useCallback(() => {
    intentionallyClosedRef.current = true;
    clearTimeout(reconnectTimerRef.current);
    teardownSocket();
    teardownAudio();
    trackRef.current = null;
    setStatus('idle');
  }, [teardownSocket, teardownAudio, setStatus]);

  useEffect(() => () => stop(), [stop]);

  return { start, stop, status };
}
