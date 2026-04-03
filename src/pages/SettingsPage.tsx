import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { ExternalLink, Loader2, Shield, CheckCircle2, XCircle, RefreshCw, Users, Timer, Calendar, TrendingUp, ArrowUpRight, Clock } from "lucide-react";
import { useIntegrations, usePreferences, useUserProfile } from "@/hooks/useSettings";
import { useTeamUsage } from "@/hooks/useTeamUsage";
import { useMinuteUsage } from "@/hooks/useMinuteUsage";
import { formatMinutes } from "@/config/plans";
import { toast } from "sonner";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

const providerMeta: Record<string, { name: string; desc: string; icon: string; color: string }> = {
  zoom:         { name: "Zoom",            desc: "Connect Zoom to auto-join meetings and transcribe calls",        icon: "Z",  color: "bg-blue-500/20 text-blue-400" },
  google_meet:  { name: "Google Meet",     desc: "Record and transcribe Google Meet calls in real time",           icon: "G",  color: "bg-green-500/20 text-green-400" },
  teams:        { name: "Microsoft Teams", desc: "Full Teams integration with AI bot",                             icon: "T",  color: "bg-purple-500/20 text-purple-400" },
  salesforce:   { name: "Salesforce",      desc: "Auto-log calls and update deal stages in Salesforce",            icon: "S",  color: "bg-sky-500/20 text-sky-400" },
  hubspot:      { name: "HubSpot",         desc: "Sync call data, contacts and deals with HubSpot CRM",           icon: "H",  color: "bg-orange-500/20 text-orange-400" },
  slack:        { name: "Slack",           desc: "Get real-time notifications and post call summaries",            icon: "Sl", color: "bg-pink-500/20 text-pink-400" },
};
const PROVIDER_ORDER = ["zoom", "google_meet", "slack", "salesforce", "hubspot", "teams"];

