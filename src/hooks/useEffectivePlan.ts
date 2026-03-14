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
 * Resolves the effective plan for the authenticated user.
 *
 * Strategy:
 *  1. Call the Postgres RPC `get_user_active_plan_details(user_id)` which:
 *       - checks if the user is an active workspace member
 *       - if yes → returns the workspace owner's plan_type
 *       - if no  → returns the user's own profile.plan_type
 *  2. No writes happen — plan is derived dynamically every time.
 *  3. Instant update: when a user joins/leaves a team, the next
 *     query automatically returns the correct plan.
 *
 * This replaces the old multi-step client-side approach that
 * required separate fetches for team members and admin profiles.
 */
export function useEffectivePlan(): { effectivePlan: EffectivePlan | null; isLoading: boolean } {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ["effective-plan", user?.id],
    queryFn: async (): Promise<EffectivePlan> => {
      if (!user) throw new Error("Not authenticated");

      // Single RPC call — the DB function resolves workspace vs personal plan
      const { data, error } = await supabase.rpc(
        "get_user_active_plan_details",
        { p_user_id: user.id }
      );

      if (error) {
        console.error("get_user_active_plan_details error:", error);
        // Graceful fallback — fetch personal plan directly
        const { data: profile } = await supabase
          .from("profiles")
          .select("plan_type")
          .eq("id", user.id)
          .single();

        const personalKey = profile?.plan_type ?? "free";
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

      // The RPC returns a single row (LIMIT 1 in the SQL)
      const row = Array.isArray(data) ? data[0] : data;

      if (!row) {
        // No profile at all — shouldn't happen but guard anyway
        return {
          planKey: "free",
          planName: "Free",
          callsLimit: 5,
          teamMembersLimit: 1,
          isInherited: false,
          adminUserId: null,
          personalPlanKey: "free",
          workspaceId: null,
        };
      }

      const planKey   = row.plan_key ?? "free";
      const config    = PLAN_CONFIG[planKey] ?? PLAN_CONFIG.free;

      // Fetch personal plan if inherited (needed for display comparisons)
      let personalPlanKey = planKey;
      if (row.is_inherited) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("plan_type")
          .eq("id", user.id)
          .single();
        personalPlanKey = profile?.plan_type ?? "free";
      }

      return {
        planKey,
        planName: config.name,
        // Use DB-computed limits (handles edge cases like -1 for unlimited)
        callsLimit: row.calls_limit ?? config.calls_limit,
        teamMembersLimit: row.team_members_limit ?? config.team_members_limit,
        isInherited: row.is_inherited ?? false,
        adminUserId: row.owner_user_id ?? null,
        personalPlanKey,
        workspaceId: row.workspace_id ?? null,
      };
    },
    enabled: !!user,
    // Plan rarely changes — 2 minute stale time is safe.
    // When a user joins/leaves a team, invalidate this query explicitly.
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
