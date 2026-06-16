/**
 * LiveMeeting.tsx — Fixsense AI Meeting Workspace (v5 — Complete Rebuild)
 *
 * Full 3-panel layout:
 *   LEFT   — Participants, Team Chat, Notes, Files, Deals, Notifications
 *   CENTER — Video grid, controls, meeting timer, recording/quality indicators
 *   RIGHT  — AI Copilot: live transcript, objections, sentiment, coaching
 *
 * Mobile: tab-based navigation (Meeting / Chat / AI / Deals / People)
 *
 * Connects to existing hooks:
 *   useDailyCall, useAudioStreaming, useLiveCall, useMeetingWorkspace,
 *   useCoaching, useDealRooms, useNotifications, useTeam, useMinuteUsage,
 *   usePendingGuestRequests
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
  BrainCircuit, Sparkles, Volume2, RefreshCw, WifiOff,
  ChevronDown, Tag, UserCheck, UserX, Bell, BookOpen,
  Link2, Hash, Trophy, Flame, Target, MessageCircle,
  CircleDot, Copy, Check, MoreHorizontal, Smile,
  ThumbsUp, Heart, Star, Zap as ZapIcon, Plus,
  ChevronRight, ChevronLeft, X, Hand, Activity,
  TrendingUp, TrendingDown, Minus, BarChart2,
  Settings, Headphones, Radio, CheckCircle2,
  ArrowUpRight, PhoneCall, Upload, Eye, EyeOff,
  Maximize2, Minimize2, PanelLeft, PanelRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLiveCall } from "@/hooks/useLiveCall";
import { useDailyCall, DailyParticipant, CallQuality } from "@/hooks/useDailyCall";
import { useAudioStreaming } from "@/hooks/useAudioStreaming";
import { useTeam } from "@/hooks/useTeam";
import { useUserStatus } from "@/hooks/useUserStatus";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePendingGuestRequests } from "@/hooks/useGuestApproval";
import { useMeetingWorkspace } from "@/hooks/useMeetingWorkspace";
import { useCoaching } from "@/hooks/useCoaching";
import { useDealRooms } from "@/hooks/useDealRooms";
import { useNotifications } from "@/hooks/useNotifications";
import { useMinuteUsage } from "@/hooks/useMeetingUsage";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { VideoTile } from "@/components/VideoTile";

// ─── Types ───────────────────────────────────────────────────────────────────

type LeftTab = "people" | "chat" | "notes" | "files" | "deals" | "notifications";
type RightTab = "transcript" | "insights" | "coaching";
type MobileTab = "meeting" | "chat" | "ai" | "deals" | "people";

interface ChatMsg {
  id: string;
  text: string;
  sender: string;
  time: string;
  reactions?: Record<string, number>;
}

// ─── Token / Design System ────────────────────────────────────────────────────

const T = {
  bg:      "#080a12",
  panel:   "rgba(12,14,22,0.92)",
  card:    "rgba(255,255,255,0.04)",
  border:  "rgba(255,255,255,0.07)",
  accent:  "#6366f1",
  accent2: "#8b5cf6",
  emerald: "#10b981",
  amber:   "#f59e0b",
  red:     "#ef4444",
  text:    "rgba(255,255,255,0.85)",
  muted:   "rgba(255,255,255,0.35)",
  subtle:  "rgba(255,255,255,0.12)",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(s: number) {
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function qualityColor(q: CallQuality) {
  if (q === "excellent" || q === "good") return T.emerald;
  if (q === "fair") return T.amber;
  return T.red;
}

function sentimentMeta(score: number) {
  if (score >= 70) return { label: "Positive", color: T.emerald, icon: TrendingUp };
  if (score >= 45) return { label: "Neutral",  color: T.amber,   icon: Minus };
  return                  { label: "At Risk",  color: T.red,     icon: TrendingDown };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const Pill = memo(({ icon: Icon, label, color, bg, border, pulse = false }: {
  icon?: React.FC<any>; label: string; color?: string; bg?: string;
  border?: string; pulse?: boolean;
}) => (
  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold"
    style={{ color: color ?? T.muted, background: bg ?? T.card, border: `1px solid ${border ?? T.border}` }}>
    {pulse && <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: color }} />}
    {Icon && <Icon className="w-3 h-3" />}
    {label}
  </div>
));

const NetDot = memo(({ quality }: { quality: CallQuality }) => {
  const c = qualityColor(quality);
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-2 h-2 rounded-full" style={{ background: c, boxShadow: `0 0 5px ${c}` }} />
      <span className="text-[10px] font-medium capitalize hidden sm:block" style={{ color: c }}>{quality}</span>
    </div>
  );
});

const RecBadge = memo(() => (
  <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg"
    style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.22)" }}>
    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
    <span className="text-[10px] font-bold text-red-400">REC</span>
  </div>
));

/** A single transcript line */
const TxLine = memo(({ speaker, speakerName, text, time, isHost }: {
  speaker: string; speakerName?: string | null; text: string; time: string; isHost: boolean;
}) => (
  <div className="flex gap-2.5 group">
    <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0 mt-0.5"
      style={{ background: isHost ? "linear-gradient(135deg,#6366f1,#8b5cf6)" : "linear-gradient(135deg,#8b5cf6,#ec4899)" }}>
      {(speakerName || speaker || "?")[0]?.toUpperCase()}
    </div>
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 mb-0.5">
        <span className="text-[11px] font-semibold" style={{ color: isHost ? "#a5b4fc" : "#c4b5fd" }}>
          {speakerName || speaker}
        </span>
        <span className="text-[10px]" style={{ color: T.subtle }}>{time}</span>
      </div>
      <p className="text-xs leading-relaxed" style={{ color: T.text }}>{text}</p>
    </div>
  </div>
));

/** AI insight card */
const InsightCard = memo(({ type, text, suggestion, time }: {
  type: "objection" | "signal" | "coaching" | "competitor";
  text: string; suggestion?: string; time: string;
}) => {
  const meta = {
    objection:  { label: "Objection",          color: T.amber,   bg: "rgba(245,158,11,0.08)",  border: "rgba(245,158,11,0.2)",  icon: AlertTriangle },
    signal:     { label: "Buying Signal",       color: T.emerald, bg: "rgba(16,185,129,0.08)",  border: "rgba(16,185,129,0.2)",  icon: ZapIcon },
    coaching:   { label: "Coaching Tip",        color: "#818cf8", bg: "rgba(99,102,241,0.08)",  border: "rgba(99,102,241,0.2)",  icon: BrainCircuit },
    competitor: { label: "Competitor Mention",  color: T.red,     bg: "rgba(239,68,68,0.08)",   border: "rgba(239,68,68,0.2)",   icon: AlertCircle },
  }[type];
  const Icon = meta.icon;
  return (
    <div className="rounded-xl p-3 border" style={{ background: meta.bg, borderColor: meta.border }}>
      <div className="flex items-start gap-2">
        <Icon className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: meta.color }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: meta.color }}>
              {meta.label}
            </span>
            <span className="text-[10px]" style={{ color: T.subtle }}>{time}</span>
          </div>
          <p className="text-xs" style={{ color: T.text }}>{text}</p>
          {suggestion && <p className="text-[11px] mt-1 italic" style={{ color: T.muted }}>{suggestion}</p>}
        </div>
      </div>
    </div>
  );
});

