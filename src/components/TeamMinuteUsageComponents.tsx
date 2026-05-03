/**
 * TeamMinuteUsageComponents.tsx — v2 (Team Pool Sync)
 *
 * All three components now use `useTeamMinutePool` as their single source
 * of truth.  When an admin buys extra minutes the Supabase Realtime
 * subscription in useTeamMinutePool fires and every component re-renders
 * instantly — no refresh needed, works for all team members simultaneously.
 *
 * Components:
 *  <TeamUsageSidebarPill />   — compact sidebar widget
 *  <TeamUsageBillingCard />   — detailed billing page card
 *  <TeamUsageBanner />        — pre-call warning banner
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Timer, Users, TrendingUp, AlertTriangle, Zap,
  ChevronDown, ChevronUp, Sparkles, Plus, Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTeamMinutePool } from "@/hooks/useTeamMinutePool";
import { format } from "date-fns";

// ─────────────────────────────────────────────────────────────────────────────
// Sidebar pill  (shown in DashboardLayout sidebar)
// ─────────────────────────────────────────────────────────────────────────────

export function TeamUsageSidebarPill() {
  const navigate = useNavigate();
  const { pool } = useTeamMinutePool();

  if (!pool) return null;

  if (pool.isUnlimited) {
    return (
      <div
        className="mx-3 mt-3 mb-1 px-3 py-1.5 rounded-md cursor-pointer hover:opacity-80 transition-opacity"
        style={{ background: "rgba(26,240,196,0.08)", border: "1px solid rgba(26,240,196,0.15)" }}
        onClick={() => navigate("/billing")}
      >
        <span className="text-[10px] font-semibold text-[#1af0c4] tracking-wide">
          ∞ Unlimited minutes
          {pool.isTeamPlan && " · Team"}
        </span>
      </div>
    );
  }

  return (
    <div
      className="mx-3 mt-3 mb-1 px-3 py-2 rounded-md cursor-pointer hover:opacity-80 transition-opacity"
      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
      onClick={() => navigate("/billing")}
    >
      {/* Header row */}
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] text-[rgba(255,255,255,0.38)] font-medium tracking-wide uppercase flex items-center gap-1">
          {pool.isTeamPlan
            ? <><Users style={{ width: 9, height: 9 }} /> Team mins</>
            : <><Timer style={{ width: 9, height: 9 }} /> Minutes</>}
        </span>
        <span
          className={cn(
            "text-[11px] font-semibold tabular-nums",
            pool.isAtLimit ? "text-red-400"
              : pool.isNearLimit ? "text-amber-400"
              : "text-[rgba(255,255,255,0.55)]",
          )}
        >
          {pool.hoursUsed}h / {pool.hoursTotal}h
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-[3px] rounded-full bg-[rgba(255,255,255,0.08)] overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            pool.isAtLimit ? "bg-red-500"
              : pool.isNearLimit ? "bg-amber-400"
              : "bg-[#1af0c4]",
          )}
          style={{ width: `${Math.min(pool.pct, 100)}%` }}
        />
      </div>

      {/* Status line */}
      <div className="flex items-center justify-between mt-1">
        <p
          className={cn(
            "text-[9.5px]",
            pool.isAtLimit ? "text-red-400 font-medium"
              : pool.isNearLimit ? "text-amber-400"
              : "text-[rgba(255,255,255,0.22)]",
          )}
        >
          {pool.isAtLimit
            ? "Limit reached · Upgrade"
            : `${pool.hoursRemaining}h remaining`}
        </p>
        {/* Extra minutes badge */}
        {pool.extraMinutes > 0 && (
          <span className="text-[9px] font-bold text-[#1af0c4] bg-[rgba(26,240,196,0.1)] border border-[rgba(26,240,196,0.2)] rounded-full px-1.5 py-0.5 flex items-center gap-0.5">
            <Plus style={{ width: 7, height: 7 }} />
            {pool.extraLabel}
          </span>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Billing page card — full breakdown with base + extra + total
// ─────────────────────────────────────────────────────────────────────────────

export function TeamUsageBillingCard({ className }: { className?: string }) {
  const navigate = useNavigate();
  const { pool, isLoading } = useTeamMinutePool();
  const [showBreakdown, setShowBreakdown] = useState(false);

  if (isLoading || !pool) return null;

  const barColor = pool.isAtLimit ? "#ef4444"
    : pool.isNearLimit ? "#f59e0b"
    : "#1af0c4";

  return (
    <div
      className={cn(
        "rounded-2xl border p-5 space-y-4",
        pool.isAtLimit ? "border-red-500/25 bg-red-500/5"
          : pool.isNearLimit ? "border-amber-400/25 bg-amber-400/5"
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
            {pool.isTeamPlan
              ? <Users style={{ width: 16, height: 16, color: "#1af0c4" }} />
              : <Timer style={{ width: 16, height: 16, color: "#1af0c4" }} />}
          </div>
          <div>
            <p className="text-sm font-semibold text-white">
              {pool.isTeamPlan ? "Team Meeting Minutes" : "Meeting Minutes"}
            </p>
            <p className="text-xs text-white/40">
              {pool.planName} plan{pool.isTeamPlan ? " · shared pool" : ""}
            </p>
          </div>
        </div>
        {pool.isAtLimit && pool.isAdmin && (
          <button
            onClick={() => navigate("/billing")}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-[#1af0c4]/10 border border-[#1af0c4]/25 text-[#1af0c4] hover:bg-[#1af0c4]/20 transition-colors"
          >
            <Zap style={{ width: 12, height: 12 }} /> Upgrade
          </button>
        )}
      </div>

      {/* ── Three-column stats: Used / Remaining / Total ── */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Used",      val: pool.isUnlimited ? "∞" : `${pool.hoursUsed}h` },
          { label: "Remaining", val: pool.isUnlimited ? "∞" : `${pool.hoursRemaining}h` },
          { label: "Total",     val: pool.isUnlimited ? "∞" : `${pool.hoursTotal}h` },
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

      {/* ── Extra minutes row ── */}
      {!pool.isUnlimited && (
        <div className="rounded-xl px-4 py-3 flex items-center justify-between"
          style={{ background: "rgba(26,240,196,0.05)", border: "1px solid rgba(26,240,196,0.12)" }}>
          <div>
            <p className="text-xs font-semibold text-white/60">Plan base</p>
            <p className="text-sm font-bold text-white/80">{(pool.baseMinutes / 60).toFixed(0)}h / month</p>
          </div>
          <div className="text-center">
            <p className="text-xs font-semibold text-[#1af0c4]/60">Extra purchased</p>
            {pool.extraMinutes > 0 ? (
              <>
                <p className="text-sm font-bold text-[#1af0c4] flex items-center gap-1 justify-center">
                  <Sparkles style={{ width: 12, height: 12 }} />
                  {pool.extraLabel}
                </p>
                {pool.extraMinutesExpiresAt && (
                  <p className="text-[10px] text-white/30 mt-0.5">
                    until {format(new Date(pool.extraMinutesExpiresAt), "MMM d")}
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm font-medium text-white/30">—</p>
            )}
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold text-white/60">Combined total</p>
            <p className="text-sm font-bold text-white">{pool.hoursTotal}h</p>
          </div>
        </div>
      )}

      {/* Progress bar */}
      {!pool.isUnlimited && (
        <div className="space-y-1.5">
          <div className="h-2.5 rounded-full bg-white/[0.06] overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${Math.min(pool.pct, 100)}%`, background: barColor }}
            />
          </div>
          <div className="flex justify-between text-xs text-white/35">
            <span>{Math.round(pool.pct)}% used this cycle</span>
            <span>
              {pool.isAtLimit
                ? <span className="text-red-400 font-medium">Limit reached</span>
                : `${pool.remainingLabel} remaining`}
            </span>
          </div>
        </div>
      )}

      {/* Near-limit warning */}
      {pool.isNearLimit && !pool.isAtLimit && (
        <div
          className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl text-xs"
          style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", color: "#f59e0b" }}
        >
          <AlertTriangle style={{ width: 13, height: 13, flexShrink: 0, marginTop: 1 }} />
          <span>
            Running low — {pool.remainingLabel} remaining.{" "}
            {pool.isAdmin && (
              <button onClick={() => navigate("/billing")} className="underline font-semibold">
                Buy more minutes
              </button>
            )}
          </span>
        </div>
      )}

      {/* At-limit error */}
      {pool.isAtLimit && (
        <div
          className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl text-xs"
          style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171" }}
        >
          <AlertTriangle style={{ width: 13, height: 13, flexShrink: 0, marginTop: 1 }} />
          <span>
            {pool.isTeamPlan
              ? "Team minute pool exhausted. New calls are blocked until the admin upgrades or buys extra minutes."
              : "Monthly minutes exhausted. Upgrade or buy extras to continue."}
          </span>
        </div>
      )}

      {/* Member breakdown (team plans only) */}
      {pool.isTeamPlan && pool.memberBreakdown.length > 0 && (
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
              {pool.memberBreakdown.map((m) => {
                const pct = pool.totalMinutes > 0
                  ? Math.min(100, Math.round((m.minutes_used / pool.totalMinutes) * 100))
                  : 0;
                const hrs_used = (m.minutes_used / 60).toFixed(1);
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
                        <span className="text-white/35 tabular-nums shrink-0 ml-2">{hrs_used}h</span>
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
// Pre-call / inline warning banner
// ─────────────────────────────────────────────────────────────────────────────

export function TeamUsageBanner({ onUpgrade }: { onUpgrade?: () => void }) {
  const { pool } = useTeamMinutePool();
  if (!pool || pool.isUnlimited || (!pool.isAtLimit && !pool.isNearLimit)) return null;

  if (pool.isAtLimit) {
    return (
      <div
        className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm"
        style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", color: "#f87171" }}
      >
        <AlertTriangle style={{ width: 15, height: 15, flexShrink: 0 }} />
        <span className="flex-1 font-medium">
          {pool.isTeamPlan
            ? `Team minutes exhausted — ${pool.usedLabel} of ${pool.totalLabel} used`
            : `Monthly limit reached — ${pool.usedLabel} used`}
        </span>
        {onUpgrade && pool.isAdmin && (
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
        {pool.isTeamPlan ? "Team" : "Your"} minutes are running low —{" "}
        <strong>{pool.remainingLabel}</strong> remaining ({Math.round(pool.pct)}% used).
      </span>
    </div>
  );
}