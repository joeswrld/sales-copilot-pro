/**
 * LiveCaptions.tsx
 *
 * Zoom/Meet-style caption bar. Each speaker gets a stable line keyed by
 * `speaker` — interim text updates that line's content in place (same React
 * key = no remount = no flicker), and a final result just stops updating it
 * and lets it fade out a couple seconds later. Two speakers talking at once
 * render as two lines instead of interleaving into one, which is what
 * actually happens with overlapping conversation.
 */
import { useEffect, useRef, useState } from 'react';

export interface CaptionLine {
  speaker: string;
  text: string;
  isFinal: boolean;
  updatedAt: number;
}

interface LiveCaptionsProps {
  lines: CaptionLine[];
  className?: string;
}

const FADE_AFTER_MS = 3500;

export function LiveCaptions({ lines, className }: LiveCaptionsProps) {
  const [, forceTick] = useState(0);
  const rafRef = useRef<ReturnType<typeof setInterval>>();

  // Periodic re-render so finalized lines actually fade/disappear on
  // schedule even with no new caption events coming in.
  useEffect(() => {
    rafRef.current = setInterval(() => forceTick((t) => t + 1), 500);
    return () => clearInterval(rafRef.current);
  }, []);

  const now = Date.now();
  const visible = lines.filter((l) => !l.isFinal || now - l.updatedAt < FADE_AFTER_MS);

  if (visible.length === 0) return null;

  return (
    <div
      className={`pointer-events-none absolute bottom-20 left-1/2 z-20 flex w-full max-w-2xl -translate-x-1/2 flex-col items-center gap-1 px-4 ${className ?? ''}`}
      aria-live="polite"
    >
      {visible.map((line) => {
        const age = now - line.updatedAt;
        const opacity = line.isFinal ? Math.max(0, 1 - age / FADE_AFTER_MS) : 1;
        return (
          <div
            key={line.speaker}
            className="rounded-lg bg-black/70 px-3 py-1.5 text-center text-sm text-white shadow-lg backdrop-blur-sm transition-opacity duration-300"
            style={{ opacity }}
          >
            <span className="mr-1.5 font-semibold text-emerald-400">{line.speaker}:</span>
            <span className={line.isFinal ? 'text-white' : 'text-white/80 italic'}>{line.text}</span>
          </div>
        );
      })}
    </div>
  );
}
