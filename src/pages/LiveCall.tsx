/**
 * LiveCall.tsx — Meeting Control OS
 *
 * Flow:
 *  1. User creates meeting → instant popup with link
 *  2. User can copy link, join, schedule, or close
 *  3. Join/host via pasted link
 *  4. Schedule meetings inside Fixsense (no external calendar)
 *  5. Upcoming meetings list with "Start Now" via MeetingTimeline
 *  6. Push notification banner — prompts user to enable meeting reminders
 */

import DashboardLayout from "@/components/DashboardLayout";
import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  Loader2, Copy, Check, ExternalLink, Calendar, Clock,
  Plus, ChevronRight, Radio, Eye, Link2, Mic,
  Video, VideoOff, PhoneOff, Users, AlertTriangle,
  RefreshCw, Trash2, WifiOff, CheckCircle2,
  X, CalendarPlus, Play, Sparkles, Shield,
  ArrowRight, Hash, Tag, FileText, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLiveCall } from "@/hooks/useLiveCall";
import { useTeam } from "@/hooks/useTeam";
import { useUserStatus } from "@/hooks/useUserStatus";
import { useTeamMinuteUsage } from "@/hooks/useTeamMinuteUsage";
import { TeamUsageBanner } from "@/components/TeamMinuteUsageComponents";
import { useScheduledMeetings } from "@/hooks/useScheduledMeetings";
import MeetingTimeline from "@/components/MeetingTimeline";
import { MeetingNotificationBanner, NotificationStatusPill } from "@/components/MeetingNotificationBanner";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, parseISO, isAfter } from "date-fns";

// ─── Types ─────────────────────────────────────────────────────────────────────
declare global { interface Window { HMS: any; } }

type ClearState = "idle" | "clearing" | "done" | "failed";

const MEETING_TYPES = [
  { value: "discovery",   label: "Discovery",   emoji: "🔍" },
  { value: "demo",        label: "Demo",        emoji: "🎯" },
  { value: "follow_up",   label: "Follow-up",   emoji: "📞" },
  { value: "negotiation", label: "Negotiation", emoji: "🤝" },
  { value: "onboarding",  label: "Onboarding",  emoji: "🚀" },
  { value: "other",       label: "Other",        emoji: "📋" },
];

// ─── Audio processor ────────────────────────────────────────────────────────────
class AudioChunkProcessor {
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private intervalId: number | null = null;
  private chunkIndex = 0;

  constructor(
    private stream: MediaStream,
    private onChunk: (blob: Blob, index: number) => void,
    private intervalMs = 3000,
  ) {}

  start() {
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus" : "audio/webm";
    this.mediaRecorder = new MediaRecorder(this.stream, { mimeType });
    this.mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) this.chunks.push(e.data); };
    this.mediaRecorder.onstop = () => {
      if (this.chunks.length > 0) {
        const blob = new Blob([...this.chunks], { type: mimeType });
        this.chunks = [];
        this.onChunk(blob, this.chunkIndex++);
      }
    };
    this.mediaRecorder.start();
    this.intervalId = window.setInterval(() => {
      if (this.mediaRecorder?.state === "recording") {
        this.mediaRecorder.stop();
        this.mediaRecorder.start();
      }
    }, this.intervalMs);
  }

  stop() {
    if (this.intervalId) clearInterval(this.intervalId);
    if (this.mediaRecorder?.state === "recording") this.mediaRecorder.stop();
    this.stream.getTracks().forEach((t) => t.stop());
  }
}

