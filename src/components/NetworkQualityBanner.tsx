/**
 * NetworkQualityBanner.tsx
 *
 * Shows an inline warning/error when network quality is poor or fair.
 * Designed to match Fixsense's dark glass aesthetic.
 */

import { Wifi, WifiOff, AlertTriangle, RefreshCw, X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { NetworkInfo } from "@/hooks/useNetworkQuality";

interface Props {
  info: NetworkInfo;
  onDismiss?: () => void;
  onRetry?: () => void;
  /** compact = single line, no dismiss. Full = card with action buttons */
  compact?: boolean;
}

export function NetworkQualityBanner({ info, onDismiss, onRetry, compact = false }: Props) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;
  if (info.quality === "good" || info.quality === "unknown") return null;

  const isPoor = info.quality === "poor";

  const handleDismiss = () => {
    setDismissed(true);
    onDismiss?.();
  };

  if (compact) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium",
          isPoor
            ? "bg-red-500/12 border border-red-500/25 text-red-400"
            : "bg-amber-500/10 border border-amber-500/20 text-amber-400",
        )}
      >
        {isPoor ? <WifiOff className="w-3.5 h-3.5 shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 shrink-0" />}
        <span className="flex-1 truncate">{info.message}</span>
        {info.downlink !== null && (
          <span className="shrink-0 opacity-60">
            {info.downlink.toFixed(1)} Mbps · {info.rtt}ms
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-xl border p-4",
        isPoor
          ? "bg-red-500/8 border-red-500/25"
          : "bg-amber-500/8 border-amber-500/20",
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "w-9 h-9 rounded-xl flex items-center justify-center shrink-0",
            isPoor
              ? "bg-red-500/15 border border-red-500/20"
              : "bg-amber-500/12 border border-amber-500/18",
          )}
        >
          {isPoor
            ? <WifiOff className="w-4 h-4 text-red-400" />
            : <Wifi className="w-4 h-4 text-amber-400" />
          }
        </div>

        <div className="flex-1 min-w-0">
          <p className={cn("text-sm font-semibold mb-0.5", isPoor ? "text-red-400" : "text-amber-400")}>
            {isPoor ? "Connection too weak for video calls" : "Weak connection detected"}
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">{info.message}</p>

          {(info.downlink !== null || info.rtt !== null) && (
            <div className="flex gap-3 mt-2">
              {info.downlink !== null && (
                <span className="text-[11px] text-muted-foreground/60">
                  ↓ {info.downlink.toFixed(1)} Mbps
                </span>
              )}
              {info.rtt !== null && (
                <span className="text-[11px] text-muted-foreground/60">
                  RTT {info.rtt}ms
                </span>
              )}
              {info.effectiveType && (
                <span className={cn(
                  "text-[11px] font-mono uppercase px-1.5 py-0.5 rounded",
                  isPoor ? "bg-red-500/12 text-red-400" : "bg-amber-500/10 text-amber-400",
                )}>
                  {info.effectiveType}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {onRetry && (
            <button
              onClick={onRetry}
              className={cn(
                "flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors",
                isPoor
                  ? "border-red-500/25 text-red-400 hover:bg-red-500/10"
                  : "border-amber-500/20 text-amber-400 hover:bg-amber-500/8",
              )}
            >
              <RefreshCw className="w-3 h-3" />
              Retry
            </button>
          )}
          {!isPoor && onDismiss && (
            <button
              onClick={handleDismiss}
              className="text-muted-foreground/40 hover:text-muted-foreground transition-colors p-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Inline badge for use in tight spaces like the HMS top bar */
export function NetworkQualityDot({ quality }: { quality: NetworkInfo["quality"] }) {
  const cfg = {
    good:    { color: "bg-emerald-400", label: "Good signal" },
    fair:    { color: "bg-amber-400", label: "Weak signal" },
    poor:    { color: "bg-red-500", label: "Poor signal" },
    unknown: { color: "bg-white/25", label: "Signal unknown" },
  }[quality];

  return (
    <span title={cfg.label} className="flex items-center gap-1.5">
      <span className={cn("w-2 h-2 rounded-full shrink-0", cfg.color,
        quality === "fair" && "animate-pulse",
        quality === "poor" && "animate-pulse",
      )} />
    </span>
  );
}