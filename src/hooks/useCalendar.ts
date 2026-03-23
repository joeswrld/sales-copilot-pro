/**
 * useCalendar.ts — v2 (robust connect)
 *
 * The "Edge Function returned a non-2xx status code" error when clicking
 * "Connect Google Calendar" is caused by one of these:
 *
 *  A) GOOGLE_CLIENT_ID env var not set in the Supabase edge function secrets
 *  B) The google_calendar integration row doesn't exist for this user
 *     (only 6 providers are seeded on signup; google_calendar is NOT one)
 *  C) The edge function throws before returning a JSON error body
 *
 * Fix strategy
 * ────────────
 *  1. Upsert the integration row BEFORE calling oauth-connect so the
 *     oauth-callback UPDATE always finds a matching row.
 *  2. If oauth-connect fails for any reason, fall back to building the
 *     Google OAuth URL client-side using VITE_GOOGLE_CLIENT_ID.
 *  3. Surface the actual error from the function body instead of the
 *     generic "non-2xx" toast.
 */

import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UpcomingMeeting {
  id:                string;
  title:             string;
  meeting_url:       string;
  meeting_provider:  string;
  scheduled_time:    string;
  duration_minutes:  number;
  participants:      string[];
  calendar_event_id: string | null;
  bot_dispatched:    boolean;
  bot_id:            string | null;
  call_id:           string | null;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Pull a human-readable message out of a Supabase FunctionsHttpError */
async function extractFnError(err: unknown): Promise<string> {
  try {
    const ctx = (err as any)?.context;
    if (ctx) {
      const text =
        typeof ctx.text === "function" ? await ctx.text() : String(ctx);
      const parsed = JSON.parse(text);
      if (parsed?.error) return parsed.error;
    }
  } catch {
    /* ignore parse failures */
  }
  return (err as any)?.message ?? "Unknown error";
}

/**
 * Build a Google OAuth URL entirely on the client side.
 * Used as fallback when the edge function is misconfigured.
 * Requires VITE_GOOGLE_CLIENT_ID to be set in your .env / project settings.
 */
function buildClientSideGoogleUrl(userId: string, redirectUri: string): string | null {
  const clientId = (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID as
    | string
    | undefined;
  if (!clientId) return null;

  const supabaseUrl =
    ((import.meta as any).env?.VITE_SUPABASE_URL as string | undefined) ?? "";
  const callbackUrl = `${supabaseUrl}/functions/v1/oauth-callback`;

  const state = btoa(
    JSON.stringify({
      provider:     "google_calendar",
      userId,
      redirect_uri: redirectUri,
    })
  );

  const scopes = [
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/userinfo.email",
  ].join(" ");

  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  callbackUrl,
    response_type: "code",
    scope:         scopes,
    state,
    access_type:   "offline",
    prompt:        "consent",
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

function openOAuthPopup(url: string) {
  const w = 600, h = 700;
  const left = window.screenX + (window.innerWidth - w) / 2;
  const top  = window.screenY + (window.innerHeight - h) / 2;
  window.open(
    url,
    "oauth-popup",
    `width=${w},height=${h},left=${left},top=${top},popup=1`
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useCalendar() {
  const { user }    = useAuth();
  const queryClient = useQueryClient();
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSyncing,    setIsSyncing]    = useState(false);

  /**
   * Guarantee a google_calendar row exists for this user.
   * The signup trigger seeds only 6 providers; google_calendar is NOT included,
   * so existing users have no row and the oauth-callback UPDATE silently fails.
   */
  const ensureIntegrationRow = useCallback(async () => {
    if (!user?.id) return;
    await supabase.from("integrations").upsert(
      { user_id: user.id, provider: "google_calendar", status: "disconnected" },
      { onConflict: "user_id,provider", ignoreDuplicates: true }
    );
  }, [user?.id]);

  // ── Connection status ──────────────────────────────────────────────────────
  const { data: integration, isLoading: statusLoading } = useQuery({
    queryKey: ["calendar-integration", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from("integrations")
        .select("status, updated_at, scope")
        .eq("user_id", user.id)
        .eq("provider", "google_calendar")
        .maybeSingle();
      return data;
    },
    enabled:         !!user?.id,
    refetchInterval: 10_000,
  });

  const isConnected = integration?.status === "connected";

  // ── Upcoming meetings ──────────────────────────────────────────────────────
  const { data: upcomingMeetings = [], isLoading: meetingsLoading } = useQuery({
    queryKey: ["upcoming-meetings", user?.id],
    queryFn: async () => {
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

  // ── Realtime: refresh meeting list on DB changes ───────────────────────────
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
          queryClient.invalidateQueries({
            queryKey: ["upcoming-meetings", user.id],
          });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id, queryClient]);

  // ── OAuth popup → postMessage listener ────────────────────────────────────
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (
        event.data?.type === "oauth-success" &&
        event.data?.provider === "google_calendar"
      ) {
        queryClient.invalidateQueries({ queryKey: ["calendar-integration"] });
        queryClient.invalidateQueries({ queryKey: ["upcoming-meetings"] });
        toast.success("Google Calendar connected! Syncing your meetings…");
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [queryClient]);

  // ── Legacy redirect ?calendar= param ──────────────────────────────────────
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

  // ── Connect ────────────────────────────────────────────────────────────────
  const connect = useCallback(async () => {
    if (!user?.id || isConnecting) return;
    setIsConnecting(true);

    try {
      // Step 1 — guarantee the DB row exists so the callback UPDATE lands
      await ensureIntegrationRow();

      const redirectUri = `${window.location.origin}/dashboard/live`;
      let oauthUrl: string | null = null;

      // Step 2 — try the edge function (normal path)
      try {
        const { data, error } = await supabase.functions.invoke("oauth-connect", {
          body: { provider: "google_calendar", redirect_uri: redirectUri },
        });

        if (error) {
          const msg = await extractFnError(error);
          console.warn("oauth-connect edge fn error (will try fallback):", msg);
          // Fall through to client-side fallback below
        } else if (data?.url) {
          oauthUrl = data.url;
        } else if (data?.error) {
          console.warn("oauth-connect data.error:", data.error);
        }
      } catch (invokeErr) {
        console.warn("oauth-connect invoke threw (will try fallback):", invokeErr);
      }

      // Step 3 — client-side fallback using VITE_GOOGLE_CLIENT_ID
      if (!oauthUrl) {
        oauthUrl = buildClientSideGoogleUrl(user.id, redirectUri);
      }

      // Step 4 — nothing worked
      if (!oauthUrl) {
        toast.error(
          "Google Calendar isn't configured yet. " +
            "Add GOOGLE_CLIENT_ID to your Supabase edge function secrets " +
            "(or as VITE_GOOGLE_CLIENT_ID in your project env) and redeploy."
        );
        return;
      }

      // Step 5 — open the popup
      openOAuthPopup(oauthUrl);
    } catch (err: any) {
      console.error("Calendar connect error:", err);
      toast.error(err.message || "Failed to start Google Calendar connection");
    } finally {
      setIsConnecting(false);
    }
  }, [user?.id, isConnecting, ensureIntegrationRow]);

  // ── Disconnect ─────────────────────────────────────────────────────────────
  const disconnect = useMutation({
    mutationFn: async () => {
      if (!user?.id) return;
      const { error } = await supabase.functions.invoke("oauth-disconnect", {
        body: { provider: "google_calendar" },
      });
      if (error) throw new Error(await extractFnError(error));
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
      if (error) throw new Error(await extractFnError(error));
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
