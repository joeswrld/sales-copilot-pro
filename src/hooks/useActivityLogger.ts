import { supabase } from "@/integrations/supabase/client";

/**
 * Logs an activity from the client. The edge function enriches with IP/UA/geo.
 */
export async function logActivity(input: {
  action: string;
  category?: string;
  severity?: "info" | "warn" | "error" | "critical";
  target_type?: string;
  target_id?: string;
  details?: Record<string, unknown>;
}) {
  try {
    await supabase.functions.invoke("log-activity", { body: input });
  } catch (e) {
    console.warn("logActivity failed", e);
  }
}

export function useActivityLogger() {
  return { logActivity };
}
