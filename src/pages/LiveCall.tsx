/**
 * LiveCall.tsx — 100ms Edition
 *
 * Flow:
 *  1. Create 100ms room via create-hms-room edge function
 *  2. Share invite link with prospect
 *  3. Join as host via 100ms React SDK
 *  4. Audio tracks captured per peer → transcribe-stream edge fn
 *  5. End call → AI summary → redirect to call detail
 */

import DashboardLayout from "@/components/DashboardLayout";
import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  Loader2, ExternalLink, CheckCircle2, ChevronRight,
  AlertTriangle, Shield, StopCircle, VideoIcon, Copy,
  Check, Plus, Sparkles, Radio, Eye, RefreshCw, Link2, Mic,
  MicOff, Video, VideoOff, PhoneOff, Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLiveCall } from "@/hooks/useLiveCall";
import { useMeetingUsage } from "@/hooks/useMeetingUsage";
import { useTeam } from "@/hooks/useTeam";
import { useUserStatus } from "@/hooks/useUserStatus";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ─── 100ms types ───────────────────────────────────────────────────────────────
declare global {
  interface Window {
    HMS: any;
  }
}

// ─── Audio chunk processor ─────────────────────────────────────────────────────
class AudioChunkProcessor {
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private intervalId: number | null = null;
  private chunkIndex = 0;

  constructor(
    private stream: MediaStream,
    private onChunk: (blob: Blob, index: number) => void,
    private intervalMs = 3000,
  ) {}

  start() {
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";
    this.mediaRecorder = new MediaRecorder(this.stream, { mimeType });
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.mediaRecorder.onstop = () => {
      if (this.chunks.length > 0) {
        const blob = new Blob([...this.chunks], { type: mimeType });
        this.chunks = [];
        this.onChunk(blob, this.chunkIndex++);
      }
    };
    this.mediaRecorder.start();
    this.intervalId = window.setInterval(() => {
      if (this.mediaRecorder?.state === "recording") {
        this.mediaRecorder.stop();
        this.mediaRecorder.start();
      }
    }, this.intervalMs);
  }

  stop() {
    if (this.intervalId) clearInterval(this.intervalId);
    if (this.mediaRecorder?.state === "recording") this.mediaRecorder.stop();
    this.stream.getTracks().forEach((t) => t.stop());
  }
}

