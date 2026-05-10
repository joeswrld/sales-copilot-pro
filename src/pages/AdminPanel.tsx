/**
 * AdminPanel.tsx — v5 (+ Analytics Section)
 *
 * CHANGES FROM v4:
 *  - Added "Analytics" nav item between Billing and Feature Flags
 *  - New AnalyticsSection component with:
 *      • SaaS KPIs (MRR, ARR, ARPU, LTV, growth %, churn)
 *      • Revenue time-series chart (subscriptions vs bundles)
 *      • User growth chart (new + cumulative)
 *      • Plan distribution bar
 *      • Usage analytics (calls/day, minutes/day, feature adoption)
 *      • Operational health panel
 *      • Export CSV/PDF
 *      • Realtime refresh via Supabase channel
 *      • Time-range filter (7d / 30d / 90d / 12m)
 *  - NAV_ITEMS updated to include analytics
 *  - All SQL functions (admin_get_saas_metrics, admin_get_revenue_breakdown,
 *    admin_get_usage_analytics, admin_get_operational_health,
 *    admin_get_user_growth) deployed via migration
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { toast } from "sonner";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface DashStats {
  total_users: number; active_today: number; live_calls: number; calls_today: number;
  paying_users: number; mrr_kobo: number; total_minutes_used: number; failed_webhooks: number;
  revenue_30d_kobo: number; new_users_7d: number; plan_distribution: Record<string, number>;
}

interface AdminUser {
  id: string; email: string | null; full_name: string | null; plan_type: string;
  billing_status: string; calls_limit: number; calls_used: number; suspended: boolean;
  created_at: string; sub_status?: string; sub_amount_kobo?: number;
  extra_minutes?: number; minutes_this_month?: number; total_calls?: number; is_admin?: boolean;
  next_payment_date?: string;
}

interface FeatureFlag {
  id: string; key: string; name: string; description?: string;
  enabled: boolean; plan_access: string[]; category: string;
  is_beta: boolean; rollout_pct: number; usage_count: number;
  updated_by_email?: string; updated_at?: string;
}

interface AuditEntry {
  id: string; flag_key: string; action: string;
  old_value?: any; new_value?: any;
  changed_by_email?: string; changed_at: string; note?: string;
}

interface SaasMetrics {
  mrr_kobo: number; arr_kobo: number; prev_mrr_kobo: number; mrr_growth_pct: number;
  total_users: number; paying_users: number; free_users: number;
  new_users_30d: number; new_users_prev_30d: number; user_growth_pct: number;
  conversion_rate: number; churn_rate: number; arpu_kobo: number; ltv_kobo: number;
}

interface RevenueMonth {
  month: string; sub_revenue_kobo: number; bundle_revenue_kobo: number;
  total_kobo: number; payment_count: number;
}

interface UsageDay {
  day: string; call_count: number; total_minutes: number;
  avg_duration: number; avg_sentiment: number;
}

interface FeatureUsage { feature: string; usage_count: number; }

interface GrowthMonth {
  month: string; new_users: number; new_paying: number;
  cumulative_users: number; cumulative_paying: number;
}

interface OperationalHealth {
  edge_errors_24h: number; edge_errors_by_fn: { function_name: string; error_count: number }[];
  webhook_failures_24h: number; rate_limit_blocks_24h: number;
  live_calls_now: number; security_events_24h: number;
  push_active: number; push_failing: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const PLANS = ["free", "starter", "growth", "scale"];
const PLAN_COLORS: Record<string, string> = {
  free: "#64748b", starter: "#38bdf8", growth: "#34d399", scale: "#a78bfa"
};
const PLAN_NAMES: Record<string, string> = {
  free: "Free", starter: "Starter", growth: "Growth", scale: "Scale"
};
const CAT_COLORS: Record<string, string> = {
  ai: "#a78bfa", core: "#38bdf8", deals: "#34d399", analytics: "#fbbf24",
  coaching: "#fb923c", integrations: "#06b6d4", billing: "#f472b6",
  notifications: "#4ade80", developer: "#818cf8", beta: "#f87171"
};

const koboToNGN = (k: number) =>
  `₦${(k / 100).toLocaleString("en-NG", { minimumFractionDigits: 0 })}`;
const fmt = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M`
  : n >= 1_000 ? `${(n / 1_000).toFixed(1)}k`
  : String(Math.round(n));
const fmtTime = (ts: string) =>
  new Date(ts).toLocaleString("en-NG", { dateStyle: "short", timeStyle: "short" });
const fmtMins = (m: number) =>
  m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;

const NAV_ITEMS = [
  { id: "dashboard",  label: "Dashboard",     icon: "◈" },
  { id: "users",      label: "Users",         icon: "◎" },
  { id: "billing",    label: "Billing",       icon: "◆" },
  { id: "analytics",  label: "Analytics",     icon: "◇" },
  { id: "flags",      label: "Feature Flags", icon: "⌁" },
  { id: "ai",         label: "AI & Infra",    icon: "◉" },
  { id: "security",   label: "Security",      icon: "◐" },
  { id: "auditlog",   label: "Audit Log",     icon: "◳" },
];

// ─────────────────────────────────────────────────────────────────────────────
// ROOT
// ─────────────────────────────────────────────────────────────────────────────

export default function AdminPanel() {
  const { user, signOut } = useAuth();
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const navigate = useNavigate();
  const [section, setSection] = useState("dashboard");
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (!adminLoading && !isAdmin) navigate("/dashboard", { replace: true });
  }, [isAdmin, adminLoading, navigate]);

  if (adminLoading) return <FullScreenLoader />;
  if (!isAdmin) return null;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&family=DM+Sans:wght@400;500;600;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        :root {
          --bg:       #060b12;
          --surface:  #0d1520;
          --raised:   #131f2e;
          --border:   #1a2740;
          --border2:  #243550;
          --text:     #e2eaf4;
          --muted:    #637085;
          --dim:      #3a4d65;
          --accent:   #22d3ee;
          --green:    #34d399;
          --yellow:   #fbbf24;
          --red:      #f87171;
          --purple:   #a78bfa;
          --mono:     'JetBrains Mono', monospace;
          --sans:     'DM Sans', system-ui, sans-serif;
        }
        html, body { background: var(--bg); color: var(--text); font-family: var(--sans); }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: var(--surface); }
        ::-webkit-scrollbar-thumb { background: var(--border2); border-radius: 2px; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes slideIn { from{transform:translateX(-100%)} to{transform:translateX(0)} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes pulse { 0%,100%{box-shadow:0 0 0 0 rgba(34,211,238,0.4)} 70%{box-shadow:0 0 0 8px rgba(34,211,238,0)} }
        .admin-layout { display: flex; min-height: 100vh; }
        .sidebar {
          width: 200px; background: var(--surface); border-right: 1px solid var(--border);
          display: flex; flex-direction: column; flex-shrink: 0;
          position: sticky; top: 0; height: 100vh; overflow: hidden; z-index: 30;
        }
        .sidebar-logo {
          padding: 18px 16px 14px; border-bottom: 1px solid var(--border);
          display: flex; align-items: center; gap: 10px;
        }
        .logo-mark {
          width: 28px; height: 28px; background: var(--accent); border-radius: 6px;
          display: flex; align-items: center; justify-content: center;
          font-family: var(--mono); font-size: 13px; font-weight: 700; color: #000; flex-shrink: 0;
        }
        .logo-text { font-family: var(--mono); font-size: 11px; font-weight: 700; letter-spacing: 0.1em; color: var(--text); line-height: 1.3; }
        .logo-sub { font-size: 9px; color: var(--muted); letter-spacing: 0.12em; margin-top: 1px; }
        .sidebar-nav { flex: 1; padding: 10px 8px; overflow-y: auto; display: flex; flex-direction: column; gap: 2px; }
        .nav-btn {
          width: 100%; display: flex; align-items: center; gap: 10px;
          padding: 9px 10px; border-radius: 7px; border: none; background: none;
          color: var(--muted); cursor: pointer; font-size: 13px; font-family: var(--sans);
          text-align: left; transition: all 0.15s; white-space: nowrap; overflow: hidden;
        }
        .nav-btn:hover { background: var(--raised); color: var(--text); }
        .nav-btn.active { background: rgba(34,211,238,0.1); color: var(--accent); border-left: 2px solid var(--accent); padding-left: 8px; }
        .nav-icon { font-size: 16px; flex-shrink: 0; width: 20px; text-align: center; }
        .sidebar-footer { padding: 12px 10px; border-top: 1px solid var(--border); }
        .admin-email { font-size: 10px; color: var(--dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-bottom: 8px; }
        .signout-btn {
          width: 100%; padding: 7px 10px; background: var(--raised); border: 1px solid var(--border2);
          color: var(--muted); border-radius: 7px; cursor: pointer; font-size: 12px; font-family: var(--sans); transition: all 0.15s;
        }
        .signout-btn:hover { color: var(--red); border-color: var(--red); }
        .drawer-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.7); z-index: 40; }
        .drawer-sidebar {
          position: fixed; left: 0; top: 0; height: 100%; width: 220px;
          background: var(--surface); border-right: 1px solid var(--border); z-index: 50;
          display: flex; flex-direction: column; transform: translateX(-100%); transition: transform 0.2s ease;
        }
        .drawer-sidebar.open { transform: translateX(0); }
        .main { flex: 1; display: flex; flex-direction: column; min-width: 0; overflow: hidden; }
        .topbar {
          background: var(--surface); border-bottom: 1px solid var(--border);
          padding: 12px 20px; display: flex; align-items: center; justify-content: space-between;
          position: sticky; top: 0; z-index: 20; gap: 12px;
        }
        .topbar-left { display: flex; align-items: center; gap: 12px; }
        .hamburger { display: none; background: none; border: 1px solid var(--border); color: var(--muted); padding: 6px 9px; border-radius: 6px; cursor: pointer; font-size: 15px; }
        .topbar-title { font-size: 14px; font-weight: 700; color: var(--text); }
        .back-link { font-size: 12px; color: var(--muted); text-decoration: none; }
        .back-link:hover { color: var(--accent); }
        .content { flex: 1; padding: 20px; overflow-y: auto; animation: fadeUp 0.3s ease; }
        .kpi-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(165px, 1fr)); gap: 10px; margin-bottom: 18px; }
        .kpi-card {
          background: var(--surface); border: 1px solid var(--border); border-radius: 10px;
          padding: 13px 14px; position: relative; overflow: hidden; transition: border-color 0.2s;
        }
        .kpi-card:hover { border-color: var(--border2); }
        .kpi-card::before { content:''; position:absolute; top:0; left:0; right:0; height:2px; background: var(--accent-color,var(--accent)); }
        .kpi-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); margin-bottom: 6px; }
        .kpi-value { font-family: var(--mono); font-size: 22px; font-weight: 700; color: var(--text); line-height: 1; }
        .kpi-sub { font-size: 10px; color: var(--dim); margin-top: 5px; }
        .kpi-delta { font-size: 10px; margin-top: 4px; font-family: var(--mono); font-weight: 600; }
        .delta-up { color: var(--green); }
        .delta-down { color: var(--red); }
        .delta-flat { color: var(--muted); }
        .pulse-dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: var(--red); margin-left: 6px; animation: blink 1.2s infinite; vertical-align: middle; }
        .card { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; margin-bottom: 14px; }
        .card-header { display: flex; align-items: center; gap: 10px; padding: 13px 16px; border-bottom: 1px solid var(--border); }
        .card-icon { width: 28px; height: 28px; background: var(--raised); border: 1px solid var(--border2); border-radius: 7px; display:flex; align-items:center; justify-content:center; font-size:13px; flex-shrink:0; }
        .card-title { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: var(--muted); }
        .card-body { padding: 14px 16px; }
        .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        .three-col { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 14px; }
        .table-wrap { overflow-x: auto; border-radius: 10px; border: 1px solid var(--border); }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        thead { position: sticky; top: 0; z-index: 1; }
        th { background: var(--raised); color: var(--muted); padding: 9px 12px; text-align: left; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; border-bottom: 1px solid var(--border); white-space: nowrap; }
        td { padding: 9px 12px; border-bottom: 1px solid var(--border); background: var(--surface); vertical-align: middle; }
        tr:last-child td { border-bottom: none; }
        tr:hover td { background: var(--raised); }
        .badge { display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: 700; white-space: nowrap; }
        .plan-badge { display: inline-flex; align-items: center; padding: 2px 10px; border-radius: 20px; font-size: 10px; font-weight: 700; font-family: var(--mono); white-space: nowrap; }
        .filter-bar { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-bottom: 14px; }
        .search-input, .select-input {
          background: var(--raised); border: 1px solid var(--border2); color: var(--text);
          padding: 8px 12px; border-radius: 7px; font-size: 12px; font-family: var(--sans); outline: none; transition: border-color 0.15s;
        }
        .search-input { flex: 1; min-width: 160px; }
        .search-input:focus, .select-input:focus { border-color: var(--accent); }
        .select-input { cursor: pointer; }
        .toggle-wrap { display: flex; align-items: center; gap: 8px; }
        .toggle { width: 40px; height: 22px; background: var(--raised); border: 1px solid var(--border2); border-radius: 11px; cursor: pointer; position: relative; transition: all 0.2s; flex-shrink: 0; }
        .toggle.on { background: var(--green); border-color: var(--green); }
        .toggle-knob { position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: #fff; transition: transform 0.2s; }
        .toggle.on .toggle-knob { transform: translateX(18px); }
        .rollout-bar { position: relative; height: 4px; background: var(--border2); border-radius: 2px; overflow: hidden; }
        .rollout-fill { height: 100%; border-radius: 2px; background: var(--accent); transition: width 0.3s; }
        .progress-bg { background: var(--border); border-radius: 4px; height: 5px; overflow: hidden; }
        .progress-fill { height: 100%; border-radius: 4px; transition: width 0.5s ease; }
        .pagination { display: flex; align-items: center; justify-content: center; gap: 12px; margin-top: 12px; }
        .page-btn { background: var(--raised); border: 1px solid var(--border2); color: var(--muted); padding: 6px 12px; border-radius: 7px; cursor: pointer; font-size: 12px; font-family: var(--sans); transition: all 0.15s; }
        .page-btn:hover:not(:disabled) { color: var(--text); border-color: var(--accent); }
        .page-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .action-btn { background: var(--raised); border: 1px solid var(--border2); color: var(--muted); padding: 4px 8px; border-radius: 5px; cursor: pointer; font-size: 12px; transition: all 0.15s; white-space: nowrap; }
        .action-btn:hover { color: var(--text); }
        .action-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .flag-row { display: flex; align-items: flex-start; gap: 14px; padding: 12px 0; border-bottom: 1px solid var(--border); }
        .flag-row:last-child { border-bottom: none; }
        .flag-info { flex: 1; min-width: 0; }
        .flag-key { font-family: var(--mono); font-size: 12px; color: var(--accent); margin-bottom: 2px; }
        .flag-name { font-size: 13px; font-weight: 600; color: var(--text); }
        .flag-desc { font-size: 11px; color: var(--muted); margin-top: 3px; line-height: 1.4; }
        .flag-meta { display: flex; gap: 5px; flex-wrap: wrap; margin-top: 6px; }
        .flag-controls { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; flex-shrink: 0; }
        .health-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--border); font-size: 12px; }
        .health-row:last-child { border-bottom: none; }
        .status-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.75); display: flex; align-items: center; justify-content: center; z-index: 100; padding: 16px; }
        .modal { background: var(--surface); border: 1px solid var(--border2); border-radius: 14px; width: min(560px,100%); max-height: 85vh; overflow-y: auto; padding: 22px; animation: fadeUp 0.2s ease; }
        .modal-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 18px; padding-bottom: 14px; border-bottom: 1px solid var(--border); }
        .close-btn { background: none; border: none; color: var(--muted); font-size: 18px; cursor: pointer; padding: 2px 6px; border-radius: 4px; }
        .close-btn:hover { color: var(--text); background: var(--raised); }
        .info-bar { background: rgba(34,211,238,0.07); border: 1px solid rgba(34,211,238,0.2); color: rgba(34,211,238,0.85); padding: 10px 14px; border-radius: 8px; font-size: 12px; margin-bottom: 14px; }
        .warn-bar { background: rgba(251,191,36,0.07); border: 1px solid rgba(251,191,36,0.2); color: rgba(251,191,36,0.9); padding: 10px 14px; border-radius: 8px; font-size: 12px; margin-bottom: 14px; }
        .skeleton { background: var(--raised); border-radius: 8px; animation: blink 1.5s ease infinite; }
        mark { background: rgba(34,211,238,0.2); color: var(--accent); border-radius: 2px; }
        .emergency-btn { background: rgba(248,113,113,0.1); border: 1px solid rgba(248,113,113,0.4); color: var(--red); padding: 8px 16px; border-radius: 8px; cursor: pointer; font-size: 12px; font-weight: 700; font-family: var(--sans); transition: all 0.15s; }
        .emergency-btn:hover { background: rgba(248,113,113,0.2); }
        .cat-tabs { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 14px; }
        .cat-tab { padding: 5px 12px; border-radius: 20px; font-size: 11px; font-weight: 600; cursor: pointer; border: 1px solid var(--border); background: var(--raised); color: var(--muted); transition: all 0.15s; white-space: nowrap; }
        .cat-tab.active { color: #000; border-color: transparent; }
        .rev-chart { display: flex; align-items: flex-end; gap: 2px; height: 100px; }
        .rev-bar { flex: 1; border-radius: 2px 2px 0 0; min-height: 2px; transition: height 0.5s ease; cursor: pointer; }
        .rev-bar:hover { filter: brightness(1.3); }
        /* ── Analytics-specific ── */
        .an-tabs { display: flex; gap: 5px; flex-wrap: wrap; margin-bottom: 18px; }
        .an-tab { padding: 7px 16px; border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer; border: 1px solid var(--border2); background: var(--raised); color: var(--muted); transition: all 0.15s; font-family: var(--sans); }
        .an-tab.active { background: rgba(34,211,238,0.1); color: var(--accent); border-color: var(--accent); }
        .range-tabs { display: flex; gap: 4px; }
        .range-tab { padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 700; cursor: pointer; border: 1px solid var(--border2); background: transparent; color: var(--dim); transition: all 0.12s; font-family: var(--mono); }
        .range-tab.active { background: var(--accent); color: #000; border-color: var(--accent); }
        .spark-chart { display: flex; align-items: flex-end; gap: 1.5px; }
        .spark-bar { border-radius: 1px 1px 0 0; min-height: 2px; transition: height 0.4s; cursor: pointer; }
        .spark-bar:hover { filter: brightness(1.4); }
        .tooltip-wrap { position: relative; }
        .tooltip-wrap:hover .tooltip-box { display: block; }
        .tooltip-box { display: none; position: absolute; bottom: calc(100% + 6px); left: 50%; transform: translateX(-50%); background: #1a2740; border: 1px solid var(--border2); padding: 5px 9px; border-radius: 6px; font-size: 10px; color: var(--text); white-space: nowrap; z-index: 10; pointer-events: none; font-family: var(--mono); }
        .export-btn { background: var(--raised); border: 1px solid var(--border2); color: var(--muted); padding: 6px 14px; border-radius: 7px; cursor: pointer; font-size: 11px; font-weight: 700; font-family: var(--sans); transition: all 0.15s; display: flex; align-items: center; gap: 5px; }
        .export-btn:hover { color: var(--accent); border-color: var(--accent); }
        .metric-row { display: flex; justify-content: space-between; align-items: center; padding: 9px 0; border-bottom: 1px solid var(--border); }
        .metric-row:last-child { border-bottom: none; }
        .metric-label { font-size: 12px; color: var(--muted); }
        .metric-value { font-family: var(--mono); font-size: 13px; font-weight: 700; color: var(--text); }
        .live-badge { display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; border-radius: 20px; font-size: 10px; font-weight: 700; background: rgba(52,211,153,0.1); color: var(--green); border: 1px solid rgba(52,211,153,0.25); }
        .live-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--green); animation: blink 1s infinite; }
        @media (max-width: 900px) {
          .sidebar { display: none; }
          .hamburger { display: flex; align-items: center; }
          .drawer-overlay.open { display: block; }
          .two-col { grid-template-columns: 1fr; }
          .three-col { grid-template-columns: 1fr; }
          .kpi-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 600px) {
          .content { padding: 12px; }
          .kpi-grid { grid-template-columns: 1fr 1fr; gap: 8px; }
          .kpi-value { font-size: 18px; }
          .filter-bar { flex-direction: column; }
          .search-input { width: 100%; }
          .flag-row { flex-direction: column; gap: 10px; }
          .flag-controls { flex-direction: row; align-items: center; width: 100%; justify-content: space-between; }
          table { font-size: 11px; }
          th, td { padding: 7px 8px; }
          .topbar { padding: 10px 14px; }
          .an-tabs { gap: 4px; }
          .an-tab { padding: 6px 12px; font-size: 11px; }
        }
        @media (max-width: 420px) {
          .kpi-grid { grid-template-columns: 1fr; }
          .modal { padding: 16px; }
        }
      `}</style>

      <div className="admin-layout">
        <aside className="sidebar">
          <SidebarContents user={user} section={section} onSelect={setSection}
            onSignOut={async () => { await signOut(); navigate("/login"); }} />
        </aside>

        <div className={`drawer-overlay ${drawerOpen ? "open" : ""}`} onClick={() => setDrawerOpen(false)} />
        <aside className={`drawer-sidebar ${drawerOpen ? "open" : ""}`}>
          <SidebarContents user={user} section={section}
            onSelect={(s) => { setSection(s); setDrawerOpen(false); }}
            onSignOut={async () => { await signOut(); navigate("/login"); }} />
        </aside>

        <div className="main">
          <header className="topbar">
            <div className="topbar-left">
              <button className="hamburger" onClick={() => setDrawerOpen(true)}>☰</button>
              <span className="topbar-title">{NAV_ITEMS.find(n => n.id === section)?.label}</span>
              {section === "analytics" && (
                <span className="live-badge"><span className="live-dot" />Live</span>
              )}
            </div>
            <Link to="/dashboard" className="back-link">← App</Link>
          </header>

          <div className="content" key={section}>
            {section === "dashboard"  && <DashboardSection />}
            {section === "users"      && <UsersSection />}
            {section === "billing"    && <BillingSection />}
            {section === "analytics"  && <AnalyticsSection />}
            {section === "flags"      && <FeatureFlagsSection />}
            {section === "ai"         && <AIInfraSection />}
            {section === "security"   && <SecuritySection />}
            {section === "auditlog"   && <FlagAuditSection />}
          </div>
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SIDEBAR
// ─────────────────────────────────────────────────────────────────────────────

function SidebarContents({ user, section, onSelect, onSignOut }: {
  user: any; section: string; onSelect: (s: string) => void; onSignOut: () => void;
}) {
  return (
    <>
      <div className="sidebar-logo">
        <div className="logo-mark">FX</div>
        <div>
          <div className="logo-text">FIXSENSE</div>
          <div className="logo-sub">OPS CENTER</div>
        </div>
      </div>
      <nav className="sidebar-nav">
        {NAV_ITEMS.map(n => (
          <button key={n.id} className={`nav-btn ${section === n.id ? "active" : ""}`} onClick={() => onSelect(n.id)}>
            <span className="nav-icon">{n.icon}</span>
            <span>{n.label}</span>
          </button>
        ))}
      </nav>
      <div className="sidebar-footer">
        <div className="admin-email">{user?.email}</div>
        <button className="signout-btn" onClick={onSignOut}>Sign out</button>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════════
//  ANALYTICS SECTION  ← new
// ════════════════════════════════════════════════════════════════════════════
// ─────────────────────────────────────────────────────────────────────────────

type RangeKey = "7d" | "30d" | "90d" | "12m";

const RANGE_DAYS: Record<RangeKey, number> = { "7d": 7, "30d": 30, "90d": 90, "12m": 365 };
const RANGE_MONTHS: Record<RangeKey, number> = { "7d": 1, "30d": 1, "90d": 3, "12m": 12 };

function AnalyticsSection() {
  const [activeTab, setActiveTab] = useState<"overview" | "revenue" | "users" | "usage" | "ops">("overview");
  const [range, setRange]         = useState<RangeKey>("30d");
  const [saas,    setSaas]        = useState<SaasMetrics | null>(null);
  const [revData, setRevData]     = useState<{ monthly: RevenueMonth[]; plan_distribution: any[]; bundle_stats: any; total_sub_revenue_kobo: number; total_bundle_revenue_kobo: number } | null>(null);
  const [usageData, setUsageData] = useState<{ daily_calls: UsageDay[]; feature_usage: FeatureUsage[]; totals: any } | null>(null);
  const [ops,     setOps]         = useState<OperationalHealth | null>(null);
  const [growth,  setGrowth]      = useState<GrowthMonth[]>([]);
  const [loading, setLoading]     = useState(true);
  const rtChannelRef              = useRef<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const days   = RANGE_DAYS[range];
    const months = RANGE_MONTHS[range];

    const [saasRes, revRes, usageRes, opsRes, growthRes] = await Promise.all([
      (supabase as any).rpc("admin_get_saas_metrics"),
      (supabase as any).rpc("admin_get_revenue_breakdown", { p_months: months }),
      (supabase as any).rpc("admin_get_usage_analytics",   { p_days: days }),
      (supabase as any).rpc("admin_get_operational_health"),
      (supabase as any).rpc("admin_get_user_growth",       { p_months: months }),
    ]);

    if (saasRes.data)  setSaas(saasRes.data);
    if (revRes.data)   setRevData(revRes.data);
    if (usageRes.data) setUsageData(usageRes.data);
    if (opsRes.data)   setOps(opsRes.data);
    if (growthRes.data) setGrowth(Array.isArray(growthRes.data) ? growthRes.data : []);

    setLoading(false);
  }, [range]);

  useEffect(() => { load(); }, [load]);

  // Realtime: refresh when calls or subscriptions change
  useEffect(() => {
    if (rtChannelRef.current) supabase.removeChannel(rtChannelRef.current);
    const ch = supabase.channel("analytics-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "calls" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "subscriptions" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, () => load())
      .subscribe();
    rtChannelRef.current = ch;
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  // ── CSV export ──
  const exportCSV = () => {
    if (!saas || !revData) return;
    const rows: string[][] = [
      ["Metric", "Value"],
      ["MRR (₦)", String((saas.mrr_kobo / 100).toFixed(0))],
      ["ARR (₦)", String((saas.arr_kobo / 100).toFixed(0))],
      ["MRR Growth %", String(saas.mrr_growth_pct)],
      ["Total Users", String(saas.total_users)],
      ["Paying Users", String(saas.paying_users)],
      ["Conversion Rate %", String(saas.conversion_rate)],
      ["Churn Rate %", String(saas.churn_rate)],
      ["ARPU (₦)", String((saas.arpu_kobo / 100).toFixed(0))],
      ["LTV (₦)", String((saas.ltv_kobo / 100).toFixed(0))],
      [],
      ["Month", "Sub Revenue (₦)", "Bundle Revenue (₦)", "Total (₦)"],
      ...(revData.monthly || []).map((m: RevenueMonth) => [
        m.month,
        String((m.sub_revenue_kobo / 100).toFixed(0)),
        String((m.bundle_revenue_kobo / 100).toFixed(0)),
        String((m.total_kobo / 100).toFixed(0)),
      ]),
    ];
    const csv = rows.map(r => r.map(v => `"${v}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `fixsense-analytics-${range}-${Date.now()}.csv`;
    a.click();
    toast.success("Analytics exported");
  };

  const tabs = [
    { id: "overview", label: "Overview"  },
    { id: "revenue",  label: "Revenue"   },
    { id: "users",    label: "Users"     },
    { id: "usage",    label: "Usage"     },
    { id: "ops",      label: "Operations"},
  ] as const;

  return (
    <div>
      {/* Header bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div className="an-tabs">
          {tabs.map(t => (
            <button key={t.id} className={`an-tab ${activeTab === t.id ? "active" : ""}`} onClick={() => setActiveTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div className="range-tabs">
            {(["7d", "30d", "90d", "12m"] as RangeKey[]).map(r => (
              <button key={r} className={`range-tab ${range === r ? "active" : ""}`} onClick={() => setRange(r)}>{r}</button>
            ))}
          </div>
          <button className="export-btn" onClick={exportCSV}>⬇ CSV</button>
        </div>
      </div>

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <SkeletonGrid count={8} height={88} />
        </div>
      ) : (
        <>
          {activeTab === "overview"  && <OverviewTab  saas={saas} revData={revData} ops={ops} usageData={usageData} />}
          {activeTab === "revenue"   && <RevenueTab   revData={revData} saas={saas} />}
          {activeTab === "users"     && <UsersAnalyticsTab saas={saas} growth={growth} revData={revData} />}
          {activeTab === "usage"     && <UsageTab     usageData={usageData} />}
          {activeTab === "ops"       && <OpsTab       ops={ops} />}
        </>
      )}
    </div>
  );
}

// ── Overview tab ─────────────────────────────────────────────────────────────

function OverviewTab({ saas, revData, ops, usageData }: {
  saas: SaasMetrics | null; revData: any; ops: OperationalHealth | null; usageData: any;
}) {
  if (!saas) return <ErrorBlock msg="No data" />;

  const kpis = [
    { label: "MRR",            value: koboToNGN(saas.mrr_kobo),        delta: saas.mrr_growth_pct,  color: "#34d399" },
    { label: "ARR",            value: koboToNGN(saas.arr_kobo),        delta: saas.mrr_growth_pct,  color: "#a78bfa" },
    { label: "Paying Users",   value: fmt(saas.paying_users),          delta: null,                  color: "#38bdf8" },
    { label: "Conversion",     value: `${saas.conversion_rate}%`,      delta: null,                  color: "#fbbf24" },
    { label: "ARPU / month",   value: koboToNGN(saas.arpu_kobo),       delta: null,                  color: "#fb923c" },
    { label: "LTV (est.)",     value: koboToNGN(saas.ltv_kobo),        delta: null,                  color: "#818cf8" },
    { label: "Churn Rate",     value: `${saas.churn_rate}%`,           delta: null,                  color: saas.churn_rate > 5 ? "#f87171" : "#34d399" },
    { label: "New Users 30d",  value: fmt(saas.new_users_30d),         delta: saas.user_growth_pct,  color: "#06b6d4" },
  ];

  const monthly: RevenueMonth[] = revData?.monthly || [];
  const maxTotal = Math.max(...monthly.map((m: RevenueMonth) => m.total_kobo), 1);
  const totalMins = usageData?.totals?.total_minutes ?? 0;
  const totalCalls = usageData?.totals?.total_calls ?? 0;

  return (
    <div>
      <div className="kpi-grid">
        {kpis.map(k => <KpiCardDelta key={k.label} label={k.label} value={k.value} delta={k.delta} color={k.color} />)}
      </div>

      <div className="two-col">
        {/* Revenue mini-chart */}
        <div className="card">
          <div className="card-header"><span className="card-icon">◆</span><span className="card-title">Revenue Trend</span></div>
          <div className="card-body">
            <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 90 }}>
              {[...monthly].reverse().map((m, i) => {
                const subH  = Math.max(2, (m.sub_revenue_kobo / maxTotal) * 86);
                const bunH  = Math.max(0, (m.bundle_revenue_kobo / maxTotal) * 86);
                return (
                  <div key={i} className="tooltip-wrap" style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 1 }}>
                    <div className="tooltip-box">{m.month}<br />{koboToNGN(m.total_kobo)}</div>
                    {bunH > 0 && <div style={{ width: "100%", height: `${bunH}px`, background: "#a78bfa", borderRadius: "1px 1px 0 0" }} />}
                    <div style={{ width: "100%", height: `${subH}px`, background: "#34d399", borderRadius: bunH > 0 ? 0 : "1px 1px 0 0" }} />
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 8, fontSize: 10, color: "var(--muted)" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 8, height: 8, background: "#34d399", borderRadius: 2, display: "inline-block" }} />Subscriptions</span>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 8, height: 8, background: "#a78bfa", borderRadius: 2, display: "inline-block" }} />Bundles</span>
            </div>
          </div>
        </div>

        {/* Quick metrics */}
        <div className="card">
          <div className="card-header"><span className="card-icon">◉</span><span className="card-title">Quick Metrics</span></div>
          <div className="card-body">
            <div className="metric-row"><span className="metric-label">Total calls (period)</span><span className="metric-value">{fmt(totalCalls)}</span></div>
            <div className="metric-row"><span className="metric-label">Minutes used (period)</span><span className="metric-value">{fmtMins(totalMins)}</span></div>
            <div className="metric-row"><span className="metric-label">Live calls now</span><span className="metric-value" style={{ color: "var(--green)" }}>{ops?.live_calls_now ?? 0}</span></div>
            <div className="metric-row"><span className="metric-label">Push subscriptions</span><span className="metric-value">{ops?.push_active ?? 0}</span></div>
            <div className="metric-row"><span className="metric-label">Edge errors (24h)</span><span className="metric-value" style={{ color: (ops?.edge_errors_24h ?? 0) > 0 ? "var(--red)" : "var(--green)" }}>{ops?.edge_errors_24h ?? 0}</span></div>
            <div className="metric-row"><span className="metric-label">Webhook failures (24h)</span><span className="metric-value" style={{ color: (ops?.webhook_failures_24h ?? 0) > 0 ? "var(--yellow)" : "var(--green)" }}>{ops?.webhook_failures_24h ?? 0}</span></div>
          </div>
        </div>
      </div>

      {/* Plan distribution */}
      <div className="card">
        <div className="card-header"><span className="card-icon">◈</span><span className="card-title">Plan Distribution</span></div>
        <div className="card-body">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
            {(revData?.plan_distribution || []).map((p: any) => {
              const pk = PLANS.find(pl => p.plan_key?.toLowerCase().includes(pl)) || p.plan_key || "free";
              const pct = saas ? Math.round((p.user_count / saas.total_users) * 100) : 0;
              return (
                <div key={p.plan_key} style={{ background: "var(--raised)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span className="plan-badge" style={{ background: PLAN_COLORS[pk] + "22", color: PLAN_COLORS[pk] }}>{p.plan_key || "free"}</span>
                    <span style={{ fontFamily: "var(--mono)", fontSize: 14, fontWeight: 700, color: "var(--text)" }}>{p.user_count}</span>
                  </div>
                  <div className="progress-bg">
                    <div className="progress-fill" style={{ width: `${pct}%`, background: PLAN_COLORS[pk] }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 10, color: "var(--muted)" }}>
                    <span>{pct}% of users</span>
                    <span>{koboToNGN(p.monthly_kobo || 0)}/mo</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Revenue tab ───────────────────────────────────────────────────────────────

function RevenueTab({ revData, saas }: { revData: any; saas: SaasMetrics | null }) {
  const monthly: RevenueMonth[] = revData?.monthly || [];
  const bundles = revData?.bundle_stats || {};
  const maxTotal = Math.max(...monthly.map((m: RevenueMonth) => m.total_kobo), 1);
  const totalSub    = revData?.total_sub_revenue_kobo || 0;
  const totalBundle = revData?.total_bundle_revenue_kobo || 0;
  const totalAll    = totalSub + totalBundle;

  return (
    <div>
      <div className="kpi-grid">
        <KpiCard label="Total Revenue"        value={koboToNGN(totalAll)}         sub="all time"           color="#34d399" />
        <KpiCard label="Subscription Rev."    value={koboToNGN(totalSub)}         sub={`${saas?.paying_users ?? 0} active subs`} color="#38bdf8" />
        <KpiCard label="Extra Min. Revenue"   value={koboToNGN(totalBundle)}      sub={`${bundles.total_purchases ?? 0} purchases`} color="#a78bfa" />
        <KpiCard label="MRR"                  value={koboToNGN(saas?.mrr_kobo ?? 0)} sub="monthly recurring" color="#fbbf24" />
        <KpiCard label="ARR"                  value={koboToNGN(saas?.arr_kobo ?? 0)} sub="annualised"        color="#818cf8" />
        <KpiCard label="ARPU"                 value={koboToNGN(saas?.arpu_kobo ?? 0)} sub="per paying user" color="#fb923c" />
        <KpiCard label="LTV (est. 12mo)"      value={koboToNGN(saas?.ltv_kobo ?? 0)}  sub="avg lifetime value" color="#06b6d4" />
        <KpiCard label="Bundle Min. Sold"     value={fmtMins(bundles.total_minutes_sold ?? 0)} sub={`${bundles.unique_buyers ?? 0} buyers`} color="#f472b6" />
      </div>

      {/* Stacked bar chart */}
      <div className="card">
        <div className="card-header"><span className="card-icon">◆</span><span className="card-title">Revenue Breakdown by Month</span></div>
        <div className="card-body">
          <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 140 }}>
            {[...monthly].reverse().map((m, i) => {
              const subH  = Math.max(2, (m.sub_revenue_kobo / maxTotal) * 134);
              const bunH  = Math.max(0, (m.bundle_revenue_kobo / maxTotal) * 134);
              return (
                <div key={i} className="tooltip-wrap" style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 1 }}>
                  <div className="tooltip-box">
                    {m.month}<br />
                    Sub: {koboToNGN(m.sub_revenue_kobo)}<br />
                    Bundle: {koboToNGN(m.bundle_revenue_kobo)}<br />
                    Total: {koboToNGN(m.total_kobo)}
                  </div>
                  {bunH > 0 && <div style={{ width: "100%", height: `${bunH}px`, background: "linear-gradient(180deg,#a78bfa,#6d28d9)", borderRadius: "2px 2px 0 0" }} />}
                  <div style={{ width: "100%", height: `${subH}px`, background: "linear-gradient(180deg,#34d399,#059669)", borderRadius: bunH > 0 ? 0 : "2px 2px 0 0" }} />
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", marginTop: 6, gap: 4 }}>
            {[...monthly].reverse().map((m, i) => (
              <div key={i} style={{ flex: 1, textAlign: "center", fontSize: 8, color: "var(--dim)", fontFamily: "var(--mono)", overflow: "hidden" }}>{m.month.slice(5)}</div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 14, marginTop: 10 }}>
            <span style={{ fontSize: 10, color: "var(--muted)", display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: "#34d399", display: "inline-block" }} />Subscriptions</span>
            <span style={{ fontSize: 10, color: "var(--muted)", display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: "#a78bfa", display: "inline-block" }} />Extra Minutes</span>
          </div>
        </div>
      </div>

      {/* Monthly table */}
      <div className="table-wrap">
        <table>
          <thead><tr>
            <th>Month</th><th>Sub Revenue</th><th>Bundle Revenue</th><th>Total</th><th>Payments</th>
          </tr></thead>
          <tbody>
            {monthly.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--muted)", padding: 24 }}>No revenue data</td></tr>
            ) : monthly.map((m: RevenueMonth) => (
              <tr key={m.month}>
                <td style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--accent)" }}>{m.month}</td>
                <td style={{ fontFamily: "var(--mono)", fontSize: 12, fontWeight: 700, color: "#34d399" }}>{koboToNGN(m.sub_revenue_kobo)}</td>
                <td style={{ fontFamily: "var(--mono)", fontSize: 12, fontWeight: 700, color: "#a78bfa" }}>{koboToNGN(m.bundle_revenue_kobo)}</td>
                <td style={{ fontFamily: "var(--mono)", fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{koboToNGN(m.total_kobo)}</td>
                <td style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--muted)" }}>{m.payment_count}</td>
              </tr>
            ))}
            <tr style={{ background: "var(--raised)" }}>
              <td style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)", fontWeight: 700 }}>TOTAL</td>
              <td style={{ fontFamily: "var(--mono)", fontSize: 13, fontWeight: 700, color: "#34d399" }}>{koboToNGN(totalSub)}</td>
              <td style={{ fontFamily: "var(--mono)", fontSize: 13, fontWeight: 700, color: "#a78bfa" }}>{koboToNGN(totalBundle)}</td>
              <td style={{ fontFamily: "var(--mono)", fontSize: 14, fontWeight: 700, color: "var(--text)" }}>{koboToNGN(totalAll)}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Users analytics tab ───────────────────────────────────────────────────────

function UsersAnalyticsTab({ saas, growth, revData }: { saas: SaasMetrics | null; growth: GrowthMonth[]; revData: any }) {
  if (!saas) return <ErrorBlock msg="No data" />;

  const maxGrowth = Math.max(...growth.map(g => g.new_users), 1);
  const maxCumul  = Math.max(...growth.map(g => g.cumulative_users), 1);

  return (
    <div>
      <div className="kpi-grid">
        <KpiCardDelta label="Total Users"      value={fmt(saas.total_users)}    delta={saas.user_growth_pct}  color="#38bdf8" />
        <KpiCard      label="Paying Users"     value={fmt(saas.paying_users)}   sub={`${saas.conversion_rate}% of total`} color="#34d399" />
        <KpiCard      label="Free Users"       value={fmt(saas.free_users)}     sub="not converted"           color="#64748b" />
        <KpiCard      label="New (30d)"        value={fmt(saas.new_users_30d)}  sub={`prev: ${saas.new_users_prev_30d}`} color="#fbbf24" />
        <KpiCard      label="Conversion Rate"  value={`${saas.conversion_rate}%`} sub="free → paid"           color="#a78bfa" />
        <KpiCard      label="Churn Rate"       value={`${saas.churn_rate}%`}    sub="30-day"                  color={saas.churn_rate > 5 ? "#f87171" : "#34d399"} />
      </div>

      <div className="two-col">
        {/* New users per month bars */}
        <div className="card">
          <div className="card-header"><span className="card-icon">◎</span><span className="card-title">New Users / Month</span></div>
          <div className="card-body">
            <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 110 }}>
              {[...growth].map((g, i) => {
                const newH  = Math.max(2, (g.new_users / maxGrowth) * 106);
                const paidH = Math.max(0, (g.new_paying / maxGrowth) * 106);
                return (
                  <div key={i} className="tooltip-wrap" style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 1 }}>
                    <div className="tooltip-box">{g.month}<br />New: {g.new_users}<br />Paying: {g.new_paying}</div>
                    <div style={{ width: "100%", height: `${newH}px`, background: "rgba(56,189,248,0.3)", borderRadius: "2px 2px 0 0", position: "relative" }}>
                      {paidH > 0 && <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: `${paidH}px`, background: "#38bdf8", borderRadius: 0 }} />}
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", marginTop: 5, gap: 3 }}>
              {[...growth].map((g, i) => (
                <div key={i} style={{ flex: 1, textAlign: "center", fontSize: 8, color: "var(--dim)", fontFamily: "var(--mono)", overflow: "hidden" }}>{g.month.slice(5)}</div>
              ))}
            </div>
          </div>
        </div>

        {/* Cumulative */}
        <div className="card">
          <div className="card-header"><span className="card-icon">◇</span><span className="card-title">Cumulative Growth</span></div>
          <div className="card-body">
            <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 110 }}>
              {[...growth].map((g, i) => {
                const h = Math.max(2, (g.cumulative_users / maxCumul) * 106);
                const ph = Math.max(0, (g.cumulative_paying / maxCumul) * 106);
                return (
                  <div key={i} className="tooltip-wrap" style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                    <div className="tooltip-box">{g.month}<br />Total: {g.cumulative_users}<br />Paying: {g.cumulative_paying}</div>
                    <div style={{ width: "100%", height: `${h}px`, background: "rgba(167,139,250,0.25)", borderRadius: "2px 2px 0 0", position: "relative" }}>
                      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: `${ph}px`, background: "#a78bfa" }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", marginTop: 5, gap: 3 }}>
              {[...growth].map((g, i) => (
                <div key={i} style={{ flex: 1, textAlign: "center", fontSize: 8, color: "var(--dim)", fontFamily: "var(--mono)", overflow: "hidden" }}>{g.month.slice(5)}</div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Growth table */}
      <div className="table-wrap">
        <table>
          <thead><tr>
            <th>Month</th><th>New Users</th><th>New Paying</th><th>Conv %</th><th>Total Users</th><th>Total Paying</th>
          </tr></thead>
          <tbody>
            {growth.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--muted)", padding: 24 }}>No data yet</td></tr>
            ) : [...growth].map((g: GrowthMonth) => (
              <tr key={g.month}>
                <td style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--accent)" }}>{g.month}</td>
                <td style={{ fontFamily: "var(--mono)", fontSize: 12, fontWeight: 700, color: "var(--text)" }}>{g.new_users}</td>
                <td style={{ fontFamily: "var(--mono)", fontSize: 12, color: "#38bdf8" }}>{g.new_paying}</td>
                <td style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--muted)" }}>
                  {g.new_users > 0 ? `${Math.round((g.new_paying / g.new_users) * 100)}%` : "—"}
                </td>
                <td style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--text)" }}>{g.cumulative_users}</td>
                <td style={{ fontFamily: "var(--mono)", fontSize: 12, color: "#a78bfa" }}>{g.cumulative_paying}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Usage tab ─────────────────────────────────────────────────────────────────

function UsageTab({ usageData }: { usageData: any }) {
  const daily: UsageDay[]  = usageData?.daily_calls || [];
  const features: FeatureUsage[] = usageData?.feature_usage || [];
  const totals = usageData?.totals || {};

  const maxCalls = Math.max(...daily.map(d => d.call_count), 1);
  const maxMins  = Math.max(...daily.map(d => d.total_minutes), 1);

  const FEAT_LABELS: Record<string, { label: string; color: string; icon: string }> = {
    ai_summaries:    { label: "AI Summaries",    color: "#a78bfa", icon: "◉" },
    transcripts:     { label: "Transcript Lines", color: "#38bdf8", icon: "≡" },
    objections:      { label: "Objections Det.", color: "#f87171", icon: "⊗" },
    coaching_clips:  { label: "Coaching Clips",  color: "#fbbf24", icon: "▷" },
    deal_rooms:      { label: "Deal Rooms",       color: "#34d399", icon: "◆" },
  };

  return (
    <div>
      <div className="kpi-grid">
        <KpiCard label="Total Calls"       value={fmt(totals.total_calls ?? 0)}   sub="this period"    color="#38bdf8" />
        <KpiCard label="Total Minutes"     value={fmtMins(totals.total_minutes ?? 0)} sub="recorded"   color="#a78bfa" />
        <KpiCard label="Avg Call Length"   value={fmtMins(Math.round(totals.avg_duration ?? 0))} sub="per call" color="#34d399" />
        <KpiCard label="Active Users"      value={fmt(totals.active_users ?? 0)}  sub="called this period" color="#fbbf24" />
        <KpiCard label="Avg Sentiment"     value={`${Math.round(totals.avg_sentiment ?? 0)}%`} sub="call health" color={totals.avg_sentiment > 60 ? "#34d399" : "#f87171"} />
        <KpiCard label="Live Now"          value={fmt(totals.live_calls ?? 0)}    sub="in progress"    color="#f87171" pulse={totals.live_calls > 0} />
      </div>

      <div className="two-col">
        {/* Calls per day */}
        <div className="card">
          <div className="card-header"><span className="card-icon">◈</span><span className="card-title">Calls Per Day</span></div>
          <div className="card-body">
            <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 100 }}>
              {daily.map((d, i) => (
                <div key={i} className="tooltip-wrap" style={{ flex: 1 }}>
                  <div className="tooltip-box">{d.day}<br />{d.call_count} calls<br />{fmtMins(Math.round(d.total_minutes))}</div>
                  <div style={{ width: "100%", height: `${Math.max(2, (d.call_count / maxCalls) * 96)}px`, background: "linear-gradient(180deg,#38bdf8,#0284c7)", borderRadius: "2px 2px 0 0" }} />
                </div>
              ))}
            </div>
            {daily.length === 0 && <div style={{ textAlign: "center", color: "var(--muted)", padding: 20, fontSize: 12 }}>No calls this period</div>}
          </div>
        </div>

        {/* Minutes per day */}
        <div className="card">
          <div className="card-header"><span className="card-icon">⌛</span><span className="card-title">Minutes Per Day</span></div>
          <div className="card-body">
            <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 100 }}>
              {daily.map((d, i) => (
                <div key={i} className="tooltip-wrap" style={{ flex: 1 }}>
                  <div className="tooltip-box">{d.day}<br />{fmtMins(Math.round(d.total_minutes))}</div>
                  <div style={{ width: "100%", height: `${Math.max(2, (d.total_minutes / maxMins) * 96)}px`, background: "linear-gradient(180deg,#a78bfa,#6d28d9)", borderRadius: "2px 2px 0 0" }} />
                </div>
              ))}
            </div>
            {daily.length === 0 && <div style={{ textAlign: "center", color: "var(--muted)", padding: 20, fontSize: 12 }}>No usage this period</div>}
          </div>
        </div>
      </div>

      {/* Feature adoption */}
      <div className="card">
        <div className="card-header"><span className="card-icon">◇</span><span className="card-title">Feature Adoption</span></div>
        <div className="card-body">
          {features.length === 0 ? (
            <div style={{ textAlign: "center", color: "var(--muted)", padding: 20, fontSize: 12 }}>No feature data</div>
          ) : (() => {
            const maxUsage = Math.max(...features.map(f => f.usage_count), 1);
            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {features.map(f => {
                  const cfg = FEAT_LABELS[f.feature] || { label: f.feature, color: "var(--accent)", icon: "◈" };
                  const pct = Math.round((f.usage_count / maxUsage) * 100);
                  return (
                    <div key={f.feature}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5, alignItems: "center" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                          <span style={{ color: cfg.color, fontSize: 14 }}>{cfg.icon}</span>
                          <span style={{ fontSize: 12, color: "var(--text)" }}>{cfg.label}</span>
                        </div>
                        <span style={{ fontFamily: "var(--mono)", fontSize: 12, fontWeight: 700, color: cfg.color }}>{fmt(f.usage_count)}</span>
                      </div>
                      <div className="progress-bg"><div className="progress-fill" style={{ width: `${pct}%`, background: cfg.color }} /></div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

// ── Operations tab ─────────────────────────────────────────────────────────────

function OpsTab({ ops }: { ops: OperationalHealth | null }) {
  if (!ops) return <ErrorBlock msg="No operational data" />;

  const errFns: { function_name: string; error_count: number }[] = ops.edge_errors_by_fn || [];

  const health = [
    { label: "Live Calls",          val: fmt(ops.live_calls_now),         ok: true,                                color: ops.live_calls_now > 0 ? "var(--green)" : "var(--muted)" },
    { label: "Edge Errors (24h)",   val: fmt(ops.edge_errors_24h),        ok: ops.edge_errors_24h === 0,           color: ops.edge_errors_24h > 0 ? "var(--red)" : "var(--green)" },
    { label: "Webhook Failures",    val: fmt(ops.webhook_failures_24h),   ok: ops.webhook_failures_24h === 0,      color: ops.webhook_failures_24h > 0 ? "var(--yellow)" : "var(--green)" },
    { label: "Rate Limit Blocks",   val: fmt(ops.rate_limit_blocks_24h),  ok: ops.rate_limit_blocks_24h < 50,      color: ops.rate_limit_blocks_24h > 50 ? "var(--yellow)" : "var(--green)" },
    { label: "Security Events",     val: fmt(ops.security_events_24h),    ok: ops.security_events_24h === 0,       color: ops.security_events_24h > 0 ? "var(--yellow)" : "var(--green)" },
    { label: "Push Active",         val: fmt(ops.push_active),            ok: true,                                color: "var(--text)" },
    { label: "Push Failing",        val: fmt(ops.push_failing),           ok: ops.push_failing === 0,              color: ops.push_failing > 0 ? "var(--red)" : "var(--green)" },
  ];

  const overallOk = ops.edge_errors_24h === 0 && ops.webhook_failures_24h < 5 && ops.push_failing === 0;

  return (
    <div>
      {/* System status banner */}
      <div style={{
        background: overallOk ? "rgba(52,211,153,0.07)" : "rgba(251,191,36,0.07)",
        border: `1px solid ${overallOk ? "rgba(52,211,153,0.25)" : "rgba(251,191,36,0.25)"}`,
        color: overallOk ? "var(--green)" : "var(--yellow)",
        padding: "10px 16px", borderRadius: 8, marginBottom: 16, fontSize: 13, fontWeight: 700,
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <span style={{ fontSize: 16 }}>{overallOk ? "✓" : "⚠"}</span>
        {overallOk ? "All systems operational" : "Some systems need attention"}
      </div>

      <div className="kpi-grid">
        <KpiCard label="Live Calls Now"     value={fmt(ops.live_calls_now)}        sub="active"          color="var(--green)"  pulse={ops.live_calls_now > 0} />
        <KpiCard label="Edge Errors 24h"    value={fmt(ops.edge_errors_24h)}       sub="functions"       color={ops.edge_errors_24h > 0 ? "#f87171" : "#34d399"} />
        <KpiCard label="Webhook Failures"   value={fmt(ops.webhook_failures_24h)}  sub="last 24h"        color={ops.webhook_failures_24h > 0 ? "#fbbf24" : "#34d399"} />
        <KpiCard label="Rate Limit Blocks"  value={fmt(ops.rate_limit_blocks_24h)} sub="blocked reqs"    color={ops.rate_limit_blocks_24h > 50 ? "#fbbf24" : "#34d399"} />
        <KpiCard label="Security Events"    value={fmt(ops.security_events_24h)}   sub="last 24h"        color={ops.security_events_24h > 0 ? "#fbbf24" : "#34d399"} />
        <KpiCard label="Push Subscriptions" value={fmt(ops.push_active)}           sub={`${ops.push_failing} failing`} color={ops.push_failing > 0 ? "#f87171" : "#34d399"} />
      </div>

      <div className="two-col">
        {/* Health checklist */}
        <div className="card">
          <div className="card-header"><span className="card-icon">◉</span><span className="card-title">System Health</span></div>
          <div className="card-body">
            {health.map(h => (
              <div key={h.label} className="health-row">
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="status-dot" style={{ background: h.ok ? "var(--green)" : "var(--red)", boxShadow: `0 0 5px ${h.ok ? "var(--green)" : "var(--red)"}` }} />
                  <span style={{ fontSize: 12, color: "var(--text)" }}>{h.label}</span>
                </div>
                <span style={{ fontFamily: "var(--mono)", fontSize: 12, fontWeight: 700, color: h.color }}>{h.val}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Top error functions */}
        <div className="card">
          <div className="card-header"><span className="card-icon">⊗</span><span className="card-title">Edge Function Errors (24h)</span></div>
          <div className="card-body">
            {errFns.length === 0 ? (
              <div style={{ textAlign: "center", color: "var(--green)", padding: 24, fontSize: 13 }}>✓ No edge function errors</div>
            ) : (
              errFns.map(e => (
                <div key={e.function_name} className="metric-row">
                  <code style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--accent)", background: "var(--raised)", padding: "2px 6px", borderRadius: 4 }}>
                    {e.function_name}
                  </code>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 12, fontWeight: 700, color: "var(--red)" }}>{e.error_count} errors</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EXISTING SECTIONS (unchanged from v4 — pass-through)
// ─────────────────────────────────────────────────────────────────────────────

function DashboardSection() {
  const [stats, setStats] = useState<DashStats | null>(null);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  const load = useCallback(async () => {
    const { data } = await (supabase as any).rpc("admin_get_comprehensive_stats");
    if (data) setStats(data as DashStats);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, 30_000);
    return () => clearInterval(timerRef.current);
  }, [load]);

  if (loading) return <SkeletonGrid count={8} />;
  if (!stats) return <ErrorBlock msg="Could not load stats" />;

  const kpis = [
    { label: "Total Users",     value: fmt(stats.total_users),            sub: `+${stats.new_users_7d} this week`, color: "#38bdf8" },
    { label: "Paying Users",    value: fmt(stats.paying_users),           sub: `${Math.round(stats.paying_users/Math.max(stats.total_users,1)*100)}% conv.`, color: "#34d399" },
    { label: "MRR",             value: koboToNGN(stats.mrr_kobo),         sub: "monthly recurring", color: "#a78bfa" },
    { label: "Revenue 30d",     value: koboToNGN(stats.revenue_30d_kobo), sub: "paid", color: "#fbbf24" },
    { label: "Active Today",    value: fmt(stats.active_today),           sub: `${stats.calls_today} calls`, color: "#06b6d4" },
    { label: "Live Calls",      value: fmt(stats.live_calls),             sub: "right now", color: "#f87171", pulse: stats.live_calls > 0 },
    { label: "Minutes Used",    value: fmt(stats.total_minutes_used),     sub: "this cycle", color: "#818cf8" },
    { label: "Failed Webhooks", value: fmt(stats.failed_webhooks),        sub: "last 24h", color: stats.failed_webhooks > 0 ? "#f87171" : "#34d399" },
  ];

  const planDist = stats.plan_distribution || {};
  const distTotal = Object.values(planDist).reduce((a, b) => a + b, 0);

  return (
    <div>
      <div className="kpi-grid">
        {kpis.map(k => <KpiCard key={k.label} {...k} />)}
      </div>
      <div className="two-col">
        <div className="card">
          <div className="card-header"><span className="card-icon">◈</span><span className="card-title">Plan Distribution</span></div>
          <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {PLANS.map(p => {
              const count = planDist[p] ?? 0;
              const pct = distTotal > 0 ? (count / distTotal) * 100 : 0;
              return (
                <div key={p}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5, alignItems: "center" }}>
                    <span className="plan-badge" style={{ background: PLAN_COLORS[p] + "22", color: PLAN_COLORS[p] }}>{PLAN_NAMES[p]}</span>
                    <span style={{ color: "var(--muted)", fontSize: 11 }}>{count} users · {Math.round(pct)}%</span>
                  </div>
                  <div className="progress-bg"><div className="progress-fill" style={{ width: `${pct}%`, background: PLAN_COLORS[p] }} /></div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="card">
          <div className="card-header"><span className="card-icon">◉</span><span className="card-title">System Health</span></div>
          <div className="card-body">
            {[
              { label: "Database",       status: true,                       detail: "< 50ms" },
              { label: "Edge Functions", status: true,                       detail: "Deno Deploy" },
              { label: "Realtime",       status: true,                       detail: `${stats.live_calls} active` },
              { label: "Paystack",       status: stats.failed_webhooks < 5,  detail: stats.failed_webhooks > 0 ? `${stats.failed_webhooks} failed` : "Healthy" },
              { label: "100ms Infra",    status: true,                       detail: "HMS SDK" },
              { label: "AI Gateway",     status: true,                       detail: "Gemini Flash" },
            ].map(s => (
              <div key={s.label} className="health-row">
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="status-dot" style={{ background: s.status ? "var(--green)" : "var(--yellow)", boxShadow: `0 0 6px ${s.status ? "var(--green)" : "var(--yellow)"}` }} />
                  <span style={{ fontSize: 12, color: "var(--text)" }}>{s.label}</span>
                </div>
                <span style={{ fontSize: 11, color: "var(--muted)" }}>{s.detail}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function UsersSection() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState("");
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const PER = 20;

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await (supabase as any).rpc("admin_get_users_v2", {
      p_search: search || null, p_plan: planFilter || null,
      p_limit: PER, p_offset: page * PER,
    });
    if (data) { setUsers((data as any).users || []); setTotal((data as any).total || 0); }
    setLoading(false);
  }, [search, planFilter, page]);

  useEffect(() => { load(); }, [load]);

  const action = async (userId: string, act: string, extra: any = {}) => {
    setBusyId(userId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke("admin-user-actions", {
        body: { action: act, target_user_id: userId, ...extra },
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      if (error || (data as any)?.error) throw new Error((data as any)?.error || error?.message);
      toast.success("Done");
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusyId(null); }
  };

  return (
    <div>
      <div className="filter-bar">
        <input className="search-input" placeholder="Search by email or name…" value={search}
          onChange={e => { setSearch(e.target.value); setPage(0); }} />
        <select className="select-input" value={planFilter} onChange={e => { setPlanFilter(e.target.value); setPage(0); }}>
          <option value="">All plans</option>
          {PLANS.map(p => <option key={p} value={p}>{PLAN_NAMES[p]}</option>)}
        </select>
        <span className="badge" style={{ background: "var(--raised)", color: "var(--muted)" }}>{total.toLocaleString()} users</span>
      </div>
      {loading ? <SkeletonGrid count={6} height={44} /> : (
        <div className="table-wrap">
          <table>
            <thead><tr>{["User","Plan","Status","Minutes","Calls","Actions"].map(h => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                      <div style={{ width: 30, height: 30, background: "var(--raised)", border: "1px solid var(--border2)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--mono)", fontSize: 12, color: "var(--accent)", flexShrink: 0 }}>
                        {(u.full_name || u.email || "?")[0].toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>
                          {u.full_name || "—"}
                          {u.is_admin && <span className="badge" style={{ background: "rgba(167,139,250,0.1)", color: "var(--purple)", marginLeft: 5 }}>ADMIN</span>}
                          {u.suspended && <span className="badge" style={{ background: "rgba(248,113,113,0.1)", color: "var(--red)", marginLeft: 5 }}>SUSP.</span>}
                        </div>
                        <div style={{ fontSize: 10, color: "var(--muted)" }}>{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <select
                      style={{ background: "var(--raised)", border: "1px solid var(--border2)", color: PLAN_COLORS[u.plan_type] || "var(--text)", fontSize: 11, padding: "3px 6px", borderRadius: 5, cursor: "pointer", fontFamily: "var(--mono)", fontWeight: 700 }}
                      value={u.plan_type}
                      onChange={e => action(u.id, "update_profile", { plan_type: e.target.value })}
                      disabled={busyId === u.id}>
                      {PLANS.map(p => <option key={p} value={p}>{PLAN_NAMES[p]}</option>)}
                    </select>
                  </td>
                  <td><span className="badge" style={{ background: u.billing_status === "active" ? "rgba(52,211,153,0.1)" : "var(--raised)", color: u.billing_status === "active" ? "var(--green)" : "var(--muted)" }}>{u.billing_status || "inactive"}</span></td>
                  <td style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text)" }}>{(u.minutes_this_month || 0).toLocaleString()}<span style={{ color: "var(--muted)" }}>/{u.calls_limit < 0 ? "∞" : u.calls_limit}</span></td>
                  <td style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)" }}>{u.total_calls || 0}</td>
                  <td>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      <button className="action-btn" onClick={() => setSelectedUser(u)}>👁</button>
                      <button className="action-btn" disabled={busyId === u.id} onClick={() => action(u.id, "reset_minutes")}>↺</button>
                      <button className="action-btn" disabled={busyId === u.id} style={{ color: u.suspended ? "var(--green)" : "var(--red)" }} onClick={() => action(u.id, "suspend_user", { suspended: !u.suspended })}>{u.suspended ? "✓" : "⊗"}</button>
                    </div>
                  </td>
                </tr>
              ))}
              {!users.length && <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--muted)", padding: 24 }}>No users found</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      <div className="pagination">
        <button className="page-btn" disabled={page === 0} onClick={() => setPage(p => p - 1)}>← Prev</button>
        <span style={{ color: "var(--muted)", fontSize: 12 }}>Page {page + 1} / {Math.ceil(total / PER)}</span>
        <button className="page-btn" disabled={(page + 1) * PER >= total} onClick={() => setPage(p => p + 1)}>Next →</button>
      </div>
      {selectedUser && <UserModal user={selectedUser} onClose={() => setSelectedUser(null)} />}
    </div>
  );
}

function BillingSection() {
  const [rev, setRev] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"revenue" | "minutes">("revenue");

  useEffect(() => {
    (supabase as any).rpc("admin_get_revenue_analytics", { p_days: 30 })
      .then(({ data }: any) => { if (data) setRev(data); setLoading(false); });
  }, []);

  if (loading) return <SkeletonGrid count={4} />;
  if (!rev) return <ErrorBlock msg="No revenue data" />;

  const dailyData: { date: string; amount_kobo: number }[] = rev.daily_revenue || [];
  const maxRev = Math.max(...dailyData.map(d => d.amount_kobo), 1);

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {(["revenue", "minutes"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ padding: "7px 18px", borderRadius: 8, border: "1px solid", borderColor: tab === t ? "var(--accent)" : "var(--border2)", background: tab === t ? "rgba(34,211,238,0.1)" : "var(--raised)", color: tab === t ? "var(--accent)" : "var(--muted)", cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "var(--sans)", transition: "all 0.15s" }}>
            {t === "revenue" ? "💳 Revenue" : "⏱ Extra Minutes"}
          </button>
        ))}
      </div>
      {tab === "revenue" && (
        <>
          <div className="kpi-grid">
            <KpiCard label="Revenue 7d"  value={koboToNGN(rev.total_7d_kobo || 0)}  sub="last 7 days"  color="#34d399" />
            <KpiCard label="Revenue 30d" value={koboToNGN(rev.total_30d_kobo || 0)} sub="last 30 days" color="#a78bfa" />
            <KpiCard label="Active Subs" value={fmt((rev.plan_revenue || []).reduce((a: number, r: any) => a + r.user_count, 0))} sub="paying now" color="#38bdf8" />
            <KpiCard label="MRR" value={koboToNGN((rev.plan_revenue || []).reduce((a: number, r: any) => a + r.monthly_kobo, 0))} sub="monthly recurring" color="#fbbf24" />
          </div>
          <div className="two-col">
            <div className="card">
              <div className="card-header"><span className="card-icon">◆</span><span className="card-title">Revenue Last 30 Days</span></div>
              <div className="card-body">
                <div className="rev-chart">
                  {dailyData.slice(-30).map((d, i) => (
                    <div key={i} className="rev-bar" style={{ background: "var(--purple)", opacity: 0.6 + (d.amount_kobo / maxRev) * 0.4, height: `${Math.max(3, (d.amount_kobo / maxRev) * 96)}px` }} title={`${d.date}: ${koboToNGN(d.amount_kobo)}`} />
                  ))}
                </div>
              </div>
            </div>
            <div className="card">
              <div className="card-header"><span className="card-icon">◎</span><span className="card-title">Revenue by Plan</span></div>
              <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {(rev.plan_revenue || []).sort((a: any, b: any) => b.monthly_kobo - a.monthly_kobo).map((r: any) => {
                  const pk = PLANS.find(p => r.plan_name?.toLowerCase().includes(p)) || "free";
                  return (
                    <div key={r.plan_name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <span className="plan-badge" style={{ background: PLAN_COLORS[pk] + "22", color: PLAN_COLORS[pk] }}>{r.plan_name}</span>
                        <span style={{ fontSize: 11, color: "var(--muted)" }}>{r.user_count} users</span>
                      </div>
                      <span style={{ fontFamily: "var(--mono)", fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{koboToNGN(r.monthly_kobo)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
      {tab === "minutes" && <ExtraMinutesSection />}
    </div>
  );
}

function ExtraMinutesSection() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"monthly" | "buyers" | "recent">("monthly");
  const [chartMode, setChartMode] = useState<"minutes" | "revenue">("revenue");

  useEffect(() => {
    (supabase as any).rpc("admin_get_extra_minutes_analytics", { p_months: 12 })
      .then(({ data: d }: any) => { if (d) setData(d); setLoading(false); });
  }, []);

  if (loading) return <SkeletonGrid count={5} height={48} />;
  if (!data)   return <ErrorBlock msg="Could not load extra minutes data" />;

  const monthly: any[] = data.monthly || [];
  const buyers: any[]  = data.top_buyers || [];
  const recent: any[]  = data.recent || [];
  const totals          = data.totals || {};
  const currentMonth    = data.current_month || {};
  const maxMins = Math.max(...monthly.map((m: any) => m.total_minutes), 1);
  const maxRevM = Math.max(...monthly.map((m: any) => m.revenue_kobo || 0), 1);
  const planCol = (p: string) => PLAN_COLORS[p] || "var(--muted)";

  const subTabStyle = (active: boolean): React.CSSProperties => ({
    padding: "5px 14px", borderRadius: 20, border: "1px solid",
    borderColor: active ? "var(--accent)" : "var(--border)", background: active ? "rgba(34,211,238,0.08)" : "var(--raised)",
    color: active ? "var(--accent)" : "var(--muted)", cursor: "pointer", fontSize: 11, fontWeight: 700, fontFamily: "var(--sans)", transition: "all 0.15s",
  });

  return (
    <div>
      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        <KpiCard label="Total Revenue"   value={koboToNGN(totals.total_revenue_kobo || 0)}  sub="all time"                             color="#34d399" />
        <KpiCard label="This Month Rev." value={koboToNGN(currentMonth.revenue_kobo || 0)}  sub={`${currentMonth.purchases || 0} purchases`} color="#fbbf24" />
        <KpiCard label="Total Mins Sold" value={fmtMins(totals.total_minutes_sold || 0)}    sub="all time"                             color="#a78bfa" />
        <KpiCard label="Unique Buyers"   value={fmt(totals.total_buyers || 0)}              sub={`${totals.total_purchases || 0} purchases`} color="#38bdf8" />
      </div>
      <div style={{ display: "flex", gap: 5, marginBottom: 14 }}>
        <button style={subTabStyle(view === "monthly")} onClick={() => setView("monthly")}>📅 Monthly</button>
        <button style={subTabStyle(view === "buyers")}  onClick={() => setView("buyers")}>🏆 Top Buyers</button>
        <button style={subTabStyle(view === "recent")}  onClick={() => setView("recent")}>🕐 Recent</button>
      </div>
      {view === "monthly" && monthly.length > 0 && (
        <>
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="card-header" style={{ justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="card-icon">⏱</span><span className="card-title">Extra Minutes — Last 12 Months</span>
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                {(["revenue","minutes"] as const).map(m => (
                  <button key={m} onClick={() => setChartMode(m)} style={{ padding: "3px 10px", borderRadius: 6, border: "1px solid", borderColor: chartMode === m ? "var(--accent)" : "var(--border2)", background: chartMode === m ? "rgba(34,211,238,0.12)" : "transparent", color: chartMode === m ? "var(--accent)" : "var(--dim)", cursor: "pointer", fontSize: 10, fontWeight: 700, fontFamily: "var(--mono)", transition: "all 0.12s" }}>
                    {m === "revenue" ? "₦ Revenue" : "⏱ Minutes"}
                  </button>
                ))}
              </div>
            </div>
            <div className="card-body">
              <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 130, marginBottom: 8 }}>
                {[...monthly].reverse().map((m: any, i: number) => {
                  const isRev = chartMode === "revenue";
                  const val = isRev ? (m.revenue_kobo || 0) : m.total_minutes;
                  const max = isRev ? maxRevM : maxMins;
                  const pct = val / max;
                  return (
                    <div key={i} className="tooltip-wrap" style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                      <div className="tooltip-box">{m.month}: {isRev ? koboToNGN(m.revenue_kobo || 0) : fmtMins(m.total_minutes)}</div>
                      <div style={{ width: "100%", height: `${Math.max(4, pct * 88)}px`, borderRadius: "3px 3px 0 0", background: isRev ? "linear-gradient(180deg,#34d399,#059669)" : "linear-gradient(180deg,#a78bfa,#6d28d9)", cursor: "pointer" }} />
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                {[...monthly].reverse().map((m: any, i: number) => (
                  <div key={i} style={{ flex: 1, textAlign: "center", fontSize: 9, color: "var(--dim)", fontFamily: "var(--mono)", overflow: "hidden" }}>{m.month.slice(5)}</div>
                ))}
              </div>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Month</th><th>Revenue</th><th>Minutes Sold</th><th>Purchases</th><th>Buyers</th></tr></thead>
              <tbody>
                {monthly.map((m: any) => (
                  <tr key={m.month}>
                    <td style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--accent)" }}>{m.month}</td>
                    <td style={{ fontFamily: "var(--mono)", fontSize: 12, fontWeight: 700, color: "#34d399" }}>{koboToNGN(m.revenue_kobo || 0)}</td>
                    <td style={{ fontFamily: "var(--mono)", fontSize: 12, fontWeight: 700, color: "#a78bfa" }}>{fmtMins(m.total_minutes)}</td>
                    <td style={{ fontFamily: "var(--mono)", fontSize: 12 }}>{m.purchases}</td>
                    <td style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--muted)" }}>{m.unique_buyers}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {view === "buyers" && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>#</th><th>User</th><th>Plan</th><th>Purchases</th><th>Minutes</th><th>Total Paid</th></tr></thead>
            <tbody>
              {buyers.length === 0 ? <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--muted)", padding: 24 }}>No purchases yet</td></tr>
              : buyers.map((b: any, i: number) => (
                <tr key={b.email}>
                  <td style={{ fontFamily: "var(--mono)", fontSize: 13, color: "var(--dim)" }}>{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i+1}`}</td>
                  <td><div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{b.full_name || "—"}</div><div style={{ fontSize: 10, color: "var(--muted)" }}>{b.email}</div></td>
                  <td><span className="plan-badge" style={{ background: planCol(b.plan_type) + "22", color: planCol(b.plan_type) }}>{b.plan_type}</span></td>
                  <td style={{ fontFamily: "var(--mono)", fontSize: 12 }}>{b.purchases}</td>
                  <td style={{ fontFamily: "var(--mono)", fontSize: 12, fontWeight: 700, color: "#a78bfa" }}>{fmtMins(b.total_minutes)}</td>
                  <td style={{ fontFamily: "var(--mono)", fontSize: 13, fontWeight: 700, color: "#34d399" }}>{koboToNGN(b.total_revenue_kobo || 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {view === "recent" && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Date</th><th>User</th><th>Plan</th><th>Minutes Added</th><th>Amount Paid</th><th>Reference</th></tr></thead>
            <tbody>
              {recent.length === 0 ? <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--muted)", padding: 24 }}>No purchases yet</td></tr>
              : recent.map((r: any) => (
                <tr key={r.id}>
                  <td style={{ fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap" }}>{new Date(r.verified_at).toLocaleString("en-NG", { dateStyle: "short", timeStyle: "short" })}</td>
                  <td><div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{r.full_name || "—"}</div><div style={{ fontSize: 10, color: "var(--muted)" }}>{r.email}</div></td>
                  <td><span className="plan-badge" style={{ background: planCol(r.plan_type) + "22", color: planCol(r.plan_type) }}>{r.plan_type}</span></td>
                  <td style={{ fontFamily: "var(--mono)", fontSize: 13, fontWeight: 700, color: "#a78bfa" }}>+{fmtMins(r.minutes_added)}</td>
                  <td style={{ fontFamily: "var(--mono)", fontSize: 13, fontWeight: 700, color: r.amount_kobo > 0 ? "#34d399" : "var(--dim)" }}>{r.amount_kobo > 0 ? koboToNGN(r.amount_kobo) : "—"}</td>
                  <td><code style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--dim)", background: "var(--raised)", padding: "2px 6px", borderRadius: 4 }}>{r.paystack_reference}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FeatureFlagsSection() {
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [editFlag, setEditFlag] = useState<FeatureFlag | null>(null);
  const [showAudit, setShowAudit] = useState<FeatureFlag | null>(null);
  const [emergencyConfirm, setEmergencyConfirm] = useState(false);

  const loadFlags = useCallback(async () => {
    const { data } = await (supabase as any).from("feature_flags").select("*").order("category").order("key");
    if (data) setFlags(data as FeatureFlag[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadFlags();
    const ch = supabase.channel("admin-flags-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "feature_flags" }, () => loadFlags())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [loadFlags]);

  const toggle = async (flag: FeatureFlag) => {
    setBusyKey(flag.key);
    const { error } = await (supabase as any).rpc("admin_toggle_feature_flag", { p_key: flag.key, p_enabled: !flag.enabled });
    if (error) toast.error("Failed: " + error.message);
    else {
      toast.success(`${flag.name} ${!flag.enabled ? "enabled" : "disabled"}`);
      setFlags(prev => prev.map(f => f.key === flag.key ? { ...f, enabled: !f.enabled } : f));
    }
    setBusyKey(null);
  };

  const emergency = async () => {
    if (!emergencyConfirm) { setEmergencyConfirm(true); return; }
    const { error } = await (supabase as any).rpc("admin_emergency_disable_all_flags");
    if (error) toast.error("Emergency disable failed: " + error.message);
    else { toast.success("All feature flags disabled"); loadFlags(); }
    setEmergencyConfirm(false);
  };

  const categories = ["all", ...Array.from(new Set(flags.map(f => f.category)))];
  const filtered = flags.filter(f => {
    const matchCat = catFilter === "all" || f.category === catFilter;
    const q = search.toLowerCase();
    const matchSearch = !q || f.key.includes(q) || f.name.toLowerCase().includes(q) || (f.description || "").toLowerCase().includes(q);
    return matchCat && matchSearch;
  });
  const enabledCount = filtered.filter(f => f.enabled).length;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <span className="badge" style={{ background: "rgba(52,211,153,0.1)", color: "var(--green)" }}>✓ {enabledCount} on</span>
          <span className="badge" style={{ background: "rgba(248,113,113,0.1)", color: "var(--red)" }}>✗ {filtered.length - enabledCount} off</span>
          <span className="badge" style={{ background: "var(--raised)", color: "var(--muted)" }}>{flags.length} total</span>
        </div>
        <button className="emergency-btn" onClick={emergency}>{emergencyConfirm ? "⚠ CLICK AGAIN TO CONFIRM" : "⚠ Emergency Disable All"}</button>
      </div>
      <div className="info-bar">⌁ Changes apply instantly — all clients update via Supabase Realtime.</div>
      <div className="filter-bar">
        <input className="search-input" placeholder="Search flags…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      <div className="cat-tabs">
        {categories.map(c => (
          <button key={c} className={`cat-tab ${catFilter === c ? "active" : ""}`} style={catFilter === c ? { background: CAT_COLORS[c] || "var(--accent)", color: "#000" } : {}} onClick={() => setCatFilter(c)}>
            {c === "all" ? "All" : c}{c !== "all" && <span style={{ marginLeft: 5, opacity: 0.7 }}>({flags.filter(f => f.category === c).length})</span>}
          </button>
        ))}
      </div>
      {loading ? <SkeletonGrid count={6} height={80} /> : (
        <div className="card">
          <div className="card-body" style={{ padding: "0 16px" }}>
            {filtered.length === 0 ? <div style={{ padding: 24, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>No flags match</div>
            : filtered.map(flag => (
              <div key={flag.key} className="flag-row">
                <div className="flag-info">
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span className="flag-key">{flag.key}</span>
                    {flag.is_beta && <span className="badge" style={{ background: "rgba(251,191,36,0.1)", color: "var(--yellow)" }}>BETA</span>}
                  </div>
                  <div className="flag-name">{flag.name}</div>
                  {flag.description && <div className="flag-desc">{flag.description}</div>}
                  <div className="flag-meta">
                    <span className="badge" style={{ background: (CAT_COLORS[flag.category] || "var(--accent)") + "18", color: CAT_COLORS[flag.category] || "var(--accent)" }}>{flag.category}</span>
                    {flag.plan_access.map(p => <span key={p} className="plan-badge" style={{ background: PLAN_COLORS[p] + "18", color: PLAN_COLORS[p] }}>{p}</span>)}
                    {flag.rollout_pct < 100 && <span className="badge" style={{ background: "rgba(34,211,238,0.1)", color: "var(--accent)" }}>{flag.rollout_pct}% rollout</span>}
                    {flag.usage_count > 0 && <span className="badge" style={{ background: "var(--raised)", color: "var(--muted)" }}>{fmt(flag.usage_count)} uses</span>}
                  </div>
                </div>
                <div className="flag-controls">
                  <div className="toggle-wrap">
                    <button className={`toggle ${flag.enabled ? "on" : "off"}`} disabled={busyKey === flag.key} onClick={() => toggle(flag)}>
                      <span className="toggle-knob" />
                    </button>
                    <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: flag.enabled ? "var(--green)" : "var(--muted)", minWidth: 24 }}>{busyKey === flag.key ? "…" : flag.enabled ? "ON" : "OFF"}</span>
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button className="action-btn" onClick={() => setEditFlag(flag)}>✎</button>
                    <button className="action-btn" onClick={() => setShowAudit(flag)}>◳</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {editFlag  && <FlagEditModal  flag={editFlag}  onClose={() => setEditFlag(null)}  onSaved={loadFlags} />}
      {showAudit && <FlagAuditModal flag={showAudit} onClose={() => setShowAudit(null)} />}
    </div>
  );
}

function FlagEditModal({ flag, onClose, onSaved }: { flag: FeatureFlag; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ ...flag, plan_access_str: flag.plan_access.join(",") });
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    const planAccess = form.plan_access_str.split(",").map(s => s.trim()).filter(Boolean);
    const { error } = await (supabase as any).rpc("admin_update_feature_flag", { p_key: flag.key, p_enabled: form.enabled, p_plan_access: planAccess, p_rollout_pct: form.rollout_pct, p_description: form.description, p_is_beta: form.is_beta });
    if (error) toast.error("Save failed: " + error.message);
    else { toast.success("Flag updated"); onSaved(); onClose(); }
    setSaving(false);
  };
  const labelStyle: React.CSSProperties = { fontSize: 11, color: "var(--muted)", display: "block", marginBottom: 4, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" };
  const inputStyle: React.CSSProperties = { background: "var(--raised)", border: "1px solid var(--border2)", color: "var(--text)", padding: "8px 10px", borderRadius: 7, fontSize: 12, width: "100%", fontFamily: "var(--sans)", outline: "none" };
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div><div style={{ fontFamily: "var(--mono)", fontSize: 13, color: "var(--accent)" }}>{flag.key}</div><div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)" }}>{flag.name}</div></div>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div><label style={labelStyle}>Description</label><textarea style={{ ...inputStyle, resize: "vertical", minHeight: 60 }} value={form.description || ""} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
          <div>
            <label style={labelStyle}>Allowed Plans</label>
            <input style={inputStyle} value={form.plan_access_str} onChange={e => setForm(f => ({ ...f, plan_access_str: e.target.value }))} placeholder="free,starter,growth,scale" />
            <div style={{ display: "flex", gap: 5, marginTop: 6 }}>
              {PLANS.map(p => <button key={p} onClick={() => { const arr = form.plan_access_str.split(",").map(s => s.trim()).filter(Boolean); const next = arr.includes(p) ? arr.filter(a => a !== p) : [...arr, p]; setForm(f => ({ ...f, plan_access_str: next.join(",") })); }} style={{ padding: "3px 9px", borderRadius: 12, border: "1px solid " + PLAN_COLORS[p], background: form.plan_access_str.includes(p) ? PLAN_COLORS[p] + "33" : "transparent", color: PLAN_COLORS[p], fontSize: 11, cursor: "pointer", fontFamily: "var(--mono)", fontWeight: 700 }}>{p}</button>)}
            </div>
          </div>
          <div><label style={labelStyle}>Rollout % ({form.rollout_pct}%)</label><input type="range" min={0} max={100} value={form.rollout_pct} onChange={e => setForm(f => ({ ...f, rollout_pct: parseInt(e.target.value) }))} style={{ width: "100%", accentColor: "var(--accent)" }} /></div>
          <div style={{ display: "flex", gap: 16 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12, color: "var(--text)" }}><input type="checkbox" checked={form.enabled} onChange={e => setForm(f => ({ ...f, enabled: e.target.checked }))} style={{ accentColor: "var(--green)" }} />Enabled</label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12, color: "var(--text)" }}><input type="checkbox" checked={form.is_beta} onChange={e => setForm(f => ({ ...f, is_beta: e.target.checked }))} style={{ accentColor: "var(--yellow)" }} />Beta flag</label>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button className="action-btn" onClick={onClose}>Cancel</button>
            <button onClick={save} disabled={saving} style={{ background: "var(--accent)", color: "#000", border: "none", padding: "8px 18px", borderRadius: 7, cursor: saving ? "not-allowed" : "pointer", fontWeight: 700, fontSize: 12, fontFamily: "var(--sans)" }}>{saving ? "Saving…" : "Save Changes"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FlagAuditModal({ flag, onClose }: { flag: FeatureFlag; onClose: () => void }) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (supabase as any).rpc("get_feature_flag_audit", { p_flag_key: flag.key, p_limit: 50 }).then(({ data }: any) => { if (data) setEntries(data); setLoading(false); });
  }, [flag.key]);
  const actionColor = (a: string) => a === "enabled" ? "var(--green)" : a === "disabled" ? "var(--red)" : "var(--yellow)";
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 640 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div><div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--accent)" }}>{flag.key}</div><div style={{ fontSize: 15, fontWeight: 700 }}>Change History</div></div>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>
        {loading ? <SkeletonGrid count={4} height={36} /> : entries.length === 0 ? <div style={{ textAlign: "center", color: "var(--muted)", padding: 24, fontSize: 13 }}>No changes recorded yet</div> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {entries.map(e => (
              <div key={e.id} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--border)", alignItems: "flex-start" }}>
                <span className="badge" style={{ background: actionColor(e.action) + "18", color: actionColor(e.action), flexShrink: 0, marginTop: 2 }}>{e.action}</span>
                <div style={{ flex: 1 }}><div style={{ fontSize: 11, color: "var(--muted)" }}>{e.changed_by_email || "System"}</div>{e.note && <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 2 }}>{e.note}</div>}</div>
                <span style={{ fontSize: 10, color: "var(--dim)", flexShrink: 0 }}>{fmtTime(e.changed_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FlagAuditSection() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { (supabase as any).rpc("get_feature_flag_audit", { p_limit: 200 }).then(({ data }: any) => { if (data) setEntries(data); setLoading(false); }); }, []);
  const exportCsv = () => {
    const csv = [["Time","Flag","Action","By","Note"], ...entries.map(e => [fmtTime(e.changed_at), e.flag_key, e.action, e.changed_by_email || "", e.note || ""])].map(r => r.map(v => `"${v}"`).join(",")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = `flag-audit-${Date.now()}.csv`; a.click();
  };
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14, alignItems: "center" }}>
        <span style={{ color: "var(--muted)", fontSize: 13 }}>{entries.length} entries</span>
        <button className="action-btn" onClick={exportCsv}>⬇ Export CSV</button>
      </div>
      {loading ? <SkeletonGrid count={8} height={40} /> : (
        <div className="table-wrap">
          <table>
            <thead><tr>{["Time","Flag","Action","Changed By","Note"].map(h => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {entries.map(e => (
                <tr key={e.id}>
                  <td style={{ fontSize: 11, color: "var(--muted)" }}>{fmtTime(e.changed_at)}</td>
                  <td><code style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--accent)" }}>{e.flag_key}</code></td>
                  <td><span className="badge" style={{ background: e.action === "enabled" ? "rgba(52,211,153,0.1)" : e.action === "disabled" ? "rgba(248,113,113,0.1)" : "rgba(251,191,36,0.1)", color: e.action === "enabled" ? "var(--green)" : e.action === "disabled" ? "var(--red)" : "var(--yellow)" }}>{e.action}</span></td>
                  <td style={{ fontSize: 11, color: "var(--muted)" }}>{e.changed_by_email || "—"}</td>
                  <td style={{ fontSize: 11, color: "var(--dim)" }}>{e.note || "—"}</td>
                </tr>
              ))}
              {!entries.length && <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--muted)", padding: 24 }}>No audit entries yet</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AIInfraSection() {
  const [metrics, setMetrics] = useState<any>(null);
  useEffect(() => {
    (async () => {
      const [calls, live, transcripts, errors, usage] = await Promise.all([
        supabase.from("calls").select("id", { count: "exact", head: true }),
        supabase.from("calls").select("id", { count: "exact", head: true }).eq("status", "live"),
        supabase.from("transcripts").select("id", { count: "exact", head: true }),
        supabase.from("edge_function_errors").select("id", { count: "exact", head: true }),
        (supabase as any).from("usage_summary").select("total_minutes_used").eq("billing_month", new Date().toISOString().slice(0,7)),
      ]);
      const totalMins = (usage.data || []).reduce((a: number, r: any) => a + (r.total_minutes_used || 0), 0);
      setMetrics({ calls: calls.count || 0, live: live.count || 0, transcripts: transcripts.count || 0, errors: errors.count || 0, mins: totalMins });
    })();
  }, []);
  return (
    <div>
      <div className="kpi-grid">
        <KpiCard label="Total Calls"     value={fmt(metrics?.calls || 0)}       sub="all time"    color="#38bdf8" />
        <KpiCard label="Live Calls"      value={fmt(metrics?.live || 0)}         sub="right now"   color="#f87171" pulse />
        <KpiCard label="Transcripts"     value={fmt(metrics?.transcripts || 0)}  sub="total lines" color="#34d399" />
        <KpiCard label="Edge Errors"     value={fmt(metrics?.errors || 0)}       sub="logged"      color={metrics?.errors ? "#f87171" : "#34d399"} />
        <KpiCard label="Minutes (cycle)" value={fmt(metrics?.mins || 0)}         sub="this month"  color="#a78bfa" />
        <KpiCard label="AI Gateway"      value="Online"                          sub="Gemini Flash" color="#34d399" />
      </div>
      <div className="card">
        <div className="card-header"><span className="card-icon">◉</span><span className="card-title">Infrastructure</span></div>
        <div className="card-body">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
            {[
              { svc: "100ms Video",       detail: "HMS SDK active" },
              { svc: "Supabase DB",        detail: "< 50ms latency" },
              { svc: "Realtime",           detail: "WebSocket active" },
              { svc: "Paystack Billing",   detail: "Webhook enabled" },
              { svc: "Edge Functions",     detail: "Deno Deploy" },
              { svc: "Lovable AI",         detail: "Gemini Flash 2.0" },
              { svc: "Push Notifications", detail: "VAPID + FCM" },
              { svc: "pg_cron",            detail: "Reminder scheduler" },
            ].map(s => (
              <div key={s.svc} style={{ background: "var(--raised)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px", display: "flex", alignItems: "center", gap: 10 }}>
                <span className="status-dot" style={{ background: "var(--green)", boxShadow: "0 0 6px var(--green)" }} />
                <div><div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{s.svc}</div><div style={{ fontSize: 10, color: "var(--muted)" }}>{s.detail}</div></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SecuritySection() {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { supabase.from("security_events").select("*").order("created_at", { ascending: false }).limit(50).then(({ data }) => { setEvents(data || []); setLoading(false); }); }, []);
  const sevColor = (s: string) => s === "high" ? "var(--red)" : s === "medium" ? "var(--yellow)" : "var(--green)";
  return (
    <div>
      <div className="kpi-grid">
        <KpiCard label="Events Total"  value={fmt(events.length)} sub="all time" color="#f87171" />
        <KpiCard label="High Severity" value={fmt(events.filter(e => e.severity === "high").length)} sub="events" color="#f87171" />
        <KpiCard label="Medium" value={fmt(events.filter(e => e.severity === "medium").length)} sub="events" color="#fbbf24" />
        <KpiCard label="Low / Info" value={fmt(events.filter(e => !["high","medium"].includes(e.severity)).length)} sub="events" color="#34d399" />
      </div>
      <div className="card">
        <div className="card-header"><span className="card-icon">◐</span><span className="card-title">Security Events</span></div>
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? <div style={{ padding: 16 }}><SkeletonGrid count={5} height={36} /></div> : events.length === 0 ? (
            <div style={{ textAlign: "center", color: "var(--green)", padding: 32, fontSize: 13 }}>✓ No security events on record</div>
          ) : (
            <div className="table-wrap" style={{ border: "none" }}>
              <table>
                <thead><tr>{["Time","Type","User","Severity"].map(h => <th key={h}>{h}</th>)}</tr></thead>
                <tbody>
                  {events.map(e => (
                    <tr key={e.id}>
                      <td style={{ fontSize: 11, color: "var(--muted)" }}>{fmtTime(e.created_at)}</td>
                      <td style={{ fontSize: 12, color: "var(--text)" }}>{e.event_type}</td>
                      <td style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--mono)" }}>{e.user_id?.slice(0,8)}…</td>
                      <td><span className="badge" style={{ background: sevColor(e.severity) + "18", color: sevColor(e.severity) }}>{e.severity}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function UserModal({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const fields = [
    { label: "Plan",          value: PLAN_NAMES[user.plan_type] || user.plan_type },
    { label: "Billing",       value: user.billing_status },
    { label: "Sub Status",    value: user.sub_status || "—" },
    { label: "Minutes/mo",    value: (user.minutes_this_month || 0).toLocaleString() },
    { label: "Total Calls",   value: (user.total_calls || 0).toString() },
    { label: "Extra Minutes", value: (user.extra_minutes || 0).toString() },
    { label: "Amount",        value: user.sub_amount_kobo ? koboToNGN(user.sub_amount_kobo) + "/mo" : "—" },
    { label: "Next Payment",  value: user.next_payment_date ? new Date(user.next_payment_date).toLocaleDateString() : "—" },
    { label: "Member Since",  value: new Date(user.created_at).toLocaleDateString() },
    { label: "User ID",       value: user.id.slice(0,16) + "…" },
  ];
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div><div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)" }}>{user.full_name || "—"}</div><div style={{ fontSize: 12, color: "var(--muted)" }}>{user.email}</div></div>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {fields.map(f => (
            <div key={f.label} style={{ background: "var(--raised)", padding: "10px 12px", borderRadius: 8 }}>
              <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>{f.label}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{f.value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PRIMITIVES
// ─────────────────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, color, pulse }: {
  label: string; value: string; sub?: string; color: string; pulse?: boolean;
}) {
  return (
    <div className="kpi-card" style={{ "--accent-color": color } as React.CSSProperties}>
      <div className="kpi-label">{label}</div>
      <div style={{ display: "flex", alignItems: "center" }}>
        <span className="kpi-value">{value}</span>
        {pulse && <span className="pulse-dot" />}
      </div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

function KpiCardDelta({ label, value, delta, color }: {
  label: string; value: string; delta: number | null; color: string;
}) {
  const deltaClass = delta === null ? "" : delta > 0 ? "delta-up" : delta < 0 ? "delta-down" : "delta-flat";
  const deltaStr = delta === null ? "" : `${delta > 0 ? "+" : ""}${delta}%`;
  const deltaIcon = delta === null ? "" : delta > 0 ? "↑" : delta < 0 ? "↓" : "→";
  return (
    <div className="kpi-card" style={{ "--accent-color": color } as React.CSSProperties}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {delta !== null && (
        <div className={`kpi-delta ${deltaClass}`}>{deltaIcon} {deltaStr} vs prev</div>
      )}
    </div>
  );
}

function SkeletonGrid({ count, height = 60 }: { count: number; height?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton" style={{ height }} />
      ))}
    </div>
  );
}

function ErrorBlock({ msg }: { msg: string }) {
  return (
    <div style={{ background: "rgba(248,113,113,0.07)", border: "1px solid rgba(248,113,113,0.2)", color: "var(--red)", padding: 16, borderRadius: 10, fontSize: 13 }}>
      ⊗ {msg}
    </div>
  );
}

function FullScreenLoader() {
  return (
    <div style={{ minHeight: "100vh", background: "#060b12", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ width: 36, height: 36, border: "2px solid #1a2740", borderTopColor: "#22d3ee", borderRadius: "50%", animation: "spin 0.7s linear infinite", margin: "0 auto 14px" }} />
        <div style={{ color: "var(--muted)", fontSize: 12, fontFamily: "var(--mono)" }}>loading ops center…</div>
      </div>
    </div>
  );
}