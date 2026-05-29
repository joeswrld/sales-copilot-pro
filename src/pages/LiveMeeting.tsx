/**
 * LiveMeeting.tsx — AI-Powered Meeting Workspace
 *
 * Premium 3-column layout:
 *  Left   — Participants, Team Chat, Notes, Files, Deals, Notifications
 *  Center — Live video grid with adaptive layouts
 *  Right  — AI Intelligence: transcript, objections, insights, coaching
 *
 * Bottom floating control bar (Zoom-inspired, premium dark)
 */

import DashboardLayout from "@/components/DashboardLayout";
import LiveUsageAlert from "@/components/LiveUsageAlert";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Loader2, AlertCircle, Lightbulb, TrendingUp, Clock,
  MessageSquare, BarChart3, Target, Radio,
  Users, StopCircle, ChevronDown, ChevronUp, ChevronRight,
  Zap, Mic, MicOff, Video, VideoOff, MonitorPlay, Phone,
  PhoneOff, Settings, Bell, MoreHorizontal, Hash,
  FileText, Paperclip, Star, Send, Smile, Reply,
  Check, CheckCheck, Plus, X, AlertTriangle, Shield,
  Activity, BrainCircuit, Sparkles, ThumbsUp, Heart,
  Eye, EyeOff, Volume2, VolumeX, Signal, Wifi,
  ArrowRight, Calendar, Link2, Tag, TrendingDown,
  Brain, FlaskConical, MessageCircle, BookOpen,
  Trophy, Flame, Gauge, CircleDot,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLiveCall } from "@/hooks/useLiveCall";
import { useTeam } from "@/hooks/useTeam";
import { useUserStatus } from "@/hooks/useUserStatus";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import { usePlanEnforcement } from "@/contexts/PlanEnforcementContext";

// ─── Types ────────────────────────────────────────────────────────────────────
type SidebarTab = "participants" | "chat" | "notes" | "files" | "deals" | "agenda";
type AITab = "transcript" | "insights" | "coaching";

interface Participant {
  id: string;
  name: string;
  initials: string;
  role: "host" | "guest";
  isAudioOn: boolean;
  isVideoOn: boolean;
  isSpeaking: boolean;
  signalStrength: number;
}

interface ChatMessage {
  id: string;
  sender: string;
  initials: string;
  text: string;
  time: string;
  reactions?: string[];
  isMe?: boolean;
}

interface AIInsight {
  type: "objection" | "signal" | "coaching" | "competitor" | "sentiment";
  text: string;
  suggestion?: string;
  timestamp: string;
  priority: "high" | "medium" | "low";
}

// ─── Mock participants for demo ────────────────────────────────────────────────
const DEMO_PARTICIPANTS: Participant[] = [
  { id: "1", name: "Joseph (You)", initials: "JO", role: "host", isAudioOn: true, isVideoOn: true, isSpeaking: false, signalStrength: 4 },
  { id: "2", name: "Sarah Johnson", initials: "SJ", role: "guest", isAudioOn: true, isVideoOn: true, isSpeaking: true, signalStrength: 3 },
  { id: "3", name: "Michael Chen", initials: "MC", role: "guest", isAudioOn: false, isVideoOn: false, isSpeaking: false, signalStrength: 4 },
  { id: "4", name: "Daniel Kim", initials: "DK", role: "guest", isAudioOn: false, isVideoOn: true, isSpeaking: false, signalStrength: 2 },
];

const DEMO_CHAT: ChatMessage[] = [
  { id: "1", sender: "Sarah Johnson", initials: "SJ", text: "Can you share the pricing deck?", time: "10:22", isMe: false },
  { id: "2", sender: "You", initials: "JO", text: "Sure, sharing now. Check the Files tab.", time: "10:23", isMe: true },
  { id: "3", sender: "Michael Chen", initials: "MC", text: "The integration timeline looks tight 👀", time: "10:24", isMe: false, reactions: ["👍", "💯"] },
];

const DEMO_INSIGHTS: AIInsight[] = [
  { type: "objection", text: "Pricing objection detected", suggestion: "Try asking about their budget and timeline to qualify further.", timestamp: "10:21", priority: "high" },
  { type: "competitor", text: "HubSpot mentioned", suggestion: "Compare feature depth — highlight your AI-native approach.", timestamp: "10:22", priority: "medium" },
  { type: "signal", text: "Positive sentiment increased", suggestion: "Sarah is engaged. Ask about decision timeline now.", timestamp: "10:23", priority: "low" },
  { type: "coaching", text: "Ask a follow-up question", suggestion: "Try asking about their budget and timeline to move the conversation forward.", timestamp: "10:23", priority: "medium" },
];

// ─── Signal bars ──────────────────────────────────────────────────────────────
function SignalBars({ strength }: { strength: number }) {
  return (
    <div className="flex items-end gap-px h-3">
      {[1, 2, 3, 4].map((bar) => (
        <div
          key={bar}
          className={cn(
            "w-1 rounded-sm transition-all",
            bar <= strength ? "bg-emerald-400" : "bg-white/20",
          )}
          style={{ height: `${bar * 3}px` }}
        />
      ))}
    </div>
  );
}

