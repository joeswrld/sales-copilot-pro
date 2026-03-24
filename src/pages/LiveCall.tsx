/**
 * LiveCall.tsx — Fixed v7
 *
 * Key fixes vs v6:
 *  1. isValidMeetingUrl: strips zero-width/invisible chars, auto-prepends https://
 *  2. PasteMeetingInput.submit: normalises URL before validation and passing to onJoin
 *  3. pasteClipboard: strips invisible chars from clipboard text
 *  4. detectPlatform: also used on the normalised URL so badge + validation are consistent
 */

import DashboardLayout from "@/components/DashboardLayout";
import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  Bot, Loader2, ExternalLink, RefreshCw,
  CheckCircle2, Clock, ChevronRight,
  Link2, AlertTriangle, Mic,
  Radio, Shield, Eye, StopCircle,
  Clipboard, Info, X, RotateCcw,
  Calendar, Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

type BotStatus =
  | "idle"
  | "preparing"
  | "joining"
  | "waiting_room"
  | "in_call"
  | "recording"
  | "call_ended"
  | "failed"
  | "timeout"
  | "no_function";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Strip invisible / zero-width characters that mobile keyboards inject */
function sanitizeUrl(raw: string): string {
  return raw
    .trim()
    // zero-width space, zero-width non-joiner, zero-width joiner, BOM, etc.
    .replace(/[\u200B-\u200D\uFEFF\u00AD]/g, "")
    // any remaining non-printable ASCII except normal URL chars
    .replace(/[^\x20-\x7E]/g, "")
    .trim();
}

/** Ensure the URL has a protocol prefix so new URL() can parse it */
function normalizeUrl(raw: string): string {
  const s = sanitizeUrl(raw);
  if (!s) return "";
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}

function detectPlatform(url: string): "google_meet" | "zoom" | "teams" | "unknown" {
  if (/meet\.google\.com/i.test(url)) return "google_meet";
  if (/zoom\.(us|com)/i.test(url)) return "zoom";
  if (/teams\.microsoft\.com/i.test(url)) return "teams";
  return "unknown";
}

function getPlatformLabel(platform: string) {
  const m: Record<string, string> = {
    google_meet: "Google Meet",
    zoom: "Zoom",
    teams: "Microsoft Teams",
    unknown: "Video Call",
  };
  return m[platform] || "Video Call";
}

function isValidMeetingUrl(raw: string): boolean {
  const normalized = normalizeUrl(raw);
  if (!normalized) return false;
  try {
    new URL(normalized);
    return detectPlatform(normalized) !== "unknown";
  } catch {
    return false;
  }
}

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CFG: Record<BotStatus, {
  label: string;
  desc: string;
  color: string;
  bg: string;
  border: string;
  spin?: boolean;
  pulse?: boolean;
}> = {
  idle: {
    label: "", desc: "", color: "", bg: "", border: "",
  },
  preparing: {
    label: "Preparing AI Recorder",
    desc: "Connecting to the bot service — this takes about 5 seconds…",
    color: "text-primary",
    bg: "bg-primary/5",
    border: "border-primary/20",
    spin: true,
  },
  joining: {
    label: "Bot Joining Meeting",
    desc: "Fixsense AI Recorder is connecting to your meeting room…",
    color: "text-blue-400",
    bg: "bg-blue-500/5",
    border: "border-blue-500/20",
    spin: true,
  },
  waiting_room: {
    label: "Waiting for Host Approval",
    desc: 'Bot is in the waiting room. Ask your host to admit "Fixsense AI Recorder".',
    color: "text-yellow-400",
    bg: "bg-yellow-500/5",
    border: "border-yellow-500/20",
    pulse: true,
  },
  in_call: {
    label: "Bot In Meeting",
    desc: "Bot joined — starting to record…",
    color: "text-green-400",
    bg: "bg-green-500/5",
    border: "border-green-500/20",
    pulse: true,
  },
  recording: {
    label: "Recording & Transcribing",
    desc: "Both sides are being captured in real-time",
    color: "text-green-400",
    bg: "bg-green-500/5",
    border: "border-green-500/20",
    pulse: true,
  },
  call_ended: {
    label: "Generating AI Summary",
    desc: "Call ended — processing recording and transcript…",
    color: "text-primary",
    bg: "bg-primary/5",
    border: "border-primary/20",
    spin: true,
  },
  failed: {
    label: "Bot Could Not Join",
    desc: "This meeting may restrict external participants. Try manual audio capture instead.",
    color: "text-red-400",
    bg: "bg-red-500/5",
    border: "border-red-500/20",
  },
  timeout: {
    label: "Taking Too Long",
    desc: "The bot is taking longer than expected. It may still be joining in the background.",
    color: "text-yellow-400",
    bg: "bg-yellow-500/5",
    border: "border-yellow-500/20",
  },
  no_function: {
    label: "Bot Service Not Set Up",
    desc: "The recording bot hasn't been deployed yet. Use manual audio capture for now.",
    color: "text-orange-400",
    bg: "bg-orange-500/5",
    border: "border-orange-500/20",
  },
};

