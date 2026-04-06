/**
 * CoachingClipsTab.tsx
 *
 * Coaching Clip Library inside the Team → Coaching tab.
 * Shows all team clips with filters, search, playback, and sharing.
 */

import { useState, useMemo } from "react";
import {
  Scissors, Play, Copy, Trash2, ExternalLink, Search, Tag,
  Clock, Eye, MessageSquare, Filter, ChevronRight, Smile,
  Loader2, Film, TrendingUp, Users, Plus, ListMusic, Star, ArrowLeft,
} from "lucide-react";
import { format } from "date-fns";
import { useCoachingClips, type CoachingClip } from "@/hooks/useCoachingClips";
import { useCoachingPlaylists, type CoachingPlaylist } from "@/hooks/useCoachingPlaylists";
import { useAuth } from "@/contexts/AuthContext";
import { useTeam } from "@/hooks/useTeam";
import { cn } from "@/lib/utils";
import ClipPlayerModal from "./ClipPlayerModal";

// ─── Tag colors ───────────────────────────────────────────────────────────

const TAG_COLOR: Record<string, string> = {
  "Objection":     "#ef4444",
  "Pricing":       "#f59e0b",
  "Discovery":     "#60a5fa",
  "Close":         "#22c55e",
  "Rapport":       "#a78bfa",
  "Red Flag":      "#f97316",
  "Best Practice": "#2dd4bf",
};

const QUICK_REACTIONS = ["👍", "🔥", "💡", "⚡", "🎯"];

// ─── Clip Card ────────────────────────────────────────────────────────────