// ─── Hook: HMS room management ─────────────────────────────────────────────────
function useHMSRoom() {
  const [roomInfo, setRoomInfo] = useState<{
    room_id: string;
    room_name: string;
    share_link: string;
    mgmt_token: string;
  } | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const createRoom = useCallback(async (callId: string, title: string) => {
    setIsCreating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Not authenticated");
      const { data, error } = await supabase.functions.invoke("create-hms-room", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: {
          call_id: callId,
          title,
          app_origin: window.location.origin,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setRoomInfo(data);
      return data;
    } finally {
      setIsCreating(false);
    }
  }, []);

  return { roomInfo, isCreating, createRoom, setRoomInfo };
}

// ─── Hook: audio streaming to transcribe-stream ────────────────────────────────
function useHMSAudioStreaming(callId: string | null) {
  const processorsRef = useRef<Map<string, AudioChunkProcessor>>(new Map());
  const [chunksSent, setChunksSent] = useState(0);
  const [isStreaming, setIsStreaming] = useState(false);

  const sendChunk = useCallback(
    async (blob: Blob, index: number, peerId: string, isLocal: boolean) => {
      if (!callId || blob.size < 100) return;
      try {
        const reader = new FileReader();
        const base64 = await new Promise<string>((res, rej) => {
          reader.onloadend = () => res((reader.result as string).split(",")[1] ?? "");
          reader.onerror = rej;
          reader.readAsDataURL(blob);
        });
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;
        await supabase.functions.invoke("transcribe-stream", {
          headers: { Authorization: `Bearer ${session.access_token}` },
          body: {
            call_id: callId,
            audio_base64: base64,
            chunk_index: index,
            speaker_id: peerId,
            speaker_label: isLocal ? "You" : "Prospect",
          },
        });
        setChunksSent((n) => n + 1);
      } catch (e) {
        console.warn("sendChunk error:", e);
      }
    },
    [callId],
  );

  const startPeerAudio = useCallback(
    (peerId: string, track: MediaStreamTrack, isLocal: boolean) => {
      if (processorsRef.current.has(peerId)) return;
      const stream = new MediaStream([track]);
      const proc = new AudioChunkProcessor(stream, (blob, idx) =>
        sendChunk(blob, idx, peerId, isLocal),
      );
      proc.start();
      processorsRef.current.set(peerId, proc);
      setIsStreaming(true);
    },
    [sendChunk],
  );

  const stopPeerAudio = useCallback((peerId: string) => {
    processorsRef.current.get(peerId)?.stop();
    processorsRef.current.delete(peerId);
    if (processorsRef.current.size === 0) setIsStreaming(false);
  }, []);

  const stopAll = useCallback(() => {
    processorsRef.current.forEach((p) => p.stop());
    processorsRef.current.clear();
    setIsStreaming(false);
  }, []);

  return { chunksSent, isStreaming, startPeerAudio, stopPeerAudio, stopAll };
}

// ─── Share link panel ──────────────────────────────────────────────────────────
function ShareLinkPanel({
  shareLink,
  callId,
  onJoinAsHost,
}: {
  shareLink: string;
  callId: string;
  onJoinAsHost: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const navigate = useNavigate();

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
      toast.success("Link copied!");
    } catch {
      toast.info(`Share link: ${shareLink}`, { duration: 10_000 });
    }
  };

  return (
    <div className="glass rounded-2xl border border-primary/25 bg-primary/5 p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0">
          <CheckCircle2 className="w-5 h-5 text-primary" />
        </div>
        <div>
          <p className="font-semibold text-sm text-primary">Meeting room ready!</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Share this link with your prospect — no account needed.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 bg-background/60 border border-border rounded-xl p-3">
        <Link2 className="w-4 h-4 text-muted-foreground shrink-0" />
        <span className="text-xs text-foreground flex-1 truncate font-mono">{shareLink}</span>
        <button
          onClick={copyLink}
          className={cn(
            "flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all shrink-0",
            copied
              ? "bg-green-500/15 text-green-400 border border-green-500/25"
              : "bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20",
          )}
        >
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Button size="sm" onClick={onJoinAsHost} className="gap-1.5">
          <VideoIcon className="w-3.5 h-3.5" />
          Join as Host
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          onClick={() => navigate(`/dashboard/live/${callId}`)}
        >
          <Eye className="w-3.5 h-3.5" />
          Live Insights
        </Button>
        <a href={shareLink} target="_blank" rel="noopener noreferrer">
          <Button size="sm" variant="outline" className="gap-1.5">
            <ExternalLink className="w-3.5 h-3.5" />
            Open in Tab
          </Button>
        </a>
      </div>

      <p className="text-xs text-muted-foreground/60 flex items-center gap-1.5">
        <Shield className="w-3 h-3" />
        Powered by 100ms · AI transcription active when you join
      </p>
    </div>
  );
}

