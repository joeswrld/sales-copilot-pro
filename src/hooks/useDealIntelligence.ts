/**
 * useDealIntelligence.ts
 *
 * Provides "What Changed?" analysis by comparing the latest call
 * vs previous calls in a deal. Lightweight — uses Gemini Flash.
 */

import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface DealChangeAnalysis {
  direction: "improving" | "declining" | "stable";
  direction_explanation: string;
  next_best_action: string;
  new_objections: string[];
  new_stakeholders: string[];
  buying_signals: string[];
}

export function useDealIntelligence() {
  const analyzeChanges = useMutation({
    mutationFn: async (dealId: string): Promise<DealChangeAnalysis> => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Not authenticated");

      const { data, error } = await supabase.functions.invoke("analyze-deal-changes", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { deal_id: dealId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as DealChangeAnalysis;
    },
    onError: (err: any) => toast.error(err.message || "Analysis failed"),
  });

  return { analyzeChanges };
}
