/**
 * LiveCall.tsx — Meeting Control OS  (v2 — network-hardened)
 *
 * Fixes applied:
 *  1. Network quality check before HMS join — blocks on "poor", warns on "fair"
 *  2. Exponential-backoff retry on EndpointUnreachable (2003) up to 4 attempts
 *  3. Graceful fallback UI when HMS is persistently unreachable (copy-link mode)
 *  4. Zombie call detection now also fires force-clear automatically on mount
 *  5. HMS join attempt wrapped in a 15-second timeout guard
 */

import DashboardLayout from "@/components/DashboardLayout";
import EnablePushPrompt from "@/components/EnablePushPrompt";
import { NetworkQualityBanner, NetworkQualityDot } from "@/components/NetworkQualityBanner";
import { useNetworkQuality, withRetry } from "@/hooks/useNetworkQuality";
import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  Loader2, Copy, Check, ExternalLink, Calendar, Clock,
  Plus, ChevronRight, Radio, Eye, Link2, Mic,
  Video, VideoOff, PhoneOff, Users, AlertTriangle,
  RefreshCw, Trash2, WifiOff, CheckCircle2,
  X, CalendarPlus, Sparkles, Shield,
  ArrowRight, Hash, Tag, FileText, Zap, Wifi,
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
import { HMSReactiveStore } from "@100mslive/hms-video-store";

// ─── Types ────────────────────────────────────────────────────────────────────
type ClearState = "idle" | "clearing" | "done" | "failed";
type JoinState =
  | "idle"
  | "checking_network"
  | "creating_room"
  | "connecting"         // HMS SDK joining
  | "retrying"           // backoff retry
  | "connected"
  | "failed"             // persistent failure — show fallback
  | "blocked_network";   // network too poor — show guidance

interface HMSRoomInfo {
  room_id: string;
  room_name: string;
  share_link: string;
  mgmt_token: string;
  auth_token?: string;
}

const MEETING_TYPES = [
  { value: "discovery",   label: "Discovery",   emoji: "🔍" },
  { value: "demo",        label: "Demo",        emoji: "🎯" },
  { value: "follow_up",   label: "Follow-up",   emoji: "📞" },
  { value: "negotiation", label: "Negotiation", emoji: "🤝" },
  { value: "onboarding",  label: "Onboarding",  emoji: "🚀" },
  { value: "other",       label: "Other",        emoji: "📋" },
];

// ─── Audio processor ──────────────────────────────────────────────────────────
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

// ─── Hook: HMS room ────────────────────────────────────────────────────────────
function useHMSRoom() {
  const [roomInfo, setRoomInfo] = useState<HMSRoomInfo | null>(null);
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
      return data as HMSRoomInfo;
    } finally {
      setIsCreating(false);
    }
  }, []);

  return { roomInfo, isCreating, createRoom, setRoomInfo };
}

// ─── Hook: audio streaming ─────────────────────────────────────────────────────
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

