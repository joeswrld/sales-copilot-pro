/**
 * UsageCard.tsx — usage-this-cycle card with an 80% warning state.
 */

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Timer, Clock, Calendar, AlertTriangle, Video } from "lucide-react";
import { format } from "date-fns";
import { formatMinutes } from "@/config/plans";
import { cn } from "@/lib/utils";

interface UsageCardProps {
  minutesUsed: number;
  minutesRemaining: number | null;
  minuteLimit: number;
  isUnlimited: boolean;
  pct: number;
  isNearLimit: boolean;
  isAtLimit: boolean;
  resetDate: Date;
  extraMinutes: number;
  extraMinutesExpiresAt: string | null;
  /** Rough estimate of an average meeting length, used to translate remaining minutes into "meetings left". */
  avgMeetingMinutes?: number;
}

export default function UsageCard({
  minutesUsed, minutesRemaining, minuteLimit, isUnlimited, pct, isNearLimit, isAtLimit,
  resetDate, extraMinutes, extraMinutesExpiresAt, avgMeetingMinutes = 30,
}: UsageCardProps) {
  const estimatedMeetingsLeft =
    !isUnlimited && minutesRemaining != null ? Math.floor(minutesRemaining / avgMeetingMinutes) : null;

  return (
    <Card className={cn(isAtLimit && "border-destructive/40", isNearLimit && !isAtLimit && "border-amber-500/40")}>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Timer className="w-5 h-5 text-primary" />
          Usage This Billing Cycle
        </CardTitle>
        <CardDescription>Call minutes used across your account.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-foreground flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" />
              Minutes Used
            </span>
            <span className={cn(
              "text-sm font-semibold tabular-nums",
              isAtLimit ? "text-destructive" : isNearLimit ? "text-amber-500" : "text-foreground"
            )}>
              {isUnlimited ? `${formatMinutes(minutesUsed)} used · Unlimited` : `${formatMinutes(minutesUsed)} / ${formatMinutes(minuteLimit)}`}
            </span>
          </div>

          {!isUnlimited ? (
            <>
              <Progress
                value={pct}
                className={cn("h-3", isAtLimit ? "[&>div]:bg-destructive" : isNearLimit ? "[&>div]:bg-amber-500" : "")}
              />
              <div className="flex justify-between mt-1.5 text-xs text-muted-foreground">
                <span>
                  {isAtLimit
                    ? <span className="text-destructive font-medium">Limit reached — upgrade to continue</span>
                    : `${formatMinutes(minutesRemaining ?? 0)} remaining · ${Math.round(pct)}% used`}
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  Resets {format(resetDate, "MMM d, yyyy")}
                </span>
              </div>
            </>
          ) : (
            <div className="h-3 rounded-full bg-primary/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary/50 to-primary"
                style={{ width: `${Math.min((minutesUsed / 300) * 100, 100)}%` }}
              />
            </div>
          )}
        </div>

        {isNearLimit && (
          <div className={cn(
            "flex items-start gap-2.5 p-3 rounded-lg border text-xs",
            isAtLimit ? "bg-destructive/5 border-destructive/20 text-destructive" : "bg-amber-500/5 border-amber-500/20 text-amber-500"
          )}>
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>
              {isAtLimit
                ? "You've used all your included minutes for this cycle. Buy extra minutes or upgrade to keep taking calls."
                : `You've used over 80% of your included minutes. Consider buying extra minutes or upgrading before you hit the limit.`}
            </span>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          {estimatedMeetingsLeft != null && (
            <div className="flex items-center justify-between px-3.5 py-2.5 rounded-lg bg-secondary/30 border border-border">
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                <Video className="w-3.5 h-3.5" /> Est. meetings remaining
              </span>
              <span className="text-sm font-semibold text-foreground">~{estimatedMeetingsLeft}</span>
            </div>
          )}
          {extraMinutes > 0 && (
            <div className="flex items-center justify-between px-3.5 py-2.5 rounded-lg bg-secondary/30 border border-border">
              <span className="text-xs text-muted-foreground">Extra minutes purchased</span>
              <span className="text-sm font-semibold text-foreground">
                {formatMinutes(extraMinutes)}
                {extraMinutesExpiresAt && (
                  <span className="text-xs text-muted-foreground font-normal"> · until {format(new Date(extraMinutesExpiresAt), "MMM d")}</span>
                )}
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}