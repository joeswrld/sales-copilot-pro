/**
 * useEffectivePlan.ts — v3
 * Resolves the effective plan for the authenticated user.
 * Now uses new minute quotas: Free 30 | Starter 300 | Growth 1500 | Scale 5000
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PLAN_CONFIG, PLAN_ORDER, getMinuteQuota, normalizePlanKey } from "@/config/plans";

export { PLAN_CONFIG };

export interface EffectivePlan {
  planKey:          string;
  planName:         string;
  callsLimit:       number;   // legacy compat — -1 = unlimited
  minuteQuota:      number;   // -1 = unlimited
  teamMembersLimit: number;
  isInherited:      boolean;
  adminUserId:      string | null;
  personalPlanKey:  string;
  workspaceId:      string | null;
}

export function useEffectivePlan(): { effectivePlan: EffectivePlan | null; isLoading: boolean } {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ["effective-plan", user?.id],
    queryFn: async (): Promise<EffectivePlan> => {
      if (!user) throw new Error("Not authenticated");

      // ── 1. Own subscription ───────────────────────────────────────────
      const { data: ownSub } = await supabase
        .from("subscriptions" as any)
        .select("status, plan_name")
        .eq("user_id", user.id)
        .maybeSingle();

      const ownSubPlanKey =
        (ownSub as any)?.status === "active"
          ? normalizePlanKey((ownSub as any)?.plan_name)
          : null;

      // ── 2. Own profile plan ───────────────────────────────────────────
      const { data: ownProfile } = await supabase
        .from("profiles")
        .select("plan_type")
        .eq("id", user.id)
        .single();

      const ownProfilePlan  = ownProfile?.plan_type ?? "free";
      const personalPlanKey = ownSubPlanKey ?? ownProfilePlan;

      // ── 3. Team membership ────────────────────────────────────────────
      const { data: membership } = await supabase
        .from("team_members")
        .select("team_id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();

      const teamId = membership?.team_id ?? null;

      if (!teamId) {
        const config = PLAN_CONFIG[personalPlanKey] ?? PLAN_CONFIG.free;
        return {
          planKey:          personalPlanKey,
          planName:         config.name,
          callsLimit:       config.calls_limit,
          minuteQuota:      getMinuteQuota(personalPlanKey),
          teamMembersLimit: config.team_members_limit,
          isInherited:      false,
          adminUserId:      null,
          personalPlanKey,
          workspaceId:      null,
        };
      }

      // ── 4. Workspace admin plan ───────────────────────────────────────
      const { data: ws } = await supabase
        .from("workspaces" as any)
        .select("id, owner_id")
        .eq("team_id", teamId)
        .maybeSingle();

      const workspaceId = (ws as any)?.id ?? null;
      const adminUserId = (ws as any)?.owner_id ?? null;
      let adminPlanKey  = "free";

      if (adminUserId) {
        const { data: adminSub } = await supabase
          .from("subscriptions" as any)
          .select("status, plan_name")
          .eq("user_id", adminUserId)
          .maybeSingle();

        const adminSubKey =
          (adminSub as any)?.status === "active"
            ? normalizePlanKey((adminSub as any)?.plan_name)
            : null;

        const { data: adminProfile } = await supabase
          .from("profiles")
          .select("plan_type")
          .eq("id", adminUserId)
          .single();

        adminPlanKey = adminSubKey ?? adminProfile?.plan_type ?? "free";
      }

      // ── 5. Pick higher plan ───────────────────────────────────────────
      const adminIdx    = PLAN_ORDER.indexOf(adminPlanKey);
      const personalIdx = PLAN_ORDER.indexOf(personalPlanKey);
      const finalPlanKey = adminIdx > personalIdx ? adminPlanKey : personalPlanKey;
      const isInherited  = adminIdx > personalIdx;

      const config = PLAN_CONFIG[finalPlanKey] ?? PLAN_CONFIG.free;

      return {
        planKey:          finalPlanKey,
        planName:         config.name,
        callsLimit:       config.calls_limit,
        minuteQuota:      getMinuteQuota(finalPlanKey),
        teamMembersLimit: config.team_members_limit,
        isInherited,
        adminUserId,
        personalPlanKey,
        workspaceId,
      };
    },
    enabled:   !!user,
    staleTime: 2 * 60_000,
    gcTime:    5 * 60_000,
  });

  return { effectivePlan: query.data ?? null, isLoading: query.isLoading };
}

export function isPlanFeatureAvailable(
  planKey: string,
  feature: "ai_coach" | "team_analytics" | "live_calls" | "coaching" | "deal_rooms" | "objection_detection"
): boolean {
  const ORDER = ["free", "starter", "growth", "scale"];
  const idx   = ORDER.indexOf(planKey);

  switch (feature) {
    case "live_calls":           return idx >= 0; // all plans
    case "ai_coach":             return idx >= 1; // starter+
    case "coaching":             return idx >= 2; // growth+
    case "team_analytics":       return idx >= 2; // growth+
    case "deal_rooms":           return idx >= 2; // growth+
    case "objection_detection":  return idx >= 2; // growth+
    default:                     return false;
  }
}