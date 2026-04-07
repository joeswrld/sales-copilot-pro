/**
 * CrmFieldMappings.tsx
 * Settings panel for configuring which Fixsense fields map to which CRM properties.
 */

import { useState } from "react";
import { useCrmFieldMappings, type CrmProvider } from "@/hooks/useCrmSync";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Save, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

const FIELD_LABELS: Record<string, { label: string; desc: string }> = {
  call_score:       { label: "Call Score",       desc: "AI-generated quality score for the call" },
  talk_ratio:       { label: "Talk Ratio",        desc: "Rep speaking percentage (0–100)" },
  objection_count:  { label: "Objection Count",   desc: "Number of objections detected" },
  sentiment_score:  { label: "Sentiment Score",   desc: "Prospect sentiment percentage (0–100)" },
};

interface Props {
  provider: CrmProvider;
}

export default function CrmFieldMappings({ provider }: Props) {
  const { mappings, isLoading, updateMapping, initDefaultMappings } = useCrmFieldMappings(provider);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const handleSave = async (id: string) => {
    setSaving(id);
    await updateMapping.mutateAsync({ id, crm_property: editValues[id] });
    setSaving(null);
    setEditValues((prev) => { const next = { ...prev }; delete next[id]; return next; });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">Property Mapping</p>
          <p className="text-xs text-muted-foreground">
            Map Fixsense metrics to {provider === "hubspot" ? "HubSpot" : "Salesforce"} custom properties
          </p>
        </div>
        {mappings.length === 0 && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => initDefaultMappings.mutate(provider)}
            disabled={initDefaultMappings.isPending}
            className="gap-1.5 text-xs"
          >
            <RefreshCw className="w-3 h-3" /> Init Defaults
          </Button>
        )}
      </div>

      {mappings.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No mappings yet. Click "Init Defaults" to create standard mappings.
        </div>
      ) : (
        <div className="space-y-2">
          {mappings.map((m) => {
            const meta = FIELD_LABELS[m.fixsense_field] || { label: m.fixsense_field, desc: "" };
            const currentValue = editValues[m.id] ?? m.crm_property;
            const isDirty = editValues[m.id] !== undefined && editValues[m.id] !== m.crm_property;

            return (
              <div
                key={m.id}
                className={cn(
                  "rounded-lg border p-3 transition-colors",
                  m.enabled ? "border-border bg-card" : "border-border/40 bg-card/50 opacity-60"
                )}
              >
                <div className="flex items-start gap-3">
                  <Switch
                    checked={m.enabled}
                    onCheckedChange={(v) => updateMapping.mutate({ id: m.id, enabled: v })}
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium">{meta.label}</span>
                      <span className="text-xs text-muted-foreground font-mono bg-secondary px-1.5 py-0.5 rounded">
                        {m.fixsense_field}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">{meta.desc}</p>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">→</span>
                      <Input
                        value={currentValue}
                        onChange={(e) =>
                          setEditValues((prev) => ({ ...prev, [m.id]: e.target.value }))
                        }
                        placeholder="crm_property_name"
                        className="h-7 text-xs font-mono flex-1"
                        disabled={!m.enabled}
                      />
                      {isDirty && (
                        <Button
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={() => handleSave(m.id)}
                          disabled={saving === m.id}
                        >
                          {saving === m.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Save className="w-3 h-3" />
                          )}
                          Save
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}