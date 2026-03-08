import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ExternalLink, Loader2, Shield, CheckCircle2, XCircle, RefreshCw, Users } from "lucide-react";
import { useIntegrations, usePreferences, useUserProfile } from "@/hooks/useSettings";
import { useTeamUsage } from "@/hooks/useTeamUsage";
import { toast } from "sonner";

// ─── Provider metadata ────────────────────────────────────────────────────────
const providerMeta: Record<
  string,
  { name: string; desc: string; icon: string; color: string }
> = {
  zoom: {
    name: "Zoom",
    desc: "Connect Zoom to auto-join meetings and transcribe calls",
    icon: "Z",
    color: "bg-blue-500/20 text-blue-400",
  },
  google_meet: {
    name: "Google Meet",
    desc: "Record and transcribe Google Meet calls in real time",
    icon: "G",
    color: "bg-green-500/20 text-green-400",
  },
  teams: {
    name: "Microsoft Teams",
    desc: "Full Teams integration with AI bot",
    icon: "T",
    color: "bg-purple-500/20 text-purple-400",
  },
  salesforce: {
    name: "Salesforce",
    desc: "Auto-log calls and update deal stages in Salesforce",
    icon: "S",
    color: "bg-sky-500/20 text-sky-400",
  },
  hubspot: {
    name: "HubSpot",
    desc: "Sync call data, contacts and deals with HubSpot CRM",
    icon: "H",
    color: "bg-orange-500/20 text-orange-400",
  },
  slack: {
    name: "Slack",
    desc: "Get real-time notifications and post call summaries",
    icon: "Sl",
    color: "bg-pink-500/20 text-pink-400",
  },
};

// Canonical display order
const PROVIDER_ORDER = [
  "zoom",
  "google_meet",
  "slack",
  "salesforce",
  "hubspot",
  "teams",
];

