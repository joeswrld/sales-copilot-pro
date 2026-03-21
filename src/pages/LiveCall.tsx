/**
 * LiveCall.tsx — Fixsense Live Call Hub v2
 *
 * New in v2:
 *  1. Automated Google Meet link generation via create-google-meet edge function
 *  2. Pre-call prep panel (past calls, open action items, talking points)
 *  3. Mobile-responsive layout with simplified "Create & Send Invite" flow
 *  4. Scheduled time + duration stored on the calls row
 *  5. Status wiring: on_call ↔ available via DB-backed useUserStatus
 */

import DashboardLayout from "@/components/DashboardLayout";
import { useState, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  Mic, Link2, CalendarPlus, Video, Loader2, Clock, Trash2,
  ExternalLink, AlertTriangle, Zap, TrendingUp, Calendar,
  Sparkles, Target, ChevronDown, ChevronUp, CheckCircle,
  Users, BarChart3, BookOpen, ArrowRight, Plus, Phone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLiveCall } from "@/hooks/useLiveCall";
import { useScheduledCalls } from "@/hooks/useScheduledCalls";
import { useIntegrations } from "@/hooks/useSettings";
import { useMeetingUsage } from "@/hooks/useMeetingUsage";
import { useTeam } from "@/hooks/useTeam";
import { useUserStatus } from "@/hooks/useUserStatus";
import { useIsMobile } from "@/hooks/use-mobile";
import { useCallPrep } from "@/hooks/useCallPrep";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

// ─── Constants ────────────────────────────────────────────────────────────────

function detectProvider(url: string): string | null {
  if (/zoom\.(us|com)/i.test(url)) return "zoom";
  if (/meet\.google\.com/i.test(url)) return "google_meet";
  return null;
}

const MEETING_TYPES = [
  { value: "discovery",   label: "Discovery Call",  emoji: "🔍" },
  { value: "demo",        label: "Product Demo",     emoji: "🎯" },
  { value: "follow_up",  label: "Follow-up",         emoji: "🔄" },
  { value: "negotiation", label: "Negotiation",      emoji: "🤝" },
  { value: "other",       label: "Other",            emoji: "📋" },
];

