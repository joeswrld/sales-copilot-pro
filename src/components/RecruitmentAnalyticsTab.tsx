/**
 * RecruitmentAnalyticsTab.tsx
 *
 * Recruitment-focused analytics, rendered as a tab inside Analytics.tsx.
 * Pulls the existing get_recruiting_analytics(team_id, start, end) RPC
 * (extended in migration extend_recruiting_analytics_rpc to add open_jobs,
 * applications_received, submission_to_interview_conversion_pct,
 * avg_days_time_to_fill, placement_revenue_by_currency, client_performance,
 * placements_per_recruiter) — no new tables or duplicate analytics system.
 *
 * Matches Analytics.tsx's Tailwind/"glass" dark theme, not the cream/navy
 * inline-style theme used by CrmPage/CandidatesPage/etc.
 */

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTeam } from "@/hooks/useTeam";
import { toast } from "sonner";
import {
  Loader2, Briefcase, Users, Send, CalendarCheck, Award, CheckCircle2,
  TrendingUp, Clock, Building2, RefreshCw,
} from "lucide-react";

interface RecruitingAnalytics {
  open_jobs: number;
  applications_received: number;
  candidates_screened: number;
  candidates_submitted: number;
  interviews_completed: number;
  offers_made: number;
  placements: number;
  candidate_to_job_conversion_pct: number;
  submission_to_interview_conversion_pct: number;
  avg_days_intake_to_shortlist: number | null;
  avg_days_time_to_fill: number | null;
  interview_to_offer_ratio_pct: number;
  jobs_per_recruiter: Array<{ recruiter_id: string; job_count: number }>;
  placements_per_recruiter: Array<{ recruiter_id: string; placement_count: number }>;
  client_performance: Array<{ client_id: string; client_name: string; open_jobs: number; placements: number; total_fees: number | null }>;
  placement_revenue_by_currency: Record<string, number>;
  rejection_reasons: Record<string, number>;
  candidate_availability: { available_now: number; available_soon: number; not_soon: number };
  recruiter_activity: Array<{ recruiter_id: string; calls_logged: number }>;
  period: { start: string; end: string };
}

const RANGES = [
  { key: "7", label: "7 days" },
  { key: "30", label: "30 days" },
  { key: "90", label: "90 days" },
];

