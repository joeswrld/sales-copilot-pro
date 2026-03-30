import { useEffect, useState } from "react";

/* =========================
   Error Store
========================= */

type ErrorEntry = {
  type: string;
  page: string;
  time: number;
  data: any;
};

const errors: ErrorEntry[] = [];

function getTime() {
  return Date.now();
}

function getCurrentPage() {
  return window.location.pathname;
}

/* =========================
   Capture Errors
========================= */

const originalConsoleError = console.error;

console.error = (...args) => {
  errors.push({
    type: "console.error",
    page: getCurrentPage(),
    time: getTime(),
    data: args,
  });

  originalConsoleError(...args);
};

window.onerror = (message, source, lineno, colno, error) => {
  errors.push({
    type: "runtime.error",
    page: getCurrentPage(),
    time: getTime(),
    data: {
      message,
      source,
      lineno,
      colno,
      stack: error?.stack,
    },
  });
};

window.onunhandledrejection = (event) => {
  errors.push({
    type: "unhandled.promise",
    page: getCurrentPage(),
    time: getTime(),
    data: event.reason?.stack || event.reason,
  });
};

const originalFetch = window.fetch;

window.fetch = async (...args) => {
  try {
    const res = await originalFetch(...args);

    if (!res.ok) {
      const clone = res.clone();
      const body = await clone.text();

      errors.push({
        type: "http.error",
        page: getCurrentPage(),
        time: getTime(),
        data: {
          url: args[0],
          status: res.status,
          body,
        },
      });
    }

    return res;
  } catch (err) {
    errors.push({
      type: "network.error",
      page: getCurrentPage(),
      time: getTime(),
      data: err,
    });

    throw err;
  }
};

/* =========================
   UI Inspector
========================= */

export const DebugInspector = () => {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<ErrorEntry[]>([]);

  const currentPage = window.location.pathname;

  useEffect(() => {
    const interval = setInterval(() => {
      setEntries([...errors]);
    }, 800);

    return () => clearInterval(interval);
  }, []);

  const pageErrors = entries
    .filter((e) => e.page === currentPage)
    .sort((a, b) => b.time - a.time);

  const copyAll = () => {
    const text = JSON.stringify(pageErrors, null, 2);
    navigator.clipboard.writeText(text);
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
          <div
            style={{
              display: "flex",
              gap: "10px",
              alignItems: "center",
              marginBottom: "10px",
            }}
          >
            <div style={{ color: "#aaa" }}>
              Page: {currentPage}
            </div>

            <button
              onClick={copyAll}
              style={{
                marginLeft: "auto",
                padding: "4px 10px",
                border: "1px solid #ff4d4f",
                background: "transparent",
                color: "#ff4d4f",
                cursor: "pointer",
              }}
            >
              Copy All
            </button>
          </div>

          {pageErrors.length === 0 && (
            <div style={{ color: "#666" }}>
              No errors on this page
            </div>
          )}

          {pageErrors.map((err, i) => (
            <div
              key={i}
              style={{
                marginBottom: "10px",
                borderBottom: "1px solid #1f1f1f",
                paddingBottom: "6px",
              }}
            >
              <div style={{ color: "#ff4d4f" }}>
                [{err.type}] — {new Date(err.time).toLocaleTimeString()}
              </div>

              <pre style={{ whiteSpace: "pre-wrap", color: "#ccc" }}>
                {JSON.stringify(err.data, null, 2)}
              </pre>
            </div>
          ))}
        </div>
      )}
    </>
  );
};