/**
 * PlanAwareNav.tsx — v2 (Team Plan Inheritance)
 *
 * Navigation items that show lock badges for restricted routes.
 * SidebarPlanFooter now shows "TEAM" badge when plan is inherited from admin.
 */

import { useNavigate, useLocation } from "react-router-dom";
import { Lock, Crown, Zap, Users } from "lucide-react";
import { usePlanEnforcement, type PlanFeatureKey } from "@/contexts/PlanEnforcementContext";
import { FEATURE_REQUIRED_PLAN } from "@/contexts/PlanEnforcementContext";

export interface NavItemWithGate {
  path: string;
  label: string;
  icon: React.ElementType;
  feature?: PlanFeatureKey;
}

interface PlanAwareNavItemProps {
  item: NavItemWithGate;
}

export function PlanAwareNavItem({ item }: PlanAwareNavItemProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { hasFeature, openUpgradeModal } = usePlanEnforcement();

  const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + "/");
  const isLocked = !!item.feature && !hasFeature(item.feature);
  const requiredPlan = item.feature ? FEATURE_REQUIRED_PLAN[item.feature] : null;

  const planColors: Record<string, string> = {
    Starter: "#60a5fa", Growth: "#0ef5d4", Scale: "#a78bfa",
  };
  const lockColor = requiredPlan ? planColors[requiredPlan] ?? "#a78bfa" : "#a78bfa";

  const handleClick = () => {
    if (isLocked && item.feature) {
      openUpgradeModal(item.feature);
      return;
    }
    navigate(item.path);
  };

  return (
    <button
      onClick={handleClick}
      title={isLocked ? `${item.label} · Requires ${requiredPlan} plan` : item.label}
      style={{
        width: "100%", display: "flex", alignItems: "center", gap: 10,
        padding: "9px 12px", borderRadius: 9, border: "none", cursor: "pointer",
        textAlign: "left", position: "relative", transition: "all .12s",
        background: isActive && !isLocked
          ? "rgba(14,245,212,.1)"
          : "transparent",
        fontFamily: "'DM Sans', sans-serif",
        opacity: isLocked ? .65 : 1,
      }}
      onMouseEnter={e => {
        if (!isActive)
          (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,.05)";
      }}
      onMouseLeave={e => {
        if (!isActive)
          (e.currentTarget as HTMLElement).style.background = "transparent";
      }}
    >
      <item.icon style={{
        width: 16, height: 16, flexShrink: 0,
        color: isActive && !isLocked ? "#0ef5d4"
          : isLocked ? "rgba(255,255,255,.35)"
          : "rgba(255,255,255,.5)",
      }} />

      <span style={{
        flex: 1, fontSize: 13, fontWeight: isActive && !isLocked ? 600 : 400,
        color: isActive && !isLocked ? "#f0f6fc"
          : isLocked ? "rgba(255,255,255,.4)"
          : "rgba(255,255,255,.65)",
        letterSpacing: "-.01em",
      }}>
        {item.label}
      </span>

      {isLocked && (
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 3,
          fontSize: 9, fontWeight: 700, letterSpacing: ".05em",
          padding: "2px 6px", borderRadius: 20,
          color: lockColor,
          background: `${lockColor}12`,
          border: `1px solid ${lockColor}25`,
          flexShrink: 0,
        }}>
          <Lock style={{ width: 7, height: 7 }} />
          {requiredPlan}
        </span>
      )}

      {isActive && !isLocked && (
        <div style={{
          position: "absolute", left: 0, top: "20%", bottom: "20%",
          width: 2.5, borderRadius: 2, background: "#0ef5d4",
        }} />
      )}
    </button>
  );
}

// ─── Compact plan badge for sidebar footer ────────────────────────────────────

export function SidebarPlanFooter() {
  const navigate = useNavigate();
  const {
    planKey, planName, usagePct, minutesUsed, minuteLimit,
    isUnlimited, isInherited,
  } = usePlanEnforcement();

  const colors: Record<string, string> = {
    free:    "rgba(255,255,255,.3)",
    starter: "#60a5fa",
    growth:  "#0ef5d4",
    scale:   "#a78bfa",
  };
  const color = colors[planKey] ?? colors.free;
  const fmtMins = (m: number) => m < 60 ? `${m}m` : `${(m / 60).toFixed(1)}h`;
  const isScale = planKey === "scale";

  return (
    <div
      style={{
        padding: "12px 14px",
        background: "rgba(255,255,255,.025)",
        border: "1px solid rgba(255,255,255,.07)",
        borderRadius: 11, cursor: "pointer",
        transition: "all .12s",
      }}
      onClick={() => navigate("/billing")}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = `${color}30`; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,.07)"; }}
    >
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: isUnlimited ? 0 : 6,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          {isScale
            ? <Crown style={{ width: 10, height: 10, color }} />
            : isInherited
            ? <Users style={{ width: 10, height: 10, color }} />
            : <Zap style={{ width: 10, height: 10, color }} />}
          <span style={{
            fontSize: 11, fontWeight: 700, color,
            textTransform: "uppercase", letterSpacing: ".05em",
          }}>
            {planName}
          </span>
          {/* Show TEAM badge when plan is inherited from admin */}
          {isInherited && (
            <span style={{
              fontSize: 8, fontWeight: 800,
              padding: "1px 5px", borderRadius: 20,
              background: `${color}18`,
              color: color,
              border: `1px solid ${color}25`,
              letterSpacing: ".06em",
              textTransform: "uppercase" as const,
            }}>
              TEAM
            </span>
          )}
        </div>
        {!isScale && (
          <span style={{ fontSize: 10, color: "rgba(255,255,255,.3)" }}>
            {isInherited ? "Shared →" : "Upgrade →"}
          </span>
        )}
      </div>

      {!isUnlimited && (
        <>
          <div style={{
            height: 3, borderRadius: 2,
            background: "rgba(255,255,255,.08)",
            overflow: "hidden", marginBottom: 4,
          }}>
            <div style={{
              height: "100%", borderRadius: 2,
              width: `${Math.min(usagePct, 100)}%`,
              background: usagePct >= 80
                ? "#f59e0b"
                : usagePct >= 100
                ? "#ef4444"
                : color,
              transition: "width .5s ease",
            }} />
          </div>
          <span style={{ fontSize: 10, color: "rgba(255,255,255,.3)" }}>
            {fmtMins(minutesUsed)} / {fmtMins(minuteLimit)} used
          </span>
        </>
      )}

      {isUnlimited && (
        <span style={{ fontSize: 10, color: "rgba(255,255,255,.35)" }}>
          Unlimited minutes
        </span>
      )}
    </div>
  );
}