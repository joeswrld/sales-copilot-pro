/**
 * StartMeetingModal — lets a person kick off a meeting directly from a
 * conversation in Messages. It does not implement any meeting-creation
 * logic itself; it's a thin UI in front of the same `useLiveCall().startCall`
 * mutation used everywhere else in the app (LiveCall.tsx), so a meeting
 * started from Messages behaves identically to one started from /live —
 * same minute-pool gating, same Daily.co room creation, same deal linking.
 *
 * Supports both:
 *  - Deal-based meetings: when launched from a deal channel, the deal is
 *    pre-selected and locked in (matches the "before/during/after any deal
 *    meeting" requirement).
 *  - General team meetings: launched from a team channel or DM, deal_id is
 *    explicitly passed as `null` — a path useLiveCall already supports.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { X, Video, Building2, Users as UsersIcon, Loader2 } from "lucide-react";
import { useLiveCall } from "@/hooks/useLiveCall";
import { useDeals } from "@/hooks/useDeals";
import { toast } from "sonner";

interface Props {
  defaultDealId?: string | null;
  defaultDealName?: string | null;
  lockDeal?: boolean;
  suggestedName?: string;
  onClose: () => void;
  onStarted?: (callId: string) => void;
}

export default function StartMeetingModal({ defaultDealId = null, defaultDealName = null, lockDeal, suggestedName, onClose, onStarted }: Props) {
  const navigate = useNavigate();
  const { startCall } = useLiveCall();
  const { deals } = useDeals();
  const [mode, setMode] = useState<"deal" | "general">(defaultDealId ? "deal" : "general");
  const [dealId, setDealId] = useState<string | null>(defaultDealId);
  const [name, setName] = useState(suggestedName || "");
  const [submitting, setSubmitting] = useState(false);

  const handleStart = async () => {
    setSubmitting(true);
    try {
      const data = await startCall.mutateAsync({
        platform: "daily",
        name: name.trim() || (mode === "deal" ? "Deal Meeting" : "Team Meeting"),
        meeting_type: mode === "deal" ? "sales_call" : "team_meeting",
        deal_id: mode === "deal" ? dealId : null,
      });
      onStarted?.(data.id);
      navigate(`/live/${data.id}`);
    } catch (e: any) {
      if (e.message === "PLAN_LIMIT_REACHED") {
        toast.error("You've reached your plan's meeting minutes. Upgrade to keep going.");
      } else if (e.message === "DEAL_REQUIRED") {
        toast.error("Pick a deal, or switch to a general team meeting.");
      } else {
        toast.error("Couldn't start the meeting. Try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        style={{ width: "min(420px, 100%)", borderRadius: 16, background: "#0d1420", border: "1px solid rgba(255,255,255,.1)", boxShadow: "0 20px 60px rgba(0,0,0,.5)", fontFamily: "'Geist',system-ui,sans-serif" }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 18px", borderBottom: "1px solid rgba(255,255,255,.06)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Video size={16} color="#0ef5d4" />
            <span style={{ fontSize: 15, fontWeight: 700, color: "#f0f6fc" }}>Start a meeting</span>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,.4)", cursor: "pointer" }}><X size={18} /></button>
        </div>

        <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
          {!lockDeal && (
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setMode("deal")}
                style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 0", borderRadius: 10, cursor: "pointer", fontSize: 12.5, fontWeight: 700, background: mode === "deal" ? "rgba(167,139,250,.15)" : "rgba(255,255,255,.04)", border: `1px solid ${mode === "deal" ? "rgba(167,139,250,.35)" : "rgba(255,255,255,.08)"}`, color: mode === "deal" ? "#a78bfa" : "rgba(255,255,255,.5)" }}
              >
                <Building2 size={13} /> Deal Meeting
              </button>
              <button
                onClick={() => setMode("general")}
                style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 0", borderRadius: 10, cursor: "pointer", fontSize: 12.5, fontWeight: 700, background: mode === "general" ? "rgba(14,245,212,.12)" : "rgba(255,255,255,.04)", border: `1px solid ${mode === "general" ? "rgba(14,245,212,.3)" : "rgba(255,255,255,.08)"}`, color: mode === "general" ? "#0ef5d4" : "rgba(255,255,255,.5)" }}
              >
                <UsersIcon size={13} /> Team Meeting
              </button>
            </div>
          )}

          {mode === "deal" && (
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,.4)", textTransform: "uppercase", letterSpacing: .4 }}>Deal</label>
              {lockDeal ? (
                <div style={{ marginTop: 6, padding: "9px 12px", borderRadius: 9, background: "rgba(167,139,250,.08)", border: "1px solid rgba(167,139,250,.2)", fontSize: 13, color: "#a78bfa", fontWeight: 600 }}>
                  {defaultDealName || "This deal"}
                </div>
              ) : (
                <select
                  value={dealId ?? ""}
                  onChange={e => setDealId(e.target.value || null)}
                  style={{ marginTop: 6, width: "100%", padding: "9px 12px", borderRadius: 9, background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.1)", color: "#f0f6fc", fontSize: 13 }}
                >
                  <option value="">Select a deal…</option>
                  {deals.map(d => <option key={d.id} value={d.id}>{d.name}{d.company ? ` — ${d.company}` : ""}</option>)}
                </select>
              )}
            </div>
          )}

          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,.4)", textTransform: "uppercase", letterSpacing: .4 }}>Meeting name (optional)</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={mode === "deal" ? "e.g. Discovery call" : "e.g. Weekly sync"}
              style={{ marginTop: 6, width: "100%", padding: "9px 12px", borderRadius: 9, background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.1)", color: "#f0f6fc", fontSize: 13, outline: "none" }}
            />
          </div>

          <button
            onClick={handleStart}
            disabled={submitting || (mode === "deal" && !dealId)}
            style={{
              marginTop: 4, padding: "11px 0", borderRadius: 11, border: "none", cursor: submitting || (mode === "deal" && !dealId) ? "not-allowed" : "pointer",
              background: "linear-gradient(135deg,#0ef5d4,#0891b2)", color: "#060912", fontWeight: 800, fontSize: 13.5,
              opacity: submitting || (mode === "deal" && !dealId) ? .5 : 1,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}
          >
            {submitting ? <><Loader2 size={14} className="animate-spin" /> Starting…</> : <><Video size={14} /> Start meeting now</>}
          </button>
        </div>
      </div>
    </div>
  );
}