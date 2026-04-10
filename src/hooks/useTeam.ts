import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/components/ui/use-toast";

export interface TeamMember {
  id: string;
  team_id: string;
  user_id: string;
  role: string;
  status: string;
  invited_email: string | null;
  created_at: string;
  profile?: {
    full_name: string | null;
    email: string | null;
    avatar_url: string | null;
  } | null;
}

export interface Team {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
}

export interface PendingInvitation {
  id: string;
  team_id: string;
  email: string;
  role: string;
  invited_by: string;
  status: string;
  created_at: string;
  isExistingUser?: boolean;
  teams?: { name: string } | null;
}

// ─── Helper: fetch the team_id for the current user ─────────────────────────
// Uses .maybeSingle() so it returns null instead of throwing 406 when no row
async function fetchMyTeamId(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("team_members")
    .select("team_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle(); // ← was .single() — that caused PGRST116 406 when user has no team

  if (error) throw error;
  return data?.team_id ?? null;
}

export function useTeam() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id;

  // ── Fetch current user's team_id ──────────────────────────────────────
  const teamIdQuery = useQuery({
    queryKey: ["my-team-id", userId],
    queryFn: () => (userId ? fetchMyTeamId(userId) : null),
    enabled: !!userId,
    staleTime: 30_000,
  });

  const teamId = teamIdQuery.data ?? null;

  // ── Fetch team details ────────────────────────────────────────────────
  const teamQuery = useQuery({
    queryKey: ["team", teamId],
    queryFn: async () => {
      if (!teamId) return null;
      const { data, error } = await supabase
        .from("teams")
        .select("*")
        .eq("id", teamId)
        .maybeSingle();
      if (error) throw error;
      return data as Team | null;
    },
    enabled: !!teamId,
    staleTime: 30_000,
  });

  // ── Fetch current user's role ─────────────────────────────────────────
  const roleQuery = useQuery({
    queryKey: ["my-team-role", teamId, userId],
    queryFn: async () => {
      if (!teamId || !userId) return "member";
      const { data, error } = await supabase
        .from("team_members")
        .select("role")
        .eq("team_id", teamId)
        .eq("user_id", userId)
        .eq("status", "active")
        .maybeSingle();
      if (error) throw error;
      return data?.role ?? "member";
    },
    enabled: !!teamId && !!userId,
    staleTime: 30_000,
  });

  // ── Fetch team members ────────────────────────────────────────────────
  const membersQuery = useQuery({
    queryKey: ["team-members", teamId],
    queryFn: async () => {
      if (!teamId) return [];
      const { data, error } = await supabase
        .from("team_members")
        .select(`
          id, team_id, user_id, role, status, invited_email, created_at,
          profile:profiles(full_name, email, avatar_url)
        `)
        .eq("team_id", teamId)
        .eq("status", "active")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as TeamMember[];
    },
    enabled: !!teamId,
    staleTime: 30_000,
  });

  // ── Fetch pending invitations (admin only) ────────────────────────────
  const invitationsQuery = useQuery({
    queryKey: ["team-invitations", teamId],
    queryFn: async () => {
      if (!teamId) return [];
      const { data, error } = await supabase
        .from("team_invitations")
        .select("*")
        .eq("team_id", teamId)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) {
        // Non-admins will get RLS-blocked — treat as empty
        console.warn("team invitations fetch:", error.message);
        return [];
      }
      return (data ?? []) as PendingInvitation[];
    },
    enabled: !!teamId,
    staleTime: 15_000,
  });

  // ── Fetch MY pending invitations (invitations sent to my email) ───────
  const myInvitationsQuery = useQuery({
    queryKey: ["my-pending-invitations", userId],
    queryFn: async () => {
      if (!userId) return [];
      // Get the current user's email from profiles
      const { data: profile } = await supabase
        .from("profiles")
        .select("email")
        .eq("id", userId)
        .maybeSingle();

      if (!profile?.email) return [];

      const { data, error } = await supabase
        .from("team_invitations")
        .select("*, teams(name)")
        .eq("status", "pending")
        .ilike("email", profile.email);

      if (error) {
        console.warn("my invitations fetch:", error.message);
        return [];
      }
      return (data ?? []) as PendingInvitation[];
    },
    enabled: !!userId,
    staleTime: 15_000,
  });

  // ── Admin plan key (for limits) ───────────────────────────────────────
  const adminPlanQuery = useQuery({
    queryKey: ["team-admin-plan", teamId],
    queryFn: async () => {
      if (!teamId) return "free";
      // Find the admin of this team
      const { data: adminMember } = await supabase
        .from("team_members")
        .select("user_id")
        .eq("team_id", teamId)
        .eq("role", "admin")
        .eq("status", "active")
        .limit(1)
        .maybeSingle();

      if (!adminMember?.user_id) return "free";

      const { data: sub } = await supabase
        .from("subscriptions")
        .select("plan_name, status")
        .eq("user_id", adminMember.user_id)
        .eq("status", "active")
        .maybeSingle();

      if (!sub?.plan_name) return "free";
      const name = sub.plan_name.toLowerCase();
      if (name.includes("scale")) return "scale";
      if (name.includes("growth")) return "growth";
      if (name.includes("starter")) return "starter";
      return "free";
    },
    enabled: !!teamId,
    staleTime: 60_000,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["my-team-id", userId] });
    queryClient.invalidateQueries({ queryKey: ["team", teamId] });
    queryClient.invalidateQueries({ queryKey: ["team-members", teamId] });
    queryClient.invalidateQueries({ queryKey: ["team-invitations", teamId] });
    queryClient.invalidateQueries({ queryKey: ["my-pending-invitations", userId] });
  };

  // ── CREATE TEAM ───────────────────────────────────────────────────────
  const createTeam = useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await supabase.rpc("create_team_with_owner", {
        team_name: name || "My Team",
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({ title: "Team created!", description: "Your team is ready." });
      invalidate();
    },
    onError: (err: any) => {
      toast({
        title: "Failed to create team",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  // ── INVITE MEMBER ─────────────────────────────────────────────────────
  const inviteMember = useMutation({
    mutationFn: async ({ email, role }: { email: string; role: string }) => {
      if (!teamId) throw new Error("No team");

      // Check if user already has a Fixsense account
      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("id, email")
        .ilike("email", email)
        .maybeSingle();

      const isExistingUser = !!existingProfile;

      // Insert invitation record
      const { error: invErr } = await supabase
        .from("team_invitations")
        .insert({ team_id: teamId, email, role, invited_by: userId! })
        .select()
        .single();

      if (invErr) {
        if (invErr.code === "23505") {
          throw new Error("This email has already been invited.");
        }
        throw invErr;
      }

      if (isExistingUser) {
        // Existing user: add them directly as invited member
        const { error: memErr } = await supabase
          .from("team_members")
          .insert({
            team_id: teamId,
            user_id: existingProfile.id,
            role,
            status: "invited",
            invited_email: email,
          })
          .select()
          .maybeSingle();

        if (memErr && memErr.code !== "23505") throw memErr;

        // Send in-app notification
        await supabase.from("notifications").insert({
          user_id: existingProfile.id,
          type: "system",
          message: `You've been invited to join a team as ${role}. Go to Team page to accept.`,
        });
      } else {
        // New user: send invite email via edge function
        await supabase.functions.invoke("send-invite-email", {
          body: {
            email,
            teamName: teamQuery.data?.name ?? "a team",
            inviterName: user?.user_metadata?.full_name ?? user?.email,
            role,
            signupUrl: `${window.location.origin}/login`,
          },
        });
      }

      return { isExistingUser };
    },
    onSuccess: ({ isExistingUser }) => {
      toast({
        title: "Invitation sent!",
        description: isExistingUser
          ? "The user has been notified in-app."
          : "An email invite has been sent.",
      });
      invalidate();
    },
    onError: (err: any) => {
      toast({
        title: "Failed to invite",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  // ── CANCEL INVITATION ─────────────────────────────────────────────────
  const cancelInvitation = useMutation({
    mutationFn: async (invitationId: string) => {
      const { error } = await supabase
        .from("team_invitations")
        .delete()
        .eq("id", invitationId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Invitation cancelled" });
      invalidate();
    },
    onError: (err: any) => {
      toast({
        title: "Failed to cancel invitation",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  // ── UPDATE ROLE ───────────────────────────────────────────────────────
  const updateRole = useMutation({
    mutationFn: async ({
      memberId,
      role,
    }: {
      memberId: string;
      role: string;
    }) => {
      const { error } = await supabase
        .from("team_members")
        .update({ role })
        .eq("id", memberId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Role updated" });
      invalidate();
    },
    onError: (err: any) => {
      toast({
        title: "Failed to update role",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  // ── REMOVE MEMBER ─────────────────────────────────────────────────────
  const removeMember = useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await supabase
        .from("team_members")
        .delete()
        .eq("id", memberId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Member removed" });
      invalidate();
    },
    onError: (err: any) => {
      toast({
        title: "Failed to remove member",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  // ── ACCEPT INVITATION ─────────────────────────────────────────────────
  const acceptInvitation = useMutation({
    mutationFn: async (inviteTeamId: string) => {
      if (!userId) throw new Error("Not authenticated");

      // Update invitation status
      await supabase
        .from("team_invitations")
        .update({ status: "accepted" })
        .eq("team_id", inviteTeamId)
        .eq("status", "pending")
        .ilike("email", (await supabase.from("profiles").select("email").eq("id", userId).maybeSingle()).data?.email ?? "");

      // Upsert into team_members as active
      const { error } = await supabase
        .from("team_members")
        .upsert(
          { team_id: inviteTeamId, user_id: userId, role: "member", status: "active" },
          { onConflict: "team_id,user_id" }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Joined team!", description: "Welcome to the team." });
      invalidate();
    },
    onError: (err: any) => {
      toast({
        title: "Failed to accept invitation",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  // ── DECLINE INVITATION ────────────────────────────────────────────────
  const declineInvitation = useMutation({
    mutationFn: async (inviteTeamId: string) => {
      if (!userId) throw new Error("Not authenticated");
      const { data: profile } = await supabase
        .from("profiles")
        .select("email")
        .eq("id", userId)
        .maybeSingle();

      await supabase
        .from("team_invitations")
        .update({ status: "declined" })
        .eq("team_id", inviteTeamId)
        .ilike("email", profile?.email ?? "");

      // Also remove invited team_member row if it exists
      await supabase
        .from("team_members")
        .delete()
        .eq("team_id", inviteTeamId)
        .eq("user_id", userId)
        .eq("status", "invited");
    },
    onSuccess: () => {
      toast({ title: "Invitation declined" });
      invalidate();
    },
    onError: (err: any) => {
      toast({
        title: "Failed to decline invitation",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  return {
    // Data
    team: teamQuery.data ?? null,
    teamId,
    role: (roleQuery.data ?? "member") as string,
    members: membersQuery.data ?? [],
    pendingInvitations: invitationsQuery.data ?? [],
    myPendingInvitations: myInvitationsQuery.data ?? [],
    adminPlanKey: adminPlanQuery.data ?? "free",

    // Loading states
    teamLoading:
      teamIdQuery.isLoading ||
      (!!teamId && teamQuery.isLoading),
    membersLoading: membersQuery.isLoading,

    // Mutations
    createTeam,
    inviteMember,
    cancelInvitation,
    updateRole,
    removeMember,
    acceptInvitation,
    declineInvitation,
  };
}