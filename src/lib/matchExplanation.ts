/**
 * matchExplanation.ts — shared shape for candidate_jobs.match_explanation
 *
 * This is the jsonb narrative written by the existing AI matching flow
 * (parse-candidate-cv edge function, mode: "candidate_job_match") onto
 * public.candidate_jobs alongside match_score. Both PipelinePage and the
 * DashboardHome AI-matching section read this same column/shape — no new
 * matching system, table, or RPC is introduced here.
 */

export interface MatchExplanation {
  computed_at?: string;
  relevant_skills?: string[];
  matched_requirements?: string[];
  missing_requirements?: string[];
  potential_concerns?: string[];
  relevant_experience?: string;
  availability_notice?: string;
  salary_compatibility?: "compatible" | "incompatible" | "unknown" | string;
  location_compatibility?: "compatible" | "remote_mismatch" | "unknown" | string;
  overall_recommendation?: string;
}

export function scoreColor(score: number | null | undefined): string {
  if (score == null) return "#94a3b8";
  if (score >= 70) return "#16a34a";
  if (score >= 50) return "#b45309";
  return "#ef4444";
}

export function scoreBg(score: number | null | undefined): string {
  if (score == null) return "rgba(148,163,184,0.12)";
  if (score >= 70) return "rgba(34,197,94,0.12)";
  if (score >= 50) return "rgba(251,191,36,0.15)";
  return "rgba(239,68,68,0.1)";
}