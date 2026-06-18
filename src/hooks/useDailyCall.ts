/**
 * useDailyCall.ts — v16
 *
 * Fixes from v15:
 *  - CRITICAL: Fixed "Cannot read properties of undefined (reading 'cssFile')"
 *    crash that prevented joining meetings.
 *
 *    Root cause: Daily.co's bundle uses a lazy CSS-injection mechanism. The
 *    `_cssFile` internal property is undefined until Daily finishes its own
 *    bootstrap. The v15 singleton called `DailyIframe.getCallInstance()` and
 *    `DailyIframe.createCallObject()` synchronously at module-load time (or
 *    immediately on first render), which races with the SDK's bootstrap in
 *    Vite/React environments — producing the cssFile crash before any join
 *    attempt even starts.
 *
 *    Fix: `ensureDailySDKReady()` — polls until `DailyIframe.supported` is a
 *    function (Daily sets this synchronously after its CSS map is populated).
 *    `getOrCreateCallObject` is now `async` and awaits this guard before ANY
 *    DailyIframe API call. `destroyForeignCallInstance` does the same.
 *    `scheduleTransportReconnect` also awaits the async version.
 *
 *  - All other v15 behaviour preserved: noise-cancellation via Daily events,
 *    self-heal grace window, parallel token+callObject warmup, early
 *    local-audio-ready signal, exp-room handling.
 */

import { useRef, useState, useCallback, useEffect } from "react";
import DailyIframe from "@daily-co/daily-js";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ─── SDK readiness guard ───────────────────────────────────────────────────────
// Daily.co lazily populates its internal CSS injection map (_cssFile) during
// its own bootstrap. Calling createCallObject() before that completes throws:
//   TypeError: Cannot read properties of undefined (reading 'cssFile')
// We poll until DailyIframe.supported is a function, which Daily sets
// synchronously right after its bootstrap finishes. Fails open after 4s so
// we don't block forever on unsupported environments.
let _sdkReady = false;
let _sdkReadyPromise: Promise<void> | null = null;

function ensureDailySDKReady(timeoutMs = 4000): Promise<void> {
  if (_sdkReady) return Promise.resolve();
  if (_sdkReadyPromise) return _sdkReadyPromise;

  _sdkReadyPromise = new Promise<void>((resolve) => {
    // Fast path — SDK already bootstrapped
    if (typeof (DailyIframe as any)?.supported === "function") {
      _sdkReady = true;
      resolve();
      return;
    }
    const start = Date.now();
    const id = setInterval(() => {
      if (
        typeof (DailyIframe as any)?.supported === "function" ||
        Date.now() - start > timeoutMs
      ) {
        clearInterval(id);
        _sdkReady = true;
        resolve(); // fail open after timeout so join() can surface the real error
      }
    }, 50);
  });

  return _sdkReadyPromise;
}

// ─── Module-level singleton ────────────────────────────────────────────────────
let _activeCallObject: any = null;
let _activeRoomName: string | null = null;

async function getOrCreateCallObject(opts: object, forceNew = false): Promise<any> {
  await ensureDailySDKReady();
  if (!forceNew) {
    try {
      const existing = (DailyIframe as any).getCallInstance?.();
      if (existing) { _activeCallObject = existing; return existing; }
    } catch (_) {}
    if (_activeCallObject) return _activeCallObject;
  }
  const co = DailyIframe.createCallObject(opts as any);
  _activeCallObject = co;
  return co;
}

async function releaseCallObject(): Promise<void> {
  const co = _activeCallObject;
  if (!co) return;
  _activeCallObject = null;
  _activeRoomName = null;
  try { await co.leave(); } catch (_) {}
  try { await co.destroy(); } catch (_) {}
}

async function destroyForeignCallInstance(): Promise<void> {
  await ensureDailySDKReady();
  let existing: any = null;
  try { existing = (DailyIframe as any).getCallInstance?.(); } catch (_) {}
  if (!existing) return;
  try { await existing.leave(); } catch (_) {}
  try { await existing.destroy(); } catch (_) {}
  if (_activeCallObject === existing) { _activeCallObject = null; _activeRoomName = null; }
}

// ─── Auth token fetch with debounce to avoid lock contention ──────────────────
let _tokenFetchPromise: Promise<string | null> | null = null;
async function getAuthToken(): Promise<string | null> {
  if (_tokenFetchPromise) return _tokenFetchPromise;
  _tokenFetchPromise = supabase.auth.getSession()
    .then(({ data }) => data.session?.access_token ?? null)
    .finally(() => { _tokenFetchPromise = null; });
  return _tokenFetchPromise;
}

