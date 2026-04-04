/**
 * ClipPlayerModal.tsx
 *
 * Plays a coaching clip — seeks recording to start_seconds,
 * stops at end_seconds, shows synced transcript, reactions.
 */

import { useState, useRef, useEffect } from "react";
import {
  X, Copy, ExternalLink, Play, Pause, Volume2,
  Clock, Tag, Eye,
} from "lucide-react";
import { format } from "date-fns";
import type { CoachingClip } from "@/hooks/useCoachingClips";
import { cn } from "@/lib/utils";

const TAG_COLOR: Record<string, string> = {
  "Objection":     "#ef4444",
  "Pricing":       "#f59e0b",
  "Discovery":     "#60a5fa",
  "Close":         "#22c55e",
  "Rapport":       "#a78bfa",
  "Red Flag":      "#f97316",
  "Best Practice": "#2dd4bf",
};

interface Props {
  clip: CoachingClip;
  onClose: () => void;
  onCopyLink: () => void;
}

function formatTime(s: number): string {
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
}

export default function ClipPlayerModal({ clip, onClose, onCopyLink }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(clip.start_seconds || 0);
  const [activeLineIdx, setActiveLineIdx] = useState(0);

  const duration = clip.duration_seconds || (clip.end_seconds - clip.start_seconds);
  const hasRecording = !!clip.call_recording_url;

  // Seek to clip start when recording loads
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !hasRecording) return;
    const onLoad = () => {
      audio.currentTime = clip.start_seconds || 0;
    };
    audio.addEventListener("loadedmetadata", onLoad);
    return () => audio.removeEventListener("loadedmetadata", onLoad);
  }, [clip.start_seconds, hasRecording]);

  // Time update: track progress and stop at end
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => {
      const ct = audio.currentTime;
      setCurrentTime(ct);
      const elapsed = ct - (clip.start_seconds || 0);
      const pct = Math.min((elapsed / duration) * 100, 100);
      setProgress(pct);

      // Active transcript line
      const relSec = elapsed;
      const lines = clip.transcript_excerpt || [];
      let idx = 0;
      for (let i = 0; i < lines.length; i++) {
        const lineSec = lines[i].seconds ?? (i * (duration / Math.max(lines.length, 1)));
        if (relSec >= lineSec) idx = i;
      }
      setActiveLineIdx(idx);

      // Stop at end
      if (ct >= (clip.end_seconds || Infinity)) {
        audio.pause();
        setPlaying(false);
      }
    };
    audio.addEventListener("timeupdate", onTime);
    return () => audio.removeEventListener("timeupdate", onTime);
  }, [clip]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      // Rewind to start if past end
      if (audio.currentTime >= (clip.end_seconds || Infinity)) {
        audio.currentTime = clip.start_seconds || 0;
      }
      audio.play();
      setPlaying(true);
    }
  };

  const seekTo = (pct: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = (clip.start_seconds || 0) + (pct / 100) * duration;
  };

  return (
    <>
      <style>{`
        .cpm-overlay { position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.8);backdrop-filter:blur(12px);display:flex;align-items:center;justify-content:center;padding:20px;animation:cpmFade .15s ease; }
        @keyframes cpmFade { from{opacity:0} to{opacity:1} }
        @keyframes cpmUp   { from{opacity:0;transform:translateY(18px) scale(.97)} to{opacity:1;transform:none} }
        .cpm-panel { width:100%;max-width:580px;max-height:90vh;overflow-y:auto;background:#0a0d16;border:1px solid rgba(255,255,255,.09);border-radius:20px;animation:cpmUp .18s ease;box-shadow:0 40px 100px rgba(0,0,0,.9); }
        .cpm-scrollbar::-webkit-scrollbar{width:3px}
        .cpm-scrollbar::-webkit-scrollbar-thumb{background:rgba(124,58,237,.2);border-radius:2px}
        .cpm-progress { height:4px;background:rgba(255,255,255,.08);border-radius:2px;cursor:pointer;position:relative; }
        .cpm-progress-fill { height:100%;background:linear-gradient(90deg,#7c3aed,#6d28d9);border-radius:2px;transition:width .1s; }
        .cpm-progress-thumb { position:absolute;top:50%;transform:translate(-50%,-50%);width:12px;height:12px;border-radius:50%;background:#a78bfa;box-shadow:0 0 6px rgba(124,58,237,.6);cursor:pointer; }
        .line-active { background:rgba(124,58,237,.15)!important;border-left-color:rgba(124,58,237,.6)!important; }
      `}</style>

      <div className="cpm-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
        <div className="cpm-panel cpm-scrollbar">
          {/* Header */}
          <div style={{
            display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12,
            padding: "20px 20px 0",
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: "0 0 3px", fontSize: 15, fontWeight: 700, color: "#f0f6fc", fontFamily: "'Bricolage Grotesque',sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {clip.title || "Coaching Clip"}
              </p>
              <p style={{ margin: 0, fontSize: 11, color: "rgba(255,255,255,.35)" }}>
                {clip.call_title} · Created by {clip.creator_name} · {format(new Date(clip.created_at), "MMM d, yyyy")}
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 7, flexShrink: 0 }}>
              <button onClick={onCopyLink} style={{
                display: "flex", alignItems: "center", gap: 5,
                background: "rgba(124,58,237,.15)", border: "1px solid rgba(124,58,237,.3)",
                borderRadius: 8, padding: "6px 11px", color: "#a78bfa",
                fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
              }}>
                <Copy style={{ width: 11, height: 11 }} /> Share
              </button>
              <button onClick={onClose} style={{
                background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)",
                borderRadius: 8, width: 30, height: 30, display: "flex", alignItems: "center",
                justifyContent: "center", cursor: "pointer", color: "rgba(255,255,255,.4)",
              }}>
                <X style={{ width: 14, height: 14 }} />
              </button>
            </div>
          </div>

          {/* Tags */}
          {clip.tags?.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, padding: "12px 20px 0" }}>
              {clip.tags.map(t => (
                <span key={t} style={{
                  fontSize: 10, fontWeight: 700, padding: "2px 9px", borderRadius: 20,
                  color: TAG_COLOR[t] || "#94a3b8",
                  background: `${TAG_COLOR[t] || "#94a3b8"}18`,
                  border: `1px solid ${TAG_COLOR[t] || "#94a3b8"}30`,
                }}>
                  {t}
                </span>
              ))}
            </div>
          )}

          {/* Player */}
          <div style={{ padding: "16px 20px" }}>
            {hasRecording ? (
              <div style={{
                background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.07)",
                borderRadius: 12, padding: "16px",
              }}>
                <audio ref={audioRef} src={clip.call_recording_url!} preload="metadata" />

                {/* Play / progress row */}
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <button onClick={togglePlay} style={{
                    width: 42, height: 42, borderRadius: 12, flexShrink: 0,
                    background: "linear-gradient(135deg,#7c3aed,#6d28d9)",
                    border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                    boxShadow: "0 4px 14px rgba(124,58,237,.45)",
                  }}>
                    {playing
                      ? <Pause style={{ width: 16, height: 16, color: "#fff" }} />
                      : <Play style={{ width: 16, height: 16, color: "#fff", marginLeft: 2 }} />}
                  </button>
                  <div style={{ flex: 1 }}>
                    <div
                      className="cpm-progress"
                      onClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        seekTo(((e.clientX - rect.left) / rect.width) * 100);
                      }}
                    >
                      <div className="cpm-progress-fill" style={{ width: `${progress}%` }} />
                      <div className="cpm-progress-thumb" style={{ left: `${progress}%` }} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5 }}>
                      <span style={{ fontSize: 10, color: "rgba(255,255,255,.35)" }}>
                        {formatTime(currentTime - (clip.start_seconds || 0))}
                      </span>
                      <span style={{ fontSize: 10, color: "rgba(255,255,255,.35)" }}>
                        {formatTime(duration)}
                      </span>
                    </div>
                  </div>
                  <Volume2 style={{ width: 14, height: 14, color: "rgba(255,255,255,.3)", flexShrink: 0 }} />
                </div>
              </div>
            ) : (
              <div style={{
                background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.07)",
                borderRadius: 12, padding: "16px", textAlign: "center",
              }}>
                <Clock style={{ width: 20, height: 20, color: "rgba(255,255,255,.3)", margin: "0 auto 8px" }} />
                <p style={{ fontSize: 12, color: "rgba(255,255,255,.4)", margin: 0 }}>
                  Recording not available · {formatTime(duration)} clip
                </p>
              </div>
            )}
          </div>

          {/* Transcript */}
          <div style={{ padding: "0 20px 16px" }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,.3)", textTransform: "uppercase", letterSpacing: ".08em", margin: "0 0 8px" }}>
              Transcript
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {(clip.transcript_excerpt || []).map((line, i) => {
                const isRep = line.speaker === "Rep" || line.speaker === "You";
                const isActive = i === activeLineIdx && playing;
                return (
                  <div key={i}
                    className={isActive ? "line-active" : ""}
                    style={{
                      padding: "7px 10px", borderRadius: 8,
                      borderLeft: `2px solid ${isRep ? "rgba(129,140,248,.3)" : "rgba(45,212,191,.25)"}`,
                      background: isActive ? undefined : "rgba(255,255,255,.02)",
                      transition: "background .2s, border-left-color .2s",
                    }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: isRep ? "#818cf8" : "#2dd4bf", marginRight: 7 }}>
                      {line.speaker}
                    </span>
                    <span style={{ fontSize: 12, color: isActive ? "#f0f6fc" : "rgba(255,255,255,.6)", lineHeight: 1.55 }}>
                      {line.text}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Manager comment */}
          <div style={{ padding: "0 20px 20px" }}>
            <div style={{
              background: "rgba(124,58,237,.08)", border: "1px solid rgba(124,58,237,.2)",
              borderRadius: 11, padding: "13px 14px",
            }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: "#a78bfa", textTransform: "uppercase", letterSpacing: ".07em", margin: "0 0 6px" }}>
                💬 Manager Comment
              </p>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,.75)", lineHeight: 1.6, margin: 0 }}>
                {clip.manager_comment}
              </p>
            </div>
          </div>

          {/* Footer */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "12px 20px", borderTop: "1px solid rgba(255,255,255,.06)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "rgba(255,255,255,.28)" }}>
                <Eye style={{ width: 11, height: 11 }} /> {clip.view_count} views
              </span>
            </div>
            <a
              href={`/clip/${clip.share_token}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "flex", alignItems: "center", gap: 5, fontSize: 11,
                color: "#60a5fa", textDecoration: "none",
              }}
            >
              <ExternalLink style={{ width: 11, height: 11 }} /> Open public page
            </a>
          </div>
        </div>
      </div>
    </>
  );
}