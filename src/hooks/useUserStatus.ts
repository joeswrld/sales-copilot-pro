/**
 * useUserStatus.ts — v3 (Debounced, performance-safe)
 *
 * KEY FIX: The original version fired upsert_user_status on EVERY mouse/keyboard
 * event (after 10-min away timer reset) causing dozens of concurrent DB calls
 * that froze the app on mobile/slow connections.
 *
 * Changes:
 *  - All status upserts are debounced (500ms for auto, 0ms for manual)
 *  - Away timer reset only fires DB call when status actually changes
 *  - Removed redundant mutation calls on every route change
 *  - Status stored in ref to prevent stale closure issues
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

// ─── Types ──────────────────────────────────────────────────────────────────

export type UserStatus = "available" | "on_call" | "in_meeting" | "away" | "busy";

export interface UserStatusInfo {
  userId: string;
  status: UserStatus;
  customText?: string | null;
  updatedAt: string;
  lastPage?: string | null;
}

export const STATUS_CONFIG: Record<
  UserStatus,
  { label: string; emoji: string; color: string; bgColor: string; description: string }
> = {
  available:  { label: "Available",    emoji: "🟢", color: "#22c55e", bgColor: "rgba(34,197,94,.15)",   description: "Ready to chat"         },
  on_call:    { label: "On a Call",    emoji: "🔴", color: "#ef4444", bgColor: "rgba(239,68,68,.15)",   description: "In a live sales call"   },
  in_meeting: { label: "In a Meeting", emoji: "📞", color: "#f59e0b", bgColor: "rgba(245,158,11,.15)",  description: "In a scheduled meeting" },
  away:       { label: "Away",         emoji: "🌙", color: "#8b5cf6", bgColor: "rgba(139,92,246,.15)",  description: "Inactive for 10+ min"   },
  busy:       { label: "Busy",         emoji: "⛔", color: "#64748b", bgColor: "rgba(100,116,139,.15)", description: "Do not disturb"         },
};

const PAGE_STATUS_MAP: Record<string, { status: UserStatus; page: string }> = {
  "/dashboard/live":      { status: "on_call",   page: "live_call"  },
  "/dashboard/messages":  { status: "available", page: "messages"   },
  "/dashboard/deals":     { status: "available", page: "deals"      },
  "/dashboard/analytics": { status: "available", page: "analytics"  },
  "/dashboard/settings":  { status: "available", page: "settings"   },
  "/dashboard":           { status: "available", page: "dashboard"  },
};

const AWAY_TIMEOUT_MS   = 10 * 60 * 1000; // 10 minutes
const DEBOUNCE_MS       = 1500;            // 1.5s debounce on auto status changes

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useUserStatus(teamId?: string | null) {
  const { user } = useAuth();
  const location = useLocation();
  const qc = useQueryClient();

  const [teamStatuses, setTeamStatuses] = useState<Map<string, UserStatusInfo>>(new Map());

  const awayTimerRef      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const manualOverrideRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debounceRef       = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isManualRef       = useRef(false);
  const lastUpsertedRef   = useRef<{ status: string; page: string }>({ status: "", page: "" });

  // ── Fetch my current status ────────────────────────────────────────────
  const { data: myStatusRow } = useQuery({
    queryKey: ["user-status", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from("user_statuses" as any)
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      return data as unknown as UserStatusInfo | null;
    },
    enabled: !!user,
    staleTime: 60_000,   // Only re-fetch after 1 minute
    refetchInterval: false, // No automatic polling — realtime handles updates
  });

  // ── Fetch team statuses ────────────────────────────────────────────────
  const { data: teamStatusRows } = useQuery({
    queryKey: ["team-statuses", teamId],
    queryFn: async () => {
      if (!teamId) return [];
      const { data: members } = await supabase
        .from("team_members")
        .select("user_id")
        .eq("team_id", teamId)
        .eq("status", "active");
      if (!members?.length) return [];
      const userIds = members.map((m: any) => m.user_id);
      const { data } = await supabase
        .from("user_statuses" as any)
        .select("*")
        .in("user_id", userIds);
      return (data || []) as unknown as UserStatusInfo[];
    },
    enabled:         !!teamId && !!user,
    staleTime:       30_000,
    refetchInterval: false,
  });

  // Build team map
  useEffect(() => {
    if (!teamStatusRows) return;
    setTeamStatuses(prev => {
      const next = new Map(prev);
      teamStatusRows.forEach((row: any) => {
        next.set(row.user_id, {
          userId:     row.user_id,
          status:     row.status,
          customText: row.custom_text,
          updatedAt:  row.updated_at,
          lastPage:   row.last_page,
        });
      });
      return next;
    });
  }, [teamStatusRows]);

  // ── Realtime subscription ─────────────────────────────────────────────
  useEffect(() => {
    if (!teamId || !user) return;
    const ch = supabase
      .channel(`team-statuses:${teamId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "user_statuses" },
        (payload: any) => {
          const row = payload.new as any;
          if (!row?.user_id) return;
          setTeamStatuses(prev => {
            const next = new Map(prev);
            next.set(row.user_id, {
              userId:     row.user_id,
              status:     row.status,
              customText: row.custom_text,
              updatedAt:  row.updated_at,
              lastPage:   row.last_page,
            });
            return next;
          });
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [teamId, user]);

  // ── Upsert mutation ────────────────────────────────────────────────────
  const upsertStatus = useMutation({
    mutationFn: async ({
      status,
      customText,
      page,
    }: {
      status: UserStatus;
      customText?: string;
      page?: string;
    }) => {
      if (!user) return;
      // Skip if nothing changed
      if (
        lastUpsertedRef.current.status === status &&
        lastUpsertedRef.current.page   === (page ?? "")
      ) return;

      lastUpsertedRef.current = { status, page: page ?? "" };

      await (supabase as any).rpc("upsert_user_status", {
        p_status:      status,
        p_custom_text: customText ?? null,
        p_team_id:     teamId ?? null,
        p_last_page:   page ?? null,
        p_is_manual:   isManualRef.current,
      });
    },
    onMutate: ({ status }) => {
      if (user) {
        setTeamStatuses(prev => {
          const next = new Map(prev);
          next.set(user.id, {
            userId:    user.id,
            status,
            updatedAt: new Date().toISOString(),
          });
          return next;
        });
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["user-status", user?.id] });
      if (teamId) qc.invalidateQueries({ queryKey: ["team-statuses", teamId] });
    },
  });

  // ── Debounced upsert helper ────────────────────────────────────────────
  const debouncedUpsert = useCallback((
    status: UserStatus, page?: string, delay = DEBOUNCE_MS
  ) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      upsertStatus.mutate({ status, page });
    }, delay);
  }, [upsertStatus]);

  // ── Manual status setter ───────────────────────────────────────────────
  const setStatus = useCallback((status: UserStatus, customText?: string) => {
    isManualRef.current = true;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    upsertStatus.mutate({ status, customText, page: undefined });

    // Revert to auto after 30 min
    if (manualOverrideRef.current) clearTimeout(manualOverrideRef.current);
    manualOverrideRef.current = setTimeout(() => {
      isManualRef.current = false;
    }, 30 * 60 * 1000);
  }, [upsertStatus]);

  // ── Auto-status from route — fires ONCE per route change ──────────────
  useEffect(() => {
    if (!user || isManualRef.current) return;

    const path = location.pathname;
    let matched = { status: "available" as UserStatus, page: "dashboard" };

    // Find most-specific matching route
    let bestLen = 0;
    for (const [route, val] of Object.entries(PAGE_STATUS_MAP)) {
      if (path.startsWith(route) && route.length > bestLen) {
        matched = val;
        bestLen = route.length;
      }
    }

    debouncedUpsert(matched.status, matched.page, 800);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, user?.id]);

  // ── Away detection — only updates status when it actually changes ──────
  useEffect(() => {
    if (!user) return;

    const resetTimer = () => {
      // Only trigger "back from away" if we were actually away
      if (
        lastUpsertedRef.current.status === "away" &&
        !isManualRef.current
      ) {
        const path = location.pathname;
        let matched = { status: "available" as UserStatus, page: "dashboard" };
        for (const [route, val] of Object.entries(PAGE_STATUS_MAP)) {
          if (path.startsWith(route)) { matched = val; break; }
        }
        debouncedUpsert(matched.status, matched.page, 0);
      }

      // Reset the away timer
      if (awayTimerRef.current) clearTimeout(awayTimerRef.current);
      if (!isManualRef.current) {
        awayTimerRef.current = setTimeout(() => {
          if (!isManualRef.current) {
            debouncedUpsert("away", "idle", 0);
          }
        }, AWAY_TIMEOUT_MS);
      }
    };

    const events = ["mousemove", "keydown", "click", "scroll", "touchstart", "focus"];
    // Use passive & throttle at the listener level
    let lastEvent = 0;
    const throttledReset = () => {
      const now = Date.now();
      if (now - lastEvent < 10_000) return; // max once per 10s
      lastEvent = now;
      resetTimer();
    };

    events.forEach(e => window.addEventListener(e, throttledReset, { passive: true }));

    // Start initial timer
    awayTimerRef.current = setTimeout(() => {
      if (!isManualRef.current) debouncedUpsert("away", "idle", 0);
    }, AWAY_TIMEOUT_MS);

    return () => {
      events.forEach(e => window.removeEventListener(e, throttledReset));
      if (awayTimerRef.current) clearTimeout(awayTimerRef.current);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // ── Call lifecycle callbacks ───────────────────────────────────────────
  const onCallStarted = useCallback(() => {
    isManualRef.current = false;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    upsertStatus.mutate({ status: "on_call", page: "live_call" });
  }, [upsertStatus]);

  const onCallEnded = useCallback(() => {
    isManualRef.current = false;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    upsertStatus.mutate({ status: "available", page: "dashboard" });
  }, [upsertStatus]);

  // ── Getters ───────────────────────────────────────────────────────────
  const myStatus: UserStatus =
    (teamStatuses.get(user?.id ?? "")?.status as UserStatus) ??
    (myStatusRow?.status as UserStatus) ??
    "available";

  const getStatus = useCallback(
    (uid: string): UserStatus => (teamStatuses.get(uid)?.status as UserStatus) ?? "available",
    [teamStatuses]
  );

  const getStatusInfo = useCallback(
    (uid: string): UserStatusInfo | null => teamStatuses.get(uid) ?? null,
    [teamStatuses]
  );

  return {
    myStatus,
    myCustomText: teamStatuses.get(user?.id ?? "")?.customText ?? null,
    isManual: isManualRef.current,
    teamStatuses,
    setStatus,
    getStatus,
    getStatusInfo,
    onCallStarted,
    onCallEnded,
    isPending: upsertStatus.isPending,
  };
}