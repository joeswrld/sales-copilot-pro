import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface Subscription {
  id: string;
  user_id: string;
  paystack_customer_code: string | null;
  paystack_subscription_code: string | null;
  paystack_email_token: string | null;
  plan_name: string;
  plan_price_usd: number | null;
  amount_kobo: number;
  currency: string;
  status: string;
  next_payment_date: string | null;
  card_last4: string | null;
  card_brand: string | null;
  created_at: string;
  updated_at: string;
}

export interface SubscriptionTransaction {
  reference: string;
  status: string;
  amount_kobo: number;
  amount_ngn: number;
  paid_at: string | null;
  created_at: string;
  currency: string;
  channel: string | null;
  gateway_response: string | null;
}

export interface PlanChangePreview {
  current_plan: string;
  new_plan: string;
  is_upgrade: boolean;
  is_downgrade: boolean;
  current_price_ngn: number;
  new_price_ngn: number;
  prorated_amount_ngn: number;
  credit_ngn: number;
  days_remaining: number;
  new_monthly_price_ngn: number;
  new_monthly_price_usd: number;
}

/**
 * Payment record from the payments table.
 * This is the source of truth for whether a checkout was completed.
 */
export interface PaymentRecord {
  id: string;
  user_id: string;
  plan_selected: string;
  status: "initialized" | "pending" | "success" | "failed" | "abandoned";
  paystack_reference: string | null;
  amount_kobo: number | null;
  currency: string;
  created_at: string;
  updated_at: string;
}

/**
 * Billing state derived from profile + subscription + latest payment.
 * This drives ALL UI decisions — never use raw subscription.status alone.
 */
export interface BillingState {
  /** Only "active" when a successful payment has been confirmed by webhook */
  billingStatus: "active" | "inactive" | "past_due";
  /** Current confirmed plan — only changes after webhook confirmation */
  planType: string;
  /** Latest payment attempt (if any) */
  latestPayment: PaymentRecord | null;
  /** True if there's an incomplete / abandoned checkout the user should retry */
  hasIncompleteCheckout: boolean;
  /** Plan the user was trying to subscribe to */
  pendingPlanKey: string | null;
}

