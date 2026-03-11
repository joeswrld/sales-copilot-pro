import { useNavigate } from "react-router-dom";
import { Zap, TrendingUp, Calendar, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useMeetingUsage } from "@/hooks/useMeetingUsage";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface MeetingUsageCardProps {
  variant?: "sidebar" | "banner" | "card" | "compact";
  className?: string;
}

export function MeetingUsageCard({ variant = "card", className }: MeetingUsageCardProps) {
  const { usage, isLoading } = useMeetingUsage();
  const navigate = useNavigate();

  if (isLoading || !usage) return null;

  // ── Sidebar variant: compact inline display ───────────────────────────────
  if (variant === "sidebar") {
    return (
      <div className={cn("px-3 pb-2", className)}>
        <div
          className={cn(
            "rounded-lg p-2.5 border text-xs cursor-pointer hover:opacity-90 transition-opacity",
            usage.isAtLimit
              ? "border-destructive/30 bg-destructive/5"
              : usage.isNearLimit
              ? "border-accent/30 bg-accent/5"
              : "border-border bg-secondary/30"
          )}
          onClick={() => navigate("/dashboard/billing")}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-medium text-foreground">Meetings</span>
            <span
              className={cn(
                "font-bold tabular-nums",
                usage.isAtLimit
                  ? "text-destructive"
                  : usage.isNearLimit
                  ? "text-accent"
                  : "text-primary"
              )}
            >
              {usage.isUnlimited ? "∞" : `${usage.used} / ${usage.limit}`}
            </span>
          </div>
          {!usage.isUnlimited && (
            <Progress
              value={usage.pct}
              className={cn(
                "h-1",
                usage.isAtLimit
                  ? "[&>div]:bg-destructive"
                  : usage.isNearLimit
                  ? "[&>div]:bg-accent"
                  : "[&>div]:bg-primary"
              )}
            />
          )}
          {usage.isUnlimited && (
            <p className="text-muted-foreground text-[10px]">Unlimited on {usage.planName}</p>
          )}
          {usage.isAtLimit && (
            <p className="text-destructive text-[10px] mt-1 font-medium">Limit reached · Upgrade</p>
          )}
          {usage.isNearLimit && !usage.isAtLimit && (
            <p className="text-accent text-[10px] mt-1">{Math.round(100 - usage.pct)}% remaining</p>
          )}
        </div>
      </div>
    );
  }

  // ── Compact variant: single line ──────────────────────────────────────────
  if (variant === "compact") {
    return (
      <div className={cn("flex items-center gap-3", className)}>
        <div className="flex-1">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-muted-foreground">Meetings this month</span>
            <span className="text-xs font-semibold">
              {usage.isUnlimited ? "∞ Unlimited" : `${usage.used} / ${usage.limit}`}
            </span>
          </div>
          {!usage.isUnlimited && (
            <Progress
              value={usage.pct}
              className={cn(
                "h-1.5",
                usage.isAtLimit
                  ? "[&>div]:bg-destructive"
                  : usage.isNearLimit
                  ? "[&>div]:bg-accent"
                  : ""
              )}
            />
          )}
        </div>
      </div>
    );
  }

  // ── Banner variant: horizontal card ──────────────────────────────────────
  if (variant === "banner") {
    if (usage.isUnlimited) {
      return (
        <div className={cn("glass rounded-xl p-4 flex items-center justify-between gap-4", className)}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Zap className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium">{usage.planName} Plan</p>
              <p className="text-xs text-muted-foreground">Unlimited meetings</p>
            </div>
          </div>
          <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">∞ Unlimited</span>
        </div>
      );
    }

    return (
      <div
        className={cn(
          "glass rounded-xl p-4 border",
          usage.isAtLimit
            ? "border-destructive/30 bg-destructive/5"
            : usage.isNearLimit
            ? "border-accent/30 bg-accent/5"
            : "border-border",
          className
        )}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", usage.isAtLimit ? "bg-destructive/10" : "bg-primary/10")}>
              <TrendingUp className={cn("w-4 h-4", usage.isAtLimit ? "text-destructive" : "text-primary")} />
            </div>
            <div>
              <p className="text-sm font-medium">{usage.planName} Plan — Meeting Usage</p>
              <p className="text-xs text-muted-foreground">
                Resets {format(usage.resetDate, "MMM d, yyyy")}
              </p>
            </div>
          </div>
          <span className={cn("text-sm font-bold", usage.isAtLimit ? "text-destructive" : usage.isNearLimit ? "text-accent" : "text-foreground")}>
            {usage.used} / {usage.limit}
          </span>
        </div>

        <Progress
          value={usage.pct}
          className={cn(
            "h-2",
            usage.isAtLimit ? "[&>div]:bg-destructive" : usage.isNearLimit ? "[&>div]:bg-accent" : ""
          )}
        />

        <div className="flex items-center justify-between mt-2">
          <span className="text-xs text-muted-foreground">
            {Math.round(usage.pct)}% of monthly limit used ·{" "}
            {usage.isAtLimit
              ? "No meetings remaining"
              : `${usage.isUnlimited ? "∞" : usage.remaining} remaining`}
          </span>
          {usage.isAtLimit && (
            <Button size="sm" variant="default" className="h-7 text-xs gap-1.5" onClick={() => navigate("/dashboard/billing")}>
              <Zap className="w-3 h-3" />
              Upgrade Plan
            </Button>
          )}
          {usage.isNearLimit && !usage.isAtLimit && (
            <button onClick={() => navigate("/dashboard/billing")} className="text-xs text-accent hover:underline flex items-center gap-1">
              Upgrade <ArrowUpRight className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Card variant: full usage card ─────────────────────────────────────────
  return (
    <div className={cn("glass rounded-xl p-5", className)}>
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <TrendingUp className="w-4 h-4 text-primary" />
        </div>
        <div>
          <h3 className="text-sm font-semibold">Meeting Usage</h3>
          <p className="text-xs text-muted-foreground">{usage.planName} Plan</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="text-center">
          <div className={cn("text-2xl font-bold font-display", usage.isAtLimit ? "text-destructive" : "text-foreground")}>
            {usage.used}
          </div>
          <div className="text-xs text-muted-foreground">Used</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold font-display text-primary">
            {usage.isUnlimited ? "∞" : usage.remaining}
          </div>
          <div className="text-xs text-muted-foreground">Remaining</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold font-display text-muted-foreground">
            {usage.isUnlimited ? "∞" : usage.limit}
          </div>
          <div className="text-xs text-muted-foreground">Limit</div>
        </div>
      </div>

      {!usage.isUnlimited && (
        <div className="space-y-1.5 mb-4">
          <Progress
            value={usage.pct}
            className={cn(
              "h-3",
              usage.isAtLimit ? "[&>div]:bg-destructive" : usage.isNearLimit ? "[&>div]:bg-accent" : ""
            )}
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{Math.round(usage.pct)}% used</span>
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              Resets {format(usage.resetDate, "MMM d")}
            </span>
          </div>
        </div>
      )}

      {usage.isUnlimited && (
        <div className="mb-4 p-3 rounded-lg bg-primary/5 border border-primary/10 text-center">
          <p className="text-sm text-primary font-medium">∞ Unlimited meetings on Scale</p>
          <p className="text-xs text-muted-foreground mt-0.5">No monthly limits apply</p>
        </div>
      )}

      {usage.isAtLimit && (
        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 mb-3">
          <p className="text-xs text-destructive font-medium mb-2">
            You've reached your monthly meeting limit. Upgrade to continue scheduling calls.
          </p>
          <Button
            size="sm"
            variant="default"
            className="w-full gap-1.5 text-xs h-8"
            onClick={() => navigate("/dashboard/billing")}
          >
            <Zap className="w-3 h-3" />
            Upgrade Your Plan
          </Button>
        </div>
      )}

      {usage.isNearLimit && !usage.isAtLimit && (
        <div className="p-3 rounded-lg bg-accent/10 border border-accent/20 mb-3">
          <p className="text-xs text-accent-foreground mb-2">
            You're using {Math.round(usage.pct)}% of your monthly limit. Consider upgrading.
          </p>
          <button
            onClick={() => navigate("/dashboard/billing")}
            className="text-xs text-accent hover:underline flex items-center gap-1"
          >
            View upgrade options <ArrowUpRight className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
}