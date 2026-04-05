/**
 * useDeals.ts
 *
 * Full data layer for the Deal Timeline system.
 * Handles: list, create, update, fetch deal+calls, generate AI summary,
 * attach calls to deals, timeline events.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

export type DealStageValue =
  | "discovery"
  | "demo"
  | "negotiation"
  | "proposal"
  | "won"
  | "lost"
  | "on_hold";

export interface Deal {
  id: string;
  owner_id: string;
  team_id: string | null;
  name: string;
  company: string | null;
  contact_name: string | null;
  contact_email: string | null;
  stage: DealStageValue;
  value: number | null;
  currency: string;
  probability: number | null;
  close_date: string | null;
  source: string | null;
  tags: string[];
  notes: string | null;
  deal_summary: string | null;
  deal_summary_at: string | null;
  sentiment_trend: "improving" | "declining" | "stable" | null;
  risk_score: number | null;
  next_step: string | null;
  next_step_due: string | null;
  created_at: string;
  updated_at: string;
}

export interface DealListItem extends Deal {
  call_count: number;
  last_call_at: string | null;
  avg_sentiment: number | null;
}

export interface DealCall {
  id: string;
  name: string;
  date: string;
  status: string | null;
  duration_minutes: number | null;
  sentiment_score: number | null;
  objections_count: number | null;
  platform: string | null;
  meeting_type: string | null;
  call_summary: string | null;
  next_steps: string[] | null;
  key_decisions: string[] | null;
  call_objections: any[] | null;
}

export interface DealSummary {
  id: string;
  deal_id: string;
  summary: string;
  call_count: number;
  key_themes: string[];
  open_objections: string[];
  buying_signals: string[];
  risks: string[];
  recommended_actions: string[];
  generated_at: string;
}

export interface DealTimelineEvent {
  id: string;
  deal_id: string;
  user_id: string | null;
  event_type: string;
  title: string;
  detail: string | null;
  metadata: Record<string, any>;
  happened_at: string;
}

export interface DealDetail {
  deal: Deal;
  calls: DealCall[];
  summary: DealSummary | null;
  events: DealTimelineEvent[];
}

// ─── Stage config ─────────────────────────────────────────────────────────────

export const DEAL_STAGE_CFG: Record<
  DealStageValue,
  { label: string; color: string; bg: string; icon: string; order: number }
> = {
  discovery:   { label: "Discovery",   color: "#60a5fa", bg: "rgba(96,165,250,.13)",  icon: "🔍", order: 0 },
  demo:        { label: "Demo",        color: "#a78bfa", bg: "rgba(167,139,250,.13)", icon: "🎯", order: 1 },
  negotiation: { label: "Negotiation", color: "#fbbf24", bg: "rgba(251,191,36,.13)",  icon: "🤝", order: 2 },
  proposal:    { label: "Proposal",    color: "#34d399", bg: "rgba(52,211,153,.13)",  icon: "📄", order: 3 },
  won:         { label: "Won",         color: "#22c55e", bg: "rgba(34,197,94,.13)",   icon: "🏆", order: 4 },
  lost:        { label: "Lost",        color: "#ef4444", bg: "rgba(239,68,68,.13)",   icon: "❌", order: 5 },
  on_hold:     { label: "On Hold",     color: "#94a3b8", bg: "rgba(148,163,184,.13)", icon: "⏸️", order: 6 },
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useDeals() {
  const { user } = useAuth();
  const qc = useQueryClient();

  // ── List all deals ──────────────────────────────────────────────────────────
  const { data: deals = [], isLoading } = useQuery({
    queryKey: ["deals", user?.id],
    queryFn: async (): Promise<DealListItem[]> => {
      const { data, error } = await (supabase as any).rpc("list_my_deals");
      if (error) throw error;
      return (data || []) as DealListItem[];
    },
    enabled: !!user,
    staleTime: 15_000,
  });

  // ── Get single deal with calls + summary + timeline ─────────────────────────
  const useDealDetail = (dealId: string | null) =>
    useQuery({
      queryKey: ["deal-detail", dealId],
      queryFn: async (): Promise<DealDetail> => {
        const { data, error } = await (supabase as any).rpc("get_deal_with_calls", {
          p_deal_id: dealId,
        });
        if (error) throw error;
        return data as DealDetail;
      },
      enabled: !!dealId && !!user,
      staleTime: 10_000,
    });

  // ── Create deal ─────────────────────────────────────────────────────────────
  const createDeal = useMutation({
    mutationFn: async (params: {
      name: string;
      company?: string;
      contact_name?: string;
      contact_email?: string;
      stage?: DealStageValue;
      value?: number;
      probability?: number;
      close_date?: string;
      source?: string;
      notes?: string;
    }): Promise<Deal> => {
      const { data, error } = await (supabase as any)
        .from("deals")
        .insert({
          owner_id: user!.id,
          name: params.name,
          company: params.company || null,
          contact_name: params.contact_name || null,
          contact_email: params.contact_email || null,
          stage: params.stage || "discovery",
          value: params.value || null,
          probability: params.probability || 50,
          close_date: params.close_date || null,
          source: params.source || null,
          notes: params.notes || null,
        })
        .select()
        .single();
      if (error) throw error;
      return data as Deal;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["deals"] });
      toast.success("Deal created!");
    },
    onError: (err: any) => toast.error(err.message || "Failed to create deal"),
  });

  // ── Update deal ─────────────────────────────────────────────────────────────
  const updateDeal = useMutation({
    mutationFn: async (params: { id: string } & Partial<Deal>) => {
      const { id, ...updates } = params;
      const { error } = await (supabase as any)
        .from("deals")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["deals"] });
      qc.invalidateQueries({ queryKey: ["deal-detail", vars.id] });
    },
    onError: (err: any) => toast.error(err.message || "Failed to update deal"),
  });

  // ── Attach call to deal ─────────────────────────────────────────────────────
  const attachCall = useMutation({
    mutationFn: async ({ callId, dealId }: { callId: string; dealId: string }) => {
      const { error } = await (supabase as any).rpc("attach_call_to_deal", {
        p_call_id: callId,
        p_deal_id: dealId,
      });
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["deals"] });
      qc.invalidateQueries({ queryKey: ["deal-detail", vars.dealId] });
      qc.invalidateQueries({ queryKey: ["calls"] });
      toast.success("Call linked to deal");
    },
    onError: (err: any) => toast.error(err.message || "Failed to link call"),
  });

  // ── Generate AI deal summary ────────────────────────────────────────────────
  const generateSummary = useMutation({
    mutationFn: async (dealId: string) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Not authenticated");

      const { data, error } = await supabase.functions.invoke("generate-deal-summary", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { deal_id: dealId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (_data, dealId) => {
      qc.invalidateQueries({ queryKey: ["deals"] });
      qc.invalidateQueries({ queryKey: ["deal-detail", dealId] });
      toast.success("Deal intelligence updated!");
    },
    onError: (err: any) => toast.error(err.message || "Failed to generate summary"),
  });

  // ── Delete deal ─────────────────────────────────────────────────────────────
  const deleteDeal = useMutation({
    mutationFn: async (dealId: string) => {
      const { error } = await (supabase as any)
        .from("deals")
        .delete()
        .eq("id", dealId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["deals"] });
      toast.success("Deal deleted");
    },
    onError: (err: any) => toast.error(err.message || "Failed to delete deal"),
  });

  // ── Derived stats ───────────────────────────────────────────────────────────
  const pipeline = {
    total: deals.length,
    won: deals.filter(d => d.stage === "won").length,
    lost: deals.filter(d => d.stage === "lost").length,
    active: deals.filter(d => !["won", "lost"].includes(d.stage)).length,
    totalValue: deals
      .filter(d => d.stage !== "lost")
      .reduce((sum, d) => sum + (d.value || 0), 0),
    avgSentiment: deals.filter(d => d.avg_sentiment).length
      ? Math.round(
          deals.filter(d => d.avg_sentiment).reduce((s, d) => s + (d.avg_sentiment || 0), 0) /
          deals.filter(d => d.avg_sentiment).length
        )
      : null,
  };

  return {
    deals,
    isLoading,
    pipeline,
    createDeal,
    updateDeal,
    attachCall,
    generateSummary,
    deleteDeal,
    useDealDetail,
  };
}