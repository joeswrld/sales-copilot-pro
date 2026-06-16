
/**
 * LiveCall.tsx — Meeting Control OS  (v6 — Real-time network, smart host/guest, live room status)
 *
 * New in v6:
 *  1. REAL-TIME NETWORK DETECTOR — no refresh required.
 *     Uses Network Information API change events + periodic polling + online/offline events.
 *     Updates instantly when the user's network changes.
 *  2. SMART HOST/GUEST LINK DETECTION — when a meeting link is pasted:
 *     - Calls get-guest-room-info edge function with the user's auth token.
 *     - If the room belongs to the user → "Join as Host" button.
 *     - If it belongs to someone else or is external → "Join as Guest" button.
 *  3. REAL-TIME ROOM STATUS — room state in the "Room ready" banner updates live
 *     via Supabase Realtime (no polling needed).
 *
 * v5 fixes (retained):
 *  - "Delete Room" button + expMinutes 1440 (24h).
 *  - RoomInfo rehydration from calls row on load.
 */

import DashboardLayout from "@/components/DashboardLayout";
import EnablePushPrompt from "@/components/EnablePushPrompt";
import { NetworkQualityBanner } from "@/components/NetworkQualityBanner";
import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  Loader2, Copy, Check, ExternalLink, Calendar,
  Plus, ChevronRight, Radio, Eye, Link2, Mic,
  Video, VideoOff, PhoneOff, Users, AlertTriangle,
  RefreshCw, WifiOff, CheckCircle2,
  X, CalendarPlus, Sparkles, Shield,
  ArrowRight, Tag, FileText, Zap, Wifi,
  Trash2, UserCheck, Globe,
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
import { useNetworkQuality } from "@/hooks/useNetworkQuality";

// ─── Types ────────────────────────────────────────────────────────────────────

type JoinState =
  | "idle"
  | "checking_network"
  | "creating_room"
  | "connecting"
  | "connected"
  | "failed";

interface LinkCheckResult {
  loading: boolean;
  isOwner: boolean | null;
  isExternal: boolean;
  roomName: string | null;
  callId: string | null;
  shareLink: string | null;
  roomUrl: string | null;
  callName: string | null;
  isDeleted: boolean;
  isExpired: boolean;
}

const MEETING_TYPES = [
  { value: "discovery",   label: "Discovery",   emoji: "🔍" },
  { value: "demo",        label: "Demo",        emoji: "🎯" },
  { value: "follow_up",   label: "Follow-up",   emoji: "📞" },
  { value: "negotiation", label: "Negotiation", emoji: "🤝" },
  { value: "onboarding",  label: "Onboarding",  emoji: "🚀" },
  { value: "other",       label: "Other",       emoji: "📋" },
];

// ─── Real-Time Network Quality Hook ──────────────────────────────────────────
// Wraps useNetworkQuality but adds polling + immediate refresh capability
// so the UI stays live without any page refresh.
function useRealtimeNetwork() {
  const base = useNetworkQuality();
  const [quality, setQuality] = useState(base);
  const pollRef = useRef<number>();

  const refresh = useCallback(() => {
    // Force re-evaluate by calling base.refresh and then reading from navigator
    base.refresh();
  }, [base]);

  // Poll every 8 seconds so "offline recovery" is detected fast even on browsers
  // that don't emit the Network Information API change event (e.g. Firefox).
  useEffect(() => {
    pollRef.current = window.setInterval(() => {
      base.refresh();
    }, 8_000);
    return () => clearInterval(pollRef.current);
  }, [base]);

  // Sync base → local state whenever it changes
  useEffect(() => {
    setQuality({ ...base });
  }, [
    base.quality,
    base.downlink,
    base.rtt,
    base.effectiveType,
    base.type,
    base.isWarning,
    base.canProceed,
    base.message,
  ]);

  return { ...quality, refresh };
}

// ─── Smart Link Checker ───────────────────────────────────────────────────────
// Extracts room name from a link/room-name string and checks ownership.
function extractRoomName(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    if (u.hostname.endsWith(".daily.co")) {
      const parts = u.pathname.split("/").filter(Boolean);
      if (parts.length > 0) return parts[parts.length - 1];
    }
    // Also handle /join/<room> links from our app
    if (u.pathname.startsWith("/join/")) {
      const room = u.pathname.replace("/join/", "").split("/")[0];
      if (room) return room;
    }
  } catch { /* not a URL */ }
  if (/^[a-zA-Z0-9_-]{3,80}$/.test(trimmed)) return trimmed;
  return null;
}