// ─── In-meeting controls ───────────────────────────────────────────────────────
function MeetingControls({
  callId,
  shareLink,
  isStreaming,
  chunksSent,
  isAudioOn,
  isVideoOn,
  onToggleAudio,
  onToggleVideo,
  onEnd,
  isEnding,
}: {
  callId: string;
  shareLink?: string;
  isStreaming: boolean;
  chunksSent: number;
  isAudioOn: boolean;
  isVideoOn: boolean;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  onEnd: () => void;
  isEnding: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const navigate = useNavigate();

  const copyLink = () => {
    if (!shareLink) return;
    navigator.clipboard.writeText(shareLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="glass rounded-2xl border border-green-500/25 bg-green-500/5 p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          <span className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse" />
          <div>
            <p className="font-semibold text-sm text-green-400">Meeting in progress</p>
            <p className="text-xs text-muted-foreground">
              {isStreaming
                ? `AI transcribing · ${chunksSent} chunks`
                : "Waiting for audio…"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {shareLink && (
            <button
              onClick={copyLink}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border/60 rounded-lg px-2.5 py-1.5 transition-colors"
            >
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              {copied ? "Copied!" : "Copy invite"}
            </button>
          )}
          <Link
            to={`/dashboard/live/${callId}`}
            className="flex items-center gap-1.5 text-xs text-primary border border-primary/30 bg-primary/10 rounded-lg px-2.5 py-1.5 hover:bg-primary/20 transition-colors"
          >
            <Eye className="w-3 h-3" />
            Transcript
          </Link>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={onToggleAudio}
          className={cn(
            "flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors",
            isAudioOn
              ? "bg-secondary/60 border-border text-foreground hover:bg-secondary"
              : "bg-red-500/15 border-red-500/30 text-red-400",
          )}
        >
          {isAudioOn ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
          {isAudioOn ? "Mute" : "Unmute"}
        </button>
        <button
          onClick={onToggleVideo}
          className={cn(
            "flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors",
            isVideoOn
              ? "bg-secondary/60 border-border text-foreground hover:bg-secondary"
              : "bg-red-500/15 border-red-500/30 text-red-400",
          )}
        >
          {isVideoOn ? <Video className="w-3.5 h-3.5" /> : <VideoOff className="w-3.5 h-3.5" />}
          {isVideoOn ? "Stop Video" : "Start Video"}
        </button>
        <Button
          variant="destructive"
          size="sm"
          className="h-8 px-3 text-xs gap-1.5 ml-auto"
          onClick={onEnd}
          disabled={isEnding}
        >
          {isEnding ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <PhoneOff className="w-3 h-3" />
          )}
          End Call
        </Button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <span className="inline-flex items-center gap-1 text-[11px] text-green-400 bg-green-500/10 border border-green-500/20 rounded-full px-2.5 py-0.5">
          <Radio className="w-2.5 h-2.5" />100ms room active
        </span>
        {isStreaming && (
          <span className="inline-flex items-center gap-1 text-[11px] text-primary bg-primary/10 border border-primary/20 rounded-full px-2.5 py-0.5">
            <Mic className="w-2.5 h-2.5" />AI transcribing both sides
          </span>
        )}
        <span className="inline-flex items-center gap-1 text-[11px] text-accent bg-accent/10 border border-accent/20 rounded-full px-2.5 py-0.5">
          <Sparkles className="w-2.5 h-2.5" />AI coaching active
        </span>
      </div>
    </div>
  );
}

// ─── Video tile ────────────────────────────────────────────────────────────────
function VideoTile({
  peerId,
  isLocal,
  peerName,
  hmsActions,
}: {
  peerId: string;
  isLocal: boolean;
  peerName: string;
  hmsActions: any;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!hmsActions || !videoRef.current) return;
    hmsActions.attachVideo(peerId, videoRef.current).catch(() => {});
    return () => {
      hmsActions.detachVideo(peerId, videoRef.current!).catch(() => {});
    };
  }, [peerId, hmsActions]);

  return (
    <div className="relative rounded-xl overflow-hidden bg-zinc-900 aspect-video">
      <video
        ref={videoRef}
        autoPlay
        muted={isLocal}
        playsInline
        className="w-full h-full object-cover"
      />
      <div className="absolute bottom-2 left-2 text-[11px] font-medium bg-black/50 text-white px-2 py-0.5 rounded-full">
        {isLocal ? "You" : peerName || "Prospect"}
      </div>
    </div>
  );
}

// ─── MAIN PAGE ─────────────────────────────────────────────────────────────────
export default function LiveCall() {
  const navigate = useNavigate();
  const { team } = useTeam();
  const { setStatus } = useUserStatus(team?.id);
  const { usage } = useMeetingUsage();

  const { startCall, endCall, liveCall, isLive, isLoading, callId } = useLiveCall({
    onCallStarted: () => setStatus("on_call"),
    onCallEnded: () => setStatus("available"),
  });

  const { roomInfo, isCreating, createRoom } = useHMSRoom();
  const { chunksSent, isStreaming, startPeerAudio, stopPeerAudio, stopAll } =
    useHMSAudioStreaming(callId ?? null);

  const [isStarting, setIsStarting] = useState(false);
  const [hostJoined, setHostJoined] = useState(false);
  const [zombieDetected, setZombieDetected] = useState(false);
  const [isAbandoningZombie, setIsAbandoningZombie] = useState(false);
  const [isAudioOn, setIsAudioOn] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [peers, setPeers] = useState<any[]>([]);

  const hmsActionsRef = useRef<any>(null);
  const hmsStoreRef = useRef<any>(null);
  const unsubRef = useRef<(() => void) | null>(null);

  // Zombie detection
  useEffect(() => {
    if (isLive && liveCall && !(liveCall as any).meeting_url && !roomInfo) {
      setZombieDetected(true);
    } else {
      setZombieDetected(false);
    }
  }, [isLive, liveCall, roomInfo]);

  const hasActiveSession = isLive && !!callId && !zombieDetected;

  const handleAbandonZombie = useCallback(async () => {
    if (!callId) return;
    setIsAbandoningZombie(true);
    try {
      await endCall.mutateAsync();
      setZombieDetected(false);
      toast.success("Cleared stuck session.");
    } catch {
      await supabase.from("calls").update({
        status: "completed",
        end_time: new Date().toISOString(),
        duration_minutes: 0,
      }).eq("id", callId);
      setZombieDetected(false);
    } finally {
      setIsAbandoningZombie(false);
    }
  }, [callId, endCall]);

  const checkLimit = useCallback(() => {
    if (usage?.isAtLimit) {
      toast.error("Monthly meeting limit reached. Upgrade to continue.");
      return false;
    }
    return true;
  }, [usage]);

  // ── Load 100ms SDK ────────────────────────────────────────────────────────
  const loadHMSSDK = useCallback(async () => {
    if (window.HMS) return window.HMS;
    await new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdn.100ms.live/sdk/v2.9.15/hms.min.js";
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Failed to load 100ms SDK"));
      document.head.appendChild(s);
    });
    return window.HMS;
  }, []);

  // ── Join as host ──────────────────────────────────────────────────────────
  const handleJoinAsHost = useCallback(async () => {
    if (!roomInfo || !callId) return;
    try {
      const HMS = await loadHMSSDK();
      hmsActionsRef.current = new HMS.HMSActions();
      hmsStoreRef.current = new HMS.HMSStore();

      const hmsActions = hmsActionsRef.current;

      // Subscribe to peers
      const unsub = hmsStoreRef.current.subscribe((store: any) => {
        const allPeers = Object.values(store.peers || {}) as any[];
        setPeers(allPeers);

        // Attach audio tracks for streaming
        allPeers.forEach((peer: any) => {
          const audioTrackId = peer.audioTrack;
          if (audioTrackId) {
            const trackInfo = store.tracks?.[audioTrackId];
            if (trackInfo?.nativeTrack && !trackInfo._streaming) {
              trackInfo._streaming = true;
              startPeerAudio(peer.id, trackInfo.nativeTrack, peer.isLocal);
            }
          }
        });
      });
      unsubRef.current = unsub;

      await hmsActions.join({
        userName: "Host",
        authToken: roomInfo.mgmt_token,
        settings: {
          isAudioMuted: false,
          isVideoMuted: false,
        },
        rememberDeviceSelection: true,
        captureNetworkQualityInPreview: false,
      });

      setHostJoined(true);
      navigate(`/dashboard/live/${callId}`);
    } catch (err: any) {
      console.error("Failed to join 100ms:", err);
      toast.error("Failed to join meeting: " + err.message);
    }
  }, [roomInfo, callId, loadHMSSDK, startPeerAudio, navigate]);

  // ── Create meeting ────────────────────────────────────────────────────────
  const handleCreateMeeting = useCallback(async () => {
    if (!checkLimit()) return;
    setIsStarting(true);
    let callRow: any = null;
    try {
      callRow = await startCall.mutateAsync({
        platform: "100ms",
        name: "Fixsense Meeting",
        participants: [],
      } as any);
      await createRoom(callRow.id, "Fixsense Meeting");
      toast.success("Room ready — share the link with your prospect!");
    } catch (err: any) {
      if (callRow?.id) {
        await supabase.from("calls").update({
          status: "completed",
          end_time: new Date().toISOString(),
          duration_minutes: 0,
        }).eq("id", callRow.id).catch(() => {});
      }
      if (err?.message === "PLAN_LIMIT_REACHED") {
        toast.error("Meeting limit reached. Upgrade to continue.");
      } else {
        toast.error("Could not create meeting room. Please try again.");
      }
    } finally {
      setIsStarting(false);
    }
  }, [checkLimit, startCall, createRoom]);

  // ── Toggle audio/video ────────────────────────────────────────────────────
  const handleToggleAudio = useCallback(async () => {
    if (!hmsActionsRef.current) return;
    await hmsActionsRef.current.setLocalAudioEnabled(!isAudioOn);
    setIsAudioOn((v) => !v);
  }, [isAudioOn]);

  const handleToggleVideo = useCallback(async () => {
    if (!hmsActionsRef.current) return;
    await hmsActionsRef.current.setLocalVideoEnabled(!isVideoOn);
    setIsVideoOn((v) => !v);
  }, [isVideoOn]);

  // ── End call ──────────────────────────────────────────────────────────────
  const handleEndCall = useCallback(async () => {
    stopAll();
    if (unsubRef.current) unsubRef.current();
    try {
      if (hmsActionsRef.current) {
        try { await hmsActionsRef.current.leave(); } catch {}
      }
      await endCall.mutateAsync();
      toast.success("Call ended — generating AI summary…");
      setHostJoined(false);
      if (callId) navigate(`/dashboard/calls/${callId}`);
    } catch {
      toast.error("Failed to end call. Please try again.");
    }
  }, [endCall, callId, navigate, stopAll]);

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-5 pb-10 max-w-2xl mx-auto">
        {/* Header */}
        <div className="space-y-0.5">
          <h1 className="text-2xl font-bold font-display">Live Call</h1>
          <p className="text-sm text-muted-foreground">
            Create a room, share the link — AI transcribes both sides in real-time via 100ms
          </p>
        </div>

        {/* Zombie banner */}
        {zombieDetected && (
          <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-4 flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-yellow-400">Previous session didn't complete</p>
              <p className="text-xs text-muted-foreground mt-1">Clear it to start a new meeting.</p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 shrink-0 border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10"
              onClick={handleAbandonZombie}
              disabled={isAbandoningZombie}
            >
              {isAbandoningZombie ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <RefreshCw className="w-3 h-3" />
              )}
              Clear & Retry
            </Button>
          </div>
        )}

        {/* Limit banner */}
        {usage && !usage.isUnlimited && usage.isAtLimit && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 flex items-center gap-3">
            <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
            <p className="text-sm font-medium text-destructive flex-1">
              Monthly limit reached — {usage.used}/{usage.limit} meetings used
            </p>
            <Button size="sm" variant="destructive" onClick={() => navigate("/dashboard/billing")}>
              Upgrade
            </Button>
          </div>
        )}

        {/* Create meeting CTA */}
        {!hasActiveSession && !roomInfo && !zombieDetected && (
          <div className="glass rounded-2xl border border-border p-6 space-y-5">
            <div className="text-center space-y-1.5">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-3">
                <VideoIcon className="w-7 h-7 text-primary" />
              </div>
              <h2 className="font-semibold text-base">Create a Meeting Room</h2>
              <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                Instant 100ms room — one link, no login for your prospect.
                AI transcribes both sides directly from your browser.
              </p>
            </div>

            <button
              onClick={handleCreateMeeting}
              disabled={isCreating || isStarting || (usage?.isAtLimit ?? false)}
              className="w-full flex items-center justify-center gap-2.5 h-12 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 active:opacity-80 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCreating || isStarting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />Creating room…
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />Create Meeting Room
                </>
              )}
            </button>

            <div className="flex flex-wrap justify-center gap-2">
              {[
                { icon: Shield, text: "No login for guests" },
                { icon: Radio, text: "Real-time transcription" },
                { icon: Sparkles, text: "AI coaching insights" },
              ].map(({ icon: Icon, text }) => (
                <span
                  key={text}
                  className="flex items-center gap-1.5 text-[11px] text-muted-foreground bg-secondary/50 border border-border/60 rounded-full px-2.5 py-1"
                >
                  <Icon className="w-3 h-3 text-primary" />
                  {text}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Loading */}
        {(isStarting || isCreating) && !roomInfo && (
          <div className="glass rounded-2xl border border-primary/20 bg-primary/5 p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            </div>
            <div>
              <p className="font-semibold text-sm text-primary">Preparing Meeting Room</p>
              <p className="text-xs text-muted-foreground mt-0.5">Creating your 100ms room…</p>
            </div>
          </div>
        )}

        {/* Share link panel */}
        {roomInfo && !hostJoined && callId && (
          <ShareLinkPanel
            shareLink={roomInfo.share_link}
            callId={callId}
            onJoinAsHost={handleJoinAsHost}
          />
        )}

        {/* Active meeting controls */}
        {hostJoined && callId && (
          <MeetingControls
            callId={callId}
            shareLink={roomInfo?.share_link}
            isStreaming={isStreaming}
            chunksSent={chunksSent}
            isAudioOn={isAudioOn}
            isVideoOn={isVideoOn}
            onToggleAudio={handleToggleAudio}
            onToggleVideo={handleToggleVideo}
            onEnd={handleEndCall}
            isEnding={endCall.isPending}
          />
        )}

        {/* Video grid */}
        {hostJoined && peers.length > 0 && (
          <div className={cn(
            "grid gap-3",
            peers.length === 1 ? "grid-cols-1" : "grid-cols-2",
          )}>
            {peers.map((peer) => (
              <VideoTile
                key={peer.id}
                peerId={peer.id}
                isLocal={peer.isLocal}
                peerName={peer.name}
                hmsActions={hmsActionsRef.current}
              />
            ))}
          </div>
        )}

        {/* Peer count */}
        {hostJoined && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Users className="w-3.5 h-3.5" />
            {peers.length} participant{peers.length !== 1 ? "s" : ""} in room
          </div>
        )}

        {/* Past calls link */}
        {!hasActiveSession && !isStarting && !zombieDetected && (
          <div className="flex items-center justify-between pt-2 border-t border-border/30 text-xs">
            <span className="text-muted-foreground">Past recordings and AI summaries</span>
            <Link
              to="/dashboard/calls"
              className="text-primary hover:underline flex items-center gap-1 font-medium"
            >
              All calls <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}