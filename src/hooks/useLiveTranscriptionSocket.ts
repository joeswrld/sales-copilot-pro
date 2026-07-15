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
 *   - If the socket can't connect, or drops repeatedly, it cycles through
 *     several cooldown-and-retry bursts (status: 'reconnecting') before
 *     finally giving up — see MAX_FAILURE_CYCLES below. Only once that's
 *     exhausted does `status` become 'failed', at which point the caller
 *     should fall back to the chunked pipeline for that track. This hook
 *     never buffers audio for later replay — a caption that arrives late
 *     isn't a caption.
 *
 * Latency budget: mic → AudioWorklet frame (~100ms) → WS send → Deepgram
 * → interim result back over the same WS. In practice interim text
 * typically appears in the 150-400ms range, well under the 500ms target,
 * because nothing here waits for an utterance to finish before showing
 * something.
 */

import { useRef, useCallback, useState, useEffect } from 'react';

export type CaptionEvent = {
  text: string;
  isFinal: boolean;
  speechFinal: boolean;
};

export type LiveSocketStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'failed';

interface Options {
  callId: string | null;
  /** 'host' uses accessToken; 'guest' uses guestToken. */
  role: 'host' | 'guest';
  guestToken?: string | null;
  /**
   * FIX: the host's Supabase access token, read directly from AuthContext's
   * already-resolved session — NOT fetched here via supabase.auth.getSession().
   *
   * This hook used to call getSession() itself on every connect/reconnect
   * attempt. In practice the live meeting page mounts half a dozen hooks
   * (auth, team, profile, status, audio streaming, this one) that all touch
   * gotrue around the same moment, and they contend for gotrue's internal
   * navigator-lock. Real observed behavior: "Lock ... was not released
   * within 5000ms ... Forcefully acquiring the lock to recover" — meaning a
   * getSession() call here could block for 5+ seconds. With only 3 retries
   * on a 1s/2s/4s backoff (~7s total), the socket burned through its whole
   * retry budget waiting on a contended lock and gave up before ever
   * reaching the server — captions silently never worked, no server-side
   * trace at all, and the fallback chunked pipeline was the only thing that
   * (partially) ran.
   *
   * Reading the token from AuthContext's React state is synchronous and
   * lock-free, since AuthProvider already resolved it once at app startup
   * and keeps it current via onAuthStateChange.
   */
  accessToken?: string | null;
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

// FIX: previously, once a *single* burst of MAX_RECONNECT_ATTEMPTS (3
// attempts / ~7s) was exhausted, this hook set status: 'failed' for good —
// permanent, for the rest of the call, no matter what caused the drop. In
// production this meant a single transient hiccup (Deepgram's relay doing
// its own reconnect, a momentary network blip, a backgrounded tab throttling
// timers) could kill live captions after capturing only the first sentence,
// even though the underlying mic track and network recovered seconds later.
// Confirmed in the transcripts table: a real host call with exactly one row
// ("Hello,") and nothing after it, while the call continued for minutes.
//
// A single connection attempt failing for a real, permanent reason (bad
// auth, no such call) fails fast within one burst same as before — this
// only changes what happens *after* a burst is exhausted. Instead of giving
// up, the hook now waits out a cooldown and starts a fresh burst, up to
// MAX_FAILURE_CYCLES times. Status is reported as 'reconnecting' throughout
// (not 'failed') so the LiveMeeting.tsx fallback-to-chunked-pipeline effect
// (which keys off status === 'failed') doesn't fire prematurely for what's
// likely a recoverable blip. Only once every cycle is exhausted — around
// 8 cycles * (~7s bursts + 15s cooldowns) ≈ 3 minutes of a socket that
// simply cannot stay connected — does status finally become 'failed' and
// hand off to the durable chunked recorder for the rest of the call.
const MAX_FAILURE_CYCLES = 8;
const FAILURE_COOLDOWN_MS = 15_000;

function wsUrlBase(): string {
  const httpUrl: string = import.meta.env.VITE_SUPABASE_URL;
  return httpUrl.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:');
}

export function useLiveTranscriptionSocket(options: Options): Result {
  const { callId, role, guestToken, accessToken, onCaption, onStatusChange } = options;

  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const attemptsRef = useRef(0);
  const failureCyclesRef = useRef(0);
  const intentionallyClosedRef = useRef(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const cooldownTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const [status, setStatusState] = useState<LiveSocketStatus>('idle');
  const setStatus = useCallback((s: LiveSocketStatus) => {
    setStatusState(s);
    onStatusChange?.(s);
  }, [onStatusChange]);

  // FIX v2: don't call supabase.auth.getSession() (or onAuthStateChange) in
  // this hook at all anymore — that was still hitting gotrue's Web Lock
  // even when cached via a ref, because the *first* population of that
  // cache was itself a getSession() call racing against every other hook on
  // this page doing the same thing. Observed in production: gotrue's lock
  // not releasing within 5000ms, well past this socket's entire 3-attempt
  // retry budget (~7s), so the live-caption socket gave up before ever
  // reaching the server — with zero server-side trace, since it never got
  // far enough to open the WebSocket.
  //
  // AuthContext already holds the resolved session in React state and keeps
  // it current via its own single onAuthStateChange subscription. Reading
  // the token from there (passed in as `accessToken`) is synchronous, free,
  // and doesn't touch gotrue's lock at all.
  const accessTokenRef = useRef<string | null>(accessToken ?? null);
  useEffect(() => {
    accessTokenRef.current = accessToken ?? null;
  }, [accessToken]);

  // FIX: same class of bug as accessToken above, but for callId/guestToken.
  // buildUrl() (below) used to close over `callId`/`guestToken` directly.
  // The very first time a track becomes available on the host side,
  // `daily.participants` can populate before the `calls` row lookup
  // (useLiveCall's liveCallQuery) has finished its network round trip, so
  // `callId` is still null/undefined at that instant. That first call to
  // start()/connect() spawns a `connect` closure bound to that stale null
  // callId, and — because the reconnect setTimeout below calls `connect`
  // recursively on ITSELF, not a freshly-read one from React state — every
  // retry in that backoff chain kept reusing the same stale closure with
  // callId still null, even after the real callId showed up moments later
  // and this hook re-rendered with a brand-new (correct) `connect`
  // function that nothing was calling anymore. Net effect: buildUrl()
  // returned null on all 3 retry attempts, the hook gave up after ~7s, and
  // the host's own mic was never transcribed for the rest of the call —
  // confirmed in production logs: zero `role=host` requests ever reached
  // transcribe-live for the affected call, while `role=guest` connections
  // (which don't depend on callId at all) worked immediately.
  //
  // Reading callId/guestToken from refs instead means every retry —
  // regardless of which render's closure is technically running it — sees
  // whatever the latest value actually is at the moment it fires.
  const callIdRef = useRef<string | null>(callId ?? null);
  useEffect(() => {
    callIdRef.current = callId ?? null;
  }, [callId]);
  const guestTokenRef = useRef<string | null>(guestToken ?? null);
  useEffect(() => {
    guestTokenRef.current = guestToken ?? null;
  }, [guestToken]);

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
    // FIX: read the live call id / guest token off the refs above (kept in
    // sync with the latest props via effects) instead of closing over the
    // `callId`/`guestToken` values from whichever render spawned this
    // particular `connect` closure — see the doc comment on those refs for
    // why that staleness was silently killing host captions for an entire
    // call. This makes every retry attempt — even ones running inside a
    // long-lived recursive setTimeout chain — check the CURRENT value.
    const liveCallId = callIdRef.current;
    if (!liveCallId) return null;
    const base = `${wsUrlBase()}/functions/v1/transcribe-live`;
    if (role === 'host') {
      // No getSession() fallback here anymore — accessTokenRef is kept in
      // sync with AuthContext's `accessToken` prop via the effect above,
      // which is already resolved React state, not a fresh gotrue call. If
      // it's still null this is a genuine "not signed in yet" case, and the
      // existing retry/backoff loop below will pick it up as soon as
      // AuthContext resolves and the prop change re-renders this hook.
      const token = accessTokenRef.current;
      if (!token) return null;
      return `${base}?role=host&call_id=${encodeURIComponent(liveCallId)}&token=${encodeURIComponent(token)}`;
    }
    const gToken = guestTokenRef.current;
    if (!gToken) return null;
    return `${base}?role=guest&token=${encodeURIComponent(gToken)}`;
  }, [role]);

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