export default function SettingsPage() {
  const {
    integrations,
    isLoading: intLoading,
    connectProvider,
    disconnectProvider,
    isExpired,
  } = useIntegrations();
  const { preferences, isLoading: prefLoading, updatePreference } =
    usePreferences();
  const { profile, isLoading: profileLoading, updateProfile } =
    useUserProfile();
  const { teamUsage } = useTeamUsage();

  const isLoading = intLoading || prefLoading || profileLoading;

  const isCrmConnected = integrations.some(
    (i) =>
      (i.provider === "salesforce" || i.provider === "hubspot") &&
      i.status === "connected"
  );

  const handleTogglePreference = (key: string, value: boolean) => {
    if (key === "crm_auto_sync" && value && !isCrmConnected) {
      toast.error(
        "Connect Salesforce or HubSpot first to enable CRM sync"
      );
      return;
    }
    updatePreference.mutate({ [key]: value });
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

  const prefItems = [
    {
      key: "auto_join_meetings",
      label: "Auto-join meetings",
      desc: "AI bot automatically joins scheduled meetings",
      value: preferences?.auto_join_meetings ?? false,
    },
    {
      key: "real_time_objection_alerts",
      label: "Real-time objection alerts",
      desc: "Get notified when objections are detected during a call",
      value: preferences?.real_time_objection_alerts ?? true,
    },
    {
      key: "post_call_email_summary",
      label: "Post-call email summary",
      desc: "Receive an AI-generated summary via email after each call",
      value: preferences?.post_call_email_summary ?? true,
    },
    {
      key: "crm_auto_sync",
      label: "CRM auto-sync",
      desc: "Automatically log calls and update deal stages in your CRM",
      value: preferences?.crm_auto_sync ?? false,
      disabled: !isCrmConnected,
    },
  ];

  // Build a map for quick lookup and ensure display order
  const integrationMap = new Map(
    integrations.map((i) => [i.provider, i])
  );

  // Sort integrations: ordered providers first, then any extras
  const sortedIntegrations = [
    ...PROVIDER_ORDER.map((p) => integrationMap.get(p)).filter(Boolean),
    ...integrations.filter((i) => !PROVIDER_ORDER.includes(i.provider)),
  ] as typeof integrations;

  const getStatus = (int: (typeof integrations)[0]) => {
    if (int.status === "connected" && isExpired(int)) return "expired";
    return int.status;
  };

  return (
    <DashboardLayout>
      <div className="space-y-8 max-w-3xl">
        <div>
          <h1 className="text-2xl font-bold font-display">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Manage your integrations, preferences, and account
          </p>
        </div>

        {/* ── Plan Usage ──────────────────────────────────────────────────── */}
        <section>
          <h2 className="font-display font-semibold mb-4">Plan & Usage</h2>
          <div className="glass rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium capitalize">
                  {profile?.plan_type || "free"} Plan
                </p>
                <p className="text-xs text-muted-foreground">
                  {profile?.calls_used ?? 0} /{" "}
                  {profile?.calls_limit ?? 5} calls used this period
                </p>
              </div>
              <Button size="sm" variant="default">
                Upgrade to Pro
              </Button>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">Meetings</span>
                <span className="text-xs font-medium">{profile?.calls_used ?? 0} / {profile?.calls_limit ?? 5}</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted">
                <div
                  className="h-1.5 rounded-full bg-primary transition-all"
                  style={{
                    width: `${Math.min(
                      ((profile?.calls_used ?? 0) /
                        (profile?.calls_limit ?? 5)) *
                        100,
                      100
                    )}%`,
                  }}
                />
              </div>
            </div>
            {teamUsage && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Users className="w-3 h-3" /> Team Members
                  </span>
                  <span className="text-xs font-medium">
                    {teamUsage.membersUsed} / {teamUsage.isUnlimited ? "∞" : teamUsage.membersLimit}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-muted">
                  <div
                    className={`h-1.5 rounded-full transition-all ${teamUsage.isAtLimit ? "bg-destructive" : teamUsage.isNearLimit ? "bg-accent" : "bg-primary"}`}
                    style={{ width: `${teamUsage.isUnlimited ? 0 : teamUsage.membersPct}%` }}
                  />
                </div>
                {teamUsage.isAtLimit && (
                  <p className="text-xs text-destructive mt-1.5 font-medium">
                    Team member limit reached. Upgrade to add more.
                  </p>
                )}
                {teamUsage.isNearLimit && (
                  <p className="text-xs text-accent mt-1.5 font-medium">
                    Using {teamUsage.membersUsed} of {teamUsage.membersLimit} seats. Consider upgrading.
                  </p>
                )}
              </div>
            )}
          </div>
        </section>

        {/* ── Integrations ────────────────────────────────────────────────── */}
        <section>
          <h2 className="font-display font-semibold mb-1">Integrations</h2>
          <p className="text-xs text-muted-foreground mb-4">
            Connect your meeting and CRM tools to unlock AI-powered call
            analysis.
          </p>

          <div className="space-y-3">
            {sortedIntegrations.map((int) => {
              const meta = providerMeta[int.provider] ?? {
                name: int.provider,
                desc: "",
                icon: "?",
                color: "bg-muted text-muted-foreground",
              };
              const status = getStatus(int);
              const isConnecting = connectProvider.isPending;
              const isDisconnecting = disconnectProvider.isPending;
              const isPlaceholder = int.id.startsWith("placeholder-");

              return (
                <div
                  key={int.provider}
                  className="glass rounded-xl p-4 flex items-center justify-between gap-4"
                >
                  {/* Icon + info */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold shrink-0 ${meta.color}`}
                    >
                      {meta.icon}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{meta.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {meta.desc}
                      </p>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-2 shrink-0">
                    {status === "connected" && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5 border-primary/30 text-primary hover:text-primary"
                          disabled={isDisconnecting}
                          onClick={() =>
                            disconnectProvider.mutate(int.provider)
                          }
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          Connected
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground hover:text-destructive px-2"
                          disabled={isDisconnecting}
                          onClick={() =>
                            disconnectProvider.mutate(int.provider)
                          }
                          title="Disconnect"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                        </Button>
                      </>
                    )}

                    {status === "expired" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 border-destructive/40 text-destructive hover:text-destructive"
                        disabled={isConnecting}
                        onClick={() => connectProvider.mutate(int.provider)}
                      >
                        <RefreshCw className="w-3 h-3" />
                        Reconnect
                      </Button>
                    )}

                    {(status === "disconnected" || isPlaceholder) && (
                      <Button
                        variant="default"
                        size="sm"
                        className="gap-1.5"
                        disabled={isConnecting}
                        onClick={() => connectProvider.mutate(int.provider)}
                      >
                        Connect
                        <ExternalLink className="w-3 h-3" />
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
            {prefItems.map((pref) => (
              <div
                key={pref.key}
                className="flex items-center justify-between p-4 gap-4"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{pref.label}</p>
                  <p className="text-xs text-muted-foreground">{pref.desc}</p>
                  {pref.disabled && (
                    <p className="text-xs text-destructive mt-1">
                      Requires Salesforce or HubSpot connection
                    </p>
                  )}
                </div>
                <Switch
                  checked={pref.value}
                  disabled={pref.disabled}
                  onCheckedChange={(checked) =>
                    handleTogglePreference(pref.key, checked)
                  }
                />
              </div>
            ))}
          </div>
        </section>

        {/* ── Security & Compliance ────────────────────────────────────────── */}
        <section>
          <h2 className="font-display font-semibold mb-4">
            Security & Compliance
          </h2>
          <div className="glass rounded-xl p-5 space-y-4">
            <div className="grid sm:grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Encryption</p>
                <p className="text-sm font-medium text-primary">
                  AES-256 at rest, TLS in transit
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">SOC2</p>
                <p className="text-sm font-medium text-primary">Certified</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">GDPR</p>
                <p className="text-sm font-medium text-primary">
                  {profile?.gdpr_consent ? "Consent Given" : "Pending"}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-between pt-3 border-t border-border">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">GDPR Data Consent</p>
                  <p className="text-xs text-muted-foreground">
                    Allow AI processing of your call data
                  </p>
                </div>
              </div>
              <Switch
                checked={profile?.gdpr_consent ?? false}
                onCheckedChange={(checked) =>
                  updateProfile.mutate({ gdpr_consent: checked })
                }
              />
            </div>
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}