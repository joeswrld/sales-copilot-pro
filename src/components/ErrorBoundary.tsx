/**
 * ErrorBoundary.tsx
 *
 * Global + page-level error boundaries.
 * Catches render errors AND unhandled promise rejections.
 *
 * FIX: /api/log-error returned 405 (no such route in Vite/production).
 *      Now uses the existing Supabase `log-activity` edge function instead,
 *      with a fire-and-forget pattern so logging failures never affect UX.
 */

import React, { Component, ErrorInfo, ReactNode, useEffect } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

// ─── Logging helper ────────────────────────────────────────────────────────────

async function logErrorToSupabase(payload: Record<string, unknown>) {
  try {
    // Use the existing log-activity edge function — fire and forget
    await supabase.functions.invoke("log-activity", {
      body: {
        action:   "client_error",
        category: "error",
        severity: "error",
        details:  payload,
      },
    });
  } catch {
    // Logging failures must never crash the app
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  children: ReactNode;
  /** Custom fallback UI. If omitted, uses default fallback. */
  fallback?: ReactNode;
  /** Called on error with error details (for logging) */
  onError?: (error: Error, info: ErrorInfo) => void;
  /** Show a compact inline fallback instead of full-page */
  compact?: boolean;
}

interface State {
  hasError:  boolean;
  error:     Error | null;
  errorInfo: ErrorInfo | null;
}

// ─── Default Fallback UI ──────────────────────────────────────────────────────

function DefaultFallback({
  error,
  compact,
  onReset,
}: {
  error:    Error | null;
  compact?: boolean;
  onReset:  () => void;
}) {
  if (compact) {
    return (
      <div
        style={{
          display:      "flex",
          alignItems:   "center",
          gap:           10,
          padding:      "12px 16px",
          background:   "rgba(239,68,68,.08)",
          border:       "1px solid rgba(239,68,68,.2)",
          borderRadius:  10,
          fontFamily:   "system-ui, sans-serif",
        }}
      >
        <AlertTriangle style={{ width: 16, height: 16, color: "#ef4444", flexShrink: 0 }} />
        <span style={{ fontSize: 13, color: "rgba(255,255,255,.7)" }}>
          Something went wrong.
        </span>
        <button
          onClick={onReset}
          style={{
            marginLeft:   "auto",
            display:      "flex",
            alignItems:   "center",
            gap:           5,
            padding:      "5px 10px",
            background:   "rgba(239,68,68,.1)",
            border:       "1px solid rgba(239,68,68,.25)",
            borderRadius:  7,
            color:        "#f87171",
            fontSize:      12,
            fontWeight:    600,
            cursor:       "pointer",
          }}
        >
          <RefreshCw style={{ width: 12, height: 12 }} /> Retry
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight:      "60vh",
        display:        "flex",
        flexDirection:  "column",
        alignItems:     "center",
        justifyContent: "center",
        padding:        "40px 20px",
        textAlign:      "center",
        fontFamily:     "system-ui, sans-serif",
      }}
    >
      <div
        style={{
          width:          64,
          height:         64,
          borderRadius:   16,
          background:     "rgba(239,68,68,.08)",
          border:         "1px solid rgba(239,68,68,.2)",
          display:        "flex",
          alignItems:     "center",
          justifyContent: "center",
          marginBottom:   20,
        }}
      >
        <AlertTriangle style={{ width: 28, height: 28, color: "#ef4444" }} />
      </div>

      <h2
        style={{
          fontSize:      20,
          fontWeight:    700,
          color:         "rgba(255,255,255,.85)",
          marginBottom:  8,
          letterSpacing: "-0.03em",
        }}
      >
        Something went wrong
      </h2>

      <p
        style={{
          fontSize:     13,
          color:        "rgba(255,255,255,.4)",
          maxWidth:     380,
          lineHeight:   1.6,
          marginBottom: 28,
        }}
      >
        An unexpected error occurred. The team has been notified.
        {error?.message && (
          <>
            {" "}
            <br />
            <span
              style={{
                fontFamily: "monospace",
                fontSize:   11,
                color:      "rgba(239,68,68,.7)",
              }}
            >
              {error.message.length > 100
                ? error.message.slice(0, 100) + "…"
                : error.message}
            </span>
          </>
        )}
      </p>

      <div style={{ display: "flex", gap: 10 }}>
        <button
          onClick={onReset}
          style={{
            display:      "flex",
            alignItems:   "center",
            gap:           7,
            padding:      "10px 18px",
            background:   "rgba(255,255,255,.06)",
            border:       "1px solid rgba(255,255,255,.1)",
            borderRadius:  10,
            color:        "rgba(255,255,255,.7)",
            fontSize:      13,
            fontWeight:    600,
            cursor:       "pointer",
          }}
        >
          <RefreshCw style={{ width: 14, height: 14 }} /> Try again
        </button>
        <button
          onClick={() => (window.location.href = "/dashboard")}
          style={{
            display:      "flex",
            alignItems:   "center",
            gap:           7,
            padding:      "10px 18px",
            background:   "linear-gradient(135deg, #3b82f6, #6366f1)",
            border:       "none",
            borderRadius:  10,
            color:        "#fff",
            fontSize:      13,
            fontWeight:    600,
            cursor:       "pointer",
          }}
        >
          <Home style={{ width: 14, height: 14 }} /> Go to Dashboard
        </button>
      </div>
    </div>
  );
}

