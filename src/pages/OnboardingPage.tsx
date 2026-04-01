/**
 * OnboardingPage.tsx
 *
 * First-run experience for new users.
 * Triggered automatically from DashboardHome when:
 *   - profile.onboarding_complete is false/null
 *   - user has no calls yet
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CheckCircle2, Loader2, ArrowRight,
  Zap, Users, Calendar, Link2, SkipForward,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const STEPS = [
  {
    id: "platform",
    icon: Link2,
    title: "Connect your meeting platform",
    subtitle: "Fixsense joins as a bot and records both sides automatically.",
    color: "text-blue-400",
    bg: "bg-blue-500/10",
  },
  {
    id: "first_meeting",
    icon: Calendar,
    title: "Schedule or paste your first meeting link",
    subtitle: "We'll analyze it in real time and have insights ready when it ends.",
    color: "text-primary",
    bg: "bg-primary/10",
  },
  {
    id: "crm",
    icon: Zap,
    title: "Connect your CRM (optional)",
    subtitle: "Auto-log call summaries and action items to HubSpot or Salesforce.",
    color: "text-accent",
    bg: "bg-accent/10",
  },
  {
    id: "teammate",
    icon: Users,
    title: "Invite a teammate",
    subtitle: "Sales intelligence is more powerful with your whole team.",
    color: "text-green-400",
    bg: "bg-green-500/10",
  },
];

const PLATFORMS = [
  { id: "zoom",         label: "Zoom",              icon: "Z", color: "border-blue-500/40 bg-blue-500/10 text-blue-400" },
  { id: "google_meet",  label: "Google Meet",        icon: "G", color: "border-green-500/40 bg-green-500/10 text-green-400" },
  { id: "teams",        label: "Microsoft Teams",    icon: "T", color: "border-purple-500/40 bg-purple-500/10 text-purple-400" },
];

const CRMS = [
  { id: "hubspot",    label: "HubSpot" },
  { id: "salesforce", label: "Salesforce" },
  { id: "none",       label: "Skip for now" },
];

export default function OnboardingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [step, setStep]                       = useState(0);
  const [completed, setCompleted]             = useState<Set<number>>(new Set());
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);
  const [meetingUrl, setMeetingUrl]           = useState("");
  const [selectedCrm, setSelectedCrm]         = useState<string | null>(null);
  const [teammateEmail, setTeammateEmail]     = useState("");
  const [saving, setSaving]                   = useState(false);

  const markComplete = (idx: number) =>
    setCompleted(prev => new Set([...prev, idx]));

  const canProceed = () => {
    if (step === 0) return !!selectedPlatform;
    return true; // all other steps are optional
  };

  const handleNext = async () => {
    markComplete(step);
    if (step < STEPS.length - 1) {
      setStep(s => s + 1);
    } else {
      await finishOnboarding();
    }
  };

  const finishOnboarding = async () => {
    if (!user) return;
    setSaving(true);
    try {
      // Mark onboarding complete — use `as any` to handle projects where
      // the column may not yet be in the generated types
      const { error } = await supabase
        .from("profiles")
        .update({
          onboarding_complete: true,
          updated_at: new Date().toISOString(),
        } as any)
        .eq("id", user.id);

      if (error) {
        // Column might not exist yet — log but don't block the user
        console.warn("Could not update onboarding_complete:", error.message);
      }

      // Optionally invite a teammate
      if (teammateEmail.trim()) {
        try {
          await supabase.functions.invoke("invite-team-member", {
            body: { email: teammateEmail.trim() },
          });
        } catch (err) {
          console.warn("Invite failed — continuing anyway:", err);
        }
      }

      toast.success("You're all set! Let's start your first call.");
      navigate("/dashboard/live", { replace: true });
    } catch (err) {
      console.error("Onboarding finish error:", err);
      toast.error("Something went wrong. Taking you to the dashboard.");
      navigate("/dashboard", { replace: true });
    } finally {
      setSaving(false);
    }
  };

  const skip = () => {
    // Mark complete so they're not redirected back here
    if (user) {
      supabase
        .from("profiles")
        .update({ onboarding_complete: true, updated_at: new Date().toISOString() } as any)
        .eq("id", user.id)
        .then(({ error }) => {
          if (error) console.warn("Skip: could not mark onboarding complete:", error.message);
        });
    }
    navigate("/dashboard", { replace: true });
  };

  const progressPct = (completed.size / STEPS.length) * 100;

  return (
    <div className="min-h-screen bg-background flex flex-col">

      {/* ── Header ── */}
      <div className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg gradient-accent flex items-center justify-center">
            <Zap className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-display font-bold text-lg">Fixsense</span>
        </div>
        <button
          onClick={skip}
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
        >
          <SkipForward className="w-3 h-3" /> Skip setup
        </button>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-lg">

          {/* Progress bar */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground">
                Step {step + 1} of {STEPS.length}
              </span>
              <span className="text-xs font-medium text-muted-foreground">
                {Math.round(progressPct)}% complete
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${(step / STEPS.length) * 100}%` }}
              />
            </div>
          </div>

          {/* Step pills */}
          <div className="flex gap-2 mb-8">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              const isDone    = completed.has(i);
              const isCurrent = i === step;
              return (
                <button
                  key={s.id}
                  onClick={() => i <= step && setStep(i)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    isDone
                      ? "bg-success/10 text-success border border-success/20"
                      : isCurrent
                      ? "bg-primary/10 text-primary border border-primary/20"
                      : "bg-secondary text-muted-foreground border border-transparent"
                  }`}
                >
                  {isDone
                    ? <CheckCircle2 className="w-3 h-3" />
                    : <Icon className="w-3 h-3" />}
                  <span className="hidden sm:inline">{i + 1}</span>
                </button>
              );
            })}
          </div>

          {/* Step card */}
          <div className="glass rounded-2xl p-8">

            {/* Icon + title */}
            {(() => {
              const s    = STEPS[step];
              const Icon = s.icon;
              return (
                <div className="mb-6">
                  <div className={`w-12 h-12 rounded-xl ${s.bg} flex items-center justify-center mb-4`}>
                    <Icon className={`w-6 h-6 ${s.color}`} />
                  </div>
                  <h2 className="font-display font-bold text-xl mb-2">{s.title}</h2>
                  <p className="text-sm text-muted-foreground">{s.subtitle}</p>
                </div>
              );
            })()}

            {/* ── Step 0: Platform ── */}
            {step === 0 && (
              <div className="space-y-3 mb-6">
                {PLATFORMS.map(p => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedPlatform(p.id)}
                    className={`w-full flex items-center gap-3 p-4 rounded-xl border transition-all text-left ${
                      selectedPlatform === p.id
                        ? `${p.color} border-opacity-60`
                        : "border-border hover:border-border/80 bg-secondary/30"
                    }`}
                  >
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold shrink-0 ${
                      selectedPlatform === p.id ? p.color : "bg-secondary text-muted-foreground"
                    }`}>
                      {p.icon}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{p.label}</p>
                      <p className="text-xs text-muted-foreground">Connect with one click</p>
                    </div>
                    {selectedPlatform === p.id && (
                      <CheckCircle2 className="w-4 h-4 ml-auto text-success shrink-0" />
                    )}
                  </button>
                ))}
                {selectedPlatform && selectedPlatform !== "teams" && (
                  <p className="text-xs text-muted-foreground text-center">
                    Connect {selectedPlatform === "zoom" ? "Zoom" : "Google Calendar"} in Settings after setup.
                  </p>
                )}
                {selectedPlatform === "teams" && (
                  <p className="text-xs text-accent text-center">
                    Teams integration coming soon — you can still use manual capture.
                  </p>
                )}
              </div>
            )}

            {/* ── Step 1: Meeting link ── */}
            {step === 1 && (
              <div className="space-y-4 mb-6">
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 block">
                    Paste a meeting link (optional)
                  </label>
                  <Input
                    placeholder="https://meet.google.com/abc-def-ghi"
                    value={meetingUrl}
                    onChange={e => setMeetingUrl(e.target.value)}
                    className="h-11"
                  />
                </div>
                <div className="rounded-lg bg-secondary/50 border border-border p-3">
                  <p className="text-xs text-muted-foreground">
                    <span className="text-foreground font-medium">How it works:</span>{" "}
                    Fixsense joins your call as "Fixsense AI Recorder", visible to all
                    participants. It captures both sides and generates an AI summary the
                    moment the call ends.
                  </p>
                </div>
                <Button
                  variant="outline"
                  className="w-full gap-2"
                  onClick={() => {
                    if (meetingUrl.trim())
                      navigate(`/dashboard/live?url=${encodeURIComponent(meetingUrl)}`);
                    else
                      navigate("/dashboard/live");
                  }}
                >
                  <Link2 className="w-4 h-4" />
                  Go to Live Call page
                </Button>
              </div>
            )}

            {/* ── Step 2: CRM ── */}
            {step === 2 && (
              <div className="space-y-3 mb-6">
                {CRMS.map(crm => (
                  <button
                    key={crm.id}
                    onClick={() => setSelectedCrm(crm.id)}
                    className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all ${
                      selectedCrm === crm.id
                        ? "border-primary/40 bg-primary/5 text-primary"
                        : "border-border hover:border-border/80 bg-secondary/30"
                    }`}
                  >
                    <span className="text-sm font-medium">{crm.label}</span>
                    {selectedCrm === crm.id && (
                      <CheckCircle2 className="w-4 h-4 text-success" />
                    )}
                  </button>
                ))}
                {selectedCrm && selectedCrm !== "none" && (
                  <p className="text-xs text-muted-foreground text-center">
                    Connect {selectedCrm === "hubspot" ? "HubSpot" : "Salesforce"} in Settings → Integrations after setup.
                  </p>
                )}
              </div>
            )}

            {/* ── Step 3: Invite ── */}
            {step === 3 && (
              <div className="space-y-4 mb-6">
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 block">
                    Teammate's email (optional)
                  </label>
                  <Input
                    placeholder="colleague@yourcompany.com"
                    value={teammateEmail}
                    onChange={e => setTeammateEmail(e.target.value)}
                    type="email"
                    className="h-11"
                  />
                </div>
                <div className="rounded-lg bg-secondary/50 border border-border p-3 space-y-1">
                  <p className="text-xs font-medium text-foreground">Why invite your team?</p>
                  <ul className="space-y-1">
                    {[
                      "Managers see all reps' call analytics",
                      "Share coaching feedback on specific calls",
                      "Deal rooms for collaborative deal strategy",
                    ].map((item, i) => (
                      <li key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                        <CheckCircle2 className="w-3 h-3 text-success shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {/* ── Nav buttons ── */}
            <div className="flex items-center gap-3">
              {step > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setStep(s => s - 1)}
                  className="text-muted-foreground"
                >
                  Back
                </Button>
              )}
              <Button
                className="flex-1 gap-2 h-11"
                onClick={handleNext}
                disabled={!canProceed() || saving}
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : step === STEPS.length - 1 ? (
                  <>Go to dashboard <ArrowRight className="w-4 h-4" /></>
                ) : (
                  <>Continue <ArrowRight className="w-4 h-4" /></>
                )}
              </Button>
            </div>
          </div>

          <p className="text-center text-xs text-muted-foreground mt-4">
            Want to explore on your own?{" "}
            <button onClick={skip} className="text-primary hover:underline">
              Go straight to the dashboard
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}