/**
 * LiveMeeting.tsx — v3
 *
 * Key changes from v2:
 *  1. Uses useAudioCapture v3 (dual-stream: tab + mic merged via AudioContext)
 *  2. AudioCapturePanel: step-by-step visual guide so users know exactly
 *     what to do in Chrome's screen share picker to get both sides captured
 *  3. CaptureStatusBadge: shows capture quality (both sides / mic only)
 *  4. isFullCapture badge in transcript header
 *  5. Mobile: same improvements, compact layout
 */

import DashboardLayout from "@/components/DashboardLayout";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Mic, MicOff, AlertCircle, Lightbulb, TrendingUp, Clock, Loader2,
  Video, MonitorUp, ExternalLink, MessageSquare, BarChart3, Target,
  CheckCircle2, Circle, Radio, Users, Headphones, ChevronDown, Bot,
} from "lucide-react";
import { Button }        from "@/components/ui/button";
import { cn }            from "@/lib/utils";
import { useLiveCall }   from "@/hooks/useLiveCall";
import { useAudioCapture, type CaptureSource, type CaptureStep } from "@/hooks/useAudioCapture";
import { useTeam }       from "@/hooks/useTeam";
import { useUserStatus } from "@/hooks/useUserStatus";
import { useIsMobile }   from "@/hooks/use-mobile";
import { supabase }      from "@/integrations/supabase/client";
import { toast }         from "sonner";

// ─── Constants ───────────────────────────────────────────────────────────────

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

// ─── Capture status badge ─────────────────────────────────────────────────────

function CaptureStatusBadge({
  isCapturing,
  captureSource,
  isFullCapture,
}: {
  isCapturing:    boolean;
  captureSource:  CaptureSource;
  isFullCapture:  boolean;
}) {
  if (!isCapturing) return null;

  if (isFullCapture) {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-500/15 border border-green-500/30 text-green-400 text-xs font-medium">
        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
        Both sides captured
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-yellow-500/15 border border-yellow-500/30 text-yellow-400 text-xs font-medium">
      <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
      {captureSource === "mic" ? "Your mic only" : "Meeting audio only"}
    </div>
  );
}

// ─── Bot status banner ────────────────────────────────────────────────────────
// Shows the Recall.ai bot status — replaces the manual audio capture panel
// when the bot is active.

type BotStatus =
  | "none"
  | "joining"
  | "in_waiting_room"
  | "in_call_not_recording"
  | "recording_permission_allowed"
  | "recording_permission_denied"
  | "in_call"
  | "recording"
  | "call_ended"
  | "done"
  | "failed";

