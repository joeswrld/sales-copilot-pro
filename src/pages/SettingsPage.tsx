import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import {
  Loader2, Shield, XCircle, RefreshCw, Users, Timer,
  Calendar, TrendingUp, ArrowUpRight, Clock, Zap, Link2,
  Info, ExternalLink, AlertTriangle, BellRing, Bot, BookOpen,
  BarChart3, Eye, EyeOff, Mail, Building2, Scissors,
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
import { useEffect, useState } from "react";

interface Integration {
  id: string;
  user_id: string;
  provider: string;
  status: string;
  account_email?: string | null;
  account_name?: string | null;
  expires_at?: string | null;
}

// ─── Extended preferences type ───────────────────────────────────────────────

interface ExtendedPreferences {
  id: string;
  user_id: string;
  updated_at: string;
  // Existing
  auto_join_meetings: boolean;
  real_time_objection_alerts: boolean;
  post_call_email_summary: boolean;
  crm_auto_sync: boolean;
  // New
  slack_notifications: boolean;
  deal_room_auto_create: boolean;
  ai_summary_auto_generate: boolean;
  sentiment_alert_threshold: number;
  coaching_clips_enabled: boolean;
  transcript_visible_to_team: boolean;
  weekly_digest_email: boolean;
}

// ─── Provider config ────────────────────────────────────────────────────────

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
    comingSoon: false,
    helpContent: null as React.ReactNode | null,
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
    comingSoon: false,
    helpContent: <HubSpotHelpPanel />,
  },
  {
    id: "salesforce",
    name: "Salesforce CRM",
    description: "Log call activities as Tasks, sync Contacts and Leads, and push AI summaries to Opportunities.",
    logo: (
      <svg viewBox="0 0 80 54" width="30" height="20" xmlns="http://www.w3.org/2000/svg">
        <path d="M33.3 7.4a14 14 0 0 1 9.8-4c5.3 0 9.9 3 12.4 7.4a16.7 16.7 0 0 1 6.7-1.4c9.3 0 16.8 7.7 16.8 17.2S71.5 43.8 62.2 43.8c-1 0-2-.1-3-.3A13.4 13.4 0 0 1 47.4 51a13 13 0 0 1-5.8-1.4A12.4 12.4 0 0 1 30.3 56c-4.3 0-8-2.2-10.3-5.5a15.4 15.4 0 0 1-3 .3C7.6 50.8 1 44 1 35.6c0-5.6 3-10.4 7.4-13a14 14 0 0 1-.6-4C7.8 10 14.7 3 23.2 3a14 14 0 0 1 10.1 4.4z" fill="#00A1E0" />
        <text x="40" y="36" textAnchor="middle" fontSize="16" fontWeight="800" fill="#fff" fontFamily="sans-serif">SF</text>
      </svg>
    ),
    accentColor: "#00A1E0",
    accentBg: "rgba(0,161,224,.08)",
    accentBorder: "rgba(0,161,224,.18)",
    features: ["Log Tasks on calls", "Sync Contacts & Leads", "Update Opportunities"],
    comingSoon: true,
    helpContent: null as React.ReactNode | null,
  },
];

// ─── HubSpot Help Panel ─────────────────────────────────────────────────────

