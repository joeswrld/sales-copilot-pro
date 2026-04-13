import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BarChart3, Users, Plus, GraduationCap, Settings } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTeam } from "@/hooks/useTeam";
import { useMessageNotifications } from "@/hooks/useMessageNotifications";
import { usePlanEnforcement } from "@/contexts/PlanEnforcementContext";
import TeamOverviewTab from "@/components/team/TeamOverviewTab";
import TeamMembersTab from "@/components/team/TeamMembersTab";
import TeamCoachingTab from "@/components/team/TeamCoachingTab";
import TeamSettingsTab from "@/components/team/TeamSettingsTab";
import TeamInvitationsBanner from "@/components/TeamInvitationsBanner";
import { LockedCard } from "@/components/plan/PlanGate";

export default function TeamPage() {
  const { user } = useAuth();
  const { hasFeature, isLoading: planLoading } = usePlanEnforcement();
  const {
    team, teamLoading, role, members, membersLoading,
    pendingInvitations, adminPlanKey,
    createTeam, inviteMember, cancelInvitation, updateRole, removeMember,
  } = useTeam();
  useMessageNotifications(team?.id);
  const [createOpen, setCreateOpen] = useState(false);
  const [teamName, setTeamName] = useState("");

  const isAdmin = role === "admin";

  // ── Plan gate: Team features require Starter plan or above ──────────────
  // team_messages is the feature key that maps to Starter+ in PlanEnforcementContext
  if (planLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  if (!hasFeature("team_messages")) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-[60vh] px-4">
          <div className="w-full max-w-md">
            <LockedCard
              feature="team_messages"
              title="Team Workspace"
              description="Upgrade to Starter or higher to unlock team features: performance overview, member management, coaching tools, and team messaging."
            />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // ── Normal team page rendering (Starter+ users only) ─────────────────────

  if (teamLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  if (!team) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-[60vh] text-center px-4 space-y-4">
          {/* Show any pending invitations for this user even before they have a team */}
          <div className="w-full max-w-md">
            <TeamInvitationsBanner />
          </div>

          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Users className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold font-display">Create Your Team</h1>
          <p className="text-sm text-muted-foreground max-w-md">
            Set up a team workspace to monitor performance, manage members, and coach your sales team — all in one place.
          </p>
          <Button onClick={() => setCreateOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            Create Team
          </Button>

          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle>Create Team</DialogTitle>
                <DialogDescription>Give your team a name to get started.</DialogDescription>
              </DialogHeader>
              <Input
                placeholder="e.g. PipelineFlow Sales"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
              />
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                <Button
                  onClick={() => {
                    createTeam.mutate(teamName || "My Team");
                    setCreateOpen(false);
                    setTeamName("");
                  }}
                  disabled={createTeam.isPending}
                >
                  Create
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold font-display">{team.name}</h1>
          <p className="text-sm text-muted-foreground">
            Sales performance command center · {members.length} member{members.length !== 1 ? "s" : ""}
          </p>
        </div>

        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="bg-secondary/50">
            <TabsTrigger value="overview" className="gap-1.5 text-xs sm:text-sm">
              <BarChart3 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Overview</span>
            </TabsTrigger>
            <TabsTrigger value="members" className="gap-1.5 text-xs sm:text-sm">
              <Users className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Members</span>
              <Badge variant="secondary" className="text-[10px] h-4 px-1 ml-1">{members.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="coaching" className="gap-1.5 text-xs sm:text-sm">
              <GraduationCap className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Coaching</span>
            </TabsTrigger>
            {isAdmin && (
              <TabsTrigger value="settings" className="gap-1.5 text-xs sm:text-sm">
                <Settings className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Settings</span>
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="overview">
            <TeamOverviewTab />
          </TabsContent>

          <TabsContent value="members">
            <TeamMembersTab
              members={members}
              pendingInvitations={pendingInvitations}
              currentRole={role}
              currentUserId={user?.id ?? ""}
              adminPlanKey={adminPlanKey}
              onInvite={(data) => inviteMember.mutate(data)}
              onUpdateRole={(data) => updateRole.mutate(data)}
              onRemove={(id) => removeMember.mutate(id)}
              onCancelInvitation={(id) => cancelInvitation.mutate(id)}
              inviting={inviteMember.isPending}
            />
          </TabsContent>

          <TabsContent value="coaching">
            <TeamCoachingTab />
          </TabsContent>

          {isAdmin && (
            <TabsContent value="settings">
              <TeamSettingsTab
                teamId={team.id}
                teamName={team.name}
                createdAt={team.created_at}
                membersCount={members.length}
                currentRole={role}
              />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </DashboardLayout>
  );
}