import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEffectivePlan } from "@/hooks/useEffectivePlan";
import { getMeetingLimit } from "@/hooks/useMeetingUsage";
import { toast } from "sonner";

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
  const { effectivePlan } = useEffectivePlan();
  const queryClient = useQueryClient();

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

  // ── Start a call ────────────────────────────────────────────────────────────
  // Enforces the *effective* plan limit (workspace-inherited or personal).
  // No need to re-fetch the admin profile — effectivePlan already resolved it.
  const startCall = useMutation({
    mutationFn: async (input: {
      platform: string;
      meeting_id?: string;
      name?: string;
      meeting_type?: string;
      participants?: string[];
    }) => {
      const callsLimit = effectivePlan?.callsLimit ?? 5;
      const workspaceId = effectivePlan?.workspaceId ?? null;

      // Billing cycle start (first of current month)
      const cycleStart = new Date();
      cycleStart.setDate(1);
      cycleStart.setHours(0, 0, 0, 0);

      let usedCount = 0;

      if (workspaceId) {
        // Count across the whole workspace
        const { data: usageRow } = await (supabase
          .from("workspace_meeting_usage" as any)
          .select("meetings_used")
          .eq("workspace_id", workspaceId)
          .maybeSingle() as any);
        usedCount = usageRow?.meetings_used ?? 0;
      } else {
        // Personal count
        const { count } = await supabase
          .from("calls")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user!.id)
          .neq("status", "live")
          .gte("created_at", cycleStart.toISOString());
        usedCount = count ?? 0;
      }

      if (callsLimit !== -1 && usedCount >= callsLimit) {
        throw new Error("PLAN_LIMIT_REACHED");
      }

      const { data, error } = await supabase
        .from("calls")
        .insert({
          user_id:      user!.id,
          name:         input.name || `${input.platform} Call`,
          status:       "live",
          platform:     input.platform,
          meeting_id:   input.meeting_id || crypto.randomUUID(),
          meeting_type: input.meeting_type || null,
          participants: input.participants || [],
          start_time:   new Date().toISOString(),
          date:         new Date().toISOString(),
        } as any)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["live-call"] });
      queryClient.invalidateQueries({ queryKey: ["calls"] });
      queryClient.invalidateQueries({ queryKey: ["meeting-usage"] });
    },
  });

  // ── End a call ──────────────────────────────────────────────────────────────
  const endCall = useMutation({
    mutationFn: async () => {
      if (!callId) throw new Error("No live call");

      const { error } = await supabase
        .from("calls")
        .update({
          status:   "completed",
          end_time: new Date().toISOString(),
        })
        .eq("id", callId);

      if (error) throw error;

      // Generate post-call summary (fire-and-forget)
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData?.session?.access_token;
        if (token) {
          const res = await supabase.functions.invoke("generate-call-summary", {
            body: { call_id: callId },
          });
          if (res.error) {
            console.error("Summary generation failed:", res.error);
            toast.error("Call saved, but summary generation failed");
          }
        }
      } catch (e) {
        console.error("Summary generation error:", e);
      }

      // Slack notification (fire-and-forget)
      try {
        await supabase.functions.invoke("slack-notify", {
          body: { call_id: callId, user_id: user!.id },
        });
      } catch (e) {
        console.error("Slack notify error:", e);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["live-call"] });
      queryClient.invalidateQueries({ queryKey: ["calls"] });
      queryClient.invalidateQueries({ queryKey: ["call-stats"] });
      queryClient.invalidateQueries({ queryKey: ["user-profile"] });
      queryClient.invalidateQueries({ queryKey: ["meeting-usage"] });
    },
  });

  return {
    liveCall:    liveCallQuery.data,
    isLive:      !!liveCallQuery.data,
    isLoading:   liveCallQuery.isLoading,
    transcripts: transcriptsQuery.data || [],
    objections:  objectionsQuery.data  || [],
    topics:      topicsQuery.data      || [],
    startCall,
    endCall,
    callId,
  };
}
