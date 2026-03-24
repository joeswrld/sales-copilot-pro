/**
 * LiveCall.tsx — Bot Recording System v5
 *
 * Architecture:
 *  1. User pastes meeting URL (Google Meet or Zoom)
 *  2. Bot deployment triggered via join-meeting-bot edge function
 *  3. Real-time bot status updates via Supabase Realtime
 *  4. Graceful fallback to manual audio capture if bot fails
 *  5. Mobile works automatically (bot runs server-side)
 */

import DashboardLayout from "@/components/DashboardLayout";
import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  Bot, Video, Loader2, ExternalLink, RefreshCw,
  CheckCircle2, Clock, Users, Zap, ChevronRight,
  Link2, AlertTriangle, Wifi, WifiOff, Mic,
  Radio, Shield, Eye, PlayCircle, StopCircle,
  ArrowRight, Clipboard, Info, X, RotateCcw,
  Calendar, Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useCalendar, type UpcomingMeeting } from "@/hooks/useCalendar";
import { useLiveCall } from "@/hooks/useLiveCall";
import { useMeetingUsage } from "@/hooks/useMeetingUsage";
import { useTeam } from "@/hooks/useTeam";
import { useUserStatus } from "@/hooks/useUserStatus";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatDistanceToNow, format, isPast, isFuture, addMinutes } from "date-fns";

// ─── Types ────────────────────────────────────────────────────────────────────

export type BotStatus =
  | "idle"
  | "preparing"
  | "joining"
  | "waiting_room"
  | "in_call"
  | "recording"
  | "paused"
  | "call_ended"
  | "failed"
  | "rejected"
  | "timeout";

