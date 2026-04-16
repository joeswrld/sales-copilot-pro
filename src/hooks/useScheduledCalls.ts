/**
 * useScheduledMeetings.ts — v2 (Smart Reminder System)
 *
 * Full data layer for Fixsense's internal meeting scheduler:
 *  - CRUD for scheduled_meetings
 *  - Reschedule tracking (rescheduled_from, reschedule_count)
 *  - Upcoming meetings with context (sentiment, objections, countdown)
 *  - In-app notification badge for meetings starting soon
 *  - Realtime updates via Supabase
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { isAfter, isBefore, addMinutes, parseISO } from "date-fns";

// ─── Types ──────────────────────────────────────────────────────────────────

export type MeetingStatus = "scheduled" | "live" | "ended" | "cancelled";

export interface ScheduledMeeting {
  id: string;
  user_id: string;
  title: string;
  meeting_link: string | null;
  scheduled_time: string;
  rescheduled_from: string | null;
  reschedule_count: number;
  status: MeetingStatus;
  meeting_type: string | null;
  notes: string | null;
  participants: string[] | null;
  last_sentiment: number | null;
  last_objection_summary: string | null;
  reminder_60min_sent: boolean;
  reminder_10min_sent: boolean;
  reminder_start_sent: boolean;
  call_id: string | null;
  created_at: string;
  updated_at: string;
  // Computed client-side
  minutesUntilStart?: number;
  isStartingSoon?: boolean;  // within 15 min
  isOverdue?: boolean;       // past scheduled time but still "scheduled"
}

export interface CreateMeetingParams {
  title: string;
  meeting_link?: string;
  scheduled_time: string;
  meeting_type?: string;
  notes?: string;
  participants?: string[];
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useScheduledMeetings() {
  const { user } = useAuth();
  const qc = useQueryClient();

  // ── Realtime ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel("scheduled-meetings-rt")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "scheduled_meetings", filter: `user_id=eq.${user.id}` },
        () => {
          qc.invalidateQueries({ queryKey: ["scheduled-meetings", user.id] });
          qc.invalidateQueries({ queryKey: ["upcoming-meetings-context", user.id] });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, qc]);

  // ── Fetch all (with computed fields) ──────────────────────────────────────
  const query = useQuery({
    queryKey: ["scheduled-meetings", user?.id],
    queryFn: async (): Promise<ScheduledMeeting[]> => {
      const { data, error } = await supabase
        .from("scheduled_meetings" as any)
        .select("*")
        .eq("user_id", user!.id)
        .order("scheduled_time", { ascending: true });
      if (error) throw error;

      const now = new Date();
      return ((data || []) as any[]).map((m) => {
        const st = parseISO(m.scheduled_time);
        const minUntil = Math.round((st.getTime() - now.getTime()) / 60_000);
        return {
          ...m,
          minutesUntilStart: minUntil,
          isStartingSoon: minUntil >= -5 && minUntil <= 15,
          isOverdue: m.status === "scheduled" && isBefore(st, addMinutes(now, -10)),
        } as ScheduledMeeting;
      });
    },
    enabled: !!user,
    staleTime: 30_000,
    refetchInterval: 60_000, // refresh every minute for countdown accuracy
  });

  // ── Upcoming (next 48h, scheduled only) ───────────────────────────────────
  const upcoming = (query.data || []).filter(
    (m) => m.status === "scheduled" && isAfter(parseISO(m.scheduled_time), addMinutes(new Date(), -5))
  );

  const startingSoon = upcoming.filter((m) => m.isStartingSoon);

  // ── Create ────────────────────────────────────────────────────────────────
  const create = useMutation({
    mutationFn: async (params: CreateMeetingParams): Promise<ScheduledMeeting> => {
      const { data, error } = await (supabase as any)
        .from("scheduled_meetings")
        .insert({
          user_id: user!.id,
          title: params.title,
          meeting_link: params.meeting_link || null,
          scheduled_time: params.scheduled_time,
          meeting_type: params.meeting_type || "other",
          notes: params.notes || null,
          participants: params.participants || [],
        })
        .select()
        .single();
      if (error) throw error;
      return data as ScheduledMeeting;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scheduled-meetings", user?.id] });
      toast.success("Meeting scheduled!");
    },
    onError: (err: any) => toast.error(err.message || "Failed to schedule meeting"),
  });

  // ── Reschedule ────────────────────────────────────────────────────────────
  const reschedule = useMutation({
    mutationFn: async ({
      meetingId,
      newTime,
    }: {
      meetingId: string;
      newTime: string;
    }): Promise<ScheduledMeeting> => {
      const { data, error } = await (supabase as any).rpc("reschedule_meeting", {
        p_meeting_id: meetingId,
        p_new_time: newTime,
      });
      if (error) throw error;
      return data as ScheduledMeeting;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scheduled-meetings", user?.id] });
      toast.success("Meeting rescheduled! Reminders reset.");
    },
    onError: (err: any) => toast.error(err.message || "Failed to reschedule meeting"),
  });

  // ── Cancel ────────────────────────────────────────────────────────────────
  const cancel = useMutation({
    mutationFn: async (meetingId: string) => {
      const { error } = await (supabase as any)
        .from("scheduled_meetings")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", meetingId)
        .eq("user_id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scheduled-meetings", user?.id] });
      toast.success("Meeting cancelled");
    },
    onError: (err: any) => toast.error(err.message || "Failed to cancel meeting"),
  });

  // ── Mark as live / ended ──────────────────────────────────────────────────
  const updateStatus = useMutation({
    mutationFn: async ({ meetingId, status }: { meetingId: string; status: MeetingStatus }) => {
      const { error } = await (supabase as any).rpc("update_meeting_status", {
        p_meeting_id: meetingId,
        p_status: status,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scheduled-meetings", user?.id] });
    },
  });

  // ── Copy link util ────────────────────────────────────────────────────────
  const copyLink = useCallback((link: string) => {
    navigator.clipboard.writeText(link).then(
      () => toast.success("Link copied!"),
      () => toast.info(`Link: ${link}`, { duration: 8000 })
    );
  }, []);

  return {
    meetings: query.data || [],
    upcoming,
    startingSoon,
    isLoading: query.isLoading,
    create,
    reschedule,
    cancel,
    updateStatus,
    copyLink,
  };
}