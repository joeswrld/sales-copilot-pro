/**
 * LiveCall.tsx — Meeting Control OS  (v4 — Daily.co, room persistence fix)
 *
 * Fully migrated from 100ms to Daily.co.
 * Uses useDailyRoom + useDailyCall hooks.
 * No 100ms SDK imports remain.
 *
 * v4 fixes:
 *  - Meeting link no longer regenerates on page refresh. roomInfo is now
 *    rehydrated from the live `calls` row (daily_room_name / daily_room_url /
 *    meeting_url) on load, so the same share link + "Join as Host" continue
 *    to work after a reload.
 *  - "Create Meeting" is now blocked while a call is already live, preventing
 *    a second `calls` row (and second Daily room) from being created.
 *
 * Network quality is informational only — users on 2G/3G or poor
 * connections are never blocked from creating, hosting, or joining
 * a meeting. Daily.co's adaptive bitrate degrades video automatically
 * and audio/transcription keep working even on weak connections.
 */

import DashboardLayout from "@/components/DashboardLayout";
import EnablePushPrompt from "@/components/EnablePushPrompt";
import { VideoTile } from "@/components/VideoTile";
import { NetworkQualityBanner } from "@/components/NetworkQualityBanner";
import { useNetworkQuality } from "@/hooks/useNetworkQuality";
import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  Loader2, Copy, Check, ExternalLink, Calendar,
  Plus, ChevronRight, Radio, Eye, Link2, Mic,
  Video, VideoOff, PhoneOff, Users, AlertTriangle,
  RefreshCw, WifiOff, CheckCircle2,
  X, CalendarPlus, Sparkles, Shield,
  ArrowRight, Tag, FileText, Zap, Wifi,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLiveCall } from "@/hooks/useLiveCall";
import { useDailyCall } from "@/hooks/useDailyCall";
import { useDailyRoom } from "@/hooks/useDailyRoom";
import { useAudioStreaming } from "@/hooks/useAudioStreaming";
import { useTeam } from "@/hooks/useTeam";
import { useUserStatus } from "@/hooks/useUserStatus";
import { useTeamMinuteUsage } from "@/hooks/useTeamMinuteUsage";
import { TeamUsageBanner } from "@/components/TeamMinuteUsageComponents";
import { useScheduledMeetings } from "@/hooks/useScheduledMeetings";
import MeetingTimeline from "@/components/MeetingTimeline";
import { MeetingNotificationBanner, NotificationStatusPill } from "@/components/MeetingNotificationBanner";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";

// ─── Types ────────────────────────────────────────────────────────────────────

type JoinState =
  | "idle"
  | "checking_network"
  | "creating_room"
  | "connecting"
  | "connected"
  | "failed";

const MEETING_TYPES = [
  { value: "discovery",   label: "Discovery",   emoji: "🔍" },
  { value: "demo",        label: "Demo",        emoji: "🎯" },
  { value: "follow_up",   label: "Follow-up",   emoji: "📞" },
  { value: "negotiation", label: "Negotiation", emoji: "🤝" },
  { value: "onboarding",  label: "Onboarding",  emoji: "🚀" },
  { value: "other",       label: "Other",       emoji: "📋" },
];

// ─── Meeting Created Popup ─────────────────────────────────────────────────────

