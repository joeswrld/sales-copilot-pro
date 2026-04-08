import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import {
  ExternalLink, Loader2, Shield, CheckCircle2, XCircle,
  RefreshCw, Users, Timer, Calendar, TrendingUp, ArrowUpRight,
  Clock, Zap, Link2,
} from "lucide-react";
import { usePreferences, useUserProfile } from "@/hooks/useSettings";
import { useTeamUsage } from "@/hooks/useTeamUsage";
import { useMinuteUsage } from "@/hooks/useMinuteUsage";
import { formatMinutes } from "@/config/plans";
import { toast } from "sonner";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { PushNotificationToggle } from "@/components/PWABanner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

// ─── Types ─────────────────────────────────────────────────────────────────

interface Integration {
  id: string;
  user_id: string;
  provider: string;
  status: string;
  account_email?: string | null;
  expires_at?: string | null;
}

// ─── Provider metadata ──────────────────────────────────────────────────────

const INTEGRATIONS = [
  {
    id: "google_calendar",
    name: "Google Calendar",
    description: "Sync events, auto-create calls, and attach Fixsense meeting links.",
    logo: (
      <svg viewBox="0 0 48 48" width="22" height="22" xmlns="http://www.w3.org/2000/svg">
        <rect x="6" y="6" width="36" height="36" rx="4" fill="#fff" />
        <rect x="6" y="6" width="36" height="36" rx="4" fill="none" stroke="#E8EAED" strokeWidth="1.5" />
        <path d="M33 10V6h-2v4H17V6h-2v4H6v28h36V10H33zm2 26H13V18h22v18z" fill="#4285F4" />
        <text x="24" y="33" textAnchor="middle" fontSize="12" fontWeight="700" fill="#4285F4" fontFamily="sans-serif">
          {new Date().getDate()}
        </text>
      </svg>
    ),
    accentColor: "#4285F4",
    accentBg: "rgba(66,133,244,.08)",
    accentBorder: "rgba(66,133,244,.18)",
    features: ["Sync events → calls", "Auto-join meetings", "Attach meet links"],
  },
  {
    id: "hubspot",
    name: "HubSpot CRM",
    description: "Sync contacts and deals, then push AI call summaries automatically.",
    logo: (
      <svg viewBox="0 0 48 48" width="22" height="22" xmlns="http://www.w3.org/2000/svg">
        <circle cx="24" cy="24" r="22" fill="#FF7A59" />
        <path d="M28 18v-4.5a2.5 2.5 0 1 0-5 0V18H15v5h8v4.5a2.5 2.5 0 1 0 5 0V23h8v-5h-8z" fill="#fff" />
      </svg>
    ),
    accentColor: "#FF7A59",
    accentBg: "rgba(255,122,89,.08)",
    accentBorder: "rgba(255,122,89,.18)",
    features: ["Contact + deal sync", "Auto-log calls", "Push summaries"],
  },
];

// ─── Integration Card ───────────────────────────────────────────────────────

