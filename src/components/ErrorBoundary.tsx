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

import React, { Component, ErrorInfo, ReactNode, useEffect, useState } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";

// ─── Design tokens ──────────────────────────────────────────────────────────
// Mirrors the cream/navy system from LandingPage.tsx so a crashed panel
// still feels like part of the same product, not a foreign dev-tool alert.

const T = {
  paper: "#FAFAF8",
  paper2: "#F3F2ED",
  ink: "#17170F",
  ink2: "rgba(23,23,15,0.66)",
  muted: "rgba(23,23,15,0.42)",
  faint: "rgba(23,23,15,0.28)",
  border: "rgba(23,23,15,0.11)",
  borderStrong: "rgba(23,23,15,0.18)",
  accent: "#22315C",
  accentInk: "#FAFAF8",
  accentSoft: "rgba(34,49,92,0.07)",
  accentBorder: "rgba(34,49,92,0.22)",
  warn: "#8A5A20",
  warnSoft: "rgba(138,90,32,0.09)",
  fb: "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
  fm: "'IBM Plex Mono',ui-monospace,monospace",
  radiusS: 6,
  radiusM: 10,
  radiusL: 14,
};

// Critically damped by default (Apple's "response over duration" spring —
// no bounce for a state that just appeared, matching the landing page's
// non-gestural reveals).
const settle = { type: "spring" as const, bounce: 0, duration: 0.4 };

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

function RetryButton({
  onClick,
  variant,
  children,
}: {
  onClick:  () => void;
  variant:  "primary" | "outline";
  children: ReactNode;
}) {
  // Feedback on press, not release — kill latency per the Apple spring
  // rules (§1 Response). The scale reads instantly under the pointer.
  const [pressed, setPressed] = useState(false);
  const isPrimary = variant === "primary";
  return (
    <motion.button
      onClick={onClick}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      animate={{ scale: pressed ? 0.97 : 1 }}
      transition={{ type: "spring", bounce: 0, duration: 0.25 }}
      style={{
        display:       "inline-flex",
        alignItems:    "center",
        justifyContent: "center",
        gap:            7,
        padding:       "10px 18px",
        background:    isPrimary ? T.accent : "transparent",
        border:        `1px solid ${isPrimary ? T.accent : T.borderStrong}`,
        borderRadius:   T.radiusS,
        color:         isPrimary ? T.accentInk : T.ink,
        fontSize:       13.5,
        fontWeight:     600,
        fontFamily:     T.fb,
        cursor:        "pointer",
        minHeight:      44,
      }}
    >
      {children}
    </motion.button>
  );
}

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
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={settle}
        style={{
          display:      "flex",
          alignItems:   "center",
          gap:           10,
          padding:      "12px 16px",
          background:   T.warnSoft,
          border:       `1px solid rgba(138,90,32,0.22)`,
          borderRadius:  T.radiusM,
          fontFamily:   T.fb,
        }}
      >
        <AlertTriangle style={{ width: 16, height: 16, color: T.warn, flexShrink: 0 }} />
        <span style={{ fontSize: 13, color: T.ink2, fontWeight: 500 }}>
          Something went wrong.
        </span>
        <motion.button
          onClick={onReset}
          whileTap={{ scale: 0.96 }}
          transition={{ type: "spring", bounce: 0, duration: 0.25 }}
          style={{
            marginLeft:   "auto",
            display:      "flex",
            alignItems:   "center",
            gap:           5,
            padding:      "6px 11px",
            background:   T.paper,
            border:       `1px solid ${T.borderStrong}`,
            borderRadius:  100,
            color:        T.ink,
            fontSize:      12,
            fontWeight:    600,
            fontFamily:    T.fb,
            cursor:       "pointer",
          }}
        >
          <RefreshCw style={{ width: 12, height: 12 }} /> Retry
        </motion.button>
      </motion.div>
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
        fontFamily:     T.fb,
        background:     T.paper,
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={settle}
        style={{ display: "flex", flexDirection: "column", alignItems: "center" }}
      >
        <div
          style={{
            width:          56,
            height:         56,
            borderRadius:   T.radiusL,
            background:     T.warnSoft,
            border:         `1px solid rgba(138,90,32,0.2)`,
            display:        "flex",
            alignItems:     "center",
            justifyContent: "center",
            marginBottom:   22,
          }}
        >
          <AlertTriangle style={{ width: 24, height: 24, color: T.warn }} strokeWidth={1.6} />
        </div>

        <div
          style={{
            fontFamily:    T.fm,
            fontSize:      11,
            fontWeight:    600,
            color:         T.faint,
            textTransform: "uppercase",
            letterSpacing: "0.09em",
            marginBottom:  10,
          }}
        >
          Unexpected error
        </div>

        <h2
          style={{
            fontSize:      21,
            fontWeight:    700,
            color:         T.ink,
            marginBottom:  10,
            letterSpacing: "-0.02em",
          }}
        >
          Something went wrong
        </h2>

        <p
          style={{
            fontSize:     14,
            color:        T.ink2,
            maxWidth:     400,
            lineHeight:   1.6,
            marginBottom: error?.message ? 14 : 28,
          }}
        >
          This part of the page hit a snag. The team's already been notified — try again, or head back to safe ground.
        </p>

        {error?.message && (
          <div
            style={{
              fontFamily:   T.fm,
              fontSize:     11.5,
              color:        T.warn,
              background:   T.paper2,
              border:       `1px solid ${T.border}`,
              borderRadius:  T.radiusS,
              padding:      "8px 12px",
              maxWidth:     420,
              marginBottom: 28,
              textAlign:    "left",
              wordBreak:    "break-word",
            }}
          >
            {error.message.length > 140
              ? error.message.slice(0, 140) + "…"
              : error.message}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
          <RetryButton onClick={onReset} variant="outline">
            <RefreshCw style={{ width: 14, height: 14 }} /> Try again
          </RetryButton>
          <RetryButton onClick={() => (window.location.href = "/dashboard")} variant="primary">
            <Home style={{ width: 14, height: 14 }} /> Go to Dashboard
          </RetryButton>
        </div>
      </motion.div>
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