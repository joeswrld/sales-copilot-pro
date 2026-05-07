/**
 * useFeatureFlags.ts — v1
 *
 * Central feature flag system for Fixsense.
 *
 * Architecture:
 *  - Fetches all flags on mount via get_all_feature_flags() RPC
 *  - Subscribes to Supabase Realtime for instant updates
 *  - Exposes isEnabled(key) and isAllowed(key) helpers
 *  - Auto-registers new flags via registerFeature()
 *  - Works on frontend AND is enforced server-side via check_feature_flag() RPC
 *
 * Usage:
 *   const { flags, isEnabled } = useFeatureFlags();
 *   if (!isEnabled('ai_coaching')) return null;
 */

import { useEffect, useCallback, useId } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEffectivePlan } from "@/hooks/useEffectivePlan";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FeatureFlag {
  id: string;
  key: string;
  name: string;
  description?: string;
  enabled: boolean;
  plan_access: string[];
  category: string;
  is_beta: boolean;
  rollout_pct: number;
  usage_count: number;
  updated_at?: string;
  updated_by_email?: string;
}

export type FeatureFlagMap = Record<string, FeatureFlag>;

export interface FeatureFlagState {
  flags: FeatureFlagMap;
  isLoading: boolean;
  /** Check if a flag is enabled globally (no plan check) */
  isEnabled: (key: string) => boolean;
  /** Check if the current user can access this feature (flag + plan) */
  isAllowed: (key: string) => boolean;
  /** Get a flag object by key */
  getFlag: (key: string) => FeatureFlag | null;
  /** All flags as an array */
  flagsList: FeatureFlag[];
  /** Refetch flags manually */
  refetch: () => void;
}

// ─── Global cache to avoid re-fetching on every hook mount ───────────────────
let _flagCache: FeatureFlagMap = {};
let _cacheLoaded = false;

// ─── Register a feature flag from code (auto-create if missing) ───────────────
export async function registerFeature(params: {
  key: string;
  name: string;
  description?: string;
  category?: string;
  enabled?: boolean;
  plan_access?: string[];
  is_beta?: boolean;
}): Promise<void> {
  try {
    await (supabase as any).rpc("register_feature_flag", {
      p_key:         params.key,
      p_name:        params.name,
      p_description: params.description || null,
      p_category:    params.category || "core",
      p_enabled:     params.enabled ?? false,
      p_plan_access: params.plan_access || ["free","starter","growth","scale"],
      p_is_beta:     params.is_beta ?? false,
    });
  } catch (e) {
    // Non-fatal — flag registration failures should never break the app
    console.warn("[FeatureFlags] registerFeature failed (non-fatal):", e);
  }
}

// ─── Server-side enforcement check (for API calls / edge functions) ────────────
export async function checkFeatureServer(key: string, userId?: string): Promise<{
  allowed: boolean;
  reason: string;
}> {
  try {
    const { data } = await (supabase as any).rpc("check_feature_flag", {
      p_key:     key,
      p_user_id: userId || null,
    });
    return data as { allowed: boolean; reason: string };
  } catch {
    return { allowed: true, reason: "check_failed_fail_open" };
  }
}

// ─── Main hook ────────────────────────────────────────────────────────────────

export function useFeatureFlags(): FeatureFlagState {
  const { user } = useAuth();
  const { effectivePlan } = useEffectivePlan();
  const queryClient = useQueryClient();
  const instanceId = useId();

  // Fetch all flags
  const { data: flags = {} as FeatureFlagMap, isLoading, refetch } = useQuery({
    queryKey: ["feature-flags"],
    queryFn: async (): Promise<FeatureFlagMap> => {
      const { data, error } = await (supabase as any).rpc("get_all_feature_flags");
      if (error) {
        console.warn("[FeatureFlags] fetch error:", error);
        return _flagCache; // Return cached on error
      }
      _flagCache = (data as FeatureFlagMap) || {};
      _cacheLoaded = true;
      return _flagCache;
    },
    enabled: !!user,
    staleTime: 60_000,
    gcTime:    10 * 60_000,
    initialData: _cacheLoaded ? _flagCache : undefined,
  });

  // Realtime subscription — when any flag changes, refresh instantly
  useEffect(() => {
    if (!user) return;
    const channelName = `feature-flags-rt-${instanceId.replace(/:/g, "")}`;

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "feature_flags" },
        (payload) => {
          // Update the specific flag in cache immediately (optimistic)
          if (payload.new && (payload.new as any).key) {
            const updated = payload.new as any;
            queryClient.setQueryData<FeatureFlagMap>(["feature-flags"], (old) => {
              const next = { ...(old || {}) };
              next[updated.key] = {
                id:          updated.id,
                key:         updated.key,
                name:        updated.name,
                description: updated.description,
                enabled:     updated.enabled,
                plan_access: updated.plan_access,
                category:    updated.category,
                is_beta:     updated.is_beta,
                rollout_pct: updated.rollout_pct,
                usage_count: updated.usage_count,
                updated_at:  updated.updated_at,
                updated_by_email: updated.updated_by_email,
              };
              _flagCache = next;
              return next;
            });
          }
          // Also trigger a full refetch after 500ms for consistency
          setTimeout(() => {
            queryClient.invalidateQueries({ queryKey: ["feature-flags"] });
          }, 500);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, queryClient, instanceId]);

  const planKey = effectivePlan?.planKey ?? "free";

  /** Is the flag globally enabled (admin toggle) */
  const isEnabled = useCallback((key: string): boolean => {
    const flag = flags[key];
    if (!flag) return true; // Fail open for unknown flags
    if (!flag.enabled) return false;
    if (flag.rollout_pct < 100) {
      // Client-side rollout approximation (server is authoritative)
      const userId = user?.id || "";
      const hash = userId.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
      if ((hash % 100) >= flag.rollout_pct) return false;
    }
    return true;
  }, [flags, user?.id]);

  /** Is the flag enabled AND accessible on user's current plan */
  const isAllowed = useCallback((key: string): boolean => {
    if (!isEnabled(key)) return false;
    const flag = flags[key];
    if (!flag) return true;
    return flag.plan_access.includes(planKey);
  }, [flags, isEnabled, planKey]);

  const getFlag = useCallback((key: string): FeatureFlag | null => {
    return flags[key] ?? null;
  }, [flags]);

  const flagsList = Object.values(flags).sort((a, b) =>
    a.category.localeCompare(b.category) || a.key.localeCompare(b.key)
  );

  return {
    flags,
    isLoading,
    isEnabled,
    isAllowed,
    getFlag,
    flagsList,
    refetch,
  };
}

// ─── Lightweight selector hook (avoids full re-render) ────────────────────────
export function useFlag(key: string): boolean {
  const { isAllowed } = useFeatureFlags();
  return isAllowed(key);
}

// ─── Guard component ──────────────────────────────────────────────────────────
export function FeatureGate({
  flag,
  children,
  fallback = null,
}: {
  flag: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}): React.ReactElement | null {
  const allowed = useFlag(flag);
  return (allowed ? children : fallback) as React.ReactElement | null;
}