import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/hooks/useSubscription";
import { useEffectivePlan } from "@/hooks/useEffectivePlan";
import { useEffect } from "react";

export interface MeetingUsage {
  used: number;
  limit: number;
  remaining: number;
  isUnlimited: boolean;
  isAtLimit: boolean;
  isNearLimit: boolean;
  pct: number;
  planKey: string;
  planName: string;
  billingCycleStart: Date;
  billingCycleEnd: Date;
  resetDate: Date;
  /** True when the plan limit is inherited from a team admin */
  isInherited: boolean;
  /** True when usage is counted across the whole workspace */
  isWorkspaceShared: boolean;
  workspaceId: string | null;
}

export function getMeetingLimit(planKey: string): number {
  const MAP: Record<string, number> = {
    free: 5, starter: 50, growth: 300, scale: -1,
  };
  return MAP[planKey] ?? 5;
}

/**
 * Returns real-time meeting usage for the current user.
 *
 * When the user belongs to a workspace the usage is counted
 * across ALL workspace members — they share the admin's quota.
 *
 * When the user has no workspace the usage is counted only for
 * their own calls (original behaviour).
 */
export function useMeetingUsage(): { usage: MeetingUsage | null; isLoading: boolean } {
  const { user }    = useAuth();
  const { subscription } = useSubscription();
  const { effectivePlan, isLoading: planLoading } = useEffectivePlan();
  const queryClient = useQueryClient();

  // Realtime: invalidate whenever any call changes
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("meeting-usage-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "calls" },
        () => queryClient.invalidateQueries({ queryKey: ["meeting-usage"] })
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, queryClient]);

  const query = useQuery({
    queryKey: [
      "meeting-usage",
      user?.id,
      effectivePlan?.planKey,
      effectivePlan?.workspaceId,
    ],
    queryFn: async (): Promise<MeetingUsage> => {
      // ── Billing cycle boundaries ───────────────────────────
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
        if (billingCycleStart > now) {
          billingCycleStart.setMonth(billingCycleStart.getMonth() - 1);
        }
      }

      const billingCycleEnd = new Date(billingCycleStart);
      billingCycleEnd.setMonth(billingCycleEnd.getMonth() + 1);

      // ── Determine whether to count at workspace or user level ─
      const workspaceId  = effectivePlan?.workspaceId ?? null;
      const isWorkspaceShared = !!workspaceId;

      let used = 0;

      if (isWorkspaceShared) {
        // Count meetings from ALL active workspace members via the view
        const { data: usageRow } = await supabase
          .from("workspace_meeting_usage")
          .select("meetings_used")
          .eq("workspace_id", workspaceId)
          .maybeSingle();

        used = usageRow?.meetings_used ?? 0;
      } else {
        // Personal usage only
        const { count, error } = await supabase
          .from("calls")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user!.id)
          .neq("status", "live")
          .gte("created_at", billingCycleStart.toISOString());

        if (error) throw error;
        used = count ?? 0;
      }

      // ── Plan limits ────────────────────────────────────────
      const planKey   = effectivePlan?.planKey ?? "free";
      const limit     = getMeetingLimit(planKey);
      const isUnlimited = limit === -1;
      const remaining   = isUnlimited ? Infinity : Math.max(0, limit - used);
      const pct         = isUnlimited ? 0 : Math.min((used / limit) * 100, 100);

      const PLAN_NAMES: Record<string, string> = {
        free: "Free", starter: "Starter", growth: "Growth", scale: "Scale",
      };

      return {
        used,
        limit,
        remaining:    isUnlimited ? -1 : remaining,
        isUnlimited,
        isAtLimit:    !isUnlimited && used >= limit,
        isNearLimit:  !isUnlimited && pct >= 80 && used < limit,
        pct,
        planKey,
        planName:     PLAN_NAMES[planKey] ?? "Free",
        billingCycleStart,
        billingCycleEnd,
        resetDate:    billingCycleEnd,
        isInherited:  effectivePlan?.isInherited ?? false,
        isWorkspaceShared,
        workspaceId,
      };
    },
    enabled:    !!user && !planLoading,
    staleTime:  30_000,
    refetchInterval: 60_000,
  });

  return { usage: query.data ?? null, isLoading: query.isLoading || planLoading };
}