// ─── Error helpers ─────────────────────────────────────────────────────────────
function extractDailyError(err: unknown): string {
  if (!err) return "Unknown Daily.co error";
  if (typeof err === "string" && err.trim()) return err;
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "object") {
    const e = err as any;
    const msg = e.errorMsg ?? e.msg ?? e.error?.msg ?? e.error?.type ?? e.type ?? e.message ?? null;
    if (msg && typeof msg === "string") return msg;
    try { const j = JSON.stringify(e); if (j && j !== "{}") return `Daily error: ${j}`; } catch (_) {}
  }
  return "Connection error (no details provided by Daily.co)";
}

function isGenericDailyError(msg: string): boolean {
  return msg === "Unknown Daily.co error" || msg.includes("no details provided by Daily.co");
}

// ─── Types ─────────────────────────────────────────────────────────────────────
export type CallQuality = "excellent" | "good" | "fair" | "poor" | "disconnected";
export type DailyCallState = "idle" | "joining" | "joined" | "leaving" | "error";
export type NoiseCancellationState = "unknown" | "active" | "inactive" | "unsupported" | "error";

export interface DailyParticipant {
  session_id: string;
  user_name: string;
  local: boolean;
  audio: boolean;
  video: boolean;
  screen: boolean;
  joinedAt: number;
  handRaised?: boolean;
  videoTrack?: MediaStreamTrack;
  audioTrack?: MediaStreamTrack;
  screenVideoTrack?: MediaStreamTrack;
  screenAudioTrack?: MediaStreamTrack;
}

export interface UseDailyCallOptions {
  callId: string | null;
  roomName: string | null;
  meetingToken?: string | null;
  userName?: string;
  startWithVideoOff?: boolean;
  onJoined?: () => void;
  onLeft?: () => void;
  onParticipantJoined?: (p: DailyParticipant) => void;
  onParticipantLeft?: (sessionId: string) => void;
  onRecordingStarted?: () => void;
  onRecordingStopped?: () => void;
  onNetworkQualityChange?: (quality: CallQuality) => void;
  onHandRaiseChange?: (sessionId: string, raised: boolean, userName: string) => void;
  /** Fired the instant the local audio track is live and audible to remote participants. */
  onLocalAudioReady?: (elapsedMsSinceJoinCall: number) => void;
}

interface JoinCallOpts {
  rName?: string;
  token?: string;
  displayName?: string;
  _isRetry?: boolean;
}

const JOIN_TIMEOUT_MS = 30_000;
const RETRY_DELAY_MS = 500;
const SELF_HEAL_GRACE_MS = 4_000;
const TRANSPORT_RECONNECT_BASE_MS = 2_000;
const TRANSPORT_RECONNECT_MAX_MS  = 15_000;
const TRANSPORT_RECONNECT_MAX_TRIES = 4;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(label)), ms);
    promise
      .then((val) => { clearTimeout(timer); resolve(val); })
      .catch((err) => { clearTimeout(timer); reject(err); });
  });
}

function networkScoreToQuality(score: number): CallQuality {
  if (score >= 4) return "excellent";
  if (score >= 3) return "good";
  if (score >= 2) return "fair";
  if (score >= 1) return "poor";
  return "disconnected";
}

function extractTracks(p: any) {
  return {
    videoTrack: p?.tracks?.video?.persistentTrack ?? p?.tracks?.video?.track ?? undefined,
    audioTrack: p?.tracks?.audio?.persistentTrack ?? p?.tracks?.audio?.track ?? undefined,
    screenVideoTrack: p?.tracks?.screenVideo?.persistentTrack ?? p?.tracks?.screenVideo?.track ?? undefined,
    screenAudioTrack: p?.tracks?.screenAudio?.persistentTrack ?? p?.tracks?.screenAudio?.track ?? undefined,
  };
}

