import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { format } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { ArrowLeft, Pause, Play, RotateCcw } from "lucide-react";
import { useSessionReplay } from "@/hooks/useProductAnalytics";

const EVENT_STYLE: Record<string, { label: string; color: string }> = {
  page_view: { label: "Page view", color: "bg-primary" },
  click: { label: "Click", color: "bg-teal-400" },
  rage_click: { label: "Rage click", color: "bg-destructive" },
  dead_click: { label: "Dead click", color: "bg-amber-400" },
  scroll: { label: "Scroll", color: "bg-muted-foreground" },
  element_view: { label: "Element seen", color: "bg-violet-400" },
  form_submit: { label: "Form submit", color: "bg-emerald-400" },
  error: { label: "Error", color: "bg-destructive" },
};

export default function AdminSessionReplayPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { data, loading } = useSessionReplay(sessionId);
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const timer = useRef<number>();

  const events = data?.events ?? [];
  const session = data?.session;

  useEffect(() => {
    if (!playing || events.length === 0) return;
    timer.current = window.setInterval(() => {
      setCursor((c) => {
        if (c >= events.length - 1) { setPlaying(false); return c; }
        return c + 1;
      });
    }, Math.max(120, 700 / speed));
    return () => window.clearInterval(timer.current);
  }, [playing, speed, events.length]);

  const current = events[cursor];
  const visible = useMemo(() => events.slice(0, cursor + 1), [events, cursor]);
  const clicksSoFar = visible.filter((e: any) => ["click", "rage_click", "dead_click"].includes(e.event));
  const currentPath = [...visible].reverse().find((e: any) => e.path)?.path ?? session?.entry_path;
  const scrollNow = [...visible].reverse().find((e: any) => e.scroll_pct != null)?.scroll_pct ?? 0;

  const elapsed = current && events[0]
    ? Math.max(0, Math.round((new Date(current.ts).getTime() - new Date(events[0].ts).getTime()) / 1000))
    : 0;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border sticky top-0 bg-background/95 backdrop-blur z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center gap-3 justify-between">
          <div className="flex items-center gap-3">
            <Link to="/admin/product"><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" />Analytics</Button></Link>
            <div>
              <h1 className="text-lg font-semibold">Session replay</h1>
              <p className="text-xs text-muted-foreground">
                {session ? `${session.full_name || session.email || "Anonymous visitor"} · ${format(new Date(session.started_at), "PPp")}` : "—"}
              </p>
            </div>
          </div>
          {session && (
            <div className="flex flex-wrap gap-1">
              {[session.device, session.browser, session.os, session.country, session.timezone]
                .filter(Boolean)
                .map((v: string) => <Badge key={v} variant="outline">{v}</Badge>)}
            </div>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {loading && <p className="text-sm text-muted-foreground">Loading replay…</p>}
        {!loading && !session && <p className="text-sm text-muted-foreground">This session no longer exists.</p>}

        {session && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
              {[
                ["Duration", `${session.duration_ms ? Math.round(session.duration_ms / 1000) : 0}s`],
                ["Pages", session.page_views],
                ["Clicks", session.clicks],
                ["Rage clicks", session.rage_clicks],
                ["Dead clicks", session.dead_clicks],
                ["Errors", session.errors],
              ].map(([label, value]) => (
                <Card key={String(label)}>
                  <CardContent className="pt-4">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="text-xl font-semibold tabular-nums">{String(value)}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Replay viewport</CardTitle>
                <CardDescription className="text-xs">
                  Interaction playback: click positions, scroll depth and page changes as they happened
                  (no page content is recorded, for privacy)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="relative w-full aspect-[16/10] rounded-lg border border-border bg-muted/20 overflow-hidden">
                  <div className="absolute top-0 left-0 right-0 px-3 py-1.5 bg-background/80 border-b border-border text-xs truncate">
                    {currentPath}
                  </div>
                  <div
                    className="absolute left-0 right-0 h-0.5 bg-primary/60"
                    style={{ top: `${Math.min(99, scrollNow)}%` }}
                    title={`Scroll depth ${scrollNow}%`}
                  />
                  {clicksSoFar.map((e: any, i: number) => {
                    const isLast = i === clicksSoFar.length - 1;
                    const left = e.vw ? (e.x / e.vw) * 100 : 50;
                    const top = e.vh ? (e.y / e.vh) * 100 : 50;
                    const color =
                      e.event === "rage_click" ? "bg-destructive"
                      : e.event === "dead_click" ? "bg-amber-400" : "bg-teal-400";
                    return (
                      <div
                        key={e.id ?? i}
                        title={`${e.event} · ${e.label ?? e.selector ?? ""}`}
                        className={`absolute rounded-full ${color} ${isLast ? "ring-2 ring-foreground" : ""}`}
                        style={{
                          left: `${left}%`, top: `${top}%`,
                          width: isLast ? 18 : 10, height: isLast ? 18 : 10,
                          opacity: isLast ? 1 : 0.35,
                          transform: "translate(-50%, -50%)",
                        }}
                      />
                    );
                  })}
                  {current && (
                    <div className="absolute bottom-2 left-2 right-2 rounded bg-background/90 px-2 py-1 text-xs">
                      <span className="font-medium">{EVENT_STYLE[current.event]?.label ?? current.event}</span>
                      {current.label && <span className="text-muted-foreground"> · {current.label}</span>}
                      {current.metadata?.message && <span className="text-destructive"> · {String(current.metadata.message)}</span>}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <Button size="sm" onClick={() => setPlaying((p) => !p)} disabled={events.length === 0}>
                    {playing ? <Pause className="h-4 w-4 mr-1" /> : <Play className="h-4 w-4 mr-1" />}
                    {playing ? "Pause" : "Play"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => { setCursor(0); setPlaying(false); }}>
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                  {[1, 2, 4].map((s) => (
                    <Button key={s} size="sm" variant={speed === s ? "default" : "outline"} onClick={() => setSpeed(s)}>
                      {s}×
                    </Button>
                  ))}
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {cursor + 1}/{events.length} · +{elapsed}s
                  </span>
                  <div className="flex-1 min-w-[200px]">
                    <Slider
                      value={[cursor]}
                      max={Math.max(0, events.length - 1)}
                      step={1}
                      onValueChange={([v]) => { setCursor(v); setPlaying(false); }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Event timeline</CardTitle></CardHeader>
              <CardContent className="max-h-[420px] overflow-y-auto space-y-1">
                {events.map((e: any, i: number) => (
                  <button
                    key={e.id ?? i}
                    onClick={() => { setCursor(i); setPlaying(false); }}
                    className={`w-full text-left flex items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-muted ${i === cursor ? "bg-muted" : ""}`}
                  >
                    <span className={`h-2 w-2 rounded-full ${EVENT_STYLE[e.event]?.color ?? "bg-muted-foreground"}`} />
                    <span className="w-[92px] shrink-0 text-muted-foreground">{format(new Date(e.ts), "HH:mm:ss")}</span>
                    <span className="w-[96px] shrink-0">{EVENT_STYLE[e.event]?.label ?? e.event}</span>
                    <span className="truncate">{e.label ?? e.selector ?? e.path}</span>
                    {e.scroll_pct != null && <span className="ml-auto text-muted-foreground">{e.scroll_pct}%</span>}
                  </button>
                ))}
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
