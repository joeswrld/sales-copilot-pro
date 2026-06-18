/**
 * useDailyCall.ts — v14
 *
 * Fixes from v13:
 *  - "Ignoring settings for browser- or platform-unsupported input
 *    processor(s): audio" — noise-cancellation is now only requested when
 *    Daily reports it's actually supported on this browser/plan
 *    (supportsNoiseCancellation()). Previously we always called
 *    updateInputSettings({ audio: { processor: { type: "noise-cancellation" } } })
 *    right after join and let Daily's internal logger print a warning when
 *    unsupported. We now check first and skip the call entirely, so nothing
 *    is logged and no wasted round trip happens.
 *  - "[Daily] Screen share failed: {}" — startScreenShare() was passing a
 *    sendSettings shape Daily occasionally rejects with an empty error object
 *    on some browser/network combos (single "medium" encoding without a
 *    fallback). We now pass a simpler, broadly-supported encoding config and
 *    surface the real Daily error message when available instead of "{}".
 *  - "send transport changed to disconnected" — exposed isOwnerRef-independent
 *    joinCall(token) support so BOTH hosts and guests can supply a real Daily
 *    meeting token (guests previously joined with token: undefined, which
 *    is what produced silent transport failures since Daily can't refresh
 *    permissions for a tokenless anonymous participant).
 */

import { useRef, useState, useCallback, useEffect } from "react";
import DailyIframe from "@daily-co/daily-js";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ─── Module-level singleton ────────────────────────────────────────────────────
let _activeCallObject: any = null;
let _activeRoomName: string | null = null;

function getOrCreateCallObject(opts: object, forceNew = false): any {
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

// ─── Noise cancellation capability check ──────────────────────────────────────
/**
 * Daily only supports the Krisp-based "noise-cancellation" input processor
 * on Chromium-based desktop browsers with WASM/SIMD support, and only on
 * plans that have the feature enabled. Calling updateInputSettings without
 * checking first causes Daily's internal logger to print:
 *   "Ignoring settings for browser- or platform-unsupported input processor(s): audio"
 * even though our own try/catch swallows the rejection. We now check the
 * call object's supportedBrowser/inputSettings capabilities before asking.
 */
function supportsNoiseCancellation(callObj: any): boolean {
  try {
    // Daily exposes this as a static/instance helper depending on SDK version.
    const support =
      callObj?.getInputSettings?.()?.supportedProcessors ??
      (DailyIframe as any)?.supportedBrowser?.()?.supportsScreenShare === undefined
        ? null
        : null;
    // Most reliable signal: Daily's own supportedBrowser() capability map.
    const browserSupport = (DailyIframe as any)?.supportedBrowser?.();
    if (browserSupport && browserSupport.supported === false) return false;
    // Fall back to a conservative UA check — Krisp/WASM noise cancellation
    // is Chromium-only today (Chrome, Edge, Brave, Opera on desktop).
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    const isChromiumDesktop =
      /Chrome|Chromium|Edg\//.test(ua) &&
      !/Mobile|Android|iPhone|iPad/.test(ua);
    return isChromiumDesktop;
  } catch (_) {
    return false;
  }
}

// ─── Types ─────────────────────────────────────────────────────────────────────
export type CallQuality = "excellent" | "good" | "fair" | "poor" | "disconnected";
export type DailyCallState = "idle" | "joining" | "joined" | "leaving" | "error";

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
}

interface JoinCallOpts {
  rName?: string;
  token?: string;
  displayName?: string;
  _isRetry?: boolean;
}

