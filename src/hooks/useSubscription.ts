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

export function useSubscription() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

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

  const subscribe = useMutation({
    mutationFn: async (planKey: string = "starter") => {
      const callbackUrl = `${window.location.origin}/dashboard/billing?success=true`;
      const { data, error } = await supabase.functions.invoke(
        "paystack-create-subscription",
        { body: { callback_url: callbackUrl, plan_key: planKey } }
      );
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as { authorization_url: string; reference: string };
    },
    onSuccess: (data) => {
      window.location.href = data.authorization_url;
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to start subscription");
    },
  });

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
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to cancel subscription");
    },
  });

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

  const changePlan = useMutation({
    mutationFn: async (newPlanKey: string) => {
      const callbackUrl = `${window.location.origin}/dashboard/billing?upgraded=true`;
      const { data, error } = await supabase.functions.invoke(
        "paystack-upgrade-subscription",
        { body: { new_plan_key: newPlanKey, callback_url: callbackUrl } }
      );
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as { authorization_url: string; reference: string };
    },
    onSuccess: (data) => {
      window.location.href = data.authorization_url;
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to change plan");
    },
  });

  const verifyPayment = useMutation({
    mutationFn: async (reference?: string | null) => {
      const { data, error } = await supabase.functions.invoke("paystack-sync-subscription", {
        body: { reference: reference || null },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as { updated: boolean };
    },
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ["subscription"] });
      await queryClient.invalidateQueries({ queryKey: ["subscription-transactions"] });
      if (data.updated) {
        toast.success("Payment verified and subscription activated");
      }
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to verify payment");
    },
  });

  const transactionsQuery = useQuery({
    queryKey: ["subscription-transactions", user?.id],
    queryFn: async (): Promise<SubscriptionTransaction[]> => {
      if (!user) return [];
      const { data, error } = await supabase.functions.invoke("paystack-sync-subscription", {
        body: {},
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return ((data as any)?.transactions ?? []) as SubscriptionTransaction[];
    },
    enabled: !!user,
    refetchInterval: 15000,
  });

  const pendingSyncQuery = useQuery({
    queryKey: ["subscription-pending-sync", user?.id, query.data?.status],
    queryFn: async () => {
      if (!user || query.data?.status !== "pending") return null;
      const { data, error } = await supabase.functions.invoke("paystack-sync-subscription", {
        body: {},
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      if ((data as any)?.updated) {
        await queryClient.invalidateQueries({ queryKey: ["subscription"] });
      }
      return data;
    },
    enabled: !!user && query.data?.status === "pending",
    refetchInterval: 8000,
  });

  const getCurrentPlanKey = () => {
    const planName = query.data?.plan_name?.toLowerCase() || "";
    if (planName.includes("scale")) return "scale";
    if (planName.includes("growth")) return "growth";
    if (planName.includes("starter")) return "starter";
    return "free";
  };

  return {
    subscription: query.data,
    isLoading: query.isLoading,
    subscribe,
    cancelSubscription,
    changePlan,
    previewPlanChange,
    verifyPayment,
    isActive: query.data?.status === "active",
    refetch: query.refetch,
    currentPlanKey: getCurrentPlanKey(),
    transactions: transactionsQuery.data ?? [],
    isTransactionsLoading: transactionsQuery.isLoading,
    isSyncingPending: pendingSyncQuery.isFetching,
  };
}