  // FIX: called whenever one burst of MAX_RECONNECT_ATTEMPTS is exhausted,
  // from either give-up point below. Instead of setting 'failed' outright,
  // this waits out FAILURE_COOLDOWN_MS and starts a fresh burst — up to
  // MAX_FAILURE_CYCLES times — so a transient drop mid-call recovers on its
  // own instead of permanently killing captions after the first sentence.
  // See the MAX_FAILURE_CYCLES doc comment above for the full reasoning.
  const exhaustBurst = useCallback((track: MediaStreamTrack, reason: string) => {
    failureCyclesRef.current += 1;
    if (failureCyclesRef.current > MAX_FAILURE_CYCLES) {
      console.warn(`[LiveTranscription] Giving up for real after ${MAX_FAILURE_CYCLES} failure cycles (${reason}) — falling back to chunked pipeline`);
      setStatus('failed');
      return;
    }
    console.warn(`[LiveTranscription] Burst exhausted (${reason}) — cooling down ${FAILURE_COOLDOWN_MS}ms before failure cycle ${failureCyclesRef.current}/${MAX_FAILURE_CYCLES}`);
    setStatus('reconnecting');
    cooldownTimerRef.current = setTimeout(() => {
      if (intentionallyClosedRef.current) return;
      attemptsRef.current = 0;
      connect(track);
    }, FAILURE_COOLDOWN_MS);
  }, []); // eslint-disable-line