// ─── Class Component ──────────────────────────────────────────────────────────

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ errorInfo: info });

    console.error("[ErrorBoundary] Caught error:", error, info);

    this.props.onError?.(error, info);

    // Log to Supabase (replaces the broken /api/log-error endpoint)
    void logErrorToSupabase({
      type:            "render_error",
      message:          error.message,
      stack:            error.stack?.slice(0, 500),
      componentStack:   info.componentStack?.slice(0, 500),
      url:              window.location.href,
      timestamp:        new Date().toISOString(),
    });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <DefaultFallback
          error={this.state.error}
          compact={this.props.compact}
          onReset={this.handleReset}
        />
      );
    }

    return this.props.children;
  }
}

// ─── Global unhandled rejection hook ─────────────────────────────────────────

/**
 * Place this once at the app root to capture unhandled promise rejections.
 */
export function useGlobalErrorHandlers() {
  useEffect(() => {
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error("[Global] Unhandled promise rejection:", event.reason);
      event.preventDefault();

      void logErrorToSupabase({
        type:      "unhandledRejection",
        message:   event.reason instanceof Error ? event.reason.message : String(event.reason),
        stack:     event.reason instanceof Error ? event.reason.stack?.slice(0, 500) : undefined,
        url:       window.location.href,
        timestamp: new Date().toISOString(),
      });
    };

    const onError = (event: ErrorEvent) => {
      console.error("[Global] Uncaught error:", event.error);
      void logErrorToSupabase({
        type:      "uncaughtError",
        message:   event.message,
        filename:  event.filename,
        lineno:    event.lineno,
        url:       window.location.href,
        timestamp: new Date().toISOString(),
      });
    };

    window.addEventListener("unhandledrejection", onUnhandledRejection);
    window.addEventListener("error", onError);

    return () => {
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
      window.removeEventListener("error", onError);
    };
  }, []);
}

// ─── HOC helper ──────────────────────────────────────────────────────────────

export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  options?: { compact?: boolean; onError?: (e: Error, info: ErrorInfo) => void },
) {
  const displayName =
    WrappedComponent.displayName || WrappedComponent.name || "Component";

  const WithBoundary = (props: P) => (
    <ErrorBoundary compact={options?.compact} onError={options?.onError}>
      <WrappedComponent {...props} />
    </ErrorBoundary>
  );

  WithBoundary.displayName = `WithErrorBoundary(${displayName})`;
  return WithBoundary;
}