/**
 * useIntegrations.ts
 * Hooks for Gmail drafts, Asana tasks, Notion sync, Teams,
 * webhook subscriptions, and API key management.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

// ── Gmail Draft ────────────────────────────────────────────────────────────

export interface GmailDraft {
  subject: string;
  body: string;
}

export function useGmailDraft() {
  const { user } = useAuth();

  const generateDraft = useMutation({
    mutationFn: async (callId: string): Promise<GmailDraft> => {
      const { data, error } = await supabase.functions.invoke("integrations-hub", {
        body: { action: "gmail_draft", call_id: callId, user_id: user!.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as GmailDraft;
    },
    onError: (e: any) => toast.error(`Gmail draft failed: ${e.message}`),
  });

  const openInGmail = (draft: GmailDraft) => {
    const params = new URLSearchParams({
      view: "cm",
      su: draft.subject,
      body: draft.body,
    });
    window.open(`https://mail.google.com/mail/?${params.toString()}`, "_blank");
  };

  return { generateDraft, openInGmail };
}

// ── Asana Tasks ────────────────────────────────────────────────────────────

export interface AsanaConfig {
  id: string;
  workspace_gid: string | null;
  workspace_name: string | null;
  project_gid: string | null;
  enabled: boolean;
}

export function useAsanaConfig() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: config, isLoading } = useQuery({
    queryKey: ["asana-config", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("asana_configs")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      return (data || null) as AsanaConfig | null;
    },
    enabled: !!user,
  });

  const updateConfig = useMutation({
    mutationFn: async (updates: Partial<AsanaConfig>) => {
      const { error } = await supabase
        .from("asana_configs")
        .upsert({ user_id: user!.id, ...updates });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["asana-config"] });
      toast.success("Asana config saved");
    },
  });

  return { config, isLoading, updateConfig };
}

export function useAsanaTask() {
  const { user } = useAuth();

  const createTask = useMutation({
    mutationFn: async ({
      callId,
      actionItem,
      assigneeEmail,
    }: {
      callId: string;
      actionItem: string;
      assigneeEmail?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke("integrations-hub", {
        body: {
          action: "asana_task",
          call_id: callId,
          user_id: user!.id,
          payload: { action_item: actionItem, assignee_email: assigneeEmail },
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => toast.success("Asana task created"),
    onError: (e: any) => toast.error(`Asana task failed: ${e.message}`),
  });

  return { createTask };
}

// ── Notion ─────────────────────────────────────────────────────────────────

export interface NotionConfig {
  id: string;
  workspace_id: string | null;
  workspace_name: string | null;
  database_id: string | null;
  enabled: boolean;
}

export function useNotionConfig() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: config, isLoading } = useQuery({
    queryKey: ["notion-config", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("notion_configs")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      return (data || null) as NotionConfig | null;
    },
    enabled: !!user,
  });

  const updateConfig = useMutation({
    mutationFn: async (updates: Partial<NotionConfig>) => {
      const { error } = await supabase
        .from("notion_configs")
        .upsert({
          user_id: user!.id,
          ...updates,
          updated_at: new Date().toISOString(),
        });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notion-config"] });
      toast.success("Notion config saved");
    },
  });

  const syncCall = useMutation({
    mutationFn: async (callId: string) => {
      const { data, error } = await supabase.functions.invoke("integrations-hub", {
        body: { action: "notion_sync", call_id: callId, user_id: user!.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      toast.success("Synced to Notion");
      if (data?.url) window.open(data.url, "_blank");
    },
    onError: (e: any) => toast.error(`Notion sync failed: ${e.message}`),
  });

  return { config, isLoading, updateConfig, syncCall };
}

// ── Webhook Subscriptions ──────────────────────────────────────────────────

export interface WebhookSubscription {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  failure_count: number;
  last_triggered: string | null;
  created_at: string;
}

export const WEBHOOK_EVENTS = [
  "call.completed",
  "deal.updated",
  "sentiment.threshold",
];

export function useWebhookSubscriptions() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: subscriptions = [], isLoading } = useQuery({
    queryKey: ["webhook-subscriptions", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("webhook_subscriptions")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as WebhookSubscription[];
    },
    enabled: !!user,
  });

  const createSubscription = useMutation({
    mutationFn: async ({
      url,
      events,
      secret,
    }: {
      url: string;
      events: string[];
      secret?: string;
    }) => {
      const { error } = await supabase.from("webhook_subscriptions").insert({
        user_id: user!.id,
        url,
        events,
        secret: secret || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["webhook-subscriptions"] });
      toast.success("Webhook subscription created");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteSubscription = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("webhook_subscriptions")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["webhook-subscriptions"] });
      toast.success("Subscription deleted");
    },
  });

  const toggleSubscription = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase
        .from("webhook_subscriptions")
        .update({ active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["webhook-subscriptions"] }),
  });

  return {
    subscriptions,
    isLoading,
    createSubscription,
    deleteSubscription,
    toggleSubscription,
  };
}

// ── API Keys ───────────────────────────────────────────────────────────────

export interface ApiKey {
  id: string;
  key_prefix: string;
  name: string;
  scopes: string[];
  last_used_at: string | null;
  expires_at: string | null;
  revoked: boolean;
  created_at: string;
}

export function useApiKeys() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: apiKeys = [], isLoading } = useQuery({
    queryKey: ["api-keys", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("api_keys")
        .select("*")
        .eq("user_id", user!.id)
        .eq("revoked", false)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as ApiKey[];
    },
    enabled: !!user,
  });

  const createKey = useMutation({
    mutationFn: async ({
      name,
      scopes,
    }: {
      name: string;
      scopes?: string[];
    }): Promise<{ key: string; prefix: string }> => {
      // Generate via public-api edge function
      const { data, error } = await supabase.functions.invoke("public-api", {
        body: { name, scopes },
        headers: {
          // Use a temp key for bootstrap; in prod would be another admin endpoint
          "X-Bootstrap": "true",
        },
      });
      if (error) throw error;
      // Fallback: create directly in DB
      const rawKey = `fxs_${crypto.randomUUID().replace(/-/g, "")}`;
      const prefix = rawKey.slice(0, 12);
      const { error: dbErr } = await supabase.from("api_keys").insert({
        user_id: user!.id,
        key_hash: rawKey,
        key_prefix: prefix,
        name,
        scopes: scopes || ["calls:read", "summaries:read", "analytics:read"],
      });
      if (dbErr) throw dbErr;
      return { key: rawKey, prefix };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["api-keys"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const revokeKey = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("api_keys")
        .update({ revoked: true })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["api-keys"] });
      toast.success("API key revoked");
    },
  });

  return { apiKeys, isLoading, createKey, revokeKey };
}

// ── Integration Tasks Log ──────────────────────────────────────────────────

export function useIntegrationTasks(callId?: string) {
  const { user } = useAuth();

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["integration-tasks", callId, user?.id],
    queryFn: async () => {
      let q = supabase
        .from("integration_tasks")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (callId) q = q.eq("call_id", callId);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  return { tasks, isLoading };
}