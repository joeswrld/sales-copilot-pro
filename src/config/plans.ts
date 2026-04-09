/**
 * plans.ts — Fixsense minute-based billing config
 *
 * Free:    30 min  · $0
 * Starter: 300 min · $18
 * Growth:  1500 min · $49  (Most Popular)
 * Scale:   5000 min · $99
 */

export const USD_TO_NGN = 1500;

export interface PlanConfig {
  key: string;
  name: string;
  price_usd: number;
  minute_quota: number;           // -1 = unlimited
  team_members_limit: number;     // -1 = unlimited
  calls_limit: number;            // legacy compat — -1 = unlimited
  features: string[];
  highlight?: boolean;
  badge?: string | null;
}

export const PLAN_CONFIG: Record<string, PlanConfig> = {
  free: {
    key: "free",
    name: "Free",
    price_usd: 0,
    minute_quota: 30,
    team_members_limit: 1,
    calls_limit: 5,
    features: [
      "30 minutes of calls/month",
      "Basic AI transcription",
      "1 AI summary/month",
      "Solo use only",
    ],
  },
  starter: {
    key: "starter",
    name: "Starter",
    price_usd: 18,
    minute_quota: 300,
    team_members_limit: 3,
    calls_limit: 50,
    features: [
      "300 minutes of calls/month",
      "Real-time transcription",
      "AI summaries + action items",
      "Basic insights",
      "Up to 3 team members",
      "Zoom & Google Meet",
    ],
  },
  growth: {
    key: "growth",
    name: "Growth",
    price_usd: 49,
    minute_quota: 1500,
    team_members_limit: 10,
    calls_limit: 300,
    highlight: true,
    badge: "Most Popular",
    features: [
      "1,500 minutes of calls/month",
      "Objection detection",
      "Sentiment analysis + engagement",
      "Deal rooms & deal intelligence",
      "Team messages & coaching clips",
      "Up to 10 team members",
      "Priority support",
    ],
  },
  scale: {
    key: "scale",
    name: "Scale",
    price_usd: 99,
    minute_quota: 5000,
    team_members_limit: -1,
    calls_limit: -1,
    badge: "Best Value",
    features: [
      "5,000 minutes of calls/month",
      "Unlimited team members",
      "Advanced analytics + leaderboards",
      "Deal intelligence AI",
      "Rep coaching dashboards",
      "API access",
      "Dedicated CSM",
    ],
  },
};

export const PLAN_ORDER = ["free", "starter", "growth", "scale"];

export const PLANS_SIMPLE: PlanConfig[] = PLAN_ORDER.map((k) => PLAN_CONFIG[k]);

/** Normalize a Paystack plan_name string → our plan key */
export function normalizePlanKey(planName: string | null | undefined): string {
  if (!planName) return "free";
  const lower = planName.toLowerCase();
  if (lower.includes("scale"))   return "scale";
  if (lower.includes("growth"))  return "growth";
  if (lower.includes("starter")) return "starter";
  return "free";
}

/** Get minute quota for a plan key */
export function getMinuteQuota(planKey: string): number {
  return PLAN_CONFIG[planKey]?.minute_quota ?? 30;
}

/** Get team members limit for a plan key */
export function getTeamMembersLimit(planKey: string): number {
  return PLAN_CONFIG[planKey]?.team_members_limit ?? 1;
}

/** Format minutes into a human-readable string */
export function formatMinutes(minutes: number): string {
  if (minutes <= 0) return "0 min";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/** Format Naira from kobo */
export function formatNGN(kobo: number): string {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", minimumFractionDigits: 0 }).format(kobo / 100);
}