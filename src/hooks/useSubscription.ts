// src/hooks/useSubscription.ts
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

export interface BillingState {
  billingStatus: "active" | "inactive" | "past_due";
  planType: string;
  latestPayment: PaymentRecord | null;
  hasIncompleteCheckout: boolean;
  pendingPlanKey: string | null;
}

// ── Serialized session refresh ────────────────────────────────────────────────
// Prevents auth lock contention (React Strict Mode double-invokes effects,
// causing multiple concurrent refreshSession() calls that fight over the same
// IndexedDB lock and emit "Lock was not released within 5000ms" warnings).
// All concurrent callers share a single in-flight promise instead.
let _refreshPromise: Promise<string> | null = null;

async function getSessionToken(): Promise<string> {
  const { data: { session }, error } = await supabase.auth.getSession();

  if (!error && session?.access_token) {
    const expiresAt = session.expires_at ?? 0;
    const nowSeconds = Math.floor(Date.now() / 1000);
    // Refresh if token expires within 10 minutes
    if (expiresAt - nowSeconds >= 600) {
      return session.access_token;
    }
  }

  // Deduplicate concurrent refresh calls — all waiters share the same promise
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

// ── Invoke edge function with guaranteed fresh auth token ─────────────────────
// Retries once with a forced refresh on 401.
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

  // If 401, force-refresh and retry once
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
      // Force fresh token to avoid 401 from edge function's server-side JWT validation
      const { data: refreshData, error: refreshErr } = await supabase.auth.refreshSession();
      if (refreshErr || !refreshData.session?.access_token) {
        throw new Error("Session expired — please sign in again.");
      }
      const freshToken = refreshData.session.access_token;

      const result = await supabase.functions.invoke("paystack-create-subscription", {
        body: {
          callback_url: `${window.location.origin}/dashboard/billing`,
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
      const { data: refreshData, error: refreshErr } = await supabase.auth.refreshSession();
      if (refreshErr || !refreshData.session?.access_token) {
        throw new Error("Session expired — please sign in again.");
      }
      const freshToken = refreshData.session.access_token;

      const result = await supabase.functions.invoke("paystack-cancel-subscription", {
        body: {
          subscription_code: query.data.paystack_subscription_code,
          email_token: query.data.paystack_email_token,
        },
        headers: { Authorization: `Bearer ${freshToken}` },
      });
      if (result.error) throw new Error(result.error.message ?? "Failed to cancel subscription");
      if ((result.data as any)?.error) throw new Error((result.data as any).error);
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
  // FIX: Force a fresh session refresh before calling the edge function.
  // The edge function's resolveUser() calls admin.auth.getUser(token) which
  // validates the token server-side. If the stored token is near-expiry or
  // stale, this fails → 401. Forcing a refresh here guarantees a fresh JWT.
  const previewPlanChange = useMutation({
    mutationFn: async (newPlanKey: string): Promise<PlanChangePreview> => {
      // Force fresh token — do NOT use getSessionToken() cache here
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
      // Force fresh token same as previewPlanChange
      const { data: refreshData, error: refreshErr } = await supabase.auth.refreshSession();
      if (refreshErr || !refreshData.session?.access_token) {
        throw new Error("Session expired — please sign in again.");
      }
      const freshToken = refreshData.session.access_token;

      const result = await supabase.functions.invoke("paystack-upgrade-subscription", {
        body: {
          new_plan_key: newPlanKey,
          callback_url: `${window.location.origin}/dashboard/billing`,
        },
        headers: { Authorization: `Bearer ${freshToken}` },
      });
      if (result.error) throw new Error(result.error.message ?? "Failed to change plan");
      if ((result.data as any)?.error) throw new Error((result.data as any).error);
      return result.data as { authorization_url: string; reference: string };
    },
    onSuccess: (data) => {
      sessionStorage.setItem("fixsense_pending_payment_ref", data.reference);
      window.location.href = data.authorization_url;
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to change plan");
    },
  });

  // ── Mark abandoned ─────────────────────────────────────────────────────
  const markAbandoned = useMutation({
    mutationFn: async (reference: string) => {
      const { data, error } = await invokeWithAuth("paystack-sync-subscription", {
        mark_abandoned: true,
        reference,
      });
      if (error) throw new Error(error.message ?? "Failed to mark abandoned");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["latest-payment"] });
    },
  });

  // ── Verify payment after redirect ──────────────────────────────────────
  const verifyPayment = useMutation({
    mutationFn: async (options?: { reference?: string | null; includeTransactions?: boolean }) => {
      const { data, error } = await invokeWithAuth("paystack-sync-subscription", {
        reference: options?.reference ?? null,
        include_transactions: options?.includeTransactions ?? false,
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
  // FIX: Delay initial fetch by 800ms so the auth lock settles after mount.
  // React Strict Mode double-invokes effects, causing multiple concurrent
  // refreshSession() calls that fight over the same lock and produce 401s.
  const transactionsQuery = useQuery({
    queryKey: ["subscription-transactions", user?.id],
    queryFn: async (): Promise<SubscriptionTransaction[]> => {
      if (!user) return [];
      // Wait for auth lock to settle before hitting the edge function
      await new Promise((r) => setTimeout(r, 800));
      const { data, error } = await invokeWithAuth("paystack-sync-subscription", {
        include_transactions: true,
      });
      if (error) throw new Error(error.message ?? "Failed to load transactions");
      if ((data as any)?.error) throw new Error((data as any).error);
      return ((data as any)?.transactions ?? []) as SubscriptionTransaction[];
    },
    enabled: !!user,
    refetchInterval: 15000,
    retry: 1,
  });

  // ── Pending sync ───────────────────────────────────────────────────────
  // FIX: Delay initial fetch by 1200ms for the same auth lock reason above.
  const pendingSyncQuery = useQuery({
    queryKey: ["subscription-pending-sync", user?.id, query.data?.status],
    queryFn: async () => {
      if (!user || query.data?.status !== "pending") return null;
      // Wait for auth lock to settle before hitting the edge function
      await new Promise((r) => setTimeout(r, 1200));
      const { data, error } = await invokeWithAuth("paystack-sync-subscription", {
        include_transactions: false,
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
    refetchInterval: 8000,
    retry: 1,
  });

  const getCurrentPlanKey = () => {
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
