/**
 * LiveMeeting.tsx — v4 (Daily + Lovable AI rebuild)
 *
 * Architecture:
 *  - Left/center: embedded Daily.co iframe (the actual meeting)
 *  - Right sidebar: live transcript + AI insights from Supabase Realtime
 *  - Transcript is written by the `transcribe-stream` edge function
 *    which receives Daily webhooks / bot transcripts
 *  - Mobile: tabbed layout (Meeting / Transcript / Insights)
 *
 * No manual audio capture — the Daily bot (via join-meeting-bot) handles
 * all recording & transcription server-side.
 */

import DashboardLayout from "@/components/DashboardLayout";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Video as VideoIcon } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Loader2, AlertCircle, Lightbulb, TrendingUp, Clock,
  MessageSquare, BarChart3, Target, CheckCircle2, Radio,
  Users, Bot, StopCircle, ExternalLink, ChevronDown, ChevronUp,
  Zap, Eye, MicOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLiveCall } from "@/hooks/useLiveCall";
import { useTeam } from "@/hooks/useTeam";
import { useUserStatus } from "@/hooks/useUserStatus";
import { useIsMobile } from "@/hooks/use-mobile";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

type BotStatus =
  | "none" | "joining" | "in_waiting_room" | "in_call_not_recording"
  | "recording_permission_allowed" | "in_call" | "recording"
  | "recording_permission_denied" | "call_ended" | "done" | "failed";

const MEETING_TYPE_LABELS: Record<string, string> = {
  discovery: "Discovery", demo: "Demo",
  follow_up: "Follow-up", negotiation: "Negotiation", other: "Meeting",
};

const DISCOVERY_TIPS = [
  "Ask about their current process first",
  "Understand budget authority & timeline",
  "Identify the primary pain point",
  "Who else is involved in the decision?",
  "End with a clear agreed next step",
];

// ─── Bot status hook ──────────────────────────────────────────────────────────

function useBotStatus(callId: string | undefined) {
  const [botStatus, setBotStatus] = useState<BotStatus>("none");

  useEffect(() => {
    if (!callId) return;
    const fetch = async () => {
      const { data } = await (supabase as any)
        .from("calls").select("recall_bot_status").eq("id", callId).maybeSingle();
      if (data?.recall_bot_status) setBotStatus(data.recall_bot_status as BotStatus);
    };
    fetch();
    const ch = supabase.channel(`bot-status:${callId}`)
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "calls", filter: `id=eq.${callId}`,
      }, (p: any) => {
        if (p.new?.recall_bot_status) setBotStatus(p.new.recall_bot_status as BotStatus);
      }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [callId]);

  const isCapturing = ["recording", "recording_permission_allowed", "in_call"].includes(botStatus);
  const isJoining   = ["joining", "in_waiting_room", "in_call_not_recording"].includes(botStatus);
  const isFailed    = ["failed", "recording_permission_denied"].includes(botStatus);

  return { botStatus, isCapturing, isJoining, isFailed };
}

// ─── Bot status banner ────────────────────────────────────────────────────────

