/**
 * PostCallIntegrations.tsx
 * Shown in CallDetail after a call is completed.
 * One-click Gmail draft, Asana task creation, Notion sync, CRM push.
 */

import { useState } from "react";
import {
  Mail, CheckSquare, FileText, RefreshCw,
  Loader2, Check, ChevronDown, ChevronUp,
  Sparkles, ExternalLink, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useGmailDraft, useAsanaTask, useNotionConfig } from "@/hooks/useIntegrations";
import { useSyncCallToCrm } from "@/hooks/useCrmSync";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Props {
  callId: string;
  actionItems?: string[];
  userId: string;
}

type ActionStatus = "idle" | "loading" | "done" | "error";

interface ActionState {
  gmail: ActionStatus;
  asana: ActionStatus;
  notion: ActionStatus;
  crm: ActionStatus;
  postCall: ActionStatus;
}

export default function PostCallIntegrations({ callId, actionItems = [], userId }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [states, setStates] = useState<ActionState>({
    gmail: "idle", asana: "idle", notion: "idle", crm: "idle", postCall: "idle",
  });
  const [gmailDraft, setGmailDraft] = useState<{ subject: string; body: string } | null>(null);

  const { generateDraft, openInGmail } = useGmailDraft();
  const { createTask } = useAsanaTask();
  const { config: notionConfig, syncCall } = useNotionConfig();
  const { syncMetrics, runPostCallTriggers } = useSyncCallToCrm();

  const setState = (key: keyof ActionState, status: ActionStatus) =>
    setStates((prev) => ({ ...prev, [key]: status }));

  const handleGmail = async () => {
    setState("gmail", "loading");
    try {
      const draft = await generateDraft.mutateAsync(callId);
      setGmailDraft(draft);
      setState("gmail", "done");
    } catch {
      setState("gmail", "error");
    }
  };

  const handleAsana = async () => {
    if (actionItems.length === 0) {
      toast.info("No action items found to create tasks from.");
      return;
    }
    setState("asana", "loading");
    try {
      await Promise.all(
        actionItems.slice(0, 5).map((item) =>
          createTask.mutateAsync({ callId, actionItem: item })
        )
      );
      setState("asana", "done");
    } catch {
      setState("asana", "error");
    }
  };

  const handleNotion = async () => {
    if (!notionConfig?.enabled || !notionConfig?.database_id) {
      toast.info("Configure Notion in Settings → Integrations first.");
      return;
    }
    setState("notion", "loading");
    try {
      await syncCall.mutateAsync(callId);
      setState("notion", "done");
    } catch {
      setState("notion", "error");
    }
  };

  const handleRunAll = async () => {
    setState("postCall", "loading");
    try {
      await runPostCallTriggers.mutateAsync(callId);
      setState("postCall", "done");
    } catch {
      setState("postCall", "error");
    }
  };

  const allDone = Object.values(states).every((s) => s === "done" || s === "idle");

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        className="w-full flex items-center justify-between p-4 hover:bg-secondary/30 transition-colors"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
            <Zap className="w-4 h-4 text-accent" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold">Post-Call Integrations</p>
            <p className="text-xs text-muted-foreground">Gmail · Asana · Notion · CRM</p>
          </div>
          {states.postCall === "done" && (
            <Badge className="bg-green-500/10 text-green-400 border-green-500/20 text-xs">
              <Check className="w-3 h-3 mr-1" /> All triggered
            </Badge>
          )}
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>

      {expanded && (
        <div className="border-t border-border p-4 space-y-4">
          {/* Run all button */}
          <Button
            className="w-full gap-2"
            onClick={handleRunAll}
            disabled={states.postCall === "loading" || states.postCall === "done"}
          >
            {states.postCall === "loading" ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : states.postCall === "done" ? (
              <Check className="w-4 h-4" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            {states.postCall === "done" ? "All integrations triggered" : "Run All Integrations"}
          </Button>

          <div className="text-xs text-center text-muted-foreground">or trigger individually</div>

          {/* Individual actions */}
          <div className="space-y-2">
            {/* Gmail */}
            <ActionRow
              icon={<Mail className="w-4 h-4" />}
              label="Generate follow-up email"
              description="AI-drafted email ready to send in Gmail"
              status={states.gmail}
              onRun={handleGmail}
            >
              {gmailDraft && (
                <div className="mt-2 space-y-2">
                  <div className="rounded-lg bg-secondary/40 p-3 text-xs space-y-1">
                    <p className="font-semibold">{gmailDraft.subject}</p>
                    <p className="text-muted-foreground whitespace-pre-wrap line-clamp-4">
                      {gmailDraft.body}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-xs"
                    onClick={() => openInGmail(gmailDraft)}
                  >
                    <ExternalLink className="w-3 h-3" /> Open in Gmail
                  </Button>
                </div>
              )}
            </ActionRow>

            {/* Asana */}
            <ActionRow
              icon={<CheckSquare className="w-4 h-4" />}
              label={`Create Asana tasks (${actionItems.length} items)`}
              description="Action items from this call become Asana tasks"
              status={states.asana}
              onRun={handleAsana}
            />

            {/* Notion */}
            <ActionRow
              icon={<FileText className="w-4 h-4" />}
              label="Sync to Notion"
              description="Push summary and insights to your Notion database"
              status={states.notion}
              onRun={handleNotion}
              disabled={!notionConfig?.enabled}
              disabledReason="Configure Notion in Integrations settings first"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function ActionRow({
  icon,
  label,
  description,
  status,
  onRun,
  disabled,
  disabledReason,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  status: ActionStatus;
  onRun: () => void;
  disabled?: boolean;
  disabledReason?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-secondary/20 p-3">
      <div className="flex items-center gap-3">
        <div className={cn(
          "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
          status === "done" ? "bg-green-500/10 text-green-400" :
          status === "error" ? "bg-red-500/10 text-red-400" :
          "bg-primary/10 text-primary"
        )}>
          {status === "done" ? <Check className="w-4 h-4" /> :
           status === "loading" ? <Loader2 className="w-4 h-4 animate-spin" /> :
           icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">{disabled ? disabledReason : description}</p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs shrink-0 gap-1"
          onClick={onRun}
          disabled={status === "loading" || status === "done" || disabled}
        >
          {status === "done" ? <Check className="w-3 h-3" /> : <RefreshCw className="w-3 h-3" />}
          {status === "done" ? "Done" : "Run"}
        </Button>
      </div>
      {children}
    </div>
  );
}