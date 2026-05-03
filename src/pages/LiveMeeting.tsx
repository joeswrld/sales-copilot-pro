/**
 * LiveMeeting.tsx — 100ms Edition
 *
 * Real-time transcript + insights panel during a live 100ms call.
 * Audio is captured in LiveCall.tsx via 100ms track events → transcribe-stream.
 * This page reads Supabase Realtime for live transcript/objection/topic updates.
 */

import DashboardLayout from "@/components/DashboardLayout";
import LiveUsageAlert from "@/components/LiveUsageAlert";
import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Loader2, AlertCircle, Lightbulb, TrendingUp, Clock,
  MessageSquare, BarChart3, Target, Radio,
  Users, StopCircle, ChevronDown, ChevronUp,
  Zap, Mic, MicOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLiveCall } from "@/hooks/useLiveCall";
import { useTeam } from "@/hooks/useTeam";
import { useUserStatus } from "@/hooks/useUserStatus";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import { usePlanEnforcement } from "@/contexts/PlanEnforcementContext";
import { LockedCard } from "@/components/plan/PlanGate";

// ─── Constants ────────────────────────────────────────────────────────────────
const MEETING_TYPE_LABELS: Record<string, string> = {
  discovery: "Discovery",
  demo: "Demo",
  follow_up: "Follow-up",
  negotiation: "Negotiation",
  other: "Meeting",
};

const DISCOVERY_TIPS = [
  "Ask about their current process first",
  "Understand budget authority & timeline",
  "Identify the primary pain point",
  "Who else is involved in the decision?",
  "End with a clear agreed next step",
];

