/**
 * LiveCall.tsx — v11 (Daily + Lovable AI rebuild)
 *
 * Clean flow:
 *  1. Create Daily.co room via edge function
 *  2. Share link with prospect
 *  3. Join as host → embedded Daily iframe
 *  4. Real-time transcript + insights via LiveMeeting page (/dashboard/live/:id)
 *  5. End call → AI summary → redirect to call detail
 */

import DashboardLayout from "@/components/DashboardLayout";
import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  Loader2, ExternalLink, CheckCircle2, ChevronRight,
  AlertTriangle, Shield, StopCircle, VideoIcon, Copy,
  Check, Plus, Sparkles, Radio, Eye, RefreshCw, Link2, Bot,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLiveCall } from "@/hooks/useLiveCall";
import { useMeetingUsage } from "@/hooks/useMeetingUsage";
import { useTeam } from "@/hooks/useTeam";
import { useUserStatus } from "@/hooks/useUserStatus";
import { useDailyRoom } from "@/hooks/useDailyRoom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ─── Bot phase tracker ────────────────────────────────────────────────────────

type BotPhase = "idle" | "joining" | "waiting_room" | "recording" | "ended" | "bot_failed";

function useBotPhase(callId: string | null | undefined) {
  const [phase, setPhase] = useState<BotPhase>("idle");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!callId) { setPhase("idle"); return; }

    supabase
      .from("calls")
      .select("recall_bot_status")
      .eq("id", callId)
      .single()
      .then(({ data }: any) => {
        if (data?.recall_bot_status) mapStatus(data.recall_bot_status);
      });

    const ch = supabase
      .channel(`call-bot-${callId}`)
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "calls", filter: `id=eq.${callId}`,
      }, (p: any) => mapStatus(p.new?.recall_bot_status || "none"))
      .subscribe();

    timeoutRef.current = setTimeout(() => {
      setPhase(prev => prev === "joining" ? "bot_failed" : prev);
    }, 45_000);

    return () => {
      supabase.removeChannel(ch);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [callId]);

  function mapStatus(rs: string) {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    const map: Record<string, BotPhase> = {
      joining: "joining", joining_call: "joining",
      in_waiting_room: "waiting_room",
      in_call_not_recording: "joining",
      "recording_permission.allowed": "recording",
      in_call_recording: "recording", recording: "recording",
      call_ended: "ended", done: "ended",
      failed: "bot_failed", fatal: "bot_failed",
      "recording_permission.denied": "bot_failed",
      none: "joining",
    };
    setPhase(map[rs] ?? "joining");
  }

  return { phase, setPhase };
}

// ─── Share link panel ─────────────────────────────────────────────────────────

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
        Room expires in 3 hours · AI transcription & analysis active
      </p>
    </div>
  );
}

// ─── Active meeting card ──────────────────────────────────────────────────────