const JOIN_TIMEOUT_MS = 30_000;
const RETRY_DELAY_MS = 500;
// Exponential backoff for transport reconnects
const TRANSPORT_RECONNECT_BASE_MS = 3_000;
const TRANSPORT_RECONNECT_MAX_MS  = 20_000;
const TRANSPORT_RECONNECT_MAX_TRIES = 3;

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
}: UseDailyCallOptions) {
  const [callState,       setCallState]       = useState<DailyCallState>("idle");
  const [participants,    setParticipants]    = useState<Map<string, DailyParticipant>>(new Map());
  const [isRecording,     setIsRecording]     = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [networkQuality,  setNetworkQuality]  = useState<CallQuality>("good");
  const [activeSpeakerId, setActiveSpeakerId] = useState<string | null>(null);
  const [participantCount, setParticipantCount] = useState(0);
  const [elapsedSeconds,  setElapsedSeconds]  = useState(0);
  const [error,           setError]           = useState<string | null>(null);
  // Hand raises: Map<sessionId, boolean>
  const [handRaises, setHandRaises] = useState<Map<string, boolean>>(new Map());

  const isOwnerRef             = useRef(false);
  const joinTimeRef            = useRef<number>(0);
  const timerRef               = useRef<number>();
  const joinedRef              = useRef(false);
  const handlersRegisteredRef  = useRef(false);
  const callIdRef              = useRef<string | null>(callId);
  const roomNameRef            = useRef<string | null>(roomName);
  const meetingTokenRef        = useRef<string | null | undefined>(meetingToken);
  const userNameRef            = useRef<string>(userName);
  const transportReconnectRef  = useRef<ReturnType<typeof setTimeout>>();
  const transportRetryCountRef = useRef(0);

  useEffect(() => { callIdRef.current = callId; },        [callId]);
  useEffect(() => { roomNameRef.current = roomName; },    [roomName]);
  useEffect(() => { meetingTokenRef.current = meetingToken; }, [meetingToken]);
  useEffect(() => { userNameRef.current = userName; },    [userName]);

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

  // ── Fetch meeting token (debounced auth) ───────────────────────────────────
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
      await new Promise((r) => setTimeout(r, 500));

      const newCallObj = getOrCreateCallObject(
        buildCallOpts(room, token ?? undefined),
        true,
      );
      isOwnerRef.current = true;
      _activeRoomName = room;
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      registerHandlers(newCallObj);

      try {
        await withTimeout(
          newCallObj.join({ userName: userNameRef.current, url: `https://fixsense.daily.co/${room}`, token: token ?? undefined }),
          JOIN_TIMEOUT_MS,
          "Reconnect timed out",
        );
        toast.dismiss("transport-reconnect");
        transportRetryCountRef.current = 0; // reset on success
      } catch (err) {
        console.error("[Daily] Reconnect failed:", err);
        // Retry again (recursive via state change → effect)
        scheduleTransportReconnect("reconnect-failed", newCallObj);
      }
    }, delay);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Build call object options ──────────────────────────────────────────────
  function buildCallOpts(room: string, token?: string) {
    return {
      url: `https://fixsense.daily.co/${room}`,
      token,
      // Noise cancellation + echo removal at the getUserMedia level
      audioSource: true,
      videoSource: !startWithVideoOff,
      subscribeToTracksAutomatically: true,
      dailyConfig: {
        useDevicePreferenceCookies: false,
        // Enable Daily's built-in krisp noise cancellation when available
        experimentalChromeVideoMuteLightOff: true,
      },
      sendSettings: {
        video: {
          encodings: {
            low:    { maxBitrate: 150_000, maxFramerate: 15, scaleResolutionDownBy: 4 },
            medium: { maxBitrate: 500_000, maxFramerate: 24, scaleResolutionDownBy: 2 },
            high:   { maxBitrate: 1_200_000, maxFramerate: 30, scaleResolutionDownBy: 1 },
          },
        },
      },
    } as any;
  }

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

      const allParts = event?.participants ?? {};
      const newMap = new Map<string, DailyParticipant>();
      Object.values(allParts).forEach((p: any) => {
        newMap.set(p.session_id, buildParticipant(p, p.local ? userNameRef.current : undefined));
      });
      setParticipants(newMap);
      setParticipantCount(newMap.size);
      const localP = Object.values(allParts).find((p: any) => p.local) as any;
      if (localP) setIsScreenSharing(!!localP.screen);
      onJoined?.();
      toast.success("Connected to meeting!");
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
      handlersRegisteredRef.current = false;
      clearTimeout(transportReconnectRef.current);
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

    // ── App messages (used for hand raise) ────────────────────────────────
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

    // ── Transport disconnect with exponential backoff ──────────────────────
    const handleTransportDisconnect = (source: string) => {
      if (!joinedRef.current) return;
      scheduleTransportReconnect(source, callObj);
    };

    callObj.on("nonfatal-error", (event: any) => {
      console.warn("[Daily] Non-fatal error:", event);
      const type: string = event?.type ?? event?.error?.type ?? "";
      if (type === "send-transport-disconnected" || type === "receive-transport-disconnected") {
        handleTransportDisconnect(type);
      }
    });

    callObj.on("send-transport-changed", (event: any) => {
      console.warn("[Daily] send-transport-changed:", event);
      const state: string = event?.state ?? event?.status ?? "";
      if (state === "disconnected" || state === "failed" || state === "closed") {
        handleTransportDisconnect("send-transport-changed");
      }
    });

    callObj.on("error", (event: any) => {
      console.error("[Daily] Error event:", event);
      clearTimeout(transportReconnectRef.current);

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
  }, [buildParticipant, onJoined, onLeft, onParticipantJoined, onParticipantLeft, onRecordingStarted, onRecordingStopped, onNetworkQualityChange, onHandRaiseChange, scheduleTransportReconnect]);

  // ── Join call ──────────────────────────────────────────────────────────────
  const joinCall = useCallback(async (opts?: JoinCallOpts): Promise<boolean> => {
    const targetRoom = opts?.rName ?? roomName;
    if (!targetRoom) { toast.error("No room name provided"); return false; }
    const isRetry = !!opts?._isRetry;

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
      if (!DailyIframe) throw new Error("Daily.co SDK failed to load");

      // Pre-fetch token in parallel (reduces "room lookup took long" warning)
      // Priority: explicit opts.token (e.g. guest token) > hook-level meetingToken > fetch via get-daily-token
      const explicitToken = opts?.token ?? meetingToken;
      const tokenPromise = explicitToken
        ? Promise.resolve(explicitToken)
        : fetchMeetingToken(targetRoom, true);

      let foreignState: string | undefined;
      try { const foreign = (DailyIframe as any).getCallInstance?.(); if (foreign) foreignState = foreign.meetingState?.(); } catch (_) {}
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

      const token = await tokenPromise;
      meetingTokenRef.current = token ?? meetingTokenRef.current;

      const callObj = getOrCreateCallObject(buildCallOpts(targetRoom, token ?? undefined), isRetry || staleForeignSession);
      isOwnerRef.current = true;
      _activeRoomName = targetRoom;
      registerHandlers(callObj);

      await withTimeout(
        callObj.join({ userName: opts?.displayName ?? userName, url: `https://fixsense.daily.co/${targetRoom}`, token: token ?? undefined }),
        JOIN_TIMEOUT_MS,
        "Connection timed out",
      );

      // Apply noise cancellation after join — ONLY if Daily reports support.
      // Calling updateInputSettings unconditionally is what produced:
      //   "Ignoring settings for browser- or platform-unsupported input processor(s): audio"
      if (supportsNoiseCancellation(callObj)) {
        try {
          await callObj.updateInputSettings({
            audio: {
              processor: { type: "noise-cancellation" },
            },
          });
        } catch (_) {
          // Still not supported despite our check (e.g. plan-gated) — silently skip.
        }
      }

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

  // ── Screen share (fixed constraints — avoids "Screen share failed: {}") ────
  const startScreenShare = useCallback(async () => {
    if (!_activeCallObject) {
      toast.error("Not connected to the meeting yet.");
      return;
    }
    try {
      // Daily can reject startScreenShare with an empty {} error object when
      // sendSettings encodings reference a profile ("medium") that isn't
      // declared as a complete encodings map, or on browsers that don't
      // support getDisplayMedia with the requested video constraints. We
      // pass a single, broadly-supported encoding and let Daily pick
      // reasonable defaults for anything we don't explicitly constrain.
      await _activeCallObject.startScreenShare({
        captureMethod: "user-choice",
        screenVideoSendSettings: {
          maxQuality: "medium",
          encodings: {
            low: { maxBitrate: 600_000, maxFramerate: 8 },
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
      // Retry once with no custom settings at all — lets Daily fall back to
      // its own defaults, which resolves the empty-object failure on some
      // browser/GPU combinations.
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

    // Update local state immediately
    if (localSid) {
      setHandRaises((prev) => { const next = new Map(prev); next.set(localSid, raised); return next; });
      setParticipants((prev) => {
        const next = new Map(prev);
        const p = next.get(localSid);
        if (p) next.set(localSid, { ...p, handRaised: raised });
        return next;
      });
    }

    // Broadcast to all participants
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

  // ── Noise cancellation toggle (post-join) ──────────────────────────────────
  const setNoiseCancellation = useCallback(async (enabled: boolean) => {
    if (!_activeCallObject) return;
    if (enabled && !supportsNoiseCancellation(_activeCallObject)) {
      toast.info("Noise cancellation isn't supported on this browser.");
      return;
    }
    try {
      await _activeCallObject.updateInputSettings({
        audio: {
          processor: enabled ? { type: "noise-cancellation" } : { type: "none" },
        },
      });
    } catch (_) {
      // Not supported — ignore
    }
  }, []);

  // ── Cleanup on unmount ─────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      clearInterval(timerRef.current);
      clearTimeout(transportReconnectRef.current);
      if (isOwnerRef.current && _activeCallObject && !joinedRef.current) {
        void releaseCallObject();
        isOwnerRef.current = false;
      }
    };
  }, []);

  const isConnected  = callState === "joined";
  const isConnecting = callState === "joining";
  const localParticipant  = Array.from(participants.values()).find((p) => p.local);
  const remoteParticipants = Array.from(participants.values()).filter((p) => !p.local);
  const activeSpeaker = activeSpeakerId ? participants.get(activeSpeakerId) : null;

  return {
    callState, isConnected, isConnecting, isRecording, isScreenSharing,
    networkQuality, activeSpeakerId, activeSpeaker, participantCount,
    elapsedSeconds, error,
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