// ─── Components ───────────────────────────────────────────────────────────────
function TranscriptLine({ line }: { line: any }) {
  const isYou = line.speaker === "You" || line.speaker === "Rep" || line.speaker === "Host" || line.speaker_role === "host";
  return (
    <div className={cn("group animate-in fade-in slide-in-from-bottom-1 duration-300", !isYou && "pl-3 border-l-2 border-accent/30")}>
      <div className="flex items-center gap-2 mb-0.5">
        <span className={cn("text-[11px] font-semibold uppercase tracking-wide", isYou ? "text-primary" : "text-accent")}>
          {line.speaker_name || line.speaker}
        </span>
        <span className="text-[10px] text-muted-foreground/60">
          {new Date(line.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
        </span>
      </div>
      <p className="text-sm text-foreground/90 leading-relaxed">{line.text}</p>
    </div>
  );
}

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

function StreamingBanner({ transcriptCount }: { transcriptCount: number }) {
  if (transcriptCount === 0) {
    return (
      <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border border-primary/20 bg-primary/5 text-xs font-medium text-primary">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Waiting for audio — join the meeting to start transcription
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border border-green-500/20 bg-green-500/5 text-xs font-medium text-green-400">
      <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
      🎙️ Live transcription active · {transcriptCount} lines captured
    </div>
  );
}

// ─── Mobile view ──────────────────────────────────────────────────────────────
type MobileTab = "transcript" | "insights";

function MobileView({ transcripts, objections, topics, talkRatio, engagementScore, questionsCount, elapsed, formatTime, transcriptEndRef }: any) {
  const [tab, setTab] = useState<MobileTab>("transcript");
  const { hasFeature } = usePlanEnforcement();

  return (
    <div className="flex flex-col h-full gap-2">
      <div className="flex border-b border-border shrink-0">
        {([
          { id: "transcript" as const, label: "Transcript", badge: transcripts.length },
          { id: "insights" as const, label: "Insights", badge: objections.length || undefined },
        ]).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex-1 py-2.5 text-xs font-medium border-b-2 transition-colors",
              tab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground",
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
        {tab === "transcript" && (
          <div className="space-y-4 pb-4">
            {transcripts.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <Radio className="w-8 h-8 mx-auto mb-3 opacity-20" />
                <p className="text-sm">Transcript appears here as you speak</p>
                <p className="text-xs mt-1 opacity-60">Join the meeting to start</p>
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
                <div className="h-full bg-primary transition-all" style={{ width: `${talkRatio.rep}%` }} />
                <div className="h-full bg-accent transition-all" style={{ width: `${talkRatio.prospect}%` }} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Questions", val: questionsCount },
                { label: "Duration", val: formatTime(elapsed) },
                ...(hasFeature("engagement") ? [{ label: "Engagement", val: `${engagementScore}%` }] : []),
                ...(hasFeature("objection_detection") ? [{ label: "Objections", val: objections.length }] : []),
              ].map(({ label, val }) => (
                <div key={label} className="glass rounded-xl p-3 text-center">
                  <div className="text-xl font-bold font-display">{val}</div>
                  <div className="text-xs text-muted-foreground">{label}</div>
                </div>
              ))}
            </div>

            {/* Engagement — gated (mobile) */}
            {!hasFeature("engagement") && (
              <LockedCard feature="engagement" compact />
            )}

            {/* Objections — gated (mobile) */}
            {objections.length > 0 && (
              hasFeature("objection_detection") ? (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Objections</p>
                  {objections.map((obj: any) => (
                    <div key={obj.id} className="rounded-lg p-2.5 text-xs bg-destructive/5 border border-destructive/15">
                      <p className="font-medium text-destructive/90">{obj.objection_type}</p>
                      {obj.suggestion && (
                        <div className="flex items-start gap-1.5 text-muted-foreground mt-1">
                          <Lightbulb className="w-3 h-3 text-accent shrink-0 mt-0.5" />
                          {obj.suggestion}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <LockedCard feature="objection_detection" compact />
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── MAIN ──────────────────────────────────────────────────────────────────────
export default function LiveMeeting() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { team } = useTeam();
  const { setStatus } = useUserStatus(team?.id);
  const { hasFeature } = usePlanEnforcement();

  const { liveCall, isLive, isLoading, transcripts, objections, topics, endCall, callId } =
    useLiveCall({ onCallEnded: () => setStatus("available") });

  const [elapsed, setElapsed] = useState(0);
  const [showTips, setShowTips] = useState(false);
  const intervalRef = useRef<number>();
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  const meetingType = (liveCall as any)?.meeting_type as string | undefined;
  const engagementScore = liveCall?.sentiment_score ?? 0;

  // Talk ratio
  const talkRatio = useMemo(() => {
    if (!transcripts.length) return { rep: 0, prospect: 0 };
    const isHost = (t: any) =>
      t.speaker === "You" || t.speaker === "Rep" || t.speaker === "Host" || t.speaker_role === "host";
    const rw = transcripts.filter(isHost).reduce((s, t) => s + t.text.split(/\s+/).length, 0);
    const pw = transcripts.filter((t) => !isHost(t)).reduce((s, t) => s + t.text.split(/\s+/).length, 0);
    const total = rw + pw;
    if (!total) return { rep: 0, prospect: 0 };
    return { rep: Math.round((rw / total) * 100), prospect: Math.round((pw / total) * 100) };
  }, [transcripts]);

  const questionsCount = useMemo(
    () => transcripts.filter((t) => t.text.includes("?")).length,
    [transcripts],
  );

  const formatTime = (s: number) =>
    `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

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

  const handleEnd = async () => {
    try {
      await endCall.mutateAsync();
      toast.success("Call ended — generating AI summary…");
      navigate(callId ? `/dashboard/calls/${callId}` : "/dashboard/live");
    } catch {
      toast.error("Failed to end call");
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  // ── MOBILE ────────────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <DashboardLayout>
        <div className="flex flex-col gap-3" style={{ height: "calc(100dvh - 8rem)" }}>
          <LiveUsageAlert />
          <div className="flex items-center justify-between gap-2 shrink-0">
            <div className="min-w-0">
              <h1 className="text-base font-bold font-display truncate">
                {liveCall?.name || "Live Meeting"}
              </h1>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                <span className="text-xs text-red-400 font-medium">LIVE</span>
                <span className="text-xs text-muted-foreground font-mono">{formatTime(elapsed)}</span>
              </div>
            </div>
            <Button
              onClick={handleEnd}
              variant="destructive"
              size="sm"
              className="gap-1.5 h-8 text-xs shrink-0"
              disabled={endCall.isPending}
            >
              {endCall.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MicOff className="w-3.5 h-3.5" />}
              End
            </Button>
          </div>
          <StreamingBanner transcriptCount={transcripts.length} />
          <div className="flex-1 min-h-0">
            <MobileView
              transcripts={transcripts}
              objections={objections}
              topics={topics}
              talkRatio={talkRatio}
              engagementScore={engagementScore}
              questionsCount={questionsCount}
              elapsed={elapsed}
              formatTime={formatTime}
              transcriptEndRef={transcriptEndRef}
            />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // ── DESKTOP ───────────────────────────────────────────────────────────────
  return (
    <DashboardLayout>
      <div className="flex flex-col gap-4 h-full">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3 shrink-0">
          <div>
            <h1 className="text-xl font-bold font-display">
              {liveCall?.name || "Live Meeting"}
            </h1>
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
          <Button
            onClick={handleEnd}
            variant="destructive"
            size="sm"
            className="gap-1.5"
            disabled={endCall.isPending}
          >
            {endCall.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <StopCircle className="w-3.5 h-3.5" />}
            End Call
          </Button>
        </div>

        {/* Streaming status */}
        <StreamingBanner transcriptCount={transcripts.length} />

        {/* Main 2-column layout */}
        <div className="grid grid-cols-12 gap-4 flex-1 min-h-0" style={{ maxHeight: "calc(100vh - 220px)" }}>

          {/* Transcript — 7 cols */}
          <div className="col-span-7 glass rounded-xl flex flex-col min-h-0">
            <div className="p-3.5 border-b border-border flex items-center justify-between shrink-0">
              <h2 className="text-xs font-semibold flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-primary" />
                Live Transcript
              </h2>
              <span className="text-[11px] text-muted-foreground">{transcripts.length} lines</span>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
              {transcripts.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground pb-8">
                  <Radio className="w-8 h-8 mb-3 opacity-20" />
                  <p className="text-sm text-center">Transcript appears here live</p>
                  <p className="text-xs text-center mt-1 opacity-60">
                    Join the 100ms room and speak to begin
                  </p>
                </div>
              ) : (
                <>
                  {transcripts.map((line) => (
                    <TranscriptLine key={line.id} line={line} />
                  ))}
                  <div ref={transcriptEndRef} />
                </>
              )}
            </div>
          </div>

          {/* Insights — 5 cols */}
          <div className="col-span-5 flex flex-col gap-3 overflow-y-auto min-h-0 pr-0.5">

            {/* Talk ratio — available to all plans */}
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
                <p className="text-xs text-yellow-500 mt-2">⚠️ Over 65% — let them talk more</p>
              )}
            </InsightCard>

            {/* Engagement — gated behind Starter+ */}
            {hasFeature("engagement") ? (
              <InsightCard title="Engagement" icon={<TrendingUp className="w-3 h-3" />}>
                <div className="flex items-end gap-2 mb-1.5">
                  <span className="text-3xl font-bold font-display text-primary">{engagementScore}</span>
                  <span className="text-xs text-muted-foreground mb-1">/ 100</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted">
                  <div
                    className={cn("h-1.5 rounded-full transition-all duration-1000",
                      engagementScore >= 70 ? "bg-green-500" : engagementScore >= 40 ? "bg-primary" : "bg-red-500"
                    )}
                    style={{ width: `${engagementScore}%` }}
                  />
                </div>
                {engagementScore < 40 && transcripts.length > 3 && (
                  <p className="text-xs text-orange-400 mt-2">💡 Try asking an open-ended question</p>
                )}
              </InsightCard>
            ) : (
              <LockedCard feature="engagement" compact />
            )}

            {/* Call Stats — available to all plans */}
            <InsightCard title="Call Stats" icon={<Zap className="w-3 h-3" />}>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { v: questionsCount, l: "Questions" },
                  { v: topics.length, l: "Topics" },
                  { v: formatTime(elapsed), l: "Duration" },
                  ...(hasFeature("objection_detection") ? [{ v: objections.length, l: "Objections" }] : []),
                ].map(({ v, l }) => (
                  <div key={l}>
                    <div className="text-base font-bold font-display">{v}</div>
                    <div className="text-[11px] text-muted-foreground">{l}</div>
                  </div>
                ))}
              </div>
            </InsightCard>

            {/* Objections — gated behind Starter+ */}
            {objections.length > 0 && (
              hasFeature("objection_detection") ? (
                <InsightCard title={`Objections (${objections.length})`} icon={<AlertCircle className="w-3 h-3 text-destructive" />}>
                  <div className="space-y-2.5 max-h-40 overflow-y-auto">
                    {objections.map((obj) => (
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
              ) : (
                <LockedCard feature="objection_detection" compact />
              )
            )}

            {/* Topics — available to all plans */}
            {topics.length > 0 && (
              <InsightCard title="Key Topics" icon={<Radio className="w-3 h-3" />}>
                <div className="flex flex-wrap gap-1.5">
                  {topics.map((t) => (
                    <span key={t.id} className="text-[11px] px-2 py-1 rounded-full bg-secondary/60 text-secondary-foreground">
                      {t.topic}
                    </span>
                  ))}
                </div>
              </InsightCard>
            )}

            {/* Discovery tips — available to all plans */}
            {meetingType === "discovery" && (
              <InsightCard title="Discovery Tips" icon={<Target className="w-3 h-3 text-primary" />}>
                <button
                  onClick={() => setShowTips((v) => !v)}
                  className="w-full flex items-center justify-between text-xs text-muted-foreground hover:text-foreground mb-2"
                >
                  <span>{showTips ? "Hide" : "Show"} checklist</span>
                  {showTips ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
                {showTips && (
                  <ul className="space-y-2">
                    {DISCOVERY_TIPS.map((tip, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                        <span className="w-4 h-4 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 text-[10px] font-bold mt-0.5">
                          {i + 1}
                        </span>
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