function ActiveMeetingCard({
  callId,
  onEnd,
  isEnding,
  shareLink,
}: {
  callId: string;
  onEnd: () => void;
  isEnding: boolean;
  shareLink?: string;
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
            <p className="text-xs text-muted-foreground mt-0.5">AI transcription running in real-time</p>
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
        <span className="inline-flex items-center gap-1.5 text-xs text-primary bg-primary/10 border border-primary/20 rounded-full px-3 py-1">
          <Sparkles className="w-3 h-3" />AI analysis running
        </span>
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground bg-secondary/50 border border-border/60 rounded-full px-3 py-1">
          <Bot className="w-3 h-3" />Bot recording both sides
        </span>
      </div>
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export default function LiveCall() {
  const navigate = useNavigate();
  const { team } = useTeam();
  const { setStatus } = useUserStatus(team?.id);
  const { usage } = useMeetingUsage();

  const { startCall, endCall, liveCall, isLive, isLoading, callId } = useLiveCall({
    onCallStarted: () => setStatus("on_call"),
    onCallEnded:   () => setStatus("available"),
  });

  const { phase, setPhase } = useBotPhase(callId);
  const { createRoom, isCreating, roomInfo } = useDailyRoom();

  const [isStarting, setIsStarting]             = useState(false);
  const [hostJoined, setHostJoined]             = useState(false);
  const [zombieDetected, setZombieDetected]     = useState(false);
  const [isAbandoningZombie, setIsAbandoningZombie] = useState(false);

  const dailyHostRef  = useRef<HTMLDivElement>(null);
  const dailyFrameRef = useRef<any>(null);

  // Zombie detection — live call with no meeting_url and no fresh roomInfo
  useEffect(() => {
    if (isLive && liveCall && !(liveCall as any).meeting_url && !roomInfo) {
      setZombieDetected(true);
    } else {
      setZombieDetected(false);
    }
  }, [isLive, liveCall, roomInfo]);

  useEffect(() => {
    if (isLive && callId && !zombieDetected) setPhase("joining");
  }, [isLive, callId, zombieDetected, setPhase]);

  const hasActiveSession = isLive && !!callId && !zombieDetected;

  // ── Abandon zombie ────────────────────────────────────────────────────────
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

  // ── Create Daily meeting ──────────────────────────────────────────────────
  const handleCreateMeeting = useCallback(async () => {
    if (!checkLimit()) return;
    setIsStarting(true);
    let callRow: any = null;

    try {
      callRow = await startCall.mutateAsync({
        platform:     "Daily.co",
        name:         "Fixsense Meeting",
        participants: [],
      } as any);

      await createRoom({
        callId:     callRow.id,
        title:      "Fixsense Meeting",
        expMinutes: 180,
      });

      setPhase("joining");
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
      setPhase("idle");
    } finally {
      setIsStarting(false);
    }
  }, [checkLimit, startCall, createRoom, setPhase]);

  // ── Join as host in embedded Daily iframe ─────────────────────────────────
  const handleJoinAsHost = useCallback(async () => {
    if (!roomInfo?.room_url) return;
    try {
      if (!(window as any).DailyIframe) {
        await new Promise<void>((resolve, reject) => {
          const s = document.createElement("script");
          s.src = "https://unpkg.com/@daily-co/daily-js";
          s.async = true;
          s.onload  = () => resolve();
          s.onerror = () => reject();
          document.head.appendChild(s);
        });
      }

      const DailyIframe = (window as any).DailyIframe;
      if (dailyFrameRef.current) dailyFrameRef.current.destroy();

      const frame = DailyIframe.createFrame(dailyHostRef.current!, {
        showLeaveButton:      true,
        showFullscreenButton: true,
        iframeStyle: {
          position: "absolute", top: 0, left: 0,
          width: "100%", height: "100%",
          border: "none", borderRadius: "0.75rem",
        },
      });

      dailyFrameRef.current = frame;
      frame.on("joined-meeting", () => setHostJoined(true));
      frame.on("left-meeting", () => { setHostJoined(false); handleEndCall(); });

      await frame.join({ url: roomInfo.room_url });
      setHostJoined(true);

      // Navigate to live insights page so user can see transcript
      if (callId) {
        navigate(`/dashboard/live/${callId}`);
      }
    } catch {
      toast.error("Failed to open meeting. Try opening in a new tab.");
    }
  }, [roomInfo, callId, navigate]);

  // ── End call ──────────────────────────────────────────────────────────────
  const handleEndCall = useCallback(async () => {
    try {
      if (dailyFrameRef.current) {
        try { dailyFrameRef.current.destroy(); } catch {}
        dailyFrameRef.current = null;
      }
      await endCall.mutateAsync();
      toast.success("Call ended — generating AI summary…");
      setHostJoined(false);
      if (callId) navigate(`/dashboard/calls/${callId}`);
    } catch {
      toast.error("Failed to end call. Please try again.");
    }
  }, [endCall, callId, navigate]);

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
            Create a room, share the link with your prospect — AI joins, transcribes, and coaches you in real-time
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
                { icon: Shield,   text: "No login for guests" },
                { icon: Radio,    text: "Real-time transcription" },
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
              <p className="text-xs text-muted-foreground mt-0.5">Setting up your room and dispatching AI recorder…</p>
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