const DURATIONS = [
  { value: "30",  label: "30 min" },
  { value: "45",  label: "45 min" },
  { value: "60",  label: "1 hour" },
  { value: "90",  label: "1.5 hours" },
  { value: "120", label: "2 hours" },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function MeetingLimitReached({ planName, used, limit }: { planName: string; used: number; limit: number }) {
  const navigate = useNavigate();
  return (
    <div className="flex items-center justify-center py-10 px-4">
      <div className="max-w-md w-full glass rounded-2xl p-8 text-center border border-destructive/20">
        <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-5">
          <Zap className="w-8 h-8 text-destructive" />
        </div>
        <h2 className="text-xl font-bold font-display mb-2">Meeting Limit Reached</h2>
        <p className="text-sm text-muted-foreground mb-1">
          You've used all <strong>{limit}</strong> meetings this month on the{" "}
          <strong>{planName}</strong> plan.
        </p>
        <div className="h-2 w-full rounded-full bg-muted overflow-hidden my-4">
          <div className="h-2 bg-destructive rounded-full w-full" />
        </div>
        <Button onClick={() => navigate("/dashboard/billing")} className="w-full gap-2" size="lg">
          <Zap className="w-4 h-4" /> Upgrade Plan
        </Button>
      </div>
    </div>
  );
}

// ── Pre-call prep panel ───────────────────────────────────────────────────────
function PreCallPanel({
  participants,
  meetingType,
}: {
  participants: string[];
  meetingType: string;
}) {
  const { prep, isLoading } = useCallPrep(participants, meetingType);
  const [expanded, setExpanded] = useState(true);

  if (isLoading) {
    return (
      <div className="glass rounded-xl p-4 flex items-center gap-3 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin text-primary" />
        Loading call prep…
      </div>
    );
  }

  if (!prep) return null;

  const typeEmoji = MEETING_TYPES.find(t => t.value === meetingType)?.emoji ?? "📋";

  return (
    <div className="glass rounded-xl overflow-hidden border border-border">
      {/* Header */}
      <button
        className="w-full flex items-center justify-between p-4 hover:bg-secondary/30 transition-colors"
        onClick={() => setExpanded(p => !p)}
      >
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <span className="font-display font-semibold text-sm">Call Prep</span>
          {prep.participantContext && (
            <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
              {prep.participantContext}
            </span>
          )}
        </div>
        {expanded
          ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
          : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4">
          {/* Past calls */}
          {prep.pastCalls.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                Previous Calls
              </p>
              <div className="space-y-1">
                {prep.pastCalls.slice(0, 3).map(c => (
                  <Link
                    key={c.id}
                    to={`/dashboard/calls/${c.id}`}
                    className="flex items-center justify-between p-2 rounded-lg hover:bg-secondary/40 transition-colors group"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary/60 shrink-0" />
                      <span className="text-sm truncate">{c.name}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 ml-2">
                      {c.sentiment_score != null && (
                        <span className={cn(
                          "text-xs font-medium",
                          c.sentiment_score >= 70 ? "text-green-500"
                            : c.sentiment_score >= 40 ? "text-yellow-500"
                            : "text-red-400"
                        )}>
                          {c.sentiment_score}%
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(c.date), { addSuffix: true })}
                      </span>
                      <ArrowRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Open action items from last call */}
          {(prep.latestSummary?.next_steps?.length ?? 0) > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                Open Action Items from Last Call
              </p>
              <div className="space-y-1">
                {prep.latestSummary!.next_steps!.slice(0, 4).map((step, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm text-muted-foreground p-1">
                    <div className="w-4 h-4 rounded border border-accent/40 shrink-0 mt-0.5" />
                    {step}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Talking points */}
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              {typeEmoji} Talking Points
            </p>
            <div className="space-y-1">
              {prep.talkingPoints.map((point, i) => (
                <div key={i} className="flex items-start gap-2 text-sm text-muted-foreground p-1">
                  <Target className="w-3 h-3 text-primary shrink-0 mt-1" />
                  {point}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function LiveCall() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  // ── Hooks ─────────────────────────────────────────────────────────────────
  const { team } = useTeam();
  const { onCallStarted, onCallEnded } = useUserStatus(team?.id);

  const { liveCall, isLive, isLoading, startCall } = useLiveCall({
    onCallStarted,
    onCallEnded,
  });

  const { scheduledCalls, scheduleMeeting, cancelScheduled } = useScheduledCalls();
  const { integrations } = useIntegrations();
  const { usage, isLoading: usageLoading } = useMeetingUsage();

  // ── Create meeting state ─────────────────────────────────────────────────
  const [createOpen, setCreateOpen] = useState(false);
  const [meetingTitle, setMeetingTitle] = useState("");
  const [meetingType, setMeetingType] = useState("discovery");
  const [participants, setParticipants] = useState("");
  const [platform, setPlatform] = useState("google_meet");
  const [scheduledTime, setScheduledTime] = useState("");
  const [duration, setDuration] = useState("60");
  const [generatingLink, setGeneratingLink] = useState(false);

  // ── Join meeting state ───────────────────────────────────────────────────
  const [joinUrl, setJoinUrl] = useState("");

  // ── Schedule state ───────────────────────────────────────────────────────
  const [schedOpen, setSchedOpen] = useState(false);
  const [schedTitle, setSchedTitle] = useState("");
  const [schedProvider, setSchedProvider] = useState("google_meet");
  const [schedUrl, setSchedUrl] = useState("");
  const [schedTime, setSchedTime] = useState("");

  // ── Pre-call prep ────────────────────────────────────────────────────────
  const parsedParticipants = useMemo(
    () => participants.split(",").map(p => p.trim()).filter(Boolean),
    [participants]
  );
  const showPrep = parsedParticipants.length > 0 || meetingType !== "discovery";

  const isProviderConnected = (provider: string) =>
    integrations.some(i => i.provider === provider && i.status === "connected");

  // Redirect if already in a live call
  if (isLive && liveCall?.id) {
    navigate(`/dashboard/live/${liveCall.id}`);
  }

  // ── Create meeting handler ────────────────────────────────────────────────
  const handleCreateMeeting = async () => {
    if (!meetingTitle.trim()) { toast.error("Please enter a meeting title"); return; }
    if (usage && !usage.isUnlimited && usage.isAtLimit) {
      toast.error(`You've reached your ${usage.planName} plan limit of ${usage.limit} meetings.`);
      setCreateOpen(false);
      return;
    }

    setGeneratingLink(true);
    let meetingUrl: string | null = null;
    let calendarEventId: string | null = null;

    // ── Try to auto-generate Google Meet link ────────────────────────────
    if (platform === "google_meet" && isProviderConnected("google_meet")) {
      const effectiveTime = scheduledTime || new Date().toISOString();
      try {
        const { data: meetData, error: meetErr } = await supabase.functions.invoke(
          "create-google-meet",
          {
            body: {
              user_id:         liveCall?.user_id ?? (await supabase.auth.getUser()).data.user?.id,
              title:           meetingTitle.trim(),
              participants:    parsedParticipants,
              scheduled_time:  effectiveTime,
              duration_minutes: parseInt(duration, 10),
              meeting_type:    meetingType,
            },
          }
        );

        if (meetErr) {
          console.warn("Meet link generation failed, continuing without link:", meetErr);
          toast.info("Couldn't auto-generate a Meet link. You can paste one manually.");
        } else if (meetData?.meet_link) {
          meetingUrl = meetData.meet_link;
          calendarEventId = meetData.calendar_event_id ?? null;
          toast.success("Google Meet link created and invites sent!");
        }
      } catch (e) {
        console.warn("Meet link generation error:", e);
      }
    }

    setGeneratingLink(false);

    // ── Start the call row ───────────────────────────────────────────────
    try {
      const call = await startCall.mutateAsync({
        platform:           platform === "zoom" ? "Zoom" : "Google Meet",
        meeting_id:         meetingUrl ?? crypto.randomUUID(),
        meeting_url:        meetingUrl ?? undefined,
        calendar_event_id:  calendarEventId ?? undefined,
        name:               meetingTitle.trim(),
        meeting_type:       meetingType,
        participants:       parsedParticipants,
        scheduled_time:     scheduledTime || undefined,
        duration_minutes:   parseInt(duration, 10),
      } as any);
      setCreateOpen(false);
      navigate(`/dashboard/live/${call.id}`);
    } catch (err: any) {
      setGeneratingLink(false);
      if (err?.message === "PLAN_LIMIT_REACHED") {
        toast.error("You've reached your plan limit. Upgrade to continue.");
      } else {
        toast.error("Failed to start meeting");
      }
    }
  };

  // ── Join meeting handler ──────────────────────────────────────────────────
  const handleJoinMeeting = async () => {
    if (!joinUrl.trim()) { toast.error("Please paste a meeting URL"); return; }
    const detected = detectProvider(joinUrl);
    if (!detected) { toast.error("Unsupported URL. Use a Zoom or Google Meet link."); return; }
    if (usage && !usage.isUnlimited && usage.isAtLimit) {
      toast.error(`You've reached your ${usage.planName} plan limit.`);
      return;
    }
    try {
      const call = await startCall.mutateAsync({
        platform:    detected === "zoom" ? "Zoom" : "Google Meet",
        meeting_id:  joinUrl,
        meeting_url: joinUrl,
      } as any);
      navigate(`/dashboard/live/${call.id}`);
    } catch (err: any) {
      if (err?.message === "PLAN_LIMIT_REACHED") {
        toast.error("You've reached your plan limit. Upgrade to Pro.");
      } else {
        toast.error("Failed to join meeting");
      }
    }
  };

  // ── Schedule handler ──────────────────────────────────────────────────────
  const handleSchedule = async () => {
    if (!schedTitle.trim() || !schedTime) { toast.error("Please fill in all fields"); return; }
    await scheduleMeeting.mutateAsync({
      title:            schedTitle,
      meeting_provider: schedProvider,
      meeting_url:      schedUrl || undefined,
      scheduled_time:   new Date(schedTime).toISOString(),
    });
    setSchedOpen(false);
    setSchedTitle(""); setSchedUrl(""); setSchedTime("");
  };

  // ── Quick-start (mobile) ─────────────────────────────────────────────────
  const handleMobileQuickStart = async () => {
    if (!meetingTitle.trim()) { toast.error("Enter a meeting title first"); return; }
    await handleCreateMeeting();
  };

  if (isLoading || usageLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  const zoomConnected  = isProviderConnected("zoom");
  const meetConnected  = isProviderConnected("google_meet");
  const anyConnected   = zoomConnected || meetConnected;
  const atLimit        = usage ? (!usage.isUnlimited && usage.isAtLimit) : false;

  // ════════════════════════════════════════════════════════════════════════════
  // MOBILE LAYOUT
  // ════════════════════════════════════════════════════════════════════════════
  if (isMobile) {
    return (
      <DashboardLayout>
        <div className="space-y-4 pb-4">
          <div>
            <h1 className="text-xl font-bold font-display">Live Call</h1>
            <p className="text-xs text-muted-foreground">Start or join a sales meeting</p>
          </div>

          {/* Usage strip */}
          {usage && !usage.isUnlimited && (
            <div className="glass rounded-xl p-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-muted-foreground">{usage.planName} plan</span>
                <span className={cn("text-xs font-medium",
                  usage.isAtLimit ? "text-destructive" : usage.isNearLimit ? "text-accent" : "text-primary"
                )}>
                  {usage.used} / {usage.limit} meetings
                </span>
              </div>
              <Progress value={usage.pct} className={cn("h-1.5",
                usage.isAtLimit ? "[&>div]:bg-destructive" : usage.isNearLimit ? "[&>div]:bg-accent" : ""
              )} />
            </div>
          )}

          {atLimit && usage && (
            <MeetingLimitReached planName={usage.planName} used={usage.used} limit={usage.limit} />
          )}

          {!atLimit && (
            <>
              {/* Quick create card */}
              <div className="glass rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-primary" />
                  <span className="font-display font-semibold text-sm">Quick Start</span>
                  {meetConnected && (
                    <span className="ml-auto text-xs text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                      Auto Meet link
                    </span>
                  )}
                </div>

                <Input
                  placeholder="Meeting title"
                  value={meetingTitle}
                  onChange={e => setMeetingTitle(e.target.value)}
                  className="h-10"
                />

                <div className="grid grid-cols-2 gap-2">
                  <Select value={meetingType} onValueChange={setMeetingType}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MEETING_TYPES.map(t => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.emoji} {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={duration} onValueChange={setDuration}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DURATIONS.map(d => (
                        <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Input
                  placeholder="Participant emails (comma separated)"
                  value={participants}
                  onChange={e => setParticipants(e.target.value)}
                  className="h-10"
                />

                <Button
                  className="w-full gap-2"
                  disabled={!meetingTitle.trim() || startCall.isPending || generatingLink}
                  onClick={handleMobileQuickStart}
                >
                  {(startCall.isPending || generatingLink)
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <Video className="w-4 h-4" />}
                  {generatingLink ? "Generating link…" : "Create & Send Invite"}
                </Button>
              </div>

              {/* Join by URL */}
              <div className="glass rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Link2 className="w-4 h-4 text-accent" />
                  <span className="font-display font-semibold text-sm">Join Meeting</span>
                </div>
                <Input
                  placeholder="Paste Zoom or Google Meet URL"
                  value={joinUrl}
                  onChange={e => setJoinUrl(e.target.value)}
                  className="h-10"
                />
                <Button
                  variant="secondary"
                  className="w-full gap-2"
                  disabled={!joinUrl.trim() || startCall.isPending}
                  onClick={handleJoinMeeting}
                >
                  {startCall.isPending
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <ExternalLink className="w-4 h-4" />}
                  Join
                </Button>
              </div>

              {/* Pre-call prep (collapsed by default on mobile) */}
              {showPrep && (
                <PreCallPanel
                  participants={parsedParticipants}
                  meetingType={meetingType}
                />
              )}

              {/* Upcoming meetings */}
              {scheduledCalls.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1">
                    Upcoming
                  </p>
                  {scheduledCalls.slice(0, 3).map(sc => (
                    <div key={sc.id} className="glass rounded-xl p-3 flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{sc.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(sc.scheduled_time), "MMM d, h:mm a")}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-3">
                        {sc.meeting_url && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => setJoinUrl(sc.meeting_url!)}
                          >
                            Join
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => cancelScheduled.mutate(sc.id)}
                        >
                          <Trash2 className="w-3 h-3 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </DashboardLayout>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // DESKTOP LAYOUT
  // ════════════════════════════════════════════════════════════════════════════
  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-5xl">
        <div>
          <h1 className="text-2xl font-bold font-display">Live Call</h1>
          <p className="text-sm text-muted-foreground">
            Start or join a sales meeting — Fixsense handles the link, invite, and AI analysis
          </p>
        </div>

        {/* Usage card */}
        {usage && (
          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                Meeting Usage This Month
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="text-center p-3 rounded-lg bg-secondary/40">
                  <div className="text-2xl font-bold font-display">{usage.planName}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Current Plan</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-secondary/40">
                  <div className={cn("text-2xl font-bold font-display",
                    usage.isAtLimit ? "text-destructive" : usage.isNearLimit ? "text-accent" : "text-primary"
                  )}>
                    {usage.used}
                    {!usage.isUnlimited && (
                      <span className="text-muted-foreground text-base font-normal"> / {usage.limit}</span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">Meetings Used</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-secondary/40">
                  <div className="text-2xl font-bold font-display">
                    {usage.isUnlimited ? "∞" : usage.remaining}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">Remaining</div>
                </div>
              </div>
              {!usage.isUnlimited && (
                <div className="space-y-1.5">
                  <Progress
                    value={usage.pct}
                    className={cn("h-2.5",
                      usage.isAtLimit ? "[&>div]:bg-destructive"
                        : usage.isNearLimit ? "[&>div]:bg-accent" : ""
                    )}
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{Math.round(usage.pct)}% of monthly limit</span>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      Resets {format(usage.resetDate, "MMM d, yyyy")}
                    </span>
                  </div>
                </div>
              )}
              {usage.isUnlimited && (
                <div className="flex items-center justify-center gap-2 text-sm text-primary">
                  <Zap className="w-4 h-4" />
                  <span className="font-medium">Unlimited meetings on Scale plan</span>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {atLimit && usage && (
          <MeetingLimitReached planName={usage.planName} used={usage.used} limit={usage.limit} />
        )}

        {!atLimit && (
          <>
            {!anyConnected && (
              <div className="glass rounded-xl p-4 border border-destructive/20 bg-destructive/5 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium">No meeting integrations connected</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Connect Zoom or Google Meet in{" "}
                    <button onClick={() => navigate("/dashboard/settings")} className="text-primary underline">
                      Settings
                    </button>{" "}
                    to enable automatic meeting link generation and invites.
                  </p>
                </div>
              </div>
            )}

            {/* Main action cards */}
            <div className="grid md:grid-cols-3 gap-4">
              {/* ── Create Meeting ────────────────────────────────────────── */}
              <div className="glass rounded-xl p-6 flex flex-col md:col-span-2">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Video className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h2 className="font-display font-semibold">Create Meeting</h2>
                    {meetConnected && (
                      <p className="text-xs text-primary flex items-center gap-1">
                        <Sparkles className="w-3 h-3" />
                        Auto-generates Google Meet link + sends invites
                      </p>
                    )}
                  </div>
                </div>

                <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                  <DialogTrigger asChild>
                    <Button className="gap-2 mt-4" disabled={!anyConnected}>
                      <Plus className="w-4 h-4" />
                      Create Meeting
                    </Button>
                  </DialogTrigger>

                  <DialogContent className="max-w-2xl">
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2">
                        <Video className="w-5 h-5" />
                        Create Meeting
                        {meetConnected && (
                          <span className="text-xs font-normal text-primary bg-primary/10 px-2 py-0.5 rounded-full ml-auto">
                            ✦ Auto Meet link
                          </span>
                        )}
                      </DialogTitle>
                    </DialogHeader>

                    <div className="grid md:grid-cols-2 gap-6 pt-2">
                      {/* Left: form */}
                      <div className="space-y-4">
                        <div>
                          <Label>Meeting Title *</Label>
                          <Input
                            value={meetingTitle}
                            onChange={e => setMeetingTitle(e.target.value)}
                            placeholder="Q4 Discovery Call with Acme Corp"
                            className="mt-1"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label>Meeting Type</Label>
                            <Select value={meetingType} onValueChange={setMeetingType}>
                              <SelectTrigger className="mt-1">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {MEETING_TYPES.map(t => (
                                  <SelectItem key={t.value} value={t.value}>
                                    {t.emoji} {t.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label>Duration</Label>
                            <Select value={duration} onValueChange={setDuration}>
                              <SelectTrigger className="mt-1">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {DURATIONS.map(d => (
                                  <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div>
                          <Label>Participants (comma-separated emails)</Label>
                          <Input
                            value={participants}
                            onChange={e => setParticipants(e.target.value)}
                            placeholder="jane@acme.com, john@acme.com"
                            className="mt-1"
                          />
                        </div>

                        <div>
                          <Label>Schedule for (optional — leave empty to start now)</Label>
                          <Input
                            type="datetime-local"
                            value={scheduledTime}
                            onChange={e => setScheduledTime(e.target.value)}
                            className="mt-1"
                          />
                        </div>

                        <div>
                          <Label>Platform</Label>
                          <Select value={platform} onValueChange={setPlatform}>
                            <SelectTrigger className="mt-1">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="google_meet" disabled={!meetConnected}>
                                Google Meet {!meetConnected ? "(not connected)" : "✦ auto-link"}
                              </SelectItem>
                              <SelectItem value="zoom" disabled={!zoomConnected}>
                                Zoom {!zoomConnected && "(not connected)"}
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <Button
                          onClick={handleCreateMeeting}
                          disabled={startCall.isPending || generatingLink || !meetingTitle.trim()}
                          className="w-full gap-2"
                        >
                          {(startCall.isPending || generatingLink)
                            ? <Loader2 className="w-4 h-4 animate-spin" />
                            : <Video className="w-4 h-4" />}
                          {generatingLink
                            ? "Generating Meet link…"
                            : startCall.isPending
                            ? "Starting…"
                            : meetConnected
                            ? "Create & Send Invites"
                            : "Start Meeting"}
                        </Button>
                      </div>

                      {/* Right: pre-call prep */}
                      <div>
                        {showPrep ? (
                          <PreCallPanel
                            participants={parsedParticipants}
                            meetingType={meetingType}
                          />
                        ) : (
                          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-muted-foreground border border-dashed border-border rounded-xl">
                            <BookOpen className="w-8 h-8 mb-3 opacity-30" />
                            <p className="text-sm">Add participant emails to see call prep, previous call history, and AI talking points.</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>

              {/* ── Join Meeting ──────────────────────────────────────────── */}
              <div className="glass rounded-xl p-6 flex flex-col">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                    <Link2 className="w-5 h-5 text-accent" />
                  </div>
                  <h2 className="font-display font-semibold">Join Meeting</h2>
                </div>
                <p className="text-xs text-muted-foreground mb-4 flex-1">
                  Paste an existing Zoom or Google Meet URL to join with live AI analysis.
                </p>
                <Input
                  placeholder="https://meet.google.com/abc-def-ghi"
                  value={joinUrl}
                  onChange={e => setJoinUrl(e.target.value)}
                  className="mb-3"
                />
                <Button
                  onClick={handleJoinMeeting}
                  disabled={startCall.isPending || !joinUrl.trim()}
                  variant="secondary"
                  className="gap-2"
                >
                  {startCall.isPending
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <ExternalLink className="w-4 h-4" />}
                  Join Meeting
                </Button>
              </div>
            </div>

            {/* Schedule a meeting */}
            <div className="glass rounded-xl p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CalendarPlus className="w-4 h-4 text-muted-foreground" />
                  <h2 className="font-display font-semibold text-sm">Schedule a Meeting</h2>
                </div>
                <Dialog open={schedOpen} onOpenChange={setSchedOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2">
                      <CalendarPlus className="w-3.5 h-3.5" />
                      Schedule
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Schedule a Meeting</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-2">
                      <div><Label>Title</Label><Input value={schedTitle} onChange={e => setSchedTitle(e.target.value)} placeholder="Q4 Sales Review" className="mt-1" /></div>
                      <div>
                        <Label>Platform</Label>
                        <Select value={schedProvider} onValueChange={setSchedProvider}>
                          <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="google_meet">Google Meet</SelectItem>
                            <SelectItem value="zoom">Zoom</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div><Label>Meeting URL (optional)</Label><Input value={schedUrl} onChange={e => setSchedUrl(e.target.value)} placeholder="https://…" className="mt-1" /></div>
                      <div><Label>Date & Time</Label><Input type="datetime-local" value={schedTime} onChange={e => setSchedTime(e.target.value)} className="mt-1" /></div>
                      <Button onClick={handleSchedule} disabled={scheduleMeeting.isPending} className="w-full">
                        {scheduleMeeting.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                        Schedule
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>

              {scheduledCalls.length > 0 && (
                <div className="mt-4 space-y-2">
                  {scheduledCalls.map(sc => (
                    <div key={sc.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/30">
                      <div className="flex items-center gap-3 min-w-0">
                        <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{sc.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(sc.scheduled_time), "MMM d, yyyy 'at' h:mm a")}
                            {" · "}{sc.meeting_provider === "zoom" ? "Zoom" : "Google Meet"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-3">
                        {sc.meeting_url && (
                          <Button variant="outline" size="sm" onClick={() => setJoinUrl(sc.meeting_url!)}>
                            Join
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => cancelScheduled.mutate(sc.id)}>
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Integration status */}
            <section>
              <h2 className="font-display font-semibold mb-3 text-sm">Integration Status</h2>
              <div className="grid sm:grid-cols-3 gap-3">
                {[
                  { provider: "zoom",        name: "Zoom",         connected: zoomConnected },
                  { provider: "google_meet", name: "Google Meet",  connected: meetConnected },
                  { provider: "slack",       name: "Slack",        connected: isProviderConnected("slack") },
                ].map(int => (
                  <div key={int.provider} className="glass rounded-xl p-4 flex items-center justify-between">
                    <span className="text-sm font-medium">{int.name}</span>
                    <div className="flex items-center gap-2">
                      {int.connected && int.provider === "google_meet" && (
                        <span className="text-xs text-primary">auto-link</span>
                      )}
                      <span className={cn("text-xs px-2 py-0.5 rounded-full",
                        int.connected ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                      )}>
                        {int.connected ? "Connected" : "Not connected"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
