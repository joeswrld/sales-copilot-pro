/**
 * useDailyCall.ts — v17
 *
 * Fixes from v16:
 *  - CRITICAL: Fixed "property 'token': token should be a string" error from Daily.co SDK.
 *    Root cause: Daily.co's join() and createCallObject() APIs reject the `token` key
 *    entirely when its value is null or undefined — the key must be ABSENT, not present
 *    with a falsy value. Using `token: token ?? undefined` still includes the key in the
 *    object literal with value `undefined`, which Daily validates as "token was provided
 *    but is not a string".
 *    Fix: replaced all `token: token ?? undefined` and `token,` occurrences with
 *    conditional spread `...(token ? { token } : {})` so the key is entirely omitted
 *    when no token is available.
 *
 *  - Applied in three places:
 *      1. buildCallOpts() — createCallObject options
 *      2. joinCall() — callObj.join() call
 *      3. scheduleTransportReconnect() — newCallObj.join() call
 */

import { useRef, useState, useCallback, useEffect } from "react";
import DailyIframe from "@daily-co/daily-js";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ─── SDK readiness guard ───────────────────────────────────────────────────────
let _sdkReady = false;
let _sdkReadyPromise: Promise<void> | null = null;

function ensureDailySDKReady(timeoutMs = 4000): Promise<void> {
  if (_sdkReady) return Promise.resolve();
  if (_sdkReadyPromise) return _sdkReadyPromise;

  _sdkReadyPromise = new Promise<void>((resolve) => {
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
        resolve();
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
  owner?: boolean;
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
  startWithAudioOff?: boolean;
  // FIX: anchors the elapsed-time timer to the call's real, DB-backed
  // `start_time` (ISO string or epoch ms) instead of the instant *this*
  // browser tab happened to join. Without this, the timer had two bugs:
  //   1. Navigating away from the meeting page unmounts this hook, which
  //      tears down the Daily call object. Coming back remounts it and
  //      rejoins, which used to reset joinTimeRef to `Date.now()` — so the
  //      timer restarted from 0 even though the meeting had been running
  //      the whole time.
  //   2. Host and guest join at different real moments, so each computing
  //      elapsed time from their own local join instant never agreed.
  // Passing the same shared, server-stamped start_time to every participant
  // fixes both: the timer is a pure function of wall-clock time since the
  // meeting actually started, not of when this particular tab connected.
  // Falls back to Date.now() (old behavior) if omitted or unparseable.
  sharedStartTime?: string | number | null;
  onJoined?: () => void;
  onLeft?: () => void;
  onParticipantJoined?: (p: DailyParticipant) => void;
  onParticipantLeft?: (sessionId: string, wasOwner: boolean) => void;
  onRecordingStarted?: () => void;
  onRecordingStopped?: () => void;
  onNetworkQualityChange?: (quality: CallQuality) => void;
  onHandRaiseChange?: (sessionId: string, raised: boolean, userName: string) => void;
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

// ─── Platform detection ─────────────────────────────────────────────────────
// Shared by screen-share support checks and noise-cancellation gating below.
function detectPlatform(): { isIOS: boolean; isAndroid: boolean; isMobile: boolean } {
  if (typeof navigator === "undefined") return { isIOS: false, isAndroid: false, isMobile: false };
  const ua = navigator.userAgent || "";
  // iPadOS 13+ identifies as "Macintosh" in the UA string but exposes multi-touch,
  // which real Macs don't — this is the standard way to distinguish the two.
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/.test(ua);
  const isMobile = isIOS || isAndroid || /Mobile/i.test(ua);
  return { isIOS, isAndroid, isMobile };
}

// FIX: getDisplayMedia() (the WebRTC Screen Capture API Daily's startScreenShare()
// relies on for browsers) is a desktop-only capability. Per Chromium's own
// engineering docs, it is explicitly not shipped on Android or Android WebView,
// and WebKit — the engine behind every iOS browser, including Chrome-on-iOS —
// has never exposed it to websites either (iOS's screen-recording API,
// ReplayKit, is only reachable from native/App-Store apps via a broadcast
// extension, not from a web page). None of that is a bug we can work around in
// JS; it's a real platform limitation. What we *can* fix is telling the truth
// about it — the previous message claimed "Chrome on Android" works, which is
// incorrect and just confused people on exactly the devices where this matters
// most. This still does real feature detection first (so if a browser adds
// support later, or an org-managed browser enables it, we pick that up
// automatically) and only falls back to a platform explanation when the API
// is genuinely absent.
function isScreenShareSupported(): boolean {
  return getScreenShareUnavailableReason() === null;
}

type ScreenShareUnavailableReason = "insecure-context" | "ios" | "android" | "unsupported" | null;

function getScreenShareUnavailableReason(): ScreenShareUnavailableReason {
  if (typeof navigator === "undefined") return "unsupported";
  // getDisplayMedia is only exposed in secure contexts. On plain http:// (other
  // than localhost) navigator.mediaDevices itself can be undefined, which would
  // otherwise look identical to "browser doesn't support this" — worth calling
  // out separately since it's fixable by serving over HTTPS.
  if (typeof window !== "undefined" && window.isSecureContext === false) return "insecure-context";
  if (typeof navigator.mediaDevices?.getDisplayMedia === "function") return null;
  const { isIOS, isAndroid } = detectPlatform();
  if (isIOS) return "ios";
  if (isAndroid) return "android";
  return "unsupported";
}

function screenShareUnavailableMessage(reason: ScreenShareUnavailableReason): string {
  switch (reason) {
    case "insecure-context":
      return "Screen sharing requires a secure connection. This page isn't being served over HTTPS.";
    case "ios":
      return "Screen sharing from a website isn't available on iPhone or iPad — every iOS browser (Safari, Chrome, etc.) runs on Apple's WebKit engine, which doesn't expose screen capture to websites. You can still watch others share here; to share your own screen, join from a desktop browser (Chrome, Edge, Firefox, or Safari).";
    case "android":
      return "This browser doesn't support sharing your screen from a website. You can still watch others share here; to share your own screen, join from a desktop browser (Chrome, Edge, or Firefox), or check for a Chrome update on this device.";
    default:
      return "Screen sharing isn't supported in this browser. Try the latest Chrome, Edge, Firefox, or Safari on a desktop computer.";
  }
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
  startWithAudioOff = false,
  sharedStartTime,
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
  const sharedStartTimeRef     = useRef<string | number | null | undefined>(sharedStartTime);
  const transportReconnectRef  = useRef<ReturnType<typeof setTimeout>>();
  const selfHealTimerRef       = useRef<ReturnType<typeof setTimeout>>();
  const transportRetryCountRef = useRef(0);
  const localAudioReadyFiredRef = useRef(false);
  // Set right before we call callObj.leave() as part of an internal transport
  // reconnect (see scheduleTransportReconnect). Daily fires "left-meeting"
  // for that leave() the same as it would for a genuine leave/kick, and the
  // "left-meeting" handler used to always call onLeft() — which pages like
  // GuestJoin.tsx treat as "the host ended the meeting" and navigate away.
  // That meant a plain connection blip could boot a guest off the page
  // before the reconnect attempt even got a chance to run.
  const internalReconnectLeaveRef = useRef(false);

  useEffect(() => { callIdRef.current = callId; },           [callId]);
  useEffect(() => { roomNameRef.current = roomName; },       [roomName]);
  useEffect(() => { meetingTokenRef.current = meetingToken; }, [meetingToken]);
  useEffect(() => { userNameRef.current = userName; },       [userName]);
  useEffect(() => { sharedStartTimeRef.current = sharedStartTime; }, [sharedStartTime]);

  useEffect(() => { ensureDailySDKReady(); }, []);

  // ── Timer ──────────────────────────────────────────────────────────────────
  // Anchors elapsed time to sharedStartTime (the call's DB start_time) when
  // available, instead of Date.now() at the moment this hook joined. See the
  // `sharedStartTime` doc comment on UseDailyCallOptions for why — this is
  // what keeps the timer correct across page navigation and in sync between
  // host and guest.
  function resolveAnchor(): number {
    const shared = sharedStartTimeRef.current;
    if (shared != null) {
      const t = typeof shared === "number" ? shared : new Date(shared).getTime();
      if (Number.isFinite(t) && t > 0) return t;
    }
    return Date.now();
  }

  useEffect(() => {
    if (callState === "joined") {
      joinTimeRef.current = resolveAnchor();
      // Set immediately so the displayed value is correct before the first
      // 1s tick — matters most when resuming an in-progress meeting, where
      // waiting a full second to show the real elapsed time reads as a
      // reset even though it isn't one.
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - joinTimeRef.current) / 1000)));
      timerRef.current = window.setInterval(() => {
        setElapsedSeconds(Math.max(0, Math.floor((Date.now() - joinTimeRef.current) / 1000)));
      }, 1000);
    } else {
      clearInterval(timerRef.current);
      if (callState === "idle") setElapsedSeconds(0);
    }
    return () => clearInterval(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callState]);

  // If sharedStartTime arrives or changes *after* we're already joined
  // (e.g. react-query's live-call poll fills it in a few seconds after the
  // host's own optimistic join, or a guest's admitted-status poll resolves
  // it), re-anchor immediately rather than waiting for the next join.
  useEffect(() => {
    if (callState !== "joined") return;
    const anchor = resolveAnchor();
    if (Math.abs(anchor - joinTimeRef.current) < 1000) return; // no meaningful change
    joinTimeRef.current = anchor;
    setElapsedSeconds(Math.max(0, Math.floor((Date.now() - joinTimeRef.current) / 1000)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharedStartTime, callState]);

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
      owner: p.owner ?? false,
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
  // FIX: Use conditional spread so `token` key is entirely absent when falsy.
  // Daily.co rejects token: undefined/null — the key must not be present at all.
  //
  // FIX: previously this set `audioSource`/`videoSource` to `false` whenever the
  // guest had toggled mic/camera off in the lobby before joining. Those two
  // options don't mean "start muted" — they mean "never acquire this device
  // for the lifetime of this call object at all". So once inside the meeting,
  // tapping Mic/Camera to turn back on called setLocalAudio(true)/
  // setLocalVideo(true), which has no underlying track to re-enable and
  // silently no-ops. Devices must always be acquired (`audioSource`/
  // `videoSource: true`); the *muted-at-start* behavior belongs to the
  // separate `startAudioOff`/`startVideoOff` flags, which still create the
  // track (so it can be turned back on later) but keep it off until the user
  // (or code) explicitly enables it.
  function buildCallOpts(room: string, token?: string | null) {
    return {
      url: `https://fixsense.daily.co/${room}`,
      ...(token ? { token } : {}),
      audioSource: true,
      videoSource: true,
      startAudioOff: startWithAudioOff,
      startVideoOff: startWithVideoOff,
      subscribeToTracksAutomatically: true,
      dailyConfig: {
        useDevicePreferenceCookies: false,
      },
    } as any;
  }

  // ── Noise cancellation ─────────────────────────────────────────────────────
  const requestNoiseCancellation = useCallback(async (callObj: any, enabled: boolean) => {
    // Krisp/noise-cancellation processor requires desktop Chromium with WASM SIMD.
    // Skip on mobile, Safari, Firefox, and any UA that will make the SDK log
    // "Ignoring settings for browser- or platform-unsupported input processor(s)".
    try {
      const ua = navigator.userAgent || "";
      const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
      const isChromium = /Chrome|Chromium|Edg/i.test(ua) && !/OPR|Opera/i.test(ua);
      if (enabled && (isMobile || !isChromium)) {
        setNoiseCancellationState("unsupported");
        return;
      }
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

      // Layered video encodings only — this is the correct, validated way to
      // apply this (sendSettings is not a valid createCallObject/join option;
      // Daily only accepts it via updateSendSettings on an active call).
      // Audio bitrate/DTX aren't configurable via this API at all — Daily
      // handles Opus encoding internally, so we don't attempt to set them.
      callObj.updateSendSettings({
        video: {
          encodings: {
            low:    { maxBitrate: 150_000,   maxFramerate: 15, scaleResolutionDownBy: 4 },
            medium: { maxBitrate: 500_000,   maxFramerate: 24, scaleResolutionDownBy: 2 },
            high:   { maxBitrate: 1_200_000, maxFramerate: 30, scaleResolutionDownBy: 1 },
          },
        },
      }).catch(() => {});

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

    // FIX: this handler previously only used track-started to fire
    // onLocalAudioReady — it never wrote the new track into `participants`
    // state. That state update was left entirely to "participant-updated",
    // but Daily's own guidance is explicit that these two events are NOT
    // interchangeable: "we need to update our app state not only on
    // participant-updated events, but also on track-started/track-stopped."
    // (https://www.daily.co/blog/optimize-call-quality-in-larger-calls-by-manually-managing-media-tracks-in-a-paginated-video-call-ui/)
    // In practice this meant: whenever a track-started fired for the local
    // mic WITHOUT a participant-updated landing at the same moment (timing
    // varies by browser/device — reliably reproducible, not rare), the
    // local participant's `audioTrack` in our state stayed undefined for
    // the rest of the call. Nothing downstream ever noticed, because
    // onLocalAudioReady still fired (it doesn't touch participants state),
    // so nothing looked broken from that signal alone. The real casualty
    // was LiveMeeting.tsx's track-attach effect, which only calls
    // liveSocket.start() once `daily.participants` contains a local
    // participant with a defined audioTrack — with that field stuck
    // undefined, live captions never left "idle" ("Not started yet /
    // Waiting for your microphone track"), even though the mic itself was
    // live and Daily was happily sending it to remote participants.
    //
    // Re-reading the fresh participant snapshot here (the same source
    // participant-updated already trusts) and writing it into state
    // ourselves closes that gap instead of hoping a second event shows up.
    callObj.on("track-started", (event: any) => {
      const sid = event?.participant?.session_id;
      if (sid) {
        const allParts = callObj.participants?.() ?? {};
        const freshP = event.participant.local ? allParts.local : allParts[sid];
        if (freshP) {
          const { videoTrack, audioTrack, screenVideoTrack, screenAudioTrack } = extractTracks(freshP);
          setParticipants((prev) => {
            const next = new Map(prev);
            const existing = next.get(sid);
            if (existing) {
              next.set(sid, {
                ...existing,
                videoTrack: videoTrack ?? existing.videoTrack,
                audioTrack: audioTrack ?? existing.audioTrack,
                screenVideoTrack: screenVideoTrack ?? existing.screenVideoTrack,
                screenAudioTrack: screenAudioTrack ?? existing.screenAudioTrack,
              });
            } else {
              next.set(sid, buildParticipant(freshP, freshP.local ? userNameRef.current : undefined));
            }
            return next;
          });
        }
      }

      if (event?.participant?.local && event?.track?.kind === "audio" && !localAudioReadyFiredRef.current) {
        localAudioReadyFiredRef.current = true;
        onLocalAudioReady?.(Date.now() - joinCallStartedAtRef.current);
      }
    });

    // FIX: matching gap on the way down — a track-stopped (mic muted,
    // device revoked, camera turned off) previously had no handler at all,
    // so a stale MediaStreamTrack could keep sitting in `participants`
    // state pointing at a track that's no longer live. Clearing the
    // relevant field mirrors the track-started handler above.
    callObj.on("track-stopped", (event: any) => {
      const sid = event?.participant?.session_id;
      const kind = event?.track?.kind;
      if (!sid || !kind) return;
      setParticipants((prev) => {
        const existing = prev.get(sid);
        if (!existing) return prev;
        const next = new Map(prev);
        if (kind === "audio") next.set(sid, { ...existing, audioTrack: undefined });
        else if (kind === "video") next.set(sid, { ...existing, videoTrack: undefined });
        return next;
      });
    });

    callObj.on("left-meeting", () => {
      const wasInternalReconnect = internalReconnectLeaveRef.current;
      internalReconnectLeaveRef.current = false;

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

      // Don't tell the page "we left" — this leave() was just the teardown
      // half of an in-progress reconnect, which is about to rejoin. Firing
      // onLeft here would make GuestJoin.tsx (and any other consumer) treat
      // a transient connection blip as the meeting having ended.
      if (!wasInternalReconnect) {
        onLeft?.();
      }
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
      const wasOwner = event?.participant?.owner ?? false;
      setParticipants((prev) => { const next = new Map(prev); next.delete(sid); return next; });
      setHandRaises((prev) => { const next = new Map(prev); next.delete(sid); return next; });
      setParticipantCount((n) => Math.max(0, n - 1));
      onParticipantLeft?.(sid, wasOwner);
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

    // FIX: previously isScreenSharing was only ever derived indirectly, from
    // the local participant's `.screen` flag inside "joined-meeting" and
    // "participant-updated" snapshots. That works most of the time, but these
    // are Daily's dedicated, purpose-built events for this exact transition —
    // using them directly is both more reliable (no dependency on a snapshot
    // happening to include the local participant at the right moment) and
    // lets us clear the start-in-progress guard and give real user feedback
    // for all three outcomes: started, stopped, and canceled-by-the-user.
    callObj.on("local-screen-share-started", () => {
      screenShareBusyRef.current = false;
      setIsScreenSharing(true);
      toast.success("You're sharing your screen");
    });

    callObj.on("local-screen-share-stopped", () => {
      screenShareBusyRef.current = false;
      setIsScreenSharing(false);
    });

    callObj.on("local-screen-share-canceled", () => {
      // Fires when the user dismisses the browser's share picker without
      // choosing anything — distinct from a stop after sharing was live.
      screenShareBusyRef.current = false;
      setIsScreenSharing(false);
      toast.info("Screen sharing was canceled.");
    });

    callObj.on("network-quality-change", (event: any) => {
      const score = event?.quality ?? event?.threshold ?? 3;
      const quality = networkScoreToQuality(
        typeof score === "number" ? score : score === "good" ? 4 : score === "low" ? 2 : 3,
      );
      setNetworkQuality(quality);
      onNetworkQualityChange?.(quality);
      if (quality === "poor" || quality === "disconnected") {
        toast.warning("Weak connection — reducing video quality", { id: "network-warning" });
        callObj.updateSendSettings({
          video: { encodings: { low: { maxBitrate: 60_000, maxFramerate: 5, scaleResolutionDownBy: 8 } } },
        }).catch(() => {});
      } else if (quality === "fair") {
        toast.warning("Fair connection — adjusting video quality", { id: "network-warning" });
        callObj.updateSendSettings({
          video: {
            encodings: {
              low:    { maxBitrate: 80_000,  maxFramerate: 10, scaleResolutionDownBy: 4 },
              medium: { maxBitrate: 250_000, maxFramerate: 15, scaleResolutionDownBy: 2 },
            },
          },
        }).catch(() => {});
      } else if (quality === "excellent" || quality === "good") {
        toast.dismiss("network-warning");
        callObj.updateSendSettings({
          video: {
            encodings: {
              low:    { maxBitrate: 150_000,   maxFramerate: 15, scaleResolutionDownBy: 4 },
              medium: { maxBitrate: 500_000,   maxFramerate: 24, scaleResolutionDownBy: 2 },
              high:   { maxBitrate: 1_200_000, maxFramerate: 30, scaleResolutionDownBy: 1 },
            },
          },
        }).catch(() => {});
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

      internalReconnectLeaveRef.current = true;
      try { await callObj.leave(); } catch (_) {}
      try { await callObj.destroy(); } catch (_) {}
      handlersRegisteredRef.current = false;
      joinedRef.current = false;
      await new Promise((r) => setTimeout(r, 300));

      const newCallObj = await getOrCreateCallObject(
        buildCallOpts(room, token),
        true,
      );
      isOwnerRef.current = true;
      _activeRoomName = room;
      registerHandlers(newCallObj);

      try {
        // FIX: Conditional spread ensures token key is absent when falsy
        await withTimeout(
          newCallObj.join({
            userName: userNameRef.current,
            url: `https://fixsense.daily.co/${room}`,
            ...(token ? { token } : {}),
          }),
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
      await ensureDailySDKReady();

      if (!DailyIframe) throw new Error("Daily.co SDK failed to load");

      // opts.token is always a plain string (from JoinCallOpts) or undefined —
      // meetingToken from props can be null, so we coerce null → undefined here.
      const explicitToken = opts?.token ?? (meetingToken || undefined);
      const tokenPromise = explicitToken
        ? Promise.resolve(explicitToken)
        : fetchMeetingToken(targetRoom, true);

      // FIX: previously a foreign Daily call instance was only torn down when
      // it was actively "joined-meeting" or "joining-meeting". An IDLE foreign
      // instance (created — e.g. by another mounted useDailyCall() hook for a
      // *different* role/room in the same tab, or left behind by a component
      // that didn't clean up — but never joined, or already left) fell through
      // both checks below and got silently adopted by getOrCreateCallObject()
      // via DailyIframe.getCallInstance(), then .join()'d into a *different*
      // room than it was created for. That's how one participant's tile could
      // end up bound to another participant's tracks (host/guest showing the
      // same video+audio). Any foreign instance that isn't demonstrably OUR
      // own already-correct call object for this exact room is now always
      // destroyed before we create a fresh one — never silently reused.
      let foreign: any = null;
      let foreignState: string | undefined;
      try {
        await ensureDailySDKReady();
        foreign = (DailyIframe as any).getCallInstance?.();
        if (foreign) foreignState = foreign.meetingState?.();
      } catch (_) {}
      const isForeignInstance = foreign && foreign !== _activeCallObject;
      const staleForeignSession = foreignState === "joined-meeting" || foreignState === "joining-meeting";

      // FIX: reaching this line means the fast-path reuse check above (which
      // returns early for an already joined/joining call object on the same
      // room) did NOT return — so whatever _activeCallObject currently holds
      // (wrong room, or same room but idle/errored/left) is not usable as-is
      // and we're about to force-create a fresh one below. Daily only allows
      // ONE live call object per tab, so our own stale object must always be
      // torn down here too, not just when the room differs or it's a retry —
      // previously an idle same-room object slipped through both this check
      // and the foreign-instance check, so createCallObject() below could be
      // called while it was still alive.
      if (_activeCallObject) {
        await releaseCallObject();
        handlersRegisteredRef.current = false;
      }
      if (staleForeignSession || isForeignInstance) {
        console.warn("[Daily] Foreign/mismatched call instance detected — forcing teardown", {
          foreignState, isForeignInstance,
        });
        await destroyForeignCallInstance();
        handlersRegisteredRef.current = false;
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      }

      const callObjPromise = getOrCreateCallObject(
        buildCallOpts(targetRoom, undefined),
        true, // FIX: always force a fresh call object here — we've just torn
              // down anything foreign or stale above, and _activeRoomName===
              // targetRoom re-joins already short-circuited via the fast path
              // at the top of this function, so reaching this point always
              // means we need our own clean instance for targetRoom.
      );

      const [token, callObj] = await Promise.all([tokenPromise, callObjPromise]);
      // Persist resolved token — but only if it's a real string
      if (token) meetingTokenRef.current = token;

      isOwnerRef.current = true;
      _activeRoomName = targetRoom;
      registerHandlers(callObj);

      // FIX: Conditional spread ensures token key is absent when falsy.
      // Daily.co SDK throws "property 'token': token should be a string" when
      // the key is present with value null or undefined.
      await withTimeout(
        callObj.join({
          userName: opts?.displayName ?? userName,
          url: `https://fixsense.daily.co/${targetRoom}`,
          ...(token ? { token } : {}),
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
  }, [roomName, meetingToken, userName, startWithVideoOff, startWithAudioOff, fetchMeetingToken, registerHandlers, snapshotParticipants, onJoined]);

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

  const toggleMic = useCallback(async () => {
    if (!_activeCallObject) return;
    const on = _activeCallObject.localAudio();
    await _activeCallObject.setLocalAudio(!on);
  }, []);

  const toggleCamera = useCallback(async () => {
    if (!_activeCallObject) return;
    const on = _activeCallObject.localVideo();
    await _activeCallObject.setLocalVideo(!on);
  }, []);

  // Cycle through video input devices (mobile front/back camera switch).
  const switchCamera = useCallback(async () => {
    if (!_activeCallObject) return;
    try {
      const devices = await _activeCallObject.enumerateDevices();
      const cams = (devices?.devices || []).filter((d: any) => d.kind === "videoinput" && d.deviceId);
      if (cams.length < 2) {
        toast.info("No secondary camera available.");
        return;
      }
      const cur = await _activeCallObject.getInputDevices();
      const currentId = cur?.camera?.deviceId;
      const nextIdx = Math.max(0, cams.findIndex((c: any) => c.deviceId === currentId)) + 1;
      const next = cams[nextIdx % cams.length];
      await _activeCallObject.setInputDevicesAsync({ videoDeviceId: next.deviceId });
    } catch (err) {
      console.error("[Daily] switchCamera failed", err);
      toast.error("Couldn't switch camera.");
    }
  }, []);

  // ── Screen share ───────────────────────────────────────────────────────────
  // FIX: `captureMethod: "user-choice"` (used previously) isn't a real
  // startScreenShare() option — it doesn't exist in Daily's current API, so it
  // was silently ignored and none of the constraints below were ever actually
  // applied. The real, documented option is `displayMediaOptions`, passed
  // straight through to the browser's getDisplayMedia() call. Explicitly
  // setting it here (rather than relying on Daily's defaults) is what actually
  // gets us: the option to share a tab/window/whole screen, system audio where
  // the browser supports it, and the "share this tab instead" switcher.
  const screenShareBusyRef = useRef(false);

  const startScreenShare = useCallback(async () => {
    if (!_activeCallObject) {
      toast.error("Not connected to the meeting yet.");
      return;
    }
    // Guard against double-taps starting two overlapping getDisplayMedia()
    // prompts, which is where "switch between camera and screen share without
    // leaving the meeting" tends to break in practice.
    if (screenShareBusyRef.current) return;

    const reason = getScreenShareUnavailableReason();
    if (reason) {
      toast.error(screenShareUnavailableMessage(reason), { duration: 7000 });
      return;
    }

    screenShareBusyRef.current = true;
    try {
      await _activeCallObject.startScreenShare({
        displayMediaOptions: {
          video: true,
          audio: true,               // offer to include tab/system audio where the browser supports it
          selfBrowserSurface: "exclude", // avoid the "hall of mirrors" of sharing this same tab
          surfaceSwitching: "include",   // let the user switch which tab/window is shared mid-share
          systemAudio: "include",
        },
        screenVideoSendSettings: {
          maxQuality: "medium",
          encodings: {
            low:    { maxBitrate: 600_000,   maxFramerate: 8 },
            medium: { maxBitrate: 1_200_000, maxFramerate: 15 },
          },
        },
      });
      // Confirmation (success/cancel toasts) happens in the
      // local-screen-share-started/-canceled handlers below — Daily has no
      // way to tell us synchronously whether the user actually picked
      // something, only whether the *call* to start it was rejected outright.
    } catch (err: any) {
      console.error("[Daily] Screen share failed:", extractDailyError(err), err);
      screenShareBusyRef.current = false;
      if (err?.name === "NotAllowedError") {
        // Covers both "user dismissed the picker" and "OS/browser permission
        // denied" — the browser doesn't distinguish these for us. Only the
        // second case needs the extra hint, so mention it without asserting
        // it's definitely what happened.
        toast.info(
          "Screen sharing didn't start. If you dismissed the picker, just try again — if it keeps happening, check your browser's or OS's screen-recording permission for this site.",
          { duration: 7000 },
        );
        return;
      }
      // One retry with minimal constraints — some browsers reject specific
      // constraint combinations (e.g. systemAudio) that aren't the reason
      // sharing itself is unsupported.
      try {
        screenShareBusyRef.current = true;
        await _activeCallObject.startScreenShare({ displayMediaOptions: { video: true, audio: true } });
      } catch (err2: any) {
        screenShareBusyRef.current = false;
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

  // ── Noise cancellation toggle ──────────────────────────────────────────────
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
    isScreenShareSupported: isScreenShareSupported(),
    screenShareUnavailableReason: getScreenShareUnavailableReason(),
    screenShareUnavailableMessage: (() => {
      const reason = getScreenShareUnavailableReason();
      return reason ? screenShareUnavailableMessage(reason) : null;
    })(),
    networkQuality, activeSpeakerId, activeSpeaker, participantCount,
    elapsedSeconds, error, noiseCancellation,
    participants: Array.from(participants.values()),
    localParticipant, remoteParticipants,
    handRaises,
    joinCall, leaveCall,
    setAudioEnabled, setVideoEnabled, toggleMic, toggleCamera, switchCamera,
    startScreenShare, stopScreenShare,
    startRecording, stopRecording,
    raiseHand, isHandRaised,
    setNoiseCancellation,
    callObject: _activeCallObject,
  };
}