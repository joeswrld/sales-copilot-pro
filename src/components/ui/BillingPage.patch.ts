// ─── Drop-in replacement for the top of BillingPage.tsx ─────────────────────
// Add this import alongside the existing ones:
//   import PlanInheritanceBanner from "@/components/PlanInheritanceBanner";
//   import { useEffectivePlan } from "@/hooks/useEffectivePlan";
//
// Then, just below the opening <DashboardLayout> tag (before the max-w-3xl div),
// insert the PlanInheritanceBanner component:
//
//   <PlanInheritanceBanner />
//
// And inside the Usage Analytics card, replace the planKey source for limits
// from `currentPlanKey` to `effectivePlan?.planKey ?? currentPlanKey`.
//
// The patch below shows the exact diff for BillingPage.tsx:

/*
PATCH (apply to src/pages/BillingPage.tsx):

1. Add imports at top:
   import PlanInheritanceBanner from "@/components/PlanInheritanceBanner";
   import { useEffectivePlan } from "@/hooks/useEffectivePlan";

2. Inside BillingPage(), add:
   const { effectivePlan } = useEffectivePlan();

3. Replace this existing line inside the component return (just inside DashboardLayout):
   <div className="max-w-3xl mx-auto space-y-8">

   With:
   <PlanInheritanceBanner />
   <div className="max-w-3xl mx-auto space-y-8">

4. In the teamMembersLimit calculation, replace:
   const teamMembersLimit = getTeamMembersLimit(teamMembersQuery.data?.adminPlanKey ?? currentPlanKey);

   With:
   const teamMembersLimit = getTeamMembersLimit(
     teamMembersQuery.data?.adminPlanKey ?? effectivePlan?.planKey ?? currentPlanKey
   );
*/

// Full diff is minimal — the key integration is PlanInheritanceBanner + useEffectivePlan.
// The banner handles its own visibility (only shows when plan is inherited).

export {}; // placeholder — apply the patch above to BillingPage.tsx