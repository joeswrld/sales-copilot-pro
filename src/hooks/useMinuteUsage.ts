/**
 * useMinuteUsage.ts
 *
 * Replaces the per-call useMeetingUsage hook with minute-based tracking.
 *
 * Data source (priority):
 *  1. usage_summary table  — authoritative post-call aggregate
 *  2. usage_logs SUM       — fallback if summary missing
 *  3. call count * avg     — last-resort estimate
 *
 * Plan resolution uses useEffectivePlan (team-inherited or personal).
 * UI should show hours/progress bars, never raw minute math.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/hooks/useSubscription";
import { useEffectivePlan } from "@/hooks/useEffectivePlan";
import { getMinuteQuota, formatMinutes, normalizePlanKey } from "@/config/plans";
import { useEffect } from "react";

// ── Types ─────────────────────────────────────────────────────────────────

export interface MinuteUsage {
  /** Minutes consumed this billing cycle */
  minutesUsed: number;
  /** Quota ceiling (-1 = unlimited) */
  minuteLimit: number;
  /** Remaining minutes (Infinity if unlimited) */
  minutesRemaining: number;
  /** Overage minutes beyond the quota */
  overageMinutes: number;
  isUnlimited: boolean;
  isAtLimit: boolean;
  isNearLimit: boolean;
  /** 0-100 */
  pct: number;

  // Human-readable helpers
  minutesUsedLabel: string;
  minuteLimitLabel: string;
  minutesRemainingLabel: string;

  // Meeting counts kept for legacy UI compatibility
  meetingsUsed: number;
  meetingLimit: number;
  meetingsRemaining: number;

  planKey: string;
  planName: string;
  billingCycleStart: Date;
  billingCycleEnd: Date;
  resetDate: Date;

  isInherited: boolean;
  isWorkspaceShared: boolean;
  workspaceId: string | null;

  // Alias so MeetingUsageCard still compiles with `usage.used` etc.
  used: number;
  limit: number;
  remaining: number;
}

// ── Plan name → key normaliser (local) ───────────────────────────────────

const PLAN_NAMES: Record<string, string> = {
  free: "Free",
  starter: "Starter",
  growth: "Growth",
  scale: "Scale",
};

// ── Hook ──────────────────────────────────────────────────────────────────

