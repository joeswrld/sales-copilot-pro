/**
 * useCrmSync.ts
 * Hooks for CRM bidirectional sync: field mappings, contact enrichment,
 * deal risk alerts, and post-call metric push.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export type CrmProvider = "hubspot" | "salesforce";

export interface CrmContact {
  id: string;
  provider: CrmProvider;
  external_id: string;
  name: string | null;
  email: string | null;
  role: string | null;
  company: string | null;
  phone: string | null;
  deal_stage: string | null;
  deal_value: number | null;
  deal_timeline: string | null;
  last_activity: string | null;
  synced_at: string;
}

export interface CrmFieldMapping {
  id: string;
  provider: CrmProvider;
  fixsense_field: string;
  crm_property: string;
  enabled: boolean;
}

export interface DealRiskAlert {
  id: string;
  deal_id: string;
  call_id: string | null;
  sentiment_score: number | null;
  previous_stage: string | null;
  new_stage: string;
  crm_updated: boolean;
  resolved: boolean;
  resolved_at: string | null;
  resolved_reason: string | null;
  created_at: string;
}

// ── Field Mappings ─────────────────────────────────────────────────────────

export function useCrmFieldMappings(provider: CrmProvider = "hubspot") {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: mappings = [], isLoading } = useQuery({
    queryKey: ["crm-field-mappings", provider, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_field_mappings")
        .select("*")
        .eq("user_id", user!.id)
        .eq("provider", provider)
        .order("fixsense_field");
      if (error) throw error;
      return (data || []) as CrmFieldMapping[];
    },
    enabled: !!user,
  });

  const updateMapping = useMutation({
    mutationFn: async ({
      id,
      crm_property,
      enabled,
    }: {
      id: string;
      crm_property?: string;
      enabled?: boolean;
    }) => {
      const updates: any = {};
      if (crm_property !== undefined) updates.crm_property = crm_property;
      if (enabled !== undefined) updates.enabled = enabled;
      const { error } = await supabase
        .from("crm_field_mappings")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-field-mappings"] });
      toast.success("Mapping updated");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const initDefaultMappings = useMutation({
    mutationFn: async (p: CrmProvider) => {
      const defaults = [
        { fixsense_field: "call_score", crm_property: "fixsense_call_score" },
        { fixsense_field: "talk_ratio", crm_property: "fixsense_talk_ratio" },
        { fixsense_field: "objection_count", crm_property: "fixsense_objection_count" },
        { fixsense_field: "sentiment_score", crm_property: "fixsense_sentiment_score" },
      ];
      const rows = defaults.map((d) => ({
        user_id: user!.id,
        provider: p,
        ...d,
      }));
      const { error } = await supabase
        .from("crm_field_mappings")
        .upsert(rows, { onConflict: "user_id,provider,fixsense_field" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-field-mappings"] });
    },
  });

  return { mappings, isLoading, updateMapping, initDefaultMappings };
}

// ── Contact enrichment for a call ──────────────────────────────────────────

export function useCrmContactForCall(callId: string | undefined) {
  const { user } = useAuth();

  const { data: contact, isLoading, refetch } = useQuery({
    queryKey: ["crm-contact-call", callId],
    queryFn: async () => {
      // First check local cache
      const { data: call } = await supabase
        .from("calls")
        .select("participants")
        .eq("id", callId!)
        .single();

      const participants = (call?.participants as string[] | null) || [];
      const email = participants.find((p) => p.includes("@"));

      if (email) {
        const { data } = await supabase
          .from("crm_contacts")
          .select("*")
          .eq("user_id", user!.id)
          .eq("email", email)
          .limit(1)
          .maybeSingle();
        if (data) return data as CrmContact;
      }

      // Fetch live from CRM via edge function
      const { data } = await supabase.functions.invoke("crm-sync", {
        body: { action: "fetch_contact", call_id: callId, user_id: user!.id },
      });
      return data as CrmContact | null;
    },
    enabled: !!callId && !!user,
    staleTime: 5 * 60 * 1000,
  });

  return { contact, isLoading, refetch };
}

// ── Push metrics after call ────────────────────────────────────────────────

export function useSyncCallToCrm() {
  const { user } = useAuth();

  const syncMetrics = useMutation({
    mutationFn: async ({
      callId,
      provider,
    }: {
      callId: string;
      provider: CrmProvider;
    }) => {
      const { data, error } = await supabase.functions.invoke("crm-sync", {
        body: {
          action: "sync_metrics",
          call_id: callId,
          user_id: user!.id,
          provider,
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => toast.success("Call metrics synced to CRM"),
    onError: (e: any) => toast.error(`CRM sync failed: ${e.message}`),
  });

  const runPostCallTriggers = useMutation({
    mutationFn: async (callId: string) => {
      const { data, error } = await supabase.functions.invoke(
        "post-call-triggers",
        { body: { call_id: callId, user_id: user!.id } }
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => toast.success("Post-call integrations triggered"),
    onError: (e: any) => toast.error(e.message),
  });

  return { syncMetrics, runPostCallTriggers };
}

// ── Deal risk alerts ───────────────────────────────────────────────────────

export function useDealRiskAlerts(dealId?: string) {
  const { data: alerts = [], isLoading } = useQuery({
    queryKey: ["deal-risk-alerts", dealId],
    queryFn: async () => {
      let q = supabase
        .from("deal_risk_alerts")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      if (dealId) q = q.eq("deal_id", dealId);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as DealRiskAlert[];
    },
    enabled: true,
  });

  const resolveAlert = useMutation({
    mutationFn: async ({
      alertId,
      reason,
    }: {
      alertId: string;
      reason: string;
    }) => {
      const { error } = await supabase
        .from("deal_risk_alerts")
        .update({
          resolved: true,
          resolved_at: new Date().toISOString(),
          resolved_reason: reason,
        })
        .eq("id", alertId);
      if (error) throw error;
    },
    onSuccess: () => {
      useQueryClient().invalidateQueries({ queryKey: ["deal-risk-alerts"] });
      toast.success("Alert resolved");
    },
  });

  return { alerts, isLoading, resolveAlert };
}