function IntegrationCard({
  provider,
  integration,
  onConnect,
  onDisconnect,
  isPending,
}: {
  provider: typeof INTEGRATIONS[0];
  integration?: Integration;
  onConnect: (id: string) => void;
  onDisconnect: (id: string) => void;
  isPending: boolean;
}) {
  const isConnected = integration?.status === "connected";
  const isExpired =
    integration?.expires_at && new Date(integration.expires_at) < new Date();
  const needsReconnect = isExpired && isConnected;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "16px 20px",
        borderRadius: 14,
        background: isConnected
          ? `${provider.accentBg}`
          : "rgba(255,255,255,.025)",
        border: `1px solid ${isConnected ? provider.accentBorder : "rgba(255,255,255,.07)"}`,
        transition: "all .18s ease",
      }}
    >
      {/* Logo */}
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 11,
          background: "rgba(255,255,255,.06)",
          border: "1px solid rgba(255,255,255,.08)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {provider.logo}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
          <span
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: "#f0f6fc",
              fontFamily: "'Bricolage Grotesque', sans-serif",
            }}
          >
            {provider.name}
          </span>

          {/* Status badge */}
          {isConnected && !needsReconnect && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: 10,
                fontWeight: 700,
                color: "#22c55e",
                background: "rgba(34,197,94,.1)",
                border: "1px solid rgba(34,197,94,.22)",
                borderRadius: 20,
                padding: "2px 8px",
              }}
            >
              <span
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: "50%",
                  background: "#22c55e",
                  display: "inline-block",
                }}
              />
              Connected
            </span>
          )}
          {needsReconnect && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: 10,
                fontWeight: 700,
                color: "#f59e0b",
                background: "rgba(245,158,11,.1)",
                border: "1px solid rgba(245,158,11,.22)",
                borderRadius: 20,
                padding: "2px 8px",
              }}
            >
              Token expired
            </span>
          )}
        </div>

        <p
          style={{
            margin: "0 0 8px",
            fontSize: 12,
            color: "rgba(255,255,255,.42)",
            lineHeight: 1.5,
          }}
        >
          {provider.description}
        </p>

        {/* Feature pills */}
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {provider.features.map((f) => (
            <span
              key={f}
              style={{
                fontSize: 10,
                color: isConnected
                  ? provider.accentColor
                  : "rgba(255,255,255,.3)",
                background: isConnected
                  ? provider.accentBg
                  : "rgba(255,255,255,.03)",
                border: `1px solid ${isConnected ? provider.accentBorder : "rgba(255,255,255,.06)"}`,
                borderRadius: 20,
                padding: "2px 8px",
              }}
            >
              {f}
            </span>
          ))}
        </div>
      </div>

      {/* Action button */}
      <div style={{ flexShrink: 0 }}>
        {isConnected && !needsReconnect ? (
          <button
            onClick={() => onDisconnect(provider.id)}
            disabled={isPending}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              padding: "7px 14px",
              background: "transparent",
              border: "1px solid rgba(239,68,68,.3)",
              borderRadius: 9,
              color: "#f87171",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
              transition: "all .13s",
              opacity: isPending ? 0.5 : 1,
            }}
          >
            <XCircle style={{ width: 12, height: 12 }} />
            Disconnect
          </button>
        ) : needsReconnect ? (
          <button
            onClick={() => onConnect(provider.id)}
            disabled={isPending}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              padding: "7px 14px",
              background: "rgba(245,158,11,.12)",
              border: "1px solid rgba(245,158,11,.3)",
              borderRadius: 9,
              color: "#fbbf24",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
              opacity: isPending ? 0.5 : 1,
            }}
          >
            <RefreshCw style={{ width: 12, height: 12 }} />
            Reconnect
          </button>
        ) : (
          <button
            onClick={() => onConnect(provider.id)}
            disabled={isPending}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              padding: "8px 16px",
              background: `linear-gradient(135deg, ${provider.accentColor}, ${provider.accentColor}cc)`,
              border: "none",
              borderRadius: 9,
              color: "#fff",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "inherit",
              boxShadow: `0 4px 14px ${provider.accentColor}30`,
              transition: "all .13s",
              opacity: isPending ? 0.5 : 1,
            }}
          >
            <Link2 style={{ width: 12, height: 12 }} />
            Connect
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main Settings Page ─────────────────────────────────────────────────────

