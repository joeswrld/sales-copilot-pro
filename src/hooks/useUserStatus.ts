/**
 * useUserStatus.ts — v2 (Auto-Activity Detection)
 *
 * Automatic status based on:
 *  - Current page/route  → on_call | in_meeting | available | away
 *  - Mouse/keyboard idle → away after 10 minutes
 *  - Live call active    → on_call
 *  - Manual override     → locks for 30 minutes, then reverts to auto
 *
 * DB-backed via user_statuses table + Supabase Realtime.
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
  available:  { label: "Available",    emoji: "🟢", color: "#22c55e", bgColor: "rgba(34,197,94,.15)",   description: "Ready to chat"        },
  on_call:    { label: "On a Call",    emoji: "🔴", color: "#ef4444", bgColor: "rgba(239,68,68,.15)",   description: "In a live sales call"  },
  in_meeting: { label: "In a Meeting", emoji: "📞", color: "#f59e0b", bgColor: "rgba(245,158,11,.15)",  description: "In a scheduled meeting" },
  away:       { label: "Away",         emoji: "🌙", color: "#8b5cf6", bgColor: "rgba(139,92,246,.15)",  description: "Inactive for 10+ min"  },
  busy:       { label: "Busy",         emoji: "⛔", color: "#64748b", bgColor: "rgba(100,116,139,.15)", description: "Do not disturb"        },
};

// Map route paths → auto status
const PAGE_STATUS_MAP: Record<string, { status: UserStatus; page: string }> = {
  "/dashboard/live":      { status: "on_call",    page: "live_call" },
  "/dashboard/messages":  { status: "available",  page: "messages"  },
  "/dashboard/deals":     { status: "available",  page: "deals"     },
  "/dashboard":           { status: "available",  page: "dashboard" },
  "/dashboard/analytics": { status: "available",  page: "analytics" },
  "/dashboard/settings":  { status: "available",  page: "settings"  },
};

const AWAY_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useUserStatus(teamId?: string | null) {
  const { user } = useAuth();
  const location = useLocation();
  const qc = useQueryClient();

  const [teamStatuses, setTeamStatuses] = useState<Map<string, UserStatusInfo>>(new Map());
  const awayTimerRef       = useRef<ReturnType<typeof setTimeout> | null>(null);
  const manualOverrideRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isManualRef        = useRef(false);
  const myStatusRef        = useRef<UserStatus>("available");
  const lastAutoPageRef    = useRef<string>("");

  // ── Fetch my status ────────────────────────────────────────────────────
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
    staleTime: 30_000,
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
    enabled: !!teamId,
    staleTime: 10_000,
  });

  // Build team map
  useEffect(() => {
    if (!teamStatusRows) return;
    setTeamStatuses(prev => {
      const next = new Map(prev);
      teamStatusRows.forEach((row: any) => {
        next.set(row.user_id, {
          userId:    row.user_id,
          status:    row.status,
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
          qc.invalidateQueries({ queryKey: ["team-statuses", teamId] });
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [teamId, user, qc]);

  // ── Upsert mutation ────────────────────────────────────────────────────
  const upsertStatus = useMutation({
    mutationFn: async ({
      status,
      customText,
      page,
      isManual = false,
    }: {
      status: UserStatus;
      customText?: string;
      page?: string;
      isManual?: boolean;
    }) => {
      if (!user) return;
      await (supabase as any).rpc("upsert_user_status", {
        p_status:      status,
        p_custom_text: customText ?? null,
        p_team_id:     teamId ?? null,
        p_last_page:   page ?? null,
        p_is_manual:   isManual,
      });
    },
    onMutate: ({ status }) => {
      myStatusRef.current = status;
      if (user) {
        setTeamStatuses(prev => {
          const next = new Map(prev);
          next.set(user.id, { userId: user.id, status, updatedAt: new Date().toISOString() });
          return next;
        });
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["user-status", user?.id] });
      qc.invalidateQueries({ queryKey: ["team-statuses", teamId] });
    },
  });

  // ── Manual status setter (locks for 30 min) ────────────────────────────
  const setStatus = useCallback((status: UserStatus, customText?: string) => {
    isManualRef.current = true;
    upsertStatus.mutate({ status, customText, isManual: true });

    // Clear manual override after 30 min → resume auto
    if (manualOverrideRef.current) clearTimeout(manualOverrideRef.current);
    manualOverrideRef.current = setTimeout(() => {
      isManualRef.current = false;
    }, 30 * 60 * 1000);
  }, [upsertStatus]);

  // ── Auto-status from route ─────────────────────────────────────────────
  useEffect(() => {
    if (!user || isManualRef.current) return;

    const path = location.pathname;
    // Find best matching route
    let matched = { status: "available" as UserStatus, page: "dashboard" };
    for (const [route, val] of Object.entries(PAGE_STATUS_MAP)) {
      if (path.startsWith(route)) {
        matched = val;
        // Prefer longer (more specific) match
        if (route.length > (lastAutoPageRef.current?.length ?? 0)) {
          lastAutoPageRef.current = route;
          break;
        }
      }
    }

    upsertStatus.mutate({ status: matched.status, page: matched.page, isManual: false });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, user]);

  // ── Away detection from inactivity ────────────────────────────────────
  useEffect(() => {
    if (!user) return;

    const resetTimer = () => {
      // If was away and now active → revert to available
      if (myStatusRef.current === "away" && !isManualRef.current) {
        const path = location.pathname;
        const matched = Object.entries(PAGE_STATUS_MAP).find(([r]) => path.startsWith(r));
        const newStatus = matched?.[1].status ?? "available";
        const newPage   = matched?.[1].page   ?? "dashboard";
        upsertStatus.mutate({ status: newStatus, page: newPage, isManual: false });
      }

      // Reset away timer
      if (awayTimerRef.current) clearTimeout(awayTimerRef.current);
      if (myStatusRef.current !== "on_call" && myStatusRef.current !== "in_meeting" && !isManualRef.current) {
        awayTimerRef.current = setTimeout(() => {
          if (!isManualRef.current) {
            upsertStatus.mutate({ status: "away", page: "idle", isManual: false });
          }
        }, AWAY_TIMEOUT_MS);
      }
    };

    const events = ["mousemove", "keydown", "click", "scroll", "touchstart", "focus"];
    events.forEach(e => window.addEventListener(e, resetTimer, { passive: true }));

    // Start initial timer
    awayTimerRef.current = setTimeout(() => {
      if (!isManualRef.current) {
        upsertStatus.mutate({ status: "away", page: "idle", isManual: false });
      }
    }, AWAY_TIMEOUT_MS);

    return () => {
      events.forEach(e => window.removeEventListener(e, resetTimer));
      if (awayTimerRef.current) clearTimeout(awayTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // ── Live-call auto-status (called from useLiveCall) ───────────────────
  const onCallStarted = useCallback(() => {
    isManualRef.current = false; // override any manual lock for calls
    upsertStatus.mutate({ status: "on_call", page: "live_call", isManual: false });
  }, [upsertStatus]);

  const onCallEnded = useCallback(() => {
    isManualRef.current = false;
    upsertStatus.mutate({ status: "available", page: "dashboard", isManual: false });
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