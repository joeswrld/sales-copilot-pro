/**
 * MessagesPage.tsx — with plan enforcement
 * Team Messages requires Starter plan.
 *
 * Usage: replace the import in App.tsx:
 *   import MessagesPage from "./pages/MessagesPage";
 * with:
 *   import MessagesPage from "./pages/MessagesPageGated";
 */

import DashboardLayout from "@/components/DashboardLayout";
import { LockedCard } from "@/components/plan/PlanGate";
import { usePlanEnforcement } from "@/contexts/PlanEnforcementContext";
import MessagesPageInner from "./MessagesPage";

export default function MessagesPageGated() {
  const { hasFeature } = usePlanEnforcement();

  if (!hasFeature("team_messages")) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <LockedCard
            feature="team_messages"
            description="Collaborate with your team in real-time. Deal room conversations, direct messages, group chats, and coaching threads — all in one place."
          />
        </div>
      </DashboardLayout>
    );
  }

  return <MessagesPageInner />;
}