function BotBanner({ botStatus, isCapturing, isJoining, isFailed }: {
  botStatus: BotStatus; isCapturing: boolean; isJoining: boolean; isFailed: boolean;
}) {
  if (botStatus === "none" || botStatus === "call_ended" || botStatus === "done") return null;

  const cfg = {
    joining:                      { text: "AI recorder joining the meeting…",                     cls: "border-primary/20 bg-primary/5 text-primary",    icon: <Loader2 className="w-3.5 h-3.5 animate-spin" /> },
    in_waiting_room:              { text: "AI recorder in waiting room — please admit it",         cls: "border-yellow-500/20 bg-yellow-500/5 text-yellow-400", icon: <Loader2 className="w-3.5 h-3.5 animate-spin" /> },
    in_call_not_recording:        { text: "AI recorder joined — starting transcription…",          cls: "border-primary/20 bg-primary/5 text-primary",    icon: <Loader2 className="w-3.5 h-3.5 animate-spin" /> },
    recording_permission_allowed: { text: "🎙️ Both sides being transcribed by AI",                 cls: "border-green-500/20 bg-green-500/5 text-green-400", icon: <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" /> },
    in_call:                      { text: "🎙️ AI recorder active — transcribing both sides",       cls: "border-green-500/20 bg-green-500/5 text-green-400", icon: <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" /> },
    recording:                    { text: "🎙️ AI transcription active — both sides captured",      cls: "border-green-500/20 bg-green-500/5 text-green-400", icon: <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" /> },
    recording_permission_denied:  { text: "Recording permission denied — allow in meeting settings", cls: "border-yellow-500/20 bg-yellow-500/5 text-yellow-400", icon: <AlertCircle className="w-3.5 h-3.5" /> },
    failed:                       { text: "AI recorder failed — transcript unavailable",            cls: "border-red-500/20 bg-red-500/5 text-red-400",    icon: <AlertCircle className="w-3.5 h-3.5" /> },
  } as Record<string, any>;

  const c = cfg[botStatus];
  if (!c) return null;

  return (
    <div className={cn("flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border text-xs font-medium", c.cls)}>
      {c.icon}
      {c.text}
    </div>
  );
}

// ─── Transcript line ──────────────────────────────────────────────────────────

function TranscriptLine({ line }: { line: any }) {
  const isRep = line.speaker === "Rep";
  return (
    <div className={cn("group", !isRep && "pl-3 border-l-2 border-accent/30")}>
      <div className="flex items-center gap-2 mb-0.5">
        <span className={cn("text-[11px] font-semibold uppercase tracking-wide", isRep ? "text-primary" : "text-accent")}>
          {line.speaker}
        </span>
        <span className="text-[10px] text-muted-foreground/60">
          {new Date(line.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
        </span>
      </div>
      <p className="text-sm text-foreground/90 leading-relaxed">{line.text}</p>
    </div>
  );
}

// ─── AI insight card ──────────────────────────────────────────────────────────

function InsightCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="glass rounded-xl p-4">
      <h3 className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-2">
        {icon}{title}
      </h3>
      {children}
    </div>
  );
}

// ─── Mobile layout ────────────────────────────────────────────────────────────

type MobileTab = "meeting" | "transcript" | "insights";

function MobileView({
  callId, roomUrl, transcripts, objections, topics,
  talkRatio, engagementScore, questionsCount, elapsed,
  meetingType, isCapturing, formatTime, transcriptEndRef,
}: any) {
  const [tab, setTab] = useState<MobileTab>("meeting");

  return (
    <div className="flex flex-col h-full gap-2">
      {/* Tab bar */}
      <div className="flex border-b border-border shrink-0">
        {([
          { id: "meeting", label: "Meeting" },
          { id: "transcript", label: "Transcript", badge: transcripts.length },
          { id: "insights", label: "Insights", badge: objections.length || undefined },
        ] as const).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex-1 py-2.5 text-xs font-medium border-b-2 transition-colors relative",
              tab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground"
            )}
          >
            {t.label}
            {t.badge ? (
              <span className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-primary/20 text-primary text-[10px]">
                {t.badge > 99 ? "99+" : t.badge}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {tab === "meeting" && (
          <div className="rounded-xl overflow-hidden bg-black" style={{ height: "300px" }}>
            {roomUrl
              ? <iframe src={roomUrl} allow="camera; microphone; fullscreen; display-capture" className="w-full h-full border-none" title="Daily meeting" />
              : <div className="flex items-center justify-center h-full text-muted-foreground text-sm">No meeting URL</div>
            }
          </div>
        )}

        {tab === "transcript" && (
          <div className="space-y-4 pb-4">
            {transcripts.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <Radio className="w-8 h-8 mx-auto mb-3 opacity-20" />
                <p className="text-sm">Transcription appears here as the call progresses</p>
              </div>
            ) : (
              transcripts.map((l: any) => <TranscriptLine key={l.id} line={l} />)
            )}
            <div ref={transcriptEndRef} />
          </div>
        )}

        {tab === "insights" && (
          <div className="space-y-3 pb-4">
            <div className="glass rounded-xl p-3">
              <p className="text-xs text-muted-foreground mb-2">Talk Ratio</p>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-primary">You {talkRatio.rep}%</span>
                <span className="text-accent">Prospect {talkRatio.prospect}%</span>
              </div>
              <div className="h-2 rounded-full bg-muted flex overflow-hidden">
                <div className="h-full bg-primary" style={{ width: `${talkRatio.rep}%` }} />
                <div className="h-full bg-accent" style={{ width: `${talkRatio.prospect}%` }} />
              </div>
              {talkRatio.rep > 65 && transcripts.length > 5 && (
                <p className="text-xs text-yellow-500 mt-1.5">⚠️ Let your prospect talk more</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Engagement", val: `${engagementScore}%` },
                { label: "Questions", val: questionsCount },
                { label: "Objections", val: objections.length },
                { label: "Duration", val: formatTime(elapsed) },
              ].map(({ label, val }) => (
                <div key={label} className="glass rounded-xl p-3 text-center">
                  <div className="text-xl font-bold font-display">{val}</div>
                  <div className="text-xs text-muted-foreground">{label}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

export default function LiveMeeting() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { team } = useTeam();
  const { setStatus } = useUserStatus(team?.id);

  const { liveCall, isLive, isLoading, transcripts, objections, topics, endCall, callId } = useLiveCall({
    onCallEnded: () => setStatus("available"),
  });

  const { botStatus, isCapturing, isJoining, isFailed } = useBotStatus(callId);

  const [elapsed, setElapsed] = useState(0);
  const [showTips, setShowTips] = useState(false);
  const intervalRef      = useRef<number>();
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  const meetingType = (liveCall as any)?.meeting_type as string | undefined;
  const meetingUrl  = (liveCall as any)?.meeting_url as string | undefined;
  const engagementScore = liveCall?.sentiment_score || 0;

  // Talk ratio
  const talkRatio = useMemo(() => {
    if (!transcripts.length) return { rep: 0, prospect: 0 };
    const rw = transcripts.filter(t => t.speaker === "Rep").reduce((s, t) => s + t.text.split(/\s+/).length, 0);
    const pw = transcripts.filter(t => t.speaker !== "Rep").reduce((s, t) => s + t.text.split(/\s+/).length, 0);
    const total = rw + pw;
    if (!total) return { rep: 0, prospect: 0 };
    return { rep: Math.round((rw / total) * 100), prospect: Math.round((pw / total) * 100) };
  }, [transcripts]);

  const questionsCount = useMemo(() => transcripts.filter(t => t.text.includes("?")).length, [transcripts]);

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

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
    if (!isLoading && !isLive) navigate("/dashboard/live");
  }, [isLoading, isLive, navigate]);

  const handleEnd = useCallback(async () => {
    try {
      await endCall.mutateAsync();
      toast.success("Call ended — generating AI summary…");
      navigate(callId ? `/dashboard/calls/${callId}` : "/dashboard/live");
    } catch {
      toast.error("Failed to end call");
    }
  }, [endCall, callId, navigate]);

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  // ════ MOBILE ════════════════════════════════════════════════════════════════
  if (isMobile) {
    return (
      <DashboardLayout>
        <div className="flex flex-col gap-3" style={{ height: "calc(100dvh - 8rem)" }}>
          {/* Header */}
          <div className="flex items-center justify-between gap-2 shrink-0">
            <div className="min-w-0">
              <h1 className="text-base font-bold font-display truncate">{liveCall?.name || "Live Meeting"}</h1>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                <span className="text-xs text-red-400 font-medium">LIVE</span>
                <span className="text-xs text-muted-foreground font-mono">{formatTime(elapsed)}</span>
              </div>
            </div>
            <Button onClick={handleEnd} variant="destructive" size="sm" className="gap-1.5 h-8 text-xs shrink-0" disabled={endCall.isPending}>
              {endCall.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MicOff className="w-3.5 h-3.5" />}
              End
            </Button>
          </div>
          <BotBanner botStatus={botStatus} isCapturing={isCapturing} isJoining={isJoining} isFailed={isFailed} />
          <div className="flex-1 min-h-0">
            <MobileView
              callId={callId} roomUrl={meetingUrl}
              transcripts={transcripts} objections={objections} topics={topics}
              talkRatio={talkRatio} engagementScore={engagementScore}
              questionsCount={questionsCount} elapsed={elapsed}
              meetingType={meetingType} isCapturing={isCapturing}
              formatTime={formatTime} transcriptEndRef={transcriptEndRef}
            />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // ════ DESKTOP ════════════════════════════════════════════════════════════════
  return (
    <DashboardLayout>
      <div className="flex flex-col gap-4 h-full">

        {/* ── Header bar ──────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between flex-wrap gap-3 shrink-0">
          <div>
            <h1 className="text-xl font-bold font-display">{liveCall?.name || "Live Meeting"}</h1>
            <div className="flex items-center gap-3 mt-1">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
                <span className="text-xs text-red-400 font-semibold">LIVE</span>
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground font-mono">
                <Clock className="w-3 h-3" />{formatTime(elapsed)}
              </div>
              {meetingType && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                  {MEETING_TYPE_LABELS[meetingType] || meetingType}
                </span>
              )}
              {(liveCall?.participants as string[] | undefined)?.length ? (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Users className="w-3 h-3" />
                  {(liveCall!.participants as string[]).join(", ")}
                </div>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {meetingUrl && (
              <a href={meetingUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm" className="gap-1.5">
                  <ExternalLink className="w-3.5 h-3.5" />
                  Open meeting
                </Button>
              </a>
            )}
            <Button onClick={handleEnd} variant="destructive" size="sm" className="gap-1.5" disabled={endCall.isPending}>
              {endCall.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <StopCircle className="w-3.5 h-3.5" />}
              End Call
            </Button>
          </div>
        </div>

        {/* Bot status */}
        <BotBanner botStatus={botStatus} isCapturing={isCapturing} isJoining={isJoining} isFailed={isFailed} />

        {/* ── Main content: 3 columns ──────────────────────────────────────── */}
        <div className="grid grid-cols-12 gap-4 flex-1 min-h-0" style={{ maxHeight: "calc(100vh - 220px)" }}>

          {/* Video pane — 5 cols */}
          <div className="col-span-5 glass rounded-xl overflow-hidden flex flex-col">
            <div className="p-3 border-b border-border flex items-center justify-between shrink-0">
              <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <VideoIcon className="w-3 h-3" />Meeting Room
              </span>
              {isCapturing && (
                <span className="flex items-center gap-1.5 text-[11px] text-green-400 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                  Transcribing
                </span>
              )}
            </div>
            <div className="flex-1 bg-black relative min-h-0">
              {meetingUrl
                ? <iframe
                    src={meetingUrl}
                    allow="camera; microphone; fullscreen; display-capture"
                    className="absolute inset-0 w-full h-full border-none"
                    title="Daily meeting"
                  />
                : <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                    <div className="text-center">
                      <Eye className="w-8 h-8 mx-auto mb-2 opacity-20" />
                      <p className="text-sm">Join the meeting to see video</p>
                      {meetingUrl && (
                        <a href={meetingUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary mt-1 hover:underline inline-block">
                          Open meeting →
                        </a>
                      )}
                    </div>
                  </div>
              }
            </div>
          </div>

          {/* Transcript — 4 cols */}
          <div className="col-span-4 glass rounded-xl flex flex-col min-h-0">
            <div className="p-3.5 border-b border-border flex items-center justify-between shrink-0">
              <h2 className="text-xs font-semibold flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-primary" />
                Live Transcript
              </h2>
              {isCapturing ? (
                <span className="flex items-center gap-1.5 text-[11px] text-green-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                  Both sides
                </span>
              ) : isJoining ? (
                <span className="flex items-center gap-1.5 text-[11px] text-primary">
                  <Loader2 className="w-3 h-3 animate-spin" />Joining…
                </span>
              ) : null}
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
              {transcripts.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground pb-8">
                  <Bot className="w-8 h-8 mb-3 opacity-20" />
                  <p className="text-sm text-center">
                    {isJoining ? "AI recorder joining…" : isCapturing ? "Listening for speech…" : "Transcript will appear here"}
                  </p>
                  {isJoining && (
                    <p className="text-xs text-center mt-1 opacity-60">This takes 15–30 seconds</p>
                  )}
                </div>
              ) : (
                <>
                  {transcripts.map(line => <TranscriptLine key={line.id} line={line} />)}
                  <div ref={transcriptEndRef} />
                </>
              )}
            </div>
          </div>

          {/* Insights sidebar — 3 cols */}
          <div className="col-span-3 flex flex-col gap-3 overflow-y-auto min-h-0 pr-0.5">

            {/* Talk ratio */}
            <InsightCard title="Talk Ratio" icon={<BarChart3 className="w-3 h-3" />}>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-primary">You {talkRatio.rep}%</span>
                <span className="text-accent">Prospect {talkRatio.prospect}%</span>
              </div>
              <div className="h-2 rounded-full bg-muted flex overflow-hidden">
                <div className="h-full bg-primary transition-all duration-700" style={{ width: `${talkRatio.rep}%` }} />
                <div className="h-full bg-accent transition-all duration-700" style={{ width: `${talkRatio.prospect}%` }} />
              </div>
              {talkRatio.rep > 65 && transcripts.length > 5 && (
                <p className="text-xs text-yellow-500 mt-2">⚠️ You're over 65% — let them talk more</p>
              )}
            </InsightCard>

            {/* Engagement */}
            <InsightCard title="Engagement" icon={<TrendingUp className="w-3 h-3" />}>
              <div className="flex items-end gap-2 mb-1.5">
                <span className="text-3xl font-bold font-display text-primary">{engagementScore}</span>
                <span className="text-xs text-muted-foreground mb-1">/ 100</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted">
                <div
                  className={cn(
                    "h-1.5 rounded-full transition-all duration-1000",
                    engagementScore >= 70 ? "bg-green-500" : engagementScore >= 40 ? "bg-primary" : "bg-red-500"
                  )}
                  style={{ width: `${engagementScore}%` }}
                />
              </div>
            </InsightCard>

            {/* Stats */}
            <InsightCard title="Call Stats" icon={<Zap className="w-3 h-3" />}>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { v: questionsCount,   l: "Questions" },
                  { v: objections.length, l: "Objections" },
                  { v: topics.length,    l: "Topics" },
                  { v: formatTime(elapsed), l: "Duration" },
                ].map(({ v, l }) => (
                  <div key={l}>
                    <div className="text-base font-bold font-display">{v}</div>
                    <div className="text-[11px] text-muted-foreground">{l}</div>
                  </div>
                ))}
              </div>
            </InsightCard>

            {/* Objections */}
            {objections.length > 0 && (
              <InsightCard title={`Objections (${objections.length})`} icon={<AlertCircle className="w-3 h-3 text-destructive" />}>
                <div className="space-y-2.5 max-h-40 overflow-y-auto">
                  {objections.map(obj => (
                    <div key={obj.id} className="rounded-lg p-2.5 text-xs bg-destructive/5 border border-destructive/15">
                      <p className="font-medium text-destructive/90">{obj.objection_type}</p>
                      {obj.suggestion && (
                        <div className="flex items-start gap-1.5 text-muted-foreground mt-1.5">
                          <Lightbulb className="w-3 h-3 text-accent shrink-0 mt-0.5" />
                          {obj.suggestion}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </InsightCard>
            )}

            {/* Topics */}
            {topics.length > 0 && (
              <InsightCard title="Key Topics" icon={<Radio className="w-3 h-3" />}>
                <div className="flex flex-wrap gap-1.5">
                  {topics.map(t => (
                    <span key={t.id} className="text-[11px] px-2 py-1 rounded-full bg-secondary/60 text-secondary-foreground">
                      {t.topic}
                    </span>
                  ))}
                </div>
              </InsightCard>
            )}

            {/* Discovery tips */}
            {meetingType === "discovery" && (
              <InsightCard title="Discovery Tips" icon={<Target className="w-3 h-3 text-primary" />}>
                <button
                  onClick={() => setShowTips(v => !v)}
                  className="w-full flex items-center justify-between text-xs text-muted-foreground hover:text-foreground mb-2"
                >
                  <span>{showTips ? "Hide" : "Show"} checklist</span>
                  {showTips ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
                {showTips && (
                  <ul className="space-y-2">
                    {DISCOVERY_TIPS.map((tip, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                        <span className="w-4 h-4 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 text-[10px] font-bold mt-0.5">{i + 1}</span>
                        {tip}
                      </li>
                    ))}
                  </ul>
                )}
              </InsightCard>
            )}

          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

// Add missing VideoIcon import
