import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/hooks/useSubscription";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

const PLAN_MEETING_LIMITS: Record<string, number> = {
  free: 5,
  starter: 50,
  growth: 300,
  scale: -1, // unlimited
};

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
}

export function getMeetingLimit(planKey: string): number {
  return PLAN_MEETING_LIMITS[planKey] ?? 5;
}

export function useMeetingUsage(): { usage: MeetingUsage | null; isLoading: boolean } {
  const { user } = useAuth();
  const { currentPlanKey, subscription } = useSubscription();
  const queryClient = useQueryClient();

  // Real-time subscription to invalidate usage when calls change
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("meeting-usage-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "calls" }, () => {
        queryClient.invalidateQueries({ queryKey: ["meeting-usage"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, queryClient]);

  const query = useQuery({
    queryKey: ["meeting-usage", user?.id, currentPlanKey],
    queryFn: async (): Promise<MeetingUsage> => {
      // Determine billing cycle start
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

      // Billing cycle end = start + 30 days
      const billingCycleEnd = new Date(billingCycleStart);
      billingCycleEnd.setMonth(billingCycleEnd.getMonth() + 1);

      // Count completed calls in current billing cycle
      const { count, error } = await supabase
        .from("calls")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user!.id)
        .neq("status", "live")
        .gte("created_at", billingCycleStart.toISOString());

      if (error) throw error;

      const used = count ?? 0;
      const planKey = currentPlanKey || "free";
      const limit = getMeetingLimit(planKey);
      const isUnlimited = limit === -1;
      const remaining = isUnlimited ? Infinity : Math.max(0, limit - used);
      const pct = isUnlimited ? 0 : Math.min((used / limit) * 100, 100);

      const planNames: Record<string, string> = {
        free: "Free",
        starter: "Starter",
        growth: "Growth",
        scale: "Scale",
      };

      return {
        used,
        limit,
        remaining: isUnlimited ? -1 : remaining,
        isUnlimited,
        isAtLimit: !isUnlimited && used >= limit,
        isNearLimit: !isUnlimited && pct >= 80 && used < limit,
        pct,
        planKey,
        planName: planNames[planKey] ?? "Free",
        billingCycleStart,
        billingCycleEnd,
        resetDate: billingCycleEnd,
      };
    },
    enabled: !!user,
    staleTime: 30000,
    refetchInterval: 60000, // refresh every minute
  });

  return { usage: query.data ?? null, isLoading: query.isLoading };
}