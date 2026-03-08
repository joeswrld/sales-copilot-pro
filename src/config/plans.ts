// Fixed conversion rate: 1 USD = 1,500 NGN
export const USD_TO_NGN = 1500;

export interface PlanConfig {
  key: string;
  name: string;
  price_usd: number;
  price_ngn: number;
  period: string;
  description: string;
  calls_limit: number;
  team_members_limit: number; // -1 = unlimited
  paystack_plan: string | null;
  popular: boolean;
  features: { text: string; included: boolean }[];
  cta: string;
}

export const PLANS: PlanConfig[] = [
  {
    key: "free",
    name: "Free",
    price_usd: 0,
    price_ngn: 0,
    period: "/month",
    description: "Get started with AI-powered meeting intelligence",
    calls_limit: 5,
    team_members_limit: 1,
    paystack_plan: null,
    popular: false,
    features: [
      { text: "1 user only", included: true },
      { text: "Up to 5 meetings/month", included: true },
      { text: "Zoom integration", included: true },
      { text: "Google Meet integration", included: true },
      { text: "AI meeting summaries", included: true },
      { text: "Basic analytics", included: true },
      { text: "Email support (limited)", included: true },
      { text: "Team dashboard", included: false },
      { text: "Action items", included: false },
    ],
    cta: "Get Started Free",
  },
  {
    key: "starter",
    name: "Starter",
    price_usd: 19,
    price_ngn: 19 * USD_TO_NGN,
    period: "/month",
    description: "For individual reps who want more meetings",
    calls_limit: 50,
    team_members_limit: 3,
    paystack_plan: "starter",
    popular: false,
    features: [
      { text: "Up to 3 team members", included: true },
      { text: "Up to 50 meetings/month", included: true },
      { text: "Zoom integration", included: true },
      { text: "Google Meet integration", included: true },
      { text: "AI meeting summaries", included: true },
      { text: "Basic analytics", included: true },
      { text: "Email support", included: true },
      { text: "Team dashboard", included: false },
      { text: "Priority support", included: false },
    ],
    cta: "Subscribe",
  },
  {
    key: "growth",
    name: "Growth",
    price_usd: 49,
    price_ngn: 49 * USD_TO_NGN,
    period: "/month",
    description: "For growing teams with advanced needs",
    calls_limit: 300,
    team_members_limit: 10,
    paystack_plan: "growth",
    popular: true,
    features: [
      { text: "Up to 10 team members", included: true },
      { text: "Up to 300 meetings/month", included: true },
      { text: "Zoom + Google Meet + Slack", included: true },
      { text: "AI summaries + action items", included: true },
      { text: "Team analytics dashboard", included: true },
      { text: "Coaching insights", included: true },
      { text: "Priority email support", included: true },
      { text: "Admin controls", included: false },
      { text: "API access", included: false },
    ],
    cta: "Subscribe",
  },
  {
    key: "scale",
    name: "Scale",
    price_usd: 99,
    price_ngn: 99 * USD_TO_NGN,
    period: "/month",
    description: "For large teams that need everything",
    calls_limit: -1,
    team_members_limit: -1,
    paystack_plan: "scale",
    popular: false,
    features: [
      { text: "Unlimited team members", included: true },
      { text: "Unlimited meetings", included: true },
      { text: "All integrations", included: true },
      { text: "AI insights + summaries", included: true },
      { text: "Advanced team analytics", included: true },
      { text: "Admin controls + API access", included: true },
      { text: "Priority support", included: true },
      { text: "Custom onboarding", included: true },
      { text: "Dedicated account manager", included: true },
    ],
    cta: "Subscribe",
  },
];

export const PLANS_SIMPLE = PLANS.map(({ key, name, price_usd, calls_limit, team_members_limit }) => ({
  key,
  name,
  price_usd,
  calls_limit,
  team_members_limit,
}));

export function getPlanByKey(key: string): PlanConfig | undefined {
  return PLANS.find((p) => p.key === key);
}

export function getTeamMembersLimit(planKey: string): number {
  const plan = getPlanByKey(planKey);
  if (!plan) return 1;
  return plan.team_members_limit;
}

export function formatNGN(amount: number): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}
