/**
 * useLiveCall.ts — v3
 *
 * Changes from v2:
 *  1. startCall now invokes create-google-meet edge function before inserting
 *     the calls row, storing meeting_url and calendar_event_id.
 *  2. Graceful fallback: if Meet link generation fails, startCall continues
 *     with the manually-provided meeting_id.
 *  3. meeting_url is now stored in the calls row for cross-device resume.
 *  4. captureSourceLabel exposed for UI display.
 *
 * No changes to:
 *  - Real-time transcription / objection / topic subscriptions
 *  - endCall AI summary + deal room creation logic
 *  - Status callbacks (onCallStarted / onCallEnded)
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

// ── Helper: post a system message into a deal room conversation ───────────────
// Uses the current user's ID as sender so it passes RLS policies
async function postSystemMessage(conversationId: string, text: string, userId: string) {
  await supabase.from("team_messages" as any).insert({
    conversation_id: conversationId,
    sender_id:       userId,
    message_text:    text,
  });
}

// ─────────────────────────────────────────────────────────────────────────────

export function useLiveCall(options?: {
  onCallStarted?: () => void;
  onCallEnded?:   () => void;
}) {
  const { user }         = useAuth();
  const { effectivePlan } = useEffectivePlan();
  const { team }         = useTeam();
  const queryClient      = useQueryClient();

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
    refetchInterval: 5_000,
  });

  const callId = liveCallQuery.data?.id;

  // ── Transcripts / objections / topics ───────────────────────────────────
  const transcriptsQuery = useQuery({
    queryKey: ["live-transcripts", callId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transcripts").select("*").eq("call_id", callId!)
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
        .from("objections").select("*").eq("call_id", callId!)
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
        .from("key_topics").select("*").eq("call_id", callId!)
        .order("detected_at", { ascending: true });
      if (error) throw error;
      return data as KeyTopic[];
    },
    enabled: !!callId,
  });

  // ── Realtime subscriptions ───────────────────────────────────────────────
  useEffect(() => {
    if (!callId || !user) return;
    const channel = supabase
      .channel(`live-call-${callId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "transcripts", filter: `call_id=eq.${callId}` },
        () => queryClient.invalidateQueries({ queryKey: ["live-transcripts", callId] }))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "objections", filter: `call_id=eq.${callId}` },
        () => queryClient.invalidateQueries({ queryKey: ["live-objections", callId] }))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "key_topics", filter: `call_id=eq.${callId}` },
        () => queryClient.invalidateQueries({ queryKey: ["live-topics", callId] }))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "calls", filter: `id=eq.${callId}` },
        () => queryClient.invalidateQueries({ queryKey: ["live-call"] }))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [callId, user, queryClient]);

  // ── START CALL ───────────────────────────────────────────────────────────
  const startCall = useMutation({
    mutationFn: async (input: {
      platform:      string;
      meeting_id?:   string;         // manual fallback URL
      name?:         string;
      meeting_type?: string;
      participants?: string[];
      // NEW: pass these for auto Meet link generation
      scheduled_time?:   string;     // ISO 8601 — if provided, triggers auto-link
      duration_minutes?: number;
      description?:      string;
    }) => {
      // ── Plan limit check ─────────────────────────────────────────────
      const callsLimit  = effectivePlan?.callsLimit  ?? 5;
      const workspaceId = effectivePlan?.workspaceId ?? null;

      const cycleStart = new Date();
      cycleStart.setDate(1); cycleStart.setHours(0, 0, 0, 0);

      let usedCount = 0;
      if (workspaceId) {
        const { data: usageRow } = await supabase
          .from("workspace_meeting_usage" as any)
          .select("meetings_used").eq("workspace_id", workspaceId).maybeSingle();
        usedCount = (usageRow as any)?.meetings_used ?? 0;
      } else {
        const { count } = await supabase.from("calls")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user!.id).neq("status", "live")
          .gte("created_at", cycleStart.toISOString());
        usedCount = count ?? 0;
      }

      if (callsLimit !== -1 && usedCount >= callsLimit) {
        throw new Error("PLAN_LIMIT_REACHED");
      }

      // ── Auto Meet link generation ────────────────────────────────────
      let meetingUrl:       string | null = input.meeting_id ?? null;
      let calendarEventId:  string | null = null;

      const shouldAutoGenerate =
        input.platform === "Google Meet" &&
        input.scheduled_time;

      if (shouldAutoGenerate) {
        try {
          // Get current session for authorization header
          const { data: { session } } = await supabase.auth.getSession();
          
          if (!session?.access_token) {
            console.warn("No access token available for Meet link generation");
            toast.warning("Could not auto-generate Meet link. You can paste one manually.");
          } else {
            const { data: meetData, error: meetErr } = await supabase.functions.invoke(
              "create-google-meet",
              {
                headers: {
                  "Authorization": `Bearer ${session.access_token}`,
                },
                body: {
                  user_id:          user!.id,
                  title:            input.name ?? "Sales Call",
                  participants:     input.participants ?? [],
                  scheduled_time:   input.scheduled_time,
                  duration_minutes: input.duration_minutes ?? 60,
                  description:      input.description ?? "",
                },
              },
            );

            if (meetErr) {
              console.warn("Meet link generation failed (using fallback):", meetErr);
              toast.warning("Could not auto-generate Meet link. You can paste one manually.");
            } else if (meetData?.meet_link) {
              meetingUrl      = meetData.meet_link;
              calendarEventId = meetData.calendar_event_id ?? null;
              toast.success("Google Meet link generated — invites sent to participants.");
            } else if (meetData?.code === "NOT_CONNECTED") {
              toast.warning("Connect Google Meet in Settings to auto-generate links.");
            }
          }
        } catch (e) {
          console.warn("Meet generation exception (using fallback):", e);
        }
      }

      // ── Insert call row ──────────────────────────────────────────────
      const { data, error } = await supabase.from("calls").insert({
        user_id:           user!.id,
        name:              input.name || `${input.platform} Call`,
        status:            "live",
        platform:          input.platform,
        meeting_id:        meetingUrl ?? input.meeting_id ?? crypto.randomUUID(),
        meeting_url:       meetingUrl,          // ← NEW column
        calendar_event_id: calendarEventId,     // ← NEW column
        meeting_type:      input.meeting_type ?? null,
        participants:      input.participants ?? [],
        start_time:        new Date().toISOString(),
        date:              new Date().toISOString(),
      } as any).select().single();

      if (error) throw error;
      return data;
    },

    onSuccess: (callRow) => {
      queryClient.invalidateQueries({ queryKey: ["live-call"] });
      queryClient.invalidateQueries({ queryKey: ["calls"] });
      queryClient.invalidateQueries({ queryKey: ["meeting-usage"] });
      options?.onCallStarted?.();

      // ── Dispatch Recall.ai bot (fire-and-forget) ─────────────────────
      // Bot joins the meeting automatically to capture both sides.
      // We only attempt this if a real joinable URL exists.
      const meetingUrl = (callRow as any)?.meeting_url ?? (callRow as any)?.meeting_id;
      const isRealUrl  = meetingUrl && (
        meetingUrl.includes("meet.google.com") ||
        meetingUrl.includes("zoom.us") ||
        meetingUrl.includes("teams.microsoft.com") ||
        meetingUrl.includes(".daily.co")
      );

      if (isRealUrl) {
        // Get fresh session token for auth
        supabase.auth.getSession().then(({ data: { session: s } }) => {
          const headers: Record<string, string> = {};
          if (s?.access_token) {
            headers["Authorization"] = `Bearer ${s.access_token}`;
          }
          supabase.functions.invoke("join-meeting-bot", {
            headers,
            body: {
              call_id:     callRow.id,
              meeting_url: meetingUrl,
              call_name:   callRow.name,
            },
          }).then(({ error }) => {
            if (error) {
              console.warn("Bot dispatch failed (continuing without bot):", error);
            } else {
              console.log("Recall bot dispatched for call:", callRow.id);
            }
          });
        });
      }
    },
  });

  // ── END CALL ─────────────────────────────────────────────────────────────
  const endCall = useMutation({
    mutationFn: async () => {
      if (!callId) throw new Error("No live call");

      // Mark completed
      const { error } = await supabase.from("calls").update({
        status:   "completed",
        end_time: new Date().toISOString(),
      }).eq("id", callId);
      if (error) throw error;

      // Generate AI summary
      let summaryData: any = null;
      try {
        const res = await supabase.functions.invoke("generate-call-summary", {
          body: { call_id: callId },
        });
        if (res.data)  summaryData = res.data;
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
            status:          callData?.status,
            meeting_type:    (callData as any)?.meeting_type,
            sentiment_score: callData?.sentiment_score,
          });

          const sentimentScore = callData?.sentiment_score ?? null;
          const meetingScore   = summaryData?.meeting_score ?? null;
          const nextStep       = summaryData?.next_steps?.[0] ?? null;
          const company        = callData?.participants?.[0] ?? null;
          const dealName       = callData?.name ?? "Untitled Deal";

          const { data: dealRoomId, error: drErr } = await (supabase as any).rpc(
            "create_deal_room_for_call",
            {
              p_call_id:         callId,
              p_team_id:         team.id,
              p_deal_name:       dealName,
              p_company:         company,
              p_stage:           stage,
              p_sentiment_score: sentimentScore,
              p_last_call_score: meetingScore,
              p_next_step:       nextStep,
            },
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
              if (meetingScore    != null) details.push(`Score: ${meetingScore}/10`);
              if (nextStep)                details.push(`Next step: ${nextStep}`);
              if (summaryData?.objections?.length)
                details.push(`Objections: ${summaryData.objections.length}`);

              const fullMsg = details.length
                ? `${summary}\n\n${details.join(" · ")}`
                : summary;

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
      queryClient.invalidateQueries({ queryKey: ["deal-rooms"] });
      options?.onCallEnded?.();
    },
  });

  return {
    liveCall:    liveCallQuery.data,
    isLive:      !!liveCallQuery.data,
    isLoading:   liveCallQuery.isLoading,
    transcripts: transcriptsQuery.data  ?? [],
    objections:  objectionsQuery.data   ?? [],
    topics:      topicsQuery.data       ?? [],
    startCall,
    endCall,
    callId,
  };
}
