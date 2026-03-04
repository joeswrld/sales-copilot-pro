import DashboardLayout from "@/components/DashboardLayout";
import { useState, useEffect, useRef } from "react";
import { Mic, MicOff, AlertCircle, Lightbulb, TrendingUp, Clock, Loader2, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLiveCall } from "@/hooks/useLiveCall";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export default function LiveCall() {
  const { liveCall, isLive, isLoading, transcripts, objections, topics, startCall, endCall, callId } = useLiveCall();
  const [elapsed, setElapsed] = useState(0);
  const [platform, setPlatform] = useState("Zoom");
  const intervalRef = useRef<number>();
  const transcriptEndRef = useRef<HTMLDivElement>(null);

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

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  const handleStart = async () => {
    try {
      await startCall.mutateAsync({ platform });
      toast.success(`${platform} call started`);
    } catch (err: any) {
      if (err?.message === "PLAN_LIMIT_REACHED") {
        toast.error("You've reached your plan limit. Upgrade to Pro for unlimited calls.");
      } else {
        toast.error("Failed to start call");
      }
    }
  };

  const handleEnd = async () => {
    try {
      await endCall.mutateAsync();
      toast.success("Call ended and saved");
    } catch {
      toast.error("Failed to end call");
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
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold font-display">Live Call</h1>
            <p className="text-sm text-muted-foreground">Real-time AI-powered call intelligence</p>
          </div>
          <div className="flex items-center gap-2">
            {!isLive && (
              <Select value={platform} onValueChange={setPlatform}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Zoom">Zoom</SelectItem>
                  <SelectItem value="Google Meet">Google Meet</SelectItem>
                  <SelectItem value="Teams">MS Teams</SelectItem>
                </SelectContent>
              </Select>
            )}
            <Button
              onClick={isLive ? handleEnd : handleStart}
              variant={isLive ? "destructive" : "default"}
              className="gap-2"
              disabled={startCall.isPending || endCall.isPending}
            >
              {(startCall.isPending || endCall.isPending) && <Loader2 className="w-4 h-4 animate-spin" />}
              {isLive ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              {isLive ? "End Call" : "Start Call"}
            </Button>
          </div>
        </div>

        {isLive && (
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-destructive animate-pulse-glow" />
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
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-4">
          {/* Transcription */}
          <div className="lg:col-span-2 glass rounded-xl flex flex-col max-h-[600px]">
            <div className="p-4 border-b border-border">
              <h2 className="font-display font-semibold text-sm">Live Transcription</h2>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {!isLive ? (
                <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                  <Mic className="w-10 h-10 mb-3 opacity-30" />
                  <p className="text-sm">Start a call to see live transcription</p>
                  <p className="text-xs mt-1">Select your meeting platform and click Start Call</p>
                </div>
              ) : transcripts.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                  <Loader2 className="w-6 h-6 animate-spin mb-3 opacity-50" />
                  <p className="text-sm">Waiting for audio stream...</p>
                </div>
              ) : (
                <>
                  {transcripts.map((line) => (
                    <div key={line.id} className={cn("animate-slide-up", line.speaker !== "You" ? "pl-4 border-l-2 border-accent/40" : "")}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={cn("text-xs font-medium", line.speaker === "You" ? "text-primary" : "text-accent")}>{line.speaker}</span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(line.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
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
              <div className="text-3xl font-bold font-display text-primary">
                {isLive ? `${engagementScore}%` : "—"}
              </div>
              <div className="h-1.5 rounded-full bg-muted mt-2">
                <div
                  className="h-1.5 rounded-full bg-primary transition-all duration-1000"
                  style={{ width: isLive ? `${engagementScore}%` : "0%" }}
                />
              </div>
            </div>

            {/* Objections */}
            <div className="glass rounded-xl p-4">
              <h3 className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-2">
                <AlertCircle className="w-3 h-3" /> Objections Detected
              </h3>
              {!isLive || objections.length === 0 ? (
                <p className="text-xs text-muted-foreground">No objections yet</p>
              ) : (
                <div className="space-y-3">
                  {objections.map((obj) => (
                    <div
                      key={obj.id}
                      className={cn(
                        "rounded-lg p-3 text-xs",
                        (obj.confidence_score || 0) > 0.7
                          ? "bg-destructive/10 border border-destructive/20"
                          : "bg-accent/10 border border-accent/20"
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
                {isLive && topics.length > 0 ? (
                  topics.map((t) => (
                    <span key={t.id} className="text-xs px-2 py-1 rounded-full bg-secondary text-secondary-foreground">
                      {t.topic}
                    </span>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {isLive ? "Analyzing topics..." : "No topics detected"}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
