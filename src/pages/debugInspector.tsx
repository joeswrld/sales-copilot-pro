import { useEffect, useRef, useState, useCallback } from "react";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useAuth } from "@/contexts/AuthContext";

/* ─── Types ────────────────────────────────────────────────────────────────── */

type LogLevel = "log" | "info" | "warn" | "error" | "debug";

type ConsoleEntry = {
  id: number;
  kind: "console" | "runtime" | "promise" | "network" | "build" | "navigation";
  level: LogLevel;
  page: string;
  time: number;
  message: string;
  detail?: string;
  count: number;
  source?: string;
};

/* ─── Shared Store ─────────────────────────────────────────────────────────── */

let _id = 0;
const store: ConsoleEntry[] = [];
const listeners = new Set<() => void>();

function emit(entry: Omit<ConsoleEntry, "id" | "count">) {
  const last = store[store.length - 1];
  if (last && last.message === entry.message && last.kind === entry.kind) {
    last.count++;
    last.time = entry.time;
  } else {
    store.push({ ...entry, id: _id++, count: 1 });
    if (store.length > 500) store.shift();
  }
  listeners.forEach(fn => fn());
}

function now() { return Date.now(); }
function page() { return window.location.pathname; }

function serialize(args: unknown[]): { message: string; detail?: string } {
  const parts = args.map(a => {
    if (typeof a === "string") return a;
    try { return JSON.stringify(a, null, 2); } catch { return String(a); }
  });
  const joined = parts.join(" ");
  const lines = joined.split("\n");
  if (lines.length <= 1) return { message: joined };
  return { message: lines[0], detail: lines.slice(1).join("\n") };
}

/* ─── Patch Console ────────────────────────────────────────────────────────── */

(["log", "info", "warn", "error", "debug"] as LogLevel[]).forEach(level => {
  const orig = (console as any)[level].bind(console);
  (console as any)[level] = (...args: unknown[]) => {
    orig(...args);
    const { message, detail } = serialize(args);
    emit({ kind: "console", level, page: page(), time: now(), message, detail });
  };
});

/* ─── Patch Runtime Errors ─────────────────────────────────────────────────── */

window.addEventListener("error", (e) => {
  emit({
    kind: "runtime",
    level: "error",
    page: page(),
    time: now(),
    message: e.message || "Unknown error",
    detail: e.error?.stack,
    source: e.filename ? `${e.filename.split("/").pop()}:${e.lineno}:${e.colno}` : undefined,
  });
});

window.addEventListener("unhandledrejection", (e) => {
  const msg = e.reason?.message || String(e.reason) || "Unhandled promise rejection";
  emit({
    kind: "promise",
    level: "error",
    page: page(),
    time: now(),
    message: msg,
    detail: e.reason?.stack,
  });
});

/* ─── Patch Fetch ──────────────────────────────────────────────────────────── */

const _fetch = window.fetch.bind(window);
window.fetch = async (...args) => {
  const url = typeof args[0] === "string" ? args[0] : (args[0] as Request).url;
  const shortUrl = url.replace(window.location.origin, "");
  try {
    const res = await _fetch(...args);
    if (!res.ok) {
      const clone = res.clone();
      let body = "";
      try { body = await clone.text(); } catch {}
      emit({
        kind: "network",
        level: "error",
        page: page(),
        time: now(),
        message: `${res.status} ${res.statusText} — ${shortUrl}`,
        detail: body.slice(0, 1000),
        source: shortUrl,
      });
    }
    return res;
  } catch (err: any) {
    emit({
      kind: "network",
      level: "error",
      page: page(),
      time: now(),
      message: `Network error — ${shortUrl}`,
      detail: err?.message,
      source: shortUrl,
    });
    throw err;
  }
};

/* ─── Vite HMR build errors ────────────────────────────────────────────────── */

