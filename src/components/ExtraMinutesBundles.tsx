/**
 * ExtraMinutesBundles.tsx — v2 (Team Pool Aware)
 *
 * Changes from v1:
 *  - Uses useTeamMinutePool to know whether the user is an admin
 *  - Shows team context: "shared with N teammates"
 *  - Non-admin members see a read-only note instead of the buy button
 *  - After purchase, realtime subscription in useTeamMinutePool propagates
 *    the new extra_minutes to every team member's UI automatically
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Zap, Clock, Users, Lock } from "lucide-react";
import { MINUTE_BUNDLES } from "@/config/bundles";
import { USD_TO_NGN, formatNGN } from "@/config/plans";
import { useExtraMinutes } from "@/hooks/useExtraMinutes";
import { useTeamMinutePool } from "@/hooks/useTeamMinutePool";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

interface Props {
  /** Legacy props kept for backwards compatibility — pool is now resolved internally */
  isActivePlan?: boolean;
  currentPlanKey?: string;
  extraMinutes?: number;
  extraMinutesExpiresAt?: string | null;
}

export default function ExtraMinutesBundles(_props: Props) {
  const { purchase, purchasingBundle, isPurchasing } = useExtraMinutes();
  const { pool } = useTeamMinutePool();

  // Don't render if plan is not active or is free
  if (!pool) return null;
  if (pool.planName.toLowerCase() === "free") return null;

  // Non-admin members: show informational note instead of buy buttons
  if (!pool.isAdmin) {
    if (pool.extraMinutes === 0) return null;
    return (
      <Card className="border-accent/20">
        <CardContent className="pt-5 pb-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0 mt-0.5">
              <Zap className="w-4 h-4 text-accent" />
            </div>
            <div>
              <p className="text-sm font-semibold flex items-center gap-2">
                Extra minutes active
                {pool.isTeamPlan && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/20 flex items-center gap-1">
                    <Users className="w-2.5 h-2.5" /> Team
                  </span>
                )}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Your team has {pool.extraLabel} extra minutes added to the pool.
                {pool.extraMinutesExpiresAt && (
                  <span> Active until {format(new Date(pool.extraMinutesExpiresAt), "MMM d, yyyy")}.</span>
                )}
              </p>
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                <Lock className="w-3 h-3" /> Only the team admin can purchase additional minutes.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Admin view — full purchase UI
  return (
    <Card className="border-accent/20">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Plus className="w-5 h-5 text-accent" />
          Need More Minutes?
          {pool.isTeamPlan && (
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-accent/10 text-accent border border-accent/20 flex items-center gap-1.5 ml-1">
              <Users className="w-3 h-3" /> Shared with your team
            </span>
          )}
        </CardTitle>
        <CardDescription>
          Buy extra minutes — added to{" "}
          {pool.isTeamPlan ? "the team's shared pool" : "your account"} instantly.
          {pool.extraMinutes > 0 && (
            <span className="ml-1 text-accent font-medium">
              You have {pool.extraLabel} extra minutes active
              {pool.extraMinutesExpiresAt && (
                <> until {format(new Date(pool.extraMinutesExpiresAt), "MMM d")}</>
              )}.
            </span>
          )}
          {pool.isTeamPlan && (
            <span className="block mt-1 text-xs text-muted-foreground">
              All team members share the same pool — extra minutes benefit everyone.
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {MINUTE_BUNDLES.map((bundle) => {
            const isLoading = isPurchasing && purchasingBundle === bundle.minutes;
            return (
              <div
                key={bundle.minutes}
                className={cn(
                  "p-4 rounded-lg border transition-colors hover:border-accent/50",
                  bundle.popular ? "border-accent bg-accent/5" : "border-border"
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-accent" />
                    <span className="font-semibold text-foreground">{bundle.label}</span>
                  </div>
                  {bundle.popular && (
                    <Badge variant="default" className="text-[10px] px-1.5 py-0">
                      Popular
                    </Badge>
                  )}
                </div>
                <p className="text-xl font-bold text-foreground mb-0.5">
                  ${bundle.price_usd}
                </p>
                <p className="text-xs text-muted-foreground mb-3">
                  {formatNGN(bundle.price_usd * USD_TO_NGN * 100)}
                </p>
                {pool.isTeamPlan && (
                  <p className="text-[10px] text-accent/70 mb-2 flex items-center gap-1">
                    <Users className="w-2.5 h-2.5" /> Shared with team
                  </p>
                )}
                <Button
                  size="sm"
                  className="w-full"
                  variant={bundle.popular ? "default" : "outline"}
                  disabled={isPurchasing}
                  onClick={() => purchase.mutate(bundle.minutes)}
                >
                  {isLoading ? (
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Zap className="w-3.5 h-3.5 mr-1.5" />
                  )}
                  Buy Now
                </Button>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}