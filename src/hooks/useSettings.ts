import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useCallback } from "react";
import { toast } from "sonner";

// ─── The canonical list of integrations every user should have ───────────────
const DEFAULT_PROVIDERS = [
  "zoom",
  "google_meet",
  "teams",
  "salesforce",
  "hubspot",
  "slack",
] as const;

export interface Integration {
  id: string;
  user_id: string;
  provider: string;
  status: string;
  expires_at: string | null;
  created_at: string;
}

export interface UserPreferences {
  id: string;
  user_id: string;
  auto_join_meetings: boolean;
  real_time_objection_alerts: boolean;
  post_call_email_summary: boolean;
  crm_auto_sync: boolean;
  updated_at: string;
}

export interface UserProfile {
  id: string;
  full_name: string | null;
  email: string | null;
  plan_type: string;
  calls_used: number;
  calls_limit: number;
  gdpr_consent: boolean;
  onboarding_complete?: boolean | null;
}

// ─── Helper: ensure all default integration rows exist for a user ─────────────
async function ensureDefaultIntegrations(userId: string): Promise<void> {
  // Check which providers already exist
  const { data: existing } = await supabase
    .from("integrations")
    .select("provider")
    .eq("user_id", userId);

  const existingSet = new Set((existing || []).map((i: any) => i.provider));
  const missing = DEFAULT_PROVIDERS.filter((p) => !existingSet.has(p));

  if (missing.length === 0) return;

  // Insert missing rows
  const rows = missing.map((provider) => ({
    user_id: userId,
    provider,
    status: "disconnected",
  }));

  const { error } = await supabase.from("integrations").insert(rows);
  if (error) {
    // Conflict means rows were created concurrently – that's fine
    if (!error.message?.includes("duplicate") && !error.code?.includes("23505")) {
      console.error("Failed to seed integration rows:", error);
    }
  }
}

// ─── useIntegrations ──────────────────────────────────────────────────────────
export function useIntegrations() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Realtime: refresh when integrations table changes
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("integrations-rt")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "integrations" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["integrations"] });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, queryClient]);

  // Listen for OAuth popup success messages
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === "oauth-success") {
        queryClient.invalidateQueries({ queryKey: ["integrations"] });
        toast.success(`${event.data.provider} connected successfully!`);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [queryClient]);

  const query = useQuery({
    queryKey: ["integrations", user?.id],
    queryFn: async (): Promise<Integration[]> => {
      if (!user) return [];

      // 1. Ensure default rows exist (idempotent, fast no-op if already seeded)
      await ensureDefaultIntegrations(user.id);

      // 2. Fetch all integrations for this user
      const { data, error } = await supabase
        .from("integrations")
        .select("*")
        .eq("user_id", user.id)
        .order("provider");

      if (error) throw error;

      // 3. Safety-net: if somehow a default provider is still missing from the
      //    returned data (e.g. RLS hiccup), synthesise a disconnected placeholder
      //    so the UI always renders all providers.
      const returned = data as Integration[];
      const returnedProviders = new Set(returned.map((i) => i.provider));

      const placeholders: Integration[] = DEFAULT_PROVIDERS.filter(
        (p) => !returnedProviders.has(p)
      ).map((provider) => ({
        id: `placeholder-${provider}`,
        user_id: user.id,
        provider,
        status: "disconnected",
        expires_at: null,
        created_at: new Date().toISOString(),
      }));

      return [...returned, ...placeholders];
    },
    enabled: !!user,
    staleTime: 30_000,
  });

  // ── connectProvider ──
  const connectProvider = useMutation({
    mutationFn: async (provider: string) => {
      const redirectUri = `${window.location.origin}/settings`;
      const { data, error } = await supabase.functions.invoke("oauth-connect", {
        body: { provider, redirect_uri: redirectUri },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as { url: string };
    },
    onSuccess: (data) => {
      const w = 600,
        h = 700;
      const left = window.screenX + (window.innerWidth - w) / 2;
      const top = window.screenY + (window.innerHeight - h) / 2;
      window.open(
        data.url,
        "oauth-popup",
        `width=${w},height=${h},left=${left},top=${top},popup=1`
      );
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to start OAuth flow");
    },
  });

  // ── disconnectProvider ──
  const disconnectProvider = useMutation({
    mutationFn: async (provider: string) => {
      const { data, error } = await supabase.functions.invoke(
        "oauth-disconnect",
        { body: { provider } }
      );
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
    },
    onMutate: async (provider) => {
      await queryClient.cancelQueries({ queryKey: ["integrations"] });
      const prev = queryClient.getQueryData<Integration[]>(["integrations", user?.id]);
      queryClient.setQueryData<Integration[]>(
        ["integrations", user?.id],
        (old) =>
          (old || []).map((i) =>
            i.provider === provider ? { ...i, status: "disconnected" } : i
          )
      );
      return { prev };
    },
    onError: (_err, _vars, context) => {
      queryClient.setQueryData(["integrations", user?.id], context?.prev);
      toast.error("Failed to disconnect integration");
    },
    onSuccess: (_, provider) => {
      toast.success(`${provider} disconnected`);
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: ["integrations"] }),
  });

  const isExpired = useCallback((integration: Integration) => {
    if (!integration.expires_at) return false;
    return new Date(integration.expires_at) < new Date();
  }, []);

  return {
    integrations: query.data || [],
    isLoading: query.isLoading,
    connectProvider,
    disconnectProvider,
    isExpired,
    // Legacy compat
    toggleIntegration: {
      isPending:
        connectProvider.isPending || disconnectProvider.isPending,
      mutate: ({
        provider,
        currentStatus,
      }: {
        provider: string;
        currentStatus: string;
      }) => {
        if (currentStatus === "connected") {
          disconnectProvider.mutate(provider);
        } else {
          connectProvider.mutate(provider);
        }
      },
    },
  };
}

