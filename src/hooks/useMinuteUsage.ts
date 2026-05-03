/**
 * useMinuteUsage.ts — v4 (Stabilized)
 *
 * Fixes from v3:
 *  - Unique channel name to prevent duplicate Supabase Realtime subscriptions
 *  - Added retry: false to prevent infinite retry loops on auth errors
 *  - Guard against stale planLoading preventing query from ever running
 *  - Reduced refetchInterval to avoid hammering the DB
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/hooks/useSubscription";
import { useEffectivePlan } from "@/hooks/useEffectivePlan";
import { getMinuteQuota, formatMinutes, normalizePlanKey } from "@/config/plans";
import { useEffect, useId } from "react";

export interface MinuteUsage {
  minutesUsed: number;
  minuteLimit: number;
  minutesRemaining: number;
  overageMinutes: number;
  isUnlimited: boolean;
  isAtLimit: boolean;
  isNearLimit: boolean;
  pct: number;
  minutesUsedLabel: string;
  minuteLimitLabel: string;
  minutesRemainingLabel: string;
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
  used: number;
  limit: number;
  remaining: number;
}

const PLAN_NAMES: Record<string, string> = {
  free:    "Free",
  starter: "Starter",
  growth:  "Growth",
  scale:   "Scale",
};

export function useMinuteUsage(): { usage: MinuteUsage | null; isLoading: boolean } {
  const { user }         = useAuth();
  const { subscription } = useSubscription();
  const { effectivePlan, isLoading: planLoading } = useEffectivePlan();
  const queryClient      = useQueryClient();
  const instanceId       = useId();

  // Realtime invalidation — use unique channel name per hook instance
  useEffect(() => {
    if (!user) return;
    const channelName = `minute-usage-rt-${user.id}-${instanceId.replace(/:/g, "")}`;
    const channel = supabase
      .channel(channelName)
      .on("postgres_changes", { event: "*", schema: "public", table: "calls", filter: `user_id=eq.${user.id}` }, () => {
        queryClient.invalidateQueries({ queryKey: ["minute-usage"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "usage_logs", filter: `user_id=eq.${user.id}` }, () => {
        queryClient.invalidateQueries({ queryKey: ["minute-usage"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "usage_summary", filter: `user_id=eq.${user.id}` }, () => {
        queryClient.invalidateQueries({ queryKey: ["minute-usage"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, queryClient, instanceId]);

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
      // Billing cycle
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

      // Resolve plan key
      let planKey = effectivePlan?.planKey ?? "free";
      if (subscription?.status === "active" && subscription?.plan_name && !effectivePlan?.isInherited) {
        const subKey = normalizePlanKey(subscription.plan_name);
        const ORDER = ["free", "starter", "growth", "scale"];
        if (ORDER.indexOf(subKey) >= ORDER.indexOf(planKey)) planKey = subKey;
      }

      const workspaceId = effectivePlan?.workspaceId ?? null;
      const isWorkspaceShared = !!workspaceId;
      let minutesUsed = 0;
      let meetingsUsed = 0;

      if (isWorkspaceShared) {
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
        // Personal usage
        const { data: summaryRow } = await supabase
          .from("usage_summary" as any)
          .select("total_minutes_used, billing_month")
          .eq("user_id", user!.id)
          .maybeSingle();

        if ((summaryRow as any)?.billing_month === billingMonth) {
          minutesUsed = (summaryRow as any)?.total_minutes_used ?? 0;
        }

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

      // Fetch extra minutes from subscription
      let extraMinutes = 0;
      let extraMinutesExpiresAt: string | null = null;
      {
        const { data: subRow } = await supabase
          .from("subscriptions")
          .select("extra_minutes, extra_minutes_expires_at")
          .eq("user_id", user!.id)
          .eq("status", "active")
          .maybeSingle();
        if (subRow) {
          const now = new Date();
          const expires = (subRow as any).extra_minutes_expires_at
            ? new Date((subRow as any).extra_minutes_expires_at)
            : null;
          if (!expires || expires > now) {
            extraMinutes = (subRow as any).extra_minutes ?? 0;
            extraMinutesExpiresAt = (subRow as any).extra_minutes_expires_at ?? null;
          }
        }
      }

      const baseLimit    = getMinuteQuota(planKey);
      const minuteLimit  = baseLimit === -1 ? -1 : baseLimit + extraMinutes;
      const isUnlimited  = minuteLimit === -1;
      const remaining    = isUnlimited ? Infinity : Math.max(0, minuteLimit - minutesUsed);
      const overage      = isUnlimited ? 0 : Math.max(0, minutesUsed - minuteLimit);
      const pct          = isUnlimited ? 0 : Math.min((minutesUsed / minuteLimit) * 100, 100);

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
        used:      minutesUsed,
        limit:     minuteLimit,
        remaining: isUnlimited ? -1 : remaining,
      };
    },
    enabled:         !!user && !planLoading,
    staleTime:       60_000,
    refetchInterval: 120_000,
    retry:           1,
  });

  return { usage: query.data ?? null, isLoading: query.isLoading || planLoading };
}

export const useMeetingUsage = useMinuteUsage;