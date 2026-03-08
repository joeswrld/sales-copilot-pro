import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

export interface TeamMember {
  id: string;
  team_id: string;
  user_id: string;
  role: "admin" | "manager" | "member";
  status: "active" | "invited";
  invited_email: string | null;
  created_at: string;
  profile?: {
    full_name: string | null;
    email: string | null;
    avatar_url: string | null;
  };
}

export interface Team {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
}

export function useTeam() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Get user's team
  const teamQuery = useQuery({
    queryKey: ["team", user?.id],
    queryFn: async () => {
      const { data: membership } = await supabase
        .from("team_members")
        .select("team_id")
        .eq("user_id", user!.id)
        .eq("status", "active")
        .limit(1)
        .single();

      if (!membership) return null;

      const { data: team } = await supabase
        .from("teams")
        .select("*")
        .eq("id", membership.team_id)
        .single();

      return team as Team | null;
    },
    enabled: !!user,
  });

  // Get current user's role
  const roleQuery = useQuery({
    queryKey: ["team-role", user?.id, teamQuery.data?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("team_members")
        .select("role")
        .eq("user_id", user!.id)
        .eq("team_id", teamQuery.data!.id)
        .eq("status", "active")
        .single();
      return (data?.role as "admin" | "manager" | "member") ?? "member";
    },
    enabled: !!user && !!teamQuery.data?.id,
  });

  // Get team members with profiles
  const membersQuery = useQuery({
    queryKey: ["team-members", teamQuery.data?.id],
    queryFn: async () => {
      const { data: members } = await supabase
        .from("team_members")
        .select("*")
        .eq("team_id", teamQuery.data!.id)
        .order("created_at", { ascending: true });

      if (!members) return [];

      // Fetch profiles for active members
      const activeUserIds = members.filter(m => m.user_id).map(m => m.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email, avatar_url")
        .in("id", activeUserIds);

      const profileMap = new Map(profiles?.map(p => [p.id, p]) ?? []);

      return members.map(m => ({
        ...m,
        role: m.role as "admin" | "manager" | "member",
        status: m.status as "active" | "invited",
        profile: profileMap.get(m.user_id) ?? null,
      })) as TeamMember[];
    },
    enabled: !!teamQuery.data?.id,
  });

  // Create team
  const createTeam = useMutation({
    mutationFn: async (name: string) => {
      const { data: team, error } = await (supabase as any).rpc("create_team_with_owner", {
        team_name: name,
      });

      if (error) throw error;
      return team as Team;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team"] });
      queryClient.invalidateQueries({ queryKey: ["team-role"] });
      queryClient.invalidateQueries({ queryKey: ["team-members"] });
      toast({ title: "Team created successfully" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to create team", description: err.message, variant: "destructive" });
    },
  });

  // Invite member
  const inviteMember = useMutation({
    mutationFn: async ({ email, role }: { email: string; role: string }) => {
      // Check if user exists
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", email)
        .single();

      if (!profile) {
        throw new Error("No user found with that email. They must sign up first.");
      }

      // Check if already a member
      const { data: existing } = await supabase
        .from("team_members")
        .select("id, status")
        .eq("team_id", teamQuery.data!.id)
        .eq("user_id", profile.id)
        .maybeSingle();

      if (existing) {
        throw new Error("This user is already a member of the team.");
      }

      const { error } = await supabase
        .from("team_members")
        .insert({
          team_id: teamQuery.data!.id,
          user_id: profile.id,
          role,
          status: "active",
          invited_email: email,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-members"] });
      toast({ title: "Member invited successfully" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to invite member", description: err.message, variant: "destructive" });
    },
  });

  // Update member role
  const updateRole = useMutation({
    mutationFn: async ({ memberId, role }: { memberId: string; role: string }) => {
      const { error } = await supabase
        .from("team_members")
        .update({ role })
        .eq("id", memberId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-members"] });
      toast({ title: "Role updated" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to update role", description: err.message, variant: "destructive" });
    },
  });

  // Remove member
  const removeMember = useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await supabase
        .from("team_members")
        .delete()
        .eq("id", memberId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-members"] });
      toast({ title: "Member removed" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to remove member", description: err.message, variant: "destructive" });
    },
  });

  return {
    team: teamQuery.data,
    teamLoading: teamQuery.isLoading,
    role: roleQuery.data ?? "member",
    members: membersQuery.data ?? [],
    membersLoading: membersQuery.isLoading,
    createTeam,
    inviteMember,
    updateRole,
    removeMember,
  };
}
