import DashboardLayout from "@/components/DashboardLayout";
import { useState, useEffect, useRef } from "react";
import { Mic, MicOff, AlertCircle, Lightbulb, TrendingUp, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const mockTranscript = [
  { time: "0:00", speaker: "You", text: "Thanks for taking the time today. I'd love to walk you through how Fixsense can help your sales team." },
  { time: "0:15", speaker: "Client", text: "Sure, but I should mention upfront — we're already using Gong for call recording." },
  { time: "0:28", speaker: "You", text: "That's great context. A lot of our customers actually switched from Gong because of our real-time coaching." },
  { time: "0:42", speaker: "Client", text: "Real-time? Interesting. But honestly, the pricing might be a concern for us." },
  { time: "0:55", speaker: "You", text: "Totally understand. Let me show you our ROI calculator — most teams see 3x return within 60 days." },
];

const mockObjections = [
  { text: "Already using competitor (Gong)", suggestion: "Highlight unique real-time features. Offer side-by-side comparison.", severity: "medium" as const },
  { text: "Pricing concern raised", suggestion: "Share ROI calculator and case studies showing 3x return in 60 days.", severity: "high" as const },
];

const mockTopics = ["Competitor comparison", "Pricing", "ROI", "Real-time coaching", "Integration"];

export default function LiveCall() {
  const [isLive, setIsLive] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [visibleLines, setVisibleLines] = useState(0);
  const intervalRef = useRef<number>();

  useEffect(() => {
    if (isLive) {
      intervalRef.current = window.setInterval(() => {
        setElapsed(e => e + 1);
      }, 1000);
      const lineInterval = window.setInterval(() => {
        setVisibleLines(v => {
          if (v >= mockTranscript.length) {
            clearInterval(lineInterval);
            return v;
          }
          return v + 1;
        });
      }, 3000);
      return () => {
        clearInterval(intervalRef.current);
        clearInterval(lineInterval);
      };
    } else {
      setElapsed(0);
      setVisibleLines(0);
    }
  }, [isLive]);

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold font-display">Live Call</h1>
            <p className="text-sm text-muted-foreground">Real-time AI-powered call intelligence</p>
          </div>
          <Button onClick={() => setIsLive(!isLive)} variant={isLive ? "destructive" : "default"} className="gap-2">
            {isLive ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            {isLive ? "End Call" : "Start Call"}
          </Button>
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
                </div>
              ) : (
                mockTranscript.slice(0, visibleLines).map((line, i) => (
                  <div key={i} className={cn("animate-slide-up", line.speaker === "Client" ? "pl-4 border-l-2 border-accent/40" : "")}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={cn("text-xs font-medium", line.speaker === "You" ? "text-primary" : "text-accent")}>{line.speaker}</span>
                      <span className="text-xs text-muted-foreground">{line.time}</span>
                    </div>
                    <p className="text-sm text-foreground/90">{line.text}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* AI Insights Sidebar */}
          <div className="space-y-4">
            {/* Sentiment */}
            <div className="glass rounded-xl p-4">
              <h3 className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-2">
                <TrendingUp className="w-3 h-3" /> Engagement Score
              </h3>
              <div className="text-3xl font-bold font-display text-primary">{isLive ? "74%" : "—"}</div>
              <div className="h-1.5 rounded-full bg-muted mt-2">
                <div className="h-1.5 rounded-full bg-primary transition-all duration-1000" style={{ width: isLive ? "74%" : "0%" }} />
              </div>
            </div>

            {/* Objections */}
            <div className="glass rounded-xl p-4">
              <h3 className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-2">
                <AlertCircle className="w-3 h-3" /> Objections Detected
              </h3>
              {!isLive || visibleLines < 2 ? (
                <p className="text-xs text-muted-foreground">No objections yet</p>
              ) : (
                <div className="space-y-3">
                  {mockObjections.slice(0, visibleLines >= 4 ? 2 : 1).map((obj, i) => (
                    <div key={i} className={cn("rounded-lg p-3 text-xs", obj.severity === "high" ? "bg-destructive/10 border border-destructive/20" : "bg-accent/10 border border-accent/20")}>
                      <p className="font-medium mb-1">{obj.text}</p>
                      <div className="flex items-start gap-1.5 text-muted-foreground mt-2">
                        <Lightbulb className="w-3 h-3 text-accent shrink-0 mt-0.5" />
                        <span>{obj.suggestion}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Topics */}
            <div className="glass rounded-xl p-4">
              <h3 className="text-xs font-medium text-muted-foreground mb-3">Key Topics</h3>
              <div className="flex flex-wrap gap-1.5">
                {(isLive ? mockTopics.slice(0, Math.min(visibleLines + 1, mockTopics.length)) : []).map(t => (
                  <span key={t} className="text-xs px-2 py-1 rounded-full bg-secondary text-secondary-foreground">{t}</span>
                ))}
                {!isLive && <p className="text-xs text-muted-foreground">No topics detected</p>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