// ─── useBotDeploy hook ────────────────────────────────────────────────────────

function useBotDeploy() {
  const [status, setStatus] = useState<BotStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [activeCallId, setActiveCallId] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (channelRef.current) supabase.removeChannel(channelRef.current);
  }, []);

  const watchCallForBotStatus = useCallback((callId: string) => {
    if (channelRef.current) supabase.removeChannel(channelRef.current);
    channelRef.current = supabase
      .channel(`bot-watch-${callId}`)
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "calls",
        filter: `id=eq.${callId}`,
      }, (payload: any) => {
        const raw = payload.new?.recall_bot_status;
        if (!raw) return;
        const map: Record<string, BotStatus> = {
          joining: "joining",
          in_waiting_room: "waiting_room",
          in_call_not_recording: "in_call",
          "recording_permission.allowed": "recording",
          in_call_recording: "recording",
          recording: "recording",
          call_ended: "call_ended",
          done: "call_ended",
          failed: "failed",
          fatal: "failed",
          "recording_permission.denied": "failed",
        };
        const next = map[raw];
        if (next) {
          setStatus(next);
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
        }
      })
      .subscribe();
  }, []);

  const deploy = useCallback(async (meetingUrl: string, callId: string) => {
    setStatus("preparing");
    setError(null);
    setActiveCallId(callId);

    watchCallForBotStatus(callId);

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setStatus(prev => (prev === "preparing" || prev === "joining") ? "timeout" : prev);
    }, 12000);

    try {
      const { data, error: fnErr } = await supabase.functions.invoke("join-meeting-bot", {
        body: {
          call_id: callId,
          meeting_url: meetingUrl,
          platform: detectPlatform(meetingUrl),
          bot_name: "Fixsense AI Recorder",
        },
      });

      if (fnErr) {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        const msg = fnErr.message || "";
        if (msg.includes("404") || msg.includes("not found") || msg.includes("FunctionsHttpError")) {
          setStatus("no_function");
        } else {
          setStatus("failed");
          setError(msg);
        }
        return;
      }

      if (data?.error && !data?.success) {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        setStatus("failed");
        setError(data.error);
        return;
      }

      setStatus("joining");

    } catch (err: any) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setStatus("failed");
      setError(err?.message || "Unexpected error");
    }
  }, [watchCallForBotStatus]);

  const retry = useCallback(async (meetingUrl: string, callId: string) => {
    setStatus("joining");
    setError(null);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setStatus(prev => prev === "joining" ? "timeout" : prev);
    }, 20000);
    try {
      await supabase.functions.invoke("join-meeting-bot", {
        body: {
          call_id: callId,
          meeting_url: meetingUrl,
          platform: detectPlatform(meetingUrl),
          bot_name: "Fixsense AI Recorder",
          retry: true,
        },
      });
    } catch (err: any) {
      setStatus("failed");
      setError(err?.message);
    }
  }, []);

  const reset = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (channelRef.current) supabase.removeChannel(channelRef.current);
    setStatus("idle");
    setError(null);
    setActiveCallId(null);
  }, []);

  return { status, error, activeCallId, deploy, retry, reset };
}

// ─── BotStatusCard ────────────────────────────────────────────────────────────

