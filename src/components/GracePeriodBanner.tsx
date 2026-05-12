/**
 * GracePeriodBanner.tsx
 *
 * Warning banner shown when a user's subscription renewal failed.
 * Displays grace period countdown, retry payment, and update card actions.
 * Designed to match Fixsense's dark dashboard aesthetic.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle, X, RefreshCw, CreditCard,
  Clock, ChevronRight, Loader2, Shield, Zap,
} from "lucide-react";
import { useBillingRecovery } from "./useBillingRecovery";

// ── Helpers ─────────────────────────────────────────────────────────────────

function pad(n: number) { return String(n).padStart(2, "0"); }

function formatCountdown(c: { days: number; hours: number; minutes: number; seconds: number } | null) {
  if (!c) return null;
  if (c.days > 0) return `${c.days}d ${pad(c.hours)}h ${pad(c.minutes)}m`;
  if (c.hours > 0) return `${pad(c.hours)}h ${pad(c.minutes)}m ${pad(c.seconds)}s`;
  return `${pad(c.minutes)}m ${pad(c.seconds)}s`;
}

// ── Main Banner ──────────────────────────────────────────────────────────────

interface GracePeriodBannerProps {
  compact?: boolean;
}

export default function GracePeriodBanner({ compact = false }: GracePeriodBannerProps) {
  const navigate = useNavigate();
  const { billingStatus, countdown, retryPayment, updateCard, isRetrying, isUpdatingCard } = useBillingRecovery();
  const [dismissed, setDismissed] = useState(false);

  if (!billingStatus?.showWarningBanner || dismissed) return null;
  if (!billingStatus.isInGracePeriod && billingStatus.subscriptionStatus !== "past_due") return null;

  const isUrgent   = billingStatus.isUrgent;
  const isCritical = billingStatus.isCritical;
  const countdownStr = formatCountdown(countdown);

  // Color scheme based on urgency
  const color  = isUrgent  ? "#ef4444" : isCritical ? "#f59e0b" : "#f59e0b";
  const bgGrad = isUrgent
    ? "linear-gradient(135deg, rgba(239,68,68,.12), rgba(239,68,68,.06))"
    : "linear-gradient(135deg, rgba(245,158,11,.10), rgba(245,158,11,.05))";
  const borderColor = isUrgent ? "rgba(239,68,68,.35)" : "rgba(245,158,11,.3)";

  if (compact) {
    return (
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "8px 14px",
        background: bgGrad,
        border: `1px solid ${borderColor}`,
        borderRadius: 10,
        cursor: "pointer",
        fontFamily: "'DM Sans', sans-serif",
      }} onClick={() => navigate("/billing")}>
        <AlertTriangle style={{ width: 14, height: 14, color, flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 600, color }}>
          {isUrgent ? "Final 24h" : "Payment failed"} — update card
        </span>
        <ChevronRight style={{ width: 12, height: 12, color: "rgba(255,255,255,.4)", marginLeft: "auto" }} />
      </div>
    );
  }

  return (
    <div style={{
      position: "relative",
      background: bgGrad,
      border: `1px solid ${borderColor}`,
      borderRadius: 14,
      padding: "16px 18px",
      overflow: "hidden",
      fontFamily: "'DM Sans', sans-serif",
    }}>
      {/* Animated urgency pulse for critical state */}
      {isUrgent && (
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 2,
          background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
          animation: "gracePulse 2s ease-in-out infinite",
        }} />
      )}

      <style>{`
        @keyframes gracePulse {
          0%, 100% { opacity: .4; }
          50% { opacity: 1; }
        }
      `}</style>

      {/* Dismiss button */}
      {!isUrgent && (
        <button
          onClick={() => setDismissed(true)}
          style={{
            position: "absolute", top: 10, right: 10,
            background: "none", border: "none", cursor: "pointer",
            color: "rgba(255,255,255,.3)", padding: 4, borderRadius: 6,
          }}
        >
          <X style={{ width: 14, height: 14 }} />
        </button>
      )}

      <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
        {/* Icon */}
        <div style={{
          width: 40, height: 40, borderRadius: 10, flexShrink: 0,
          background: `${color}18`, border: `1px solid ${color}30`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <AlertTriangle style={{ width: 18, height: 18, color }} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Title */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{
              fontSize: 14, fontWeight: 700, color: "#f0f6fc",
              fontFamily: "'Bricolage Grotesque', sans-serif",
            }}>
              {isUrgent
                ? "⚠️ Final Warning — Plan Expires Soon"
                : isCritical
                ? "Renewal Failed — Action Required"
                : "Payment Failed — Grace Period Active"}
            </span>
            {billingStatus.retryCount > 0 && (
              <span style={{
                fontSize: 10, fontWeight: 700,
                padding: "2px 7px", borderRadius: 20,
                background: `${color}15`, border: `1px solid ${color}25`,
                color, letterSpacing: ".05em",
              }}>
                Retry {billingStatus.retryCount}/3
              </span>
            )}
          </div>

          {/* Message */}
          <p style={{ margin: "0 0 10px", fontSize: 13, color: "rgba(255,255,255,.6)", lineHeight: 1.5 }}>
            {isUrgent
              ? "Your grace period ends very soon. If payment isn't resolved, you'll be moved to the Free plan. Your data is safe."
              : "Your subscription renewal failed. We'll retry automatically. Update your card to guarantee access."}
          </p>

          {/* Countdown + Next Retry Row */}
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 14, flexWrap: "wrap" }}>
            {countdownStr && billingStatus.gracePeriodEndsAt && (
              <div style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "5px 11px", borderRadius: 8,
                background: `${color}10`, border: `1px solid ${color}20`,
              }}>
                <Clock style={{ width: 12, height: 12, color }} />
                <span style={{ fontSize: 13, fontWeight: 700, color, fontVariantNumeric: "tabular-nums" }}>
                  {countdownStr}
                </span>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,.4)" }}>remaining</span>
              </div>
            )}

            {billingStatus.nextRetryAt && (
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <RefreshCw style={{ width: 11, height: 11, color: "rgba(255,255,255,.35)" }} />
                <span style={{ fontSize: 11, color: "rgba(255,255,255,.4)" }}>
                  Auto-retry:{" "}
                  {new Date(billingStatus.nextRetryAt).toLocaleDateString("en-US", {
                    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                  })}
                </span>
              </div>
            )}
          </div>

          {/* Data safety notice */}
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            marginBottom: 14,
          }}>
            <Shield style={{ width: 11, height: 11, color: "#0ef5d4" }} />
            <span style={{ fontSize: 11, color: "rgba(14,245,212,.7)" }}>
              Your calls, transcripts, and deals are always safe — even if downgraded
            </span>
          </div>

          {/* Action buttons */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <button
              onClick={() => retryPayment.mutate()}
              disabled={isRetrying || isUpdatingCard}
              style={{
                display: "flex", alignItems: "center", gap: 7,
                padding: "9px 16px", borderRadius: 9,
                background: isUrgent
                  ? "linear-gradient(135deg, #ef4444, #dc2626)"
                  : "linear-gradient(135deg, #f59e0b, #d97706)",
                border: "none", cursor: isRetrying ? "wait" : "pointer",
                color: "#fff", fontSize: 13, fontWeight: 700,
                fontFamily: "'DM Sans', sans-serif",
                opacity: isRetrying ? .7 : 1,
                boxShadow: `0 4px 16px ${color}30`,
                transition: "all .15s",
              }}
            >
              {isRetrying
                ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} />
                : <Zap style={{ width: 14, height: 14 }} />}
              {isRetrying ? "Retrying..." : "Retry Payment"}
            </button>

            <button
              onClick={() => updateCard.mutate()}
              disabled={isRetrying || isUpdatingCard}
              style={{
                display: "flex", alignItems: "center", gap: 7,
                padding: "9px 16px", borderRadius: 9,
                background: "rgba(255,255,255,.07)",
                border: "1px solid rgba(255,255,255,.15)",
                cursor: isUpdatingCard ? "wait" : "pointer",
                color: "rgba(255,255,255,.8)", fontSize: 13, fontWeight: 600,
                fontFamily: "'DM Sans', sans-serif",
                opacity: isUpdatingCard ? .7 : 1,
                transition: "all .15s",
              }}
            >
              {isUpdatingCard
                ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} />
                : <CreditCard style={{ width: 14, height: 14 }} />}
              {isUpdatingCard ? "Redirecting..." : "Update Card"}
            </button>

            <button
              onClick={() => navigate("/billing")}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                background: "none", border: "none",
                cursor: "pointer", color: "rgba(255,255,255,.45)",
                fontSize: 12, fontWeight: 500,
                fontFamily: "'DM Sans', sans-serif",
                padding: "4px 0",
              }}
            >
              View billing details
              <ChevronRight style={{ width: 12, height: 12 }} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}