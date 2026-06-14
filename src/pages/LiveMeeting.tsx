/**
 * LiveMeeting.tsx — AI-Powered Meeting Workspace (v3 — Daily.co)
 *
 * Fix: Auto-join was firing before useDailyCall stabilized, or firing multiple
 * times due to unstable deps, causing Daily to receive a malformed join call
 * and throw an empty {} error. Fixed with a joinAttemptedRef guard so join
 * is attempted exactly once when roomName becomes available.
 */

import DashboardLayout from "@/components/DashboardLayout";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Loader2, AlertCircle, Lightbulb, TrendingUp, Clock,
  MessageSquare, Target, Radio,
  Users, ChevronDown, ChevronUp,
  Zap, Mic, MicOff, Video, VideoOff, MonitorPlay, Phone,
  PhoneOff, Settings, Bell, MoreHorizontal, Hash,
  FileText, Paperclip, Star, Send, Smile,
  Check, Plus, X, AlertTriangle, Shield,
  Activity, BrainCircuit, Sparkles,
  Eye, Volume2, VolumeX, Signal, Wifi,
  ArrowRight, Calendar, Link2, Tag, TrendingDown,
  Brain, FlaskConical, MessageCircle, BookOpen,
  Trophy, Flame, Gauge, CircleDot, WifiOff, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLiveCall } from "@/hooks/useLiveCall";
import { useDailyCall, DailyParticipant, CallQuality } from "@/hooks/useDailyCall";
import { useAudioStreaming } from "@/hooks/useAudioStreaming";
import { useTeam } from "@/hooks/useTeam";
import { useUserStatus } from "@/hooks/useUserStatus";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

// ─── Types ────────────────────────────────────────────────────────────────────

type SidebarTab = "participants" | "chat" | "notes" | "files" | "deals" | "agenda";
type AITab = "transcript" | "insights" | "coaching";

interface AIInsight {
  type: "objection" | "signal" | "coaching" | "competitor" | "sentiment";
  text: string;
  suggestion?: string;
  timestamp: string;
  priority: "high" | "medium" | "low";
}

// ─── Network quality indicator ─────────────────────────────────────────────────

function NetworkDot({ quality }: { quality: CallQuality }) {
  const color =
    quality === "excellent" || quality === "good" ? "#22c55e"
    : quality === "fair" ? "#f59e0b"
    : "#ef4444";
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-2 h-2 rounded-full" style={{ background: color, boxShadow: `0 0 4px ${color}` }} />
      <span className="text-[10px] capitalize" style={{ color }}>{quality}</span>
    </div>
  );
}

// ─── Signal bars ──────────────────────────────────────────────────────────────

function SignalBars({ quality }: { quality?: string }) {
  const strength = quality === "good" || quality === "excellent" ? 4
    : quality === "fair" ? 2
    : quality === "poor" ? 1
    : 3;
  return (
    <div className="flex items-end gap-px h-3">
      {[1, 2, 3, 4].map((bar) => (
        <div key={bar} className={cn("w-1 rounded-sm", bar <= strength ? "bg-emerald-400" : "bg-white/20")}
          style={{ height: `${bar * 3}px` }} />
      ))}
    </div>
  );
}

// ─── Video Tile ───────────────────────────────────────────────────────────────

