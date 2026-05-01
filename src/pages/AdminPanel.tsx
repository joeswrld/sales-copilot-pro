import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { PLAN_CONFIG, PLAN_ORDER, USD_TO_NGN, formatNGN } from "@/config/plans";
import {
  Users, Wallet, TrendingUp, ShieldCheck, ChevronDown, ChevronRight,
  Trash2, RefreshCw, Ban, CheckCircle2, ArrowLeft, Search, LogOut,
} from "lucide-react";

type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  plan_type: string;
  billing_status: string;
  calls_limit: number;
  calls_used: number;
  suspended: boolean;
  created_at: string;
};
type Subscription = {
  id: string;
  user_id: string;
  team_id: string | null;
  plan_name: string;
  plan_price_usd: number | null;
  amount_kobo: number;
  status: string;
  minutes_used: number;
  minutes_limit: number | null;
};
type TeamMember = { team_id: string; user_id: string; role: string; status: string };
type TeamRow = { id: string; name: string; created_by: string };
type Payment = { user_id: string | null; amount_kobo: number | null; amount: number | null; status: string };

export default function AdminPanel() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [adminIds, setAdminIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState<string>("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState<Profile | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadAll = async () => {
    setLoading(true);
    const [p, s, t, m, r, payRes] = await Promise.all([
      supabase.from("profiles").select("id,email,full_name,plan_type,billing_status,calls_limit,calls_used,suspended,created_at").order("created_at", { ascending: false }),
      supabase.from("subscriptions").select("id,user_id,team_id,plan_name,plan_price_usd,amount_kobo,status,minutes_used,minutes_limit"),
      supabase.from("teams").select("id,name,created_by"),
      supabase.from("team_members").select("team_id,user_id,role,status"),
      supabase.from("user_roles").select("user_id,role").eq("role", "admin"),
      supabase.from("payments" as any).select("user_id,amount_kobo,amount,status").limit(5000),
    ]);

    if (p.data) setProfiles(p.data as Profile[]);
    if (s.data) setSubs(s.data as Subscription[]);
    if (t.data) setTeams(t.data as TeamRow[]);
    if (m.data) setMembers(m.data as TeamMember[]);
    if (r.data) setAdminIds(new Set(r.data.map((x: any) => x.user_id)));
    if (!payRes.error && payRes.data) setPayments(payRes.data as unknown as Payment[]);
    setLoading(false);
  };

  useEffect(() => { loadAll(); }, []);

  // ── METRICS ─────────────────────────────────────────────────────────────
  const metrics = useMemo(() => {
    const byPlan: Record<string, number> = { free: 0, starter: 0, growth: 0, scale: 0 };
    profiles.forEach(p => { byPlan[p.plan_type] = (byPlan[p.plan_type] ?? 0) + 1; });

    // MRR estimate: count active paid subs per plan × USD price
    const activeSubs = subs.filter(s => s.status === "active");
    const planCount: Record<string, number> = {};
    activeSubs.forEach(s => {
      const key = (s.plan_name || "").toLowerCase();
      const k = ["scale","growth","starter"].find(x => key.includes(x)) ?? "free";
      planCount[k] = (planCount[k] ?? 0) + 1;
    });
    const mrrUsd = Object.entries(planCount).reduce((acc, [k, n]) => acc + (PLAN_CONFIG[k]?.price_usd ?? 0) * n, 0);

    // Actual collected revenue from payments (status success/successful)
    const collectedKobo = payments
      .filter(p => ["success", "successful", "paid", "completed"].includes((p.status || "").toLowerCase()))
      .reduce((acc, p) => acc + (p.amount_kobo ?? p.amount ?? 0), 0);

    return {
      total: profiles.length,
      byPlan,
      paying: activeSubs.length,
      mrrUsd,
      mrrNgn: mrrUsd * USD_TO_NGN * 100, // kobo for formatNGN
      collectedKobo,
    };
  }, [profiles, subs, payments]);

  // ── GROUP BY TEAM ───────────────────────────────────────────────────────
  type Row =
    | { kind: "team"; team: TeamRow; members: Profile[]; sub?: Subscription }
    | { kind: "user"; profile: Profile; sub?: Subscription };

  const rows: Row[] = useMemo(() => {
    const filteredProfiles = profiles.filter(p => {
      const matchesSearch = !search ||
        (p.email ?? "").toLowerCase().includes(search.toLowerCase()) ||
        (p.full_name ?? "").toLowerCase().includes(search.toLowerCase());
      const matchesPlan = planFilter === "all" || p.plan_type === planFilter;
      return matchesSearch && matchesPlan;
    });

    const profileById = new Map(filteredProfiles.map(p => [p.id, p]));
    const subByUser = new Map(subs.map(s => [s.user_id, s]));

    // Determine team for each user from team_members (status active)
    const teamForUser = new Map<string, string>();
    members.filter(m => m.status === "active").forEach(m => teamForUser.set(m.user_id, m.team_id));

    const teamBucket = new Map<string, Profile[]>();
    const soloUsers: Profile[] = [];

    filteredProfiles.forEach(p => {
      const tid = teamForUser.get(p.id);
      if (tid) {
        if (!teamBucket.has(tid)) teamBucket.set(tid, []);
        teamBucket.get(tid)!.push(p);
      } else {
        soloUsers.push(p);
      }
    });

    const out: Row[] = [];
    teams.forEach(t => {
      const ms = teamBucket.get(t.id);
      if (ms && ms.length) {
        const ownerSub = subByUser.get(t.created_by);
        out.push({ kind: "team", team: t, members: ms, sub: ownerSub });
      }
    });
    soloUsers.forEach(p => out.push({ kind: "user", profile: p, sub: subByUser.get(p.id) }));
    return out;
  }, [profiles, subs, teams, members, search, planFilter]);

  // ── ACTIONS ─────────────────────────────────────────────────────────────
  const callAdmin = async (action: string, target_user_id: string, extra: Record<string, unknown> = {}) => {
    setBusyId(target_user_id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke("admin-user-actions", {
        body: { action, target_user_id, ...extra },
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast({ title: "Done" });
      await loadAll();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const changePlan = (p: Profile, plan: string) => {
    const cfg = PLAN_CONFIG[plan];
    callAdmin("update_profile", p.id, { plan_type: plan, calls_limit: cfg?.calls_limit ?? p.calls_limit });
  };

  const planBadgeClass = (plan: string) =>
    plan === "scale" ? "bg-purple-500/15 text-purple-700 dark:text-purple-300" :
    plan === "growth" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" :
    plan === "starter" ? "bg-blue-500/15 text-blue-700 dark:text-blue-300" :
    "bg-muted text-muted-foreground";

  const renderUserRow = (p: Profile, sub?: Subscription, indent = false) => (
    <TableRow key={p.id} className={indent ? "bg-muted/30" : ""}>
      <TableCell className={indent ? "pl-12" : ""}>
        <div className="flex items-center gap-2">
          {adminIds.has(p.id) && <ShieldCheck className="h-4 w-4 text-primary" />}
          <div>
            <div className="font-medium text-sm">{p.full_name || "—"}</div>
            <div className="text-xs text-muted-foreground">{p.email}</div>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <Select value={p.plan_type} onValueChange={(v) => changePlan(p, v)} disabled={busyId === p.id}>
          <SelectTrigger className="h-8 w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PLAN_ORDER.map(k => <SelectItem key={k} value={k}>{PLAN_CONFIG[k].name}</SelectItem>)}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <span className={`px-2 py-0.5 rounded text-xs ${p.billing_status === "active" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-muted text-muted-foreground"}`}>
          {p.billing_status}
        </span>
      </TableCell>
      <TableCell className="text-sm tabular-nums">
        {p.calls_used} / {p.calls_limit < 0 ? "∞" : p.calls_limit}
      </TableCell>
      <TableCell>
        {p.suspended ? <Badge variant="destructive">Suspended</Badge> : <Badge variant="secondary">Active</Badge>}
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-1 justify-end">
          <Button size="sm" variant="ghost" title="Reset minutes" disabled={busyId === p.id}
            onClick={() => callAdmin("reset_minutes", p.id)}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="ghost" title={p.suspended ? "Unsuspend" : "Suspend"} disabled={busyId === p.id}
            onClick={() => callAdmin("suspend_user", p.id, { suspended: !p.suspended })}>
            {p.suspended ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <Ban className="h-3.5 w-3.5 text-amber-600" />}
          </Button>
          <Button size="sm" variant="ghost" title={adminIds.has(p.id) ? "Revoke admin" : "Grant admin"} disabled={busyId === p.id || p.id === user?.id}
            onClick={() => callAdmin(adminIds.has(p.id) ? "revoke_admin" : "grant_admin", p.id)}>
            <ShieldCheck className={`h-3.5 w-3.5 ${adminIds.has(p.id) ? "text-primary" : "text-muted-foreground"}`} />
          </Button>
          <Button size="sm" variant="ghost" title="Delete user" disabled={busyId === p.id || p.id === user?.id}
            onClick={() => setConfirmDelete(p)}>
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link to="/dashboard" className="text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <div className="text-lg font-semibold tracking-tight">Admin Panel</div>
              <div className="text-xs text-muted-foreground hidden sm:block">{user?.email}</div>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={async () => { await signOut(); navigate("/login"); }}>
            <LogOut className="h-4 w-4 mr-1.5" /> Sign out
          </Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          <Kpi icon={<Users className="h-4 w-4" />} label="Total users" value={metrics.total} />
          <Kpi icon={<TrendingUp className="h-4 w-4" />} label="Paying users" value={metrics.paying} />
          <Kpi icon={<Wallet className="h-4 w-4" />} label="Est. MRR (USD)" value={`$${metrics.mrrUsd.toLocaleString()}`} sub={formatNGN(metrics.mrrNgn)} />
          <Kpi icon={<Wallet className="h-4 w-4" />} label="Collected (NGN)" value={formatNGN(metrics.collectedKobo)} sub="from payments" />
        </div>

        {/* Plan distribution */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Users by plan</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {PLAN_ORDER.map(k => {
                const cfg = PLAN_CONFIG[k];
                const count = metrics.byPlan[k] ?? 0;
                const monthlyUsd = (subs.filter(s => s.status === "active" && (s.plan_name || "").toLowerCase().includes(k)).length) * cfg.price_usd;
                return (
                  <div key={k} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${planBadgeClass(k)}`}>{cfg.name}</span>
                      <span className="text-2xl font-semibold tabular-nums">{count}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-2">
                      ${cfg.price_usd}/mo · est ${monthlyUsd.toLocaleString()}/mo
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search by email or name…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={planFilter} onValueChange={setPlanFilter}>
            <SelectTrigger className="sm:w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All plans</SelectItem>
              {PLAN_ORDER.map(k => <SelectItem key={k} value={k}>{PLAN_CONFIG[k].name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={loadAll}>
            <RefreshCw className="h-4 w-4 mr-1.5" /> Refresh
          </Button>
        </div>

        {/* Users / Teams table */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Users & Teams ({rows.length})</CardTitle>
          </CardHeader>
          <CardContent className="px-0 sm:px-6">
            {loading ? (
              <div className="py-10 text-center text-muted-foreground text-sm">Loading…</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User / Team</TableHead>
                      <TableHead>Plan</TableHead>
                      <TableHead>Billing</TableHead>
                      <TableHead>Usage</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row, i) => {
                      if (row.kind === "team") {
                        const open = expanded.has(row.team.id);
                        const ownerProfile = row.members.find(m => m.id === row.team.created_by) ?? row.members[0];
                        return (
                          <>
                            <TableRow key={`t-${row.team.id}`} className="bg-muted/40">
                              <TableCell>
                                <button className="flex items-center gap-2 text-left"
                                  onClick={() => {
                                    const ns = new Set(expanded);
                                    open ? ns.delete(row.team.id) : ns.add(row.team.id);
                                    setExpanded(ns);
                                  }}>
                                  {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                  <div>
                                    <div className="font-semibold text-sm">{row.team.name || "Team"}</div>
                                    <div className="text-xs text-muted-foreground">{row.members.length} members · owner {ownerProfile?.email}</div>
                                  </div>
                                </button>
                              </TableCell>
                              <TableCell>
                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${planBadgeClass(ownerProfile?.plan_type ?? "free")}`}>
                                  {PLAN_CONFIG[ownerProfile?.plan_type ?? "free"]?.name}
                                </span>
                              </TableCell>
                              <TableCell><span className="text-xs text-muted-foreground">shared</span></TableCell>
                              <TableCell className="text-sm tabular-nums">
                                {row.sub ? `${row.sub.minutes_used}/${row.sub.minutes_limit ?? "∞"} min` : "—"}
                              </TableCell>
                              <TableCell><Badge variant="outline">Team</Badge></TableCell>
                              <TableCell />
                            </TableRow>
                            {open && row.members.map(m => renderUserRow(m, row.sub, true))}
                          </>
                        );
                      }
                      return renderUserRow(row.profile, row.sub);
                    })}
                    {rows.length === 0 && (
                      <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8 text-sm">No users match.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Delete confirm */}
      <Dialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete user permanently?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently delete <span className="font-medium text-foreground">{confirmDelete?.email}</span> and
            all of their data. This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => {
              if (confirmDelete) callAdmin("delete_user", confirmDelete.id);
              setConfirmDelete(null);
            }}>
              <Trash2 className="h-4 w-4 mr-1.5" /> Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Kpi({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: React.ReactNode; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide">
          {icon} {label}
        </div>
        <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}
