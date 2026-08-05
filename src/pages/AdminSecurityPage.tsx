import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft, RefreshCw, ShieldAlert, ShieldCheck, PlayCircle } from "lucide-react";

interface ScanRun {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  trigger_source: string;
  total_findings: number | null;
  new_findings: number | null;
  resolved_findings: number | null;
  error_text: string | null;
}

interface ScanFinding {
  id: string;
  run_id: string | null;
  finding_key: string;
  title: string;
  severity: string;
  category: string;
  detail: string;
  state: string;
  first_seen_at: string;
  last_seen_at: string;
  resolved_at: string | null;
}

const SEVERITY_ORDER = ["critical", "high", "medium", "low", "info"];

function severityVariant(sev: string): "destructive" | "secondary" | "outline" {
  if (sev === "critical" || sev === "high") return "destructive";
  if (sev === "medium") return "secondary";
  return "outline";
}

export default function AdminSecurityPage() {
  const [runs, setRuns] = useState<ScanRun[]>([]);
  const [findings, setFindings] = useState<ScanFinding[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [filter, setFilter] = useState<"open" | "new" | "resolved" | "all">("open");

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (supabase as any).rpc("admin_security_scan_overview", { _limit: 20 });
    if (error) {
      toast({ title: "Could not load scan results", description: error.message, variant: "destructive" });
    } else {
      setRuns((data?.runs ?? []) as ScanRun[]);
      setFindings((data?.findings ?? []) as ScanFinding[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const runScan = async () => {
    setScanning(true);
    try {
      const { data, error } = await supabase.functions.invoke("security-regression-scan", {
        body: { trigger: "manual" },
      });
      if (error) throw error;
      toast({
        title: "Scan complete",
        description: `${data?.total_findings ?? 0} findings · ${data?.new_findings ?? 0} new · ${data?.resolved_findings ?? 0} resolved`,
      });
      await load();
    } catch (e: any) {
      toast({ title: "Scan failed", description: e?.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setScanning(false);
    }
  };

  const latest = runs[0];

  const visible = useMemo(() => {
    const list = findings.filter((f) => {
      if (filter === "all") return true;
      if (filter === "open") return f.state !== "resolved";
      return f.state === filter;
    });
    return list.sort(
      (a, b) =>
        SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) ||
        b.last_seen_at.localeCompare(a.last_seen_at),
    );
  }, [findings, filter]);

  const counts = useMemo(() => {
    const open = findings.filter((f) => f.state !== "resolved");
    return {
      open: open.length,
      fresh: findings.filter((f) => f.state === "new").length,
      critical: open.filter((f) => f.severity === "critical").length,
      high: open.filter((f) => f.severity === "high").length,
    };
  }, [findings]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border sticky top-0 bg-background/95 backdrop-blur z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center gap-3 justify-between">
          <div className="flex items-center gap-3">
            <Link to="/admin"><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" />Admin</Button></Link>
            <h1 className="text-lg font-semibold">Security Scans</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button size="sm" onClick={runScan} disabled={scanning}>
              <PlayCircle className="h-4 w-4 mr-1" />
              {scanning ? "Scanning…" : "Run scan now"}
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Open findings", value: counts.open, icon: ShieldAlert },
            { label: "New since last scan", value: counts.fresh, icon: ShieldAlert },
            { label: "Critical", value: counts.critical, icon: ShieldAlert },
            { label: "High", value: counts.high, icon: ShieldCheck },
          ].map((s) => (
            <Card key={s.label}>
              <CardHeader className="pb-1">
                <CardDescription className="text-xs">{s.label}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold tabular-nums">{s.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Latest run</CardTitle>
            <CardDescription className="text-xs">
              The scan re-runs automatically after each deploy and on schedule; you can also run it on demand.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!latest ? (
              <p className="text-sm text-muted-foreground">
                No scan has run yet. Click “Run scan now” to create the first baseline.
              </p>
            ) : (
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                <span><span className="text-muted-foreground">When: </span>{format(new Date(latest.started_at), "PPp")}</span>
                <span><span className="text-muted-foreground">Trigger: </span>{latest.trigger_source}</span>
                <span><span className="text-muted-foreground">Status: </span>{latest.status}</span>
                <span><span className="text-muted-foreground">Findings: </span>{latest.total_findings ?? 0}</span>
                <span><span className="text-muted-foreground">New: </span>{latest.new_findings ?? 0}</span>
                <span><span className="text-muted-foreground">Resolved: </span>{latest.resolved_findings ?? 0}</span>
                {latest.error_text && <span className="text-destructive">{latest.error_text}</span>}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base">Findings</CardTitle>
              <CardDescription className="text-xs">Regressions detected by the automated scanner</CardDescription>
            </div>
            <div className="flex gap-1">
              {(["open", "new", "resolved", "all"] as const).map((f) => (
                <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>
                  {f}
                </Button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : visible.length === 0 ? (
              <p className="text-sm text-muted-foreground">No {filter} findings. 🎉</p>
            ) : (
              visible.map((f) => (
                <div key={f.id} className="rounded-lg border border-border px-3 py-2 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={severityVariant(f.severity)}>{f.severity}</Badge>
                    <Badge variant="outline">{f.category}</Badge>
                    {f.state === "new" && <Badge>new</Badge>}
                    {f.state === "resolved" && <Badge variant="outline">resolved</Badge>}
                    <span className="text-sm font-medium">{f.title}</span>
                  </div>
                  <p className="text-sm text-muted-foreground break-words">{f.detail}</p>
                  <p className="text-xs text-muted-foreground">
                    First seen {format(new Date(f.first_seen_at), "PP")} · last seen {format(new Date(f.last_seen_at), "PPp")}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Run history</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2 pr-4">Started</th>
                  <th className="py-2 pr-4">Trigger</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Total</th>
                  <th className="py-2 pr-4">New</th>
                  <th className="py-2">Resolved</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="py-2 pr-4">{format(new Date(r.started_at), "PPp")}</td>
                    <td className="py-2 pr-4">{r.trigger_source}</td>
                    <td className="py-2 pr-4">{r.status}</td>
                    <td className="py-2 pr-4 tabular-nums">{r.total_findings ?? 0}</td>
                    <td className="py-2 pr-4 tabular-nums">{r.new_findings ?? 0}</td>
                    <td className="py-2 tabular-nums">{r.resolved_findings ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
