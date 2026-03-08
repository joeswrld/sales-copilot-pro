import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { UserPlus, MoreHorizontal, Shield, ShieldCheck, User, Trash2, RefreshCw, Clock, X } from "lucide-react";
import type { TeamMember } from "@/hooks/useTeam";

interface PendingInvitation {
  id: string;
  email: string;
  role: string;
  created_at: string;
}

interface Props {
  members: TeamMember[];
  pendingInvitations: PendingInvitation[];
  currentRole: string;
  currentUserId: string;
  onInvite: (data: { email: string; role: string }) => void;
  onUpdateRole: (data: { memberId: string; role: string }) => void;
  onRemove: (memberId: string) => void;
  onCancelInvitation: (invitationId: string) => void;
  inviting: boolean;
}

const roleIcons: Record<string, typeof Shield> = { admin: ShieldCheck, manager: Shield, member: User };
const roleColors: Record<string, string> = { admin: "text-primary", manager: "text-amber-400", member: "text-muted-foreground" };

export default function TeamMembersTab({ members, pendingInvitations, currentRole, currentUserId, onInvite, onUpdateRole, onRemove, onCancelInvitation, inviting }: Props) {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [removeTarget, setRemoveTarget] = useState<TeamMember | null>(null);

  const isAdmin = currentRole === "admin";

  const handleInvite = () => {
    if (!inviteEmail.trim()) return;
    onInvite({ email: inviteEmail.trim(), role: inviteRole });
    setInviteEmail("");
    setInviteRole("member");
    setInviteOpen(false);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold font-display">Team Members</h2>
          <p className="text-xs text-muted-foreground">{members.length} member{members.length !== 1 ? "s" : ""}</p>
        </div>
        {isAdmin && (
          <Button size="sm" onClick={() => setInviteOpen(true)} className="gap-2">
            <UserPlus className="w-4 h-4" />
            <span className="hidden sm:inline">Invite User</span>
          </Button>
        )}
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {members.map((m) => {
          const name = m.profile?.full_name || m.invited_email || "Unknown";
          const email = m.profile?.email || m.invited_email || "";
          const initial = name[0]?.toUpperCase() || "?";
          const RoleIcon = roleIcons[m.role] || User;
          return (
            <Card key={m.id} className="bg-card border-border">
              <CardContent className="p-3">
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="bg-primary/20 text-primary text-sm font-bold">{initial}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{name}</p>
                      {m.status === "invited" && <Badge variant="secondary" className="text-[10px]">Invited</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{email}</p>
                    <div className="flex items-center gap-1 mt-1">
                      <RoleIcon className={`w-3 h-3 ${roleColors[m.role]}`} />
                      <span className="text-xs capitalize text-muted-foreground">{m.role}</span>
                    </div>
                  </div>
                  {isAdmin && m.user_id !== currentUserId && (
                    <MemberActions member={m} onUpdateRole={onUpdateRole} onRemove={() => setRemoveTarget(m)} />
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Desktop table */}
      <Card className="bg-card border-border hidden md:block">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-4 text-xs font-medium text-muted-foreground">Name</th>
                  <th className="text-left p-4 text-xs font-medium text-muted-foreground">Email</th>
                  <th className="text-left p-4 text-xs font-medium text-muted-foreground">Role</th>
                  <th className="text-left p-4 text-xs font-medium text-muted-foreground">Status</th>
                  <th className="text-left p-4 text-xs font-medium text-muted-foreground">Joined</th>
                  {isAdmin && <th className="text-right p-4 text-xs font-medium text-muted-foreground">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {members.map((m) => {
                  const name = m.profile?.full_name || m.invited_email || "Unknown";
                  const email = m.profile?.email || m.invited_email || "";
                  const initial = name[0]?.toUpperCase() || "?";
                  const RoleIcon = roleIcons[m.role] || User;
                  return (
                    <tr key={m.id} className="hover:bg-secondary/30 transition-colors">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">{initial}</AvatarFallback>
                          </Avatar>
                          <span className="font-medium">{name}</span>
                        </div>
                      </td>
                      <td className="p-4 text-muted-foreground">{email}</td>
                      <td className="p-4">
                        <div className="flex items-center gap-1.5">
                          <RoleIcon className={`w-3.5 h-3.5 ${roleColors[m.role]}`} />
                          <span className="capitalize">{m.role}</span>
                        </div>
                      </td>
                      <td className="p-4">
                        <Badge variant={m.status === "active" ? "default" : "secondary"} className="text-xs capitalize">
                          {m.status}
                        </Badge>
                      </td>
                      <td className="p-4 text-muted-foreground text-xs">
                        {new Date(m.created_at).toLocaleDateString()}
                      </td>
                      {isAdmin && (
                        <td className="p-4 text-right">
                          {m.user_id !== currentUserId && (
                            <MemberActions member={m} onUpdateRole={onUpdateRole} onRemove={() => setRemoveTarget(m)} />
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Invite Dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Invite Team Member</DialogTitle>
            <DialogDescription>Send an invitation to join your team.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Email Address</label>
              <Input
                type="email"
                placeholder="colleague@company.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Role</label>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="member">Member</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-2">
                {inviteRole === "admin" && "Full access: invite/remove users, manage roles, view analytics, access billing."}
                {inviteRole === "manager" && "Can view team analytics, all meetings, and coaching insights."}
                {inviteRole === "member" && "Can view only their own meetings and personal performance."}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
            <Button onClick={handleInvite} disabled={!inviteEmail.trim() || inviting}>
              {inviting ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : null}
              Send Invite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Confirmation */}
      <AlertDialog open={!!removeTarget} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Team Member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove {removeTarget?.profile?.full_name || removeTarget?.invited_email} from the team?
              They will lose access to team analytics and meetings.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (removeTarget) { onRemove(removeTarget.id); setRemoveTarget(null); } }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function MemberActions({ member, onUpdateRole, onRemove }: {
  member: TeamMember;
  onUpdateRole: (data: { memberId: string; role: string }) => void;
  onRemove: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontal className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {member.role !== "admin" && (
          <DropdownMenuItem onClick={() => onUpdateRole({ memberId: member.id, role: "admin" })}>
            <ShieldCheck className="w-4 h-4 mr-2" /> Make Admin
          </DropdownMenuItem>
        )}
        {member.role !== "manager" && (
          <DropdownMenuItem onClick={() => onUpdateRole({ memberId: member.id, role: "manager" })}>
            <Shield className="w-4 h-4 mr-2" /> Make Manager
          </DropdownMenuItem>
        )}
        {member.role !== "member" && (
          <DropdownMenuItem onClick={() => onUpdateRole({ memberId: member.id, role: "member" })}>
            <User className="w-4 h-4 mr-2" /> Make Member
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={onRemove} className="text-destructive focus:text-destructive">
          <Trash2 className="w-4 h-4 mr-2" /> Remove
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
