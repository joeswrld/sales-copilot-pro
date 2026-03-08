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
    // Auto-refetch every 5 seconds when status is pending
    refetchInterval: (query) => {
      const data = query.state.data as Subscription | null;
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
      if (data?.error) throw new Error(data.error);
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
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => {
      toast.success("Subscription cancelled");
      queryClient.invalidateQueries({ queryKey: ["subscription"] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to cancel subscription");
    },
  });

  return {
    subscription: query.data,
    isLoading: query.isLoading,
    subscribe,
    cancelSubscription,
    isActive: query.data?.status === "active",
  };
}
