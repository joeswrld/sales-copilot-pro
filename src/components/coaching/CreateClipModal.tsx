/**
 * CreateClipModal.tsx
 *
 * Modal for creating a coaching clip.
 * Shows transcript preview, comment field, tags, duration.
 */

import { useState } from "react";
import {
  Scissors, Clock, X, Send, Tag, Loader2, CheckCircle2,
  Copy, ExternalLink, Slack,
} from "lucide-react";
import { useCoachingClips, type TranscriptLine } from "@/hooks/useCoachingClips";
import { cn } from "@/lib/utils";

// ─── Tag presets ──────────────────────────────────────────────────────────

const TAG_PRESETS = [
  { label: "Objection", color: "#ef4444", bg: "rgba(239,68,68,.12)" },
  { label: "Pricing",   color: "#f59e0b", bg: "rgba(245,158,11,.12)" },
  { label: "Discovery", color: "#60a5fa", bg: "rgba(96,165,250,.12)" },
  { label: "Close",     color: "#22c55e", bg: "rgba(34,197,94,.12)" },
  { label: "Rapport",   color: "#a78bfa", bg: "rgba(167,139,250,.12)" },
  { label: "Red Flag",  color: "#f97316", bg: "rgba(249,115,22,.12)" },
  { label: "Best Practice", color: "#2dd4bf", bg: "rgba(45,212,191,.12)" },
];

// ─── Props ────────────────────────────────────────────────────────────────

interface Props {
  callId: string;
  callTitle?: string;
  startSeconds: number;
  endSeconds: number;
  transcriptExcerpt: TranscriptLine[];
  onClose: () => void;
  onCreated: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────

export default function CreateClipModal({
  callId, callTitle, startSeconds, endSeconds,
  transcriptExcerpt, onClose, onCreated,
}: Props) {
  const { createClip, copyShareLink } = useCoachingClips();
  const [comment, setComment] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [customTag, setCustomTag] = useState("");
  const [slackWebhook, setSlackWebhook] = useState(
    () => typeof localStorage !== "undefined" ? localStorage.getItem("fixsense_slack_webhook") || "" : ""
  );
  const [showSlack, setShowSlack] = useState(false);
  const [createdClip, setCreatedClip] = useState<any>(null);

  const duration = Math.round(endSeconds - startSeconds);

  const formatDur = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  const toggleTag = (tag: string) =>
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );

  const addCustomTag = () => {
    const t = customTag.trim();
    if (t && !selectedTags.includes(t)) {
      setSelectedTags(prev => [...prev, t]);
      setCustomTag("");
    }
  };

  const handleCreate = async () => {
    if (!comment.trim()) return;
    if (slackWebhook) localStorage.setItem("fixsense_slack_webhook", slackWebhook);

    const result = await createClip.mutateAsync({
      call_id: callId,
      start_seconds: startSeconds,
      end_seconds: endSeconds,
      transcript_excerpt: transcriptExcerpt,
      manager_comment: comment.trim(),
      tags: selectedTags,
      slack_webhook_url: slackWebhook || undefined,
    });
    setCreatedClip(result);
    onCreated();
  };

  return (
    <>
      <style>{`
        .ccm-overlay {
          position: fixed; inset: 0; z-index: 9999;
          background: rgba(0,0,0,.72); backdrop-filter: blur(10px);
          display: flex; align-items: center; justify-content: center; padding: 20px;
          animation: ccmFadeIn .15s ease;
        }
        @keyframes ccmFadeIn { from { opacity:0; } to { opacity:1; } }
        @keyframes ccmSlideUp { from { opacity:0; transform:translateY(20px) scale(.97); } to { opacity:1; transform:none; } }
        .ccm-panel {
          width: 100%; max-width: 560px; max-height: 88vh; overflow-y: auto;
          background: #0d1117; border: 1px solid rgba(255,255,255,.09);
          border-radius: 18px; padding: 26px;
          animation: ccmSlideUp .18s ease;
          box-shadow: 0 40px 100px rgba(0,0,0,.8);
        }
        .ccm-tag { display: inline-flex; align-items: center; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; cursor: pointer; transition: all .12s; border: 1px solid transparent; }
        .ccm-tag--on { border-color: currentColor; }
        .ccm-ta { width: 100%; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.1); border-radius: 10px; padding: 11px 13px; color: #f0f6fc; font-size: 13px; font-family: 'DM Sans', sans-serif; resize: none; outline: none; line-height: 1.6; transition: border-color .13s; }
        .ccm-ta:focus { border-color: rgba(124,58,237,.5); }
        .ccm-ta::placeholder { color: rgba(255,255,255,.22); }
        .ccm-input { width: 100%; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08); border-radius: 9px; padding: 9px 12px; color: #f0f6fc; font-size: 12px; font-family: 'DM Sans', sans-serif; outline: none; transition: border-color .13s; }
        .ccm-input:focus { border-color: rgba(124,58,237,.4); }
        .ccm-input::placeholder { color: rgba(255,255,255,.2); }
        .ccm-line { padding: 7px 10px; border-radius: 7px; border-left: 2px solid rgba(124,58,237,.3); margin-bottom: 4px; }
        .ccm-scrollbar::-webkit-scrollbar { width: 3px; }
        .ccm-scrollbar::-webkit-scrollbar-thumb { background: rgba(124,58,237,.25); border-radius: 2px; }
      `}</style>

      <div className="ccm-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div className="ccm-panel ccm-scrollbar">
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 34, height: 34, borderRadius: 9,
                background: "rgba(124,58,237,.18)", border: "1px solid rgba(124,58,237,.35)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Scissors style={{ width: 15, height: 15, color: "#a78bfa" }} />
              </div>
              <div>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#f0f6fc", fontFamily: "'Bricolage Grotesque',sans-serif" }}>
                  {createdClip ? "Clip Saved!" : "Create Coaching Clip"}
                </p>
                {callTitle && (
                  <p style={{ margin: 0, fontSize: 11, color: "rgba(255,255,255,.35)" }}>{callTitle}</p>
                )}
              </div>
            </div>
            <button onClick={onClose} style={{
              background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)",
              borderRadius: 8, width: 28, height: 28, display: "flex", alignItems: "center",
              justifyContent: "center", cursor: "pointer", color: "rgba(255,255,255,.4)",
            }}>
              <X style={{ width: 13, height: 13 }} />
            </button>
          </div>