async function checkLinkOwnership(link: string): Promise<Partial<LinkCheckResult>> {
  const roomName = extractRoomName(link);
  if (!roomName) return { loading: false, isOwner: null, roomName: null };

  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/get-guest-room-info`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": anonKey,
        ...(token ? { "Authorization": `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ room_name: roomName }),
    });
    const data = await res.json();
    return {
      loading: false,
      isOwner: data.is_owner ?? false,
      isExternal: data.is_external ?? false,
      roomName: data.room_name ?? roomName,
      callId: data.call_id ?? null,
      shareLink: data.share_link ?? null,
      roomUrl: data.room_url ?? `https://fixsense.daily.co/${roomName}`,
      callName: data.call_name ?? null,
      isDeleted: data.is_deleted ?? false,
      isExpired: data.is_expired ?? false,
    };
  } catch {
    return { loading: false, isOwner: null, roomName, isExternal: true };
  }
}

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

  // ── Real-time network detector (no refresh needed) ─────────────────────────
  const networkInfo = useRealtimeNetwork();

  const { startCall, endCall, liveCall, isLive, isLoading, callId } = useLiveCall({
    onCallStarted: () => setStatus("on_call"),
    onCallEnded:   () => setStatus("available"),
  });

  const { createRoom, isCreating, roomInfo, setRoomInfo, copyShareLink } = useDailyRoom();

  const [isDeletingRoom, setIsDeletingRoom] = useState(false);

  // ── Real-time room status via Supabase Realtime ────────────────────────────
  // Updates the room banner instantly when the DB row changes (no polling).
  const [realtimeRoomStatus, setRealtimeRoomStatus] = useState<string | null>(null);
  useEffect(() => {
    if (!callId) { setRealtimeRoomStatus(null); return; }
    const channel = supabase
      .channel(`live-room-status:${callId}`)
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "calls",
        filter: `id=eq.${callId}`,
      }, (payload) => {
        const updated = payload.new as any;
        setRealtimeRoomStatus(updated?.status ?? null);
        // If room was deleted server-side, clear roomInfo
        if (updated?.room_deleted_at || updated?.daily_room_expired) {
          setRoomInfo(null);
          toast.info("Room was closed. Create a new meeting to continue.");
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [callId, setRoomInfo]);

  // ── Rehydrate roomInfo from the live `calls` row on load / refresh ─────────
  useEffect(() => {
    if (!roomInfo && liveCall && (liveCall as any).daily_room_name) {
      setRoomInfo({
        room_name:     (liveCall as any).daily_room_name,
        room_url:      (liveCall as any).daily_room_url ?? `https://fixsense.daily.co/${(liveCall as any).daily_room_name}`,
        share_link:    (liveCall as any).meeting_url ?? `${window.location.origin}/join/${(liveCall as any).daily_room_name}`,
        meeting_token: null,
        expires_at:    new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        mgmt_token:    null,
        auth_token:    null,
      });
    }
  }, [liveCall, roomInfo, setRoomInfo]);

  // Daily call hook
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

  // Audio streaming
  const audioStreaming = useAudioStreaming({ callId: callId ?? null });

  const { create: createMeeting, upcoming: upcomingMeetings } = useScheduledMeetings();

  const [userTz] = useState<string>(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; }
  });

  const [showPopup,              setShowPopup]              = useState(false);
  const [showScheduleModal,      setShowScheduleModal]      = useState(false);
  const [schedulePrefilledLink,  setSchedulePrefilledLink]  = useState("");
  const [schedulePrefilledTitle, setSchedulePrefilledTitle] = useState("");
  const [isStarting,             setIsStarting]             = useState(false);
  const [hostJoined,             setHostJoined]             = useState(false);
  const [activeMeetingTitle,     setActiveMeetingTitle]     = useState("");
  const [meetingType,            setMeetingType]            = useState("discovery");
  const [meetingTitleInput,      setMeetingTitleInput]      = useState("");
  const [meetingNotes,           setMeetingNotes]           = useState("");
  const [joinState,              setJoinState]              = useState<JoinState>("idle");
  const [networkWarningDismissed, setNetworkWarningDismissed] = useState(false);
  const [isAudioOn,              setIsAudioOn]              = useState(true);
  const [isVideoOn,              setIsVideoOn]              = useState(true);

  // ── Smart link state ─────────────────────────────────────────────────────
  const [joinLink, setJoinLink] = useState("");
  const [linkCheck, setLinkCheck] = useState<LinkCheckResult>({
    loading: false,
    isOwner: null,
    isExternal: false,
    roomName: null,
    callId: null,
    shareLink: null,
    roomUrl: null,
    callName: null,
    isDeleted: false,
    isExpired: false,
  });
  const linkCheckTimerRef = useRef<number>();

  // Debounce link check — fires 600ms after user stops typing
  useEffect(() => {
    clearTimeout(linkCheckTimerRef.current);
    const roomName = extractRoomName(joinLink);
    if (!roomName) {
      setLinkCheck(prev => ({ ...prev, loading: false, isOwner: null, roomName: null }));
      return;
    }
    setLinkCheck(prev => ({ ...prev, loading: true }));
    linkCheckTimerRef.current = window.setTimeout(async () => {
      const result = await checkLinkOwnership(joinLink);
      setLinkCheck(prev => ({ ...prev, ...result, loading: false }));
    }, 600);
    return () => clearTimeout(linkCheckTimerRef.current);
  }, [joinLink]);

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

  // ── Delete room ────────────────────────────────────────────────────────────
  const handleDeleteRoom = useCallback(async () => {
    if (!callId || isDeletingRoom) return;
    setIsDeletingRoom(true);
    try {
      const { error } = await supabase.functions.invoke("manage-daily-room", {
        body: {
          action:    "delete",
          call_id:   callId,
          room_name: roomInfo?.room_name,
        },
      });
      if (error) throw error;
      setRoomInfo(null);
      toast.success("Room deleted — create a new meeting when ready.");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to delete room. Try again.");
    } finally {
      setIsDeletingRoom(false);
    }
  }, [callId, roomInfo, setRoomInfo, isDeletingRoom]);

  // ── Join as host ───────────────────────────────────────────────────────────
  const handleJoinAsHost = useCallback(async (info?: typeof roomInfo) => {
    const target = info || roomInfo;
    if (!target || !callId) return;
    setShowPopup(false);

    if (networkInfo.isWarning && !networkWarningDismissed) {
      toast.warning(networkInfo.message, { duration: 6000 });
    }

    setJoinState("connecting");
    const success = await daily.joinCall({
      rName:       target.room_name,
      token:       target.meeting_token ?? undefined,
      displayName: "Host",
    });

    if (!success) {
      setJoinState("failed");
    } else {
      navigate(`/live/${callId}`);
    }
  }, [roomInfo, callId, networkInfo, networkWarningDismissed, daily, navigate]);

  // ── Join external / guest link ─────────────────────────────────────────────
  const handleJoinLinkAsHost = useCallback(async () => {
    if (!linkCheck.roomName) return;
    if (linkCheck.isOwner && linkCheck.callId) {
      // Reconnect to own room via Daily
      setJoinState("connecting");
      const success = await daily.joinCall({
        rName: linkCheck.roomName,
        displayName: "Host",
      });
      if (success) navigate(`/live/${linkCheck.callId}`);
      else setJoinState("failed");
    } else {
      // Open external link in new tab
      const url = linkCheck.roomUrl ?? `https://fixsense.daily.co/${linkCheck.roomName}`;
      window.open(url, "_blank", "noopener");
    }
  }, [linkCheck, daily, navigate]);

  const handleJoinLinkAsGuest = useCallback(() => {
    const url = linkCheck.roomUrl ?? (linkCheck.roomName ? `https://fixsense.daily.co/${linkCheck.roomName}` : null);
    if (url) window.open(url, "_blank", "noopener");
    else toast.error("No valid room URL found.");
  }, [linkCheck]);

  // ── Create meeting ─────────────────────────────────────────────────────────
  const handleCreateMeeting = useCallback(async () => {
    const title = meetingTitleInput.trim() || "Fixsense Meeting";
    if (!checkLimit()) return;

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
        platform:     "daily",
        name:         title,
        meeting_type: meetingType,
        participants: [],
        description:  meetingNotes,
      } as any);
      setJoinState("creating_room");
      await createRoom({
        callId:     callRow.id,
        title,
        meetingType,
        expMinutes: 1440, // 24h
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

  // Network quality color helper
  const netColor = networkInfo.quality === "good" ? "text-emerald-400"
    : networkInfo.quality === "fair" ? "text-amber-400"
    : networkInfo.quality === "poor" ? "text-red-400"
    : "text-muted-foreground";

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
            {/* Real-time network pill — updates without refresh */}
            <div className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs border border-border bg-secondary/40 transition-all duration-300",
              networkInfo.quality === "poor" && "border-red-500/30 bg-red-500/5",
              networkInfo.quality === "fair" && "border-amber-500/30 bg-amber-500/5",
            )}>
              <Wifi className={cn("w-3.5 h-3.5 transition-colors duration-300", netColor)} />
              <span className={cn("transition-colors duration-300", netColor)}>
                {networkInfo.effectiveType ?? networkInfo.quality}
              </span>
              {networkInfo.downlink !== null && (
                <span className="text-muted-foreground/50">{networkInfo.downlink.toFixed(1)} Mbps</span>
              )}
              {/* Live indicator dot — pulses when connected */}
              <div className={cn(
                "w-1.5 h-1.5 rounded-full shrink-0",
                networkInfo.quality === "good" ? "bg-emerald-400" : networkInfo.quality === "fair" ? "bg-amber-400" : "bg-red-400",
              )} style={networkInfo.quality === "good" ? { boxShadow: "0 0 4px rgba(52,211,153,0.8)" } : {}} />
            </div>
            <NotificationStatusPill />
          </div>
        </div>

        {/* Network warning banner — appears/disappears without refresh */}
        {(networkInfo.quality === "fair" || networkInfo.quality === "poor") && !networkWarningDismissed && (
          <NetworkQualityBanner
            info={networkInfo}
            onDismiss={() => setNetworkWarningDismissed(true)}
            onRetry={() => { setNetworkWarningDismissed(false); networkInfo.refresh(); }}
          />
        )}

        {/* Network recovery notice */}
        {networkInfo.quality === "good" && networkWarningDismissed && (
          <div className="rounded-xl border border-green-500/20 bg-green-500/5 px-4 py-2.5 flex items-center gap-2 text-xs text-green-400">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Connection restored — network is good.
            <button onClick={() => setNetworkWarningDismissed(false)} className="ml-auto text-green-400/60 hover:text-green-400">
              <X className="w-3 h-3" />
            </button>
          </div>
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

        {/* Daily SDK network quality while in call */}
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
                onClick={async () => { await daily.setAudioEnabled(!isAudioOn); setIsAudioOn((v) => !v); }}
                className={cn(
                  "flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors",
                  isAudioOn ? "border-border bg-secondary/60" : "border-red-500/30 bg-red-500/15 text-red-400",
                )}
              >
                <Mic className="w-3.5 h-3.5" />{isAudioOn ? "Mute" : "Unmute"}
              </button>
              <button
                onClick={async () => { await daily.setVideoEnabled(!isVideoOn); setIsVideoOn((v) => !v); }}
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

        {/* Room ready banner — with real-time status badge */}
        {roomInfo && !hostJoined && joinState !== "failed" && (
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-4 h-4 text-primary" />
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-primary">Room ready — share the link</p>
                  {/* Real-time status badge */}
                  {realtimeRoomStatus && (
                    <span className={cn(
                      "text-[10px] font-semibold px-1.5 py-0.5 rounded-md uppercase tracking-wide",
                      realtimeRoomStatus === "live"
                        ? "bg-green-500/15 text-green-400"
                        : "bg-secondary text-muted-foreground",
                    )}>
                      {realtimeRoomStatus}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate max-w-xs font-mono">{roomInfo.share_link}</p>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
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
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 h-8 text-xs text-red-400 border-red-500/30 hover:bg-red-500/10 hover:border-red-500/50"
                onClick={handleDeleteRoom}
                disabled={isDeletingRoom}
              >
                {isDeletingRoom ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                {isDeletingRoom ? "Deleting…" : "Delete Room"}
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

              {/* Network quality inline hint (compact, no banner) */}
              {networkInfo.quality !== "good" && networkInfo.quality !== "unknown" && (
                <div className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg text-xs border",
                  networkInfo.quality === "poor"
                    ? "border-red-500/20 bg-red-500/5 text-red-400"
                    : "border-amber-500/20 bg-amber-500/5 text-amber-400",
                )}>
                  <WifiOff className="w-3 h-3 shrink-0" />
                  <span className="leading-tight">{networkInfo.message}</span>
                  <button onClick={() => networkInfo.refresh()} className="ml-auto shrink-0 opacity-60 hover:opacity-100">
                    <RefreshCw className="w-3 h-3" />
                  </button>
                </div>
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

          {/* CENTER: Join via Link — SMART HOST/GUEST */}
          <div className="space-y-4">
            <div className="glass rounded-xl border border-border p-4 space-y-4">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Link2 className="w-3.5 h-3.5" />Join or Host via Link
              </h2>

              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Paste meeting link or room name</label>
                <div className="relative">
                  <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <input
                    value={joinLink}
                    onChange={(e) => setJoinLink(e.target.value)}
                    placeholder="https://fixsense.daily.co/..."
                    className="w-full pl-9 pr-9 py-2.5 rounded-xl text-sm bg-secondary/60 border border-border focus:border-primary/60 outline-none transition-colors font-mono placeholder:font-sans"
                  />
                  {joinLink && (
                    <button onClick={() => setJoinLink("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Link check result display */}
              {joinLink && (
                <div className={cn(
                  "rounded-xl px-3.5 py-3 text-xs border transition-all",
                  linkCheck.loading
                    ? "border-border bg-secondary/30"
                    : linkCheck.isOwner === true
                      ? "border-indigo-500/25 bg-indigo-500/5"
                      : linkCheck.isOwner === false
                        ? "border-violet-500/25 bg-violet-500/5"
                        : "border-border bg-secondary/20",
                )}>
                  {linkCheck.loading ? (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Checking link…
                    </div>
                  ) : !linkCheck.roomName ? (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Unrecognised link format
                    </div>
                  ) : linkCheck.isDeleted ? (
                    <div className="flex items-center gap-2 text-red-400">
                      <X className="w-3.5 h-3.5" />
                      This room has been deleted
                    </div>
                  ) : linkCheck.isExpired ? (
                    <div className="flex items-center gap-2 text-amber-400">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      This room has expired
                    </div>
                  ) : linkCheck.isOwner === true ? (
                    <div className="flex items-center gap-2 text-indigo-400">
                      <UserCheck className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        Your room: <strong>{linkCheck.callName || linkCheck.roomName}</strong> — you'll join as Host
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-violet-400">
                      <Globe className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        {linkCheck.isExternal ? "External room" : "Someone else's room"} — you'll join as Guest
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Smart action buttons */}
              <div className="grid grid-cols-2 gap-2">
                {(!joinLink || linkCheck.isOwner !== false) && (
                  <Button
                    variant={linkCheck.isOwner ? "default" : "outline"}
                    className="gap-1.5"
                    onClick={handleJoinLinkAsHost}
                    disabled={linkCheck.loading || !linkCheck.roomName || linkCheck.isDeleted || linkCheck.isExpired}
                  >
                    {linkCheck.isOwner === true ? (
                      <><UserCheck className="w-4 h-4" />Host</>
                    ) : (
                      <><Video className="w-4 h-4" />Join</>
                    )}
                  </Button>
                )}
                {joinLink && linkCheck.isOwner !== true && (
                  <Button
                    className="gap-1.5 col-span-2"
                    onClick={handleJoinLinkAsGuest}
                    disabled={linkCheck.loading || !linkCheck.roomName || linkCheck.isDeleted || linkCheck.isExpired}
                  >
                    <Globe className="w-4 h-4" />Join as Guest
                  </Button>
                )}
                {!joinLink && (
                  <Button variant="outline" className="gap-1.5" disabled>
                    <Globe className="w-4 h-4" />Join as Guest
                  </Button>
                )}
              </div>
            </div>

            {roomInfo && (
              <div className="glass rounded-xl border border-border p-4 space-y-3">
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Radio className="w-3.5 h-3.5 text-green-400" />Current Room
                  {/* Live status dot — real-time */}
                  <span className="ml-auto flex items-center gap-1 text-[10px] text-green-400 font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                    {realtimeRoomStatus ?? "live"}
                  </span>
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