// ─── Hook: HMS room ─────────────────────────────────────────────────────────────
function useHMSRoom() {
  const [roomInfo, setRoomInfo] = useState<{
    room_id: string; room_name: string; share_link: string; mgmt_token: string;
  } | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const createRoom = useCallback(async (callId: string, title: string, description?: string) => {
    setIsCreating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Not authenticated");
      const { data, error } = await supabase.functions.invoke("create-hms-room", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: {
          call_id: callId,
          title,
          description: description || null,
          app_origin: window.location.origin,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setRoomInfo(data);
      return data;
    } finally {
      setIsCreating(false);
    }
  }, []);

  return { roomInfo, isCreating, createRoom, setRoomInfo };
}

// ─── Hook: audio streaming ──────────────────────────────────────────────────────
function useHMSAudioStreaming(callId: string | null) {
  const processorsRef = useRef<Map<string, AudioChunkProcessor>>(new Map());
  const [chunksSent, setChunksSent] = useState(0);
  const [isStreaming, setIsStreaming] = useState(false);

  const sendChunk = useCallback(async (
    blob: Blob, index: number, peerId: string, isLocal: boolean,
  ) => {
    if (!callId || blob.size < 100) return;
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((res, rej) => {
        reader.onloadend = () => res((reader.result as string).split(",")[1] ?? "");
        reader.onerror = rej;
        reader.readAsDataURL(blob);
      });
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      await supabase.functions.invoke("transcribe-stream", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: {
          call_id: callId,
          audio_base64: base64,
          chunk_index: index,
          speaker_id: peerId,
          speaker_label: isLocal ? "You" : "Prospect",
        },
      });
      setChunksSent((n) => n + 1);
    } catch (e) { console.warn("sendChunk error:", e); }
  }, [callId]);

  const startPeerAudio = useCallback((
    peerId: string, track: MediaStreamTrack, isLocal: boolean,
  ) => {
    if (processorsRef.current.has(peerId)) return;
    const stream = new MediaStream([track]);
    const proc = new AudioChunkProcessor(
      stream, (blob, idx) => sendChunk(blob, idx, peerId, isLocal),
    );
    proc.start();
    processorsRef.current.set(peerId, proc);
    setIsStreaming(true);
  }, [sendChunk]);

  const stopAll = useCallback(() => {
    processorsRef.current.forEach((p) => p.stop());
    processorsRef.current.clear();
    setIsStreaming(false);
  }, []);

  return { chunksSent, isStreaming, startPeerAudio, stopAll };
}

