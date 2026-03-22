/**
 * LiveCall.tsx — v3
 *
 * Key changes from v2:
 *  1. TWO-STEP MEETING CREATION WIZARD
 *     Step 1 — Fill details → generate Meet link
 *     Step 2 — See the link, copy it, share with prospect → "Start Meeting Now"
 *     The call row + Recall bot are NOT created until the user clicks "Start Meeting Now"
 *
 *  2. RELIABLE LINK GENERATION
 *     Uses create-google-meet v2 which tries Calendar API first, then Meet Spaces API.
 *     If BOTH fail (not connected at all), shows manual link entry in Step 2 instead
 *     of a dead-end error toast.
 *
 *  3. BOT PRIVACY NOTICE
 *     Step 2 clearly explains the Recall bot joins silently — prospect won't see it.
 *
 *  4. Mobile: same two-step flow in a full-screen sheet.
 */

import DashboardLayout from "@/components/DashboardLayout";
import { useState, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  Mic, Link2, CalendarPlus, Video, Loader2, Clock, Trash2,
  ExternalLink, AlertTriangle, Zap, TrendingUp, Calendar,
  Sparkles, ChevronDown, ChevronUp, CheckCircle, CheckCircle2,
  Users, BarChart3, BookOpen, Plus, Phone, Copy, Share2,
  ArrowLeft, Bot, Shield,
} from "lucide-react";
import { Button }   from "@/components/ui/button";
import { Input }    from "@/components/ui/input";
import { Label }    from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLiveCall }        from "@/hooks/useLiveCall";
import { useScheduledCalls }  from "@/hooks/useScheduledCalls";
import { useIntegrations }    from "@/hooks/useSettings";
import { useMeetingUsage }    from "@/hooks/useMeetingUsage";
import { useTeam }            from "@/hooks/useTeam";
import { useUserStatus }      from "@/hooks/useUserStatus";
import { useIsMobile }        from "@/hooks/use-mobile";
import { useCallPrep }        from "@/hooks/useCallPrep";
import { supabase }           from "@/integrations/supabase/client";
import { toast }              from "sonner";
import { format }             from "date-fns";
import { cn }                 from "@/lib/utils";

// ─── Constants ────────────────────────────────────────────────────────────────

