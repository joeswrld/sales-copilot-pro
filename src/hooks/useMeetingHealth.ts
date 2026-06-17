/**
 * useMeetingHealth.ts
 *
 * Real-time meeting health monitoring:
 *  - Audio quality (mic level, silence detection)
 *  - Network quality (Daily.co metrics + Network Information API)
 *  - Transcription latency
 *  - AI analysis latency
 *  - Reconnection events
 *  - Logs events to Supabase for troubleshooting
 */

import { useRef, useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type HealthStatus = "excellent" | "good" | "fair" | "poor" | "unknown";

export interface MicHealth {
  level: number;           // 0-100 RMS volume
  isSilent: boolean;
  isClipping: boolean;
  deviceLabel: string | null;
}

export interface NetworkHealth {
  status: HealthStatus;
  rttMs: number | null;
  mbps: number | null;
  effectiveType: string | null;
  packetLoss: number | null;   // 0-1
  jitterMs: number | null;
}

export interface TranscriptionHealth {
  latencyMs: number | null;     // ms from audio chunk sent to transcript received
  chunksQueued: number;
  lastChunkAt: number | null;
  wordsPerMinute: number | null;
}

export interface AIHealth {
  latencyMs: number | null;
  lastAnalysisAt: number | null;
  objectionCount: number;
}

export interface MeetingHealth {
  mic: MicHealth;
  network: NetworkHealth;
  transcription: TranscriptionHealth;
  ai: AIHealth;
  reconnectCount: number;
  isHealthy: boolean;
  overallStatus: HealthStatus;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

async function logHealthEvent(
  callId: string,
  eventType: string,
  severity: "info" | "warn" | "error",
  metadata: Record<string, unknown>
) {
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/log-meeting-health`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify({ call_id: callId, event_type: eventType, severity, metadata }),
    });
  } catch {
    // Non-fatal
  }
}

export function useMeetingHealth(callId: string | null, micStream?: MediaStream | null) {
  const [health, setHealth] = useState<MeetingHealth>({
    mic:           { level: 0, isSilent: true, isClipping: false, deviceLabel: null },
    network:       { status: "unknown", rttMs: null, mbps: null, effectiveType: null, packetLoss: null, jitterMs: null },
    transcription: { latencyMs: null, chunksQueued: 0, lastChunkAt: null, wordsPerMinute: null },
    ai:            { latencyMs: null, lastAnalysisAt: null, objectionCount: 0 },
    reconnectCount: 0,
    isHealthy: true,
    overallStatus: "unknown",
  });

  const audioCtxRef   = useRef<AudioContext | null>(null);
  const analyserRef   = useRef<AnalyserNode | null>(null);
  const rafRef        = useRef<number>();
  const reconnectRef  = useRef(0);
  const chunkSentRef  = useRef<number | null>(null);
  const aiSentRef     = useRef<number | null>(null);
  const wordCountRef  = useRef(0);
  const wpmStartRef   = useRef<number | null>(null);

  // ── Mic level analysis ────────────────────────────────────────────────────
  useEffect(() => {
    if (!micStream) {
      cancelAnimationFrame(rafRef.current ?? 0);
      audioCtxRef.current?.close().catch(() => {});
      audioCtxRef.current = null;
      setHealth((h) => ({ ...h, mic: { level: 0, isSilent: true, isClipping: false, deviceLabel: null } }));
      return;
    }

    const ctx     = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.5;
    const source  = ctx.createMediaStreamSource(micStream);
    source.connect(analyser);
    audioCtxRef.current = ctx;
    analyserRef.current = analyser;

    const deviceLabel = micStream.getAudioTracks()[0]?.label ?? null;
    const buf = new Uint8Array(analyser.frequencyBinCount);

    const tick = () => {
      analyser.getByteFrequencyData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);
      const level = Math.min(100, Math.round((rms / 128) * 100));
      const isSilent = level < 3;
      const isClipping = level > 92;

      setHealth((h) => ({
        ...h,
        mic: { level, isSilent, isClipping, deviceLabel },
      }));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current ?? 0);
      ctx.close().catch(() => {});
    };
  }, [micStream]);

  // ── Network quality polling ───────────────────────────────────────────────
  useEffect(() => {
    const measure = () => {
      const conn = (navigator as any).connection ?? (navigator as any).mozConnection ?? null;
      const rttMs = conn?.rtt ?? null;
      const mbps  = conn?.downlink ?? null;
      const effectiveType = conn?.effectiveType ?? null;

      let status: HealthStatus = "unknown";
      if (rttMs !== null || mbps !== null) {
        if (rttMs !== null && rttMs > 500) status = "poor";
        else if (rttMs !== null && rttMs > 200) status = "fair";
        else if (mbps !== null && mbps < 1) status = "fair";
        else status = "good";
      }

      setHealth((h) => ({ ...h, network: { ...h.network, status, rttMs, mbps, effectiveType } }));
    };

    measure();
    const conn = (navigator as any).connection;
    conn?.addEventListener("change", measure);
    const id = setInterval(measure, 8_000);
    return () => { conn?.removeEventListener("change", measure); clearInterval(id); };
  }, []);

  // ── Online/offline ────────────────────────────────────────────────────────
  useEffect(() => {
    const onOffline = () => {
      setHealth((h) => ({ ...h, network: { ...h.network, status: "poor" } }));
      if (callId) logHealthEvent(callId, "network_offline", "warn", {});
    };
    const onOnline = () => {
      setHealth((h) => ({ ...h, network: { ...h.network, status: "good" } }));
      if (callId) logHealthEvent(callId, "network_restored", "info", {});
    };
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => { window.removeEventListener("offline", onOffline); window.removeEventListener("online", onOnline); };
  }, [callId]);

  // ── Derived overall status ────────────────────────────────────────────────
  useEffect(() => {
    setHealth((h) => {
      const statuses: HealthStatus[] = [h.network.status];
      if (h.transcription.latencyMs !== null) {
        statuses.push(h.transcription.latencyMs > 8000 ? "poor" : h.transcription.latencyMs > 4000 ? "fair" : "good");
      }
      const rank: Record<HealthStatus, number> = { excellent: 4, good: 3, fair: 2, poor: 1, unknown: 0 };
      const worst = statuses.sort((a, b) => rank[a] - rank[b])[0] ?? "unknown";
      return { ...h, overallStatus: worst, isHealthy: worst !== "poor" };
    });
  }, [health.network.status, health.transcription.latencyMs]);

  // ── Public callbacks ──────────────────────────────────────────────────────
  const recordChunkSent = useCallback(() => { chunkSentRef.current = Date.now(); }, []);

  const recordTranscriptReceived = useCallback((wordCount: number) => {
    const now = Date.now();
    const latencyMs = chunkSentRef.current ? now - chunkSentRef.current : null;
    wordCountRef.current += wordCount;
    if (!wpmStartRef.current) wpmStartRef.current = now;
    const elapsedMin = (now - (wpmStartRef.current ?? now)) / 60_000;
    const wordsPerMinute = elapsedMin > 0.1 ? Math.round(wordCountRef.current / elapsedMin) : null;
    setHealth((h) => ({
      ...h,
      transcription: { ...h.transcription, latencyMs, lastChunkAt: now, wordsPerMinute },
    }));
    chunkSentRef.current = null;
  }, []);

  const recordAIReceived = useCallback(() => {
    const latencyMs = aiSentRef.current ? Date.now() - aiSentRef.current : null;
    setHealth((h) => ({ ...h, ai: { ...h.ai, latencyMs, lastAnalysisAt: Date.now() } }));
    aiSentRef.current = null;
  }, []);

  const recordReconnect = useCallback(() => {
    reconnectRef.current += 1;
    setHealth((h) => ({ ...h, reconnectCount: reconnectRef.current }));
    if (callId) logHealthEvent(callId, "reconnect", "warn", { count: reconnectRef.current });
  }, [callId]);

  const updateDailyNetworkQuality = useCallback((quality: string, stats?: Record<string, unknown>) => {
    const statusMap: Record<string, HealthStatus> = {
      excellent: "excellent", good: "good", fair: "fair", poor: "poor",
    };
    const status = statusMap[quality] ?? "unknown";
    setHealth((h) => ({
      ...h,
      network: { ...h.network, status, packetLoss: (stats?.packetLoss as number) ?? null, jitterMs: (stats?.jitter as number) ?? null },
    }));
  }, []);

  return {
    health,
    recordChunkSent,
    recordTranscriptReceived,
    recordAIReceived,
    recordReconnect,
    updateDailyNetworkQuality,
  };
}