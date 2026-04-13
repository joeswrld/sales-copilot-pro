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
  invite_token?: string | null;
  isExistingUser?: boolean;
  teams?: { name: string } | null;
}

async function fetchMyTeamId(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("team_members")
    .select("team_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data?.team_id ?? null;
}

async function ensureWorkspaceForTeam(teamId: string, adminUserId: string): Promise<void> {
  try {
    await supabase
      .from("workspaces" as any)
      .upsert(
        { team_id: teamId, owner_id: adminUserId },
        { onConflict: "team_id" }
      );
  } catch (e) {
    console.warn("ensureWorkspaceForTeam error (non-fatal):", e);
  }
}

export function useTeam() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id;

  const teamIdQuery = useQuery({
    queryKey: ["my-team-id", userId],
    queryFn: () => (userId ? fetchMyTeamId(userId) : null),
    enabled: !!userId,
    staleTime: 30_000,
  });

  const teamId = teamIdQuery.data ?? null;

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
        console.warn("team invitations fetch:", error.message);
        return [];
      }
      return (data ?? []) as PendingInvitation[];
    },
    enabled: !!teamId,
    staleTime: 15_000,
  });

  const myInvitationsQuery = useQuery({
    queryKey: ["my-pending-invitations", userId],
    queryFn: async () => {
      if (!userId) return [];
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

  const adminPlanQuery = useQuery({
    queryKey: ["team-admin-plan", teamId],
    queryFn: async () => {
      if (!teamId) return "free";
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
        .from("subscriptions" as any)
        .select("plan_name, status")
        .eq("user_id", adminMember.user_id)
        .eq("status", "active")
        .maybeSingle();

      if ((sub as any)?.plan_name) {
        const name = (sub as any).plan_name.toLowerCase();
        if (name.includes("scale"))   return "scale";
        if (name.includes("growth"))  return "growth";
        if (name.includes("starter")) return "starter";
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("plan_type")
        .eq("id", adminMember.user_id)
        .maybeSingle();

      return profile?.plan_type ?? "free";
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
    queryClient.invalidateQueries({ queryKey: ["effective-plan"] });
  };

  // ── CREATE TEAM ─────────────────────────────────────────────────────────────
  const createTeam = useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await supabase.rpc("create_team_with_owner", {
        team_name: name || "My Team",
      });
      if (error) throw error;
      if (data?.id && userId) {
        await ensureWorkspaceForTeam(data.id, userId);
      }
      return data;
    },
    onSuccess: () => {
      toast({ title: "Team created!", description: "Your team is ready." });
      invalidate();
    },
    onError: (err: any) => {
      toast({ title: "Failed to create team", description: err.message, variant: "destructive" });
    },
  });

  // ── INVITE MEMBER ────────────────────────────────────────────────────────────
  // ✅ Updated: reads back invite_token and passes it to send-invite-email
  const inviteMember = useMutation({
    mutationFn: async ({ email, role }: { email: string; role: string }) => {
      if (!teamId) throw new Error("No team");

      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("id, email")
        .ilike("email", email)
        .maybeSingle();

      const isExistingUser = !!existingProfile;

      // Insert invitation — DB trigger auto-generates invite_token
      const { data: invRow, error: invErr } = await supabase
        .from("team_invitations")
        .insert({ team_id: teamId, email, role, invited_by: userId! })
        .select("id, invite_token")
        .single();

      if (invErr) {
        if (invErr.code === "23505") throw new Error("This email has already been invited.");
        throw invErr;
      }

      const inviteToken: string | null = (invRow as any)?.invite_token ?? null;

      if (isExistingUser) {
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

        await supabase.from("notifications").insert({
          user_id: existingProfile.id,
          type: "system",
          message: `You've been invited to join a team as ${role}. Go to Team page to accept or visit your invite link.`,
        });
      }

      // Send email with the dedicated invite landing page link
      await supabase.functions.invoke("send-invite-email", {
        body: {
          email,
          teamName: teamQuery.data?.name ?? "a team",
          inviterName: user?.user_metadata?.full_name ?? user?.email,
          role,
          inviteToken,
          signupUrl: `${window.location.origin}/login`,
        },
      });

      return { isExistingUser, inviteToken };
    },
    onSuccess: ({ isExistingUser }) => {
      toast({
        title: "Invitation sent!",
        description: isExistingUser
          ? "The user has been notified in-app and by email."
          : "An email invite has been sent with a personal link.",
      });
      invalidate();
    },
    onError: (err: any) => {
      toast({ title: "Failed to invite", description: err.message, variant: "destructive" });
    },
  });

  // ── CANCEL INVITATION ───────────────────────────────────────────────────────
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
      toast({ title: "Failed to cancel invitation", description: err.message, variant: "destructive" });
    },
  });

  // ── UPDATE ROLE ─────────────────────────────────────────────────────────────
  const updateRole = useMutation({
    mutationFn: async ({ memberId, role }: { memberId: string; role: string }) => {
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
      toast({ title: "Failed to update role", description: err.message, variant: "destructive" });
    },
  });

  // ── REMOVE MEMBER ───────────────────────────────────────────────────────────
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
      toast({ title: "Failed to remove member", description: err.message, variant: "destructive" });
    },
  });

  // ── ACCEPT INVITATION (token-based) ─────────────────────────────────────────
  const acceptInvitationByToken = useMutation({
    mutationFn: async (token: string) => {
      const { data, error } = await (supabase as any).rpc(
        "accept_invitation_by_token", { p_token: token }
      );
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Failed to accept invitation");
      return data;
    },
    onSuccess: () => {
      toast({ title: "Joined team!", description: "Welcome to the team." });
      invalidate();
    },
    onError: (err: any) => {
      toast({ title: "Failed to accept invitation", description: err.message, variant: "destructive" });
    },
  });

  // ── ACCEPT INVITATION (legacy email-based) ──────────────────────────────────
  const acceptInvitation = useMutation({
    mutationFn: async (inviteTeamId: string) => {
      if (!userId) throw new Error("Not authenticated");

      await supabase
        .from("team_invitations")
        .update({ status: "accepted" })
        .eq("team_id", inviteTeamId)
        .eq("status", "pending")
        .ilike("email", (await supabase.from("profiles").select("email").eq("id", userId).maybeSingle()).data?.email ?? "");

      const { error } = await supabase
        .from("team_members")
        .upsert(
          { team_id: inviteTeamId, user_id: userId, role: "member", status: "active" },
          { onConflict: "team_id,user_id" }
        );
      if (error) throw error;

      const { data: adminMember } = await supabase
        .from("team_members")
        .select("user_id")
        .eq("team_id", inviteTeamId)
        .eq("role", "admin")
        .eq("status", "active")
        .maybeSingle();

      if (adminMember?.user_id) {
        await ensureWorkspaceForTeam(inviteTeamId, adminMember.user_id);
      }
    },
    onSuccess: () => {
      toast({ title: "Joined team!", description: "Welcome to the team." });
      invalidate();
    },
    onError: (err: any) => {
      toast({ title: "Failed to accept invitation", description: err.message, variant: "destructive" });
    },
  });

  // ── DECLINE INVITATION ──────────────────────────────────────────────────────
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
      toast({ title: "Failed to decline invitation", description: err.message, variant: "destructive" });
    },
  });

  return {
    team: teamQuery.data ?? null,
    teamId,
    role: (roleQuery.data ?? "member") as string,
    members: membersQuery.data ?? [],
    pendingInvitations: invitationsQuery.data ?? [],
    myPendingInvitations: myInvitationsQuery.data ?? [],
    adminPlanKey: adminPlanQuery.data ?? "free",
    teamLoading:
      teamIdQuery.isLoading ||
      (!!teamId && teamQuery.isLoading),
    membersLoading: membersQuery.isLoading,
    createTeam,
    inviteMember,
    cancelInvitation,
    updateRole,
    removeMember,
    acceptInvitation,
    acceptInvitationByToken,
    declineInvitation,
  };
}