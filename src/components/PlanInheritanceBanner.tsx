/**
 * PlanInheritanceBanner.tsx — v2 (Team Plan Inheritance)
 *
 * Shows a banner when:
 * 1. User is inheriting a higher plan from their team admin
 * 2. User IS the admin and has active teammates (so they know it applies to others too)
 */

import { useNavigate } from "react-router-dom";
import { Crown, Users, Sparkles, ArrowRight, Shield } from "lucide-react";
import { usePlanEnforcement } from "@/contexts/PlanEnforcementContext";
import { useEffectivePlan } from "@/hooks/useEffectivePlan";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

export default function PlanInheritanceBanner() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { planKey, planName, isInherited, adminUserId } = usePlanEnforcement();
  const { effectivePlan } = useEffectivePlan();

  // Fetch admin's email for display when user is inheriting plan
  const { data: adminProfile } = useQuery({
    queryKey: ["admin-profile-for-banner", adminUserId],
    queryFn: async () => {
      if (!adminUserId) return null;
      const { data } = await supabase
        .from("profiles")
        .select("full_name, email")
        .eq("id", adminUserId)
        .maybeSingle();
      return data;
    },
    enabled: !!adminUserId && isInherited,
    staleTime: 5 * 60_000,
  });

  // Fetch team member count when user is the admin (to show sharing info)
  const { data: teamMemberCount } = useQuery({
    queryKey: ["team-member-count-banner", user?.id],
    queryFn: async () => {
      if (!user?.id) return 0;
      const { data: membership } = await supabase
        .from("team_members")
        .select("team_id")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .eq("status", "active")
        .maybeSingle();
      if (!membership?.team_id) return 0;
      const { count } = await supabase
        .from("team_members")
        .select("*", { count: "exact", head: true })
        .eq("team_id", membership.team_id)
        .eq("status", "active")
        .neq("user_id", user.id);
      return count ?? 0;
    },
    enabled: !!user?.id && !isInherited && planKey !== "free",
    staleTime: 60_000,
  });

  const planColors: Record<string, { color: string; bg: string; border: string }> = {
    free:    { color: "rgba(255,255,255,.5)",  bg: "rgba(255,255,255,.03)",  border: "rgba(255,255,255,.08)"  },
    starter: { color: "#60a5fa",               bg: "rgba(96,165,250,.07)",   border: "rgba(96,165,250,.2)"    },
    growth:  { color: "#0ef5d4",               bg: "rgba(14,245,212,.07)",   border: "rgba(14,245,212,.2)"    },
    scale:   { color: "#a78bfa",               bg: "rgba(167,139,250,.07)",  border: "rgba(167,139,250,.2)"   },
  };
  const colors = planColors[planKey] ?? planColors.free;

  // ── Case 1: Teammate inheriting admin's plan ──────────────────────────────
  if (isInherited && adminUserId !== user?.id) {
    const adminName = adminProfile?.full_name || adminProfile?.email || "your team admin";

    return (
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap" as const,
        padding: "12px 16px",
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        borderRadius: 12,
        fontFamily: "'DM Sans', sans-serif",
      }}>
        <div style={{
          width: 34,
          height: 34,
          borderRadius: 10,
          background: `${colors.color}15`,
          border: `1px solid ${colors.color}30`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}>
          <Shield style={{ width: 16, height: 16, color: colors.color }} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
            <span style={{
              fontSize: 12,
              fontWeight: 700,
              color: colors.color,
              textTransform: "uppercase" as const,
              letterSpacing: ".05em",
            }}>
              {planName} Plan
            </span>
            <span style={{
              fontSize: 9,
              fontWeight: 700,
              padding: "2px 7px",
              borderRadius: 20,
              background: `${colors.color}15`,
              color: colors.color,
              border: `1px solid ${colors.color}25`,
              letterSpacing: ".04em",
            }}>
              TEAM ACCESS
            </span>
          </div>
          <p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,.45)", lineHeight: 1.4 }}>
            You have full access to <strong style={{ color: "rgba(255,255,255,.7)" }}>{planName}</strong> features
            through your team workspace — provided by {adminName}.
          </p>
        </div>

        <button
          onClick={() => navigate("/billing")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            fontSize: 11,
            fontWeight: 600,
            color: colors.color,
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: "6px 10px",
            borderRadius: 8,
            transition: "background .12s",
            flexShrink: 0,
            fontFamily: "'DM Sans', sans-serif",
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = `${colors.color}10`; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "none"; }}
        >
          View billing <ArrowRight style={{ width: 12, height: 12 }} />
        </button>
      </div>
    );
  }

  // ── Case 2: Admin with team members — show that plan is shared ──────────
  if (!isInherited && planKey !== "free" && (teamMemberCount ?? 0) > 0) {
    return (
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 16px",
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        borderRadius: 12,
        fontFamily: "'DM Sans', sans-serif",
      }}>
        <Users style={{ width: 15, height: 15, color: colors.color, flexShrink: 0 }} />
        <p style={{ margin: 0, flex: 1, fontSize: 12, color: "rgba(255,255,255,.5)" }}>
          Your <strong style={{ color: colors.color }}>{planName}</strong> plan features are shared with{" "}
          <strong style={{ color: "rgba(255,255,255,.7)" }}>
            {teamMemberCount} teammate{(teamMemberCount ?? 0) !== 1 ? "s" : ""}
          </strong>{" "}
          in your workspace.
        </p>
        <button
          onClick={() => navigate("/team")}
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: colors.color,
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: "4px 8px",
            borderRadius: 7,
            fontFamily: "'DM Sans', sans-serif",
            flexShrink: 0,
          }}
        >
          Manage team →
        </button>
      </div>
    );
  }

  return null;
}