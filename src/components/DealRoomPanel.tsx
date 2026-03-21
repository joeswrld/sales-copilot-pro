/**
 * DealRoomPanel.tsx
 *
 * Sidebar + detail view for real DB-backed Deal Rooms.
 * Drop this into MessagesPage to replace the fake dealRooms derived from calls.
 *
 * Usage in MessagesPage:
 *   import { DealRoomSidebar, DealRoomDetail } from "@/components/DealRoomPanel";
 */

import { useState, useRef, useCallback } from "react";
import {
  Building2, Target, TrendingUp, AlertTriangle, Trophy,
  Search, Plus, ChevronRight, ChevronDown, Activity,
  Award, Zap, Phone, MessageSquare, Clock, X, Check,
  Edit3, MoreHorizontal, Loader2,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useDealRooms, DEAL_STAGE_CONFIG, DealRoom, DealStage,
} from "@/hooks/useDealRooms";
import { useTeam } from "@/hooks/useTeam";
import { toast } from "sonner";

// ─────────────────────────────────────────────────────────────────────────────
//  Stage badge
// ─────────────────────────────────────────────────────────────────────────────

function StageBadge({ stage }: { stage: DealStage }) {
  const cfg = DEAL_STAGE_CONFIG[stage];
  return (
    <span
      style={{
        fontSize: 10, fontWeight: 700, padding: "2px 8px",
        borderRadius: 20, background: cfg.bg, color: cfg.color,
        whiteSpace: "nowrap",
      }}
    >
      {cfg.icon} {cfg.label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Deal Room card in sidebar
// ─────────────────────────────────────────────────────────────────────────────

function DealCard({
  room,
  isSelected,
  onClick,
}: {
  room: DealRoom;
  isSelected: boolean;
  onClick: () => void;
}) {
  const cfg = DEAL_STAGE_CONFIG[room.stage];
  const sentimentColor =
    room.sentiment_score == null ? "rgba(255,255,255,.3)"
    : room.sentiment_score >= 70 ? "#22c55e"
    : room.sentiment_score >= 40 ? "#f59e0b"
    : "#ef4444";

  return (
    <button
      onClick={onClick}
      style={{
        width: "100%", textAlign: "left",
        background: isSelected ? "rgba(96,165,250,.07)" : "rgba(255,255,255,.02)",
        border: `1px solid ${isSelected ? "rgba(96,165,250,.3)" : "rgba(255,255,255,.05)"}`,
        borderRadius: 11, padding: "10px 11px", marginBottom: 5,
        cursor: "pointer", transition: "all .13s", fontFamily: "'DM Sans',sans-serif",
      }}
    >
      {/* Top row */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 7, flexShrink: 0,
          background: cfg.bg, color: cfg.color,
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14,
        }}>
          {cfg.icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,.9)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {room.deal_name}
          </div>
          {room.company && (
            <div style={{ fontSize: 10, color: "rgba(255,255,255,.35)" }}>{room.company}</div>
          )}
        </div>
        {(room.unread_count ?? 0) > 0 && (
          <div style={{
            minWidth: 16, height: 16, borderRadius: 8, padding: "0 3px",
            background: "linear-gradient(135deg,#7c3aed,#6d28d9)",
            fontSize: 9, fontWeight: 700, color: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {(room.unread_count ?? 0) > 9 ? "9+" : room.unread_count}
          </div>
        )}
      </div>

      {/* Meta row */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5, flexWrap: "wrap" }}>
        <StageBadge stage={room.stage} />
        {room.sentiment_score != null && (
          <span style={{ fontSize: 10, fontWeight: 500, color: sentimentColor }}>
            {room.sentiment_score}% sentiment
          </span>
        )}
        {room.last_call_score != null && (
          <span style={{ fontSize: 10, color: "rgba(255,255,255,.3)" }}>
            Score: {Number(room.last_call_score).toFixed(1)}/10
          </span>
        )}
      </div>

      {/* Next step */}
      {room.next_step && (
        <div style={{
          display: "flex", alignItems: "center", gap: 5,
          fontSize: 10, color: "#60a5fa",
          background: "rgba(96,165,250,.08)", borderRadius: 6, padding: "3px 7px",
        }}>
          <Target style={{ width: 9, height: 9, flexShrink: 0 }} />
          {room.next_step}
        </div>
      )}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Collapsible section in sidebar
// ─────────────────────────────────────────────────────────────────────────────

function Section({
  label, icon: Icon, count, children, defaultOpen = true,
}: {
  label: string; icon: React.ElementType; count?: number;
  children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginBottom: 4 }}>
      <button
        onClick={() => setOpen(p => !p)}
        style={{
          display: "flex", alignItems: "center", gap: 6, width: "100%",
          padding: "5px 10px 3px", background: "transparent", border: "none",
          cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
        }}
      >
        <Icon style={{ width: 10, height: 10, color: "rgba(255,255,255,.3)" }} />
        <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,.22)", textTransform: "uppercase", letterSpacing: ".08em", flex: 1, textAlign: "left" }}>
          {label}
        </span>
        {count != null && count > 0 && (
          <span style={{ background: "rgba(124,58,237,.2)", color: "#a78bfa", fontSize: 9, padding: "1px 6px", borderRadius: 10 }}>
            {count}
          </span>
        )}
        {open
          ? <ChevronDown style={{ width: 10, height: 10, color: "rgba(255,255,255,.2)" }} />
          : <ChevronRight style={{ width: 10, height: 10, color: "rgba(255,255,255,.2)" }} />
        }
      </button>
      {open && children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Sidebar: full list of deal rooms grouped by stage
// ─────────────────────────────────────────────────────────────────────────────

export function DealRoomSidebar({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (room: DealRoom) => void;
}) {
  const { dealRooms, isLoading, byStage, createDealRoom } = useDealRooms();
  const [search, setSearch] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCompany, setNewCompany] = useState("");

  const filtered = search.trim()
    ? dealRooms.filter(r =>
        r.deal_name.toLowerCase().includes(search.toLowerCase()) ||
        (r.company ?? "").toLowerCase().includes(search.toLowerCase())
      )
    : null;

  const atRisk    = byStage("at_risk");
  const active    = dealRooms.filter(r => !["won","lost","at_risk"].includes(r.stage));
  const won       = byStage("won");
  const lost      = byStage("lost");

  const handleCreate = async () => {
    if (!newName.trim()) return;
    await createDealRoom.mutateAsync({ dealName: newName.trim(), company: newCompany.trim() || undefined });
    setNewOpen(false); setNewName(""); setNewCompany("");
  };

  if (isLoading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
        <Loader2 style={{ width: 18, height: 18, color: "#7c3aed", animation: "spin 1s linear infinite" }} />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Search + create */}
      <div style={{ padding: "8px 8px 4px", display: "flex", gap: 5 }}>
        <div style={{ flex: 1, position: "relative" }}>
          <Search style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", width: 12, height: 12, color: "rgba(255,255,255,.25)" }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search deals…"
            style={{
              width: "100%", paddingLeft: 28, paddingRight: 8, paddingTop: 6, paddingBottom: 6,
              background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)",
              borderRadius: 8, color: "rgba(255,255,255,.8)", fontSize: 12,
              fontFamily: "'DM Sans',sans-serif", outline: "none",
            }}
          />
        </div>
        <button
          onClick={() => setNewOpen(true)}
          title="New Deal Room"
          style={{
            width: 30, height: 30, borderRadius: 8, flexShrink: 0,
            background: "rgba(124,58,237,.18)", border: "1px solid rgba(124,58,237,.3)",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", color: "#a78bfa",
          }}
        >
          <Plus style={{ width: 13, height: 13 }} />
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 5, padding: "6px 8px 4px" }}>
        {[
          { label: "Total",   val: dealRooms.length,   color: "rgba(255,255,255,.7)" },
          { label: "At Risk", val: atRisk.length,       color: "#f97316" },
          { label: "Won",     val: won.length,           color: "#22c55e" },
        ].map(s => (
          <div key={s.label} style={{
            background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.05)",
            borderRadius: 9, padding: "7px 8px", textAlign: "center",
          }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: s.color, fontFamily: "'Bricolage Grotesque',sans-serif" }}>{s.val}</div>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,.3)", textTransform: "uppercase", letterSpacing: ".05em" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: "auto", padding: "2px 6px 8px" }}>
        {dealRooms.length === 0 ? (
          <div style={{ padding: "32px 16px", textAlign: "center", color: "rgba(255,255,255,.25)" }}>
            <Building2 style={{ width: 28, height: 28, margin: "0 auto 8px", opacity: .3 }} />
            <p style={{ fontSize: 12, margin: 0 }}>No deal rooms yet</p>
            <p style={{ fontSize: 11, margin: "4px 0 0", color: "rgba(255,255,255,.15)" }}>Complete a call or create one manually</p>
          </div>
        ) : filtered ? (
          filtered.map(r => <DealCard key={r.id} room={r} isSelected={selectedId === r.id} onClick={() => onSelect(r)} />)
        ) : (
          <>
            {atRisk.length > 0 && (
              <Section label="At Risk" icon={AlertTriangle} count={atRisk.length}>
                {atRisk.map(r => <DealCard key={r.id} room={r} isSelected={selectedId === r.id} onClick={() => onSelect(r)} />)}
              </Section>
            )}
            {active.length > 0 && (
              <Section label="Active" icon={Activity} count={active.length}>
                {active.map(r => <DealCard key={r.id} room={r} isSelected={selectedId === r.id} onClick={() => onSelect(r)} />)}
              </Section>
            )}
            {won.length > 0 && (
              <Section label="Won" icon={Award} count={won.length} defaultOpen={false}>
                {won.map(r => <DealCard key={r.id} room={r} isSelected={selectedId === r.id} onClick={() => onSelect(r)} />)}
              </Section>
            )}
            {lost.length > 0 && (
              <Section label="Lost" icon={X} count={lost.length} defaultOpen={false}>
                {lost.map(r => <DealCard key={r.id} room={r} isSelected={selectedId === r.id} onClick={() => onSelect(r)} />)}
              </Section>
            )}
          </>
        )}
      </div>

      {/* New Deal Room dialog */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,.08)", borderRadius: 16 }}>
          <DialogHeader>
            <DialogTitle style={{ color: "#f0f6fc", fontFamily: "'Bricolage Grotesque',sans-serif" }}>
              New Deal Room
            </DialogTitle>
          </DialogHeader>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,.5)", display: "block", marginBottom: 5 }}>Deal Name *</label>
              <Input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="e.g. Acme Corp — Enterprise"
                onKeyDown={e => e.key === "Enter" && handleCreate()}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,.5)", display: "block", marginBottom: 5 }}>Company (optional)</label>
              <Input
                value={newCompany}
                onChange={e => setNewCompany(e.target.value)}
                placeholder="e.g. Acme Corp"
                onKeyDown={e => e.key === "Enter" && handleCreate()}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setNewOpen(false)}>Cancel</Button>
            <Button size="sm" disabled={!newName.trim() || createDealRoom.isPending} onClick={handleCreate}>
              {createDealRoom.isPending
                ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} />
                : <Plus style={{ width: 14, height: 14 }} />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Deal Room header banner (shown at top of chat when a deal room is open)
