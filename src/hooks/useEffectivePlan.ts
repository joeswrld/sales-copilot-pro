/**
 * useEffectivePlan.ts — v4 (Team Plan Inheritance)
 *
 * Resolves the effective plan for the authenticated user.
 * Priority order for plan resolution:
 *   1. Active subscription row (Paystack source of truth)
 *   2. Workspace admin's active subscription (team plan inheritance)
 *   3. profiles.plan_type fallback
 *
 * Calls get_user_active_plan_details() RPC which is now subscription-aware.
 * Also calls get_team_plan_info() to get feature_flags directly from DB plans table.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PLAN_CONFIG, PLAN_ORDER, getMinuteQuota, normalizePlanKey } from "@/config/plans";

export { PLAN_CONFIG };

export interface EffectivePlan {
  planKey:          string;
  planName:         string;
  callsLimit:       number;   // -1 = unlimited
  minuteQuota:      number;   // -1 = unlimited
  teamMembersLimit: number;
  isInherited:      boolean;
  adminUserId:      string | null;
  personalPlanKey:  string;
  workspaceId:      string | null;
  /** Feature flags directly from plans table — most authoritative source */
  featureFlags:     Record<string, boolean>;
}

export function useEffectivePlan(): { effectivePlan: EffectivePlan | null; isLoading: boolean } {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ["effective-plan", user?.id],
    queryFn: async (): Promise<EffectivePlan> => {
      if (!user) throw new Error("Not authenticated");

      // ── 1. Get plan details via RPC (subscription-aware, team-inherited) ───────
      const { data: planDetails, error: planErr } = await (supabase as any).rpc(
        "get_user_active_plan_details",
        { p_user_id: user.id }
      );

      if (planErr) {
        console.error("get_user_active_plan_details error:", planErr);
      }

      // RPC returns array with one row
      const details = Array.isArray(planDetails) ? planDetails[0] : planDetails;
      const planKey = details?.plan_key ?? "free";
      const isInherited = details?.is_inherited ?? false;
      const adminUserId = details?.owner_user_id ?? null;
      const workspaceId = details?.workspace_id ?? null;

      // ── 2. Get feature flags from plans table via get_team_plan_info ─────────
      let featureFlags: Record<string, boolean> = {};
      try {
        const { data: teamInfo, error: infoErr } = await (supabase as any).rpc(
          "get_team_plan_info",
          { p_user_id: user.id }
        );
        if (!infoErr && teamInfo?.feature_flags) {
          featureFlags = teamInfo.feature_flags as Record<string, boolean>;
        }
      } catch (e) {
        console.warn("get_team_plan_info error (non-fatal):", e);
      }

      // ── 3. If no feature flags from DB, fall back to hardcoded config ────────
      if (Object.keys(featureFlags).length === 0) {
        const config = PLAN_CONFIG[planKey] ?? PLAN_CONFIG.free;
        featureFlags = config.feature_flags ?? {};
      }

      // ── 4. Get personal plan key for display purposes ────────────────────────
      let personalPlanKey = "free";
      try {
        const { data: ownSub } = await supabase
          .from("subscriptions" as any)
          .select("status, plan_name")
          .eq("user_id", user.id)
          .maybeSingle();

        if ((ownSub as any)?.status === "active") {
          personalPlanKey = normalizePlanKey((ownSub as any)?.plan_name);
        } else {
          const { data: ownProfile } = await supabase
            .from("profiles")
            .select("plan_type")
            .eq("id", user.id)
            .single();
          personalPlanKey = ownProfile?.plan_type ?? "free";
        }
      } catch (e) {
        console.warn("personalPlanKey fetch error (non-fatal):", e);
      }

      // ── 5. Get limits — prefer DB details, fall back to PLAN_CONFIG ──────────
      const config = PLAN_CONFIG[planKey] ?? PLAN_CONFIG.free;
      const callsLimit = details?.calls_limit ?? config.calls_limit;
      const teamMembersLimit = details?.team_members_limit ?? config.team_members_limit;
      const minuteQuota = getMinuteQuota(planKey);
      const planName = config.name ?? (planKey.charAt(0).toUpperCase() + planKey.slice(1));

      return {
        planKey,
        planName,
        callsLimit,
        minuteQuota,
        teamMembersLimit,
        isInherited,
        adminUserId,
        personalPlanKey,
        workspaceId,
        featureFlags,
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
    case "live_calls":           return idx >= 0;
    case "ai_coach":             return idx >= 1;
    case "coaching":             return idx >= 2;
    case "team_analytics":       return idx >= 2;
    case "deal_rooms":           return idx >= 2;
    case "objection_detection":  return idx >= 2;
    default:                     return false;
  }
}