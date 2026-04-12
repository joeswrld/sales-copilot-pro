/**
 * UpgradeModal.tsx
 *
 * Beautiful upgrade prompt shown when a user hits a plan gate.
 * Displays what the feature is, what plan unlocks it, and a CTA.
 */

import { useNavigate } from "react-router-dom";
import { X, Zap, ArrowRight, Check, Lock } from "lucide-react";
import { usePlanEnforcement, FEATURE_LABELS, FEATURE_REQUIRED_PLAN, type PlanFeatureKey } from "@/contexts/PlanEnforcementContext";
import { PLAN_CONFIG, PLAN_ORDER } from "@/config/plans";

// Plan-specific upgrade copy
const UPGRADE_COPY: Record<string, { headline: string; sub: string; color: string; gradient: string }> = {
  starter: {
    headline: "Unlock Starter Features",
    sub: "Get AI insights, objection detection, and team tools for $18/month.",
    color: "#60a5fa",
    gradient: "linear-gradient(135deg, #3b82f6, #1d4ed8)",
  },
  growth: {
    headline: "Unlock Growth Features",
    sub: "Everything your team needs: deal intelligence, coaching clips, and advanced analytics.",
    color: "#0ef5d4",
    gradient: "linear-gradient(135deg, #0ef5d4, #0891b2)",
  },
  scale: {
    headline: "Unlock Scale Features",
    sub: "Enterprise-grade capabilities with unlimited seats and a dedicated CSM.",
    color: "#a78bfa",
    gradient: "linear-gradient(135deg, #8b5cf6, #6d28d9)",
  },
};

const PLAN_FEATURES_PREVIEW: Record<string, string[]> = {
  starter: [
    "Objection detection",
    "Sentiment analysis",
    "Up to 3 team members",
    "Action Layer + CRM push",
  ],
  growth: [
    "Deal rooms & deal AI",
    "Coaching clips library",
    "Advanced analytics",
    "Rep leaderboards",
    "Up to 10 team members",
  ],
  scale: [
    "5,000 min/month",
    "Unlimited team members",
    "Dedicated CSM",
    "All Growth features",
  ],
};

