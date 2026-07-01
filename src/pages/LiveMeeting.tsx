/**
 * LiveMeeting.tsx — v10
 *
 * Mobile-first responsive overhaul:
 *  - Top bar: condensed on mobile, all items fit < 375px
 *  - Control bar: scrollable on very small screens, icons + labels scale
 *  - AI panel & people panel: full-height bottom sheets on mobile
 *  - Left / right panels: hidden on mobile, exposed via sheet
 *  - VideoGrid: fills all available space, grid math fixed for portrait
 *  - Touch targets: all buttons ≥ 44 × 44 px
 *  - Hand raise button in control bar (broadcasts via Daily app-message)
 *  - Noise cancellation toggle (desktop only)
 *  - Screen share now passes better constraints
 *  - Better transport-disconnect handling via useDailyCall v13
 *
 * FIX v10.1: Daily.co SDK throws "property 'token': token should be a string"
 * when token key is present with value null/undefined. All joinCall() calls
 * now use conditional spread: ...(meetingToken ? { token: meetingToken } : {})
 */

import DashboardLayout from "@/components/DashboardLayout";
import {
  useState, useEffect, useRef, useMemo, useCallback, memo,
} from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Loader2, AlertCircle, Clock, MessageSquare, Users, Zap,
  Mic, MicOff, Video, VideoOff, MonitorPlay, PhoneOff,
  FileText, Paperclip, Send, AlertTriangle, Shield,
  BrainCircuit, Sparkles, WifiOff,
  Tag, UserCheck, UserX, Bell, BookOpen,
  Hash, Trophy, Flame, Target, MessageCircle,
  CircleDot, Upload, Eye, EyeOff, Plus,
  ChevronRight, X, Hand, Activity,
  TrendingUp, TrendingDown, Minus, BarChart2,
  ArrowUpRight, CheckCircle2,
  PanelLeft, PanelRight, RefreshCw,
  Maximize2, LayoutGrid, Pin, PinOff,
  Volume2, VolumeX, MonitorOff, MoreHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLiveCall } from "@/hooks/useLiveCall";
import { useDailyCall, DailyParticipant, CallQuality } from "@/hooks/useDailyCall";
import { useAudioStreaming } from "@/hooks/useAudioStreaming";
import { useTeam } from "@/hooks/useTeam";
import { useUserStatus } from "@/hooks/useUserStatus";
import { useUserProfile } from "@/hooks/useSettings";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePendingGuestRequests } from "@/hooks/useGuestApproval";
import { useMeetingWorkspace } from "@/hooks/useMeetingWorkspace";
import { useLiveMeetingAI } from "@/hooks/useLiveMeetingAI";
import { useCoaching } from "@/hooks/useCoaching";
import { useNotifications } from "@/hooks/useNotifications";
import { useMinuteUsage } from "@/hooks/useMeetingUsage";
import { useMeetingHealth } from "@/hooks/useMeetingHealth";
import { MeetingHealthBar } from "@/components/MeetingHealthBar";
import { useAuth } from "@/contexts/AuthContext";
import { VideoTile } from "@/components/VideoTile";
import { toast } from "sonner";

// ─── Constants ─────────────────────────────────────────────────────────────────
const MAX_TRANSCRIPTS = 200;
const MAX_INSIGHTS    = 30;

// ─── Design Tokens ─────────────────────────────────────────────────────────────
const T = {
  bg:      "#080a12",
  panel:   "rgba(12,14,22,0.96)",
  card:    "rgba(255,255,255,0.04)",
  border:  "rgba(255,255,255,0.07)",
  accent:  "#6366f1",
  text:    "rgba(255,255,255,0.85)",
  muted:   "rgba(255,255,255,0.35)",
  subtle:  "rgba(255,255,255,0.12)",
  emerald: "#10b981",
  amber:   "#f59e0b",
  red:     "#ef4444",
};

type MobilePanel = "none" | "people" | "ai" | "chat" | "more";
type LeftTab     = "people" | "chat" | "notes" | "files" | "notifications";
type RightTab    = "transcript" | "insights" | "coaching";
type VideoLayout = "spotlight" | "grid" | "sidebar";

