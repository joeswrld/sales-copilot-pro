// src/hooks/useSubscription.ts
// BILLING FIX v3:
//  1. Payment cancellation NEVER changes active_plan
//  2. Proper pending_plan / payment_status state machine
//  3. Only verified Paystack webhook/callback upgrades plan
//  4. "Retry" nudge only shown when subscription is ACTUALLY expired/inactive
//  5. markAbandoned now explicitly sets payment_status=cancelled and clears
//     pending_plan without touching active_plan or profiles.plan_type

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
  // ── New billing-state fields ──────────────────────────────────────
  /** The plan the user is actually on right now (never cleared on cancel) */
  active_plan?: string | null;
  /** The plan they tried to upgrade/switch to — cleared on cancel */
  pending_plan?: string | null;
  /** "idle" | "pending" | "success" | "cancelled" | "failed" */
  payment_status?: string | null;
  /** When the subscription access actually expires */
  expires_at?: string | null;
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

export interface PaymentRecord {
  id: string;
  user_id: string;
  plan_selected: string;
  status: "initialized" | "pending" | "success" | "failed" | "abandoned" | "cancelled";
  paystack_reference: string | null;
  amount_kobo: number | null;
  currency: string;
  created_at: string;
  updated_at: string;
}

export interface BillingState {
  /** The user's ACTUAL current plan (never downgraded by a cancel) */
  activePlanKey: string;
  /** True only if the subscription row has status="active" AND not expired */
  billingStatus: "active" | "inactive" | "past_due";
  planType: string;
  latestPayment: PaymentRecord | null;
  /**
   * True when there is an INCOMPLETE checkout that was neither verified as
   * successful NOR abandoned — and the subscription is NOT already active.
   * We do NOT show this banner if the user already has a paid plan.
   */
  hasIncompleteCheckout: boolean;
  pendingPlanKey: string | null;
  /** Was the last payment attempt explicitly cancelled by the user? */
  paymentCancelled: boolean;
}

// ── Serialized session refresh ────────────────────────────────────────────────
let _refreshPromise: Promise<string> | null = null;

async function getSessionToken(): Promise<string> {
  const { data: { session }, error } = await supabase.auth.getSession();

  if (!error && session?.access_token) {
    const expiresAt = session.expires_at ?? 0;
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (expiresAt - nowSeconds >= 600) {
      return session.access_token;
    }
  }

  if (!_refreshPromise) {
    _refreshPromise = supabase.auth
      .refreshSession()
      .then(({ data, error: refreshError }) => {
        if (refreshError) {
          console.error("Session refresh failed:", refreshError.message);
          throw new Error("Session expired — please sign in again.");
        }
        if (!data.session?.access_token) {
          throw new Error("No active session — please sign in again.");
        }
        return data.session.access_token;
      })
      .finally(() => {
        _refreshPromise = null;
      });
  }

  return _refreshPromise;
}

async function invokeWithAuth(
  fnName: string,
  body: Record<string, unknown>
): Promise<{ data: any; error: any }> {
  let token: string;

  try {
    token = await getSessionToken();
  } catch (err: any) {
    return {
      data: null,
      error: { message: err.message ?? "Authentication error" },
    };
  }

  const result = await supabase.functions.invoke(fnName, {
    body,
    headers: { Authorization: `Bearer ${token}` },
  });

  const is401 =
    result.error &&
    (String(result.error.message).includes("401") ||
      String(result.error.message).toLowerCase().includes("unauthorized") ||
      String(result.error.message).toLowerCase().includes("invalid jwt"));

  if (is401) {
    console.warn(`${fnName} returned 401 — forcing session refresh and retrying once`);
    try {
      const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError || !refreshData.session?.access_token) {
        throw new Error("Could not refresh session after 401");
      }
      return supabase.functions.invoke(fnName, {
        body,
        headers: { Authorization: `Bearer ${refreshData.session.access_token}` },
      });
    } catch (retryErr: any) {
      return {
        data: null,
        error: { message: retryErr.message ?? "Authentication retry failed" },
      };
    }
  }

  return result;
}

// ── Helper: is a subscription row actually active and not expired? ─────────────
function isSubscriptionCurrentlyActive(sub: Subscription | null): boolean {
  if (!sub) return false;
  if (sub.status !== "active") return false;
  if (sub.expires_at) {
    return new Date(sub.expires_at) > new Date();
  }
  // No expires_at = still active (Paystack controls renewal)
  return true;
}

