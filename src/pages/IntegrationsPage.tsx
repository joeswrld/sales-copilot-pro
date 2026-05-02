/**
 * IntegrationsPage.tsx — Fixsense Integrations Hub v2
 *
 * Route: /integrations (public marketing page) — see note below
 *
 * NOTE FOR DEVS: This file exports BOTH:
 *   - IntegrationsPage  (public marketing/showcase, used in MarketingPages.tsx)
 *   - IntegrationsDashboardPage (authenticated settings hub, add to App.tsx at /integrations)
 *
 * The existing SettingsPage still handles the basic toggle list.
 * This page is the full-featured integrations hub.
 */

import { useState, useCallback, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import DashboardLayout from "@/components/DashboardLayout";
import {
  CheckCircle2, XCircle, ExternalLink, RefreshCw, Plus, Trash2,
  Copy, Eye, EyeOff, Zap, Globe, Shield, Clock, ChevronRight,
  AlertTriangle, Settings, Link2, Send, ToggleLeft, ToggleRight,
  Activity, Database, Mail, Calendar, BarChart2, Key,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Integration {
  id: string;
  user_id: string;
  provider: string;
  status: string;
  account_email: string | null;
  account_name: string | null;
  scope: string | null;
  last_synced_at: string | null;
  sync_error: string | null;
  expires_at: string | null;
  created_at: string;
}

interface WebhookSub {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  failure_count: number;
  last_triggered: string | null;
  created_at: string;
}

interface ApiKey {
  id: string;
  key_prefix: string;
  name: string;
  scopes: string[];
  last_used_at: string | null;
  expires_at: string | null;
  revoked: boolean;
  created_at: string;
}

// ─── Provider metadata ────────────────────────────────────────────────────────

const CALENDAR_PROVIDERS = [
  {
    id: "google_calendar",
    name: "Google Calendar",
    description: "Sync meetings, auto-create calls, attach Fixsense links to events",
    logo: "G",
    logoColor: "#4285F4",
    logoBg: "rgba(66,133,244,.12)",
    category: "calendar",
    features: ["Sync events → calls", "Auto-create meetings", "Attach meet links"],
    docsUrl: "https://developers.google.com/calendar",
  },
  {
    id: "google_meet",
    name: "Google Meet",
    description: "Record and transcribe Google Meet calls with AI-powered analysis",
    logo: "M",
    logoColor: "#00897B",
    logoBg: "rgba(0,137,123,.12)",
    category: "calendar",
    features: ["Auto-join meetings", "Real-time transcription", "AI insights"],
    docsUrl: "https://developers.google.com/meet",
  },
  {
    id: "zoom",
    name: "Zoom",
    description: "Connect Zoom to auto-join meetings and transcribe calls end-to-end",
    logo: "Z",
    logoColor: "#2D8CFF",
    logoBg: "rgba(45,140,255,.12)",
    category: "calendar",
    features: ["Auto-join meetings", "Cloud recording sync", "Participant tracking"],
    docsUrl: "https://developers.zoom.us",
  },
  {
    id: "teams",
    name: "Microsoft Teams",
    description: "Full Teams integration with AI bot for real-time coaching",
    logo: "T",
    logoColor: "#6264A7",
    logoBg: "rgba(98,100,167,.12)",
    category: "calendar",
    features: ["Teams meetings", "AI coaching bot", "Deal tracking"],
    docsUrl: "https://learn.microsoft.com/en-us/graph/teams-concept-overview",
  },
];

const CRM_PROVIDERS = [
  {
    id: "hubspot",
    name: "HubSpot",
    description: "Sync contacts, deals, and call data. Auto-log calls and update pipeline stages",
    logo: "H",
    logoColor: "#FF7A59",
    logoBg: "rgba(255,122,89,.12)",
    category: "crm",
    features: ["Contact enrichment", "Deal stage sync", "Auto-log calls", "Push summaries"],
    badge: "Priority",
    docsUrl: "https://developers.hubspot.com",
  },
  {
    id: "salesforce",
    name: "Salesforce",
    description: "Enterprise CRM sync — update Salesforce records with AI-generated call intelligence",
    logo: "SF",
    logoColor: "#00A1E0",
    logoBg: "rgba(0,161,224,.12)",
    category: "crm",
    features: ["Opportunity updates", "Contact sync", "Activity logging", "Custom field mapping"],
    docsUrl: "https://developer.salesforce.com",
  },
];

const COMM_PROVIDERS = [
  {
    id: "slack",
    name: "Slack",
    description: "Get real-time notifications and post AI call summaries to your Slack workspace",
    logo: "Sl",
    logoColor: "#E01E5A",
    logoBg: "rgba(224,30,90,.12)",
    category: "comms",
    features: ["Call complete alerts", "Summary posts", "Deal risk pings"],
    docsUrl: "https://api.slack.com",
  },
];

const WEBHOOK_EVENTS = [
  { id: "call.completed", label: "Call Completed", desc: "Triggered when a call ends and summary is generated" },
  { id: "summary.generated", label: "Summary Generated", desc: "Triggered when AI summary is ready" },
  { id: "deal.updated", label: "Deal Updated", desc: "Triggered when deal stage or sentiment changes" },
  { id: "objection.detected", label: "Objection Detected", desc: "Triggered in real-time when objection is found" },
];

const API_SCOPES = ["calls:read", "calls:write", "summaries:read", "analytics:read", "team:read"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: string | null) {
  if (!d) return "Never";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtRelative(d: string | null) {
  if (!d) return "Never";
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── Status Chip ──────────────────────────────────────────────────────────────

function StatusChip({ status, expired }: { status: string; expired?: boolean }) {
  if (expired) return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, color: "#f59e0b", background: "rgba(245,158,11,.12)", border: "1px solid rgba(245,158,11,.3)", borderRadius: 20, padding: "3px 10px" }}>
      <AlertTriangle style={{ width: 10, height: 10 }} /> Expired
    </span>
  );
  if (status === "connected") return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, color: "#22c55e", background: "rgba(34,197,94,.1)", border: "1px solid rgba(34,197,94,.25)", borderRadius: 20, padding: "3px 10px" }}>
      <CheckCircle2 style={{ width: 10, height: 10 }} /> Connected
    </span>
  );
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,.3)", background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 20, padding: "3px 10px" }}>
      <XCircle style={{ width: 10, height: 10 }} /> Not connected
    </span>
  );
}