function detectProvider(url: string): "zoom" | "google_meet" | "daily" | null {
  if (/zoom\.(us|com)/i.test(url)) return "zoom";
  if (/meet\.google\.com/i.test(url)) return "google_meet";
  if (/\.daily\.co\//i.test(url)) return "daily";
  return null;
}

const MEETING_TYPES = [
  { value: "discovery",   label: "Discovery Call",  emoji: "🔍" },
  { value: "demo",        label: "Product Demo",     emoji: "🎯" },
  { value: "follow_up",   label: "Follow-up",        emoji: "🔄" },
  { value: "negotiation", label: "Negotiation",      emoji: "🤝" },
  { value: "other",       label: "Other",            emoji: "📋" },
];

const DURATIONS = [
  { value: "30",  label: "30 min" },
  { value: "45",  label: "45 min" },
  { value: "60",  label: "1 hour" },
  { value: "90",  label: "1.5 hours" },
  { value: "120", label: "2 hours" },
];

// ─── Plan limit wall ──────────────────────────────────────────────────────────

function MeetingLimitReached({ planName, used, limit }: { planName: string; used: number; limit: number }) {
  const nav = useNavigate();
  return (
    <div className="flex items-center justify-center py-10 px-4">
      <div className="max-w-md w-full glass rounded-2xl p-8 text-center border border-destructive/20">
        <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-5">
          <Zap className="w-8 h-8 text-destructive" />
        </div>
        <h2 className="text-xl font-bold font-display mb-2">Meeting Limit Reached</h2>
        <p className="text-sm text-muted-foreground mb-1">
          You've used all <strong>{limit}</strong> meetings this month on the <strong>{planName}</strong> plan.
        </p>
        <div className="h-2 w-full rounded-full bg-muted overflow-hidden my-4">
          <div className="h-2 bg-destructive rounded-full w-full" />
        </div>
        <Button onClick={() => nav("/dashboard/billing")} className="w-full gap-2" size="lg">
          <Zap className="w-4 h-4" /> Upgrade Plan
        </Button>
      </div>
    </div>
  );
}

// ─── Pre-call prep ────────────────────────────────────────────────────────────

function PreCallPanel({ participants, meetingType }: { participants: string[]; meetingType: string }) {
  const { prep, isLoading } = useCallPrep(participants, meetingType);
  const [open, setOpen] = useState(true);

  if (isLoading) return (
    <div className="glass rounded-xl p-4 flex items-center gap-3 text-sm text-muted-foreground">
      <Loader2 className="w-4 h-4 animate-spin text-primary" /> Loading call prep…
    </div>
  );
  if (!prep) return null;

  return (
    <div className="glass rounded-xl overflow-hidden border border-border">
      <button
        className="w-full flex items-center justify-between p-4 hover:bg-secondary/30 transition-colors"
        onClick={() => setOpen(p => !p)}
      >
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <span className="font-display font-semibold text-sm">Call Prep</span>
          {prep.isFirstContact && (
            <span className="text-xs bg-accent/10 text-accent px-2 py-0.5 rounded-full">First contact</span>
          )}
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-4">
          {prep.pastCalls.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Previous Calls</p>
              <div className="space-y-1">
                {prep.pastCalls.slice(0, 3).map(c => (
                  <Link key={c.id} to={`/dashboard/calls/${c.id}`}
                    className="flex items-center justify-between p-2 rounded-lg hover:bg-secondary/40 transition-colors">
                    <span className="text-sm truncate">{c.name}</span>
                    {c.sentiment_score != null && (
                      <span className={cn("text-xs font-medium shrink-0 ml-2",
                        c.sentiment_score >= 70 ? "text-green-500" : c.sentiment_score >= 40 ? "text-yellow-500" : "text-red-500"
                      )}>{c.sentiment_score}%</span>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          )}
          {prep.talkingPoints.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Suggested Talking Points</p>
              <ul className="space-y-1.5">
                {prep.talkingPoints.map((pt, i) => (
                  <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                    <span className="w-4 h-4 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 text-[10px] font-bold mt-0.5">{i + 1}</span>
                    {pt}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {prep.openActionItems.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Open Action Items</p>
              <ul className="space-y-1">
                {prep.openActionItems.map((item, i) => (
                  <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent/60 shrink-0 mt-1.5" />{item}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Two-step meeting creation wizard ────────────────────────────────────────

interface WizardState {
  step: "form" | "ready";
  // Result of create-google-meet
  meetLink:        string | null;   // null means generation failed — user must paste
  calEventId:      string | null;
  invitesSent:     boolean;
  method:          "calendar" | "spaces" | "service_account" | "daily" | "manual" | null;
  // User-entered fallback URL (when meetLink is null)
  manualUrl:       string;
  // UX
  copied:          boolean;
}

const EMPTY_WIZARD: WizardState = {
  step:        "form",
  meetLink:    null,
  calEventId:  null,
  invitesSent: false,
  method:      null,
  manualUrl:   "",
  copied:      false,
};

// ─── Wizard Step 2: share link + start ───────────────────────────────────────

function WizardReady({
  wizard,
  setWizard,
  meetingTitle,
  meetingType,
  participants,
  scheduledTime,
  duration,
  onStart,
  isStarting,
}: {
  wizard:        WizardState;
  setWizard:     React.Dispatch<React.SetStateAction<WizardState>>;
  meetingTitle:  string;
  meetingType:   string;
  participants:  string[];
  scheduledTime: string;
  duration:      string;
  onStart:       () => void;
  isStarting:    boolean;
}) {
  const displayLink = wizard.meetLink ?? wizard.manualUrl;
  const isValidLink = !!displayLink && !!detectProvider(displayLink);
  const needsManual = !wizard.meetLink; // generation failed, user must paste

  const copyLink = () => {
    if (!displayLink) return;
    navigator.clipboard.writeText(displayLink);
    setWizard(w => ({ ...w, copied: true }));
    toast.success("Meeting link copied!");
    setTimeout(() => setWizard(w => ({ ...w, copied: false })), 3000);
  };

  const shareLink = async () => {
    if (!displayLink) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: meetingTitle, text: `Join my meeting: ${displayLink}`, url: displayLink });
      } catch {}
    } else {
      copyLink();
    }
  };

  const openMeetNew = () => {
    window.open("https://meet.google.com/new", "_blank");
  };

  return (
    <div className="space-y-5">
      {/* Step indicator */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setWizard(w => ({ ...w, step: "form" }))}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="w-5 h-5 rounded-full bg-primary/15 text-primary flex items-center justify-center text-[11px] font-bold">✓</span>
          <span className="line-through opacity-50">Details</span>
          <span className="opacity-40">→</span>
          <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[11px] font-bold">2</span>
          <span className="font-medium text-foreground">Share & Start</span>
        </div>
      </div>

      {/* ── CASE A: Link was generated ──────────────────────────────────── */}
      {wizard.meetLink && (
        <>
          {/* Big link display */}
          <div className="rounded-xl border-2 border-primary/20 bg-primary/5 overflow-hidden">
            <div className="px-4 py-2.5 bg-primary/10 border-b border-primary/15 flex items-center gap-2">
              <Video className="w-3.5 h-3.5 text-primary" />
              <p className="text-xs font-semibold text-primary">Your meeting link is ready</p>
              {wizard.method === "calendar" && wizard.invitesSent && participants.length > 0 && (
                <span className="ml-auto text-xs text-green-600 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Invites sent
                </span>
              )}
            </div>
            <div className="p-4 space-y-3">
              {/* Link row */}
              <div className="flex items-center gap-2 bg-background rounded-lg border border-border px-3 py-2.5">
                <span className="flex-1 min-w-0 font-mono text-sm text-primary truncate select-all">
                  {wizard.meetLink}
                </span>
                <Button variant="ghost" size="sm" className="h-7 px-2.5 gap-1.5 shrink-0 text-xs" onClick={copyLink}>
                  {wizard.copied
                    ? <><CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> Copied!</>
                    : <><Copy className="w-3.5 h-3.5" /> Copy</>}
                </Button>
              </div>

              {/* Share + Open */}
              <div className="flex gap-2">
                <Button onClick={shareLink} variant="outline" size="sm" className="flex-1 gap-2">
                  <Share2 className="w-3.5 h-3.5" />
                  Share with Prospect
                </Button>
                <Button
                  onClick={() => window.open(wizard.meetLink!, "_blank")}
                  variant="outline"
                  size="sm"
                  className="gap-2"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Test link
                </Button>
              </div>

              {(wizard.method === "daily" || wizard.method === "spaces" || wizard.method === "service_account") && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5 pt-1">
                  <AlertTriangle className="w-3 h-3 text-yellow-500 shrink-0" />
                  {wizard.method === "daily"
                    ? "Video link created. Share it manually — no calendar invite sent."
                    : "No calendar invite sent — share this link manually (email, WhatsApp, SMS)."}
                </p>
              )}
            </div>
          </div>

          {/* How it works steps */}
          <div className="rounded-xl border border-border bg-secondary/10 p-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">What to do next</p>
            <div className="space-y-2.5">
              {[
                { icon: <Share2 className="w-3.5 h-3.5 text-primary" />, text: "Send this link to your prospect via email, WhatsApp, or SMS." },
                { icon: <Users className="w-3.5 h-3.5 text-primary" />, text: "Wait for your prospect to click and join the meeting." },
                { icon: <Video className="w-3.5 h-3.5 text-primary" />, text: <>Click <strong className="text-foreground">Start Meeting Now</strong> below when you're both ready.</> },
                { icon: <Bot className="w-3.5 h-3.5 text-green-500" />,  text: "Fixsense AI joins silently and transcribes both sides — no action needed." },
              ].map((step, i) => (
                <div key={i} className="flex items-start gap-2.5 text-xs text-muted-foreground">
                  <span className="w-5 h-5 rounded-full bg-background border border-border flex items-center justify-center shrink-0 font-bold text-[10px] mt-0.5">{i + 1}</span>
                  <div className="flex items-start gap-1.5 flex-1 mt-0.5">
                    {step.icon}
                    <span>{step.text}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── CASE B: Link generation failed — manual entry ──────────────── */}
      {needsManual && (
        <div className="rounded-xl border-2 border-dashed border-border overflow-hidden">
          <div className="px-4 py-3 bg-secondary/20 border-b border-border">
            <p className="text-sm font-semibold">Get a meeting link</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Create a free Google Meet link in one click, then paste it below.
            </p>
          </div>
          <div className="p-4 space-y-3">
            {/* One-click create button */}
            <Button
              onClick={openMeetNew}
              variant="outline"
              className="w-full gap-2 border-primary/30 text-primary hover:bg-primary/5"
            >
              <Video className="w-4 h-4" />
              Open meet.google.com/new →
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              A new tab opens. Click "New meeting" → "Start an instant meeting" → copy the URL → paste below.
            </p>
            <div className="relative">
              <Input
                placeholder="https://meet.google.com/xxx-yyyy-zzz"
                value={wizard.manualUrl}
                onChange={e => setWizard(w => ({ ...w, manualUrl: e.target.value, method: "manual" }))}
                className="font-mono text-sm pr-20"
                autoFocus
              />
              {wizard.manualUrl && (
                <div className="absolute right-2 top-1/2 -translate-y-1/2">
                  {detectProvider(wizard.manualUrl) ? (
                    <span className="text-xs text-green-600 flex items-center gap-1 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Valid
                    </span>
                  ) : (
                    <span className="text-xs text-red-400 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" /> Invalid
                    </span>
                  )}
                </div>
              )}
            </div>
            {wizard.manualUrl && detectProvider(wizard.manualUrl) && (
              <div className="flex gap-2">
                <Button onClick={copyLink} variant="ghost" size="sm" className="gap-1.5 text-xs flex-1">
                  <Copy className="w-3.5 h-3.5" /> Copy to share
                </Button>
                <Button onClick={shareLink} variant="ghost" size="sm" className="gap-1.5 text-xs flex-1">
                  <Share2 className="w-3.5 h-3.5" /> Share with prospect
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bot privacy guarantee */}
      <div className="rounded-xl border border-green-500/25 bg-green-500/5 p-4 flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-green-500/15 flex items-center justify-center shrink-0">
          <Shield className="w-4 h-4 text-green-500" />
        </div>
        <div>
          <p className="text-sm font-medium text-green-600">Prospect won't see the AI bot</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Fixsense AI joins as a silent background listener. It does not appear in the participant list.
            It captures audio server-side and transcribes both sides automatically — no action needed from you or your prospect.
          </p>
        </div>
      </div>

      {/* Summary */}
      <div className="rounded-lg border border-border bg-secondary/10 px-4 py-3 text-xs text-muted-foreground space-y-1">
        <p className="font-medium text-sm text-foreground">{meetingTitle}</p>
        <p>{MEETING_TYPES.find(t => t.value === meetingType)?.emoji} {MEETING_TYPES.find(t => t.value === meetingType)?.label} · {duration} min</p>
        {participants.length > 0 && <p>👥 {participants.join(", ")}</p>}
        {scheduledTime && <p>📅 {new Date(scheduledTime).toLocaleString()}</p>}
      </div>

      {/* Start button */}
      <Button
        onClick={onStart}
        disabled={isStarting || !isValidLink}
        className="w-full gap-2"
        size="lg"
      >
        {isStarting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Video className="w-4 h-4" />}
        {isStarting ? "Starting…" : "Start Meeting Now"}
      </Button>

      {!isValidLink && !isStarting && (
        <p className="text-xs text-center text-muted-foreground -mt-2">
          {wizard.meetLink ? "" : "Paste a valid meeting link above to continue"}
        </p>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function LiveCall() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const { liveCall, isLive, isLoading, startCall } = useLiveCall();
  const { scheduledCalls, scheduleMeeting, cancelScheduled } = useScheduledCalls();
  const { team }       = useTeam();
  const { setStatus }  = useUserStatus(team?.id);
  const { integrations } = useIntegrations();
  const { usage, isLoading: usageLoading } = useMeetingUsage();

  // ── Create meeting wizard state ──────────────────────────────────────────
  const [createOpen, setCreateOpen] = useState(false);
  const [wizard, setWizard]         = useState<WizardState>(EMPTY_WIZARD);
  const [generatingLink, setGeneratingLink] = useState(false);

  // Wizard form fields
  const [meetingTitle, setMeetingTitle] = useState("");
  const [meetingType, setMeetingType]   = useState("discovery");
  const [participants, setParticipants] = useState("");
  const [platform, setPlatform]         = useState("daily"); // Daily.co is default — always works
  const [scheduledTime, setScheduledTime] = useState("");
  const [duration, setDuration]         = useState("60");

  // ── Join meeting state ───────────────────────────────────────────────────
  const [joinUrl, setJoinUrl] = useState("");

  // ── Schedule state ───────────────────────────────────────────────────────
  const [schedOpen, setSchedOpen]     = useState(false);
  const [schedTitle, setSchedTitle]   = useState(""); 
  const [schedProvider, setSchedProvider] = useState("google_meet");
  const [schedUrl, setSchedUrl]       = useState("");
  const [schedTime, setSchedTime]     = useState("");

  // ── Derived ──────────────────────────────────────────────────────────────
  const parsedParticipants = useMemo(
    () => participants.split(",").map(p => p.trim()).filter(Boolean),
    [participants],
  );
  const showPrep = parsedParticipants.length > 0 || meetingType !== "discovery";
  const isProviderConnected = (p: string) => integrations.some(i => i.provider === p && i.status === "connected");

  if (isLive && liveCall?.id) navigate(`/dashboard/live/${liveCall.id}`);

  const closeAndReset = () => {
    setCreateOpen(false);
    setWizard(EMPTY_WIZARD);
    setMeetingTitle(""); setMeetingType("discovery");
    setParticipants(""); setPlatform("daily");
    setScheduledTime(""); setDuration("60");
  };

  // ── STEP 1: Generate link ─────────────────────────────────────────────────
  // ALWAYS calls create-google-meet regardless of platform selection.
  // The edge function tries Daily.co first (no user setup needed), then
  // Google OAuth, then falls back to manual entry.
  const handleGenerateLink = async () => {
    if (!meetingTitle.trim()) { toast.error("Please enter a meeting title"); return; }
    if (usage && !usage.isUnlimited && usage.isAtLimit) {
      toast.error(`You've reached your ${usage.planName} plan limit of ${usage.limit} meetings.`);
      return;
    }

    setGeneratingLink(true);

    let meetLink:   string | null = null;
    let calEventId: string | null = null;
    let invitesSent               = false;
    let method: WizardState["method"] = null;

    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();

      console.log("[create-meeting] calling create-google-meet edge function...");

      const { data, error } = await supabase.functions.invoke("create-google-meet", {
        body: {
          user_id:          authUser?.id ?? "anonymous",
          title:            meetingTitle.trim(),
          participants:     parsedParticipants,
          scheduled_time:   scheduledTime || new Date().toISOString(),
          duration_minutes: parseInt(duration, 10),
          meeting_type:     meetingType,
        },
      });

      console.log("[create-meeting] response:", JSON.stringify(data), "error:", error);

      if (error) {
        console.error("[create-meeting] invoke error:", error);
      } else if (data?.meet_link) {
        meetLink    = data.meet_link;
        calEventId  = data.calendar_event_id ?? null;
        invitesSent = data.invites_sent ?? false;
        method      = data.method ?? "daily";
        if (method === "calendar" && invitesSent && parsedParticipants.length > 0) {
          toast.success("Meeting created — calendar invites sent!");
        } else {
          toast.success("Meeting link ready!");
        }
      } else {
        // Edge function returned but no link — log what it said
        console.warn("[create-meeting] no meet_link in response:", JSON.stringify(data));
      }
    } catch (e: any) {
      console.error("[create-meeting] exception:", e?.message ?? e);
    }

    setGeneratingLink(false);

    // Always advance to step 2 — with or without a link
    setWizard({
      step:        "ready",
      meetLink,
      calEventId,
      invitesSent,
      method,
      manualUrl:   "",
      copied:      false,
    });
  };

  // ── STEP 2: Start the actual meeting ─────────────────────────────────────
  const handleStartMeeting = async () => {
    const finalUrl = (wizard.meetLink ?? wizard.manualUrl).trim();
    if (!finalUrl || !detectProvider(finalUrl)) {
      toast.error("Please add a valid meeting link (Google Meet, Zoom, or Daily.co).");
      return;
    }

    try {
      const call = await startCall.mutateAsync({
        platform:          platform === "zoom" ? "Zoom" : detectProvider(finalUrl) === "daily" ? "Daily.co" : "Google Meet",
        meeting_id:        finalUrl,
        meeting_url:       finalUrl,
        calendar_event_id: wizard.calEventId ?? undefined,
        name:              meetingTitle.trim(),
        meeting_type:      meetingType,
        participants:      parsedParticipants,
        scheduled_time:    scheduledTime || undefined,
        duration_minutes:  parseInt(duration, 10),
      } as any);
      setStatus("on_call");
      closeAndReset();
      navigate(`/dashboard/live/${call.id}`);
    } catch (err: any) {
      if (err?.message === "PLAN_LIMIT_REACHED") {
        toast.error("You've reached your plan limit. Upgrade to continue.");
      } else {
        toast.error("Failed to start meeting — please try again.");
      }
    }
  };

  // ── Join existing meeting ─────────────────────────────────────────────────
  const handleJoinMeeting = async () => {
    if (!joinUrl.trim()) { toast.error("Please paste a meeting URL"); return; }
    const detected = detectProvider(joinUrl);
    if (!detected) { toast.error("Unsupported URL. Use a Google Meet, Zoom, or Daily.co link."); return; }
    if (usage && !usage.isUnlimited && usage.isAtLimit) {
      toast.error(`You've reached your ${usage.planName} plan limit.`); return;
    }
    try {
      const call = await startCall.mutateAsync({
        platform:    detected === "zoom" ? "Zoom" : "Google Meet",
        meeting_id:  joinUrl,
        meeting_url: joinUrl,
      } as any);
      setStatus("on_call");
      navigate(`/dashboard/live/${call.id}`);
    } catch (err: any) {
      toast.error(err?.message === "PLAN_LIMIT_REACHED" ? "Plan limit reached. Upgrade to Pro." : "Failed to join meeting");
    }
  };

  // ── Schedule ──────────────────────────────────────────────────────────────
  const handleSchedule = async () => {
    if (!schedTitle.trim() || !schedTime) { toast.error("Please fill in all fields"); return; }
    await scheduleMeeting.mutateAsync({
      title:            schedTitle,
      meeting_provider: schedProvider,
      meeting_url:      schedUrl || undefined,
      scheduled_time:   new Date(schedTime).toISOString(),
    });
    setSchedOpen(false);
    setSchedTitle(""); setSchedUrl(""); setSchedTime("");
  };

  // ─────────────────────────────────────────────────────────────────────────
  if (isLoading || usageLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  const zoomConnected = isProviderConnected("zoom");
  const meetConnected = isProviderConnected("google_meet");
  const anyConnected  = zoomConnected || meetConnected;
  const atLimit       = usage ? (!usage.isUnlimited && usage.isAtLimit) : false;

  // ─── Dialog content shared between mobile/desktop ────────────────────────
  const wizardDialog = (
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Video className="w-5 h-5" />
          {wizard.step === "form" ? "Create Meeting" : "Share Link & Start"}
          {wizard.step === "form" && meetConnected && (
            <span className="text-xs font-normal text-primary bg-primary/10 px-2 py-0.5 rounded-full ml-auto">
              ✦ Auto Meet link
            </span>
          )}
        </DialogTitle>
      </DialogHeader>

      {/* ── STEP 1: Form ── */}
      {wizard.step === "form" && (
        <div className="grid md:grid-cols-2 gap-6 pt-2">
          <div className="space-y-4">
            <div>
              <Label>Meeting Title *</Label>
              <Input
                value={meetingTitle}
                onChange={e => setMeetingTitle(e.target.value)}
                placeholder="Q4 Discovery Call with Acme Corp"
                className="mt-1"
                onKeyDown={e => e.key === "Enter" && handleGenerateLink()}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Type</Label>
                <Select value={meetingType} onValueChange={setMeetingType}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MEETING_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.emoji} {t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Duration</Label>
                <Select value={duration} onValueChange={setDuration}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DURATIONS.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Participant Emails (comma-separated)</Label>
              <Input
                value={participants}
                onChange={e => setParticipants(e.target.value)}
                placeholder="jane@acme.com, john@acme.com"
                className="mt-1"
              />
              {parsedParticipants.length > 0 && meetConnected && (
                <p className="text-xs text-primary mt-1">
                  ✓ Calendar invites will be sent to {parsedParticipants.length} participant{parsedParticipants.length > 1 ? "s" : ""}
                </p>
              )}
            </div>

            <div>
              <Label>Schedule For (optional)</Label>
              <Input
                type="datetime-local"
                value={scheduledTime}
                onChange={e => setScheduledTime(e.target.value)}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">Leave empty to start soon</p>
            </div>

            {/* Platform — Daily.co is always available, Google Meet/Zoom need integration */}
            <div>
              <Label>Video platform</Label>
              <Select value={platform} onValueChange={setPlatform}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">
                    Daily.co — auto link (recommended)
                  </SelectItem>
                  <SelectItem value="google_meet">
                    Google Meet {meetConnected ? "✦ auto-link" : "(requires Google connection)"}
                  </SelectItem>
                  <SelectItem value="zoom">
                    Zoom {zoomConnected ? "" : "(requires Zoom connection)"}
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Daily.co links work instantly — no account needed for your prospect.
              </p>
            </div>

            <Button
              onClick={handleGenerateLink}
              disabled={generatingLink || !meetingTitle.trim()}
              className="w-full gap-2"
            >
              {generatingLink ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
              {generatingLink
                ? "Generating Meet link…"
                : meetConnected
                  ? "Generate Link & Continue →"
                  : "Continue →"}
            </Button>
          </div>

          <div>
            {showPrep
              ? <PreCallPanel participants={parsedParticipants} meetingType={meetingType} />
              : (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 text-muted-foreground border border-dashed border-border rounded-xl">
                  <BookOpen className="w-8 h-8 mb-3 opacity-30" />
                  <p className="text-sm">Add participant emails to see call prep, previous call history, and AI talking points.</p>
                </div>
              )
            }
          </div>
        </div>
      )}

      {/* ── STEP 2: Share + start ── */}
      {wizard.step === "ready" && (
        <WizardReady
          wizard={wizard}
          setWizard={setWizard}
          meetingTitle={meetingTitle}
          meetingType={meetingType}
          participants={parsedParticipants}
          scheduledTime={scheduledTime}
          duration={duration}
          onStart={handleStartMeeting}
          isStarting={startCall.isPending}
        />
      )}
    </DialogContent>
  );

  // ════════════════════════════════════════════════════════════════════════════
  // MOBILE LAYOUT
  // ════════════════════════════════════════════════════════════════════════════
  if (isMobile) {
    return (
      <DashboardLayout>
        <div className="space-y-4 pb-4">
          <div>
            <h1 className="text-xl font-bold font-display">Live Call</h1>
            <p className="text-xs text-muted-foreground">Start or join a sales meeting</p>
          </div>

          {usage && !usage.isUnlimited && (
            <div className="glass rounded-xl p-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-muted-foreground">{usage.planName} plan</span>
                <span className={cn("text-xs font-medium",
                  usage.isAtLimit ? "text-destructive" : usage.isNearLimit ? "text-accent" : "text-primary"
                )}>
                  {usage.used} / {usage.limit} meetings
                </span>
              </div>
              <Progress value={usage.pct} className={cn("h-1.5",
                usage.isAtLimit ? "[&>div]:bg-destructive" : usage.isNearLimit ? "[&>div]:bg-accent" : ""
              )} />
            </div>
          )}

          {atLimit && usage && (
            <MeetingLimitReached planName={usage.planName} used={usage.used} limit={usage.limit} />
          )}

          {!atLimit && (
            <>
              {/* Create meeting */}
              <div className="glass rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-primary" />
                  <span className="font-display font-semibold text-sm">Create Meeting</span>
                  {meetConnected && (
                    <span className="ml-auto text-xs text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                      Auto Meet link
                    </span>
                  )}
                </div>

                <Dialog open={createOpen} onOpenChange={open => { if (!open) closeAndReset(); setCreateOpen(open); }}>
                  <DialogTrigger asChild>
                    <Button className="w-full gap-2">
                      <Plus className="w-4 h-4" /> Create Meeting
                    </Button>
                  </DialogTrigger>
                  {wizardDialog}
                </Dialog>
              </div>

              {/* Join meeting */}
              <div className="glass rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Link2 className="w-4 h-4 text-accent" />
                  <span className="font-display font-semibold text-sm">Join Meeting</span>
                </div>
                <Input
                  placeholder="Paste Zoom or Google Meet URL"
                  value={joinUrl}
                  onChange={e => setJoinUrl(e.target.value)}
                  className="h-10"
                />
                <Button
                  variant="secondary"
                  className="w-full gap-2"
                  disabled={!joinUrl.trim() || startCall.isPending}
                  onClick={handleJoinMeeting}
                >
                  {startCall.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
                  Join
                </Button>
              </div>

              {showPrep && (
                <PreCallPanel participants={parsedParticipants} meetingType={meetingType} />
              )}

              {scheduledCalls.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1">Upcoming</p>
                  {scheduledCalls.slice(0, 3).map(sc => (
                    <div key={sc.id} className="glass rounded-xl p-3 flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{sc.title}</p>
                        <p className="text-xs text-muted-foreground">{format(new Date(sc.scheduled_time), "MMM d, h:mm a")}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-3">
                        {sc.meeting_url && (
                          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setJoinUrl(sc.meeting_url!)}>
                            Join
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => cancelScheduled.mutate(sc.id)}>
                          <Trash2 className="w-3 h-3 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </DashboardLayout>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // DESKTOP LAYOUT
  // ════════════════════════════════════════════════════════════════════════════
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold font-display">Live Call</h1>
          <p className="text-sm text-muted-foreground">
            Start or join a sales meeting — Fixsense handles transcription, AI analysis, and deal room creation
          </p>
        </div>

        {/* Usage */}
        {usage && (
          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" /> Meeting Usage This Month
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 mb-4">
                {[
                  { label: "Current Plan", value: usage.planName },
                  {
                    label: "Meetings Used",
                    value: <>{usage.used}{!usage.isUnlimited && <span className="text-muted-foreground text-base font-normal"> / {usage.limit}</span>}</>,
                    color: usage.isAtLimit ? "text-destructive" : usage.isNearLimit ? "text-accent" : "text-primary",
                  },
                  { label: "Remaining", value: usage.isUnlimited ? "∞" : usage.remaining },
                ].map(({ label, value, color }) => (
                  <div key={label} className="text-center p-3 rounded-lg bg-secondary/40">
                    <div className={cn("text-2xl font-bold font-display", color)}>{value}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
                  </div>
                ))}
              </div>
              {!usage.isUnlimited && (
                <div className="space-y-1.5">
                  <Progress value={usage.pct} className={cn("h-2.5",
                    usage.isAtLimit ? "[&>div]:bg-destructive" : usage.isNearLimit ? "[&>div]:bg-accent" : ""
                  )} />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{Math.round(usage.pct)}% of monthly limit</span>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" /> Resets {format(usage.resetDate, "MMM d, yyyy")}
                    </span>
                  </div>
                </div>
              )}
              {usage.isUnlimited && (
                <div className="flex items-center justify-center gap-2 text-sm text-primary">
                  <Zap className="w-4 h-4" /> Unlimited meetings on Scale plan
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {atLimit && usage && (
          <MeetingLimitReached planName={usage.planName} used={usage.used} limit={usage.limit} />
        )}

        {!atLimit && (
          <>
            {/* Main action cards */}
            <div className="grid md:grid-cols-3 gap-4">
              {/* Create Meeting */}
              <div className="glass rounded-xl p-6 flex flex-col md:col-span-2">
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Video className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h2 className="font-display font-semibold">Create Meeting</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {meetConnected
                        ? "Generates a Google Meet link, sends calendar invites, and starts AI transcription"
                        : "Get a link, share with your prospect, then start with AI transcription"}
                    </p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Bot className="w-3 h-3 text-primary" /> AI bot joins silently</span>
                      <span className="flex items-center gap-1"><Shield className="w-3 h-3 text-green-500" /> Prospect won't see bot</span>
                    </div>
                  </div>
                </div>

                <Dialog open={createOpen} onOpenChange={open => { if (!open) closeAndReset(); setCreateOpen(open); }}>
                  <DialogTrigger asChild>
                    <Button className="gap-2">
                      <Plus className="w-4 h-4" /> Create Meeting
                    </Button>
                  </DialogTrigger>
                  {wizardDialog}
                </Dialog>
              </div>

              {/* Join Meeting */}
              <div className="glass rounded-xl p-6 flex flex-col">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                    <Link2 className="w-5 h-5 text-accent" />
                  </div>
                  <h2 className="font-display font-semibold">Join Meeting</h2>
                </div>
                <p className="text-xs text-muted-foreground mb-4 flex-1">
                  Already have a Zoom or Google Meet URL? Paste it here to start live AI analysis.
                </p>
                <Input
                  placeholder="https://meet.google.com/abc-def-ghi"
                  value={joinUrl}
                  onChange={e => setJoinUrl(e.target.value)}
                  className="mb-3"
                />
                <Button
                  onClick={handleJoinMeeting}
                  disabled={startCall.isPending || !joinUrl.trim()}
                  variant="secondary"
                  className="gap-2"
                >
                  {startCall.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
                  Join Meeting
                </Button>
              </div>
            </div>

            {/* Schedule */}
            <div className="glass rounded-xl p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CalendarPlus className="w-4 h-4 text-muted-foreground" />
                  <h2 className="font-display font-semibold text-sm">Schedule a Meeting</h2>
                </div>
                <Dialog open={schedOpen} onOpenChange={setSchedOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2">
                      <CalendarPlus className="w-3.5 h-3.5" /> Schedule
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Schedule Meeting</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-2">
                      <div>
                        <Label>Title</Label>
                        <Input value={schedTitle} onChange={e => setSchedTitle(e.target.value)} className="mt-1" />
                      </div>
                      <div>
                        <Label>Platform</Label>
                        <Select value={schedProvider} onValueChange={setSchedProvider}>
                          <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="google_meet">Google Meet</SelectItem>
                            <SelectItem value="zoom">Zoom</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Meeting URL (optional)</Label>
                        <Input value={schedUrl} onChange={e => setSchedUrl(e.target.value)} className="mt-1" placeholder="https://meet.google.com/…" />
                      </div>
                      <div>
                        <Label>Date & Time</Label>
                        <Input type="datetime-local" value={schedTime} onChange={e => setSchedTime(e.target.value)} className="mt-1" />
                      </div>
                      <Button onClick={handleSchedule} disabled={scheduleMeeting.isPending} className="w-full">
                        {scheduleMeeting.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                        Schedule
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>

              {scheduledCalls.length > 0 && (
                <div className="mt-4 space-y-2">
                  {scheduledCalls.slice(0, 5).map(sc => (
                    <div key={sc.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/30">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{sc.title}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Clock className="w-3 h-3" /> {format(new Date(sc.scheduled_time), "MMM d, h:mm a")}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 ml-4 shrink-0">
                        {sc.meeting_url && (
                          <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setJoinUrl(sc.meeting_url!)}>
                            <ExternalLink className="w-3 h-3" /> Join
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => cancelScheduled.mutate(sc.id)}>
                          <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