function ClipCard({
  clip,
  isAdmin,
  myId,
  onPlay,
  onDelete,
  onCopy,
  onReact,
}: {
  clip: CoachingClip;
  isAdmin: boolean;
  myId: string;
  onPlay: () => void;
  onDelete: () => void;
  onCopy: () => void;
  onReact: (emoji: string) => void;
}) {
  const [showReactions, setShowReactions] = useState(false);

  const durationLabel = (() => {
    const s = Math.round(clip.duration_seconds || 0);
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
  })();

  const firstLine = clip.transcript_excerpt?.[0];
  const isMe = clip.creator_id === myId;

  return (
    <div style={{
      background: "rgba(255,255,255,.025)", border: "1px solid rgba(255,255,255,.07)",
      borderRadius: 14, overflow: "hidden",
      transition: "border-color .15s, box-shadow .15s",
    }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.borderColor = "rgba(124,58,237,.28)";
        (e.currentTarget as HTMLElement).style.boxShadow = "0 8px 28px rgba(124,58,237,.12)";
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,.07)";
        (e.currentTarget as HTMLElement).style.boxShadow = "none";
      }}
    >
      {/* Play button banner */}
      <button
        onClick={onPlay}
        style={{
          width: "100%", padding: "18px 16px 12px",
          background: "linear-gradient(135deg, rgba(124,58,237,.1), rgba(45,212,191,.06))",
          border: "none", cursor: "pointer", textAlign: "left", display: "block",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 11 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 10, flexShrink: 0,
            background: "linear-gradient(135deg, #7c3aed, #6d28d9)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 4px 14px rgba(124,58,237,.4)",
          }}>
            <Play style={{ width: 15, height: 15, color: "#fff", marginLeft: 2 }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: "0 0 3px", fontSize: 13, fontWeight: 700, color: "#f0f6fc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {clip.title || "Coaching Clip"}
            </p>
            <p style={{ margin: 0, fontSize: 11, color: "rgba(255,255,255,.35)" }}>
              {clip.call_title} · {durationLabel}
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
            <Eye style={{ width: 10, height: 10, color: "rgba(255,255,255,.25)" }} />
            <span style={{ fontSize: 10, color: "rgba(255,255,255,.25)" }}>{clip.view_count}</span>
          </div>
        </div>
      </button>

      {/* Body */}
      <div style={{ padding: "10px 14px 12px" }}>
        {/* Excerpt preview */}
        {firstLine && (
          <div style={{
            background: "rgba(255,255,255,.03)", borderLeft: "2px solid rgba(124,58,237,.3)",
            borderRadius: "0 7px 7px 0", padding: "7px 10px", marginBottom: 10,
          }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: "#818cf8", marginRight: 6 }}>
              {firstLine.speaker}
            </span>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,.5)", lineHeight: 1.4 }}>
              "{firstLine.text?.slice(0, 80)}{(firstLine.text?.length || 0) > 80 ? "…" : ""}"
            </span>
          </div>
        )}

        {/* Comment */}
        <p style={{ fontSize: 12, color: "rgba(255,255,255,.65)", lineHeight: 1.55, margin: "0 0 10px" }}>
          <span style={{ color: "rgba(255,255,255,.35)", fontSize: 10, fontWeight: 700, marginRight: 5 }}>
            💬
          </span>
          {clip.manager_comment}
        </p>

        {/* Tags */}
        {clip.tags?.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
            {clip.tags.map(t => (
              <span key={t} style={{
                fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
                color: TAG_COLOR[t] || "#94a3b8",
                background: `${TAG_COLOR[t] || "#94a3b8"}18`,
                border: `1px solid ${TAG_COLOR[t] || "#94a3b8"}30`,
              }}>
                {t}
              </span>
            ))}
          </div>
        )}

        {/* Reactions */}
        {clip.reactions && clip.reactions.length > 0 && (
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 8 }}>
            {clip.reactions.map(r => (
              <button
                key={r.emoji}
                onClick={() => onReact(r.emoji)}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 3,
                  background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)",
                  borderRadius: 20, padding: "2px 8px", cursor: "pointer", fontSize: 13,
                }}
              >
                {r.emoji}
                <span style={{ fontSize: 10, color: "rgba(255,255,255,.5)", fontWeight: 600 }}>
                  {r.count}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Footer */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 8, borderTop: "1px solid rgba(255,255,255,.05)" }}>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,.28)" }}>
            {clip.creator_name} · {format(new Date(clip.created_at), "MMM d")}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            {/* Quick reactions */}
            <div style={{ position: "relative" }}>
              <button
                onClick={() => setShowReactions(p => !p)}
                style={{
                  background: "transparent", border: "1px solid transparent", borderRadius: 7,
                  width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer", color: "rgba(255,255,255,.3)", transition: ".12s",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,.07)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              >
                <Smile style={{ width: 12, height: 12 }} />
              </button>
              {showReactions && (
                <div style={{
                  position: "absolute", bottom: "calc(100% + 4px)", right: 0, zIndex: 99,
                  background: "rgba(10,13,22,.97)", border: "1px solid rgba(255,255,255,.1)",
                  borderRadius: 10, padding: "7px 10px", display: "flex", gap: 5,
                  boxShadow: "0 12px 30px rgba(0,0,0,.6)",
                }}>
                  {QUICK_REACTIONS.map(e => (
                    <button key={e} onClick={() => { onReact(e); setShowReactions(false); }}
                      style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", padding: "2px", borderRadius: 6, transition: ".1s" }}
                      onMouseEnter={ev => { (ev.currentTarget as HTMLElement).style.background = "rgba(255,255,255,.1)"; }}
                      onMouseLeave={ev => { (ev.currentTarget as HTMLElement).style.background = "none"; }}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button onClick={onCopy} style={{
              background: "transparent", border: "1px solid transparent", borderRadius: 7,
              width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", color: "rgba(255,255,255,.3)",
            }}
              title="Copy share link"
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,.07)"; (e.currentTarget as HTMLElement).style.color = "#a78bfa"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,.3)"; }}
            >
              <Copy style={{ width: 11, height: 11 }} />
            </button>

            <button onClick={() => window.open(`/clip/${clip.share_token}`, "_blank")} style={{
              background: "transparent", border: "1px solid transparent", borderRadius: 7,
              width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", color: "rgba(255,255,255,.3)",
            }}
              title="Open clip page"
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,.07)"; (e.currentTarget as HTMLElement).style.color = "#60a5fa"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,.3)"; }}
            >
              <ExternalLink style={{ width: 11, height: 11 }} />
            </button>

            {(isMe || isAdmin) && (
              <button onClick={onDelete} style={{
                background: "transparent", border: "1px solid transparent", borderRadius: 7,
                width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", color: "rgba(255,255,255,.3)",
              }}
                title="Delete clip"
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(239,68,68,.12)"; (e.currentTarget as HTMLElement).style.color = "#f87171"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,.3)"; }}
              >
                <Trash2 style={{ width: 11, height: 11 }} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────

export default function CoachingClipsTab() {
  const { user } = useAuth();
  const { role } = useTeam();
  const { teamClips, isLoading, deleteClip, toggleReaction, copyShareLink, totalClips, totalViews } = useCoachingClips();
  const { playlists, isLoading: playlistsLoading, createPlaylist, deletePlaylist, addClipToPlaylist } = useCoachingPlaylists();

  const [search, setSearch] = useState("");
  const [filterTag, setFilterTag] = useState("");
  const [filterMember, setFilterMember] = useState("");
  const [filterRating, setFilterRating] = useState("");
  const [playClip, setPlayClip] = useState<CoachingClip | null>(null);
  const [activePlaylist, setActivePlaylist] = useState<string | null>(null);
  const [showCreatePlaylist, setShowCreatePlaylist] = useState(false);
  const [newPlaylistTitle, setNewPlaylistTitle] = useState("");
  const [newPlaylistDesc, setNewPlaylistDesc] = useState("");

  const isAdmin = role === "admin" || role === "manager";

  // All unique tags & members across clips
  const allTags = useMemo(() => [...new Set(teamClips.flatMap(c => c.tags || []))], [teamClips]);
  const allMembers = useMemo(() => {
    const map = new Map<string, string>();
    teamClips.forEach(c => { if (c.creator_id) map.set(c.creator_id, c.creator_name || "Unknown"); });
    return Array.from(map.entries());
  }, [teamClips]);

  const filtered = useMemo(() =>
    teamClips.filter(c => {
      if (search && !c.title?.toLowerCase().includes(search.toLowerCase()) &&
        !c.manager_comment.toLowerCase().includes(search.toLowerCase()) &&
        !c.call_title.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterTag && !c.tags?.includes(filterTag)) return false;
      if (filterMember && c.creator_id !== filterMember) return false;
      return true;
    }),
    [teamClips, search, filterTag, filterMember]
  );

  if (isLoading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}>
        <Loader2 style={{ width: 22, height: 22, color: "#7c3aed", animation: "spin 1s linear infinite" }} />
      </div>
    );
  }

  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <div style={{ fontFamily: "'DM Sans', sans-serif" }}>
        {/* ── Header ────────────────────────────────────────────────────── */}
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--foreground)", margin: "0 0 4px", fontFamily: "'Bricolage Grotesque',sans-serif" }}>
            Coaching Clips
          </h2>
          <p style={{ fontSize: 12, color: "var(--muted-foreground)", margin: 0 }}>
            Highlight key moments from calls. Share them to coach your team at scale.
          </p>
        </div>

        {/* ── Stats ─────────────────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 20 }}>
          {[
            { label: "Total Clips", value: totalClips, icon: Scissors, color: "#a78bfa" },
            { label: "Total Views", value: totalViews, icon: Eye,      color: "#60a5fa" },
            { label: "Unique Tags", value: allTags.length, icon: Tag,  color: "#2dd4bf" },
          ].map(s => (
            <div key={s.label} style={{
              background: "var(--secondary)", border: "1px solid var(--border)",
              borderRadius: 12, padding: "14px 16px",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <s.icon style={{ width: 14, height: 14, color: "var(--muted-foreground)" }} />
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: s.color, fontFamily: "'Bricolage Grotesque',sans-serif", lineHeight: 1 }}>
                {s.value}
              </div>
              <div style={{ fontSize: 10, color: "var(--muted-foreground)", marginTop: 3, textTransform: "uppercase", letterSpacing: ".06em" }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>

        {/* ── Filters ───────────────────────────────────────────────────── */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16, alignItems: "center" }}>
          {/* Search */}
          <div style={{ position: "relative", flex: "1 1 180px" }}>
            <Search style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 13, height: 13, color: "var(--muted-foreground)" }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search clips…"
              style={{
                width: "100%", paddingLeft: 30, paddingRight: 10, paddingTop: 7, paddingBottom: 7,
                background: "var(--secondary)", border: "1px solid var(--border)", borderRadius: 9,
                color: "var(--foreground)", fontSize: 12, outline: "none", fontFamily: "'DM Sans',sans-serif",
              }}
            />
          </div>

          {/* Tag filter */}
          {allTags.length > 0 && (
            <select
              value={filterTag}
              onChange={e => setFilterTag(e.target.value)}
              style={{
                background: "var(--secondary)", border: "1px solid var(--border)", borderRadius: 9,
                padding: "7px 12px", color: "var(--muted-foreground)", fontSize: 12, outline: "none",
                cursor: "pointer",
              }}
            >
              <option value="">All tags</option>
              {allTags.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          )}

          {/* Member filter */}
          {allMembers.length > 1 && (
            <select
              value={filterMember}
              onChange={e => setFilterMember(e.target.value)}
              style={{
                background: "var(--secondary)", border: "1px solid var(--border)", borderRadius: 9,
                padding: "7px 12px", color: "var(--muted-foreground)", fontSize: 12, outline: "none",
                cursor: "pointer",
              }}
            >
              <option value="">All members</option>
              {allMembers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          )}

          {(search || filterTag || filterMember) && (
            <button
              onClick={() => { setSearch(""); setFilterTag(""); setFilterMember(""); }}
              style={{
                background: "transparent", border: "1px solid var(--border)", borderRadius: 8,
                padding: "6px 12px", color: "var(--muted-foreground)", fontSize: 11,
                fontWeight: 600, cursor: "pointer",
              }}
            >
              Clear
            </button>
          )}

          <span style={{ fontSize: 11, color: "var(--muted-foreground)", marginLeft: "auto" }}>
            {filtered.length} clip{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* ── Empty state ────────────────────────────────────────────────── */}
        {teamClips.length === 0 ? (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            padding: "64px 20px", textAlign: "center",
            background: "var(--secondary)", borderRadius: 16, border: "1px solid var(--border)",
          }}>
            <div style={{
              width: 60, height: 60, borderRadius: 16, marginBottom: 16,
              background: "rgba(124,58,237,.1)", border: "1px solid rgba(124,58,237,.2)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Film style={{ width: 26, height: 26, color: "#a78bfa" }} />
            </div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--foreground)", margin: "0 0 8px", fontFamily: "'Bricolage Grotesque',sans-serif" }}>
              No coaching clips yet
            </h3>
            <p style={{ fontSize: 13, color: "var(--muted-foreground)", maxWidth: 280, margin: "0 0 20px", lineHeight: 1.6 }}>
              Open any completed call → scroll to the transcript → select lines and click "Create Clip"
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "rgba(167,139,250,.8)" }}>
              <Scissors style={{ width: 13, height: 13 }} />
              Available in Call Detail → Transcript section
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--muted-foreground)", fontSize: 13 }}>
            No clips match your filters.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
            {filtered.map(clip => (
              <ClipCard
                key={clip.id}
                clip={clip}
                isAdmin={isAdmin}
                myId={user?.id ?? ""}
                onPlay={() => setPlayClip(clip)}
                onDelete={() => deleteClip.mutate(clip.id)}
                onCopy={() => copyShareLink(clip.share_token)}
                onReact={(emoji) => toggleReaction.mutate({ clipId: clip.id, emoji })}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Player modal ──────────────────────────────────────────────────── */}
      {playClip && (
        <ClipPlayerModal
          clip={playClip}
          onClose={() => setPlayClip(null)}
          onCopyLink={() => copyShareLink(playClip.share_token)}
        />
      )}
    </>
  );
}