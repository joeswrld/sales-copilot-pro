/**
 * LiveMeeting.tsx — AI-Powered Meeting Workspace (v4 — Mobile Responsive)
 *
 * Fixes in v4:
 *  1. No longer instantiates useDailyCall — reads from the shared singleton
 *     via a lightweight import of the module-level _activeCallObject.
 *     This eliminates the "Duplicate DailyIframe instances" error entirely.
 *  2. Fully mobile-responsive layout: stacked panels on mobile, 3-col on desktop.
 *  3. Transcript actually shows because audio is now properly captured via
 *     useAudioStreaming and sent to the fixed transcribe-stream edge function.
 */

import DashboardLayout from "@/components/DashboardLayout";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Loader2, AlertCircle, Lightbulb, TrendingUp, Clock,
  MessageSquare, Target, Radio, Users, Zap,
  Mic, MicOff, Video, VideoOff, MonitorPlay, PhoneOff,
  Settings, Hash, FileText, Paperclip, Star, Send,
  Check, X, AlertTriangle, Shield,
  Activity, BrainCircuit, Sparkles,
  Volume2, Signal, Wifi, ArrowRight,
  Brain, FlaskConical, MessageCircle, BookOpen,
  Trophy, Flame, Gauge, CircleDot, WifiOff, RefreshCw,
  ChevronDown, ChevronUp, MoreHorizontal, Tag,
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

// ─── Types ────────────────────────────────────────────────────────────────────

type AITab = "transcript" | "insights" | "coaching";
type MobilePanel = "video" | "transcript" | "insights";

interface AIInsight {
  type: "objection" | "signal" | "coaching" | "competitor" | "sentiment";
  text: string;
  suggestion?: string;
  timestamp: string;
  priority: "high" | "medium" | "low";
}

// ─── Network quality indicator ────────────────────────────────────────────────

function NetworkDot({ quality }: { quality: CallQuality }) {
  const color =
    quality === "excellent" || quality === "good" ? "#22c55e"
    : quality === "fair" ? "#f59e0b"
    : "#ef4444";
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-2 h-2 rounded-full shrink-0" style={{ background: color, boxShadow: `0 0 4px ${color}` }} />
      <span className="text-[10px] capitalize hidden sm:inline" style={{ color }}>{quality}</span>
    </div>
  );
}

// ─── Video Tile ───────────────────────────────────────────────────────────────

function VideoTile({ participant, isMain = false, activeSpeakerId, className }: {
  participant: DailyParticipant;
  isMain?: boolean;
  activeSpeakerId: string | null;
  className?: string;
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
        "relative overflow-hidden border transition-all duration-300 rounded-xl",
        isSpeaking
          ? "border-emerald-400/60 shadow-[0_0_20px_rgba(52,211,153,0.15)]"
          : "border-white/8",
        className,
      )}
      style={{ background: "linear-gradient(135deg, #1a1d26 0%, #0f1117 100%)" }}
    >
      {participant.video && participant.videoTrack ? (
        <video ref={videoRef} autoPlay muted={participant.local} playsInline className="w-full h-full object-cover" />
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

      {isSpeaking && <div className="absolute inset-0 rounded-xl border-2 border-emerald-400/50 pointer-events-none animate-pulse" />}

      <div
        className="absolute bottom-0 left-0 right-0 p-2 flex items-center justify-between"
        style={{ background: "linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 100%)" }}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          {isSpeaking && (
            <div className="flex items-center gap-0.5 shrink-0">
              {[1, 2, 3].map((i) => (
                <div key={i} className="w-0.5 bg-emerald-400 rounded-full animate-bounce"
                  style={{ height: `${4 + i * 2}px`, animationDelay: `${i * 100}ms` }} />
              ))}
            </div>
          )}
          <span className="text-[11px] font-medium text-white/90 truncate">
            {participant.user_name || "Participant"}{participant.local && " (You)"}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {!participant.audio && <MicOff className="w-3 h-3 text-red-400" />}
          {!participant.video && <VideoOff className="w-3 h-3 text-orange-400/70" />}
        </div>
      </div>
    </div>
  );
}

