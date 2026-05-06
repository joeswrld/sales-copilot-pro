/**
 * Logs security events to the security_events table.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface SecurityEvent {
  event_type: string;
  severity: "info" | "warn" | "error" | "critical";
  source_ip?: string;
  user_agent?: string;
  user_id?: string;
  details?: Record<string, unknown>;
}

export async function logSecurityEvent(event: SecurityEvent): Promise<void> {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    await supabase.from("security_events").insert({
      event_type: event.event_type,
      severity: event.severity,
      source_ip: event.source_ip || null,
      user_agent: event.user_agent || null,
      user_id: event.user_id || null,
      details: event.details || {},
    });
  } catch (e) {
    console.error("Failed to log security event:", e);
  }
}
