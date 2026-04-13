/**
 * TeamInvitationsBanner.tsx — v3
 *
 * Shows pending invitations for the current user.
 * Works for BOTH new sign-ups AND existing registered users.
 * Uses the get_my_pending_invitations() RPC which queries by email,
 * so it reliably finds invitations regardless of team membership status.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Users, Check, X, Copy, ExternalLink, Loader2 } from "lucide-react";
import { useTeam, type PendingInvitation } from "@/hooks/useTeam";
import { toast } from "sonner";

export default function TeamInvitationsBanner() {
  const navigate = useNavigate();
  const { myPendingInvitations, acceptInvitation, declineInvitation } = useTeam();
  const [acting, setActing] = useState<string | null>(null);

  if (!myPendingInvitations.length) return null;

  const handleAccept = async (inv: PendingInvitation) => {
    // If we have a token, use the landing page flow for best UX
    if (inv.invite_token) {
      navigate(`/invite/${inv.invite_token}`);
      return;
    }
    // Fallback: direct accept
    setActing(inv.id);
    try {
      await acceptInvitation.mutateAsync(inv.team_id);
    } finally {
      setActing(null);
    }
  };

  const handleDecline = async (inv: PendingInvitation) => {
    setActing(inv.id);
    try {
      await declineInvitation.mutateAsync(inv.team_id);
    } finally {
      setActing(null);
    }
  };

  const handleCopyLink = async (inv: PendingInvitation) => {
    if (!inv.invite_token) return;
    const url = `${window.location.origin}/invite/${inv.invite_token}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Invite link copied!");
    } catch {
      toast.info(`Your invite link: ${url}`, { duration: 8000 });
    }
  };

  const getTeamName = (inv: PendingInvitation): string => {
    return (inv.teams as any)?.name ?? "a team";
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 8 }}>
      {myPendingInvitations.map(inv => (
        <div
          key={inv.id}
          style={{
            background: "rgba(14,245,212,.06)",
            border: "1px solid rgba(14,245,212,.2)",
            borderRadius: 14,
            padding: "14px 16px",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          {/* Top row */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <div style={{
              width: 36,
              height: 36,
              borderRadius: 9,
              flexShrink: 0,
              background: "rgba(14,245,212,.12)",
              border: "1px solid rgba(14,245,212,.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}>
              <Users style={{ width: 17, height: 17, color: "#0ef5d4" }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{
                margin: "0 0 3px",
                fontSize: 13,
                fontWeight: 700,
                color: "#f0f6fc",
                fontFamily: "'DM Sans',sans-serif",
              }}>
                Team invitation
              </p>
              <p style={{
                margin: 0,
                fontSize: 12,
                color: "rgba(255,255,255,.55)",
                fontFamily: "'DM Sans',sans-serif",
                lineHeight: 1.4,
              }}>
                You've been invited to join{" "}
                <strong style={{ color: "#0ef5d4" }}>{getTeamName(inv)}</strong>
                {" "}as{" "}
                <span style={{ textTransform: "capitalize" }}>{inv.role}</span>.
              </p>
            </div>
          </div>

          {/* Action row */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {/* Accept / View Invitation */}
            <button
              onClick={() => handleAccept(inv)}
              disabled={!!acting}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "7px 14px",
                borderRadius: 8,
                border: "none",
                cursor: acting ? "not-allowed" : "pointer",
                background: "rgba(14,245,212,.15)",
                color: "#0ef5d4",
                fontSize: 12,
                fontWeight: 700,
                fontFamily: "'DM Sans',sans-serif",
              }}
            >
              {acting === inv.id
                ? <Loader2 style={{ width: 12, height: 12, animation: "spin 1s linear infinite" }} />
                : inv.invite_token
                  ? <ExternalLink style={{ width: 12, height: 12 }} />
                  : <Check style={{ width: 12, height: 12 }} />}
              {inv.invite_token ? "View & Accept" : "Accept"}
            </button>

            {/* Copy invite link */}
            {inv.invite_token && (
              <button
                onClick={() => handleCopyLink(inv)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "7px 12px",
                  borderRadius: 8,
                  border: "1px solid rgba(14,245,212,.2)",
                  cursor: "pointer",
                  background: "transparent",
                  color: "rgba(255,255,255,.5)",
                  fontSize: 12,
                  fontWeight: 600,
                  fontFamily: "'DM Sans',sans-serif",
                }}
              >
                <Copy style={{ width: 11, height: 11 }} />
                Copy Link
              </button>
            )}

            {/* Decline */}
            <button
              onClick={() => handleDecline(inv)}
              disabled={!!acting}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                padding: "7px 12px",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,.08)",
                cursor: acting ? "not-allowed" : "pointer",
                background: "transparent",
                color: "rgba(255,255,255,.35)",
                fontSize: 12,
                fontFamily: "'DM Sans',sans-serif",
              }}
            >
              <X style={{ width: 11, height: 11 }} />
              Decline
            </button>
          </div>
        </div>
      ))}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}