// ─── Hook ──────────────────────────────────────────────────────────────────────
export function useDailyCall({
  callId,
  roomName,
  meetingToken,
  userName = "Host",
  startWithVideoOff = false,
  onJoined,
  onLeft,
  onParticipantJoined,
  onParticipantLeft,
  onRecordingStarted,
  onRecordingStopped,
  onNetworkQualityChange,
  onHandRaiseChange,
  onLocalAudioReady,
}: UseDailyCallOptions) {
  const [callState,         setCallState]         = useState<DailyCallState>("idle");
  const [participants,      setParticipants]      = useState<Map<string, DailyParticipant>>(new Map());
  const [isRecording,       setIsRecording]       = useState(false);
  const [isScreenSharing,   setIsScreenSharing]   = useState(false);
  const [networkQuality,    setNetworkQuality]    = useState<CallQuality>("good");
  const [activeSpeakerId,   setActiveSpeakerId]   = useState<string | null>(null);
  const [participantCount,  setParticipantCount]  = useState(0);
  const [elapsedSeconds,    setElapsedSeconds]    = useState(0);
  const [error,             setError]             = useState<string | null>(null);
  const [noiseCancellation, setNoiseCancellationState] = useState<NoiseCancellationState>("unknown");
  const [handRaises,        setHandRaises]        = useState<Map<string, boolean>>(new Map());

  const isOwnerRef             = useRef(false);
  const joinTimeRef            = useRef<number>(0);
  const joinCallStartedAtRef   = useRef<number>(0);
  const timerRef               = useRef<number>();
  const joinedRef              = useRef(false);
  const handlersRegisteredRef  = useRef(false);
  const callIdRef              = useRef<string | null>(callId);
  const roomNameRef            = useRef<string | null>(roomName);
  const meetingTokenRef        = useRef<string | null | undefined>(meetingToken);
  const userNameRef            = useRef<string>(userName);
  const transportReconnectRef  = useRef<ReturnType<typeof setTimeout>>();
  const selfHealTimerRef       = useRef<ReturnType<typeof setTimeout>>();
  const transportRetryCountRef = useRef(0);
  const localAudioReadyFiredRef = useRef(false);

  useEffect(() => { callIdRef.current = callId; },           [callId]);
  useEffect(() => { roomNameRef.current = roomName; },       [roomName]);
  useEffect(() => { meetingTokenRef.current = meetingToken; }, [meetingToken]);
  useEffect(() => { userNameRef.current = userName; },       [userName]);

  // Kick off SDK readiness check eagerly so it's likely done before joinCall
  useEffect(() => { ensureDailySDKReady(); }, []);

  // ── Timer ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (callState === "joined") {
      joinTimeRef.current = Date.now();
      timerRef.current = window.setInterval(() => {
        setElapsedSeconds(Math.floor((Date.now() - joinTimeRef.current) / 1000));
      }, 1000);
    } else {
      clearInterval(timerRef.current);
      if (callState === "idle") setElapsedSeconds(0);
    }
    return () => clearInterval(timerRef.current);
  }, [callState]);

  // ── Fetch meeting token ────────────────────────────────────────────────────
  const fetchMeetingToken = useCallback(async (rName: string, isOwnerUser = true): Promise<string | null> => {
    try {
      const token = await getAuthToken();
      if (!token) return null;
      const { data, error: fnErr } = await withTimeout(
        supabase.functions.invoke("get-daily-token", {
          headers: { Authorization: `Bearer ${token}` },
          body: { room_name: rName, is_owner: isOwnerUser },
        }),
        8_000,
        "Timed out fetching meeting token",
      );
      if (fnErr || !data?.token) return null;
      return data.token;
    } catch { return null; }
  }, []);

  // ── Build participant ──────────────────────────────────────────────────────
  const buildParticipant = useCallback((p: any, fallbackName?: string): DailyParticipant => {
    const { videoTrack, audioTrack, screenVideoTrack, screenAudioTrack } = extractTracks(p);
    return {
      session_id: p.session_id,
      user_name: p.user_name ?? fallbackName ?? "Participant",
      local: p.local ?? false,
      audio: p.audio ?? false,
      video: p.video ?? false,
      screen: p.screen ?? false,
      joinedAt: Date.now(),
      handRaised: false,
      videoTrack, audioTrack, screenVideoTrack, screenAudioTrack,
    };
  }, []);

  // ── Snapshot participants ──────────────────────────────────────────────────
  const snapshotParticipants = useCallback((callObj: any) => {
    try {
      const allParts = callObj.participants?.() ?? {};
      const newMap = new Map<string, DailyParticipant>();
      Object.values(allParts).forEach((p: any) => {
        if (!p?.session_id) return;
        newMap.set(p.session_id, buildParticipant(p, p.local ? userNameRef.current : undefined));
      });
      setParticipants(newMap);
      setParticipantCount(newMap.size);
      const localP = Object.values(allParts).find((p: any) => p.local) as any;
      if (localP) setIsScreenSharing(!!localP.screen);
    } catch (_) {}
  }, [buildParticipant]);

  // ── Build call object options ──────────────────────────────────────────────
  function buildCallOpts(room: string, token?: string) {
    return {
      url: `https://fixsense.daily.co/${room}`,
      token,
      audioSource: true,
      videoSource: !startWithVideoOff,
      subscribeToTracksAutomatically: true,
      dailyConfig: {
        useDevicePreferenceCookies: false,
        experimentalChromeVideoMuteLightOff: true,
      },
      sendSettings: {
        video: {
          encodings: {
            low:    { maxBitrate: 150_000,   maxFramerate: 15, scaleResolutionDownBy: 4 },
            medium: { maxBitrate: 500_000,   maxFramerate: 24, scaleResolutionDownBy: 2 },
            high:   { maxBitrate: 1_200_000, maxFramerate: 30, scaleResolutionDownBy: 1 },
          },
        },
      },
    } as any;
  }

  // ── Noise cancellation ─────────────────────────────────────────────────────
  const requestNoiseCancellation = useCallback(async (callObj: any, enabled: boolean) => {
    try {
      await callObj.updateInputSettings({
        audio: { processor: enabled ? { type: "noise-cancellation" } : { type: "none" } },
      });
    } catch (err) {
      console.warn("[Daily] updateInputSettings request failed:", extractDailyError(err));
      setNoiseCancellationState("error");
    }
  }, []);

  // ── Register Daily event handlers ──────────────────────────────────────────
  const registerHandlers = useCallback((callObj: any) => {
    if (handlersRegisteredRef.current) return;
    handlersRegisteredRef.current = true;

    callObj.on("joined-meeting", (event: any) => {
      joinedRef.current = true;
      transportRetryCountRef.current = 0;
      setCallState("joined");
      setError(null);
      clearTimeout(transportReconnectRef.current);
      clearTimeout(selfHealTimerRef.current);

      const allParts = event?.participants ?? {};
      const newMap = new Map<string, DailyParticipant>();
      Object.values(allParts).forEach((p: any) => {
        newMap.set(p.session_id, buildParticipant(p, p.local ? userNameRef.current : undefined));
      });
      setParticipants(newMap);
      setParticipantCount(newMap.size);
      const localP = Object.values(allParts).find((p: any) => p.local) as any;
      if (localP) setIsScreenSharing(!!localP.screen);

      if (localP?.tracks?.audio?.state === "playable" && !localAudioReadyFiredRef.current) {
        localAudioReadyFiredRef.current = true;
        onLocalAudioReady?.(Date.now() - joinCallStartedAtRef.current);
      }

      onJoined?.();
      toast.success("Connected to meeting!");
      requestNoiseCancellation(callObj, true);
    });

    callObj.on("input-settings-updated", (event: any) => {
      const processorType = event?.inputSettings?.audio?.processor?.type;
      if (processorType === "noise-cancellation") {
        setNoiseCancellationState("active");
      } else if (processorType === "none" || processorType === undefined) {
        setNoiseCancellationState((prev) => (prev === "active" ? "inactive" : "unsupported"));
      }
    });

    callObj.on("track-started", (event: any) => {
      if (event?.participant?.local && event?.track?.kind === "audio" && !localAudioReadyFiredRef.current) {
        localAudioReadyFiredRef.current = true;
        onLocalAudioReady?.(Date.now() - joinCallStartedAtRef.current);
      }
    });

    callObj.on("left-meeting", () => {
      joinedRef.current = false;
      setCallState("idle");
      setParticipants(new Map());
      setHandRaises(new Map());
      setIsRecording(false);
      setIsScreenSharing(false);
      setActiveSpeakerId(null);
      setError(null);
      setNoiseCancellationState("unknown");
      localAudioReadyFiredRef.current = false;
      handlersRegisteredRef.current = false;
      clearTimeout(transportReconnectRef.current);
      clearTimeout(selfHealTimerRef.current);
      onLeft?.();
    });

    callObj.on("participant-joined", (event: any) => {
      const p = event?.participant;
      if (!p) return;
      const participant = buildParticipant(p);
      setParticipants((prev) => { const next = new Map(prev); next.set(p.session_id, participant); return next; });
      setParticipantCount((n) => n + 1);
      onParticipantJoined?.(participant);
    });

    callObj.on("participant-updated", (event: any) => {
      const p = event?.participant;
      if (!p) return;
      const { videoTrack, audioTrack, screenVideoTrack, screenAudioTrack } = extractTracks(p);
      setParticipants((prev) => {
        const next = new Map(prev);
        const existing = next.get(p.session_id);
        if (existing) {
          next.set(p.session_id, {
            ...existing,
            audio: p.audio ?? existing.audio,
            video: p.video ?? existing.video,
            screen: p.screen ?? existing.screen,
            videoTrack: videoTrack ?? existing.videoTrack,
            audioTrack: audioTrack ?? existing.audioTrack,
            screenVideoTrack: screenVideoTrack ?? existing.screenVideoTrack,
            screenAudioTrack: screenAudioTrack ?? existing.screenAudioTrack,
          });
        } else {
          next.set(p.session_id, buildParticipant(p));
        }
        return next;
      });
      if (p.local) setIsScreenSharing(!!p.screen);
    });

    callObj.on("participant-left", (event: any) => {
      const sid = event?.participant?.session_id;
      if (!sid) return;
      setParticipants((prev) => { const next = new Map(prev); next.delete(sid); return next; });
      setHandRaises((prev) => { const next = new Map(prev); next.delete(sid); return next; });
      setParticipantCount((n) => Math.max(0, n - 1));
      onParticipantLeft?.(sid);
    });

    callObj.on("active-speaker-change", (event: any) => {
      setActiveSpeakerId(event?.activeSpeaker?.peerId ?? null);
    });

    callObj.on("recording-started", () => {
      setIsRecording(true);
      onRecordingStarted?.();
      toast.success("Recording started");
    });

    callObj.on("recording-stopped", () => {
      setIsRecording(false);
      onRecordingStopped?.();
      toast.info("Recording stopped — processing...");
    });

    callObj.on("network-quality-change", (event: any) => {
      const score = event?.quality ?? event?.threshold ?? 3;
      const quality = networkScoreToQuality(
        typeof score === "number" ? score : score === "good" ? 4 : score === "low" ? 2 : 3,
      );
      setNetworkQuality(quality);
      onNetworkQualityChange?.(quality);
      if (quality === "poor") {
        toast.warning("Weak connection — reducing video quality", { id: "network-warning" });
        callObj.updateSendSettings({ video: { encodings: { low: { maxBitrate: 150000, maxFramerate: 15, scaleResolutionDownBy: 4 } } } }).catch(() => {});
      } else if (quality === "excellent" || quality === "good") {
        toast.dismiss("network-warning");
      }
    });

    callObj.on("app-message", (event: any) => {
      const { data, fromId } = event ?? {};
      if (!data || !fromId) return;
      if (data.type === "hand-raise") {
        const raised = !!data.raised;
        const uname  = data.userName ?? "Someone";
        setHandRaises((prev) => { const next = new Map(prev); next.set(fromId, raised); return next; });
        setParticipants((prev) => {
          const next = new Map(prev);
          const p = next.get(fromId);
          if (p) next.set(fromId, { ...p, handRaised: raised });
          return next;
        });
        onHandRaiseChange?.(fromId, raised, uname);
        if (raised) toast.info(`✋ ${uname} raised their hand`);
      }
    });

    const handleTransportDisconnect = (source: string) => {
      if (!joinedRef.current) return;
      if (selfHealTimerRef.current) return;

      selfHealTimerRef.current = setTimeout(() => {
        selfHealTimerRef.current = undefined;
        let state: string | undefined;
        try { state = callObj.meetingState?.(); } catch (_) {}
        if (state === "joined-meeting") return;
        scheduleTransportReconnect(source, callObj);
      }, SELF_HEAL_GRACE_MS);
    };

    callObj.on("nonfatal-error", (event: any) => {
      console.warn("[Daily] Non-fatal error:", event);
      const type: string = event?.type ?? event?.error?.type ?? "";
      if (type === "input-settings-error") {
        console.warn("[Daily] Noise cancellation unsupported:", event?.errorMsg ?? event);
        setNoiseCancellationState("unsupported");
        return;
      }
      if (type === "send-transport-disconnected" || type === "receive-transport-disconnected") {
        handleTransportDisconnect(type);
      }
    });

    callObj.on("send-transport-changed", (event: any) => {
      const state: string = event?.state ?? event?.status ?? "";
      if (state === "disconnected" || state === "failed" || state === "closed") {
        console.warn("[Daily] send-transport-changed:", event);
        handleTransportDisconnect("send-transport-changed");
      }
    });

    callObj.on("error", (event: any) => {
      console.error("[Daily] Error event:", event);
      clearTimeout(transportReconnectRef.current);
      clearTimeout(selfHealTimerRef.current);

      const errType: string | null = event?.error?.type ?? event?.type ?? null;
      if (errType === "exp-room") {
        const cid = callIdRef.current;
        if (cid) {
          supabase.functions.invoke("manage-daily-room", { body: { action: "handle_expired", call_id: cid } }).catch(() => {});
        }
        setCallState("idle");
        setError("Room expired");
        setParticipants(new Map());
        setHandRaises(new Map());
        setIsRecording(false);
        setIsScreenSharing(false);
        setActiveSpeakerId(null);
        handlersRegisteredRef.current = false;
        joinedRef.current = false;
        toast.error("Meeting room expired. Create a new meeting to continue.", { duration: 8000 });
        return;
      }

      const msg = extractDailyError(event?.error ?? event);
      setError(msg);
      setCallState("error");
      handlersRegisteredRef.current = false;
      toast.error(`Meeting error: ${msg}`);
    });

    callObj.on("call-instance-destroyed", () => {
      setCallState("idle");
      if (_activeCallObject === callObj) { _activeCallObject = null; _activeRoomName = null; }
      handlersRegisteredRef.current = false;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildParticipant, onJoined, onLeft, onParticipantJoined, onParticipantLeft, onRecordingStarted, onRecordingStopped, onNetworkQualityChange, onHandRaiseChange, onLocalAudioReady, requestNoiseCancellation]);

  // ── Schedule transport reconnect with exponential backoff ──────────────────
  const scheduleTransportReconnect = useCallback((source: string, callObj: any) => {
    if (!joinedRef.current) return;
    if (transportRetryCountRef.current >= TRANSPORT_RECONNECT_MAX_TRIES) {
      console.warn(`[Daily] Max transport reconnect attempts (${TRANSPORT_RECONNECT_MAX_TRIES}) reached`);
      setError("Connection lost after multiple attempts. Please rejoin.");
      setCallState("error");
      toast.error("Connection lost. Please rejoin the meeting.");
      return;
    }

    const attempt = transportRetryCountRef.current;
    const delay = Math.min(TRANSPORT_RECONNECT_BASE_MS * Math.pow(2, attempt), TRANSPORT_RECONNECT_MAX_MS);
    transportRetryCountRef.current += 1;

    console.warn(`[Daily] ${source} — reconnect attempt ${attempt + 1}/${TRANSPORT_RECONNECT_MAX_TRIES} in ${delay}ms`);
    clearTimeout(transportReconnectRef.current);

    transportReconnectRef.current = setTimeout(async () => {
      if (!joinedRef.current) return;
      const room  = roomNameRef.current;
      const token = meetingTokenRef.current;
      if (!room) return;

      toast.warning(`Connection lost — reconnecting (attempt ${attempt + 1})…`, { id: "transport-reconnect" });

      try { await callObj.leave(); } catch (_) {}
      handlersRegisteredRef.current = false;
      joinedRef.current = false;
      await new Promise((r) => setTimeout(r, 300));

      // async version — awaits SDK readiness before createCallObject
      const newCallObj = await getOrCreateCallObject(
        buildCallOpts(room, token ?? undefined),
        true,
      );
      isOwnerRef.current = true;
      _activeRoomName = room;
      registerHandlers(newCallObj);

      try {
        await withTimeout(
          newCallObj.join({ userName: userNameRef.current, url: `https://fixsense.daily.co/${room}`, token: token ?? undefined }),
          JOIN_TIMEOUT_MS,
          "Reconnect timed out",
        );
        toast.dismiss("transport-reconnect");
        transportRetryCountRef.current = 0;
      } catch (err) {
        console.error("[Daily] Reconnect failed:", err);
        scheduleTransportReconnect("reconnect-failed", newCallObj);
      }
    }, delay);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerHandlers]);

  // ── Join call ──────────────────────────────────────────────────────────────
  const joinCall = useCallback(async (opts?: JoinCallOpts): Promise<boolean> => {
    const targetRoom = opts?.rName ?? roomName;
    if (!targetRoom) { toast.error("No room name provided"); return false; }
    const isRetry = !!opts?._isRetry;
    joinCallStartedAtRef.current = Date.now();
    localAudioReadyFiredRef.current = false;

    // Re-attach to an already-active call object for the same room
    if (!isRetry && _activeCallObject && _activeRoomName === targetRoom) {
      let meetingState: string | undefined;
      try { meetingState = _activeCallObject.meetingState?.(); } catch (_) {}
      if (meetingState === "joined-meeting" || joinedRef.current) {
        isOwnerRef.current = true;
        joinedRef.current = true;
        registerHandlers(_activeCallObject);
        snapshotParticipants(_activeCallObject);
        setError(null);
        setCallState("joined");
        onJoined?.();
        return true;
      }
      if (meetingState === "joining-meeting") {
        isOwnerRef.current = true;
        registerHandlers(_activeCallObject);
        setError(null);
        setCallState("joining");
        return true;
      }
    }

    setCallState("joining");
    setError(null);
    joinedRef.current = false;
    handlersRegisteredRef.current = false;
    transportRetryCountRef.current = 0;

    try {
      // Ensure the SDK is fully bootstrapped before touching any DailyIframe API.
      // This is the primary fix for "Cannot read properties of undefined (reading 'cssFile')".
      await ensureDailySDKReady();

      if (!DailyIframe) throw new Error("Daily.co SDK failed to load");

      const explicitToken = opts?.token ?? meetingToken;
      const tokenPromise = explicitToken
        ? Promise.resolve(explicitToken)
        : fetchMeetingToken(targetRoom, true);

      let foreignState: string | undefined;
      try {
        await ensureDailySDKReady();
        const foreign = (DailyIframe as any).getCallInstance?.();
        if (foreign) foreignState = foreign.meetingState?.();
      } catch (_) {}
      const staleForeignSession = foreignState === "joined-meeting" || foreignState === "joining-meeting";

      if (_activeCallObject && (isRetry || _activeRoomName !== targetRoom)) {
        await releaseCallObject();
        handlersRegisteredRef.current = false;
      }
      if (staleForeignSession) {
        console.warn("[Daily] Stale foreign instance — forcing teardown");
        await destroyForeignCallInstance();
        handlersRegisteredRef.current = false;
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      }

      // Parallel: token fetch + call object creation (both now async-safe)
      const callObjPromise = getOrCreateCallObject(
        buildCallOpts(targetRoom, undefined),
        isRetry || staleForeignSession,
      );

      const [token, callObj] = await Promise.all([tokenPromise, callObjPromise]);
      meetingTokenRef.current = token ?? meetingTokenRef.current;

      isOwnerRef.current = true;
      _activeRoomName = targetRoom;
      registerHandlers(callObj);

      await withTimeout(
        callObj.join({
          userName: opts?.displayName ?? userName,
          url: `https://fixsense.daily.co/${targetRoom}`,
          token: token ?? undefined,
        }),
        JOIN_TIMEOUT_MS,
        "Connection timed out",
      );

      return true;
    } catch (err: unknown) {
      let msg: string;
      if (err instanceof Error && err.message) msg = err.message;
      else msg = extractDailyError(err);

      console.error("[Daily] Join failed:", err);

      if (!isRetry && isGenericDailyError(msg)) {
        console.warn("[Daily] Generic error — retrying once");
        await releaseCallObject();
        await destroyForeignCallInstance();
        isOwnerRef.current = false;
        handlersRegisteredRef.current = false;
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        return joinCall({ ...opts, rName: targetRoom, _isRetry: true });
      }

      if (isOwnerRef.current) { await releaseCallObject(); isOwnerRef.current = false; }
      setError(msg);
      setCallState("error");
      handlersRegisteredRef.current = false;

      if (msg.includes("timed out")) {
        toast.error("Connection is taking too long. Tap Retry to try again.", { duration: 8000 });
      } else if (msg.includes("no details")) {
        toast.error("Could not connect to the meeting room. Please check the room exists and try again.", { duration: 8000 });
      } else {
        toast.error(`Could not join meeting: ${msg}`);
      }
      return false;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomName, meetingToken, userName, startWithVideoOff, fetchMeetingToken, registerHandlers, snapshotParticipants, onJoined]);

  // ── Leave ──────────────────────────────────────────────────────────────────
  const leaveCall = useCallback(async () => {
    clearTimeout(transportReconnectRef.current);
    clearTimeout(selfHealTimerRef.current);
    setCallState("leaving");
    handlersRegisteredRef.current = false;
    if (isOwnerRef.current) { await releaseCallObject(); isOwnerRef.current = false; }
    else if (_activeCallObject) { try { await _activeCallObject.leave(); } catch (_) {} }
    setCallState("idle");
    joinedRef.current = false;
  }, []);

  const setAudioEnabled = useCallback(async (enabled: boolean) => {
    if (_activeCallObject) await _activeCallObject.setLocalAudio(enabled);
  }, []);

  const setVideoEnabled = useCallback(async (enabled: boolean) => {
    if (_activeCallObject) await _activeCallObject.setLocalVideo(enabled);
  }, []);

  // ── Screen share ───────────────────────────────────────────────────────────
  const startScreenShare = useCallback(async () => {
    if (!_activeCallObject) {
      toast.error("Not connected to the meeting yet.");
      return;
    }
    try {
      await _activeCallObject.startScreenShare({
        captureMethod: "user-choice",
        screenVideoSendSettings: {
          maxQuality: "medium",
          encodings: {
            low:    { maxBitrate: 600_000,   maxFramerate: 8 },
            medium: { maxBitrate: 1_200_000, maxFramerate: 15 },
          },
        },
      });
    } catch (err: any) {
      console.error("[Daily] Screen share failed:", extractDailyError(err), err);
      if (err?.name === "NotAllowedError" || err?.errorMsg?.includes("Permission")) {
        toast.info("Screen sharing was cancelled.");
        return;
      }
      try {
        await _activeCallObject.startScreenShare({ captureMethod: "user-choice" });
      } catch (err2: any) {
        const msg = extractDailyError(err2);
        console.error("[Daily] Screen share retry failed:", msg, err2);
        toast.error(
          msg && msg !== "Unknown Daily.co error"
            ? `Screen share failed: ${msg}`
            : "Screen sharing failed. Grant permission and try again.",
        );
      }
    }
  }, []);

  const stopScreenShare = useCallback(async () => {
    if (_activeCallObject) {
      try { await _activeCallObject.stopScreenShare(); } catch (_) {}
    }
  }, []);

  // ── Hand raise ─────────────────────────────────────────────────────────────
  const raiseHand = useCallback(async (raised: boolean) => {
    if (!_activeCallObject) return;
    const localP = _activeCallObject.participants?.()?.local;
    const uname = localP?.user_name ?? userNameRef.current ?? "You";
    const localSid = localP?.session_id;

    if (localSid) {
      setHandRaises((prev) => { const next = new Map(prev); next.set(localSid, raised); return next; });
      setParticipants((prev) => {
        const next = new Map(prev);
        const p = next.get(localSid);
        if (p) next.set(localSid, { ...p, handRaised: raised });
        return next;
      });
    }

    try {
      await _activeCallObject.sendAppMessage({ type: "hand-raise", raised, userName: uname }, "*");
    } catch (err) {
      console.warn("[Daily] Hand raise broadcast failed:", err);
    }

    if (raised) toast.success("✋ You raised your hand");
    else toast.info("Hand lowered");
  }, []);

  const isHandRaised = useCallback((sessionId: string): boolean => {
    return handRaises.get(sessionId) ?? false;
  }, [handRaises]);

  // ── Recording ──────────────────────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    if (_activeCallObject) await _activeCallObject.startRecording();
  }, []);

  const stopRecording = useCallback(async () => {
    if (_activeCallObject) await _activeCallObject.stopRecording();
  }, []);

  // ── Noise cancellation toggle (post-join, user-initiated) ──────────────────
  const setNoiseCancellation = useCallback(async (enabled: boolean) => {
    if (!_activeCallObject) return;
    await requestNoiseCancellation(_activeCallObject, enabled);
  }, [requestNoiseCancellation]);

  // ── Cleanup on unmount ─────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      clearInterval(timerRef.current);
      clearTimeout(transportReconnectRef.current);
      clearTimeout(selfHealTimerRef.current);
      if (isOwnerRef.current && _activeCallObject && !joinedRef.current) {
        void releaseCallObject();
        isOwnerRef.current = false;
      }
    };
  }, []);

  const isConnected        = callState === "joined";
  const isConnecting       = callState === "joining";
  const localParticipant   = Array.from(participants.values()).find((p) => p.local);
  const remoteParticipants = Array.from(participants.values()).filter((p) => !p.local);
  const activeSpeaker      = activeSpeakerId ? participants.get(activeSpeakerId) : null;

  return {
    callState, isConnected, isConnecting, isRecording, isScreenSharing,
    networkQuality, activeSpeakerId, activeSpeaker, participantCount,
    elapsedSeconds, error, noiseCancellation,
    participants: Array.from(participants.values()),
    localParticipant, remoteParticipants,
    handRaises,
    joinCall, leaveCall,
    setAudioEnabled, setVideoEnabled,
    startScreenShare, stopScreenShare,
    startRecording, stopRecording,
    raiseHand, isHandRaised,
    setNoiseCancellation,
    callObject: _activeCallObject,
  };
}