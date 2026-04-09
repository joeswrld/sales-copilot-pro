/**
 * TeamMinuteUsageComponents.tsx
 *
 * Drop-in components for shared team minute billing:
 *
 *  <TeamUsageSidebarPill />   — compact sidebar widget
 *  <TeamUsageBillingCard />   — detailed billing page card with member breakdown
 *  <TeamUsageBanner />        — inline banner for pre-call limit warnings
 */

import { useNavigate } from "react-router-dom";
import { Timer, Users, TrendingUp, AlertTriangle, Zap, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useTeamMinuteUsage } from "@/hooks/useTeamMinuteUsage";

// ─────────────────────────────────────────────────────────────────────────────
// Sidebar pill  (replaces MinuteUsagePill in DashboardLayout)
// ─────────────────────────────────────────────────────────────────────────────
export function TeamUsageSidebarPill() {
  const navigate = useNavigate();
  const { usage } = useTeamMinuteUsage();
  if (!usage) return null;

  if (usage.isUnlimited) {
    return (
      <div
        className="mx-3 mt-3 mb-1 px-3 py-1.5 rounded-md cursor-pointer hover:opacity-80 transition-opacity"
        style={{ background: "rgba(26,240,196,0.08)", border: "1px solid rgba(26,240,196,0.15)" }}
        onClick={() => navigate("/dashboard/billing")}
      >
        <span className="text-[10px] font-semibold text-[#1af0c4] tracking-wide">
          ∞ Unlimited minutes
          {usage.isTeamPlan && " · Team"}
        </span>
      </div>
    );
  }

  const hoursUsed  = usage.hoursUsed;
  const hoursLimit = usage.hoursLimit ?? "?";
  const hoursLeft  = usage.hoursRemaining ?? "0";

  return (
    <div
      className="mx-3 mt-3 mb-1 px-3 py-2 rounded-md cursor-pointer hover:opacity-80 transition-opacity"
      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
      onClick={() => navigate("/dashboard/billing")}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] text-[rgba(255,255,255,0.38)] font-medium tracking-wide uppercase flex items-center gap-1">
          {usage.isTeamPlan
            ? <><Users style={{ width: 9, height: 9 }} /> Team mins</>
            : <><Timer style={{ width: 9, height: 9 }} /> Minutes</>
          }
        </span>
        <span
          className={cn(
            "text-[11px] font-semibold tabular-nums",
            usage.isAtLimit
              ? "text-red-400"
              : usage.isNearLimit
              ? "text-amber-400"
              : "text-[rgba(255,255,255,0.55)]",
          )}
        >
          {hoursUsed}h / {hoursLimit}h
        </span>
      </div>
      <div className="h-[3px] rounded-full bg-[rgba(255,255,255,0.08)] overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            usage.isAtLimit
              ? "bg-red-500"
              : usage.isNearLimit
              ? "bg-amber-400"
              : "bg-[#1af0c4]",
          )}
          style={{ width: `${Math.min(usage.pct, 100)}%` }}
        />
      </div>
      <p
        className={cn(
          "text-[9.5px] mt-1",
          usage.isAtLimit
            ? "text-red-400 font-medium"
            : usage.isNearLimit
            ? "text-amber-400"
            : "text-[rgba(255,255,255,0.22)]",
        )}
      >
        {usage.isAtLimit
          ? "Limit reached · Upgrade"
          : `${hoursLeft}h remaining`}
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Billing page card
// ─────────────────────────────────────────────────────────────────────────────
export function TeamUsageBillingCard({ className }: { className?: string }) {
  const navigate = useNavigate();
  const { usage, isLoading } = useTeamMinuteUsage();
  const [showBreakdown, setShowBreakdown] = useState(false);

  if (isLoading || !usage) return null;

  const barColor = usage.isAtLimit
    ? "#ef4444"
    : usage.isNearLimit
    ? "#f59e0b"
    : "#1af0c4";

  return (
    <div
      className={cn(
        "rounded-2xl border p-5 space-y-4",
        usage.isAtLimit
          ? "border-red-500/25 bg-red-500/5"
          : usage.isNearLimit
          ? "border-amber-400/25 bg-amber-400/5"
          : "border-white/[0.07] bg-white/[0.03]",
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: "rgba(26,240,196,0.12)", border: "1px solid rgba(26,240,196,0.2)" }}
          >
            {usage.isTeamPlan
              ? <Users  style={{ width: 16, height: 16, color: "#1af0c4" }} />
              : <Timer  style={{ width: 16, height: 16, color: "#1af0c4" }} />
            }
          </div>
          <div>
            <p className="text-sm font-semibold text-white">
              {usage.isTeamPlan ? "Team Meeting Minutes" : "Meeting Minutes"}
            </p>
            <p className="text-xs text-white/40">
              {usage.planName} plan{usage.isTeamPlan ? " · shared pool" : ""}
            </p>
          </div>
        </div>
        {usage.isAtLimit ? (
          <button
            onClick={() => navigate("/dashboard/billing")}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-[#1af0c4]/10 border border-[#1af0c4]/25 text-[#1af0c4] hover:bg-[#1af0c4]/20 transition-colors"
          >
            <Zap style={{ width: 12, height: 12 }} /> Upgrade
          </button>
        ) : null}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Used",      val: usage.isUnlimited ? "∞" : `${usage.hoursUsed}h` },
          { label: "Remaining", val: usage.isUnlimited ? "∞" : `${usage.hoursRemaining}h` },
          { label: "Limit",     val: usage.isUnlimited ? "∞" : `${usage.hoursLimit}h` },
        ].map(({ label, val }) => (
          <div
            key={label}
            className="text-center rounded-xl p-3"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
          >
            <div className="text-xl font-bold text-white">{val}</div>
            <div className="text-[10px] text-white/35 uppercase tracking-wide">{label}</div>
          </div>
        ))}
      </div>

      {/* Progress bar */}
      {!usage.isUnlimited && (
        <div className="space-y-1.5">
          <div className="h-2.5 rounded-full bg-white/[0.06] overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${Math.min(usage.pct, 100)}%`, background: barColor }}
            />
          </div>
          <div className="flex justify-between text-xs text-white/35">
            <span>{Math.round(usage.pct)}% used this cycle</span>
            <span>
              {usage.isAtLimit
                ? <span className="text-red-400 font-medium">Limit reached</span>
                : `${usage.minutesRemainingLabel} remaining`}
            </span>
          </div>
        </div>
      )}

      {/* Near-limit warning */}
      {usage.isNearLimit && !usage.isAtLimit && (
        <div
          className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl text-xs"
          style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", color: "#f59e0b" }}
        >
          <AlertTriangle style={{ width: 13, height: 13, flexShrink: 0, marginTop: 1 }} />
          <span>
            Running low — {usage.minutesRemainingLabel} remaining.{" "}
            <button onClick={() => navigate("/dashboard/billing")} className="underline font-semibold">
              Upgrade your plan
            </button>{" "}
            to avoid interruptions.
          </span>
        </div>
      )}

      {/* At-limit error */}
      {usage.isAtLimit && (
        <div
          className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl text-xs"
          style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171" }}
        >
          <AlertTriangle style={{ width: 13, height: 13, flexShrink: 0, marginTop: 1 }} />
          <span>
            Team minute pool exhausted. New calls are blocked until{" "}
            {usage.isTeamPlan ? "the admin upgrades the plan" : "you upgrade"} or the cycle resets.
          </span>
        </div>
      )}

      {/* Member breakdown (team plans only) */}
      {usage.isTeamPlan && usage.memberBreakdown.length > 0 && (
        <div>
          <button
            onClick={() => setShowBreakdown((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/65 transition-colors"
          >
            <TrendingUp style={{ width: 11, height: 11 }} />
            Usage by member
            {showBreakdown
              ? <ChevronUp style={{ width: 11, height: 11 }} />
              : <ChevronDown style={{ width: 11, height: 11 }} />}
          </button>

          {showBreakdown && (
            <div className="mt-2 space-y-1.5">
              {usage.memberBreakdown.map((m) => {
                const pct = usage.minutesLimit > 0
                  ? Math.min(100, Math.round((m.minutes_used / usage.minutesLimit) * 100))
                  : 0;
                const hrs = (m.minutes_used / 60).toFixed(1);
                const name = m.full_name ?? m.email ?? "Unknown";
                return (
                  <div key={m.user_id} className="flex items-center gap-2.5">
                    <div
                      className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0"
                      style={{ background: "rgba(124,58,237,0.2)", color: "#a78bfa" }}
                    >
                      {name[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between text-[11px] mb-0.5">
                        <span className="text-white/65 truncate">{name}</span>
                        <span className="text-white/35 tabular-nums shrink-0 ml-2">{hrs}h</span>
                      </div>
                      <div className="h-[3px] rounded-full bg-white/[0.06] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[#7c3aed]"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Pre-call banner (used in LiveCall.tsx)
// ─────────────────────────────────────────────────────────────────────────────
export function TeamUsageBanner({ onUpgrade }: { onUpgrade?: () => void }) {
  const { usage } = useTeamMinuteUsage();
  if (!usage || usage.isUnlimited || (!usage.isAtLimit && !usage.isNearLimit)) return null;

  if (usage.isAtLimit) {
    return (
      <div
        className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm"
        style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", color: "#f87171" }}
      >
        <AlertTriangle style={{ width: 15, height: 15, flexShrink: 0 }} />
        <span className="flex-1 font-medium">
          {usage.isTeamPlan
            ? `Team minutes exhausted — ${usage.minutesUsed}/${usage.minutesLimit} min used`
            : `Monthly limit reached — ${usage.hoursUsed}h used`}
        </span>
        {onUpgrade && (
          <button
            onClick={onUpgrade}
            className="shrink-0 text-xs font-semibold px-2.5 py-1 rounded-lg bg-red-500/20 border border-red-500/30 hover:bg-red-500/30 transition-colors"
          >
            Upgrade
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs"
      style={{ background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.2)", color: "#f59e0b" }}
    >
      <AlertTriangle style={{ width: 13, height: 13, flexShrink: 0 }} />
      <span>
        {usage.isTeamPlan ? "Team" : "Your"} minutes are running low —{" "}
        <strong>{usage.minutesRemainingLabel}</strong> remaining ({Math.round(usage.pct)}% used).
      </span>
    </div>
  );
}