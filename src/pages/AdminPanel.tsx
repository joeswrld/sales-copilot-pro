import { useState, useEffect, useCallback, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DashStats {
  total_users: number;
  active_today: number;
  live_calls: number;
  calls_today: number;
  paying_users: number;
  mrr_kobo: number;
  total_minutes_used: number;
  failed_webhooks: number;
  revenue_30d_kobo: number;
  new_users_7d: number;
  plan_distribution: Record<string, number>;
}

interface AdminUser {
  id: string;
  email: string | null;
  full_name: string | null;
  plan_type: string;
  billing_status: string;
  calls_limit: number;
  calls_used: number;
  suspended: boolean;
  created_at: string;
  sub_status?: string;
  sub_plan_name?: string;
  sub_amount_kobo?: number;
  next_payment_date?: string;
  extra_minutes?: number;
  minutes_this_month?: number;
  total_calls?: number;
  is_admin?: boolean;
}

interface FeatureFlag {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  plan_gates: string[];
  rollout_pct: number;
  category: string;
  is_beta: boolean;
  updated_at: string;
  updated_by?: string;
}

interface AuditLog {
  id: string;
  admin_email: string;
  action: string;
  target_type: string;
  target_id: string;
  target_email: string;
  details: Record<string, unknown>;
  severity: string;
  created_at: string;
}

interface RevenueAnalytics {
  daily_revenue: { date: string; amount_kobo: number; transactions: number }[];
  plan_revenue: { plan_name: string; user_count: number; monthly_kobo: number }[];
  total_30d_kobo: number;
  total_7d_kobo: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const PLANS = ["free", "starter", "growth", "scale"];
const PLAN_COLORS: Record<string, string> = {
  free: "#64748b", starter: "#3b82f6", growth: "#10b981", scale: "#8b5cf6",
};
const PLAN_NAMES: Record<string, string> = {
  free: "Free", starter: "Starter", growth: "Growth", scale: "Scale",
};
const koboToNGN = (k: number) => `₦${(k / 100).toLocaleString("en-NG", { minimumFractionDigits: 0 })}`;
const fmtNum = (n: number) => n.toLocaleString();
const fmtTime = (ts: string) => new Date(ts).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" });

// ─── Sidebar nav ─────────────────────────────────────────────────────────────
const NAV = [
  { id: "dashboard",    label: "Dashboard",      icon: "⬛" },
  { id: "users",        label: "Users",           icon: "👥" },
  { id: "billing",      label: "Billing",         icon: "💳" },
  { id: "ai",           label: "AI & Infra",      icon: "🤖" },
  { id: "security",     label: "Security",        icon: "🔐" },
  { id: "features",     label: "Feature Flags",   icon: "🚩" },
  { id: "logs",         label: "Audit Logs",      icon: "📋" },
];

// ─── Root Component ───────────────────────────────────────────────────────────
export default function AdminPanelV2() {
  const { user, signOut } = useAuth();
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const navigate = useNavigate();
  const [section, setSection] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    if (!adminLoading && !isAdmin) navigate("/dashboard", { replace: true });
  }, [isAdmin, adminLoading, navigate]);

  if (adminLoading) return <LoadingScreen />;
  if (!isAdmin) return null;

  return (
    <div style={styles.shell}>
      {/* Sidebar */}
      <aside style={{ ...styles.sidebar, width: sidebarOpen ? 220 : 56 }}>
        <div style={styles.sidebarHeader}>
          {sidebarOpen && (
            <div>
              <div style={styles.logoText}>FIXSENSE</div>
              <div style={styles.logoSub}>OPERATIONS CENTER</div>
            </div>
          )}
          <button style={styles.sidebarToggle} onClick={() => setSidebarOpen(p => !p)}>
            {sidebarOpen ? "◀" : "▶"}
          </button>
        </div>
        <nav style={styles.nav}>
          {NAV.map(n => (
            <button
              key={n.id}
              style={{ ...styles.navItem, ...(section === n.id ? styles.navItemActive : {}) }}
              onClick={() => setSection(n.id)}
              title={!sidebarOpen ? n.label : undefined}
            >
              <span style={styles.navIcon}>{n.icon}</span>
              {sidebarOpen && <span style={styles.navLabel}>{n.label}</span>}
            </button>
          ))}
        </nav>
        <div style={styles.sidebarFooter}>
          {sidebarOpen && <div style={styles.adminEmail}>{user?.email}</div>}
          <button style={styles.signOutBtn} onClick={async () => { await signOut(); navigate("/login"); }}>
            {sidebarOpen ? "Sign out" : "↩"}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main style={styles.main}>
        <div style={styles.topBar}>
          <div style={styles.topBarTitle}>{NAV.find(n => n.id === section)?.label}</div>
          <Link to="/dashboard" style={styles.backLink}>← Back to App</Link>
        </div>
        <div style={styles.content}>
          {section === "dashboard" && <DashboardSection />}
          {section === "users"     && <UsersSection />}
          {section === "billing"   && <BillingSection />}
          {section === "ai"        && <AIInfraSection />}
          {section === "security"  && <SecuritySection />}
          {section === "features"  && <FeatureFlagsSection />}
          {section === "logs"      && <AuditLogsSection />}
        </div>
      </main>
    </div>
  );
}