/** Control bar button */
const Ctrl = memo(({ icon: Icon, label, onClick, active = true, danger = false,
  badge, disabled = false, compact = false }: {
  icon: React.FC<any>; label: string; onClick?: () => void;
  active?: boolean; danger?: boolean; badge?: number;
  disabled?: boolean; compact?: boolean;
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={label}
    className={cn(
      "relative flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl transition-all select-none",
      compact && "px-2 py-1.5",
      danger
        ? "bg-red-500/90 hover:bg-red-500/100 text-white"
        : active
          ? "bg-white/[0.07] hover:bg-white/[0.12] text-white"
          : "bg-red-500/12 border border-red-500/25 text-red-400",
      disabled && "opacity-40 pointer-events-none",
    )}
  >
    <Icon className={compact ? "w-4 h-4" : "w-5 h-5"} />
    {!compact && <span className="text-[9px] font-medium opacity-60">{label}</span>}
    {badge != null && badge > 0 && (
      <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-indigo-500 text-white text-[9px] font-bold flex items-center justify-center">
        {badge > 9 ? "9+" : badge}
      </span>
    )}
  </button>
));

/** Participant avatar row */
const ParticipantRow = memo(({ participant, isActive }: {
  participant: DailyParticipant; isActive: boolean;
}) => (
  <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl transition-colors hover:bg-white/[0.04]">
    <div className="relative shrink-0">
      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
        style={{
          background: isActive
            ? "linear-gradient(135deg,#10b981,#059669)"
            : "linear-gradient(135deg,#6366f1,#8b5cf6)",
        }}>
        {(participant.user_name || "?")[0]?.toUpperCase()}
      </div>
      {isActive && (
        <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 bg-emerald-400"
          style={{ borderColor: T.bg }} />
      )}
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-xs font-medium truncate" style={{ color: T.text }}>
        {participant.user_name || "Participant"}
        {participant.local && <span style={{ color: T.muted }}> (You)</span>}
      </p>
      <p className="text-[10px]" style={{ color: T.muted }}>
        {participant.local ? "Host" : "Guest"}
      </p>
    </div>
    <div className="flex items-center gap-1.5 shrink-0">
      {!participant.audio && <MicOff className="w-3 h-3 text-red-400" />}
      {!participant.video && <VideoOff className="w-3 h-3" style={{ color: T.muted }} />}
    </div>
  </div>
));

// ─── Guest approval banner ────────────────────────────────────────────────────

const GuestBanner = memo(({ requests, admit, deny, loading }: {
  requests: { id: string; guest_name: string }[];
  admit: (id: string) => void;
  deny: (id: string) => void;
  loading: boolean;
}) => {
  if (!requests.length) return null;
  return (
    <div className="px-3 pt-2 space-y-2 shrink-0">
      {requests.map((r) => (
        <div key={r.id}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
          style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)" }}>
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
            style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)" }}>
            {(r.guest_name || "?")[0]?.toUpperCase()}
          </div>
          <p className="text-xs flex-1 min-w-0 truncate" style={{ color: "rgba(255,255,255,0.7)" }}>
            <span className="font-semibold text-white">{r.guest_name}</span> wants to join
          </p>
          <div className="flex gap-1.5 shrink-0">
            <button onClick={() => deny(r.id)} disabled={loading}
              className="text-xs px-2 py-1 rounded-lg text-red-400 transition-colors"
              style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}>
              <UserX className="w-3 h-3" />
            </button>
            <button onClick={() => admit(r.id)} disabled={loading}
              className="text-xs px-2.5 py-1 rounded-lg text-white font-medium flex items-center gap-1 transition-all"
              style={{ background: "linear-gradient(135deg,#4f46e5,#7c3aed)" }}>
              <UserCheck className="w-3 h-3" /> Admit
            </button>
          </div>
        </div>
      ))}
    </div>
  );
});

// ─── Minute usage bar ─────────────────────────────────────────────────────────

const MinuteBar = memo(({ minutesUsed, minuteLimit, isUnlimited, pct }: {
  minutesUsed: number; minuteLimit: number; isUnlimited: boolean; pct: number;
}) => {
  const color = pct >= 90 ? T.red : pct >= 70 ? T.amber : T.emerald;
  return (
    <div className="px-3 py-2 border-b shrink-0" style={{ borderColor: T.border }}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-medium" style={{ color: T.muted }}>Meeting minutes</span>
        <span className="text-[10px] font-bold" style={{ color }}>
          {isUnlimited ? "Unlimited" : `${minutesUsed} / ${minuteLimit} min`}
        </span>
      </div>
      {!isUnlimited && (
        <div className="h-1 rounded-full" style={{ background: T.subtle }}>
          <div className="h-full rounded-full transition-all duration-700"
            style={{ width: `${pct}%`, background: color }} />
        </div>
      )}
    </div>
  );
});

// ─── LEFT SIDEBAR ─────────────────────────────────────────────────────────────

interface LeftPanelProps {
  activeTab: LeftTab;
  onTab: (t: LeftTab) => void;
  participants: DailyParticipant[];
  activeSpeakerId: string | null;
  callId: string | null;
  userId: string | undefined;
}

