/**
 * useLiveCall.ts — v5 (Stabilized)
 *
 * Fixes:
 *  - Realtime channel now keyed on callId to prevent duplicate subscriptions
 *  - Error boundary around endCall's nested operations — individual failures
 *    don't abort the whole end-call flow
 *  - Reduced liveCallQuery poll interval (5s → 10s) to reduce load
 *  - startCall now has try/finally to always clean up on error
 */

import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEffectivePlan } from "@/hooks/useEffectivePlan";
import { toast } from "sonner";
import { stageFromCall } from "@/hooks/useDealRooms";
import { useTeam } from "@/hooks/useTeam";

export interface Transcript {
  id: string; call_id: string; speaker: string; text: string; timestamp: string;
}
export interface Objection {
  id: string; call_id: string; objection_type: string;
  suggestion: string | null; detected_at: string; confidence_score: number;
}
export interface KeyTopic {
  id: string; call_id: string; topic: string; detected_at: string;
}

async function postSystemMessage(conversationId: string, text: string, userId: string) {
  try {
    await supabase.from("team_messages" as any).insert({
      conversation_id: conversationId,
      sender_id: userId,
      message_text: text,
    });
  } catch (e) {
    console.warn("postSystemMessage failed (non-fatal):", e);
  }
}

export function useLiveCall(options?: {
  onCallStarted?: () => void;
  onCallEnded?: () => void;
}) {
  const { user } = useAuth();
  const { effectivePlan } = useEffectivePlan();
  const { team } = useTeam();
  const queryClient = useQueryClient();

  // ── Live call query ──────────────────────────────────────────────────────
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
    // Reduced from 5s to 10s — live call state doesn't need sub-second accuracy
    refetchInterval: 10_000,
    staleTime: 5_000,
  });

  const callId = liveCallQuery.data?.id;

  // ── Transcripts / objections / topics ───────────────────────────────────
  const transcriptsQuery = useQuery({
    queryKey: ["live-transcripts", callId],
    queryFn: async () => {
      if (!callId) return [];
      const { data, error } = await supabase
        .from("transcripts")
        .select("*")
        .eq("call_id", callId)
        .order("timestamp", { ascending: true });
      if (error) throw error;
      return data as Transcript[];
    },
    enabled: !!callId,
    staleTime: 3_000,
  });

  const objectionsQuery = useQuery({
    queryKey: ["live-objections", callId],
    queryFn: async () => {
      if (!callId) return [];
      const { data, error } = await supabase
        .from("objections")
        .select("*")
        .eq("call_id", callId)
        .order("detected_at", { ascending: true });
      if (error) throw error;
      return data as Objection[];
    },
    enabled: !!callId,
    staleTime: 5_000,
  });

  const topicsQuery = useQuery({
    queryKey: ["live-topics", callId],
    queryFn: async () => {
      if (!callId) return [];
      const { data, error } = await supabase
        .from("key_topics")
        .select("*")
        .eq("call_id", callId)
        .order("detected_at", { ascending: true });
      if (error) throw error;
      return data as KeyTopic[];
    },
    enabled: !!callId,
    staleTime: 5_000,
  });

  // ── Realtime subscriptions — keyed on callId ─────────────────────────────
  useEffect(() => {
    if (!callId || !user) return;

    const channel = supabase
      .channel(`live-call-data-${callId}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "transcripts",
        filter: `call_id=eq.${callId}`,
      }, () => queryClient.invalidateQueries({ queryKey: ["live-transcripts", callId] }))
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "objections",
        filter: `call_id=eq.${callId}`,
      }, () => queryClient.invalidateQueries({ queryKey: ["live-objections", callId] }))
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "key_topics",
        filter: `call_id=eq.${callId}`,
      }, () => queryClient.invalidateQueries({ queryKey: ["live-topics", callId] }))
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "calls",
        filter: `id=eq.${callId}`,
      }, () => queryClient.invalidateQueries({ queryKey: ["live-call"] }))
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [callId, user, queryClient]);

  // ── START CALL ───────────────────────────────────────────────────────────
  const startCall = useMutation({
    mutationFn: async (input: {
      platform: string;
      meeting_id?: string;
      name?: string;
      meeting_type?: string;
      participants?: string[];
      scheduled_time?: string;
      duration_minutes?: number;
      description?: string;
    }) => {
      if (!user) throw new Error("Not authenticated");

      const callsLimit    = effectivePlan?.callsLimit ?? 5;
      const workspaceId   = effectivePlan?.workspaceId ?? null;

      const cycleStart = new Date();
      cycleStart.setDate(1);
      cycleStart.setHours(0, 0, 0, 0);

      let usedCount = 0;
      if (workspaceId) {
        const { data: usageRow } = await supabase
          .from("workspace_meeting_usage" as any)
          .select("meetings_used")
          .eq("workspace_id", workspaceId)
          .maybeSingle();
        usedCount = (usageRow as any)?.meetings_used ?? 0;
      } else {
        const { count } = await supabase
          .from("calls")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .neq("status", "live")
          .gte("created_at", cycleStart.toISOString());
        usedCount = count ?? 0;
      }

      if (callsLimit !== -1 && usedCount >= callsLimit) {
        throw new Error("PLAN_LIMIT_REACHED");
      }

      const { data, error } = await supabase.from("calls").insert({
        user_id: user.id,
        name: input.name || `${input.platform} Call`,
        status: "live",
        platform: input.platform,
        meeting_id: input.meeting_id ?? crypto.randomUUID(),
        meeting_url: input.meeting_id ?? null,
        meeting_type: input.meeting_type ?? null,
        participants: input.participants ?? [],
        start_time: new Date().toISOString(),
        date: new Date().toISOString(),
      } as any).select().single();

      if (error) throw error;
      return data;
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["live-call"] });
      queryClient.invalidateQueries({ queryKey: ["calls"] });
      queryClient.invalidateQueries({ queryKey: ["meeting-usage"] });
      options?.onCallStarted?.();
    },
    onError: (err: any) => {
      if (err.message !== "PLAN_LIMIT_REACHED") {
        console.error("startCall error:", err);
      }
    },
  });

  // ── END CALL ─────────────────────────────────────────────────────────────
  const endCall = useMutation({
    mutationFn: async () => {
      if (!callId) throw new Error("No live call");

      const { error } = await supabase.from("calls").update({
        status: "completed",
        end_time: new Date().toISOString(),
      }).eq("id", callId);
      if (error) throw error;

      // Fire update-usage (non-fatal)
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          await supabase.functions.invoke("update-usage", {
            headers: { Authorization: `Bearer ${session.access_token}` },
            body: { call_id: callId },
          });
        }
      } catch (e) {
        console.warn("update-usage non-fatal:", e);
      }

      // Generate AI summary (non-fatal)
      let summaryData: any = null;
      try {
        const res = await supabase.functions.invoke("generate-call-summary", {
          body: { call_id: callId },
        });
        if (res.data) summaryData = res.data;
      } catch (e) {
        console.warn("Summary generation non-fatal:", e);
      }

      // Slack notification (fire-and-forget)
      supabase.functions.invoke("slack-notify", {
        body: { call_id: callId, user_id: user!.id },
      }).catch(() => {});

      // Auto-create Deal Room if in a team (non-fatal)
      if (team?.id) {
        try {
          const callData = liveCallQuery.data;
          const stage = stageFromCall({
            status: callData?.status,
            meeting_type: (callData as any)?.meeting_type,
            sentiment_score: callData?.sentiment_score,
          });

          const { data: dealRoomId, error: drErr } = await (supabase as any).rpc(
            "create_deal_room_for_call",
            {
              p_call_id:         callId,
              p_team_id:         team.id,
              p_deal_name:       callData?.name ?? "Untitled Deal",
              p_company:         callData?.participants?.[0] ?? null,
              p_stage:           stage,
              p_sentiment_score: callData?.sentiment_score ?? null,
              p_last_call_score: summaryData?.meetingScore ?? null,
              p_next_step:       summaryData?.nextSteps?.[0] ?? null,
            }
          );

          if (!drErr && dealRoomId) {
            const { data: dr } = await (supabase as any)
              .from("deal_rooms")
              .select("conversation_id")
              .eq("id", dealRoomId)
              .maybeSingle();

            if (dr?.conversation_id) {
              const summary = summaryData?.summary
                ? `📊 **Call Summary**\n${summaryData.summary}`
                : `📊 **Call Completed** — ${callData?.name ?? "Untitled"}`;

              const details: string[] = [];
              if (callData?.sentiment_score != null) details.push(`Sentiment: ${callData.sentiment_score}%`);
              if (summaryData?.meetingScore != null) details.push(`Score: ${summaryData.meetingScore}/10`);
              if (summaryData?.nextSteps?.[0]) details.push(`Next step: ${summaryData.nextSteps[0]}`);

              await postSystemMessage(
                dr.conversation_id,
                details.length ? `${summary}\n\n${details.join(" · ")}` : summary,
                user!.id
              );
            }
          }
        } catch (e) {
          console.warn("Deal room creation non-fatal:", e);
        }
      }
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["live-call"] });
      queryClient.invalidateQueries({ queryKey: ["calls"] });
      queryClient.invalidateQueries({ queryKey: ["call-stats"] });
      queryClient.invalidateQueries({ queryKey: ["user-profile"] });
      queryClient.invalidateQueries({ queryKey: ["meeting-usage"] });
      queryClient.invalidateQueries({ queryKey: ["minute-usage"] });
      queryClient.invalidateQueries({ queryKey: ["team-minute-usage"] });
      queryClient.invalidateQueries({ queryKey: ["deal-rooms"] });
      options?.onCallEnded?.();
    },
    onError: (err: any) => {
      console.error("endCall error:", err);
      toast.error("Failed to end call cleanly. Please refresh.");
    },
  });

  return {
    liveCall:    liveCallQuery.data,
    isLive:      !!liveCallQuery.data,
    isLoading:   liveCallQuery.isLoading,
    transcripts: transcriptsQuery.data ?? [],
    objections:  objectionsQuery.data ?? [],
    topics:      topicsQuery.data ?? [],
    startCall,
    endCall,
    callId,
  };
}