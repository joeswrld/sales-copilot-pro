/**
 * AudioQualityMonitor.tsx — v1
 *
 * Compact real-time audio quality display for the LiveMeeting top bar.
 * Shows: MOS score, RTT, packet loss, jitter, bitrate badges.
 *
 * Color coding:
 *   Green  — excellent / good
 *   Amber  — fair
 *   Red    — poor
 *
 * Usage:
 *   <AudioQualityMonitor stats={aq.liveStats} expanded={showDetails} />
 */

import { memo, useState } from "react";
import { Activity, ChevronDown, ChevronUp, Signal, SignalLow, SignalMedium, SignalHigh, Wifi } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LiveAudioStats } from "@/hooks/useAudioQuality";

interface AudioQualityMonitorProps {
  stats: LiveAudioStats;
  isStreaming?: boolean;
  className?: string;
}

function SignalIcon({ quality }: { quality: LiveAudioStats["qualityLabel"] }) {
  const cls = "w-3.5 h-3.5";
  if (quality === "excellent" || quality === "good") return <SignalHigh className={cn(cls, "text-emerald-400")} />;
  if (quality === "fair") return <SignalMedium className={cn(cls, "text-amber-400")} />;
  if (quality === "poor") return <SignalLow className={cn(cls, "text-red-400")} />;
  return <Signal className={cn(cls, "text-gray-500")} />;
}

function StatChip({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[10px] font-medium" style={{ color }}>{value}</span>
      <span className="text-[9px]" style={{ color: "rgba(255,255,255,0.3)" }}>{label}</span>
    </div>
  );
}

function MOSRing({ mos }: { mos: number | null }) {
  const score = mos ?? 0;
  const pct = Math.max(0, Math.min(1, (score - 1) / 4)); // 1-5 → 0-1
  const color = score >= 4 ? "#10b981" : score >= 3 ? "#34d399" : score >= 2.5 ? "#f59e0b" : "#ef4444";
  const r = 10, c = 12, circumference = 2 * Math.PI * r;
  return (
    <svg width="24" height="24" viewBox="0 0 24 24">
      <circle cx={c} cy={c} r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="2.5" />
      <circle
        cx={c} cy={c} r={r} fill="none"
        stroke={color} strokeWidth="2.5"
        strokeDasharray={`${circumference * pct} ${circumference * (1 - pct)}`}
        strokeLinecap="round"
        transform="rotate(-90 12 12)"
        style={{ transition: "all 0.5s ease" }}
      />
      <text x="12" y="16" textAnchor="middle" fontSize="7" fontWeight="700" fill={mos !== null ? color : "rgba(255,255,255,0.3)"}>
        {mos !== null ? mos.toFixed(1) : "—"}
      </text>
    </svg>
  );
}

