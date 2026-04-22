/**
 * DealsPage.tsx — Full implementation
 * Replaces the blank placeholder DealsPageInner with real deal management UI.
 */

import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useDeals, DEAL_STAGE_CFG, type DealStageValue } from "@/hooks/useDeals";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Plus, Loader2, TrendingUp, TrendingDown, Minus,
  DollarSign, Target, Phone, Calendar, ChevronRight,
  Sparkles, AlertTriangle, Search, X, Building2, User,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function SentimentIcon({ trend }: { trend: string | null }) {
  if (trend === "improving") return <TrendingUp className="w-3.5 h-3.5 text-green-400" />;
  if (trend === "declining") return <TrendingDown className="w-3.5 h-3.5 text-red-400" />;
  return <Minus className="w-3.5 h-3.5 text-muted-foreground" />;
}

function formatCurrency(value: number | null) {
  if (!value) return null;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toLocaleString()}`;
}

// ─── Create Deal Modal ────────────────────────────────────────────────────────

function CreateDealModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { createDeal } = useDeals();
  const [form, setForm] = useState({
    name: "", company: "", contact_name: "", contact_email: "",
    stage: "discovery" as DealStageValue, value: "", notes: "",
  });

  const handleSubmit = async () => {
    if (!form.name.trim()) { toast.error("Deal name is required"); return; }
    await createDeal.mutateAsync({
      name: form.name.trim(),
      company: form.company.trim() || undefined,
      contact_name: form.contact_name.trim() || undefined,
      contact_email: form.contact_email.trim() || undefined,
      stage: form.stage,
      value: form.value ? parseFloat(form.value) : undefined,
      notes: form.notes.trim() || undefined,
    });
    setForm({ name: "", company: "", contact_name: "", contact_email: "", stage: "discovery", value: "", notes: "" });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Deal</DialogTitle>
          <DialogDescription>Track a new sales opportunity</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label className="text-xs">Deal Name *</Label>
            <Input placeholder="e.g. Acme Corp — Enterprise" value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Company</Label>
              <Input placeholder="Company name" value={form.company}
                onChange={e => setForm(f => ({ ...f, company: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Stage</Label>
              <Select value={form.stage} onValueChange={v => setForm(f => ({ ...f, stage: v as DealStageValue }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(DEAL_STAGE_CFG).map(([key, cfg]) => (
                    <SelectItem key={key} value={key}>{cfg.icon} {cfg.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Contact Name</Label>
              <Input placeholder="Contact person" value={form.contact_name}
                onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Deal Value ($)</Label>
              <Input type="number" placeholder="0" value={form.value}
                onChange={e => setForm(f => ({ ...f, value: e.target.value }))} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Notes</Label>
            <Textarea placeholder="Any context about this deal…" rows={2} value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={createDeal.isPending}>
            {createDeal.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Create Deal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Deal Card ────────────────────────────────────────────────────────────────

function DealCard({ deal, onClick }: { deal: any; onClick: () => void }) {
  const stageCfg = DEAL_STAGE_CFG[deal.stage as DealStageValue] ?? DEAL_STAGE_CFG.discovery;

  return (
    <div
      onClick={onClick}
      className="glass rounded-xl p-4 border border-border hover:border-primary/30 cursor-pointer transition-all hover:shadow-lg hover:shadow-primary/5 group"
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm truncate group-hover:text-primary transition-colors">
            {deal.name}
          </p>
          {deal.company && (
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
              <Building2 className="w-3 h-3" />{deal.company}
            </p>
          )}
          {deal.contact_name && (
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
              <User className="w-3 h-3" />{deal.contact_name}
            </p>
          )}
        </div>
        <Badge
          className="text-[10px] px-2 py-0.5 shrink-0"
          style={{ background: stageCfg.bg, color: stageCfg.color, border: `1px solid ${stageCfg.color}30` }}
        >
          {stageCfg.icon} {stageCfg.label}
        </Badge>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-3">
          {deal.value && (
            <span className="flex items-center gap-1 text-foreground font-medium">
              <DollarSign className="w-3 h-3 text-green-400" />
              {formatCurrency(deal.value)}
            </span>
          )}
          {deal.call_count > 0 && (
            <span className="flex items-center gap-1">
              <Phone className="w-3 h-3" />{deal.call_count} call{deal.call_count !== 1 ? "s" : ""}
            </span>
          )}
          {deal.avg_sentiment != null && (
            <span className="flex items-center gap-1">
              <Target className="w-3 h-3" />{Math.round(deal.avg_sentiment)}%
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <SentimentIcon trend={deal.sentiment_trend} />
          {deal.last_call_at && (
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {format(new Date(deal.last_call_at), "MMM d")}
            </span>
          )}
        </div>
      </div>

      {deal.next_step && (
        <div className="mt-2 pt-2 border-t border-border/60">
          <p className="text-[11px] text-muted-foreground flex items-center gap-1">
            <ChevronRight className="w-3 h-3 text-primary shrink-0" />
            <span className="truncate">{deal.next_step}</span>
          </p>
        </div>
      )}

      {deal.risk_score != null && deal.risk_score > 60 && (
        <div className="mt-2 flex items-center gap-1 text-[11px] text-amber-500">
          <AlertTriangle className="w-3 h-3" />
          Risk: {deal.risk_score}%
        </div>
      )}
    </div>
  );
}

// ─── Deal Detail Modal ─────────────────────────────────────────────────────────

function DealDetailModal({ dealId, onClose }: { dealId: string; onClose: () => void }) {
  const { useDealDetail, generateSummary, updateDeal } = useDeals();
  const { data, isLoading } = useDealDetail(dealId);
  const [editingNextStep, setEditingNextStep] = useState(false);
  const [nextStepVal, setNextStepVal] = useState("");

  if (isLoading) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="sm:max-w-lg">
          <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!data) return null;
  const { deal, calls, summary } = data;
  const stageCfg = DEAL_STAGE_CFG[deal.stage as DealStageValue] ?? DEAL_STAGE_CFG.discovery;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>{stageCfg.icon}</span>
            <span className="truncate">{deal.name}</span>
          </DialogTitle>
          {deal.company && (
            <DialogDescription className="flex items-center gap-1">
              <Building2 className="w-3 h-3" />{deal.company}
              {deal.contact_name && <> · {deal.contact_name}</>}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-4">
          {/* Stage + Value */}
          <div className="flex items-center gap-3 flex-wrap">
            <Badge style={{ background: stageCfg.bg, color: stageCfg.color }}>
              {stageCfg.label}
            </Badge>
            {deal.value && (
              <span className="text-sm font-semibold text-green-400">
                {formatCurrency(deal.value)}
              </span>
            )}
            {deal.probability != null && (
              <span className="text-xs text-muted-foreground">{deal.probability}% probability</span>
            )}
            {deal.close_date && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Calendar className="w-3 h-3" /> Close: {format(new Date(deal.close_date), "MMM d, yyyy")}
              </span>
            )}
          </div>

          {/* Next step */}
          <div className="p-3 rounded-lg bg-secondary/40 border border-border">
            <p className="text-xs font-medium text-muted-foreground mb-1">Next Step</p>
            {editingNextStep ? (
              <div className="flex gap-2">
                <Input value={nextStepVal} onChange={e => setNextStepVal(e.target.value)}
                  placeholder="What's the next action?" className="text-sm h-8" />
                <Button size="sm" className="h-8 text-xs" onClick={() => {
                  updateDeal.mutate({ id: deal.id, next_step: nextStepVal });
                  setEditingNextStep(false);
                }}>Save</Button>
                <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setEditingNextStep(false)}>
                  <X className="w-3 h-3" />
                </Button>
              </div>
            ) : (
              <p
                className="text-sm cursor-pointer hover:text-primary transition-colors"
                onClick={() => { setNextStepVal(deal.next_step || ""); setEditingNextStep(true); }}
              >
                {deal.next_step || <span className="text-muted-foreground italic">Click to add a next step…</span>}
              </p>
            )}
          </div>

          {/* AI Summary */}
          {summary ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-primary" />AI Deal Intelligence
              </p>
              <p className="text-sm text-foreground/80 bg-secondary/30 rounded-lg p-3">{summary.summary}</p>
              {summary.open_objections?.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Open Objections</p>
                  <div className="flex flex-wrap gap-1">
                    {summary.open_objections.map((o: string, i: number) => (
                      <Badge key={i} variant="secondary" className="text-[10px]">{o}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {summary.buying_signals?.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Buying Signals</p>
                  <div className="flex flex-wrap gap-1">
                    {summary.buying_signals.map((s: string, i: number) => (
                      <Badge key={i} className="text-[10px] bg-green-500/10 text-green-400 border-green-500/20">{s}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <Button
              variant="outline"
              className="w-full gap-2 text-xs"
              onClick={() => generateSummary.mutate(deal.id)}
              disabled={generateSummary.isPending || calls.length === 0}
            >
              {generateSummary.isPending
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Generating…</>
                : <><Sparkles className="w-3.5 h-3.5 text-primary" />Generate AI Deal Intelligence</>}
            </Button>
          )}

          {/* Linked calls */}
          {calls.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2">
                Linked Calls ({calls.length})
              </p>
              <div className="space-y-2">
                {calls.map((call: any) => (
                  <div key={call.id} className="flex items-center justify-between p-2.5 rounded-lg bg-secondary/30 border border-border/60">
                    <div>
                      <p className="text-xs font-medium">{call.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {format(new Date(call.date), "MMM d, yyyy")}
                        {call.duration_minutes && ` · ${call.duration_minutes}m`}
                      </p>
                    </div>
                    {call.sentiment_score != null && (
                      <span className="text-xs text-muted-foreground">{call.sentiment_score}%</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          {deal.notes && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1">Notes</p>
              <p className="text-sm text-foreground/70 bg-secondary/20 rounded-lg p-3">{deal.notes}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Pipeline Stats ───────────────────────────────────────────────────────────

function PipelineStats({ pipeline }: { pipeline: any }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {[
        { label: "Active Deals",  value: pipeline.active,     icon: Target,     color: "text-primary" },
        { label: "Won",           value: pipeline.won,        icon: TrendingUp,  color: "text-green-400" },
        { label: "Pipeline Value",value: formatCurrency(pipeline.totalValue) ?? "$0", icon: DollarSign, color: "text-amber-400" },
        { label: "Total Deals",   value: pipeline.total,      icon: Phone,       color: "text-muted-foreground" },
      ].map(({ label, value, icon: Icon, color }) => (
        <div key={label} className="glass rounded-xl p-4 border border-border">
          <div className="flex items-center gap-2 mb-1">
            <Icon className={cn("w-4 h-4", color)} />
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
          <p className="text-xl font-bold font-display">{value}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Main DealsPage ───────────────────────────────────────────────────────────

function DealsPageInner() {
  const { deals, isLoading, pipeline } = useDeals();
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("all");

  const filtered = deals.filter(d => {
    const matchSearch = !search || d.name.toLowerCase().includes(search.toLowerCase())
      || (d.company ?? "").toLowerCase().includes(search.toLowerCase());
    const matchStage = stageFilter === "all" || d.stage === stageFilter;
    return matchSearch && matchStage;
  });

  // Group by stage for kanban-style display
  const byStage = Object.keys(DEAL_STAGE_CFG).reduce((acc, stage) => {
    acc[stage] = filtered.filter(d => d.stage === stage);
    return acc;
  }, {} as Record<string, typeof filtered>);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold font-display">Deal Pipeline</h1>
            <p className="text-sm text-muted-foreground">Track every prospect from discovery to close</p>
          </div>
          <Button onClick={() => setCreateOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" />New Deal
          </Button>
        </div>

        {/* Stats */}
        {!isLoading && <PipelineStats pipeline={pipeline} />}

        {/* Filters */}
        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search deals…"
              className="w-full pl-9 pr-4 py-2 rounded-lg bg-secondary border border-border text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            <button
              onClick={() => setStageFilter("all")}
              className={cn("text-xs px-3 py-1.5 rounded-lg border transition-colors",
                stageFilter === "all" ? "border-primary bg-primary/10 text-foreground" : "border-border bg-secondary/30 text-muted-foreground")}
            >
              All
            </button>
            {Object.entries(DEAL_STAGE_CFG).map(([key, cfg]) => (
              <button
                key={key}
                onClick={() => setStageFilter(key)}
                className={cn("text-xs px-3 py-1.5 rounded-lg border transition-colors",
                  stageFilter === key ? "border-primary bg-primary/10 text-foreground" : "border-border bg-secondary/30 text-muted-foreground")}
              >
                {cfg.icon} {cfg.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="glass rounded-xl p-12 text-center">
            <Target className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-semibold text-foreground">
              {deals.length === 0 ? "No deals yet" : "No deals match your filters"}
            </p>
            <p className="text-sm text-muted-foreground mt-1 mb-4">
              {deals.length === 0
                ? "Create your first deal to start tracking your pipeline"
                : "Try adjusting your search or stage filter"}
            </p>
            {deals.length === 0 && (
              <Button onClick={() => setCreateOpen(true)} size="sm" className="gap-2">
                <Plus className="w-4 h-4" />Create First Deal
              </Button>
            )}
          </div>
        ) : stageFilter !== "all" ? (
          // Single-stage list view
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(deal => (
              <DealCard key={deal.id} deal={deal} onClick={() => setSelectedDealId(deal.id)} />
            ))}
          </div>
        ) : (
          // Kanban view grouped by stage
          <div className="space-y-6">
            {Object.entries(DEAL_STAGE_CFG).map(([stage, cfg]) => {
              const stageDeals = byStage[stage] ?? [];
              if (stageDeals.length === 0) return null;
              return (
                <div key={stage}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-base">{cfg.icon}</span>
                    <h3 className="text-sm font-semibold" style={{ color: cfg.color }}>{cfg.label}</h3>
                    <Badge variant="secondary" className="text-xs">{stageDeals.length}</Badge>
                    {stageDeals.some(d => d.value) && (
                      <span className="text-xs text-muted-foreground ml-auto">
                        {formatCurrency(stageDeals.reduce((s, d) => s + (d.value || 0), 0))}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {stageDeals.map(deal => (
                      <DealCard key={deal.id} deal={deal} onClick={() => setSelectedDealId(deal.id)} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Modals */}
        <CreateDealModal open={createOpen} onClose={() => setCreateOpen(false)} />
        {selectedDealId && (
          <DealDetailModal dealId={selectedDealId} onClose={() => setSelectedDealId(null)} />
        )}
      </div>
    </DashboardLayout>
  );
}

// ─── Default export ───────────────────────────────────────────────────────────

export default function DealsPage() {
  return <DealsPageInner />;
}