export default function SettingsPage() {
  const navigate = useNavigate();
  const { integrations, isLoading: intLoading, connectProvider, disconnectProvider, isExpired } = useIntegrations();
  const { preferences, isLoading: prefLoading, updatePreference } = usePreferences();
  const { profile, isLoading: profileLoading, updateProfile } = useUserProfile();
  const { teamUsage } = useTeamUsage();
  const { usage, isLoading: usageLoading } = useMinuteUsage();

  const isLoading = intLoading || prefLoading || profileLoading;
  const isCrmConnected = integrations.some(i => (i.provider === "salesforce" || i.provider === "hubspot") && i.status === "connected");

  const handleTogglePref = (key: string, value: boolean) => {
    if (key === "crm_auto_sync" && value && !isCrmConnected) { toast.error("Connect Salesforce or HubSpot first"); return; }
    updatePreference.mutate({ [key]: value });
  };

  if (isLoading) return (
    <DashboardLayout>
      <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
    </DashboardLayout>
  );

  const hoursUsed  = usage ? (usage.minutesUsed / 60).toFixed(1) : "0.0";
  const hoursLimit = usage && !usage.isUnlimited ? (usage.minuteLimit / 60).toFixed(0) : null;
  const hoursLeft  = usage && !usage.isUnlimited ? Math.max(0, (usage.minutesRemaining as number) / 60).toFixed(1) : null;

  const prefItems = [
    { key: "auto_join_meetings",          label: "Auto-join meetings",           desc: "AI bot automatically joins scheduled meetings",                      value: preferences?.auto_join_meetings ?? false },
    { key: "real_time_objection_alerts",  label: "Real-time objection alerts",   desc: "Get notified when objections are detected during a call",            value: preferences?.real_time_objection_alerts ?? true },
    { key: "post_call_email_summary",     label: "Post-call email summary",      desc: "Receive an AI-generated summary via email after each call",          value: preferences?.post_call_email_summary ?? true },
    { key: "crm_auto_sync",               label: "CRM auto-sync",                desc: "Automatically log calls and update deal stages in your CRM",         value: preferences?.crm_auto_sync ?? false, disabled: !isCrmConnected },
  ];

  const intMap = new Map(integrations.map(i => [i.provider, i]));
  const sorted = [
    ...PROVIDER_ORDER.map(p => intMap.get(p)).filter(Boolean),
    ...integrations.filter(i => !PROVIDER_ORDER.includes(i.provider)),
  ] as typeof integrations;

  const getStatus = (int: typeof integrations[0]) => int.status === "connected" && isExpired(int) ? "expired" : int.status;

  return (
    <DashboardLayout>
      <div className="space-y-8 max-w-3xl">
        <div>
          <h1 className="text-2xl font-bold font-display">Settings</h1>
          <p className="text-sm text-muted-foreground">Manage your integrations, preferences, and account</p>
        </div>

        {/* ── Usage Overview ──────────────────────────────────────────────── */}
        <section>
          <h2 className="font-display font-semibold mb-4">Usage Overview</h2>
          <div className="glass rounded-xl p-5 space-y-5">
            {/* Plan header */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold capitalize flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  {usage?.planName || profile?.plan_type || "Free"} Plan
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {usage
                    ? usage.isUnlimited
                      ? `${hoursUsed}h of call minutes used · Unlimited`
                      : `${hoursUsed}h of ${hoursLimit}h call minutes used this month`
                    : `${profile?.calls_used ?? 0} / ${profile?.calls_limit ?? 5} calls used`}
                </p>
              </div>
              <Button size="sm" variant="default" onClick={() => navigate("/dashboard/billing")}>
                {usage?.isAtLimit ? "Upgrade Now" : "Manage Plan"}
              </Button>
            </div>

            {/* Call minutes bar */}
            {usage && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Timer className="w-3.5 h-3.5" /> Call Minutes This Month
                  </span>
                  <span className={cn("text-xs font-semibold",
                    usage.isAtLimit ? "text-destructive" : usage.isNearLimit ? "text-amber-500" : "text-foreground")}>
                    {usage.isUnlimited ? `${hoursUsed}h · Unlimited` : `${hoursUsed}h / ${hoursLimit}h`}
                  </span>
                </div>
                {!usage.isUnlimited ? (
                  <>
                    <Progress value={usage.pct} className={cn("h-2",
                      usage.isAtLimit ? "[&>div]:bg-destructive" : usage.isNearLimit ? "[&>div]:bg-amber-500" : "")} />
                    <div className="flex justify-between mt-1.5">
                      <span className="text-xs text-muted-foreground">{hoursLeft}h remaining · {formatMinutes(usage.minutesUsed)} used</span>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Calendar className="w-3 h-3" />Resets {format(usage.resetDate, "MMM d")}
                      </span>
                    </div>
                    {usage.isAtLimit && (
                      <div className="mt-2 p-2.5 rounded-lg bg-destructive/10 border border-destructive/20">
                        <p className="text-xs text-destructive font-medium">
                          Monthly call-minute limit reached.{" "}
                          <button onClick={() => navigate("/dashboard/billing")} className="underline">Upgrade your plan</button>{" "}
                          to continue recording calls.
                        </p>
                      </div>
                    )}
                    {usage.isNearLimit && !usage.isAtLimit && (
                      <div className="mt-2 flex items-center gap-1">
                        <p className="text-xs text-amber-500">{hoursLeft}h of call minutes remaining.</p>
                        <button onClick={() => navigate("/dashboard/billing")} className="text-xs text-amber-500 hover:underline flex items-center gap-0.5">
                          Upgrade <ArrowUpRight className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-primary font-medium mt-1">No minute limits on Scale plan · fair use applies above 333h</p>
                )}
              </div>
            )}

            {/* Meetings count */}
            {usage && (
              <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-secondary/30 border border-border">
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><Clock className="w-3.5 h-3.5" />Meetings this month</div>
                <span className="text-xs font-semibold text-foreground">
                  {usage.meetingsUsed}{usage.meetingLimit > 0 && usage.meetingLimit !== -1 ? ` / ${usage.meetingLimit}` : ""}
                </span>
              </div>
            )}

            {/* Team members */}
            {teamUsage && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-muted-foreground flex items-center gap-1.5"><Users className="w-3.5 h-3.5" />Team Members</span>
                  <span className="text-xs font-semibold text-foreground">{teamUsage.membersUsed} / {teamUsage.isUnlimited ? "∞" : teamUsage.membersLimit}</span>
                </div>
                <Progress value={teamUsage.isUnlimited ? 0 : teamUsage.membersPct} className={cn("h-2",
                  teamUsage.isAtLimit ? "[&>div]:bg-destructive" : teamUsage.isNearLimit ? "[&>div]:bg-amber-500" : "")} />
                {teamUsage.isAtLimit && <p className="text-xs text-destructive mt-1.5 font-medium">Team member limit reached. Upgrade to add more.</p>}
                {teamUsage.isNearLimit && !teamUsage.isAtLimit && (
                  <p className="text-xs text-amber-500 mt-1.5">{teamUsage.membersUsed} of {teamUsage.membersLimit} seats used. Consider upgrading.</p>
                )}
              </div>
            )}
          </div>
        </section>

        {/* ── Integrations ────────────────────────────────────────────────── */}
        <section>
          <h2 className="font-display font-semibold mb-1">Integrations</h2>
          <p className="text-xs text-muted-foreground mb-4">Connect your meeting and CRM tools to unlock AI-powered call analysis.</p>
          <div className="space-y-3">
            {sorted.map(int => {
              const meta = providerMeta[int.provider] ?? { name: int.provider, desc: "", icon: "?", color: "bg-muted text-muted-foreground" };
              const st = getStatus(int);
              const isPlaceholder = int.id.startsWith("placeholder-");
              return (
                <div key={int.provider} className="glass rounded-xl p-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold shrink-0", meta.color)}>{meta.icon}</div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{meta.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{meta.desc}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {st === "connected" && (
                      <>
                        <Button variant="outline" size="sm" className="gap-1.5 border-primary/30 text-primary hover:text-primary" disabled={disconnectProvider.isPending} onClick={() => disconnectProvider.mutate(int.provider)}>
                          <CheckCircle2 className="w-3 h-3" /> Connected
                        </Button>
                        <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive px-2" disabled={disconnectProvider.isPending} onClick={() => disconnectProvider.mutate(int.provider)} title="Disconnect">
                          <XCircle className="w-3.5 h-3.5" />
                        </Button>
                      </>
                    )}
                    {st === "expired" && (
                      <Button variant="outline" size="sm" className="gap-1.5 border-destructive/40 text-destructive hover:text-destructive" disabled={connectProvider.isPending} onClick={() => connectProvider.mutate(int.provider)}>
                        <RefreshCw className="w-3 h-3" /> Reconnect
                      </Button>
                    )}
                    {(st === "disconnected" || isPlaceholder) && (
                      <Button variant="default" size="sm" className="gap-1.5" disabled={connectProvider.isPending} onClick={() => connectProvider.mutate(int.provider)}>
                        Connect <ExternalLink className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Preferences ─────────────────────────────────────────────────── */}
        <section>
          <h2 className="font-display font-semibold mb-4">Preferences</h2>
          <div className="glass rounded-xl divide-y divide-border">
            {prefItems.map(pref => (
              <div key={pref.key} className="flex items-center justify-between p-4 gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{pref.label}</p>
                  <p className="text-xs text-muted-foreground">{pref.desc}</p>
                  {pref.disabled && <p className="text-xs text-destructive mt-1">Requires Salesforce or HubSpot connection</p>}
                </div>
                <Switch checked={pref.value} disabled={pref.disabled} onCheckedChange={v => handleTogglePref(pref.key, v)} />
              </div>
            ))}
          </div>
        </section>

        {/* ── Security ─────────────────────────────────────────────────────── */}
        <section>
          <h2 className="font-display font-semibold mb-4">Security & Compliance</h2>
          <div className="glass rounded-xl p-5 space-y-4">
            <div className="grid sm:grid-cols-3 gap-4">
              <div><p className="text-xs text-muted-foreground">Encryption</p><p className="text-sm font-medium text-primary">AES-256 at rest, TLS in transit</p></div>
              <div><p className="text-xs text-muted-foreground">SOC2</p><p className="text-sm font-medium text-primary">Certified</p></div>
              <div><p className="text-xs text-muted-foreground">GDPR</p><p className="text-sm font-medium text-primary">{profile?.gdpr_consent ? "Consent Given" : "Pending"}</p></div>
            </div>
            <div className="flex items-center justify-between pt-3 border-t border-border">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">GDPR Data Consent</p>
                  <p className="text-xs text-muted-foreground">Allow AI processing of your call data</p>
                </div>
              </div>
              <Switch checked={profile?.gdpr_consent ?? false} onCheckedChange={v => updateProfile.mutate({ gdpr_consent: v })} />
            </div>
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}