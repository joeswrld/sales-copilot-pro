/**
 * LiveMeeting.tsx — Fixsense Live Meeting Cockpit v2
 *
 * New in v2:
 *  1. Mobile-first tabbed layout (Transcript / Insights / Objections)
 *  2. Loopback/stereo-mix fallback audio capture detection
 *  3. Status wiring via onCallEnded callback (consistent with LiveCall.tsx)
 *  4. Cross-device continuity: URL-based call ID, always resumes correctly
 *  5. Desktop layout preserved + enhanced with meeting URL open button
 */

import DashboardLayout from "@/components/DashboardLayout";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Mic, MicOff, AlertCircle, Lightbulb, TrendingUp, Clock, Loader2,
  Video, MonitorUp, ExternalLink, MessageSquare, BarChart3, Target,
  Headphones, ChevronRight, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLiveCall } from "@/hooks/useLiveCall";
import { useAudioCapture } from "@/hooks/useAudioCapture";
import { useTeam } from "@/hooks/useTeam";
import { useUserStatus } from "@/hooks/useUserStatus";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";

// ─── Constants ────────────────────────────────────────────────────────────────

const MEETING_TYPE_LABELS: Record<string, string> = {
  discovery:   "Discovery Call",
  demo:        "Product Demo",
  follow_up:   "Follow-up",
  negotiation: "Negotiation",
  other:       "Other",
};

const DISCOVERY_REMINDERS = [
  "Ask about their current process",
  "Understand their budget timeline",
  "Identify the decision maker",
  "Discuss pain points in detail",
  "Ask about competing solutions",
];

// ─── Mobile tabbed view ───────────────────────────────────────────────────────

interface MobileLiveMeetingProps {
  transcripts:     any[];
  objections:      any[];
  topics:          any[];
  talkRatio:       { rep: number; prospect: number };
  engagementScore: number;
  questionsCount:  number;
  elapsed:         number;
  meetingType?:    string;
  isCapturing:     boolean;
  capabilities:    any;
  formatTime:      (s: number) => string;
  transcriptEndRef: React.RefObject<HTMLDivElement>;
}

