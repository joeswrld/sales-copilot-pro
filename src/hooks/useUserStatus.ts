/**
 * useUserStatus.ts
 *
 * DB-backed user status with Supabase Realtime sync.
 * Replaces the localStorage + broadcast approach in MessagesPage.
 *
 * Features:
 *  - Persists to user_statuses table via upsert_user_status RPC
 *  - Subscribes to realtime changes for the whole team
 *  - Auto-sets "on_call" when a live call is detected
 *  - Auto-reverts to "available" when call ends
 *  - Sets "away" after 10 minutes of inactivity
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

// ─── Types ──────────────────────────────────────────────────────────────────

export type UserStatus = "available" | "on_call" | "in_meeting" | "away" | "busy";

export interface UserStatusInfo {
  userId: string;
  status: UserStatus;
  customText?: string | null;
  updatedAt: string;
}

export const STATUS_CONFIG: Record<
  UserStatus,
  { label: string; emoji: string; color: string; bgColor: string }
> = {
  available:  { label: "Available",    emoji: "🟢", color: "#22c55e", bgColor: "rgba(34,197,94,.15)"   },
  on_call:    { label: "On a Call",    emoji: "🔴", color: "#ef4444", bgColor: "rgba(239,68,68,.15)"   },
  in_meeting: { label: "In a Meeting", emoji: "📞", color: "#f59e0b", bgColor: "rgba(245,158,11,.15)"  },
  away:       { label: "Away",         emoji: "🌙", color: "#8b5cf6", bgColor: "rgba(139,92,246,.15)"  },
  busy:       { label: "Busy",         emoji: "⛔", color: "#64748b", bgColor: "rgba(100,116,139,.15)" },
};

const AWAY_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

// ─── Main hook ──────────────────────────────────────────────────────────────

export function useUserStatus(teamId?: string | null) {
  const { user } = useAuth();
  const qc = useQueryClient();

  // Map: userId → status info
  const [teamStatuses, setTeamStatuses] = useState<Map<string, UserStatusInfo>>(new Map());
  const prevStatusRef = useRef<UserStatus>("available");
  const awayTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const myStatusRef   = useRef<UserStatus>("available");

  // ── Fetch all team statuses ────────────────────────────────────────────
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

  const { data: teamStatusRows } = useQuery({
    queryKey: ["team-statuses", teamId],
    queryFn: async () => {
      if (!teamId) return [];
      // Get all active team member user_ids
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

  // Populate team statuses map
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
      .on(
        "postgres_changes",
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
            });
            return next;
          });
          // Invalidate query so fresh data is fetched on next mount
          qc.invalidateQueries({ queryKey: ["team-statuses", teamId] });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, [teamId, user, qc]);

  // ── Upsert mutation ───────────────────────────────────────────────────
  const upsertStatus = useMutation({
    mutationFn: async ({
      status,
      customText,
    }: {
      status: UserStatus;
      customText?: string;
    }) => {
      if (!user) return;
      await (supabase as any).rpc("upsert_user_status", {
        p_status:      status,
        p_custom_text: customText ?? null,
        p_team_id:     teamId ?? null,
      });
    },
    onMutate: ({ status }) => {
      myStatusRef.current = status;
      // Optimistic update
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
      qc.invalidateQueries({ queryKey: ["team-statuses", teamId] });
    },
  });

  // ── Public setter ─────────────────────────────────────────────────────
  const setStatus = useCallback(
    (status: UserStatus, customText?: string) => {
      prevStatusRef.current = myStatusRef.current;
      upsertStatus.mutate({ status, customText });
    },
    [upsertStatus]
  );

  // ── Away detection ────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;

    const reset = () => {
      if (myStatusRef.current === "away") {
        // User is back — revert to available
        setStatus("available");
      }
      if (awayTimerRef.current) clearTimeout(awayTimerRef.current);
      if (myStatusRef.current === "available") {
        awayTimerRef.current = setTimeout(() => {
          setStatus("away");
        }, AWAY_TIMEOUT_MS);
      }
    };

    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    events.forEach(e => window.addEventListener(e, reset, { passive: true }));

    // Start timer
    awayTimerRef.current = setTimeout(() => {
      if (myStatusRef.current === "available") setStatus("away");
    }, AWAY_TIMEOUT_MS);

    return () => {
      events.forEach(e => window.removeEventListener(e, reset));
      if (awayTimerRef.current) clearTimeout(awayTimerRef.current);
    };
  }, [user, setStatus]);

  // ── Live-call auto-status ─────────────────────────────────────────────
  // Called from useLiveCall when a call starts/ends
  const onCallStarted = useCallback(() => {
    prevStatusRef.current = myStatusRef.current;
    setStatus("on_call");
  }, [setStatus]);

  const onCallEnded = useCallback(() => {
    setStatus(prevStatusRef.current === "on_call" ? "available" : prevStatusRef.current);
  }, [setStatus]);

  // ── Getters ───────────────────────────────────────────────────────────
  const myStatus: UserStatus =
    (teamStatuses.get(user?.id ?? "")?.status as UserStatus) ??
    (myStatusRow?.status as UserStatus) ??
    "available";

  const getStatus = useCallback(
    (uid: string): UserStatus =>
      (teamStatuses.get(uid)?.status as UserStatus) ?? "available",
    [teamStatuses]
  );

  const getStatusInfo = useCallback(
    (uid: string): UserStatusInfo | null =>
      teamStatuses.get(uid) ?? null,
    [teamStatuses]
  );

  return {
    myStatus,
    myCustomText: teamStatuses.get(user?.id ?? "")?.customText ?? null,
    teamStatuses,
    setStatus,
    getStatus,
    getStatusInfo,
    onCallStarted,
    onCallEnded,
    isPending: upsertStatus.isPending,
  };
}
