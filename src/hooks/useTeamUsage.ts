import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEffectivePlan } from "@/hooks/useEffectivePlan";
import { getTeamMembersLimit } from "@/config/plans";

export interface TeamUsage {
  teamId:        string | null;
  teamName:      string | null;
  workspaceId:   string | null;
  membersUsed:   number;
  membersLimit:  number;
  isUnlimited:   boolean;
  membersPct:    number;
  adminPlanKey:  string;
  isAtLimit:     boolean;
  isNearLimit:   boolean;
}

/**
 * Returns team seat usage for the current user's workspace.
 *
 * Uses the effective plan (workspace-inherited or personal) so
 * limits are always correct without extra DB queries.
 */
export function useTeamUsage(): { teamUsage: TeamUsage | null; isLoading: boolean } {
  const { user } = useAuth();
  const { effectivePlan, isLoading: planLoading } = useEffectivePlan();

  const query = useQuery({
    queryKey: ["team-usage", user?.id, effectivePlan?.planKey],
    queryFn: async (): Promise<TeamUsage | null> => {
      if (!user) return null;

      // Find user's team
      const { data: membership } = await supabase
        .from("team_members")
        .select("team_id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();

      if (!membership) return null;

      // Team name + active member count in one shot
      const [teamRes, countRes] = await Promise.all([
        supabase.from("teams").select("name").eq("id", membership.team_id).single(),
        supabase
          .from("team_members")
          .select("*", { count: "exact", head: true })
          .eq("team_id", membership.team_id)
          .eq("status", "active"),
      ]);

      // Workspace id from the workspaces table
      const { data: wsRow } = await (supabase as any)
        .from("workspaces")
        .select("id")
        .eq("team_id", membership.team_id)
        .maybeSingle();

      // Use the already-resolved effective plan for limits
      const adminPlanKey   = effectivePlan?.planKey ?? "free";
      const membersUsed    = countRes.count ?? 1;
      const membersLimit   = getTeamMembersLimit(adminPlanKey);
      const isUnlimited    = membersLimit === -1;
      const membersPct     = isUnlimited ? 0 : Math.min((membersUsed / membersLimit) * 100, 100);

      return {
        teamId:       membership.team_id,
        teamName:     teamRes.data?.name || null,
        workspaceId:  wsRow?.id ?? null,
        membersUsed,
        membersLimit,
        isUnlimited,
        membersPct,
        adminPlanKey,
        isAtLimit:    !isUnlimited && membersUsed >= membersLimit,
        isNearLimit:  !isUnlimited && membersPct >= 80 && membersUsed < membersLimit,
      };
    },
    enabled:   !!user && !planLoading,
    staleTime: 30_000,
  });

  return { teamUsage: query.data ?? null, isLoading: query.isLoading || planLoading };
}
