import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ExternalLink, Loader2, Shield, CheckCircle2, XCircle, RefreshCw } from "lucide-react";
import { useIntegrations, usePreferences, useUserProfile } from "@/hooks/useSettings";
import { toast } from "sonner";

const providerMeta: Record<string, { name: string; desc: string; icon: string }> = {
  zoom: { name: "Zoom", desc: "Connect Zoom to auto-join meetings", icon: "Z" },
  google_meet: { name: "Google Meet", desc: "Record and transcribe Google Meet calls", icon: "G" },
  teams: { name: "Microsoft Teams", desc: "Full Teams integration with AI bot", icon: "T" },
  salesforce: { name: "Salesforce", desc: "Auto-log calls and update deal stages", icon: "S" },
  hubspot: { name: "HubSpot", desc: "Sync call data with HubSpot CRM", icon: "H" },
  slack: { name: "Slack", desc: "Get real-time notifications for insights", icon: "Sl" },
};

export default function SettingsPage() {
  const { integrations, isLoading: intLoading, connectProvider, disconnectProvider, isExpired } = useIntegrations();
  const { preferences, isLoading: prefLoading, updatePreference } = usePreferences();
  const { profile, isLoading: profileLoading, updateProfile } = useUserProfile();

  const isLoading = intLoading || prefLoading || profileLoading;

  const isCrmConnected = integrations.some(
    (i) => (i.provider === "salesforce" || i.provider === "hubspot") && i.status === "connected"
  );

  const handleTogglePreference = (key: string, value: boolean) => {
    if (key === "crm_auto_sync" && value && !isCrmConnected) {
      toast.error("Connect Salesforce or HubSpot first to enable CRM sync");
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
    { key: "auto_join_meetings", label: "Auto-join meetings", desc: "AI bot automatically joins scheduled meetings", value: preferences?.auto_join_meetings ?? false },
    { key: "real_time_objection_alerts", label: "Real-time objection alerts", desc: "Get notified when objections are detected", value: preferences?.real_time_objection_alerts ?? true },
    { key: "post_call_email_summary", label: "Post-call email summary", desc: "Receive call summary via email after each call", value: preferences?.post_call_email_summary ?? true },
    { key: "crm_auto_sync", label: "CRM auto-sync", desc: "Automatically log calls and update deal stages", value: preferences?.crm_auto_sync ?? false, disabled: !isCrmConnected },
  ];

  const getIntegrationStatus = (int: { status: string; expires_at: string | null }) => {
    if (int.status === "connected" && int.expires_at && isExpired(int as any)) {
      return "expired";
    }
    return int.status;
  };

  return (
    <DashboardLayout>
      <div className="space-y-8 max-w-3xl">
        <div>
          <h1 className="text-2xl font-bold font-display">Settings</h1>
          <p className="text-sm text-muted-foreground">Manage your integrations and preferences</p>
        </div>

        {/* Plan Usage */}
        <section>
          <h2 className="font-display font-semibold mb-4">Plan & Usage</h2>
          <div className="glass rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm font-medium capitalize">{profile?.plan_type || "free"} Plan</p>
                <p className="text-xs text-muted-foreground">
                  {profile?.calls_used ?? 0} / {profile?.calls_limit ?? 5} calls used this period
                </p>
              </div>
              <Button size="sm" variant="default">Upgrade to Pro</Button>
            </div>
            <div className="h-1.5 rounded-full bg-muted">
              <div
                className="h-1.5 rounded-full bg-primary transition-all"
                style={{ width: `${Math.min(((profile?.calls_used ?? 0) / (profile?.calls_limit ?? 5)) * 100, 100)}%` }}
              />
            </div>
          </div>
        </section>

        {/* Integrations */}
        <section>
          <h2 className="font-display font-semibold mb-4">Integrations</h2>
          <div className="space-y-3">
            {integrations.map((int) => {
              const meta = providerMeta[int.provider] || { name: int.provider, desc: "", icon: "?" };
              const status = getIntegrationStatus(int);
              const isConnecting = connectProvider.isPending;
              const isDisconnecting = disconnectProvider.isPending;

              return (
                <div key={int.id} className="glass rounded-xl p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center text-sm font-bold text-muted-foreground">
                      {meta.icon}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{meta.name}</p>
                      <p className="text-xs text-muted-foreground">{meta.desc}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {status === "connected" && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                          disabled={isDisconnecting}
                          onClick={() => disconnectProvider.mutate(int.provider)}
                        >
                          <CheckCircle2 className="w-3 h-3 text-primary" />
                          Connected
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          disabled={isDisconnecting}
                          onClick={() => disconnectProvider.mutate(int.provider)}
                        >
                          <XCircle className="w-3.5 h-3.5" />
                        </Button>
                      </>
                    )}
                    {status === "expired" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 border-destructive/50 text-destructive"
                        disabled={isConnecting}
                        onClick={() => connectProvider.mutate(int.provider)}
                      >
                        <RefreshCw className="w-3 h-3" />
                        Reconnect
                      </Button>
                    )}
                    {status === "disconnected" && (
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
            {integrations.length === 0 && (
              <p className="text-sm text-muted-foreground">No integrations found. They will be created automatically on next login.</p>
            )}
          </div>
        </section>

        {/* Preferences */}
        <section>
          <h2 className="font-display font-semibold mb-4">Preferences</h2>
          <div className="glass rounded-xl divide-y divide-border">
            {prefItems.map((pref) => (
              <div key={pref.key} className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm font-medium">{pref.label}</p>
                  <p className="text-xs text-muted-foreground">{pref.desc}</p>
                  {pref.disabled && (
                    <p className="text-xs text-destructive mt-1">Requires Salesforce or HubSpot connection</p>
                  )}
                </div>
                <Switch
                  checked={pref.value}
                  disabled={pref.disabled}
                  onCheckedChange={(checked) => handleTogglePreference(pref.key, checked)}
                />
              </div>
            ))}
          </div>
        </section>

        {/* Security */}
        <section>
          <h2 className="font-display font-semibold mb-4">Security & Compliance</h2>
          <div className="glass rounded-xl p-5 space-y-4">
            <div className="grid sm:grid-cols-3 gap-4">
              {[
                { label: "Encryption", status: "AES-256 at rest, TLS in transit" },
                { label: "SOC2", status: "Certified" },
              ].map((s) => (
                <div key={s.label}>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className="text-sm font-medium text-primary">{s.status}</p>
                </div>
              ))}
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
                  <p className="text-xs text-muted-foreground">Allow AI processing of your call data</p>
                </div>
              </div>
              <Switch
                checked={profile?.gdpr_consent ?? false}
                onCheckedChange={(checked) => updateProfile.mutate({ gdpr_consent: checked })}
              />
            </div>
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}