function fmt(s: number) {
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
function qualityColor(q: CallQuality) {
  return q === "excellent" || q === "good" ? T.emerald : q === "fair" ? T.amber : T.red;
}
function sentimentMeta(score: number) {
  if (score >= 70) return { label: "Positive", color: T.emerald, icon: TrendingUp };
  if (score >= 45) return { label: "Neutral",  color: T.amber,   icon: Minus };
  return             { label: "At Risk",  color: T.red,     icon: TrendingDown };
}
function deriveHostName(profile?: { full_name?: string | null; email?: string | null }, authEmail?: string | null) {
  if (profile?.full_name?.trim()) return profile.full_name.trim();
  const email = profile?.email || authEmail || "";
  return email.includes("@") ? email.split("@")[0] : "Host";
}

// ─── Pinnable tile ──────────────────────────────────────────────────────────────
const PinnableTile = memo(({
  participant, activeSpeakerId, isPinned, onPin, className, isMain = false,
}: {
  participant: DailyParticipant;
  activeSpeakerId: string | null;
  isPinned: boolean;
  onPin: (id: string | null) => void;
  className?: string;
  isMain?: boolean;
}) => (
  <div
    className={cn("relative group cursor-pointer select-none rounded-xl overflow-hidden", className)}
    onClick={() => onPin(isPinned ? null : participant.session_id)}
  >
    <VideoTile participant={participant} isMain={isMain} activeSpeakerId={activeSpeakerId} className="w-full h-full" />
    {participant.handRaised && (
      <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-1 rounded-lg z-20"
        style={{ background: "rgba(245,158,11,0.9)", backdropFilter: "blur(8px)" }}>
        <span className="text-sm">✋</span>
        <span className="text-[10px] font-bold text-white hidden sm:block">Raised</span>
      </div>
    )}
    <div className={cn(
      "absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold transition-all duration-150",
      "opacity-0 group-hover:opacity-100", isPinned && "opacity-100",
    )} style={{ background: isPinned ? "rgba(99,102,241,0.85)" : "rgba(0,0,0,0.55)", backdropFilter: "blur(8px)", color: "#fff" }}>
      {isPinned ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
      <span className="hidden sm:block">{isPinned ? "Unpin" : "Pin"}</span>
    </div>
  </div>
));

// ─── Video Grid ─────────────────────────────────────────────────────────────────
const VideoGrid = memo(({
  participants, activeSpeakerId, isConnecting, isConnected, error, roomName, onRetry,
  pinnedId, onPin, layout, onLayoutChange,
}: {
  participants: DailyParticipant[];
  activeSpeakerId: string | null;
  isConnecting: boolean; isConnected: boolean;
  error: string | null; roomName: string | null;
  onRetry: () => void;
  pinnedId: string | null; onPin: (id: string | null) => void;
  layout: VideoLayout; onLayoutChange: (l: VideoLayout) => void;
}) => {
  if (error) return (
    <div className="h-full flex flex-col items-center justify-center gap-4 text-center p-6 sm:p-8">
      <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center"
        style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}>
        <WifiOff className="w-6 h-6 sm:w-7 sm:h-7 text-red-400" />
      </div>
      <div>
        <p className="text-sm font-semibold text-red-400 mb-1">Connection failed</p>
        <p className="text-xs max-w-xs" style={{ color: T.muted }}>{error}</p>
      </div>
      <button onClick={onRetry} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-white min-h-[44px] touch-manipulation"
        style={{ background: "rgba(99,102,241,0.2)", border: "1px solid rgba(99,102,241,0.3)" }}>
        <RefreshCw className="w-4 h-4" /> Retry
      </button>
    </div>
  );

  if (isConnecting) return (
    <div className="h-full flex flex-col items-center justify-center gap-3">
      <Loader2 className="w-8 h-8 animate-spin" style={{ color: T.accent }} />
      <p className="text-sm" style={{ color: T.muted }}>Connecting…</p>
    </div>
  );

  if (!roomName && !isConnected) return (
    <div className="h-full flex flex-col items-center justify-center gap-3 text-center p-6">
      <Video className="w-12 h-12" style={{ color: T.subtle }} />
      <p className="text-sm" style={{ color: T.muted }}>No video room attached</p>
    </div>
  );

  if (participants.length === 0) return (
    <div className="h-full flex flex-col items-center justify-center gap-3 text-center p-6">
      <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center"
        style={{ background: T.card, border: `1px solid ${T.border}` }}>
        <Users className="w-7 h-7 sm:w-8 sm:h-8" style={{ color: T.subtle }} />
      </div>
      <p className="text-sm" style={{ color: T.muted }}>Waiting for participants…</p>
    </div>
  );

  const LayoutSwitcher = (
    <div className="absolute top-2 right-2 sm:top-3 sm:right-3 z-20 flex items-center gap-1 sm:gap-1.5">
      {(["spotlight", "grid", "sidebar"] as VideoLayout[]).map((l) => {
        const icons = { spotlight: Maximize2, grid: LayoutGrid, sidebar: PanelRight };
        const Icon = icons[l];
        return (
          <button key={l} onClick={(e) => { e.stopPropagation(); onLayoutChange(l); }}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-all touch-manipulation"
            style={{
              background: layout === l ? "rgba(99,102,241,0.85)" : "rgba(0,0,0,0.45)",
              backdropFilter: "blur(8px)",
              border: `1px solid ${layout === l ? "rgba(99,102,241,0.5)" : "rgba(255,255,255,0.1)"}`,
            }}>
            <Icon className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-white" />
          </button>
        );
      })}
    </div>
  );

  if (participants.length === 1) return (
    <div className="relative h-full">{LayoutSwitcher}
      <PinnableTile participant={participants[0]} activeSpeakerId={activeSpeakerId}
        isPinned={false} onPin={onPin} isMain className="h-full" />
    </div>
  );

  const spotlightId = pinnedId ?? activeSpeakerId ?? participants[0]?.session_id;
  const spotlight   = participants.find((p) => p.session_id === spotlightId) ?? participants[0];
  const strip       = participants.filter((p) => p.session_id !== spotlight.session_id);

  if (layout === "spotlight") return (
    <div className="relative h-full flex flex-col gap-1.5 sm:gap-2">{LayoutSwitcher}
      <div className="flex-1 min-h-0">
        <PinnableTile participant={spotlight} activeSpeakerId={activeSpeakerId}
          isPinned={!!pinnedId} onPin={onPin} isMain className="h-full" />
      </div>
      {strip.length > 0 && (
        <div className="flex gap-1.5 sm:gap-2 shrink-0 overflow-x-auto pb-1"
          style={{ height: "clamp(64px, 18%, 120px)" }}>
          {strip.map((p) => (
            <div key={p.session_id} className="shrink-0 rounded-xl overflow-hidden"
              style={{ width: "clamp(90px, 140px, 200px)", height: "100%" }}>
              <PinnableTile participant={p} activeSpeakerId={activeSpeakerId}
                isPinned={pinnedId === p.session_id} onPin={onPin} className="h-full w-full" />
            </div>
          ))}
        </div>
      )}
    </div>
  );

  if (layout === "sidebar") return (
    <div className="relative h-full flex gap-1.5 sm:gap-2">{LayoutSwitcher}
      <div className="flex-1 min-w-0">
        <PinnableTile participant={spotlight} activeSpeakerId={activeSpeakerId}
          isPinned={!!pinnedId} onPin={onPin} isMain className="h-full" />
      </div>
      {strip.length > 0 && (
        <div className="flex flex-col gap-1.5 sm:gap-2 overflow-y-auto"
          style={{ width: "clamp(80px, 22%, 180px)" }}>
          {strip.map((p) => (
            <div key={p.session_id} className="shrink-0 rounded-xl overflow-hidden aspect-video">
              <PinnableTile participant={p} activeSpeakerId={activeSpeakerId}
                isPinned={pinnedId === p.session_id} onPin={onPin} className="h-full w-full" />
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const count = participants.length;
  // On mobile portrait we force 1 column for 1 participant, 2 for 2+
  const cols  = count <= 1 ? 1 : count <= 4 ? 2 : count <= 6 ? 3 : 4;
  const rows  = Math.ceil(count / cols);
  return (
    <div className="relative h-full">{LayoutSwitcher}
      <div className="h-full gap-1.5 sm:gap-2"
        style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` }}>
        {participants.map((p) => (
          <PinnableTile key={p.session_id} participant={p} activeSpeakerId={activeSpeakerId}
            isPinned={pinnedId === p.session_id} onPin={onPin} className="h-full" />
        ))}
      </div>
    </div>
  );
});

// ─── Small helpers ──────────────────────────────────────────────────────────────
const Pill = memo(({ icon: Icon, label, color, bg, border, pulse = false }: any) => (
  <div className="inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 rounded-lg text-[10px] sm:text-[11px] font-semibold"
    style={{ color: color ?? T.muted, background: bg ?? T.card, border: `1px solid ${border ?? T.border}` }}>
    {pulse && <span className="w-1.5 h-1.5 rounded-full animate-pulse shrink-0" style={{ background: color }} />}
    {Icon && <Icon className="w-3 h-3" />}
    {label}
  </div>
));

const NetDot = memo(({ quality }: { quality: CallQuality }) => {
  const c = qualityColor(quality);
  return (
    <div className="flex items-center gap-1 sm:gap-1.5">
      <div className="w-2 h-2 rounded-full shrink-0" style={{ background: c, boxShadow: `0 0 5px ${c}` }} />
      <span className="text-[10px] font-medium capitalize hidden sm:block" style={{ color: c }}>{quality}</span>
    </div>
  );
});

const RecBadge = memo(() => (
  <div className="flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2 py-1 rounded-lg"
    style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.22)" }}>
    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
    <span className="text-[10px] font-bold text-red-400">REC</span>
  </div>
));

const TxLine = memo(({ speaker, speakerName, text, time, isHost, isPartial }: any) => (
  <div className={cn("flex gap-2 sm:gap-2.5", isPartial && "opacity-60")}>
    <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0 mt-0.5"
      style={{ background: isHost ? "linear-gradient(135deg,#6366f1,#8b5cf6)" : "linear-gradient(135deg,#8b5cf6,#ec4899)" }}>
      {(speakerName || speaker || "?")[0]?.toUpperCase()}
    </div>
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 mb-0.5">
        <span className="text-[11px] font-semibold" style={{ color: isHost ? "#a5b4fc" : "#c4b5fd" }}>{speakerName || speaker}</span>
        <span className="text-[10px]" style={{ color: T.subtle }}>{time}</span>
        {isPartial && <span className="text-[9px]" style={{ color: T.subtle }}>…</span>}
      </div>
      <p className="text-xs leading-relaxed" style={{ color: T.text }}>{text}</p>
    </div>
  </div>
));

const InsightCard = memo(({ type, text, suggestion, time }: any) => {
  const meta: any = {
    objection:  { label: "Objection",    color: T.amber,   bg: "rgba(245,158,11,0.08)",  border: "rgba(245,158,11,0.2)",  icon: AlertTriangle },
    signal:     { label: "Buying Signal",color: T.emerald, bg: "rgba(16,185,129,0.08)",  border: "rgba(16,185,129,0.2)",  icon: Zap },
    coaching:   { label: "Coaching Tip", color: "#818cf8", bg: "rgba(99,102,241,0.08)",  border: "rgba(99,102,241,0.2)",  icon: BrainCircuit },
    competitor: { label: "Competitor",   color: T.red,     bg: "rgba(239,68,68,0.08)",   border: "rgba(239,68,68,0.2)",   icon: AlertCircle },
  }[type];
  const Icon = meta.icon;
  return (
    <div className="rounded-xl p-3 border" style={{ background: meta.bg, borderColor: meta.border }}>
      <div className="flex items-start gap-2">
        <Icon className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: meta.color }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: meta.color }}>{meta.label}</span>
            <span className="text-[10px]" style={{ color: T.subtle }}>{time}</span>
          </div>
          <p className="text-xs" style={{ color: T.text }}>{text}</p>
          {suggestion && <p className="text-[11px] mt-1 italic" style={{ color: T.muted }}>{suggestion}</p>}
        </div>
      </div>
    </div>
  );
});

// ─── Control button ─────────────────────────────────────────────────────────────
const Ctrl = memo(({ icon: Icon, label, onClick, active = true, danger = false, badge, disabled = false, compact = false, highlight = false, hideLabel = false }: any) => (
  <button onClick={onClick} disabled={disabled} title={label}
    className={cn(
      "relative flex flex-col items-center justify-center gap-0.5 rounded-xl transition-all select-none touch-manipulation",
      compact ? "w-11 h-11 px-1" : "px-2.5 sm:px-3 py-2 sm:py-2.5 min-w-[44px] min-h-[44px]",
      danger  ? "bg-red-500/90 hover:bg-red-500/100 text-white"
              : highlight ? "bg-amber-500/20 border border-amber-500/40 text-amber-400"
              : active    ? "bg-white/[0.08] hover:bg-white/[0.14] text-white"
                          : "bg-red-500/12 border border-red-500/25 text-red-400",
      disabled && "opacity-40 pointer-events-none",
    )}>
    <Icon className={compact ? "w-5 h-5" : "w-4 h-4 sm:w-5 sm:h-5"} />
    {!hideLabel && (
      <span className={cn("font-medium", compact ? "text-[9px] opacity-60" : "text-[9px] sm:text-[10px] opacity-60 hidden xs:block")}>{label}</span>
    )}
    {badge != null && badge > 0 && (
      <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-indigo-500 text-white text-[9px] font-bold flex items-center justify-center">
        {badge > 9 ? "9+" : badge}
      </span>
    )}
  </button>
));

// ─── Guest approval banner ──────────────────────────────────────────────────────
const GuestBanner = memo(({ requests, admit, deny, loading }: any) => {
  if (!requests.length) return null;
  return (
    <div className="px-2 sm:px-3 pt-2 space-y-2 shrink-0 z-30 relative">
      {requests.map((r: any) => (
        <div key={r.id} className="flex items-center gap-2 sm:gap-3 px-3 py-2.5 rounded-xl"
          style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)" }}>
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
            style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)" }}>
            {(r.guest_name || "?")[0]?.toUpperCase()}
          </div>
          <p className="text-xs flex-1 min-w-0 truncate" style={{ color: "rgba(255,255,255,0.7)" }}>
            <span className="font-semibold text-white">{r.guest_name}</span>
            <span className="hidden sm:inline"> wants to join</span>
          </p>
          <div className="flex gap-1.5 shrink-0">
            <button onClick={() => deny(r.id)} disabled={loading}
              className="w-9 h-9 rounded-lg flex items-center justify-center text-red-400 touch-manipulation"
              style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}>
              <UserX className="w-4 h-4" />
            </button>
            <button onClick={() => admit(r.id)} disabled={loading}
              className="h-9 px-2.5 sm:px-3 rounded-lg text-white font-medium flex items-center gap-1 text-xs touch-manipulation"
              style={{ background: "linear-gradient(135deg,#4f46e5,#7c3aed)" }}>
              <UserCheck className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Admit</span>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
});

// ─── Right AI Panel ─────────────────────────────────────────────────────────────
const RightPanel = memo(({
  activeTab, onTab, transcripts, objections, topics,
  sentimentScore, talkRatio, questionsCount, participantCount,
  isStreaming, chunksSent, workspace,
}: any) => {
  const txEndRef  = useRef<HTMLDivElement>(null);
  const [autoscroll, setAutoscroll] = useState(true);
  const sm = sentimentMeta(sentimentScore);
  const SmIcon = sm.icon;

  useEffect(() => {
    if (autoscroll && activeTab === "transcript") txEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcripts.length, autoscroll, activeTab]);

  const allInsights = useMemo(() => {
    const out: any[] = [];
    objections.forEach((o: any) => out.push({
      type: "objection", text: o.objection_type, suggestion: o.suggestion,
      time: new Date(o.detected_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    }));
    workspace?.signals?.forEach((s: any) => out.push({
      type: s.signal_type === "buying_signal" ? "signal" : s.signal_type === "competitor_mention" ? "competitor" : "signal",
      text: s.text, time: new Date(s.detected_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    }));
    return out.sort((a: any, b: any) => b.time.localeCompare(a.time)).slice(0, MAX_INSIGHTS);
  }, [objections, workspace?.signals]);

  const tabs = [
    { id: "transcript", label: "Transcript", icon: MessageSquare },
    { id: "insights",   label: "Insights",   icon: Sparkles, badge: allInsights.length || undefined },
    { id: "coaching",   label: "Coaching",   icon: BrainCircuit },
  ];

  return (
    <div className="flex flex-col h-full" style={{ background: T.panel }}>
      <div className="flex items-center justify-between px-3 sm:px-4 py-2 sm:py-2.5 border-b shrink-0" style={{ borderColor: T.border }}>
        <div className="flex items-center gap-2">
          <BrainCircuit className="w-3.5 h-3.5 text-indigo-400" />
          <span className="text-xs font-semibold" style={{ color: T.text }}>AI Copilot</span>
        </div>
        <div className="flex items-center gap-2">
          {isStreaming && (
            <div className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full animate-pulse bg-emerald-400" />
              <span className="text-[10px] font-semibold text-emerald-400">{chunksSent}</span>
            </div>
          )}
          <Pill label="LIVE" color={T.emerald} bg="rgba(16,185,129,0.1)" border="rgba(16,185,129,0.2)" pulse />
        </div>
      </div>
      <div className="flex border-b shrink-0" style={{ borderColor: T.border }}>
        {tabs.map((tab: any) => {
          const Icon = tab.icon;
          return (
            <button key={tab.id} onClick={() => onTab(tab.id)}
              className="relative flex-1 flex items-center justify-center gap-1 sm:gap-1.5 py-2.5 text-[11px] sm:text-xs font-medium border-b-2 transition-all touch-manipulation min-h-[44px]"
              style={{ borderColor: activeTab === tab.id ? T.accent : "transparent", color: activeTab === tab.id ? "#a5b4fc" : T.muted }}>
              <Icon className="w-3 h-3" />{tab.label}
              {tab.badge != null && <span className="w-4 h-4 rounded-full bg-indigo-500 text-white text-[9px] flex items-center justify-center font-bold">{tab.badge > 9 ? "9+" : tab.badge}</span>}
            </button>
          );
        })}
      </div>
      <div className="flex-1 overflow-y-auto">
        {activeTab === "transcript" && (
          <>
            <div className="flex items-center justify-between px-3 py-2 border-b sticky top-0 z-10"
              style={{ background: T.panel, borderColor: T.border }}>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[11px] font-medium text-emerald-400">{transcripts.length} lines</span>
              </div>
              <button onClick={() => setAutoscroll((v) => !v)} className="text-[10px] flex items-center gap-1 touch-manipulation min-h-[36px]"
                style={{ color: autoscroll ? T.accent : T.muted }}>
                {autoscroll ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                {autoscroll ? "Auto" : "Paused"}
              </button>
            </div>
            <div className="p-3 space-y-3">
              {transcripts.length === 0
                ? <div className="py-8 text-center"><Mic className="w-7 h-7 mx-auto mb-2" style={{ color: T.subtle }} /><p className="text-xs" style={{ color: T.muted }}>Transcript appears as you speak</p></div>
                : transcripts.map((line: any) => (
                  <TxLine key={line.id} speaker={line.speaker} speakerName={line.speaker_name}
                    text={line.text} isHost={line.speaker_role ? line.speaker_role !== "guest" : !line.is_guest}
                    isPartial={line.is_partial}
                    time={new Date(line.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })} />
                ))}
              <div ref={txEndRef} />
            </div>
          </>
        )}
        {activeTab === "insights" && (
          <div className="p-3 space-y-3">
            <div className="p-3 rounded-xl border" style={{ background: T.card, borderColor: T.border }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold" style={{ color: T.muted }}>Sentiment</span>
                <div className="flex items-center gap-1.5">
                  <SmIcon className="w-3.5 h-3.5" style={{ color: sm.color }} />
                  <span className="text-sm font-bold" style={{ color: sm.color }}>{sentimentScore}%</span>
                </div>
              </div>
              <div className="h-1.5 rounded-full" style={{ background: T.subtle }}>
                <div className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${sentimentScore}%`, background: `linear-gradient(90deg,${sm.color},${sm.color}99)` }} />
              </div>
            </div>
            <div className="p-3 rounded-xl border" style={{ background: T.card, borderColor: T.border }}>
              <div className="flex justify-between text-[11px] mb-2">
                <span style={{ color: "#818cf8" }}>You {talkRatio.rep}%</span>
                <span style={{ color: T.muted }}>Talk Ratio</span>
                <span style={{ color: "#a78bfa" }}>Prospect {talkRatio.prospect}%</span>
              </div>
              <div className="h-2 rounded-full flex overflow-hidden" style={{ background: T.subtle }}>
                <div style={{ width: `${talkRatio.rep}%`, background: "linear-gradient(90deg,#6366f1,#8b5cf6)" }} />
                <div style={{ width: `${talkRatio.prospect}%`, background: "linear-gradient(90deg,#8b5cf6,#a78bfa)" }} />
              </div>
              {talkRatio.rep > 65 && <p className="text-[10px] mt-1.5" style={{ color: T.amber }}>⚠ Let them talk more</p>}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Questions",  value: questionsCount,    icon: MessageCircle, color: "#818cf8" },
                { label: "Topics",     value: topics.length,     icon: Hash,          color: "#2dd4bf" },
                { label: "People",     value: participantCount,  icon: Users,         color: "#60a5fa" },
                { label: "Objections", value: objections.length, icon: AlertTriangle, color: T.amber   },
              ].map(({ label, value, icon: Icon, color }) => (
                <div key={label} className="p-2.5 rounded-xl border text-center" style={{ background: T.card, borderColor: T.border }}>
                  <Icon className="w-3 h-3 mx-auto mb-0.5" style={{ color }} />
                  <div className="text-base font-bold font-mono" style={{ color: T.text }}>{value}</div>
                  <div className="text-[10px]" style={{ color: T.muted }}>{label}</div>
                </div>
              ))}
            </div>
            {topics.length > 0 && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: T.muted }}>Key Topics</p>
                <div className="flex flex-wrap gap-1.5">
                  {topics.map((t: any) => (
                    <span key={t.id} className="text-[11px] px-2 py-0.5 rounded-lg"
                      style={{ background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.2)", color: "#a5b4fc" }}>
                      {t.topic}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {allInsights.length > 0 && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: T.muted }}>AI Detections</p>
                <div className="space-y-2">{allInsights.map((ins: any, i: number) => <InsightCard key={i} {...ins} />)}</div>
              </div>
            )}
          </div>
        )}
        {activeTab === "coaching" && (
          <div className="p-3 space-y-3">
            <div className="p-4 rounded-xl border" style={{ background: "rgba(99,102,241,0.06)", borderColor: "rgba(99,102,241,0.18)" }}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-medium mb-0.5" style={{ color: T.muted }}>Meeting Score</p>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl font-black text-white">{Math.round(sentimentScore * 0.9)}</span>
                    <span className="text-sm" style={{ color: T.muted }}>/100</span>
                  </div>
                </div>
                <Trophy className="w-5 h-5 text-indigo-400" />
              </div>
            </div>
            {[
              { icon: Flame,  text: "Ask open-ended questions to uncover pain points", color: T.amber },
              { icon: Target, text: "Re-qualify the decision maker and timeline",       color: "#60a5fa" },
              { icon: Shield, text: "Confirm all stakeholders are on this call",        color: "#a78bfa" },
              { icon: MessageCircle, text: "Pause — let them fill the silence",         color: T.emerald },
            ].map(({ icon: Icon, text, color }, i) => (
              <div key={i} className="flex items-start gap-2.5 p-3 rounded-xl border"
                style={{ background: `${color}0a`, borderColor: `${color}22` }}>
                <Icon className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color }} />
                <p className="text-xs leading-relaxed" style={{ color: T.text }}>{text}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

// ─── Left panel ─────────────────────────────────────────────────────────────────
const LeftPanel = memo(({ activeTab, onTab, participants, activeSpeakerId, callId, userId }: any) => {
  const { workspace, addNote, uploadFile } = useMeetingWorkspace(callId);
  const { comments, addComment }           = useCoaching(callId);
  const { notifications, markRead, unreadCount } = useNotifications();
  const [chatInput, setChatInput] = useState("");
  const [noteInput, setNoteInput] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef   = useRef<HTMLDivElement>(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [comments.length]);

  const sendChat = useCallback(async () => {
    const t = chatInput.trim(); if (!t) return;
    setChatInput(""); await addComment.mutateAsync({ text: t });
  }, [chatInput, addComment]);

  const tabs = [
    { id: "people",        icon: Users,         label: "People",        badge: participants.length },
    { id: "chat",          icon: MessageSquare, label: "Chat" },
    { id: "notes",         icon: BookOpen,      label: "Notes" },
    { id: "files",         icon: Paperclip,     label: "Files",         badge: workspace.files.length || undefined },
    { id: "notifications", icon: Bell,          label: "Alerts",        badge: unreadCount || undefined },
  ];

  return (
    <div className="flex flex-col h-full" style={{ background: T.panel }}>
      <div className="flex items-center border-b shrink-0 overflow-x-auto" style={{ borderColor: T.border }}>
        {tabs.map((tab: any) => {
          const Icon = tab.icon;
          return (
            <button key={tab.id} onClick={() => onTab(tab.id)}
              className="relative flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium border-b-2 transition-all min-w-[44px] touch-manipulation min-h-[44px]"
              style={{ borderColor: activeTab === tab.id ? T.accent : "transparent", color: activeTab === tab.id ? "#a5b4fc" : T.muted }}>
              <Icon className="w-3.5 h-3.5" />
              <span className="hidden lg:block text-[10px]">{tab.label}</span>
              {tab.badge != null && tab.badge > 0 && (
                <span className="absolute top-1 right-1 w-3.5 h-3.5 rounded-full bg-indigo-500 text-white text-[8px] flex items-center justify-center font-bold">
                  {tab.badge > 9 ? "9+" : tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="flex-1 overflow-y-auto">
        {activeTab === "people" && (
          <div className="p-2 space-y-0.5">
            {participants.length === 0
              ? <div className="py-8 text-center"><Users className="w-8 h-8 mx-auto mb-2" style={{ color: T.subtle }} /><p className="text-xs" style={{ color: T.muted }}>No participants yet</p></div>
              : participants.map((p: DailyParticipant) => (
                  <div key={p.session_id} className="flex items-center gap-2 sm:gap-2.5 px-2 sm:px-3 py-2.5 rounded-xl hover:bg-white/[0.04] transition-colors">
                    <div className="relative shrink-0">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
                        style={{ background: p.session_id === activeSpeakerId ? "linear-gradient(135deg,#10b981,#059669)" : "linear-gradient(135deg,#6366f1,#8b5cf6)" }}>
                        {(p.user_name || "?")[0]?.toUpperCase()}
                      </div>
                      {p.session_id === activeSpeakerId && (
                        <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 bg-emerald-400" style={{ borderColor: T.bg }} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <p className="text-xs font-medium truncate" style={{ color: T.text }}>
                          {p.user_name || "Participant"}
                          {p.local && <span style={{ color: T.muted }}> (You)</span>}
                        </p>
                        {p.handRaised && <span className="text-sm">✋</span>}
                      </div>
                      <p className="text-[10px]" style={{ color: T.muted }}>{p.local ? "Host" : "Guest"}</p>
                    </div>
                    <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                      {!p.audio && <MicOff className="w-3 h-3 text-red-400" />}
                      {!p.video && <VideoOff className="w-3 h-3" style={{ color: T.muted }} />}
                    </div>
                  </div>
                ))}
          </div>
        )}
        {activeTab === "chat" && (
          <div className="flex flex-col h-full">
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {comments.map((c: any) => (
                <div key={c.id} className="flex gap-2">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                    style={{ background: c.user_id === userId ? "linear-gradient(135deg,#6366f1,#8b5cf6)" : "linear-gradient(135deg,#8b5cf6,#ec4899)" }}>
                    {((c.profile?.full_name ?? c.profile?.email ?? "?")[0] ?? "?").toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 mb-0.5">
                      <span className="text-[11px] font-semibold" style={{ color: T.text }}>{c.profile?.full_name ?? c.profile?.email ?? "Someone"}</span>
                      <span className="text-[10px]" style={{ color: T.subtle }}>{new Date(c.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                    <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.7)" }}>{c.comment_text}</p>
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            <div className="border-t p-2 shrink-0" style={{ borderColor: T.border }}>
              <div className="flex gap-2">
                <input value={chatInput} onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), sendChat())}
                  placeholder="Message the team…" className="flex-1 text-xs px-3 py-2 rounded-xl outline-none min-h-[40px]"
                  style={{ background: T.card, border: `1px solid ${T.border}`, color: T.text }} />
                <button onClick={sendChat} disabled={!chatInput.trim()}
                  className="w-10 h-10 rounded-xl flex items-center justify-center touch-manipulation shrink-0"
                  style={{ background: chatInput.trim() ? "linear-gradient(135deg,#6366f1,#8b5cf6)" : T.card }}>
                  <Send className="w-3.5 h-3.5 text-white" />
                </button>
              </div>
            </div>
          </div>
        )}
        {activeTab === "notes" && (
          <div className="p-3 space-y-3">
            <div className="flex gap-2">
              <textarea value={noteInput} onChange={(e) => setNoteInput(e.target.value)} placeholder="Add a note…" rows={2}
                className="flex-1 text-xs px-3 py-2 rounded-xl outline-none resize-none"
                style={{ background: T.card, border: `1px solid ${T.border}`, color: T.text }} />
              <button onClick={async () => { if (noteInput.trim()) { await addNote(noteInput); setNoteInput(""); }}}
                className="w-10 h-10 rounded-xl flex items-center justify-center self-start shrink-0 touch-manipulation"
                style={{ background: noteInput.trim() ? "linear-gradient(135deg,#6366f1,#8b5cf6)" : T.card }}>
                <Plus className="w-3.5 h-3.5 text-white" />
              </button>
            </div>
            {workspace.notes.map((n: any) => (
              <div key={n.id} className="rounded-xl p-3 border" style={{ background: T.card, borderColor: T.border }}>
                <p className="text-xs leading-relaxed" style={{ color: T.text }}>{n.content}</p>
                <p className="text-[10px] mt-1.5" style={{ color: T.subtle }}>{n.full_name ?? n.email ?? "You"}</p>
              </div>
            ))}
          </div>
        )}
        {activeTab === "files" && (
          <div className="p-3 space-y-3">
            <input type="file" ref={fileInputRef} onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = ""; }} className="hidden" />
            <button onClick={() => fileInputRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-medium touch-manipulation min-h-[44px]"
              style={{ background: T.card, border: `1px dashed ${T.border}`, color: T.muted }}>
              <Upload className="w-3.5 h-3.5" /> Share a file
            </button>
            {workspace.files.map((f: any) => (
              <a key={f.id} href={f.file_url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border transition-colors"
                style={{ background: T.card, borderColor: T.border }}>
                <Paperclip className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <p className="text-xs font-medium truncate flex-1" style={{ color: T.text }}>{f.file_name}</p>
                <ArrowUpRight className="w-3 h-3 shrink-0" style={{ color: T.muted }} />
              </a>
            ))}
          </div>
        )}
        {activeTab === "notifications" && (
          <div className="p-2 space-y-1.5">
            {notifications.slice(0, 20).map((n: any) => (
              <button key={n.id} onClick={() => !n.is_read && markRead.mutate(n.id)}
                className="w-full text-left flex items-start gap-2.5 px-3 py-2.5 rounded-xl hover:bg-white/[0.04] touch-manipulation min-h-[44px]"
                style={{ opacity: n.is_read ? 0.5 : 1 }}>
                <Bell className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: n.is_read ? T.muted : "#a5b4fc" }} />
                <div className="flex-1 min-w-0">
                  {n.title && <p className="text-[11px] font-semibold mb-0.5" style={{ color: T.text }}>{n.title}</p>}
                  <p className="text-[11px]" style={{ color: T.muted }}>{n.message}</p>
                </div>
                {!n.is_read && <div className="w-2 h-2 rounded-full shrink-0 mt-1.5" style={{ background: T.accent }} />}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

// ─── Mobile bottom sheet ────────────────────────────────────────────────────────
const MobileSheet = memo(({ open, onClose, title, children }: any) => (
  <>
    {open && (
      <div
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
        onClick={onClose}
      />
    )}
    <div
      className={cn(
        "fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl flex flex-col md:hidden",
        "transition-transform duration-300 ease-out",
      )}
      style={{
        background: T.panel,
        border: `1px solid ${T.border}`,
        maxHeight: "82dvh",
        transform: open ? "translateY(0)" : "translateY(100%)",
      }}
    >
      {/* drag handle */}
      <div className="flex items-center justify-between px-4 pt-5 pb-3 border-b shrink-0" style={{ borderColor: T.border }}>
        <div className="w-10 h-1 rounded-full absolute top-2 left-1/2 -translate-x-1/2" style={{ background: T.subtle }} />
        <span className="text-sm font-semibold" style={{ color: T.text }}>{title}</span>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-lg flex items-center justify-center touch-manipulation"
          style={{ background: T.card }}
        >
          <X className="w-4 h-4" style={{ color: T.muted }} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto overscroll-contain">{children}</div>
    </div>
  </>
));

// ─── MAIN COMPONENT ─────────────────────────────────────────────────────────────
export default function LiveMeeting() {
  const { id }    = useParams<{ id: string }>();
  const navigate  = useNavigate();
  const isMobile  = useIsMobile();
  const { user }  = useAuth();
  const { team }  = useTeam();
  const { setStatus } = useUserStatus(team?.id);
  const { profile }   = useUserProfile();

  const hostName = useMemo(() => deriveHostName(profile, user?.email), [profile, user?.email]);

  const {
    liveCall, isLive, isLoading, transcripts: rawTranscripts,
    objections, topics, endCall, callId,
  } = useLiveCall({ onCallEnded: () => setStatus("available") });

  const roomName     = (liveCall as any)?.daily_room_name    ?? null;
  const meetingToken = (liveCall as any)?.daily_meeting_token ?? null;

  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const health = useMeetingHealth(callId, micStream);

  const daily = useDailyCall({
    callId: callId ?? null, roomName, meetingToken, userName: hostName,
    onJoined:  () => { setStatus("on_call"); health.recordReconnect(); },
    onLeft:    () => {},
    onParticipantJoined: (p) => toast.success(`${p.user_name || "Someone"} joined`),
    onParticipantLeft:   () => toast.info("A participant left"),
    onRecordingStarted:  () => toast.success("Recording started"),
    onRecordingStopped:  () => toast.info("Recording stopped"),
    onNetworkQualityChange: (q) => {
      health.updateDailyNetworkQuality(q);
      if (q === "poor") toast.warning("Weak connection — video quality reduced", { id: "net" });
      else toast.dismiss("net");
    },
    onHandRaiseChange: (sid, raised, uname) => {
      if (raised) toast.info(`✋ ${uname} raised their hand`, { duration: 5000 });
    },
  });

  const audioStreaming = useAudioStreaming({
    callId: callId ?? null, speakerLabel: hostName,
    onTranscript: (text) => health.recordTranscriptReceived(text.split(/\s+/).length),
    onAIAnalysis: () => health.recordAIReceived(),
  });

  const { requests: guestRequests, admit: admitGuest, deny: denyGuest, isResponding } = usePendingGuestRequests(callId);
  const { workspace } = useMeetingWorkspace(callId);
  const { usage }     = useMinuteUsage();

  // Async live AI analysis + coaching — runs server-side every 20s.
  // Never blocks audio/transcription; results stream in via Realtime.
  useLiveMeetingAI(callId, Boolean(isLive && callId));

  const [leftTab,         setLeftTab]         = useState<LeftTab>("people");
  const [rightTab,        setRightTab]        = useState<RightTab>("transcript");
  const [isAudioOn,       setIsAudioOn]       = useState(true);
  const [isVideoOn,       setIsVideoOn]       = useState(true);
  const [leftCollapsed,   setLeftCollapsed]   = useState(false);
  const [rightCollapsed,  setRightCollapsed]  = useState(false);
  const [reconnectCount,  setReconnectCount]  = useState(0);
  const [pinnedId,        setPinnedId]        = useState<string | null>(null);
  const [videoLayout,     setVideoLayout]     = useState<VideoLayout>("spotlight");
  const [mobilePanel,     setMobilePanel]     = useState<MobilePanel>("none");
  const [isHandRaised,    setIsHandRaised]    = useState(false);
  const [noiseCancelOn,   setNoiseCancelOn]   = useState(true);

  useEffect(() => {
    if (isMobile) { setLeftCollapsed(true); setRightCollapsed(true); }
  }, [isMobile]);

  const transcripts = useMemo(() => rawTranscripts.slice(-MAX_TRANSCRIPTS), [rawTranscripts]);

  // ── Join ────────────────────────────────────────────────────────────────────
  // FIX: Use conditional spread so `token` key is entirely absent when falsy.
  // Daily.co SDK throws "property 'token': token should be a string" when the
  // key is present with value null or undefined.
  const joinAttemptedRef = useRef(false);
  useEffect(() => {
    if (!roomName || joinAttemptedRef.current || daily.isConnected || daily.isConnecting || daily.callState === "error") return;
    joinAttemptedRef.current = true;
    daily.joinCall({ rName: roomName, ...(meetingToken ? { token: meetingToken } : {}), displayName: hostName })
      .then((ok) => { if (!ok) joinAttemptedRef.current = false; });
  }, [roomName, hostName]); // eslint-disable-line

  // ── Auto-reconnect ──────────────────────────────────────────────────────────
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (daily.callState === "error" && isLive && reconnectCount < 3 && roomName) {
      setReconnectCount((c) => c + 1);
      const delay = Math.min(1000 * Math.pow(2, reconnectCount), 8000);
      reconnectTimerRef.current = setTimeout(() => {
        joinAttemptedRef.current = false;
        // FIX: Conditional spread — token key omitted when falsy
        daily.joinCall({ rName: roomName, ...(meetingToken ? { token: meetingToken } : {}), displayName: hostName });
      }, delay);
    }
    return () => clearTimeout(reconnectTimerRef.current);
  }, [daily.callState]); // eslint-disable-line

  // ── Track recording ─────────────────────────────────────────────────────────
  const tracksStartedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const p of daily.participants) {
      if (p.audioTrack && p.local && !tracksStartedRef.current.has(p.session_id)) {
        tracksStartedRef.current.add(p.session_id);
        audioStreaming.startTrackRecording(p.audioTrack, p.session_id, true);
        health.recordChunkSent();
        setMicStream(new MediaStream([p.audioTrack]));
      }
    }
  }, [daily.participants]); // eslint-disable-line

  useEffect(() => { if (!isLoading && !isLive) navigate("/live"); }, [isLoading, isLive, navigate]);

  useEffect(() => () => {
    clearTimeout(reconnectTimerRef.current);
    tracksStartedRef.current.clear();
    setMicStream(null);
  }, []);

  // ── Derived ─────────────────────────────────────────────────────────────────
  const talkRatio = useMemo(() => {
    if (!transcripts.length) return { rep: 50, prospect: 50 };
    const isHostLine = (t: any) => (t.speaker_role ? t.speaker_role !== "guest" : !t.is_guest);
    const rw = transcripts.filter(isHostLine).reduce((s: number, t: any) => s + t.text.split(/\s+/).length, 0);
    const pw = transcripts.filter((t: any) => !isHostLine(t)).reduce((s: number, t: any) => s + t.text.split(/\s+/).length, 0);
    const total = rw + pw;
    if (!total) return { rep: 50, prospect: 50 };
    return { rep: Math.round((rw / total) * 100), prospect: Math.round((pw / total) * 100) };
  }, [transcripts]);

  const questionsCount = useMemo(() => transcripts.filter((t: any) => t.text.includes("?")).length, [transcripts]);
  const sentimentScore = liveCall?.sentiment_score ?? 74;

  const handleToggleMic = useCallback(async () => {
    await daily.setAudioEnabled(!isAudioOn);
    setIsAudioOn((v) => !v);
  }, [isAudioOn, daily]);

  const handleToggleCam = useCallback(async () => {
    await daily.setVideoEnabled(!isVideoOn);
    setIsVideoOn((v) => !v);
  }, [isVideoOn, daily]);

  const handleScreenShare = useCallback(async () => {
    if (daily.isScreenSharing) {
      await daily.stopScreenShare();
    } else {
      await daily.startScreenShare();
    }
  }, [daily]);

  const handleHandRaise = useCallback(async () => {
    const next = !isHandRaised;
    setIsHandRaised(next);
    await daily.raiseHand(next);
  }, [isHandRaised, daily]);

  const handleNoiseCancellation = useCallback(async () => {
    const next = !noiseCancelOn;
    setNoiseCancelOn(next);
    await daily.setNoiseCancellation(next);
    toast.info(next ? "Noise cancellation on" : "Noise cancellation off");
  }, [noiseCancelOn, daily]);

  const handleRetryJoin = useCallback(() => {
    if (!roomName) return;
    joinAttemptedRef.current = false;
    // FIX: Conditional spread — token key omitted when falsy
    daily.joinCall({ rName: roomName, ...(meetingToken ? { token: meetingToken } : {}), displayName: hostName });
  }, [roomName, meetingToken, hostName, daily]);

  const handleEnd = useCallback(async () => {
    audioStreaming.stopAll();
    await daily.leaveCall();
    try {
      await endCall.mutateAsync();
      toast.success("Call ended — generating AI summary…");
      navigate(callId ? `/calls/${callId}` : "/live");
    } catch { toast.error("Failed to end call"); }
  }, [endCall, callId, navigate, audioStreaming, daily]);

  const handRaiseCount = useMemo(() =>
    daily.participants.filter((p) => p.handRaised).length,
  [daily.participants]);

  if (isLoading) return (
    <DashboardLayout>
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: T.accent }} />
      </div>
    </DashboardLayout>
  );

  return (
    <DashboardLayout>
      <div
        className="flex flex-col -mx-4 -mt-4 overflow-hidden"
        style={{ height: "calc(100dvh - 56px)", background: T.bg }}
      >

        {/* ── Top bar ────────────────────────────────────────────────────── */}
        <div
          className="flex items-center justify-between px-2 sm:px-4 py-2 border-b shrink-0 gap-1.5 sm:gap-2"
          style={{ borderColor: T.border, background: T.panel, backdropFilter: "blur(20px)" }}
        >
          {/* Left: live indicator + call name */}
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
            <div className="flex items-center gap-1 shrink-0">
              <span
                className="w-2 h-2 rounded-full bg-red-500 shrink-0"
                style={{ boxShadow: "0 0 8px rgba(239,68,68,.9)" }}
              />
              <span className="text-[10px] font-bold text-red-400 uppercase tracking-widest hidden sm:block">
                Live
              </span>
            </div>
            <div className="h-4 w-px shrink-0 hidden sm:block" style={{ background: T.border }} />
            <span className="text-[12px] sm:text-sm font-semibold text-white truncate max-w-[100px] xs:max-w-[140px] sm:max-w-none">
              {liveCall?.name || "Live Meeting"}
            </span>
          </div>

          {/* Right: timer + indicators */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            {/* Timer */}
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3 shrink-0" style={{ color: T.muted }} />
              <span className="text-[11px] sm:text-sm font-mono font-semibold text-white tabular-nums">
                {fmt(daily.elapsedSeconds)}
              </span>
            </div>

            {/* Health bar — hidden on mobile to save space */}
            <div className="hidden md:block">
              <MeetingHealthBar health={health.health} isStreaming={audioStreaming.state.isStreaming} />
            </div>

            <NetDot quality={daily.networkQuality} />
            {daily.isRecording && <RecBadge />}

            {/* Hand raises badge */}
            {handRaiseCount > 0 && (
              <div
                className="flex items-center gap-1 px-1.5 py-1 rounded-lg"
                style={{ background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.25)" }}
              >
                <span className="text-sm leading-none">✋</span>
                <span className="text-[10px] font-bold text-amber-400">{handRaiseCount}</span>
              </div>
            )}

            {/* Minutes warning */}
            {usage && !usage.isUnlimited && usage.pct >= 80 && (
              <div
                className="flex items-center gap-1 px-1.5 py-1 rounded-lg"
                style={{
                  background: usage.pct >= 90 ? "rgba(239,68,68,0.1)" : "rgba(245,158,11,0.1)",
                  border: `1px solid ${usage.pct >= 90 ? "rgba(239,68,68,0.25)" : "rgba(245,158,11,0.25)"}`,
                }}
              >
                <Clock className="w-3 h-3" style={{ color: usage.pct >= 90 ? T.red : T.amber }} />
                <span className="text-[10px] font-semibold" style={{ color: usage.pct >= 90 ? T.red : T.amber }}>
                  {usage.minutesRemaining}m
                </span>
              </div>
            )}

            {/* Panel toggles — desktop only */}
            <div className="hidden md:flex items-center gap-1">
              <button
                onClick={() => setLeftCollapsed((v) => !v)}
                className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
                style={{ background: T.card, border: `1px solid ${T.border}` }}
              >
                <PanelLeft className="w-3.5 h-3.5" style={{ color: leftCollapsed ? T.muted : "#a5b4fc" }} />
              </button>
              <button
                onClick={() => setRightCollapsed((v) => !v)}
                className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
                style={{ background: T.card, border: `1px solid ${T.border}` }}
              >
                <PanelRight className="w-3.5 h-3.5" style={{ color: rightCollapsed ? T.muted : "#a5b4fc" }} />
              </button>
            </div>
          </div>
        </div>

        {/* Guest approval banner */}
        <GuestBanner requests={guestRequests} admit={admitGuest} deny={denyGuest} loading={isResponding} />

        {/* ── Body ───────────────────────────────────────────────────────── */}
        <div className="flex flex-1 min-h-0 overflow-hidden relative">
          {/* Left panel — desktop */}
          {!leftCollapsed && !isMobile && (
            <div className="w-56 xl:w-64 shrink-0 border-r flex flex-col" style={{ borderColor: T.border }}>
              <LeftPanel activeTab={leftTab} onTab={setLeftTab} participants={daily.participants}
                activeSpeakerId={daily.activeSpeakerId} callId={callId} userId={user?.id} />
            </div>
          )}

          {/* Center: video + controls */}
          <div className="flex-1 flex flex-col min-w-0 relative">
            {/* Video */}
            <div className="flex-1 p-1.5 sm:p-3 min-h-0">
              <VideoGrid
                participants={daily.participants} activeSpeakerId={daily.activeSpeakerId}
                isConnecting={daily.isConnecting} isConnected={daily.isConnected}
                error={daily.error} roomName={roomName} onRetry={handleRetryJoin}
                pinnedId={pinnedId} onPin={setPinnedId}
                layout={videoLayout} onLayoutChange={setVideoLayout}
              />
            </div>

            {/* AI status nudge — desktop */}
            {daily.isConnected && !isMobile && (
              <div
                className="mx-3 mb-2 px-4 py-2 rounded-xl flex items-center justify-between shrink-0"
                style={{ background: "rgba(99,102,241,0.05)", border: "1px solid rgba(99,102,241,0.12)" }}
              >
                <div className="flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="text-xs" style={{ color: T.muted }}>AI analysing</span>
                  {objections.length > 0 && (
                    <span className="text-xs font-medium text-amber-400">
                      · {objections.length} objection{objections.length !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
                <button
                  className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300"
                  onClick={() => { setRightCollapsed(false); setRightTab("insights"); }}
                >
                  View <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            )}

            {/* ── Control bar ─────────────────────────────────────────────── */}
            <div className="px-1.5 sm:px-3 pb-1.5 sm:pb-3 shrink-0">
              <div
                className="flex items-center justify-between gap-0.5 sm:gap-1 px-1.5 sm:px-2.5 py-1.5 rounded-2xl"
                style={{
                  background: "rgba(13,15,24,0.95)",
                  border: `1px solid ${T.border}`,
                  backdropFilter: "blur(24px)",
                }}
              >
                {/* Core media controls */}
                <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
                  <Ctrl icon={isAudioOn ? Mic : MicOff} label="Mic" active={isAudioOn} onClick={handleToggleMic} compact={isMobile} />
                  <Ctrl icon={isVideoOn ? Video : VideoOff} label="Cam" active={isVideoOn} onClick={handleToggleCam} compact={isMobile} />
                  {/* Screen share — hidden on narrowest mobiles, shown from xs up */}
                  <div className="hidden xs:block">
                    <Ctrl
                      icon={daily.isScreenSharing ? MonitorOff : MonitorPlay}
                      label={daily.isScreenSharing ? "Stop" : "Share"}
                      active={!daily.isScreenSharing}
                      highlight={daily.isScreenSharing}
                      onClick={handleScreenShare}
                      compact={isMobile}
                    />
                  </div>
                  {/* Hand raise */}
                  <Ctrl
                    icon={Hand}
                    label={isHandRaised ? "Lower" : "Raise"}
                    highlight={isHandRaised}
                    onClick={handleHandRaise}
                    compact={isMobile}
                  />
                  {/* Noise cancel — desktop only */}
                  {!isMobile && (
                    <Ctrl
                      icon={noiseCancelOn ? Volume2 : VolumeX}
                      label={noiseCancelOn ? "NC On" : "NC Off"}
                      active={noiseCancelOn}
                      onClick={handleNoiseCancellation}
                    />
                  )}
                </div>

                {/* Secondary controls */}
                {isMobile ? (
                  /* Mobile: three panel toggles */
                  <div className="flex items-center gap-0.5 shrink-0">
                    <Ctrl icon={Users} label="People" compact badge={guestRequests.length || undefined}
                      onClick={() => setMobilePanel(mobilePanel === "people" ? "none" : "people")} />
                    <Ctrl icon={BrainCircuit} label="AI" compact badge={(objections.length || 0) || undefined}
                      onClick={() => setMobilePanel(mobilePanel === "ai" ? "none" : "ai")} />
                    <Ctrl icon={MessageSquare} label="Chat" compact
                      onClick={() => setMobilePanel(mobilePanel === "chat" ? "none" : "chat")} />
                  </div>
                ) : (
                  /* Desktop: extra controls */
                  <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
                    <Ctrl
                      icon={BrainCircuit} label="AI"
                      onClick={() => setRightCollapsed((v) => !v)}
                      badge={rightCollapsed && objections.length ? objections.length : undefined}
                    />
                    <Ctrl
                      icon={CircleDot}
                      label={daily.isRecording ? "Stop" : "Record"}
                      active={!daily.isRecording}
                      badge={daily.isRecording ? 1 : undefined}
                      onClick={() => daily.isRecording ? daily.stopRecording() : daily.startRecording()}
                    />
                    <Ctrl
                      icon={Users} label="People"
                      badge={guestRequests.length || undefined}
                      onClick={() => { setLeftCollapsed(false); setLeftTab("people"); }}
                    />
                  </div>
                )}

                {/* End call */}
                <button
                  onClick={handleEnd}
                  disabled={endCall.isPending}
                  className="flex items-center justify-center gap-1 sm:gap-1.5 px-2.5 sm:px-5 rounded-xl font-semibold text-white transition-all hover:opacity-90 active:scale-95 touch-manipulation shrink-0 min-h-[44px] min-w-[44px]"
                  style={{
                    background: "linear-gradient(135deg,#dc2626,#b91c1c)",
                    boxShadow: "0 4px 16px rgba(220,38,38,.35)",
                  }}
                >
                  {endCall.isPending
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <PhoneOff className="w-4 h-4" />}
                  <span className="text-xs sm:text-sm hidden sm:inline">End Call</span>
                </button>
              </div>
            </div>
          </div>

          {/* Right AI panel — desktop */}
          {!rightCollapsed && !isMobile && (
            <div className="w-72 xl:w-80 shrink-0 border-l flex flex-col" style={{ borderColor: T.border }}>
              <RightPanel
                activeTab={rightTab} onTab={setRightTab}
                transcripts={transcripts} objections={objections} topics={topics}
                sentimentScore={sentimentScore} talkRatio={talkRatio}
                questionsCount={questionsCount} participantCount={daily.participantCount}
                isStreaming={audioStreaming.state.isStreaming} chunksSent={audioStreaming.state.chunksSent}
                workspace={workspace}
              />
            </div>
          )}
        </div>

        {/* ── Mobile bottom sheets ────────────────────────────────────────── */}
        <MobileSheet open={mobilePanel === "people"} onClose={() => setMobilePanel("none")} title="Participants">
          <LeftPanel activeTab={leftTab} onTab={setLeftTab} participants={daily.participants}
            activeSpeakerId={daily.activeSpeakerId} callId={callId} userId={user?.id} />
        </MobileSheet>

        <MobileSheet open={mobilePanel === "ai"} onClose={() => setMobilePanel("none")} title="AI Copilot">
          <RightPanel
            activeTab={rightTab} onTab={setRightTab}
            transcripts={transcripts} objections={objections} topics={topics}
            sentimentScore={sentimentScore} talkRatio={talkRatio}
            questionsCount={questionsCount} participantCount={daily.participantCount}
            isStreaming={audioStreaming.state.isStreaming} chunksSent={audioStreaming.state.chunksSent}
            workspace={workspace}
          />
        </MobileSheet>

        <MobileSheet open={mobilePanel === "chat"} onClose={() => setMobilePanel("none")} title="Team Chat">
          <LeftPanel activeTab="chat" onTab={setLeftTab} participants={daily.participants}
            activeSpeakerId={daily.activeSpeakerId} callId={callId} userId={user?.id} />
        </MobileSheet>
      </div>
    </DashboardLayout>
  );
}