  const connect = useCallback(async (track: MediaStreamTrack) => {
    if (intentionallyClosedRef.current) return;
    const url = await buildUrl();
    if (!url) {
      // FIX: previously set 'failed' immediately here with zero retries —
      // a session that just hasn't hydrated yet on the very first attempt
      // (right after the meeting page mounts) permanently killed live
      // captions for the whole call instead of trying again a moment
      // later. Route this through the same backoff/retry path as a
      // dropped socket so a transient "no token yet" only costs one
      // reconnect attempt, not the whole feature.
      //
      // FIX: this branch used to be completely silent — no console output
      // at all — which is exactly why the gotrue-lock bug took a full
      // console-log capture to track down instead of one glance at the
      // logs. Now it's visible immediately if it ever happens again.
      attemptsRef.current += 1;
      console.warn(`[LiveTranscription] No URL yet (role=${role}, has_token=${!!accessTokenRef.current}, has_call=${!!callId}) — attempt ${attemptsRef.current}/${MAX_RECONNECT_ATTEMPTS}`);
      if (attemptsRef.current > MAX_RECONNECT_ATTEMPTS) {
        exhaustBurst(track, 'no valid connect URL after all retries in this burst');
        return;
      }
      const delay = RECONNECT_BASE_MS * Math.pow(2, attemptsRef.current - 1);
      reconnectTimerRef.current = setTimeout(() => {
        if (!intentionallyClosedRef.current) connect(track);
      }, delay);
      return;
    }

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
          failureCyclesRef.current = 0;
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
        exhaustBurst(track, 'socket kept dropping after all retries in this burst');
        return;
      }
      const delay = RECONNECT_BASE_MS * Math.pow(2, attemptsRef.current - 1);
      reconnectTimerRef.current = setTimeout(() => {
        if (!intentionallyClosedRef.current) connect(track);
      }, delay);
    };
  }, [buildUrl, attachAudio, onCaption, setStatus, teardownAudio]);

  // FIX: this used to bail out immediately if `callId` wasn't populated
  // yet (`if (!callId) return;`) — a no-op, not even a 'failed' status.
  // On the host side, the local Daily audio track routinely becomes
  // available before useLiveCall's `calls` row lookup finishes its
  // network round trip, so `callId` was still null right when the caller
  // (LiveMeeting.tsx's track-attach effect) called this. Since that
  // effect only calls start() once per (session_id + track.id) — see its
  // own doc comment — this silent no-op meant live captions (AND the
  // chunked fallback, which only ever triggers off `status === 'failed'`)
  // never started for the rest of the call. connect() already has a
  // dedicated "no URL yet, retry with backoff" path for exactly this
  // race — go straight there instead of skipping it.
  const start = useCallback(async (track: MediaStreamTrack) => {
    intentionallyClosedRef.current = false;
    attemptsRef.current = 0;
    failureCyclesRef.current = 0;
    clearTimeout(cooldownTimerRef.current);
    trackRef.current = track;
    await connect(track);
  }, [connect]);

  const stop = useCallback(() => {
    intentionallyClosedRef.current = true;
    clearTimeout(reconnectTimerRef.current);
    clearTimeout(cooldownTimerRef.current);
    teardownSocket();
    teardownAudio();
    trackRef.current = null;
    setStatus('idle');
  }, [teardownSocket, teardownAudio, setStatus]);

  useEffect(() => () => stop(), [stop]);

  return { start, stop, status };
}