function MeetingCreatedPopup({
  shareLink, roomName, meetingTitle, meetingToken,
  onJoinAsHost, onSchedule, onClose,
}: {
  shareLink: string;
  roomName: string;
  meetingTitle: string;
  meetingToken: string | null;
  onJoinAsHost: () => void;
  onSchedule: () => void;
  onClose: () => void;
}) {
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

  // Daily prebuilt URL (direct Daily room URL for guest join)
  const dailyDirectUrl = `https://fixsense.daily.co/${roomName}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}
    >
      <div
        className="relative w-full max-w-md rounded-2xl border border-white/10 overflow-hidden"
        style={{
          background: "linear-gradient(135deg, #0f1117 0%, #141824 50%, #0f1117 100%)",
          boxShadow: "0 0 0 1px rgba(99,102,241,0.2), 0 32px 80px rgba(0,0,0,0.6)",
        }}
      >
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-0.5 bg-gradient-to-r from-transparent via-indigo-500 to-transparent" />
        <button onClick={onClose} className="absolute top-4 right-4 text-white/30 hover:text-white/70 transition-colors z-10">
          <X className="w-4 h-4" />
        </button>

        <div className="p-6 space-y-5">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.25), rgba(139,92,246,0.15))", border: "1px solid rgba(99,102,241,0.3)" }}
            >
              <CheckCircle2 className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <p className="font-semibold text-white text-sm">Daily.co room ready</p>
              <p className="text-xs text-white/40 mt-0.5 truncate max-w-[240px]">{meetingTitle}</p>
            </div>
          </div>

          <div
            className="rounded-xl p-3 flex items-center gap-2.5"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
          >
            <Link2 className="w-3.5 h-3.5 text-white/30 shrink-0" />
            <span className="text-xs text-white/60 flex-1 truncate font-mono">{shareLink}</span>
            <button
              onClick={copyLink}
              className={cn(
                "flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-all shrink-0",
                copied
                  ? "text-green-400 bg-green-500/15 border border-green-500/25"
                  : "text-indigo-300 bg-indigo-500/15 border border-indigo-500/25 hover:bg-indigo-500/25",
              )}
            >
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>

          <div className="space-y-2.5">
            <button
              onClick={onJoinAsHost}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90"
              style={{ background: "linear-gradient(135deg, #4f46e5, #7c3aed)", boxShadow: "0 4px 20px rgba(99,102,241,0.3)" }}
            >
              <span className="flex items-center gap-2.5"><Video className="w-4 h-4" />Join as Host</span>
              <ArrowRight className="w-4 h-4 opacity-60" />
            </button>
            <button
              onClick={onSchedule}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-all hover:bg-white/8"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <span className="flex items-center gap-2.5 text-white/70"><CalendarPlus className="w-4 h-4" />Schedule this meeting</span>
              <ArrowRight className="w-4 h-4 text-white/30" />
            </button>
            <a href={dailyDirectUrl} target="_blank" rel="noopener noreferrer">
              <button
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-all hover:bg-white/8"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
              >
                <span className="flex items-center gap-2.5 text-white/50"><ExternalLink className="w-4 h-4" />Open in Daily.co (new tab)</span>
                <ArrowRight className="w-4 h-4 text-white/20" />
              </button>
            </a>
          </div>

          <p className="text-[11px] text-white/20 flex items-center gap-1.5 justify-center">
            <Shield className="w-3 h-3" />
            Powered by Daily.co · No login required for guests · AI transcription active
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Schedule Meeting Modal ────────────────────────────────────────────────────

function ScheduleModal({
  prefillLink, prefillTitle, timezone, onSave, onClose,
}: {
  prefillLink?: string;
  prefillTitle?: string;
  timezone: string;
  onSave: (params: { title: string; meeting_link: string; scheduled_time: string; meeting_type: string; scheduled_timezone: string }) => Promise<void>;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(prefillTitle || "");
  const [link, setLink] = useState(prefillLink || "");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [meetingType, setMeetingType] = useState("discovery");
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!title.trim()) { toast.error("Title is required"); return; }
    if (!date || !time) { toast.error("Date and time are required"); return; }
    setIsSaving(true);
    try {
      const dt = new Date(`${date}T${time}:00`);
      await onSave({ title: title.trim(), meeting_link: link.trim(), scheduled_time: dt.toISOString(), meeting_type: meetingType, scheduled_timezone: timezone });
      toast.success("Meeting scheduled!");
      onClose();
    } catch (e: any) {
      toast.error(e.message || "Failed to schedule meeting");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}
    >
      <div
        className="relative w-full max-w-md rounded-2xl border border-white/10 overflow-hidden"
        style={{ background: "linear-gradient(135deg, #0f1117 0%, #141824 100%)", boxShadow: "0 32px 80px rgba(0,0,0,0.6)" }}
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-white/30 hover:text-white/70 transition-colors">
          <X className="w-4 h-4" />
        </button>
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.25)" }}>
              <CalendarPlus className="w-4 h-4 text-violet-400" />
            </div>
            <div>
              <p className="font-semibold text-white text-sm">Schedule Meeting</p>
              <p className="text-xs text-white/40">Add to your Fixsense calendar</p>
            </div>
          </div>

          <div>
            <label className="text-xs text-white/50 font-medium mb-1.5 block">Meeting Title *</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Acme Corp Demo"
              className="w-full px-3.5 py-2.5 rounded-xl text-sm text-white outline-none"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }} />
          </div>

          {!prefillLink && (
            <div>
              <label className="text-xs text-white/50 font-medium mb-1.5 block">Meeting Link (optional)</label>
              <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://fixsense.daily.co/..."
                className="w-full px-3.5 py-2.5 rounded-xl text-sm text-white outline-none font-mono text-xs"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }} />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-white/50 font-medium mb-1.5 block">Date *</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl text-sm text-white outline-none"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", colorScheme: "dark" }} />
            </div>
            <div>
              <label className="text-xs text-white/50 font-medium mb-1.5 block">Time *</label>
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl text-sm text-white outline-none"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", colorScheme: "dark" }} />
            </div>
          </div>

          <div>
            <label className="text-xs text-white/50 font-medium mb-1.5 block flex items-center gap-1"><Tag className="w-3 h-3" />Type</label>
            <div className="flex flex-wrap gap-1.5">
              {MEETING_TYPES.map((t) => (
                <button key={t.value} onClick={() => setMeetingType(t.value)}
                  className={cn("text-xs px-2.5 py-1 rounded-lg border transition-all",
                    meetingType === t.value
                      ? "border-indigo-500/50 bg-indigo-500/15 text-indigo-300"
                      : "border-white/8 bg-white/4 text-white/40 hover:text-white/60",
                  )}>
                  {t.emoji} {t.label}
                </button>
              ))}
            </div>
          </div>

          <button onClick={handleSave} disabled={isSaving}
            className="w-full py-3 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 transition-all hover:opacity-90 disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #4f46e5, #7c3aed)" }}>
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarPlus className="w-4 h-4" />}
            {isSaving ? "Scheduling…" : "Schedule Meeting"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Network Blocked Fallback ─────────────────────────────────────────────────

function NetworkBlockedCard({ shareLink, roomName, onRetry, onDismiss }: {
  shareLink: string | null;
  roomName: string | null;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const dailyDirectUrl = roomName ? `https://fixsense.daily.co/${roomName}` : null;

  const copyLink = async () => {
    if (!shareLink) return;
    await navigator.clipboard.writeText(shareLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
    toast.success("Copied!");
  };

  return (
    <div className="rounded-2xl border p-5 space-y-4" style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.2)" }}>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.2)" }}>
          <WifiOff className="w-5 h-5 text-red-400" />
        </div>
        <div>
          <p className="text-sm font-semibold text-red-400">Connection issue</p>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            Couldn't join the Daily.co room. The room was created — share the link with your prospect or try again with a better connection.
          </p>
        </div>
      </div>

      {shareLink && (
        <div className="rounded-xl p-3 flex items-center gap-2.5" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
          <Link2 className="w-3.5 h-3.5 text-white/30 shrink-0" />
          <span className="text-xs text-white/60 flex-1 truncate font-mono">{shareLink}</span>
          <button onClick={copyLink}
            className={cn("flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-all shrink-0",
              copied ? "text-green-400 bg-green-500/15 border border-green-500/25" : "text-indigo-300 bg-indigo-500/15 border border-indigo-500/25")}>
            {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            {copied ? "Copied!" : "Copy link"}
          </button>
        </div>
      )}

      {dailyDirectUrl && (
        <a href={dailyDirectUrl} target="_blank" rel="noopener noreferrer">
          <Button variant="outline" className="w-full gap-2 text-indigo-400 border-indigo-500/30">
            <ExternalLink className="w-3.5 h-3.5" />Open room in Daily.co directly
          </Button>
        </a>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" className="gap-2" onClick={onRetry}><RefreshCw className="w-3.5 h-3.5" />Try Again</Button>
        <Button variant="outline" className="gap-2 text-muted-foreground" onClick={onDismiss}><X className="w-3.5 h-3.5" />Dismiss</Button>
      </div>
    </div>
  );
}

// ─── MAIN PAGE ─────────────────────────────────────────────────────────────────

export default function LiveCall() {
  const navigate = useNavigate();
  const { team } = useTeam();
  const { setStatus } = useUserStatus(team?.id);
  const { usage: teamUsage } = useTeamMinuteUsage();
  const networkInfo = useNetworkQuality();

  const { startCall, endCall, liveCall, isLive, isLoading, callId } = useLiveCall({
    onCallStarted: () => setStatus("on_call"),
    onCallEnded:   () => setStatus("available"),
  });

  const { createRoom, isCreating, roomInfo, setRoomInfo, copyShareLink } = useDailyRoom();

  // ── Rehydrate roomInfo from the live `calls` row on load / refresh ────────
  // Without this, a page refresh leaves roomInfo (local React state) empty,
  // so the UI falls back to the "Create Meeting" form — and clicking it would
  // insert a brand-new `calls` row (new call_id), causing create-daily-room's
  // idempotency check to never find a prior room and mint a fresh link.
  // Restoring from the already-live row keeps the same share link / room
  // across refreshes; meeting_token is left null so useDailyCall mints a
  // fresh join token via get-daily-token when the user joins.
  useEffect(() => {
    if (!roomInfo && liveCall && (liveCall as any).daily_room_name) {
      setRoomInfo({
        room_name:  (liveCall as any).daily_room_name,
        room_url:   (liveCall as any).daily_room_url ?? `https://fixsense.daily.co/${(liveCall as any).daily_room_name}`,
        share_link: (liveCall as any).meeting_url ?? `${window.location.origin}/join/${(liveCall as any).daily_room_name}`,
        // null forces useDailyCall to mint a fresh token via get-daily-token
        meeting_token: null,
        expires_at: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
        mgmt_token: null,
        auth_token: null,
      });
    }
  }, [liveCall, roomInfo, setRoomInfo]);

  // Daily call hook — only active when we have a room
  const daily = useDailyCall({
    callId: callId ?? null,
    roomName: roomInfo?.room_name ?? null,
    meetingToken: roomInfo?.meeting_token ?? null,
    userName: "Host",
    onJoined: () => {
      setJoinState("connected");
      setHostJoined(true);
      toast.success("Connected to Daily.co room!");
    },
    onLeft: () => {
      setHostJoined(false);
      setJoinState("idle");
    },
    onNetworkQualityChange: (q) => {
      if (q === "poor") toast.warning("Weak network — video quality reduced automatically", { id: "net-warn" });
      else if (q === "good" || q === "excellent") toast.dismiss("net-warn");
    },
  });

  // Audio streaming from Daily tracks
  const audioStreaming = useAudioStreaming({
    callId: callId ?? null,
  });

  const { create: createMeeting, upcoming: upcomingMeetings } = useScheduledMeetings();

  const [userTz] = useState<string>(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; }
  });

  const [showPopup, setShowPopup] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [schedulePrefilledLink, setSchedulePrefilledLink] = useState("");
  const [schedulePrefilledTitle, setSchedulePrefilledTitle] = useState("");
  const [isStarting, setIsStarting] = useState(false);
  const [hostJoined, setHostJoined] = useState(false);
  const [activeMeetingTitle, setActiveMeetingTitle] = useState("");
  const [joinLink, setJoinLink] = useState("");
  const [meetingType, setMeetingType] = useState("discovery");
  const [meetingTitleInput, setMeetingTitleInput] = useState("");
  const [meetingNotes, setMeetingNotes] = useState("");
  const [joinState, setJoinState] = useState<JoinState>("idle");
  const [networkWarningDismissed, setNetworkWarningDismissed] = useState(false);
  const [isAudioOn, setIsAudioOn] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(true);

  // Due-time meeting notifier
  const notifiedDueRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const { playNotificationSound } = await import("@/lib/notificationSound");
      const now = Date.now();
      for (const m of upcomingMeetings) {
        if (cancelled || notifiedDueRef.current.has(m.id)) continue;
        const start = new Date(m.scheduled_time).getTime();
        if (Number.isNaN(start)) continue;
        const diffSec = (start - now) / 1000;
        if (diffSec <= 45 && diffSec >= -45) {
          notifiedDueRef.current.add(m.id);
          playNotificationSound();
          toast.success(`Meeting starting now: ${m.title}`, {
            description: m.meeting_link ? "Click to join" : undefined,
            position: "bottom-right",
            duration: 10000,
            action: m.meeting_link ? { label: "Join", onClick: () => window.open(m.meeting_link!, "_blank") } : undefined,
          });
        }
      }
    };
    check();
    const id = setInterval(check, 20_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [upcomingMeetings]);

  const checkLimit = useCallback(() => {
    if (teamUsage?.isAtLimit) {
      toast.error(teamUsage.isTeamPlan ? "Team minute pool exhausted." : "Monthly limit reached. Upgrade to continue.");
      return false;
    }
    return true;
  }, [teamUsage]);

  // ── Join as host via Daily call object ────────────────────────────────────
  // NOTE: We never block on network quality — only show a heads-up toast
  // for fair/poor connections, then proceed to join regardless.
  const handleJoinAsHost = useCallback(async (info?: typeof roomInfo) => {
    const target = info || roomInfo;
    if (!target || !callId) return;
    setShowPopup(false);

    if (networkInfo.isWarning && !networkWarningDismissed) {
      toast.warning(networkInfo.message, { duration: 6000 });
    }

    setJoinState("connecting");
    const success = await daily.joinCall({
      rName: target.room_name,
      token: target.meeting_token ?? undefined,
      displayName: "Host",
    });

    if (!success) {
      setJoinState("failed");
    } else {
      navigate(`/live/${callId}`);
    }
  }, [roomInfo, callId, networkInfo, networkWarningDismissed, daily, navigate]);

  // ── Create meeting ─────────────────────────────────────────────────────────
  const handleCreateMeeting = useCallback(async () => {
    const title = meetingTitleInput.trim() || "Fixsense Meeting";
    if (!checkLimit()) return;

    // Guard: don't create a second `calls` row (and second Daily room) while
    // one is already live. This is the root cause of links regenerating —
    // without this guard, a stray "Create Meeting" click while a meeting is
    // already live would insert a new calls row with a fresh call_id, and
    // create-daily-room's per-call_id idempotency check would never find the
    // existing room, minting a brand-new link.
    if (isLive) {
      toast.info("You already have an active meeting link. End the current call to create a new one.");
      setShowPopup(true);
      return;
    }

    setIsStarting(true);
    setActiveMeetingTitle(title);
    let callRow: any = null;
    try {
      callRow = await startCall.mutateAsync({
        platform: "daily",
        name: title,
        meeting_type: meetingType,
        participants: [],
        description: meetingNotes,
      } as any);
      setJoinState("creating_room");
      const room = await createRoom({
        callId: callRow.id,
        title,
        meetingType,
        expMinutes: 180,
      });
      setShowPopup(true);
      toast.success("Daily.co room created! Share the link with your prospect.");
    } catch (err: any) {
      if (callRow?.id) {
        await supabase.from("calls")
          .update({ status: "completed", end_time: new Date().toISOString(), duration_minutes: 0 })
          .eq("id", callRow.id);
      }
      if (err?.message === "PLAN_LIMIT_REACHED") {
        toast.error("Meeting limit reached. Upgrade to continue.");
      } else {
        console.error("createRoom error:", err);
        toast.error(err?.message ?? "Could not create meeting room.");
      }
      setActiveMeetingTitle("");
    } finally {
      setIsStarting(false);
      setJoinState("idle");
    }
  }, [meetingTitleInput, meetingNotes, meetingType, checkLimit, isLive, startCall, createRoom]);

  // ── End call ──────────────────────────────────────────────────────────────
  const handleEndCall = useCallback(async () => {
    audioStreaming.stopAll();
    await daily.leaveCall();
    try {
      await endCall.mutateAsync();
      toast.success("Call ended — generating AI summary…");
      setHostJoined(false);
      setActiveMeetingTitle("");
      setJoinState("idle");
      if (callId) navigate(`/calls/${callId}`);
    } catch {
      toast.error("Failed to end call.");
    }
  }, [endCall, callId, navigate, audioStreaming, daily]);

  const openScheduleFromPopup = useCallback(() => {
    if (roomInfo) { setSchedulePrefilledLink(roomInfo.share_link); setSchedulePrefilledTitle(activeMeetingTitle); }
    setShowPopup(false);
    setShowScheduleModal(true);
  }, [roomInfo, activeMeetingTitle]);

  const openFreshSchedule = useCallback(() => {
    setSchedulePrefilledLink(""); setSchedulePrefilledTitle(""); setShowScheduleModal(true);
  }, []);

  const handleScheduleSave = useCallback(async (params: {
    title: string; meeting_link: string; scheduled_time: string; meeting_type: string; scheduled_timezone: string;
  }) => {
    await createMeeting.mutateAsync({ ...params });
  }, [createMeeting]);

  // Track Daily participant audio for transcription
  useEffect(() => {
    for (const p of daily.participants) {
      if (p.audioTrack) {
        audioStreaming.startTrackRecording(p.audioTrack, p.session_id, p.local);
      }
    }
  }, [daily.participants, audioStreaming]);

  const hasActiveSession = isLive && !!callId;

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
      <EnablePushPrompt context="for scheduled meeting reminders" />

      {showPopup && roomInfo && callId && (
        <MeetingCreatedPopup
          shareLink={roomInfo.share_link}
          roomName={roomInfo.room_name}
          meetingTitle={activeMeetingTitle}
          meetingToken={roomInfo.meeting_token}
          onJoinAsHost={() => handleJoinAsHost()}
          onSchedule={openScheduleFromPopup}
          onClose={() => setShowPopup(false)}
        />
      )}
      {showScheduleModal && (
        <ScheduleModal
          prefillLink={schedulePrefilledLink}
          prefillTitle={schedulePrefilledTitle}
          timezone={userTz}
          onSave={handleScheduleSave}
          onClose={() => setShowScheduleModal(false)}
        />
      )}

      <div className="space-y-5 pb-10">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold font-display">Live Call</h1>
            <p className="text-sm text-muted-foreground">
              Meeting control center — powered by Daily.co
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs border border-border bg-secondary/40">
              <Wifi className={cn("w-3.5 h-3.5",
                networkInfo.quality === "good" ? "text-emerald-400"
                : networkInfo.quality === "fair" ? "text-amber-400"
                : networkInfo.quality === "poor" ? "text-red-400"
                : "text-muted-foreground")} />
              <span className="text-muted-foreground capitalize">{networkInfo.effectiveType ?? networkInfo.quality}</span>
              {networkInfo.downlink !== null && <span className="text-muted-foreground/50">{networkInfo.downlink.toFixed(1)} Mbps</span>}
            </div>
            <NotificationStatusPill />
          </div>
        </div>

        {/* Network warning — informational only, never blocks hosting/joining */}
        {(networkInfo.quality === "fair" || networkInfo.quality === "poor") && !networkWarningDismissed && (
          <NetworkQualityBanner
            info={networkInfo}
            onDismiss={() => setNetworkWarningDismissed(true)}
            onRetry={() => networkInfo.refresh()}
          />
        )}

        <MeetingNotificationBanner onEnabled={() => toast.success("Meeting reminders enabled!")} />
        <TeamUsageBanner onUpgrade={() => navigate("/billing")} />

        {/* Join state banners */}
        {joinState === "failed" && (
          <NetworkBlockedCard
            shareLink={roomInfo?.share_link ?? null}
            roomName={roomInfo?.room_name ?? null}
            onRetry={() => { setJoinState("idle"); handleJoinAsHost(); }}
            onDismiss={() => setJoinState("idle")}
          />
        )}

        {/* Network quality from Daily SDK */}
        {hostJoined && daily.networkQuality !== "good" && daily.networkQuality !== "excellent" && (
          <div className={cn(
            "rounded-xl border px-4 py-3 flex items-center gap-3 text-sm",
            daily.networkQuality === "poor" || daily.networkQuality === "disconnected"
              ? "border-red-500/25 bg-red-500/5 text-red-400"
              : "border-amber-500/25 bg-amber-500/5 text-amber-400",
          )}>
            <WifiOff className="w-4 h-4 shrink-0" />
            <span>
              {daily.networkQuality === "poor" || daily.networkQuality === "disconnected"
                ? "Poor connection — video quality has been reduced automatically"
                : "Fair connection — you may experience occasional quality drops"}
            </span>
          </div>
        )}

        {/* Active call banner */}
        {hasActiveSession && hostJoined && (
          <div className="rounded-xl border border-green-500/25 bg-green-500/5 p-4 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <span className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse" />
              <div>
                <p className="font-semibold text-sm text-green-400">
                  {activeMeetingTitle || "Meeting"} · In progress
                  {daily.elapsedSeconds > 0 && (
                    <span className="ml-2 font-mono text-xs text-green-300/70">
                      {Math.floor(daily.elapsedSeconds / 60).toString().padStart(2, "0")}:{(daily.elapsedSeconds % 60).toString().padStart(2, "0")}
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {audioStreaming.state.isStreaming
                    ? `AI transcribing · ${audioStreaming.state.chunksSent} chunks sent`
                    : "Waiting for audio…"}
                  {daily.participantCount > 1 && ` · ${daily.participantCount} participants`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={async () => {
                  await daily.setAudioEnabled(!isAudioOn);
                  setIsAudioOn((v) => !v);
                }}
                className={cn(
                  "flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors",
                  isAudioOn ? "border-border bg-secondary/60" : "border-red-500/30 bg-red-500/15 text-red-400",
                )}
              >
                <Mic className="w-3.5 h-3.5" />{isAudioOn ? "Mute" : "Unmute"}
              </button>
              <button
                onClick={async () => {
                  await daily.setVideoEnabled(!isVideoOn);
                  setIsVideoOn((v) => !v);
                }}
                className={cn(
                  "flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors",
                  isVideoOn ? "border-border bg-secondary/60" : "border-red-500/30 bg-red-500/15 text-red-400",
                )}
              >
                {isVideoOn ? <Video className="w-3.5 h-3.5" /> : <VideoOff className="w-3.5 h-3.5" />}
                {isVideoOn ? "Stop Video" : "Start Video"}
              </button>
              {daily.isRecording ? (
                <button
                  onClick={() => daily.stopRecording()}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-red-500/30 bg-red-500/15 text-red-400"
                >
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />Recording
                </button>
              ) : (
                <button
                  onClick={() => daily.startRecording()}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border bg-secondary/60"
                >
                  <span className="w-2 h-2 rounded-full bg-white/40" />Record
                </button>
              )}
              <Link to={`/live/${callId}`}>
                <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs"><Eye className="w-3 h-3" />Transcript</Button>
              </Link>
              <Button size="sm" variant="destructive" className="gap-1.5 h-8 text-xs" onClick={handleEndCall} disabled={endCall.isPending}>
                {endCall.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <PhoneOff className="w-3 h-3" />}
                End Call
              </Button>
            </div>
          </div>
        )}

        {/* Room created but not joined */}
        {roomInfo && !hostJoined && joinState !== "failed" && (
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-4 h-4 text-primary" />
              <div>
                <p className="text-sm font-semibold text-primary">Room ready — share the link</p>
                <p className="text-xs text-muted-foreground truncate max-w-xs font-mono">{roomInfo.share_link}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs" onClick={() => setShowPopup(true)}>
                <Eye className="w-3 h-3" />View Link
              </Button>
              <Button
                size="sm" className="gap-1.5 h-8 text-xs"
                onClick={() => handleJoinAsHost()}
                disabled={daily.isConnecting}
              >
                {daily.isConnecting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Video className="w-3 h-3" />}
                {daily.isConnecting ? "Connecting…" : "Join as Host"}
              </Button>
            </div>
          </div>
        )}

        {/* 3-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* LEFT: Create Meeting */}
          <div className="space-y-4">
            <div className="glass rounded-xl border border-border p-4 space-y-4">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5" />Create Meeting
              </h2>

              {networkInfo.quality !== "good" && networkInfo.quality !== "unknown" && (
                <NetworkQualityBanner info={networkInfo} compact onRetry={() => networkInfo.refresh()} />
              )}

              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Title</label>
                <div className="relative">
                  <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <input
                    value={meetingTitleInput}
                    onChange={(e) => setMeetingTitleInput(e.target.value)}
                    placeholder="e.g. Acme Corp — Demo"
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl text-sm bg-secondary/60 border border-border focus:border-primary/60 outline-none transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block flex items-center gap-1"><Tag className="w-3 h-3" />Type</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {MEETING_TYPES.map((t) => (
                    <button key={t.value} onClick={() => setMeetingType(t.value)}
                      className={cn(
                        "text-[11px] px-2 py-1.5 rounded-lg border transition-all text-center leading-tight",
                        meetingType === t.value
                          ? "border-primary/50 bg-primary/10 text-foreground"
                          : "border-border bg-secondary/30 text-muted-foreground hover:bg-secondary/60",
                      )}>
                      <div>{t.emoji}</div>
                      <div className="mt-0.5">{t.label}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Notes (optional)</label>
                <textarea
                  value={meetingNotes}
                  onChange={(e) => setMeetingNotes(e.target.value)}
                  rows={2}
                  placeholder="Agenda, context…"
                  className="w-full px-3.5 py-2 rounded-xl text-sm bg-secondary/60 border border-border focus:border-primary/60 outline-none resize-none transition-colors placeholder:text-muted-foreground/50"
                />
              </div>

              <Button
                className="w-full gap-2"
                onClick={handleCreateMeeting}
                disabled={isCreating || isStarting || (teamUsage?.isAtLimit ?? false)}
              >
                {isCreating || isStarting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {isCreating || isStarting ? "Creating…" : "Create Meeting"}
              </Button>

              <Button variant="outline" className="w-full gap-2" onClick={openFreshSchedule}>
                <CalendarPlus className="w-4 h-4" />Schedule Meeting
              </Button>
            </div>

            <div className="glass rounded-xl border border-border p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" />Upcoming
                </h2>
                <NotificationStatusPill />
              </div>
              <MeetingTimeline compact maxItems={4} />
            </div>
          </div>

          {/* CENTER: Join via Link */}
          <div className="space-y-4">
            <div className="glass rounded-xl border border-border p-4 space-y-4">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Link2 className="w-3.5 h-3.5" />Join or Host via Link
              </h2>

              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Paste meeting link</label>
                <div className="relative">
                  <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <input
                    value={joinLink}
                    onChange={(e) => setJoinLink(e.target.value)}
                    placeholder="https://fixsense.daily.co/..."
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl text-sm bg-secondary/60 border border-border focus:border-primary/60 outline-none transition-colors font-mono placeholder:font-sans"
                  />
                  {joinLink && (
                    <button onClick={() => setJoinLink("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" className="gap-1.5"
                  onClick={() => { if (joinLink.trim()) window.open(joinLink.trim(), "_blank"); else toast.error("Paste a meeting link first"); }}
                  disabled={!joinLink.trim()}>
                  <ExternalLink className="w-4 h-4" />Join
                </Button>
                <Button className="gap-1.5"
                  onClick={() => { if (joinLink.trim()) window.open(joinLink.trim(), "_blank"); else toast.error("Paste a meeting link first"); }}
                  disabled={!joinLink.trim()}>
                  <Video className="w-4 h-4" />Host
                </Button>
              </div>
            </div>

            {roomInfo && (
              <div className="glass rounded-xl border border-border p-4 space-y-3">
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Radio className="w-3.5 h-3.5 text-green-400" />Current Room
                </h2>
                <div
                  className="flex items-center gap-2 p-2.5 rounded-lg"
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
                >
                  <Link2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span className="text-xs font-mono text-foreground/60 flex-1 truncate">{roomInfo.share_link}</span>
                  <button onClick={() => copyShareLink()} className="text-muted-foreground hover:text-foreground">
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="gap-1.5 flex-1 h-8 text-xs" onClick={() => setShowPopup(true)}>
                    <Eye className="w-3 h-3" />View Details
                  </Button>
                  <Button
                    size="sm" className="gap-1.5 flex-1 h-8 text-xs"
                    onClick={() => handleJoinAsHost()}
                    disabled={daily.isConnecting}
                  >
                    {daily.isConnecting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Video className="w-3 h-3" />}
                    {daily.isConnecting ? "Connecting…" : "Join as Host"}
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT: AI Features + Quick Links */}
          <div className="space-y-4">
            <div className="glass rounded-xl border border-border p-4 space-y-3">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />AI Features
              </h2>
              <div className="space-y-2.5">
                {[
                  { icon: Mic,           label: "Live transcription",  desc: "Both sides captured in real-time",     active: true },
                  { icon: AlertTriangle, label: "Objection detection", desc: "AI flags objections as they happen",    active: true },
                  { icon: Sparkles,      label: "AI coaching",         desc: "Smart tips and talk-ratio tracking",    active: true },
                  { icon: FileText,      label: "Post-call summary",   desc: "Action items + next steps generated",   active: true },
                ].map(({ icon: Icon, label, desc, active }) => (
                  <div key={label} className="flex items-start gap-3">
                    <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5",
                      active ? "bg-green-500/10 border border-green-500/20" : "bg-muted")}>
                      <Icon className={cn("w-3.5 h-3.5", active ? "text-green-400" : "text-muted-foreground")} />
                    </div>
                    <div>
                      <p className="text-xs font-medium">{label}</p>
                      <p className="text-[11px] text-muted-foreground">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="glass rounded-xl border border-border p-4 space-y-3">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5" />Meeting Reminders
              </h2>
              <MeetingNotificationBanner compact onEnabled={() => {}} />
            </div>

            <div className="glass rounded-xl border border-border p-4 space-y-3">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Quick Links</h2>
              <div className="space-y-1">
                {[
                  { label: "All past calls", to: "/calls",     icon: FileText },
                  { label: "Analytics",      to: "/analytics", icon: Sparkles },
                  { label: "Deal rooms",     to: "/deals",     icon: Users    },
                ].map(({ label, to, icon: Icon }) => (
                  <Link key={to} to={to}
                    className="flex items-center justify-between px-3 py-2 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors">
                    <span className="flex items-center gap-2"><Icon className="w-3.5 h-3.5" />{label}</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Link>
                ))}
              </div>
            </div>
          </div>

        </div>
      </div>
    </DashboardLayout>
  );
}