/**
 * useExtraMinutes.ts — Hook for purchasing extra minute bundles
 */

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function useExtraMinutes() {
  const qc = useQueryClient();
  const [purchasingBundle, setPurchasingBundle] = useState<number | null>(null);

  const purchase = useMutation({
    mutationFn: async (minutes: number) => {
      setPurchasingBundle(minutes);
      
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      // Initialize payment
      const { data: initData, error: initError } = await supabase.functions.invoke(
        "purchase-minutes-bundle",
        {
          body: { action: "initialize", minutes },
        }
      );

      if (initError || !initData?.authorization_url) {
        throw new Error(initData?.error || "Failed to initialize payment");
      }

      // Store reference for verification on return
      sessionStorage.setItem("fixsense_bundle_ref", initData.reference);
      sessionStorage.setItem("fixsense_bundle_minutes", String(minutes));

      // Redirect to Paystack
      window.location.href = initData.authorization_url;
    },
    onError: (err: Error) => {
      setPurchasingBundle(null);
      toast.error(err.message || "Failed to purchase minutes");
    },
  });

  const verify = useMutation({
    mutationFn: async (reference: string) => {
      const { data, error } = await supabase.functions.invoke(
        "purchase-minutes-bundle",
        {
          body: { action: "verify", reference },
        }
      );

      if (error || !data?.success) {
        throw new Error(data?.error || "Verification failed");
      }

      return data;
    },
    onSuccess: (data) => {
      toast.success(`🎉 ${data.added} extra minutes added to your account!`);
      // Invalidate all usage queries
      qc.invalidateQueries({ queryKey: ["minute-usage"] });
      qc.invalidateQueries({ queryKey: ["team-minute-usage"] });
      qc.invalidateQueries({ queryKey: ["subscription"] });
      sessionStorage.removeItem("fixsense_bundle_ref");
      sessionStorage.removeItem("fixsense_bundle_minutes");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Payment verification failed");
    },
    onSettled: () => {
      setPurchasingBundle(null);
    },
  });

  return {
    purchase,
    verify,
    purchasingBundle,
    isPurchasing: purchase.isPending,
    isVerifying: verify.isPending,
  };
}
