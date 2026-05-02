/**
 * InviteLanding.tsx
 *
 * Public-facing invitation landing page at /invite/:token
 * Shows team info, plan features, and accept/decline CTAs.
 * Works for both logged-in users and new sign-ups.
 */

import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  Loader2, Users, CheckCircle2, X, Zap, Shield, Crown,
  Lock, Star, Phone, Mic, FileText, BarChart3, MessageSquare,
  Target, Scissors, HeadphonesIcon, AlertTriangle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

// ── Plan feature map ──────────────────────────────────────────────────────────
const PLAN_FEATURES: Record<string, { label: string; icon: React.ElementType; included: string[] }> = {
  free: {
    label: "Free",
    icon: Zap,
    included: ["live_calls", "transcription", "summaries"],
  },
  starter: {
    label: "Starter",
    icon: Zap,
    included: ["live_calls", "transcription", "summaries", "objection_detection", "sentiment", "engagement", "team_messages", "crm_push"],
  },
  growth: {
    label: "Growth",
    icon: Star,
    included: ["live_calls", "transcription", "summaries", "objection_detection", "sentiment", "engagement", "team_messages", "crm_push", "deal_rooms", "coaching", "analytics", "leaderboards"],
  },
  scale: {
    label: "Scale",
    icon: Crown,
    included: ["live_calls", "transcription", "summaries", "objection_detection", "sentiment", "engagement", "team_messages", "crm_push", "deal_rooms", "coaching", "analytics", "leaderboards", "dedicated_csm"],
  },
};

const ALL_FEATURES = [
  { key: "live_calls",          label: "Live Calls",               icon: Phone },
  { key: "transcription",       label: "AI Transcription",         icon: Mic },
  { key: "summaries",           label: "AI Call Summaries",        icon: FileText },
  { key: "objection_detection", label: "Objection Detection",      icon: AlertTriangle },
  { key: "sentiment",           label: "Sentiment Analysis",       icon: BarChart3 },
  { key: "engagement",          label: "Engagement Scoring",       icon: Zap },
  { key: "team_messages",       label: "Team Messages",            icon: MessageSquare },
  { key: "crm_push",            label: "Action Layer + CRM Push",  icon: Zap },
  { key: "deal_rooms",          label: "Deal Rooms & Deal AI",     icon: Target },
  { key: "coaching",            label: "Coaching Clips",           icon: Scissors },
  { key: "analytics",           label: "Advanced Analytics",       icon: BarChart3 },
  { key: "leaderboards",        label: "Rep Leaderboards",         icon: Star },
  { key: "dedicated_csm",       label: "Dedicated CSM",            icon: HeadphonesIcon },
];

const PLAN_COLORS: Record<string, { color: string; bg: string; gradient: string }> = {
  free:    { color: "rgba(255,255,255,.5)",  bg: "rgba(255,255,255,.06)",  gradient: "rgba(255,255,255,.08)" },
  starter: { color: "#60a5fa",               bg: "rgba(96,165,250,.1)",    gradient: "linear-gradient(135deg,#3b82f6,#1d4ed8)" },
  growth:  { color: "#0ef5d4",               bg: "rgba(14,245,212,.1)",    gradient: "linear-gradient(135deg,#0ef5d4,#0891b2)" },
  scale:   { color: "#a78bfa",               bg: "rgba(167,139,250,.1)",   gradient: "linear-gradient(135deg,#8b5cf6,#6d28d9)" },
};

function normalizePlan(raw: string): string {
  if (!raw) return "free";
  const lower = raw.toLowerCase();
  if (lower.includes("scale"))   return "scale";
  if (lower.includes("growth"))  return "growth";
  if (lower.includes("starter")) return "starter";
  return "free";
}

interface InviteData {
  id: string;
  team_id: string;
  email: string;
  role: string;
  status: string;
  expires_at: string;
  inviter_name: string;
  team_name: string;
  plan_key: string;
  is_expired: boolean;
}