// ─── Meeting Created Popup ─────────────────────────────────────────────────────
function MeetingCreatedPopup({
  shareLink, callId, meetingTitle,
  onJoinAsHost, onSchedule, onClose,
}: {
  shareLink: string; callId: string; meetingTitle: string;
  onJoinAsHost: () => void; onSchedule: () => void; onClose: () => void;
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
              <p className="font-semibold text-white text-sm">Room ready</p>
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
            <a href={shareLink} target="_blank" rel="noopener noreferrer">
              <button
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-all hover:bg-white/8"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
              >
                <span className="flex items-center gap-2.5 text-white/50"><ExternalLink className="w-4 h-4" />Open in new tab</span>
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

// ─── Schedule Meeting Modal ────────────────────────────────────────────────────
function ScheduleModal({
  prefillLink, prefillTitle, timezone, onSave, onClose,
}: {
  prefillLink?: string; prefillTitle?: string; timezone: string;
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
      const { zonedDateTimeToUtcIso } = await import("@/lib/timezone");
      const scheduled_time = zonedDateTimeToUtcIso(date, time, timezone);
      await onSave({ title: title.trim(), meeting_link: link.trim(), scheduled_time, meeting_type: meetingType, scheduled_timezone: timezone });
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
        style={{ background: "linear-gradient(135deg, #0f1117 0%, #141824 100%)", boxShadow: "0 0 0 1px rgba(99,102,241,0.15), 0 32px 80px rgba(0,0,0,0.6)" }}
      >
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-0.5 bg-gradient-to-r from-transparent via-violet-500 to-transparent" />
        <button onClick={onClose} className="absolute top-4 right-4 text-white/30 hover:text-white/70 transition-colors">
          <X className="w-4 h-4" />
        </button>

        <div className="p-6 space-y-4">
          <div className="flex items-center gap-3 mb-1">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.25)" }}
            >
              <CalendarPlus className="w-4 h-4 text-violet-400" />
            </div>
            <div>
              <p className="font-semibold text-white text-sm">Schedule Meeting</p>
              <p className="text-xs text-white/40">Add it to your Fixsense calendar</p>
            </div>
          </div>

          <div>
            <label className="text-xs text-white/50 font-medium mb-1.5 block">Meeting Title *</label>
            <input
              value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Acme Corp Demo"
              className="w-full px-3.5 py-2.5 rounded-xl text-sm text-white outline-none"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
            />
          </div>

          {!prefillLink && (
            <div>
              <label className="text-xs text-white/50 font-medium mb-1.5 block">Meeting Link (optional)</label>
              <input
                value={link} onChange={(e) => setLink(e.target.value)}
                placeholder="https://fixsense...."
                className="w-full px-3.5 py-2.5 rounded-xl text-sm text-white outline-none font-mono text-xs"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-white/50 font-medium mb-1.5 block">Date *</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl text-sm text-white outline-none"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", colorScheme: "dark" }}
              />
            </div>
            <div>
              <label className="text-xs text-white/50 font-medium mb-1.5 block">Time *</label>
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl text-sm text-white outline-none"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", colorScheme: "dark" }}
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-white/50 font-medium mb-1.5 block flex items-center gap-1">
              <Tag className="w-3 h-3" />Type
            </label>
            <div className="flex flex-wrap gap-1.5">
              {MEETING_TYPES.map((t) => (
                <button key={t.value} onClick={() => setMeetingType(t.value)}
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

          <div
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs"
            style={{ background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.15)" }}
          >
            <span className="text-base">🔔</span>
            <span className="text-white/50">
              You'll be reminded <strong className="text-white/70">60 min</strong> and{" "}
              <strong className="text-white/70">10 min</strong> before this meeting in{" "}
              <strong className="text-white/70">{timezone}</strong>.
            </span>
          </div>

          <button
            onClick={handleSave} disabled={isSaving}
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

// ─── Network-blocked fallback UI ───────────────────────────────────────────────
function NetworkBlockedCard({
  shareLink,
  onRetry,
  onDismiss,
}: {
  shareLink: string | null;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    if (!shareLink) return;
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
      className="rounded-2xl border p-5 space-y-4"
      style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.2)" }}
    >
      <div className="flex items-start gap-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.2)" }}
        >
          <WifiOff className="w-5 h-5 text-red-400" />
        </div>
        <div>
          <p className="text-sm font-semibold text-red-400">Can't connect to meeting server</p>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            The 100ms video server is unreachable from your device. This usually means your internet
            connection is too slow or unstable for live video. The room was created — share the link
            with your prospect and ask them to start the call while you switch to a better connection.
          </p>
        </div>
      </div>

      {shareLink && (
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
            {copied ? "Copied!" : "Copy link"}
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" className="gap-2" onClick={onRetry}>
          <RefreshCw className="w-3.5 h-3.5" />Try Again
        </Button>
        <Button variant="outline" className="gap-2 text-muted-foreground" onClick={onDismiss}>
          <X className="w-3.5 h-3.5" />Dismiss
        </Button>
      </div>

      <div className="text-[11px] text-muted-foreground/50 space-y-1">
        <p>💡 <strong className="text-muted-foreground/70">Switch to Wi-Fi</strong> or move to an area with stronger cellular signal.</p>
        <p>💡 Your prospect can still join the room using the link above.</p>
      </div>
    </div>
  );
}

// ─── Zombie Banner ─────────────────────────────────────────────────────────────
function ZombieBanner({ callId, onCleared }: { callId: string | null | undefined; onCleared: () => void }) {
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

  // Auto-clear on mount after 800ms
  useEffect(() => {
    const t = setTimeout(() => doClear(), 800);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Second auto-retry on first failure
  useEffect(() => {
    if (clearState === "failed" && attempt === 1) {
      const t = setTimeout(() => doClear(), 3000);
      return () => clearTimeout(t);
    }
  }, [clearState, attempt, doClear]);

  return (
    <div
      className={cn(
        "rounded-xl border p-4",
        clearState === "done"    ? "border-green-500/30 bg-green-500/5"
        : clearState === "failed" ? "border-red-500/30 bg-red-500/5"
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
            clearState === "done"    ? "text-green-400"
            : clearState === "failed" ? "text-red-400"
            : "text-yellow-400",
          )}>
            {clearState === "idle"     && "Previous session didn't complete"}
            {clearState === "clearing" && "Clearing previous session…"}
            {clearState === "done"     && "Cleared — ready to start!"}
            {clearState === "failed"   && "Auto-clear failed — retrying…"}
          </p>
        </div>
        {(clearState === "idle" || clearState === "failed") && (
          <div className="flex gap-2">
            <Button
              size="sm" variant="outline"
              className={cn("gap-1.5 h-8 text-xs", clearState === "failed" ? "border-red-500/30 text-red-400" : "border-yellow-500/30 text-yellow-400")}
              onClick={doClear}
              disabled={clearState === "clearing"}
            >
              <RefreshCw className="w-3 h-3" /> Clear & Retry
            </Button>
            {clearState === "failed" && (
              <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs border-red-500/30 text-red-400" onClick={() => window.location.reload()}>
                <Trash2 className="w-3 h-3" /> Reload
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Retry status banner ────────────────────────────────────────────────────────
function RetryBanner({ attempt, maxAttempts, delayMs }: { attempt: number; maxAttempts: number; delayMs: number }) {
  return (
    <div
      className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 px-4 py-3 flex items-center gap-3"
    >
      <Loader2 className="w-4 h-4 text-indigo-400 animate-spin shrink-0" />
      <div className="flex-1">
        <p className="text-sm font-medium text-indigo-300">
          Reconnecting… (attempt {attempt} of {maxAttempts})
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Retrying in {(delayMs / 1000).toFixed(1)}s — weak connections sometimes need a moment.
        </p>
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

  const { roomInfo, isCreating, createRoom, setRoomInfo } = useHMSRoom();
  const { chunksSent, isStreaming, startPeerAudio, stopAll } = useHMSAudioStreaming(callId ?? null);
  const { create: createMeeting, upcoming: upcomingMeetings } = useScheduledMeetings();

  // Timezone
  const [userTz, setUserTz] = useState<string>(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; }
  });
  useEffect(() => {
    let cancelled = false;
    let unsub: (() => void) | null = null;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const { getUserTimezone, subscribeUserTimezone } = await import("@/lib/timezone");
      const tz = await getUserTimezone(user.id);
      if (!cancelled) setUserTz(tz);
      unsub = subscribeUserTimezone((next) => { if (!cancelled) setUserTz(next); });
    })();
    return () => { cancelled = true; unsub?.(); };
  }, []);

  // Due-time notifier
  const notifiedDueRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const { playNotificationSound } = await import("@/lib/notificationSound");
      const { formatInTimezone } = await import("@/lib/timezone");
      const now = Date.now();
      for (const m of upcomingMeetings) {
        if (cancelled || notifiedDueRef.current.has(m.id)) continue;
        const start = new Date(m.scheduled_time).getTime();
        if (Number.isNaN(start)) continue;
        const diffSec = (start - now) / 1000;
        if (diffSec <= 45 && diffSec >= -45) {
          notifiedDueRef.current.add(m.id);
          playNotificationSound();
          const localTime = formatInTimezone(m.scheduled_time, userTz, { hour: "numeric", minute: "2-digit", timeZoneName: "short" });
          toast.success(`Meeting starting now: ${m.title}`, {
            description: m.meeting_link ? `Scheduled for ${localTime} — click to join` : `Scheduled for ${localTime}`,
            position: "bottom-right", duration: 10000,
            action: m.meeting_link ? { label: "Join", onClick: () => window.open(m.meeting_link!, "_blank") } : undefined,
          });
        }
      }
    };
    check();
    const id = setInterval(check, 20_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [upcomingMeetings, userTz]);

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
  const [meetingType, setMeetingType] = useState("discovery");
  const [meetingTitleInput, setMeetingTitleInput] = useState("");
  const [meetingNotes, setMeetingNotes] = useState("");

  // New: join state machine
  const [joinState, setJoinState] = useState<JoinState>("idle");
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [retryDelay, setRetryDelay] = useState(0);
  const [networkWarningDismissed, setNetworkWarningDismissed] = useState(false);

  const hmsActionsRef = useRef<any>(null);
  const hmsStoreRef = useRef<any>(null);
  const hmsManagerRef = useRef<HMSReactiveStore | null>(null);
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
      toast.error(teamUsage.isTeamPlan ? "Team minute pool exhausted." : "Monthly limit reached. Upgrade to continue.");
      return false;
    }
    return true;
  }, [teamUsage]);

  // ── HMS join with timeout ──────────────────────────────────────────────────
  const joinWithTimeout = useCallback(async (authToken: string, userName: string, timeoutMs = 15_000) => {
    const hms = new HMSReactiveStore();
    hmsManagerRef.current = hms;
    const actions = hms.getHMSActions();
    const store = hms.getStore();

    await Promise.race([
      actions.join({
        userName,
        authToken,
        settings: { isAudioMuted: false, isVideoMuted: false },
        rememberDeviceSelection: true,
        captureNetworkQualityInPreview: false,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(Object.assign(new Error("Connection timed out after 15s"), { name: "EndpointUnreachable", code: 2003 })), timeoutMs),
      ),
    ]);

    return { actions, store };
  }, []);

  const leaveHMS = useCallback(async () => {
    try { await hmsManagerRef.current?.getHMSActions().leave(); } catch {}
    hmsManagerRef.current = null;
  }, []);

  // ── Join as host — with network check + retry ──────────────────────────────
  const handleJoinAsHost = useCallback(async (info?: HMSRoomInfo) => {
    const target = info || roomInfo;
    if (!target || !callId) return;
    setShowPopup(false);

    // 1. Network quality check
    setJoinState("checking_network");
    if (!networkInfo.canProceed) {
      setJoinState("blocked_network");
      return;
    }
    if (networkInfo.isWarning && !networkWarningDismissed) {
      // Show warning toast but allow proceeding
      toast.warning(networkInfo.message, { duration: 6000 });
    }

    setJoinState("connecting");

    try {
      const { actions, store } = await withRetry(
        () => joinWithTimeout(target.auth_token || target.mgmt_token, "Host"),
        {
          maxAttempts: 4,
          baseDelayMs: 1500,
          onAttempt: (attempt, delay) => {
            setJoinState("retrying");
            setRetryAttempt(attempt);
            setRetryDelay(delay);
            toast.info(`Connection attempt ${attempt} failed. Retrying in ${(delay / 1000).toFixed(0)}s…`, { id: "hms-retry" });
          },
        },
      );

      hmsActionsRef.current = actions;
      hmsStoreRef.current = store;

      const unsub = store.subscribe((s: any) => {
        const allPeers = Object.values(s.peers || {}) as any[];
        allPeers.forEach((peer: any) => {
          const audioTrackId = peer.audioTrack;
          if (audioTrackId) {
            const trackInfo = s.tracks?.[audioTrackId];
            if (trackInfo?.nativeTrack && !trackInfo._streaming) {
              trackInfo._streaming = true;
              startPeerAudio(peer.id, trackInfo.nativeTrack, peer.isLocal);
            }
          }
        });
      });
      unsubRef.current = unsub;

      setJoinState("connected");
      setHostJoined(true);
      toast.dismiss("hms-retry");
      navigate(`/live/${callId}`);
    } catch (err: any) {
      setJoinState("failed");
      const msg = err?.message || "Unknown error";
      const isNetworkErr = msg.includes("fetch") || msg.includes("Endpoint") || msg.includes("timed out") || err?.code === 2003;
      if (isNetworkErr) {
        toast.error("Could not reach meeting server after 4 attempts. Share the link with your prospect and join when your connection improves.");
      } else {
        toast.error("Failed to join meeting: " + msg);
      }
    }
  }, [roomInfo, callId, networkInfo, networkWarningDismissed, joinWithTimeout, startPeerAudio, navigate]);

  // ── Create meeting ─────────────────────────────────────────────────────────
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
      setJoinState("idle"); // reset any previous failed state
      await createRoom(callRow.id, title, meetingNotes);
      setShowPopup(true);
      toast.success("Room created! Share the link with your prospect.");
    } catch (err: any) {
      if (callRow?.id) {
        await supabase.from("calls").update({ status: "completed", end_time: new Date().toISOString(), duration_minutes: 0 }).eq("id", callRow.id).then(() => {}, () => {});
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

  const handleEndCall = useCallback(async () => {
    stopAll();
    if (unsubRef.current) unsubRef.current();
    try {
      await leaveHMS();
      await endCall.mutateAsync();
      toast.success("Call ended — generating AI summary…");
      setHostJoined(false);
      setActiveMeetingTitle("");
      setJoinState("idle");
      if (callId) navigate(`/calls/${callId}`);
    } catch {
      toast.error("Failed to end call.");
    }
  }, [endCall, callId, navigate, stopAll, leaveHMS]);

  const openScheduleFromPopup = useCallback(() => {
    if (roomInfo) { setSchedulePrefilledLink(roomInfo.share_link); setSchedulePrefilledTitle(activeMeetingTitle); }
    setShowPopup(false);
    setShowScheduleModal(true);
  }, [roomInfo, activeMeetingTitle]);

  const openFreshSchedule = useCallback(() => { setSchedulePrefilledLink(""); setSchedulePrefilledTitle(""); setShowScheduleModal(true); }, []);

  const handleScheduleSave = useCallback(async (params: { title: string; meeting_link: string; scheduled_time: string; meeting_type: string; scheduled_timezone: string }) => {
    await createMeeting.mutateAsync({ title: params.title, meeting_link: params.meeting_link || undefined, scheduled_time: params.scheduled_time, meeting_type: params.meeting_type, scheduled_timezone: params.scheduled_timezone });
  }, [createMeeting]);

  const hasActiveSession = isLive && !!callId && !isZombie;

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
          shareLink={roomInfo.share_link} callId={callId} meetingTitle={activeMeetingTitle}
          onJoinAsHost={() => handleJoinAsHost()} onSchedule={openScheduleFromPopup} onClose={() => setShowPopup(false)}
        />
      )}
      {showScheduleModal && (
        <ScheduleModal
          prefillLink={schedulePrefilledLink} prefillTitle={schedulePrefilledTitle}
          timezone={userTz} onSave={handleScheduleSave} onClose={() => setShowScheduleModal(false)}
        />
      )}

      <div className="space-y-5 pb-10">
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold font-display">Live Call</h1>
            <p className="text-sm text-muted-foreground">
              Meeting control center — create, join, schedule, and manage calls
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Network quality indicator */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs border border-border bg-secondary/40">
              <Wifi className={cn("w-3.5 h-3.5", networkInfo.quality === "good" ? "text-emerald-400" : networkInfo.quality === "fair" ? "text-amber-400" : networkInfo.quality === "poor" ? "text-red-400" : "text-muted-foreground")} />
              <span className="text-muted-foreground capitalize">{networkInfo.effectiveType ?? networkInfo.quality}</span>
              {networkInfo.downlink !== null && <span className="text-muted-foreground/50">{networkInfo.downlink.toFixed(1)} Mbps</span>}
            </div>
            <NotificationStatusPill />
          </div>
        </div>

        {/* ── Network warning (non-blocking) ─────────────────────────────── */}
        {networkInfo.quality === "fair" && !networkWarningDismissed && (
          <NetworkQualityBanner
            info={networkInfo}
            onDismiss={() => setNetworkWarningDismissed(true)}
            onRetry={() => networkInfo.refresh()}
          />
        )}

        <MeetingNotificationBanner onEnabled={() => toast.success("You'll now receive meeting reminders!")} />
        <TeamUsageBanner onUpgrade={() => navigate("/billing")} />
        {isZombie && <ZombieBanner callId={callId} onCleared={handleZombieCleared} />}

        {/* ── Retry status ────────────────────────────────────────────────── */}
        {joinState === "retrying" && (
          <RetryBanner attempt={retryAttempt} maxAttempts={4} delayMs={retryDelay} />
        )}

        {/* ── Network blocked ─────────────────────────────────────────────── */}
        {joinState === "blocked_network" && (
          <NetworkQualityBanner
            info={networkInfo}
            onRetry={() => { setJoinState("idle"); networkInfo.refresh(); }}
          />
        )}

        {/* ── Persistent HMS failure fallback ─────────────────────────────── */}
        {joinState === "failed" && (
          <NetworkBlockedCard
            shareLink={roomInfo?.share_link ?? null}
            onRetry={() => { setJoinState("idle"); handleJoinAsHost(); }}
            onDismiss={() => setJoinState("idle")}
          />
        )}

        {/* ── Active call banner ───────────────────────────────────────────── */}
        {hasActiveSession && hostJoined && (
          <div className="rounded-xl border border-green-500/25 bg-green-500/5 p-4 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <span className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse" />
              <div>
                <p className="font-semibold text-sm text-green-400">{activeMeetingTitle || "Meeting"} · In progress</p>
                <p className="text-xs text-muted-foreground">{isStreaming ? `AI transcribing · ${chunksSent} chunks` : "Waiting for audio…"}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={async () => { if (hmsActionsRef.current) { await hmsActionsRef.current.setLocalAudioEnabled(!isAudioOn); setIsAudioOn((v) => !v); } }}
                className={cn("flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors", isAudioOn ? "border-border bg-secondary/60" : "border-red-500/30 bg-red-500/15 text-red-400")}
              >
                <Mic className="w-3.5 h-3.5" />{isAudioOn ? "Mute" : "Unmute"}
              </button>
              <button
                onClick={async () => { if (hmsActionsRef.current) { await hmsActionsRef.current.setLocalVideoEnabled(!isVideoOn); setIsVideoOn((v) => !v); } }}
                className={cn("flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors", isVideoOn ? "border-border bg-secondary/60" : "border-red-500/30 bg-red-500/15 text-red-400")}
              >
                {isVideoOn ? <Video className="w-3.5 h-3.5" /> : <VideoOff className="w-3.5 h-3.5" />}
                {isVideoOn ? "Stop Video" : "Start Video"}
              </button>
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

        {/* ── Room created but not joined ──────────────────────────────────── */}
        {roomInfo && !hostJoined && joinState !== "failed" && joinState !== "blocked_network" && (
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
                disabled={joinState === "connecting" || joinState === "retrying"}
              >
                {(joinState === "connecting" || joinState === "retrying")
                  ? <Loader2 className="w-3 h-3 animate-spin" />
                  : <Video className="w-3 h-3" />}
                {joinState === "connecting" ? "Connecting…"
                  : joinState === "retrying" ? `Retry ${retryAttempt}/4…`
                  : "Join as Host"}
              </Button>
            </div>
          </div>
        )}

        {/* ── 3-column layout ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* LEFT: Meeting Controls */}
          <div className="space-y-4">
            <div className="glass rounded-xl border border-border p-4 space-y-4">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5" />Create Meeting
              </h2>

              {/* Network quality indicator inline */}
              {networkInfo.quality !== "good" && networkInfo.quality !== "unknown" && (
                <NetworkQualityBanner info={networkInfo} compact onRetry={() => networkInfo.refresh()} />
              )}

              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Title</label>
                <div className="relative">
                  <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <input
                    value={meetingTitleInput} onChange={(e) => setMeetingTitleInput(e.target.value)}
                    placeholder="e.g. Acme Corp — Demo"
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl text-sm bg-secondary/60 border border-border focus:border-primary/60 outline-none transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block flex items-center gap-1">
                  <Tag className="w-3 h-3" />Type
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {MEETING_TYPES.map((t) => (
                    <button
                      key={t.value} onClick={() => setMeetingType(t.value)}
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

              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Notes (optional)</label>
                <textarea
                  value={meetingNotes} onChange={(e) => setMeetingNotes(e.target.value)}
                  rows={2} placeholder="Agenda, context…"
                  className="w-full px-3.5 py-2 rounded-xl text-sm bg-secondary/60 border border-border focus:border-primary/60 outline-none resize-none transition-colors placeholder:text-muted-foreground/50"
                />
              </div>

              <Button
                className="w-full gap-2" onClick={handleCreateMeeting}
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

          {/* CENTER: Join / Host via Link */}
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
                    value={joinLink} onChange={(e) => setJoinLink(e.target.value)}
                    placeholder="https://fixsense.com.ng/room/..."
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl text-sm bg-secondary/60 border border-border focus:border-primary/60 outline-none transition-colors font-mono placeholder:font-sans placeholder:text-muted-foreground/50"
                  />
                  {joinLink && (
                    <button onClick={() => setJoinLink("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" className="gap-1.5" onClick={() => { if (joinLink.trim()) window.open(joinLink.trim(), "_blank"); else toast.error("Please paste a meeting link"); }} disabled={!joinLink.trim()}>
                  <ExternalLink className="w-4 h-4" />Join Meeting
                </Button>
                <Button className="gap-1.5" onClick={() => { if (joinLink.trim()) window.open(joinLink.trim(), "_blank"); else toast.error("Please paste a meeting link"); }} disabled={!joinLink.trim()}>
                  <Video className="w-4 h-4" />Host Meeting
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
                  <button onClick={() => { navigator.clipboard.writeText(roomInfo.share_link); toast.success("Copied!"); }} className="text-muted-foreground hover:text-foreground">
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
                    disabled={joinState === "connecting" || joinState === "retrying"}
                  >
                    {(joinState === "connecting" || joinState === "retrying") ? <Loader2 className="w-3 h-3 animate-spin" /> : <Video className="w-3 h-3" />}
                    {joinState === "connecting" ? "Connecting…" : joinState === "retrying" ? `Retry ${retryAttempt}/4…` : "Join as Host"}
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
                    <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5", active ? "bg-green-500/10 border border-green-500/20" : "bg-muted")}>
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
              <div className="space-y-1.5">
                {[
                  { icon: "⏰", label: "60 min before", desc: "Time to prepare" },
                  { icon: "🔔", label: "10 min before", desc: "Get ready" },
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

            <div className="glass rounded-xl border border-border p-4 space-y-3">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Hash className="w-3.5 h-3.5" />Quick Links
              </h2>
              <div className="space-y-1">
                {[
                  { label: "All past calls", to: "/calls",     icon: FileText },
                  { label: "Analytics",      to: "/analytics", icon: Sparkles },
                  { label: "Deal rooms",     to: "/deals",     icon: Users    },
                ].map(({ label, to, icon: Icon }) => (
                  <Link
                    key={to} to={to}
                    className="flex items-center justify-between px-3 py-2 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors"
                  >
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