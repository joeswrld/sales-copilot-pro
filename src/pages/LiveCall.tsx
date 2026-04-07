/**
 * LiveCall.tsx — v12 (Streaming Architecture, no bots)
 *
 * Flow:
 *  1. Create Daily.co room via edge function
 *  2. Share invite link with prospect
 *  3. Join as host → embedded Daily iframe
 *  4. Daily JS SDK fires `track-started` events → useAudioStreaming captures per-participant audio
 *  5. Audio chunks → transcribe-stream edge fn → Supabase → LiveMeeting page updates live
 *  6. End call → AI summary → redirect to call detail
 */

import DashboardLayout from "@/components/DashboardLayout";
import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  Loader2, ExternalLink, CheckCircle2, ChevronRight,
  AlertTriangle, Shield, StopCircle, VideoIcon, Copy,
  Check, Plus, Sparkles, Radio, Eye, RefreshCw, Link2, Mic,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLiveCall } from "@/hooks/useLiveCall";
import { useMeetingUsage } from "@/hooks/useMeetingUsage";
import { useTeam } from "@/hooks/useTeam";
import { useUserStatus } from "@/hooks/useUserStatus";
import { useDailyRoom } from "@/hooks/useDailyRoom";
import { useAudioStreaming } from "@/hooks/useAudioStreaming";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ─── Share link panel ──────────────────────────────────────────────────────────

function ShareLinkPanel({
  shareLink,
  roomUrl,
  callId,
  onJoinAsHost,
}: {
  shareLink: string;
  roomUrl: string;
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
            Share this link with your prospect — no login needed for them.
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
              : "bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20"
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
        <a href={roomUrl} target="_blank" rel="noopener noreferrer">
          <Button size="sm" variant="outline" className="gap-1.5">
            <ExternalLink className="w-3.5 h-3.5" />
            Open in New Tab
          </Button>
        </a>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          onClick={() => navigate(`/dashboard/live/${callId}`)}
        >
          <Eye className="w-3.5 h-3.5" />
          Live Insights
        </Button>
      </div>

      <p className="text-xs text-muted-foreground/60 flex items-center gap-1.5">
        <Shield className="w-3 h-3" />
        Room expires in 3 hours · AI transcription & analysis active when you join
      </p>
    </div>
  );
}

// ─── Active meeting card ───────────────────────────────────────────────────────

