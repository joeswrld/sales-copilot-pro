/**
 * CheckoutDialog.tsx
 *
 * Pre-payment confirmation shown before we redirect to Paystack.
 * Fixsense's checkout is Paystack Standard (full-page redirect, not an
 * inline popup) — see subscribe/changePlan/purchase mutations. This
 * dialog is the transparent "here's exactly what you're about to pay"
 * step that happens right before that redirect fires.
 *
 * BREAKDOWN SOURCE OF TRUTH: subtotal, VAT, total, and the NGN amount
 * shown here are NEVER computed in this component. They come straight
 * from the server (paystack-create-subscription / paystack-upgrade-
 * subscription's preview_only mode, or purchase-minutes-bundle's
 * "preview" action) — the exact same computation the server uses when
 * it actually charges Paystack. That guarantees this dialog can never
 * show a number that doesn't match what Paystack ends up charging.
 */

import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Link } from "react-router-dom";
import { Loader2, ShieldCheck, Lock, Info, Users, Timer, RefreshCw, Calendar, AlertTriangle } from "lucide-react";
import { format, addMonths } from "date-fns";
import { formatUSD, formatNGNAmount, type ServerBreakdown } from "@/config/checkout";
import { getTeamMembersLimit, getMinuteQuota, formatMinutes } from "@/config/plans";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export type CheckoutItem =
  | { kind: "plan"; planKey: string; planName: string; priceUsd: number; badge?: string | null }
  | { kind: "bundle"; minutes: number; label: string; priceUsd: number };

interface CheckoutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: CheckoutItem | null;
  /** Fires only once the ToS checkbox is checked. Dialog stays open + shows a spinner until redirect fires. */
  onConfirm: () => void;
  isProcessing: boolean;
}