function HubSpotHelpPanel() {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginTop: 8 }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#FF7A59", background: "rgba(255,122,89,.08)", border: "1px solid rgba(255,122,89,.2)", borderRadius: 8, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit" }}
      >
        <Info style={{ width: 11, height: 11 }} />
        How to get your HubSpot API credentials
      </button>
      {open && (
        <div style={{ marginTop: 8, padding: "12px 14px", background: "rgba(255,122,89,.04)", border: "1px solid rgba(255,122,89,.15)", borderRadius: 10 }}>
          <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 700, color: "#FF7A59" }}>Setting up HubSpot OAuth</p>
          <ol style={{ margin: 0, paddingLeft: 18, fontSize: 11, color: "rgba(255,255,255,.5)", lineHeight: 1.7 }}>
            <li>Go to <strong style={{ color: "rgba(255,255,255,.7)" }}>developers.hubspot.com</strong> and log in.</li>
            <li>Click <strong style={{ color: "rgba(255,255,255,.7)" }}>Create an app</strong> → fill in the app name.</li>
            <li>Under <strong style={{ color: "rgba(255,255,255,.7)" }}>Auth</strong>, copy your <strong style={{ color: "#FF7A59" }}>Client ID</strong> and <strong style={{ color: "#FF7A59" }}>Client Secret</strong>.</li>
            <li>Add redirect URI: <code style={{ color: "#fbbf24", fontSize: 10, background: "rgba(255,255,255,.05)", padding: "1px 5px", borderRadius: 4 }}>https://dkvtufanmaiclmsnpyae.supabase.co/functions/v1/oauth-callback</code></li>
            <li>Set scopes: <code style={{ color: "#a5b4fc", fontSize: 10 }}>crm.objects.contacts.read crm.objects.deals.read crm.objects.deals.write</code></li>
            <li>Add to Supabase Edge Function Secrets: <code style={{ color: "#fbbf24", fontSize: 10 }}>HUBSPOT_CLIENT_ID</code> and <code style={{ color: "#fbbf24", fontSize: 10 }}>HUBSPOT_CLIENT_SECRET</code></li>
          </ol>
          <a href="https://developers.hubspot.com/docs/api/oauth-quickstart-guide" target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 4, marginTop: 8, fontSize: 11, color: "#FF7A59", textDecoration: "underline" }}>
            HubSpot OAuth Guide <ExternalLink style={{ width: 10, height: 10 }} />
          </a>
        </div>
      )}
    </div>
  );
}

// ─── Integration Card ───────────────────────────────────────────────────────

