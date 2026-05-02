/**
 * PlanEnforcementDashboard.tsx — v2 (Team Plan Inheritance)
 *
 * A full plan overview panel showing:
 * - Current plan with minutes meter + team inheritance badge
 * - Feature availability grid
 * - Upgrade CTAs per locked feature
 */

import { useNavigate } from "react-router-dom";
import {
  Check, X, Lock, Zap, ArrowRight, Radio,
  Mic, FileText, AlertCircle, BarChart3, Users,
  MessageSquare, Star, Phone, TrendingUp,
  Target, Scissors, HeadphonesIcon, Crown, Shield,
} from "lucide-react";
import { usePlanEnforcement, FEATURE_LABELS, FEATURE_REQUIRED_PLAN, type PlanFeatureKey } from "@/contexts/PlanEnforcementContext";
import { MinutesMeter } from "./PlanGate";
import { PLAN_CONFIG, PLAN_ORDER } from "@/config/plans";

const FEATURE_DISPLAY: {
  key: PlanFeatureKey;
  icon: React.ElementType;
  description: string;
}[] = [
  { key: "live_calls",          icon: Phone,           description: "Start and host live meetings" },
  { key: "transcription",       icon: Mic,             description: "Real-time AI transcription" },
  { key: "summaries",           icon: FileText,        description: "AI-generated call summaries" },
  { key: "objection_detection", icon: AlertCircle,     description: "Detect objections in real-time" },
  { key: "sentiment",           icon: TrendingUp,      description: "Prospect sentiment tracking" },
  { key: "engagement",          icon: Radio,           description: "Engagement score per call" },
  { key: "deal_rooms",          icon: Target,          description: "Deal intelligence & timeline" },
  { key: "coaching",            icon: Scissors,        description: "Coaching clips & playlists" },
  { key: "team_messages",       icon: MessageSquare,   description: "Team messaging & deal rooms" },
  { key: "analytics",           icon: BarChart3,       description: "Advanced team analytics" },
  { key: "leaderboards",        icon: Star,            description: "Rep performance leaderboards" },
  { key: "crm_push",            icon: Zap,             description: "CRM sync & action layer" },
  { key: "dedicated_csm",       icon: HeadphonesIcon,  description: "Dedicated customer success manager" },
];

const PLAN_HIGHLIGHTS: Record<string, { tagline: string; color: string; gradient: string }> = {
  free:    { tagline: "Getting started",              color: "rgba(255,255,255,.5)", gradient: "rgba(255,255,255,.06)" },
  starter: { tagline: "For individual reps",          color: "#60a5fa",              gradient: "rgba(96,165,250,.08)"   },
  growth:  { tagline: "Most popular — growing teams", color: "#0ef5d4",              gradient: "rgba(14,245,212,.08)"   },
  scale:   { tagline: "Enterprise sales orgs",        color: "#a78bfa",              gradient: "rgba(167,139,250,.08)"  },
};