export default function CheckoutDialog({ open, onOpenChange, item, onConfirm, isProcessing }: CheckoutDialogProps) {
  const [agreed, setAgreed] = useState(false);
  const [breakdown, setBreakdown] = useState<ServerBreakdown | null>(null);
  const [isLoadingBreakdown, setIsLoadingBreakdown] = useState(false);
  const [breakdownError, setBreakdownError] = useState<string | null>(null);

  // Fetch the exact server-computed breakdown whenever the dialog opens
  // for a new item. This is a read-only preview call — it never charges
  // anything or touches Paystack.
  useEffect(() => {
    if (!open || !item) {
      setBreakdown(null);
      setBreakdownError(null);
      return;
    }

    let cancelled = false;
    setIsLoadingBreakdown(true);
    setBreakdownError(null);

    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) throw new Error("Session expired — please sign in again.");

        let result;
        if (item.kind === "plan") {
          result = await supabase.functions.invoke("paystack-upgrade-subscription", {
            body: { new_plan_key: item.planKey, preview_only: true },
            headers: { Authorization: `Bearer ${session.access_token}` },
          });
          if (!result.error && !(result.data as any)?.error) {
            // paystack-upgrade-subscription's preview also works for a
            // brand-new subscription (proration collapses to full price
            // when there's no current paid plan), so we can reuse it here.
          }
        } else {
          result = await supabase.functions.invoke("purchase-minutes-bundle", {
            body: { action: "preview", minutes: item.minutes },
            headers: { Authorization: `Bearer ${session.access_token}` },
          });
        }

        if (result.error) throw new Error(result.error.message ?? "Failed to load pricing");
        if ((result.data as any)?.error) throw new Error((result.data as any).error);

        const serverBreakdown = (result.data as any)?.breakdown as ServerBreakdown | undefined;
        if (!serverBreakdown) throw new Error("Pricing unavailable");

        if (!cancelled) setBreakdown(serverBreakdown);
      } catch (err: any) {
        if (!cancelled) setBreakdownError(err.message || "Failed to load pricing");
      } finally {
        if (!cancelled) setIsLoadingBreakdown(false);
      }
    })();

    return () => { cancelled = true; };
  }, [open, item]);

  if (!item) return null;

  const isPlan = item.kind === "plan";
  const nextBillingDate = addMonths(new Date(), 1);

  const handleClose = (next: boolean) => {
    if (isProcessing) return; // don't let a stray click close it mid-redirect
    if (!next) setAgreed(false);
    onOpenChange(next);
  };

  const canConfirm = agreed && !isProcessing && !!breakdown && !isLoadingBreakdown;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
          <DialogTitle className="text-lg flex items-center gap-2">
            <Lock className="w-4 h-4 text-primary" />
            Confirm your purchase
          </DialogTitle>
          <DialogDescription>
            Review the details below before you're taken to Paystack to pay.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-5 space-y-5 max-h-[65vh] overflow-y-auto">
          {/* Selected item */}
          <div className="flex items-start justify-between gap-3 p-3.5 rounded-lg border border-border bg-secondary/20">
            <div>
              <div className="flex items-center gap-2">
                <p className="font-semibold text-foreground">
                  {isPlan ? item.planName : item.label}
                </p>
                {isPlan && item.badge && <Badge className="text-[10px]">{item.badge}</Badge>}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {isPlan ? "Monthly subscription plan" : "One-time extra minutes bundle"}
              </p>
            </div>
            <p className="text-lg font-bold text-foreground tabular-nums shrink-0">{formatUSD(item.priceUsd)}</p>
          </div>

          {/* Plan inclusions */}
          {isPlan && (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Timer className="w-3.5 h-3.5" />
                {formatMinutes(getMinuteQuota(item.planKey))}/mo included
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Users className="w-3.5 h-3.5" />
                {getTeamMembersLimit(item.planKey) === -1 ? "Unlimited" : `Up to ${getTeamMembersLimit(item.planKey)}`} seats
              </div>
            </div>
          )}
          {!isPlan && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Timer className="w-3.5 h-3.5" />
              {formatMinutes(item.minutes)} added instantly to your account
            </div>
          )}

          <Separator />

          {/* Price breakdown — always read from the server, never computed here */}
          {isLoadingBreakdown ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Calculating exact price…
            </div>
          ) : breakdownError ? (
            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-destructive/5 border border-destructive/20">
              <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                Couldn't load pricing: {breakdownError}. Please close this dialog and try again.
              </p>
            </div>
          ) : breakdown ? (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span className="tabular-nums text-foreground">{formatUSD(breakdown.subtotal_usd)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>VAT ({Math.round(breakdown.vat_rate * 100)}%)</span>
                <span className="tabular-nums text-foreground">{formatUSD(breakdown.vat_usd)}</span>
              </div>
              <Separator />
              <div className="flex justify-between font-semibold text-foreground text-base">
                <span>Total</span>
                <span className="tabular-nums">{formatUSD(breakdown.total_usd)}</span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground pt-0.5">
                <span>Charged in Naira at checkout</span>
                <span className="tabular-nums">{formatNGNAmount(breakdown.total_ngn)}</span>
              </div>
            </div>
          ) : null}

          {/* Frequency + renewal */}
          <div className="space-y-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <RefreshCw className="w-3.5 h-3.5 shrink-0" />
              {isPlan
                ? "Billed monthly · automatic renewal until cancelled"
                : "One-time purchase — does not renew"}
            </div>
            {isPlan && (
              <div className="flex items-center gap-2">
                <Calendar className="w-3.5 h-3.5 shrink-0" />
                First renewal on {format(nextBillingDate, "MMMM d, yyyy")}
              </div>
            )}
          </div>

          {/* Currency notice */}
          {breakdown && (
            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
              <Info className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                You are billed in USD. Your payment will be processed in NGN at the current exchange rate
                ({`₦${breakdown.exchange_rate.toLocaleString()}/$1`}).
                {isPlan && " Your subscription renews automatically each month until cancelled."}
              </p>
            </div>
          )}

          {/* Payment processor */}
          <div className="flex items-center justify-between p-3 rounded-lg border border-border">
            <div className="flex items-center gap-2 text-sm text-foreground font-medium">
              <ShieldCheck className="w-4 h-4 text-primary" />
              Paystack
            </div>
            <span className="text-xs text-muted-foreground">PCI-DSS compliant payment processor</span>
          </div>

          {/* Agreement */}
          <label className="flex items-start gap-2.5 cursor-pointer select-none">
            <Checkbox checked={agreed} onCheckedChange={(v) => setAgreed(v === true)} className="mt-0.5" />
            <span className="text-xs text-muted-foreground leading-relaxed">
              I agree to the{" "}
              <Link to="/terms" target="_blank" className="text-primary hover:underline">Terms of Service</Link>
              {" "}and{" "}
              <Link to="/privacy" target="_blank" className="text-primary hover:underline">Privacy Policy</Link>.
            </span>
          </label>
        </div>

        <DialogFooter className="px-6 py-4 border-t border-border bg-secondary/10 flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => handleClose(false)} disabled={isProcessing} className="sm:order-1 w-full sm:w-auto">
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={!canConfirm}
            className={cn("sm:order-2 w-full sm:w-auto", "gap-2")}
          >
            {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
            {isProcessing ? "Redirecting to Paystack…" : "Pay Securely"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}