function ActiveMeetingCard({
  callId,
  onEnd,
  isEnding,
  shareLink,
  isStreaming,
  chunksSent,
}: {
  callId: string;
  onEnd: () => void;
  isEnding: boolean;
  shareLink?: string;
  isStreaming: boolean;
  chunksSent: number;
}) {
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    if (!shareLink) return;
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
      toast.success("Link copied!");
    } catch {}
  };

  return (
    <div className="glass rounded-2xl border border-green-500/25 bg-green-500/5 p-5 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <span className="w-3 h-3 rounded-full bg-green-400 animate-pulse" />
          <div>
            <p className="font-semibold text-sm text-green-400">Meeting in progress</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isStreaming
                ? `AI transcribing live · ${chunksSent} chunks processed`
                : "Waiting for audio…"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {shareLink && (
            <button
              onClick={copyLink}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors border border-border/60 rounded-lg px-2.5 py-1.5"
            >
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              {copied ? "Copied!" : "Copy invite link"}
            </button>
          )}
          <Link
            to={`/dashboard/live/${callId}`}
            className="flex items-center gap-1.5 text-xs text-primary border border-primary/30 bg-primary/10 rounded-lg px-2.5 py-1.5 hover:bg-primary/20 transition-colors"
          >
            <Eye className="w-3 h-3" />
            Live transcript
          </Link>
          <Button
            variant="destructive"
            size="sm"
            className="h-8 px-3 text-xs gap-1.5"
            onClick={onEnd}
            disabled={isEnding}
          >
            {isEnding
              ? <Loader2 className="w-3 h-3 animate-spin" />
              : <StopCircle className="w-3 h-3" />}
            End call
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs text-green-400 bg-green-500/10 border border-green-500/20 rounded-full px-3 py-1">
          <Radio className="w-3 h-3" />Daily.co room active
        </span>
        <span className={cn(
          "inline-flex items-center gap-1.5 text-xs rounded-full px-3 py-1 border",
          isStreaming
            ? "text-primary bg-primary/10 border-primary/20"
            : "text-muted-foreground bg-secondary/50 border-border/60"
        )}>
          <Mic className="w-3 h-3" />
          {isStreaming ? "AI transcribing both sides" : "Waiting for participants"}
        </span>
        <span className="inline-flex items-center gap-1.5 text-xs text-accent bg-accent/10 border border-accent/20 rounded-full px-3 py-1">
          <Sparkles className="w-3 h-3" />AI analysis running
        </span>
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

  const { createRoom, isCreating, roomInfo } = useDailyRoom();
  const { state: streamState, startTrackRecording, stopTrackRecording, stopAll } =
    useAudioStreaming({ callId: callId ?? null });

  const [isStarting, setIsStarting] = useState(false);
  const [hostJoined, setHostJoined] = useState(false);
  const [zombieDetected, setZombieDetected] = useState(false);
  const [isAbandoningZombie, setIsAbandoningZombie] = useState(false);

  const dailyHostRef = useRef<HTMLDivElement>(null);
  const dailyFrameRef = useRef<any>(null);
  const dailyCallRef = useRef<any>(null); // Daily.co call object for track events

  // Zombie detection — live call stuck without room info
  useEffect(() => {
    if (isLive && liveCall && !(liveCall as any).meeting_url && !roomInfo) {
      setZombieDetected(true);
    } else {
      setZombieDetected(false);
    }
  }, [isLive, liveCall, roomInfo]);

  const hasActiveSession = isLive && !!callId && !zombieDetected;

  // ── Abandon zombie ─────────────────────────────────────────────────────────
  const handleAbandonZombie = useCallback(async () => {
    if (!callId) return;
    setIsAbandoningZombie(true);
    try {
      await endCall.mutateAsync();
      setZombieDetected(false);
      toast.success("Cleared stuck session — ready for a new meeting.");
    } catch {
      await supabase.from("calls").update({
        status: "completed",
        end_time: new Date().toISOString(),
        duration_minutes: 0,
      }).eq("id", callId);
      setZombieDetected(false);
      toast.success("Cleared. Ready to start.");
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

  // ── Create Daily meeting ───────────────────────────────────────────────────
  const handleCreateMeeting = useCallback(async () => {
    if (!checkLimit()) return;
    setIsStarting(true);
    let callRow: any = null;

    try {
      callRow = await startCall.mutateAsync({
        platform: "Daily.co",
        name: "Fixsense Meeting",
        participants: [],
      } as any);

      await createRoom({
        callId: callRow.id,
        title: "Fixsense Meeting",
        expMinutes: 180,
      });

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

  // ── Attach Daily track listeners for audio streaming ──────────────────────
  const attachDailyListeners = useCallback(
    (callObject: any) => {
      if (!callObject) return;

      callObject.on("track-started", (event: any) => {
        const { track, participant } = event;
        if (!track || track.kind !== "audio") return;

        const sessionId: string = participant?.session_id ?? participant?.user_id ?? "unknown";
        const isLocal: boolean = participant?.local === true;

        startTrackRecording(track, sessionId, isLocal);
      });

      callObject.on("track-stopped", (event: any) => {
        const { participant } = event;
        const sessionId: string = participant?.session_id ?? participant?.user_id ?? "unknown";
        stopTrackRecording(sessionId);
      });

      callObject.on("participant-left", (event: any) => {
        const sessionId: string = event?.participant?.session_id ?? "unknown";
        stopTrackRecording(sessionId);
      });
    },
    [startTrackRecording, stopTrackRecording]
  );

  // ── Join as host in embedded Daily iframe ─────────────────────────────────
  const handleJoinAsHost = useCallback(async () => {
    if (!roomInfo?.room_url) return;

    try {
      if (!(window as any).DailyIframe) {
        await new Promise<void>((resolve, reject) => {
          const s = document.createElement("script");
          s.src = "https://unpkg.com/@daily-co/daily-js";
          s.async = true;
          s.onload = () => resolve();
          s.onerror = () => reject();
          document.head.appendChild(s);
        });
      }

      const DailyIframe = (window as any).DailyIframe;
      if (dailyFrameRef.current) {
        dailyFrameRef.current.destroy();
        dailyCallRef.current = null;
      }

      const frame = DailyIframe.createFrame(dailyHostRef.current!, {
        showLeaveButton: true,
        showFullscreenButton: true,
        iframeStyle: {
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          border: "none",
          borderRadius: "0.75rem",
        },
      });

      dailyFrameRef.current = frame;

      frame.on("joined-meeting", () => {
        setHostJoined(true);
        dailyCallRef.current = frame;
        attachDailyListeners(frame);
        if (callId) navigate(`/dashboard/live/${callId}`);
      });

      frame.on("left-meeting", () => {
        setHostJoined(false);
        stopAll();
        handleEndCall();
      });

      await frame.join({ url: roomInfo.room_url });
      setHostJoined(true);
    } catch {
      toast.error("Failed to open meeting. Try opening in a new tab.");
    }
  }, [roomInfo, callId, navigate, attachDailyListeners, stopAll]);

  // ── End call ───────────────────────────────────────────────────────────────
  const handleEndCall = useCallback(async () => {
    // Stop all audio streaming first
    stopAll();

    try {
      if (dailyFrameRef.current) {
        try { dailyFrameRef.current.destroy(); } catch {}
        dailyFrameRef.current = null;
        dailyCallRef.current = null;
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
            Create a room, share the link — AI transcribes both sides in real-time, no bots needed
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
              {isAbandoningZombie
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : <RefreshCw className="w-3 h-3" />}
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
                Instant Daily.co room — one link, no login for your prospect.
                AI transcribes directly from your browser.
              </p>
            </div>

            <button
              onClick={handleCreateMeeting}
              disabled={isCreating || isStarting || (usage?.isAtLimit ?? false)}
              className="w-full flex items-center justify-center gap-2.5 h-12 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 active:opacity-80 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCreating || isStarting
                ? <><Loader2 className="w-4 h-4 animate-spin" />Creating room…</>
                : <><Plus className="w-4 h-4" />Create Meeting Room</>}
            </button>

            <div className="flex flex-wrap justify-center gap-2">
              {[
                { icon: Shield, text: "No login for guests" },
                { icon: Radio, text: "Real-time transcription" },
                { icon: Sparkles, text: "AI coaching insights" },
              ].map(({ icon: Icon, text }) => (
                <span key={text} className="flex items-center gap-1.5 text-[11px] text-muted-foreground bg-secondary/50 border border-border/60 rounded-full px-2.5 py-1">
                  <Icon className="w-3 h-3 text-primary" />{text}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Loading state */}
        {(isStarting || isCreating) && !roomInfo && (
          <div className="glass rounded-2xl border border-primary/20 bg-primary/5 p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            </div>
            <div>
              <p className="font-semibold text-sm text-primary">Preparing Meeting Room</p>
              <p className="text-xs text-muted-foreground mt-0.5">Creating your Daily.co room…</p>
            </div>
          </div>
        )}

        {/* Share link panel */}
        {roomInfo && !hostJoined && callId && (
          <ShareLinkPanel
            shareLink={roomInfo.share_link}
            roomUrl={roomInfo.room_url}
            callId={callId}
            onJoinAsHost={handleJoinAsHost}
          />
        )}

        {/* Active meeting card */}
        {hostJoined && callId && (
          <ActiveMeetingCard
            callId={callId}
            onEnd={handleEndCall}
            isEnding={endCall.isPending}
            shareLink={roomInfo?.share_link}
            isStreaming={streamState.isStreaming}
            chunksSent={streamState.chunksSent}
          />
        )}

        {/* Daily embedded host frame */}
        {hostJoined && (
          <div className="glass rounded-2xl border border-primary/20 overflow-hidden">
            <div ref={dailyHostRef} className="relative w-full" style={{ height: "560px" }} />
          </div>
        )}

        {/* Past calls link */}
        {!hasActiveSession && !isStarting && !zombieDetected && (
          <div className="flex items-center justify-between pt-2 border-t border-border/30 text-xs">
            <span className="text-muted-foreground">Past recordings and AI summaries</span>
            <Link to="/dashboard/calls" className="text-primary hover:underline flex items-center gap-1 font-medium">
              All calls <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
        )}

      </div>
    </DashboardLayout>
  );
}