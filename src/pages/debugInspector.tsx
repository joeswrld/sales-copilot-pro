import { useEffect, useState } from "react";

const logs: any[] = [];

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

const getColor = (type: string) => {
  if (type === "error") return "#ff4d4f";
  if (type === "warn") return "#faad14";
  if (type === "network") return "#40a9ff";
  return "#d9d9d9";
};

export const DebugInspector = () => {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<any[]>([]);

  useEffect(() => {
    const interval = setInterval(() => {
      setEntries([...logs]);
    }, 800);

    return () => clearInterval(interval);
  }, []);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const copyAll = () => {
    navigator.clipboard.writeText(JSON.stringify(entries, null, 2));
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
          color: "#00ff9f",
          border: "1px solid #00ff9f",
          borderRadius: "6px",
          fontSize: "12px",
        }}
      >
        DevTools
      </button>

      {open && (
        <div
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            width: "100%",
            height: "45%",
            background: "#0d0d0d",
            color: "#eaeaea",
            overflow: "auto",
            zIndex: 99998,
            padding: "10px",
            fontSize: "12px",
            fontFamily: "monospace",
            borderTop: "1px solid #222",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <strong style={{ color: "#00ff9f" }}>Console</strong>
            <div>
              <button
                onClick={copyAll}
                style={{
                  marginRight: "10px",
                  color: "#00ff9f",
                  background: "transparent",
                  border: "1px solid #00ff9f",
                  padding: "4px 8px",
                  cursor: "pointer",
                }}
              >
                Copy All
              </button>
              <button
                onClick={() => {
                  logs.splice(0, logs.length);
                  setEntries([]);
                }}
                style={{
                  color: "#ff4d4f",
                  background: "transparent",
                  border: "1px solid #ff4d4f",
                  padding: "4px 8px",
                  cursor: "pointer",
                }}
              >
                Clear
              </button>
            </div>
          </div>

          {entries.map((log, i) => (
            <div
              key={i}
              style={{
                marginTop: "8px",
                borderBottom: "1px solid #1f1f1f",
                paddingBottom: "6px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  color: getColor(log.type),
                }}
              >
                <strong>[{log.type}]</strong>
                <button
                  onClick={() =>
                    copyToClipboard(JSON.stringify(log.data, null, 2))
                  }
                  style={{
                    fontSize: "10px",
                    background: "transparent",
                    border: "1px solid #555",
                    color: "#ccc",
                    padding: "2px 6px",
                    cursor: "pointer",
                  }}
                >
                  Copy
                </button>
              </div>

              <pre
                style={{
                  whiteSpace: "pre-wrap",
                  color: getColor(log.type),
                  marginTop: "4px",
                }}
              >
                {JSON.stringify(log.data, null, 2)}
              </pre>
            </div>
          ))}
        </div>
      )}
    </>
  );
};