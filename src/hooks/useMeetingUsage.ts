/**
 * useMinuteUsage.ts — v3
 *
 * Minute-based usage tracking against new plan tiers:
 *   Free: 30 min | Starter: 300 min | Growth: 1500 min | Scale: 5000 min
 *
 * Data source priority:
 *  1. usage_summary.total_minutes_used  (authoritative post-call aggregate)
 *  2. usage_logs SUM                    (fallback)
 *  3. calls count × avg duration        (last resort)
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
  minutesUsed:       number;
  minuteLimit:       number;
  minutesRemaining:  number;
  overageMinutes:    number;
  isUnlimited:       boolean;
  isAtLimit:         boolean;
  isNearLimit:       boolean;
  pct:               number;             // 0-100

  minutesUsedLabel:      string;
  minuteLimitLabel:      string;
  minutesRemainingLabel: string;

  // Meeting counts (legacy compat)
  meetingsUsed:      number;
  meetingLimit:      number;
  meetingsRemaining: number;

  planKey:  string;
  planName: string;
  billingCycleStart: Date;
  billingCycleEnd:   Date;
  resetDate:         Date;

  isInherited:       boolean;
  isWorkspaceShared: boolean;
  workspaceId:       string | null;

  // Legacy aliases
  used:      number;
  limit:     number;
  remaining: number;
}

// ── Plan name lookup ──────────────────────────────────────────────────────

const PLAN_NAMES: Record<string, string> = {
  free:    "Free",
  starter: "Starter",
  growth:  "Growth",
  scale:   "Scale",
};

// ── Hook ──────────────────────────────────────────────────────────────────

export function useMinuteUsage(): { usage: MinuteUsage | null; isLoading: boolean } {
  const { user }         = useAuth();
  const { subscription } = useSubscription();
  const { effectivePlan, isLoading: planLoading } = useEffectivePlan();
  const queryClient      = useQueryClient();

  // Invalidate on calls/usage changes
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
      // ── Billing cycle ─────────────────────────────────────────────────
      let billingCycleStart = new Date();
      billingCycleStart.setDate(1);
      billingCycleStart.setHours(0, 0, 0, 0);

      if (subscription?.next_payment_date) {
        const next = new Date(subscription.next_payment_date);
        billingCycleStart = new Date(next);
        billingCycleStart.setMonth(billingCycleStart.getMonth() - 1);
      } else if (subscription?.created_at) {
        const created = new Date(subscription.created_at);
        const now     = new Date();
        billingCycleStart = new Date(created);
        billingCycleStart.setFullYear(now.getFullYear(), now.getMonth());
        if (billingCycleStart > now) billingCycleStart.setMonth(billingCycleStart.getMonth() - 1);
      }

      const billingCycleEnd = new Date(billingCycleStart);
      billingCycleEnd.setMonth(billingCycleEnd.getMonth() + 1);
      const billingMonth = `${billingCycleStart.getFullYear()}-${String(billingCycleStart.getMonth() + 1).padStart(2, "0")}`;

      // ── Resolve plan key ──────────────────────────────────────────────
      let planKey = effectivePlan?.planKey ?? "free";
      if (subscription?.status === "active" && subscription?.plan_name && !effectivePlan?.isInherited) {
        const subKey = normalizePlanKey(subscription.plan_name);
        const ORDER  = ["free", "starter", "growth", "scale"];
        if (ORDER.indexOf(subKey) >= ORDER.indexOf(planKey)) planKey = subKey;
      }

      // ── Usage counting ────────────────────────────────────────────────
      const workspaceId       = effectivePlan?.workspaceId ?? null;
      const isWorkspaceShared = !!workspaceId;
      let minutesUsed  = 0;
      let meetingsUsed = 0;

      if (isWorkspaceShared) {
        // Try workspace_meeting_usage view
        const { data: wsRow } = await supabase
          .from("workspace_meeting_usage" as any)
          .select("meetings_used, minutes_used")
          .eq("workspace_id", workspaceId)
          .maybeSingle();

        meetingsUsed = (wsRow as any)?.meetings_used ?? 0;
        minutesUsed  = (wsRow as any)?.minutes_used  ?? 0;

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
        // 1. usage_summary (fastest)
        const { data: summaryRow } = await supabase
          .from("usage_summary" as any)
          .select("total_minutes_used, billing_month")
          .eq("user_id", user!.id)
          .maybeSingle();

        if ((summaryRow as any)?.billing_month === billingMonth) {
          minutesUsed = (summaryRow as any)?.total_minutes_used ?? 0;
        }

        // 2. usage_logs fallback
        if (minutesUsed === 0) {
          const { data: logs } = await supabase
            .from("usage_logs" as any)
            .select("duration_minutes")
            .eq("user_id", user!.id)
            .eq("billing_month", billingMonth);

          minutesUsed  = ((logs as any[]) ?? []).reduce(
            (sum: number, r: any) => sum + (r.duration_minutes ?? 0), 0
          );
          meetingsUsed = (logs as any[])?.length ?? 0;
        }

        // 3. meeting count for display
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

      // ── Compute stats ─────────────────────────────────────────────────
      const minuteLimit  = getMinuteQuota(planKey);
      const isUnlimited  = minuteLimit === -1;
      const remaining    = isUnlimited ? Infinity : Math.max(0, minuteLimit - minutesUsed);
      const overage      = isUnlimited ? 0 : Math.max(0, minutesUsed - minuteLimit);
      const pct          = isUnlimited ? 0 : Math.min((minutesUsed / minuteLimit) * 100, 100);

      const meetingLimit      = effectivePlan?.callsLimit ?? 5;
      const meetingsRemaining = meetingLimit === -1 ? Infinity : Math.max(0, meetingLimit - meetingsUsed);

      return {
        minutesUsed,
        minuteLimit,
        minutesRemaining:      isUnlimited ? -1 : remaining,
        overageMinutes:        overage,
        isUnlimited,
        isAtLimit:             !isUnlimited && minutesUsed >= minuteLimit,
        isNearLimit:           !isUnlimited && pct >= 80 && minutesUsed < minuteLimit,
        pct,

        minutesUsedLabel:      formatMinutes(minutesUsed),
        minuteLimitLabel:      isUnlimited ? "Unlimited" : formatMinutes(minuteLimit),
        minutesRemainingLabel: isUnlimited ? "Unlimited" : formatMinutes(remaining),

        meetingsUsed,
        meetingLimit,
        meetingsRemaining: meetingLimit === -1 ? -1 : meetingsRemaining,

        planKey,
        planName:    PLAN_NAMES[planKey] ?? "Free",
        billingCycleStart,
        billingCycleEnd,
        resetDate: billingCycleEnd,

        isInherited:      effectivePlan?.isInherited ?? false,
        isWorkspaceShared,
        workspaceId,

        // Legacy aliases
        used:      minutesUsed,
        limit:     minuteLimit,
        remaining: isUnlimited ? -1 : remaining,
      };
    },
    enabled:         !!user && !planLoading,
    staleTime:       30_000,
    refetchInterval: 60_000,
  });

  return { usage: query.data ?? null, isLoading: query.isLoading || planLoading };
}

/** Backwards-compatible alias */
export const useMeetingUsage = useMinuteUsage;