export default function UpgradeModal() {
  const navigate = useNavigate();
  const { upgradeModal, closeUpgradeModal, planKey } = usePlanEnforcement();
  const { open, feature, customMessage } = upgradeModal;

  if (!open) return null;

  const requiredPlanName = feature ? FEATURE_REQUIRED_PLAN[feature] : "Growth";
  const requiredPlanKey = requiredPlanName.toLowerCase();
  const copy = UPGRADE_COPY[requiredPlanKey] ?? UPGRADE_COPY.growth;
  const featureLabel = feature ? FEATURE_LABELS[feature] : "this feature";
  const previewFeatures = PLAN_FEATURES_PREVIEW[requiredPlanKey] ?? [];
  const plan = PLAN_CONFIG[requiredPlanKey];

  const currentPlanIdx = PLAN_ORDER.indexOf(planKey);
  const requiredPlanIdx = PLAN_ORDER.indexOf(requiredPlanKey);

  return (
    <>
      <style>{`
        @keyframes um-fade { from{opacity:0} to{opacity:1} }
        @keyframes um-up { from{opacity:0;transform:translateY(20px) scale(.96)} to{opacity:1;transform:none} }
        .um-overlay {
          position:fixed;inset:0;z-index:99999;
          background:rgba(0,0,0,.75);backdrop-filter:blur(14px);
          display:flex;align-items:center;justify-content:center;padding:20px;
          animation:um-fade .15s ease;
        }
        .um-card {
          width:100%;max-width:440px;
          background:#0a0d18;border:1px solid rgba(255,255,255,.1);
          border-radius:22px;overflow:hidden;
          animation:um-up .2s ease;
          box-shadow:0 40px 100px rgba(0,0,0,.9);
        }
        .um-header {
          padding:28px 26px 22px;
          position:relative;
          border-bottom:1px solid rgba(255,255,255,.07);
        }
        .um-close {
          position:absolute;top:16px;right:16px;
          width:28px;height:28px;border-radius:7px;
          background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);
          display:flex;align-items:center;justify-content:center;
          cursor:pointer;color:rgba(255,255,255,.4);
          transition:.12s;
        }
        .um-close:hover{background:rgba(255,255,255,.1);color:rgba(255,255,255,.7);}
        .um-lock-icon {
          width:48px;height:48px;border-radius:14px;
          display:flex;align-items:center;justify-content:center;
          margin-bottom:14px;
        }
        .um-badge {
          display:inline-flex;align-items:center;gap:5px;
          font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;
          padding:4px 12px;border-radius:20px;margin-bottom:14px;
          font-family:'DM Sans',sans-serif;
        }
        .um-title {
          font-size:20px;font-weight:800;color:#f0f6fc;
          font-family:'Bricolage Grotesque',sans-serif;
          letter-spacing:-.04em;line-height:1.15;margin:0 0 8px;
        }
        .um-sub {
          font-size:13px;color:rgba(255,255,255,.55);line-height:1.6;margin:0;
          font-family:'DM Sans',sans-serif;
        }
        .um-body { padding:18px 26px 24px; }
        .um-features {
          display:flex;flex-direction:column;gap:8px;margin-bottom:22px;
        }
        .um-feature {
          display:flex;align-items:center;gap:9px;
          font-size:13px;color:rgba(255,255,255,.7);
          font-family:'DM Sans',sans-serif;
        }
        .um-feature-dot {
          width:17px;height:17px;border-radius:50%;flex-shrink:0;
          display:flex;align-items:center;justify-content:center;
        }
        .um-price {
          display:flex;align-items:baseline;gap:3px;margin-bottom:16px;
          font-family:'Bricolage Grotesque',sans-serif;
        }
        .um-price-num { font-size:38px;font-weight:800;color:#f0f6fc;letter-spacing:-.05em; }
        .um-price-period { font-size:13px;color:rgba(255,255,255,.4); }
        .um-cta {
          width:100%;display:flex;align-items:center;justify-content:center;gap:8px;
          padding:13px;border-radius:12px;border:none;
          font-size:14px;font-weight:700;font-family:'DM Sans',sans-serif;
          cursor:pointer;transition:all .15s;
        }
        .um-footer {
          display:flex;align-items:center;justify-content:center;gap:10px;
          padding:12px 26px;border-top:1px solid rgba(255,255,255,.05);
        }
        .um-footer-link {
          font-size:12px;color:rgba(255,255,255,.3);
          background:none;border:none;cursor:pointer;
          font-family:'DM Sans',sans-serif;
          transition:color .12s;
        }
        .um-footer-link:hover{color:rgba(255,255,255,.6);}
      `}</style>

      <div className="um-overlay" onClick={e => e.target === e.currentTarget && closeUpgradeModal()}>
        <div className="um-card">
          {/* Header */}
          <div className="um-header">
            <button className="um-close" onClick={closeUpgradeModal}>
              <X style={{ width: 13, height: 13 }} />
            </button>

            <div className="um-lock-icon" style={{ background: `${copy.color}18`, border: `1px solid ${copy.color}30` }}>
              <Lock style={{ width: 20, height: 20, color: copy.color }} />
            </div>

            <div className="um-badge" style={{ background: `${copy.color}15`, color: copy.color, border: `1px solid ${copy.color}30` }}>
              <Zap style={{ width: 10, height: 10 }} />
              {requiredPlanName} Plan
            </div>

            <p className="um-title">{copy.headline}</p>
            <p className="um-sub">
              {customMessage || `${featureLabel} requires the ${requiredPlanName} plan or higher.`}
            </p>
          </div>

          {/* Body */}
          <div className="um-body">
            {/* Features included */}
            <p style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,.3)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 10, fontFamily: "'DM Sans',sans-serif" }}>
              {requiredPlanName} includes
            </p>
            <div className="um-features">
              {previewFeatures.map(f => (
                <div key={f} className="um-feature">
                  <div className="um-feature-dot" style={{ background: `${copy.color}18` }}>
                    <Check style={{ width: 9, height: 9, color: copy.color }} />
                  </div>
                  {f}
                </div>
              ))}
            </div>

            {/* Price */}
            {plan && (
              <div className="um-price">
                <span className="um-price-num">${plan.price_usd}</span>
                <span className="um-price-period">/month</span>
              </div>
            )}

            {/* CTA */}
            <button
              className="um-cta"
              style={{ background: copy.gradient, color: "#fff", boxShadow: `0 4px 20px ${copy.color}30` }}
              onClick={() => { closeUpgradeModal(); navigate("/dashboard/billing"); }}
            >
              Upgrade to {requiredPlanName}
              <ArrowRight style={{ width: 15, height: 15 }} />
            </button>
          </div>

          <div className="um-footer">
            <button className="um-footer-link" onClick={() => { closeUpgradeModal(); navigate("/pricing"); }}>
              Compare all plans
            </button>
            <span style={{ color: "rgba(255,255,255,.1)" }}>·</span>
            <button className="um-footer-link" onClick={closeUpgradeModal}>
              Maybe later
            </button>
          </div>
        </div>
      </div>
    </>
  );
}