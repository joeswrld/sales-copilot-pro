import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ResponsiveContainer, AreaChart, Area, LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Download, FileSpreadsheet, FileText, RefreshCw } from "lucide-react";
import { useAdminAnalytics, rangeFromPreset, type RangePreset, type AnalyticsRange } from "@/hooks/useAdminAnalytics";
import { exportCsv, exportJson, exportPdf } from "@/lib/adminExport";

const COLORS = ["hsl(var(--primary))", "#34d399", "#a78bfa", "#fbbf24", "#fb923c", "#06b6d4", "#f472b6"];

function ChartCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <CardDescription className="text-xs">{description}</CardDescription>}
      </CardHeader>
      <CardContent className="h-[260px] pl-0">{children}</CardContent>
    </Card>
  );
}

const fmtBucket = (s: string) => { try { return format(new Date(s), "MMM d"); } catch { return s; } };

export default function AdminAnalyticsPage() {
  const [preset, setPreset] = useState<RangePreset>("30d");
  const [custom, setCustom] = useState<{ from: string; to: string }>({
    from: new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
    to: new Date().toISOString().slice(0, 10),
  });
  const range: AnalyticsRange = useMemo(() => {
    if (preset === "custom") return rangeFromPreset("custom", { from: new Date(custom.from), to: new Date(custom.to) });
    return rangeFromPreset(preset);
  }, [preset, custom]);

  const a = useAdminAnalytics(range);

  const handleExportCsv = () => {
    const stamp = format(new Date(), "yyyyMMdd-HHmm");
    exportCsv(a.revenue, `revenue_${stamp}`);
    exportCsv(a.userGrowth, `user_growth_${stamp}`);
    exportCsv(a.planBreakdown, `plan_breakdown_${stamp}`);
    exportCsv(a.minutes, `minutes_${stamp}`);
    exportCsv(a.churn, `churn_${stamp}`);
    exportCsv(a.arpu, `arpu_${stamp}`);
    exportCsv(a.profitCost, `profit_cost_${stamp}`);
  };
  const handleExportPdf = () => {
    exportPdf("Fixsense Admin Analytics", [
      { heading: "Revenue", rows: a.revenue as any },
      { heading: "User Growth", rows: a.userGrowth as any },
      { heading: "Plan Breakdown", rows: a.planBreakdown as any },
      { heading: "Active Users", rows: a.activeUsers as any },
      { heading: "Churn Rate", rows: a.churn as any },
      { heading: "ARPU", rows: a.arpu as any },
      { heading: "Minutes Consumed", rows: a.minutes as any },
      { heading: "Extra-Minute Bundles", rows: a.extraMinutes as any },
      { heading: "Profit vs Cost", rows: a.profitCost as any },
    ], `admin-analytics-${format(new Date(), "yyyyMMdd-HHmm")}`);
  };
  const handleExportJson = () => exportJson({ range, ...a }, `admin-analytics-${format(new Date(), "yyyyMMdd-HHmm")}`);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border sticky top-0 bg-background/95 backdrop-blur z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center gap-3 justify-between">
          <div className="flex items-center gap-3">
            <Link to="/admin"><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" />Admin</Button></Link>
            <h1 className="text-lg font-semibold">Analytics</h1>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Tabs value={preset} onValueChange={(v) => setPreset(v as RangePreset)}>
              <TabsList className="h-9">
                <TabsTrigger value="7d">7d</TabsTrigger>
                <TabsTrigger value="30d">30d</TabsTrigger>
                <TabsTrigger value="90d">90d</TabsTrigger>
                <TabsTrigger value="1y">1y</TabsTrigger>
                <TabsTrigger value="custom">Custom</TabsTrigger>
              </TabsList>
            </Tabs>
            {preset === "custom" && (
              <div className="flex items-center gap-2">
                <Input type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} className="h-9 w-[140px]" />
                <span className="text-muted-foreground text-xs">to</span>
                <Input type="date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} className="h-9 w-[140px]" />
              </div>
            )}
            <Button variant="outline" size="sm" onClick={a.refresh}><RefreshCw className="h-4 w-4" /></Button>
            <Button variant="outline" size="sm" onClick={handleExportCsv}><FileSpreadsheet className="h-4 w-4 mr-1" />CSV</Button>
            <Button variant="outline" size="sm" onClick={handleExportPdf}><FileText className="h-4 w-4 mr-1" />PDF</Button>
            <Button variant="outline" size="sm" onClick={handleExportJson}><Download className="h-4 w-4 mr-1" />JSON</Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {a.loading && <div className="text-sm text-muted-foreground">Loading analytics…</div>}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard title="Revenue (MRR / monthly)" description="Successful payments per bucket">
            <ResponsiveContainer>
              <AreaChart data={a.revenue.map(r => ({ ...r, bucket: fmtBucket(r.bucket as string) }))}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="bucket" fontSize={11} /><YAxis fontSize={11} /><Tooltip />
                <Area type="monotone" dataKey="revenue" stroke={COLORS[0]} fill={COLORS[0]} fillOpacity={0.3} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="User Growth" description="New signups + cumulative">
            <ResponsiveContainer>
              <LineChart data={a.userGrowth.map(r => ({ ...r, bucket: fmtBucket(r.bucket as string) }))}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="bucket" fontSize={11} /><YAxis fontSize={11} /><Tooltip /><Legend />
                <Line type="monotone" dataKey="signups" stroke={COLORS[1]} />
                <Line type="monotone" dataKey="cumulative" stroke={COLORS[2]} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Subscription Plan Breakdown">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={a.planBreakdown} dataKey="count" nameKey="plan" outerRadius={90} label>
                  {a.planBreakdown.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip /><Legend />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Extra Minute Bundle Purchases">
            <ResponsiveContainer>
              <BarChart data={a.extraMinutes.map(r => ({ ...r, bucket: fmtBucket(r.bucket as string) }))}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="bucket" fontSize={11} /><YAxis fontSize={11} /><Tooltip /><Legend />
                <Bar dataKey="minutes" fill={COLORS[3]} />
                <Bar dataKey="revenue" fill={COLORS[0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Profit vs Cost" description="Monthly. Cost ≈ $0.05 / minute">
            <ResponsiveContainer>
              <BarChart data={a.profitCost.map(r => ({ ...r, bucket: fmtBucket(r.bucket as string) }))}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="bucket" fontSize={11} /><YAxis fontSize={11} /><Tooltip /><Legend />
                <Bar dataKey="cost" stackId="a" fill="#ef4444" />
                <Bar dataKey="profit" stackId="a" fill={COLORS[1]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Active Users" description="Distinct users with logged activity">
            <ResponsiveContainer>
              <LineChart data={a.activeUsers.map(r => ({ ...r, bucket: fmtBucket(r.bucket as string) }))}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="bucket" fontSize={11} /><YAxis fontSize={11} /><Tooltip />
                <Line type="monotone" dataKey="active_users" stroke={COLORS[4]} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Churn Rate (%)" description="Monthly canceled / total">
            <ResponsiveContainer>
              <LineChart data={a.churn.map(r => ({ ...r, bucket: fmtBucket(r.bucket as string) }))}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="bucket" fontSize={11} /><YAxis fontSize={11} unit="%" /><Tooltip />
                <Line type="monotone" dataKey="churn_rate" stroke="#ef4444" />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="ARPU" description="Avg revenue per paying user (monthly)">
            <ResponsiveContainer>
              <LineChart data={a.arpu.map(r => ({ ...r, bucket: fmtBucket(r.bucket as string) }))}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="bucket" fontSize={11} /><YAxis fontSize={11} /><Tooltip />
                <Line type="monotone" dataKey="arpu" stroke={COLORS[5]} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Meeting Minutes Consumed">
            <ResponsiveContainer>
              <AreaChart data={a.minutes.map(r => ({ ...r, bucket: fmtBucket(r.bucket as string) }))}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="bucket" fontSize={11} /><YAxis fontSize={11} /><Tooltip />
                <Area type="monotone" dataKey="minutes" stroke={COLORS[6]} fill={COLORS[6]} fillOpacity={0.3} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      </main>
    </div>
  );
}
