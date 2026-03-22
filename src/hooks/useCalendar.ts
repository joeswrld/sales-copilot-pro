/**
 * useCalendar.ts
 *
 * Manages Google Calendar connection and upcoming meeting sync.
 *
 * Returns:
 *   isConnected       — whether Google Calendar is linked
 *   isConnecting      — OAuth flow in progress
 *   upcomingMeetings  — list of meetings from scheduled_calls table
 *   isLoading         — fetching meetings
 *   connect()         — starts Google OAuth flow
 *   disconnect()      — removes the integration
 *   syncNow()         — manually triggers calendar re-sync
 *   isSyncing         — sync in progress
 */

import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UpcomingMeeting {
  id:               string;
  title:            string;
  meeting_url:      string;
  meeting_provider: string;
  scheduled_time:   string;
  duration_minutes: number;
  participants:     string[];
  calendar_event_id: string | null;
  bot_dispatched:   boolean;
  bot_id:           string | null;
  call_id:          string | null;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useCalendar() {
  const { user }      = useAuth();
  const queryClient   = useQueryClient();
  const [isSyncing, setIsSyncing] = useState(false);

  // ── Connection status ──────────────────────────────────────────────────────
  const { data: integration, isLoading: statusLoading } = useQuery({
    queryKey: ["calendar-integration", user?.id],
    queryFn:  async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from("integrations")
        .select("status, updated_at, scope")
        .eq("user_id", user.id)
        .eq("provider", "google_calendar")
        .maybeSingle();
      return data;
    },
    enabled:       !!user?.id,
    refetchInterval: 10_000, // poll every 10s so UI updates after OAuth redirect
  });

  const isConnected = integration?.status === "connected";

  // ── Upcoming meetings ──────────────────────────────────────────────────────
  const { data: upcomingMeetings = [], isLoading: meetingsLoading } = useQuery({
    queryKey: ["upcoming-meetings", user?.id],
    queryFn:  async () => {
      if (!user?.id) return [];
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("scheduled_calls")
        .select("*")
        .eq("user_id", user.id)
        .gte("scheduled_time", now)
        .order("scheduled_time", { ascending: true })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as UpcomingMeeting[];
    },
    enabled:         !!user?.id && isConnected,
    refetchInterval: 60_000, // refresh every minute
  });

  // ── Realtime: update list when new meetings are synced ────────────────────
  useEffect(() => {
    if (!user?.id) return;

    const ch = supabase
      .channel(`scheduled-calls:${user.id}`)
      .on(
        "postgres_changes",
        {
          event:  "*",
          schema: "public",
          table:  "scheduled_calls",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["upcoming-meetings", user.id] });
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, [user?.id, queryClient]);

  // ── Check for calendar=connected in URL after OAuth redirect ─────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("calendar") === "connected") {
      toast.success("Google Calendar connected! Syncing your meetings…");
      queryClient.invalidateQueries({ queryKey: ["calendar-integration"] });
      queryClient.invalidateQueries({ queryKey: ["upcoming-meetings"] });
      // Clean up URL
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (params.get("calendar") === "denied") {
      toast.info("Calendar connection cancelled.");
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (params.get("calendar") === "error") {
      toast.error("Failed to connect Google Calendar. Please try again.");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [queryClient]);

  // ── Connect — starts OAuth ─────────────────────────────────────────────────
  const connect = useCallback(async () => {
    if (!user?.id) return;
    const supabaseUrl = (supabase as any).supabaseUrl as string;
    const oauthUrl    = `${supabaseUrl}/functions/v1/google-oauth?action=connect&user_id=${user.id}`;
    window.location.href = oauthUrl;
  }, [user?.id]);

  // ── Disconnect ────────────────────────────────────────────────────────────
  const disconnect = useMutation({
    mutationFn: async () => {
      if (!user?.id) return;
      await supabase
        .from("integrations")
        .update({
          status:                  "disconnected",
          access_token_encrypted:  null,
          refresh_token_encrypted: null,
          expires_at:              null,
        } as any)
        .eq("user_id", user.id)
        .eq("provider", "google_calendar");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar-integration"] });
      queryClient.invalidateQueries({ queryKey: ["upcoming-meetings"] });
      toast.success("Google Calendar disconnected.");
    },
  });

  // ── Manual sync ───────────────────────────────────────────────────────────
  const syncNow = useCallback(async () => {
    if (!user?.id || isSyncing) return;
    setIsSyncing(true);
    try {
      const { error } = await supabase.functions.invoke("sync-google-calendar", {
        body: { user_id: user.id },
      });
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["upcoming-meetings"] });
      toast.success("Calendar synced!");
    } catch (e: any) {
      toast.error("Sync failed: " + (e?.message ?? "unknown error"));
    } finally {
      setIsSyncing(false);
    }
  }, [user?.id, isSyncing, queryClient]);

  return {
    isConnected,
    isLoading:       statusLoading || meetingsLoading,
    upcomingMeetings,
    connect,
    disconnect:      disconnect.mutate,
    isDisconnecting: disconnect.isPending,
    syncNow,
    isSyncing,
    integration,
  };
}
