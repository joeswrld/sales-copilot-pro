import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type RangePreset = "7d" | "30d" | "90d" | "1y" | "custom";

export interface AnalyticsRange {
  from: Date;
  to: Date;
  bucket: "day" | "week" | "month";
}

export function rangeFromPreset(preset: RangePreset, custom?: { from: Date; to: Date }): AnalyticsRange {
  const to = new Date();
  let from = new Date();
  let bucket: AnalyticsRange["bucket"] = "day";
  if (preset === "7d") from.setDate(to.getDate() - 7);
  else if (preset === "30d") from.setDate(to.getDate() - 30);
  else if (preset === "90d") { from.setDate(to.getDate() - 90); bucket = "week"; }
  else if (preset === "1y") { from.setFullYear(to.getFullYear() - 1); bucket = "month"; }
  else if (preset === "custom" && custom) { return { from: custom.from, to: custom.to, bucket: "day" }; }
  return { from, to, bucket };
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
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const args = { _from: range.from.toISOString(), _to: range.to.toISOString(), _bucket: range.bucket };
    const argsNoBucket = { _from: range.from.toISOString(), _to: range.to.toISOString() };
    const supa = supabase as any;
    const [r, u, p, a, c, ar, m, em, pc] = await Promise.all([
      supa.rpc("admin_revenue_series", args),
      supa.rpc("admin_user_growth", args),
      supa.rpc("admin_plan_breakdown"),
      supa.rpc("admin_active_users", args),
      supa.rpc("admin_churn_rate", argsNoBucket),
      supa.rpc("admin_arpu", argsNoBucket),
      supa.rpc("admin_minutes_consumed", args),
      supa.rpc("admin_extra_minutes_series", args),
      supa.rpc("admin_profit_cost", argsNoBucket),
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
    setLoading(false);
  }, [range.from, range.to, range.bucket]);

  useEffect(() => { load(); }, [load]);

  return { revenue, userGrowth, planBreakdown, activeUsers, churn, arpu, minutes, extraMinutes, profitCost, loading, refresh: load };
}
