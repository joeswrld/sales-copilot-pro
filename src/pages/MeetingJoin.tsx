/**
 * MeetingJoin.tsx — Guest join page for 100ms meetings
 *
 * Route: /meet/:roomName
 * No auth required — guests can join without a Fixsense account.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { Loader2, Mic, MicOff, Video, VideoOff, PhoneOff, Users, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

declare global {
  interface Window {
    HMS: any;
  }
}

// ─── Guest token via Supabase anon call ────────────────────────────────────────
async function getGuestToken(roomName: string): Promise<string> {
  // We call create-hms-room with just the room name to get a guest auth token.
  // For a guest, we generate a token on the client side using the public app token.
  // Since 100ms provides app access keys, we use the HMS SDK preview flow.
  // In production, you'd have a get-hms-guest-token edge function.
  // For now we use the room's existing management token stored in hms_meeting_rooms.

  const { data } = await supabase
    .from("hms_meeting_rooms")
    .select("room_id")
    .eq("room_name", roomName)
    .maybeSingle();

  if (!data?.room_id) {
    // Try calls table
    const { data: callData } = await supabase
      .from("calls")
      .select("hms_room_id, hms_room_name")
      .eq("hms_room_name", roomName)
      .maybeSingle();

    if (!callData) throw new Error("Meeting room not found");
  }

  // For the guest flow, we invoke a lightweight function to generate a guest token
  const res = await supabase.functions.invoke("create-hms-room", {
    body: { guest_token: true, room_name: roomName },
  });

  if (res.data?.guest_token) return res.data.guest_token;

  // Fallback: use the room name as a reference and let 100ms SDK handle it
  // (100ms supports joining with just a room_id + auth token from dashboard)
  throw new Error("Could not get guest token. Please ask the host to resend the link.");
}

function VideoTile({ peerId, isLocal, peerName, hmsActions }: any) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!hmsActions || !videoRef.current) return;
    hmsActions.attachVideo(peerId, videoRef.current).catch(() => {});
    return () => { hmsActions.detachVideo(peerId, videoRef.current!).catch(() => {}); };
  }, [peerId, hmsActions]);

  return (
    <div className="relative rounded-xl overflow-hidden bg-zinc-900 aspect-video">
      <video ref={videoRef} autoPlay muted={isLocal} playsInline className="w-full h-full object-cover" />
      <div className="absolute bottom-2 left-2 text-[11px] font-medium bg-black/60 text-white px-2 py-0.5 rounded-full">
        {isLocal ? "You (Guest)" : peerName || "Host"}
      </div>
    </div>
  );
}

export default function MeetingJoin() {
  const { roomName } = useParams<{ roomName: string }>();
  const [status, setStatus] = useState<"loading" | "preview" | "joined" | "ended" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [peers, setPeers] = useState<any[]>([]);
  const [isAudioOn, setIsAudioOn] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [guestName, setGuestName] = useState("Guest");
  const [nameInput, setNameInput] = useState("");

  const hmsActionsRef = useRef<any>(null);
  const hmsStoreRef = useRef<any>(null);
  const unsubRef = useRef<(() => void) | null>(null);
  const tokenRef = useRef<string>("");

  // Load 100ms SDK
  useEffect(() => {
    const load = async () => {
      try {
        if (!window.HMS) {
          await new Promise<void>((res, rej) => {
            const s = document.createElement("script");
            s.src = "https://cdn.100ms.live/sdk/v2.9.15/hms.min.js";
            s.async = true;
            s.onload = () => res();
            s.onerror = () => rej(new Error("Failed to load 100ms SDK"));
            document.head.appendChild(s);
          });
        }
        // Get guest token
        try {
          const token = await getGuestToken(roomName!);
          tokenRef.current = token;
        } catch (e: any) {
          setErrorMsg(e.message);
          setStatus("error");
          return;
        }
        setStatus("preview");
      } catch (e: any) {
        setErrorMsg(e.message || "Failed to load meeting SDK");
        setStatus("error");
      }
    };
    load();
  }, [roomName]);

  const handleJoin = useCallback(async () => {
    if (!tokenRef.current) return;
    const name = nameInput.trim() || "Guest";
    setGuestName(name);
    setStatus("loading");

    try {
      const HMS = window.HMS;
      hmsActionsRef.current = new HMS.HMSActions();
      hmsStoreRef.current = new HMS.HMSStore();

      const unsub = hmsStoreRef.current.subscribe((store: any) => {
        const allPeers = Object.values(store.peers || {}) as any[];
        setPeers(allPeers);
      });
      unsubRef.current = unsub;

      await hmsActionsRef.current.join({
        userName: name,
        authToken: tokenRef.current,
        settings: { isAudioMuted: !isAudioOn, isVideoMuted: !isVideoOn },
      });

      setStatus("joined");
    } catch (e: any) {
      setErrorMsg(e.message || "Failed to join meeting");
      setStatus("error");
    }
  }, [nameInput, isAudioOn, isVideoOn]);

  const handleLeave = useCallback(async () => {
    if (unsubRef.current) unsubRef.current();
    try { await hmsActionsRef.current?.leave(); } catch {}
    setStatus("ended");
  }, []);

  const handleToggleAudio = async () => {
    if (!hmsActionsRef.current) return;
    await hmsActionsRef.current.setLocalAudioEnabled(!isAudioOn);
    setIsAudioOn((v) => !v);
  };

  const handleToggleVideo = async () => {
    if (!hmsActionsRef.current) return;
    await hmsActionsRef.current.setLocalVideoEnabled(!isVideoOn);
    setIsVideoOn((v) => !v);
  };

  // ── Ended ─────────────────────────────────────────────────────────────────
  if (status === "ended") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-4 max-w-sm">
          <div className="w-16 h-16 rounded-full bg-green-500/15 border border-green-500/20 flex items-center justify-center mx-auto">
            <PhoneOff className="w-7 h-7 text-green-400" />
          </div>
          <h1 className="text-xl font-bold">Meeting ended</h1>
          <p className="text-sm text-muted-foreground">Thank you for joining. You can close this window.</p>
        </div>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (status === "error") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-4 max-w-sm">
          <h1 className="text-xl font-bold text-destructive">Could not join meeting</h1>
          <p className="text-sm text-muted-foreground">{errorMsg}</p>
          <p className="text-xs text-muted-foreground">Please ask the host to resend the invite link.</p>
        </div>
      </div>
    );
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  if (status === "loading") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
          <p className="text-sm text-muted-foreground">Connecting to meeting…</p>
        </div>
      </div>
    );
  }

  // ── Preview / name entry ──────────────────────────────────────────────────
  if (status === "preview") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center space-y-2">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto">
              <Users className="w-7 h-7 text-primary" />
            </div>
            <h1 className="text-2xl font-bold font-display">Join Meeting</h1>
            <p className="text-sm text-muted-foreground">You're about to join a Fixsense meeting</p>
          </div>

          <div className="space-y-3">
            <label className="text-sm font-medium">Your name</label>
            <input
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleJoin()}
              placeholder="Enter your name"
              className="w-full h-11 rounded-xl border border-border bg-background/60 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              autoFocus
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsAudioOn((v) => !v)}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 h-11 rounded-xl border text-sm font-medium transition-colors",
                isAudioOn ? "bg-secondary/60 border-border" : "bg-red-500/10 border-red-500/30 text-red-400",
              )}
            >
              {isAudioOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
              {isAudioOn ? "Mic On" : "Mic Off"}
            </button>
            <button
              onClick={() => setIsVideoOn((v) => !v)}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 h-11 rounded-xl border text-sm font-medium transition-colors",
                isVideoOn ? "bg-secondary/60 border-border" : "bg-red-500/10 border-red-500/30 text-red-400",
              )}
            >
              {isVideoOn ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
              {isVideoOn ? "Cam On" : "Cam Off"}
            </button>
          </div>

          <Button onClick={handleJoin} className="w-full h-12 text-sm font-semibold">
            Join Now
          </Button>

          <p className="text-center text-[11px] text-muted-foreground/60 flex items-center justify-center gap-1.5">
            <Shield className="w-3 h-3" />
            No account needed · Powered by 100ms
          </p>
        </div>
      </div>
    );
  }

  // ── In meeting ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span className="text-sm font-medium text-white">Fixsense Meeting</span>
          <span className="text-xs text-zinc-400 font-medium">· {peers.length} participant{peers.length !== 1 ? "s" : ""}</span>
        </div>
        <Button
          onClick={handleLeave}
          variant="destructive"
          size="sm"
          className="gap-1.5 h-8 text-xs"
        >
          <PhoneOff className="w-3 h-3" />
          Leave
        </Button>
      </div>

      {/* Video grid */}
      <div className="flex-1 p-4">
        {peers.length === 0 ? (
          <div className="flex items-center justify-center h-64 text-zinc-400 text-sm">
            <div className="text-center">
              <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>Waiting for host to join…</p>
            </div>
          </div>
        ) : (
          <div className={cn("grid gap-3", peers.length <= 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-2")}>
            {peers.map((peer) => (
              <VideoTile key={peer.id} peerId={peer.id} isLocal={peer.isLocal} peerName={peer.name} hmsActions={hmsActionsRef.current} />
            ))}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-3 px-4 py-4 border-t border-zinc-800">
        <button
          onClick={handleToggleAudio}
          className={cn(
            "w-12 h-12 rounded-full flex items-center justify-center transition-colors",
            isAudioOn ? "bg-zinc-700 hover:bg-zinc-600" : "bg-red-600 hover:bg-red-700",
          )}
        >
          {isAudioOn ? <Mic className="w-5 h-5 text-white" /> : <MicOff className="w-5 h-5 text-white" />}
        </button>
        <button
          onClick={handleToggleVideo}
          className={cn(
            "w-12 h-12 rounded-full flex items-center justify-center transition-colors",
            isVideoOn ? "bg-zinc-700 hover:bg-zinc-600" : "bg-red-600 hover:bg-red-700",
          )}
        >
          {isVideoOn ? <Video className="w-5 h-5 text-white" /> : <VideoOff className="w-5 h-5 text-white" />}
        </button>
        <button
          onClick={handleLeave}
          className="w-12 h-12 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center transition-colors"
        >
          <PhoneOff className="w-5 h-5 text-white" />
        </button>
      </div>
    </div>
  );
}