/**
 * LiveUsageAlert.tsx — Real-time usage monitoring during live calls
 * 
 * Shows warning/critical/exhausted banners with upgrade + bundle CTAs.
 * Supports mid-call top-up via inline modal.
 */

import { useState, useEffect, useRef } from "react";
import { AlertTriangle, Clock, XCircle, ArrowUp, Plus, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useMinuteUsage } from "@/hooks/useMinuteUsage";
import { MINUTE_BUNDLES } from "@/config/bundles";
import { USD_TO_NGN, formatNGN, formatMinutes } from "@/config/plans";
import { useExtraMinutes } from "@/hooks/useExtraMinutes";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

type AlertLevel = "none" | "warning" | "critical" | "exhausted";

function getAlertLevel(remaining: number, total: number, isUnlimited: boolean): AlertLevel {
  if (isUnlimited) return "none";
  if (remaining <= 0) return "exhausted";
  const pct = (remaining / total) * 100;
  if (pct <= 5 || remaining <= 3) return "critical";
  if (pct <= 20 || remaining <= 10) return "warning";
  return "none";
}

export default function LiveUsageAlert() {
  const { usage } = useMinuteUsage();
  const { purchase, isPurchasing, purchasingBundle } = useExtraMinutes();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);
  const [showBundleModal, setShowBundleModal] = useState(false);
  const lastAlertRef = useRef<AlertLevel>("none");

  const remaining = usage ? (usage.isUnlimited ? Infinity : usage.minutesRemaining) : Infinity;
  const total = usage?.minuteLimit ?? 30;
  const isUnlimited = usage?.isUnlimited ?? true;
  const level = getAlertLevel(remaining as number, total, isUnlimited);

  // Reset dismissed when level escalates
  useEffect(() => {
    if (level !== "none" && level !== lastAlertRef.current) {
      if (
        (lastAlertRef.current === "none") ||
        (lastAlertRef.current === "warning" && (level === "critical" || level === "exhausted")) ||
        (lastAlertRef.current === "critical" && level === "exhausted")
      ) {
        setDismissed(false);
      }
    }
    lastAlertRef.current = level;
  }, [level]);

  if (level === "none" || (dismissed && level !== "exhausted")) return null;

  const remainingLabel = formatMinutes(remaining as number);

  return (
    <>
      {/* Banner */}
      <div
        className={cn(
          "relative px-4 py-3 rounded-xl flex items-center gap-3 text-sm font-medium animate-in fade-in slide-in-from-top-2",
          level === "warning" && "bg-amber-500/10 border border-amber-500/30 text-amber-400",
          level === "critical" && "bg-destructive/10 border border-destructive/30 text-destructive",
          level === "exhausted" && "bg-destructive/20 border border-destructive/50 text-destructive"
        )}
      >
        {level === "warning" && <AlertTriangle className="w-4 h-4 shrink-0" />}
        {level === "critical" && <Clock className="w-4 h-4 shrink-0 animate-pulse" />}
        {level === "exhausted" && <XCircle className="w-4 h-4 shrink-0" />}

        <span className="flex-1">
          {level === "warning" && `⚠️ You have ${remainingLabel} left`}
          {level === "critical" && `⏳ ${remainingLabel} left — call may stop`}
          {level === "exhausted" && "You've run out of minutes"}
        </span>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            variant="default"
            className="h-7 text-xs"
            onClick={() => navigate("/billing")}
          >
            <ArrowUp className="w-3 h-3 mr-1" />
            Upgrade
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => setShowBundleModal(true)}
          >
            <Plus className="w-3 h-3 mr-1" />
            Buy Minutes
          </Button>
          {level !== "exhausted" && (
            <button
              onClick={() => setDismissed(true)}
              className="p-1 rounded hover:bg-background/50"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Mid-call bundle purchase modal */}
      <Dialog open={showBundleModal} onOpenChange={setShowBundleModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5 text-accent" />
              Buy Extra Minutes
            </DialogTitle>
            <DialogDescription>
              Purchase instantly — minutes are added without leaving your call.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2 mt-2">
            {MINUTE_BUNDLES.map((bundle) => {
              const isLoading = isPurchasing && purchasingBundle === bundle.minutes;
              return (
                <div
                  key={bundle.minutes}
                  className={cn(
                    "p-3 rounded-lg border transition-colors",
                    bundle.popular ? "border-accent bg-accent/5" : "border-border"
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-sm text-foreground">{bundle.label}</span>
                    {bundle.popular && (
                      <Badge variant="default" className="text-[10px] px-1 py-0">Popular</Badge>
                    )}
                  </div>
                  <p className="text-lg font-bold text-foreground">${bundle.price_usd}</p>
                  <p className="text-[11px] text-muted-foreground mb-2">
                    {formatNGN(bundle.price_usd * USD_TO_NGN * 100)}
                  </p>
                  <Button
                    size="sm"
                    className="w-full h-7 text-xs"
                    variant={bundle.popular ? "default" : "outline"}
                    disabled={isPurchasing}
                    onClick={() => purchase.mutate(bundle.minutes)}
                  >
                    {isLoading ? (
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    ) : (
                      "Buy Now"
                    )}
                  </Button>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
