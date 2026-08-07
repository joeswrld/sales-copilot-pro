import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type RangePreset =
  | "today" | "yesterday" | "7d" | "30d" | "90d" | "1m" | "1y" | "5y" | "10y" | "custom";

export interface AnalyticsRange {
  from: Date;
  to: Date;
  bucket: "hour" | "day" | "week" | "month" | "year";
}

export const RANGE_LABELS: Record<Exclude<RangePreset, "custom">, string> = {
  today: "Today",
  yesterday: "Yesterday",
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
  "1m": "1 month",
  "1y": "1 year",
  "5y": "5 years",
  "10y": "10 years",
};

export function rangeFromPreset(preset: RangePreset, custom?: { from: Date; to: Date }): AnalyticsRange {
  const now = new Date();
  const startOfDay = (d: Date) => { const c = new Date(d); c.setHours(0, 0, 0, 0); return c; };
  const endOfDay = (d: Date) => { const c = new Date(d); c.setHours(23, 59, 59, 999); return c; };

  switch (preset) {
    case "today":
      return { from: startOfDay(now), to: now, bucket: "hour" };
    case "yesterday": {
      const y = new Date(now); y.setDate(now.getDate() - 1);
      return { from: startOfDay(y), to: endOfDay(y), bucket: "hour" };
    }
    case "7d": {
      const f = new Date(now); f.setDate(now.getDate() - 7);
      return { from: f, to: now, bucket: "day" };
    }
    case "30d": {
      const f = new Date(now); f.setDate(now.getDate() - 30);
      return { from: f, to: now, bucket: "day" };
    }
    case "1m": {
      const f = new Date(now); f.setMonth(now.getMonth() - 1);
      return { from: f, to: now, bucket: "day" };
    }
    case "90d": {
      const f = new Date(now); f.setDate(now.getDate() - 90);
      return { from: f, to: now, bucket: "week" };
    }
    case "1y": {
      const f = new Date(now); f.setFullYear(now.getFullYear() - 1);
      return { from: f, to: now, bucket: "month" };
    }
    case "5y": {
      const f = new Date(now); f.setFullYear(now.getFullYear() - 5);
      return { from: f, to: now, bucket: "year" };
    }
    case "10y": {
      const f = new Date(now); f.setFullYear(now.getFullYear() - 10);
      return { from: f, to: now, bucket: "year" };
    }
    default:
      if (custom) return { from: custom.from, to: endOfDay(custom.to), bucket: "day" };
      return { from: startOfDay(now), to: now, bucket: "hour" };
  }
}


interface SeriesPoint { bucket: string; [k: string]: any }

export function useAdminAnalytics(range: AnalyticsRange) {
  const [revenue, setRevenue] = useState<SeriesPoint[]>([]);
  const [userGrowth, setUserGrowth] = useState<SeriesPoint[]>([]);
  const [planBreakdown, setPlanBreakdown] = useState<{ plan: string; count: number; revenue: number }[]>([]);
  const [activeUsers, setActiveUsers] = useState<SeriesPoint[]>([]);
  const [churn, setChurn] = useState<SeriesPoint[]>([]);
  const [arpu, setArpu] = useState<SeriesPoint[]>([]);
  const [minutes, setMinutes] = useState<SeriesPoint[]>([]);
  const [extraMinutes, setExtraMinutes] = useState<SeriesPoint[]>([]);
  const [profitCost, setProfitCost] = useState<SeriesPoint[]>([]);
  const [churnReasons, setChurnReasons] = useState<
    { reason: string; cancellations: number; reactivations: number; retained: number; mrr_lost_usd: number; share_pct: number }[]
  >([]);
  const [churnFeedback, setChurnFeedback] = useState<
    { created_at: string; email: string; plan: string; reason: string; feedback: string; retention_outcome: string }[]
  >([]);
  const [funnel, setFunnel] = useState<{
    visitors: number; page_views: number; trial_clicks: number;
    signups_started: number; signups_completed: number; signups_abandoned: number;
    visit_to_trial_pct: number; trial_to_signup_pct: number; signup_abandon_pct: number;
  } | null>(null);
  const [funnelSeries, setFunnelSeries] = useState<SeriesPoint[]>([]);
  const [loading, setLoading] = useState(true);


  const load = useCallback(async () => {
    setLoading(true);
    const args = { _from: range.from.toISOString(), _to: range.to.toISOString(), _bucket: range.bucket };
    const argsNoBucket = { _from: range.from.toISOString(), _to: range.to.toISOString() };
    const supa = supabase as any;
    const [r, u, p, a, c, ar, m, em, pc, cr, cf, fm, fs] = await Promise.all([
      supa.rpc("admin_revenue_series", args),
      supa.rpc("admin_user_growth", args),
      supa.rpc("admin_plan_breakdown"),
      supa.rpc("admin_active_users", args),
      supa.rpc("admin_churn_rate", argsNoBucket),
      supa.rpc("admin_arpu", argsNoBucket),
      supa.rpc("admin_minutes_consumed", args),
      supa.rpc("admin_extra_minutes_series", args),
      supa.rpc("admin_profit_cost", argsNoBucket),
      supa.rpc("admin_churn_reasons", argsNoBucket),
      supa.rpc("admin_churn_feedback", { ...argsNoBucket, _limit: 50 }),
      supa.rpc("admin_funnel_metrics", argsNoBucket),
      supa.rpc("admin_funnel_series", args),
    ]);
    setRevenue(r.data || []);
    setUserGrowth(u.data || []);
    setPlanBreakdown(p.data || []);
    setActiveUsers(a.data || []);
    setChurn(c.data || []);
    setArpu(ar.data || []);
    setMinutes(m.data || []);
    setExtraMinutes(em.data || []);
    setProfitCost(pc.data || []);
    setChurnReasons(cr.data || []);
    setChurnFeedback(cf.data || []);
    setFunnel((fm.data && fm.data[0]) || null);
    setFunnelSeries(fs.data || []);
    setLoading(false);
  }, [range.from, range.to, range.bucket]);

  useEffect(() => { load(); }, [load]);

  return { revenue, userGrowth, planBreakdown, activeUsers, churn, arpu, minutes, extraMinutes, profitCost, churnReasons, churnFeedback, funnel, funnelSeries, loading, refresh: load };
}

