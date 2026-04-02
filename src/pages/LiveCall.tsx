/**
 * LiveCall.tsx — Clean rewrite v7
 *
 * What changed:
 * - Removed ALL dependency on join-meeting-bot edge function (it's not deployed)
 * - Uses existing startCall() from useLiveCall which already works
 * - Bot dispatch happens inside startCall() as fire-and-forget (same as before)
 * - If bot fails, user sees manual audio capture immediately
 * - No bot_sessions table required
 * - Status tracked via calls.recall_bot_status via Realtime
 * - Page works 100% even with zero edge functions deployed
 */

import DashboardLayout from "@/components/DashboardLayout";
import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  Bot, Loader2, ExternalLink, RefreshCw, CheckCircle2,
  Clock, ChevronRight, Link2, AlertTriangle,
  Radio, Shield, Eye, StopCircle, Clipboard,
  Info, X, Calendar, Sparkles, RotateCcw, Wifi,
  Users, VideoIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { useCalendar, type UpcomingMeeting } from "@/hooks/useCalendar";
import { useLiveCall } from "@/hooks/useLiveCall";
import { useMeetingUsage } from "@/hooks/useMeetingUsage";
import { useTeam } from "@/hooks/useTeam";
import { useUserStatus } from "@/hooks/useUserStatus";
import { useAudioCapture } from "@/hooks/useAudioCapture";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  formatDistanceToNow, format, isPast, isFuture, addMinutes,
} from "date-fns";

// ─── Platform helpers ─────────────────────────────────────────────────────────

function detectPlatform(url: string): "google_meet" | "zoom" | "teams" | "unknown" {
  if (/meet\.google\.com/i.test(url)) return "google_meet";
  if (/zoom\.(us|com)/i.test(url)) return "zoom";
  if (/teams\.microsoft\.com/i.test(url)) return "teams";
  return "unknown";
}

const PLATFORM_LABELS: Record<string, string> = {
  google_meet: "Google Meet",
  zoom: "Zoom",
  teams: "Microsoft Teams",
  unknown: "Video Call",
};

const PLATFORM_COLORS: Record<string, string> = {
  google_meet: "text-blue-400 bg-blue-500/15 border-blue-500/25",
  zoom: "text-indigo-400 bg-indigo-500/15 border-indigo-500/25",
  teams: "text-purple-400 bg-purple-500/15 border-purple-500/25",
};

function isValidMeetingUrl(url: string): boolean {
  if (!url.trim()) return false;
  try {
    new URL(url);
    return detectPlatform(url) !== "unknown";
  } catch {
    return false;
  }
}

// ─── Recall bot status from calls table ──────────────────────────────────────

type BotPhase =
  | "idle"           // no call started
  | "starting"       // startCall() running
  | "joining"        // bot dispatched, joining
  | "waiting_room"   // bot in waiting room
  | "recording"      // bot recording
  | "ended"          // call ended
  | "bot_failed";    // bot couldn't join — show manual capture

