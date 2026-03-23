/**
 * useCalendar.ts
 *
 * Manages Google Calendar connection and upcoming meeting sync.
 *
 * Fix: connect() now uses the same popup OAuth pattern as other integrations
 * (goes through oauth-connect edge function which attaches the JWT), instead
 * of a bare redirect that had no Authorization header.
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
  const [isConnecting, setIsConnecting] = useState(false);
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
    refetchInterval: 10_000,
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
    refetchInterval: 60_000,
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

  // ── Listen for OAuth popup success (same pattern as useSettings.ts) ───────
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === "oauth-success" && event.data?.provider === "google_calendar") {
        queryClient.invalidateQueries({ queryKey: ["calendar-integration"] });
        queryClient.invalidateQueries({ queryKey: ["upcoming-meetings"] });
        toast.success("Google Calendar connected! Syncing your meetings…");
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [queryClient]);

  // ── Check for legacy ?calendar= query param after redirect (fallback) ────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("calendar") === "connected") {
      toast.success("Google Calendar connected! Syncing your meetings…");
      queryClient.invalidateQueries({ queryKey: ["calendar-integration"] });
      queryClient.invalidateQueries({ queryKey: ["upcoming-meetings"] });
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

  // ── Connect — uses oauth-connect edge function (same as other integrations)
  // This ensures the JWT Authorization header is sent automatically by
  // supabase.functions.invoke, fixing the 401 "Missing authorization header".
  const connect = useCallback(async () => {
    if (!user?.id || isConnecting) return;
    setIsConnecting(true);
    try {
      const redirectUri = `${window.location.origin}/dashboard/live`;
      const { data, error } = await supabase.functions.invoke("oauth-connect", {
        body: { provider: "google_calendar", redirect_uri: redirectUri },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // Open in a popup (same as Zoom, Slack, etc. in SettingsPage)
      const w = 600, h = 700;
      const left = window.screenX + (window.innerWidth - w) / 2;
      const top  = window.screenY + (window.innerHeight - h) / 2;
      window.open(
        data.url,
        "oauth-popup",
        `width=${w},height=${h},left=${left},top=${top},popup=1`,
      );
    } catch (err: any) {
      toast.error(err.message || "Failed to start Google Calendar connection");
    } finally {
      setIsConnecting(false);
    }
  }, [user?.id, isConnecting]);

  // ── Disconnect ────────────────────────────────────────────────────────────
  const disconnect = useMutation({
    mutationFn: async () => {
      if (!user?.id) return;
      const { error } = await supabase.functions.invoke("oauth-disconnect", {
        body: { provider: "google_calendar" },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar-integration"] });
      queryClient.invalidateQueries({ queryKey: ["upcoming-meetings"] });
      toast.success("Google Calendar disconnected.");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to disconnect Google Calendar");
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
    isConnecting,
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
