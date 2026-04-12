/**
 * PlanGate.tsx
 *
 * Reusable components for plan gating:
 *  - <FeatureGate> — wraps children with lock overlay
 *  - <LockedCard> — standalone locked feature card
 *  - <LockedBadge> — small inline "upgrade" badge
 *  - <PlanBanner> — full-width usage/upgrade banner
 *  - <MinutesMeter> — visual minutes usage bar
 *  - withPlanGate() — HOC for feature gating
 */

import { type ReactNode } from "react";
import { Lock, Zap, ArrowRight, AlertTriangle, TrendingUp, Crown } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { usePlanEnforcement, FEATURE_LABELS, FEATURE_REQUIRED_PLAN, type PlanFeatureKey } from "@/contexts/PlanEnforcementContext";
import { cn } from "@/lib/utils";

// ─── FeatureGate ──────────────────────────────────────────────────────────────
/**
 * Wraps children. If feature is locked, renders a lock overlay instead.
 * Use `mode="blur"` to show blurred content, `mode="replace"` to show LockedCard.
 */
interface FeatureGateProps {
  feature: PlanFeatureKey;
  mode?: "blur" | "replace" | "overlay";
  children: ReactNode;
  fallback?: ReactNode;
  compact?: boolean;
}

export function FeatureGate({
  feature, mode = "overlay", children, fallback, compact = false,
}: FeatureGateProps) {
  const { hasFeature, openUpgradeModal } = usePlanEnforcement();

  if (hasFeature(feature)) return <>{children}</>;

  if (fallback) return <>{fallback}</>;

  if (mode === "blur") {
    return (
      <div style={{ position: "relative" }}>
        <div style={{ filter: "blur(4px)", pointerEvents: "none", userSelect: "none", opacity: .5 }}>
          {children}
        </div>
        <div style={{
          position: "absolute", inset: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(5,8,16,.5)", backdropFilter: "blur(2px)",
          borderRadius: 12, cursor: "pointer",
        }} onClick={() => openUpgradeModal(feature)}>
          <LockedBadge feature={feature} />
        </div>
      </div>
    );
  }

  if (mode === "replace") {
    return <LockedCard feature={feature} compact={compact} />;
  }

  // overlay mode — show children with locked overlay
  return (
    <div style={{ position: "relative" }}>
      <div style={{ pointerEvents: "none", opacity: .35, filter: "grayscale(.5)" }}>
        {children}
      </div>
      <div style={{
        position: "absolute", inset: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        borderRadius: "inherit", cursor: "pointer",
      }} onClick={() => openUpgradeModal(feature)}>
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          background: "rgba(10,13,24,.9)", border: "1px solid rgba(255,255,255,.12)",
          borderRadius: 10, padding: "8px 14px",
          boxShadow: "0 8px 24px rgba(0,0,0,.5)",
        }}>
          <Lock style={{ width: 13, height: 13, color: "#a78bfa" }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,.8)", fontFamily: "'DM Sans',sans-serif" }}>
            {FEATURE_REQUIRED_PLAN[feature]} plan required
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── LockedCard ───────────────────────────────────────────────────────────────

interface LockedCardProps {
  feature: PlanFeatureKey;
  title?: string;
  description?: string;
  compact?: boolean;
  className?: string;
}

