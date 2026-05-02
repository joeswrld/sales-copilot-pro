import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Settings,
  Save,
  Trash2,
  AlertTriangle,
  Users,
  Calendar,
  Shield,
} from "lucide-react";
import { useTeam } from "@/hooks/useTeam";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { toast } from "@/components/ui/use-toast";
import { format } from "date-fns";

interface Props {
  teamId: string;
  teamName: string;
  createdAt: string;
  membersCount: number;
  currentRole: string;
}

export default function TeamSettingsTab({
  teamId,
  teamName,
  createdAt,
  membersCount,
  currentRole,
}: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState(teamName);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const isAdmin = currentRole === "admin";

  const handleSaveName = async () => {
    if (!name.trim() || name === teamName) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("teams")
        .update({ name: name.trim() })
        .eq("id", teamId);

      if (error) throw error;

      toast({
        title: "Team name updated",
        description: "Your team name has been successfully updated.",
      });
    } catch (error: any) {
      toast({
        title: "Failed to update team name",
        description: error.message,
        variant: "destructive",
      });
      setName(teamName); // Reset to original name
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteTeam = async () => {
    setIsDeleting(true);
    try {
      // First, remove all team members
      const { error: membersError } = await supabase
        .from("team_members")
        .delete()
        .eq("team_id", teamId);

      if (membersError) throw membersError;

      // Delete all team invitations
      const { error: invitationsError } = await supabase
        .from("team_invitations")
        .delete()
        .eq("team_id", teamId);

      if (invitationsError) throw invitationsError;

      // Delete all team conversations
      const { error: conversationsError } = await supabase
        .from("team_conversations")
        .delete()
        .eq("team_id", teamId);

      if (conversationsError) throw conversationsError;

      // Finally, delete the team
      const { error: teamError } = await supabase
        .from("teams")
        .delete()
        .eq("id", teamId);

      if (teamError) throw teamError;

      toast({
        title: "Team deleted",
        description: "Your team has been permanently deleted.",
      });

      // Navigate to team page (will show create team screen)
      navigate("/team");
    } catch (error: any) {
      toast({
        title: "Failed to delete team",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Shield className="w-10 h-10 text-muted-foreground mb-3" />
        <h3 className="text-sm font-semibold">Admin Access Required</h3>
        <p className="text-xs text-muted-foreground mt-1 max-w-xs">
          Only team administrators can access team settings.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold font-display">Team Settings</h2>
        <p className="text-xs text-muted-foreground">
          Manage your team configuration and preferences
        </p>
      </div>

      {/* Team Information Card */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-display flex items-center gap-2">
            <Settings className="w-4 h-4 text-primary" />
            Team Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="team-name" className="text-sm font-medium">
              Team Name
            </Label>
            <div className="flex gap-2">
              <Input
                id="team-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter team name"
                className="flex-1"
              />
              <Button
                onClick={handleSaveName}
                disabled={!name.trim() || name === teamName || isSaving}
                size="sm"
                className="gap-2"
              >
                <Save className="w-3.5 h-3.5" />
                Save
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              This name is visible to all team members
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-border">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Calendar className="w-3.5 h-3.5" />
                <span>Created</span>
              </div>
              <p className="text-sm font-medium">
                {format(new Date(createdAt), "MMM d, yyyy")}
              </p>
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Users className="w-3.5 h-3.5" />
                <span>Team Members</span>
              </div>
              <p className="text-sm font-medium">
                {membersCount} member{membersCount !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone Card */}
      <Card className="bg-card border-destructive/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-display flex items-center gap-2 text-destructive">
            <AlertTriangle className="w-4 h-4" />
            Danger Zone
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div>
              <h4 className="text-sm font-semibold">Delete Team</h4>
              <p className="text-xs text-muted-foreground mt-1">
                Permanently delete this team and all associated data. This action
                cannot be undone.
              </p>
            </div>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="destructive"
                  size="sm"
                  className="gap-2"
                  disabled={isDeleting}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete Team
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                  <AlertDialogDescription className="space-y-2">
                    <p>
                      This action cannot be undone. This will permanently delete
                      the team <strong>{teamName}</strong> and remove all team
                      members.
                    </p>
                    <p className="text-destructive font-medium">
                      All team data including:
                    </p>
                    <ul className="list-disc list-inside text-xs space-y-1 ml-2">
                      <li>{membersCount} team member{membersCount !== 1 ? "s" : ""}</li>
                      <li>Team conversations and messages</li>
                      <li>Team invitations</li>
                      <li>Team settings and preferences</li>
                    </ul>
                    <p className="pt-2">
                      will be permanently deleted. Individual member data (calls,
                      analytics) will be preserved.
                    </p>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDeleteTeam}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {isDeleting ? "Deleting..." : "Yes, delete team"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card className="bg-secondary/30 border-border">
        <CardContent className="p-4">
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Settings className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">Team Settings</p>
              <p className="text-xs text-muted-foreground mt-1">
                Need to transfer ownership or change other settings? Contact your
                team members to coordinate administrative changes.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
