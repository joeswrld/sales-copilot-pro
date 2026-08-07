import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft, RefreshCw, PlayCircle, MousePointerClick, AlertTriangle,
  Flame, Timer, Users, TrendingDown, Download,
} from "lucide-react";
import {
  rangeFromPreset, RANGE_LABELS, type RangePreset, type AnalyticsRange,
} from "@/hooks/useAdminAnalytics";
import {
  useProductAnalytics, emptyFilters, type PAFilters,
} from "@/hooks/useProductAnalytics";
import { exportCsv, exportJson } from "@/lib/adminExport";

const ALL = "__all__";
const PRESETS: RangePreset[] = ["today", "yesterday", "7d", "30d", "1m", "1y", "5y", "10y"];

const fmtBucket = (s: string, bucket: string) => {
  try {
    const d = new Date(s);
    if (bucket === "hour") return format(d, "HH:mm");
    if (bucket === "year") return format(d, "yyyy");
    if (bucket === "month") return format(d, "MMM yy");
    return format(d, "MMM d");
  } catch { return s; }
};

function Metric({ label, value, sub, icon: Icon, tone }: {
  label: string; value: string | number; sub?: string;
  icon: React.ComponentType<{ className?: string }>; tone?: "danger" | "warn";
}) {
  return (
    <Card>
      <CardContent className="pt-5 space-y-1">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">{label}</p>
          <Icon className={`h-4 w-4 ${tone === "danger" ? "text-destructive" : tone === "warn" ? "text-amber-500" : "text-muted-foreground"}`} />
        </div>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

/** Click / rage / dead-click density map rendered on a normalised viewport grid. */
function HeatCanvas({ points }: { points: { gx: number; gy: number; kind: string; hits: number; top_label: string | null }[] }) {
  const max = Math.max(1, ...points.map((p) => p.hits));
  return (
    <div className="relative w-full aspect-[16/10] rounded-lg border border-border bg-muted/30 overflow-hidden">
      {points.map((p, i) => {
        const intensity = p.hits / max;
        const color =
          p.kind === "rage" ? `rgba(239,68,68,${0.25 + intensity * 0.6})`
          : p.kind === "dead" ? `rgba(251,191,36,${0.25 + intensity * 0.6})`
          : `rgba(45,212,191,${0.2 + intensity * 0.6})`;
        return (
          <div
            key={i}
            title={`${p.kind} · ${p.hits} hits${p.top_label ? ` · ${p.top_label}` : ""}`}
            className="absolute rounded-full"
            style={{
              left: `${(p.gx / 40) * 100}%`,
              top: `${(p.gy / 40) * 100}%`,
              width: `${4 + intensity * 6}%`,
              height: `${5 + intensity * 8}%`,
              background: color,
              filter: "blur(6px)",
              transform: "translate(-50%, -50%)",
            }}
          />
        );
      })}
      {points.length === 0 && (
        <div className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">
          No clicks recorded for this page yet
        </div>
      )}
      <div className="absolute bottom-2 right-2 flex gap-3 text-[10px] text-muted-foreground bg-background/80 rounded px-2 py-1">
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-teal-400" />clicks</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400" />dead</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" />rage</span>
      </div>
    </div>
  );
}

export default function AdminProductAnalyticsPage() {
  const [preset, setPreset] = useState<RangePreset>("7d");
  const [custom, setCustom] = useState({
    from: new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10),
    to: new Date().toISOString().slice(0, 10),
  });
  const [filters, setFilters] = useState<PAFilters>(emptyFilters);
  const [heatPath, setHeatPath] = useState<string | null>(null);

  const range: AnalyticsRange = useMemo(
    () => (preset === "custom"
      ? rangeFromPreset("custom", { from: new Date(custom.from), to: new Date(custom.to) })
      : rangeFromPreset(preset)),
    [preset, custom],
  );

  const a = useProductAnalytics(range, filters, heatPath);

  const setF = (k: keyof PAFilters, v: any) => setFilters((p) => ({ ...p, [k]: v }));
  const pathOptions = useMemo(
    () => Array.from(new Set([...(a.options.paths ?? []), ...a.pages.map((p) => p.path)])).filter(Boolean).sort(),
    [a.options.paths, a.pages],
  );

  const dropOff = useMemo(
    () => [...a.pages].sort((x, y) => y.exit_rate - x.exit_rate).slice(0, 8),
    [a.pages],
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border sticky top-0 bg-background/95 backdrop-blur z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 space-y-3">
          <div className="flex flex-wrap items-center gap-3 justify-between">
            <div className="flex items-center gap-3">
              <Link to="/admin"><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" />Admin</Button></Link>
              <div>
                <h1 className="text-lg font-semibold">Product Analytics & Session Replay</h1>
                <p className="text-xs text-muted-foreground">Where users stop, struggle and convert</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={preset} onValueChange={(v) => setPreset(v as RangePreset)}>
                <SelectTrigger className="h-9 w-[130px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRESETS.map((p) => (
                    <SelectItem key={p} value={p}>{RANGE_LABELS[p as keyof typeof RANGE_LABELS]}</SelectItem>
                  ))}
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
              {preset === "custom" && (
                <>
                  <Input type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} className="h-9 w-[140px]" />
                  <Input type="date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} className="h-9 w-[140px]" />
                </>
              )}
              <Button variant="outline" size="sm" onClick={a.refresh}><RefreshCw className="h-4 w-4" /></Button>
              <Button variant="outline" size="sm" onClick={() => exportCsv(a.sessions as any, `sessions-${format(new Date(), "yyyyMMdd-HHmm")}`)}>
                <Download className="h-4 w-4 mr-1" />CSV
              </Button>
              <Button variant="outline" size="sm" onClick={() => exportJson({ range, ...a }, `product-analytics-${format(new Date(), "yyyyMMdd-HHmm")}`)}>
                JSON
              </Button>
            </div>
          </div>

          {/* filters */}
          <div className="flex flex-wrap items-center gap-2">
            {([
              ["device", "Device", a.options.devices],
              ["browser", "Browser", a.options.browsers],
              ["country", "Country", a.options.countries],
            ] as const).map(([key, label, opts]) => (
              <Select
                key={key}
                value={(filters[key] as string) ?? ALL}
                onValueChange={(v) => setF(key, v === ALL ? null : v)}
              >
                <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue placeholder={label} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All {label.toLowerCase()}s</SelectItem>
                  {opts.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
            ))}
            <Select value={filters.path ?? ALL} onValueChange={(v) => setF("path", v === ALL ? null : v)}>
              <SelectTrigger className="h-8 w-[180px] text-xs"><SelectValue placeholder="Page" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All pages</SelectItem>
                {pathOptions.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input
              placeholder="Filter by user id…"
              value={filters.user ?? ""}
              onChange={(e) => setF("user", e.target.value.trim() || null)}
              className="h-8 w-[220px] text-xs"
            />
            <div className="flex items-center gap-2">
              <Switch id="friction" checked={filters.frictionOnly} onCheckedChange={(v) => setF("frictionOnly", v)} />
              <Label htmlFor="friction" className="text-xs">Friction sessions only</Label>
            </div>
            {(filters.device || filters.browser || filters.country || filters.path || filters.user || filters.frictionOnly) && (
              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setFilters(emptyFilters)}>Clear</Button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {a.error && (
          <Card className="border-destructive/50">
            <CardContent className="pt-5 text-sm text-destructive">{a.error}</CardContent>
          </Card>
        )}
        {a.loading && <p className="text-sm text-muted-foreground">Loading analytics…</p>}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Metric label="Sessions" value={a.overview?.sessions ?? 0} sub={`${a.overview?.page_views ?? 0} page views`} icon={Users} />
          <Metric label="Avg session duration" value={`${Math.round(Number(a.overview?.avg_duration_sec ?? 0))}s`} sub={`${a.overview?.avg_scroll_pct ?? 0}% avg scroll`} icon={Timer} />
          <Metric label="Bounce rate" value={`${a.overview?.bounce_rate ?? 0}%`} sub="single-page sessions" icon={TrendingDown} tone="warn" />
          <Metric label="Signed-in conversion" value={`${a.overview?.conversion_rate ?? 0}%`} sub={`${a.overview?.users ?? 0} identified users`} icon={MousePointerClick} />
          <Metric label="Rage clicks" value={a.overview?.rage_clicks ?? 0} sub="repeated frustrated clicks" icon={Flame} tone="danger" />
          <Metric label="Dead clicks" value={a.overview?.dead_clicks ?? 0} sub="clicks with no effect" icon={MousePointerClick} tone="warn" />
          <Metric label="JS errors" value={a.overview?.errors ?? 0} sub="captured in sessions" icon={AlertTriangle} tone="danger" />
          <Metric label="Total clicks" value={a.overview?.clicks ?? 0} icon={MousePointerClick} />
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Activity & friction over time</CardTitle>
            <CardDescription className="text-xs">Sessions and page views vs rage clicks, dead clicks and errors</CardDescription>
          </CardHeader>
          <CardContent className="h-[280px] -ml-4">
            <ResponsiveContainer>
              <AreaChart data={a.series.map((r) => ({ ...r, bucket: fmtBucket(r.bucket, range.bucket) }))}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="bucket" fontSize={11} /><YAxis fontSize={11} /><Tooltip /><Legend />
                <Area type="monotone" dataKey="sessions" name="Sessions" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.25} />
                <Area type="monotone" dataKey="page_views" name="Page views" stroke="#a78bfa" fill="#a78bfa" fillOpacity={0.15} />
                <Area type="monotone" dataKey="rage_clicks" name="Rage clicks" stroke="#ef4444" fill="#ef4444" fillOpacity={0.2} />
                <Area type="monotone" dataKey="dead_clicks" name="Dead clicks" stroke="#fbbf24" fill="#fbbf24" fillOpacity={0.2} />
                <Area type="monotone" dataKey="errors" name="Errors" stroke="#fb923c" fill="#fb923c" fillOpacity={0.2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Tabs defaultValue="sessions">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="sessions">Session replays</TabsTrigger>
            <TabsTrigger value="pages">Pages & drop-off</TabsTrigger>
            <TabsTrigger value="heatmap">Heatmaps</TabsTrigger>
            <TabsTrigger value="friction">Friction</TabsTrigger>
            <TabsTrigger value="ignored">Ignored buttons</TabsTrigger>
            <TabsTrigger value="journeys">User journeys</TabsTrigger>
          </TabsList>

          {/* ── SESSION REPLAYS ─────────────────────────────────── */}
          <TabsContent value="sessions" className="mt-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Recorded sessions</CardTitle>
                <CardDescription className="text-xs">
                  Every session has a replay link that plays back the recorded interaction timeline
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {a.sessions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No sessions recorded for these filters.</p>
                ) : a.sessions.map((s) => (
                  <div key={s.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border px-3 py-2">
                    <div className="min-w-[170px]">
                      <p className="text-sm font-medium">{s.full_name || s.email || "Anonymous visitor"}</p>
                      <p className="text-xs text-muted-foreground">{format(new Date(s.started_at), "PPp")}</p>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {s.device && <Badge variant="outline">{s.device}</Badge>}
                      {s.browser && <Badge variant="outline">{s.browser}</Badge>}
                      {s.os && <Badge variant="outline">{s.os}</Badge>}
                      {s.country && <Badge variant="outline">{s.country}</Badge>}
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                      <span>{s.duration_sec}s</span>
                      <span>{s.page_views} pages</span>
                      <span>{s.clicks} clicks</span>
                      <span>{s.max_scroll_pct}% scroll</span>
                      {s.rage_clicks > 0 && <span className="text-destructive">{s.rage_clicks} rage</span>}
                      {s.dead_clicks > 0 && <span className="text-amber-500">{s.dead_clicks} dead</span>}
                      {s.errors > 0 && <span className="text-destructive">{s.errors} errors</span>}
                    </div>
                    <div className="text-xs text-muted-foreground truncate max-w-[220px]">
                      {s.entry_path} → {s.exit_path}
                    </div>
                    <Link to={`/admin/product/session/${s.id}`} className="ml-auto">
                      <Button size="sm" variant="outline"><PlayCircle className="h-4 w-4 mr-1" />Replay</Button>
                    </Link>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── PAGES ───────────────────────────────────────────── */}
          <TabsContent value="pages" className="mt-4 space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Highest drop-off pages</CardTitle>
                <CardDescription className="text-xs">Where visitors stop and leave</CardDescription>
              </CardHeader>
              <CardContent className="h-[280px] -ml-4">
                <ResponsiveContainer>
                  <BarChart data={dropOff} layout="vertical" margin={{ left: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis type="number" fontSize={11} unit="%" />
                    <YAxis type="category" dataKey="path" width={160} fontSize={10} />
                    <Tooltip /><Bar dataKey="exit_rate" name="Exit rate" fill="#ef4444" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Page performance</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase text-muted-foreground">
                      <th className="py-2 pr-4">Page</th><th className="py-2 pr-4">Views</th>
                      <th className="py-2 pr-4">Sessions</th><th className="py-2 pr-4">Exits</th>
                      <th className="py-2 pr-4">Exit rate</th><th className="py-2 pr-4">Scroll</th>
                      <th className="py-2 pr-4">Rage</th><th className="py-2 pr-4">Dead</th>
                      <th className="py-2 pr-4">Errors</th><th className="py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {a.pages.map((p) => (
                      <tr key={p.path} className="border-t border-border">
                        <td className="py-2 pr-4 max-w-[240px] truncate">{p.path}</td>
                        <td className="py-2 pr-4 tabular-nums">{p.views}</td>
                        <td className="py-2 pr-4 tabular-nums">{p.sessions}</td>
                        <td className="py-2 pr-4 tabular-nums">{p.exits}</td>
                        <td className="py-2 pr-4 tabular-nums">{p.exit_rate}%</td>
                        <td className="py-2 pr-4 tabular-nums">{p.avg_scroll_pct}%</td>
                        <td className="py-2 pr-4 tabular-nums">{p.rage_clicks}</td>
                        <td className="py-2 pr-4 tabular-nums">{p.dead_clicks}</td>
                        <td className="py-2 pr-4 tabular-nums">{p.errors}</td>
                        <td className="py-2">
                          <Button size="sm" variant="ghost" className="text-xs" onClick={() => setHeatPath(p.path)}>
                            Heatmap
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── HEATMAP ─────────────────────────────────────────── */}
          <TabsContent value="heatmap" className="mt-4 space-y-4">
            <Card>
              <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle className="text-base">Click map</CardTitle>
                  <CardDescription className="text-xs">
                    Click density on a normalised viewport — teal = clicks, amber = dead clicks, red = rage clicks
                  </CardDescription>
                </div>
                <Select value={heatPath ?? ALL} onValueChange={(v) => setHeatPath(v === ALL ? null : v)}>
                  <SelectTrigger className="h-8 w-[200px] text-xs"><SelectValue placeholder="All pages" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All pages combined</SelectItem>
                    {pathOptions.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </CardHeader>
              <CardContent><HeatCanvas points={a.clickMap} /></CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Scroll depth</CardTitle>
                <CardDescription className="text-xs">Share of sessions that reached each depth of {heatPath ?? "all pages"}</CardDescription>
              </CardHeader>
              <CardContent className="h-[280px] -ml-4">
                <ResponsiveContainer>
                  <BarChart data={a.scroll}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="depth_pct" unit="%" fontSize={11} />
                    <YAxis fontSize={11} unit="%" /><Tooltip />
                    <Bar dataKey="reach_pct" name="Sessions reaching" fill="hsl(var(--primary))" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── FRICTION ────────────────────────────────────────── */}
          <TabsContent value="friction" className="mt-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Recurring friction points</CardTitle>
                <CardDescription className="text-xs">Rage clicks, dead clicks and errors ranked by frequency</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {a.friction.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No friction detected in this period. 🎉</p>
                ) : a.friction.map((f, i) => (
                  <div key={i} className="rounded-lg border border-border px-3 py-2 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={f.kind === "Dead click" ? "secondary" : "destructive"}>{f.kind}</Badge>
                      <span className="text-sm font-medium">{f.label || f.selector || "(unknown element)"}</span>
                      <span className="text-xs text-muted-foreground">{f.path}</span>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {f.occurrences}× across {f.sessions} sessions
                      </span>
                    </div>
                    {f.sample && f.sample !== f.label && (
                      <p className="text-xs text-muted-foreground break-words">{f.sample}</p>
                    )}
                    {f.path && (
                      <Button size="sm" variant="ghost" className="h-7 text-xs px-0"
                        onClick={() => { setF("path", f.path); setHeatPath(f.path); }}>
                        Filter sessions on this page
                      </Button>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── IGNORED ─────────────────────────────────────────── */}
          <TabsContent value="ignored" className="mt-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Ignored buttons & links</CardTitle>
                <CardDescription className="text-xs">
                  Elements that were seen by visitors but rarely clicked — candidates for copy or placement changes
                </CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {a.ignored.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Not enough impressions recorded yet.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase text-muted-foreground">
                        <th className="py-2 pr-4">Element</th><th className="py-2 pr-4">Page</th>
                        <th className="py-2 pr-4">Seen by</th><th className="py-2 pr-4">Clicked by</th>
                        <th className="py-2">Click rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {a.ignored.map((r, i) => (
                        <tr key={i} className="border-t border-border">
                          <td className="py-2 pr-4 max-w-[260px] truncate">{r.label || r.selector}</td>
                          <td className="py-2 pr-4 max-w-[180px] truncate">{r.path}</td>
                          <td className="py-2 pr-4 tabular-nums">{r.seen}</td>
                          <td className="py-2 pr-4 tabular-nums">{r.clicked}</td>
                          <td className="py-2 tabular-nums">{r.click_rate}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── JOURNEYS ────────────────────────────────────────── */}
          <TabsContent value="journeys" className="mt-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">User journeys</CardTitle>
                <CardDescription className="text-xs">Most common page-to-page transitions; “(exit)” means the visitor left</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {a.journeys.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No navigation recorded yet.</p>
                ) : a.journeys.map((j, i) => {
                  const max = Math.max(...a.journeys.map((x) => x.transitions));
                  return (
                    <div key={i} className="space-y-1">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="truncate max-w-[38%]">{j.from_path}</span>
                        <span className="text-muted-foreground">→</span>
                        <span className={`truncate max-w-[38%] ${j.to_path === "(exit)" ? "text-destructive" : ""}`}>{j.to_path}</span>
                        <span className="ml-auto tabular-nums text-muted-foreground">{j.transitions}</span>
                      </div>
                      <div className="h-1.5 rounded bg-muted overflow-hidden">
                        <div
                          className={j.to_path === "(exit)" ? "h-full bg-destructive" : "h-full bg-primary"}
                          style={{ width: `${(j.transitions / max) * 100}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
