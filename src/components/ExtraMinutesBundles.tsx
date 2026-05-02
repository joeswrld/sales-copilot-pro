/**
 * ExtraMinutesBundles.tsx — "Need more minutes?" section for Billing page
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Zap, Clock } from "lucide-react";
import { MINUTE_BUNDLES } from "@/config/bundles";
import { USD_TO_NGN, formatNGN } from "@/config/plans";
import { useExtraMinutes } from "@/hooks/useExtraMinutes";
import { cn } from "@/lib/utils";

interface Props {
  isActivePlan: boolean;
  currentPlanKey: string;
  extraMinutes?: number;
  extraMinutesExpiresAt?: string | null;
}

export default function ExtraMinutesBundles({ isActivePlan, currentPlanKey, extraMinutes = 0, extraMinutesExpiresAt }: Props) {
  const { purchase, purchasingBundle, isPurchasing } = useExtraMinutes();

  if (!isActivePlan || currentPlanKey === "free") return null;

  return (
    <Card className="border-accent/20">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Plus className="w-5 h-5 text-accent" />
          Need More Minutes?
        </CardTitle>
        <CardDescription>
          Buy extra minutes — they'll be added to your current cycle instantly.
          {extraMinutes > 0 && (
            <span className="ml-1 text-accent font-medium">
              You have {extraMinutes} extra minutes active.
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