// ── Normalize plan key helper ─────────────────────────────────────────────────
function normalizePlanKey(planName: string): string {
  const n = (planName ?? "").toLowerCase();
  if (n.includes("scale"))   return "scale";
  if (n.includes("growth"))  return "growth";
  if (n.includes("starter")) return "starter";
  return "free";
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
      return data?.status === "pending" ? 10_000 : 5 * 60_000;
    },
  });

  // ── Profile billing status ─────────────────────────────────────────────
  const profileQuery = useQuery({
    queryKey: ["billing-profile", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from("profiles")
        .select("plan_type, billing_status")
        .eq("id", user.id)
        .single();
      return data as unknown as { plan_type: string; billing_status: string } | null;
    },
    enabled: !!user,
    refetchInterval: 2 * 60_000,
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
    refetchInterval: 2 * 60_000,
  });

  // ── Derived billing state ──────────────────────────────────────────────
  const billingState: BillingState = (() => {
    const sub = query.data ?? null;
    const profileBillingStatus = profileQuery.data?.billing_status ?? "inactive";
    const planType = profileQuery.data?.plan_type ?? "free";
    const latestPayment = paymentQuery.data ?? null;

    // "Active" means the subscription row is active AND not expired
    const isReallyActive = isSubscriptionCurrentlyActive(sub);

    const billingStatus: BillingState["billingStatus"] = isReallyActive
      ? "active"
      : profileBillingStatus === "past_due"
      ? "past_due"
      : "inactive";

    // The plan the user is ACTUALLY on — prefer subscription row's active_plan
    // field; fall back to plan_name; then to profile plan_type.
    // This is NEVER cleared on payment cancellation.
    const activePlanKey =
      sub?.active_plan ??
      (isReallyActive ? normalizePlanKey(sub?.plan_name ?? "") : null) ??
      planType ??
      "free";

    // Payment-cancelled flag: set by markAbandoned, cleared on next success
    const paymentCancelled =
      (sub?.payment_status === "cancelled") ||
      (latestPayment?.status === "abandoned") ||
      (latestPayment?.status === "cancelled");

    // Only show the "incomplete checkout" banner when:
    // 1. There IS a pending payment record
    // 2. The subscription is NOT already active (user doesn't need the nudge)
    // 3. The payment was NOT explicitly cancelled
    const hasIncompleteCheckout =
      !!latestPayment &&
      (latestPayment.status === "initialized" || latestPayment.status === "pending") &&
      !isReallyActive &&
      !paymentCancelled;

    return {
      activePlanKey,
      billingStatus,
      planType,
      latestPayment,
      hasIncompleteCheckout,
      pendingPlanKey: hasIncompleteCheckout ? latestPayment?.plan_selected ?? null : null,
      paymentCancelled,
    };
  })();

  // ── Subscribe (new checkout) ───────────────────────────────────────────
  const subscribe = useMutation({
    mutationFn: async (planKey: string = "starter") => {
      const { data: refreshData, error: refreshErr } = await supabase.auth.refreshSession();
      if (refreshErr || !refreshData.session?.access_token) {
        throw new Error("Session expired — please sign in again.");
      }
      const freshToken = refreshData.session.access_token;

      const result = await supabase.functions.invoke("paystack-create-subscription", {
        body: {
          callback_url: `${window.location.origin}/billing`,
          plan_key: planKey,
        },
        headers: { Authorization: `Bearer ${freshToken}` },
      });
      if (result.error) throw new Error(result.error.message ?? "Failed to start subscription");
      if ((result.data as any)?.error) throw new Error((result.data as any).error);
      return result.data as { authorization_url: string; reference: string };
    },
    onSuccess: (data) => {
      sessionStorage.setItem("fixsense_pending_payment_ref", data.reference);
      // Store the CURRENT active plan so we can detect/restore if cancelled
      sessionStorage.setItem(
        "fixsense_pre_checkout_plan",
        billingState.activePlanKey
      );
      window.location.href = data.authorization_url;
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to start subscription");
    },
  });

  // ── Cancel subscription ────────────────────────────────────────────────
  const cancelSubscription = useMutation({
    mutationFn: async () => {
      const currentSub = query.data;
      if (!currentSub || currentSub.status === "cancelled") {
        throw new Error("No active subscription to cancel");
      }

      const { data: refreshData, error: refreshErr } = await supabase.auth.refreshSession();
      if (refreshErr || !refreshData.session?.access_token) {
        throw new Error("Session expired — please sign in again.");
      }
      const freshToken = refreshData.session.access_token;

      const result = await supabase.functions.invoke("paystack-cancel-subscription", {
        body: {
          subscription_code: currentSub.paystack_subscription_code ?? null,
          email_token: currentSub.paystack_email_token ?? null,
        },
        headers: { Authorization: `Bearer ${freshToken}` },
      });

      if (result.error) throw new Error(result.error.message ?? "Failed to cancel subscription");
      if ((result.data as any)?.error) throw new Error((result.data as any).error);
      return result.data;
    },
    onSuccess: () => {
      toast.success("Subscription cancelled successfully");
      queryClient.invalidateQueries({ queryKey: ["subscription"] });
      queryClient.invalidateQueries({ queryKey: ["billing-profile"] });
      queryClient.invalidateQueries({ queryKey: ["effective-plan"] });
      queryClient.invalidateQueries({ queryKey: ["minute-usage"] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to cancel subscription");
    },
  });

  // ── Preview plan change ────────────────────────────────────────────────
  const previewPlanChange = useMutation({
    mutationFn: async (newPlanKey: string): Promise<PlanChangePreview> => {
      const { data: refreshData, error: refreshErr } = await supabase.auth.refreshSession();
      if (refreshErr || !refreshData.session?.access_token) {
        throw new Error("Session expired — please sign in again.");
      }
      const freshToken = refreshData.session.access_token;

      const result = await supabase.functions.invoke("paystack-upgrade-subscription", {
        body: { new_plan_key: newPlanKey, preview_only: true },
        headers: { Authorization: `Bearer ${freshToken}` },
      });
      if (result.error) throw new Error(result.error.message ?? "Failed to load plan preview");
      if ((result.data as any)?.error) throw new Error((result.data as any).error);
      return result.data as PlanChangePreview;
    },
  });

  // ── Change plan ────────────────────────────────────────────────────────
  const changePlan = useMutation({
    mutationFn: async (newPlanKey: string) => {
      const { data: refreshData, error: refreshErr } = await supabase.auth.refreshSession();
      if (refreshErr || !refreshData.session?.access_token) {
        throw new Error("Session expired — please sign in again.");
      }
      const freshToken = refreshData.session.access_token;

      const result = await supabase.functions.invoke("paystack-upgrade-subscription", {
        body: {
          new_plan_key: newPlanKey,
          callback_url: `${window.location.origin}/billing`,
        },
        headers: { Authorization: `Bearer ${freshToken}` },
      });
      if (result.error) throw new Error(result.error.message ?? "Failed to change plan");
      if ((result.data as any)?.error) throw new Error((result.data as any).error);
      return result.data as { authorization_url: string; reference: string };
    },
    onSuccess: (data) => {
      sessionStorage.setItem("fixsense_pending_payment_ref", data.reference);
      sessionStorage.setItem(
        "fixsense_pre_checkout_plan",
        billingState.activePlanKey
      );
      window.location.href = data.authorization_url;
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to change plan");
    },
  });

  // ── Mark checkout as abandoned/cancelled ───────────────────────────────
  // KEY FIX: This ONLY marks the payment record and sets payment_status=cancelled.
  // It NEVER touches active_plan, profiles.plan_type, or subscription.status.
  const markAbandoned = useMutation({
    mutationFn: async (reference: string) => {
      // 1. Mark the payment row as abandoned (server-side)
      const { data, error } = await invokeWithAuth("paystack-sync-subscription", {
        mark_abandoned: true,
        reference,
        // Tell the edge function: do NOT touch active_plan
        preserve_active_plan: true,
      });
      if (error) throw new Error(error.message ?? "Failed to mark abandoned");

      // 2. Locally update ONLY payment_status on the subscription row
      //    Crucially: only update non-active rows (active subscriptions are untouched)
      if (user?.id) {
        await (supabase as any)
          .from("subscriptions")
          .update({
            payment_status: "cancelled",
            pending_plan: null,
          })
          .eq("user_id", user.id)
          .neq("status", "active"); // NEVER update an active subscription row
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["latest-payment"] });
      queryClient.invalidateQueries({ queryKey: ["subscription"] });
    },
    // Non-fatal — log but don't crash
    onError: (err: Error) => {
      console.warn("markAbandoned (non-fatal):", err.message);
    },
  });

  // ── Verify payment after redirect ──────────────────────────────────────
  const verifyPayment = useMutation({
    mutationFn: async (options?: { reference?: string | null; includeTransactions?: boolean }) => {
      const { data, error } = await invokeWithAuth("paystack-sync-subscription", {
        reference: options?.reference ?? null,
        include_transactions: options?.includeTransactions ?? false,
        // Ensure the edge function knows it can only UPGRADE, never downgrade
        respect_active_plan: true,
      });
      if (error) throw new Error(error.message ?? "Failed to verify payment");
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
      await new Promise((r) => setTimeout(r, 800));
      const { data, error } = await invokeWithAuth("paystack-sync-subscription", {
        include_transactions: true,
      });
      if (error) throw new Error(error.message ?? "Failed to load transactions");
      if ((data as any)?.error) throw new Error((data as any).error);
      return ((data as any)?.transactions ?? []) as SubscriptionTransaction[];
    },
    enabled: !!user,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    retry: 1,
  });

  // ── Pending sync ───────────────────────────────────────────────────────
  const pendingSyncQuery = useQuery({
    queryKey: ["subscription-pending-sync", user?.id, query.data?.status],
    queryFn: async () => {
      if (!user || query.data?.status !== "pending") return null;
      await new Promise((r) => setTimeout(r, 1500));
      const { data, error } = await invokeWithAuth("paystack-sync-subscription", {
        include_transactions: false,
        respect_active_plan: true,
      });
      if (error) throw new Error(error.message ?? "Sync failed");
      if ((data as any)?.updated) {
        await queryClient.invalidateQueries({ queryKey: ["subscription"] });
        await queryClient.invalidateQueries({ queryKey: ["billing-profile"] });
        await queryClient.invalidateQueries({ queryKey: ["latest-payment"] });
      }
      return data;
    },
    enabled: !!user && query.data?.status === "pending",
    refetchInterval: 20_000,
    retry: 1,
  });

  const getCurrentPlanKey = () => {
    return billingState.activePlanKey ?? "free";
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