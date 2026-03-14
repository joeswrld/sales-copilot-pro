import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Plan configuration — single source of truth.
 * Mirrors the SQL function get_user_active_plan_details.
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

export interface EffectivePlan {
  /** Resolved plan key — may come from the team admin's subscription */
  planKey: string;
  /** Human-readable plan name */
  planName: string;
  /** Meeting limit per month (-1 = unlimited) */
  callsLimit: number;
  /** Team member seat limit (-1 = unlimited) */
  teamMembersLimit: number;
  /** True when the plan is inherited from a workspace admin */
  isInherited: boolean;
  /** The workspace admin's user id when isInherited is true */
  adminUserId: string | null;
  /** The user's own plan key before inheritance */
  personalPlanKey: string;
  /** Workspace id the user belongs to (if any) */
  workspaceId: string | null;
}

/**
 * Convert a Paystack plan_name like "Fixsense Starter" to a plan key.
 */
function planNameToKey(planName: string | null | undefined): string | null {
  if (!planName) return null;
  const lower = planName.toLowerCase();
  if (lower.includes("scale")) return "scale";
  if (lower.includes("growth")) return "growth";
  if (lower.includes("starter")) return "starter";
  if (lower.includes("free")) return "free";
  return null;
}

/**
 * Resolves the effective plan for the authenticated user.
 *
 * Resolution order:
 *  1. Active subscription's plan_name (Paystack — most authoritative after payment)
 *  2. Postgres RPC `get_user_active_plan_details` (team-inherited or profile.plan_type)
 *  3. Direct profile.plan_type fallback
 *  4. "free" default
 */
export function useEffectivePlan(): { effectivePlan: EffectivePlan | null; isLoading: boolean } {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ["effective-plan", user?.id],
    queryFn: async (): Promise<EffectivePlan> => {
      if (!user) throw new Error("Not authenticated");

      // ── Step 1: Check active subscription first (most reliable) ──
      const { data: sub } = await supabase
        .from("subscriptions" as any)
        .select("status, plan_name, plan_price_usd")
        .eq("user_id", user.id)
        .maybeSingle();

      let subscriptionPlanKey: string | null = null;
      if ((sub as any)?.status === "active" && (sub as any)?.plan_name) {
        subscriptionPlanKey = planNameToKey((sub as any).plan_name);
      }

      // ── Step 2: RPC for workspace/team plan ──────────────────────
      const { data: rpcData, error: rpcError } = await supabase.rpc(
        "get_user_active_plan_details",
        { p_user_id: user.id }
      );

      // ── Step 3: Build the effective plan ────────────────────────
      if (rpcError) {
        console.error("get_user_active_plan_details error:", rpcError);

        // Fallback to profile + subscription
        const { data: profile } = await supabase
          .from("profiles")
          .select("plan_type")
          .eq("id", user.id)
          .single();

        // Use subscription plan if active and available
        const personalKey = subscriptionPlanKey ?? profile?.plan_type ?? "free";
        const config = PLAN_CONFIG[personalKey] ?? PLAN_CONFIG.free;

        return {
          planKey: personalKey,
          planName: config.name,
          callsLimit: config.calls_limit,
          teamMembersLimit: config.team_members_limit,
          isInherited: false,
          adminUserId: null,
          personalPlanKey: personalKey,
          workspaceId: null,
        };
      }

      const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;

      if (!row) {
        const personalKey = subscriptionPlanKey ?? "free";
        const config = PLAN_CONFIG[personalKey] ?? PLAN_CONFIG.free;
        return {
          planKey: personalKey,
          planName: config.name,
          callsLimit: config.calls_limit,
          teamMembersLimit: config.team_members_limit,
          isInherited: false,
          adminUserId: null,
          personalPlanKey: personalKey,
          workspaceId: null,
        };
      }

      // RPC-resolved plan key (from team admin or profile)
      const rpcPlanKey = row.plan_key ?? "free";

      // Determine final plan key:
      // - If the user has an active subscription AND they are NOT inheriting from a team,
      //   the subscription's plan_name is more authoritative than the profile.plan_type
      //   (profile may lag if the webhook hasn't updated it yet).
      // - If inheriting from a team admin, the admin's plan takes precedence.
      let finalPlanKey = rpcPlanKey;
      if (subscriptionPlanKey && !(row.is_inherited ?? false)) {
        // Use the subscription plan if it's a higher tier than what RPC returned
        const planOrder = ["free", "starter", "growth", "scale"];
        const subIdx = planOrder.indexOf(subscriptionPlanKey);
        const rpcIdx = planOrder.indexOf(rpcPlanKey);
        if (subIdx > rpcIdx) {
          finalPlanKey = subscriptionPlanKey;
        }
      }

      const config = PLAN_CONFIG[finalPlanKey] ?? PLAN_CONFIG.free;

      // Fetch personal plan if inherited
      let personalPlanKey = finalPlanKey;
      if (row.is_inherited) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("plan_type")
          .eq("id", user.id)
          .single();
        personalPlanKey = subscriptionPlanKey ?? profile?.plan_type ?? "free";
      }

      return {
        planKey: finalPlanKey,
        planName: config.name,
        callsLimit: row.calls_limit ?? config.calls_limit,
        teamMembersLimit: row.team_members_limit ?? config.team_members_limit,
        isInherited: row.is_inherited ?? false,
        adminUserId: row.owner_user_id ?? null,
        personalPlanKey,
        workspaceId: row.workspace_id ?? null,
      };
    },
    enabled: !!user,
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  return { effectivePlan: query.data ?? null, isLoading: query.isLoading };
}

/**
 * Small utility: check if a feature is available under the given plan.
 */
export function isPlanFeatureAvailable(
  planKey: string,
  feature: "ai_coach" | "team_analytics" | "live_calls" | "coaching"
): boolean {
  if (planKey === "free") return false;
  return true;
  }
