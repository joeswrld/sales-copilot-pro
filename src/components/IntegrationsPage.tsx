/**
 * IntegrationsPage.tsx
 * Full-featured integrations settings page:
 * - Gmail draft generation
 * - Asana task config
 * - Notion sync config
 * - Teams notifications
 * - Webhook subscriptions (public REST API)
 * - API key management
 * - CRM field mappings
 */

import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import {
  Mail, CheckSquare, FileText, MessageSquare, Webhook,
  Key, Database, Plus, Trash2, Eye, EyeOff, Copy,
  Check, Loader2, ExternalLink, AlertTriangle, ToggleLeft,
  ToggleRight, RefreshCw, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useNotionConfig } from "@/hooks/useIntegrations";
import { useAsanaConfig } from "@/hooks/useIntegrations";
import { useWebhookSubscriptions, WEBHOOK_EVENTS } from "@/hooks/useIntegrations";
import { useApiKeys } from "@/hooks/useIntegrations";
import CrmFieldMappings from "@/components/crm/CrmFieldMappings";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

// ─── Tabs ──────────────────────────────────────────────────────────────────

const TABS = [
  { id: "crm",      label: "CRM Mappings",   icon: Database },
  { id: "notion",   label: "Notion",          icon: FileText },
  { id: "asana",    label: "Asana",           icon: CheckSquare },
  { id: "webhooks", label: "Webhooks",        icon: Webhook },
  { id: "apikeys",  label: "API Keys",        icon: Key },
] as const;

type TabId = typeof TABS[number]["id"];

// ─── Notion Tab ─────────────────────────────────────────────────────────────