function useBotPhase(callId: string | null | undefined) {
  const [phase, setPhase] = useState<BotPhase>("idle");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!callId) {
      setPhase("idle");
      return;
    }

    // Load initial bot status from DB
    supabase
      .from("calls")
      .select("recall_bot_status, status")
      .eq("id", callId)
      .single()
      .then(({ data }: any) => {
        if (!data) return;
        if (data.status === "completed" || data.status === "live") {
          mapRecallStatus(data.recall_bot_status || "none");
        }
      });

    // Watch for realtime updates
    const channel = supabase
      .channel(`call-bot-${callId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "calls", filter: `id=eq.${callId}` },
        (payload: any) => {
          const rs = payload.new?.recall_bot_status;
          mapRecallStatus(rs || "none");
        }
      )
      .subscribe();

    // 30-second timeout: if still joining → show manual capture option
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setPhase(prev => {
        if (prev === "joining") return "bot_failed";
        return prev;
      });
    }, 30_000);

    return () => {
      supabase.removeChannel(channel);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [callId]);

  function mapRecallStatus(rs: string) {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    const map: Record<string, BotPhase> = {
      joining: "joining",
      joining_call: "joining",
      in_waiting_room: "waiting_room",
      in_call_not_recording: "joining",
      "recording_permission.allowed": "recording",
      in_call_recording: "recording",
      recording: "recording",
      call_ended: "ended",
      done: "ended",
      failed: "bot_failed",
      fatal: "bot_failed",
      "recording_permission.denied": "bot_failed",
      recording_permission_denied: "bot_failed",
      none: "joining", // just dispatched, waiting for first update
    };

    setPhase(map[rs] ?? "joining");
  }

  return { phase, setPhase };
}

// ─── Live call URL input ──────────────────────────────────────────────────────

function MeetingUrlInput({
  onStart,
  isLoading,
  disabled,
}: {
  onStart: (url: string) => void;
  isLoading: boolean;
  disabled: boolean;
}) {
  const [url, setUrl] = useState("");
  const [err, setErr] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const detected = url.trim() ? detectPlatform(url.trim()) : null;

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) { setUrl(text.trim()); setErr(""); }
    } catch {
      inputRef.current?.focus();
    }
  };

  const handleSubmit = () => {
    const v = url.trim();
    if (!v) { setErr("Paste a meeting link to get started"); return; }
    if (!isValidMeetingUrl(v)) {
      setErr("Please enter a valid Google Meet or Zoom link");
      return;
    }
    setErr("");
    onStart(v);
  };

  return (
    <div className="space-y-3">
      {/* Input row */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          {/* Detected platform badge */}
          {detected && detected !== "unknown" && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10 pointer-events-none">
              <span className={cn(
                "text-[10px] font-bold px-2 py-0.5 rounded-full border",
                PLATFORM_COLORS[detected]
              )}>
                {PLATFORM_LABELS[detected]}
              </span>
            </div>
          )}
          <Input
            ref={inputRef}
            value={url}
            onChange={e => { setUrl(e.target.value); setErr(""); }}
            onKeyDown={e => e.key === "Enter" && !isLoading && !disabled && handleSubmit()}
            placeholder="https://meet.google.com/abc-def-ghi"
            className={cn(
              "h-12 text-sm",
              detected && detected !== "unknown" ? "pl-[7.5rem]" : "pl-4",
              err && "border-destructive focus-visible:ring-destructive/30"
            )}
            disabled={isLoading || disabled}
          />
        </div>

        {/* Paste */}
        <Button
          variant="outline"
          size="icon"
          className="h-12 w-12 shrink-0"
          onClick={handlePaste}
          disabled={isLoading || disabled}
          title="Paste from clipboard"
        >
          <Clipboard className="w-4 h-4" />
        </Button>

        {/* Start */}
        <Button
          className="h-12 px-6 gap-2 font-semibold shrink-0"
          onClick={handleSubmit}
          disabled={!url.trim() || isLoading || disabled}
        >
          {isLoading
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <Bot className="w-4 h-4" />}
          {isLoading ? "Starting…" : "Start Recording"}
        </Button>
      </div>

      {/* Validation error */}
      {err && (
        <p className="text-xs text-destructive flex items-center gap-1.5">
          <AlertTriangle className="w-3 h-3 shrink-0" /> {err}
        </p>
      )}

      {/* Supported platforms */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-blue-400/60" />
          Google Meet
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-indigo-400/60" />
          Zoom
        </span>
        <span className="text-muted-foreground/40 text-[10px]">Teams coming soon</span>
      </div>
    </div>
  );
}

// ─── Active session status card ───────────────────────────────────────────────

function ActiveSessionCard({
  phase,
  callId,
  meetingUrl,
  onEnd,
  isEnding,
}: {
  phase: BotPhase;
  callId: string;
  meetingUrl: string;
  onEnd: () => void;
  isEnding: boolean;
}) {
  const isLive = phase === "recording";
  const isWaiting = phase === "waiting_room";
  const isJoining = phase === "joining" || phase === "starting";
  const isFailed = phase === "bot_failed";

  // Colors per phase
  const cardStyle = isFailed
    ? "border-destructive/20 bg-destructive/5"
    : isLive
    ? "border-green-500/25 bg-green-500/5"
    : isWaiting
    ? "border-yellow-500/20 bg-yellow-500/5"
    : "border-primary/20 bg-primary/5";

  const dotColor = isFailed
    ? "bg-destructive"
    : isLive
    ? "bg-green-400"
    : isWaiting
    ? "bg-yellow-400"
    : "bg-primary";

  return (
    <div className={cn("rounded-2xl border p-5 space-y-4 transition-all duration-300", cardStyle)}>

      {/* Header */}
      <div className="flex items-start gap-3">
        {/* Status dot / spinner */}
        <div className={cn(
          "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border",
          cardStyle
        )}>
          {isJoining && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
          {isWaiting && <Clock className="w-4 h-4 text-yellow-400 animate-pulse" />}
          {isLive && <span className="w-3 h-3 rounded-full bg-green-400 animate-pulse" />}
          {isFailed && <AlertTriangle className="w-4 h-4 text-orange-400" />}
          {phase === "ended" && <CheckCircle2 className="w-4 h-4 text-primary" />}
        </div>

        <div className="flex-1 min-w-0">
          {/* Title + LIVE badge */}
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <span className={cn(
              "font-semibold text-sm",
              isFailed ? "text-orange-400"
                : isLive ? "text-green-400"
                : isWaiting ? "text-yellow-400"
                : "text-primary"
            )}>
              {isJoining && "Bot Joining Meeting…"}
              {isWaiting && "Waiting for Host Approval"}
              {isLive && "Recording & Transcribing"}
              {isFailed && "Bot Could Not Join"}
              {phase === "ended" && "Processing Recording…"}
            </span>

            {isLive && (
              <span className="text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-full bg-green-500/15 border border-green-500/25 text-green-400">
                ● LIVE
              </span>
            )}
          </div>

          {/* Subtitle */}
          <p className="text-xs text-muted-foreground leading-relaxed">
            {isJoining && "Fixsense AI Recorder is connecting to your meeting room…"}
            {isWaiting && 'Bot is in the waiting room. Ask your host to admit "Fixsense AI Recorder".'}
            {isLive && "Both sides of the conversation are captured in real-time."}
            {isFailed && "Use manual audio capture to record via your browser microphone."}
            {phase === "ended" && "Generating AI summary, transcript, and action items…"}
          </p>
        </div>
      </div>

      {/* Waiting room instructions */}
      {isWaiting && (
        <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/8 p-3.5 space-y-2">
          <p className="text-xs font-semibold text-yellow-400 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5" />
            Action needed from your host
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            In your Google Meet or Zoom, you'll see a notification that{" "}
            <strong className="text-yellow-300">"Fixsense AI Recorder"</strong>{" "}
            wants to join. Ask your host to click <strong className="text-yellow-300">Admit</strong>.
          </p>
          {meetingUrl && (
            <a
              href={meetingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-yellow-400 hover:text-yellow-300 font-medium transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              Open meeting to admit bot
            </a>
          )}
        </div>
      )}

      {/* Live recording chips */}
      {isLive && (
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs text-green-400 bg-green-500/10 border border-green-500/20 rounded-full px-3 py-1">
            <Radio className="w-3 h-3" />
            Both sides captured
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs text-primary bg-primary/10 border border-primary/20 rounded-full px-3 py-1">
            <Sparkles className="w-3 h-3" />
            AI analysis running
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground bg-secondary/60 border border-border rounded-full px-3 py-1">
            <Shield className="w-3 h-3" />
            Bot visible to all
          </span>
        </div>
      )}

      {/* Bot failed — manual capture option */}
      {isFailed && (
        <button
          onClick={onFallback}
          className="w-full flex items-center gap-3 rounded-xl border border-orange-500/20 bg-orange-500/8 p-3.5 text-left hover:bg-orange-500/12 transition-colors"
        >
          <div className="w-8 h-8 rounded-lg bg-orange-500/15 flex items-center justify-center shrink-0">
            <Mic className="w-4 h-4 text-orange-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-orange-400">Use Manual Audio Capture</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Record via your browser mic — no bot needed
            </p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
        </button>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* View live transcript */}
        {(isLive || isJoining || isWaiting) && (
          <Link
            to={`/dashboard/live/${callId}`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold border border-primary/30 bg-primary/10 text-primary rounded-lg px-3 py-2 hover:bg-primary/20 transition-colors"
          >
            <Eye className="w-3.5 h-3.5" />
            View live transcript
          </Link>
        )}

        {/* Open meeting */}
        {meetingUrl && !isFailed && (
          <a
            href={meetingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs border border-border/60 bg-secondary/40 text-muted-foreground rounded-lg px-3 py-2 hover:bg-secondary/70 hover:text-foreground transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Open meeting
          </a>
        )}

        {/* End call */}
        {!isFailed && phase !== "ended" && (
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
        )}
      </div>
    </div>
  );
}

// ─── Manual audio capture panel ──────────────────────────────────────────────

function ManualCapturePanel({ callId }: { callId: string | null }) {
  const navigate = useNavigate();

  return (
    <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0">
          <MonitorSpeaker className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h3 className="font-semibold text-sm text-primary">Manual Audio Capture</h3>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            Record your meeting directly from your browser. Share your tab audio
            in Chrome or Edge to capture both sides of the conversation.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        {[
          { icon: <Mic className="w-3.5 h-3.5" />, text: "Mic only on mobile" },
          { icon: <MonitorSpeaker className="w-3.5 h-3.5" />, text: "Tab audio on Chrome" },
          { icon: <Radio className="w-3.5 h-3.5" />, text: "Both sides on desktop" },
          { icon: <Sparkles className="w-3.5 h-3.5" />, text: "AI analysis still runs" },
        ].map((item, i) => (
          <div key={i} className="flex items-center gap-2 text-muted-foreground">
            <span className="text-primary shrink-0">{item.icon}</span>
            {item.text}
          </div>
        ))}
      </div>

      <Button
        className="w-full gap-2"
        onClick={() => callId
          ? navigate(`/dashboard/live/${callId}`)
          : navigate("/dashboard/live")
        }
      >
        <Mic className="w-4 h-4" />
        Start Manual Capture
      </Button>
    </div>
  );
}

// ─── Upcoming meeting row ─────────────────────────────────────────────────────

function UpcomingMeetingRow({
  meeting,
  onRecord,
  isRecording,
}: {
  meeting: UpcomingMeeting;
  onRecord: (url: string) => void;
  isRecording: boolean;
}) {
  const start = new Date(meeting.scheduled_time);
  const end = addMinutes(start, meeting.duration_minutes);
  const isNow = isPast(start) && isFuture(end);
  const isSoon = !isPast(start) && start.getTime() - Date.now() < 10 * 60 * 1000;

  return (
    <div className={cn(
      "glass rounded-xl border p-4 flex items-center gap-3 transition-all",
      isNow ? "border-green-500/25 bg-green-500/5"
        : isSoon ? "border-primary/20 bg-primary/5"
        : "border-border hover:border-border/80"
    )}>
      {/* Time */}
      <div className="text-center w-12 shrink-0">
        <p className="text-sm font-bold font-mono">{format(start, "h:mm")}</p>
        <p className="text-[10px] text-muted-foreground uppercase">{format(start, "a")}</p>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{meeting.title}</p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className={cn(
            "text-[10px] font-semibold px-1.5 py-0.5 rounded-full border",
            PLATFORM_COLORS[meeting.meeting_provider] || "text-muted-foreground bg-secondary border-border"
          )}>
            {PLATFORM_LABELS[meeting.meeting_provider] || meeting.meeting_provider}
          </span>
          {meeting.participants?.length > 0 && (
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Users className="w-2.5 h-2.5" />
              {meeting.participants.slice(0, 2).join(", ")}
              {meeting.participants.length > 2 && ` +${meeting.participants.length - 2}`}
            </span>
          )}
        </div>
      </div>

      {/* Action */}
      <div className="shrink-0">
        {meeting.bot_dispatched ? (
          <span className="flex items-center gap-1.5 text-xs text-green-500 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            Live
          </span>
        ) : isNow && meeting.meeting_url ? (
          <Button
            size="sm"
            className="h-8 text-xs gap-1"
            onClick={() => onRecord(meeting.meeting_url!)}
            disabled={isRecording}
          >
            {isRecording ? <Loader2 className="w-3 h-3 animate-spin" /> : <Bot className="w-3 h-3" />}
            Record
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">
            {isNow ? "No link" : formatDistanceToNow(start, { addSuffix: true })}
          </span>
        )}
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

  const { startCall, endCall, liveCall, isLive, callId } = useLiveCall({
    onCallStarted: () => setStatus("on_call"),
    onCallEnded: () => setStatus("available"),
  });

  const { phase, setPhase } = useBotPhase(callId);

  const {
    isConnected: calendarConnected,
    isLoading: calendarLoading,
    upcomingMeetings,
    connect: connectCalendar,
    disconnect: disconnectCalendar,
    syncNow,
    isSyncing,
  } = useCalendar();

  const [meetingUrl, setMeetingUrl] = useState("");
  const [isStarting, setIsStarting] = useState(false);
  const [showManual, setShowManual] = useState(false);

  // If already in a live call on mount, restore state
  useEffect(() => {
    if (isLive && callId) {
      const url = (liveCall as any)?.meeting_url || "";
      setMeetingUrl(url);
      setPhase("joining");
    }
  }, [isLive, callId, liveCall, setPhase]);

  const hasActiveSession = isLive && !!callId;

  // ── Start call: uses existing useLiveCall hook (already works) ──
  const handleStartRecording = useCallback(async (url: string) => {
    if (usage?.isAtLimit) {
      toast.error("Monthly meeting limit reached. Upgrade to continue.");
      return;
    }

    setIsStarting(true);
    setMeetingUrl(url);
    setShowManual(false);

    try {
      const platform = detectPlatform(url);

      await startCall.mutateAsync({
        platform: PLATFORM_LABELS[platform] || "Video Call",
        meeting_id: url,
        meeting_url: url,
        name: `${PLATFORM_LABELS[platform] || "Video Call"} Meeting`,
        participants: [],
      } as any);

      // startCall handles bot dispatch internally — set joining phase
      setPhase("joining");
      toast.success("Recording started — bot is joining your meeting");
    } catch (err: any) {
      const msg = err?.message || "";
      if (msg === "PLAN_LIMIT_REACHED") {
        toast.error("Meeting limit reached. Upgrade to continue.");
      } else {
        toast.error("Could not start recording. Check your connection and try again.");
        console.error("startCall error:", err);
      }
      setMeetingUrl("");
      setPhase("idle");
    } finally {
      setIsStarting(false);
    }
  }, [startCall, setPhase, usage]);

  // ── End call ──
  const handleEndCall = useCallback(async () => {
    try {
      await endCall.mutateAsync();
      toast.success("Call ended — generating AI summary…");
      setMeetingUrl("");
      setShowManual(false);
      if (callId) navigate(`/dashboard/calls/${callId}`);
    } catch {
      toast.error("Failed to end call. Please try again.");
    }
  }, [endCall, callId, navigate]);

  // ── Bot failed → show manual capture ──
  const handleFallback = useCallback(() => {
    if (callId) {
      navigate(`/dashboard/live/${callId}`);
    } else {
      setShowManual(true);
    }
  }, [callId, navigate]);

  return (
    <DashboardLayout>
      <div className="space-y-5 pb-10 max-w-2xl mx-auto">

        {/* ── Header ── */}
        <div className="space-y-0.5">
          <h1 className="text-2xl font-bold font-display">Live Call</h1>
          <p className="text-sm text-muted-foreground">
            Paste any meeting link — the AI bot joins and records automatically
          </p>
        </div>

        {/* ── Meeting limit banner ── */}
        {usage && !usage.isUnlimited && usage.isAtLimit && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 flex items-center gap-3">
            <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
            <p className="text-sm font-medium text-destructive flex-1">
              Monthly limit reached — {usage.used}/{usage.limit} meetings used
            </p>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => navigate("/dashboard/billing")}
            >
              Upgrade
            </Button>
          </div>
        )}

        {/* ── Paste URL input — hidden when call is active ── */}
        {!hasActiveSession && (
          <div className="glass rounded-2xl border border-border p-5 space-y-4">
            <div>
              <h2 className="font-semibold text-sm">Start a New Recording</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Paste your Google Meet or Zoom link below
              </p>
            </div>
            <MeetingUrlInput
              onStart={handleStartRecording}
              isLoading={isStarting}
              disabled={usage?.isAtLimit ?? false}
            />

            {/* How it works — inline tip */}
            <div className="flex items-start gap-2 pt-1 border-t border-border/50">
              <Info className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                The bot joins as <strong className="text-foreground">"Fixsense AI Recorder"</strong>{" "}
                — visible to all participants. Host may need to admit it from the waiting room.
              </p>
            </div>
          </div>
        )}

        {/* ── Active call status card ── */}
        {hasActiveSession && callId && (
          <ActiveSessionCard
            phase={phase}
            callId={callId}
            meetingUrl={meetingUrl}
            onEnd={handleEndCall}
            onFallback={handleFallback}
            isEnding={endCall.isPending}
          />
        )}

        {/* ── Starting state (before callId exists) ── */}
        {isStarting && !callId && (
          <div className="glass rounded-2xl border border-primary/20 bg-primary/5 p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            </div>
            <div>
              <p className="font-semibold text-sm text-primary">Preparing Recording</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Setting up your meeting — this takes a few seconds…
              </p>
            </div>
          </div>
        )}

        {/* ── Manual capture panel ── */}
        {showManual && <ManualCapturePanel callId={callId || null} />}

        {/* ── Google Calendar ── */}
        {!calendarConnected && !hasActiveSession && !isStarting && (
          <div className="glass rounded-xl border border-border p-4 flex items-center gap-4">
            <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
              <Calendar className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">Connect Google Calendar</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Auto-detect upcoming meetings — no link pasting needed
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={connectCalendar} className="shrink-0 gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              Connect
            </Button>
          </div>
        )}

        {/* ── Upcoming meetings from calendar ── */}
        {calendarConnected && !hasActiveSession && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Upcoming Meetings
              </h2>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1.5"
                onClick={syncNow}
                disabled={isSyncing}
              >
                {isSyncing
                  ? <Loader2 className="w-3 h-3 animate-spin" />
                  : <RefreshCw className="w-3 h-3" />}
                Sync
              </Button>
            </div>

            {calendarLoading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : upcomingMeetings.length === 0 ? (
              <div className="glass rounded-xl p-8 text-center border border-dashed border-border">
                <Calendar className="w-7 h-7 mx-auto mb-2 opacity-20" />
                <p className="text-sm text-muted-foreground">
                  No upcoming meetings with video links
                </p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  Meetings with Google Meet or Zoom links will appear here
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {upcomingMeetings.slice(0, 6).map(m => (
                  <UpcomingMeetingRow
                    key={m.id}
                    meeting={m}
                    onRecord={handleStartRecording}
                    isRecording={isStarting}
                  />
                ))}
              </div>
            )}

            <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3 h-3 text-green-500" />
                Google Calendar connected
              </div>
              <button
                onClick={() => disconnectCalendar()}
                className="hover:text-destructive transition-colors"
              >
                Disconnect
              </button>
            </div>
          </div>
        )}

        {/* ── Past calls link ── */}
        {!hasActiveSession && !isStarting && (
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
