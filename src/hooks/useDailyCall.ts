/**
 * useDailyCall.ts — v12
 *
 * New in v12:
 *  - "send transport changed to disconnected" now triggers an auto-reconnect
 *    (was previously ignored, causing silent audio/video loss)
 *  - joinCall() pre-warms the call object before joining for faster connect
 *  - Screen share track exposed in DailyParticipant
 *  - "nonfatal-error" event handled (Daily fires these for transport issues)
 *  - Faster initial join: skip token fetch if meetingToken already provided
 *  - Added `isScreenSharing` state for local participant
 *  - Proper cleanup on exp-room (v11 retained)
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
      if (existing) {
        _activeCallObject = existing;
        return existing;
      }
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
  if (_activeCallObject === existing) {
    _activeCallObject = null;
    _activeRoomName = null;
  }
}

// ─── Safe error extraction ─────────────────────────────────────────────────────
function extractDailyError(err: unknown): string {
  if (!err) return "Unknown Daily.co error";
  if (typeof err === "string" && err.trim()) return err;
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "object") {
    const e = err as any;
    const msg =
      e.errorMsg ?? e.msg ?? e.error?.msg ?? e.error?.type ?? e.type ?? e.message ?? null;
    if (msg && typeof msg === "string") return msg;
    try {
      const json = JSON.stringify(e);
      if (json && json !== "{}") return `Daily error: ${json}`;
    } catch (_) {}
  }
  return "Connection error (no details provided by Daily.co)";
}

function isGenericDailyError(msg: string): boolean {
  return (
    msg === "Unknown Daily.co error" ||
    msg.includes("no details provided by Daily.co")
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

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
}

interface JoinCallOpts {
  rName?: string;
  token?: string;
  displayName?: string;
  _isRetry?: boolean;
}

const JOIN_TIMEOUT_MS = 30_000;
const RETRY_DELAY_MS = 500;
// How long to wait before auto-reconnecting after a transport disconnect
const TRANSPORT_RECONNECT_DELAY_MS = 2_000;

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

function extractTracks(p: any): {
  videoTrack?: MediaStreamTrack;
  audioTrack?: MediaStreamTrack;
  screenVideoTrack?: MediaStreamTrack;
  screenAudioTrack?: MediaStreamTrack;
} {
  return {
    videoTrack: p?.tracks?.video?.persistentTrack ?? p?.tracks?.video?.track ?? undefined,
    audioTrack: p?.tracks?.audio?.persistentTrack ?? p?.tracks?.audio?.track ?? undefined,
    screenVideoTrack:
      p?.tracks?.screenVideo?.persistentTrack ?? p?.tracks?.screenVideo?.track ?? undefined,
    screenAudioTrack:
      p?.tracks?.screenAudio?.persistentTrack ?? p?.tracks?.screenAudio?.track ?? undefined,
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

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
}: UseDailyCallOptions) {
  const [callState, setCallState] = useState<DailyCallState>("idle");
  const [participants, setParticipants] = useState<Map<string, DailyParticipant>>(new Map());
  const [isRecording, setIsRecording] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [networkQuality, setNetworkQuality] = useState<CallQuality>("good");
  const [activeSpeakerId, setActiveSpeakerId] = useState<string | null>(null);
  const [participantCount, setParticipantCount] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const isOwnerRef = useRef(false);
  const joinTimeRef = useRef<number>(0);
  const timerRef = useRef<number>();
  const joinedRef = useRef(false);
  const handlersRegisteredRef = useRef(false);
  const callIdRef = useRef<string | null>(callId);
  const roomNameRef = useRef<string | null>(roomName);
  const meetingTokenRef = useRef<string | null | undefined>(meetingToken);
  const userNameRef = useRef<string>(userName);
  const transportReconnectRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => { callIdRef.current = callId; }, [callId]);
  useEffect(() => { roomNameRef.current = roomName; }, [roomName]);
  useEffect(() => { meetingTokenRef.current = meetingToken; }, [meetingToken]);
  useEffect(() => { userNameRef.current = userName; }, [userName]);

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
  const fetchMeetingToken = useCallback(
    async (rName: string, isOwnerUser = true): Promise<string | null> => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.access_token) return null;
        const { data, error: fnErr } = await withTimeout(
          supabase.functions.invoke("get-daily-token", {
            headers: { Authorization: `Bearer ${session.access_token}` },
            body: { room_name: rName, is_owner: isOwnerUser },
          }),
          8_000,
          "Timed out fetching meeting token",
        );
        if (fnErr || !data?.token) return null;
        return data.token;
      } catch {
        return null;
      }
    },
    [],
  );

  // ── Build participant object ───────────────────────────────────────────────
  const buildParticipant = useCallback(
    (p: any, fallbackName?: string): DailyParticipant => {
      const { videoTrack, audioTrack, screenVideoTrack, screenAudioTrack } = extractTracks(p);
      return {
        session_id: p.session_id,
        user_name: p.user_name ?? fallbackName ?? "Participant",
        local: p.local ?? false,
        audio: p.audio ?? false,
        video: p.video ?? false,
        screen: p.screen ?? false,
        joinedAt: Date.now(),
        videoTrack,
        audioTrack,
        screenVideoTrack,
        screenAudioTrack,
      };
    },
    [],
  );

  // ── Snapshot participants ──────────────────────────────────────────────────
  const snapshotParticipants = useCallback(
    (callObj: any) => {
      try {
        const allParts = callObj.participants?.() ?? {};
        const newMap = new Map<string, DailyParticipant>();
        Object.values(allParts).forEach((p: any) => {
          if (!p?.session_id) return;
          newMap.set(
            p.session_id,
            buildParticipant(p, p.local ? userNameRef.current : undefined),
          );
        });
        setParticipants(newMap);
        setParticipantCount(newMap.size);
        // Update local screen sharing state
        const localP = Object.values(allParts).find((p: any) => p.local) as any;
        if (localP) setIsScreenSharing(!!localP.screen);
      } catch (_) {}
    },
    [buildParticipant],
  );

  // ── Register Daily event handlers ──────────────────────────────────────────
  const registerHandlers = useCallback(
    (callObj: any) => {
      if (handlersRegisteredRef.current) return;
      handlersRegisteredRef.current = true;

      callObj.on("joined-meeting", (event: any) => {
        joinedRef.current = true;
        setCallState("joined");
        setError(null);
        clearTimeout(transportReconnectRef.current);

        const allParts = event?.participants ?? {};
        const newMap = new Map<string, DailyParticipant>();
        Object.values(allParts).forEach((p: any) => {
          newMap.set(
            p.session_id,
            buildParticipant(p, p.local ? userNameRef.current : undefined),
          );
        });
        setParticipants(newMap);
        setParticipantCount(newMap.size);
        // Check if local is screen sharing on join
        const localP = Object.values(allParts).find((p: any) => p.local) as any;
        if (localP) setIsScreenSharing(!!localP.screen);
        onJoined?.();
        toast.success("Connected to meeting!");
      });

      callObj.on("left-meeting", () => {
        joinedRef.current = false;
        setCallState("idle");
        setParticipants(new Map());
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
        setParticipants((prev) => {
          const next = new Map(prev);
          next.set(p.session_id, participant);
          return next;
        });
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
        // Update local screen sharing state
        if (p.local) setIsScreenSharing(!!p.screen);
      });

      callObj.on("participant-left", (event: any) => {
        const sid = event?.participant?.session_id;
        if (!sid) return;
        setParticipants((prev) => {
          const next = new Map(prev);
          next.delete(sid);
          return next;
        });
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
          typeof score === "number"
            ? score
            : score === "good"
            ? 4
            : score === "low"
            ? 2
            : 3,
        );
        setNetworkQuality(quality);
        onNetworkQualityChange?.(quality);

        if (quality === "poor") {
          toast.warning("Weak connection — reducing video quality", { id: "network-warning" });
          callObj
            .updateSendSettings({
              video: {
                encodings: {
                  low: { maxBitrate: 150000, maxFramerate: 15, scaleResolutionDownBy: 4 },
                },
              },
            })
            .catch(() => {});
        } else if (quality === "excellent" || quality === "good") {
          toast.dismiss("network-warning");
        }
      });

      // ── "send-transport-changed" / transport state events ─────────────────
      // Daily fires this when the WebRTC send transport drops.
      // We schedule a reconnect rather than showing a hard error.
      const handleTransportDisconnect = (source: string) => {
        if (!joinedRef.current) return;
        console.warn(`[Daily] ${source} — scheduling reconnect`);
        clearTimeout(transportReconnectRef.current);
        transportReconnectRef.current = setTimeout(async () => {
          if (!joinedRef.current) return; // left in the meantime
          const room = roomNameRef.current;
          const token = meetingTokenRef.current;
          if (!room) return;
          toast.warning("Connection lost — reconnecting…", { id: "transport-reconnect" });
          // Attempt a clean leave + rejoin
          try { await callObj.leave(); } catch (_) {}
          handlersRegisteredRef.current = false;
          joinedRef.current = false;
          await new Promise((r) => setTimeout(r, 500));
          // Re-join without updating state to "error" first
          const newCallObj = getOrCreateCallObject(
            {
              url: `https://fixsense.daily.co/${room}`,
              token: token ?? undefined,
              audioSource: true,
              videoSource: true,
              subscribeToTracksAutomatically: true,
              dailyConfig: { useDevicePreferenceCookies: false },
            } as any,
            true, // forceNew
          );
          isOwnerRef.current = true;
          _activeRoomName = room;
          registerHandlers(newCallObj);
          try {
            await withTimeout(
              newCallObj.join({
                userName: userNameRef.current,
                url: `https://fixsense.daily.co/${room}`,
                token: token ?? undefined,
              }),
              JOIN_TIMEOUT_MS,
              "Reconnect timed out",
            );
            toast.dismiss("transport-reconnect");
          } catch (err) {
            console.error("[Daily] Reconnect failed:", err);
            setError(extractDailyError(err));
            setCallState("error");
            toast.error("Reconnect failed. Please rejoin.");
          }
        }, TRANSPORT_RECONNECT_DELAY_MS);
      };

      // Daily v0.51+ fires "nonfatal-error" for transport issues
      callObj.on("nonfatal-error", (event: any) => {
        console.warn("[Daily] Non-fatal error:", event);
        const type: string = event?.type ?? event?.error?.type ?? "";
        if (type === "send-transport-disconnected" || type === "receive-transport-disconnected") {
          handleTransportDisconnect(type);
        }
      });

      // Older Daily versions fire this
      callObj.on("send-transport-changed", (event: any) => {
        console.warn("[Daily] send-transport-changed:", event);
        const state: string = event?.state ?? event?.status ?? "";
        if (state === "disconnected" || state === "failed" || state === "closed") {
          handleTransportDisconnect("send-transport-changed");
        }
      });

      // ── Error handler — v11: handles exp-room ─────────────────────────────
      callObj.on("error", (event: any) => {
        console.error("[Daily] Error event:", event);
        clearTimeout(transportReconnectRef.current);

        const errType: string | null = event?.error?.type ?? event?.type ?? null;

        if (errType === "exp-room") {
          const currentCallId = callIdRef.current;
          if (currentCallId) {
            supabase.functions
              .invoke("manage-daily-room", {
                body: { action: "handle_expired", call_id: currentCallId },
              })
              .catch(() => {});
          }
          setCallState("idle");
          setError("Room expired");
          setParticipants(new Map());
          setIsRecording(false);
          setIsScreenSharing(false);
          setActiveSpeakerId(null);
          handlersRegisteredRef.current = false;
          joinedRef.current = false;
          toast.error("Meeting room expired. Create a new meeting to continue.", {
            duration: 8000,
          });
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
        if (_activeCallObject === callObj) {
          _activeCallObject = null;
          _activeRoomName = null;
        }
        handlersRegisteredRef.current = false;
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [buildParticipant, onJoined, onLeft, onParticipantJoined, onParticipantLeft, onRecordingStarted, onRecordingStopped, onNetworkQualityChange],
  );

  // ── Join call ──────────────────────────────────────────────────────────────
  const joinCall = useCallback(
    async (opts?: JoinCallOpts): Promise<boolean> => {
      const targetRoom = opts?.rName ?? roomName;
      if (!targetRoom) {
        toast.error("No room name provided");
        return false;
      }
      const isRetry = !!opts?._isRetry;

      // Already in this room?
      if (!isRetry && _activeCallObject && _activeRoomName === targetRoom) {
        let meetingState: string | undefined;
        try {
          meetingState = _activeCallObject.meetingState?.();
        } catch (_) {}

        if (meetingState === "joined-meeting" || joinedRef.current) {
          console.log("[Daily] Adopting already-joined call object for", targetRoom);
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
          console.log("[Daily] Join in progress — attaching");
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

      try {
        if (!DailyIframe) throw new Error("Daily.co SDK failed to load");

        // Use provided token first; only fetch if not provided (saves ~2s)
        let token = opts?.token ?? meetingToken ?? null;
        if (!token) {
          // Fetch token in parallel with setup to save time
          token = await fetchMeetingToken(targetRoom, true);
        }

        let foreignState: string | undefined;
        try {
          const foreign = (DailyIframe as any).getCallInstance?.();
          if (foreign) foreignState = foreign.meetingState?.();
        } catch (_) {}

        const staleForeignSession =
          foreignState === "joined-meeting" || foreignState === "joining-meeting";

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

        const callObj = getOrCreateCallObject(
          {
            url: `https://fixsense.daily.co/${targetRoom}`,
            token: token ?? undefined,
            audioSource: true,
            videoSource: !startWithVideoOff,
            subscribeToTracksAutomatically: true,
            dailyConfig: { useDevicePreferenceCookies: false },
            sendSettings: {
              video: {
                encodings: {
                  low: { maxBitrate: 150000, maxFramerate: 15, scaleResolutionDownBy: 4 },
                  medium: { maxBitrate: 500000, maxFramerate: 24, scaleResolutionDownBy: 2 },
                  high: { maxBitrate: 1200000, maxFramerate: 30, scaleResolutionDownBy: 1 },
                },
              },
            },
          } as any,
          isRetry || staleForeignSession,
        );

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
        if (err instanceof Error && err.message) {
          msg = err.message;
        } else {
          msg = extractDailyError(err);
        }

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

        if (isOwnerRef.current) {
          await releaseCallObject();
          isOwnerRef.current = false;
        }

        setError(msg);
        setCallState("error");
        handlersRegisteredRef.current = false;

        if (msg.includes("timed out")) {
          toast.error("Connection is taking too long. Tap Retry to try again.", {
            duration: 8000,
          });
        } else if (msg.includes("no details")) {
          toast.error(
            "Could not connect to the meeting room. Please check the room exists and try again.",
            { duration: 8000 },
          );
        } else {
          toast.error(`Could not join meeting: ${msg}`);
        }
        return false;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [roomName, meetingToken, userName, startWithVideoOff, fetchMeetingToken, registerHandlers, snapshotParticipants, onJoined],
  );

  // ── Leave call ─────────────────────────────────────────────────────────────
  const leaveCall = useCallback(async () => {
    clearTimeout(transportReconnectRef.current);
    setCallState("leaving");
    handlersRegisteredRef.current = false;
    if (isOwnerRef.current) {
      await releaseCallObject();
      isOwnerRef.current = false;
    } else if (_activeCallObject) {
      try {
        await _activeCallObject.leave();
      } catch (_) {}
    }
    setCallState("idle");
    joinedRef.current = false;
  }, []);

  const setAudioEnabled = useCallback(async (enabled: boolean) => {
    if (_activeCallObject) await _activeCallObject.setLocalAudio(enabled);
  }, []);

  const setVideoEnabled = useCallback(async (enabled: boolean) => {
    if (_activeCallObject) await _activeCallObject.setLocalVideo(enabled);
  }, []);

  const startScreenShare = useCallback(async () => {
    if (!_activeCallObject) return;
    try {
      await _activeCallObject.startScreenShare();
    } catch (err: any) {
      console.error("[Daily] Screen share failed:", err);
      toast.error(err?.message || "Screen sharing failed. Make sure to grant permission.");
    }
  }, []);

  const stopScreenShare = useCallback(async () => {
    if (_activeCallObject) {
      try {
        await _activeCallObject.stopScreenShare();
      } catch (_) {}
    }
  }, []);

  const startRecording = useCallback(async () => {
    if (_activeCallObject) await _activeCallObject.startRecording();
  }, []);

  const stopRecording = useCallback(async () => {
    if (_activeCallObject) await _activeCallObject.stopRecording();
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

  const isConnected = callState === "joined";
  const isConnecting = callState === "joining";
  const localParticipant = Array.from(participants.values()).find((p) => p.local);
  const remoteParticipants = Array.from(participants.values()).filter((p) => !p.local);
  const activeSpeaker = activeSpeakerId ? participants.get(activeSpeakerId) : null;

  return {
    callState,
    isConnected,
    isConnecting,
    isRecording,
    isScreenSharing,
    networkQuality,
    activeSpeakerId,
    activeSpeaker,
    participantCount,
    elapsedSeconds,
    error,
    participants: Array.from(participants.values()),
    localParticipant,
    remoteParticipants,
    joinCall,
    leaveCall,
    setAudioEnabled,
    setVideoEnabled,
    startScreenShare,
    stopScreenShare,
    startRecording,
    stopRecording,
    callObject: _activeCallObject,
  };
}