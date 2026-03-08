import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { getTeamMembersLimit } from "@/config/plans";

export interface TeamUsage {
  teamId: string | null;
  teamName: string | null;
  membersUsed: number;
  membersLimit: number;
  isUnlimited: boolean;
  membersPct: number;
  adminPlanKey: string;
  isAtLimit: boolean;
  isNearLimit: boolean;
}

export function useTeamUsage(): { teamUsage: TeamUsage | null; isLoading: boolean } {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ["team-usage", user?.id],
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

      // Get team name, member count, and admin's plan in parallel
      const [teamRes, countRes, adminRes] = await Promise.all([
        supabase.from("teams").select("name").eq("id", membership.team_id).single(),
        supabase.from("team_members").select("*", { count: "exact", head: true }).eq("team_id", membership.team_id).eq("status", "active"),
        supabase.from("team_members").select("user_id").eq("team_id", membership.team_id).eq("role", "admin").eq("status", "active").limit(1).single(),
      ]);

      let adminPlanKey = "free";
      if (adminRes.data) {
        const { data: adminProfile } = await supabase
          .from("profiles")
          .select("plan_type")
          .eq("id", adminRes.data.user_id)
          .single();
        adminPlanKey = adminProfile?.plan_type || "free";
      }

      const membersUsed = countRes.count ?? 1;
      const membersLimit = getTeamMembersLimit(adminPlanKey);
      const isUnlimited = membersLimit === -1;
      const membersPct = isUnlimited ? 0 : Math.min((membersUsed / membersLimit) * 100, 100);

      return {
        teamId: membership.team_id,
        teamName: teamRes.data?.name || null,
        membersUsed,
        membersLimit,
        isUnlimited,
        membersPct,
        adminPlanKey,
        isAtLimit: !isUnlimited && membersUsed >= membersLimit,
        isNearLimit: !isUnlimited && membersPct >= 80 && membersUsed < membersLimit,
      };
    },
    enabled: !!user,
    staleTime: 30000,
  });

  return { teamUsage: query.data ?? null, isLoading: query.isLoading };
}
