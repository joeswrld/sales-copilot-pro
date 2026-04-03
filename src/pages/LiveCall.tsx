/**
 * LiveCall.tsx — v8
 *
 * What's new vs v7:
 *  - "Create Meeting" button creates a native Daily.co room via create-daily-room
 *    edge function. No need for the user to paste any link.
 *  - "Copy Link" panel appears after creation so the host can share with prospects.
 *  - Daily.co host frame embedded inside the page when meeting is created natively.
 *  - "Paste URL" flow unchanged for Google Meet / Zoom / Teams / any HTTPS link.
 *  - Bot dispatch and AI transcription both still work for external platforms.
 *  - useDailyRoom() hook does all Daily.co API communication.
 *
 * Backwards-compatible: all existing hooks (useLiveCall, useCalendar, etc.) untouched.
 */

import DashboardLayout from "@/components/DashboardLayout";
import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  Bot, Loader2, ExternalLink, RefreshCw, CheckCircle2,
  Clock, ChevronRight, Link2, AlertTriangle,
  Radio, Shield, Eye, StopCircle, Clipboard,
  Info, X, Calendar, Sparkles, Wifi,
  Users, VideoIcon, Copy, Check, Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input }  from "@/components/ui/input";
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
import { cn }              from "@/lib/utils";
import { useCalendar, type UpcomingMeeting } from "@/hooks/useCalendar";
import { useLiveCall }     from "@/hooks/useLiveCall";
import { useMeetingUsage } from "@/hooks/useMeetingUsage";
import { useTeam }         from "@/hooks/useTeam";
import { useUserStatus }   from "@/hooks/useUserStatus";
import { useDailyRoom }    from "@/hooks/useDailyRoom";
import { supabase }        from "@/integrations/supabase/client";
import { toast }           from "sonner";
import {
  formatDistanceToNow, format, isPast, isFuture, addMinutes,
} from "date-fns";

// ─── Platform helpers ─────────────────────────────────────────────────────────

function detectPlatform(url: string): "google_meet" | "zoom" | "teams" | "daily" | "unknown" {
  if (/meet\.google\.com/i.test(url))       return "google_meet";
  if (/zoom\.(us|com)/i.test(url))          return "zoom";
  if (/teams\.microsoft\.com/i.test(url))   return "teams";
  if (/daily\.co/i.test(url))               return "daily";
  return "unknown";
}

const PLATFORM_LABELS: Record<string, string> = {
  google_meet: "Google Meet",
  zoom:        "Zoom",
  teams:       "Microsoft Teams",
  daily:       "Daily.co",
  unknown:     "Video Call",
};

const PLATFORM_COLORS: Record<string, string> = {
  google_meet: "text-blue-400 bg-blue-500/15 border-blue-500/25",
  zoom:        "text-indigo-400 bg-indigo-500/15 border-indigo-500/25",
  teams:       "text-purple-400 bg-purple-500/15 border-purple-500/25",
  daily:       "text-primary bg-primary/15 border-primary/25",
};

function normalizeMeetingUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "";
  if (!/^https?:\/\//i.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}

function isValidMeetingUrl(url: string): boolean {
  const normalized = normalizeMeetingUrl(url);
  if (!normalized) return false;
  try {
    const parsed = new URL(normalized);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch { return false; }
}

// ─── Bot phase hook ───────────────────────────────────────────────────────────

type BotPhase =
  | "idle" | "starting" | "joining" | "waiting_room"
  | "recording" | "ended" | "bot_failed";

function useBotPhase(callId: string | null | undefined) {
  const [phase, setPhase] = useState<BotPhase>("idle");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!callId) { setPhase("idle"); return; }

    supabase
      .from("calls")
      .select("recall_bot_status, status")
      .eq("id", callId)
      .single()
      .then(({ data }: any) => {
        if (!data) return;
        mapRecallStatus(data.recall_bot_status || "none");
      });

    const channel = supabase
      .channel(`call-bot-${callId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "calls", filter: `id=eq.${callId}` },
        (payload: any) => {
          mapRecallStatus(payload.new?.recall_bot_status || "none");
        }
      )
      .subscribe();

    // 30s timeout: if still joining → show manual capture
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setPhase(prev => prev === "joining" ? "bot_failed" : prev);
    }, 30_000);

    return () => {
      supabase.removeChannel(channel);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [callId]);

  function mapRecallStatus(rs: string) {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    const map: Record<string, BotPhase> = {
      joining:                        "joining",
      joining_call:                   "joining",
      in_waiting_room:                "waiting_room",
      in_call_not_recording:          "joining",
      "recording_permission.allowed": "recording",
      in_call_recording:              "recording",
      recording:                      "recording",
      call_ended:                     "ended",
      done:                           "ended",
      failed:                         "bot_failed",
      fatal:                          "bot_failed",
      "recording_permission.denied":  "bot_failed",
      recording_permission_denied:    "bot_failed",
      none:                           "joining",
    };
    setPhase(map[rs] ?? "joining");
  }

  return { phase, setPhase };
}

// ─── Paste URL input ──────────────────────────────────────────────────────────

function MeetingUrlInput({
  onStart, isLoading, disabled,
}: { onStart: (url: string) => void; isLoading: boolean; disabled: boolean }) {
  const [url, setUrl] = useState("");
  const [err, setErr] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const detected = url.trim() ? detectPlatform(url.trim()) : null;

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) { setUrl(text.trim()); setErr(""); }
    } catch { inputRef.current?.focus(); }
  };

  const handleSubmit = () => {
    const v = url.trim();
    if (!v) { setErr("Paste a meeting link to get started"); return; }
    if (!isValidMeetingUrl(v)) {
      setErr("Please enter a valid meeting link (e.g. meet.google.com/abc-defg-hij)");
      return;
    }
    setErr("");
    onStart(normalizeMeetingUrl(v));
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          {detected && detected !== "unknown" && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10 pointer-events-none">
              <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border", PLATFORM_COLORS[detected])}>
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
        <Button variant="outline" size="icon" className="h-12 w-12 shrink-0"
          onClick={handlePaste} disabled={isLoading || disabled} title="Paste from clipboard">
          <Clipboard className="w-4 h-4" />
        </Button>
        <Button className="h-12 px-6 gap-2 font-semibold shrink-0"
          onClick={handleSubmit} disabled={!url.trim() || isLoading || disabled}>
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />}
          {isLoading ? "Starting…" : "Start Recording"}
        </Button>
      </div>
      {err && (
        <p className="text-xs text-destructive flex items-center gap-1.5">
          <AlertTriangle className="w-3 h-3 shrink-0" /> {err}
        </p>
      )}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-400/60" />Google Meet</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-indigo-400/60" />Zoom</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-purple-400/60" />Teams</span>
        <span className="text-muted-foreground/40 text-[10px]">+ any video link</span>
      </div>
    </div>
  );
}

// ─── Share link panel (shown after creating a native room) ────────────────────

function ShareLinkPanel({
  shareLink, roomUrl, onJoinAsHost,
}: { shareLink: string; roomUrl: string; onJoinAsHost: () => void }) {
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
      toast.success("Link copied!");
    } catch {
      toast.info(`Link: ${shareLink}`, { duration: 10_000 });
    }
  };

  return (
    <div className="glass rounded-2xl border border-primary/25 bg-primary/5 p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0">
          <CheckCircle2 className="w-5 h-5 text-primary" />
        </div>
        <div>
          <p className="font-semibold text-sm text-primary">Meeting room created!</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Share this link with your prospect. No login needed for them.
          </p>
        </div>
      </div>

      {/* Share link row */}
      <div className="flex items-center gap-2 bg-background/60 border border-border rounded-xl p-3">
        <Link2 className="w-4 h-4 text-muted-foreground shrink-0" />
        <span className="text-xs text-foreground flex-1 truncate font-mono">{shareLink}</span>
        <button
          onClick={copyLink}
          className={cn(
            "flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all shrink-0",
            copied ? "bg-green-500/15 text-green-400 border border-green-500/25"
                   : "bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20"
          )}
        >
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>

      {/* Actions */}
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
      </div>

      <p className="text-xs text-muted-foreground/60 flex items-center gap-1.5">
        <Shield className="w-3 h-3" />
        Room expires in 3 hours · AI analysis active during the call
      </p>
    </div>
  );
}

// ─── Active session status card (for external platforms via bot) ──────────────

function ActiveSessionCard({
  phase, callId, meetingUrl, onEnd, isEnding,
}: { phase: BotPhase; callId: string; meetingUrl: string; onEnd: () => void; isEnding: boolean }) {
  const isLive    = phase === "recording";
  const isWaiting = phase === "waiting_room";
  const isJoining = phase === "joining" || phase === "starting";
  const isFailed  = phase === "bot_failed";

  const cardStyle = isFailed ? "border-destructive/20 bg-destructive/5"
    : isLive    ? "border-green-500/25 bg-green-500/5"
    : isWaiting ? "border-yellow-500/20 bg-yellow-500/5"
    : "border-primary/20 bg-primary/5";

  return (
    <div className={cn("rounded-2xl border p-5 space-y-4 transition-all duration-300", cardStyle)}>
      <div className="flex items-start gap-3">
        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border", cardStyle)}>
          {isJoining && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
          {isWaiting && <Clock className="w-4 h-4 text-yellow-400 animate-pulse" />}
          {isLive && <span className="w-3 h-3 rounded-full bg-green-400 animate-pulse" />}
          {isFailed && <AlertTriangle className="w-4 h-4 text-destructive" />}
          {phase === "ended" && <CheckCircle2 className="w-4 h-4 text-primary" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <span className={cn(
              "font-semibold text-sm",
              isFailed ? "text-destructive" : isLive ? "text-green-400" : isWaiting ? "text-yellow-400" : "text-primary"
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
          <p className="text-xs text-muted-foreground leading-relaxed">
            {isJoining && "Fixsense AI Recorder is connecting to your meeting room…"}
            {isWaiting && 'Bot is in the waiting room. Ask your host to admit "Fixsense AI Recorder".'}
            {isLive && "Both sides of the conversation are captured in real-time."}
            {isFailed && "Bot could not join. Ensure external participants are allowed and try again."}
            {phase === "ended" && "Generating AI summary, transcript, and action items…"}
          </p>
        </div>
      </div>

      {isWaiting && (
        <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/8 p-3.5 space-y-2">
          <p className="text-xs font-semibold text-yellow-400 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5" />Action needed from your host
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Look for <strong className="text-yellow-300">"Fixsense AI Recorder"</strong> in your
            meeting's waiting room and click <strong className="text-yellow-300">Admit</strong>.
          </p>
          {meetingUrl && (
            <a href={meetingUrl} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-yellow-400 hover:text-yellow-300 font-medium">
              <ExternalLink className="w-3 h-3" /> Open meeting to admit bot
            </a>
          )}
        </div>
      )}

      {isLive && (
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs text-green-400 bg-green-500/10 border border-green-500/20 rounded-full px-3 py-1">
            <Radio className="w-3 h-3" />Both sides captured
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs text-primary bg-primary/10 border border-primary/20 rounded-full px-3 py-1">
            <Sparkles className="w-3 h-3" />AI analysis running
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground bg-secondary/60 border border-border rounded-full px-3 py-1">
            <Shield className="w-3 h-3" />Bot visible to all
          </span>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {(isLive || isJoining || isWaiting) && (
          <Link to={`/dashboard/live/${callId}`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold border border-primary/30 bg-primary/10 text-primary rounded-lg px-3 py-2 hover:bg-primary/20 transition-colors">
            <Eye className="w-3.5 h-3.5" />View live transcript
          </Link>
        )}
        {meetingUrl && !isFailed && (
          <a href={meetingUrl} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs border border-border/60 bg-secondary/40 text-muted-foreground rounded-lg px-3 py-2 hover:bg-secondary/70 hover:text-foreground transition-colors">
            <ExternalLink className="w-3.5 h-3.5" />Open meeting
          </a>
        )}
        {!isFailed && phase !== "ended" && (
          <Button variant="destructive" size="sm" className="h-8 px-3 text-xs gap-1.5" onClick={onEnd} disabled={isEnding}>
            {isEnding ? <Loader2 className="w-3 h-3 animate-spin" /> : <StopCircle className="w-3 h-3" />}
            End call
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Recording consent dialog ─────────────────────────────────────────────────

function RecordingConsentDialog({
  open, onConfirm, onCancel, meetingUrl,
}: { open: boolean; onConfirm: () => void; onCancel: () => void; meetingUrl: string }) {
  const [agreed, setAgreed] = useState(false);
  const platform = meetingUrl ? detectPlatform(meetingUrl) : "unknown";

  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
              <VideoIcon className="w-5 h-5 text-primary" />
            </div>
            <AlertDialogTitle className="text-lg">Recording Consent</AlertDialogTitle>
          </div>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>
                You're about to deploy the <strong className="text-foreground">Fixsense AI Recorder</strong> bot
                to your {PLATFORM_LABELS[platform] || "video"} meeting.
              </p>
              <div className="rounded-lg border border-border bg-secondary/30 p-3 space-y-2 text-xs">
                <p className="font-semibold text-foreground">What will happen:</p>
                <ul className="space-y-1.5 ml-4 list-disc">
                  <li>A bot named <strong className="text-foreground">"Fixsense AI Recorder"</strong> will join the meeting</li>
                  <li>All participants will see the bot as an attendee</li>
                  <li>Audio and video will be captured for AI analysis</li>
                  <li>The host may need to admit the bot from the waiting room</li>
                </ul>
              </div>
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs">
                <p className="font-semibold text-primary flex items-center gap-1.5 mb-1">
                  <Shield className="w-3.5 h-3.5" />Your responsibility
                </p>
                <p>By proceeding, you confirm that all meeting participants are aware this session will be recorded.</p>
              </div>
              <label className="flex items-start gap-2.5 pt-1 cursor-pointer select-none">
                <Checkbox checked={agreed} onCheckedChange={(v) => setAgreed(v === true)} className="mt-0.5" />
                <span className="text-xs leading-relaxed">
                  I confirm that all participants have been informed this meeting will be recorded and analyzed by AI.
                </span>
              </label>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={!agreed} className="gap-1.5">
            <Bot className="w-4 h-4" />Start Recording
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ─── Upcoming meeting row ─────────────────────────────────────────────────────

function UpcomingMeetingRow({
  meeting, onRecord, isRecording,
}: { meeting: UpcomingMeeting; onRecord: (url: string) => void; isRecording: boolean }) {
  const start  = new Date(meeting.scheduled_time);
  const end    = addMinutes(start, meeting.duration_minutes);
  const isNow  = isPast(start) && isFuture(end);
  const isSoon = !isPast(start) && start.getTime() - Date.now() < 10 * 60 * 1000;

  return (
    <div className={cn(
      "glass rounded-xl border p-4 flex items-center gap-3 transition-all",
      isNow ? "border-green-500/25 bg-green-500/5" : isSoon ? "border-primary/20 bg-primary/5" : "border-border"
    )}>
      <div className="text-center w-12 shrink-0">
        <p className="text-sm font-bold font-mono">{format(start, "h:mm")}</p>
        <p className="text-[10px] text-muted-foreground uppercase">{format(start, "a")}</p>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{meeting.title}</p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded-full border",
            PLATFORM_COLORS[meeting.meeting_provider] || "text-muted-foreground bg-secondary border-border")}>
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
      <div className="shrink-0">
        {meeting.bot_dispatched ? (
          <span className="flex items-center gap-1.5 text-xs text-green-500 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />Live
          </span>
        ) : isNow && meeting.meeting_url ? (
          <Button size="sm" className="h-8 text-xs gap-1" onClick={() => onRecord(meeting.meeting_url!)} disabled={isRecording}>
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
    onCallEnded:   () => setStatus("available"),
  });

  const { phase, setPhase } = useBotPhase(callId);

  const {
    isConnected: calendarConnected,
    isLoading:   calendarLoading,
    upcomingMeetings,
    connect:     connectCalendar,
    disconnect:  disconnectCalendar,
    syncNow,
    isSyncing,
  } = useCalendar();

  const { createRoom, isCreating, roomInfo, copyShareLink } = useDailyRoom();

  const [meetingUrl, setMeetingUrl] = useState("");
  const [isStarting, setIsStarting] = useState(false);
  const [consentUrl, setConsentUrl] = useState<string | null>(null);

  // Daily.co host iframe ref (embedded view)
  const dailyHostRef  = useRef<HTMLDivElement>(null);
  const dailyFrameRef = useRef<any>(null);
  const [hostJoined, setHostJoined] = useState(false);

  // Restore live call state on mount
  useEffect(() => {
    if (isLive && callId) {
      const url = (liveCall as any)?.meeting_url || "";
      setMeetingUrl(url);
      setPhase("joining");
    }
  }, [isLive, callId, liveCall, setPhase]);

  const hasActiveSession = isLive && !!callId;

  // ── Limit check ────────────────────────────────────────────────────────────
  const checkLimit = useCallback(() => {
    if (usage?.isAtLimit) {
      toast.error("Monthly meeting limit reached. Upgrade to continue.");
      return false;
    }
    return true;
  }, [usage]);

  // ── Create native Daily.co meeting ─────────────────────────────────────────
  const handleCreateMeeting = useCallback(async () => {
    if (!checkLimit()) return;

    setIsStarting(true);
    try {
      // 1. Create the calls row
      const callRow = await startCall.mutateAsync({
        platform:    "Daily.co",
        name:        "Fixsense Meeting",
        participants: [],
      } as any);

      // 2. Create Daily.co room and update calls row
      await createRoom({
        callId:  callRow.id,
        title:   "Fixsense Meeting",
        expMinutes: 180,
      });

      setPhase("joining");
      toast.success("Meeting room created! Share the link with your prospect.");
    } catch (err: any) {
      const msg = err?.message || "";
      if (msg === "PLAN_LIMIT_REACHED") {
        toast.error("Meeting limit reached. Upgrade to continue.");
      } else {
        toast.error("Could not create meeting. Please try again.");
      }
      setPhase("idle");
    } finally {
      setIsStarting(false);
    }
  }, [checkLimit, startCall, createRoom, setPhase]);

  // ── Join as host in embedded Daily iframe ──────────────────────────────────
  const handleJoinAsHost = useCallback(async () => {
    if (!roomInfo?.room_url) return;

    try {
      // Load Daily SDK dynamically
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
      if (dailyFrameRef.current) { dailyFrameRef.current.destroy(); }

      const frame = DailyIframe.createFrame(dailyHostRef.current!, {
        showLeaveButton:      true,
        showFullscreenButton: true,
        iframeStyle: {
          position:     "absolute",
          top:          0, left: 0,
          width:        "100%",
          height:       "100%",
          border:       "none",
          borderRadius: "0.75rem",
        },
      });

      dailyFrameRef.current = frame;
      frame.on("joined-meeting", () => setHostJoined(true));
      frame.on("left-meeting",   () => { setHostJoined(false); handleEndCall(); });

      await frame.join({ url: roomInfo.room_url });
      setHostJoined(true);
    } catch (err) {
      toast.error("Failed to open meeting. Try opening in a new tab instead.");
    }
  }, [roomInfo]);

  // ── External platform recording (bot flow) ─────────────────────────────────
  const handleRequestRecording = useCallback((url: string) => {
    if (!checkLimit()) return;
    setConsentUrl(url);
  }, [checkLimit]);

  const handleStartRecording = useCallback(async () => {
    const url = consentUrl;
    if (!url) return;
    setConsentUrl(null);
    setIsStarting(true);
    setMeetingUrl(url);

    try {
      const platform = detectPlatform(url);
      await startCall.mutateAsync({
        platform:    PLATFORM_LABELS[platform] || "Video Call",
        meeting_id:  url,
        meeting_url: url,
        name:        `${PLATFORM_LABELS[platform] || "Video Call"} Meeting`,
        participants: [],
      } as any);
      setPhase("joining");
      toast.success("Recording started — bot is joining your meeting");
    } catch (err: any) {
      const msg = err?.message || "";
      if (msg === "PLAN_LIMIT_REACHED") {
        toast.error("Meeting limit reached. Upgrade to continue.");
      } else {
        toast.error("Could not start recording. Check your connection and try again.");
      }
      setMeetingUrl("");
      setPhase("idle");
    } finally {
      setIsStarting(false);
    }
  }, [consentUrl, startCall, setPhase]);

  // ── End call ───────────────────────────────────────────────────────────────
  const handleEndCall = useCallback(async () => {
    try {
      if (dailyFrameRef.current) {
        dailyFrameRef.current.destroy();
        dailyFrameRef.current = null;
      }
      await endCall.mutateAsync();
      toast.success("Call ended — generating AI summary…");
      setMeetingUrl("");
      setHostJoined(false);
      if (callId) navigate(`/dashboard/calls/${callId}`);
    } catch {
      toast.error("Failed to end call. Please try again.");
    }
  }, [endCall, callId, navigate]);

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <DashboardLayout>
      <div className="space-y-5 pb-10 max-w-2xl mx-auto">

        {/* Header */}
        <div className="space-y-0.5">
          <h1 className="text-2xl font-bold font-display">Live Call</h1>
          <p className="text-sm text-muted-foreground">
            Create a native meeting or paste any video link — AI joins and analyzes automatically
          </p>
        </div>

        {/* Usage limit banner */}
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

        {/* ── Input area — hidden when call is active ── */}
        {!hasActiveSession && (
          <div className="glass rounded-2xl border border-border p-5 space-y-5">

            {/* ── Section 1: Create Native Meeting ── */}
            <div className="space-y-3">
              <div>
                <h2 className="font-semibold text-sm flex items-center gap-2">
                  <Plus className="w-4 h-4 text-primary" />
                  Create Native Meeting
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Instant meeting room — share a single link with your prospect
                </p>
              </div>

              <button
                onClick={handleCreateMeeting}
                disabled={isCreating || isStarting || (usage?.isAtLimit ?? false)}
                className="w-full flex items-center justify-center gap-2.5 h-12 rounded-xl border border-primary/30 bg-primary/5 text-primary text-sm font-semibold hover:bg-primary/10 active:bg-primary/15 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCreating || (isStarting && !consentUrl) ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />Creating room…</>
                ) : (
                  <><VideoIcon className="w-4 h-4" />Create Meeting Room</>
                )}
              </button>

              {/* Feature chips */}
              <div className="flex flex-wrap gap-2">
                {[
                  { icon: Shield,   text: "No login for guests" },
                  { icon: Radio,    text: "Auto AI analysis" },
                  { icon: Sparkles, text: "Instant share link" },
                ].map(({ icon: Icon, text }) => (
                  <span key={text} className="flex items-center gap-1.5 text-[11px] text-muted-foreground bg-secondary/50 border border-border/60 rounded-full px-2.5 py-1">
                    <Icon className="w-3 h-3 text-primary" />{text}
                  </span>
                ))}
              </div>
            </div>

            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border/40" />
              </div>
              <div className="relative flex justify-center text-xs text-muted-foreground">
                <span className="bg-card px-3">or join an existing meeting</span>
              </div>
            </div>

            {/* ── Section 2: Paste External URL ── */}
            <div className="space-y-3">
              <div>
                <h2 className="font-semibold text-sm flex items-center gap-2">
                  <Clipboard className="w-4 h-4 text-muted-foreground" />
                  Paste Meeting Link
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Google Meet, Zoom, Teams — AI bot joins as a participant
                </p>
              </div>
              <MeetingUrlInput
                onStart={handleRequestRecording}
                isLoading={isStarting && !!consentUrl}
                disabled={usage?.isAtLimit ?? false}
              />
            </div>

            {/* How it works tip */}
            <div className="flex items-start gap-2 pt-1 border-t border-border/50">
              <Info className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                For external meetings, the bot joins as{" "}
                <strong className="text-foreground">"Fixsense AI Recorder"</strong> — visible to all participants.
                Host may need to admit it from the waiting room.
              </p>
            </div>
          </div>
        )}

        {/* ── Share link panel (after creating native room) ── */}
        {roomInfo && !hostJoined && (
          <ShareLinkPanel
            shareLink={roomInfo.share_link}
            roomUrl={roomInfo.room_url}
            onJoinAsHost={handleJoinAsHost}
          />
        )}

        {/* ── Daily.co embedded host frame ── */}
        {hostJoined && (
          <div className="glass rounded-2xl border border-primary/20 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/50">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <span className="text-xs font-semibold text-green-400">Meeting in progress</span>
              </div>
              <div className="flex items-center gap-2">
                {roomInfo && (
                  <button onClick={() => copyShareLink()}
                    className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
                    <Copy className="w-3 h-3" />Copy link
                  </button>
                )}
                <Button size="sm" variant="destructive" className="h-7 text-xs gap-1"
                  onClick={handleEndCall} disabled={endCall.isPending}>
                  {endCall.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <StopCircle className="w-3 h-3" />}
                  End
                </Button>
              </div>
            </div>
            <div ref={dailyHostRef} className="relative w-full" style={{ height: "520px" }} />
          </div>
        )}

        {/* ── Active bot session card (external platforms) ── */}
        {hasActiveSession && callId && !roomInfo && (
          <ActiveSessionCard
            phase={phase}
            callId={callId}
            meetingUrl={meetingUrl}
            onEnd={handleEndCall}
            isEnding={endCall.isPending}
          />
        )}

        {/* ── Starting state ── */}
        {isStarting && !callId && (
          <div className="glass rounded-2xl border border-primary/20 bg-primary/5 p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            </div>
            <div>
              <p className="font-semibold text-sm text-primary">Preparing Recording</p>
              <p className="text-xs text-muted-foreground mt-0.5">Setting up your meeting — this takes a few seconds…</p>
            </div>
          </div>
        )}

        {/* ── Consent dialog ── */}
        <RecordingConsentDialog
          open={!!consentUrl}
          meetingUrl={consentUrl || ""}
          onConfirm={handleStartRecording}
          onCancel={() => setConsentUrl(null)}
        />

        {/* ── Calendar connect prompt ── */}
        {!calendarConnected && !hasActiveSession && !isStarting && !roomInfo && (
          <div className="glass rounded-xl border border-border p-4 flex items-center gap-4">
            <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
              <Calendar className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">Connect Google Calendar</p>
              <p className="text-xs text-muted-foreground mt-0.5">Auto-detect upcoming meetings — no link pasting needed</p>
            </div>
            <Button size="sm" variant="outline" onClick={connectCalendar} className="shrink-0 gap-1.5">
              <Calendar className="w-3.5 h-3.5" />Connect
            </Button>
          </div>
        )}

        {/* ── Upcoming meetings ── */}
        {calendarConnected && !hasActiveSession && !roomInfo && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Upcoming Meetings</h2>
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5" onClick={syncNow} disabled={isSyncing}>
                {isSyncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                Sync
              </Button>
            </div>

            {calendarLoading ? (
              <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
            ) : upcomingMeetings.length === 0 ? (
              <div className="glass rounded-xl p-8 text-center border border-dashed border-border">
                <Calendar className="w-7 h-7 mx-auto mb-2 opacity-20" />
                <p className="text-sm text-muted-foreground">No upcoming meetings with video links</p>
              </div>
            ) : (
              <div className="space-y-2">
                {upcomingMeetings.slice(0, 6).map(m => (
                  <UpcomingMeetingRow key={m.id} meeting={m} onRecord={handleRequestRecording} isRecording={isStarting} />
                ))}
              </div>
            )}

            <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3 h-3 text-green-500" />Google Calendar connected
              </div>
              <button onClick={() => disconnectCalendar()} className="hover:text-destructive transition-colors">Disconnect</button>
            </div>
          </div>
        )}

        {/* ── Past calls link ── */}
        {!hasActiveSession && !isStarting && (
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