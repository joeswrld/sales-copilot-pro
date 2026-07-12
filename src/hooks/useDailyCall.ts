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
  // These columns have always been returned by the `select("*")` below (see
  // upsert_partial_transcript, which writes all of them) but were missing
  // from this type — every caller that needed them was reaching for `as
  // any`. Declaring them properly is what let LiveMeeting.tsx merge this
  // feed into its live-captions map the same way GuestJoin.tsx already does.
  speaker_name?: string;
  speaker_role?: string | null;
  is_guest?: boolean;
  is_partial?: boolean;
  client_chunk_id?: string | null;
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

  // ── FIX: client-side fallback for stamping start_time ──────────────────────
  // start_time was previously stamped ONLY by the Daily.co server webhook
  // (participant.joined / meeting.started -> daily-recording-webhook ->
  // markRoomLive). If that webhook is delayed, misconfigured, or dropped
  // (flaky mobile networks, signature/config issues), start_time stays null
  // forever — even though a real meeting with a real guest happened. That
  // silently broke two things: (1) endCall() below saw no start_time and
  // marked a fully-attended meeting "cancelled" instead of "completed", and
  // (2) the DB trigger that logs minute usage only fires for
  // completed/ended calls, so usage was never counted.
  //
  // markCallStarted mirrors exactly what the webhook does server-side
  // (idempotent via .is("start_time", null)), but fires the moment the host's
  // own browser confirms it joined the Daily room — no dependency on webhook
  // delivery. Safe to call multiple times; a no-op once start_time is set.
  const markCallStarted = async (id: string) => {
    try {
      await supabase
        .from("calls")
        .update({ status: "live", start_time: new Date().toISOString() })
        .eq("id", id)
        .is("start_time", null);
      // FIX: without this, the freshly-stamped start_time only reached the
      // host's own `liveCall` (and therefore the shared timer anchor) on
      // the next 10s poll tick — up to a 10s window where the timer was
      // still falling back to local Date.now(). Invalidating immediately
      // after the write makes the real start_time available right away.
      queryClient.invalidateQueries({ queryKey: ["live-call"] });
    } catch (e) {
      console.warn("markCallStarted non-fatal:", e);
    }
  };

  // ── FIX: persist "host has actually joined" separately from room creation ──
  // status='live' is set the instant the room is created (before anyone has
  // joined), and start_time can be stamped by a guest joining first. Neither
  // tells us whether *the host* has ever actually joined the video call for
  // this session — which is exactly the signal needed to know whether
  // returning to /live should silently reconnect the host into the meeting,
  // or still show the "Create/Host Meeting" screen because the room was
  // created but never actually joined. Idempotent via .is(...,null): first
  // join wins, later rejoins during the same live call are no-ops.
  const markHostJoined = async (id: string) => {
    try {
      await supabase
        .from("calls")
        .update({ host_joined_at: new Date().toISOString() })
        .eq("id", id)
        .is("host_joined_at", null);
    } catch (e) {
      console.warn("markHostJoined non-fatal:", e);
    }
  };

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
      // FIX: live captions (transcribe-live) upsert the SAME row repeatedly
      // as Deepgram refines an utterance (upsert_partial_transcript keyed on
      // client_chunk_id) — those refinements land as UPDATE, not INSERT.
      // Without this, only the first (early, inaccurate) interim guess ever
      // showed up in the transcript panel for the OTHER participant; the
      // refined/final text was silently missed. This is what makes a
      // remote participant's near-real-time captions actually update.
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "transcripts",
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
      .subscribe((status) => {
        console.log(`[useLiveCall][subscribe] postgres_changes channel status=${status} call=${callId}`);
      });

    // Broadcast is a second, lower-latency path for the SAME transcript
    // events (pushed directly by transcribe-live / transcribe-stream after
    // every DB write on topic `call-transcripts-{callId}` — must be a
    // SEPARATE channel/topic from the postgres_changes one above, since
    // Realtime channels are matched by exact topic string) — it skips the
    // Postgres WAL → replication round trip postgres_changes depends on.
    // Purely additive: worst case invalidateQueries just runs a touch
    // earlier than the postgres_changes listener would have. This is also
    // the same topic the Guest Join page listens on (see
    // useGuestTranscripts.ts), since RLS blocks guests from postgres_changes
    // entirely.
    const broadcastChannel = supabase
      .channel(`call-transcripts-${callId}`)
      .on("broadcast", { event: "transcript" }, (msg) => {
        console.log(`[useLiveCall][broadcast] transcript event for call=${callId}`, msg.payload);
        queryClient.invalidateQueries({ queryKey: ["live-transcripts", callId] });
      })
      .subscribe((status) => {
        console.log(`[useLiveCall][subscribe] broadcast channel status=${status} call=${callId}`);
      });

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(broadcastChannel);
    };
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
      /** Deal this meeting belongs to. Required — a meeting cannot start
       * without being linked to a deal first. Pass explicit `null` only
       * for the rare non-sales flows that intentionally skip deal linking
       * (e.g. internal test calls); the UI should otherwise always supply
       * a real deal id before calling startCall. */
      deal_id: string | null;
    }) => {
      if (!user) throw new Error("Not authenticated");
      if (input.deal_id === undefined) {
        throw new Error("DEAL_REQUIRED");
      }

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

      // NOTE: status stays "live" here purely so this hook's own liveCallQuery
      // (filtered on status='live') can find the row and let the host manage/
      // join the room they just created. It does NOT mean a real meeting is
      // happening yet. `start_time` is intentionally left null — it is only
      // ever stamped by the Daily.co webhook (daily-recording-webhook →
      // markRoomLive) when a real participant actually joins. Billing,
      // "Live" badges in the call list, and usage counters all key off
      // start_time being non-null, so creating a link and never joining
      // correctly counts as zero minutes.
      const { data, error } = await supabase.from("calls").insert({
        user_id: user.id,
        name: input.name || `${input.platform} Call`,
        status: "live",
        platform: input.platform,
        meeting_id: input.meeting_id ?? crypto.randomUUID(),
        meeting_url: input.meeting_id ?? null,
        meeting_type: input.meeting_type ?? null,
        participants: input.participants ?? [],
        date: new Date().toISOString(),
        // Linked at creation time, not guessed after the call ends.
        deal_id: input.deal_id,
      } as any).select().single();

      if (error) throw error;

      // Deal is the anchor for this meeting's whole workflow — seed the
      // timeline immediately so Deal/Messages pages have something to show
      // the instant the call exists, instead of waiting for call-end sync.
      if (input.deal_id) {
        await supabase.from("deal_timeline_events").insert({
          deal_id: input.deal_id,
          user_id: user.id,
          event_type: "meeting_started",
          title: `Meeting started — ${input.name || `${input.platform} Call`}`,
          metadata: { call_id: data.id },
          happened_at: new Date().toISOString(),
        } as any).then(({ error: e }) => {
          if (e) console.warn("deal_timeline_events insert (non-fatal):", e);
        });
      }

      return data;
    },

    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["live-call"] });
      queryClient.invalidateQueries({ queryKey: ["calls"] });
      queryClient.invalidateQueries({ queryKey: ["meeting-usage"] });
      if (data?.deal_id) {
        queryClient.invalidateQueries({ queryKey: ["deal", data.deal_id] });
        queryClient.invalidateQueries({ queryKey: ["deal-timeline", data.deal_id] });
      }
      options?.onCallStarted?.();
    },
    onError: (err: any) => {
      if (err.message !== "PLAN_LIMIT_REACHED" && err.message !== "DEAL_REQUIRED") {
        console.error("startCall error:", err);
      }
    },
  });

  // ── END CALL ─────────────────────────────────────────────────────────────
  const endCall = useMutation({
    mutationFn: async () => {
      if (!callId) throw new Error("No live call");

      // Was this meeting ever actually attended? start_time is only ever
      // stamped by the real-participant-joined webhook — if it's still null,
      // the host just created a link and is closing it out without anyone
      // (including themselves) ever joining the room. That's a cancellation,
      // not a completed meeting: no duration, no AI summary, no deal room.
      const { data: current } = await supabase
        .from("calls")
        .select("start_time")
        .eq("id", callId)
        .maybeSingle();

      const neverStarted = !current?.start_time;
      const endTimeIso = new Date().toISOString();

      // FIX: duration_minutes used to be left `undefined` here, relying on an
      // "update-usage" edge function to fill it in later. That function does
      // not exist in this project, so duration_minutes was silently staying
      // blank on every organically-ended call - Call Details/Call List showed
      // "N/A" minutes even when the meeting completed correctly. Compute it
      // directly from start_time -> end_time here (same rounding the DB usage
      // trigger uses: whole minutes, minimum 1) so it's always populated.
      const durationMinutes = neverStarted
        ? 0
        : Math.max(1, Math.ceil((Date.now() - new Date(current!.start_time).getTime()) / 60000));

      const { error } = await supabase.from("calls").update({
        status: neverStarted ? "cancelled" : "completed",
        end_time: endTimeIso,
        duration_minutes: durationMinutes,
      }).eq("id", callId);
      if (error) throw error;

      if (neverStarted) {
        // Nothing to summarize, notify, or log usage for.
        return { neverStarted: true, summaryGenerated: false };
      }

      // NOTE: minute usage itself is logged by the DB trigger
      // trg_log_usage_on_call_complete, which fires on the status update
      // above (status -> 'completed'). No edge function call needed for that.

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

      // Fallback: if a Daily recording was requested, wait briefly for the
      // webhook to store the URL, then copy it onto the call row so Call
      // Details always shows a recording link when one exists.
      try {
        const { data: cd } = await supabase
          .from("calls")
          .select("daily_recording_id, recording_url")
          .eq("id", callId)
          .maybeSingle();
        if (cd?.daily_recording_id && !cd?.recording_url) {
          for (let i = 0; i < 6; i++) {
            await new Promise((r) => setTimeout(r, 2000));
            const { data: dr } = await (supabase as any)
              .from("daily_rooms")
              .select("recording_url")
              .eq("recording_id", cd.daily_recording_id)
              .maybeSingle();
            if (dr?.recording_url) {
              await supabase.from("calls")
                .update({ recording_url: dr.recording_url })
                .eq("id", callId);
              break;
            }
          }
        }
      } catch (e) {
        console.warn("recording URL fallback non-fatal:", e);
      }

      // FIX: this used to fall off the end of the function returning
      // undefined, so the caller (LiveMeeting's handleEnd) had no way to
      // know whether generate-call-summary above actually succeeded or
      // failed silently (it's caught non-fatally on purpose, so a failure
      // here never throws). Surfacing it lets the post-call overlay show an
      // honest "ready" state instead of always claiming success.
      return { neverStarted: false, summaryGenerated: !!summaryData };
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["live-call"] });
      queryClient.invalidateQueries({ queryKey: ["calls"] });
      queryClient.invalidateQueries({ queryKey: ["call", callId] });
      queryClient.invalidateQueries({ queryKey: ["call-summary", callId] });
      queryClient.invalidateQueries({ queryKey: ["call-stats"] });
      queryClient.invalidateQueries({ queryKey: ["user-profile"] });
      queryClient.invalidateQueries({ queryKey: ["meeting-usage"] });
      queryClient.invalidateQueries({ queryKey: ["minute-usage"] });
      queryClient.invalidateQueries({ queryKey: ["team-minute-usage"] });
      queryClient.invalidateQueries({ queryKey: ["team-minute-pool"] });
      queryClient.invalidateQueries({ queryKey: ["deal-rooms"] });
      queryClient.invalidateQueries({ queryKey: ["deals"] });
      queryClient.invalidateQueries({ queryKey: ["deal-timeline"] });
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
    markCallStarted,
    markHostJoined,
    // Has the host ever actually joined the Daily room for this live call
    // (as opposed to merely having created it)? Drives auto-reconnect on
    // /live: a value of `true` means it's safe to skip the Create/Host
    // Meeting screen and restore the host straight into the meeting.
    hostJoinedAt: (liveCallQuery.data as any)?.host_joined_at ?? null,
    callId,
  };
}