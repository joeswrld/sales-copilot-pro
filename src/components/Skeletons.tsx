/**
 * Skeletons.tsx
 *
 * Reusable loading skeleton components.
 * DealDetailPage, CallDetail, etc. use these instead of empty divs.
 */

import { cn } from "@/lib/utils";

// ─── Primitive ────────────────────────────────────────────────────────────────

function Pulse({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-white/6", className)}
      style={style}
    />
  );
}

// ─── Deal Detail Skeleton ─────────────────────────────────────────────────────

export function DealDetailSkeleton() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
        fontFamily: "system-ui, sans-serif",
        animationName: "pulse",
      }}
    >
      <style>{`
        @keyframes shimmer {
          0%   { opacity: 0.5; }
          50%  { opacity: 1;   }
          100% { opacity: 0.5; }
        }
        .sk { animation: shimmer 1.6s ease-in-out infinite; background: rgba(255,255,255,.06); border-radius: 8px; }
      `}</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div className="sk" style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div className="sk" style={{ width: "55%", height: 22, marginBottom: 6 }} />
          <div style={{ display: "flex", gap: 8 }}>
            <div className="sk" style={{ width: 80, height: 18 }} />
            <div className="sk" style={{ width: 60, height: 18 }} />
          </div>
        </div>
        <div className="sk" style={{ width: 110, height: 36, borderRadius: 10 }} />
      </div>

      {/* Stat strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            style={{
              background: "rgba(255,255,255,.025)",
              border: "1px solid rgba(255,255,255,.05)",
              borderRadius: 12,
              padding: "12px 14px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <div className="sk" style={{ width: 12, height: 12, borderRadius: "50%" }} />
              <div className="sk" style={{ width: 50, height: 10 }} />
            </div>
            <div className="sk" style={{ width: "60%", height: 20 }} />
            <div className="sk" style={{ width: "40%", height: 10, marginTop: 4 }} />
          </div>
        ))}
      </div>

      {/* Main content grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0,1fr)",
          gap: 12,
        }}
      >
        {/* Deal info card */}
        <div
          style={{
            background: "rgba(255,255,255,.02)",
            border: "1px solid rgba(255,255,255,.05)",
            borderRadius: 14,
            padding: 16,
          }}
        >
          <div className="sk" style={{ width: 70, height: 10, marginBottom: 14 }} />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} style={{ marginBottom: 12 }}>
              <div className="sk" style={{ width: 45, height: 9, marginBottom: 4 }} />
              <div className="sk" style={{ width: `${40 + i * 10}%`, height: 14 }} />
            </div>
          ))}
        </div>

        {/* Next step card */}
        <div
          style={{
            background: "rgba(96,165,250,.03)",
            border: "1px solid rgba(96,165,250,.12)",
            borderRadius: 14,
            padding: 14,
          }}
        >
          <div className="sk" style={{ width: 60, height: 10, marginBottom: 10 }} />
          <div className="sk" style={{ width: "100%", height: 14, marginBottom: 5 }} />
          <div className="sk" style={{ width: "70%", height: 14 }} />
        </div>

        {/* Calls section */}
        <div
          style={{
            background: "rgba(255,255,255,.02)",
            border: "1px solid rgba(255,255,255,.05)",
            borderRadius: 14,
            padding: 16,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: 14,
            }}
          >
            <div className="sk" style={{ width: 100, height: 13 }} />
            <div className="sk" style={{ width: 80, height: 28, borderRadius: 8 }} />
          </div>
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              style={{
                border: "1px solid rgba(255,255,255,.05)",
                borderRadius: 10,
                padding: "10px 12px",
                marginBottom: 8,
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <div className="sk" style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div className="sk" style={{ width: "60%", height: 13, marginBottom: 5 }} />
                <div className="sk" style={{ width: "40%", height: 10 }} />
              </div>
              <div className="sk" style={{ width: 36, height: 18 }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Call Detail Skeleton ─────────────────────────────────────────────────────

export function CallDetailSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 896, margin: "0 auto" }}>
      <style>{`
        @keyframes shimmer { 0%,100%{opacity:.5} 50%{opacity:1} }
        .sk2 { animation: shimmer 1.6s ease-in-out infinite; background: rgba(255,255,255,.06); border-radius: 8px; }
      `}</style>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div className="sk2" style={{ width: 36, height: 36, borderRadius: 8, flexShrink: 0 }} />
        <div className="sk2" style={{ flex: 1, height: 24 }} />
        <div className="sk2" style={{ width: 80, height: 24, borderRadius: 20 }} />
      </div>
      {/* Meta cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.06)", borderRadius: 12, padding: "10px 12px" }}>
            <div className="sk2" style={{ width: 12, height: 12, borderRadius: "50%", marginBottom: 6 }} />
            <div className="sk2" style={{ width: "70%", height: 16 }} />
          </div>
        ))}
      </div>
      {/* Summary */}
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.06)", borderRadius: 12, padding: 16 }}>
          <div className="sk2" style={{ width: 120, height: 13, marginBottom: 12 }} />
          <div className="sk2" style={{ width: "100%", height: 12, marginBottom: 6 }} />
          <div className="sk2" style={{ width: "85%", height: 12, marginBottom: 6 }} />
          <div className="sk2" style={{ width: "65%", height: 12 }} />
        </div>
      ))}
    </div>
  );
}

// ─── Generic Card Skeleton ────────────────────────────────────────────────────

export function CardSkeleton({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card p-4 space-y-3",
        className
      )}
    >
      <style>{`@keyframes sk3{0%,100%{opacity:.5}50%{opacity:1}}.sk3{animation:sk3 1.6s ease-in-out infinite;background:rgba(255,255,255,.06);border-radius:6px;}`}</style>
      <div className="sk3" style={{ width: "40%", height: 14 }} />
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="sk3"
          style={{ width: `${100 - i * 15}%`, height: 12 }}
        />
      ))}
    </div>
  );
}