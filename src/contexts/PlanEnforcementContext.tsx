/**
 * PlanEnforcementContext.tsx — v2 (Team Plan Inheritance)
 *
 * Central plan enforcement layer.
 * hasFeature() now uses TWO checks in priority order:
 *   1. featureFlags from DB plans table (most accurate — includes team inheritance)
 *   2. planIndex fallback (hardcoded tier list)
 *
 * This means if admin pays for Growth, all teammates get Growth feature flags
 * automatically — no hardcoded overrides needed.
 *
 * Feature gates match the pricing table exactly:
 * free:    live_calls, transcription, summaries
 * starter: + objection_detection, sentiment, engagement, team_messages, crm_push, api_access, team_access
 * growth:  + deal_rooms, coaching, analytics, leaderboards
 * scale:   + dedicated_csm
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import { useEffectivePlan } from "@/hooks/useEffectivePlan";
import { useMinuteUsage } from "@/hooks/useMinuteUsage";
import { PLAN_CONFIG, PLAN_ORDER } from "@/config/plans";

// ─── Feature Keys ─────────────────────────────────────────────────────────────

export type PlanFeatureKey =
  | "live_calls"
  | "transcription"
  | "summaries"
  | "objection_detection"
  | "sentiment"
  | "engagement"
  | "deal_rooms"
  | "coaching"
  | "team_messages"
  | "team_access"
  | "analytics"
  | "leaderboards"
  | "crm_push"
  | "dedicated_csm"
  | "api_access";

// Feature → minimum plan index (0=free, 1=starter, 2=growth, 3=scale)
// Used as FALLBACK when featureFlags from DB are unavailable
const FEATURE_MIN_PLAN: Record<PlanFeatureKey, number> = {
  live_calls:          0,
  transcription:       0,
  summaries:           0,
  objection_detection: 1,
  sentiment:           1,
  engagement:          1,
  deal_rooms:          2,
  coaching:            2,
  team_messages:       1,
  team_access:         1,
  analytics:           2,
  leaderboards:        2,
  crm_push:            1,
  dedicated_csm:       3,
  api_access:          1,
};

// Maps PlanFeatureKey → DB feature_flags key name
// (DB uses slightly different naming in some cases)
const FEATURE_FLAG_DB_KEY: Partial<Record<PlanFeatureKey, string>> = {
  live_calls:          "live_calls",
  transcription:       "transcription",
  summaries:           "summaries",
  objection_detection: "objection_detection",
  sentiment:           "sentiment",
  engagement:          "engagement",
  deal_rooms:          "deal_rooms",
  coaching:            "coaching",
  team_messages:       "team_messages",
  team_access:         "team_messages", // team_access gates same features as team_messages
  analytics:           "analytics",
  leaderboards:        "leaderboards",
  crm_push:            "crm_push",
  dedicated_csm:       "csm",
  api_access:          "crm_push",      // api_access uses same tier as crm_push
};

export const FEATURE_LABELS: Record<PlanFeatureKey, string> = {
  live_calls:          "Live Calls",
  transcription:       "AI Transcription",
  summaries:           "AI Call Summaries",
  objection_detection: "Objection Detection",
  sentiment:           "Sentiment Analysis",
  engagement:          "Engagement Scoring",
  deal_rooms:          "Deal Rooms & Deal AI",
  coaching:            "Coaching Clips",
  team_messages:       "Team Messages",
  team_access:         "Team Workspace",
  analytics:           "Advanced Analytics",
  leaderboards:        "Rep Leaderboards",
  crm_push:            "Action Layer + CRM Push",
  dedicated_csm:       "Dedicated CSM",
  api_access:          "API Access",
};

export const FEATURE_REQUIRED_PLAN: Record<PlanFeatureKey, string> = {
  live_calls:          "Free",
  transcription:       "Free",
  summaries:           "Free",
  objection_detection: "Starter",
  sentiment:           "Starter",
  engagement:          "Starter",
  deal_rooms:          "Growth",
  coaching:            "Growth",
  team_messages:       "Starter",
  team_access:         "Starter",
  analytics:           "Growth",
  leaderboards:        "Growth",
  crm_push:            "Starter",
  dedicated_csm:       "Scale",
  api_access:          "Starter",
};

// ─── Context shape ────────────────────────────────────────────────────────────

interface UpgradeModalState {
  open: boolean;
  feature: PlanFeatureKey | null;
  customMessage?: string;
}

interface PlanEnforcementContextValue {
  hasFeature: (feature: PlanFeatureKey) => boolean;
  planKey: string;
  planName: string;
  planIndex: number;
  isInherited: boolean;
  adminUserId: string | null;

  canStartCall: () => boolean;
  minutesUsed: number;
  minuteLimit: number;
  minutesRemaining: number;
  isAtLimit: boolean;
  isNearLimit: boolean;
  usagePct: number;
  isUnlimited: boolean;

  teamMembersLimit: number;

  upgradeModal: UpgradeModalState;
  openUpgradeModal: (feature: PlanFeatureKey, customMessage?: string) => void;
  closeUpgradeModal: () => void;

  isLoading: boolean;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const PlanEnforcementContext = createContext<PlanEnforcementContextValue | null>(null);

export function PlanEnforcementProvider({ children }: { children: ReactNode }) {
  const { effectivePlan, isLoading: planLoading } = useEffectivePlan();
  const { usage, isLoading: usageLoading } = useMinuteUsage();

  const [upgradeModal, setUpgradeModal] = useState<UpgradeModalState>({
    open: false,
    feature: null,
  });

  const planKey  = effectivePlan?.planKey ?? "free";
  const planName = effectivePlan?.planName ?? "Free";
  const planIndex = PLAN_ORDER.indexOf(planKey);
  const teamMembersLimit = effectivePlan?.teamMembersLimit ?? 1;
  const featureFlags = effectivePlan?.featureFlags ?? {};
  const isInherited = effectivePlan?.isInherited ?? false;
  const adminUserId = effectivePlan?.adminUserId ?? null;

  /**
   * hasFeature — checks DB feature_flags first (team-inherited, most accurate),
   * then falls back to hardcoded plan tier index.
   */
  const hasFeature = useCallback(
    (feature: PlanFeatureKey): boolean => {
      // 1. Check DB feature flags if available (includes team inheritance)
      const dbKey = FEATURE_FLAG_DB_KEY[feature];
      if (dbKey && Object.keys(featureFlags).length > 0) {
        return featureFlags[dbKey] === true;
      }

      // 2. Fallback: hardcoded plan tier comparison
      const minIdx = FEATURE_MIN_PLAN[feature] ?? 0;
      return planIndex >= minIdx;
    },
    [featureFlags, planIndex]
  );

  const canStartCall = useCallback((): boolean => {
    if (!usage) return true;
    return !usage.isAtLimit;
  }, [usage]);

  const openUpgradeModal = useCallback(
    (feature: PlanFeatureKey, customMessage?: string) => {
      setUpgradeModal({ open: true, feature, customMessage });
    },
    []
  );

  const closeUpgradeModal = useCallback(() => {
    setUpgradeModal({ open: false, feature: null });
  }, []);

  const value = useMemo<PlanEnforcementContextValue>(
    () => ({
      hasFeature,
      planKey,
      planName,
      planIndex,
      isInherited,
      adminUserId,
      canStartCall,
      minutesUsed:      usage?.minutesUsed ?? 0,
      minuteLimit:      usage?.minuteLimit ?? 30,
      minutesRemaining: usage?.minutesRemaining ?? 30,
      isAtLimit:        usage?.isAtLimit ?? false,
      isNearLimit:      usage?.isNearLimit ?? false,
      usagePct:         usage?.pct ?? 0,
      isUnlimited:      usage?.isUnlimited ?? false,
      teamMembersLimit,
      upgradeModal,
      openUpgradeModal,
      closeUpgradeModal,
      isLoading: planLoading || usageLoading,
    }),
    [
      hasFeature, planKey, planName, planIndex, isInherited, adminUserId,
      canStartCall, usage, teamMembersLimit, upgradeModal,
      openUpgradeModal, closeUpgradeModal, planLoading, usageLoading,
    ]
  );

  return (
    <PlanEnforcementContext.Provider value={value}>
      {children}
    </PlanEnforcementContext.Provider>
  );
}

export function usePlanEnforcement() {
  const ctx = useContext(PlanEnforcementContext);
  if (!ctx) throw new Error("usePlanEnforcement must be used inside PlanEnforcementProvider");
  return ctx;
}

export function useFeature(feature: PlanFeatureKey) {
  const { hasFeature, openUpgradeModal } = usePlanEnforcement();
  return {
    enabled: hasFeature(feature),
    gate: () => openUpgradeModal(feature),
  };
}