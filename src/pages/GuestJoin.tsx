/**
 * GuestJoin.tsx — Guest join page for Daily.co meetings
 *
 * Route: /join/:roomName  (also handles /meet/:roomName for legacy links)
 *
 * No Fixsense auth required — prospects can join without an account.
 * Embeds the Daily.co prebuilt UI via an <iframe> for maximum compatibility.
 */

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Loader2, Shield, Users, Video, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function resolveRoomUrl(roomName: string): Promise<string | null> {
  // 1. Try calls table (daily_room_name / daily_room_url)
  const { data: callData } = await supabase
    .from("calls")
    .select("daily_room_url, daily_room_name")
    .eq("daily_room_name", roomName)
    .maybeSingle();

  if ((callData as any)?.daily_room_url) return (callData as any).daily_room_url;

  // 2. Construct the standard Daily.co URL
  return `https://fixsense.daily.co/${roomName}`;
}

// ─── States ───────────────────────────────────────────────────────────────────

type JoinStatus = "loading" | "ready" | "error";

export default function GuestJoin() {
  const { roomName } = useParams<{ roomName: string }>();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<JoinStatus>("loading");
  const [roomUrl, setRoomUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [showIframe, setShowIframe] = useState(false);

  // Allow ?name=John to pre-fill
  useEffect(() => {
    const nameParam = searchParams.get("name");
    if (nameParam) setNameInput(nameParam);
  }, [searchParams]);

  useEffect(() => {
    if (!roomName) {
      setErrorMsg("No room name provided in the URL.");
      setStatus("error");
      return;
    }

    resolveRoomUrl(roomName)
      .then((url) => {
        if (url) {
          setRoomUrl(url);
          setStatus("ready");
        } else {
          setErrorMsg("Meeting room not found. The link may have expired.");
          setStatus("error");
        }
      })
      .catch((e) => {
        setErrorMsg(e.message || "Could not load meeting details.");
        setStatus("error");
      });
  }, [roomName]);

  const handleJoin = () => {
    const name = nameInput.trim() || "Guest";
    setDisplayName(name);
    setShowIframe(true);
  };

  // ── Loading ────────────────────────────────────────────────────────────────
  if (status === "loading") {
    return (
      <div className="min-h-screen bg-[#0a0c13] flex items-center justify-center">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-400 mx-auto" />
          <p className="text-sm text-white/40">Loading meeting…</p>
        </div>
      </div>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (status === "error") {
    return (
      <div className="min-h-screen bg-[#0a0c13] flex items-center justify-center p-4">
        <div className="text-center space-y-4 max-w-sm">
          <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto">
            <Video className="w-7 h-7 text-red-400" />
          </div>
          <h1 className="text-xl font-bold text-white">Meeting Not Found</h1>
          <p className="text-sm text-white/40">{errorMsg}</p>
          <p className="text-xs text-white/25">Please ask the host to send you a new link.</p>
        </div>
      </div>
    );
  }

  // ── In-meeting iframe ──────────────────────────────────────────────────────
  if (showIframe && roomUrl) {
    // Append display name to URL if Daily supports it
    const iframeSrc = `${roomUrl}?userName=${encodeURIComponent(displayName || "Guest")}`;

    return (
      <div className="min-h-screen bg-[#0a0c13] flex flex-col">
        <div className="flex items-center justify-between px-4 py-2 border-b border-white/8 bg-[#0d0f18]">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-sm font-semibold text-white">Fixsense Meeting</span>
            {displayName && (
              <span className="text-xs text-white/30">· {displayName}</span>
            )}
          </div>
          <a
            href={iframeSrc}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Open in new tab
          </a>
        </div>
        <iframe
          src={iframeSrc}
          allow="camera; microphone; display-capture; autoplay; clipboard-write; fullscreen"
          className="flex-1 w-full border-0"
          title="Fixsense Meeting"
        />
      </div>
    );
  }

  // ── Pre-join / name entry ──────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0a0c13] flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Logo / Brand */}
        <div className="text-center space-y-2">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto"
            style={{
              background: "linear-gradient(135deg, rgba(99,102,241,0.25), rgba(139,92,246,0.15))",
              border: "1px solid rgba(99,102,241,0.3)",
            }}
          >
            <Users className="w-7 h-7 text-indigo-400" />
          </div>
          <h1 className="text-2xl font-bold text-white">Join Meeting</h1>
          <p className="text-sm text-white/40">
            You've been invited to a Fixsense meeting
          </p>
        </div>

        {/* Name input */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-white/50 block">
            Your name (shown to others)
          </label>
          <input
            type="text"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleJoin()}
            placeholder="Enter your name"
            maxLength={60}
            className="w-full h-11 rounded-xl border border-white/10 bg-white/5 px-4 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-indigo-500/50 focus:bg-white/8 transition-all"
            autoFocus
          />
        </div>

        {/* Join button */}
        <button
          onClick={handleJoin}
          className="w-full h-12 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90"
          style={{
            background: "linear-gradient(135deg, #4f46e5, #7c3aed)",
            boxShadow: "0 4px 20px rgba(99,102,241,0.3)",
          }}
        >
          Join Meeting
        </button>

        {/* Fallback: open directly */}
        {roomUrl && (
          <div className="text-center">
            <a
              href={roomUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-white/30 hover:text-white/60 transition-colors underline underline-offset-2"
            >
              Or open directly in Daily.co →
            </a>
          </div>
        )}

        <p className="text-center text-[11px] text-white/20 flex items-center justify-center gap-1.5">
          <Shield className="w-3 h-3" />
          No account needed · End-to-end encrypted
        </p>
      </div>
    </div>
  );
}