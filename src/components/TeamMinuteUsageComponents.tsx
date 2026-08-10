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
        style={{ background: "rgba(34,49,92,0.07)", border: "1px solid rgba(34,49,92,0.18)" }}
        onClick={() => navigate("/billing")}
      >
        <span className="text-[10px] font-semibold text-[#22315C] tracking-wide">
          ∞ Unlimited minutes
          {pool.isTeamPlan && " · Team"}
        </span>
      </div>
    );
  }

  return (
    <div
      className="mx-3 mt-3 mb-1 px-3 py-2 rounded-md cursor-pointer hover:opacity-80 transition-opacity"
      style={{ background: "rgba(23,23,15,0.03)", border: "1px solid rgba(23,23,15,0.08)" }}
      onClick={() => navigate("/billing")}
    >
      {/* Header row */}
      <div className="flex items-center justify-between mb-1.5">
        <span
          className="text-[10px] text-[rgba(23,23,15,0.42)] font-medium uppercase flex items-center gap-1"
          style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", letterSpacing: "0.06em" }}
        >
          {pool.isTeamPlan
            ? <><Users style={{ width: 9, height: 9 }} /> Team mins</>
            : <><Timer style={{ width: 9, height: 9 }} /> Minutes</>}
        </span>
        <span
          className={cn(
            "text-[11px] font-semibold tabular-nums",
            pool.isAtLimit ? "text-[#B3442F]"
              : pool.isNearLimit ? "text-[#8A5A20]"
              : "text-[rgba(23,23,15,0.6)]",
          )}
        >
          {pool.hoursUsed}h / {pool.hoursTotal}h
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-[3px] rounded-full bg-[rgba(23,23,15,0.08)] overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            pool.isAtLimit ? "bg-[#B3442F]"
              : pool.isNearLimit ? "bg-[#8A5A20]"
              : "bg-[#22315C]",
          )}
          style={{ width: `${Math.min(pool.pct, 100)}%` }}
        />
      </div>

      {/* Status line */}
      <div className="flex items-center justify-between mt-1">
        <p
          className={cn(
            "text-[9.5px]",
            pool.isAtLimit ? "text-[#B3442F] font-medium"
              : pool.isNearLimit ? "text-[#8A5A20]"
              : "text-[rgba(23,23,15,0.35)]",
          )}
        >
          {pool.isAtLimit
            ? "Limit reached · Upgrade"
            : `${pool.hoursRemaining}h remaining`}
        </p>
        {/* Extra minutes badge */}
        {pool.extraMinutes > 0 && (
          <span className="text-[9px] font-bold text-[#22315C] bg-[rgba(34,49,92,0.09)] border border-[rgba(34,49,92,0.22)] rounded-full px-1.5 py-0.5 flex items-center gap-0.5">
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

  const barColor = pool.isAtLimit ? "#B3442F"
    : pool.isNearLimit ? "#8A5A20"
    : "#22315C";

  return (
    <div
      className={cn(
        "rounded-2xl border p-5 space-y-4",
        pool.isAtLimit ? "border-[rgba(179,68,47,0.25)] bg-[rgba(179,68,47,0.04)]"
          : pool.isNearLimit ? "border-[rgba(138,90,32,0.25)] bg-[rgba(138,90,32,0.04)]"
          : "border-[rgba(23,23,15,0.08)] bg-[rgba(23,23,15,0.02)]",
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: "rgba(34,49,92,0.09)", border: "1px solid rgba(34,49,92,0.22)" }}
          >
            {pool.isTeamPlan
              ? <Users style={{ width: 16, height: 16, color: "#22315C" }} />
              : <Timer style={{ width: 16, height: 16, color: "#22315C" }} />}
          </div>
          <div>
            <p className="text-sm font-semibold text-[#17170F]">
              {pool.isTeamPlan ? "Team Meeting Minutes" : "Meeting Minutes"}
            </p>
            <p className="text-xs text-[rgba(23,23,15,0.42)]">
              {pool.planName} plan{pool.isTeamPlan ? " · shared pool" : ""}
            </p>
          </div>
        </div>
        {pool.isAtLimit && pool.isAdmin && (
          <button
            onClick={() => navigate("/billing")}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-[rgba(34,49,92,0.08)] border border-[rgba(34,49,92,0.25)] text-[#22315C] hover:bg-[rgba(34,49,92,0.14)] transition-colors"
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
            style={{ background: "rgba(23,23,15,0.02)", border: "1px solid rgba(23,23,15,0.07)" }}
          >
            <div className="text-xl font-bold text-[#17170F]">{val}</div>
            <div className="text-[10px] text-[rgba(23,23,15,0.4)] uppercase tracking-wide">{label}</div>
          </div>
        ))}
      </div>

      {/* ── Extra minutes row ── */}
      {!pool.isUnlimited && (
        <div className="rounded-xl px-4 py-3 flex items-center justify-between"
          style={{ background: "rgba(34,49,92,0.04)", border: "1px solid rgba(34,49,92,0.12)" }}>
          <div>
            <p className="text-xs font-semibold text-[rgba(23,23,15,0.55)]">Plan base</p>
            <p className="text-sm font-bold text-[rgba(23,23,15,0.8)]">{(pool.baseMinutes / 60).toFixed(0)}h / month</p>
          </div>
          <div className="text-center">
            <p className="text-xs font-semibold text-[rgba(34,49,92,0.6)]">Extra purchased</p>
            {pool.extraMinutes > 0 ? (
              <>
                <p className="text-sm font-bold text-[#22315C] flex items-center gap-1 justify-center">
                  <Sparkles style={{ width: 12, height: 12 }} />
                  {pool.extraLabel}
                </p>
                {pool.extraMinutesExpiresAt && (
                  <p className="text-[10px] text-[rgba(23,23,15,0.35)] mt-0.5">
                    until {format(new Date(pool.extraMinutesExpiresAt), "MMM d")}
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm font-medium text-[rgba(23,23,15,0.3)]">—</p>
            )}
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold text-[rgba(23,23,15,0.55)]">Combined total</p>
            <p className="text-sm font-bold text-[#17170F]">{pool.hoursTotal}h</p>
          </div>
        </div>
      )}

      {/* Progress bar */}
      {!pool.isUnlimited && (
        <div className="space-y-1.5">
          <div className="h-2.5 rounded-full bg-[rgba(23,23,15,0.07)] overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${Math.min(pool.pct, 100)}%`, background: barColor }}
            />
          </div>
          <div className="flex justify-between text-xs text-[rgba(23,23,15,0.4)]">
            <span>{Math.round(pool.pct)}% used this cycle</span>
            <span>
              {pool.isAtLimit
                ? <span className="text-[#B3442F] font-medium">Limit reached</span>
                : `${pool.remainingLabel} remaining`}
            </span>
          </div>
        </div>
      )}

      {/* Near-limit warning */}
      {pool.isNearLimit && !pool.isAtLimit && (
        <div
          className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl text-xs"
          style={{ background: "rgba(138,90,32,0.08)", border: "1px solid rgba(138,90,32,0.22)", color: "#8A5A20" }}
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
          style={{ background: "rgba(179,68,47,0.08)", border: "1px solid rgba(179,68,47,0.22)", color: "#B3442F" }}
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
            className="flex items-center gap-1.5 text-xs text-[rgba(23,23,15,0.42)] hover:text-[rgba(23,23,15,0.7)] transition-colors"
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
                      style={{ background: "rgba(102,66,161,0.12)", color: "#6642A1" }}
                    >
                      {name[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between text-[11px] mb-0.5">
                        <span className="text-[rgba(23,23,15,0.65)] truncate">{name}</span>
                        <span className="text-[rgba(23,23,15,0.35)] tabular-nums shrink-0 ml-2">{hrs_used}h</span>
                      </div>
                      <div className="h-[3px] rounded-full bg-[rgba(23,23,15,0.07)] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[#6642A1]"
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