import { useEffect, useState } from "react";

/**
 * Global log store
 */
const logs: any[] = [];

/**
 * Logger wrapper
 */
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

console.log = (...args) => {
  logs.push({ type: "log", data: args });
  originalLog(...args);
};

console.error = (...args) => {
  logs.push({ type: "error", data: args });
  originalError(...args);
};

console.warn = (...args) => {
  logs.push({ type: "warn", data: args });
  originalWarn(...args);
};

/**
 * Capture global errors
 */
window.onerror = (msg, url, line, col, err) => {
  logs.push({
    type: "error",
    data: [{ msg, url, line, col, err }],
  });
};

window.onunhandledrejection = (event) => {
  logs.push({
    type: "error",
    data: [event.reason],
  });
};

/**
 * Intercept fetch requests
 */
const originalFetch = window.fetch;

window.fetch = async (...args) => {
  const start = performance.now();

  try {
    const response = await originalFetch(...args);
    const clone = response.clone();
    const duration = performance.now() - start;

    clone.text().then((body) => {
      logs.push({
        type: "network",
        data: {
          url: args[0],
          status: response.status,
          duration: `${duration.toFixed(2)}ms`,
          body,
        },
      });
    });

    return response;
  } catch (err) {
    logs.push({
      type: "network_error",
      data: { url: args[0], err },
    });
    throw err;
  }
};

/**
 * Inspector UI Component
 */
export const DebugInspector = () => {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<any[]>([]);

  useEffect(() => {
    const interval = setInterval(() => {
      setEntries([...logs]);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <>
      {/* Toggle Button */}
      <button
        onClick={() => setOpen(!open)}
        style={{
          position: "fixed",
          bottom: 16,
          right: 16,
          zIndex: 99999,
          padding: "10px 14px",
          background: "#111",
          color: "#0f0",
          border: "1px solid #0f0",
          borderRadius: "6px",
        }}
      >
        Debug
      </button>

      {/* Panel */}
      {open && (
        <div
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            width: "100%",
            height: "45%",
            background: "#000",
            color: "#0f0",
            overflow: "auto",
            zIndex: 99998,
            padding: "10px",
            fontSize: "12px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <strong>Debug Inspector</strong>
            <button
              onClick={() => {
                logs.splice(0, logs.length);
                setEntries([]);
              }}
              style={{ color: "red" }}
            >
              Clear
            </button>
          </div>

          {entries.map((log, i) => (
            <div key={i} style={{ marginTop: "8px" }}>
              <div>
                <strong>[{log.type}]</strong>
              </div>
              <pre style={{ whiteSpace: "pre-wrap" }}>
                {JSON.stringify(log.data, null, 2)}
              </pre>
            </div>
          ))}
        </div>
      )}
    </>
  );
};