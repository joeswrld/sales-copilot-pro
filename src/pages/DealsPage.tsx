/**
 * DealsPage.tsx — with plan enforcement
 *
 * Deal Rooms & Deal AI requires Growth plan.
 *
 * The gate is inlined here so no extra "Inner" file is needed.
 * The real page content follows the guard directly in this file.
 *
 * MIGRATION:
 *   1. Replace your existing src/pages/DealsPage.tsx with this file.
 *   2. Move all your original DealsPage JSX/logic into the `DealsPageInner`
 *      component defined below, keeping this file as the default export entry.
 *
 * If you prefer to keep the original file untouched, rename it to
 * DealsPageInner.tsx first and then drop this file in as DealsPage.tsx.
 */

import DashboardLayout from "@/components/DashboardLayout";
import { LockedCard } from "@/components/plan/PlanGate";
import { usePlanEnforcement } from "@/contexts/PlanEnforcementContext";

// ─── Paste / import your real DealsPage content below ────────────────────────
// Option A: If you renamed the old file to DealsPageInner.tsx, uncomment:
// import DealsPageInner from "./DealsPageInner";

// Option B (recommended if you want a single file): move the existing
// DealsPage component body here as `DealsPageInner` and keep this default
// export as the gated shell. The placeholder below shows the structure.

function DealsPageInner() {
  // ── REPLACE this placeholder with your real DealsPage JSX ────────────────
  // Everything that was previously inside `export default function DealsPage()`
  // should live here instead.
  return null;
}

// ─── Gated shell — this is the actual default export ─────────────────────────
export default function DealsPage() {
  const { hasFeature } = usePlanEnforcement();

  if (!hasFeature("deal_rooms")) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <LockedCard
            feature="deal_rooms"
            description="Track every prospect conversation in one timeline. AI-generated deal intelligence, objection tracking, and next-step recommendations — all linked to your calls."
          />
        </div>
      </DashboardLayout>
    );
  }

  return <DealsPageInner />;
}