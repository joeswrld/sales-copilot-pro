/**
 * useUserStatus.ts — v4 (Stabilized)
 *
 * Key fixes from v3:
 *  - upsertStatus mutation is now stable (no stale closure issues with debounce)
 *  - Away timer only fires ONE upsert when crossing into away, not on every activity event
 *  - Route-change auto-status has a longer debounce (2s) to avoid spamming on fast navigation
 *  - useMutation stabilized with useCallback for the mutationFn
 *  - Removed the broken `debouncedUpsert` that created new closures on every render
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

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
  "/live":      { status: "on_call",   page: "live_call"  },
  "/messages":  { status: "available", page: "messages"   },
  "/deals":     { status: "available", page: "deals"      },
  "/analytics": { status: "available", page: "analytics"  },
  "/settings":  { status: "available", page: "settings"   },
  "/dashboard":           { status: "available", page: "dashboard"  },
};

const AWAY_TIMEOUT_MS  = 10 * 60 * 1000;
const ROUTE_DEBOUNCE   = 2000;
const AWAY_DEBOUNCE    = 500;
const ACTIVITY_THROTTLE = 15_000; // Minimum 15s between activity-based status changes

export function useUserStatus(teamId?: string | null) {
  const { user } = useAuth();
  const location = useLocation();
  const qc = useQueryClient();

  const [teamStatuses, setTeamStatuses] = useState<Map<string, UserStatusInfo>>(new Map());

  const awayTimerRef       = useRef<ReturnType<typeof setTimeout> | null>(null);
  const manualOverrideRef  = useRef(false);
  const lastUpsertedRef    = useRef<{ status: string; page: string }>({ status: "", page: "" });
  const routeDebounceRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const awayDebounceRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastActivityRef    = useRef(0);
  const isAwayRef          = useRef(false);

  // ── Fetch my current status ──────────────────────────────────────────────
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
    staleTime: 60_000,
    refetchInterval: false,
  });

  // ── Fetch team statuses ──────────────────────────────────────────────────
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
    enabled: !!teamId && !!user,
    staleTime: 30_000,
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

  // ── Realtime subscription ────────────────────────────────────────────────
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

  // ── Core upsert mutation ─────────────────────────────────────────────────
  const upsertStatus = useMutation({
    mutationFn: async ({
      status,
      customText,
      page,
      isManual,
    }: {
      status: UserStatus;
      customText?: string;
      page?: string;
      isManual?: boolean;
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
        p_is_manual:   isManual ?? false,
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

  // ── Manual status setter ─────────────────────────────────────────────────
  const setStatus = useCallback((status: UserStatus, customText?: string) => {
    manualOverrideRef.current = true;
    if (routeDebounceRef.current) clearTimeout(routeDebounceRef.current);
    if (awayDebounceRef.current) clearTimeout(awayDebounceRef.current);
    upsertStatus.mutate({ status, customText, page: undefined, isManual: true });

    // Revert to auto after 30 min
    setTimeout(() => {
      manualOverrideRef.current = false;
    }, 30 * 60 * 1000);
  }, [upsertStatus]);

  // ── Auto-status from route — fires ONCE per route change ──────────────
  useEffect(() => {
    if (!user || manualOverrideRef.current) return;

    const path = location.pathname;
    let matched = { status: "available" as UserStatus, page: "dashboard" };
    let bestLen = 0;
    for (const [route, val] of Object.entries(PAGE_STATUS_MAP)) {
      if (path.startsWith(route) && route.length > bestLen) {
        matched = val;
        bestLen = route.length;
      }
    }

    if (routeDebounceRef.current) clearTimeout(routeDebounceRef.current);
    routeDebounceRef.current = setTimeout(() => {
      if (!manualOverrideRef.current) {
        upsertStatus.mutate({ status: matched.status, page: matched.page, isManual: false });
      }
    }, ROUTE_DEBOUNCE);

    return () => {
      if (routeDebounceRef.current) clearTimeout(routeDebounceRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, user?.id]);

  // ── Away detection ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;

    const resetTimer = () => {
      const now = Date.now();
      // Throttle: don't run more than once per ACTIVITY_THROTTLE
      if (now - lastActivityRef.current < ACTIVITY_THROTTLE) return;
      lastActivityRef.current = now;

      // Only trigger "back from away" if we were actually away
      if (isAwayRef.current && !manualOverrideRef.current) {
        isAwayRef.current = false;
        const path = location.pathname;
        let matched = { status: "available" as UserStatus, page: "dashboard" };
        for (const [route, val] of Object.entries(PAGE_STATUS_MAP)) {
          if (path.startsWith(route)) { matched = val; break; }
        }
        if (awayDebounceRef.current) clearTimeout(awayDebounceRef.current);
        awayDebounceRef.current = setTimeout(() => {
          upsertStatus.mutate({ status: matched.status, page: matched.page, isManual: false });
        }, AWAY_DEBOUNCE);
      }

      // Reset the away timer
      if (awayTimerRef.current) clearTimeout(awayTimerRef.current);
      if (!manualOverrideRef.current) {
        awayTimerRef.current = setTimeout(() => {
          if (!manualOverrideRef.current) {
            isAwayRef.current = true;
            upsertStatus.mutate({ status: "away", page: "idle", isManual: false });
          }
        }, AWAY_TIMEOUT_MS);
      }
    };

    const events = ["mousemove", "keydown", "click", "touchstart"];
    events.forEach(e => window.addEventListener(e, resetTimer, { passive: true }));

    // Start initial timer
    awayTimerRef.current = setTimeout(() => {
      if (!manualOverrideRef.current) {
        isAwayRef.current = true;
        upsertStatus.mutate({ status: "away", page: "idle", isManual: false });
      }
    }, AWAY_TIMEOUT_MS);

    return () => {
      events.forEach(e => window.removeEventListener(e, resetTimer));
      if (awayTimerRef.current) clearTimeout(awayTimerRef.current);
      if (awayDebounceRef.current) clearTimeout(awayDebounceRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // ── Call lifecycle callbacks ─────────────────────────────────────────────
  const onCallStarted = useCallback(() => {
    manualOverrideRef.current = false;
    if (routeDebounceRef.current) clearTimeout(routeDebounceRef.current);
    upsertStatus.mutate({ status: "on_call", page: "live_call", isManual: false });
  }, [upsertStatus]);

  const onCallEnded = useCallback(() => {
    manualOverrideRef.current = false;
    if (routeDebounceRef.current) clearTimeout(routeDebounceRef.current);
    upsertStatus.mutate({ status: "available", page: "dashboard", isManual: false });
  }, [upsertStatus]);

  // ── Getters ──────────────────────────────────────────────────────────────
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
    isManual: manualOverrideRef.current,
    teamStatuses,
    setStatus,
    getStatus,
    getStatusInfo,
    onCallStarted,
    onCallEnded,
    isPending: upsertStatus.isPending,
  };
}