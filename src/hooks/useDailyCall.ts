/**
 * useDailyCall.ts — v6 (Audio/Video Fix)
 *
 * KEY FIXES:
 *  1. Remote audio is now played automatically via Daily's built-in audio.
 *     Daily.co handles remote audio playback natively when subscribeToTracksAutomatically=true.
 *     We no longer need to manually attach audio tracks to <audio> elements.
 *  2. Video tracks are exposed via participant objects so VideoTile can attach them.
 *  3. Singleton guard prevents duplicate DailyIframe instances.
 *  4. Removed deprecated camSimulcastEncodings; uses updateSendSettings instead.
 */

import { useRef, useState, useCallback, useEffect } from "react";
import DailyIframe from "@daily-co/daily-js";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ─── Module-level singleton ────────────────────────────────────────────────────
let _activeCallObject: any = null;
let _activeRoomName: string | null = null;

function getOrCreateCallObject(opts: object): any {
  try {
    const existing = (DailyIframe as any).getCallInstance?.();
    if (existing) {
      _activeCallObject = existing;
      return existing;
    }
  } catch (_) {}

  if (_activeCallObject) return _activeCallObject;

  const co = DailyIframe.createCallObject(opts as any);
  _activeCallObject = co;
  return co;
}

function releaseCallObject() {
  if (_activeCallObject) {
    try { _activeCallObject.leave(); } catch (_) {}
    try { _activeCallObject.destroy(); } catch (_) {}
    _activeCallObject = null;
    _activeRoomName = null;
  }
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

const JOIN_TIMEOUT_MS = 30_000;

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

// ─── Extract tracks from Daily participant object ─────────────────────────────

function extractTracks(p: any): { videoTrack?: MediaStreamTrack; audioTrack?: MediaStreamTrack } {
  const videoTrack =
    p?.tracks?.video?.persistentTrack ??
    p?.tracks?.video?.track ??
    undefined;
  const audioTrack =
    p?.tracks?.audio?.persistentTrack ??
    p?.tracks?.audio?.track ??
    undefined;
  return { videoTrack, audioTrack };
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
      const { data: { session } } = await supabase.auth.getSession();
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
  }, []);

  // ── Build participant object from Daily p ─────────────────────────────────
  const buildParticipant = useCallback((p: any, fallbackName?: string): DailyParticipant => {
    const { videoTrack, audioTrack } = extractTracks(p);
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
    };
  }, []);

  // ── Register Daily event handlers ──────────────────────────────────────────
  const registerHandlers = useCallback((callObj: any) => {
    if (handlersRegisteredRef.current) return;
    handlersRegisteredRef.current = true;

    callObj.on("joined-meeting", (event: any) => {
      joinedRef.current = true;
      setCallState("joined");
      setError(null);

      // Populate participants map from current state
      const allParts = event?.participants ?? {};
      const newMap = new Map<string, DailyParticipant>();
      Object.values(allParts).forEach((p: any) => {
        newMap.set(p.session_id, buildParticipant(p, p.local ? userName : undefined));
      });
      setParticipants(newMap);
      setParticipantCount(newMap.size);
      onJoined?.();
      toast.success("Connected to meeting!");
    });

    callObj.on("left-meeting", () => {
      joinedRef.current = false;
      setCallState("idle");
      setParticipants(new Map());
      setIsRecording(false);
      setActiveSpeakerId(null);
      setError(null);
      handlersRegisteredRef.current = false;
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
      const { videoTrack, audioTrack } = extractTracks(p);
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
          });
        } else {
          // New participant we haven't seen yet
          next.set(p.session_id, buildParticipant(p));
        }
        return next;
      });
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
        typeof score === "number" ? score : score === "good" ? 4 : score === "low" ? 2 : 3
      );
      setNetworkQuality(quality);
      onNetworkQualityChange?.(quality);

      if (quality === "poor") {
        toast.warning("Weak connection — reducing video quality", { id: "network-warning" });
        callObj.updateSendSettings({
          video: { encodings: { low: { maxBitrate: 150000, maxFramerate: 15, scaleResolutionDownBy: 4 } } },
        }).catch(() => {});
      } else if (quality === "excellent" || quality === "good") {
        toast.dismiss("network-warning");
      }
    });

    callObj.on("error", (event: any) => {
      console.error("[Daily] Error:", event);
      const msg = event?.error?.msg ?? event?.error?.type ?? event?.errorMsg ?? "Connection error";
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
  }, [userName, buildParticipant, onJoined, onLeft, onParticipantJoined, onParticipantLeft, onRecordingStarted, onRecordingStopped, onNetworkQualityChange]);

  // ── Join call ──────────────────────────────────────────────────────────────
  const joinCall = useCallback(async (opts?: {
    rName?: string;
    token?: string;
    displayName?: string;
  }) => {
    const targetRoom = opts?.rName ?? roomName;
    if (!targetRoom) { toast.error("No room name provided"); return false; }

    if (_activeRoomName === targetRoom && _activeCallObject && joinedRef.current) {
      console.log("[Daily] Already connected to", targetRoom);
      setCallState("joined");
      isOwnerRef.current = true;
      return true;
    }

    setCallState("joining");
    setError(null);
    joinedRef.current = false;
    handlersRegisteredRef.current = false;

    try {
      if (!DailyIframe) throw new Error("Daily.co SDK failed to load");

      let token = opts?.token ?? meetingToken;
      if (!token) token = await fetchMeetingToken(targetRoom, true);

      if (_activeCallObject && _activeRoomName !== targetRoom) {
        try { await _activeCallObject.leave(); } catch (_) {}
        try { _activeCallObject.destroy(); } catch (_) {}
        _activeCallObject = null;
        _activeRoomName = null;
        handlersRegisteredRef.current = false;
      }

      const callObj = getOrCreateCallObject({
        url: `https://fixsense.daily.co/${targetRoom}`,
        token: token ?? undefined,
        audioSource: true,
        videoSource: !startWithVideoOff,
        // CRITICAL: this makes Daily auto-subscribe and play remote audio
        subscribeToTracksAutomatically: true,
        dailyConfig: {
          // Ensure remote audio plays through speaker automatically
          useDevicePreferenceCookies: false,
        },
        sendSettings: {
          video: {
            encodings: {
              low:    { maxBitrate: 150000, maxFramerate: 15, scaleResolutionDownBy: 4 },
              medium: { maxBitrate: 500000, maxFramerate: 24, scaleResolutionDownBy: 2 },
              high:   { maxBitrate: 1200000, maxFramerate: 30, scaleResolutionDownBy: 1 },
            },
          },
        },
      } as any);

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
    } catch (err: any) {
      let msg = "Failed to join meeting";
      if (err?.message) msg = err.message;
      else if (typeof err === "string") msg = err;

      console.error("[Daily] Join failed:", err);

      if (isOwnerRef.current) {
        releaseCallObject();
        isOwnerRef.current = false;
      }

      setError(msg);
      setCallState("error");
      handlersRegisteredRef.current = false;

      if (msg === "Connection timed out") {
        toast.error("Connection is taking too long. Tap Retry to try again.", { duration: 8000 });
      } else {
        toast.error(`Could not join meeting: ${msg}`);
      }
      return false;
    }
  }, [roomName, meetingToken, userName, startWithVideoOff, fetchMeetingToken, registerHandlers]);

  // ── Leave call ─────────────────────────────────────────────────────────────
  const leaveCall = useCallback(async () => {
    setCallState("leaving");
    handlersRegisteredRef.current = false;
    if (_activeCallObject) {
      try { await _activeCallObject.leave(); } catch (_) {}
    }
    if (isOwnerRef.current) {
      releaseCallObject();
      isOwnerRef.current = false;
    }
    setCallState("idle");
    joinedRef.current = false;
  }, []);

  const setAudioEnabled = useCallback(async (enabled: boolean) => {
    if (!_activeCallObject) return;
    await _activeCallObject.setLocalAudio(enabled);
  }, []);

  const setVideoEnabled = useCallback(async (enabled: boolean) => {
    if (!_activeCallObject) return;
    await _activeCallObject.setLocalVideo(enabled);
  }, []);

  const startScreenShare = useCallback(async () => {
    if (!_activeCallObject) return;
    await _activeCallObject.startScreenShare();
  }, []);

  const stopScreenShare = useCallback(async () => {
    if (!_activeCallObject) return;
    await _activeCallObject.stopScreenShare();
  }, []);

  const startRecording = useCallback(async () => {
    if (!_activeCallObject) return;
    await _activeCallObject.startRecording();
  }, []);

  const stopRecording = useCallback(async () => {
    if (!_activeCallObject) return;
    await _activeCallObject.stopRecording();
  }, []);

  // ── Cleanup on unmount ─────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      clearInterval(timerRef.current);
      if (isOwnerRef.current && _activeCallObject && !joinedRef.current) {
        try { _activeCallObject.destroy(); } catch (_) {}
        _activeCallObject = null;
        _activeRoomName = null;
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