export function LockedCard({ feature, title, description, compact = false, className }: LockedCardProps) {
  const { openUpgradeModal } = usePlanEnforcement();
  const requiredPlan = FEATURE_REQUIRED_PLAN[feature];
  const featureLabel = title || FEATURE_LABELS[feature];

  const planColors: Record<string, string> = {
    Starter: "#60a5fa",
    Growth: "#0ef5d4",
    Scale: "#a78bfa",
  };
  const color = planColors[requiredPlan] ?? "#a78bfa";

  if (compact) {
    return (
      <div
        className={cn("locked-card-compact", className)}
        style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "10px 14px",
          background: "rgba(255,255,255,.02)",
          border: "1px dashed rgba(255,255,255,.1)",
          borderRadius: 10, cursor: "pointer",
          transition: "all .13s",
        }}
        onClick={() => openUpgradeModal(feature)}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = `${color}40`; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,.1)"; }}
      >
        <div style={{
          width: 28, height: 28, borderRadius: 7, flexShrink: 0,
          background: `${color}12`, border: `1px solid ${color}25`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Lock style={{ width: 12, height: 12, color }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,.7)", fontFamily: "'DM Sans',sans-serif" }}>
            {featureLabel}
          </p>
          <p style={{ margin: 0, fontSize: 10, color: "rgba(255,255,255,.3)", fontFamily: "'DM Sans',sans-serif" }}>
            {requiredPlan} plan required
          </p>
        </div>
        <span style={{
          fontSize: 10, fontWeight: 700, color,
          background: `${color}12`, border: `1px solid ${color}25`,
          borderRadius: 20, padding: "2px 8px",
          fontFamily: "'DM Sans',sans-serif",
        }}>
          Upgrade
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn(className)}
      style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", textAlign: "center",
        padding: "48px 24px",
        background: "rgba(255,255,255,.015)",
        border: "1px dashed rgba(255,255,255,.1)",
        borderRadius: 16, cursor: "pointer",
        transition: "all .13s",
        gap: 0,
      }}
      onClick={() => openUpgradeModal(feature)}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.background = `${color}06`;
        (e.currentTarget as HTMLElement).style.borderColor = `${color}30`;
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,.015)";
        (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,.1)";
      }}
    >
      <div style={{
        width: 52, height: 52, borderRadius: 15, marginBottom: 16,
        background: `${color}12`, border: `1px solid ${color}25`,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Lock style={{ width: 22, height: 22, color }} />
      </div>

      <p style={{
        margin: "0 0 6px",
        fontSize: 15, fontWeight: 700, color: "#f0f6fc",
        fontFamily: "'Bricolage Grotesque',sans-serif",
      }}>
        {featureLabel}
      </p>

      <p style={{
        margin: "0 0 20px",
        fontSize: 13, color: "rgba(255,255,255,.45)", lineHeight: 1.6,
        maxWidth: 280, fontFamily: "'DM Sans',sans-serif",
      }}>
        {description || `This feature is available on the ${requiredPlan} plan and above.`}
      </p>

      <div style={{
        display: "flex", alignItems: "center", gap: 6,
        background: `${color}15`, border: `1px solid ${color}30`,
        borderRadius: 10, padding: "9px 18px",
      }}>
        <Zap style={{ width: 13, height: 13, color }} />
        <span style={{ fontSize: 13, fontWeight: 600, color, fontFamily: "'DM Sans',sans-serif" }}>
          Upgrade to {requiredPlan}
        </span>
        <ArrowRight style={{ width: 13, height: 13, color }} />
      </div>
    </div>
  );
}

// ─── LockedBadge ──────────────────────────────────────────────────────────────

export function LockedBadge({ feature }: { feature: PlanFeatureKey }) {
  const requiredPlan = FEATURE_REQUIRED_PLAN[feature];
  const planColors: Record<string, string> = {
    Starter: "#60a5fa", Growth: "#0ef5d4", Scale: "#a78bfa",
  };
  const color = planColors[requiredPlan] ?? "#a78bfa";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      fontSize: 10, fontWeight: 700, letterSpacing: ".05em",
      padding: "3px 9px", borderRadius: 20,
      color, background: `${color}18`, border: `1px solid ${color}30`,
      fontFamily: "'DM Sans',sans-serif",
    }}>
      <Lock style={{ width: 9, height: 9 }} />
      {requiredPlan}
    </span>
  );
}

// ─── MinutesMeter ─────────────────────────────────────────────────────────────

interface MinutesMeterProps {
  className?: string;
  compact?: boolean;
}

