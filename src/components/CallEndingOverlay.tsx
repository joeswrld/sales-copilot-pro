/**
 * CallEndingOverlay.tsx
 *
 * Full-screen animated overlay shown the moment a host ends a call, covering
 * the gap between "call ended" and "summary is generated + we've navigated
 * to Call Details". Previously this gap (which includes an awaited
 * generate-call-summary round trip, deal-room creation, and a recording-URL
 * polling loop that can itself take several seconds) was invisible — the
 * person just saw a disabled "Ending…" button on the meeting page with no
 * sense of progress, for up to 10+ seconds.
 *
 * Two phases, driven entirely by the parent (this component has no timers
 * of its own beyond the small crossfade):
 *   - "processing": shown while the end-call mutation (leave call, mark
 *     completed, generate AI summary, etc.) is actually in flight.
 *   - "ready": shown briefly once that resolves, right before navigating to
 *     the Call Details page, so the transition reads as "found it" rather
 *     than an abrupt cut.
 */
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Check } from "lucide-react";

const T = {
  bg: "#080a12",
  card: "rgba(255,255,255,0.04)",
  border: "rgba(255,255,255,0.08)",
  accent: "#6366f1",
  accent2: "#8b5cf6",
  emerald: "#10b981",
  text: "rgba(255,255,255,0.92)",
  muted: "rgba(255,255,255,0.45)",
};

export type CallEndingPhase = "processing" | "ready";

interface CallEndingOverlayProps {
  phase: CallEndingPhase;
  /** True when the AI summary (and recording finalization) is still
   * running in the background as we navigate — which, since endCall no
   * longer blocks on it, is effectively always. Softens the "ready"
   * messaging instead of claiming a finished summary exists yet. Call
   * Details shows its own "processing"/retry state and picks this up via
   * Realtime the moment it lands. Kept as an optional prop named
   * summaryFailed for backwards compatibility with existing call sites. */
  summaryFailed?: boolean;
}

const PROCESSING_STEPS = [
  "Saving your call…",
  "Uploading the last of the audio…",
  "Analyzing the conversation…",
  "Generating your AI summary…",
  "Polishing the details…",
];

export default function CallEndingOverlay({ phase, summaryFailed }: CallEndingOverlayProps) {
  const [stepIndex, setStepIndex] = useState(0);

  // Cycle through a few reassuring status lines while we wait — purely
  // cosmetic, not tied to real progress (there's no reliable sub-step
  // signal from the backend to hook into), so timings are deliberately
  // generic rather than implying precision we don't have. Paced slowly on
  // purpose — this covers a genuinely multi-second wait (final audio
  // upload, AI summary generation, deal room creation), so it should read
  // as steady progress, not a flash of text.
  useEffect(() => {
    if (phase !== "processing") return;
    setStepIndex(0);
    const id = window.setInterval(() => {
      setStepIndex((i) => Math.min(i + 1, PROCESSING_STEPS.length - 1));
    }, 3_200);
    return () => window.clearInterval(id);
  }, [phase]);

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: T.bg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      {/* Ambient glow */}
      <motion.div
        animate={{ opacity: [0.35, 0.6, 0.35], scale: [1, 1.08, 1] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        style={{
          position: "absolute",
          width: 480,
          height: 480,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${T.accent}33 0%, transparent 70%)`,
          filter: "blur(20px)",
          pointerEvents: "none",
        }}
      />

      <div style={{ position: "relative", textAlign: "center", maxWidth: 380 }}>
        {/* Icon */}
        <div
          style={{
            position: "relative",
            width: 88,
            height: 88,
            margin: "0 auto 28px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {/* Rotating ring — only while processing */}
          <AnimatePresence>
            {phase === "processing" && (
              <motion.div
                key="ring"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, rotate: 360 }}
                exit={{ opacity: 0 }}
                transition={{
                  opacity: { duration: 0.3 },
                  rotate: { duration: 2.2, repeat: Infinity, ease: "linear" },
                }}
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: "50%",
                  border: "2.5px solid transparent",
                  borderTopColor: T.accent,
                  borderRightColor: T.accent2,
                }}
              />
            )}
          </AnimatePresence>

          <motion.div
            animate={
              phase === "processing"
                ? { scale: [1, 1.06, 1] }
                : { scale: [0.6, 1.12, 1] }
            }
            transition={
              phase === "processing"
                ? { duration: 1.6, repeat: Infinity, ease: "easeInOut" }
                : { duration: 0.5, ease: "easeOut" }
            }
            style={{
              width: 64,
              height: 64,
              borderRadius: "50%",
              background: phase === "ready"
                ? `linear-gradient(135deg, ${T.emerald}, #34d399)`
                : `linear-gradient(135deg, ${T.accent}, ${T.accent2})`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: phase === "ready"
                ? `0 0 24px ${T.emerald}66`
                : `0 0 24px ${T.accent}55`,
            }}
          >
            <AnimatePresence mode="wait">
              {phase === "ready" ? (
                <motion.div
                  key="check"
                  initial={{ scale: 0, rotate: -45 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 400, damping: 18 }}
                >
                  <Check size={28} color="#fff" strokeWidth={3} />
                </motion.div>
              ) : (
                <motion.div
                  key="sparkles"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                >
                  <Sparkles size={26} color="#fff" />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>

        {/* Headline */}
        <AnimatePresence mode="wait">
          <motion.h2
            key={phase}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25 }}
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: T.text,
              margin: 0,
              marginBottom: 10,
            }}
          >
            {phase === "ready" ? "Almost there…" : "Wrapping up your call"}
          </motion.h2>
        </AnimatePresence>

        {/* Subtext */}
        <AnimatePresence mode="wait">
          <motion.p
            key={phase === "ready" ? "ready-sub" : `processing-sub-${stepIndex}`}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.3 }}
            style={{
              fontSize: 14.5,
              color: T.muted,
              margin: 0,
              lineHeight: 1.5,
              minHeight: 22,
            }}
          >
            {phase === "ready"
              ? summaryFailed
                ? "Call saved — we'll finish the summary in the background."
                : "Your summary is ready — taking you there now."
              : PROCESSING_STEPS[stepIndex]}
          </motion.p>
        </AnimatePresence>

        {/* Dots */}
        {phase === "processing" && (
          <div style={{ display: "flex", gap: 6, justifyContent: "center", marginTop: 22 }}>
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                animate={{ opacity: [0.25, 1, 0.25], y: [0, -3, 0] }}
                transition={{
                  duration: 1.1,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: i * 0.15,
                }}
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: T.accent,
                  display: "inline-block",
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}