export default function InviteLanding() {
  const { token } = useParams<{ token: string }>();
  const navigate  = useNavigate();
  const { user }  = useAuth();

  const [invite,   setInvite]   = useState<InviteData | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [acting,   setActing]   = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [done,     setDone]     = useState<"accepted" | "declined" | null>(null);

  // ── Load invitation ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) { setError("Invalid invitation link."); setLoading(false); return; }

    (async () => {
      const { data, error: rpcErr } = await (supabase as any).rpc(
        "get_invitation_by_token", { p_token: token }
      );
      if (rpcErr || !data?.length) {
        setError("Invitation not found or already used.");
      } else {
        const row = data[0];
        row.plan_key = normalizePlan(row.plan_key);
        setInvite(row);
      }
      setLoading(false);
    })();
  }, [token]);

  // ── Accept ─────────────────────────────────────────────────────────────────
  const handleAccept = async () => {
    if (!user) {
      // Save token to sessionStorage then redirect to login
      sessionStorage.setItem("fixsense_pending_invite", token!);
      navigate(`/login?redirect=/invite/${token}`);
      return;
    }
    setActing(true);
    setError(null);
    const { data, error: rpcErr } = await (supabase as any).rpc(
      "accept_invitation_by_token", { p_token: token }
    );
    if (rpcErr || !data?.success) {
      setError(data?.error || rpcErr?.message || "Failed to accept invitation.");
    } else {
      setDone("accepted");
      setTimeout(() => navigate("/team"), 2200);
    }
    setActing(false);
  };

  // ── Decline ────────────────────────────────────────────────────────────────
  const handleDecline = async () => {
    setActing(true);
    await (supabase as any).rpc("decline_invitation_by_token", { p_token: token });
    setDone("declined");
    setActing(false);
  };

  // ── Render helpers ─────────────────────────────────────────────────────────
  if (loading) return (
    <PageShell>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 280 }}>
        <Loader2 style={{ width: 32, height: 32, color: "#0ef5d4", animation: "spin 1s linear infinite" }} />
      </div>
    </PageShell>
  );

  if (error && !invite) return (
    <PageShell>
      <div style={{ textAlign: "center", padding: "48px 24px" }}>
        <div style={{ width: 56, height: 56, borderRadius: 14, background: "rgba(239,68,68,.12)", border: "1px solid rgba(239,68,68,.25)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
          <X style={{ width: 24, height: 24, color: "#ef4444" }} />
        </div>
        <h2 style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 700, color: "#f0f6fc", fontFamily: "'Bricolage Grotesque',sans-serif" }}>
          Invitation Not Found
        </h2>
        <p style={{ margin: "0 0 24px", fontSize: 13, color: "rgba(255,255,255,.5)" }}>{error}</p>
        <Link to="/login" style={{ color: "#0ef5d4", fontSize: 13, textDecoration: "none" }}>
          Go to Login →
        </Link>
      </div>
    </PageShell>
  );

  if (done === "accepted") return (
    <PageShell>
      <div style={{ textAlign: "center", padding: "48px 24px" }}>
        <div style={{ width: 64, height: 64, borderRadius: 16, background: "rgba(14,245,212,.12)", border: "1px solid rgba(14,245,212,.3)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
          <CheckCircle2 style={{ width: 28, height: 28, color: "#0ef5d4" }} />
        </div>
        <h2 style={{ margin: "0 0 8px", fontSize: 22, fontWeight: 800, color: "#f0f6fc", fontFamily: "'Bricolage Grotesque',sans-serif" }}>
          Welcome to {invite?.team_name}!
        </h2>
        <p style={{ margin: "0 0 8px", fontSize: 14, color: "rgba(255,255,255,.6)" }}>
          You now have access to all {planLabel(invite?.plan_key)} plan features.
        </p>
        <p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,.35)" }}>
          Redirecting to your team dashboard…
        </p>
      </div>
    </PageShell>
  );

  if (done === "declined") return (
    <PageShell>
      <div style={{ textAlign: "center", padding: "48px 24px" }}>
        <p style={{ fontSize: 15, color: "rgba(255,255,255,.6)", marginBottom: 16 }}>
          You've declined the invitation.
        </p>
        <Link to="/dashboard" style={{ color: "#0ef5d4", fontSize: 13, textDecoration: "none" }}>
          Go to Dashboard →
        </Link>
      </div>
    </PageShell>
  );

  if (!invite) return null;

  const planKey   = invite.plan_key;
  const planCfg   = PLAN_COLORS[planKey] ?? PLAN_COLORS.free;
  const planMeta  = PLAN_FEATURES[planKey] ?? PLAN_FEATURES.free;
  const PlanIcon  = planMeta.icon;
  const included  = new Set(planMeta.included);
  const emailMismatch = user && user.email?.toLowerCase() !== invite.email.toLowerCase();

  return (
    <PageShell>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:none; } }
        .inv-card { animation: fadeUp .3s ease; }
      `}</style>

      <div className="inv-card" style={{ maxWidth: 480, margin: "0 auto", padding: "24px 16px" }}>

        {/* ── Header ── */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 18,
            background: planCfg.bg, border: `1px solid ${planCfg.color}30`,
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 14px",
          }}>
            <Users style={{ width: 28, height: 28, color: planCfg.color }} />
          </div>
          <h1 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 800, color: "#f0f6fc", fontFamily: "'Bricolage Grotesque',sans-serif", letterSpacing: "-.03em" }}>
            You're invited to join
          </h1>
          <p style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 700, color: planCfg.color, fontFamily: "'Bricolage Grotesque',sans-serif" }}>
            {invite.team_name}
          </p>
          <p style={{ margin: 0, fontSize: 13, color: "rgba(255,255,255,.45)" }}>
            <strong style={{ color: "rgba(255,255,255,.75)" }}>{invite.inviter_name}</strong> invited you as{" "}
            <span style={{ textTransform: "capitalize", color: "rgba(255,255,255,.65)" }}>{invite.role}</span>
          </p>
        </div>

        {/* ── Plan badge ── */}
        <div style={{
          background: planCfg.bg,
          border: `1px solid ${planCfg.color}30`,
          borderRadius: 14, padding: "14px 18px",
          display: "flex", alignItems: "center", gap: 12, marginBottom: 20,
        }}>
          <div style={{
            width: 38, height: 38, borderRadius: 10,
            background: `${planCfg.color}18`, border: `1px solid ${planCfg.color}30`,
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <PlanIcon style={{ width: 18, height: 18, color: planCfg.color }} />
          </div>
          <div>
            <p style={{ margin: "0 0 2px", fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,.4)", textTransform: "uppercase", letterSpacing: ".06em" }}>
              Team Plan
            </p>
            <p style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "#f0f6fc", fontFamily: "'Bricolage Grotesque',sans-serif" }}>
              {planMeta.label}
            </p>
            <p style={{ margin: 0, fontSize: 11, color: "rgba(255,255,255,.4)" }}>
              You'll inherit all {planMeta.label} features
            </p>
          </div>
        </div>

        {/* ── Feature grid ── */}
        <div style={{ marginBottom: 22 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,.3)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 10 }}>
            Features you'll get
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {ALL_FEATURES.map(f => {
              const isIncluded = included.has(f.key);
              return (
                <div key={f.key} style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "8px 10px", borderRadius: 9,
                  background: isIncluded ? `${planCfg.color}08` : "transparent",
                  border: `1px solid ${isIncluded ? `${planCfg.color}20` : "rgba(255,255,255,.05)"}`,
                  opacity: isIncluded ? 1 : 0.4,
                }}>
                  {isIncluded
                    ? <CheckCircle2 style={{ width: 12, height: 12, color: planCfg.color, flexShrink: 0 }} />
                    : <Lock style={{ width: 11, height: 11, color: "rgba(255,255,255,.3)", flexShrink: 0 }} />}
                  <span style={{ fontSize: 11, fontWeight: 500, color: isIncluded ? "rgba(255,255,255,.8)" : "rgba(255,255,255,.35)" }}>
                    {f.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Email mismatch warning ── */}
        {emailMismatch && (
          <div style={{
            display: "flex", alignItems: "flex-start", gap: 10,
            padding: "12px 14px", borderRadius: 10, marginBottom: 16,
            background: "rgba(245,158,11,.08)", border: "1px solid rgba(245,158,11,.25)",
          }}>
            <AlertTriangle style={{ width: 15, height: 15, color: "#f59e0b", flexShrink: 0, marginTop: 1 }} />
            <p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,.6)", lineHeight: 1.5 }}>
              This invitation is for <strong style={{ color: "#f0f6fc" }}>{invite.email}</strong>, but you're logged in as{" "}
              <strong style={{ color: "#f0f6fc" }}>{user?.email}</strong>. Please log in with the invited email.
            </p>
          </div>
        )}

        {/* ── Expired warning ── */}
        {invite.is_expired && (
          <div style={{
            padding: "12px 14px", borderRadius: 10, marginBottom: 16,
            background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.2)",
          }}>
            <p style={{ margin: 0, fontSize: 12, color: "#ef4444" }}>
              This invitation has expired. Ask your team admin to resend it.
            </p>
          </div>
        )}

        {/* ── Already used warning ── */}
        {invite.status !== "pending" && (
          <div style={{
            padding: "12px 14px", borderRadius: 10, marginBottom: 16,
            background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)",
          }}>
            <p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,.5)" }}>
              This invitation has already been {invite.status}.
              {invite.status === "accepted" && (
                <span> <Link to="/team" style={{ color: "#0ef5d4", textDecoration: "none" }}>Go to your team →</Link></span>
              )}
            </p>
          </div>
        )}

        {/* ── Error ── */}
        {error && (
          <div style={{ padding: "10px 14px", borderRadius: 10, marginBottom: 14, background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.2)" }}>
            <p style={{ margin: 0, fontSize: 12, color: "#ef4444" }}>{error}</p>
          </div>
        )}

        {/* ── CTAs ── */}
        {invite.status === "pending" && !invite.is_expired && !emailMismatch && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {!user && (
              <p style={{ margin: "0 0 6px", fontSize: 12, color: "rgba(255,255,255,.4)", textAlign: "center" }}>
                You'll need to sign in or create an account for{" "}
                <strong style={{ color: "rgba(255,255,255,.65)" }}>{invite.email}</strong>
              </p>
            )}
            <button
              onClick={handleAccept}
              disabled={acting}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                height: 48, borderRadius: 12, border: "none", cursor: acting ? "not-allowed" : "pointer",
                background: acting ? "rgba(14,245,212,.3)" : planCfg.gradient,
                color: planKey === "free" ? "#0a0d18" : "#fff",
                fontSize: 14, fontWeight: 700, fontFamily: "'DM Sans',sans-serif",
                transition: "all .13s",
              }}
            >
              {acting ? <Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} /> : <CheckCircle2 style={{ width: 16, height: 16 }} />}
              {user ? "Accept Invitation" : "Sign In & Accept"}
            </button>

            <button
              onClick={handleDecline}
              disabled={acting}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                height: 40, borderRadius: 10, border: "1px solid rgba(255,255,255,.08)",
                cursor: acting ? "not-allowed" : "pointer",
                background: "transparent", color: "rgba(255,255,255,.4)",
                fontSize: 13, fontFamily: "'DM Sans',sans-serif",
              }}
            >
              <X style={{ width: 14, height: 14 }} />
              Decline
            </button>
          </div>
        )}

        {/* ── Already member ── */}
        {invite.status === "accepted" && user && (
          <Link to="/team" style={{ display: "block", textAlign: "center", padding: "12px", borderRadius: 10, background: `${planCfg.color}12`, color: planCfg.color, fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
            Go to Team Dashboard →
          </Link>
        )}

        <p style={{ margin: "18px 0 0", fontSize: 11, color: "rgba(255,255,255,.25)", textAlign: "center" }}>
          Fixsense · AI-powered sales intelligence
        </p>
      </div>
    </PageShell>
  );
}

function planLabel(key?: string): string {
  return PLAN_FEATURES[key ?? "free"]?.label ?? "team";
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg,#050810 0%,#0a0d18 60%,#050810 100%)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'DM Sans',sans-serif",
      padding: "16px",
    }}>
      <div style={{ width: "100%", maxWidth: 520 }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <span style={{ fontSize: 18, fontWeight: 800, color: "#0ef5d4", fontFamily: "'Bricolage Grotesque',sans-serif", letterSpacing: "-.03em" }}>
            fixsense
          </span>
        </div>
        <div style={{
          background: "#0e1220",
          border: "1px solid rgba(255,255,255,.08)",
          borderRadius: 20,
          overflow: "hidden",
          boxShadow: "0 24px 64px rgba(0,0,0,.6)",
        }}>
          {children}
        </div>
      </div>
    </div>
  );
}