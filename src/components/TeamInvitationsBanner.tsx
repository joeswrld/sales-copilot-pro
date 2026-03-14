import { Users, Check, X, Sparkles, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTeam } from "@/hooks/useTeam";
import { cn } from "@/lib/utils";

/**
 * Shows pending team invitations directed at the current user.
 * Rendered at the top of the Team page (when the user has no team yet)
 * or anywhere you want to surface incoming invites.
 */
export default function TeamInvitationsBanner() {
  const { myPendingInvitations, acceptInvitation, declineInvitation } = useTeam();

  if (!myPendingInvitations.length) return null;

  return (
    <div className="space-y-2">
      {myPendingInvitations.map((inv) => {
        const isAccepting = acceptInvitation.isPending && acceptInvitation.variables === inv.team_id;
        const isDeclining = declineInvitation.isPending && declineInvitation.variables === inv.team_id;
        const isPending = isAccepting || isDeclining;

        return (
          <div
            key={inv.id}
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-lg border transition-all",
              isPending 
                ? "bg-secondary/30 border-border opacity-60" 
                : "bg-primary/10 border-primary/20"
            )}
          >
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
              <Users className="w-4 h-4 text-primary" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-medium text-foreground">
                  You've been invited to join{" "}
                  <span className="text-primary font-semibold">
                    {(inv as any).teams?.name ?? "a team"}
                  </span>
                </p>
                {isPending && (
                  <Badge variant="secondary" className="text-[9px] h-4 px-1.5 gap-1 animate-pulse">
                    <Clock className="w-2.5 h-2.5" />
                    {isAccepting ? "Accepting..." : "Declining..."}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Role: <span className="capitalize font-medium">{inv.role}</span>
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs gap-1.5 text-destructive border-destructive/40 hover:bg-destructive/10"
                onClick={() => declineInvitation.mutate(inv.team_id)}
                disabled={isPending}
              >
                <X className="w-3.5 h-3.5" />
                Decline
              </Button>
              <Button
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={() => acceptInvitation.mutate(inv.team_id)}
                disabled={isPending}
              >
                <Check className="w-3.5 h-3.5" />
                Accept
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
