/**
 * LiveMeetingWithBot.tsx — Bot-aware live meeting view
 *
 * This replaces the audio-capture-first approach.
 * When a bot session is active, we show its status prominently
 * and still display the real-time transcript from server-side transcription.
 *
 * Manual audio capture is shown only as a fallback when bot fails.
 */

import DashboardLayout from "@/components/DashboardLayout";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import {
  Mic, MicOff, AlertCircle, Lightbulb, TrendingUp, Clock, Loader2,
  Video, ExternalLink, MessageSquare, BarChart3, Target,
  CheckCircle2, Radio, Users, Bot, Sparkles, StopCircle,
  ArrowLeft, Monitor, Wifi,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLiveCall } from "@/hooks/useLiveCall";
import { useAudioCapture } from "@/hooks/useAudioCapture";
import { useTeam } from "@/hooks/useTeam";
import { useUserStatus } from "@/hooks/useUserStatus";
import { useIsMobile } from "@/hooks/use-mobile";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ─── Bot status hook ──────────────────────────────────────────────────────────

type BotLiveStatus =
  | "none" | "joining" | "waiting_room" | "in_call"
  | "recording" | "call_ended" | "failed" | "rejected";

function useBotLiveStatus(callId: string | undefined) {
  const [status, setStatus] = useState<BotLiveStatus>("none");
  const [botName] = useState("Fixsense AI Recorder");

  useEffect(() => {
    if (!callId) return;

    // Load initial
    supabase
      .from("bot_sessions" as any)
      .select("status")
      .eq("call_id", callId)
      .maybeSingle()
      .then(({ data }: any) => {
        if (data?.status) setStatus(data.status as BotLiveStatus);
      });

    const ch = supabase
      .channel(`bot-live:${callId}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "bot_sessions",
      }, (payload: any) => {
        if (payload.new?.call_id === callId && payload.new?.status) {
          setStatus(payload.new.status as BotLiveStatus);
        }
      })
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "calls",
        filter: `id=eq.${callId}`,
      }, (payload: any) => {
        const recall = payload.new?.recall_bot_status;
        if (recall) {
          const map: Record<string, BotLiveStatus> = {
            joining: "joining",
            in_waiting_room: "waiting_room",
            "recording_permission.allowed": "recording",
            in_call: "in_call",
            in_call_recording: "recording",
            recording: "recording",
            call_ended: "call_ended",
            done: "call_ended",
            failed: "failed",
            "recording_permission.denied": "rejected",
          };
          const mapped = map[recall];
          if (mapped) setStatus(mapped);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, [callId]);

  const isActive = ["in_call", "recording"].includes(status);
  const isCapturing = status === "recording";
  const needsAdmit = status === "waiting_room";

  return { status, isActive, isCapturing, needsAdmit, botName };
}

// ─── BotStatusBar ─────────────────────────────────────────────────────────────

function BotStatusBar({
  status,
  meetingUrl,
  onFallback,
}: {
  status: BotLiveStatus;
  meetingUrl?: string;
  onFallback: () => void;
}) {
  if (status === "none") return null;

  const configs: Record<BotLiveStatus, {
    label: string;
    color: string;
    bg: string;
    border: string;
    pulse?: boolean;
  }> = {
    none: { label: "", color: "", bg: "", border: "" },
    joining: {
      label: "Fixsense AI Recorder is joining the meeting…",
      color: "text-primary",
      bg: "bg-primary/5",
      border: "border-primary/20",
    },
    waiting_room: {
      label: "Bot is in the waiting room — ask host to admit \"Fixsense AI Recorder\"",
      color: "text-yellow-400",
      bg: "bg-yellow-500/5",
      border: "border-yellow-500/20",
      pulse: true,
    },
    in_call: {
      label: "Bot joined — preparing to record…",
      color: "text-green-400",
      bg: "bg-green-500/5",
      border: "border-green-500/20",
    },
    recording: {
      label: "Recording both sides of the conversation",
      color: "text-green-400",
      bg: "bg-green-500/5",
      border: "border-green-500/20",
      pulse: true,
    },
    call_ended: {
      label: "Meeting ended — processing recording",
      color: "text-primary",
      bg: "bg-primary/5",
      border: "border-primary/20",
    },
    failed: {
      label: "Bot failed to join — use manual capture below",
      color: "text-red-400",
      bg: "bg-red-500/5",
      border: "border-red-500/20",
    },
    rejected: {
      label: "Recording permission denied — check meeting settings",
      color: "text-yellow-400",
      bg: "bg-yellow-500/5",
      border: "border-yellow-500/20",
    },
  };

  const cfg = configs[status];
  if (!cfg.label) return null;

  return (
    <div className={cn(
      "rounded-xl border p-3.5 flex items-center gap-3",
      cfg.bg, cfg.border
    )}>
      <div className="shrink-0">
        {status === "joining" && <Loader2 className={cn("w-4 h-4 animate-spin", cfg.color)} />}
        {status === "waiting_room" && <Clock className={cn("w-4 h-4", cfg.color)} />}
        {status === "in_call" && <CheckCircle2 className={cn("w-4 h-4", cfg.color)} />}
        {status === "recording" && (
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          </span>
        )}
        {status === "call_ended" && <Sparkles className={cn("w-4 h-4", cfg.color)} />}
        {status === "failed" && <AlertCircle className={cn("w-4 h-4", cfg.color)} />}
        {status === "rejected" && <AlertCircle className={cn("w-4 h-4", cfg.color)} />}
      </div>
      <p className={cn("text-sm flex-1", cfg.color)}>{cfg.label}</p>
      <div className="flex items-center gap-2 shrink-0">
        {meetingUrl && (status === "waiting_room" || status === "in_call" || status === "recording") && (
          <a
            href={meetingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Open meeting
          </a>
        )}
        {(status === "failed" || status === "rejected") && (
          <Button size="sm" variant="outline" className="text-xs gap-1 h-7" onClick={onFallback}>
            <Mic className="w-3 h-3" />
            Use mic instead
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Main LiveMeeting component ───────────────────────────────────────────────

export default function LiveMeeting() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { team } = useTeam();
  const { setStatus } = useUserStatus(team?.id);

  const {
    liveCall, isLive, isLoading, transcripts,
    objections, topics, endCall, callId,
  } = useLiveCall({ onCallEnded: () => setStatus("available") });

  const {
    status: botStatus,
    isCapturing: isBotCapturing,
    needsAdmit,
  } = useBotLiveStatus(callId);

  const [elapsed, setElapsed] = useState(0);
  const [showFallback, setShowFallback] = useState(false);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<number>();

  const {
    isCapturing: isManualCapturing,
    captureSource,
    isFullCapture,
    capabilities,
    captureStep,
    startCapture,
    stopCapture,
  } = useAudioCapture({ callId: callId || null });

  const isAnyCapture = isBotCapturing || isManualCapturing;
  const meetingUrl = (liveCall as any)?.meeting_url;
  const meetingType = (liveCall as any)?.meeting_type as string | undefined;

  // Timer
  useEffect(() => {
    if (isLive && liveCall?.start_time) {
      const start = new Date(liveCall.start_time).getTime();
      const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
      tick();
      intervalRef.current = window.setInterval(tick, 1000);
      return () => clearInterval(intervalRef.current);
    }
  }, [isLive, liveCall?.start_time]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcripts.length]);

  useEffect(() => {
    if (!isLoading && !isLive) navigate("/dashboard/live");
  }, [isLoading, isLive, navigate]);

  // Show fallback when bot fails
  useEffect(() => {
    if (botStatus === "failed" || botStatus === "rejected") {
      setShowFallback(true);
    }
  }, [botStatus]);

  const handleEnd = useCallback(async () => {
    stopCapture();
    try {
      await endCall.mutateAsync();
      toast.success("Call ended — AI summary generating…");
      navigate(callId ? `/dashboard/calls/${callId}` : "/dashboard/live");
    } catch {
      toast.error("Failed to end call");
    }
  }, [endCall, stopCapture, navigate, callId]);

  const formatTime = (s: number) =>
    `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  const talkRatio = useMemo(() => {
    if (!transcripts.length) return { rep: 0, prospect: 0 };
    const repWords = transcripts.filter(t => t.speaker === "Rep").reduce((sum, t) => sum + t.text.split(/\s+/).length, 0);
    const prospectWords = transcripts.filter(t => t.speaker !== "Rep").reduce((sum, t) => sum + t.text.split(/\s+/).length, 0);
    const total = repWords + prospectWords;
    if (!total) return { rep: 0, prospect: 0 };
    return { rep: Math.round((repWords / total) * 100), prospect: Math.round((prospectWords / total) * 100) };
  }, [transcripts]);

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
      <div className="space-y-4 max-w-6xl">

        {/* ── Header ── */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Link to="/dashboard/live">
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <ArrowLeft className="w-4 h-4" />
                </Button>
              </Link>
              <h1 className="text-xl font-bold font-display">{liveCall?.name || "Live Meeting"}</h1>
            </div>
            <div className="flex items-center gap-3 mt-1 ml-10">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
                <span className="text-destructive font-medium text-xs">LIVE</span>
              </div>
              <span className="text-xs text-muted-foreground font-mono">{formatTime(elapsed)}</span>
              {liveCall?.platform && (
                <span className="text-xs text-muted-foreground">{liveCall.platform}</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {meetingUrl && (
              <a href={meetingUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm" className="gap-1.5">
                  <ExternalLink className="w-3.5 h-3.5" />
                  Open Meeting
                </Button>
              </a>
            )}
            <Button
              variant="destructive"
              size="sm"
              className="gap-1.5"
              onClick={handleEnd}
              disabled={endCall.isPending}
            >
              {endCall.isPending
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <StopCircle className="w-3.5 h-3.5" />}
              End Call
            </Button>
          </div>
        </div>

        {/* ── Bot status bar ── */}
        <BotStatusBar
          status={botStatus}
          meetingUrl={meetingUrl}
          onFallback={() => setShowFallback(true)}
        />

        {/* ── Manual fallback capture ── */}
        {showFallback && !isBotCapturing && (
          <div className="glass rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4">
            <div className="flex items-center gap-3">
              <Monitor className="w-4 h-4 text-yellow-400 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-yellow-400">Manual Audio Capture</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isManualCapturing
                    ? `Capturing: ${isFullCapture ? "both sides" : captureSource === "mic" ? "mic only" : "tab audio"}`
                    : "Share your browser tab to capture meeting audio"}
                </p>
              </div>
              {!isManualCapturing ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 shrink-0"
                  onClick={startCapture}
                  disabled={captureStep !== "idle"}
                >
                  {captureStep !== "idle"
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <Mic className="w-3.5 h-3.5" />}
                  {capabilities.tabAudio ? "Share Tab Audio" : "Start Mic"}
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1.5 text-muted-foreground shrink-0"
                  onClick={stopCapture}
                >
                  Stop
                </Button>
              )}
            </div>
          </div>
        )}

        {/* ── Capture quality indicator ── */}
        <div className="flex items-center gap-3 flex-wrap">
          {isBotCapturing ? (
            <div className="flex items-center gap-1.5 text-xs text-green-400 bg-green-500/10 border border-green-500/20 rounded-full px-3 py-1">
              <Radio className="w-3 h-3" />
              AI bot capturing both sides
            </div>
          ) : isManualCapturing ? (
            <div className={cn(
              "flex items-center gap-1.5 text-xs rounded-full px-3 py-1 border",
              isFullCapture
                ? "text-green-400 bg-green-500/10 border-green-500/20"
                : "text-yellow-400 bg-yellow-500/10 border-yellow-500/20"
            )}>
              <Mic className="w-3 h-3" />
              {isFullCapture ? "Both sides captured" : "Partial capture"}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-secondary/40 rounded-full px-3 py-1">
              <MicOff className="w-3 h-3" />
              No audio capture
            </div>
          )}

          {transcripts.length > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-primary bg-primary/10 border border-primary/20 rounded-full px-3 py-1">
              <Sparkles className="w-3 h-3" />
              {transcripts.length} lines transcribed
            </div>
          )}
        </div>

        {/* ── Main grid ── */}
        <div className="grid lg:grid-cols-3 gap-4">

          {/* Transcript panel */}
          <div className="lg:col-span-2 glass rounded-xl flex flex-col max-h-[580px]">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h2 className="font-semibold text-sm">Live Transcript</h2>
              {isAnyCapture && (
                <div className="flex items-center gap-1.5 text-xs text-green-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                  Capturing
                </div>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {transcripts.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                  {botStatus === "joining" || botStatus === "waiting_room" ? (
                    <>
                      <Bot className="w-10 h-10 mb-3 opacity-20" />
                      <p className="text-sm">
                        {botStatus === "waiting_room"
                          ? "Waiting for host to admit the bot…"
                          : "Bot is joining the meeting…"}
                      </p>
                    </>
                  ) : (
                    <>
                      <Mic className="w-10 h-10 mb-3 opacity-20" />
                      <p className="text-sm">Transcript will appear here once recording starts</p>
                    </>
                  )}
                </div>
              ) : (
                transcripts.map(line => (
                  <div
                    key={line.id}
                    className={cn(
                      line.speaker !== "Rep" && "pl-4 border-l-2 border-accent/40"
                    )}
                  >
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={cn(
                        "text-xs font-semibold",
                        line.speaker === "Rep" ? "text-primary" : "text-accent"
                      )}>
                        {line.speaker}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(line.timestamp).toLocaleTimeString([], {
                          hour: "2-digit", minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <p className="text-sm text-foreground/90 leading-relaxed">{line.text}</p>
                  </div>
                ))
              )}
              <div ref={transcriptEndRef} />
            </div>
          </div>

          {/* Analytics sidebar */}
          <div className="space-y-3">

            {/* Talk Ratio */}
            <div className="glass rounded-xl p-4">
              <h3 className="text-xs font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                <BarChart3 className="w-3.5 h-3.5" /> Talk Ratio
              </h3>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-primary">You ({talkRatio.rep}%)</span>
                <span className="text-accent">Prospect ({talkRatio.prospect}%)</span>
              </div>
              <div className="h-2 rounded-full bg-muted flex overflow-hidden">
                <div className="h-full bg-primary transition-all duration-500" style={{ width: `${talkRatio.rep}%` }} />
                <div className="h-full bg-accent transition-all duration-500" style={{ width: `${talkRatio.prospect}%` }} />
              </div>
              {talkRatio.rep > 65 && transcripts.length > 5 && (
                <p className="text-xs text-yellow-500 mt-1.5">⚠️ You're speaking too much — let them talk</p>
              )}
            </div>

            {/* Stats */}
            <div className="glass rounded-xl p-4">
              <h3 className="text-xs font-semibold text-muted-foreground mb-3">Call Stats</h3>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "Duration", value: formatTime(elapsed) },
                  { label: "Engagement", value: `${liveCall?.sentiment_score || 0}%` },
                  { label: "Objections", value: String(objections.length) },
                  { label: "Topics", value: String(topics.length) },
                ].map(s => (
                  <div key={s.label} className="text-center bg-secondary/30 rounded-lg p-2">
                    <div className="text-sm font-bold font-mono">{s.value}</div>
                    <div className="text-[10px] text-muted-foreground">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Objections */}
            <div className="glass rounded-xl p-4">
              <h3 className="text-xs font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                <AlertCircle className="w-3.5 h-3.5" /> Objections ({objections.length})
              </h3>
              {objections.length === 0 ? (
                <p className="text-xs text-muted-foreground">None detected yet</p>
              ) : (
                <div className="space-y-2 max-h-[180px] overflow-y-auto">
                  {objections.map(obj => (
                    <div key={obj.id} className="rounded-lg p-2.5 text-xs bg-destructive/10 border border-destructive/20">
                      <p className="font-medium">{obj.objection_type}</p>
                      {obj.suggestion && (
                        <div className="flex items-start gap-1.5 text-muted-foreground mt-1.5">
                          <Lightbulb className="w-3 h-3 text-accent shrink-0 mt-0.5" />
                          <span>{obj.suggestion}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Key Topics */}
            <div className="glass rounded-xl p-4">
              <h3 className="text-xs font-semibold text-muted-foreground mb-2">Key Topics</h3>
              <div className="flex flex-wrap gap-1.5">
                {topics.length === 0
                  ? <p className="text-xs text-muted-foreground">Detecting topics…</p>
                  : topics.map(t => (
                    <span key={t.id} className="text-xs px-2 py-1 rounded-full bg-secondary">
                      {t.topic}
                    </span>
                  ))}
              </div>
            </div>

          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