// ─── Provider Card ────────────────────────────────────────────────────────────

function ProviderCard({
  provider,
  integration,
  onConnect,
  onDisconnect,
  isConnecting,
  isDisconnecting,
}: {
  provider: typeof CALENDAR_PROVIDERS[0];
  integration?: Integration;
  onConnect: (id: string) => void;
  onDisconnect: (id: string) => void;
  isConnecting: boolean;
  isDisconnecting: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const isConnected = integration?.status === "connected";
  const isExpired = integration?.expires_at ? new Date(integration.expires_at) < new Date() : false;
  const needsReconnect = isExpired && isConnected;

  return (
    <div style={{
      background: isConnected ? "rgba(34,197,94,.03)" : "rgba(255,255,255,.02)",
      border: `1px solid ${isConnected ? "rgba(34,197,94,.18)" : "rgba(255,255,255,.07)"}`,
      borderRadius: 16,
      padding: "18px 20px",
      transition: "all .15s",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
        {/* Logo */}
        <div style={{
          width: 44, height: 44, borderRadius: 12, flexShrink: 0,
          background: provider.logoBg, display: "flex", alignItems: "center",
          justifyContent: "center", fontSize: 15, fontWeight: 800,
          color: provider.logoColor, fontFamily: "'Bricolage Grotesque', sans-serif",
          border: `1px solid ${provider.logoColor}25`,
        }}>
          {provider.logo}
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#f0f6fc", fontFamily: "'Bricolage Grotesque', sans-serif" }}>
              {provider.name}
            </span>
            {(provider as any).badge && (
              <span style={{ fontSize: 9, fontWeight: 800, color: "#60a5fa", background: "rgba(96,165,250,.12)", border: "1px solid rgba(96,165,250,.25)", borderRadius: 20, padding: "2px 7px", textTransform: "uppercase", letterSpacing: ".07em" }}>
                {(provider as any).badge}
              </span>
            )}
            <StatusChip status={integration?.status ?? "disconnected"} expired={needsReconnect} />
          </div>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,.45)", margin: "0 0 8px", lineHeight: 1.55 }}>
            {provider.description}
          </p>

          {/* Connected account info */}
          {isConnected && !needsReconnect && integration?.account_email && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e" }} />
              <span style={{ fontSize: 11, color: "rgba(255,255,255,.4)" }}>{integration.account_email}</span>
              {integration.last_synced_at && (
                <span style={{ fontSize: 10, color: "rgba(255,255,255,.22)" }}>· Synced {fmtRelative(integration.last_synced_at)}</span>
              )}
            </div>
          )}

          {/* Features */}
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {provider.features.map(f => (
              <span key={f} style={{ fontSize: 10, color: "rgba(255,255,255,.38)", background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.06)", borderRadius: 20, padding: "2px 8px" }}>
                {f}
              </span>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0, alignItems: "flex-end" }}>
          {isConnected && !needsReconnect ? (
            <>
              <button
                onClick={() => onDisconnect(provider.id)}
                disabled={isDisconnecting}
                style={{
                  display: "flex", alignItems: "center", gap: 5, padding: "7px 14px",
                  background: "transparent", border: "1px solid rgba(239,68,68,.3)",
                  borderRadius: 9, color: "#f87171", fontSize: 12, fontWeight: 600,
                  cursor: "pointer", fontFamily: "'DM Sans', sans-serif", transition: ".13s",
                }}
              >
                <XCircle style={{ width: 12, height: 12 }} />
                Disconnect
              </button>
              <a href={provider.docsUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: "rgba(255,255,255,.25)", display: "flex", alignItems: "center", gap: 3, textDecoration: "none" }}>
                Docs <ExternalLink style={{ width: 9, height: 9 }} />
              </a>
            </>
          ) : needsReconnect ? (
            <button
              onClick={() => onConnect(provider.id)}
              disabled={isConnecting}
              style={{
                display: "flex", alignItems: "center", gap: 5, padding: "7px 14px",
                background: "rgba(245,158,11,.15)", border: "1px solid rgba(245,158,11,.35)",
                borderRadius: 9, color: "#fbbf24", fontSize: 12, fontWeight: 600,
                cursor: "pointer", fontFamily: "'DM Sans', sans-serif", transition: ".13s",
              }}
            >
              <RefreshCw style={{ width: 12, height: 12 }} />
              Reconnect
            </button>
          ) : (
            <button
              onClick={() => onConnect(provider.id)}
              disabled={isConnecting}
              style={{
                display: "flex", alignItems: "center", gap: 5, padding: "8px 16px",
                background: "linear-gradient(135deg, #3b82f6, #2563eb)",
                border: "none", borderRadius: 9, color: "#fff", fontSize: 12, fontWeight: 700,
                cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
                boxShadow: "0 4px 14px rgba(59,130,246,.3)", transition: "all .13s",
              }}
            >
              <Link2 style={{ width: 12, height: 12 }} />
              Connect
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Webhooks Section ─────────────────────────────────────────────────────────

function WebhooksSection({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const [newUrl, setNewUrl] = useState("");
  const [newEvents, setNewEvents] = useState<string[]>(["call.completed"]);
  const [newSecret, setNewSecret] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);

  const { data: webhooks = [], isLoading } = useQuery({
    queryKey: ["webhook-subscriptions", userId],
    queryFn: async () => {
      const { data, error } = await supabase.from("webhook_subscriptions" as any).select("*").eq("user_id", userId).order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as WebhookSub[];
    },
    enabled: !!userId,
  });

  const createWebhook = useMutation({
    mutationFn: async () => {
      if (!newUrl.trim()) throw new Error("URL required");
      const { error } = await supabase.from("webhook_subscriptions" as any).insert({ user_id: userId, url: newUrl.trim(), events: newEvents, secret: newSecret || null });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["webhook-subscriptions"] });
      setNewUrl(""); setNewEvents(["call.completed"]); setNewSecret(""); setShowForm(false);
      toast.success("Webhook created!");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteWebhook = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("webhook_subscriptions" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["webhook-subscriptions"] }); toast.success("Webhook deleted"); },
  });

  const toggleWebhook = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("webhook_subscriptions" as any).update({ active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["webhook-subscriptions"] }),
  });

  const testWebhook = async (webhook: WebhookSub) => {
    setTestingId(webhook.id);
    try {
      const { data } = await supabase.functions.invoke("integrations-hub", {
        body: { action: "test_webhook", payload: { url: webhook.url, event_type: webhook.events[0] ?? "call.completed" } },
      });
      if (data?.success) toast.success(`Test delivered to ${webhook.url}`);
      else toast.error(`Test failed: server returned ${data?.status}`);
    } catch (e: any) {
      toast.error("Test failed: " + e.message);
    } finally {
      setTestingId(null);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.09)",
    borderRadius: 10, padding: "9px 12px", color: "#f0f6fc", fontSize: 13,
    fontFamily: "'DM Sans', sans-serif", outline: "none",
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#f0f6fc", fontFamily: "'Bricolage Grotesque', sans-serif" }}>
            Webhooks
          </h3>
          <p style={{ margin: "3px 0 0", fontSize: 12, color: "rgba(255,255,255,.35)" }}>
            Receive real-time events when calls complete, summaries generate, or deals update
          </p>
        </div>
        <button
          onClick={() => setShowForm(p => !p)}
          style={{
            display: "flex", alignItems: "center", gap: 6, padding: "8px 14px",
            background: showForm ? "rgba(255,255,255,.08)" : "linear-gradient(135deg,#7c3aed,#6d28d9)",
            border: "none", borderRadius: 9, color: "#fff", fontSize: 12, fontWeight: 600,
            cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
          }}
        >
          <Plus style={{ width: 13, height: 13 }} /> Add Webhook
        </button>
      </div>

      {/* New webhook form */}
      {showForm && (
        <div style={{
          background: "rgba(124,58,237,.06)", border: "1px solid rgba(124,58,237,.2)",
          borderRadius: 14, padding: 18, marginBottom: 14,
        }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,.4)", textTransform: "uppercase", letterSpacing: ".07em", display: "block", marginBottom: 5 }}>
                Endpoint URL *
              </label>
              <input
                style={inputStyle} placeholder="https://your-app.com/webhooks/fixsense"
                value={newUrl} onChange={e => setNewUrl(e.target.value)}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,.4)", textTransform: "uppercase", letterSpacing: ".07em", display: "block", marginBottom: 8 }}>
                Events to subscribe
              </label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {WEBHOOK_EVENTS.map(ev => {
                  const on = newEvents.includes(ev.id);
                  return (
                    <button key={ev.id}
                      onClick={() => setNewEvents(p => on ? p.filter(x => x !== ev.id) : [...p, ev.id])}
                      title={ev.desc}
                      style={{
                        padding: "5px 12px", borderRadius: 20, fontSize: 11, fontWeight: 600,
                        cursor: "pointer", transition: ".12s", fontFamily: "'DM Sans', sans-serif",
                        background: on ? "rgba(124,58,237,.2)" : "rgba(255,255,255,.04)",
                        border: `1px solid ${on ? "rgba(124,58,237,.4)" : "rgba(255,255,255,.08)"}`,
                        color: on ? "#a78bfa" : "rgba(255,255,255,.4)",
                      }}
                    >
                      {ev.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,.4)", textTransform: "uppercase", letterSpacing: ".07em", display: "block", marginBottom: 5 }}>
                Secret (optional, for HMAC signing)
              </label>
              <input style={inputStyle} placeholder="whsec_..." value={newSecret} onChange={e => setNewSecret(e.target.value)} type="password" />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setShowForm(false)} style={{ flex: 1, padding: "9px", background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 9, color: "rgba(255,255,255,.5)", fontSize: 13, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
                Cancel
              </button>
              <button
                onClick={() => createWebhook.mutate()}
                disabled={!newUrl.trim() || createWebhook.isPending || newEvents.length === 0}
                style={{
                  flex: 2, padding: "9px", background: "linear-gradient(135deg,#7c3aed,#6d28d9)",
                  border: "none", borderRadius: 9, color: "#fff", fontSize: 13, fontWeight: 700,
                  cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
                  opacity: (!newUrl.trim() || newEvents.length === 0) ? .4 : 1,
                }}
              >
                {createWebhook.isPending ? "Creating…" : "Create Webhook"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Webhook list */}
      {isLoading ? (
        <div style={{ padding: "24px 0", textAlign: "center", color: "rgba(255,255,255,.25)", fontSize: 13 }}>Loading…</div>
      ) : webhooks.length === 0 ? (
        <div style={{ padding: "32px 16px", textAlign: "center", background: "rgba(255,255,255,.02)", border: "1px dashed rgba(255,255,255,.08)", borderRadius: 14 }}>
          <Globe style={{ width: 28, height: 28, color: "rgba(255,255,255,.15)", margin: "0 auto 8px" }} />
          <p style={{ margin: 0, fontSize: 13, color: "rgba(255,255,255,.25)" }}>No webhooks yet</p>
          <p style={{ margin: "4px 0 0", fontSize: 11, color: "rgba(255,255,255,.15)" }}>Add an endpoint to receive real-time events</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {webhooks.map(wh => (
            <div key={wh.id} style={{
              display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
              background: "rgba(255,255,255,.025)", border: "1px solid rgba(255,255,255,.07)",
              borderRadius: 12, flexWrap: "wrap",
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <Globe style={{ width: 12, height: 12, color: wh.active ? "#22c55e" : "rgba(255,255,255,.3)", flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#f0f6fc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{wh.url}</span>
                </div>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  {wh.events.map(ev => (
                    <span key={ev} style={{ fontSize: 10, color: "rgba(255,255,255,.4)", background: "rgba(124,58,237,.1)", border: "1px solid rgba(124,58,237,.2)", borderRadius: 20, padding: "1px 7px" }}>
                      {ev}
                    </span>
                  ))}
                  {wh.last_triggered && (
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,.25)" }}>· Last: {fmtRelative(wh.last_triggered)}</span>
                  )}
                  {wh.failure_count > 0 && (
                    <span style={{ fontSize: 10, color: "#f87171" }}>· {wh.failure_count} failures</span>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                <button
                  onClick={() => testWebhook(wh)}
                  disabled={testingId === wh.id}
                  title="Send test event"
                  style={{ width: 28, height: 28, borderRadius: 7, background: "rgba(96,165,250,.1)", border: "1px solid rgba(96,165,250,.2)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#60a5fa" }}
                >
                  <Send style={{ width: 11, height: 11 }} />
                </button>
                <button
                  onClick={() => toggleWebhook.mutate({ id: wh.id, active: !wh.active })}
                  title={wh.active ? "Disable" : "Enable"}
                  style={{ width: 28, height: 28, borderRadius: 7, background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.08)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: wh.active ? "#22c55e" : "rgba(255,255,255,.3)" }}
                >
                  {wh.active ? <ToggleRight style={{ width: 13, height: 13 }} /> : <ToggleLeft style={{ width: 13, height: 13 }} />}
                </button>
                <button
                  onClick={() => deleteWebhook.mutate(wh.id)}
                  title="Delete"
                  style={{ width: 28, height: 28, borderRadius: 7, background: "rgba(239,68,68,.07)", border: "1px solid rgba(239,68,68,.15)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#f87171" }}
                >
                  <Trash2 style={{ width: 11, height: 11 }} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── API Keys Section ─────────────────────────────────────────────────────────

function ApiKeysSection({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newScopes, setNewScopes] = useState(["calls:read", "summaries:read"]);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);

  const { data: keys = [] } = useQuery({
    queryKey: ["api-keys", userId],
    queryFn: async () => {
      const { data, error } = await supabase.from("api_keys" as any).select("*").eq("user_id", userId).eq("revoked", false).order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as ApiKey[];
    },
    enabled: !!userId,
  });

  const createKey = useMutation({
    mutationFn: async () => {
      if (!newName.trim()) throw new Error("Name required");
      const rawKey = `fxs_${crypto.randomUUID().replace(/-/g, "")}`;
      const prefix = rawKey.slice(0, 14);
      const { error } = await supabase.from("api_keys" as any).insert({ user_id: userId, key_hash: rawKey, key_prefix: prefix, name: newName.trim(), scopes: newScopes });
      if (error) throw error;
      return rawKey;
    },
    onSuccess: (key) => {
      setGeneratedKey(key);
      qc.invalidateQueries({ queryKey: ["api-keys"] });
      setNewName(""); setNewScopes(["calls:read", "summaries:read"]); setShowNew(false);
      toast.success("API key created — copy it now, it won't be shown again");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const revokeKey = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("api_keys" as any).update({ revoked: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["api-keys"] }); toast.success("Key revoked"); },
  });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#f0f6fc", fontFamily: "'Bricolage Grotesque', sans-serif" }}>API Keys</h3>
          <p style={{ margin: "3px 0 0", fontSize: 12, color: "rgba(255,255,255,.35)" }}>Use API keys to access Fixsense data from your own apps</p>
        </div>
        <button
          onClick={() => setShowNew(p => !p)}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: "linear-gradient(135deg,#7c3aed,#6d28d9)", border: "none", borderRadius: 9, color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}
        >
          <Plus style={{ width: 13, height: 13 }} /> New Key
        </button>
      </div>

      {/* Generated key banner */}
      {generatedKey && (
        <div style={{ background: "rgba(34,197,94,.08)", border: "1px solid rgba(34,197,94,.25)", borderRadius: 12, padding: "12px 16px", marginBottom: 12, display: "flex", alignItems: "center", gap: 10 }}>
          <Shield style={{ width: 16, height: 16, color: "#22c55e", flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: "0 0 3px", fontSize: 11, fontWeight: 700, color: "#22c55e", textTransform: "uppercase", letterSpacing: ".06em" }}>Your new API key — copy now!</p>
            <code style={{ fontSize: 12, color: "#f0f6fc", wordBreak: "break-all" }}>{generatedKey}</code>
          </div>
          <button onClick={() => { navigator.clipboard.writeText(generatedKey); toast.success("Copied!"); }} style={{ background: "none", border: "1px solid rgba(34,197,94,.3)", borderRadius: 7, padding: "5px 10px", color: "#22c55e", fontSize: 11, cursor: "pointer" }}>
            <Copy style={{ width: 11, height: 11 }} />
          </button>
          <button onClick={() => setGeneratedKey(null)} style={{ background: "none", border: "none", color: "rgba(255,255,255,.3)", cursor: "pointer", fontSize: 16 }}>×</button>
        </div>
      )}

      {/* New key form */}
      {showNew && (
        <div style={{ background: "rgba(124,58,237,.06)", border: "1px solid rgba(124,58,237,.2)", borderRadius: 14, padding: 16, marginBottom: 12 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input
              style={{ width: "100%", background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.09)", borderRadius: 9, padding: "9px 12px", color: "#f0f6fc", fontSize: 13, fontFamily: "'DM Sans', sans-serif", outline: "none" }}
              placeholder="Key name (e.g. My Dashboard App)"
              value={newName} onChange={e => setNewName(e.target.value)}
            />
            <div>
              <p style={{ margin: "0 0 7px", fontSize: 11, color: "rgba(255,255,255,.4)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em" }}>Scopes</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {API_SCOPES.map(s => {
                  const on = newScopes.includes(s);
                  return (
                    <button key={s}
                      onClick={() => setNewScopes(p => on ? p.filter(x => x !== s) : [...p, s])}
                      style={{ padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", background: on ? "rgba(124,58,237,.2)" : "rgba(255,255,255,.04)", border: `1px solid ${on ? "rgba(124,58,237,.4)" : "rgba(255,255,255,.08)"}`, color: on ? "#a78bfa" : "rgba(255,255,255,.4)" }}
                    >{s}</button>
                  );
                })}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setShowNew(false)} style={{ flex: 1, padding: "8px", background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 9, color: "rgba(255,255,255,.5)", fontSize: 13, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Cancel</button>
              <button onClick={() => createKey.mutate()} disabled={!newName.trim() || createKey.isPending} style={{ flex: 2, padding: "8px", background: "linear-gradient(135deg,#7c3aed,#6d28d9)", border: "none", borderRadius: 9, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", opacity: !newName.trim() ? .4 : 1 }}>
                {createKey.isPending ? "Creating…" : "Create Key"}
              </button>
            </div>
          </div>
        </div>
      )}

      {keys.length === 0 ? (
        <div style={{ padding: "28px 16px", textAlign: "center", background: "rgba(255,255,255,.02)", border: "1px dashed rgba(255,255,255,.08)", borderRadius: 14 }}>
          <Key style={{ width: 26, height: 26, color: "rgba(255,255,255,.15)", margin: "0 auto 8px" }} />
          <p style={{ margin: 0, fontSize: 13, color: "rgba(255,255,255,.25)" }}>No API keys yet</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {keys.map(k => (
            <div key={k.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", background: "rgba(255,255,255,.025)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 10 }}>
              <Key style={{ width: 14, height: 14, color: "rgba(255,255,255,.3)", flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 600, color: "#f0f6fc" }}>{k.name}</p>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <code style={{ fontSize: 11, color: "rgba(255,255,255,.4)" }}>{k.key_prefix}…</code>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,.25)" }}>Created {fmtDate(k.created_at)}</span>
                  {k.last_used_at && <span style={{ fontSize: 10, color: "rgba(255,255,255,.25)" }}>· Used {fmtRelative(k.last_used_at)}</span>}
                </div>
              </div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {k.scopes.slice(0, 2).map(s => <span key={s} style={{ fontSize: 10, color: "rgba(255,255,255,.35)", background: "rgba(255,255,255,.05)", borderRadius: 20, padding: "1px 7px" }}>{s}</span>)}
                {k.scopes.length > 2 && <span style={{ fontSize: 10, color: "rgba(255,255,255,.25)" }}>+{k.scopes.length - 2}</span>}
              </div>
              <button onClick={() => revokeKey.mutate(k.id)} style={{ width: 27, height: 27, borderRadius: 7, background: "rgba(239,68,68,.07)", border: "1px solid rgba(239,68,68,.15)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#f87171", flexShrink: 0 }}>
                <Trash2 style={{ width: 11, height: 11 }} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ title, icon: Icon, children, desc }: { title: string; icon: React.ElementType; children: React.ReactNode; desc?: string }) {
  return (
    <div style={{ marginBottom: 36 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: desc ? 4 : 16 }}>
        <div style={{ width: 32, height: 32, borderRadius: 9, background: "rgba(59,130,246,.12)", border: "1px solid rgba(59,130,246,.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon style={{ width: 15, height: 15, color: "#60a5fa" }} />
        </div>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "#f0f6fc", fontFamily: "'Bricolage Grotesque', sans-serif" }}>{title}</h2>
      </div>
      {desc && <p style={{ margin: "0 0 16px", fontSize: 13, color: "rgba(255,255,255,.38)", paddingLeft: 41 }}>{desc}</p>}
      {children}
    </div>
  );
}

// ─── Connected Apps Overview ──────────────────────────────────────────────────

function ConnectedAppsOverview({ integrations }: { integrations: Integration[] }) {
  const connected = integrations.filter(i => i.status === "connected");
  const allProviders = [...CALENDAR_PROVIDERS, ...CRM_PROVIDERS, ...COMM_PROVIDERS];

  if (connected.length === 0) return (
    <div style={{ padding: "20px", background: "rgba(255,255,255,.02)", border: "1px dashed rgba(255,255,255,.07)", borderRadius: 14, textAlign: "center" }}>
      <Activity style={{ width: 24, height: 24, color: "rgba(255,255,255,.15)", margin: "0 auto 8px" }} />
      <p style={{ margin: 0, fontSize: 13, color: "rgba(255,255,255,.25)" }}>No apps connected yet</p>
    </div>
  );

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
      {connected.map(int => {
        const meta = allProviders.find(p => p.id === int.provider);
        return (
          <div key={int.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", background: "rgba(34,197,94,.04)", border: "1px solid rgba(34,197,94,.15)", borderRadius: 12 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: meta?.logoBg ?? "rgba(255,255,255,.05)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: meta?.logoColor ?? "rgba(255,255,255,.5)", flexShrink: 0 }}>
              {meta?.logo ?? int.provider[0].toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: "0 0 2px", fontSize: 12, fontWeight: 600, color: "#f0f6fc" }}>{meta?.name ?? int.provider}</p>
              {int.account_email ? (
                <p style={{ margin: 0, fontSize: 10, color: "rgba(255,255,255,.35)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{int.account_email}</p>
              ) : (
                <p style={{ margin: 0, fontSize: 10, color: "#22c55e" }}>Connected</p>
              )}
            </div>
            <CheckCircle2 style={{ width: 14, height: 14, color: "#22c55e", flexShrink: 0 }} />
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Dashboard Integrations Page ────────────────────────────────────────

export function IntegrationsDashboardPage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const DEFAULT_PROVIDERS = ["zoom", "google_meet", "teams", "salesforce", "hubspot", "slack"];

  const { data: integrations = [], isLoading } = useQuery({
    queryKey: ["integrations", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      // Ensure all default rows exist
      await supabase.from("integrations").upsert(
        DEFAULT_PROVIDERS.map(p => ({ user_id: user.id, provider: p, status: "disconnected" })),
        { onConflict: "user_id,provider", ignoreDuplicates: true }
      );
      const { data } = await supabase.from("integrations").select("*").eq("user_id", user.id);
      return (data || []) as Integration[];
    },
    enabled: !!user?.id,
    staleTime: 30_000,
  });

  const intMap = new Map(integrations.map(i => [i.provider, i]));

  const connectProvider = useMutation({
    mutationFn: async (provider: string) => {
      const redirectUri = `${window.location.origin}/settings`;
      const { data, error } = await supabase.functions.invoke("oauth-connect", {
        body: { provider, redirect_uri: redirectUri },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as { url: string };
    },
    onSuccess: (data) => {
      const w = 600, h = 700;
      window.open(data.url, "oauth-popup", `width=${w},height=${h},left=${(window.innerWidth - w) / 2},top=${(window.innerHeight - h) / 2},popup=1`);
    },
    onError: (e: any) => toast.error(e.message || "Failed to start connection"),
  });

  const disconnectProvider = useMutation({
    mutationFn: async (provider: string) => {
      const { error } = await supabase.functions.invoke("oauth-disconnect", { body: { provider } });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["integrations"] });
      toast.success("Integration disconnected");
    },
    onError: (e: any) => toast.error(e.message || "Failed to disconnect"),
  });

  // Listen for OAuth popup success
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === "oauth-success") {
        qc.invalidateQueries({ queryKey: ["integrations"] });
        toast.success(`${event.data.provider} connected!`);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [qc]);

  return (
    <DashboardLayout>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@600;700;800&family=DM+Sans:wght@300;400;500;600&display=swap');
      `}</style>

      <div style={{ maxWidth: 840, margin: "0 auto", fontFamily: "'DM Sans', sans-serif" }}>
        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ margin: "0 0 6px", fontSize: 26, fontWeight: 800, color: "#f0f6fc", fontFamily: "'Bricolage Grotesque', sans-serif" }}>
            Integrations
          </h1>
          <p style={{ margin: 0, fontSize: 14, color: "rgba(255,255,255,.4)" }}>
            Connect your tools to unlock automatic sync, real-time insights, and workflow automation
          </p>
        </div>

        {/* Connected Apps Overview */}
        {integrations.some(i => i.status === "connected") && (
          <div style={{ marginBottom: 32 }}>
            <Section title="Connected Apps" icon={Activity} desc="All your active integrations at a glance">
              <ConnectedAppsOverview integrations={integrations} />
            </Section>
          </div>
        )}

        {/* Calendar */}
        <Section title="Calendar & Meetings" icon={Calendar} desc="Connect your calendar to auto-sync meetings and enable AI transcription">
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {CALENDAR_PROVIDERS.map(p => (
              <ProviderCard
                key={p.id}
                provider={p}
                integration={intMap.get(p.id)}
                onConnect={(id) => connectProvider.mutate(id)}
                onDisconnect={(id) => disconnectProvider.mutate(id)}
                isConnecting={connectProvider.isPending}
                isDisconnecting={disconnectProvider.isPending}
              />
            ))}
          </div>
        </Section>

        {/* CRM */}
        <Section title="CRM Integrations" icon={Database} desc="Sync contacts, deals, and push AI-generated call intelligence to your CRM">
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {CRM_PROVIDERS.map(p => (
              <ProviderCard
                key={p.id}
                provider={p as any}
                integration={intMap.get(p.id)}
                onConnect={(id) => connectProvider.mutate(id)}
                onDisconnect={(id) => disconnectProvider.mutate(id)}
                isConnecting={connectProvider.isPending}
                isDisconnecting={disconnectProvider.isPending}
              />
            ))}
          </div>
        </Section>

        {/* Communications */}
        <Section title="Communication" icon={Mail} desc="Send notifications and summaries to your team's communication tools">
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {COMM_PROVIDERS.map(p => (
              <ProviderCard
                key={p.id}
                provider={p}
                integration={intMap.get(p.id)}
                onConnect={(id) => connectProvider.mutate(id)}
                onDisconnect={(id) => disconnectProvider.mutate(id)}
                isConnecting={connectProvider.isPending}
                isDisconnecting={disconnectProvider.isPending}
              />
            ))}
          </div>
        </Section>

        {/* Webhooks */}
        <Section title="Webhooks" icon={Zap} desc="Receive real-time events when calls complete, summaries generate, or deals change">
          <div style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 16, padding: "20px 22px" }}>
            {user?.id && <WebhooksSection userId={user.id} />}
          </div>
        </Section>

        {/* API Keys */}
        <Section title="API Keys" icon={Key} desc="Programmatically access Fixsense data from your own applications">
          <div style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 16, padding: "20px 22px" }}>
            {user?.id && <ApiKeysSection userId={user.id} />}
          </div>
        </Section>
      </div>
    </DashboardLayout>
  );
}

// ─── Public marketing page (keeps backward compat with MarketingPages.tsx) ───

export function IntegrationsPage() {
  return (
    <div style={{ minHeight: "100vh", background: "#060912", padding: "80px 20px", fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@700;800&family=DM+Sans:wght@400;500;600&display=swap');`}</style>
      <div style={{ maxWidth: 960, margin: "0 auto", textAlign: "center" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(59,130,246,.1)", border: "1px solid rgba(59,130,246,.25)", borderRadius: 20, padding: "5px 14px", fontSize: 12, fontWeight: 600, color: "#60a5fa", marginBottom: 20 }}>
          <Zap style={{ width: 11, height: 11 }} /> Integrations
        </div>
        <h1 style={{ margin: "0 0 16px", fontSize: 48, fontWeight: 800, color: "#f0f6fc", fontFamily: "'Bricolage Grotesque', sans-serif", lineHeight: 1.1 }}>
          Connect your entire<br /><span style={{ background: "linear-gradient(135deg,#60a5fa,#a78bfa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>sales stack</span>
        </h1>
        <p style={{ margin: "0 0 60px", fontSize: 18, color: "rgba(255,255,255,.45)", lineHeight: 1.65, maxWidth: 560, marginLeft: "auto", marginRight: "auto" }}>
          Fixsense connects with your calendar, CRM, and communication tools to deliver AI-powered sales intelligence where you already work.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16, textAlign: "left" }}>
          {[...CALENDAR_PROVIDERS, ...CRM_PROVIDERS, ...COMM_PROVIDERS].map(p => (
            <div key={p.id} style={{ background: "rgba(255,255,255,.025)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 16, padding: "20px 20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 11, background: p.logoBg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color: p.logoColor, flexShrink: 0 }}>
                  {p.logo}
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#f0f6fc", fontFamily: "'Bricolage Grotesque', sans-serif" }}>{p.name}</p>
                  <p style={{ margin: 0, fontSize: 10, color: "rgba(255,255,255,.3)", textTransform: "capitalize" }}>{p.category}</p>
                </div>
              </div>
              <p style={{ margin: "0 0 12px", fontSize: 12, color: "rgba(255,255,255,.45)", lineHeight: 1.5 }}>{p.description}</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {p.features.slice(0, 2).map(f => (
                  <span key={f} style={{ fontSize: 10, color: "rgba(255,255,255,.35)", background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 20, padding: "2px 8px" }}>{f}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default IntegrationsDashboardPage;