// ─── Participant avatar ───────────────────────────────────────────────────────
function Avatar({ initials, size = "md", isSpeaking = false, hasVideo = false }: {
  initials: string;
  size?: "sm" | "md" | "lg";
  isSpeaking?: boolean;
  hasVideo?: boolean;
}) {
  const sizeMap = { sm: "w-8 h-8 text-xs", md: "w-10 h-10 text-sm", lg: "w-16 h-16 text-lg" };
  return (
    <div className={cn("relative rounded-full shrink-0", sizeMap[size])}>
      {isSpeaking && (
        <div className="absolute inset-0 rounded-full border-2 border-emerald-400 animate-pulse" />
      )}
      <div className={cn(
        "w-full h-full rounded-full flex items-center justify-center font-semibold",
        "bg-gradient-to-br from-violet-500/40 to-indigo-600/40 border border-white/10 text-white",
      )}>
        {initials}
      </div>
      {isSpeaking && (
        <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border border-[#0d0f14]">
          <span className="sr-only">Speaking</span>
        </div>
      )}
    </div>
  );
}

// ─── Video tile ───────────────────────────────────────────────────────────────
function VideoTile({ participant, size = "normal", isMain = false }: {
  participant: Participant;
  size?: "normal" | "large" | "small";
  isMain?: boolean;
}) {
  const { isSpeaking, isVideoOn, isAudioOn, name, initials, role } = participant;

  return (
    <div className={cn(
      "relative rounded-2xl overflow-hidden border transition-all duration-300",
      isMain ? "rounded-2xl" : "rounded-xl",
      isSpeaking
        ? "border-emerald-400/60 shadow-[0_0_20px_rgba(52,211,153,0.15)]"
        : "border-white/8",
    )}
      style={{
        background: isVideoOn
          ? "linear-gradient(135deg, #1a1d26 0%, #0f1117 100%)"
          : "linear-gradient(135deg, #12141c 0%, #0a0c13 100%)",
        boxShadow: isSpeaking ? "0 0 0 2px rgba(52,211,153,0.4)" : undefined,
      }}
    >
      {/* Video placeholder — real impl uses HMS tracks */}
      {!isVideoOn && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Avatar
            initials={initials}
            size={isMain ? "lg" : size === "small" ? "sm" : "md"}
            isSpeaking={isSpeaking}
          />
        </div>
      )}

      {isVideoOn && (
        <div className="absolute inset-0 flex items-center justify-center">
          {/* Camera feed placeholder — shows a gradient stand-in */}
          <div
            className="w-full h-full"
            style={{
              background: `radial-gradient(ellipse at 50% 35%, ${
                role === "host" ? "rgba(99,102,241,0.15)" : "rgba(139,92,246,0.12)"
              } 0%, transparent 70%)`,
            }}
          />
          <div className="absolute inset-0 flex items-center justify-center opacity-20">
            <Video className="w-10 h-10 text-white" />
          </div>
        </div>
      )}

      {/* Speaking indicator overlay */}
      {isSpeaking && (
        <div className="absolute inset-0 rounded-2xl border-2 border-emerald-400/50 pointer-events-none animate-pulse" />
      )}

      {/* Bottom info bar */}
      <div className="absolute bottom-0 left-0 right-0 p-2.5 flex items-center justify-between"
        style={{ background: "linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 100%)" }}
      >
        <div className="flex items-center gap-2">
          {isSpeaking && (
            <div className="flex items-center gap-0.5">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="w-1 bg-emerald-400 rounded-full animate-bounce"
                  style={{ height: `${4 + i * 3}px`, animationDelay: `${i * 100}ms` }}
                />
              ))}
            </div>
          )}
          <span className="text-xs font-medium text-white/90 truncate">{name}</span>
          {role === "host" && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/30 text-indigo-300 border border-indigo-500/20">
              Host
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {!isAudioOn && <MicOff className="w-3 h-3 text-red-400" />}
          {!isVideoOn && <VideoOff className="w-3 h-3 text-orange-400/70" />}
          <SignalBars strength={participant.signalStrength} />
        </div>
      </div>
    </div>
  );
}