function MobileLiveMeeting({
  transcripts, objections, topics, talkRatio, engagementScore,
  questionsCount, elapsed, meetingType, isCapturing, capabilities,
  formatTime, transcriptEndRef,
}: MobileLiveMeetingProps) {
  const [activeTab, setActiveTab] = useState<"transcript" | "insights" | "objections">("transcript");

  const tabs = [
    { id: "transcript" as const,  label: "Live" },
    { id: "insights"   as const,  label: "Insights" },
    {
      id: "objections" as const,
      label: objections.length > 0 ? `Objections (${objections.length})` : "Objections",
    },
  ];

  return (
    <div className="flex flex-col" style={{ minHeight: 0, flex: 1 }}>
      {/* Compact status strip */}
      <div className="flex items-center justify-between px-3 py-2 bg-secondary/30 rounded-lg mb-3 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse" />
          <span className="font-medium text-destructive">LIVE</span>
          <span className="text-muted-foreground ml-1">{formatTime(elapsed)}</span>
        </div>
        <div className="flex gap-3 text-muted-foreground">
          <span className="text-primary font-medium">You {talkRatio.rep}%</span>
          <span>Prospect {talkRatio.prospect}%</span>
        </div>
        <span className={cn(
          "font-medium",
          engagementScore >= 70 ? "text-green-500"
            : engagementScore >= 40 ? "text-yellow-500"
            : "text-red-400"
        )}>
          {engagementScore}%
        </span>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-border mb-3">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={cn(
              "flex-1 py-2 text-xs font-medium border-b-2 transition-colors",
              activeTab === tab.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground"
            )}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {/* ── Transcript ─────────────────────────────────────────────────── */}
        {activeTab === "transcript" && (
          <div className="space-y-3 pb-6">
            {transcripts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground text-sm">
                {isCapturing ? (
                  <>
                    <Loader2 className="w-6 h-6 animate-spin mb-3 opacity-50" />
                    <p>Listening for audio…</p>
                    <p className="text-xs mt-1 text-center px-4">
                      Transcript will appear as speech is detected
                    </p>
                  </>
                ) : (
                  <>
                    <Mic className="w-10 h-10 mb-3 opacity-30" />
                    <p className="text-center px-4">
                      {capabilities.tabAudio
                        ? "Tap 'Share Audio' to begin"
                        : capabilities.micAudio
                        ? "Tap 'Mic Audio' to begin"
                        : "Audio capture not supported on this browser"}
                    </p>
                  </>
                )}
              </div>
            ) : (
              <>
                {transcripts.map((line: any) => (
                  <div
                    key={line.id}
                    className={cn(
                      "text-sm leading-relaxed",
                      line.speaker !== "Rep" && "pl-3 border-l-2 border-accent/40"
                    )}
                  >
                    <span className={cn(
                      "text-xs font-semibold mr-2",
                      line.speaker === "Rep" ? "text-primary" : "text-accent"
                    )}>
                      {line.speaker}
                    </span>
                    <span className="text-xs text-muted-foreground mr-2">
                      {new Date(line.timestamp).toLocaleTimeString([], {
                        hour: "2-digit", minute: "2-digit",
                      })}
                    </span>
                    <span>{line.text}</span>
                  </div>
                ))}
                <div ref={transcriptEndRef} />
              </>
            )}
          </div>
        )}

        {/* ── Insights ───────────────────────────────────────────────────── */}
        {activeTab === "insights" && (
          <div className="space-y-3 pb-6">
            {/* Talk ratio */}
            <div className="glass rounded-xl p-4">
              <h3 className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-2">
                <BarChart3 className="w-3 h-3" /> Talk Ratio
              </h3>
              <div className="flex justify-between text-xs mb-2">
                <span className="text-primary">You ({talkRatio.rep}%)</span>
                <span className="text-accent">Prospect ({talkRatio.prospect}%)</span>
              </div>
              <div className="h-2.5 rounded-full bg-muted flex overflow-hidden">
                <div className="h-full bg-primary transition-all duration-500" style={{ width: `${talkRatio.rep}%` }} />
                <div className="h-full bg-accent transition-all duration-500" style={{ width: `${talkRatio.prospect}%` }} />
              </div>
              {talkRatio.rep > 65 && transcripts.length > 5 && (
                <p className="text-xs text-yellow-500 mt-2">
                  ⚠️ You're speaking more than 65% — let the prospect talk more
                </p>
              )}
            </div>

            {/* Quick stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="glass rounded-xl p-3 text-center">
                <div className="text-2xl font-bold font-display text-primary">{engagementScore}%</div>
                <div className="text-xs text-muted-foreground mt-0.5">Engagement</div>
              </div>
              <div className="glass rounded-xl p-3 text-center">
                <div className="text-2xl font-bold font-display">{questionsCount}</div>
                <div className="text-xs text-muted-foreground mt-0.5">Questions</div>
              </div>
              <div className="glass rounded-xl p-3 text-center">
                <div className="text-2xl font-bold font-display">{objections.length}</div>
                <div className="text-xs text-muted-foreground mt-0.5">Objections</div>
              </div>
              <div className="glass rounded-xl p-3 text-center">
                <div className="text-2xl font-bold font-display">{topics.length}</div>
                <div className="text-xs text-muted-foreground mt-0.5">Topics</div>
              </div>
            </div>

            {/* Discovery reminders */}
            {meetingType === "discovery" && (
              <div className="glass rounded-xl p-4">
                <h3 className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-2">
                  <Target className="w-3 h-3" /> Discovery Reminders
                </h3>
                <ul className="space-y-2">
                  {DISCOVERY_REMINDERS.map((r, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                      <span className="w-4 h-4 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 text-[10px] font-bold mt-0.5">
                        {i + 1}
                      </span>
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Topics */}
            {topics.length > 0 && (
              <div className="glass rounded-xl p-4">
                <h3 className="text-xs font-medium text-muted-foreground mb-2">Key Topics</h3>
                <div className="flex flex-wrap gap-1.5">
                  {topics.map((t: any) => (
                    <span key={t.id} className="text-xs px-2 py-1 rounded-full bg-secondary">
                      {t.topic}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Objections ─────────────────────────────────────────────────── */}
        {activeTab === "objections" && (
          <div className="space-y-2 pb-6">
            {objections.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">
                <AlertCircle className="w-8 h-8 mx-auto mb-3 opacity-20" />
                No objections detected yet
              </div>
            ) : (
              objections.map((obj: any) => (
                <div
                  key={obj.id}
                  className={cn(
                    "glass rounded-xl p-3 text-xs border",
                    (obj.confidence_score || 0) > 0.7
                      ? "border-destructive/20 bg-destructive/5"
                      : "border-accent/20 bg-accent/5"
                  )}
                >
                  <p className="font-medium mb-1">{obj.objection_type}</p>
                  {obj.suggestion && (
                    <div className="flex items-start gap-1.5 text-muted-foreground">
                      <Lightbulb className="w-3 h-3 text-accent shrink-0 mt-0.5" />
                      <span>{obj.suggestion}</span>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Improved audio capture with loopback detection ──────────────────────────
// Extends useAudioCapture with a "stereo mix" loopback device check

async function detectLoopbackDevice(): Promise<MediaDeviceInfo | null> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.find(d =>
      d.kind === "audioinput" &&
      /stereo mix|what u hear|loopback|virtual cable|vb-audio|soundflower/i.test(d.label)
    ) ?? null;
  } catch {
    return null;
  }
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function LiveMeeting() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  // ── Status wiring ────────────────────────────────────────────────────────
  const { team } = useTeam();
  const { onCallEnded } = useUserStatus(team?.id);

  const {
    liveCall, isLive, isLoading,
    transcripts, objections, topics,
    endCall, callId,
  } = useLiveCall({
    onCallEnded,
  });

  const [elapsed, setElapsed]           = useState(0);
  const [meetPopupOpen, setMeetPopupOpen] = useState(false);
  const [loopbackDevice, setLoopbackDevice] = useState<MediaDeviceInfo | null>(null);
  const intervalRef    = useRef<number>();
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  const {
    isCapturing,
    error: captureError,
    startCapture,
    stopCapture,
    captureSource,
    capabilities,
  } = useAudioCapture({
    callId:           callId || null,
    onChunkProcessed: (result) => {
      if (result?.analysis) console.log("Chunk processed:", result.analysis);
    },
  });

  // Detect loopback device on mount
  useEffect(() => {
    detectLoopbackDevice().then(setLoopbackDevice);
  }, []);

  const canStartCapture = capabilities.webmRecorder &&
    (capabilities.tabAudio || capabilities.micAudio);

  // Caption for the capture button — prioritize clarity on mobile
  const captureButtonLabel = capabilities.tabAudio
    ? "Share Audio"
    : capabilities.micAudio
    ? "Mic Audio"
    : "Unsupported";

  // ── Derived analytics ────────────────────────────────────────────────────
  const talkRatio = useMemo(() => {
    if (transcripts.length === 0) return { rep: 0, prospect: 0 };
    const repWords = transcripts
      .filter(t => t.speaker === "Rep")
      .reduce((sum, t) => sum + t.text.split(/\s+/).length, 0);
    const prospectWords = transcripts
      .filter(t => t.speaker !== "Rep")
      .reduce((sum, t) => sum + t.text.split(/\s+/).length, 0);
    const total = repWords + prospectWords;
    if (total === 0) return { rep: 0, prospect: 0 };
    return {
      rep:      Math.round((repWords / total) * 100),
      prospect: Math.round((prospectWords / total) * 100),
    };
  }, [transcripts]);

  const questionsCount = useMemo(
    () => transcripts.filter(t => t.text.includes("?")).length,
    [transcripts]
  );

  const meetingType  = (liveCall as any)?.meeting_type as string | undefined;
  const meetingUrl   = (liveCall as any)?.meeting_url as string | undefined;
  const engagementScore = liveCall?.sentiment_score || 0;

  // ── Timer ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (isLive && liveCall?.start_time) {
      const start = new Date(liveCall.start_time).getTime();
      const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
      tick();
      intervalRef.current = window.setInterval(tick, 1000);
      return () => clearInterval(intervalRef.current);
    } else {
      setElapsed(0);
    }
  }, [isLive, liveCall?.start_time]);

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcripts.length]);

  // Redirect when call ends or not found
  useEffect(() => {
    if (!isLoading && !isLive) navigate("/dashboard/live");
  }, [isLoading, isLive, navigate]);

  const formatTime = (s: number) =>
    `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  // ── End call ─────────────────────────────────────────────────────────────
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

  // ── Open meeting in popup ────────────────────────────────────────────────
  const handleOpenMeetPopup = () => {
    const url = meetingUrl || liveCall?.meeting_id;
    if (url && (url.startsWith("http") || url.includes("meet.google.com"))) {
      window.open(url, "fixsense-meeting", "width=1000,height=700,menubar=no,toolbar=no");
      setMeetPopupOpen(true);
    } else {
      toast.info("No meeting URL attached. Open your meeting separately and capture audio here.");
    }
  };

  // ── Loading ──────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // MOBILE LAYOUT
  // ════════════════════════════════════════════════════════════════════════════
  if (isMobile) {
    return (
      <DashboardLayout>
        <div className="flex flex-col gap-3" style={{ height: "calc(100dvh - 8rem)" }}>
          {/* Header */}
          <div className="flex items-center justify-between gap-2 flex-shrink-0">
            <div className="min-w-0">
              <h1 className="text-base font-bold font-display truncate">
                {liveCall?.name || "Live Meeting"}
              </h1>
              {meetingType && (
                <span className="text-xs text-primary">
                  {MEETING_TYPE_LABELS[meetingType] || meetingType}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {!isCapturing && (
                <Button
                  onClick={startCapture}
                  variant="outline"
                  size="sm"
                  className="gap-1.5 h-8 text-xs"
                  disabled={!canStartCapture}
                >
                  <MonitorUp className="w-3.5 h-3.5" />
                  {captureButtonLabel}
                </Button>
              )}
              {isCapturing && (
                <div className="flex items-center gap-1.5 text-xs text-primary px-2 py-1 bg-primary/10 rounded-full">
                  <Mic className="w-3 h-3" />
                  {captureSource === "tab" ? "Tab" : "Mic"}
                </div>
              )}
              <Button
                onClick={handleEnd}
                variant="destructive"
                size="sm"
                className="gap-1.5 h-8 text-xs"
                disabled={endCall.isPending}
              >
                {endCall.isPending
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <MicOff className="w-3.5 h-3.5" />}
                End
              </Button>
            </div>
          </div>

          {/* Audio capture prompt (compact) */}
          {!isCapturing && !captureError && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-accent/5 border border-accent/20 text-xs text-muted-foreground flex-shrink-0">
              <MonitorUp className="w-3.5 h-3.5 text-accent shrink-0 mt-0.5" />
              <span>
                {capabilities.tabAudio
                  ? "Share tab audio for live transcription"
                  : capabilities.micAudio
                  ? "Share microphone for transcription (rep voice only)"
                  : "Audio capture not supported — use desktop Chrome/Edge"}
              </span>
            </div>
          )}

          {/* Loopback device detected */}
          {loopbackDevice && !isCapturing && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-primary/5 border border-primary/20 text-xs flex-shrink-0">
              <Headphones className="w-3.5 h-3.5 text-primary shrink-0" />
              <span className="text-primary">
                Stereo Mix detected — captures both sides of the call
              </span>
            </div>
          )}

          {/* Main tabbed content */}
          <div className="flex-1 min-h-0">
            <MobileLiveMeeting
              transcripts={transcripts}
              objections={objections}
              topics={topics}
              talkRatio={talkRatio}
              engagementScore={engagementScore}
              questionsCount={questionsCount}
              elapsed={elapsed}
              meetingType={meetingType}
              isCapturing={isCapturing}
              capabilities={capabilities}
              formatTime={formatTime}
              transcriptEndRef={transcriptEndRef}
            />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // DESKTOP LAYOUT
  // ════════════════════════════════════════════════════════════════════════════
  return (
    <DashboardLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold font-display">{liveCall?.name || "Live Meeting"}</h1>
            <div className="flex items-center gap-3 mt-1">
              <p className="text-sm text-muted-foreground">Real-time AI-powered call intelligence</p>
              {meetingType && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                  {MEETING_TYPE_LABELS[meetingType] || meetingType}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button onClick={handleOpenMeetPopup} variant="outline" className="gap-2" size="sm">
              <ExternalLink className="w-4 h-4" />
              {meetPopupOpen ? "Reopen Meeting" : "Open Meeting"}
            </Button>
            {!isCapturing && (
              <Button
                onClick={startCapture}
                variant="outline"
                className="gap-2"
                size="sm"
                disabled={!canStartCapture}
              >
                <MonitorUp className="w-4 h-4" />
                {capabilities.tabAudio ? "Share Tab Audio" : capabilities.micAudio ? "Share Mic Audio" : "Audio Unsupported"}
              </Button>
            )}
            <Button
              onClick={handleEnd}
              variant="destructive"
              className="gap-2"
              size="sm"
              disabled={endCall.isPending}
            >
              {endCall.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              <MicOff className="w-4 h-4" />
              End Call
            </Button>
          </div>
        </div>

        {/* Status bar */}
        <div className="flex items-center gap-4 text-sm flex-wrap">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
            <span className="text-destructive font-medium">LIVE</span>
          </div>
          <div className="flex items-center gap-1 text-muted-foreground">
            <Clock className="w-3 h-3" /> {formatTime(elapsed)}
          </div>
          {liveCall?.platform && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <Video className="w-3 h-3" /> {liveCall.platform}
            </div>
          )}
          {isCapturing && (
            <div className="flex items-center gap-1.5 text-primary">
              <Mic className="w-3 h-3" />
              <span className="text-xs">
                Capturing {captureSource === "tab" ? "tab audio" : "microphone"}
              </span>
            </div>
          )}
          {(liveCall?.participants as string[] | undefined)?.length ? (
            <div className="flex items-center gap-1 text-muted-foreground text-xs">
              {(liveCall!.participants as string[]).join(", ")}
            </div>
          ) : null}
          {captureError && <span className="text-xs text-destructive">{captureError}</span>}
        </div>

        {/* Loopback device notice */}
        {loopbackDevice && !isCapturing && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20 text-sm">
            <Headphones className="w-4 h-4 text-primary shrink-0" />
            <span>
              <strong>Stereo Mix / loopback device detected</strong> — this will capture both your voice and the
              prospect's, giving you a complete transcript. Click "Share Tab Audio" and select it.
            </span>
          </div>
        )}

        {/* Audio capture prompt */}
        {!isCapturing && !captureError && (
          <div className="glass rounded-xl p-4 border border-accent/20 bg-accent/5 flex items-start gap-3">
            <MonitorUp className="w-5 h-5 text-accent shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium">Enable audio capture for live transcription</p>
              <p className="text-xs text-muted-foreground mt-1">
                {capabilities.tabAudio
                  ? "Click \"Share Tab Audio\" and select the browser tab running your meeting. Fixsense transcribes and analyzes in real time."
                  : capabilities.micAudio
                  ? "Tab audio isn't supported. \"Share Mic Audio\" captures your voice. Consider using a loopback virtual device for both sides."
                  : "Audio capture isn't supported on this browser. Use desktop Chrome/Edge for full transcription."}
              </p>
            </div>
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-4">
          {/* ── Transcription ─────────────────────────────────────────────── */}
          <div className="lg:col-span-2 glass rounded-xl flex flex-col max-h-[600px]">
            <div className="p-4 border-b border-border">
              <h2 className="font-display font-semibold text-sm">Live Transcription</h2>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {transcripts.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                  {isCapturing ? (
                    <>
                      <Loader2 className="w-6 h-6 animate-spin mb-3 opacity-50" />
                      <p className="text-sm">Listening for audio…</p>
                      <p className="text-xs mt-1">Transcription will appear as speech is detected</p>
                    </>
                  ) : (
                    <>
                      <Mic className="w-10 h-10 mb-3 opacity-30" />
                      <p className="text-sm">
                        {capabilities.tabAudio
                          ? "Share tab audio to begin transcription"
                          : capabilities.micAudio
                          ? "Share microphone audio to begin transcription"
                          : "Audio capture not supported on this device"}
                      </p>
                    </>
                  )}
                </div>
              ) : (
                <>
                  {transcripts.map(line => (
                    <div
                      key={line.id}
                      className={cn(
                        "animate-slide-up",
                        line.speaker !== "Rep" ? "pl-4 border-l-2 border-accent/40" : "",
                      )}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className={cn(
                          "text-xs font-medium",
                          line.speaker === "Rep" ? "text-primary" : "text-accent"
                        )}>
                          {line.speaker}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(line.timestamp).toLocaleTimeString([], {
                            hour: "2-digit", minute: "2-digit", second: "2-digit",
                          })}
                        </span>
                      </div>
                      <p className="text-sm text-foreground/90">{line.text}</p>
                    </div>
                  ))}
                  <div ref={transcriptEndRef} />
                </>
              )}
            </div>
          </div>

          {/* ── AI Insights Sidebar ───────────────────────────────────────── */}
          <div className="space-y-4">
            {/* Talk Ratio */}
            <div className="glass rounded-xl p-4">
              <h3 className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-2">
                <BarChart3 className="w-3 h-3" /> Talk Ratio
              </h3>
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-primary">You ({talkRatio.rep}%)</span>
                  <span className="text-accent">Prospect ({talkRatio.prospect}%)</span>
                </div>
                <div className="h-2 rounded-full bg-muted flex overflow-hidden">
                  <div className="h-full bg-primary transition-all duration-500" style={{ width: `${talkRatio.rep}%` }} />
                  <div className="h-full bg-accent transition-all duration-500" style={{ width: `${talkRatio.prospect}%` }} />
                </div>
                {talkRatio.rep > 65 && transcripts.length > 5 && (
                  <p className="text-xs text-yellow-500 mt-1">
                    ⚠️ You're speaking more than 65%. Let the prospect talk more.
                  </p>
                )}
              </div>
            </div>

            {/* Engagement */}
            <div className="glass rounded-xl p-4">
              <h3 className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-2">
                <TrendingUp className="w-3 h-3" /> Engagement Score
              </h3>
              <div className="text-3xl font-bold font-display text-primary">{engagementScore}%</div>
              <div className="h-1.5 rounded-full bg-muted mt-2">
                <div
                  className="h-1.5 rounded-full bg-primary transition-all duration-1000"
                  style={{ width: `${engagementScore}%` }}
                />
              </div>
            </div>

            {/* Stats */}
            <div className="glass rounded-xl p-4">
              <h3 className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-2">
                <MessageSquare className="w-3 h-3" /> Call Stats
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Questions",  val: questionsCount },
                  { label: "Objections", val: objections.length },
                  { label: "Topics",     val: topics.length },
                  { label: "Duration",   val: formatTime(elapsed) },
                ].map(s => (
                  <div key={s.label}>
                    <div className="text-lg font-bold font-display">{s.val}</div>
                    <div className="text-xs text-muted-foreground">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Objections */}
            <div className="glass rounded-xl p-4">
              <h3 className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-2">
                <AlertCircle className="w-3 h-3" /> Objections ({objections.length})
              </h3>
              {objections.length === 0 ? (
                <p className="text-xs text-muted-foreground">No objections yet</p>
              ) : (
                <div className="space-y-3 max-h-[200px] overflow-y-auto">
                  {objections.map(obj => (
                    <div
                      key={obj.id}
                      className={cn(
                        "rounded-lg p-3 text-xs",
                        (obj.confidence_score || 0) > 0.7
                          ? "bg-destructive/10 border border-destructive/20"
                          : "bg-accent/10 border border-accent/20",
                      )}
                    >
                      <p className="font-medium mb-1">{obj.objection_type}</p>
                      {obj.suggestion && (
                        <div className="flex items-start gap-1.5 text-muted-foreground mt-2">
                          <Lightbulb className="w-3 h-3 text-accent shrink-0 mt-0.5" />
                          <span>{obj.suggestion}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Discovery reminders */}
            {meetingType === "discovery" && (
              <div className="glass rounded-xl p-4">
                <h3 className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-2">
                  <Target className="w-3 h-3" /> Discovery Reminders
                </h3>
                <ul className="space-y-2">
                  {DISCOVERY_REMINDERS.map((r, i) => (
                    <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                      <span className="w-4 h-4 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 text-[10px] font-bold mt-0.5">
                        {i + 1}
                      </span>
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Topics */}
            <div className="glass rounded-xl p-4">
              <h3 className="text-xs font-medium text-muted-foreground mb-3">Key Topics</h3>
              <div className="flex flex-wrap gap-1.5">
                {topics.length > 0 ? (
                  topics.map(t => (
                    <span key={t.id} className="text-xs px-2 py-1 rounded-full bg-secondary">
                      {t.topic}
                    </span>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground">Analyzing topics…</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
