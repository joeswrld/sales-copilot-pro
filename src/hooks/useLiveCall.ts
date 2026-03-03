import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface Transcript {
  id: string;
  call_id: string;
  speaker: string;
  text: string;
  timestamp: string;
}

export interface Objection {
  id: string;
  call_id: string;
  objection_type: string;
  suggestion: string | null;
  detected_at: string;
  confidence_score: number;
}

export interface KeyTopic {
  id: string;
  call_id: string;
  topic: string;
  detected_at: string;
}

export function useLiveCall() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Get current live call
  const liveCallQuery = useQuery({
    queryKey: ["live-call"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("calls")
        .select("*")
        .eq("status", "live")
        .order("start_time", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
    refetchInterval: 5000,
  });

  const callId = liveCallQuery.data?.id;

  // Realtime transcripts
  const transcriptsQuery = useQuery({
    queryKey: ["live-transcripts", callId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transcripts")
        .select("*")
        .eq("call_id", callId!)
        .order("timestamp", { ascending: true });
      if (error) throw error;
      return data as Transcript[];
    },
    enabled: !!callId,
  });

  // Realtime objections
  const objectionsQuery = useQuery({
    queryKey: ["live-objections", callId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("objections")
        .select("*")
        .eq("call_id", callId!)
        .order("detected_at", { ascending: true });
      if (error) throw error;
      return data as Objection[];
    },
    enabled: !!callId,
  });

  // Realtime key topics
  const topicsQuery = useQuery({
    queryKey: ["live-topics", callId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("key_topics")
        .select("*")
        .eq("call_id", callId!)
        .order("detected_at", { ascending: true });
      if (error) throw error;
      return data as KeyTopic[];
    },
    enabled: !!callId,
  });

  // Realtime subscriptions
  useEffect(() => {
    if (!callId || !user) return;

    const channel = supabase
      .channel(`live-call-${callId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "transcripts", filter: `call_id=eq.${callId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ["live-transcripts", callId] });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "objections", filter: `call_id=eq.${callId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ["live-objections", callId] });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "key_topics", filter: `call_id=eq.${callId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ["live-topics", callId] });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "calls", filter: `id=eq.${callId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ["live-call"] });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [callId, user, queryClient]);

  // Start a call (simulated meeting start)
  const startCall = useMutation({
    mutationFn: async (input: { platform: string; meeting_id?: string }) => {
      const { data, error } = await supabase
        .from("calls")
        .insert({
          user_id: user!.id,
          name: `${input.platform} Call`,
          status: "live",
          platform: input.platform,
          meeting_id: input.meeting_id || crypto.randomUUID(),
          start_time: new Date().toISOString(),
          date: new Date().toISOString(),
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["live-call"] });
      queryClient.invalidateQueries({ queryKey: ["calls"] });
    },
  });

  // End a call
  const endCall = useMutation({
    mutationFn: async () => {
      if (!callId) throw new Error("No live call");
      const { error } = await supabase
        .from("calls")
        .update({
          status: "completed",
          end_time: new Date().toISOString(),
        })
        .eq("id", callId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["live-call"] });
      queryClient.invalidateQueries({ queryKey: ["calls"] });
      queryClient.invalidateQueries({ queryKey: ["call-stats"] });
    },
  });

  return {
    liveCall: liveCallQuery.data,
    isLive: !!liveCallQuery.data,
    isLoading: liveCallQuery.isLoading,
    transcripts: transcriptsQuery.data || [],
    objections: objectionsQuery.data || [],
    topics: topicsQuery.data || [],
    startCall,
    endCall,
    callId,
  };
}
