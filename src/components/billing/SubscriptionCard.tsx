/**
 * SubscriptionCard.tsx — the "what am I paying for, and when" card.
 */

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Zap, Calendar, RefreshCw, Timer, Users, ArrowUp, Loader2, CheckCircle2, XCircle, AlertCircle,
} from "lucide-react";
import { format, differenceInCalendarDays } from "date-fns";
import { formatNGN, formatMinutes } from "@/config/plans";
import { cn } from "@/lib/utils";

const STATUS_CFG: Record<string, { label: string; icon: typeof CheckCircle2; className: string }> = {
  active:    { label: "Active",    icon: CheckCircle2, className: "bg-primary/10 text-primary border-primary/30" },
  cancelled: { label: "Cancelled", icon: XCircle,       className: "bg-muted text-muted-foreground border-border" },
  past_due:  { label: "Past Due",  icon: AlertCircle,   className: "bg-destructive/10 text-destructive border-destructive/30" },
  pending:   { label: "Pending",   icon: Loader2,        className: "bg-amber-500/10 text-amber-500 border-amber-500/30" },
  inactive:  { label: "Inactive",  icon: XCircle,       className: "bg-muted text-muted-foreground border-border" },
};

interface SubscriptionCardProps {
  planName: string;
  status: string;
  priceUsd: number;
  priceNgn: number;
  nextBillingDate: string | null;
  minuteQuota: number;
  minutesRemaining: number | null;
  isUnlimited: boolean;
  teamSeatsUsed: number;
  teamSeatsLimit: number;
  onUpgrade: () => void;
  onCancel: () => void;
  isCancelling: boolean;
  canUpgrade: boolean;
}

export default function SubscriptionCard({
  planName, status, priceUsd, priceNgn, nextBillingDate, minuteQuota,
  minutesRemaining, isUnlimited, teamSeatsUsed, teamSeatsLimit,
  onUpgrade, onCancel, isCancelling, canUpgrade,
}: SubscriptionCardProps) {
  const sc = STATUS_CFG[status] ?? STATUS_CFG.inactive;
  const SI = sc.icon;
  const isAutoRenewing = status === "active";
  const daysToRenewal = nextBillingDate ? differenceInCalendarDays(new Date(nextBillingDate), new Date()) : null;

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/[0.04] to-transparent overflow-hidden">
      <CardHeader className="flex flex-row items-start justify-between pb-3">
        <div>
          <CardTitle className="text-xl flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" />
            {planName}
          </CardTitle>
          <CardDescription className="mt-1">Your current subscription plan</CardDescription>
        </div>
        <Badge variant="outline" className={cn("border flex items-center gap-1.5 px-3 py-1", sc.className)}>
          <SI className={cn("w-3.5 h-3.5", status === "pending" && "animate-spin")} />
          {sc.label}
        </Badge>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Monthly cost</p>
            <p className="text-2xl font-bold text-foreground tabular-nums">
              ${priceUsd}
              <span className="text-sm font-normal text-muted-foreground">/mo</span>
            </p>
            {priceNgn > 0 && (
              <p className="text-xs text-muted-foreground mt-0.5">{formatNGN(priceNgn * 100)} billed monthly</p>
            )}
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Next billing date</p>
            <p className="text-lg font-semibold text-foreground flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              {nextBillingDate ? format(new Date(nextBillingDate), "MMM d, yyyy") : "—"}
            </p>
            {daysToRenewal != null && daysToRenewal >= 0 && isAutoRenewing && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {daysToRenewal === 0 ? "Renews today" : `Renews in ${daysToRenewal} day${daysToRenewal === 1 ? "" : "s"}`}
              </p>
            )}
          </div>
        </div>

        <Separator />

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1">
              <RefreshCw className="w-3 h-3" /> Auto-renew
            </p>
            <p className="text-sm font-medium text-foreground">{isAutoRenewing ? "On" : "Off"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1">
              <Timer className="w-3 h-3" /> Minutes included
            </p>
            <p className="text-sm font-medium text-foreground">
              {isUnlimited ? "Unlimited" : formatMinutes(minuteQuota)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1">
              <Users className="w-3 h-3" /> Team seats
            </p>
            <p className="text-sm font-medium text-foreground">
              {teamSeatsUsed} / {teamSeatsLimit === -1 ? "∞" : teamSeatsLimit}
            </p>
          </div>
        </div>

        {!isUnlimited && minutesRemaining != null && (
          <p className="text-xs text-muted-foreground">
            {formatMinutes(minutesRemaining)} remaining this cycle
          </p>
        )}

        <div className="flex flex-col sm:flex-row gap-2 pt-1">
          {canUpgrade && (
            <Button size="sm" onClick={onUpgrade} className="gap-1.5">
              <ArrowUp className="w-3.5 h-3.5" />
              Upgrade Plan
            </Button>
          )}
          {isAutoRenewing && (
            <Button size="sm" variant="outline" onClick={onCancel} disabled={isCancelling} className="gap-1.5">
              {isCancelling && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Cancel Subscription
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}