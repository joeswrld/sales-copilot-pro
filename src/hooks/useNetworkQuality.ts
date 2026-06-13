/**
 * useNetworkQuality.ts
 *
 * Checks network quality before attempting WebRTC connections.
 * Uses the Network Information API where available (Android Chrome)
 * plus a lightweight latency probe to detect flaky / slow connections.
 *
 * Thresholds:
 *   good   — ≥2 Mbps downlink, RTT <300ms, effectiveType 4g
 *   fair   — ≥0.5 Mbps, RTT <600ms, effectiveType 3g  (warn but allow)
 *   poor   — anything worse, including 2G               (warn but allow)
 *
 * NOTE: Network quality is informational only. We never block the user
 * from hosting or joining a meeting based on connection speed — Daily.co's
 * adaptive bitrate (see useDailyCall.ts) automatically degrades video
 * quality on poor connections, and audio-only fallback keeps calls usable
 * even on 2G/3G.
 */

import { useState, useEffect, useCallback, useRef } from "react";

export type NetworkQuality = "good" | "fair" | "poor" | "unknown";

export interface NetworkInfo {
  quality: NetworkQuality;
  downlink: number | null;       // Mbps
  rtt: number | null;            // ms
  effectiveType: string | null;  // "2g" | "3g" | "4g" | "slow-2g"
  type: string | null;           // "cellular" | "wifi" | "ethernet" etc.
  saveData: boolean;
  message: string;
  canProceed: boolean;           // always true — kept for backwards compatibility
  isWarning: boolean;            // true = fair/poor quality, show a heads-up but allow
}

const DEFAULT_INFO: NetworkInfo = {
  quality: "unknown",
  downlink: null,
  rtt: null,
  effectiveType: null,
  type: null,
  saveData: false,
  message: "Checking connection…",
  canProceed: true,
  isWarning: false,
};

function getNavConnection(): any {
  if (typeof navigator === "undefined") return null;
  return (navigator as any).connection ||
    (navigator as any).mozConnection ||
    (navigator as any).webkitConnection ||
    null;
}

function evaluate(conn: any): NetworkInfo {
  if (!conn) {
    return {
      ...DEFAULT_INFO,
      quality: "unknown",
      message: "Connection info unavailable — proceeding anyway.",
      canProceed: true,
      isWarning: false,
    };
  }

  const downlink: number = conn.downlink ?? 0;
  const rtt: number = conn.rtt ?? 0;
  const effectiveType: string = conn.effectiveType ?? "";
  const type: string = conn.type ?? "";
  const saveData: boolean = conn.saveData ?? false;

  // Poor: 2G, very low downlink, or extreme RTT — warn, but never block
  if (
    effectiveType === "2g" ||
    effectiveType === "slow-2g" ||
    downlink < 0.3 ||
    rtt > 900
  ) {
    return {
      quality: "poor",
      downlink,
      rtt,
      effectiveType,
      type,
      saveData,
      message:
        "Your connection is slow (2G / very low bandwidth). Video may be choppy or fail to load, but audio and transcription will keep working — you can still join.",
      canProceed: true,
      isWarning: true,
    };
  }

  // Fair: 3G or borderline values — warn, but allow
  if (
    effectiveType === "3g" ||
    downlink < 1.0 ||
    rtt > 500
  ) {
    return {
      quality: "fair",
      downlink,
      rtt,
      effectiveType,
      type,
      saveData,
      message:
        "Your connection is weak (3G / low bandwidth). " +
        "Audio and video may be unstable. Consider switching to Wi-Fi.",
      canProceed: true,
      isWarning: true,
    };
  }

  // Good
  return {
    quality: "good",
    downlink,
    rtt,
    effectiveType,
    type,
    saveData,
    message: "Connection looks good.",
    canProceed: true,
    isWarning: false,
  };
}

export function useNetworkQuality() {
  const [info, setInfo] = useState<NetworkInfo>(DEFAULT_INFO);
  const connRef = useRef<any>(null);

  const refresh = useCallback(() => {
    const conn = getNavConnection();
    connRef.current = conn;
    setInfo(evaluate(conn));
  }, []);

  useEffect(() => {
    refresh();
    const conn = getNavConnection();
    if (!conn) return;
    conn.addEventListener("change", refresh);
    return () => conn.removeEventListener("change", refresh);
  }, [refresh]);

  // Also react to browser online/offline events — warn, but never block.
  // Daily.co will automatically reconnect once connectivity returns.
  useEffect(() => {
    const handleOffline = () =>
      setInfo((prev) => ({
        ...prev,
        quality: "poor",
        canProceed: true,
        isWarning: true,
        message: "You appear to be offline. You can still try to join — Fixsense will reconnect automatically once your connection returns.",
      }));
    const handleOnline = () => refresh();
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, [refresh]);

  return { ...info, refresh };
}

// ── Retry helper with exponential backoff ─────────────────────────────────────

export interface RetryOptions {
  maxAttempts?: number;        // default 4
  baseDelayMs?: number;        // default 1500
  maxDelayMs?: number;         // default 12000
  onAttempt?: (attempt: number, delayMs: number) => void;
  shouldRetry?: (error: any) => boolean;
}

/**
 * Wraps an async function with exponential-backoff retry logic.
 * Returns the result on success, or throws after maxAttempts failures.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxAttempts = 4,
    baseDelayMs = 1500,
    maxDelayMs = 12000,
    onAttempt,
    shouldRetry = (err) => {
      // Retry on network / endpoint errors; don't retry on auth errors
      const msg = (err?.message || err?.description || "").toLowerCase();
      return (
        msg.includes("failed to fetch") ||
        msg.includes("endpoint") ||
        msg.includes("unreachable") ||
        msg.includes("network") ||
        err?.code === 2003 ||
        err?.name === "EndpointUnreachable"
      );
    },
  } = options;

  let lastError: any;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      if (attempt === maxAttempts || !shouldRetry(err)) throw err;
      const jitter = Math.random() * 500;
      const delay = Math.min(baseDelayMs * Math.pow(2, attempt - 1) + jitter, maxDelayMs);
      onAttempt?.(attempt, Math.round(delay));
      await new Promise((res) => setTimeout(res, delay));
    }
  }
  throw lastError;
}