try {
  (import.meta as any).hot?.on("vite:error", (data: any) => {
    emit({
      kind: "build",
      level: "error",
      page: page(),
      time: now(),
      message: data?.err?.message || "Build error",
      detail: data?.err?.stack || data?.err?.frame,
      source: data?.err?.loc
        ? `${data.err.id?.split("/").pop()}:${data.err.loc.line}:${data.err.loc.column}`
        : data?.err?.id?.split("/").pop(),
    });
  });
  (import.meta as any).hot?.on("vite:beforeUpdate", () => {
    emit({ kind: "build", level: "info", page: page(), time: now(), message: "Hot module update" });
  });
} catch {}

/* ─── Constants ────────────────────────────────────────────────────────────── */

const TABS = ["all", "errors", "warnings", "logs", "network"] as const;
type Tab = typeof TABS[number];

const LEVEL_COLOR: Record<LogLevel, string> = {
  error: "#f87171",
  warn:  "#fbbf24",
  info:  "#60a5fa",
  log:   "#e2e8f0",
  debug: "#94a3b8",
};

const KIND_LABEL: Record<ConsoleEntry["kind"], string> = {
  console: "", runtime: "runtime", promise: "promise",
  network: "fetch", build: "build", navigation: "nav",
};

function fmt(ts: number) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}:${String(d.getSeconds()).padStart(2,"0")}.${String(d.getMilliseconds()).padStart(3,"0")}`;
}

function formatForCopy(list: ConsoleEntry[]) {
  return list.map(e =>
    `[${fmt(e.time)}] [${e.level.toUpperCase()}]${e.kind !== "console" ? ` [${KIND_LABEL[e.kind] || e.kind}]` : ""}${e.source ? ` (${e.source})` : ""} ${e.message}${e.detail ? "\n" + e.detail : ""}`
  ).join("\n\n");
}

/* ─── Admin gate wrapper ───────────────────────────────────────────────────── */

export const DebugInspector = () => {
  const { user } = useAuth();
  const { isAdmin, loading } = useIsAdmin();

  // Don't mount the panel at all for non-admins.
  // While loading, render nothing to avoid flicker.
  if (!user || loading || !isAdmin) return null;

  return <DebugInspectorPanel />;
};

/* ─── Inner panel (only mounts for admins) ─────────────────────────────────── */

function DebugInspectorPanel() {
  const [open, setOpen]             = useState(false);
  const [tab, setTab]               = useState<Tab>("all");
  const [filter, setFilter]         = useState("");
  const [expanded, setExpanded]     = useState<Set<number>>(new Set());
  const [entries, setEntries]       = useState<ConsoleEntry[]>([]);
  const [height, setHeight]         = useState(340);
  const [autoScroll, setAutoScroll] = useState(true);
  const [pageOnly, setPageOnly]     = useState(false);
  const [copied, setCopied]         = useState<"filtered" | "all" | null>(null);
  const [isMobile, setIsMobile]     = useState(() => window.innerWidth < 600);

  const listRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startY: number; startH: number } | null>(null);

  /* subscribe to store */
  useEffect(() => {
    const update = () => setEntries([...store]);
    listeners.add(update);
    return () => { listeners.delete(update); };
  }, []);

  /* track width */
  useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth < 600);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);

  /* auto-scroll */
  useEffect(() => {
    if (autoScroll && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [entries, autoScroll]);

  /* mouse drag-to-resize */
  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startY: e.clientY, startH: height };
    const onMove = (me: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = dragRef.current.startY - me.clientY;
      setHeight(Math.max(160, Math.min(window.innerHeight * 0.85, dragRef.current.startH + delta)));
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [height]);

  /* touch drag-to-resize */
  const onTouchDrag = useCallback((e: React.TouchEvent) => {
    const startY = e.touches[0].clientY;
    const startH = height;
    const onMove = (te: TouchEvent) => {
      const delta = startY - te.touches[0].clientY;
      setHeight(Math.max(160, Math.min(window.innerHeight * 0.85, startH + delta)));
    };
    const onEnd = () => {
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
    };
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);
  }, [height]);

  const currentPage = window.location.pathname;

  const filtered = entries
    .filter(e => {
      if (pageOnly && e.page !== currentPage) return false;
      if (tab === "errors")   return e.level === "error";
      if (tab === "warnings") return e.level === "warn";
      if (tab === "logs")     return ["log","info","debug"].includes(e.level);
      if (tab === "network")  return e.kind === "network";
      return true;
    })
    .filter(e => {
      if (!filter) return true;
      const q = filter.toLowerCase();
      return e.message.toLowerCase().includes(q) || (e.detail || "").toLowerCase().includes(q);
    });

  const counts = {
    all:      entries.length,
    errors:   entries.filter(e => e.level === "error").length,
    warnings: entries.filter(e => e.level === "warn").length,
    logs:     entries.filter(e => ["log","info","debug"].includes(e.level)).length,
    network:  entries.filter(e => e.kind === "network").length,
  };

  const toggleRow = (id: number) =>
    setExpanded(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const clear = () => { store.length = 0; setEntries([]); setExpanded(new Set()); };

  const doCopy = (which: "filtered" | "all") => {
    const list = which === "all" ? entries : filtered;
    navigator.clipboard.writeText(formatForCopy(list)).then(() => {
      setCopied(which);
      setTimeout(() => setCopied(null), 1800);
    });
  };

  const errorCount = counts.errors;

  const tabLabel: Record<Tab, string> = {
    all:      isMobile ? "All"  : "all",
    errors:   isMobile ? "Err"  : "errors",
    warnings: isMobile ? "Warn" : "warnings",
    logs:     isMobile ? "Log"  : "logs",
    network:  isMobile ? "Net"  : "network",
  };

  const AB: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 4,
    padding: isMobile ? "6px 9px" : "3px 8px",
    borderRadius: 5, border: "1px solid #1e2d3d",
    background: "transparent", color: "#64748b",
    cursor: "pointer", fontSize: isMobile ? 11 : 10,
    fontFamily: "monospace",
    WebkitTapHighlightColor: "transparent",
  };

  return (
    <>
      {/* ── Trigger ── */}
      <button
        onClick={() => setOpen(o => !o)}
        title="Toggle Debug Console (Admin Only)"
        style={{
          position: "fixed",
          bottom: isMobile ? 14 : 16,
          right: isMobile ? 14 : 16,
          zIndex: 99999,
          display: "flex", alignItems: "center", gap: 6,
          padding: isMobile ? "9px 12px" : "7px 12px",
          background: open ? "#1e293b" : "#0f172a",
          color: errorCount > 0 ? "#f87171" : "#94a3b8",
          border: `1px solid ${errorCount > 0 ? "#f87171" : "#334155"}`,
          borderRadius: 8,
          fontSize: isMobile ? 13 : 12,
          fontFamily: "monospace",
          cursor: "pointer", userSelect: "none",
          boxShadow: errorCount > 0 ? "0 0 0 3px rgba(248,113,113,0.15)" : "none",
          transition: "all 0.15s",
          WebkitTapHighlightColor: "transparent",
          minHeight: isMobile ? 44 : "auto",
        }}
      >
        <svg width="14" height="14" viewBox="0 0 13 13" fill="none">
          <rect x="1" y="1" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.2" />
          <path d="M3.5 4.5h6M3.5 6.5h4M3.5 8.5h5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
        </svg>
        Console
        {errorCount > 0 && (
          <span style={{
            background: "#f87171", color: "#fff", borderRadius: 4,
            padding: "1px 6px", fontSize: 11, fontWeight: 700, lineHeight: 1.4,
          }}>{errorCount > 99 ? "99+" : errorCount}</span>
        )}
        <span style={{
          background: "rgba(167,139,250,0.15)", color: "#a78bfa",
          borderRadius: 3, padding: "1px 5px", fontSize: 9, fontWeight: 700,
        }}>ADMIN</span>
      </button>

      {/* ── Panel ── */}
      {open && (
        <div style={{
          position: "fixed", bottom: 0, left: 0, right: 0,
          height,
          zIndex: 99998,
          background: "#0a0f1a",
          borderTop: "1px solid #1e2d3d",
          display: "flex", flexDirection: "column",
          fontFamily: "'JetBrains Mono','Fira Code','Cascadia Code',monospace",
          fontSize: 12,
          boxShadow: "0 -8px 40px rgba(0,0,0,0.5)",
        }}>

          {/* Drag handle */}
          <div
            onMouseDown={onDragStart}
            onTouchStart={onTouchDrag}
            style={{
              flexShrink: 0,
              height: isMobile ? 22 : 7,
              cursor: "ns-resize",
              display: "flex", alignItems: "center", justifyContent: "center",
              borderBottom: "1px solid #1e2d3d",
              touchAction: "none",
            }}
          >
            <div style={{ width: isMobile ? 52 : 40, height: 3, borderRadius: 2, background: "#334155" }} />
          </div>

          {/* ── Toolbar ── */}
          <div style={{
            display: "flex",
            alignItems: "center",
            flexWrap: isMobile ? "wrap" : "nowrap",
            gap: isMobile ? 8 : 4,
            padding: isMobile ? "8px 10px" : "0 10px",
            minHeight: isMobile ? "auto" : 36,
            flexShrink: 0,
            borderBottom: "1px solid #1e2d3d",
            background: "#0d1520",
          }}>

            {/* Tabs */}
            <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
              {TABS.map(t => (
                <button key={t} onClick={() => setTab(t)} style={{
                  padding: isMobile ? "6px 10px" : "3px 10px",
                  borderRadius: 5, border: "none",
                  background: tab === t ? "#1e2d3d" : "transparent",
                  color: tab === t
                    ? (t === "errors" ? "#f87171" : t === "warnings" ? "#fbbf24" : "#e2e8f0")
                    : "#64748b",
                  cursor: "pointer",
                  fontSize: isMobile ? 12 : 11,
                  fontFamily: "monospace",
                  display: "flex", alignItems: "center", gap: 4,
                  minHeight: isMobile ? 36 : "auto",
                  WebkitTapHighlightColor: "transparent",
                }}>
                  {tabLabel[t]}
                  {counts[t] > 0 && (
                    <span style={{
                      background: t === "errors" ? "rgba(248,113,113,0.15)"
                        : t === "warnings" ? "rgba(251,191,36,0.12)"
                        : "rgba(148,163,184,0.1)",
                      color: t === "errors" ? "#f87171"
                        : t === "warnings" ? "#fbbf24" : "#94a3b8",
                      borderRadius: 3, padding: "0 4px", fontSize: 9,
                    }}>{counts[t]}</span>
                  )}
                </button>
              ))}
            </div>

            {/* Filter input */}
            <div style={{
              position: "relative",
              flex: isMobile ? "1 1 100%" : "1",
              maxWidth: isMobile ? "100%" : 280,
              order: isMobile ? 10 : 0,
            }}>
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none"
                style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "#475569", pointerEvents: "none" }}>
                <circle cx="5" cy="5" r="3.5" stroke="currentColor" strokeWidth="1.3" />
                <path d="M8 8l2.5 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
              <input
                value={filter}
                onChange={e => setFilter(e.target.value)}
                placeholder="Filter logs..."
                style={{
                  width: "100%",
                  padding: isMobile ? "8px 10px 8px 28px" : "3px 8px 3px 26px",
                  background: "#0a0f1a",
                  border: "1px solid #1e2d3d",
                  borderRadius: 5, color: "#e2e8f0",
                  fontSize: isMobile ? 13 : 11,
                  fontFamily: "monospace", outline: "none",
                }}
              />
            </div>

            {/* Checkboxes — desktop only */}
            {!isMobile && (
              <>
                <label style={CHK}>
                  <input type="checkbox" checked={pageOnly} onChange={e => setPageOnly(e.target.checked)} style={{ accentColor: "#60a5fa" }} />
                  this page
                </label>
                <label style={CHK}>
                  <input type="checkbox" checked={autoScroll} onChange={e => setAutoScroll(e.target.checked)} style={{ accentColor: "#60a5fa" }} />
                  auto-scroll
                </label>
              </>
            )}

            {/* Action buttons */}
            <div style={{ marginLeft: isMobile ? 0 : "auto", display: "flex", gap: 6, flexShrink: 0 }}>
              <button onClick={() => doCopy("filtered")} title="Copy visible entries" style={AB}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <rect x="4" y="4" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M2 8V2h6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {copied === "filtered" ? <span style={{ color: "#34d399" }}>✓ Copied</span> : "Copy"}
              </button>
              <button onClick={() => doCopy("all")} title="Copy all entries" style={{ ...AB, color: copied === "all" ? "#34d399" : "#94a3b8", borderColor: copied === "all" ? "#34d399" : "#1e2d3d" }}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <rect x="1" y="1" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
                  <rect x="4" y="4" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
                </svg>
                {copied === "all" ? <span style={{ color: "#34d399" }}>✓ Done</span> : "Copy All"}
              </button>
              <button onClick={clear} title="Clear all" style={{ ...AB, color: "#f87171" }}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
                {isMobile ? "" : "Clear"}
              </button>
              <button onClick={() => setOpen(false)} title="Close" style={AB}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2 10l8-8M10 10L2 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </div>

          {/* Breadcrumb */}
          <div style={{
            padding: "3px 10px", background: "#080d14",
            borderBottom: "1px solid #1a2535",
            color: "#334155", fontSize: 10,
            display: "flex", alignItems: "center", gap: 8,
            flexWrap: "wrap", flexShrink: 0,
          }}>
            <span style={{ color: "#60a5fa", maxWidth: isMobile ? 140 : 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{currentPage}</span>
            <span>·</span>
            <span>{filtered.length} shown</span>
            {filter && <><span>·</span><span style={{ color: "#fbbf24" }}>"{filter}"</span></>}
            <span style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
              {counts.errors > 0 && <span style={{ color: "#f87171" }}>● {counts.errors} err</span>}
              {counts.warnings > 0 && <span style={{ color: "#fbbf24" }}>▲ {counts.warnings} warn</span>}
            </span>
          </div>

          {/* ── Log rows ── */}
          <div
            ref={listRef}
            onScroll={() => {
              if (!listRef.current) return;
              const { scrollTop, scrollHeight, clientHeight } = listRef.current;
              setAutoScroll(scrollHeight - scrollTop - clientHeight < 60);
            }}
            style={{
              flex: 1, overflowY: "auto", overflowX: "hidden",
              WebkitOverflowScrolling: "touch",
            } as React.CSSProperties}
          >
            {filtered.length === 0 ? (
              <div style={{ padding: "40px 20px", textAlign: "center", color: "#334155", fontSize: 12 }}>
                No entries
              </div>
            ) : filtered.map((e, idx) => {
              const isOpen    = expanded.has(e.id);
              const hasDetail = !!e.detail;
              const color     = LEVEL_COLOR[e.level];
              const kindLabel = KIND_LABEL[e.kind];
              const rowBg     = idx % 2 === 0 ? "#080d14" : "#0a0f1a";

              return (
                <div key={e.id}>
                  <div
                    onClick={() => hasDetail && toggleRow(e.id)}
                    style={{
                      display: "flex", alignItems: "flex-start",
                      padding: isMobile ? "6px 0" : "2px 0",
                      background: rowBg,
                      borderLeft: `2px solid ${color}`,
                      cursor: hasDetail ? "pointer" : "default",
                      WebkitTapHighlightColor: "transparent",
                    }}
                    onMouseEnter={ev => { (ev.currentTarget as HTMLDivElement).style.background = "#111927"; }}
                    onMouseLeave={ev => { (ev.currentTarget as HTMLDivElement).style.background = rowBg; }}
                  >
                    {/* Caret */}
                    <div style={{ width: 20, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", paddingTop: 3, color: "#334155" }}>
                      {hasDetail ? (
                        <svg width="7" height="7" viewBox="0 0 7 7" fill="none"
                          style={{ transform: isOpen ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}>
                          <path d="M1.5 1l3 2.5-3 2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      ) : (
                        <div style={{ width: 4, height: 4, borderRadius: "50%", background: "#1e2d3d" }} />
                      )}
                    </div>

                    {/* Timestamp */}
                    <span style={{ color: "#334155", fontSize: 10, paddingTop: 3, minWidth: isMobile ? 70 : 80, flexShrink: 0 }}>{fmt(e.time)}</span>

                    {/* Kind badge */}
                    {kindLabel && (
                      <span style={{
                        background: e.kind === "build" ? "rgba(168,85,247,0.15)" : e.kind === "network" ? "rgba(59,130,246,0.15)" : "rgba(148,163,184,0.08)",
                        color: e.kind === "build" ? "#c084fc" : e.kind === "network" ? "#60a5fa" : "#64748b",
                        borderRadius: 3, padding: "1px 5px", fontSize: 9,
                        marginRight: 5, marginTop: 3, flexShrink: 0,
                      }}>{kindLabel}</span>
                    )}

                    {/* Message */}
                    <span style={{ color, fontSize: isMobile ? 12 : 11.5, lineHeight: 1.6, wordBreak: "break-word", flex: 1, paddingRight: 8 }}>
                      {e.message}
                    </span>

                    {/* Source — desktop only */}
                    {e.source && !isMobile && (
                      <span style={{ color: "#334155", fontSize: 10, paddingTop: 3, flexShrink: 0, paddingRight: 8, maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.source}</span>
                    )}

                    {/* Repeat count */}
                    {e.count > 1 && (
                      <span style={{ background: "rgba(96,165,250,0.12)", color: "#60a5fa", borderRadius: 3, padding: "1px 5px", fontSize: 9, marginRight: 6, marginTop: 3, flexShrink: 0 }}>{e.count}×</span>
                    )}
                  </div>

                  {/* Expanded detail */}
                  {isOpen && e.detail && (
                    <div style={{ background: "#060a10", borderLeft: `2px solid ${color}`, padding: "6px 16px 10px 20px" }}>
                      {e.source && isMobile && (
                        <div style={{ color: "#475569", fontSize: 10, marginBottom: 4 }}>{e.source}</div>
                      )}
                      <pre style={{ margin: 0, color: "#64748b", fontSize: isMobile ? 11 : 11, lineHeight: 1.65, whiteSpace: "pre-wrap", wordBreak: "break-all", maxHeight: 240, overflowY: "auto" }}>{e.detail}</pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Status bar */}
          <div style={{
            height: 22, flexShrink: 0,
            display: "flex", alignItems: "center",
            gap: 12, padding: "0 10px",
            background: "#060a10",
            borderTop: "1px solid #1a2535",
            color: "#334155", fontSize: 10,
          }}>
            {counts.errors > 0 && <span style={{ color: "#f87171" }}>● {counts.errors} error{counts.errors !== 1 ? "s" : ""}</span>}
            {counts.warnings > 0 && <span style={{ color: "#fbbf24" }}>▲ {counts.warnings} warning{counts.warnings !== 1 ? "s" : ""}</span>}
            <span style={{ marginLeft: "auto" }}>{entries.length} total · {filtered.length} shown</span>
          </div>
        </div>
      )}
    </>
  );
}

/* ─── Shared static styles ─────────────────────────────────────────────────── */

const CHK: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 5,
  color: "#475569", fontSize: 11,
  cursor: "pointer", userSelect: "none",
};