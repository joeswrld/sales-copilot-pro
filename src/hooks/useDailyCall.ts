/**
 * useDailyCall.ts
 *
 * Core Daily.co hook for Fixsense live meetings.
 *
 * v3 fix:
 *  - The Daily SDK is now imported directly as an npm package
 *    (@daily-co/daily-js) instead of being loaded via CDN <script> tags.
 *    CDN script loading was being blocked instantly (likely CSP / service
 *    worker), causing every join attempt to fail with no real error.
 *  - joinCall() still has a 15s overall timeout — if Daily doesn't fire
 *    "joined-meeting" in time, we abort, clean up, and surface a retryable
 *    error instead of an infinite spinner.
 *  - Optional startWithVideoOff to reduce initial bandwidth/negotiation load
 *    on weak connections, getting you into the meeting faster.
 */

import { useRef, useState, useCallback, useEffect } from "react";
import DailyIframe from "@daily-co/daily-js";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
  /** Start with camera off to speed up initial connection on weak networks */
  startWithVideoOff?: boolean;
  onJoined?: () => void;
  onLeft?: () => void;
  onParticipantJoined?: (p: DailyParticipant) => void;
  onParticipantLeft?: (sessionId: string) => void;
  onRecordingStarted?: () => void;
  onRecordingStopped?: () => void;
  onNetworkQualityChange?: (quality: CallQuality) => void;
}

const JOIN_TIMEOUT_MS = 15_000;

