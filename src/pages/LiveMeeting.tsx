import DashboardLayout from "@/components/DashboardLayout";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Mic, MicOff, AlertCircle, Lightbulb, TrendingUp, Clock, Loader2,
  Video, MonitorUp, ExternalLink, MessageSquare, BarChart3, Target
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLiveCall } from "@/hooks/useLiveCall";
import { useAudioCapture } from "@/hooks/useAudioCapture";
import { useTeam } from "@/hooks/useTeam";
import { useUserStatus } from "@/hooks/useUserStatus";
import { toast } from "sonner";

const MEETING_TYPE_LABELS: Record<string, string> = {
  discovery: "Discovery Call",
  demo: "Product Demo",
  follow_up: "Follow-up",
  negotiation: "Negotiation",
  other: "Other",
};

const DISCOVERY_REMINDERS = [
  "Ask about their current process",
  "Understand their budget timeline",
  "Identify the decision maker",
  "Discuss pain points in detail",
  "Ask about competing solutions",
];

export default function LiveMeeting() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // ── Status wiring ──────────────────────────────────────────────────────────
  const { team } = useTeam();
  const { setStatus } = useUserStatus(team?.id);

  const { liveCall, isLive, isLoading, transcripts, objections, topics, endCall, callId } = useLiveCall({
    onCallEnded: () => setStatus("available"),
  });

  const [elapsed, setElapsed] = useState(0);
  const [meetPopupOpen, setMeetPopupOpen] = useState(false);
  const intervalRef = useRef<number>();
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  const {
    isCapturing,
    error: captureError,
    startCapture,
    stopCapture,
    captureSource,
    capabilities,
  } = useAudioCapture({
    callId: callId || null,
    onChunkProcessed: (result) => {
      if (result?.analysis) {
        console.log("Chunk processed:", result.analysis);
      }
    },
  });

  const canStartCapture = capabilities.webmRecorder && (capabilities.tabAudio || capabilities.micAudio);
  const captureButtonLabel = capabilities.tabAudio ? "Share Tab Audio" : capabilities.micAudio ? "Share Mic Audio" : "Audio Unsupported";

  const talkRatio = useMemo(() => {
    if (transcripts.length === 0) return { rep: 0, prospect: 0 };
    const repWords = transcripts
      .filter((t) => t.speaker === "Rep")
      .reduce((sum, t) => sum + t.text.split(/\s+/).length, 0);
    const prospectWords = transcripts
      .filter((t) => t.speaker !== "Rep")
      .reduce((sum, t) => sum + t.text.split(/\s+/).length, 0);
    const total = repWords + prospectWords;
    if (total === 0) return { rep: 0, prospect: 0 };
    return {
      rep: Math.round((repWords / total) * 100),
      prospect: Math.round((prospectWords / total) * 100),
    };
  }, [transcripts]);

  const questionsCount = useMemo(() => {
    return transcripts.filter((t) => t.text.includes("?")).length;
  }, [transcripts]);

  const meetingType = (liveCall as any)?.meeting_type as string | undefined;

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

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcripts.length]);

  useEffect(() => {
    if (!isLoading && !isLive) {
      navigate("/dashboard/live");
    }
  }, [isLoading, isLive, navigate]);

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  const handleEnd = useCallback(async () => {
    stopCapture();
    try {
      await endCall.mutateAsync();
      toast.success("Call ended — AI summary generating...");
      if (callId) {
        navigate(`/dashboard/calls/${callId}`);
      } else {
        navigate("/dashboard/live");
      }
    } catch {
      toast.error("Failed to end call");
    }
  }, [endCall, stopCapture, navigate, callId]);

  const handleOpenMeetPopup = () => {
    const meetUrl = liveCall?.meeting_url || liveCall?.meeting_id;
    if (meetUrl && (meetUrl.startsWith("http") || meetUrl.includes("meet.google.com"))) {
      window.open(meetUrl, "fixsense-meeting", "width=1000,height=700,menubar=no,toolbar=no");
      setMeetPopupOpen(true);
    } else {
      toast.info("No meeting URL available. Open your meeting separately and use audio capture here.");
    }
  };

  const engagementScore = liveCall?.sentiment_score || 0;

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
              <Button onClick={startCapture} variant="outline" className="gap-2" size="sm" disabled={!canStartCapture}>
                <MonitorUp className="w-4 h-4" />
                {captureButtonLabel}
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
              <span className="text-xs">Audio capturing{captureSource ? ` (${captureSource === "tab" ? "Tab" : "Mic"})` : ""}</span>
            </div>
          )}
          {liveCall?.participants && (liveCall.participants as string[]).length > 0 && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <span className="text-xs">{(liveCall.participants as string[]).join(", ")}</span>
            </div>
          )}
          {captureError && <span className="text-xs text-destructive">{captureError}</span>}
        </div>

        {/* Audio capture prompt */}
        {!isCapturing && !captureError && (
          <div className="glass rounded-xl p-4 border border-accent/20 bg-accent/5 flex items-start gap-3">
            <MonitorUp className="w-5 h-5 text-accent shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium">Enable audio capture for live transcription</p>
              <p className="text-xs text-muted-foreground mt-1">
                {capabilities.tabAudio
                  ? "Click \"Share Tab Audio\" above and select the browser tab with your meeting. Fixsense will transcribe and analyze the call in real time."
                  : capabilities.micAudio
                    ? "This device doesn't support tab-audio sharing. Click \"Share Mic Audio\" to transcribe what your microphone hears."
                    : "Audio capture isn't supported on this device/browser. Please use desktop Chrome/Edge."}
              </p>
            </div>
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-4">
          {/* Transcription */}
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
                      <p className="text-sm">Listening for audio...</p>
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
                            : "Audio capture is not supported on this device"}
                      </p>
                    </>
                  )}
                </div>
              ) : (
                <>
                  {transcripts.map((line) => (
                    <div
                      key={line.id}
                      className={cn(
                        "animate-slide-up",
                        line.speaker !== "Rep" ? "pl-4 border-l-2 border-accent/40" : "",
                      )}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className={cn("text-xs font-medium", line.speaker === "Rep" ? "text-primary" : "text-accent")}>
                          {line.speaker}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(line.timestamp).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
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

          {/* AI Insights Sidebar */}
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
                  <p className="text-xs text-warning mt-1">⚠️ You're speaking more than 65%. Let the prospect talk more.</p>
                )}
              </div>
            </div>

            {/* Engagement Score */}
            <div className="glass rounded-xl p-4">
              <h3 className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-2">
                <TrendingUp className="w-3 h-3" /> Engagement Score
              </h3>
              <div className="text-3xl font-bold font-display text-primary">{engagementScore}%</div>
              <div className="h-1.5 rounded-full bg-muted mt-2">
                <div className="h-1.5 rounded-full bg-primary transition-all duration-1000" style={{ width: `${engagementScore}%` }} />
              </div>
            </div>

            {/* Quick Stats */}
            <div className="glass rounded-xl p-4">
              <h3 className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-2">
                <MessageSquare className="w-3 h-3" /> Call Stats
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-lg font-bold font-display">{questionsCount}</div>
                  <div className="text-xs text-muted-foreground">Questions Asked</div>
                </div>
                <div>
                  <div className="text-lg font-bold font-display">{objections.length}</div>
                  <div className="text-xs text-muted-foreground">Objections</div>
                </div>
                <div>
                  <div className="text-lg font-bold font-display">{topics.length}</div>
                  <div className="text-xs text-muted-foreground">Topics</div>
                </div>
                <div>
                  <div className="text-lg font-bold font-display">{formatTime(elapsed)}</div>
                  <div className="text-xs text-muted-foreground">Duration</div>
                </div>
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
                  {objections.map((obj) => (
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

            {/* Discovery Reminders */}
            {meetingType === "discovery" && (
              <div className="glass rounded-xl p-4">
                <h3 className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-2">
                  <Target className="w-3 h-3" /> Discovery Reminders
                </h3>
                <ul className="space-y-2">
                  {DISCOVERY_REMINDERS.map((reminder, i) => (
                    <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                      <span className="w-4 h-4 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 text-[10px] font-bold mt-0.5">
                        {i + 1}
                      </span>
                      {reminder}
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
                  topics.map((t) => (
                    <span key={t.id} className="text-xs px-2 py-1 rounded-full bg-secondary text-secondary-foreground">
                      {t.topic}
                    </span>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground">Analyzing topics...</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
