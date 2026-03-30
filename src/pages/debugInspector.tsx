import { useEffect, useState } from "react";

/* =========================
   Action Tracker (global)
========================= */
let currentAction = "none";

export function setCurrentAction(action: string) {
  currentAction = action;
}

export function getCurrentAction() {
  return currentAction;
}

/* =========================
   Error Store
========================= */
type ErrorEntry = {
  type: string;
  category: string;
  page: string;
  action: string;
  time: number;
  data: any;
};

const errors: ErrorEntry[] = [];

function getTime() {
  return Date.now();
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString();
}

function getCurrentPage() {
  return window.location.pathname;
}

function classifyError(data: any): string {
  const text = JSON.stringify(data).toLowerCase();

  if (text.includes("billing") || text.includes("subscription") || text.includes("paystack")) {
    return "Billing";
  }

  if (text.includes("auth") || text.includes("unauthorized") || text.includes("401")) {
    return "Auth";
  }

  if (text.includes("network") || text.includes("failed to fetch")) {
    return "Network";
  }

  if (text.includes("500") || text.includes("edge function")) {
    return "Server";
  }

  return "General";
}

/* =========================
   Global Error Capture
========================= */

// Console
const originalError = console.error;
console.error = (...args) => {
  errors.push({
    type: "console",
    category: "General",
    page: getCurrentPage(),
    action: getCurrentAction(),
    time: getTime(),
    data: args,
  });
  originalError(...args);
};

// Runtime
window.onerror = (msg, url, line, col, err) => {
  errors.push({
    type: "runtime",
    category: "General",
    page: getCurrentPage(),
    action: getCurrentAction(),
    time: getTime(),
    data: { msg, url, line, col, err },
  });
};

// Promise rejections
window.onunhandledrejection = (event) => {
  const category = classifyError(event.reason);

  errors.push({
    type: "promise",
    category,
    page: getCurrentPage(),
    action: getCurrentAction(),
    time: getTime(),
    data: event.reason,
  });
};

// Fetch
const originalFetch = window.fetch;

window.fetch = async (...args) => {
  const res = await originalFetch(...args);

  if (!res.ok) {
    const clone = res.clone();
    const body = await clone.text();

    const category = classifyError({
      url: args[0],
      status: res.status,
      body,
    });

    errors.push({
      type: "http",
      category,
      page: getCurrentPage(),
      action: getCurrentAction(),
      time: getTime(),
      data: {
        url: args[0],
        status: res.status,
        statusText: res.statusText,
        body,
      },
    });

    console.error("HTTP Error:", args[0], res.status);
  }

  return res;
};

/* =========================
   UI Component
========================= */

export const DebugInspector = () => {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<ErrorEntry[]>([]);
  const [filter, setFilter] = useState<string>("All");

  useEffect(() => {
    const interval = setInterval(() => {
      setEntries([...errors]);
    }, 800);

    return () => clearInterval(interval);
  }, []);

  const currentPage = window.location.pathname;

  const categories = ["All", ...Array.from(new Set(errors.map(e => e.category)))];

  const filteredEntries = (
    filter === "All"
      ? entries
      : entries.filter(e => e.category === filter)
  )
    .filter(e => e.page === currentPage) // page-scoped
    .sort((a, b) => b.time - a.time); // latest first

  const copyAll = () => {
    navigator.clipboard.writeText(JSON.stringify(filteredEntries, null, 2));
  };

  const clearErrors = () => {
    errors.splice(0, errors.length);
    setEntries([]);
  };

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        style={{
          position: "fixed",
          bottom: 16,
          right: 16,
          zIndex: 99999,
          padding: "10px 14px",
          background: "#111",
          color: "#ff4d4f",
          border: "1px solid #ff4d4f",
          borderRadius: "6px",
          fontSize: "12px",
        }}
      >
        Errors
      </button>

      {open && (
        <div
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            width: "100%",
            height: "45%",
            background: "#0a0a0a",
            color: "#fff",
            overflow: "auto",
            zIndex: 99998,
            padding: "10px",
            fontSize: "12px",
            fontFamily: "monospace",
            borderTop: "1px solid #222",
          }}
        >
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setFilter(cat)}
                style={{
                  padding: "4px 8px",
                  border: "1px solid #444",
                  background: filter === cat ? "#222" : "transparent",
                  color: "#ff4d4f",
                  cursor: "pointer",
                }}
              >
                {cat}
              </button>
            ))}

            <button
              onClick={copyAll}
              style={{
                padding: "4px 10px",
                border: "1px solid #ff4d4f",
                background: "transparent",
                color: "#ff4d4f",
                cursor: "pointer",
                marginLeft: "auto",
              }}
            >
              Copy All
            </button>

            <button
              onClick={clearErrors}
              style={{
                padding: "4px 10px",
                border: "1px solid #555",
                background: "transparent",
                color: "#ccc",
                cursor: "pointer",
              }}
            >
              Clear
            </button>
          </div>

          <div style={{ marginTop: "10px" }}>
            {filteredEntries.map((err, i) => (
              <div
                key={i}
                style={{
                  marginBottom: "10px",
                  borderBottom: "1px solid #1f1f1f",
                  paddingBottom: "6px",
                }}
              >
                <div style={{ color: "#ff4d4f" }}>
                  [{err.category}] {err.type} — {err.page} — {err.action} — {formatTime(err.time)}
                </div>

                <pre style={{ whiteSpace: "pre-wrap", color: "#ccc" }}>
                  {JSON.stringify(err.data, null, 2)}
                </pre>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
};