// ─── Sidebar section ──────────────────────────────────────────────────────────
function SidebarSection({ title, children, badge }: {
  title: string;
  children: React.ReactNode;
  badge?: number;
}) {
  return (
    <div className="py-2">
      <div className="flex items-center justify-between px-3 mb-2">
        <span className="text-[11px] font-semibold text-white/30 uppercase tracking-widest">{title}</span>
        {badge != null && badge > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-medium">
            {badge}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

// ─── AI Insight card ──────────────────────────────────────────────────────────
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
            <span className={cn("text-[11px] font-semibold uppercase tracking-wide", config.color)}>
              {config.label}
            </span>
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

// ─── Transcript line ──────────────────────────────────────────────────────────
function TranscriptLine({ line }: { line: any }) {
  const isYou = line.speaker === "You" || line.speaker === "Rep" || line.speaker === "Host";
  return (
    <div className="group flex gap-2.5 animate-in fade-in slide-in-from-bottom-1 duration-300">
      <div className="mt-0.5 shrink-0">
        <div className={cn(
          "w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold",
          isYou ? "bg-indigo-500/30 text-indigo-300" : "bg-violet-500/20 text-violet-300",
        )}>
          {(line.speaker_name || line.speaker || "?")[0]?.toUpperCase()}
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className={cn("text-[11px] font-semibold", isYou ? "text-indigo-400" : "text-violet-400")}>
            {line.speaker_name || line.speaker}
          </span>
          <span className="text-[10px] text-white/20">
            {new Date(line.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </span>
        </div>
        <p className="text-xs text-white/75 leading-relaxed">{line.text}</p>
      </div>
    </div>
  );
}

// ─── Control button ────────────────────────────────────────────────────────────
function ControlBtn({ icon: Icon, label, onClick, active = true, danger = false, badge }: {
  icon: React.FC<any>;
  label: string;
  onClick?: () => void;
  active?: boolean;
  danger?: boolean;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative flex flex-col items-center gap-1.5 px-4 py-2.5 rounded-xl transition-all group",
        danger
          ? "bg-red-500/90 hover:bg-red-500 text-white"
          : active
            ? "bg-white/8 hover:bg-white/12 text-white"
            : "bg-red-500/15 border border-red-500/25 text-red-400 hover:bg-red-500/20",
      )}
    >
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
  const { hasFeature } = usePlanEnforcement();

  const { liveCall, isLive, isLoading, transcripts, objections, topics, endCall, callId } =
    useLiveCall({ onCallEnded: () => setStatus("available") });

  // UI state
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("participants");
  const [aiTab, setAiTab] = useState<AITab>("transcript");
  const [isAudioOn, setIsAudioOn] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isAIPanelOpen, setIsAIPanelOpen] = useState(true);
  const [chatInput, setChatInput] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [planMinutes] = useState({ used: 126, total: 300 });

  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<number>();

  const meetingType = (liveCall as any)?.meeting_type as string | undefined;

  // Derive talk ratio from real transcripts
  const talkRatio = useMemo(() => {
    if (!transcripts.length) return { rep: 50, prospect: 50 };
    const isHost = (t: any) => t.speaker === "You" || t.speaker === "Rep" || t.speaker === "Host";
    const rw = transcripts.filter(isHost).reduce((s, t) => s + t.text.split(/\s+/).length, 0);
    const pw = transcripts.filter((t) => !isHost(t)).reduce((s, t) => s + t.text.split(/\s+/).length, 0);
    const total = rw + pw;
    if (!total) return { rep: 50, prospect: 50 };
    return { rep: Math.round((rw / total) * 100), prospect: Math.round((pw / total) * 100) };
  }, [transcripts]);

  const questionsCount = useMemo(
    () => transcripts.filter((t) => t.text.includes("?")).length,
    [transcripts],
  );

  // Combine real objections with demo insights for display
  const allInsights: AIInsight[] = useMemo(() => {
    const fromObjections: AIInsight[] = objections.map((obj) => ({
      type: "objection" as const,
      text: obj.objection_type,
      suggestion: obj.suggestion ?? undefined,
      timestamp: new Date(obj.detected_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      priority: "high" as const,
    }));
    return fromObjections.length > 0 ? fromObjections : DEMO_INSIGHTS;
  }, [objections]);

  const formatTime = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  // Timer
  useEffect(() => {
    if (isLive && liveCall?.start_time) {
      const start = new Date(liveCall.start_time).getTime();
      const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
      tick();
      intervalRef.current = window.setInterval(tick, 1000);
      return () => clearInterval(intervalRef.current);
    }
    setElapsed(0);
  }, [isLive, liveCall?.start_time]);

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcripts.length]);

  // Redirect if no live call
  useEffect(() => {
    if (!isLoading && !isLive) navigate("/live");
  }, [isLoading, isLive, navigate]);

  const handleEnd = async () => {
    try {
      await endCall.mutateAsync();
      toast.success("Call ended — generating AI summary…");
      navigate(callId ? `/calls/${callId}` : "/live");
    } catch {
      toast.error("Failed to end call");
    }
  };

  // Use real transcripts or demo data
  const displayTranscripts = transcripts.length > 0 ? transcripts : [];
  const sentimentScore = liveCall?.sentiment_score ?? 74;
  const minutePct = Math.round((planMinutes.used / planMinutes.total) * 100);

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
      {/* ── Full-screen meeting workspace ─────────────────────────────────── */}
      <div
        className="flex flex-col -mx-4 -mt-4"
        style={{
          height: "calc(100vh - 3.5rem)",
          background: "linear-gradient(180deg, #0a0c13 0%, #0d0f18 100%)",
        }}
      >

        {/* ── TOP NAV BAR ──────────────────────────────────────────────────── */}
        <div
          className="flex items-center justify-between px-4 py-2.5 shrink-0 border-b"
          style={{
            borderColor: "rgba(255,255,255,0.06)",
            background: "rgba(13,15,24,0.95)",
            backdropFilter: "blur(20px)",
          }}
        >
          {/* Left: title + status */}
          <div className="flex items-center gap-4 min-w-0">
            <div className="flex items-center gap-2.5">
              <div
                className="w-2 h-2 rounded-full bg-red-500 shrink-0"
                style={{ boxShadow: "0 0 6px rgba(239,68,68,0.8)" }}
              />
              <span className="text-[11px] font-semibold text-red-400 uppercase tracking-widest">Live</span>
            </div>

            <div className="h-4 w-px bg-white/10" />

            <div className="min-w-0">
              <span className="text-sm font-semibold text-white truncate">
                {liveCall?.name || "Discovery Call with Acme Corp"}
              </span>
            </div>

            {meetingType && (
              <div
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium"
                style={{
                  background: "rgba(99,102,241,0.12)",
                  border: "1px solid rgba(99,102,241,0.2)",
                  color: "#a5b4fc",
                }}
              >
                <Tag className="w-3 h-3" />
                {meetingType.charAt(0).toUpperCase() + meetingType.slice(1)}
              </div>
            )}
          </div>

          {/* Center: timer + minutes */}
          <div className="flex items-center gap-5">
            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-white/35" />
              <span className="text-sm font-mono font-semibold text-white/90 tabular-nums">
                {formatTime(elapsed)}
              </span>
            </div>

            {/* Minutes used */}
            <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
            >
              <div className="flex items-center gap-1.5">
                <Gauge className="w-3.5 h-3.5 text-white/35" />
                <span className="text-xs text-white/50">Minutes left in plan</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-white/80 tabular-nums">
                  {planMinutes.used} / {planMinutes.total} mins
                </span>
                <div className="w-24 h-1 rounded-full bg-white/10">
                  <div
                    className={cn("h-1 rounded-full transition-all", minutePct > 80 ? "bg-amber-400" : "bg-indigo-500")}
                    style={{ width: `${minutePct}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Recording */}
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl"
              style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.15)" }}
            >
              <div
                className="w-2 h-2 rounded-full bg-red-500"
                style={{ animation: "pulse 1.5s ease-in-out infinite" }}
              />
              <span className="text-xs font-medium text-red-400">Recording</span>
            </div>
          </div>

          {/* Right: avatars + controls */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="flex -space-x-2">
              {DEMO_PARTICIPANTS.slice(0, 3).map((p) => (
                <div
                  key={p.id}
                  className="w-7 h-7 rounded-full border-2 flex items-center justify-center text-[10px] font-bold text-white"
                  style={{
                    borderColor: "#0d0f18",
                    background: p.isSpeaking
                      ? "linear-gradient(135deg, #10b981, #059669)"
                      : "linear-gradient(135deg, #6366f1, #8b5cf6)",
                  }}
                  title={p.name}
                >
                  {p.initials}
                </div>
              ))}
              {DEMO_PARTICIPANTS.length > 3 && (
                <div
                  className="w-7 h-7 rounded-full border-2 flex items-center justify-center text-[10px] font-semibold text-white/60"
                  style={{ borderColor: "#0d0f18", background: "rgba(255,255,255,0.08)" }}
                >
                  +{DEMO_PARTICIPANTS.length - 3}
                </div>
              )}
            </div>

            <button className="w-7 h-7 rounded-lg flex items-center justify-center text-white/40 hover:text-white/70 hover:bg-white/8 transition-all">
              <Bell className="w-4 h-4" />
            </button>
            <button className="w-7 h-7 rounded-lg flex items-center justify-center text-white/40 hover:text-white/70 hover:bg-white/8 transition-all">
              <Settings className="w-4 h-4" />
            </button>

            {/* User avatar */}
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white cursor-pointer"
              style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)", boxShadow: "0 0 8px rgba(99,102,241,0.3)" }}
            >
              JO
            </div>
          </div>
        </div>

        {/* ── MAIN 3-COLUMN LAYOUT ──────────────────────────────────────────── */}
        <div className="flex flex-1 min-h-0 overflow-hidden">

          {/* ── LEFT SIDEBAR ──────────────────────────────────────────────── */}
          <div
            className={cn(
              "flex flex-col shrink-0 transition-all duration-300 border-r",
              isSidebarOpen ? "w-60" : "w-0 overflow-hidden",
            )}
            style={{ borderColor: "rgba(255,255,255,0.06)", background: "rgba(9,11,18,0.8)" }}
          >
            {/* Sidebar tabs */}
            <div
              className="flex gap-1 p-2 shrink-0 border-b overflow-x-auto scrollbar-none"
              style={{ borderColor: "rgba(255,255,255,0.06)" }}
            >
              {([
                { id: "participants", icon: Users, label: "People" },
                { id: "chat", icon: MessageSquare, label: "Chat", badge: DEMO_CHAT.length },
                { id: "notes", icon: FileText, label: "Notes" },
                { id: "files", icon: Paperclip, label: "Files" },
                { id: "deals", icon: Tag, label: "Deals" },
                { id: "agenda", icon: BookOpen, label: "Agenda" },
              ] as { id: SidebarTab; icon: React.FC<any>; label: string; badge?: number }[]).map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setSidebarTab(tab.id)}
                    className={cn(
                      "relative flex flex-col items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] transition-all shrink-0",
                      sidebarTab === tab.id
                        ? "bg-indigo-500/15 text-indigo-300"
                        : "text-white/30 hover:text-white/60 hover:bg-white/5",
                    )}
                    title={tab.label}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="font-medium">{tab.label}</span>
                    {tab.badge != null && tab.badge > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-indigo-500 text-white text-[8px] flex items-center justify-center font-bold">
                        {tab.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Sidebar content */}
            <div className="flex-1 overflow-y-auto">

              {/* Participants */}
              {sidebarTab === "participants" && (
                <div className="p-2 space-y-0.5">
                  {DEMO_PARTICIPANTS.map((p) => (
                    <div
                      key={p.id}
                      className={cn(
                        "flex items-center gap-2.5 p-2 rounded-xl transition-all group cursor-pointer",
                        p.isSpeaking ? "bg-emerald-500/8" : "hover:bg-white/4",
                      )}
                    >
                      <Avatar initials={p.initials} size="sm" isSpeaking={p.isSpeaking} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-white/85 truncate">{p.name}</p>
                        <p className="text-[10px] text-white/30">
                          {p.isSpeaking ? "Speaking..." : p.role === "host" ? "Host" : "Guest"}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {p.isAudioOn
                          ? <Mic className="w-3 h-3 text-white/25" />
                          : <MicOff className="w-3 h-3 text-red-400/70" />
                        }
                        <SignalBars strength={p.signalStrength} />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Team Chat */}
              {sidebarTab === "chat" && (
                <div className="flex flex-col h-full">
                  <div className="flex-1 p-2 space-y-3 overflow-y-auto">
                    {DEMO_CHAT.map((msg) => (
                      <div key={msg.id} className={cn("flex gap-2", msg.isMe && "flex-row-reverse")}>
                        {!msg.isMe && (
                          <div
                            className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-[10px] font-bold text-white"
                            style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
                          >
                            {msg.initials}
                          </div>
                        )}
                        <div className={cn("max-w-[160px]", msg.isMe && "items-end flex flex-col")}>
                          {!msg.isMe && (
                            <span className="text-[10px] text-white/30 ml-0.5 mb-0.5">{msg.sender}</span>
                          )}
                          <div
                            className={cn(
                              "px-2.5 py-1.5 rounded-xl text-xs text-white/85 leading-relaxed",
                              msg.isMe
                                ? "rounded-tr-sm"
                                : "rounded-tl-sm",
                            )}
                            style={{
                              background: msg.isMe
                                ? "linear-gradient(135deg, rgba(99,102,241,0.35), rgba(139,92,246,0.25))"
                                : "rgba(255,255,255,0.07)",
                              border: "1px solid rgba(255,255,255,0.08)",
                            }}
                          >
                            {msg.text}
                          </div>
                          {msg.reactions && (
                            <div className="flex gap-1 mt-1">
                              {msg.reactions.map((r, i) => (
                                <span key={i} className="text-xs px-1.5 py-0.5 rounded-full bg-white/8 border border-white/10">
                                  {r}
                                </span>
                              ))}
                            </div>
                          )}
                          <span className="text-[10px] text-white/20 mt-0.5">{msg.time}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="p-2 border-t shrink-0" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                    <div className="flex gap-1.5">
                      <input
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        placeholder="Message team..."
                        className="flex-1 text-xs px-2.5 py-1.5 rounded-xl outline-none text-white/80 placeholder:text-white/20"
                        style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}
                      />
                      <button
                        className="w-7 h-7 rounded-xl flex items-center justify-center text-indigo-400 transition-all hover:bg-indigo-500/20 shrink-0"
                        style={{ background: "rgba(99,102,241,0.12)" }}
                      >
                        <Send className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Notes */}
              {sidebarTab === "notes" && (
                <div className="p-3 space-y-2">
                  <p className="text-[10px] text-white/25 font-medium uppercase tracking-wider">Meeting Notes</p>
                  <textarea
                    placeholder="Start typing notes..."
                    rows={12}
                    className="w-full text-xs text-white/75 bg-transparent outline-none resize-none leading-relaxed placeholder:text-white/20"
                  />
                  <div className="pt-2 border-t" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                    <p className="text-[10px] text-white/25 mb-2">Action Items</p>
                    {["Follow up on pricing", "Share integration docs"].map((item, i) => (
                      <div key={i} className="flex items-center gap-2 py-1">
                        <div className="w-3.5 h-3.5 rounded border border-white/20 shrink-0" />
                        <span className="text-xs text-white/55">{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Files */}
              {sidebarTab === "files" && (
                <div className="p-2 space-y-1">
                  {["Fixsense_Pricing_2025.pdf", "Integration_Timeline.xlsx", "Demo_Deck.pptx"].map((file) => (
                    <div
                      key={file}
                      className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-white/5 transition-all cursor-pointer group"
                    >
                      <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                        style={{ background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.2)" }}
                      >
                        <FileText className="w-3.5 h-3.5 text-indigo-400" />
                      </div>
                      <span className="text-xs text-white/65 truncate">{file}</span>
                    </div>
                  ))}
                  <button className="w-full mt-2 flex items-center justify-center gap-2 py-2 rounded-xl text-xs text-white/30 hover:text-white/60 border border-dashed border-white/10 hover:border-white/20 transition-all">
                    <Plus className="w-3.5 h-3.5" />Share file
                  </button>
                </div>
              )}

              {/* Deals */}
              {sidebarTab === "deals" && (
                <div className="p-2 space-y-2">
                  <div
                    className="p-3 rounded-xl border"
                    style={{ background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.15)" }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold text-white/85">Acme Corporation</p>
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                        style={{ background: "rgba(99,102,241,0.2)", color: "#a5b4fc" }}
                      >
                        Proposal Sent
                      </span>
                    </div>
                    <p className="text-base font-bold text-emerald-400">$42,000</p>
                    <div className="mt-2 text-[11px] text-white/40 space-y-0.5">
                      <div className="flex justify-between">
                        <span>Stage</span><span className="text-white/60">Demo</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Close date</span><span className="text-white/60">Jun 30</span>
                      </div>
                    </div>
                  </div>
                  <button className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs text-white/30 hover:text-white/60 border border-dashed border-white/10 hover:border-white/20 transition-all">
                    <Plus className="w-3.5 h-3.5" />Attach Deal
                  </button>
                </div>
              )}

              {/* Agenda */}
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
                      <div className={cn(
                        "w-4 h-4 rounded-full flex items-center justify-center shrink-0 text-[9px]",
                        item.done
                          ? "bg-emerald-500/20 border border-emerald-500/40"
                          : "bg-white/8 border border-white/15",
                      )}>
                        {item.done && <Check className="w-2.5 h-2.5 text-emerald-400" />}
                      </div>
                      <span className={cn("text-xs flex-1", item.done ? "text-white/35 line-through" : "text-white/75")}>
                        {item.text}
                      </span>
                      <span className="text-[10px] text-white/25 shrink-0">{item.time}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── CENTER: VIDEO GRID ─────────────────────────────────────────── */}
          <div className="flex-1 flex flex-col min-w-0 relative">

            {/* Video grid */}
            <div className="flex-1 p-3 min-h-0">
              {DEMO_PARTICIPANTS.length === 1 && (
                <div className="h-full">
                  <VideoTile participant={DEMO_PARTICIPANTS[0]} isMain size="large" />
                </div>
              )}

              {DEMO_PARTICIPANTS.length === 2 && (
                <div className="grid grid-cols-2 gap-3 h-full">
                  {DEMO_PARTICIPANTS.map((p) => (
                    <VideoTile key={p.id} participant={p} size="large" />
                  ))}
                </div>
              )}

              {DEMO_PARTICIPANTS.length >= 3 && (
                <div className="grid gap-3 h-full" style={{ gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr" }}>
                  {/* Main speaker — top half, full width */}
                  <div className="col-span-2 row-span-1 min-h-0">
                    <VideoTile
                      participant={DEMO_PARTICIPANTS.find((p) => p.isSpeaking) || DEMO_PARTICIPANTS[1]}
                      isMain
                      size="large"
                    />
                  </div>
                  {/* Others — bottom row */}
                  {DEMO_PARTICIPANTS
                    .filter((p) => !p.isSpeaking)
                    .slice(0, 3)
                    .map((p) => (
                      <VideoTile key={p.id} participant={p} size="small" />
                    ))}
                </div>
              )}
            </div>

            {/* AI status bar */}
            <div
              className="mx-3 mb-2 px-4 py-2 rounded-xl flex items-center justify-between shrink-0"
              style={{ background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.12)" }}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className="w-5 h-5 rounded-lg flex items-center justify-center"
                  style={{ background: "rgba(99,102,241,0.2)" }}
                >
                  <Sparkles className="w-3 h-3 text-indigo-400" />
                </div>
                <span className="text-xs text-white/50">
                  AI is actively analyzing the conversation
                </span>
                {allInsights.length > 0 && (
                  <span className="text-xs text-indigo-400 font-medium">
                    · {allInsights.length} insight{allInsights.length !== 1 ? "s" : ""} detected
                  </span>
                )}
              </div>
              <button
                className="text-xs text-indigo-400/70 hover:text-indigo-300 transition-colors flex items-center gap-1"
                onClick={() => { setAiTab("insights"); setIsAIPanelOpen(true); }}
              >
                View live insights
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>

            {/* ── FLOATING CONTROL BAR ──────────────────────────────────────── */}
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
                {/* Left controls */}
                <div className="flex items-center gap-1">
                  <ControlBtn
                    icon={isAudioOn ? Mic : MicOff}
                    label="Mic"
                    active={isAudioOn}
                    onClick={() => setIsAudioOn((v) => !v)}
                  />
                  <ControlBtn
                    icon={isVideoOn ? Video : VideoOff}
                    label="Camera"
                    active={isVideoOn}
                    onClick={() => setIsVideoOn((v) => !v)}
                  />
                  <ControlBtn icon={MonitorPlay} label="Share Screen" />
                </div>

                {/* Center controls */}
                <div className="flex items-center gap-1">
                  <ControlBtn
                    icon={MessageSquare}
                    label="Chat"
                    badge={3}
                    onClick={() => { setSidebarTab("chat"); setIsSidebarOpen(true); }}
                  />
                  <ControlBtn
                    icon={Sparkles}
                    label="AI Assistant"
                    onClick={() => setIsAIPanelOpen((v) => !v)}
                  />
                  <ControlBtn icon={CircleDot} label="Record" />
                  <ControlBtn icon={Users} label="People" onClick={() => { setSidebarTab("participants"); setIsSidebarOpen((v) => !v); }} />
                </div>

                {/* Right: end call */}
                <div className="flex items-center gap-1.5">
                  <ControlBtn icon={MoreHorizontal} label="More" />
                  <button
                    onClick={handleEnd}
                    disabled={endCall.isPending}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-[0.98]"
                    style={{
                      background: "linear-gradient(135deg, #dc2626, #b91c1c)",
                      boxShadow: "0 4px 16px rgba(220,38,38,0.3)",
                    }}
                  >
                    {endCall.isPending
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <PhoneOff className="w-4 h-4" />
                    }
                    End Call
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* ── RIGHT AI PANEL ──────────────────────────────────────────────── */}
          <div
            className={cn(
              "flex flex-col shrink-0 transition-all duration-300 border-l",
              isAIPanelOpen ? "w-80" : "w-0 overflow-hidden",
            )}
            style={{ borderColor: "rgba(255,255,255,0.06)", background: "rgba(9,11,18,0.8)" }}
          >
            {/* AI panel header */}
            <div
              className="flex items-center justify-between px-4 py-3 border-b shrink-0"
              style={{ borderColor: "rgba(255,255,255,0.06)" }}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className="w-6 h-6 rounded-lg flex items-center justify-center"
                  style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.3), rgba(139,92,246,0.2))", border: "1px solid rgba(99,102,241,0.25)" }}
                >
                  <BrainCircuit className="w-3.5 h-3.5 text-indigo-400" />
                </div>
                <span className="text-sm font-semibold text-white/85">AI Assistant</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" style={{ boxShadow: "0 0 4px rgba(52,211,153,0.8)" }} />
                <span className="text-[10px] font-semibold text-emerald-400">LIVE</span>
              </div>
            </div>

            {/* AI tabs */}
            <div
              className="flex border-b shrink-0"
              style={{ borderColor: "rgba(255,255,255,0.06)" }}
            >
              {([
                { id: "transcript", label: "Transcript", icon: MessageSquare },
                { id: "insights", label: "Insights", icon: Sparkles, badge: allInsights.length },
                { id: "coaching", label: "Notes", icon: Brain },
              ] as { id: AITab; label: string; icon: React.FC<any>; badge?: number }[]).map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setAiTab(tab.id)}
                    className={cn(
                      "relative flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-all border-b-2",
                      aiTab === tab.id
                        ? "border-indigo-500 text-indigo-300"
                        : "border-transparent text-white/30 hover:text-white/60",
                    )}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {tab.label}
                    {tab.badge != null && tab.badge > 0 && (
                      <span className="w-4 h-4 rounded-full bg-indigo-500 text-white text-[9px] flex items-center justify-center font-bold">
                        {tab.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* AI panel content */}
            <div className="flex-1 overflow-y-auto">

              {/* TRANSCRIPT TAB */}
              {aiTab === "transcript" && (
                <div className="p-3 space-y-3">
                  <div className="flex items-center gap-2 py-1.5 px-2.5 rounded-xl"
                    style={{ background: "rgba(52,211,153,0.06)", border: "1px solid rgba(52,211,153,0.12)" }}
                  >
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-[11px] text-emerald-400 font-medium">Live Transcript ·</span>
                    <span className="text-[11px] text-white/40">{displayTranscripts.length || 3} lines</span>
                  </div>

                  {/* Demo transcript when no real data */}
                  {displayTranscripts.length === 0 ? (
                    <div className="space-y-3">
                      {[
                        { speaker: "Sarah Johnson", text: "We're considering other solutions like HubSpot and Salesforce...", time: "10:21", isHost: false },
                        { speaker: "Joseph", text: "That makes sense. What are the main challenges you're facing with your current tools?", time: "10:22", isHost: true },
                        { speaker: "Sarah Johnson", text: "Mostly the integration and the reporting. It takes too long.", time: "10:23", isHost: false },
                      ].map((line, i) => (
                        <div key={i} className="flex gap-2.5">
                          <div className={cn(
                            "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0 mt-0.5",
                            line.isHost
                              ? "bg-gradient-to-br from-indigo-500/50 to-violet-600/50"
                              : "bg-gradient-to-br from-violet-500/30 to-pink-600/30",
                          )}>
                            {line.speaker[0]}
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className={cn("text-[11px] font-semibold", line.isHost ? "text-indigo-400" : "text-violet-400")}>
                                {line.speaker}
                              </span>
                              <span className="text-[10px] text-white/20">{line.time}</span>
                            </div>
                            <p className="text-xs text-white/70 leading-relaxed">{line.text}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    displayTranscripts.map((line) => (
                      <TranscriptLine key={line.id} line={line} />
                    ))
                  )}
                  <div ref={transcriptEndRef} />
                </div>
              )}

              {/* INSIGHTS TAB */}
              {aiTab === "insights" && (
                <div className="p-3 space-y-3">
                  {/* Sentiment gauge */}
                  <div
                    className="p-3 rounded-xl"
                    style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] text-white/40 font-medium">Overall Sentiment</span>
                      <span className={cn("text-sm font-bold", sentimentScore >= 70 ? "text-emerald-400" : sentimentScore >= 50 ? "text-amber-400" : "text-red-400")}>
                        {sentimentScore}%
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/8">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${sentimentScore}%`,
                          background: sentimentScore >= 70
                            ? "linear-gradient(90deg, #10b981, #34d399)"
                            : sentimentScore >= 50
                              ? "linear-gradient(90deg, #f59e0b, #fbbf24)"
                              : "linear-gradient(90deg, #ef4444, #f87171)",
                        }}
                      />
                    </div>
                  </div>

                  {/* Talk ratio */}
                  <div
                    className="p-3 rounded-xl"
                    style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] text-white/40 font-medium">Talk Ratio</span>
                      {talkRatio.rep > 65 && (
                        <span className="text-[10px] text-amber-400">⚠ Let them talk more</span>
                      )}
                    </div>
                    <div className="flex justify-between text-[11px] mb-1.5">
                      <span className="text-indigo-400">You {talkRatio.rep}%</span>
                      <span className="text-violet-400">Prospect {talkRatio.prospect}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-white/8 flex overflow-hidden">
                      <div
                        className="h-full rounded-l-full transition-all duration-700"
                        style={{ width: `${talkRatio.rep}%`, background: "linear-gradient(90deg, #6366f1, #8b5cf6)" }}
                      />
                      <div
                        className="h-full rounded-r-full transition-all duration-700"
                        style={{ width: `${talkRatio.prospect}%`, background: "linear-gradient(90deg, #8b5cf6, #a78bfa)" }}
                      />
                    </div>
                  </div>

                  {/* Stats row */}
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: "Questions", value: questionsCount || 4, icon: MessageCircle },
                      { label: "Topics", value: topics.length || 3, icon: Hash },
                      { label: "Engagement", value: "High", icon: TrendingUp },
                      { label: "Objections", value: objections.length || 1, icon: AlertCircle },
                    ].map(({ label, value, icon: Icon }) => (
                      <div
                        key={label}
                        className="p-2 rounded-xl text-center"
                        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
                      >
                        <div className="text-base font-bold font-mono text-white/85">{value}</div>
                        <div className="text-[10px] text-white/30 mt-0.5 flex items-center justify-center gap-1">
                          <Icon className="w-2.5 h-2.5" />{label}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* AI Insight cards */}
                  <div className="space-y-2">
                    <p className="text-[11px] text-white/30 font-medium uppercase tracking-wider px-0.5">
                      AI Insights
                    </p>
                    {allInsights.map((insight, i) => (
                      <InsightCard key={i} insight={insight} />
                    ))}
                  </div>

                  {/* Coaching suggestion */}
                  <div
                    className="p-3 rounded-xl"
                    style={{ background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.2)" }}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <Lightbulb className="w-3.5 h-3.5 text-violet-400" />
                      <span className="text-[11px] font-semibold text-violet-300">Coaching Suggestion</span>
                    </div>
                    <p className="text-xs text-white/60 leading-relaxed mb-2">
                      Try asking about their budget and timeline to move the conversation forward.
                    </p>
                    <button
                      className="flex items-center gap-1.5 text-xs text-violet-400 font-medium hover:text-violet-300 transition-colors"
                      style={{ background: "rgba(139,92,246,0.15)", padding: "4px 10px", borderRadius: "8px", border: "1px solid rgba(139,92,246,0.2)" }}
                    >
                      <MessageCircle className="w-3 h-3" />
                      Ask a follow-up question
                    </button>
                  </div>
                </div>
              )}

              {/* COACHING TAB */}
              {aiTab === "coaching" && (
                <div className="p-3 space-y-3">
                  <div
                    className="p-3 rounded-xl"
                    style={{ background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.12)" }}
                  >
                    <p className="text-[11px] text-indigo-400 font-semibold mb-2 flex items-center gap-1.5">
                      <Trophy className="w-3 h-3" />Performance Score
                    </p>
                    <div className="flex items-baseline gap-1 mb-1">
                      <span className="text-2xl font-bold text-white">87</span>
                      <span className="text-sm text-white/30">/ 100</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/8">
                      <div
                        className="h-full rounded-full"
                        style={{ width: "87%", background: "linear-gradient(90deg, #6366f1, #a78bfa)" }}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-[11px] text-white/30 font-medium uppercase tracking-wider">Tips For This Call</p>
                    {[
                      { icon: Flame, text: "Build on positive sentiment from last 5 mins", color: "text-amber-400", bg: "bg-amber-500/8 border-amber-500/15" },
                      { icon: Target, text: "Re-qualify decision maker and timeline", color: "text-sky-400", bg: "bg-sky-500/8 border-sky-500/15" },
                      { icon: Shield, text: "Address HubSpot concern with feature comparison", color: "text-violet-400", bg: "bg-violet-500/8 border-violet-500/15" },
                    ].map(({ icon: Icon, text, color, bg }, i) => (
                      <div key={i} className={cn("p-2.5 rounded-xl border flex items-start gap-2", bg)}>
                        <Icon className={cn("w-3.5 h-3.5 shrink-0 mt-0.5", color)} />
                        <span className="text-xs text-white/65 leading-relaxed">{text}</span>
                      </div>
                    ))}
                  </div>

                  <div
                    className="p-3 rounded-xl"
                    style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
                  >
                    <p className="text-[11px] text-white/30 font-medium mb-2">Key Topics Detected</p>
                    <div className="flex flex-wrap gap-1.5">
                      {["Pricing", "HubSpot", "Integration", "Reporting", "Timeline"].map((tag) => (
                        <span
                          key={tag}
                          className="text-[11px] px-2 py-0.5 rounded-lg"
                          style={{ background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.2)", color: "#a5b4fc" }}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
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