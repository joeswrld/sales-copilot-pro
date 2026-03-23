/**
 * useCalendar.ts
 *
 * Manages Google Calendar connection and upcoming meeting sync.
 *
 * Fixes applied:
 *  1. Ensures a google_calendar integration row exists before trying to connect
 *     (existing users won't have one from the signup trigger).
 *  2. Better error surfacing — logs the actual edge-function error body so you
 *     can see what went wrong instead of a generic non-2xx toast.
 *  3. The connect() call now upserts the row first so the oauth-callback UPDATE
 *     always finds a matching row.
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

  // ── Ensure integration row exists for this user ────────────────────────────
  // The signup trigger only seeds the 6 default providers; google_calendar is
  // NOT in that list, so existing users have no row. Without a row the
  // oauth-callback UPDATE finds nothing and the connection silently fails.
  const ensureIntegrationRow = useCallback(async () => {
    if (!user?.id) return;
    await supabase
      .from("integrations")
      .upsert(
        { user_id: user.id, provider: "google_calendar", status: "disconnected" },
        { onConflict: "user_id,provider", ignoreDuplicates: true }
      );
  }, [user?.id]);

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

  // ── Listen for OAuth popup success ────────────────────────────────────────
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

  // ── Check for legacy ?calendar= query param after redirect (fallback) ─────
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

  // ── Connect ───────────────────────────────────────────────────────────────
  const connect = useCallback(async () => {
    if (!user?.id || isConnecting) return;
    setIsConnecting(true);
    try {
      // 1. Make sure the integration row exists so the callback UPDATE lands
      await ensureIntegrationRow();

      // 2. Get the OAuth URL from the edge function
      const redirectUri = `${window.location.origin}/dashboard/live`;
      const { data, error } = await supabase.functions.invoke("oauth-connect", {
        body: { provider: "google_calendar", redirect_uri: redirectUri },
      });

      if (error) {
        // Surface the real error message from the edge function response body
        let detail = error.message ?? "Unknown error";
        try {
          // FunctionsHttpError exposes .context with the response body
          const ctx = (error as any).context;
          if (ctx) {
            const bodyText = typeof ctx === "string" ? ctx : await ctx.text?.();
            const parsed = bodyText ? JSON.parse(bodyText) : null;
            if (parsed?.error) detail = parsed.error;
          }
        } catch {
          // ignore parse errors — use the message we already have
        }
        throw new Error(detail);
      }
      if (data?.error) throw new Error(data.error);

      // 3. Open OAuth popup
      const w = 600, h = 700;
      const left = window.screenX + (window.innerWidth - w) / 2;
      const top  = window.screenY + (window.innerHeight - h) / 2;
      window.open(
        data.url,
        "oauth-popup",
        `width=${w},height=${h},left=${left},top=${top},popup=1`,
      );
    } catch (err: any) {
      console.error("Calendar connect error:", err);
      toast.error(err.message || "Failed to start Google Calendar connection");
    } finally {
      setIsConnecting(false);
    }
  }, [user?.id, isConnecting, ensureIntegrationRow]);

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
      if (error) {
        // Try to surface a readable message
        let detail = error.message ?? "Sync failed";
        try {
          const ctx = (error as any).context;
          if (ctx) {
            const bodyText = typeof ctx === "string" ? ctx : await ctx.text?.();
            const parsed = bodyText ? JSON.parse(bodyText) : null;
            if (parsed?.error) detail = parsed.error;
          }
        } catch { /* ignore */ }
        throw new Error(detail);
      }
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
