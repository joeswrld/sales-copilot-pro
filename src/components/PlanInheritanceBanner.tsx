import { Sparkles, ShieldCheck } from "lucide-react";
import { useEffectivePlan } from "@/hooks/useEffectivePlan";
import { useTeam } from "@/hooks/useTeam";

/**
 * Shows a subtle banner when the current user's active plan
 * is inherited from their team admin (workspace owner).
 *
 * Uses the optimised useEffectivePlan hook which resolves the
 * plan in a single RPC call — no N+1 queries.
 */
export default function PlanInheritanceBanner() {
  const { members } = useTeam();
  const { effectivePlan, isLoading } = useEffectivePlan();

  if (isLoading || !effectivePlan?.isInherited) return null;

  const adminMember = members.find(
    (m) => m.user_id === effectivePlan.adminUserId
  );
  const adminName =
    adminMember?.profile?.full_name ||
    adminMember?.profile?.email ||
    "your workspace admin";

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 border border-primary/20 text-xs text-primary">
      <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
      <span>
        You're on the{" "}
        <strong className="font-semibold">{effectivePlan.planName}</strong> plan
        via your workspace ({adminName}).{" "}
        {effectivePlan.callsLimit === -1
          ? "You have unlimited meetings."
          : `Up to ${effectivePlan.callsLimit} meetings/month.`}
      </span>
      <Sparkles className="w-3 h-3 shrink-0 ml-auto" />
    </div>
  );
}
