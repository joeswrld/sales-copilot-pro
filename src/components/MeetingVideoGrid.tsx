/**
 * MeetingVideoGrid.tsx
 *
 * Shared "everyone is visible, clearly, at any headcount" video stage used by
 * both the host page (LiveMeeting) and the guest page (GuestJoin). Previously
 * this logic (PinnableTile + VideoGrid) was duplicated in each page, and the
 * grid itself used a fixed column lookup table:
 *
 *   const cols = count <= 4 ? 2 : count <= 6 ? 3 : 4;
 *
 * That table produces empty, wasted cells at very common headcounts — e.g.
 * 3 people got a 2x2 grid (4 cells, 1 empty), 5 people got 3x2 (6 cells, 1
 * empty), 7 people got 4x2 (8 cells, 1 empty). An empty cell doesn't just
 * look unfinished — the real people on the call have to share the remaining
 * space with a gap, so their tiles end up smaller and more cropped than
 * they need to be, which is exactly what makes faces hard to make out once
 * 3+ people join. It also never adapted to the *shape* of the stage: a wide
 * desktop window and a narrow phone screen got the same column count for
 * the same headcount.
 *
 * This version instead:
 *  1. Measures the actual stage width/height with a ResizeObserver.
 *  2. Searches every (cols, rows) split that can hold `count` tiles with the
 *     shortfall (if any) confined to a single, centered trailing row —
 *     never an empty cell stranded in the middle of the grid — and scores
 *     each by how close the resulting per-tile shape is to a comfortable
 *     face-height ratio, balanced against how many cells (if any) are empty.
 *  3. Picks whichever split makes tiles largest and most face-shaped for
 *     the *current* container, so 3 people become 3 equal tiles side by
 *     side (or stacked, on a narrow phone) instead of a 2x2 grid with a
 *     blank quadrant, and "awkward" counts like 5, 7, 11 get a sensible
 *     near-square grid with at most one short — but centered, never
 *     dangling — last row.
 */