export interface BotSession {
  id: string;
  call_id: string;
  status: BotStatus;
  join_attempts: number;
  last_attempt_at: string | null;
  error_message: string | null;
  meeting_url: string;
  platform: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function detectPlatform(url: string): "google_meet" | "zoom" | "teams" | "unknown" {
  const lower = url.toLowerCase();
  if (/meet\.google\.com/i.test(lower)) return "google_meet";
  if (/zoom\.(us|com)/i.test(lower)) return "zoom";
  if (/teams\.microsoft\.com/i.test(lower)) return "teams";
  return "unknown";
}

function getPlatformLabel(platform: string) {
  const map: Record<string, string> = {
    google_meet: "Google Meet",
    zoom: "Zoom",
    teams: "Microsoft Teams",
    unknown: "Video Call",
  };
  return map[platform] || "Video Call";
}

function getPlatformColor(platform: string) {
  const map: Record<string, string> = {
    google_meet: "text-blue-400 bg-blue-500/10 border-blue-500/20",
    zoom: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20",
    teams: "text-purple-400 bg-purple-500/10 border-purple-500/20",
    unknown: "text-muted-foreground bg-secondary border-border",
  };
  return map[platform] || map.unknown;
}

function isValidMeetingUrl(url: string): boolean {
  if (!url.trim()) return false;
  try {
    new URL(url);
    return detectPlatform(url) !== "unknown";
  } catch {
    return false;
  }
}

// ─── Bot Status Config ────────────────────────────────────────────────────────

const BOT_STATUS_CONFIG: Record<BotStatus, {
  label: string;
  description: string;
  color: string;
  bg: string;
  border: string;
  icon: React.ReactNode;
  pulse: boolean;
}> = {
  idle: {
    label: "Ready",
    description: "Paste a meeting URL to get started",
    color: "text-muted-foreground",
    bg: "bg-secondary/40",
    border: "border-border",
    icon: <Bot className="w-4 h-4" />,
    pulse: false,
  },
  preparing: {
    label: "Preparing AI Recorder",
    description: "Setting up your recording bot…",
    color: "text-primary",
    bg: "bg-primary/5",
    border: "border-primary/20",
    icon: <Loader2 className="w-4 h-4 animate-spin" />,
    pulse: false,
  },
  joining: {
    label: "Joining Meeting",
    description: "Bot is connecting to the meeting room…",
    color: "text-blue-400",
    bg: "bg-blue-500/5",
    border: "border-blue-500/20",
    icon: <Loader2 className="w-4 h-4 animate-spin" />,
    pulse: false,
  },
  waiting_room: {
    label: "Waiting for Host Approval",
    description: "Bot is in the waiting room. Ask your host to admit \"Fixsense AI Recorder\"",
    color: "text-yellow-400",
    bg: "bg-yellow-500/5",
    border: "border-yellow-500/20",
    icon: <Clock className="w-4 h-4" />,
    pulse: true,
  },
  in_call: {
    label: "In Meeting",
    description: "Bot has joined the call and is preparing to record…",
    color: "text-green-400",
    bg: "bg-green-500/5",
    border: "border-green-500/20",
    icon: <CheckCircle2 className="w-4 h-4" />,
    pulse: false,
  },
  recording: {
    label: "Recording & Transcribing",
    description: "Both sides are being captured in real-time",
    color: "text-green-400",
    bg: "bg-green-500/5",
    border: "border-green-500/20",
    icon: <span className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse" />,
    pulse: true,
  },
  paused: {
    label: "Recording Paused",
    description: "Recording is temporarily paused",
    color: "text-yellow-400",
    bg: "bg-yellow-500/5",
    border: "border-yellow-500/20",
    icon: <Clock className="w-4 h-4" />,
    pulse: false,
  },
  call_ended: {
    label: "Call Ended",
    description: "Processing your recording and generating AI summary…",
    color: "text-primary",
    bg: "bg-primary/5",
    border: "border-primary/20",
    icon: <Sparkles className="w-4 h-4" />,
    pulse: false,
  },
  failed: {
    label: "Unable to Join",
    description: "The bot could not join this meeting. This may be due to platform restrictions.",
    color: "text-red-400",
    bg: "bg-red-500/5",
    border: "border-red-500/20",
    icon: <AlertTriangle className="w-4 h-4" />,
    pulse: false,
  },
  rejected: {
    label: "Access Denied",
    description: "The host denied entry. Ask them to admit \"Fixsense AI Recorder\".",
    color: "text-red-400",
    bg: "bg-red-500/5",
    border: "border-red-500/20",
    icon: <X className="w-4 h-4" />,
    pulse: false,
  },
  timeout: {
    label: "Timed Out",
    description: "Bot waited too long for host approval. Please retry.",
    color: "text-yellow-400",
    bg: "bg-yellow-500/5",
    border: "border-yellow-500/20",
    icon: <Clock className="w-4 h-4" />,
    pulse: false,
  },
};

// ─── useBotSession hook ───────────────────────────────────────────────────────

function useBotSession(callId: string | null) {
  const [session, setSession] = useState<BotSession | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const loadSession = useCallback(async () => {
    if (!callId) return;
    try {
      const { data } = await supabase
        .from("bot_sessions" as any)
        .select("*")
        .eq("call_id", callId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) setSession(data as BotSession);
    } catch (err) {
      console.error("Failed to load bot session:", err);
    }
  }, [callId]);

  useEffect(() => {
    if (!callId) return;
    loadSession();

    const channel = supabase
      .channel(`bot-session:${callId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bot_sessions" },
        (payload: any) => {
          if (payload.new?.call_id === callId) {
            setSession(payload.new as BotSession);
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "calls", filter: `id=eq.${callId}` },
        (payload: any) => {
          if (payload.new?.recall_bot_status) {
            // Map recall status to our BotStatus
            const statusMap: Record<string, BotStatus> = {
              joining: "joining",
              in_waiting_room: "waiting_room",
              recording_permission_allowed: "recording",
              in_call: "in_call",
              recording: "recording",
              call_ended: "call_ended",
              done: "call_ended",
              failed: "failed",
              recording_permission_denied: "rejected",
            };
            const mapped = statusMap[payload.new.recall_bot_status];
            if (mapped) {
              setSession(prev => prev ? { ...prev, status: mapped } : null);
            }
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [callId, loadSession]);

  const deployBot = useCallback(async (meetingUrl: string, platform: string, callId: string) => {
    setIsLoading(true);
    try {
      // Create bot session record
      const { data: sessionData, error: sessionError } = await supabase
        .from("bot_sessions" as any)
        .insert({
          call_id: callId,
          status: "preparing" as BotStatus,
          meeting_url: meetingUrl,
          platform,
          join_attempts: 0,
        })
        .select()
        .single();

      if (sessionError) throw sessionError;
      setSession(sessionData as BotSession);

      // Trigger the edge function
      const { error: fnError } = await supabase.functions.invoke("join-meeting-bot", {
        body: {
          call_id: callId,
          meeting_url: meetingUrl,
          platform,
          bot_name: "Fixsense AI Recorder",
        },
      });

      if (fnError) {
        // Update session to failed
        await supabase
          .from("bot_sessions" as any)
          .update({ status: "failed", error_message: fnError.message })
          .eq("call_id", callId);
        setSession(prev => prev ? { ...prev, status: "failed", error_message: fnError.message } : null);
      }
    } catch (err: any) {
      console.error("Bot deployment error:", err);
      setSession(prev => prev ? { ...prev, status: "failed", error_message: err.message } : null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const retryBot = useCallback(async () => {
    if (!session) return;
    setIsLoading(true);
    try {
      await supabase
        .from("bot_sessions" as any)
        .update({
          status: "joining",
          join_attempts: (session.join_attempts || 0) + 1,
          last_attempt_at: new Date().toISOString(),
          error_message: null,
        })
        .eq("id", session.id);

      await supabase.functions.invoke("join-meeting-bot", {
        body: {
          call_id: session.call_id,
          meeting_url: session.meeting_url,
          platform: session.platform,
          bot_name: "Fixsense AI Recorder",
          retry: true,
        },
      });
    } catch (err) {
      console.error("Retry error:", err);
    } finally {
      setIsLoading(false);
    }
  }, [session]);

  return { session, isLoading, deployBot, retryBot };
}

// ─── BotStatusPanel ───────────────────────────────────────────────────────────

function BotStatusPanel({
  status,
  session,
  callId,
  meetingUrl,
  onRetry,
  onFallback,
  onEnd,
  isRetrying,
}: {
  status: BotStatus;
  session: BotSession | null;
  callId: string | null;
  meetingUrl: string;
  onRetry: () => void;
  onFallback: () => void;
  onEnd: () => void;
  isRetrying: boolean;
}) {
  const cfg = BOT_STATUS_CONFIG[status];
  const isTerminal = ["failed", "rejected", "timeout"].includes(status);
  const isActive = ["recording", "in_call", "waiting_room"].includes(status);
  const isSuccess = ["recording", "in_call"].includes(status);

  return (
    <div className={cn(
      "rounded-2xl border p-5 space-y-4 transition-all duration-300",
      cfg.bg, cfg.border
    )}>
      {/* Header row */}
      <div className="flex items-start gap-4">
        <div className={cn(
          "w-11 h-11 rounded-xl flex items-center justify-center shrink-0",
          cfg.bg, `border ${cfg.border}`
        )}>
          <span className={cfg.color}>{cfg.icon}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className={cn("font-semibold text-sm", cfg.color)}>{cfg.label}</h3>
            {cfg.pulse && status === "recording" && (
              <div className="flex items-center gap-1.5 text-xs font-medium text-green-400 bg-green-500/10 border border-green-500/20 rounded-full px-2 py-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                LIVE
              </div>
            )}
            {session?.join_attempts && session.join_attempts > 0 && (
              <span className="text-xs text-muted-foreground">
                Attempt {session.join_attempts + 1}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{cfg.description}</p>
        </div>
      </div>

      {/* Waiting room special instructions */}
      {status === "waiting_room" && (
        <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4 space-y-2">
          <div className="flex items-center gap-2 text-yellow-400 font-semibold text-xs">
            <Info className="w-3.5 h-3.5" />
            Action Required
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Your meeting host needs to admit the bot. In your meeting, look for a participant named{" "}
            <strong className="text-yellow-300">"Fixsense AI Recorder"</strong> in the waiting room and click <strong className="text-yellow-300">Admit</strong>.
          </p>
          <a
            href={meetingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-yellow-400 hover:text-yellow-300 transition-colors mt-1"
          >
            <ExternalLink className="w-3 h-3" />
            Open meeting to admit bot
          </a>
        </div>
      )}

      {/* Recording active info */}
      {isSuccess && (
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-1.5 text-xs text-green-400 bg-green-500/10 rounded-full px-3 py-1">
            <Radio className="w-3 h-3" />
            Both sides captured
          </div>
          <div className="flex items-center gap-1.5 text-xs text-primary bg-primary/10 rounded-full px-3 py-1">
            <Sparkles className="w-3 h-3" />
            AI analysis running
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-secondary/60 rounded-full px-3 py-1">
            <Shield className="w-3 h-3" />
            Bot visible to participants
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        {isActive && (
          <>
            <a
              href={meetingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium border border-border/60 bg-secondary/40 rounded-lg px-3 py-1.5 hover:bg-secondary/70 transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              Open meeting
            </a>
            {callId && (
              <Link
                to={`/dashboard/live/${callId}`}
                className="inline-flex items-center gap-1.5 text-xs font-medium border border-primary/30 bg-primary/10 text-primary rounded-lg px-3 py-1.5 hover:bg-primary/20 transition-colors"
              >
                <Eye className="w-3 h-3" />
                View live transcript
              </Link>
            )}
            <Button
              variant="destructive"
              size="sm"
              className="text-xs h-7 px-3"
              onClick={onEnd}
            >
              <StopCircle className="w-3 h-3 mr-1" />
              End call
            </Button>
          </>
        )}
        {isTerminal && (
          <>
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-7 gap-1.5"
              onClick={onRetry}
              disabled={isRetrying}
            >
              {isRetrying
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : <RotateCcw className="w-3 h-3" />}
              Retry bot
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="text-xs h-7 gap-1.5"
              onClick={onFallback}
            >
              <Mic className="w-3 h-3" />
              Use manual capture
            </Button>
          </>
        )}
        {status === "waiting_room" && (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs h-7 text-muted-foreground"
            onClick={onRetry}
            disabled={isRetrying}
          >
            {isRetrying
              ? <Loader2 className="w-3 h-3 animate-spin mr-1" />
              : <RefreshCw className="w-3 h-3 mr-1" />}
            Retry join
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── PasteMeetingInput ────────────────────────────────────────────────────────

function PasteMeetingInput({
  onJoin,
  isLoading,
  disabled,
}: {
  onJoin: (url: string) => void;
  isLoading: boolean;
  disabled: boolean;
}) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const platform = url ? detectPlatform(url) : null;

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && isValidMeetingUrl(text)) {
        setUrl(text);
        setError("");
      }
    } catch {
      // Clipboard access denied, user can type manually
    }
  };

  const handleJoin = () => {
    if (!url.trim()) {
      setError("Please paste a meeting URL");
      return;
    }
    if (!isValidMeetingUrl(url)) {
      setError("Please enter a valid Google Meet or Zoom URL");
      return;
    }
    setError("");
    onJoin(url.trim());
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
            <Link2 className="w-4 h-4 text-muted-foreground" />
            {platform && platform !== "unknown" && (
              <span className={cn(
                "text-[10px] font-bold px-1.5 py-0.5 rounded-full border",
                getPlatformColor(platform)
              )}>
                {getPlatformLabel(platform)}
              </span>
            )}
          </div>
          <Input
            value={url}
            onChange={(e) => { setUrl(e.target.value); setError(""); }}
            onKeyDown={(e) => e.key === "Enter" && handleJoin()}
            placeholder="Paste Google Meet or Zoom link…"
            className={cn(
              "pl-10 pr-4 font-mono text-sm",
              platform && platform !== "unknown" ? "pl-28" : "pl-10",
              error && "border-destructive"
            )}
            disabled={disabled || isLoading}
          />
        </div>
        <Button
          variant="outline"
          size="icon"
          className="shrink-0"
          onClick={handlePaste}
          title="Paste from clipboard"
          disabled={disabled || isLoading}
        >
          <Clipboard className="w-4 h-4" />
        </Button>
        <Button
          onClick={handleJoin}
          disabled={!url.trim() || isLoading || disabled}
          className="gap-2 shrink-0"
        >
          {isLoading
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <Bot className="w-4 h-4" />}
          {isLoading ? "Deploying…" : "Start Recording"}
        </Button>
      </div>
      {error && (
        <p className="text-xs text-destructive flex items-center gap-1.5">
          <AlertTriangle className="w-3 h-3" />
          {error}
        </p>
      )}
    </div>
  );
}

// ─── HowItWorksPanel ──────────────────────────────────────────────────────────

function HowItWorksPanel() {
  return (
    <div className="glass rounded-xl border border-border p-5 space-y-4">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
          <Bot className="w-3.5 h-3.5 text-primary" />
        </div>
        <h3 className="font-semibold text-sm">How AI Bot Recording Works</h3>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        {[
          {
            step: "01",
            icon: <Link2 className="w-4 h-4" />,
            title: "Paste your link",
            desc: "Works with Google Meet and Zoom. No downloads needed.",
            color: "text-blue-400",
            bg: "bg-blue-500/10 border-blue-500/20",
          },
          {
            step: "02",
            icon: <Bot className="w-4 h-4" />,
            title: "Bot joins automatically",
            desc: "\"Fixsense AI Recorder\" joins as a participant and begins recording.",
            color: "text-primary",
            bg: "bg-primary/10 border-primary/20",
          },
          {
            step: "03",
            icon: <Sparkles className="w-4 h-4" />,
            title: "AI analysis in real-time",
            desc: "Transcript, objections, sentiment score, and action items generated live.",
            color: "text-green-400",
            bg: "bg-green-500/10 border-green-500/20",
          },
        ].map((item) => (
          <div key={item.step} className={cn("rounded-lg border p-3 space-y-2", item.bg)}>
            <div className="flex items-center gap-2">
              <span className={cn("text-xs font-bold tabular-nums", item.color)}>{item.step}</span>
              <span className={item.color}>{item.icon}</span>
            </div>
            <p className="text-xs font-semibold text-foreground">{item.title}</p>
            <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
          </div>
        ))}
      </div>

      <div className="flex items-start gap-2 p-3 rounded-lg bg-secondary/40 border border-border/50">
        <Shield className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          The bot appears as <strong className="text-foreground">"Fixsense AI Recorder"</strong> in your participant list —
          fully visible to all attendees. Host may need to admit it from the waiting room on restricted meetings.
        </p>
      </div>
    </div>
  );
}

// ─── UpcomingMeetingCard ──────────────────────────────────────────────────────

function UpcomingMeetingCard({
  meeting,
  onStart,
  isStarting,
}: {
  meeting: UpcomingMeeting;
  onStart: (meeting: UpcomingMeeting) => void;
  isStarting: boolean;
}) {
  const startTime = new Date(meeting.scheduled_time);
  const endTime = addMinutes(startTime, meeting.duration_minutes);
  const isHappening = isPast(startTime) && isFuture(endTime);
  const isVeryClose = !isPast(startTime) &&
    startTime.getTime() - Date.now() < 10 * 60 * 1000;

  return (
    <div className={cn(
      "glass rounded-xl border p-4 transition-all hover:border-primary/20",
      isHappening
        ? "border-green-500/30 bg-green-500/5"
        : isVeryClose
        ? "border-primary/20 bg-primary/5"
        : "border-border",
    )}>
      <div className="flex items-start gap-4">
        <div className="shrink-0 w-14 text-center">
          <div className="text-sm font-bold font-mono">{format(startTime, "h:mm")}</div>
          <div className="text-xs text-muted-foreground">{format(startTime, "a")}</div>
          <div className="text-xs text-muted-foreground">{meeting.duration_minutes}m</div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div>
              <h3 className="font-medium text-sm truncate max-w-[260px]">{meeting.title}</h3>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className={cn(
                  "text-xs px-1.5 py-0.5 rounded-full border",
                  getPlatformColor(meeting.meeting_provider),
                )}>
                  {getPlatformLabel(meeting.meeting_provider)}
                </span>
                {meeting.participants.length > 0 && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    {meeting.participants.slice(0, 2).join(", ")}
                    {meeting.participants.length > 2 && ` +${meeting.participants.length - 2}`}
                  </span>
                )}
              </div>
            </div>

            <div className="shrink-0 flex items-center gap-2">
              {meeting.bot_dispatched ? (
                <div className="flex items-center gap-1.5 text-xs text-green-500 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                  {isHappening ? "Bot recording" : "Bot dispatched"}
                </div>
              ) : isHappening ? (
                <Button
                  size="sm"
                  onClick={() => onStart(meeting)}
                  disabled={isStarting}
                  className="gap-1.5 h-8 text-xs"
                >
                  {isStarting
                    ? <Loader2 className="w-3 h-3 animate-spin" />
                    : <Bot className="w-3 h-3" />}
                  Deploy bot
                </Button>
              ) : isVeryClose ? (
                <div className="flex items-center gap-1.5 text-xs text-primary font-medium">
                  <Clock className="w-3 h-3" />
                  Starting soon
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">
                  {formatDistanceToNow(startTime, { addSuffix: true })}
                </div>
              )}
            </div>
          </div>

          {meeting.meeting_url && (
            <a
              href={meeting.meeting_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors mt-2"
            >
              <ExternalLink className="w-3 h-3" />
              Open meeting
            </a>
          )}

          {meeting.call_id && (
            <Link
              to={`/dashboard/calls/${meeting.call_id}`}
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-2 ml-3"
            >
              View transcript <ChevronRight className="w-3 h-3" />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function LiveCall() {
  const navigate = useNavigate();
  const { team } = useTeam();
  const { setStatus } = useUserStatus(team?.id);
  const { usage } = useMeetingUsage();
  const { startCall, endCall, liveCall, callId } = useLiveCall();

  const {
    isConnected: calendarConnected,
    isLoading: calendarLoading,
    upcomingMeetings,
    connect: connectCalendar,
    disconnect: disconnectCalendar,
    syncNow,
    isSyncing,
    integration,
  } = useCalendar();

  const { session: botSession, isLoading: botLoading, deployBot, retryBot } = useBotSession(callId || null);

  const [currentUrl, setCurrentUrl] = useState("");
  const [isDeploying, setIsDeploying] = useState(false);
  const [showFallback, setShowFallback] = useState(false);
  const [showHowItWorks, setShowHowItWorks] = useState(false);

  const botStatus: BotStatus = botSession?.status || (callId ? "preparing" : "idle");

  // Determine if we have an active session
  const hasActiveSession = callId && ["preparing", "joining", "waiting_room", "in_call", "recording"].includes(botStatus);

  // Handle paste URL → deploy bot
  const handleJoinUrl = useCallback(async (url: string) => {
    if (usage?.isAtLimit) {
      toast.error("You've reached your monthly meeting limit. Upgrade to continue.");
      return;
    }

    setIsDeploying(true);
    setCurrentUrl(url);

    try {
      const platform = detectPlatform(url);

      // Create call record
      const call = await startCall.mutateAsync({
        platform: getPlatformLabel(platform),
        meeting_id: url,
        meeting_url: url,
        name: `${getPlatformLabel(platform)} Meeting`,
        participants: [],
      } as any);

      // Deploy bot
      await deployBot(url, platform, call.id);
      setStatus("on_call");

      toast.success("AI recorder deployed — joining your meeting now");
    } catch (err: any) {
      if (err?.message === "PLAN_LIMIT_REACHED") {
        toast.error("Meeting limit reached. Upgrade your plan to continue.");
      } else {
        toast.error("Failed to start recording: " + (err?.message || "Unknown error"));
      }
      setCurrentUrl("");
    } finally {
      setIsDeploying(false);
    }
  }, [startCall, deployBot, setStatus, usage]);

  // Handle calendar meeting → deploy bot
  const handleCalendarMeeting = useCallback(async (meeting: UpcomingMeeting) => {
    if (!meeting.meeting_url) return;
    await handleJoinUrl(meeting.meeting_url);
  }, [handleJoinUrl]);

  // Handle end call
  const handleEndCall = useCallback(async () => {
    try {
      await endCall.mutateAsync();
      setStatus("available");
      setCurrentUrl("");
      toast.success("Call ended — generating AI summary…");
      if (callId) navigate(`/dashboard/calls/${callId}`);
    } catch {
      toast.error("Failed to end call");
    }
  }, [endCall, callId, navigate, setStatus]);

  const activeStatusConfig = BOT_STATUS_CONFIG[botStatus];

  return (
    <DashboardLayout>
      <div className="space-y-6 pb-8 max-w-3xl mx-auto">

        {/* ── Header ── */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold font-display">Live Call</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Paste any meeting link — the AI bot joins and records automatically
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground gap-1.5"
              onClick={() => setShowHowItWorks(p => !p)}
            >
              <Info className="w-3.5 h-3.5" />
              How it works
            </Button>
            {calendarConnected && (
              <div className="flex items-center gap-1.5 text-xs text-green-500">
                <Wifi className="w-3.5 h-3.5" />
                Calendar synced
              </div>
            )}
          </div>
        </div>

        {/* ── How it works (collapsible) ── */}
        {showHowItWorks && <HowItWorksPanel />}

        {/* ── Meeting limit warning ── */}
        {usage && !usage.isUnlimited && usage.isAtLimit && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-destructive">Meeting limit reached</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                You've used all {usage.limit} meetings for this month.
              </p>
            </div>
            <Button size="sm" variant="destructive" onClick={() => navigate("/dashboard/billing")}>
              Upgrade
            </Button>
          </div>
        )}

        {/* ── MAIN: Paste URL input (if no active session) ── */}
        {!hasActiveSession && (
          <div className="glass rounded-2xl border border-border p-6 space-y-5">
            <div>
              <h2 className="font-semibold text-base mb-1">Start a New Recording</h2>
              <p className="text-xs text-muted-foreground">
                Paste your meeting link below. The AI bot will join within seconds.
              </p>
            </div>

            <PasteMeetingInput
              onJoin={handleJoinUrl}
              isLoading={isDeploying}
              disabled={!!hasActiveSession || (usage?.isAtLimit ?? false)}
            />

            <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1">
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-4 rounded-full bg-blue-500/20 flex items-center justify-center">
                  <span className="text-[8px] font-bold text-blue-400">G</span>
                </div>
                Google Meet
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-4 rounded-full bg-indigo-500/20 flex items-center justify-center">
                  <span className="text-[8px] font-bold text-indigo-400">Z</span>
                </div>
                Zoom
              </div>
              <div className="h-3 w-px bg-border mx-1" />
              <span className="text-muted-foreground/60">Teams support coming soon</span>
            </div>
          </div>
        )}

        {/* ── Bot status (when session is active) ── */}
        {hasActiveSession && (
          <BotStatusPanel
            status={botStatus}
            session={botSession}
            callId={callId || null}
            meetingUrl={currentUrl || liveCall?.meeting_url || ""}
            onRetry={retryBot}
            onFallback={() => setShowFallback(true)}
            onEnd={handleEndCall}
            isRetrying={botLoading}
          />
        )}

        {/* ── Fallback: Manual audio capture note ── */}
        {(showFallback || ["failed", "rejected", "timeout"].includes(botStatus)) && (
          <div className="glass rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Mic className="w-4 h-4 text-yellow-400" />
              <h3 className="font-semibold text-sm text-yellow-400">Manual Audio Capture Available</h3>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              The bot couldn't auto-join this meeting. You can still capture audio manually from your browser.
              This works on Chrome/Edge desktop by sharing your tab audio.
            </p>
            {callId && (
              <Link
                to={`/dashboard/live/${callId}`}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-yellow-400 hover:text-yellow-300 transition-colors"
              >
                <ArrowRight className="w-3 h-3" />
                Switch to manual capture mode
              </Link>
            )}
          </div>
        )}

        {/* ── Calendar integration ── */}
        {!calendarConnected && !hasActiveSession && (
          <div className="glass rounded-xl border border-primary/20 overflow-hidden">
            <div className="h-0.5 bg-gradient-to-r from-primary/60 via-primary to-primary/60" />
            <div className="p-5 flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                <Calendar className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-sm mb-1">Connect Google Calendar (Optional)</h3>
                <p className="text-xs text-muted-foreground leading-relaxed max-w-lg">
                  Auto-detect upcoming meetings and deploy the bot before they start — no link pasting needed.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 gap-1.5"
                onClick={connectCalendar}
              >
                <Calendar className="w-3.5 h-3.5" />
                Connect
              </Button>
            </div>
          </div>
        )}

        {/* ── Calendar: Upcoming meetings ── */}
        {calendarConnected && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Upcoming Meetings
              </h2>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 h-7 text-xs"
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
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
              </div>
            ) : upcomingMeetings.length === 0 ? (
              <div className="glass rounded-xl p-8 text-center border border-dashed border-border">
                <Calendar className="w-7 h-7 mx-auto mb-3 opacity-30" />
                <p className="text-sm text-muted-foreground">No upcoming meetings with video links</p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  Meetings with Google Meet or Zoom links appear here automatically
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {upcomingMeetings.slice(0, 6).map(m => (
                  <UpcomingMeetingCard
                    key={m.id}
                    meeting={m}
                    onStart={handleCalendarMeeting}
                    isStarting={isDeploying}
                  />
                ))}
              </div>
            )}

            <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                Google Calendar connected
                {integration?.updated_at && (
                  <span className="opacity-60">
                    · Synced {formatDistanceToNow(new Date(integration.updated_at), { addSuffix: true })}
                  </span>
                )}
              </div>
              <button
                onClick={() => disconnectCalendar()}
                className="text-muted-foreground hover:text-destructive transition-colors"
              >
                Disconnect
              </button>
            </div>
          </div>
        )}

        {/* ── Recent calls quick access ── */}
        {!hasActiveSession && (
          <div className="flex items-center justify-between pt-2 border-t border-border/50">
            <p className="text-xs text-muted-foreground">View past recordings and AI summaries</p>
            <Link
              to="/dashboard/calls"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              View all calls <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
