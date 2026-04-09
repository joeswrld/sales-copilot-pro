/**
 * useTeamMinuteUsage.ts
 *
 * Fetches the shared team minute pool from get_team_usage_summary() RPC.
 * Falls back to the personal useMinuteUsage() hook for solo users.
 *
 * Provides a single unified usage object so UI components don't need to
 * know whether the user is on a team or solo plan.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTeam } from "@/hooks/useTeam";
import { useMinuteUsage } from "@/hooks/useMinuteUsage";

// ── Types ─────────────────────────────────────────────────────────────────

export interface MemberBreakdown {
  user_id:      string;
  full_name:    string | null;
  email:        string | null;
  minutes_used: number;
}

export interface TeamMinuteUsage {
  teamId:             string | null;
  planName:           string;
  minutesLimit:       number;   // -1 = unlimited
  minutesUsed:        number;
  minutesRemaining:   number;   // -1 = unlimited
  isUnlimited:        boolean;
  isAtLimit:          boolean;
  isNearLimit:        boolean;
  pct:                number;   // 0-100
  isTeamPlan:         boolean;
  memberBreakdown:    MemberBreakdown[];

  // Human-readable labels
  minutesUsedLabel:     string;
  minuteLimitLabel:     string;
  minutesRemainingLabel:string;

  // Hours (for UI display)
  hoursUsed:      string;
  hoursLimit:     string | null;
  hoursRemaining: string | null;
}

// ── Helper ────────────────────────────────────────────────────────────────

function fmtMins(mins: number): string {
  if (mins < 60) return `${mins} min`;
  const h = (mins / 60).toFixed(1);
  return `${h}h`;
}

function hoursOf(mins: number): string {
  return (mins / 60).toFixed(1);
}

// ── Hook ──────────────────────────────────────────────────────────────────

export function useTeamMinuteUsage(): {
  usage: TeamMinuteUsage | null;
  isLoading: boolean;
} {
  const { user }          = useAuth();
  const { team }          = useTeam();
  const teamId            = team?.id ?? null;
  const qc                = useQueryClient();

  // Personal fallback (used when teamId is null)
  const { usage: soloUsage, isLoading: soloLoading } = useMinuteUsage();

  // Realtime invalidation
  useEffect(() => {
    if (!teamId) return;
    const ch = supabase
      .channel(`team-sub-usage:${teamId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "subscriptions" }, () => {
        qc.invalidateQueries({ queryKey: ["team-minute-usage", teamId] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "team_minute_usage" }, () => {
        qc.invalidateQueries({ queryKey: ["team-minute-usage", teamId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [teamId, qc]);

  const teamQuery = useQuery({
    queryKey: ["team-minute-usage", teamId],
    queryFn: async (): Promise<TeamMinuteUsage | null> => {
      if (!teamId) return null;

      const { data, error } = await supabase.rpc("get_team_usage_summary", {
        p_team_id: teamId,
      });

      if (error) {
        console.error("get_team_usage_summary error:", error);
        return null;
      }
      if (!data) return null;

      const d              = data as any;
      const limit: number  = d.minutes_limit ?? -1;
      const used: number   = d.minutes_used  ?? 0;
      const unlimited      = d.is_unlimited  ?? (limit < 0);
      const remaining      = unlimited ? -1 : Math.max(0, limit - used);
      const pct            = unlimited ? 0 : Math.min(100, limit > 0 ? Math.round((used / limit) * 100) : 0);

      return {
        teamId,
        planName:              d.plan_name ?? "Unknown",
        minutesLimit:          limit,
        minutesUsed:           used,
        minutesRemaining:      remaining,
        isUnlimited:           unlimited,
        isAtLimit:             !unlimited && used >= limit,
        isNearLimit:           !unlimited && pct >= 80 && used < limit,
        pct,
        isTeamPlan:            true,
        memberBreakdown:       (d.member_breakdown as MemberBreakdown[]) ?? [],

        minutesUsedLabel:      fmtMins(used),
        minuteLimitLabel:      unlimited ? "Unlimited" : fmtMins(limit),
        minutesRemainingLabel: unlimited ? "Unlimited" : fmtMins(remaining),

        hoursUsed:      hoursOf(used),
        hoursLimit:     unlimited ? null : hoursOf(limit),
        hoursRemaining: unlimited ? null : hoursOf(Math.max(0, remaining)),
      };
    },
    enabled:         !!user && !!teamId,
    staleTime:       30_000,
    refetchInterval: 60_000,
  });

  // ── Return ───────────────────────────────────────────────────────────
  if (teamId) {
    // Team user — prefer team data
    if (teamQuery.data) return { usage: teamQuery.data, isLoading: false };
    return { usage: null, isLoading: teamQuery.isLoading };
  }

  // Solo user — adapt personal usage to TeamMinuteUsage shape
  if (!soloUsage) return { usage: null, isLoading: soloLoading };

  const su    = soloUsage;
  const limit = su.minuteLimit;
  const used  = su.minutesUsed;
  const unlimited = su.isUnlimited;
  const remaining = unlimited ? -1 : Math.max(0, limit - used);

  const adapted: TeamMinuteUsage = {
    teamId:              null,
    planName:            su.planName,
    minutesLimit:        limit,
    minutesUsed:         used,
    minutesRemaining:    remaining,
    isUnlimited:         unlimited,
    isAtLimit:           su.isAtLimit,
    isNearLimit:         su.isNearLimit,
    pct:                 su.pct,
    isTeamPlan:          false,
    memberBreakdown:     [],

    minutesUsedLabel:      su.minutesUsedLabel,
    minuteLimitLabel:      su.minuteLimitLabel,
    minutesRemainingLabel: su.minutesRemainingLabel,

    hoursUsed:      hoursOf(used),
    hoursLimit:     unlimited ? null : hoursOf(limit),
    hoursRemaining: unlimited ? null : hoursOf(Math.max(0, remaining)),
  };

  return { usage: adapted, isLoading: soloLoading };
}