import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BarChart3, Users, MessageSquare, Plus } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTeam } from "@/hooks/useTeam";
import { useTeamMessaging } from "@/hooks/useTeamMessaging";
import TeamOverviewTab from "@/components/team/TeamOverviewTab";
import TeamMembersTab from "@/components/team/TeamMembersTab";
import TeamInboxTab from "@/components/team/TeamInboxTab";

export default function TeamPage() {
  const { user } = useAuth();
  const { team, teamLoading, role, members, membersLoading, createTeam, inviteMember, updateRole, removeMember } = useTeam();
  const { totalUnread } = useTeamMessaging(team?.id);
  const [createOpen, setCreateOpen] = useState(false);
  const [teamName, setTeamName] = useState("");

  if (teamLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  // No team yet — show create team prompt
  if (!team) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-[60vh] text-center px-4">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
            <Users className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold font-display mb-2">Create Your Team</h1>
          <p className="text-sm text-muted-foreground max-w-md mb-6">
            Set up a team workspace to monitor performance, manage members, and communicate with your sales team — all in one place.
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
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold font-display">{team.name}</h1>
          <p className="text-sm text-muted-foreground">
            Sales performance command center · {members.length} member{members.length !== 1 ? "s" : ""}
          </p>
        </div>

        {/* Tabs */}
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
            <TabsTrigger value="inbox" className="gap-1.5 text-xs sm:text-sm">
              <MessageSquare className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Inbox</span>
              {totalUnread > 0 && (
                <Badge className="text-[10px] h-4 px-1 ml-1 bg-primary text-primary-foreground">{totalUnread}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <TeamOverviewTab />
          </TabsContent>

          <TabsContent value="members">
            <TeamMembersTab
              members={members}
              currentRole={role}
              currentUserId={user?.id ?? ""}
              onInvite={(data) => inviteMember.mutate(data)}
              onUpdateRole={(data) => updateRole.mutate(data)}
              onRemove={(id) => removeMember.mutate(id)}
              inviting={inviteMember.isPending}
            />
          </TabsContent>

          <TabsContent value="inbox">
            <TeamInboxTab teamId={team.id} members={members} />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
