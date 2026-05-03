/**
 * useTeamMinuteUsage.ts — v3 (Delegates to useTeamMinutePool)
 *
 * Backwards-compatible adapter so existing components that import
 * useTeamMinuteUsage continue to work without modification, while
 * picking up the new real-time team subscription sync from useTeamMinutePool.
 */

import { useTeamMinutePool } from "@/hooks/useTeamMinutePool";

export interface MemberBreakdown {
  user_id: string;
  full_name: string | null;
  email: string | null;
  minutes_used: number;
}

export interface TeamMinuteUsage {
  teamId: string | null;
  planName: string;
  minutesLimit: number;
  minutesUsed: number;
  minutesRemaining: number;
  isUnlimited: boolean;
  isAtLimit: boolean;
  isNearLimit: boolean;
  pct: number;
  isTeamPlan: boolean;
  isAdmin: boolean;
  memberBreakdown: MemberBreakdown[];

  minutesUsedLabel: string;
  minuteLimitLabel: string;
  minutesRemainingLabel: string;

  hoursUsed: string;
  hoursLimit: string | null;
  hoursRemaining: string | null;

  /** Net extra minutes on top of base plan */
  extraMinutes: number;
  extraMinutesExpiresAt: string | null;
  extraLabel: string;
}

export function useTeamMinuteUsage(): {
  usage: TeamMinuteUsage | null;
  isLoading: boolean;
} {
  const { pool, isLoading } = useTeamMinutePool();

  if (!pool) return { usage: null, isLoading };

  const adapted: TeamMinuteUsage = {
    teamId: pool.teamId,
    planName: pool.planName,
    minutesLimit: pool.totalMinutes,
    minutesUsed: pool.minutesUsed,
    minutesRemaining: pool.remaining,
    isUnlimited: pool.isUnlimited,
    isAtLimit: pool.isAtLimit,
    isNearLimit: pool.isNearLimit,
    pct: pool.pct,
    isTeamPlan: pool.isTeamPlan,
    isAdmin: pool.isAdmin,
    memberBreakdown: pool.memberBreakdown,

    minutesUsedLabel: pool.usedLabel,
    minuteLimitLabel: pool.totalLabel,
    minutesRemainingLabel: pool.remainingLabel,

    hoursUsed: pool.hoursUsed,
    hoursLimit: pool.hoursTotal,
    hoursRemaining: pool.hoursRemaining,

    extraMinutes: pool.extraMinutes,
    extraMinutesExpiresAt: pool.extraMinutesExpiresAt,
    extraLabel: pool.extraLabel,
  };

  return { usage: adapted, isLoading };
}