export default function SettingsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { preferences, isLoading: prefLoading, updatePreference } = usePreferences();
  const { profile, isLoading: profileLoading, updateProfile } = useUserProfile();
  const { teamUsage } = useTeamUsage();
  const { usage, isLoading: usageLoading } = useMinuteUsage();

  // ── Fetch only google_calendar + hubspot integrations ──────────────────
  const { data: integrations = [], isLoading: intLoading } = useQuery({
    queryKey: ["settings-integrations", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      // Ensure rows exist
      await supabase
        .from("integrations")
        .upsert(
          [
            { user_id: user.id, provider: "google_calendar", status: "disconnected" },
            { user_id: user.id, provider: "hubspot", status: "disconnected" },
          ],
          { onConflict: "user_id,provider", ignoreDuplicates: true }
        );
      const { data } = await supabase
        .from("integrations")
        .select("*")
        .eq("user_id", user.id)
        .in("provider", ["google_calendar", "hubspot"]);
      return (data || []) as Integration[];
    },
    enabled: !!user?.id,
    staleTime: 15_000,
  });

  const intMap = new Map(integrations.map((i) => [i.provider, i]));

  // ── Connect ────────────────────────────────────────────────────────────
  const connectMutation = useMutation({
    mutationFn: async (provider: string) => {
      const redirectUri = `${window.location.origin}/dashboard/settings`;
      const { data, error } = await supabase.functions.invoke("oauth-connect", {
        body: { provider, redirect_uri: redirectUri },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as { url: string };
    },
    onSuccess: (data) => {
      const w = 560, h = 680;
      window.open(
        data.url,
        "oauth-popup",
        `width=${w},height=${h},left=${(window.innerWidth - w) / 2},top=${(window.innerHeight - h) / 2},popup=1`
      );
    },
    onError: (e: any) =>
      toast.error(e.message || "Failed to start OAuth flow"),
  });

  // ── Disconnect ─────────────────────────────────────────────────────────
  const disconnectMutation = useMutation({
    mutationFn: async (provider: string) => {
      const { error } = await supabase.functions.invoke("oauth-disconnect", {
        body: { provider },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings-integrations"] });
      toast.success("Integration disconnected");
    },
    onError: (e: any) => toast.error(e.message || "Failed to disconnect"),
  });

  // ── Listen for OAuth popup postMessage ─────────────────────────────────
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === "oauth-success") {
        qc.invalidateQueries({ queryKey: ["settings-integrations"] });
        const providerName =
          INTEGRATIONS.find((p) => p.id === event.data.provider)?.name ??
          event.data.provider;
        toast.success(`${providerName} connected!`);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [qc]);

  // ── Preferences ────────────────────────────────────────────────────────
  const isCrmConnected =
    intMap.get("hubspot")?.status === "connected";

  const handleTogglePref = (key: string, value: boolean) => {
    if (key === "crm_auto_sync" && value && !isCrmConnected) {
      toast.error("Connect HubSpot first");
      return;
    }
    updatePreference.mutate({ [key]: value });
  };

  const isLoading = prefLoading || profileLoading || intLoading;

  if (isLoading)
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );

  const hoursUsed = usage ? (usage.minutesUsed / 60).toFixed(1) : "0.0";
  const hoursLimit =
    usage && !usage.isUnlimited ? (usage.minuteLimit / 60).toFixed(0) : null;
  const hoursLeft =
    usage && !usage.isUnlimited
      ? Math.max(0, (usage.minutesRemaining as number) / 60).toFixed(1)
      : null;

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
      desc: "Automatically log calls and update deal stages in HubSpot",
      value: preferences?.crm_auto_sync ?? false,
      disabled: !isCrmConnected,
    },
  ];

  const isPending = connectMutation.isPending || disconnectMutation.isPending;

  return (
    <DashboardLayout>
      <div className="space-y-8 max-w-3xl">
        <div>
          <h1 className="text-2xl font-bold font-display">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Manage your integrations, preferences, and account
          </p>
        </div>

        {/* ── Usage Overview ──────────────────────────────────────────── */}
        <section>
          <h2 className="font-display font-semibold mb-4">Usage Overview</h2>
          <div className="glass rounded-xl p-5 space-y-5">
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
              <Button
                size="sm"
                variant="default"
                onClick={() => navigate("/dashboard/billing")}
              >
                {usage?.isAtLimit ? "Upgrade Now" : "Manage Plan"}
              </Button>
            </div>

            {usage && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Timer className="w-3.5 h-3.5" /> Call Minutes This Month
                  </span>
                  <span
                    className={cn(
                      "text-xs font-semibold",
                      usage.isAtLimit
                        ? "text-destructive"
                        : usage.isNearLimit
                        ? "text-amber-500"
                        : "text-foreground"
                    )}
                  >
                    {usage.isUnlimited
                      ? `${hoursUsed}h · Unlimited`
                      : `${hoursUsed}h / ${hoursLimit}h`}
                  </span>
                </div>
                {!usage.isUnlimited ? (
                  <>
                    <Progress
                      value={usage.pct}
                      className={cn(
                        "h-2",
                        usage.isAtLimit
                          ? "[&>div]:bg-destructive"
                          : usage.isNearLimit
                          ? "[&>div]:bg-amber-500"
                          : ""
                      )}
                    />
                    <div className="flex justify-between mt-1.5">
                      <span className="text-xs text-muted-foreground">
                        {hoursLeft}h remaining · {formatMinutes(usage.minutesUsed)} used
                      </span>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        Resets {format(usage.resetDate, "MMM d")}
                      </span>
                    </div>
                    {usage.isAtLimit && (
                      <div className="mt-2 p-2.5 rounded-lg bg-destructive/10 border border-destructive/20">
                        <p className="text-xs text-destructive font-medium">
                          Monthly call-minute limit reached.{" "}
                          <button
                            onClick={() => navigate("/dashboard/billing")}
                            className="underline"
                          >
                            Upgrade your plan
                          </button>{" "}
                          to continue recording calls.
                        </p>
                      </div>
                    )}
                    {usage.isNearLimit && !usage.isAtLimit && (
                      <div className="mt-2 flex items-center gap-1">
                        <p className="text-xs text-amber-500">
                          {hoursLeft}h of call minutes remaining.
                        </p>
                        <button
                          onClick={() => navigate("/dashboard/billing")}
                          className="text-xs text-amber-500 hover:underline flex items-center gap-0.5"
                        >
                          Upgrade <ArrowUpRight className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-primary font-medium mt-1">
                    No minute limits on Scale plan · fair use applies above 333h
                  </p>
                )}
              </div>
            )}

            {usage && (
              <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-secondary/30 border border-border">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="w-3.5 h-3.5" />
                  Meetings this month
                </div>
                <span className="text-xs font-semibold text-foreground">
                  {usage.meetingsUsed}
                  {usage.meetingLimit > 0 && usage.meetingLimit !== -1
                    ? ` / ${usage.meetingLimit}`
                    : ""}
                </span>
              </div>
            )}

            {teamUsage && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5" />
                    Team Members
                  </span>
                  <span className="text-xs font-semibold text-foreground">
                    {teamUsage.membersUsed} /{" "}
                    {teamUsage.isUnlimited ? "∞" : teamUsage.membersLimit}
                  </span>
                </div>
                <Progress
                  value={teamUsage.isUnlimited ? 0 : teamUsage.membersPct}
                  className={cn(
                    "h-2",
                    teamUsage.isAtLimit
                      ? "[&>div]:bg-destructive"
                      : teamUsage.isNearLimit
                      ? "[&>div]:bg-amber-500"
                      : ""
                  )}
                />
              </div>
            )}
          </div>
        </section>

        {/* ── Integrations ────────────────────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-display font-semibold">Integrations</h2>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "rgba(255,255,255,.3)",
                background: "rgba(255,255,255,.05)",
                border: "1px solid rgba(255,255,255,.08)",
                borderRadius: 20,
                padding: "2px 10px",
              }}
            >
              {integrations.filter((i) => i.status === "connected").length} / {INTEGRATIONS.length} connected
            </span>
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            Connect Google Calendar and HubSpot to unlock automatic sync and AI-powered call intelligence.
          </p>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            {INTEGRATIONS.map((p) => (
              <IntegrationCard
                key={p.id}
                provider={p}
                integration={intMap.get(p.id)}
                onConnect={(id) => connectMutation.mutate(id)}
                onDisconnect={(id) => disconnectMutation.mutate(id)}
                isPending={isPending}
              />
            ))}
          </div>

          {/* What you get section */}
          <div
            style={{
              marginTop: 14,
              padding: "14px 16px",
              borderRadius: 12,
              background: "rgba(59,130,246,.04)",
              border: "1px solid rgba(59,130,246,.12)",
              display: "flex",
              gap: 10,
              alignItems: "flex-start",
            }}
          >
            <Zap
              style={{
                width: 14,
                height: 14,
                color: "#60a5fa",
                flexShrink: 0,
                marginTop: 1,
              }}
            />
            <div>
              <p
                style={{
                  margin: "0 0 4px",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#60a5fa",
                }}
              >
                When both are connected
              </p>
              <p
                style={{
                  margin: 0,
                  fontSize: 11,
                  color: "rgba(255,255,255,.38)",
                  lineHeight: 1.55,
                }}
              >
                Calendar events automatically become calls in Fixsense, AI summaries are pushed to matching HubSpot deals, and CRM auto-sync keeps your pipeline updated hands-free.
              </p>
            </div>
          </div>
        </section>

        {/* ── Preferences ─────────────────────────────────────────────── */}
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
                      Requires HubSpot connection
                    </p>
                  )}
                </div>
                <Switch
                  checked={pref.value}
                  disabled={pref.disabled}
                  onCheckedChange={(v) => handleTogglePref(pref.key, v)}
                />
              </div>
            ))}
          </div>
        </section>

        {/* ── Security ────────────────────────────────────────────────── */}
        <section>
          <h2 className="font-display font-semibold mb-4">Security & Compliance</h2>
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
                onCheckedChange={(v) => updateProfile.mutate({ gdpr_consent: v })}
              />
            </div>

            <div className="pt-3 border-t border-border">
              <PushNotificationToggle />
            </div>
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}