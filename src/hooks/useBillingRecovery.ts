/**
 * useBillingRecovery.ts
 *
 * Hook for the Failed Renewal Recovery & Grace Period System.
 * Provides full billing state including grace period info,
 * retry payment, update card, and countdown timer.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

// ── Types ──────────────────────────────────────────────────────────────────

export type BillingRecoveryStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "grace_period"
  | "cancelled"
  | "expired"
  | "none";

export interface BillingRecoveryState {
  hasSubscription: boolean;
  subscriptionId: string | null;
  subscriptionStatus: BillingRecoveryStatus;
  planName: string;
  isInGracePeriod: boolean;
  gracePeriodEndsAt: string | null;
  graceRemainingHours: number;
  graceRemainingDays: number;
  canAccessPremium: boolean;
  retryCount: number;
  nextRetryAt: string | null;
  lastPaymentAttempt: string | null;
  paymentFailureReason: string | null;
  nextPaymentDate: string | null;
  // Derived
  isUrgent: boolean;       // < 24h remaining
  isCritical: boolean;     // < 48h remaining
  showWarningBanner: boolean;
}

// ── Countdown Timer ────────────────────────────────────────────────────────

function useCountdown(endDate: string | null) {
  const [remaining, setRemaining] = useState<{
    days: number; hours: number; minutes: number; seconds: number;
  } | null>(null);

  useEffect(() => {
    if (!endDate) { setRemaining(null); return; }

    const update = () => {
      const diff = new Date(endDate).getTime() - Date.now();
      if (diff <= 0) { setRemaining({ days: 0, hours: 0, minutes: 0, seconds: 0 }); return; }
      const days    = Math.floor(diff / 86_400_000);
      const hours   = Math.floor((diff % 86_400_000) / 3_600_000);
      const minutes = Math.floor((diff % 3_600_000) / 60_000);
      const seconds = Math.floor((diff % 60_000) / 1_000);
      setRemaining({ days, hours, minutes, seconds });
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [endDate]);

  return remaining;
}

// ── Main Hook ──────────────────────────────────────────────────────────────

export function useBillingRecovery() {
  const { user } = useAuth();
  const qc = useQueryClient();

  // Fetch billing status from DB function
  const statusQuery = useQuery({
    queryKey: ["billing-recovery-status", user?.id],
    queryFn: async (): Promise<BillingRecoveryState> => {
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await (supabase as any).rpc("get_billing_status_for_user", {
        p_user_id: user.id,
      });

      if (error) throw error;

      const d = data as any;
      const graceHours = d.grace_remaining_hours || 0;
      const graceDays  = graceHours / 24;

      return {
        hasSubscription:      d.has_subscription ?? false,
        subscriptionId:       d.subscription_id  ?? null,
        subscriptionStatus:   (d.subscription_status ?? "none") as BillingRecoveryStatus,
        planName:             d.plan_name ?? "free",
        isInGracePeriod:      d.is_in_grace_period ?? false,
        gracePeriodEndsAt:    d.grace_period_ends_at ?? null,
        graceRemainingHours:  graceHours,
        graceRemainingDays:   graceDays,
        canAccessPremium:     d.can_access_premium ?? false,
        retryCount:           d.retry_count ?? 0,
        nextRetryAt:          d.next_retry_at ?? null,
        lastPaymentAttempt:   d.last_payment_attempt ?? null,
        paymentFailureReason: d.payment_failure_reason ?? null,
        nextPaymentDate:      d.next_payment_date ?? null,
        isUrgent:             graceHours < 24 && graceHours > 0,
        isCritical:           graceHours < 48 && graceHours > 0,
        showWarningBanner:    d.is_in_grace_period || d.subscription_status === "past_due",
      };
    },
    enabled: !!user,
    staleTime: 60_000,
    refetchInterval: (q) => {
      const d = q.state.data as BillingRecoveryState | undefined;
      return d?.isInGracePeriod ? 60_000 : 5 * 60_000;
    },
  });

  // Retry payment manually
  const retryPayment = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const res = await fetch(
        `${(import.meta as any).env.VITE_SUPABASE_URL}/functions/v1/billing-recovery`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ action: "retry_payment" }),
        }
      );

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Retry failed");
      return data;
    },
    onSuccess: (data) => {
      if (data.success) {
        toast.success("🎉 Payment successful! Your plan has been fully restored.");
        qc.invalidateQueries({ queryKey: ["billing-recovery-status"] });
        qc.invalidateQueries({ queryKey: ["subscription"] });
        qc.invalidateQueries({ queryKey: ["effective-plan"] });
        qc.invalidateQueries({ queryKey: ["minute-usage"] });
      }
    },
    onError: (err: any) => {
      toast.error(err.message || "Payment retry failed. Please update your card.");
    },
  });

  // Update card (opens Paystack)
  const updateCard = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const res = await fetch(
        `${(import.meta as any).env.VITE_SUPABASE_URL}/functions/v1/billing-recovery`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ action: "update_card" }),
        }
      );

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to initiate card update");
      return data as { authorization_url: string; reference: string };
    },
    onSuccess: (data) => {
      window.location.href = data.authorization_url;
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to update card. Please try again.");
    },
  });

  // Grace period countdown
  const countdown = useCountdown(statusQuery.data?.gracePeriodEndsAt ?? null);

  // Invalidate on subscription changes
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`billing-recovery:${user.id}`)
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "subscriptions",
        filter: `user_id=eq.${user.id}`,
      }, () => {
        qc.invalidateQueries({ queryKey: ["billing-recovery-status"] });
        qc.invalidateQueries({ queryKey: ["subscription"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, qc]);

  const refetch = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["billing-recovery-status"] });
  }, [qc]);

  return {
    billingStatus:    statusQuery.data ?? null,
    isLoading:        statusQuery.isLoading,
    countdown,
    retryPayment,
    updateCard,
    refetch,
    isRetrying:       retryPayment.isPending,
    isUpdatingCard:   updateCard.isPending,
  };
}