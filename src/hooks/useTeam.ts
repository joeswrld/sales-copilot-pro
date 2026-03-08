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

  // Fetch pending invitations
  const invitationsQuery = useQuery({
    queryKey: ["team-invitations", teamQuery.data?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("team_invitations")
        .select("*")
        .eq("team_id", teamQuery.data!.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!teamQuery.data?.id,
  });

  // Invite member (supports pending invitations for non-existing users)
  const inviteMember = useMutation({
    mutationFn: async ({ email, role }: { email: string; role: string }) => {
      const teamId = teamQuery.data!.id;
      const normalizedEmail = email.trim().toLowerCase();

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id")
        .ilike("email", normalizedEmail)
        .maybeSingle();

      if (profileError) throw profileError;

      if (profile) {
        // User exists — check if already a member
        const { data: existingMember, error: existingMemberError } = await supabase
          .from("team_members")
          .select("id")
          .eq("team_id", teamId)
          .eq("user_id", profile.id)
          .maybeSingle();

        if (existingMemberError) throw existingMemberError;
        if (existingMember) throw new Error("This user is already a team member.");

        const { error: memberInsertError } = await supabase
          .from("team_members")
          .insert({
            team_id: teamId,
            user_id: profile.id,
            role,
            status: "active",
            invited_email: normalizedEmail,
          });

        if (memberInsertError) throw memberInsertError;

        // Clean up stale pending invites for this email if they exist
        await supabase
          .from("team_invitations")
          .delete()
          .eq("team_id", teamId)
          .eq("email", normalizedEmail)
          .eq("status", "pending");

        return { mode: "added" as const };
      }

      // User doesn't exist — create pending invitation
      const { data: existingInvite, error: existingInviteError } = await supabase
        .from("team_invitations")
        .select("id")
        .eq("team_id", teamId)
        .eq("email", normalizedEmail)
        .eq("status", "pending")
        .maybeSingle();

      if (existingInviteError) throw existingInviteError;
      if (existingInvite) throw new Error("A pending invitation already exists for this email.");

      const { error: invitationInsertError } = await supabase
        .from("team_invitations")
        .insert({ team_id: teamId, email: normalizedEmail, role, invited_by: user!.id });

      if (invitationInsertError) throw invitationInsertError;

      // Send invite email (fire-and-forget — don't block the invite on email delivery)
      const inviterName = user?.user_metadata?.full_name || user?.email || "A team admin";
      supabase.functions.invoke("send-invite-email", {
        body: {
          email: normalizedEmail,
          teamName: teamQuery.data!.name,
          inviterName,
          role,
          signupUrl: `${window.location.origin}/login`,
        },
      }).catch((err) => console.warn("Invite email failed:", err));

      return { mode: "pending" as const };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["team-members"] });
      queryClient.invalidateQueries({ queryKey: ["team-invitations"] });
      toast({
        title: result.mode === "added" ? "Member added" : "Invitation sent",
        description:
          result.mode === "pending"
            ? "They’ll be added automatically after they sign up with this email."
            : undefined,
      });
    },
    onError: (err: any) => {
      toast({ title: "Failed to invite member", description: err.message, variant: "destructive" });
    },
  });

  // Cancel pending invitation
  const cancelInvitation = useMutation({
    mutationFn: async (invitationId: string) => {
      const { error } = await supabase
        .from("team_invitations")
        .delete()
        .eq("id", invitationId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-invitations"] });
      toast({ title: "Invitation cancelled" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to cancel invitation", description: err.message, variant: "destructive" });
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
    pendingInvitations: invitationsQuery.data ?? [],
    createTeam,
    inviteMember,
    cancelInvitation,
    updateRole,
    removeMember,
  };
}
