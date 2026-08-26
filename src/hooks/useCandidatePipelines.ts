/**
 * useCandidatePipelines.ts
 *
 * Lightweight read layer for the "link this meeting to a candidate"
 * picker on Live Calls (the recruiting equivalent of useDeals). Reads
 * candidate_jobs joined to candidates/jobs — the same pipeline rows
 * PipelinePage, CandidateDetailPage, and SubmissionsPage already key off.
 * No writes here; stage advancement stays owned by
 * advance_candidate_pipeline_stage via PipelinePage/CandidateDetailPage.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTeam } from "@/hooks/useTeam";

export const PIPELINE_STAGES: { key: string; label: string; color: string }[] = [
  { key: "sourced", label: "New", color: "#94a3b8" },
  { key: "screening", label: "Screening", color: "#60a5fa" },
  { key: "shortlisted", label: "Shortlisted", color: "#818cf8" },
  { key: "submitted", label: "Submitted", color: "#a78bfa" },
  { key: "client_review", label: "Client Review", color: "#f472b6" },
  { key: "interview", label: "Interview", color: "#fb923c" },
  { key: "final_interview", label: "Final Interview", color: "#f59e0b" },
  { key: "offer", label: "Offer", color: "#facc15" },
  { key: "placed", label: "Placed", color: "#22c55e" },
  { key: "rejected", label: "Rejected", color: "#ef4444" },
];

export function stageMeta(key: string) {
  return PIPELINE_STAGES.find((s) => s.key === key) ?? { key, label: key, color: "#94a3b8" };
}

export interface CandidatePipelineOption {
  id: string; // candidate_jobs.id — the anchor stored on calls.candidate_job_id
  candidate_id: string;
  candidate_name: string;
  job_id: string;
  job_title: string;
  client_name: string | null;
  pipeline_stage: string;
}

export function useCandidatePipelines() {
  const { teamId } = useTeam();

  const query = useQuery({
    queryKey: ["candidate-pipelines-picker", teamId],
    queryFn: async (): Promise<CandidatePipelineOption[]> => {
      if (!teamId) return [];
      const { data, error } = await (supabase as any)
        .from("candidate_jobs")
        .select(`
          id, candidate_id, job_id, pipeline_stage,
          candidate:candidates(id, full_name),
          job:jobs(id, title, client:recruiting_clients(name))
        `)
        .eq("team_id", teamId)
        .not("pipeline_stage", "in", "(placed,rejected)")
        .order("updated_at", { ascending: false })
        .limit(200);
      if (error) throw error;

      return (data ?? []).map((r: any) => ({
        id: r.id,
        candidate_id: r.candidate_id,
        candidate_name: r.candidate?.full_name ?? "Candidate",
        job_id: r.job_id,
        job_title: r.job?.title ?? "Role",
        client_name: r.job?.client?.name ?? null,
        pipeline_stage: r.pipeline_stage,
      }));
    },
    enabled: !!teamId,
    staleTime: 15_000,
  });

  return { pipelines: query.data ?? [], isLoading: query.isLoading, refetch: query.refetch };
}