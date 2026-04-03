// ─── Fixsense Plan Configuration ─────────────────────────────────────────────
// Single source of truth for all plan entitlements.
// Minute quotas are the canonical usage unit; "hours" is the UI presentation layer.

export const USD_TO_NGN = 1500;

export interface PlanConfig {
  id: string;
  name: string;
  price_usd: number;
  price_ngn_kobo: number;
  minute_quota: number;       // -1 = unlimited
  overage_rate_kobo: number;  // per overage minute, 0 = block
  team_members_limit: number; // -1 = unlimited
  calls_limit: number;        // legacy compat — derived from minute_quota / avg 60 min
  badge?: string;
}

export const PLANS: Record<string, PlanConfig> = {
  free: {
    id: "free",
    name: "Free",
    price_usd: 0,
    price_ngn_kobo: 0,
    minute_quota: 300,        // 5 hours
    overage_rate_kobo: 0,
    team_members_limit: 1,
    calls_limit: 5,
  },
  starter: {
    id: "starter",
    name: "Starter",
    price_usd: 19,
    price_ngn_kobo: 28_500_000,
    minute_quota: 1500,       // 75 hours
    overage_rate_kobo: 600,   // ₦6/min
    team_members_limit: 3,
  },
  growth: {
    id: "growth",
    name: "Growth",
    price_usd: 49,
    price_ngn_kobo: 73_500_000,
    minute_quota: 6000,      // 300 hours
    overage_rate_kobo: 400,   // ₦4/min
    team_members_limit: 10
    badge: "Most Popular",
  },
  scale: {
    id: "scale",
    name: "Scale",
    price_usd: 99,
    price_ngn_kobo: 148_500_000,
    minute_quota: 20000,         // unlimited
    overage_rate_kobo: 250,
    team_members_limit: -1,
  },
};

export const PLAN_ORDER = ["free", "starter", "growth", "scale"] as const;
export type PlanId = typeof PLAN_ORDER[number];

// Flat array for iteration
export const PLANS_SIMPLE = PLAN_ORDER.map((k) => PLANS[k]);

// ── Utility helpers ───────────────────────────────────────────────────────────

export function getMinuteQuota(planId: string): number {
  return PLANS[planId]?.minute_quota ?? 300;
}

export function getTeamMembersLimit(planId: string): number {
  return PLANS[planId]?.team_members_limit ?? 1;
}

export function minutesToHours(minutes: number): string {
  if (minutes <= 0) return "0h";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function formatNGN(koboOrNaira: number, isKobo = false): string {
  const naira = isKobo ? koboOrNaira / 100 : koboOrNaira;
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(naira);
}

export function planNameToId(planName: string | null | undefined): PlanId {
  if (!planName) return "free";
  const lower = planName.toLowerCase();
  if (lower.includes("scale"))   return "scale";
  if (lower.includes("growth"))  return "growth";
  if (lower.includes("starter")) return "starter";
  return "free";
}

export function comparePlans(a: string, b: string): number {
  return PLAN_ORDER.indexOf(a as PlanId) - PLAN_ORDER.indexOf(b as PlanId);
}

export function isUpgrade(from: string, to: string): boolean {
  return comparePlans(to, from) > 0;
}