/**
 * MeetingHealthBar.tsx
 *
 * Compact real-time health indicator bar for the LiveMeeting top nav.
 * Shows mic level, network, transcription latency, and AI status.
 */

import { memo, useState } from "react";
import { Mic, Wifi, Zap, Brain, ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MeetingHealth, HealthStatus } from "@/hooks/useMeetingHealth";

interface Props {
  health: MeetingHealth;
  isStreaming: boolean;
}

const statusColor = (s: HealthStatus) => ({
  excellent: "#10b981",
  good:      "#10b981",
  fair:      "#f59e0b",
  poor:      "#ef4444",
  unknown:   "rgba(255,255,255,0.25)",
}[s]);

const MicBar = memo(({ level, isSilent, isClipping }: { level: number; isSilent: boolean; isClipping: boolean }) => {
  const bars = 12;
  return (
    <div className="flex items-end gap-0.5" style={{ height: 14 }}>
      {Array.from({ length: bars }).map((_, i) => {
        const threshold = (i / bars) * 100;
        const active = level > threshold;
        const color = isClipping ? "#ef4444" : isSilent ? "rgba(255,255,255,0.15)" : active ? "#10b981" : "rgba(255,255,255,0.1)";
        return (
          <div key={i}
            className="rounded-sm transition-all duration-75"
            style={{
              width: 2,
              height: Math.max(3, 3 + (i / bars) * 11),
              background: color,
              opacity: active ? 1 : 0.3,
            }}
          />
        );
      })}
    </div>
  );
});

export const MeetingHealthBar = memo(({ health, isStreaming }: Props) => {
  const [expanded, setExpanded] = useState(false);

  const netColor  = statusColor(health.network.status);
  const txLatency = health.transcription.latencyMs;
  const txColor   = txLatency === null ? "rgba(255,255,255,0.3)" : txLatency > 6000 ? "#ef4444" : txLatency > 3000 ? "#f59e0b" : "#10b981";
  const aiColor   = health.ai.latencyMs === null ? "rgba(255,255,255,0.3)" : health.ai.latencyMs > 5000 ? "#f59e0b" : "#10b981";

  return (
    <div className="relative">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl transition-all hover:bg-white/[0.05]"
        style={{ border: "1px solid rgba(255,255,255,0.06)" }}
        title="Meeting health"
      >
        {/* Mic level */}
        <MicBar level={health.mic.level} isSilent={health.mic.isSilent} isClipping={health.mic.isClipping} />

        {/* Network dot */}
        <div className="flex items-center gap-1" title={`Network: ${health.network.status}`}>
          <Wifi className="w-3 h-3" style={{ color: netColor }} />
          {health.network.rttMs !== null && (
            <span className="text-[9px] font-mono" style={{ color: netColor }}>{health.network.rttMs}ms</span>
          )}
        </div>

        {/* Transcription */}
        {isStreaming && (
          <div className="flex items-center gap-1" title="Transcription latency">
            <Zap className="w-3 h-3" style={{ color: txColor }} />
            {txLatency !== null && (
              <span className="text-[9px] font-mono" style={{ color: txColor }}>{(txLatency / 1000).toFixed(1)}s</span>
            )}
          </div>
        )}

        {/* AI */}
        {health.ai.lastAnalysisAt && (
          <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: aiColor }} />
        )}

        <ChevronDown className={cn("w-2.5 h-2.5 transition-transform", expanded && "rotate-180")} style={{ color: "rgba(255,255,255,0.3)" }} />
      </button>

      {/* Expanded panel */}
      {expanded && (
        <div
          className="absolute top-full right-0 mt-1.5 z-50 rounded-2xl p-4 space-y-3 min-w-[260px]"
          style={{ background: "rgba(10,12,20,0.97)", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 20px 60px rgba(0,0,0,0.6)" }}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-white">Meeting Health</span>
            <button onClick={() => setExpanded(false)}>
              <X className="w-3.5 h-3.5" style={{ color: "rgba(255,255,255,0.3)" }} />
            </button>
          </div>

          {/* Mic */}
          <Row label="Microphone" icon={Mic} color={health.mic.isClipping ? "#ef4444" : health.mic.isSilent ? "#f59e0b" : "#10b981"}>
            <div className="flex items-center gap-2">
              <MicBar level={health.mic.level} isSilent={health.mic.isSilent} isClipping={health.mic.isClipping} />
              <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.4)" }}>
                {health.mic.isClipping ? "Clipping" : health.mic.isSilent ? "Silent" : `${health.mic.level}%`}
              </span>
            </div>
          </Row>

          {/* Network */}
          <Row label="Network" icon={Wifi} color={netColor}>
            <div className="text-[10px]" style={{ color: "rgba(255,255,255,0.4)" }}>
              {health.network.status}
              {health.network.rttMs !== null && ` · ${health.network.rttMs}ms RTT`}
              {health.network.mbps !== null && ` · ${health.network.mbps.toFixed(1)} Mbps`}
              {health.network.packetLoss !== null && ` · ${(health.network.packetLoss * 100).toFixed(1)}% loss`}
            </div>
          </Row>

          {/* Transcription */}
          <Row label="Transcription" icon={Zap} color={txColor}>
            <div className="text-[10px]" style={{ color: "rgba(255,255,255,0.4)" }}>
              {txLatency !== null ? `${(txLatency / 1000).toFixed(1)}s latency` : "Waiting…"}
              {health.transcription.wordsPerMinute !== null && ` · ${health.transcription.wordsPerMinute} WPM`}
            </div>
          </Row>

          {/* AI */}
          <Row label="AI Analysis" icon={Brain} color={aiColor}>
            <div className="text-[10px]" style={{ color: "rgba(255,255,255,0.4)" }}>
              {health.ai.latencyMs !== null ? `${(health.ai.latencyMs / 1000).toFixed(1)}s latency` : "Standby"}
              {health.ai.objectionCount > 0 && ` · ${health.ai.objectionCount} objections`}
            </div>
          </Row>

          {/* Reconnects */}
          {health.reconnectCount > 0 && (
            <Row label="Reconnects" icon={Wifi} color="#f59e0b">
              <span className="text-[10px]" style={{ color: "#f59e0b" }}>{health.reconnectCount} this session</span>
            </Row>
          )}
        </div>
      )}
    </div>
  );
});

function Row({ label, icon: Icon, color, children }: {
  label: string; icon: React.FC<any>; color: string; children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 mt-0.5"
        style={{ background: `${color}18`, border: `1px solid ${color}30` }}>
        <Icon className="w-2.5 h-2.5" style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-semibold mb-0.5" style={{ color: "rgba(255,255,255,0.5)" }}>{label}</p>
        {children}
      </div>
    </div>
  );
}