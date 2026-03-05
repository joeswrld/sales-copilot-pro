import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useCallback } from "react";
import { toast } from "sonner";

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
}

export function useIntegrations() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("integrations-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "integrations" }, () => {
        queryClient.invalidateQueries({ queryKey: ["integrations"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
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
    queryKey: ["integrations"],
    queryFn: async () => {
      const { data, error } = await supabase.from("integrations").select("*");
      if (error) throw error;
      return data as Integration[];
    },
    enabled: !!user,
  });

  const connectProvider = useMutation({
    mutationFn: async (provider: string) => {
      const redirectUri = `${window.location.origin}/dashboard/settings`;
      const { data, error } = await supabase.functions.invoke("oauth-connect", {
        body: { provider, redirect_uri: redirectUri },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as { url: string };
    },
    onSuccess: (data) => {
      // Open OAuth URL in popup
      const w = 600, h = 700;
      const left = window.screenX + (window.innerWidth - w) / 2;
      const top = window.screenY + (window.innerHeight - h) / 2;
      window.open(data.url, "oauth-popup", `width=${w},height=${h},left=${left},top=${top},popup=1`);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to start OAuth flow");
    },
  });

  const disconnectProvider = useMutation({
    mutationFn: async (provider: string) => {
      const { data, error } = await supabase.functions.invoke("oauth-disconnect", {
        body: { provider },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
    },
    onMutate: async (provider) => {
      await queryClient.cancelQueries({ queryKey: ["integrations"] });
      const prev = queryClient.getQueryData<Integration[]>(["integrations"]);
      queryClient.setQueryData<Integration[]>(["integrations"], (old) =>
        old?.map((i) => i.provider === provider ? { ...i, status: "disconnected" } : i)
      );
      return { prev };
    },
    onError: (_err, _vars, context) => {
      queryClient.setQueryData(["integrations"], context?.prev);
      toast.error("Failed to disconnect integration");
    },
    onSuccess: (_, provider) => {
      toast.success(`${provider} disconnected`);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["integrations"] }),
  });

  // Check if a token is expired
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
    // Keep legacy for backwards compat
    toggleIntegration: {
      isPending: connectProvider.isPending || disconnectProvider.isPending,
      mutate: ({ provider, currentStatus }: { provider: string; currentStatus: string }) => {
        if (currentStatus === "connected") {
          disconnectProvider.mutate(provider);
        } else {
          connectProvider.mutate(provider);
        }
      },
    },
  };
}

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
    mutationFn: async (updates: Partial<Pick<UserPreferences, "auto_join_meetings" | "real_time_objection_alerts" | "post_call_email_summary" | "crm_auto_sync">>) => {
      const { error } = await supabase
        .from("user_preferences")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("user_id", user!.id);
      if (error) throw error;
    },
    onMutate: async (updates) => {
      await queryClient.cancelQueries({ queryKey: ["user-preferences"] });
      const prev = queryClient.getQueryData<UserPreferences>(["user-preferences"]);
      queryClient.setQueryData<UserPreferences>(["user-preferences"], (old) =>
        old ? { ...old, ...updates } : old
      );
      return { prev };
    },
    onError: (_err, _vars, context) => {
      queryClient.setQueryData(["user-preferences"], context?.prev);
      toast.error("Failed to save preference");
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["user-preferences"] }),
  });

  return { preferences: query.data, isLoading: query.isLoading, updatePreference };
}

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
    mutationFn: async (updates: Partial<Pick<UserProfile, "gdpr_consent">>) => {
      const { error } = await supabase
        .from("profiles")
        .update(updates)
        .eq("id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["user-profile"] }),
  });

  return { profile: query.data, isLoading: query.isLoading, updateProfile };
}