function NotionTab() {
  const { config, isLoading, updateConfig } = useNotionConfig();
  const [databaseId, setDatabaseId] = useState(config?.database_id || "");
  const [workspaceName, setWorkspaceName] = useState(config?.workspace_name || "");

  if (isLoading) return <TabSkeleton />;

  return (
    <div className="space-y-6">
      <IntegrationHeader
        icon={<FileText className="w-5 h-5" />}
        title="Notion Integration"
        description="Automatically sync call summaries, action items, and sentiment analysis to a Notion database after each call."
        enabled={config?.enabled ?? false}
        onToggle={(v) => updateConfig.mutate({ enabled: v })}
      />

      <div className="space-y-4">
        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1.5">
            Workspace Name
          </label>
          <Input
            value={workspaceName}
            onChange={(e) => setWorkspaceName(e.target.value)}
            placeholder="My Workspace"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1.5">
            Database ID
          </label>
          <Input
            value={databaseId}
            onChange={(e) => setDatabaseId(e.target.value)}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            className="font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Found in your Notion database URL after the workspace name.
          </p>
        </div>
        <Button
          onClick={() => updateConfig.mutate({ database_id: databaseId, workspace_name: workspaceName })}
          disabled={updateConfig.isPending}
          className="gap-2"
        >
          {updateConfig.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          Save Configuration
        </Button>
      </div>

      <div className="rounded-lg bg-secondary/30 border border-border p-4">
        <p className="text-xs font-semibold text-muted-foreground mb-2">What gets synced</p>
        <ul className="space-y-1 text-sm text-muted-foreground">
          {[
            "Call title, date, duration, platform",
            "AI-generated summary",
            "Action items and next steps",
            "Sentiment score and analysis",
          ].map((item) => (
            <li key={item} className="flex items-center gap-2">
              <Check className="w-3 h-3 text-green-400 shrink-0" />
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ─── Asana Tab ──────────────────────────────────────────────────────────────

function AsanaTab() {
  const { config, isLoading, updateConfig } = useAsanaConfig();
  const [projectGid, setProjectGid] = useState(config?.project_gid || "");
  const [workspaceGid, setWorkspaceGid] = useState(config?.workspace_gid || "");

  if (isLoading) return <TabSkeleton />;

  return (
    <div className="space-y-6">
      <IntegrationHeader
        icon={<CheckSquare className="w-5 h-5" />}
        title="Asana Integration"
        description="Create Asana tasks from call action items automatically. Attach call summaries and assign to team members."
        enabled={config?.enabled ?? false}
        onToggle={(v) => updateConfig.mutate({ enabled: v })}
      />

      <div className="space-y-4">
        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1.5">
            Workspace GID
          </label>
          <Input
            value={workspaceGid}
            onChange={(e) => setWorkspaceGid(e.target.value)}
            placeholder="1234567890"
            className="font-mono text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1.5">
            Default Project GID
          </label>
          <Input
            value={projectGid}
            onChange={(e) => setProjectGid(e.target.value)}
            placeholder="0987654321"
            className="font-mono text-sm"
          />
        </div>
        <Button
          onClick={() => updateConfig.mutate({ project_gid: projectGid, workspace_gid: workspaceGid })}
          disabled={updateConfig.isPending}
          className="gap-2"
        >
          {updateConfig.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          Save Configuration
        </Button>
      </div>

      <div className="rounded-lg bg-primary/5 border border-primary/20 p-4">
        <p className="text-xs font-semibold text-primary mb-2">How it works</p>
        <p className="text-xs text-muted-foreground">
          After each completed call, action items detected by AI are automatically
          created as Asana tasks in your selected project. The call summary is
          attached to each task as a note.
        </p>
      </div>
    </div>
  );
}

// ─── Webhooks Tab ────────────────────────────────────────────────────────────

function WebhooksTab() {
  const { subscriptions, isLoading, createSubscription, deleteSubscription, toggleSubscription } =
    useWebhookSubscriptions();
  const [showForm, setShowForm] = useState(false);
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<string[]>(["call.completed"]);

  const handleCreate = async () => {
    if (!url.trim()) return;
    await createSubscription.mutateAsync({ url: url.trim(), events: selectedEvents, secret: secret || undefined });
    setUrl("");
    setSecret("");
    setShowForm(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Webhook Subscriptions</h3>
          <p className="text-xs text-muted-foreground">
            Receive real-time events when calls complete, deals update, or sentiment thresholds are crossed.
          </p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setShowForm((v) => !v)}>
          <Plus className="w-3 h-3" /> Add Webhook
        </Button>
      </div>

      {showForm && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-4">
          <p className="text-sm font-semibold">New Webhook Subscription</p>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Endpoint URL *</label>
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://your-server.com/webhook" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Signing Secret (optional)</label>
            <Input value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="Used to verify HMAC-SHA256 signature" type="password" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-2">Events to receive</label>
            <div className="flex flex-wrap gap-2">
              {WEBHOOK_EVENTS.map((evt) => (
                <button
                  key={evt}
                  onClick={() =>
                    setSelectedEvents((prev) =>
                      prev.includes(evt) ? prev.filter((e) => e !== evt) : [...prev, evt]
                    )
                  }
                  className={cn(
                    "text-xs px-3 py-1 rounded-full border transition-colors",
                    selectedEvents.includes(evt)
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/40"
                  )}
                >
                  {evt}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleCreate} disabled={createSubscription.isPending || !url.trim()} className="gap-1.5">
              {createSubscription.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Create
            </Button>
            <Button variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {isLoading ? <TabSkeleton /> : subscriptions.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Webhook className="w-8 h-8 mx-auto mb-3 opacity-20" />
          <p className="text-sm">No webhooks configured yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {subscriptions.map((sub) => (
            <div key={sub.id} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-mono text-sm truncate">{sub.url}</p>
                    {sub.failure_count > 3 && (
                      <Badge className="bg-red-500/10 text-red-400 border-red-500/20 text-xs shrink-0">
                        <AlertTriangle className="w-3 h-3 mr-1" /> {sub.failure_count} failures
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1 mb-2">
                    {sub.events.map((evt) => (
                      <Badge key={evt} variant="secondary" className="text-xs">{evt}</Badge>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Created {format(new Date(sub.created_at), "MMM d, yyyy")}
                    {sub.last_triggered && ` · Last triggered ${format(new Date(sub.last_triggered), "MMM d")}`}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Switch
                    checked={sub.active}
                    onCheckedChange={(v) => toggleSubscription.mutate({ id: sub.id, active: v })}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                    onClick={() => deleteSubscription.mutate(sub.id)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Signature docs */}
      <div className="rounded-lg bg-secondary/30 border border-border p-4 text-xs text-muted-foreground space-y-1">
        <p className="font-semibold text-foreground">Verifying webhook signatures</p>
        <p>Each delivery includes a <code className="font-mono bg-secondary px-1 rounded">X-Fixsense-Signature</code> header with an HMAC-SHA256 signature of the payload using your secret.</p>
      </div>
    </div>
  );
}

// ─── API Keys Tab ────────────────────────────────────────────────────────────

function ApiKeysTab() {
  const { apiKeys, isLoading, createKey, revokeKey } = useApiKeys();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCreate = async () => {
    const result = await createKey.mutateAsync({ name });
    setNewKey(result.key);
    setName("");
    setShowForm(false);
  };

  const handleCopy = () => {
    if (!newKey) return;
    navigator.clipboard.writeText(newKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">API Keys</h3>
          <p className="text-xs text-muted-foreground">
            Enterprise REST API authentication. Use these keys to access calls, summaries, and analytics programmatically.
          </p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setShowForm((v) => !v)}>
          <Plus className="w-3 h-3" /> New Key
        </Button>
      </div>

      {newKey && (
        <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-4 space-y-3">
          <p className="text-sm font-semibold text-green-400">✓ API Key Created — Save it now</p>
          <p className="text-xs text-muted-foreground">This key will not be shown again after you leave this page.</p>
          <div className="flex items-center gap-2">
            <code className={cn("flex-1 font-mono text-sm bg-secondary px-3 py-2 rounded-lg", !showKey && "blur-sm")}>
              {newKey}
            </code>
            <Button size="sm" variant="ghost" onClick={() => setShowKey((v) => !v)} className="h-8 w-8 p-0">
              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </Button>
            <Button size="sm" variant="outline" onClick={handleCopy} className="gap-1.5 h-8">
              {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
              {copied ? "Copied!" : "Copy"}
            </Button>
          </div>
          <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => setNewKey(null)}>
            I've saved it, dismiss
          </Button>
        </div>
      )}

      {showForm && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <p className="text-sm font-semibold">New API Key</p>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Key Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Production App, Zapier" />
          </div>
          <div className="flex gap-2">
            <Button onClick={handleCreate} disabled={createKey.isPending || !name.trim()} className="gap-1.5">
              {createKey.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Generate Key
            </Button>
            <Button variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {isLoading ? <TabSkeleton /> : apiKeys.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Key className="w-8 h-8 mx-auto mb-3 opacity-20" />
          <p className="text-sm">No API keys yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {apiKeys.map((key) => (
            <div key={key.id} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-medium">{key.name}</p>
                    <code className="text-xs font-mono bg-secondary px-2 py-0.5 rounded text-muted-foreground">
                      {key.key_prefix}••••••••
                    </code>
                  </div>
                  <div className="flex flex-wrap gap-1 mb-1">
                    {key.scopes.map((scope) => (
                      <Badge key={scope} variant="outline" className="text-xs">{scope}</Badge>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Created {format(new Date(key.created_at), "MMM d, yyyy")}
                    {key.last_used_at && ` · Last used ${format(new Date(key.last_used_at), "MMM d")}`}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive h-7 text-xs"
                  onClick={() => revokeKey.mutate(key.id)}
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1" /> Revoke
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-lg bg-secondary/30 border border-border p-4 text-xs text-muted-foreground space-y-2">
        <p className="font-semibold text-foreground">API Base URL</p>
        <code className="font-mono block bg-secondary px-3 py-2 rounded">
          {import.meta.env.VITE_SUPABASE_URL}/functions/v1/public-api
        </code>
        <p>Include your key in the <code className="font-mono">Authorization: Bearer fxs_...</code> header.</p>
      </div>
    </div>
  );
}

// ─── Shared components ────────────────────────────────────────────────────────

function IntegrationHeader({
  icon, title, description, enabled, onToggle,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
          {icon}
        </div>
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-xs text-muted-foreground">{enabled ? "Enabled" : "Disabled"}</span>
        <Switch checked={enabled} onCheckedChange={onToggle} />
      </div>
    </div>
  );
}

function TabSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-16 rounded-lg bg-secondary/50" />
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function IntegrationsPage() {
  const [activeTab, setActiveTab] = useState<TabId>("crm");

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-3xl">
        <div>
          <h1 className="text-2xl font-bold font-display flex items-center gap-2">
            <Zap className="w-6 h-6 text-primary" /> Integrations
          </h1>
          <p className="text-sm text-muted-foreground">
            Connect Fixsense to your CRM, productivity tools, and enterprise systems.
          </p>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 border-b border-border overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap",
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="glass rounded-xl p-6">
          {activeTab === "crm" && (
            <div className="space-y-8">
              <div>
                <h3 className="text-sm font-semibold mb-4">HubSpot Field Mappings</h3>
                <CrmFieldMappings provider="hubspot" />
              </div>
              <div className="border-t border-border pt-6">
                <h3 className="text-sm font-semibold mb-4">Salesforce Field Mappings</h3>
                <CrmFieldMappings provider="salesforce" />
              </div>
            </div>
          )}
          {activeTab === "notion"   && <NotionTab />}
          {activeTab === "asana"    && <AsanaTab />}
          {activeTab === "webhooks" && <WebhooksTab />}
          {activeTab === "apikeys"  && <ApiKeysTab />}
        </div>
      </div>
    </DashboardLayout>
  );
}