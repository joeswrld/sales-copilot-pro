/**
 * AttachmentRender — renders image / audio (voice note) / generic file attachments
 * inside a message bubble.
 *
 * Fix (v3):
 *  - VoicePlayer no longer uses crossOrigin="anonymous" (was causing CORS failures)
 *  - Uses a <source> element with the correct type so the browser doesn't reject
 *    the file before even trying to load it
 *  - Tries a signed URL first (via get-signed-url edge fn), falls back to raw URL
 *  - Handles both audio/webm and audio/ogg (the recorder now picks the best format)
 *  - Spinner while the signed URL is being fetched
 */
import { useRef, useState, useEffect } from "react";
import { Play, Pause, FileText, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { isImageType, isAudioType, formatBytes } from "@/lib/messageAttachments";

interface Props {
  url: string;
  name?: string | null;
  type?: string | null;
  size?: number;
  isOwn: boolean;
}

// Extract { bucket, path } from a Supabase public storage URL
// URL: https://<ref>.supabase.co/storage/v1/object/public/<bucket>/<path>
function parseStorageUrl(url: string): { bucket: string; path: string } | null {
  try {
    const m = url.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/?]+)\/(.+?)(?:\?|$)/);
    if (!m) return null;
    return { bucket: m[1], path: decodeURIComponent(m[2]) };
  } catch {
    return null;
  }
}

// Derive a playable MIME type hint from the stored file_type or filename
function audioMimeType(type?: string | null, name?: string | null): string {
  if (type && type.startsWith("audio/")) return type;
  if (name?.endsWith(".ogg"))  return "audio/ogg; codecs=opus";
  if (name?.endsWith(".webm")) return "audio/webm; codecs=opus";
  if (name?.endsWith(".mp4"))  return "audio/mp4";
  return "audio/webm; codecs=opus"; // safest default
}

export default function AttachmentRender({ url, name, type, size, isOwn }: Props) {
  if (isImageType(type)) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" style={{ display: "block" }}>
        <img src={url} alt={name || "image"} style={{
          maxWidth: 260, maxHeight: 260, borderRadius: 10, display: "block",
          border: "1px solid rgba(255,255,255,.06)",
        }} />
      </a>
    );
  }
  if (isAudioType(type)) {
    return <VoicePlayer url={url} mimeType={audioMimeType(type, name)} isOwn={isOwn} />;
  }
  return (
    <a href={url} download={name || true} target="_blank" rel="noopener noreferrer" style={{
      display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
      background: isOwn ? "rgba(0,0,0,.18)" : "rgba(255,255,255,.06)",
      borderRadius: 10, textDecoration: "none", maxWidth: 260,
      color: isOwn ? "#060912" : "#f0f6fc",
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: 8, flexShrink: 0,
        background: isOwn ? "rgba(0,0,0,.25)" : "rgba(14,245,212,.15)",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: isOwn ? "rgba(255,255,255,.85)" : "#0ef5d4",
      }}>
        <FileText size={15} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 12.5, fontWeight: 600, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {name || "Attachment"}
        </p>
        {size ? <p style={{ fontSize: 10.5, margin: 0, opacity: .65 }}>{formatBytes(size)}</p> : null}
      </div>
      <Download size={13} style={{ opacity: .65 }} />
    </a>
  );
}

// ─── Voice Player ─────────────────────────────────────────────────────────────