function IntegrationCard({
  provider, integration, onConnect, onDisconnect, isPending,
}: {
  provider: typeof INTEGRATIONS[number];
  integration?: Integration;
  onConnect: (id: string) => void;
  onDisconnect: (id: string) => void;
  isPending: boolean;
}) {
  const isConnected    = integration?.status === "connected";
  const isExpired      = !!integration?.expires_at && new Date(integration.expires_at) < new Date();
  const needsReconnect = isExpired && isConnected;
  const accountLabel   = integration?.account_email || integration?.account_name;
  const { comingSoon } = provider;

  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 16, padding: "16px 20px", borderRadius: 14,
      background: comingSoon ? "rgba(255,255,255,.015)" : isConnected ? provider.accentBg : "rgba(255,255,255,.025)",
      border: `1px solid ${comingSoon ? "rgba(255,255,255,.05)" : isConnected ? provider.accentBorder : "rgba(255,255,255,.07)"}`,
      transition: "all .18s ease", opacity: comingSoon ? 0.7 : 1,
    }}>
      <div style={{ width: 46, height: 46, borderRadius: 12, background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.09)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>
        {provider.logo}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3, flexWrap: "wrap" }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#f0f6fc", fontFamily: "'Bricolage Grotesque', sans-serif" }}>{provider.name}</span>
          {comingSoon && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 700, color: "#a78bfa", background: "rgba(167,139,250,.1)", border: "1px solid rgba(167,139,250,.25)", borderRadius: 20, padding: "2px 8px" }}>🚧 Coming Soon</span>
          )}
          {!comingSoon && isConnected && !needsReconnect && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 700, color: "#22c55e", background: "rgba(34,197,94,.1)", border: "1px solid rgba(34,197,94,.22)", borderRadius: 20, padding: "2px 8px" }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#22c55e", display: "inline-block" }} /> Connected
            </span>
          )}
          {!comingSoon && needsReconnect && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 700, color: "#f59e0b", background: "rgba(245,158,11,.1)", border: "1px solid rgba(245,158,11,.22)", borderRadius: 20, padding: "2px 8px" }}>Token expired</span>
          )}
          {!comingSoon && isConnected && accountLabel && (
            <span style={{ fontSize: 10, color: "rgba(255,255,255,.45)", background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 20, padding: "2px 8px", fontFamily: "monospace" }}>{accountLabel}</span>
          )}
        </div>
        <p style={{ margin: "0 0 8px", fontSize: 12, color: "rgba(255,255,255,.42)", lineHeight: 1.5 }}>
          {comingSoon ? "Full Salesforce integration is under development. You'll be able to log Tasks, sync Contacts & Leads, and update Opportunities directly from Fixsense." : provider.description}
        </p>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {provider.features.map(f => (
            <span key={f} style={{ fontSize: 10, color: comingSoon ? "rgba(167,139,250,.5)" : isConnected ? provider.accentColor : "rgba(255,255,255,.3)", background: comingSoon ? "rgba(167,139,250,.05)" : isConnected ? provider.accentBg : "rgba(255,255,255,.03)", border: `1px solid ${comingSoon ? "rgba(167,139,250,.1)" : isConnected ? provider.accentBorder : "rgba(255,255,255,.06)"}`, borderRadius: 20, padding: "2px 8px" }}>{f}</span>
          ))}
        </div>
        {!comingSoon && provider.helpContent}
      </div>
      <div style={{ flexShrink: 0, alignSelf: "center" }}>
        {comingSoon ? (
          <span style={{ fontSize: 11, color: "rgba(167,139,250,.5)", background: "rgba(167,139,250,.05)", border: "1px solid rgba(167,139,250,.1)", borderRadius: 9, padding: "7px 14px", display: "inline-block" }}>Soon™</span>
        ) : isConnected && !needsReconnect ? (
          <button onClick={() => onDisconnect(provider.id)} disabled={isPending} style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 14px", background: "transparent", border: "1px solid rgba(239,68,68,.3)", borderRadius: 9, color: "#f87171", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", opacity: isPending ? 0.5 : 1 }}>
            <XCircle style={{ width: 12, height: 12 }} /> Disconnect
          </button>
        ) : needsReconnect ? (
          <button onClick={() => onConnect(provider.id)} disabled={isPending} style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 14px", background: "rgba(245,158,11,.12)", border: "1px solid rgba(245,158,11,.3)", borderRadius: 9, color: "#fbbf24", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", opacity: isPending ? 0.5 : 1 }}>
            <RefreshCw style={{ width: 12, height: 12 }} /> Reconnect
          </button>
        ) : (
          <button onClick={() => onConnect(provider.id)} disabled={isPending} style={{ display: "flex", alignItems: "center", gap: 5, padding: "8px 16px", background: `linear-gradient(135deg, ${provider.accentColor}, ${provider.accentColor}cc)`, border: "none", borderRadius: 9, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", boxShadow: `0 4px 14px ${provider.accentColor}30`, opacity: isPending ? 0.5 : 1 }}>
            <Link2 style={{ width: 12, height: 12 }} /> Connect
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Preference Section Component ──────────────────────────────────────────

function PrefSection({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="glass rounded-xl overflow-hidden">
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border/60 bg-secondary/20">
        <span className="text-primary">{icon}</span>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
      </div>
      <div className="divide-y divide-border/50">{children}</div>
    </div>
  );
}

function PrefRow({
  label, desc, value, onChange, disabled, badge,
}: {
  label: string; desc: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean; badge?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between p-4 gap-4", disabled && "opacity-50")}>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium">{label}</p>
          {badge && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">{badge}</span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
        {disabled && (
          <p className="text-xs text-amber-500 mt-1 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> Connect HubSpot first
          </p>
        )}
      </div>
      <Switch checked={value} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}

// ─── Main page ──────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { preferences: rawPrefs, isLoading: prefLoading, updatePreference } = usePreferences();
  const prefs = rawPrefs as ExtendedPreferences | undefined;
  const { profile, isLoading: profileLoading, updateProfile } = useUserProfile();
  const { teamUsage } = useTeamUsage();
  const { usage, isLoading: usageLoading } = useMinuteUsage();

  // ── Extended preferences direct query ─────────────────────────────
  const { data: extPrefs, refetch: refetchExtPrefs } = useQuery({
    queryKey: ["ext-preferences", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase.from("user_preferences").select("*").eq("user_id", user.id).maybeSingle();
      return data as ExtendedPreferences | null;
    },
    enabled: !!user?.id,
    staleTime: 30_000,
  });

  const updateExtPref = useMutation({
    mutationFn: async (updates: Partial<ExtendedPreferences>) => {
      const { error } = await supabase.from("user_preferences").update({ ...updates, updated_at: new Date().toISOString() }).eq("user_id", user!.id);
      if (error) throw error;
    },
    onMutate: async (updates) => {
      await qc.cancelQueries({ queryKey: ["ext-preferences", user?.id] });
      const prev = qc.getQueryData<ExtendedPreferences>(["ext-preferences", user?.id]);
      qc.setQueryData<ExtendedPreferences | null>(["ext-preferences", user?.id], old => old ? { ...old, ...updates } : old);
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      qc.setQueryData(["ext-preferences", user?.id], ctx?.prev);
      toast.error("Failed to save preference");
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["ext-preferences"] });
      qc.invalidateQueries({ queryKey: ["user-preferences"] });
    },
  });

  const handleExt = (key: keyof ExtendedPreferences, value: boolean | number) => {
    updateExtPref.mutate({ [key]: value } as Partial<ExtendedPreferences>);
  };

  // ── Integrations ──────────────────────────────────────────────────
  const { data: integrations = [], isLoading: intLoading } = useQuery({
    queryKey: ["settings-integrations", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      await supabase.from("integrations").upsert(
        [
          { user_id: user.id, provider: "google_calendar", status: "disconnected" },
          { user_id: user.id, provider: "hubspot", status: "disconnected" },
          { user_id: user.id, provider: "salesforce", status: "disconnected" },
        ],
        { onConflict: "user_id,provider", ignoreDuplicates: true }
      );
      const { data } = await supabase.from("integrations").select("id,user_id,provider,status,account_email,account_name,expires_at").eq("user_id", user.id).in("provider", ["google_calendar", "hubspot", "salesforce"]);
      return (data || []) as Integration[];
    },
    enabled: !!user?.id,
    staleTime: 10_000,
    refetchInterval: 15_000,
  });

  const intMap = new Map(integrations.map(i => [i.provider, i]));
  const connectedCount = integrations.filter(i => i.status === "connected").length;
  const anyCrmConnected = intMap.get("hubspot")?.status === "connected" || intMap.get("salesforce")?.status === "connected";
  const slackConnected  = intMap.get("slack")?.status === "connected";

  const connectMutation = useMutation({
    mutationFn: async (provider: string) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Not authenticated");
      const { data, error } = await supabase.functions.invoke("oauth-connect", { body: { provider, redirect_uri: `${window.location.origin}/dashboard/settings` }, headers: { Authorization: `Bearer ${session.access_token}` } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as { url: string };
    },
    onSuccess: (data) => {
      const w = 560, h = 700;
      window.open(data.url, "oauth-popup", `width=${w},height=${h},left=${Math.round((window.innerWidth - w) / 2)},top=${Math.round((window.innerHeight - h) / 2)},popup=1`);
    },
    onError: (e: Error) => toast.error(e.message || "Failed to start OAuth flow"),
  });

  const disconnectMutation = useMutation({
    mutationFn: async (provider: string) => {
      const { error } = await supabase.functions.invoke("oauth-disconnect", { body: { provider } });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings-integrations"] });
      qc.invalidateQueries({ queryKey: ["calendar-integration"] });
      toast.success("Integration disconnected");
    },
    onError: (e: Error) => toast.error(e.message || "Failed to disconnect"),
  });

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === "oauth-success") {
        qc.invalidateQueries({ queryKey: ["settings-integrations"] });
        qc.invalidateQueries({ queryKey: ["calendar-integration"] });
        qc.invalidateQueries({ queryKey: ["integrations"] });
        qc.invalidateQueries({ queryKey: ["upcoming-meetings"] });
        const providerConfig = INTEGRATIONS.find(p => p.id === event.data.provider);
        const name = providerConfig?.name ?? event.data.provider;
        const email = event.data.email ? ` as ${event.data.email}` : "";
        toast.success(`${name} connected${email}! 🎉`);
      }
      if (event.data?.type === "oauth-error") toast.error(`Connection failed: ${event.data.error}`);
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [qc]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    const error = params.get("error");
    if (connected) {
      qc.invalidateQueries({ queryKey: ["settings-integrations"] });
      qc.invalidateQueries({ queryKey: ["calendar-integration"] });
      qc.invalidateQueries({ queryKey: ["upcoming-meetings"] });
      const name = INTEGRATIONS.find(p => p.id === connected)?.name ?? connected;
      toast.success(`${name} connected successfully! 🎉`);
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (error) {
      const messages: Record<string, string> = {
        oauth_not_configured: "OAuth credentials not configured. Contact support.",
        token_exchange_failed: "Authorization failed. Please try again.",
        missing_code: "Authorization code missing. Please try again.",
        invalid_state: "Invalid OAuth state. Please try again.",
        access_denied: "Access was denied. Please try again.",
      };
      toast.error(messages[error] ?? `Connection failed: ${error}`);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [qc]);

  const isLoading = prefLoading || profileLoading || intLoading;
  if (isLoading) return (
    <DashboardLayout>
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    </DashboardLayout>
  );

  const hoursUsed  = usage ? (usage.minutesUsed / 60).toFixed(1) : "0.0";
  const hoursLimit = usage && !usage.isUnlimited ? (usage.minuteLimit / 60).toFixed(0) : null;
  const hoursLeft  = usage && !usage.isUnlimited ? Math.max(0, (usage.minutesRemaining as number) / 60).toFixed(1) : null;
  const isPending  = connectMutation.isPending || disconnectMutation.isPending;

  // Merged prefs — use extPrefs if available (direct query), fall back to usePreferences hook
  const p = extPrefs ?? (prefs as ExtendedPreferences | undefined);

  const pBool = (key: keyof ExtendedPreferences, fallback = false): boolean =>
    (p?.[key] as boolean | undefined) ?? fallback;

  const sentimentThreshold = (p?.sentiment_alert_threshold ?? 40);

  return (
    <DashboardLayout>
      <div className="space-y-8 max-w-3xl">
        <div>
          <h1 className="text-2xl font-bold font-display">Settings</h1>
          <p className="text-sm text-muted-foreground">Manage your integrations, preferences, and account</p>
        </div>

        {/* ── Usage ─────────────────────────────────────────────────── */}
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
                      ? `${hoursUsed}h used · Unlimited`
                      : `${hoursUsed}h of ${hoursLimit}h used this month`
                    : `${profile?.calls_used ?? 0} / ${profile?.calls_limit ?? 5} calls used`}
                </p>
              </div>
              <Button size="sm" onClick={() => navigate("/dashboard/billing")}>
                {usage?.isAtLimit ? "Upgrade Now" : "Manage Plan"}
              </Button>
            </div>

            {usage && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Timer className="w-3.5 h-3.5" /> Call Minutes This Month
                  </span>
                  <span className={cn("text-xs font-semibold", usage.isAtLimit ? "text-destructive" : usage.isNearLimit ? "text-amber-500" : "text-foreground")}>
                    {usage.isUnlimited ? `${hoursUsed}h · Unlimited` : `${hoursUsed}h / ${hoursLimit}h`}
                  </span>
                </div>
                {!usage.isUnlimited ? (
                  <>
                    <Progress value={usage.pct} className={cn("h-2", usage.isAtLimit ? "[&>div]:bg-destructive" : usage.isNearLimit ? "[&>div]:bg-amber-500" : "")} />
                    <div className="flex justify-between mt-1.5">
                      <span className="text-xs text-muted-foreground">{hoursLeft}h remaining · {formatMinutes(usage.minutesUsed)} used</span>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        Resets {format(usage.resetDate, "MMM d")}
                      </span>
                    </div>
                    {usage.isAtLimit && (
                      <div className="mt-2 p-2.5 rounded-lg bg-destructive/10 border border-destructive/20">
                        <p className="text-xs text-destructive font-medium">
                          Monthly limit reached.{" "}
                          <button onClick={() => navigate("/dashboard/billing")} className="underline">Upgrade</button>{" "}
                          to continue recording.
                        </p>
                      </div>
                    )}
                    {usage.isNearLimit && !usage.isAtLimit && (
                      <div className="mt-2 flex items-center gap-1">
                        <p className="text-xs text-amber-500">{hoursLeft}h remaining.</p>
                        <button onClick={() => navigate("/dashboard/billing")} className="text-xs text-amber-500 hover:underline flex items-center gap-0.5">
                          Upgrade <ArrowUpRight className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-primary font-medium mt-1">No limits on Scale · fair use above 333h</p>
                )}
              </div>
            )}

            {usage && (
              <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-secondary/30 border border-border">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="w-3.5 h-3.5" /> Meetings this month
                </div>
                <span className="text-xs font-semibold">
                  {usage.meetingsUsed}{usage.meetingLimit > 0 && usage.meetingLimit !== -1 ? ` / ${usage.meetingLimit}` : ""}
                </span>
              </div>
            )}

            {teamUsage && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5" /> Team Members
                  </span>
                  <span className="text-xs font-semibold">{teamUsage.membersUsed} / {teamUsage.isUnlimited ? "∞" : teamUsage.membersLimit}</span>
                </div>
                <Progress value={teamUsage.isUnlimited ? 0 : teamUsage.membersPct} className={cn("h-2", teamUsage.isAtLimit ? "[&>div]:bg-destructive" : teamUsage.isNearLimit ? "[&>div]:bg-amber-500" : "")} />
              </div>
            )}
          </div>
        </section>

        {/* ── Integrations ──────────────────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-display font-semibold">Integrations</h2>
            <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,.3)", background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 20, padding: "2px 10px" }}>
              {connectedCount} connected
            </span>
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            Connect Google Calendar and HubSpot to unlock automatic sync and AI-powered call intelligence.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {INTEGRATIONS.map(p => (
              <IntegrationCard
                key={p.id}
                provider={p}
                integration={intMap.get(p.id)}
                onConnect={id => connectMutation.mutate(id)}
                onDisconnect={id => disconnectMutation.mutate(id)}
                isPending={isPending}
              />
            ))}
          </div>
          <div style={{ marginTop: 14, padding: "14px 16px", borderRadius: 12, background: "rgba(59,130,246,.04)", border: "1px solid rgba(59,130,246,.12)", display: "flex", gap: 10, alignItems: "flex-start" }}>
            <Zap style={{ width: 14, height: 14, color: "#60a5fa", flexShrink: 0, marginTop: 1 }} />
            <div>
              <p style={{ margin: "0 0 4px", fontSize: 12, fontWeight: 600, color: "#60a5fa" }}>When integrations are connected</p>
              <p style={{ margin: 0, fontSize: 11, color: "rgba(255,255,255,.38)", lineHeight: 1.55 }}>
                Calendar events auto-become calls with AI transcription. HubSpot contacts and deals sync automatically, and AI summaries are logged as Notes against matching Contacts and Deals.
              </p>
            </div>
          </div>
        </section>

        {/* ── Preferences ───────────────────────────────────────────── */}
        <section>
          <h2 className="font-display font-semibold mb-4">Preferences</h2>
          <div className="space-y-4">

            {/* AI & Call Intelligence */}
            <PrefSection title="AI & Call Intelligence" icon={<Bot className="w-4 h-4" />}>
              <PrefRow
                label="Real-time objection alerts"
                desc="Flash a notification the moment an objection is detected mid-call"
                value={pBool("real_time_objection_alerts", true)}
                onChange={v => handleExt("real_time_objection_alerts", v)}
              />
              <PrefRow
                label="Auto-generate AI summary"
                desc="Automatically generate call summary, topics, and action items when a call ends"
                value={pBool("ai_summary_auto_generate", true)}
                onChange={v => handleExt("ai_summary_auto_generate", v)}
              />
              {/* Sentiment threshold slider */}
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Sentiment alert threshold</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Flag a deal "At Risk" when sentiment drops below this level
                    </p>
                  </div>
                  <span className={cn(
                    "text-sm font-bold tabular-nums px-2.5 py-1 rounded-lg border",
                    sentimentThreshold <= 30 ? "bg-red-500/10 text-red-400 border-red-500/20"
                    : sentimentThreshold <= 50 ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                    : "bg-green-500/10 text-green-400 border-green-500/20",
                  )}>
                    {sentimentThreshold}%
                  </span>
                </div>
                <Slider
                  min={10}
                  max={70}
                  step={5}
                  value={[sentimentThreshold]}
                  onValueChange={([v]) => updateExtPref.mutate({ sentiment_alert_threshold: v })}
                  className="w-full"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>10% — very lenient</span>
                  <span>70% — very strict</span>
                </div>
              </div>
            </PrefSection>

            {/* Meetings & Scheduling */}
            <PrefSection title="Meetings & Scheduling" icon={<Calendar className="w-4 h-4" />}>
              <PrefRow
                label="Auto-join scheduled meetings"
                desc="AI bot automatically joins meetings from your connected Google Calendar"
                value={pBool("auto_join_meetings", false)}
                onChange={v => handleExt("auto_join_meetings", v)}
              />
              <PrefRow
                label="Auto-create Deal Room after call"
                desc="Automatically create a team Deal Room when a live call ends — links the call and notifies your team"
                value={pBool("deal_room_auto_create", true)}
                onChange={v => handleExt("deal_room_auto_create", v)}
                badge="Team"
              />
            </PrefSection>

            {/* Notifications */}
            <PrefSection title="Notifications" icon={<BellRing className="w-4 h-4" />}>
              <PrefRow
                label="Post-call email summary"
                desc="Receive a full AI summary with scores, next steps, and action items via email after each call"
                value={pBool("post_call_email_summary", true)}
                onChange={v => handleExt("post_call_email_summary", v)}
              />
              <PrefRow
                label="Weekly performance digest"
                desc="Get a weekly email with your win rate, sentiment trends, top objections, and coaching highlights"
                value={pBool("weekly_digest_email", true)}
                onChange={v => handleExt("weekly_digest_email", v)}
              />
              <PrefRow
                label="Slack deal & call notifications"
                desc="Push call summaries and at-risk deal alerts to your connected Slack workspace"
                value={pBool("slack_notifications", true)}
                onChange={v => handleExt("slack_notifications", v)}
              />
            </PrefSection>

            {/* Coaching & Team */}
            <PrefSection title="Coaching & Team" icon={<BookOpen className="w-4 h-4" />}>
              <PrefRow
                label="Enable coaching clips"
                desc="Allow managers to clip and share moments from your calls as coaching material"
                value={pBool("coaching_clips_enabled", true)}
                onChange={v => handleExt("coaching_clips_enabled", v)}
                badge="Growth+"
              />
              <PrefRow
                label="Share transcripts with team"
                desc="Let teammates view full call transcripts — managers can always access them regardless of this setting"
                value={pBool("transcript_visible_to_team", false)}
                onChange={v => handleExt("transcript_visible_to_team", v)}
                badge="Team"
              />
            </PrefSection>

            {/* CRM Sync */}
            <PrefSection title="CRM Sync" icon={<Building2 className="w-4 h-4" />}>
              <PrefRow
                label="CRM auto-sync after each call"
                desc="Automatically push call score, talk ratio, sentiment, and objection count to HubSpot or Salesforce"
                value={pBool("crm_auto_sync", false)}
                onChange={v => {
                  if (v && !anyCrmConnected) {
                    toast.error("Connect HubSpot first to enable CRM auto-sync");
                    return;
                  }
                  handleExt("crm_auto_sync", v);
                }}
                disabled={!anyCrmConnected}
              />
            </PrefSection>

          </div>
        </section>

        {/* ── Security ──────────────────────────────────────────────── */}
        <section>
          <h2 className="font-display font-semibold mb-4">Security & Compliance</h2>
          <div className="glass rounded-xl p-5 space-y-4">
            <div className="grid sm:grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Encryption</p>
                <p className="text-sm font-medium text-primary">AES-256 at rest, TLS in transit</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">SOC2</p>
                <p className="text-sm font-medium text-primary">Certified</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">GDPR</p>
                <p className="text-sm font-medium text-primary">{profile?.gdpr_consent ? "Consent Given" : "Pending"}</p>
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
              <Switch checked={profile?.gdpr_consent ?? false} onCheckedChange={v => updateProfile.mutate({ gdpr_consent: v })} />
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