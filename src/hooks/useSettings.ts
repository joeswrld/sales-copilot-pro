import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect } from "react";
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

  const query = useQuery({
    queryKey: ["integrations"],
    queryFn: async () => {
      const { data, error } = await supabase.from("integrations").select("*");
      if (error) throw error;
      return data as Integration[];
    },
    enabled: !!user,
  });

  const toggleIntegration = useMutation({
    mutationFn: async ({ provider, currentStatus }: { provider: string; currentStatus: string }) => {
      const newStatus = currentStatus === "connected" ? "disconnected" : "connected";
      const { error } = await supabase
        .from("integrations")
        .update({ status: newStatus })
        .eq("user_id", user!.id)
        .eq("provider", provider);
      if (error) throw error;
      return { provider, newStatus };
    },
    onMutate: async ({ provider, currentStatus }) => {
      await queryClient.cancelQueries({ queryKey: ["integrations"] });
      const prev = queryClient.getQueryData<Integration[]>(["integrations"]);
      queryClient.setQueryData<Integration[]>(["integrations"], (old) =>
        old?.map((i) =>
          i.provider === provider
            ? { ...i, status: currentStatus === "connected" ? "disconnected" : "connected" }
            : i
        )
      );
      return { prev };
    },
    onError: (_err, _vars, context) => {
      queryClient.setQueryData(["integrations"], context?.prev);
      toast.error("Failed to update integration");
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["integrations"] }),
  });

  return { integrations: query.data || [], isLoading: query.isLoading, toggleIntegration };
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