          {/* ── SUCCESS STATE ──────────────────────────────────────────── */}
          {createdClip ? (
            <div>
              <div style={{
                textAlign: "center", padding: "24px 0 20px",
              }}>
                <div style={{
                  width: 56, height: 56, borderRadius: 16,
                  background: "rgba(34,197,94,.12)", border: "1px solid rgba(34,197,94,.25)",
                  display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px",
                }}>
                  <CheckCircle2 style={{ width: 26, height: 26, color: "#4ade80" }} />
                </div>
                <p style={{ fontSize: 16, fontWeight: 700, color: "#f0f6fc", margin: "0 0 6px", fontFamily: "'Bricolage Grotesque',sans-serif" }}>
                  Clip created!
                </p>
                <p style={{ fontSize: 12, color: "rgba(255,255,255,.4)", margin: 0 }}>
                  Share it with your team or anyone via the link below
                </p>
              </div>

              <div style={{
                background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)",
                borderRadius: 10, padding: "10px 13px", marginBottom: 14,
                display: "flex", alignItems: "center", gap: 8,
              }}>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,.5)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "monospace" }}>
                  {window.location.origin}/clip/{createdClip.share_token}
                </span>
                <button
                  onClick={() => copyShareLink(createdClip.share_token)}
                  style={{
                    background: "rgba(124,58,237,.2)", border: "1px solid rgba(124,58,237,.3)",
                    borderRadius: 7, padding: "4px 10px", color: "#a78bfa", fontSize: 11,
                    fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 5,
                    flexShrink: 0,
                  }}
                >
                  <Copy style={{ width: 11, height: 11 }} /> Copy
                </button>
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => window.open(`/clip/${createdClip.share_token}`, "_blank")}
                  style={{
                    flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                    background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)",
                    borderRadius: 9, padding: "10px", color: "rgba(255,255,255,.7)", fontSize: 12,
                    fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
                  }}
                >
                  <ExternalLink style={{ width: 13, height: 13 }} /> Preview Clip
                </button>
                <button
                  onClick={onClose}
                  style={{
                    flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
                    background: "linear-gradient(135deg,#7c3aed,#6d28d9)", border: "none",
                    borderRadius: 9, padding: "10px", color: "#fff", fontSize: 12,
                    fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
                  }}
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            /* ── CREATION FORM ──────────────────────────────────────────── */
            <div>
              {/* Duration badge */}
              <div style={{
                display: "flex", alignItems: "center", gap: 8, marginBottom: 16,
              }}>
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  background: "rgba(124,58,237,.12)", border: "1px solid rgba(124,58,237,.25)",
                  borderRadius: 20, padding: "4px 12px", fontSize: 12, fontWeight: 600, color: "#a78bfa",
                }}>
                  <Clock style={{ width: 11, height: 11 }} />
                  {formatDur(duration)} clip · {transcriptExcerpt.length} lines
                </div>
              </div>

              {/* Transcript preview */}
              <div style={{
                background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.07)",
                borderRadius: 11, padding: "12px", marginBottom: 16, maxHeight: 180, overflowY: "auto",
              }} className="ccm-scrollbar">
                <p style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,.3)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 8 }}>
                  Selected excerpt
                </p>
                {transcriptExcerpt.map((line, i) => {
                  const isRep = line.speaker === "Rep" || line.speaker === "You";
                  return (
                    <div key={i} className="ccm-line" style={{
                      borderLeftColor: isRep ? "rgba(129,140,248,.4)" : "rgba(45,212,191,.3)",
                    }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: isRep ? "#818cf8" : "#2dd4bf", marginRight: 8 }}>
                        {line.speaker}
                      </span>
                      <span style={{ fontSize: 12, color: "rgba(255,255,255,.6)", lineHeight: 1.5 }}>
                        {line.text}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Manager comment */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,.45)", textTransform: "uppercase", letterSpacing: ".07em", display: "block", marginBottom: 6 }}>
                  Coaching comment *
                </label>
                <textarea
                  className="ccm-ta"
                  rows={3}
                  placeholder="What's the coaching insight here? What did the rep do well or should improve?"
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                />
              </div>

              {/* Tags */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,.45)", textTransform: "uppercase", letterSpacing: ".07em", display: "block", marginBottom: 8 }}>
                  Tags (optional)
                </label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                  {TAG_PRESETS.map(t => (
                    <button
                      key={t.label}
                      className={cn("ccm-tag", selectedTags.includes(t.label) && "ccm-tag--on")}
                      style={{ color: t.color, background: selectedTags.includes(t.label) ? t.bg : "transparent" }}
                      onClick={() => toggleTag(t.label)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    className="ccm-input"
                    style={{ flex: 1 }}
                    placeholder="Custom tag…"
                    value={customTag}
                    onChange={e => setCustomTag(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && addCustomTag()}
                  />
                  <button
                    onClick={addCustomTag}
                    disabled={!customTag.trim()}
                    style={{
                      background: "rgba(124,58,237,.15)", border: "1px solid rgba(124,58,237,.3)",
                      borderRadius: 8, padding: "0 12px", color: "#a78bfa", cursor: "pointer",
                      fontSize: 12, fontWeight: 600, opacity: customTag.trim() ? 1 : 0.4,
                    }}
                  >
                    Add
                  </button>
                </div>
                {selectedTags.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 7 }}>
                    {selectedTags.map(t => (
                      <span key={t} style={{
                        display: "inline-flex", alignItems: "center", gap: 4,
                        background: "rgba(124,58,237,.15)", border: "1px solid rgba(124,58,237,.25)",
                        borderRadius: 20, padding: "2px 9px", fontSize: 11, fontWeight: 600, color: "#a78bfa",
                      }}>
                        <Tag style={{ width: 9, height: 9 }} />
                        {t}
                        <button onClick={() => toggleTag(t)} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,.4)", padding: 0, lineHeight: 1 }}>×</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Slack webhook (collapsible) */}
              <div style={{ marginBottom: 20 }}>
                <button
                  onClick={() => setShowSlack(p => !p)}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    background: "transparent", border: "none", cursor: "pointer",
                    color: "rgba(255,255,255,.35)", fontSize: 11, fontFamily: "'DM Sans',sans-serif",
                    padding: 0,
                  }}
                >
                  <Slack style={{ width: 12, height: 12 }} />
                  {showSlack ? "Hide Slack" : "Notify Slack"} (optional)
                </button>
                {showSlack && (
                  <div style={{ marginTop: 8 }}>
                    <input
                      className="ccm-input"
                      placeholder="https://hooks.slack.com/services/…"
                      value={slackWebhook}
                      onChange={e => setSlackWebhook(e.target.value)}
                    />
                    <p style={{ fontSize: 10, color: "rgba(255,255,255,.2)", marginTop: 4 }}>
                      Saved locally for future clips
                    </p>
                  </div>
                )}
              </div>

              {/* Submit */}
              <button
                onClick={handleCreate}
                disabled={!comment.trim() || createClip.isPending}
                style={{
                  width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  background: comment.trim() && !createClip.isPending
                    ? "linear-gradient(135deg,#7c3aed,#6d28d9)"
                    : "rgba(255,255,255,.07)",
                  border: "none", borderRadius: 11, padding: "13px",
                  color: comment.trim() ? "#fff" : "rgba(255,255,255,.25)",
                  fontSize: 14, fontWeight: 700, cursor: comment.trim() ? "pointer" : "not-allowed",
                  fontFamily: "'DM Sans',sans-serif",
                  boxShadow: comment.trim() ? "0 4px 18px rgba(124,58,237,.45)" : "none",
                  transition: "all .15s",
                }}
              >
                {createClip.isPending
                  ? <><Loader2 style={{ width: 15, height: 15, animation: "spin 1s linear infinite" }} /> Saving…</>
                  : <><Scissors style={{ width: 15, height: 15 }} /> Save Coaching Clip</>}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}