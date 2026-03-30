import { useEffect, useState } from "react";

const errors: any[] = [];

const originalError = console.error;

console.error = (...args) => {
  errors.push({ type: "error", data: args });
  originalError(...args);
};

window.onerror = (msg, url, line, col, err) => {
  errors.push({
    type: "error",
    data: [{ msg, url, line, col, err }],
  });
};

window.onunhandledrejection = (event) => {
  errors.push({
    type: "error",
    data: [event.reason],
  });
};

export const DebugInspector = () => {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<any[]>([]);

  useEffect(() => {
    const interval = setInterval(() => {
      setEntries([...errors]);
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
            height: "40%",
            background: "#0a0a0a",
            color: "#ff4d4f",
            overflow: "auto",
            zIndex: 99998,
            padding: "10px",
            fontSize: "12px",
            fontFamily: "monospace",
            borderTop: "1px solid #222",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <strong>Console Errors</strong>
            <div>
              <button
                onClick={copyAll}
                style={{
                  marginRight: "10px",
                  color: "#ff4d4f",
                  background: "transparent",
                  border: "1px solid #ff4d4f",
                  padding: "4px 8px",
                  cursor: "pointer",
                }}
              >
                Copy All
              </button>
              <button
                onClick={() => {
                  errors.splice(0, errors.length);
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

          {entries.map((err, i) => (
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
                  color: "#ff4d4f",
                }}
              >
                <strong>[ERROR]</strong>
                <button
                  onClick={() =>
                    copyToClipboard(JSON.stringify(err.data, null, 2))
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
                  color: "#ff4d4f",
                  marginTop: "4px",
                }}
              >
                {JSON.stringify(err.data, null, 2)}
              </pre>
            </div>
          ))}
        </div>
      )}
    </>
  );
};