export function useMinuteUsage(): { usage: MinuteUsage | null; isLoading: boolean } {
  const { user } = useAuth();
  const { subscription } = useSubscription();
  const { effectivePlan, isLoading: planLoading } = useEffectivePlan();
  const queryClient = useQueryClient();

  // Invalidate on any call change
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("minute-usage-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "calls" }, () => {
        queryClient.invalidateQueries({ queryKey: ["minute-usage"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "usage_logs" }, () => {
        queryClient.invalidateQueries({ queryKey: ["minute-usage"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "usage_summary" }, () => {
        queryClient.invalidateQueries({ queryKey: ["minute-usage"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, queryClient]);

  const query = useQuery({
    queryKey: [
      "minute-usage",
      user?.id,
      subscription?.status,
      subscription?.plan_name,
      effectivePlan?.planKey,
      effectivePlan?.workspaceId,
    ],
    queryFn: async (): Promise<MinuteUsage> => {
      // ── Billing cycle boundaries ──────────────────────────────────
      let billingCycleStart = new Date();
      billingCycleStart.setDate(1);
      billingCycleStart.setHours(0, 0, 0, 0);

      if (subscription?.next_payment_date) {
        const next = new Date(subscription.next_payment_date);
        billingCycleStart = new Date(next);
        billingCycleStart.setMonth(billingCycleStart.getMonth() - 1);
      } else if (subscription?.created_at) {
        const created = new Date(subscription.created_at);
        const now = new Date();
        billingCycleStart = new Date(created);
        billingCycleStart.setFullYear(now.getFullYear(), now.getMonth());
        if (billingCycleStart > now) {
          billingCycleStart.setMonth(billingCycleStart.getMonth() - 1);
        }
      }

      const billingCycleEnd = new Date(billingCycleStart);
      billingCycleEnd.setMonth(billingCycleEnd.getMonth() + 1);
      const billingMonth = `${billingCycleStart.getFullYear()}-${String(billingCycleStart.getMonth() + 1).padStart(2, "0")}`;

      // ── Resolve plan key ──────────────────────────────────────────
      let planKey = effectivePlan?.planKey ?? "free";
      if (subscription?.status === "active" && subscription?.plan_name && !effectivePlan?.isInherited) {
        const subKey = normalizePlanKey(subscription.plan_name);
        const ORDER = ["free", "starter", "growth", "scale"];
        if (ORDER.indexOf(subKey) >= ORDER.indexOf(planKey)) planKey = subKey;
      }

      // ── Usage counting ────────────────────────────────────────────
      const workspaceId = effectivePlan?.workspaceId ?? null;
      const isWorkspaceShared = !!workspaceId;

      let minutesUsed = 0;
      let meetingsUsed = 0;

      if (isWorkspaceShared) {
        // 1. Try workspace_meeting_usage view
        const { data: wsRow } = await supabase
          .from("workspace_meeting_usage" as any)
          .select("meetings_used, minutes_used")
          .eq("workspace_id", workspaceId)
          .maybeSingle();

        meetingsUsed = (wsRow as any)?.meetings_used ?? 0;
        minutesUsed  = (wsRow as any)?.minutes_used  ?? 0;

        // 2. Fallback: sum usage_logs for all workspace members
        if (minutesUsed === 0) {
          const { data: members } = await supabase
            .from("team_members")
            .select("user_id")
            .eq("status", "active");

          if (members?.length) {
            const memberIds = members.map((m: any) => m.user_id);
            const { data: logs } = await supabase
              .from("usage_logs" as any)
              .select("duration_minutes")
              .in("user_id", memberIds)
              .eq("billing_month", billingMonth);

            minutesUsed = ((logs as any[]) ?? []).reduce(
              (sum: number, r: any) => sum + (r.duration_minutes ?? 0), 0
            );

            if (meetingsUsed === 0) meetingsUsed = (logs as any[])?.length ?? 0;
          }
        }
      } else {
        // Personal usage from usage_summary first
        const { data: summaryRow } = await supabase
          .from("usage_summary" as any)
          .select("total_minutes_used")
          .eq("user_id", user!.id)
          .eq("billing_month", billingMonth)
          .maybeSingle();

        minutesUsed = (summaryRow as any)?.total_minutes_used ?? 0;

        // Fallback: sum usage_logs
        if (minutesUsed === 0) {
          const { data: logs } = await supabase
            .from("usage_logs" as any)
            .select("duration_minutes")
            .eq("user_id", user!.id)
            .eq("billing_month", billingMonth);

          minutesUsed = ((logs as any[]) ?? []).reduce(
            (sum: number, r: any) => sum + (r.duration_minutes ?? 0), 0
          );
          meetingsUsed = (logs as any[])?.length ?? 0;
        }

        // Count meetings for display
        if (meetingsUsed === 0) {
          const { count } = await supabase
            .from("calls")
            .select("id", { count: "exact", head: true })
            .eq("user_id", user!.id)
            .neq("status", "live")
            .gte("created_at", billingCycleStart.toISOString());
          meetingsUsed = count ?? 0;
        }
      }

      // ── Compute stats ─────────────────────────────────────────────
      const minuteLimit  = getMinuteQuota(planKey);
      const isUnlimited  = minuteLimit === -1;
      const remaining    = isUnlimited ? Infinity : Math.max(0, minuteLimit - minutesUsed);
      const overage      = isUnlimited ? 0 : Math.max(0, minutesUsed - minuteLimit);
      const pct          = isUnlimited ? 0 : Math.min((minutesUsed / minuteLimit) * 100, 100);

      // Meeting-count aliases (for legacy UI components)
      const meetingLimit      = effectivePlan?.callsLimit ?? 5;
      const meetingsRemaining = meetingLimit === -1 ? Infinity : Math.max(0, meetingLimit - meetingsUsed);

      return {
        minutesUsed,
        minuteLimit,
        minutesRemaining:     isUnlimited ? -1 : remaining,
        overageMinutes:       overage,
        isUnlimited,
        isAtLimit:            !isUnlimited && minutesUsed >= minuteLimit,
        isNearLimit:          !isUnlimited && pct >= 80 && minutesUsed < minuteLimit,
        pct,

        minutesUsedLabel:     formatMinutes(minutesUsed),
        minuteLimitLabel:     isUnlimited ? "Unlimited" : formatMinutes(minuteLimit),
        minutesRemainingLabel: isUnlimited ? "Unlimited" : formatMinutes(remaining),

        meetingsUsed,
        meetingLimit,
        meetingsRemaining:    meetingLimit === -1 ? -1 : meetingsRemaining,

        planKey,
        planName:             PLAN_NAMES[planKey] ?? "Free",
        billingCycleStart,
        billingCycleEnd,
        resetDate:            billingCycleEnd,
        isInherited:          effectivePlan?.isInherited ?? false,
        isWorkspaceShared,
        workspaceId,

        // Legacy aliases
        used:      minutesUsed,
        limit:     minuteLimit,
        remaining: isUnlimited ? -1 : remaining,
      };
    },
    enabled:        !!user && !planLoading,
    staleTime:      30_000,
    refetchInterval: 60_000,
  });

  return { usage: query.data ?? null, isLoading: query.isLoading || planLoading };
}

/**
 * Backwards-compatible alias.
 * Existing components importing `useMeetingUsage` continue to work unchanged.
 */
export const useMeetingUsage = useMinuteUsage;