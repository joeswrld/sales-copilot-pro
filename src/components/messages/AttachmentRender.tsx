/**
 * AttachmentRender — renders image / audio (voice note) / generic file attachments
 * inside a message bubble.
 *
 * Fix (v2):
 *  - Removed crossOrigin="anonymous" from <audio> — it caused CORS preflight failures
 *    on Supabase storage range requests, producing "no supported source" errors.
 *  - VoicePlayer now fetches a signed URL via the `get-signed-url` edge function so
 *    the audio element always has a time-limited but guaranteed-accessible URL.
 *  - Falls back gracefully to the raw URL if the signed-URL fetch fails.
 *  - Uses correct content-type hint in the <source> element for .webm files.
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

// Extracts { bucket, path } from a Supabase public storage URL.
// URL shape: https://<ref>.supabase.co/storage/v1/object/public/<bucket>/<path>
function parseStorageUrl(url: string): { bucket: string; path: string } | null {
  try {
    const match = url.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+?)(?:\?|$)/);
    if (!match) return null;
    return { bucket: match[1], path: decodeURIComponent(match[2]) };
  } catch {
    return null;
  }
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
    return <VoicePlayer url={url} isOwn={isOwn} />;
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
        <p style={{ fontSize: 12.5, fontWeight: 600, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name || "Attachment"}</p>
        {size ? <p style={{ fontSize: 10.5, margin: 0, opacity: .65 }}>{formatBytes(size)}</p> : null}
      </div>
      <Download size={13} style={{ opacity: .65 }} />
    </a>
  );
}

function VoicePlayer({ url: rawUrl, isOwn }: { url: string; isOwn: boolean }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [loadingUrl, setLoadingUrl] = useState(true);

  // Step 1: resolve a playable URL (signed if possible, raw otherwise)
  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      setLoadingUrl(true);
      setError(null);

      // Try to get a signed URL via the edge function
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
          // fall through to raw URL
        }
      }

      // Fallback: use the raw URL directly (works if bucket is truly public)
      if (!cancelled) {
        setResolvedUrl(rawUrl);
        setLoadingUrl(false);
      }
    }

    resolve();
    return () => { cancelled = true; };
  }, [rawUrl]);

  // Step 2: wire up audio events once we have a URL
  useEffect(() => {
    const a = audioRef.current;
    if (!a || !resolvedUrl) return;

    const onTime    = () => setCurrentTime(a.currentTime);
    const onEnd     = () => { setPlaying(false); setCurrentTime(0); };
    const onErr     = () => {
      // Give a more actionable error message
      const code = a.error?.code;
      if (code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
        setError("Format not supported by your browser");
      } else if (code === MediaError.MEDIA_ERR_NETWORK) {
        setError("Network error — try again");
      } else {
        setError("Cannot play audio");
      }
    };
    const onLoaded  = () => {
      if (a.duration === Infinity || isNaN(a.duration)) {
        const onSeek = () => {
          a.currentTime = 0;
          setDuration(a.duration && a.duration !== Infinity ? a.duration : 0);
          a.removeEventListener("timeupdate", onSeek);
        };
        a.addEventListener("timeupdate", onSeek);
        try { a.currentTime = 1e8; } catch {}
      } else {
        setDuration(a.duration || 0);
      }
    };

    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onLoaded);
    a.addEventListener("ended", onEnd);
    a.addEventListener("error", onErr);

    // Load with the new URL
    a.load();

    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onLoaded);
      a.removeEventListener("ended", onEnd);
      a.removeEventListener("error", onErr);
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
      console.error("Voice playback failed", e);
      setError(e?.name === "NotSupportedError" ? "Format not supported" : (e?.message || "Playback blocked"));
      setPlaying(false);
    }
  };

  const pct = duration ? (currentTime / duration) * 100 : 0;
  const remaining = Math.max(0, (duration || 0) - currentTime);
  const mm = Math.floor(remaining / 60).toString().padStart(2, "0");
  const ss = Math.floor(remaining % 60).toString().padStart(2, "0");

  const fg = isOwn ? "#060912" : "#0ef5d4";
  const bg = isOwn ? "rgba(0,0,0,.18)" : "rgba(255,255,255,.06)";

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
      background: bg, borderRadius: 10, minWidth: 220, maxWidth: 280,
    }}>
      {/* No crossOrigin on the audio element — Supabase storage doesn't need it
          for public/signed URLs and it was causing the "no supported source" error */}
      <audio ref={audioRef} preload="metadata" playsInline style={{ display: "none" }}>
        {resolvedUrl && (
          // Provide explicit MIME type hint so browser doesn't sniff and reject
          <source src={resolvedUrl} type="audio/webm; codecs=opus" />
        )}
        {/* Fallback without codec hint */}
        {resolvedUrl && <source src={resolvedUrl} type="audio/webm" />}
      </audio>

      {error ? (
        <span style={{ fontSize: 11, color: "#ef4444", flex: 1 }}>{error}</span>
      ) : null}

      <button onClick={toggle} disabled={loadingUrl} style={{
        width: 32, height: 32, borderRadius: "50%", border: "none",
        background: loadingUrl ? "rgba(255,255,255,.2)" : fg,
        color: isOwn ? "#0ef5d4" : "#060912",
        cursor: loadingUrl ? "wait" : "pointer",
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        opacity: loadingUrl ? 0.5 : 1,
      }}>
        {loadingUrl
          ? <span style={{ width: 10, height: 10, border: "2px solid currentColor", borderTopColor: "transparent", borderRadius: "50%", display: "inline-block", animation: "spin .6s linear infinite" }} />
          : playing
            ? <Pause size={13} fill="currentColor" />
            : <Play  size={13} fill="currentColor" />
        }
      </button>

      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 2, height: 22 }}>
        {Array.from({ length: 28 }).map((_, i) => {
          const filled = (i / 28) * 100 < pct;
          const h = 4 + ((i * 37) % 16);
          return (
            <div key={i} style={{
              flex: 1, height: `${h}px`, minHeight: 3,
              background: filled ? fg : (isOwn ? "rgba(0,0,0,.3)" : "rgba(255,255,255,.18)"),
              borderRadius: 1, transition: "background .1s",
            }} />
          );
        })}
      </div>

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