// ─────────────────────────────────────────────────────────────────────────────

export function DealRoomHeader({ room }: { room: DealRoom }) {
  const { updateStage, updateNextStep } = useDealRooms();
  const [editNext, setEditNext] = useState(false);
  const [nextDraft, setNextDraft] = useState(room.next_step ?? "");
  const cfg = DEAL_STAGE_CONFIG[room.stage];

  const sentimentColor =
    room.sentiment_score == null ? "rgba(255,255,255,.35)"
    : room.sentiment_score >= 70 ? "#22c55e"
    : room.sentiment_score >= 40 ? "#f59e0b"
    : "#ef4444";

  const STAGES: DealStage[] = ["discovery", "demo", "negotiation", "won", "lost", "at_risk"];

  const saveNextStep = async () => {
    if (nextDraft.trim() !== (room.next_step ?? "")) {
      await updateNextStep.mutateAsync({ dealRoomId: room.id, nextStep: nextDraft.trim() });
    }
    setEditNext(false);
  };

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
      padding: "10px 16px", flexShrink: 0,
      background: "rgba(96,165,250,.04)", borderBottom: "1px solid rgba(96,165,250,.12)",
    }}>
      {/* Icon + name */}
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8, flexShrink: 0,
          background: cfg.bg, color: cfg.color,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Building2 style={{ width: 14, height: 14 }} />
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,.9)", fontFamily: "'Bricolage Grotesque',sans-serif" }}>
            {room.deal_name}
          </div>
          {room.company && (
            <div style={{ fontSize: 10, color: "rgba(255,255,255,.35)" }}>{room.company}</div>
          )}
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginLeft: "auto", flexWrap: "wrap" }}>
        {/* Stage picker */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
              <StageBadge stage={room.stage} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,.08)" }}>
            {STAGES.map(s => {
              const sc = DEAL_STAGE_CONFIG[s];
              return (
                <DropdownMenuItem
                  key={s}
                  onClick={() => updateStage.mutateAsync({ dealRoomId: room.id, stage: s })}
                  style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: sc.color }}
                >
                  <span>{sc.icon}</span>
                  <span style={{ color: "rgba(255,255,255,.8)" }}>{sc.label}</span>
                  {room.stage === s && <Check style={{ width: 12, height: 12, marginLeft: "auto", color: sc.color }} />}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>

        {room.sentiment_score != null && (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,.3)", textTransform: "uppercase", letterSpacing: ".06em" }}>Sentiment</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: sentimentColor }}>{room.sentiment_score}%</div>
          </div>
        )}

        {room.last_call_score != null && (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,.3)", textTransform: "uppercase", letterSpacing: ".06em" }}>Score</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,.8)" }}>{Number(room.last_call_score).toFixed(1)}/10</div>
          </div>
        )}

        {/* Next step editable */}
        <div>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,.3)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 2 }}>Next Step</div>
          {editNext ? (
            <div style={{ display: "flex", gap: 4 }}>
              <input
                autoFocus
                value={nextDraft}
                onChange={e => setNextDraft(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") saveNextStep(); if (e.key === "Escape") setEditNext(false); }}
                style={{
                  background: "rgba(255,255,255,.06)", border: "1px solid rgba(96,165,250,.4)",
                  borderRadius: 6, padding: "3px 8px", fontSize: 11, color: "#fff",
                  outline: "none", fontFamily: "'DM Sans',sans-serif", width: 160,
                }}
              />
              <button onClick={saveNextStep} style={{ background: "none", border: "none", cursor: "pointer", color: "#22c55e" }}>
                <Check style={{ width: 12, height: 12 }} />
              </button>
              <button onClick={() => setEditNext(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,.3)" }}>
                <X style={{ width: 12, height: 12 }} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => { setNextDraft(room.next_step ?? ""); setEditNext(true); }}
              style={{
                display: "flex", alignItems: "center", gap: 4,
                background: "rgba(96,165,250,.07)", border: "1px solid rgba(96,165,250,.15)",
                borderRadius: 6, padding: "3px 8px",
                fontSize: 11, color: "#60a5fa", cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
                maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}
            >
              <Target style={{ width: 10, height: 10, flexShrink: 0 }} />
              {room.next_step || "Set next step…"}
              <Edit3 style={{ width: 9, height: 9, flexShrink: 0, opacity: .6, marginLeft: 2 }} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Stage history timeline (shown as a panel in deal room detail)
// ─────────────────────────────────────────────────────────────────────────────

export function StageHistoryTimeline({ dealRoomId }: { dealRoomId: string }) {
  const { useStageHistory } = useDealRooms();
  const { data: history = [], isLoading } = useStageHistory(dealRoomId);

  if (isLoading) return (
    <div style={{ display: "flex", justifyContent: "center", padding: 20 }}>
      <Loader2 style={{ width: 16, height: 16, color: "#7c3aed", animation: "spin 1s linear infinite" }} />
    </div>
  );

  if (!history.length) return (
    <div style={{ padding: "20px 16px", textAlign: "center", color: "rgba(255,255,255,.25)", fontSize: 12 }}>
      No stage changes yet
    </div>
  );

  return (
    <div style={{ padding: "8px 16px" }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,.3)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 10 }}>
        Stage History
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {history.map((h, i) => {
          const cfg = DEAL_STAGE_CONFIG[h.new_stage as DealStage];
          return (
            <div key={h.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", paddingBottom: 12, position: "relative" }}>
              {/* Timeline connector */}
              {i < history.length - 1 && (
                <div style={{
                  position: "absolute", left: 9, top: 20, bottom: 0,
                  width: 1, background: "rgba(255,255,255,.07)",
                }} />
              )}
              {/* Dot */}
              <div style={{
                width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
                background: cfg?.bg ?? "rgba(255,255,255,.08)",
                border: `1px solid ${cfg?.color ?? "rgba(255,255,255,.2)"}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 10, zIndex: 1,
              }}>
                {cfg?.icon ?? "→"}
              </div>
              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,.7)", fontWeight: 500 }}>
                  {h.old_stage
                    ? `${DEAL_STAGE_CONFIG[h.old_stage as DealStage]?.label ?? h.old_stage} → ${cfg?.label ?? h.new_stage}`
                    : `Moved to ${cfg?.label ?? h.new_stage}`}
                </div>
                {h.note && (
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,.4)", marginTop: 2 }}>{h.note}</div>
                )}
                <div style={{ fontSize: 10, color: "rgba(255,255,255,.25)", marginTop: 2 }}>
                  {format(new Date(h.changed_at), "MMM d, yyyy · h:mm a")}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
