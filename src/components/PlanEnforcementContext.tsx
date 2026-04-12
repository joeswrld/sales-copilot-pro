/**
 * PlanEnforcementContext.tsx
 *
 * Central plan enforcement layer.
 * Wraps the app and provides:
 *  - hasFeature(key) → boolean
 *  - getPlanLimit(key) → number | string
 *  - canStartCall() → boolean
 *  - minuteData → usage details
 *  - upgradePrompt(feature) → opens upgrade modal
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
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
  | "analytics"
  | "leaderboards"
  | "crm_push"
  | "dedicated_csm"
  | "api_access";

// Feature → minimum plan index (0=free, 1=starter, 2=growth, 3=scale)
const FEATURE_MIN_PLAN: Record<PlanFeatureKey, number> = {
  live_calls:          0, // free+
  transcription:       0, // free+
  summaries:           0, // free+
  objection_detection: 1, // starter+
  sentiment:           1, // starter+
  engagement:          1, // starter+
  deal_rooms:          2, // growth+
  coaching:            2, // growth+
  team_messages:       1, // starter+
  analytics:           2, // growth+
  leaderboards:        2, // growth+
  crm_push:            1, // starter+
  dedicated_csm:       3, // scale only
  api_access:          1, // starter+
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
  // Feature checks
  hasFeature: (feature: PlanFeatureKey) => boolean;
  planKey: string;
  planName: string;
  planIndex: number;

  // Minute / call limits
  canStartCall: () => boolean;
  minutesUsed: number;
  minuteLimit: number;
  minutesRemaining: number;
  isAtLimit: boolean;
  isNearLimit: boolean;
  usagePct: number;
  isUnlimited: boolean;

  // Team limits
  teamMembersLimit: number;

  // Upgrade prompt
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

  const planKey = effectivePlan?.planKey ?? "free";
  const planName = effectivePlan?.planName ?? "Free";
  const planIndex = PLAN_ORDER.indexOf(planKey);
  const teamMembersLimit = effectivePlan?.teamMembersLimit ?? 1;

  const hasFeature = useCallback(
    (feature: PlanFeatureKey): boolean => {
      const minIdx = FEATURE_MIN_PLAN[feature] ?? 0;
      return planIndex >= minIdx;
    },
    [planIndex]
  );

  const canStartCall = useCallback((): boolean => {
    if (!usage) return true; // optimistic while loading
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
      canStartCall,
      minutesUsed: usage?.minutesUsed ?? 0,
      minuteLimit: usage?.minuteLimit ?? 30,
      minutesRemaining: usage?.minutesRemaining ?? 30,
      isAtLimit: usage?.isAtLimit ?? false,
      isNearLimit: usage?.isNearLimit ?? false,
      usagePct: usage?.pct ?? 0,
      isUnlimited: usage?.isUnlimited ?? false,
      teamMembersLimit,
      upgradeModal,
      openUpgradeModal,
      closeUpgradeModal,
      isLoading: planLoading || usageLoading,
    }),
    [
      hasFeature, planKey, planName, planIndex, canStartCall,
      usage, teamMembersLimit, upgradeModal,
      openUpgradeModal, closeUpgradeModal,
      planLoading, usageLoading,
    ]
  );

  return (
    <PlanEnforcementContext.Provider value={value}>
      {children}
    </PlanEnforcementContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function usePlanEnforcement() {
  const ctx = useContext(PlanEnforcementContext);
  if (!ctx) throw new Error("usePlanEnforcement must be used inside PlanEnforcementProvider");
  return ctx;
}

/** Convenience: returns whether a specific feature is available */
export function useFeature(feature: PlanFeatureKey) {
  const { hasFeature, openUpgradeModal } = usePlanEnforcement();
  return {
    enabled: hasFeature(feature),
    gate: () => openUpgradeModal(feature),
  };
}