export function MinutesMeter({ className, compact = false }: MinutesMeterProps) {
  const navigate = useNavigate();
  const {
    minutesUsed, minuteLimit, minutesRemaining,
    isAtLimit, isNearLimit, isUnlimited, usagePct, planName,
  } = usePlanEnforcement();

  const fmtMins = (m: number) => {
    if (m < 60) return `${m}m`;
    return `${(m / 60).toFixed(1)}h`;
  };

  const barColor = isAtLimit ? "#ef4444" : isNearLimit ? "#f59e0b" : "#0ef5d4";
  const bgColor = isAtLimit ? "rgba(239,68,68,.1)" : isNearLimit ? "rgba(245,158,11,.1)" : "rgba(14,245,212,.08)";

  if (compact) {
    return (
      <div className={cn(className)} style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "6px 11px", borderRadius: 8,
        background: bgColor,
        border: `1px solid ${barColor}25`,
        cursor: (isAtLimit || isNearLimit) ? "pointer" : "default",
      }}
        onClick={isAtLimit ? () => navigate("/dashboard/billing") : undefined}
      >
        {isAtLimit && <AlertTriangle style={{ width: 11, height: 11, color: "#ef4444", flexShrink: 0 }} />}
        <span style={{ fontSize: 11, fontWeight: 600, color: barColor, fontFamily: "'DM Sans',sans-serif" }}>
          {isUnlimited ? "∞ min" : isAtLimit ? "Limit reached" : `${fmtMins(minutesRemaining)} left`}
        </span>
        {!isUnlimited && !isAtLimit && (
          <div style={{ width: 40, height: 3, borderRadius: 2, background: "rgba(255,255,255,.1)", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${usagePct}%`, background: barColor, borderRadius: 2 }} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={cn(className)} style={{
      padding: "14px 16px",
      background: bgColor, border: `1px solid ${barColor}25`,
      borderRadius: 13,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,.7)", fontFamily: "'DM Sans',sans-serif" }}>
          Minutes — {planName}
        </span>
        <span style={{ fontSize: 12, fontWeight: 700, color: barColor, fontFamily: "'Bricolage Grotesque',sans-serif" }}>
          {isUnlimited ? "Unlimited" : `${fmtMins(minutesUsed)} / ${fmtMins(minuteLimit)}`}
        </span>
      </div>
      {!isUnlimited && (
        <>
          <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,.08)", overflow: "hidden", marginBottom: 6 }}>
            <div style={{
              height: "100%", width: `${Math.min(usagePct, 100)}%`,
              background: barColor, borderRadius: 3,
              transition: "width .5s ease",
            }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,.3)", fontFamily: "'DM Sans',sans-serif" }}>
              {fmtMins(minutesRemaining)} remaining
            </span>
            {(isAtLimit || isNearLimit) && (
              <button
                onClick={() => navigate("/dashboard/billing")}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  fontSize: 10, fontWeight: 700, color: barColor,
                  fontFamily: "'DM Sans',sans-serif",
                }}
              >
                {isAtLimit ? "Upgrade now →" : "Get more minutes →"}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── PlanBanner ───────────────────────────────────────────────────────────────

interface PlanBannerProps {
  className?: string;
}

export function PlanBanner({ className }: PlanBannerProps) {
  const navigate = useNavigate();
  const { isAtLimit, isNearLimit, planKey, planName, minutesRemaining } = usePlanEnforcement();

  if (!isAtLimit && !isNearLimit) return null;

  const fmtMins = (m: number) => m < 60 ? `${m}m` : `${(m / 60).toFixed(1)}h`;

  if (isAtLimit) {
    return (
      <div className={cn(className)} style={{
        display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
        padding: "11px 16px",
        background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.25)",
        borderRadius: 11,
      }}>
        <AlertTriangle style={{ width: 15, height: 15, color: "#ef4444", flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#f0f6fc", fontFamily: "'DM Sans',sans-serif" }}>
            Monthly minute limit reached
          </span>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,.5)", marginLeft: 8, fontFamily: "'DM Sans',sans-serif" }}>
            Upgrade to continue making calls
          </span>
        </div>
        <button
          onClick={() => navigate("/dashboard/billing")}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "#ef4444", border: "none", borderRadius: 8,
            padding: "7px 14px", color: "#fff", fontSize: 12,
            fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
            flexShrink: 0,
          }}
        >
          <Zap style={{ width: 12, height: 12 }} /> Upgrade Plan
        </button>
      </div>
    );
  }

  return (
    <div className={cn(className)} style={{
      display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
      padding: "10px 16px",
      background: "rgba(245,158,11,.08)", border: "1px solid rgba(245,158,11,.2)",
      borderRadius: 11,
    }}>
      <AlertTriangle style={{ width: 14, height: 14, color: "#f59e0b", flexShrink: 0 }} />
      <span style={{ flex: 1, fontSize: 12, color: "rgba(255,255,255,.7)", fontFamily: "'DM Sans',sans-serif" }}>
        Only {fmtMins(minutesRemaining)} left this month on your {planName} plan
      </span>
      <button
        onClick={() => navigate("/dashboard/billing")}
        style={{
          background: "none", border: "1px solid rgba(245,158,11,.3)", borderRadius: 7,
          padding: "5px 11px", color: "#f59e0b", fontSize: 11,
          fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
          flexShrink: 0,
        }}
      >
        Upgrade
      </button>
    </div>
  );
}

// ─── PlanStatusBadge ──────────────────────────────────────────────────────────

export function PlanStatusBadge() {
  const navigate = useNavigate();
  const { planName, planKey } = usePlanEnforcement();

  const colors: Record<string, { bg: string; color: string }> = {
    free:    { bg: "rgba(255,255,255,.07)", color: "rgba(255,255,255,.5)" },
    starter: { bg: "rgba(96,165,250,.1)",   color: "#60a5fa" },
    growth:  { bg: "rgba(14,245,212,.1)",   color: "#0ef5d4" },
    scale:   { bg: "rgba(167,139,250,.1)",  color: "#a78bfa" },
  };
  const c = colors[planKey] ?? colors.free;

  return (
    <button
      onClick={() => navigate("/dashboard/billing")}
      style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        padding: "3px 10px", borderRadius: 20,
        background: c.bg, border: `1px solid ${c.color}30`,
        color: c.color, fontSize: 11, fontWeight: 700,
        cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
        letterSpacing: ".03em", textTransform: "uppercase",
      }}
    >
      {planKey === "scale" && <Crown style={{ width: 9, height: 9 }} />}
      {planKey !== "scale" && <Zap style={{ width: 9, height: 9 }} />}
      {planName}
    </button>
  );
}

// ─── LockedButton ─────────────────────────────────────────────────────────────

interface LockedButtonProps {
  feature: PlanFeatureKey;
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
  disabled?: boolean;
}

export function LockedButton({ feature, children, onClick, className, style, disabled }: LockedButtonProps) {
  const { hasFeature, openUpgradeModal } = usePlanEnforcement();
  const enabled = hasFeature(feature);
  const requiredPlan = FEATURE_REQUIRED_PLAN[feature];

  const handleClick = () => {
    if (!enabled) {
      openUpgradeModal(feature);
      return;
    }
    onClick?.();
  };

  return (
    <button
      className={className}
      style={{
        ...style,
        opacity: enabled ? 1 : 0.6,
        cursor: enabled && !disabled ? "pointer" : "not-allowed",
      }}
      onClick={handleClick}
      disabled={disabled}
      title={!enabled ? `Requires ${requiredPlan} plan` : undefined}
    >
      {children}
      {!enabled && (
        <span style={{ marginLeft: 6, display: "inline-flex", alignItems: "center" }}>
          <Lock style={{ width: 11, height: 11 }} />
        </span>
      )}
    </button>
  );
}

// ─── withPlanGate HOC ─────────────────────────────────────────────────────────

export function withPlanGate<T extends object>(
  Component: React.ComponentType<T>,
  feature: PlanFeatureKey,
  fallbackTitle?: string,
) {
  return function GatedComponent(props: T) {
    const { hasFeature } = usePlanEnforcement();
    if (hasFeature(feature)) return <Component {...props} />;
    return <LockedCard feature={feature} title={fallbackTitle} />;
  };
}