const LeftPanel = memo(({
  activeTab, onTab, participants, activeSpeakerId, callId, userId,
}: LeftPanelProps) => {
  const { workspace, addNote, uploadFile, isLoading: wsLoading } = useMeetingWorkspace(callId);
  const { comments, addComment } = useCoaching(callId);
  const { notifications, markRead, unreadCount } = useNotifications();
  const [chatInput, setChatInput] = useState("");
  const [noteInput, setNoteInput] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [comments.length]);

  const sendChat = useCallback(async () => {
    const t = chatInput.trim();
    if (!t) return;
    setChatInput("");
    await addComment.mutateAsync({ text: t });
  }, [chatInput, addComment]);

  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await uploadFile(file);
    e.target.value = "";
  }, [uploadFile]);

  const tabs: { id: LeftTab; icon: React.FC<any>; label: string; badge?: number }[] = [
    { id: "people",        icon: Users,        label: "People",    badge: participants.length },
    { id: "chat",          icon: MessageSquare,label: "Chat",      badge: comments.length > 0 ? comments.length : undefined },
    { id: "notes",         icon: BookOpen,     label: "Notes"  },
    { id: "files",         icon: Paperclip,    label: "Files",     badge: workspace.files.length || undefined },
    { id: "notifications", icon: Bell,         label: "Alerts",    badge: unreadCount || undefined },
  ];

  return (
    <div className="flex flex-col h-full" style={{ background: T.panel }}>
      {/* Tab nav */}
      <div className="flex items-center border-b shrink-0 overflow-x-auto"
        style={{ borderColor: T.border }}>
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button key={tab.id} onClick={() => onTab(tab.id)}
              className="relative flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium border-b-2 transition-all min-w-[44px]"
              style={{
                borderColor: activeTab === tab.id ? T.accent : "transparent",
                color: activeTab === tab.id ? "#a5b4fc" : T.muted,
              }}>
              <Icon className="w-3.5 h-3.5" />
              <span className="hidden lg:block">{tab.label}</span>
              {tab.badge != null && tab.badge > 0 && (
                <span className="absolute top-1 right-1 w-3.5 h-3.5 rounded-full bg-indigo-500 text-white text-[8px] flex items-center justify-center font-bold">
                  {tab.badge > 9 ? "9+" : tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">

        {/* PEOPLE */}
        {activeTab === "people" && (
          <div className="p-2 space-y-1">
            {participants.length === 0 ? (
              <div className="py-8 text-center">
                <Users className="w-8 h-8 mx-auto mb-2" style={{ color: T.subtle }} />
                <p className="text-xs" style={{ color: T.muted }}>Waiting for participants</p>
              </div>
            ) : participants.map((p) => (
              <ParticipantRow key={p.session_id} participant={p} isActive={p.session_id === activeSpeakerId} />
            ))}
          </div>
        )}

        {/* CHAT */}
        {activeTab === "chat" && (
          <div className="flex flex-col h-full">
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {comments.length === 0 ? (
                <div className="py-6 text-center">
                  <MessageSquare className="w-7 h-7 mx-auto mb-2" style={{ color: T.subtle }} />
                  <p className="text-xs" style={{ color: T.muted }}>No messages yet</p>
                </div>
              ) : comments.map((c) => (
                <div key={c.id} className="flex gap-2">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                    style={{ background: c.user_id === userId
                      ? "linear-gradient(135deg,#6366f1,#8b5cf6)"
                      : "linear-gradient(135deg,#8b5cf6,#ec4899)" }}>
                    {((c.profile?.full_name ?? c.profile?.email ?? "?")[0] ?? "?").toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 mb-0.5">
                      <span className="text-[11px] font-semibold" style={{ color: T.text }}>
                        {c.profile?.full_name ?? c.profile?.email ?? "Someone"}
                      </span>
                      <span className="text-[10px]" style={{ color: T.subtle }}>
                        {new Date(c.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
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
                  placeholder="Message the team…"
                  className="flex-1 text-xs px-3 py-2 rounded-xl outline-none transition-colors"
                  style={{ background: T.card, border: `1px solid ${T.border}`, color: T.text }} />
                <button onClick={sendChat} disabled={!chatInput.trim()}
                  className="w-8 h-8 rounded-xl flex items-center justify-center transition-all"
                  style={{ background: chatInput.trim() ? "linear-gradient(135deg,#6366f1,#8b5cf6)" : T.card }}>
                  <Send className="w-3.5 h-3.5 text-white" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* NOTES */}
        {activeTab === "notes" && (
          <div className="p-3 space-y-3">
            <div className="flex gap-2">
              <textarea
                value={noteInput}
                onChange={(e) => setNoteInput(e.target.value)}
                placeholder="Add a meeting note…"
                rows={2}
                className="flex-1 text-xs px-3 py-2 rounded-xl outline-none resize-none transition-colors"
                style={{ background: T.card, border: `1px solid ${T.border}`, color: T.text }} />
              <button onClick={async () => { if (noteInput.trim()) { await addNote(noteInput); setNoteInput(""); }}}
                className="w-8 h-8 rounded-xl flex items-center justify-center self-start mt-0 shrink-0"
                style={{ background: noteInput.trim() ? "linear-gradient(135deg,#6366f1,#8b5cf6)" : T.card }}>
                <Plus className="w-3.5 h-3.5 text-white" />
              </button>
            </div>
            {wsLoading ? (
              <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin" style={{ color: T.accent }} /></div>
            ) : workspace.notes.length === 0 ? (
              <div className="py-6 text-center">
                <BookOpen className="w-7 h-7 mx-auto mb-2" style={{ color: T.subtle }} />
                <p className="text-xs" style={{ color: T.muted }}>No notes yet</p>
              </div>
            ) : workspace.notes.map((n) => (
              <div key={n.id} className="rounded-xl p-3 border" style={{ background: T.card, borderColor: T.border }}>
                <p className="text-xs leading-relaxed" style={{ color: T.text }}>{n.content}</p>
                <p className="text-[10px] mt-1.5" style={{ color: T.subtle }}>
                  {n.full_name ?? n.email ?? "You"} · {new Date(n.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* FILES */}
        {activeTab === "files" && (
          <div className="p-3 space-y-3">
            <input type="file" ref={fileInputRef} onChange={handleFile} className="hidden" />
            <button onClick={() => fileInputRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-medium transition-all"
              style={{ background: T.card, border: `1px dashed ${T.border}`, color: T.muted }}>
              <Upload className="w-3.5 h-3.5" /> Share a file
            </button>
            {workspace.files.length === 0 ? (
              <div className="py-4 text-center">
                <Paperclip className="w-7 h-7 mx-auto mb-2" style={{ color: T.subtle }} />
                <p className="text-xs" style={{ color: T.muted }}>No shared files</p>
              </div>
            ) : workspace.files.map((f) => (
              <a key={f.id} href={f.file_url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border transition-colors hover:border-indigo-500/40"
                style={{ background: T.card, borderColor: T.border }}>
                <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.2)" }}>
                  <Paperclip className="w-3.5 h-3.5 text-indigo-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate" style={{ color: T.text }}>{f.file_name}</p>
                  <p className="text-[10px]" style={{ color: T.muted }}>
                    {f.file_size ? `${(f.file_size / 1024).toFixed(1)} KB` : ""}
                  </p>
                </div>
                <ArrowUpRight className="w-3 h-3 shrink-0" style={{ color: T.muted }} />
              </a>
            ))}
          </div>
        )}

        {/* NOTIFICATIONS */}
        {activeTab === "notifications" && (
          <div className="p-2 space-y-1.5">
            {notifications.length === 0 ? (
              <div className="py-8 text-center">
                <Bell className="w-7 h-7 mx-auto mb-2" style={{ color: T.subtle }} />
                <p className="text-xs" style={{ color: T.muted }}>No notifications</p>
              </div>
            ) : notifications.slice(0, 20).map((n) => (
              <button key={n.id} onClick={() => !n.is_read && markRead.mutate(n.id)}
                className="w-full text-left flex items-start gap-2.5 px-3 py-2.5 rounded-xl transition-colors hover:bg-white/[0.04]"
                style={{ opacity: n.is_read ? 0.5 : 1 }}>
                <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                  style={{ background: n.is_read ? T.card : "rgba(99,102,241,0.15)" }}>
                  <Bell className="w-2.5 h-2.5" style={{ color: n.is_read ? T.muted : "#a5b4fc" }} />
                </div>
                <div className="flex-1 min-w-0">
                  {n.title && <p className="text-[11px] font-semibold mb-0.5" style={{ color: T.text }}>{n.title}</p>}
                  <p className="text-[11px] leading-relaxed" style={{ color: T.muted }}>{n.message}</p>
                  <p className="text-[10px] mt-1" style={{ color: T.subtle }}>
                    {new Date(n.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </p>
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

// ─── CENTER VIDEO ─────────────────────────────────────────────────────────────

const VideoGrid = memo(({ participants, activeSpeakerId, isConnecting, isConnected, error, roomName, onRetry }: {
  participants: DailyParticipant[];
  activeSpeakerId: string | null;
  isConnecting: boolean;
  isConnected: boolean;
  error: string | null;
  roomName: string | null;
  onRetry: () => void;
}) => {
  const mainSpeaker = participants.find((p) => p.session_id === activeSpeakerId)
    ?? participants.find((p) => !p.local)
    ?? participants[0];

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 text-center p-8">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
          style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}>
          <WifiOff className="w-7 h-7 text-red-400" />
        </div>
        <div>
          <p className="text-sm font-semibold text-red-400 mb-1">Connection failed</p>
          <p className="text-xs max-w-xs" style={{ color: T.muted }}>{error || "Could not connect to the meeting room."}</p>
        </div>
        <button onClick={onRetry}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white"
          style={{ background: "rgba(99,102,241,0.2)", border: "1px solid rgba(99,102,241,0.3)" }}>
          <RefreshCw className="w-4 h-4" /> Retry Connection
        </button>
      </div>
    );
  }

  if (isConnecting) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: T.accent }} />
        <p className="text-sm" style={{ color: T.muted }}>Connecting to Daily.co…</p>
      </div>
    );
  }

  if (!roomName && !isConnected) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-center p-6">
        <Video className="w-12 h-12" style={{ color: T.subtle }} />
        <p className="text-sm" style={{ color: T.muted }}>No video room attached to this call</p>
      </div>
    );
  }

  if (participants.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-center p-6">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
          style={{ background: T.card, border: `1px solid ${T.border}` }}>
          <Users className="w-8 h-8" style={{ color: T.subtle }} />
        </div>
        <div>
          <p className="text-sm font-medium" style={{ color: T.muted }}>Waiting for participants</p>
          <p className="text-xs mt-1" style={{ color: T.subtle }}>Share the meeting link to invite guests</p>
        </div>
      </div>
    );
  }

  if (participants.length === 1) {
    return (
      <VideoTile participant={participants[0]} isMain activeSpeakerId={activeSpeakerId} className="h-full" />
    );
  }

  if (participants.length === 2) {
    return (
      <div className="grid grid-cols-2 gap-3 h-full">
        {participants.map((p) => (
          <VideoTile key={p.session_id} participant={p} activeSpeakerId={activeSpeakerId} className="h-full" />
        ))}
      </div>
    );
  }

  // 3+ participants: spotlight + filmstrip
  const others = participants.filter((p) => p.session_id !== mainSpeaker?.session_id);
  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="flex-1 min-h-0">
        {mainSpeaker && (
          <VideoTile participant={mainSpeaker} isMain activeSpeakerId={activeSpeakerId} className="h-full" />
        )}
      </div>
      <div className={cn("grid gap-3 shrink-0", `grid-cols-${Math.min(others.length, 4)}`)} style={{ height: "28%" }}>
        {others.slice(0, 4).map((p) => (
          <VideoTile key={p.session_id} participant={p} activeSpeakerId={activeSpeakerId} className="h-full" />
        ))}
      </div>
    </div>
  );
});

// ─── RIGHT AI PANEL ───────────────────────────────────────────────────────────

interface RightPanelProps {
  activeTab: RightTab;
  onTab: (t: RightTab) => void;
  transcripts: any[];
  objections: any[];
  topics: any[];
  sentimentScore: number;
  talkRatio: { rep: number; prospect: number };
  questionsCount: number;
  participantCount: number;
  isStreaming: boolean;
  chunksSent: number;
  elapsedSeconds: number;
  workspace: any;
}

const RightPanel = memo(({
  activeTab, onTab, transcripts, objections, topics,
  sentimentScore, talkRatio, questionsCount, participantCount,
  isStreaming, chunksSent, elapsedSeconds, workspace,
}: RightPanelProps) => {
  const txEndRef = useRef<HTMLDivElement>(null);
  const [autoscroll, setAutoscroll] = useState(true);
  const sm = sentimentMeta(sentimentScore);
  const SmIcon = sm.icon;

  useEffect(() => {
    if (autoscroll && activeTab === "transcript") {
      txEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [transcripts.length, autoscroll, activeTab]);

  const allInsights = useMemo(() => {
    const out: Array<{ type: "objection" | "signal" | "coaching" | "competitor"; text: string; suggestion?: string; time: string }> = [];
    objections.forEach((o) => out.push({
      type: "objection",
      text: o.objection_type,
      suggestion: o.suggestion ?? undefined,
      time: new Date(o.detected_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    }));
    workspace?.signals?.forEach((s: any) => {
      const type = s.signal_type === "buying_signal" ? "signal"
        : s.signal_type === "competitor_mention" ? "competitor"
        : "signal";
      out.push({ type, text: s.text, time: new Date(s.detected_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) });
    });
    return out.sort((a, b) => b.time.localeCompare(a.time));
  }, [objections, workspace?.signals]);

  const tabs: { id: RightTab; label: string; icon: React.FC<any>; badge?: number }[] = [
    { id: "transcript", label: "Transcript", icon: MessageSquare },
    { id: "insights",   label: "Insights",   icon: Sparkles,    badge: allInsights.length || undefined },
    { id: "coaching",   label: "Coaching",   icon: BrainCircuit },
  ];

  return (
    <div className="flex flex-col h-full" style={{ background: T.panel }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b shrink-0"
        style={{ borderColor: T.border }}>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg flex items-center justify-center"
            style={{ background: "linear-gradient(135deg,rgba(99,102,241,0.3),rgba(139,92,246,0.2))", border: "1px solid rgba(99,102,241,0.25)" }}>
            <BrainCircuit className="w-3.5 h-3.5 text-indigo-400" />
          </div>
          <span className="text-xs font-semibold" style={{ color: T.text }}>AI Copilot</span>
        </div>
        <div className="flex items-center gap-2">
          {isStreaming && (
            <div className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full animate-pulse bg-emerald-400" />
              <span className="text-[10px] font-semibold text-emerald-400">{chunksSent} chunks</span>
            </div>
          )}
          <Pill label="LIVE" color={T.emerald} bg="rgba(16,185,129,0.1)" border="rgba(16,185,129,0.2)" pulse />
        </div>
      </div>

      {/* Tab strip */}
      <div className="flex border-b shrink-0" style={{ borderColor: T.border }}>
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button key={tab.id} onClick={() => onTab(tab.id)}
              className="relative flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium border-b-2 transition-all"
              style={{
                borderColor: activeTab === tab.id ? T.accent : "transparent",
                color: activeTab === tab.id ? "#a5b4fc" : T.muted,
              }}>
              <Icon className="w-3 h-3" />
              {tab.label}
              {tab.badge != null && (
                <span className="w-4 h-4 rounded-full bg-indigo-500 text-white text-[9px] flex items-center justify-center font-bold">
                  {tab.badge > 9 ? "9+" : tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">

        {/* TRANSCRIPT */}
        {activeTab === "transcript" && (
          <div className="relative">
            <div className="flex items-center justify-between px-3 py-2 border-b sticky top-0 z-10"
              style={{ background: T.panel, borderColor: T.border }}>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[11px] font-medium text-emerald-400">
                  {transcripts.length} lines {isStreaming ? "· Transcribing…" : ""}
                </span>
              </div>
              <button onClick={() => setAutoscroll((v) => !v)}
                className="text-[10px] flex items-center gap-1 transition-colors"
                style={{ color: autoscroll ? T.accent : T.muted }}>
                {autoscroll ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                {autoscroll ? "Auto-scroll on" : "Paused"}
              </button>
            </div>
            <div className="p-3 space-y-3">
              {transcripts.length === 0 ? (
                <div className="py-8 text-center">
                  <Mic className="w-7 h-7 mx-auto mb-2" style={{ color: T.subtle }} />
                  <p className="text-xs" style={{ color: T.muted }}>Transcript will appear as you speak</p>
                  {!isStreaming && (
                    <p className="text-[10px] mt-1" style={{ color: T.subtle }}>Audio starts once connected</p>
                  )}
                </div>
              ) : transcripts.map((line: any) => {
                const isHost = line.speaker === "You" || line.speaker === "Rep" || line.speaker === "Host";
                return (
                  <TxLine key={line.id}
                    speaker={line.speaker} speakerName={line.speaker_name}
                    text={line.text} isHost={isHost}
                    time={new Date(line.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })} />
                );
              })}
              <div ref={txEndRef} />
            </div>
          </div>
        )}

        {/* INSIGHTS */}
        {activeTab === "insights" && (
          <div className="p-3 space-y-3">
            {/* Sentiment */}
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
                  style={{ width: `${sentimentScore}%`, background: `linear-gradient(90deg, ${sm.color}, ${sm.color}99)` }} />
              </div>
              <p className="text-[10px] mt-1.5" style={{ color: T.muted }}>{sm.label}</p>
            </div>

            {/* Talk ratio */}
            <div className="p-3 rounded-xl border" style={{ background: T.card, borderColor: T.border }}>
              <div className="flex justify-between text-[11px] mb-2">
                <span style={{ color: "#818cf8" }}>You {talkRatio.rep}%</span>
                <span style={{ color: T.muted }}>Talk Ratio</span>
                <span style={{ color: "#a78bfa" }}>Prospect {talkRatio.prospect}%</span>
              </div>
              <div className="h-2 rounded-full flex overflow-hidden" style={{ background: T.subtle }}>
                <div className="h-full rounded-l-full" style={{ width: `${talkRatio.rep}%`, background: "linear-gradient(90deg,#6366f1,#8b5cf6)" }} />
                <div className="h-full rounded-r-full" style={{ width: `${talkRatio.prospect}%`, background: "linear-gradient(90deg,#8b5cf6,#a78bfa)" }} />
              </div>
              {talkRatio.rep > 65 && (
                <p className="text-[10px] mt-1.5" style={{ color: T.amber }}>⚠ Let them talk more</p>
              )}
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Questions", value: questionsCount, icon: MessageCircle, color: "#818cf8" },
                { label: "Topics",    value: topics.length,  icon: Hash,           color: "#2dd4bf" },
                { label: "People",    value: participantCount, icon: Users,         color: "#60a5fa" },
                { label: "Objections",value: objections.length, icon: AlertCircle, color: T.amber },
              ].map(({ label, value, icon: Icon, color }) => (
                <div key={label} className="p-2.5 rounded-xl border text-center" style={{ background: T.card, borderColor: T.border }}>
                  <div className="flex items-center justify-center gap-1 mb-0.5">
                    <Icon className="w-3 h-3" style={{ color }} />
                  </div>
                  <div className="text-base font-bold font-mono" style={{ color: T.text }}>{value}</div>
                  <div className="text-[10px]" style={{ color: T.muted }}>{label}</div>
                </div>
              ))}
            </div>

            {/* Key topics */}
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

            {/* AI insights */}
            {allInsights.length > 0 && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: T.muted }}>AI Detections</p>
                <div className="space-y-2">
                  {allInsights.slice(0, 8).map((ins, i) => (
                    <InsightCard key={i} {...ins} />
                  ))}
                </div>
              </div>
            )}

            {allInsights.length === 0 && (
              <div className="py-4 text-center">
                <Sparkles className="w-6 h-6 mx-auto mb-2" style={{ color: T.subtle }} />
                <p className="text-xs" style={{ color: T.muted }}>Insights will appear as detected</p>
              </div>
            )}

            {/* Deal health */}
            {workspace?.deal && (
              <div className="p-3 rounded-xl border" style={{ background: "rgba(99,102,241,0.06)", borderColor: "rgba(99,102,241,0.2)" }}>
                <div className="flex items-center gap-2 mb-2">
                  <Link2 className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="text-xs font-semibold text-indigo-300">Linked Deal</span>
                </div>
                <p className="text-xs font-medium mb-1" style={{ color: T.text }}>{workspace.deal.deal_name}</p>
                {workspace.deal.stage && (
                  <Pill label={workspace.deal.stage} color="#818cf8" bg="rgba(99,102,241,0.1)" border="rgba(99,102,241,0.2)" />
                )}
              </div>
            )}
          </div>
        )}

        {/* COACHING */}
        {activeTab === "coaching" && (
          <div className="p-3 space-y-3">
            {/* Performance score */}
            <div className="p-4 rounded-xl border" style={{ background: "rgba(99,102,241,0.06)", borderColor: "rgba(99,102,241,0.18)" }}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-medium mb-0.5" style={{ color: T.muted }}>Meeting Score</p>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl font-black text-white">{Math.round(sentimentScore * 0.9)}</span>
                    <span className="text-sm" style={{ color: T.muted }}>/100</span>
                  </div>
                </div>
                <div className="w-12 h-12 rounded-xl flex items-center justify-center"
                  style={{ background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.25)" }}>
                  <Trophy className="w-5 h-5 text-indigo-400" />
                </div>
              </div>
            </div>

            {/* Engagement */}
            {workspace?.engagement?.length > 0 && (
              <div className="p-3 rounded-xl border" style={{ background: T.card, borderColor: T.border }}>
                <p className="text-[11px] font-semibold mb-2" style={{ color: T.muted }}>Engagement</p>
                {workspace.engagement.slice(0, 3).map((e: any) => (
                  <div key={e.session_id} className="flex items-center gap-2 py-1">
                    <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                      style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)" }}>
                      {(e.user_name || "?")[0]?.toUpperCase()}
                    </div>
                    <span className="text-[11px] flex-1 truncate" style={{ color: T.text }}>{e.user_name || "Participant"}</span>
                    <div className="flex items-center gap-1.5">
                      <div className="h-1.5 w-16 rounded-full" style={{ background: T.subtle }}>
                        <div className="h-full rounded-full bg-indigo-500" style={{ width: `${Math.min(e.engagement_score, 100)}%` }} />
                      </div>
                      <span className="text-[10px] font-mono" style={{ color: T.muted }}>{e.engagement_score ?? 0}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* AI coaching suggestions */}
            {workspace?.coaching_suggestions?.length > 0 ? (
              <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: T.muted }}>AI Suggestions</p>
                {workspace.coaching_suggestions.slice(0, 4).map((s: any) => (
                  <InsightCard key={s.id} type="coaching" text={s.suggestion_text}
                    time={new Date(s.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} />
                ))}
              </div>
            ) : (
              <>
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: T.muted }}>Live Tips</p>
                {[
                  { icon: Flame,  text: "Ask open-ended questions to uncover pain points", color: T.amber },
                  { icon: Target, text: "Re-qualify the decision maker and timeline", color: "#60a5fa" },
                  { icon: Shield, text: "Confirm all stakeholders are on this call",  color: "#a78bfa" },
                  { icon: MessageCircle, text: "Pause — let them fill the silence",    color: T.emerald },
                ].map(({ icon: Icon, text, color }, i) => (
                  <div key={i} className="flex items-start gap-2.5 p-3 rounded-xl border"
                    style={{ background: `${color}0a`, borderColor: `${color}22` }}>
                    <Icon className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color }} />
                    <p className="text-xs leading-relaxed" style={{ color: T.text }}>{text}</p>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

// ─── MOBILE LAYOUT ─────────────────────────────────────────────────────────────

interface MobileLayoutProps {
  liveCall: any;
  daily: ReturnType<typeof useDailyCall>;
  audioStreaming: any;
  transcripts: any[];
  objections: any[];
  topics: any[];
  sentimentScore: number;
  talkRatio: { rep: number; prospect: number };
  questionsCount: number;
  workspace: any;
  guestRequests: any[];
  admitGuest: (id: string) => void;
  denyGuest: (id: string) => void;
  isRespondingToGuest: boolean;
  callId: string | null;
  userId: string | undefined;
  isAudioOn: boolean;
  isVideoOn: boolean;
  onToggleMic: () => void;
  onToggleCam: () => void;
  onEnd: () => void;
  isEnding: boolean;
  onRetryJoin: () => void;
  usage: any;
}

const MobileLayout = memo(({
  liveCall, daily, audioStreaming, transcripts, objections, topics,
  sentimentScore, talkRatio, questionsCount, workspace, guestRequests,
  admitGuest, denyGuest, isRespondingToGuest, callId, userId,
  isAudioOn, isVideoOn, onToggleMic, onToggleCam, onEnd, isEnding,
  onRetryJoin, usage,
}: MobileLayoutProps) => {
  const [tab, setTab] = useState<MobileTab>("meeting");
  const [rightTab, setRightTab] = useState<RightTab>("transcript");
  const [leftTab, setLeftTab] = useState<LeftTab>("chat");

  const mobileTabs: { id: MobileTab; icon: React.FC<any>; label: string }[] = [
    { id: "meeting", icon: Video,          label: "Meeting" },
    { id: "ai",      icon: BrainCircuit,   label: "AI" },
    { id: "chat",    icon: MessageSquare,  label: "Chat" },
    { id: "people",  icon: Users,          label: "People" },
  ];

  return (
    <div className="flex flex-col" style={{ height: "calc(100dvh - 56px)", background: T.bg }}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-3 py-2 border-b shrink-0"
        style={{ borderColor: T.border, background: T.panel }}>
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" style={{ boxShadow: "0 0 6px rgba(239,68,68,.8)" }} />
          <span className="text-xs font-semibold text-white truncate max-w-[140px]">
            {liveCall?.name || "Live Meeting"}
          </span>
          <span className="text-[11px] font-mono shrink-0" style={{ color: T.muted }}>{fmt(daily.elapsedSeconds)}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <NetDot quality={daily.networkQuality} />
          {daily.isRecording && <RecBadge />}
          {audioStreaming.state.isStreaming && <Sparkles className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />}
        </div>
      </div>

      {/* Minute usage */}
      {usage && !usage.isUnlimited && usage.pct >= 70 && (
        <div className="px-3 py-2 shrink-0"
          style={{ background: usage.pct >= 90 ? "rgba(239,68,68,0.08)" : "rgba(245,158,11,0.08)",
                   borderBottom: `1px solid ${usage.pct >= 90 ? "rgba(239,68,68,0.2)" : "rgba(245,158,11,0.2)"}` }}>
          <p className="text-[11px] font-medium" style={{ color: usage.pct >= 90 ? T.red : T.amber }}>
            {usage.minutesRemaining} minutes remaining — {Math.round(usage.pct)}% used
          </p>
        </div>
      )}

      {/* Guest requests */}
      <GuestBanner requests={guestRequests} admit={admitGuest} deny={denyGuest} loading={isRespondingToGuest} />

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === "meeting" && (
          <div className="flex flex-col h-full">
            <div className="flex-1 p-2 min-h-0">
              <VideoGrid
                participants={daily.participants}
                activeSpeakerId={daily.activeSpeakerId}
                isConnecting={daily.isConnecting}
                isConnected={daily.isConnected}
                error={daily.error}
                roomName={(liveCall as any)?.daily_room_name}
                onRetry={onRetryJoin}
              />
            </div>
          </div>
        )}

        {tab === "ai" && (
          <RightPanel
            activeTab={rightTab} onTab={setRightTab}
            transcripts={transcripts} objections={objections} topics={topics}
            sentimentScore={sentimentScore} talkRatio={talkRatio}
            questionsCount={questionsCount} participantCount={daily.participantCount}
            isStreaming={audioStreaming.state.isStreaming} chunksSent={audioStreaming.state.chunksSent}
            elapsedSeconds={daily.elapsedSeconds} workspace={workspace}
          />
        )}

        {(tab === "chat" || tab === "people") && (
          <LeftPanel
            activeTab={tab === "chat" ? "chat" : "people"}
            onTab={(t) => setLeftTab(t)}
            participants={daily.participants}
            activeSpeakerId={daily.activeSpeakerId}
            callId={callId} userId={userId}
          />
        )}
      </div>

      {/* Bottom controls */}
      <div className="shrink-0 border-t" style={{ borderColor: T.border, background: T.panel }}>
        {/* Tab nav */}
        <div className="flex border-b" style={{ borderColor: T.border }}>
          {mobileTabs.map(({ id, icon: Icon, label }) => (
            <button key={id} onClick={() => setTab(id)}
              className="flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors"
              style={{ color: tab === id ? "#a5b4fc" : T.muted }}>
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Media controls */}
        <div className="flex items-center justify-between px-4 py-2">
          <div className="flex items-center gap-1">
            <Ctrl icon={isAudioOn ? Mic : MicOff} label="Mic" active={isAudioOn} compact onClick={onToggleMic} />
            <Ctrl icon={isVideoOn ? Video : VideoOff} label="Cam" active={isVideoOn} compact onClick={onToggleCam} />
            <Ctrl icon={CircleDot} label="Rec" compact
              onClick={() => daily.isRecording ? daily.stopRecording() : daily.startRecording()}
              badge={daily.isRecording ? 1 : undefined} />
          </div>
          <button onClick={onEnd} disabled={isEnding}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all active:scale-95"
            style={{ background: "linear-gradient(135deg,#dc2626,#b91c1c)", boxShadow: "0 4px 16px rgba(220,38,38,.3)" }}>
            {isEnding ? <Loader2 className="w-4 h-4 animate-spin" /> : <PhoneOff className="w-4 h-4" />}
            End
          </button>
        </div>
      </div>
    </div>
  );
});

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export default function LiveMeeting() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const { team } = useTeam();
  const { setStatus } = useUserStatus(team?.id);

  const { liveCall, isLive, isLoading, transcripts, objections, topics, endCall, callId } =
    useLiveCall({ onCallEnded: () => setStatus("available") });

  const roomName    = (liveCall as any)?.daily_room_name   ?? null;
  const meetingToken = (liveCall as any)?.daily_meeting_token ?? null;

  const daily = useDailyCall({
    callId:   callId ?? null,
    roomName,
    meetingToken,
    userName: "Host",
    onJoined:          () => setStatus("on_call"),
    onLeft:            () => {},
    onParticipantJoined: (p) => toast.success(`${p.user_name || "Someone"} joined`),
    onParticipantLeft:   () => toast.info("A participant left"),
    onRecordingStarted:  () => toast.success("Recording started"),
    onRecordingStopped:  () => toast.info("Recording stopped"),
    onNetworkQualityChange: (q) => {
      if (q === "poor") toast.warning("Weak connection — video quality reduced", { id: "daily-net" });
      else toast.dismiss("daily-net");
    },
  });

  const audioStreaming = useAudioStreaming({ callId: callId ?? null });

  const { requests: guestRequests, admit: admitGuest, deny: denyGuest, isResponding: isRespondingToGuest } =
    usePendingGuestRequests(callId);

  const { workspace, isLoading: wsLoading } = useMeetingWorkspace(callId);

  const { usage } = useMinuteUsage();

  // State
  const [leftTab,  setLeftTab]  = useState<LeftTab>("people");
  const [rightTab, setRightTab] = useState<RightTab>("transcript");
  const [isAudioOn, setIsAudioOn] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [leftCollapsed,  setLeftCollapsed]  = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);

  // Join once
  const joinAttemptedRef = useRef(false);
  useEffect(() => {
    if (!roomName || joinAttemptedRef.current || daily.isConnected || daily.isConnecting || daily.callState === "error") return;
    joinAttemptedRef.current = true;
    daily.joinCall({ rName: roomName, token: meetingToken ?? undefined, displayName: "Host" })
      .then((ok) => { if (!ok) joinAttemptedRef.current = false; });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomName]);

  // Hook participant audio into transcription
  const tracksStartedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const p of daily.participants) {
      if (p.audioTrack && !tracksStartedRef.current.has(p.session_id)) {
        tracksStartedRef.current.add(p.session_id);
        audioStreaming.startTrackRecording(p.audioTrack, p.session_id, p.local);
      }
    }
  }, [daily.participants, audioStreaming]);

  // Redirect if no live call
  useEffect(() => {
    if (!isLoading && !isLive) navigate("/live");
  }, [isLoading, isLive, navigate]);

  // Derived data
  const talkRatio = useMemo(() => {
    if (!transcripts.length) return { rep: 50, prospect: 50 };
    const isHost = (t: any) => t.speaker === "You" || t.speaker === "Rep" || t.speaker === "Host";
    const rw = transcripts.filter(isHost).reduce((s, t) => s + t.text.split(/\s+/).length, 0);
    const pw = transcripts.filter((t: any) => !isHost(t)).reduce((s, t) => s + t.text.split(/\s+/).length, 0);
    const total = rw + pw;
    if (!total) return { rep: 50, prospect: 50 };
    return { rep: Math.round((rw / total) * 100), prospect: Math.round((pw / total) * 100) };
  }, [transcripts]);

  const questionsCount = useMemo(() => transcripts.filter((t: any) => t.text.includes("?")).length, [transcripts]);
  const sentimentScore = liveCall?.sentiment_score ?? 74;
  const meetingType = (liveCall as any)?.meeting_type as string | undefined;

  const handleToggleMic = useCallback(async () => {
    await daily.setAudioEnabled(!isAudioOn);
    setIsAudioOn((v) => !v);
  }, [isAudioOn, daily]);

  const handleToggleCam = useCallback(async () => {
    await daily.setVideoEnabled(!isVideoOn);
    setIsVideoOn((v) => !v);
  }, [isVideoOn, daily]);

  const handleEnd = useCallback(async () => {
    audioStreaming.stopAll();
    await daily.leaveCall();
    try {
      await endCall.mutateAsync();
      toast.success("Call ended — generating AI summary…");
      navigate(callId ? `/calls/${callId}` : "/live");
    } catch { toast.error("Failed to end call"); }
  }, [endCall, callId, navigate, audioStreaming, daily]);

  const handleRetryJoin = useCallback(() => {
    if (!roomName) return;
    joinAttemptedRef.current = false;
    daily.joinCall({ rName: roomName, token: meetingToken ?? undefined, displayName: "Host" })
      .then((ok) => { joinAttemptedRef.current = ok; });
  }, [roomName, meetingToken, daily]);

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: T.accent }} />
        </div>
      </DashboardLayout>
    );
  }

  // ─── MOBILE ────────────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <DashboardLayout>
        <MobileLayout
          liveCall={liveCall} daily={daily} audioStreaming={audioStreaming}
          transcripts={transcripts} objections={objections} topics={topics}
          sentimentScore={sentimentScore} talkRatio={talkRatio} questionsCount={questionsCount}
          workspace={workspace} guestRequests={guestRequests}
          admitGuest={admitGuest} denyGuest={denyGuest} isRespondingToGuest={isRespondingToGuest}
          callId={callId} userId={user?.id}
          isAudioOn={isAudioOn} isVideoOn={isVideoOn}
          onToggleMic={handleToggleMic} onToggleCam={handleToggleCam}
          onEnd={handleEnd} isEnding={endCall.isPending}
          onRetryJoin={handleRetryJoin} usage={usage}
        />
      </DashboardLayout>
    );
  }

  // ─── DESKTOP ───────────────────────────────────────────────────────────────
  return (
    <DashboardLayout>
      <div className="flex flex-col -mx-4 -mt-4 overflow-hidden"
        style={{ height: "calc(100vh - 56px)", background: T.bg }}>

        {/* TOP NAV */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b shrink-0"
          style={{ borderColor: T.border, background: T.panel, backdropFilter: "blur(20px)" }}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center gap-2 shrink-0">
              <span className="w-2 h-2 rounded-full bg-red-500" style={{ boxShadow: "0 0 8px rgba(239,68,68,.9)" }} />
              <span className="text-[11px] font-bold text-red-400 uppercase tracking-widest">Live</span>
            </div>
            <div className="h-4 w-px shrink-0" style={{ background: T.border }} />
            <span className="text-sm font-semibold text-white truncate">{liveCall?.name || "Live Meeting"}</span>
            {meetingType && (
              <Pill label={meetingType.charAt(0).toUpperCase() + meetingType.slice(1)}
                color="#a5b4fc" bg="rgba(99,102,241,0.1)" border="rgba(99,102,241,0.2)"
                icon={Tag} />
            )}
          </div>

          <div className="flex items-center gap-4 shrink-0">
            {/* Timer */}
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" style={{ color: T.muted }} />
              <span className="text-sm font-mono font-semibold text-white tabular-nums">{fmt(daily.elapsedSeconds)}</span>
            </div>

            <NetDot quality={daily.networkQuality} />

            <div className="flex items-center gap-1.5" style={{ color: T.muted }}>
              <Users className="w-3.5 h-3.5" />
              <span className="text-xs">{daily.participantCount}</span>
            </div>

            {daily.isRecording && <RecBadge />}

            {audioStreaming.state.isStreaming && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg"
                style={{ background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)" }}>
                <Sparkles className="w-3 h-3 text-indigo-400" />
                <span className="text-[10px] font-semibold text-indigo-400">{audioStreaming.state.chunksSent} chunks</span>
              </div>
            )}

            {/* Minute usage pill */}
            {usage && !usage.isUnlimited && usage.pct >= 60 && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg"
                style={{ background: usage.pct >= 85 ? "rgba(239,68,68,0.1)" : "rgba(245,158,11,0.1)",
                         border: `1px solid ${usage.pct >= 85 ? "rgba(239,68,68,0.25)" : "rgba(245,158,11,0.25)"}` }}>
                <Clock className="w-3 h-3" style={{ color: usage.pct >= 85 ? T.red : T.amber }} />
                <span className="text-[10px] font-semibold" style={{ color: usage.pct >= 85 ? T.red : T.amber }}>
                  {usage.minutesRemaining} min left
                </span>
              </div>
            )}

            {/* Avatars row */}
            <div className="flex -space-x-1.5">
              {daily.participants.slice(0, 4).map((p) => (
                <div key={p.session_id}
                  className="w-7 h-7 rounded-full border-2 flex items-center justify-center text-[10px] font-bold text-white"
                  style={{ borderColor: T.bg, background: p.session_id === daily.activeSpeakerId
                    ? "linear-gradient(135deg,#10b981,#059669)"
                    : "linear-gradient(135deg,#6366f1,#8b5cf6)" }}
                  title={p.user_name}>
                  {(p.user_name || "?")[0]?.toUpperCase()}
                </div>
              ))}
            </div>

            {/* Collapse toggles */}
            <div className="flex items-center gap-1">
              <button onClick={() => setLeftCollapsed((v) => !v)}
                className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
                style={{ background: T.card, border: `1px solid ${T.border}` }}
                title={leftCollapsed ? "Show sidebar" : "Hide sidebar"}>
                {leftCollapsed ? <PanelLeft className="w-3.5 h-3.5" style={{ color: T.muted }} /> : <PanelLeft className="w-3.5 h-3.5 text-indigo-400" />}
              </button>
              <button onClick={() => setRightCollapsed((v) => !v)}
                className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
                style={{ background: T.card, border: `1px solid ${T.border}` }}
                title={rightCollapsed ? "Show AI panel" : "Hide AI panel"}>
                {rightCollapsed ? <PanelRight className="w-3.5 h-3.5" style={{ color: T.muted }} /> : <PanelRight className="w-3.5 h-3.5 text-indigo-400" />}
              </button>
            </div>
          </div>
        </div>

        {/* GUEST BANNER */}
        <GuestBanner requests={guestRequests} admit={admitGuest} deny={denyGuest} loading={isRespondingToGuest} />

        {/* 3-COLUMN BODY */}
        <div className="flex flex-1 min-h-0 overflow-hidden">

          {/* LEFT SIDEBAR */}
          {!leftCollapsed && (
            <div className="w-60 xl:w-64 shrink-0 border-r flex flex-col" style={{ borderColor: T.border }}>
              <LeftPanel
                activeTab={leftTab} onTab={setLeftTab}
                participants={daily.participants} activeSpeakerId={daily.activeSpeakerId}
                callId={callId} userId={user?.id}
              />
            </div>
          )}

          {/* CENTER */}
          <div className="flex-1 flex flex-col min-w-0">
            <div className="flex-1 p-3 min-h-0">
              <VideoGrid
                participants={daily.participants}
                activeSpeakerId={daily.activeSpeakerId}
                isConnecting={daily.isConnecting}
                isConnected={daily.isConnected}
                error={daily.error}
                roomName={roomName}
                onRetry={handleRetryJoin}
              />
            </div>

            {/* AI status bar */}
            {daily.isConnected && (
              <div className="mx-3 mb-2 px-4 py-2 rounded-xl flex items-center justify-between shrink-0"
                style={{ background: "rgba(99,102,241,0.05)", border: "1px solid rgba(99,102,241,0.12)" }}>
                <div className="flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="text-xs" style={{ color: T.muted }}>AI is analyzing your conversation</span>
                  {objections.length > 0 && (
                    <span className="text-xs font-medium text-amber-400">· {objections.length} objection{objections.length !== 1 ? "s" : ""} detected</span>
                  )}
                </div>
                <button className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                  onClick={() => { setRightCollapsed(false); setRightTab("insights"); }}>
                  View insights <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            )}

            {/* CONTROL BAR */}
            <div className="mx-3 mb-3 shrink-0">
              <div className="flex items-center justify-between px-3 py-2 rounded-2xl"
                style={{ background: "rgba(13,15,24,0.95)", border: `1px solid ${T.border}`,
                         backdropFilter: "blur(24px)", boxShadow: "0 8px 32px rgba(0,0,0,.5)" }}>
                {/* Left controls */}
                <div className="flex items-center gap-1">
                  <Ctrl icon={isAudioOn ? Mic : MicOff} label="Mic" active={isAudioOn} onClick={handleToggleMic} />
                  <Ctrl icon={isVideoOn ? Video : VideoOff} label="Camera" active={isVideoOn} onClick={handleToggleCam} />
                  <Ctrl icon={MonitorPlay} label="Screen"
                    onClick={() => daily.localParticipant?.screen ? daily.stopScreenShare() : daily.startScreenShare()} />
                  <Ctrl icon={Hand} label="Raise Hand" />
                </div>

                {/* Right controls */}
                <div className="flex items-center gap-1">
                  <Ctrl icon={BrainCircuit} label="AI Panel"
                    onClick={() => setRightCollapsed((v) => !v)}
                    badge={rightCollapsed && (objections.length || 0)} />
                  <Ctrl icon={CircleDot} label={daily.isRecording ? "Stop" : "Record"}
                    active={!daily.isRecording}
                    badge={daily.isRecording ? 1 : undefined}
                    onClick={() => daily.isRecording ? daily.stopRecording() : daily.startRecording()} />
                  <Ctrl icon={Users} label="Participants" badge={guestRequests.length || undefined}
                    onClick={() => { setLeftCollapsed(false); setLeftTab("people"); }} />
                  <Ctrl icon={Settings} label="Settings" />
                </div>

                {/* End call */}
                <button onClick={handleEnd} disabled={endCall.isPending}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95"
                  style={{ background: "linear-gradient(135deg,#dc2626,#b91c1c)", boxShadow: "0 4px 16px rgba(220,38,38,.35)" }}>
                  {endCall.isPending
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <PhoneOff className="w-4 h-4" />}
                  End Call
                </button>
              </div>
            </div>
          </div>

          {/* RIGHT AI PANEL */}
          {!rightCollapsed && (
            <div className="w-72 xl:w-80 shrink-0 border-l flex flex-col" style={{ borderColor: T.border }}>
              <RightPanel
                activeTab={rightTab} onTab={setRightTab}
                transcripts={transcripts} objections={objections} topics={topics}
                sentimentScore={sentimentScore} talkRatio={talkRatio}
                questionsCount={questionsCount} participantCount={daily.participantCount}
                isStreaming={audioStreaming.state.isStreaming} chunksSent={audioStreaming.state.chunksSent}
                elapsedSeconds={daily.elapsedSeconds} workspace={workspace}
              />
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}