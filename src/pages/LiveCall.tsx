/**
 * LiveCall.tsx — v4 (Calendar-first)
 *
 * How it works now — exactly like Fireflies, Fathom, and Gong:
 *   1. User connects Google Calendar (one-time OAuth)
 *   2. Dashboard shows all upcoming meetings pulled from their calendar
 *   3. Bot auto-dispatches 5 minutes before each meeting starts
 *   4. Transcripts + AI summary appear automatically after the call
 *   5. User never has to generate or paste a link
 *
 * Manual mode still available for meetings not in their calendar.
 */

import DashboardLayout from "@/components/DashboardLayout";
import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  Calendar, Video, Loader2, ExternalLink, RefreshCw,
  CheckCircle2, Clock, Users, Zap, Bot, ChevronRight,
  Link2, Plus, Trash2, AlertTriangle, Wifi,
} from "lucide-react";
import { Button }   from "@/components/ui/button";
import { Input }    from "@/components/ui/input";
import { Badge }    from "@/components/ui/badge";
import { cn }       from "@/lib/utils";
import { useCalendar, type UpcomingMeeting } from "@/hooks/useCalendar";
import { useLiveCall }   from "@/hooks/useLiveCall";
import { useMeetingUsage } from "@/hooks/useMeetingUsage";
import { useTeam }       from "@/hooks/useTeam";
import { useUserStatus } from "@/hooks/useUserStatus";
import { toast }         from "sonner";
import { formatDistanceToNow, format, isPast, isFuture, addMinutes } from "date-fns";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function detectProvider(url: string) {
  if (/zoom\.(us|com)/i.test(url))        return "zoom";
  if (/meet\.google\.com/i.test(url))     return "google_meet";
  if (/teams\.microsoft\.com/i.test(url)) return "teams";
  if (/\.daily\.co\//i.test(url))         return "daily";
  return null;
}

function providerLabel(provider: string) {
  return provider === "google_meet" ? "Google Meet"
    : provider === "zoom"           ? "Zoom"
    : provider === "teams"          ? "Microsoft Teams"
    : "Video call";
}

function providerColor(provider: string) {
  return provider === "google_meet" ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
    : provider === "zoom"           ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/20"
    : provider === "teams"          ? "bg-purple-500/10 text-purple-400 border-purple-500/20"
    : "bg-secondary text-muted-foreground border-border";
}

// ─── Connect Google Calendar banner ──────────────────────────────────────────

function ConnectCalendarBanner({ onConnect }: { onConnect: () => void }) {
  return (
    <div className="glass rounded-2xl overflow-hidden border border-primary/20">
      {/* Top gradient strip */}
      <div className="h-1 bg-gradient-to-r from-primary/60 via-primary to-primary/60" />

      <div className="p-8 flex flex-col md:flex-row items-center gap-8">
        {/* Icon */}
        <div className="w-20 h-20 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
          <Calendar className="w-10 h-10 text-primary" />
        </div>

        {/* Text */}
        <div className="flex-1 text-center md:text-left">
          <h2 className="text-xl font-bold font-display mb-2">
            Connect Google Calendar
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-lg">
            Fixsense reads your upcoming meetings and automatically joins each one
            to transcribe both sides of the conversation. Just like Fireflies and Gong —
            no links to paste, no buttons to click during the call.
          </p>

          {/* Feature list */}
          <div className="flex flex-wrap gap-x-6 gap-y-2 mt-4">
            {[
              { icon: Bot,          text: "Bot joins automatically" },
              { icon: CheckCircle2, text: "Both sides transcribed" },
              { icon: Zap,          text: "AI summary after each call" },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Icon className="w-3.5 h-3.5 text-primary shrink-0" />
                {text}
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="shrink-0 flex flex-col items-center gap-3">
          <Button onClick={onConnect} size="lg" className="gap-2 px-8">
            <Calendar className="w-4 h-4" />
            Connect Google Calendar
          </Button>
          <p className="text-xs text-muted-foreground">Read-only access · Cancel anytime</p>
        </div>
      </div>
    </div>
  );
}

// ─── Single meeting card ──────────────────────────────────────────────────────

function MeetingCard({
  meeting,
  onJoinNow,
  isStarting,
}: {
  meeting:    UpcomingMeeting;
  onJoinNow:  (meeting: UpcomingMeeting) => void;
  isStarting: boolean;
}) {
  const startTime   = new Date(meeting.scheduled_time);
  const endTime     = addMinutes(startTime, meeting.duration_minutes);
  const isHappening = isPast(startTime) && isFuture(endTime);
  const isVeryClose = !isPast(startTime) &&
    startTime.getTime() - Date.now() < 10 * 60 * 1000; // < 10 min

  return (
    <div className={cn(
      "glass rounded-xl border p-4 transition-all",
      isHappening
        ? "border-green-500/30 bg-green-500/5"
        : isVeryClose
          ? "border-primary/30 bg-primary/5"
          : "border-border",
    )}>
      <div className="flex items-start gap-4">
        {/* Time column */}
        <div className="shrink-0 w-16 text-center">
          <div className="text-base font-bold font-mono">
            {format(startTime, "h:mm")}
          </div>
          <div className="text-xs text-muted-foreground">
            {format(startTime, "a")}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {meeting.duration_minutes}m
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div>
              <h3 className="font-medium text-sm truncate max-w-[260px]">
                {meeting.title}
              </h3>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className={cn(
                  "text-xs px-1.5 py-0.5 rounded-full border",
                  providerColor(meeting.meeting_provider),
                )}>
                  {providerLabel(meeting.meeting_provider)}
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

            {/* Status / action */}
            <div className="shrink-0 flex items-center gap-2">
              {meeting.bot_dispatched ? (
                <div className="flex items-center gap-1.5 text-xs text-green-500 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                  {isHappening ? "Bot recording" : "Bot dispatched"}
                </div>
              ) : isHappening ? (
                <Button
                  size="sm"
                  onClick={() => onJoinNow(meeting)}
                  disabled={isStarting}
                  className="gap-1.5 h-8 text-xs"
                >
                  {isStarting
                    ? <Loader2 className="w-3 h-3 animate-spin" />
                    : <Bot className="w-3 h-3" />}
                  Start AI now
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

          {/* Open link */}
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

          {/* Completed */}
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

// ─── Today's schedule ─────────────────────────────────────────────────────────

function TodaySchedule({
  meetings,
  onJoinNow,
  isStarting,
}: {
  meetings:   UpcomingMeeting[];
  onJoinNow:  (m: UpcomingMeeting) => void;
  isStarting: boolean;
}) {
  const today    = new Date();
  const todayStr = format(today, "yyyy-MM-dd");

  const todayMeetings = meetings.filter(m =>
    format(new Date(m.scheduled_time), "yyyy-MM-dd") === todayStr,
  );
  const laterMeetings = meetings.filter(m =>
    format(new Date(m.scheduled_time), "yyyy-MM-dd") !== todayStr,
  );

  return (
    <div className="space-y-6">
      {/* Today */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Today · {format(today, "MMMM d")}
        </h2>
        {todayMeetings.length === 0 ? (
          <div className="glass rounded-xl p-8 text-center text-muted-foreground border border-dashed border-border">
            <Calendar className="w-8 h-8 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No meetings with video links today</p>
            <p className="text-xs mt-1 opacity-70">
              Meetings with Google Meet or Zoom links will appear here automatically
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {todayMeetings.map(m => (
              <MeetingCard
                key={m.id}
                meeting={m}
                onJoinNow={onJoinNow}
                isStarting={isStarting}
              />
            ))}
          </div>
        )}
      </div>

      {/* Upcoming days */}
      {laterMeetings.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Upcoming
          </h2>
          <div className="space-y-3">
            {laterMeetings.slice(0, 5).map(m => (
              <MeetingCard
                key={m.id}
                meeting={m}
                onJoinNow={onJoinNow}
                isStarting={isStarting}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function LiveCall() {
  const navigate     = useNavigate();
  const { team }     = useTeam();
  const { setStatus } = useUserStatus(team?.id);
  const { usage }    = useMeetingUsage();
  const { startCall } = useLiveCall();

  const {
    isConnected,
    isLoading,
    upcomingMeetings,
    connect,
    disconnect,
    syncNow,
    isSyncing,
    integration,
  } = useCalendar();

  // Manual join (for meetings not in calendar)
  const [joinUrl, setJoinUrl]   = useState("");
  const [isJoining, setIsJoining] = useState(false);

  // Join now — manually start tracking a meeting that's already happening
  const handleJoinNow = async (meeting: UpcomingMeeting) => {
    if (!meeting.meeting_url) return;
    setIsJoining(true);
    try {
      const call = await startCall.mutateAsync({
        platform:    meeting.meeting_provider === "zoom" ? "Zoom" : "Google Meet",
        meeting_id:  meeting.meeting_url,
        meeting_url: meeting.meeting_url,
        name:        meeting.title,
        participants: meeting.participants,
      } as any);
      setStatus("on_call");
      navigate(`/dashboard/live/${call.id}`);
    } catch (e: any) {
      toast.error("Failed to start tracking: " + (e?.message ?? ""));
    } finally {
      setIsJoining(false);
    }
  };

  // Manual paste URL
  const handleManualJoin = async () => {
    if (!joinUrl.trim() || !detectProvider(joinUrl)) {
      toast.error("Please paste a valid Google Meet or Zoom link");
      return;
    }
    setIsJoining(true);
    try {
      const provider = detectProvider(joinUrl);
      const call = await startCall.mutateAsync({
        platform:    provider === "zoom" ? "Zoom" : "Google Meet",
        meeting_id:  joinUrl,
        meeting_url: joinUrl,
      } as any);
      setStatus("on_call");
      navigate(`/dashboard/live/${call.id}`);
    } catch (e: any) {
      toast.error("Failed to join: " + (e?.message ?? ""));
    } finally {
      setIsJoining(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <DashboardLayout>
      <div className="space-y-6 pb-8">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold font-display">Live Call</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {isConnected
                ? "Your calendar is synced — bot joins your meetings automatically"
                : "Connect your calendar to auto-transcribe every meeting"}
            </p>
          </div>

          {isConnected && (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 text-xs text-green-500">
                <Wifi className="w-3.5 h-3.5" />
                Calendar synced
              </div>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 h-8 text-xs"
                onClick={syncNow}
                disabled={isSyncing}
              >
                {isSyncing
                  ? <Loader2 className="w-3 h-3 animate-spin" />
                  : <RefreshCw className="w-3 h-3" />}
                Sync now
              </Button>
            </div>
          )}
        </div>

        {/* Connect banner (if not connected) */}
        {!isLoading && !isConnected && (
          <ConnectCalendarBanner onConnect={connect} />
        )}

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        )}

        {/* Calendar connected — show meetings */}
        {!isLoading && isConnected && (
          <TodaySchedule
            meetings={upcomingMeetings}
            onJoinNow={handleJoinNow}
            isStarting={isJoining}
          />
        )}

        {/* Manual join — always visible */}
        <div className="glass rounded-xl p-5 border border-border">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
              <Link2 className="w-4 h-4 text-accent" />
            </div>
            <div>
              <h3 className="font-display font-semibold text-sm">
                Join a meeting manually
              </h3>
              <p className="text-xs text-muted-foreground">
                For meetings not in your Google Calendar
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Paste Google Meet or Zoom link…"
              value={joinUrl}
              onChange={e => setJoinUrl(e.target.value)}
              className="flex-1 text-sm"
              onKeyDown={e => e.key === "Enter" && handleManualJoin()}
            />
            <Button
              onClick={handleManualJoin}
              disabled={!joinUrl.trim() || isJoining}
              className="gap-2 shrink-0"
            >
              {isJoining
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Bot className="w-4 h-4" />}
              Join
            </Button>
          </div>
        </div>

        {/* Calendar settings */}
        {isConnected && (
          <div className="flex items-center justify-between text-xs text-muted-foreground py-2 border-t border-border">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
              Google Calendar connected
              {integration?.updated_at && (
                <span className="opacity-60">
                  · Last synced {formatDistanceToNow(
                    new Date(integration.updated_at), { addSuffix: true }
                  )}
                </span>
              )}
            </div>
            <button
              onClick={() => disconnect()}
              className="text-muted-foreground hover:text-destructive transition-colors"
            >
              Disconnect
            </button>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
