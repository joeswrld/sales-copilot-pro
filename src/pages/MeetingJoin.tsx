/**
 * MeetingJoin.tsx
 *
 * Public guest join page — accessible at /meet/:roomName
 * No login required. Prospect enters their name and joins.
 *
 * Works with Daily.co prebuilt UI loaded via <script> tag (no npm required).
 * Loads the Daily iframe SDK dynamically so the rest of the app doesn't
 * need to bundle it.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import { Loader2, Video, Mic, MicOff, VideoOff, Users, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

// ─── Types ────────────────────────────────────────────────────────────────────

interface RoomInfo {
  title:       string;
  room_url:    string;
  room_name:   string;
  status:      "waiting" | "live" | "ended";
  expires_at:  string | null;
  host_name?:  string;
}

type JoinState = "loading" | "form" | "joining" | "live" | "ended" | "not_found" | "expired" | string;

// ─── Daily loader (dynamic script injection) ─────────────────────────────────

function loadDailyScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).DailyIframe) { resolve(); return; }
    const script = document.createElement("script");
    script.src   = "https://unpkg.com/@daily-co/daily-js";
    script.async = true;
    script.onload  = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Daily.co SDK"));
    document.head.appendChild(script);
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MeetingJoin() {
  const { roomName } = useParams<{ roomName: string }>();

  const [joinState, setJoinState] = useState<JoinState>("loading");
  const [room,      setRoom]      = useState<RoomInfo | null>(null);
  const [name,      setName]      = useState("");
  const [nameError, setNameError] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const callFrameRef = useRef<any>(null);

  // ── Fetch room info from Supabase ──────────────────────────────────────────
  useEffect(() => {
    if (!roomName) { setJoinState("not_found"); return; }

    supabase
      .from("native_meeting_rooms")
      .select("title, room_url, room_name, status, expires_at")
      .eq("room_name", roomName)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) { setJoinState("not_found"); return; }

        const roomData = data as RoomInfo;

        // Check expiry
        if (roomData.expires_at && new Date(roomData.expires_at) < new Date()) {
          setJoinState("expired"); return;
        }
        if (roomData.status === "ended") { setJoinState("ended"); return; }

        setRoom(roomData);
        setJoinState("form");
      });
  }, [roomName]);

  // ── Join handler ───────────────────────────────────────────────────────────
  const handleJoin = useCallback(async () => {
    if (!name.trim()) { setNameError("Please enter your name"); return; }
    if (!room?.room_url) return;

    setNameError("");
    setJoinState("joining");

    try {
      await loadDailyScript();

      const DailyIframe = (window as any).DailyIframe;
      if (!DailyIframe) throw new Error("Daily SDK not loaded");

      // Destroy any existing frame
      if (callFrameRef.current) {
        callFrameRef.current.destroy();
        callFrameRef.current = null;
      }

      const frame = DailyIframe.createFrame(containerRef.current!, {
        showLeaveButton:     true,
        showFullscreenButton: true,
        iframeStyle: {
          position:   "absolute",
          top:        0,
          left:       0,
          width:      "100%",
          height:     "100%",
          border:     "none",
          borderRadius: "0.75rem",
        },
      });

      callFrameRef.current = frame;

      frame.on("joined-meeting", () => setJoinState("live"));
      frame.on("left-meeting",   () => setJoinState("ended"));
      frame.on("error",          (e: any) => {
        console.error("Daily frame error:", e);
        setJoinState("form");
      });

      await frame.join({
        url:      room.room_url,
        userName: name.trim(),
      });

    } catch (err: any) {
      console.error("Failed to join meeting:", err);
      setJoinState("form");
      setNameError(err?.message || "Failed to join. Please try again.");
    }
  }, [name, room]);

  // ── Cleanup on unmount ─────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (callFrameRef.current) {
        callFrameRef.current.destroy();
      }
    };
  }, []);

  // ── Render states ──────────────────────────────────────────────────────────

  if (joinState === "loading") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
          <p className="text-sm text-muted-foreground">Loading meeting…</p>
        </div>
      </div>
    );
  }

  if (joinState === "not_found") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-4 max-w-sm">
          <div className="w-16 h-16 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-center justify-center mx-auto">
            <VideoOff className="w-8 h-8 text-destructive" />
          </div>
          <h1 className="text-xl font-bold font-display">Meeting not found</h1>
          <p className="text-sm text-muted-foreground">
            This meeting link is invalid or has been removed. Please check with your host.
          </p>
        </div>
      </div>
    );
  }

  if (joinState === "expired") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-4 max-w-sm">
          <div className="w-16 h-16 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center mx-auto">
            <Video className="w-8 h-8 text-accent" />
          </div>
          <h1 className="text-xl font-bold font-display">Meeting has expired</h1>
          <p className="text-sm text-muted-foreground">
            This meeting room is no longer available. Ask your host to create a new meeting.
          </p>
        </div>
      </div>
    );
  }

  if (joinState === "ended") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-4 max-w-sm">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto">
            <Video className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-xl font-bold font-display">Meeting ended</h1>
          <p className="text-sm text-muted-foreground">
            This meeting has ended. Thanks for joining!
          </p>
          <p className="text-xs text-muted-foreground">
            Powered by{" "}
            <a href="https://fixsense.com.ng" className="text-primary hover:underline">
              Fixsense
            </a>
          </p>
        </div>
      </div>
    );
  }

  // Live state: full-screen iframe
  if (joinState === "live") {
    return (
      <div className="fixed inset-0 bg-background">
        <div ref={containerRef} className="relative w-full h-full rounded-xl overflow-hidden" />
      </div>
    );
  }

  // Joining state: keep container mounted so Daily can attach, show overlay
  if (joinState === "joining") {
    return (
      <div className="fixed inset-0 bg-background">
        <div ref={containerRef} className="relative w-full h-full" />
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="text-center space-y-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
            <p className="text-sm font-medium">Joining meeting…</p>
            <p className="text-xs text-muted-foreground">Setting up audio & video</p>
          </div>
        </div>
      </div>
    );
  }

  // Form state: name entry
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">

      {/* Fixsense branding */}
      <div className="mb-8 text-center">
        <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center mx-auto mb-3 shadow-lg shadow-primary/30">
          <Video className="w-6 h-6 text-primary-foreground" />
        </div>
        <p className="text-xs text-muted-foreground">Powered by Fixsense</p>
      </div>

      {/* Join card */}
      <div className="w-full max-w-sm space-y-6 bg-card border border-border rounded-2xl p-8 shadow-xl">

        {/* Meeting info */}
        <div className="text-center space-y-1">
          <h1 className="text-xl font-bold font-display">{room?.title || "Meeting"}</h1>
          <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <Users className="w-3 h-3" />
            <span>You're invited to join</span>
          </div>
        </div>

        {/* Status badge */}
        <div className="flex justify-center">
          {room?.status === "live" ? (
            <span className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full bg-green-500/15 border border-green-500/25 text-green-400">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              Meeting is live
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              Ready to join
            </span>
          )}
        </div>

        {/* Name input */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Your name</label>
          <input
            type="text"
            value={name}
            onChange={e => { setName(e.target.value); setNameError(""); }}
            onKeyDown={e => e.key === "Enter" && handleJoin()}
            placeholder="e.g. John Smith"
            autoFocus
            className={`
              w-full px-4 py-3 rounded-xl bg-secondary border text-sm
              focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all
              ${nameError ? "border-destructive" : "border-border"}
            `}
          />
          {nameError && (
            <p className="text-xs text-destructive">{nameError}</p>
          )}
        </div>

        {/* Feature hints */}
        <div className="grid grid-cols-2 gap-2">
          {[
            { icon: Mic,   label: "Microphone" },
            { icon: Video, label: "Camera" },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-2 text-xs text-muted-foreground bg-secondary/50 rounded-lg px-3 py-2">
              <Icon className="w-3.5 h-3.5 text-primary shrink-0" />
              {label}
            </div>
          ))}
        </div>

        {/* Join button */}
        <button
          onClick={handleJoin}
          disabled={!name.trim() || joinState === "joining"}
          className="
            w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold
            flex items-center justify-center gap-2 text-sm
            hover:opacity-90 transition-opacity
            disabled:opacity-50 disabled:cursor-not-allowed
          "
        >
          {joinState === "joining" ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Joining…</>
          ) : (
            <><Video className="w-4 h-4" /> Join Meeting</>
          )}
        </button>

        <p className="text-center text-xs text-muted-foreground">
          No account required · Your camera & mic will be requested after joining
        </p>
      </div>

      {/* Footer */}
      <div className="mt-6 text-center">
        <a
          href="https://fixsense.com.ng"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-muted-foreground/60 hover:text-muted-foreground flex items-center gap-1 transition-colors"
        >
          <ExternalLink className="w-3 h-3" />
          Learn about Fixsense
        </a>
      </div>
    </div>
  );
}