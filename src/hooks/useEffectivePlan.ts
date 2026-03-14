import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTeam } from "@/hooks/useTeam";

/**
 * Plan configuration used across the platform.
 * Mirrors the server-side PLANS record in Supabase functions.
 */
export const PLAN_CONFIG: Record<
  string,
  { name: string; calls_limit: number; team_members_limit: number; price_usd: number }
> = {
  free:    { name: "Free",    calls_limit: 5,      team_members_limit: 1,  price_usd: 0  },
  starter: { name: "Starter", calls_limit: 50,     team_members_limit: 3,  price_usd: 19 },
  growth:  { name: "Growth",  calls_limit: 300,    team_members_limit: 10, price_usd: 49 },
  scale:   { name: "Scale",   calls_limit: -1,     team_members_limit: -1, price_usd: 99 },
};

export interface EffectivePlan {
  /** The resolved plan key (may come from the team admin's plan) */
  planKey: string;
  /** Human-readable plan name */
  planName: string;
  /** Meeting limit (-1 = unlimited) */
  callsLimit: number;
  /** Team members limit (-1 = unlimited) */
  teamMembersLimit: number;
  /** True when plan is inherited from a team admin rather than the user's own subscription */
  isInherited: boolean;
  /** The team admin's profile id when isInherited is true */
  adminUserId: string | null;
  /** The user's own plan key (before inheritance) */
  personalPlanKey: string;
}

/**
 * Resolves the *effective* plan for the authenticated user.
 *
 * Priority:
 *  1. If the user belongs to an active team → use the team admin's plan_type.
 *  2. Otherwise → use the user's own profile.plan_type.
 *
 * This is the single source of truth for feature gating across the app.
 */
export function useEffectivePlan(): { effectivePlan: EffectivePlan | null; isLoading: boolean } {
  const { user } = useAuth();
  const { team, members } = useTeam();

  const query = useQuery({
    queryKey: ["effective-plan", user?.id, team?.id],
    queryFn: async (): Promise<EffectivePlan> => {
      if (!user) throw new Error("Not authenticated");

      // 1. Fetch the user's own profile plan
      const { data: profile, error: profileErr } = await supabase
        .from("profiles")
        .select("plan_type, calls_limit")
        .eq("id", user.id)
        .single();

      if (profileErr) throw profileErr;

      const personalPlanKey = profile?.plan_type ?? "free";

      // 2. If user is in a team, find the admin and get their plan
      if (team?.id && members.length > 0) {
        const adminMember = members.find(
          (m) => m.role === "admin" && m.status === "active"
        );

        if (adminMember && adminMember.user_id !== user.id) {
          // Fetch the admin's profile plan
          const { data: adminProfile } = await supabase
            .from("profiles")
            .select("id, plan_type, calls_limit")
            .eq("id", adminMember.user_id)
            .single();

          if (adminProfile) {
            const inheritedPlanKey = adminProfile.plan_type ?? "free";
            const config = PLAN_CONFIG[inheritedPlanKey] ?? PLAN_CONFIG.free;

            return {
              planKey: inheritedPlanKey,
              planName: config.name,
              callsLimit: config.calls_limit,
              teamMembersLimit: config.team_members_limit,
              isInherited: true,
              adminUserId: adminProfile.id,
              personalPlanKey,
            };
          }
        }
      }

      // 3. Fallback: user's own plan
      const config = PLAN_CONFIG[personalPlanKey] ?? PLAN_CONFIG.free;

      return {
        planKey: personalPlanKey,
        planName: config.name,
        callsLimit: config.calls_limit,
        teamMembersLimit: config.team_members_limit,
        isInherited: false,
        adminUserId: null,
        personalPlanKey,
      };
    },
    enabled: !!user,
    staleTime: 60_000,
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
  // Free plan has no advanced features
  if (planKey === "free") return false;
  // All paid plans unlock every feature
  return true;
}