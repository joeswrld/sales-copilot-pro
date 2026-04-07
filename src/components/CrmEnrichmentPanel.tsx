/**
 * CrmEnrichmentPanel.tsx
 * Shown in CallDetail view — fetches and displays CRM contact/deal data
 * merged with call context.
 */

import { useState } from "react";
import {
  Building2, User, DollarSign, TrendingUp, Clock,
  ChevronDown, ChevronUp, RefreshCw, Loader2,
  ExternalLink, AlertTriangle, CheckCircle2
} from "lucide-react";
import { useCrmContactForCall, useSyncCallToCrm } from "@/hooks/useCrmSync";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface Props {
  callId: string;
  sentimentScore?: number | null;
}

const STAGE_COLOR: Record<string, string> = {
  "discovery":    "bg-blue-500/10 text-blue-400 border-blue-500/20",
  "demo":         "bg-purple-500/10 text-purple-400 border-purple-500/20",
  "negotiation":  "bg-orange-500/10 text-orange-400 border-orange-500/20",
  "proposal":     "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  "won":          "bg-green-500/10 text-green-400 border-green-500/20",
  "at_risk":      "bg-red-500/10 text-red-400 border-red-500/20",
  "closedwon":    "bg-green-500/10 text-green-400 border-green-500/20",
  "closedlost":   "bg-muted text-muted-foreground",
};

export default function CrmEnrichmentPanel({ callId, sentimentScore }: Props) {
  const [expanded, setExpanded] = useState(true);
  const { contact, isLoading, refetch } = useCrmContactForCall(callId);
  const { syncMetrics } = useSyncCallToCrm();

  const isAtRisk = sentimentScore != null && sentimentScore < 40;

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading CRM data…
      </div>
    );
  }

  if (!contact) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/50 p-4 text-center">
        <Building2 className="w-6 h-6 text-muted-foreground mx-auto mb-2 opacity-40" />
        <p className="text-xs text-muted-foreground">No CRM contact linked to this call.</p>
        <Button
          variant="ghost"
          size="sm"
          className="mt-2 text-xs gap-1"
          onClick={() => refetch()}
        >
          <RefreshCw className="w-3 h-3" /> Search CRM
        </Button>
      </div>
    );
  }

  const stageKey = (contact.deal_stage || "").toLowerCase().replace(/\s+/g, "");
  const stageClass = STAGE_COLOR[stageKey] || "bg-secondary text-secondary-foreground";

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <button
        className="w-full flex items-center justify-between p-4 hover:bg-secondary/30 transition-colors"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Building2 className="w-4 h-4 text-primary" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold">CRM Context</p>
            <p className="text-xs text-muted-foreground">{contact.provider === "hubspot" ? "HubSpot" : "Salesforce"} · {contact.company || "Unknown company"}</p>
          </div>
          {isAtRisk && (
            <Badge className="bg-red-500/10 text-red-400 border-red-500/20 text-xs ml-2">
              <AlertTriangle className="w-3 h-3 mr-1" /> At Risk
            </Badge>
          )}
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>

      {expanded && (
        <div className="border-t border-border p-4 space-y-4">
          {/* Contact info */}
          <div className="grid grid-cols-2 gap-3">
            <InfoRow icon={<User className="w-3.5 h-3.5" />} label="Contact" value={contact.name || "—"} />
            <InfoRow icon={<Building2 className="w-3.5 h-3.5" />} label="Company" value={contact.company || "—"} />
            <InfoRow icon={<TrendingUp className="w-3.5 h-3.5" />} label="Role" value={contact.role || "—"} />
            {contact.last_activity && (
              <InfoRow
                icon={<Clock className="w-3.5 h-3.5" />}
                label="Last Activity"
                value={format(new Date(contact.last_activity), "MMM d, yyyy")}
              />
            )}
          </div>

          {/* Deal info */}
          {(contact.deal_stage || contact.deal_value) && (
            <div className="rounded-lg bg-secondary/30 border border-border p-3 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Deal</p>
              <div className="flex items-center justify-between">
                {contact.deal_stage && (
                  <Badge className={cn("text-xs capitalize", stageClass)}>
                    {contact.deal_stage}
                  </Badge>
                )}
                {contact.deal_value != null && (
                  <div className="flex items-center gap-1 text-sm font-bold text-green-400">
                    <DollarSign className="w-3.5 h-3.5" />
                    {contact.deal_value.toLocaleString()}
                  </div>
                )}
              </div>
              {contact.deal_timeline && (
                <p className="text-xs text-muted-foreground">{contact.deal_timeline}</p>
              )}
            </div>
          )}

          {/* At-risk alert */}
          {isAtRisk && (
            <div className="rounded-lg bg-red-500/5 border border-red-500/20 p-3">
              <div className="flex items-center gap-2 text-red-400 text-sm font-medium">
                <AlertTriangle className="w-4 h-4" />
                Deal flagged at-risk — sentiment {sentimentScore}%
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                This deal has been automatically updated to "At Risk" in your CRM.
                Improve sentiment on the next call to trigger an auto-recovery.
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs h-7"
              onClick={() => syncMetrics.mutate({ callId, provider: contact.provider })}
              disabled={syncMetrics.isPending}
            >
              {syncMetrics.isPending
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : <CheckCircle2 className="w-3 h-3" />}
              Sync to {contact.provider === "hubspot" ? "HubSpot" : "Salesforce"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="gap-1.5 text-xs h-7 text-muted-foreground"
              onClick={() => refetch()}
            >
              <RefreshCw className="w-3 h-3" /> Refresh
            </Button>
            <div className="ml-auto text-xs text-muted-foreground">
              Synced {contact.synced_at ? format(new Date(contact.synced_at), "MMM d") : "—"}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <div className="text-muted-foreground mt-0.5">{icon}</div>
      <div>
        <p className="text-[10px] uppercase text-muted-foreground tracking-wider">{label}</p>
        <p className="text-sm font-medium truncate">{value}</p>
      </div>
    </div>
  );
}