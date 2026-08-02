/**
 * SubscriptionCard.tsx — the "what am I paying for, and when" card.
 */

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  onCancel: (reason?: string, feedback?: string) => void;
  isCancelling: boolean;
  canUpgrade: boolean;
  /** True once the user has already cancelled — access continues until cancelDate */
  cancelAtPeriodEnd?: boolean;
  /** End of the current billing period, when cancelAtPeriodEnd is true */
  cancelDate?: string | null;
}

const CANCEL_REASONS = [
  { value: "too_expensive",   label: "It's too expensive" },
  { value: "not_using",       label: "I'm not using it enough" },
  { value: "missing_feature", label: "Missing a feature I need" },
  { value: "switching",       label: "Switching to another tool" },
  { value: "technical",       label: "Technical issues or bugs" },
  { value: "temporary",       label: "Just pausing for now" },
  { value: "other",           label: "Other" },
];

const RETENTION_OFFERS: Record<string, { title: string; body: string }> = {
  too_expensive: {
    title: "Would a smaller plan work better?",
    body: "Instead of cancelling, you can switch to a lower tier and keep your calls, transcripts and AI summaries — at a lower monthly cost.",
  },
  not_using: {
    title: "Let's make it worth it",
    body: "Turn on auto-join so Fixsense records and summarises every meeting for you automatically — most low-usage teams double their usage within a week.",
  },
  missing_feature: {
    title: "Tell us what's missing",
    body: "Share the feature you need below. Our team reviews every request weekly and prioritises what paying customers ask for.",
  },
  switching: {
    title: "Before you go",
    body: "Fixsense keeps your full call history, deal intelligence and coaching clips. Staying on a lower plan preserves all of it instead of losing access.",
  },
  technical: {
    title: "Let us fix it first",
    body: "Describe the issue below and we'll investigate right away — most reported issues are resolved within 48 hours.",
  },
  temporary: {
    title: "Pausing? Keep your data",
    body: "Downgrading instead of cancelling keeps your recordings, transcripts and deal history intact and ready for when you're back.",
  },
  other: {
    title: "Anything we can do?",
    body: "Tell us a little more below — it genuinely shapes what we build next. You can still continue with cancellation.",
  },
};

export default function SubscriptionCard({
  planName, status, priceUsd, priceNgn, nextBillingDate, minuteQuota,
  minutesRemaining, isUnlimited, teamSeatsUsed, teamSeatsLimit,
  onUpgrade, onCancel, isCancelling, canUpgrade,
  cancelAtPeriodEnd, cancelDate,
}: SubscriptionCardProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [step, setStep] = useState<"reason" | "offer" | "confirm">("reason");
  const [reason, setReason] = useState<string>("");
  const [feedback, setFeedback] = useState("");
  const sc = STATUS_CFG[status] ?? STATUS_CFG.inactive;
  const SI = sc.icon;
  const isAutoRenewing = status === "active" && !cancelAtPeriodEnd;
  const daysToRenewal = nextBillingDate ? differenceInCalendarDays(new Date(nextBillingDate), new Date()) : null;
  const cancelDaysLeft = cancelDate ? differenceInCalendarDays(new Date(cancelDate), new Date()) : null;

  const openCancelFlow = () => {
    setStep("reason");
    setReason("");
    setFeedback("");
    setConfirmOpen(true);
  };

  const handleConfirmCancel = () => {
    setConfirmOpen(false);
    onCancel(
      CANCEL_REASONS.find((r) => r.value === reason)?.label ?? reason ?? undefined,
      feedback.trim() || undefined,
    );
  };

  const offer = RETENTION_OFFERS[reason] ?? RETENTION_OFFERS.other;

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
        {cancelAtPeriodEnd && (
          <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3">
            <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-sm text-foreground">
              Your subscription is cancelled and won't renew.{" "}
              {cancelDate && (
                <>
                  You'll keep full access until{" "}
                  <strong>{format(new Date(cancelDate), "MMM d, yyyy")}</strong>
                  {cancelDaysLeft != null && cancelDaysLeft >= 0 && (
                    <> ({cancelDaysLeft === 0 ? "today" : `${cancelDaysLeft} day${cancelDaysLeft === 1 ? "" : "s"} left`})</>
                  )}.
                </>
              )}
            </p>
          </div>
        )}

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
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
              {cancelAtPeriodEnd ? "Access ends" : "Next billing date"}
            </p>
            <p className="text-lg font-semibold text-foreground flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              {(cancelAtPeriodEnd ? cancelDate : nextBillingDate)
                ? format(new Date((cancelAtPeriodEnd ? cancelDate : nextBillingDate)!), "MMM d, yyyy")
                : "—"}
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
            <Button size="sm" variant="outline" onClick={() => setConfirmOpen(true)} disabled={isCancelling} className="gap-1.5">
              {isCancelling && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Cancel Subscription
            </Button>
          )}
        </div>
      </CardContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel your subscription?</AlertDialogTitle>
            <AlertDialogDescription>
              Your {planName} plan won't renew{nextBillingDate ? ` on ${format(new Date(nextBillingDate), "MMM d, yyyy")}` : ""}.
              {" "}Cancellation takes effect at the end of your current billing period — you'll keep full access
              and all your minutes until then. You won't be charged again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isCancelling}>Keep Subscription</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmCancel} disabled={isCancelling} className="gap-1.5">
              {isCancelling && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Yes, Cancel Subscription
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}