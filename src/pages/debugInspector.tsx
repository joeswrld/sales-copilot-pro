import { useEffect, useRef, useState, useCallback } from "react";

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
  const orig = console[level].bind(console);
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

/* ─── Listen for Vite/build errors ────────────────────────────────────────── */

if (typeof window.__vite_plugin_react_preamble_installed__ !== "undefined" || import.meta?.hot) {
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
}

/* ─── Component ────────────────────────────────────────────────────────────── */

const TABS = ["all", "errors", "warnings", "logs", "network"] as const;
type Tab = typeof TABS[number];

const LEVEL_COLORS: Record<LogLevel, string> = {
  error: "#f87171",
  warn:  "#fbbf24",
  info:  "#60a5fa",
  log:   "#e2e8f0",
  debug: "#94a3b8",
};

const KIND_LABELS: Record<ConsoleEntry["kind"], string> = {
  console:    "",
  runtime:    "runtime",
  promise:    "promise",
  network:    "fetch",
  build:      "build",
  navigation: "nav",
};

function fmt(ts: number) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}:${String(d.getSeconds()).padStart(2,"0")}.${String(d.getMilliseconds()).padStart(3,"0")}`;
}

export const DebugInspector = () => {
  const [open, setOpen]         = useState(false);
  const [tab, setTab]           = useState<Tab>("all");
  const [filter, setFilter]     = useState("");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [entries, setEntries]   = useState<ConsoleEntry[]>([]);
  const [height, setHeight]     = useState(340);
  const [autoScroll, setAutoScroll] = useState(true);
  const [pageOnly, setPageOnly] = useState(false);
  const listRef  = useRef<HTMLDivElement>(null);
  const dragRef  = useRef<{ startY: number; startH: number } | null>(null);

  /* subscribe to store */
  useEffect(() => {
    const update = () => setEntries([...store]);
    listeners.add(update);
    return () => { listeners.delete(update); };
  }, []);

  /* auto-scroll */
  useEffect(() => {
    if (autoScroll && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [entries, autoScroll]);

  /* drag-to-resize */
  const onDragStart = useCallback((e: React.MouseEvent) => {
    dragRef.current = { startY: e.clientY, startH: height };
    const onMove = (me: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = dragRef.current.startY - me.clientY;
      setHeight(Math.max(120, Math.min(window.innerHeight * 0.8, dragRef.current.startH + delta)));
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [height]);

  const currentPage = window.location.pathname;

  const filtered = entries.filter(e => {
    if (pageOnly && e.page !== currentPage) return false;
    if (tab === "errors")   return e.level === "error";
    if (tab === "warnings") return e.level === "warn";
    if (tab === "logs")     return e.level === "log" || e.level === "debug" || e.level === "info";
    if (tab === "network")  return e.kind === "network";
    return true;
  }).filter(e => {
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

  const copy = () =>
    navigator.clipboard.writeText(JSON.stringify(filtered, null, 2));

  /* error badge count */
  const errorCount = counts.errors;

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(o => !o)}
        title="Toggle Debug Console"
        style={{
          position: "fixed", bottom: 16, right: 16, zIndex: 99999,
          display: "flex", alignItems: "center", gap: 6,
          padding: "7px 12px",
          background: open ? "#1e293b" : "#0f172a",
          color: errorCount > 0 ? "#f87171" : "#94a3b8",
          border: `1px solid ${errorCount > 0 ? "#f87171" : "#334155"}`,
          borderRadius: 8, fontSize: 12, fontFamily: "monospace",
          cursor: "pointer", userSelect: "none",
          boxShadow: errorCount > 0 ? "0 0 0 2px rgba(248,113,113,0.2)" : "none",
          transition: "all 0.15s",
        }}
      >
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
          <rect x="1" y="1" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.2" />
          <path d="M3.5 4.5h6M3.5 6.5h4M3.5 8.5h5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
        </svg>
        Console
        {errorCount > 0 && (
          <span style={{
            background: "#f87171", color: "#fff", borderRadius: 4,
            padding: "1px 5px", fontSize: 10, fontWeight: 700, lineHeight: 1.4,
          }}>{errorCount > 99 ? "99+" : errorCount}</span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", bottom: 0, left: 0, right: 0,
          height, zIndex: 99998,
          background: "#0a0f1a",
          borderTop: "1px solid #1e2d3d",
          display: "flex", flexDirection: "column",
          fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
          fontSize: 12,
          boxShadow: "0 -8px 40px rgba(0,0,0,0.5)",
        }}>

          {/* Drag handle */}
          <div
            onMouseDown={onDragStart}
            style={{
              height: 5, cursor: "ns-resize", flexShrink: 0,
              background: "transparent",
              borderBottom: "1px solid #1e2d3d",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <div style={{ width: 36, height: 2, borderRadius: 2, background: "#334155" }} />
          </div>

          {/* Toolbar */}
          <div style={{
            display: "flex", alignItems: "center", gap: 4,
            padding: "0 10px", height: 36, flexShrink: 0,
            borderBottom: "1px solid #1e2d3d",
            background: "#0d1520",
          }}>
            {/* Tabs */}
            <div style={{ display: "flex", gap: 1 }}>
              {TABS.map(t => (
                <button key={t} onClick={() => setTab(t)} style={{
                  padding: "3px 10px", borderRadius: 5, border: "none",
                  background: tab === t ? "#1e2d3d" : "transparent",
                  color: tab === t
                    ? (t === "errors" ? "#f87171" : t === "warnings" ? "#fbbf24" : "#e2e8f0")
                    : "#64748b",
                  cursor: "pointer", fontSize: 11, fontFamily: "monospace",
                  display: "flex", alignItems: "center", gap: 4,
                  transition: "background 0.1s, color 0.1s",
                }}>
                  {t}
                  {counts[t] > 0 && (
                    <span style={{
                      background: t === "errors" ? "rgba(248,113,113,0.15)"
                        : t === "warnings" ? "rgba(251,191,36,0.12)"
                        : "rgba(148,163,184,0.1)",
                      color: t === "errors" ? "#f87171"
                        : t === "warnings" ? "#fbbf24"
                        : "#94a3b8",
                      borderRadius: 3, padding: "0 4px", fontSize: 10,
                    }}>{counts[t]}</span>
                  )}
                </button>
              ))}
            </div>

            {/* Divider */}
            <div style={{ width: 1, height: 18, background: "#1e2d3d", marginLeft: 4 }} />

            {/* Filter input */}
            <div style={{ position: "relative", flex: 1, maxWidth: 280 }}>
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none"
                style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "#475569" }}>
                <circle cx="5" cy="5" r="3.5" stroke="currentColor" strokeWidth="1.3" />
                <path d="M8 8l2.5 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
              <input
                value={filter}
                onChange={e => setFilter(e.target.value)}
                placeholder="Filter"
                style={{
                  width: "100%", padding: "3px 8px 3px 26px",
                  background: "#0a0f1a", border: "1px solid #1e2d3d",
                  borderRadius: 5, color: "#e2e8f0", fontSize: 11,
                  fontFamily: "monospace", outline: "none",
                }}
              />
            </div>

            {/* Page filter */}
            <label style={{ display: "flex", alignItems: "center", gap: 5, color: "#475569", fontSize: 11, cursor: "pointer", userSelect: "none", marginLeft: 4 }}>
              <input type="checkbox" checked={pageOnly} onChange={e => setPageOnly(e.target.checked)}
                style={{ accentColor: "#60a5fa", cursor: "pointer" }} />
              this page
            </label>

            {/* Auto-scroll */}
            <label style={{ display: "flex", alignItems: "center", gap: 5, color: "#475569", fontSize: 11, cursor: "pointer", userSelect: "none" }}>
              <input type="checkbox" checked={autoScroll} onChange={e => setAutoScroll(e.target.checked)}
                style={{ accentColor: "#60a5fa", cursor: "pointer" }} />
              auto-scroll
            </label>

            {/* Actions */}
            <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
              <button onClick={copy} title="Copy filtered entries" style={btnStyle}>
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                  <rect x="4" y="4" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M2 8V2h6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Copy
              </button>
              <button onClick={clear} title="Clear all" style={{ ...btnStyle, color: "#f87171" }}>
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                  <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
                Clear
              </button>
              <button onClick={() => setOpen(false)} title="Close" style={btnStyle}>
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                  <path d="M2 10l8-8M10 10L2 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </div>

          {/* Breadcrumb */}
          <div style={{
            padding: "3px 12px", background: "#080d14",
            borderBottom: "1px solid #1a2535",
            color: "#334155", fontSize: 10, display: "flex", alignItems: "center", gap: 6,
          }}>
            <span style={{ color: "#60a5fa" }}>{currentPage}</span>
            <span>·</span>
            <span>{filtered.length} entries</span>
            {filter && <><span>·</span><span style={{ color: "#fbbf24" }}>filtered: "{filter}"</span></>}
          </div>

          {/* Log rows */}
          <div
            ref={listRef}
            onScroll={() => {
              if (!listRef.current) return;
              const { scrollTop, scrollHeight, clientHeight } = listRef.current;
              setAutoScroll(scrollHeight - scrollTop - clientHeight < 40);
            }}
            style={{
              flex: 1, overflowY: "auto", overflowX: "hidden",
            }}
          >
            {filtered.length === 0 ? (
              <div style={{ padding: "40px 20px", textAlign: "center", color: "#334155", fontSize: 12 }}>
                No entries
              </div>
            ) : (
              filtered.map((e, idx) => {
                const isExpanded = expanded.has(e.id);
                const hasDetail  = !!e.detail;
                const color      = LEVEL_COLORS[e.level];
                const kindLabel  = KIND_LABELS[e.kind];
                const isEven     = idx % 2 === 0;

                return (
                  <div key={e.id}>
                    <div
                      onClick={() => hasDetail && toggleRow(e.id)}
                      style={{
                        display: "flex", alignItems: "flex-start", gap: 0,
                        padding: "2px 0",
                        background: isEven ? "#080d14" : "#0a0f1a",
                        borderLeft: `2px solid ${color}`,
                        cursor: hasDetail ? "pointer" : "default",
                        transition: "background 0.1s",
                      }}
                      onMouseEnter={ev => { (ev.currentTarget as HTMLDivElement).style.background = "#111927"; }}
                      onMouseLeave={ev => { (ev.currentTarget as HTMLDivElement).style.background = isEven ? "#080d14" : "#0a0f1a"; }}
                    >
                      {/* Expand caret */}
                      <div style={{ width: 18, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", paddingTop: 3, color: "#334155" }}>
                        {hasDetail ? (
                          <svg width="7" height="7" viewBox="0 0 7 7" fill="none"
                            style={{ transform: isExpanded ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}>
                            <path d="M1.5 1l3 2.5-3 2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        ) : (
                          <div style={{ width: 4, height: 4, borderRadius: "50%", background: "#1e2d3d" }} />
                        )}
                      </div>

                      {/* Timestamp */}
                      <span style={{ color: "#334155", fontSize: 10, paddingTop: 3, minWidth: 78, flexShrink: 0 }}>{fmt(e.time)}</span>

                      {/* Kind badge */}
                      {kindLabel && (
                        <span style={{
                          background: e.kind === "build" ? "rgba(168,85,247,0.15)" : e.kind === "network" ? "rgba(59,130,246,0.15)" : "rgba(148,163,184,0.08)",
                          color: e.kind === "build" ? "#c084fc" : e.kind === "network" ? "#60a5fa" : "#64748b",
                          borderRadius: 3, padding: "1px 5px", fontSize: 9, marginRight: 6, marginTop: 3, flexShrink: 0,
                        }}>{kindLabel}</span>
                      )}

                      {/* Message */}
                      <span style={{ color, fontSize: 11.5, lineHeight: 1.6, wordBreak: "break-word", flex: 1, paddingRight: 12 }}>
                        {e.message}
                      </span>

                      {/* Source */}
                      {e.source && (
                        <span style={{ color: "#334155", fontSize: 10, paddingTop: 3, flexShrink: 0, paddingRight: 12 }}>{e.source}</span>
                      )}

                      {/* Repeat count */}
                      {e.count > 1 && (
                        <span style={{
                          background: "rgba(96,165,250,0.12)", color: "#60a5fa",
                          borderRadius: 3, padding: "1px 5px", fontSize: 9,
                          marginRight: 8, marginTop: 3, flexShrink: 0,
                        }}>{e.count}×</span>
                      )}
                    </div>

                    {/* Expanded detail */}
                    {isExpanded && e.detail && (
                      <div style={{
                        background: "#060a10",
                        borderLeft: `2px solid ${color}`,
                        padding: "6px 18px 10px 18px",
                      }}>
                        <pre style={{
                          margin: 0, color: "#64748b", fontSize: 11,
                          lineHeight: 1.65, whiteSpace: "pre-wrap", wordBreak: "break-all",
                          maxHeight: 300, overflowY: "auto",
                        }}>{e.detail}</pre>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Status bar */}
          <div style={{
            height: 22, flexShrink: 0, display: "flex", alignItems: "center",
            gap: 12, padding: "0 12px",
            background: "#060a10",
            borderTop: "1px solid #1a2535",
            color: "#334155", fontSize: 10,
          }}>
            {counts.errors > 0 && <span style={{ color: "#f87171" }}>● {counts.errors} error{counts.errors !== 1 ? "s" : ""}</span>}
            {counts.warnings > 0 && <span style={{ color: "#fbbf24" }}>▲ {counts.warnings} warning{counts.warnings !== 1 ? "s" : ""}</span>}
            <span style={{ marginLeft: "auto" }}>{currentPage}</span>
          </div>
        </div>
      )}
    </>
  );
};

/* ─── Shared button style ──────────────────────────────────────────────────── */

const btnStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 4,
  padding: "3px 8px", borderRadius: 5, border: "1px solid #1e2d3d",
  background: "transparent", color: "#64748b",
  cursor: "pointer", fontSize: 10, fontFamily: "monospace",
  transition: "background 0.1s, color 0.1s",
};