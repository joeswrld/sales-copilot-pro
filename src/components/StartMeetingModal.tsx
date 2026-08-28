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
 *  - General team meetings: launched from a team channel or DM. deal_id is
 *    optional here — startCall/useLiveCall already accepts a deal_id
 *    regardless of meeting_type, so a Team Meeting can still be tied to a
 *    deal (e.g. an internal prep sync ahead of a deal call) without being
 *    locked into "Deal Meeting" mode. Pass explicit `null` only when the
 *    user leaves the deal picker unset.
 *
 * Before the room is actually created, the host is asked "Who can join this
 * meeting?" — the same "Anyone with the link" vs "Require approval" choice
 * as the pre-call access dialog on /live (LiveCall.tsx), so a meeting
 * started from Messages looks and behaves identically to one started from
 * the Live Call page. That confirmed value is passed straight through to
 * startCall's who_can_join and to useDailyRoom's createRoom (privacy), the
 * same two calls LiveCall.tsx makes — so the meeting also actually gets a
 * working Daily.co room, not just a DB row.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { X, Video, Building2, Users as UsersIcon, Loader2, Link2, ShieldCheck, Plus } from "lucide-react";
import { useLiveCall } from "@/hooks/useLiveCall";
import { useDailyRoom } from "@/hooks/useDailyRoom";
import { useDeals } from "@/hooks/useDeals";
import { supabase } from "@/integrations/supabase/client";
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
  const { createRoom } = useDailyRoom();
  const { deals } = useDeals();
  const [mode, setMode] = useState<"deal" | "general">(defaultDealId ? "deal" : "general");
  const [dealId, setDealId] = useState<string | null>(defaultDealId);
  // Team-meeting-mode deal link — separate from `dealId` (which is required
  // in "deal" mode) so switching between modes doesn't clobber a deal the
  // user already picked while on "general".
  const [teamMeetingDealId, setTeamMeetingDealId] = useState<string | null>(null);
  const [name, setName] = useState(suggestedName || "");
  const [submitting, setSubmitting] = useState(false);

  // Step 1 = meeting details (deal/name), Step 2 = "who can join" access
  // dialog. Mirrors LiveCall.tsx's handleCreateMeeting → access dialog →
  // confirmCreateMeeting flow, just inline in this modal instead of two
  // separate dialogs.
  const [step, setStep] = useState<"details" | "access">("details");
  const [whoCanJoin, setWhoCanJoin] = useState<"anyone_with_link" | "invited_only">("anyone_with_link");

  const handleContinue = () => {
    if (mode === "deal" && !dealId) return;
    // Reset to the default each time the access step is entered, matching
    // LiveCall.tsx's openCreateDialog behavior.
    setWhoCanJoin("anyone_with_link");
    setStep("access");
  };

  const handleStart = async () => {
    setSubmitting(true);
    const meetingName = name.trim() || (mode === "deal" ? "Deal Meeting" : "Team Meeting");
    let callRow: any = null;
    try {
      callRow = await startCall.mutateAsync({
        platform: "daily",
        name: meetingName,
        meeting_type: mode === "deal" ? "sales_call" : "team_meeting",
        deal_id: mode === "deal" ? dealId : teamMeetingDealId,
        who_can_join: whoCanJoin,
      });

      // Actually provision the Daily.co room — same call LiveCall.tsx makes
      // right after startCall, so a meeting started here is joinable, not
      // just a DB row with status='live'.
      await createRoom({
        callId: callRow.id,
        title: meetingName,
        meetingType: mode === "deal" ? "sales_call" : "team_meeting",
        expMinutes: 1440, // 24h, matches LiveCall.tsx
        privacy: whoCanJoin === "invited_only" ? "private" : "public",
      });

      onStarted?.(callRow.id);
      navigate(`/live/${callRow.id}`);
    } catch (e: any) {
      if (callRow?.id) {
        // Room provisioning failed after the call row was created — don't
        // leave a dead "live" meeting behind. Mirrors LiveCall.tsx's
        // cleanup on createRoom failure.
        try {
          await supabase.from("calls")
            .update({ status: "completed", end_time: new Date().toISOString(), duration_minutes: 0 })
            .eq("id", callRow.id);
        } catch {
          // best-effort cleanup only
        }
      }
      if (e.message === "PLAN_LIMIT_REACHED") {
        toast.error("You've reached your plan's meeting minutes. Upgrade to keep going.");
      } else if (e.message === "DEAL_REQUIRED") {
        toast.error("Pick a deal, or switch to a general team meeting.");
      } else {
        toast.error("Couldn't start the meeting. Try again.");
      }
      setStep("details");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={submitting ? undefined : onClose}>
      <div
        onClick={e => e.stopPropagation()}
        style={{ width: "min(420px, 100%)", borderRadius: 16, background: "#FFFFFF", border: "1px solid rgba(23,23,15,.1)", boxShadow: "0 20px 48px -12px rgba(20,20,15,.25), 0 0 0 1px rgba(20,20,15,.03)", fontFamily: "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 18px", borderBottom: "1px solid rgba(23,23,15,.06)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Video size={16} color="#22315C" />
            <span style={{ fontSize: 15, fontWeight: 700, color: "#17170F" }}>
              {step === "details" ? "Start a meeting" : "Who can join this meeting?"}
            </span>
          </div>
          {!submitting && (
            <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(23,23,15,.4)", cursor: "pointer" }}><X size={18} /></button>
          )}
        </div>

        {step === "details" ? (
          <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
            {!lockDeal && (
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => setMode("deal")}
                  style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 0", borderRadius: 10, cursor: "pointer", fontSize: 12.5, fontWeight: 700, background: mode === "deal" ? "rgba(167,139,250,.15)" : "rgba(23,23,15,.04)", border: `1px solid ${mode === "deal" ? "rgba(167,139,250,.35)" : "rgba(23,23,15,.08)"}`, color: mode === "deal" ? "#a78bfa" : "rgba(23,23,15,.5)" }}
                >
                  <Building2 size={13} /> Deal Meeting
                </button>
                <button
                  onClick={() => setMode("general")}
                  style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 0", borderRadius: 10, cursor: "pointer", fontSize: 12.5, fontWeight: 700, background: mode === "general" ? "rgba(34,49,92,.12)" : "rgba(23,23,15,.04)", border: `1px solid ${mode === "general" ? "rgba(34,49,92,.3)" : "rgba(23,23,15,.08)"}`, color: mode === "general" ? "#22315C" : "rgba(23,23,15,.5)" }}
                >
                  <UsersIcon size={13} /> Team Meeting
                </button>
              </div>
            )}

            {mode === "deal" && (
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "rgba(23,23,15,.4)", textTransform: "uppercase", letterSpacing: .4 }}>Deal</label>
                {lockDeal ? (
                  <div style={{ marginTop: 6, padding: "9px 12px", borderRadius: 9, background: "rgba(167,139,250,.08)", border: "1px solid rgba(167,139,250,.2)", fontSize: 13, color: "#a78bfa", fontWeight: 600 }}>
                    {defaultDealName || "This deal"}
                  </div>
                ) : (
                  <select
                    value={dealId ?? ""}
                    onChange={e => setDealId(e.target.value || null)}
                    style={{ marginTop: 6, width: "100%", padding: "9px 12px", borderRadius: 9, background: "rgba(23,23,15,.05)", border: "1px solid rgba(23,23,15,.1)", color: "#17170F", fontSize: 13 }}
                  >
                    <option value="">Select a deal…</option>
                    {deals.map(d => <option key={d.id} value={d.id}>{d.name}{d.company ? ` — ${d.company}` : ""}</option>)}
                  </select>
                )}
              </div>
            )}

            {mode === "general" && (
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "rgba(23,23,15,.4)", textTransform: "uppercase", letterSpacing: .4 }}>Link to a deal (optional)</label>
                <select
                  value={teamMeetingDealId ?? ""}
                  onChange={e => setTeamMeetingDealId(e.target.value || null)}
                  style={{ marginTop: 6, width: "100%", padding: "9px 12px", borderRadius: 9, background: "rgba(23,23,15,.05)", border: "1px solid rgba(23,23,15,.1)", color: "#17170F", fontSize: 13 }}
                >
                  <option value="">No deal — general team meeting</option>
                  {deals.map(d => <option key={d.id} value={d.id}>{d.name}{d.company ? ` — ${d.company}` : ""}</option>)}
                </select>
                <p style={{ margin: "5px 0 0", fontSize: 11, color: "rgba(23,23,15,.3)" }}>
                  Ties this meeting to a deal's timeline, even though it's not a dedicated deal call.
                </p>
              </div>
            )}

            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: "rgba(23,23,15,.4)", textTransform: "uppercase", letterSpacing: .4 }}>Meeting name (optional)</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder={mode === "deal" ? "e.g. Discovery call" : "e.g. Weekly sync"}
                style={{ marginTop: 6, width: "100%", padding: "9px 12px", borderRadius: 9, background: "rgba(23,23,15,.05)", border: "1px solid rgba(23,23,15,.1)", color: "#17170F", fontSize: 13, outline: "none" }}
              />
            </div>

            <button
              onClick={handleContinue}
              disabled={mode === "deal" && !dealId}
              style={{
                marginTop: 4, padding: "11px 0", borderRadius: 11, border: "none", cursor: (mode === "deal" && !dealId) ? "not-allowed" : "pointer",
                background: "linear-gradient(135deg,#22315C,#1a2748)", color: "#FAFAF8", fontWeight: 800, fontSize: 13.5,
                opacity: (mode === "deal" && !dealId) ? .5 : 1,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              }}
            >
              <Video size={14} /> Continue
            </button>
          </div>
        ) : (
          <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
            <p style={{ margin: 0, fontSize: 12, color: "rgba(23,23,15,.45)" }}>
              You can change this later from Meeting Settings once the call starts.
            </p>

            <div style={{ borderRadius: 12, overflow: "hidden", border: "1px solid rgba(23,23,15,.1)" }}>
              <button
                onClick={() => setWhoCanJoin("anyone_with_link")}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", textAlign: "left",
                  border: "none", cursor: "pointer",
                  background: whoCanJoin === "anyone_with_link" ? "rgba(34,49,92,.1)" : "transparent",
                }}
              >
                <Link2 size={16} color={whoCanJoin === "anyone_with_link" ? "#22315C" : "rgba(23,23,15,.4)"} />
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#17170F" }}>Anyone with the link</p>
                  <p style={{ margin: 0, fontSize: 11, color: "rgba(23,23,15,.4)" }}>Guests join instantly, no approval needed</p>
                </div>
                {whoCanJoin === "anyone_with_link" && <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#22315C", flexShrink: 0 }} />}
              </button>
              <button
                onClick={() => setWhoCanJoin("invited_only")}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", textAlign: "left",
                  border: "none", borderTop: "1px solid rgba(23,23,15,.1)", cursor: "pointer",
                  background: whoCanJoin === "invited_only" ? "rgba(34,49,92,.1)" : "transparent",
                }}
              >
                <ShieldCheck size={16} color={whoCanJoin === "invited_only" ? "#22315C" : "rgba(23,23,15,.4)"} />
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#17170F" }}>Require approval</p>
                  <p style={{ margin: 0, fontSize: 11, color: "rgba(23,23,15,.4)" }}>Guests knock and you admit them one by one</p>
                </div>
                {whoCanJoin === "invited_only" && <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#22315C", flexShrink: 0 }} />}
              </button>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setStep("details")}
                disabled={submitting}
                style={{
                  padding: "11px 16px", borderRadius: 11, cursor: submitting ? "not-allowed" : "pointer",
                  background: "rgba(23,23,15,.05)", border: "1px solid rgba(23,23,15,.1)", color: "rgba(23,23,15,.6)", fontWeight: 700, fontSize: 13,
                }}
              >
                Back
              </button>
              <button
                onClick={handleStart}
                disabled={submitting}
                style={{
                  flex: 1, padding: "11px 0", borderRadius: 11, border: "none", cursor: submitting ? "not-allowed" : "pointer",
                  background: "linear-gradient(135deg,#22315C,#1a2748)", color: "#FAFAF8", fontWeight: 800, fontSize: 13.5,
                  opacity: submitting ? .6 : 1,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                }}
              >
                {submitting ? <><Loader2 size={14} className="animate-spin" /> Creating…</> : <><Plus size={14} /> Create Meeting</>}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}