function useBotStatus(callId: string | undefined) {
  const [botStatus, setBotStatus] = useState<BotStatus>("none");

  useEffect(() => {
    if (!callId) return;

    // Poll the call row for bot status updates
    const fetch = async () => {
      const { data } = await supabase
        .from("calls")
        .select("recall_bot_status")
        .eq("id", callId)
        .maybeSingle();
      if (data?.recall_bot_status) {
        setBotStatus((data.recall_bot_status as BotStatus) ?? "none");
      }
    };

    fetch();

    // Also subscribe to realtime changes so status updates instantly
    const ch = supabase
      .channel(`bot-status:${callId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "calls", filter: `id=eq.${callId}` },
        (payload: any) => {
          if (payload.new?.recall_bot_status) {
            setBotStatus(payload.new.recall_bot_status as BotStatus);
          }
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, [callId]);

  const isActive  = ["joining", "in_waiting_room", "in_call_not_recording",
    "recording_permission_allowed", "in_call", "recording"].includes(botStatus);
  const isCapturing = botStatus === "recording" || botStatus === "recording_permission_allowed";
  const isFailed  = botStatus === "failed" || botStatus === "recording_permission_denied";

  return { botStatus, isActive, isCapturing, isFailed };
}

function BotStatusBanner({
  botStatus,
  isFailed,
  isActive,
  isBotCapturing,
  onFallback,
}: {
  botStatus:      BotStatus;
  isFailed:       boolean;
  isActive:       boolean;
  isBotCapturing: boolean;
  onFallback:     () => void;
}) {
  if (botStatus === "none") return null;

  const states: Record<BotStatus, { label: string; color: string; bg: string; border: string; icon: React.ReactNode }> = {
    none:                          { label: "", color: "", bg: "", border: "", icon: null },
    joining:                       { label: "Fixsense AI is joining the meeting…",                color: "text-primary",    bg: "bg-primary/5",     border: "border-primary/20",     icon: <Loader2 className="w-4 h-4 animate-spin text-primary" /> },
    in_waiting_room:               { label: "Fixsense AI is in the waiting room — please admit it", color: "text-yellow-400", bg: "bg-yellow-500/5",  border: "border-yellow-500/20",  icon: <Loader2 className="w-4 h-4 animate-spin text-yellow-400" /> },
    in_call_not_recording:         { label: "Fixsense AI joined — waiting to start recording",     color: "text-primary",    bg: "bg-primary/5",     border: "border-primary/20",     icon: <Loader2 className="w-4 h-4 animate-spin text-primary" /> },
    recording_permission_allowed:  { label: "🎙️ Fixsense AI is recording — both sides captured",  color: "text-green-400",  bg: "bg-green-500/5",   border: "border-green-500/20",   icon: <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" /> },
    in_call:                       { label: "🎙️ Fixsense AI is in the call — recording both sides", color: "text-green-400",  bg: "bg-green-500/5",   border: "border-green-500/20",   icon: <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" /> },
    recording:                     { label: "🎙️ Fixsense AI is recording — both sides captured",  color: "text-green-400",  bg: "bg-green-500/5",   border: "border-green-500/20",   icon: <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" /> },
    recording_permission_denied:   { label: "Recording permission denied — click 'Allow' in Meet", color: "text-yellow-400", bg: "bg-yellow-500/5",  border: "border-yellow-500/20",  icon: <AlertCircle className="w-4 h-4 text-yellow-400" /> },
    call_ended:                    { label: "Fixsense AI has left the meeting",                    color: "text-muted-foreground", bg: "bg-muted/30", border: "border-border",        icon: <Bot className="w-4 h-4 opacity-40" /> },
    done:                          { label: "Bot recording complete — transcript processing",      color: "text-primary",    bg: "bg-primary/5",     border: "border-primary/20",     icon: <CheckCircle2 className="w-4 h-4 text-primary" /> },
    failed:                        { label: "Bot failed to join — use manual capture below",       color: "text-red-400",    bg: "bg-red-500/5",     border: "border-red-500/20",     icon: <AlertCircle className="w-4 h-4 text-red-400" /> },
  };

  const state = states[botStatus] ?? states.joining;

  return (
    <div className={cn("rounded-xl p-3.5 border flex items-center gap-3", state.bg, state.border)}>
      <div className="shrink-0">{state.icon}</div>
      <p className={cn("text-sm flex-1", state.color)}>{state.label}</p>
      {isFailed && (
        <Button onClick={onFallback} size="sm" variant="outline" className="text-xs gap-1.5 shrink-0">
          <Mic className="w-3 h-3" />
          Use mic instead
        </Button>
      )}
      {botStatus === "in_waiting_room" && (
        <span className="text-xs text-muted-foreground shrink-0">
          Check the "Admit" dialog in your meeting
        </span>
      )}
    </div>
  );
}
// Shows step-by-step instructions so the user knows exactly what to do.

function AudioCapturePanel({
  isCapturing,
  captureStep,
  captureSource,
  captureSourceLabel,
  isFullCapture,
  error,
  capabilities,
  onStart,
  onStop,
}: {
  isCapturing:        boolean;
  captureStep:        CaptureStep;
  captureSource:      CaptureSource;
  captureSourceLabel: string | null;
  isFullCapture:      boolean;
  error:              string | null;
  capabilities:       { tabAudio: boolean; micAudio: boolean; isMobile: boolean };
  onStart:            () => void;
  onStop:             () => void;
}) {
  const [showInstructions, setShowInstructions] = useState(false);

  if (error) {
    return (
      <div className="glass rounded-xl p-4 border border-destructive/20 bg-destructive/5 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-destructive">Audio capture failed</p>
          <p className="text-xs text-muted-foreground mt-1">{error}</p>
        </div>
      </div>
    );
  }

  if (isCapturing) {
    return (
      <div className={cn(
        "glass rounded-xl p-4 flex items-center gap-3 border",
        isFullCapture
          ? "border-green-500/25 bg-green-500/5"
          : "border-yellow-500/25 bg-yellow-500/5"
      )}>
        <div className={cn(
          "w-9 h-9 rounded-full flex items-center justify-center shrink-0",
          isFullCapture ? "bg-green-500/15" : "bg-yellow-500/15"
        )}>
          <Radio className={cn("w-4 h-4", isFullCapture ? "text-green-400" : "text-yellow-400")} />
        </div>
        <div className="flex-1 min-w-0">
          <p className={cn("text-sm font-medium", isFullCapture ? "text-green-400" : "text-yellow-400")}>
            {isFullCapture ? "Full transcription active" : "Partial capture active"}
          </p>
          {captureSourceLabel && (
            <p className="text-xs text-muted-foreground mt-0.5">{captureSourceLabel}</p>
          )}
          {!isFullCapture && captureSource === "mic" && (
            <p className="text-xs text-yellow-500/80 mt-1">
              Your prospect's voice won't be transcribed. Stop and restart, then tick "Share tab audio" in Chrome.
            </p>
          )}
        </div>
        <Button
          onClick={onStop}
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-destructive shrink-0 text-xs"
        >
          Stop
        </Button>
      </div>
    );
  }

  // Requesting state
  if (captureStep === "requesting_display" || captureStep === "requesting_mic") {
    return (
      <div className="glass rounded-xl p-4 border border-primary/20 bg-primary/5 flex items-center gap-3">
        <Loader2 className="w-5 h-5 text-primary animate-spin shrink-0" />
        <div>
          <p className="text-sm font-medium">
            {captureStep === "requesting_display"
              ? "Select the tab with your meeting…"
              : "Allowing microphone access…"}
          </p>
          {captureStep === "requesting_display" && (
            <p className="text-xs text-muted-foreground mt-0.5">
              In Chrome's popup: select your meeting tab, then tick <strong>"Share tab audio"</strong>
            </p>
          )}
        </div>
      </div>
    );
  }

  // Idle — show the main CTA with optional step-by-step instructions
  return (
    <div className="glass rounded-xl border border-accent/20 overflow-hidden">
      {/* Main row */}
      <div className="p-4 flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center shrink-0 mt-0.5">
          <MonitorUp className="w-4 h-4 text-accent" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">Enable audio capture</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {capabilities.tabAudio
              ? "Captures both you and your prospect for full AI transcription"
              : "Captures your microphone for partial transcription"}
          </p>
          {/* Inline step hints */}
          {capabilities.tabAudio && (
            <button
              onClick={() => setShowInstructions(v => !v)}
              className="flex items-center gap-1 text-xs text-primary mt-1.5 hover:underline"
            >
              How does it work?
              <ChevronDown className={cn("w-3 h-3 transition-transform", showInstructions && "rotate-180")} />
            </button>
          )}
        </div>
        <Button
          onClick={onStart}
          size="sm"
          className="gap-2 shrink-0"
          disabled={!capabilities.tabAudio && !capabilities.micAudio}
        >
          <Mic className="w-3.5 h-3.5" />
          {capabilities.tabAudio ? "Capture Both Sides" : "Capture Mic Audio"}
        </Button>
      </div>

      {/* Expandable step-by-step instructions */}
      {showInstructions && capabilities.tabAudio && (
        <div className="border-t border-border bg-secondary/30 px-4 py-3">
          <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
            What will happen
          </p>
          <ol className="space-y-2">
            {[
              {
                icon: <MonitorUp className="w-3.5 h-3.5 text-primary" />,
                text: <>Chrome shows a screen share picker. Select the <strong>tab running your meeting</strong> (Google Meet, Zoom, etc.).</>,
              },
              {
                icon: <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />,
                text: <>In that same picker, tick the <strong>"Share tab audio"</strong> checkbox at the bottom left. This is what captures your prospect's voice.</>,
              },
              {
                icon: <Mic className="w-3.5 h-3.5 text-primary" />,
                text: <>Chrome then asks for <strong>microphone access</strong>. Allow it — this captures your own voice.</>,
              },
              {
                icon: <Radio className="w-3.5 h-3.5 text-green-400" />,
                text: <>Both audio streams are merged. You'll see <strong>"Both sides captured"</strong> and transcription starts immediately.</>,
              },
            ].map((step, i) => (
              <li key={i} className="flex items-start gap-2.5 text-xs text-muted-foreground">
                <span className="w-5 h-5 rounded-full bg-background border border-border flex items-center justify-center shrink-0 mt-0.5 font-bold text-[10px]">
                  {i + 1}
                </span>
                <span>{step.text}</span>
              </li>
            ))}
          </ol>
          <p className="text-xs text-muted-foreground mt-3 pt-2 border-t border-border">
            <strong>Not seeing "Share tab audio"?</strong> Make sure you're on Chrome or Edge on a desktop computer.
            Safari and Firefox don't support tab audio capture.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Mobile tabbed layout ─────────────────────────────────────────────────────

type MobileTab = "transcript" | "insights" | "objections";

function MobileLiveMeeting({
  transcripts,
  objections,
  topics,
  talkRatio,
  engagementScore,
  questionsCount,
  elapsed,
  meetingType,
  isCapturing,
  isFullCapture,
  captureSource,
  capabilities,
  formatTime,
  transcriptEndRef,
}: {
  transcripts:        any[];
  objections:         any[];
  topics:             any[];
  talkRatio:          { rep: number; prospect: number };
  engagementScore:    number;
  questionsCount:     number;
  elapsed:            number;
  meetingType:        string | undefined;
  isCapturing:        boolean;
  isFullCapture:      boolean;
  captureSource:      CaptureSource;
  capabilities:       { tabAudio: boolean; micAudio: boolean };
  formatTime:         (s: number) => string;
  transcriptEndRef:   React.RefObject<HTMLDivElement>;
}) {
  const [activeTab, setActiveTab] = useState<MobileTab>("transcript");

  const tabs: { id: MobileTab; label: string; badge?: number }[] = [
    { id: "transcript", label: "Live" },
    { id: "insights",   label: "Insights" },
    { id: "objections", label: "Objections", badge: objections.length || undefined },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Compact status strip */}
      <div className="flex items-center justify-between px-3 py-2 bg-secondary/40 rounded-lg mb-3 text-xs shrink-0">
        <span className="font-mono font-bold">{formatTime(elapsed)}</span>
        {isCapturing ? (
          <CaptureStatusBadge
            isCapturing={isCapturing}
            captureSource={captureSource}
            isFullCapture={isFullCapture}
          />
        ) : (
          <span className="text-muted-foreground">Audio not capturing</span>
        )}
        <span className="text-primary font-medium">{engagementScore}%</span>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-border mb-3 shrink-0">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={cn(
              "flex-1 py-2 text-xs font-medium border-b-2 transition-colors relative",
              activeTab === tab.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground"
            )}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
            {tab.badge ? (
              <span className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-destructive text-white text-[10px]">
                {tab.badge}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "transcript" && (
          <div className="space-y-3 pb-4">
            {transcripts.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <Mic className="w-8 h-8 mx-auto mb-3 opacity-20" />
                <p className="text-sm">
                  {isCapturing
                    ? "Listening — transcription will appear shortly…"
                    : capabilities.tabAudio
                      ? "Tap 'Capture Both Sides' to start"
                      : "Tap 'Capture Mic Audio' to start"}
                </p>
              </div>
            ) : (
              transcripts.map((line: any) => (
                <div
                  key={line.id}
                  className={cn("text-sm", line.speaker !== "Rep" && "pl-3 border-l-2 border-accent/40")}
                >
                  <span className={cn(
                    "text-xs font-medium mr-2",
                    line.speaker === "Rep" ? "text-primary" : "text-accent"
                  )}>
                    {line.speaker}
                  </span>
                  <span className="text-muted-foreground text-xs mr-2">
                    {new Date(line.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <span>{line.text}</span>
                </div>
              ))
            )}
            <div ref={transcriptEndRef} />
          </div>
        )}

        {activeTab === "insights" && (
          <div className="space-y-3 pb-4">
            <div className="glass rounded-lg p-3">
              <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                <BarChart3 className="w-3 h-3" /> Talk Ratio
              </p>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-primary">You {talkRatio.rep}%</span>
                <span className="text-accent">Prospect {talkRatio.prospect}%</span>
              </div>
              <div className="h-2.5 rounded-full bg-muted flex overflow-hidden">
                <div className="h-full bg-primary transition-all" style={{ width: `${talkRatio.rep}%` }} />
                <div className="h-full bg-accent transition-all" style={{ width: `${talkRatio.prospect}%` }} />
              </div>
              {talkRatio.rep > 65 && transcripts.length > 5 && (
                <p className="text-xs text-yellow-500 mt-1.5">⚠️ You're speaking too much. Ask more questions.</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="glass rounded-lg p-3 text-center">
                <div className="text-2xl font-bold font-display text-primary">{engagementScore}%</div>
                <div className="text-xs text-muted-foreground">Engagement</div>
              </div>
              <div className="glass rounded-lg p-3 text-center">
                <div className="text-2xl font-bold font-display">{questionsCount}</div>
                <div className="text-xs text-muted-foreground">Questions</div>
              </div>
              <div className="glass rounded-lg p-3 text-center">
                <div className="text-2xl font-bold font-display">{objections.length}</div>
                <div className="text-xs text-muted-foreground">Objections</div>
              </div>
              <div className="glass rounded-lg p-3 text-center">
                <div className="text-2xl font-bold font-display">{topics.length}</div>
                <div className="text-xs text-muted-foreground">Topics</div>
              </div>
            </div>

            {meetingType === "discovery" && (
              <div className="glass rounded-lg p-3">
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  <Target className="w-3 h-3 inline mr-1" /> Discovery Reminders
                </p>
                <ul className="space-y-1.5">
                  {DISCOVERY_REMINDERS.map((r, i) => (
                    <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                      <Circle className="w-2 h-2 mt-1 shrink-0 opacity-40" />{r}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {activeTab === "objections" && (
          <div className="space-y-2 pb-4">
            {objections.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <CheckCircle2 className="w-8 h-8 mx-auto mb-3 opacity-20" />
                <p className="text-sm">No objections detected yet</p>
              </div>
            ) : (
              objections.map((obj: any) => (
                <div key={obj.id} className="glass rounded-lg p-3 text-xs border border-destructive/20 bg-destructive/5">
                  <p className="font-medium">{obj.objection_type}</p>
                  {obj.suggestion && (
                    <div className="flex items-start gap-1.5 text-muted-foreground mt-1.5">
                      <Lightbulb className="w-3 h-3 text-accent shrink-0 mt-0.5" />
                      {obj.suggestion}
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

// ─── Main component ───────────────────────────────────────────────────────────

export default function LiveMeeting() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  // Status wiring
  const { team } = useTeam();
  const { setStatus } = useUserStatus(team?.id);

  const { liveCall, isLive, isLoading, transcripts, objections, topics, endCall, callId } = useLiveCall({
    onCallEnded: () => setStatus("available"),
  });

  const [elapsed, setElapsed]       = useState(0);
  const [meetPopupOpen, setMeetPopupOpen] = useState(false);
  const intervalRef      = useRef<number>();
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  const {
    isCapturing,
    error: captureError,
    captureSource,
    captureSourceLabel,
    captureButtonLabel,
    captureStep,
    isFullCapture,
    capabilities,
    startCapture,
    stopCapture,
  } = useAudioCapture({
    callId: callId || null,
    onChunkProcessed: (result) => {
      if (result?.analysis) console.log("Chunk processed:", result.analysis);
    },
  });

  // ── Recall bot status ──────────────────────────────────────────────────────
  const {
    botStatus,
    isActive:       isBotActive,
    isCapturing:    isBotCapturing,
    isFailed:       isBotFailed,
  } = useBotStatus(callId);

  // If bot is capturing, hide the manual audio capture panel.
  // If bot failed, show fallback panel automatically.
  const [showFallbackCapture, setShowFallbackCapture] = useState(false);
  const showManualCapture = !isBotActive || showFallbackCapture || isBotFailed;

  // Overall capture quality for status badge
  const effectivelyCapturingBothSides = isBotCapturing || isFullCapture;

  // ── Derived analytics ──────────────────────────────────────────────────────
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
    [transcripts],
  );

  const meetingType    = (liveCall as any)?.meeting_type as string | undefined;
  const meetingUrl     = (liveCall as any)?.meeting_url as string | undefined;
  const engagementScore = liveCall?.sentiment_score || 0;

  // ── Timer ──────────────────────────────────────────────────────────────────
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
    if (!isLoading && !isLive) navigate("/dashboard/live");
  }, [isLoading, isLive, navigate]);

  const formatTime = (s: number) =>
    `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  // ── End call ───────────────────────────────────────────────────────────────
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

  const handleOpenMeeting = () => {
    const url = meetingUrl || liveCall?.meeting_id;
    if (url && (url.startsWith("http") || url.includes("meet.google.com"))) {
      window.open(url, "fixsense-meeting", "width=1000,height=700,menubar=no,toolbar=no");
      setMeetPopupOpen(true);
    } else {
      toast.info("No meeting URL attached. Open your meeting separately and capture audio here.");
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
              {!isCapturing && captureStep === "idle" && (
                <Button
                  onClick={startCapture}
                  variant="outline"
                  size="sm"
                  className="gap-1.5 h-8 text-xs"
                  disabled={!capabilities.micAudio}
                >
                  <Mic className="w-3.5 h-3.5" />
                  {capabilities.tabAudio ? "Capture Audio" : "Mic Audio"}
                </Button>
              )}
              {(captureStep === "requesting_display" || captureStep === "requesting_mic") && (
                <div className="flex items-center gap-1.5 text-xs text-primary px-2 py-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Requesting…
                </div>
              )}
              {isCapturing && (
                <button
                  onClick={stopCapture}
                  className={cn(
                    "flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full",
                    isFullCapture
                      ? "bg-green-500/15 text-green-400"
                      : "bg-yellow-500/15 text-yellow-400"
                  )}
                >
                  <span className={cn("w-1.5 h-1.5 rounded-full animate-pulse", isFullCapture ? "bg-green-400" : "bg-yellow-400")} />
                  {isFullCapture ? "Both sides" : "Mic only"}
                </button>
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

          {/* Mobile capture warning if mic-only */}
          {isCapturing && !isFullCapture && captureSource === "mic" && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-xs text-yellow-400 flex-shrink-0">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              Only your voice is being transcribed. Your prospect's words won't appear.
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
              isFullCapture={isFullCapture}
              captureSource={captureSource}
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

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold font-display">{liveCall?.name || "Live Meeting"}</h1>
            <div className="flex items-center gap-3 mt-1">
              <p className="text-sm text-muted-foreground">Real-time AI call intelligence</p>
              {meetingType && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                  {MEETING_TYPE_LABELS[meetingType] || meetingType}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button onClick={handleOpenMeeting} variant="outline" className="gap-2" size="sm">
              <ExternalLink className="w-4 h-4" />
              {meetPopupOpen ? "Reopen Meeting" : "Open Meeting"}
            </Button>
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

        {/* ── Status bar ─────────────────────────────────────────────────── */}
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
          {(liveCall?.participants as string[] | undefined)?.length ? (
            <div className="flex items-center gap-1 text-muted-foreground text-xs">
              <Users className="w-3 h-3" />
              {(liveCall!.participants as string[]).join(", ")}
            </div>
          ) : null}
          {/* Show bot capture status or manual capture status */}
          {isBotCapturing ? (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-500/15 border border-green-500/30 text-green-400 text-xs font-medium">
              <Bot className="w-3 h-3" />
              AI bot capturing both sides
            </div>
          ) : (
            <CaptureStatusBadge
              isCapturing={isCapturing}
              captureSource={captureSource}
              isFullCapture={isFullCapture}
            />
          )}
        </div>

        {/* ── Bot status banner ──────────────────────────────────────────── */}
        {botStatus !== "none" && (
          <BotStatusBanner
            botStatus={botStatus}
            isFailed={isBotFailed}
            isActive={isBotActive}
            isBotCapturing={isBotCapturing}
            onFallback={() => setShowFallbackCapture(true)}
          />
        )}

        {/* ── Manual audio capture panel (hidden when bot is working) ────── */}
        {showManualCapture && (
          <AudioCapturePanel
            isCapturing={isCapturing}
            captureStep={captureStep}
            captureSource={captureSource}
            captureSourceLabel={captureSourceLabel}
            isFullCapture={isFullCapture}
            error={captureError}
            capabilities={capabilities}
            onStart={startCapture}
            onStop={stopCapture}
          />
        )}

        {/* ── Main content grid ───────────────────────────────────────────── */}
        <div className="grid lg:grid-cols-3 gap-4">

          {/* Transcription */}
          <div className="lg:col-span-2 glass rounded-xl flex flex-col max-h-[600px]">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h2 className="font-display font-semibold text-sm">Live Transcription</h2>
              {(isCapturing || isBotCapturing) && (
                <div className={cn(
                  "flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full",
                  (isFullCapture || isBotCapturing) ? "bg-green-500/15 text-green-400" : "bg-yellow-500/15 text-yellow-400"
                )}>
                  <span className={cn("w-1.5 h-1.5 rounded-full animate-pulse", (isFullCapture || isBotCapturing) ? "bg-green-400" : "bg-yellow-400")} />
                  {isBotCapturing ? "Both sides via AI bot" : isFullCapture ? "Both sides" : captureSource === "mic" ? "Your voice only" : "Meeting audio only"}
                </div>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {transcripts.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                  {isCapturing ? (
                    <>
                      <Loader2 className="w-6 h-6 animate-spin mb-3 opacity-50" />
                      <p className="text-sm">Listening for audio…</p>
                      <p className="text-xs mt-1 opacity-60">Transcription appears as speech is detected</p>
                    </>
                  ) : (
                    <>
                      <Mic className="w-10 h-10 mb-3 opacity-20" />
                      <p className="text-sm">Click "Capture Both Sides" above to start</p>
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
                        line.speaker !== "Rep" ? "pl-4 border-l-2 border-accent/40" : ""
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

            {/* Quick stats */}
            <div className="glass rounded-xl p-4">
              <h3 className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-2">
                <MessageSquare className="w-3 h-3" /> Call Stats
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-lg font-bold font-display">{questionsCount}</div>
                  <div className="text-xs text-muted-foreground">Questions</div>
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
                  <div className="text-lg font-bold font-display font-mono">{formatTime(elapsed)}</div>
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
                <p className="text-xs text-muted-foreground">No objections detected yet</p>
              ) : (
                <div className="space-y-3 max-h-[200px] overflow-y-auto">
                  {objections.map(obj => (
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

            {/* Discovery reminders */}
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

            {/* Key Topics */}
            <div className="glass rounded-xl p-4">
              <h3 className="text-xs font-medium text-muted-foreground mb-3">Key Topics</h3>
              <div className="flex flex-wrap gap-1.5">
                {topics.length > 0 ? (
                  topics.map(t => (
                    <span
                      key={t.id}
                      className="text-xs px-2 py-1 rounded-full bg-secondary text-secondary-foreground"
                    >
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