function VoicePlayer({ url: rawUrl, mimeType, isOwn }: {
  url: string;
  mimeType: string;
  isOwn: boolean;
}) {
  const audioRef    = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying]       = useState(false);
  const [duration, setDuration]     = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [error, setError]           = useState<string | null>(null);
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [loadingUrl, setLoadingUrl] = useState(true);

  // Resolve a signed URL so the audio element has guaranteed access
  useEffect(() => {
    let cancelled = false;
    async function resolve() {
      setLoadingUrl(true);
      setError(null);

      const parsed = parseStorageUrl(rawUrl);
      if (parsed) {
        try {
          const { data, error: fnErr } = await supabase.functions.invoke("get-signed-url", {
            body: { bucket: parsed.bucket, path: parsed.path, expiresIn: 3600 },
          });
          if (!fnErr && data?.signedUrl && !cancelled) {
            setResolvedUrl(data.signedUrl);
            setLoadingUrl(false);
            return;
          }
        } catch {
          // fall through
        }
      }
      // Fallback to the raw public URL
      if (!cancelled) {
        setResolvedUrl(rawUrl);
        setLoadingUrl(false);
      }
    }
    resolve();
    return () => { cancelled = true; };
  }, [rawUrl]);

  // Wire up audio events once URL is ready
  useEffect(() => {
    const a = audioRef.current;
    if (!a || !resolvedUrl) return;

    const onTime   = () => setCurrentTime(a.currentTime);
    const onEnd    = () => { setPlaying(false); setCurrentTime(0); };
    const onErr    = () => {
      const code = a.error?.code;
      if (code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
        setError("Format not supported");
      } else if (code === MediaError.MEDIA_ERR_NETWORK) {
        setError("Network error — try again");
      } else {
        setError("Cannot play audio");
      }
    };
    const onMeta   = () => {
      if (!isFinite(a.duration) || isNaN(a.duration)) {
        // Fragmented webm fallback: seek to trigger duration resolution
        const onSeek = () => {
          a.currentTime = 0;
          if (isFinite(a.duration)) setDuration(a.duration);
          a.removeEventListener("timeupdate", onSeek);
        };
        a.addEventListener("timeupdate", onSeek);
        try { a.currentTime = 1e8; } catch {}
      } else {
        setDuration(a.duration);
      }
    };

    a.addEventListener("timeupdate",    onTime);
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("ended",         onEnd);
    a.addEventListener("error",         onErr);

    // Reload with the new source
    a.load();

    return () => {
      a.removeEventListener("timeupdate",    onTime);
      a.removeEventListener("loadedmetadata", onMeta);
      a.removeEventListener("ended",         onEnd);
      a.removeEventListener("error",         onErr);
    };
  }, [resolvedUrl]);

  const toggle = async () => {
    const a = audioRef.current;
    if (!a || loadingUrl) return;
    if (playing) { a.pause(); setPlaying(false); return; }
    try {
      setError(null);
      await a.play();
      setPlaying(true);
    } catch (e: any) {
      const msg = e?.name === "NotSupportedError" ? "Format not supported" : (e?.message || "Playback blocked");
      setError(msg);
      setPlaying(false);
    }
  };

  const pct       = duration ? (currentTime / duration) * 100 : 0;
  const remaining = Math.max(0, (duration || 0) - currentTime);
  const mm        = Math.floor(remaining / 60).toString().padStart(2, "0");
  const ss        = Math.floor(remaining % 60).toString().padStart(2, "0");
  const fg        = isOwn ? "#060912" : "#0ef5d4";
  const bg        = isOwn ? "rgba(0,0,0,.18)" : "rgba(255,255,255,.06)";

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
      background: bg, borderRadius: 10, minWidth: 220, maxWidth: 280,
    }}>
      {/*
        NO crossOrigin attribute — Supabase storage doesn't require it for public/signed
        URLs, and it was causing CORS failures on HTTP range requests used for streaming.
      */}
      <audio ref={audioRef} preload="metadata" playsInline style={{ display: "none" }}>
        {resolvedUrl && <source src={resolvedUrl} type={mimeType} />}
        {/* Extra fallback without codec hint */}
        {resolvedUrl && mimeType.includes("codecs") && (
          <source src={resolvedUrl} type={mimeType.split(";")[0].trim()} />
        )}
      </audio>

      <button
        onClick={toggle}
        disabled={loadingUrl}
        style={{
          width: 32, height: 32, borderRadius: "50%", border: "none",
          background: loadingUrl ? "rgba(255,255,255,.2)" : fg,
          color: isOwn ? "#0ef5d4" : "#060912",
          cursor: loadingUrl ? "wait" : "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          opacity: loadingUrl ? 0.5 : 1,
          transition: "opacity .15s",
        }}
      >
        {loadingUrl ? (
          <span style={{
            width: 10, height: 10,
            border: `2px solid ${isOwn ? "#060912" : "#0ef5d4"}`,
            borderTopColor: "transparent", borderRadius: "50%",
            display: "inline-block", animation: "spin .6s linear infinite",
          }} />
        ) : playing ? (
          <Pause size={13} fill="currentColor" />
        ) : (
          <Play  size={13} fill="currentColor" />
        )}
      </button>

      {error ? (
        <span style={{ fontSize: 11, color: "#ef4444", flex: 1 }}>{error}</span>
      ) : (
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 2, height: 22 }}>
          {Array.from({ length: 28 }).map((_, i) => {
            const filled = (i / 28) * 100 < pct;
            const h = 4 + ((i * 37) % 16);
            return (
              <div key={i} style={{
                flex: 1, height: `${h}px`, minHeight: 3,
                background: filled
                  ? fg
                  : (isOwn ? "rgba(0,0,0,.3)" : "rgba(255,255,255,.18)"),
                borderRadius: 1, transition: "background .1s",
              }} />
            );
          })}
        </div>
      )}

      <span style={{
        fontSize: 11,
        color: isOwn ? "rgba(0,0,0,.55)" : "rgba(255,255,255,.5)",
        fontVariantNumeric: "tabular-nums",
        minWidth: 34,
      }}>
        {mm}:{ss}
      </span>
    </div>
  );
}