/** Race any promise against a timeout, throwing a labeled error if it fires first */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(label));
    }, ms);
    promise
      .then((val) => {
        clearTimeout(timer);
        resolve(val);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

// ─── Quality mapping ──────────────────────────────────────────────────────────

function networkScoreToQuality(score: number): CallQuality {
  if (score >= 4) return "excellent";
  if (score >= 3) return "good";
  if (score >= 2) return "fair";
  if (score >= 1) return "poor";
  return "disconnected";
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

  const callObjectRef = useRef<any>(null);
  const joinTimeRef = useRef<number>(0);
  const timerRef = useRef<number>();
  const joinedRef = useRef(false);

  // ── Timer ────────────────────────────────────────────────────────────────
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

  // ── Get fresh meeting token from edge function ────────────────────────────
  const fetchMeetingToken = useCallback(async (rName: string, isOwner = true): Promise<string | null> => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return null;
      const { data, error } = await withTimeout(
        supabase.functions.invoke("get-daily-token", {
          headers: { Authorization: `Bearer ${session.access_token}` },
          body: { room_name: rName, is_owner: isOwner },
        }),
        8_000,
        "Timed out fetching meeting token",
      );
      if (error || !data?.token) return null;
      return data.token;
    } catch {
      return null;
    }
  }, []);

  // ── Register Daily event handlers ─────────────────────────────────────────
  const registerHandlers = useCallback((callObj: any) => {
    callObj.on("joined-meeting", (event: any) => {
      joinedRef.current = true;
      setCallState("joined");
      setError(null);
      const localP = event?.participants?.local;
      if (localP) {
        setParticipants((prev) => {
          const next = new Map(prev);
          next.set(localP.session_id, {
            session_id: localP.session_id,
            user_name: localP.user_name ?? userName,
            local: true,
            audio: localP.audio ?? false,
            video: localP.video ?? false,
            screen: false,
            joinedAt: Date.now(),
          });
          return next;
        });
      }
      setParticipantCount(Object.keys(event?.participants ?? {}).length);
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
      onLeft?.();
    });

    callObj.on("participant-joined", (event: any) => {
      const p = event?.participant;
      if (!p) return;
      const participant: DailyParticipant = {
        session_id: p.session_id,
        user_name: p.user_name ?? "Participant",
        local: p.local ?? false,
        audio: p.audio ?? false,
        video: p.video ?? false,
        screen: p.screen ?? false,
        joinedAt: Date.now(),
        videoTrack: p.tracks?.video?.persistentTrack ?? undefined,
        audioTrack: p.tracks?.audio?.persistentTrack ?? undefined,
      };
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
      setParticipants((prev) => {
        const next = new Map(prev);
        const existing = next.get(p.session_id);
        if (existing) {
          next.set(p.session_id, {
            ...existing,
            audio: p.audio ?? existing.audio,
            video: p.video ?? existing.video,
            screen: p.screen ?? existing.screen,
            videoTrack: p.tracks?.video?.persistentTrack ?? existing.videoTrack,
            audioTrack: p.tracks?.audio?.persistentTrack ?? existing.audioTrack,
          });
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
        toast.warning("Weak connection detected — reducing video quality", { id: "network-warning" });
        callObj.setBandwidth({ kbs: 150, trackConstraints: { width: 480, height: 270 } }).catch(() => {});
      } else if (quality === "fair") {
        callObj.setBandwidth({ kbs: 400, trackConstraints: { width: 854, height: 480 } }).catch(() => {});
      } else if (quality === "excellent" || quality === "good") {
        toast.dismiss("network-warning");
        callObj.setBandwidth({ kbs: 0, trackConstraints: { width: 1280, height: 720 } }).catch(() => {});
      }
    });

    callObj.on("error", (event: any) => {
      console.error("[Daily] Error:", event);
      const msg = event?.error?.msg ?? event?.error?.type ?? "Connection error";
      setError(msg);
      setCallState("error");
      toast.error(`Meeting error: ${msg}`);
    });

    callObj.on("call-instance-destroyed", () => {
      setCallState("idle");
      callObjectRef.current = null;
    });
  }, [userName, onJoined, onLeft, onParticipantJoined, onParticipantLeft, onRecordingStarted, onRecordingStopped, onNetworkQualityChange]);

  // ── Internal: hard cleanup when join fails/times out ──────────────────────
  const forceCleanup = useCallback(async () => {
    if (callObjectRef.current) {
      try { await callObjectRef.current.leave(); } catch {}
      try { callObjectRef.current.destroy(); } catch {}
      callObjectRef.current = null;
    }
  }, []);

  // ── Join call ──────────────────────────────────────────────────────────────
  const joinCall = useCallback(async (opts?: {
    rName?: string;
    token?: string;
    displayName?: string;
  }) => {
    const targetRoom = opts?.rName ?? roomName;
    if (!targetRoom) { toast.error("No room name provided"); return false; }

    setCallState("joining");
    setError(null);
    joinedRef.current = false;

    try {
      if (!DailyIframe) throw new Error("Daily.co SDK failed to load");

      // 1. Get meeting token (bounded by its own internal timeout)
      let token = opts?.token ?? meetingToken;
      if (!token) {
        token = await fetchMeetingToken(targetRoom, true);
      }

      // 2. Destroy any existing call object
      await forceCleanup();

      const callObj = DailyIframe.createCallObject({
        url: `https://fixsense.daily.co/${targetRoom}`,
        token: token ?? undefined,
        audioSource: true,
        videoSource: !startWithVideoOff,
        subscribeToTracksAutomatically: true,
        // Lower default bitrate + simulcast for faster initial negotiation
        // on weaker networks. setBandwidth will adjust further once
        // network-quality-change fires.
        dailyConfig: {
          experimentalChromeVideoMuteLightOff: true,
          camSimulcastEncodings: [
            { maxBitrate: 150000, maxFramerate: 24, scaleResolutionDownBy: 4 },
            { maxBitrate: 500000, maxFramerate: 30, scaleResolutionDownBy: 1 },
          ],
        },
      });

      callObjectRef.current = callObj;
      registerHandlers(callObj);

      // 3. Join — bounded by JOIN_TIMEOUT_MS. If Daily doesn't resolve in
      // time, we abort, clean up, and surface a retryable error instead of
      // hanging on "Connecting…" forever.
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
      const msg = err?.message ?? "Failed to join meeting";
      console.error("[Daily] Join failed:", err);

      // Clean up any half-open call object so retry starts fresh
      await forceCleanup();

      setError(msg);
      setCallState("error");

      if (msg === "Connection timed out") {
        toast.error("Connection is taking too long. Tap Retry to try again.", {
          duration: 8000,
        });
      } else {
        toast.error(`Could not join meeting: ${msg}`);
      }
      return false;
    }
  }, [roomName, meetingToken, userName, startWithVideoOff, fetchMeetingToken, registerHandlers, forceCleanup]);

  // ── Leave call ─────────────────────────────────────────────────────────────
  const leaveCall = useCallback(async () => {
    setCallState("leaving");
    await forceCleanup();
    setCallState("idle");
  }, [forceCleanup]);

  // ── Mute/unmute ───────────────────────────────────────────────────────────
  const setAudioEnabled = useCallback(async (enabled: boolean) => {
    if (!callObjectRef.current) return;
    await callObjectRef.current.setLocalAudio(enabled);
  }, []);

  const setVideoEnabled = useCallback(async (enabled: boolean) => {
    if (!callObjectRef.current) return;
    await callObjectRef.current.setLocalVideo(enabled);
  }, []);

  // ── Screen share ──────────────────────────────────────────────────────────
  const startScreenShare = useCallback(async () => {
    if (!callObjectRef.current) return;
    await callObjectRef.current.startScreenShare();
  }, []);

  const stopScreenShare = useCallback(async () => {
    if (!callObjectRef.current) return;
    await callObjectRef.current.stopScreenShare();
  }, []);

  // ── Recording ─────────────────────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    if (!callObjectRef.current) return;
    await callObjectRef.current.startRecording();
  }, []);

  const stopRecording = useCallback(async () => {
    if (!callObjectRef.current) return;
    await callObjectRef.current.stopRecording();
  }, []);

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (callObjectRef.current) {
        try { callObjectRef.current.leave(); } catch {}
        try { callObjectRef.current.destroy(); } catch {}
        callObjectRef.current = null;
      }
      clearInterval(timerRef.current);
    };
  }, []);

  // ── Derived state ─────────────────────────────────────────────────────────
  const isConnected = callState === "joined";
  const isConnecting = callState === "joining";
  const localParticipant = Array.from(participants.values()).find((p) => p.local);
  const remoteParticipants = Array.from(participants.values()).filter((p) => !p.local);
  const activeSpeaker = activeSpeakerId ? participants.get(activeSpeakerId) : null;

  return {
    // State
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

    // Participants
    participants: Array.from(participants.values()),
    localParticipant,
    remoteParticipants,

    // Actions
    joinCall,
    leaveCall,
    setAudioEnabled,
    setVideoEnabled,
    startScreenShare,
    stopScreenShare,
    startRecording,
    stopRecording,

    // Raw call object for advanced use
    callObject: callObjectRef.current,
  };
}