import { useEffect, useRef, useState, memo } from "react";
import {
  Users, WifiOff, RefreshCw, Loader2, Video,
  Maximize2, LayoutGrid, PanelRight, Pin, PinOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { VideoTile } from "@/components/VideoTile";
import type { DailyParticipant } from "@/hooks/useDailyCall";

export type VideoLayout = "focus" | "grid" | "sidebar";

const T = {
  card: "rgba(255,255,255,0.04)",
  border: "rgba(255,255,255,0.07)",
  accent: "#6366f1",
  muted: "rgba(255,255,255,0.35)",
  subtle: "rgba(255,255,255,0.12)",
};

// ─── Pinnable tile ───────────────────────────────────────────────────────────
export const PinnableTile = memo(
  ({
    participant,
    activeSpeakerId,
    isPinned,
    onPin,
    className,
    isMain = false,
  }: {
    participant: DailyParticipant;
    activeSpeakerId: string | null;
    isPinned: boolean;
    onPin: (id: string | null) => void;
    className?: string;
    isMain?: boolean;
  }) => (
    <div
      className={cn(
        "relative group cursor-pointer select-none rounded-xl overflow-hidden",
        className,
      )}
      onClick={() => onPin(isPinned ? null : participant.session_id)}
    >
      <VideoTile
        participant={participant}
        isMain={isMain}
        activeSpeakerId={activeSpeakerId}
        className="w-full h-full"
      />
      {participant.handRaised && (
        <div
          className="absolute top-2 left-2 flex items-center gap-1 px-2 py-1 rounded-lg z-20"
          style={{ background: "rgba(245,158,11,0.9)", backdropFilter: "blur(8px)" }}
        >
          <span className="text-sm">✋</span>
          <span className="text-[10px] font-bold text-white hidden sm:block">Raised</span>
        </div>
      )}
      <div
        className={cn(
          "absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold",
          "transition-all duration-150 opacity-0 group-hover:opacity-100",
          isPinned && "opacity-100",
        )}
        style={{
          background: isPinned ? "rgba(99,102,241,0.85)" : "rgba(0,0,0,0.55)",
          backdropFilter: "blur(8px)",
          color: "#fff",
        }}
      >
        {isPinned ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
        <span className="hidden sm:block">{isPinned ? "Unpin" : "Pin"}</span>
      </div>
    </div>
  ),
);
PinnableTile.displayName = "PinnableTile";

// ─── Balanced grid geometry ──────────────────────────────────────────────────
// A comfortable per-tile aspect ratio to aim for when several layouts tie on
// "fewest empty cells" — a bit wider than square, close to a face/upper-body
// camera crop, and close to what Zoom/Meet settle on for their equal grids.
const IDEAL_TILE_RATIO = 16 / 10;

/**
 * Given a participant count and the stage's current pixel size, return the
 * column/row split that keeps every tile as large and face-shaped as
 * possible for the *current* container shape, while never leaving an empty
 * cell anywhere except (at most) a single centered trailing row.
 */
export function computeGrid(count: number, stageW: number, stageH: number) {
  if (count <= 0) return { cols: 1, rows: 1 };
  if (count === 1) return { cols: 1, rows: 1 };

  const w = stageW > 0 ? stageW : 16;
  const h = stageH > 0 ? stageH : 9;

  let best: { cols: number; rows: number; score: number } | null = null;

  // Try every column count that could plausibly apply. Only accept layouts
  // where any shortfall is confined to a single trailing row (i.e. never a
  // fully-empty row), so we never render a mostly-empty grid. Among the
  // survivors, balance "how close to the ideal per-tile ratio" against "how
  // many cells are empty": a perfect (zero-empty) fit like 3x1 for 3 people
  // wins over a 2x2 grid with a blank cell, but a single short centered row
  // (e.g. 4x3 for 11 people) still beats forcing everyone into one
  // razor-thin strip just to hit zero empty cells.
  for (let cols = 1; cols <= count; cols++) {
    const rows = Math.ceil(count / cols);
    const emptyCells = cols * rows - count;
    if (emptyCells >= cols) continue;

    const tileW = w / cols;
    const tileH = h / rows;
    const tileRatio = tileW / tileH;
    const ratioPenalty = Math.abs(Math.log(tileRatio / IDEAL_TILE_RATIO));
    const emptyPenalty = emptyCells * 0.9;
    const score = ratioPenalty + emptyPenalty;

    if (!best || score < best.score) {
      best = { cols, rows, score };
    }
  }

  return best ?? { cols: Math.ceil(Math.sqrt(count)), rows: Math.ceil(Math.sqrt(count)) };
}

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize((prev) => (prev.w === width && prev.h === height ? prev : { w: width, h: height }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, size };
}

// ─── Meeting video grid ──────────────────────────────────────────────────────
export const MeetingVideoGrid = memo(
  ({
    participants,
    activeSpeakerId,
    isConnecting,
    isConnected,
    error,
    roomName,
    onRetry,
    pinnedId,
    onPin,
    layout,
    onLayoutChange,
    connectingLabel = "Connecting…",
    localName,
  }: {
    participants: DailyParticipant[];
    activeSpeakerId: string | null;
    isConnecting: boolean;
    isConnected?: boolean;
    error: string | null;
    roomName?: string | null;
    onRetry: () => void;
    pinnedId: string | null;
    onPin: (id: string | null) => void;
    layout: VideoLayout;
    onLayoutChange: (l: VideoLayout) => void;
    connectingLabel?: string;
    /** Display name of the local user (host or guest), shown while they're
     * connected but everyone else's tile hasn't populated yet — so the
     * local participant always sees their own name, the same way a guest
     * always sees theirs once `participants` has entries. */
    localName?: string;
  }) => {
    const { ref: stageRef, size: stageSize } = useElementSize<HTMLDivElement>();

    if (error)
      return (
        <div className="h-full flex flex-col items-center justify-center gap-4 text-center p-6 sm:p-8">
          <div
            className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center"
            style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}
          >
            <WifiOff className="w-6 h-6 sm:w-7 sm:h-7 text-red-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-red-400 mb-1">Connection failed</p>
            <p className="text-xs max-w-xs" style={{ color: T.muted }}>{error}</p>
          </div>
          <button
            onClick={onRetry}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-white min-h-[44px] touch-manipulation"
            style={{ background: "rgba(99,102,241,0.2)", border: "1px solid rgba(99,102,241,0.3)" }}
          >
            <RefreshCw className="w-4 h-4" /> Retry
          </button>
        </div>
      );

    if (isConnecting)
      return (
        <div className="h-full flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: T.accent }} />
          <p className="text-sm" style={{ color: T.muted }}>{connectingLabel}</p>
        </div>
      );

    if (roomName === null && !isConnected)
      return (
        <div className="h-full flex flex-col items-center justify-center gap-3 text-center p-6">
          <Video className="w-12 h-12" style={{ color: T.subtle }} />
          <p className="text-sm" style={{ color: T.muted }}>No video room attached</p>
        </div>
      );

    if (participants.length === 0)
      return (
        <div className="h-full flex flex-col items-center justify-center gap-3 text-center p-6">
          <div
            className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center"
            style={{ background: T.card, border: `1px solid ${T.border}` }}
          >
            <Users className="w-7 h-7 sm:w-8 sm:h-8" style={{ color: T.subtle }} />
          </div>
          {/* Show the local user's own name here too — otherwise the host
             sees a nameless placeholder while a guest, once their tile
             renders via PinnableTile below, always sees their own name. */}
          {localName && (
            <p className="text-sm font-medium text-white/90">
              {localName} <span style={{ color: T.muted }}>(You)</span>
            </p>
          )}
          <p className="text-sm" style={{ color: T.muted }}>Waiting for others to join…</p>
        </div>
      );

    const LayoutSwitcher = (
      <div className="absolute top-2 right-2 sm:top-3 sm:right-3 z-20 flex items-center gap-1 sm:gap-1.5">
        {(["focus", "grid", "sidebar"] as VideoLayout[]).map((l) => {
          const icons = { focus: Maximize2, grid: LayoutGrid, sidebar: PanelRight };
          const Icon = icons[l];
          return (
            <button
              key={l}
              onClick={(e) => { e.stopPropagation(); onLayoutChange(l); }}
              className="w-7 h-7 rounded-lg flex items-center justify-center transition-all touch-manipulation"
              style={{
                background: layout === l ? "rgba(99,102,241,0.85)" : "rgba(0,0,0,0.45)",
                backdropFilter: "blur(8px)",
                border: `1px solid ${layout === l ? "rgba(99,102,241,0.5)" : "rgba(255,255,255,0.1)"}`,
              }}
            >
              <Icon className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-white" />
            </button>
          );
        })}
      </div>
    );

    if (participants.length === 1)
      return (
        <div className="relative h-full">
          {LayoutSwitcher}
          <PinnableTile
            participant={participants[0]}
            activeSpeakerId={activeSpeakerId}
            isPinned={false}
            onPin={onPin}
            isMain
            className="h-full"
          />
        </div>
      );

    // A screen share should automatically become the focus the instant it
    // starts (a manual pin still overrides it).
    const screenSharer = participants.find((p) => p.screen);
    const spotlightId =
      pinnedId ?? screenSharer?.session_id ?? activeSpeakerId ?? participants[0]?.session_id;
    const spotlight =
      participants.find((p) => p.session_id === spotlightId) ?? participants[0];
    const strip = participants.filter((p) => p.session_id !== spotlight.session_id);

    if (layout === "focus")
      return (
        <div className="relative h-full flex flex-col gap-1.5 sm:gap-2">
          {LayoutSwitcher}
          <div className="flex-1 min-h-0">
            <PinnableTile
              participant={spotlight}
              activeSpeakerId={activeSpeakerId}
              isPinned={!!pinnedId}
              onPin={onPin}
              isMain
              className="h-full"
            />
          </div>
          {strip.length > 0 && (
            <div
              className="flex gap-1.5 sm:gap-2 shrink-0 overflow-x-auto pb-1"
              style={{ height: "clamp(64px, 18%, 120px)" }}
            >
              {strip.map((p) => (
                <div
                  key={p.session_id}
                  className="shrink-0 rounded-xl overflow-hidden"
                  style={{ width: "clamp(90px, 140px, 200px)", height: "100%" }}
                >
                  <PinnableTile
                    participant={p}
                    activeSpeakerId={activeSpeakerId}
                    isPinned={pinnedId === p.session_id}
                    onPin={onPin}
                    className="h-full w-full"
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      );

    if (layout === "sidebar")
      return (
        <div className="relative h-full flex gap-1.5 sm:gap-2">
          {LayoutSwitcher}
          <div className="flex-1 min-w-0">
            <PinnableTile
              participant={spotlight}
              activeSpeakerId={activeSpeakerId}
              isPinned={!!pinnedId}
              onPin={onPin}
              isMain
              className="h-full"
            />
          </div>
          {strip.length > 0 && (
            <div
              className="flex flex-col gap-1.5 sm:gap-2 overflow-y-auto"
              style={{ width: "clamp(80px, 22%, 180px)" }}
            >
              {strip.map((p) => (
                <div key={p.session_id} className="shrink-0 rounded-xl overflow-hidden aspect-video">
                  <PinnableTile
                    participant={p}
                    activeSpeakerId={activeSpeakerId}
                    isPinned={pinnedId === p.session_id}
                    onPin={onPin}
                    className="h-full w-full"
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      );

    // ── Grid — packed so every tile is equally large and no cell is empty
    // (except at most a single, centered, short last row for headcounts
    // that don't divide evenly, e.g. 3, 5, 7, 11). ──────────────────────────
    const count = participants.length;
    const { cols, rows } = computeGrid(count, stageSize.w, stageSize.h);
    const fullRows = Math.floor(count / cols);
    const lastRowCount = count - fullRows * cols;

    return (
      <div ref={stageRef} className="relative h-full">
        {LayoutSwitcher}
        <div className="h-full flex flex-col gap-1.5 sm:gap-2">
          {Array.from({ length: fullRows }).map((_, rowIdx) => (
            <div
              key={rowIdx}
              className="flex-1 min-h-0 grid gap-1.5 sm:gap-2"
              style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
            >
              {participants.slice(rowIdx * cols, rowIdx * cols + cols).map((p) => (
                <PinnableTile
                  key={p.session_id}
                  participant={p}
                  activeSpeakerId={activeSpeakerId}
                  isPinned={pinnedId === p.session_id}
                  onPin={onPin}
                  className="h-full w-full"
                />
              ))}
            </div>
          ))}
          {lastRowCount > 0 && (
            // Centered, evenly-sized short last row — never left-aligned
            // with an empty gap on the right, so nothing ever reads as
            // "missing" even at counts like 3, 5, 7, 11.
            <div className="flex-1 min-h-0 flex justify-center gap-1.5 sm:gap-2">
              {participants.slice(fullRows * cols).map((p) => (
                <div
                  key={p.session_id}
                  className="h-full"
                  style={{ width: `calc((100% - ${(cols - 1) * 8}px) / ${cols})` }}
                >
                  <PinnableTile
                    participant={p}
                    activeSpeakerId={activeSpeakerId}
                    isPinned={pinnedId === p.session_id}
                    onPin={onPin}
                    className="h-full w-full"
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  },
);
MeetingVideoGrid.displayName = "MeetingVideoGrid";