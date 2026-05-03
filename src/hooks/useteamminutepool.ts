/**
 * useTeamMinutePool.ts — v1
 *
 * Single source of truth for minute usage across all team members.
 *
 * Key behaviours:
 *  - Uses get_team_minute_pool() RPC which resolves the team subscription
 *    for both admin and regular members transparently.
 *  - Subscribes to Supabase Realtime on the `subscriptions` table so that
 *    when an admin purchases extra minutes the UI updates instantly for every
 *    active team member — no page refresh required.
 *  - Works for solo users too (no team).
 *  - Returns a flag `isAdmin` so the UI can conditionally show "Buy minutes".
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { formatMinutes } from "@/config/plans";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MemberBreakdown {
  user_id: string;
  full_name: string | null;
  email: string | null;
  minutes_used: number;
}

export interface TeamMinutePool {
  teamId: string | null;
  subscriptionId: string | null;
  planName: string;

  /** Base minutes from the plan (no extras) */
  baseMinutes: number;
  /** Extra minutes purchased on top */
  extraMinutes: number;
  /** baseMinutes + extraMinutes (or -1 for unlimited) */
  totalMinutes: number;
  /** Minutes consumed so far this cycle */
  minutesUsed: number;
  /** Remaining minutes (or -1 for unlimited) */
  remaining: number;

  isUnlimited: boolean;
  isAtLimit: boolean;
  isNearLimit: boolean;
  /** 0-100 */
  pct: number;

  isTeamPlan: boolean;
  /** True when the current user is the admin / can buy more minutes */
  isAdmin: boolean;

  memberBreakdown: MemberBreakdown[];
  extraMinutesExpiresAt: string | null;

  // Human-readable labels
  usedLabel: string;
  totalLabel: string;
  remainingLabel: string;
  extraLabel: string;

  // Hours display
  hoursUsed: string;
  hoursTotal: string | null;
  hoursRemaining: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function hrs(mins: number): string {
  return (mins / 60).toFixed(1);
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useTeamMinutePool(): { pool: TeamMinutePool | null; isLoading: boolean } {
  const { user } = useAuth();
  const qc = useQueryClient();
  const instanceId = useId();

  // ── Realtime: subscribe to subscription row changes ──────────────────────
  // This fires for ALL team members when the admin's subscription is updated
  // (e.g. extra_minutes incremented after Paystack payment).
  useEffect(() => {
    if (!user) return;

    const channelName = `team-sub-pool:${user.id}-${instanceId.replace(/:/g, "")}`;

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "subscriptions" },
        (_payload) => {
          // Invalidate for everyone — RPC resolves correct team context
          qc.invalidateQueries({ queryKey: ["team-minute-pool"] });
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "team_minute_usage" },
        (_payload) => {
          qc.invalidateQueries({ queryKey: ["team-minute-pool"] });
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "team_minute_usage" },
        (_payload) => {
          qc.invalidateQueries({ queryKey: ["team-minute-pool"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, qc, instanceId]);

  const query = useQuery({
    queryKey: ["team-minute-pool", user?.id],
    queryFn: async (): Promise<TeamMinutePool> => {
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await (supabase as any).rpc(
        "get_team_minute_pool",
        { p_user_id: user.id }
      );

      if (error) throw error;

      const d = data as any;

      const totalMinutes: number = d.total_minutes ?? -1;
      const minutesUsed: number = d.minutes_used ?? 0;
      const remaining: number = d.remaining ?? -1;
      const isUnlimited: boolean = d.is_unlimited ?? false;
      const extraMinutes: number = d.extra_minutes ?? 0;
      const baseMinutes: number = d.base_minutes ?? 30;

      return {
        teamId: d.team_id ?? null,
        subscriptionId: d.subscription_id ?? null,
        planName: d.plan_name ?? "Free",

        baseMinutes,
        extraMinutes,
        totalMinutes,
        minutesUsed,
        remaining,

        isUnlimited,
        isAtLimit: d.is_at_limit ?? false,
        isNearLimit: d.is_near_limit ?? false,
        pct: Number(d.pct ?? 0),

        isTeamPlan: d.is_team_plan ?? false,
        isAdmin: d.is_admin ?? true,

        memberBreakdown: (d.member_breakdown as MemberBreakdown[]) ?? [],
        extraMinutesExpiresAt: d.extra_minutes_expires_at ?? null,

        usedLabel: formatMinutes(minutesUsed),
        totalLabel: isUnlimited ? "Unlimited" : formatMinutes(totalMinutes),
        remainingLabel: isUnlimited ? "Unlimited" : formatMinutes(Math.max(0, remaining)),
        extraLabel: extraMinutes > 0 ? `+${formatMinutes(extraMinutes)}` : "",

        hoursUsed: hrs(minutesUsed),
        hoursTotal: isUnlimited ? null : hrs(totalMinutes),
        hoursRemaining: isUnlimited ? null : hrs(Math.max(0, remaining)),
      };
    },
    enabled: !!user,
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: 1,
  });

  return { pool: query.data ?? null, isLoading: query.isLoading };
}