import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { useEffect } from "react";

export type Call = Tables<"calls">;
export type CallSummary = Tables<"call_summaries">;

export function useCalls() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Realtime subscription
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("calls-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "calls" }, () => {
        queryClient.invalidateQueries({ queryKey: ["calls"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, queryClient]);

  const callsQuery = useQuery({
    queryKey: ["calls"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("calls")
        .select("*")
        .order("date", { ascending: false });
      if (error) throw error;
      return data as Call[];
    },
    enabled: !!user,
  });

  return callsQuery;
}

export function useCallDetail(callId: string | undefined) {
  const { user } = useAuth();

  const callQuery = useQuery({
    queryKey: ["call", callId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("calls")
        .select("*")
        .eq("id", callId!)
        .maybeSingle();
      if (error) throw error;
      return data as Call | null;
    },
    enabled: !!user && !!callId,
  });

  const summaryQuery = useQuery({
    queryKey: ["call-summary", callId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("call_summaries")
        .select("*")
        .eq("call_id", callId!)
        .maybeSingle();
      if (error) throw error;
      return data as CallSummary | null;
    },
    enabled: !!user && !!callId,
  });

  return { call: callQuery, summary: summaryQuery };
}

export function useCreateCall() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: Omit<TablesInsert<"calls">, "user_id">) => {
      const { data, error } = await supabase
        .from("calls")
        .insert({ ...input, user_id: user!.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["calls"] }),
  });
}

export function useUpdateCall() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: TablesUpdate<"calls"> & { id: string }) => {
      const { data, error } = await supabase
        .from("calls")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["calls"] });
      queryClient.invalidateQueries({ queryKey: ["call", data.id] });
    },
  });
}

export function useDeleteCall() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("calls").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["calls"] }),
  });
}

export function useCallStats() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["call-stats"],
    queryFn: async () => {
      const { data: calls, error } = await supabase
        .from("calls")
        .select("*");
      if (error) throw error;

      const total = calls.length;
      const won = calls.filter(c => c.status === "Won").length;
      const winRate = total > 0 ? Math.round((won / total) * 100) : 0;
      const totalObjections = calls.reduce((sum, c) => sum + (c.objections_count || 0), 0);
      const atRisk = calls.filter(c => c.status === "At Risk").length;
      const avgSentiment = total > 0
        ? Math.round(calls.reduce((sum, c) => sum + (c.sentiment_score || 0), 0) / total)
        : 0;

      return { total, winRate, totalObjections, atRisk, avgSentiment, calls };
    },
    enabled: !!user,
  });
}