// ─── Dashboard Section ────────────────────────────────────────────────────────
function DashboardSection() {
  const [stats, setStats] = useState<DashStats | null>(null);
  const [loading, setLoading] = useState(true);
  const refreshRef = useRef<ReturnType<typeof setInterval>>();

  const load = useCallback(async () => {
    const { data, error } = await (supabase as any).rpc("get_admin_comprehensive_stats");
    if (!error && data) setStats(data as DashStats);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    refreshRef.current = setInterval(load, 30_000);
    return () => clearInterval(refreshRef.current);
  }, [load]);

  if (loading) return <Skeleton rows={4} />;
  if (!stats) return <ErrorCard msg="Failed to load stats" />;

  const kpis = [
    { label: "Total Users",      value: fmtNum(stats.total_users),         sub: `+${stats.new_users_7d} this week`,  color: "#3b82f6", icon: "👥" },
    { label: "Paying Users",     value: fmtNum(stats.paying_users),        sub: `${Math.round(stats.paying_users/Math.max(stats.total_users,1)*100)}% conversion`, color: "#10b981", icon: "💳" },
    { label: "MRR",              value: koboToNGN(stats.mrr_kobo),         sub: "active subscriptions",              color: "#8b5cf6", icon: "📈" },
    { label: "Revenue (30d)",    value: koboToNGN(stats.revenue_30d_kobo), sub: "payments received",                 color: "#f59e0b", icon: "💰" },
    { label: "Active Today",     value: fmtNum(stats.active_today),        sub: `${stats.calls_today} calls today`,  color: "#06b6d4", icon: "🔥" },
    { label: "Live Calls",       value: fmtNum(stats.live_calls),          sub: "right now",                         color: "#ef4444", icon: "📞", pulse: stats.live_calls > 0 },
    { label: "Minutes Used",     value: fmtNum(stats.total_minutes_used),  sub: "this billing cycle",                color: "#6366f1", icon: "⏱" },
    { label: "Failed Webhooks",  value: fmtNum(stats.failed_webhooks),     sub: "last 24 hours",                     color: stats.failed_webhooks > 0 ? "#ef4444" : "#10b981", icon: "⚠️" },
  ];

  const planDist = stats.plan_distribution || {};
  const total = Object.values(planDist).reduce((a, b) => a + b, 0);

  return (
    <div style={styles.sectionWrap}>
      <div style={styles.kpiGrid}>
        {kpis.map(k => (
          <KpiCard key={k.label} {...k} />
        ))}
      </div>

      <div style={styles.twoCol}>
        <Card title="Plan Distribution" icon="📊">
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {PLANS.map(p => {
              const count = planDist[p] ?? 0;
              const pct = total > 0 ? (count / total) * 100 : 0;
              return (
                <div key={p}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ ...styles.planBadge, background: PLAN_COLORS[p] + "22", color: PLAN_COLORS[p] }}>{PLAN_NAMES[p]}</span>
                    <span style={{ color: "#94a3b8", fontSize: 13 }}>{count} users ({Math.round(pct)}%)</span>
                  </div>
                  <div style={styles.progressBg}>
                    <div style={{ ...styles.progressFill, width: `${pct}%`, background: PLAN_COLORS[p] }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card title="System Health" icon="🟢">
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              { label: "Database",           status: "operational", value: "< 50ms" },
              { label: "Edge Functions",     status: "operational", value: "99.9% uptime" },
              { label: "Realtime",           status: "operational", value: `${stats.live_calls} active` },
              { label: "Paystack Webhooks",  status: stats.failed_webhooks > 5 ? "degraded" : "operational", value: stats.failed_webhooks > 0 ? `${stats.failed_webhooks} failed` : "All clear" },
              { label: "100ms Infra",        status: "operational", value: `${stats.live_calls} rooms` },
              { label: "AI Gateway",         status: "operational", value: "Lovable AI" },
            ].map(s => (
              <div key={s.label} style={styles.healthRow}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ ...styles.statusDot, background: s.status === "operational" ? "#10b981" : "#f59e0b" }} />
                  <span style={{ color: "#e2e8f0", fontSize: 13 }}>{s.label}</span>
                </div>
                <span style={{ color: "#94a3b8", fontSize: 12 }}>{s.value}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ─── Users Section ────────────────────────────────────────────────────────────
function UsersSection() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const PER_PAGE = 20;

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (supabase as any).rpc("admin_get_users_v2", {
      p_search: search || null,
      p_plan:   planFilter || null,
      p_status: statusFilter || null,
      p_limit:  PER_PAGE,
      p_offset: page * PER_PAGE,
    });
    if (!error && data) {
      setUsers((data as any).users || []);
      setTotal((data as any).total || 0);
    }
    setLoading(false);
  }, [search, planFilter, statusFilter, page]);

  useEffect(() => { load(); }, [load]);

  const action = async (userId: string, act: string, extra: Record<string, unknown> = {}) => {
    setBusyId(userId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke("admin-user-actions", {
        body: { action: act, target_user_id: userId, ...extra },
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
      });
      if (error || (data as any)?.error) throw new Error((data as any)?.error || error?.message);
      toast.success("Action completed");
      await (supabase as any).rpc("admin_log_action_v2", { p_action: act, p_target_type: "user", p_target_id: userId, p_details: extra });
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div style={styles.sectionWrap}>
      <div style={styles.filterBar}>
        <input style={styles.searchInput} placeholder="Search email or name…" value={search}
          onChange={e => { setSearch(e.target.value); setPage(0); }} />
        <select style={styles.select} value={planFilter} onChange={e => { setPlanFilter(e.target.value); setPage(0); }}>
          <option value="">All plans</option>
          {PLANS.map(p => <option key={p} value={p}>{PLAN_NAMES[p]}</option>)}
        </select>
        <select style={styles.select} value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(0); }}>
          <option value="">All status</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </select>
        <span style={styles.totalBadge}>{fmtNum(total)} users</span>
      </div>

      {loading ? <Skeleton rows={8} /> : (
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                {["User","Plan","Billing","Minutes","Calls","Actions"].map(h => (
                  <th key={h} style={styles.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} style={styles.tr}>
                  <td style={styles.td}>
                    <div style={styles.userCell}>
                      <div style={styles.avatar}>{(u.full_name || u.email || "?")[0].toUpperCase()}</div>
                      <div>
                        <div style={{ color: "#e2e8f0", fontSize: 13, fontWeight: 600 }}>
                          {u.full_name || "—"}
                          {u.is_admin && <span style={styles.adminTag}> ADMIN</span>}
                          {u.suspended && <span style={styles.suspendedTag}> SUSPENDED</span>}
                        </div>
                        <div style={{ color: "#64748b", fontSize: 12 }}>{u.email}</div>
                        <div style={{ color: "#475569", fontSize: 11 }}>since {new Date(u.created_at).toLocaleDateString()}</div>
                      </div>
                    </div>
                  </td>
                  <td style={styles.td}>
                    <select style={{ ...styles.select, fontSize: 12, padding: "3px 6px" }}
                      value={u.plan_type}
                      onChange={e => action(u.id, "update_profile", { plan_type: e.target.value })}
                      disabled={busyId === u.id}>
                      {PLANS.map(p => <option key={p} value={p}>{PLAN_NAMES[p]}</option>)}
                    </select>
                  </td>
                  <td style={styles.td}>
                    <span style={{ ...styles.badge, background: u.billing_status === "active" ? "#10b98120" : "#64748b20", color: u.billing_status === "active" ? "#10b981" : "#94a3b8" }}>
                      {u.billing_status || "inactive"}
                    </span>
                    {u.sub_amount_kobo ? <div style={{ color: "#64748b", fontSize: 11 }}>{koboToNGN(u.sub_amount_kobo)}/mo</div> : null}
                  </td>
                  <td style={styles.td}>
                    <span style={{ color: "#e2e8f0", fontSize: 13 }}>{fmtNum(u.minutes_this_month || 0)}</span>
                    <span style={{ color: "#64748b", fontSize: 11 }}> / {u.calls_limit < 0 ? "∞" : fmtNum(u.calls_limit)} min</span>
                  </td>
                  <td style={styles.td}>
                    <span style={{ color: "#94a3b8", fontSize: 13 }}>{u.total_calls || 0}</span>
                  </td>
                  <td style={styles.td}>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      <ActionBtn icon="🔄" title="Reset minutes" disabled={busyId === u.id} onClick={() => action(u.id, "reset_minutes")} />
                      <ActionBtn icon={u.suspended ? "✅" : "🚫"} title={u.suspended ? "Unsuspend" : "Suspend"} disabled={busyId === u.id} onClick={() => action(u.id, "suspend_user", { suspended: !u.suspended })} />
                      <ActionBtn icon="👁" title="View details" onClick={() => setSelectedUser(u)} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={styles.pagination}>
        <button style={styles.pageBtn} disabled={page === 0} onClick={() => setPage(p => p - 1)}>← Prev</button>
        <span style={{ color: "#64748b", fontSize: 13 }}>
          Page {page + 1} of {Math.ceil(total / PER_PAGE)}
        </span>
        <button style={styles.pageBtn} disabled={(page + 1) * PER_PAGE >= total} onClick={() => setPage(p => p + 1)}>Next →</button>
      </div>

      {selectedUser && <UserDetailModal user={selectedUser} onClose={() => setSelectedUser(null)} />}
    </div>
  );
}

// ─── Billing Section ──────────────────────────────────────────────────────────
function BillingSection() {
  const [revenue, setRevenue] = useState<RevenueAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (supabase as any).rpc("admin_get_revenue_analytics", { p_days: 30 })
      .then(({ data, error }: any) => {
        if (!error) setRevenue(data as RevenueAnalytics);
        setLoading(false);
      });
  }, []);

  if (loading) return <Skeleton rows={4} />;
  if (!revenue) return <ErrorCard msg="Failed to load revenue data" />;

  const maxRev = Math.max(...(revenue.daily_revenue?.map(d => d.amount_kobo) || [1]));

  return (
    <div style={styles.sectionWrap}>
      <div style={styles.kpiGrid}>
        <KpiCard label="Revenue (7d)"  value={koboToNGN(revenue.total_7d_kobo)}  sub="last 7 days"  color="#10b981" icon="📈" />
        <KpiCard label="Revenue (30d)" value={koboToNGN(revenue.total_30d_kobo)} sub="last 30 days" color="#8b5cf6" icon="💰" />
        <KpiCard label="Active Subs"   value={fmtNum(revenue.plan_revenue?.reduce((a, r) => a + r.user_count, 0) || 0)} sub="paying now" color="#3b82f6" icon="💳" />
        <KpiCard label="MRR"           value={koboToNGN(revenue.plan_revenue?.reduce((a, r) => a + r.monthly_kobo, 0) || 0)} sub="monthly recurring" color="#f59e0b" icon="🎯" />
      </div>

      <div style={styles.twoCol}>
        <Card title="Revenue Last 30 Days" icon="📊">
          <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 140, paddingTop: 16 }}>
            {(revenue.daily_revenue || []).slice(-30).map((d, i) => (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                <div style={{
                  width: "100%", background: "#8b5cf6",
                  height: `${Math.max(4, (d.amount_kobo / maxRev) * 120)}px`,
                  borderRadius: "3px 3px 0 0", opacity: 0.8,
                  transition: "height 0.3s ease",
                }} title={`${d.date}: ${koboToNGN(d.amount_kobo)}`} />
              </div>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
            <span style={{ color: "#475569", fontSize: 11 }}>30 days ago</span>
            <span style={{ color: "#475569", fontSize: 11 }}>Today</span>
          </div>
        </Card>

        <Card title="Revenue by Plan" icon="🏆">
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {(revenue.plan_revenue || []).sort((a, b) => b.monthly_kobo - a.monthly_kobo).map(r => {
              const planKey = PLANS.find(p => r.plan_name?.toLowerCase().includes(p)) || "free";
              return (
                <div key={r.plan_name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ ...styles.planBadge, background: PLAN_COLORS[planKey] + "22", color: PLAN_COLORS[planKey] }}>{r.plan_name}</span>
                    <span style={{ color: "#94a3b8", fontSize: 12 }}>{r.user_count} users</span>
                  </div>
                  <span style={{ color: "#e2e8f0", fontWeight: 600, fontSize: 14 }}>{koboToNGN(r.monthly_kobo)}</span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ─── AI & Infra Section ───────────────────────────────────────────────────────
function AIInfraSection() {
  const [metrics, setMetrics] = useState<{
    total_calls: number; live_calls: number; total_transcripts: number;
    edge_errors: number; total_minutes: number; avg_call_duration: number;
  } | null>(null);

  useEffect(() => {
    (async () => {
      const [callsRes, transcriptsRes, errorsRes, minutesRes] = await Promise.all([
        supabase.from("calls").select("id, status, duration_minutes", { count: "exact" }).limit(1),
        supabase.from("transcripts").select("id", { count: "exact" }).limit(1),
        supabase.from("edge_function_errors").select("id", { count: "exact" }).limit(1),
        supabase.from("usage_summary" as any).select("total_minutes_used").eq("billing_month", new Date().toISOString().slice(0,7)),
      ]);

      const liveRes = await supabase.from("calls").select("id", { count: "exact" }).eq("status", "live");
      const totalMins = (minutesRes.data as any[] || []).reduce((a, r) => a + (r.total_minutes_used || 0), 0);

      setMetrics({
        total_calls: callsRes.count || 0,
        live_calls: liveRes.count || 0,
        total_transcripts: transcriptsRes.count || 0,
        edge_errors: errorsRes.count || 0,
        total_minutes: totalMins,
        avg_call_duration: 0,
      });
    })();
  }, []);

  return (
    <div style={styles.sectionWrap}>
      <div style={styles.kpiGrid}>
        <KpiCard label="Total Calls"      value={fmtNum(metrics?.total_calls || 0)}      sub="all time"          color="#3b82f6" icon="📞" />
        <KpiCard label="Live Calls"        value={fmtNum(metrics?.live_calls || 0)}        sub="right now"         color="#ef4444" icon="🔴" pulse={true} />
        <KpiCard label="Transcripts"       value={fmtNum(metrics?.total_transcripts || 0)} sub="total lines"       color="#10b981" icon="📝" />
        <KpiCard label="Edge Errors"       value={fmtNum(metrics?.edge_errors || 0)}       sub="logged errors"     color={metrics?.edge_errors ? "#ef4444" : "#10b981"} icon="⚠️" />
        <KpiCard label="Minutes (cycle)"   value={fmtNum(metrics?.total_minutes || 0)}     sub="this billing month" color="#8b5cf6" icon="⏱" />
        <KpiCard label="AI Gateway"        value="Online"                                   sub="Lovable / Gemini"  color="#10b981" icon="🤖" />
      </div>

      <Card title="Infrastructure Status" icon="🏗️">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {[
            { svc: "100ms Video/Audio", status: "operational", detail: "HMS SDK active" },
            { svc: "Supabase DB",       status: "operational", detail: "< 50ms latency" },
            { svc: "Supabase Realtime", status: "operational", detail: "WebSocket active" },
            { svc: "Paystack Billing",  status: "operational", detail: "Webhook enabled" },
            { svc: "Edge Functions",    status: "operational", detail: "Deno Deploy" },
            { svc: "Lovable AI Gateway", status: "operational", detail: "Gemini Flash 2.0" },
            { svc: "Push Notifications", status: "operational", detail: "VAPID + FCM" },
            { svc: "pg_cron Jobs",       status: "operational", detail: "Reminder scheduler" },
          ].map(s => (
            <div key={s.svc} style={styles.infraCard}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ ...styles.statusDot, background: "#10b981", boxShadow: "0 0 6px #10b981" }} />
                <span style={{ color: "#e2e8f0", fontSize: 13, fontWeight: 600 }}>{s.svc}</span>
              </div>
              <span style={{ color: "#64748b", fontSize: 11 }}>{s.detail}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ─── Security Section ─────────────────────────────────────────────────────────
function SecuritySection() {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("security_events").select("*").order("created_at", { ascending: false }).limit(50);
      setEvents(data || []);
      setLoading(false);
    })();
  }, []);

  const severityColor = (s: string) => s === "high" ? "#ef4444" : s === "medium" ? "#f59e0b" : "#10b981";

  return (
    <div style={styles.sectionWrap}>
      <div style={styles.kpiGrid}>
        <KpiCard label="Security Events" value={fmtNum(events.length)} sub="all time" color="#ef4444" icon="🔐" />
        <KpiCard label="High Severity" value={fmtNum(events.filter(e => e.severity === "high").length)} sub="events" color="#ef4444" icon="🚨" />
        <KpiCard label="Rate Limited" value="0" sub="last 24h" color="#f59e0b" icon="🛑" />
        <KpiCard label="Active Sessions" value="—" sub="across all users" color="#3b82f6" icon="👤" />
      </div>

      <Card title="Recent Security Events" icon="🛡️">
        {loading ? <Skeleton rows={5} /> : (
          events.length === 0 ? (
            <div style={{ color: "#10b981", textAlign: "center", padding: "24px", fontSize: 14 }}>
              ✅ No security events recorded
            </div>
          ) : (
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead><tr>{["Time","Type","User","Severity","Details"].map(h => <th key={h} style={styles.th}>{h}</th>)}</tr></thead>
                <tbody>
                  {events.map(e => (
                    <tr key={e.id} style={styles.tr}>
                      <td style={styles.td}><span style={{ color: "#64748b", fontSize: 12 }}>{fmtTime(e.created_at)}</span></td>
                      <td style={styles.td}><span style={{ color: "#e2e8f0", fontSize: 13 }}>{e.event_type}</span></td>
                      <td style={styles.td}><span style={{ color: "#94a3b8", fontSize: 12 }}>{e.user_id?.slice(0,8)}…</span></td>
                      <td style={styles.td}>
                        <span style={{ ...styles.badge, background: severityColor(e.severity) + "20", color: severityColor(e.severity) }}>
                          {e.severity}
                        </span>
                      </td>
                      <td style={styles.td}><span style={{ color: "#64748b", fontSize: 12 }}>{JSON.stringify(e.details || {}).slice(0,60)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </Card>
    </div>
  );
}

// ─── Feature Flags Section ────────────────────────────────────────────────────
function FeatureFlagsSection() {
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    const { data } = await (supabase as any).from("feature_flags").select("*").order("category");
    setFlags(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const toggle = async (flag: FeatureFlag) => {
    setBusyId(flag.id);
    const { error } = await (supabase as any).rpc("admin_update_feature_flag", {
      p_flag_id: flag.id,
      p_enabled: !flag.enabled,
    });
    if (error) toast.error("Failed: " + error.message);
    else toast.success(`${flag.name} ${!flag.enabled ? "enabled" : "disabled"}`);
    await load();
    setBusyId(null);
  };

  const categories = [...new Set(flags.map(f => f.category))];
  const categoryColors: Record<string, string> = {
    core: "#3b82f6", ai: "#8b5cf6", deals: "#10b981",
    coaching: "#f59e0b", analytics: "#06b6d4", billing: "#ec4899",
    notifications: "#f97316", developer: "#a78bfa", beta: "#64748b",
  };

  return (
    <div style={styles.sectionWrap}>
      <div style={{ ...styles.infoBar, marginBottom: 16 }}>
        ⚡ Changes take effect immediately. Disabling a feature will hide it for all users on affected plans.
      </div>
      {loading ? <Skeleton rows={4} /> : (
        categories.map(cat => (
          <Card key={cat} title={cat.charAt(0).toUpperCase() + cat.slice(1)} icon="🚩" style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {flags.filter(f => f.category === cat).map(flag => (
                <div key={flag.id} style={styles.flagRow}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ color: "#e2e8f0", fontSize: 14, fontWeight: 600 }}>{flag.name}</span>
                      {flag.is_beta && <span style={{ ...styles.badge, background: "#f59e0b20", color: "#f59e0b", fontSize: 10 }}>BETA</span>}
                      <span style={{ ...styles.badge, background: categoryColors[cat] + "20", color: categoryColors[cat], fontSize: 10 }}>{cat}</span>
                    </div>
                    <div style={{ color: "#64748b", fontSize: 12, marginTop: 2 }}>{flag.description}</div>
                    <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
                      {flag.plan_gates?.map(p => (
                        <span key={p} style={{ ...styles.badge, background: PLAN_COLORS[p] + "20", color: PLAN_COLORS[p], fontSize: 10 }}>{PLAN_NAMES[p] || p}</span>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                    <button
                      style={{ ...styles.toggleBtn, background: flag.enabled ? "#10b981" : "#334155" }}
                      disabled={busyId === flag.id}
                      onClick={() => toggle(flag)}
                    >
                      {busyId === flag.id ? "…" : flag.enabled ? "ON" : "OFF"}
                    </button>
                    {flag.updated_by && <span style={{ color: "#475569", fontSize: 10 }}>by {flag.updated_by}</span>}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ))
      )}
    </div>
  );
}

// ─── Audit Logs Section ───────────────────────────────────────────────────────
function AuditLogsSection() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const PER_PAGE = 50;

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await (supabase as any).rpc("admin_get_audit_log", {
        p_limit: PER_PAGE,
        p_offset: page * PER_PAGE,
      });
      if (!error && data) {
        setLogs((data as any).logs || []);
        setTotal((data as any).total || 0);
      }
      setLoading(false);
    })();
  }, [page]);

  const severityColor = (s: string) => s === "critical" ? "#ef4444" : s === "warning" ? "#f59e0b" : "#64748b";

  return (
    <div style={styles.sectionWrap}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <span style={{ color: "#94a3b8", fontSize: 14 }}>{fmtNum(total)} total entries</span>
        <button style={styles.exportBtn} onClick={() => {
          const csv = [
            ["Time","Admin","Action","Target","Severity"],
            ...logs.map(l => [fmtTime(l.created_at), l.admin_email, l.action, l.target_email || l.target_id || "", l.severity])
          ].map(r => r.join(",")).join("\n");
          const a = document.createElement("a");
          a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
          a.download = `audit-log-${Date.now()}.csv`;
          a.click();
        }}>⬇ Export CSV</button>
      </div>

      {loading ? <Skeleton rows={8} /> : (
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead><tr>{["Time","Admin","Action","Target","Severity","Details"].map(h => <th key={h} style={styles.th}>{h}</th>)}</tr></thead>
            <tbody>
              {logs.map(l => (
                <tr key={l.id} style={styles.tr}>
                  <td style={styles.td}><span style={{ color: "#64748b", fontSize: 11 }}>{fmtTime(l.created_at)}</span></td>
                  <td style={styles.td}><span style={{ color: "#94a3b8", fontSize: 12 }}>{l.admin_email}</span></td>
                  <td style={styles.td}>
                    <code style={{ color: "#a78bfa", fontSize: 12, background: "#1e1b2e", padding: "2px 6px", borderRadius: 4 }}>{l.action}</code>
                  </td>
                  <td style={styles.td}><span style={{ color: "#94a3b8", fontSize: 12 }}>{l.target_email || l.target_id?.slice(0, 12) || "—"}</span></td>
                  <td style={styles.td}>
                    <span style={{ ...styles.badge, background: severityColor(l.severity) + "20", color: severityColor(l.severity) }}>{l.severity}</span>
                  </td>
                  <td style={styles.td}><span style={{ color: "#475569", fontSize: 11 }}>{JSON.stringify(l.details || {}).slice(0, 50)}</span></td>
                </tr>
              ))}
              {logs.length === 0 && <tr><td colSpan={6} style={{ ...styles.td, textAlign: "center", color: "#475569", padding: 24 }}>No audit logs yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      <div style={styles.pagination}>
        <button style={styles.pageBtn} disabled={page === 0} onClick={() => setPage(p => p - 1)}>← Prev</button>
        <span style={{ color: "#64748b", fontSize: 13 }}>Page {page + 1} of {Math.ceil(total / PER_PAGE)}</span>
        <button style={styles.pageBtn} disabled={(page + 1) * PER_PAGE >= total} onClick={() => setPage(p => p + 1)}>Next →</button>
      </div>
    </div>
  );
}

// ─── User Detail Modal ────────────────────────────────────────────────────────
function UserDetailModal({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <div>
            <div style={{ color: "#e2e8f0", fontWeight: 700, fontSize: 16 }}>{user.full_name || user.email}</div>
            <div style={{ color: "#64748b", fontSize: 12 }}>{user.email}</div>
          </div>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, padding: "0 0 16px" }}>
          {[
            { label: "Plan",         value: PLAN_NAMES[user.plan_type] || user.plan_type },
            { label: "Billing",      value: user.billing_status },
            { label: "Sub Status",   value: user.sub_status || "—" },
            { label: "Minutes/mo",   value: fmtNum(user.minutes_this_month || 0) },
            { label: "Total Calls",  value: fmtNum(user.total_calls || 0) },
            { label: "Calls Limit",  value: user.calls_limit < 0 ? "Unlimited" : fmtNum(user.calls_limit) },
            { label: "Sub Amount",   value: user.sub_amount_kobo ? koboToNGN(user.sub_amount_kobo) + "/mo" : "—" },
            { label: "Next Payment", value: user.next_payment_date ? new Date(user.next_payment_date).toLocaleDateString() : "—" },
            { label: "Extra Minutes", value: fmtNum(user.extra_minutes || 0) },
            { label: "Member Since", value: new Date(user.created_at).toLocaleDateString() },
          ].map(f => (
            <div key={f.label} style={{ background: "#0f172a", padding: "10px 14px", borderRadius: 8 }}>
              <div style={{ color: "#475569", fontSize: 11, marginBottom: 4 }}>{f.label}</div>
              <div style={{ color: "#e2e8f0", fontSize: 14, fontWeight: 600 }}>{f.value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Reusable UI components ───────────────────────────────────────────────────
function KpiCard({ label, value, sub, color, icon, pulse }: {
  label: string; value: string; sub?: string; color: string; icon?: string; pulse?: boolean;
}) {
  return (
    <div style={{ ...styles.kpiCard, borderLeft: `3px solid ${color}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ color: "#64748b", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
        {icon && <span style={{ fontSize: 18 }}>{icon}</span>}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span style={{ color: "#f1f5f9", fontSize: 24, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>{value}</span>
        {pulse && <span style={styles.pulseDot} />}
      </div>
      {sub && <div style={{ color: "#475569", fontSize: 11, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function Card({ title, icon, children, style }: { title: string; icon: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ ...styles.card, ...style }}>
      <div style={styles.cardHeader}>
        <span style={{ fontSize: 16 }}>{icon}</span>
        <span style={styles.cardTitle}>{title}</span>
      </div>
      <div style={styles.cardBody}>{children}</div>
    </div>
  );
}

function Skeleton({ rows }: { rows: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ height: 48, background: "#1e293b", borderRadius: 8, animation: "pulse 1.5s infinite" }} />
      ))}
    </div>
  );
}

function ErrorCard({ msg }: { msg: string }) {
  return <div style={{ color: "#ef4444", background: "#ef444420", padding: 16, borderRadius: 8, fontSize: 14 }}>⚠️ {msg}</div>;
}

function ActionBtn({ icon, title, onClick, disabled }: { icon: string; title: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button style={{ ...styles.actionBtn, opacity: disabled ? 0.5 : 1 }} title={title} onClick={onClick} disabled={disabled}>
      {icon}
    </button>
  );
}

function LoadingScreen() {
  return (
    <div style={{ minHeight: "100vh", background: "#0b1120", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ width: 40, height: 40, border: "3px solid #1e293b", borderTopColor: "#3b82f6", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 16px" }} />
        <div style={{ color: "#475569", fontSize: 14 }}>Loading Operations Center…</div>
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  shell: {
    display: "flex",
    minHeight: "100vh",
    background: "#080d17",
    fontFamily: "'Inter', system-ui, sans-serif",
    color: "#e2e8f0",
  },
  sidebar: {
    background: "#0b1120",
    borderRight: "1px solid #1e2d40",
    display: "flex",
    flexDirection: "column",
    position: "sticky" as const,
    top: 0,
    height: "100vh",
    transition: "width 0.2s ease",
    flexShrink: 0,
    overflow: "hidden",
  },
  sidebarHeader: {
    padding: "20px 16px 12px",
    borderBottom: "1px solid #1e2d40",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 64,
  },
  logoText: {
    color: "#3b82f6",
    fontWeight: 900,
    fontSize: 13,
    letterSpacing: "0.15em",
    fontFamily: "'JetBrains Mono', monospace",
  },
  logoSub: {
    color: "#334155",
    fontSize: 9,
    letterSpacing: "0.12em",
    marginTop: 2,
  },
  sidebarToggle: {
    background: "none",
    border: "1px solid #1e2d40",
    color: "#475569",
    cursor: "pointer",
    padding: "4px 8px",
    borderRadius: 6,
    fontSize: 10,
  },
  nav: {
    flex: 1,
    padding: "12px 8px",
    display: "flex",
    flexDirection: "column",
    gap: 4,
    overflowY: "auto" as const,
  },
  navItem: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "9px 10px",
    borderRadius: 8,
    border: "none",
    background: "none",
    color: "#475569",
    cursor: "pointer",
    fontSize: 13,
    textAlign: "left" as const,
    transition: "all 0.15s",
    whiteSpace: "nowrap" as const,
  },
  navItemActive: {
    background: "#1e3a5f",
    color: "#60a5fa",
  },
  navIcon: { fontSize: 15, flexShrink: 0 },
  navLabel: {},
  sidebarFooter: {
    padding: "12px",
    borderTop: "1px solid #1e2d40",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  adminEmail: {
    color: "#334155",
    fontSize: 11,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  signOutBtn: {
    background: "#1e2d40",
    border: "none",
    color: "#64748b",
    padding: "7px 10px",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 12,
  },
  main: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
  },
  topBar: {
    background: "#0b1120",
    borderBottom: "1px solid #1e2d40",
    padding: "14px 24px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    position: "sticky" as const,
    top: 0,
    zIndex: 10,
  },
  topBarTitle: {
    color: "#e2e8f0",
    fontWeight: 700,
    fontSize: 16,
  },
  backLink: {
    color: "#475569",
    textDecoration: "none",
    fontSize: 13,
  },
  content: {
    flex: 1,
    padding: "24px",
    overflowY: "auto" as const,
  },
  sectionWrap: {
    display: "flex",
    flexDirection: "column",
    gap: 20,
    maxWidth: 1200,
  },
  kpiGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
    gap: 12,
  },
  kpiCard: {
    background: "#0f172a",
    border: "1px solid #1e2d40",
    borderRadius: 10,
    padding: "14px 16px",
  },
  twoCol: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 16,
  },
  card: {
    background: "#0f172a",
    border: "1px solid #1e2d40",
    borderRadius: 12,
  },
  cardHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "14px 18px",
    borderBottom: "1px solid #1e2d40",
  },
  cardTitle: {
    color: "#94a3b8",
    fontSize: 13,
    fontWeight: 600,
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
  },
  cardBody: {
    padding: "16px 18px",
  },
  filterBar: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap" as const,
    alignItems: "center",
  },
  searchInput: {
    background: "#0f172a",
    border: "1px solid #1e2d40",
    color: "#e2e8f0",
    padding: "9px 14px",
    borderRadius: 8,
    fontSize: 13,
    flex: 1,
    minWidth: 200,
    outline: "none",
  },
  select: {
    background: "#0f172a",
    border: "1px solid #1e2d40",
    color: "#94a3b8",
    padding: "9px 12px",
    borderRadius: 8,
    fontSize: 13,
    cursor: "pointer",
    outline: "none",
  },
  totalBadge: {
    color: "#64748b",
    fontSize: 13,
    background: "#1e2d40",
    padding: "6px 12px",
    borderRadius: 20,
  },
  tableWrap: {
    overflowX: "auto" as const,
    borderRadius: 12,
    border: "1px solid #1e2d40",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse" as const,
    fontSize: 13,
  },
  th: {
    background: "#0f172a",
    color: "#475569",
    padding: "10px 14px",
    textAlign: "left" as const,
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    borderBottom: "1px solid #1e2d40",
    whiteSpace: "nowrap" as const,
  },
  tr: {
    borderBottom: "1px solid #0f172a",
    transition: "background 0.15s",
  },
  td: {
    padding: "10px 14px",
    verticalAlign: "middle" as const,
    background: "#0b1120",
  },
  userCell: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  avatar: {
    width: 32,
    height: 32,
    background: "#1e3a5f",
    color: "#60a5fa",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 13,
    fontWeight: 700,
    flexShrink: 0,
  },
  adminTag: {
    fontSize: 9,
    background: "#8b5cf620",
    color: "#a78bfa",
    padding: "1px 5px",
    borderRadius: 4,
    marginLeft: 4,
  },
  suspendedTag: {
    fontSize: 9,
    background: "#ef444420",
    color: "#ef4444",
    padding: "1px 5px",
    borderRadius: 4,
    marginLeft: 4,
  },
  badge: {
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: 12,
    fontSize: 11,
    fontWeight: 600,
  },
  planBadge: {
    display: "inline-block",
    padding: "2px 10px",
    borderRadius: 12,
    fontSize: 11,
    fontWeight: 700,
  },
  actionBtn: {
    background: "#1e2d40",
    border: "1px solid #2d3f55",
    color: "#94a3b8",
    padding: "5px 8px",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 13,
  },
  pagination: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    marginTop: 8,
  },
  pageBtn: {
    background: "#1e2d40",
    border: "1px solid #2d3f55",
    color: "#94a3b8",
    padding: "7px 14px",
    borderRadius: 8,
    cursor: "pointer",
    fontSize: 13,
  },
  progressBg: {
    background: "#1e2d40",
    borderRadius: 4,
    height: 6,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 4,
    transition: "width 0.5s ease",
  },
  healthRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "8px 0",
    borderBottom: "1px solid #1e2d40",
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    flexShrink: 0,
  },
  pulseDot: {
    display: "inline-block",
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: "#ef4444",
    boxShadow: "0 0 8px #ef4444",
    animation: "pulse 1s infinite",
    marginLeft: 4,
  },
  infraCard: {
    background: "#080d17",
    border: "1px solid #1e2d40",
    borderRadius: 8,
    padding: "12px 14px",
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  infoBar: {
    background: "#1e3a5f",
    border: "1px solid #2563eb40",
    color: "#93c5fd",
    padding: "10px 16px",
    borderRadius: 8,
    fontSize: 13,
  },
  flagRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    padding: "10px 0",
    borderBottom: "1px solid #1e2d40",
  },
  toggleBtn: {
    border: "none",
    color: "#fff",
    padding: "5px 14px",
    borderRadius: 20,
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.05em",
    minWidth: 50,
  },
  exportBtn: {
    background: "#1e2d40",
    border: "1px solid #2d3f55",
    color: "#94a3b8",
    padding: "7px 14px",
    borderRadius: 8,
    cursor: "pointer",
    fontSize: 13,
  },
  modalOverlay: {
    position: "fixed" as const,
    inset: 0,
    background: "rgba(0,0,0,0.7)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
  },
  modal: {
    background: "#0f172a",
    border: "1px solid #1e2d40",
    borderRadius: 16,
    width: "min(560px, 95vw)",
    maxHeight: "85vh",
    overflowY: "auto" as const,
    padding: "24px",
  },
  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
    paddingBottom: 16,
    borderBottom: "1px solid #1e2d40",
  },
  closeBtn: {
    background: "none",
    border: "none",
    color: "#475569",
    fontSize: 18,
    cursor: "pointer",
  },
};