export const AudioQualityMonitor = memo(({ stats, isStreaming, className }: AudioQualityMonitorProps) => {
  const [expanded, setExpanded] = useState(false);
  const { qualityLabel, qualityColor, rttMs, packetLoss, jitterMs, audioSendBitrate, audioRecvBitrate, mosScore } = stats;

  const qualityText =
    qualityLabel === "excellent" ? "Excellent"
    : qualityLabel === "good"    ? "Good"
    : qualityLabel === "fair"    ? "Fair"
    : qualityLabel === "poor"    ? "Poor"
    : "Checking…";

  return (
    <div className={cn("relative", className)}>
      {/* Compact row — always visible */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg transition-colors touch-manipulation"
        style={{
          background: expanded ? "rgba(255,255,255,0.07)" : "transparent",
          border: `1px solid ${expanded ? "rgba(255,255,255,0.1)" : "transparent"}`,
        }}
      >
        {/* MOS ring — mini version */}
        <MOSRing mos={mosScore} />

        <div className="flex flex-col items-start gap-0">
          <div className="flex items-center gap-1">
            <SignalIcon quality={qualityLabel} />
            <span className="text-[11px] font-semibold" style={{ color: qualityColor }}>{qualityText}</span>
          </div>
          {rttMs !== null && (
            <span className="text-[9px]" style={{ color: "rgba(255,255,255,0.3)" }}>{rttMs}ms</span>
          )}
        </div>

        {isStreaming && (
          <div className="w-1.5 h-1.5 rounded-full animate-pulse ml-0.5" style={{ background: "#10b981" }} />
        )}

        {expanded ? (
          <ChevronUp className="w-3 h-3" style={{ color: "rgba(255,255,255,0.3)" }} />
        ) : (
          <ChevronDown className="w-3 h-3" style={{ color: "rgba(255,255,255,0.3)" }} />
        )}
      </button>

      {/* Expanded panel */}
      {expanded && (
        <div
          className="absolute top-full right-0 mt-1 z-50 rounded-xl p-4 min-w-[240px]"
          style={{
            background: "rgba(10,12,20,0.97)",
            border: "1px solid rgba(255,255,255,0.1)",
            backdropFilter: "blur(20px)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-indigo-400" />
              <span className="text-xs font-semibold text-white">Audio Quality</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ background: qualityColor }} />
              <span className="text-[11px] font-medium" style={{ color: qualityColor }}>{qualityText}</span>
            </div>
          </div>

          {/* MOS score with bar */}
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.5)" }}>
                Voice Quality Score (MOS)
              </span>
              <span className="text-sm font-bold" style={{ color: mosScore !== null ? qualityColor : "rgba(255,255,255,0.3)" }}>
                {mosScore !== null ? `${mosScore.toFixed(1)} / 5.0` : "—"}
              </span>
            </div>
            <div className="h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: mosScore !== null ? `${((mosScore - 1) / 4) * 100}%` : "0%",
                  background: `linear-gradient(90deg, ${qualityColor}88, ${qualityColor})`,
                }}
              />
            </div>
            <div className="flex justify-between mt-0.5">
              {["Bad", "Poor", "Fair", "Good", "Excellent"].map((label) => (
                <span key={label} className="text-[8px]" style={{ color: "rgba(255,255,255,0.2)" }}>{label}</span>
              ))}
            </div>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg px-2.5 py-2 text-center" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="text-xs font-bold text-white mb-0.5">{rttMs !== null ? `${rttMs}ms` : "—"}</div>
              <div className="text-[9px]" style={{ color: "rgba(255,255,255,0.35)" }}>RTT</div>
            </div>
            <div className="rounded-lg px-2.5 py-2 text-center" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="text-xs font-bold text-white mb-0.5">
                {packetLoss !== null ? `${(packetLoss * 100).toFixed(1)}%` : "—"}
              </div>
              <div className="text-[9px]" style={{ color: "rgba(255,255,255,0.35)" }}>Packet Loss</div>
            </div>
            <div className="rounded-lg px-2.5 py-2 text-center" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="text-xs font-bold text-white mb-0.5">{jitterMs !== null ? `${jitterMs}ms` : "—"}</div>
              <div className="text-[9px]" style={{ color: "rgba(255,255,255,0.35)" }}>Jitter</div>
            </div>
          </div>

          {/* Bitrate */}
          {(audioSendBitrate !== null || audioRecvBitrate !== null) && (
            <div className="mt-2 flex gap-2">
              {audioSendBitrate !== null && (
                <div className="flex-1 rounded-lg px-2 py-1.5 text-center" style={{ background: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.15)" }}>
                  <div className="text-[11px] font-bold text-emerald-400">↑ {audioSendBitrate} kbps</div>
                  <div className="text-[9px]" style={{ color: "rgba(255,255,255,0.3)" }}>Audio Send</div>
                </div>
              )}
              {audioRecvBitrate !== null && (
                <div className="flex-1 rounded-lg px-2 py-1.5 text-center" style={{ background: "rgba(99,102,241,0.07)", border: "1px solid rgba(99,102,241,0.15)" }}>
                  <div className="text-[11px] font-bold text-indigo-400">↓ {audioRecvBitrate} kbps</div>
                  <div className="text-[9px]" style={{ color: "rgba(255,255,255,0.3)" }}>Audio Recv</div>
                </div>
              )}
            </div>
          )}

          {/* Reconnect count */}
          {stats.reconnectCount > 0 && (
            <div
              className="mt-2 flex items-center gap-2 px-3 py-2 rounded-lg"
              style={{ background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.15)" }}
            >
              <Wifi className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-[11px] text-amber-400">
                {stats.reconnectCount} reconnect{stats.reconnectCount !== 1 ? "s" : ""} this session
              </span>
            </div>
          )}

          {/* Codec info */}
          <div className="mt-3 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="flex items-center justify-between text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>
              <span>Codec: <span className="text-indigo-400 font-medium">Opus 48kHz</span></span>
              <span>SFU: Daily.co EU</span>
            </div>
            <p className="text-[10px] mt-1" style={{ color: "rgba(255,255,255,0.2)" }}>
              Audio routes directly via WebRTC · No AI latency in media path
            </p>
          </div>
        </div>
      )}
    </div>
  );
});