// ─── usePreferences ───────────────────────────────────────────────────────────
export function usePreferences() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["user-preferences"],
    queryFn: async () => {
      let { data, error } = await supabase
        .from("user_preferences")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        const { data: inserted, error: insertError } = await supabase
          .from("user_preferences")
          .insert({ user_id: user!.id })
          .select()
          .single();
        if (insertError) throw insertError;
        data = inserted;
      }
      return data as UserPreferences;
    },
    enabled: !!user,
  });

  const updatePreference = useMutation({
    mutationFn: async (
      updates: Partial<
        Pick<
          UserPreferences,
          | "auto_join_meetings"
          | "real_time_objection_alerts"
          | "post_call_email_summary"
          | "crm_auto_sync"
        >
      >
    ) => {
      const { error } = await supabase
        .from("user_preferences")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("user_id", user!.id);
      if (error) throw error;
    },
    onMutate: async (updates) => {
      await queryClient.cancelQueries({ queryKey: ["user-preferences"] });
      const prev = queryClient.getQueryData<UserPreferences>([
        "user-preferences",
      ]);
      queryClient.setQueryData<UserPreferences>(
        ["user-preferences"],
        (old) => (old ? { ...old, ...updates } : old)
      );
      return { prev };
    },
    onError: (_err, _vars, context) => {
      queryClient.setQueryData(["user-preferences"], context?.prev);
      toast.error("Failed to save preference");
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: ["user-preferences"] }),
  });

  return {
    preferences: query.data,
    isLoading: query.isLoading,
    updatePreference,
  };
}

// ─── useUserProfile ───────────────────────────────────────────────────────────
export function useUserProfile() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["user-profile"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user!.id)
        .single();
      if (error) throw error;
      return data as UserProfile;
    },
    enabled: !!user,
  });

  const updateProfile = useMutation({
    mutationFn: async (
      updates: Partial<Pick<UserProfile, "gdpr_consent">>
    ) => {
      const { error } = await supabase
        .from("profiles")
        .update(updates)
        .eq("id", user!.id);
      if (error) throw error;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["user-profile"] }),
  });

  return { profile: query.data, isLoading: query.isLoading, updateProfile };
}