/**
 * AttachmentRender — renders image / audio (voice note) / generic file attachments
 * inside a message bubble.
 */
import { useRef, useState, useEffect } from "react";
import { Play, Pause, FileText, Download } from "lucide-react";
import { isImageType, isAudioType, formatBytes } from "@/lib/messageAttachments";

interface Props {
  url: string;
  name?: string | null;
  type?: string | null;
  size?: number;
  isOwn: boolean;
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

function VoicePlayer({ url, isOwn }: { url: string; isOwn: boolean }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => setCurrentTime(a.currentTime);
    const onLoaded = () => setDuration(a.duration || 0);
    const onEnd = () => { setPlaying(false); setCurrentTime(0); };
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onLoaded);
    a.addEventListener("ended", onEnd);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onLoaded);
      a.removeEventListener("ended", onEnd);
    };
  }, []);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.pause(); setPlaying(false); }
    else { a.play(); setPlaying(true); }
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
      <audio ref={audioRef} src={url} preload="metadata" />
      <button onClick={toggle} style={{
        width: 32, height: 32, borderRadius: "50%", border: "none",
        background: fg, color: isOwn ? "#0ef5d4" : "#060912",
        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>
        {playing ? <Pause size={13} fill="currentColor" /> : <Play size={13} fill="currentColor" />}
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
      <span style={{ fontSize: 11, color: isOwn ? "rgba(0,0,0,.55)" : "rgba(255,255,255,.5)", fontVariantNumeric: "tabular-nums", minWidth: 34 }}>
        {mm}:{ss}
      </span>
    </div>
  );
}
