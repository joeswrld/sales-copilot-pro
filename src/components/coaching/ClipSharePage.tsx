/**
 * ClipSharePage.tsx
 *
 * Public clip page at /clip/:shareToken
 * No auth required. Shows transcript, plays recording, shows comment.
 */

import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  Play, Pause, Volume2, Clock, Tag, Eye, Copy,
  CheckCircle2, Loader2, AlertCircle, Zap, ChevronLeft,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const TAG_COLOR: Record<string, string> = {
  "Objection":     "#ef4444",
  "Pricing":       "#f59e0b",
  "Discovery":     "#60a5fa",
  "Close":         "#22c55e",
  "Rapport":       "#a78bfa",
  "Red Flag":      "#f97316",
  "Best Practice": "#2dd4bf",
};

function formatTime(s: number): string {
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
}

export default function ClipSharePage() {
  const { shareToken } = useParams<{ shareToken: string }>();
  const [clip, setClip] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [activeLineIdx, setActiveLineIdx] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Fetch clip
  useEffect(() => {
    if (!shareToken) return;
    (async () => {
      try {
        const { data, error: err } = await supabase.rpc("get_public_clip", {
          p_share_token: shareToken,
        });
        if (err || !data || data.length === 0) throw new Error("Clip not found or no longer available");
        setClip(data[0]);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [shareToken]);

  // Seek on load
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !clip?.call_recording_url) return;
    const fn = () => { audio.currentTime = clip.start_seconds || 0; };
    audio.addEventListener("loadedmetadata", fn);
    return () => audio.removeEventListener("loadedmetadata", fn);
  }, [clip]);

  // Time update
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !clip) return;
    const duration = clip.duration_seconds || (clip.end_seconds - clip.start_seconds) || 1;
    const fn = () => {
      const elapsed = audio.currentTime - (clip.start_seconds || 0);
      setProgress(Math.min((elapsed / duration) * 100, 100));
      const lines = clip.transcript_excerpt || [];
      let idx = 0;
      for (let i = 0; i < lines.length; i++) {
        const lineSec = lines[i].seconds ?? (i * (duration / Math.max(lines.length, 1)));
        if (elapsed >= lineSec) idx = i;
      }
      setActiveLineIdx(idx);
      if (audio.currentTime >= (clip.end_seconds || Infinity)) {
        audio.pause(); setPlaying(false);
      }
    };
    audio.addEventListener("timeupdate", fn);
    return () => audio.removeEventListener("timeupdate", fn);
  }, [clip]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) { audio.pause(); setPlaying(false); }
    else {
      if (audio.currentTime >= ((clip?.end_seconds) || Infinity)) audio.currentTime = clip?.start_seconds || 0;
      audio.play(); setPlaying(true);
    }
  };

  const seekTo = (pct: number) => {
    const audio = audioRef.current;
    if (!audio || !clip) return;
    const dur = clip.duration_seconds || (clip.end_seconds - clip.start_seconds) || 1;
    audio.currentTime = (clip.start_seconds || 0) + (pct / 100) * dur;
  };

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=Bricolage+Grotesque:wght@600;700;800&display=swap');
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    .cp-root{min-height:100vh;background:#060912;color:#f0f6fc;font-family:'DM Sans',sans-serif;-webkit-font-smoothing:antialiased;}
    .cp-nav{display:flex;align-items:center;justify-content:space-between;padding:14px 24px;border-bottom:1px solid rgba(255,255,255,.06);}
    .cp-nav-brand{display:flex;align-items:center;gap:8px;text-decoration:none;}
    .cp-logo{width:28px;height:28px;border-radius:8px;background:linear-gradient(135deg,#7c3aed,#6d28d9);display:flex;align-items:center;justify-content:center;}
    .cp-brand-name{font-family:'Bricolage Grotesque',sans-serif;font-size:16px;font-weight:700;color:#f0f6fc;letter-spacing:-.03em;}
    .cp-content{max-width:640px;margin:0 auto;padding:40px 20px 80px;}
    .cp-header{margin-bottom:28px;}
    .cp-eyebrow{font-size:11px;font-weight:700;color:#a78bfa;text-transform:uppercase;letter-spacing:.1em;margin-bottom:10px;display:flex;align-items:center;gap:6px;}
    .cp-title{font-family:'Bricolage Grotesque',sans-serif;font-size:clamp(22px,4vw,32px);font-weight:800;color:#f0f6fc;letter-spacing:-.04em;line-height:1.1;margin-bottom:8px;}
    .cp-meta{font-size:12px;color:rgba(255,255,255,.35);}
    .cp-player{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:20px;margin-bottom:20px;}
    .cp-play-btn{width:48px;height:48px;border-radius:13px;background:linear-gradient(135deg,#7c3aed,#6d28d9);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 18px rgba(124,58,237,.45);flex-shrink:0;transition:transform .15s;}
    .cp-play-btn:hover{transform:scale(1.06);}
    .cp-prog{height:5px;background:rgba(255,255,255,.08);border-radius:3px;cursor:pointer;position:relative;flex:1;}
    .cp-prog-fill{height:100%;background:linear-gradient(90deg,#7c3aed,#a78bfa);border-radius:3px;transition:width .1s;}
    .cp-prog-thumb{position:absolute;top:50%;transform:translate(-50%,-50%);width:13px;height:13px;border-radius:50%;background:#a78bfa;box-shadow:0 0 8px rgba(124,58,237,.7);cursor:pointer;}
    .cp-transcript{margin-bottom:20px;}
    .cp-line{padding:8px 11px;border-radius:9px;border-left:2px solid rgba(124,58,237,.25);margin-bottom:5px;transition:background .2s,border-left-color .2s;}
    .cp-line--active{background:rgba(124,58,237,.12)!important;border-left-color:rgba(124,58,237,.7)!important;}
    .cp-comment{background:rgba(124,58,237,.08);border:1px solid rgba(124,58,237,.2);border-radius:13px;padding:16px;margin-bottom:20px;}
    .cp-copy-btn{display:flex;align-items:center;gap:6px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:9px;padding:9px 16px;color:rgba(255,255,255,.7);font-size:12px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;transition:all .13s;}
    .cp-copy-btn:hover{background:rgba(124,58,237,.15);border-color:rgba(124,58,237,.3);color:#a78bfa;}
    .cp-error{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:50vh;text-align:center;padding:40px 20px;}
    .cp-scrollbar::-webkit-scrollbar{width:3px}
    .cp-scrollbar::-webkit-scrollbar-thumb{background:rgba(124,58,237,.2);border-radius:2px}
    @keyframes spin{to{transform:rotate(360deg)}}
  `;

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "#060912", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <style>{css}</style>
      <Loader2 style={{ width: 28, height: 28, color: "#7c3aed", animation: "spin 1s linear infinite" }} />
    </div>
  );

  if (error || !clip) return (
    <div className="cp-root">
      <style>{css}</style>
      <nav className="cp-nav">
        <Link to="/" className="cp-nav-brand">
          <div className="cp-logo"><Zap style={{ width: 14, height: 14, color: "#fff" }} /></div>
          <span className="cp-brand-name">Fixsense</span>
        </Link>
      </nav>
      <div className="cp-error">
        <AlertCircle style={{ width: 40, height: 40, color: "rgba(239,68,68,.6)", marginBottom: 16 }} />
        <h2 style={{ fontSize: 20, fontWeight: 700, fontFamily: "'Bricolage Grotesque',sans-serif", marginBottom: 8 }}>Clip not found</h2>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,.4)", maxWidth: 280, lineHeight: 1.6 }}>
          This clip may have been removed or the link is invalid.
        </p>
      </div>
    </div>
  );

  const duration = clip.duration_seconds || (clip.end_seconds - clip.start_seconds) || 0;
  const elapsedSec = clip.call_recording_url && audioRef.current
    ? audioRef.current.currentTime - (clip.start_seconds || 0)
    : 0;

  return (
    <div className="cp-root cp-scrollbar">
      <style>{css}</style>

      <nav className="cp-nav">
        <Link to="/" className="cp-nav-brand">
          <div className="cp-logo"><Zap style={{ width: 14, height: 14, color: "#fff" }} /></div>
          <span className="cp-brand-name">Fixsense</span>
        </Link>
        <button className="cp-copy-btn" onClick={copyLink}>
          {copied
            ? <><CheckCircle2 style={{ width: 13, height: 13, color: "#4ade80" }} /> Copied!</>
            : <><Copy style={{ width: 13, height: 13 }} /> Copy Link</>}
        </button>
      </nav>

      <div className="cp-content">
        {/* Header */}
        <div className="cp-header">
          <div className="cp-eyebrow">
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#a78bfa", display: "inline-block" }} />
            Coaching Clip · {clip.creator_name}
          </div>
          <h1 className="cp-title">{clip.title || "Coaching Clip"}</h1>
          <p className="cp-meta">
            From <strong style={{ color: "rgba(255,255,255,.6)" }}>{clip.call_title}</strong>
            &nbsp;·&nbsp;{formatTime(duration)} &nbsp;·&nbsp;
            <Eye style={{ display: "inline", width: 11, height: 11 }} /> {clip.view_count} views
          </p>
          {clip.tags?.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 12 }}>
              {clip.tags.map((t: string) => (
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
        </div>

        {/* Player */}
        <div className="cp-player">
          {clip.call_recording_url ? (
            <>
              <audio ref={audioRef} src={clip.call_recording_url} preload="metadata" />
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <button className="cp-play-btn" onClick={togglePlay}>
                  {playing
                    ? <Pause style={{ width: 18, height: 18, color: "#fff" }} />
                    : <Play style={{ width: 18, height: 18, color: "#fff", marginLeft: 2 }} />}
                </button>
                <div style={{ flex: 1 }}>
                  <div
                    className="cp-prog"
                    onClick={e => {
                      const r = e.currentTarget.getBoundingClientRect();
                      seekTo(((e.clientX - r.left) / r.width) * 100);
                    }}
                  >
                    <div className="cp-prog-fill" style={{ width: `${progress}%` }} />
                    <div className="cp-prog-thumb" style={{ left: `${progress}%` }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,.3)" }}>
                      {formatTime(Math.max(0, elapsedSec))}
                    </span>
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,.3)" }}>
                      {formatTime(duration)}
                    </span>
                  </div>
                </div>
                <Volume2 style={{ width: 14, height: 14, color: "rgba(255,255,255,.28)", flexShrink: 0 }} />
              </div>
            </>
          ) : (
            <div style={{ textAlign: "center", padding: "12px 0" }}>
              <Clock style={{ width: 20, height: 20, color: "rgba(255,255,255,.3)", margin: "0 auto 8px" }} />
              <p style={{ fontSize: 12, color: "rgba(255,255,255,.4)" }}>
                Recording not available · {formatTime(duration)} clip
              </p>
            </div>
          )}
        </div>

        {/* Transcript */}
        <div className="cp-transcript">
          <p style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,.28)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 10 }}>
            Transcript
          </p>
          {(clip.transcript_excerpt || []).map((line: any, i: number) => {
            const isRep = line.speaker === "Rep" || line.speaker === "You";
            const isActive = i === activeLineIdx && playing;
            return (
              <div key={i} className={`cp-line${isActive ? " cp-line--active" : ""}`}
                style={{ borderLeftColor: isRep ? "rgba(129,140,248,.3)" : "rgba(45,212,191,.25)" }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: isRep ? "#818cf8" : "#2dd4bf", marginRight: 7 }}>
                  {line.speaker}
                </span>
                <span style={{ fontSize: 13, color: isActive ? "#f0f6fc" : "rgba(255,255,255,.6)", lineHeight: 1.6 }}>
                  {line.text}
                </span>
              </div>
            );
          })}
        </div>

        {/* Comment */}
        <div className="cp-comment">
          <p style={{ fontSize: 10, fontWeight: 700, color: "#a78bfa", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 8 }}>
            💬 Coaching Comment
          </p>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,.8)", lineHeight: 1.65 }}>
            {clip.manager_comment}
          </p>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,.3)", marginTop: 10 }}>
            — {clip.creator_name}, {new Date(clip.created_at).toLocaleDateString()}
          </p>
        </div>

        {/* CTA */}
        <div style={{ textAlign: "center", paddingTop: 10 }}>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,.25)", marginBottom: 10 }}>
            Powered by
          </p>
          <Link to="/login" style={{
            display: "inline-flex", alignItems: "center", gap: 7,
            background: "linear-gradient(135deg,#7c3aed,#6d28d9)",
            color: "#fff", textDecoration: "none", borderRadius: 10,
            padding: "10px 22px", fontSize: 13, fontWeight: 700,
            fontFamily: "'DM Sans',sans-serif",
          }}>
            <Zap style={{ width: 14, height: 14 }} /> Try Fixsense Free
          </Link>
        </div>
      </div>
    </div>
  );
}