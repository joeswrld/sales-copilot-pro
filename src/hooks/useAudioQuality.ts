/**
 * useAudioQuality.ts — v1
 *
 * Zoom/Google Meet-quality audio system for Fixsense.
 *
 * Two responsibilities:
 *   A) PRE-JOIN TESTS  — microphone level, speaker playback, network latency
 *   B) IN-CALL MONITOR — RTT, packet loss, jitter, bitrate, MOS score via
 *                         Daily.co's getNetworkStats() + WebRTC RTCPeerConnection
 *
 * Audio NEVER routes through Supabase or edge functions during a live call.
 * All audio is WebRTC/SFU via Daily.co's media servers (100–300ms latency).
 *
 * Audio profile target:
 *   Codec : Opus 48 kHz stereo (Daily default when we set correct constraints)
 *   NC    : Krisp (via Daily) or browser-native noise suppression
 *   EC    : Browser AEC (mandatory) + Krisp acoustic echo removal
 *   AGC   : Browser + Daily adaptive gain
 *   DTX   : Enabled — halts transmission during silence (saves bandwidth)
 *   FEC   : Forward error correction (Opus INBAND FEC, loss recovery)
 *   PLC   : Packet loss concealment active at Daily SFU layer
 */

import { useRef, useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

// ─── Types ────────────────────────────────────────────────────────────────────

export type TestStatus = "idle" | "running" | "passed" | "failed" | "warning";

export interface MicTestResult {
  status: TestStatus;
  peakLevel: number;       // 0-100 RMS peak during test
  avgLevel: number;        // average RMS
  deviceLabel: string | null;
  sampleRate: number | null;
  channelCount: number | null;
  errorMessage?: string;
}

export interface SpeakerTestResult {
  status: TestStatus;
  playing: boolean;
  errorMessage?: string;
}

export interface NetworkTestResult {
  status: TestStatus;
  rttMs: number | null;          // round-trip time
  downloadMbps: number | null;
  uploadMbps: number | null;     // estimated
  packetLossEst: number | null;  // 0-1
  jitterMs: number | null;
  effectiveType: string | null;
  canSupportHD: boolean;
  canSupportAudio: boolean;
  errorMessage?: string;
}

export interface LiveAudioStats {
  // Sourced from Daily.co getNetworkStats()
  rttMs: number | null;
  packetLoss: number | null;       // 0-1
  jitterMs: number | null;
  audioSendBitrate: number | null; // kbps
  audioRecvBitrate: number | null; // kbps
  videoSendBitrate: number | null; // kbps
  videoRecvBitrate: number | null; // kbps
  // Derived
  mosScore: number | null;         // 1-5 estimated MOS
  qualityLabel: "excellent" | "good" | "fair" | "poor" | "unknown";
  qualityColor: string;
  // Local
  micLevel: number;                // 0-100 live RMS
  isMicSilent: boolean;
  isMicClipping: boolean;
  // Reconnect tracking
  reconnectCount: number;
  lastReconnectAt: number | null;
}

export interface AudioQualityState {
  mic: MicTestResult;
  speaker: SpeakerTestResult;
  network: NetworkTestResult;
  liveStats: LiveAudioStats;
  allTestsPassed: boolean;
  isReadyToJoin: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MIC_TEST_DURATION_MS = 3000;
const STATS_POLL_MS = 2000;

const QUALITY_THRESHOLDS = {
  excellent: { rtt: 50,  loss: 0.01, jitter: 10 },
  good:      { rtt: 100, loss: 0.03, jitter: 20 },
  fair:      { rtt: 200, loss: 0.08, jitter: 50 },
} as const;

const QUALITY_COLORS = {
  excellent: "#10b981",
  good:      "#34d399",
  fair:      "#f59e0b",
  poor:      "#ef4444",
  unknown:   "#6b7280",
} as const;

// ─── Audio constraints for maximum quality ────────────────────────────────────
export const PREMIUM_AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation:   true,
  noiseSuppression:   true,
  autoGainControl:    true,
  // Opus 48 kHz is the browser/WebRTC default when these are set
  channelCount:       { ideal: 1 },  // mono for voice; saves bandwidth
  // latency hint (not typed on all TS libs but supported by Chrome/Edge)
  ...({ latency: { ideal: 0.01, max: 0.1 } } as any),
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Compute estimated MOS (Mean Opinion Score, 1-5) from RTT, loss, and jitter.
 * Uses the simplified E-model approximation commonly used for VoIP.
 */
function computeMOS(rttMs: number, lossRate: number, jitterMs: number): number {
  // Effective latency factor (one-way delay estimate)
  const oneWayMs = rttMs / 2 + jitterMs * 2;
  // Latency degradation factor (ITU-T G.107 simplified)
  const latencyFactor = oneWayMs < 150 ? 0 :
    oneWayMs < 400 ? (oneWayMs - 150) * 0.025 : 10;
  // Packet loss factor
  const lossFactor = lossRate * 80;

  const R = Math.max(0, 93.2 - latencyFactor - lossFactor);
  // R to MOS conversion (P.800.1 simplified)
  if (R < 0)  return 1;
  if (R > 100) return 4.5;
  return 1 + 0.035 * R + 7e-6 * R * (R - 60) * (100 - R);
}

function rttToQuality(rtt: number | null, loss: number | null, jitter: number | null) {
  if (rtt === null) return "unknown" as const;
  const r = rtt, l = loss ?? 0, j = jitter ?? 0;
  if (r <= QUALITY_THRESHOLDS.excellent.rtt && l <= QUALITY_THRESHOLDS.excellent.loss && j <= QUALITY_THRESHOLDS.excellent.jitter) return "excellent" as const;
  if (r <= QUALITY_THRESHOLDS.good.rtt    && l <= QUALITY_THRESHOLDS.good.loss    && j <= QUALITY_THRESHOLDS.good.jitter)    return "good"      as const;
  if (r <= QUALITY_THRESHOLDS.fair.rtt    && l <= QUALITY_THRESHOLDS.fair.loss    && j <= QUALITY_THRESHOLDS.fair.jitter)    return "fair"      as const;
  return "poor" as const;
}

function getNavConn(): any {
  if (typeof navigator === "undefined") return null;
  return (navigator as any).connection ?? (navigator as any).mozConnection ?? null;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

const DEFAULT_MIC: MicTestResult = {
  status: "idle", peakLevel: 0, avgLevel: 0,
  deviceLabel: null, sampleRate: null, channelCount: null,
};
const DEFAULT_SPEAKER: SpeakerTestResult = { status: "idle", playing: false };
const DEFAULT_NETWORK: NetworkTestResult = {
  status: "idle", rttMs: null, downloadMbps: null, uploadMbps: null,
  packetLossEst: null, jitterMs: null, effectiveType: null,
  canSupportHD: true, canSupportAudio: true,
};
const DEFAULT_LIVE: LiveAudioStats = {
  rttMs: null, packetLoss: null, jitterMs: null,
  audioSendBitrate: null, audioRecvBitrate: null,
  videoSendBitrate: null, videoRecvBitrate: null,
  mosScore: null, qualityLabel: "unknown", qualityColor: QUALITY_COLORS.unknown,
  micLevel: 0, isMicSilent: true, isMicClipping: false,
  reconnectCount: 0, lastReconnectAt: null,
};

export function useAudioQuality(callId?: string | null) {
  const [mic,     setMic]     = useState<MicTestResult>(DEFAULT_MIC);
  const [speaker, setSpeaker] = useState<SpeakerTestResult>(DEFAULT_SPEAKER);
  const [network, setNetwork] = useState<NetworkTestResult>(DEFAULT_NETWORK);
  const [live,    setLive]    = useState<LiveAudioStats>(DEFAULT_LIVE);

  // Refs for cleanup
  const micStreamRef   = useRef<MediaStream | null>(null);
  const audioCtxRef    = useRef<AudioContext | null>(null);
  const analyserRef    = useRef<AnalyserNode | null>(null);
  const rafRef         = useRef<number>(0);
  const statsTimerRef  = useRef<ReturnType<typeof setInterval>>();
  const speakerCtxRef  = useRef<AudioContext | null>(null);
  const dailyRef       = useRef<any>(null); // injected by caller
  const statsLogRef    = useRef<LiveAudioStats[]>([]);

  // ── A) PRE-JOIN: Microphone test ─────────────────────────────────────────

  const testMicrophone = useCallback(async (deviceId?: string): Promise<MicTestResult> => {
    setMic((p) => ({ ...p, status: "running" }));

    // Clean up previous stream
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    audioCtxRef.current?.close().catch(() => {});

    const constraints: MediaStreamConstraints = {
      audio: {
        ...PREMIUM_AUDIO_CONSTRAINTS,
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
      },
      video: false,
    };

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err: any) {
      const result: MicTestResult = {
        ...DEFAULT_MIC, status: "failed",
        errorMessage: err.name === "NotAllowedError"
          ? "Microphone permission denied. Please allow microphone access."
          : `Microphone unavailable: ${err.message}`,
      };
      setMic(result);
      return result;
    }

    micStreamRef.current = stream;
    const track = stream.getAudioTracks()[0];
    const settings = track?.getSettings?.() ?? {};

    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({
      sampleRate: 48000, // Request 48kHz for Opus quality
      latencyHint: "interactive",
    });
    audioCtxRef.current = ctx;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.5;
    const source = ctx.createMediaStreamSource(stream);
    source.connect(analyser);
    analyserRef.current = analyser;

    // Sample for MIC_TEST_DURATION_MS
    const buf = new Uint8Array(analyser.frequencyBinCount);
    let peak = 0, sumSquares = 0, samples = 0;
    const startTime = Date.now();

    return new Promise<MicTestResult>((resolve) => {
      const sample = () => {
        analyser.getByteFrequencyData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        const rms = Math.sqrt(sum / buf.length);
        const lvl = Math.min(100, Math.round((rms / 128) * 100));
        peak = Math.max(peak, lvl);
        sumSquares += lvl * lvl;
        samples++;

        if (Date.now() - startTime < MIC_TEST_DURATION_MS) {
          rafRef.current = requestAnimationFrame(sample);
        } else {
          const avgLevel = samples > 0 ? Math.sqrt(sumSquares / samples) : 0;
          const result: MicTestResult = {
            status: peak > 5 ? "passed" : "warning",
            peakLevel: peak,
            avgLevel: Math.round(avgLevel),
            deviceLabel: track?.label ?? null,
            sampleRate: (settings as any).sampleRate ?? ctx.sampleRate,
            channelCount: (settings as any).channelCount ?? 1,
            errorMessage: peak <= 5 ? "No audio detected. Please speak into your microphone." : undefined,
          };
          setMic(result);
          resolve(result);
        }
      };
      rafRef.current = requestAnimationFrame(sample);
    });
  }, []);

  // Keep mic stream alive for live level meter during pre-join
  const startMicLevelMeter = useCallback((stream: MediaStream) => {
    if (audioCtxRef.current?.state !== "running" && !analyserRef.current) {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 48000,
        latencyHint: "interactive",
      });
      audioCtxRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.4;
      ctx.createMediaStreamSource(stream).connect(analyser);
      analyserRef.current = analyser;
    }

    const buf = new Uint8Array(analyserRef.current!.frequencyBinCount);
    const tick = () => {
      analyserRef.current!.getByteFrequencyData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);
      const level = Math.min(100, Math.round((rms / 128) * 100));
      setLive((p) => ({
        ...p,
        micLevel: level,
        isMicSilent: level < 3,
        isMicClipping: level > 92,
      }));
      rafRef.current = requestAnimationFrame(tick);
    };
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const stopMicLevelMeter = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
  }, []);

  // ── B) PRE-JOIN: Speaker test ─────────────────────────────────────────────

  const testSpeaker = useCallback(async (): Promise<SpeakerTestResult> => {
    setSpeaker({ status: "running", playing: true });
    speakerCtxRef.current?.close().catch(() => {});

    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 48000,
        latencyHint: "interactive",
      });
      speakerCtxRef.current = ctx;

      // Generate a pleasant 440Hz tone (A4) for 1.5s — immediately audible
      const duration = 1.5;
      const sampleRate = ctx.sampleRate;
      const buffer = ctx.createBuffer(1, sampleRate * duration, sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        // Fade in/out to avoid clicks
        const fade = Math.min(1, Math.min(i / (sampleRate * 0.05), (data.length - i) / (sampleRate * 0.1)));
        data[i] = fade * 0.3 * Math.sin(2 * Math.PI * 440 * i / sampleRate);
      }

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);

      return new Promise<SpeakerTestResult>((resolve) => {
        source.onended = () => {
          ctx.close().catch(() => {});
          const result: SpeakerTestResult = { status: "passed", playing: false };
          setSpeaker(result);
          resolve(result);
        };
        source.start();
      });
    } catch (err: any) {
      const result: SpeakerTestResult = {
        status: "failed", playing: false,
        errorMessage: `Speaker test failed: ${err.message}`,
      };
      setSpeaker(result);
      return result;
    }
  }, []);

  // ── C) PRE-JOIN: Network test ─────────────────────────────────────────────

  const testNetwork = useCallback(async (): Promise<NetworkTestResult> => {
    setNetwork((p) => ({ ...p, status: "running" }));

    const conn = getNavConn();
    const effectiveType: string | null = conn?.effectiveType ?? null;
    const downloadMbps: number | null = conn?.downlink ?? null;
    const rttFromNav: number | null = conn?.rtt ?? null;

    // Probe RTT to Supabase (same region as Daily.co EU)
    let rttMs: number | null = null;
    let jitterMs: number | null = null;
    const probeUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/log-meeting-health`;

    try {
      const samples: number[] = [];
      for (let i = 0; i < 4; i++) {
        const t0 = performance.now();
        try {
          await fetch(probeUrl, { method: "HEAD", signal: AbortSignal.timeout(3000) });
        } catch {}
        samples.push(performance.now() - t0);
        if (i < 3) await new Promise((r) => setTimeout(r, 200));
      }
      const sorted = [...samples].sort((a, b) => a - b).slice(1, -1); // trim outliers
      rttMs = Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length);
      // Jitter = standard deviation of RTT samples
      const mean = rttMs;
      const variance = sorted.reduce((s, v) => s + (v - mean) ** 2, 0) / sorted.length;
      jitterMs = Math.round(Math.sqrt(variance));
    } catch {
      rttMs = rttFromNav; // fallback to Navigation API
    }

    const effectiveRtt = rttMs ?? rttFromNav ?? 999;
    const canSupportAudio = effectiveRtt < 500 && (downloadMbps === null || downloadMbps > 0.1);
    const canSupportHD    = effectiveRtt < 200 && (downloadMbps === null || downloadMbps > 1.5);

    const result: NetworkTestResult = {
      status: canSupportAudio ? (effectiveRtt < 200 ? "passed" : "warning") : "failed",
      rttMs, downloadMbps, uploadMbps: null,
      packetLossEst: null, jitterMs, effectiveType,
      canSupportHD, canSupportAudio,
      errorMessage: !canSupportAudio
        ? `Network too slow for audio calls (RTT: ${effectiveRtt}ms). Move closer to your router.`
        : effectiveRtt >= 200
        ? `High latency detected (${effectiveRtt}ms). Audio may have occasional delays.`
        : undefined,
    };
    setNetwork(result);
    return result;
  }, []);

  // ── Run all three pre-join tests ─────────────────────────────────────────

  const runAllTests = useCallback(async () => {
    const [m, , n] = await Promise.all([
      testMicrophone(),
      testSpeaker(),
      testNetwork(),
    ]);
    return { mic: m, network: n };
  }, [testMicrophone, testSpeaker, testNetwork]);

  // ── D) IN-CALL: Poll Daily.co network stats ───────────────────────────────

  /**
   * Call this once the Daily call is joined. Pass the callObject reference.
   * Stats are polled every STATS_POLL_MS and stored for logging.
   */
  const startLiveMonitoring = useCallback((callObject: any, micStream?: MediaStream | null) => {
    dailyRef.current = callObject;
    if (micStream) startMicLevelMeter(micStream);

    clearInterval(statsTimerRef.current);
    statsTimerRef.current = setInterval(async () => {
      if (!callObject) return;

      try {
        // Daily.co v0.70+ exposes getNetworkStats()
        const stats = await callObject.getNetworkStats?.();
        const s = stats?.stats ?? stats ?? {};

        const rttMs: number | null = s.latest?.videoSend?.roundTripTime != null
          ? Math.round(s.latest.videoSend.roundTripTime * 1000)
          : s.latest?.audioSend?.roundTripTime != null
          ? Math.round(s.latest.audioSend.roundTripTime * 1000)
          : (s.quality?.rtt ?? null);

        const packetLoss: number | null =
          s.latest?.audioReceive?.packetsLostPercent != null
            ? s.latest.audioReceive.packetsLostPercent / 100
            : s.latest?.videoReceive?.packetsLostPercent != null
            ? s.latest.videoReceive.packetsLostPercent / 100
            : null;

        const jitterMs: number | null =
          s.latest?.audioReceive?.jitter != null
            ? Math.round(s.latest.audioReceive.jitter * 1000)
            : null;

        const audioSendBitrate: number | null =
          s.latest?.audioSend?.bitrate != null
            ? Math.round(s.latest.audioSend.bitrate / 1000)
            : null;

        const audioRecvBitrate: number | null =
          s.latest?.audioReceive?.bitrate != null
            ? Math.round(s.latest.audioReceive.bitrate / 1000)
            : null;

        const videoSendBitrate: number | null =
          s.latest?.videoSend?.bitrate != null
            ? Math.round(s.latest.videoSend.bitrate / 1000)
            : null;

        const videoRecvBitrate: number | null =
          s.latest?.videoReceive?.bitrate != null
            ? Math.round(s.latest.videoReceive.bitrate / 1000)
            : null;

        const mosScore = (rttMs !== null && packetLoss !== null && jitterMs !== null)
          ? Math.round(computeMOS(rttMs, packetLoss, jitterMs) * 10) / 10
          : null;

        const qualityLabel = rttToQuality(rttMs, packetLoss, jitterMs);
        const qualityColor = QUALITY_COLORS[qualityLabel];

        setLive((prev) => {
          const next: LiveAudioStats = {
            ...prev,
            rttMs, packetLoss, jitterMs,
            audioSendBitrate, audioRecvBitrate,
            videoSendBitrate, videoRecvBitrate,
            mosScore, qualityLabel, qualityColor,
          };
          statsLogRef.current = [...statsLogRef.current.slice(-29), next]; // keep last 30 samples
          return next;
        });
      } catch {
        // getNetworkStats not available or call ended — silently skip
      }
    }, STATS_POLL_MS);
  }, [startMicLevelMeter]);

  const stopLiveMonitoring = useCallback(() => {
    clearInterval(statsTimerRef.current);
    stopMicLevelMeter();
  }, [stopMicLevelMeter]);

  // ── E) Track reconnects ───────────────────────────────────────────────────

  const recordReconnect = useCallback(() => {
    setLive((p) => ({
      ...p,
      reconnectCount: p.reconnectCount + 1,
      lastReconnectAt: Date.now(),
    }));
  }, []);

  // ── F) Log stats to Supabase (non-blocking, fire-and-forget) ─────────────

  const flushStatsLog = useCallback(async () => {
    if (!callId || statsLogRef.current.length === 0) return;
    const samples = statsLogRef.current;
    statsLogRef.current = [];
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/audio-quality-stats`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ call_id: callId, samples }),
          signal: AbortSignal.timeout(5000),
        }
      );
    } catch {
      // Non-fatal
    }
  }, [callId]);

  // Flush every 30s during call
  useEffect(() => {
    if (!callId) return;
    const id = setInterval(flushStatsLog, 30_000);
    return () => {
      clearInterval(id);
      flushStatsLog(); // final flush on unmount
    };
  }, [callId, flushStatsLog]);

  // ── G) Cleanup ────────────────────────────────────────────────────────────

  const cleanup = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    clearInterval(statsTimerRef.current);
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    audioCtxRef.current?.close().catch(() => {});
    speakerCtxRef.current?.close().catch(() => {});
    micStreamRef.current = null;
    audioCtxRef.current = null;
    analyserRef.current = null;
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  // ── Derived state ─────────────────────────────────────────────────────────

  const allTestsPassed =
    (mic.status === "passed" || mic.status === "warning") &&
    (speaker.status === "passed") &&
    (network.status === "passed" || network.status === "warning");

  const isReadyToJoin = allTestsPassed || (
    mic.status !== "failed" && network.canSupportAudio
  );

  return {
    mic,
    speaker,
    network,
    liveStats: live,
    allTestsPassed,
    isReadyToJoin,
    // Actions
    testMicrophone,
    testSpeaker,
    testNetwork,
    runAllTests,
    startLiveMonitoring,
    stopLiveMonitoring,
    startMicLevelMeter,
    stopMicLevelMeter,
    recordReconnect,
    flushStatsLog,
    cleanup,
    // Exposed stream for reuse (caller avoids requesting mic twice)
    getMicStream: () => micStreamRef.current,
  };
}

// ─── Export audio constraints for use in useDailyCall ────────────────────────
export { PREMIUM_AUDIO_CONSTRAINTS as DAILY_AUDIO_CONSTRAINTS };