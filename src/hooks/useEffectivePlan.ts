import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Plan configuration — single source of truth.
 */
export const PLAN_CONFIG: Record<
  string,
  { name: string; calls_limit: number; team_members_limit: number; price_usd: number }
> = {
  free:    { name: "Free",    calls_limit: 5,   team_members_limit: 1,  price_usd: 0  },
  starter: { name: "Starter", calls_limit: 50,  team_members_limit: 3,  price_usd: 19 },
  growth:  { name: "Growth",  calls_limit: 300, team_members_limit: 10, price_usd: 49 },
  scale:   { name: "Scale",   calls_limit: -1,  team_members_limit: -1, price_usd: 99 },
};

const PLAN_ORDER = ["free", "starter", "growth", "scale"];

export interface EffectivePlan {
  planKey: string;
  planName: string;
  callsLimit: number;
  teamMembersLimit: number;
  isInherited: boolean;
  adminUserId: string | null;
  personalPlanKey: string;
  workspaceId: string | null;
}

/** Normalise Paystack plan_name like "Fixsense Starter" → "starter" */
function planNameToKey(planName: string | null | undefined): string | null {
  if (!planName) return null;
  const lower = planName.toLowerCase();
  if (lower.includes("scale"))   return "scale";
  if (lower.includes("growth"))  return "growth";
  if (lower.includes("starter")) return "starter";
  if (lower.includes("free"))    return "free";
  return null;
}

/**
 * Resolves the effective plan for the authenticated user.
 *
 * Resolution order:
 *  1. Team admin's active subscription plan_name  ← most authoritative for team members
 *  2. Team admin's profile.plan_type              ← fallback when webhook hasn't fired yet
 *  3. User's own active subscription plan_name
 *  4. User's own profile.plan_type
 *  5. "free" default
 *
 * The admin plan is used when it is HIGHER than the user's own plan.
 * Usage is counted at workspace level so all members share the same pool.
 */
export function useEffectivePlan(): { effectivePlan: EffectivePlan | null; isLoading: boolean } {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ["effective-plan", user?.id],
    queryFn: async (): Promise<EffectivePlan> => {
      if (!user) throw new Error("Not authenticated");

      // ── 1. User's own subscription ────────────────────────────────
      const { data: ownSub } = await supabase
        .from("subscriptions" as any)
        .select("status, plan_name")
        .eq("user_id", user.id)
        .maybeSingle();

      const ownSubPlanKey =
        (ownSub as any)?.status === "active"
          ? (planNameToKey((ownSub as any)?.plan_name) ?? null)
          : null;

      // ── 2. User's own profile plan ────────────────────────────────
      const { data: ownProfile } = await supabase
        .from("profiles")
        .select("plan_type")
        .eq("id", user.id)
        .single();

      const ownProfilePlan = ownProfile?.plan_type ?? "free";
      const personalPlanKey = ownSubPlanKey ?? ownProfilePlan;

      // ── 3. Team membership check ──────────────────────────────────
      const { data: membership } = await supabase
        .from("team_members")
        .select("team_id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();

      const teamId = membership?.team_id ?? null;

      if (!teamId) {
        // No team — use personal plan
        const config = PLAN_CONFIG[personalPlanKey] ?? PLAN_CONFIG.free;
        return {
          planKey:          personalPlanKey,
          planName:         config.name,
          callsLimit:       config.calls_limit,
          teamMembersLimit: config.team_members_limit,
          isInherited:      false,
          adminUserId:      null,
          personalPlanKey,
          workspaceId:      null,
        };
      }

      // ── 4. Resolve workspace + admin plan ─────────────────────────
      // Get workspace (created by trigger when team is created)
      const { data: ws } = await supabase
        .from("workspaces" as any)
        .select("id, owner_id")
        .eq("team_id", teamId)
        .maybeSingle();

      const workspaceId = (ws as any)?.id ?? null;
      const adminUserId = (ws as any)?.owner_id ?? null;

      let adminPlanKey = "free";

      if (adminUserId) {
        // Admin's active subscription (most reliable post-payment)
        const { data: adminSub } = await supabase
          .from("subscriptions" as any)
          .select("status, plan_name")
          .eq("user_id", adminUserId)
          .maybeSingle();

        const adminSubPlanKey =
          (adminSub as any)?.status === "active"
            ? (planNameToKey((adminSub as any)?.plan_name) ?? null)
            : null;

        // Admin's profile plan_type as fallback
        const { data: adminProfile } = await supabase
          .from("profiles")
          .select("plan_type")
          .eq("id", adminUserId)
          .single();

        adminPlanKey =
          adminSubPlanKey ??
          adminProfile?.plan_type ??
          "free";
      }

      // ── 5. Pick higher of admin plan vs personal plan ─────────────
      const adminIdx    = PLAN_ORDER.indexOf(adminPlanKey);
      const personalIdx = PLAN_ORDER.indexOf(personalPlanKey);

      const finalPlanKey = adminIdx > personalIdx ? adminPlanKey : personalPlanKey;
      const isInherited  = adminIdx > personalIdx;

      const config = PLAN_CONFIG[finalPlanKey] ?? PLAN_CONFIG.free;

      return {
        planKey:          finalPlanKey,
        planName:         config.name,
        callsLimit:       config.calls_limit,
        teamMembersLimit: config.team_members_limit,
        isInherited,
        adminUserId,
        personalPlanKey,
        workspaceId,
      };
    },
    enabled:   !!user,
    staleTime: 2 * 60 * 1000,
    gcTime:    5 * 60 * 1000,
  });

  return { effectivePlan: query.data ?? null, isLoading: query.isLoading };
}

export function isPlanFeatureAvailable(
  planKey: string,
  feature: "ai_coach" | "team_analytics" | "live_calls" | "coaching"
): boolean {
  if (planKey === "free") return false;
  return true;
}
