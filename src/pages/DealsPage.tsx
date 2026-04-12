/**
 * DealsPage.tsx — with plan enforcement
 * Deal Rooms & Deal AI requires Growth plan.
 */

import DashboardLayout from "@/components/DashboardLayout";
import { LockedCard } from "@/components/plan/PlanGate";
import { usePlanEnforcement } from "@/contexts/PlanEnforcementContext";

// Lazy-import the real page so it doesn't load for non-Growth users
import DealsPageInner from "./DealsPageInner";

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