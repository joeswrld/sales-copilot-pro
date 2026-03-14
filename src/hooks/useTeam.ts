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

  // ── Helper: bust all plan-related caches instantly ─────────────────────────
  const invalidatePlanCaches = () => {
    queryClient.invalidateQueries({ queryKey: ["effective-plan"] });
    queryClient.invalidateQueries({ queryKey: ["meeting-usage"] });
    queryClient.invalidateQueries({ queryKey: ["team-usage"] });
  };

  // ── Team membership query ───────────────────────────────────────────────────
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

  // ── Role query ──────────────────────────────────────────────────────────────
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

  // ── Members with profiles ───────────────────────────────────────────────────
  const membersQuery = useQuery({
    queryKey: ["team-members", teamQuery.data?.id],
    queryFn: async () => {
      const { data: members } = await supabase
        .from("team_members")
        .select("*")
        .eq("team_id", teamQuery.data!.id)
        .order("created_at", { ascending: true });

      if (!members) return [];

      const activeUserIds = members.filter(m => m.user_id).map(m => m.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email, avatar_url")
        .in("id", activeUserIds);

      const profileMap = new Map(profiles?.map(p => [p.id, p]) ?? []);

      return members.map(m => ({
        ...m,
        role:   m.role   as "admin" | "manager" | "member",
        status: m.status as "active" | "invited",
        profile: profileMap.get(m.user_id) ?? null,
      })) as TeamMember[];
    },
    enabled: !!teamQuery.data?.id,
  });

  // ── Create team ─────────────────────────────────────────────────────────────
  const createTeam = useMutation({
    mutationFn: async (name: string) => {
      const { data: team, error } = await (supabase as any).rpc(
        "create_team_with_owner",
        { team_name: name }
      );
      if (error) throw error;
      return team as Team;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team"] });
      queryClient.invalidateQueries({ queryKey: ["team-role"] });
      queryClient.invalidateQueries({ queryKey: ["team-members"] });
      // Workspace is auto-created by DB trigger — bust plan caches now
      invalidatePlanCaches();
      toast({ title: "Team created successfully" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to create team", description: err.message, variant: "destructive" });
    },
  });

  // ── Pending invitations ─────────────────────────────────────────────────────
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

  // ── Invite member ───────────────────────────────────────────────────────────
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
        const { data: existingMember } = await supabase
          .from("team_members")
          .select("id")
          .eq("team_id", teamId)
          .eq("user_id", profile.id)
          .maybeSingle();

        if (existingMember) throw new Error("This user is already a team member.");

        const { error: memberInsertError } = await supabase
          .from("team_members")
          .insert({
            team_id:       teamId,
            user_id:       profile.id,
            role,
            status:        "active",
            invited_email: normalizedEmail,
          });

        if (memberInsertError) throw memberInsertError;

        await supabase
          .from("team_invitations")
          .delete()
          .eq("team_id", teamId)
          .eq("email", normalizedEmail)
          .eq("status", "pending");

        return { mode: "added" as const };
      }

      // User doesn't exist yet — create pending invitation
      const { data: existingInvite } = await supabase
        .from("team_invitations")
        .select("id")
        .eq("team_id", teamId)
        .eq("email", normalizedEmail)
        .eq("status", "pending")
        .maybeSingle();

      if (existingInvite) throw new Error("A pending invitation already exists for this email.");

      const { error: inviteError } = await supabase
        .from("team_invitations")
        .insert({ team_id: teamId, email: normalizedEmail, role, invited_by: user!.id });

      if (inviteError) throw inviteError;

      const inviterName = user?.user_metadata?.full_name || user?.email || "A team admin";
      supabase.functions.invoke("send-invite-email", {
        body: {
          email:       normalizedEmail,
          teamName:    teamQuery.data!.name,
          inviterName,
          role,
          signupUrl:   `${window.location.origin}/login`,
        },
      }).catch(err => console.warn("Invite email failed:", err));

      return { mode: "pending" as const };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["team-members"] });
      queryClient.invalidateQueries({ queryKey: ["team-invitations"] });
      // New member inherits admin plan — bust plan caches so they see it instantly
      invalidatePlanCaches();
      toast({
        title: result.mode === "added" ? "Member added" : "Invitation sent",
        description:
          result.mode === "pending"
            ? "They'll be added automatically after they sign up with this email."
            : undefined,
      });
    },
    onError: (err: any) => {
      toast({ title: "Failed to invite member", description: err.message, variant: "destructive" });
    },
  });

  // ── Cancel invitation ───────────────────────────────────────────────────────
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

  // ── Update role ─────────────────────────────────────────────────────────────
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
      // Role change may change who is the workspace owner
      invalidatePlanCaches();
      toast({ title: "Role updated" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to update role", description: err.message, variant: "destructive" });
    },
  });

  // ── Remove member ───────────────────────────────────────────────────────────
  // When a user is removed they immediately revert to their personal plan
  // because the next call to get_user_active_plan_details will find no
  // workspace membership and return their own profile.plan_type.
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
      // Removed member reverts to personal plan — bust caches for everyone
      invalidatePlanCaches();
      toast({ title: "Member removed" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to remove member", description: err.message, variant: "destructive" });
    },
  });

  // ── Admin plan key (for UI components that need it) ─────────────────────────
  const adminPlanQuery = useQuery({
    queryKey: ["team-admin-plan", teamQuery.data?.id],
    queryFn: async () => {
      const teamId = teamQuery.data!.id;
      const { data: adminMember } = await supabase
        .from("team_members")
        .select("user_id")
        .eq("team_id", teamId)
        .eq("role", "admin")
        .eq("status", "active")
        .limit(1)
        .single();

      if (!adminMember) return "free";

      const { data: profile } = await supabase
        .from("profiles")
        .select("plan_type")
        .eq("id", adminMember.user_id)
        .single();

      return profile?.plan_type || "free";
    },
    enabled: !!teamQuery.data?.id,
    // Stale quickly — needs to reflect subscription changes
    staleTime: 30_000,
  });

  return {
    team:               teamQuery.data,
    teamLoading:        teamQuery.isLoading,
    role:               roleQuery.data ?? "member",
    members:            membersQuery.data ?? [],
    membersLoading:     membersQuery.isLoading,
    pendingInvitations: invitationsQuery.data ?? [],
    adminPlanKey:       adminPlanQuery.data ?? "free",
    createTeam,
    inviteMember,
    cancelInvitation,
    updateRole,
    removeMember,
  };
}