// ─── Meeting Created Popup ──────────────────────────────────────────────────────
function MeetingCreatedPopup({
  shareLink,
  callId,
  meetingTitle,
  onJoinAsHost,
  onSchedule,
  onClose,
}: {
  shareLink: string;
  callId: string;
  meetingTitle: string;
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}
    >
      <div
        className="relative w-full max-w-md rounded-2xl border border-white/10 overflow-hidden"
        style={{
          background: "linear-gradient(135deg, #0f1117 0%, #141824 50%, #0f1117 100%)",
          boxShadow:
            "0 0 0 1px rgba(99,102,241,0.2), 0 32px 80px rgba(0,0,0,0.6), 0 0 60px rgba(99,102,241,0.08)",
        }}
      >
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-0.5 bg-gradient-to-r from-transparent via-indigo-500 to-transparent" />
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-white/30 hover:text-white/70 transition-colors z-10"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="p-6 space-y-5">
          {/* Header */}
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{
                background: "linear-gradient(135deg, rgba(99,102,241,0.25), rgba(139,92,246,0.15))",
                border: "1px solid rgba(99,102,241,0.3)",
              }}
            >
              <CheckCircle2 className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <p className="font-semibold text-white text-sm">Room ready</p>
              <p className="text-xs text-white/40 mt-0.5 truncate max-w-[240px]">{meetingTitle}</p>
            </div>
          </div>

          {/* Share link */}
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

          {/* Actions */}
          <div className="space-y-2.5">
            <button
              onClick={onJoinAsHost}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-[0.98]"
              style={{
                background: "linear-gradient(135deg, #4f46e5, #7c3aed)",
                boxShadow: "0 4px 20px rgba(99,102,241,0.3)",
              }}
            >
              <span className="flex items-center gap-2.5"><Video className="w-4 h-4" />Join as Host</span>
              <ArrowRight className="w-4 h-4 opacity-60" />
            </button>

            <button
              onClick={onSchedule}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-all hover:bg-white/8"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <span className="flex items-center gap-2.5 text-white/70">
                <CalendarPlus className="w-4 h-4" />Schedule this meeting
              </span>
              <ArrowRight className="w-4 h-4 text-white/30" />
            </button>

            <a href={shareLink} target="_blank" rel="noopener noreferrer">
              <button
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-all hover:bg-white/8"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
              >
                <span className="flex items-center gap-2.5 text-white/50">
                  <ExternalLink className="w-4 h-4" />Open in new tab
                </span>
                <ArrowRight className="w-4 h-4 text-white/20" />
              </button>
            </a>
          </div>

          <p className="text-[11px] text-white/20 flex items-center gap-1.5 justify-center">
            <Shield className="w-3 h-3" />
            No login required for guests · AI transcription active when you join
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Schedule Meeting Modal ─────────────────────────────────────────────────────
function ScheduleModal({
  prefillLink,
  prefillTitle,
  onSave,
  onClose,
}: {
  prefillLink?: string;
  prefillTitle?: string;
  onSave: (params: {
    title: string; meeting_link: string; scheduled_time: string; meeting_type: string;
  }) => Promise<void>;
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
      const scheduled_time = new Date(`${date}T${time}`).toISOString();
      await onSave({ title: title.trim(), meeting_link: link.trim(), scheduled_time, meeting_type: meetingType });
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
        style={{
          background: "linear-gradient(135deg, #0f1117 0%, #141824 100%)",
          boxShadow: "0 0 0 1px rgba(99,102,241,0.15), 0 32px 80px rgba(0,0,0,0.6)",
        }}
      >
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-0.5 bg-gradient-to-r from-transparent via-violet-500 to-transparent" />
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-white/30 hover:text-white/70 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="p-6 space-y-4">
          {/* Header */}
          <div className="flex items-center gap-3 mb-1">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{
                background: "rgba(139,92,246,0.15)",
                border: "1px solid rgba(139,92,246,0.25)",
              }}
            >
              <CalendarPlus className="w-4 h-4 text-violet-400" />
            </div>
            <div>
              <p className="font-semibold text-white text-sm">Schedule Meeting</p>
              <p className="text-xs text-white/40">Add it to your Fixsense calendar</p>
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="text-xs text-white/50 font-medium mb-1.5 block">Meeting Title *</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Acme Corp Demo"
              className="w-full px-3.5 py-2.5 rounded-xl text-sm text-white outline-none transition-colors"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
            />
          </div>

          {!prefillLink && (
            <div>
              <label className="text-xs text-white/50 font-medium mb-1.5 block">Meeting Link (optional)</label>
              <input
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="https://fixsense...."
                className="w-full px-3.5 py-2.5 rounded-xl text-sm text-white outline-none font-mono text-xs"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
              />
            </div>
          )}

          {/* Date / Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-white/50 font-medium mb-1.5 block">Date *</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl text-sm text-white outline-none"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  colorScheme: "dark",
                }}
              />
            </div>
            <div>
              <label className="text-xs text-white/50 font-medium mb-1.5 block">Time *</label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl text-sm text-white outline-none"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  colorScheme: "dark",
                }}
              />
            </div>
          </div>

          {/* Type */}
          <div>
            <label className="text-xs text-white/50 font-medium mb-1.5 block flex items-center gap-1">
              <Tag className="w-3 h-3" />Type
            </label>
            <div className="flex flex-wrap gap-1.5">
              {MEETING_TYPES.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setMeetingType(t.value)}
                  className={cn(
                    "text-xs px-2.5 py-1 rounded-lg border transition-all",
                    meetingType === t.value
                      ? "border-indigo-500/50 bg-indigo-500/15 text-indigo-300"
                      : "border-white/8 bg-white/4 text-white/40 hover:text-white/60",
                  )}
                >
                  {t.emoji} {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Push notification reminder hint */}
          <div
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs"
            style={{
              background: "rgba(99,102,241,0.06)",
              border: "1px solid rgba(99,102,241,0.15)",
            }}
          >
            <span className="text-base">🔔</span>
            <span className="text-white/50">
              You'll be reminded <strong className="text-white/70">60 min</strong> and{" "}
              <strong className="text-white/70">10 min</strong> before this meeting if notifications are enabled.
            </span>
          </div>

          <button
            onClick={handleSave}
            disabled={isSaving}
            className="w-full py-3 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 transition-all hover:opacity-90 disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #4f46e5, #7c3aed)" }}
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarPlus className="w-4 h-4" />}
            {isSaving ? "Scheduling…" : "Schedule Meeting"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Zombie Banner ──────────────────────────────────────────────────────────────
function ZombieBanner({
  callId,
  onCleared,
}: {
  callId: string | null | undefined;
  onCleared: () => void;
}) {
  const [clearState, setClearState] = useState<ClearState>("idle");
  const [attempt, setAttempt] = useState(0);

  const doClear = useCallback(async () => {
    setClearState("clearing");
    let success = false;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = {};
      if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`;
      const { data, error } = await supabase.functions.invoke("force-clear-session", {
        headers,
        body: { call_id: callId ?? null, clear_all: true },
      });
      if (!error && data?.success) success = true;
    } catch {}
    if (!success) {
      try {
        const { error } = await supabase
          .from("calls")
          .update({ status: "completed", end_time: new Date().toISOString(), duration_minutes: 0 })
          .eq("status", "live");
        if (!error) success = true;
      } catch {}
    }
    if (success) {
      setClearState("done");
      toast.success("Previous session cleared!");
      setTimeout(() => onCleared(), 600);
    } else {
      setClearState("failed");
      setAttempt((a) => a + 1);
      toast.error("Could not clear automatically.");
    }
  }, [callId, onCleared]);

  useEffect(() => {
    if (clearState === "failed" && attempt === 1) {
      const t = setTimeout(() => doClear(), 2000);
      return () => clearTimeout(t);
    }
  }, [clearState, attempt, doClear]);

  return (
    <div
      className={cn(
        "rounded-xl border p-4",
        clearState === "done"
          ? "border-green-500/30 bg-green-500/5"
          : clearState === "failed"
            ? "border-red-500/30 bg-red-500/5"
            : "border-yellow-500/30 bg-yellow-500/5",
      )}
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          {clearState === "clearing" && <Loader2 className="w-4 h-4 text-yellow-400 animate-spin" />}
          {clearState === "done"     && <CheckCircle2 className="w-4 h-4 text-green-400" />}
          {clearState === "failed"   && <WifiOff className="w-4 h-4 text-red-400" />}
          {clearState === "idle"     && <AlertTriangle className="w-4 h-4 text-yellow-400" />}
          <p className={cn(
            "text-sm font-semibold",
            clearState === "done"   ? "text-green-400"
            : clearState === "failed" ? "text-red-400"
            : "text-yellow-400",
          )}>
            {clearState === "idle"     && "Previous session didn't complete"}
            {clearState === "clearing" && "Clearing previous session…"}
            {clearState === "done"     && "Cleared — ready to start!"}
            {clearState === "failed"   && "Auto-clear failed"}
          </p>
        </div>
        {(clearState === "idle" || clearState === "failed") && (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className={cn(
                "gap-1.5 h-8 text-xs",
                clearState === "failed"
                  ? "border-red-500/30 text-red-400"
                  : "border-yellow-500/30 text-yellow-400",
              )}
              onClick={doClear}
              disabled={clearState === "clearing"}
            >
              <RefreshCw className="w-3 h-3" /> Clear & Retry
            </Button>
            {clearState === "failed" && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 h-8 text-xs border-red-500/30 text-red-400"
                onClick={() => window.location.reload()}
              >
                <Trash2 className="w-3 h-3" /> Reload
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── MAIN PAGE ──────────────────────────────────────────────────────────────────
export default function LiveCall() {
  const navigate = useNavigate();
  const { team } = useTeam();
  const { setStatus } = useUserStatus(team?.id);
  const { usage: teamUsage } = useTeamMinuteUsage();

  const { startCall, endCall, liveCall, isLive, isLoading, callId } = useLiveCall({
    onCallStarted: () => setStatus("on_call"),
    onCallEnded: () => setStatus("available"),
  });

  const { roomInfo, isCreating, createRoom, setRoomInfo } = useHMSRoom();
  const { chunksSent, isStreaming, startPeerAudio, stopAll } = useHMSAudioStreaming(callId ?? null);
  const { create: createMeeting } = useScheduledMeetings();

  // UI state
  const [showPopup, setShowPopup] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [schedulePrefilledLink, setSchedulePrefilledLink] = useState("");
  const [schedulePrefilledTitle, setSchedulePrefilledTitle] = useState("");
  const [isStarting, setIsStarting] = useState(false);
  const [hostJoined, setHostJoined] = useState(false);
  const [isZombie, setIsZombie] = useState(false);
  const [isAudioOn, setIsAudioOn] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [activeMeetingTitle, setActiveMeetingTitle] = useState("");
  const [joinLink, setJoinLink] = useState("");
  const [isJoining, setIsJoining] = useState(false);
  const [meetingType, setMeetingType] = useState("discovery");
  const [meetingTitleInput, setMeetingTitleInput] = useState("");
  const [meetingNotes, setMeetingNotes] = useState("");

  const hmsActionsRef = useRef<any>(null);
  const hmsStoreRef = useRef<any>(null);
  const unsubRef = useRef<(() => void) | null>(null);

  // Zombie detection
  useEffect(() => {
    if (isLive && liveCall && !(liveCall as any).meeting_url && !roomInfo && !hostJoined) {
      setIsZombie(true);
    } else if (!isLive) {
      setIsZombie(false);
    }
  }, [isLive, liveCall, roomInfo, hostJoined]);

  const handleZombieCleared = useCallback(() => {
    setIsZombie(false);
    setIsStarting(false);
    setHostJoined(false);
  }, []);

  const checkLimit = useCallback(() => {
    if (teamUsage?.isAtLimit) {
      toast.error(
        teamUsage.isTeamPlan
          ? "Team minute pool exhausted."
          : "Monthly limit reached. Upgrade to continue.",
      );
      return false;
    }
    return true;
  }, [teamUsage]);

  const loadHMSSDK = useCallback(async () => {
    if (window.HMS) return window.HMS;
    await new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdn.100ms.live/sdk/v2.9.15/hms.min.js";
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Failed to load 100ms SDK"));
      document.head.appendChild(s);
    });
    return window.HMS;
  }, []);

  // Join as host into HMS room
  const handleJoinAsHost = useCallback(async (
    info?: { room_id: string; room_name: string; share_link: string; mgmt_token: string },
  ) => {
    const target = info || roomInfo;
    if (!target || !callId) return;
    setShowPopup(false);
    try {
      const HMS = await loadHMSSDK();
      hmsActionsRef.current = new HMS.HMSActions();
      hmsStoreRef.current = new HMS.HMSStore();
      const hmsActions = hmsActionsRef.current;

      const unsub = hmsStoreRef.current.subscribe((store: any) => {
        const allPeers = Object.values(store.peers || {}) as any[];
        allPeers.forEach((peer: any) => {
          const audioTrackId = peer.audioTrack;
          if (audioTrackId) {
            const trackInfo = store.tracks?.[audioTrackId];
            if (trackInfo?.nativeTrack && !trackInfo._streaming) {
              trackInfo._streaming = true;
              startPeerAudio(peer.id, trackInfo.nativeTrack, peer.isLocal);
            }
          }
        });
      });
      unsubRef.current = unsub;

      await hmsActions.join({
        userName: "Host",
        authToken: target.mgmt_token,
        settings: { isAudioMuted: false, isVideoMuted: false },
        rememberDeviceSelection: true,
        captureNetworkQualityInPreview: false,
      });

      setHostJoined(true);
      navigate(`/dashboard/live/${callId}`);
    } catch (err: any) {
      toast.error("Failed to join meeting: " + err.message);
    }
  }, [roomInfo, callId, loadHMSSDK, startPeerAudio, navigate]);

  // Create meeting
  const handleCreateMeeting = useCallback(async () => {
    const title = meetingTitleInput.trim() || "Fixsense Meeting";
    if (!checkLimit()) return;
    setIsStarting(true);
    setActiveMeetingTitle(title);
    let callRow: any = null;
    try {
      callRow = await startCall.mutateAsync({
        platform: "100ms",
        name: title,
        meeting_type: meetingType,
        participants: [],
        description: meetingNotes,
      } as any);
      await createRoom(callRow.id, title, meetingNotes);
      setShowPopup(true);
      toast.success("Room created! Share the link with your prospect.");
    } catch (err: any) {
      if (callRow?.id) {
        await supabase
          .from("calls")
          .update({ status: "completed", end_time: new Date().toISOString(), duration_minutes: 0 })
          .eq("id", callRow.id)
          .catch(() => {});
      }
      if (err?.message === "PLAN_LIMIT_REACHED") {
        toast.error("Meeting limit reached. Upgrade to continue.");
      } else {
        toast.error("Could not create meeting room.");
      }
      setActiveMeetingTitle("");
    } finally {
      setIsStarting(false);
    }
  }, [meetingTitleInput, meetingNotes, meetingType, checkLimit, startCall, createRoom]);

  // Join from pasted link
  const handleJoinFromLink = useCallback(async () => {
    const link = joinLink.trim();
    if (!link) { toast.error("Please paste a meeting link"); return; }
    setIsJoining(true);
    try { window.open(link, "_blank"); }
    catch { toast.error("Invalid link"); }
    finally { setIsJoining(false); }
  }, [joinLink]);

  const handleHostFromLink = useCallback(async () => {
    const link = joinLink.trim();
    if (!link) { toast.error("Please paste a meeting link"); return; }
    toast.info("Opening as host in new tab…");
    window.open(link, "_blank");
  }, [joinLink]);

  const handleToggleAudio = useCallback(async () => {
    if (!hmsActionsRef.current) return;
    await hmsActionsRef.current.setLocalAudioEnabled(!isAudioOn);
    setIsAudioOn((v) => !v);
  }, [isAudioOn]);

  const handleToggleVideo = useCallback(async () => {
    if (!hmsActionsRef.current) return;
    await hmsActionsRef.current.setLocalVideoEnabled(!isVideoOn);
    setIsVideoOn((v) => !v);
  }, [isVideoOn]);

  const handleEndCall = useCallback(async () => {
    stopAll();
    if (unsubRef.current) unsubRef.current();
    try {
      if (hmsActionsRef.current) {
        try { await hmsActionsRef.current.leave(); } catch {}
      }
      await endCall.mutateAsync();
      toast.success("Call ended — generating AI summary…");
      setHostJoined(false);
      setActiveMeetingTitle("");
      if (callId) navigate(`/dashboard/calls/${callId}`);
    } catch {
      toast.error("Failed to end call.");
    }
  }, [endCall, callId, navigate, stopAll]);

  const openScheduleFromPopup = useCallback(() => {
    if (roomInfo) {
      setSchedulePrefilledLink(roomInfo.share_link);
      setSchedulePrefilledTitle(activeMeetingTitle);
    }
    setShowPopup(false);
    setShowScheduleModal(true);
  }, [roomInfo, activeMeetingTitle]);

  const openFreshSchedule = useCallback(() => {
    setSchedulePrefilledLink("");
    setSchedulePrefilledTitle("");
    setShowScheduleModal(true);
  }, []);

  const handleScheduleSave = useCallback(async (params: {
    title: string; meeting_link: string; scheduled_time: string; meeting_type: string;
  }) => {
    await createMeeting.mutateAsync({
      title: params.title,
      meeting_link: params.meeting_link || undefined,
      scheduled_time: params.scheduled_time,
      meeting_type: params.meeting_type,
    });
  }, [createMeeting]);

  const hasActiveSession = isLive && !!callId && !isZombie;

  // ── Loading ────────────────────────────────────────────────────────────────
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
      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      {showPopup && roomInfo && callId && (
        <MeetingCreatedPopup
          shareLink={roomInfo.share_link}
          callId={callId}
          meetingTitle={activeMeetingTitle}
          onJoinAsHost={() => handleJoinAsHost()}
          onSchedule={openScheduleFromPopup}
          onClose={() => setShowPopup(false)}
        />
      )}
      {showScheduleModal && (
        <ScheduleModal
          prefillLink={schedulePrefilledLink}
          prefillTitle={schedulePrefilledTitle}
          onSave={handleScheduleSave}
          onClose={() => setShowScheduleModal(false)}
        />
      )}

      <div className="space-y-5 pb-10">
        {/* ── Page header ─────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold font-display">Live Call</h1>
            <p className="text-sm text-muted-foreground">
              Meeting control center — create, join, schedule, and manage calls
            </p>
          </div>
          {/* Notification status pill — top-right of header */}
          <NotificationStatusPill />
        </div>

        {/* ── Push notification banner ─────────────────────────────────────── */}
        <MeetingNotificationBanner
          onEnabled={() => toast.success("You'll now receive meeting reminders!")}
        />

        <TeamUsageBanner onUpgrade={() => navigate("/dashboard/billing")} />

        {isZombie && <ZombieBanner callId={callId} onCleared={handleZombieCleared} />}

        {/* ── Active call banner ──────────────────────────────────────────── */}
        {hasActiveSession && hostJoined && (
          <div className="rounded-xl border border-green-500/25 bg-green-500/5 p-4 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <span className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse" />
              <div>
                <p className="font-semibold text-sm text-green-400">
                  {activeMeetingTitle || "Meeting"} · In progress
                </p>
                <p className="text-xs text-muted-foreground">
                  {isStreaming ? `AI transcribing · ${chunksSent} chunks` : "Waiting for audio…"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={handleToggleAudio}
                className={cn(
                  "flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors",
                  isAudioOn
                    ? "border-border bg-secondary/60"
                    : "border-red-500/30 bg-red-500/15 text-red-400",
                )}
              >
                <Mic className="w-3.5 h-3.5" />
                {isAudioOn ? "Mute" : "Unmute"}
              </button>
              <button
                onClick={handleToggleVideo}
                className={cn(
                  "flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors",
                  isVideoOn
                    ? "border-border bg-secondary/60"
                    : "border-red-500/30 bg-red-500/15 text-red-400",
                )}
              >
                {isVideoOn ? <Video className="w-3.5 h-3.5" /> : <VideoOff className="w-3.5 h-3.5" />}
                {isVideoOn ? "Stop Video" : "Start Video"}
              </button>
              <Link to={`/dashboard/live/${callId}`}>
                <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs">
                  <Eye className="w-3 h-3" />Transcript
                </Button>
              </Link>
              <Button
                size="sm"
                variant="destructive"
                className="gap-1.5 h-8 text-xs"
                onClick={handleEndCall}
                disabled={endCall.isPending}
              >
                {endCall.isPending
                  ? <Loader2 className="w-3 h-3 animate-spin" />
                  : <PhoneOff className="w-3 h-3" />}
                End Call
              </Button>
            </div>
          </div>
        )}

        {/* ── Room created but not yet joined ─────────────────────────────── */}
        {roomInfo && !hostJoined && (
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-4 h-4 text-primary" />
              <div>
                <p className="text-sm font-semibold text-primary">Room ready — share the link</p>
                <p className="text-xs text-muted-foreground truncate max-w-xs font-mono">
                  {roomInfo.share_link}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 h-8 text-xs"
                onClick={() => setShowPopup(true)}
              >
                <Eye className="w-3 h-3" />View Link
              </Button>
              <Button
                size="sm"
                className="gap-1.5 h-8 text-xs"
                onClick={() => handleJoinAsHost()}
              >
                <Video className="w-3 h-3" />Join as Host
              </Button>
            </div>
          </div>
        )}

        {/* ── 3-column layout ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* ── LEFT: Meeting Controls ─────────────────────────────────────── */}
          <div className="space-y-4">
            <div className="glass rounded-xl border border-border p-4 space-y-4">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5" />Create Meeting
              </h2>

              {/* Title */}
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

              {/* Meeting type */}
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block flex items-center gap-1">
                  <Tag className="w-3 h-3" />Type
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {MEETING_TYPES.map((t) => (
                    <button
                      key={t.value}
                      onClick={() => setMeetingType(t.value)}
                      className={cn(
                        "text-[11px] px-2 py-1.5 rounded-lg border transition-all text-center leading-tight",
                        meetingType === t.value
                          ? "border-primary/50 bg-primary/10 text-foreground"
                          : "border-border bg-secondary/30 text-muted-foreground hover:bg-secondary/60",
                      )}
                    >
                      <div>{t.emoji}</div>
                      <div className="mt-0.5">{t.label}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Notes */}
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
                {isCreating || isStarting
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Plus className="w-4 h-4" />}
                {isCreating || isStarting ? "Creating…" : "Create Meeting"}
              </Button>

              <Button variant="outline" className="w-full gap-2" onClick={openFreshSchedule}>
                <CalendarPlus className="w-4 h-4" />Schedule Meeting
              </Button>
            </div>

            {/* Upcoming meetings via MeetingTimeline */}
            <div className="glass rounded-xl border border-border p-4">
              {/* Header row with notification pill */}
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" />Upcoming
                </h2>
                <NotificationStatusPill />
              </div>
              <MeetingTimeline compact maxItems={4} />
            </div>
          </div>

          {/* ── CENTER: Join / Host via Link ───────────────────────────────── */}
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
                    placeholder="https://fixsense.com.ng/room/..."
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl text-sm bg-secondary/60 border border-border focus:border-primary/60 outline-none transition-colors font-mono placeholder:font-sans placeholder:text-muted-foreground/50"
                  />
                  {joinLink && (
                    <button
                      onClick={() => setJoinLink("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  className="gap-1.5"
                  onClick={handleJoinFromLink}
                  disabled={isJoining || !joinLink.trim()}
                >
                  <ExternalLink className="w-4 h-4" />Join Meeting
                </Button>
                <Button
                  className="gap-1.5"
                  onClick={handleHostFromLink}
                  disabled={isJoining || !joinLink.trim()}
                >
                  <Video className="w-4 h-4" />Host Meeting
                </Button>
              </div>

              <div
                className="rounded-lg p-3 space-y-1.5"
                style={{
                  background: "rgba(99,102,241,0.05)",
                  border: "1px solid rgba(99,102,241,0.1)",
                }}
              >
                <p className="text-xs font-medium text-indigo-400/80">How it works</p>
                <ul className="space-y-1">
                  {[
                    "Paste your fixsense meeting link above",
                    "Join as guest or host with full controls",
                    "AI transcription starts automatically",
                  ].map((tip) => (
                    <li key={tip} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="w-1 h-1 rounded-full bg-indigo-400/50 shrink-0" />
                      {tip}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Active session info */}
            {roomInfo && (
              <div className="glass rounded-xl border border-border p-4 space-y-3">
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Radio className="w-3.5 h-3.5 text-green-400" />Current Room
                </h2>
                <div
                  className="flex items-center gap-2 p-2.5 rounded-lg"
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  <Link2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span className="text-xs font-mono text-foreground/60 flex-1 truncate">
                    {roomInfo.share_link}
                  </span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(roomInfo.share_link);
                      toast.success("Copied!");
                    }}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 flex-1 h-8 text-xs"
                    onClick={() => setShowPopup(true)}
                  >
                    <Eye className="w-3 h-3" />View Details
                  </Button>
                  <Button
                    size="sm"
                    className="gap-1.5 flex-1 h-8 text-xs"
                    onClick={() => handleJoinAsHost()}
                  >
                    <Video className="w-3 h-3" />Join as Host
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* ── RIGHT: AI Features + Quick Links ──────────────────────────── */}
          <div className="space-y-4">
            {/* AI Features */}
            <div className="glass rounded-xl border border-border p-4 space-y-3">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />AI Features
              </h2>
              <div className="space-y-2.5">
                {[
                  { icon: Mic,           label: "Live transcription",    desc: "Both sides captured in real-time",            active: true  },
                  { icon: AlertTriangle, label: "Objection detection",   desc: "AI flags objections as they happen",           active: true  },
                  { icon: Sparkles,      label: "AI coaching",           desc: "Smart tips and talk-ratio tracking",           active: true  },
                  { icon: FileText,      label: "Post-call summary",     desc: "Action items + next steps generated",          active: true  },
                ].map(({ icon: Icon, label, desc, active }) => (
                  <div key={label} className="flex items-start gap-3">
                    <div
                      className={cn(
                        "w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5",
                        active ? "bg-green-500/10 border border-green-500/20" : "bg-muted",
                      )}
                    >
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

            {/* Notification status card */}
            <div className="glass rounded-xl border border-border p-4 space-y-3">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5" />Meeting Reminders
              </h2>
              <MeetingNotificationBanner compact onEnabled={() => {}} />
              <div className="space-y-1.5">
                {[
                  { icon: "⏰", label: "60 min before",  desc: "Time to prepare" },
                  { icon: "🔔", label: "10 min before",  desc: "Get ready" },
                  { icon: "🔴", label: "At start time",  desc: "Join now" },
                ].map(({ icon, label, desc }) => (
                  <div key={label} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="w-5 text-center">{icon}</span>
                    <span className="font-medium text-foreground/70">{label}</span>
                    <span className="text-muted-foreground/60">· {desc}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick links */}
            <div className="glass rounded-xl border border-border p-4 space-y-3">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Hash className="w-3.5 h-3.5" />Quick Links
              </h2>
              <div className="space-y-1">
                {[
                  { label: "All past calls", to: "/dashboard/calls",     icon: FileText },
                  { label: "Analytics",      to: "/dashboard/analytics", icon: Sparkles },
                  { label: "Deal rooms",     to: "/dashboard/deals",     icon: Users    },
                ].map(({ label, to, icon: Icon }) => (
                  <Link
                    key={to}
                    to={to}
                    className="flex items-center justify-between px-3 py-2 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <Icon className="w-3.5 h-3.5" />{label}
                    </span>
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