export default function PlanEnforcementDashboard() {
  const navigate = useNavigate();
  const { hasFeature, planKey, planName, planIndex, isInherited, adminUserId, openUpgradeModal } = usePlanEnforcement();

  const currentHighlight = PLAN_HIGHLIGHTS[planKey] ?? PLAN_HIGHLIGHTS.free;
  const nextPlanKey = PLAN_ORDER[planIndex + 1];
  const nextPlan = nextPlanKey ? PLAN_CONFIG[nextPlanKey] : null;
  const nextHighlight = nextPlanKey ? PLAN_HIGHLIGHTS[nextPlanKey] : null;

  const lockedFeatures   = FEATURE_DISPLAY.filter(f => !hasFeature(f.key));
  const unlockedFeatures = FEATURE_DISPLAY.filter(f =>  hasFeature(f.key));

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Current Plan Card */}
      <div style={{
        background: currentHighlight.gradient,
        border: `1px solid ${currentHighlight.color}25`,
        borderRadius: 16, padding: "20px 22px",
        position: "relative", overflow: "hidden",
      }}>
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 2,
          background: `linear-gradient(90deg, ${currentHighlight.color}, transparent)`,
        }} />

        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
              {planKey === "scale"
                ? <Crown style={{ width: 15, height: 15, color: "#a78bfa" }} />
                : isInherited
                ? <Shield style={{ width: 14, height: 14, color: currentHighlight.color }} />
                : null}
              <span style={{
                fontSize: 11, fontWeight: 700, letterSpacing: ".07em", textTransform: "uppercase",
                color: currentHighlight.color,
              }}>
                Current Plan
              </span>
              {/* Team badge when inherited */}
              {isInherited && (
                <span style={{
                  fontSize: 9, fontWeight: 800,
                  padding: "2px 7px", borderRadius: 20,
                  background: `${currentHighlight.color}15`,
                  color: currentHighlight.color,
                  border: `1px solid ${currentHighlight.color}30`,
                  letterSpacing: ".06em",
                  textTransform: "uppercase" as const,
                }}>
                  TEAM
                </span>
              )}
            </div>
            <h2 style={{
              margin: 0, fontSize: 24, fontWeight: 800, color: "#f0f6fc",
              fontFamily: "'Bricolage Grotesque', sans-serif", letterSpacing: "-.04em",
            }}>
              {planName}
            </h2>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "rgba(255,255,255,.45)" }}>
              {isInherited
                ? "Shared from your team workspace"
                : currentHighlight.tagline}
            </p>
          </div>

          {/* Show upgrade CTA only when NOT inherited (admin should upgrade) */}
          {!isInherited && nextPlan && (
            <button
              onClick={() => navigate("/billing")}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                background: `${nextHighlight?.color ?? "#0ef5d4"}15`,
                border: `1px solid ${nextHighlight?.color ?? "#0ef5d4"}30`,
                borderRadius: 10, padding: "8px 14px", flexShrink: 0,
                color: nextHighlight?.color ?? "#0ef5d4",
                fontSize: 12, fontWeight: 700, cursor: "pointer",
              }}
            >
              <Zap style={{ width: 12, height: 12 }} />
              Upgrade to {nextPlan.name}
              <ArrowRight style={{ width: 12, height: 12 }} />
            </button>
          )}

          {/* When inherited, show info about workspace */}
          {isInherited && (
            <button
              onClick={() => navigate("/billing")}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                background: `${currentHighlight.color}10`,
                border: `1px solid ${currentHighlight.color}25`,
                borderRadius: 10, padding: "8px 14px", flexShrink: 0,
                color: "rgba(255,255,255,.5)",
                fontSize: 11, fontWeight: 600, cursor: "pointer",
              }}
            >
              <Users style={{ width: 12, height: 12, color: currentHighlight.color }} />
              <span style={{ color: currentHighlight.color }}>Team workspace</span>
            </button>
          )}
        </div>

        <MinutesMeter />
      </div>

      {/* Unlocked Features */}
      {unlockedFeatures.length > 0 && (
        <div>
          <p style={{
            fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,.3)",
            textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 10,
          }}>
            {isInherited ? `Your team's features (${unlockedFeatures.length})` : `Your features (${unlockedFeatures.length})`}
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8 }}>
            {unlockedFeatures.map(f => (
              <div key={f.key} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 12px",
                background: "rgba(255,255,255,.025)",
                border: "1px solid rgba(255,255,255,.06)",
                borderRadius: 10,
              }}>
                <div style={{
                  width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                  background: "rgba(14,245,212,.08)", border: "1px solid rgba(14,245,212,.15)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <f.icon style={{ width: 14, height: 14, color: "#0ef5d4" }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,.8)" }}>
                    {FEATURE_LABELS[f.key]}
                  </p>
                  <p style={{ margin: 0, fontSize: 10, color: "rgba(255,255,255,.35)" }}>
                    {f.description}
                  </p>
                </div>
                <Check style={{ width: 14, height: 14, color: "#0ef5d4", flexShrink: 0 }} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Locked Features */}
      {lockedFeatures.length > 0 && (
        <div>
          <p style={{
            fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,.3)",
            textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 10,
          }}>
            {isInherited
              ? `Not included in team plan (${lockedFeatures.length})`
              : `Unlock with an upgrade (${lockedFeatures.length})`}
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8 }}>
            {lockedFeatures.map(f => {
              const requiredPlan = FEATURE_REQUIRED_PLAN[f.key];
              const planColors: Record<string, string> = {
                Starter: "#60a5fa", Growth: "#0ef5d4", Scale: "#a78bfa",
              };
              const color = planColors[requiredPlan] ?? "#a78bfa";
              return (
                <button
                  key={f.key}
                  onClick={() => !isInherited && openUpgradeModal(f.key)}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "10px 12px",
                    cursor: isInherited ? "default" : "pointer",
                    textAlign: "left",
                    background: "rgba(255,255,255,.015)",
                    border: "1px dashed rgba(255,255,255,.08)",
                    borderRadius: 10, transition: "all .13s",
                    fontFamily: "'DM Sans', sans-serif",
                  }}
                  onMouseEnter={e => {
                    if (!isInherited) {
                      (e.currentTarget as HTMLElement).style.borderColor = `${color}30`;
                      (e.currentTarget as HTMLElement).style.background = `${color}06`;
                    }
                  }}
                  onMouseLeave={e => {
                    if (!isInherited) {
                      (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,.08)";
                      (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,.015)";
                    }
                  }}
                >
                  <div style={{
                    width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                    background: `${color}08`, border: `1px solid ${color}15`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    opacity: .7,
                  }}>
                    <f.icon style={{ width: 14, height: 14, color }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0, opacity: .6 }}>
                    <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,.8)" }}>
                      {FEATURE_LABELS[f.key]}
                    </p>
                    <p style={{ margin: 0, fontSize: 10, color: "rgba(255,255,255,.35)" }}>
                      {requiredPlan}+ required
                    </p>
                  </div>
                  <Lock style={{ width: 11, height: 11, color, flexShrink: 0, opacity: .7 }} />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* All unlocked */}
      {lockedFeatures.length === 0 && (
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "14px 18px",
          background: "rgba(14,245,212,.06)",
          border: "1px solid rgba(14,245,212,.2)",
          borderRadius: 12,
        }}>
          <Crown style={{ width: 18, height: 18, color: "#0ef5d4", flexShrink: 0 }} />
          <div>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#f0f6fc" }}>
              Full access unlocked
            </p>
            <p style={{ margin: 0, fontSize: 11, color: "rgba(255,255,255,.45)" }}>
              {isInherited
                ? "Your team workspace gives you access to every Fixsense feature"
                : "You have access to every Fixsense feature"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}