function formatMoney(value: number | null | undefined, currency: string) {
  if (!value) return null;
  const symbol = currency === "USD" ? "$" : currency === "GBP" ? "£" : currency === "EUR" ? "€" : "₦";
  if (value >= 1_000_000) return `${symbol}${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1000) return `${symbol}${(value / 1000).toFixed(0)}K`;
  return `${symbol}${value.toLocaleString()}`;
}

function StatCard({ icon: Icon, label, value, accent }: { icon: React.ElementType; label: string; value: string | number; accent?: string }) {
  return (
    <div className="glass rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2 text-muted-foreground">
        <Icon className="w-3.5 h-3.5" />
        <span className="text-[11px] font-medium uppercase tracking-wide">{label}</span>
      </div>
      <div className="text-2xl font-bold font-display" style={accent ? { color: accent } : undefined}>{value}</div>
    </div>
  );
}

export default function RecruitmentAnalyticsTab() {
  const { teamId, teamLoading } = useTeam();
  const [range, setRange] = useState("30");
  const [data, setData] = useState<RecruitingAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!teamId) return;
    setLoading(true);
    setError(null);
    try {
      const startDate = new Date(Date.now() - Number(range) * 86400000).toISOString();
      const { data: result, error } = await (supabase as any).rpc("get_recruiting_analytics", {
        p_team_id: teamId,
        p_start_date: startDate,
        p_end_date: new Date().toISOString(),
      });
      if (error) throw error;
      setData(result as RecruitingAnalytics);
    } catch (e: any) {
      setError(e.message ?? "Failed to load recruitment analytics");
      toast.error(e.message ?? "Failed to load recruitment analytics");
    } finally {
      setLoading(false);
    }
  }, [teamId, range]);

  useEffect(() => { if (teamId) load(); }, [teamId, load]);

  if (teamLoading || loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass rounded-xl p-10 text-center space-y-4">
        <p className="text-muted-foreground text-sm">Unable to load recruitment analytics.</p>
        <button onClick={load} className="text-xs font-semibold px-4 py-2 rounded-lg bg-secondary">Retry</button>
      </div>
    );
  }

  if (!data) return null;

  const revenueEntries = Object.entries(data.placement_revenue_by_currency || {});
  const rejectionEntries = Object.entries(data.rejection_reasons || {}).sort((a, b) => (b[1] as number) - (a[1] as number));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {RANGES.map(r => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg ${range === r.key ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <button onClick={load} className="p-2 rounded-lg bg-secondary text-muted-foreground">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Pipeline funnel */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard icon={Briefcase} label="Open Jobs" value={data.open_jobs} />
        <StatCard icon={Users} label="Applications" value={data.applications_received} />
        <StatCard icon={CheckCircle2} label="Screened" value={data.candidates_screened} />
        <StatCard icon={Send} label="Submitted" value={data.candidates_submitted} />
        <StatCard icon={CalendarCheck} label="Interviews" value={data.interviews_completed} />
        <StatCard icon={Award} label="Placements" value={data.placements} accent="hsl(174, 72%, 50%)" />
      </div>

      {/* Conversion rates */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={TrendingUp} label="Submission → Interview" value={`${data.submission_to_interview_conversion_pct}%`} />
        <StatCard icon={TrendingUp} label="Interview → Offer" value={`${data.interview_to_offer_ratio_pct}%`} />
        <StatCard icon={TrendingUp} label="Candidate → Placement" value={`${data.candidate_to_job_conversion_pct}%`} />
        <StatCard
          icon={Clock}
          label="Avg Time-to-Fill"
          value={data.avg_days_time_to_fill != null ? `${data.avg_days_time_to_fill}d` : "—"}
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Client performance */}
        <div className="glass rounded-xl p-5">
          <h3 className="font-display font-semibold text-sm mb-4 flex items-center gap-2">
            <Building2 className="w-4 h-4" /> Client Performance
          </h3>
          {data.client_performance.length === 0 ? (
            <p className="text-xs text-muted-foreground">No client activity in this period.</p>
          ) : (
            <div className="space-y-2">
              {data.client_performance.slice(0, 8).map(c => (
                <div key={c.client_id} className="flex items-center justify-between text-xs py-1.5 border-b border-border/50 last:border-0">
                  <span className="font-medium truncate max-w-[140px]">{c.client_name}</span>
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <span>{c.open_jobs} open</span>
                    <span>{c.placements} placed</span>
                    {c.total_fees ? <span className="text-foreground font-semibold">{formatMoney(c.total_fees, "NGN")}</span> : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Revenue + rejection reasons */}
        <div className="glass rounded-xl p-5">
          <h3 className="font-display font-semibold text-sm mb-4">Placement Revenue</h3>
          {revenueEntries.length === 0 ? (
            <p className="text-xs text-muted-foreground mb-4">No placements with fees recorded in this period.</p>
          ) : (
            <div className="flex gap-4 mb-5">
              {revenueEntries.map(([cur, amt]) => (
                <div key={cur} className="text-center">
                  <div className="text-xl font-bold font-display text-primary">{formatMoney(amt as number, cur)}</div>
                  <div className="text-[10px] text-muted-foreground">{cur}</div>
                </div>
              ))}
            </div>
          )}

          <h3 className="font-display font-semibold text-sm mb-3">Top Rejection Reasons</h3>
          {rejectionEntries.length === 0 ? (
            <p className="text-xs text-muted-foreground">No rejections recorded in this period.</p>
          ) : (
            <div className="space-y-1.5">
              {rejectionEntries.slice(0, 5).map(([reason, count]) => (
                <div key={reason} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground truncate max-w-[180px]">{reason}</span>
                  <span className="font-semibold">{count as number}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recruiter performance */}
      {(data.jobs_per_recruiter.length > 0 || data.placements_per_recruiter.length > 0) && (
        <div className="glass rounded-xl p-5">
          <h3 className="font-display font-semibold text-sm mb-4">Recruiter Performance</h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {data.jobs_per_recruiter.map(r => {
              const placements = data.placements_per_recruiter.find(p => p.recruiter_id === r.recruiter_id)?.placement_count ?? 0;
              return (
                <div key={r.recruiter_id} className="rounded-lg bg-secondary/50 p-3 text-center">
                  <div className="text-lg font-bold font-display">{r.job_count}</div>
                  <div className="text-[10px] text-muted-foreground mb-1">Active jobs</div>
                  <div className="text-lg font-bold font-display text-primary">{placements}</div>
                  <div className="text-[10px] text-muted-foreground">Placements</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Candidate availability */}
      <div className="glass rounded-xl p-5">
        <h3 className="font-display font-semibold text-sm mb-4">Candidate Pool Availability</h3>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-xl font-bold font-display text-primary">{data.candidate_availability.available_now}</div>
            <div className="text-[10px] text-muted-foreground">Available now</div>
          </div>
          <div>
            <div className="text-xl font-bold font-display">{data.candidate_availability.available_soon}</div>
            <div className="text-[10px] text-muted-foreground">Within 30 days</div>
          </div>
          <div>
            <div className="text-xl font-bold font-display text-muted-foreground">{data.candidate_availability.not_soon}</div>
            <div className="text-[10px] text-muted-foreground">30+ days out</div>
          </div>
        </div>
      </div>
    </div>
  );
}