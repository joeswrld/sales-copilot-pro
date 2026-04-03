/**
 * plans.ts — Single source of truth for Fixsense plan configuration.
 *
 * Billing unit: MINUTES (not calls).
 * UI can show hours or a progress bar — never expose raw internal math.
 *
 * Plan keys must match the `plans.id` column in Supabase.
 */

export const USD_TO_NGN = 1500;

export interface PlanConfig {
  key: string;
  name: string;
  /** Minutes per billing cycle. -1 = unlimited (Scale fair-use). */
  minute_quota: number;
  /** Legacy call count kept for billing-gate compatibility. -1 = unlimited. */
  calls_limit: number;
  team_members_limit: number;
  price_usd: number;
  /** Overage rate in kobo per minute (100 kobo = ₦1). 0 = no overage (restrict instead). */
  overage_rate_kobo: number;
  /** Soft cap for Scale fair-use enforcement. null = no cap. */
  fair_usage_limit: number | null;
  badge?: string;
}

export const PLAN_CONFIG: Record<string, PlanConfig> = {
  free: {
    key: "free",
    name: "Free",
    minute_quota: 300,
    calls_limit: 5,
    team_members_limit: 1,
    price_usd: 0,
    overage_rate_kobo: 0,
    fair_usage_limit: null,
  },
  starter: {
    key: "starter",
    name: "Starter",
    minute_quota: 1500,
    calls_limit: 50,
    team_members_limit: 3,
    price_usd: 19,
    overage_rate_kobo: 15,
    fair_usage_limit: null,
  },
  growth: {
    key: "growth",
    name: "Growth",
    minute_quota: 6000,
    calls_limit: 300,
    team_members_limit: 10,
    price_usd: 49,
    overage_rate_kobo: 12,
    fair_usage_limit: null,
    badge: "Most Popular",
  },
  scale: {
    key: "scale",
    name: "Scale",
    minute_quota: 20000,
    calls_limit: -1,
    team_members_limit: -1,
    price_usd: 99,
    overage_rate_kobo: 8,
    fair_usage_limit: 20000,
  },
};

export const PLAN_ORDER: string[] = ["free", "starter", "growth", "scale"];

// ── Simple plan list (for pricing page / billing page UI) ─────────────────
export const PLANS_SIMPLE = PLAN_ORDER.map((key) => ({
  key,
  ...PLAN_CONFIG[key],
}));

// Legacy alias — keeps existing imports working
export const PLANS = PLANS_SIMPLE;

// ── Helpers ───────────────────────────────────────────────────────────────

/** Returns minute quota for a plan key. Handles Paystack plan_name strings. */
export function getMinuteQuota(planKey: string): number {
  const normalized = normalizePlanKey(planKey);
  return PLAN_CONFIG[normalized]?.minute_quota ?? 300;
}

/** Returns team-member limit for a plan key. */
export function getTeamMembersLimit(planKey: string): number {
  const normalized = normalizePlanKey(planKey);
  return PLAN_CONFIG[normalized]?.team_members_limit ?? 1;
}

/** Returns call (meeting) count limit for a plan key. */
export function getCallsLimit(planKey: string): number {
  const normalized = normalizePlanKey(planKey);
  return PLAN_CONFIG[normalized]?.calls_limit ?? 5;
}

/**
 * Normalise Paystack plan_name ("Fixsense Growth") → internal key ("growth").
 * Falls back to "free" if unrecognised.
 */
export function normalizePlanKey(planKeyOrName: string | null | undefined): string {
  if (!planKeyOrName) return "free";
  const lower = planKeyOrName.toLowerCase().replace(/^fixsense\s+/, "").trim();
  if (PLAN_CONFIG[lower]) return lower;
  // fuzzy fallback
  for (const key of PLAN_ORDER) {
    if (lower.includes(key)) return key;
  }
  return "free";
}

/** Check if a plan key is higher (numerically) than another. */
export function isPlanHigher(a: string, b: string): boolean {
  return PLAN_ORDER.indexOf(normalizePlanKey(a)) > PLAN_ORDER.indexOf(normalizePlanKey(b));
}

/** Format NGN amount from kobo. */
export function formatNGN(kobo: number): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(kobo / 100);
}

/** Format minutes as human-readable hours/minutes string. */
export function formatMinutes(minutes: number): string {
  if (minutes < 0) return "Unlimited";
  if (minutes === 0) return "0 min";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}