function BotStatusCard({
  status, error, meetingUrl, callId,
  onRetry, onFallback, onEnd, onReset, isEndingCall,
}: {
  status: BotStatus; error: string | null; meetingUrl: string;
  callId: string | null; onRetry: () => void; onFallback: () => void;
  onEnd: () => void; onReset: () => void; isEndingCall: boolean;
}) {
  if (status === "idle") return null;
  const cfg = STATUS_CFG[status];
  const isTerminal = ["failed", "timeout", "no_function"].includes(status);
  const isActive = ["in_call", "recording", "waiting_room"].includes(status);
  const isLive = status === "recording";

  return (
    <div className={cn("rounded-2xl border p-5 space-y-4 transition-all duration-300", cfg.bg, cfg.border)}>
      <div className="flex items-start gap-3">
        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border", cfg.bg, cfg.border)}>
          {cfg.spin && <Loader2 className={cn("w-4 h-4 animate-spin", cfg.color)} />}
          {cfg.pulse && !cfg.spin && (
            <span className={cn(
              "w-2.5 h-2.5 rounded-full animate-pulse",
              isLive ? "bg-green-400" : status === "waiting_room" ? "bg-yellow-400" : "bg-blue-400"
            )} />
          )}
          {!cfg.spin && !cfg.pulse && (
            <AlertTriangle className={cn("w-4 h-4", cfg.color)} />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className={cn("font-semibold text-sm", cfg.color)}>{cfg.label}</span>
            {isLive && (
              <span className="text-[10px] font-bold tracking-wide text-green-400 bg-green-500/15 border border-green-500/25 rounded-full px-2 py-0.5">
                ● LIVE
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">{cfg.desc}</p>
          {error && (
            <p className="mt-2 text-xs text-red-400 bg-red-500/10 rounded-lg px-2.5 py-1.5">{error}</p>
          )}
        </div>
      </div>

      {status === "waiting_room" && (
        <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-3.5">
          <p className="text-xs font-semibold text-yellow-400 mb-1.5 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5" /> Action needed
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed mb-2">
            In your meeting, find <strong className="text-yellow-300">"Fixsense AI Recorder"</strong> in
            the waiting room and tap <strong className="text-yellow-300">Admit</strong>.
          </p>
          {meetingUrl && (
            <a href={meetingUrl} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-yellow-400 hover:text-yellow-300 font-medium">
              <ExternalLink className="w-3 h-3" /> Open meeting to admit bot
            </a>
          )}
        </div>
      )}

      {isActive && status !== "waiting_room" && (
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs text-green-400 bg-green-500/10 border border-green-500/20 rounded-full px-3 py-1">
            <Radio className="w-3 h-3" /> Both sides captured
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs text-primary bg-primary/10 border border-primary/20 rounded-full px-3 py-1">
            <Sparkles className="w-3 h-3" /> AI analysis running
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground bg-secondary/60 border border-border rounded-full px-3 py-1">
            <Shield className="w-3 h-3" /> Visible to all participants
          </span>
        </div>
      )}

      {status === "no_function" && (
        <div className="rounded-xl bg-secondary/40 border border-border p-3.5 text-xs space-y-2">
          <p className="font-semibold text-foreground">Deploy the edge function to enable the bot:</p>
          <code className="block bg-black/30 rounded-lg p-2.5 font-mono leading-relaxed text-muted-foreground">
            supabase functions deploy join-meeting-bot<br />
            supabase secrets set RECALL_AI_API_KEY=your_key
          </code>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {isActive && (
          <>
            {callId && (
              <Link to={`/dashboard/live/${callId}`}
                className="inline-flex items-center gap-1.5 text-xs font-semibold border border-primary/30 bg-primary/10 text-primary rounded-lg px-3 py-2 hover:bg-primary/20 transition-colors">
                <Eye className="w-3.5 h-3.5" /> View live transcript
              </Link>
            )}
            {meetingUrl && (
              <a href={meetingUrl} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs border border-border/60 bg-secondary/40 text-muted-foreground rounded-lg px-3 py-2 hover:bg-secondary/70 transition-colors">
                <ExternalLink className="w-3.5 h-3.5" /> Open meeting
              </a>
            )}
            <Button variant="destructive" size="sm" className="h-8 text-xs" onClick={onEnd} disabled={isEndingCall}>
              {isEndingCall ? <Loader2 className="w-3 h-3 animate-spin mr-1.5" /> : <StopCircle className="w-3 h-3 mr-1.5" />}
              End call
            </Button>
          </>
        )}
        {isTerminal && (
          <>
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={onRetry}>
              <RotateCcw className="w-3 h-3" /> Retry
            </Button>
            <Button size="sm" variant="secondary" className="h-8 text-xs gap-1.5" onClick={onFallback}>
              <Mic className="w-3 h-3" /> Use mic instead
            </Button>
            <Button size="sm" variant="ghost" className="h-8 text-xs text-muted-foreground" onClick={onReset}>
              <X className="w-3 h-3 mr-1" /> Start over
            </Button>
          </>
        )}
        {status === "timeout" && !isTerminal && (
          <>
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={onRetry}>
              <RefreshCw className="w-3 h-3" /> Retry
            </Button>
            {callId && (
              <Link to={`/dashboard/live/${callId}`}
                className="inline-flex items-center gap-1.5 text-xs border border-border bg-secondary/40 text-muted-foreground rounded-lg px-3 py-2">
                <Eye className="w-3 h-3" /> Check live view
              </Link>
            )}
            <Button size="sm" variant="ghost" className="h-8 text-xs text-muted-foreground" onClick={onReset}>
              <X className="w-3 h-3 mr-1" /> Cancel
            </Button>
          </>
        )}
        {status === "waiting_room" && (
          <Button size="sm" variant="ghost" className="h-8 text-xs text-muted-foreground gap-1.5" onClick={onRetry}>
            <RefreshCw className="w-3 h-3" /> Retry join
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── PasteMeetingInput ────────────────────────────────────────────────────────

function PasteMeetingInput({ onJoin, isLoading, disabled }: {
  onJoin: (url: string) => void; isLoading: boolean; disabled: boolean;
}) {
  const [url, setUrl] = useState("");
  const [err, setErr] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Derive platform from the normalised URL so badge matches validation
  const normalized = normalizeUrl(url);
  const platform = normalized ? detectPlatform(normalized) : null;

  const platformBadge: Record<string, string> = {
    google_meet: "text-blue-400 bg-blue-500/15 border-blue-500/25",
    zoom: "text-indigo-400 bg-indigo-500/15 border-indigo-500/25",
    teams: "text-purple-400 bg-purple-500/15 border-purple-500/25",
  };

  const pasteClipboard = async () => {
    try {
      const raw = await navigator.clipboard.readText();
      const cleaned = sanitizeUrl(raw);
      if (cleaned) { setUrl(cleaned); setErr(""); }
    } catch {
      inputRef.current?.focus();
    }
  };

  const submit = () => {
    const cleaned = sanitizeUrl(url);
    if (!cleaned) { setErr("Paste a meeting URL to continue"); return; }

    const norm = normalizeUrl(cleaned);
    if (!isValidMeetingUrl(cleaned)) {
      setErr("Only Google Meet and Zoom links are supported");
      return;
    }
    setErr("");
    onJoin(norm); // always pass the normalised (https://) URL
  };

  return (
    <div className="space-y-2.5">
      <div className="flex gap-2">
        <div className="relative flex-1">
          {platform && platform !== "unknown" && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10 pointer-events-none">
              <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-full border", platformBadge[platform])}>
                {getPlatformLabel(platform)}
              </span>
            </div>
          )}
          <Input
            ref={inputRef}
            value={url}
            onChange={e => { setUrl(e.target.value); setErr(""); }}
            onKeyDown={e => e.key === "Enter" && !isLoading && submit()}
            placeholder="https://meet.google.com/abc-def-ghi"
            className={cn(
              "h-11 text-sm font-mono",
              platform && platform !== "unknown" ? "pl-28" : "pl-4",
              err && "border-destructive"
            )}
            disabled={disabled || isLoading}
          />
        </div>
        <Button variant="outline" size="icon" className="shrink-0 h-11 w-11" onClick={pasteClipboard}
          title="Paste from clipboard" disabled={disabled || isLoading}>
          <Clipboard className="w-4 h-4" />
        </Button>
        <Button onClick={submit} disabled={!url.trim() || isLoading || disabled}
          className="h-11 gap-2 px-5 font-semibold shrink-0">
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />}
          {isLoading ? "Starting…" : "Start Recording"}
        </Button>
      </div>
      {err && (
        <p className="text-xs text-destructive flex items-center gap-1.5 pl-1">
          <AlertTriangle className="w-3 h-3" /> {err}
        </p>
      )}
      <div className="flex gap-4 text-xs text-muted-foreground pl-1">
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500/60" />Google Meet</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-indigo-500/60" />Zoom</span>
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
  const { startCall, endCall, callId } = useLiveCall();
  const { status: botStatus, error: botError, activeCallId, deploy, retry, reset } = useBotDeploy();

  const {
    isConnected: calendarConnected, isLoading: calendarLoading,
    upcomingMeetings, connect: connectCalendar,
    disconnect: disconnectCalendar, syncNow, isSyncing,
  } = useCalendar();

  const [currentUrl, setCurrentUrl] = useState("");
  const [isStarting, setIsStarting] = useState(false);
  const [showFallback, setShowFallback] = useState(false);

  const effectiveCallId = activeCallId || callId;
  const hasActiveSession = botStatus !== "idle";

  useEffect(() => {
    if (["failed", "timeout", "no_function"].includes(botStatus)) {
      setShowFallback(true);
    }
  }, [botStatus]);

  const handleJoin = useCallback(async (url: string) => {
    if (usage?.isAtLimit) {
      toast.error("Monthly meeting limit reached. Please upgrade to continue.");
      return;
    }
    setIsStarting(true);
    setCurrentUrl(url);
    setShowFallback(false);
    try {
      const call = await startCall.mutateAsync({
        platform: getPlatformLabel(detectPlatform(url)),
        meeting_id: url,
        meeting_url: url,
        name: `${getPlatformLabel(detectPlatform(url))} Meeting`,
        participants: [],
      } as any);
      await deploy(url, call.id);
      setStatus("on_call");
    } catch (err: any) {
      const msg = err?.message || "";
      toast.error(msg === "PLAN_LIMIT_REACHED" ? "Meeting limit reached. Upgrade to continue." : `Error: ${msg}`);
      reset();
      setCurrentUrl("");
    } finally {
      setIsStarting(false);
    }
  }, [startCall, deploy, setStatus, usage, reset]);

  const handleEndCall = useCallback(async () => {
    try {
      await endCall.mutateAsync();
      setStatus("available");
      reset();
      setCurrentUrl("");
      toast.success("Call ended — generating AI summary…");
      if (effectiveCallId) navigate(`/dashboard/calls/${effectiveCallId}`);
    } catch {
      toast.error("Failed to end call. Please try again.");
    }
  }, [endCall, setStatus, reset, navigate, effectiveCallId]);

  const handleRetry = useCallback(() => {
    if (currentUrl && effectiveCallId) retry(currentUrl, effectiveCallId);
  }, [currentUrl, effectiveCallId, retry]);

  const handleReset = useCallback(() => {
    reset();
    setCurrentUrl("");
    setShowFallback(false);
  }, [reset]);

  return (
    <DashboardLayout>
      <div className="space-y-5 pb-8 max-w-2xl mx-auto">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold font-display">Live Call</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Paste any meeting link — the AI bot joins and records automatically
          </p>
        </div>

        {/* Limit warning */}
        {usage && !usage.isUnlimited && usage.isAtLimit && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 flex items-center gap-3">
            <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
            <p className="text-sm flex-1 text-destructive font-medium">
              Monthly limit reached ({usage.used}/{usage.limit} meetings)
            </p>
            <Button size="sm" variant="destructive" onClick={() => navigate("/dashboard/billing")}>Upgrade</Button>
          </div>
        )}

        {/* Paste input — hidden when bot is active */}
        {!hasActiveSession && (
          <div className="glass rounded-2xl border border-border p-5 space-y-4">
            <div>
              <h2 className="font-semibold text-sm">Start Recording</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Paste your meeting link to deploy the AI recorder</p>
            </div>
            <PasteMeetingInput
              onJoin={handleJoin}
              isLoading={isStarting}
              disabled={usage?.isAtLimit ?? false}
            />
          </div>
        )}

        {/* Bot status */}
        <BotStatusCard
          status={botStatus}
          error={botError}
          meetingUrl={currentUrl}
          callId={effectiveCallId || null}
          onRetry={handleRetry}
          onFallback={() => setShowFallback(true)}
          onEnd={handleEndCall}
          onReset={handleReset}
          isEndingCall={endCall.isPending}
        />

        {/* Manual fallback */}
        {showFallback && (
          <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Mic className="w-4 h-4 text-yellow-400" />
              <h3 className="text-sm font-semibold text-yellow-400">Manual Audio Capture</h3>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Share your browser tab audio in Chrome/Edge to capture the meeting.
              Works for your microphone at minimum.
            </p>
            {effectiveCallId && (
              <Link to={`/dashboard/live/${effectiveCallId}`}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-yellow-400 hover:text-yellow-300">
                <Mic className="w-3 h-3" /> Switch to manual capture →
              </Link>
            )}
          </div>
        )}

        {/* Calendar section */}
        {!calendarConnected && !hasActiveSession && (
          <div className="glass rounded-xl border border-border p-4 flex items-center gap-4">
            <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
              <Calendar className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">Connect Google Calendar</p>
              <p className="text-xs text-muted-foreground mt-0.5">Auto-detect meetings — no link pasting needed</p>
            </div>
            <Button size="sm" variant="outline" onClick={connectCalendar} className="shrink-0">Connect</Button>
          </div>
        )}

        {calendarConnected && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Upcoming Meetings</h2>
              <Button variant="ghost" size="sm" className="gap-1.5 h-7 text-xs" onClick={syncNow} disabled={isSyncing}>
                {isSyncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                Sync
              </Button>
            </div>
            {calendarLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : upcomingMeetings.length === 0 ? (
              <div className="glass rounded-xl p-8 text-center border border-dashed border-border">
                <Calendar className="w-7 h-7 mx-auto mb-2 opacity-20" />
                <p className="text-sm text-muted-foreground">No upcoming meetings with video links</p>
              </div>
            ) : (
              <div className="space-y-2">
                {upcomingMeetings.slice(0, 5).map(m => {
                  const startTime = new Date(m.scheduled_time);
                  const endTime = addMinutes(startTime, m.duration_minutes);
                  const isNow = isPast(startTime) && isFuture(endTime);
                  return (
                    <div key={m.id} className={cn(
                      "glass rounded-xl border p-4 flex items-center gap-3",
                      isNow ? "border-green-500/30 bg-green-500/5" : "border-border"
                    )}>
                      <div className="text-center w-12 shrink-0">
                        <p className="text-sm font-bold font-mono">{format(startTime, "h:mm")}</p>
                        <p className="text-[10px] text-muted-foreground">{format(startTime, "a")}</p>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{m.title}</p>
                        <p className="text-xs text-muted-foreground">{getPlatformLabel(m.meeting_provider)}</p>
                      </div>
                      {isNow && m.meeting_url && !m.bot_dispatched && (
                        <Button size="sm" className="h-8 text-xs gap-1 shrink-0"
                          onClick={() => m.meeting_url && handleJoin(m.meeting_url)} disabled={isStarting}>
                          {isStarting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Bot className="w-3 h-3" />}
                          Record
                        </Button>
                      )}
                      {m.bot_dispatched && (
                        <span className="flex items-center gap-1 text-xs text-green-500 shrink-0">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                          Live
                        </span>
                      )}
                      {!isNow && (
                        <span className="text-xs text-muted-foreground shrink-0">
                          {formatDistanceToNow(startTime, { addSuffix: true })}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3 h-3 text-green-500" /> Calendar synced
              </div>
              <button onClick={() => disconnectCalendar()} className="hover:text-destructive transition-colors">
                Disconnect
              </button>
            </div>
          </div>
        )}

        {!hasActiveSession && (
          <div className="flex items-center justify-between pt-2 border-t border-border/40 text-xs">
            <span className="text-muted-foreground">View past recordings and summaries</span>
            <Link to="/dashboard/calls" className="text-primary hover:underline flex items-center gap-1">
              All calls <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