function VideoTile({ participant, isMain = false, activeSpeakerId }: {
  participant: DailyParticipant;
  isMain?: boolean;
  activeSpeakerId: string | null;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const isSpeaking = participant.session_id === activeSpeakerId;

  useEffect(() => {
    if (videoRef.current && participant.videoTrack) {
      const stream = new MediaStream([participant.videoTrack]);
      videoRef.current.srcObject = stream;
    }
  }, [participant.videoTrack]);

  return (
    <div
      className={cn(
        "relative overflow-hidden border transition-all duration-300",
        isMain ? "rounded-2xl" : "rounded-xl",
        isSpeaking
          ? "border-emerald-400/60 shadow-[0_0_20px_rgba(52,211,153,0.15)]"
          : "border-white/8",
      )}
      style={{ background: "linear-gradient(135deg, #1a1d26 0%, #0f1117 100%)" }}
    >
      {participant.video && participant.videoTrack ? (
        <video
          ref={videoRef}
          autoPlay
          muted={participant.local}
          playsInline
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className={cn(
            "rounded-full flex items-center justify-center font-bold text-white",
            isMain ? "w-16 h-16 text-xl" : "w-10 h-10 text-sm",
            isSpeaking
              ? "bg-gradient-to-br from-emerald-500/40 to-teal-600/40 border-2 border-emerald-400/50"
              : "bg-gradient-to-br from-violet-500/40 to-indigo-600/40 border border-white/10",
          )}>
            {(participant.user_name || "?")[0]?.toUpperCase()}
          </div>
        </div>
      )}

      {isSpeaking && (
        <div className="absolute inset-0 rounded-2xl border-2 border-emerald-400/50 pointer-events-none animate-pulse" />
      )}

      <div
        className="absolute bottom-0 left-0 right-0 p-2.5 flex items-center justify-between"
        style={{ background: "linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 100%)" }}
      >
        <div className="flex items-center gap-2">
          {isSpeaking && (
            <div className="flex items-center gap-0.5">
              {[1, 2, 3].map((i) => (
                <div key={i} className="w-1 bg-emerald-400 rounded-full animate-bounce"
                  style={{ height: `${4 + i * 3}px`, animationDelay: `${i * 100}ms` }} />
              ))}
            </div>
          )}
          <span className="text-xs font-medium text-white/90 truncate">
            {participant.user_name || "Participant"}
            {participant.local && " (You)"}
          </span>
          {participant.local && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/30 text-indigo-300 border border-indigo-500/20">Host</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {!participant.audio && <MicOff className="w-3 h-3 text-red-400" />}
          {!participant.video && <VideoOff className="w-3 h-3 text-orange-400/70" />}
        </div>
      </div>
    </div>
  );
}

// ─── AI Insight Card ──────────────────────────────────────────────────────────

function InsightCard({ insight }: { insight: AIInsight }) {
  const config = {
    objection:  { icon: AlertTriangle, color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20", label: "Objection" },
    signal:     { icon: TrendingUp,   color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20", label: "Buying Signal" },
    coaching:   { icon: Lightbulb,   color: "text-violet-400", bg: "bg-violet-500/10 border-violet-500/20", label: "Coaching" },
    competitor: { icon: Target,       color: "text-sky-400", bg: "bg-sky-500/10 border-sky-500/20", label: "Competitor" },
    sentiment:  { icon: Activity,     color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20", label: "Sentiment" },
  }[insight.type];
  const Icon = config.icon;
  return (
    <div className={cn("rounded-xl p-3 border transition-all", config.bg)}>
      <div className="flex items-start gap-2.5">
        <div className={cn("w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5", config.bg)}>
          <Icon className={cn("w-3.5 h-3.5", config.color)} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className={cn("text-[11px] font-semibold uppercase tracking-wide", config.color)}>{config.label}</span>
            <span className="text-[10px] text-white/25 shrink-0">{insight.timestamp}</span>
          </div>
          <p className="text-xs font-medium text-white/85 mb-1">{insight.text}</p>
          {insight.suggestion && (
            <p className="text-[11px] text-white/45 leading-relaxed">{insight.suggestion}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Control Button ────────────────────────────────────────────────────────────

function ControlBtn({ icon: Icon, label, onClick, active = true, danger = false, badge }: {
  icon: React.FC<any>;
  label: string;
  onClick?: () => void;
  active?: boolean;
  danger?: boolean;
  badge?: number;
}) {
  return (
    <button onClick={onClick}
      className={cn(
        "relative flex flex-col items-center gap-1.5 px-4 py-2.5 rounded-xl transition-all group",
        danger
          ? "bg-red-500/90 hover:bg-red-500 text-white"
          : active
            ? "bg-white/8 hover:bg-white/12 text-white"
            : "bg-red-500/15 border border-red-500/25 text-red-400 hover:bg-red-500/20",
      )}>
      <Icon className="w-5 h-5" />
      <span className="text-[10px] font-medium opacity-70 group-hover:opacity-100">{label}</span>
      {badge != null && badge > 0 && (
        <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-indigo-500 text-white text-[9px] flex items-center justify-center font-bold">
          {badge > 9 ? "9+" : badge}
        </span>
      )}
    </button>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export default function LiveMeeting() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { team } = useTeam();
  const { setStatus } = useUserStatus(team?.id);

  const { liveCall, isLive, isLoading, transcripts, objections, topics, endCall, callId } =
    useLiveCall({ onCallEnded: () => setStatus("available") });

  // Read room details from the live call row
  const roomName = (liveCall as any)?.daily_room_name ?? null;
  const meetingToken = (liveCall as any)?.daily_meeting_token ?? null;

  // Daily call hook — roomName/meetingToken passed directly, no intermediate state
  const daily = useDailyCall({
    callId: callId ?? null,
    roomName,
    meetingToken,
    userName: "Host",
    onJoined: () => {
      setStatus("on_call");
    },
    onLeft: () => {
      // handled by endCall
    },
    onParticipantJoined: (p) => {
      toast.success(`${p.user_name || "Someone"} joined the meeting`);
    },
    onParticipantLeft: () => {
      toast.info("A participant left the meeting");
    },
    onRecordingStarted: () => toast.success("Recording started"),
    onRecordingStopped: () => toast.info("Recording stopped — processing…"),
    onNetworkQualityChange: (q) => {
      if (q === "poor") toast.warning("Weak connection — video quality reduced", { id: "daily-net" });
      else toast.dismiss("daily-net");
    },
  });

  // Audio streaming from Daily tracks
  const audioStreaming = useAudioStreaming({ callId: callId ?? null });

  // Guard: attempt auto-join exactly once when roomName is available
  const joinAttemptedRef = useRef(false);

  useEffect(() => {
    if (
      !roomName ||
      joinAttemptedRef.current ||
      daily.isConnected ||
      daily.isConnecting ||
      daily.callState === "error"
    ) return;

    joinAttemptedRef.current = true;

    daily.joinCall({
      rName: roomName,
      token: meetingToken ?? undefined,
      displayName: "Host",
    }).then((success) => {
      if (!success) {
        // Allow retry
        joinAttemptedRef.current = false;
      }
    });
  // Only re-run when roomName appears for the first time
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomName]);

  // Hook Daily participant audio tracks into the transcription streamer
  const tracksStartedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const p of daily.participants) {
      if (p.audioTrack && !tracksStartedRef.current.has(p.session_id)) {
        tracksStartedRef.current.add(p.session_id);
        audioStreaming.startTrackRecording(p.audioTrack, p.session_id, p.local);
      }
    }
  }, [daily.participants, audioStreaming]);

  // UI state
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("participants");
  const [aiTab, setAiTab] = useState<AITab>("transcript");
  const [isAudioOn, setIsAudioOn] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isAIPanelOpen, setIsAIPanelOpen] = useState(true);
  const [chatInput, setChatInput] = useState("");
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  const meetingType = (liveCall as any)?.meeting_type as string | undefined;

  // Talk ratio from transcripts
  const talkRatio = useMemo(() => {
    if (!transcripts.length) return { rep: 50, prospect: 50 };
    const isHost = (t: any) => t.speaker === "You" || t.speaker === "Rep" || t.speaker === "Host";
    const rw = transcripts.filter(isHost).reduce((s, t) => s + t.text.split(/\s+/).length, 0);
    const pw = transcripts.filter((t) => !isHost(t)).reduce((s, t) => s + t.text.split(/\s+/).length, 0);
    const total = rw + pw;
    if (!total) return { rep: 50, prospect: 50 };
    return { rep: Math.round((rw / total) * 100), prospect: Math.round((pw / total) * 100) };
  }, [transcripts]);

  const questionsCount = useMemo(() => transcripts.filter((t) => t.text.includes("?")).length, [transcripts]);

  const allInsights: AIInsight[] = useMemo(() => {
    return objections.map((obj) => ({
      type: "objection" as const,
      text: obj.objection_type,
      suggestion: obj.suggestion ?? undefined,
      timestamp: new Date(obj.detected_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      priority: "high" as const,
    }));
  }, [objections]);

  const formatTime = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcripts.length]);

  // Redirect if no live call
  useEffect(() => {
    if (!isLoading && !isLive) navigate("/live");
  }, [isLoading, isLive, navigate]);

  const handleEnd = async () => {
    audioStreaming.stopAll();
    await daily.leaveCall();
    try {
      await endCall.mutateAsync();
      toast.success("Call ended — generating AI summary…");
      navigate(callId ? `/calls/${callId}` : "/live");
    } catch {
      toast.error("Failed to end call");
    }
  };

  // Manual retry for join failures
  const handleRetryJoin = useCallback(() => {
    if (!roomName) return;
    joinAttemptedRef.current = false;
    daily.joinCall({
      rName: roomName,
      token: meetingToken ?? undefined,
      displayName: "Host",
    }).then((success) => {
      if (!success) joinAttemptedRef.current = false;
      else joinAttemptedRef.current = true;
    });
  }, [roomName, meetingToken, daily]);

  const sentimentScore = liveCall?.sentiment_score ?? 74;

  const displayParticipants = daily.participants;
  const mainSpeaker = daily.activeSpeaker || daily.remoteParticipants[0] || daily.localParticipant;

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
      <div
        className="flex flex-col -mx-4 -mt-4"
        style={{ height: "calc(100vh - 3.5rem)", background: "linear-gradient(180deg, #0a0c13 0%, #0d0f18 100%)" }}
      >

        {/* ── TOP NAV BAR ─────────────────────────────────────────────────── */}
        <div
          className="flex items-center justify-between px-4 py-2.5 shrink-0 border-b"
          style={{ borderColor: "rgba(255,255,255,0.06)", background: "rgba(13,15,24,0.95)", backdropFilter: "blur(20px)" }}
        >
          {/* Left */}
          <div className="flex items-center gap-4 min-w-0">
            <div className="flex items-center gap-2.5">
              <div className="w-2 h-2 rounded-full bg-red-500 shrink-0" style={{ boxShadow: "0 0 6px rgba(239,68,68,0.8)" }} />
              <span className="text-[11px] font-semibold text-red-400 uppercase tracking-widest">Live</span>
            </div>
            <div className="h-4 w-px bg-white/10" />
            <span className="text-sm font-semibold text-white truncate">
              {liveCall?.name || "Live Meeting"}
            </span>
            {meetingType && (
              <div
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium"
                style={{ background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.2)", color: "#a5b4fc" }}
              >
                <Tag className="w-3 h-3" />
                {meetingType.charAt(0).toUpperCase() + meetingType.slice(1)}
              </div>
            )}
          </div>

          {/* Center */}
          <div className="flex items-center gap-5">
            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-white/35" />
              <span className="text-sm font-mono font-semibold text-white/90 tabular-nums">
                {formatTime(daily.elapsedSeconds)}
              </span>
            </div>

            <NetworkDot quality={daily.networkQuality} />

            <div className="flex items-center gap-1.5 text-xs text-white/50">
              <Users className="w-3.5 h-3.5" />
              <span>{daily.participantCount} participant{daily.participantCount !== 1 ? "s" : ""}</span>
            </div>

            {daily.isRecording && (
              <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl"
                style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.15)" }}>
                <div className="w-2 h-2 rounded-full bg-red-500" style={{ animation: "pulse 1.5s ease-in-out infinite" }} />
                <span className="text-xs font-medium text-red-400">Recording</span>
              </div>
            )}

            {audioStreaming.state.isStreaming && (
              <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl"
                style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.15)" }}>
                <Sparkles className="w-3 h-3 text-indigo-400" />
                <span className="text-xs font-medium text-indigo-400">AI Transcribing</span>
              </div>
            )}
          </div>

          {/* Right */}
          <div className="flex items-center gap-3 shrink-0">
            {displayParticipants.slice(0, 3).map((p) => (
              <div key={p.session_id}
                className="w-7 h-7 rounded-full border-2 flex items-center justify-center text-[10px] font-bold text-white"
                style={{
                  borderColor: "#0d0f18",
                  background: p.session_id === daily.activeSpeakerId
                    ? "linear-gradient(135deg, #10b981, #059669)"
                    : "linear-gradient(135deg, #6366f1, #8b5cf6)",
                }}
                title={p.user_name}>
                {(p.user_name || "?")[0]?.toUpperCase()}
              </div>
            ))}
            {displayParticipants.length > 3 && (
              <div className="w-7 h-7 rounded-full border-2 flex items-center justify-center text-[10px] font-semibold text-white/60"
                style={{ borderColor: "#0d0f18", background: "rgba(255,255,255,0.08)" }}>
                +{displayParticipants.length - 3}
              </div>
            )}
            <button className="w-7 h-7 rounded-lg flex items-center justify-center text-white/40 hover:text-white/70 hover:bg-white/8 transition-all">
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── MAIN 3-COLUMN LAYOUT ─────────────────────────────────────────── */}
        <div className="flex flex-1 min-h-0 overflow-hidden">

          {/* ── LEFT SIDEBAR ─────────────────────────────────────────────── */}
          <div
            className={cn("flex flex-col shrink-0 transition-all duration-300 border-r", isSidebarOpen ? "w-60" : "w-0 overflow-hidden")}
            style={{ borderColor: "rgba(255,255,255,0.06)", background: "rgba(9,11,18,0.8)" }}
          >
            <div className="flex gap-1 p-2 shrink-0 border-b overflow-x-auto scrollbar-none"
              style={{ borderColor: "rgba(255,255,255,0.06)" }}>
              {([
                { id: "participants", icon: Users, label: "People" },
                { id: "chat", icon: MessageSquare, label: "Chat" },
                { id: "notes", icon: FileText, label: "Notes" },
                { id: "files", icon: Paperclip, label: "Files" },
                { id: "deals", icon: Tag, label: "Deals" },
                { id: "agenda", icon: BookOpen, label: "Agenda" },
              ] as { id: SidebarTab; icon: React.FC<any>; label: string }[]).map((tab) => {
                const Icon = tab.icon;
                return (
                  <button key={tab.id} onClick={() => setSidebarTab(tab.id)}
                    className={cn(
                      "relative flex flex-col items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] transition-all shrink-0",
                      sidebarTab === tab.id ? "bg-indigo-500/15 text-indigo-300" : "text-white/30 hover:text-white/60 hover:bg-white/5",
                    )} title={tab.label}>
                    <Icon className="w-4 h-4" />
                    <span className="font-medium">{tab.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex-1 overflow-y-auto">
              {sidebarTab === "participants" && (
                <div className="p-2 space-y-0.5">
                  {displayParticipants.length === 0 ? (
                    <div className="p-4 text-center">
                      <Users className="w-8 h-8 text-white/20 mx-auto mb-2" />
                      <p className="text-xs text-white/30">
                        {daily.isConnecting ? "Connecting…" : "No participants yet"}
                      </p>
                    </div>
                  ) : displayParticipants.map((p) => {
                    const isSpeaking = p.session_id === daily.activeSpeakerId;
                    return (
                      <div key={p.session_id}
                        className={cn("flex items-center gap-2.5 p-2 rounded-xl transition-all cursor-pointer",
                          isSpeaking ? "bg-emerald-500/8" : "hover:bg-white/4")}>
                        <div className={cn(
                          "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0",
                          isSpeaking ? "bg-gradient-to-br from-emerald-500/50 to-teal-600/50 border border-emerald-400/30"
                            : "bg-gradient-to-br from-violet-500/40 to-indigo-600/40 border border-white/10",
                        )}>
                          {(p.user_name || "?")[0]?.toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-white/85 truncate">
                            {p.user_name || "Participant"}{p.local && " (You)"}
                          </p>
                          <p className="text-[10px] text-white/30">
                            {isSpeaking ? "Speaking..." : p.local ? "Host" : "Guest"}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {p.audio ? <Mic className="w-3 h-3 text-white/25" /> : <MicOff className="w-3 h-3 text-red-400/70" />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {sidebarTab === "chat" && (
                <div className="flex flex-col h-full">
                  <div className="flex-1 p-3 text-center text-xs text-white/30 flex items-center justify-center">
                    Team chat is available in the Messages tab
                  </div>
                  <div className="p-2 border-t shrink-0" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                    <div className="flex gap-1.5">
                      <input value={chatInput} onChange={(e) => setChatInput(e.target.value)}
                        placeholder="Message team..."
                        className="flex-1 text-xs px-2.5 py-1.5 rounded-xl outline-none text-white/80 placeholder:text-white/20"
                        style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }} />
                      <button className="w-7 h-7 rounded-xl flex items-center justify-center text-indigo-400 shrink-0"
                        style={{ background: "rgba(99,102,241,0.12)" }}>
                        <Send className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {sidebarTab === "notes" && (
                <div className="p-3 space-y-2">
                  <p className="text-[10px] text-white/25 font-medium uppercase tracking-wider">Meeting Notes</p>
                  <textarea placeholder="Start typing notes..." rows={12}
                    className="w-full text-xs text-white/75 bg-transparent outline-none resize-none leading-relaxed placeholder:text-white/20" />
                </div>
              )}

              {sidebarTab === "agenda" && (
                <div className="p-2 space-y-1">
                  {[
                    { done: true, text: "Introductions", time: "5 min" },
                    { done: true, text: "Current challenges", time: "10 min" },
                    { done: false, text: "Fixsense demo", time: "20 min" },
                    { done: false, text: "Pricing discussion", time: "10 min" },
                    { done: false, text: "Next steps", time: "5 min" },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-2.5 p-2 rounded-xl">
                      <div className={cn("w-4 h-4 rounded-full flex items-center justify-center shrink-0 text-[9px]",
                        item.done ? "bg-emerald-500/20 border border-emerald-500/40" : "bg-white/8 border border-white/15")}>
                        {item.done && <Check className="w-2.5 h-2.5 text-emerald-400" />}
                      </div>
                      <span className={cn("text-xs flex-1", item.done ? "text-white/35 line-through" : "text-white/75")}>{item.text}</span>
                      <span className="text-[10px] text-white/25 shrink-0">{item.time}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── CENTER: VIDEO GRID ───────────────────────────────────────── */}
          <div className="flex-1 flex flex-col min-w-0 relative">
            <div className="flex-1 p-3 min-h-0">

              {/* Error state with retry */}
              {daily.callState === "error" && (
                <div className="h-full flex flex-col items-center justify-center gap-4 text-center">
                  <div className="w-14 h-14 rounded-full flex items-center justify-center"
                    style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.2)" }}>
                    <WifiOff className="w-7 h-7 text-red-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-red-400 mb-1">Connection failed</p>
                    <p className="text-xs text-white/30 max-w-xs">
                      {daily.error || "Could not connect to the meeting room. Please try again."}
                    </p>
                  </div>
                  <button
                    onClick={handleRetryJoin}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white transition-all hover:opacity-90"
                    style={{ background: "rgba(99,102,241,0.2)", border: "1px solid rgba(99,102,241,0.3)" }}
                  >
                    <RefreshCw className="w-4 h-4" />
                    Retry Connection
                  </button>
                </div>
              )}

              {/* Connecting state */}
              {daily.isConnecting && daily.callState !== "error" && (
                <div className="h-full flex flex-col items-center justify-center gap-3">
                  <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
                  <p className="text-sm text-white/50">Connecting to Daily.co…</p>
                  <p className="text-xs text-white/25">This may take up to 30 seconds</p>
                </div>
              )}

              {/* No room yet */}
              {!roomName && !daily.isConnecting && daily.callState !== "error" && (
                <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
                  <Video className="w-10 h-10 text-white/20" />
                  <p className="text-sm text-white/40">No Daily.co room attached to this call</p>
                  <p className="text-xs text-white/25">Go to Live Call to create a room</p>
                </div>
              )}

              {/* Video grid */}
              {daily.isConnected && displayParticipants.length > 0 && (
                <>
                  {displayParticipants.length === 1 && (
                    <div className="h-full">
                      <VideoTile participant={displayParticipants[0]} isMain activeSpeakerId={daily.activeSpeakerId} />
                    </div>
                  )}
                  {displayParticipants.length === 2 && (
                    <div className="grid grid-cols-2 gap-3 h-full">
                      {displayParticipants.map((p) => (
                        <VideoTile key={p.session_id} participant={p} activeSpeakerId={daily.activeSpeakerId} />
                      ))}
                    </div>
                  )}
                  {displayParticipants.length >= 3 && (
                    <div className="grid gap-3 h-full" style={{ gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr" }}>
                      <div className="col-span-2 row-span-1 min-h-0">
                        {mainSpeaker && (
                          <VideoTile participant={mainSpeaker} isMain activeSpeakerId={daily.activeSpeakerId} />
                        )}
                      </div>
                      {displayParticipants
                        .filter((p) => p.session_id !== mainSpeaker?.session_id)
                        .slice(0, 3)
                        .map((p) => (
                          <VideoTile key={p.session_id} participant={p} activeSpeakerId={daily.activeSpeakerId} />
                        ))}
                    </div>
                  )}
                </>
              )}

              {/* Connected but waiting */}
              {daily.isConnected && displayParticipants.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
                  <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: "rgba(99,102,241,0.15)" }}>
                    <Users className="w-8 h-8 text-indigo-400" />
                  </div>
                  <p className="text-sm text-white/50">Waiting for participants…</p>
                  <p className="text-xs text-white/25">Share the meeting link to invite guests</p>
                </div>
              )}
            </div>

            {/* AI status bar */}
            {daily.isConnected && (
              <div className="mx-3 mb-2 px-4 py-2 rounded-xl flex items-center justify-between shrink-0"
                style={{ background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.12)" }}>
                <div className="flex items-center gap-2.5">
                  <div className="w-5 h-5 rounded-lg flex items-center justify-center" style={{ background: "rgba(99,102,241,0.2)" }}>
                    <Sparkles className="w-3 h-3 text-indigo-400" />
                  </div>
                  <span className="text-xs text-white/50">AI analyzing conversation</span>
                  {allInsights.length > 0 && (
                    <span className="text-xs text-indigo-400 font-medium">· {allInsights.length} insight{allInsights.length !== 1 ? "s" : ""} detected</span>
                  )}
                </div>
                <button
                  className="text-xs text-indigo-400/70 hover:text-indigo-300 transition-colors flex items-center gap-1"
                  onClick={() => { setAiTab("insights"); setIsAIPanelOpen(true); }}>
                  View insights <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            )}

            {/* ── FLOATING CONTROL BAR ─────────────────────────────────── */}
            <div className="mx-3 mb-3 shrink-0">
              <div
                className="flex items-center justify-between px-4 py-2 rounded-2xl"
                style={{
                  background: "rgba(13,15,24,0.92)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  backdropFilter: "blur(20px)",
                  boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
                }}
              >
                <div className="flex items-center gap-1">
                  <ControlBtn
                    icon={isAudioOn ? Mic : MicOff}
                    label="Mic"
                    active={isAudioOn}
                    onClick={async () => {
                      await daily.setAudioEnabled(!isAudioOn);
                      setIsAudioOn((v) => !v);
                    }}
                  />
                  <ControlBtn
                    icon={isVideoOn ? Video : VideoOff}
                    label="Camera"
                    active={isVideoOn}
                    onClick={async () => {
                      await daily.setVideoEnabled(!isVideoOn);
                      setIsVideoOn((v) => !v);
                    }}
                  />
                  <ControlBtn
                    icon={MonitorPlay}
                    label="Share Screen"
                    onClick={() => {
                      if (daily.localParticipant?.screen) daily.stopScreenShare();
                      else daily.startScreenShare();
                    }}
                    active={!daily.localParticipant?.screen}
                  />
                </div>

                <div className="flex items-center gap-1">
                  <ControlBtn icon={Sparkles} label="AI Panel" onClick={() => setIsAIPanelOpen((v) => !v)} />
                  <ControlBtn
                    icon={CircleDot}
                    label={daily.isRecording ? "Stop Rec" : "Record"}
                    active={!daily.isRecording}
                    onClick={() => daily.isRecording ? daily.stopRecording() : daily.startRecording()}
                    badge={daily.isRecording ? 1 : undefined}
                  />
                  <ControlBtn icon={Users} label="People" onClick={() => setIsSidebarOpen((v) => !v)} />
                </div>

                <div className="flex items-center gap-1.5">
                  <ControlBtn icon={MoreHorizontal} label="More" />
                  <button
                    onClick={handleEnd}
                    disabled={endCall.isPending}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-[0.98]"
                    style={{ background: "linear-gradient(135deg, #dc2626, #b91c1c)", boxShadow: "0 4px 16px rgba(220,38,38,0.3)" }}
                  >
                    {endCall.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <PhoneOff className="w-4 h-4" />}
                    End Call
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* ── RIGHT AI PANEL ────────────────────────────────────────────── */}
          <div
            className={cn("flex flex-col shrink-0 transition-all duration-300 border-l", isAIPanelOpen ? "w-80" : "w-0 overflow-hidden")}
            style={{ borderColor: "rgba(255,255,255,0.06)", background: "rgba(9,11,18,0.8)" }}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b shrink-0"
              style={{ borderColor: "rgba(255,255,255,0.06)" }}>
              <div className="flex items-center gap-2.5">
                <div className="w-6 h-6 rounded-lg flex items-center justify-center"
                  style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.3), rgba(139,92,246,0.2))", border: "1px solid rgba(99,102,241,0.25)" }}>
                  <BrainCircuit className="w-3.5 h-3.5 text-indigo-400" />
                </div>
                <span className="text-sm font-semibold text-white/85">AI Assistant</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" style={{ boxShadow: "0 0 4px rgba(52,211,153,0.8)" }} />
                <span className="text-[10px] font-semibold text-emerald-400">LIVE</span>
              </div>
            </div>

            <div className="flex border-b shrink-0" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
              {([
                { id: "transcript", label: "Transcript", icon: MessageSquare },
                { id: "insights", label: "Insights", icon: Sparkles, badge: allInsights.length },
                { id: "coaching", label: "Coaching", icon: Brain },
              ] as { id: AITab; label: string; icon: React.FC<any>; badge?: number }[]).map((tab) => {
                const Icon = tab.icon;
                return (
                  <button key={tab.id} onClick={() => setAiTab(tab.id)}
                    className={cn(
                      "relative flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-all border-b-2",
                      aiTab === tab.id ? "border-indigo-500 text-indigo-300" : "border-transparent text-white/30 hover:text-white/60",
                    )}>
                    <Icon className="w-3.5 h-3.5" />
                    {tab.label}
                    {tab.badge != null && tab.badge > 0 && (
                      <span className="w-4 h-4 rounded-full bg-indigo-500 text-white text-[9px] flex items-center justify-center font-bold">{tab.badge}</span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="flex-1 overflow-y-auto">
              {aiTab === "transcript" && (
                <div className="p-3 space-y-3">
                  <div className="flex items-center gap-2 py-1.5 px-2.5 rounded-xl"
                    style={{ background: "rgba(52,211,153,0.06)", border: "1px solid rgba(52,211,153,0.12)" }}>
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-[11px] text-emerald-400 font-medium">Live Transcript · {transcripts.length} lines</span>
                  </div>

                  {transcripts.length === 0 ? (
                    <div className="py-6 text-center text-xs text-white/30">
                      <Mic className="w-6 h-6 mx-auto mb-2 text-white/20" />
                      <p>Transcript will appear here as you speak</p>
                      {!audioStreaming.state.isStreaming && (
                        <p className="mt-1 text-white/20">Audio streaming starts once connected</p>
                      )}
                    </div>
                  ) : (
                    transcripts.map((line) => {
                      const isHost = line.speaker === "You" || line.speaker === "Rep" || line.speaker === "Host";
                      return (
                        <div key={line.id} className="flex gap-2.5 animate-in fade-in slide-in-from-bottom-1 duration-300">
                          <div className={cn(
                            "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0 mt-0.5",
                            isHost ? "bg-gradient-to-br from-indigo-500/50 to-violet-600/50" : "bg-gradient-to-br from-violet-500/30 to-pink-600/30",
                          )}>
                            {(line.speaker_name || line.speaker || "?")[0]?.toUpperCase()}
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className={cn("text-[11px] font-semibold", isHost ? "text-indigo-400" : "text-violet-400")}>
                                {line.speaker_name || line.speaker}
                              </span>
                              <span className="text-[10px] text-white/20">
                                {new Date(line.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                              </span>
                            </div>
                            <p className="text-xs text-white/70 leading-relaxed">{line.text}</p>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={transcriptEndRef} />
                </div>
              )}

              {aiTab === "insights" && (
                <div className="p-3 space-y-3">
                  <div className="p-3 rounded-xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] text-white/40 font-medium">Overall Sentiment</span>
                      <span className={cn("text-sm font-bold", sentimentScore >= 70 ? "text-emerald-400" : sentimentScore >= 50 ? "text-amber-400" : "text-red-400")}>
                        {sentimentScore}%
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/8">
                      <div className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${sentimentScore}%`,
                          background: sentimentScore >= 70 ? "linear-gradient(90deg, #10b981, #34d399)" : sentimentScore >= 50 ? "linear-gradient(90deg, #f59e0b, #fbbf24)" : "linear-gradient(90deg, #ef4444, #f87171)",
                        }} />
                    </div>
                  </div>

                  <div className="p-3 rounded-xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] text-white/40 font-medium">Talk Ratio</span>
                      {talkRatio.rep > 65 && <span className="text-[10px] text-amber-400">⚠ Let them talk more</span>}
                    </div>
                    <div className="flex justify-between text-[11px] mb-1.5">
                      <span className="text-indigo-400">You {talkRatio.rep}%</span>
                      <span className="text-violet-400">Prospect {talkRatio.prospect}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-white/8 flex overflow-hidden">
                      <div className="h-full rounded-l-full transition-all duration-700"
                        style={{ width: `${talkRatio.rep}%`, background: "linear-gradient(90deg, #6366f1, #8b5cf6)" }} />
                      <div className="h-full rounded-r-full transition-all duration-700"
                        style={{ width: `${talkRatio.prospect}%`, background: "linear-gradient(90deg, #8b5cf6, #a78bfa)" }} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: "Questions", value: questionsCount || 0, icon: MessageCircle },
                      { label: "Topics", value: topics.length, icon: Hash },
                      { label: "Participants", value: daily.participantCount, icon: Users },
                      { label: "Objections", value: objections.length, icon: AlertCircle },
                    ].map(({ label, value, icon: Icon }) => (
                      <div key={label} className="p-2 rounded-xl text-center" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                        <div className="text-base font-bold font-mono text-white/85">{value}</div>
                        <div className="text-[10px] text-white/30 mt-0.5 flex items-center justify-center gap-1">
                          <Icon className="w-2.5 h-2.5" />{label}
                        </div>
                      </div>
                    ))}
                  </div>

                  {allInsights.length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-[11px] text-white/30 font-medium uppercase tracking-wider px-0.5">AI Insights</p>
                      {allInsights.map((insight, i) => <InsightCard key={i} insight={insight} />)}
                    </div>
                  ) : (
                    <div className="py-4 text-center text-xs text-white/30">
                      <Sparkles className="w-5 h-5 mx-auto mb-2 text-white/20" />
                      <p>AI insights will appear as they're detected</p>
                    </div>
                  )}
                </div>
              )}

              {aiTab === "coaching" && (
                <div className="p-3 space-y-3">
                  <div className="p-3 rounded-xl" style={{ background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.12)" }}>
                    <p className="text-[11px] text-indigo-400 font-semibold mb-2 flex items-center gap-1.5">
                      <Trophy className="w-3 h-3" />Performance Score
                    </p>
                    <div className="flex items-baseline gap-1 mb-1">
                      <span className="text-2xl font-bold text-white">{sentimentScore > 0 ? Math.round(sentimentScore * 0.9) : "—"}</span>
                      <span className="text-sm text-white/30">/ 100</span>
                    </div>
                  </div>

                  {topics.length > 0 && (
                    <div className="p-3 rounded-xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                      <p className="text-[11px] text-white/30 font-medium mb-2">Key Topics Detected</p>
                      <div className="flex flex-wrap gap-1.5">
                        {topics.map((t) => (
                          <span key={t.id} className="text-[11px] px-2 py-0.5 rounded-lg"
                            style={{ background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.2)", color: "#a5b4fc" }}>
                            {t.topic}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <p className="text-[11px] text-white/30 font-medium uppercase tracking-wider">Coaching Tips</p>
                    {[
                      { icon: Flame, text: "Ask open-ended questions to understand their current pain points", color: "text-amber-400", bg: "bg-amber-500/8 border-amber-500/15" },
                      { icon: Target, text: "Re-qualify decision maker and timeline before discussing price", color: "text-sky-400", bg: "bg-sky-500/8 border-sky-500/15" },
                      { icon: Shield, text: "Confirm all stakeholders are on this call before proposing", color: "text-violet-400", bg: "bg-violet-500/8 border-violet-500/15" },
                    ].map(({ icon: Icon, text, color, bg }, i) => (
                      <div key={i} className={cn("p-2.5 rounded-xl border flex items-start gap-2", bg)}>
                        <Icon className={cn("w-3.5 h-3.5 shrink-0 mt-0.5", color)} />
                        <span className="text-xs text-white/65 leading-relaxed">{text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </DashboardLayout>
  );
}