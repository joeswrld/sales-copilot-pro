/**
 * useLiveCall.ts — v4 (Streaming Architecture)
 *
 * Removed: MeetingBaas / Recall.ai bot dispatch
 * Audio transcription now handled by useAudioStreaming (browser-side Daily track capture)
 * → transcribe-stream edge function → Supabase realtime
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
  await supabase.from("team_messages" as any).insert({
    conversation_id: conversationId,
    sender_id: userId,
    message_text: text,
  });
}

export function useLiveCall(options?: {
  onCallStarted?: () => void;
  onCallEnded?: () => void;
}) {
  const { user } = useAuth();
  const { effectivePlan } = useEffectivePlan();
  const { team } = useTeam();
  const queryClient = useQueryClient();

  // ── Live call query ────────────────────────────────────────────────────────
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
    refetchInterval: 5_000,
  });

  const callId = liveCallQuery.data?.id;

  // ── Transcripts / objections / topics ─────────────────────────────────────
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

  // ── Realtime subscriptions ─────────────────────────────────────────────────
  useEffect(() => {
    if (!callId || !user) return;
    const channel = supabase
      .channel(`live-call-${callId}`)
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

  // ── START CALL ─────────────────────────────────────────────────────────────
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
      // Plan limit check
      const callsLimit = effectivePlan?.callsLimit ?? 5;
      const workspaceId = effectivePlan?.workspaceId ?? null;

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
          .eq("user_id", user!.id)
          .neq("status", "live")
          .gte("created_at", cycleStart.toISOString());
        usedCount = count ?? 0;
      }

      if (callsLimit !== -1 && usedCount >= callsLimit) {
        throw new Error("PLAN_LIMIT_REACHED");
      }

      // Insert call row
      const { data, error } = await supabase.from("calls").insert({
        user_id: user!.id,
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
  });

  // ── END CALL ───────────────────────────────────────────────────────────────
  const endCall = useMutation({
    mutationFn: async () => {
      if (!callId) throw new Error("No live call");

      const { error } = await supabase.from("calls").update({
        status: "completed",
        end_time: new Date().toISOString(),
      }).eq("id", callId);
      if (error) throw error;

      // ✅ CHANGED: Fire update-usage to log minutes consumed (non-fatal)
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          await supabase.functions.invoke("update-usage", {
            headers: { Authorization: `Bearer ${session.access_token}` },
            body: { call_id: callId },
          });
        }
      } catch (e) {
        console.warn("update-usage non-fatal error:", e);
      }

      // Generate AI summary
      let summaryData: any = null;
      try {
        const res = await supabase.functions.invoke("generate-call-summary", {
          body: { call_id: callId },
        });
        if (res.data) summaryData = res.data;
        if (res.error) console.error("Summary error:", res.error);
      } catch (e) {
        console.error("Summary generation error:", e);
      }

      // Slack notification (fire-and-forget)
      supabase.functions.invoke("slack-notify", {
        body: { call_id: callId, user_id: user!.id },
      }).catch(console.error);

      // Auto-create Deal Room if user is in a team
      if (team?.id) {
        try {
          const callData = liveCallQuery.data;
          const stage = stageFromCall({
            status: callData?.status,
            meeting_type: (callData as any)?.meeting_type,
            sentiment_score: callData?.sentiment_score,
          });

          const sentimentScore = callData?.sentiment_score ?? null;
          const meetingScore = summaryData?.meetingScore ?? null;
          const nextStep = summaryData?.nextSteps?.[0] ?? null;
          const company = callData?.participants?.[0] ?? null;
          const dealName = callData?.name ?? "Untitled Deal";

          const { data: dealRoomId, error: drErr } = await (supabase as any).rpc(
            "create_deal_room_for_call",
            {
              p_call_id: callId,
              p_team_id: team.id,
              p_deal_name: dealName,
              p_company: company,
              p_stage: stage,
              p_sentiment_score: sentimentScore,
              p_last_call_score: meetingScore,
              p_next_step: nextStep,
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
                : `📊 **Call Completed** — ${dealName}`;

              const details: string[] = [];
              if (sentimentScore != null) details.push(`Sentiment: ${sentimentScore}%`);
              if (meetingScore != null) details.push(`Score: ${meetingScore}/10`);
              if (nextStep) details.push(`Next step: ${nextStep}`);

              const fullMsg = details.length ? `${summary}\n\n${details.join(" · ")}` : summary;
              await postSystemMessage(dr.conversation_id, fullMsg, user!.id);
            }
          }
        } catch (e) {
          console.error("Deal room creation error:", e);
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
  });

  return {
    liveCall: liveCallQuery.data,
    isLive: !!liveCallQuery.data,
    isLoading: liveCallQuery.isLoading,
    transcripts: transcriptsQuery.data ?? [],
    objections: objectionsQuery.data ?? [],
    topics: topicsQuery.data ?? [],
    startCall,
    endCall,
    callId,
  };
}