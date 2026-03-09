import DashboardLayout from "@/components/DashboardLayout";
import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Mic, MicOff, AlertCircle, Lightbulb, TrendingUp, Clock, Loader2, Video, MonitorUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLiveCall } from "@/hooks/useLiveCall";
import { useAudioCapture } from "@/hooks/useAudioCapture";
import { toast } from "sonner";

export default function LiveMeeting() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { liveCall, isLive, isLoading, transcripts, objections, topics, endCall, callId } = useLiveCall();
  const [elapsed, setElapsed] = useState(0);
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

  // Timer
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

  // Redirect if no live call
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
      toast.success("Call ended and saved");
      navigate("/dashboard/live");
    } catch {
      toast.error("Failed to end call");
    }
  }, [endCall, stopCapture, navigate]);

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
            <h1 className="text-2xl font-bold font-display">Live Meeting</h1>
            <p className="text-sm text-muted-foreground">Real-time AI-powered call intelligence</p>
          </div>
          <div className="flex items-center gap-2">
            {!isCapturing && (
              <Button onClick={startCapture} variant="outline" className="gap-2" disabled={!canStartCapture}>
                <MonitorUp className="w-4 h-4" />
                {captureButtonLabel}
              </Button>
            )}
            <Button
              onClick={handleEnd}
              variant="destructive"
              className="gap-2"
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
                    ? "This device doesn’t support tab-audio sharing. Click \"Share Mic Audio\" to transcribe what your microphone hears."
                    : "Audio capture isn’t supported on this device/browser. Please use desktop Chrome/Edge."}
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
            {/* Engagement Score */}
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

            {/* Objections */}
            <div className="glass rounded-xl p-4">
              <h3 className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-2">
                <AlertCircle className="w-3 h-3" /> Objections Detected ({objections.length})
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

