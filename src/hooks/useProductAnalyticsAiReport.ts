/**
 * useProductAnalyticsAiReport.ts
 *
 * "Why did users stay / why did users leave" AI report for the Product
 * Analytics admin page. Combines frontend session/event activity with
 * backend business activity (subscriptions, churn, calls) for a chosen
 * time frame and asks Lovable AI Gateway to explain it, via the
 * `product-analytics-ai-report` edge function.
 */
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { AnalyticsRange } from "./useAdminAnalytics";
import type { PAFilters } from "./useProductAnalytics";

export interface ProductAiReport {
  summary: string;
  why_users_stayed: string[];
  why_users_left: string[];
  frontend_findings: string[];
  backend_findings: string[];
  recommended_actions: string[];
  confidence: "low" | "medium" | "high";
}

export interface ProductAiReportResult {
  report: ProductAiReport;
  context: unknown;
  cached: boolean;
  generated_at?: string;
}

export function useProductAnalyticsAiReport() {
  const generate = useMutation({
    mutationFn: async (
      { range, filters, useCache = true }: { range: AnalyticsRange; filters: PAFilters; useCache?: boolean },
    ): Promise<ProductAiReportResult> => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Not authenticated");

      const { data, error } = await supabase.functions.invoke("product-analytics-ai-report", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: {
          from: range.from.toISOString(),
          to: range.to.toISOString(),
          device: filters.device,
          browser: filters.browser,
          country: filters.country,
          path: filters.path,
          use_cache: useCache,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as ProductAiReportResult;
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "Failed to generate AI report"),
  });

  return { generate };
}