export function useSubscription() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // ── Subscription row ───────────────────────────────────────────────────
  const query = useQuery({
    queryKey: ["subscription", user?.id],
    queryFn: async (): Promise<Subscription | null> => {
      if (!user) return null;
      const { data, error } = await (supabase
        .from("subscriptions" as any)
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle() as any);
      if (error) throw error;
      return data as Subscription | null;
    },
    enabled: !!user,
    refetchInterval: (q) => {
      const data = q.state.data as Subscription | null;
      return data?.status === "pending" ? 5000 : false;
    },
  });

  // ── Profile billing status (source of truth for plan) ─────────────────
  const profileQuery = useQuery({
    queryKey: ["billing-profile", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from("profiles")
        .select("plan_type, billing_status")
        .eq("id", user.id)
        .single();
      return data as { plan_type: string; billing_status: string } | null;
    },
    enabled: !!user,
    refetchInterval: 10_000,
  });

  // ── Latest payment record ──────────────────────────────────────────────
  const paymentQuery = useQuery({
    queryKey: ["latest-payment", user?.id],
    queryFn: async (): Promise<PaymentRecord | null> => {
      if (!user) return null;
      const { data } = await (supabase as any)
        .from("payments")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data as PaymentRecord | null;
    },
    enabled: !!user,
    refetchInterval: 10_000,
  });

  // ── Derived billing state ──────────────────────────────────────────────
  const billingState: BillingState = (() => {
    const profileBillingStatus = profileQuery.data?.billing_status ?? "inactive";
    const planType = profileQuery.data?.plan_type ?? "free";
    const latestPayment = paymentQuery.data ?? null;

    const billingStatus: BillingState["billingStatus"] =
      profileBillingStatus === "active"
        ? "active"
        : profileBillingStatus === "past_due"
        ? "past_due"
        : "inactive";

    const hasIncompleteCheckout =
      !!latestPayment &&
      (latestPayment.status === "initialized" ||
        latestPayment.status === "pending" ||
        latestPayment.status === "abandoned") &&
      billingStatus !== "active";

    return {
      billingStatus,
      planType,
      latestPayment,
      hasIncompleteCheckout,
      pendingPlanKey: hasIncompleteCheckout ? latestPayment?.plan_selected ?? null : null,
    };
  })();

  // ── Subscribe (new checkout) ───────────────────────────────────────────
  const subscribe = useMutation({
    mutationFn: async (planKey: string = "starter") => {
      const callbackUrl = `${window.location.origin}/dashboard/billing?reference={PAYSTACK_REFERENCE}`;
      const { data, error } = await supabase.functions.invoke(
        "paystack-create-subscription",
        { body: { callback_url: `${window.location.origin}/dashboard/billing`, plan_key: planKey } }
      );
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as { authorization_url: string; reference: string };
    },
    onSuccess: (data) => {
      // Store reference in sessionStorage so we can mark as abandoned if user returns without paying
      sessionStorage.setItem("fixsense_pending_payment_ref", data.reference);
      window.location.href = data.authorization_url;
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to start subscription");
    },
  });

  // ── Cancel subscription ────────────────────────────────────────────────
  const cancelSubscription = useMutation({
    mutationFn: async () => {
      if (!query.data?.paystack_subscription_code || !query.data?.paystack_email_token) {
        throw new Error("No active subscription to cancel");
      }
      const { data, error } = await supabase.functions.invoke(
        "paystack-cancel-subscription",
        {
          body: {
            subscription_code: query.data.paystack_subscription_code,
            email_token: query.data.paystack_email_token,
          },
        }
      );
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
    },
    onSuccess: () => {
      toast.success("Subscription cancelled");
      queryClient.invalidateQueries({ queryKey: ["subscription"] });
      queryClient.invalidateQueries({ queryKey: ["billing-profile"] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to cancel subscription");
    },
  });

  // ── Preview plan change ────────────────────────────────────────────────
  const previewPlanChange = useMutation({
    mutationFn: async (newPlanKey: string): Promise<PlanChangePreview> => {
      const { data, error } = await supabase.functions.invoke(
        "paystack-upgrade-subscription",
        { body: { new_plan_key: newPlanKey, preview_only: true } }
      );
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as PlanChangePreview;
    },
  });

  // ── Change plan ────────────────────────────────────────────────────────
  const changePlan = useMutation({
    mutationFn: async (newPlanKey: string) => {
      const { data, error } = await supabase.functions.invoke(
        "paystack-upgrade-subscription",
        { body: { new_plan_key: newPlanKey, callback_url: `${window.location.origin}/dashboard/billing` } }
      );
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as { authorization_url: string; reference: string };
    },
    onSuccess: (data) => {
      sessionStorage.setItem("fixsense_pending_payment_ref", data.reference);
      window.location.href = data.authorization_url;
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to change plan");
    },
  });

  // ── Mark abandoned (called when user returns without paying) ───────────
  const markAbandoned = useMutation({
    mutationFn: async (reference: string) => {
      const { data, error } = await supabase.functions.invoke("paystack-sync-subscription", {
        body: { mark_abandoned: true, reference },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["latest-payment"] });
    },
  });

  // ── Verify payment after redirect ──────────────────────────────────────
  const verifyPayment = useMutation({
    mutationFn: async (options?: { reference?: string | null; includeTransactions?: boolean }) => {
      const { data, error } = await supabase.functions.invoke("paystack-sync-subscription", {
        body: {
          reference: options?.reference ?? null,
          include_transactions: options?.includeTransactions ?? false,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as { updated: boolean };
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["subscription"] });
      await queryClient.invalidateQueries({ queryKey: ["billing-profile"] });
      await queryClient.invalidateQueries({ queryKey: ["latest-payment"] });
      await queryClient.invalidateQueries({ queryKey: ["effective-plan"] });
      await queryClient.invalidateQueries({ queryKey: ["meeting-usage"] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to verify payment");
    },
  });

  // ── Transaction history ────────────────────────────────────────────────
  const transactionsQuery = useQuery({
    queryKey: ["subscription-transactions", user?.id],
    queryFn: async (): Promise<SubscriptionTransaction[]> => {
      if (!user) return [];
      const { data, error } = await supabase.functions.invoke("paystack-sync-subscription", {
        body: { include_transactions: true },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return ((data as any)?.transactions ?? []) as SubscriptionTransaction[];
    },
    enabled: !!user,
    refetchInterval: 15000,
  });

  // ── Pending sync ───────────────────────────────────────────────────────
  const pendingSyncQuery = useQuery({
    queryKey: ["subscription-pending-sync", user?.id, query.data?.status],
    queryFn: async () => {
      if (!user || query.data?.status !== "pending") return null;
      const { data, error } = await supabase.functions.invoke("paystack-sync-subscription", {
        body: { include_transactions: false },
      });
      if (error) throw error;
      if ((data as any)?.updated) {
        await queryClient.invalidateQueries({ queryKey: ["subscription"] });
        await queryClient.invalidateQueries({ queryKey: ["billing-profile"] });
        await queryClient.invalidateQueries({ queryKey: ["latest-payment"] });
      }
      return data;
    },
    enabled: !!user && query.data?.status === "pending",
    refetchInterval: 8000,
  });

  const getCurrentPlanKey = () => {
    // Use profile billing_status + plan_type as source of truth
    if (billingState.billingStatus !== "active") return "free";
    return billingState.planType ?? "free";
  };

  return {
    subscription: query.data,
    isLoading: query.isLoading || profileQuery.isLoading || paymentQuery.isLoading,
    billingState,
    subscribe,
    cancelSubscription,
    changePlan,
    previewPlanChange,
    verifyPayment,
    markAbandoned,
    isActive: billingState.billingStatus === "active",
    refetch: () => {
      query.refetch();
      profileQuery.refetch();
      paymentQuery.refetch();
    },
    currentPlanKey: getCurrentPlanKey(),
    transactions: transactionsQuery.data ?? [],
    isTransactionsLoading: transactionsQuery.isLoading,
    isSyncingPending: pendingSyncQuery.isFetching,
  };
}