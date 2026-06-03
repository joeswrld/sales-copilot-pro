import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Download, RefreshCw, Search } from "lucide-react";
import { useAuditLogs, type AuditLog } from "@/hooks/useAuditLogs";
import { exportCsv } from "@/lib/adminExport";
import { supabase } from "@/integrations/supabase/client";

const SEVERITY_COLORS: Record<string, string> = {
  info: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  warn: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  error: "bg-orange-500/15 text-orange-300 border-orange-500/30",
  critical: "bg-red-500/15 text-red-300 border-red-500/30",
};

function RiskBadge({ score }: { score: number }) {
  const tone =
    score >= 70 ? "bg-red-500/15 text-red-300 border-red-500/30" :
    score >= 40 ? "bg-amber-500/15 text-amber-300 border-amber-500/30" :
    score > 0   ? "bg-sky-500/15 text-sky-300 border-sky-500/30" :
                  "bg-muted text-muted-foreground border-border";
  return <Badge variant="outline" className={tone}>{score}</Badge>;
}

const ACTION_GROUPS = ["auth", "billing", "meeting", "message", "team", "deal", "profile", "security", "ai", "file"];

export default function AdminActivityPage() {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [groups, setGroups] = useState<string[]>([]);
  const [severities, setSeverities] = useState<string[]>([]);
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [selected, setSelected] = useState<AuditLog | null>(null);
  const [userTimeline, setUserTimeline] = useState<AuditLog[]>([]);

  // Debounce search
  useMemo(() => { const t = setTimeout(() => setDebounced(search), 300); return () => clearTimeout(t); }, [search]);

  const filters = useMemo(() => ({
    search: debounced || undefined,
    severities: severities.length ? severities : undefined,
    from: from ? new Date(from) : undefined,
    to: to ? new Date(to + "T23:59:59") : undefined,
  }), [debounced, severities, from, to]);

  const { logs: rawLogs, loading, hasMore, loadMore, refresh } = useAuditLogs(filters);

  const logs = useMemo(
    () => (groups.length ? rawLogs.filter(l => groups.some(g => l.action.startsWith(g))) : rawLogs),
    [rawLogs, groups],
  );

  const openUser = async (log: AuditLog) => {
    setSelected(log);
    if (!log.user_id) return;
    const { data } = await (supabase as any).rpc("get_user_activity", { _user_id: log.user_id, _limit: 100 });
    setUserTimeline((data as AuditLog[]) || []);
  };

  const toggle = (arr: string[], setArr: (s: string[]) => void, v: string) =>
    setArr(arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border sticky top-0 bg-background/95 backdrop-blur z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center gap-3 justify-between">
          <div className="flex items-center gap-3">
            <Link to="/admin"><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" />Admin</Button></Link>
            <h1 className="text-lg font-semibold">User Activity Center</h1>
            <Badge variant="outline" className="gap-1"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />Live</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={refresh}><RefreshCw className="h-4 w-4" /></Button>
            <Button variant="outline" size="sm" onClick={() => exportCsv(logs as any, `activity-${format(new Date(), "yyyyMMdd-HHmm")}`)}>
              <Download className="h-4 w-4 mr-1" />Export CSV
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-4 space-y-4">
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
              <div className="relative md:col-span-2">
                <Search className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                <Input className="pl-9" placeholder="Search by email, action, user id, target…" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="text-muted-foreground self-center mr-1">Category:</span>
              {ACTION_GROUPS.map(g => (
                <button key={g}
                  onClick={() => toggle(groups, setGroups, g)}
                  className={`px-2 py-1 rounded border ${groups.includes(g) ? "bg-primary/15 border-primary/40 text-primary" : "border-border text-muted-foreground"}`}>
                  {g}
                </button>
              ))}
              <span className="text-muted-foreground self-center mx-1">·</span>
              <span className="text-muted-foreground self-center mr-1">Severity:</span>
              {["info","warn","error","critical"].map(s => (
                <button key={s}
                  onClick={() => toggle(severities, setSeverities, s)}
                  className={`px-2 py-1 rounded border ${severities.includes(s) ? "bg-primary/15 border-primary/40 text-primary" : "border-border text-muted-foreground"}`}>
                  {s}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <div className="max-h-[70vh] overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead className="w-[150px]">Time</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead className="hidden md:table-cell">IP</TableHead>
                    <TableHead className="hidden lg:table-cell">Browser / Device</TableHead>
                    <TableHead className="hidden lg:table-cell">Location</TableHead>
                    <TableHead className="text-right">Risk</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map(l => (
                    <TableRow key={l.id} className="cursor-pointer" onClick={() => openUser(l)}>
                      <TableCell className="text-xs whitespace-nowrap">{format(new Date(l.created_at), "MMM d, HH:mm:ss")}</TableCell>
                      <TableCell className="text-xs">
                        <div className="font-medium truncate max-w-[180px]">{l.actor_email || "—"}</div>
                        <div className="text-muted-foreground truncate max-w-[180px]">{l.user_id?.slice(0, 8) || ""}</div>
                      </TableCell>
                      <TableCell className="text-xs"><code className="text-[11px]">{l.action}</code></TableCell>
                      <TableCell><Badge variant="outline" className={SEVERITY_COLORS[l.severity]}>{l.severity}</Badge></TableCell>
                      <TableCell className="text-xs hidden md:table-cell">{l.ip_address || "—"}</TableCell>
                      <TableCell className="text-xs hidden lg:table-cell">{[l.browser, l.device].filter(Boolean).join(" · ") || "—"}</TableCell>
                      <TableCell className="text-xs hidden lg:table-cell">{[l.city, l.country].filter(Boolean).join(", ") || "—"}</TableCell>
                      <TableCell className="text-right"><RiskBadge score={l.risk_score} /></TableCell>
                    </TableRow>
                  ))}
                  {!logs.length && !loading && (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No activity matches your filters</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            <div className="p-3 border-t border-border flex items-center justify-between">
              <div className="text-xs text-muted-foreground">{logs.length} rows {loading && "· loading…"}</div>
              <Button variant="outline" size="sm" disabled={!hasMore} onClick={loadMore}>Load more</Button>
            </div>
          </CardContent>
        </Card>
      </main>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{selected?.actor_email || selected?.user_id?.slice(0, 8)}</SheetTitle>
          </SheetHeader>
          {selected && (
            <div className="mt-4 space-y-4">
              <Card>
                <CardContent className="p-4 text-xs space-y-1">
                  <div><span className="text-muted-foreground">Action:</span> <code>{selected.action}</code></div>
                  <div><span className="text-muted-foreground">Severity:</span> {selected.severity}</div>
                  <div><span className="text-muted-foreground">IP:</span> {selected.ip_address || "—"}</div>
                  <div><span className="text-muted-foreground">Browser:</span> {selected.browser || "—"}</div>
                  <div><span className="text-muted-foreground">Device:</span> {selected.device || "—"}</div>
                  <div><span className="text-muted-foreground">Location:</span> {[selected.city, selected.country].filter(Boolean).join(", ") || "—"}</div>
                  <div><span className="text-muted-foreground">Risk:</span> <RiskBadge score={selected.risk_score} /></div>
                  <pre className="mt-2 text-[10px] bg-muted p-2 rounded overflow-x-auto">{JSON.stringify(selected.details, null, 2)}</pre>
                </CardContent>
              </Card>
              <div>
                <div className="text-sm font-medium mb-2">Recent activity for this user</div>
                <div className="space-y-1 max-h-[50vh] overflow-y-auto">
                  {userTimeline.map(t => (
                    <div key={t.id} className="text-xs flex items-center justify-between border border-border rounded px-2 py-1">
                      <div><code className="text-[11px]">{t.action}</code> <span className="text-muted-foreground ml-2">{format(new Date(t.created_at), "MMM d HH:mm")}</span></div>
                      <Badge variant="outline" className={SEVERITY_COLORS[t.severity]}>{t.severity}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
