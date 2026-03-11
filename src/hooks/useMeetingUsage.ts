import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/hooks/useSubscription";

const PLAN_MEETING_LIMITS: Record<string, number> = {
  free: 5,
  starter: 50,
  growth: 300,
  scale: -1, // unlimited
};

export interface MeetingUsage {
  used: number;
  limit: number;
  isUnlimited: boolean;
  isAtLimit: boolean;
  isNearLimit: boolean;
  pct: number;
  planKey: string;
  planName: string;
  billingCycleStart: Date;
}

export function getMeetingLimit(planKey: string): number {
  return PLAN_MEETING_LIMITS[planKey] ?? 5;
}

export function useMeetingUsage(): { usage: MeetingUsage | null; isLoading: boolean } {
  const { user } = useAuth();
  const { currentPlanKey, subscription } = useSubscription();

  const query = useQuery({
    queryKey: ["meeting-usage", user?.id, currentPlanKey],
    queryFn: async (): Promise<MeetingUsage> => {
      // Determine billing cycle start
      let billingCycleStart = new Date();
      billingCycleStart.setDate(1);
      billingCycleStart.setHours(0, 0, 0, 0);

      if (subscription?.next_payment_date) {
        // Work back 1 month from next_payment_date
        const next = new Date(subscription.next_payment_date);
        billingCycleStart = new Date(next);
        billingCycleStart.setMonth(billingCycleStart.getMonth() - 1);
      } else if (subscription?.created_at) {
        // Use subscription creation date as anchor
        const created = new Date(subscription.created_at);
        const now = new Date();
        billingCycleStart = new Date(created);
        // Advance to current month's equivalent day
        billingCycleStart.setFullYear(now.getFullYear(), now.getMonth());
        if (billingCycleStart > now) {
          billingCycleStart.setMonth(billingCycleStart.getMonth() - 1);
        }
      }

      // Count calls (meetings) started in the current billing cycle
      const { count, error } = await supabase
        .from("calls")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user!.id)
        .neq("status", "live") // only completed calls count
        .gte("created_at", billingCycleStart.toISOString());

      if (error) throw error;

      const used = count ?? 0;
      const planKey = currentPlanKey || "free";
      const limit = getMeetingLimit(planKey);
      const isUnlimited = limit === -1;
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
        isUnlimited,
        isAtLimit: !isUnlimited && used >= limit,
        isNearLimit: !isUnlimited && pct >= 80 && used < limit,
        pct,
        planKey,
        planName: planNames[planKey] ?? "Free",
        billingCycleStart,
      };
    },
    enabled: !!user,
    staleTime: 30000,
  });

  return { usage: query.data ?? null, isLoading: query.isLoading };
}