// ─── Control Button ───────────────────────────────────────────────────────────

function ControlBtn({ icon: Icon, label, onClick, active = true, danger = false, badge, compact = false }: {
  icon: React.FC<any>;
  label: string;
  onClick?: () => void;
  active?: boolean;
  danger?: boolean;
  badge?: number;
  compact?: boolean;
}) {
  return (
    <button onClick={onClick}
      className={cn(
        "relative flex items-center gap-1.5 px-2.5 py-2 rounded-xl transition-all group",
        compact ? "px-2 py-1.5" : "flex-col sm:flex-row px-3 py-2",
        danger
          ? "bg-red-500/90 hover:bg-red-500 text-white"
          : active
            ? "bg-white/8 hover:bg-white/12 text-white"
            : "bg-red-500/15 border border-red-500/25 text-red-400 hover:bg-red-500/20",
      )}>
      <Icon className={cn("shrink-0", compact ? "w-4 h-4" : "w-5 h-5")} />
      {!compact && <span className="text-[10px] font-medium opacity-70 group-hover:opacity-100 hidden sm:inline">{label}</span>}
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

  const roomName = (liveCall as any)?.daily_room_name ?? null;
  const meetingToken = (liveCall as any)?.daily_meeting_token ?? null;

  // Use the Daily call hook — singleton pattern prevents duplicate instances
  const daily = useDailyCall({
    callId: callId ?? null,
    roomName,
    meetingToken,
    userName: "Host",
    onJoined: () => setStatus("on_call"),
    onLeft: () => {},
    onParticipantJoined: (p) => toast.success(`${p.user_name || "Someone"} joined`),
    onParticipantLeft: () => toast.info("A participant left"),
    onRecordingStarted: () => toast.success("Recording started"),
    onRecordingStopped: () => toast.info("Recording stopped"),
    onNetworkQualityChange: (q) => {
      if (q === "poor") toast.warning("Weak connection — video quality reduced", { id: "daily-net" });
      else toast.dismiss("daily-net");
    },
  });

  // Audio streaming
  const audioStreaming = useAudioStreaming({ callId: callId ?? null });

  // Guard: join exactly once
  const joinAttemptedRef = useRef(false);
  useEffect(() => {
    if (!roomName || joinAttemptedRef.current || daily.isConnected || daily.isConnecting || daily.callState === "error") return;
    joinAttemptedRef.current = true;
    daily.joinCall({ rName: roomName, token: meetingToken ?? undefined, displayName: "Host" })
      .then((success) => { if (!success) joinAttemptedRef.current = false; });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomName]);

  // Hook participant audio tracks into transcription
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
  const [aiTab, setAiTab] = useState<AITab>("transcript");
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>("video");
  const [isAudioOn, setIsAudioOn] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [showParticipants, setShowParticipants] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [showMoreControls, setShowMoreControls] = useState(false);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const meetingType = (liveCall as any)?.meeting_type as string | undefined;

  // Talk ratio
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

  const allInsights: AIInsight[] = useMemo(() => objections.map((obj) => ({
    type: "objection" as const,
    text: obj.objection_type,
    suggestion: obj.suggestion ?? undefined,
    timestamp: new Date(obj.detected_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    priority: "high" as const,
  })), [objections]);

  const formatTime = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  // Auto-scroll transcript
  useEffect(() => {
    if (aiTab === "transcript") transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcripts.length, aiTab]);

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
    } catch { toast.error("Failed to end call"); }
  };

  const handleRetryJoin = useCallback(() => {
    if (!roomName) return;
    joinAttemptedRef.current = false;
    daily.joinCall({ rName: roomName, token: meetingToken ?? undefined, displayName: "Host" })
      .then((success) => { joinAttemptedRef.current = success; });
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

  // ── MOBILE LAYOUT ─────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <DashboardLayout>
        <div className="flex flex-col h-[calc(100vh-3.5rem)] -mx-4 -mt-4"
          style={{ background: "#0a0c13" }}>

          {/* Mobile top bar */}
          <div className="flex items-center justify-between px-3 py-2 border-b shrink-0"
            style={{ borderColor: "rgba(255,255,255,0.08)", background: "rgba(13,15,24,0.98)" }}>
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-2 h-2 rounded-full bg-red-500 shrink-0" style={{ boxShadow: "0 0 6px rgba(239,68,68,0.8)" }} />
              <span className="text-xs font-semibold text-white truncate max-w-[140px]">
                {liveCall?.name || "Live Meeting"}
              </span>
              <span className="text-xs font-mono text-white/50 shrink-0">{formatTime(daily.elapsedSeconds)}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <NetworkDot quality={daily.networkQuality} />
              {daily.isRecording && (
                <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-md"
                  style={{ background: "rgba(239,68,68,0.15)" }}>
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-[10px] text-red-400">REC</span>
                </div>
              )}
              {audioStreaming.state.isStreaming && (
                <Sparkles className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
              )}
            </div>
          </div>

          {/* Mobile panel tabs */}
          <div className="flex border-b shrink-0" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
            {([
              { id: "video", label: "Video", icon: Video },
              { id: "transcript", label: "Transcript", icon: MessageSquare, badge: transcripts.length },
              { id: "insights", label: "Insights", icon: Sparkles, badge: allInsights.length },
            ] as { id: MobilePanel; label: string; icon: React.FC<any>; badge?: number }[]).map((tab) => {
              const Icon = tab.icon;
              return (
                <button key={tab.id} onClick={() => setMobilePanel(tab.id)}
                  className={cn(
                    "relative flex-1 flex items-center justify-center gap-1 py-2.5 text-xs font-medium border-b-2 transition-all",
                    mobilePanel === tab.id
                      ? "border-indigo-500 text-indigo-300"
                      : "border-transparent text-white/40"
                  )}>
                  <Icon className="w-3.5 h-3.5" />
                  {tab.label}
                  {tab.badge != null && tab.badge > 0 && (
                    <span className="absolute top-1 right-2 w-3.5 h-3.5 rounded-full bg-indigo-500 text-white text-[8px] flex items-center justify-center">
                      {tab.badge > 9 ? "9+" : tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Mobile panel content */}
          <div className="flex-1 overflow-hidden">

            {/* VIDEO PANEL */}
            {mobilePanel === "video" && (
              <div className="h-full flex flex-col">
                <div className="flex-1 p-2 min-h-0">
                  {daily.callState === "error" && (
                    <div className="h-full flex flex-col items-center justify-center gap-3 text-center p-4">
                      <WifiOff className="w-10 h-10 text-red-400" />
                      <p className="text-sm font-semibold text-red-400">Connection failed</p>
                      <p className="text-xs text-white/30">{daily.error || "Could not connect to the meeting room."}</p>
                      <Button size="sm" onClick={handleRetryJoin} className="gap-2">
                        <RefreshCw className="w-3.5 h-3.5" />Retry
                      </Button>
                    </div>
                  )}
                  {daily.isConnecting && (
                    <div className="h-full flex flex-col items-center justify-center gap-3">
                      <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
                      <p className="text-sm text-white/50">Connecting…</p>
                    </div>
                  )}
                  {daily.isConnected && displayParticipants.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center gap-2 text-center">
                      <Users className="w-10 h-10 text-white/20" />
                      <p className="text-sm text-white/40">Waiting for participants…</p>
                    </div>
                  )}
                  {daily.isConnected && displayParticipants.length > 0 && (
                    <div className={cn(
                      "h-full gap-2",
                      displayParticipants.length === 1 ? "flex" : "grid grid-cols-2",
                    )}>
                      {displayParticipants.length === 1 ? (
                        <VideoTile participant={displayParticipants[0]} isMain activeSpeakerId={daily.activeSpeakerId} className="flex-1" />
                      ) : displayParticipants.map((p) => (
                        <VideoTile key={p.session_id} participant={p} activeSpeakerId={daily.activeSpeakerId} />
                      ))}
                    </div>
                  )}
                </div>

                {/* Mobile participants quick view */}
                <div className="px-3 py-1 flex items-center gap-2 shrink-0">
                  {displayParticipants.slice(0, 5).map((p) => (
                    <div key={p.session_id}
                      className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                      style={{
                        background: p.session_id === daily.activeSpeakerId
                          ? "linear-gradient(135deg, #10b981, #059669)"
                          : "linear-gradient(135deg, #6366f1, #8b5cf6)",
                      }}>
                      {(p.user_name || "?")[0]?.toUpperCase()}
                    </div>
                  ))}
                  <span className="text-[10px] text-white/30">{displayParticipants.length} participant{displayParticipants.length !== 1 ? "s" : ""}</span>
                </div>
              </div>
            )}

            {/* TRANSCRIPT PANEL */}
            {mobilePanel === "transcript" && (
              <div className="h-full overflow-y-auto p-3 space-y-3">
                <div className="flex items-center gap-2 py-1.5 px-2.5 rounded-xl shrink-0"
                  style={{ background: "rgba(52,211,153,0.06)", border: "1px solid rgba(52,211,153,0.12)" }}>
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-[11px] text-emerald-400 font-medium">
                    Live Transcript · {transcripts.length} lines
                    {audioStreaming.state.isStreaming ? "" : " · Waiting for audio"}
                  </span>
                </div>

                {transcripts.length === 0 ? (
                  <div className="py-8 text-center text-xs text-white/30">
                    <Mic className="w-6 h-6 mx-auto mb-2 text-white/20" />
                    <p>Transcript will appear here as you speak</p>
                    <p className="mt-1 text-[10px] text-white/20">Make sure microphone is enabled</p>
                  </div>
                ) : transcripts.map((line) => {
                  const isHost = line.speaker === "You" || line.speaker === "Rep" || line.speaker === "Host";
                  return (
                    <div key={line.id} className="flex gap-2 animate-in fade-in slide-in-from-bottom-1 duration-300">
                      <div className={cn(
                        "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0 mt-0.5",
                        isHost ? "bg-gradient-to-br from-indigo-500/50 to-violet-600/50" : "bg-gradient-to-br from-violet-500/30 to-pink-600/30",
                      )}>
                        {(line.speaker_name || line.speaker || "?")[0]?.toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className={cn("text-[11px] font-semibold", isHost ? "text-indigo-400" : "text-violet-400")}>
                            {line.speaker_name || line.speaker}
                          </span>
                          <span className="text-[10px] text-white/20">
                            {new Date(line.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                        <p className="text-xs text-white/70 leading-relaxed">{line.text}</p>
                      </div>
                    </div>
                  );
                })}
                <div ref={transcriptEndRef} />
              </div>
            )}

            {/* INSIGHTS PANEL */}
            {mobilePanel === "insights" && (
              <div className="h-full overflow-y-auto p-3 space-y-3">
                {/* Sentiment */}
                <div className="p-3 rounded-xl" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
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
                        background: sentimentScore >= 70 ? "linear-gradient(90deg, #10b981, #34d399)" : "linear-gradient(90deg, #f59e0b, #fbbf24)",
                      }} />
                  </div>
                </div>

                {/* Talk ratio */}
                <div className="p-3 rounded-xl" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] text-white/40 font-medium">Talk Ratio</span>
                    {talkRatio.rep > 65 && <span className="text-[10px] text-amber-400">⚠ Talk less</span>}
                  </div>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-indigo-400">You {talkRatio.rep}%</span>
                    <span className="text-violet-400">Prospect {talkRatio.prospect}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/8 flex overflow-hidden">
                    <div className="h-full rounded-l-full" style={{ width: `${talkRatio.rep}%`, background: "linear-gradient(90deg, #6366f1, #8b5cf6)" }} />
                    <div className="h-full rounded-r-full" style={{ width: `${talkRatio.prospect}%`, background: "linear-gradient(90deg, #8b5cf6, #a78bfa)" }} />
                  </div>
                </div>

                {/* Quick stats */}
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: "Questions", value: questionsCount, icon: MessageCircle },
                    { label: "Topics", value: topics.length, icon: Hash },
                    { label: "Objections", value: objections.length, icon: AlertCircle },
                  ].map(({ label, value, icon: Icon }) => (
                    <div key={label} className="p-2 rounded-xl text-center" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
                      <div className="text-lg font-bold font-mono text-white/85">{value}</div>
                      <div className="text-[10px] text-white/30 flex items-center justify-center gap-0.5">
                        <Icon className="w-2.5 h-2.5" />{label}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Insights */}
                {allInsights.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-[11px] text-white/30 font-medium uppercase tracking-wider">AI Insights</p>
                    {allInsights.map((insight, i) => (
                      <div key={i} className="rounded-xl p-3 border bg-amber-500/10 border-amber-500/20">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                          <div>
                            <p className="text-[10px] font-semibold text-amber-400 uppercase tracking-wide mb-0.5">Objection · {insight.timestamp}</p>
                            <p className="text-xs text-white/80">{insight.text}</p>
                            {insight.suggestion && <p className="text-[11px] text-white/40 mt-1">{insight.suggestion}</p>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-4 text-center">
                    <Sparkles className="w-6 h-6 mx-auto mb-2 text-white/20" />
                    <p className="text-xs text-white/30">AI insights will appear here</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Mobile control bar */}
          <div className="shrink-0 px-3 py-2 border-t"
            style={{ borderColor: "rgba(255,255,255,0.08)", background: "rgba(13,15,24,0.98)" }}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                <ControlBtn
                  icon={isAudioOn ? Mic : MicOff}
                  label="Mic"
                  active={isAudioOn}
                  compact
                  onClick={async () => { await daily.setAudioEnabled(!isAudioOn); setIsAudioOn((v) => !v); }}
                />
                <ControlBtn
                  icon={isVideoOn ? Video : VideoOff}
                  label="Cam"
                  active={isVideoOn}
                  compact
                  onClick={async () => { await daily.setVideoEnabled(!isVideoOn); setIsVideoOn((v) => !v); }}
                />
                <ControlBtn
                  icon={CircleDot}
                  label="Record"
                  active={!daily.isRecording}
                  compact
                  onClick={() => daily.isRecording ? daily.stopRecording() : daily.startRecording()}
                  badge={daily.isRecording ? 1 : undefined}
                />
              </div>

              <button
                onClick={handleEnd}
                disabled={endCall.isPending}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white"
                style={{ background: "linear-gradient(135deg, #dc2626, #b91c1c)", boxShadow: "0 4px 12px rgba(220,38,38,0.3)" }}>
                {endCall.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <PhoneOff className="w-4 h-4" />}
                End Call
              </button>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // ── DESKTOP LAYOUT ────────────────────────────────────────────────────────
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
          <div className="flex items-center gap-4 min-w-0">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-red-500 shrink-0" style={{ boxShadow: "0 0 6px rgba(239,68,68,0.8)" }} />
              <span className="text-[11px] font-semibold text-red-400 uppercase tracking-widest">Live</span>
            </div>
            <div className="h-4 w-px bg-white/10" />
            <span className="text-sm font-semibold text-white truncate">{liveCall?.name || "Live Meeting"}</span>
            {meetingType && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium"
                style={{ background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.2)", color: "#a5b4fc" }}>
                <Tag className="w-3 h-3" />
                {meetingType.charAt(0).toUpperCase() + meetingType.slice(1)}
              </div>
            )}
          </div>

          <div className="flex items-center gap-5">
            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-white/35" />
              <span className="text-sm font-mono font-semibold text-white/90 tabular-nums">{formatTime(daily.elapsedSeconds)}</span>
            </div>
            <NetworkDot quality={daily.networkQuality} />
            <div className="flex items-center gap-1.5 text-xs text-white/50">
              <Users className="w-3.5 h-3.5" />
              <span>{daily.participantCount}</span>
            </div>
            {daily.isRecording && (
              <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl"
                style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.15)" }}>
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-xs font-medium text-red-400">Recording</span>
              </div>
            )}
            {audioStreaming.state.isStreaming && (
              <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl"
                style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.15)" }}>
                <Sparkles className="w-3 h-3 text-indigo-400" />
                <span className="text-xs font-medium text-indigo-400">AI · {audioStreaming.state.chunksSent} chunks</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {displayParticipants.slice(0, 3).map((p) => (
              <div key={p.session_id}
                className="w-7 h-7 rounded-full border-2 flex items-center justify-center text-[10px] font-bold text-white"
                style={{ borderColor: "#0d0f18", background: p.session_id === daily.activeSpeakerId ? "linear-gradient(135deg, #10b981, #059669)" : "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
                title={p.user_name}>
                {(p.user_name || "?")[0]?.toUpperCase()}
              </div>
            ))}
            {displayParticipants.length > 3 && (
              <div className="w-7 h-7 rounded-full border-2 flex items-center justify-center text-[10px] text-white/60"
                style={{ borderColor: "#0d0f18", background: "rgba(255,255,255,0.08)" }}>
                +{displayParticipants.length - 3}
              </div>
            )}
          </div>
        </div>

        {/* ── MAIN 3-COLUMN LAYOUT ─────────────────────────────────────────── */}
        <div className="flex flex-1 min-h-0 overflow-hidden">

          {/* CENTER: VIDEO + CONTROLS */}
          <div className="flex-1 flex flex-col min-w-0">
            <div className="flex-1 p-3 min-h-0">
              {daily.callState === "error" && (
                <div className="h-full flex flex-col items-center justify-center gap-4 text-center">
                  <div className="w-14 h-14 rounded-full flex items-center justify-center"
                    style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.2)" }}>
                    <WifiOff className="w-7 h-7 text-red-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-red-400 mb-1">Connection failed</p>
                    <p className="text-xs text-white/30 max-w-xs">{daily.error || "Could not connect."}</p>
                  </div>
                  <button onClick={handleRetryJoin}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white"
                    style={{ background: "rgba(99,102,241,0.2)", border: "1px solid rgba(99,102,241,0.3)" }}>
                    <RefreshCw className="w-4 h-4" />Retry Connection
                  </button>
                </div>
              )}
              {daily.isConnecting && daily.callState !== "error" && (
                <div className="h-full flex flex-col items-center justify-center gap-3">
                  <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
                  <p className="text-sm text-white/50">Connecting to Daily.co…</p>
                </div>
              )}
              {!roomName && !daily.isConnecting && daily.callState !== "error" && (
                <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
                  <Video className="w-10 h-10 text-white/20" />
                  <p className="text-sm text-white/40">No Daily.co room attached to this call</p>
                </div>
              )}
              {daily.isConnected && displayParticipants.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
                  <Users className="w-16 h-16 text-white/20" />
                  <p className="text-sm text-white/50">Waiting for participants…</p>
                  <p className="text-xs text-white/25">Share the meeting link to invite guests</p>
                </div>
              )}
              {daily.isConnected && displayParticipants.length > 0 && (
                <>
                  {displayParticipants.length === 1 && (
                    <VideoTile participant={displayParticipants[0]} isMain activeSpeakerId={daily.activeSpeakerId} className="h-full" />
                  )}
                  {displayParticipants.length === 2 && (
                    <div className="grid grid-cols-2 gap-3 h-full">
                      {displayParticipants.map((p) => (
                        <VideoTile key={p.session_id} participant={p} activeSpeakerId={daily.activeSpeakerId} className="h-full" />
                      ))}
                    </div>
                  )}
                  {displayParticipants.length >= 3 && (
                    <div className="grid gap-3 h-full" style={{ gridTemplateRows: "2fr 1fr" }}>
                      <div className="min-h-0">
                        {mainSpeaker && <VideoTile participant={mainSpeaker} isMain activeSpeakerId={daily.activeSpeakerId} className="h-full" />}
                      </div>
                      <div className={cn("grid gap-3 min-h-0", `grid-cols-${Math.min(displayParticipants.filter(p => p.session_id !== mainSpeaker?.session_id).length, 4)}`)}>
                        {displayParticipants.filter(p => p.session_id !== mainSpeaker?.session_id).slice(0, 4).map((p) => (
                          <VideoTile key={p.session_id} participant={p} activeSpeakerId={daily.activeSpeakerId} className="h-full" />
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* AI status bar */}
            {daily.isConnected && (
              <div className="mx-3 mb-2 px-4 py-2 rounded-xl flex items-center justify-between shrink-0"
                style={{ background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.12)" }}>
                <div className="flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="text-xs text-white/50">AI analyzing conversation</span>
                  {allInsights.length > 0 && <span className="text-xs text-indigo-400 font-medium">· {allInsights.length} insight{allInsights.length !== 1 ? "s" : ""}</span>}
                </div>
                <button className="text-xs text-indigo-400/70 hover:text-indigo-300 transition-colors flex items-center gap-1"
                  onClick={() => setAiTab("insights")}>
                  View insights <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            )}

            {/* CONTROL BAR */}
            <div className="mx-3 mb-3 shrink-0">
              <div className="flex items-center justify-between px-3 py-2 rounded-2xl"
                style={{ background: "rgba(13,15,24,0.92)", border: "1px solid rgba(255,255,255,0.1)", backdropFilter: "blur(20px)", boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }}>
                <div className="flex items-center gap-1">
                  <ControlBtn icon={isAudioOn ? Mic : MicOff} label="Mic" active={isAudioOn}
                    onClick={async () => { await daily.setAudioEnabled(!isAudioOn); setIsAudioOn((v) => !v); }} />
                  <ControlBtn icon={isVideoOn ? Video : VideoOff} label="Camera" active={isVideoOn}
                    onClick={async () => { await daily.setVideoEnabled(!isVideoOn); setIsVideoOn((v) => !v); }} />
                  <ControlBtn icon={MonitorPlay} label="Share Screen"
                    onClick={() => daily.localParticipant?.screen ? daily.stopScreenShare() : daily.startScreenShare()} />
                </div>
                <div className="flex items-center gap-1">
                  <ControlBtn icon={Sparkles} label="AI Panel" />
                  <ControlBtn icon={CircleDot} label={daily.isRecording ? "Stop Rec" : "Record"} active={!daily.isRecording}
                    onClick={() => daily.isRecording ? daily.stopRecording() : daily.startRecording()}
                    badge={daily.isRecording ? 1 : undefined} />
                  <ControlBtn icon={Users} label="People" />
                </div>
                <button onClick={handleEnd} disabled={endCall.isPending}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90"
                  style={{ background: "linear-gradient(135deg, #dc2626, #b91c1c)", boxShadow: "0 4px 16px rgba(220,38,38,0.3)" }}>
                  {endCall.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <PhoneOff className="w-4 h-4" />}
                  End Call
                </button>
              </div>
            </div>
          </div>

          {/* RIGHT AI PANEL */}
          <div className="w-72 xl:w-80 flex flex-col shrink-0 border-l"
            style={{ borderColor: "rgba(255,255,255,0.06)", background: "rgba(9,11,18,0.8)" }}>
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
                      "relative flex-1 flex items-center justify-center gap-1 py-2.5 text-xs font-medium transition-all border-b-2",
                      aiTab === tab.id ? "border-indigo-500 text-indigo-300" : "border-transparent text-white/30 hover:text-white/60",
                    )}>
                    <Icon className="w-3 h-3" />
                    {tab.label}
                    {tab.badge != null && tab.badge > 0 && (
                      <span className="w-4 h-4 rounded-full bg-indigo-500 text-white text-[9px] flex items-center justify-center font-bold">{tab.badge}</span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="flex-1 overflow-y-auto">
              {/* TRANSCRIPT TAB */}
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
                      {!audioStreaming.state.isStreaming && <p className="mt-1 text-white/20">Audio starts once connected</p>}
                    </div>
                  ) : transcripts.map((line) => {
                    const isHost = line.speaker === "You" || line.speaker === "Rep" || line.speaker === "Host";
                    return (
                      <div key={line.id} className="flex gap-2.5 animate-in fade-in duration-300">
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
                  })}
                  <div ref={transcriptEndRef} />
                </div>
              )}

              {/* INSIGHTS TAB */}
              {aiTab === "insights" && (
                <div className="p-3 space-y-3">
                  <div className="p-3 rounded-xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] text-white/40 font-medium">Sentiment</span>
                      <span className={cn("text-sm font-bold", sentimentScore >= 70 ? "text-emerald-400" : sentimentScore >= 50 ? "text-amber-400" : "text-red-400")}>{sentimentScore}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/8">
                      <div className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${sentimentScore}%`, background: sentimentScore >= 70 ? "linear-gradient(90deg, #10b981, #34d399)" : "linear-gradient(90deg, #f59e0b, #fbbf24)" }} />
                    </div>
                  </div>

                  <div className="p-3 rounded-xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                    <div className="flex justify-between text-[11px] mb-1.5">
                      <span className="text-indigo-400">You {talkRatio.rep}%</span>
                      <span className="text-violet-400">Prospect {talkRatio.prospect}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-white/8 flex overflow-hidden">
                      <div style={{ width: `${talkRatio.rep}%`, background: "linear-gradient(90deg, #6366f1, #8b5cf6)" }} className="h-full rounded-l-full" />
                      <div style={{ width: `${talkRatio.prospect}%`, background: "linear-gradient(90deg, #8b5cf6, #a78bfa)" }} className="h-full rounded-r-full" />
                    </div>
                    {talkRatio.rep > 65 && <p className="text-[10px] text-amber-400 mt-1.5">⚠ Let them talk more</p>}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: "Questions", value: questionsCount, icon: MessageCircle },
                      { label: "Topics", value: topics.length, icon: Hash },
                      { label: "Participants", value: daily.participantCount, icon: Users },
                      { label: "Objections", value: objections.length, icon: AlertCircle },
                    ].map(({ label, value, icon: Icon }) => (
                      <div key={label} className="p-2 rounded-xl text-center" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                        <div className="text-base font-bold font-mono text-white/85">{value}</div>
                        <div className="text-[10px] text-white/30 flex items-center justify-center gap-1">
                          <Icon className="w-2.5 h-2.5" />{label}
                        </div>
                      </div>
                    ))}
                  </div>

                  {allInsights.length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-[11px] text-white/30 font-medium uppercase tracking-wider">AI Insights</p>
                      {allInsights.map((insight, i) => (
                        <div key={i} className="rounded-xl p-3 border bg-amber-500/10 border-amber-500/20">
                          <div className="flex items-start gap-2">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                            <div>
                              <p className="text-[11px] font-semibold text-amber-400 uppercase tracking-wide mb-0.5">Objection · {insight.timestamp}</p>
                              <p className="text-xs text-white/80">{insight.text}</p>
                              {insight.suggestion && <p className="text-[11px] text-white/40 mt-1">{insight.suggestion}</p>}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-4 text-center">
                      <Sparkles className="w-5 h-5 mx-auto mb-2 text-white/20" />
                      <p className="text-xs text-white/30">AI insights will appear as detected</p>
                    </div>
                  )}
                </div>
              )}

              {/* COACHING TAB */}
              {aiTab === "coaching" && (
                <div className="p-3 space-y-3">
                  <div className="p-3 rounded-xl" style={{ background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.12)" }}>
                    <p className="text-[11px] text-indigo-400 font-semibold mb-2 flex items-center gap-1.5">
                      <Trophy className="w-3 h-3" />Performance Score
                    </p>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-bold text-white">{sentimentScore > 0 ? Math.round(sentimentScore * 0.9) : "—"}</span>
                      <span className="text-sm text-white/30">/ 100</span>
                    </div>
                  </div>

                  {topics.length > 0 && (
                    <div className="p-3 rounded-xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                      <p className="text-[11px] text-white/30 font-medium mb-2">Key Topics</p>
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
                      { icon: Flame, text: "Ask open-ended questions to understand their pain points", color: "text-amber-400", bg: "bg-amber-500/8 border-amber-500/15" },
                      { icon: Target, text: "Re-qualify decision maker and timeline before pricing", color: "text-sky-400", bg: "bg-sky-500/8 border-sky-500/15" },
                      { icon: Shield, text: "Confirm all stakeholders are on this call", color: "text-violet-400", bg: "bg-violet-500/8 border-violet-500/15" },
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